import { farmHours } from './gear';
import { playerLevel, type SaveData } from './engine';
import { GearInstanceId, resolveGearInstance } from './gearInstances';
import { hasMaterials, MaterialId } from './materials';
import { Rng, rollSubstat, Substat, SubstatType } from './rarity';
import { recordLapidar } from './stats';
import T from './tunables';

// Lapidar (round 16): the targeted reforge. The player locks ONE substat of an Epic or Legendary piece (type and value stay) and the others are rolled again,
// excluding the locked type. It is the chase of the late game: unlike the economic reforge (reforge.ts, which rerolls everything for a bundle of Gold, Runa, dust and
// mid-tier drops), a good roll is never at risk, so players keep paying for the rest of the piece. The price is written in farm hours of the last zone
// (T.lateSinks, gear.farmHours), grows with every earlier lapidation on THAT piece (GearInstance.lapidarCount) and also asks Gold and Runas.
// Rarity, refine level, sockets, durability, the bound flag and every other copy stay as they were. All-or-nothing, like every reducer here.

export interface LapidarCost {
  gold: number;
  shards: number;
  hours: number;
  materials: Partial<Record<MaterialId, number>>;
}

export type LapidarBlock = 'unknown' | 'level' | 'tier' | 'rarity';

const hoursForTier = (tier: number): number => (tier >= 6 ? T.lateSinks.lapidarHours6 : tier === 5 ? T.lateSinks.lapidarHours5 : T.lateSinks.lapidarHours4);

// Why this piece cannot be lapidated right now (null = it can).
export function lapidarBlock(save: Pick<SaveData, 'gearInstances' | 'xp'>, id: GearInstanceId): LapidarBlock | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return 'unknown';
  if (playerLevel(save.xp) < T.lateSinks.minLevel) return 'level';
  if ((hit.item.tier ?? 0) < T.lateSinks.lapidarMinTier) return 'tier';
  if (hit.instance.substats.length < 2) return 'rarity';
  return null;
}

// The price of the NEXT lapidation of this piece (the same whether it can be done or not, so the screen can show it).
export function getLapidarCost(save: Pick<SaveData, 'gearInstances'>, id: GearInstanceId): LapidarCost | null {
  const hit = resolveGearInstance(save, id);
  if (!hit) return null;
  const L = T.lateSinks;
  const tier = hit.item.tier ?? 0;
  const done = Math.min(L.lapidarMaxGrowth, hit.instance.lapidarCount ?? 0);
  const hours = hoursForTier(tier) * (1 + L.lapidarGrowth * done);
  return { gold: Math.round(L.lapidarGoldPerTier * tier), shards: L.lapidarShards, hours, materials: farmHours(hours) };
}

export function canAffordLapidar(save: Pick<SaveData, 'gold' | 'shards' | 'materials'>, cost: LapidarCost): boolean {
  return save.gold >= cost.gold && save.shards >= cost.shards && hasMaterials(save.materials, cost.materials);
}

// Lock the substat at `lockIndex`, reroll the rest. null = refused (cannot be lapidated, bad index, or something missing): nothing is charged and no RNG is consumed.
export function applyLapidar(save: SaveData, id: GearInstanceId, lockIndex: number, rng: Rng = Math.random): SaveData | null {
  if (lapidarBlock(save, id) !== null) return null;
  const hit = resolveGearInstance(save, id)!;
  const { instance, item } = hit;
  if (!Number.isInteger(lockIndex) || lockIndex < 0 || lockIndex >= instance.substats.length) return null;
  const cost = getLapidarCost(save, id)!;
  if (!canAffordLapidar(save, cost)) return null;
  const locked = instance.substats[lockIndex];
  const used: SubstatType[] = [locked.type];
  const substats: Substat[] = [];
  for (let i = 0; i < instance.substats.length; i++) {
    if (i === lockIndex) {
      substats.push({ ...locked });
      continue;
    }
    const s = rollSubstat(item.tier ?? 0, used, rng);
    used.push(s.type);
    substats.push(s);
  }
  const materials = { ...save.materials };
  for (const [mid, need] of Object.entries(cost.materials)) materials[mid as MaterialId] = (materials[mid as MaterialId] ?? 0) - (need as number);
  return recordLapidar({
    ...save,
    gold: save.gold - cost.gold,
    shards: save.shards - cost.shards,
    materials,
    gearInstances: { ...save.gearInstances, [id]: { ...instance, substats, lapidarCount: (instance.lapidarCount ?? 0) + 1 } },
  });
}
