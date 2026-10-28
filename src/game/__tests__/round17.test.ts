import { describe, expect, it } from 'vitest';
import { HUNTING_ZONES, effectiveDropChance, getHuntingZone, zoneReferenceXpPerHour } from '../huntingZones';
import { refineHuntMaterials } from '../gear';
import { baseGoldValue } from '../economy';
import { merchantPrice } from '../merchant';
import T from '../tunables';
import { STASH_UPGRADES } from '../stash';
import { cargoUnitValue } from '../deliveries';
import { deepToTwelve, lapidarHours, refineToEight, setHoursOwn, zoneValue } from '../../../scripts/sim/farmHours';
import { computeCP } from '../engine';
import { recommendedCpForFloor } from '../dungeon';
import { clearRate } from '../../../scripts/sim/ladder';
import { gearHero } from '../../../scripts/sim/depthHero';

// Round 17 (docs/BALANCE_CHANGES.md): the Rift and the Abyss drop less, and everything that is paid in those drops was re-solved so the HOURS of hunting it takes did not move.
// The "round 16" numbers below are what scripts/sim/farmHours.ts measured before the change (same model, same unit); the tolerance is the +-10% the round promised.
const within = (got: number, was: number, tol = 0.1) => {
  expect(got / was, `${got.toFixed(2)} vs ${was}`).toBeGreaterThanOrEqual(1 - tol);
  expect(got / was, `${got.toFixed(2)} vs ${was}`).toBeLessThanOrEqual(1 + tol);
};

