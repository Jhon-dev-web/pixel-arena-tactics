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
  | 'leather_scrap'
  | 'demon_claw'
  | 'demon_core'
  | 'bone_fragment'
  | 'concentrated_blood'
  | 'corrupted_crystal';

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
  // Open Hunting drops — never sold via the Shop, exclusive to monster drops
  { id: 'leather_scrap', nameKey: 'mat_leather_scrap', icon: '🟫', iconUrl: '/assets/icons/leather_scrap.png', packSize: 5, packCost: 30, sellValue: 4 },
  { id: 'demon_claw', nameKey: 'mat_demon_claw', icon: '🐾', iconUrl: '/assets/icons/demon_claw.png', packSize: 3, packCost: 120, sellValue: 22 },
  { id: 'demon_core', nameKey: 'mat_demon_core', icon: '🟣', iconUrl: '/assets/icons/demon_core.png', packSize: 1, packCost: 800, sellValue: 180 },
  { id: 'bone_fragment', nameKey: 'mat_bone_fragment', icon: '🦴', iconUrl: '/assets/icons/bone_fragment.png', packSize: 5, packCost: 30, sellValue: 4 },
  { id: 'concentrated_blood', nameKey: 'mat_concentrated_blood', icon: '🩸', iconUrl: '/assets/icons/concentrated_blood.png', packSize: 3, packCost: 120, sellValue: 22 },
  { id: 'corrupted_crystal', nameKey: 'mat_corrupted_crystal', icon: '🔮', iconUrl: '/assets/icons/corrupted_crystal.png', packSize: 1, packCost: 800, sellValue: 180 },
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
    leather_scrap: 0,
    demon_claw: 0,
    demon_core: 0,
    bone_fragment: 0,
    concentrated_blood: 0,
    corrupted_crystal: 0,
  };
}

export function hasMaterials(have: Materials, need: Partial<Record<MaterialId, number>>): boolean {
  for (const [k, v] of Object.entries(need ?? {}) as [MaterialId, number][]) {
    if ((have[k] ?? 0) < v) return false;
  }
  return true;
}
