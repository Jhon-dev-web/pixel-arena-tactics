import { describe, expect, it } from 'vitest';
import { BOUNDS, daysAtFloor, daysAtLevel, professionBurstXp, professionXpPerHour } from '../progress/bounds.ts';
import { EvalInput, HistoryPoint, evaluateSnapshot } from '../progress/evaluate.ts';
import { createProgressStore } from '../progress/progressDb.ts';
import { MAX_BODY_BYTES, NewSnapshot, ProfessionApplyStatus, ProgressStore, SNAPSHOT_MIN_INTERVAL_MS, SeasonApplyStatus, StoredSnapshot, canonicalJson, handleSubmitProgress } from '../progress/handler.ts';
import { ProgressMetrics, computeScore, extractMetrics, levelFromXp, levelPosition, paragonFromXp, peakOf, professionLevelFromXp, professionScores, splitScore } from '../progress/metrics.ts';
import { PROFESSION_XP_TO_LEVEL, XP_TO_LEVEL } from '../progress/tables.ts';

// Pure tests of the plausibility audit with SYNTHETIC histories. No Deno, no Supabase: the same modules the Edge Function imports.

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 5);
const USER = '11111111-1111-4111-8111-111111111111';

// ---- helpers ----------------------------------------------------------------------------------------------------------------------------------

/** The day the fastest simulated seed stood at `pos` is daysAtLevel(pos); this is its inverse (the honest fast player of the tests lives on that curve). */
function inverse(table: readonly (readonly [number, number])[], day: number): number {
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (day <= y1) {
      const [x0, y0] = table[i - 1];
      return x0 + ((x1 - x0) * (day - y0)) / (y1 - y0);
    }
  }
  const [xa, ya] = table[table.length - 2];
  const [xb, yb] = table[table.length - 1];
  return xb + ((xb - xa) / (yb - ya)) * (day - yb);
}

function xpAtPosition(pos: number): number {
  const level = Math.min(XP_TO_LEVEL.length, Math.max(1, Math.floor(pos)));
  const from = XP_TO_LEVEL[level - 1];
  if (level >= XP_TO_LEVEL.length) return from + Math.round((pos - level) * 456_913); // a paragon level costs about 457k at the start
  return Math.floor(from + (pos - level) * (XP_TO_LEVEL[level] - from));
}

interface Overrides {
  xp?: number;
  floor?: number;
  depth?: number;
  kills?: number;
  gold?: number;
  seconds?: number;
  bosses?: number;
  runs?: number;
  floors?: number;
  uniques?: number;
  achievements?: number;
  mining?: number;
  woodcutting?: number;
  gardening?: number;
  hasBattlePass?: boolean;
  premium?: number[];
  stashBonusSlots?: number;
  templates?: { templateId: string; rarity?: string }[];
}

function blob(o: Overrides = {}) {
  return {
    xp: o.xp ?? 0,
    highestDungeonFloor: o.floor ?? 0,
    stats: {
      deepestDepth: o.depth ?? 0,
      kills: o.kills ?? 0,
      goldEarned: o.gold ?? 0,
      secondsPlayed: o.seconds ?? 0,
      bossesKilled: o.bosses ?? 0,
      dungeonRuns: o.runs ?? 0,
      dungeonFloors: o.floors ?? 0,
      uniquesFound: o.uniques ?? 0,
    },
    skillXp: { mining: o.mining ?? 0, woodcutting: o.woodcutting ?? 0, gardening: o.gardening ?? 0 },
    quests: { claimed: Array.from({ length: o.achievements ?? 0 }, (_, i) => `ACH_${i}`) },
    hasBattlePass: o.hasBattlePass ?? false,
    claimedPassRewards: { free: [], premium: o.premium ?? [] },
    stashBonusSlots: o.stashBonusSlots ?? 0,
    gearInstances: Object.fromEntries((o.templates ?? []).map((t, i) => [`gi_${i}`, { id: `gi_${i}`, templateId: t.templateId, rarity: t.rarity ?? 'common' }])),
    schemaVersion: 2,
    appVersion: '0.1.0',
  };
}

const m = (o: Overrides = {}): ProgressMetrics => extractMetrics(blob(o)) as ProgressMetrics;

function point(atMs: number, metrics: ProgressMetrics, revision = 1, peak = peakOf(metrics)): HistoryPoint {
  return { atMs, metrics, peak, saveRevision: revision };
}

/** Plays a history through the evaluator, one snapshot per entry, exactly like the function does (first = first OK snapshot, previous = last OK snapshot: flagged and rejected are never a baseline). */
function play(steps: { atMs: number; o: Overrides; revision?: number; entitled?: boolean }[], accountCreatedMs = T0 - 365 * DAY) {
  let first: HistoryPoint | null = null;
  let previous: HistoryPoint | null = null;
  const out: { verdict: string; reasons: string[] }[] = [];
  steps.forEach((s, i) => {
    const metrics = m(s.o);
    const input: EvalInput = { nowMs: s.atMs, accountCreatedMs, entitled: s.entitled ?? true, saveRevision: s.revision ?? i + 1, first, previous };
    const ev = evaluateSnapshot(metrics, input);
    out.push({ verdict: ev.verdict, reasons: ev.reasons });
    if (ev.verdict === 'ok') {
      const p = point(s.atMs, metrics, s.revision ?? i + 1, ev.peak);
      first = first ?? p;
      previous = p;
    }
  });
  return out;
}

/** A history on the fastest-seed curve, one snapshot every `everyHours`, for `days` days. `speed` 1 = exactly the fastest seed. */
function honestHistory(days: number, everyHours: number, speed = 1) {
  const steps: { atMs: number; o: Overrides }[] = [];
  for (let h = 0; h <= days * 24; h += everyHours) {
    const day = (h / 24) * speed;
    const pos = inverse(BOUNDS.levelPace, day);
    const floor = Math.floor(inverse(BOUNDS.floorPace, day));
    const depth = floor >= 100 ? Math.min(44, Math.floor(BOUNDS.depthPerDayFastest * (day - BOUNDS.floorPace[BOUNDS.floorPace.length - 1][1]))) : 0;
    steps.push({
      atMs: T0 + h * 3_600_000,
      o: {
        xp: xpAtPosition(pos),
        floor,
        depth: Math.max(0, depth),
        kills: Math.floor(day * 2500),
        gold: Math.floor(day * 30_000),
        seconds: Math.floor(day * 86_400 * 0.4),
        bosses: Math.floor(day * 3),
        runs: Math.floor(day * 10),
        floors: Math.floor(day * 400),
        uniques: Math.floor(day / 4),
        achievements: Math.min(100, Math.floor(day)),
      },
    });
  }
  return steps;
}

// ---- metrics ----------------------------------------------------------------------------------------------------------------------------------

