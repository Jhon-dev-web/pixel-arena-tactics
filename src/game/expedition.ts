import { MaterialId } from './materials';

export interface ExpeditionDef {
  id: string;
  nameKey: string;
  descKey: string;
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
}

export interface ExpeditionRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
}

export const EXPEDITION: ExpeditionDef = {
  id: 'forage',
  nameKey: 'name',
  descKey: 'desc',
  gold: 20,
  drops: { leather: 1, iron: 1 },
};
