import { MaterialId } from './materials';

export interface ExpeditionDef {
  id: string;
  nameKey: string;
  descKey: string;
  durationKey: string;
  durationMs: number;
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
  shardsChance?: number;
}

export interface ExpeditionRewards {
  gold: number;
  drops: Partial<Record<MaterialId, number>>;
  shards: number;
}

export interface ActiveExpedition {
  id: string;
  endsAt: number;
}

export const EXPEDITIONS: ExpeditionDef[] = [
  { id: 'scout', nameKey: 'exp_scout', descKey: 'exp_scout_d', durationKey: 'dur_5m', durationMs: 5 * 60 * 1000, gold: 50, drops: { leather: 2, iron: 2 }, shards: 0 },
  { id: 'patrol', nameKey: 'exp_patrol', descKey: 'exp_patrol_d', durationKey: 'dur_30m', durationMs: 30 * 60 * 1000, gold: 350, drops: { leather: 4, iron: 4, steel: 2 }, shards: 0 },
  { id: 'deep', nameKey: 'exp_deep', descKey: 'exp_deep_d', durationKey: 'dur_2h', durationMs: 2 * 60 * 60 * 1000, gold: 1500, drops: { iron: 8, steel: 6, leather: 6, essence: 2 }, shards: 0, shardsChance: 0.5 },
  { id: 'overnight', nameKey: 'exp_overnight', descKey: 'exp_overnight_d', durationKey: 'dur_8h', durationMs: 8 * 60 * 60 * 1000, gold: 6000, drops: { iron: 15, steel: 10, leather: 10, essence: 5, dragon_scales: 2 }, shards: 3 },
];

export function getExpedition(id: string): ExpeditionDef | undefined {
  return EXPEDITIONS.find((e) => e.id === id);
}

export function expeditionRewards(def: ExpeditionDef): ExpeditionRewards {
  let shards = def.shards;
  if (def.shardsChance && Math.random() < def.shardsChance) shards += 1;
  return { gold: def.gold, drops: { ...def.drops }, shards };
}
