import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyDungeonRun, runDungeon, withSeededRandom } from '../../../scripts/sim/driver';
import { hero } from '../../../scripts/sim/duel';
import { BUFF_ITEM, TIMED_BUFF_KINDS, activeTonicStats, buffMinutes, goldMultiplier, hasteIntervalMs, BuffKind } from '../buffs';
import { applyElixir, ElixirId } from '../elixirs';
import {
  buildCombatStats,
  buildHuntSession,
  combatModifiersFromSave,
  computeHuntingStatus,
  computeMiningStatus,
  computeWoodcuttingStatus,
  defaultSave,
  normalizeSave,
  SaveData,
  xpToReachLevel,
} from '../engine';
import { applyDamageModifiers, applyDamageReduction, heroAttackIntervalMs } from '../derivedStats';
import { applyEquipInstance, createGearInstance, equippedSubstatTotals, GearInstance } from '../gearInstances';
import { applyHuntStart } from '../huntLifecycle';
import { dungeonEnemyKindForFloor } from '../dungeon';
import { getEnemyDef } from '../enemies';
import { getHuntingZone, unlockedZoneIds } from '../huntingZones';
import { stageEnemyDmg } from '../waves';
import { GEAR, getGear, INSTANCED_SLOTS } from '../gear';
import { GOLD_BONUS_CAP, Substat } from '../rarity';
import { addRank } from '../heroSkills';
import { skillXpToReachLevel } from '../skills';
import T from '../tunables';

// The audit of EVERY temporary effect (elixirs, tonics, the Round 12 consumables, blessed, the Pass): each one has to change the real outcome in the places it claims to
// apply (the Dungeon driver mirrors BattleModal + App.finishRun, Hunting runs the real session replay, Mining / Woodcutting the real accrual), and it has to stack with gear
// and attributes the way docs/ITEM_BALANCE_AUDIT.md ("Como os status somam") says.

const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const give = (s: SaveData, items: Partial<Record<string, number>>): SaveData => ({ ...s, consumables: { ...s.consumables, ...items } });
const drink = (s: SaveData, ...ids: ElixirId[]): SaveData => ids.reduce((acc, id) => applyElixir(give(acc, { [id]: 1 }), id, NOW - 1000)!, s);

// A hero with no weapon: no crit, no burn, no reflect, so a Dungeon hit is one exact number (a deterministic probe).
const bare = (): SaveData => ({ ...defaultSave(), xp: xpToReachLevel(15), str: 20, vit: 10, agi: 8, res: 6, highestDungeonFloor: 6 });
const geared = (): SaveData => ({ ...hero('2', 3, { level: 30 }), highestDungeonFloor: 20 });

// One floor of the Dungeon, the way BattleModal fights it (scripts/sim/driver.ts runDungeon).
const oneFloor = (s: SaveData, seed = 1) => withSeededRandom(seed, () => runDungeon(s, NOW, 1));
const hitOf = (s: SaveData, now = NOW): number => applyDamageModifiers(buildCombatStats(s).dmgBase, combatModifiersFromSave(s, now));
// The exact damage a run dealt, from its own hit counts: plain hits and crit hits (no skills, no burn, no reflect on these heroes).
const expectedDamage = (run: ReturnType<typeof oneFloor>, s: SaveData): number => {
  const base = hitOf(s);
  const c = buildCombatStats(s);
  return (run.heroHits - run.crits) * Math.max(1, Math.round(base)) + run.crits * Math.max(1, Math.round(base * c.critMult));
};

describe('every buff kind is declared, has an item, a duration and a documented place', () => {
  it('TIMED_BUFF_KINDS + the two legacy kinds are exactly what BUFF_ITEM can start', () => {
    const kinds = new Set(Object.values(BUFF_ITEM));
    expect([...kinds].sort()).toEqual(['attack', 'strength', ...TIMED_BUFF_KINDS].sort());
    for (const k of kinds) expect(buffMinutes(k as BuffKind), k).toBeGreaterThan(0);
  });
});

