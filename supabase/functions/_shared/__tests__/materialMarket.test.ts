import { describe, expect, it } from 'vitest';
import { MARKET_MAX_PRICE_LAMPORTS, MARKET_MIN_PRICE_LAMPORTS, formatUnitPrice, isMaterialTotalLamports, isUnitPriceMicro, materialTotalLamports, parseUnitPrice, splitLamports } from '../chain/solMoney.ts';
import { MARKET_RULES } from '../market/rules.ts';
import { DAY } from './fakeMarketStore.ts';
import { FEE_ADDRESS, USER_A, USER_B, USER_C, WALLET, makeMarket } from './marketHarness.ts';

// Lots of tradeable materials on the market (migration 0015 part B, docs/MARKET_FOUNDATION.md): listing moves the units into escrow, a purchase delivers them to the buyer, a cancel or an expiry returns them
// to the seller, and the lot is bought WHOLE. The handlers run over the in-memory store that follows the SQL step by step.

type M = ReturnType<typeof makeMarket>;
interface Res {
  id: string;
  priceLamports: number;
  feeLamports: number;
  sellerLamports: number;
  sellerAddress: string;
}

async function lotMarket(credit = 50) {
  const m = makeMarket();
  for (const u of [USER_A, USER_B, USER_C]) m.link(u);
  await m.store.materials.credit({ userId: USER_A, requestId: 'seed:iron:0001', credits: { iron: credit } });
  return m;
}

const listLot = (m: M, over: Record<string, unknown> = {}, userId = USER_A) =>
  m.list({ action: 'list_material', requestId: `lot:${Math.random().toString(36).slice(2, 12)}`, materialId: 'iron', quantity: 20, unitPriceMicro: 2500, ...over }, userId);

const bal = (m: M, userId: string, id = 'iron') => ({ ...m.store.materials.row(userId, id) });

function payAndSubmit(m: M, res: Res, buyer = USER_B) {
  const signature = m.chain.sale(WALLET[buyer], [{ to: res.sellerAddress, lamports: res.sellerLamports }, { to: FEE_ADDRESS, lamports: res.feeLamports }], {});
  return m.buy({ action: 'submit', reservationId: res.id, signature }, buyer);
}

describe('prices of a lot: per unit, up to 6 decimals, a whole lot of at least 0.001 SOL', () => {
  it('parses and prints unit prices with up to 6 decimals and nothing else', () => {
    expect(parseUnitPrice('0.0025')).toBe(2500);
    expect(parseUnitPrice('0.000001')).toBe(1);
    expect(parseUnitPrice('1')).toBe(1_000_000);
    expect(parseUnitPrice('12.5')).toBe(12_500_000);
    for (const bad of ['0', '0.0000001', '-1', '1e3', 'abc', '', '0.', '.5', '1,5', null, undefined, '12345']) expect(parseUnitPrice(bad as string), String(bad)).toBeNull();
    expect(formatUnitPrice(2500)).toBe('0.0025');
    expect(formatUnitPrice(1)).toBe('0.000001');
    expect(formatUnitPrice(1_000_000)).toBe('1.00');
  });

  it('the lot total is unit x quantity x 1000 lamports, an integer, and has to be 0.001 to 50 SOL', () => {
    expect(materialTotalLamports(2500, 20)).toBe(50_000_000);
    expect(isMaterialTotalLamports(materialTotalLamports(1, 1000))).toBe(true); // exactly 0.001 SOL
    expect(isMaterialTotalLamports(materialTotalLamports(1, 999))).toBe(false);
    expect(isMaterialTotalLamports(MARKET_MAX_PRICE_LAMPORTS)).toBe(true);
    expect(isMaterialTotalLamports(MARKET_MAX_PRICE_LAMPORTS + 1000)).toBe(false);
    expect(isMaterialTotalLamports(1_000_500)).toBe(false); // not a whole number of micro-SOL
    expect(isUnitPriceMicro(0)).toBe(false);
    expect(isUnitPriceMicro(1.5)).toBe(false);
    expect(isUnitPriceMicro(MARKET_MAX_PRICE_LAMPORTS / 1000)).toBe(true);
    expect(MARKET_MIN_PRICE_LAMPORTS).toBe(1_000_000);
  });
});

