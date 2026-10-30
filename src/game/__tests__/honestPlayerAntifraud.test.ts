import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32, withSeededRandom } from '../../../scripts/sim/driver';
import { Player, SimClass } from '../../../scripts/sim/player';
import { BOUNDS, daysAtFloor, PACE_FLAG_FACTOR } from '../../../supabase/functions/_shared/progress/bounds';
import { evaluateSnapshot, HistoryPoint } from '../../../supabase/functions/_shared/progress/evaluate';
import { extractMetrics, maxPeak, peakOf } from '../../../supabase/functions/_shared/progress/metrics';

// The server's anti-cheat (supabase/functions/_shared/progress) judges a snapshot against tables that were MEASURED on simulated players, so every time the game changes how fast a hero
// levels or climbs, the tables can fall behind and the server starts REJECTING honest players (Rodada 28 slowed the first levels 3.3x and left the floor-vs-level cap where it was: the
// honest hero of day 2, floor 25 at level 13, was rejected for months and nothing in `npm test` lit up). This test plays the honest policies of the simulator on the REAL game and shows each
// check-in to the REAL evaluator, exactly as the server would see it, and fails if a single honest snapshot comes back rejected (lost progress) or flagged (kept out of the ranking that counts: docs/SEASON_RANKING.md section 2).
//
// What it covers: the first DAYS days of the three classes, plain and Adventurer Pass owner, with the player who TAKES OFF THE PIECE HE IS ABOUT TO UPGRADE (wornIngredients: what a real player does, and the Forge says so since 56a84f9; it brings the warrior to tier 3
// 2 to 3 days sooner than the simulator's old play), a snapshot after every visit (twice a day), the history kept the way the server keeps it (only an `ok` snapshot becomes the baseline). The tables of bounds.ts were measured on the old play and the first run of the new one
// found honest players rejected (the mage on day 2: floor 25 at level 1, cap 12) and flagged (the warrior for up to 12 days at levels 32 to 40; the mage on a floor jump). The seeds below are NOT the first ones: for the warrior and the mage they are the seeds the old tables rejected or flagged in the 12-seed, 60-day
// measurement (scripts/tools/wornAntifraud.tool.ts; the archer never failed, its two seeds are just two samples), because a test of the first two seeds passes with the old tables and proves nothing. What it does NOT cover: the long haul (days past ~15: the tool above with DAYS=60, 12 seeds, takes about 8 minutes on 6 cores; DEPTH_PACE
// after floor 100 only shows there), players faster than the simulated bot (a person who visits more than twice a day), and the buyers (`npm run sim:econ`). A bound that fails here is the NUMBER being wrong for the game, not the test: widen it from a measurement in bounds.ts, never here.
//
// HONEST_SEEDS (env) replaces the chosen seeds by 1..N and HONEST_DAYS widens the run, by hand, when a bound is being re-measured.
const DAYS = Number(process.env.HONEST_DAYS ?? 12);
const SCENARIOS: { name: string; cls: SimClass; pass: boolean; seeds: number[] }[] = [
  { name: 'warrior', cls: 'warrior', pass: false, seeds: [8, 12] },
  { name: 'warrior + Pass', cls: 'warrior', pass: true, seeds: [2] },
  { name: 'archer', cls: 'archer', pass: false, seeds: [1] },
  { name: 'archer + Pass', cls: 'archer', pass: true, seeds: [4] },
  { name: 'mage', cls: 'mage', pass: false, seeds: [2, 6] },
  { name: 'mage + Pass', cls: 'mage', pass: true, seeds: [2, 7] },
];
const seedsOf = (sc: { seeds: number[] }): number[] => (process.env.HONEST_SEEDS ? Array.from({ length: Number(process.env.HONEST_SEEDS) }, (_, i) => i + 1) : sc.seeds);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();

interface Verdicts {
  who: string;
  rejected: string[];
  flagged: string[];
  snapshots: number;
}

type CheckIn = (kind: 'first' | 'second') => void;

function play(label: string, cls: SimClass, pass: boolean, seed: number): Verdicts {
  const out: Verdicts = { who: `${label}#${seed}`, rejected: [], flagged: [], snapshots: 0 };
  withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const player = new Player((t) => vi.setSystemTime(t), START, { long: true, pass, cls, wornIngredients: true });
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

  for (const sc of SCENARIOS) {
    it(`${sc.name} (seeds ${seedsOf(sc).join(', ')}) is never rejected or flagged: ${DAYS} days, a snapshot after every visit`, () => {
      const results = seedsOf(sc).map((seed) => play(sc.name, sc.cls, sc.pass, seed));
      expect(results.every((r) => r.snapshots === DAYS * 2)).toBe(true);
      if (process.env.HONEST_VERBOSE) for (const r of results) console.log(`${r.who}: rejected ${r.rejected.length}, flagged ${r.flagged.length}\n${[...r.rejected.map((l) => '  REJECTED ' + l), ...r.flagged.map((l) => '  flagged ' + l)].join('\n')}`);
      const rejected = results.flatMap((r) => r.rejected.map((l) => `${r.who} ${l}`));
      expect(rejected, `honest players the server would REJECT (lost progress):\n${rejected.join('\n')}`).toEqual([]);
      const flagged = results.flatMap((r) => r.flagged.map((l) => `${r.who} ${l}`));
      expect(flagged, `honest players the server would FLAG (kept out of the season ranking):\n${flagged.join('\n')}`).toEqual([]);
    }, 300_000);
  }
});

