// One step of an attack clock (the hero's and the enemy's): `nextAt` is when the current wait began, so a swing is due once `interval` has passed.
// The frame that fires usually lands a few ms past the due time; the clock keeps that rest (nextAt += interval, exactly like heroNext / enemyNext in
// scripts/sim/driver.ts and src/game/huntCombat.ts) instead of restarting from `now`. Restarting threw away about half a frame per swing and made the
// dungeon on screen slower than every number measured on the mirrors, most of all for the fast (archer) hero.
// Limit: if after paying the interval the clock STILL owes a whole interval or more, the frame was late by two swings or more (a hidden or frozen
// tab, not jitter) and it realigns to `now`, like before. Below that the rest is kept, and it cannot turn into a burst: the next swing needs
// `lag + frame >= interval`, which a lag under one interval never reaches on the very next frame, so owed time never becomes back-to-back swings.
// It is also well past the 250 ms per-frame cap that the combat clock already puts on a stall (see `step` in components/BattleModal.tsx), so a tab that slept 5 minutes gets
// exactly one swing on return and a fresh interval, as it did before.
export function stepAttackClock(nextAt: number, now: number, interval: number): { fire: boolean; nextAt: number } {
  if (now - nextAt < interval) return { fire: false, nextAt };
  const paid = nextAt + interval;
  return { fire: true, nextAt: now - paid >= interval ? now : paid };
}
