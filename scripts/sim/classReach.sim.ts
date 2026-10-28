// Re-measures the Hunting sub-level gate with the three classes (phase 8). It measures; it writes nothing.
//   npx vitest run --config vitest.sim.config.ts classReach --silent=false --reporter=default
// Method of Rodada 22 (subLevelReach.sim.ts): a hero fights a pinned sub-level of a zone for 2 hours with no promotion and no potions (the method of huntEstimate.ts); the "reach" is the highest sub-level won in at
// least 98 % of the fights. The difference: the ladder is built for the WARRIOR, THE ARCHER AND THE MAGE (classHero.ts: the full set of a weight and the weapon of its family, rotation and affinity on), because the gate
// reads the CP of a hero and the CP of the three classes at the same power is not the same number.
// Per zone and depth it derives, for every sub-level N: the CP of the WEAKEST hero (any class) that wins N, which is the most a gate may ask without barring a hero that wins, and the CP of the STRONGEST hero that
// loses N, which is how much a gate at that value would let through a hero who cannot farm there. It then fits CP(N) = base x growth^(N-1) to the first and prints what the unlocks of a few reference heroes become.
import { it } from 'vitest';
import { buildCombatStats, buildHuntSimSetup, computeCP, huntPromotionRequiredWins, SaveData } from '../../src/game/engine';
import { getHuntingZone, HuntingDepth, recommendedCpForDepth } from '../../src/game/huntingZones';
import { subLevelCpRequired } from './legacyGate';
import { simulateHuntingSession } from '../../src/game/huntCombat';
import { HuntSession } from '../../src/game/huntSession';
import { getGear } from '../../src/game/gear';
import { Rarity } from '../../src/game/rarity';
import { spendSkillPoints } from './driver';
import { CLASS_MAIN, classHero } from './classHero';

const LEVELS = 10;
const ZONES = ['blood_abyss', 'abyss_throne'];
const DEPTHS: HuntingDepth[] = ['shallow', 'dense', 'deep'];

function winRateAt(hero: SaveData, zoneId: string, depth: HuntingDepth, subLevel: number, hours = 2): number {
  const zone = getHuntingZone(zoneId)!;
  const stats = buildCombatStats(hero);
  const session: HuntSession = { stats, blessed: hero.blessed, strength: [], attack: [], pass: [], tonics: {} };
  const noPotions = { ...hero.consumables, greater_elixir: 0, large_hp: 0, small_hp: 0 };
  const { build, zoneCfg, timeline, potionCfg } = buildHuntSimSetup({ ...hero, consumables: noPotions }, zone, depth, session, 0, []);
  const r = simulateHuntingSession(build, zoneCfg, { ceiling: subLevel, promotionWins: 0 }, hours * 3600_000, potionCfg, `probe:${zoneId}:${depth}:${subLevel}`, { maxLevel: subLevel, requiredWins: huntPromotionRequiredWins }, timeline);
  const fights = r.kills + r.defeats;
  return fights > 0 ? r.kills / fights : 0;
}

interface Case {
  label: string;
  cls: string;
  cp: number;
  e: number; // the equipment index of the hero (below)
  tier: number;
  refine: number;
  rarity: Rarity;
  hero: SaveData;
}
// THE EQUIPMENT INDEX (a declared number, class-neutral by construction): the mean over the seven worn pieces of  tier + REFINE_W x refine + RARITY_W[rarity]. It reads nothing but what the player forged, refined and rolled:
// not the line of the weapon, not the weight of the armor, not a stat. EQ_W overrides the weights for a what-if.
const EQ = { refine: 0.1, rare: 0.25, epic: 0.65, legendary: 1.4, ...(process.env.EQ_W ? (JSON.parse(process.env.EQ_W) as Record<string, number>) : {}) };
export function equipmentIndex(hero: SaveData): { e: number; tier: number; refine: number; rarity: Rarity } {
  const ids = Object.values(hero.equipped).filter(Boolean) as string[];
  const insts = ids.map((id) => hero.gearInstances[id]);
  const tier = insts.reduce((a, i) => a + (getGear(i.templateId).tier ?? 0), 0) / insts.length;
  const refine = insts.reduce((a, i) => a + i.upgrade, 0) / insts.length;
  const rarity = insts[0].rarity;
  const rw = rarity === 'common' ? 0 : EQ[rarity];
  return { e: tier + EQ.refine * refine + rw, tier, refine, rarity };
}
function ladder(): Case[] {
  const out: Case[] = [];
  const tiers: [number, number, number][] = [[2, 20, 4], [3, 45, 0], [3, 45, 8], [4, 62, 0], [4, 62, 8], [5, 75, 0], [5, 75, 8], [5, 75, 12], [6, 90, 0], [6, 90, 8], [6, 90, 12]];
  for (const [tier, level, refine] of tiers)
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
      if (rarity !== 'common' && refine === 0) continue;
      for (const b of CLASS_MAIN) {
        const hero = spendSkillPoints(classHero(b, level, tier, refine, 'real', 100, rarity), 'warrior');
        out.push({ label: `T${tier}+${refine} ${rarity}`, cls: b.id, cp: computeCP(hero), ...equipmentIndex(hero), hero });
      }
    }
  return out;
}

