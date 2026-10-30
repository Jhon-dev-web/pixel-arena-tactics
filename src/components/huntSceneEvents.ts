import type { HuntLiveSnapshot } from '../game/huntCombat';

// What the hunt scene shows when the live numbers move. The scene is purely visual: it reads the HP the replay already computed (HuntLiveSnapshot) and never feeds anything back.
// The snapshot is recomputed every SNAPSHOT_MS and both sides usually lost HP inside that second, so showing it as it comes drops both bars at the same instant while both fighters swing.
// So the scene keeps its own SHOWN numbers and plays ONE blow per update: that blow moves its own bar to the real number and the other bar waits for its turn, one update later.
// 'new_fight' is a fight the HERO WON (the monster falls, the next one walks in); 'hero_falls' is one he LOST (the hero falls, the monster stays standing); 'next_fight' is a change of monster the
// game's own counters cannot tell apart (see fightEnded), so the scene shows neither a fall nor a victory and only brings the new monster in.
export type SceneEvent = 'hero_strikes' | 'monster_strikes' | 'new_fight' | 'hero_falls' | 'next_fight';

export const SNAPSHOT_MS = 1000; // how often HuntRunning refreshes the snapshot
export const SCENE_POSE_MS = 600; // how long an attack / hurt pose lasts
export const SCENE_FALL_MS = 600; // how long the fallen monster is held before the next one walks in
export const SCENE_DEFEAT_MS = 900; // how long the fallen hero is held (long enough to read) before the next fight; still under SNAPSHOT_MS so it ends before the next update

export interface SceneStep {
  shown: HuntLiveSnapshot | null; // what the bars show after this update
  event: SceneEvent | null;
  held?: HuntLiveSnapshot; // only with 'hero_falls': the bars of the fight he lost (his HP at 0, the monster with the life it still had) while the fall plays, before the new fight's bars
}

// The session counters the game already keeps (HuntSessionResult.kills / defeats, the same ones the Resumo shows): fights won and fights lost so far.
export interface FightTally {
  kills: number;
  defeats: number;
}
// none = no fight ended in this update; mixed = fights were won AND lost inside it (several in one second), so the last one cannot be told.
export type FightOutcome = 'none' | 'won' | 'lost' | 'mixed';

// How the fights that ended between two updates went, from the counters before and after. The snapshot alone cannot say (a win and a defeat both end in a new monster at full life), but the
// counters can: only defeats went up = the hero lost; only kills went up = he won. Both went up inside the same update (several fights in one second): the order is not known, so it is 'mixed'
// and the scene must not pick one. It never invents a result.
export function fightEnded(before: FightTally, after: FightTally): FightOutcome {
  const won = after.kills - before.kills;
  const lost = after.defeats - before.defeats;
  if (lost > 0 && won > 0) return 'mixed';
  if (lost > 0) return 'lost';
  if (won > 0) return 'won';
  return 'none';
}

// A new fight is told by the enemy: it can never heal, so more HP than shown, another level or another maximum means a different monster; a fight that the counters say ended is one too. The hero
// starts EVERY fight at full HP (a win and a defeat both lead to attempt(.., build.playerMax)), so his HP going up is a new fight or a heal, never a blow. A win and a defeat look the same in the
// snapshot, so `ended` (fightEnded) says how the fight that just finished went: won = the monster falls, lost = the hero falls and the monster stays up, anything else (mixed, or no counters
// given) = neither falls and the next monster simply walks in.
// `last` is the side that struck in the previous update: when both sides have a blow to show, the other one goes now, so they take turns.
export function sceneStep(shown: HuntLiveSnapshot | null, live: HuntLiveSnapshot | null, last: SceneEvent | null, ended?: FightOutcome): SceneStep {
  if (!live) return { shown: null, event: null };
  if (!shown) return { shown: live, event: null };
  const fightEnds = ended === 'won' || ended === 'lost' || ended === 'mixed';
  if (fightEnds || live.subLevel !== shown.subLevel || live.enemyMax !== shown.enemyMax || live.enemyHp > shown.enemyHp) {
    if (ended === 'lost') return { shown: live, event: 'hero_falls', held: { ...shown, heroHp: 0 } };
    return { shown: live, event: ended === 'won' ? 'new_fight' : 'next_fight' };
  }
  const enemyHit = live.enemyHp < shown.enemyHp;
  const heroHit = live.heroHp < shown.heroHp;
  const heal = { ...shown, heroMax: live.heroMax, heroHp: Math.max(shown.heroHp, live.heroHp) };
  if (enemyHit && (!heroHit || last !== 'hero_strikes')) return { shown: { ...heal, enemyHp: live.enemyHp }, event: 'hero_strikes' };
  if (heroHit) return { shown: { ...heal, heroHp: live.heroHp }, event: 'monster_strikes' };
  return { shown: heal, event: null };
}
