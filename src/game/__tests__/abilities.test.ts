import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Dungeon's enemy is a constant here (1500 HP, 1 damage), so the Hunting loop and the Dungeon driver fight the very same monster and their numbers can be put side by side.
vi.mock('../waves', async (orig) => ({ ...(await orig<typeof import('../waves')>()), stageEnemyHp: () => 1500, stageEnemyDmg: () => 1 }));

import { runDungeon } from '../../../scripts/sim/driver';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import {
  ABILITY_IDS,
  AbilityId,
  abilityDef,
  abilityDotAt,
  defaultRotation,
  fireAbility,
  grantedAbilities,
  guardDamage,
  hastedMs,
  newAbilityRuntime,
  pickAbility,
  rotationCpTerms,
  sanitizeRotation,
  startAbilityFight,
  tickAbilityDot,
} from '../abilities';
import { HuntCombatBuild, HuntPotionCfg, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { effectiveRotation, buildCombatStats, combatModifiersFromSave, computeCP, cpOfStats, normalizeSave, SaveData } from '../engine';
import { applyDamageModifiers, combatPowerCore } from '../derivedStats';
import { dungeonEnemyKindForFloor } from '../dungeon';
import { getEnemyDef } from '../enemies';
import { sanitizeHuntSession, sessionStatsDiffer } from '../huntSession';
import { SKILL_FX } from '../skillFx';
import T from '../tunables';

const NOW = 1_700_000_000_000;
const noPotions: HuntPotionCfg = { threshold: 0, priority: 'small_first', stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 }, greaterElixirHealPct: 0.5, potionHeal: 50, largePotionHeal: 150, cooldownMs: 5000 };
const zone = (over: Partial<HuntZoneCombatCfg> = {}): HuntZoneCombatCfg => ({
  baseEnemyHp: 1000,
  baseEnemyDmg: 1,
  enemyAtkMs: 1500,
  hpGrowth: 0,
  dmgGrowth: 0,
  depthMult: 1,
  goldPerHour: 0,
  xpPerKill: 10,
  xpRefKph: 100000,
  drops: [
    { material: 'leather_scrap', rarity: 'common', chance: 0.3, qty: 1 },
    { material: 'beast_sinew', rarity: 'common', chance: 0.2, qty: 1, ownStream: true },
  ],
  depth: 'shallow',
  dropRateMult: 1,
  ...over,
});
// A deterministic hero: 100 a swing every second, never a crit, hard to kill.
const build = (over: Partial<HuntCombatBuild> = {}): HuntCombatBuild => ({ playerMax: 1_000_000, heroDmgBase: 100, critChance: 0, critMult: 2, heroMs: 1000, reduction: 0, lifestealPct: 0, burn: false, reflect: 0, hpRegenPct: 0, ...over });
const hunt = (b: HuntCombatBuild, z: HuntZoneCombatCfg, ms: number, seed = 'seed') =>
  simulateHuntingSession(b, z, { ceiling: 1, promotionWins: 0 }, ms, noPotions, seed, { maxLevel: 1, requiredWins: () => 99 });

// The provisional numbers are tunables; a test that overrides one puts it back.
const saved: Record<string, number> = {};
type AbilityTunable = Exclude<keyof typeof T.abilities, '_label'>;
const numbers = T.abilities as unknown as Record<string, number>;
const setT = (key: AbilityTunable, value: number) => {
  if (!(key in saved)) saved[key] = numbers[key];
  numbers[key] = value;
};
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) numbers[k] = v;
  for (const k of Object.keys(saved)) delete saved[k];
  vi.restoreAllMocks();
});

