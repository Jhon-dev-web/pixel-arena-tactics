// Hero skill audit (docs/ITEM_BALANCE_AUDIT.md section I). Run it with `npm run sim:skills`; it prints Markdown tables and asserts nothing.
// Everything is measured through the REAL game code: buildCombatStats / computeCP for the numbers, the closed-form duel margin P of duel.ts (the exact quantity that
// decides every fight in the Dungeon and in Hunting, with bleed, strikes, block, Firm Stance and Last Bastion understood) for the "real combat value", and the Dungeon
// driver (runDungeon, the mirror of BattleModal) for the Monte-Carlo check of Last Bastion.
// SKILL_T='{"heavyBlowPct":0.015}' overrides T.heroSkills for the run (and SKILL_ADV='{"cpBastionWeight":0.2}' T.advanced), to tune without editing the file.
import { describe, it } from 'vitest';
import { computeCP, computeHuntingStatus, buildHuntSession, SaveData } from '../../src/game/engine';
import { getHuntingZone } from '../../src/game/huntingZones';
import { HERO_SKILLS, HeroSkillId, SKILL_PATH_IDS, SkillPathId, SkillRanks, getSkillDef, pointsSpent, rankOf, skillPointsEarned, skillsOfPath } from '../../src/game/heroSkills';
import { isDungeonBoss, isDungeonCheckpoint } from '../../src/game/dungeon';
import T from '../../src/game/tunables';
import { buildCombatStats } from '../../src/game/engine';
import { duel, repFloor } from './duel';
import { buildHero } from './ladder';
import { SKILL_BUILDS, runDungeon, withSeededRandom } from './driver';

