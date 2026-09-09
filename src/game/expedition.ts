export interface ExpeditionDef {
  id: string;
  nameKey: string;
  descKey: string;
  durationKey: string;
  durationMs: number;
  gold: number;
  xp: number;
  shards: number;
  shardsChance?: number;
}

export interface ExpeditionRewards {
  gold: number;
  xp: number;
  shards: number;
}

export interface ActiveExpedition {
  id: string;
  endsAt: number;
}

// Offline dispatch missions — timed, no combat. Rewards are gold/XP/shards only,
// deliberately excluding material drops so they never compete with Hunting's economy.
export const EXPEDITIONS: ExpeditionDef[] = [
  { id: 'short', nameKey: 'exp_short', descKey: 'exp_short_d', durationKey: 'dur_1h', durationMs: 1 * 60 * 60 * 1000, gold: 250, xp: 80, shards: 0 },
  { id: 'long', nameKey: 'exp_long', descKey: 'exp_long_d', durationKey: 'dur_4h', durationMs: 4 * 60 * 60 * 1000, gold: 1100, xp: 320, shards: 1 },
  { id: 'epic', nameKey: 'exp_epic', descKey: 'exp_epic_d', durationKey: 'dur_8h', durationMs: 8 * 60 * 60 * 1000, gold: 2600, xp: 700, shards: 2, shardsChance: 0.5 },
];

export function getExpedition(id: string): ExpeditionDef | undefined {
  return EXPEDITIONS.find((e) => e.id === id);
}

export function expeditionRewards(def: ExpeditionDef): ExpeditionRewards {
  let shards = def.shards;
  if (def.shardsChance && Math.random() < def.shardsChance) shards += 1;
  return { gold: def.gold, xp: def.xp, shards };
}
