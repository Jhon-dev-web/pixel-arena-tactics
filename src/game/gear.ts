import { MaterialId } from './materials';
import { GemId } from './gems';
import Assets from '../assets.json';

export type GearSlot = 'weapon' | 'shield' | 'armor' | 'helmet' | 'gloves' | 'boots' | 'ring' | 'relic';

// Where a unique (drop-only) piece comes from: a Hunting zone (rolled per victory, see huntingZones.ts) or a Dungeon biome boss (rolled on each
// victory over it, see uniques.ts). Display only; the chances live next to the code that rolls them.
export type GearSource = { zone: string } | { bossFloor: number };

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
  // Unique pieces (uniques.ts): drop-only (no recipe, never forged), one extra guaranteed substat slot. `salvageLike` is the forged piece
  // whose recipe sets what salvaging one returns.
  unique?: boolean;
  source?: GearSource;
  salvageLike?: string;
}

// Weapon, armor, helmet, gloves, boots and ring are the INSTANCED slots: each owned piece is its own object with its own rarity, substats,
// refine level, sockets and durability (see gearInstances.ts). Everything else (relics) stays a stackable template id.
export const INSTANCED_SLOTS = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'ring'] as const;
export type InstancedSlot = (typeof INSTANCED_SLOTS)[number];

export function isInstancedSlot(slot: string): slot is InstancedSlot {
  return (INSTANCED_SLOTS as readonly string[]).includes(slot);
}

export interface EquippedGear {
  // GEAR INSTANCE ids (null = empty slot). An empty weapon / armor plays as the zero-stat starter template; an empty helmet / gloves /
  // boots / ring simply adds nothing.
  weapon: string | null;
  armor: string | null;
  helmet: string | null;
  gloves: string | null;
  boots: string | null;
  ring: string | null;
  // Template ids of stackable gear.
  relic: string | null;
  shield: string | null;
}

