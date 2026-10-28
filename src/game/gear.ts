import { MaterialId } from './materials';
import { GemId } from './gems';
import Assets from '../assets.json';
import T from './tunables';

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
  // Weapon: every hit of the hero sets / refreshes a burn on the enemy (derivedStats.ts igniteBurn, numbers in T.battle.burn*).
  burn?: boolean;
  maxHp?: number;
  resistance?: number;
  // Armor: share of the damage the hero actually took (after mitigation) that the attacker takes back (derivedStats.ts reflectedDamage).
  reflect?: number;
  critMultBonus?: number;
  // Relics: HP regenerated per second of combat as a share of max HP, and a bonus to attack speed folded into the attack interval.
  hpRegenPct?: number;
  attackSpeedBonus?: number;
  // Boss relics (content pack 2): a share of the final hit (multiplies dmgBase after STR), percent of the damage dealt healed per hit (adds to the
  // lifesteal substats, same derivation) and percent extra Gold from the Dungeon and Hunting (adds to the goldBonus substats, inside the same 25 % cap).
  damagePct?: number;
  lifestealPct?: number;
  goldBonusPct?: number;
  // Season Relic (Adventurer Pass): percent extra CHARACTER XP from Hunting (3 = 3 %); no combat effect.
  xpBonusPct?: number;
  // Weapon family. An ABSENT line means SWORD (the original line, untouched so old saves stay identical, like an absent `weight` means plate): do not "fix" that into a check for a 'sword' value, no piece carries it.
  // 'axe' is the second line (more damage, less crit, no burn); 'bow', 'crossbow', 'staff' and 'scepter' are the classes reform's (phase 3). Forge grouping and the set family of the weapon (weaponWeight).
  line?: WeaponLine;
  // WARNING: an ABSENT weight means PLATE. Plate is the original line, left untouched so old saves stay identical, so it has no value of its own; 'leather' (phase 2a) and 'cloth' (phase 2b) are added the same way.
  // The tests that measure only the original line filter by `!weight` - do not "fix" that into a check for a plate value, there is none.
  // Armor weight (classes reform, docs/CLASSES_E_EQUIPAMENTOS.md 2.1): only the pieces of a weight other than plate carry it, so every plate piece keeps exactly the data it always had.
  // It decides the set family (tier x weight) and groups the forge / balance comparisons; combat never reads it.
  weight?: ArmorWeight;
  // Unique pieces (uniques.ts): drop-only (no recipe, never forged), one extra guaranteed substat slot. `salvageLike` is the forged piece
  // whose recipe sets what salvaging one returns.
  unique?: boolean;
  source?: GearSource;
  salvageLike?: string;
  // Armor only: the hero sheet (heroLook order below) the hero is drawn with while wearing it. Set from ARMOR_LOOKS; a unique inherits its twin's.
  look?: HeroBaseLook;
  // The crafted tier family this piece belongs to (set bonuses, setBonuses.ts). Set below for every instanced piece of tier 1 and up; a unique takes its twin's.
  setFamily?: SetFamily;
}

// The crafted families are one per (tier x armor weight): the seven plate ones (one per tier, plus the dragon pieces, the tier-4 weapon and armor made from the gilded ones; names
// follow the pieces gilded_*, voidsteel_*, abyssal_*, not the materials), the six leather ones (classes reform, phase 2a) and the six cloth ones (phase 2b). A piece counts for the family of its OWN weight, so a
// mixed set (leather boots, plate helmet, cloth gloves) never gets the five-piece bonus of any of them.
export const SET_FAMILIES = ['bronze', 'iron', 'steel', 'gilded', 'dragon', 'voidsteel', 'abyssal', 'hide', 'scout', 'ranger', 'hunter', 'nightstalker', 'abyssalhide', 'linen', 'homespun', 'silk', 'arcane', 'lunar', 'voidweave'] as const;
export type SetFamily = (typeof SET_FAMILIES)[number];
// Plate is the weight every piece had before the reform, so it is the one with no `weight` field.
export type ArmorWeight = 'leather' | 'cloth';
export type WeaponLine = 'sword' | 'axe' | 'bow' | 'crossbow' | 'staff' | 'scepter';
// The armor weight a weapon counts for when the set families are assigned: the bow and the crossbow are the archer's (leather), the staff and the scepter the mage's (cloth). The sword and the axe have none,
// so they stay in the plate family of their tier exactly as before.
const LINE_WEIGHT: Partial<Record<WeaponLine, ArmorWeight>> = { bow: 'leather', crossbow: 'leather', staff: 'cloth', scepter: 'cloth' };
const weaponWeight = (g: GearItem): ArmorWeight | undefined => g.weight ?? (g.line ? LINE_WEIGHT[g.line] : undefined);
const FAMILY_BY_TIER: Record<number, SetFamily> = { 1: 'bronze', 2: 'iron', 3: 'steel', 4: 'gilded', 5: 'voidsteel', 6: 'abyssal' };
const LEATHER_FAMILY_BY_TIER: Record<number, SetFamily> = { 1: 'hide', 2: 'scout', 3: 'ranger', 4: 'hunter', 5: 'nightstalker', 6: 'abyssalhide' };
const CLOTH_FAMILY_BY_TIER: Record<number, SetFamily> = { 1: 'linen', 2: 'homespun', 3: 'silk', 4: 'arcane', 5: 'lunar', 6: 'voidweave' };

// Every key a GEAR entry may carry. LIVE_STAT_FIELDS are the numeric / boolean fields that feed combat (engine.ts buildCombatStats, directly or via
// gearInstances.equippedExtraStats); META_FIELDS are identity, cost and display data. gearEffects.test.ts checks every entry against both lists
// and that equipping each live field really changes the combat stats, so a field nothing reads (burn, reflect, focusHpBonus and
// attackStaminaReduction were dead data for a long time) cannot come back silently.
export const LIVE_STAT_FIELDS = ['damage', 'critChance', 'burn', 'maxHp', 'resistance', 'reflect', 'critMultBonus', 'hpRegenPct', 'attackSpeedBonus', 'damagePct', 'lifestealPct', 'goldBonusPct'] as const; // xpBonusPct is still read (relicXpBonusPct) but no item carries it any more: the Season Emblem lost its XP bonus
export const META_FIELDS = ['setFamily', 'look', 'id', 'slot', 'nameKey', 'descKey', 'materialKey', 'iconUrl', 'iconSheet', 'icon', 'cost', 'recipe', 'tier', 'unique', 'source', 'salvageLike', 'line', 'weight'] as const;

// Weapon, armor, helmet, gloves, boots, ring and shield are the INSTANCED slots: each owned piece is its own object with its own rarity, substats,
// refine level, sockets and durability (see gearInstances.ts). Everything else (relics) stays a stackable template id.
export const INSTANCED_SLOTS = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'ring', 'shield'] as const;
export type InstancedSlot = (typeof INSTANCED_SLOTS)[number];

export function isInstancedSlot(slot: string): slot is InstancedSlot {
  return (INSTANCED_SLOTS as readonly string[]).includes(slot);
}

