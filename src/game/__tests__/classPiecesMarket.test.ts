import { afterEach, describe, expect, it } from 'vitest';
import { defaultSave, SaveData, xpToReachLevel } from '../engine';
import { GEAR, GearItem, getGear } from '../gear';
import { applyEquipInstance, applyForge, applySalvage, createGearInstance, isInstanceEquipped, isTradeable, isTradeableKind, salvageBlockReason, tradeBlockReason } from '../gearInstances';
import { setItemAuthority } from '../itemAuthority';
import { Rarity } from '../rarity';
import { emptyMaterials, MaterialId } from '../materials';
import { getSalvageReturn, hasSalvageValue } from '../salvage';
import { FORGE_TEMPLATES } from '../../../supabase/functions/_shared/items/tables';
import T from '../tunables';
import { DAY, makeServer, USER_A } from '../../../supabase/functions/_shared/__tests__/fakeItemStore';
import { recipeStock } from './recipeStock';

// Classes reform, phase 7 (docs/CLASSES_E_EQUIPAMENTOS.md section 4): the 84 leather and cloth pieces and the four new weapon lines follow the SAME market, binding and salvage rules as the plate line. Those rules
// are written by rarity and origin, never by a list of ids, so this file proves it piece by piece instead of trusting the wording.

const CERT = '123e4567-e89b-42d3-a456-426614174000';
const NEW_PIECES: GearItem[] = GEAR.filter((g) => g.weight || (g.line && g.line !== 'sword' && g.line !== 'axe'));
// One of each kind the owner named: a leather piece, a cloth piece and a weapon of every new line (plus a quiver and a tome, the two shield-slot pieces).
const SAMPLE = ['ranger_leather', 'silk_vestment', 'hide_quiver', 'apprentice_tome', 'long_bow', 'steel_crossbow', 'ebony_staff', 'silver_scepter'];

const mk = (templateId: string, rarity: Rarity, extra: { bound?: boolean; certificateId?: string; certified?: false } = {}) =>
  createGearInstance(templateId, { id: 'x', origin: 'craft', rarity, substats: [], ...extra });
const hero = (): SaveData => ({ ...defaultSave(), xp: xpToReachLevel(100) });
const withPiece = (templateId: string, rarity: Rarity, id = 'p1', extra: { certificateId?: string } = {}): SaveData => {
  const base = hero();
  return { ...base, gearInstances: { ...base.gearInstances, [id]: createGearInstance(templateId, { id, origin: 'craft', rarity, substats: [], ...extra }) } };
};

// The recipe of a chained piece (gear.ts) eats a piece of the tier before: add one to the save so the forge can run.
function addIngredients(save: SaveData, item: GearItem): SaveData {
  let next = save;
  for (const [templateId, count] of Object.entries(item.recipe?.items ?? {})) {
    for (let i = 0; i < (count as number); i++) {
      const id = `ing_${templateId}_${i}`;
      next = { ...next, gearInstances: { ...next.gearInstances, [id]: createGearInstance(templateId, { id, origin: 'craft', rarity: 'common', substats: [] }) } };
    }
  }
  return next;
}

afterEach(() => setItemAuthority('local'));

describe('the 84 new pieces are really there', () => {
  it('30 leather + 30 cloth armor pieces and 24 weapons (bow, crossbow, staff, scepter, 6 tiers each)', () => {
    expect(NEW_PIECES).toHaveLength(84);
    for (const id of SAMPLE) expect(NEW_PIECES.some((g) => g.id === id), id).toBe(true);
  });
});

describe('who can be sold: Epic, Legendary or Unique, never bound, only with the server certificate', () => {
  it('every new piece follows the one rule (the truth table of the plate line)', () => {
    for (const g of NEW_PIECES) {
      for (const rarity of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
        const high = rarity === 'epic' || rarity === 'legendary';
        expect(isTradeableKind(mk(g.id, rarity)), `${g.id} ${rarity}`).toBe(high);
        expect(isTradeable(mk(g.id, rarity, { certificateId: CERT })), `${g.id} ${rarity} certified`).toBe(high);
        expect(isTradeable(mk(g.id, rarity)), `${g.id} ${rarity} without certificate`).toBe(false);
        expect(isTradeable(mk(g.id, rarity, { certificateId: CERT, bound: true })), `${g.id} ${rarity} bound`).toBe(false);
        expect(isTradeable(mk(g.id, rarity, { certified: false })), `${g.id} ${rarity} made offline`).toBe(false);
      }
      expect(tradeBlockReason(mk(g.id, 'rare', { certificateId: CERT })), g.id).toBe('rarity');
      expect(tradeBlockReason(mk(g.id, 'epic', { bound: true, certificateId: CERT })), g.id).toBe('bound');
      expect(tradeBlockReason(mk(g.id, 'legendary')), g.id).toBe('uncertified');
    }
  });
});

describe('equipping binds, in every slot the new lines use', () => {
  it.each(SAMPLE)('%s: wearing it binds it for good, and a bound piece can never be sold', (id) => {
    const s = withPiece(id, 'legendary', 'p1', { certificateId: CERT });
    expect(isTradeable(s.gearInstances.p1)).toBe(true);
    const worn = applyEquipInstance(s, 'p1')!;
    expect(worn, id).not.toBeNull();
    expect(isInstanceEquipped(worn, 'p1')).toBe(true);
    expect(worn.gearInstances.p1.bound).toBe(true);
    expect(isTradeable(worn.gearInstances.p1)).toBe(false);
    expect(tradeBlockReason(worn.gearInstances.p1)).toBe('bound');
  });
});