describe('extractMetrics', () => {
  it('reads the numbers defensively: garbage, negatives, NaN and giants never throw and never escape their clamps', () => {
    expect(extractMetrics(null)).toBeNull();
    expect(extractMetrics([])).toBeNull();
    expect(extractMetrics('x')).toBeNull();
    const dirty = extractMetrics({ xp: -5, highestDungeonFloor: 5000, stats: { kills: Number.NaN, deepestDepth: 1e30, goldEarned: '9' }, gearInstances: 3, quests: null }) as ProgressMetrics;
    expect(dirty.xp).toBe(0);
    expect(dirty.highestFloor).toBe(100);
    expect(dirty.kills).toBe(0);
    expect(dirty.deepestDepth).toBe(99_999);
    expect(dirty.goldEarned).toBe(0);
    expect(dirty.achievements).toBe(0);
    expect(dirty.heroLevel).toBe(1);
  });

  it('counts gear by rarity and names the pieces that exist below their gate', () => {
    const ok = m({ xp: XP_TO_LEVEL[89], templates: [{ templateId: 'abyssal_greatblade', rarity: 'legendary' }, { templateId: 'wooden_club' }] });
    expect(ok.items.legendary).toBe(1);
    expect(ok.items.common).toBe(1);
    expect(ok.gateViolations).toEqual([]);
    const bad = m({ xp: XP_TO_LEVEL[29], templates: [{ templateId: 'abyssal_greatblade' }, { templateId: 'abyssal_greatblade' }] });
    expect(bad.gateViolations).toEqual(['abyssal_greatblade']);
  });

  it('level and paragon follow the XP table', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(XP_TO_LEVEL[49])).toBe(50);
    expect(levelFromXp(XP_TO_LEVEL[49] - 1)).toBe(49);
    const p = paragonFromXp(XP_TO_LEVEL[99] + 456_913 * 3);
    expect(p.level).toBeGreaterThanOrEqual(2);
    expect(m({ xp: XP_TO_LEVEL[99] + 456_913 * 3 }).levelTotal).toBe(100 + p.level);
    expect(levelPosition(XP_TO_LEVEL[49])).toBeCloseTo(50, 6);
  });
});

describe('score', () => {
  it('orders by level (paragon included), then depth; the parts come back out', () => {
    const a = computeScore(m({ xp: XP_TO_LEVEL[59], floor: 40 }));
    const b = computeScore(m({ xp: XP_TO_LEVEL[59], floor: 41 }));
    const c = computeScore(m({ xp: XP_TO_LEVEL[60], floor: 1 }));
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b); // a higher level beats any depth
    expect(splitScore(a)).toEqual({ levelTotal: 60, depthScore: 40 });
    const deep = m({ xp: XP_TO_LEVEL[99] + 456_913 * 5, floor: 100, depth: 30 });
    expect(splitScore(computeScore(deep))).toEqual({ levelTotal: deep.levelTotal, depthScore: 130 });
    expect(computeScore(deep)).toBeGreaterThan(computeScore(m({ xp: XP_TO_LEVEL[99], floor: 100, depth: 300 })));
  });
});

// ---- the audit --------------------------------------------------------------------------------------------------------------------------------

describe('evaluateSnapshot: an honest player', () => {
  it('the fastest simulated seed (and a human 20% faster) is ok at every snapshot over 150 days, snapshots every 12 h', () => {
    for (const speed of [1, 1.2]) {
      const result = play(honestHistory(150, 12, speed));
      const bad = result.map((r, i) => ({ ...r, i })).filter((r) => r.verdict !== 'ok');
      expect(bad).toEqual([]);
    }
  });

  it('snapshots every 10 minutes for 10 days stay ok too (the cumulative bound has no hidden drift)', () => {
    const result = play(honestHistory(10, 1 / 6, 1));
    expect(result.filter((r) => r.verdict !== 'ok')).toEqual([]);
  });

  it('a pace 2.5x the fastest seed is flagged (not ranked) and 3.5x is rejected', () => {
    const flagged = play(honestHistory(40, 12, 2.5));
    expect(flagged.some((r) => r.verdict === 'flagged')).toBe(true);
    expect(flagged.some((r) => r.verdict === 'rejected')).toBe(false);
    const rejected = play(honestHistory(40, 12, 3.5));
    expect(rejected.some((r) => r.verdict === 'rejected')).toBe(true);
  });

  it('a late claim is fine: an offline Hunt of 8 h in the best zone plus a finished order arrives in one snapshot', () => {
    const base = XP_TO_LEVEL[74];
    const r = play([
      { atMs: T0, o: { xp: base, floor: 80, seconds: 3600 } },
      { atMs: T0 + 3_600_000, o: { xp: base + 8 * 13_000 * 1.5, floor: 80, seconds: 7200 } },
    ]);
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'ok']);
  });
});