// The same rule as FLOOR_PACE of evaluate.ts (floor-days gained over 2 x days + 1, with the floorStepSlack), fed with the WORST honest visits of the 186-run measurement (scripts/tools/wornAntifraud.tool.ts: 144 honest runs of the three classes and 42 buyers that obey the level gate,
// 60 days, a snapshot after every visit, half a day apart): the sim above only reaches the first 12 days of a few seeds, and the buyers (who climb 36 floors in one visit when a tier 5 set lands) are not in it at all. Each entry is a real visit that the OLD anchors flagged or left near the line;
// the table must keep it under 1/1.2 of the line, the room the cap keeps. A bound that fails here is the number being wrong for the game: widen it from a new measurement in bounds.ts, never here.
describe('the floor pace table keeps the worst honest visits under the flag line', () => {
  const visits: [string, number, number][] = [
    ['Pass mage seed 2, day 6', 28, 40],
    ['mage seed 6, day 11', 40, 52],
    ['buyer PBR seed 2, day 10 (the tier 5 set lands at level 50)', 64, 100],
  ];
  for (const [who, from, to] of visits) {
    it(`${who}: floor ${from} -> ${to} in half a day`, () => {
      const floorDays = daysAtFloor(Math.max(from, to - BOUNDS.floorStepSlack)) - daysAtFloor(from);
      const flagLine = PACE_FLAG_FACTOR * 0.5 + BOUNDS.floorPaceSlackDays;
      expect(floorDays / flagLine, `${floorDays.toFixed(2)} floor-days against a flag line of ${flagLine}`).toBeLessThanOrEqual(1 / 1.2 + 0.005);
    });
  }
});

// DEPTH_PACE and the first descent, straight through the real evaluateSnapshot (a 60-day sim cannot reach it cheaply: the first descent comes on day 9 for the buyers and on day 49 or later for a warrior). The first Profundezas run goes on until the hero dies, so a hero who never went
// down lands on the CP wall in ONE visit: the biggest first descent measured is 78 depths (a buyer; honest warriors 24 to 41) and the old line (22 in half a day, rejected above 28) rejected them. After the first descent the depth only creeps up (16 in half a day at most) and the old line holds.
describe('the first descent into the Profundezas', () => {
  const DAY = 86_400_000;
  const T0 = new Date(2026, 5, 1, 0, 0, 0).getTime();
  const XP = 5_000_000_000; // a hero far past level 100 on floor 100: no level, floor or XP rule fires, only the depth is judged
  const metrics = (depth: number) => extractMetrics({ xp: XP, highestDungeonFloor: 100, stats: { deepestDepth: depth, secondsPlayed: 1000 }, hasBattlePass: false })!;
  const point = (depth: number, atMs: number, revision: number): HistoryPoint => {
    const m = metrics(depth);
    return { atMs, metrics: m, peak: peakOf(m), saveRevision: revision };
  };
  // The account is 30 days old, the first snapshot (depth 0) is 20 days back, the previous one is half a day back with depth `before`, the new one has depth `after`.
  const verdict = (before: number, after: number) => {
    const now = T0 + 30 * DAY;
    return evaluateSnapshot(metrics(after), { nowMs: now, accountCreatedMs: T0, entitled: false, saveRevision: 3, first: point(0, now - 20 * DAY, 1), previous: point(before, now - DAY / 2, 2) });
  };
  it('the biggest honest first descent measured (78 depths in half a day) is neither flagged nor rejected', () => {
    expect(verdict(0, 78)).toMatchObject({ verdict: 'ok', reasons: [] });
  });
  it('a first descent past the biggest measured x 1.2 is flagged, past x 1.9 it is rejected', () => {
    expect(verdict(0, BOUNDS.firstDescentFlag + 1)).toMatchObject({ verdict: 'flagged', reasons: ['DEPTH_PACE'] });
    expect(verdict(0, BOUNDS.firstDescentReject + 1)).toMatchObject({ verdict: 'rejected', reasons: ['DEPTH_PACE'] });
  });
  it('after the first descent the old line holds: 16 depths in half a day pass, 25 are flagged (the line is 22), 40 are rejected (28)', () => {
    expect(verdict(78, 78 + 16)).toMatchObject({ verdict: 'ok', reasons: [] });
    expect(verdict(78, 78 + 25)).toMatchObject({ verdict: 'flagged', reasons: ['DEPTH_PACE'] });
    expect(verdict(78, 78 + 40)).toMatchObject({ verdict: 'rejected', reasons: ['DEPTH_PACE'] });
  });
});