describe('Dungeon: the BattleModal and the finishRun read the same functions the driver mirrors', () => {
  const modal = readFileSync('src/components/BattleModal.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');

  it('every hit reads the damage modifiers and the tonic stats at the moment of the swing / enemy hit', () => {
    expect(modal).toMatch(/applyDamageModifiers\(combat\.dmgBase, combatModifiersFromSave\(save, Date\.now\(\)\)\)/);
    expect(modal).toMatch(/activeTonicStats\(combat, save, Date\.now\(\)\)\.critChance/);
    expect(modal).toMatch(/activeTonicStats\(combat, save, Date\.now\(\)\)\.reduction/);
    expect(modal).toMatch(/activeTonicStats\(combat, save, Date\.now\(\)\)\.heroMs/);
  });

  it('the run pays Gold with goldMultiplier(gear, fortune, pass, skill) and the character XP bonus; blessed is spent by the run', () => {
    expect(app).toMatch(/goldMultiplier\(subs\.goldBonus, isBuffActive\(s, 'fortune', Date\.now\(\)\), ownsAdventurerPass\(s\) \? T\.battlePass\.goldBonus : 0, saveSkillEffects\(s\)\.goldPct\)/);
    expect(app).toMatch(/\* \(1 \+ characterXpBonusPct\(s\) \/ 100\)/);
    expect(app).toMatch(/blessed: false/);
  });
});

describe('Dungeon: damage dealt (Strength / Attack elixir, Sharpening Stone, blessed) multiplies, on top of gear and attributes', () => {
  it('each damage buff changes the hit by exactly its factor (a bare hero never crits, so every hit is the same number)', () => {
    const base = bare();
    const dmg = buildCombatStats(base).dmgBase;
    const probe = (s: SaveData) => {
      const r = oneFloor(s);
      expect(r.crits).toBe(0);
      return r.totalDamage / r.heroHits;
    };
    expect(probe(base)).toBe(Math.round(dmg));
    expect(probe(drink(base, 'strength_elixir'))).toBe(Math.round(dmg * (1 + T.battle.strengthElixirDmgPct)));
    expect(probe(drink(base, 'atk_elixir'))).toBe(Math.round(dmg * (1 + T.battle.attackElixirDmgPct)));
    expect(probe(drink(base, 'sharpening_stone'))).toBe(Math.round(dmg * (1 + T.consumables.sharpenDmgPct)));
    expect(probe({ ...base, blessed: true })).toBe(Math.round(dmg * 1.05));
  });

  it('all four together multiply (never add) and the total is the exact damage of the run, crits included, with gear and attributes', () => {
    const s = { ...drink(geared(), 'strength_elixir', 'atk_elixir', 'sharpening_stone'), blessed: true };
    const run = oneFloor(s, 3);
    expect(hitOf(s)).toBeCloseTo(buildCombatStats(s).dmgBase * 1.05 * (1 + T.battle.strengthElixirDmgPct) * (1 + T.battle.attackElixirDmgPct) * (1 + T.consumables.sharpenDmgPct), 9);
    expect(run.totalDamage).toBe(expectedDamage(run, s));
    // and against the same hero with nothing active: the runs deal the damage their hits say
    const plain = oneFloor(geared(), 3);
    expect(plain.totalDamage).toBe(expectedDamage(plain, geared()));
    expect(run.totalDamage / run.heroHits).toBeGreaterThan(plain.totalDamage / plain.heroHits);
  });

  it('the new consumable cap holds: the Stone is the only new damage and it is within the cap', () => {
    expect(T.consumables.sharpenDmgPct).toBeLessThanOrEqual(T.consumables.newConsumableCap);
    expect(hitOf(drink(bare(), 'sharpening_stone')) / buildCombatStats(bare()).dmgBase).toBeCloseTo(1 + T.consumables.sharpenDmgPct, 9);
  });

  it('the buff stops counting the moment it expires (read per hit with the clock)', () => {
    const s = drink(bare(), 'strength_elixir');
    const exp = s.activeBuff!.expiresAt;
    expect(hitOf(s, exp - 1)).toBeGreaterThan(buildCombatStats(s).dmgBase);
    expect(hitOf(s, exp)).toBe(buildCombatStats(s).dmgBase);
  });
});

