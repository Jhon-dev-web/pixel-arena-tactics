// WIDE AXIS TABLE OF THE CLASSES (measurement only: it prints, it asserts nothing, it writes nothing, it changes no number of the game).
// The guard (src/game/__tests__/classAxes.test.ts) reads six builds per tier (sword / axe, bow / crossbow, staff / scepter). This tool reads the same six at tiers 4 and 6 in full, and at tiers 2, 3 and 5 for the twin-pair table only,
// built and measured EXACTLY like the guard (scripts/sim/classAxes.ts + classHero.ts: same hero, same hunting zone and pin, same boss loop, same depth loop, same seeds), so its numbers are comparable with the guard's.
//   Hunting   kills per hour (4 h session, real Hunting engine, 3 session seeds)        owner of the axis: mage
//   Boss      speed of the four biome bosses (immortal hero), each boss read against the mean of the three MAIN builds at that boss (the guard's reference), then averaged       owner: archer
//   Depth     deepest floor of an unbroken run (2 of 3 seeded runs)                      owner: warrior
// The three axes measure nearly the same thing (damage over time) at three SIZES OF FIGHT: Hunting = many short fights, boss = one long fight, depth = a long chain with survival. Two twins of one class (same armor) can only
// be told apart there, and the engine already tells them apart for free through the OVERKILL (a huge swing on a nearly dead enemy throws damage away: a lot in a short fight, almost none in a long one). So each class has a SHORT-FIGHT
// weapon (many small swings, short cooldowns: wins Hunting) and a LONG-FIGHT weapon (few huge swings, long cooldowns: wins the boss); T.abilities has the declaration, the guard the sign. The "PARES" section prints that sign at
// every tier this tool measures, and the "RUIDO" section (AXES_NOISE=k) re-measures every pair with k different seed sets to give the noise the guard's margin has to clear.
//
// It also prints the real combat stats of each build, the raw stats of the weapon lines, and the crit-chance cap map (raw crit chance BEFORE the engine's 1.0 clip, by class, tier and rarity).
//
// HOW TO RUN. vitest.sim.config.ts already includes scripts/tools/**/*.tool.ts (the setup file src/game/__tests__/setup.ts stubs DebugPanel / localStorage), from the repo root:
//   npx vitest run --config vitest.sim.config.ts classAxesWide --silent=false --reporter=default
// Knobs (environment, all optional, none touches a file):
//   AXES_BRIEF=1        only the pair tables (skips the weapon stats and the crit cap map)
//   AXES_NOISE=k        also re-measures every setup with k seed sets (set 0 is the guard's own) and prints the spread of each pair
//   AXES_TIERS=4,6      only these tiers
//   AXES_BOSS_SEEDS=96  seeded runs per boss (24 = the old guard's measure; the pair guard uses more, see classAxes.test.ts); AXES_DEPTH_SEEDS=9 runs per floor (3 = the old measure)
//   AXES_BATCH='[{"riftCdMs":12000},{"riftCdMs":14000}]'   one measurement per override set, printed as `AXESJSON {...}` lines (the scores of the six builds per tier) for a search script; nothing else is printed
//   AXES_OVERRIDE='{"piercingBoltPct":3,"piercingBoltCdMs":20000}'   sets T.abilities.<key> in memory for the whole run (a search aid: the table is then NOT the game's)
import { it } from 'vitest';
import { buildCombatStats, buildHuntSession, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import { effectiveCrit, durabilityFactor, getGear, WEAPON_LINES, SWORD_TWINS } from '../../src/game/gear';
import { equippedExtraStats, equippedSubstatTotals, resolveEquipped, viewDurability, viewRefine } from '../../src/game/gearInstances';
import type { Rarity } from '../../src/game/rarity';
import type { HuntingDepth } from '../../src/game/huntingZones';
import T from '../../src/game/tunables';
import { runDungeon, withSeededRandom } from '../sim/driver';
import { axisLeads } from '../sim/classAxes';
import { CLASS_MAIN, CLASS_VARIANTS, classHero, ClassBuild, weaponId } from '../sim/classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const BOSSES = [25, 50, 75, 100];
// Same row order as the guard: the three mains first (warrior / archer / mage), then the other weapon of each family.
const BUILDS: ClassBuild[] = [CLASS_MAIN[0], CLASS_VARIANTS[0], CLASS_MAIN[1], CLASS_VARIANTS[1], CLASS_MAIN[2], CLASS_VARIANTS[2]];
const OWNER: Record<'hunting' | 'boss' | 'depth', 'warrior' | 'archer' | 'mage'> = { hunting: 'mage', boss: 'archer', depth: 'warrior' };
type Axis = 'hunting' | 'boss' | 'depth';
const AXES: Axis[] = ['hunting', 'boss', 'depth'];
const AXIS_PT: Record<Axis, string> = { hunting: 'Caca', boss: 'Chefe', depth: 'Andares' };

if (process.env.AXES_OVERRIDE) for (const [k, v] of Object.entries(JSON.parse(process.env.AXES_OVERRIDE) as Record<string, number>)) (T.abilities as unknown as Record<string, number>)[k] = v;

// --- the same two measures as scripts/sim/classAxes.ts (not exported there, so repeated line for line); `shift` 0 is the guard's own seeds, any other shift moves every seed (session start, boss seeds, floor seeds) ---
const shiftT0 = (shift: number): number => shift * 3_333_331;
function killsPerHour(h: SaveData, zoneId: string, depth: HuntingDepth, pin: number, starts: number, shift = 0): number {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = pin;
  try {
    let kills = 0;
    let hours = 0;
    for (let i = 0; i < starts; i++) {
      const t0 = NOW + shiftT0(shift) + i * 7_919_000;
      let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: t0 };
      save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, depth)]: { ceiling: pin, promotionWins: 0 } } };
      save = { ...save, huntSession: buildHuntSession(save, t0) };
      const st = computeHuntingStatus(save, t0 + 4 * 3600 * 1000);
      kills += st.kills;
      hours += st.pendingMs / 3600_000;
    }
    return kills / hours;
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}
// scripts/sim/duel.ts bossKill (immortal hero, arriving after four floors of the biome, mean over 24 seeded runs), with a seed shift (duel.ts's seeds are 5000 + i)
function bossMs(s: SaveData, bossFloor: number, shift: number): number {
  const start = { ...s, highestDungeonFloor: bossFloor - 4 };
  let ms = 0;
  for (let i = 0; i < BOSS_SEEDS; i++) {
    const run = withSeededRandom(5000 + shift * 100_000 + i, () => runDungeon(start, NOW, 5, undefined, { immortal: true, trackWaves: true }));
    ms += run.waveMs![run.waveMs!.length - 1];
  }
  return ms / BOSS_SEEDS;
}
// scripts/sim/ladder.ts clearRate with a seed shift (its seeds are 900 + i)
function clearRate(h: SaveData, floor: number, shift: number): number {
  let wins = 0;
  const start = { ...h, highestDungeonFloor: floor };
  for (let i = 0; i < DEPTH_SEEDS; i++) if (withSeededRandom(900 + shift * 10_000 + i, () => runDungeon(start, NOW, 1)).stages >= 1) wins++;
  return wins / DEPTH_SEEDS;
}
function floorReach(h: SaveData, shift: number): number {
  let reach = 0;
  for (let f = 1; f <= 100; f++) {
    if (clearRate(h, f, shift) < 2 / 3) break;
    reach = f;
  }
  return reach;
}

