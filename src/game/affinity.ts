import { ArmorWeight, GearItem, weaponWeight } from './gear';
import { SET_EFFECT_KEYS, SetEffect, SetEffectTotals, emptySetTotals } from './setBonuses';
import T from './tunables';

// Class affinity (classes reform, phase 6, docs/CLASSES_E_EQUIPAMENTOS.md 2.3): "you are what you wear". It answers a different question than the set bonus (same WEIGHT of armor, any tier, where the set
// asks for the same TIER) but it is NOT a second machine: it returns the very SetEffect type setBonuses.ts defines, and engine.ts buildCombatStats adds its totals into the same set totals, so Hunting, the Dungeon,
// the CP and the simulated player all read it through the numbers they already read. Pure function of the worn templates: nothing is stored in the save.
//
// The class is a REFLECTION of the gear, never an attribute of the hero: nothing in the game writes "your class is X". The words (components/AffinitySeal.tsx) say so.

export type AffinityWeight = 'plate' | ArmorWeight;
export type AffinityClass = 'warrior' | 'archer' | 'mage';
export const AFFINITY_WEIGHTS: AffinityWeight[] = ['plate', 'leather', 'cloth'];
export const CLASS_OF_WEIGHT: Record<AffinityWeight, AffinityClass> = { plate: 'warrior', leather: 'archer', cloth: 'mage' };

// The five slots that carry a weight; the ring and the relic do not (the weapon is read apart, for its class).
const WEIGHT_SLOTS = new Set(['armor', 'helmet', 'gloves', 'boots', 'shield']);
export const AFFINITY_THREE = 3;
export const AFFINITY_FIVE = 5;

// The three steps of a weight, read from the tunables on every call so a retune takes effect at once. `three` and `five` are each the WHOLE bonus at that count (the five-piece step replaces the three-piece
// one); `weapon` is what the matching weapon adds on top of the five.
export interface AffinityDef {
  three: SetEffect;
  five: SetEffect;
  weapon: SetEffect;
}
export function affinityDefs(): Record<AffinityWeight, AffinityDef> {
  const a = T.affinity;
  return {
    plate: { three: { resistance: a.warriorResist3 }, five: { resistance: a.warriorResist5, maxHpPct: a.warriorHp5 }, weapon: { maxHpPct: a.warriorHpClass } },
    leather: { three: { attackSpeedBonus: a.archerSpeed3 }, five: { attackSpeedBonus: a.archerSpeed5, critMultBonus: a.archerCrit5 }, weapon: { attackSpeedBonus: a.archerSpeedClass } },
    cloth: { three: { critMultBonus: a.mageCrit3 }, five: { critMultBonus: a.mageCrit5, hpRegenPct: a.mageRegen5 }, weapon: { hpRegenPct: a.mageRegenClass } },
  };
}

export interface AffinityBonuses {
  counts: Record<AffinityWeight, number>; // worn weight pieces of each weight (of the five slots)
  weapon: AffinityWeight | null; // the weight of the worn weapon, null with no crafted weapon
  weight: AffinityWeight | null; // the leading weight (the one with the most pieces, at least one), null with no crafted weight piece
  pieces: number; // how many pieces the leading weight has
  step: 0 | 3 | 5; // the count reached: 0 none, 3 small bonus, 5 full bonus
  classActive: boolean; // 5 pieces AND the weapon of the same weight: the class bonus
  effects: SetEffect[]; // the effects in force (the step, plus the weapon step when the class is active)
  totals: SetEffectTotals;
}

// Plate is the ABSENCE of a weight and the sword the ABSENCE of a line (gear.ts), so both read as 'plate' here. Only crafted pieces count (setFamily is set for tier 1 and up), like the set families: the
// starter gear and the relic are nothing.
const counts = (g: GearItem): boolean => g.setFamily !== undefined;

export function affinityBonuses(equipped: readonly (GearItem | null | undefined)[]): AffinityBonuses {
  const per: Record<AffinityWeight, number> = { plate: 0, leather: 0, cloth: 0 };
  let weapon: AffinityWeight | null = null;
  for (const item of equipped) {
    if (!item || !counts(item)) continue;
    if (item.slot === 'weapon') weapon = weaponWeight(item) ?? 'plate';
    else if (WEIGHT_SLOTS.has(item.slot)) per[item.weight ?? 'plate']++;
  }
  // Five slots, so at most one weight can reach three pieces; on a tie below that the first in AFFINITY_WEIGHTS leads (plate, leather, cloth).
  let weight: AffinityWeight | null = null;
  for (const w of AFFINITY_WEIGHTS) if (per[w] > 0 && (weight === null || per[w] > per[weight])) weight = w;
  const pieces = weight ? per[weight] : 0;
  const step: 0 | 3 | 5 = pieces >= AFFINITY_FIVE ? 5 : pieces >= AFFINITY_THREE ? 3 : 0;
  const classActive = step === 5 && weapon === weight;
  const effects: SetEffect[] = [];
  const totals = emptySetTotals();
  if (weight && step > 0) {
    const def = affinityDefs()[weight];
    effects.push(step === 5 ? def.five : def.three);
    if (classActive) effects.push(def.weapon);
    for (const e of effects) for (const k of SET_EFFECT_KEYS) totals[k] += e[k] ?? 0;
  }
  return { counts: per, weapon, weight, pieces, step, classActive, effects, totals };
}

// What the seal on the Character screen shows: where the leading weight stands and what the next step is.
export interface AffinityView {
  weight: AffinityWeight;
  cls: AffinityClass;
  pieces: number;
  step: 0 | 3 | 5;
  classActive: boolean;
  now: SetEffect[];
  next: { kind: 'three' | 'five' | 'weapon'; missing: number; effect: SetEffect } | null;
}

export function affinityView(equipped: readonly (GearItem | null | undefined)[]): AffinityView | null {
  const a = affinityBonuses(equipped);
  if (!a.weight) return null;
  const def = affinityDefs()[a.weight];
  let next: AffinityView['next'] = null;
  if (a.step === 0) next = { kind: 'three', missing: AFFINITY_THREE - a.pieces, effect: def.three };
  else if (a.step === 3) next = { kind: 'five', missing: AFFINITY_FIVE - a.pieces, effect: def.five };
  else if (!a.classActive) next = { kind: 'weapon', missing: 1, effect: def.weapon };
  // The step and the weapon step can name the SAME stat (leather: attack speed in both): the seal shows ONE effect with the keys summed, never the same stat twice.
  const merged: SetEffect = {};
  for (const k of SET_EFFECT_KEYS) if (a.totals[k] !== 0) merged[k] = a.totals[k];
  const now = Object.keys(merged).length > 0 ? [merged] : [];
  return { weight: a.weight, cls: CLASS_OF_WEIGHT[a.weight], pieces: a.pieces, step: a.step, classActive: a.classActive, now, next };
}