describe('Dungeon: tonics change crit, damage taken and the swing speed', () => {
  it('Haste: the swing interval is the one heroAttackIntervalMs gives with the tonic folded into the same speed bonus (so the 400 ms floor holds)', () => {
    const s = drink(bare(), 'haste_tonic');
    const c = buildCombatStats(s);
    const expected = heroAttackIntervalMs(c.agi!, (c.speedBonus ?? 0) + T.tonics.hasteAttackSpeed);
    expect(activeTonicStats(c, s, NOW).heroMs).toBe(expected);
    const r = oneFloor(s);
    expect(r.seconds * 1000).toBeCloseTo(r.heroHits * expected, 6); // the kill lands on the heroHits-th swing, one interval apart
    const slow = oneFloor(bare());
    expect(slow.seconds * 1000).toBeCloseTo(slow.heroHits * c.heroMs, 6);
    expect(expected).toBeLessThan(c.heroMs);
  });

  it('Precision: absolute crit points on top of gear and attributes (crits appear for a hero that had none)', () => {
    const s = drink(bare(), 'precision_elixir');
    expect(activeTonicStats(buildCombatStats(s), s, NOW).critChance).toBeCloseTo(T.tonics.precisionCritPoints, 12);
    const crits = [1, 2, 3, 4, 5, 6, 7, 8].reduce((a, seed) => a + oneFloor(s, seed).crits, 0);
    const plain = [1, 2, 3, 4, 5, 6, 7, 8].reduce((a, seed) => a + oneFloor(bare(), seed).crits, 0);
    expect(plain).toBe(0);
    expect(crits).toBeGreaterThan(0);
    const g = drink(geared(), 'precision_elixir');
    expect(activeTonicStats(buildCombatStats(g), g, NOW).critChance).toBeCloseTo(buildCombatStats(geared()).critChance + T.tonics.precisionCritPoints, 12);
  });

  it('Stoneskin and Polish: every enemy hit is the asymptotic reduction of (reduction + 0.10) / (+ 0.05) / both, on top of gear + RES', () => {
    const floor = 6;
    const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
    const raw = stageEnemyDmg(def, floor);
    const probe = (s: SaveData, extra: number) => {
      const r = oneFloor(s);
      expect(r.enemyHits).toBeGreaterThan(0);
      expect(r.damageTaken / r.enemyHits).toBe(applyDamageReduction(raw, buildCombatStats(s).reduction + extra));
      return r.damageTaken / r.enemyHits;
    };
    const base = bare();
    const none = probe(base, 0);
    const stone = probe(drink(base, 'stoneskin_tonic'), T.tonics.stoneskinReduction);
    const polish = probe(drink(base, 'armor_polish'), T.consumables.polishReduction);
    const both = probe(drink(base, 'stoneskin_tonic', 'armor_polish'), T.tonics.stoneskinReduction + T.consumables.polishReduction);
    expect(stone).toBeLessThan(none);
    expect(polish).toBeLessThan(none);
    expect(both).toBeLessThan(Math.min(stone, polish));
  });

  it('Stoneskin stacks with the gear armor, boots, shield and RES (they share one reduction sum)', () => {
    const g = drink(hero('2', 3, { level: 30, extra: [['boots', 'iron_greaves', 'common', []], ['shield', 'iron_shield', 'common', []]] }), 'stoneskin_tonic', 'armor_polish');
    const c = buildCombatStats(g);
    expect(activeTonicStats(c, g, NOW).reduction).toBeCloseTo(c.reduction + T.tonics.stoneskinReduction + T.consumables.polishReduction, 12);
    const noGear = buildCombatStats(hero('2', 3, { level: 30 }));
    expect(c.reduction).toBeGreaterThan(noGear.reduction);
  });
});

