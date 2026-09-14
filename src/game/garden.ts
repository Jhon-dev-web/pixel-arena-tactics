import { MaterialId } from './materials';

export type PlantId = 'common_herb' | 'uncommon_root' | 'rare_flower';

export interface PlantDef {
  id: PlantId;
  nameKey: string;
  descKey: string;
  icon: string;
  material: MaterialId;
  qty: number;
  durationMs: number;
  // Gardening SKILL level required (see skills.ts) — not character level.
  requiredLevel: number;
}

// Single-slot Garden: one plant growing at a time, fixed duration, one harvest per planting (no
// continued accrual once ready — unlike Mining/Hunting's capped-but-continuous accrual). Duration
// scales the same way Hunting depth / Expedition length do: longer wait, better material tier.
export const PLANTS: PlantDef[] = [
  { id: 'common_herb', nameKey: 'plant_common_herb', descKey: 'plant_common_herb_d', icon: '🌿', material: 'common_herb', qty: 2, durationMs: 2 * 3600 * 1000, requiredLevel: 1 },
  { id: 'uncommon_root', nameKey: 'plant_uncommon_root', descKey: 'plant_uncommon_root_d', icon: '🥕', material: 'uncommon_root', qty: 1, durationMs: 6 * 3600 * 1000, requiredLevel: 15 },
  { id: 'rare_flower', nameKey: 'plant_rare_flower', descKey: 'plant_rare_flower_d', icon: '🌸', material: 'rare_flower', qty: 1, durationMs: 12 * 3600 * 1000, requiredLevel: 35 },
];

export function getPlant(id: string): PlantDef | undefined {
  return PLANTS.find((p) => p.id === id);
}
