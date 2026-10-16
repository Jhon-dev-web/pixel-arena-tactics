import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletPort, runLinkFlow } from '../market/linkFlow';
import { MarketApi, MarketFn, createMarketApi } from '../market/api';
import { RETRY_REASONS, paymentDone, payReservationFromWallet, submitWithPolling } from '../market/payFlow';
import { StdWallet, WalletError, connectSolWallet, explorerAddressUrl, explorerTxUrl, listSolWallets } from '../market/wallet';
import { FEE_ADDRESS, USER_A, USER_B, WALLET, makeMarket, throwawayWallet } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import { addr, sig } from '../../../supabase/functions/_shared/__tests__/solanaFixtures';
import { decodeBase58 } from '../../../supabase/functions/_shared/chain/base58';
import { SYSTEM_PROGRAM_ID } from '../../../supabase/functions/_shared/chain/solana';
import { verifySolanaSignature } from '../../../supabase/functions/_shared/chain/solWallet';
import type { ReservationView } from '../../../supabase/functions/_shared/market/types';
import { parseLegacyTx, readU64 } from './solTxParse';

// The wallet side of the game with FAKE wallets (Wallet Standard objects on a fake window) and the real handlers behind the api: no browser, no extension, no network.

type Throwaway = ReturnType<typeof throwawayWallet>;
const bytes = (b58: string): Uint8Array => decodeBase58(b58) as Uint8Array;

/** A Wallet Standard wallet backed by an in-memory key. `log` records what the game asked it to do. */
function fakeStdWallet(name: string, w: Throwaway, log: { signed: string[]; sent: { chain: string; tx: Uint8Array }[] } = { signed: [], sent: [] }, over: { reject?: boolean; address?: string } = {}): StdWallet {
  const account = { address: over.address ?? w.address, publicKey: bytes(over.address ?? w.address), chains: ['solana:mainnet', 'solana:devnet'] };
  const refuse = () => {
    throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
  };
  return {
    name,
    chains: ['solana:mainnet', 'solana:devnet'],
    accounts: [],
    features: {
      'standard:connect': { connect: async () => (over.reject ? refuse() : { accounts: [account] }) },
      'solana:signMessage': {
        signMessage: async (input: { account: unknown; message: Uint8Array }) => {
          if (over.reject) refuse();
          const text = new TextDecoder().decode(input.message);
          log.signed.push(text);
          return [{ signedMessage: input.message, signature: bytes(w.sign(text)) }];
        },
      },
      'solana:signAndSendTransaction': {
        signAndSendTransaction: async (input: { account: unknown; transaction: Uint8Array; chain: string }) => {
          if (over.reject) refuse();
          log.sent.push({ chain: input.chain, tx: input.transaction });
          return [{ signature: new Uint8Array(64).fill(7) }];
        },
      },
    } as StdWallet['features'],
  };
}

/** A fake window: an EventTarget that answers the Wallet Standard handshake. `early` wallets are registered when the page announces itself. */
function fakeWindow(early: StdWallet[] = []): Window & EventTarget {
  const win = new EventTarget();
  win.addEventListener('wallet-standard:app-ready', (event) => (event as CustomEvent<{ register: (...w: StdWallet[]) => void }>).detail.register(...early));
  return win as unknown as Window & EventTarget;
}
const announceLate = (win: EventTarget, wallet: StdWallet) => win.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: (api: { register: (...w: StdWallet[]) => void }) => api.register(wallet) }));