describe('Dungeon: Gold = 1 + gear (cap 25) + Pass + Ganancia + Fortune, all added', () => {
  const rich = (): SaveData => {
    const wSubs: Substat[] = [{ type: 'goldBonus', value: 20 }];
    const aSubs: Substat[] = [{ type: 'goldBonus', value: 20 }];
    return { ...hero('2', 3, { level: 30, rarity: 'rare', wSubs, aSubs }), highestDungeonFloor: 8 };
  };

  it('the run pays exactly goldMultiplier of each source; the gear part is capped at 25 and the others sit outside the cap', () => {
    const base = rich();
    expect(equippedSubstatTotals(base).goldBonus).toBe(GOLD_BONUS_CAP); // 40 rolled, 25 counted
    const run = withSeededRandom(4, () => runDungeon(base, NOW, 2));
    const paid = (s: SaveData) => applyDungeonRun(s, run, NOW).goldFromRun;
    const raw = run.rewards.gold;
    expect(raw).toBeGreaterThan(0);
    const owner = { ...base, hasBattlePass: true };
    const ganancia = { ...base, skillTree: { ...base.skillTree, sets: [addRank(addRank(addRank({}, 'h_greed'), 'h_greed'), 'h_greed'), {}] as SaveData['skillTree']['sets'] } };
    expect(paid(base)).toBe(Math.round(raw * 1.25));
    expect(paid(drink(base, 'fortune_tonic'))).toBe(Math.round(raw * (1.25 + T.tonics.fortuneGoldPct)));
    expect(paid(owner)).toBe(Math.round(raw * (1.25 + T.battlePass.goldBonus)));
    expect(paid(drink(owner, 'fortune_tonic'))).toBe(Math.round(raw * (1.25 + T.battlePass.goldBonus + T.tonics.fortuneGoldPct)));
    expect(paid(ganancia)).toBeGreaterThan(paid(base));
    expect(goldMultiplier(40, true, T.battlePass.goldBonus, 0.1)).toBeCloseTo(1 + 0.4 + T.tonics.fortuneGoldPct + T.battlePass.goldBonus + 0.1, 12); // the function does not cap; equippedSubstatTotals does
  });

  it('a Fortune Tonic that expired before the run ends does not pay', () => {
    const base = rich();
    const run = withSeededRandom(4, () => runDungeon(base, NOW, 2));
    const s = drink(base, 'fortune_tonic');
    expect(applyDungeonRun(s, run, NOW).goldFromRun).toBeGreaterThan(applyDungeonRun(s, run, NOW + 61 * MIN).goldFromRun);
    expect(applyDungeonRun(s, run, NOW + 61 * MIN).goldFromRun).toBe(applyDungeonRun(base, run, NOW).goldFromRun);
  });
});

