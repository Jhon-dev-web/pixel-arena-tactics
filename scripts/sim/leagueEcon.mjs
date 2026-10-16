// `node scripts/sim/leagueEcon.mjs TAG POLICIES [SEEDS]` plays the League economy policies (scripts/sim/leagueEcon.sim.ts) one process per policy and seed, then prints the report.
//   TAG       prefix of the JSON files in LEAGUE_OUT (default: the OS temp dir / arena-league-econ), so before / after runs sit side by side
//   POLICIES  comma list: A,P,AS,PS,AB,PB,ABE,PBE (see the .sim.ts header)
//   SEEDS     seeds per policy (default 6)
// Env: LEAGUE_WORKERS (6), LEAGUE_DAYS (60), LEAGUE_OUT, LEAGUE_REPORT_ONLY=1 (print from the JSON already there), SIM_T / SIM_ZONES (passed through to the sim).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [tag = 'run', policiesArg = 'A,P,PS,PB', seedsArg = '6'] = process.argv.slice(2);
const policies = policiesArg.split(',');
const seeds = Array.from({ length: Number(seedsArg) }, (_, i) => i + 1);
const days = Number(process.env.LEAGUE_DAYS ?? 60);
const out = process.env.LEAGUE_OUT ?? path.join(os.tmpdir(), 'arena-league-econ');
const workers = Math.max(1, Number(process.env.LEAGUE_WORKERS ?? 6));
fs.mkdirSync(out, { recursive: true });

const vitest = path.join('node_modules', 'vitest', 'vitest.mjs');
const jobs = [];
for (const p of policies) for (const s of seeds) jobs.push({ p, s });

async function runJob({ p, s }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [vitest, 'run', '--config', 'vitest.sim.config.ts', 'leagueEcon', '--silent=false', '--reporter=default'], {
      env: { ...process.env, LEAGUE_POLICY: p, LEAGUE_SEEDS: String(s), LEAGUE_OUT: out, LEAGUE_TAG: tag, LEAGUE_DAYS: String(days) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let text = '';
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => (text += d));
    child.on('close', (code) => resolve({ code, text, p, s }));
  });
}

if (process.env.LEAGUE_REPORT_ONLY !== '1') {
  const queue = [...jobs];
  let failed = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, jobs.length) }, async () => {
      while (queue.length) {
        const job = queue.shift();
        const r = await runJob(job);
        if (r.code !== 0) {
          failed++;
          console.error(`FAILED ${job.p}${job.s}\n${r.text.slice(-2000)}`);
        } else {
          const line = r.text.split('\n').find((l) => l.startsWith(`${tag} ${job.p}${job.s}:`));
          if (line) console.error(line);
        }
      }
    }),
  );
  if (failed) process.exit(1);
}