describe('the model', () => {
  it('twenty-one abilities (3 per weapon line, 1 per chestpiece weight), over the 8 effects, each with a skillFx entry and a source', () => {
    expect(ABILITY_IDS).toHaveLength(21);
    expect(new Set(ABILITY_IDS).size).toBe(21);
    const kinds = new Set<string>();
    for (const id of ABILITY_IDS) {
      const d = abilityDef(id)!;
      expect(d.id).toBe(id);
      expect(d.cooldownMs).toBeGreaterThanOrEqual(0);
      expect(SKILL_FX[d.fx], id).toBeDefined();
      d.effects.forEach((e) => kinds.add(e.kind));
    }
    expect([...kinds].sort()).toEqual(['carry', 'dot', 'guard', 'haste', 'heal', 'opener', 'strike', 'volley']);
  });

  it('the worn weapon line and chestpiece weight grant them (an absent line is the sword, an absent weight is plate), in definition order', () => {
    expect(grantedAbilities(undefined, undefined)).toEqual(['firm_strike', 'double_thrust', 'breach', 'iron_stance']);
    expect(grantedAbilities('bow', undefined)).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'iron_stance']);
    expect(grantedAbilities('staff', 'cloth')).toEqual(['arcane_burst', 'flames', 'nova', 'arcane_breath']);
    expect(grantedAbilities('scepter', 'cloth')).toEqual(['blessing', 'drain_life', 'dark_pulse', 'arcane_breath']);
    expect(grantedAbilities('axe', 'leather')).toEqual(['rift', 'brutal_spin', 'lacerate', 'dodge']);
    expect(grantedAbilities('crossbow', 'leather')).toEqual(['piercing_bolt', 'double_shot', 'fatal_shot', 'dodge']);
    expect(defaultRotation(grantedAbilities('bow', undefined))).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'iron_stance']);
    expect(defaultRotation(ABILITY_IDS)).toHaveLength(4);
  });
});

describe('the rotation in the save', () => {
  it('is sanitized like the skill tree: known ids, only what the gear grants, no repeats, at most four, order kept', () => {
    expect(sanitizeRotation(undefined)).toEqual([]);
    expect(sanitizeRotation('firm_strike')).toEqual([]);
    expect(sanitizeRotation(['bogus', 3, null, 'firm_strike', 'firm_strike', 'flames'])).toEqual(['firm_strike', 'flames']);
    expect(sanitizeRotation([...ABILITY_IDS])).toHaveLength(4);
    expect(sanitizeRotation([...ABILITY_IDS].reverse()).slice(0, 2)).toEqual(['arcane_breath', 'dodge']);
    expect(sanitizeRotation(['firm_strike', 'arrow_rain', 'iron_stance'], grantedAbilities(undefined, undefined))).toEqual(['firm_strike', 'iron_stance']);
  });

  // Phase 5 (2026-10-28): an ABSENT rotation is the automatic default. 2026-10-31: the Taticas screen offers no choice, so LOADING drops whatever an older save stored (its own list, [] cleared on purpose, junk) and the
  // hero comes back automatic (tacticsAutomatic.test.ts proves it on every weapon and chestpiece). The engine still READS a list on a hero a tool built in memory (the next test, and rotationRefill.test.ts).
  it('a loaded save never keeps a stored rotation: a list, an empty list and junk all come back automatic', () => {
    const sword = hero('2', 3, { level: 15 });
    const stored = (rotation: unknown) => normalizeSave(JSON.parse(JSON.stringify({ ...sword, rotation })));
    for (const rotation of [['arrow_rain', 'firm_strike', 'bogus', 'firm_strike'], [], 'nope', null]) {
      expect('rotation' in stored(rotation), JSON.stringify(rotation)).toBe(false);
      expect(effectiveRotation(stored(rotation)), JSON.stringify(rotation)).toEqual(['firm_strike', 'double_thrust', 'breach', 'iron_stance']);
    }
    const bow = hero('2', 3, { level: 15, weapon: 'hunting_bow' });
    expect(effectiveRotation(normalizeSave(JSON.parse(JSON.stringify({ ...bow, rotation: ['opening_shot'] }))))).toEqual(['arrow_rain', 'opening_shot', 'true_shot', 'iron_stance']);
  });

  it('the combat stats carry the rotation only when there is one, and only what the worn gear grants right now', () => {
    const sword = hero('2', 3, { level: 15 });
    expect(buildCombatStats(automaticRotation(sword)).rotation).toEqual(['firm_strike', 'double_thrust', 'breach', 'iron_stance']); // absent = automatic (hero() is gear-only)
    expect('rotation' in buildCombatStats({ ...sword, rotation: [] })).toBe(false);
    expect(buildCombatStats({ ...sword, rotation: ['firm_strike', 'iron_stance'] }).rotation).toEqual(['firm_strike', 'iron_stance']);
    // the gear changed after the rotation was saved: the bow's abilities are not granted by a sword, and their places are refilled instead of left empty (fillRotation, 2026-10-29), so the hero never
    // goes into combat with fewer abilities than his gear grants just because he swapped a weapon
    expect(buildCombatStats({ ...sword, rotation: ['arrow_rain', 'firm_strike'] }).rotation).toEqual(['double_thrust', 'firm_strike', 'breach', 'iron_stance']);
    expect(effectiveRotation({ ...sword, rotation: ['arrow_rain'] })).toEqual(['firm_strike', 'double_thrust', 'breach', 'iron_stance']);
  });

  it('a Hunting session freezes the rotation with the rest of the stats and gets it back after a reload', () => {
    const h = { ...hero('2', 3, { level: 15 }), rotation: ['firm_strike' as AbilityId] };
    const stats = buildCombatStats(h);
    const session = sanitizeHuntSession({ stats, blessed: false, strength: [], attack: [], pass: [], tonics: {} });
    expect(session?.stats.rotation).toEqual(['firm_strike']);
    expect(sessionStatsDiffer(session!.stats, stats)).toBe(false);
    expect(sessionStatsDiffer(session!.stats, buildCombatStats({ ...h, rotation: [] }))).toBe(true);
    const plain = sanitizeHuntSession({ stats: buildCombatStats({ ...hero('2', 3, { level: 15 }), rotation: [] }), blessed: false, strength: [], attack: [], pass: [], tonics: {} });
    expect('rotation' in plain!.stats).toBe(false);
  });
});

