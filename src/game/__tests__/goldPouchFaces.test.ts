import { describe, expect, it } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { LEGACY_POUCH_FACES, applyOpenPouch, migratePouchFaces, patrimony, pouchFace, pouchFaceMatches, pouchGoldHeld } from '../goldPouch';
import { statsOf } from '../stats';

// Rodada 22: the Gold Pouch faces became 2,000 / 5,000 / 20,000 (they were 10,000 / 50,000 / 100,000). An old save is settled ONCE on load.

const CERT_A = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const CERT_B = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const old = (patch: Partial<SaveData>): SaveData => {
  const s = { ...defaultSave(), ...patch } as SaveData;
  delete s.pouchFacesV2; // a save from before the settlement has no marker
  return s;
};

describe('the new faces', () => {
  it('2,000 / 5,000 / 20,000, and a certificate minted at either generation of faces matches its pouch', () => {
    expect(pouchFace('gold_pouch_s')).toBe(2000);
    expect(pouchFace('gold_pouch_m')).toBe(5000);
    expect(pouchFace('gold_pouch_l')).toBe(20000);
    expect(LEGACY_POUCH_FACES).toEqual({ gold_pouch_s: 10000, gold_pouch_m: 50000, gold_pouch_l: 100000 });
    expect(pouchFaceMatches('gold_pouch_m', 5000)).toBe(true);
    expect(pouchFaceMatches('gold_pouch_m', 50000)).toBe(true);
    expect(pouchFaceMatches('gold_pouch_m', 7000)).toBe(false);
    expect(pouchFaceMatches('gold_pouch_s', 50000)).toBe(false);
  });

  it('a new hero is already settled', () => {
    expect(defaultSave().pouchFacesV2).toBe(true);
  });
});

describe('the one-time settlement of an old save', () => {
  it('uncertified pouches in the bag and the stash become Gold at the OLD face, once, and are not counted as earned Gold', () => {
    const s = old({
      gold: 500,
      consumables: { ...defaultSave().consumables, gold_pouch_s: 2, gold_pouch_m: 1, gold_pouch_l: 1 },
      stash: { ...defaultSave().stash, consumables: { gold_pouch_s: 3 } },
    });
    const m = migratePouchFaces(s);
    expect(m.gold).toBe(500 + 5 * 10000 + 50000 + 100000);
    expect(m.consumables.gold_pouch_s ?? 0).toBe(0);
    expect(m.consumables.gold_pouch_m ?? 0).toBe(0);
    expect(m.consumables.gold_pouch_l ?? 0).toBe(0);
    expect(m.stash.consumables.gold_pouch_s ?? 0).toBe(0);
    expect(m.pouchFacesV2).toBe(true);
    expect(statsOf(m).pouchGoldOpened).toBe(5 * 10000 + 50000 + 100000); // like opening: excluded from the lifetime Gold counter
    expect(migratePouchFaces(m)).toBe(m); // the second time changes nothing
    expect(patrimony(m)).toBe(m.gold);
  });

  it('takes the uncertified ones from the bag first, then from the stash, and leaves the certified ones alone', () => {
    const s = old({
      consumables: { ...defaultSave().consumables, gold_pouch_s: 3 },
      stash: { ...defaultSave().stash, consumables: { gold_pouch_s: 2 } },
      pouchCerts: { gold_pouch_s: [CERT_A, CERT_B] },
    });
    const m = migratePouchFaces(s);
    // five pouches, two certified: three uncertified become 30,000 Gold; the bag held three of them
    expect(m.gold).toBe(30000);
    expect(m.consumables.gold_pouch_s ?? 0).toBe(0);
    expect(m.stash.consumables.gold_pouch_s).toBe(2);
    expect(m.legacyPouchCerts).toEqual([CERT_A, CERT_B]);
    expect(pouchGoldHeld(m)).toBe(2 * 10000); // the two certified ones still count the face they were minted at
  });

  it('a certified pouch minted at the old face opens for the old face, a new one for the new face', () => {
    const s = old({ consumables: { ...defaultSave().consumables, gold_pouch_s: 1 }, pouchCerts: { gold_pouch_s: [CERT_A] } });
    const m = migratePouchFaces(s);
    expect(m.gold).toBe(0);
    const opened = applyOpenPouch(m, 'gold_pouch_s', CERT_A);
    expect(opened.ok).toBe(true);
    expect(opened.gold).toBe(10000);
    expect(opened.save!.gold).toBe(10000);
    expect(opened.save!.legacyPouchCerts).toBeUndefined();
    // a pouch minted after the change: not on the legacy list
    const fresh = { ...m, consumables: { ...m.consumables, gold_pouch_s: 2 }, pouchCerts: { gold_pouch_s: [CERT_A, CERT_B] } };
    expect(applyOpenPouch(fresh, 'gold_pouch_s', CERT_B).gold).toBe(2000);
  });

  it('runs on load: a stored save without the marker is settled by normalizeSave, one with it is not touched', () => {
    const stored = JSON.parse(JSON.stringify(old({ gold: 100, consumables: { ...defaultSave().consumables, gold_pouch_m: 2 } })));
    const loaded = normalizeSave(JSON.stringify(stored));
    expect(loaded.gold).toBe(100 + 2 * 50000);
    expect(loaded.consumables.gold_pouch_m ?? 0).toBe(0);
    expect(loaded.pouchFacesV2).toBe(true);
    const again = normalizeSave(JSON.stringify(loaded));
    expect(again.gold).toBe(loaded.gold);
    // a new-model save with pouches keeps them
    const fresh = { ...defaultSave(), consumables: { ...defaultSave().consumables, gold_pouch_m: 2 } };
    expect(normalizeSave(JSON.stringify(fresh)).consumables.gold_pouch_m).toBe(2);
  });
});
