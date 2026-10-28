import { describe, expect, it } from 'vitest';
import { HuntCombatBuild, HuntPotionCfg, HuntZoneCombatCfg, HuntTimeline, simulateHuntingSession } from '../huntCombat';
import { huntingXpPaceCap, xpPaceFractionForFight } from '../huntEconomy';
import { HUNTING_ZONES, zoneReferenceXpPerHour } from '../huntingZones';
import T from '../tunables';

// Rodada 31: the hero XP of Hunting is paid PER KILL (huntCombat.ts creditFight), with a pace fraction (huntEconomy.ts xpPaceFractionForFight) that keeps a hero killing many times faster
// than the zone's reference pace from running away. A hero that kills a monster in 10 s kills 360 an hour.
const HOUR = 3600 * 1000;
const build: HuntCombatBuild = { playerMax: 1_000_000, heroDmgBase: 100, critChance: 0, critMult: 2, heroMs: 1000, reduction: 0, lifestealPct: 0, burn: false, reflect: 0, hpRegenPct: 0 };
const zone = (over: Partial<HuntZoneCombatCfg> = {}): HuntZoneCombatCfg => ({
  baseEnemyHp: 1000, // 10 hits of 100: a kill every 10 s
  baseEnemyDmg: 1,
  enemyAtkMs: 1000,
  hpGrowth: 0,
  dmgGrowth: 0,
  depthMult: 1,
  goldPerHour: 0,
  xpPerKill: 10,
  xpRefKph: 1000, // the reference pace is far above the 360 kills an hour of this hero: every kill pays in full
  drops: [],
  depth: 'shallow',
  dropRateMult: 1,
  ...over,
});
const noPotions: HuntPotionCfg = { threshold: 0, priority: 'small_first', stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 }, greaterElixirHealPct: 0.5, potionHeal: 50, largePotionHeal: 150, cooldownMs: 5000 };
const hunt = (b: HuntCombatBuild, z: HuntZoneCombatCfg, ms: number, start = 1, timeline?: HuntTimeline, seed = 'seed') =>
  simulateHuntingSession(b, z, { ceiling: start, promotionWins: 0 }, ms, noPotions, seed, { maxLevel: start, requiredWins: () => 1 }, timeline);

describe('the XP of a kill', () => {
  it('below the reference pace every kill pays its full XP: the session pays kills x xpPerKill', () => {
    const r = hunt(build, zone(), HOUR);
    expect(r.kills).toBe(360);
    expect(r.xpBase).toBeCloseTo(360 * 10, 6);
    expect(r.xpReady).toBe(3600);
  });

  it('a hero that kills twice as fast earns twice the XP (the Warrior path is paid for its kills)', () => {
    const slow = hunt(build, zone(), HOUR);
    const fast = hunt({ ...build, heroMs: 500 }, zone(), HOUR);
    expect(fast.kills).toBe(2 * slow.kills);
    expect(fast.xpReady).toBe(2 * slow.xpReady);
    // and one that kills at half the pace earns half
    expect(hunt({ ...build, heroMs: 2000 }, zone(), HOUR).xpReady).toBe(slow.xpReady / 2);
  });

  it('the XP follows the kills, not the clock: a session that wins nothing earns nothing, a defeat pays nothing', () => {
    const dies = hunt({ ...build, playerMax: 10 }, zone({ baseEnemyDmg: 100 }), HOUR);
    expect(dies.kills).toBe(0);
    expect(dies.xpReady).toBe(0);
  });

  it('an unfinished fight at the end of the session pays nothing, the whole ones do (offline accrual is the same simulation)', () => {
    const r = hunt(build, zone(), 25_000); // two kills (10 s each) and 5 s of a third
    expect(r.kills).toBe(2);
    expect(r.xpReady).toBe(20);
    expect(hunt(build, zone(), 10 * HOUR).xpReady).toBe(10 * hunt(build, zone(), HOUR).xpReady);
  });

  it('is deterministic: the same session gives the same XP every time it is asked', () => {
    const z = zone({ xpRefKph: 100 });
    expect(hunt({ ...build, critChance: 0.4 }, z, 3 * HOUR, 1, undefined, 'k').xpReady).toBe(hunt({ ...build, critChance: 0.4 }, z, 3 * HOUR, 1, undefined, 'k').xpReady);
  });

  it('a bigger monster pays more in proportion: sub-level 3 (+10% HP a level) pays 1.2x a sub-level 1 kill, and the zone\'s own sub-level bonus adds to it', () => {
    const grow = zone({ hpGrowth: 0.1, baseEnemyHp: 1000 });
    const one = hunt(build, grow, 10 * HOUR, 1);
    const three = hunt(build, grow, 10 * HOUR, 3);
    expect(three.xpBase / three.kills).toBeCloseTo(12, 6);
    expect(one.xpBase / one.kills).toBeCloseTo(10, 6);
    const bonus = hunt(build, { ...grow, xpPerSubLevel: 0.05 }, 10 * HOUR, 3);
    expect(bonus.xpBase / bonus.kills).toBeCloseTo(12 * 1.1, 6);
  });

  it('the depth pays through xpPerKill (the zone\'s monster is the depth\'s: same kills, more XP per kill), and the Relic / Aprendiz Veloz multiply every kill', () => {
    const base = hunt(build, zone(), HOUR);
    expect(hunt(build, zone({ xpPerKill: 13 }), HOUR).xpReady).toBe(base.xpReady * 1.3);
    expect(hunt({ ...build, xpBonusPct: 25 }, zone(), HOUR).xpReady).toBe(Math.floor(base.xpBase * 1.25));
  });

  it('the Knowledge Elixir adds its percent to the kills that ended inside its window', () => {
    const tl: HuntTimeline = { strengthWindows: [], attackWindows: [], dmgStrength: 100, dmgAttack: 100, dmgBoth: 100, passWindows: [], passDropMult: 1, knowledgeWindows: [[0, 2 * HOUR]], xpBuffPct: 0.25 };
    const plain = hunt(build, zone(), 4 * HOUR);
    const drunk = hunt(build, zone(), 4 * HOUR, 1, tl);
    expect(drunk.xpReady / plain.xpReady).toBeCloseTo(1.125, 3); // half the session
  });
});

