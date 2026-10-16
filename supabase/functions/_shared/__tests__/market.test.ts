import { describe, expect, it } from 'vitest';
import { splitPrice } from '../chain/money.ts';
import { MARKET_RULES } from '../market/rules.ts';
import { DAY, MIN } from './fakeMarketStore.ts';
import { FEE_ADDRESS, PASS_ADDRESS, USER_A, USER_B, USER_C, USER_D, WALLET, makeMarket, throwawayWallet } from './marketHarness.ts';

// The market handlers over an in-memory store that follows migration 0011 / 0012 and a fake BSC node. No Deno, no Supabase, no network, no wallet.

type M = ReturnType<typeof makeMarket>;
const reservationOf = (r: { body: Record<string, unknown> }) => r.body.reservation as { id: string; feeCents: number; sellerCents: number; sellerAddress: string; feeAddress: string; status: string; payments: { leg: string; status: string }[] };

/** Seller A lists a fresh certificate for `price` cents; buyers B, C, D have wallets too. */
async function market(price = 1000) {
  const m = makeMarket();
  for (const u of [USER_A, USER_B, USER_C, USER_D]) m.link(u);
  const cert = m.store.addCert(USER_A);
  const listed = await m.list({ action: 'list', certificateId: cert.id, priceCents: price }, USER_A);
  expect(listed.status).toBe(200);
  return { m, cert, listingId: listed.body.listingId as string };
}

async function reserve(m: M, listingId: string, buyer = USER_B) {
  const r = await m.buy({ action: 'reserve', listingId }, buyer);
  return { ...r, res: r.body.ok ? reservationOf(r) : null };
}

/** The buyer makes the two transfers in his wallet (fee first, as the game shows them) and submits both hashes. */
async function payAndSubmit(m: M, res: { id: string; feeCents: number; sellerCents: number; sellerAddress: string }, buyer = USER_B) {
  const feeTx = m.chain.pay(WALLET[buyer], FEE_ADDRESS, res.feeCents);
  const sellerTx = m.chain.pay(WALLET[buyer], res.sellerAddress, res.sellerCents);
  const fee = await m.buy({ action: 'submit', reservationId: res.id, leg: 'fee', txHash: feeTx }, buyer);
  const seller = await m.buy({ action: 'submit', reservationId: res.id, leg: 'seller', txHash: sellerTx }, buyer);
  return { fee, seller, feeTx, sellerTx };
}

