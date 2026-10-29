// DOES THE CARRY (transbordo) OR THE DODGE (Esquiva) GROW WITH ATTACK SPEED? (measurement only: it prints, it asserts nothing, it writes nothing, it changes no number of the game.)
//
// Context: the wide axis table (classAxesWide.tool.ts) showed the crossbow archer leading the Hunting axis (the mage's) by +11.5 % at tier 4 and +9.0 % at tier 6. The suspicion: two things in the combat engine grow with the
// attack speed by accident, and they inflate the fast class. This tool finds out, on the REAL engine (computeHuntingStatus for Hunting, scripts/sim/duel.ts bossKill + ladder.ts clearRate for the Dungeon), with the SAME 12 builds
// and the SAME three measures as classAxesWide.tool.ts (the same hero, zone, pin, seeds), so the numbers are comparable.
//
// WHAT "CARRY" AND "DODGE" ARE IN THIS ENGINE (read from the code, see the section "CONTA NO PAPEL" of the output for the lines):
//   carry  = abilities.ts 'carry' effect: arcane_burst + nova (staff), dark_pulse (scepter), brutal_spin (axe). The spill is `round(base x pct)` per fire (abilities.ts:285), `base` = the damage of THAT swing; the bucket is
//            emptied into the NEXT enemy at the start of a fight (abilities.ts:309-316, huntCombat.ts:350, driver.ts:188). The bow, the crossbow and the sword have NO carry ability.
//   dodge  = abilities.ts 'dodge' (the leather chestpiece, so both archer builds): attack speed +35 % for 4000 ms, cooldown 16000 ms (tunables abilities.dodgeHaste*, dodgeCdMs). It is a haste, not an evasion chance:
//            the tunable advanced.agiDodgePerPoint said "Dodge chance per AGI point" and nothing read it; it was removed on 29/10.
//
// THE SCENARIOS (all by PARAMETER inside this tool: the tunables are set for the length of one measure and put back in a finally; no game file is touched):
//   S0  the engine as it is
//   S1  no carry          T.abilities.carryCapPct = 0 (the next enemy takes nothing: the carry abilities still fire as a plain swing)
//   S2  no dodge          T.abilities.dodgeHastePct = 0 (the dodge still fires as a plain swing)
//   S3  neither
//   S4  dodge by TIME     the haste is the same average per second, with no window: permanent, at pct x hasteMs / (cdMs x cdScale). It cannot depend on how many swings fit in the window or on when the next
//                         swing comes after the cooldown ends.
//   S5  carry by TIME     the spill is a share of the damage per TIME instead of one swing: every carry pct is multiplied by REF / heroMs of the build (REF = mean heroMs of the three MAIN builds of the tier), so
//                         spill = pct x hit x REF / heroMs = pct x (damage per ms) x REF. A build exactly at REF keeps its carry; a faster one gets more, a slower one less.
//   S6  S4 + S5
// An ablation (S1..S3) is the upper bound of what the effect can be worth, whatever "scaling" means. S4/S5 are the "does not scale with the speed" versions, and S5 depends on the choice of REF (documented, arbitrary).
//
// THE SPEED SWEEP (section 4): the Haste Tonic of the game (T.tonics.hasteAttackSpeed, a buff in save.buffs, read by Hunting and the Dungeon alike) is used as a speed knob, +0 / +15 / +30 %. At each speed the SAME build
// is measured with the effect on and off, R = on / off. If R grows with the speed, the effect scales with the speed. If it is flat, it does not.
//
// WHAT WAS RUN ON THE ENGINE AND WHAT WAS NOT: sections 1-4 and 6 are engine runs. Section 5 is arithmetic on the tunables printed next to the engine's own numbers. The Hunting replica used for the fire counts (section 1) is
// the same call chain as computeHuntingStatus (buildHuntSimSetup + simulateHuntingSession, same seed, same progress); the tool counts the sessions where its kills differ from computeHuntingStatus's and prints it (must be 0).
//
// HOW TO RUN, from the repo root:  npx vitest run --config vitest.sim.config.ts carryDodgeSpeed --silent=false --reporter=default
import { it } from 'vitest';
import { buildCombatStats, buildHuntSession, buildHuntSimSetup, computeHuntingStatus, getHuntProgress, huntProgressKey, huntPromotionRequiredWins, SaveData } from '../../src/game/engine';
import { getHuntingZone } from '../../src/game/huntingZones';
import type { HuntingDepth } from '../../src/game/huntingZones';
import { simulateHuntingSession } from '../../src/game/huntCombat';
import type { HuntCombatBuild, HuntTimeline } from '../../src/game/huntCombat';
import { relativeWindows } from '../../src/game/huntSession';
import { abilityCdScale } from '../../src/game/abilities';
import { hasteIntervalMs } from '../../src/game/buffs';
import T from '../../src/game/tunables';
import { bossKill } from '../sim/duel';
import { clearRate } from '../sim/ladder';
import { CLASS_MAIN, CLASS_VARIANTS, classHero, ClassBuild } from '../sim/classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const BOSSES = [25, 50, 75, 100];
const DEPTH: HuntingDepth = 'shallow';
// Same row order as classAxesWide.tool.ts: warrior, warrior (axe), archer, archer (crossbow), mage, mage (scepter).
const BUILDS: ClassBuild[] = [CLASS_MAIN[0], CLASS_VARIANTS[0], CLASS_MAIN[1], CLASS_VARIANTS[1], CLASS_MAIN[2], CLASS_VARIANTS[2]];
const IDX = { warrior: 0, axe: 1, bow: 2, crossbow: 3, staff: 4, scepter: 5 };
const MAINS = [0, 2, 4];
interface TierCfg { tier: number; level: number; refine: number; zone: string; pin: number; label: string }
const TIERS: TierCfg[] = [
  { tier: 4, level: 62, refine: 8, zone: 'blood_abyss', pin: 5, label: 'TIER 4 +8 (nivel 62, abismo sangrento, sub-nivel 5)' },
  { tier: 6, level: 100, refine: 8, zone: 'blood_abyss', pin: 7, label: 'TIER 6 +8 (nivel 100, abismo sangrento, sub-nivel 7)' },
];
const STARTS_GUARD = 3; // the guard's number of Hunting sessions (comparable with classAxesWide / classAxes.test)
const STARTS_WIDE = 12; // the same sessions plus nine more: less noise in the differences
const CARRY_KEYS = ['arcaneBurstPct', 'novaPct', 'brutalSpinPct', 'darkPulsePct'];