describe('priority and cooldown', () => {
  it('fires the first ability of the rotation that is off cooldown; the one below only enters while the one above recovers; none ready = the basic attack', () => {
    setT('arrowRainCdMs', 8000);
    setT('openingShotCdMs', 5000);
    setT('flamesCdMs', 6000);
    const rt = newAbilityRuntime();
    const rot: AbilityId[] = ['arrow_rain', 'flames', 'opening_shot'];
    const at = (now: number, enemyActed = true) => pickAbility(rt, rot, now, enemyActed)?.id ?? null;
    const fire = (now: number) => {
      const d = pickAbility(rt, rot, now, true)!;
      fireAbility(rt, d, now, 100, 100, 1000);
      return d.id;
    };
    expect(at(0)).toBe('arrow_rain');
    expect(fire(0)).toBe('arrow_rain');
    expect(at(1000)).toBe('flames'); // the top one recovers until 8000
    expect(fire(1000)).toBe('flames');
    expect(at(2000)).toBeNull(); // the opener is skipped: the enemy has already attacked
    expect(at(2000, false)).toBe('opening_shot'); // ... and ready when it has not
    expect(at(7000)).toBe('flames'); // flames is back (1000 + 6000) and outranks nothing above it that is ready
    expect(at(7999)).toBe('flames');
    expect(at(8000)).toBe('arrow_rain'); // the top of the list wins again the moment it is back
    expect(at(8000 - 1)).not.toBe('arrow_rain');
  });

  it('an empty or missing rotation never picks anything', () => {
    const rt = newAbilityRuntime();
    expect(pickAbility(rt, undefined, 0, false)).toBeNull();
    expect(pickAbility(rt, [], 0, false)).toBeNull();
  });

  it('the cooldown crosses fights inside a session: 10 fires in 60 s of 3-swing fights, not one per fight', () => {
    // 100 a swing, 300 HP monsters (2 swings of the firm strike's 1.8 x 100 make 280, so 3 swings per fight): a fight is 3 s long.
    setT('firmStrikeCdMs', 6000);
    const r = hunt(build({ rotation: ['firm_strike'] }), zone({ baseEnemyHp: 300 }), 60_000);
    expect(r.abilityFired).toEqual({ firm_strike: 10 });
    expect(r.kills).toBeGreaterThan(15);
  });
});

