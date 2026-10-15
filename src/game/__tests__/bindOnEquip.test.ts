import { describe, expect, it } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { getGear, GEAR, isInstancedSlot } from '../gear';
import {
  applyEquipInstance,
  applyForge,
  applyRepair,
  applySalvage,
  applyUnequipSlot,
  applyUpgrade,
  createGearInstance,
  isTradeable,
  isTradeableKind,
  needsBindConfirm,
} from '../gearInstances';
import { applyReforge } from '../reforge';
import { Rarity, RARITIES } from '../rarity';
import { emptyMaterials } from '../materials';
import { recipeStock } from './recipeStock';

const withPiece = (templateId: string, rarity: Rarity, id = 'p1', extra: Partial<SaveData> = {}): SaveData => {
  const base = defaultSave();
  const inst = createGearInstance(templateId, { id, origin: 'craft', rarity, substats: [] });
  return { ...base, ...extra, gearInstances: { ...base.gearInstances, [id]: inst } };
};

describe('bind on equip', () => {
  it('equipping a piece sets the flag for good: it survives unequip and a save / load round trip', () => {
    const s = withPiece('iron_helm', 'epic');
    expect(s.gearInstances.p1.bound).toBeUndefined();
    const on = applyEquipInstance(s, 'p1')!;
    expect(on.gearInstances.p1.bound).toBe(true);
    const off = applyUnequipSlot(on, 'helmet');
    expect(off.equipped.helmet).toBeNull();
    expect(off.gearInstances.p1.bound).toBe(true);
    const back = normalizeSave(JSON.parse(JSON.stringify(off)));
    expect(back.gearInstances.p1.bound).toBe(true);
    // wearing it again changes nothing about the flag
    expect(applyEquipInstance(back, 'p1')!.gearInstances.p1.bound).toBe(true);
  });

  it('an unworn piece stays unbound through a save / load round trip', () => {
    const s = withPiece('iron_helm', 'epic');
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.gearInstances.p1.bound).toBeUndefined();
  });

  it('old saves: every instance that is worn when the save loads is bound, what sits in the bag is not', () => {
    const s = withPiece('iron_helm', 'epic', 'worn');
    const worn = applyEquipInstance(s, 'worn')!;
    const raw = JSON.parse(JSON.stringify(worn));
    delete raw.gearInstances.worn.bound; // a save from before the rule
    raw.gearInstances.bag = { ...raw.gearInstances.worn, id: 'bag', templateId: 'iron_gauntlets' };
    const loaded = normalizeSave(raw);
    expect(loaded.gearInstances.worn.bound).toBe(true);
    expect(loaded.gearInstances.bag.bound).toBeUndefined();
    // the starters are worn from the start
    expect(defaultSave().gearInstances.st_wooden_club.bound).toBe(true);
  });

  it('forging does not bind; salvaging, refining, reforging and repairing work the same on a bound piece', () => {
    const s: SaveData = { ...withPiece('bronze_helm', 'common', 'prev'), gold: 1e6, shards: 20, materials: { ...emptyMaterials(), ...recipeStock('iron_helm'), refining_dust: 99 } as SaveData['materials'] };
    const forged = applyForge(s, 'iron_helm', { level: 10 });
    expect(forged.ok).toBe(true);
    expect(forged.instance!.bound).toBeUndefined();

    const bound = applyEquipInstance(s, 'prev')!;
    const unbound = s;
    // refine
    const up = (x: SaveData) => applyUpgrade(x, 'prev', false, () => 0)!;
    expect(up(bound).save.gearInstances.prev.upgrade).toBe(1);
    expect(up(bound).save.gearInstances.prev.bound).toBe(true);
    expect(up(unbound).save.gearInstances.prev.upgrade).toBe(1);
    // repair
    const worn = (x: SaveData): SaveData => ({ ...x, gearInstances: { ...x.gearInstances, prev: { ...x.gearInstances.prev, durability: 10 } } });
    expect(applyRepair(worn(bound), 'prev', false, 30)!.gearInstances.prev.durability).toBe(100);
    expect(applyRepair(worn(unbound), 'prev', false, 30)!.gearInstances.prev.durability).toBe(100);
    // salvage (a worn piece is refused, an unequipped bound piece is not)
    const unequipped = applyUnequipSlot(bound, 'helmet');
    expect(unequipped.gearInstances.prev.bound).toBe(true);
    expect(applySalvage(unequipped, 'prev', () => 0.99)).not.toBeNull();
    expect(applySalvage(unbound, 'prev', () => 0.99)).not.toBeNull();
    // reforge (needs a non-common piece)
    const rare = (x: SaveData): SaveData => ({ ...x, shards: 20, gold: 1e6, materials: { ...emptyMaterials(), refining_dust: 99, bone_fragment: 999, leather_scrap: 999, demon_claw: 999, demon_core: 99, concentrated_blood: 999, corrupted_crystal: 99 } as SaveData['materials'], gearInstances: { ...x.gearInstances, prev: { ...x.gearInstances.prev, rarity: 'rare', substats: [{ type: 'critRate', value: 2 }] } } });
    expect(applyReforge(rare(unequipped), 'prev')!.gearInstances.prev.bound).toBe(true);
    expect(applyReforge(rare(unbound), 'prev')).not.toBeNull();
  });
});

