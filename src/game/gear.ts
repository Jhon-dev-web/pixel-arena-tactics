import { MaterialId } from './materials';
import Assets from '../assets.json';

export type GearSlot = 'weapon' | 'armor' | 'relic';

export interface Recipe {
  materials?: Partial<Record<MaterialId, number>>;
  items?: Record<string, number>;
  shards?: number;
}

export interface GearItem {
  id: string;
  slot: GearSlot;
  nameKey: string;
  descKey: string;
  materialKey?: string;
  iconUrl?: string;
  iconSheet?: boolean;
  cost: number;
  recipe?: Recipe;
  tier?: number;
  damage?: number;
  critChance?: number;
  burn?: boolean;
  maxHp?: number;
  resistance?: number;
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
  // Weapons (Tier 0-4) — hierarchical crafting
  { id: 'wooden_club', slot: 'weapon', nameKey: 'wooden_club', descKey: 'wooden_club_d', materialKey: 'material_wood', iconUrl: Assets.weapons.club.url, cost: 0, tier: 0, damage: 0 },
  { id: 'bronze_dagger', slot: 'weapon', nameKey: 'bronze_dagger', descKey: 'bronze_dagger_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.dagger.url, cost: 40, tier: 1, damage: 12, critChance: 0.03, recipe: { materials: { iron: 2, leather: 1 } } },
  { id: 'iron_short_sword', slot: 'weapon', nameKey: 'iron_short_sword', descKey: 'iron_short_sword_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.sword_iron.url, cost: 120, tier: 2, damage: 30, critChance: 0.06, recipe: { items: { bronze_dagger: 2 }, materials: { iron: 3 } } },
  { id: 'steel_greatsword', slot: 'weapon', nameKey: 'steel_greatsword', descKey: 'steel_greatsword_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.sword_steel.url, cost: 300, tier: 3, damage: 65, critChance: 0.1, recipe: { items: { iron_short_sword: 2 }, materials: { steel: 4, essence: 2 } } },
  { id: 'dragon_flameblade', slot: 'weapon', nameKey: 'dragon_flameblade', descKey: 'dragon_flameblade_d', materialKey: 'material_dragon', iconUrl: Assets.gear_icons.sword_dragon.url, cost: 1000, tier: 4, damage: 120, critChance: 0.18, burn: true, recipe: { items: { steel_greatsword: 1 }, materials: { dragon_scales: 3 }, shards: 5 } },
  // Armors (Tier 0-4) — hierarchical crafting
  { id: 'ragged_clothes', slot: 'armor', nameKey: 'ragged_clothes', descKey: 'ragged_clothes_d', materialKey: 'material_cloth', iconUrl: Assets.spritesheets.peasant.url, iconSheet: true, cost: 0, tier: 0, maxHp: 0 },
  { id: 'bronze_leather', slot: 'armor', nameKey: 'bronze_leather', descKey: 'bronze_leather_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.armor_leather.url, cost: 50, tier: 1, maxHp: 40, resistance: 0.03, recipe: { materials: { iron: 2, leather: 3 } } },
  { id: 'iron_chainmail', slot: 'armor', nameKey: 'iron_chainmail', descKey: 'iron_chainmail_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.armor_iron.url, cost: 130, tier: 2, maxHp: 90, resistance: 0.06, recipe: { items: { bronze_leather: 2 }, materials: { iron: 3 } } },
  { id: 'steel_plate', slot: 'armor', nameKey: 'steel_plate', descKey: 'steel_plate_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.armor_steel.url, cost: 350, tier: 3, maxHp: 160, resistance: 0.1, recipe: { items: { iron_chainmail: 2 }, materials: { steel: 4, essence: 2 } } },
  { id: 'dragon_scale_armor', slot: 'armor', nameKey: 'dragon_scale_armor', descKey: 'dragon_scale_armor_d', materialKey: 'material_dragon', iconUrl: Assets.gear_icons.armor_dragon.url, cost: 1000, tier: 4, maxHp: 260, resistance: 0.15, recipe: { items: { steel_plate: 1 }, materials: { dragon_scales: 3 }, shards: 5 } },
  // Relics
  { id: 'ring_vitality', slot: 'relic', nameKey: 'ring_vitality', descKey: 'ring_vitality_d', cost: 200, focusHpBonus: 15, recipe: { materials: { essence: 3 } } },
  { id: 'amulet_swiftness', slot: 'relic', nameKey: 'amulet_swiftness', descKey: 'amulet_swiftness_d', cost: 250, attackStaminaReduction: 5, recipe: { materials: { essence: 3 } } },
  { id: 'berserker_crest', slot: 'relic', nameKey: 'berserker_crest', descKey: 'berserker_crest_d', cost: 350, critMultBonus: 0.5, recipe: { materials: { essence: 5 } } },
];

const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export const DEFAULT_INVENTORY: Record<string, number> = { wooden_club: 1, ragged_clothes: 1 };

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

export function sanitizeSaveInventory(
  inventory: Record<string, number> | undefined,
  equipped: EquippedGear,
): { inventory: Record<string, number>; equipped: EquippedGear } {
  const valid = new Set(GEAR.map((g) => g.id));
  const inv: Record<string, number> = {};
  for (const [id, qty] of Object.entries(inventory ?? {})) {
    if (valid.has(id) && qty > 0) inv[id] = Math.floor(qty);
  }
  for (const [id, qty] of Object.entries(DEFAULT_INVENTORY)) {
    if (!(id in inv)) inv[id] = qty;
  }
  return {
    inventory: inv,
    equipped: {
      weapon: valid.has(equipped.weapon) ? equipped.weapon : DEFAULT_EQUIPPED.weapon,
      armor: valid.has(equipped.armor) ? equipped.armor : DEFAULT_EQUIPPED.armor,
      relic: equipped.relic && valid.has(equipped.relic) ? equipped.relic : null,
    },
  };
}

// --- Refinement (+0 .. +8) ---
export const MAX_REFINE = 8;

export function refineLevel(upgrades: Record<string, number> | undefined, itemId: string): number {
  return Math.max(0, Math.min(MAX_REFINE, upgrades?.[itemId] ?? 0));
}

export function effectiveDamage(item: GearItem, level: number): number {
  return Math.round((item.damage ?? 0) * (1 + 0.1 * level));
}

export function effectiveMaxHp(item: GearItem, level: number): number {
  return Math.round((item.maxHp ?? 0) * (1 + 0.1 * level));
}

export function effectiveCrit(item: GearItem, level: number): number {
  return (item.critChance ?? 0) + 0.005 * level;
}

export function effectiveResistance(item: GearItem, level: number): number {
  return (item.resistance ?? 0) + 0.005 * level;
}

export function tierMaterial(tier: number): MaterialId {
  if (tier <= 2) return 'iron';
  if (tier === 3) return 'steel';
  return 'dragon_scales';
}

export function gearSellValue(item: GearItem): number {
  return Math.max(0, Math.floor((item.cost ?? 0) * 0.4));
}

// --- Durability ---
export const MAX_DURABILITY = 100;
export const DURABILITY_LOSS_PER_STAGE = 2;

export function durabilityFactor(durability: number): number {
  if (durability <= 0) return 0.4;
  if (durability < 30) return 0.75;
  return 1;
}

export function repairCost(tier: number): number {
  return 20 + tier * 25;
}

export interface UpgradeCost {
  gold: number;
  materials?: Partial<Record<MaterialId, number>>;
  shards?: number;
}

export function upgradeCost(item: GearItem, level: number): UpgradeCost {
  const mat = tierMaterial(item.tier ?? 1);
  if (level < 3) return { gold: 50 * (level + 1) };
  if (level < 6) return { gold: 150 * (level + 1), materials: { [mat]: 2 } };
  return { gold: 300 * (level + 1), materials: { [mat]: 3 }, shards: 2 };
}

export function upgradeChance(level: number): number {
  if (level < 3) return 1;
  if (level === 3) return 0.8;
  if (level === 4) return 0.7;
  if (level === 5) return 0.6;
  if (level === 6) return 0.45;
  return 0.3;
}
