// The game numbers the material server needs (see materialTables.gen.ts, which writes them to supabase/functions/_shared/materials/tables.ts): which materials can be tradeable, the
// most units an hour a claim of each kind can honestly report (the plausibility ceilings), and the Garden's plants. The Edge Function runs in Deno and cannot import the game, so the numbers
// are copied by a script; src/game/__tests__/materialServer.test.ts fails when the copy is stale.
import { HUNTING_DEPTHS, HUNTING_ZONES } from '../../src/game/huntingZones';
import { PLANTS } from '../../src/game/garden';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import { TRADEABLE_MATERIALS } from '../../src/game/tradeableMaterials';
import { GARDEN_SLOTS } from '../../src/game/engine';
import { HERO_SKILLS } from '../../src/game/heroSkills';
import T from '../../src/game/tunables';

/** Slack on every ceiling: rounding of the claim time, the Lure and every small bonus the formulas below do not list one by one. */
export const CEILING_SLACK = 1.15;

export function buildMaterialTables() {
  const maxRolls = T.hunting.economicReferenceKillsPerHour * T.hunting.economicRollCap;
  const depthMax = (rarity: 'common' | 'uncommon' | 'rare') => Math.max(...HUNTING_DEPTHS.map((d) => d.dropMultiplier[rarity]));
  const subBonus = { common: T.hunting.subLevelDropBonusCommon, uncommon: T.hunting.subLevelDropBonusUncommon, rare: T.hunting.subLevelDropBonusRare };
  const subMax = (rarity: 'common' | 'uncommon' | 'rare') => 1 + subBonus[rarity] * (T.hunting.subLevels - 1);
  const scentRanks = HERO_SKILLS.find((s) => s.id === 'h_scent')!.maxRank;
  const materialsMult = 1 + scentRanks * T.heroSkills.scentMaterials;
  const passMult = T.battlePass.dropRateMultiplier;

  // Hunting: units an hour of each drop of each zone = the most economic rolls an hour x the drop's chance x the best depth x the best sub-level x the Pass x the Faro skill x the Lure (uncommon and rare).
  const hunt: Record<string, Record<string, number>> = {};
  for (const z of HUNTING_ZONES) {
    hunt[z.id] = {};
    for (const d of z.drops) {
      const lure = d.rarity === 'common' ? 1 : 1 + T.consumables.baitDropPct;
      const perHour = maxRolls * d.chance * d.qty * depthMax(d.rarity) * subMax(d.rarity) * passMult * materialsMult * lure * CEILING_SLACK;
      hunt[z.id][d.material] = Math.max(perHour, (hunt[z.id][d.material] ?? 0));
    }
  }

  // Garden: units an hour of ONE plot of each plant, at the fastest growth (both speed perks) and with the rare-plant bonus.
  const speed = 1 - 2 * T.mastery.gardenSpeedPct;
  const garden: Record<string, { baseQty: number; durationMs: number; perPlotHour: number }> = {};
  for (const p of PLANTS) {
    const qty = p.qty + (p.rarity === 'rare' ? T.mastery.gardenRareBonus : 0);
    garden[p.material] = { baseQty: p.qty, durationMs: p.durationMs, perPlotHour: Math.round((qty / ((p.durationMs / 3_600_000) * speed)) * CEILING_SLACK * 1000) / 1000 };
  }

  // How the game classes each material: the zone's own rarity for a Hunting drop, the tier for an ore or a wood (tiers 1-2 common, 3-4 uncommon, 5 rare, like wholesale.ts), the plant's own rarity.
  // rates.ts keeps one chance per class (and says where it deviates).
  const klass: Record<string, string> = {};
  const tier = (i: number): string => (i >= 4 ? 'rare' : i >= 2 ? 'uncommon' : 'common');
  ORE_TIERS.forEach((o, i) => (klass[o.id] = tier(i)));
  WOOD_TIERS.forEach((w, i) => (klass[w.id] = tier(i)));
  for (const p of PLANTS) klass[p.material] = p.rarity;
  for (const z of HUNTING_ZONES) for (const d of z.drops) klass[d.material] = d.rarity;

  return {
    ids: [...TRADEABLE_MATERIALS],
    hunt,
    mining: ORE_TIERS.map((o) => o.id as string),
    woodcutting: WOOD_TIERS.map((w) => w.id as string),
    garden,
    plots: GARDEN_SLOTS,
    gardenSpeedSlack: Math.round((1 / speed) * 1000) / 1000,
    klass,
  };
}
