import type { SaveData } from './engine';
import { SET_DEFS, setCounts } from './setBonuses';
import { SET_FAMILIES, SetFamily } from './gear';
import { resolveEquipped } from './gearInstances';
import { isDungeonBoss, MAX_DUNGEON_FLOOR } from './dungeon';
import { COUNT_CAP, count, statsOf, withStats } from './stats';
import { dungeonEnemyVisualForFloor } from './sprites';
import { updateCodex } from './codex';

// The heavier half of the lifetime statistics (stats.ts): the dungeon run and what is read from the whole save as it changes.

// Boss floors among the floors a run actually defeated (startFloor .. startFloor + stages - 1).
export function bossesInRun(startFloor: number, stages: number): number {
  let n = 0;
  for (let f = startFloor; f < startFloor + Math.max(0, stages); f++) if (isDungeonBoss(f)) n++;
  return n;
}

// One finished dungeon run, win or lose: the stages it defeated are kills, the bosses among them count, and the unique pieces the bosses dropped.
export function recordDungeonRun(save: SaveData, startFloor: number, stages: number, uniques = 0): SaveData {
  const st = Math.max(0, Math.floor(stages));
  const byMonster = { ...statsOf(save).dungeonKills };
  for (let f = startFloor; f < startFloor + st; f++) {
    const key = dungeonEnemyVisualForFloor(f).nameKey;
    byMonster[key] = (byMonster[key] ?? 0) + 1;
  }
  // Profundezas: the last stage this run defeated, if it is past floor 100, is the new deepest depth when it beats the record.
  const lastStage = startFloor + st - 1;
  const depth = st > 0 && lastStage > MAX_DUNGEON_FLOOR ? lastStage - MAX_DUNGEON_FLOOR : 0;
  return withStats(save, (s) => ({
    deepestDepth: Math.max(s.deepestDepth ?? 0, depth),
    dungeonRuns: s.dungeonRuns + 1,
    dungeonKills: byMonster,
    kills: s.kills + st,
    bossesKilled: s.bossesKilled + bossesInRun(startFloor, st),
    uniquesFound: s.uniquesFound + count(uniques),
  }));
}

// Families whose full set (the highest threshold of setBonuses) is worn right now.
export function fullSetsWorn(save: SaveData): SetFamily[] {
  const w = resolveEquipped(save);
  const items = [w.weapon, w.armor, w.helmet, w.gloves, w.boots, w.ring, w.shield].map((v) => v?.item);
  const counts = setCounts(items);
  return SET_FAMILIES.filter((f) => counts[f] >= SET_DEFS[f].thresholds[SET_DEFS[f].thresholds.length - 1]);
}

// Applied to every change of the save the app commits (App.tsx setSaveBoth): the Gold it gained (any positive change) and, when the worn gear changed, the full
// sets now worn. `pendingSeconds` is the play time the app clock has counted since the last commit.
export function trackSave(prev: SaveData, next: SaveData, pendingSeconds = 0): SaveData {
  let stats = statsOf(next);
  let changed = next.stats === undefined;
  const gained = Math.max(0, next.gold - prev.gold);
  if (gained > 0) {
    stats = { ...stats, goldEarned: Math.min(COUNT_CAP, stats.goldEarned + Math.floor(gained)) };
    changed = true;
  }
  if (pendingSeconds > 0) {
    stats = { ...stats, secondsPlayed: stats.secondsPlayed + Math.floor(pendingSeconds) };
    changed = true;
  }
  if (next.equipped !== prev.equipped || next.gearInstances !== prev.gearInstances) {
    const worn = fullSetsWorn(next);
    const fresh = worn.filter((f) => !stats.completedSets.includes(f));
    if (fresh.length > 0) {
      stats = { ...stats, completedSets: SET_FAMILIES.filter((f) => stats.completedSets.includes(f) || fresh.includes(f)) };
      changed = true;
    }
  }
  // The codex (codex.ts) learns whatever the changed save proves.
  const withStatsApplied = changed ? { ...next, stats } : next;
  return updateCodex(prev, withStatsApplied);
}