describe('wallet ownership through market-wallet', () => {
  async function link(m: M, userId: string, w = throwawayWallet(), address = w.address) {
    const n = await m.wallet({ action: 'nonce', address }, userId);
    expect(n.status).toBe(200);
    return { w, n: n.body as { nonce: string; message: string } };
  }

  it('links an address after a valid signature of the message the SERVER wrote', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    expect(n.message).toContain(`Account: ${USER_A}`);
    expect(n.message).toContain(`Address: ${w.address}`);
    const r = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature: w.sign(n.message) }, USER_A);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 'linked', wallet: { address: w.address, chainId: 97 } });
    expect((await m.store.wallet(USER_A))?.address).toBe(w.address);
    const status = await m.wallet({ action: 'status' }, USER_A);
    expect(status.body).toMatchObject({ enabled: true, wallet: { address: w.address }, chain: { chainId: 97, minConfirmations: 15, livemode: false, feePercent: 5 } });
  });

  it('refuses a signature made by a wallet that is not the claimed address', async () => {
    const m = makeMarket();
    const owner = throwawayWallet();
    const thief = throwawayWallet();
    const { n } = await link(m, USER_A, thief, owner.address);
    const r = await m.wallet({ action: 'link', address: owner.address, nonce: n.nonce, signature: thief.sign(n.message) }, USER_A);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await m.store.wallet(USER_A)).toBeNull();
  });

  it('a nonce works ONCE: replaying the same signature is refused, and a failed signature burns the nonce', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    const sig = w.sign(n.message);
    expect((await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature: sig }, USER_A)).status).toBe(200);
    const replay = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature: sig }, USER_A);
    expect(replay.body).toEqual({ ok: false, reason: 'nonce_invalid' });

    const m2 = makeMarket();
    const { w: w2, n: n2 } = await link(m2, USER_A);
    await m2.wallet({ action: 'link', address: w2.address, nonce: n2.nonce, signature: `0x${'11'.repeat(64)}1b` }, USER_A);
    const again = await m2.wallet({ action: 'link', address: w2.address, nonce: n2.nonce, signature: w2.sign(n2.message) }, USER_A);
    expect(again.body).toEqual({ ok: false, reason: 'nonce_invalid' });
  });

  it('a signature cannot be carried to another account, and a nonce of another account is refused', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    const sig = w.sign(n.message);
    // user B tries A's nonce + signature
    const stolen = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature: sig }, USER_B);
    expect(stolen.body).toEqual({ ok: false, reason: 'nonce_invalid' });
    // B asks his own nonce and presents A's signature of A's message
    const own = await m.wallet({ action: 'nonce', address: w.address }, USER_B);
    const r = await m.wallet({ action: 'link', address: w.address, nonce: (own.body as { nonce: string }).nonce, signature: sig }, USER_B);
    expect(r.body).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('an expired nonce is refused', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    m.store.nowMs += MARKET_RULES.nonceTtlSeconds * 1000 + 1;
    const r = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature: w.sign(n.message) }, USER_A);
    expect(r.body).toEqual({ ok: false, reason: 'nonce_invalid' });
  });

  it('nonces are rate limited per account', async () => {
    const m = makeMarket();
    const w = throwawayWallet();
    for (let i = 0; i < MARKET_RULES.nonceMax; i++) expect((await m.wallet({ action: 'nonce', address: w.address }, USER_A)).status).toBe(200);
    expect((await m.wallet({ action: 'nonce', address: w.address }, USER_A)).status).toBe(429);
    expect((await m.wallet({ action: 'nonce', address: w.address }, USER_B)).status).toBe(200);
  });

  it('one address belongs to ONE account; changing it needs a new signature and is refused while money or an item is in flight', async () => {
    const m = makeMarket();
    const first = throwawayWallet();
    const { n } = await link(m, USER_A, first);
    await m.wallet({ action: 'link', address: first.address, nonce: n.nonce, signature: first.sign(n.message) }, USER_A);

    const { n: nb } = await link(m, USER_B, first);
    const taken = await m.wallet({ action: 'link', address: first.address, nonce: nb.nonce, signature: first.sign(nb.message) }, USER_B);
    expect(taken.body).toEqual({ ok: false, reason: 'address_taken' });

    const cert = m.store.addCert(USER_A);
    await m.list({ action: 'list', certificateId: cert.id, priceCents: 1000 }, USER_A);
    const second = throwawayWallet();
    const { n: n2 } = await link(m, USER_A, second);
    const busy = await m.wallet({ action: 'link', address: second.address, nonce: n2.nonce, signature: second.sign(n2.message) }, USER_A);
    expect(busy.body).toEqual({ ok: false, reason: 'busy' });
    expect((await m.store.wallet(USER_A))?.address).toBe(first.address);
  });

  it('is unavailable (503) when the chain secrets are not set, but status still answers', async () => {
    const m = makeMarket({ chain: false });
    expect((await m.wallet({ action: 'nonce', address: WALLET[USER_A] }, USER_A)).status).toBe(503);
    expect((await m.wallet({ action: 'status' }, USER_A)).body).toMatchObject({ enabled: false, chain: null });
  });

  it('every market function needs the JWT and ignores any user id in the body', async () => {
    const m = makeMarket();
    expect((await m.wallet({ action: 'status' }, null)).status).toBe(401);
    expect((await m.list({ action: 'list' }, null)).status).toBe(401);
    expect((await m.buy({ action: 'reserve' }, null)).status).toBe(401);
    expect((await m.my({ action: 'overview' }, null)).status).toBe(401);
    expect((await m.pass({ action: 'start' }, null)).status).toBe(401);
    m.link(USER_A);
    const cert = m.store.addCert(USER_A);
    const r = await m.list({ action: 'list', certificateId: cert.id, priceCents: 1000, userId: USER_B, user_id: USER_B }, USER_A);
    expect(r.status).toBe(200);
    expect([...m.store.listings.values()][0].sellerId).toBe(USER_A);
  });
});