// least squares  y = X b  by the normal equations (a handful of unknowns)
function lstsq(X: number[][], y: number[]): number[] {
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, r) => Array.from({ length: k + 1 }, (_, c) => (c < k ? X.reduce((a, row) => a + row[r] * row[c], 0) : X.reduce((a, row, n) => a + row[r] * y[n], 0))));
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let q = c; q <= k; q++) A[r][q] -= f * A[c][q];
    }
  }
  return A.map((row, r) => row[k] / row[r]);
}

it('re-measures the sub-level gate', () => {
  const cases = ladder();
  const out: string[] = [`${cases.length} heróis (3 classes x ${cases.length / 3} equipamentos), 2 h por sub-nível, sem poção. Alcance = maior sub-nível vencido em >= 98 % das lutas.`, ''];
  // the weights the CP itself gives to tier, refine and rarity on the warrior (the reference build of the gate), to see whether the declared weights are in the right neighbourhood
  const war = cases.filter((c) => c.cls === 'warrior');
  const X = war.map((c) => [1, c.tier, c.refine, c.rarity === 'rare' ? 1 : 0, c.rarity === 'epic' ? 1 : 0, c.rarity === 'legendary' ? 1 : 0]);
  const b = lstsq(X, war.map((c) => Math.log(c.cp)));
  out.push(`Regressão do log do CP do guerreiro: por tier ${b[1].toFixed(3)}, por nível de refino ${b[2].toFixed(3)}, raro ${b[3].toFixed(3)}, épico ${b[4].toFixed(3)}, lendário ${b[5].toFixed(3)}. Em unidades de tier: refino ${(b[2] / b[1]).toFixed(3)}, raro ${(b[3] / b[1]).toFixed(2)}, épico ${(b[4] / b[1]).toFixed(2)}, lendário ${(b[5] / b[1]).toFixed(2)}. Pesos declarados em uso: refino ${EQ.refine}, épico ${EQ.epic}, lendário ${EQ.legendary}.`, '');
  // warrior CP as a function of the declared index:  ln(CP) = a + k E
  const Xe = war.map((c) => [1, c.e]);
  const [ea, ek] = lstsq(Xe, war.map((c) => Math.log(c.cp)));
  const resid = war.map((c) => Math.abs(Math.exp(ea + ek * c.e) / c.cp - 1));
  out.push(`CP do guerreiro em função do índice: ln(CP) = ${ea.toFixed(3)} + ${ek.toFixed(3)} x índice (erro médio ${(100 * resid.reduce((x, y) => x + y, 0) / resid.length).toFixed(1)} %, pior ${(100 * Math.max(...resid)).toFixed(1)} %)`, '');
  const reachOf: Record<string, number[]> = {};
  const gateE: Record<string, number[]> = {}; // zone:depth -> [E needed for sub-level 2..10], valve-preserving
  const combatE: Record<string, number[]> = {}; // the weakest winner's index, running maximum
  for (const zoneId of ZONES) {
    const zone = getHuntingZone(zoneId)!;
    for (const depth of DEPTHS) {
      const key = `${zoneId}:${depth}`;
      const rates = cases.map((c) => Array.from({ length: LEVELS }, (_, n) => winRateAt(c.hero, zoneId, depth, n + 1)));
      reachOf[key] = rates.map((r) => {
        let k = 0;
        for (let n = 1; n <= LEVELS; n++) if (r[n - 1] >= 0.98 && k === n - 1) k = n;
        return k;
      });
      out.push(`### ${key}: CP recomendado ${recommendedCpForDepth(zone, depth)}`, '');
      out.push('| sub-nível | ' + Array.from({ length: LEVELS - 1 }, (_, n) => n + 2).join(' | ') + ' |', '| --- | ' + Array.from({ length: LEVELS - 1 }, () => '--:').join(' | ') + ' |');
      const row = (name: string, f: (n: number) => string): void => void out.push(`| ${name} | ` + Array.from({ length: LEVELS - 1 }, (_, n) => f(n + 2)).join(' | ') + ' |');
      const winners = (n: number): Case[] => cases.filter((_, ci) => rates[ci][n - 1] >= 0.98);
      const losers = (n: number): Case[] => cases.filter((_, ci) => rates[ci][n - 1] < 0.98);
      row('CP do mais fraco que vence', (n) => (winners(n).length ? String(Math.round(Math.min(...winners(n).map((c) => c.cp)))) : '-'));
      row('CP do mais forte que perde', (n) => String(Math.round(Math.max(0, ...losers(n).map((c) => c.cp)))));
      row('índice do mais fraco que vence', (n) => (winners(n).length ? Math.min(...winners(n).map((c) => c.e)).toFixed(2) : '-'));
      row('índice do mais forte que perde', (n) => Math.max(0, ...losers(n).map((c) => c.e)).toFixed(2));
      row('CP que o portão pede hoje', (n) => String(subLevelCpRequired(zone, depth, n)));
      gateE[key] = Array.from({ length: LEVELS - 1 }, (_, n) => (Math.log(subLevelCpRequired(zone, depth, n + 2)) - ea) / ek);
      let run = 0;
      combatE[key] = Array.from({ length: LEVELS - 1 }, (_, n) => {
        const w = winners(n + 2);
        run = Math.max(run, w.length ? Math.min(...w.map((c) => c.e)) : run);
        return run;
      });
      row('índice que o portão de hoje equivale (guerreiro)', (n) => gateE[key][n - 2].toFixed(2));
      row('índice pelo combate (máximo corrente)', (n) => combatE[key][n - 2].toFixed(2));
      out.push('');
    }
  }
  out.push('### O que alguns heróis destravam: portão de hoje por CP / por índice equivalente ao de hoje / por índice do combate / alcance de combate', '');
  out.push('| herói | classe | CP | índice | ' + ZONES.flatMap((z) => DEPTHS.map((d) => `${z.slice(0, 7)} ${d.slice(0, 3)}`)).join(' | ') + ' |', '| --- | --- | --: | --: | ' + ZONES.flatMap(() => DEPTHS.map(() => '--:')).join(' | ') + ' |');
  const opens = (xs: number[], v: number): number => 1 + xs.filter((x) => v >= x).length;
  for (const label of ['T3+8 common', 'T4+0 common', 'T4+8 common', 'T5+0 common', 'T5+8 common', 'T5+8 epic', 'T6+8 common', 'T6+12 epic', 'T6+12 legendary'])
    for (const bld of CLASS_MAIN) {
      const ci = cases.findIndex((c) => c.label === label && c.cls === bld.id);
      if (ci < 0) continue;
      const c = cases[ci];
      const cells = ZONES.flatMap((z) =>
        DEPTHS.map((d) => {
          const zone = getHuntingZone(z)!;
          const key = `${z}:${d}`;
          let today = 1;
          for (let n = 2; n <= LEVELS; n++) if (c.cp >= subLevelCpRequired(zone, d, n)) today = n;
          return `${today}/${opens(gateE[key], c.e)}/${opens(combatE[key], c.e)}/${reachOf[key][ci]}`;
        }),
      );
      out.push(`| ${label} | ${bld.id} | ${Math.round(c.cp)} | ${c.e.toFixed(2)} | ${cells.join(' | ')} |`);
    }
  console.log(out.join(String.fromCharCode(10)));
}, 3_600_000);
