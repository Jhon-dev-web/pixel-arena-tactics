import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { INITIAL_TRACKER, OPS_POLL_MS, OPS_QUIET, OPS_RETRY_MS, UNREACHABLE_AFTER_MS, applyProbe, getOpsState, nextTracker, parseServerStatus, parseStaticStatus, probeOnce, resetOpsStatus, startOpsStatusPolling, type OpsFlagsView, type Probe, type ProbeIO, type Tracker } from '../../lib/opsStatus';

// The maintenance banner and the notices of the pauses (migration 0021): what the game does with public.ops_status(), with /status.json when the server is silent, and when it stays quiet.
const read = (f: string) => readFileSync(resolve(__dirname, '../../../', f), 'utf8');
const NONE: OpsFlagsView = { maintenance: false, marketPaused: false, scoringPaused: false, passSalesPaused: false };
const server = (over: Partial<OpsFlagsView> = {}): Probe => ({ kind: 'server', flags: { ...NONE, ...over } });
const failed = (staticFile: { maintenance: boolean; message: string | null } | null): Probe => ({ kind: 'server_failed', staticFile });
const MIN = 60_000;

describe('reading the answers', () => {
  it('parseServerStatus: only an exact true counts; a non-object is "no answer"', () => {
    expect(parseServerStatus({ maintenance_mode: true, market_paused: 'true', season_scoring_paused: 1, pass_sales_paused: true })).toEqual({ maintenance: true, marketPaused: false, scoringPaused: false, passSalesPaused: true });
    expect(parseServerStatus({})).toEqual(NONE);
    expect(parseServerStatus(null)).toBeNull();
    expect(parseServerStatus('maintenance')).toBeNull();
    expect(parseServerStatus([true])).toBeNull();
  });

  it('parseStaticStatus: maintenance must be exactly true; the message is plain text, one line, clipped', () => {
    expect(parseStaticStatus({ maintenance: true, message: '  Voltamos\n  às 18h  ' })).toEqual({ maintenance: true, message: 'Voltamos às 18h' });
    expect(parseStaticStatus({ maintenance: 'true' })).toEqual({ maintenance: false, message: null });
    expect(parseStaticStatus({ maintenance: false, message: '' })).toEqual({ maintenance: false, message: null });
    expect(parseStaticStatus({ maintenance: true, message: 'x'.repeat(500) })?.message).toHaveLength(200);
    expect(parseStaticStatus(null)).toBeNull();
    expect(parseStaticStatus('<html>')).toBeNull();
  });

  it('the file the owner ships is quiet', () => {
    expect(JSON.parse(read('public/status.json'))).toEqual({ maintenance: false, message: '' });
    expect(JSON.parse(read('vercel.json')).headers.some((h: { source: string; headers: { key: string; value: string }[] }) => h.source === '/status.json' && h.headers.some((x) => x.key === 'Cache-Control' && x.value === 'no-store'))).toBe(true);
  });
});