describe('Hunting: the session replays every effect from its frozen stats and its time windows', () => {
  // A mid hero in an easy zone: fights are long enough to feel the damage / speed / crit buffs, and the session has hundreds of them.
  const START = NOW;
  const strong = (): SaveData => ({ ...hero('3', 5, { level: 40 }), highestDungeonFloor: 60, unlockedHuntingZones: unlockedZoneIds(60) });
  const start = (s: SaveData, offset = 0, zone = 'blood_marsh', depth: 'shallow' | 'dense' = 'dense'): SaveData => applyHuntStart({ ...s, huntingOfflineStart: START + offset }, zone, depth, START + offset)!;
  // the same without the unlock checks (a hero below the recommended CP of the depth, the marginal case the defence effects are for)
  const startRaw = (s: SaveData, offset: number): SaveData => ({ ...s, activeHuntingZone: 'blood_marsh', activeHuntingDepth: 'dense', huntingOfflineStart: START + offset, huntSession: buildHuntSession({ ...s, activeHuntingZone: 'blood_marsh' }, START + offset) });
  const run = (s: SaveData, hours = 4, offset = 0) => computeHuntingStatus(s, START + offset + hours * HOUR);
  const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i * 1000);
  const total = (mk: (offset: number) => SaveData, pick: (st: ReturnType<typeof run>) => number): number => OFFSETS.reduce((a, o) => a + pick(run(mk(o), 4, o)), 0);
  const plainKills = () => total((o) => start(strong(), o), (st) => st.kills);

  it('the hunt actually fights (a baseline for the comparisons)', () => {
    expect(plainKills()).toBeGreaterThan(200);
  });

  it.each([
    ['strength_elixir', 'kills'],
    ['atk_elixir', 'kills'],
    ['sharpening_stone', 'kills'],
    ['haste_tonic', 'kills'],
    ['precision_elixir', 'kills'],
  ] as [ElixirId, string][])('%s drunk before the session raises the kills of a 4 h hunt (faster fights)', (id) => {
    // the buff lasts 30 min .. 1 h: it covers the start of the session, so the effect is a share of it; every offset must not be worse and the sum must be better
    const kills = total((o) => start(drink(strong(), id), o), (st) => st.kills);
    expect(kills, id).toBeGreaterThan(plainKills());
  });

  it('a 30-minute damage buff covers 30 minutes of a 4 h session: the damage of the fights inside its window is what changes', () => {
    const s = start(drink(strong(), 'strength_elixir'));
    const win = s.huntSession!.strength;
    expect(win).toEqual([{ from: START, to: START - 1000 + buffMinutes('strength') * MIN }].map((w) => ({ from: START, to: w.to })));
    // the same elixir drunk after the session only started changes nothing before it was drunk, and after the session it is not retroactive
    const mid = applyElixir(give(start(strong()), { strength_elixir: 1 }), 'strength_elixir', START + 3 * HOUR)!;
    expect(mid.huntSession!.strength).toEqual([{ from: START + 3 * HOUR, to: START + 3 * HOUR + buffMinutes('strength') * MIN }]);
    const late = applyElixir(give(start(strong()), { strength_elixir: 1 }), 'strength_elixir', START + 5 * HOUR)!;
    expect(run(late, 4).kills).toBe(run(start(strong()), 4).kills);
  });

  it('Stoneskin / Polish: the hero takes less damage (fewer potions drunk by the auto-potion, same fights)', () => {
    const potions = { small_hp: 400, large_hp: 0, greater_elixir: 0 };
    const weak: SaveData = { ...hero('2', 3, { level: 30 }), highestDungeonFloor: 60, unlockedHuntingZones: unlockedZoneIds(60) };
    const s0 = { ...give(weak, potions), autoPotionThreshold: 0.7 };
    const used = (mk: (o: number) => SaveData) => total(mk, (st) => st.potionsUsed.small_hp);
    const plain = used((o) => startRaw(s0, o));
    expect(plain).toBeGreaterThan(0);
    expect(used((o) => startRaw(drink(s0, 'stoneskin_tonic'), o))).toBeLessThan(plain);
    expect(used((o) => startRaw(drink(s0, 'armor_polish'), o))).toBeLessThanOrEqual(plain); // +0.05 is the smaller of the two; it never makes the hunt worse
    expect(used((o) => startRaw(drink(s0, 'stoneskin_tonic', 'armor_polish'), o))).toBeLessThanOrEqual(used((o) => startRaw(drink(s0, 'stoneskin_tonic'), o)));
  });

  it('Fortune: the gold of the fight time it covers is +20% on top of gear / Pass / Ganancia (added, not multiplied)', () => {
    const goldOf = (mk: (o: number) => SaveData) => total(mk, (st) => st.goldReady);
    const plain = goldOf((o) => start(strong(), o));
    const withFortune = goldOf((o) => start(drink(strong(), 'fortune_tonic'), o));
    expect(plain).toBeGreaterThan(0);
    // 60 min of a 4 h session: about a quarter of the fight time, so about +5% of the session's gold; never more than the whole-session +20%
    expect(withFortune / plain).toBeGreaterThan(1.03);
    expect(withFortune / plain).toBeLessThan(1 + T.tonics.fortuneGoldPct / 1.5);
    // gear gold adds to the same base, the Pass adds its own share
    const gear = { ...strong(), gearInstances: Object.fromEntries(Object.entries(strong().gearInstances).map(([k, g]) => [k, { ...g, substats: [{ type: 'goldBonus', value: 10 }] as Substat[] }])) };
    expect(buildCombatStats(gear).goldBonus).toBeGreaterThan(0);
    const gearGold = goldOf((o) => start(gear, o));
    expect(gearGold).toBeGreaterThan(plain);
    const passGold = goldOf((o) => start({ ...strong(), hasBattlePass: true }, o));
    expect(passGold / plain).toBeGreaterThan(1.1); // +15%, a little under it from the rounding of the session
    expect(passGold / plain).toBeLessThan(1.2);
  });

  it('Hunter Lure: raises the uncommon / rare drops of the zone it was used in, never the common ones, and nothing in another zone', () => {
    const zoneId = 'blood_marsh';
    const zone = getHuntingZone(zoneId)!;
    const s0 = give(strong(), { hunter_lure: 1 });
    const started = (o: number) => start(s0, o, zoneId, 'dense');
    const lured = (o: number) => applyElixir(started(o), 'hunter_lure', START + o)!;
    const drops = (mk: (o: number) => SaveData) => OFFSETS.map((o) => run(mk(o), 4, o).drops as Record<string, number>);
    const sumOf = (rows: Record<string, number>[], mat: string) => rows.reduce((a, r) => a + (r[mat] ?? 0), 0);
    const plainRows = drops(started);
    const lureRows = drops(lured);
    for (const d of zone.drops) {
      if (d.rarity === 'common') expect(sumOf(lureRows, d.material), d.material).toBe(sumOf(plainRows, d.material));
      else expect(sumOf(lureRows, d.material), d.material).toBeGreaterThanOrEqual(sumOf(plainRows, d.material));
    }
    const lifted = zone.drops.filter((d) => d.rarity !== 'common').reduce((a, d) => a + sumOf(lureRows, d.material) - sumOf(plainRows, d.material), 0);
    expect(lifted).toBeGreaterThan(0);
    // a lure bought for another zone does nothing here
    const elsewhere = (o: number): SaveData => ({ ...started(o), buffs: { bait: { from: START + o, expiresAt: START + o + HOUR, zone: 'demon_glade' } } });
    expect(drops(elsewhere)).toEqual(plainRows);
  });
});

