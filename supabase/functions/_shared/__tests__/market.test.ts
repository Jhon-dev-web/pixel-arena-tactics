import { describe, expect, it } from 'vitest';
import { associatedTokenAddress } from '../chain/ata.ts';
import { encodeBase58 } from '../chain/base58.ts';
import { MARKET_MAX_PRICE_LAMPORTS, MARKET_MIN_PRICE_LAMPORTS, splitLamports } from '../chain/solMoney.ts';
import { MARKET_RULES } from '../market/rules.ts';
import { DAY, MIN } from './fakeMarketStore.ts';
import { FEE_ADDRESS, PASS_ADDRESS, CONFIG, USER_A, USER_B, USER_C, USER_D, WALLET, makeMarket, throwawayWallet } from './marketHarness.ts';
import { addr, sig } from './solanaFixtures.ts';

// The market handlers over an in-memory store that follows migrations 0011 / 0012 / 0013 and a fake Solana node. No Deno, no Supabase, no network, no wallet.

const SOL = 1_000_000_000;
type M = ReturnType<typeof makeMarket>;
interface Res {
  id: string;
  priceLamports: number;
  feeLamports: number;
  sellerLamports: number;
  sellerAddress: string;
  feeAddress: string;
  status: string;
  payments: { leg: string; status: string }[];
}
const reservationOf = (r: { body: Record<string, unknown> }) => r.body.reservation as Res;

/** Seller A lists a fresh certificate for `price` lamports; buyers B, C, D have wallets too. */
async function market(price = SOL) {
  const m = makeMarket();
  for (const u of [USER_A, USER_B, USER_C, USER_D]) m.link(u);
  const cert = m.store.addCert(USER_A);
  const listed = await m.list({ action: 'list', certificateId: cert.id, priceLamports: price }, USER_A);
  expect(listed.status).toBe(200);
  return { m, cert, listingId: listed.body.listingId as string };
}

async function reserve(m: M, listingId: string, buyer = USER_B) {
  const r = await m.buy({ action: 'reserve', listingId }, buyer);
  return { ...r, res: r.body.ok ? reservationOf(r) : null };
}

/** The buyer's wallet signs ONE transaction with the two transfers (the seller's share and the game's fee). */
function payTx(m: M, res: Res, buyer = USER_B, over: Parameters<M['chain']['sale']>[2] = {}) {
  return m.chain.sale(WALLET[buyer], [{ to: res.sellerAddress, lamports: res.sellerLamports }, { to: FEE_ADDRESS, lamports: res.feeLamports }], over);
}

const submit = (m: M, res: Res, signature: string, buyer = USER_B) => m.buy({ action: 'submit', reservationId: res.id, signature }, buyer);

async function payAndSubmit(m: M, res: Res, buyer = USER_B) {
  const signature = payTx(m, res, buyer);
  const r = await submit(m, res, signature, buyer);
  return { r, signature };
}

describe('wallet ownership through market-wallet', () => {
  async function link(m: M, userId: string, w = throwawayWallet(), address = w.address) {
    const n = await m.wallet({ action: 'nonce', address }, userId);
    expect(n.status).toBe(200);
    return { w, n: n.body as { nonce: string; message: string } };
  }

  it('links an address after a valid ed25519 signature of the message the SERVER wrote', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    expect(n.message).toContain(`Account: ${USER_A}`);
    expect(n.message).toContain(`Address: ${w.address}`);
    expect(n.message).toContain('Network: Solana devnet');
    const r = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature: w.sign(n.message) }, USER_A);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 'linked', wallet: { address: w.address, chainId: 502 } });
    expect((await m.store.wallet(USER_A))?.address).toBe(w.address);
    const status = await m.wallet({ action: 'status' }, USER_A);
    expect(status.body).toMatchObject({ enabled: true, wallet: { address: w.address }, chain: { network: 'solana', cluster: 'devnet', chainId: 502, usdcMint: CONFIG.usdcMint, livemode: false, feePercent: 5 } });
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

  it('refuses a signature of a different text (the same key signed something else)', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    const r = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature: w.sign(`${n.message}\nand also send me everything`) }, USER_A);
    expect(r.body).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('a nonce works ONCE: replaying the same signature is refused, and a failed signature burns the nonce', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    const signature = w.sign(n.message);
    expect((await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature }, USER_A)).status).toBe(200);
    const replay = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature }, USER_A);
    expect(replay.body).toEqual({ ok: false, reason: 'nonce_invalid' });

    const m2 = makeMarket();
    const { w: w2, n: n2 } = await link(m2, USER_A);
    await m2.wallet({ action: 'link', address: w2.address, nonce: n2.nonce, signature: encodeBase58(new Uint8Array(64).fill(1)) }, USER_A);
    const again = await m2.wallet({ action: 'link', address: w2.address, nonce: n2.nonce, signature: w2.sign(n2.message) }, USER_A);
    expect(again.body).toEqual({ ok: false, reason: 'nonce_invalid' });
  });

  it('a signature cannot be carried to another account, and a nonce of another account is refused', async () => {
    const m = makeMarket();
    const { w, n } = await link(m, USER_A);
    const signature = w.sign(n.message);
    const stolen = await m.wallet({ action: 'link', address: w.address, nonce: n.nonce, signature }, USER_B);
    expect(stolen.body).toEqual({ ok: false, reason: 'nonce_invalid' });
    const own = await m.wallet({ action: 'nonce', address: w.address }, USER_B);
    const r = await m.wallet({ action: 'link', address: w.address, nonce: (own.body as { nonce: string }).nonce, signature }, USER_B);
    expect(r.body).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('only a Solana address can be linked: a 0x address, a short string and garbage are refused before any nonce is spent', async () => {
    const m = makeMarket();
    for (const bad of ['0x' + 'a'.repeat(40), 'abc', '', 'not base58 !!', encodeBase58(new Uint8Array(31).fill(3)), 5, null]) {
      const r = await m.wallet({ action: 'nonce', address: bad }, USER_A);
      expect(r.status, String(bad)).toBe(400);
      expect(r.body.reason).toBe('bad_address');
    }
    expect(m.store.nonces).toHaveLength(0);
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
    await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL }, USER_A);
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
    expect((await m.buy({ action: 'prepare' }, null)).status).toBe(401);
    expect((await m.my({ action: 'overview' }, null)).status).toBe(401);
    expect((await m.pass({ action: 'start' }, null)).status).toBe(401);
    m.link(USER_A);
    const cert = m.store.addCert(USER_A);
    const r = await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL, userId: USER_B, user_id: USER_B }, USER_A);
    expect(r.status).toBe(200);
    expect([...m.store.listings.values()][0].sellerId).toBe(USER_A);
  });
});