describe('evaluateSnapshot: cheating', () => {
  const honestStart = { atMs: T0, o: { xp: xpAtPosition(5), floor: 3, seconds: 4000, kills: 200 } };

  it('an edited level: level 80 ten minutes after level 5 is rejected', () => {
    const r = play([honestStart, { atMs: T0 + 10 * 60_000, o: { xp: XP_TO_LEVEL[79], floor: 3, seconds: 4600, kills: 260 } }]);
    expect(r[0].verdict).toBe('ok');
    expect(r[1].verdict).toBe('rejected');
    expect(r[1].reasons).toEqual(expect.arrayContaining(['LEVEL_PACE', 'LEVEL_PACE_TOTAL', 'XP_RATE']));
  });

  it('an edited floor and depth are rejected (depth without floor 100, floor jump)', () => {
    const r = play([honestStart, { atMs: T0 + 3_600_000, o: { xp: honestStart.o.xp, floor: 3, depth: 25, seconds: 7000 } }]);
    expect(r[1].verdict).toBe('rejected');
    expect(r[1].reasons).toContain('DEPTH_WITHOUT_FLOOR_100');
    const jump = play([honestStart, { atMs: T0 + 3_600_000, o: { xp: honestStart.o.xp, floor: 90, seconds: 7000 } }]);
    expect(jump[1].verdict).toBe('rejected');
    expect(jump[1].reasons).toEqual(expect.arrayContaining(['FLOOR_PACE', 'FLOOR_ABOVE_LEVEL_CAP']));
  });

  it('a clock jump (8 h of hunting claimed every 10 minutes) is caught by the cumulative bound against the SERVER time since the first snapshot', () => {
    const steps = [{ atMs: T0, o: { xp: 0, seconds: 0 } }];
    for (let i = 1; i <= 40; i++) steps.push({ atMs: T0 + i * 10 * 60_000, o: { xp: i * 8 * 2300, seconds: i * 600 } }); // 8 h of the first zone each time
    const r = play(steps);
    expect(r.some((x) => x.reasons.includes('XP_RATE_TOTAL') || x.reasons.includes('LEVEL_PACE_TOTAL'))).toBe(true);
    expect(r[r.length - 1].verdict).toBe('rejected');
    // the first jumps still fit the single-burst allowance: the cheater is not caught by anything that would also catch an honest long claim
    expect(r[1].verdict).not.toBe('rejected');
  });

  it('a play time that outruns the server clock is rejected', () => {
    const r = play([honestStart, { atMs: T0 + 600_000, o: { ...honestStart.o, seconds: 4000 + 6 * 3600 } }]);
    expect(r[1].verdict).toBe('rejected');
    expect(r[1].reasons).toContain('SECONDS_PLAYED_EXCEEDS_CLOCK');
  });

  it('a restored older save (counters go down) is flagged, and the high-water mark is kept', () => {
    const r = play([
      { atMs: T0, o: { xp: xpAtPosition(20), floor: 10, kills: 5000, seconds: 20_000 } },
      { atMs: T0 + DAY, o: { xp: xpAtPosition(21), floor: 11, kills: 6000, seconds: 40_000 } },
      { atMs: T0 + 2 * DAY, o: { xp: xpAtPosition(20), floor: 10, kills: 5000, seconds: 20_000 } },
      { atMs: T0 + 3 * DAY, o: { xp: xpAtPosition(21.5), floor: 11, kills: 6100, seconds: 41_000 } },
    ]);
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'ok', 'flagged', 'ok']);
    expect(r[2].reasons).toContain('RESTORED_OLDER_SAVE');
    // back above every earlier high-water mark: ranked again (the flag stays in the account's history)
    expect(r[3].reasons).toEqual([]);
  });

  it('a single counter going down (kills) is enough to flag; a save revision going backwards too', () => {
    const r = play([
      { atMs: T0, o: { xp: 1000, kills: 900 }, revision: 5 },
      { atMs: T0 + DAY, o: { xp: 1200, kills: 100 }, revision: 6 },
      { atMs: T0 + 2 * DAY, o: { xp: 1300, kills: 1000 }, revision: 3 },
    ]);
    expect(r[1].verdict).toBe('flagged');
    expect(r[1].reasons).toEqual(['RESTORED_OLDER_SAVE']);
    expect(r[2].reasons).toContain('SAVE_REVISION_BACKWARDS');
  });

  it('tier 6 gear on a low-level hero is rejected; the same piece on a level 90 hero is fine', () => {
    const low = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[29], templates: [{ templateId: 'abyssal_greatblade', rarity: 'legendary' }] } }], T0 - 30 * DAY);
    expect(low[0].verdict).toBe('rejected');
    expect(low[0].reasons).toContain('GEAR_BELOW_GATE');
    const high = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[89], floor: 90, templates: [{ templateId: 'abyssal_greatblade', rarity: 'legendary' }] } }], T0 - 200 * DAY);
    expect(high[0].reasons).not.toContain('GEAR_BELOW_GATE');
  });

  it('Pass-only features without a server entitlement: premium claims and Pass stash slots rejected, the bare flag flagged; with the entitlement all fine', () => {
    const base = { xp: XP_TO_LEVEL[29], floor: 20 };
    const age = T0 - 30 * DAY;
    expect(play([{ atMs: T0, o: { ...base, premium: [1, 2] }, entitled: false }], age)[0]).toMatchObject({ verdict: 'rejected', reasons: ['PASS_FEATURES_WITHOUT_ENTITLEMENT'] });
    expect(play([{ atMs: T0, o: { ...base, stashBonusSlots: 10 }, entitled: false }], age)[0].verdict).toBe('rejected');
    expect(play([{ atMs: T0, o: { ...base, hasBattlePass: true }, entitled: false }], age)[0]).toMatchObject({ verdict: 'flagged', reasons: ['PASS_FLAG_WITHOUT_ENTITLEMENT'] });
    expect(play([{ atMs: T0, o: { ...base, hasBattlePass: true, premium: [1], stashBonusSlots: 10 }, entitled: true }], age)[0].verdict).toBe('ok');
  });

  it('the first snapshot is a baseline: far ahead of the account age it is only flagged, never rejected', () => {
    const r = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[79], floor: 70, seconds: 3_000_000 } }], T0 - 2 * DAY);
    expect(r[0].verdict).toBe('flagged');
    expect(r[0].reasons).toEqual(['BASELINE_AHEAD_OF_ACCOUNT_AGE']);
    const old = play([{ atMs: T0, o: { xp: XP_TO_LEVEL[79], floor: 70, seconds: 3_000_000 } }], T0 - 400 * DAY);
    expect(old[0].verdict).toBe('ok');
  });

  it('a rejected snapshot does not become the baseline: the next honest one is judged against the last accepted', () => {
    const r = play([
      { atMs: T0, o: { xp: xpAtPosition(5), seconds: 100 } },
      { atMs: T0 + 600_000, o: { xp: XP_TO_LEVEL[89], seconds: 700 } },
      { atMs: T0 + 1_200_000, o: { xp: xpAtPosition(5) + 50, seconds: 1300 } },
    ]);
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'rejected', 'ok']);
  });
});

describe('bounds table', () => {
  it('the pace tables are increasing and the helpers interpolate', () => {
    for (const t of [BOUNDS.levelPace, BOUNDS.floorPace]) for (let i = 1; i < t.length; i++) expect(t[i][1]).toBeGreaterThan(t[i - 1][1]);
    expect(daysAtLevel(51)).toBe(14);
    expect(daysAtLevel(55.5)).toBeCloseTo(14 + (10 * 4.5) / 9, 6);
    expect(daysAtFloor(100)).toBe(53);
    expect(daysAtLevel(0.5)).toBe(0);
  });
});

// ---- the handler ------------------------------------------------------------------------------------------------------------------------------

