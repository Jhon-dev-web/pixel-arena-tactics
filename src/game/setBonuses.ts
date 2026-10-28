import { GearItem, SET_FAMILIES, SetFamily, setFamiliesOf } from './gear';

// Set bonuses for the crafted tier families (docs/BALANCE_CHANGES.md, "Conjuntos"). Wearing 3 / 5 pieces of one family over the seven instanced slots
// (weapon of either line, armor, helmet, gloves, boots, ring, shield; the relic slot does not count) grants that family's first / second bonus. A unique counts as
// the family of its twin, a dragon piece counts for the dragon AND the gilded family, and mixed sets (3 + 3, 3 + 4...) are legal: every family is counted on its own and
// every reached bonus applies.
//
// Every effect is a stat the combat already has, so no new mechanic: engine.ts buildCombatStats adds `totals` to the same numbers the relic and the gear feed, which
// is why Hunting, the Dungeon, the CP and the simulated player all see it. Pure function of the worn templates: nothing is stored in the save, so an old save simply
// gets the bonus of whatever it already wears.

// One bonus. Same units as the item fields it adds to (gear.ts): fractions for the speed / crit damage / resistance / regeneration / final damage, whole
// percents for lifesteal and gold (3 = 3 %), the way the boss relics carry them.
export interface SetEffect {
  attackSpeedBonus?: number; // +4 % attacks per second, through the same interval derivation as the relic's (heroAttackIntervalMs)
  critMultBonus?: number; // +10 % crit damage (0.10 on top of the 1.5 base)
  resistance?: number; // added to the raw resistance sum (applyDamageReduction), so +0.04 is a bit under 4 % less damage taken
  hpRegenPct?: number; // max-HP share regenerated per second of combat
  damagePct?: number; // final damage, a share of the hit after STR (like the Warchief Totem)
  lifestealPct?: number; // percent of the damage dealt healed per hit
  goldBonusPct?: number; // percent extra Gold, inside the same 25 % cap as the substats
  maxHpPct?: number; // share of the whole max HP pool (like Thick Skin), added by the class affinity (affinity.ts); no tier family carries it
}
export type SetEffectKey = keyof SetEffect;
export type SetEffectTotals = Record<SetEffectKey, number>;
export const SET_EFFECT_KEYS: SetEffectKey[] = ['attackSpeedBonus', 'critMultBonus', 'resistance', 'hpRegenPct', 'damagePct', 'lifestealPct', 'goldBonusPct', 'maxHpPct'];

export interface SetDef {
  family: SetFamily;
  // Pieces needed for each bonus, ascending. Six families have 3 and 5; dragon only has a weapon and an armor, so its single bonus is at 2.
  thresholds: number[];
  effects: SetEffect[];
}