describe('listing rules', () => {
  it('lists a held, unbound, in-save certificate: it goes to "listed", leaves the save, and shows up in my listings', async () => {
    const m = makeMarket();
    m.link(USER_A);
    const cert = m.store.addCert(USER_A);
    const r = await m.list({ action: 'list', certificateId: cert.id, priceLamports: 1_999_000_000 }, USER_A);
    expect(r.status).toBe(200);
    expect(m.store.certs.get(cert.id)).toMatchObject({ status: 'listed', inSave: false });
    const mine = await m.my({ action: 'overview' }, USER_A);
    expect(mine.body.listings).toMatchObject([{ id: r.body.listingId, priceLamports: 1_999_000_000, status: 'open', certificateId: cert.id }]);
  });

  it('refuses everything that is not a live, unbound, held certificate of the caller', async () => {
    const m = makeMarket();
    m.link(USER_A);
    const list = async (id: string, price = SOL, user = USER_A) => (await m.list({ action: 'list', certificateId: id, priceLamports: price }, user)).body.reason;
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
    const again = await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL }, USER_A);
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe('already_listed');
    expect([...m.store.listings.values()]).toHaveLength(1);
  });

  it('needs a linked wallet and an unflagged account', async () => {
    const m = makeMarket();
    const cert = m.store.addCert(USER_A);
    expect((await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL }, USER_A)).body.reason).toBe('no_wallet');
    m.link(USER_A);
    m.store.flagged.add(USER_A);
    const r = await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL }, USER_A);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe('flagged');
  });

  it('the price is a whole number of 0.001 SOL steps between 0.001 SOL and the cap', async () => {
    const m = makeMarket();
    m.link(USER_A);
    const cert = m.store.addCert(USER_A);
    for (const bad of [MARKET_MIN_PRICE_LAMPORTS - 1_000_000, 999_999, 1_000_001, MARKET_MAX_PRICE_LAMPORTS + 1_000_000, 10.5, -5, 0, '1000000', null]) {
      const r = await m.list({ action: 'list', certificateId: cert.id, priceLamports: bad }, USER_A);
      expect(r.status, String(bad)).toBe(400);
    }
    // the old field name is not a price any more
    expect((await m.list({ action: 'list', certificateId: cert.id, priceCents: 1000 }, USER_A)).status).toBe(400);
    expect((await m.list({ action: 'list', certificateId: cert.id, priceLamports: MARKET_MIN_PRICE_LAMPORTS }, USER_A)).status).toBe(200);
  });

  it('the cap is a rule in rules.ts (tunable), not a magic number of the handler', () => {
    expect(MARKET_RULES.maxPriceLamports).toBe(MARKET_MAX_PRICE_LAMPORTS);
    expect(MARKET_RULES.minPriceLamports).toBe(1_000_000);
    expect(MARKET_MAX_PRICE_LAMPORTS).toBeLessThanOrEqual(1000 * SOL);
  });

  it('limits live listings and listings per day', async () => {
    const m = makeMarket();
    m.link(USER_A);
    for (let i = 0; i < MARKET_RULES.maxActiveListings; i++) expect((await m.list({ action: 'list', certificateId: m.store.addCert(USER_A).id, priceLamports: SOL / 10 }, USER_A)).status).toBe(200);
    const over = await m.list({ action: 'list', certificateId: m.store.addCert(USER_A).id, priceLamports: SOL / 10 }, USER_A);
    expect(over.status).toBe(429);
    expect(over.body.reason).toBe('limit_active');
  });

  it('cancelling returns the certificate to its owner (held, waiting to be collected), never while a buyer holds it', async () => {
    const { m, listingId } = await market();
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
    expect((await b.m.list({ action: 'cancel', listingId: b.listingId }, USER_B)).status).toBe(404);
    expect((await b.m.list({ action: 'cancel', listingId: b.listingId }, USER_A)).status).toBe(409); // already cancelled
  });

  it('there is no way to change the price of a live listing: only cancel and list again', async () => {
    const { m, listingId } = await market();
    const edit = await m.list({ action: 'update', listingId, priceLamports: MARKET_MIN_PRICE_LAMPORTS }, USER_A);
    expect(edit.status).toBe(400);
    expect(m.store.listings.get(listingId)?.priceLamports).toBe(SOL);
  });
});

