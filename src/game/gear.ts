import { MaterialId } from './materials';
import { GemId } from './gems';
import Assets from '../assets.json';

export type GearSlot = 'weapon' | 'shield' | 'armor' | 'helmet' | 'pickaxe' | 'axe' | 'rod' | 'relic';

export interface Recipe {
  materials?: Partial<Record<MaterialId, number>>;
  items?: Record<string, number>;
  gems?: Partial<Record<GemId, number>>;
  shards?: number;
  requiredLevel?: number;
}

export interface GearItem {
  id: string;
  slot: GearSlot;
  nameKey: string;
  descKey: string;
  materialKey?: string;
  iconUrl?: string;
  iconSheet?: boolean;
  icon?: string;
  cost: number;
  recipe?: Recipe;
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
  miningPower?: number;
  woodcuttingPower?: number;
  fishingPower?: number;
}

export interface EquippedGear {
  weapon: string;
  armor: string;
  relic: string | null;
  shield: string | null;
  helmet: string | null;
  pickaxe: string | null;
  axe: string | null;
  rod: string | null;
}

export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'relic', 'pickaxe'];

export const GEAR: GearItem[] = [
  // Weapons (Tier 0-4) — hierarchical crafting
  { id: 'wooden_club', slot: 'weapon', nameKey: 'wooden_club', descKey: 'wooden_club_d', materialKey: 'material_wood', iconUrl: Assets.weapons.club.url, cost: 0, tier: 0, damage: 0 },
  { id: 'bronze_dagger', slot: 'weapon', nameKey: 'bronze_dagger', descKey: 'bronze_dagger_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.dagger.url, cost: 40, tier: 1, damage: 12, critChance: 0.03, recipe: { materials: { copper: 3, leather: 1 } } },
  { id: 'iron_short_sword', slot: 'weapon', nameKey: 'iron_short_sword', descKey: 'iron_short_sword_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.sword_iron.url, cost: 120, tier: 2, damage: 30, critChance: 0.06, recipe: { items: { bronze_dagger: 2 }, materials: { iron: 3, leather_scrap: 2 }, requiredLevel: 10 } },
  { id: 'steel_greatsword', slot: 'weapon', nameKey: 'steel_greatsword', descKey: 'steel_greatsword_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.sword_steel.url, cost: 300, tier: 3, damage: 65, critChance: 0.1, recipe: { items: { iron_short_sword: 2 }, materials: { silver: 4, essence: 2, bone_fragment: 3, demon_claw: 1 }, gems: { ruby: 1 }, requiredLevel: 25 } },
  { id: 'gilded_warblade', slot: 'weapon', nameKey: 'gilded_warblade', descKey: 'gilded_warblade_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_warblade.png', cost: 600, tier: 4, damage: 90, critChance: 0.14, recipe: { items: { steel_greatsword: 1 }, materials: { gold_ore: 5, concentrated_blood: 3, demon_core: 1 }, requiredLevel: 50 } },
  { id: 'dragon_flameblade', slot: 'weapon', nameKey: 'dragon_flameblade', descKey: 'dragon_flameblade_d', materialKey: 'material_dragon', iconUrl: Assets.gear_icons.sword_dragon.url, cost: 1000, tier: 4, damage: 120, critChance: 0.18, burn: true, recipe: { items: { steel_greatsword: 1 }, materials: { dragon_scales: 3 }, shards: 5 } },
  // Tier 5-6 — post-tier-4 continuation so gear keeps pace with floors 51-100, not just tier-4 refine.
  { id: 'voidsteel_blade', slot: 'weapon', nameKey: 'voidsteel_blade', descKey: 'voidsteel_blade_d', materialKey: 'material_obsidian', iconUrl: Assets.gear_icons.sword_dragon.url, cost: 1800, tier: 5, damage: 160, critChance: 0.2, burn: true, recipe: { items: { dragon_flameblade: 1 }, materials: { obsidian: 4, corrupted_crystal: 3, demon_core: 2 }, requiredLevel: 70 } },
  { id: 'abyssal_greatblade', slot: 'weapon', nameKey: 'abyssal_greatblade', descKey: 'abyssal_greatblade_d', materialKey: 'material_obsidian', iconUrl: Assets.gear_icons.sword_dragon.url, cost: 3200, tier: 6, damage: 220, critChance: 0.24, burn: true, recipe: { items: { voidsteel_blade: 1 }, materials: { obsidian: 8, corrupted_crystal: 5 }, shards: 6, requiredLevel: 90 } },
  // Armors (Tier 0-4) — hierarchical crafting
  { id: 'ragged_clothes', slot: 'armor', nameKey: 'ragged_clothes', descKey: 'ragged_clothes_d', materialKey: 'material_cloth', iconUrl: Assets.spritesheets.peasant.url, iconSheet: true, cost: 0, tier: 0, maxHp: 0 },
  { id: 'bronze_leather', slot: 'armor', nameKey: 'bronze_leather', descKey: 'bronze_leather_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.armor_leather.url, cost: 50, tier: 1, maxHp: 40, resistance: 0.03, recipe: { materials: { copper: 3, leather: 3 } } },
  { id: 'iron_chainmail', slot: 'armor', nameKey: 'iron_chainmail', descKey: 'iron_chainmail_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.armor_iron.url, cost: 130, tier: 2, maxHp: 90, resistance: 0.06, recipe: { items: { bronze_leather: 2 }, materials: { iron: 3, leather_scrap: 2 }, requiredLevel: 10 } },
  { id: 'steel_plate', slot: 'armor', nameKey: 'steel_plate', descKey: 'steel_plate_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.armor_steel.url, cost: 350, tier: 3, maxHp: 160, resistance: 0.1, reflect: 0.2, recipe: { items: { iron_chainmail: 2 }, materials: { silver: 4, essence: 2, bone_fragment: 3, demon_claw: 1 }, gems: { sapphire: 1 }, requiredLevel: 25 } },
  { id: 'gilded_aegis', slot: 'armor', nameKey: 'gilded_aegis', descKey: 'gilded_aegis_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_aegis.png', cost: 650, tier: 4, maxHp: 220, resistance: 0.13, recipe: { items: { steel_plate: 1 }, materials: { gold_ore: 5, concentrated_blood: 3, corrupted_crystal: 1 }, requiredLevel: 50 } },
  { id: 'dragon_scale_armor', slot: 'armor', nameKey: 'dragon_scale_armor', descKey: 'dragon_scale_armor_d', materialKey: 'material_dragon', iconUrl: Assets.gear_icons.armor_dragon.url, cost: 1000, tier: 4, maxHp: 260, resistance: 0.15, recipe: { items: { steel_plate: 1 }, materials: { dragon_scales: 3 }, shards: 5 } },
  { id: 'voidsteel_plate', slot: 'armor', nameKey: 'voidsteel_plate', descKey: 'voidsteel_plate_d', materialKey: 'material_obsidian', iconUrl: Assets.gear_icons.armor_dragon.url, cost: 1900, tier: 5, maxHp: 340, resistance: 0.17, recipe: { items: { dragon_scale_armor: 1 }, materials: { obsidian: 4, concentrated_blood: 3, demon_core: 2 }, requiredLevel: 70 } },
  { id: 'abyssal_bulwark', slot: 'armor', nameKey: 'abyssal_bulwark', descKey: 'abyssal_bulwark_d', materialKey: 'material_obsidian', iconUrl: Assets.gear_icons.armor_dragon.url, cost: 3300, tier: 6, maxHp: 440, resistance: 0.2, recipe: { items: { voidsteel_plate: 1 }, materials: { obsidian: 8, concentrated_blood: 5 }, shards: 6, requiredLevel: 90 } },
  // Relics
  { id: 'ring_vitality', slot: 'relic', nameKey: 'ring_vitality', descKey: 'ring_vitality_d', icon: '/assets/icons/ring_vitality.png', cost: 200, focusHpBonus: 15, recipe: { materials: { essence: 3 } } },
  { id: 'amulet_swiftness', slot: 'relic', nameKey: 'amulet_swiftness', descKey: 'amulet_swiftness_d', icon: '/assets/icons/amulet_swiftness.png', cost: 250, attackStaminaReduction: 5, recipe: { materials: { essence: 3 } } },
  { id: 'berserker_crest', slot: 'relic', nameKey: 'berserker_crest', descKey: 'berserker_crest_d', icon: '/assets/icons/berserker_crest.png', cost: 350, critMultBonus: 0.5, recipe: { materials: { essence: 5 } } },
  // Profession tools
  { id: 'rusty_pickaxe', slot: 'pickaxe', nameKey: 'rusty_pickaxe', descKey: 'rusty_pickaxe_d', icon: '/assets/icons/pickaxe_rusty.png', cost: 0, tier: 0, miningPower: 5 },
  { id: 'iron_pickaxe', slot: 'pickaxe', nameKey: 'iron_pickaxe', descKey: 'iron_pickaxe_d', icon: '/assets/icons/pickaxe_iron.png', cost: 60, tier: 1, miningPower: 12, recipe: { materials: { iron: 4, leather_scrap: 2 }, requiredLevel: 10 } },
  { id: 'steel_pickaxe', slot: 'pickaxe', nameKey: 'steel_pickaxe', descKey: 'steel_pickaxe_d', icon: '/assets/icons/pickaxe_steel.png', cost: 150, tier: 2, miningPower: 22, recipe: { items: { iron_pickaxe: 1 }, materials: { iron: 5, demon_claw: 2, concentrated_blood: 2 }, requiredLevel: 25 } },
  { id: 'mithril_pickaxe', slot: 'pickaxe', nameKey: 'mithril_pickaxe', descKey: 'mithril_pickaxe_d', icon: '/assets/icons/pickaxe_mithril.png', cost: 400, tier: 3, miningPower: 38, recipe: { items: { steel_pickaxe: 1 }, materials: { silver: 5, demon_core: 1, corrupted_crystal: 1 }, requiredLevel: 50 } },
  { id: 'runic_pickaxe', slot: 'pickaxe', nameKey: 'runic_pickaxe', descKey: 'runic_pickaxe_d', icon: '/assets/icons/pickaxe_runic.png', cost: 900, tier: 4, miningPower: 60, recipe: { items: { mithril_pickaxe: 1 }, materials: { gold_ore: 5, demon_core: 2, corrupted_crystal: 2 }, requiredLevel: 75 } },
  { id: 'worn_axe', slot: 'axe', nameKey: 'worn_axe', descKey: 'worn_axe_d', icon: '/assets/icons/axe.png', cost: 0, tier: 0, woodcuttingPower: 5 },
  { id: 'bamboo_rod', slot: 'rod', nameKey: 'bamboo_rod', descKey: 'bamboo_rod_d', icon: '/assets/icons/rod.png', cost: 0, tier: 0, fishingPower: 5 },
];

const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

export const DEFAULT_INVENTORY: Record<string, number> = {
  wooden_club: 1,
  ragged_clothes: 1,
  rusty_pickaxe: 1,
  worn_axe: 1,
  bamboo_rod: 1,
};

export const DEFAULT_EQUIPPED: EquippedGear = {
  weapon: 'wooden_club',
  armor: 'ragged_clothes',
  relic: null,
  shield: null,
  helmet: null,
  pickaxe: 'rusty_pickaxe',
  axe: 'worn_axe',
  rod: 'bamboo_rod',
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
    shield: equipped.shield ? getGear(equipped.shield) : null,
    helmet: equipped.helmet ? getGear(equipped.helmet) : null,
    pickaxe: equipped.pickaxe ? getGear(equipped.pickaxe) : null,
    axe: equipped.axe ? getGear(equipped.axe) : null,
    rod: equipped.rod ? getGear(equipped.rod) : null,
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
      shield: equipped.shield && valid.has(equipped.shield) ? equipped.shield : null,
      helmet: equipped.helmet && valid.has(equipped.helmet) ? equipped.helmet : null,
      pickaxe: equipped.pickaxe && valid.has(equipped.pickaxe) ? equipped.pickaxe : null,
      axe: equipped.axe && valid.has(equipped.axe) ? equipped.axe : null,
      rod: equipped.rod && valid.has(equipped.rod) ? equipped.rod : null,
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
  if (tier === 4) return 'dragon_scales';
  return 'obsidian';
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