if (process.env.SKILL_T) Object.assign(T.heroSkills, JSON.parse(process.env.SKILL_T));
if (process.env.SKILL_ADV) Object.assign(T.advanced, JSON.parse(process.env.SKILL_ADV));

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}%`;

// Level-appropriate heroes with the full set of one tier (the player the Dungeon curve is balanced around).
const HEROES: { label: string; level: number; tier: number; refine: number }[] = [
  { label: 'nível 30', level: 30, tier: 3, refine: 4 },
  { label: 'nível 60', level: 60, tier: 4, refine: 6 },
  { label: 'nível 100', level: 100, tier: 6, refine: 8 },
];

const withRanks = (h: SaveData, ranks: SkillRanks): SaveData => ({ ...h, skillTree: { ...h.skillTree, sets: [ranks, {}] } });
const ranksOf = (ids: HeroSkillId[]): SkillRanks => {
  const out: SkillRanks = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
};
const fullPath = (path: SkillPathId): SkillRanks => ranksOf(SKILL_BUILDS[path]);
const fullSkill = (id: HeroSkillId): SkillRanks => ({ [id]: getSkillDef(id)!.maxRank });

// Value of a build over the bare hero, as the share of the duel margin P it adds: a regular floor and a boss / checkpoint floor, blended by T.advanced.cpBossShare.
function value(h: SaveData, ranks: SkillRanks): { v: number; reg: number; boss: number; cp: number; reflectShare: number } {
  const rep = (hero: SaveData, floor: number) => duel(hero, floor).P;
  // the hero's own representative floor (a fight it wins by a margin of about 1.5, repFloor of the BARE hero) and the next checkpoint / boss floor above it
  const plain = repFloor(h);
  const bossFloor = [...Array(100).keys()].map((i) => i + 1).find((f) => f >= plain && (isDungeonBoss(f) || isDungeonCheckpoint(f)))!;
  const w = withRanks(h, ranks);
  const reg = rep(w, plain) / rep(h, plain) - 1;
  const boss = rep(w, bossFloor) / rep(h, bossFloor) - 1;
  const share = T.advanced.cpBossShare;
  const v = Math.exp((1 - share) * Math.log(1 + reg) + share * Math.log(1 + boss)) - 1;
  return { v, reg, boss, cp: computeCP(w) / computeCP(h) - 1, reflectShare: duel(w, plain).reflectShare };
}

describe('hero skill audit', () => {
  it('prints the tables', () => {
    const out: string[] = [];
    const P = (...l: string[]) => out.push(...l);
    P('', `### I. Habilidades — medição (T.heroSkills = ${JSON.stringify(T.heroSkills)})`, '');
    for (const spec of HEROES) {
      const h = buildHero(spec.level, spec.tier, spec.refine);
      const stats = buildCombatStats(h);
      P(`#### ${spec.label} (tier ${spec.tier}, refino ${spec.refine}; PV ${Math.round(stats.maxHp)}, dano ${Math.round(stats.dmgBase)}, crit ${(stats.critChance * 100).toFixed(1)}%, redução ${stats.reduction.toFixed(2)}, ${(1000 / stats.heroMs).toFixed(2)} atq/s)`, '');
      P('| Caminho | Habilidade | Tier | Valor no posto máximo (margem do duelo) | CP |', '| --- | --- | --- | --- | --- |');
      const byPath: Record<string, { tier: number; v: number; id: string }[]> = {};
      for (const def of HERO_SKILLS) {
        const r = value(h, fullSkill(def.id));
        (byPath[def.path] ??= []).push({ tier: def.tier, v: r.v, id: def.id });
        P(`| ${def.path} | ${def.id} | ${def.tier === 4 ? 'capstone' : def.tier} | ${pct(r.v, 2)} (comum ${pct(r.reg, 2)}, chefe ${pct(r.boss, 2)}) | ${pct(r.cp, 2)} |`);
      }
      P('');
      P('| Caminho | 19 pontos (valor) | CP | com os pontos do nível | só passivas (18) | razão máx/mín entre passivas | capstone / média das T3 | capstone / T3 maior | reflexo / dano causado |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
      for (const path of SKILL_PATH_IDS) {
        const full = fullPath(path);
        const r = value(h, full);
        // what a hero of this level really holds: the first points of the buy order
        const earned = skillPointsEarned(spec.level);
        const partial = ranksOf(SKILL_BUILDS[path].slice(0, earned));
        const rp = value(h, partial);
        const passives = byPath[path].filter((x) => x.tier < 4);
        const cap = byPath[path].find((x) => x.tier === 4)!;
        const t3 = passives.filter((x) => x.tier === 3).map((x) => x.v);
        const noCap = { ...full };
        delete noCap[skillsOfPath(path).find((s) => s.tier === 4)!.id];
        const rn = value(h, noCap);
        const pv = passives.map((x) => x.v);
        P(`| ${path} | ${pct(r.v)} (${pointsSpent(full)} pts) | ${pct(r.cp)} | ${pct(rp.v)} (${earned} pts) | ${pct(rn.v)} | ${(Math.max(...pv) / Math.min(...pv)).toFixed(2)} | ${(cap.v / (t3.reduce((a, b) => a + b, 0) / t3.length)).toFixed(2)} | ${(cap.v / Math.max(...t3)).toFixed(2)} | ${pct(r.reflectShare)} |`);
      }
      P('');
    }

    // Share of the total damage each strike dealt in a same-tier fight (the counters the result screens show): hunting at a representative level, 4 h, a plain floor, ranks 1 / 2 / 3.
    P('#### Parcela do dano total de cada golpe (Caça de 4 h na zona do tier, contadores da tela de resultado)', '');
    P('| Herói | Golpe | posto 1 | posto 2 | posto 3 |', '| --- | --- | --- | --- | --- |');
    for (const spec of HEROES) {
      const h0 = buildHero(spec.level, spec.tier, spec.refine);
      const zone = getHuntingZone(spec.tier >= 6 ? 'blood_marsh' : 'demon_glade')!;
      const share = (ranks: SkillRanks, id: string): string => {
        const s = withRanks(h0, ranks);
        const save: SaveData = { ...s, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: NOW, huntSession: buildHuntSession(s, NOW) };
        const st = computeHuntingStatus(save, NOW + 4 * 3600 * 1000);
        const e = (st.skillTally as Record<string, { n: number; dmg: number }>)[id];
        return e && st.totalDamage > 0 ? `${((e.dmg / st.totalDamage) * 100).toFixed(1)}% (x${e.n})` : '-';
      };
      for (const [id, label] of [['w_heavy_blow', 'Golpe Esmagador'], ['w_fury', 'Golpe de Fúria'], ['w_bleed', 'Sangria'], ['h_light_step', 'Golpe Duplo'], ['g_block', 'Contra-ataque']] as const) {
        const rk = (r: number): SkillRanks => (id === 'g_block' ? { g_block: r } : { [id]: r });
        P(`| ${spec.label} | ${label} | ${share(rk(1), id)} | ${share(rk(2), id)} | ${share(rk(3), id)} |`);
      }
      P(`| ${spec.label} | Golpe Devastador (capstone, com Esmagador x3) | - | - | ${share({ w_heavy_blow: 3, w_devastating_strike: 1 }, 'w_devastating_strike')} |`);
    }
    P('');

    // Monte Carlo of the Dungeon: a hero pushed to the edge of its reach (the highest plain floor it wins with a margin of 1.1), the mean floors cleared per run with
    // and without Last Bastion, next to one full T3 skill of each path for scale (the closed form cannot say how often the once-per-run save is the one that matters).
    P('#### Monte Carlo (runDungeon, sem poções, 200 execuções semeadas): andares limpos por execução na borda do alcance', '');
    P('| Herói | andar inicial | sem habilidade | Último Bastião | Bloqueio x3 | Pele Dura x3 | Mestre de Armas x3 | Sangria x3 |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const spec of HEROES) {
      const h = buildHero(spec.level, spec.tier, spec.refine);
      const bare = { ...h, consumables: { ...h.consumables, small_hp: 0, large_hp: 0, greater_elixir: 0 } };
      let start = 1;
      for (let f = 1; f <= 100; f++) if (duel(bare, f).P >= 1.1 && !isDungeonBoss(f) && !isDungeonCheckpoint(f)) start = f;
      const run = (s: SaveData) => {
        let tot = 0;
        for (let i = 0; i < 200; i++) tot += withSeededRandom(900 + i, () => runDungeon({ ...s, highestDungeonFloor: start }, NOW).stages);
        return tot / 200;
      };
      const a = run(bare);
      const cell = (ranks: SkillRanks) => {
        const b = run(withRanks(bare, ranks));
        return `${b.toFixed(2)} (${pct(b / a - 1, 0)})`;
      };
      P(`| ${spec.label} | ${start} | ${a.toFixed(2)} | ${cell({ g_last_bastion: 1 })} | ${cell({ g_block: 3 })} | ${cell({ g_thick_skin: 3 })} | ${cell({ w_weapon_master: 3 })} | ${cell({ w_bleed: 3 })} |`);
    }
    P('');
    void rankOf;
    console.log(out.join('\n'));
  });
});
