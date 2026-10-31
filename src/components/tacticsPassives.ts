import T from '../game/tunables';
import { SaveData, buildCombatStats } from '../game/engine';
import { bastionHp, regenAmount } from '../game/derivedStats';
import type { CombatStats, StrikeStats } from '../game/derivedStats';
import { durabilityFactor } from '../game/gear';
import { EXTRA_SLOTS, equippedSetItems, equippedSubstatTotals, resolveEquipped, viewDurability } from '../game/gearInstances';
import { affinityBonuses } from '../game/affinity';
import { setBonuses } from '../game/setBonuses';
import { HeroSkillId, saveSkillEffects } from '../game/heroSkills';
import type { LIVE_STAT_FIELDS } from '../game/gear';

// What the Taticas screen lists under "Passivas": every effect of the worn gear and of the hero that works BY ITSELF when a condition happens in the fight (a hit taken, a hit given, a tick of combat), as
// opposed to the abilities that the rotation fires on a cooldown (abilities.ts) and to the plain numbers (damage, life, resistance, crit...) that the Personagem screen already shows.
//
// Pure: it reads the hero's REAL combat stats (engine.ts buildCombatStats, the one both combat loops and the CP read) and says which effects are on and with what numbers. It never writes a number of
// its own: every figure in a line comes from the stats or from the tunable the engine itself reads. The words live in the locales (tactics.passive.<id>.*), which hold no numbers either.
//
// The lines mirror what the combat loops do (derivedStats.ts helpers, huntCombat.ts, BattleModal.tsx); where Hunting and the Dungeon differ, the text of the line says so (bastion, bossStance).

export type PassiveId =
  | 'burn' | 'reflect' | 'lifesteal' | 'regen' // gear: the weapon, the armor and shield, substats, relic, set bonus (and a skill adds to reflect and regen)
  | 'bleed' | 'crush' | 'devastating' | 'fury' | 'double' | 'block' | 'counter' | 'bossStance' | 'bastion'; // hero skills (heroSkills.ts)

// Where a line comes from, only the contributors that really add something to the number on the line.
export type PassiveFrom =
  | { kind: 'slot'; slot: 'weapon' | 'armor' | (typeof EXTRA_SLOTS)[number] }
  | { kind: 'relic' }
  | { kind: 'affix' } // the substats rolled on the worn pieces
  | { kind: 'set' } // a set bonus or the class affinity
  | { kind: 'skill'; id: HeroSkillId };

