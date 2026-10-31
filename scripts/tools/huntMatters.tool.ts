// WHAT MAKES A DIFFERENCE IN THE HUNT (measurement only: it prints, it asserts nothing, it changes no number of the game). The owner's question of 31/10: do rarity, status, abilities, tactics and skills matter
// where the players spend their time? Every row runs the real Hunting engine (computeHuntingStatus over a session of 4 h, 2 session starts) on a hero of scripts/sim/classHero.ts changed in ONE thing.
//   lugar   the hardest place (zone, depth, sub-level) the COMMON hero of that class and tier wins at least 95% of its fights: every row of the block is read there, so the rows compare like with like.
//   k/h, win, xp/h, mat/h   what the variant earns on that place.
//   teto    the hardest place the variant itself holds at 95% (how far it can push): a higher place pays more.
// Run: npx vitest run --config vitest.sim.config.ts huntMatters --silent=false --reporter=default
import { it } from 'vitest';
import { buildCombatStats, buildHuntSession, computeCP, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { HUNTING_ZONES, HuntingDepth } from '../../src/game/huntingZones';
import { addRank, addRankBlock, skillPointsEarned, SkillRanks, skillsOfPath, SkillPathId } from '../../src/game/heroSkills';
import { medianSubstatValue, Rarity, rarityDef, Substat, SUBSTATS } from '../../src/game/rarity';
import { GEAR, getGear } from '../../src/game/gear';
import { MATERIALS } from '../../src/game/materials';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import { PLANTS } from '../../src/game/garden';
import { REFINING_RECIPES } from '../../src/game/refining';
import { POTION_RECIPES } from '../../src/game/potions';
import T from '../../src/game/tunables';
import { CLASS_MAIN, classHero, ClassBuild } from '../sim/classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const DEPTHS: HuntingDepth[] = ['shallow', 'dense', 'deep'];
const SUBS = T.hunting.subLevels;
interface Spot {
  zoneId: string;
  depth: HuntingDepth;
  sub: number;
}
const LADDER: Spot[] = HUNTING_ZONES.flatMap((z) => DEPTHS.flatMap((depth) => Array.from({ length: SUBS }, (_, i) => ({ zoneId: z.id, depth, sub: i + 1 }))));
const spotName = (s: Spot) => `${s.zoneId.replace(/_/g, '-')}/${s.depth}/${s.sub}`;

interface Read {
  kph: number;
  win: number;
  xp: number;
  gold: number;
  mats: number;
}
const memo = new Map<string, Read>();
function read(h: SaveData, s: Spot): Read {
  const key = `${JSON.stringify(buildCombatStats(h))}|${h.blessed}|${s.zoneId}|${s.depth}|${s.sub}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = s.sub; // pinned: the session cannot promote, the place stays the place
  try {
    const r: Read = { kph: 0, win: 0, xp: 0, gold: 0, mats: 0 };
    let kills = 0;
    let defeats = 0;
    let hours = 0;
    for (let i = 0; i < 2; i++) {
      const t0 = NOW + i * 7_919_000;
      let save: SaveData = { ...h, activeHuntingZone: s.zoneId, activeHuntingDepth: s.depth, huntingOfflineStart: t0 };
      save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(s.zoneId, s.depth)]: { ceiling: s.sub, promotionWins: 0 } } };
      save = { ...save, huntSession: buildHuntSession(save, t0) };
      const st = computeHuntingStatus(save, t0 + 4 * 3600 * 1000);
      kills += st.kills;
      defeats += st.defeats;
      hours += st.pendingMs / 3600_000;
      r.xp += st.xpReady;
      r.gold += st.goldReady;
      for (const n of Object.values(st.drops)) r.mats += n ?? 0;
    }
    r.kph = kills / hours;
    r.xp /= hours;
    r.gold /= hours;
    r.mats /= hours;
    r.win = kills + defeats > 0 ? kills / (kills + defeats) : 0;
    memo.set(key, r);
    return r;
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}
// The hardest place held at 95%, by bisection over the ladder (it is close enough to monotonic for a table).
function ceilingOf(h: SaveData): number {
  let lo = -1;
  let hi = LADDER.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    const r = read(h, LADDER[mid]);
    if (r.kph > 0 && r.win >= 0.95) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? '+' : ''}${Math.round((a / b - 1) * 100)}%` : 'n/a');
const pad = (v: string | number, n: number) => String(v).padStart(n);

function row(label: string, h: SaveData, base: Read, spot: Spot, baseCeil: number) {
  const r = read(h, spot);
  const c = ceilingOf(h);
  const st = buildCombatStats(h);
  const place = c >= 0 ? spotName(LADDER[c]) : 'nenhum';
  console.log(
    `${label.padEnd(34)}${pad(Math.round(computeCP(h)), 6)}${pad(Math.round(st.dmgBase), 6)}${pad(Math.round(st.maxHp), 7)}${pad(r.kph.toFixed(0), 6)} ${pad(pct(r.kph, base.kph), 6)}${pad(`${(r.win * 100).toFixed(0)}%`, 6)}${pad(r.xp.toFixed(0), 8)} ${pad(pct(r.xp, base.xp), 6)}${pad(r.mats.toFixed(0), 7)} ${pad(pct(r.mats, base.mats), 6)}  ${place} (${c - baseCeil >= 0 ? '+' : ''}${c - baseCeil})`,
  );
}

// one piece changed in rarity, with the median substats of that rarity, as classHero does for the whole set
function slotRarity(h: SaveData, slot: string, rarity: Rarity): SaveData {
  const eq = h.equipped as unknown as Record<string, string>;
  const id = eq[slot];
  const old = h.gearInstances[id];
  if (!old) return h;
  const def = rarityDef(rarity);
  const order = ['critRate', 'maxHp', 'defense', 'critDamage', 'lifesteal'] as const;
  const subs: Substat[] = order.slice(0, def.substatCount).map((type) => ({ type, value: medianSubstatValue(SUBSTATS.find((x) => x.type === type)!, getGear(old.templateId).tier ?? 1, def.substatMult) }));
  return { ...h, gearInstances: { ...h.gearInstances, [id]: createGearInstance(old.templateId, { id, origin: 'craft', rarity, substats: subs, upgrade: old.upgrade }) } };
}
function skills(h: SaveData, level: number, path: SkillPathId): SaveData {
  let ranks: SkillRanks = {};
  let left = skillPointsEarned(level);
  for (let guard = 0; guard < 200 && left > 0; guard++) {
    const s = skillsOfPath(path).find((x) => !addRankBlock(ranks, x.id, left));
    if (!s) break;
    ranks = addRank(ranks, s.id);
    left--;
  }
  return { ...h, skillTree: { active: 0, sets: [ranks, {}], respecUsed: false } };
}
const attrs = (h: SaveData, k: 'str' | 'vit' | 'agi' | 'res'): SaveData => {
  const total = h.str + h.vit + h.agi + h.res;
  return { ...h, str: k === 'str' ? total : 0, vit: k === 'vit' ? total : 0, agi: k === 'agi' ? total : 0, res: k === 'res' ? total : 0 };
};

function block(b: ClassBuild, tier: number, level: number) {
  const base = classHero(b, level, tier, 0, 'real', 100, 'common');
  const c0 = ceilingOf(base);
  const spot = LADDER[Math.max(0, c0)];
  const r0 = read(base, spot);
  console.log(`\n===== ${b.id} tier ${tier} nivel ${level} | lugar: ${spotName(spot)} =====`);
  console.log(`${''.padEnd(34)}${pad('CP', 6)}${pad('dano', 6)}${pad('vida', 7)}${pad('k/h', 6)} ${pad('', 6)}${pad('win', 6)}${pad('xp/h', 8)} ${pad('', 6)}${pad('mat/h', 7)} ${pad('', 6)}  teto`);
  row('tudo comum (referencia)', base, r0, spot, c0);
  for (const rar of ['rare', 'epic', 'legendary'] as Rarity[]) row(`conjunto inteiro ${rar}`, classHero(b, level, tier, 0, 'real', 100, rar), r0, spot, c0);
  for (const slot of Object.keys(base.equipped)) row(`so ${slot} lendario`, slotRarity(base, slot, 'legendary'), r0, spot, c0);
  row('refino +3', classHero(b, level, tier, 3), r0, spot, c0);
  row('refino +6', classHero(b, level, tier, 6), r0, spot, c0);
  if (tier > 1) row('um tier abaixo', classHero(b, level, tier - 1, 0), r0, spot, c0);
  const rot = buildCombatStats(base).rotation ?? [];
  row('sem nenhuma habilidade', { ...base, rotation: [] }, r0, spot, c0);
  for (const a of rot) row(`so a habilidade ${a}`, { ...base, rotation: [a] }, r0, spot, c0);
  row('taticas: ordem invertida', { ...base, rotation: [...rot].reverse() }, r0, spot, c0);
  for (const p of ['warrior', 'guardian', 'hunter'] as SkillPathId[]) row(`pontos de habilidade: ${p}`, skills(base, level, p), r0, spot, c0);
  for (const k of ['str', 'vit', 'agi', 'res'] as const) row(`atributos: tudo em ${k}`, attrs(base, k), r0, spot, c0);
}

it('what makes a difference in the Hunt', () => {
  const tiers = (process.env.HM_TIERS ?? '2:20,4:42,6:60').split(',').map((x) => x.split(':').map(Number));
  for (const [tier, level] of tiers) for (const b of CLASS_MAIN) block(b, tier, level);
});

// The order of the abilities (Taticas): every order of the four the gear grants, 8 session starts each, at the hero's own ceiling and three steps past it (where the fight is close and a guard or a heal in time could count).
function perms<X>(a: X[]): X[][] {
  return a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}
it('the order of the abilities', () => {
  for (const [tier, level] of [[2, 20], [4, 42], [6, 60]] as const) {
    for (const b of CLASS_MAIN) {
      const base = classHero(b, level, tier, 0);
      const rot = buildCombatStats(base).rotation ?? [];
      const c = ceilingOf(base);
      for (const [name, idx] of [['teto', c], ['teto+3', Math.min(LADDER.length - 1, c + 3)]] as const) {
        const rows = perms(rot).map((p) => ({ p, r: read({ ...base, rotation: p }, LADDER[idx]) })).sort((x, y) => y.r.kph - x.r.kph);
        const best = rows[0];
        const worst = rows[rows.length - 1];
        console.log(`ORDEM ${b.id} t${tier} ${name} ${spotName(LADDER[idx])}: melhor ${best.r.kph.toFixed(0)} k/h win ${(best.r.win * 100).toFixed(0)}% [${best.p.join(' ')}] | pior ${worst.r.kph.toFixed(0)} k/h win ${(worst.r.win * 100).toFixed(0)}% [${worst.p.join(' ')}]`);
      }
    }
  }
});

// A point moved: 20 points taken evenly from the other three and put in one, what that does at the hero's ceiling.
it('one attribute point against another', () => {
  for (const [tier, level] of [[4, 42]] as const) {
    for (const b of CLASS_MAIN) {
      const base = classHero(b, level, tier, 0);
      const spot = LADDER[Math.max(0, ceilingOf(base))];
      const r0 = read(base, spot);
      console.log(`ATRIB ${b.id}: base str ${base.str} vit ${base.vit} agi ${base.agi} res ${base.res} heroMs ${buildCombatStats(base).heroMs.toFixed(0)} | ${r0.kph.toFixed(0)} k/h win ${(r0.win * 100).toFixed(0)}%`);
      for (const k of ['str', 'vit', 'agi', 'res'] as const) {
        const others = (['str', 'vit', 'agi', 'res'] as const).filter((o) => o !== k);
        const moved: SaveData = { ...base, [k]: base[k] + 21, ...Object.fromEntries(others.map((o) => [o, Math.max(0, base[o] - 7)])) };
        const r = read(moved, spot);
        const st = buildCombatStats(moved);
        console.log(`  +21 ${k}: dano ${st.dmgBase.toFixed(0)} vida ${st.maxHp} ms ${st.heroMs.toFixed(0)} red ${st.reduction.toFixed(3)} | ${r.kph.toFixed(0)} k/h (${pct(r.kph, r0.kph)}) win ${(r.win * 100).toFixed(0)}% teto ${ceilingOf(moved) - ceilingOf(base)}`);
      }
    }
  }
});

// What a player actually lives on: each hero on the hardest place IT holds, and the rest of the gear questions.
it('common against legendary, each on its own place', () => {
  for (const [tier, level] of [[2, 20], [4, 42], [6, 60]] as const) {
    for (const b of CLASS_MAIN) {
      for (const rar of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
        const h = classHero(b, level, tier, 0, 'real', 100, rar);
        const c = ceilingOf(h);
        const r = read(h, LADDER[Math.max(0, c)]);
        console.log(`PROPRIO ${b.id} t${tier} ${rar.padEnd(10)} ${spotName(LADDER[Math.max(0, c)]).padEnd(26)} ${r.kph.toFixed(0).padStart(4)} k/h  ${r.xp.toFixed(0).padStart(6)} xp/h  ${r.gold.toFixed(0).padStart(6)} ouro/h  ${r.mats.toFixed(0).padStart(4)} mat/h`);
      }
    }
  }
  const base = classHero(CLASS_MAIN[0], 42, 4, 0);
  const spot = LADDER[Math.max(0, ceilingOf(base))];
  const r0 = read(base, spot);
  console.log('OUTROS guerreiro t4', spotName(spot), `${r0.kph.toFixed(0)} k/h`);
  const noAff = read({ ...base, noAffinity: true } as SaveData, spot);
  console.log(`  sem bonus de classe: ${noAff.kph.toFixed(0)} k/h (${pct(noAff.kph, r0.kph)}) win ${(noAff.win * 100).toFixed(0)}%`);
  for (const g of GEAR.filter((x) => x.slot === 'relic')) {
    const h = { ...base, equipped: { ...base.equipped, relic: g.id } } as SaveData;
    const r = read(h, spot);
    console.log(`  reliquia ${g.id}: ${r.kph.toFixed(0)} k/h (${pct(r.kph, r0.kph)}) xp ${pct(r.xp, r0.xp)} win ${(r.win * 100).toFixed(0)}%`);
  }
});

// Every material: where it comes from and what it is for (read from the game's own tables), then what each Hunting zone really dropped in 6 h of the strongest hero.
it('materials', () => {
  const has = (o: unknown, id: string) => JSON.stringify(o).includes(`"${id}"`);
  const zones = (id: string) => HUNTING_ZONES.filter((z) => z.drops.some((d) => d.material === id)).map((z) => z.id);
  for (const m of MATERIALS) {
    const from: string[] = [];
    if (zones(m.id).length) from.push(`caca(${zones(m.id).length})`);
    if (has(ORE_TIERS, m.id)) from.push('mina');
    if (has(WOOD_TIERS, m.id)) from.push('lenha');
    if (has(PLANTS, m.id)) from.push('horta');
    if (REFINING_RECIPES.some((r) => r.output === m.id)) from.push('refino');
    const to: string[] = [];
    const forge = GEAR.filter((g) => g.recipe && has(g.recipe.materials ?? {}, m.id)).length;
    if (forge) to.push(`forja(${forge})`);
    if (REFINING_RECIPES.some((r) => has(r.input ?? {}, m.id))) to.push('refino');
    if (POTION_RECIPES.some((r) => has(r, m.id))) to.push('pocao');
    console.log(`MAT ${m.id.padEnd(22)} de: ${(from.join(' ') || 'NADA').padEnd(26)} para: ${to.join(' ') || 'NADA'}`);
  }
  const strong = classHero(CLASS_MAIN[0], 75, 6, 6, 'real', 100, 'legendary');
  for (const z of HUNTING_ZONES) {
    for (const depth of DEPTHS) {
      const saved = T.hunting.subLevels;
      (T.hunting as { subLevels: number }).subLevels = 1;
      let save: SaveData = { ...strong, activeHuntingZone: z.id, activeHuntingDepth: depth, huntingOfflineStart: NOW };
      save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(z.id, depth)]: { ceiling: 1, promotionWins: 0 } } };
      save = { ...save, huntSession: buildHuntSession(save, NOW) };
      const st = computeHuntingStatus(save, NOW + 6 * 3600 * 1000);
      (T.hunting as { subLevels: number }).subLevels = saved;
      const missing = z.drops.filter((d) => !(st.drops[d.material] ?? 0)).map((d) => `${d.material}(${d.rarity})`);
      console.log(`DROP ${z.id}/${depth}: ${st.kills} vitorias | caiu ${Object.keys(st.drops).length} de ${z.drops.length}${missing.length ? ` | nao caiu: ${missing.join(' ')}` : ''}`);
    }
  }
});

