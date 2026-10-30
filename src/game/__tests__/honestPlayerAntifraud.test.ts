import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32, withSeededRandom } from '../../../scripts/sim/driver';
import { Player } from '../../../scripts/sim/player';
import { evaluateSnapshot, HistoryPoint } from '../../../supabase/functions/_shared/progress/evaluate';
import { extractMetrics, maxPeak, peakOf } from '../../../supabase/functions/_shared/progress/metrics';

// The server's anti-cheat (supabase/functions/_shared/progress) judges a snapshot against tables that were MEASURED on simulated players, so every time the game changes how fast a hero
// levels or climbs, the tables can fall behind and the server starts REJECTING honest players (Rodada 28 slowed the first levels 3.3x and left the floor-vs-level cap where it was: the
// honest hero of day 2, floor 25 at level 13, was rejected for months and nothing in `npm test` lit up). This test plays the honest policies of the simulator on the REAL game and shows each
// check-in to the REAL evaluator, exactly as the server would see it, and fails if a single honest snapshot comes back rejected (lost progress) or flagged (kept out of the ranking that counts: docs/SEASON_RANKING.md section 2).
//
// What it covers: the first DAYS days of the plain player (A) and of the Adventurer Pass owner (P, the fastest honest policy), SEEDS seeds each, a snapshot after every visit (twice a day), the history
// kept the way the server keeps it (only an `ok` snapshot becomes the baseline). What it does NOT cover: the long haul (days past ~15: `npm run sim:long`, then `npx vitest run --config vitest.sim.config.ts classAntifraud --silent=false --reporter=default`,
// section C2, replays 12 seeds and 60 days through the same evaluator), and players faster than the simulated bot. A bound that fails here is the NUMBER being wrong for the game, not the test: widen it from a measurement in bounds.ts, never here.
//
// HONEST_SEEDS / HONEST_DAYS (env) widen the run by hand when a bound is being re-measured.
const SEEDS = Number(process.env.HONEST_SEEDS ?? 2);
const DAYS = Number(process.env.HONEST_DAYS ?? 10);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();

interface Verdicts {
  who: string;
  rejected: string[];
  flagged: string[];
  snapshots: number;
}

type CheckIn = (kind: 'first' | 'second') => void;

function play(scenario: 'A' | 'P', seed: number): Verdicts {
  const out: Verdicts = { who: `${scenario}${seed}`, rejected: [], flagged: [], snapshots: 0 };
  const pass = scenario === 'P';
  withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const player = new Player((t) => vi.setSystemTime(t), START, { long: true, pass });
    let first: HistoryPoint | null = null;
    let previous: HistoryPoint | null = null;
    let revision = 0;
    // A snapshot after EVERY visit, not only at the end of the day: the floor climbs during a visit and the hero's XP is claimed at the start of the next one, so the end of a visit is the tightest the server sees.
    const hooked = player as unknown as { checkIn: CheckIn };
    const original = hooked.checkIn.bind(player);
    hooked.checkIn = (kind) => {
      original(kind);
      const m = extractMetrics(player.S);
      if (!m) return;
      const ev = evaluateSnapshot(m, { nowMs: player.now, accountCreatedMs: START, entitled: pass, saveRevision: ++revision, first, previous });
      out.snapshots++;
      const line = `day ${player.day + 1} ${kind} visit (level ${m.heroLevel}, floor ${m.highestFloor}): ${ev.reasons.join(', ') || 'ok'}`;
      if (ev.verdict === 'rejected') out.rejected.push(line);
      else if (ev.verdict === 'flagged') out.flagged.push(line);
      else {
        const point: HistoryPoint = { atMs: player.now, metrics: m, peak: maxPeak(previous?.peak ?? null, peakOf(m)), saveRevision: revision };
        first ??= point;
        previous = point;
      }
    };
    for (let d = 0; d < DAYS; d++) player.playDay(d, jitter);
  });
  return out;
}

describe('the anti-cheat never rejects or flags an honest simulated player', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  for (const scenario of ['A', 'P'] as const) {
    it(`scenario ${scenario} is never rejected or flagged: ${SEEDS} seeds, ${DAYS} days, a snapshot after every visit`, () => {
      const results = Array.from({ length: SEEDS }, (_, i) => play(scenario, i + 1));
      expect(results.every((r) => r.snapshots === DAYS * 2)).toBe(true);
      if (process.env.HONEST_VERBOSE) for (const r of results) console.log(`${r.who}: rejected ${r.rejected.length}, flagged ${r.flagged.length}\n${[...r.rejected.map((l) => '  REJECTED ' + l), ...r.flagged.map((l) => '  flagged ' + l)].join('\n')}`);
      const rejected = results.flatMap((r) => r.rejected.map((l) => `${r.who} ${l}`));
      expect(rejected, `honest players the server would REJECT (lost progress):\n${rejected.join('\n')}`).toEqual([]);
      const flagged = results.flatMap((r) => r.flagged.map((l) => `${r.who} ${l}`));
      expect(flagged, `honest players the server would FLAG (kept out of the season ranking):\n${flagged.join('\n')}`).toEqual([]);
    }, 300_000);
  }
});
