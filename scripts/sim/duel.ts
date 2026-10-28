// Shared helpers of the item audit (itemAudit.sim.ts) and of the balance tests (src/game/__tests__/itemBalance.test.ts): a hero built from
// one weapon + armor pair, and the closed-form duel margin used as the "real combat value" of a stat.
import { buildCombatStats, defaultSave, SaveData, xpToReachLevel } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { Rarity, Substat } from '../../src/game/rarity';
import type { GemId } from '../../src/game/gems';
import { dungeonEnemyKindForFloor, isDungeonBoss, isDungeonCheckpoint } from '../../src/game/dungeon';
import { getEnemyDef } from '../../src/game/enemies';
import { stageEnemyDmg, stageEnemyHp } from '../../src/game/waves';
import type { CombatStats } from '../../src/game/derivedStats';
import T from '../../src/game/tunables';
import { spendAttributePoints } from './driver';
import { SET_DEFS } from '../../src/game/setBonuses';
import { SET_FAMILIES } from '../../src/game/gear';

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
// Runs fn with every set bonus switched off (no threshold is reachable). The piece-balance measures (what ONE piece is worth, the power budget of the extra slots,
// the unique against its twin) are about the pieces; the set bonuses are a second layer on top of them and are measured on their own (setBonuses.test.ts).
export function withoutSetBonuses<T>(fn: () => T): T {
  const saved = SET_FAMILIES.map((f) => SET_DEFS[f].thresholds);
  for (const f of SET_FAMILIES) SET_DEFS[f].thresholds = [];
  try {
    return fn();
  } finally {
    SET_FAMILIES.forEach((f, i) => (SET_DEFS[f].thresholds = saved[i]));
  }
}
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
  // the weapon worn instead of the tier's sword (the axe line), and the gems socketed into it
  weapon?: string;
  wSockets?: GemId[];
}

// A level-appropriate hero wearing the weapon + armor pair of a tier at a refine level, attribute points spread 35/30/20/15.
export function hero(pairKey: string, refine: number, o: HeroOpts = {}): SaveData {
  const [swordId, a, lvl] = PAIRS[pairKey];
  const w = o.weapon ?? swordId;
  const level = o.level ?? lvl;
  let h: SaveData = { ...defaultSave(), xp: xpToReachLevel(level), highestDungeonFloor: 1 };
  const instances = { ...h.gearInstances };
  const equipped = { ...h.equipped };
  for (const [slot, tpl, subs] of [['weapon', w, o.wSubs], ['armor', a, o.aSubs]] as const) {
    const inst = createGearInstance(tpl, { id: `gi_${tpl}`, origin: 'craft', rarity: o.rarity ?? 'common', substats: subs ?? [], upgrade: refine, sockets: slot === 'weapon' ? o.wSockets : undefined });
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
// Hero skills (heroSkills.ts): bleed is a second burn, the Devastating Strike raises the average hit, Block removes a share of the enemy hits, Firm Stance cuts the
// hit on a boss / checkpoint floor (`boss`), and Last Bastion adds the heal to the pool in the share of fights T.advanced.cpBastionWeight says it is ready for.
// REVIEW IN PHASE 8: this closed-form model mirrors the CP and does NOT know the rotation of the equipment abilities (abilities.ts, phase 4): the balance pass would calibrate with it blind to them. Teach it the rotation (or
// measure with the real loops) before trusting its margins for a hero that has one.
export function duelVs(s: SaveData, enemyHp: number, enemyDmg: number, enemyMs: number, stats?: CombatStats, boss = false) {
  const c = stats ?? buildCombatStats(s);
  const cc = Math.max(0, Math.min(1, c.critChance));
  // Strikes: the average hit carries the Esmagador bonus (every devastatingEvery-th is a Devastador), the Duplo echo and the Contra-ataque after a block; the Furia flurry is a
  // flat extra damage per second.
  const st = c.strikes;
  let gain = 0;
  if (st?.crushEvery) {
    const d = T.heroSkills.devastatingEvery;
    const b = st.crushBonus ?? 0;
    gain += (st.devastating ? ((d - 1) * b + (T.heroSkills.devastatingMult - 1)) / d : b) / st.crushEvery;
  }
  gain += (st?.doubleChance ?? 0) * T.heroSkills.doubleDmgPct;
  const baseHit = c.dmgBase * (1 + cc * (c.critMult - 1));
  const blocksPerSec = ((c.block ?? 0) * 1000) / enemyMs;
  const counterPerSec = Math.min(blocksPerSec, 1000 / c.heroMs) * (st?.counter ?? 0) * baseHit;
  const flurry = ((c.dmgBase * (st?.furyPct ?? 0) * T.heroSkills.furyHits * 1000) / T.heroSkills.furyEveryMs) + counterPerSec;
  const direct = (baseHit * (1 + gain) * 1000) / c.heroMs + flurry;
  const taken = (enemyDmg / (1 + Math.max(0, c.reduction))) * (boss ? 1 - (c.bossReduction ?? 0) : 1) * (1 - (c.block ?? 0));
  const inc = (taken * 1000) / enemyMs;
  const reflectDps = inc * c.reflect;
  const burnPerSec = c.burn ? (c.dmgBase * T.battle.burnPctPerSec * 1000) / T.battle.effectTickMs : 0;
  const dotPerSec = burnPerSec + (c.bleed ? (c.dmgBase * c.bleed * 1000) / T.battle.effectTickMs : 0);
  let ttk = enemyHp / (direct + reflectDps);
  for (let i = 0; i < 4 && dotPerSec > 0; i++) ttk = enemyHp / (direct + reflectDps + dotPerSec * Math.max(0, 1 - 0.5 / ttk));
  const dps = enemyHp / ttk; // average damage per second including the effects
  const regenPerSec = (c.maxHp * c.hpRegenPct * 1000) / T.battle.effectTickMs;
  const net = inc - (direct * c.lifesteal) / 100 - regenPerSec;
  const pool = c.maxHp * (1 + (c.bastion ? T.advanced.cpBastionWeight * T.heroSkills.bastionHealPct : 0));
  const ttd = net <= 0 ? Infinity : pool / net;
  return { ttk, ttd, P: ttd / ttk, dps, hp: c.maxHp, direct, burnShare: dotPerSec > 0 ? (dps - direct - reflectDps) / dps : 0, reflectShare: reflectDps / dps };
}
export function duel(s: SaveData, floor: number, stats?: CombatStats) {
  const def = getEnemyDef(dungeonEnemyKindForFloor(floor));
  return duelVs(s, stageEnemyHp(def, floor), stageEnemyDmg(def, floor), def.atkSpeedMs, stats, isDungeonBoss(floor) || isDungeonCheckpoint(floor));
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