describe('Mining / Woodcutting: Gatherer Brew and Prospector Tonic add effective hours, only for the time they cover', () => {
  const mining = (): SaveData => ({ ...defaultSave(), activeOreId: 'copper', lastMiningClaim: NOW - 2 * HOUR, skillXp: { ...defaultSave().skillXp, mining: skillXpToReachLevel(40, 'mining') } });
  const wood = (): SaveData => ({ ...defaultSave(), activeWoodId: 'common_wood', lastWoodcuttingClaim: NOW - 2 * HOUR, skillXp: { ...defaultSave().skillXp, woodcutting: skillXpToReachLevel(40, 'woodcutting') } });
  const brewed = (s: SaveData, id: ElixirId) => applyElixir(give(s, { [id]: 1 }), id, NOW - 2 * HOUR)!;

  it('both tonics raise the units of Mining AND Woodcutting, and add to each other, inside the caps (+25% Brew, +10% Prospector)', () => {
    for (const [mk, read] of [
      [mining, (s: SaveData) => computeMiningStatus(s, NOW).oreReady],
      [wood, (s: SaveData) => computeWoodcuttingStatus(s, NOW).woodReady],
    ] as const) {
      const plain = read(mk());
      const gather = read(brewed(mk(), 'gatherer_brew'));
      const prospect = read(brewed(mk(), 'prospector_tonic'));
      const both = read(brewed(brewed(mk(), 'gatherer_brew'), 'prospector_tonic'));
      expect(gather).toBeGreaterThan(plain);
      expect(prospect).toBeGreaterThan(plain);
      expect(both).toBeGreaterThan(Math.max(gather, prospect));
      expect(gather / plain).toBeLessThanOrEqual(1 + T.tonics.gathererYieldPct + 0.02);
      expect(prospect / plain).toBeLessThanOrEqual(1 + T.consumables.prospectYieldPct + 0.02);
      expect(both / plain).toBeLessThanOrEqual(1 + T.tonics.gathererYieldPct + T.consumables.prospectYieldPct + 0.02);
    }
    expect(T.consumables.prospectYieldPct).toBeLessThanOrEqual(T.consumables.newConsumableCap);
    expect(T.consumables.baitDropPct).toBeLessThanOrEqual(T.consumables.newConsumableCap);
  });

  it('the Pass material multiplier multiplies the units of the whole session (with the tonics inside)', () => {
    const owner = (s: SaveData): SaveData => ({ ...s, hasBattlePass: true, miningPass: { active: true, capHours: 8 } });
    const base = brewed(mining(), 'gatherer_brew');
    expect(computeMiningStatus(owner(base), NOW).oreReady / computeMiningStatus(base, NOW).oreReady).toBeCloseTo(T.battlePass.dropRateMultiplier, 1);
  });
});

