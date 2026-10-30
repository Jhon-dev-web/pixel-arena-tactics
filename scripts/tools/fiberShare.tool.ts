// WHAT SHARE OF THE MAGE'S FIBRE COMES FROM HUNTING (measurement only: prints, asserts nothing).
// Plays the simulated mage (player.ts) and sums, per fibre, the units that entered the inventory from Hunting (ledger.hunt[zone:depth].units) against all the units produced (ledger.flow[m].produced = Hunting + Garden), over days 10-19 (the stretch
// where the fibre was the mage's bottleneck) and over the whole run, and the BEST DAY of each fibre (units produced in one day, Hunting + Garden; the median over the seeds of each seed's best day, the convention of rates.ts HONEST_PEAK_DAY_UNITS).
// Env: SIM_DAYS (30), SIM_SEEDS (3), SIM_PASS=1 plays the mage as an Adventurer Pass owner.
// Run: npx vitest run --config vitest.sim.config.ts fiberShare --silent=false --reporter=default
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mulberry32, withSeededRandom } from '../sim/driver';
import { Player } from '../sim/player';

const DAYS = Number(process.env.SIM_DAYS ?? 30);
const SEEDS = Number(process.env.SIM_SEEDS ?? 3);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();
const FIBRES = ['flax', 'cotton', 'wild_silk'];

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterAll(() => {
  vi.useRealTimers();
});

it('prints the share of each fibre that came from Hunting', () => {
  const out: string[] = ['| fibra | janela | caca | total produzido | fracao da caca |', '| --- | --- | --: | --: | --: |'];
  const win = { hunt: {} as Record<string, number>, all: {} as Record<string, number>, huntW: {} as Record<string, number>, allW: {} as Record<string, number> };
  const bests: Record<string, number[]> = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    const best: Record<string, number> = {};
    withSeededRandom(seed * 7919 + 13, () => {
      const jitter = mulberry32(seed * 104729 + 7);
      const p = new Player((t) => vi.setSystemTime(t), START, { cls: 'mage', pass: process.env.SIM_PASS === '1' });
      for (let d = 0; d < DAYS; d++) {
        p.playDay(d, jitter);
        const s = p.snapshots[p.snapshots.length - 1];
        for (const m of FIBRES) {
          const hunt = Object.values(s.ledger.hunt).reduce((a, z) => a + (z.units[m] ?? 0), 0);
          const all = s.ledger.flow[m]?.produced ?? 0;
          best[m] = Math.max(best[m] ?? 0, all);
          win.all[m] = (win.all[m] ?? 0) + all;
          win.hunt[m] = (win.hunt[m] ?? 0) + hunt;
          if (s.day >= 10 && s.day <= 19) {
            win.allW[m] = (win.allW[m] ?? 0) + all;
            win.huntW[m] = (win.huntW[m] ?? 0) + hunt;
          }
        }
      }
    });
    for (const m of FIBRES) (bests[m] ??= []).push(best[m] ?? 0);
  }
  for (const m of FIBRES) {
    for (const [name, h, a] of [['dias 10-19', win.huntW, win.allW], [`dias 1-${DAYS}`, win.hunt, win.all]] as const) {
      const hv = (h[m] ?? 0) / SEEDS;
      const av = (a[m] ?? 0) / SEEDS;
      out.push(`| ${m} | ${name} | ${hv.toFixed(1)} | ${av.toFixed(1)} | ${av > 0 ? ((100 * hv) / av).toFixed(0) + ' %' : '-'} |`);
    }
  }
  out.push('', '| fibra | melhor dia de cada semente | mediana |', '| --- | --- | --: |');
  for (const m of FIBRES) out.push(`| ${m} | ${bests[m].join(', ')} | ${[...bests[m]].sort((a, b) => a - b)[Math.floor(bests[m].length / 2)]} |`);
  console.log(out.join('\n'));
  expect(true).toBe(true);
});
