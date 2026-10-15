// Long-horizon progression simulation: days 1-180 for a normal player (scenario A, 2 check-ins a day, no Pass) and for an Adventurer Pass owner (scenario P).
// Run it with `npm run sim:long` (scripts/sim/long.mjs spreads the seeds over a few processes, then prints the report). It asserts nothing and is NOT part of `npm test`.
//
// It is the same Player as `npm run sim` (progression.sim.ts / player.ts), with `long: true`: once the floor-100 boss is down the Dungeon sessions go to the Profundezas.
// There is no separate "coarse" mode: a Hunting claim is already one real session per visit (the 4-8 h cap), so 180 days x 6 seeds x 2 scenarios cost ~45 s per seed in
// parallel processes. Days 1-21 are the very same code path as `npm run sim` (the long flag only changes what happens after floor 100).
//
// WHAT IT MODELS: everything the 21-day sim does (hunting in the best unlocked zone/depth, crafting every tier when affordable with the refining chain and gems, refining the
// weapon and armor, set bonuses and the CP the game computes from them, orders, Dungeon sessions up to the free daily limit, skill points down the Warrior path, attribute points,
// the inventory policy, the Garden and the tonics), plus the Profundezas and the paragon level (read from the XP).
// WHAT IT DOES NOT: weekly goals and the login streak (their Gold and Runas are not simulated here, same as the 21-day sim), the Battle Pass track, extra Dungeon sessions bought with
// Runas, rerolled orders, selling or buying with other players, salvage of old gear, reforge, and the Season Relic.
//
// LATE GAME (round 16): from hero level T.lateSinks.minLevel the player also refines all seven worn tier 5 / 6 pieces (up to +8 with the tier material made at its station, then past
// +8 with the surplus: the deep refine) and lapidates the Epic / Legendary ones (player.ts lateGame, deepRefine, lapidarAll). Nothing of this runs before day ~38, so days 1-21 are untouched.
// A control run with the chase switched off but the refining kept: SIM_T='{"lateSinks":{"deepMinTier":7,"lapidarMinTier":7}}'.
// THE LEDGER (round 16): for every 10 days the report also prints the Gold and Runas that came in, went out and were left in hand, and what the player threw away: by material and by
// the reason nothing better was possible (the claim left it behind because the bag was full; the stash had no free slot; the merchant's budget of the day was spent; or the policy
// threw cheap surplus with room elsewhere), next to what was gathered and what the merchant bought, in units, at the economic reference value and for the non-junk materials.
// Env: LONG_SEEDS (6) seeds per scenario, LONG_DAYS (180), LONG_SCEN ("A,P"), LONG_JOBS ("A:1,P:1,..." overrides the list), LONG_OUT (dir of the per-seed JSON),
//      LONG_PRINT=0 (play only), LONG_REPORT_ONLY=1 (print from the JSON already there), SIM_T / SIM_GEAR / SIM_SETS (same overrides as progression.sim.ts).
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import T from '../../src/game/tunables';
import { getGear } from '../../src/game/gear';
import { SET_DEFS } from '../../src/game/setBonuses';
import { mulberry32, withSeededRandom } from './driver';
import { DaySnapshot, Player } from './player';
import { HUNTING_ZONES } from '../../src/game/huntingZones';
import { baseGoldValue } from '../../src/game/economy';
import { MaterialId } from '../../src/game/materials';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import { REFINING_RECIPES } from '../../src/game/refining';

if (process.env.SIM_T) {
  for (const [group, vals] of Object.entries(JSON.parse(process.env.SIM_T) as Record<string, Record<string, number>>)) Object.assign((T as unknown as Record<string, Record<string, number>>)[group], vals);
}
if (process.env.SIM_GEAR) {
  for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_GEAR) as Record<string, Record<string, unknown>>)) {
    const { _items, _cost, _level, ...mats } = over as { _items?: Record<string, number>; _cost?: number; _level?: number } & Record<string, number>;
    const g = getGear(id);
    const r = g.recipe!;
    r.materials = { ...r.materials, ...mats } as typeof r.materials;
    if (_items) r.items = _items;
    if (_cost !== undefined) g.cost = _cost;
    if (_level !== undefined) r.requiredLevel = _level;
  }
}
// SIM_ZONES='{"blood_abyss":{"xpPerHour":13000}}': replaces fields of a Hunting zone for the run. SIM_GATES='{"ore":{"obsidian":60},"wood":{"ancient_wood":60},"refine":{"smelt_obsidian":70}}': replaces
// the profession level that opens an ore / wood tier, or the hero level of a refining recipe.
if (process.env.SIM_ZONES) {
  for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_ZONES) as Record<string, Record<string, number>>)) Object.assign(HUNTING_ZONES.find((z) => z.id === id)!, over);
}
if (process.env.SIM_GATES) {
  const g = JSON.parse(process.env.SIM_GATES) as { ore?: Record<string, number>; wood?: Record<string, number>; refine?: Record<string, number> };
  for (const [id, lvl] of Object.entries(g.ore ?? {})) ORE_TIERS.find((o) => o.id === id)!.requiredLevel = lvl;
  for (const [id, lvl] of Object.entries(g.wood ?? {})) WOOD_TIERS.find((o) => o.id === id)!.requiredLevel = lvl;
  for (const [id, lvl] of Object.entries(g.refine ?? {})) REFINING_RECIPES.find((o) => o.id === id)!.requiredLevel = lvl;
}
if (process.env.SIM_SETS) {
  for (const [f, effects] of Object.entries(JSON.parse(process.env.SIM_SETS) as Record<string, (typeof SET_DEFS)['steel']['effects']>)) (SET_DEFS as Record<string, { effects: unknown }>)[f].effects = effects;
}

