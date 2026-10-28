import { describe, expect, it } from 'vitest';
import {
  buildCombatStats,
  computeCP,
  computeHuntingStatus,
  buildHuntSession,
  defaultSave,
  normalizeSave,
  playerLevel,
  SaveData,
  xpToReachLevel,
} from '../engine';
import { CombatStats, applyDamageModifiers, applyDamageReduction, combatPowerCore, heroAttackIntervalMs, igniteBurn, nextBurnTickAt, reflectedDamage, regenAmount, tickBurn, BurnState } from '../derivedStats';
import { GEAR, GearItem, LIVE_STAT_FIELDS, META_FIELDS, getGear } from '../gear';
import { applyEquipInstance, createGearInstance } from '../gearInstances';
import { HuntCombatBuild, HuntPotionCfg, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { sanitizeHuntSession } from '../huntSession';
import { getHuntingZone } from '../huntingZones';
import { dungeonEnemyKindForFloor } from '../dungeon';
import { getEnemyDef } from '../enemies';
import { stageEnemyDmg, stageEnemyHp } from '../waves';
import { gearStatLines } from '../../components/gearStats';
import T from '../tunables';
import { duel, hero, repFloor } from '../../../scripts/sim/duel';
import { runDungeon } from '../../../scripts/sim/driver';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const withRelic = (s: SaveData, id: string | null): SaveData => ({ ...s, equipped: { ...s.equipped, relic: id } });

// --- burn ----------------------------------------------------------------------------------------------------------------------

// Total burn damage of a list of hero hits (times in ms), driven only by the shared helpers, the way every loop drives them.
function burnTotal(hitTimes: number[], hit: number, until = 60_000): { total: number; ticks: number[] } {
  let burn: BurnState | null = null;
  let total = 0;
  const ticks: number[] = [];
  const hits = [...hitTimes];
  for (;;) {
    const nextHit = hits.length > 0 ? hits[0] : Infinity;
    const nextTick = nextBurnTickAt(burn);
    const t = Math.min(nextHit, nextTick);
    if (t > until || t === Infinity) break;
    if (nextHit <= nextTick) {
      burn = igniteBurn(burn, t, hit);
      hits.shift();
    } else {
      const tick = tickBurn(burn!);
      total += tick.damage;
      ticks.push(t);
      burn = tick.burn;
    }
  }
  return { total, ticks };
}

describe('burn', () => {
  it('one hit burns for 3 s: 3 ticks of 6% of the (pre-crit) hit, one per second', () => {
    const r = burnTotal([0], 100);
    expect(r.ticks).toEqual([1000, 2000, 3000]);
    expect(r.total).toBe(3 * 6);
  });

  it('a hit while burning refreshes the duration and never stacks: two quick hits burn exactly as long as the latest one says', () => {
    const one = burnTotal([0], 100);
    const two = burnTotal([0, 500], 100);
    expect(two.total).toBe(one.total); // same 3 ticks (1000, 2000, 3000), not 6
    expect(two.ticks).toEqual([1000, 2000, 3000]);
    // refreshed late in the burn: it keeps going until 3 s after the LAST hit
    const late = burnTotal([0, 2500], 100);
    expect(late.ticks).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it('a steady rhythm of hits keeps exactly one tick per second (6% of the hit per second, not more)', () => {
    const hits = Array.from({ length: 10 }, (_, i) => 1200 * (i + 1));
    const r = burnTotal(hits, 200, 12_000);
    // lit by the first hit at 1.2 s: a tick every second after that, each 6% of 200, however many hits refresh it
    expect(r.ticks).toEqual(Array.from({ length: 10 }, (_, i) => 2200 + 1000 * i));
    expect(r.total).toBe(10 * Math.round(200 * T.battle.burnPctPerSec));
  });

  it('takes the newest hit for the tick damage and never goes below 1', () => {
    let burn = igniteBurn(null, 0, 100);
    burn = igniteBurn(burn, 400, 200);
    expect(burn.tickDamage).toBe(12);
    expect(igniteBurn(null, 0, 3).tickDamage).toBe(1);
  });
});

// --- reflect ------------------------------------------------------------------------------------------------------------------

describe('reflect', () => {
  it('reflects a share of the damage the hero actually took (after mitigation), at least 1 when it is on', () => {
    const taken = applyDamageReduction(100, 1); // 50: resistance 1.0 halves the hit
    expect(taken).toBe(50);
    expect(reflectedDamage(taken, 0.2)).toBe(10); // NOT 20 (20% of the raw 100)
    expect(reflectedDamage(1, 0.2)).toBe(1);
    expect(reflectedDamage(100, 0)).toBe(0);
    expect(reflectedDamage(0, 0.5)).toBe(0);
    expect(reflectedDamage(Number.NaN, 0.5)).toBe(0);
  });
});

// --- regeneration ---------------------------------------------------------------------------------------------------------------

describe('regeneration', () => {
  it('heals a share of max HP per tick, at least 1, and nothing without the effect', () => {
    expect(regenAmount(1000, 0.009)).toBe(9);
    expect(regenAmount(10, 0.009)).toBe(1);
    expect(regenAmount(1000, 0)).toBe(0);
    expect(regenAmount(0, 0.5)).toBe(0);
  });
});

// --- attack speed ---------------------------------------------------------------------------------------------------------------

describe('attack speed bonus', () => {
  it('shortens the interval by the bonus and goes through the same floor as AGI', () => {
    const base = heroAttackIntervalMs(100);
    expect(heroAttackIntervalMs(100, 0.08)).toBeCloseTo(base / 1.08, 6);
    expect(heroAttackIntervalMs(0, 0)).toBe(heroAttackIntervalMs(0));
    // nothing can beat the floor, however large the bonus or the AGI
    expect(heroAttackIntervalMs(300, 5)).toBe(T.battle.heroMinMs);
    expect(heroAttackIntervalMs(1_000_000, 1000)).toBe(T.battle.heroMinMs);
    // garbage bonus counts as none
    expect(heroAttackIntervalMs(50, Number.NaN)).toBe(heroAttackIntervalMs(50));
    expect(heroAttackIntervalMs(50, -3)).toBe(heroAttackIntervalMs(50));
  });

  it('the amulet reaches buildCombatStats through that derivation', () => {
    const h = hero('3', 0, { level: 30 });
    const a = buildCombatStats(h).heroMs;
    const b = buildCombatStats(withRelic(h, 'amulet_swiftness')).heroMs;
    expect(b).toBeCloseTo(a / (1 + getGear('amulet_swiftness').attackSpeedBonus!), 6);
  });

  // Attack speed and regeneration used to reach the combat only from a relic, a skill or a set: a helmet / gloves / boots / ring / shield (or an armor) that carried them was
  // dead data. The bonus is lent to real templates for the length of the check (the lines that carry it are covered by the dead-field guard below) and restored.
  const wear = (s: SaveData, templateId: string): SaveData => {
    const inst = createGearInstance(templateId, { id: 'w_' + templateId, origin: 'craft', rarity: 'common', substats: [] });
    return applyEquipInstance({ ...s, gearInstances: { ...s.gearInstances, [inst.id]: inst } }, inst.id) as SaveData;
  };
  const lend = <K extends 'attackSpeedBonus' | 'hpRegenPct' | 'critChance'>(id: string, field: K, value: number, fn: () => void) => {
    const g = getGear(id);
    const before = g[field];
    g[field] = value;
    try {
      fn();
    } finally {
      g[field] = before;
    }
  };

  it('an instanced piece (not a relic) shortens heroMs through the same floored derivation, and a worn armor does too', () => {
    const h = hero('3', 0, { level: 30 });
    const base = buildCombatStats(h);
    for (const [id, slotItem] of [['iron_greaves', 'boots'], ['iron_helm', 'helmet'], ['iron_gauntlets', 'gloves'], ['iron_shield', 'shield'], ['silver_ring', 'ring']] as const) {
      lend(id, 'attackSpeedBonus', 0.1, () => {
        const s = buildCombatStats(wear(h, id));
        expect(s.speedBonus, slotItem).toBeCloseTo(base.speedBonus + 0.1, 9);
        expect(s.heroMs, slotItem).toBeLessThan(base.heroMs);
        expect(s.heroMs, slotItem).toBeCloseTo(heroAttackIntervalMs(h.agi, base.speedBonus + 0.1), 6);
      });
    }
    // the armor is not an extra slot, but its speed has to count as well
    lend('iron_chainmail', 'attackSpeedBonus', 0.1, () => {
      const s = buildCombatStats(wear(h, 'iron_chainmail'));
      expect(s.heroMs).toBeCloseTo(heroAttackIntervalMs(h.agi, base.speedBonus + 0.1), 6);
    });
    // and the 400 ms floor still caps a huge stack
    lend('iron_greaves', 'attackSpeedBonus', 50, () => expect(buildCombatStats(wear(h, 'iron_greaves')).heroMs).toBe(T.battle.heroMinMs));
  });

  it('an instanced piece adds regeneration on top of the relic, and an armor crit chance reaches the hero', () => {
    const h = hero('3', 0, { level: 30 });
    const base = buildCombatStats(h);
    lend('iron_helm', 'hpRegenPct', 0.004, () => {
      expect(buildCombatStats(wear(h, 'iron_helm')).hpRegenPct).toBeCloseTo(base.hpRegenPct + 0.004, 9);
      const both = buildCombatStats(withRelic(wear(h, 'iron_helm'), 'ring_vitality')).hpRegenPct;
      expect(both).toBeCloseTo(base.hpRegenPct + 0.004 + getGear('ring_vitality').hpRegenPct!, 9);
    });
    const without = buildCombatStats(wear(h, 'iron_chainmail')).critChance;
    lend('iron_chainmail', 'critChance', 0.05, () => expect(buildCombatStats(wear(h, 'iron_chainmail')).critChance - without).toBeCloseTo(0.05, 9));
  });
});

// --- the three combat loops agree ------------------------------------------------------------------------------------------------

const baseBuild: HuntCombatBuild = {
  playerMax: 100_000,
  heroDmgBase: 100,
  critChance: 0,
  critMult: 2,
  heroMs: 1000,
  reduction: 0,
  lifestealPct: 0,
  burn: false,
  reflect: 0,
  hpRegenPct: 0,
};
const baseZone: HuntZoneCombatCfg = {
  baseEnemyHp: 1000,
  baseEnemyDmg: 100,
  enemyAtkMs: 1000,
  hpGrowth: 0,
  dmgGrowth: 0,
  depthMult: 1,
  goldPerHour: 0,
  xpPerKill: 0,
  drops: [],
  depth: 'shallow',
  dropRateMult: 1,
};
const noPotions: HuntPotionCfg = {
  threshold: 0,
  priority: 'small_first',
  stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 },
  greaterElixirHealPct: 0.5,
  potionHeal: 50,
  largePotionHeal: 150,
  cooldownMs: 5000,
};
// Time of the first COMPLETED fight in a session that lasts `sessionMs` (0 when none completes).
const huntFightMs = (build: HuntCombatBuild, zone: HuntZoneCombatCfg, sessionMs: number) =>
  simulateHuntingSession(build, zone, { ceiling: 1, promotionWins: 0 }, sessionMs, noPotions, 'seed', { maxLevel: 1, requiredWins: () => 1 }).fightTimeUsedMs;

describe('hunting simulation applies the effects', () => {
  it('burn shortens a fight that the plain hits would need 11 hits for', () => {
    const zone = { ...baseZone, baseEnemyHp: 1040, baseEnemyDmg: 1 };
    expect(huntFightMs(baseBuild, zone, 11_001)).toBe(11_000);
    expect(huntFightMs({ ...baseBuild, burn: true }, zone, 11_001)).toBe(10_000);
  });

  it('reflect uses the damage after mitigation', () => {
    // enemy hits for 100, resistance 1.0 -> the hero takes 50 -> reflected 10 (reflected from the RAW hit it would be 20 and the fight would end at 9 s)
    const zone = { ...baseZone, baseEnemyHp: 1045 };
    const build = { ...baseBuild, reduction: 1 };
    expect(huntFightMs(build, zone, 11_001)).toBe(11_000);
    expect(huntFightMs({ ...build, reflect: 0.2 }, zone, 11_001)).toBe(10_000);
  });

  it('regeneration keeps a hero alive that would otherwise die, and never heals above max HP', () => {
    const zone = { ...baseZone, baseEnemyHp: 2000, baseEnemyDmg: 300 };
    const build = { ...baseBuild, playerMax: 1000 };
    expect(huntFightMs(build, zone, 30_000)).toBe(0); // dies at 4 s, never wins
    expect(huntFightMs({ ...build, hpRegenPct: 0.5 }, zone, 30_000)).toBeGreaterThan(0);
    const r = simulateHuntingSession({ ...build, hpRegenPct: 0.5 }, zone, { ceiling: 1, promotionWins: 0 }, 1500, noPotions, 'seed', { maxLevel: 1, requiredWins: () => 1 });
    expect(r.liveSnapshot!.heroHp).toBe(1000); // 1000 - 300 + 500 would be 1200
  });

  it('the attack-speed bonus is just a shorter heroMs for the loop', () => {
    const zone = { ...baseZone, baseEnemyDmg: 1 };
    expect(huntFightMs({ ...baseBuild, heroMs: heroAttackIntervalMs(0) }, zone, 12_001)).toBe(12_000); // 10 hits, 1200 ms apart
    expect(huntFightMs({ ...baseBuild, heroMs: heroAttackIntervalMs(0, 1) }, zone, 6_001)).toBe(6_000); // +100%: 600 ms apart
  });

  it('an old saved session without the effect fields counts as having none', () => {
    const s = hero('4d', 0, { level: 50 });
    const session = buildHuntSession(s, NOW);
    const raw = JSON.parse(JSON.stringify(session));
    delete raw.stats.burn;
    delete raw.stats.reflect;
    delete raw.stats.hpRegenPct;
    const back = sanitizeHuntSession(raw)!;
    expect(back.stats.burn).toBe(false);
    expect(back.stats.reflect).toBe(0);
    expect(back.stats.hpRegenPct).toBe(0);
    // and the modern one round-trips with them
    const modern = sanitizeHuntSession(JSON.parse(JSON.stringify(session)))!;
    expect(modern.stats.burn).toBe(true);
    expect(modern.stats.reflect).toBeGreaterThan(0);
    // computeHuntingStatus runs on both and stays deterministic
    const zone = getHuntingZone('demon_glade')!;
    const run = (hs: typeof session): number => computeHuntingStatus({ ...s, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: NOW, huntSession: hs }, NOW + 4 * 3600 * 1000).xpReady;
    expect(run(modern)).toBe(run(modern));
    expect(run(back)).toBe(run(back));
  });
});

describe('dungeon driver (mirror of BattleModal) and hunting simulation resolve one fight identically', () => {
  // Crits off in both (Math.random pinned high, critChance 0 in the hunting build) so the two RNG streams cannot differ; everything else comes from
  // the same stats. The hunting run is given exactly the Dungeon fight's length + 1 ms and must finish that very fight at the same millisecond.
  const cases: [string, (s: SaveData) => SaveData][] = [
    ['burn + reflect', (s) => s],
    ['burn + reflect + regeneration', (s) => withRelic(s, 'ring_vitality')],
    ['burn + reflect + attack speed', (s) => withRelic(s, 'amulet_swiftness')],
  ];
  for (const [label, setup] of cases) {
    it(label, () => {
      const base = setup(hero('4d', 4, { level: 50 }));
      const floor = repFloor(base);
      const start = { ...base, highestDungeonFloor: floor };
      const realRandom = Math.random;
      Math.random = () => 0.999999;
      let run;
      try {
        run = runDungeon(start, NOW, 1);
      } finally {
        Math.random = realRandom;
      }
      expect(run.outcome).toBe('retreat');
      expect(run.stages).toBe(1);
      const c = buildCombatStats(start);
      expect(c.burn).toBe(true);
      expect(c.reflect).toBeGreaterThan(0);
      const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
      const build: HuntCombatBuild = {
        playerMax: c.maxHp,
        heroDmgBase: applyDamageModifiers(c.dmgBase, { blessedMult: 1, strengthMult: 1, attackMult: 1 }),
        critChance: 0,
        critMult: c.critMult,
        heroMs: c.heroMs,
        reduction: c.reduction,
        lifestealPct: c.lifesteal,
        burn: c.burn,
        reflect: c.reflect,
        hpRegenPct: c.hpRegenPct,
      };
      const zone: HuntZoneCombatCfg = { ...baseZone, baseEnemyHp: stageEnemyHp(def, floor), baseEnemyDmg: stageEnemyDmg(def, floor), enemyAtkMs: def.atkSpeedMs };
      const ms = run.seconds * 1000;
      expect(huntFightMs(build, zone, Math.ceil(ms) + 1)).toBeCloseTo(ms, 6);
      expect(huntFightMs(build, zone, Math.floor(ms) - 1)).toBe(0); // one ms short of the Dungeon's fight: not finished
    });
  }
});

// --- CP -------------------------------------------------------------------------------------------------------------------------

describe('CP values the effects and never punishes them', () => {
  const heroes = [hero('2', 4, { level: 15 }), hero('3', 4, { level: 30 }), hero('4g', 0, { level: 60 }), hero('6', 8, { level: 100 })];

  it('equipping any relic never lowers CP', () => {
    for (const h of heroes) {
      const base = computeCP(h);
      for (const r of GEAR.filter((g) => g.slot === 'relic')) expect(computeCP(withRelic(h, r.id)), `${r.id} at level ${playerLevel(h.xp)}`).toBeGreaterThanOrEqual(base);
    }
  });

  it('each effect on its own raises combatPowerCore, and never lowers it, for every hero', () => {
    for (const h of heroes) {
      const c = buildCombatStats(h);
      const off: CombatStats = { ...c, burn: false, reflect: 0, hpRegenPct: 0 };
      const core = combatPowerCore(off);
      expect(combatPowerCore({ ...off, burn: true })).toBeGreaterThan(core);
      expect(combatPowerCore({ ...off, reflect: 0.2 })).toBeGreaterThan(core);
      expect(combatPowerCore({ ...off, hpRegenPct: 0.009 })).toBeGreaterThan(core);
      // monotone in the size of the effect
      expect(combatPowerCore({ ...off, reflect: 0.3 })).toBeGreaterThanOrEqual(combatPowerCore({ ...off, reflect: 0.2 }));
      expect(combatPowerCore({ ...off, hpRegenPct: 0.02 })).toBeGreaterThanOrEqual(combatPowerCore({ ...off, hpRegenPct: 0.009 }));
    }
  });

  it('a stats object from before the effects existed (no fields) still gives a finite CP', () => {
    const c = buildCombatStats(heroes[1]) as Partial<CombatStats>;
    const old = { maxHp: c.maxHp, dmgBase: c.dmgBase, critChance: c.critChance, critMult: c.critMult, heroMs: c.heroMs, reduction: c.reduction, lifesteal: c.lifesteal } as CombatStats;
    expect(Number.isFinite(combatPowerCore(old))).toBe(true);
  });

  it('turning an effect off in the data never raises CP (burn on weapons, reflect on armors)', () => {
    for (const item of GEAR) {
      if (!item.burn && !item.reflect) continue;
      const tier = item.tier ?? 1;
      const h = { ...defaultSave(), xp: xpToReachLevel(Math.min(100, 10 + tier * 15)) };
      const inst = createGearInstance(item.id, { id: 'x_' + item.id, origin: 'craft', rarity: 'common', substats: [] });
      const equipped = applyEquipInstance({ ...h, gearInstances: { ...h.gearInstances, [inst.id]: inst } }, inst.id) as SaveData;
      const withEffect = computeCP(equipped);
      const prevBurn = item.burn;
      const prevReflect = item.reflect;
      item.burn = false;
      item.reflect = 0;
      const without = computeCP(equipped);
      item.burn = prevBurn;
      item.reflect = prevReflect;
      expect(withEffect, item.id).toBeGreaterThan(without);
    }
  });

  it('every item raises CP over the empty slot in its own slot (equipping never lowers it)', () => {
    const h = { ...defaultSave(), xp: xpToReachLevel(100) }; // wearing needs the recipe's level; the top pieces need 100
    const base = computeCP(h);
    for (const item of GEAR) {
      let s: SaveData;
      if (item.slot === 'relic') s = withRelic(h, item.id);
      else {
        const inst = createGearInstance(item.id, { id: 'x_' + item.id, origin: 'craft', rarity: 'common', substats: [] });
        s = applyEquipInstance({ ...h, gearInstances: { ...h.gearInstances, [inst.id]: inst } }, inst.id) as SaveData;
      }
      expect(computeCP(s), item.id).toBeGreaterThanOrEqual(base);
    }
  });
});

// --- dead data guard ------------------------------------------------------------------------------------------------------------

// The CombatStats field that must change when an item with this GearItem field is equipped.
const FIELD_TO_STAT: Record<(typeof LIVE_STAT_FIELDS)[number], keyof CombatStats> = {
  damage: 'dmgBase',
  critChance: 'critChance',
  burn: 'burn',
  maxHp: 'maxHp',
  resistance: 'reduction',
  reflect: 'reflect',
  critMultBonus: 'critMult',
  hpRegenPct: 'hpRegenPct',
  attackSpeedBonus: 'heroMs',
  damagePct: 'dmgBase',
  lifestealPct: 'lifesteal',
  goldBonusPct: 'goldBonus',
};

describe('no dead gear fields', () => {
  it('every key a gear entry carries is a declared live stat field or a declared meta field', () => {
    const known = new Set<string>([...LIVE_STAT_FIELDS, ...META_FIELDS]);
    for (const g of GEAR) for (const [k, v] of Object.entries(g)) if (v !== undefined) expect(known.has(k), `${g.id}.${k} is not read by combat and not declared as meta`).toBe(true);
  });

  it('every live stat field is used by at least one item (no stale entry in the list)', () => {
    for (const f of LIVE_STAT_FIELDS) expect(GEAR.some((g) => (g as unknown as Record<string, unknown>)[f]), f).toBeTruthy();
  });

  it('equipping each item changes the combat stat that each of its live fields promises', () => {
    const base = { ...defaultSave(), xp: xpToReachLevel(100) };
    const baseStats = buildCombatStats(base);
    for (const item of GEAR) {
      let s: SaveData;
      if (item.slot === 'relic') s = withRelic(base, item.id);
      else {
        const inst = createGearInstance(item.id, { id: 'x_' + item.id, origin: 'craft', rarity: 'common', substats: [] });
        s = applyEquipInstance({ ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst } }, inst.id) as SaveData;
      }
      const stats = buildCombatStats(s);
      for (const f of LIVE_STAT_FIELDS) {
        const v = (item as GearItem)[f as keyof GearItem];
        if (!v) continue;
        const key = FIELD_TO_STAT[f];
        expect(stats[key], `${item.id}.${f} must change CombatStats.${key}`).not.toEqual(baseStats[key]);
      }
    }
  });

  it('the dead fields are gone from the type and the data', () => {
    for (const g of GEAR) {
      expect('focusHpBonus' in g).toBe(false);
      expect('attackStaminaReduction' in g).toBe(false);
    }
  });
});

// --- data, saves, display -------------------------------------------------------------------------------------------------------

describe('the effects as data', () => {
  it('armor reflect: steel plate 20%, gilded 21%, dragon 23%, voidsteel 25%, abyssal 28%; tiers 1-2 none', () => {
    const r = (id: string) => getGear(id).reflect;
    expect([r('steel_plate'), r('gilded_aegis'), r('dragon_scale_armor'), r('voidsteel_plate'), r('abyssal_bulwark')]).toEqual([0.2, 0.21, 0.23, 0.25, 0.28]);
    for (const id of ['ragged_clothes', 'bronze_leather', 'iron_chainmail']) expect(r(id)).toBeUndefined();
  });

  it('uniques inherit burn and reflect from their forged twin', () => {
    expect(getGear('bonecrusher_maul').burn).toBe(true);
    // the greataxe is an AXE: it takes its twin's line (and no burn), not the sword's
    expect(getGear('overlord_greataxe').burn).toBeUndefined();
    expect(getGear('overlord_greataxe').line).toBe('axe');
    expect(getGear('bloodvein_plate').reflect).toBeGreaterThanOrEqual(0.2);
    expect(getGear('demon_fang_dagger').burn).toBeUndefined();
  });

  it('weapons: burn on the dragon line and above only', () => {
    expect(GEAR.filter((g) => g.burn && !g.unique).map((g) => g.id)).toEqual(['dragon_flameblade', 'voidsteel_blade', 'abyssal_greatblade']);
  });

  it('a save that holds a relic by template id loads unchanged (no migration needed)', () => {
    const s = withRelic({ ...defaultSave(), inventory: { ring_vitality: 1, amulet_swiftness: 2 } }, 'ring_vitality');
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.equipped.relic).toBe('ring_vitality');
    expect(back.inventory.ring_vitality).toBe(1);
    expect(back.inventory.amulet_swiftness).toBe(2);
    expect(buildCombatStats(back).hpRegenPct).toBe(getGear('ring_vitality').hpRegenPct);
  });

  it('forge / inventory stat lines are generated from the data', () => {
    const text = (id: string) => gearStatLines(getGear(id)).map((l) => l.text).join(' | ');
    expect(text('dragon_flameblade')).toMatch(/6.*3/);
    expect(text('steel_plate')).toMatch(/20/);
    expect(text('dragon_scale_armor')).toMatch(/23/);
    expect(text('ring_vitality')).toMatch(/0[.,]9/);
    expect(text('amulet_swiftness')).toMatch(/8/);
    expect(text('gilded_warblade')).not.toMatch(/\{/);
    for (const id of ['dragon_flameblade', 'steel_plate', 'ring_vitality', 'amulet_swiftness']) {
      expect(gearStatLines(getGear(id)).length, id).toBeGreaterThan(0);
      expect(text(id), id).not.toMatch(/\{|undefined/);
    }
  });
});

// --- balance rules of Rodada 4 ---------------------------------------------------------------------------------------------------

describe('balance of the effects (docs/ITEM_BALANCE_AUDIT.md section G)', () => {
  const lnP = (s: SaveData, floor: number, base: SaveData) => Math.log(duel(s, floor).P / duel(base, floor).P);

  for (const [lv, tk] of [[30, '3'], [60, '4g']] as [number, string][]) {
    it(`the three relics are worth within 1.5x of each other at level ${lv}, and each adds about 4-7% CP`, () => {
      const base = hero(tk, 4, { level: lv });
      const fl = repFloor(base);
      const cp0 = computeCP(base);
      const relics = GEAR.filter((g) => g.slot === 'relic' && g.recipe).map((r) => r.id); // the craftable ones; the boss relics are in contentPack2.test.ts
      const values = relics.map((id) => lnP(withRelic(base, id), fl, base));
      expect(Math.min(...values)).toBeGreaterThan(0);
      expect(Math.max(...values) / Math.min(...values)).toBeLessThanOrEqual(1.5);
      for (const id of relics) {
        const gain = computeCP(withRelic(base, id)) / cp0 - 1;
        expect(gain, `${id} +${(gain * 100).toFixed(1)}% CP`).toBeGreaterThanOrEqual(0.035);
        expect(gain, `${id} +${(gain * 100).toFixed(1)}% CP`).toBeLessThanOrEqual(0.075);
      }
    });
  }

  it('burn makes a weapon at most ~12% stronger than the same weapon without it (real value and CP)', () => {
    for (const [lv, tk, w] of [[50, '4d', 'dragon_flameblade'], [70, '5', 'voidsteel_blade'], [90, '6', 'abyssal_greatblade']] as [number, string, string][]) {
      const base = hero(tk, 4, { level: lv });
      const fl = repFloor(base);
      const item = getGear(w);
      const on = duel(base, fl);
      const cpOn = computeCP(base);
      item.burn = false;
      const off = duel(base, fl);
      const cpOff = computeCP(base);
      item.burn = true;
      expect(on.burnShare, w).toBeGreaterThan(0.02);
      expect(on.P / off.P - 1, w).toBeLessThanOrEqual(0.12);
      expect(cpOn / cpOff - 1, w).toBeLessThanOrEqual(0.12);
    }
  });

  it('the dragon line beats the gilded line at tier 4 by a clear margin', () => {
    for (const lv of [50, 60]) expect(computeCP(hero('4d', 0, { level: lv })) / computeCP(hero('4g', 0, { level: lv }))).toBeGreaterThan(1.1);
  });

  // ~10% when this was written; the orc retune of Rodada 6 (docs/BALANCE_CHANGES.md) put the tier 3 armor at 11.2 % on its floor (the orcs hit 8 % harder).
  it('reflect is at most ~10% of the damage dealt for a same-tier build on a same-tier floor', () => {
    for (const [lv, tk] of [[25, '3'], [50, '4g'], [50, '4d'], [70, '5'], [90, '6']] as [number, string][]) {
      const base = hero(tk, 4, { level: lv });
      const d = duel(base, repFloor(base));
      expect(d.reflectShare, `tier ${tk}`).toBeLessThanOrEqual(0.13); // 0.115 before the Rodada 7 orc retune moved the tier-3 reference floor
      expect(d.reflectShare, `tier ${tk}`).toBeGreaterThan(0.03);
    }
  });
});