describe('forged online: the server rolls it and certifies it; offline and Seal pieces never sell', () => {
  const rich = (id: string): SaveData => ({ ...hero(), gold: 1e9, shards: 99, materials: { ...emptyMaterials(), ...recipeStock(id, 1) } as SaveData['materials'] });

  it.each(SAMPLE)('%s: a forge with the server roll keeps the certificate and is tradeable', (id) => {
    setItemAuthority('server');
    const forged = applyForge(addIngredients(rich(id), getGear(id)!), id, { level: 100, roll: { rarity: 'epic', substats: [], certificateId: CERT } });
    expect(forged.ok, `${id} ${forged.reason}`).toBe(true);
    expect(forged.instance!.certificateId).toBe(CERT);
    expect(isTradeable(forged.instance!)).toBe(true);
  });

  it.each(SAMPLE)("%s: a forge with the server's Seal roll is born bound and never sells; one made offline is uncertified", (id) => {
    const save = addIngredients(rich(id), getGear(id)!);
    setItemAuthority('server');
    const sealed = applyForge(save, id, { level: 100, roll: { rarity: 'legendary', substats: [], certificateId: CERT, bound: true } });
    expect(sealed.ok, `${id} ${sealed.reason}`).toBe(true);
    expect(sealed.instance!.bound).toBe(true);
    expect(isTradeable(sealed.instance!)).toBe(false);
    setItemAuthority('local');
    const offline = applyForge(save, id, { level: 100, rng: () => 0.9999 });
    expect(offline.ok, `${id} ${offline.reason}`).toBe(true);
    expect(offline.instance!.rarity === 'epic' || offline.instance!.rarity === 'legendary').toBe(true);
    expect(isTradeable(offline.instance!)).toBe(false);
  });

  it('online with no roll (a preview) yields a plain Common, never a piece worth selling', () => {
    setItemAuthority('server');
    const id = 'long_bow';
    const r = applyForge(addIngredients(rich(id), getGear(id)!), id, { level: 100 });
    expect(r.ok).toBe(true);
    expect(r.instance!.rarity).toBe('common');
    expect(isTradeableKind(r.instance!)).toBe(false);
  });
});

describe('the server mints them the same way (the generated forge table and the mint handler)', () => {
  it('all 84 are in FORGE_TEMPLATES with their own tier and slot', () => {
    for (const g of NEW_PIECES) {
      const row = FORGE_TEMPLATES[g.id];
      expect(row, g.id).toBeDefined();
      expect(row.tier, g.id).toBe(g.tier);
      expect(row.slot, g.id).toBe(g.slot);
    }
  });

  it.each(SAMPLE)('%s: a forge request is certified when the roll is Epic', async (id) => {
    // the rarity roll 0.95 is epic (0.63 + 0.25 = 0.88 <= 0.95 < 0.98); the rest of the stream feeds the substats
    let i = 0;
    const rolls = [0.95, 0.1, 0.1, 0.1, 0.1];
    const s = makeServer({ rng: () => (i < rolls.length ? rolls[i++] : 0.5) });
    s.store.accountCreatedMs = Date.UTC(2026, 3, 1) - 400 * DAY;
    const r = await s.mint({ kind: 'forge', requestId: `req-${id.replace(/[^a-z]/g, '').padEnd(10, 'x')}`, templateId: id }, USER_A);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((r.body.item as { certificate: { id: string } | null }).certificate, id).not.toBeNull();
    expect(s.store.certs).toHaveLength(1);
    expect(s.store.certs[0].templateId).toBe(id);
    expect(s.store.certs[0].userId).toBe(USER_A);
  });
});

describe('salvage gives back materials by the recipe, like the plate pieces', () => {
  it('every new piece refunds floor(quantity x recovery rate) of each recipe material, and nothing else', () => {
    for (const g of NEW_PIECES) {
      expect(hasSalvageValue(g), g.id).toBe(true);
      const back = getSalvageReturn(g).materials;
      for (const [mid, qty] of Object.entries(g.recipe!.materials!) as [MaterialId, number][]) expect(back[mid] ?? 0, `${g.id} ${mid}`).toBe(Math.floor(qty * T.economySinks.salvageRecoveryRate));
      for (const mid of Object.keys(back)) expect(g.recipe!.materials![mid as MaterialId], `${g.id} ${mid}`).toBeGreaterThan(0);
    }
  });

  it.each(SAMPLE)('%s: salvaging the piece in the bag pays the refund into the save; a worn piece is refused', (id) => {
    const item = getGear(id)!;
    const s = withPiece(id, 'common');
    expect(salvageBlockReason(s, 'p1')).toBeNull();
    const done = applySalvage(s, 'p1', () => 0.999)!;
    expect(done).not.toBeNull();
    expect(done.save.gearInstances.p1).toBeUndefined();
    for (const [mid, qty] of Object.entries(getSalvageReturn(item).materials) as [MaterialId, number][]) expect(done.save.materials[mid] ?? 0, `${id} ${mid}`).toBeGreaterThanOrEqual(qty);
    const worn = applyEquipInstance(s, 'p1')!;
    expect(salvageBlockReason(worn, 'p1')).toBe('equipped');
    expect(applySalvage(worn, 'p1')).toBeNull();
  });
});
