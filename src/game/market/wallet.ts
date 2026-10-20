import { decodeBase58, encodeBase58 } from '../../../supabase/functions/_shared/chain/base58';

// The player's OWN Solana wallet (Phantom, Solflare...) through the Wallet Standard (https://github.com/wallet-standard/wallet-standard), the protocol every modern Solana wallet speaks: the page
// announces itself with the event "wallet-standard:app-ready" and wallets answer with "wallet-standard:register-wallet". The game only ASKS the wallet to do two things: sign a short readable message
// (to prove he owns the address) and sign-and-send ONE transaction he approves on the wallet's own screen. The game NEVER asks for, receives or stores a private key or a seed phrase, and there is no
// field anywhere that could take one. No Solana SDK is used: the messages are plain bytes.
//
// A wallet that predates the standard still works for LINKING (window.phantom.solana / window.solflare / window.solana `connect` + `signMessage`); it cannot pay, because its transaction API takes
// objects of a web3.js class this game does not load, so the screen then asks him to update the wallet.

type Cluster = 'mainnet-beta' | 'devnet';

interface StdAccount {
  address: string;
  publicKey: Uint8Array;
  chains?: readonly string[];
}
interface StdFeatures {
  'standard:connect'?: { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly StdAccount[] }> };
  /** drops the page's authorisation: the next connect() asks the wallet again and answers with the account selected NOW */
  'standard:disconnect'?: { disconnect(): Promise<void> };
  /** 'change' fires with the new `accounts` when the player picks another account in the extension */
  'standard:events'?: { on(event: 'change', listener: (properties: { accounts?: readonly StdAccount[] }) => void): () => void };
  'solana:signMessage'?: { signMessage(...inputs: { account: StdAccount; message: Uint8Array }[]): Promise<{ signedMessage: Uint8Array; signature: Uint8Array }[]> };
  'solana:signAndSendTransaction'?: { signAndSendTransaction(...inputs: { account: StdAccount; transaction: Uint8Array; chain: string }[]): Promise<{ signature: Uint8Array }[]> };
}
export interface StdWallet {
  name: string;
  chains: readonly string[];
  features: StdFeatures & Record<string, unknown>;
  accounts: readonly StdAccount[];
}

interface LegacyProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toBase58(): string } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } } | void>;
  disconnect?(): Promise<void>;
  on?(event: string, listener: (publicKey?: { toBase58(): string } | null) => void): void;
  off?(event: string, listener: (publicKey?: { toBase58(): string } | null) => void): void;
  removeListener?(event: string, listener: (publicKey?: { toBase58(): string } | null) => void): void;
  signMessage?(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
}

export type WalletErrorKind = 'no_provider' | 'rejected' | 'wrong_account' | 'unsupported' | 'other';
export class WalletError extends Error {
  /** `open`, for 'wrong_account': the address of the account that is open in the wallet right now */
  constructor(
    public readonly kind: WalletErrorKind,
    public readonly open?: string,
  ) {
    super(`wallet_${kind}`);
    this.name = 'WalletError';
  }
}

/** What the game holds after "connect": the address and the two things it may ask the wallet. */
export interface SolWalletSession {
  name: string;
  address: string;
  /** the account that is selected in the wallet RIGHT NOW (the wallet keeps it current when the player switches), or null when the wallet shows none */
  currentAddress(): string | null;
  /** calls back when the player switches account in the wallet (or disconnects: null); returns the unsubscribe */
  onAccountChange(listener: (address: string | null) => void): () => void;
  /** the signature, base58 */
  signMessage(message: string): Promise<string>;
  /** signs and SENDS one serialised transaction (empty signature slot); resolves with its signature, base58 */
  signAndSend(transaction: Uint8Array, cluster: Cluster): Promise<string>;
}

