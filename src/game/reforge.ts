import type { SaveData } from './engine';
import { getGear, reforgeGoldCost } from './gear';
import { hasMaterials, MaterialId } from './materials';
import { rarityDef, rollSubstats } from './rarity';
import T from './tunables';

export interface ReforgeCost {
  gold: number;
  shards: number;
  materials: Partial<Record<MaterialId, number>>;
}

// Costs add material utility without changing affix count, ranges, rarity or combat formulas.
// Equipment metadata is currently keyed by gear TYPE; the UI explicitly discloses that scope.
export function getReforgeCost(save: SaveData, id: string): ReforgeCost | null {
  const item = getGear(id);
  if (!item || (item.slot !== 'weapon' && item.slot !== 'armor') || !(save.inventory[id] > 0)) return null;
  const rarity = save.itemRarity?.[id] ?? 'common';
  if (rarityDef(rarity).substatCount === 0) return null;
  const cfg = T.economySinks;
  const advanced = (item.tier ?? 0) >= cfg.reforgeAdvancedTier;
  const count = save.reforgeCount?.[id];
  const prior = Number.isFinite(count) ? Math.max(0, Math.floor(count!)) : 0;
  const materials: ReforgeCost['materials'] = {
    refining_dust: advanced ? cfg.reforgeAdvancedDust : cfg.reforgeBasicDust,
    [item.slot === 'weapon' ? 'demon_claw' : 'concentrated_blood']:
      advanced ? cfg.reforgeAdvancedRefined : cfg.reforgeBasicRefined,
  };
  if (advanced) materials[item.slot === 'weapon' ? 'demon_core' : 'corrupted_crystal'] = cfg.reforgeAdvancedNoble;
  return { gold: reforgeGoldCost(prior), shards: 1, materials };
}

export function canAffordReforge(save: SaveData, cost: ReforgeCost): boolean {
  return Number.isFinite(save.gold) && save.gold >= cost.gold
    && Number.isFinite(save.shards) && save.shards >= cost.shards
    && Object.keys(cost.materials).every(id => Number.isFinite(save.materials[id as MaterialId]))
    && hasMaterials(save.materials, cost.materials);
}

// One atomic transition; a rejected action never charges resources or invokes RNG.
export function applyReforge(save: SaveData, id: string): SaveData | null {
  const cost = getReforgeCost(save, id);
  if (!cost || !canAffordReforge(save, cost)) return null;
  const item = getGear(id);
  const materials = { ...save.materials };
  for (const [mid, qty] of Object.entries(cost.materials)) materials[mid as MaterialId] -= qty;
  const count = save.reforgeCount?.[id];
  const prior = Number.isFinite(count) ? Math.max(0, Math.floor(count!)) : 0;
  return {
    ...save,
    gold: save.gold - cost.gold,
    shards: save.shards - cost.shards,
    materials,
    itemSubstats: { ...save.itemSubstats, [id]: rollSubstats(save.itemRarity[id], item.tier ?? 0) },
    reforgeCount: { ...save.reforgeCount, [id]: prior + 1 },
  };
}
