import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import PassUsdc from '../../components/PassUsdc';
import { MarketApi, MarketFn, PassPlan, createMarketApi } from '../market/api';
import { payPassFromWallet } from '../market/passPay';
import { payReservationFromWallet, submitWithPolling } from '../market/payFlow';
import { mt } from '../../locales/market';
import { fakePhantom } from './fakePhantom';
import { parseLegacyTx } from './solTxParse';
import { FEE_ADDRESS, PASS_ADDRESS, USER_A, USER_B, WALLET, makeMarket, throwawayWallet } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import { addr, sig } from '../../../supabase/functions/_shared/__tests__/solanaFixtures';
import { MEMO_PROGRAM_ID, passMemo, saleMemo } from '../../../supabase/functions/_shared/chain/memo';
import { associatedTokenAddress } from '../../../supabase/functions/_shared/chain/ata';

// The reference every payment carries, from the player's side: the transaction the wallet is asked to sign has the memo the SERVER handed over, the game refuses to pay from the receiving address, and a
// payment that reached the game but could not be matched shows the player the code to keep. The server side is in supabase/functions/_shared/__tests__/paymentFixes.test.ts.

const install = (win: Window) => {
  (globalThis as { window?: unknown }).window = win;
};
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('the built transactions carry the server\'s memo', () => {
  it('the Pass: the plan\'s memo is the last instruction of the bytes the wallet receives, signed by the payer', async () => {
    const buyer = throwawayWallet();
    const p = fakePhantom([buyer]);
    install(p.win);
    await (await import('../market/wallet')).connectSolWallet(undefined, undefined, p.win); // approved earlier
    const memo = passMemo('0123456789abcdef0123456789abcdef');
    const plan: PassPlan = {
      priceUnits: 10_000_000,
      priceUsdc: '10.00',
      decimals: 6,
      receiveAddress: PASS_ADDRESS,
      receiverTokenAccount: associatedTokenAddress(PASS_ADDRESS, addr(77)),
      buyerAddress: buyer.address,
      buyerTokenAccount: associatedTokenAddress(buyer.address, addr(77)),
      intentAt: '2026-11-02T12:00:00.000Z',
      chain: { network: 'solana', cluster: 'devnet', chainId: 502, usdcMint: addr(77), livemode: false, feePercent: 5 },
      memo,
    };
    const api = createMarketApi(async () => ({ status: 200, body: { ok: true, blockhash: addr(5), lastValidBlockHeight: 1 } }));
    const r = await payPassFromWallet(api, plan);
    expect(r).toMatchObject({ ok: true });
    expect(p.state.sent).toHaveLength(1);
    const tx = parseLegacyTx(p.state.sent[0]);
    expect(tx.instructions).toHaveLength(2);
    expect(tx.instructions[1].program).toBe(MEMO_PROGRAM_ID);
    expect(tx.instructions[1].accounts).toEqual([buyer.address]);
    expect(new TextDecoder().decode(tx.instructions[1].data)).toBe(memo);
  });

  it('a market reservation: the reservation\'s memo rides along the two transfers', async () => {
    const buyer = throwawayWallet();
    const p = fakePhantom([buyer]);
    install(p.win);
    const res = {
      id: '11111111-2222-4333-8444-555555555555',
      listingId: 'l1',
      status: 'pending' as const,
      priceLamports: 1_000_000_000,
      feeLamports: 50_000_000,
      sellerLamports: 950_000_000,
      sellerAddress: WALLET[USER_A],
      feeAddress: FEE_ADDRESS,
      buyerAddress: buyer.address,
      expiresAt: '2026-11-02T12:30:00.000Z',
      graceUntil: '2026-11-02T14:30:00.000Z',
      payments: [],
      chain: { network: 'solana' as const, cluster: 'devnet' as const, chainId: 502, usdcMint: addr(77), livemode: false, feePercent: 5 },
      memo: saleMemo('11111111-2222-4333-8444-555555555555'),
    };
    const api = createMarketApi(async () => ({ status: 200, body: { ok: true, blockhash: addr(5), lastValidBlockHeight: 1 } }));
    expect(await payReservationFromWallet(api, res, buyer.address)).toMatchObject({ ok: true });
    const tx = parseLegacyTx(p.state.sent[0]);
    expect(tx.instructions.map((i) => i.program)).toEqual([expect.any(String), expect.any(String), MEMO_PROGRAM_ID]);
    expect(new TextDecoder().decode(tx.instructions[2].data)).toBe(res.memo);
  });

  it('the memo the server sends through start is the one that is built (end to end through the real handler)', async () => {
    const m = makeMarket();
    m.link(USER_B);
    const api: MarketApi = createMarketApi(async (fn: MarketFn, body: object) => (fn === 'pass-crypto' ? m.pass : m.wallet)(body, USER_B));
    const plan = await api.passStart();
    expect(plan.ok).toBe(true);
    expect((plan as { memo?: string }).memo).toMatch(/^pa1:pass:[0-9a-f]{32}$/);
  });
});