describe('the state machine', () => {
  const run = (probes: [Probe, number][], from: Tracker = INITIAL_TRACKER): Tracker => probes.reduce((t, [p, at]) => nextTracker(t, p, at), from);

  it('the server says maintenance_mode: the banner shows (reason "flag"); the server says it is over: it goes away', () => {
    const on = run([[server({ maintenance: true, marketPaused: true }), 0]]);
    expect(on.state).toMatchObject({ maintenance: true, maintenanceReason: 'flag', marketPaused: true });
    const off = nextTracker(on, server(), 5 * MIN);
    expect(off.state).toEqual(OPS_QUIET);
  });

  it('the pause flags travel without the banner', () => {
    const t = run([[server({ marketPaused: true, passSalesPaused: true, scoringPaused: true }), 0]]);
    expect(t.state).toMatchObject({ maintenance: false, maintenanceReason: null, marketPaused: true, passSalesPaused: true, scoringPaused: true });
  });

  it('server silent but /status.json says maintenance: the banner shows at once, with the owner\'s message', () => {
    const t = run([[failed({ maintenance: true, message: 'Banco em manutenção até as 18h' }), 0]]);
    expect(t.state).toMatchObject({ maintenance: true, maintenanceReason: 'static', staticMessage: 'Banco em manutenção até as 18h' });
    // the owner redeploys the file with maintenance false: it goes away
    expect(nextTracker(t, failed({ maintenance: false, message: null }), MIN).state.maintenance).toBe(false);
  });

  it('server silent while the host answers: quiet at first, the maintenance banner after 3 minutes in a row, gone when the server is back', () => {
    const probes: [Probe, number][] = [0, 1, 2].map((m) => [failed({ maintenance: false, message: null }), m * MIN]);
    let t = run(probes);
    expect(t.state.maintenance).toBe(false);
    expect(t.failingSince).toBe(0);
    t = nextTracker(t, failed({ maintenance: false, message: null }), UNREACHABLE_AFTER_MS - 1);
    expect(t.state.maintenance).toBe(false);
    t = nextTracker(t, failed({ maintenance: false, message: null }), UNREACHABLE_AFTER_MS);
    expect(t.state).toMatchObject({ maintenance: true, maintenanceReason: 'unreachable' });
    t = nextTracker(t, server(), 10 * MIN);
    expect(t.state).toEqual(OPS_QUIET);
    expect(t.failingSince).toBeNull();
  });

  it('a success in the middle resets the 3 minutes', () => {
    let t = run([[failed({ maintenance: false, message: null }), 0], [failed({ maintenance: false, message: null }), 2 * MIN], [server(), 2.5 * MIN]]);
    t = nextTracker(t, failed({ maintenance: false, message: null }), 3 * MIN);
    expect(t.state.maintenance).toBe(false);
    expect(t.failingSince).toBe(3 * MIN);
  });

  it('neither the server nor the host answers: the player is offline, so no banner appears and an old "unreachable" banner is dropped', () => {
    let t = run([[failed(null), 0], [failed(null), 10 * MIN]]);
    expect(t.state).toEqual(OPS_QUIET);
    expect(t.failingSince).toBeNull();
    const unreachable = run([[failed({ maintenance: false, message: null }), 0], [failed({ maintenance: false, message: null }), UNREACHABLE_AFTER_MS]]);
    expect(unreachable.state.maintenanceReason).toBe('unreachable');
    t = nextTracker(unreachable, failed(null), UNREACHABLE_AFTER_MS + MIN);
    expect(t.state.maintenance).toBe(false);
  });

  it('a maintenance flag the server announced is not cleared by a later server blip', () => {
    const t = run([[server({ maintenance: true }), 0], [failed({ maintenance: false, message: null }), MIN]]);
    expect(t.state).toMatchObject({ maintenance: true, maintenanceReason: 'flag' });
  });

  it('the pause flags are kept while the server is silent', () => {
    const t = run([[server({ marketPaused: true }), 0], [failed({ maintenance: false, message: null }), MIN]]);
    expect(t.state.marketPaused).toBe(true);
  });
});

describe('probeOnce', () => {
  const io = (s: () => Promise<unknown>, f: () => Promise<unknown>): ProbeIO => ({ readServer: s, readStatic: f });

  it('uses the server and never touches the static file when the server answers', async () => {
    const stat = vi.fn(async () => ({ maintenance: true }));
    const p = await probeOnce(io(async () => ({ maintenance_mode: false, market_paused: true }), stat));
    expect(p).toEqual(server({ marketPaused: true }));
    expect(stat).not.toHaveBeenCalled();
  });

  it.each([
    ['throws', async () => Promise.reject(new Error('network'))],
    ['answers garbage', async () => 'not an object'],
    ['answers null', async () => null],
  ])('when the server %s it falls back to the static file', async (_n, readServer) => {
    expect(await probeOnce(io(readServer, async () => ({ maintenance: true, message: 'x' })))).toEqual(failed({ maintenance: true, message: 'x' }));
    expect(await probeOnce(io(readServer, async () => Promise.reject(new Error('offline'))))).toEqual(failed(null));
    expect(await probeOnce(io(readServer, async () => null))).toEqual(failed(null));
  });
});

