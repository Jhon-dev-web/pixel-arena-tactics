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
  // Weapons (Zero to Hero)
  { id: 'wooden_club', slot: 'weapon', nameKey: 'wooden_club', descKey: 'wooden_club_d', cost: 0, tier: 0, damage: 0 },
  { id: 'rusty_dagger', slot: 'weapon', nameKey: 'rusty_dagger', descKey: 'rusty_dagger_d', cost: 40, tier: 1, damage: 6 },
  { id: 'iron_short_sword', slot: 'weapon', nameKey: 'iron_short_sword', descKey: 'iron_short_sword_d', cost: 120, tier: 2, damage: 15, critChance: 0.05 },
  { id: 'flaming_longsword', slot: 'weapon', nameKey: 'flaming_longsword', descKey: 'flaming_longsword_d', cost: 350, tier: 3, damage: 30, burn: true },
  // Armors (Zero to Hero)
  { id: 'ragged_clothes', slot: 'armor', nameKey: 'ragged_clothes', descKey: 'ragged_clothes_d', cost: 0, tier: 0, maxHp: 0 },
  { id: 'leather_tunic', slot: 'armor', nameKey: 'leather_tunic', descKey: 'leather_tunic_d', cost: 50, tier: 1, maxHp: 25 },
  { id: 'iron_chainmail', slot: 'armor', nameKey: 'iron_chainmail', descKey: 'iron_chainmail_d', cost: 130, tier: 2, maxHp: 60, resistance: 0.05 },
  { id: 'knight_full_armor', slot: 'armor', nameKey: 'knight_full_armor', descKey: 'knight_full_armor_d', cost: 350, tier: 3, maxHp: 120, reflect: 0.2 },
  // Relics
  { id: 'ring_vitality', slot: 'relic', nameKey: 'ring_vitality', descKey: 'ring_vitality_d', cost: 200, focusHpBonus: 15 },
  { id: 'amulet_swiftness', slot: 'relic', nameKey: 'amulet_swiftness', descKey: 'amulet_swiftness_d', cost: 250, attackStaminaReduction: 5 },
  { id: 'berserker_crest', slot: 'relic', nameKey: 'berserker_crest', descKey: 'berserker_crest_d', cost: 350, critMultBonus: 0.5 },
];

const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export const DEFAULT_OWNED = ['wooden_club', 'ragged_clothes'];

export const DEFAULT_EQUIPPED: EquippedGear = {
  weapon: 'wooden_club',
  armor: 'ragged_clothes',
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

export function sanitizeSaveGear(
  owned: string[],
  equipped: EquippedGear,
): { owned: string[]; equipped: EquippedGear } {
  const valid = new Set(GEAR.map((g) => g.id));
  const ownedSet = new Set(owned.filter((id) => valid.has(id)));
  DEFAULT_OWNED.forEach((id) => ownedSet.add(id));
  return {
    owned: [...ownedSet],
    equipped: {
      weapon: valid.has(equipped.weapon) ? equipped.weapon : DEFAULT_EQUIPPED.weapon,
      armor: valid.has(equipped.armor) ? equipped.armor : DEFAULT_EQUIPPED.armor,
      relic: equipped.relic && valid.has(equipped.relic) ? equipped.relic : null,
    },
  };
}