const CERT = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';

describe('isTradeableKind: one rule, rarity x unique x bound (isTradeable adds the server certificate)', () => {
  const uniqueTemplate = GEAR.find((g) => g.unique)!.id;
  const forgedTemplate = 'iron_helm';
  const mk = (templateId: string, rarity: Rarity, bound: boolean) => ({ ...createGearInstance(templateId, { id: 'x', origin: 'craft', rarity, substats: [] }), ...(bound ? { bound: true } : {}) });

  it('truth table', () => {
    for (const r of RARITIES) {
      for (const bound of [false, true]) {
        const highRarity = r.id === 'epic' || r.id === 'legendary';
        // forged gear: tradeable only when unbound AND Epic / Legendary
        expect(isTradeableKind(mk(forgedTemplate, r.id, bound)), `forged ${r.id} bound=${bound}`).toBe(!bound && highRarity);
        // with the certificate the server issued, the same table decides; without one nothing is tradeable
        expect(isTradeable({ ...mk(forgedTemplate, r.id, bound), certificateId: CERT }), `certified forged ${r.id} bound=${bound}`).toBe(!bound && highRarity);
        expect(isTradeable(mk(forgedTemplate, r.id, bound)), `uncertified forged ${r.id} bound=${bound}`).toBe(false);
        // unique drops: tradeable when unbound, whatever the rarity
        expect(isTradeableKind(mk(uniqueTemplate, r.id, bound)), `unique ${r.id} bound=${bound}`).toBe(!bound);
        expect(isTradeable({ ...mk(uniqueTemplate, r.id, bound), certificateId: CERT }), `certified unique ${r.id} bound=${bound}`).toBe(!bound);
        expect(isTradeable(mk(uniqueTemplate, r.id, bound)), `uncertified unique ${r.id} bound=${bound}`).toBe(false);
      }
    }
  });

  it('stackable relics, materials and consumables are never tradeable (they are not gear instances)', () => {
    const relic = getGear('goblin_lucky_coin');
    expect(relic.slot).toBe('relic');
    expect(isInstancedSlot(relic.slot)).toBe(false);
    expect(() => createGearInstance('goblin_lucky_coin', { origin: 'drop' })).toThrow();
  });

  it('the equip confirmation is required only for a piece that could be sold', () => {
    const base = defaultSave();
    const add = (id: string, templateId: string, rarity: Rarity, bound = false): SaveData => ({ ...base, gearInstances: { ...base.gearInstances, [id]: { ...createGearInstance(templateId, { id, origin: 'craft', rarity, substats: [], certificateId: CERT }), ...(bound ? { bound: true } : {}) } } });
    expect(needsBindConfirm(add('a', forgedTemplate, 'common'), 'a')).toBe(false);
    expect(needsBindConfirm(add('a', forgedTemplate, 'rare'), 'a')).toBe(false);
    expect(needsBindConfirm(add('a', forgedTemplate, 'epic'), 'a')).toBe(true);
    expect(needsBindConfirm(add('a', forgedTemplate, 'legendary'), 'a')).toBe(true);
    expect(needsBindConfirm(add('a', uniqueTemplate, 'common'), 'a')).toBe(true);
    expect(needsBindConfirm(add('a', forgedTemplate, 'epic', true), 'a')).toBe(false);
    expect(needsBindConfirm(base, 'missing')).toBe(false);
    // a piece with no certificate (offline, or from an older save) could not be sold anyway: binding it costs nothing, so there is nothing to confirm
    const uncertified: SaveData = { ...base, gearInstances: { ...base.gearInstances, a: createGearInstance(forgedTemplate, { id: 'a', origin: 'craft', rarity: 'legendary', substats: [] }) } };
    expect(needsBindConfirm(uncertified, 'a')).toBe(false);
  });
});
