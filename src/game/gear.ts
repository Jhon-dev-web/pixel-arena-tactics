export type GearSlot = 'weapon' | 'armor' | 'relic';

export interface GearItem {
  id: string;
  slot: GearSlot;
  nameKey: string;
  descKey: string;
  cost: number;
  tier?: number;
  damage?: number;
  critChance?: number;
  burn?: boolean;
  maxHp?: number;
  resistance?: number;
  reflect?: number;
  focusHpBonus?: number;
  attackStaminaReduction?: number;
  critMultBonus?: number;
}

export interface EquippedGear {
  weapon: string;
  armor: string;
  relic: string | null;
}

export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'relic'];

export const GEAR: GearItem[] = [
  // Weapons
  { id: 'iron_longsword', slot: 'weapon', nameKey: 'iron_longsword', descKey: 'iron_longsword_d', cost: 0, tier: 1, damage: 5 },
  { id: 'steel_broadsword', slot: 'weapon', nameKey: 'steel_broadsword', descKey: 'steel_broadsword_d', cost: 150, tier: 2, damage: 15, critChance: 0.05 },
  { id: 'dragon_flameblade', slot: 'weapon', nameKey: 'dragon_flameblade', descKey: 'dragon_flameblade_d', cost: 400, tier: 3, damage: 30, burn: true },
  // Armor
  { id: 'soldier_cuirass', slot: 'armor', nameKey: 'soldier_cuirass', descKey: 'soldier_cuirass_d', cost: 0, tier: 1, maxHp: 20 },
  { id: 'knights_plate', slot: 'armor', nameKey: 'knights_plate', descKey: 'knights_plate_d', cost: 150, tier: 2, maxHp: 50, resistance: 0.05 },
  { id: 'aegis_titan_armor', slot: 'armor', nameKey: 'aegis_titan_armor', descKey: 'aegis_titan_armor_d', cost: 400, tier: 3, maxHp: 100, reflect: 0.2 },
  // Relics
  { id: 'ring_vitality', slot: 'relic', nameKey: 'ring_vitality', descKey: 'ring_vitality_d', cost: 200, focusHpBonus: 15 },
  { id: 'amulet_swiftness', slot: 'relic', nameKey: 'amulet_swiftness', descKey: 'amulet_swiftness_d', cost: 250, attackStaminaReduction: 5 },
  { id: 'berserker_crest', slot: 'relic', nameKey: 'berserker_crest', descKey: 'berserker_crest_d', cost: 350, critMultBonus: 0.5 },
];

const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export const DEFAULT_OWNED = ['iron_longsword', 'soldier_cuirass'];

export const DEFAULT_EQUIPPED: EquippedGear = {
  weapon: 'iron_longsword',
  armor: 'soldier_cuirass',
  relic: null,
};

export function getGear(id: string): GearItem {
  return GEAR_BY_ID[id];
}

export function gearBySlot(slot: GearSlot): GearItem[] {
  return GEAR.filter((g) => g.slot === slot);
}

export function getEquipped(equipped: EquippedGear) {
  return {
    weapon: getGear(equipped.weapon),
    armor: getGear(equipped.armor),
    relic: equipped.relic ? getGear(equipped.relic) : null,
  };
}