// SIM_NO_UNIQUES=1: no unique drop at all (Hunting zones and boss uniques). A unique weapon or ring is worth +30-60% CP at floor 100 and drops at random, so the pace of the
// Dungeon in a 6-seed median is much steadier without them; both variants are reported.
if (process.env.SIM_NO_UNIQUES === '1') {
  for (const z of HUNTING_ZONES) z.uniques = [];
  (T.battle as unknown as Record<string, number>).uniqueBossChance = 0;
  (T.depths as unknown as Record<string, number>).uniqueChanceBase = 0;
  (T.depths as unknown as Record<string, number>).uniqueChancePerDepth = 0;
}

const SEEDS = Number(process.env.LONG_SEEDS ?? 6);
const DAYS = Number(process.env.LONG_DAYS ?? 180);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();
const OUT = process.env.LONG_OUT ?? path.join(os.tmpdir(), 'arena-long');
const ZONES = HUNTING_ZONES.map((z) => z.id);

// ---- one seed, compact ---------------------------------------------------------------------------------------------

export interface LongDay {
  level: number;
  cp: number;
  floor: number;
  depth: number;
  paragon: number;
  worn: number[]; // tier worn in weapon, armor, gloves, helmet, shield, boots, ring
  bestTier: number[]; // best tier owned per slot (crafted but maybe not worn: always >= worn)
  checkpoints: number[]; // boss milestones banked (25 / 50 / 75 / 100)
  zones: number; // hunting zones unlocked
  hunt: number[]; // hours hunted today in each zone (ZONES order)
  huntDepth: Record<string, number>; // hours hunted today by `zone:depth`
  xp: { dungeon: number; hunt: number; order: number; other: number };
  gold: number;
  shards: number; // Runas in hand
  // Gold and Runas that came in and went out today (all sources / uses).
  goldIn: number;
  goldOut: number;
  wsGold?: number; // Gold the wholesale merchant paid today (round 18; absent in runs played before)
  shardsIn: number;
  shardsOut: number;
  // Rodada 20: the Knowledge Elixir of the day (absent in runs played before): crafted, drunk, Gold spent on them, hours of Hunting covered, hours hunted.
  elixir?: { crafted: number; drunk: number; gold: number; coveredHours: number; huntHours: number };
  // The material ledger of the day, only the materials that moved: [accepted into the bag, left behind by the claim (bag full), sold to the merchant, thrown away with the
  // stash full, thrown away with the merchant's budget spent, thrown away by policy with room elsewhere, sold to the wholesale merchant (round 18: the surplus that would have been thrown away)].
  mat: Record<string, number[]>;
  // Round 16: refine levels past +8 on the worn pieces added up, the highest refine level owned, and what the late-game sinks did today (absent in runs played before).
  deepLevels?: number;
  maxRefine?: number;
  sinks?: { deepTry: number; deepOk: number; deepDrop: number; lapidar: number };
  skills: { mining: number; woodcutting: number; gardening: number };
  gearBlock: string;
  dungeonBlock: string;
}
export interface LongRun {
  scenario: 'A' | 'P';
  seed: number;
  days: LongDay[];
}

function matRows(d: DaySnapshot): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [m, f] of Object.entries(d.ledger.flow)) {
    const x = d.ledger.discards[m];
    const row = [f.produced, f.left, f.consumed.merchant, x?.stash ?? 0, x?.merchant ?? 0, x?.policy ?? 0, f.consumed.wholesale];
    if (row.some((n) => n > 0)) out[m] = row;
  }
  return out;
}

