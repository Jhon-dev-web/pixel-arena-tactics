import Assets from '../assets.json';

export type MaterialId =
  | 'iron'
  | 'steel'
  | 'leather'
  | 'essence'
  | 'dragon_scales'
  | 'copper'
  | 'silver'
  | 'gold_ore'
  | 'obsidian'
  | 'silver_ingot'
  | 'gold_bar'
  | 'refined_obsidian'
  | 'leather_scrap'
  | 'demon_claw'
  | 'demon_core'
  | 'bone_fragment'
  | 'concentrated_blood'
  | 'corrupted_crystal'
  | 'common_herb'
  | 'uncommon_root'
  | 'rare_flower'
  | 'refining_dust'
  | 'common_wood'
  | 'oak_wood'
  | 'ebony_wood'
  | 'elven_wood'
  | 'ancient_wood'
  | 'wood_handle_common'
  | 'wood_handle_oak'
  | 'wood_handle_ebony'
  | 'wood_handle_elven'
  | 'wood_handle_ancient';

export type DropRarity = 'common' | 'uncommon' | 'rare';

export type Materials = Record<MaterialId, number>;

export interface MaterialDef {
  id: MaterialId;
  nameKey: string;
  icon: string;
  iconUrl?: string;
  packSize: number;
  packCost: number;
  sellValue: number;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'iron', nameKey: 'mat_iron', icon: '🪨', iconUrl: Assets.icons.ore.url, packSize: 5, packCost: 50, sellValue: 5 },
  { id: 'steel', nameKey: 'mat_steel', icon: '🔩', iconUrl: Assets.icons.steel.url, packSize: 3, packCost: 150, sellValue: 25 },
  { id: 'leather', nameKey: 'mat_leather', icon: '🟤', iconUrl: Assets.icons.leather.url, packSize: 3, packCost: 45, sellValue: 7 },
  { id: 'essence', nameKey: 'mat_essence', icon: '🔮', iconUrl: Assets.icons.essence.url, packSize: 2, packCost: 200, sellValue: 50 },
  { id: 'dragon_scales', nameKey: 'mat_dragon_scales', icon: '🟥', iconUrl: Assets.icons.dragon_scales.url, packSize: 2, packCost: 250, sellValue: 60 },
  { id: 'copper', nameKey: 'mat_copper', icon: '🟠', iconUrl: '/assets/icons/ore_copper.png', packSize: 5, packCost: 20, sellValue: 3 },
  { id: 'silver', nameKey: 'mat_silver', icon: '⚪', iconUrl: '/assets/icons/ore_silver.png', packSize: 4, packCost: 120, sellValue: 15 },
  { id: 'gold_ore', nameKey: 'mat_gold_ore', icon: '🟡', iconUrl: '/assets/icons/ore_gold.png', packSize: 3, packCost: 400, sellValue: 45 },
  { id: 'obsidian', nameKey: 'mat_obsidian', icon: '🟣', iconUrl: '/assets/icons/ore_obsidian.png', packSize: 2, packCost: 900, sellValue: 110 },
  // Furnace-refined — never mined/dropped directly, only produced by converting the raw ore above
  { id: 'silver_ingot', nameKey: 'mat_silver_ingot', icon: '🥈', packSize: 3, packCost: 450, sellValue: 75 },
  { id: 'gold_bar', nameKey: 'mat_gold_bar', icon: '🥇', packSize: 2, packCost: 900, sellValue: 225 },
  { id: 'refined_obsidian', nameKey: 'mat_refined_obsidian', icon: '💠', packSize: 1, packCost: 1100, sellValue: 550 },
  // Open Hunting drops — never sold via the Shop, exclusive to monster drops
  { id: 'leather_scrap', nameKey: 'mat_leather_scrap', icon: '🟫', iconUrl: '/assets/icons/leather_scrap.png', packSize: 5, packCost: 30, sellValue: 4 },
  { id: 'demon_claw', nameKey: 'mat_demon_claw', icon: '🐾', iconUrl: '/assets/icons/demon_claw.png', packSize: 3, packCost: 120, sellValue: 22 },
  { id: 'demon_core', nameKey: 'mat_demon_core', icon: '🟣', iconUrl: '/assets/icons/demon_core.png', packSize: 1, packCost: 800, sellValue: 180 },
  { id: 'bone_fragment', nameKey: 'mat_bone_fragment', icon: '🦴', iconUrl: '/assets/icons/bone_fragment.png', packSize: 5, packCost: 30, sellValue: 4 },
  { id: 'concentrated_blood', nameKey: 'mat_concentrated_blood', icon: '🩸', iconUrl: '/assets/icons/concentrated_blood.png', packSize: 3, packCost: 120, sellValue: 22 },
  { id: 'corrupted_crystal', nameKey: 'mat_corrupted_crystal', icon: '🔮', iconUrl: '/assets/icons/corrupted_crystal.png', packSize: 1, packCost: 800, sellValue: 180 },
  // Garden harvests — Alchemy ingredients (erva/raiz/flor), never dropped by Hunting/Mining/Dungeon.
  { id: 'common_herb', nameKey: 'mat_common_herb', icon: '🌿', packSize: 5, packCost: 20, sellValue: 3 },
  { id: 'uncommon_root', nameKey: 'mat_uncommon_root', icon: '🥕', packSize: 3, packCost: 90, sellValue: 15 },
  { id: 'rare_flower', nameKey: 'mat_rare_flower', icon: '🌸', packSize: 1, packCost: 300, sellValue: 65 },
  // Refining-only sink for surplus common materials (see refining.ts DUST_RECIPES) — never dropped/mined,
  // and never sold, only ever produced and spent inside the Forge's Refino tab.
  { id: 'refining_dust', nameKey: 'mat_refining_dust', icon: '🌫️', packSize: 1, packCost: 0, sellValue: 0 },
  // Woodcutting — mirrors Mining exactly (tier-gated raw material, zero gold by design). Never sold.
  { id: 'common_wood', nameKey: 'mat_common_wood', icon: '🪵', packSize: 5, packCost: 20, sellValue: 3 },
  { id: 'oak_wood', nameKey: 'mat_oak_wood', icon: '🌳', packSize: 4, packCost: 60, sellValue: 8 },
  { id: 'ebony_wood', nameKey: 'mat_ebony_wood', icon: '🪵', packSize: 3, packCost: 150, sellValue: 20 },
  { id: 'elven_wood', nameKey: 'mat_elven_wood', icon: '🌲', packSize: 2, packCost: 350, sellValue: 45 },
  { id: 'ancient_wood', nameKey: 'mat_ancient_wood', icon: '🌴', packSize: 1, packCost: 700, sellValue: 90 },
  // Carpentry-refined — never chopped/dropped directly, only produced by converting the raw wood above.
  { id: 'wood_handle_common', nameKey: 'mat_wood_handle_common', icon: '🥢', packSize: 1, packCost: 0, sellValue: 12 },
  { id: 'wood_handle_oak', nameKey: 'mat_wood_handle_oak', icon: '🥢', packSize: 1, packCost: 0, sellValue: 32 },
  { id: 'wood_handle_ebony', nameKey: 'mat_wood_handle_ebony', icon: '🥢', packSize: 1, packCost: 0, sellValue: 80 },
  { id: 'wood_handle_elven', nameKey: 'mat_wood_handle_elven', icon: '🥢', packSize: 1, packCost: 0, sellValue: 180 },
  { id: 'wood_handle_ancient', nameKey: 'mat_wood_handle_ancient', icon: '🥢', packSize: 1, packCost: 0, sellValue: 360 },
];