describe('reserving', () => {
  it('locks the listing for 30 minutes with the split the buyer will see: 95% to the seller and 5% (rounded up) to the game, summing exactly', async () => {
    for (const price of [1_000_000, 1_234_000_000, SOL, 12_345_000_000]) {
      const { m, listingId } = await market(price);
      const { res, status } = await reserve(m, listingId);
      expect(status).toBe(200);
      const split = splitLamports(price);
      expect(res).toMatchObject({ priceLamports: price, feeLamports: split.feeLamports, sellerLamports: split.sellerLamports, sellerAddress: WALLET[USER_A], feeAddress: FEE_ADDRESS, status: 'pending' });
      expect((res?.feeLamports ?? 0) + (res?.sellerLamports ?? 0)).toBe(price);
      expect(m.store.listings.get(listingId)?.status).toBe('reserved');
    }
  });

  it('the seller address is shown to the reserving buyer only; the overview of other players never carries an address', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    expect(res?.sellerAddress).toBe(WALLET[USER_A]);
    const others = JSON.stringify([(await m.my({ action: 'overview' }, USER_C)).body, (await m.my({ action: 'overview' }, USER_D)).body]);
    expect(others).not.toContain(WALLET[USER_A]);
    expect(others).not.toContain(WALLET[USER_B]);
    const sellerView = JSON.stringify((await m.my({ action: 'overview' }, USER_A)).body.listings);
    expect(sellerView).not.toContain(WALLET[USER_B]);
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
    const l2 = await m.list({ action: 'list', certificateId: second.id, priceLamports: SOL / 2 }, USER_A);
    const first = await reserve(m, listingId);
    const again = await m.buy({ action: 'reserve', listingId: l2.body.listingId }, USER_B);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ reason: 'reservation_exists', reservationId: first.res?.id });
    expect((await m.buy({ action: 'cancel', reservationId: first.res?.id }, USER_B)).status).toBe(200);
    expect((await m.buy({ action: 'reserve', listingId: l2.body.listingId }, USER_B)).status).toBe(200);
  });

  it('refuses the seller, a buyer without a wallet, an unknown listing, and a listing that is not open', async () => {
    const { m, listingId } = await market();
    expect((await m.buy({ action: 'reserve', listingId }, USER_A)).body.reason).toBe('own_listing');
    const noWallet = makeMarket();
    const c = noWallet.store.addCert(USER_A);
    noWallet.link(USER_A);
    const l = await noWallet.list({ action: 'list', certificateId: c.id, priceLamports: SOL }, USER_A);
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
      ids.push((await m.list({ action: 'list', certificateId: c.id, priceLamports: SOL / 10 }, USER_A)).body.listingId as string);
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

describe('paying: ONE transaction with both transfers is verified on chain, then the item changes hands', () => {
  it('paid and verified -> sold: a NEW certificate for the buyer, the old one transferred, the ledger written with the one signature', async () => {
    const { m, cert, listingId } = await market(SOL);
    const { res } = await reserve(m, listingId);
    const { r, signature } = await payAndSubmit(m, res!);
    expect(r.body).toMatchObject({ ok: true, status: 'sold' });
    expect(m.store.listings.get(listingId)?.status).toBe('sold');
    expect(m.store.certs.get(cert.id)?.status).toBe('transferred');
    const fresh = m.store.certs.get(r.body.certificateId as string)!;
    expect(fresh).toMatchObject({ userId: USER_B, status: 'held', bound: false, inSave: false, originCertificateId: cert.id, templateId: cert.templateId, rarity: cert.rarity, contentHash: cert.contentHash });
    expect(m.store.sales).toHaveLength(1);
    expect(m.store.sales[0]).toMatchObject({ priceLamports: SOL, feeLamports: 50_000_000, sellerLamports: 950_000_000, sellerId: USER_A, buyerId: USER_B, signature, livemode: false });
    expect(m.store.sales[0].feeLamports + m.store.sales[0].sellerLamports).toBe(m.store.sales[0].priceLamports);
    expect(m.store.certEvents.filter((e) => e.event === 'transfer')).toHaveLength(2);
    expect(m.store.paid.get(signature)).toMatchObject({ leg: 'sale', status: 'applied', livemode: false });
    expect(r.body.reservation).toMatchObject({ status: 'paid', payments: [{ leg: 'sale', signature, status: 'applied' }] });
  });

  it('delivery comes from the CERTIFICATE: the buyer\'s pending list carries the item as the server rolled it, and an ack closes it', async () => {
    const { m, cert, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const { r } = await payAndSubmit(m, res!);
    const buyerView = await m.my({ action: 'overview' }, USER_B);
    const pending = buyerView.body.pending as { id: string; templateId: string; rarity: string; substats: unknown; status: string }[];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: r.body.certificateId, templateId: cert.templateId, rarity: cert.rarity, substats: cert.substats, status: 'held' });
    expect((await m.my({ action: 'overview' }, USER_A)).body.pending).toEqual([]);
    expect((await m.my({ action: 'ack', certificateIds: [pending[0].id] }, USER_B)).body).toEqual({ ok: true, acked: 1 });
    expect((await m.my({ action: 'overview' }, USER_B)).body.pending).toEqual([]);
    expect((await m.my({ action: 'ack', certificateIds: [pending[0].id] }, USER_B)).body).toEqual({ ok: true, acked: 0 }); // idempotent
    expect((await m.my({ action: 'ack', certificateIds: [pending[0].id] }, USER_C)).body).toEqual({ ok: true, acked: 0 });
    m.link(USER_B);
    const relist = await m.list({ action: 'list', certificateId: pending[0].id, priceLamports: 2 * SOL }, USER_B);
    expect(relist.status).toBe(200);
  });

  it('a bought certificate cannot be listed before the game has collected it into the save', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const { r } = await payAndSubmit(m, res!);
    const again = await m.list({ action: 'list', certificateId: r.body.certificateId, priceLamports: 2 * SOL }, USER_B);
    expect(again.body.reason).toBe('not_in_save');
  });

  it('history: the buyer sees the purchase, the seller the sale, each with the fee and the signature, and no counterparty address', async () => {
    const { m, listingId } = await market(SOL);
    const { res } = await reserve(m, listingId);
    const { signature } = await payAndSubmit(m, res!);
    const b = (await m.my({ action: 'overview' }, USER_B)).body;
    const s = (await m.my({ action: 'overview' }, USER_A)).body;
    expect(b.sales).toMatchObject([{ role: 'buyer', priceLamports: SOL, feeLamports: 50_000_000, sellerLamports: 950_000_000, signature }]);
    expect(s.sales).toMatchObject([{ role: 'seller', priceLamports: SOL, feeLamports: 50_000_000, sellerLamports: 950_000_000 }]);
    expect(JSON.stringify(s)).not.toContain(WALLET[USER_B]);
    expect(JSON.stringify(b)).not.toContain(WALLET[USER_A]);
    expect((await m.my({ action: 'overview' }, USER_C)).body.sales).toEqual([]);
  });

  it.each([
    ['a payment from another wallet', { sender: addr(70) }, 'wrong_sender'],
    ['a payment mined before the reservation', { blockTime: 1 }, 'too_early'],
    ['a transaction that failed', { err: { InstructionError: [0, 'Custom'] } }, 'tx_failed'],
  ])('refuses %s and consumes nothing', async (_label, over, reason) => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const { sender, ...rest } = over as { sender?: string; blockTime?: number; err?: unknown };
    const tx = m.chain.sale(sender ?? WALLET[USER_B], [{ to: res!.sellerAddress, lamports: res!.sellerLamports }, { to: FEE_ADDRESS, lamports: res!.feeLamports }], rest);
    const r = await submit(m, res!, tx);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe(reason);
    expect(m.store.paid.size).toBe(0);
    expect(m.store.listings.get(listingId)?.status).toBe('reserved');
  });

  it('wrong recipient: the seller share paid to some other address, or the game fee missing, is refused', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const toWrong = m.chain.sale(WALLET[USER_B], [{ to: WALLET[USER_C], lamports: res!.sellerLamports }, { to: FEE_ADDRESS, lamports: res!.feeLamports }]);
    expect((await submit(m, res!, toWrong)).body.reason).toBe('wrong_recipient');
    const noFee = m.chain.sale(WALLET[USER_B], [{ to: res!.sellerAddress, lamports: res!.priceLamports }]);
    expect((await submit(m, res!, noFee)).body.reason).toBe('wrong_recipient');
    expect(m.store.paid.size).toBe(0);
  });

  it('short amount: a lamport short to the seller or to the game is refused (not consumed), and the buyer can make a correct one', async () => {
    const { m, listingId } = await market(SOL);
    const { res } = await reserve(m, listingId);
    const shortSeller = m.chain.sale(WALLET[USER_B], [{ to: res!.sellerAddress, lamports: res!.sellerLamports - 1 }, { to: FEE_ADDRESS, lamports: res!.feeLamports }]);
    const shortFee = m.chain.sale(WALLET[USER_B], [{ to: res!.sellerAddress, lamports: res!.sellerLamports }, { to: FEE_ADDRESS, lamports: res!.feeLamports - 1 }]);
    expect((await submit(m, res!, shortSeller)).body.reason).toBe('short_amount');
    expect((await submit(m, res!, shortFee)).body.reason).toBe('short_amount');
    expect(m.store.paid.has(shortSeller)).toBe(false);
    const { r } = await payAndSubmit(m, res!);
    expect(r.body.status).toBe('sold');
  });

  it('a payment more generous than needed is accepted', async () => {
    const { m, listingId } = await market(SOL);
    const { res } = await reserve(m, listingId);
    const tx = m.chain.sale(WALLET[USER_B], [{ to: res!.sellerAddress, lamports: res!.sellerLamports + 5 }, { to: FEE_ADDRESS, lamports: res!.feeLamports + 5 }]);
    expect((await submit(m, res!, tx)).body.status).toBe('sold');
    expect(m.store.sales[0].priceLamports).toBe(SOL);
  });

  it('a payment that is not finalized yet is "not yet"; the same signature works once the cluster finalizes it', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = payTx(m, res!);
    m.chain.held.add(tx);
    const early = await submit(m, res!, tx);
    expect(early.status).toBe(409);
    expect(early.body.reason).toBe('unconfirmed');
    expect(m.store.paid.size).toBe(0);
    m.chain.held.delete(tx);
    expect((await submit(m, res!, tx)).body.status).toBe('sold');
    const unknown = await m.buy({ action: 'submit', reservationId: res!.id, signature: sig(250) }, USER_B);
    expect(unknown.body.reason).toBe('not_found_tx');
  });

  it('a node that is down is a 503 "try again", not a refusal of the payment, and nothing is consumed', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = payTx(m, res!);
    m.chain.down = true;
    const r = await submit(m, res!, tx);
    expect(r.status).toBe(503);
    expect(r.body.reason).toBe('rpc_error');
    m.chain.down = false;
    expect((await submit(m, res!, tx)).body.status).toBe('sold');
  });

  it('a node on the wrong cluster is refused (503), never trusted', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = payTx(m, res!);
    m.chain.genesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'; // mainnet-beta answering for a devnet configuration
    const r = await submit(m, res!, tx);
    expect(r.status).toBe(503);
    expect(r.body.reason).toBe('wrong_network');
    expect(m.store.paid.size).toBe(0);
  });

  it('the same signature is consumed once EVER: a replay on the same reservation answers the same, another reservation or buyer is refused', async () => {
    const a = await market(SOL);
    const { res } = await reserve(a.m, a.listingId);
    const { signature } = await payAndSubmit(a.m, res!);
    const same = await submit(a.m, res!, signature);
    expect(same.body.status).toBe('replayed');
    expect(a.m.store.paid.size).toBe(1);
    expect(a.m.store.sales).toHaveLength(1);
    const second = a.m.store.addCert(USER_A);
    const l2 = await a.m.list({ action: 'list', certificateId: second.id, priceLamports: SOL }, USER_A);
    const r2 = reservationOf(await a.m.buy({ action: 'reserve', listingId: l2.body.listingId }, USER_C));
    const stolen = await submit(a.m, r2, signature, USER_C);
    expect(stolen.status).toBe(409);
    expect(stolen.body.reason).toBe('tx_reused');
  });

  it('a double submit of the same signature, even at the same instant, is one payment and one sale', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = payTx(m, res!);
    const results = await Promise.all([submit(m, res!, tx), submit(m, res!, tx), submit(m, res!, tx)]);
    for (const r of results) expect(r.status).toBe(200);
    expect(results.map((r) => r.body.status).sort()).toEqual(['replayed', 'replayed', 'sold']);
    expect(m.store.sales).toHaveLength(1);
    expect(m.store.paid.size).toBe(1);
    expect([...m.store.certs.values()].filter((c) => c.userId === USER_B)).toHaveLength(1);
  });

  it('a second transaction for a reservation already paid is kept as an EXTRA owed back, and never delivers a second item', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const { signature: t1 } = await payAndSubmit(m, res!);
    const t2 = payTx(m, res!);
    const extra = await submit(m, res!, t2);
    expect(extra.status).toBe(200);
    expect(extra.body.status).toBe('already_sold');
    expect(m.store.paid.get(t1)).toMatchObject({ leg: 'sale', status: 'applied' });
    expect(m.store.paid.get(t2)).toMatchObject({ leg: 'extra', status: 'refund_due' });
    expect(m.store.sales).toHaveLength(1);
  });

  it('only the buyer can pay for his reservation; unknown reservations, malformed ids and malformed signatures are refused', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = payTx(m, res!);
    expect((await submit(m, res!, tx, USER_C)).status).toBe(404);
    expect((await m.buy({ action: 'submit', reservationId: '99999999-9999-4999-8999-999999999999', signature: tx }, USER_B)).status).toBe(404);
    expect((await m.buy({ action: 'submit', reservationId: 'nope', signature: tx }, USER_B)).status).toBe(400);
    for (const bad of ['0x12', '', 'abc', addr(1), 5, null, '0x' + '1'.repeat(64)]) {
      const r = await m.buy({ action: 'submit', reservationId: res!.id, signature: bad }, USER_B);
      expect(r.status, String(bad)).toBe(400);
      expect(r.body.reason).toBe('bad_signature');
    }
    expect(m.store.paid.size).toBe(0);
  });

  it('a reservation that is paid cannot be walked away from', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    await payAndSubmit(m, res!);
    const r = await m.buy({ action: 'cancel', reservationId: res!.id }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('not_pending');
    expect(m.store.listings.get(listingId)?.status).toBe('sold');
  });

  it('verification is budgeted per account (each one costs the node calls), but a signature the server already knows costs none', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    m.store.verifyBudgetDefault = 2;
    const tx = payTx(m, res!);
    for (let i = 0; i < 2; i++) await m.buy({ action: 'submit', reservationId: res!.id, signature: sig(100 + i) }, USER_B);
    const over = await submit(m, res!, tx);
    expect(over.status).toBe(429);
    expect(over.body.reason).toBe('rate_limited');
    const callsBefore = m.chain.calls;
    m.store.paid.set(tx, { txHash: tx, userId: USER_B, reservationId: res!.id, leg: 'sale', status: 'applied', fromAddress: '', toAddress: '', amountUnits: 1n, blockTimeMs: 0, chainId: 502, livemode: false });
    expect((await submit(m, res!, tx)).body.status).toBe('replayed');
    expect(m.chain.calls).toBe(callsBefore);
  });

  it('prepare hands the wallet a recent blockhash for THIS pending reservation only, and costs the same budget', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const r = await m.buy({ action: 'prepare', reservationId: res!.id }, USER_B);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, blockhash: addr(5), lastValidBlockHeight: 400_000_000 });
    expect((await m.buy({ action: 'prepare', reservationId: res!.id }, USER_C)).status).toBe(404);
    expect((await m.buy({ action: 'prepare', reservationId: 'x' }, USER_B)).status).toBe(400);
    m.chain.down = true;
    expect((await m.buy({ action: 'prepare', reservationId: res!.id }, USER_B)).status).toBe(503);
    m.chain.down = false;
    m.store.verifyBudgetLeft.set(USER_B, 0);
    expect((await m.buy({ action: 'prepare', reservationId: res!.id }, USER_B)).status).toBe(429);
  });

  it('prepare is refused once the reservation is no longer pending', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    await payAndSubmit(m, res!);
    const r = await m.buy({ action: 'prepare', reservationId: res!.id }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('not_open');
  });
});

