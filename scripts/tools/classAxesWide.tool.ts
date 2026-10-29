// WIDE AXIS TABLE OF THE CLASSES (measurement only: it prints, it asserts nothing, it writes nothing, it changes no number).
// The guard (src/game/__tests__/classAxes.test.ts) reads three builds (sword / bow / staff). This tool reads twelve: the three classes x tier 4 and tier 6 x the two weapons of each family, built and measured
// EXACTLY like the guard (scripts/sim/classAxes.ts + classHero.ts: same hero, same hunting zone and pin, same boss loop, same depth loop, same seeds), so its numbers are comparable with the guard's.
//   Hunting   kills per hour (4 h session, real Hunting engine, 3 session seeds)        owner of the axis: mage
//   Boss      speed of the four biome bosses (immortal hero), each boss read against the mean of the three MAIN builds at that boss (the guard's reference), then averaged       owner: archer
//   Depth     deepest floor of an unbroken run (2 of 3 seeded runs)                      owner: warrior
// It also prints the real combat stats of each build, the raw stats of the weapon lines, and the crit-chance cap map (raw crit chance BEFORE the engine's 1.0 clip, by class, tier and rarity).
//
// HOW TO RUN. vitest.sim.config.ts only includes scripts/sim/**; this file lives in scripts/tools/, so run it with a config that widens `include` (the same config, one line different). Example, from the repo root:
//   npx vitest run --config <a config like vitest.sim.config.ts whose test.include is ['scripts/tools/**/*.tool.ts']> --silent=false --reporter=default
// (the setup file src/game/__tests__/setup.ts must be kept: it stubs DebugPanel / localStorage).
import { it } from 'vitest';
import { buildCombatStats, buildHuntSession, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import { effectiveCrit, durabilityFactor, getGear, WEAPON_LINES, SWORD_TWINS } from '../../src/game/gear';
import { equippedExtraStats, equippedSubstatTotals, resolveEquipped, viewDurability, viewRefine } from '../../src/game/gearInstances';
import type { Rarity } from '../../src/game/rarity';
import type { HuntingDepth } from '../../src/game/huntingZones';
import T from '../../src/game/tunables';
import { bossKill } from '../sim/duel';
import { clearRate } from '../sim/ladder';
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

// --- the same two measures as scripts/sim/classAxes.ts (not exported there, so repeated line for line) ---
function killsPerHour(h: SaveData, zoneId: string, depth: HuntingDepth, pin: number, starts: number): number {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = pin;
  try {
    let kills = 0;
    let hours = 0;
    for (let i = 0; i < starts; i++) {
      const t0 = NOW + i * 7_919_000;
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
function floorReach(h: SaveData): number {
  let reach = 0;
  for (let f = 1; f <= 100; f++) {
    if (clearRate(h, f, NOW, 3) < 2 / 3) break;
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

function measureTier(tier: number, level: number, refine: number, zone: string, pin: number): { rows: Row[]; lines: string[] } {
  const rows: Row[] = BUILDS.map((b) => {
    const h = classHero(b, level, tier, refine, 'real');
    const c = buildCombatStats(h);
    return {
      b,
      kph: killsPerHour(h, zone, 'shallow', pin, 3),
      speeds: BOSSES.map((f) => 1 / bossKill(h, f, NOW, 24).ms),
      reach: floorReach(h),
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
    r.score.boss = r.speeds.reduce((a, s, k) => a + s / bossRef[k], 0) / BOSSES.length;
    r.score.depth = r.reach / depthRef;
  }

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
  return { rows, lines };
}

const WIDE: { tier: number; level: number; refine: number; zone: string; pin: number; label: string }[] = [
  { tier: 4, level: 62, refine: 8, zone: 'blood_abyss', pin: 5, label: 'TIER 4 +8 (nivel 62, abismo sangrento, sub-nivel 5)' },
  { tier: 6, level: 100, refine: 8, zone: 'blood_abyss', pin: 7, label: 'TIER 6 +8 (nivel 100, abismo sangrento, sub-nivel 7)' },
];

// Raw crit chance of a hero BEFORE the engine's Math.min(1, ...) (engine.ts buildCombatStats): weapon (refine, durability) + substats + extra slots/armor. Relic and hero skills are absent from these heroes;
// `engine` is what buildCombatStats reports, kept to prove the rebuilt sum is the engine's (it must equal min(1, raw)).
function rawCrit(h: SaveData): { weapon: number; subs: number; extra: number; raw: number; engine: number } {
  const w = resolveEquipped(h).weapon;
  const weapon = effectiveCrit(w.item, viewRefine(w)) * durabilityFactor(viewDurability(w));
  const subs = equippedSubstatTotals(h).critRate / 100;
  const extra = equippedExtraStats(h).critChance;
  return { weapon, subs, extra, raw: weapon + subs + extra, engine: buildCombatStats(h).critChance };
}

it('prints the wide class-axis table, the weapon lines and the crit cap map', () => {
  const out: string[] = [];
  const all: Record<number, Row[]> = {};
  for (const w of WIDE) {
    const t0 = Date.now();
    const { rows, lines } = measureTier(w.tier, w.level, w.refine, w.zone, w.pin);
    all[w.tier] = rows;
    out.push(`=== ${w.label} (medido em ${((Date.now() - t0) / 1000).toFixed(0)} s) ===`, ...lines, '');
    // Faithfulness check: the three mains in this tool must reproduce the guard's own numbers (scripts/sim/classAxes.ts axisLeads), same arguments.
    const g = axisLeads(w.tier, w.level, w.refine, w.zone, w.pin);
    const leadOf = (v: number[], i: number): number => v[i] / ((v.reduce((a, b) => a + b, 0) - v[i]) / (v.length - 1)) - 1;
    const m = [rows[0], rows[2], rows[4]];
    const mine = {
      hunting: m.map((_, i) => leadOf(m.map((r) => r.kph), i)),
      boss: m.map((_, i) => BOSSES.reduce((a, _b, k) => a + leadOf(m.map((r) => r.speeds[k]), i), 0) / BOSSES.length),
      depth: m.map((_, i) => leadOf(m.map((r) => r.reach), i)),
    };
    out.push(`  Conferencia com o guarda (axisLeads, mesmos argumentos), guerreiro/arqueiro/mago:`);
    for (const ax of AXES) out.push(`    ${pad(AXIS_PT[ax], 8)} guarda ${g[ax].map((x) => pct(x)).join(' / ')}   desta ferramenta ${mine[ax].map((x) => pct(x)).join(' / ')}`);
    out.push('');
    out.push(`  Estatisticas de combate (buildCombatStats) de cada build:`);
    out.push(`  ${pad('build', 20)}| ${lpad('dano base', 10)} ${lpad('critico', 8)} ${lpad('mult crit', 10)} ${lpad('golpe (ms)', 11)} ${lpad('vida max', 9)}`);
    for (const r of rows) out.push(`  ${pad(r.b.id, 20)}| ${lpad(r.combat.dmgBase.toFixed(0), 10)} ${lpad(r.combat.critChance.toFixed(3), 8)} ${lpad(r.combat.critMult.toFixed(3), 10)} ${lpad(r.combat.heroMs.toFixed(0), 11)} ${lpad(r.combat.maxHp, 9)}`);
    out.push('');
  }

  // --- crossbow vs bow, scepter vs staff, axe vs sword, per tier and axis ---
  out.push('=== PARES DE ARMAS DA MESMA CLASSE (valor do eixo da segunda sobre a primeira) ===');
  const pairs: [string, number, number][] = [['besta / arco', 3, 2], ['cetro / cajado', 5, 4], ['machado / espada', 1, 0]];
  for (const [label, a, bIdx] of pairs) {
    for (const tier of [4, 6]) {
      const rows = all[tier];
      out.push(`  T${tier} ${pad(label, 18)}: ${AXES.map((ax) => `${AXIS_PT[ax]} ${pct(rows[a].score[ax] / rows[bIdx].score[ax] - 1)}`).join('   ')}   (Caca ${rows[a].kph.toFixed(0)} vs ${rows[bIdx].kph.toFixed(0)} /h; andar ${rows[a].reach} vs ${rows[bIdx].reach})`);
    }
  }
  out.push('');

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