describe('Round 17: the late zones drop what the late game can use', () => {
  it('a rare is never easier than an uncommon of the same zone (per roll, shallow sub-level 1 and deep sub-level 10)', () => {
    const rank = { common: 0, uncommon: 1, rare: 2 } as const;
    for (const id of ['demon_rift', 'blood_abyss']) {
      const z = getHuntingZone(id)!;
      for (const [depth, sub] of [['shallow', 1], ['deep', 10]] as const) {
        for (const a of z.drops) {
          for (const b of z.drops) {
            if (rank[a.rarity] >= rank[b.rarity] || a.rarity === 'common') continue; // (common vs uncommon is not asserted: the deep depth boosts the uncommon above the common in every zone since round 5)
            expect(effectiveDropChance(a, depth, sub), `${id}/${depth}: ${a.material} (${a.rarity}) vs ${b.material} (${b.rarity})`).toBeGreaterThanOrEqual(effectiveDropChance(b, depth, sub));
          }
        }
      }
    }
  });

  it('the rares are cut at least as much as the commons of their zone; zones 1 and 2 are not touched', () => {
    const was: Record<string, number> = { bone_fragment: 0.35, concentrated_blood: 0.12, corrupted_crystal: 0.021, abyssal_marrow: 0.11, blood_heart: 0.0175, rift_shard: 0.1, fiend_horn: 0.014, leather_scrap: 0.32, demon_claw: 0.105, demon_core: 0.0175 };
    const cut = (id: string, m: string) => getHuntingZone(id)!.drops.find((d) => d.material === m)!.chance / was[m];
    for (const m of ['corrupted_crystal', 'abyssal_marrow', 'blood_heart']) expect(cut('blood_abyss', m)).toBeLessThanOrEqual(cut('blood_abyss', 'bone_fragment'));
    expect(cut('demon_rift', 'fiend_horn')).toBeLessThanOrEqual(cut('demon_rift', 'leather_scrap'));
    // ownStream marks what was added after these zones were set (classes reform, phase 1): the test is about the original three
    expect(getHuntingZone('demon_glade')!.drops.filter((d) => !d.ownStream).map((d) => d.chance)).toEqual([0.25, 0.08, 0.007]);
    expect(getHuntingZone('blood_marsh')!.drops.filter((d) => !d.ownStream).map((d) => d.chance)).toEqual([0.28, 0.09, 0.0105]);
    expect(HUNTING_ZONES.slice(0, 4).map((z) => Math.round(zoneReferenceXpPerHour(z)))).toEqual([1491, 2460, 5100, 7482]); // Rodada 31: XP is per kill now (xpPerKill x the reference pace); since Rodada 31 an hour at the reference pace pays 85% of what the zone paid by fight time (1,750 / 2,900 / 6,000 / 8,800): the pace cap (1.2) and the faster-than-reference heroes bring the average back,  // the last zone was 13,000 until Rodada 22, 10,000 until Rodada 24 and 8,750 until Rodada 26 (its sub-levels pay up to +45% now)
  });

  it('the hours of hunting of a tier 5 set, a tier 6 set, +0 -> +8, +8 -> +12 and one Lapidar stay within 10% of round 16', () => {
    within(setHoursOwn(5), 63.6);
    within(setHoursOwn(6), 73.4);
    within(refineToEight(5), 9.77);
    within(refineToEight(6), 9.0);
    within(deepToTwelve(5).hours, 143.0);
    within(deepToTwelve(6).hours, 238.1);
    within(lapidarHours(6, 0), 4.12);
    within(lapidarHours(6, 4), 8.24);
    within(lapidarHours(5, 0), 2.75);
  });

  it('what an hour of the Rift and of the Abyss is worth to the merchant stays within 10% (the order anchor of round14.test.ts rests on it)', () => {
    within(zoneValue('demon_rift').merchantContinuous, 158.8);
    within(zoneValue('blood_abyss').merchantContinuous, 193.3);
    within(zoneValue('demon_rift').merchantReal, 194.0);
    within(zoneValue('blood_abyss').merchantReal, 226.4);
  });

  it('a unit of the four cut drops sells by the usual rule, and the six shared drops keep their reference value (the early orders are sized in them)', () => {
    for (const m of ['rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart'] as const) expect(merchantPrice('material', m)).toBe(Math.max(1, Math.floor(T.merchant.priceRate * baseGoldValue(m))));
    expect([baseGoldValue('leather_scrap'), baseGoldValue('bone_fragment'), baseGoldValue('demon_claw'), baseGoldValue('concentrated_blood'), baseGoldValue('demon_core'), baseGoldValue('corrupted_crystal')]).toEqual([2, 2, 4.5, 4.5, 25, 24.5]);
  });

  it('the refine steps of tier 5 and 6 ask the cut drops in the new amounts; the lower tiers ask what they always asked', () => {
    expect(refineHuntMaterials(4, 7)).toEqual({ bone_fragment: 32, concentrated_blood: 12, corrupted_crystal: 2 });
    expect(refineHuntMaterials(5, 5)).toEqual({ bone_fragment: 10 });
    expect(refineHuntMaterials(5, 6)).toEqual({ bone_fragment: 15, rift_shard: 2 });
    expect(refineHuntMaterials(6, 5)).toEqual({ bone_fragment: 10 });
    expect(refineHuntMaterials(6, 6)).toEqual({ bone_fragment: 16, abyssal_marrow: 2 });
    expect(refineHuntMaterials(6, 7)).toEqual({ bone_fragment: 16, abyssal_marrow: 2, blood_heart: 1 });
  });

  it('the stash upgrades that ask Abyss drops ask fewer of them; the first five levels are what they were', () => {
    expect(STASH_UPGRADES.slice(0, 5).map((u) => u.materials.bone_fragment ?? 0)).toEqual([0, 0, 0, 24, 40]);
    expect(STASH_UPGRADES.slice(5).map((u) => [u.materials.bone_fragment, u.materials.concentrated_blood])).toEqual([[21, 9], [27, 15], [34, 21]]);
  });

  it('the farm hour of the sinks is what an hour of the Abyss gives now (about 1.36x the static model, as in round 16: 65 / 60 / 15 / 12 against 47.7 / 43.7 / 11.0 / 9.2)', () => {
    const z = zoneValue('blood_abyss').perHour;
    for (const [hour, perHour] of [[T.lateSinks.hourBlood, z.concentrated_blood], [T.lateSinks.hourMarrow, z.abyssal_marrow], [T.lateSinks.hourCrystal, z.corrupted_crystal], [T.lateSinks.hourHeart, z.blood_heart]] as const) {
      within(hour / perHour, 1.36, 0.1);
    }
  });

  it('the last order tier counts one Bone / Blood / Crystal as several times its reference value, the lower tiers and every other material as the reference value', () => {
    expect(['bone_fragment', 'concentrated_blood', 'corrupted_crystal'].map((m) => cargoUnitValue(m as 'bone_fragment', 3) / baseGoldValue(m as 'bone_fragment'))).toEqual([T.deliveries.abyssCargoBone, T.deliveries.abyssCargoBlood, T.deliveries.abyssCargoCrystal]);
    for (const tier of [0, 1, 2]) expect(['bone_fragment', 'concentrated_blood', 'corrupted_crystal'].map((m) => cargoUnitValue(m as 'bone_fragment', tier))).toEqual([2, 4.5, 24.5]);
    for (const m of ['leather_scrap', 'demon_claw', 'demon_core', 'copper', 'iron'] as const) expect(cargoUnitValue(m, 3)).toBe(baseGoldValue(m));
    // the factors are at least the cuts (the Abyss drops 2.9 / 3.3 / 4 times fewer): an order never asks for more hours of Abyss hunting than it did
    const abyss = getHuntingZone('blood_abyss')!;
    const was = { bone_fragment: 0.35, concentrated_blood: 0.12, corrupted_crystal: 0.021 };
    const cut = (m: keyof typeof was) => was[m] / abyss.drops.find((d) => d.material === m)!.chance;
    expect(T.deliveries.abyssCargoBone).toBeGreaterThanOrEqual(cut('bone_fragment'));
    expect(T.deliveries.abyssCargoBlood).toBeGreaterThanOrEqual(cut('concentrated_blood'));
    expect(T.deliveries.abyssCargoCrystal).toBeGreaterThanOrEqual(cut('corrupted_crystal'));
  });

  // The recommended CP of the floors past what the ladder measures (87-100) is a power law; this keeps it honest: heroes with the CP the table lists clear the floor, and heroes well below it do not.
  // The heroes are level 100 in a full tier 6 set (common to legendary, +8 to +12, warrior skills, paragon 0 to 50), no tonic, no potion, full HP at the start of the floor.
  it('the recommended CP of floors 87-100 is what a hero without tonics needs', () => {
    const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
    const wins = (hero: ReturnType<typeof gearHero>, floor: number) => clearRate(hero, floor, NOW, 3) >= 2 / 3;
    const common = gearHero('common', 0, 8); // CP ~8.9k
    const epic = gearHero('epic', 0, 12); // CP ~13.9k (Rodada 26: the Epic is x1.15, so an Epic set with paragon 50 now clears floor 100 at ~17k)
    const legendary = gearHero('legendary', 30, 12); // CP ~18k
    for (const f of [87, 88]) if (computeCP(common) >= recommendedCpForFloor(f)) expect(wins(common, f), `common +8 floor ${f}`).toBe(true);
    expect(computeCP(common)).toBeLessThan(recommendedCpForFloor(94) * 0.95);
    expect(wins(common, 94)).toBe(false);
    expect(computeCP(epic)).toBeGreaterThanOrEqual(recommendedCpForFloor(98));
    expect(wins(epic, 98)).toBe(true);
    expect(computeCP(epic)).toBeLessThan(recommendedCpForFloor(100) * 0.95);
    expect(wins(epic, 100)).toBe(false);
    expect(computeCP(legendary)).toBeGreaterThanOrEqual(recommendedCpForFloor(100));
    expect(wins(legendary, 100)).toBe(true);
  });
});