const pct = (x: number, d = 1): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;
const pad = (s: string | number, n: number): string => String(s).padEnd(n);
const lpad = (s: string | number, n: number): string => String(s).padStart(n);

// --- tunables patch: set for the length of one call, put back in a finally ---
type Patch = Record<string, Record<string, number>>;
function withPatch<R>(patch: Patch, fn: () => R): R {
  const tun = T as unknown as Record<string, Record<string, number>>;
  const saved: [string, string, number][] = [];
  for (const [sec, kv] of Object.entries(patch)) for (const k of Object.keys(kv)) saved.push([sec, k, tun[sec][k]]);
  try {
    for (const [sec, kv] of Object.entries(patch)) for (const [k, v] of Object.entries(kv)) tun[sec][k] = v;
    return fn();
  } finally {
    for (const [sec, k, v] of saved.reverse()) tun[sec][k] = v;
  }
}
const mergePatch = (a: Patch, b: Patch): Patch => {
  const out: Patch = {};
  for (const p of [a, b]) for (const [sec, kv] of Object.entries(p)) out[sec] = { ...(out[sec] ?? {}), ...kv };
  return out;
};

// --- scenarios ---
interface Ctx { level: number; ref: number; heroMs: number }
interface Scn { id: string; label: string; carry: 'real' | 'off' | 'time'; dodge: 'real' | 'off' | 'time' }
const SCN: Scn[] = [
  { id: 'S0', label: 'motor como esta', carry: 'real', dodge: 'real' },
  { id: 'S1', label: 'sem transbordo', carry: 'off', dodge: 'real' },
  { id: 'S2', label: 'sem Esquiva', carry: 'real', dodge: 'off' },
  { id: 'S3', label: 'sem os dois', carry: 'off', dodge: 'off' },
  { id: 'S4', label: 'Esquiva por tempo', carry: 'real', dodge: 'time' },
  { id: 'S5', label: 'transbordo por tempo', carry: 'time', dodge: 'real' },
  { id: 'S6', label: 'os dois por tempo', carry: 'time', dodge: 'time' },
];
// Read INSIDE withPatch's caller before the patch is applied, so T holds the real values here.
function scnPatch(s: Scn, c: Ctx): Patch {
  const a = T.abilities as unknown as Record<string, number>;
  const ab: Record<string, number> = {};
  if (s.carry === 'off') ab.carryCapPct = 0;
  if (s.carry === 'time') for (const k of CARRY_KEYS) ab[k] = a[k] * (c.ref / c.heroMs);
  if (s.dodge === 'off') ab.dodgeHastePct = 0;
  if (s.dodge === 'time') {
    const cdScale = abilityCdScale(c.level);
    ab.dodgeHastePct = (a.dodgeHastePct * a.dodgeHasteMs) / (a.dodgeCdMs * cdScale);
    ab.dodgeHasteMs = 1e9; // never runs out once the first dodge fired (a fire sets hasteUntil = now + this)
  }
  return { abilities: ab };
}