interface Row {
  b: ClassBuild;
  kph: number;
  speeds: number[]; // 1 / ms of each boss
  reach: number;
  combat: { dmgBase: number; critChance: number; critMult: number; heroMs: number; maxHp: number };
  score: Record<Axis, number>; // filled after all builds are measured
}

const pct = (x: number, d = 1): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const pad = (s: string | number, n: number): string => String(s).padEnd(n);
const lpad = (s: string | number, n: number): string => String(s).padStart(n);

// The setups. Tiers 4 and 6 keep the guard's pins. The pins of tiers 2, 3 and 5 were derived once, the way classBalance.sim.ts derives its own: the lowest ceiling sub-level the six builds reach in the zone (10 = the top of the zone at tiers 2 and 3,
// 6 at tier 5), so every build fights the same monster and none is promoted; they are fixed here so that a candidate set of numbers never moves the monster it is measured on.
interface Setup { tier: number; level: number; refine: number; zone: string; pin: number; label: string; full: boolean }
const SETUPS: Setup[] = [
  { tier: 2, level: 20, refine: 4, zone: 'blood_marsh', pin: 10, label: 'TIER 2 +4 (nivel 20, pantano sangrento)', full: false },
  { tier: 3, level: 45, refine: 8, zone: 'demon_rift', pin: 10, label: 'TIER 3 +8 (nivel 45, fenda demoniaca)', full: false },
  { tier: 4, level: 62, refine: 8, zone: 'blood_abyss', pin: 5, label: 'TIER 4 +8 (nivel 62, abismo sangrento, sub-nivel 5)', full: true },
  { tier: 5, level: 75, refine: 8, zone: 'blood_abyss', pin: 6, label: 'TIER 5 +8 (nivel 75, abismo sangrento)', full: false },
  { tier: 6, level: 100, refine: 8, zone: 'blood_abyss', pin: 7, label: 'TIER 6 +8 (nivel 100, abismo sangrento, sub-nivel 7)', full: true },
];
const BOSS_SEEDS = Number(process.env.AXES_BOSS_SEEDS ?? 24);
const DEPTH_SEEDS = Number(process.env.AXES_DEPTH_SEEDS ?? 3);
const ONLY = process.env.AXES_TIERS ? process.env.AXES_TIERS.split(',').map(Number) : null;

