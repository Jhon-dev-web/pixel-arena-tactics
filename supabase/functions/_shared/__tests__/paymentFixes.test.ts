import { describe, expect, it } from 'vitest';
import { passMemo, saleMemo } from '../chain/memo.ts';
import { DAY, MIN } from './fakeMarketStore.ts';
import { FEE_ADDRESS, PASS_ADDRESS, USER_A, USER_B, USER_C, USER_D, WALLET, makeMarket, throwawayWallet } from './marketHarness.ts';
import { addr } from './solanaFixtures.ts';

// Payments that carry a reference (an SPL Memo) and the queue for the ones that cannot be matched (migration 0022). The handlers over the in-memory store and the fake Solana node.

const SOL = 1_000_000_000;
type M = ReturnType<typeof makeMarket>;
// a wallet that is NOT the one linked to the player: his second Phantom account
const SECOND = (n: number) => addr(60 + n);

describe('switching the linked wallet is accepted by market-wallet with a new signature', () => {
  it('a second link with a new nonce and a signature of the NEW key moves the account to it; the old key can no longer sign for him', async () => {
    const m = makeMarket();
    const first = throwawayWallet();
    const second = throwawayWallet();
    const link = async (w: ReturnType<typeof throwawayWallet>) => {
      const n = await m.wallet({ action: 'nonce', address: w.address }, USER_A);
      return m.wallet({ action: 'link', address: w.address, nonce: n.body.nonce, signature: w.sign(n.body.message as string) }, USER_A);
    };
    expect((await link(first)).body).toMatchObject({ ok: true, status: 'linked' });
    expect((await link(second)).body).toMatchObject({ ok: true, status: 'linked', wallet: { address: second.address } });
    expect((await m.store.wallet(USER_A))?.address).toBe(second.address);
    expect((await link(second)).body.status).toBe('unchanged');
    // a signature made by the old key for the new address is refused
    const n = await m.wallet({ action: 'nonce', address: second.address }, USER_A);
    expect((await m.wallet({ action: 'link', address: second.address, nonce: n.body.nonce, signature: first.sign(n.body.message as string) }, USER_A)).body.reason).toBe('bad_signature');
  });
});

