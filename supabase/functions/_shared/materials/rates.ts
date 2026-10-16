// THE ONE TABLE of how often a unit of a material is the tradeable variant. Change a chance here (and redeploy material-claim) to move the supply of the market: nothing else in the server or
// the game has these numbers. docs/BALANCE_CHANGES.md (Rodada 23) has the supply this table produces per player and for 100 / 1 000 / 10 000 players (`npm run sim:materials`).
//
// A claim reports N units of a material; the server rolls each one: it is tradeable with the chance below (Binomial(N, chance), the server's own dice, never the client's).

/** The chances by class of material: common 1%, uncommon 2%, rare 3% of the units that are gathered or dropped (cut from 3/5/8% by the owner on 2026-10-16 so the market does not flood). */
export const CLASS_RATE = { common: 0.01, uncommon: 0.02, rare: 0.03 } as const;

/**
 * The chance of EVERY material that can be tradeable, spelled out (a test pins this list to the game's materials and each value to its class). Classes come from the game
 * (tables.ts MATERIAL_CLASS): a Hunting drop's own rarity, ores and woods by tier (1-2 common, 3-4 uncommon, 5 rare), a plant's rarity.
 * One deliberate exception: abyssal_marrow is an uncommon drop of the last zone but the owner counts it with the rare ones ("crystals, hearts, marrow"), so it is at the rare chance.
 */
export const TRADEABLE_CHANCE: Readonly<Record<string, number>> = {
  // Mining (ore tiers)
  copper: 0.01,
  iron: 0.01,
  silver: 0.02,
  gold_ore: 0.02,
  obsidian: 0.03,
  // Woodcutting (wood tiers)
  common_wood: 0.01,
  oak_wood: 0.01,
  ebony_wood: 0.02,
  elven_wood: 0.02,
  ancient_wood: 0.03,
  // Garden (plants)
  common_herb: 0.01,
  energy_herb: 0.01,
  iron_thistle: 0.01,
  swift_grass: 0.01,
  uncommon_root: 0.02,
  gold_blossom: 0.02,
  crimson_mushroom: 0.02,
  silver_sage: 0.02,
  rare_flower: 0.03,
  moon_lily: 0.03,
  dusk_orchid: 0.03,
  elder_root: 0.03,
  // Hunting drops
  leather_scrap: 0.01,
  bone_fragment: 0.01,
  demon_claw: 0.02,
  concentrated_blood: 0.02,
  rift_shard: 0.02,
  demon_core: 0.03,
  corrupted_crystal: 0.03,
  fiend_horn: 0.03,
  blood_heart: 0.03,
  abyssal_marrow: 0.03,
};

/** The materials whose chance is NOT the rate of their game class (see above). */
export const RATE_EXCEPTIONS: readonly string[] = ['abyssal_marrow'];

/**
 * The BEST DAY an honest fast player had, in units of each material produced (not just the tradeable ones), measured with `npm run sim:long` (scenarios A, P, PM, PW, PG and XPM: the usual
 * player, the Pass owner, the three Pass specialists and the one who checks in every 6 hours; 3 seeds, 60 days; the median over the seeds of each seed's best day, the highest of the six
 * scenarios). `npm run sim:materials` prints this table from the runs. The daily cap on tradeable units is MARGIN times (this x the chance), see materials/bounds.ts.
 */
export const HONEST_PEAK_DAY_UNITS: Readonly<Record<string, number>> = {
  iron: 645,
  copper: 663,
  silver: 941,
  gold_ore: 1076,
  obsidian: 1870,
  leather_scrap: 1149,
  demon_claw: 1199,
  demon_core: 291,
  bone_fragment: 1237,
  concentrated_blood: 1248,
  corrupted_crystal: 195,
  rift_shard: 301,
  fiend_horn: 29,
  abyssal_marrow: 194,
  blood_heart: 42,
  common_herb: 12,
  energy_herb: 24,
  uncommon_root: 16,
  crimson_mushroom: 6,
  rare_flower: 6,
  iron_thistle: 12,
  gold_blossom: 6,
  swift_grass: 12,
  moon_lily: 12,
  silver_sage: 12,
  dusk_orchid: 6,
  elder_root: 2,
  common_wood: 554,
  oak_wood: 618,
  ebony_wood: 811,
  elven_wood: 1076,
  ancient_wood: 1435,
};