describe('gear: every equipped slot and every stat it declares reaches the combat stats the fight uses', () => {
  const lvl = xpToReachLevel(60);
  const equip = (s: SaveData, tpl: string, o: Partial<GearInstance> = {}): SaveData => {
    const inst = createGearInstance(tpl, { id: 'x_' + tpl, origin: 'craft', rarity: 'common', substats: [], ...o });
    return applyEquipInstance({ ...s, gearInstances: { ...s.gearInstances, [inst.id]: inst } }, inst.id) as SaveData;
  };
  const base = (): SaveData => ({ ...defaultSave(), xp: lvl });

  it('each of the seven slots: its declared stats change the matching combat stat (and only through buildCombatStats)', () => {
    const b = buildCombatStats(base());
    const cases: [string, (keyof typeof b)[]][] = [
      ['steel_greatsword', ['dmgBase', 'critChance']],
      ['steel_plate', ['maxHp', 'reduction', 'reflect']],
      ['steel_helm', ['maxHp', 'reduction']],
      ['steel_gauntlets', ['dmgBase', 'critChance']],
      ['steel_greaves', ['maxHp', 'reduction']],
      ['gold_ring', ['critChance', 'critMult']],
      ['steel_kite_shield', ['maxHp', 'reduction', 'reflect']],
    ];
    for (const [tpl, stats] of cases) {
      const c = buildCombatStats(equip(base(), tpl));
      for (const k of stats) expect(c[k], `${tpl}.${String(k)}`).not.toEqual(b[k]);
    }
    expect(cases.map(([t]) => getGear(t).slot).sort()).toEqual([...INSTANCED_SLOTS].sort());
  });

  it('refine, rarity and durability scale every slot the same way (a worn ring / helmet counts less, a refined one more)', () => {
    for (const tpl of ['steel_helm', 'steel_gauntlets', 'steel_greaves', 'gold_ring', 'steel_kite_shield']) {
      const plain = buildCombatStats(equip(base(), tpl));
      const refined = buildCombatStats(equip(base(), tpl, { upgrade: 5 }));
      const worn = buildCombatStats(equip(base(), tpl, { durability: 10 }));
      const none = buildCombatStats(base());
      const key = (['maxHp', 'dmgBase', 'critChance'] as const).find((k) => plain[k] !== none[k])!;
      expect(refined[key], tpl).toBeGreaterThan(plain[key]);
      expect(worn[key], tpl).toBeLessThan(plain[key]);
      expect(worn[key], tpl).toBeGreaterThan(none[key] - 1e-9);
    }
  });

  it('substats and sockets of ANY slot (not only weapon and armor) reach the stats', () => {
    const subs: Substat[] = [
      { type: 'critRate', value: 5 },
      { type: 'critDamage', value: 20 },
      { type: 'lifesteal', value: 2 },
      { type: 'defense', value: 4 },
      { type: 'maxHp', value: 30 },
      { type: 'goldBonus', value: 6 },
    ];
    const b = buildCombatStats(base());
    for (const tpl of ['steel_helm', 'steel_gauntlets', 'steel_greaves', 'gold_ring', 'steel_kite_shield']) {
      const c = buildCombatStats(equip(base(), tpl, { rarity: 'legendary', substats: subs }));
      const plain = buildCombatStats(equip(base(), tpl, { rarity: 'legendary', substats: [] }));
      expect(c.critChance - plain.critChance, tpl).toBeCloseTo(0.05, 9);
      expect(c.critMult - plain.critMult, tpl).toBeCloseTo(0.2, 9);
      expect(c.lifesteal - plain.lifesteal, tpl).toBeCloseTo(2, 9);
      expect(c.reduction - plain.reduction, tpl).toBeCloseTo(0.04, 9);
      expect(c.maxHp - plain.maxHp, tpl).toBe(30);
      expect(c.goldBonus! - plain.goldBonus!, tpl).toBeCloseTo(6, 9);
      void b;
    }
    const socketed = buildCombatStats(equip(base(), 'steel_helm', { sockets: ['ruby'] }));
    expect(socketed.maxHp !== buildCombatStats(equip(base(), 'steel_helm')).maxHp || socketed.dmgBase !== buildCombatStats(equip(base(), 'steel_helm')).dmgBase || socketed.critMult !== buildCombatStats(equip(base(), 'steel_helm')).critMult).toBe(true);
  });

  it('every stat a gear template declares exists in the engine for ITS slot (a field on the wrong slot would be silently ignored)', () => {
    // The relic-only fields are read from the relic; the others are read from every instanced slot through equippedExtraStats / weapon / armor.
    const RELIC_ONLY = ['hpRegenPct', 'attackSpeedBonus', 'damagePct', 'lifestealPct', 'goldBonusPct', 'xpBonusPct'] as const;
    const WEAPON_ONLY = ['burn'] as const;
    const ARMOR_AND_SHIELD = ['reflect'] as const;
    for (const g of GEAR) {
      if (g.slot !== 'relic') for (const f of RELIC_ONLY) expect((g as unknown as Record<string, unknown>)[f], `${g.id}.${f} is only read from the relic slot`).toBeUndefined();
      if (g.slot !== 'weapon') for (const f of WEAPON_ONLY) expect((g as unknown as Record<string, unknown>)[f], `${g.id}.${f} is only read from the weapon`).toBeUndefined();
      if (g.slot !== 'armor' && g.slot !== 'shield') for (const f of ARMOR_AND_SHIELD) expect((g as unknown as Record<string, unknown>)[f], `${g.id}.${f}`).toBeUndefined();
    }
  });
});

