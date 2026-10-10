import { buildCombatStats, buildHuntSimSetup, getHuntProgress, huntPromotionRequiredWins, SaveData } from './engine';
import { getHuntingZone, HuntingDepth } from './huntingZones';
import { simulateHuntingSession } from './huntCombat';
import { HuntSession } from './huntSession';
import { MaterialId } from './materials';
import T from './tunables';

// "What would my hero earn here?" for the Hunt screen. NOT a formula of its own: it runs the real Hunting simulation
// (simulateHuntingSession, fed by the same buildHuntSimSetup computeHuntingStatus uses) for a few hours with a fixed seed
// and reports the totals per hour. Pure: it reads the save, writes nothing, and draws from its own seeded stream, never from
// Math.random or from the stream of a real session.
//
// Assumptions, all shown to the player as "estimate for your hero":
//   - the hero's permanent stats as they are now (gear, attributes, blessed); no Elixir, Tonic or Battle Pass window;
//   - the sub-level the save currently has for that zone+depth, held fixed (no promotion), so the numbers describe THAT level;
//   - no auto-potions (a stock that runs out would make a long hunt drift), so the win outlook is on the cautious side.

export const ESTIMATE_HOURS = 4;
const MS_PER_HOUR = 3600 * 1000;
const NO_WINDOWS: [number, number][] = [];

export type HuntOutlook = 'always' | 'risky' | 'cannot';

export interface HuntYieldEstimate {
  subLevel: number;
  killsPerHour: number;
  winRate: number; // fights won / fights fought, 0..1 (0 when nothing was fought)
  outlook: HuntOutlook;
  xpPerHour: number;
  goldPerHour: number;
  materialsPerHour: { material: MaterialId; perHour: number }[]; // the zone's drop order (common -> rare), zeros included
}

const WIN_RATE_ALWAYS = 0.98;

const cache = new Map<string, HuntYieldEstimate>();
const CACHE_MAX = 64;

export function estimateHuntYield(save: SaveData, zoneId: string, depth: HuntingDepth): HuntYieldEstimate | null {
  const zone = getHuntingZone(zoneId);
  if (!zone) return null;
  const stats = buildCombatStats(save);
  const ceiling = Math.min(T.hunting.subLevels, Math.max(1, getHuntProgress(save, zone.id, depth).ceiling));
  const key = `${JSON.stringify(stats)}|${save.blessed}|${zone.id}|${depth}|${ceiling}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const session: HuntSession = { stats, blessed: save.blessed, strength: [], attack: [], pass: [], tonics: {} };
  const noPotions = { ...save.consumables, greater_elixir: 0, large_hp: 0, small_hp: 0 };
  const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup({ ...save, consumables: noPotions }, zone, depth, session, 0, NO_WINDOWS);
  const r = simulateHuntingSession(
    build,
    zoneCfg,
    { ceiling, promotionWins: 0 },
    ESTIMATE_HOURS * MS_PER_HOUR,
    potionCfg,
    `estimate:${zone.id}:${depth}`,
    { maxLevel: ceiling, requiredWins: huntPromotionRequiredWins }, // maxLevel = the current level: no promotion, the level stays pinned
    timeline,
  );
  const fights = r.kills + r.defeats;
  const winRate = fights > 0 ? r.kills / fights : 0;
  const estimate: HuntYieldEstimate = {
    subLevel: ceiling,
    killsPerHour: r.kills / ESTIMATE_HOURS,
    winRate,
    outlook: r.kills === 0 ? 'cannot' : winRate >= WIN_RATE_ALWAYS ? 'always' : 'risky',
    xpPerHour: r.xpReady / ESTIMATE_HOURS,
    goldPerHour: r.goldReady / ESTIMATE_HOURS,
    materialsPerHour: zone.drops.map((d) => ({ material: d.material, perHour: (r.drops[d.material] ?? 0) / ESTIMATE_HOURS })),
  };
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, estimate);
  return estimate;
}