describe('listing a lot: the units go from the seller\'s balance into escrow', () => {
  it('moves exactly the quantity out of the balance and makes one listing whose price is the whole lot', async () => {
    const m = await lotMarket();
    const r = await listLot(m, { quantity: 20, unitPriceMicro: 2500 });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(bal(m, USER_A).qty).toBe(30);
    const [listing] = [...m.store.listings.values()];
    expect(listing).toMatchObject({ certificateId: null, materialId: 'iron', materialQty: 20, unitPriceMicro: 2500, priceLamports: 50_000_000, status: 'open' });
  });

  it('a retry with the same request id returns the same listing and moves nothing twice', async () => {
    const m = await lotMarket();
    const body = { action: 'list_material', requestId: 'lot:iron:retry', materialId: 'iron', quantity: 20, unitPriceMicro: 2500 };
    const a = await m.list(body);
    const b = await m.list(body);
    expect(b.body.listingId).toBe(a.body.listingId);
    expect(bal(m, USER_A).qty).toBe(30);
    expect(m.store.listings.size).toBe(1);
  });

  it('refuses more than the account has IN ITS SAVE (units still waiting to be collected cannot be sold), and an unknown or non-tradeable material', async () => {
    const m = await lotMarket(10);
    expect((await listLot(m, { quantity: 11 })).body).toMatchObject({ ok: false, reason: 'not_enough' });
    m.store.materials.deliver(USER_A, 'copper', 10); // qty 10, pending 10: nothing in the save
    expect((await listLot(m, { materialId: 'copper', quantity: 1 })).body).toMatchObject({ ok: false, reason: 'not_enough' });
    expect((await listLot(m, { materialId: 'copper_bar', quantity: 1 })).status).toBe(400);
    expect((await listLot(m, { materialId: 'nonsense' })).status).toBe(400);
    expect(bal(m, USER_A).qty).toBe(10);
    expect(m.store.listings.size).toBe(0);
  });

  it('prices are checked: a unit price of 0, a lot under 0.001 SOL or over 50 SOL, a fractional price, a quantity of 0 or over the limit', async () => {
    const m = await lotMarket(100_000);
    for (const over of [{ unitPriceMicro: 0 }, { unitPriceMicro: 1.5 }, { unitPriceMicro: 1, quantity: 999 }, { unitPriceMicro: 5_000_000, quantity: 11 }, { unitPriceMicro: '2500' }]) {
      const r = await listLot(m, over);
      expect(r.status, JSON.stringify(over)).toBe(400);
      expect(r.body.reason, JSON.stringify(over)).toBe('price');
    }
    for (const over of [{ quantity: 0 }, { quantity: -3 }, { quantity: 2.5 }, { quantity: MARKET_RULES.maxMaterialQtyPerListing + 1 }, { requestId: 'x' }, { quantity: '5' }]) {
      const r = await listLot(m, over);
      expect(r.status, JSON.stringify(over)).toBe(400);
      expect(r.body.reason, JSON.stringify(over)).toBe('bad_request');
    }
    expect((await listLot(m, { quantity: 1000, unitPriceMicro: 1 })).status).toBe(200); // exactly 0.001 SOL
    expect(m.store.listings.size).toBe(1);
  });

  it('needs a linked wallet and an account without audit flags; lots count against the same 20 live listings and 20 a day as items', async () => {
    const m = await lotMarket(500);
    m.store.wallets.delete(USER_A);
    expect((await listLot(m)).body).toMatchObject({ reason: 'no_wallet' });
    m.link(USER_A);
    m.store.flagged.add(USER_A);
    expect((await listLot(m)).body).toMatchObject({ reason: 'flagged' });
    m.store.flagged.delete(USER_A);
    for (let i = 0; i < MARKET_RULES.maxActiveListings; i++) expect((await listLot(m, { quantity: 1, unitPriceMicro: 1_000_000 })).status).toBe(200);
    const over = await listLot(m, { quantity: 1, unitPriceMicro: 1_000_000 });
    expect(over.status).toBe(429);
    expect(over.body.reason).toBe('limit_active');
    expect(bal(m, USER_A).qty).toBe(500 - MARKET_RULES.maxActiveListings);
  });

  it('a request without a token lists nothing', async () => {
    const m = await lotMarket();
    expect((await listLot(m, {}, null as unknown as string)).status).toBe(401);
    expect(bal(m, USER_A).qty).toBe(50);
  });
});