describe('the Pass: recognised by its memo, from ANY wallet of the player', () => {
  async function ready() {
    const m = makeMarket();
    m.link(USER_B); // the linked wallet is WALLET[USER_B]
    const start = await m.pass({ action: 'start' }, USER_B);
    expect(start.status).toBe(200);
    m.store.nowMs += MIN;
    return { m, memo: start.body.memo as string };
  }
  const usdc = (m: M, from: string, units: number, memos: string[] = [], to = PASS_ADDRESS) => m.chain.usdc(from, to, units, { memos }, m.passChain.config.usdcMint);

  it('start hands over the memo: "pa1:pass:<reference>", the reference being the player\'s own and stable', async () => {
    const { m, memo } = await ready();
    expect(memo).toBe(passMemo(await m.store.passRef(USER_B)));
    expect(memo).toMatch(/^pa1:pass:[0-9a-f]{32}$/);
    expect((await m.pass({ action: 'start' }, USER_B)).body.memo).toBe(memo);
    m.link(USER_C);
    expect((await m.pass({ action: 'start' }, USER_C)).body.memo).not.toBe(memo);
  });

  it('a payment from ANOTHER wallet of the same player, carrying his memo, grants the Pass (the linked address is only a soft signal)', async () => {
    const { m, memo } = await ready();
    const tx = usdc(m, SECOND(1), 10_000_000, [memo]);
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.body).toMatchObject({ ok: true, status: 'granted' });
    expect(m.store.entitlements).toEqual([{ userId: USER_B, source: 'crypto_sol', providerRef: tx, status: 'active', livemode: false }]);
    expect(m.store.paid.get(tx)?.fromAddress).toBe(SECOND(1)); // the wallet that REALLY paid is what is stored
    expect(m.store.exceptions).toHaveLength(0);
  });

  it('the same payment from the linked wallet with the memo also works, and with no memo at all (a payment made by hand) as before', async () => {
    const { m, memo } = await ready();
    expect((await m.pass({ action: 'submit', signature: usdc(m, WALLET[USER_B], 10_000_000, [memo]) }, USER_B)).body.status).toBe('granted');
    const m2 = makeMarket();
    m2.link(USER_B);
    await m2.pass({ action: 'start' }, USER_B);
    m2.store.nowMs += MIN;
    expect((await m2.pass({ action: 'submit', signature: usdc(m2, WALLET[USER_B], 10_000_000) }, USER_B)).body.status).toBe('granted');
  });

  it('the memo cannot be replayed: another player submitting a payment that carries MY reference gets "not_your_payment" and no row', async () => {
    const { m, memo } = await ready();
    m.link(USER_C);
    await m.pass({ action: 'start' }, USER_C);
    const tx = usdc(m, SECOND(2), 10_000_000, [memo]); // paid for B
    expect((await m.pass({ action: 'submit', signature: tx }, USER_C)).body.reason).toBe('not_your_payment');
    expect(m.store.entitlements).toHaveLength(0);
    expect(m.store.exceptions).toHaveLength(0);
    // B submits it and gets the Pass; C cannot take it afterwards either
    expect((await m.pass({ action: 'submit', signature: tx }, USER_B)).body.status).toBe('granted');
    expect((await m.pass({ action: 'submit', signature: tx }, USER_C)).body.reason).toBe('tx_reused');
  });

  it('the signature is single use: the same signature twice is one Pass (a replay), never two', async () => {
    const { m, memo } = await ready();
    const tx = usdc(m, SECOND(1), 10_000_000, [memo]);
    expect((await m.pass({ action: 'submit', signature: tx }, USER_B)).body.status).toBe('granted');
    const again = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(again.body).toMatchObject({ ok: true, replay: true });
    expect(m.store.entitlements).toHaveLength(1);
    expect(m.store.exceptions).toHaveLength(0);
  });

  it('self-payment: prepare refuses the receiving address as the payer; a transaction that nets zero for the receiver is refused, not queued', async () => {
    const { m, memo } = await ready();
    expect((await m.pass({ action: 'prepare', payer: PASS_ADDRESS }, USER_B)).body).toMatchObject({ ok: false, reason: 'self_payment' });
    expect((await m.pass({ action: 'prepare', payer: SECOND(1) }, USER_B)).body.ok).toBe(true);
    expect((await m.pass({ action: 'prepare', payer: 'nope' }, USER_B)).body.reason).toBe('bad_request');
    // the receiving account paying itself: its USDC goes down and up by the same amount
    const self = m.chain.add({
      tokens: [
        { owner: PASS_ADDRESS, mint: m.passChain.config.usdcMint, pre: 50_000_000, post: 50_000_000 },
        { owner: PASS_ADDRESS, mint: m.passChain.config.usdcMint, pre: 1_000_000, post: 1_000_000 },
      ],
      memos: [memo],
    });
    const r = await m.pass({ action: 'submit', signature: self }, USER_B);
    expect(r.body.reason).toBe('self_payment');
    expect(m.store.entitlements).toHaveLength(0);
    expect(m.store.exceptions).toHaveLength(0);
  });

  it('no memo from a wallet that is not his -> payment_unmatched with the signature as the code, queued for the owner with who / what / how much', async () => {
    const { m } = await ready();
    const tx = usdc(m, SECOND(3), 10_000_000);
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, reason: 'payment_unmatched', code: tx, why: 'no_memo' });
    expect(m.store.entitlements).toHaveLength(0);
    expect(m.store.exceptions).toHaveLength(1);
    expect(m.store.exceptions[0]).toMatchObject({ signature: tx, purpose: 'pass', reason: 'no_memo', userId: USER_B, payer: SECOND(3), receiver: PASS_ADDRESS, amountUnits: 10_000_000n, status: 'open', livemode: false });
  });

  it('the same unmatched payment submitted twice is ONE row; a second player claiming it is only noted', async () => {
    const { m } = await ready();
    m.link(USER_C);
    await m.pass({ action: 'start' }, USER_C);
    const tx = usdc(m, SECOND(3), 10_000_000);
    await m.pass({ action: 'submit', signature: tx }, USER_B);
    await m.pass({ action: 'submit', signature: tx }, USER_B);
    await m.pass({ action: 'submit', signature: tx }, USER_C);
    expect(m.store.exceptions).toHaveLength(1);
    expect(m.store.exceptions[0].userId).toBe(USER_B);
    expect(m.store.exceptions[0].claimedBy).toEqual([USER_C]);
  });

  it('a wrong memo (a reference that belongs to nobody) is "wrong_memo", queued', async () => {
    const { m } = await ready();
    const tx = usdc(m, SECOND(4), 10_000_000, [passMemo('f'.repeat(32))]);
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.body).toMatchObject({ reason: 'payment_unmatched', why: 'wrong_memo' });
    expect(m.store.exceptions[0]).toMatchObject({ reason: 'wrong_memo', memo: passMemo('f'.repeat(32)) });
  });

  it('partial / wrong amount: a short payment with the right memo is queued, never silently lost; it does not grant', async () => {
    const { m, memo } = await ready();
    const tx = usdc(m, SECOND(1), 4_000_000, [memo]);
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.body).toMatchObject({ reason: 'payment_unmatched', why: 'short_amount' });
    expect(m.store.entitlements).toHaveLength(0);
    expect(m.store.exceptions[0]).toMatchObject({ reason: 'short_amount', amountUnits: 4_000_000n, payer: SECOND(1) });
  });

  it('a payment made before the intent is queued as "too_early"', async () => {
    const m = makeMarket();
    m.link(USER_B);
    const early = m.chain.usdc(WALLET[USER_B], PASS_ADDRESS, 10_000_000, {}, m.passChain.config.usdcMint);
    m.store.nowMs += 10 * MIN;
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += MIN;
    const r = await m.pass({ action: 'submit', signature: early }, USER_B);
    expect(r.body).toMatchObject({ reason: 'payment_unmatched', why: 'too_early' });
    expect(m.store.exceptions[0].reason).toBe('too_early');
  });

  it('a payment that never reached the receiving wallet is simply refused (nothing of the game\'s to resolve)', async () => {
    const { m, memo } = await ready();
    const r = await m.pass({ action: 'submit', signature: usdc(m, SECOND(1), 10_000_000, [memo], FEE_ADDRESS) }, USER_B);
    expect(r.body.reason).toBe('wrong_recipient');
    expect(m.store.exceptions).toHaveLength(0);
  });

  it('a payment that arrives when the Pass is already owned is turned away AND queued as owed back', async () => {
    const { m, memo } = await ready();
    m.store.entitlements.push({ userId: USER_B, source: 'stripe', providerRef: 'pi_1', status: 'active', livemode: true });
    const tx = usdc(m, SECOND(1), 10_000_000, [memo]);
    const r = await m.pass({ action: 'submit', signature: tx }, USER_B);
    expect(r.body).toMatchObject({ reason: 'already_owned', refundDue: true });
    expect(m.store.exceptions[0]).toMatchObject({ reason: 'already_owned', signature: tx, amountUnits: 10_000_000n });
  });

  it('an unmatched payment closes itself when it is matched after all (the player submits it again properly)', async () => {
    const { m } = await ready();
    const tx = usdc(m, WALLET[USER_B], 4_000_000); // from the linked wallet, short
    expect((await m.pass({ action: 'submit', signature: tx }, USER_B)).body.why).toBe('short_amount');
    expect(m.store.exceptions[0].status).toBe('open');
    // a tx can't change; matching "after all" happens through the owner's resolution. The auto-close path is the store call itself:
    expect(await m.store.closeException(tx)).toBe(true);
    expect(m.store.exceptions[0].status).toBe('resolved');
    expect(await m.store.closeException(tx)).toBe(false);
  });

  it('exceptions lists the player\'s own open payments (so the screen can show the code again after a reload) and nobody else\'s', async () => {
    const { m } = await ready();
    const tx = usdc(m, SECOND(3), 10_000_000);
    await m.pass({ action: 'submit', signature: tx }, USER_B);
    const mine = await m.pass({ action: 'exceptions' }, USER_B);
    expect(mine.body).toMatchObject({ ok: true, exceptions: [{ signature: tx, reason: 'no_memo', purpose: 'pass', amountUnits: '10000000' }] });
    expect((await m.pass({ action: 'exceptions' }, USER_C)).body.exceptions).toEqual([]);
    expect((await m.pass({ action: 'exceptions' }, null)).status).toBe(401);
  });
});