describe('the effects', () => {
  it('strike and volley replace the swing with a bigger one (never smaller than the basic swing)', () => {
    const rt = newAbilityRuntime();
    expect(fireAbility(rt, abilityDef('firm_strike')!, 0, 100, 100, 1000).dmg).toBe(Math.round(100 * T.abilities.firmStrikePct));
    expect(fireAbility(rt, abilityDef('arrow_rain')!, 0, 100, 100, 1000).dmg).toBe(T.abilities.arrowRainHits * Math.round(100 * T.abilities.arrowRainPct));
    // the ones that add an effect hit as a normal swing
    for (const id of ['flames', 'arcane_burst', 'blessing', 'iron_stance', 'opening_shot'] as AbilityId[]) expect(fireAbility(newAbilityRuntime(), abilityDef(id)!, 0, 100, 100, 1000).dmg, id).toBe(100);
  });

  it('dot: a burn of its own that ticks like the weapon burn and is gone with the enemy', () => {
    const rt = newAbilityRuntime();
    expect(abilityDotAt(rt)).toBe(Infinity);
    fireAbility(rt, abilityDef('flames')!, 500, 100, 100, 1000);
    expect(abilityDotAt(rt)).toBe(500 + T.battle.effectTickMs);
    const per = Math.round(100 * T.abilities.flamesPct);
    let total = 0;
    let ticks = 0;
    while (abilityDotAt(rt) !== Infinity) {
      total += tickAbilityDot(rt);
      ticks++;
    }
    expect(total).toBe(per * ticks);
    expect(ticks).toBe(Math.floor(T.abilities.flamesDurationMs / T.battle.effectTickMs));
    fireAbility(rt, abilityDef('flames')!, 9000, 100, 100, 1000);
    startAbilityFight(rt, 1000); // a new enemy: the burn does not follow the hero
    expect(abilityDotAt(rt)).toBe(Infinity);
  });

  it('guard cuts the damage taken while it is up, never below 1, and leaves blocked hits at 0', () => {
    const rt = newAbilityRuntime();
    expect(guardDamage(rt, 0, 100)).toBe(100);
    fireAbility(rt, abilityDef('iron_stance')!, 1000, 100, 100, 1000);
    const cut = 1 - T.abilities.ironStanceReduction;
    expect(guardDamage(rt, 1001, 100)).toBe(Math.round(100 * cut));
    expect(guardDamage(rt, 1001, 1)).toBe(1);
    expect(guardDamage(rt, 1001, 0)).toBe(0);
    expect(guardDamage(rt, 1000 + T.abilities.ironStanceMs, 100)).toBe(100);
  });

  it('heal gives back a share of max HP; haste shortens the interval while it is up and never past the AGI floor', () => {
    const rt = newAbilityRuntime();
    const fired = fireAbility(rt, abilityDef('blessing')!, 1000, 100, 100, 2000);
    expect(fired.heal).toBe(Math.round(2000 * T.abilities.blessingHealPct));
    expect(hastedMs(rt, 1500, 900)).toBeCloseTo(900 / (1 + T.abilities.blessingHastePct), 9);
    expect(hastedMs(rt, 1500, 450)).toBe(Math.max(T.battle.heroMinMs, 450 / (1 + T.abilities.blessingHastePct)));
    expect(hastedMs(rt, 1000 + T.abilities.blessingHasteMs, 900)).toBe(900);
    expect(hastedMs(newAbilityRuntime(), 0, 900)).toBe(900);
  });

  it('opener delays the first enemy attack of the fight, and is only ready while the enemy has not acted', () => {
    // 2000 HP monster, 1000 a swing: dead at t = 2000. It attacks at 1500, and the hero has 1 HP: without the opener the hero dies first.
    const z = zone({ baseEnemyHp: 2000, baseEnemyDmg: 5, enemyAtkMs: 1500 });
    const frail = { playerMax: 1, heroDmgBase: 1000 };
    const without = hunt(build({ ...frail }), z, 2000);
    expect([without.kills, without.defeats]).toEqual([0, 1]);
    const withOpener = hunt(build({ ...frail, rotation: ['opening_shot'] }), z, 2000);
    expect([withOpener.kills, withOpener.defeats]).toEqual([1, 0]);
    expect(withOpener.abilityFired).toEqual({ opening_shot: 1 });
  });
});

