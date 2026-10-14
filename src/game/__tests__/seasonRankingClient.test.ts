import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { defaultSave } from '../engine';
import { EVENT_MIN_GAP_MS, MyEntry, SUBMIT_INTERVAL_MS, SeasonRow, pickSeason, seasonEligibility, shouldSubmitNow } from '../seasonRanking';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 20);

const season = (over: Partial<SeasonRow> = {}): SeasonRow => ({
  number: 1,
  starts_at: new Date(T0 - 10 * DAY).toISOString(),
  ends_at: new Date(T0 + 50 * DAY).toISOString(),
  freeze_at: new Date(T0 + 48 * DAY).toISOString(),
  status: 'open',
  prize_note: null,
  ...over,
});

const base = { online: true, season: season(), now: T0, ownsPass: true, emailConfirmed: true, lastVerdict: null, mine: null };

describe('season ranking: which season and what the player is told', () => {
  it('shows the open season, else the newest that ran, else the next one', () => {
    const rows = [season({ number: 1, status: 'paid' }), season({ number: 2, status: 'frozen' }), season({ number: 3, status: 'upcoming' })];
    expect(pickSeason(rows, T0)?.number).toBe(2);
    expect(pickSeason([...rows, season({ number: 4, status: 'open' })], T0)?.number).toBe(4);
    expect(pickSeason([season({ number: 5, status: 'upcoming' }), season({ number: 6, status: 'upcoming' })], T0)?.number).toBe(5);
    expect(pickSeason([], T0)).toBeNull();
    // an "open" season whose start date is still in the future is not shown as open
    expect(pickSeason([season({ number: 7, status: 'open', starts_at: new Date(T0 + DAY).toISOString() })], T0)?.number).toBe(7);
  });

  it('explains every state in plain words', () => {
    expect(seasonEligibility({ ...base, online: false })).toBe('web_only');
    expect(seasonEligibility({ ...base, season: null })).toBe('no_season');
    expect(seasonEligibility({ ...base, season: season({ status: 'upcoming' }) })).toBe('not_open');
    expect(seasonEligibility({ ...base, season: season({ starts_at: new Date(T0 + DAY).toISOString() }) })).toBe('not_open');
    expect(seasonEligibility({ ...base, season: season({ status: 'frozen' }) })).toBe('over');
    expect(seasonEligibility({ ...base, season: season({ freeze_at: new Date(T0 - 1000).toISOString() }) })).toBe('over'); // past freeze_at even if the owner has not flipped the status
    expect(seasonEligibility({ ...base, ownsPass: false })).toBe('needs_pass');
    expect(seasonEligibility({ ...base, emailConfirmed: false })).toBe('needs_email');
    expect(seasonEligibility({ ...base, ownsPass: false, emailConfirmed: false })).toBe('needs_pass');
    const mine: MyEntry = { season: 1, rank: 3, level_total: 50, paragon_level: 0, highest_floor: 40, deepest_depth: 0, flag_count: 0, disqualified: true };
    expect(seasonEligibility({ ...base, mine })).toBe('disqualified');
    expect(seasonEligibility({ ...base, lastVerdict: 'flagged' })).toBe('flagged');
    expect(seasonEligibility({ ...base, lastVerdict: 'rejected' })).toBe('flagged');
    expect(seasonEligibility({ ...base, lastVerdict: 'ok' })).toBe('eligible');
    expect(seasonEligibility(base)).toBe('eligible');
  });

  it('every state has text in both languages, and no text promises an amount', () => {
    const states = ['eligible', 'needs_pass', 'needs_email', 'flagged', 'disqualified', 'not_open', 'over', 'no_season', 'web_only'];
    for (const table of [pt, en]) {
      const block = (table as unknown as { seasonRanking: { elig: Record<string, string> } }).seasonRanking;
      for (const s of states) expect(block.elig[s], s).toBeTruthy();
      expect(JSON.stringify(block)).not.toMatch(/R\$|US\$|USD|\$\s?\d|\d\s?(reais|dollars)/i);
    }
  });
});

describe('season ranking: when the game posts its save', () => {
  it('first time right away, then every 10 minutes, early (at most once a minute) after an event', () => {
    expect(shouldSubmitNow({ now: T0, lastAttemptAt: null, event: false })).toBe(true);
    expect(shouldSubmitNow({ now: T0 + SUBMIT_INTERVAL_MS - 1, lastAttemptAt: T0, event: false })).toBe(false);
    expect(shouldSubmitNow({ now: T0 + SUBMIT_INTERVAL_MS, lastAttemptAt: T0, event: false })).toBe(true);
    expect(shouldSubmitNow({ now: T0 + 5_000, lastAttemptAt: T0, event: true })).toBe(false);
    expect(shouldSubmitNow({ now: T0 + EVENT_MIN_GAP_MS, lastAttemptAt: T0, event: true })).toBe(true);
    expect(shouldSubmitNow({ now: T0 - 60_000, lastAttemptAt: T0, event: false })).toBe(true); // the clock went back
  });
});

describe('season ranking: the flag and the network', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('../../lib/supabaseClient');
  });

  it('is OFF by default and then submits nothing, with no request at all', async () => {
    const invoke = vi.fn();
    vi.doMock('../../lib/supabaseClient', () => ({ supabase: { functions: { invoke } }, isSupabaseConfigured: true }));
    const mod = await import('../seasonRanking');
    expect(mod.seasonRankingEnabled).toBe(false);
    const s = await mod.submitProgress(defaultSave());
    expect(s.state).toBe('idle');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('with the flag on but no backend (the desktop / offline build) it still sends nothing', async () => {
    vi.stubEnv('VITE_SEASON_RANKING_ENABLED', 'true');
    vi.doMock('../../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }));
    const mod = await import('../seasonRanking');
    expect(mod.seasonRankingEnabled).toBe(true);
    expect((await mod.submitProgress(defaultSave())).state).toBe('idle');
  });

  it('with the flag on it posts the upload blob to submit-progress and records the verdict; a failure never throws', async () => {
    vi.stubEnv('VITE_SEASON_RANKING_ENABLED', 'true');
    const invoke = vi.fn().mockResolvedValueOnce({ data: { verdict: 'flagged', reasons: ['LEVEL_PACE'], throttled: false, season: 'flags_recorded' }, error: null });
    vi.doMock('../../lib/supabaseClient', () => ({ supabase: { functions: { invoke } }, isSupabaseConfigured: true }));
    const mod = await import('../seasonRanking');
    const done = await mod.submitProgress(defaultSave(), 123);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe('submit-progress');
    expect(invoke.mock.calls[0][1].body.appVersion).toBeTruthy(); // toUploadBlob
    expect(done).toMatchObject({ state: 'done', verdict: 'flagged', reasons: ['LEVEL_PACE'], season: 'flags_recorded', at: 123 });

    invoke.mockRejectedValueOnce(new Error('network down'));
    const failed = await mod.submitProgress(defaultSave(), 456);
    expect(failed.state).toBe('error');

    invoke.mockResolvedValueOnce({ data: { nonsense: true }, error: null });
    expect((await mod.submitProgress(defaultSave(), 789)).state).toBe('error');

    const huge = defaultSave();
    (huge as unknown as { junk: string }).junk = 'x'.repeat(400 * 1024);
    invoke.mockClear();
    expect((await mod.submitProgress(huge, 999)).state).toBe('error');
    expect(invoke).not.toHaveBeenCalled(); // an oversized save is refused before any request
  });
});
