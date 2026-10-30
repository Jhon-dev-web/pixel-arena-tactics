import type { HuntLiveSnapshot } from '../game/huntCombat';

// What the hunt scene shows when the live numbers move. The scene is purely visual: it reads the HP the replay already computed (HuntLiveSnapshot) and never feeds anything back.
// The snapshot is recomputed every SNAPSHOT_MS, and many blows can land inside that second, so the scene shows AT MOST one blow per side per update.
export type SceneEvent = 'hero_strikes' | 'monster_strikes' | 'new_fight';

export const SNAPSHOT_MS = 1000; // how often HuntRunning refreshes the snapshot
export const SCENE_STEP_MS = 420; // the second pose of an update starts this long after the first
export const SCENE_POSE_MS = 380; // how long an attack / hurt pose lasts (two steps always fit inside one update)
export const SCENE_FALL_MS = 600; // how long the fallen monster is held before the next one walks in

// Compare the previous snapshot with the new one. Order of the result is the order of play (the hero first, so one blow never erases the other).
// A new fight is told by the enemy: it can never heal, so more HP than before, another level or another maximum means a different monster. The hero starts EVERY fight at full HP
// (a win and a defeat both lead to attempt(.., build.playerMax)), so his HP going up is a new fight or a heal, never a blow: it produces nothing by itself.
// A win and a defeat look the same from here (both end in a fresh monster), which is why a defeat is shown like any change of monster, with no invented blow.
export function sceneEvents(prev: HuntLiveSnapshot | null, next: HuntLiveSnapshot | null): SceneEvent[] {
  if (!prev || !next) return [];
  if (next.subLevel !== prev.subLevel || next.enemyMax !== prev.enemyMax || next.enemyHp > prev.enemyHp) return ['new_fight'];
  const out: SceneEvent[] = [];
  if (next.enemyHp < prev.enemyHp) out.push('hero_strikes');
  if (next.heroHp < prev.heroHp) out.push('monster_strikes');
  return out;
}