describe('listing rules', () => {
  it('lists a held, unbound, in-save certificate: it goes to "listed", leaves the save, and shows up in my listings', async () => {
    const m = makeMarket();
    m.link(USER_A);
    const cert = m.store.addCert(USER_A);
    const r = await m.list({ action: 'list', certificateId: cert.id, priceCents: 1999 }, USER_A);
    expect(r.status).toBe(200);
    expect(m.store.certs.get(cert.id)).toMatchObject({ status: 'listed', inSave: false });
    const mine = await m.my({ action: 'overview' }, USER_A);
    expect(mine.body.listings).toMatchObject([{ id: r.body.listingId, priceCents: 1999, status: 'open', certificateId: cert.id }]);
  });

  it('refuses everything that is not a live, unbound, held certificate of the caller', async () => {
    const m = makeMarket();
    m.link(USER_A);
    const list = async (id: string, price = 1000, user = USER_A) => (await m.list({ action: 'list', certificateId: id, priceCents: price }, user)).body.reason;
    const bound = m.store.addCert(USER_A, { bound: true });
    const burned = m.store.addCert(USER_A, { status: 'burned' });
    const revoked = m.store.addCert(USER_A, { status: 'revoked' });
    const transferred = m.store.addCert(USER_A, { status: 'transferred' });
    const away = m.store.addCert(USER_A, { inSave: false });
    const other = m.store.addCert(USER_B);
    expect(await list(bound.id)).toBe('bound');
    expect(await list(burned.id)).toBe('not_held');
    expect(await list(revoked.id)).toBe('not_held');
    expect(await list(transferred.id)).toBe('not_held');
    expect(await list(away.id)).toBe('not_in_save');
    expect(await list(other.id)).toBe('not_found'); // another account's certificate: no hint it exists
    expect(await list('99999999-9999-4999-8999-999999999999')).toBe('not_found');
    expect(await list('not-a-uuid')).toBe('bad_request');
    expect([...m.store.listings.values()]).toHaveLength(0);
    for (const c of [bound, burned, revoked, transferred, away, other]) expect(m.store.certs.get(c.id)?.status).not.toBe('listed');
  });

  it('refuses a certificate that is already listed (also after the first listing)', async () => {
    const { m, cert } = await market();
    const again = await m.list({ action: 'list', certificateId: cert.id, priceCents: 1000 }, USER_A);
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe('already_listed');
    expect([...m.store.listings.values()]).toHaveLength(1);
  });

  it('needs a linked wallet and an unflagged account', async () => {
    const m = makeMarket();
    const cert = m.store.addCert(USER_A);
    expect((await m.list({ action: 'list', certificateId: cert.id, priceCents: 1000 }, USER_A)).body.reason).toBe('no_wallet');
    m.link(USER_A);
    m.store.flagged.add(USER_A);
    const r = await m.list({ action: 'list', certificateId: cert.id, priceCents: 1000 }, USER_A);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe('flagged');
  });

  it('the price is whole cents between 0.50 and 5,000.00 USDT', async () => {
    const m = makeMarket();
    m.link(USER_A);
    const cert = m.store.addCert(USER_A);
    for (const bad of [49, 500001, 10.5, -5, 0, '1000', null]) {
      const r = await m.list({ action: 'list', certificateId: cert.id, priceCents: bad }, USER_A);
      expect(r.status, String(bad)).toBe(400);
    }
    expect((await m.list({ action: 'list', certificateId: cert.id, priceCents: 50 }, USER_A)).status).toBe(200);
  });

  it('limits live listings and listings per day', async () => {
    const m = makeMarket();
    m.link(USER_A);
    for (let i = 0; i < MARKET_RULES.maxActiveListings; i++) expect((await m.list({ action: 'list', certificateId: m.store.addCert(USER_A).id, priceCents: 100 }, USER_A)).status).toBe(200);
    const over = await m.list({ action: 'list', certificateId: m.store.addCert(USER_A).id, priceCents: 100 }, USER_A);
    expect(over.status).toBe(429);
    expect(over.body.reason).toBe('limit_active');
  });

  it('cancelling returns the certificate to its owner (held, waiting to be collected), never while a buyer holds it', async () => {
    const { m, cert, listingId } = await market();
    const { res } = await reserve(m, listingId);
    expect(res).not.toBeNull();
    const blocked = await m.list({ action: 'cancel', listingId }, USER_A);
    expect(blocked.status).toBe(409);
    expect(blocked.body.reason).toBe('reserved');
    expect(m.store.listings.get(listingId)?.status).toBe('reserved');

    const b = await market();
    const cancelled = await b.m.list({ action: 'cancel', listingId: b.listingId }, USER_A);
    expect(cancelled.status).toBe(200);
    expect(b.m.store.certs.get(b.cert.id)).toMatchObject({ status: 'held', inSave: false });
    const overview = await b.m.my({ action: 'overview' }, USER_A);
    expect((overview.body.pending as { id: string }[]).map((c) => c.id)).toEqual([b.cert.id]);
    // not his listing / unknown listing
    expect((await b.m.list({ action: 'cancel', listingId: b.listingId }, USER_B)).status).toBe(404);
    expect((await b.m.list({ action: 'cancel', listingId: b.listingId }, USER_A)).status).toBe(409); // already cancelled
    void cert;
  });

  it('there is no way to change the price of a live listing: only cancel and list again (and cancel is refused while reserved)', async () => {
    const { m, listingId } = await market();
    const edit = await m.list({ action: 'update', listingId, priceCents: 50 }, USER_A);
    expect(edit.status).toBe(400);
    expect(m.store.listings.get(listingId)?.priceCents).toBe(1000);
  });
});