describe('the pace fraction: kills pay in full up to the zone\'s reference pace, then less and less, never past the cap', () => {
  it('is exactly 1 at and below the reference pace, shrinks above it and stays in [0, 1]', () => {
    const ref = 120;
    const f = (kph: number, hpRel = 1) => xpPaceFractionForFight(HOUR / kph, hpRel, ref);
    expect(f(60)).toBe(1);
    expect(f(120)).toBe(1);
    expect(f(150)).toBeCloseTo(Math.sqrt(120 / 150), 9); // inside the sqrt band (the cap 1.2 acts from 1.44 times the reference pace)
    expect(f(240)).toBeCloseTo((huntingXpPaceCap() * 120) / 240, 9); // past it the fraction is the cap's share
    expect(f(150)).toBeLessThan(1);
    expect(f(10_000)).toBeLessThan(f(1000));
    for (const kph of [1, 100, 500, 5000, 1e6]) expect(f(kph)).toBeGreaterThanOrEqual(0);
    expect(xpPaceFractionForFight(0, 1, ref)).toBe(0); // a fight that takes no time cannot mint XP
    expect(xpPaceFractionForFight(NaN, 1, ref)).toBe(0);
  });

  it('a monster of twice the size counts as twice the kills of the reference one', () => {
    expect(xpPaceFractionForFight(HOUR / 100, 2, 120)).toBeCloseTo(xpPaceFractionForFight(HOUR / 200, 1, 120), 9);
  });

  it('XP an hour is x below the reference pace, sqrt(x) above it and never more than xpPaceCap times the reference rate', () => {
    const z = zone({ xpRefKph: 100 });
    const refRate = z.xpPerKill * 100; // 1,000 XP an hour at the reference pace
    const cap = huntingXpPaceCap();
    const perHour = (heroMs: number) => hunt({ ...build, heroMs }, z, HOUR).xpReady;
    const slow = perHour(2000); // 180 kills an hour: x = 1.8
    expect(slow).toBeCloseTo(refRate * Math.min(cap, Math.sqrt(1.8)), -1);
    for (const heroMs of [1000, 500, 250, 100, 50]) expect(perHour(heroMs)).toBeLessThanOrEqual(Math.ceil(refRate * cap) + 1);
    // far above the cap, going faster earns nothing more
    expect(Math.abs(perHour(100) - perHour(50))).toBeLessThanOrEqual(2);
    expect(perHour(100)).toBeGreaterThan(refRate * (cap - 0.02));
  });

  it('the zones keep the rate they paid by fight time: xpPerKill x xpRefKph is 1,750 / 2,900 / 6,000 / 8,800 an hour at the reference pace (within the round-off of the per-kill number), and every zone has both numbers', () => {
    const was = [1750, 2900, 6000, 8800];
    HUNTING_ZONES.slice(0, 4).forEach((z, i) => {
      expect(z.xpPerKill).toBeGreaterThan(0);
      expect(z.xpRefKph).toBeGreaterThan(0);
      const ratio = zoneReferenceXpPerHour(z) / was[i];
      expect(ratio, z.id).toBeGreaterThan(0.7);
      expect(ratio, z.id).toBeLessThan(1.02);
    });
    expect(T.hunting.xpPaceCap).toBeGreaterThanOrEqual(1);
    // zone 5 (classes reform, phase 7) never paid by fight time: it has both numbers and pays more an hour than the zone before it
    const [abyss, throne] = [HUNTING_ZONES[3], HUNTING_ZONES[4]];
    expect(throne.xpPerKill).toBeGreaterThan(0);
    expect(throne.xpRefKph).toBeGreaterThan(0);
    expect(zoneReferenceXpPerHour(throne)).toBeGreaterThan(zoneReferenceXpPerHour(abyss));
  });
});