class MemoryProgressStore implements ProgressStore {
  rows: (NewSnapshot & { id: string; createdAtMs: number })[] = [];
  pass = true;
  /** The SAVED game (characters.save_data) and its revision. `undefined` = "whatever the last request carried" (the save is in sync); set it to model a save that is behind. */
  saved: unknown = undefined;
  revision = 7;
  hasCharacter = true;
  /** characters.created_at: the player can edit it. The function must never read it. */
  forgedCharacterCreatedMs: number = T0 - DAY * 400;
  /** auth.users.created_at: the real account age. */
  accountCreatedMs: number | null = T0 - DAY * 400;
  /** public.league_reset_at(): null until the first League opened. */
  resetAt: number | null = null;
  async resetAtMs() {
    return this.resetAt;
  }
  slotAt: number | null = null;
  slotClaims = 0;
  releases = 0;
  seasonCalls: { userId: string; snapshotId: string; verdict: string; reasons: string[]; score: number }[] = [];
  seasonStatus: SeasonApplyStatus = 'updated';
  professionCalls: { userId: string; snapshotId: string; verdict: string; professions: { profession: string; xp: number; level: number }[] }[] = [];
  professionFails = false;
  async applyProfessionsToSeason(args: { userId: string; snapshotId: string; verdict: 'ok' | 'flagged' | 'rejected'; professions: { profession: string; xp: number; level: number }[] }): Promise<ProfessionApplyStatus> {
    if (this.professionFails) throw new Error('season_apply_professions_404');
    this.professionCalls.push(args);
    return 'updated';
  }
  now = T0;
  async hasActivePass() {
    return this.pass;
  }
  async character() {
    return this.hasCharacter ? { revision: this.revision, saveData: this.saved === undefined ? lastBody : this.saved } : null;
  }
  async accountCreatedAtMs() {
    return this.accountCreatedMs;
  }
  async claimSlot(_userId: string, intervalMs: number) {
    // one synchronous check-and-set: the same guarantee as the single SQL statement (insert ... on conflict do update ... where last_at <= now() - interval)
    if (this.slotAt !== null && this.now - this.slotAt < intervalMs) return false;
    this.slotAt = this.now;
    this.slotClaims++;
    return true;
  }
  async releaseSlot() {
    this.slotAt = null;
    this.releases++;
  }
  private toStored(r: (typeof this.rows)[number]): StoredSnapshot {
    return { id: r.id, createdAtMs: r.createdAtMs, verdict: r.verdict, reasons: r.reasons, metrics: r.metrics };
  }
  async lastSnapshot(userId: string, sinceMs?: number) {
    const mine = this.rows.filter((r) => r.userId === userId && (sinceMs === undefined || r.createdAtMs >= sinceMs));
    return mine.length ? this.toStored(mine[mine.length - 1]) : null;
  }
  async acceptedHistory(userId: string, sinceMs?: number) {
    const ok = this.rows.filter((r) => r.userId === userId && r.verdict === 'ok' && (sinceMs === undefined || r.createdAtMs >= sinceMs));
    const pt = (r: (typeof ok)[number]): HistoryPoint => ({ atMs: r.createdAtMs, metrics: r.metrics, peak: r.peak, saveRevision: r.saveRevision });
    return { first: ok[0] ? pt(ok[0]) : null, last: ok.length ? pt(ok[ok.length - 1]) : null };
  }
  async insertSnapshot(row: NewSnapshot) {
    const id = `snap-${this.rows.length + 1}`;
    this.rows.push({ ...row, id, createdAtMs: this.now });
    return { id };
  }
  async applyToSeason(args: { userId: string; snapshotId: string; verdict: 'ok' | 'flagged' | 'rejected'; reasons: string[]; score: number }) {
    this.seasonCalls.push(args);
    return this.seasonStatus;
  }
}

const ORIGIN = 'https://game.example.test';
const TOKEN = 'a'.repeat(40);

function fetchAs(id: string | null): typeof fetch {
  return (async () => (id ? new Response(JSON.stringify({ id }), { status: 200 }) : new Response('{}', { status: 401 }))) as typeof fetch;
}

// The body of the latest request: the MemoryProgressStore answers "the saved game is this" with it unless a test says the save is behind.
let lastBody: unknown = null;