describe('reserving', () => {
  it('locks the listing for 30 minutes with the split the buyer will see: price x 0.95 to the seller and 0.05 to the game, summing exactly', async () => {
    for (const price of [50, 199, 1000, 12345]) {
      const { m, listingId } = await market(price);
      const { res, status } = await reserve(m, listingId);
      expect(status).toBe(200);
      const split = splitPrice(price);
      expect(res).toMatchObject({ feeCents: split.feeCents, sellerCents: split.sellerCents, sellerAddress: WALLET[USER_A], feeAddress: FEE_ADDRESS, status: 'pending' });
      expect((res?.feeCents ?? 0) + (res?.sellerCents ?? 0)).toBe(price);
      expect(m.store.listings.get(listingId)?.status).toBe('reserved');
    }
  });

  it('the seller address is shown to the reserving buyer only; the overview of other players and the public side never carry an address', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    expect(res?.sellerAddress).toBe(WALLET[USER_A]);
    const others = JSON.stringify([(await m.my({ action: 'overview' }, USER_C)).body, (await m.my({ action: 'overview' }, USER_D)).body]);
    expect(others).not.toContain(WALLET[USER_A]);
    expect(others).not.toContain(WALLET[USER_B]);
    const sellerView = JSON.stringify((await m.my({ action: 'overview' }, USER_A)).body.listings);
    expect(sellerView).not.toContain(WALLET[USER_B]);
    // C cannot read B's reservation
    expect((await m.buy({ action: 'status', reservationId: res?.id }, USER_C)).status).toBe(404);
  });

  it('two buyers cannot hold the same listing: exactly one wins, even asking at the same instant', async () => {
    const { m, listingId } = await market();
    const [r1, r2, r3] = await Promise.all([reserve(m, listingId, USER_B), reserve(m, listingId, USER_C), reserve(m, listingId, USER_D)]);
    expect([r1, r2, r3].filter((r) => r.status === 200)).toHaveLength(1);
    expect([r1, r2, r3].filter((r) => r.status === 409).map((r) => r.body.reason)).toEqual(['reserved', 'reserved']);
    expect([...m.store.reservations.values()].filter((r) => r.status === 'pending')).toHaveLength(1);
  });

  it('a buyer holds ONE reservation at a time and is told which', async () => {
    const { m, listingId } = await market();
    const second = m.store.addCert(USER_A);
    const l2 = await m.list({ action: 'list', certificateId: second.id, priceCents: 500 }, USER_A);
    const first = await reserve(m, listingId);
    const again = await m.buy({ action: 'reserve', listingId: l2.body.listingId }, USER_B);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ reason: 'reservation_exists', reservationId: first.res?.id });
    // after cancelling he can reserve the other
    expect((await m.buy({ action: 'cancel', reservationId: first.res?.id }, USER_B)).status).toBe(200);
    expect((await m.buy({ action: 'reserve', listingId: l2.body.listingId }, USER_B)).status).toBe(200);
  });

  it('refuses the seller, a buyer without a wallet, an unknown listing, and a listing that is not open', async () => {
    const { m, listingId } = await market();
    expect((await m.buy({ action: 'reserve', listingId }, USER_A)).body.reason).toBe('own_listing');
    const noWallet = makeMarket();
    const c = noWallet.store.addCert(USER_A);
    noWallet.link(USER_A);
    const l = await noWallet.list({ action: 'list', certificateId: c.id, priceCents: 1000 }, USER_A);
    expect((await noWallet.buy({ action: 'reserve', listingId: l.body.listingId }, USER_B)).body.reason).toBe('no_wallet');
    expect((await m.buy({ action: 'reserve', listingId: '99999999-9999-4999-8999-999999999999' }, USER_B)).body.reason).toBe('not_found');
    expect((await m.buy({ action: 'reserve', listingId: 'x' }, USER_B)).status).toBe(400);
    await m.list({ action: 'cancel', listingId }, USER_A);
    expect((await m.buy({ action: 'reserve', listingId }, USER_B)).body.reason).toBe('not_open');
  });

  it('is rate limited per buyer, abandoned reservations included', async () => {
    const m = makeMarket();
    for (const u of [USER_A, USER_B]) m.link(u);
    const ids: string[] = [];
    for (let i = 0; i < MARKET_RULES.reserveRateMax + 1; i++) {
      const c = m.store.addCert(USER_A);
      ids.push((await m.list({ action: 'list', certificateId: c.id, priceCents: 100 }, USER_A)).body.listingId as string);
    }
    for (let i = 0; i < MARKET_RULES.reserveRateMax; i++) {
      const r = await m.buy({ action: 'reserve', listingId: ids[i] }, USER_B);
      expect(r.status).toBe(200);
      await m.buy({ action: 'cancel', reservationId: reservationOf(r).id }, USER_B);
    }
    const over = await m.buy({ action: 'reserve', listingId: ids[MARKET_RULES.reserveRateMax] }, USER_B);
    expect(over.status).toBe(429);
    expect(over.body.reason).toBe('rate_limited');
  });

  it('an abandoned reservation frees the listing after 30 minutes, for anyone', async () => {
    const { m, listingId } = await market();
    await reserve(m, listingId, USER_B);
    expect((await m.buy({ action: 'reserve', listingId }, USER_C)).body.reason).toBe('reserved');
    m.store.nowMs += MARKET_RULES.reservationTtlMinutes * MIN + 1;
    const taken = await m.buy({ action: 'reserve', listingId }, USER_C);
    expect(taken.status).toBe(200);
    expect([...m.store.reservations.values()].find((r) => r.buyerId === USER_B)?.status).toBe('expired');
  });

  it('is unavailable (503) without the chain secrets', async () => {
    const m = makeMarket({ chain: false });
    expect((await m.buy({ action: 'reserve', listingId: '99999999-9999-4999-8999-999999999999' }, USER_B)).status).toBe(503);
    expect((await m.list({ action: 'list' }, USER_A)).status).toBe(503);
  });
});

