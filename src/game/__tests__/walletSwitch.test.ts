import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountMismatch } from '../../components/market/AccountMismatch';
import { mismatchText } from '../../components/market/openAccount';
import { MarketApi, MarketFn, PassPlan, createMarketApi } from '../market/api';
import { runLinkFlow } from '../market/linkFlow';
import { payPassFromWallet } from '../market/passPay';
import { payReservationFromWallet } from '../market/payFlow';
import { connectSolWallet, watchOpenAccount } from '../market/wallet';
import { fakePhantom } from './fakePhantom';
import { FEE_ADDRESS, USER_A, WALLET, makeMarket, throwawayWallet } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import { addr } from '../../../supabase/functions/_shared/__tests__/solanaFixtures';
import type { ReservationView } from '../../../supabase/functions/_shared/market/types';

// Switching accounts in the player's wallet (Phantom): what the page does when the player picks another account, with a FAKE wallet that behaves like Phantom does (it keeps the authorisation of the
// account approved first until the page disconnects), the real market-wallet handler behind the api, and no browser.

const install = (win: Window) => {
  (globalThis as { window?: unknown }).window = win;
};

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('changing the linked wallet', () => {
  const setup = () => {
    const m = makeMarket();
    const api = (u: string): MarketApi => createMarketApi(async (fn: MarketFn, body: object) => (fn === 'market-wallet' ? m.wallet : fn === 'market-buy' ? m.buy : m.pass)(body, u));
    return { m, api };
  };

  it('the old behaviour: connect() on a connected wallet answers with the account approved first (why the address never changed)', async () => {
    const a = throwawayWallet();
    const b = throwawayWallet();
    const p = fakePhantom([a, b]);
    expect((await connectSolWallet(undefined, undefined, p.win)).address).toBe(a.address);
    p.pick(b); // the player switches in the extension; the page was not told
    expect(p.state.authorized).toBe(a);
    expect((await connectSolWallet(undefined, undefined, p.win)).address).toBe(a.address);
  });

  it('"change wallet" disconnects, connects again, reads the account selected NOW, asks a NEW signature and the server link moves to it', async () => {
    const { m, api } = setup();
    const a = throwawayWallet();
    const b = throwawayWallet();
    const p = fakePhantom([a, b]);
    install(p.win);

    const first = await runLinkFlow(api(USER_A));
    expect(first).toEqual({ ok: true, address: a.address, unchanged: false });
    expect((await m.store.wallet(USER_A))?.address).toBe(a.address);
    expect(p.state.signed).toHaveLength(1);

    p.pick(b); // account 2 in Phantom
    const second = await runLinkFlow(api(USER_A));
    expect(second).toEqual({ ok: true, address: b.address, unchanged: false });
    expect(p.state.disconnects).toBe(2); // each link starts from a clean session
    expect(p.state.connects).toBe(2);
    expect(p.state.signed).toHaveLength(2); // a new message, a new signature
    expect(p.state.signed[1]).not.toBe(p.state.signed[0]);
    expect(p.state.signed[1]).toContain(b.address);
    expect((await m.store.wallet(USER_A))?.address).toBe(b.address);
  });

  it('linking again WITHOUT switching in the wallet says "unchanged", so the screen can tell him to pick the other account', async () => {
    const { api } = setup();
    const a = throwawayWallet();
    const b = throwawayWallet();
    const p = fakePhantom([a, b]);
    install(p.win);
    await runLinkFlow(api(USER_A));
    expect(await runLinkFlow(api(USER_A))).toEqual({ ok: true, address: a.address, unchanged: true });
  });

  it('a wallet without disconnect still links (the feature is best effort)', async () => {
    const { api } = setup();
    const a = throwawayWallet();
    const p = fakePhantom([a]);
    delete (p.wallet.features as Record<string, unknown>)['standard:disconnect'];
    install(p.win);
    expect(await runLinkFlow(api(USER_A))).toMatchObject({ ok: true, address: a.address });
  });
});

