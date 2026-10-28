// Classes reform, phases 2a and 2b (docs/CLASSES_E_EQUIPAMENTOS.md 2.4): solves, per tier, how much the two lighter armor weights get back for the 40 % of the defense they give up, so that a FULL
// set of the weight (armor, helmet, gloves, boots, off hand) is worth the CP of the full plate set of the same tier (the sword and the ring stay the tier's), and writes the result into the
// conversion blocks of src/game/gear.ts:
//   leather (2a): crit chance + attack speed          -> LEATHER_CONVERSION, between the `weightBudget.gen` markers
//   cloth   (2b): crit multiplier + regeneration      -> CLOTH_CONVERSION, between the `weightBudget.cloth.gen` markers
// Run it with:
//   npx vitest run --config vitest.sim.config.ts weightBudget
// It uses the real engine (computeCP / buildCombatStats), never a copy of the formula (the one exception is the sustain guard of the cloth line, below, which only READS the cap).
// itemBalance.test.ts checks the +-5 % parity on the committed numbers, so a stale table fails there.
//
// Method, per weight and per tier T (reference hero: the level that opens the tier, the tier's weapon and ring, common pieces, attribute points spread like the sim player):
//   1. the five pieces keep their KEEP share of their plate twin's defense (gear.ts derives that on its own) and carry none of the returned stats yet: that is L0, below the plate set;
//   2. the budget they gave up is returned as a TOTAL of the first stat Cf and a TOTAL of the second Sf, split between the five pieces by the share of CP each plate twin is worth
//      (pieceGain, averaged over the six tiers so a slot has ONE share: per-tier shares made a piece's numbers go DOWN from one tier to the next), "half of the power in each": the CP
//      that Cf alone adds to L0 equals the CP that Sf alone adds;
//   3. Cf is the one number that makes the whole set equal to the plate set's CP (bisection; Sf follows Cf through step 2). That is the EXACT solution of the tier;
//   3b. CLOTH ONLY - the sustain guard. In combatPowerCore the regeneration enters through sigma, which is capped (T.advanced.cpSustainSigmaCap, and 0.95): near the cap every extra point of
//      regeneration is worth less and less CP, so a parity closed with a huge regeneration would be a number the engine no longer credits. The regeneration total is therefore limited to the
//      value that keeps the reference hero's sigma (at +0, +4 and +8, set bonuses on) at SIGMA_SHARE of the cap; what it cannot carry goes to the crit multiplier. The report prints the tiers
//      where the guard bit and the final split;
//   4. the chain rules of itemBalance.test.ts (R5) judge every piece against the piece of the previous tier, on ONE fixed reference hero (tierSteps.ts): its stats must beat the
//      previous tier's and the CP it adds must grow by at least 15 % a tier. Percent returns are worth the same to every hero while flat defense is worth less to a stronger
//      one, so the exact solutions of two neighbouring tiers can fall a point or two short of that step. The totals of each tier are then scaled by a factor mu (one per tier, both totals
//      together) that starts at 1: whenever a step is short, the higher tier goes up and the lower one down by a hair, until every step clears. mu is bounded so every set stays inside
//      +-MAX_DRIFT of the plate set's CP (the rule is +-5 %); the report prints where each tier ended.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCombatStats, computeCP } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { effectiveHp } from '../../src/game/derivedStats';
import { CLOTH_LINES, getGear, LEATHER_LINES, SWORD_TWINS, WEAPON_CRIT_KEEP, WEAPON_LINES } from '../../src/game/gear';
import T from '../../src/game/tunables';
import { buildHero } from './ladder';
import { pieceGain } from './tierSteps';
import { withoutSetBonuses } from './duel';
import type { SaveData } from '../../src/game/engine';

const GEAR_TS = resolve(__dirname, '../../src/game/gear.ts');
// the hero level that opens each tier (the gates of the plate weapon / armor)
const TIER_LEVEL = [1, 10, 25, 50, 70, 90];
const STEP_TARGET = 1.152; // the 15 % step of itemBalance.test.ts, plus a hair
const MAX_DRIFT = 0.045; // the set may end this far from parity (the rule is +-5 %)
const MU_NUDGE = 0.002;
const SIGMA_SHARE = 0.8; // the regeneration of the cloth line may not take the reference hero's sigma above this share of the cap
const rnd = (x: number, decimals: number): number => Math.round(x * 10 ** decimals) / 10 ** decimals;

interface WeightSpec {
  name: 'leather' | 'cloth';
  lines: { slot: string; ids: string[]; twins: string[] }[];
  // the two stats the weight gets back, in the order they are stored in the conversion block, and how many decimals each one keeps
  fields: [string, string];
  decimals: [number, number];
  // upper bounds for the searches of the two totals
  maxTotals: [number, number];
  blockName: string;
  markers: string;
  guardSustain: boolean;
  // fit the middle of the spread of the six conditions instead of +0 alone, and bound the chain relaxation by the rule itself (see exactTotals / relax)
  centered: boolean;
  // cloth: the crit multiplier follows a ladder (c1 + d * (tier - 1)) searched on a grid and the regeneration solves the parity, so both totals are increasing by construction
  ladder?: boolean;
  // experiments: take the regeneration as this share of what the sustain guard allows, instead of the half-power solution
  regenOfLimit?: number;
}
const LEATHER: WeightSpec = { name: 'leather', lines: LEATHER_LINES, fields: ['critChance', 'attackSpeedBonus'], decimals: [4, 4], maxTotals: [0.9, 3], blockName: 'LEATHER_CONVERSION', markers: 'weightBudget.gen', guardSustain: false, centered: false };
const CLOTH: WeightSpec = { name: 'cloth', lines: CLOTH_LINES, fields: ['critMultBonus', 'hpRegenPct'], decimals: [4, 5], maxTotals: [20, 0.5], blockName: 'CLOTH_CONVERSION', markers: 'weightBudget.cloth.gen', guardSustain: true, centered: true, ladder: true };

