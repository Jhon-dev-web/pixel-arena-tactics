export type MaterialId = 'iron' | 'steel' | 'leather' | 'essence';

export type Materials = Record<MaterialId, number>;

export interface MaterialDef {
  id: MaterialId;
  nameKey: string;
  icon: string;
  packSize: number;
  packCost: number;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'iron', nameKey: 'mat_iron', icon: '🪨', packSize: 5, packCost: 50 },
  { id: 'steel', nameKey: 'mat_steel', icon: '🔩', packSize: 3, packCost: 150 },
  { id: 'leather', nameKey: 'mat_leather', icon: '🟤', packSize: 3, packCost: 45 },
  { id: 'essence', nameKey: 'mat_essence', icon: '🔮', packSize: 2, packCost: 200 },
];

export function emptyMaterials(): Materials {
  return { iron: 0, steel: 0, leather: 0, essence: 0 };
}

export function hasMaterials(have: Materials, need: Partial<Record<MaterialId, number>>): boolean {
  for (const [k, v] of Object.entries(need ?? {}) as [MaterialId, number][]) {
    if ((have[k] ?? 0) < v) return false;
  }
  return true;
}