function request(body: unknown, init: { token?: string | null; method?: string; origin?: string } = {}): Request {
  lastBody = typeof body === 'string' ? safeParse(body) : JSON.parse(JSON.stringify(body));
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: init.origin ?? ORIGIN };
  if (init.token !== null) headers.authorization = `Bearer ${init.token ?? TOKEN}`;
  return new Request('https://x.test/functions/v1/submit-progress', { method: init.method ?? 'POST', headers, body: init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function deps(store: MemoryProgressStore, userId: string | null = USER) {
  return {
    auth: { supabaseUrl: 'https://p.test', anonKey: 'anon-key-not-real', fetchFn: fetchAs(userId) },
    allowedOrigins: [ORIGIN],
    store,
    nowMs: () => store.now,
  };
}

describe('handleSubmitProgress', () => {
  it('refuses without a valid JWT, from a foreign origin, with a wrong method, and an oversized body', async () => {
    const store = new MemoryProgressStore();
    expect((await handleSubmitProgress(request(blob(), { token: null }), deps(store))).status).toBe(401);
    expect((await handleSubmitProgress(request(blob()), deps(store, null))).status).toBe(401);
    expect((await handleSubmitProgress(request(blob(), { origin: 'https://evil.test' }), deps(store))).status).toBe(403);
    expect((await handleSubmitProgress(request(blob(), { method: 'GET' }), deps(store))).status).toBe(405);
    expect((await handleSubmitProgress(request('x'.repeat(MAX_BODY_BYTES + 10)), deps(store))).status).toBe(413);
    expect((await handleSubmitProgress(request('{not json'), deps(store))).status).toBe(400);
    expect((await handleSubmitProgress(request('[1,2]'), deps(store))).status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it('derives the metrics on the server: a body that carries its own "metrics", "verdict" or "user_id" changes nothing', async () => {
    const store = new MemoryProgressStore();
    const res = await handleSubmitProgress(
      request({ ...blob({ xp: xpAtPosition(10), floor: 5 }), metrics: { levelTotal: 9999 }, verdict: 'ok', user_id: '22222222-2222-4222-8222-222222222222', userId: 'x' }),
      deps(store),
    );
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].userId).toBe(USER);
    expect(store.rows[0].metrics.levelTotal).toBe(10);
    expect(store.rows[0].saveRevision).toBe(7); // the characters row, not anything in the body
    expect(store.rows[0].metricsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(store.seasonCalls[0]).toMatchObject({ userId: USER, snapshotId: 'snap-1', verdict: 'ok', score: computeScore(store.rows[0].metrics) });
  });

  it('rate limit: a second call inside 10 minutes stores nothing and returns the last verdict; after the window it is judged again', async () => {
    const store = new MemoryProgressStore();
    await handleSubmitProgress(request(blob({ xp: 5000 })), deps(store));
    store.now = T0 + SNAPSHOT_MIN_INTERVAL_MS - 1000;
    const second = await (await handleSubmitProgress(request(blob({ xp: 6000 })), deps(store))).json();
    expect(second).toMatchObject({ throttled: true, verdict: 'ok' });
    expect(store.rows).toHaveLength(1);
    expect(store.seasonCalls).toHaveLength(1);
    store.now = T0 + SNAPSHOT_MIN_INTERVAL_MS + 1000;
    const third = await (await handleSubmitProgress(request(blob({ xp: 6000 })), deps(store))).json();
    expect(third.throttled).toBe(false);
    expect(store.rows).toHaveLength(2);
  });

  it('a rejected snapshot is stored (the owner sees it), carries the reasons, does not raise the peak, and is handed to the ranking as not ok', async () => {
    const store = new MemoryProgressStore();
    await handleSubmitProgress(request(blob({ xp: xpAtPosition(5), seconds: 100 })), deps(store));
    store.now = T0 + 11 * 60_000;
    const body = await (await handleSubmitProgress(request(blob({ xp: XP_TO_LEVEL[89], seconds: 760 })), deps(store))).json();
    expect(body.verdict).toBe('rejected');
    expect(body.reasons).toContain('LEVEL_PACE');
    expect(store.rows[1].verdict).toBe('rejected');
    expect(store.rows[1].peak.xp).toBe(store.rows[0].peak.xp);
    expect(store.seasonCalls[1].verdict).toBe('rejected');
  });

  it('the Pass check uses the server (store), never the save flag', async () => {
    const store = new MemoryProgressStore();
    store.pass = false;
    const body = await (await handleSubmitProgress(request(blob({ xp: xpAtPosition(5), hasBattlePass: true, premium: [1] })), deps(store))).json();
    expect(body.verdict).toBe('rejected');
    expect(body.reasons).toContain('PASS_FEATURES_WITHOUT_ENTITLEMENT');
  });

  it('works without the ranking wired (applyToSeason absent) and survives a store failure with a 502 that leaks nothing', async () => {
    const store = new MemoryProgressStore();
    (store as { applyToSeason?: unknown }).applyToSeason = undefined;
    const ok = await handleSubmitProgress(request(blob({ xp: 10 })), deps(store));
    expect(ok.status).toBe(200);
    expect((await ok.json()).season).toBeNull();
    store.now += SNAPSHOT_MIN_INTERVAL_MS * 2;
    store.insertSnapshot = async () => {
      throw new Error('snapshot_write_500');
    };
    const bad = await handleSubmitProgress(request(blob({ xp: 20 })), deps(store));
    expect(bad.status).toBe(502);
    expect(await bad.json()).toEqual({ error: 'submit_failed' });
  });

  // ---- the first League's reset (migration 0009) ----------------------------------------------------------------------------------------------
  describe('after the first League reset', () => {
    const withEpoch = (o: Overrides, epoch: number | null) => (epoch === null ? blob(o) : { ...blob(o), league: { epoch, noticeSeen: false, pioneerChecked: true } });

    it('a pre-reset level-80 save posted after the reset is not judged: a retryable 409, nothing stored, nothing flagged', async () => {
      const store = new MemoryProgressStore();
      await handleSubmitProgress(request(blob({ xp: xpAtPosition(60), floor: 80 })), deps(store)); // pre-season snapshot, accepted
      store.resetAt = T0 + DAY;
      store.now = T0 + DAY + 3 * 3600_000;
      const res = await handleSubmitProgress(request(withEpoch({ xp: xpAtPosition(80), floor: 90 }, null)), deps(store));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: 'league_reset_pending', retryable: true });
      expect(store.rows).toHaveLength(1); // only the pre-season one
      expect(store.slotClaims).toBe(1);
    });

    it('a pre-reset save that LIES about its epoch is judged as a fresh run and REJECTED (history and account age start at reset_at)', async () => {
      const store = new MemoryProgressStore();
      await handleSubmitProgress(request(blob({ xp: xpAtPosition(60), floor: 80 })), deps(store));
      store.resetAt = T0 + DAY;
      store.now = T0 + DAY + 3 * 3600_000;
      const body = await (await handleSubmitProgress(request(withEpoch({ xp: xpAtPosition(80), floor: 90, seconds: 400 }, store.resetAt)), deps(store))).json();
      expect(body.verdict).toBe('rejected');
      expect(body.reasons).toContain('BASELINE_AHEAD_OF_ACCOUNT_AGE');
      expect(store.rows[1].verdict).toBe('rejected');
      expect(store.seasonCalls[1].verdict).toBe('rejected');
    });

    it('a fresh hero (declares the reset epoch, nothing played) is ok even though the account is over a year old', async () => {
      const store = new MemoryProgressStore();
      await handleSubmitProgress(request(blob({ xp: xpAtPosition(60), floor: 80 })), deps(store));
      store.resetAt = T0 + DAY;
      store.now = T0 + DAY + 20 * 60_000; // inside the old 10 minute window of the pre-reset snapshot? no: it is judged on its own history
      const body = await (await handleSubmitProgress(request(withEpoch({ xp: xpAtPosition(2), floor: 1, seconds: 600 }, store.resetAt)), deps(store))).json();
      expect(body.verdict).toBe('ok');
      expect(body.throttled).toBe(false);
      // and its run is judged against ITS first snapshot, not the pre-reset one: a normal hour of play later is fine
      store.now += 3600_000;
      const next = await (await handleSubmitProgress(request(withEpoch({ xp: xpAtPosition(3), floor: 2, seconds: 4200 }, store.resetAt)), deps(store))).json();
      expect(next.verdict).toBe('ok');
    });

    it('the old rate-limit window of a pre-reset snapshot does not throttle the fresh hero; one just after the reset still does', async () => {
      const store = new MemoryProgressStore();
      store.resetAt = T0 + 1000;
      store.now = T0; // a pre-reset snapshot made seconds before the reset
      await handleSubmitProgress(request(blob({ xp: 100 })), deps(store)); // resetAt is set but this body is pre-reset...
      expect(store.rows).toHaveLength(0); // ...so it was refused, not stored
      store.now = T0 + 60_000;
      const first = await (await handleSubmitProgress(request(withEpoch({ xp: 10, seconds: 30 }, store.resetAt)), deps(store))).json();
      expect(first.throttled).toBe(false);
      store.now += 60_000;
      const second = await (await handleSubmitProgress(request(withEpoch({ xp: 20, seconds: 90 }, store.resetAt)), deps(store))).json();
      expect(second.throttled).toBe(true);
    });

    it('before any reset nothing changes: no epoch needed, a far-ahead first snapshot is only flagged', async () => {
      const store = new MemoryProgressStore();
      store.accountCreatedMs = T0 - 3 * 3600_000;
      const body = await (await handleSubmitProgress(request(blob({ xp: xpAtPosition(80), floor: 90 })), deps(store))).json();
      expect(body.verdict).toBe('flagged');
      expect(body.reasons).toContain('BASELINE_AHEAD_OF_ACCOUNT_AGE');
    });

    it('evaluateSnapshot: sinceReset turns the ahead-of-age baseline into a reject; the age is max(account created, reset)', () => {
      const cur = m({ xp: xpAtPosition(80), floor: 90 });
      const base: EvalInput = { nowMs: T0, accountCreatedMs: T0 - 400 * DAY, entitled: true, saveRevision: 1, first: null, previous: null };
      const young = { ...base, accountCreatedMs: T0 - 3 * 3600_000 };
      expect(evaluateSnapshot(cur, young).verdict).toBe('flagged'); // before the reset: stored, not ranked
      expect(evaluateSnapshot(cur, base).verdict).toBe('ok'); // a 400 day old account may legitimately be there
      expect(evaluateSnapshot(cur, { ...young, sinceReset: true })).toMatchObject({ verdict: 'rejected', reasons: expect.arrayContaining(['BASELINE_AHEAD_OF_ACCOUNT_AGE']) });
    });

    it('the real store reads the reset and filters snapshots by created_at >= reset_at', async () => {
      const urls: string[] = [];
      const fetchFn = (async (url: string) => {
        urls.push(String(url));
        return new Response(String(url).includes('/rpc/league_reset_at') ? JSON.stringify('2026-10-20T10:00:00.123456+00:00') : '[]', { status: 200 });
      }) as unknown as typeof fetch;
      const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: 'k', fetchFn });
      const at = (await store.resetAtMs?.()) as number;
      expect(at).toBe(Date.parse('2026-10-20T10:00:00.123Z'));
      await store.acceptedHistory(USER, at);
      await store.lastSnapshot(USER, at);
      const snapshotCalls = urls.filter((u) => u.includes('/progress_snapshots'));
      expect(snapshotCalls).toHaveLength(3);
      for (const u of snapshotCalls) expect(decodeURIComponent(u)).toContain('created_at=gte.2026-10-20T10:00:00.123Z');
      urls.length = 0;
      await store.acceptedHistory(USER);
      for (const u of urls) expect(u).not.toContain('gte.');
    });
  });

  it('canonicalJson is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

// ---- profession rankings ----------------------------------------------------------------------------------------------------------------------

describe('profession metrics', () => {
  it('reads skill XP and the level the table gives; garbage and a missing skillXp become 0 / level 1', () => {
    const p = m({ mining: PROFESSION_XP_TO_LEVEL.mining[29] + 5, woodcutting: PROFESSION_XP_TO_LEVEL.woodcutting[74], gardening: 12 });
    expect(p.miningLevel).toBe(30);
    expect(p.woodcuttingLevel).toBe(75);
    expect(p.gardeningLevel).toBe(professionLevelFromXp('gardening', 12));
    const dirty = extractMetrics({ xp: 1, skillXp: { mining: -3, woodcutting: Number.NaN, gardening: 1e30 } }) as ProgressMetrics;
    expect([dirty.miningXp, dirty.woodcuttingXp, dirty.gardeningXp]).toEqual([0, 0, 1e12]);
    expect(dirty.miningLevel).toBe(1);
    expect((extractMetrics({ xp: 1 }) as ProgressMetrics).gardeningXp).toBe(0);
    expect((extractMetrics({ xp: 1, skillXp: 'x' }) as ProgressMetrics).miningXp).toBe(0);
  });

  it('professionScores lists only professions with XP, score = total XP', () => {
    expect(professionScores(m({}))).toEqual([]);
    expect(professionScores(m({ mining: 500, gardening: 40 })).map((x) => [x.profession, x.xp])).toEqual([['mining', 500], ['gardening', 40]]);
  });

  it('score order and tiebreak: more XP first; on equal XP the one who got there earlier (the SQL orders by score desc, tiebreak_at asc)', () => {
    const rows = [
      { id: 'a', score: 900, at: 5 },
      { id: 'b', score: 1200, at: 9 },
      { id: 'c', score: 900, at: 2 },
    ];
    const ranked = [...rows].sort((x, y) => y.score - x.score || x.at - y.at).map((r) => r.id);
    expect(ranked).toEqual(['b', 'c', 'a']);
  });
});

describe('profession XP bounds', () => {
  const START = 5 * DAY; // the account is old enough for the baseline not to matter

  /** An honest gatherer at the very best settings gains XP at exactly the theoretical rate, snapshot by snapshot. */
  function gatherer(profession: 'mining' | 'woodcutting' | 'gardening', everyHours: number, days: number) {
    const steps: { atMs: number; o: Overrides }[] = [];
    let xp = profession === 'gardening' ? 100 : 1000;
    for (let h = 0; h <= days * 24; h += everyHours) {
      if (h > 0) {
        const level = professionLevelFromXp(profession, xp);
        xp += Math.floor(professionXpPerHour(profession, level) * everyHours);
      }
      steps.push({ atMs: T0 + h * 3_600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: h * 3600 * 0.9, [profession]: xp } });
    }
    return steps;
  }

  it('an honest fast gatherer at the theoretical maximum is ok: every profession, snapshots every 10 minutes, 1 hour, 12 hours', () => {
    for (const profession of ['mining', 'woodcutting', 'gardening'] as const) {
      for (const every of [1 / 6, 1, 12]) {
        const r = play(gatherer(profession, every, 6), T0 - START);
        expect(r.filter((x) => x.verdict !== 'ok')).toEqual([]);
      }
    }
  });

  it('a late claim is fine: 8 hours of a full session arrive in one snapshot', () => {
    const level = 50;
    const base = PROFESSION_XP_TO_LEVEL.mining[level - 1];
    const gain = Math.floor(professionXpPerHour('mining', level) * 8);
    const r = play(
      [
        { atMs: T0, o: { xp: xpAtPosition(40), floor: 40, seconds: 100, mining: base } },
        { atMs: T0 + 600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: 700, mining: base + gain } },
      ],
      T0 - START,
    );
    expect(r.map((x) => x.verdict)).toEqual(['ok', 'ok']);
  });

  it('edited profession XP is caught: +100k XP ten minutes later is rejected with its own code (and the _TOTAL one)', () => {
    for (const [profession, code] of [
      ['mining', 'MINING_XP_RATE'],
      ['woodcutting', 'WOODCUTTING_XP_RATE'],
      ['gardening', 'GARDENING_XP_RATE'],
    ] as const) {
      const r = play(
        [
          { atMs: T0, o: { xp: xpAtPosition(40), floor: 40, seconds: 100, [profession]: 2000 } },
          { atMs: T0 + 600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: 700, [profession]: 102_000 } },
        ],
        T0 - START,
      );
      expect(r[1].verdict).toBe('rejected');
      expect(r[1].reasons).toEqual(expect.arrayContaining([code, code + '_TOTAL']));
    }
  });

  it('between the flag value and twice it the snapshot is only flagged (not ranked)', () => {
    // The allowance follows the level the new XP reaches (a big gain levels the hero up and raises it), so look for a gain that lands between the flag value and twice it AT that level.
    const base = PROFESSION_XP_TO_LEVEL.mining[19];
    const allowedAt = (xp: number): number => {
      const level = professionLevelFromXp('mining', xp);
      return professionXpPerHour('mining', level) * (1 / 6) + professionBurstXp('mining', level);
    };
    let gain = 0;
    for (let g = 1; g < 1e9 && !gain; g = Math.ceil(g * 1.02)) if (g > allowedAt(base + g) * 1.2 && g < allowedAt(base + g) * 1.8) gain = g;
    expect(gain).toBeGreaterThan(0);
    const r = play(
      [
        { atMs: T0, o: { xp: xpAtPosition(40), floor: 40, seconds: 100, mining: base } },
        { atMs: T0 + 600_000, o: { xp: xpAtPosition(40), floor: 40, seconds: 700, mining: base + gain } },
      ],
      T0 - START,
    );
    expect(r[1].verdict).toBe('flagged');
    expect(r[1].reasons).toContain('MINING_XP_RATE');
  });

  it('a history from before metrics v2 (no profession XP in the peak) is never judged against a zero baseline', () => {
    const old = m({ xp: xpAtPosition(40), floor: 40, seconds: 1000 });
    const legacy: Record<string, unknown> = { ...old };
    const legacyPeak: Record<string, unknown> = { ...peakOf(old) };
    for (const k of ['miningXp', 'woodcuttingXp', 'gardeningXp']) {
      delete legacy[k];
      delete legacyPeak[k];
    }
    const pt = point(T0, legacy as unknown as ProgressMetrics, 1, legacyPeak as unknown as ReturnType<typeof peakOf>);
    const ev = evaluateSnapshot(m({ xp: xpAtPosition(40), floor: 40, seconds: 1100, mining: 80_000 }), {
      nowMs: T0 + 600_000,
      accountCreatedMs: T0 - 300 * DAY,
      entitled: true,
      saveRevision: 2,
      first: pt,
      previous: pt,
    });
    expect(ev.reasons.some((c) => c.startsWith('MINING_XP_RATE'))).toBe(false);
  });

  it('the first snapshot of a young account with a huge profession XP is flagged as ahead of the account age, never rejected', () => {
    const o = { xp: xpAtPosition(10), floor: 5, seconds: 100, mining: 500_000 };
    const r = play([{ atMs: T0, o }], T0 - 2 * DAY);
    expect(r[0].verdict).toBe('flagged');
    expect(r[0].reasons).toEqual(['BASELINE_AHEAD_OF_ACCOUNT_AGE']);
    expect(play([{ atMs: T0, o }], T0 - 400 * DAY)[0].verdict).toBe('ok');
  });
});