const slotsOf = (w: WeightSpec): string[] => w.lines.map((l) => l.slot);
const idOf = (w: WeightSpec, slot: string, t: number): string => w.lines.find((l) => l.slot === slot)!.ids[t - 1];
const twinOf = (w: WeightSpec, slot: string, t: number): string => w.lines.find((l) => l.slot === slot)!.twins[t - 1];

// The reference hero of tier t wearing the pieces of weight `w` in its slots (the plate ones elsewhere), or the plate set.
function heroWith(w: WeightSpec, t: number, refine: number, light: boolean): SaveData {
  const h = buildHero(TIER_LEVEL[t - 1], t, refine);
  if (!light) return h;
  const instances = { ...h.gearInstances };
  const equipped = { ...h.equipped } as unknown as Record<string, string | null>;
  for (const slot of slotsOf(w)) {
    const id = idOf(w, slot, t);
    const inst = createGearInstance(id, { id: `gi_${w.name}_${id}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  return { ...h, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
}

type Shares = Record<string, number>;
// Lends the totals to the five templates of the tier (in memory only).
function lend(w: WeightSpec, t: number, a: number, b: number, shares: Shares): void {
  for (const slot of slotsOf(w)) {
    const g = getGear(idOf(w, slot, t)) as unknown as Record<string, number | undefined>;
    const x = rnd(a * shares[slot], w.decimals[0]);
    const y = rnd(b * shares[slot], w.decimals[1]);
    g[w.fields[0]] = x > 0 ? x : undefined;
    g[w.fields[1]] = y > 0 ? y : undefined;
  }
}
function setCP(w: WeightSpec, t: number, refine: number, a: number, b: number, shares: Shares, sets = false): number {
  lend(w, t, a, b, shares);
  const h = heroWith(w, t, refine, true);
  return sets ? computeCP(h) : withoutSetBonuses(() => computeCP(h));
}
const plateCP = (w: WeightSpec, t: number, refine: number, sets = false): number => {
  const h = heroWith(w, t, refine, false);
  return sets ? computeCP(h) : withoutSetBonuses(() => computeCP(h));
};

function bisect(f: (x: number) => number, target: number, lo: number, hi: number): number {
  // f increasing
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The share of the returned budget each slot carries: the CP its plate twin is worth, as a share of the five, averaged over the six tiers.
function slotShares(w: WeightSpec): Shares {
  const slots = slotsOf(w);
  const acc: Shares = Object.fromEntries(slots.map((s) => [s, 0]));
  for (let t = 1; t <= 6; t++) {
    const gains = Object.fromEntries(slots.map((s) => [s, pieceGain(twinOf(w, s, t))]));
    const sum = slots.reduce((a, s) => a + gains[s], 0);
    for (const s of slots) acc[s] += gains[s] / sum / 6;
  }
  return acc;
}

// The sustain share (sigma, before the cap) the engine computes for a hero: lifesteal + regeneration, exactly the expression of combatPowerCore (derivedStats.ts). The reference hero has no
// hero skills, so no strike / block / boss terms: CP = scale * sqrt(dps * ehp / (1 - sigma)) with dps = hits.
function sigmaOf(h: SaveData): number {
  const st = buildCombatStats(h);
  const cc = Math.min(1, Math.max(0, st.critChance));
  const hits = st.dmgBase * (1000 / st.heroMs) * (1 + cc * (Math.max(1, st.critMult) - 1));
  const ehp = effectiveHp(st.maxHp, st.reduction);
  const regen = Math.min(1, Math.max(0, st.hpRegenPct)) * (1000 / T.battle.effectTickMs);
  return (st.lifesteal / 100) * (1 + st.reduction) + (T.advanced.cpRegenWeight * regen * ehp) / hits;
}
// the highest sigma of the cloth set of tier t over the refine levels the parity is checked at, set bonuses on (they carry regeneration too)
function worstSigma(w: WeightSpec, t: number, a: number, b: number, shares: Shares): number {
  lend(w, t, a, b, shares);
  return Math.max(...[0, 4, 8].map((r) => sigmaOf(heroWith(w, t, r, true))));
}
const SIGMA_LIMIT = SIGMA_SHARE * Math.min(0.95, T.advanced.cpSustainSigmaCap);
// the largest regeneration total that keeps the set of tier t at SIGMA_LIMIT, for a given first-stat total
function regenLimit(w: WeightSpec, t: number, a: number, shares: Shares): number {
  if (worstSigma(w, t, a, w.maxTotals[1], shares) <= SIGMA_LIMIT) return w.maxTotals[1];
  return bisect((b) => worstSigma(w, t, a, b, shares), SIGMA_LIMIT, 0, w.maxTotals[1]);
}

// The six conditions the +-5 % rule is judged at: +0, +4 and +8, without and with the set bonuses.
const CONDITIONS: [number, boolean][] = [[0, false], [4, false], [8, false], [0, true], [4, true], [8, true]];
const plateMemo = new Map<string, number>();
const plateCPm = (w: WeightSpec, t: number, refine: number, sets: boolean): number => {
  const k = `${w.name}:${t}:${refine}:${sets}`;
  let v = plateMemo.get(k);
  if (v === undefined) plateMemo.set(k, (v = plateCP(w, t, refine, sets)));
  return v;
};
// set CP / plate CP at every condition
function ratios(w: WeightSpec, t: number, a: number, b: number, shares: Shares): number[] {
  return CONDITIONS.map(([r, st]) => setCP(w, t, r, a, b, shares, st) / plateCPm(w, t, r, st));
}
// the middle of the spread: 1 when the highest and the lowest condition are equally far from 1
const midrange = (rs: number[]): number => (Math.max(...rs) + Math.min(...rs)) / 2;

// Steps 1-3: the totals that make the set of tier t worth exactly the plate set (leather: at +0 without set bonuses; cloth: the MIDDLE of the spread of the six conditions, because the
// returned stats do not grow with the refine level the way the plate defense does, so a fit at +0 alone drifts to -9 % at +8 and breaks the rule).
function exactTotals(w: WeightSpec, t: number, shares: Shares): { cf: number; sf: number; guarded: boolean; halfPowerSf: number } {
  const base = setCP(w, t, 0, 0, 0, shares);
  const [AMAX, BMAX] = w.maxTotals;
  // the second total that is worth exactly what a given first total is worth
  const speedFor = (cf: number): number => {
    const gain = setCP(w, t, 0, cf, 0, shares) - base;
    return bisect((sf) => setCP(w, t, 0, 0, sf, shares) - base, gain, 0, BMAX);
  };
  const pair = (cf: number): { sf: number; guarded: boolean; half: number } => {
    if (w.regenOfLimit !== undefined) {
      const l0 = regenLimit(w, t, cf, shares) * w.regenOfLimit;
      return { sf: l0, guarded: false, half: l0 };
    }
    const half = speedFor(cf);
    if (!w.guardSustain) return { sf: half, guarded: false, half };
    const lim = regenLimit(w, t, cf, shares);
    return { sf: Math.min(half, lim), guarded: half > lim, half };
  };
  const fit = (cf: number): number => {
    const sf = pair(cf).sf;
    return w.centered ? midrange(ratios(w, t, cf, sf, shares)) : setCP(w, t, 0, cf, sf, shares) / plateCPm(w, t, 0, false);
  };
  if (fit(AMAX) < 1) throw new Error(`${w.name} tier ${t}: the budget cannot be returned inside ${w.fields[0]} <= ${AMAX}`);
  const cf = bisect(fit, 1, 0, AMAX);
  const p = pair(cf);
  return { cf, sf: p.sf, guarded: p.guarded, halfPowerSf: p.half };
}

interface TierSolution {
  tier: number;
  cf: number;
  sf: number;
  mu: number;
  pieces: Record<string, [number, number]>;
}

// Step 4: the per-tier factors that clear the chain steps. The totals of tier i are scaled by mu[i] (both together), starting at 1.
//  - leather: whenever a step is short, the higher tier goes up and the lower one down by a hair, bounded by +-MAX_DRIFT around the +0 fit;
//  - cloth: a coordinate descent on the total shortfall of the steps (a tier moves only when that lowers it), bounded by the rule itself - no condition of the tier may leave +-WORST_DRIFT of
//    the plate set - because the fit is centered and the spread, not the +0 value, is what the rule judges. Its steps are tighter (the returned stats do not grow with the tier the way
//    the defense of the plate does), and the one-sided nudge of the leather loop makes neighbouring tiers undo each other.
const WORST_DRIFT = 0.049;
function relax(w: WeightSpec, exact: { cf: number; sf: number }[], shares: Shares): TierSolution[] {
  const slots = slotsOf(w);
  const mu = exact.map(() => 1);
  const MU_MIN = w.centered ? 0.5 : 1 - MAX_DRIFT;
  const MU_MAX = w.centered ? 1.5 : 1 + MAX_DRIFT;
  // the sustain guard holds after the scaling too: the regeneration total never passes the limit of its tier (measured at the lowest first total the scaling can leave, which has the
  // fewest hits and so the highest sigma)
  const sfCap = exact.map((e, i) => (w.guardSustain ? regenLimit(w, i + 1, e.cf * MU_MIN, shares) : Infinity));
  const totalsAt = (i: number, m: number): { cf: number; sf: number } => ({ cf: exact[i].cf * m, sf: Math.min(exact[i].sf * m, sfCap[i]) });
  const totals = (i: number): { cf: number; sf: number } => totalsAt(i, mu[i]);
  const apply = (): void => exact.forEach((_, i) => lend(w, i + 1, totals(i).cf, totals(i).sf, shares));
  const tierGains = (i: number): Record<string, number> => Object.fromEntries(slots.map((s) => [s, pieceGain(idOf(w, s, i + 1))]));
  const finish = (): TierSolution[] =>
    exact.map((_, i) => {
      const { cf, sf } = totals(i);
      const pieces: Record<string, [number, number]> = {};
      for (const s of slots) pieces[idOf(w, s, i + 1)] = [rnd(cf * shares[s], w.decimals[0]), rnd(sf * shares[s], w.decimals[1])];
      return { tier: i + 1, cf, sf, mu: mu[i], pieces };
    });

  if (!w.centered) {
    for (let iter = 0; iter < 400; iter++) {
      apply();
      const gains = exact.map((_, i) => tierGains(i));
      let short = false;
      for (let i = 1; i < exact.length; i++) {
        if (slots.every((s) => gains[i][s] / gains[i - 1][s] >= STEP_TARGET)) continue;
        short = true;
        mu[i] = Math.min(MU_MAX, mu[i] * (1 + MU_NUDGE));
        mu[i - 1] = Math.max(MU_MIN, mu[i - 1] * (1 - MU_NUDGE));
      }
      if (!short) return finish();
    }
    throw new Error(`${w.name}: the chain steps cannot be cleared with every set inside +-${MAX_DRIFT * 100} % of the plate set (mu ${mu.map((m) => m.toFixed(3)).join(' ')})`);
  }

  // can tier i move to the factor m without leaving the rule
  const allowed = (i: number, m: number): boolean => {
    if (m < MU_MIN || m > MU_MAX) return false;
    const t = totalsAt(i, m);
    // both totals stay strictly increasing with the tier: a promise to the player (the next tier is never worse), harder than the parity band
    if (i > 0 && (t.cf <= totals(i - 1).cf || t.sf <= totals(i - 1).sf)) return false;
    if (i < exact.length - 1 && (t.cf >= totals(i + 1).cf || t.sf >= totals(i + 1).sf)) return false;
    const rs = ratios(w, i + 1, t.cf, t.sf, shares);
    return Math.max(...rs) <= 1 + WORST_DRIFT && Math.min(...rs) >= 1 - WORST_DRIFT;
  };
  apply();
  const gainsNow = exact.map((_, i) => tierGains(i));
  // the shortfall of every step against the target (the worst slot of the step), squared and summed
  const shortfall = (g: Record<string, number>[]): number => {
    let sum = 0;
    for (let i = 1; i < g.length; i++) {
      const worst = Math.min(...slots.map((s) => g[i][s] / g[i - 1][s]));
      if (worst < STEP_TARGET) sum += (STEP_TARGET - worst) ** 2;
    }
    return sum;
  };
  const stepDetail = (): string => Array.from({ length: 5 }, (_, k) => `T${k + 1}->T${k + 2} ` + slots.map((s) => (gainsNow[k + 1][s] / gainsNow[k][s]).toFixed(3)).join(' ')).join(' | ');
  // the CP of the reference hero is a small integer (a piece adds a few points), so a gain only moves when a change crosses a rounding boundary: try several sizes and keep the best
  const STEPS = [0.1, 0.05, 0.025, 0.012, 0.006];
  for (let iter = 0; iter < 600 && shortfall(gainsNow) > 0; iter++) {
    const current = shortfall(gainsNow);
    let best: { i: number; m: number; f: number; g: Record<string, number> } | undefined;
    for (let i = 0; i < exact.length; i++)
      for (const [dir, step] of STEPS.flatMap((st) => [[1, st], [-1, st]] as [number, number][])) {
        const m = mu[i] * (1 + dir * step);
        if (!allowed(i, m)) continue;
        const keep = mu[i];
        mu[i] = m;
        lend(w, i + 1, totals(i).cf, totals(i).sf, shares);
        const g = tierGains(i);
        const f = shortfall(gainsNow.map((x, k) => (k === i ? g : x)));
        mu[i] = keep;
        if (f < current - 1e-12 && (!best || f < best.f)) best = { i, m, f, g };
      }
    if (!best) {
      apply();
      throw new Error(`${w.name}: the chain steps cannot be cleared with every set inside the +-5 % rule (mu ${mu.map((m) => m.toFixed(3)).join(' ')}); steps per slot (${slots.join(' ')}): ${stepDetail()}`);
    }
    mu[best.i] = best.m;
    gainsNow[best.i] = best.g;
    apply();
  }
  if (shortfall(gainsNow) > 0) throw new Error(`${w.name}: the chain steps did not settle (mu ${mu.map((m) => m.toFixed(3)).join(' ')}); steps per slot (${slots.join(' ')}): ${stepDetail()}`);
  return finish();
}


// Cloth, hard constraints first: the crit multiplier AND the regeneration of a piece never go down from one tier to the next (the next tier is never worse - a promise to the player), the
// sustain guard holds, and only then the parity band is chased. The half-power split cannot do it: the crit multiplier it asks for FALLS with the tier (the hero's crit chance rises from 0.11
// to 0.43, so a point of multiplier is worth 2.7 times more at the top). The crit multiplier is therefore a ladder c1 + d * (tier - 1) and the regeneration is whatever closes the parity under it.
// Closing it exactly is still not always monotone (the regeneration the tier-4 hero needs is LOWER than the tier-3 one), so each tier may sit off the middle of the +-5 % band by an offset e
// (the middle of the spread of its six conditions at 1 + e); a small dynamic program picks the offsets with the least total |e| that keep the regeneration increasing. (c1, d) is searched on a
// grid: among the ladders for which every tier fits (every condition inside the rule, under the sustain guard, every chain step cleared) the one with the least offsets wins.
const OFFSETS = Array.from({ length: 17 }, (_, k) => -0.04 + k * 0.005);
const REGEN_MIN_STEP = 1.02; // the regeneration of tier t+1 is at least this much above tier t
function ladderSearch(w: WeightSpec, shares: Shares): { cf: number; sf: number }[] {
  const options = (t: number, cf: number): { e: number; sf: number }[] => {
    const out: { e: number; sf: number }[] = [];
    for (const e of OFFSETS) {
      const fit = (sf: number): number => midrange(ratios(w, t, cf, sf, shares));
      if (fit(w.maxTotals[1]) < 1 + e) continue;
      const sf = bisect(fit, 1 + e, 0, w.maxTotals[1]);
      const rs = ratios(w, t, cf, sf, shares);
      if (Math.max(...rs) > 1 + WORST_DRIFT || Math.min(...rs) < 1 - WORST_DRIFT) continue;
      if (worstSigma(w, t, cf, sf, shares) > SIGMA_LIMIT) continue;
      out.push({ e, sf });
    }
    return out;
  };
  let best: { score: number; totals: { cf: number; sf: number }[]; c1: number; d: number } | undefined;
  for (const c1 of [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1]) {
    for (const d of [0.05, 0.1, 0.125, 0.15, 0.2]) {
      let cfs = [1, 2, 3, 4, 5, 6].map((t) => rnd(c1 + d * (t - 1), 4));
      if (d === 0) continue; // a flat ladder is not strictly increasing
      let opts = cfs.map((cf, i) => options(i + 1, cf));
      if (opts.some((o) => o.length === 0)) continue;
      // dynamic program over the tiers: cost = sum of e^2, regeneration strictly increasing
      const cost: number[][] = opts.map((o) => o.map(() => Infinity));
      const from: number[][] = opts.map((o) => o.map(() => -1));
      opts[0].forEach((o, k) => (cost[0][k] = o.e * o.e));
      for (let t = 1; t < 6; t++)
        opts[t].forEach((o, k) =>
          opts[t - 1].forEach((p, j) => {
            if (o.sf >= p.sf * REGEN_MIN_STEP && cost[t - 1][j] + o.e * o.e < cost[t][k]) {
              cost[t][k] = cost[t - 1][j] + o.e * o.e;
              from[t][k] = j;
            }
          }),
        );
      let k = cost[5].indexOf(Math.min(...cost[5]));
      if (!Number.isFinite(cost[5][k])) continue;
      const pick: number[] = [];
      for (let t = 5; t >= 0; t--) {
        pick[t] = k;
        k = from[t][k];
      }
      const slots = slotsOf(w);
      // the shortfall of the chain steps (pieceGain on the reference hero) for a pick of offsets
      const shortfallOf = (idx: number[]): number => {
        idx.forEach((kk, t) => lend(w, t + 1, cfs[t], opts[t][kk].sf, shares));
        const gains = idx.map((_, i) => Object.fromEntries(slots.map((sl) => [sl, pieceGain(idOf(w, sl, i + 1))])));
        let sum = 0;
        for (let i = 1; i < 6; i++) {
          const worstStep = Math.min(...slots.map((sl) => gains[i][sl] / gains[i - 1][sl]));
          if (worstStep < STEP_TARGET) sum += (STEP_TARGET - worstStep) ** 2;
        }
        return sum;
      };
      const valid = (idx: number[]): boolean => idx.every((kk, t) => t === 0 || opts[t][kk].sf >= opts[t - 1][idx[t - 1]].sf * REGEN_MIN_STEP);
      let shortfall = shortfallOf(pick);
      // hill climb: move one tier's offset by a notch while the regeneration stays increasing and the shortfall drops
      for (let guard = 0; guard < 40 && shortfall > 0; guard++) {
        let improved = false;
        for (let t = 0; t < 6; t++)
          for (const dk of [-1, 1]) {
            const trial = pick.slice();
            trial[t] += dk;
            if (trial[t] < 0 || trial[t] >= opts[t].length || !valid(trial)) continue;
            const sh = shortfallOf(trial);
            if (sh < shortfall - 1e-12) {
              pick.splice(0, 6, ...trial);
              shortfall = sh;
              improved = true;
            }
          }
        if (!improved) break;
      }
      // second kind of move: the crit multiplier of one tier a notch up or down (the ladder stays strictly increasing), keeping the offset as close as the new options allow
      for (let guard = 0; guard < 40 && shortfall > 0; guard++) {
        let improved = false;
        for (let t = 0; t < 6; t++)
          for (const dc of [-0.05, 0.05]) {
            const cf = rnd(cfs[t] + dc, 4);
            if ((t > 0 && cf <= cfs[t - 1]) || (t < 5 && cf >= cfs[t + 1])) continue;
            const newOpts = options(t + 1, cf);
            if (newOpts.length === 0) continue;
            const e0 = opts[t][pick[t]].e;
            let kk = 0;
            newOpts.forEach((o, j) => { if (Math.abs(o.e - e0) < Math.abs(newOpts[kk].e - e0)) kk = j; });
            const saveCfs = cfs, saveOpts = opts, savePick = pick.slice();
            cfs = cfs.slice(); cfs[t] = cf;
            opts = opts.slice(); opts[t] = newOpts;
            const trial = pick.slice(); trial[t] = kk;
            const sh = valid(trial) ? shortfallOf(trial) : Infinity;
            if (sh < shortfall - 1e-12) { pick.splice(0, 6, ...trial); shortfall = sh; improved = true; }
            else { cfs = saveCfs; opts = saveOpts; pick.splice(0, 6, ...savePick); }
          }
        if (!improved) break;
      }
      const totals = pick.map((kk, t) => ({ cf: cfs[t], sf: opts[t][kk].sf }));
      const total = pick.reduce((acc, kk, t) => acc + opts[t][kk].e ** 2, 0);
      const score = shortfall * 1000 + total;
      console.log(`[ladder] c1 ${c1} d ${d} offsets ${pick.map((kk, t) => opts[t][kk].e).join(' ')} stepShortfall ${shortfall.toFixed(5)}`);
      if (!best || score < best.score) best = { score, totals, c1, d };
    }
  }
  if (!best) throw new Error('cloth: no ladder (c1, d) keeps every tier inside the rule with both totals increasing');
  console.log(`[ladder] chosen c1 ${best.c1} d ${best.d} score ${best.score.toFixed(5)}`);
  return best.totals;
}

function solveAndWrite(w: WeightSpec): void {
  const slots = slotsOf(w);
  const shares = slotShares(w);
  console.log(`[${w.name}] slot shares`, JSON.stringify(Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, rnd(v, 4)]))));
  const exact = w.ladder ? ladderSearch(w, shares).map((x) => ({ ...x, guarded: false, halfPowerSf: x.sf })) : [1, 2, 3, 4, 5, 6].map((t) => exactTotals(w, t, shares));
  exact.forEach((e, i) => console.log(`[${w.name}] exact T${i + 1}: ${w.fields[0]} ${e.cf.toFixed(4)}  ${w.fields[1]} ${e.sf.toFixed(5)}`));
  const sols = relax(w, exact, shares);
  // report
  const rows: string[] = [];
  for (const s of sols) {
    const t = s.tier;
    const rs = ratios(w, t, s.cf, s.sf, shares).map((r) => r.toFixed(4));
    const e = exact[t - 1];
    const guard = w.guardSustain ? `  sigma(worst of +0/+4/+8, sets on) ${worstSigma(w, t, s.cf, s.sf, shares).toFixed(3)} / limit ${SIGMA_LIMIT.toFixed(3)}${e.guarded ? `  GUARD BIT (half-power regen would be ${e.halfPowerSf.toFixed(5)}, kept ${e.sf.toFixed(5)})` : ''}` : '';
    rows.push(
      `T${t}  ${w.fields[0]} total ${s.cf.toFixed(4)}  ${w.fields[1]} total ${s.sf.toFixed(5)}  (exact ${e.cf.toFixed(4)} / ${e.sf.toFixed(5)}, mu ${s.mu.toFixed(3)})  CP ${w.name}/plate  pieces only +0 ${rs[0]} +4 ${rs[1]} +8 ${rs[2]}  | with set bonuses +0 ${rs[3]} +4 ${rs[4]} +8 ${rs[5]}  | plate CP ${plateCPm(w, t, 0, false)}${guard}`,
    );
  }
  console.log('\n' + rows.join('\n'));
  // write the block
  const lines = sols.flatMap((s) => Object.entries(s.pieces).map(([id, [c, v]]) => `  ${id}: [${c}, ${v}],`));
  const block = `// BEGIN ${w.markers}\nconst ${w.blockName}: Record<string, [number, number]> = {\n${lines.join('\n')}\n};\n// END ${w.markers}`;
  const src = readFileSync(GEAR_TS, 'utf8');
  const re = new RegExp(`// BEGIN ${w.markers.replace(/\./g, '\\.')}\\r?\\n[\\s\\S]*?// END ${w.markers.replace(/\./g, '\\.')}`);
  expect(re.test(src), `markers of ${w.name} in gear.ts`).toBe(true);
  // keep the file's own line endings (a checkout with autocrlf has CRLF)
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(GEAR_TS, src.replace(re, () => block.split('\n').join(eol)));
  // sanity: the solution lands inside the rule (leather: at the reference refine; cloth: at every condition), and every piece's two stats grow with the tier
  for (const s of sols) {
    if (w.centered) for (const r of ratios(w, s.tier, s.cf, s.sf, shares)) expect(Math.abs(r - 1), `${w.name} tier ${s.tier}`).toBeLessThan(0.05);
    else expect(Math.abs(setCP(w, s.tier, 0, s.cf, s.sf, shares) / plateCPm(w, s.tier, 0, false) - 1)).toBeLessThan(0.05);
  }
  for (const slot of slots)
    for (let t = 2; t <= 6; t++) {
      const [pc, ps] = sols[t - 2].pieces[idOf(w, slot, t - 1)];
      const [c, v] = sols[t - 1].pieces[idOf(w, slot, t)];
      expect(c, `${idOf(w, slot, t)} ${w.fields[0]}`).toBeGreaterThan(pc);
      expect(v, `${idOf(w, slot, t)} ${w.fields[1]}`).toBeGreaterThan(ps);
    }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Phase 3: the weapon lines (bow, crossbow, staff, scepter). The molde is the same, with one slot instead of five: the weapon keeps WEAPON_KEEP of the SWORD's damage (and the sword's crit chance, its own base like
// the axe's), and the stats of its line are solved so that the hero wearing it is worth the CP of the same hero wearing the sword of the tier (plate everywhere else, the reference hero of the tier at +0 / +4 / +8,
// with and without the set bonuses: the same six conditions). Hard constraints first, then parity inside them (the lesson of phase 2b):
//   - every stat the player reads on the piece (total crit chance, attack speed, crit multiplier, regeneration) is STRICTLY increasing with the tier;
//   - the CP the piece adds to the fixed reference hero (pieceGain, the chain rule R5 of itemBalance.test.ts) grows by at least STEP_TARGET a tier;
//   - the regeneration keeps the reference hero's sigma under the sustain limit of the cloth line (SIGMA_LIMIT);
//   - the speed of the bow never takes the hero past the 400 ms floor (nothing above it is worth CP, so the number would lie);
//   - every one of the six conditions stays inside +-WORST_DRIFT of the sword.
// A tier for which no choice satisfies all of that is NOT forced: the generator throws and says which constraint breaks.
// Candidates per tier: parity offsets e in a grid (the weapon sits 1 + e times the sword's CP at the middle of its six conditions) and, for the bow, the share rho of the speed against the crit chance that
// the half-power rule gives (the CP of the crit chance alone equals the CP of the speed alone); a dynamic program over the six tiers picks the least total e^2 among the paths that respect the ladders.
type WField = 'critChance' | 'attackSpeedBonus' | 'critMultBonus' | 'hpRegenPct';
interface WeaponSpec {
  line: 'bow' | 'crossbow' | 'staff' | 'scepter';
  ids: string[];
  fields: WField[]; // the returned stats; for the bow two (crit chance ADDED to the sword's, speed), otherwise one
  sustain: boolean;
}
const WDEC: Record<WField, number> = { critChance: 4, attackSpeedBonus: 4, critMultBonus: 4, hpRegenPct: 5 };
const WMAX: Record<WField, number> = { critChance: 0.9, attackSpeedBonus: 3, critMultBonus: 20, hpRegenPct: 0.5 };
const WFIELDS_OF: Record<WeaponSpec['line'], WField[]> = {
  bow: ['attackSpeedBonus', 'critMultBonus'],
  crossbow: ['critMultBonus'],
  staff: ['critMultBonus'],
  scepter: ['hpRegenPct'],
};
const WEAPONS: WeaponSpec[] = WEAPON_LINES.map((l) => ({ line: l.line, ids: l.ids, fields: WFIELDS_OF[l.line], sustain: l.line === 'scepter' }));
type WVals = Partial<Record<WField, number>>;
const swordOf = (t: number) => getGear(SWORD_TWINS[t - 1]);

// Lends the returned stats to the weapon of tier t (in memory only); the crit chance of the piece is the sword's plus the returned part.
function lendW(spec: WeaponSpec, t: number, vals: WVals): void {
  const g = getGear(spec.ids[t - 1]) as unknown as Record<string, number | undefined>;
  const crit = rnd((swordOf(t).critChance ?? 0) * WEAPON_CRIT_KEEP[spec.line] + (vals.critChance ?? 0), 4);
  g.critChance = crit > 0 ? crit : undefined;
  for (const f of ['attackSpeedBonus', 'critMultBonus', 'hpRegenPct'] as const) g[f] = (vals[f] ?? 0) > 0 ? vals[f] : undefined;
}
// the reference hero of tier t, with the weapon of the line instead of the sword
function heroW(spec: WeaponSpec, t: number, refine: number): SaveData {
  const h = buildHero(TIER_LEVEL[t - 1], t, refine);
  const id = spec.ids[t - 1];
  const inst = createGearInstance(id, { id: `gi_w_${id}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
  return { ...h, gearInstances: { ...h.gearInstances, [inst.id]: inst }, equipped: { ...h.equipped, weapon: inst.id } };
}
const cpOf = (h: SaveData, sets: boolean): number => (sets ? computeCP(h) : withoutSetBonuses(() => computeCP(h)));
const swordMemo = new Map<string, number>();
const swordCP = (t: number, refine: number, sets: boolean): number => {
  const k = `${t}:${refine}:${sets}`;
  let v = swordMemo.get(k);
  if (v === undefined) swordMemo.set(k, (v = cpOf(buildHero(TIER_LEVEL[t - 1], t, refine), sets)));
  return v;
};
function ratiosW(spec: WeaponSpec, t: number, vals: WVals): number[] {
  lendW(spec, t, vals);
  return CONDITIONS.map(([r, st]) => cpOf(heroW(spec, t, r), st) / swordCP(t, r, st));
}
const worstSigmaW = (spec: WeaponSpec, t: number, vals: WVals): number => {
  lendW(spec, t, vals);
  return Math.max(...[0, 4, 8].map((r) => sigmaOf(heroW(spec, t, r))));
};

// The archer of tier t: the full leather set of the tier and the bow (plus the plate ring of the reference hero), at the refine level r.
const BOW_MAX_CRIT = 0.95; // the engine clips crit chance at 1; the archer stays under this, so no point of it is thrown away
const BOW_MIN_MS = 450; // the attack-interval floor is 400 ms; the archer keeps this much room
function archerHero(spec: WeaponSpec, t: number, refine: number): SaveData {
  const h = heroW(spec, t, refine);
  const instances = { ...h.gearInstances };
  const equipped = { ...h.equipped } as unknown as Record<string, string | null>;
  for (const l of LEATHER_LINES) {
    const inst = createGearInstance(l.ids[t - 1], { id: `gi_arch_${l.ids[t - 1]}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
    instances[inst.id] = inst;
    equipped[l.slot] = inst.id;
  }
  return { ...h, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
}
function archerOk(spec: WeaponSpec, t: number, vals: WVals): boolean {
  lendW(spec, t, vals);
  return [0, 4, 8].every((r) => {
    const s = buildCombatStats(archerHero(spec, t, r));
    return s.critChance <= BOW_MAX_CRIT && s.heroMs >= BOW_MIN_MS;
  });
}
// the largest bow speed that keeps the archer's interval at BOW_MIN_MS or more
function bowSpeedCap(spec: WeaponSpec, t: number): number {
  const ok = (y: number): boolean => { lendW(spec, t, { attackSpeedBonus: y }); return buildCombatStats(archerHero(spec, t, 0)).heroMs >= BOW_MIN_MS; };
  let lo = 0, hi = WMAX.attackSpeedBonus;
  if (ok(hi)) return hi;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

interface WCand {
  vals: WVals;
  e: number;
  total: Partial<Record<WField, number>>; // what the player reads on the piece
  ratios: number[];
  gain: number;
  rho?: number;
}
const W_OFFSETS = Array.from({ length: 19 }, (_, k) => -0.045 + k * 0.005);

function candidates(spec: WeaponSpec, t: number): WCand[] {
  const out: WCand[] = [];
  const sword = swordOf(t);
  const mk = (vals: WVals, rho?: number): WCand | undefined => {
    const v: WVals = {};
    for (const f of spec.fields) v[f] = rnd(vals[f] ?? 0, WDEC[f]);
    const rs = ratiosW(spec, t, v);
    if (Math.max(...rs) > 1 + WORST_DRIFT || Math.min(...rs) < 1 - WORST_DRIFT) return undefined;
    if (spec.sustain && worstSigmaW(spec, t, v) > SIGMA_LIMIT) return undefined;
    // the archer (full leather set + the bow, plate ring) must not waste crit chance past the cap and must keep room under the attack-interval floor, at every refine, set bonuses on
    if (spec.line === 'bow' && !archerOk(spec, t, v)) return undefined;
    const total: WCand['total'] = { critChance: rnd((sword.critChance ?? 0) * WEAPON_CRIT_KEEP[spec.line] + (v.critChance ?? 0), 4) };
    for (const f of spec.fields) if (f !== 'critChance') total[f] = v[f];
    lendW(spec, t, v);
    return { vals: v, e: midrange(rs) - 1, total, ratios: rs, gain: pieceGain(spec.ids[t - 1]), rho };
  };
  if (spec.fields.length === 1) {
    const f = spec.fields[0];
    const mid = (x: number): number => midrange(ratiosW(spec, t, { [f]: x }));
    for (const e of W_OFFSETS) {
      if (mid(WMAX[f]) < 1 + e || mid(0) > 1 + e) continue;
      const x = bisect((v) => mid(v), 1 + e, 0, WMAX[f]);
      const c = mk({ [f]: x });
      if (c) out.push(c);
    }
    return out;
  }
  // the bow: its crit chance is a fixed fraction of the sword's (WEAPON_CRIT_KEEP), so the armor (crit chance) and the bow (speed) never stack the same stat: it returns its budget as attack speed, and as crit
  // multiplier only if the speed reaches the cap that keeps the archer (full leather set, +8, the bow, the ring) above BOW_MIN_MS. The same archer must stay under BOW_MAX_CRIT of crit chance (mk checks it).
  const ycap = bowSpeedCap(spec, t);
  const at = (y: number, m: number): WVals => ({ attackSpeedBonus: y, critMultBonus: m });
  const mid = (y: number, m: number): number => midrange(ratiosW(spec, t, at(y, m)));
  for (const e of W_OFFSETS) {
    if (mid(0, 0) > 1 + e) continue;
    if (mid(ycap, 0) >= 1 + e) {
      const y = bisect((v) => mid(v, 0), 1 + e, 0, ycap);
      const c = mk(at(y, 0));
      if (c) out.push(c);
    } else if (mid(ycap, WMAX.critMultBonus) >= 1 + e) {
      const m = bisect((v) => mid(ycap, v), 1 + e, 0, WMAX.critMultBonus);
      const c = mk(at(ycap, m));
      if (c) out.push(c);
    }
  }
  return out;
}

const W_STEP = STEP_TARGET;
function solveWeaponLine(spec: WeaponSpec): WCand[] {
  const cands = [1, 2, 3, 4, 5, 6].map((t) => candidates(spec, t));
  cands.forEach((c, i) => console.log(`[${spec.line}] T${i + 1}: ${c.length} candidates inside the rule`));
  cands.forEach((c, i) => { if (c.length === 0) throw new Error(`${spec.line} tier ${i + 1}: no choice of ${spec.fields.join(' + ')} keeps the six conditions inside +-${WORST_DRIFT * 100} % of the sword (and under the sustain / speed limits)`); });
  const fieldsOf = ['critChance', ...spec.fields.filter((f) => f !== 'critChance')] as WField[];
  // every stat the player reads goes up; an optional stat (the bow's overflow into crit multiplier) may be absent at both tiers
  const ladder = (a: WCand, b: WCand): boolean => fieldsOf.every((f) => (b.total[f] ?? 0) > (a.total[f] ?? 0) || ((a.total[f] ?? 0) === 0 && (b.total[f] ?? 0) === 0 && f === 'critMultBonus'));
  const step = (a: WCand, b: WCand): boolean => b.gain / a.gain >= W_STEP;
  const run = (useLadder: boolean, useStep: boolean): { path?: WCand[] } => {
    const cost = cands.map((c) => c.map(() => Infinity));
    const from = cands.map((c) => c.map(() => -1));
    cands[0].forEach((c, k) => (cost[0][k] = c.e * c.e));
    for (let t = 1; t < 6; t++)
      cands[t].forEach((c, k) =>
        cands[t - 1].forEach((p, j) => {
          if (!Number.isFinite(cost[t - 1][j])) return;
          if (useLadder && !ladder(p, c)) return;
          if (useStep && !step(p, c)) return;
          const v = cost[t - 1][j] + c.e * c.e;
          if (v < cost[t][k]) { cost[t][k] = v; from[t][k] = j; }
        }),
      );
    let k = cost[5].indexOf(Math.min(...cost[5]));
    if (!Number.isFinite(cost[5][k])) return {};
    const path: WCand[] = [];
    for (let t = 5; t >= 0; t--) { path[t] = cands[t][k]; k = from[t][k]; }
    return { path };
  };
  const full = run(true, true);
  if (!full.path) {
    const noStep = run(true, false);
    const noLadder = run(false, true);
    throw new Error(`${spec.line}: no path through the six tiers with every stat increasing AND every chain step >= ${W_STEP}. Ladder only: ${noStep.path ? 'feasible' : 'infeasible'}; steps only: ${noLadder.path ? 'feasible' : 'infeasible'}.`);
  }
  return full.path;
}

function solveWeapons(): void {
  const rows: string[] = [];
  const lines: string[] = [];
  for (const spec of WEAPONS) {
    const path = solveWeaponLine(spec);
    path.forEach((c, i) => {
      const t = i + 1;
      lendW(spec, t, c.vals);
      const rs = c.ratios.map((r) => r.toFixed(4));
      const sg = spec.sustain ? `  sigma ${worstSigmaW(spec, t, c.vals).toFixed(3)} / ${SIGMA_LIMIT.toFixed(3)}` : '';
      const step = i > 0 ? `  step ${(c.gain / path[i - 1].gain).toFixed(3)}` : '';
      rows.push(`${spec.line} T${t} ${spec.ids[i]}  ${spec.fields.map((f) => `${f} ${c.vals[f]}`).join('  ')}${c.rho ? ` (rho ${c.rho})` : ''}  total crit ${c.total.critChance}  weapon/sword CP: pieces +0 ${rs[0]} +4 ${rs[1]} +8 ${rs[2]} | sets +0 ${rs[3]} +4 ${rs[4]} +8 ${rs[5]}  gain ${c.gain.toFixed(3)}${step}${sg}`);
      lines.push(`  ${spec.ids[i]}: { ${spec.fields.filter((f) => (c.vals[f] ?? 0) > 0).map((f) => `${f}: ${c.vals[f]}`).join(', ')} },`);
    });
  }
  console.log('\n' + rows.join('\n'));
  const block = `// BEGIN weightBudget.weapon.gen\nconst WEAPON_CONVERSION: Record<string, { critChance?: number; attackSpeedBonus?: number; critMultBonus?: number; hpRegenPct?: number }> = {\n${lines.join('\n')}\n};\n// END weightBudget.weapon.gen`;
  const src = readFileSync(GEAR_TS, 'utf8');
  const re = /\/\/ BEGIN weightBudget\.weapon\.gen\r?\n[\s\S]*?\/\/ END weightBudget\.weapon\.gen/;
  expect(re.test(src), 'markers of the weapons in gear.ts').toBe(true);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(GEAR_TS, src.replace(re, () => block.split('\n').join(eol)));
}

describe('weight budget generator', () => {
  it('solves the leather conversion per tier and writes the block into gear.ts', () => {
    solveAndWrite(LEATHER);
  });
  it('solves the cloth conversion per tier (crit multiplier + regeneration, regeneration kept under the sustain guard) and writes the block into gear.ts', () => {
    solveAndWrite(CLOTH);
  });
  it('solves the weapon lines (bow, crossbow, staff, scepter) against the sword of the tier and writes the block into gear.ts', () => {
    solveWeapons();
  });
});