describe('the store and the polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
    resetOpsStatus();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetOpsStatus();
  });

  it('applyProbe updates the shared state and notifies only on a real change', () => {
    expect(getOpsState()).toEqual(OPS_QUIET);
    applyProbe(server({ maintenance: true }), 0);
    expect(getOpsState().maintenance).toBe(true);
    const before = getOpsState();
    applyProbe(server({ maintenance: true }), 5 * MIN);
    expect(getOpsState()).toBe(before); // same object: nothing re-renders
    applyProbe(server(), 10 * MIN);
    expect(getOpsState()).toEqual(OPS_QUIET);
  });

  const fakeTab = () => ({ visible: () => true, onVisibility: () => () => undefined, now: () => Date.now(), random: () => 0.5 });

  it('without a backend (the offline / desktop build) it does nothing at all', async () => {
    const readServer = vi.fn(async () => ({}));
    const stop = startOpsStatusPolling({ readServer, readStatic: vi.fn(async () => null) }, false, fakeTab());
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS * 3);
    expect(readServer).not.toHaveBeenCalled();
    stop();
  });

  it('asks soon after login, then every 5 minutes; a silent server is re-asked after 45 s; the banner appears after 3 minutes of silence', async () => {
    let serverUp = false;
    const readServer = vi.fn(async () => {
      if (!serverUp) throw new Error('down');
      return { maintenance_mode: false, market_paused: false, season_scoring_paused: false, pass_sales_paused: false };
    });
    const readStatic = vi.fn(async () => ({ maintenance: false }));
    const stop = startOpsStatusPolling({ readServer, readStatic }, true, fakeTab());
    await vi.advanceTimersByTimeAsync(1_500);
    expect(readServer).toHaveBeenCalledTimes(1);
    expect(getOpsState().maintenance).toBe(false);
    // while it is silent: one more try every 45 s (the poller keeps its +-10 % jitter off with random 0.5 but the override is exact)
    await vi.advanceTimersByTimeAsync(OPS_RETRY_MS);
    expect(readServer).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(UNREACHABLE_AFTER_MS);
    expect(getOpsState()).toMatchObject({ maintenance: true, maintenanceReason: 'unreachable' });
    // the server comes back: the banner goes and the rhythm relaxes to 5 minutes
    serverUp = true;
    await vi.advanceTimersByTimeAsync(OPS_RETRY_MS);
    expect(getOpsState().maintenance).toBe(false);
    const calls = readServer.mock.calls.length;
    await vi.advanceTimersByTimeAsync(OPS_POLL_MS - 1);
    expect(readServer).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(2);
    expect(readServer).toHaveBeenCalledTimes(calls + 1);
    stop();
  });

  it('an offline player (neither the server nor the host answers) is not retried every 45 s and sees no banner', async () => {
    const readServer = vi.fn(async () => Promise.reject(new Error('offline')));
    const readStatic = vi.fn(async () => Promise.reject(new Error('offline')));
    const stop = startOpsStatusPolling({ readServer, readStatic }, true, fakeTab());
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(OPS_RETRY_MS * 3);
    expect(readServer).toHaveBeenCalledTimes(1);
    expect(getOpsState().maintenance).toBe(false);
    stop();
  });
});

describe('the banner and the notices', () => {
  it('OpsBanner is mounted once, above the whole game (login screen included), and is a polite status region', () => {
    const main = read('src/main.tsx');
    expect(main).toContain('<OpsBanner />');
    expect(main.indexOf('<OpsBanner />')).toBeLessThan(main.indexOf('<GameShell />'));
    const banner = read('src/components/OpsBanner.tsx');
    expect(banner).toContain('role="status"');
    expect(banner).toContain('useOpsStatusPolling()');
    expect(banner).toContain('if (!s.maintenance) return null;');
  });

  it('the market screen, the Pass modal and the ranking panel each say plainly when their area is paused', () => {
    expect(read('src/components/MarketScreen.tsx')).toMatch(/ops\.marketPaused[\s\S]*ops-market-paused|ops-market-paused[\s\S]*ops\.marketPaused/);
    const pass = read('src/components/BattlePassModal.tsx');
    expect(pass).toContain('const salesPaused = server && ops.passSalesPaused;');
    expect(pass).toContain('data-testid="ops-pass-paused"');
    expect(pass).toContain("t('ops.passSalesPaused')");
    expect(read('src/components/SeasonRankingPanel.tsx')).toContain('ops.scoringPaused');
  });

  it('every ops string exists in both languages, and the CSS uses design tokens only', () => {
    const keys = ['maintenanceTitle', 'maintenanceText', 'unreachableTitle', 'unreachableText', 'marketPaused', 'passSalesPaused', 'scoringPaused'];
    for (const k of keys) {
      expect((en as unknown as { ops: Record<string, string> }).ops[k], `en ${k}`).toMatch(/\S/);
      expect((pt as unknown as { ops: Record<string, string> }).ops[k], `pt ${k}`).toMatch(/\S/);
    }
    const css = read('src/ui/ops.css');
    expect(css).not.toMatch(/font-size:\s*\d/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toContain('var(--z-toast)');
  });

  it('the client reads only the public status function and never a flag table or an admin function', () => {
    const src = read('src/lib/opsStatus.ts');
    expect(src).toContain("supabase.rpc('ops_status')");
    expect(src).not.toMatch(/\.from\(|admin_|ops_pause|service_role/);
  });
});
