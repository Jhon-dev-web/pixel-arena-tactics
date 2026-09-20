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
  { id: 'common', nameKey: 'rar_common', statMult: 1, substatCount: 0, chance: 0.6 },
  { id: 'rare', nameKey: 'rar_rare', statMult: 1, substatCount: 1, chance: 0.25 },
  { id: 'epic', nameKey: 'rar_epic', statMult: 1.05, substatCount: 2, chance: 0.12 },
  { id: 'legendary', nameKey: 'rar_legendary', statMult: 1.15, substatCount: 3, chance: 0.03 },
];

interface SubstatDef {
  type: SubstatType;
  nameKey: string;
  min: number;
  max: number;
  perTier: number;
  isPercent: boolean;
}

export const SUBSTATS: SubstatDef[] = [
  { type: 'critRate', nameKey: 'sub_critRate', min: 2, max: 5, perTier: 0.5, isPercent: true },
  { type: 'critDamage', nameKey: 'sub_critDmg', min: 5, max: 12, perTier: 1, isPercent: true },
  { type: 'lifesteal', nameKey: 'sub_lifesteal', min: 1, max: 4, perTier: 0.3, isPercent: true },
  { type: 'defense', nameKey: 'sub_defense', min: 2, max: 6, perTier: 0.5, isPercent: true },
  { type: 'maxHp', nameKey: 'sub_maxHp', min: 15, max: 40, perTier: 5, isPercent: false },
  { type: 'goldBonus', nameKey: 'sub_gold', min: 3, max: 8, perTier: 0.5, isPercent: true },
];

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export function rarityDef(rarity: Rarity): RarityDef {
  return RARITIES.find((r) => r.id === rarity) ?? RARITIES[0];
}

export function rollRarity(): Rarity {
  const r = Math.random();
  let acc = 0;
  for (const def of RARITIES) {
    acc += def.chance;
    if (r < acc) return def.id;
  }
  return 'common';
}

export function rollSubstat(tier: number, exclude: SubstatType[] = []): Substat {
  const pool = SUBSTATS.filter((s) => !exclude.includes(s.type));
  const def = pool[randInt(0, pool.length - 1)];
  const value = def.min + randInt(0, def.max - def.min) + Math.round(def.perTier * tier);
  return { type: def.type, value };
}

export function rollSubstats(rarity: Rarity, tier: number): Substat[] {
  const count = rarityDef(rarity).substatCount;
  const subs: Substat[] = [];
  const used: SubstatType[] = [];
  for (let i = 0; i < count; i++) {
    const s = rollSubstat(tier, used);
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
