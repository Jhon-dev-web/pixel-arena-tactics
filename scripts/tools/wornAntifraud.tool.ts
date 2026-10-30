// DOES THE REAL ANTI-CHEAT TREAT AN HONEST PLAYER WHO TAKES OFF THE PIECE HE IS ABOUT TO UPGRADE AS HONEST? (measurement only: prints, asserts nothing).
// 1039b14 showed the simulated player never took the worn piece off before forging; a person does (and the Forge now says so, 56a84f9), so the hero reaches tier 3 two to three days sooner and the tables of
// supabase/functions/_shared/progress/bounds.ts (floorCapByLevel, floorPace), measured with the old policy, may flag or reject him. This replays the honest players on the REAL game with a snapshot after
// EVERY visit, shown to the REAL evaluateSnapshot with the server's history rule (only an `ok` snapshot becomes the baseline) - the method of honestPlayerAntifraud.test.ts.
//   WORN=0|1 (default 1)  CLASSES=warrior,archer,mage  PASSES=0,1  SEEDS=12  DAYS=60  SHARD_OUT=<file> (writes the raw points as JSON, for the floor-per-level table)
//   BUYER=PB|PBE|PBR|PBER|PBG|PBEG|PBRG (one per process: the buyer's recipes are edited in place, see scripts/sim/leagueEcon.sim.ts): plays that Rodada 22 buyer policy (Pass owner, warrior, League events on) instead of CLASSES / PASSES.
//   SEED_FROM / SEED_TO (default 1 / SEEDS) pick a slice of the seeds, so one policy can be spread over several processes.
//   npx vitest run --config vitest.sim.config.ts wornAntifraud --silent=false --reporter=default
import fs from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mulberry32, withSeededRandom } from '../sim/driver';
import { GEAR, gearRequiredLevel } from '../../src/game/gear';
import { setLeagueEpoch } from '../../src/game/leagueClock';
import { Player, PlayerOptions, SimClass } from '../sim/player';
import { evaluateSnapshot, HistoryPoint } from '../../supabase/functions/_shared/progress/evaluate';
import { extractMetrics, maxPeak, peakOf } from '../../supabase/functions/_shared/progress/metrics';

const WORN = (process.env.WORN ?? '1') === '1';
const CLASSES = (process.env.CLASSES ?? 'warrior,archer,mage').split(',') as SimClass[];
const PASSES = (process.env.PASSES ?? '0,1').split(',').map((x) => x === '1');
const SEEDS = Number(process.env.SEEDS ?? 12);
const DAYS = Number(process.env.DAYS ?? 60);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();
const SEED_FROM = Number(process.env.SEED_FROM ?? 1);
const SEED_TO = Number(process.env.SEED_TO ?? SEEDS);

// The buyers of scripts/sim/leagueEcon.sim.ts (the same options): a legendary / epic tier 4+ set that costs nothing, refined to +8 or not, playing smart or greedy.
const BUYERS: Record<string, { rarity: 'legendary' | 'epic'; refine?: number; greedy?: boolean }> = {
  PB: { rarity: 'legendary' }, PBE: { rarity: 'epic' }, PBR: { rarity: 'legendary', refine: 8 }, PBER: { rarity: 'epic', refine: 8 },
  PBG: { rarity: 'legendary', greedy: true }, PBEG: { rarity: 'epic', greedy: true }, PBRG: { rarity: 'legendary', refine: 8, greedy: true },
};
const BUYER = process.env.BUYER ? BUYERS[process.env.BUYER] : undefined;
if (process.env.BUYER && !BUYER) throw new Error(`unknown buyer ${process.env.BUYER}`);
if (BUYER) {
  const gates = new Map<string, number>(GEAR.map((g) => [g.id, gearRequiredLevel(g)]));
  for (const g of GEAR) {
    if (g.recipe && (g.tier ?? 0) >= 4 && !(g as { unique?: boolean }).unique) {
      // Emptying `items` also empties the level gate the piece INHERITS from its ingredient (gearRequiredLevel walks recipe.items), so the gate is computed first and pinned as the recipe's own: the buyer
      // may not wear a piece above his level. (Before 30/10 it was lost: the simulated buyer wore tier 5 and 6 at level 41, which the game does not allow and the server rejects as GEAR_BELOW_GATE.)
      g.recipe.requiredLevel = gates.get(g.id);
      g.recipe.materials = {} as never;
      g.recipe.items = {} as never;
      (g.recipe as { gems?: unknown }).gems = undefined;
      (g.recipe as { shards?: unknown }).shards = undefined;
      g.cost = 0;
    }
  }
  setLeagueEpoch(START);
}
const buyerOpts = (): PlayerOptions => ({ long: true, pass: true, ...(BUYER?.greedy ? { greedy: true, noStash: true } : { smart: true }), buyer: { fromTier: 4, rarity: BUYER!.rarity, ...(BUYER?.refine ? { refine: BUYER.refine } : {}) } });

