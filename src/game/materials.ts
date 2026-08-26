import Assets from '../assets.json';

export type MaterialId = 'iron' | 'steel' | 'leather' | 'essence';

export type Materials = Record<MaterialId, number>;

export interface MaterialDef {
  id: MaterialId;
  nameKey: string;
  icon: string;
  iconUrl: string;
  packSize: number;
  packCost: number;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'iron', nameKey: 'mat_iron', icon: '🪨', iconUrl: Assets.icons.ore.url, packSize: 5, packCost: 50 },
  { id: 'steel', nameKey: 'mat_steel', icon: '🔩', iconUrl: Assets.icons.steel.url, packSize: 3, packCost: 150 },
  { id: 'leather', nameKey: 'mat_leather', icon: '🟤', iconUrl: Assets.icons.leather.url, packSize: 3, packCost: 45 },
  { id: 'essence', nameKey: 'mat_essence', icon: '🔮', iconUrl: Assets.icons.essence.url, packSize: 2, packCost: 200 },
];

export function materialIconUrl(id: MaterialId): string {
  return MATERIALS.find((m) => m.id === id)?.iconUrl ?? '';
}

export function emptyMaterials(): Materials {
  return { iron: 0, steel: 0, leather: 0, essence: 0 };
}

export function hasMaterials(have: Materials, need: Partial<Record<MaterialId, number>>): boolean {
  for (const [k, v] of Object.entries(need ?? {}) as [MaterialId, number][]) {
    if ((have[k] ?? 0) < v) return false;
  }
  return true;
}