describe('the wallet adapter (Wallet Standard: Phantom, Solflare)', () => {
  it('lists the Solana wallets the page was told about, Phantom and Solflare first, and ignores wallets that cannot sign messages', async () => {
    const w = throwawayWallet();
    const win = fakeWindow([fakeStdWallet('Backpack', w), fakeStdWallet('Solflare', w), fakeStdWallet('Phantom', w)]);
    const noSign: StdWallet = { name: 'Only Ethereum', chains: ['eip155:1'], accounts: [], features: { 'standard:connect': { connect: async () => ({ accounts: [] }) } } as StdWallet['features'] };
    announceLate(win, noSign);
    expect(await listSolWallets(win)).toEqual(['Phantom', 'Solflare', 'Backpack']);
  });

  it('a wallet that loads AFTER the page announced itself still shows up', async () => {
    const w = throwawayWallet();
    const win = fakeWindow();
    const first = listSolWallets(win);
    announceLate(win, fakeStdWallet('Phantom', w));
    expect(await first).toEqual(['Phantom']);
  });

  it('connects to the wallet the player picked and returns its address; no wallet at all is "no_provider"', async () => {
    const a = throwawayWallet();
    const b = throwawayWallet();
    const win = fakeWindow([fakeStdWallet('Phantom', a), fakeStdWallet('Solflare', b)]);
    expect((await connectSolWallet('Solflare', undefined, win)).address).toBe(b.address);
    expect((await connectSolWallet(undefined, undefined, win)).address).toBe(a.address); // Phantom by default
    await expect(connectSolWallet(undefined, undefined, fakeWindow())).rejects.toMatchObject({ kind: 'no_provider' });
    await expect(connectSolWallet(undefined, undefined, undefined)).rejects.toMatchObject({ kind: 'no_provider' });
  });

  it('insists on the account that is linked to the game: another one is "wrong_account"', async () => {
    const w = throwawayWallet();
    const win = fakeWindow([fakeStdWallet('Phantom', w)]);
    expect((await connectSolWallet(undefined, w.address, win)).address).toBe(w.address);
    await expect(connectSolWallet(undefined, addr(99), win)).rejects.toMatchObject({ kind: 'wrong_account' });
  });

  it('a refusal in the wallet is "rejected", in connect, in signMessage and in the payment', async () => {
    const w = throwawayWallet();
    await expect(connectSolWallet(undefined, undefined, fakeWindow([fakeStdWallet('Phantom', w, undefined, { reject: true })]))).rejects.toMatchObject({ kind: 'rejected' });
  });

  it('signMessage sends the UTF-8 bytes of the server\'s text and returns a base58 signature the server accepts', async () => {
    const w = throwawayWallet();
    const log = { signed: [] as string[], sent: [] };
    const session = await connectSolWallet(undefined, undefined, fakeWindow([fakeStdWallet('Phantom', w, log)]));
    const text = 'Arena Idle: olá\nNonce: 1';
    const signature = await session.signMessage(text);
    expect(log.signed).toEqual([text]);
    expect(verifySolanaSignature(text, signature, w.address)).toBe(true);
    expect(verifySolanaSignature(`${text}!`, signature, w.address)).toBe(false);
  });

  it('signAndSend hands the wallet the transaction bytes and the cluster, and returns the signature in base58', async () => {
    const w = throwawayWallet();
    const log = { signed: [] as string[], sent: [] as { chain: string; tx: Uint8Array }[] };
    const session = await connectSolWallet(undefined, undefined, fakeWindow([fakeStdWallet('Phantom', w, log)]));
    const tx = Uint8Array.of(1, 2, 3);
    expect(await session.signAndSend(tx, 'devnet')).toBe(sig(7));
    expect(await session.signAndSend(tx, 'mainnet-beta')).toBe(sig(7));
    expect(log.sent.map((s) => s.chain)).toEqual(['solana:devnet', 'solana:mainnet']);
    expect(Array.from(log.sent[0].tx)).toEqual([1, 2, 3]);
  });

  it('an older wallet (window.phantom.solana) can still LINK, but cannot pay', async () => {
    const w = throwawayWallet();
    const win = new EventTarget() as unknown as Window & EventTarget & { phantom?: unknown };
    win.phantom = {
      solana: {
        isPhantom: true,
        connect: async () => ({ publicKey: { toBase58: () => w.address } }),
        signMessage: async (message: Uint8Array) => ({ signature: bytes(w.sign(new TextDecoder().decode(message))) }),
      },
    };
    expect(await listSolWallets(win)).toEqual(['Phantom']);
    const session = await connectSolWallet(undefined, undefined, win);
    expect(session.address).toBe(w.address);
    expect(verifySolanaSignature('hello', await session.signMessage('hello'), w.address)).toBe(true);
    await expect(session.signAndSend(Uint8Array.of(1), 'devnet')).rejects.toMatchObject({ kind: 'unsupported' });
    await expect(connectSolWallet(undefined, addr(98), win)).rejects.toMatchObject({ kind: 'wrong_account' });
  });

  it('only ever asks the wallet for these three things, and no private key or seed is ever requested', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../market/wallet.ts', import.meta.url), 'utf8');
    const features = [...src.matchAll(/'((?:standard|solana):[A-Za-z]+)'/g)].map((m) => m[1]).filter((f) => !f.startsWith('solana:main') && !f.startsWith('solana:dev'));
    expect(new Set(features)).toEqual(new Set(['standard:connect', 'solana:signMessage', 'solana:signAndSendTransaction']));
    const code = src.replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/privateKey|secretKey|mnemonic|seed|eth_|personal_sign|signTransaction\b/i);
  });

  it('explorer links', () => {
    expect(explorerTxUrl('mainnet-beta', 'SIG')).toBe('https://solscan.io/tx/SIG');
    expect(explorerTxUrl('devnet', 'SIG')).toBe('https://solscan.io/tx/SIG?cluster=devnet');
    expect(explorerAddressUrl('devnet', 'ADDR')).toBe('https://solscan.io/account/ADDR?cluster=devnet');
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

  const portFor = (w: Throwaway, over: { connect?: WalletPort['connect']; sign?: (message: string) => Promise<string> } = {}): WalletPort => ({
    connect: over.connect ?? (async () => ({ address: w.address, signMessage: over.sign ?? (async (message: string) => w.sign(message)) })),
  });

  it('connect, sign the server\'s text, and the account is linked', async () => {
    const { m, api } = setup();
    const w = throwawayWallet();
    const steps: string[] = [];
    const r = await runLinkFlow(api(USER_A), undefined, portFor(w), (s) => steps.push(s));
    expect(r).toEqual({ ok: true, address: w.address });
    expect(steps).toEqual(['connecting', 'signing']);
    expect((await m.store.wallet(USER_A))?.address).toBe(w.address);
  });

  it('passes the wallet the player picked to the port', async () => {
    const { api } = setup();
    const w = throwawayWallet();
    const seen: (string | undefined)[] = [];
    await runLinkFlow(api(USER_A), 'Solflare', { connect: async (p) => (seen.push(p), { address: w.address, signMessage: async (t) => w.sign(t) }) });
    expect(seen).toEqual(['Solflare']);
  });

  it('a wallet that refuses, has another account, or does not exist leaves the account unlinked with a clear failure', async () => {
    const { m, api } = setup();
    const w = throwawayWallet();
    expect(await runLinkFlow(api(USER_A), undefined, portFor(w, { sign: async () => { throw new WalletError('rejected'); } }))).toEqual({ ok: false, failure: 'rejected' });
    expect(await runLinkFlow(api(USER_A), undefined, portFor(w, { connect: async () => { throw new WalletError('wrong_account'); } }))).toEqual({ ok: false, failure: 'wrongAccount' });
    expect(await runLinkFlow(api(USER_A), undefined, portFor(w, { connect: async () => { throw new WalletError('no_provider'); } }))).toEqual({ ok: false, failure: 'noProvider' });
    expect(await m.store.wallet(USER_A)).toBeNull();
  });

  it('a wallet that signs with a DIFFERENT key than the address it announced is refused by the server', async () => {
    const { m, api } = setup();
    const claimed = throwawayWallet();
    const other = throwawayWallet();
    const r = await runLinkFlow(api(USER_A), undefined, portFor(claimed, { sign: async (message) => other.sign(message) }));
    expect(r).toEqual({ ok: false, failure: 'badSignature' });
    expect(await m.store.wallet(USER_A)).toBeNull();
  });

  it('an address already linked to another account is "taken"', async () => {
    const { api } = setup();
    const w = throwawayWallet();
    expect((await runLinkFlow(api(USER_A), undefined, portFor(w))).ok).toBe(true);
    expect(await runLinkFlow(api(USER_B), undefined, portFor(w))).toEqual({ ok: false, failure: 'taken' });
  });

  it('no connection is "unreachable", never a thrown error', async () => {
    const down = createMarketApi(async () => {
      throw new Error('offline');
    });
    expect(await runLinkFlow(down, undefined, portFor(throwawayWallet()))).toEqual({ ok: false, failure: 'unreachable' });
  });
});