describe('cancelling and expiring a lot returns the units as a delivery', () => {
  it('cancel: the units come back to the seller as pending (the game collects them), the listing is closed', async () => {
    const m = await lotMarket();
    const id = (await listLot(m)).body.listingId as string;
    const r = await m.list({ action: 'cancel', listingId: id }, USER_A);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, certificateId: null, materialId: 'iron', quantity: 20 });
    expect(bal(m, USER_A)).toEqual({ qty: 50, pending: 20, seq: 1 });
    expect(m.store.listings.get(id)?.status).toBe('cancelled');
    // a second cancel does nothing
    expect((await m.list({ action: 'cancel', listingId: id }, USER_A)).status).toBe(409);
    expect(bal(m, USER_A)).toEqual({ qty: 50, pending: 20, seq: 1 });
  });

  it('only the seller can cancel, and a reserved lot cannot be cancelled', async () => {
    const m = await lotMarket();
    const id = (await listLot(m)).body.listingId as string;
    expect((await m.list({ action: 'cancel', listingId: id }, USER_B)).status).toBe(404);
    expect((await m.buy({ action: 'reserve', listingId: id }, USER_B)).status).toBe(200);
    const r = await m.list({ action: 'cancel', listingId: id }, USER_A);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('reserved');
    expect(bal(m, USER_A).qty).toBe(30);
  });

  it('a lot nobody bought in 30 days expires and the units return to the seller as a delivery', async () => {
    const m = await lotMarket();
    const id = (await listLot(m)).body.listingId as string;
    m.store.nowMs += (MARKET_RULES.listingTtlDays + 1) * DAY;
    await m.store.expireDue();
    expect(m.store.listings.get(id)?.status).toBe('expired');
    expect(bal(m, USER_A)).toEqual({ qty: 50, pending: 20, seq: 1 });
  });
});