describe('carry: damage that spills over into the NEXT enemy', () => {
  it('the next enemy enters already hurt by the bucket, capped at a share of its max HP, and the bucket is emptied either way', () => {
    const rt = newAbilityRuntime();
    rt.carry = 10_000;
    expect(startAbilityFight(rt, 1000)).toBe(Math.floor(1000 * T.abilities.carryCapPct));
    expect(rt.carry).toBe(0);
    expect(startAbilityFight(rt, 1000)).toBe(0); // it does not chain: what was over the cap is gone, not saved for the third fight
    rt.carry = 120;
    expect(startAbilityFight(rt, 1000)).toBe(120); // under the cap: all of it
    setT('carryCapPct', 0.9);
    rt.carry = 1e9;
    expect(startAbilityFight(rt, 1000)).toBe(900); // and never enough to kill it
    expect(startAbilityFight(newAbilityRuntime(), 1000)).toBe(0);
  });

  it('fills during the fight from a share of the swing', () => {
    const rt = newAbilityRuntime();
    fireAbility(rt, abilityDef('arcane_burst')!, 0, 100, 100, 1000);
    expect(rt.carry).toBe(Math.round(100 * T.abilities.arcaneBurstPct));
  });

  it('in a Hunting session: fight 2 starts hurt and is shorter, the cap holds, and the spill does not chain into fight 3', () => {
    // 1000 HP monster, 100 a swing: 10 s a fight. The burst (cooldown too long to fire twice) puts 500 in the bucket.
    setT('arcaneBurstPct', 5);
    setT('arcaneBurstCdMs', 1_000_000_000);
    const b = build({ rotation: ['arcane_burst'] });
    const z = zone();
    expect(hunt(build(), z, 15_000).kills).toBe(1);
    expect(hunt(b, z, 15_000).kills).toBe(2); // 10 s, then 5 s (500 already taken)
    expect(hunt(b, z, 14_999).kills).toBe(1);
    expect(hunt(b, z, 24_999).kills).toBe(2); // fight 3 is a full 10 s: the leftover did not chain
    expect(hunt(b, z, 25_000).kills).toBe(3);
    // a lower cap: fight 2 enters with 250 taken and needs 8 swings
    setT('carryCapPct', 0.25);
    expect(hunt(b, z, 17_999).kills).toBe(1);
    expect(hunt(b, z, 18_000).kills).toBe(2);
  });
});