describe('handleSubmitProgress and the profession rankings', () => {
  it('hands the profession XP to the profession ranking after an accepted ok snapshot, with the levels the server computed', async () => {
    const store = new MemoryProgressStore();
    const body = await (await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: PROFESSION_XP_TO_LEVEL.mining[19] + 3, gardening: 30 })), deps(store))).json();
    expect(body.professions).toBe('updated');
    expect(store.professionCalls).toHaveLength(1);
    expect(store.professionCalls[0]).toMatchObject({ userId: USER, snapshotId: 'snap-1', verdict: 'ok' });
    expect(store.professionCalls[0].professions).toEqual([
      { profession: 'mining', xp: PROFESSION_XP_TO_LEVEL.mining[19] + 3, level: 20 },
      { profession: 'gardening', xp: 30, level: professionLevelFromXp('gardening', 30) },
    ]);
  });

  it('does not call it when the ranking said the player is not eligible or the snapshot is flagged; a failing call never turns the answer into an error', async () => {
    const store = new MemoryProgressStore();
    store.seasonStatus = 'no_pass';
    await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: 10 })), deps(store));
    expect(store.professionCalls).toHaveLength(0);
    store.seasonStatus = 'updated';
    store.pass = false;
    store.now += SNAPSHOT_MIN_INTERVAL_MS * 2;
    await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: 10, hasBattlePass: true })), deps(store));
    expect(store.professionCalls).toHaveLength(0); // flagged: PASS_FLAG_WITHOUT_ENTITLEMENT
    store.pass = true;
    store.professionFails = true;
    store.now += SNAPSHOT_MIN_INTERVAL_MS * 2;
    const res = await handleSubmitProgress(request(blob({ xp: xpAtPosition(10), mining: 20 })), deps(store));
    expect(res.status).toBe(200);
    expect((await res.json()).professions).toBeNull();
  });

  it('createProgressStore posts the professions to the rpc with the service key', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify('updated'), { status: 200 });
    }) as typeof fetch;
    const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: 'k', fetchFn });
    expect(await store.applyProfessionsToSeason!({ userId: USER, snapshotId: 's', verdict: 'ok', professions: [{ profession: 'mining', xp: 5, level: 2 }] })).toBe('updated');
    expect(calls[0].url).toBe('https://p.test/rest/v1/rpc/season_apply_professions');
    expect(calls[0].body).toEqual({ p_user_id: USER, p_snapshot_id: 's', p_verdict: 'ok', p_professions: [{ profession: 'mining', xp: 5, level: 2 }] });
  });
});