describe('buying a lot: whole, paid in one transaction, delivered to the buyer', () => {
  it('the reservation is for the whole lot; the fee is 5% rounded up; the buyer receives every unit as a delivery and the seller\'s balance is untouched', async () => {
    const m = await lotMarket();
    const id = (await listLot(m, { quantity: 20, unitPriceMicro: 2500 })).body.listingId as string;
    // a body that asks for part of the lot is ignored: there is no quantity in a reservation
    const reserved = await m.buy({ action: 'reserve', listingId: id, quantity: 5 }, USER_B);
    expect(reserved.status).toBe(200);
    const res = reserved.body.reservation as Res;
    expect(res.priceLamports).toBe(50_000_000);
    expect(res).toMatchObject(splitLamports(50_000_000));
    expect(res.feeLamports + res.sellerLamports).toBe(res.priceLamports);
    const sold = await payAndSubmit(m, res);
    expect(sold.status).toBe(200);
    expect(sold.body).toMatchObject({ ok: true, status: 'sold', certificateId: null, materialId: 'iron', quantity: 20 });
    expect(bal(m, USER_B)).toEqual({ qty: 20, pending: 20, seq: 1 });
    expect(bal(m, USER_A).qty).toBe(30); // the escrow already took the units
    expect(m.store.listings.get(id)?.status).toBe('sold');
    expect(m.store.sales).toHaveLength(1);
    expect(m.store.sales[0]).toMatchObject({ certificateId: null, newCertificateId: null, materialId: 'iron', materialQty: 20, priceLamports: 50_000_000, itemKind: 'material' });
  });

  it('a lot cannot be bought twice, by two buyers, or by its own seller', async () => {
    const m = await lotMarket();
    const id = (await listLot(m)).body.listingId as string;
    expect((await m.buy({ action: 'reserve', listingId: id }, USER_A)).body.reason).toBe('own_listing');
    const first = (await m.buy({ action: 'reserve', listingId: id }, USER_B)).body.reservation as Res;
    expect((await m.buy({ action: 'reserve', listingId: id }, USER_C)).body.reason).toBe('reserved');
    expect((await payAndSubmit(m, first)).body).toMatchObject({ status: 'sold' });
    expect((await m.buy({ action: 'reserve', listingId: id }, USER_C)).body.reason).toBe('not_open');
    expect(bal(m, USER_B).qty).toBe(20);
    expect(bal(m, USER_C).qty).toBe(0);
  });

  it('the same payment submitted twice is one sale (the signature is consumed once)', async () => {
    const m = await lotMarket();
    const id = (await listLot(m)).body.listingId as string;
    const res = (await m.buy({ action: 'reserve', listingId: id }, USER_B)).body.reservation as Res;
    const signature = m.chain.sale(WALLET[USER_B], [{ to: res.sellerAddress, lamports: res.sellerLamports }, { to: FEE_ADDRESS, lamports: res.feeLamports }], {});
    await m.buy({ action: 'submit', reservationId: res.id, signature }, USER_B);
    const again = await m.buy({ action: 'submit', reservationId: res.id, signature }, USER_B);
    expect(again.body).toMatchObject({ ok: true, status: 'replayed' });
    expect(bal(m, USER_B)).toEqual({ qty: 20, pending: 20, seq: 1 });
    expect(m.store.sales).toHaveLength(1);
  });

  it('a payment that is short does not deliver anything', async () => {
    const m = await lotMarket();
    const id = (await listLot(m)).body.listingId as string;
    const res = (await m.buy({ action: 'reserve', listingId: id }, USER_B)).body.reservation as Res;
    const signature = m.chain.sale(WALLET[USER_B], [{ to: res.sellerAddress, lamports: res.sellerLamports - 1 }, { to: FEE_ADDRESS, lamports: res.feeLamports }], {});
    const r = await m.buy({ action: 'submit', reservationId: res.id, signature }, USER_B);
    expect(r.body.ok).toBe(false);
    expect(bal(m, USER_B).qty).toBe(0);
    expect(m.store.listings.get(id)?.status).toBe('reserved');
  });

  it('the game acknowledges the delivery and the pending units are cleared (material-sync)', async () => {
    const m = await lotMarket();
    const id = (await listLot(m)).body.listingId as string;
    await payAndSubmit(m, (await m.buy({ action: 'reserve', listingId: id }, USER_B)).body.reservation as Res);
    expect(bal(m, USER_B).pending).toBe(20);
    const r = await m.store.materials.ack({ userId: USER_B, requestId: 'ack:aaaaaaaa', units: { iron: 20 } });
    expect(r.applied).toEqual({ iron: 20 });
    expect(bal(m, USER_B)).toEqual({ qty: 20, pending: 0, seq: 1 });
    // and the buyer can sell them on: they are in his save now
    await m.store.materials.credit({ userId: USER_B, requestId: 'seed:x:0000', credits: {} });
    expect((await listLot(m, { quantity: 20 }, USER_B)).status).toBe(200);
    expect(bal(m, USER_B).qty).toBe(0);
  });
});

