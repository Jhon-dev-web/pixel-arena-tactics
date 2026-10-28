// `npm run sim:long`: plays the long-horizon simulation (longHaul.sim.ts) with the seeds spread over a few processes (a seed of 180 days takes ~45 s, and they share nothing),
// then prints the report. LONG_WORKERS (default 4) sets the number of processes; LONG_SEEDS / LONG_DAYS / LONG_SCEN / LONG_OUT are passed through (see longHaul.sim.ts).
// LONG_KEEP=1 keeps the seeds already played in LONG_OUT (to add scenarios or seeds without replaying the others).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// LONG_TABLES=1: the preset of the rounds that GENERATE TABLES for the server (rates.ts HONEST_PEAK_DAY_UNITS, read by `npm run sim:materials`). It pins everything a table depends on - the seeds (1..6, each one
// an RNG stream of its own: scripts/sim/longHaul.sim.ts playSeed), 60 days and the six honest scenarios - and writes manifest.meta next to the runs with the code it was played on, so two rounds can be compared
// (phase 8, docs/CLASSES_E_EQUIPAMENTOS.md 5.1.5). A single (scenario, seed) is byte-identical from run to run, whatever the order and the number of processes; what changes the table is the CODE, the number of seeds
// (the table is a median across them), the days and the scenarios, and this preset fixes the last three. Explicit LONG_SEEDS / LONG_DAYS / LONG_SCEN still win.
const tables = process.env.LONG_TABLES === '1';
if (tables) process.env.LONG_DAYS ??= '60';
const seeds = Number(process.env.LONG_SEEDS ?? 6);
const scen = (process.env.LONG_SCEN ?? (tables ? 'A,P,PM,PW,PG,XPM' : 'A,P')).split(',');
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
  for (const line of r.text.split('\n')) if (/^[A-Z]+\d+: /.test(line)) console.error(line);
}
if (tables) {
  const git = (args) => {
    try {
      return execFileSync('git', args, { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  };
  fs.writeFileSync(path.join(out, 'manifest.meta'), JSON.stringify({ preset: 'LONG_TABLES', head: git(['rev-parse', 'HEAD']), changedFiles: git(['status', '--porcelain']).split(String.fromCharCode(10)).filter(Boolean).length, seeds, scenarios: scen, days: Number(process.env.LONG_DAYS), node: process.version }, null, 2));
}
const rep = await run({ LONG_REPORT_ONLY: '1' });
console.log(rep.text);
process.exit(rep.code ?? 0);
