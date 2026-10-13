// Round 18: the arithmetic behind the wholesale merchant's price and cap (src/game/wholesale.ts). Run: npm run sim:wholesale. It asserts nothing; src/game/__tests__/wholesale.test.ts
// keeps the curve itself. The per-day numbers are the last zone's (round 17 ledger, days 100-180, scenario A: units gathered and the share of each lost) and the hero's other Gold.
import { it } from 'vitest';
import T from '../../src/game/tunables';
import { merchantBudget, merchantPrice } from '../../src/game/merchant';
import { MaterialId } from '../../src/game/materials';
import { wholesaleMultiplier, wholesaleUnitPrice, wholesaleWeight } from '../../src/game/wholesale';
import { zoneValue } from './farmHours';

// Units per day in the last zone (Abismo) and the share the player lost, from docs/MATERIAL_FLOW.md section 9 (A, days 60-180).
const ABYSS: { id: MaterialId; perDay: number; lost: number }[] = [
  { id: 'bone_fragment', perDay: 277, lost: 0.721 },
  { id: 'concentrated_blood', perDay: 264, lost: 0.409 },
  { id: 'corrupted_crystal', perDay: 50, lost: 0.229 },
  { id: 'abyssal_marrow', perDay: 84, lost: 0.301 },
  { id: 'blood_heart', perDay: 18, lost: 0.141 },
];

const pay = (id: MaterialId, units: number, already = 0): number => Math.floor(wholesaleUnitPrice(id) * wholesaleWeight(already, units) + 1e-9);

it('prints the wholesale price curve and the income it can add', () => {
  const out: string[] = [];
  const f = (x: number, d = 0) => x.toFixed(d);
  out.push(`== curve: first ${T.wholesale.freeUnits} units at 100% of the wholesale price (${T.wholesale.priceRate * 100}% of the normal price), then -${T.wholesale.blockDrop * 100}% per block of ${T.wholesale.blockUnits}, floor ${T.wholesale.floorRate * 100}% of the normal price`);
  const steps = [0, 100, 150, 200, 250, 300, 350, 400, 600, 1000];
  out.push(`unit number:      ${steps.map((k) => String(k).padStart(5)).join('')}`);
  out.push(`share of top:     ${steps.map((k) => f(wholesaleMultiplier(k) * 100).padStart(4) + '%').join('')}`);
  out.push(`% of normal price:${steps.map((k) => f(wholesaleMultiplier(k) * T.wholesale.priceRate * 100, 1).padStart(4) + '%').join('')}`);
  out.push('== selling 100 / 500 / 2000 of one material in one day: Gold (average % of what the normal merchant pays for the same units)');
  for (const id of ['bone_fragment', 'concentrated_blood', 'corrupted_crystal', 'abyssal_marrow', 'blood_heart'] as MaterialId[]) {
    const normal = merchantPrice('material', id);
    const cells = [100, 500, 2000].map((n) => `${n}: ${pay(id, n)} (${f((pay(id, n) / (n * normal)) * 100, 1)}%)`);
    out.push(`${id} (normal ${normal}/unit, top wholesale ${wholesaleUnitPrice(id).toFixed(2)}): ${cells.join(' | ')}`);
  }
  out.push('== the last zone, per day: what the daily surplus pays, and what selling EVERYTHING gathered would pay (an upper bound: the player needs most of it)');
  let overflow = 0;
  let everything = 0;
  let normalAll = 0;
  for (const m of ABYSS) {
    const lostUnits = Math.round(m.perDay * m.lost);
    const ofs = pay(m.id, lostUnits);
    const all = pay(m.id, m.perDay);
    overflow += ofs;
    everything += all;
    normalAll += m.perDay * merchantPrice('material', m.id);
    out.push(`${m.id}: gathered ${m.perDay}, lost ${lostUnits} -> wholesale ${ofs} Gold; all ${m.perDay} -> ${all} Gold (normal merchant price of all: ${m.perDay * merchantPrice('material', m.id)})`);
  }
  const z = zoneValue('blood_abyss');
  out.push(`TOTAL per day (Abismo): surplus ${overflow} Gold; everything ${everything} Gold; the same units at the normal merchant price ${normalAll} Gold`);
  out.push(`Abismo per hour: zone Gold ${f(z.merchantContinuous - T.merchant.priceRate * z.reference, 1)} + materials at the merchant ${f(T.merchant.priceRate * z.reference, 1)} (reference ${f(z.reference)})`);
  out.push(`normal merchant daily budget at level 100: ${merchantBudget(100)} Gold`);
  console.log(out.join('\n'));
});
