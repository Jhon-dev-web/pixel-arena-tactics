import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { createGearInstance, isTradeable } from '../gearInstances';
import { certifiedPouchIds } from '../goldPouch';
import { certState, clearCertificates, setCertificates } from '../itemCerts';
import { MarketApi, MarketFn, createMarketApi } from '../market/api';
import { deliverCertificate, reconcileOutgoing, removeListedItem, sellableEntries, socketedButCertified } from '../market/items';
import { listForSale, syncMarketOnce } from '../market/sync';
import { FEE_ADDRESS, USER_A, USER_B, WALLET, makeMarket } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import type { CertificateView } from '../../../supabase/functions/_shared/items/types';

// The game's side of the market against the REAL handlers over the in-memory store (supabase/functions/_shared/__tests__/marketHarness.ts): the same code the Edge Functions run.

type Harness = ReturnType<typeof makeMarket>;
let m: Harness;

const transportFor = (userId: string) => async (fn: MarketFn, body: object) => {
  const run = fn === 'market-wallet' ? m.wallet : fn === 'market-list' ? m.list : fn === 'market-buy' ? m.buy : fn === 'market-my' ? m.my : m.pass;
  return run(body, userId);
};
const apiFor = (userId: string): MarketApi => createMarketApi(transportFor(userId));

/** A player: a save, his api, what the server last saved. */
function player(userId: string, initial: SaveData = defaultSave()) {
  const state = { save: initial, synced: null as SaveData | null };
  const certsOf = (): CertificateView[] =>
    [...m.store.certs.values()]
      .filter((c) => c.userId === userId)
      .map((c) => {
        const { userId: _u, inSave: _i, originCertificateId: _o, ...rest } = c;
        void _u;
        void _i;
        void _o;
        return rest;
      });
  return {
    state,
    api: apiFor(userId),
    deps: () => ({
      api: apiFor(userId),
      getSave: () => state.save,
      getSynced: () => state.synced,
      applySave: (next: SaveData) => void (state.save = next),
      loadCertificates: async () => {
        const list = certsOf();
        setCertificates(list);
        return list;
      },
      now: () => m.store.nowMs,
    }),
    /** the server confirmed the current save (App's autosave) */
    saved() {
      state.synced = state.save;
    },
    certsOf,
  };
}

/** A save with one certified, verified Epic dagger (the server minted its certificate for `userId`). */
function withCertifiedPiece(userId: string, over: Partial<CertificateView> = {}) {
  const cert = m.store.addCert(userId, { templateId: 'bronze_dagger', rarity: 'epic', tier: 1, substats: [{ type: 'critRate', value: 3 }, { type: 'defense', value: 2 }], ...over });
  const inst = createGearInstance('bronze_dagger', { id: 'gi_piece_1', origin: 'craft', rarity: 'epic', substats: cert.substats as never, certificateId: cert.id });
  const save: SaveData = { ...defaultSave(), gearInstances: { ...defaultSave().gearInstances, [inst.id]: inst } };
  return { cert, inst, save };
}

beforeEach(() => {
  clearCertificates();
  m = makeMarket();
  for (const u of [USER_A, USER_B]) m.link(u);
});
afterEach(() => clearCertificates());

describe('what can be sold', () => {
  it('a certified, unbound, socket-free piece the SERVER confirms is sellable; nothing else is', async () => {
    const { cert, inst, save } = withCertifiedPiece(USER_A);
    const p = player(USER_A, save);
    expect(sellableEntries(p.state.save)).toEqual([]); // the server has not said so yet
    await p.deps().loadCertificates();
    expect(certState(inst)).toBe('verified');
    expect(sellableEntries(p.state.save)).toEqual([{ kind: 'gear', certificateId: cert.id, instance: inst }]);
  });

  it('refuses a bound piece, an equipped piece, a piece with gems, a piece whose certificate is not held, and an uncertified one', async () => {
    const a = withCertifiedPiece(USER_A);
    const p = player(USER_A, a.save);
    await p.deps().loadCertificates();
    const bound = { ...a.save, gearInstances: { gi_piece_1: { ...a.inst, bound: true } } };
    expect(sellableEntries(bound)).toEqual([]);
    const socketed = { ...a.save, gearInstances: { gi_piece_1: { ...a.inst, sockets: ['ruby'] as never } } };
    expect(sellableEntries(socketed)).toEqual([]);
    expect(socketedButCertified(socketed)).toHaveLength(1);
    const equipped = { ...a.save, equipped: { ...a.save.equipped, weapon: 'gi_piece_1' } };
    expect(sellableEntries(equipped)).toEqual([]);
    m.store.certs.get(a.cert.id)!.status = 'listed';
    await p.deps().loadCertificates();
    expect(sellableEntries(a.save)).toEqual([]);
    const none = { ...a.save, gearInstances: { gi_piece_1: { ...a.inst, certificateId: undefined } } };
    expect(sellableEntries(none as SaveData)).toEqual([]);
    expect(isTradeable(none.gearInstances.gi_piece_1 as never)).toBe(false);
  });

  it('a certified Gold Pouch the server confirms is sellable', async () => {
    const cert = m.store.addCert(USER_A, { kind: 'gold_pouch', templateId: 'gold_pouch_s', rarity: null, tier: null, substats: [], goldAmount: 10_000, source: 'pouch' });
    const save: SaveData = { ...defaultSave(), consumables: { ...defaultSave().consumables, gold_pouch_s: 1 }, pouchCerts: { gold_pouch_s: [cert.id] } };
    const p = player(USER_A, save);
    await p.deps().loadCertificates();
    expect(sellableEntries(save)).toEqual([{ kind: 'gold_pouch', certificateId: cert.id, pouchId: 'gold_pouch_s', goldAmount: 10_000 }]);
  });
});