export function getMaterial(id: MaterialId): MaterialDef | undefined {
  return MATERIALS.find((m) => m.id === id);
}

export function materialIconUrl(id: MaterialId): string {
  return MATERIALS.find((m) => m.id === id)?.iconUrl ?? '';
}

export function emptyMaterials(): Materials {
  return {
    iron: 0,
    steel: 0,
    leather: 0,
    essence: 0,
    dragon_scales: 0,
    copper: 0,
    silver: 0,
    gold_ore: 0,
    obsidian: 0,
    silver_ingot: 0,
    gold_bar: 0,
    refined_obsidian: 0,
    leather_scrap: 0,
    demon_claw: 0,
    demon_core: 0,
    bone_fragment: 0,
    concentrated_blood: 0,
    corrupted_crystal: 0,
    common_herb: 0,
    uncommon_root: 0,
    rare_flower: 0,
    refining_dust: 0,
    common_wood: 0,
    oak_wood: 0,
    ebony_wood: 0,
    elven_wood: 0,
    ancient_wood: 0,
    wood_handle_common: 0,
    wood_handle_oak: 0,
    wood_handle_ebony: 0,
    wood_handle_elven: 0,
    wood_handle_ancient: 0,
  };
}

export function hasMaterials(have: Materials, need: Partial<Record<MaterialId, number>>): boolean {
  for (const [k, v] of Object.entries(need ?? {}) as [MaterialId, number][]) {
    if ((have[k] ?? 0) < v) return false;
  }
  return true;
}
