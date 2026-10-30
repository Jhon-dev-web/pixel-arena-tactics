import type { HuntLiveSnapshot } from '../game/huntCombat';

// What the hunt scene shows when the live numbers move. The scene is purely visual: it reads the HP the replay already computed (HuntLiveSnapshot) and never feeds anything back.
// The snapshot is recomputed every SNAPSHOT_MS and both sides usually lost HP inside that second, so showing it as it comes drops both bars at the same instant while both fighters swing.
// So the scene keeps its own SHOWN numbers and plays ONE blow per update: that blow moves its own bar to the real number and the other bar waits for its turn, one update later.
export type SceneEvent = 'hero_strikes' | 'monster_strikes' | 'new_fight';

export const SNAPSHOT_MS = 1000; // how often HuntRunning refreshes the snapshot
export const SCENE_POSE_MS = 600; // how long an attack / hurt pose lasts
export const SCENE_FALL_MS = 600; // how long the fallen monster is held before the next one walks in

export interface SceneStep {
  shown: HuntLiveSnapshot | null; // what the bars show after this update
  event: SceneEvent | null;
}

// A new fight is told by the enemy: it can never heal, so more HP than shown, another level or another maximum means a different monster. The hero starts EVERY fight at full HP (a win and a
// defeat both lead to attempt(.., build.playerMax)), so his HP going up is a new fight or a heal, never a blow. A win and a defeat look the same from here, so a defeat shows as a change of monster.
// `last` is the side that struck in the previous update: when both sides have a blow to show, the other one goes now, so they take turns.
export function sceneStep(shown: HuntLiveSnapshot | null, live: HuntLiveSnapshot | null, last: SceneEvent | null): SceneStep {
  if (!live) return { shown: null, event: null };
  if (!shown) return { shown: live, event: null };
  if (live.subLevel !== shown.subLevel || live.enemyMax !== shown.enemyMax || live.enemyHp > shown.enemyHp) return { shown: live, event: 'new_fight' };
  const enemyHit = live.enemyHp < shown.enemyHp;
  const heroHit = live.heroHp < shown.heroHp;
  const heal = { ...shown, heroMax: live.heroMax, heroHp: Math.max(shown.heroHp, live.heroHp) };
  if (enemyHit && (!heroHit || last !== 'hero_strikes')) return { shown: { ...heal, enemyHp: live.enemyHp }, event: 'hero_strikes' };
  if (heroHit) return { shown: { ...heal, heroHp: live.heroHp }, event: 'monster_strikes' };
  return { shown: heal, event: null };
}
