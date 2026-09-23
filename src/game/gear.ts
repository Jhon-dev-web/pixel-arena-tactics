import { MaterialId } from './materials';
import { GemId } from './gems';
import Assets from '../assets.json';

export type GearSlot = 'weapon' | 'shield' | 'armor' | 'helmet' | 'relic';

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
}

// Weapon and armor are the only INSTANCED slots: each owned piece is its own object with its own rarity, substats,
// refine level, sockets and durability (see gearInstances.ts). Everything else stays a stackable template id.
export const INSTANCED_SLOTS = ['weapon', 'armor'] as const;
export type InstancedSlot = (typeof INSTANCED_SLOTS)[number];

export function isInstancedSlot(slot: string): slot is InstancedSlot {
  return (INSTANCED_SLOTS as readonly string[]).includes(slot);
}

export interface EquippedGear {
  // GEAR INSTANCE ids (null = empty slot, which plays as the zero-stat starter template).
  weapon: string | null;
  armor: string | null;
  // Template ids of stackable gear.
  relic: string | null;
  shield: string | null;
  helmet: string | null;
}

// wood_handle_* retrofit (weapons only — never armor/relics, they don't have a haft): every
// tier-N weapon recipe here takes the wood-handle tier at index (N-1), matching the exact same
// convention the existing ore materials already use (steel_greatsword/tier3 needs silver_ingot = ore
// tier 2, not tier 3's own gold_ore). Tier 6 clamps to the same top handle (wood_handle_ancient) tier 5
// uses, mirroring how tier 5-6 already share refined_obsidian. See woodcutting.ts/refining.ts.
export const GEAR: GearItem[] = [
  // Weapons (Tier 0-4) — hierarchical crafting
  { id: 'wooden_club', slot: 'weapon', nameKey: 'wooden_club', descKey: 'wooden_club_d', materialKey: 'material_wood', iconUrl: Assets.weapons.club.url, cost: 0, tier: 0, damage: 0 },
  { id: 'bronze_dagger', slot: 'weapon', nameKey: 'bronze_dagger', descKey: 'bronze_dagger_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.dagger.url, cost: 40, tier: 1, damage: 12, critChance: 0.03, recipe: { materials: { copper: 3, leather: 1, wood_handle_common: 1 } } },
  { id: 'iron_short_sword', slot: 'weapon', nameKey: 'iron_short_sword', descKey: 'iron_short_sword_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.sword_iron.url, cost: 120, tier: 2, damage: 30, critChance: 0.06, recipe: { items: { bronze_dagger: 2 }, materials: { iron: 3, leather_scrap: 2, wood_handle_oak: 1 }, requiredLevel: 10 } },
  { id: 'steel_greatsword', slot: 'weapon', nameKey: 'steel_greatsword', descKey: 'steel_greatsword_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.sword_steel.url, cost: 300, tier: 3, damage: 65, critChance: 0.1, recipe: { items: { iron_short_sword: 2 }, materials: { silver_ingot: 1, essence: 2, bone_fragment: 3, demon_claw: 1, wood_handle_ebony: 1 }, gems: { ruby: 1 }, requiredLevel: 25 } },
  { id: 'gilded_warblade', slot: 'weapon', nameKey: 'gilded_warblade', descKey: 'gilded_warblade_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_warblade.png', cost: 600, tier: 4, damage: 90, critChance: 0.14, recipe: { items: { steel_greatsword: 1 }, materials: { gold_bar: 1, concentrated_blood: 3, demon_core: 1, wood_handle_elven: 2 }, requiredLevel: 50 } },
  { id: 'dragon_flameblade', slot: 'weapon', nameKey: 'dragon_flameblade', descKey: 'dragon_flameblade_d', materialKey: 'material_dragon', iconUrl: '/assets/icons/dragon_flameblade.png', cost: 1000, tier: 4, damage: 120, critChance: 0.18, burn: true, recipe: { items: { steel_greatsword: 1 }, materials: { dragon_scales: 3, wood_handle_elven: 2 }, shards: 5 } },
  // Tier 5-6 — post-tier-4 continuation so gear keeps pace with floors 51-100, not just tier-4 refine.
  { id: 'voidsteel_blade', slot: 'weapon', nameKey: 'voidsteel_blade', descKey: 'voidsteel_blade_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/voidsteel_blade.png', cost: 1800, tier: 5, damage: 160, critChance: 0.2, burn: true, recipe: { items: { dragon_flameblade: 1 }, materials: { refined_obsidian: 1, corrupted_crystal: 3, demon_core: 2, wood_handle_ancient: 2 }, requiredLevel: 70 } },
  { id: 'abyssal_greatblade', slot: 'weapon', nameKey: 'abyssal_greatblade', descKey: 'abyssal_greatblade_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/abyssal_greatblade.png', cost: 3200, tier: 6, damage: 220, critChance: 0.24, burn: true, recipe: { items: { voidsteel_blade: 1 }, materials: { refined_obsidian: 2, corrupted_crystal: 5, wood_handle_ancient: 3 }, shards: 6, requiredLevel: 90 } },
  // Armors (Tier 0-4) — hierarchical crafting
  { id: 'ragged_clothes', slot: 'armor', nameKey: 'ragged_clothes', descKey: 'ragged_clothes_d', materialKey: 'material_cloth', iconUrl: '/assets/icons/ragged_clothes.png', cost: 0, tier: 0, maxHp: 0 },
  { id: 'bronze_leather', slot: 'armor', nameKey: 'bronze_leather', descKey: 'bronze_leather_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.armor_leather.url, cost: 50, tier: 1, maxHp: 40, resistance: 0.03, recipe: { materials: { copper: 3, leather: 3 } } },
  { id: 'iron_chainmail', slot: 'armor', nameKey: 'iron_chainmail', descKey: 'iron_chainmail_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.armor_iron.url, cost: 130, tier: 2, maxHp: 90, resistance: 0.06, recipe: { items: { bronze_leather: 2 }, materials: { iron: 3, leather_scrap: 2 }, requiredLevel: 10 } },
  { id: 'steel_plate', slot: 'armor', nameKey: 'steel_plate', descKey: 'steel_plate_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.armor_steel.url, cost: 350, tier: 3, maxHp: 160, resistance: 0.1, reflect: 0.2, recipe: { items: { iron_chainmail: 2 }, materials: { silver_ingot: 1, essence: 2, bone_fragment: 3, demon_claw: 1 }, gems: { sapphire: 1 }, requiredLevel: 25 } },
  { id: 'gilded_aegis', slot: 'armor', nameKey: 'gilded_aegis', descKey: 'gilded_aegis_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_aegis.png', cost: 650, tier: 4, maxHp: 220, resistance: 0.13, recipe: { items: { steel_plate: 1 }, materials: { gold_bar: 1, concentrated_blood: 3, corrupted_crystal: 1 }, requiredLevel: 50 } },
  { id: 'dragon_scale_armor', slot: 'armor', nameKey: 'dragon_scale_armor', descKey: 'dragon_scale_armor_d', materialKey: 'material_dragon', iconUrl: '/assets/icons/dragon_scale_armor.png', cost: 1000, tier: 4, maxHp: 260, resistance: 0.15, recipe: { items: { steel_plate: 1 }, materials: { dragon_scales: 3 }, shards: 5 } },
  { id: 'voidsteel_plate', slot: 'armor', nameKey: 'voidsteel_plate', descKey: 'voidsteel_plate_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/voidsteel_plate.png', cost: 1900, tier: 5, maxHp: 340, resistance: 0.17, recipe: { items: { dragon_scale_armor: 1 }, materials: { refined_obsidian: 1, concentrated_blood: 3, demon_core: 2 }, requiredLevel: 70 } },
  { id: 'abyssal_bulwark', slot: 'armor', nameKey: 'abyssal_bulwark', descKey: 'abyssal_bulwark_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/abyssal_bulwark.png', cost: 3300, tier: 6, maxHp: 440, resistance: 0.2, recipe: { items: { voidsteel_plate: 1 }, materials: { refined_obsidian: 2, concentrated_blood: 5 }, shards: 6, requiredLevel: 90 } },
  // Relics
  { id: 'ring_vitality', slot: 'relic', nameKey: 'ring_vitality', descKey: 'ring_vitality_d', icon: '/assets/icons/ring_vitality.png', cost: 200, focusHpBonus: 15, recipe: { materials: { essence: 3 } } },
  { id: 'amulet_swiftness', slot: 'relic', nameKey: 'amulet_swiftness', descKey: 'amulet_swiftness_d', icon: '/assets/icons/amulet_swiftness.png', cost: 250, attackStaminaReduction: 5, recipe: { materials: { essence: 3 } } },
  { id: 'berserker_crest', slot: 'relic', nameKey: 'berserker_crest', descKey: 'berserker_crest_d', icon: '/assets/icons/berserker_crest.png', cost: 350, critMultBonus: 0.5, recipe: { materials: { essence: 5 } } },
];

const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

// Stackable gear every save always owns. The weapon / armor starters are instances now, created once
// (gearInstances.createStarterGear) and never re-injected.
export const DEFAULT_INVENTORY: Record<string, number> = {};

export const DEFAULT_EQUIPPED: EquippedGear = {
  weapon: null,
  armor: null,
  relic: null,
  shield: null,
  helmet: null,
};

export function getGear(id: string): GearItem {
  return GEAR_BY_ID[id];
}

export function gearBySlot(slot: GearSlot): GearItem[] {
  return GEAR.filter((g) => g.slot === slot);
}

// v1 saves only (migration input): the old per-template inventory, weapon/armor included, with the default
// starters guaranteed present. Never used on a v2 save.
const LEGACY_DEFAULT_INVENTORY: Record<string, number> = { wooden_club: 1, ragged_clothes: 1, ...DEFAULT_INVENTORY };

export function sanitizeLegacyInventory(
  inventory: Record<string, number> | undefined,
  equipped: Partial<EquippedGear>,
): { inventory: Record<string, number>; equipped: EquippedGear } {
  const valid = new Set(GEAR.map((g) => g.id));
  const inv: Record<string, number> = {};
  for (const [id, qty] of Object.entries(inventory ?? {})) {
    if (valid.has(id) && qty > 0) inv[id] = Math.floor(qty);
  }
  for (const [id, qty] of Object.entries(LEGACY_DEFAULT_INVENTORY)) {
    if (!(id in inv)) inv[id] = qty;
  }
  return {
    inventory: inv,
    equipped: {
      weapon: valid.has(equipped.weapon) ? equipped.weapon : 'wooden_club',
      armor: valid.has(equipped.armor) ? equipped.armor : 'ragged_clothes',
      relic: equipped.relic && valid.has(equipped.relic) ? equipped.relic : null,
      shield: equipped.shield && valid.has(equipped.shield) ? equipped.shield : null,
      helmet: equipped.helmet && valid.has(equipped.helmet) ? equipped.helmet : null,
    },
  };
}

// --- Refinement (+0 .. +8) ---
export const MAX_REFINE = 8;

// Stackable gear (relics) for a v2 save. Weapons / armors live in save.gearInstances.
export function sanitizeStackableGear(
  inventory: Record<string, number> | undefined,
  equipped: Partial<EquippedGear> | undefined,
): { inventory: Record<string, number>; equipped: Omit<EquippedGear, 'weapon' | 'armor'> } {
  const stackable = new Set(GEAR.filter((g) => !isInstancedSlot(g.slot)).map((g) => g.id));
  const inv: Record<string, number> = {};
  for (const [id, qty] of Object.entries(inventory ?? {})) {
    if (stackable.has(id) && qty > 0) inv[id] = Math.floor(qty);
  }
  for (const [id, qty] of Object.entries(DEFAULT_INVENTORY)) {
    if (!(id in inv)) inv[id] = qty;
  }
  const pick = (id: unknown): string | null => (typeof id === 'string' && stackable.has(id) ? id : null);
  return {
    inventory: inv,
    equipped: {
      relic: pick(equipped?.relic),
      shield: pick(equipped?.shield),
      helmet: pick(equipped?.helmet),
    },
  };
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
  return 'refined_obsidian';
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

// Gold cost of a substat reforge, on top of its flat 1-shard cost — escalates per prior reforge on
// THAT gear instance (count = how many times this very piece has already been reforged), capped so chasing a good
// roll indefinitely never grows unbounded. Calibrated against a compound-spend check: even on a day
// where the player is also paying Furnace/Carpentry/Alchemy conversions and a mid-tier refine attempt,
// several reforges still fit inside the game's 2-5k Gold/day income target.
const REFORGE_GOLD_COSTS = [10, 25, 50, 90, 150, 240, 360, 500];

export function reforgeGoldCost(count: number): number {
  return REFORGE_GOLD_COSTS[Math.min(count, REFORGE_GOLD_COSTS.length - 1)];
}

export interface UpgradeCost {
  gold: number;
  materials?: Partial<Record<MaterialId, number>>;
  shards?: number;
}

export function upgradeCost(item: GearItem, level: number): UpgradeCost {
  const mat = tierMaterial(item.tier ?? 1);
  // refined_obsidian is Furnace output (5 raw obsidian -> 1), ~5x denser than the raw ores the other
  // tiers' refine materials are consumed at directly — keep the same qty here and refining tier 5-6
  // would quietly cost 5x more raw obsidian per attempt than it used to.
  const refined = mat === 'refined_obsidian';
  // Attempts reaching +5..+8 (current level 4-7) also cost Refining Dust — a sink for the leftover
  // common materials (see refining.ts DUST_RECIPES) that used to have nowhere to go but Discard.
  const dust = level >= 4 ? 2 * (level - 3) : 0;
  if (level < 3) return { gold: 50 * (level + 1) };
  if (level < 6) {
    const materials: Partial<Record<MaterialId, number>> = { [mat]: refined ? 1 : 2 };
    if (dust > 0) materials.refining_dust = dust;
    return { gold: 150 * (level + 1), materials };
  }
  return { gold: 300 * (level + 1), materials: { [mat]: refined ? 1 : 3, refining_dust: dust }, shards: 2 };
}

export function upgradeChance(level: number): number {
  if (level < 3) return 1;
  if (level === 3) return 0.8;
  if (level === 4) return 0.7;
  if (level === 5) return 0.6;
  if (level === 6) return 0.45;
  return 0.3;
}
