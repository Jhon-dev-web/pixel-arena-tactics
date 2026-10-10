// Shared helpers of the item audit (itemAudit.sim.ts) and of the balance tests (src/game/__tests__/itemBalance.test.ts): a hero built from
// one weapon + armor pair, and the closed-form duel margin used as the "real combat value" of a stat.
import { buildCombatStats, defaultSave, SaveData, xpToReachLevel } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { Rarity, Substat } from '../../src/game/rarity';
import { dungeonEnemyKindForFloor, isDungeonBoss, isDungeonCheckpoint } from '../../src/game/dungeon';
import { getEnemyDef } from '../../src/game/enemies';
import { stageEnemyDmg, stageEnemyHp } from '../../src/game/waves';
import T from '../../src/game/tunables';
import { spendAttributePoints } from './driver';

// Weapon + armor of each tier and the character level that can craft them. Tier 4 has two pairs (gilded / dragon).
export const PAIRS: Record<string, [string, string, number]> = {
  '1': ['bronze_dagger', 'bronze_leather', 1],
  '2': ['iron_short_sword', 'iron_chainmail', 10],
  '3': ['steel_greatsword', 'steel_plate', 25],
  '4g': ['gilded_warblade', 'gilded_aegis', 50],
  '4d': ['dragon_flameblade', 'dragon_scale_armor', 50],
  '5': ['voidsteel_blade', 'voidsteel_plate', 70],
  '6': ['abyssal_greatblade', 'abyssal_bulwark', 90],
};
export const MAIN_TIERS = ['1', '2', '3', '4g', '5', '6'];
export const tierNum = (k: string): number => Number(k[0]);

export interface HeroOpts {
  rarity?: Rarity;
  wSubs?: Substat[];
  aSubs?: Substat[];
  attrs?: { str: number; vit: number; agi: number; res: number };
  level?: number;
  // extra equipped instances (new slots): [slot, templateId, rarity, substats]
  extra?: [string, string, Rarity, Substat[]][];
}

// A level-appropriate hero wearing the weapon + armor pair of a tier at a refine level, attribute points spread 35/30/20/15.
export function hero(pairKey: string, refine: number, o: HeroOpts = {}): SaveData {
  const [w, a, lvl] = PAIRS[pairKey];
  const level = o.level ?? lvl;
  let h: SaveData = { ...defaultSave(), xp: xpToReachLevel(level), highestDungeonFloor: 1 };
  const instances = { ...h.gearInstances };
  const equipped = { ...h.equipped };
  for (const [slot, tpl, subs] of [['weapon', w, o.wSubs], ['armor', a, o.aSubs]] as const) {
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity: o.rarity ?? 'common', substats: subs ?? [], upgrade: refine });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  for (const [slot, tpl, rarity, subs] of o.extra ?? []) {
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity, substats: subs, upgrade: refine });
    instances[inst.id] = inst;
    (equipped as unknown as Record<string, string | null>)[slot] = inst.id;
  }
  h = { ...h, gearInstances: instances, equipped };
  h = spendAttributePoints(h);
  return o.attrs ? { ...h, ...o.attrs } : h;
}

// Duel margin P = (time the hero survives) / (time the hero needs to kill one enemy), closed form: expected crits, lifesteal, resistance,
// and the gear effects: burn (one tick of burnPctPerSec x the hit per second once lit, the first tick one second late, so a fight of T seconds
// pays about T - 0.5 ticks), reflect (a share of the damage the hero takes comes off the enemy) and regeneration (hpRegenPct of max HP per second).
// Continuous: the in-game integer rounding of the enemy hit is left out so a stat's value is not hidden by +-1 steps.
export function duelVs(s: SaveData, enemyHp: number, enemyDmg: number, enemyMs: number) {
  const c = buildCombatStats(s);
  const cc = Math.max(0, Math.min(1, c.critChance));
  const direct = ((c.dmgBase * (1 + cc * (c.critMult - 1))) * 1000) / c.heroMs;
  const inc = ((enemyDmg / (1 + Math.max(0, c.reduction))) * 1000) / enemyMs;
  const reflectDps = inc * c.reflect;
  const burnPerSec = c.burn ? (c.dmgBase * T.battle.burnPctPerSec * 1000) / T.battle.effectTickMs : 0;
  let ttk = enemyHp / (direct + reflectDps);
  for (let i = 0; i < 4 && burnPerSec > 0; i++) ttk = enemyHp / (direct + reflectDps + burnPerSec * Math.max(0, 1 - 0.5 / ttk));
  const dps = enemyHp / ttk; // average damage per second including the effects
  const regenPerSec = (c.maxHp * c.hpRegenPct * 1000) / T.battle.effectTickMs;
  const net = inc - (direct * c.lifesteal) / 100 - regenPerSec;
  const ttd = net <= 0 ? Infinity : c.maxHp / net;
  return { ttk, ttd, P: ttd / ttk, dps, hp: c.maxHp, direct, burnShare: burnPerSec > 0 ? (dps - direct - reflectDps) / dps : 0, reflectShare: reflectDps / dps };
}
export function duel(s: SaveData, floor: number) {
  const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
  return duelVs(s, stageEnemyHp(def, floor), stageEnemyDmg(def, floor), def.atkSpeedMs);
}
// Representative floor of a hero: the plain floor (not a checkpoint / boss) whose duel margin is closest to 1.5 (on a log scale), i.e. a fight the hero
// wins but not by a mile. Closest-to-1.5 instead of "highest floor with P >= 1.25" so the choice survives the cliff between two biomes.
export function repFloor(s: SaveData): number {
  let best = 1;
  let bestGap = Infinity;
  for (let f = 1; f <= 100; f++) {
    if (isDungeonCheckpoint(f) || isDungeonBoss(f)) continue;
    const gap = Math.abs(Math.log(duel(s, f).P / 1.5));
    if (gap < bestGap) {
      bestGap = gap;
      best = f;
    }
  }
  return best;
}
export function huntEnemyAt(zone: { baseEnemyHp: number; baseEnemyDmg: number; shallowEnemyHp?: number; shallowEnemyDmg?: number }, sub = 1) {
  return {
    hp: (zone.shallowEnemyHp ?? zone.baseEnemyHp) * (1 + T.hunting.subLevelHpGrowth * (sub - 1)),
    dmg: (zone.shallowEnemyDmg ?? zone.baseEnemyDmg) * (1 + T.hunting.subLevelDmgGrowth * (sub - 1)),
  };
}
