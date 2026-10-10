import { describe, expect, it } from 'vitest';
import { GEAR, GearItem } from '../gear';
import { applySalvage, createGearInstance, salvageBlockReason } from '../gearInstances';
import { cargoReferenceValue } from '../economy';
import { defaultSave, SaveData } from '../engine';
import { getSalvageReturn, hasSalvageValue, SALVAGE_BONUS_CHANCE } from '../salvage';
import { emptyMaterials, MaterialId } from '../materials';
import T from '../tunables';

const withRecipe = GEAR.filter((g) => g.recipe && Object.keys(g.recipe.materials ?? {}).length > 0);
const NEVER = () => 0.999; // no bonus roll ever succeeds
const ALWAYS_ESSENCE = () => 0; // bonus roll succeeds, and the essence branch is picked

const sumMaterials = (m: Partial<Record<MaterialId, number>>) => Object.values(m).reduce((a, b) => a + (b ?? 0), 0);

describe('salvage never refunds more than the craft cost', () => {
  it('there is gear with a recipe to check', () => {
    expect(withRecipe.length).toBeGreaterThan(10);
  });

  it.each(withRecipe.map((g) => [g.id, g] as [string, GearItem]))('%s: every refunded material is strictly less than its recipe quantity', (_id, item) => {
    const back = getSalvageReturn(item).materials;
    for (const [mid, qty] of Object.entries(back) as [MaterialId, number][]) {
      const cost = item.recipe!.materials![mid] ?? 0;
      expect(cost).toBeGreaterThan(0); // never a material the recipe did not use
      expect(qty).toBeLessThanOrEqual(cost);
      expect(qty).toBeLessThanOrEqual(Math.floor(cost * T.economySinks.salvageRecoveryRate));
      expect(Number.isInteger(qty)).toBe(true);
    }
  });

  it.each(withRecipe.map((g) => [g.id, g] as [string, GearItem]))('%s: refunded reference value stays under the recipe materials value', (_id, item) => {
    const back = getSalvageReturn(item).materials;
    expect(cargoReferenceValue(back)).toBeLessThan(cargoReferenceValue(item.recipe!.materials!) + 1e-9);
    // and it is actually a loss, so craft -> salvage -> craft can never be a loop
    expect(cargoReferenceValue(back)).toBeLessThanOrEqual(cargoReferenceValue(item.recipe!.materials!) * T.economySinks.salvageRecoveryRate + 1e-9);
  });

  it('the recovery rate itself is below 100%', () => {
    expect(T.economySinks.salvageRecoveryRate).toBeLessThan(1);
    expect(T.economySinks.salvageRecoveryRate).toBeGreaterThanOrEqual(0);
  });

  it('gear without a recipe returns nothing and is not salvageable', () => {
    const club = GEAR.find((g) => g.id === 'wooden_club')!;
    expect(hasSalvageValue(club)).toBe(false);
    expect(getSalvageReturn(club).materials).toEqual({});
  });
});

describe('applySalvage', () => {
  const saveWith = (templateId: string, rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'common'): { save: SaveData; id: string } => {
    const save = defaultSave();
    const inst = createGearInstance(templateId, { id: 'gi_test', origin: 'craft', rarity, substats: [] });
    return { save: { ...save, gearInstances: { ...save.gearInstances, [inst.id]: inst } }, id: inst.id };
  };

  it('removes the instance, pays exactly getSalvageReturn and nothing else when no bonus rolls', () => {
    const { save, id } = saveWith('iron_short_sword', 'rare');
    const result = applySalvage(save, id, NEVER)!;
    expect(result).not.toBeNull();
    expect(result.bonusGranted).toBe(false);
    expect(result.save.gearInstances[id]).toBeUndefined();
    const expected = { ...emptyMaterials() };
    for (const [m, q] of Object.entries(getSalvageReturn(GEAR.find((g) => g.id === 'iron_short_sword')!).materials)) expected[m as MaterialId] += q as number;
    expect(result.save.materials).toEqual(expected);
    expect(result.save.gold).toBe(save.gold); // salvage never pays gold
    expect(result.save.shards).toBe(save.shards);
  });

  it('the rarity bonus is at most one essence or one gem, and common gear never gets it', () => {
    const { save, id } = saveWith('iron_short_sword', 'legendary');
    const base = applySalvage(save, id, NEVER)!.save;
    const bonus = applySalvage(save, id, ALWAYS_ESSENCE)!;
    expect(bonus.bonusGranted).toBe(true);
    expect(bonus.save.materials.essence - base.materials.essence).toBe(1);
    expect(sumMaterials(bonus.save.materials) - sumMaterials(base.materials)).toBe(1);

    const common = saveWith('iron_short_sword', 'common');
    expect(SALVAGE_BONUS_CHANCE.common).toBeUndefined();
    expect(applySalvage(common.save, common.id, ALWAYS_ESSENCE)!.bonusGranted).toBe(false);
  });

  it('refuses the equipped piece, a missing id and gear with no recipe, and changes nothing', () => {
    const { save, id } = saveWith('iron_short_sword');
    const equipped = { ...save, equipped: { ...save.equipped, weapon: id } };
    expect(salvageBlockReason(equipped, id)).toBe('equipped');
    expect(applySalvage(equipped, id, NEVER)).toBeNull();
    expect(applySalvage(save, 'gi_missing', NEVER)).toBeNull();
    // the starter club has no recipe
    expect(applySalvage(save, 'st_wooden_club', NEVER)).toBeNull();
  });

  it('gems socketed in a salvaged piece go back to the stock', () => {
    const { save, id } = saveWith('steel_greatsword');
    const socketed = { ...save, gearInstances: { ...save.gearInstances, [id]: { ...save.gearInstances[id], sockets: ['ruby' as const] } } };
    const result = applySalvage(socketed, id, NEVER)!;
    expect(result.save.gems.ruby).toBe(socketed.gems.ruby + 1);
  });
});
