import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyRequest, netStats, recordRemoteCall } from '../../lib/netStats';
import { PollEnv, startPolling } from '../../lib/poller';
import { SaveScheduler } from '../saveScheduler';

// One hour of typical play, on a fake clock, counted by the same request counter the DEV tab has (lib/netStats.ts): an action every 2 to 6 seconds, the moments that must reach the server at once,
// a few trips to another tab, and every periodic call the game makes. It checks the number of save uploads against the budget AND against what the game did before batching, and prints the
// whole table (the numbers in docs/backend-phase1.md, "Carga estimada").

const HOUR = 60 * 60_000;
const MIN = 60_000;
const BASE = 'https://project.supabase.co';
const PATCH_CHARACTERS = () => classifyRequest(`${BASE}/rest/v1/characters?user_id=eq.1&revision=eq.5`, 'PATCH');

// a small seeded generator so the "typical hour" is the same hour on every run
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Hour {
  /** every action of the hour: when it happened and whether the game itself flushed at once (the old commitSave) */
  actions: { at: number; commit: boolean }[];
  /** moments the hero reached a level / killed a boss / got a certified piece */
  important: number[];
  /** moments the player switched to another tab */
  hides: number[];
}

function typicalHour(seed: number): Hour {
  const rnd = mulberry32(seed);
  const actions: Hour['actions'] = [];
  for (let t = 5_000; t < HOUR - 5_000; t += 2_000 + rnd() * 4_000) actions.push({ at: Math.round(t), commit: rnd() < 0.3 });
  // 5 levels, 3 bosses, 3 certified pieces in an hour: far more than a real hero sees, so the budget is tested on a busy hour
  const important = Array.from({ length: 11 }, () => Math.round(60_000 + rnd() * (HOUR - 120_000))).sort((a, b) => a - b);
  const hides = [14 * MIN, 31 * MIN, 47 * MIN];
  return { actions, important, hides };
}

/** What the game did before: every change armed an 800 ms debounce, and every commitSave also uploaded at once (and the effect after it armed the debounce again). */
function uploadsBefore(hour: Hour): number {
  const times = hour.actions.map((a) => a.at);
  let uploads = hour.actions.filter((a) => a.commit).length; // the immediate flush of a commitSave
  for (let i = 0; i < times.length; i++) {
    const next = times[i + 1];
    if (next === undefined || next - times[i] > 800) uploads++; // the debounce of that burst fired
  }
  return uploads;
}

const MARKETS_PER_PASS = ['/rest/v1/item_certificates', '/functions/v1/market-my', '/functions/v1/material-sync'];

function tabEnv(): { env: Partial<PollEnv>; setVisible: (v: boolean) => void } {
  let visible = true;
  const listeners = new Set<() => void>();
  return {
    env: {
      visible: () => visible,
      onVisibility: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      now: () => Date.now(),
      random: () => 0.5,
    },
    setVisible: (v) => {
      visible = v;
      listeners.forEach((l) => l());
    },
  };
}

async function playAnHour(hour: Hour): Promise<{ maxStaleMs: number; lastVersionUploaded: number; version: number; pending: boolean }> {
  let version = 0;
  let oldestUnsent: number | null = null;
  let maxStaleMs = 0;
  let lastVersionUploaded = 0;
  const scheduler = new SaveScheduler({
    upload: async () => {
      const sent = version;
      if (oldestUnsent !== null) maxStaleMs = Math.max(maxStaleMs, Date.now() - oldestUnsent);
      oldestUnsent = null;
      recordRemoteCall(PATCH_CHARACTERS());
      lastVersionUploaded = sent;
      return 'ok';
    },
  });

  // the periodic calls, exactly as the game wires them (intervals as in the source: see poller.test.ts)
  const tab = tabEnv();
  const call = (path: string, method = 'POST') => recordRemoteCall(classifyRequest(`${BASE}${path}`, method));
  const stops = [
    startPolling({ intervalMs: 10 * MIN, startDelayMs: 1_500, env: tab.env, run: () => void MARKETS_PER_PASS.forEach((p) => call(p, p.startsWith('/rest') ? 'GET' : 'POST')) }),
    startPolling({ intervalMs: 5 * MIN, env: tab.env, run: () => call('/functions/v1/material-sync') }), // tradeable reconcile
    startPolling({ intervalMs: 30 * MIN, startDelayMs: 0, env: tab.env, run: () => call('/rest/v1/rpc/my_referral_status') }),
    startPolling({ intervalMs: 10 * MIN, startDelayMs: 15_000, env: tab.env, run: () => call('/functions/v1/submit-progress') }), // the season submit's 10 minute request
  ];

  type Step = { at: number; kind: 'action' | 'important' | 'hide' | 'show'; commit?: boolean };
  const steps: Step[] = [
    ...hour.actions.map((a): Step => ({ at: a.at, kind: 'action', commit: a.commit })),
    ...hour.important.map((at): Step => ({ at, kind: 'important' })),
    ...hour.hides.flatMap((at): Step[] => [
      { at, kind: 'hide' },
      { at: at + 60_000, kind: 'show' },
    ]),
  ].sort((a, b) => a.at - b.at);

  const start = Date.now();
  let hidden = false;
  for (const step of steps) {
    await vi.advanceTimersByTimeAsync(start + step.at - Date.now());
    if (step.kind === 'hide') {
      hidden = true;
      tab.setVisible(false);
      void scheduler.flush({ keepalive: true });
    } else if (step.kind === 'show') {
      hidden = false;
      tab.setVisible(true);
    } else if (!hidden) {
      version++;
      if (oldestUnsent === null) oldestUnsent = Date.now();
      scheduler.markDirty(step.kind === 'important');
    }
  }
  await vi.advanceTimersByTimeAsync(start + HOUR - Date.now());
  stops.forEach((s) => s());
  const pending = scheduler.pending;
  await scheduler.flush();
  return { maxStaleMs, lastVersionUploaded, version, pending };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  netStats.reset();
});
afterEach(() => vi.useRealTimers());