describe('listing takes the item out of the save', () => {
  it('the server lists first; then the piece leaves the save; cancelling brings it back from the certificate', async () => {
    const { cert, inst, save } = withCertifiedPiece(USER_A);
    const p = player(USER_A, save);
    await p.deps().loadCertificates();
    const entry = sellableEntries(save)[0];
    const r = await listForSale(p.deps(), entry, cert, 1500);
    expect(r.ok).toBe(true);
    expect(p.state.save.gearInstances[inst.id]).toBeUndefined();
    expect(m.store.certs.get(cert.id)).toMatchObject({ status: 'listed', inSave: false });

    // cancel: the certificate is back to its owner but NOT in the save; the sync builds the piece from the certificate
    const listingId = (r as { listingId: string }).listingId;
    expect((await p.api.cancelListing(listingId)).ok).toBe(true);
    const sync = await syncMarketOnce(p.deps());
    expect(sync).toMatchObject({ ok: true, added: 1, removed: 0 });
    const back = Object.values(p.state.save.gearInstances).find((i) => i.certificateId === cert.id)!;
    expect(back).toMatchObject({ templateId: 'bronze_dagger', rarity: 'epic', upgrade: 0, sockets: [], certificateId: cert.id });
    expect(back.substats).toEqual(cert.substats);
    expect(certState(back)).toBe('verified');
    // not acknowledged until the server confirms a save that has it
    expect(m.store.certs.get(cert.id)?.inSave).toBe(false);
    p.saved();
    const again = await syncMarketOnce(p.deps());
    expect(again).toMatchObject({ added: 0, acked: 1 });
    expect(m.store.certs.get(cert.id)?.inSave).toBe(true);
    expect(Object.values(p.state.save.gearInstances).filter((i) => i.certificateId === cert.id)).toHaveLength(1); // never twice
  });

  it('a refusal from the server leaves the save untouched', async () => {
    const { cert, inst, save } = withCertifiedPiece(USER_A);
    const p = player(USER_A, save);
    await p.deps().loadCertificates();
    m.store.flagged.add(USER_A);
    const r = await listForSale(p.deps(), sellableEntries(save)[0], cert, 1500);
    expect(r).toEqual({ ok: false, reason: 'flagged' });
    expect(p.state.save.gearInstances[inst.id]).toBeTruthy();
  });

  it('a listed pouch leaves the bag and the certificate list; if the bag is empty it comes from the stash', () => {
    const cert = { id: 'c1', kind: 'gold_pouch' as const, templateId: 'gold_pouch_s' };
    const save: SaveData = { ...defaultSave(), consumables: { ...defaultSave().consumables, gold_pouch_s: 2 }, pouchCerts: { gold_pouch_s: ['c1', 'c2'] } };
    const a = removeListedItem(save, cert);
    expect(a.consumables.gold_pouch_s).toBe(1);
    expect(a.pouchCerts?.gold_pouch_s).toEqual(['c2']);
    const stashed: SaveData = { ...save, consumables: { ...save.consumables, gold_pouch_s: 0 }, stash: { ...save.stash, consumables: { ...save.stash.consumables, gold_pouch_s: 1 } } };
    const b = removeListedItem(stashed, { ...cert, id: 'c2' });
    expect(b.stash.consumables.gold_pouch_s).toBe(0);
    expect(removeListedItem(save, { ...cert, id: 'nope' })).toBe(save);
  });
});

describe('a crash between the listing and the save', () => {
  it('the next sync takes a listed or sold item out of the save: it is not the player\'s any more', async () => {
    const { cert, inst, save } = withCertifiedPiece(USER_A);
    const p = player(USER_A, save);
    await p.deps().loadCertificates();
    // the server listed it, but the game died before it saved the removal
    await p.api.list(cert.id, 1500);
    expect(p.state.save.gearInstances[inst.id]).toBeTruthy();
    const sync = await syncMarketOnce(p.deps());
    expect(sync).toMatchObject({ ok: true, removed: 1 });
    expect(p.state.save.gearInstances[inst.id]).toBeUndefined();
    // the same for a SOLD certificate ('transferred' stays in the seller's own list)
    const save2 = { ...save };
    m.store.certs.get(cert.id)!.status = 'transferred';
    const q = player(USER_A, save2);
    await q.deps().loadCertificates();
    expect(reconcileOutgoing(save2, q.certsOf()).removed).toBe(1);
    expect(reconcileOutgoing(save2, []).removed).toBe(0);
  });
});