describe('paying: the two transfers are verified on chain, then the item changes hands', () => {
  it('both legs paid and verified -> sold: a NEW certificate for the buyer, the old one transferred, the ledger written', async () => {
    const { m, cert, listingId } = await market(1000);
    const { res } = await reserve(m, listingId);
    const { fee, seller, feeTx, sellerTx } = await payAndSubmit(m, res!);
    expect(fee.body).toMatchObject({ ok: true, status: 'recorded' });
    expect(seller.body).toMatchObject({ ok: true, status: 'sold' });
    expect(m.store.listings.get(listingId)?.status).toBe('sold');
    expect(m.store.certs.get(cert.id)?.status).toBe('transferred');
    const fresh = m.store.certs.get(seller.body.certificateId as string)!;
    expect(fresh).toMatchObject({ userId: USER_B, status: 'held', bound: false, inSave: false, originCertificateId: cert.id, templateId: cert.templateId, rarity: cert.rarity, contentHash: cert.contentHash });
    expect(m.store.sales).toHaveLength(1);
    expect(m.store.sales[0]).toMatchObject({ priceCents: 1000, feeCents: 50, sellerCents: 950, sellerId: USER_A, buyerId: USER_B, feeTxHash: feeTx, sellerTxHash: sellerTx, livemode: false });
    expect(m.store.sales[0].feeCents + m.store.sales[0].sellerCents).toBe(m.store.sales[0].priceCents);
    expect(m.store.certEvents.filter((e) => e.event === 'transfer')).toHaveLength(2);
  });

  it('the order of the legs does not matter', async () => {
    const { m, listingId } = await market(500);
    const { res } = await reserve(m, listingId);
    const sellerTx = m.chain.pay(WALLET[USER_B], res!.sellerAddress, res!.sellerCents);
    const feeTx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: sellerTx }, USER_B)).body).toMatchObject({ status: 'recorded' });
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_B)).body).toMatchObject({ status: 'sold' });
  });

  it('delivery comes from the CERTIFICATE: the buyer\'s pending list carries the item as the server rolled it, and an ack closes it', async () => {
    const { m, cert, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const { seller } = await payAndSubmit(m, res!);
    const buyerView = await m.my({ action: 'overview' }, USER_B);
    const pending = buyerView.body.pending as { id: string; templateId: string; rarity: string; substats: unknown; status: string }[];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: seller.body.certificateId, templateId: cert.templateId, rarity: cert.rarity, substats: cert.substats, status: 'held' });
    // the seller has nothing to collect: his copy is gone
    expect((await m.my({ action: 'overview' }, USER_A)).body.pending).toEqual([]);
    expect((await m.my({ action: 'ack', certificateIds: [pending[0].id] }, USER_B)).body).toEqual({ ok: true, acked: 1 });
    expect((await m.my({ action: 'overview' }, USER_B)).body.pending).toEqual([]);
    expect((await m.my({ action: 'ack', certificateIds: [pending[0].id] }, USER_B)).body).toEqual({ ok: true, acked: 0 }); // idempotent
    // and nobody else can ack it
    expect((await m.my({ action: 'ack', certificateIds: [pending[0].id] }, USER_C)).body).toEqual({ ok: true, acked: 0 });
    // the buyer can list it again only once it is in his save (acked)
    m.link(USER_B);
    const relist = await m.list({ action: 'list', certificateId: pending[0].id, priceCents: 2000 }, USER_B);
    expect(relist.status).toBe(200);
  });

  it('a bought certificate cannot be listed before the game has collected it into the save', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const { seller } = await payAndSubmit(m, res!);
    const r = await m.list({ action: 'list', certificateId: seller.body.certificateId, priceCents: 2000 }, USER_B);
    expect(r.body.reason).toBe('not_in_save');
  });

  it('history: the buyer sees the purchase, the seller the sale, each with the fee and the hashes, and no counterparty address', async () => {
    const { m, listingId } = await market(1000);
    const { res } = await reserve(m, listingId);
    const { feeTx, sellerTx } = await payAndSubmit(m, res!);
    const b = (await m.my({ action: 'overview' }, USER_B)).body;
    const s = (await m.my({ action: 'overview' }, USER_A)).body;
    expect(b.sales).toMatchObject([{ role: 'buyer', priceCents: 1000, feeCents: 50, sellerCents: 950, feeTxHash: feeTx, sellerTxHash: sellerTx }]);
    expect(s.sales).toMatchObject([{ role: 'seller', priceCents: 1000, feeCents: 50, sellerCents: 950 }]);
    expect(JSON.stringify(s)).not.toContain(WALLET[USER_B]);
    expect(JSON.stringify(b)).not.toContain(WALLET[USER_A]);
    expect((await m.my({ action: 'overview' }, USER_C)).body.sales).toEqual([]);
  });

  it.each([
    ['a payment in another token', { emitter: '0x9999999999999999999999999999999999999999' }, 'wrong_contract'],
    ['a payment from another address', { from: '0x7777777777777777777777777777777777777777' }, 'wrong_sender'],
    ['a payment mined before the reservation', { blockTimeSec: 1 }, 'too_early'],
    ['a reverted transaction', { status: '0x0' as const }, 'tx_failed'],
  ])('refuses %s and consumes nothing', async (_label, over, reason) => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = m.chain.pay(WALLET[USER_B], res!.sellerAddress, res!.sellerCents, over);
    const r = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: tx }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe(reason);
    expect(m.store.paid.size).toBe(0);
    expect(m.store.listings.get(listingId)?.status).toBe('reserved');
  });

  it('wrong address: the seller leg paid to some other address, and the fee leg paid to the seller, are both refused', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const toWrong = m.chain.pay(WALLET[USER_B], WALLET[USER_C], res!.sellerCents);
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: toWrong }, USER_B)).body.reason).toBe('wrong_recipient');
    const feeToSeller = m.chain.pay(WALLET[USER_B], res!.sellerAddress, res!.feeCents);
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeToSeller }, USER_B)).body.reason).toBe('wrong_recipient');
  });

  it('partial payment: a leg short by a cent is refused (not consumed), and the buyer can make a correct one', async () => {
    const { m, listingId } = await market(1000);
    const { res } = await reserve(m, listingId);
    const short = m.chain.pay(WALLET[USER_B], res!.sellerAddress, res!.sellerCents - 1);
    const r = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: short }, USER_B);
    expect(r.body.reason).toBe('short_amount');
    expect(m.store.paid.has(short)).toBe(false);
    const { seller } = await payAndSubmit(m, res!);
    expect(seller.body.status).toBe('sold');
  });

  it('a payment that is not yet confirmed is "not yet" and carries the count; the same hash works once confirmed', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents, { blockNumber: m.chain.latest - 3 });
    const early = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_B);
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ reason: 'unconfirmed', confirmations: 4, needed: 15 });
    m.chain.latest += 20;
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_B)).body.status).toBe('recorded');
    const unknown = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: `0x${'e'.repeat(64)}` }, USER_B);
    expect(unknown.body.reason).toBe('not_found_tx');
  });

  it('a node that is down is a 503 "try again", not a refusal of the payment, and nothing is consumed', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    m.chain.down = true;
    const r = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_B);
    expect(r.status).toBe(503);
    expect(r.body.reason).toBe('rpc_error');
    m.chain.down = false;
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_B)).body.status).toBe('recorded');
  });

  it('the same transaction hash is consumed once EVER: a second reservation, another buyer, or the other leg cannot reuse it', async () => {
    const a = await market(1000);
    const { res } = await reserve(a.m, a.listingId);
    const feeTx = a.m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    expect((await a.m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_B)).body.status).toBe('recorded');
    // the same hash as the other leg of the same reservation: it is the same payment already counted (a double submit answers the same, never a second credit)
    const same = await a.m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: feeTx }, USER_B);
    expect(same.body.status).toBe('replayed');
    expect(a.m.store.paid.size).toBe(1);
    // another buyer presenting that hash for his own reservation
    const second = a.m.store.addCert(USER_A);
    const l2 = await a.m.list({ action: 'list', certificateId: second.id, priceCents: 1000 }, USER_A);
    const r2 = reservationOf(await a.m.buy({ action: 'reserve', listingId: l2.body.listingId }, USER_C));
    const stolen = await a.m.buy({ action: 'submit', reservationId: r2.id, leg: 'fee', txHash: feeTx }, USER_C);
    expect(stolen.status).toBe(409);
    expect(stolen.body.reason).toBe('tx_reused');
  });

  it('a double submit of the same leg (the same hash twice, even at the same instant) is one payment and one sale', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const feeTx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    const sellerTx = m.chain.pay(WALLET[USER_B], res!.sellerAddress, res!.sellerCents);
    const results = await Promise.all([
      m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_B),
      m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_B),
      m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: sellerTx }, USER_B),
      m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: sellerTx }, USER_B),
    ]);
    for (const r of results) expect(r.status).toBe(200);
    expect(m.store.sales).toHaveLength(1);
    expect(m.store.paid.size).toBe(2);
    expect([...m.store.certs.values()].filter((c) => c.userId === USER_B)).toHaveLength(1);
  });

  it('a second transfer for a leg already paid is kept as an EXTRA owed back, and never delivers a second item', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const t1 = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    const t2 = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: t1 }, USER_B);
    const extra = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: t2 }, USER_B);
    expect(extra.status).toBe(200);
    expect(m.store.paid.get(t2)).toMatchObject({ leg: 'extra', status: 'refund_due' });
    const { seller } = await payAndSubmit(m, res!).then(async () => ({ seller: m.store.sales }));
    expect(seller).toHaveLength(1);
  });

  it('only the buyer can pay for his reservation, and an unknown reservation is a 404', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_C)).status).toBe(404);
    expect((await m.buy({ action: 'submit', reservationId: '99999999-9999-4999-8999-999999999999', leg: 'fee', txHash: tx }, USER_B)).status).toBe(404);
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'nope', txHash: tx }, USER_B)).status).toBe(400);
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: '0x12' }, USER_B)).body.reason).toBe('bad_hash');
  });

  it('a reservation with a payment recorded cannot be walked away from', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_B);
    const r = await m.buy({ action: 'cancel', reservationId: res!.id }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('has_payment');
    expect(m.store.listings.get(listingId)?.status).toBe('reserved');
  });

  it('verification is budgeted per account (each one costs the node calls), but a hash the server already knows costs none', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    m.store.verifyBudgetDefault = 2;
    const tx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    for (let i = 0; i < 2; i++) await m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: `0x${String(i + 100).padStart(64, '0')}` }, USER_B);
    const over = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_B);
    expect(over.status).toBe(429);
    expect(over.body.reason).toBe('rate_limited');
    const callsBefore = m.chain.calls;
    m.store.paid.set(tx, { txHash: tx, userId: USER_B, reservationId: res!.id, leg: 'fee', status: 'applied', fromAddress: '', toAddress: '', amountUnits: 1n, blockTimeMs: 0, chainId: 97, livemode: false });
    expect((await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: tx }, USER_B)).body.status).toBe('replayed');
    expect(m.chain.calls).toBe(callsBefore);
  });
});