function compact(d: DaySnapshot, checkpoints: number[], zones: number): LongDay {
  const hunt = ZONES.map(() => 0);
  const huntDepth: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.ledger.hunt)) {
    const [zone] = k.split(':');
    const i = ZONES.indexOf(zone);
    if (i >= 0) hunt[i] += v.hours;
    huntDepth[k] = (huntDepth[k] ?? 0) + v.hours;
  }
  const x = d.ledger.xpIn;
  const total = Object.values(x).reduce((a, b) => a + b, 0);
  const xp = { dungeon: x['masmorra'] ?? 0, hunt: x['caça'] ?? 0, order: x['pedido'] ?? 0, other: 0 };
  xp.other = total - xp.dungeon - xp.hunt - xp.order;
  const tiers = ['weapon', 'armor', 'gloves', 'helmet', 'shield', 'boots', 'ring'];
  return {
    level: d.level,
    cp: d.cp,
    floor: d.floor,
    depth: d.depth,
    paragon: d.paragon,
    worn: d.wornTiers,
    bestTier: tiers.map((s) => d.tiers[s] ?? 0),
    checkpoints,
    zones,
    hunt,
    huntDepth,
    xp,
    gold: d.gold,
    shards: d.shards,
    goldIn: Object.values(d.ledger.goldIn).reduce((a, b) => a + b, 0),
    goldOut: Object.values(d.ledger.goldOut).reduce((a, b) => a + b, 0),
    wsGold: d.ledger.goldIn['atacado'] ?? 0,
    elixir: { ...d.ledger.elixir, huntHours: d.ledger.hours.hunt },
    shardsIn: Object.values(d.ledger.currency.shardsIn).reduce((a, b) => a + b, 0),
    shardsOut: Object.values(d.ledger.currency.shardsOut).reduce((a, b) => a + b, 0),
    mat: matRows(d),
    deepLevels: d.deepLevels,
    maxRefine: d.maxRefine,
    sinks: d.ledger.sinks,
    skills: d.skills,
    gearBlock: d.blockers.gear,
    dungeonBlock: d.blockers.dungeon,
  };
}

function playSeed(scenario: 'A' | 'P', seed: number): LongRun {
  return withSeededRandom(seed * 7919 + 13, () => {
    const jitter = mulberry32(seed * 104729 + 7);
    const player = new Player((t) => vi.setSystemTime(t), START, { long: true, pass: scenario === 'P' });
    const days: LongDay[] = [];
    for (let d = 0; d < DAYS; d++) {
      player.playDay(d, jitter);
      days.push(compact(player.snapshots[d], [...player.S.dungeonCheckpoints], player.S.unlockedHuntingZones.length));
      player.snapshots[d].ledger = null as never; // the ledger holds every material flow of the day: not needed once compacted
    }
    return { scenario, seed, days };
  });
}

