import { describe, expect, it } from 'vitest';
import { stepAttackClock } from '../attackClock';

// The dungeon on screen runs its attack clocks frame by frame (requestAnimationFrame); the two mirrors that every balance number comes from
// (scripts/sim/driver.ts, src/game/huntCombat.ts) advance them by exact intervals (`heroNext += interval`). If the screen's clock drifts slower than
// the mirrors, nothing on the screen shows it and every measured floor is off by the same silent amount, worst for the fast hero.

const FRAME_MS = 1000 / 60;

// Plays the screen's loop for `swings` swings and returns the time of the last one. `frameAt` lets a test make the frames uneven.
function screenTimeOfSwing(swings: number, interval: number, frameAt: (i: number) => number = (i) => i * FRAME_MS): number {
  let nextAt = 0;
  let done = 0;
  for (let i = 1; ; i++) {
    const now = frameAt(i);
    const step = stepAttackClock(nextAt, now, interval);
    nextAt = step.nextAt;
    if (step.fire && ++done === swings) return now;
  }
}

describe('the dungeon attack clock keeps the rest of every swing, like the mirrors', () => {
  // 569 ms and 947 ms: the archer's and a slower hero's interval in the measurements this was found with. 284.5 is the 2x speed toggle.
  for (const interval of [569, 947, 284.5, 400]) {
    it(`reaches the same total time as the mirror over 2000 swings (${interval} ms)`, () => {
      const swings = 2000;
      const mirror = swings * interval; // heroNext += interval, from 0
      const screen = screenTimeOfSwing(swings, interval);
      // The screen can only fire on a frame, so the last swing lands up to one frame after the mirror's, never before it and never more.
      // The old `= now` restart lost about half a frame per swing: tens of seconds over 2000 swings.
      expect(screen).toBeGreaterThanOrEqual(mirror);
      expect(screen - mirror).toBeLessThan(FRAME_MS + 1e-6);
    });
  }

  it('stays on the mirror with uneven frames (a slow phone drops frames, up to 80 ms late, now and then)', () => {
    const interval = 569;
    const swings = 1500;
    let t = 0;
    const times: number[] = [0];
    for (let i = 1; i < 200000; i++) {
      t += i % 7 === 0 ? 80 : i % 3 === 0 ? 33 : 16.7;
      times.push(t);
    }
    const screen = screenTimeOfSwing(swings, interval, (i) => times[i]);
    const mirror = swings * interval;
    expect(screen).toBeGreaterThanOrEqual(mirror);
    // A late frame is paid back on the next swing instead of being lost: still within one (worst) frame of the mirror.
    expect(screen - mirror).toBeLessThan(80 + 1e-6);
  });

  it('a hidden tab does not fire a burst of late swings: one swing on return, then a fresh interval', () => {
    const interval = 569;
    const slept = 5 * 60 * 1000;
    const first = stepAttackClock(0, slept, interval);
    expect(first.fire).toBe(true);
    expect(first.nextAt).toBe(slept); // realigned to now, not left 5 minutes behind

    let nextAt = first.nextAt;
    let swings = 0;
    for (let i = 1; i <= 30; i++) {
      // 30 frames = 500 ms, less than one interval: nothing more may fire
      const step = stepAttackClock(nextAt, slept + i * FRAME_MS, interval);
      nextAt = step.nextAt;
      if (step.fire) swings++;
    }
    expect(swings).toBe(0);
  });

  it('a stall of just under two intervals is caught up gently (one swing, no second swing on the next frame)', () => {
    const interval = 569;
    // Late by 1.9 intervals: after paying one interval the clock still owes 0.9, which is under the limit, so the rest is kept.
    const lateNow = interval + 0.9 * interval;
    const s1 = stepAttackClock(0, lateNow, interval);
    expect(s1.fire).toBe(true);
    expect(s1.nextAt).toBe(interval);
    const s2 = stepAttackClock(s1.nextAt, lateNow + FRAME_MS, interval);
    expect(s2.fire).toBe(false); // owed 0.9 interval + a frame is still under one interval: no back-to-back swing
  });

  it('a stall of two intervals or more realigns to now', () => {
    const interval = 569;
    const s = stepAttackClock(0, 2 * interval + 1, interval);
    expect(s.fire).toBe(true);
    expect(s.nextAt).toBe(2 * interval + 1);
  });

  it('does not fire before the interval has passed and leaves the clock alone', () => {
    expect(stepAttackClock(100, 100 + 568.9, 569)).toEqual({ fire: false, nextAt: 100 });
  });
});
