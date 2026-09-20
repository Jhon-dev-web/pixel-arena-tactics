import type { SaveData } from './engine';
import { reforgeGoldCost } from './gear';
import { GearInstanceId, resolveGearInstance } from './gearInstances';
import { hasMaterials, MaterialId } from './materials';
import { rarityDef, rollSubstats } from './rarity';
import T from './tunables';

// Economic reforge ("Pacote A"), per GEAR INSTANCE: rerolls ALL substats of the selected piece. Rarity, refine level,
// sockets and durability never change, and no other copy is touched. The Gold price escalates with THAT instance's own
// reforgeCount (gear.reforgeGoldCost); materials come from the piece's family:
//   weapon: Demon Claw (refined) / Demon Core (noble)   armor: Concentrated Blood (refined) / Corrupted Crystal (noble)
// plus Refining Dust in both cases. Tier < reforgeAdvancedTier pays the basic bundle (no noble); tier >= it pays the
// advanced one. Every number lives in T.economySinks.

export interface ReforgeCost {
  gold: number;
  shards: number;
  materials: Partial<Record<MaterialId, number>>;
}

const qty = (n: number): number => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));

// null = this piece cannot be reforged (unknown instance, or rarity with no substats to reroll).
export function getReforgeCost(save: Pick<SaveData, 'gearInstances'>, id: GearInstanceId): ReforgeCost | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return null;
  const { instance, item } = hit;
  if (item.slot !== 'weapon' && item.slot !== 'armor') return null;
  if (rarityDef(instance.rarity).substatCount === 0) return null;
  const cfg = T.economySinks;
  const advanced = (item.tier ?? 0) >= cfg.reforgeAdvancedTier;
  const weapon = item.slot === 'weapon';
  const materials: ReforgeCost['materials'] = {
    refining_dust: qty(advanced ? cfg.reforgeAdvancedDust : cfg.reforgeBasicDust),
    [weapon ? 'demon_claw' : 'concentrated_blood']: qty(advanced ? cfg.reforgeAdvancedRefined : cfg.reforgeBasicRefined),
  };
  if (advanced) materials[weapon ? 'demon_core' : 'corrupted_crystal'] = qty(cfg.reforgeAdvancedNoble);
  return { gold: reforgeGoldCost(instance.reforgeCount), shards: 1, materials };
}

export function canAffordReforge(save: Pick<SaveData, 'gold' | 'shards' | 'materials'>, cost: ReforgeCost): boolean {
  return (
    Number.isFinite(save.gold) &&
    save.gold >= cost.gold &&
    Number.isFinite(save.shards) &&
    save.shards >= cost.shards &&
    Object.keys(cost.materials).every((m) => Number.isFinite(save.materials[m as MaterialId])) &&
    hasMaterials(save.materials, cost.materials)
  );
}

// One atomic transition. A rejected reforge (unknown instance, common rarity, any missing resource) returns null:
// nothing is charged, no RNG is consumed and reforgeCount does not move. On success only THIS instance changes.
export function applyReforge(save: SaveData, id: GearInstanceId): SaveData | null {
  const cost = getReforgeCost(save, id);
  if (!cost || !canAffordReforge(save, cost)) return null;
  const { instance, item } = resolveGearInstance(save, id)!;
  const materials = { ...save.materials };
  for (const [mid, need] of Object.entries(cost.materials)) materials[mid as MaterialId] -= need as number;
  return {
    ...save,
    gold: save.gold - cost.gold,
    shards: save.shards - cost.shards,
    materials,
    gearInstances: {
      ...save.gearInstances,
      [id]: { ...instance, substats: rollSubstats(instance.rarity, item.tier ?? 0), reforgeCount: instance.reforgeCount + 1 },
    },
  };
}