export interface EquippedGear {
  // GEAR INSTANCE ids (null = empty slot). An empty weapon / armor plays as the zero-stat starter template; an empty helmet / gloves /
  // boots / ring / shield simply adds nothing.
  weapon: string | null;
  armor: string | null;
  helmet: string | null;
  gloves: string | null;
  boots: string | null;
  ring: string | null;
  shield: string | null;
  // Template id of stackable gear.
  relic: string | null;
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
//
// Chain rule (Rodada 10): every piece is made from ONE piece of the previous tier of its slot, except the tier-2 weapon and armor, which take two bronze ones (the tier-3
// weapon / armor took two iron ones until the Rodada 10 pace pass: that doubled the iron chain of the two biggest pieces of the tier and held the whole tier-3 set back by about
// three days). The dragon weapon and armor (tier 4) are made from the gilded piece, so every line is one chain: bronze > iron > steel > gilded > (dragon) > voidsteel > abyssal.
// Round 15 (docs/BALANCE_CHANGES.md): inside tier 5 (the weapon and armor open at hero level 70) the other five pieces open one level pair apart, helmet 72, gauntlets 74, greaves 76,
// shield 78, ring 80; tier 6 (weapon and armor at 90) the same way, 92 to 100. A full set is then a thing that takes the levels the hero walks anyway, and something new opens every few days.
export const GEAR: GearItem[] = [
  // Weapons (Tier 0-4) — hierarchical crafting
  { id: 'wooden_club', slot: 'weapon', nameKey: 'wooden_club', descKey: 'wooden_club_d', materialKey: 'material_wood', iconUrl: Assets.weapons.club.url, cost: 0, tier: 0, damage: 0 },
  { id: 'bronze_dagger', slot: 'weapon', nameKey: 'bronze_dagger', descKey: 'bronze_dagger_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.dagger.url, cost: 40, tier: 1, damage: 12, critChance: 0.03, recipe: { materials: { copper_bar: 1, wood_handle_common: 1, leather: 7 } } },
  { id: 'iron_short_sword', slot: 'weapon', nameKey: 'iron_short_sword', descKey: 'iron_short_sword_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.sword_iron.url, cost: 120, tier: 2, damage: 30, critChance: 0.06, recipe: { items: { bronze_dagger: 2 }, materials: { iron: 3, wood_handle_oak: 1, leather: 5, demon_claw: 24 }, requiredLevel: 10 } },
  { id: 'steel_greatsword', slot: 'weapon', nameKey: 'steel_greatsword', descKey: 'steel_greatsword_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.sword_steel.url, cost: 300, tier: 3, damage: 65, critChance: 0.1, recipe: { items: { iron_short_sword: 1 }, materials: { silver_ingot: 1, essence: 2, wood_handle_ebony: 1, bone_fragment: 40, demon_claw: 18, concentrated_blood: 45, demon_core: 6, corrupted_crystal: 7 }, gems: { ruby: 1 }, requiredLevel: 25 } },
  { id: 'gilded_warblade', slot: 'weapon', nameKey: 'gilded_warblade', descKey: 'gilded_warblade_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_warblade.png', cost: 600, tier: 4, damage: 90, critChance: 0.14, recipe: { items: { steel_greatsword: 1 }, materials: { gold_bar: 1, wood_handle_elven: 2, leather: 5, bone_fragment: 45, demon_claw: 40, concentrated_blood: 50, demon_core: 16, corrupted_crystal: 9 }, requiredLevel: 50 } },
  { id: 'dragon_flameblade', slot: 'weapon', nameKey: 'dragon_flameblade', descKey: 'dragon_flameblade_d', materialKey: 'material_dragon', iconUrl: '/assets/icons/dragon_flameblade.png', cost: 1000, tier: 4, damage: 120, critChance: 0.18, burn: true, recipe: { items: { gilded_warblade: 1 }, materials: { dragon_scales: 3, wood_handle_elven: 2 }, shards: 5 } },
  // Tier 5-6 — post-tier-4 continuation so gear keeps pace with floors 51-100, not just tier-4 refine.
  { id: 'voidsteel_blade', slot: 'weapon', nameKey: 'voidsteel_blade', descKey: 'voidsteel_blade_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/voidsteel_blade.png', cost: 1800, tier: 5, damage: 160, critChance: 0.2, burn: true, recipe: { items: { dragon_flameblade: 1 }, materials: {refined_obsidian: 1, wood_handle_ancient: 2, leather: 15, bone_fragment: 23, demon_claw: 60, concentrated_blood: 24, demon_core: 14, corrupted_crystal: 6, rift_shard: 33, fiend_horn: 3, abyssal_marrow: 17, blood_heart: 4 }, requiredLevel: 70 } },
  { id: 'abyssal_greatblade', slot: 'weapon', nameKey: 'abyssal_greatblade', descKey: 'abyssal_greatblade_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/abyssal_greatblade.png', cost: 3200, tier: 6, damage: 240, critChance: 0.24, burn: true, recipe: { items: { voidsteel_blade: 1 }, materials: {refined_obsidian: 2, wood_handle_ancient: 3, leather: 12, bone_fragment: 14, demon_claw: 40, concentrated_blood: 15, demon_core: 10, corrupted_crystal: 3, rift_shard: 9, fiend_horn: 1, abyssal_marrow: 5, blood_heart: 1 }, shards: 6, requiredLevel: 90 } },
  // Axes (content pack 2): the second weapon line. Same level gates, recipe structure and cost as the sword of the tier (the previous AXE is the upgrade
  // input from tier 2 up, the lines never mix); more damage and about half the crit chance, no burn - the dragon / voidsteel / abyssal swords keep it as their
  // identity. Numbers tuned in scripts/sim/itemAudit.sim.ts (section H: axe against sword at levels 30 / 60 / 90).
  { id: 'bronze_hatchet', slot: 'weapon', line: 'axe', nameKey: 'bronze_hatchet', descKey: 'bronze_hatchet_d', materialKey: 'material_bronze', icon: '/assets/icons/bronze_hatchet.png', cost: 40, tier: 1, damage: 13, critChance: 0.015, recipe: { materials: { copper_bar: 1, wood_handle_common: 1, leather: 7 } } },
  { id: 'iron_battleaxe', slot: 'weapon', line: 'axe', nameKey: 'iron_battleaxe', descKey: 'iron_battleaxe_d', materialKey: 'material_iron', icon: '/assets/icons/iron_battleaxe.png', cost: 120, tier: 2, damage: 32, critChance: 0.03, recipe: { items: { bronze_hatchet: 2 }, materials: { iron: 3, wood_handle_oak: 1, leather: 5, demon_claw: 24 }, requiredLevel: 10 } },
  { id: 'steel_greataxe', slot: 'weapon', line: 'axe', nameKey: 'steel_greataxe', descKey: 'steel_greataxe_d', materialKey: 'material_steel', icon: '/assets/icons/steel_greataxe.png', cost: 300, tier: 3, damage: 70, critChance: 0.05, recipe: { items: { iron_battleaxe: 1 }, materials: { silver_ingot: 1, essence: 2, wood_handle_ebony: 1, bone_fragment: 40, demon_claw: 18, concentrated_blood: 45, demon_core: 6, corrupted_crystal: 7 }, gems: { ruby: 1 }, requiredLevel: 25 } },
  { id: 'gilded_waraxe', slot: 'weapon', line: 'axe', nameKey: 'gilded_waraxe', descKey: 'gilded_waraxe_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_waraxe.png', cost: 600, tier: 4, damage: 100, critChance: 0.07, recipe: { items: { steel_greataxe: 1 }, materials: { gold_bar: 1, wood_handle_elven: 2, leather: 5, bone_fragment: 45, demon_claw: 40, concentrated_blood: 50, demon_core: 16, corrupted_crystal: 9 }, requiredLevel: 50 } },
  { id: 'voidsteel_cleaver', slot: 'weapon', line: 'axe', nameKey: 'voidsteel_cleaver', descKey: 'voidsteel_cleaver_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_cleaver.png', cost: 1800, tier: 5, damage: 187, critChance: 0.1, recipe: { items: { gilded_waraxe: 1 }, materials: {refined_obsidian: 1, wood_handle_ancient: 2, leather: 15, bone_fragment: 23, demon_claw: 60, concentrated_blood: 24, demon_core: 14, corrupted_crystal: 6, rift_shard: 33, fiend_horn: 3, abyssal_marrow: 17, blood_heart: 4 }, requiredLevel: 70 } },
  { id: 'abyssal_reaver', slot: 'weapon', line: 'axe', nameKey: 'abyssal_reaver', descKey: 'abyssal_reaver_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_reaver.png', cost: 3200, tier: 6, damage: 288, critChance: 0.12, recipe: { items: { voidsteel_cleaver: 1 }, materials: {refined_obsidian: 2, wood_handle_ancient: 3, leather: 12, bone_fragment: 14, demon_claw: 40, concentrated_blood: 15, demon_core: 10, corrupted_crystal: 3, rift_shard: 9, fiend_horn: 1, abyssal_marrow: 5, blood_heart: 1 }, shards: 6, requiredLevel: 90 } },
  // Armors (Tier 0-4) — hierarchical crafting
  { id: 'ragged_clothes', slot: 'armor', nameKey: 'ragged_clothes', descKey: 'ragged_clothes_d', materialKey: 'material_cloth', iconUrl: '/assets/icons/ragged_clothes.png', cost: 0, tier: 0, maxHp: 0 },
  { id: 'bronze_leather', slot: 'armor', nameKey: 'bronze_leather', descKey: 'bronze_leather_d', materialKey: 'material_bronze', iconUrl: Assets.gear_icons.armor_leather.url, cost: 50, tier: 1, maxHp: 40, resistance: 0.03, recipe: { materials: { copper_bar: 1, leather: 7 } } },
  { id: 'iron_chainmail', slot: 'armor', nameKey: 'iron_chainmail', descKey: 'iron_chainmail_d', materialKey: 'material_iron', iconUrl: Assets.gear_icons.armor_iron.url, cost: 130, tier: 2, maxHp: 90, resistance: 0.06, recipe: { items: { bronze_leather: 2 }, materials: { iron: 3, leather: 5, demon_claw: 24 }, requiredLevel: 10 } },
  { id: 'steel_plate', slot: 'armor', nameKey: 'steel_plate', descKey: 'steel_plate_d', materialKey: 'material_steel', iconUrl: Assets.gear_icons.armor_steel.url, cost: 350, tier: 3, maxHp: 160, resistance: 0.1, reflect: 0.2, recipe: { items: { iron_chainmail: 1 }, materials: { silver_ingot: 1, essence: 2, bone_fragment: 40, demon_claw: 18, concentrated_blood: 45, demon_core: 6, corrupted_crystal: 7 }, gems: { sapphire: 1 }, requiredLevel: 25 } },
  { id: 'gilded_aegis', slot: 'armor', nameKey: 'gilded_aegis', descKey: 'gilded_aegis_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_aegis.png', cost: 650, tier: 4, maxHp: 220, resistance: 0.13, reflect: 0.21, recipe: { items: { steel_plate: 1 }, materials: { gold_bar: 1, leather: 5, bone_fragment: 45, demon_claw: 40, concentrated_blood: 50, demon_core: 16, corrupted_crystal: 9 }, requiredLevel: 50 } },
  { id: 'dragon_scale_armor', slot: 'armor', nameKey: 'dragon_scale_armor', descKey: 'dragon_scale_armor_d', materialKey: 'material_dragon', iconUrl: '/assets/icons/dragon_scale_armor.png', cost: 1000, tier: 4, maxHp: 280, resistance: 0.16, reflect: 0.23, recipe: { items: { gilded_aegis: 1 }, materials: { dragon_scales: 3 }, shards: 5 } },
  { id: 'voidsteel_plate', slot: 'armor', nameKey: 'voidsteel_plate', descKey: 'voidsteel_plate_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/voidsteel_plate.png', cost: 1900, tier: 5, maxHp: 360, resistance: 0.18, reflect: 0.25, recipe: { items: { dragon_scale_armor: 1 }, materials: {refined_obsidian: 1, leather: 15, bone_fragment: 22, demon_claw: 60, concentrated_blood: 24, demon_core: 14, corrupted_crystal: 6, rift_shard: 33, fiend_horn: 3, abyssal_marrow: 17, blood_heart: 4 }, requiredLevel: 70 } },
  { id: 'abyssal_bulwark', slot: 'armor', nameKey: 'abyssal_bulwark', descKey: 'abyssal_bulwark_d', materialKey: 'material_obsidian', iconUrl: '/assets/icons/abyssal_bulwark.png', cost: 3300, tier: 6, maxHp: 485, resistance: 0.22, reflect: 0.28, recipe: { items: { voidsteel_plate: 1 }, materials: {refined_obsidian: 2, leather: 12, bone_fragment: 13, demon_claw: 40, concentrated_blood: 15, demon_core: 10, corrupted_crystal: 3, rift_shard: 9, fiend_horn: 1, abyssal_marrow: 5, blood_heart: 1 }, shards: 6, requiredLevel: 90 } },
  // Helmet / gloves / boots / ring (content pack 1): one line of six tiers each, same level gates as the weapon / armor of the tier, the same material
  // families, and 1 piece of the previous tier of the SAME slot from tier 2 up (no "2 of" chain). Their numbers are sized so the four together add about
  // +30-40 % CP over the weapon + armor of the tier (itemBalance.test.ts, docs/BALANCE_CHANGES.md Rodada 3): helmet ~35 % of the armor's HP, gloves ~20 %
  // of the weapon's damage, boots and ring the same CP weight. Tier 4 is a single gilded line (the dragon line only exists for weapon / armor).
  // Helmets (tier 1-6)
  { id: 'bronze_helm', slot: 'helmet', nameKey: 'bronze_helm', descKey: 'bronze_helm_d', materialKey: 'material_bronze', icon: '/assets/icons/bronze_helm.png', cost: 20, tier: 1, maxHp: 20, resistance: 0.007, recipe: { materials: { copper_bar: 1, leather_scrap: 10 } } },
  { id: 'iron_helm', slot: 'helmet', nameKey: 'iron_helm', descKey: 'iron_helm_d', materialKey: 'material_iron', icon: '/assets/icons/iron_helm.png', cost: 60, tier: 2, maxHp: 40, resistance: 0.013, recipe: { items: { bronze_helm: 1 }, materials: { iron: 2, leather_scrap: 7, demon_claw: 12 }, requiredLevel: 10 } },
  { id: 'steel_helm', slot: 'helmet', nameKey: 'steel_helm', descKey: 'steel_helm_d', materialKey: 'material_steel', icon: '/assets/icons/steel_helm.png', cost: 160, tier: 3, maxHp: 70, resistance: 0.019, recipe: { items: { iron_helm: 1 }, materials: { steel: 2, silver_ingot: 1, bone_fragment: 20, demon_claw: 9, concentrated_blood: 22, demon_core: 3, corrupted_crystal: 3 }, requiredLevel: 25 } },
  { id: 'gilded_helm', slot: 'helmet', nameKey: 'gilded_helm', descKey: 'gilded_helm_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_helm.png', cost: 300, tier: 4, maxHp: 109, resistance: 0.026, recipe: { items: { steel_helm: 1 }, materials: { gold_bar: 1, leather_scrap: 8, bone_fragment: 24, demon_claw: 20, concentrated_blood: 24, demon_core: 8, corrupted_crystal: 4 }, requiredLevel: 50 } },
  { id: 'voidsteel_helm', slot: 'helmet', nameKey: 'voidsteel_helm', descKey: 'voidsteel_helm_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_helm.png', cost: 850, tier: 5, maxHp: 153, resistance: 0.032, recipe: { items: { gilded_helm: 1 }, materials: {refined_obsidian: 1, leather_scrap: 24, bone_fragment: 12, demon_claw: 30, concentrated_blood: 12, demon_core: 7, corrupted_crystal: 3, rift_shard: 16, fiend_horn: 2, abyssal_marrow: 9, blood_heart: 2 }, requiredLevel: 72 } },
  { id: 'abyssal_helm', slot: 'helmet', nameKey: 'abyssal_helm', descKey: 'abyssal_helm_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_helm.png', cost: 1500, tier: 6, maxHp: 192, resistance: 0.038, recipe: { items: { voidsteel_helm: 1 }, materials: {refined_obsidian: 1, leather_scrap: 18, bone_fragment: 7, demon_claw: 20, concentrated_blood: 8, demon_core: 5, corrupted_crystal: 2, rift_shard: 5, fiend_horn: 1, abyssal_marrow: 3, blood_heart: 1 }, requiredLevel: 92 } },
  // Glovess (tier 1-6)
  { id: 'leather_gloves', slot: 'gloves', nameKey: 'leather_gloves', descKey: 'leather_gloves_d', materialKey: 'material_bronze', icon: '/assets/icons/leather_gloves.png', cost: 25, tier: 1, damage: 4, critChance: 0.02, recipe: { materials: { copper_bar: 1, common_herb: 1, leather_scrap: 10 } } },
  { id: 'iron_gauntlets', slot: 'gloves', nameKey: 'iron_gauntlets', descKey: 'iron_gauntlets_d', materialKey: 'material_iron', icon: '/assets/icons/iron_gauntlets.png', cost: 60, tier: 2, damage: 7, critChance: 0.025, recipe: { items: { leather_gloves: 1 }, materials: { iron: 2, leather_scrap: 7, demon_claw: 12 }, requiredLevel: 10 } },
  { id: 'steel_gauntlets', slot: 'gloves', nameKey: 'steel_gauntlets', descKey: 'steel_gauntlets_d', materialKey: 'material_steel', icon: '/assets/icons/steel_gauntlets.png', cost: 160, tier: 3, damage: 13, critChance: 0.03, recipe: { items: { iron_gauntlets: 1 }, materials: { steel: 1, silver_ingot: 2, bone_fragment: 20, demon_claw: 9, concentrated_blood: 22, demon_core: 3, corrupted_crystal: 3 }, requiredLevel: 25 } },
  { id: 'gilded_gauntlets', slot: 'gloves', nameKey: 'gilded_gauntlets', descKey: 'gilded_gauntlets_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_gauntlets.png', cost: 300, tier: 4, damage: 18, critChance: 0.035, recipe: { items: { steel_gauntlets: 1 }, materials: { gold_bar: 1, leather_scrap: 8, bone_fragment: 24, demon_claw: 20, concentrated_blood: 24, demon_core: 8, corrupted_crystal: 4 }, requiredLevel: 50 } },
  { id: 'voidsteel_gauntlets', slot: 'gloves', nameKey: 'voidsteel_gauntlets', descKey: 'voidsteel_gauntlets_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_gauntlets.png', cost: 900, tier: 5, damage: 28, critChance: 0.04, recipe: { items: { gilded_gauntlets: 1 }, materials: {refined_obsidian: 1, leather_scrap: 24, bone_fragment: 12, demon_claw: 30, concentrated_blood: 12, demon_core: 7, corrupted_crystal: 3, rift_shard: 16, fiend_horn: 2, abyssal_marrow: 9, blood_heart: 2 }, requiredLevel: 74 } },
  { id: 'abyssal_gauntlets', slot: 'gloves', nameKey: 'abyssal_gauntlets', descKey: 'abyssal_gauntlets_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_gauntlets.png', cost: 1500, tier: 6, damage: 35, critChance: 0.045, recipe: { items: { voidsteel_gauntlets: 1 }, materials: {refined_obsidian: 1, leather_scrap: 18, bone_fragment: 7, demon_claw: 20, concentrated_blood: 7, demon_core: 5, corrupted_crystal: 2, rift_shard: 5, fiend_horn: 1, abyssal_marrow: 3, blood_heart: 1 }, requiredLevel: 94 } },
  // Bootss (tier 1-6)
  { id: 'leather_boots', slot: 'boots', nameKey: 'leather_boots', descKey: 'leather_boots_d', materialKey: 'material_bronze', icon: '/assets/icons/leather_boots.png', cost: 25, tier: 1, resistance: 0.065, maxHp: 12, recipe: { materials: { copper_bar: 1, common_herb: 1, leather_scrap: 10 } } },
  { id: 'iron_greaves', slot: 'boots', nameKey: 'iron_greaves', descKey: 'iron_greaves_d', materialKey: 'material_iron', icon: '/assets/icons/iron_greaves.png', cost: 55, tier: 2, resistance: 0.08, maxHp: 22, recipe: { items: { leather_boots: 1 }, materials: { iron: 2, leather_scrap: 7, demon_claw: 12 }, requiredLevel: 10 } },
  { id: 'steel_greaves', slot: 'boots', nameKey: 'steel_greaves', descKey: 'steel_greaves_d', materialKey: 'material_steel', icon: '/assets/icons/steel_greaves.png', cost: 160, tier: 3, resistance: 0.1, maxHp: 35, recipe: { items: { iron_greaves: 1 }, materials: { steel: 2, silver_ingot: 1, bone_fragment: 20, demon_claw: 9, concentrated_blood: 22, demon_core: 3, corrupted_crystal: 3 }, requiredLevel: 25 } },
  { id: 'gilded_greaves', slot: 'boots', nameKey: 'gilded_greaves', descKey: 'gilded_greaves_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_greaves.png', cost: 300, tier: 4, resistance: 0.12, maxHp: 50, recipe: { items: { steel_greaves: 1 }, materials: { gold_bar: 1, leather_scrap: 8, bone_fragment: 24, demon_claw: 20, concentrated_blood: 24, demon_core: 8, corrupted_crystal: 4 }, requiredLevel: 50 } },
  { id: 'voidsteel_greaves', slot: 'boots', nameKey: 'voidsteel_greaves', descKey: 'voidsteel_greaves_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_greaves.png', cost: 850, tier: 5, resistance: 0.15, maxHp: 68, recipe: { items: { gilded_greaves: 1 }, materials: {refined_obsidian: 1, leather_scrap: 24, bone_fragment: 12, demon_claw: 30, concentrated_blood: 12, demon_core: 7, corrupted_crystal: 3, rift_shard: 16, fiend_horn: 2, abyssal_marrow: 8, blood_heart: 2 }, requiredLevel: 76 } },
  { id: 'abyssal_greaves', slot: 'boots', nameKey: 'abyssal_greaves', descKey: 'abyssal_greaves_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_greaves.png', cost: 1500, tier: 6, resistance: 0.178, maxHp: 88, recipe: { items: { voidsteel_greaves: 1 }, materials: {refined_obsidian: 1, leather_scrap: 18, bone_fragment: 7, demon_claw: 20, concentrated_blood: 7, demon_core: 5, corrupted_crystal: 2, rift_shard: 4, abyssal_marrow: 3, blood_heart: 1 }, requiredLevel: 96 } },
  // Rings (tier 1-6)
  { id: 'copper_ring', slot: 'ring', nameKey: 'copper_ring', descKey: 'copper_ring_d', materialKey: 'material_bronze', icon: '/assets/icons/copper_ring.png', cost: 30, tier: 1, critChance: 0.06, critMultBonus: 0.15, recipe: { materials: { copper_bar: 1, common_herb: 2, leather_scrap: 10 } } },
  { id: 'silver_ring', slot: 'ring', nameKey: 'silver_ring', descKey: 'silver_ring_d', materialKey: 'material_iron', icon: '/assets/icons/silver_ring.png', cost: 65, tier: 2, critChance: 0.07, critMultBonus: 0.2, recipe: { items: { copper_ring: 1 }, materials: { iron: 2, iron_thistle: 2, leather_scrap: 7, demon_claw: 12 }, requiredLevel: 10 } },
  { id: 'gold_ring', slot: 'ring', nameKey: 'gold_ring', descKey: 'gold_ring_d', materialKey: 'material_steel', icon: '/assets/icons/gold_ring.png', cost: 170, tier: 3, critChance: 0.09, critMultBonus: 0.26, recipe: { items: { silver_ring: 1 }, materials: { steel: 1, silver_ingot: 2, gold_blossom: 1, bone_fragment: 20, demon_claw: 9, concentrated_blood: 22, demon_core: 3, corrupted_crystal: 3 }, gems: { emerald: 1 }, requiredLevel: 25 } },
  { id: 'ruby_ring', slot: 'ring', nameKey: 'ruby_ring', descKey: 'ruby_ring_d', materialKey: 'material_gold', icon: '/assets/icons/ruby_ring.png', cost: 320, tier: 4, critChance: 0.105, critMultBonus: 0.33, recipe: { items: { gold_ring: 1 }, materials: { gold_bar: 1, gold_blossom: 1, crimson_mushroom: 1, leather_scrap: 8, bone_fragment: 24, demon_claw: 20, concentrated_blood: 24, demon_core: 8, corrupted_crystal: 4 }, gems: { ruby: 1 }, requiredLevel: 50 } },
  { id: 'obsidian_ring', slot: 'ring', nameKey: 'obsidian_ring', descKey: 'obsidian_ring_d', materialKey: 'material_obsidian', icon: '/assets/icons/obsidian_ring.png', cost: 900, tier: 5, critChance: 0.125, critMultBonus: 0.42, recipe: { items: { ruby_ring: 1 }, materials: {refined_obsidian: 1, moon_lily: 1, leather_scrap: 24, bone_fragment: 12, demon_claw: 30, concentrated_blood: 12, demon_core: 7, corrupted_crystal: 3, rift_shard: 16, fiend_horn: 2, abyssal_marrow: 8, blood_heart: 2 }, gems: { ruby: 1 }, requiredLevel: 80 } },
  { id: 'abyssal_ring', slot: 'ring', nameKey: 'abyssal_ring', descKey: 'abyssal_ring_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_ring.png', cost: 1550, tier: 6, critChance: 0.145, critMultBonus: 0.5, recipe: { items: { obsidian_ring: 1 }, materials: {refined_obsidian: 1, moon_lily: 2, leather_scrap: 18, bone_fragment: 7, demon_claw: 20, concentrated_blood: 7, demon_core: 5, corrupted_crystal: 1, rift_shard: 4, abyssal_marrow: 3 }, gems: { sapphire: 1 }, requiredLevel: 100 } },
  // Shields (content pack 2): the seventh instanced slot. Resistance + reflect (from tier 3, like the armor) and a little max HP; one line of six tiers with the
  // level gates of the armor of the tier, 1 shield of the previous tier from tier 2 up, bars / ingots + a wood handle of the tier + hunt materials, about half
  // the armor's cost. Shield reflect adds to the armor's (derivedStats.reflectedDamage), so it is kept low: armor + shield stay under ~12 % of the damage dealt.
  { id: 'bronze_buckler', slot: 'shield', nameKey: 'bronze_buckler', descKey: 'bronze_buckler_d', materialKey: 'material_bronze', icon: '/assets/icons/bronze_buckler.png', cost: 15, tier: 1, maxHp: 20, resistance: 0.04, recipe: { materials: { copper_bar: 1, wood_handle_common: 1, leather: 3 } } },
  { id: 'iron_shield', slot: 'shield', nameKey: 'iron_shield', descKey: 'iron_shield_d', materialKey: 'material_iron', icon: '/assets/icons/iron_shield.png', cost: 35, tier: 2, maxHp: 36, resistance: 0.06, recipe: { items: { bronze_buckler: 1 }, materials: { iron: 2, wood_handle_oak: 1, leather: 2, demon_claw: 12 }, requiredLevel: 10 } },
  { id: 'steel_kite_shield', slot: 'shield', nameKey: 'steel_kite_shield', descKey: 'steel_kite_shield_d', materialKey: 'material_steel', icon: '/assets/icons/steel_kite_shield.png', cost: 240, tier: 3, maxHp: 52, resistance: 0.076, reflect: 0.03, recipe: { items: { iron_shield: 1 }, materials: { steel: 1, silver_ingot: 1, wood_handle_ebony: 1, bone_fragment: 20, demon_claw: 9, concentrated_blood: 22, demon_core: 3, corrupted_crystal: 3 }, requiredLevel: 25 } },
  { id: 'gilded_shield', slot: 'shield', nameKey: 'gilded_shield', descKey: 'gilded_shield_d', materialKey: 'material_gold', icon: '/assets/icons/gilded_shield.png', cost: 325, tier: 4, maxHp: 76, resistance: 0.095, reflect: 0.06, recipe: { items: { steel_kite_shield: 1 }, materials: { gold_bar: 1, wood_handle_elven: 1, leather: 3, bone_fragment: 24, demon_claw: 20, concentrated_blood: 24, demon_core: 8, corrupted_crystal: 4 }, requiredLevel: 50 } },
  { id: 'voidsteel_shield', slot: 'shield', nameKey: 'voidsteel_shield', descKey: 'voidsteel_shield_d', materialKey: 'material_obsidian', icon: '/assets/icons/voidsteel_shield.png', cost: 950, tier: 5, maxHp: 104, resistance: 0.115, reflect: 0.075, recipe: { items: { gilded_shield: 1 }, materials: {refined_obsidian: 1, wood_handle_ancient: 1, leather: 8, bone_fragment: 12, demon_claw: 30, concentrated_blood: 12, demon_core: 7, corrupted_crystal: 3, rift_shard: 16, fiend_horn: 1, abyssal_marrow: 8, blood_heart: 2 }, requiredLevel: 78 } },
  { id: 'abyssal_shield', slot: 'shield', nameKey: 'abyssal_shield', descKey: 'abyssal_shield_d', materialKey: 'material_obsidian', icon: '/assets/icons/abyssal_shield.png', cost: 1650, tier: 6, maxHp: 138, resistance: 0.14, reflect: 0.09, recipe: { items: { voidsteel_shield: 1 }, materials: {refined_obsidian: 1, wood_handle_ancient: 2, leather: 6, bone_fragment: 7, demon_claw: 20, concentrated_blood: 7, demon_core: 5, corrupted_crystal: 1, rift_shard: 4, abyssal_marrow: 2 }, requiredLevel: 98 } },
  // Relics
  { id: 'ring_vitality', slot: 'relic', nameKey: 'ring_vitality', descKey: 'ring_vitality_d', icon: '/assets/icons/ring_vitality.png', cost: 200, hpRegenPct: 0.009, recipe: { materials: { essence: 3 } } },
  { id: 'amulet_swiftness', slot: 'relic', nameKey: 'amulet_swiftness', descKey: 'amulet_swiftness_d', icon: '/assets/icons/amulet_swiftness.png', cost: 250, attackSpeedBonus: 0.08, recipe: { materials: { essence: 3 } } },
  { id: 'berserker_crest', slot: 'relic', nameKey: 'berserker_crest', descKey: 'berserker_crest_d', icon: '/assets/icons/berserker_crest.png', cost: 350, critMultBonus: 0.75, recipe: { materials: { essence: 5 } } },
  // Boss relics (content pack 2): drop-only (no recipe, uniques.ts rollBossRelics, T.battle.relicBossChance per victory over a biome boss), stackable templates
  // like the three above, so they compete for the one relic slot. A second copy only stacks; they cannot be sold or salvaged, only discarded.
  { id: 'goblin_lucky_coin', slot: 'relic', nameKey: 'goblin_lucky_coin', descKey: 'goblin_lucky_coin_d', icon: '/assets/icons/goblin_lucky_coin.png', cost: 0, goldBonusPct: 10, source: { bossFloor: 25 } },
  { id: 'warchief_totem', slot: 'relic', nameKey: 'warchief_totem', descKey: 'warchief_totem_d', icon: '/assets/icons/warchief_totem.png', cost: 0, damagePct: 0.085, source: { bossFloor: 50 } },
  { id: 'lich_phylactery', slot: 'relic', nameKey: 'lich_phylactery', descKey: 'lich_phylactery_d', icon: '/assets/icons/lich_phylactery.png', cost: 0, lifestealPct: 5, source: { bossFloor: 75 } },
  { id: 'overlord_sigil', slot: 'relic', nameKey: 'overlord_sigil', descKey: 'overlord_sigil_d', icon: '/assets/icons/overlord_sigil.png', cost: 0, critChance: 0.04, critMultBonus: 0.2, source: { bossFloor: 100 } },
  // Season Relic (the Adventurer Pass track, level 30): drop-only from that track (no recipe, no boss source), stackable, a second season's copy only stacks. It is the
  // "progress faster" choice, not the "hit harder" one: +5 % character XP, +5 % gold (inside the 25 % cap) and +2 % final damage, worth less in combat than any other relic.
  { id: 'season_emblem', slot: 'relic', nameKey: 'season_emblem', descKey: 'season_emblem_d', icon: '/assets/icons/season_emblem.png', cost: 0, damagePct: 0.02, goldBonusPct: 5 },
];

// --- Leather line (classes reform, phase 2a; docs/CLASSES_E_EQUIPAMENTOS.md 2.1, 2.4): the archer's armor, helmet, gloves, boots and off hand (the quiver, in the shield slot) ---
// Nothing here is hand-tuned. Every piece is DERIVED from its plate twin of the same tier and slot (the quiver's twin is the shield of the tier): it keeps LEATHER_KEEP of the defense
// (max HP and resistance; the gloves, which have none, keep it of their damage) and returns the rest as crit chance and attack speed, in the amounts that
// scripts/sim/weightBudget.gen.ts solves per tier so a full leather set is worth the CP of the plate set of the same tier. The twin's reflect and crit are not kept: reflect
// is what plate is FOR, and the crit the plate gloves carry is part of the budget returned below.
// The two conversion numbers per piece live in the block between the markers: the generator rewrites it (npx vitest run --config vitest.sim.config.ts weightBudget), and itemBalance.test.ts fails if it goes stale.
export const LEATHER_KEEP = 0.6;
export const LEATHER_LINES: { slot: GearSlot; ids: string[]; twins: string[]; leather: number[]; sinew: number[]; feather?: number[]; handle: boolean; hunt: number[] }[] = [
  // Quantities are sized against the real supply (one 4 h session of Hunting: about 17 sinew for a new hero, 48 for a strong one in the glade; about 32 feathers in the marsh):
  // the biggest piece of the line (the tier-6 armor) is under one session of sinew, a full set of one tier a few hours. The wood handle is the tier's, like the weapons'.
  { slot: 'armor', ids: ['hide_jerkin', 'scout_leather', 'ranger_leather', 'hunter_leather', 'nightstalker_leather', 'abyssal_leather'], twins: ['bronze_leather', 'iron_chainmail', 'steel_plate', 'gilded_aegis', 'voidsteel_plate', 'abyssal_bulwark'], leather: [7, 6, 8, 10, 12, 14], sinew: [4, 7, 12, 18, 24, 30], handle: true, hunt: [0, 0.45, 0.75, 0.85, 1, 0.9] },
  { slot: 'helmet', ids: ['hide_cap', 'scout_hood', 'ranger_hood', 'hunter_hood', 'nightstalker_hood', 'abyssal_hood'], twins: ['bronze_helm', 'iron_helm', 'steel_helm', 'gilded_helm', 'voidsteel_helm', 'abyssal_helm'], leather: [3, 3, 4, 5, 6, 7], sinew: [2, 4, 6, 9, 12, 15], handle: true, hunt: [0, 0, 0.75, 0.8, 0.95, 0.8] },
  { slot: 'gloves', ids: ['hide_bracers', 'scout_bracers', 'ranger_bracers', 'hunter_bracers', 'nightstalker_bracers', 'abyssal_bracers'], twins: ['leather_gloves', 'iron_gauntlets', 'steel_gauntlets', 'gilded_gauntlets', 'voidsteel_gauntlets', 'abyssal_gauntlets'], leather: [3, 3, 4, 5, 6, 7], sinew: [2, 4, 6, 9, 12, 15], handle: true, hunt: [0, 0, 0.75, 0.8, 0.95, 0.8] },
  { slot: 'boots', ids: ['hide_shoes', 'scout_boots', 'ranger_boots', 'hunter_boots', 'nightstalker_boots', 'abyssal_boots'], twins: ['leather_boots', 'iron_greaves', 'steel_greaves', 'gilded_greaves', 'voidsteel_greaves', 'abyssal_greaves'], leather: [3, 3, 4, 5, 6, 7], sinew: [2, 4, 6, 9, 12, 15], handle: true, hunt: [0, 0, 0.75, 0.8, 0.95, 0.8] },
  { slot: 'shield', ids: ['hide_quiver', 'scout_quiver', 'ranger_quiver', 'hunter_quiver', 'nightstalker_quiver', 'abyssal_quiver'], twins: ['bronze_buckler', 'iron_shield', 'steel_kite_shield', 'gilded_shield', 'voidsteel_shield', 'abyssal_shield'], leather: [3, 3, 4, 5, 6, 7], sinew: [2, 4, 6, 9, 12, 15], feather: [4, 6, 10, 14, 18, 24], handle: false, hunt: [0.55, 0.75, 0.8, 0.9, 1, 0.85] },
];
// piece id -> [critChance, attackSpeedBonus]: written by scripts/sim/weightBudget.gen.ts, do not edit by hand.
// BEGIN weightBudget.gen
const LEATHER_CONVERSION: Record<string, [number, number]> = {
  hide_jerkin: [0.0708, 0.0738],
  hide_cap: [0.0237, 0.0246],
  hide_bracers: [0.0394, 0.0411],
  hide_shoes: [0.0265, 0.0277],
  hide_quiver: [0.0295, 0.0308],
  scout_leather: [0.0789, 0.0798],
  scout_hood: [0.0263, 0.0266],
  scout_bracers: [0.0439, 0.0444],
  scout_boots: [0.0296, 0.0299],
  scout_quiver: [0.0329, 0.0333],
  ranger_leather: [0.0922, 0.0937],
  ranger_hood: [0.0308, 0.0313],
  ranger_bracers: [0.0513, 0.0521],
  ranger_boots: [0.0345, 0.0351],
  ranger_quiver: [0.0384, 0.039],
  hunter_leather: [0.1003, 0.1006],
  hunter_hood: [0.0335, 0.0336],
  hunter_bracers: [0.0558, 0.056],
  hunter_boots: [0.0376, 0.0377],
  hunter_quiver: [0.0418, 0.0419],
  nightstalker_leather: [0.1085, 0.105],
  nightstalker_hood: [0.0362, 0.035],
  nightstalker_bracers: [0.0604, 0.0584],
  nightstalker_boots: [0.0407, 0.0393],
  nightstalker_quiver: [0.0452, 0.0438],
  abyssal_leather: [0.1191, 0.1132],
  abyssal_hood: [0.0397, 0.0378],
  abyssal_bracers: [0.0662, 0.063],
  abyssal_boots: [0.0446, 0.0424],
  abyssal_quiver: [0.0496, 0.0472],
};
// END weightBudget.gen
const round4 = (x: number): number => Math.round(x * 10000) / 10000;
const LEATHER_HANDLES = ['wood_handle_common', 'wood_handle_oak', 'wood_handle_ebony', 'wood_handle_elven', 'wood_handle_ancient', 'wood_handle_ancient'] as const;
for (const line of LEATHER_LINES) {
  line.ids.forEach((id, i) => {
    const twin = GEAR.find((g) => g.id === line.twins[i]) as GearItem;
    const [crit, speed] = LEATHER_CONVERSION[id] ?? [0, 0];
    const materials: Partial<Record<MaterialId, number>> = { leather: line.leather[i], beast_sinew: line.sinew[i] };
    if (line.feather) materials.feather = line.feather[i];
    if (line.handle) materials[LEATHER_HANDLES[i]] = 1;
    // The hunting and refined families the plate twin of the tier already asks for (bone, blood, crystal, rift / abyss pairs, bars, obsidian...), scaled by hunt[i] so the piece costs
    // about what its twin does (itemBalance.test.ts R7 holds it inside +-15 %). Without them a tier-5 leather piece would need nothing from the late zones. Leather, scrap and
    // handles are the line's own identity above and are not copied. Where hunt[i] is 0 (tiers 1-2 mostly: their twins ask for a bar or two of copper / iron, a few gold of value) the
    // leather, sinew and handle already cost what the twin does, so nothing is copied.
    for (const [m, q] of Object.entries(twin.recipe?.materials ?? {}) as [MaterialId, number][]) {
      if (m === 'leather' || m === 'leather_scrap' || m.startsWith('wood_handle_')) continue;
      const n = Math.round(q * line.hunt[i]);
      if (n > 0) materials[m] = (materials[m] ?? 0) + n;
    }
    const prev = i > 0 ? line.ids[i - 1] : undefined;
    const piece: GearItem = {
      id,
      slot: line.slot,
      nameKey: id,
      descKey: id + '_d',
      materialKey: 'material_leather',
      icon: '/assets/icons/' + id + '.png',
      cost: twin.cost,
      tier: i + 1,
      weight: 'leather',
      recipe: {
        // one piece of the previous tier of the slot, two for the tier-2 armor: the chain rule every line follows (itemBalance.test.ts)
        ...(prev ? { items: { [prev]: i === 1 && line.slot === 'armor' ? 2 : 1 } } : {}),
        materials,
        ...(twin.recipe?.requiredLevel ? { requiredLevel: twin.recipe.requiredLevel } : {}),
      },
    };
    if (twin.maxHp) piece.maxHp = Math.round(twin.maxHp * LEATHER_KEEP);
    if (twin.resistance) piece.resistance = round4(twin.resistance * LEATHER_KEEP);
    if (line.slot === 'gloves' && twin.damage) piece.damage = Math.round(twin.damage * LEATHER_KEEP);
    if (crit > 0) piece.critChance = crit;
    if (speed > 0) piece.attackSpeedBonus = speed;
    GEAR.push(piece);
  });
}

// --- Cloth line (classes reform, phase 2b; docs/CLASSES_E_EQUIPAMENTOS.md 2.1, 2.4): the mage's armor, helmet, gloves, boots and off hand (the grimoire, in the shield slot) ---
// The mirror of the leather line above, and derived the same way: every piece keeps CLOTH_KEEP of its plate twin's defense and returns the rest as crit damage and regeneration, in the amounts that
// scripts/sim/weightBudget.gen.ts solves per tier so a full cloth set is worth the CP of the plate set of the same tier. The twin's reflect and crit chance are not kept (the gloves' damage is, at 60 %).
// The generator also keeps the regeneration it hands out under 80 % (SIGMA_SHARE in weightBudget.gen.ts) of the sustain cap of the CP (cpSustainSigmaCap): past that, every extra point of regeneration stops being worth CP and the
// parity could only be closed by inflating a number the engine no longer credits; whatever the regeneration cannot carry goes to the crit multiplier.
// Unlike the leather line, the cloth fit is centered on the spread of the six conditions (+0 / +4 / +8, with and without set bonuses): its returned stats do not grow with the refine level the way plate defense does.
// The two conversion numbers per piece live in the block between the markers: the generator rewrites it (npx vitest run --config vitest.sim.config.ts weightBudget), and itemBalance.test.ts fails if it goes stale.
export const CLOTH_KEEP = 0.6;
export const CLOTH_LINES: { slot: GearSlot; ids: string[]; twins: string[]; cloth: number[]; dust: number[]; hunt: number[] }[] = [
  // TIERS 1-2 ASK FOR NO ARCANE DUST, on purpose: the dust falls only in the marsh, which opens at dungeon floor 26, so asking for one unit would lock a new mage out of his own first piece until then — the
  // opposite of a starter line. The side effect is worth keeping: each class is now born in a different activity — the warrior in MINING (ore -> bars), the archer in HUNTING (hide and sinew) and the mage
  // in the GARDEN (fibre -> cloth through the Weaving station), which finally gives the Garden a reason to exist beyond potions.
  // Quantities are sized against the real supply AND the cost of the plate twin. Arcane dust falls only in the marsh (about 5 in a 4 h session of a strong hero), so the line asks for a few units: a whole
  // set is 0 units at tiers 1-2, 5 at tier 3 and 12 at tier 6. The tier's cloth (5 fibres each, from the Garden through the Weaving station) is dear in reference Gold (a tier-5 cloth is worth 363 reference Gold, a sinew 2.5), so from
  // tier 3 the cloth that fits is a handful and the rest of the cost comes from the hunting / refined families of the twin (hunt[i], like the leather line, never below 0.5 so no family rounds to zero).
  // The cloth of tier 6 is the tier-5 one, like the wood handle of the tier-6 weapons. Every piece lands within 15 % of its twin's cost (itemBalance.test.ts R7 holds it).
  { slot: 'armor', ids: ['linen_robe', 'homespun_robe', 'silk_vestment', 'arcane_robe', 'lunar_robe', 'voidweave_shroud'], twins: ['bronze_leather', 'iron_chainmail', 'steel_plate', 'gilded_aegis', 'voidsteel_plate', 'abyssal_bulwark'], cloth: [5, 3, 4, 2, 5, 2], dust: [0, 0, 1, 2, 3, 3], hunt: [0, 0.45, 0.6, 0.6, 0.75, 0.7] },
  { slot: 'helmet', ids: ['linen_hood', 'homespun_hood', 'silk_circlet', 'arcane_crown', 'lunar_circlet', 'voidweave_crown'], twins: ['bronze_helm', 'iron_helm', 'steel_helm', 'gilded_helm', 'voidsteel_helm', 'abyssal_helm'], cloth: [2, 2, 1, 1, 4, 1], dust: [0, 0, 1, 1, 2, 2], hunt: [0, 0, 0.75, 0.55, 0.65, 0.65] },
  { slot: 'gloves', ids: ['linen_wraps', 'homespun_gloves', 'silk_gloves', 'arcane_gloves', 'lunar_gloves', 'voidweave_gloves'], twins: ['leather_gloves', 'iron_gauntlets', 'steel_gauntlets', 'gilded_gauntlets', 'voidsteel_gauntlets', 'abyssal_gauntlets'], cloth: [2, 2, 1, 1, 4, 1], dust: [0, 0, 1, 1, 2, 2], hunt: [0, 0, 0.75, 0.55, 0.65, 0.65] },
  { slot: 'boots', ids: ['linen_sandals', 'homespun_shoes', 'silk_slippers', 'arcane_sandals', 'lunar_boots', 'voidweave_boots'], twins: ['leather_boots', 'iron_greaves', 'steel_greaves', 'gilded_greaves', 'voidsteel_greaves', 'abyssal_greaves'], cloth: [2, 2, 1, 1, 4, 1], dust: [0, 0, 1, 1, 2, 2], hunt: [0, 0, 0.75, 0.55, 0.65, 0.65] },
  { slot: 'shield', ids: ['apprentice_tome', 'adept_tome', 'scholar_tome', 'arcane_tome', 'lunar_tome', 'voidweave_tome'], twins: ['bronze_buckler', 'iron_shield', 'steel_kite_shield', 'gilded_shield', 'voidsteel_shield', 'abyssal_shield'], cloth: [2, 2, 1, 1, 4, 1], dust: [0, 0, 1, 2, 2, 3], hunt: [0.55, 0.75, 0.75, 0.65, 0.55, 0.7] },
];
// piece id -> [critMultBonus, hpRegenPct]: written by scripts/sim/weightBudget.gen.ts, do not edit by hand.
// BEGIN weightBudget.cloth.gen
const CLOTH_CONVERSION: Record<string, [number, number]> = {
  linen_robe: [0.6339, 0.00831],
  linen_hood: [0.2116, 0.00277],
  linen_wraps: [0.3527, 0.00462],
  linen_sandals: [0.2376, 0.00312],
  apprentice_tome: [0.2643, 0.00347],
  homespun_robe: [0.6712, 0.0091],
  homespun_hood: [0.2241, 0.00304],
  homespun_gloves: [0.3734, 0.00507],
  homespun_shoes: [0.2515, 0.00341],
  adept_tome: [0.2798, 0.0038],
  silk_vestment: [0.7271, 0.00973],
  silk_circlet: [0.2427, 0.00325],
  silk_gloves: [0.4045, 0.00541],
  silk_slippers: [0.2725, 0.00364],
  scholar_tome: [0.3031, 0.00405],
  arcane_robe: [0.7502, 0.01061],
  arcane_crown: [0.2505, 0.00354],
  arcane_gloves: [0.4174, 0.0059],
  arcane_sandals: [0.2812, 0.00397],
  arcane_tome: [0.3128, 0.00442],
  lunar_robe: [0.7831, 0.01192],
  lunar_circlet: [0.2614, 0.00398],
  lunar_gloves: [0.4356, 0.00663],
  lunar_boots: [0.2935, 0.00447],
  lunar_tome: [0.3264, 0.00497],
  voidweave_shroud: [0.8203, 0.01392],
  voidweave_crown: [0.2739, 0.00465],
  voidweave_gloves: [0.4564, 0.00775],
  voidweave_boots: [0.3074, 0.00522],
  voidweave_tome: [0.342, 0.0058],
};
// END weightBudget.cloth.gen
const CLOTH_FABRICS = ['cloth_linen', 'cloth_cotton', 'cloth_silk', 'cloth_moon', 'cloth_void', 'cloth_void'] as const;
for (const line of CLOTH_LINES) {
  line.ids.forEach((id, i) => {
    const twin = GEAR.find((g) => g.id === line.twins[i]) as GearItem;
    const [critMult, regen] = CLOTH_CONVERSION[id] ?? [0, 0];
    // Each class line is born in a different activity: the warrior in Mining, the archer in Hunting, the mage in the GARDEN (fibre -> Weaving -> cloth). Arcane dust falls only in the marsh (floor 26+),
    // so tiers 1 and 2 ask for none: the first mage pieces must not sit behind a zone the hero has not reached. From tier 3 the dust is the second signature of the line.
    const materials: Partial<Record<MaterialId, number>> = { [CLOTH_FABRICS[i]]: line.cloth[i] };
    if (line.dust[i] > 0) materials.arcane_dust = line.dust[i];
    // The hunting and refined families the plate twin of the tier already asks for, scaled by hunt[i] exactly as the leather line does it (same reason: without them a tier-5 piece would need nothing
    // from the late zones, and the cheap tiers would cost a fraction of their twin). Leather, scrap and handles are the plate / leather lines' own identity and are not copied.
    for (const [m, q] of Object.entries(twin.recipe?.materials ?? {}) as [MaterialId, number][]) {
      if (m === 'leather' || m === 'leather_scrap' || m.startsWith('wood_handle_')) continue;
      const n = Math.round(q * line.hunt[i]);
      if (n > 0) materials[m] = (materials[m] ?? 0) + n;
    }
    const prev = i > 0 ? line.ids[i - 1] : undefined;
    const piece: GearItem = {
      id,
      slot: line.slot,
      nameKey: id,
      descKey: id + '_d',
      materialKey: 'material_cloth',
      icon: '/assets/icons/' + id + '.png',
      cost: twin.cost,
      tier: i + 1,
      weight: 'cloth',
      recipe: {
        // one piece of the previous tier of the slot, two for the tier-2 armor: the chain rule every line follows (itemBalance.test.ts)
        ...(prev ? { items: { [prev]: i === 1 && line.slot === 'armor' ? 2 : 1 } } : {}),
        materials,
        ...(twin.recipe?.requiredLevel ? { requiredLevel: twin.recipe.requiredLevel } : {}),
      },
    };
    if (twin.maxHp) piece.maxHp = Math.round(twin.maxHp * CLOTH_KEEP);
    if (twin.resistance) piece.resistance = round4(twin.resistance * CLOTH_KEEP);
    if (line.slot === 'gloves' && twin.damage) piece.damage = Math.round(twin.damage * CLOTH_KEEP);
    if (critMult > 0) piece.critMultBonus = critMult;
    if (regen > 0) piece.hpRegenPct = regen;
    GEAR.push(piece);
  });
}

// --- Weapon lines (classes reform, phase 3; docs/CLASSES_E_EQUIPAMENTOS.md 2.1, 2.4): the bow and the crossbow (archer), the staff and the scepter (mage) ---
// Derived from the SWORD of the same tier exactly as the armor lines are derived from their plate twins: every weapon keeps WEAPON_KEEP of the sword's damage and the sword's crit chance as its own
// base (without it the scepter, which returns only regeneration, could not close its CP parity inside the sustain limit) and returns the rest as the stats of its line, in the amounts scripts/sim/weightBudget.gen.ts solves per tier so the weapon is worth the CP of the sword (a lone weapon, plate
// everywhere else: the full-set parity of the armor lines is not touched). The bow returns attack speed (crit multiplier only as overflow), the crossbow and the staff crit multiplier, the scepter regeneration;
// the staff burns at every tier (the mage's fire; the sword only from tier 5, and the other lines never). The returned stats are written into the block between the markers; itemBalance.test.ts fails if it goes stale.
// A weapon counts for the set family of the WEIGHT of its class (weaponWeight above): bow and crossbow for the leather family of the tier, staff and scepter for the cloth one, so five leather pieces and a bow
// close the archer's set. The sword and the axe stay exactly as they were (plate family).
// The share of the sword's crit chance a weapon keeps as its own base. The bow keeps half (like the axe, which also trades crit for something else): the leather armor already carries the crit chance of the archer, and a
// bow that stacked the same stat saturated it (see REVIEW IN PHASE 8 below). The bow's budget is returned as attack speed instead.
export const WEAPON_CRIT_KEEP: Record<'bow' | 'crossbow' | 'staff' | 'scepter', number> = { bow: 0.5, crossbow: 1, staff: 1, scepter: 1 };
export const WEAPON_KEEP: Record<'bow' | 'crossbow' | 'staff' | 'scepter', number> = { bow: 0.7, crossbow: 0.85, staff: 0.75, scepter: 0.8 };
export const SWORD_TWINS = ['bronze_dagger', 'iron_short_sword', 'steel_greatsword', 'gilded_warblade', 'voidsteel_blade', 'abyssal_greatblade'] as const;
export const WEAPON_LINES: { line: 'bow' | 'crossbow' | 'staff' | 'scepter'; ids: string[]; leather?: number[]; sinew?: number[]; dust?: number[]; handles: number[]; hunt: number[] }[] = [
  { line: 'bow', ids: ['short_bow', 'hunting_bow', 'long_bow', 'elven_bow', 'moon_bow', 'abyssal_bow'], leather: [8, 7, 8, 8, 10, 10], sinew: [8, 12, 14, 20, 28, 36], handles: [1, 1, 1, 2, 2, 3], hunt: [0, 0.45, 0.8, 0.9, 1, 0.95] },
  { line: 'crossbow', ids: ['light_crossbow', 'iron_crossbow', 'steel_crossbow', 'gilded_crossbow', 'voidsteel_crossbow', 'abyssal_crossbow'], leather: [7, 6, 7, 7, 9, 9], sinew: [8, 12, 16, 22, 30, 40], handles: [2, 2, 1, 2, 2, 3], hunt: [0, 0.45, 0.8, 0.9, 1, 0.95] },
  { line: 'staff', ids: ['apprentice_staff', 'oak_staff', 'ebony_staff', 'elven_staff', 'lunar_staff', 'voidweave_staff'], dust: [0, 0, 2, 3, 4, 5], handles: [4, 3, 2, 3, 3, 4], hunt: [1, 1, 0.95, 1, 1.05, 1.1] },
  // REVIEW IN PHASE 8 (crit chance, the whole game): at tier 6 +8 the hero's crit chance already nears the engine's 1.0 clip on refine (0.04 a piece, 0.28 over seven pieces), the ring (0.145) and the leather line alone; with the PURE
  // sword it is 0.984. That pressure predates the classes reform and is not the leather line's fault; substats, gems and the Olho Agucado skill add on top of it and are clipped. The bow was moved to attack speed for this reason.
  // REVIEW IN PHASE 8: a mage in the full cloth set plus the tier-6 scepter carries about 0.062 hpRegenPct (+8, set bonuses on: cloth pieces ~0.037, set bonus 0.004, scepter 0.020). CP overvalues regeneration (it enters
  // through sigma, capped), the same caveat as the cloth line (phase 2b): the real Dungeon fight is probably worth more to this mage than his CP says, so this number is a candidate for revision once the abilities exist.
  { line: 'scepter', ids: ['copper_scepter', 'iron_scepter', 'silver_scepter', 'gold_scepter', 'obsidian_scepter', 'abyssal_scepter'], dust: [0, 0, 2, 2, 3, 4], handles: [2, 3, 2, 3, 3, 4], hunt: [2, 1, 0.95, 1, 1.05, 1.1] },
];
// piece id -> the returned stats of its line: written by scripts/sim/weightBudget.gen.ts, do not edit by hand.
// BEGIN weightBudget.weapon.gen
const WEAPON_CONVERSION: Record<string, { critChance?: number; attackSpeedBonus?: number; critMultBonus?: number; hpRegenPct?: number }> = {
  short_bow: { attackSpeedBonus: 0.2147 },
  hunting_bow: { attackSpeedBonus: 0.2522 },
  long_bow: { attackSpeedBonus: 0.3116 },
  elven_bow: { attackSpeedBonus: 0.3381 },
  moon_bow: { attackSpeedBonus: 0.4591 },
  abyssal_bow: { attackSpeedBonus: 0.5011 },
  light_crossbow: { critMultBonus: 0.4888 },
  iron_crossbow: { critMultBonus: 0.4964 },
  steel_crossbow: { critMultBonus: 0.5127 },
  gilded_crossbow: { critMultBonus: 0.5502 },
  voidsteel_crossbow: { critMultBonus: 0.593 },
  abyssal_crossbow: { critMultBonus: 0.6064 },
  apprentice_staff: { critMultBonus: 0.5616 },
  oak_staff: { critMultBonus: 0.6515 },
  ebony_staff: { critMultBonus: 0.7264 },
  elven_staff: { critMultBonus: 0.7435 },
  lunar_staff: { critMultBonus: 0.8297 },
  voidweave_staff: { critMultBonus: 0.864 },
  copper_scepter: { hpRegenPct: 0.00584 },
  iron_scepter: { hpRegenPct: 0.00752 },
  silver_scepter: { hpRegenPct: 0.0105 },
  gold_scepter: { hpRegenPct: 0.01095 },
  obsidian_scepter: { hpRegenPct: 0.01661 },
  abyssal_scepter: { hpRegenPct: 0.02025 },
};
// END weightBudget.weapon.gen
for (const line of WEAPON_LINES) {
  line.ids.forEach((id, i) => {
    const twin = GEAR.find((g) => g.id === SWORD_TWINS[i]) as GearItem;
    const conv = WEAPON_CONVERSION[id] ?? {};
    // Tiers 1 and 2 of the staff and the scepter ask for NO arcane dust, for the reason the cloth line gives (it falls only in the marsh, dungeon floor 26+: a new mage must not be locked out of his own first
    // weapon): they are the tier's wood handle (several, the staff is a long piece of wood) and whatever else the sword asks for. From tier 3 the dust is the second signature of the line.
    const materials: Partial<Record<MaterialId, number>> = {};
    if (line.leather) materials.leather = line.leather[i];
    if (line.sinew) materials.beast_sinew = line.sinew[i];
    materials[LEATHER_HANDLES[i]] = line.handles[i];
    if (line.dust && line.dust[i] > 0) materials.arcane_dust = line.dust[i];
    // The hunting and refined families the sword of the tier asks for, scaled by hunt[i] like the armor lines do (without them the weapon would cost a fraction of its twin and skip the late zones). Leather,
    // scrap and handles are the line's own identity above and are not copied.
    for (const [m, q] of Object.entries(twin.recipe?.materials ?? {}) as [MaterialId, number][]) {
      if (m === 'leather' || m === 'leather_scrap' || m.startsWith('wood_handle_')) continue;
      const n = Math.round(q * line.hunt[i]);
      if (n > 0) materials[m] = (materials[m] ?? 0) + n;
    }
    const prev = i > 0 ? line.ids[i - 1] : undefined;
    const piece: GearItem = {
      id,
      slot: 'weapon',
      line: line.line,
      nameKey: id,
      descKey: id + '_d',
      materialKey: line.line === 'bow' || line.line === 'crossbow' ? 'material_leather' : 'material_cloth',
      icon: '/assets/icons/' + id + '.png',
      cost: twin.cost,
      tier: i + 1,
      damage: Math.round((twin.damage ?? 0) * WEAPON_KEEP[line.line]),
      // the chain rule every line follows: one piece of the previous tier of THIS line (the lines never mix), two for the tier-2 weapon
      recipe: {
        ...(prev ? { items: { [prev]: i === 1 ? 2 : 1 } } : {}),
        materials,
        ...(twin.recipe?.requiredLevel ? { requiredLevel: twin.recipe.requiredLevel } : {}),
      },
    };
    const crit = (twin.critChance ?? 0) * WEAPON_CRIT_KEEP[line.line] + (conv.critChance ?? 0);
    if (crit > 0) piece.critChance = round4(crit);
    if (conv.attackSpeedBonus) piece.attackSpeedBonus = conv.attackSpeedBonus;
    if (conv.critMultBonus) piece.critMultBonus = conv.critMultBonus;
    if (conv.hpRegenPct) piece.hpRegenPct = conv.hpRegenPct;
    if (line.line === 'staff') piece.burn = true;
    GEAR.push(piece);
  });
}

// The hero's look per ARMOR template: the armor in the armor slot decides which sheet the hero is drawn with (heroLook in sprites.ts). The order of HERO_LOOKS is the
// progression order (used to tell which looks a hero has already outgrown). Every armor template must be keyed here (gear.test / heroLook.test check it), so a new armor
// cannot ship without a look; uniques take their twin's (UNIQUE_DEFS.like). Weapon, helmet, shield and the other slots never change the sprite.
export const HERO_LOOKS = ['hero_peasant_v2', 'hero_bronze_v2', 'hero_iron_v2', 'hero_steel_v2', 'hero_dark_knight', 'hero_dragon_v2', 'hero_voidsteel_v2', 'hero_abyssal_v2'] as const;
export type HeroBaseLook = (typeof HERO_LOOKS)[number];
// The look of rags / an empty armor slot: never "seen" (no celebration for him).
export const BASE_LOOK: HeroBaseLook = HERO_LOOKS[0];
// Look ids older saves may carry in seenLooks, mapped to the look that replaced them (the owner's new hero art), so a save never loses what it had already seen.
export const LEGACY_LOOK_IDS: Record<string, HeroBaseLook> = { bronze: 'hero_bronze_v2', dragon: 'hero_dragon_v2', iron: 'hero_iron_v2', knight: 'hero_steel_v2', hero_gilded: 'hero_dark_knight', hero_voidsteel: 'hero_voidsteel_v2', hero_abyssal: 'hero_abyssal_v2' };
export const ARMOR_LOOKS: Record<string, HeroBaseLook> = {
  ragged_clothes: 'hero_peasant_v2',
  bronze_leather: 'hero_bronze_v2',
  iron_chainmail: 'hero_iron_v2',
  steel_plate: 'hero_steel_v2',
  gilded_aegis: 'hero_dark_knight',
  dragon_scale_armor: 'hero_dragon_v2',
  voidsteel_plate: 'hero_voidsteel_v2',
  abyssal_bulwark: 'hero_abyssal_v2',
  // On purpose: there is no leather hero art (the owner decided no new hero art for the reform), so every leather armor shows the look of the plate armor of the SAME tier. The hero
  // still progresses visually as he climbs the tiers, and no art has to be drawn.
  hide_jerkin: 'hero_bronze_v2',
  scout_leather: 'hero_iron_v2',
  ranger_leather: 'hero_steel_v2',
  hunter_leather: 'hero_dark_knight',
  nightstalker_leather: 'hero_voidsteel_v2',
  abyssal_leather: 'hero_abyssal_v2',
  // Same on purpose for the cloth robes (phase 2b): no cloth hero art either, so each robe shows the look of the plate armor of its tier.
  linen_robe: 'hero_bronze_v2',
  homespun_robe: 'hero_iron_v2',
  silk_vestment: 'hero_steel_v2',
  arcane_robe: 'hero_dark_knight',
  lunar_robe: 'hero_voidsteel_v2',
  voidweave_shroud: 'hero_abyssal_v2',
};
for (const g of GEAR) if (g.slot === 'armor') g.look = ARMOR_LOOKS[g.id];

// Unique pieces: drop-only (a Hunting zone or a Dungeon biome boss rolls them, uniques.ts), never forged (no recipe), instanced like every other piece.
// Stats = the forged piece of the tier the hero has when he reaches the source (the tier that is CRAFTABLE there, not the one before it), with the main stat
// UNIQUE_MAIN_BOOST higher and every other stat UNIQUE_OTHER_BOOST higher; every unique also rolls ONE extra substat slot (rarity.ts rollSubstats), so a
// legendary one carries four. Worth about 10-15 % more piece power than the forged twin (itemBalance.test.ts), plus the substat: rare and desirable, never
// required. Salvaging one returns what its forged twin's recipe does (salvageLike).
export const UNIQUE_MAIN_BOOST = 1.15;
export const UNIQUE_OTHER_BOOST = 1.08;
const UNIQUE_MAIN_STAT: Record<string, 'damage' | 'maxHp' | 'resistance' | 'critChance'> = {
  weapon: 'damage',
  armor: 'maxHp',
  helmet: 'maxHp',
  gloves: 'damage',
  boots: 'resistance',
  ring: 'critChance',
  shield: 'resistance',
};
const UNIQUE_DEFS: { id: string; like: string; source: GearSource }[] = [
  { id: 'demon_fang_dagger', like: 'iron_short_sword', source: { zone: 'demon_glade' } },
  { id: 'demonhide_vest', like: 'iron_chainmail', source: { zone: 'demon_glade' } },
  { id: 'bloodbound_cleaver', like: 'steel_greatsword', source: { zone: 'blood_marsh' } },
  { id: 'bloodvein_plate', like: 'steel_plate', source: { zone: 'blood_marsh' } },
  { id: 'bone_ward', like: 'steel_kite_shield', source: { zone: 'blood_marsh' } },
  { id: 'riftwalker_boots', like: 'gilded_greaves', source: { zone: 'demon_rift' } },
  { id: 'shadow_hood', like: 'gilded_helm', source: { zone: 'demon_rift' } },
  { id: 'abyss_heart_ring', like: 'abyssal_ring', source: { zone: 'blood_abyss' } },
  { id: 'bonecrusher_maul', like: 'abyssal_greatblade', source: { zone: 'blood_abyss' } },
  { id: 'goblin_king_crown', like: 'steel_helm', source: { bossFloor: 25 } },
  { id: 'warchief_gauntlets', like: 'gilded_gauntlets', source: { bossFloor: 50 } },
  { id: 'warden_bulwark', like: 'gilded_shield', source: { bossFloor: 50 } },
  { id: 'lich_soul_ring', like: 'obsidian_ring', source: { bossFloor: 75 } },
  { id: 'overlord_greataxe', like: 'abyssal_reaver', source: { bossFloor: 100 } },
];
for (const u of UNIQUE_DEFS) {
  const base = GEAR.find((g) => g.id === u.like) as GearItem;
  const main = UNIQUE_MAIN_STAT[base.slot];
  const boost = (field: 'damage' | 'maxHp' | 'resistance' | 'critChance' | 'critMultBonus' | 'reflect'): number | undefined => {
    const v = base[field];
    if (!v) return undefined;
    const x = v * (field === main ? UNIQUE_MAIN_BOOST : UNIQUE_OTHER_BOOST);
    return field === 'damage' || field === 'maxHp' ? Math.round(x) : Math.round(x * 10000) / 10000;
  };
  GEAR.push({
    id: u.id,
    slot: base.slot,
    nameKey: u.id,
    descKey: u.id + '_d',
    materialKey: base.materialKey,
    icon: '/assets/icons/' + u.id + '.png',
    cost: base.cost,
    tier: base.tier,
    damage: boost('damage'),
    critChance: boost('critChance'),
    maxHp: boost('maxHp'),
    resistance: boost('resistance'),
    critMultBonus: boost('critMultBonus'),
    look: base.look,
    line: base.line,
    // The twin's effects carry over: a unique weapon of a burning line still burns, a unique plate still reflects.
    burn: base.burn,
    reflect: boost('reflect'),
    unique: true,
    source: u.source,
    salvageLike: base.id,
  });
}

const GEAR_BY_ID: Record<string, GearItem> = Object.fromEntries(GEAR.map((g) => [g.id, g]));

// Set family of every instanced piece of tier 1 and up (relics and the tier-0 starters belong to none); a unique counts as its twin.
for (const g of GEAR) {
  if (g.slot === 'relic' || !(g.tier && g.tier >= 1)) continue;
  const base = g.salvageLike ? GEAR_BY_ID[g.salvageLike] : g;
  g.setFamily = base.materialKey === 'material_dragon' ? 'dragon' : (weaponWeight(base) === 'leather' ? LEATHER_FAMILY_BY_TIER : weaponWeight(base) === 'cloth' ? CLOTH_FAMILY_BY_TIER : FAMILY_BY_TIER)[base.tier as number];
}

// The families a piece counts for: its own, and a dragon piece also counts as a gilded one (it is the gilded weapon / armor made better, and the family only has
// a weapon and an armor, so it could never reach a three-piece bonus alone).
export function setFamiliesOf(item: GearItem | null | undefined): SetFamily[] {
  if (!item?.setFamily) return [];
  return item.setFamily === 'dragon' ? ['dragon', 'gilded'] : [item.setFamily];
}

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

// The hero level a piece needs to be WORN (and the lowest it can be forged at): a crafted piece needs its recipe's requiredLevel, a piece made from a previous piece inherits that one's
// gate, a unique takes its twin's (salvageLike); starters, tier 1 and the relics have none (0). One definition for the forge, the equip rule (gearInstances.equipBlock), the UI and the
// server tables (scripts/sim/seasonTablesBuild.ts generates GEAR_LEVEL_GATES from it, so the anti-cheat and bind-item judge with the same number).
export function gearRequiredLevel(g: GearItem | string | undefined | null): number {
  const item = typeof g === 'string' ? GEAR_BY_ID[g] : g;
  if (!item) return 0;
  let gate = item.recipe?.requiredLevel ?? 0;
  for (const inputId of Object.keys(item.recipe?.items ?? {})) {
    const input = GEAR_BY_ID[inputId];
    if (input && input !== item) gate = Math.max(gate, gearRequiredLevel(input));
  }
  if (item.salvageLike) {
    const twin = GEAR_BY_ID[item.salvageLike];
    if (twin && twin !== item) gate = Math.max(gate, gearRequiredLevel(twin));
  }
  return gate;
}

// Percent extra character XP of the worn relic (the Season Relic); 0 for none.
export const relicXpBonusPct = (relicId: string | null | undefined): number => (relicId ? getGear(relicId)?.xpBonusPct ?? 0 : 0);

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
      // v1 saves never had instanced helmets / gloves / boots / rings / shields (the old `helmet` was an unused stackable slot, always null).
      helmet: null,
      gloves: null,
      boots: null,
      ring: null,
      shield: null,
    },
  };
}

// --- Refinement (+0 .. +8, and +9 .. +12 for tier 5 and 6 pieces: round 16, T.lateSinks) ---
export const BASE_MAX_REFINE = 8;
export const MAX_REFINE = 12; // the highest level any piece can have; a piece's own ceiling is maxRefineFor(item)

// Tier 5 and 6 pieces go on to +12; everything below stops at +8 like before.
export const maxRefineFor = (item: { tier?: number } | undefined | null): number => ((item?.tier ?? 0) >= T.lateSinks.deepMinTier ? MAX_REFINE : BASE_MAX_REFINE);

// The share of the base stat that refine level `level` adds: 10% a level up to +8, deepBonus (6%) a level after that.
export const refineBonus = (level: number): number => {
  const l = Math.max(0, level);
  return 0.1 * Math.min(l, BASE_MAX_REFINE) + T.lateSinks.deepBonus * Math.max(0, l - BASE_MAX_REFINE);
};
// The same two speeds for the flat crit / resistance a refine level adds (0.5 points a level, deepBonus / 0.1 of that past +8).
const refineFlat = (level: number): number => {
  const l = Math.max(0, level);
  return 0.005 * Math.min(l, BASE_MAX_REFINE) + 0.005 * (T.lateSinks.deepBonus / 0.1) * Math.max(0, l - BASE_MAX_REFINE);
};

// Stackable gear (relics) for a v2 save. Weapons / armors live in save.gearInstances.
export function sanitizeStackableGear(
  inventory: Record<string, number> | undefined,
  equipped: Partial<EquippedGear> | undefined,
): { inventory: Record<string, number>; equipped: Pick<EquippedGear, 'relic'> } {
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
    },
  };
}

