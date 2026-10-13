// `npm run sim:long`: plays the long-horizon simulation (longHaul.sim.ts) with the seeds spread over a few processes (a seed of 180 days takes ~45 s, and they share nothing),
// then prints the report. LONG_WORKERS (default 4) sets the number of processes; LONG_SEEDS / LONG_DAYS / LONG_SCEN / LONG_OUT are passed through (see longHaul.sim.ts).
// LONG_KEEP=1 keeps the seeds already played in LONG_OUT (to add scenarios or seeds without replaying the others).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const seeds = Number(process.env.LONG_SEEDS ?? 6);
const scen = (process.env.LONG_SCEN ?? 'A,P').split(',');
const workers = Math.max(1, Number(process.env.LONG_WORKERS ?? 4));
const out = process.env.LONG_OUT ?? path.join(os.tmpdir(), 'arena-long');
if (process.env.LONG_KEEP !== '1') fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const jobs = [];
for (let i = 1; i <= seeds; i++) for (const s of scen) jobs.push(`${s}:${i}`);
const shards = Array.from({ length: Math.min(workers, jobs.length) }, () => []);
jobs.forEach((j, i) => shards[i % shards.length].push(j));

const vitest = path.join('node_modules', 'vitest', 'vitest.mjs');
const run = (env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [vitest, 'run', '--config', 'vitest.sim.config.ts', 'longHaul', '--silent=false', '--reporter=default'], { env: { ...process.env, LONG_OUT: out, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => (text += d));
    child.on('close', (code) => resolve({ code, text }));
  });

const results = await Promise.all(shards.map((s) => run({ LONG_JOBS: s.join(','), LONG_PRINT: '0' })));
for (const r of results) {
  if (r.code !== 0) {
    console.error(r.text);
    process.exit(1);
  }
  for (const line of r.text.split('\n')) if (/^[AP]\d+: /.test(line)) console.error(line);
}
const rep = await run({ LONG_REPORT_ONLY: '1' });
console.log(rep.text);
process.exit(rep.code ?? 0);