function measureRows(s: Setup, shift = 0): { rows: Row[]; pin: number } {
  const heroes = BUILDS.map((b) => classHero(b, s.level, s.tier, s.refine, 'real'));
  const pin = s.pin;
  const rows: Row[] = BUILDS.map((b, i) => {
    const h = heroes[i];
    const c = buildCombatStats(h);
    return {
      b,
      kph: killsPerHour(h, s.zone, 'shallow', pin, 3, shift),
      speeds: BOSSES.map((f) => 1 / bossMs(h, f, shift)),
      reach: floorReach(h, shift),
      combat: { dmgBase: c.dmgBase, critChance: c.critChance, critMult: c.critMult, heroMs: c.heroMs, maxHp: c.maxHp },
      score: { hunting: 0, boss: 0, depth: 0 },
    };
  });
  // Boss score: each boss's speed over the mean speed of the three MAIN builds (rows 0, 2, 4) at that boss, averaged over the four bosses (index 1.00 = the mean of the mains).
  const mainIdx = [0, 2, 4];
  const bossRef = BOSSES.map((_, k) => mainIdx.reduce((a, i) => a + rows[i].speeds[k], 0) / mainIdx.length);
  const huntRef = mainIdx.reduce((a, i) => a + rows[i].kph, 0) / mainIdx.length;
  const depthRef = mainIdx.reduce((a, i) => a + rows[i].reach, 0) / mainIdx.length;
  for (const r of rows) {
    r.score.hunting = r.kph / huntRef;
    r.score.boss = r.speeds.reduce((a, sp, k) => a + sp / bossRef[k], 0) / BOSSES.length;
    r.score.depth = r.reach / depthRef;
  }
  return { rows, pin };
}