export function effectiveDamage(item: GearItem, level: number): number {
  return Math.round((item.damage ?? 0) * (1 + refineBonus(level)));
}

export function effectiveMaxHp(item: GearItem, level: number): number {
  return Math.round((item.maxHp ?? 0) * (1 + refineBonus(level)));
}

export function effectiveCrit(item: GearItem, level: number): number {
  return (item.critChance ?? 0) + refineFlat(level);
}

export function effectiveResistance(item: GearItem, level: number): number {
  return (item.resistance ?? 0) + refineFlat(level);
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

// Refine +4..+8 also eats the Hunting materials of the piece's tier (Rodada 9, docs/MATERIAL_FLOW.md): a recurring sink for what the hunts bring in, scaled by
// tier. The family follows where the tier is hunted: glade (scrap / claw / core) for tiers 1-2, marsh (bone / blood / crystal) for 3-4, rift and abyss after.
// Attempts to +4..+6 (current level 3-5) ask for the common one; +7 and +8 (level 6-7) also the uncommon and the rare one. Quantities per ATTEMPT.
const REFINE_HUNT_FAMILY: Record<number, [MaterialId, MaterialId, MaterialId]> = {
  1: ['leather_scrap', 'demon_claw', 'demon_core'],
  2: ['leather_scrap', 'demon_claw', 'demon_core'],
  3: ['bone_fragment', 'concentrated_blood', 'corrupted_crystal'],
  4: ['bone_fragment', 'concentrated_blood', 'corrupted_crystal'],
  5: ['bone_fragment', 'rift_shard', 'fiend_horn'],
  6: ['bone_fragment', 'abyssal_marrow', 'blood_heart'],
};
// [attempts to +4..+6: bone, attempts to +7 and +8: bone, uncommon, rare] of tiers 5 and 6; the rare is asked from the +8 attempt only (a single unit per attempt is already what an hour of that drop is worth).
const LATE_REFINE_HUNT: Record<5 | 6, [number, number, number, number]> = { 5: [10,15,2,0], 6: [10,16,2,1] };
const LATE_REFINE_RARE_FROM = 7;
export function refineHuntMaterials(tier: number, level: number): Partial<Record<MaterialId, number>> {
  if (level < 3) return {};
  const t = Math.min(6, Math.max(1, tier));
  const [common, uncommon, rare] = REFINE_HUNT_FAMILY[t];
  // Round 17: tiers 5 and 6 take the bone, the uncommon and the rare of the two zones that were cut (huntingZones.ts) in the amounts that keep the hours of hunting a step takes (docs/BALANCE_CHANGES.md, Rodada 17).
  if (t >= 5) {
    const [mid, c, u, r] = LATE_REFINE_HUNT[t as 5 | 6];
    return level < 6 ? { [common]: mid } : { [common]: c, [uncommon]: u, ...(level >= LATE_REFINE_RARE_FROM && r > 0 ? { [rare]: r } : {}) };
  }
  if (level < 6) return { [common]: 5 * t };
  return { [common]: 8 * t, [uncommon]: 3 * t, [rare]: Math.ceil(t / 2) };
}

export interface UpgradeCost {
  gold: number;
  materials?: Partial<Record<MaterialId, number>>;
  shards?: number;
}

// One farm hour of the last zone, in units of each drop (T.lateSinks.hour*; docs/BALANCE_CHANGES.md, Rodada 16). The cost of every late-game sink is written in farm hours.
export function farmHours(hours: number): Partial<Record<MaterialId, number>> {
  const L = T.lateSinks;
  const to5 = (n: number) => Math.max(1, Math.round(n));
  const to1 = (n: number) => Math.max(1, Math.round(n));
  return {
    concentrated_blood: to5(hours * L.hourBlood),
    abyssal_marrow: to5(hours * L.hourMarrow),
    corrupted_crystal: to1(hours * L.hourCrystal),
    blood_heart: to1(hours * L.hourHeart),
  };
}

// Index = the level the attempt starts from, minus 8 (+8 -> +9 is index 0).
const deepAt = (level: number): number => Math.min(3, Math.max(0, level - BASE_MAX_REFINE));
function deepCost(item: GearItem, level: number): UpgradeCost {
  const L = T.lateSinks;
  const i = deepAt(level);
  const hours = [L.deepHours9, L.deepHours10, L.deepHours11, L.deepHours12][i] * ((item.tier ?? 1) >= 6 ? 1 : L.deepTier5Share);
  return { gold: [L.deepGold9, L.deepGold10, L.deepGold11, L.deepGold12][i], materials: farmHours(hours), shards: i >= 2 ? L.deepShards : 0 };
}

export function upgradeCost(item: GearItem, level: number): UpgradeCost {
  if (level >= BASE_MAX_REFINE) return deepCost(item, level);
  const cost = baseUpgradeCost(item, level);
  if ((item.tier ?? 0) < T.lateSinks.lateRefineMinTier) return cost;
  return { ...cost, gold: Math.round(cost.gold * T.lateSinks.lateRefineGoldShare), ...((cost.shards ?? 0) > 0 ? { shards: T.lateSinks.lateRefineShards } : {}) };
}

function baseUpgradeCost(item: GearItem, level: number): UpgradeCost {
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
    const materials: Partial<Record<MaterialId, number>> = { [mat]: refined ? 1 : 2, ...refineHuntMaterials(item.tier ?? 1, level) };
    if (dust > 0) materials.refining_dust = dust;
    return { gold: 150 * (level + 1), materials };
  }
  return { gold: 300 * (level + 1), materials: { [mat]: refined ? 1 : 3, ...refineHuntMaterials(item.tier ?? 1, level), refining_dust: dust }, shards: 2 };
}

export function upgradeChance(level: number): number {
  if (level < 3) return 1;
  if (level === 3) return 0.8;
  if (level === 4) return 0.7;
  if (level === 5) return 0.6;
  if (level === 6) return 0.45;
  if (level === 7) return 0.3;
  if (level >= MAX_REFINE) return 0;
  const L = T.lateSinks;
  return [L.deepChance9, L.deepChance10, L.deepChance11, L.deepChance12][deepAt(level)];
}

// A failed attempt never destroys the piece. Past +8 it may cost the level it was on: the chance that a failed attempt FROM `level` drops it one level (never below +8).
export function upgradeFailDrop(level: number): number {
  const L = T.lateSinks;
  if (level <= BASE_MAX_REFINE || level >= MAX_REFINE) return 0;
  return [0, L.deepDrop10, L.deepDrop11, L.deepDrop12][deepAt(level)];
}
