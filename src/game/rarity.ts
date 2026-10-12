export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type SubstatType = 'critRate' | 'critDamage' | 'lifesteal' | 'defense' | 'maxHp' | 'goldBonus';

export interface Substat {
  type: SubstatType;
  value: number;
}

export interface RarityDef {
  id: Rarity;
  nameKey: string;
  statMult: number;
  substatCount: number;
  chance: number;
}

export const RARITIES: RarityDef[] = [
  { id: 'common', nameKey: 'rar_common', statMult: 1, substatCount: 0, chance: 0.63 },
  { id: 'rare', nameKey: 'rar_rare', statMult: 1.02, substatCount: 1, chance: 0.25 },
  { id: 'epic', nameKey: 'rar_epic', statMult: 1.06, substatCount: 2, chance: 0.1 },
  { id: 'legendary', nameKey: 'rar_legendary', statMult: 1.18, substatCount: 3, chance: 0.02 },
];

interface SubstatDef {
  type: SubstatType;
  nameKey: string;
  min: number;
  max: number;
  perTier: number;
  isPercent: boolean;
  // Optional explicit [min, max] for tier 1..6 (index tier - 1); replaces min/max/perTier. Used where the flat formula cannot keep the
  // substat worth about the same in combat at every tier (see docs/ITEM_BALANCE_AUDIT.md: maxHp is a flat number, lifesteal grows with
  // enemy HP, critDamage only pays once crit chance is high).
  ranges?: [number, number][];
  decimals?: number;
}

// Design rule (balance.test.ts R2): the median roll of every combat substat is worth about the same in real combat (ln of the duel margin
// at a representative floor, about +4.5 %) at every tier, so no stat is a trap and none is a must-have. goldBonus is the non-combat one.
export const SUBSTATS: SubstatDef[] = [
  { type: 'critRate', nameKey: 'sub_critRate', min: 2, max: 5, perTier: 0.5, isPercent: true },
  { type: 'critDamage', nameKey: 'sub_critDmg', min: 5, max: 12, perTier: 1, isPercent: true, ranges: [[60, 90], [45, 75], [30, 50], [25, 40], [20, 32], [16, 26]] },
  { type: 'lifesteal', nameKey: 'sub_lifesteal', min: 1, max: 4, perTier: 0.3, isPercent: true, decimals: 1, ranges: [[1.5, 2.5], [1, 1.4], [1.5, 2.3], [1, 1.8], [1, 2], [0.8, 1.2]] },
  { type: 'defense', nameKey: 'sub_defense', min: 2, max: 6, perTier: 0.5, isPercent: true },
  { type: 'maxHp', nameKey: 'sub_maxHp', min: 15, max: 40, perTier: 5, isPercent: false, ranges: [[5, 8], [10, 18], [20, 30], [30, 50], [45, 70], [55, 90]] },
  { type: 'goldBonus', nameKey: 'sub_gold', min: 2, max: 5, perTier: 0.25, isPercent: true },
];

// Total goldBonus of everything equipped can never pass this (percent): it only raises the Dungeon's gold.
export const GOLD_BONUS_CAP = 25;

// Every roll takes an optional RNG (default Math.random) so the Hunting simulation can roll a unique's rarity / substats from its own seeded stream.
export type Rng = () => number;
const randInt = (min: number, max: number, rng: Rng = Math.random) => Math.floor(rng() * (max - min + 1)) + min;

export function rarityDef(rarity: Rarity): RarityDef {
  return RARITIES.find((r) => r.id === rarity) ?? RARITIES[0];
}

export function rollRarity(rng: Rng = Math.random): Rarity {
  const r = rng();
  let acc = 0;
  for (const def of RARITIES) {
    acc += def.chance;
    if (r < acc) return def.id;
  }
  return 'common';
}

// The Blacksmith's Seal (season reward): a forge roll CONDITIONED on this rarity or better. The odds are the normal table's own weights restricted to the
// rarities from here up (epic 10 : legendary 2 = 83.3 % : 16.7 %), derived from RARITIES, never hard-coded.
export const FORGE_SEAL_MIN_RARITY: Rarity = 'epic';