function tableLines(rows: Row[]): string[] {
  const lines: string[] = [];
  const raw = (r: Row, ax: Axis): string => (ax === 'hunting' ? `${r.kph.toFixed(0)}/h` : ax === 'boss' ? `idx ${r.score.boss.toFixed(3)}` : `andar ${r.reach}`);
  // The reference "owner of the axis" = the BEST build of the owner class on that axis (the conservative one: a foreign build that beats it beats both weapons of the owner class).
  // The other reference, the owner's MAIN build (sword / bow / staff), is printed in the second table.
  const ownerBest: Record<Axis, Row> = {} as Record<Axis, Row>;
  const ownerMain: Record<Axis, Row> = {} as Record<Axis, Row>;
  for (const ax of AXES) {
    const own = rows.filter((r) => r.b.cls === OWNER[ax]);
    ownerBest[ax] = own.reduce((a, r) => (r.score[ax] > a.score[ax] ? r : a));
    ownerMain[ax] = own[0];
  }
  lines.push(`${pad('build', 20)}| ${AXES.map((ax) => pad(`${AXIS_PT[ax]} (dono: ${OWNER[ax]})`, 38)).join('| ')}`);
  lines.push(`${pad('', 20)}| ${AXES.map(() => pad('valor      pos  vs melhor do dono', 38)).join('| ')}`);
  for (const r of rows) {
    const cells = AXES.map((ax) => {
      const rank = 1 + rows.filter((o) => o.score[ax] > r.score[ax] + 1e-12).length;
      const vsOwner = r.score[ax] / ownerBest[ax].score[ax] - 1;
      const own = r.b.cls === OWNER[ax] ? (r === ownerBest[ax] ? 'DONO' : 'dono') : '';
      return pad(`${pad(raw(r, ax), 11)}${rank === 1 ? ' #1 ' : ` #${rank} `}${lpad(pct(vsOwner), 7)} ${own}`, 38);
    });
    lines.push(`${pad(r.b.id, 20)}| ${cells.join('| ')}`);
  }
  lines.push('');
  for (const ax of AXES) {
    const sorted = [...rows].sort((a, b) => b.score[ax] - a.score[ax]);
    const lead = sorted[0];
    const second = sorted[1];
    const tie = sorted.filter((r) => Math.abs(r.score[ax] / lead.score[ax] - 1) < 1e-9);
    const foreign = lead.b.cls === OWNER[ax] ? '' : '  <<< LIDER FORA DO EIXO DELE';
    lines.push(
      `  ${pad(AXIS_PT[ax], 8)} lidera: ${lead.b.id}${tie.length > 1 ? ` (empate com ${tie.slice(1).map((r) => r.b.id).join(', ')})` : ''}, ${pct(lead.score[ax] / second.score[ax] - 1)} a frente do 2o (${second.b.id})${foreign}`,
    );
  }
  lines.push('');
  lines.push('  Referencia alternativa: cada build contra o dono do eixo ESCOLHIDO PELA ARMA PRINCIPAL (espada / arco / cajado):');
  lines.push(`  ${pad('build', 20)}| ${AXES.map((ax) => pad(`${AXIS_PT[ax]} vs ${ownerMain[ax].b.id}`, 30)).join('| ')}`);
  for (const r of rows) lines.push(`  ${pad(r.b.id, 20)}| ${AXES.map((ax) => pad(pct(r.score[ax] / ownerMain[ax].score[ax] - 1), 30)).join('| ')}`);
  return lines;
}

// THE PAIRS: [label, long-fight weapon row, short-fight weapon row]. The declared cadence (tunables.ts abilities): the SHORT weapon of each class is the one of the many small swings (sword, bow, staff), the LONG one the few huge
// swings (axe, crossbow, scepter). The declared sign: short wins Hunting, long wins the boss. diff(ax) = score of the long weapon over the short one, minus 1: expected NEGATIVE on Hunting, POSITIVE on the boss.
const PAIRS: [string, number, number][] = [['besta / arco', 3, 2], ['cetro / cajado', 5, 4], ['machado / espada', 1, 0]];
const diff = (rows: Row[], ax: Axis, longIdx: number, shortIdx: number): number => rows[longIdx].score[ax] / rows[shortIdx].score[ax] - 1;

// Raw crit chance of a hero BEFORE the engine's Math.min(1, ...) (engine.ts buildCombatStats): weapon (refine, durability) + substats + extra slots/armor. Relic and hero skills are absent from these heroes;
// `engine` is what buildCombatStats reports, kept to prove the rebuilt sum is the engine's (it must equal min(1, raw)).
function rawCrit(h: SaveData): { weapon: number; subs: number; extra: number; raw: number; engine: number } {
  const w = resolveEquipped(h).weapon;
  const weapon = effectiveCrit(w.item, viewRefine(w)) * durabilityFactor(viewDurability(w));
  const subs = equippedSubstatTotals(h).critRate / 100;
  const extra = equippedExtraStats(h).critChance;
  return { weapon, subs, extra, raw: weapon + subs + extra, engine: buildCombatStats(h).critChance };
}

// The margin of the best owner build over the best build of any other class, on an axis (what "the class leads its axis" means in the guard): > 0 = leads.
const ownerMargin = (rows: Row[], ax: Axis): number => Math.max(...rows.filter((r) => r.b.cls === OWNER[ax]).map((r) => r.score[ax])) / Math.max(...rows.filter((r) => r.b.cls !== OWNER[ax]).map((r) => r.score[ax])) - 1;
// the guard's old measure of a class: its value against the mean of the other two MAIN builds (rows 0, 2, 4)
function mainLeads(rows: Row[]): Record<Axis, number[]> {
  const m = [rows[0], rows[2], rows[4]];
  const leadOf = (v: number[], i: number): number => v[i] / ((v.reduce((a, b) => a + b, 0) - v[i]) / (v.length - 1)) - 1;
  return {
    hunting: m.map((_, i) => leadOf(m.map((r) => r.kph), i)),
    boss: m.map((_, i) => BOSSES.reduce((a, _b, k) => a + leadOf(m.map((r) => r.speeds[k]), i), 0) / BOSSES.length),
    depth: m.map((_, i) => leadOf(m.map((r) => r.reach), i)),
  };
}
const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const std = (v: number[]): number => Math.sqrt(v.reduce((a, b) => a + (b - mean(v)) ** 2, 0) / Math.max(1, v.length - 1));

// Search aid (AXES_BATCH): the six scores of every build at every selected tier, for each override set in turn; the tunables are put back after each one.
function runBatch(): void {
  const batch = JSON.parse(process.env.AXES_BATCH as string) as Record<string, number>[];
  const ab = T.abilities as unknown as Record<string, number>;
  const setups = SETUPS.filter((s) => !ONLY || ONLY.includes(s.tier));
  batch.forEach((ov, i) => {
    const saved: Record<string, number> = {};
    for (const [k, v] of Object.entries(ov)) {
      saved[k] = ab[k];
      ab[k] = v;
    }
    try {
      const tiers: Record<number, { id: string; hunting: number; boss: number; depth: number }[]> = {};
      for (const s of setups) {
        const m = measureRows(s);
        tiers[s.tier] = m.rows.map((r) => ({ id: r.b.id, hunting: r.score.hunting, boss: r.score.boss, depth: r.score.depth }));
      }
      console.log('AXESJSON ' + JSON.stringify({ i, ov, tiers }));
    } finally {
      for (const [k, v] of Object.entries(saved)) ab[k] = v;
    }
  });
}

it('prints the wide class-axis table, the twin pairs by tier, the seed noise, the weapon lines and the crit cap map', () => {
  if (process.env.AXES_BATCH) {
    runBatch();
    return;
  }
  const brief = !!process.env.AXES_BRIEF;
  const noiseSets = Number(process.env.AXES_NOISE ?? 0);
  const out: string[] = [];
  const setups = SETUPS.filter((s) => !ONLY || ONLY.includes(s.tier));
  const all: Record<number, { rows: Row[]; pin: number }> = {};
  for (const s of setups) {
    const t0 = Date.now();
    const m = measureRows(s);
    all[s.tier] = m;
    const { rows } = m;
    if (!s.full || brief) continue;
    out.push(`=== ${s.label} (medido em ${((Date.now() - t0) / 1000).toFixed(0)} s) ===`, ...tableLines(rows), '');
    // Faithfulness check: the three mains in this tool must reproduce the guard's own numbers (scripts/sim/classAxes.ts axisLeads), same arguments.
    const g = axisLeads(s.tier, s.level, s.refine, s.zone, m.pin);
    const leadOf = (v: number[], i: number): number => v[i] / ((v.reduce((a, b) => a + b, 0) - v[i]) / (v.length - 1)) - 1;
    const mains = [rows[0], rows[2], rows[4]];
    const mine = {
      hunting: mains.map((_, i) => leadOf(mains.map((r) => r.kph), i)),
      boss: mains.map((_, i) => BOSSES.reduce((a, _b, k) => a + leadOf(mains.map((r) => r.speeds[k]), i), 0) / BOSSES.length),
      depth: mains.map((_, i) => leadOf(mains.map((r) => r.reach), i)),
    };
    out.push(`  Conferencia com o guarda (axisLeads, mesmos argumentos), guerreiro/arqueiro/mago:`);
    for (const ax of AXES) out.push(`    ${pad(AXIS_PT[ax], 8)} guarda ${g[ax].map((x) => pct(x)).join(' / ')}   desta ferramenta ${mine[ax].map((x) => pct(x)).join(' / ')}`);
    out.push('');
    out.push(`  Estatisticas de combate (buildCombatStats) de cada build:`);
    out.push(`  ${pad('build', 20)}| ${lpad('dano base', 10)} ${lpad('critico', 8)} ${lpad('mult crit', 10)} ${lpad('golpe (ms)', 11)} ${lpad('vida max', 9)}`);
    for (const r of rows) out.push(`  ${pad(r.b.id, 20)}| ${lpad(r.combat.dmgBase.toFixed(0), 10)} ${lpad(r.combat.critChance.toFixed(3), 8)} ${lpad(r.combat.critMult.toFixed(3), 10)} ${lpad(r.combat.heroMs.toFixed(0), 11)} ${lpad(r.combat.maxHp, 9)}`);
    out.push('');
  }

  // --- the pair of each class at every tier: the SIGN of the long weapon over the short one (expected: Hunting negative, boss positive) ---
  out.push('=== PARES DE ARMAS DA MESMA CLASSE: arma de luta LONGA sobre a de luta CURTA (esperado: Caca NEGATIVA, Chefe POSITIVO) ===');
  out.push('  curta = espada, arco, cajado (muitos golpes pequenos, recargas curtas); longa = machado, besta, cetro (poucos golpes enormes, recargas longas). Sinal certo = OK, trocado = TROCA.');
  const wrong: string[] = [];
  for (const [label, a, b] of PAIRS) {
    for (const s of setups) {
      const rows = all[s.tier].rows;
      const dh = diff(rows, 'hunting', a, b);
      const db = diff(rows, 'boss', a, b);
      const okH = dh < 0;
      const okB = db > 0;
      if (!okH) wrong.push(`T${s.tier} ${label} Caca`);
      if (!okB) wrong.push(`T${s.tier} ${label} Chefe`);
      out.push(
        `  T${s.tier} ${pad(label, 18)}: Caca ${lpad(pct(dh), 7)} ${okH ? 'OK   ' : 'TROCA'}  Chefe ${lpad(pct(db), 7)} ${okB ? 'OK   ' : 'TROCA'}  Andares ${lpad(pct(diff(rows, 'depth', a, b)), 7)}   (Caca ${rows[a].kph.toFixed(0)} vs ${rows[b].kph.toFixed(0)} /h; andar ${rows[a].reach} vs ${rows[b].reach}; por chefe ${BOSSES.map((f, k) => `${f}:${pct(rows[a].speeds[k] / rows[b].speeds[k] - 1, 0)}`).join(' ')})`,
      );
    }
  }
  out.push(wrong.length === 0 ? '  Sinal certo em todos os pares e tiers medidos.' : `  SINAL TROCADO em: ${wrong.join('; ')}`);
  out.push('');

  // --- seed noise: the same measurement with other seeds ---
  if (noiseSets > 1) {
    out.push(`=== RUIDO DE SEMENTE: ${noiseSets} conjuntos de sementes (o 0 e o do guarda); desvio-padrao, minimo e maximo do diferencial de cada par (pontos percentuais) ===`);
    out.push(`  ${pad('', 24)}${pad('Caca  media  desvio   min    max', 34)}${pad('Chefe media  desvio   min    max', 34)}`);
    const series: Record<number, Row[][]> = {};
    for (const s of setups) {
      series[s.tier] = [all[s.tier].rows];
      for (let k = 1; k < noiseSets; k++) series[s.tier].push(measureRows(s, k).rows);
    }
    const f = (v: number[]): string => `${lpad(pct(mean(v)), 7)} ${lpad((std(v) * 100).toFixed(2), 6)} ${lpad(pct(Math.min(...v)), 7)} ${lpad(pct(Math.max(...v)), 7)}`;
    let worst = 0;
    for (const [label, a, b] of PAIRS) {
      for (const s of setups) {
        const dh = series[s.tier].map((rows) => diff(rows, 'hunting', a, b));
        const db = series[s.tier].map((rows) => diff(rows, 'boss', a, b));
        worst = Math.max(worst, std(dh), std(db));
        out.push(`  T${s.tier} ${pad(label, 18)}  ${f(dh)}   ${f(db)}`);
      }
    }
    out.push(`  Pior desvio-padrao de um par: ${(worst * 100).toFixed(2)} pontos; a margem do guarda tem de ser no minimo o dobro: ${(worst * 200).toFixed(2)} pontos.`);
    out.push('');
    out.push('  Margem da classe dona sobre a melhor build de qualquer outra classe, por eixo (> 0 = lidera):');
    out.push(`  ${pad('', 10)}${AXES.map((ax) => pad(`${AXIS_PT[ax]} media  desvio   min    max`, 34)).join('')}`);
    for (const s of setups) out.push(`  T${s.tier}        ${AXES.map((ax) => pad(f(series[s.tier].map((rows) => ownerMargin(rows, ax))), 34)).join('')}`);
    out.push('');
    // The three MAIN builds read the way the old guard read them (each class against the mean of the other two; the boss lead averaged over the four bosses), over the same seed sets.
    out.push('  Liderancas das tres armas principais (cada classe contra a media das outras duas; guerreiro / arqueiro / mago), ao longo dos conjuntos de sementes:');
    for (const s of setups.filter((x) => x.full)) {
      for (const ax of AXES) {
        const per = [0, 1, 2].map((c) => series[s.tier].map((rows) => mainLeads(rows)[ax][c]));
        out.push(`  T${s.tier} ${pad(AXIS_PT[ax], 8)}${['guerreiro', 'arqueiro', 'mago'].map((n, c) => `${n} ${f(per[c])}`).join('   ')}`);
      }
    }
    out.push('');
  } else {
    out.push('  Margem da classe dona sobre a melhor build de qualquer outra classe, por eixo (> 0 = lidera):');
    for (const s of setups) out.push(`  T${s.tier}   ${AXES.map((ax) => `${AXIS_PT[ax]} ${pct(ownerMargin(all[s.tier].rows, ax))}`).join('   ')}`);
    out.push('');
  }
  if (brief) {
    console.log(String.fromCharCode(10) + out.join(String.fromCharCode(10)));
    return;
  }

  // --- raw weapon stats ---
  out.push('=== ESTATISTICAS BRUTAS DAS ARMAS (gear.ts, sem refino) ===');
  out.push(`  ${pad('arma', 22)}${lpad('dano', 7)}${lpad('critico', 9)}${lpad('vel.ataque', 11)}${lpad('mult crit', 10)}${lpad('regen', 8)}`);
  for (const tier of [4, 6]) {
    const sword = getGear(SWORD_TWINS[tier - 1]);
    const ids = [SWORD_TWINS[tier - 1], weaponId('axe', tier), ...WEAPON_LINES.map((l) => l.ids[tier - 1])];
    for (const id of ids) {
      const g = getGear(id);
      out.push(`  T${tier} ${pad(id, 19)}${lpad(g.damage ?? 0, 7)}${lpad(g.critChance ?? 0, 9)}${lpad(g.attackSpeedBonus ?? 0, 11)}${lpad(g.critMultBonus ?? 0, 10)}${lpad(g.hpRegenPct ?? 0, 8)}   dano ${((g.damage ?? 0) / (sword.damage || 1) * 100).toFixed(0)}% / critico ${((g.critChance ?? 0) / (sword.critChance || 1) * 100).toFixed(0)}% do da espada gemea`);
    }
  }
  out.push('');

  // --- crit cap map ---
  out.push('=== MAPA DO TETO DE CRITICO (taxa BRUTA antes do corte em 1.000; refino +8 e +12; pecas todas da classe + anel do tier, todas com a mesma raridade) ===');
  out.push('  Premissa da ferramenta classHero: toda peca equipada leva a mediana do sub-atributo de critico (raro = 1 sub, epico = 2, ...), e o critico e o PRIMEIRO sub da lista. Sem habilidades de heroi, sem reliquia.');
  const rarities: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const capBuilds = BUILDS;
  let mismatch = 0;
  for (const refine of [8, 12]) {
    out.push(`  --- refino +${refine} ---`);
    out.push(`  ${pad('build', 20)}${pad('raridade', 11)}${[1, 2, 3, 4, 5, 6].map((t) => lpad(`T${t}`, 8)).join('')}`);
    for (const b of capBuilds) {
      for (const rar of rarities) {
        const cells = [1, 2, 3, 4, 5, 6].map((t) => {
          const h = classHero(b, 100, t, refine, 'real', 100, rar);
          const c = rawCrit(h);
          if (Math.abs(Math.min(1, c.raw) - c.engine) > 1e-9) mismatch++;
          return c;
        });
        out.push(`  ${pad(b.id, 20)}${pad(rar, 11)}${cells.map((c) => lpad(c.raw.toFixed(3) + (c.raw >= 1 ? '*' : ' '), 8)).join('')}`);
      }
    }
  }
  // Where the raw crit of a RARE hero comes from, and how many crit substats (one per piece, the median roll of the tier) the cap needs on top of the bare gear (refine +8).
  out.push('  --- de onde vem o critico bruto (refino +8): arma+refino | pecas+armadura | substats (raro: 1 sub de critico em CADA peca) | quantas pecas com o sub de critico bastam para o teto ---');
  for (const b of capBuilds) {
    for (const t of [3, 4, 5, 6]) {
      const bare = classHero(b, 100, t, 8, 'real', 100, 'common');
      const rare = classHero(b, 100, t, 8, 'real', 100, 'rare');
      const cb = rawCrit(bare);
      const cr = rawCrit(rare);
      const worn = Object.values(rare.equipped as unknown as Record<string, string>).filter((id) => rare.gearInstances[id]).length;
      const perPiece = cr.subs / worn;
      const need = Math.max(0, Math.ceil((1 - cb.raw) / perPiece - 1e-9));
      out.push(`  ${pad(b.id, 20)}T${t}  arma ${cb.weapon.toFixed(3)} | pecas ${cb.extra.toFixed(3)} | sem substats ${cb.raw.toFixed(3)} | cada sub ${perPiece.toFixed(3)} x ${worn} pecas = ${cr.subs.toFixed(3)} | teto pede ${need} peca(s) com o sub de ${worn}`);
    }
  }
  out.push(`  (* = ja no teto, o excesso e jogado fora.)  Conferencia da soma refeita contra o motor: ${mismatch === 0 ? 'identica em todas as celulas' : `${mismatch} CELULAS DIVERGEM`}`);
  console.log(String.fromCharCode(10) + out.join(String.fromCharCode(10)));
}, 3_600_000);