// --- the measures (the same as classAxesWide.tool.ts / scripts/sim/classAxes.ts, except that the sessions are kept one by one) ---
function startSave(h: SaveData, zoneId: string, pin: number, i: number): { save: SaveData; t0: number } {
  const t0 = NOW + i * 7_919_000;
  let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: DEPTH, huntingOfflineStart: t0 };
  save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, DEPTH)]: { ceiling: pin, promotionWins: 0 } } };
  save = { ...save, huntSession: buildHuntSession(save, t0) };
  return { save, t0 };
}
interface Sess { kills: number; hours: number }
function huntSessions(h: SaveData, zoneId: string, pin: number, starts: number): Sess[] {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = pin;
  try {
    const out: Sess[] = [];
    for (let i = 0; i < starts; i++) {
      const { save, t0 } = startSave(h, zoneId, pin, i);
      const st = computeHuntingStatus(save, t0 + 4 * 3600 * 1000);
      out.push({ kills: st.kills, hours: st.pendingMs / 3600_000 });
    }
    return out;
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}
const kphOf = (s: Sess[], k: number): number => s.slice(0, k).reduce((a, x) => a + x.kills, 0) / s.slice(0, k).reduce((a, x) => a + x.hours, 0);
function floorReach(h: SaveData): number {
  let reach = 0;
  for (let f = 1; f <= 100; f++) {
    if (clearRate(h, f, NOW, 3) < 2 / 3) break;
    reach = f;
  }
  return reach;
}

// speeds = the guard's boss measure (bossKill's default warmup of 4 floors, so the SAME phase of the cooldowns every seed); phased = the same boss averaged over the warmups 2..9 (eight arrival phases of the cooldowns).
// A windowed effect (the dodge) is deterministic in time, so with ONE warmup the boss is always caught at the same point of the cycle; the phased column is the robust one for effects with a cooldown.
interface Meas { sess: Sess[]; speeds: number[]; phased: number[]; reach: number }
const WARMUPS = [2, 3, 4, 5, 6, 7, 8, 9];
const GUARD_WARMUP = 4;
interface What { boss: boolean; depth: boolean }
// The base hero of a build at a tier (rotation and class affinity on, like the guard).
const heroOf = (b: ClassBuild, c: TierCfg): SaveData => classHero(b, c.level, c.tier, c.refine, 'real');
// The Haste Tonic as a speed knob: a buff that never runs out in the window of the measure.
const withHaste = (h: SaveData): SaveData => ({ ...h, buffs: { ...h.buffs, haste: { from: NOW - 1, expiresAt: NOW + 1e13 } } });
function measure(h0: SaveData, c: TierCfg, ctx: Ctx, scn: Scn, haste: number, starts: number, what: What): Meas {
  const h = haste > 0 ? withHaste(h0) : h0;
  const patch = mergePatch(scnPatch(scn, ctx), haste > 0 ? { tonics: { hasteAttackSpeed: haste } } : {});
  return withPatch(patch, () => {
    const sess = huntSessions(h, c.zone, c.pin, starts);
    const byWarmup = what.boss ? WARMUPS.map((w) => BOSSES.map((f) => 1 / bossKill(h, f, NOW, 24, w).ms)) : [];
    return {
      sess,
      speeds: what.boss ? byWarmup[WARMUPS.indexOf(GUARD_WARMUP)] : [],
      phased: what.boss ? BOSSES.map((_, k) => byWarmup.reduce((a, row) => a + row[k], 0) / WARMUPS.length) : [],
      reach: what.depth ? floorReach(h) : 0,
    };
  });
}
const bossMean = (a: number[], base: number[]): number => a.reduce((s, v, k) => s + v / base[k], 0) / a.length - 1; // mean over the four bosses of (speed / base speed) - 1
// R of an effect per Hunting session start (on / off) and its mean with the standard error of that mean.
function ratioStats(on: Sess[], off: Sess[]): { r: number; se: number } {
  const rs = on.map((x, i) => x.kills / x.hours / (off[i].kills / off[i].hours));
  const mean = rs.reduce((a, v) => a + v, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, rs.length - 1));
  return { r: kphOf(on, on.length) / kphOf(off, off.length), se: sd / Math.sqrt(rs.length) };
}

