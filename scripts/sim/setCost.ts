// Static cost of a full 7-slot gear set (Rodada 9): every hunting / mining / woodcutting unit one set needs through its whole recipe chain (previous-tier
// pieces included), and the hours of each activity that takes at the stage where it is farmed. Used by materialFlow.sim.ts (the report) and recipeTune.gen.ts.
import { getGear, Recipe } from '../../src/game/gear';
import { getHuntingDepthDef, HUNTING_ZONES, subLevelDropMultiplier } from '../../src/game/huntingZones';
import { REFINING_RECIPES } from '../../src/game/refining';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import T from '../../src/game/tunables';

export type Need = Partial<Record<string, number>>;
export const addNeed = (into: Need, from: Need, mult = 1) => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + (v as number) * mult;
};

// refined material -> [raw input, raw units per refined unit]
export const RAW_OF: Record<string, [string, number]> = {};
for (const r of REFINING_RECIPES) {
  if (r.station === 'dust' || r.station === 'alchemy') continue;
  const [[inp, q]] = Object.entries(r.input) as [string, number][];
  RAW_OF[r.output] = [inp, q / r.outputQty];
}

export type RecipeOf = (tpl: string) => Recipe | undefined;
const defaultRecipeOf: RecipeOf = (tpl) => getGear(tpl)?.recipe;

// Everything a piece needs through its whole chain, expanded to raw units (bars / leather / handles back to ore, scrap, wood). Essence and dragon scales are
// alchemy outputs: expanded to their hunting inputs. Garden plants, Éter ('eter') and gems ('gem:ruby') are kept as they are.
export function chainNeed(tpl: string, recipeOf: RecipeOf = defaultRecipeOf, memo: Record<string, Need> = {}): Need {
  if (memo[tpl]) return memo[tpl];
  const rec = recipeOf(tpl);
  const out: Need = {};
  if (rec) {
    for (const [it, n] of Object.entries(rec.items ?? {})) addNeed(out, chainNeed(it, recipeOf, memo), n);
    for (const [m, n] of Object.entries(rec.materials ?? {}) as [string, number][]) {
      if (RAW_OF[m]) addNeed(out, { [RAW_OF[m][0]]: RAW_OF[m][1] * n });
      else if (m === 'essence') addNeed(out, { demon_core: n, corrupted_crystal: n });
      else if (m === 'dragon_scales') addNeed(out, { demon_core: 2 * n, corrupted_crystal: 2 * n });
      else addNeed(out, { [m]: n });
    }
    for (const [g, n] of Object.entries(rec.gems ?? {}) as [string, number][]) addNeed(out, { ['gem:' + g]: n });
    if (rec.shards) addNeed(out, { eter: rec.shards });
  }
  memo[tpl] = out;
  return out;
}

export const SET_SLOTS: Record<string, string[]> = {
  weapon: ['bronze_dagger', 'iron_short_sword', 'steel_greatsword', 'gilded_warblade', 'voidsteel_blade', 'abyssal_greatblade'],
  armor: ['bronze_leather', 'iron_chainmail', 'steel_plate', 'gilded_aegis', 'voidsteel_plate', 'abyssal_bulwark'],
  helmet: ['bronze_helm', 'iron_helm', 'steel_helm', 'gilded_helm', 'voidsteel_helm', 'abyssal_helm'],
  gloves: ['leather_gloves', 'iron_gauntlets', 'steel_gauntlets', 'gilded_gauntlets', 'voidsteel_gauntlets', 'abyssal_gauntlets'],
  boots: ['leather_boots', 'iron_greaves', 'steel_greaves', 'gilded_greaves', 'voidsteel_greaves', 'abyssal_greaves'],
  ring: ['copper_ring', 'silver_ring', 'gold_ring', 'ruby_ring', 'obsidian_ring', 'abyssal_ring'],
  shield: ['bronze_buckler', 'iron_shield', 'steel_kite_shield', 'gilded_shield', 'voidsteel_shield', 'abyssal_shield'],
};

export function setNeed(tier: number, recipeOf: RecipeOf = defaultRecipeOf): Need {
  const memo: Record<string, Need> = {};
  const out: Need = {};
  for (const line of Object.values(SET_SLOTS)) addNeed(out, chainNeed(line[tier - 1], recipeOf, memo));
  return out;
}

// Economic rolls per hour of an ADEQUATE build at a sub-level: K_ref (huntEconomy.ts). The fresh hero measured 142-154 kills/h, below it.
export const rollsPerHour = (subLevel: number): number => T.hunting.economicReferenceKillsPerHour / (1 + T.hunting.subLevelHpGrowth * (subLevel - 1));

