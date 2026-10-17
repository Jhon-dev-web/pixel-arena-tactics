import type { SaveData } from './engine';
import { SET_FAMILIES, SetFamily } from './gear';
import type { Rarity } from './rarity';

// Lifetime statistics: plain counters that only ever go up, kept in the save (`SaveData.stats`). They are read by the Statistics tab and by the
// achievements (quests.ts), and they change nothing in the game itself: no reward, drop or timer reads them except the achievements' own gold / Éter.
//
// Where they are counted: inside the pure transitions that already carry the event (forge, refine, hunt stop, delivery claim, gather claim, harvest,
// potion craft), so every path that performs it (the screens, "Resgatar tudo", the simulator) counts it exactly once; the dungeon run is counted by
// recordDungeonRun at the end of a run; gold earned and the completed sets are read from the save as it changes (trackSave, statsTracking.ts); seconds
// played are added by the app clock (the app flushes them with the next save). This file is the light half (types, loader, per-event recorders) so the
// engine can import it without a cycle.

export interface LifetimeStats {
  kills: number; // monsters defeated, hunting + dungeon
  killsByZone: Record<string, number>; // hunting zone id -> kills there
  dungeonKills: Record<string, number>; // dungeon monster (its enemies.* name key) -> kills
  goldEarned: number; // every Gold the hero gained, from any source (spending is not subtracted)
  itemsForged: number;
  forgedByRarity: Record<Rarity, number>; // forged gear pieces by the rarity they came out as (relics have none)
  uniquesFound: number; // unique pieces dropped (hunting and dungeon bosses)
  refineSuccess: number; // gear refine attempts that succeeded
  refineFail: number;
  lapidations: number; // Lapidar rerolls done (lapidar.ts)
  deliveries: number; // delivery orders completed
  oreGathered: number; // units of ore / wood / plants that reached the bag
  woodGathered: number;
  plantsHarvested: number;
  potionsBrewed: number;
  dungeonRuns: number;
  bossesKilled: number;
  secondsPlayed: number;
  completedSets: SetFamily[]; // families the hero has ever worn the full set of
  deepestDepth: number; // the deepest Profundezas depth ever cleared (0 = none, see depths.ts)
  huntSeconds: number; // seconds of Hunting that counted for a reward, added when a hunt ends (the weekly goal reads it)
  dungeonFloors: number; // dungeon floors (Profundezas included) cleared across every run (the weekly goal reads it)
  wholesaleUnits: number; // materials sold to the wholesale merchant (wholesale.ts)
  wholesaleGold: number; // Gold the wholesale merchant paid for them
  pouchGoldOpened: number; // Gold that came back from opened Gold Pouches (goldPouch.ts): not "earned", trackSave leaves it out of goldEarned
  forgePity?: number; // OFFLINE Legendary pity (rarity.ts FORGE_PITY): forges of tier 4+ since the last Legendary. Online the server keeps its own and this stays untouched
}

export const emptyRarityCounts = (): Record<Rarity, number> => ({ common: 0, rare: 0, epic: 0, legendary: 0 });

export const emptyStats = (): LifetimeStats => ({
  kills: 0,
  killsByZone: {},
  dungeonKills: {},
  goldEarned: 0,
  itemsForged: 0,
  forgedByRarity: emptyRarityCounts(),
  uniquesFound: 0,
  refineSuccess: 0,
  refineFail: 0,
  lapidations: 0,
  deliveries: 0,
  oreGathered: 0,
  woodGathered: 0,
  plantsHarvested: 0,
  potionsBrewed: 0,
  dungeonRuns: 0,
  bossesKilled: 0,
  secondsPlayed: 0,
  completedSets: [],
  deepestDepth: 0,
  huntSeconds: 0,
  dungeonFloors: 0,
  wholesaleUnits: 0,
  wholesaleGold: 0,
  pouchGoldOpened: 0,
  forgePity: 0,
});

export const COUNT_CAP = 1e12;
export const count = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, COUNT_CAP) : 0;
};

// What an old save already proves it did, so the counters do not start from zero for a veteran: the dungeon kills it counted, the gear it owns, ...
export interface StatsBackfill {
  kills?: number;
  forgedByRarity?: Partial<Record<Rarity, number>>;
  uniquesFound?: number;
}

