// THE ONE TABLE of how often a unit of a material is the tradeable variant. Change a chance here (and redeploy material-claim) to move the supply of the market: nothing else in the server or
// the game has these numbers. docs/BALANCE_CHANGES.md (Rodada 23) has the supply this table produces per player and for 100 / 1 000 / 10 000 players (`npm run sim:materials`).
//
// A claim reports N units of a material; the server rolls each one: it is tradeable with the chance below (Binomial(N, chance), the server's own dice, never the client's).

/** The chances by class of material: common 3%, uncommon 2%, rare 3% of the units that are gathered or dropped (owner 2026-10-16 cut 3/5/8% to 1/2/3%; on 2026-10-17 common went back up to 3% because buyers could not find common materials — Rodada 27). */
export const CLASS_RATE = { common: 0.03, uncommon: 0.02, rare: 0.03 } as const;

/**
 * The chance of EVERY material that can be tradeable, spelled out (a test pins this list to the game's materials and each value to its class). Classes come from the game
 * (tables.ts MATERIAL_CLASS): a Hunting drop's own rarity, ores and woods by tier (1-2 common, 3-4 uncommon, 5 rare), a plant's rarity.
 * One deliberate exception: abyssal_marrow is an uncommon drop of the last zone but the owner counts it with the rare ones ("crystals, hearts, marrow"), so it is at the rare chance.
 */
export const TRADEABLE_CHANCE: Readonly<Record<string, number>> = {
  // Mining (ore tiers)
  copper: 0.03,
  iron: 0.03,
  silver: 0.02,
  gold_ore: 0.02,
  obsidian: 0.03,
  // Woodcutting (wood tiers)
  common_wood: 0.03,
  oak_wood: 0.03,
  ebony_wood: 0.02,
  elven_wood: 0.02,
  ancient_wood: 0.03,
  // Garden (plants)
  common_herb: 0.03,
  energy_herb: 0.03,
  iron_thistle: 0.03,
  swift_grass: 0.03,
  uncommon_root: 0.02,
  gold_blossom: 0.02,
  crimson_mushroom: 0.02,
  silver_sage: 0.02,
  rare_flower: 0.03,
  moon_lily: 0.03,
  dusk_orchid: 0.03,
  elder_root: 0.03,
  flax: 0.03,
  cotton: 0.03,
  wild_silk: 0.02,
  moonweave: 0.03,
  voidsilk: 0.03,
  // Hunting drops
  leather_scrap: 0.03,
  bone_fragment: 0.03,
  demon_claw: 0.02,
  concentrated_blood: 0.02,
  rift_shard: 0.02,
  demon_core: 0.03,
  corrupted_crystal: 0.03,
  fiend_horn: 0.03,
  blood_heart: 0.03,
  abyssal_marrow: 0.03,
  beast_sinew: 0.03,
  feather: 0.03,
  arcane_dust: 0.02,
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
  // The 5 fibers (classes reform, phase 1): an ANALYTIC limit, not a measurement. The simulator does not grow fiber yet, so there is nothing to measure; the number is the Garden's own ceiling,
  // tables.ts garden[material].perPlotHour x GARDEN_SLOTS (6) x 24 h, rounded DOWN (materialServer.test.ts requires a peak never above the ceiling it is checked against, and rounding up would exceed it by a fraction). It is loose on purpose (perPlotHour already carries the ceiling slack), so an honest player is never cut; while the cloth has no consumer the risk is small.
  // Phase 7 (balance) replaces these five with a measured value.
  // The 3 Hunting drops of the classes reform, phase 1 (beast_sinew in the glade, feather and arcane_dust in the marsh): derived by PROPORTION to the same-zone, same-class materials already in this table, and set above what the simulator measured
  // (74 / 89 / 60). Why: the simulated players split their time between zones and activities, while a dedicated player can hunt one zone all day (a strong hero gets ~48 sinew in a 4 h session, and a Pass owner's 10 h stash passes 100 in a day),
  // so the measured peak understates the honest player and would flag a lucky one. The proportions: feather 1237 x 0.02/0.28 (against bone_fragment, same zone) = 88; beast_sinew against leather_scrap = 138; arcane_dust (proportion to concentrated_blood gives ~55) is raised to 90 by the same reasoning, since its measured 60 is the same understatement.
  // The simulator varies 5-10% between runs and the values of the OLD materials above do not reproduce even from a clean extract of HEAD, so no finer number would mean more. The 2x margin of bounds.ts absorbs the rest.
  // Phase 7 (balance) replaces these with a measurement once the simulator has a planting policy and a zone-focus policy.
  // beast_sinew: MEASURED on 29/10 (LONG_TABLES=1, 6 seeds, 60 days: 218), no longer the proportion of 140 above. The old value described a hero who got sinew only in the glade and the throne; since the rift and the abyss drop it too (classStream, huntingZones.ts) the honest best day is higher (the worst honest day was 0.76 of the old daily cap of 9, 0.49 of the new 14). feather (134, measured 148) and arcane_dust (90, measured 75) keep the proportion values above: their caps do not move.
  beast_sinew: 218,
  feather: 134,
  arcane_dust: 90,
  flax: 184,
  cotton: 122,
  wild_silk: 36,
  moonweave: 36,
  voidsilk: 23,
};