// ---- report ---------------------------------------------------------------------------------------------------------------------------------------------------------
const med = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const load = (p) =>
  seeds
    .map((n) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(out, `${tag}-${p}-${n}.json`), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
const runs = Object.fromEntries(policies.map((p) => [p, load(p)]));
const DAYS = [7, 14, 21, 30, 38, 45, 52, 60].filter((d) => d <= days);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');

console.log(`\n### Level position (level + share of the next), median (min-max) of ${seeds.length} seeds, tag ${tag}`);
console.log(`| policy | ${DAYS.map((d) => 'd' + d).join(' | ')} |`);
console.log(`| --- | ${DAYS.map(() => '---').join(' | ')} |`);
for (const p of policies) {
  const rs = runs[p];
  if (!rs.length) continue;
  console.log(`| ${p} | ${DAYS.map((d) => { const v = rs.map((r) => r[d - 1].lvl); return `${f1(med(v))} (${f1(Math.min(...v))}-${f1(Math.max(...v))})`; }).join(' | ')} |`);
}

const pairs = [['PB', 'PS'], ['PB', 'PG'], ['PB4', 'PG'], ['PB4E', 'PG'], ['PBE', 'PG'], ['AB', 'AG'], ['PS', 'P'], ['PG', 'P'], ['PS', 'A']];
console.log(`\n### Gap in levels (median of the per-seed difference, same seed = same jitter and same dice)`);
console.log(`| pair | ${DAYS.map((d) => 'd' + d).join(' | ')} |`);
console.log(`| --- | ${DAYS.map(() => '---').join(' | ')} |`);
for (const [a, b] of pairs) {
  if (!runs[a]?.length || !runs[b]?.length) continue;
  const n = Math.min(runs[a].length, runs[b].length);
  console.log(`| ${a} - ${b} | ${DAYS.map((d) => f1(med(Array.from({ length: n }, (_, i) => runs[a][i][d - 1].lvl - runs[b][i][d - 1].lvl)))).join(' | ')} |`);
}

console.log(`\n### Per policy: pace and economy (medians)`);
console.log('| policy | z3 open day | z4 open day | z4 deep first day | z4 sub-level d30 / d45 / d60 | XP/day d31-60 | tier worn d30 / d45 / d60 (weapon, armor) | first T5 forge day | T5 forges | T6 forges |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const p of policies) {
  const rs = runs[p];
  if (!rs.length) continue;
  const firstDay = (r, pred) => { const i = r.findIndex(pred); return i < 0 ? 99 : i + 1; };
  const z3 = med(rs.map((r) => firstDay(r, (x) => (x.hunt['demon_rift:shallow'] ?? 0) + (x.hunt['demon_rift:dense'] ?? 0) + (x.hunt['demon_rift:deep'] ?? 0) > 0)));
  const z4 = med(rs.map((r) => firstDay(r, (x) => Object.keys(x.hunt).some((k) => k.startsWith('blood_abyss') && x.hunt[k] > 0))));
  const z4d = med(rs.map((r) => firstDay(r, (x) => (x.hunt['blood_abyss:deep'] ?? 0) > 0)));
  const sub = [30, 45, 60].map((d) => med(rs.map((r) => r[d - 1].ceil['blood_abyss:deep'] ?? 0))).join(' / ');
  const xpd = med(rs.map((r) => (r[59].xp - r[29].xp) / 30));
  const worn = [30, 45, 60].map((d) => med(rs.map((r) => r[d - 1].worn[0])) + '/' + med(rs.map((r) => r[d - 1].worn[1]))).join(' ; ');
  const forges = (r, t) => r.reduce((a, x) => a + x.fresh.filter((f) => !f.unique && f.tier === t && f.origin === 'craft').length, 0);
  const t5 = med(rs.map((r) => firstDay(r, (x) => x.fresh.some((f) => !f.unique && f.tier === 5 && f.origin === 'craft'))));
  console.log(`| ${p} | ${z3} | ${z4} | ${z4d} | ${sub} | ${(xpd / 1000).toFixed(0)}k | ${worn} | ${t5} | ${med(rs.map((r) => forges(r, 5)))} | ${med(rs.map((r) => forges(r, 6)))} |`);
}

console.log(`\n### Gold: in hand at the end of day (median), average earned and spent a day over the 7 days up to it, and the first day the hand holds 2,000 / 5,000 / 20,000 / 50,000 / 100,000`);
console.log('| policy | hand d14 / d30 / d45 / d60 | earned a day d30 / d60 | spent a day d30 / d60 | first day at 2k / 5k / 20k / 50k / 100k |');
console.log('| --- | --- | --- | --- | --- |');
for (const p of policies) {
  const rs = runs[p];
  if (!rs.length) continue;
  const hand = [14, 30, 45, 60].map((d) => Math.round(med(rs.map((r) => r[d - 1].gold)))).join(' / ');
  const win = (d, key) => Math.round(med(rs.map((r) => r.slice(d - 7, d).reduce((a, x) => a + sum(x[key]), 0) / 7)));
  const first = [2000, 5000, 20000, 50000, 100000].map((g) => { const v = rs.map((r) => { const i = r.findIndex((x) => x.gold >= g); return i < 0 ? 99 : i + 1; }); const m = med(v); return m > 60 ? '>60' : m; }).join(' / ');
  console.log(`| ${p} | ${hand} | ${win(30, 'goldIn')} / ${win(60, 'goldIn')} | ${win(30, 'goldOut')} / ${win(60, 'goldOut')} | ${first} |`);
}

console.log(`\n### Elixir and uniques by day 60 (per player: mean (max))`);
console.log('| policy | Knowledge Elixirs crafted | Gold on elixirs | uniques from Hunting | uniques of any kind (Hunting + Dungeon bosses) |');
console.log('| --- | --- | --- | --- | --- |');
for (const p of policies) {
  const rs = runs[p];
  if (!rs.length) continue;
  const tot = (r, f) => r.reduce((a, x) => a + f(x), 0);
  const mm = (xs) => `${f1(xs.reduce((a, b) => a + b, 0) / xs.length)} (${Math.max(...xs)})`;
  console.log(`| ${p} | ${mm(rs.map((r) => tot(r, (x) => x.elixir.crafted)))} | ${Math.round(med(rs.map((r) => tot(r, (x) => x.elixir.gold))))} | ${mm(rs.map((r) => tot(r, (x) => sum(x.uniques))))} | ${mm(rs.map((r) => tot(r, (x) => x.fresh.filter((f) => f.unique).length)))} |`);
}
