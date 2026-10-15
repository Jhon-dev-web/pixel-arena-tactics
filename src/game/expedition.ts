export interface ExpeditionDef {
  id: string;
  nameKey: string;
  descKey: string;
  durationKey: string;
  durationMs: number;
  gold: number;
  shards: number;
  shardsChance?: number;
}

export interface ExpeditionRewards {
  gold: number;
  shards: number;
}

export interface ActiveExpedition {
  id: string;
  endsAt: number;
}

// LEGACY. New Expeditions can no longer be started: delivery orders (deliveries.ts) took over this job. These definitions stay
// only so an Expedition that was already running when the update landed can finish and pay out exactly as before.
// Offline dispatch missions — timed, no combat. Rewards are gold/shards only,
// deliberately excluding material drops so they never compete with Hunting's economy.
// They paid hero XP too (55k / 220k / 440k); since the League (Rodada 20) the hero earns XP only from Hunting, so an Expedition that was already running pays its Gold and Runes
// and no XP.
// gold was cut 10x (same 250:1100:2600 ratio preserved) — 2 parallel epic slots alone were handing a
// median player ~15.6k gold/day, before even touching Dungeon; see the goldRewardGrowth/DUNGEON_BIOMES
// comment in dungeon.ts for the matching cut on that side.
export const EXPEDITIONS: ExpeditionDef[] = [
  { id: 'short', nameKey: 'exp_short', descKey: 'exp_short_d', durationKey: 'dur_1h', durationMs: 1 * 60 * 60 * 1000, gold: 25, shards: 0 },
  { id: 'long', nameKey: 'exp_long', descKey: 'exp_long_d', durationKey: 'dur_4h', durationMs: 4 * 60 * 60 * 1000, gold: 110, shards: 1 },
  { id: 'epic', nameKey: 'exp_epic', descKey: 'exp_epic_d', durationKey: 'dur_8h', durationMs: 8 * 60 * 60 * 1000, gold: 260, shards: 2, shardsChance: 0.5 },
];

export function getExpedition(id: string): ExpeditionDef | undefined {
  return EXPEDITIONS.find((e) => e.id === id);
}

export function expeditionRewards(def: ExpeditionDef): ExpeditionRewards {
  let shards = def.shards;
  if (def.shardsChance && Math.random() < def.shardsChance) shards += 1;
  return { gold: def.gold, shards };
}