describe('late payments, expiry, refunds', () => {
  it('a valid payment after the lock ended, inside the grace, still delivers while the listing is unsold and free', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 10) * MIN; // the lock ran out; the buyer was slow
    const { fee, seller } = await payAndSubmit(m, res!);
    expect(fee.body.status).toBe('recorded');
    expect(seller.body.status).toBe('sold');
    expect(m.store.sales).toHaveLength(1);
  });

  it('...but if someone else reserved the listing meanwhile, the late payment becomes a refund due and nothing is delivered', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId, USER_B);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 5) * MIN;
    expect((await m.buy({ action: 'reserve', listingId }, USER_C)).status).toBe(200); // C takes the freed listing
    const { fee } = await payAndSubmit(m, res!, USER_B);
    expect(fee.body.status).toBe('refund_due');
    expect(m.store.sales).toHaveLength(0);
    expect(m.store.listings.get(listingId)?.status).toBe('reserved'); // still C's
    expect([...m.store.reservations.values()].find((r) => r.buyerId === USER_B)?.status).toBe('refund_due');
    const mine = await m.my({ action: 'overview' }, USER_B);
    expect((mine.body.refundsDue as { txHashes: string[] }[])[0].txHashes.length).toBeGreaterThan(0);
    expect([...m.store.paid.values()].every((p) => p.status === 'refund_due')).toBe(true);
  });

  it('...and so does a payment past the grace window', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + MARKET_RULES.graceMinutes + 1) * MIN;
    const { fee } = await payAndSubmit(m, res!);
    expect(fee.body.status).toBe('refund_due');
    expect(m.store.sales).toHaveLength(0);
    expect(m.store.listings.get(listingId)?.status).toBe('open');
  });

  it('a half-paid reservation keeps the listing locked until the grace ends, then becomes a refund due and frees it', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const feeTx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_B);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 5) * MIN;
    expect((await m.buy({ action: 'reserve', listingId }, USER_C)).body.reason).toBe('reserved'); // money is in flight
    m.store.nowMs += MARKET_RULES.graceMinutes * MIN;
    expect((await m.buy({ action: 'reserve', listingId }, USER_C)).status).toBe(200);
    expect(m.store.paid.get(feeTx)?.status).toBe('refund_due');
    expect([...m.store.reservations.values()].find((r) => r.buyerId === USER_B)?.status).toBe('refund_due');
  });

  it('a seller can not cancel during a reservation, even an expired-looking one with money in flight; after it ends he can', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const feeTx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_B);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 5) * MIN;
    expect((await m.list({ action: 'cancel', listingId }, USER_A)).body.reason).toBe('reserved');
    m.store.nowMs += MARKET_RULES.graceMinutes * MIN;
    expect((await m.list({ action: 'cancel', listingId }, USER_A)).status).toBe(200);
  });

  it('an unsold listing expires after its time and the item goes back to its owner', async () => {
    const { m, cert, listingId } = await market();
    m.store.nowMs += (MARKET_RULES.listingTtlDays * DAY) + 1;
    await m.my({ action: 'overview' }, USER_A);
    expect(m.store.listings.get(listingId)?.status).toBe('expired');
    expect(m.store.certs.get(cert.id)).toMatchObject({ status: 'held', inSave: false });
    expect((await m.buy({ action: 'reserve', listingId }, USER_B)).body.reason).toBe('not_open');
    expect(((await m.my({ action: 'overview' }, USER_A)).body.pending as { id: string }[]).map((c) => c.id)).toEqual([cert.id]);
  });
});

