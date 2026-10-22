import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_JITTER, PollEnv, RESUME_SPREAD_MS, jittered, startPolling } from '../../lib/poller';
import { SUBMIT_INTERVAL_MS, shouldSubmitNow } from '../seasonRanking';

// A tab we can hide and show, on the fake clock of vitest.
function makeTab(random = 0.5) {
  let visible = true;
  const listeners = new Set<() => void>();
  const env: Partial<PollEnv> = {
    visible: () => visible,
    onVisibility: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    now: () => Date.now(),
    random: () => random,
  };
  return {
    env,
    hide: () => {
      visible = false;
      listeners.forEach((l) => l());
    },
    show: () => {
      visible = true;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('periodic remote calls (lib/poller.ts)', () => {
  it('runs once per interval while the tab is visible (random 0.5 = no jitter)', async () => {
    const tab = makeTab(0.5);
    const run = vi.fn();
    const stop = startPolling({ intervalMs: 10 * MIN, run, env: tab.env });
    await vi.advanceTimersByTimeAsync(10 * MIN - 1);
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(run).toHaveBeenCalledTimes(4);
    stop();
  });

  it('a startDelayMs makes the first call come early (0 = at once)', async () => {
    const tab = makeTab();
    const run = vi.fn();
    startPolling({ intervalMs: 30 * MIN, startDelayMs: 1500, run, env: tab.env });
    await vi.advanceTimersByTimeAsync(1500);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('makes NO call while the tab is hidden, however long it stays hidden', async () => {
    const tab = makeTab();
    const run = vi.fn();
    startPolling({ intervalMs: 5 * MIN, run, env: tab.env });
    await vi.advanceTimersByTimeAsync(3 * MIN);
    tab.hide();
    await vi.advanceTimersByTimeAsync(6 * 60 * MIN);
    expect(run).toHaveBeenCalledTimes(0);
  });

  it('coming back before its time makes no call and keeps the rest of the wait', async () => {
    const tab = makeTab();
    const run = vi.fn();
    startPolling({ intervalMs: 10 * MIN, run, env: tab.env });
    await vi.advanceTimersByTimeAsync(2 * MIN);
    tab.hide();
    await vi.advanceTimersByTimeAsync(MIN);
    tab.show(); // 3 minutes in: 7 to go
    await vi.advanceTimersByTimeAsync(6 * MIN);
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('an overdue call runs shortly after the tab comes back, not before', async () => {
    const tab = makeTab(0.5);
    const run = vi.fn();
    startPolling({ intervalMs: 10 * MIN, run, env: tab.env });
    tab.hide();
    await vi.advanceTimersByTimeAsync(2 * 60 * MIN);
    expect(run).toHaveBeenCalledTimes(0);
    tab.show();
    expect(run).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(RESUME_SPREAD_MS);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a call that returns a number is followed by that wait instead of the interval', async () => {
    const tab = makeTab();
    const answers = [6_000, 6_000, undefined];
    const run = vi.fn(() => answers.shift());
    startPolling({ intervalMs: 10 * MIN, startDelayMs: 0, run, env: tab.env });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(9 * MIN);
    expect(run).toHaveBeenCalledTimes(3); // back to the long interval
  });

  it('a failing call does not stop the rhythm', async () => {
    const tab = makeTab();
    const run = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    startPolling({ intervalMs: MIN, run, env: tab.env });
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(run.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stop() ends it for good and lets go of the visibility listener', async () => {
    const tab = makeTab();
    const run = vi.fn();
    const stop = startPolling({ intervalMs: MIN, run, env: tab.env });
    expect(tab.listenerCount()).toBe(1);
    stop();
    expect(tab.listenerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    tab.hide();
    tab.show();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(run).toHaveBeenCalledTimes(0);
  });

  it('a hidden start waits for the tab', async () => {
    const tab = makeTab();
    tab.hide();
    const run = vi.fn();
    startPolling({ intervalMs: MIN, startDelayMs: 0, run, env: tab.env });
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(run).toHaveBeenCalledTimes(0);
    tab.show();
    await vi.advanceTimersByTimeAsync(RESUME_SPREAD_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('jitter', () => {
  it('moves a wait by at most 10 % either way', () => {
    expect(jittered(600_000, POLL_JITTER, () => 0)).toBe(540_000);
    expect(jittered(600_000, POLL_JITTER, () => 0.5)).toBe(600_000);
    expect(jittered(600_000, POLL_JITTER, () => 1)).toBe(660_000);
  });

  it('spreads many clients over the window instead of one second', async () => {
    const times: number[] = [];
    const stops: (() => void)[] = [];
    for (let i = 0; i < 200; i++) {
      const t = makeTab((i + 0.5) / 200);
      stops.push(startPolling({ intervalMs: 10 * MIN, run: () => void times.push(Date.now()), env: t.env }));
    }
    await vi.advanceTimersByTimeAsync(12 * MIN);
    expect(times).toHaveLength(200);
    const spread = Math.max(...times) - Math.min(...times);
    expect(spread).toBeGreaterThan(0.18 * 10 * MIN); // ~20 % window
    expect(spread).toBeLessThanOrEqual(0.2 * 10 * MIN + 1000);
    stops.forEach((s) => s());
  });

  it('the season submit rhythm is only ever stretched (the server refuses a snapshot inside 10 minutes)', () => {
    const t0 = 1_000_000;
    expect(shouldSubmitNow({ now: t0 + SUBMIT_INTERVAL_MS, lastAttemptAt: t0, event: false, jitter: 1.05 })).toBe(false);
    expect(shouldSubmitNow({ now: t0 + SUBMIT_INTERVAL_MS * 1.05, lastAttemptAt: t0, event: false, jitter: 1.05 })).toBe(true);
    expect(shouldSubmitNow({ now: t0 + SUBMIT_INTERVAL_MS - 1, lastAttemptAt: t0, event: false, jitter: 0.5 })).toBe(false); // a factor below 1 is ignored
  });
});

describe('every periodic remote call goes through the poller', () => {
  const read = (f: string) => readFileSync(resolve(__dirname, '../../', f), 'utf8');

  it('the market pass is every 10 minutes and the referral read every 30', () => {
    expect(read('components/market/MarketSync.tsx')).toContain('const EVERY_MS = 10 * 60_000;');
    expect(read('App.tsx')).toContain('const REFERRAL_POLL_MS = 30 * 60 * 1000;');
  });

  it('no remote timer is a bare setInterval any more', () => {
    for (const f of ['components/market/MarketSync.tsx', 'game/useSeasonSubmit.ts', 'game/useTradeableSync.ts']) {
      expect(read(f), f).not.toMatch(/setInterval/);
      expect(read(f), f).toContain('startPolling');
    }
    const app = read('App.tsx');
    expect(app.split('startPolling({').length - 1).toBe(4); // the League check, the referral read, the event calendar read and the server credits claim
    expect(app).not.toMatch(/setInterval\([^)]*(fetchReferralStatus|readLeagueResetAt)/);
  });
});
