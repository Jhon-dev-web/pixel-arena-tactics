import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletPort, runLinkFlow } from '../market/linkFlow';
import { MarketApi, MarketFn, createMarketApi } from '../market/api';
import { RETRY_REASONS, legDone, payLegFromWallet, submitWithPolling } from '../market/payFlow';
import { Eip1193Provider, WalletError, connectWallet, ensureChain, explorerTxUrl, sendUsdt, signMessage } from '../market/wallet';
import { FEE_ADDRESS, USER_A, USER_B, WALLET, makeMarket, throwawayWallet } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import { centsToUnits } from '../../../supabase/functions/_shared/chain/money';
import type { ReservationView } from '../../../supabase/functions/_shared/market/types';

// The wallet side of the game with a FAKE wallet (an EIP-1193 provider object) and the real handlers behind the api: no browser, no extension, no network.

const fakeProvider = (handlers: Record<string, (params?: unknown[]) => unknown>, seen: { method: string; params?: unknown }[] = []): Eip1193Provider => ({
  async request({ method, params }) {
    seen.push({ method, params });
    const h = handlers[method];
    if (!h) throw Object.assign(new Error('unsupported'), { code: 4200 });
    return h(params as unknown[]);
  },
});

const ADDR = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const HASH = `0x${'ab'.repeat(32)}`;