describe('late payments, expiry, refunds', () => {
  it('a valid payment after the lock ended, inside the grace, still delivers while the listing is unsold and free', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 10) * MIN; // the lock ran out; the buyer was slow
    // (the transaction was made after the reservation, then verified late)
    const { r } = await payAndSubmit(m, res!);
    expect(r.body.status).toBe('sold');
    expect(m.store.sales).toHaveLength(1);
  });

  it('...but if someone else reserved the listing meanwhile, the late payment becomes a refund due and nothing is delivered', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId, USER_B);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 5) * MIN;
    expect((await m.buy({ action: 'reserve', listingId }, USER_C)).status).toBe(200); // C takes the freed listing
    const { r } = await payAndSubmit(m, res!, USER_B);
    expect(r.body.status).toBe('refund_due');
    expect(m.store.sales).toHaveLength(0);
    expect(m.store.listings.get(listingId)?.status).toBe('reserved'); // still C's
    expect([...m.store.reservations.values()].find((x) => x.buyerId === USER_B)?.status).toBe('refund_due');
    const mine = await m.my({ action: 'overview' }, USER_B);
    expect((mine.body.refundsDue as { signatures: string[] }[])[0].signatures.length).toBeGreaterThan(0);
    expect([...m.store.paid.values()].every((p) => p.status === 'refund_due')).toBe(true);
  });

  it('...and so does a payment past the grace window', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + MARKET_RULES.graceMinutes + 1) * MIN;
    const { r } = await payAndSubmit(m, res!);
    expect(r.body.status).toBe('refund_due');
    expect(m.store.sales).toHaveLength(0);
    expect(m.store.listings.get(listingId)?.status).toBe('open');
  });

  it('an unpaid reservation owes nothing: the listing simply reopens after 30 minutes', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 5) * MIN;
    expect((await m.buy({ action: 'reserve', listingId }, USER_C)).status).toBe(200);
    expect(m.store.reservations.get(res!.id)?.status).toBe('expired');
    expect(m.store.paid.size).toBe(0);
  });

  it('a seller can not cancel during a reservation; after it expires unpaid he can', async () => {
    const { m, listingId } = await market();
    await reserve(m, listingId);
    expect((await m.list({ action: 'cancel', listingId }, USER_A)).body.reason).toBe('reserved');
    m.store.nowMs += (MARKET_RULES.reservationTtlMinutes + 5) * MIN;
    expect((await m.list({ action: 'cancel', listingId }, USER_A)).status).toBe(200);
  });

  it('an unsold listing expires after its time and the item goes back to its owner', async () => {
    const { m, cert, listingId } = await market();
    m.store.nowMs += MARKET_RULES.listingTtlDays * DAY + 1;
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
    const tx = payTx(m, res!, USER_C);
    expect((await submit(m, res!, tx, USER_C)).status).toBe(404);
    const { r } = await payAndSubmit(m, res!, USER_B);
    expect(r.body.status).toBe('sold');
    expect(m.store.sales[0].buyerId).toBe(USER_B);
    expect([...m.store.certs.values()].filter((c) => c.originCertificateId !== null)).toHaveLength(1);
  });

  it('two verifications of the same signature interleaved on the node still end in exactly one sale', async () => {
    const { m, listingId } = await market();
    const { res } = await reserve(m, listingId);
    const tx = payTx(m, res!);
    let release!: () => void;
    m.chain.gate = new Promise<void>((resolveGate) => (release = resolveGate));
    const both = Promise.all([submit(m, res!, tx), submit(m, res!, tx)]);
    release();
    const [a, b] = await both;
    expect([a.body.status, b.body.status].sort()).toEqual(['replayed', 'sold']);
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

describe('the optional dollar line', () => {
  it('the overview carries the SOL price in dollars only when the server has one, and never fails because of it', async () => {
    const m = makeMarket();
    m.link(USER_A);
    expect((await m.my({ action: 'overview' }, USER_A)).body.solUsd).toBeNull();
    m.usd.value = 148.25;
    expect((await m.my({ action: 'overview' }, USER_A)).body.solUsd).toBe(148.25);
    m.deps.solUsd = async () => {
      throw new Error('price feed down');
    };
    const down = await m.my({ action: 'overview' }, USER_A);
    expect(down.status).toBe(200);
    expect(down.body.solUsd).toBeNull();
  });
});

describe('the USDC Pass (pass-crypto)', () => {
  async function ready() {
    const m = makeMarket();
    m.link(USER_B);
    return m;
  }
  const usdc = (m: M, from: string, to: string, units = 10_000_000, over: Parameters<M['chain']['usdc']>[3] = {}, mint = CONFIG.usdcMint) => m.chain.usdc(from, to, units, over, mint);

  it('price tells the buy screen the cost up front: no wallet needed, no purchase intent opened, still behind the login', async () => {
    const m = makeMarket(); // no wallet linked
    const r = await m.pass({ action: 'price' }, USER_B);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, priceUnits: 10_000_000, priceUsdc: '10.00', chain: { chainId: 502, usdcMint: CONFIG.usdcMint } });
    expect(r.body).not.toHaveProperty('receiveAddress');
    expect(m.store.intents.size).toBe(0);
    expect((await m.pass({ action: 'price' }, null)).status).toBe(401);
  });

  it('start says what to pay, to whom and from which token accounts; paying 10.00 USDC from the linked wallet to the receiving wallet grants the Pass', async () => {
    const m = await ready();
    const start = await m.pass({ action: 'start' }, USER_B);
    expect(start.body).toMatchObject({
      ok: true,
      priceUnits: 10_000_000,
      priceUsdc: '10.00',
      decimals: 6,
      receiveAddress: PASS_ADDRESS,
      receiverTokenAccount: associatedTokenAddress(PASS_ADDRESS, CONFIG.usdcMint),
      buyerAddress: WALLET[USER_B],
      buyerTokenAccount: associatedTokenAddress(WALLET[USER_B], CONFIG.usdcMint),
      chain: { chainId: 502, livemode: false },
    });
    m.store.nowMs += 60_000; // he pays after starting
    const tx = usdc(m, WALLET[USER_B], PASS_ADDRESS);
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.body).toMatchObject({ ok: true, status: 'granted', livemode: false });
    expect(m.store.entitlements).toEqual([{ userId: USER_B, source: 'crypto_sol', providerRef: tx, status: 'active', livemode: false }]);
  });

  it('start refuses to send a player to a receiving token account that does not exist yet (the owner creates it once)', async () => {
    const m = await ready();
    m.chain.accounts.clear();
    const r = await m.pass({ action: 'start' }, USER_B);
    expect(r.status).toBe(503);
    expect(r.body.reason).toBe('receiver_account_missing');
    expect(m.store.intents.size).toBe(0);
    m.chain.down = true;
    expect((await m.pass({ action: 'start' }, USER_B)).body.reason).toBe('rpc_error');
  });

  it('prepare hands a blockhash to a logged-in player with a wallet', async () => {
    const m = await ready();
    const r = await m.pass({ action: 'prepare' }, USER_B);
    expect(r.body).toMatchObject({ ok: true, blockhash: addr(5) });
    expect((await m.pass({ action: 'prepare' }, USER_C)).body.reason).toBe('no_wallet');
  });

  it('is idempotent: submitting the same signature again does not grant twice', async () => {
    const m = await ready();
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const tx = usdc(m, WALLET[USER_B], PASS_ADDRESS);
    await m.pass({ action: 'submit', signature: tx }, USER_B);
    const again = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(again.status).toBe(200); // the same player, the same signature: the same answer (a replay), never a second Pass
    expect(again.body).toMatchObject({ ok: true, status: 'granted', replay: true });
    expect(m.store.entitlements).toHaveLength(1);
  });

  it('two submissions of the same signature at the same instant grant once', async () => {
    const m = await ready();
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const tx = usdc(m, WALLET[USER_B], PASS_ADDRESS);
    const [a, b] = await Promise.all([m.pass({ action: 'submit', signature: tx }, USER_B), m.pass({ action: 'submit', signature: tx }, USER_B)]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(m.store.entitlements).toHaveLength(1);
  });

  it('refuses a payment that is short, to the wrong wallet, from another wallet, in another token, before the start, or reused', async () => {
    const m = await ready();
    m.link(USER_C);
    const early = usdc(m, WALLET[USER_B], PASS_ADDRESS); // mined before the intent
    m.store.nowMs += 10_000;
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    // a payment that reached the receiving wallet but cannot be matched is not "refused and forgotten": it answers payment_unmatched with the reason in `why` (and is queued, see paymentFixes.test.ts)
    const reason = async (tx: string) => {
      const r = (await m.pass({ action: 'submit', signature: tx }, USER_B)).body;
      return r.reason === 'payment_unmatched' ? `unmatched:${String(r.why)}` : r.reason;
    };
    expect(await reason(usdc(m, WALLET[USER_B], PASS_ADDRESS, 9_999_999))).toBe('unmatched:short_amount');
    expect(await reason(usdc(m, WALLET[USER_B], FEE_ADDRESS))).toBe('wrong_recipient');
    expect(await reason(usdc(m, WALLET[USER_C], PASS_ADDRESS))).toBe('unmatched:no_memo'); // another wallet and no reference: not his to claim, kept for the owner
    expect(await reason(usdc(m, WALLET[USER_B], PASS_ADDRESS, 10_000_000, {}, addr(99)))).toBe('wrong_mint');
    expect(await reason(early)).toBe('unmatched:too_early');
    expect(await reason(usdc(m, WALLET[USER_B], PASS_ADDRESS, 10_000_000, { err: { InstructionError: [0, 'x'] } }))).toBe('tx_failed');
    expect(m.store.entitlements).toHaveLength(0);
    // a signature somebody else already used for the Pass
    await m.pass({ action: 'start' }, USER_C);
    m.store.nowMs += 60_000;
    const used = usdc(m, WALLET[USER_C], PASS_ADDRESS);
    expect((await m.pass({ action: 'submit', signature: used }, USER_C)).body.status).toBe('granted');
    expect(await reason(used)).toBe('tx_reused');
  });

  it('a Pass payment that is not finalized yet is "unconfirmed" (retry), and consumes nothing', async () => {
    const m = await ready();
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const tx = usdc(m, WALLET[USER_B], PASS_ADDRESS);
    m.chain.held.add(tx);
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe('unconfirmed');
    m.chain.held.delete(tx);
    expect((await m.pass({ action: 'submit', signature: tx }, USER_B)).body.status).toBe('granted');
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
    const tx = usdc(m, WALLET[USER_B], PASS_ADDRESS);
    const grant = m.store.grant.bind(m.store);
    m.store.grant = async (a) => {
      m.store.entitlements.push({ userId: USER_B, source: 'stripe', providerRef: 'pi_2', status: 'active', livemode: true });
      return grant(a);
    };
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ reason: 'already_owned', refundDue: true });
    expect(m.store.paid.get(tx)?.status).toBe('refund_due');
    expect(m.store.entitlements.filter((e) => e.source === 'crypto_sol')).toHaveLength(0);
  });

  it('the price is a secret by name: a different PASS_PRICE_USDC changes what is required', async () => {
    const m = makeMarket({ passPriceUnits: 12_500_000 });
    m.link(USER_B);
    expect((await m.pass({ action: 'price' }, USER_B)).body).toMatchObject({ priceUnits: 12_500_000, priceUsdc: '12.50' });
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    expect((await m.pass({ action: 'submit', signature: usdc(m, WALLET[USER_B], PASS_ADDRESS, 10_000_000) }, USER_B)).body).toMatchObject({ reason: 'payment_unmatched', why: 'short_amount' });
    expect((await m.pass({ action: 'submit', signature: usdc(m, WALLET[USER_B], PASS_ADDRESS, 12_500_000) }, USER_B)).body.status).toBe('granted');
  });
});