export function rollRarityAtLeast(min: Rarity, rng: Rng = Math.random): Rarity {
  const from = Math.max(0, RARITIES.findIndex((r) => r.id === min));
  const pool = RARITIES.slice(from);
  const total = pool.reduce((sum, r) => sum + r.chance, 0);
  const r = rng() * total;
  let acc = 0;
  for (const def of pool) {
    acc += def.chance;
    if (r < acc) return def.id;
  }
  return pool[pool.length - 1].id;
}

const tierRange = (def: SubstatDef, tier: number): [number, number] | undefined =>
  def.ranges?.[Math.min(def.ranges.length, Math.max(1, Math.floor(tier) || 1)) - 1];

// One roll of a substat for a piece of the given tier.
export function rollSubstatValue(def: SubstatDef, tier: number, rng: Rng = Math.random): number {
  const range = tierRange(def, tier);
  if (!range) return def.min + randInt(0, def.max - def.min, rng) + Math.round(def.perTier * tier);
  const scale = Math.pow(10, def.decimals ?? 0);
  return (Math.round(range[0] * scale) + randInt(0, Math.round((range[1] - range[0]) * scale), rng)) / scale;
}

// The middle of the range a piece of that tier rolls in.
export function medianSubstatValue(def: SubstatDef, tier: number): number {
  const range = tierRange(def, tier);
  return range ? (range[0] + range[1]) / 2 : (def.min + def.max) / 2 + def.perTier * tier;
}

export function rollSubstat(tier: number, exclude: SubstatType[] = [], rng: Rng = Math.random): Substat {
  const pool = SUBSTATS.filter((s) => !exclude.includes(s.type));
  const def = pool[randInt(0, pool.length - 1, rng)];
  return { type: def.type, value: rollSubstatValue(def, tier, rng) };
}

// `extra` = additional guaranteed substat slots (a unique piece rolls one more than its rarity's count).
export function rollSubstats(rarity: Rarity, tier: number, extra = 0, rng: Rng = Math.random): Substat[] {
  const count = rarityDef(rarity).substatCount + extra;
  const subs: Substat[] = [];
  const used: SubstatType[] = [];
  for (let i = 0; i < count; i++) {
    const s = rollSubstat(tier, used, rng);
    used.push(s.type);
    subs.push(s);
  }
  return subs;
}

export function rarityStatMult(rarity: Rarity | undefined): number {
  return rarity ? rarityDef(rarity).statMult : 1;
}

export interface SubstatTotals {
  critRate: number;
  critDamage: number;
  lifesteal: number;
  defense: number;
  maxHp: number;
  goldBonus: number;
}

const emptyTotals = (): SubstatTotals => ({ critRate: 0, critDamage: 0, lifesteal: 0, defense: 0, maxHp: 0, goldBonus: 0 });

// Totals of one substat list (one gear instance's substats).
export function substatListTotals(list: Substat[] | undefined): SubstatTotals {
  const t = emptyTotals();
  for (const s of list ?? []) {
    if (s.type === 'critRate') t.critRate += s.value;
    else if (s.type === 'critDamage') t.critDamage += s.value;
    else if (s.type === 'lifesteal') t.lifesteal += s.value;
    else if (s.type === 'defense') t.defense += s.value;
    else if (s.type === 'maxHp') t.maxHp += s.value;
    else if (s.type === 'goldBonus') t.goldBonus += s.value;
  }
  return t;
}

export function addSubstatTotals(w: SubstatTotals, a: SubstatTotals): SubstatTotals {
  return {
    critRate: w.critRate + a.critRate,
    critDamage: w.critDamage + a.critDamage,
    lifesteal: w.lifesteal + a.lifesteal,
    defense: w.defense + a.defense,
    maxHp: w.maxHp + a.maxHp,
    goldBonus: w.goldBonus + a.goldBonus,
  };
}

export function substatLabel(sub: Substat): string {
  const def = SUBSTATS.find((s) => s.type === sub.type);
  if (!def) return '';
  const sign = def.isPercent ? '%' : '';
  return `${sub.value}${sign}`;
}

export function substatNameKey(type: SubstatType): string {
  return SUBSTATS.find((s) => s.type === type)?.nameKey ?? '';
}
