// WHEN EACH CLASS OPENS ITS MATERIAL DOOR (measurement only: prints, asserts nothing).
// The three classes are born in three activities (warrior: Mining, archer: Hunting, mage: Garden -> Weaving). This plays the simulated player (player.ts) as each class and prints, per day, the profession level of the class's
// activity, the level / floor, and the tiers worn, then the first day each class WEARS a piece of each tier (any slot). Env: SIM_DAYS (30), SIM_SEEDS (1), SIM_CLASS (one class), SIM_TRACE=1 (the visit trace).
// The policy is the reasonable one: the player takes off the piece he is about to upgrade (SIM_WORN=0 plays the old one, which forges a second copy of every worn piece at every step) and the mage grows the fibre of
// his whole set (SIM_FIBRE=0: only what the next craft asks for).
// Run: npx vitest run --config vitest.sim.config.ts classDoor --silent=false --reporter=default
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mulberry32, withSeededRandom } from '../sim/driver';
import { Player, PlayerOptions } from '../sim/player';

const DAYS = Number(process.env.SIM_DAYS ?? 30);
const SEEDS = Number(process.env.SIM_SEEDS ?? 1);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();
const CLASSES: PlayerOptions[] = (['warrior', 'archer', 'mage'] as const).filter((c) => !process.env.SIM_CLASS || process.env.SIM_CLASS === c).map((cls) => ({ cls }));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterAll(() => {
  vi.useRealTimers();
});

it('prints the day each class first wears each tier', () => {
  const out: string[] = [];
  for (const opts of CLASSES) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      withSeededRandom(seed * 7919 + 13, () => {
        const jitter = mulberry32(seed * 104729 + 7);
        const p = new Player((t) => vi.setSystemTime(t), START, { ...opts, wornIngredients: process.env.SIM_WORN !== '0', plantFibre: process.env.SIM_FIBRE !== '0' });
        const first: Record<number, number> = {};
        const rows: string[] = [];
        for (let d = 0; d < DAYS; d++) {
          p.playDay(d, jitter);
          const s = p.snapshots[p.snapshots.length - 1];
          const best = Math.max(...s.wornTiers.slice(1, 6));
          for (let t = 1; t <= best; t++) if (first[t] === undefined) first[t] = s.day;
          if ((d + 1) % 3 === 0 || d === DAYS - 1) rows.push(`| ${s.day} | ${s.blockers.gear} | ${s.level} | ${Math.round(s.cp)} | ${s.floor} | mine ${s.skills.mining} / garden ${s.skills.gardening} | ${JSON.stringify(s.wornTiers)} |`);
        }
        out.push(`\n### ${opts.cls} seed ${seed}`, '| dia | bloqueio de equipamento | nivel | CP | andar | oficio | pecas vestidas |', '| --: | --- | --: | --: | --: | --- | --- |', ...rows);
        if (process.env.SIM_TRACE) out.push(...p.trace.filter((l) => /^d[0-9]+ /.test(l)).map((l) => l.slice(0, 420)));
        out.push(`primeiro dia vestindo tier (armadura/luvas/elmo/escudo/botas): ${Object.entries(first).map(([t, d]) => `T${t}=dia ${d}`).join(', ')}`);
      });
    }
  }
  console.log(out.join('\n'));
  expect(true).toBe(true);
});