// wood_handle_* retrofit (weapons only — never armor/relics, they don't have a haft): every
// tier-N weapon recipe here takes the wood-handle tier at index (N-1), matching the exact same
// convention the existing ore materials already use (steel_greatsword/tier3 needs silver_ingot = ore
// tier 2, not tier 3's own gold_ore). Tier 6 clamps to the same top handle (wood_handle_ancient) tier 5
// uses, mirroring how tier 5-6 already share refined_obsidian. See woodcutting.ts/refining.ts.
//
// Raw-vs-refined ore audit: tier 1 (bronze_dagger/bronze_leather) now consumes copper_bar (Fornalha
// output) instead of raw copper — copper_bar's own smelt recipe (refining.ts smelt_copper) is
// unlocked from level 1, same as these tier-1 recipes, so this closes the gap with zero level-gate
// impact. 3 raw copper doesn't map onto the 5:1 smelt ratio, so this rounds up to the minimum
// meaningful amount (1 bar = 5 copper), matching how every other tier already asks for a small whole
// count of its refined material (silver_ingot: 1, gold_bar: 1) rather than a raw-ore-equivalent
// fraction; Gold cost (item.cost) is intentionally left unchanged, matching every other tier where the
// refining station's own Gold cost is a separate, additional layer never rebated from the forge price.
// Tier 2 (iron_short_sword/iron_chainmail) intentionally keeps raw iron: its refined counterpart
// (steel) only unlocks at level 25 in refining.ts, while these recipes are level 10 — swapping would
// lock players out of tier-2 gear for 15 levels. Not changed here; would need its own balance pass.
export const GEAR: GearItem[] = [
  // Weapons (Tier 0-4) — hierarchical crafting
  { id: 'wooden_club', slot: 'weapon', nameKey: 'wooden_club', descKey: 'wooden_club_d', materialKey: 'material_wood', iconUrl: Assets.weapons.club.url, cost: 0, tier: 0, damage: 0 },
  { id: 'bronze_dagger', slot: 'weapon', nameKey: 'bronze_dagger', descKey: 'bronze_dagger_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.dagger.url, cost: 40, tier: 1, damage: 12, critChance: 0.03, recipe: { materials: { copper_bar: 1, leather: 1, wood_handle_common: 1 } } },
  { id: 'iron_short_sword', slot: 'weapon', nameKey: 'iron_short_sword', descKey: 'iron_short_sword_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.sword_iron.url, cost: 120, tier: 2, damage: 30, critChance: 0.06, recipe: { items: { bronze_dagger: 2 }, materials: { iron: 3, leather_scrap: 2, wood_handle_oak: 1 }, requiredLevel: 10 } },
  { id: 'steel_greatsword', slot: 'weapon', nameKey: 'steel_greatsword', descKey: 'steel_greatsword_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.sword_steel.url, cost: 300, tier: 3, damage: 65, critChance: 0.1, recipe: { items: { iron_short_sword: 2 }, materials: { silver_ingot: 1, essence: 2, bone_fragment: 3, demon_claw: 1, wood_handle_ebony: 1 }, gems: { ruby: 1 }, requiredLevel: 25 } },
  { id: 'gilded_warblade', slot: 'weapon', nameKey: 'gilded_warblade', descKey: 'gilded_warblade_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_warblade.png', cost: 600, tier: 4, damage: 90, critChance: 0.14, recipe: { items: { steel_greatsword: 1 }, materials: { gold_bar: 1, concentrated_blood: 3, demon_core: 1, wood_handle_elven: 2 }, requiredLevel: 50 } },
  { id: 'dragon_flameblade', slot: 'weapon', nameKey: 'dragon_flameblade', descKey: 'dragon_flameblade_d', materialKey: 'material_dragon', iconUrl: '/assets/icons/dragon_flameblade.png', cost: 1000, tier: 4, damage: 120, critChance: 0.18, burn: true, recipe: { items: { steel_greatsword: 1 }, materials: { dragon_scales: 3, wood_handle_elven: 2 }, shards: 5 } },
  // Tier 5-6 — post-tier-4 continuation so gear keeps pace with floors 51-100, not just tier-4 refine.
  { id: 'voidsteel_blade', slot: 'weapon', nameKey: 'voidsteel_blade', descKey: 'voidsteel_blade_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/voidsteel_blade.png', cost: 1800, tier: 5, damage: 160, critChance: 0.2, burn: true, recipe: { items: { dragon_flameblade: 1 }, materials: { refined_obsidian: 1, corrupted_crystal: 3, demon_core: 2, wood_handle_ancient: 2 }, requiredLevel: 70 } },
  { id: 'abyssal_greatblade', slot: 'weapon', nameKey: 'abyssal_greatblade', descKey: 'abyssal_greatblade_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/abyssal_greatblade.png', cost: 3200, tier: 6, damage: 220, critChance: 0.24, burn: true, recipe: { items: { voidsteel_blade: 1 }, materials: { refined_obsidian: 2, corrupted_crystal: 5, wood_handle_ancient: 3 }, shards: 6, requiredLevel: 90 } },
  // Armors (Tier 0-4) — hierarchical crafting
  { id: 'ragged_clothes', slot: 'armor', nameKey: 'ragged_clothes', descKey: 'ragged_clothes_d', materialKey: 'material_cloth', iconUrl: '/assets/icons/ragged_clothes.png', cost: 0, tier: 0, maxHp: 0 },
  { id: 'bronze_leather', slot: 'armor', nameKey: 'bronze_leather', descKey: 'bronze_leather_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.armor_leather.url, cost: 50, tier: 1, maxHp: 40, resistance: 0.03, recipe: { materials: { copper_bar: 1, leather: 3 } } },
  { id: 'iron_chainmail', slot: 'armor', nameKey: 'iron_chainmail', descKey: 'iron_chainmail_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.armor_iron.url, cost: 130, tier: 2, maxHp: 90, resistance: 0.06, recipe: { items: { bronze_leather: 2 }, materials: { iron: 3, leather_scrap: 2 }, requiredLevel: 10 } },
  { id: 'steel_plate', slot: 'armor', nameKey: 'steel_plate', descKey: 'steel_plate_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.armor_steel.url, cost: 350, tier: 3, maxHp: 160, resistance: 0.1, reflect: 0.2, recipe: { items: { iron_chainmail: 2 }, materials: { silver_ingot: 1, essence: 2, bone_fragment: 3, demon_claw: 1 }, gems: { sapphire: 1 }, requiredLevel: 25 } },
  { id: 'gilded_aegis', slot: 'armor', nameKey: 'gilded_aegis', descKey: 'gilded_aegis_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_aegis.png', cost: 650, tier: 4, maxHp: 220, resistance: 0.13, recipe: { items: { steel_plate: 1 }, materials: { gold_bar: 1, concentrated_blood: 3, corrupted_crystal: 1 }, requiredLevel: 50 } },
  { id: 'dragon_scale_armor', slot: 'armor', nameKey: 'dragon_scale_armor', descKey: 'dragon_scale_armor_d', materialKey: 'material_dragon', iconUrl: '/assets/icons/dragon_scale_armor.png', cost: 1000, tier: 4, maxHp: 260, resistance: 0.15, recipe: { items: { steel_plate: 1 }, materials: { dragon_scales: 3 }, shards: 5 } },
  { id: 'voidsteel_plate', slot: 'armor', nameKey: 'voidsteel_plate', descKey: 'voidsteel_plate_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/voidsteel_plate.png', cost: 1900, tier: 5, maxHp: 340, resistance: 0.17, recipe: { items: { dragon_scale_armor: 1 }, materials: { refined_obsidian: 1, concentrated_blood: 3, demon_core: 2 }, requiredLevel: 70 } },
  { id: 'abyssal_bulwark', slot: 'armor', nameKey: 'abyssal_bulwark', descKey: 'abyssal_bulwark_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/abyssal_bulwark.png', cost: 3300, tier: 6, maxHp: 440, resistance: 0.2, recipe: { items: { voidsteel_plate: 1 }, materials: { refined_obsidian: 2, concentrated_blood: 5 }, shards: 6, requiredLevel: 90 } },
  // Helmet / gloves / boots / ring (content pack 1): one line of six tiers each, same level gates as the weapon / armor of the tier, the same material
  // families, and 1 piece of the previous tier of the SAME slot from tier 2 up (no "2 of" chain). Their numbers are sized so the four together add about
  // +30-40 % CP over the weapon + armor of the tier (itemBalance.test.ts, docs/BALANCE_CHANGES.md Rodada 3): helmet ~35 % of the armor's HP, gloves ~20 %
  // of the weapon's damage, boots and ring the same CP weight. Tier 4 is a single gilded line (the dragon line only exists for weapon / armor).
  // Helmets (tier 1-6)
  { id: 'bronze_helm', slot: 'helmet', nameKey: 'bronze_helm', descKey: 'bronze_helm_d', materialKey: 'material_bronze', icon: '/assets/icons/bronze_helm.png', cost: 20, tier: 1, maxHp: 20, resistance: 0.007, recipe: { materials: { copper_bar: 1, leather_scrap: 2 } } },
  { id: 'iron_helm', slot: 'helmet', nameKey: 'iron_helm', descKey: 'iron_helm_d', materialKey: 'material_iron', icon: '/assets/icons/iron_helm.png', cost: 60, tier: 2, maxHp: 40, resistance: 0.013, recipe: { items: { bronze_helm: 1 }, materials: { iron: 2, leather_scrap: 1 }, requiredLevel: 10 } },
  { id: 'steel_helm', slot: 'helmet', nameKey: 'steel_helm', descKey: 'steel_helm_d', materialKey: 'material_steel', icon: '/assets/icons/steel_helm.png', cost: 160, tier: 3, maxHp: 70, resistance: 0.019, recipe: { items: { iron_helm: 1 }, materials: { steel: 2, silver_ingot: 1, bone_fragment: 3, demon_claw: 2, demon_core: 1 }, requiredLevel: 25 } },
  { id: 'gilded_helm', slot: 'helmet', nameKey: 'gilded_helm', descKey: 'gilded_helm_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_helm.png', cost: 300, tier: 4, maxHp: 109, resistance: 0.026, recipe: { items: { steel_helm: 1 }, materials: { gold_bar: 1, concentrated_blood: 2 }, requiredLevel: 50 } },
  { id: 'voidsteel_helm', slot: 'helmet', nameKey: 'voidsteel_helm', descKey: 'voidsteel_helm_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_helm.png', cost: 850, tier: 5, maxHp: 149, resistance: 0.031, recipe: { items: { gilded_helm: 1 }, materials: { refined_obsidian: 1, concentrated_blood: 2, demon_core: 1 }, requiredLevel: 70 } },
  { id: 'abyssal_helm', slot: 'helmet', nameKey: 'abyssal_helm', descKey: 'abyssal_helm_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_helm.png', cost: 1500, tier: 6, maxHp: 185, resistance: 0.036, recipe: { items: { voidsteel_helm: 1 }, materials: { refined_obsidian: 1, concentrated_blood: 3, corrupted_crystal: 1 }, requiredLevel: 90 } },
  // Glovess (tier 1-6)
  { id: 'leather_gloves', slot: 'gloves', nameKey: 'leather_gloves', descKey: 'leather_gloves_d', materialKey: 'material_bronze', icon: '/assets/icons/leather_gloves.png', cost: 25, tier: 1, damage: 4, critChance: 0.02, recipe: { materials: { copper_bar: 1, leather_scrap: 2 } } },
  { id: 'iron_gauntlets', slot: 'gloves', nameKey: 'iron_gauntlets', descKey: 'iron_gauntlets_d', materialKey: 'material_iron', icon: '/assets/icons/iron_gauntlets.png', cost: 60, tier: 2, damage: 7, critChance: 0.02, recipe: { items: { leather_gloves: 1 }, materials: { iron: 2, leather_scrap: 1 }, requiredLevel: 10 } },
  { id: 'steel_gauntlets', slot: 'gloves', nameKey: 'steel_gauntlets', descKey: 'steel_gauntlets_d', materialKey: 'material_steel', icon: '/assets/icons/steel_gauntlets.png', cost: 160, tier: 3, damage: 13, critChance: 0.02, recipe: { items: { iron_gauntlets: 1 }, materials: { steel: 1, silver_ingot: 2, bone_fragment: 2, demon_claw: 2, demon_core: 1 }, requiredLevel: 25 } },
  { id: 'gilded_gauntlets', slot: 'gloves', nameKey: 'gilded_gauntlets', descKey: 'gilded_gauntlets_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_gauntlets.png', cost: 300, tier: 4, damage: 18, critChance: 0.02, recipe: { items: { steel_gauntlets: 1 }, materials: { gold_bar: 1, concentrated_blood: 2, demon_core: 1 }, requiredLevel: 50 } },
  { id: 'voidsteel_gauntlets', slot: 'gloves', nameKey: 'voidsteel_gauntlets', descKey: 'voidsteel_gauntlets_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_gauntlets.png', cost: 900, tier: 5, damage: 28, critChance: 0.027, recipe: { items: { gilded_gauntlets: 1 }, materials: { refined_obsidian: 1, corrupted_crystal: 2, demon_core: 1 }, requiredLevel: 70 } },
  { id: 'abyssal_gauntlets', slot: 'gloves', nameKey: 'abyssal_gauntlets', descKey: 'abyssal_gauntlets_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_gauntlets.png', cost: 1500, tier: 6, damage: 37, critChance: 0.03, recipe: { items: { voidsteel_gauntlets: 1 }, materials: { refined_obsidian: 1, corrupted_crystal: 3 }, requiredLevel: 90 } },
  // Bootss (tier 1-6)
  { id: 'leather_boots', slot: 'boots', nameKey: 'leather_boots', descKey: 'leather_boots_d', materialKey: 'material_bronze', icon: '/assets/icons/leather_boots.png', cost: 25, tier: 1, resistance: 0.065, maxHp: 12, recipe: { materials: { copper_bar: 1, leather_scrap: 2 } } },
  { id: 'iron_greaves', slot: 'boots', nameKey: 'iron_greaves', descKey: 'iron_greaves_d', materialKey: 'material_iron', icon: '/assets/icons/iron_greaves.png', cost: 55, tier: 2, resistance: 0.08, maxHp: 22, recipe: { items: { leather_boots: 1 }, materials: { iron: 2, leather_scrap: 2 }, requiredLevel: 10 } },
  { id: 'steel_greaves', slot: 'boots', nameKey: 'steel_greaves', descKey: 'steel_greaves_d', materialKey: 'material_steel', icon: '/assets/icons/steel_greaves.png', cost: 160, tier: 3, resistance: 0.1, maxHp: 35, recipe: { items: { iron_greaves: 1 }, materials: { steel: 2, silver_ingot: 1, bone_fragment: 3, demon_claw: 2, demon_core: 1 }, requiredLevel: 25 } },
  { id: 'gilded_greaves', slot: 'boots', nameKey: 'gilded_greaves', descKey: 'gilded_greaves_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_greaves.png', cost: 300, tier: 4, resistance: 0.12, maxHp: 50, recipe: { items: { steel_greaves: 1 }, materials: { gold_bar: 1, concentrated_blood: 2 }, requiredLevel: 50 } },
  { id: 'voidsteel_greaves', slot: 'boots', nameKey: 'voidsteel_greaves', descKey: 'voidsteel_greaves_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_greaves.png', cost: 850, tier: 5, resistance: 0.135, maxHp: 62, recipe: { items: { gilded_greaves: 1 }, materials: { refined_obsidian: 1, concentrated_blood: 3 }, requiredLevel: 70 } },
  { id: 'abyssal_greaves', slot: 'boots', nameKey: 'abyssal_greaves', descKey: 'abyssal_greaves_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_greaves.png', cost: 1500, tier: 6, resistance: 0.145, maxHp: 76, recipe: { items: { voidsteel_greaves: 1 }, materials: { refined_obsidian: 1, concentrated_blood: 3, corrupted_crystal: 1 }, requiredLevel: 90 } },
  // Rings (tier 1-6)
  { id: 'copper_ring', slot: 'ring', nameKey: 'copper_ring', descKey: 'copper_ring_d', materialKey: 'material_bronze', icon: '/assets/icons/copper_ring.png', cost: 30, tier: 1, critChance: 0.06, critMultBonus: 0.15, recipe: { materials: { copper_bar: 1, leather_scrap: 2 } } },
  { id: 'silver_ring', slot: 'ring', nameKey: 'silver_ring', descKey: 'silver_ring_d', materialKey: 'material_iron', icon: '/assets/icons/silver_ring.png', cost: 65, tier: 2, critChance: 0.06, critMultBonus: 0.2, recipe: { items: { copper_ring: 1 }, materials: { iron: 2, leather_scrap: 2 }, requiredLevel: 10 } },
  { id: 'gold_ring', slot: 'ring', nameKey: 'gold_ring', descKey: 'gold_ring_d', materialKey: 'material_steel', icon: '/assets/icons/gold_ring.png', cost: 170, tier: 3, critChance: 0.08, critMultBonus: 0.25, recipe: { items: { silver_ring: 1 }, materials: { steel: 1, silver_ingot: 2, bone_fragment: 2, demon_claw: 2, demon_core: 1 }, gems: { emerald: 1 }, requiredLevel: 25 } },
  { id: 'ruby_ring', slot: 'ring', nameKey: 'ruby_ring', descKey: 'ruby_ring_d', materialKey: 'material_gold', icon: '/assets/icons/ruby_ring.png', cost: 320, tier: 4, critChance: 0.08, critMultBonus: 0.3, recipe: { items: { gold_ring: 1 }, materials: { gold_bar: 1, concentrated_blood: 2 }, gems: { ruby: 1 }, requiredLevel: 50 } },
  { id: 'obsidian_ring', slot: 'ring', nameKey: 'obsidian_ring', descKey: 'obsidian_ring_d', materialKey: 'material_obsidian', icon: '/assets/icons/obsidian_ring.png', cost: 900, tier: 5, critChance: 0.09, critMultBonus: 0.35, recipe: { items: { ruby_ring: 1 }, materials: { refined_obsidian: 1, demon_core: 1, corrupted_crystal: 1 }, gems: { ruby: 1 }, requiredLevel: 70 } },
  { id: 'abyssal_ring', slot: 'ring', nameKey: 'abyssal_ring', descKey: 'abyssal_ring_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_ring.png', cost: 1550, tier: 6, critChance: 0.1, critMultBonus: 0.4, recipe: { items: { obsidian_ring: 1 }, materials: { refined_obsidian: 1, corrupted_crystal: 2, concentrated_blood: 2 }, gems: { sapphire: 1 }, requiredLevel: 90 } },
  // Relics
  { id: 'ring_vitality', slot: 'relic', nameKey: 'ring_vitality', descKey: 'ring_vitality_d', icon: '/assets/icons/ring_vitality.png', cost: 200, focusHpBonus: 15, recipe: { materials: { essence: 3 } } },
  { id: 'amulet_swiftness', slot: 'relic', nameKey: 'amulet_swiftness', descKey: 'amulet_swiftness_d', icon: '/assets/icons/amulet_swiftness.png', cost: 250, attackStaminaReduction: 5, recipe: { materials: { essence: 3 } } },
  { id: 'berserker_crest', slot: 'relic', nameKey: 'berserker_crest', descKey: 'berserker_crest_d', icon: '/assets/icons/berserker_crest.png', cost: 350, critMultBonus: 0.5, recipe: { materials: { essence: 5 } } },
];

// Unique pieces: drop-only (a Hunting zone or a Dungeon biome boss rolls them, uniques.ts), never forged (no recipe), instanced like every other piece.
// Stats = the forged piece of the tier that is normal for where it drops, +10 % on its main stat; every unique also rolls ONE extra substat slot
// (rarity.ts rollSubstats), so a legendary one carries four. Salvaging one returns what its forged twin's recipe does (salvageLike).
const UNIQUE_MAIN_STAT: Record<string, 'damage' | 'maxHp' | 'resistance' | 'critChance'> = {
  weapon: 'damage',
  armor: 'maxHp',
  helmet: 'maxHp',
  gloves: 'damage',
  boots: 'resistance',
  ring: 'critChance',
};
const UNIQUE_DEFS: { id: string; like: string; source: GearSource }[] = [
  { id: 'demon_fang_dagger', like: 'iron_short_sword', source: { zone: 'demon_glade' } },
  { id: 'demonhide_vest', like: 'iron_chainmail', source: { zone: 'demon_glade' } },
  { id: 'bloodbound_cleaver', like: 'steel_greatsword', source: { zone: 'blood_marsh' } },
  { id: 'bloodvein_plate', like: 'steel_plate', source: { zone: 'blood_marsh' } },
  { id: 'riftwalker_boots', like: 'gilded_greaves', source: { zone: 'demon_rift' } },
  { id: 'shadow_hood', like: 'gilded_helm', source: { zone: 'demon_rift' } },
  { id: 'abyss_heart_ring', like: 'obsidian_ring', source: { zone: 'blood_abyss' } },
  { id: 'bonecrusher_maul', like: 'voidsteel_blade', source: { zone: 'blood_abyss' } },
  { id: 'goblin_king_crown', like: 'iron_helm', source: { bossFloor: 25 } },
  { id: 'warchief_gauntlets', like: 'steel_gauntlets', source: { bossFloor: 50 } },
  { id: 'lich_soul_ring', like: 'obsidian_ring', source: { bossFloor: 75 } },
  { id: 'overlord_greataxe', like: 'abyssal_greatblade', source: { bossFloor: 100 } },
];
for (const u of UNIQUE_DEFS) {
  const base = GEAR.find((g) => g.id === u.like) as GearItem;
  const main = UNIQUE_MAIN_STAT[base.slot];
  const boosted = Math.round((base[main] ?? 0) * 1.1 * 10000) / 10000;
  GEAR.push({
    id: u.id,
    slot: base.slot,
    nameKey: u.id,
    descKey: u.id + '_d',
    materialKey: base.materialKey,
    icon: '/assets/icons/' + u.id + '.png',
    cost: base.cost,
    tier: base.tier,
    damage: base.damage,
    critChance: base.critChance,
    maxHp: base.maxHp,
    resistance: base.resistance,
    critMultBonus: base.critMultBonus,
    [main]: main === 'damage' || main === 'maxHp' ? Math.round(boosted) : boosted,
    unique: true,
    source: u.source,
    salvageLike: base.id,
  });
}

const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

// Stackable gear every save always owns. The weapon / armor starters are instances now, created once
// (gearInstances.createStarterGear) and never re-injected.
export const DEFAULT_INVENTORY: Record<string, number> = {};

export const DEFAULT_EQUIPPED: EquippedGear = {
  weapon: null,
  armor: null,
  helmet: null,
  gloves: null,
  boots: null,
  ring: null,
  relic: null,
  shield: null,
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
      // v1 saves never had instanced helmets / gloves / boots / rings (the old `helmet` was an unused stackable slot, always null).
      helmet: null,
      gloves: null,
      boots: null,
      ring: null,
    },
  };
}

// --- Refinement (+0 .. +8) ---
export const MAX_REFINE = 8;

// Stackable gear (relics) for a v2 save. Weapons / armors live in save.gearInstances.
export function sanitizeStackableGear(
  inventory: Record<string, number> | undefined,
  equipped: Partial<EquippedGear> | undefined,
): { inventory: Record<string, number>; equipped: Pick<EquippedGear, 'relic' | 'shield'> } {
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