// --- the Hunting replica (same call chain as computeHuntingStatus) for fire counts, fight length and the quantization probe ---
interface Replica { kills: number; defeats: number; hours: number; fired: Record<string, number>; fightMs: number; mismatch: number }
function replica(h: SaveData, c: TierCfg, starts: number, tweak?: (x: { build: HuntCombatBuild; timeline: HuntTimeline }) => void): Replica {
  const zone = getHuntingZone(c.zone)!;
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = c.pin;
  try {
    const out: Replica = { kills: 0, defeats: 0, hours: 0, fired: {}, fightMs: 0, mismatch: 0 };
    for (let i = 0; i < starts; i++) {
      const { save, t0 } = startSave(h, c.zone, c.pin, i);
      const st = computeHuntingStatus(save, t0 + 4 * 3600 * 1000);
      const session = save.huntSession!;
      const startedAt = save.huntingOfflineStart;
      const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup(save, zone, DEPTH, session, startedAt, relativeWindows(session.pass, startedAt));
      tweak?.({ build, timeline });
      const r = simulateHuntingSession(build, zoneCfg, getHuntProgress(save, zone.id, DEPTH), st.pendingMs, potionCfg, `${save.huntingOfflineStart}:${zone.id}:${DEPTH}`, { maxLevel: T.hunting.subLevels, requiredWins: huntPromotionRequiredWins }, timeline);
      if (!tweak && r.kills !== st.kills) out.mismatch++;
      out.kills += r.kills;
      out.defeats += r.defeats;
      out.hours += st.pendingMs / 3600_000;
      out.fightMs += st.pendingMs;
      for (const [id, n] of Object.entries(r.abilityFired ?? {})) out.fired[id] = (out.fired[id] ?? 0) + (n as number);
    }
    return out;
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}

it('prints whether carry and dodge grow with the attack speed, and how much of the crossbow lead they are', () => {
  const out: string[] = [];
  const emit = (...l: string[]) => out.push(...l);
  emit(
    '=== COMO LER ===',
    'Caca = abates por hora (4 h, motor real de Cacada, sessoes semeadas). Chefe = velocidade media dos 4 chefes (motor real da masmorra, heroi imortal). Andares = andar mais fundo (motor real da masmorra).',
    'Mesmas 12 builds, mesma zona, mesmo sub-nivel, mesmas sementes de classAxesWide.tool.ts. "3 inicios" e o numero do guarda (reproduz o +11,5% / +9,0%); "12 inicios" tem as mesmas 3 sessoes mais 9: menos ruido.',
    'TUDO medido rodando o motor, exceto a secao 5 (conta no papel). Nenhum numero do jogo foi alterado: os tunables sao trocados por uma chamada e devolvidos num finally.',
    '',
  );

  const results: Record<number, Record<string, Meas[]>> = {};
  const ctxs: Record<number, Ctx[]> = {};
  for (const c of TIERS) {
    const t0 = Date.now();
    const heroes = BUILDS.map((b) => heroOf(b, c));
    const heroMsAll = heroes.map((h) => buildCombatStats(h).heroMs);
    const ref = MAINS.reduce((a, i) => a + heroMsAll[i], 0) / MAINS.length;
    ctxs[c.tier] = heroes.map((_, i) => ({ level: c.level, ref, heroMs: heroMsAll[i] }));
    results[c.tier] = {};
    for (const s of SCN) results[c.tier][s.id] = heroes.map((h, i) => measure(h, c, ctxs[c.tier][i], s, 0, STARTS_WIDE, { boss: true, depth: true }));
    emit(`(${c.label}: 7 cenarios x 6 builds medidos em ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  emit('');

  // ------------------------------------------------------------------------------------------------------------------------------------------------------
  emit('=== 1. ROTACAO E DISPAROS (motor de Cacada, 12 inicios de 4 h, cenario S0) ===');
  emit('  disparos/h = quantas vezes cada habilidade dispara por hora de luta. golpes/luta = (tempo/lutas) / golpe base. A Esquiva: fatia de tempo com haste ligada = disparos x 4000 ms / tempo; nominal = 4000 / (16000 x cdScale).');
  let mismatchTotal = 0;
  const dodgeUpBy: Record<string, number> = {}; // realized share of the time the dodge haste is up, by tier:build index
  for (const c of TIERS) {
    emit(`  --- ${c.label} ---   cdScale do nivel ${c.level}: ${abilityCdScale(c.level)}`);
    BUILDS.forEach((b, i) => {
      const h = heroOf(b, c);
      const cs = buildCombatStats(h);
      const r = replica(h, c, STARTS_WIDE);
      mismatchTotal += r.mismatch;
      const fires = Object.entries(r.fired).map(([id, n]) => `${id} ${(n / r.hours).toFixed(0)}`).join(', ');
      const swings = r.fightMs / Math.max(1, r.kills + r.defeats) / cs.heroMs;
      const dodgeUp = ((r.fired.dodge ?? 0) * T.abilities.dodgeHasteMs) / r.fightMs;
      dodgeUpBy[`${c.tier}:${i}`] = dodgeUp;
      emit(`  ${pad(b.id, 19)} rotacao [${(cs.rotation ?? []).join(', ')}]  golpe ${cs.heroMs.toFixed(0)} ms  golpes/luta ${swings.toFixed(2)}  derrotas ${r.defeats}`);
      emit(`  ${pad('', 19)}   disparos/h: ${fires}${r.fired.dodge ? `   | Esquiva: haste ligada ${(dodgeUp * 100).toFixed(1)}% do tempo (nominal ${((T.abilities.dodgeHasteMs / (T.abilities.dodgeCdMs * abilityCdScale(c.level))) * 100).toFixed(1)}%)` : ''}`);
    });
  }
  emit(`  Conferencia da replica contra computeHuntingStatus: ${mismatchTotal === 0 ? 'abates IDENTICOS em todas as sessoes (0 divergencias)' : `${mismatchTotal} SESSOES DIVERGEM`}`);
  emit('');

  // ------------------------------------------------------------------------------------------------------------------------------------------------------
  emit('=== 2. TABELA A: quanto cada build muda de valor em cada cenario (positivo = melhor; Caca com 12 inicios; Chefe = media dos 4 chefes de velocidade; Andares = diferenca de andares) ===');
  for (const c of TIERS) {
    emit(`  --- ${c.label} ---`);
    const r = results[c.tier];
    for (const ax of ['hunting', 'boss', 'depth'] as const) {
      const title = ax === 'hunting' ? 'CACA (abates/h, 12 inicios)' : ax === 'boss' ? 'CHEFE (velocidade media dos 4 chefes, media de 8 fases da recarga: aquecimentos 2 a 9)' : 'ANDARES (andar mais fundo)';
      emit(`  ${title}`);
      emit(`  ${pad('build', 19)}${lpad('S0 valor', 10)}${SCN.slice(1).map((s) => lpad(`${s.id} ${s.label}`, 27)).join('')}`);
      BUILDS.forEach((b, i) => {
        const base = r.S0[i];
        const cells = SCN.slice(1).map((s) => {
          const m = r[s.id][i];
          const d = ax === 'hunting' ? kphOf(m.sess, STARTS_WIDE) / kphOf(base.sess, STARTS_WIDE) - 1 : ax === 'boss' ? bossMean(m.phased, base.phased) : m.reach / base.reach - 1;
          const extra = ax === 'depth' ? ` (${m.reach - base.reach >= 0 ? '+' : ''}${m.reach - base.reach} and.)` : '';
          return lpad(pct(d) + extra, 27);
        });
        const v0 = ax === 'hunting' ? `${kphOf(base.sess, STARTS_WIDE).toFixed(0)}/h` : ax === 'boss' ? `${(base.phased.reduce((a, s) => a + 1 / s, 0) / base.phased.length / 1000).toFixed(1)} s` : `and. ${base.reach}`;
        emit(`  ${pad(b.id, 19)}${lpad(v0, 10)}${cells.join('')}`);
      });
      emit('');
    }
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------------------
  emit('=== 3. TABELA B: a lideranca da besta sobre o mago na Caca, e o lider de cada eixo, em cada cenario ===');
  emit('  lead = valor da besta / valor do mago - 1 (Caca). "sobra" = lead do cenario / lead de S0. lider = a build de maior valor entre as 6 (margem sobre a 2a).');
  const leads: Record<number, Record<string, { l3: number; l12: number }>> = {};
  for (const c of TIERS) {
    leads[c.tier] = {};
    emit(`  --- ${c.label} ---`);
    emit(`  ${pad('cenario', 26)}${lpad('besta vs mago (3)', 19)}${lpad('(12 inicios)', 14)}${lpad('sobra (3)', 11)}   ${pad('lider Caca (3 inicios)', 36)}${pad('lider Chefe (guarda, 1 fase)', 33)}${pad('lider Chefe (8 fases)', 33)}${pad('lider Andares', 28)}`);
    const r = results[c.tier];
    const base3 = kphOf(r.S0[IDX.crossbow].sess, STARTS_GUARD) / kphOf(r.S0[IDX.staff].sess, STARTS_GUARD) - 1;
    for (const s of SCN) {
      const m = r[s.id];
      const l3 = kphOf(m[IDX.crossbow].sess, STARTS_GUARD) / kphOf(m[IDX.staff].sess, STARTS_GUARD) - 1;
      const l12 = kphOf(m[IDX.crossbow].sess, STARTS_WIDE) / kphOf(m[IDX.staff].sess, STARTS_WIDE) - 1;
      leads[c.tier][s.id] = { l3, l12 };
      const leader = (vals: number[]): string => {
        const order = vals.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
        return `${BUILDS[order[0].i].id} ${pct(order[0].v / order[1].v - 1)}`;
      };
      // Chefe: each build's speed index against the mean of the three mains at that boss, averaged over the four bosses (the guard's reference).
      const idxOf = (get: (x: Meas) => number[]): number[] => BUILDS.map((_, i) => get(m[i]).reduce((a, sp, k) => a + sp / (MAINS.reduce((z, j) => z + get(m[j])[k], 0) / MAINS.length), 0) / BOSSES.length);
      const bossIdx = idxOf((x) => x.speeds);
      const bossIdxPh = idxOf((x) => x.phased);
      emit(`  ${pad(`${s.id} ${s.label}`, 26)}${lpad(pct(l3), 19)}${lpad(pct(l12), 14)}${lpad(`${((l3 / base3) * 100).toFixed(0)}%`, 11)}   ${pad(leader(m.map((x) => kphOf(x.sess, STARTS_GUARD))), 36)}${pad(leader(bossIdx), 33)}${pad(leader(bossIdxPh), 33)}${pad(leader(m.map((x) => x.reach)), 28)}`);
    }
    emit('');
  }
  emit('  Quem pesa mais no lead da besta (pontos percentuais, 3 inicios; positivo = o lead da besta CAI quando o efeito e tirado):');
  for (const c of TIERS) {
    const L = leads[c.tier];
    emit(`    T${c.tier}: S0 ${pct(L.S0.l3)} | sem Esquiva (S2) ${pct(L.S2.l3)} -> a Esquiva vale ${((L.S0.l3 - L.S2.l3) * 100).toFixed(1)} pp | sem transbordo (S1) ${pct(L.S1.l3)} -> o transbordo vale ${((L.S0.l3 - L.S1.l3) * 100).toFixed(1)} pp (negativo = tirar o transbordo AUMENTA o lead) | sem os dois (S3) ${pct(L.S3.l3)}`);
    emit(`        por tempo: Esquiva (S4) ${pct(L.S4.l3)} (${((L.S0.l3 - L.S4.l3) * 100).toFixed(1)} pp) | transbordo (S5) ${pct(L.S5.l3)} (${((L.S0.l3 - L.S5.l3) * 100).toFixed(1)} pp) | os dois (S6) ${pct(L.S6.l3)} (${((L.S0.l3 - L.S6.l3) * 100).toFixed(1)} pp)`);
  }
  emit('');

  // ------------------------------------------------------------------------------------------------------------------------------------------------------
  emit('=== 4. VARREDURA DE VELOCIDADE: o efeito cresce quando o heroi fica mais rapido? ===');
  emit('  A mesma build medida com o Tonico de Pressa de +0 / +15 / +30% de velocidade. R = valor com o efeito / valor sem o efeito. Se R sobe com a velocidade, o efeito escala com ela; se fica plano, nao. +-erro = erro padrao da media dos 12 inicios (a inclinacao so conta se passar de ~2 erros). Chefe = media de 8 fases da recarga.');
  emit('  Esquiva: R = S0 / S2 nas duas builds de arqueiro. Transbordo: R = S0 / S1 nas builds que tem transbordo (cajado, cetro, machado). Controle: o arqueiro no transbordo e o mago na Esquiva devem dar R = 1.000.');
  const SPEEDS = [0, 0.15, 0.3];
  const sweepSpecs: { idx: number; effect: 'dodge' | 'carry'; off: string }[] = [
    { idx: IDX.bow, effect: 'dodge', off: 'S2' }, { idx: IDX.crossbow, effect: 'dodge', off: 'S2' },
    { idx: IDX.staff, effect: 'carry', off: 'S1' }, { idx: IDX.scepter, effect: 'carry', off: 'S1' }, { idx: IDX.axe, effect: 'carry', off: 'S1' },
    { idx: IDX.bow, effect: 'carry', off: 'S1' }, { idx: IDX.staff, effect: 'dodge', off: 'S2' },
  ];
  for (const c of TIERS) {
    emit(`  --- ${c.label} ---`);
    emit(`  ${pad('build / efeito', 28)}${SPEEDS.map((v) => lpad(`Caca R @+${(v * 100).toFixed(0)}% (golpe ms)`, 29)).join('')}${lpad('Caca: R@+30% - R@+0%', 25)}${SPEEDS.map((v) => lpad(`Chefe R @+${(v * 100).toFixed(0)}%`, 15)).join('')}${lpad('Chefe: @+30% - @+0%', 21)}`);
    for (const sp of sweepSpecs) {
      const b = BUILDS[sp.idx];
      const h0 = heroOf(b, c);
      const ctx = ctxs[c.tier][sp.idx];
      const sOn = SCN.find((s) => s.id === 'S0')!;
      const sOff = SCN.find((s) => s.id === sp.off)!;
      const hunt: string[] = [];
      const boss: string[] = [];
      const hr: { r: number; se: number }[] = [];
      const br: number[] = [];
      for (const v of SPEEDS) {
        const on = measure(h0, c, ctx, sOn, v, STARTS_WIDE, { boss: true, depth: false });
        const off = measure(h0, c, ctx, sOff, v, STARTS_WIDE, { boss: true, depth: false });
        const ms = withPatch(v > 0 ? { tonics: { hasteAttackSpeed: v } } : {}, () => (v > 0 ? hasteIntervalMs(buildCombatStats(h0)) : buildCombatStats(h0).heroMs));
        const st = ratioStats(on.sess, off.sess);
        hr.push(st);
        hunt.push(lpad(`${st.r.toFixed(4)} +-${st.se.toFixed(3)} (${ms.toFixed(0)})`, 29));
        const bR = on.phased.reduce((a, sp, k) => a + sp / off.phased[k], 0) / on.phased.length;
        br.push(bR);
        boss.push(lpad(bR.toFixed(4), 15));
      }
      const dH = hr[2].r - hr[0].r;
      const dSe = Math.hypot(hr[0].se, hr[2].se);
      emit(`  ${pad(`${b.id} / ${sp.effect === 'dodge' ? 'Esquiva' : 'transbordo'}`, 28)}${hunt.join('')}${lpad(`${dH >= 0 ? '+' : ''}${dH.toFixed(3)} +-${dSe.toFixed(3)}`, 25)}${boss.join('')}${lpad(`${br[2] - br[0] >= 0 ? '+' : ''}${(br[2] - br[0]).toFixed(3)}`, 21)}`);
    }
    emit('');
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------------------
  emit('=== 5. CONTA NO PAPEL (nao e medicao: aritmetica sobre os tunables e os numeros do motor impressos acima) ===');
  const a = T.abilities as unknown as Record<string, number>;
  emit('  ONDE ENTRA NO CODIGO');
  emit('   Transbordo: abilities.ts:284-286 enche o balde com round(base x pct) a cada disparo (base = dano DAQUELE golpe); abilities.ts:309-316 (startAbilityFight) esvazia o balde no proximo inimigo, no maximo carryCapPct (70%) da vida dele;');
  emit('     huntCombat.ts:348-352 e driver.ts:188-190 chamam isso no inicio de cada luta. Unidade: POR DISPARO (uma fracao de um golpe); disparos por hora = limitado pela recarga em ms (abilities.ts:266), nao pelos golpes.');
  emit('   Esquiva:    abilities.ts:151-152 (definicao), 294-297 (liga hasteUntil = agora + durationMs), 324-326 (hastedMs: intervalo / (1 + pct), piso heroMinMs 400). Unidade: POR TEMPO (35% de velocidade por 4000 ms a cada 16000 ms x cdScale).');
  emit('   Nenhum dos dois entra "por golpe acumulado": o relogio das habilidades (readyAt, hasteUntil) corre em ms; um golpe so decide QUANDO a habilidade pronta dispara (o primeiro golpe depois da recarga).');
  emit('   Resto de tempo entre golpes: nao existe. huntCombat.ts:354 e driver.ts:196 recomecam o relogio do heroi (heroNext = heroMs) a cada luta; nada atravessa de uma luta para a outra alem do relogio das habilidades, do balde e da Furia.');
  emit('   O jogo real (BattleModal.tsx:604-608, por quadro de tela) faz heroNextAtkRef = now em vez de += intervalo: o resto de tempo e DESCARTADO, cada golpe atrasa em media meio quadro (~8 ms a 60 fps), o que pesa mais no heroi rapido (~1,5% a 569 ms, ~1,0% a 857 ms)');
  emit('     e o dobro na velocidade 2x. O simulador (driver.ts) usa tempos exatos e nao ve isso. SO LIDO NO CODIGO, nao medido aqui.');
  emit('');
  for (const c of TIERS) {
    const cs = abilityCdScale(c.level);
    const heroMs = BUILDS.map((b) => buildCombatStats(heroOf(b, c)).heroMs);
    const ref = ctxs[c.tier][0].ref;
    const nomUp = a.dodgeHasteMs / (a.dodgeCdMs * cs);
    emit(`  --- ${c.label}: cdScale ${cs}, REF (media dos golpes das 3 principais) ${ref.toFixed(0)} ms ---`);
    emit(`   Esquiva: haste ${a.dodgeHastePct} por ${a.dodgeHasteMs} ms a cada ${a.dodgeCdMs} x ${cs} = ${(a.dodgeCdMs * cs).toFixed(0)} ms -> fatia nominal ${(nomUp * 100).toFixed(2)}%, ganho medio de velocidade = ${a.dodgeHastePct} x ${(nomUp * 100).toFixed(2)}% = ${(a.dodgeHastePct * nomUp * 100).toFixed(2)}% (INDEPENDE do golpe base da build).`);
    emit(`     So depende da velocidade por: (a) atraso ate o primeiro golpe depois da recarga (em media meio golpe: ${(heroMs[IDX.bow] / 2).toFixed(0)} ms no arco, ${(heroMs[IDX.crossbow] / 2).toFixed(0)} ms na besta, sobre ${(a.dodgeCdMs * cs).toFixed(0)} ms de ciclo = ${((heroMs[IDX.bow] / 2 / (a.dodgeCdMs * cs)) * 100).toFixed(1)}% / ${((heroMs[IDX.crossbow] / 2 / (a.dodgeCdMs * cs)) * 100).toFixed(1)}% do ciclo: o atraso tira mais haste do golpe LENTO, entao se ha vies e a favor do rapido, mas de ~0,3 ponto); (b) piso de 400 ms: arco ${heroMs[IDX.bow].toFixed(0)} ms -> ${Math.max(400, heroMs[IDX.bow] / (1 + a.dodgeHastePct)).toFixed(0)} ms com haste.`);
    for (const bi of [IDX.bow, IDX.crossbow]) {
      const up = dodgeUpBy[`${c.tier}:${bi}`];
      const rm = kphOf(results[c.tier].S0[bi].sess, STARTS_WIDE) / kphOf(results[c.tier].S2[bi].sess, STARTS_WIDE);
      emit(`   CONFERENCIA no papel x motor, ${pad(BUILDS[bi].id, 18)}: fatia de haste REALIZADA ${(up * 100).toFixed(1)}% (secao 1) -> abates/h previstos 1 + ${a.dodgeHastePct} x ${(up * 100).toFixed(1)}% = ${(1 + a.dodgeHastePct * up).toFixed(4)}   |   medido no motor (S0 / S2, Caca, 12 inicios) ${rm.toFixed(4)}   |   diferenca ${((rm - (1 + a.dodgeHastePct * up)) * 100).toFixed(1)} pp`);
    }
    const carryList: [string, string, string, string][] = [['arcane_burst', 'arcaneBurstPct', 'arcaneBurstCdMs', 'cajado'], ['nova', 'novaPct', 'novaCdMs', 'cajado'], ['dark_pulse', 'darkPulsePct', 'darkPulseCdMs', 'cetro'], ['brutal_spin', 'brutalSpinPct', 'brutalSpinCdMs', 'machado']];
    for (const [id, pk, ck, who] of carryList) {
      const perDps = (a[pk] * (who === 'cajado' ? heroMs[IDX.staff] : who === 'cetro' ? heroMs[IDX.scepter] : heroMs[IDX.axe])) / (a[ck] * cs);
      emit(`   Transbordo ${pad(id, 13)} (${who}): ${a[pk]} x um golpe a cada ${(a[ck] * cs).toFixed(0)} ms -> teto de ${(perDps * 100).toFixed(1)}% do dano por tempo da build (= pct x intervalo do golpe / recarga, se disparasse a cada recarga e o balde nunca enchesse: e um TETO, nao uma previsao); sobe com o golpe LENTO, nao com o rapido.`);
    }
    emit(`   Mesmo transbordo a REF em vez do golpe da build (S5): fator REF/golpe = mago ${(ref / heroMs[IDX.staff]).toFixed(3)}, cetro ${(ref / heroMs[IDX.scepter]).toFixed(3)}, machado ${(ref / heroMs[IDX.axe]).toFixed(3)}, guerreiro ${(ref / heroMs[IDX.warrior]).toFixed(3)}.`);
  }
  emit('');

  // ------------------------------------------------------------------------------------------------------------------------------------------------------
  emit('=== 6. BONUS (nao foi pedido, apareceu ao procurar): a quantizacao do abate por golpe ===');
  emit('  O abate so acontece NO golpe que zera a vida (huntCombat.ts:373-401 e 366): o tempo da luta e sempre um multiplo inteiro do golpe, e o dano que sobra no ultimo golpe e jogado fora. Mede-se aqui, SEM habilidades (rotacao vazia), quanto o');
  emit('  abates/h sobem quando o mesmo dano por tempo e dividido em golpes k vezes menores e k vezes mais rapidos (heroMs/k, dano/k, mesma vida, mesmo dano por tempo): k=1 e a build como e; k=8 quase sem quantizacao.');
  emit(`  ${pad('build', 19)}${lpad('golpes/luta', 12)}${[1, 2, 4, 8].map((k) => lpad(`k=${k} abates/h`, 14)).join('')}${lpad('k=8 vs k=1', 12)}`);
  for (const c of TIERS) {
    emit(`  --- ${c.label} ---`);
    BUILDS.forEach((b) => {
      const bare = { ...heroOf(b, c), rotation: [] } as unknown as SaveData;
      const kph: number[] = [];
      let swings = 0;
      for (const k of [1, 2, 4, 8]) {
        const r = replica(bare, c, 6, (x) => {
          x.build.heroMs /= k;
          x.build.heroDmgBase /= k;
          x.timeline.dmgStrength /= k;
          x.timeline.dmgAttack /= k;
          x.timeline.dmgBoth /= k;
        });
        kph.push(r.kills / r.hours);
        if (k === 1) swings = r.fightMs / Math.max(1, r.kills + r.defeats) / buildCombatStats(bare).heroMs;
      }
      emit(`  ${pad(b.id, 19)}${lpad(swings.toFixed(2), 12)}${kph.map((v) => lpad(v.toFixed(0), 14)).join('')}${lpad(pct(kph[3] / kph[0] - 1), 12)}`);
    });
  }
  console.log(String.fromCharCode(10) + out.join(String.fromCharCode(10)));
}, 3_600_000);