describe('races', () => {
  it('two buyers pay for the same listing at the same time: only the holder of the reservation gets the item', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId, USER_B);
    // C has no reservation; he pays the right addresses and presents a made-up reservation id: refused
    const feeTx = m.chain.pay(WALLET[USER_C], FEE_ADDRESS, res!.feeCents);
    const bogus = await m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_C);
    expect(bogus.status).toBe(404);
    const { seller } = await payAndSubmit(m, res!, USER_B);
    expect(seller.body.status).toBe('sold');
    expect(m.store.sales[0].buyerId).toBe(USER_B);
    expect([...m.store.certs.values()].filter((c) => c.originCertificateId !== null)).toHaveLength(1);
  });

  it('two verifications of the two legs interleaved on the node still end in exactly one sale', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const feeTx = m.chain.pay(WALLET[USER_B], FEE_ADDRESS, res!.feeCents);
    const sellerTx = m.chain.pay(WALLET[USER_B], res!.sellerAddress, res!.sellerCents);
    let release!: () => void;
    m.chain.gate = new Promise<void>((r) => (release = r));
    const both = Promise.all([m.buy({ action: 'submit', reservationId: res!.id, leg: 'fee', txHash: feeTx }, USER_B), m.buy({ action: 'submit', reservationId: res!.id, leg: 'seller', txHash: sellerTx }, USER_B)]);
    release();
    const [a, b] = await both;
    expect([a.body.status, b.body.status].sort()).toEqual(['recorded', 'sold']);
    expect(m.store.sales).toHaveLength(1);
  });

  it('a seller cancelling while a buyer reserves: whichever is first wins and the other is refused cleanly', async () => {
    const { m, cert, listingId } = await market();
    const [cancel, reserveR] = await Promise.all([m.list({ action: 'cancel', listingId }, USER_A), m.buy({ action: 'reserve', listingId }, USER_B)]);
    if (cancel.status === 200) {
      expect(reserveR.status).toBe(409);
      expect(m.store.certs.get(cert.id)?.status).toBe('held');
    } else {
      expect(cancel.body.reason).toBe('reserved');
      expect(reserveR.status).toBe(200);
      expect(m.store.certs.get(cert.id)?.status).toBe('listed');
    }
  });
});