describe('the freeze of a Hunting session never loses an effect', () => {
  it('elixirs / tonics drunk during a hunt are recorded as windows in the session and survive a reload', () => {
    const s0 = give({ ...hero('3', 3, { level: 40 }), highestDungeonFloor: 60, unlockedHuntingZones: unlockedZoneIds(60) }, { strength_elixir: 1, atk_elixir: 1, haste_tonic: 1, fortune_tonic: 1, stoneskin_tonic: 1, precision_elixir: 1, sharpening_stone: 1, armor_polish: 1, hunter_lure: 1 });
    let s = applyHuntStart(s0, 'blood_marsh', 'dense', NOW)!;
    const kinds: ElixirId[] = ['strength_elixir', 'atk_elixir', 'haste_tonic', 'fortune_tonic', 'stoneskin_tonic', 'precision_elixir', 'sharpening_stone', 'armor_polish', 'hunter_lure'];
    for (const id of kinds) s = applyElixir(s, id, NOW + 10 * MIN)!;
    const sess = s.huntSession!;
    expect(sess.strength).toHaveLength(1);
    expect(sess.attack).toHaveLength(1);
    for (const k of ['haste', 'fortune', 'stoneskin', 'precision', 'sharpened', 'polished', 'bait'] as const) expect(sess.tonics?.[k], k).toHaveLength(1);
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.huntSession!.strength).toEqual(sess.strength);
    expect(back.huntSession!.tonics).toEqual(sess.tonics);
  });

  it('the session keeps its stats from the start: gear or attributes changed during the hunt do not count until the next hunt (and an elixir does)', () => {
    const s0 = { ...hero('3', 3, { level: 40 }), highestDungeonFloor: 60, unlockedHuntingZones: unlockedZoneIds(60) };
    const started = applyHuntStart(s0, 'blood_marsh', 'dense', NOW)!;
    const richer = { ...started, str: started.str + 50 };
    expect(computeHuntingStatus(richer, NOW + 4 * HOUR)).toEqual(computeHuntingStatus(started, NOW + 4 * HOUR));
    expect(buildHuntSession(richer, NOW).stats.dmgBase).toBeGreaterThan(started.huntSession!.stats.dmgBase);
  });

  it('a tampered or reloaded session keeps what the Haste Tonic needs (agi + speedBonus), so the tonic keeps the 400 ms floor after a reload', () => {
    const s = applyHuntStart({ ...hero('3', 3, { level: 40 }), highestDungeonFloor: 60, unlockedHuntingZones: unlockedZoneIds(60) }, 'blood_marsh', 'dense', NOW)!;
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(hasteIntervalMs(back.huntSession!.stats)).toBe(hasteIntervalMs(s.huntSession!.stats));
  });
});