describe('paying from the game\'s own receiving address', () => {
  it('the Pass: refused before the wallet is even opened, and the server\'s prepare says the same', async () => {
    const plan = { buyerAddress: PASS_ADDRESS, receiveAddress: PASS_ADDRESS } as PassPlan;
    expect(await payPassFromWallet(createMarketApi(async () => ({ status: 200, body: { ok: true } })), plan)).toEqual({ ok: false, failure: 'selfPayment' });
    const m = makeMarket();
    m.link(USER_B);
    const asApi = createMarketApi(async (_fn, body) => m.pass(body, USER_B));
    expect(await asApi.passPrepare(PASS_ADDRESS)).toMatchObject({ ok: false, reason: 'self_payment' });
    // a window with a wallet that would pay: nothing is sent
    const w = fakePhantom([throwawayWallet()]);
    install(w.win);
    await payPassFromWallet(createMarketApi(async () => ({ status: 200, body: { ok: true } })), plan);
    expect(w.state.sent).toHaveLength(0);
    expect(w.state.connects).toBe(0);
  });

  it('a reservation: the fee address and the seller\'s address cannot pay it', async () => {
    const res = { id: 'r1', feeAddress: FEE_ADDRESS, sellerAddress: WALLET[USER_A], chain: { cluster: 'devnet' } } as never;
    const api = createMarketApi(async () => ({ status: 200, body: { ok: true } }));
    expect(await payReservationFromWallet(api, res, FEE_ADDRESS)).toEqual({ ok: false, failure: 'selfPayment' });
    expect(await payReservationFromWallet(api, res, WALLET[USER_A])).toEqual({ ok: false, failure: 'selfPayment' });
  });

  it('the screen says it in the words the owner asked for', () => {
    expect(mt('pay.selfPayment')).toBe('Esta é a carteira que recebe os pagamentos do jogo; pague com outra conta.');
    expect(mt('pay.fail.self_payment')).toBe(mt('pay.selfPayment'));
  });
});

describe('a payment that reached the game but could not be matched', () => {
  it('the polling reports the code (the signature) with the refusal, so the screen can show it', async () => {
    const api = createMarketApi(async () => ({ status: 409, body: { ok: false, reason: 'short_amount', unmatched: true, code: sig(33) } }));
    expect(await submitWithPolling(api, 'r1', sig(33), { intervalMs: 0, sleep: async () => undefined })).toEqual({ kind: 'refused', reason: 'short_amount', code: sig(33) });
    const plain = createMarketApi(async () => ({ status: 409, body: { ok: false, reason: 'short_amount' } }));
    expect(await submitWithPolling(plain, 'r1', sig(33), { intervalMs: 0, sleep: async () => undefined })).toEqual({ kind: 'refused', reason: 'short_amount' });
  });

  it('the words: "we received a payment we could not link to your purchase... keep this code: <signature>", (the English one is pinned to the same keys by locales.test)', () => {
    expect(mt('pay.unmatched', { code: sig(9) })).toBe(`Recebemos um pagamento que não conseguimos ligar à sua compra. Ele foi registrado e será resolvido; guarde este código: ${sig(9)}`);
  });

  it('the Pass screen renders (the payment step shows the waiting payments only once the server listed them)', () => {
    const html = renderToStaticMarkup(h(PassUsdc, { onGranted: () => undefined }));
    expect(html).toContain('USDC');
    expect(html).not.toContain('pass-waiting');
  });

  it('the api exposes the player\'s waiting payments from the server', async () => {
    const m = makeMarket();
    m.link(USER_B);
    await m.pass({ action: 'start' }, USER_B);
    m.store.nowMs += 60_000;
    const tx = m.chain.usdc(addr(70), PASS_ADDRESS, 10_000_000, {}, m.passChain.config.usdcMint);
    const api = createMarketApi(async (_fn, body) => m.pass(body, USER_B));
    const submitted = await api.passSubmit(tx);
    expect(submitted).toMatchObject({ ok: false, reason: 'payment_unmatched', extra: { code: tx, why: 'no_memo' } });
    expect(await api.passExceptions()).toMatchObject({ ok: true, exceptions: [{ signature: tx, reason: 'no_memo' }] });
  });
});