describe('no random number is drawn', () => {
  it('a rotation that changes nothing leaves the whole session bit for bit alone (drops, XP, gold, kills): the streams were not touched', () => {
    setT('openingShotDelayMs', 0);
    setT('openingShotCdMs', 0);
    const z = zone();
    const plain = hunt(build({ critChance: 0.3, block: 0.2 }), z, 3 * 3_600_000, 'rng');
    const withRotation = hunt(build({ critChance: 0.3, block: 0.2, rotation: ['opening_shot'] }), z, 3 * 3_600_000, 'rng');
    const { abilityFired, ...rest } = withRotation;
    expect(abilityFired?.opening_shot).toBeGreaterThan(0);
    expect(rest).toEqual(plain);
  });

  it('abilities.ts imports no random source and calls no RNG', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../abilities.ts'), 'utf8');
    expect(src).not.toMatch(/Math\.random|mulberry|rng\(|roll\(/);
  });
});

describe('the three loops agree', () => {
  // The Dungeon driver (the mirror of BattleModal's frame loop) and the Hunting loop fight the same constant monster, with the same hero, no crits, no tonics. The Dungeon pauses between waves; the
  // combat clock the abilities run on does not (BattleModal's clock does not either), so the fight time of the driver is `seconds` minus the intermissions. The session is cut at exactly that time.
  const WAVES = 8;
  const loops = (save: SaveData) => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999); // no crit in the driver
    const run = runDungeon(save, NOW, WAVES);
    const stats = buildCombatStats(save);
    const first = getEnemyDef(dungeonEnemyKindForFloor(save.highestDungeonFloor));
    for (let f = 0; f < WAVES; f++) expect(getEnemyDef(dungeonEnemyKindForFloor(save.highestDungeonFloor + f)).atkSpeedMs).toBe(first.atkSpeedMs);
    const b: HuntCombatBuild = {
      playerMax: stats.maxHp,
      heroDmgBase: applyDamageModifiers(stats.dmgBase, combatModifiersFromSave(save, NOW)),
      critChance: 0,
      critMult: stats.critMult,
      heroMs: stats.heroMs,
      reduction: stats.reduction,
      lifestealPct: stats.lifesteal,
      burn: stats.burn === true,
      reflect: stats.reflect ?? 0,
      hpRegenPct: stats.hpRegenPct ?? 0,
      ...(stats.rotation ? { rotation: stats.rotation, ...(stats.cdScale ? { cdScale: stats.cdScale } : {}) } : {}),
    };
    // (the clock of the driver adds the intermissions in floating point, so the cut is a millisecond past the last kill; the next fight is seconds long)
    const fightMs = Math.ceil(run.seconds * 1000 - (WAVES - 1) * T.battle.intermissionMs) + 1;
    const session = hunt(b, zone({ baseEnemyHp: 1500, enemyAtkMs: first.atkSpeedMs }), fightMs);
    return { run, session };
  };
  // `spill`: the session has already started the 9th fight when it is cut, and a carry enters a fight as damage the moment it starts, so it counts up to the cap of one more fight (the driver stops at the last kill).
  const agree = (save: SaveData, spill = false) => {
    const { run, session } = loops(save);
    expect(run.stages).toBe(WAVES);
    expect(session.kills).toBe(WAVES);
    if (spill) {
      expect(session.totalDamage).toBeGreaterThanOrEqual(run.totalDamage);
      expect(session.totalDamage - run.totalDamage).toBeLessThanOrEqual(Math.floor(1500 * T.abilities.carryCapPct));
    } else expect(session.totalDamage).toBe(run.totalDamage);
    expect(session.abilityFired).toEqual(run.abilityFired);
    return run;
  };
  const dungeonHero = (weapon: string | undefined, rotation: AbilityId[]): SaveData => ({ ...hero('2', 3, { level: 20, ...(weapon ? { weapon } : {}) }), highestDungeonFloor: 3, rotation });
  beforeEach(() => {
    setT('firmStrikeCdMs', 4000);
  });

  it('a hero without a rotation: the two loops give the same damage', () => {
    agree(dungeonHero(undefined, []));
  });

  it('sword + plate: strike and guard', () => {
    const run = agree(dungeonHero(undefined, ['firm_strike', 'iron_stance']));
    expect(run.abilityFired?.firm_strike).toBeGreaterThan(1);
  });

  it('bow: volley and opener', () => {
    const run = agree(dungeonHero('hunting_bow', ['opening_shot', 'arrow_rain']));
    expect(run.abilityFired?.arrow_rain).toBeGreaterThan(0);
    expect(run.abilityFired?.opening_shot).toBeGreaterThan(0);
  });

  it('staff: the burn and the carry across waves', () => {
    setT('arcaneBurstPct', 3);
    const run = agree(dungeonHero('oak_staff', ['arcane_burst', 'flames']), true);
    expect(run.abilityFired?.arcane_burst).toBeGreaterThan(0);
    expect(run.abilityFired?.flames).toBeGreaterThan(0);
  });

  it('scepter: heal and haste', () => {
    setT('blessingCdMs', 3000);
    const run = agree(dungeonHero('iron_scepter', ['blessing']));
    expect(run.abilityFired?.blessing).toBeGreaterThan(1);
  });

  it('none of the three loops holds a copy of the rule: they only call the shared functions of abilities.ts', () => {
    const root = path.resolve(__dirname, '../../..');
    for (const file of ['src/game/huntCombat.ts', 'src/components/BattleModal.tsx', 'scripts/sim/driver.ts']) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      for (const call of ['pickAbility(', 'fireAbility(', 'startAbilityFight(', 'guardDamage(', 'hastedMs(', 'tickAbilityDot(', 'abilityDotAt(']) expect(src, `${file} ${call}`).toContain(call);
      for (const rule of ['readyAt', 'carryCapPct', 'guardPct', 'hasteUntil', 'T.abilities', 'def.cooldownMs']) expect(src, `${file} must not hold ${rule}`).not.toContain(rule);
    }
  });
});