// If the hero could line up only 3 of the 4 abilities: what leaving each one out does (is that a real choice?). And each rarity on the place that pays it the most XP among those it holds at 95%.
it('choice of three', () => {
  for (const [tier, level] of [[4, 42], [6, 60]] as const) {
    for (const b of CLASS_MAIN) {
      const base = classHero(b, level, tier, 0);
      const rot = buildCombatStats(base).rotation ?? [];
      const out = rot.map((a) => {
        const h = { ...base, rotation: rot.filter((x) => x !== a) };
        return `${a}: teto ${ceilingOf(h) - ceilingOf(base)}, ${read(h, LADDER[Math.max(0, ceilingOf(h))]).kph.toFixed(0)} k/h`;
      });
      console.log(`TRES ${b.id} t${tier} (com as 4: ${read(base, LADDER[Math.max(0, ceilingOf(base))]).kph.toFixed(0)} k/h) sem ${out.join(' | sem ')}`);
      const noAff = read({ ...base, noAffinity: true } as SaveData, LADDER[Math.max(0, ceilingOf(base))]);
      console.log(`  sem bonus de classe ${b.id}: ${noAff.kph.toFixed(0)} k/h win ${(noAff.win * 100).toFixed(0)}%`);
    }
  }
});
it('best place of each rarity', () => {
  for (const [tier, level] of [[2, 20], [4, 42], [6, 60]] as const) {
    for (const b of CLASS_MAIN) {
      for (const rar of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
        const h = classHero(b, level, tier, 0, 'real', 100, rar);
        const held = LADDER.map((s) => ({ s, r: read(h, s) })).filter((x) => x.r.kph > 0 && x.r.win >= 0.95);
        const bx = held.reduce((a, x) => (x.r.xp > a.r.xp ? x : a), held[0]);
        const bm = held.reduce((a, x) => (x.r.mats > a.r.mats ? x : a), held[0]);
        console.log(`MELHOR ${b.id} t${tier} ${rar.padEnd(10)} xp/h ${bx?.r.xp.toFixed(0).padStart(6)} em ${bx ? spotName(bx.s).padEnd(26) : ''} mat/h ${bm?.r.mats.toFixed(0).padStart(4)} em ${bm ? spotName(bm.s) : ''}`);
      }
    }
  }
});