// Small and themed, growing with the tier: about +4-6 % of one stat at the first threshold, a second stat of the same size at the second; the last tiers a bit larger.
export const SET_DEFS: Record<SetFamily, SetDef> = {
  bronze: { family: 'bronze', thresholds: [3, 5], effects: [{ goldBonusPct: 5 }, { critMultBonus: 0.05 }] },
  iron: { family: 'iron', thresholds: [3, 5], effects: [{ resistance: 0.04 }, { hpRegenPct: 0.003 }] },
  steel: { family: 'steel', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.04 }, { critMultBonus: 0.1 }] },
  gilded: { family: 'gilded', thresholds: [3, 5], effects: [{ goldBonusPct: 8 }, { damagePct: 0.05 }] },
  dragon: { family: 'dragon', thresholds: [2], effects: [{ lifestealPct: 2 }] },
  voidsteel: { family: 'voidsteel', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.06 }, { critMultBonus: 0.15 }] },
  abyssal: { family: 'abyssal', thresholds: [3, 5], effects: [{ damagePct: 0.07 }, { attackSpeedBonus: 0.06 }] },
  // The six leather families (classes reform, phase 2a): the archer's themes, attack speed and crit damage, the same size as the plate ones of their tier, the last tiers a bit larger.
  hide: { family: 'hide', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.04 }, { critMultBonus: 0.05 }] },
  scout: { family: 'scout', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.04 }, { critMultBonus: 0.06 }] },
  ranger: { family: 'ranger', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.04 }, { critMultBonus: 0.1 }] },
  hunter: { family: 'hunter', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.05 }, { critMultBonus: 0.1 }] },
  nightstalker: { family: 'nightstalker', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.06 }, { critMultBonus: 0.15 }] },
  abyssalhide: { family: 'abyssalhide', thresholds: [3, 5], effects: [{ attackSpeedBonus: 0.07 }, { critMultBonus: 0.18 }] },
  // The six cloth families (classes reform, phase 2b): the mage's themes, regeneration and crit damage, the same size as the plate ones of their tier, the last tiers a bit larger.
  linen: { family: 'linen', thresholds: [3, 5], effects: [{ hpRegenPct: 0.002 }, { critMultBonus: 0.05 }] },
  homespun: { family: 'homespun', thresholds: [3, 5], effects: [{ hpRegenPct: 0.002 }, { critMultBonus: 0.06 }] },
  silk: { family: 'silk', thresholds: [3, 5], effects: [{ hpRegenPct: 0.003 }, { critMultBonus: 0.1 }] },
  arcane: { family: 'arcane', thresholds: [3, 5], effects: [{ hpRegenPct: 0.003 }, { critMultBonus: 0.1 }] },
  lunar: { family: 'lunar', thresholds: [3, 5], effects: [{ hpRegenPct: 0.004 }, { critMultBonus: 0.15 }] },
  voidweave: { family: 'voidweave', thresholds: [3, 5], effects: [{ hpRegenPct: 0.004 }, { critMultBonus: 0.18 }] },
};

export interface ActiveSetBonus {
  family: SetFamily;
  pieces: number; // the threshold that was reached
  effect: SetEffect;
}

export interface SetBonuses {
  counts: Record<SetFamily, number>;
  active: ActiveSetBonus[];
  totals: SetEffectTotals;
}

export const emptySetTotals = (): SetEffectTotals => ({ attackSpeedBonus: 0, critMultBonus: 0, resistance: 0, hpRegenPct: 0, damagePct: 0, lifestealPct: 0, goldBonusPct: 0, maxHpPct: 0 });

// How many of the worn pieces belong to each family. Empty slots (null / undefined) and pieces without a family (starters, relics) count for none.
export function setCounts(equipped: readonly (GearItem | null | undefined)[]): Record<SetFamily, number> {
  const counts = Object.fromEntries(SET_FAMILIES.map((f) => [f, 0])) as Record<SetFamily, number>;
  for (const item of equipped) for (const f of setFamiliesOf(item)) counts[f]++;
  return counts;
}

export function setBonuses(equipped: readonly (GearItem | null | undefined)[]): SetBonuses {
  const counts = setCounts(equipped);
  const active: ActiveSetBonus[] = [];
  const totals = emptySetTotals();
  for (const family of SET_FAMILIES) {
    const def = SET_DEFS[family];
    def.thresholds.forEach((pieces, i) => {
      if (counts[family] < pieces) return;
      active.push({ family, pieces, effect: def.effects[i] });
      for (const k of SET_EFFECT_KEYS) totals[k] += def.effects[i][k] ?? 0;
    });
  }
  return { counts, active, totals };
}

// What the UI shows for one family: each threshold with its bonus and whether the worn pieces reach it.
export interface SetFamilyView {
  family: SetFamily;
  count: number;
  max: number; // the highest threshold
  steps: { pieces: number; effect: SetEffect; active: boolean }[];
}

export function setFamilyView(family: SetFamily, count: number): SetFamilyView {
  const def = SET_DEFS[family];
  return {
    family,
    count,
    max: def.thresholds[def.thresholds.length - 1],
    steps: def.thresholds.map((pieces, i) => ({ pieces, effect: def.effects[i], active: count >= pieces })),
  };
}

// The families to list for the worn pieces: every family with at least one piece, in tier order. The panel shows the ones that have a bonus active or are one
// piece (or two, for the first step) away from one and mutes the rest.
export function wornSetViews(equipped: readonly (GearItem | null | undefined)[]): SetFamilyView[] {
  const counts = setCounts(equipped);
  return SET_FAMILIES.filter((f) => counts[f] > 0).map((f) => setFamilyView(f, counts[f]));
}