export interface StageFarm {
  tier: number;
  depth: 'shallow' | 'dense' | 'deep';
  sub: number;
  zones: string[]; // hunting zones unlocked while this tier is being built (Dungeon floor 26 / 51 / 76)
  rolls: Record<string, number>; // economic rolls per hour in each zone at that stage (measured in the 21-day sim, huntEconomy.ts: capped at 1.75 x K_ref)
}
// Measured in the 21-day sim (docs/MATERIAL_FLOW.md): the fresh hero kills 142-154/h on sub-level 1 Raso; a hero past level ~20 farms the glade on Profundo
// sub-level 10 at the economic cap (224 rolls/h), the marsh at ~165 and the rift at its K_ref (~128-140). The abyss is assumed at the rift's pace. From tier 4 on
// the player hunts where the material is best (marsh + rift, then rift + abyss), not back in the glade.
export const STAGE_FARM: StageFarm[] = [
  { tier: 1, depth: 'shallow', sub: 1, zones: ['demon_glade'], rolls: { demon_glade: 154 } },
  { tier: 2, depth: 'dense', sub: 6, zones: ['demon_glade'], rolls: { demon_glade: 200 } },
  { tier: 3, depth: 'deep', sub: 10, zones: ['demon_glade', 'blood_marsh'], rolls: { demon_glade: 224, blood_marsh: 165 } },
  { tier: 4, depth: 'deep', sub: 10, zones: ['blood_marsh', 'demon_rift'], rolls: { blood_marsh: 165, demon_rift: 140 } },
  { tier: 5, depth: 'deep', sub: 10, zones: ['demon_rift', 'blood_abyss'], rolls: { demon_rift: 140, blood_abyss: 140 } },
  { tier: 6, depth: 'deep', sub: 10, zones: ['demon_rift', 'blood_abyss'], rolls: { demon_rift: 140, blood_abyss: 140 } },
];

// units/h of a hunting material in the best unlocked zone that has it, at the stage's depth and sub-level
export function huntRate(m: string, st: StageFarm, pass = 1): { zone: string; perHour: number } {
  let best = { zone: '-', perHour: 0 };
  for (const z of HUNTING_ZONES) {
    if (!st.zones.includes(z.id)) continue;
    const d = z.drops.find((x) => x.material === m);
    if (!d) continue;
    const perHour = (st.rolls[z.id] ?? rollsPerHour(st.sub)) * d.chance * getHuntingDepthDef(st.depth).dropMultiplier[d.rarity] * subLevelDropMultiplier(d.rarity, st.sub) * pass;
    if (perHour > best.perHour) best = { zone: z.id, perHour };
  }
  return best;
}
export const isHuntMat = (m: string): boolean => HUNTING_ZONES.some((z) => z.drops.some((d) => d.material === m));
export const gatherPowerAt = (skillLevel: number): number => 5 + skillLevel * T.skills.powerPerLevel;
const reqLevel = (m: string): number => ORE_TIERS.find((o) => o.id === m)?.requiredLevel ?? WOOD_TIERS.find((w) => w.id === m)?.requiredLevel ?? 1;

export function setHours(tier: number, pass = 1, recipeOf: RecipeOf = defaultRecipeOf): { hunt: number; mine: number; wood: number; huntByMat: Record<string, number>; zoneHours: Record<string, number> } {
  const need = setNeed(tier, recipeOf);
  const st = STAGE_FARM[tier - 1];
  const zoneHours: Record<string, number> = {};
  const huntByMat: Record<string, number> = {};
  let mine = 0;
  let wood = 0;
  for (const [m, n] of Object.entries(need) as [string, number][]) {
    if (isHuntMat(m)) {
      const r = huntRate(m, st, pass);
      const h = n / Math.max(1e-9, r.perHour);
      huntByMat[m] = h;
      zoneHours[r.zone] = Math.max(zoneHours[r.zone] ?? 0, h);
    } else if (ORE_TIERS.some((o) => o.id === m)) mine += n / (gatherPowerAt(reqLevel(m)) * pass);
    else if (WOOD_TIERS.some((w) => w.id === m)) wood += n / (gatherPowerAt(reqLevel(m)) * pass);
  }
  return { hunt: Object.values(zoneHours).reduce((a, b) => a + b, 0), mine, wood, huntByMat, zoneHours };
}
