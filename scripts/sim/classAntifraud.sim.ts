// Do the three classes put an honest player over the server's anti-cheat limits? (classes reform, phase 8; docs/CLASSES_E_EQUIPAMENTOS.md 2.6). It measures, it changes no limit and asserts nothing.
//   npx vitest run --config vitest.sim.config.ts classAntifraud --silent=false --reporter=default        (LONG_OUT = the runs of `npm run sim:long`, default <tmp>/arena-long)
//
// The simulated players of sim:long are all one class (the plate line and the sword: scripts/sim/player.ts has no archer and no mage), so their runs cannot say anything about the other two. This tool does
// the two halves separately and puts them together:
//   A. from the runs: the worst honest day of any simulated player, per material, as a share of the server's DAILY cap (the "0.59 of the limit" of the 22/10 check);
//   B. from the REAL Hunting engine: the units an hour of every drop that a hero of each class produces, per zone, against the server's HOURLY ceiling (HUNT_CEILING) and against the warrior;
//   A x B: the worst honest share if a player of that class had the warrior's hunting hours, i.e. the A share times the class's units-an-hour ratio (>= 1 only where the class kills faster AND the
//   economic roll cap (T.hunting.economicRollCap) does not already flatten it).
import { it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHuntSession, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import { HUNTING_ZONES, HuntingDepth } from '../../src/game/huntingZones';
import { TRADEABLE_CHANCE } from '../../supabase/functions/_shared/materials/rates';
import { MATERIAL_BOUNDS } from '../../supabase/functions/_shared/materials/bounds';
import { HUNT_CEILING } from '../../supabase/functions/_shared/materials/tables';
import { BOUNDS, daysAtFloor, daysAtLevel, floorCapForLevel, PACE_FLAG_FACTOR } from '../../supabase/functions/_shared/progress/bounds';
import { CLASS_MAIN, classHero } from './classHero';

const OUT = process.env.LONG_OUT ?? path.join(os.tmpdir(), 'arena-long');
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOURS = 4;
const f = (n: number, d = 2): string => n.toFixed(d);

interface Day {
  mat: Record<string, number[]>;
  level: number;
  floor: number;
}
interface Run {
  scenario: string;
  seed: number;
  days: Day[];
}

const STARTS = Number(process.env.CLASS_STARTS ?? 12);
// Units an hour of every drop, averaged over STARTS sessions (each its own seed: the rare drops are a handful of units in one session and a ratio of two such numbers is noise).
function drops(h: SaveData, zoneId: string, depth: HuntingDepth): { perHour: Record<string, number>; kph: number; defeats: number } {
  const perHour: Record<string, number> = {};
  let kills = 0;
  let defeats = 0;
  let hours = 0;
  for (let i = 0; i < STARTS; i++) {
    const t0 = NOW + i * 7_919_000;
    let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: t0 };
    save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, depth)]: { ceiling: 10, promotionWins: 0 } } };
    save = { ...save, huntSession: buildHuntSession(save, t0) };
    const st = computeHuntingStatus(save, t0 + HOURS * 3600 * 1000);
    hours += st.pendingMs / 3600_000;
    kills += st.kills;
    defeats += st.defeats;
    for (const [m, q] of Object.entries(st.drops)) perHour[m] = (perHour[m] ?? 0) + (q as number);
  }
  for (const m of Object.keys(perHour)) perHour[m] /= hours;
  return { perHour, kph: kills / hours, defeats: defeats / STARTS };
}