describe('paying a reservation', () => {
  const view = (over: Partial<ReservationView> = {}): ReservationView => ({
    id: 'r1',
    listingId: 'l1',
    status: 'pending',
    priceLamports: 1_000_000_000,
    feeLamports: 50_000_000,
    sellerLamports: 950_000_000,
    sellerAddress: WALLET[USER_A],
    feeAddress: FEE_ADDRESS,
    buyerAddress: WALLET[USER_B],
    expiresAt: '2026-11-02T12:30:00.000Z',
    graceUntil: '2026-11-02T14:30:00.000Z',
    payments: [],
    chain: { network: 'solana', cluster: 'devnet', chainId: 502, usdcMint: addr(77), livemode: false, feePercent: 5 },
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
  const SIGNATURE = sig(33);

  it('keeps asking while the network has not finalized the transaction, then reports the recorded payment', async () => {
    const api = apiReturning([
      { status: 409, body: { ok: false, reason: 'not_found_tx' } },
      { status: 409, body: { ok: false, reason: 'unconfirmed' } },
      { body: { ok: true, status: 'sold', certificateId: 'c9', reservation: view({ status: 'paid', payments: [{ leg: 'sale', signature: SIGNATURE, status: 'applied' }] }) } },
    ]);
    const pending: unknown[] = [];
    const out = await submitWithPolling(api, 'r1', SIGNATURE, { ...noSleep, onPending: (p) => pending.push(p) });
    expect(out).toMatchObject({ kind: 'recorded', status: 'sold', certificateId: 'c9' });
    expect(pending).toEqual([{ reason: 'not_found_tx' }, { reason: 'unconfirmed' }]);
    expect(paymentDone((out as { reservation: ReservationView }).reservation)).toBe(true);
    expect(paymentDone(view())).toBe(false);
  });

  it('stops at a final refusal (a short amount is not retried), at "unreachable", and when the screen closed', async () => {
    expect(await submitWithPolling(apiReturning([{ status: 409, body: { ok: false, reason: 'short_amount' } }]), 'r1', SIGNATURE, noSleep)).toEqual({ kind: 'refused', reason: 'short_amount' });
    const down = createMarketApi(async () => {
      throw new Error('offline');
    });
    expect(await submitWithPolling(down, 'r1', SIGNATURE, noSleep)).toEqual({ kind: 'unreachable' });
    const cancelled = vi.fn().mockReturnValue(true);
    expect(await submitWithPolling(apiReturning([{ body: { ok: true, status: 'sold', reservation: null } }]), 'r1', SIGNATURE, { ...noSleep, isCancelled: cancelled })).toEqual({ kind: 'stopped' });
  });

  it('gives up politely after its patience, nothing consumed', async () => {
    const out = await submitWithPolling(apiReturning([{ status: 409, body: { ok: false, reason: 'unconfirmed' } }]), 'r1', SIGNATURE, { ...noSleep, maxTries: 3 });
    expect(out).toMatchObject({ kind: 'pending', reason: 'unconfirmed' });
    expect(RETRY_REASONS.has('short_amount')).toBe(false);
    expect(RETRY_REASONS.has('unconfirmed')).toBe(true);
  });

  const prepareApi = (blockhash: string | null): MarketApi =>
    apiReturning([blockhash ? { body: { ok: true, blockhash, lastValidBlockHeight: 1 } } : { status: 503, body: { ok: false, reason: 'rpc_error' } }]);

  it('pays from the wallet with ONE transaction built from the SERVER\'s amounts, addresses and blockhash, never from anything the screen computed', async () => {
    const buyer = throwawayWallet();
    const log = { signed: [] as string[], sent: [] as { chain: string; tx: Uint8Array }[] };
    (globalThis as { window?: unknown }).window = fakeWindow([fakeStdWallet('Phantom', buyer, log)]);
    const r = await payReservationFromWallet(prepareApi(addr(5)), view({ buyerAddress: buyer.address }), buyer.address);
    expect(r).toEqual({ ok: true, signature: sig(7) });
    expect(log.sent).toHaveLength(1);
    expect(log.sent[0].chain).toBe('solana:devnet');
    const tx = parseLegacyTx(log.sent[0].tx);
    expect(tx).toMatchObject({ signatureSlots: 1, signaturesAreEmpty: true, blockhash: addr(5), exact: true });
    expect(tx.instructions.map((i) => i.program)).toEqual([SYSTEM_PROGRAM_ID, SYSTEM_PROGRAM_ID]);
    expect(tx.instructions.map((i) => i.accounts)).toEqual([[buyer.address, WALLET[USER_A]], [buyer.address, FEE_ADDRESS]]);
    expect(tx.instructions.map((i) => readU64(i.data, 4))).toEqual([950_000_000n, 50_000_000n]);
  });

  it('says why it could not pay: no wallet, a refusal, another account, an old wallet, the server has no blockhash, no connection', async () => {
    const buyer = throwawayWallet();
    (globalThis as { window?: unknown }).window = fakeWindow();
    expect(await payReservationFromWallet(prepareApi(addr(5)), view(), buyer.address)).toEqual({ ok: false, failure: 'noProvider' });
    (globalThis as { window?: unknown }).window = fakeWindow([fakeStdWallet('Phantom', buyer, undefined, { reject: true })]);
    expect(await payReservationFromWallet(prepareApi(addr(5)), view(), buyer.address)).toEqual({ ok: false, failure: 'rejected' });
    (globalThis as { window?: unknown }).window = fakeWindow([fakeStdWallet('Phantom', buyer)]);
    expect(await payReservationFromWallet(prepareApi(addr(5)), view(), addr(98))).toEqual({ ok: false, failure: 'wrongAccount' });
    expect(await payReservationFromWallet(prepareApi(null), view(), buyer.address)).toEqual({ ok: false, failure: 'blockhash' });
    const down = createMarketApi(async () => {
      throw new Error('offline');
    });
    expect(await payReservationFromWallet(down, view(), buyer.address)).toEqual({ ok: false, failure: 'unreachable' });
  });
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});