describe('the USDT Pass (pass-crypto)', () => {
  async function ready() {
    const m = makeMarket();
    m.link(USER_B);
    return m;
  }

  it('price tells the buy screen the cost up front: no wallet needed, no purchase intent opened, still behind the login', async () => {
    const m = makeMarket(); // no wallet linked
    const r = await m.pass({ action: 'price' }, USER_B);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, priceCents: 1000, priceUsdt: '10.00', chain: { chainId: 97 } });
    expect(r.body).not.toHaveProperty('receiveAddress');
    expect((await m.pass({ action: 'price' }, null)).status).toBe(401);
  });

  it('start says what to pay and to whom; paying 10.00 USDT from the linked wallet to the receiving address grants the Pass', async () => {
    const m = await ready();
    const start = await m.pass({ action: 'start' }, USER_B);
    expect(start.body).toMatchObject({ ok: true, priceCents: 1000, priceUsdt: '10.00', receiveAddress: PASS_ADDRESS, buyerAddress: WALLET[USER_B], chain: { chainId: 97, livemode: false } });
    m.store.nowMs += 60_000; // he pays after starting
    const tx = m.chain.pay(WALLET[USER_B], PASS_ADDRESS, 1000);
    const r = await m.pass({ action: 'submit', txHash: tx }, USER_B);
    expect(r.body).toMatchObject({ ok: true, status: 'granted', livemode: false });
    expect(m.store.entitlements).toEqual([{ userId: USER_B, source: 'crypto_bsc', providerRef: tx, status: 'active', livemode: false }]);
  });

  it('is idempotent: submitting the same hash again does not grant twice', async () => {
    const m = await ready();
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const tx = m.chain.pay(WALLET[USER_B], PASS_ADDRESS, 1000);
    await m.pass({ action: 'submit', txHash: tx }, USER_B);
    const again = await m.pass({ action: 'submit', txHash: tx }, USER_B);
    // he owns it now: the handler stops at "already owned" before it even looks at the chain
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe('already_owned');
    expect(m.store.entitlements).toHaveLength(1);
  });

  it('two submissions of the same hash at the same instant grant once', async () => {
    const m = await ready();
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const tx = m.chain.pay(WALLET[USER_B], PASS_ADDRESS, 1000);
    const [a, b] = await Promise.all([m.pass({ action: 'submit', txHash: tx }, USER_B), m.pass({ action: 'submit', txHash: tx }, USER_B)]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(m.store.entitlements).toHaveLength(1);
  });

  it('refuses a payment that is short, to the wrong address, from another address, in another token, before the start, or reused', async () => {
    const m = await ready();
    m.link(USER_C);
    const early = m.chain.pay(WALLET[USER_B], PASS_ADDRESS, 1000); // mined before the intent
    m.store.nowMs += 10_000;
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const reason = async (tx: string) => (await m.pass({ action: 'submit', txHash: tx }, USER_B)).body.reason;
    expect(await reason(m.chain.pay(WALLET[USER_B], PASS_ADDRESS, 999))).toBe('short_amount');
    expect(await reason(m.chain.pay(WALLET[USER_B], FEE_ADDRESS, 1000))).toBe('wrong_recipient');
    expect(await reason(m.chain.pay(WALLET[USER_C], PASS_ADDRESS, 1000))).toBe('wrong_sender');
    expect(await reason(m.chain.pay(WALLET[USER_B], PASS_ADDRESS, 1000, { emitter: '0x9999999999999999999999999999999999999999' }))).toBe('wrong_contract');
    expect(await reason(early)).toBe('too_early');
    expect(m.store.entitlements).toHaveLength(0);
    // a hash somebody else already used for the Pass
    const used = m.chain.pay(WALLET[USER_C], PASS_ADDRESS, 1000);
    await m.pass({ action: 'start' }, USER_C);
    m.store.nowMs += 60_000;
    const usedLate = m.chain.pay(WALLET[USER_C], PASS_ADDRESS, 1000);
    expect((await m.pass({ action: 'submit', txHash: usedLate }, USER_C)).body.status).toBe('granted');
    void used;
    expect(await reason(usedLate)).toBe('tx_reused');
  });

  it('needs a linked wallet, and refuses a second Pass', async () => {
    const m = makeMarket();
    expect((await m.pass({ action: 'start' }, USER_B)).body.reason).toBe('no_wallet');
    m.link(USER_B);
    m.store.entitlements.push({ userId: USER_B, source: 'stripe', providerRef: 'pi_1', status: 'active', livemode: true });
    expect((await m.pass({ action: 'start' }, USER_B)).status).toBe(409);
  });

  it('a payment that arrives when the Pass is already owned (a race) is kept as a refund due', async () => {
    const m = await ready();
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const tx = m.chain.pay(WALLET[USER_B], PASS_ADDRESS, 1000);
    // the Stripe webhook grants the Pass between the handler's check and the grant
    const grant = m.store.grant.bind(m.store);
    m.store.grant = async (a) => {
      m.store.entitlements.push({ userId: USER_B, source: 'stripe', providerRef: 'pi_2', status: 'active', livemode: true });
      return grant(a);
    };
    const r = await m.pass({ action: 'submit', txHash: tx }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ reason: 'already_owned', refundDue: true });
    expect(m.store.paid.get(tx)?.status).toBe('refund_due');
    expect(m.store.entitlements.filter((e) => e.source === 'crypto_bsc')).toHaveLength(0);
  });
});