// ---- report ---------------------------------------------------------------------------------------------------------

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
function median(xs: number[]): number {
  const s = sorted(xs);
  if (s.length === 0) return NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const num = (n: number, digits = 0) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).replace(/,/g, ' ') : '-');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function table(header: string[], rows: string[][]): string[] {
  return [`| ${header.join(' | ')} |`, `| ${header.map((_, i) => (i === 0 ? '--:' : '---')).join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
}
const cell = (xs: number[], digits = 0) => {
  if (xs.length === 0) return '-';
  const s = sorted(xs);
  const lo = num(s[0], digits);
  const hi = num(s[s.length - 1], digits);
  const mid = num(median(xs), digits);
  return lo === hi ? mid : `${mid} (${lo}–${hi})`;
};
const mode = (xs: string[]) => {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-';
};

// First day (1-based) a series reaches `value`; Infinity when it never does.
const firstDay = (run: LongRun, pick: (d: LongDay) => number, value: number): number => {
  const i = run.days.findIndex((d) => pick(d) >= value);
  return i < 0 ? Infinity : i + 1;
};
const minWorn = (d: LongDay) => Math.min(...d.worn);

const MILESTONES: [string, (d: LongDay) => number, number][] = [
  ['nível 50', (d) => d.level, 50],
  ['nível 60', (d) => d.level, 60],
  ['nível 70', (d) => d.level, 70],
  ['nível 75', (d) => d.level, 75],
  ['nível 80', (d) => d.level, 80],
  ['nível 90', (d) => d.level, 90],
  ['nível 100', (d) => d.level, 100],
  ['andar 50 (chegada)', (d) => d.floor, 50],
  ['chefe do andar 50 vencido', (d) => (d.checkpoints.includes(50) ? 1 : 0), 1],
  ['andar 75 (chegada)', (d) => d.floor, 75],
  ['chefe do andar 75 vencido', (d) => (d.checkpoints.includes(75) ? 1 : 0), 1],
  ['andar 100 (chegada)', (d) => d.floor, 100],
  ['chefe do andar 100 vencido (abre as Profundezas)', (d) => (d.checkpoints.includes(100) ? 1 : 0), 1],
  ['zona de caça 3 liberada', (d) => d.zones, 3],
  ['zona de caça 4 (a última) liberada', (d) => d.zones, 4],
  ['conjunto T4 vestido (7 peças)', minWorn, 4],
  ['conjunto T5 vestido', minWorn, 5],
  ['conjunto T6 vestido', minWorn, 6],
  ['arma T4 / T5 / T6 vestida: T4', (d) => d.worn[0], 4],
  ['arma T5 vestida', (d) => d.worn[0], 5],
  ['arma T6 vestida', (d) => d.worn[0], 6],
  ['profundeza 10', (d) => d.depth, 10],
  ['profundeza 20', (d) => d.depth, 20],
  ['profundeza 25', (d) => d.depth, 25],
  ['profundeza 30', (d) => d.depth, 30],
  ['profundeza 40', (d) => d.depth, 40],
  ['profundeza 50', (d) => d.depth, 50],
  ['peça refinada a +9', (d) => d.maxRefine ?? 0, 9],
  ['peça refinada a +10', (d) => d.maxRefine ?? 0, 10],
  ['peça refinada a +11', (d) => d.maxRefine ?? 0, 11],
  ['peça refinada a +12', (d) => d.maxRefine ?? 0, 12],
  ['Paragon 1', (d) => d.paragon, 1],
  ['Paragon 10', (d) => d.paragon, 10],
  ['Paragon 25', (d) => d.paragon, 25],
  ['Paragon 50', (d) => d.paragon, 50],
];

export function milestoneTable(runs: LongRun[]): string[] {
  const rows = MILESTONES.map(([label, pick, v]) => {
    const days = runs.map((r) => firstDay(r, pick, v));
    const reached = days.filter(Number.isFinite);
    const med = median(days); // a seed that never gets there counts as later than the horizon
    return [label, Number.isFinite(med) ? num(med, 1) : `> ${DAYS}`, reached.length ? String(Math.min(...reached)) : '-', `${reached.length}/${runs.length}`];
  });
  return table(['Marco', 'Dia (mediana)', 'Seed mais rápida', 'Seeds'], rows);
}

// An unlock for the dry-stretch check: a piece of a new tier worn in a slot, a hunting zone, a boss floor (25 / 50 / 75 / 100), a depth that is a multiple of 5, a skill point
// (a hero level that is a multiple of 5), or a profession reaching a mastery level. Paragon levels are counted apart.
function unlockDays(run: LongRun, withParagon: boolean, withRefine = true): number[] {
  const out: number[] = [];
  let deepBest = 0;
  const mastery = [T.mastery.levelA, T.mastery.levelB, T.mastery.levelC, T.mastery.levelD];
  for (let i = 0; i < run.days.length; i++) {
    const cur = run.days[i];
    const prev = run.days[i - 1] ?? { worn: cur.worn.map(() => 0), zones: 1, checkpoints: [], depth: 0, level: 1, paragon: 0, skills: { mining: 1, woodcutting: 1, gardening: 1 } };
    let hit = false;
    if (cur.worn.some((t, k) => t > prev.worn[k])) hit = true;
    if (cur.zones > prev.zones) hit = true;
    if (cur.checkpoints.length > prev.checkpoints.length) hit = true;
    if (Math.floor(cur.depth / 5) > Math.floor(prev.depth / 5)) hit = true;
    if (Math.floor(cur.level / 5) > Math.floor(prev.level / 5)) hit = true;
    for (const sk of ['mining', 'woodcutting', 'gardening'] as const) if (mastery.some((m) => cur.skills[sk] >= m && prev.skills[sk] < m)) hit = true;
    if (withParagon && cur.paragon > prev.paragon) hit = true;
    // a refine level past +8 that no earlier day had reached on the worn pieces (a fall back to +8 and the climb again are not new)
    if (withRefine && (cur.deepLevels ?? 0) > deepBest) hit = true;
    deepBest = Math.max(deepBest, cur.deepLevels ?? 0);
    if (hit) out.push(i + 1);
  }
  return out;
}

// Longest run of days without an unlock, between `from` and the horizon (days are 1-based, the stretch is [last unlock + 1, next unlock - 1]).
function longestDry(run: LongRun, from: number, withParagon: boolean, withRefine = true): { len: number; start: number; end: number } {
  const days = unlockDays(run, withParagon, withRefine).filter((d) => d >= from - 1);
  let best = { len: 0, start: from, end: from };
  let last = Math.max(from - 1, days.find((d) => d <= from) ?? from - 1);
  for (const d of [...days.filter((x) => x >= from), DAYS + 1]) {
    const len = d - last - 1;
    if (len > best.len) best = { len, start: last + 1, end: d - 1 };
    last = d;
  }
  return best;
}

// Rodada 20 (the League): the level at fixed days (median, slowest and fastest seed), and the Knowledge Elixir of the policy: how much of the Hunting it covered, how many were drunk and
// crafted a day, and the share of the Gold income they cost.
export const LEAGUE_DAYS = [7, 14, 30, 45, 60];
export function leagueSection(runs: LongRun[]): string[] {
  const out: string[] = [];
  const days = LEAGUE_DAYS.filter((d) => d <= DAYS);
  if (days.length === 0) return out;
  out.push('##### Ritmo da Liga: nível do herói e Elixir do Conhecimento', '');
  const rows = days.map((day) => {
    const at = runs.map((r) => r.days[day - 1]);
    const win = runs.map((r) => r.days.slice(Math.max(0, day - 7), day));
    const sum = (f: (d: LongDay) => number) => win.map((w) => w.reduce((a, d) => a + f(d), 0));
    const covered = median(sum((d) => d.elixir?.coveredHours ?? 0));
    const hunted = median(sum((d) => d.elixir?.huntHours ?? 0));
    const drunk = median(sum((d) => d.elixir?.drunk ?? 0)) / win[0].length;
    const crafted = median(sum((d) => d.elixir?.crafted ?? 0)) / win[0].length;
    const gold = median(sum((d) => d.elixir?.gold ?? 0)) / win[0].length;
    const income = median(sum((d) => d.goldIn)) / win[0].length;
    const lv = at.map((d) => d.level);
    return [String(day), String(median(lv)), String(Math.max(...lv)), String(Math.min(...lv)), hunted > 0 ? `${num((covered / hunted) * 100, 0)}%` : '-', num(drunk, 1), num(crafted, 1), num(gold, 0), income > 0 ? `${num((gold / income) * 100, 0)}%` : '-'];
  });
  out.push(...table(['Dia', 'Nível (mediana)', 'mais rápida', 'mais lenta', 'Caça coberta pelo Elixir (7 dias)', 'bebidos por dia', 'feitos por dia', 'Ouro gasto por dia', '% do ouro que entrou'], rows), '');
  return out;
}

export function reportScenario(label: string, runs: LongRun[]): string[] {
  const out: string[] = [];
  const n = runs.length;
  out.push(`#### ${label}: ${n} seeds, ${DAYS} dias (célula = mediana (mín–máx); valores no fim do dia)`);
  out.push('');
  out.push('##### Marcos');
  out.push('');
  out.push(...milestoneTable(runs));
  out.push('');
  const rows: string[][] = [];
  const dayRows = Array.from({ length: Math.floor(DAYS / 10) }, (_, i) => (i + 1) * 10);
  for (const day of dayRows) {
    const at = runs.map((r) => r.days[day - 1]);
    const win = runs.map((r) => r.days.slice(day - 10, day));
    const zoneHours = ZONES.map((_, z) => mean(win.map((w) => w.reduce((a, d) => a + d.hunt[z], 0))));
    const wornMed = median(at.map((d) => median(d.worn)));
    const minTier = median(at.map((d) => Math.min(...d.worn)));
    const bl = (f: (d: LongDay) => string) => mode(at.map((d) => f(d).replace(/\s*\(.*\)$/, '')));
    rows.push([
      String(day),
      cell(at.map((d) => d.level)),
      cell(at.map((d) => d.floor)),
      cell(at.map((d) => d.depth)),
      `${num(wornMed, 1)} / ${num(minTier, 1)}`,
      cell(at.map((d) => d.cp)),
      zoneHours.map((h) => num(h, 0)).join(' / '),
      cell(at.map((d) => d.paragon)),
      `${bl((d) => d.gearBlock)}; ${bl((d) => d.dungeonBlock)}`,
    ]);
  }
  out.push('##### A cada 10 dias');
  out.push('');
  out.push(...table(['Dia', 'Nível', 'Andar', 'Profundeza', 'Tier vestido: mediana / pior slot', 'CP', `Horas de caça nos 10 dias por zona (${ZONES.map((z, i) => `z${i + 1}`).join(' / ')})`, 'Paragon', 'Trava: forja; masmorra'], rows));
  out.push('');
  const xpRows = dayRows.map((day) => {
    const win = runs.map((r) => r.days.slice(day - 10, day));
    const avg = (f: (d: LongDay) => number) => median(win.map((w) => mean(w.map(f))));
    return [String(day), num(avg((d) => d.xp.dungeon + d.xp.hunt + d.xp.order + d.xp.other)), num(avg((d) => d.xp.dungeon)), num(avg((d) => d.xp.hunt)), num(avg((d) => d.xp.order)), num(avg((d) => d.xp.other)), num(avg((d) => d.gold))];
  });
  out.push(...leagueSection(runs));
  out.push('##### XP por dia (média dos 10 dias até o dia, mediana entre seeds) e Ouro em caixa');
  out.push('');
  out.push(...table(['Dia', 'XP total', 'Masmorra', 'Caça', 'Pedidos', 'Missões e outros', 'Ouro em caixa'], xpRows));
  out.push('');
  out.push('##### Ouro e Runas a cada 10 dias (mediana entre seeds)');
  out.push('');
  out.push(...currencyTable(runs));
  out.push('');
  if (runs.some((r) => r.days.some((d) => (d.sinks?.deepTry ?? 0) + (d.sinks?.lapidar ?? 0) > 0))) {
    out.push('##### Sumidouros do fim de jogo (rodada 16), a cada 10 dias (mediana entre seeds)', '', ...sinkTable(runs), '');
  }
  out.push(...discardLedger(label, runs));
  const dry = runs.map((r) => longestDry(r, 21, false, false));
  const dryP = runs.map((r) => longestDry(r, 21, true, false));
  const dryR = runs.map((r) => longestDry(r, 21, false, true));
  const dryRP = runs.map((r) => longestDry(r, 21, true, true));
  const worst = dry.reduce((a, b) => (b.len > a.len ? b : a));
  const worstP = dryP.reduce((a, b) => (b.len > a.len ? b : a));
  const worstR = dryR.reduce((a, b) => (b.len > a.len ? b : a));
  const worstRP = dryRP.reduce((a, b) => (b.len > a.len ? b : a));
  // Longest dry stretch AFTER level 100 and the tier 6 set (day of the later of the two, per seed): where the game used to have nothing new but the Paragon.
  const after100 = runs.map((r) => {
    const d = Math.max(firstDay(r, (x) => x.level, 100), firstDay(r, minWorn, 6));
    return Number.isFinite(d) ? longestDry(r, d + 1, false, true).len : NaN;
  });
  const after100P = runs.map((r) => {
    const d = Math.max(firstDay(r, (x) => x.level, 100), firstDay(r, minWorn, 6));
    return Number.isFinite(d) ? longestDry(r, d + 1, true, true).len : NaN;
  });
  out.push(
    `Maior trecho sem nenhum desbloqueio (peça de tier novo vestida, zona, chefe 25/50/75/100, profundeza múltipla de 5, ponto de habilidade, perk de maestria) entre o dia 21 e o ${DAYS}: mediana entre seeds ${num(median(dry.map((d) => d.len)))} dias, pior seed ${worst.len} dias (dias ${worst.start}-${worst.end}). Contando também cada nível de Paragon: mediana ${num(median(dryP.map((d) => d.len)))}, pior ${worstP.len} (dias ${worstP.start}-${worstP.end}).`,
    '',
    `Contando também cada nível de refino além do +8 (rodada 16): sem Paragon mediana ${num(median(dryR.map((d) => d.len)))}, pior ${worstR.len} (dias ${worstR.start}-${worstR.end}); com Paragon mediana ${num(median(dryRP.map((d) => d.len)))}, pior ${worstRP.len}.`,
    '',
    `Depois do nível 100 e do conjunto T6 (por seed, a partir do dia em que o último dos dois acontece), contando o refino além do +8: maior trecho sem nada novo, sem Paragon, mediana ${num(median(after100.filter(Number.isFinite)))}, pior ${num(Math.max(...after100.filter(Number.isFinite)))} dias (${after100.filter(Number.isFinite).length}/${runs.length} seeds chegam lá); com Paragon, mediana ${num(median(after100P.filter(Number.isFinite)))}, pior ${num(Math.max(...after100P.filter(Number.isFinite)))}.`,
  );
  out.push('');
  return out;
}

// ---- the discard ledger ---------------------------------------------------------------------------------------------------------------------------

const lost = (r: number[]) => r[1] + r[3] + r[4] + r[5]; // left behind + thrown away

function windowSum(run: LongRun, from: number, to: number, f: (mat: Record<string, number[]>) => number): number {
  return run.days.slice(from - 1, to).reduce((a, d) => a + f(d.mat), 0);
}

type LedgerKind = 'units' | 'value' | 'scarce';
type LedgerWhat = 'gathered' | 'lost' | 'bag' | 'stash' | 'merchant' | 'policy' | 'sold' | 'wsold';

// What the player gathered and what he threw away between two days: units of raw materials, the same at the economic reference value (economy.ts), and the units of the
// materials that are not junk (reference value above 4). Medians across seeds.
export function discardWindow(runs: LongRun[], from: number, to: number) {
  const rawSet = new Set<string>();
  for (const r of runs) for (const d of r.days) for (const [m, row] of Object.entries(d.mat)) if (row[0] + row[1] > 0) rawSet.add(m);
  const pick = (kind: LedgerKind, what: LedgerWhat) => (run: LongRun) =>
    windowSum(run, from, to, (mat) => {
      let t = 0;
      for (const [m, r] of Object.entries(mat)) {
        if (!rawSet.has(m)) continue;
        const w = kind === 'value' ? baseGoldValue(m as MaterialId) : kind === 'scarce' ? (baseGoldValue(m as MaterialId) > 4 ? 1 : 0) : 1;
        const n = what === 'gathered' ? r[0] + r[1] : what === 'lost' ? lost(r) : what === 'bag' ? r[1] : what === 'sold' ? r[2] : what === 'wsold' ? r[6] ?? 0 : what === 'stash' ? r[3] : what === 'merchant' ? r[4] : r[5];
        t += n * w;
      }
      return t;
    });
  const med = (f: (r: LongRun) => number) => median(runs.map(f));
  const share = (kind: LedgerKind) => {
    const g = med(pick(kind, 'gathered'));
    return g > 0 ? med(pick(kind, 'lost')) / g : 0;
  };
  return {
    gathered: med(pick('units', 'gathered')),
    bag: med(pick('units', 'bag')),
    stash: med(pick('units', 'stash')),
    merchant: med(pick('units', 'merchant')),
    policy: med(pick('units', 'policy')),
    sold: med(pick('units', 'sold')),
    wsold: med(pick('units', 'wsold')),
    wsoldValue: med(pick('value', 'wsold')),
    lost: med(pick('units', 'lost')),
    shareUnits: share('units'),
    shareValue: share('value'),
    shareScarce: share('scarce'),
  };
}

export function discardLedger(label: string, runs: LongRun[]): string[] {
  const out: string[] = [];
  const pct = (x: number) => `${num(x * 100, 1)}%`;
  out.push(`##### ${label}: o que sobrou e foi jogado fora (mediana entre ${runs.length} seeds; unidades de material cru: caça, mina, lenha, horta)`);
  out.push('');
  out.push('"Perdido" = deixado para trás na coleta (mochila cheia, motivo **mochila**) + jogado fora com o baú cheio (**baú**) + jogado fora com o orçamento do mercador esgotado (**mercador**) + jogado fora com espaço em outro lugar, pela política do jogador (**política**). "Escassos" = materiais com valor de referência acima de 4 (os que não são lixo). Porcentagens = perdido / coletado.');
  out.push('');
  const windows: [number, number][] = [];
  for (let d = 10; d <= DAYS; d += 10) windows.push([d - 9, d]);
  const rows = windows.map(([a, b]) => {
    const w = discardWindow(runs, a, b);
    return [`${a}-${b}`, num(w.gathered), num(w.sold), num(w.wsold), num(w.bag), num(w.stash), num(w.merchant), num(w.policy), pct(w.shareUnits), pct(w.shareValue), pct(w.shareScarce)];
  });
  out.push(...table(['Dias', 'Coletado', 'Vendido ao mercador', 'Vendido ao atacadista', 'Perdido: mochila', 'baú', 'mercador', 'política', '% das unidades', '% do valor', '% dos escassos'], rows));
  out.push('');
  const lateFrom = 60;
  const late = discardWindow(runs, lateFrom, DAYS);
  out.push(`**Dias ${lateFrom}-${DAYS}:** coletado ${num(late.gathered)}, perdido ${num(late.lost)} (${pct(late.shareUnits)} das unidades, ${pct(late.shareValue)} do valor de referência, ${pct(late.shareScarce)} dos materiais escassos); vendido ao mercador ${num(late.sold)}; vendido ao atacadista ${num(late.wsold)} unidades (${num(late.wsoldValue)} de valor de referência, que o atacadista paga a uma fração).`);
  out.push('');
  const mats = new Set<string>();
  for (const r of runs) for (const d of r.days) for (const m of Object.keys(d.mat)) mats.add(m);
  const perMat = [...mats]
    .map((m) => {
      const col = (i: number) => median(runs.map((r) => windowSum(r, lateFrom, DAYS, (mat) => mat[m]?.[i] ?? 0)));
      const g = col(0) + col(1);
      const l = col(1) + col(3) + col(4) + col(5);
      return { m, g, sold: col(2), bag: col(1), stash: col(3), merchant: col(4), policy: col(5), l };
    })
    .filter((x) => x.l > 0)
    .sort((a, b) => b.l * baseGoldValue(b.m as MaterialId) - a.l * baseGoldValue(a.m as MaterialId))
    .slice(0, 16);
  out.push(`###### Os materiais mais jogados fora, dias ${lateFrom}-${DAYS} (ordenado por valor de referência perdido; mediana por seed)`);
  out.push('');
  out.push(
    ...table(
      ['Material', 'Valor ref.', 'Coletado', 'Vendido', 'Perdido: mochila', 'baú', 'mercador', 'política', '% perdido'],
      perMat.map((x) => [x.m, num(baseGoldValue(x.m as MaterialId), 1), num(x.g), num(x.sold), num(x.bag), num(x.stash), num(x.merchant), num(x.policy), x.g > 0 ? pct(x.l / x.g) : '-']),
    ),
  );
  out.push('');
  return out;
}

// Gold and Runas over time: what came in and went out in each 10 days and what was in hand at the end.
export function currencyTable(runs: LongRun[]): string[] {
  const rows: string[][] = [];
  for (let day = 10; day <= DAYS; day += 10) {
    const win = runs.map((r) => r.days.slice(day - 10, day));
    const sum = (f: (d: LongDay) => number) => median(win.map((w) => w.reduce((a, d) => a + f(d), 0)));
    rows.push([
      `${day - 9}-${day}`,
      num(sum((d) => d.goldIn)),
      num(sum((d) => d.goldOut)),
      num(median(runs.map((r) => r.days[day - 1].gold))),
      num(sum((d) => d.wsGold ?? 0)),
      num(sum((d) => d.shardsIn)),
      num(sum((d) => d.shardsOut)),
      num(median(runs.map((r) => r.days[day - 1].shards))),
    ]);
  }
  return table(['Dias', 'Ouro: entrou', 'saiu', 'em caixa no fim', 'do qual atacadista (entrou)', 'Runas: entraram', 'saíram', 'em caixa no fim'], rows);
}

// The late-game sinks (round 16) at work: what the player did with them in each 10 days (median across seeds of the sum of the window).
export function sinkTable(runs: LongRun[]): string[] {
  const rows: string[][] = [];
  for (let day = 10; day <= DAYS; day += 10) {
    const win = runs.map((r) => r.days.slice(day - 10, day));
    const sum = (f: (d: LongDay) => number) => median(win.map((w) => w.reduce((a, d) => a + f(d), 0)));
    rows.push([
      `${day - 9}-${day}`,
      num(sum((d) => d.sinks?.deepTry ?? 0)),
      num(sum((d) => d.sinks?.deepOk ?? 0)),
      num(sum((d) => d.sinks?.deepDrop ?? 0)),
      num(sum((d) => d.sinks?.lapidar ?? 0)),
      num(median(runs.map((r) => r.days[day - 1].deepLevels ?? 0))),
      num(median(runs.map((r) => r.days[day - 1].maxRefine ?? 0))),
    ]);
  }
  return table(['Dias', 'Tentativas de refino além do +8', 'sucessos', 'quedas de nível', 'Lapidações', 'Níveis além do +8 nas 7 peças vestidas (no fim)', 'Maior refino de qualquer peça'], rows);
}

export function comparisonTable(a: LongRun[], p: LongRun[]): string[] {
  const rows = MILESTONES.map(([label, pick, v]) => {
    const da = median(a.map((r) => firstDay(r, pick, v)));
    const dp = median(p.map((r) => firstDay(r, pick, v)));
    const gain = Number.isFinite(da) && Number.isFinite(dp) ? `${num(((da - dp) / da) * 100, 0)}%` : '-';
    return [label, Number.isFinite(da) ? num(da, 1) : `> ${DAYS}`, Number.isFinite(dp) ? num(dp, 1) : `> ${DAYS}`, gain];
  });
  return table(['Marco', 'Sem Passe (A), dia', 'Com Passe (P), dia', 'Dono mais rápido em'], rows);
}

function loadRuns(): { A: LongRun[]; P: LongRun[] } {
  const A: LongRun[] = [];
  const P: LongRun[] = [];
  if (fs.existsSync(OUT)) {
    for (const f of fs.readdirSync(OUT).filter((x) => x.endsWith('.json'))) {
      const r = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')) as LongRun;
      if (r.days.length < DAYS) continue;
      (r.scenario === 'A' ? A : P).push(r);
    }
  }
  A.sort((x, y) => x.seed - y.seed);
  P.sort((x, y) => x.seed - y.seed);
  return { A, P };
}

function printReport() {
  const { A, P } = loadRuns();
  const text: string[] = [];
  if (A.length) text.push(...reportScenario('Cenário A (sem Passe)', A));
  if (P.length) text.push(...reportScenario('Cenário P (dono do Passe de Aventureiro, só os benefícios)', P));
  if (A.length && P.length) {
    text.push('#### Dono contra não-dono (mediana de dias)', '', ...comparisonTable(A, P), '');
  }
  console.log('\n' + text.join('\n') + '\n');
}

describe('long-horizon simulation', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it.skipIf(process.env.LONG_REPORT_ONLY === '1')(`plays ${DAYS} days`, () => {
    fs.mkdirSync(OUT, { recursive: true });
    const scen = (process.env.LONG_SCEN ?? 'A,P').split(',') as ('A' | 'P')[];
    const jobs = process.env.LONG_JOBS
      ? process.env.LONG_JOBS.split(',').map((j) => {
          const [s, n] = j.split(':');
          return { scenario: s as 'A' | 'P', seed: Number(n) };
        })
      : scen.flatMap((scenario) => Array.from({ length: SEEDS }, (_, i) => ({ scenario, seed: i + 1 })));
    for (const job of jobs) {
      const started = performance.now();
      const run = playSeed(job.scenario, job.seed);
      fs.writeFileSync(path.join(OUT, `${job.scenario}-${job.seed}.json`), JSON.stringify(run));
      console.log(`${job.scenario}${job.seed}: ${DAYS} dias em ${((performance.now() - started) / 1000).toFixed(0)}s, nível final ${run.days[DAYS - 1].level}`);
    }
    if (process.env.LONG_PRINT !== '0') printReport();
  });

  it.runIf(process.env.LONG_REPORT_ONLY === '1')('prints the report from the seeds already played', () => {
    printReport();
  });
});