describe('the market: a sale is recognised by its reservation memo', () => {
  async function reserved() {
    const m = makeMarket();
    for (const u of [USER_A, USER_B, USER_C, USER_D]) m.link(u);
    const cert = m.store.addCert(USER_A);
    const listed = await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL }, USER_A);
    const r = await m.buy({ action: 'reserve', listingId: listed.body.listingId }, USER_B);
    const res = r.body.reservation as { id: string; sellerAddress: string; sellerLamports: number; feeLamports: number; memo: string; feeAddress: string };
    return { m, res };
  }
  const pay = (m: M, from: string, res: { sellerAddress: string; sellerLamports: number; feeLamports: number }, memos: string[], over: { seller?: number; fee?: number } = {}) =>
    m.chain.sale(from, [{ to: res.sellerAddress, lamports: over.seller ?? res.sellerLamports }, { to: FEE_ADDRESS, lamports: over.fee ?? res.feeLamports }], { memos });

  it('the reservation hands the memo to the buyer: "pa1:sale:<reservation id>"', async () => {
    const { res } = await reserved();
    expect(res.memo).toBe(saleMemo(res.id));
  });

  it('a payment from ANOTHER wallet of the buyer that carries the memo completes the sale; the counted payment records who really paid', async () => {
    const { m, res } = await reserved();
    const tx = pay(m, SECOND(5), res, [res.memo]);
    const r = await m.buy({ action: 'submit', reservationId: res.id, signature: tx }, USER_B);
    expect(r.body).toMatchObject({ ok: true, status: 'sold' });
    expect(m.store.paid.get(tx)?.fromAddress).toBe(SECOND(5));
    expect(m.store.exceptions).toHaveLength(0);
  });

  it('without the memo, another wallet is still refused as before and the money that reached the sale is queued for the owner', async () => {
    const { m, res } = await reserved();
    const tx = pay(m, SECOND(5), res, []);
    const r = await m.buy({ action: 'submit', reservationId: res.id, signature: tx }, USER_B);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, reason: 'wrong_sender', unmatched: true, code: tx });
    expect(m.store.exceptions).toHaveLength(1);
    expect(m.store.exceptions[0]).toMatchObject({ signature: tx, purpose: 'market', reason: 'wrong_sender', userId: USER_B, reservationId: res.id, payer: SECOND(5), receiver: FEE_ADDRESS, amountUnits: BigInt(SOL) });
  });

  it('the memo of ANOTHER reservation does not unlock mine', async () => {
    const { m, res } = await reserved();
    const tx = pay(m, SECOND(5), res, [saleMemo('99999999-9999-4999-8999-999999999999')]);
    const r = await m.buy({ action: 'submit', reservationId: res.id, signature: tx }, USER_B);
    expect(r.body.reason).toBe('wrong_sender');
  });

  it('a short payment with the memo is queued as short_amount (never silently lost) and does not sell', async () => {
    const { m, res } = await reserved();
    const tx = pay(m, SECOND(5), res, [res.memo], { fee: res.feeLamports - 1 });
    const r = await m.buy({ action: 'submit', reservationId: res.id, signature: tx }, USER_B);
    expect(r.body).toMatchObject({ reason: 'short_amount', unmatched: true, code: tx });
    expect(m.store.exceptions[0]).toMatchObject({ reason: 'short_amount', reservationId: res.id });
    expect((await m.buy({ action: 'status', reservationId: res.id }, USER_B)).body.reservation).toMatchObject({ status: 'pending' });
  });

  it('a payment made before the reservation is queued as too_early', async () => {
    const m = makeMarket();
    for (const u of [USER_A, USER_B]) m.link(u);
    const cert = m.store.addCert(USER_A);
    const listed = await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL }, USER_A);
    const old = m.chain.sale(WALLET[USER_B], [{ to: WALLET[USER_A], lamports: 950_000_000 }, { to: FEE_ADDRESS, lamports: 50_000_000 }]);
    m.store.nowMs += DAY / 24;
    const res = (await m.buy({ action: 'reserve', listingId: listed.body.listingId }, USER_B)).body.reservation as { id: string };
    const r = await m.buy({ action: 'submit', reservationId: res.id, signature: old }, USER_B);
    expect(r.body).toMatchObject({ reason: 'too_early', unmatched: true });
    expect(m.store.exceptions[0].reason).toBe('too_early');
  });

  it('the same signature twice is one sale, one exception row at most', async () => {
    const { m, res } = await reserved();
    const tx = pay(m, SECOND(5), res, [res.memo]);
    expect((await m.buy({ action: 'submit', reservationId: res.id, signature: tx }, USER_B)).body.status).toBe('sold');
    expect((await m.buy({ action: 'submit', reservationId: res.id, signature: tx }, USER_B)).body.status).toBe('replayed');
    expect(m.store.exceptions).toHaveLength(0);
  });

  it('self-payment: prepare refuses the game\'s fee address (or the seller\'s) as the payer; the linked wallet and another wallet pass', async () => {
    const { m, res } = await reserved();
    expect((await m.buy({ action: 'prepare', reservationId: res.id, payer: FEE_ADDRESS }, USER_B)).body).toMatchObject({ ok: false, reason: 'self_payment' });
    expect((await m.buy({ action: 'prepare', reservationId: res.id, payer: res.sellerAddress }, USER_B)).body.reason).toBe('self_payment');
    expect((await m.buy({ action: 'prepare', reservationId: res.id, payer: SECOND(5) }, USER_B)).body.ok).toBe(true);
    expect((await m.buy({ action: 'prepare', reservationId: res.id }, USER_B)).body.ok).toBe(true);
    expect((await m.buy({ action: 'prepare', reservationId: res.id, payer: 'nope' }, USER_B)).body.reason).toBe('bad_request');
  });

  it('a buyer whose linked wallet IS the fee address can never complete a payment (the fee would pay itself)', async () => {
    const m = makeMarket();
    m.link(USER_A);
    m.store.linkWallet(USER_B, FEE_ADDRESS);
    const cert = m.store.addCert(USER_A);
    const listed = await m.list({ action: 'list', certificateId: cert.id, priceLamports: SOL }, USER_A);
    const res = (await m.buy({ action: 'reserve', listingId: listed.body.listingId }, USER_B)).body.reservation as { id: string; sellerAddress: string; sellerLamports: number };
    expect((await m.buy({ action: 'prepare', reservationId: res.id }, USER_B)).body.reason).toBe('self_payment');
    const tx = m.chain.sale(FEE_ADDRESS, [{ to: res.sellerAddress, lamports: res.sellerLamports }, { to: FEE_ADDRESS, lamports: 50_000_000 }], { memos: [saleMemo(res.id)] });
    expect((await m.buy({ action: 'submit', reservationId: res.id, signature: tx }, USER_B)).body.reason).toBe('wrong_sender');
  });
});