describe('the Combat Power', () => {
  const cpOf = (weapon: string | undefined, rotation: AbilityId[]) => computeCP({ ...hero('4g', 6, { level: 52, ...(weapon ? { weapon } : {}) }), rotation });

  it('an empty rotation is exactly the CP it always was; a rotation raises it', () => {
    const base = { ...hero('4g', 6, { level: 52 }), rotation: [] };
    expect(computeCP(automaticRotation(hero('4g', 6, { level: 52 })))).toBeGreaterThan(computeCP(base)); // the automatic default (no field) is worth more than an empty one
    expect(cpOf(undefined, ['firm_strike'])).toBeGreaterThan(computeCP(base));
    expect(cpOf(undefined, ['firm_strike', 'iron_stance'])).toBeGreaterThan(cpOf(undefined, ['firm_strike']));
  });

  it('each effect on its own raises the CP of the hero who owns it, and the opener (no damage, no sustain) leaves it alone', () => {
    const cases: [string | undefined, AbilityId][] = [
      [undefined, 'firm_strike'],
      [undefined, 'iron_stance'],
      ['elven_bow', 'arrow_rain'],
      ['elven_staff', 'flames'],
      ['elven_staff', 'arcane_burst'],
      ['gold_scepter', 'blessing'],
    ];
    for (const [weapon, id] of cases) {
      const off = cpOf(weapon, []);
      expect(cpOf(weapon, [id]), id).toBeGreaterThan(off);
    }
    expect(cpOf('elven_bow', ['opening_shot'])).toBe(cpOf('elven_bow', []));
  });

  it('a rotation is worth more the faster its abilities recover, and a duplicate or an unknown id is worth nothing', () => {
    const slow = rotationCpTerms(['firm_strike'], 1000)!.swingGain;
    setT('firmStrikeCdMs', T.abilities.firmStrikeCdMs / 2);
    expect(rotationCpTerms(['firm_strike'], 1000)!.swingGain).toBeGreaterThan(slow);
    expect(rotationCpTerms(['firm_strike', 'firm_strike'], 1000)).toEqual(rotationCpTerms(['firm_strike'], 1000));
    expect(rotationCpTerms([], 1000)).toBeNull();
    expect(rotationCpTerms(undefined, 1000)).toBeNull();
  });

  it('never more swings than the hero has: a rotation of abilities that are always ready cannot count more than one ability swing per swing', () => {
    setT('firmStrikeCdMs', 0);
    setT('arrowRainCdMs', 0);
    const both = rotationCpTerms(['firm_strike', 'arrow_rain'], 1000)!;
    const first = rotationCpTerms(['firm_strike'], 1000)!;
    expect(both.swingGain).toBeCloseTo(first.swingGain, 12); // the first one takes every swing, the second never gets one
  });

  it('survives garbage: the CP of a tampered rotation is a finite number', () => {
    const stats = buildCombatStats(hero('2', 3, { level: 15 }));
    for (const rotation of [['bogus'], [1, 2, 3], ['firm_strike', 'firm_strike', 'firm_strike', 'firm_strike', 'firm_strike']] as unknown as AbilityId[][]) {
      expect(Number.isFinite(cpOfStats({ ...stats, rotation }))).toBe(true);
      expect(combatPowerCore({ ...stats, rotation, heroMs: 0 }, null)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('no import cycle', () => {
  it('derivedStats.ts imports nothing but TYPES from abilities.ts (abilities.ts imports its burn functions; a value import back would be a cycle)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../derivedStats.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => /^import\b/.test(l) && /abilities['"]/.test(l));
    for (const l of imports) expect(l, l).toMatch(/^import type /);
    expect(src).not.toMatch(/rotationCpTerms\(/);
  });
});