describe('what the screens read', () => {
  it('my offers show the lot (material, quantity, unit price) and the history shows the quantity', async () => {
    const m = await lotMarket();
    const id = (await listLot(m, { quantity: 20, unitPriceMicro: 2500 })).body.listingId as string;
    const mine = await m.my({ action: 'overview' }, USER_A);
    const lot = (mine.body.listings as { id: string; certificateId: string | null; priceLamports: number; item: Record<string, unknown> }[]).find((l) => l.id === id)!;
    expect(lot.certificateId).toBeNull();
    expect(lot.priceLamports).toBe(50_000_000);
    expect(lot.item).toMatchObject({ kind: 'material', templateId: 'iron', quantity: 20, unitPriceMicro: 2500 });
    await payAndSubmit(m, (await m.buy({ action: 'reserve', listingId: id }, USER_B)).body.reservation as Res);
    const buyer = await m.my({ action: 'overview' }, USER_B);
    expect((buyer.body.sales as { role: string; item: Record<string, unknown> }[])[0]).toMatchObject({ role: 'buyer', item: { kind: 'material', templateId: 'iron', quantity: 20 } });
  });
});

describe('no unit is ever created or destroyed by the market', () => {
  it('after any mix of listings, cancels, expiries, purchases and acknowledgements, the units are exactly the ones the server issued', async () => {
    let seed = 99;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const m = makeMarket();
    const users = [USER_A, USER_B, USER_C];
    for (const u of users) m.link(u);
    await m.store.materials.credit({ userId: USER_A, requestId: 'seed:a:0000', credits: { iron: 120 } });
    await m.store.materials.credit({ userId: USER_B, requestId: 'seed:b:0000', credits: { iron: 80 } });
    const issued = 200;
    const owned = (): number => users.reduce((n, u) => n + bal(m, u).qty, 0);
    const escrow = (): number => [...m.store.listings.values()].filter((l) => l.status === 'open' || l.status === 'reserved').reduce((n, l) => n + (l.materialQty ?? 0), 0);
    let ack = 0;
    for (let step = 0; step < 300; step++) {
      const u = users[Math.floor(rnd() * users.length)];
      const live = [...m.store.listings.values()].filter((l) => l.status === 'open' || l.status === 'reserved');
      const roll = rnd();
      m.store.nowMs += Math.floor(rnd() * 3 * 3600_000);
      if (roll < 0.3) await listLot(m, { quantity: 1 + Math.floor(rnd() * 15), unitPriceMicro: 1000 + Math.floor(rnd() * 5000) }, u);
      else if (roll < 0.45 && live.length) await m.list({ action: 'cancel', listingId: live[Math.floor(rnd() * live.length)].id }, u);
      else if (roll < 0.75 && live.length) {
        const l = live[Math.floor(rnd() * live.length)];
        const r = await m.buy({ action: 'reserve', listingId: l.id }, u);
        if (r.body.ok && rnd() < 0.8) await payAndSubmit(m, r.body.reservation as Res, u);
        else if (r.body.ok) await m.buy({ action: 'cancel', reservationId: (r.body.reservation as Res).id }, u);
      } else if (roll < 0.9) {
        const b = bal(m, u);
        if (b.pending > 0) await m.store.materials.ack({ userId: u, requestId: `ack:${++ack}:${u.slice(0, 4)}`, units: { iron: b.pending } });
      } else if (roll < 0.95) m.store.nowMs += 31 * DAY;
      await m.store.expireDue();
      expect(owned() + escrow(), `step ${step}`).toBe(issued);
      for (const x of users) {
        const b = bal(m, x);
        expect(b.pending, `step ${step}`).toBeLessThanOrEqual(b.qty);
        expect(b.qty, `step ${step}`).toBeGreaterThanOrEqual(0);
      }
    }
    // the run really did something: lots were listed, sold, cancelled and expired
    const states = new Set([...m.store.listings.values()].map((l) => l.status));
    expect(m.store.listings.size).toBeGreaterThan(20);
    expect(m.store.sales.length).toBeGreaterThan(5);
    expect(states.has('sold') && states.has('cancelled') && states.has('expired')).toBe(true);
  });
});