describe('the wallet adapter (window.ethereum, EIP-1193)', () => {
  it('connects, lowercasing the first account, and fails clearly without a wallet or on a refusal', async () => {
    expect(await connectWallet(fakeProvider({ eth_requestAccounts: () => [ADDR] }))).toBe(ADDR.toLowerCase());
    await expect(connectWallet(null)).rejects.toMatchObject({ kind: 'no_provider' });
    await expect(connectWallet(fakeProvider({ eth_requestAccounts: () => { throw Object.assign(new Error('no'), { code: 4001 }); } }))).rejects.toMatchObject({ kind: 'rejected' });
    await expect(connectWallet(fakeProvider({ eth_requestAccounts: () => [] }))).rejects.toBeInstanceOf(WalletError);
    await expect(connectWallet(fakeProvider({ eth_requestAccounts: () => ['nope'] }))).rejects.toBeInstanceOf(WalletError);
  });

  it('switches to the chain the server uses, adds it when the wallet has never seen it, and says so when it cannot', async () => {
    const seen: { method: string; params?: unknown }[] = [];
    await ensureChain(97, fakeProvider({ wallet_switchEthereumChain: () => null }, seen));
    expect(seen[0]).toEqual({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x61' }] });
    const added: unknown[] = [];
    await ensureChain(56, fakeProvider({ wallet_switchEthereumChain: () => { throw Object.assign(new Error('unknown chain'), { code: 4902 }); }, wallet_addEthereumChain: (p) => added.push(p) }));
    expect(added[0]).toMatchObject([{ chainId: '0x38', chainName: 'BNB Smart Chain', nativeCurrency: { symbol: 'BNB', decimals: 18 } }]);
    await expect(ensureChain(56, fakeProvider({ wallet_switchEthereumChain: () => { throw Object.assign(new Error('x'), { code: -32000 }); } }))).rejects.toMatchObject({ kind: 'wrong_chain' });
    await expect(ensureChain(56, fakeProvider({ wallet_switchEthereumChain: () => { throw Object.assign(new Error('x'), { code: 4001 }); } }))).rejects.toMatchObject({ kind: 'rejected' });
  });

  it('asks the wallet to sign the text as hex UTF-8 (personal_sign), nothing else', async () => {
    const seen: { method: string; params?: unknown }[] = [];
    const sig = `0x${'11'.repeat(65)}`;
    expect(await signMessage(ADDR, 'olá', fakeProvider({ personal_sign: () => sig }, seen))).toBe(sig);
    expect(seen).toEqual([{ method: 'personal_sign', params: ['0x6f6cc3a1', ADDR] }]);
    await expect(signMessage(ADDR, 'x', fakeProvider({ personal_sign: () => '0x12' }))).rejects.toBeInstanceOf(WalletError);
  });

  it('asks for exactly one USDT.transfer(to, amount) with value 0, to the token contract, and returns the hash', async () => {
    const seen: { method: string; params?: unknown }[] = [];
    const hash = await sendUsdt(ADDR, '0x5555555555555555555555555555555555555555', FEE_ADDRESS, centsToUnits(1234), fakeProvider({ eth_sendTransaction: () => HASH.toUpperCase().replace('0X', '0x') }, seen));
    expect(hash).toBe(HASH);
    const tx = (seen[0].params as Record<string, string>[])[0];
    expect(tx).toMatchObject({ from: ADDR, to: '0x5555555555555555555555555555555555555555', value: '0x0' });
    expect(tx.data.startsWith('0xa9059cbb')).toBe(true);
    expect(BigInt(`0x${tx.data.slice(74)}`)).toBe(centsToUnits(1234));
    expect(tx.data.slice(10, 74)).toBe(FEE_ADDRESS.slice(2).padStart(64, '0'));
    await expect(sendUsdt(ADDR, '0x5555555555555555555555555555555555555555', FEE_ADDRESS, 1n, fakeProvider({ eth_sendTransaction: () => 'oops' }))).rejects.toBeInstanceOf(WalletError);
  });

  it('only ever uses these five wallet methods', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../market/wallet.ts', import.meta.url), 'utf8');
    const methods = [...src.matchAll(/(?:method: |request[<(][^,]*?, |request<[^>]*>\(p, )'([a-z_A-Z]+)'/g)].map((m) => m[1]);
    expect(new Set(methods)).toEqual(new Set(['eth_requestAccounts', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'personal_sign', 'eth_sendTransaction']));
  });

  it('explorer links', () => {
    expect(explorerTxUrl(56, HASH)).toBe(`https://bscscan.com/tx/${HASH}`);
    expect(explorerTxUrl(97, HASH)).toBe(`https://testnet.bscscan.com/tx/${HASH}`);
  });
});

describe('linking a wallet through the real market-wallet handler', () => {
  const setup = () => {
    const m = makeMarket();
    const transport = (userId: string) => async (fn: MarketFn, body: object) => {
      const run = fn === 'market-wallet' ? m.wallet : fn === 'market-list' ? m.list : fn === 'market-buy' ? m.buy : fn === 'market-my' ? m.my : m.pass;
      return run(body, userId);
    };
    return { m, api: (u: string): MarketApi => createMarketApi(transport(u)) };
  };

  const portFor = (w: ReturnType<typeof throwawayWallet>, over: Partial<WalletPort> = {}): WalletPort => ({ connect: async () => w.address, ensureChain: async () => undefined, sign: async (_a, message) => w.sign(message), ...over });

  it('connect, switch chain, sign the server\'s text, and the account is linked', async () => {
    const { m, api } = setup();
    const w = throwawayWallet();
    const steps: string[] = [];
    const r = await runLinkFlow(api(USER_A), 97, portFor(w), (s) => steps.push(s));
    expect(r).toEqual({ ok: true, address: w.address });
    expect(steps).toEqual(['connecting', 'signing']);
    expect((await m.store.wallet(USER_A))?.address).toBe(w.address);
  });

  it('a wallet that refuses, has the wrong chain, or does not exist leaves the account unlinked with a clear failure', async () => {
    const { m, api } = setup();
    const w = throwawayWallet();
    expect(await runLinkFlow(api(USER_A), 97, portFor(w, { sign: async () => { throw new WalletError('rejected'); } }))).toEqual({ ok: false, failure: 'rejected' });
    expect(await runLinkFlow(api(USER_A), 97, portFor(w, { ensureChain: async () => { throw new WalletError('wrong_chain'); } }))).toEqual({ ok: false, failure: 'wrongChain' });
    expect(await runLinkFlow(api(USER_A), 97, portFor(w, { connect: async () => { throw new WalletError('no_provider'); } }))).toEqual({ ok: false, failure: 'noProvider' });
    expect(await m.store.wallet(USER_A)).toBeNull();
  });

  it('a wallet that signs with a DIFFERENT key than the address it announced is refused by the server', async () => {
    const { m, api } = setup();
    const claimed = throwawayWallet();
    const other = throwawayWallet();
    const r = await runLinkFlow(api(USER_A), 97, portFor(claimed, { sign: async (_a, message) => other.sign(message) }));
    expect(r).toEqual({ ok: false, failure: 'badSignature' });
    expect(await m.store.wallet(USER_A)).toBeNull();
  });

  it('an address already linked to another account is "taken"', async () => {
    const { api } = setup();
    const w = throwawayWallet();
    expect((await runLinkFlow(api(USER_A), 97, portFor(w))).ok).toBe(true);
    expect(await runLinkFlow(api(USER_B), 97, portFor(w))).toEqual({ ok: false, failure: 'taken' });
  });

  it('no connection is "unreachable", never a thrown error', async () => {
    const down = createMarketApi(async () => {
      throw new Error('offline');
    });
    expect(await runLinkFlow(down, 97, portFor(throwawayWallet()))).toEqual({ ok: false, failure: 'unreachable' });
  });
});

describe('paying a reservation', () => {
  const view = (over: Partial<ReservationView> = {}): ReservationView => ({
    id: 'r1',
    listingId: 'l1',
    status: 'pending',
    priceCents: 1000,
    feeCents: 50,
    sellerCents: 950,
    sellerAddress: WALLET[USER_A],
    feeAddress: FEE_ADDRESS,
    buyerAddress: WALLET[USER_B],
    expiresAt: '2026-11-02T12:30:00.000Z',
    graceUntil: '2026-11-02T14:30:00.000Z',
    payments: [],
    chain: { chainId: 97, usdtContract: '0x5555555555555555555555555555555555555555', minConfirmations: 15, livemode: false, feePercent: 5 },
    ...over,
  });

  const apiReturning = (answers: { status?: number; body: Record<string, unknown> }[]): MarketApi => {
    let i = 0;
    return createMarketApi(async () => {
      const a = answers[Math.min(i++, answers.length - 1)];
      return { status: a.status ?? 200, body: a.body };
    });
  };
  const noSleep = { intervalMs: 0, sleep: async () => undefined };

  it('keeps asking while the network is not ready, then reports the recorded payment', async () => {
    const api = apiReturning([
      { status: 409, body: { ok: false, reason: 'not_found_tx' } },
      { status: 409, body: { ok: false, reason: 'unconfirmed', confirmations: 6, needed: 15 } },
      { body: { ok: true, status: 'recorded', reservation: view({ payments: [{ leg: 'fee', txHash: HASH, status: 'applied' }] }) } },
    ]);
    const pending: unknown[] = [];
    const out = await submitWithPolling(api, 'r1', 'fee', HASH, { ...noSleep, onPending: (p) => pending.push(p) });
    expect(out).toMatchObject({ kind: 'recorded', status: 'recorded' });
    expect(pending).toEqual([{ reason: 'not_found_tx' }, { reason: 'unconfirmed', confirmations: 6, needed: 15 }]);
    expect(legDone((out as { reservation: ReservationView }).reservation, 'fee')).toBe(true);
    expect(legDone((out as { reservation: ReservationView }).reservation, 'seller')).toBe(false);
  });

  it('stops at a final refusal (a short amount is not retried), at "unreachable", and when the screen closed', async () => {
    expect(await submitWithPolling(apiReturning([{ status: 409, body: { ok: false, reason: 'short_amount' } }]), 'r1', 'fee', HASH, noSleep)).toEqual({ kind: 'refused', reason: 'short_amount' });
    const down = createMarketApi(async () => {
      throw new Error('offline');
    });
    expect(await submitWithPolling(down, 'r1', 'fee', HASH, noSleep)).toEqual({ kind: 'unreachable' });
    const cancelled = vi.fn().mockReturnValue(true);
    expect(await submitWithPolling(apiReturning([{ body: { ok: true, status: 'recorded', reservation: null } }]), 'r1', 'fee', HASH, { ...noSleep, isCancelled: cancelled })).toEqual({ kind: 'stopped' });
  });

  it('gives up politely after its patience, nothing consumed', async () => {
    const out = await submitWithPolling(apiReturning([{ status: 409, body: { ok: false, reason: 'unconfirmed', confirmations: 2, needed: 15 } }]), 'r1', 'fee', HASH, { ...noSleep, maxTries: 3 });
    expect(out).toMatchObject({ kind: 'pending', reason: 'unconfirmed' });
    expect(RETRY_REASONS.has('short_amount')).toBe(false);
  });

  it('pays a leg from the wallet with the SERVER\'s amount and address, never one the screen computed', async () => {
    const sent: { to: string; data: string }[] = [];
    (globalThis as { ethereum?: Eip1193Provider }).ethereum = fakeProvider({
      eth_sendTransaction: (p) => {
        sent.push((p as { to: string; data: string }[])[0]);
        return HASH;
      },
    });
    try {
      const r = await payLegFromWallet(view(), 'seller', WALLET[USER_B]);
      expect(r).toEqual({ ok: true, txHash: HASH });
      expect(sent[0].to).toBe('0x5555555555555555555555555555555555555555');
      expect(sent[0].data.slice(10, 74)).toBe(WALLET[USER_A].slice(2).padStart(64, '0'));
      expect(BigInt(`0x${sent[0].data.slice(74)}`)).toBe(centsToUnits(950));
      (globalThis as { ethereum?: Eip1193Provider }).ethereum = fakeProvider({ eth_sendTransaction: () => { throw Object.assign(new Error('rejected'), { code: 4001 }); } });
      expect(await payLegFromWallet(view(), 'fee', WALLET[USER_B])).toEqual({ ok: false, failure: 'rejected' });
      delete (globalThis as { ethereum?: Eip1193Provider }).ethereum;
      expect(await payLegFromWallet(view(), 'fee', WALLET[USER_B])).toEqual({ ok: false, failure: 'noProvider' });
    } finally {
      delete (globalThis as { ethereum?: Eip1193Provider }).ethereum;
    }
  });
});

afterEach(() => {
  delete (globalThis as { ethereum?: Eip1193Provider }).ethereum;
});