describe('the account open in the wallet', () => {
  it('tells the page when the player switches account, and stops when unsubscribed', async () => {
    const a = throwawayWallet();
    const b = throwawayWallet();
    const p = fakePhantom([a, b]);
    await connectSolWallet(undefined, undefined, p.win); // approved earlier, with account 1
    const seen: (string | null)[] = [];
    const stop = await watchOpenAccount((address) => seen.push(address), undefined, p.win);
    expect(seen).toEqual([a.address]);
    p.pick(b, true);
    expect(seen).toEqual([a.address, b.address]);
    stop();
    p.pick(a, true);
    expect(seen).toEqual([a.address, b.address]);
  });

  it('a wallet that does not know the page yet reports nothing and is not asked to approve', async () => {
    const p = fakePhantom([throwawayWallet()]);
    (p.wallet.features['standard:connect'] as { connect: (i?: { silent?: boolean }) => Promise<never> }).connect = async () => {
      throw new Error('not trusted');
    };
    const seen: (string | null)[] = [];
    await watchOpenAccount((x) => seen.push(x), undefined, p.win);
    expect(seen).toEqual([]);
  });

  it('shows "the linked wallet is different from the account open in Phantom: link this one?" only when they differ', () => {
    const linked = addr(1);
    const open = addr(2);
    const shown = renderToStaticMarkup(h(AccountMismatch, { linked, open, walletName: 'Phantom', onRelink: () => undefined }));
    expect(shown).toContain('A carteira ligada');
    expect(shown).toContain('é diferente da conta aberta na Phantom');
    expect(shown).toContain('ligar esta?');
    expect(shown).toContain('Ligar esta conta'); // the re-link button
    expect(renderToStaticMarkup(h(AccountMismatch, { linked, open: linked, walletName: 'Phantom', onRelink: () => undefined }))).toBe('');
    expect(renderToStaticMarkup(h(AccountMismatch, { linked, open: null, walletName: 'Phantom', onRelink: () => undefined }))).toBe('');
    // while a reservation is open the server will not change the wallet: the text says how to get out and offers no button that would fail
    const locked = renderToStaticMarkup(h(AccountMismatch, { linked, open, walletName: 'Phantom', locked: true }));
    expect(locked).toContain('cancele a reserva');
    expect(locked).not.toContain('Ligar esta conta');
    expect(mismatchText(linked, open)).toContain('ligar esta?');
  });
});

describe('a payment is never sent from an account that is not the linked one', () => {
  const plan = (buyer: string): PassPlan => ({
    priceUnits: 10_000_000,
    priceUsdc: '10.00',
    decimals: 6,
    receiveAddress: addr(31),
    receiverTokenAccount: addr(41),
    buyerAddress: buyer,
    buyerTokenAccount: addr(42),
    intentAt: '2026-11-02T12:00:00.000Z',
    chain: { network: 'solana', cluster: 'devnet', chainId: 502, usdcMint: addr(77), livemode: false, feePercent: 5 },
  });
  const blockhashApi = (onPrepare: () => void = () => undefined): MarketApi =>
    createMarketApi(async () => {
      onPrepare();
      return { status: 200, body: { ok: true, blockhash: addr(5), lastValidBlockHeight: 1 } };
    });
  const view = (buyer: string): ReservationView => ({
    id: 'r1',
    listingId: 'l1',
    status: 'pending',
    priceLamports: 1_000_000_000,
    feeLamports: 50_000_000,
    sellerLamports: 950_000_000,
    sellerAddress: WALLET[USER_A],
    feeAddress: FEE_ADDRESS,
    buyerAddress: buyer,
    expiresAt: '2026-11-02T12:30:00.000Z',
    graceUntil: '2026-11-02T14:30:00.000Z',
    payments: [],
    chain: { network: 'solana', cluster: 'devnet', chainId: 502, usdcMint: addr(77), livemode: false, feePercent: 5 },
  });

  it('the Pass: the wallet shows account 2, the game has account 1 linked -> blocked, nothing sent, and the open account is named', async () => {
    const a = throwawayWallet();
    const b = throwawayWallet();
    const p = fakePhantom([a, b]);
    install(p.win);
    p.pick(b, true);
    const r = await payPassFromWallet(blockhashApi(), plan(a.address));
    expect(r).toEqual({ ok: false, failure: 'wrongAccount', open: b.address });
    expect(p.state.sent).toHaveLength(0);
  });

  it('the Pass: the player switches AFTER the page connected (while the blockhash was being fetched) -> still blocked right before signing', async () => {
    const a = throwawayWallet();
    const b = throwawayWallet();
    const p = fakePhantom([a, b]);
    install(p.win);
    p.pick(a, true);
    const r = await payPassFromWallet(blockhashApi(() => p.pick(b, true)), plan(a.address));
    expect(r).toMatchObject({ ok: false, failure: 'wrongAccount', open: b.address });
    expect(p.state.sent).toHaveLength(0);
  });

  it('the Pass: the linked account is the open one -> it is sent', async () => {
    const a = throwawayWallet();
    const p = fakePhantom([a]);
    install(p.win);
    expect(await payPassFromWallet(blockhashApi(), plan(a.address))).toEqual({ ok: true, signature: expect.any(String) });
    expect(p.state.sent).toHaveLength(1);
  });

  it('a market reservation: same rule, same answer', async () => {
    const a = throwawayWallet();
    const b = throwawayWallet();
    const p = fakePhantom([a, b]);
    install(p.win);
    p.pick(b, true);
    const r = await payReservationFromWallet(blockhashApi(), view(a.address), a.address);
    expect(r).toEqual({ ok: false, failure: 'wrongAccount', open: b.address });
    expect(p.state.sent).toHaveLength(0);
  });
});