export interface PassiveLine {
  id: PassiveId;
  from: PassiveFrom[];
  // The numbers of the text, ready to print (percentages as 6 = 6 %, times in seconds), each rounded to one decimal at most.
  params: Record<string, number>;
  // The engine's own recharge for it, in ms, when it has one (the Fury flurry timer, the Last Bastion in Hunting). Absent = the engine has none and the text says what it does instead ("every hit taken").
  everyMs?: number;
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
const pct = (share: number): number => r1(share * 100); // 0.06 -> 6, 0.009 -> 0.9
const sec = (ms: number): number => r1(ms / 1000);

// ---- the classification the guards read ----------------------------------------------------------------------------------------------------------------
// Every field the engine reads in combat is either a plain number (shown on Personagem, not here) or an effect with a line here. These maps are TOTAL on purpose (a Record over the whole key list): a new gear field,
// a new CombatStats field or a new strike cannot be added without choosing one of the two, and passivesGuard.test.ts then proves that every choice of 'passive' really produces a line.
export type FieldKind = 'number' | PassiveId[];

export const GEAR_FIELD_KIND: Record<(typeof LIVE_STAT_FIELDS)[number], FieldKind> = {
  damage: 'number',
  critChance: 'number',
  burn: ['burn'],
  maxHp: 'number',
  resistance: 'number',
  reflect: ['reflect'],
  critMultBonus: 'number',
  hpRegenPct: ['regen'],
  attackSpeedBonus: 'number',
  damagePct: 'number',
  lifestealPct: ['lifesteal'],
  goldBonusPct: 'number',
};

// CombatStats (derivedStats.ts): 'number' covers the plain numbers and the economy ones (gold, XP, materials, drops), which are not fight events.
export const STATS_FIELD_KIND: Record<keyof CombatStats, FieldKind> = {
  maxHp: 'number',
  dmgBase: 'number',
  critChance: 'number',
  critMult: 'number',
  heroMs: 'number',
  agi: 'number',
  speedBonus: 'number',
  reduction: 'number',
  lifesteal: ['lifesteal'],
  burn: ['burn'],
  reflect: ['reflect'],
  hpRegenPct: ['regen'],
  goldBonus: 'number',
  xpBonus: 'number',
  bleed: ['bleed'],
  strikes: [], // each key of it is classified below
  block: ['block'],
  bastion: ['bastion'],
  bossReduction: ['bossStance'],
  skillGold: 'number',
  matMult: 'number',
  uniqueMult: 'number',
  bossLootMult: 'number',
  rotation: 'number', // the abilities: the other block of the screen
  cdScale: 'number',
};

export const STRIKE_FIELD_KIND: Record<keyof StrikeStats, FieldKind> = {
  crushEvery: ['crush', 'devastating'],
  crushBonus: ['crush'],
  devastating: ['devastating'],
  furyPct: ['fury'],
  counter: ['counter'],
  doubleChance: ['double'],
};

// ---- the lines -------------------------------------------------------------------------------------------------------------------------------------------

// Who adds to reflect and to regeneration, by the same terms buildCombatStats sums (the armor's, the extra slots', the skill's, the relic's, the set's).
function gearFrom(save: SaveData, field: 'reflect' | 'hpRegenPct', skillId: HeroSkillId, skillValue: number): PassiveFrom[] {
  const views = resolveEquipped(save);
  const out: PassiveFrom[] = [];
  const slots = field === 'reflect' ? (['armor', ...EXTRA_SLOTS] as const) : (['weapon', 'armor', ...EXTRA_SLOTS] as const);
  for (const slot of slots) {
    const v = views[slot]; // an extra slot with nothing worn is null
    if (!v) continue;
    const value = (v.item[field] ?? 0) * durabilityFactor(viewDurability(v));
    if (value > 0) out.push({ kind: 'slot', slot });
  }
  if (field === 'hpRegenPct') {
    if ((views.relic?.hpRegenPct ?? 0) > 0) out.push({ kind: 'relic' });
    if (setTotal(save, 'hpRegenPct') > 0) out.push({ kind: 'set' });
  }
  if (skillValue > 0) out.push({ kind: 'skill', id: skillId });
  return out;
}

// The set bonus and the class affinity add to the same totals (engine.ts buildCombatStats).
function setTotal(save: SaveData, key: 'hpRegenPct' | 'lifestealPct'): number {
  const items = equippedSetItems(save);
  return setBonuses(items).totals[key] + (save.noAffinity ? 0 : affinityBonuses(items).totals[key]);
}

export function tacticsPassives(save: SaveData): PassiveLine[] {
  const stats = buildCombatStats(save);
  const fx = saveSkillEffects(save);
  const st = stats.strikes;
  const H = T.heroSkills;
  const tick = sec(T.battle.effectTickMs);
  const out: PassiveLine[] = [];

  if (stats.burn) {
    out.push({
      id: 'burn',
      from: [{ kind: 'slot', slot: 'weapon' }],
      params: { pct: pct(T.battle.burnPctPerSec), tick, s: sec(T.battle.burnDurationMs), dmg: Math.max(1, Math.round(stats.dmgBase * T.battle.burnPctPerSec)) },
    });
  }
  if (stats.reflect > 0) {
    out.push({ id: 'reflect', from: gearFrom(save, 'reflect', 'g_thorns', fx.reflect), params: { pct: pct(stats.reflect) } });
  }
  if (stats.lifesteal > 0) {
    const from: PassiveFrom[] = [];
    if (equippedSubstatTotals(save).lifesteal > 0) from.push({ kind: 'affix' });
    if ((resolveEquipped(save).relic?.lifestealPct ?? 0) > 0) from.push({ kind: 'relic' });
    if (setTotal(save, 'lifestealPct') > 0) from.push({ kind: 'set' });
    out.push({ id: 'lifesteal', from, params: { pct: r1(stats.lifesteal) } });
  }
  if (stats.hpRegenPct > 0) {
    out.push({ id: 'regen', from: gearFrom(save, 'hpRegenPct', 'g_second_wind', fx.hpRegenPct), params: { hp: regenAmount(stats.maxHp, stats.hpRegenPct), pct: pct(stats.hpRegenPct), tick }, everyMs: T.battle.effectTickMs });
  }
  if (stats.bleed) {
    out.push({
      id: 'bleed',
      from: [{ kind: 'skill', id: 'w_bleed' }],
      params: { pct: pct(stats.bleed), tick, s: sec(H.bleedDurationMs), dmg: Math.max(1, Math.round(stats.dmgBase * stats.bleed)) },
    });
  }
  if (st?.crushEvery && st.crushBonus) {
    out.push({ id: 'crush', from: [{ kind: 'skill', id: 'w_heavy_blow' }], params: { every: st.crushEvery, pct: pct(st.crushBonus) } });
  }
  if (st?.crushEvery && st.devastating) {
    const k = Math.round(H.devastatingEvery);
    out.push({ id: 'devastating', from: [{ kind: 'skill', id: 'w_devastating_strike' }], params: { hits: st.crushEvery * k, k, mult: H.devastatingMult } });
  }
  if (st?.furyPct) {
    out.push({ id: 'fury', from: [{ kind: 'skill', id: 'w_fury' }], params: { hits: H.furyHits, pct: pct(st.furyPct), s: sec(H.furyEveryMs) }, everyMs: H.furyEveryMs });
  }
  if (st?.doubleChance) {
    out.push({ id: 'double', from: [{ kind: 'skill', id: 'h_light_step' }], params: { pct: pct(st.doubleChance), e: pct(H.doubleDmgPct) } });
  }
  if (stats.block) {
    out.push({ id: 'block', from: [{ kind: 'skill', id: 'g_block' }], params: { pct: pct(stats.block) } });
  }
  if (st?.counter && stats.block) {
    out.push({ id: 'counter', from: [{ kind: 'skill', id: 'g_block' }], params: { pct: pct(st.counter) } });
  }
  if (stats.bossReduction) {
    out.push({ id: 'bossStance', from: [{ kind: 'skill', id: 'g_firm_stance' }], params: { pct: pct(Math.min(0.9, stats.bossReduction)) } });
  }
  if (stats.bastion) {
    out.push({ id: 'bastion', from: [{ kind: 'skill', id: 'g_last_bastion' }], params: { hp: bastionHp(stats.maxHp), heal: pct(H.bastionHealPct), s: sec(H.bastionCooldownMs) }, everyMs: H.bastionCooldownMs });
  }
  return out;
}