// ---- review fixes: account age, baseline, saved-game match, atomic limit ----------------------------------------------------------------------------

describe('review B1: the account age comes from auth.users, never from characters.created_at', () => {
  const level80 = { xp: XP_TO_LEVEL[79], floor: 70, seconds: 3_000_000 };

  it('a 400-day account (per the server) at level 80 gets ok; a 2-day account with a forged 400-day characters.created_at is flagged', async () => {
    const real = new MemoryProgressStore();
    real.accountCreatedMs = T0 - 400 * DAY;
    expect((await (await handleSubmitProgress(request(blob(level80)), deps(real))).json()).verdict).toBe('ok');

    const forged = new MemoryProgressStore();
    forged.accountCreatedMs = T0 - 2 * DAY; // the truth (auth.users)
    forged.forgedCharacterCreatedMs = T0 - 400 * DAY; // what the player wrote into his own row
    const body = await (await handleSubmitProgress(request(blob(level80)), deps(forged))).json();
    expect(body.verdict).toBe('flagged');
    expect(body.reasons).toEqual(['BASELINE_AHEAD_OF_ACCOUNT_AGE']);
  });

  it('an account age the server cannot read fails closed (as a brand-new account), it never falls back to the character row', async () => {
    const store = new MemoryProgressStore();
    store.accountCreatedMs = null;
    store.forgedCharacterCreatedMs = T0 - 400 * DAY;
    expect((await (await handleSubmitProgress(request(blob(level80)), deps(store))).json()).verdict).toBe('flagged');
  });

  it('the REST store asks the service-role-only function for the age and reads revision + save_data (never created_at) from characters', async () => {
    const calls: { url: string; body?: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body as string) : undefined });
      if (url.includes('/rpc/progress_account_created_at')) return new Response(JSON.stringify('2026-01-01T00:00:00+00:00'), { status: 200 });
      return new Response(JSON.stringify([{ revision: 4, save_data: { xp: 1 } }]), { status: 200 });
    }) as typeof fetch;
    const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: 'k', fetchFn });
    expect(await store.accountCreatedAtMs(USER)).toBe(Date.parse('2026-01-01T00:00:00+00:00'));
    expect(await store.character(USER)).toEqual({ revision: 4, saveData: { xp: 1 } });
    expect(calls[0].url).toBe('https://p.test/rest/v1/rpc/progress_account_created_at');
    expect(calls[0].body).toEqual({ p_user_id: USER });
    expect(calls[1].url).toContain('/characters?');
    expect(decodeURIComponent(calls[1].url)).toContain('select=revision,save_data');
    expect(calls.some((c) => c.url.includes('created_at') && c.url.includes('characters'))).toBe(false);
  });
});

