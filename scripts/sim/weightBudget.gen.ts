// Classes reform, phase 2a (docs/CLASSES_E_EQUIPAMENTOS.md 2.4): solves, per tier, how much crit chance and attack speed the leather line gets back for the 40 % of the defense it gives up,
// so that a FULL leather set (armor, helmet, gloves, boots, quiver) is worth the CP of the full plate set of the same tier (the sword and the ring stay the tier's), and writes the
// result into the LEATHER_CONVERSION block of src/game/gear.ts. Run it with:
//   npx vitest run --config vitest.sim.config.ts weightBudget
// It uses the real engine (computeCP / buildCombatStats), never a copy of the formula. itemBalance.test.ts checks the +-5 % parity on the committed numbers, so a stale table fails there.
//
// Method, per tier T (reference hero: the level that opens the tier, the tier's weapon and ring, common pieces, attribute points spread like the sim player):
//   1. the five leather pieces keep LEATHER_KEEP of their plate twin's defense (gear.ts derives that on its own) and carry no crit / speed yet: that is L0, below the plate set;
//   2. the budget they gave up is returned as a TOTAL crit chance Cf and a TOTAL attack speed Sf, split between the five pieces by the share of CP each plate twin is worth
//      (pieceGain, averaged over the six tiers so a slot has ONE share: per-tier shares made a piece's crit go DOWN from one tier to the next), "half of the power in each": the CP
//      that Cf alone adds to L0 equals the CP that Sf alone adds;
//   3. Cf is the one number that makes the whole set equal to the plate set's CP (bisection; Sf follows Cf through step 2). That is the EXACT solution of the tier;
//   4. the chain rules of itemBalance.test.ts (R5) judge every piece against the piece of the previous tier, on ONE fixed reference hero (tierSteps.ts): its stats must beat the
//      previous tier's and the CP it adds must grow by at least 15 % a tier. Percent returns (crit, speed) are worth the same to every hero while flat defense is worth less to a stronger
//      one, so the exact solutions of two neighbouring tiers can fall a point or two short of that step. The totals of each tier are then scaled by a factor mu (one per tier, both totals
//      together) that starts at 1: whenever a step is short, the higher tier goes up and the lower one down by a hair, until every step clears. mu is bounded so every set stays inside
//      +-MAX_DRIFT of the plate set's CP (the rule is +-5 %); the report prints where each tier ended.
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeCP } from '../../src/game/engine';
import { createGearInstance } from '../../src/game/gearInstances';
import { getGear, LEATHER_LINES } from '../../src/game/gear';
import { buildHero } from './ladder';
import { pieceGain } from './tierSteps';
import { withoutSetBonuses } from './duel';
import type { SaveData } from '../../src/game/engine';

const GEAR_TS = resolve(__dirname, '../../src/game/gear.ts');
// the hero level that opens each tier (the gates of the plate weapon / armor)
const TIER_LEVEL = [1, 10, 25, 50, 70, 90];
const SLOTS = LEATHER_LINES.map((l) => l.slot as string);
const round4 = (x: number): number => Math.round(x * 10000) / 10000;
const STEP_TARGET = 1.152; // the 15 % step of itemBalance.test.ts, plus a hair
const MAX_DRIFT = 0.045; // the set may end this far from parity (the rule is +-5 %)
const MU_NUDGE = 0.002;

const idOf = (slot: string, t: number): string => LEATHER_LINES.find((l) => l.slot === slot)!.ids[t - 1];
const twinOf = (slot: string, t: number): string => LEATHER_LINES.find((l) => l.slot === slot)!.twins[t - 1];

// The reference hero of tier t wearing the leather pieces of `leather` slots (the plate ones elsewhere).
function heroWith(t: number, refine: number, leather: boolean): SaveData {
  const h = buildHero(TIER_LEVEL[t - 1], t, refine);
  if (!leather) return h;
  const instances = { ...h.gearInstances };
  const equipped = { ...h.equipped } as unknown as Record<string, string | null>;
  for (const slot of SLOTS) {
    const inst = createGearInstance(idOf(slot, t), { id: `gi_leather_${idOf(slot, t)}`, origin: 'craft', rarity: 'common', substats: [], upgrade: refine });
    instances[inst.id] = inst;
    equipped[slot] = inst.id;
  }
  return { ...h, gearInstances: instances, equipped: equipped as unknown as SaveData['equipped'] };
}