interface Point { day: number; kind: string; level: number; floor: number; depth: number; gate?: string; verdict: string; reasons: string[] }
interface Run { who: string; cls: string; pass: boolean; seed: number; points: Point[] }

function play(cls: SimClass, pass: boolean, seed: number): Run {
  const run: Run = { who: BUYER ? `${process.env.BUYER}#${seed}` : `${cls}${pass ? '+P' : ''}#${seed}`, cls, pass, seed, points: [] };
  withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const player = new Player((t) => vi.setSystemTime(t), START, { ...(BUYER ? buyerOpts() : { long: true, pass, cls }), wornIngredients: WORN });
    let first: HistoryPoint | null = null;
    let previous: HistoryPoint | null = null;
    let revision = 0;
    const hooked = player as unknown as { checkIn: (kind: 'first' | 'second') => void };
    const original = hooked.checkIn.bind(player);
    hooked.checkIn = (kind) => {
      original(kind);
      const m = extractMetrics(player.S);
      if (!m) return;
      const ev = evaluateSnapshot(m, { nowMs: player.now, accountCreatedMs: START, entitled: pass, saveRevision: ++revision, first, previous });
      run.points.push({ day: player.day + 1, kind, level: m.heroLevel, floor: m.highestFloor, depth: m.deepestDepth, gate: m.gateViolations.join(" "), verdict: ev.verdict, reasons: ev.reasons });
      if (ev.verdict === 'ok') {
        const point: HistoryPoint = { atMs: player.now, metrics: m, peak: maxPeak(previous?.peak ?? null, peakOf(m)), saveRevision: revision };
        first ??= point;
        previous = point;
      }
    };
    for (let d = 0; d < DAYS; d++) player.playDay(d, jitter);
  });
  return run;
}

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
afterAll(() => { vi.useRealTimers(); });

it('honest players against the real evaluator', () => {
  const runs: Run[] = [];
  for (const cls of BUYER ? (['warrior'] as SimClass[]) : CLASSES) for (const pass of BUYER ? [true] : PASSES) for (let s = SEED_FROM; s <= SEED_TO; s++) runs.push(play(cls, pass, s));
  if (process.env.SHARD_OUT) fs.writeFileSync(process.env.SHARD_OUT, JSON.stringify(runs));
  const out: string[] = [`policy wornIngredients=${WORN}, seeds 1..${SEEDS}, ${DAYS} days`, '| group | players | rejected players | flagged-only players | rejected snaps | flagged snaps |', '| --- | --: | --: | --: | --: | --: |'];
  const groups = new Map<string, Run[]>();
  for (const r of runs) { const k = `${r.cls}${r.pass ? '+Pass' : ''}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  for (const [k, rs] of groups) {
    const rej = rs.filter((r) => r.points.some((p) => p.verdict === 'rejected')).length;
    const flg = rs.filter((r) => !r.points.some((p) => p.verdict === 'rejected') && r.points.some((p) => p.verdict === 'flagged')).length;
    const cnt = (v: string) => rs.reduce((a, r) => a + r.points.filter((p) => p.verdict === v).length, 0);
    out.push(`| ${k} | ${rs.length} | ${rej} | ${flg} | ${cnt('rejected')} | ${cnt('flagged')} |`);
  }
  const bad = runs.flatMap((r) => r.points.filter((p) => p.verdict !== 'ok').map((p) => `${r.who} day ${p.day} ${p.kind} (level ${p.level}, floor ${p.floor}) ${p.verdict}: ${p.reasons.join(', ')}`));
  out.push('', `${bad.length} non-ok snapshots`, ...bad.slice(0, 80).map((x) => '  ' + x));
  console.log(out.join('\n'));
  expect(runs.length).toBeGreaterThan(0);
}, 3_600_000);