function classify(err: unknown): WalletError {
  if (err instanceof WalletError) return err;
  const e = err as { code?: number; message?: string } | null;
  if (e?.code === 4001 || /reject|denied|declin|cancel/i.test(e?.message ?? '')) return new WalletError('rejected');
  return new WalletError('other');
}

// ---- discovery (Wallet Standard) -----------------------------------------------------------------------------------------------------------------------------------------

// One registry per window (so a test can use a fake window): the wallets that announced themselves.
interface Registry {
  wallets: StdWallet[];
}
const registries = new WeakMap<object, Registry>();

function registryFor(win: Window): { registry: Registry; isNew: boolean } {
  const had = registries.get(win);
  if (had) return { registry: had, isNew: false };
  const registry: Registry = { wallets: [] };
  registries.set(win, registry);
  const api = {
    register: (...wallets: StdWallet[]) => {
      for (const w of wallets) if (!registry.wallets.includes(w)) registry.wallets.push(w);
      return () => undefined;
    },
  };
  // a wallet that loads later announces itself and hands us a callback
  win.addEventListener('wallet-standard:register-wallet', (event) => {
    try {
      (event as CustomEvent<(api: unknown) => void>).detail(api);
    } catch {
      /* a broken wallet is skipped */
    }
  });
  // a wallet that loaded first hears us
  try {
    win.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch {
    /* no CustomEvent: no standard wallets */
  }
  return { registry, isNew: true };
}

const isSolanaWallet = (w: StdWallet): boolean => !!w.features['standard:connect'] && !!w.features['solana:signMessage'] && (w.chains ?? []).some((c) => c.startsWith('solana:'));

/** The Solana wallets this browser announced, Phantom and Solflare first. Waits a moment the first time, because wallets answer asynchronously. */
export async function listSolWallets(win: Window | undefined = typeof window === 'undefined' ? undefined : window): Promise<string[]> {
  if (!win) return [];
  const { registry, isNew } = registryFor(win);
  if (isNew) await new Promise((r) => setTimeout(r, 150));
  const names = registry.wallets.filter(isSolanaWallet).map((w) => w.name);
  const rank = (n: string) => (n === 'Phantom' ? 0 : n === 'Solflare' ? 1 : 2);
  const legacy = names.length === 0 ? legacyProviders(win).map((p) => p.name) : [];
  return [...new Set([...names, ...legacy])].sort((a, b) => rank(a) - rank(b));
}

function legacyProviders(win: Window): { name: string; provider: LegacyProvider }[] {
  const w = win as unknown as { phantom?: { solana?: LegacyProvider }; solflare?: LegacyProvider; solana?: LegacyProvider };
  const out: { name: string; provider: LegacyProvider }[] = [];
  if (w.phantom?.solana?.connect) out.push({ name: 'Phantom', provider: w.phantom.solana });
  if (w.solflare?.connect) out.push({ name: 'Solflare', provider: w.solflare });
  if (out.length === 0 && w.solana?.connect) out.push({ name: w.solana.isPhantom ? 'Phantom' : w.solana.isSolflare ? 'Solflare' : 'Wallet', provider: w.solana });
  return out;
}

const chainOf = (cluster: Cluster): string => (cluster === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet');

function subscribeStd(wallet: StdWallet, listener: (address: string | null, walletName?: string) => void): () => void {
  const events = wallet.features['standard:events'];
  if (!events) return () => undefined;
  try {
    return events.on('change', (properties) => {
      if (properties?.accounts) listener(properties.accounts.length > 0 ? properties.accounts[0].address : null, wallet.name);
    });
  } catch {
    return () => undefined;
  }
}

function subscribeLegacy(provider: LegacyProvider, listener: (address: string | null, walletName?: string) => void, name?: string): () => void {
  if (typeof provider.on !== 'function') return () => undefined;
  const moved = (pk?: { toBase58(): string } | null) => listener(pk ? pk.toBase58() : null, name);
  const gone = () => listener(null, name);
  provider.on('accountChanged', moved);
  provider.on('disconnect', gone);
  return () => {
    const off = provider.off ?? provider.removeListener;
    try {
      off?.call(provider, 'accountChanged', moved);
      off?.call(provider, 'disconnect', gone);
    } catch {
      /* nothing to undo */
    }
  };
}

function standardSession(wallet: StdWallet, account: StdAccount): SolWalletSession {
  return {
    name: wallet.name,
    address: account.address,
    currentAddress: () => (wallet.accounts.length > 0 ? wallet.accounts[0].address : account.address),
    onAccountChange: (listener) => subscribeStd(wallet, listener),
    async signMessage(message) {
      const feature = wallet.features['solana:signMessage'];
      if (!feature) throw new WalletError('unsupported');
      try {
        const [out] = await feature.signMessage({ account, message: new TextEncoder().encode(message) });
        if (!out || !(out.signature instanceof Uint8Array) || out.signature.length !== 64) throw new WalletError('other');
        return encodeBase58(out.signature);
      } catch (err) {
        throw classify(err);
      }
    },
    async signAndSend(transaction, cluster) {
      const feature = wallet.features['solana:signAndSendTransaction'];
      if (!feature) throw new WalletError('unsupported');
      try {
        const [out] = await feature.signAndSendTransaction({ account, transaction, chain: chainOf(cluster) });
        if (!out || !(out.signature instanceof Uint8Array) || out.signature.length !== 64) throw new WalletError('other');
        return encodeBase58(out.signature);
      } catch (err) {
        throw classify(err);
      }
    },
  };
}

function legacySession(name: string, provider: LegacyProvider): Promise<SolWalletSession> {
  return (async () => {
    try {
      const res = await provider.connect();
      const pk = (res && 'publicKey' in res ? res.publicKey : provider.publicKey) ?? null;
      const address = pk?.toBase58();
      if (!address || !decodeBase58(address)) throw new WalletError('other');
      return {
        name,
        address,
        currentAddress: () => provider.publicKey?.toBase58() ?? address,
        onAccountChange: (listener) => subscribeLegacy(provider, listener),
        async signMessage(message: string) {
          if (!provider.signMessage) throw new WalletError('unsupported');
          try {
            const out = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
            const sig = out instanceof Uint8Array ? out : out.signature;
            if (!(sig instanceof Uint8Array) || sig.length !== 64) throw new WalletError('other');
            return encodeBase58(sig);
          } catch (err) {
            throw classify(err);
          }
        },
        async signAndSend() {
          throw new WalletError('unsupported');
        },
      };
    } catch (err) {
      throw classify(err);
    }
  })();
}

/** The wallet the player picked (Phantom by default, then Solflare, then any other standard one), or undefined. */
function pickStandard(win: Window, preferred?: string): StdWallet | undefined {
  const standard = registryFor(win).registry.wallets.filter(isSolanaWallet);
  return (preferred ? standard.find((w) => w.name === preferred) : undefined) ?? standard.find((w) => w.name === 'Phantom') ?? standard.find((w) => w.name === 'Solflare') ?? standard[0];
}

function pickLegacy(win: Window, preferred?: string): { name: string; provider: LegacyProvider } | undefined {
  const legacy = legacyProviders(win);
  return (preferred ? legacy.find((p) => p.name === preferred) : undefined) ?? legacy[0];
}

/** Drops the page's authorisation with the wallet (best effort: a wallet without the feature, or one that refuses, is simply left as it is). */
async function disconnectWallet(standard: StdWallet | undefined, legacy: LegacyProvider | undefined): Promise<void> {
  try {
    if (standard) await standard.features['standard:disconnect']?.disconnect();
    else if (legacy && typeof legacy.disconnect === 'function') await legacy.disconnect();
  } catch {
    /* it was not connected, or the wallet does not care: connecting next asks again anyway */
  }
}

/**
 * Asks the wallet to share an account (it shows its own approval). `want` is the address that must come back (the one linked to the account); without it the first account is used.
 * `preferred` is the wallet's name when the player picked one.
 *
 * `fresh` is for LINKING. A wallet that is already connected to the page answers connect() with the account the player approved EARLIER, even after he switched to another account in the
 * extension: that is why "change wallet" kept the old address. With `fresh` the session is first disconnected (`standard:disconnect`, or the legacy `disconnect`), so connect() asks the wallet again
 * and answers with the account that is selected now. Without it (paying) no extra approval is asked, but the account the wallet shows NOW is what counts: a different one than `want` is
 * "wrong_account", carrying the address that is open.
 */
export async function connectSolWallet(preferred?: string, want?: string, win: Window | undefined = typeof window === 'undefined' ? undefined : window, fresh = false): Promise<SolWalletSession> {
  if (!win) throw new WalletError('no_provider');
  await listSolWallets(win);
  const pick = pickStandard(win, preferred);
  if (pick) {
    try {
      if (fresh) await disconnectWallet(pick, undefined);
      const connect = pick.features['standard:connect'];
      const result = connect ? await connect.connect() : { accounts: pick.accounts };
      // the wallet keeps `accounts` current when the player switches; the answer of connect() can be the older authorisation
      const accounts = pick.accounts.length > 0 ? pick.accounts : result.accounts;
      if (accounts.length === 0) throw new WalletError('other');
      const account = want ? accounts.find((a) => a.address === want) : accounts[0];
      if (!account) throw new WalletError('wrong_account', accounts[0].address);
      return standardSession(pick, account);
    } catch (err) {
      throw classify(err);
    }
  }
  const chosen = pickLegacy(win, preferred);
  if (!chosen) throw new WalletError('no_provider');
  if (fresh) await disconnectWallet(undefined, chosen.provider);
  const session = await legacySession(chosen.name, chosen.provider);
  if (want && session.address !== want) throw new WalletError('wrong_account', session.address);
  return session;
}

/**
 * Follows the account that is open in the wallet: calls `onChange` with it now (when the wallet already shares one with this page) and again every time the player switches or disconnects.
 * It never asks the wallet for approval. Resolves with the unsubscribe. Nothing is sent anywhere.
 */
export async function watchOpenAccount(onChange: (address: string | null, walletName?: string) => void, preferred?: string, win: Window | undefined = typeof window === 'undefined' ? undefined : window): Promise<() => void> {
  if (!win) return () => undefined;
  await listSolWallets(win);
  const pick = pickStandard(win, preferred);
  if (pick) {
    if (pick.accounts.length > 0) onChange(pick.accounts[0].address, pick.name);
    else {
      try {
        const quiet = await pick.features['standard:connect']?.connect({ silent: true });
        if (quiet && quiet.accounts.length > 0) onChange(quiet.accounts[0].address, pick.name);
      } catch {
        /* the wallet does not know this page yet: nothing is open for it */
      }
    }
    return subscribeStd(pick, onChange);
  }
  const chosen = pickLegacy(win, preferred);
  if (!chosen) return () => undefined;
  const known = chosen.provider.publicKey?.toBase58();
  if (known) onChange(known, chosen.name);
  return subscribeLegacy(chosen.provider, onChange, chosen.name);
}

/** Throws "wrong_account" (with the open address) when the wallet is showing a different account than `want`. Call it right before asking the wallet to sign a payment. */
export function assertOpenAccount(session: SolWalletSession, want: string): void {
  const open = session.currentAddress();
  if (open !== null && open !== want) throw new WalletError('wrong_account', open);
}

/** A block explorer page of a transaction (solscan). */
export const explorerTxUrl = (cluster: Cluster, signature: string): string => `https://solscan.io/tx/${signature}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
/** A block explorer page of an address. */
export const explorerAddressUrl = (cluster: Cluster, address: string): string => `https://solscan.io/account/${address}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