describe('review B2: only an ok snapshot is a baseline and raises the peak', () => {
  it('a flagged snapshot carries the previous peak, so re-sending the same inflated save is not "ok" later', () => {
    const steps = honestHistory(40, 12, 2.5);
    const first = play(steps);
    const i = first.findIndex((r) => r.verdict === 'flagged');
    expect(i).toBeGreaterThan(0);
    const again = play([...steps.slice(0, i + 1), { atMs: steps[i].atMs + 10 * 60_000, o: steps[i].o }]);
    expect(again[i].verdict).toBe('flagged');
    expect(again[i + 1].verdict).not.toBe('ok'); // before the fix the flagged snapshot became the baseline and the resend was ok
  });

  it('evaluateSnapshot returns the previous peak for a flagged and for a rejected snapshot, and raises it only for ok', () => {
    const base = m({ xp: xpAtPosition(20), floor: 10, kills: 5000, seconds: 20_000 });
    const prev = point(T0, base);
    const input = (nowMs: number): EvalInput => ({ nowMs, accountCreatedMs: T0 - 400 * DAY, entitled: true, saveRevision: 2, first: prev, previous: prev });
    const flagged = evaluateSnapshot(m({ xp: xpAtPosition(20), floor: 10, kills: 4000, seconds: 20_000 }), input(T0 + DAY)); // a counter went down: RESTORED_OLDER_SAVE (flag)
    expect(flagged.verdict).toBe('flagged');
    expect(flagged.peak).toEqual(prev.peak);
    const rejected = evaluateSnapshot(m({ xp: XP_TO_LEVEL[89], seconds: 20_100 }), input(T0 + 600_000));
    expect(rejected.verdict).toBe('rejected');
    expect(rejected.peak).toEqual(prev.peak);
    const ok = evaluateSnapshot(m({ xp: xpAtPosition(20) + 50, floor: 10, kills: 5100, seconds: 20_500 }), input(T0 + 3_600_000));
    expect(ok.verdict).toBe('ok');
    expect(ok.peak.xp).toBeGreaterThan(prev.peak.xp);
  });

  it('flags are stored even for a player with no Pass yet, and the snapshot reaches the ranking as flagged', async () => {
    const store = new MemoryProgressStore();
    store.pass = false;
    const body = await (await handleSubmitProgress(request(blob({ xp: xpAtPosition(5), hasBattlePass: true })), deps(store))).json();
    expect(body.verdict).toBe('flagged');
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ verdict: 'flagged', reasons: ['PASS_FLAG_WITHOUT_ENTITLEMENT'] });
    expect(store.seasonCalls[0].verdict).toBe('flagged');
  });
});

describe('review B3: the posted blob must be the saved game', () => {
  it('a blob equal to characters.save_data (any key order) is judged; the snapshot records the revision read with it', async () => {
    const store = new MemoryProgressStore();
    const posted = blob({ xp: xpAtPosition(10), floor: 5 });
    const reversed = (v: unknown): unknown => (Array.isArray(v) ? v.map(reversed) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reversed(x)])) : v);
    store.saved = reversed(posted); // same content, other key order
    const res = await handleSubmitProgress(request(posted), deps(store));
    expect(res.status).toBe(200);
    expect(store.rows[0].saveRevision).toBe(7);
  });

  it('a blob that differs from the saved game is a retryable 409: nothing stored, no flag, the slot is not spent', async () => {
    const store = new MemoryProgressStore();
    store.saved = blob({ xp: xpAtPosition(5) });
    const res = await handleSubmitProgress(request(blob({ xp: xpAtPosition(60) })), deps(store));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'save_not_synced', retryable: true });
    expect(store.rows).toHaveLength(0);
    expect(store.seasonCalls).toHaveLength(0);
    expect(store.slotClaims).toBe(0);
    // once the game has saved the same state, the very same call goes through
    store.saved = undefined;
    expect((await handleSubmitProgress(request(blob({ xp: xpAtPosition(60) })), deps(store))).status).toBe(200);
  });

  it('a save the server has not stored yet (no character row) is the same retryable 409', async () => {
    const store = new MemoryProgressStore();
    store.hasCharacter = false;
    expect((await handleSubmitProgress(request(blob({ xp: 5 })), deps(store))).status).toBe(409);
    expect(store.rows).toHaveLength(0);
  });
});

describe('review B3: the soft "fast" marker', () => {
  it('1.5x the fastest seed stays ok (ranked) but carries FAST_* notes; 1.2x carries none; 2.5x is flagged as before', () => {
    const slowish = play(honestHistory(60, 12, 1.2));
    expect(slowish.every((r) => r.verdict === 'ok' && r.reasons.length === 0)).toBe(true);
    const fast = play(honestHistory(60, 12, 1.5));
    expect(fast.every((r) => r.verdict === 'ok')).toBe(true);
    expect(fast.some((r) => r.reasons.some((c) => c.startsWith('FAST_')))).toBe(true);
    expect(play(honestHistory(40, 12, 2.5)).some((r) => r.verdict === 'flagged')).toBe(true);
  });
});

describe('review: the per-user limit is one atomic claim', () => {
  it('two parallel calls store exactly one snapshot; the loser gets the last verdict or a short "busy"', async () => {
    const store = new MemoryProgressStore();
    const [a, b] = await Promise.all([handleSubmitProgress(request(blob({ xp: 5000 })), deps(store)), handleSubmitProgress(request(blob({ xp: 5000 })), deps(store))]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    expect(store.rows).toHaveLength(1);
    expect(store.slotClaims).toBe(1);
  });

  it('a failure after the claim gives the slot back, so the player is not locked out for 10 minutes by our error', async () => {
    const store = new MemoryProgressStore();
    const working = store.insertSnapshot.bind(store);
    store.insertSnapshot = async () => {
      throw new Error('snapshot_write_500');
    };
    expect((await handleSubmitProgress(request(blob({ xp: 5000 })), deps(store))).status).toBe(502);
    expect(store.releases).toBe(1);
    store.insertSnapshot = working;
    expect((await handleSubmitProgress(request(blob({ xp: 5000 })), deps(store))).status).toBe(200);
  });

  it('the REST store claims through one rpc with the interval in seconds', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response('true', { status: 200 });
    }) as typeof fetch;
    const store = createProgressStore({ supabaseUrl: 'https://p.test', serviceRoleKey: 'k', fetchFn });
    expect(await store.claimSlot(USER, SNAPSHOT_MIN_INTERVAL_MS)).toBe(true);
    expect(calls).toEqual([{ url: 'https://p.test/rest/v1/rpc/progress_claim_slot', body: { p_user_id: USER, p_interval_seconds: 600 } }]);
  });
});