type Shares = Record<string, number>;
// Lends the totals to the five templates of the tier (in memory only).
function lend(t: number, cf: number, sf: number, shares: Shares): void {
  for (const slot of SLOTS) {
    const g = getGear(idOf(slot, t));
    const c = round4(cf * shares[slot]);
    const s = round4(sf * shares[slot]);
    g.critChance = c > 0 ? c : undefined;
    g.attackSpeedBonus = s > 0 ? s : undefined;
  }
}
function leatherCP(t: number, refine: number, cf: number, sf: number, shares: Shares, sets = false): number {
  lend(t, cf, sf, shares);
  const h = heroWith(t, refine, true);
  return sets ? computeCP(h) : withoutSetBonuses(() => computeCP(h));
}
const plateCP = (t: number, refine: number, sets = false): number => {
  const h = heroWith(t, refine, false);
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
function slotShares(): Shares {
  const acc: Shares = Object.fromEntries(SLOTS.map((s) => [s, 0]));
  for (let t = 1; t <= 6; t++) {
    const gains = Object.fromEntries(SLOTS.map((s) => [s, pieceGain(twinOf(s, t))]));
    const sum = SLOTS.reduce((a, s) => a + gains[s], 0);
    for (const s of SLOTS) acc[s] += gains[s] / sum / 6;
  }
  return acc;
}

// Steps 1-3: the totals that make the set of tier t worth exactly the plate set.
function exactTotals(t: number, shares: Shares): { cf: number; sf: number } {
  const base = leatherCP(t, 0, 0, 0, shares);
  const target = plateCP(t, 0);
  const CRIT_MAX = 0.9;
  const SPEED_MAX = 3;
  // the speed total that is worth exactly what a given crit total is worth
  const speedFor = (cf: number): number => {
    const critGain = leatherCP(t, 0, cf, 0, shares) - base;
    return bisect((sf) => leatherCP(t, 0, 0, sf, shares) - base, critGain, 0, SPEED_MAX);
  };
  if (leatherCP(t, 0, CRIT_MAX, speedFor(CRIT_MAX), shares) < target) throw new Error(`tier ${t}: the budget cannot be returned inside crit <= ${CRIT_MAX}`);
  const cf = bisect((c) => leatherCP(t, 0, c, speedFor(c), shares), target, 0, CRIT_MAX);
  return { cf, sf: speedFor(cf) };
}

interface TierSolution {
  tier: number;
  cf: number;
  sf: number;
  mu: number;
  pieces: Record<string, [number, number]>;
}

// Step 4: the per-tier factors that clear the chain steps.
function relax(exact: { cf: number; sf: number }[], shares: Shares): TierSolution[] {
  const mu = exact.map(() => 1);
  const MU_MIN = 1 - MAX_DRIFT;
  const MU_MAX = 1 + MAX_DRIFT;
  const apply = (): void => exact.forEach((e, i) => lend(i + 1, e.cf * mu[i], e.sf * mu[i], shares));
  for (let iter = 0; iter < 400; iter++) {
    apply();
    const gains = exact.map((_, i) => Object.fromEntries(SLOTS.map((s) => [s, pieceGain(idOf(s, i + 1))])));
    let short = false;
    for (let i = 1; i < exact.length; i++) {
      if (SLOTS.every((s) => gains[i][s] / gains[i - 1][s] >= STEP_TARGET)) continue;
      short = true;
      mu[i] = Math.min(MU_MAX, mu[i] * (1 + MU_NUDGE));
      mu[i - 1] = Math.max(MU_MIN, mu[i - 1] * (1 - MU_NUDGE));
    }
    if (!short) {
      return exact.map((e, i) => {
        const cf = e.cf * mu[i];
        const sf = e.sf * mu[i];
        const pieces: Record<string, [number, number]> = {};
        for (const s of SLOTS) pieces[idOf(s, i + 1)] = [round4(cf * shares[s]), round4(sf * shares[s])];
        return { tier: i + 1, cf, sf, mu: mu[i], pieces };
      });
    }
  }
  throw new Error(`the chain steps cannot be cleared with every set inside +-${MAX_DRIFT * 100} % of the plate set (mu ${mu.map((m) => m.toFixed(3)).join(' ')})`);
}

describe('weight budget generator', () => {
  it('solves the leather conversion per tier and writes the block into gear.ts', () => {
    const shares = slotShares();
    console.log('slot shares', JSON.stringify(Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, round4(v)]))));
    const exact = [1, 2, 3, 4, 5, 6].map((t) => exactTotals(t, shares));
    const sols = relax(exact, shares);
    // report
    const rows: string[] = [];
    for (const s of sols) {
      const t = s.tier;
      const cell = (refine: number, sets: boolean): string => (leatherCP(t, refine, s.cf, s.sf, shares, sets) / plateCP(t, refine, sets)).toFixed(4);
      rows.push(
        `T${t}  critTotal ${s.cf.toFixed(4)}  speedTotal ${s.sf.toFixed(4)}  (exact ${exact[t - 1].cf.toFixed(4)} / ${exact[t - 1].sf.toFixed(4)}, mu ${s.mu.toFixed(3)})  CP leather/plate  +0 ${cell(0, false)}  +4 ${cell(4, false)}  +8 ${cell(8, false)}  | with set bonuses +0 ${cell(0, true)} +8 ${cell(8, true)}  | plate CP ${plateCP(t, 0)}`,
      );
    }
    console.log('\n' + rows.join('\n'));
    // write the block
    const lines = sols.flatMap((s) => Object.entries(s.pieces).map(([id, [c, v]]) => `  ${id}: [${c}, ${v}],`));
    const block = `// BEGIN weightBudget.gen\nconst LEATHER_CONVERSION: Record<string, [number, number]> = {\n${lines.join('\n')}\n};\n// END weightBudget.gen`;
    const src = readFileSync(GEAR_TS, 'utf8');
    const re = /\/\/ BEGIN weightBudget\.gen\r?\n[\s\S]*?\/\/ END weightBudget\.gen/;
    expect(re.test(src), 'markers in gear.ts').toBe(true);
    // keep the file's own line endings (a checkout with autocrlf has CRLF)
    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    writeFileSync(GEAR_TS, src.replace(re, () => block.split('\n').join(eol)));
    // sanity: the solution lands inside the rule at the reference refine, and every piece's crit and speed grow with the tier
    for (const s of sols) expect(Math.abs(leatherCP(s.tier, 0, s.cf, s.sf, shares) / plateCP(s.tier, 0) - 1)).toBeLessThan(0.05);
    for (const slot of SLOTS)
      for (let t = 2; t <= 6; t++) {
        const [pc, ps] = sols[t - 2].pieces[idOf(slot, t - 1)];
        const [c, v] = sols[t - 1].pieces[idOf(slot, t)];
        expect(c, `${idOf(slot, t)} crit`).toBeGreaterThan(pc);
        expect(v, `${idOf(slot, t)} speed`).toBeGreaterThan(ps);
      }
  });
});
