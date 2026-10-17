// `npm run sim:market`: the 1 000-player market of Rodada 25 (scripts/sim/marketPopulation.sim.ts). Runs the stages in order, each spread over MARKET_WORKERS processes (default: the cores minus one), then prints the report:
//   profiles (the real Player, every archetype x seed, 75 days)  ->  oracle (the old "free set" buyers, for the demand timing)  ->  market (the population and the market)
//   ->  heroes (the buyers' real acquisition timelines played by the Player)  ->  report.
//   With the argument `buy` (npm run sim:market:buy): need  ->  buy  ->  buyheroes  ->  buyreport (Rodada 27, needs the profiles and the oracles of a previous run in MARKET_OUT).
// Env: MARKET_OUT (dir of the JSON, default <tmp>/arena-market), MARKET_WORKERS, MARKET_PARAMS (JSON merged over the PARAMS table at the top of the .sim.ts), MARKET_SKIP="profiles,oracle" (keep the
// stages already played in MARKET_OUT; e.g. to try other listing shares only the market + report stages are needed: MARKET_SKIP=profiles,oracle,heroes), MARKET_ONLY=report.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = process.env.MARKET_OUT ?? path.join(os.tmpdir(), 'arena-market');
const workers = Math.max(1, Number(process.env.MARKET_WORKERS ?? Math.max(1, os.cpus().length - 1)));
const skip = new Set((process.env.MARKET_SKIP ?? '').split(',').filter(Boolean));
const only = process.env.MARKET_ONLY;
fs.mkdirSync(out, { recursive: true });
const vitest = path.join('node_modules', 'vitest', 'vitest.mjs');

const run = (stage, shard, n) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [vitest, 'run', '--config', 'vitest.sim.config.ts', 'marketPopulation', '--silent=false', '--reporter=default'], {
      env: { ...process.env, MARKET_OUT: out, MARKET_STAGE: stage, MARKET_SHARD: `${shard}/${n}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let text = '';
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => (text += d));
    child.on('close', (code) => resolve({ code, text }));
  });

// Rodada 27: `npm run sim:market:buy` (argument `buy`) runs the buyers-who-buy-materials stages on top of the profiles and the oracles already in MARKET_OUT: buy (the market once per policy x budget) -> buyheroes -> buyreport.
const stages = process.argv[2] === 'buy' ? [['need', true], ['buy', false], ['buyheroes', true], ['buyreport', false]] : [['profiles', true], ['oracle', true], ['market', false], ['heroes', true], ['report', false]];
for (const [stage, parallel] of stages) {
  if (only ? only !== stage : skip.has(stage)) continue;
  const n = parallel ? workers : 1;
  const t0 = Date.now();
  const results = await Promise.all(Array.from({ length: n }, (_, i) => run(stage, i, n)));
  for (const r of results) {
    if (r.code !== 0) {
      console.error(`FAILED stage ${stage}\n${r.text.slice(-4000)}`);
      process.exit(1);
    }
  }
  if (stage === 'report' || stage === 'buyreport') {
    // the vitest reporter wraps the console output: print the markdown between the tool's own lines
    const text = results[0].text;
    const lines = text.split('\n').filter((l) => !/^\s*(stdout \|| ✓|Test Files|Tests |Start at|Duration|RUN |✓ )/.test(l));
    console.log(lines.join('\n'));
  } else {
    console.error(`stage ${stage}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
