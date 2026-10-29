// A small random search over the class levers, to see whether the axis rules of classAxes.test.ts (tier 6 +8 and tier 4 +8) have a common solution (phase 8). In memory only: it mutates the tunables and the staff
// pieces for each candidate and puts them back, and it prints the best candidates; it writes nothing.
//   AXIS_N=60 npx vitest run --config vitest.sim.config.ts axisSearch --silent=false --reporter=default
// The score is the total distance outside the rules (0 = every rule met). Rules: tier 6: mage Hunting 12-24 %, archer boss 12-25 %, archer Hunting <= 10 %, nobody under -10 % on Hunting and on the boss; tier 4: the same,
// and the mage not under -10 % on the boss. (The depth axis is left out on purpose: it does not move with these levers.)
import { it } from 'vitest';
import T from '../../src/game/tunables';
import { getGear, WEAPON_LINES } from '../../src/game/gear';
import { axisLeads } from './classAxes';
import { mulberry32 } from './driver';

const abil = T.abilities as unknown as Record<string, number>;
const staffIds = WEAPON_LINES.find((l) => l.line === 'staff')!.ids;
const staffBase = staffIds.map((id) => (getGear(id) as unknown as { critMultBonus?: number }).critMultBonus ?? 0);
const base = { arcaneBurstPct: abil.arcaneBurstPct, novaPct: abil.novaPct, firmStrikePct: abil.firmStrikePct, arrowRainPct: abil.arrowRainPct, trueShotPct: abil.trueShotPct, doubleThrustPct: abil.doubleThrustPct };
const out = (v: number, lo: number, hi: number): number => Math.max(0, lo - v, v - hi);
const MARGIN = Number(process.env.AXIS_MARGIN ?? 0); // points of room kept from the -10 % lines
const FLOOR = -0.1 + MARGIN / 100;

// the grid of the tunables (T.abilities steps) so that what the search finds is what can be baked
const STEP: Record<string, number> = { arcaneBurstPct: 0.05, novaPct: 0.05, arrowRainPct: 0.05, doubleThrustPct: 0.05, firmStrikePct: 0.1, trueShotPct: 0.1, staff: 0.02 };
const snap = (p: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Math.round(v / STEP[k]) * STEP[k]]));
function apply(p0: Record<string, number>): void {
  const p = snap(p0);
  for (const k of Object.keys(base)) abil[k] = p[k];
  staffIds.forEach((id, i) => ((getGear(id) as unknown as { critMultBonus?: number }).critMultBonus = Math.round(staffBase[i] * p.staff * 10000) / 10000));
}
function score(p: Record<string, number>): { s: number; t6: number[]; t4: number[] } {
  apply(p);
  const six = axisLeads(6, 100, 8);
  const four = axisLeads(4, 62, 8, 'blood_abyss', 5);
  let s = 0;
  for (const l of [six, four]) {
    s += out(l.hunting[2], 0.13, 0.23) + out(l.boss[1], 0.15, 0.22) + out(l.hunting[1], -0.1, 0.1);
    for (const c of [0, 1, 2]) {
      s += out(l.hunting[c], FLOOR, 9);
      s += out(l.boss[c], FLOOR, 9);
    }
  }
  return { s, t6: [six.hunting[0], six.hunting[1], six.hunting[2], six.boss[0], six.boss[1], six.boss[2]], t4: [four.hunting[0], four.hunting[1], four.hunting[2], four.boss[0], four.boss[1], four.boss[2]] };
}

it('searches', () => {
  const rnd = mulberry32(2026);
  const N = Number(process.env.AXIS_N ?? 60);
  const cur: Record<string, number> = process.env.AXIS_START ? JSON.parse(process.env.AXIS_START) : { ...base, staff: 1 };
  const SPREAD = Number(process.env.AXIS_SPREAD ?? 0.3);
  const results: { p: Record<string, number>; s: number; t6: number[]; t4: number[] }[] = [];
  let best = score(cur);
  results.push({ p: { ...cur }, ...best });
  for (let i = 0; i < N; i++) {
    const p = { ...cur };
    for (const k of Object.keys(p)) {
      if (rnd() < 0.5) p[k] = Math.max(k === 'staff' ? 1 : 0.4, p[k] * (1 + (rnd() - 0.5) * SPREAD));
    }
    const r = score(p);
    results.push({ p, ...r });
    if (r.s < best.s) {
      best = r;
      Object.assign(cur, p);
    }
  }
  apply({ ...base, staff: 1 });
  results.sort((a, b) => a.s - b.s);
  const f = (x: number[]): string => x.map((v) => (v * 100).toFixed(1)).join(' / ');
  console.log(results.slice(0, 6).map((r) => `score ${r.s.toFixed(3)} | ${Object.entries(snap(r.p)).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}\n  T6 Caça+chefe g/a/m: ${f(r.t6)}\n  T4 Caça+chefe g/a/m: ${f(r.t4)}`).join('\n'));
}, 3_000_000);
