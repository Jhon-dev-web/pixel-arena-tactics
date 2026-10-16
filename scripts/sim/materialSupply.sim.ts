// Tradeable materials: how many tradeable units the market receives. Run it with `npm run sim:materials` AFTER `npm run sim:long` (it reads the runs that left in LONG_OUT, default <tmp>/arena-long).
// It asserts nothing; it prints
//   1. HONEST_PEAK_DAY_UNITS (paste into supabase/functions/_shared/materials/rates.ts when the game's gathering changes) and the daily caps it gives,
//   2. the tradeable units ONE player produces by day 7 / 30 / 60 in each scenario (the units gathered x the chance of the material),
//   3. the same for a population of 100 / 1 000 / 10 000 players with a stated mix of players.
// Env: LONG_OUT (the dir of the runs), SUPPLY_MIX ("A:0.80,P:0.15,PM:0.017,PW:0.017,PG:0.016" = the share of each scenario in the population).
import { it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TRADEABLE_CHANCE } from '../../supabase/functions/_shared/materials/rates';
import { MATERIAL_BOUNDS } from '../../supabase/functions/_shared/materials/bounds';
import { MATERIAL_IDS } from '../../supabase/functions/_shared/materials/tables';

const OUT = process.env.LONG_OUT ?? path.join(os.tmpdir(), 'arena-long');
const HONEST = ['A', 'P', 'PM', 'PW', 'PG', 'XPM'];
const DAYS = [7, 30, 60];
const MIX = Object.fromEntries((process.env.SUPPLY_MIX ?? 'A:0.80,P:0.15,PM:0.017,PW:0.017,PG:0.016').split(',').map((p) => [p.split(':')[0], Number(p.split(':')[1])])) as Record<string, number>;
const POPULATIONS = [100, 1000, 10000];

interface Day {
  mat: Record<string, number[]>;
}
interface Run {
  scenario: string;
  days: Day[];
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)];
};
const produced = (d: Day, id: string): number => d.mat[id]?.[0] ?? 0;
const f = (n: number, d = 0): string => n.toFixed(d);

it('prints the supply of tradeable materials', () => {
  const runs: Record<string, Run[]> = {};
  if (!fs.existsSync(OUT)) throw new Error(`no runs in ${OUT}: run npm run sim:long first (LONG_SCEN=A,P,PM,PW,PG,XPM LONG_DAYS=60)`);
  for (const file of fs.readdirSync(OUT).filter((x) => x.endsWith('.json'))) {
    const r = JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8')) as Run;
    (runs[r.scenario] ??= []).push(r);
  }
  const out: string[] = [];

  // 1. the honest fast player's best day, by material
  const peak: Record<string, number> = {};
  for (const id of MATERIAL_IDS) {
    for (const sc of HONEST) {
      const rs = runs[sc] ?? [];
      if (rs.length === 0) continue;
      peak[id] = Math.max(peak[id] ?? 0, Math.round(median(rs.map((r) => Math.max(0, ...r.days.map((d) => produced(d, id)))))));
    }
  }
  out.push('== HONEST_PEAK_DAY_UNITS (paste into supabase/functions/_shared/materials/rates.ts)');
  out.push(`export const HONEST_PEAK_DAY_UNITS: Readonly<Record<string, number>> = {\n${MATERIAL_IDS.map((id) => `  ${id}: ${peak[id] ?? 0},`).join('\n')}\n};`);
  out.push('== daily cap on tradeable units per material (the server value, from the table currently in rates.ts): the best honest day x chance, MARGIN 2x');
  out.push(['material', 'chance', 'peak units/day', 'peak tradeable/day', 'CAP/day'].join('\t'));
  for (const id of MATERIAL_IDS) {
    const p = peak[id] ?? 0;
    out.push([id, f(TRADEABLE_CHANCE[id] * 100, 0) + '%', p, f(p * TRADEABLE_CHANCE[id], 1), MATERIAL_BOUNDS.dailyCap(id)].join('\t'));
  }

  // 2. one player: units gathered and the tradeable share by day 7 / 30 / 60 (median over the seeds)
  const cum = (sc: string, id: string, day: number): number => median((runs[sc] ?? []).map((r) => r.days.slice(0, day).reduce((a, d) => a + produced(d, id), 0)));
  const scenarios = HONEST.filter((s) => (runs[s] ?? []).length > 0);
  out.push(`== ONE player: tradeable units by day ${DAYS.join(' / ')} (units gathered x chance; median over ${(runs[scenarios[0]] ?? []).length} seeds; A = the usual player, P = the Pass owner, PM / PW / PG = Pass specialists, XPM = a miner who checks in every 6 hours)`);
  for (const sc of scenarios) {
    out.push(`-- ${sc}`);
    out.push(['material', 'chance', ...DAYS.map((d) => `gathered d${d}`), ...DAYS.map((d) => `tradeable d${d}`)].join('\t'));
    let total = [0, 0, 0];
    for (const id of MATERIAL_IDS) {
      const g = DAYS.map((d) => cum(sc, id, d));
      if (g.every((x) => x === 0)) continue;
      const t = g.map((x) => x * TRADEABLE_CHANCE[id]);
      total = total.map((x, i) => x + t[i]);
      out.push([id, f(TRADEABLE_CHANCE[id] * 100, 0) + '%', ...g.map((x) => f(x)), ...t.map((x) => f(x, 1))].join('\t'));
    }
    out.push(['TOTAL', '', '', '', '', ...total.map((x) => f(x, 1))].join('\t'));
  }

  // 3. a population
  out.push(`== A POPULATION: tradeable units that exist on the market's side by day ${DAYS.join(' / ')}, mix ${Object.entries(MIX).map(([k, v]) => `${k} ${f(v * 100, 1)}%`).join(', ')} (the share of each scenario)`);
  for (const n of POPULATIONS) {
    out.push(`-- ${n} players`);
    out.push(['material', ...DAYS.map((d) => `tradeable d${d}`), 'per player d60'].join('\t'));
    let total = [0, 0, 0];
    for (const id of MATERIAL_IDS) {
      const t = DAYS.map((d) => Object.entries(MIX).reduce((a, [sc, share]) => a + n * share * cum(sc, id, d) * TRADEABLE_CHANCE[id], 0));
      if (t.every((x) => x === 0)) continue;
      total = total.map((x, i) => x + t[i]);
      out.push([id, ...t.map((x) => f(x)), f(t[2] / n, 1)].join('\t'));
    }
    out.push(['TOTAL', ...total.map((x) => f(x)), f(total[2] / n, 1)].join('\t'));
  }
  console.log(out.join('\n'));
});