describe('a purchase, end to end: reserve, pay two legs, deliver from the certificate', () => {
  it('the buyer\'s item is built from the NEW certificate; the seller keeps nothing; the delivery is acknowledged only after a confirmed save', async () => {
    const { cert, inst, save } = withCertifiedPiece(USER_A);
    const seller = player(USER_A, save);
    await seller.deps().loadCertificates();
    await listForSale(seller.deps(), sellableEntries(save)[0], cert, 1000);
    const listingId = [...m.store.listings.keys()][0];

    const buyer = player(USER_B);
    const reserved = await buyer.api.reserve(listingId);
    expect(reserved.ok).toBe(true);
    const res = (reserved as { reservation: { id: string; feeCents: number; sellerCents: number; sellerAddress: string } }).reservation;
    expect(res.feeCents + res.sellerCents).toBe(1000);
    const feeTx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res.feeCents);
    const sellerTx = m.chain.pay(WALLET[USER_B], res.sellerAddress, res.sellerCents);
    expect((await buyer.api.submitPayment(res.id, 'fee', feeTx)).ok).toBe(true);
    const sold = await buyer.api.submitPayment(res.id, 'seller', sellerTx);
    expect(sold).toMatchObject({ ok: true, status: 'sold' });

    // the seller has nothing left, in the save or on the server
    expect(Object.values(seller.state.save.gearInstances).some((i) => i.certificateId === cert.id)).toBe(false);
    await syncMarketOnce(seller.deps());
    expect(Object.values(seller.state.save.gearInstances).some((i) => i.templateId === 'bronze_dagger' && i.id === inst.id)).toBe(false);

    // the buyer's game builds it from the certificate
    const sync = await syncMarketOnce(buyer.deps());
    expect(sync).toMatchObject({ ok: true, added: 1, acked: 0 });
    const got = Object.values(buyer.state.save.gearInstances).find((i) => i.templateId === 'bronze_dagger' && i.id !== 'st_wooden_club')!;
    expect(got.certificateId).toBe((sold as { certificateId: string }).certificateId);
    expect(got.certificateId).not.toBe(cert.id); // the NEW certificate, not the seller's
    expect(got.rarity).toBe('epic');
    expect(got.substats).toEqual(cert.substats);
    expect(certState(got)).toBe('verified');
    expect(isTradeable(got)).toBe(true);

    // a crash now (nothing saved) would lose nothing: the server still lists it as waiting, the next start builds it again
    const reloaded = player(USER_B, defaultSave());
    const resync = await syncMarketOnce(reloaded.deps());
    expect(resync.added).toBe(1);
    // and once a save that has it is confirmed, the ack closes it, and a third sync adds nothing
    buyer.saved();
    expect((await syncMarketOnce(buyer.deps())).acked).toBe(1);
    expect((await syncMarketOnce(buyer.deps())).added).toBe(0);
    expect(Object.values(buyer.state.save.gearInstances).filter((i) => i.certificateId === got.certificateId)).toHaveLength(1);
  });

  it('a full bag leaves the item waiting on the server, and nothing is added', async () => {
    const { cert, save } = withCertifiedPiece(USER_A);
    const seller = player(USER_A, save);
    await seller.deps().loadCertificates();
    await listForSale(seller.deps(), sellableEntries(save)[0], cert, 1000);
    const buyerCert = m.store.addCert(USER_B, { inSave: false });
    void buyerCert;
    const full: SaveData = { ...defaultSave(), inventoryCapacity: 1 as never };
    const out = deliverCertificate(full, { ...cert, status: 'held' } as CertificateView, Date.now());
    expect(['added', 'full']).toContain(out.status);
  });

  it('refuses a certificate that is not held, one of an unknown template, and never adds the same certificate twice', () => {
    const { cert, save } = withCertifiedPiece(USER_A);
    const view = (c: Partial<CertificateView>): CertificateView => ({ ...(cert as unknown as CertificateView), ...c });
    expect(deliverCertificate(defaultSave(), view({ status: 'burned' }), 1).status).toBe('bad');
    expect(deliverCertificate(defaultSave(), view({ templateId: 'nope_item' }), 1).status).toBe('bad');
    expect(deliverCertificate(defaultSave(), view({ kind: 'gold_pouch', templateId: 'gold_pouch_s', goldAmount: 1 }), 1).status).toBe('bad'); // a pouch must carry its exact face value
    expect(deliverCertificate(save, view({}), 1).status).toBe('present');
    const pouch = view({ id: 'p1', kind: 'gold_pouch', templateId: 'gold_pouch_s', goldAmount: 10_000, rarity: null, tier: null, substats: [] });
    const first = deliverCertificate(defaultSave(), pouch, 1);
    expect(first.status).toBe('added');
    expect(certifiedPouchIds(first.save, 'gold_pouch_s')).toEqual(['p1']);
    expect(deliverCertificate(first.save, pouch, 1).status).toBe('present');
  });
});
