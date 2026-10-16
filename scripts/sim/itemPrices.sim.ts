// Plausible price bands of a piece of gear by tier and rarity (Rodada 24, docs/ECONOMY_AUDIT.md section 23). THESE ARE ESTIMATES: the game sells no gear to anyone (the market of players has
// no price list), so the numbers are built from what a piece costs to make and what its power is worth, in reference Gold (economy.ts baseGoldValue, the unit of the whole audit).
//   own cost   what forging ONE piece of the tier costs (Gold + materials at reference value + Aether and gems at 2 each), the average of the seven slots.
//   value      what the extra power of the rarity is worth to a buyer: a tier is a step of CP (the common +8 set of tier t against the one of tier t-1) that costs `own cost` per piece to climb, so a
//              rarity that adds a fraction f of that step is worth own cost x (1 + f). It is the price at which buying the piece is exactly as good as crafting the power yourself.
//   band       value x 1 up to value x the scarcity premium (rare 1.2, epic 1.35, legendary 1.8: the fewer pieces for sale, the nearer the seller gets to the buyer's limit).
//   floor      what a seller who FORGES FOR the rarity spends: own cost x the pieces forged for one (63 / 25 / 10 / 2 %), counting the pieces that fail as salvaged (45 % of the materials back).
//              Above the band for Epic and Legendary from tier 4: nobody forges to sell, the market lives on the by-product of people forging their own set.
// Run it with `npm run sim:prices`; it asserts nothing. Env: SIM_RARITY (JSON, the same override as the other rarity tools).
import { it } from 'vitest';
import { computeCP } from '../../src/game/engine';
import { getGear, GearItem } from '../../src/game/gear';
import { cargoReferenceValue } from '../../src/game/economy';
import { RARITIES, Rarity } from '../../src/game/rarity';
import T from '../../src/game/tunables';
import { rarityHero } from './rarityHero';
import { buildHero } from './ladder';
import { SET_SLOTS } from './setCost';
import { tierOwnHours } from './farmHours';
import type { MaterialId } from '../../src/game/materials';

if (process.env.SIM_RARITY) {
  for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_RARITY) as Record<string, Record<string, number>>)) Object.assign(RARITIES.find((r) => r.id === id)!, over);
}

const GEM_SHARD_COST = 2;
const SALVAGE = T.economySinks.salvageRecoveryRate;
const LEVEL = [1, 20, 40, 62, 62, 75, 90]; // hero level of a set of the tier, only to give the CP hero a level
const PREMIUM: Record<Rarity, number> = { common: 1, rare: 1.2, epic: 1.35, legendary: 1.8 };

const mats = (item: GearItem) => cargoReferenceValue((item.recipe?.materials ?? {}) as Partial<Record<MaterialId, number>>);
const ownGold = (item: GearItem): number => {
  const gems = Object.values(item.recipe?.gems ?? {}).reduce((a, b) => a + (b as number), 0);
  return item.cost + mats(item) + ((item.recipe?.shards ?? 0) + gems * GEM_SHARD_COST) * 2;
};
// Average of the seven slots of a tier.
const avg = (tier: number, f: (g: GearItem) => number): number => Object.values(SET_SLOTS).reduce((a, line) => a + f(getGear(line[tier - 1])), 0) / 7;

it('prints the estimated price bands', () => {
  const own = [0, 1, 2, 3, 4, 5, 6].map((t) => (t === 0 ? 0 : avg(t, ownGold)));
  const ownMats = [0, 1, 2, 3, 4, 5, 6].map((t) => (t === 0 ? 0 : avg(t, mats)));
  const hours = [0, 1, 2, 3, 4, 5, 6].map((t) => (t === 0 ? 0 : tierOwnHours(t) / 7));
  // CP of the common +8 set of every tier (tier 0 = the hero with no gear): the step of CP a tier is.
  const commonCp = [0, 1, 2, 3, 4, 5, 6].map((t) => (t === 0 ? computeCP(buildHero(LEVEL[0], 0, 0, 100)) : computeCP(rarityHero(LEVEL[t], t, 8, 'common'))));
  const header = ['| tier | own cost of one forge (ref. Gold) | hunting hours of one piece | CP of the common +8 set | step from the tier below |', '| --- | --: | --: | --: | --: |'];
  for (let t = 1; t <= 6; t++) header.push(`| T${t} | ${Math.round(own[t])} | ${hours[t].toFixed(2)} | ${Math.round(commonCp[t])} | +${Math.round(commonCp[t] - commonCp[t - 1])} |`);

  const rows = ['| piece | chance | pieces forged for one | set CP vs common +8 | worth to a buyer (ref. Gold) | plausible band (estimate) | floor if forged to sell |', '| --- | --: | --: | --: | --: | --: | --: |'];
  for (let t = 1; t <= 6; t++) {
    for (const r of RARITIES) {
      const cp = computeCP(rarityHero(LEVEL[t], t, 8, r.id));
      const f = (cp - commonCp[t]) / (commonCp[t] - commonCp[t - 1]);
      const value = own[t] * (1 + f);
      const forges = 1 / r.chance;
      const floor = own[t] * (1 + (forges - 1) * (1 - SALVAGE * (ownMats[t] / Math.max(1, own[t]))));
      const band = r.id === 'common' ? `${Math.round(own[t])}` : `${Math.round(value)} - ${Math.round(value * PREMIUM[r.id])}`;
      rows.push(`| T${t} ${r.id} | ${(r.chance * 100).toFixed(0)}% | ${forges.toFixed(1)} | ${(cp / commonCp[t]).toFixed(2)} | ${Math.round(value)} | ${band} | ${Math.round(floor)} |`);
    }
  }
  console.log(['', ...header, '', ...rows].join('\n'));
}, 600_000);