it('prints the anti-cheat margin of the three classes', () => {
  const out: string[] = [];
  // ---- A. the worst honest day, from the runs
  const runs: Run[] = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((x) => x.endsWith('.json')).map((x) => JSON.parse(fs.readFileSync(path.join(OUT, x), 'utf8')) as Run) : [];
  const honest = runs.filter((r) => ['A', 'P', 'PM', 'PW', 'PG', 'XPM'].includes(r.scenario));
  const worstShare: Record<string, { share: number; who: string }> = {};
  for (const id of Object.keys(TRADEABLE_CHANCE)) {
    const cap = MATERIAL_BOUNDS.dailyCap(id);
    for (const r of honest)
      r.days.forEach((d, i) => {
        const tradeable = (d.mat[id]?.[0] ?? 0) * TRADEABLE_CHANCE[id];
        const share = tradeable / cap;
        if (share > (worstShare[id]?.share ?? 0)) worstShare[id] = { share, who: `${r.scenario}${r.seed} dia ${i + 1}` };
      });
  }
  const ranked = Object.entries(worstShare).sort((a, b) => b[1].share - a[1].share);
  out.push(`## A. Pior dia honesto de ${honest.length} jogadores simulados (${runs.length ? [...new Set(honest.map((r) => r.scenario))].join(', ') : 'nenhuma corrida em ' + OUT}), por material, como parte do teto diário do servidor`, '');
  out.push('| material | teto diário (unid. negociáveis) | pior dia honesto / teto | quem |', '| --- | --: | --: | --- |');
  for (const [id, w] of ranked.slice(0, 10)) out.push(`| ${id} | ${MATERIAL_BOUNDS.dailyCap(id)} | ${f(w.share)} | ${w.who} |`);
  const worst = ranked[0]?.[1].share ?? 0;
  out.push('', `Pior caso de todos os materiais: ${f(worst)} do teto (${ranked[0]?.[0]}).`, '');

  // ---- C. the season plausibility checks (progress/evaluate.ts) on the same honest days: the rotation makes the hero clear floors faster, and those checks compare floors and levels with the table of the fastest simulated seed
  let capWorst = 0;
  let floorWorst = 0;
  let levelWorst = 0;
  let capWho = '';
  let floorWho = '';
  for (const r of honest.filter((x) => x.scenario === 'A' || x.scenario === 'P')) {
    r.days.forEach((d, i) => {
      const cap = floorCapForLevel(d.level);
      if (d.floor / cap > capWorst) {
        capWorst = d.floor / cap;
        capWho = `${r.scenario}${r.seed} dia ${i + 1}: andar ${d.floor}, nível ${d.level}, teto ${Math.round(cap)}`;
      }
      if (i === 0) return;
      const prev = r.days[i - 1];
      // one-day snapshots, the tightest the server sees (a longer gap gets proportionally more room)
      const floorDays = Math.max(0, daysAtFloor(Math.max(prev.floor, d.floor - BOUNDS.floorStepSlack)) - daysAtFloor(prev.floor));
      const levelDays = Math.max(0, daysAtLevel(d.level) - daysAtLevel(prev.level));
      const fs = floorDays / (PACE_FLAG_FACTOR * 1 + BOUNDS.floorPaceSlackDays);
      const ls = levelDays / (PACE_FLAG_FACTOR * 1 + BOUNDS.paceSlackDays);
      if (fs > floorWorst) {
        floorWorst = fs;
        floorWho = `${r.scenario}${r.seed} dia ${i + 1}: andar ${prev.floor} -> ${d.floor}`;
      }
      levelWorst = Math.max(levelWorst, ls);
    });
  }
  out.push('## C. Verificações de plausibilidade da temporada (progress/evaluate.ts) sobre os mesmos dias honestos, em snapshots de 1 dia (1,00 = marcado)', '');
  out.push(`- andar acima do teto do nível (FLOOR_ABOVE_LEVEL_CAP): pior ${f(capWorst)} (${capWho})`);
  out.push(`- ritmo de andares (FLOOR_PACE): pior ${f(floorWorst)} (${floorWho})`);
  out.push(`- ritmo de nível (LEVEL_PACE): pior ${f(levelWorst)}`, '');

  // ---- B. units an hour per class, per zone, against the hourly ceiling and against the warrior
  // For every hunting material: the biggest class/warrior ratio over every hero / zone / depth where the warrior makes at least 2 units an hour (below that the ratio is noise), and the biggest share of the hourly ceiling.
  const best: Record<string, { ratio: number; cls: string; where: string; ceilShare: number }> = {};
  for (const [label, tier, level] of [['T3', 3, 45], ['T6', 6, 100]] as [string, number, number][]) {
    for (const z of HUNTING_ZONES) {
      for (const depth of ['shallow', 'deep'] as HuntingDepth[]) {
        const res = CLASS_MAIN.map((b) => drops(classHero(b, level, tier, 8, 'real'), z.id, depth));
        if (res.some((r) => r.defeats > 0 || r.kph === 0)) continue; // a zone a class cannot farm is not a production to bound
        for (const m of Object.keys(res[0].perHour)) {
          const ceil = HUNT_CEILING[z.id]?.[m];
          if (!ceil) continue;
          const w = res[0].perHour[m];
          for (let c = 0; c < 3; c++) {
            const share = (res[c].perHour[m] ?? 0) / ceil;
            const b = (best[m] ??= { ratio: 0, cls: '', where: '', ceilShare: 0 });
            b.ceilShare = Math.max(b.ceilShare, share);
            if (c > 0 && w >= 2 && (res[c].perHour[m] ?? 0) / w > b.ratio) {
              b.ratio = (res[c].perHour[m] ?? 0) / w;
              b.cls = CLASS_MAIN[c].id;
              b.where = `${label} ${z.id} ${depth}`;
            }
          }
        }
      }
    }
  }
  out.push('## B x A. Por material de Caça: o pior dia honesto (A) vezes a maior razão classe/guerreiro em unidades por hora (B, herói de Caça real, sub-nível 10, média de ' + STARTS + ' sessões de ' + HOURS + ' h)', '');
  out.push('| material | A: pior dia honesto / teto diário | B: maior razão classe/guerreiro | de quem, onde | A x B | maior parte do teto horário de qualquer classe |', '| --- | --: | --: | --- | --: | --: |');
  const rows = Object.entries(best)
    .map(([m, b]) => ({ m, a: worstShare[m]?.share ?? 0, ...b, proj: (worstShare[m]?.share ?? 0) * Math.max(1, b.ratio) }))
    .sort((x, y) => y.proj - x.proj);
  for (const r of rows.slice(0, 12)) out.push(`| ${r.m} | ${f(r.a)} | ${f(Math.max(1, r.ratio))} | ${r.cls} ${r.where} | ${f(r.proj)} | ${f(r.ceilShare)} |`);
  out.push('', `Pior A x B de todos os materiais de Caça: ${f(rows[0]?.proj ?? 0)} do teto diário (${rows[0]?.m}). Maior parte do teto horário usada por qualquer classe: ${f(Math.max(...rows.map((r) => r.ceilShare)))} (o teto já inclui Passe, Faro, Isca, o melhor sub-nível e a folga de 1,15).`);
  console.log(out.join(String.fromCharCode(10)));
});