// Sanitizes whatever the save holds (absent, partial, corrupt) into trusted counters; each is the larger of the stored value and the backfill.
export function normalizeStats(raw: unknown, backfill: StatsBackfill = {}): LifetimeStats {
  const r = raw && typeof raw === 'object' ? (raw as Partial<Record<keyof LifetimeStats, unknown>>) : {};
  const out = emptyStats();
  for (const key of ['goldEarned', 'itemsForged', 'refineSuccess', 'refineFail', 'lapidations', 'deliveries', 'oreGathered', 'woodGathered', 'plantsHarvested', 'potionsBrewed', 'dungeonRuns', 'bossesKilled', 'secondsPlayed', 'deepestDepth', 'huntSeconds', 'dungeonFloors', 'wholesaleUnits', 'wholesaleGold', 'pouchGoldOpened', 'forgePity'] as const) {
    out[key] = count(r[key]);
  }
  out.kills = Math.max(count(r.kills), count(backfill.kills));
  out.uniquesFound = Math.max(count(r.uniquesFound), count(backfill.uniquesFound));
  const zones = r.killsByZone && typeof r.killsByZone === 'object' ? (r.killsByZone as Record<string, unknown>) : {};
  for (const [id, n] of Object.entries(zones)) if (typeof id === 'string' && id.length < 60 && count(n) > 0) out.killsByZone[id] = count(n);
  const dungeon = r.dungeonKills && typeof r.dungeonKills === 'object' ? (r.dungeonKills as Record<string, unknown>) : {};
  for (const [id, n] of Object.entries(dungeon)) if (id.length < 60 && count(n) > 0) out.dungeonKills[id] = count(n);
  const byRarity = r.forgedByRarity && typeof r.forgedByRarity === 'object' ? (r.forgedByRarity as Record<string, unknown>) : {};
  for (const rar of Object.keys(out.forgedByRarity) as Rarity[]) out.forgedByRarity[rar] = Math.max(count(byRarity[rar]), count(backfill.forgedByRarity?.[rar]));
  const sets = Array.isArray(r.completedSets) ? r.completedSets : [];
  out.completedSets = SET_FAMILIES.filter((f) => sets.includes(f));
  out.itemsForged = Math.max(out.itemsForged, Object.values(out.forgedByRarity).reduce((a, b) => a + b, 0));
  return out;
}

export const statsOf = (save: Pick<SaveData, 'stats'>): LifetimeStats => save.stats ?? emptyStats();

// Returns the save with `fn(stats)` merged into its counters.
export function withStats(save: SaveData, fn: (stats: LifetimeStats) => Partial<LifetimeStats>): SaveData {
  const stats = statsOf(save);
  return { ...save, stats: { ...stats, ...fn(stats) } };
}

export function recordKills(save: SaveData, zoneId: string, kills: number, uniques = 0): SaveData {
  const k = count(kills);
  return withStats(save, (s) => ({
    kills: s.kills + k,
    killsByZone: k > 0 ? { ...s.killsByZone, [zoneId]: (s.killsByZone[zoneId] ?? 0) + k } : s.killsByZone,
    uniquesFound: s.uniquesFound + count(uniques),
  }));
}

export function recordHuntTime(save: SaveData, ms: number): SaveData {
  const seconds = Number.isFinite(ms) ? count(Math.floor(ms / 1000)) : 0;
  return seconds > 0 ? withStats(save, (s) => ({ huntSeconds: Math.min(COUNT_CAP, (s.huntSeconds ?? 0) + seconds) })) : save;
}

export function recordForge(save: SaveData, rarity: Rarity | null): SaveData {
  return withStats(save, (s) => ({
    itemsForged: s.itemsForged + 1,
    forgedByRarity: rarity ? { ...s.forgedByRarity, [rarity]: s.forgedByRarity[rarity] + 1 } : s.forgedByRarity,
  }));
}

export function recordRefine(save: SaveData, success: boolean): SaveData {
  return withStats(save, (s) => (success ? { refineSuccess: s.refineSuccess + 1 } : { refineFail: s.refineFail + 1 }));
}

export function recordLapidar(save: SaveData): SaveData {
  return withStats(save, (s) => ({ lapidations: (s.lapidations ?? 0) + 1 }));
}

export function recordWholesale(save: SaveData, units: number, gold: number): SaveData {
  return withStats(save, (s) => ({ wholesaleUnits: Math.min(COUNT_CAP, (s.wholesaleUnits ?? 0) + count(units)), wholesaleGold: Math.min(COUNT_CAP, (s.wholesaleGold ?? 0) + count(gold)) }));
}

export function recordDelivery(save: SaveData): SaveData {
  return withStats(save, (s) => ({ deliveries: s.deliveries + 1 }));
}

export function recordGather(save: SaveData, kind: 'mining' | 'woodcutting', units: number): SaveData {
  const n = count(units);
  return withStats(save, (s) => (kind === 'mining' ? { oreGathered: s.oreGathered + n } : { woodGathered: s.woodGathered + n }));
}

export function recordHarvest(save: SaveData, units: number): SaveData {
  return withStats(save, (s) => ({ plantsHarvested: s.plantsHarvested + count(units) }));
}

export function recordPotion(save: SaveData): SaveData {
  return withStats(save, (s) => ({ potionsBrewed: s.potionsBrewed + 1 }));
}