describe('request counter', () => {
  it('names each kind of request', () => {
    expect(classifyRequest(`${BASE}/rest/v1/characters?user_id=eq.1`, 'PATCH')).toBe('save-upload');
    expect(classifyRequest(`${BASE}/rest/v1/characters?select=save_data`, 'GET')).toBe('save-load');
    expect(classifyRequest(`${BASE}/rest/v1/characters`, 'POST')).toBe('save-create');
    expect(classifyRequest(`${BASE}/functions/v1/submit-progress`, 'POST')).toBe('fn:submit-progress');
    expect(classifyRequest(`${BASE}/rest/v1/rpc/league_reset_at`, 'POST')).toBe('rpc:league_reset_at');
    expect(classifyRequest(`${BASE}/rest/v1/entitlements?select=id`, 'GET')).toBe('db:entitlements');
    expect(classifyRequest(`${BASE}/auth/v1/token?grant_type=refresh_token`, 'POST')).toBe('auth:token');
    expect(classifyRequest('https://example.com/x', 'GET')).toBe('other');
  });

  it('counts per minute and per hour, and resets', () => {
    const now = Date.now();
    recordRemoteCall('save-upload', now - 90_000);
    recordRemoteCall('save-upload', now - 10_000);
    recordRemoteCall('fn:mint-item', now - 5_000);
    expect(netStats.perMinute(60_000, now)).toEqual({ 'save-upload': 1, 'fn:mint-item': 1 });
    expect(netStats.total()['save-upload']).toBe(2);
    expect(netStats.perHour(60_000, now)['save-upload']).toBe(60);
    netStats.reset();
    expect(netStats.total()).toEqual({});
  });
});

describe('one hour of typical play', () => {
  it('uploads the save at most ~90 times, against about a thousand before batching, and loses nothing', async () => {
    const hour = typicalHour(20261016);
    const before = uploadsBefore(hour);
    const out = await playAnHour(hour);
    const perHour = netStats.total();
    const uploads = perHour['save-upload'] ?? 0;

    console.info(`[netLoad] ${hour.actions.length} actions, ${hour.important.length} important moments, ${hour.hides.length} tab trips in one hour`);
    console.info(`[netLoad] save uploads per hour: before ${before}, after ${uploads}`);
    console.info(`[netLoad] all remote calls in that hour: ${JSON.stringify(perHour)}`);

    expect(uploads).toBeLessThanOrEqual(90);
    expect(before).toBeGreaterThan(uploads * 8);
    // nothing dropped: the last thing the player did is on the server, and no change waited longer than the batch
    expect(out.lastVersionUploaded).toBe(out.version);
    expect(out.maxStaleMs).toBeLessThanOrEqual(46_000);
  });

  it('the periodic calls of an hour stay small: no hidden minute makes one', async () => {
    const hour = typicalHour(7);
    await playAnHour(hour);
    const t = netStats.total();
    expect(t['fn:market-my']).toBeLessThanOrEqual(7);
    expect(t['db:item_certificates']).toBeLessThanOrEqual(7);
    expect(t['rpc:my_referral_status']).toBeLessThanOrEqual(3);
    expect(t['fn:submit-progress']).toBeLessThanOrEqual(7);
    expect(t['fn:material-sync']).toBeLessThanOrEqual(20);
  });

  it('an hour with the tab hidden the whole time makes no periodic call at all', async () => {
    const tab = tabEnv();
    tab.setVisible(false);
    const stop = startPolling({ intervalMs: 5 * MIN, startDelayMs: 0, env: tab.env, run: () => recordRemoteCall('fn:material-sync') });
    await vi.advanceTimersByTimeAsync(HOUR);
    stop();
    expect(netStats.total()).toEqual({});
  });
});
