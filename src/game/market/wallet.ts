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
  signMessage?(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
}

export type WalletErrorKind = 'no_provider' | 'rejected' | 'wrong_account' | 'unsupported' | 'other';
export class WalletError extends Error {
  constructor(public readonly kind: WalletErrorKind) {
    super(`wallet_${kind}`);
    this.name = 'WalletError';
  }
}

/** What the game holds after "connect": the address and the two things it may ask the wallet. */
export interface SolWalletSession {
  name: string;
  address: string;
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

function standardSession(wallet: StdWallet, account: StdAccount): SolWalletSession {
  return {
    name: wallet.name,
    address: account.address,
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

/**
 * Asks the wallet to share an account (it shows its own approval). `want` is the address that must come back (the one linked to the account); without it the first account is used.
 * `preferred` is the wallet's name when the player picked one.
 */
export async function connectSolWallet(preferred?: string, want?: string, win: Window | undefined = typeof window === 'undefined' ? undefined : window): Promise<SolWalletSession> {
  if (!win) throw new WalletError('no_provider');
  await listSolWallets(win);
  const standard = registryFor(win).registry.wallets.filter(isSolanaWallet);
  const pick = (preferred ? standard.find((w) => w.name === preferred) : undefined) ?? standard.find((w) => w.name === 'Phantom') ?? standard.find((w) => w.name === 'Solflare') ?? standard[0];
  if (pick) {
    try {
      const connect = pick.features['standard:connect'];
      const result = connect ? await connect.connect() : { accounts: pick.accounts };
      const accounts = result.accounts.length > 0 ? result.accounts : pick.accounts;
      const account = want ? accounts.find((a) => a.address === want) : accounts[0];
      if (!account) throw new WalletError(accounts.length > 0 ? 'wrong_account' : 'other');
      return standardSession(pick, account);
    } catch (err) {
      throw classify(err);
    }
  }
  const legacy = legacyProviders(win);
  const chosen = (preferred ? legacy.find((p) => p.name === preferred) : undefined) ?? legacy[0];
  if (!chosen) throw new WalletError('no_provider');
  const session = await legacySession(chosen.name, chosen.provider);
  if (want && session.address !== want) throw new WalletError('wrong_account');
  return session;
}

/** A block explorer page of a transaction (solscan). */
export const explorerTxUrl = (cluster: Cluster, signature: string): string => `https://solscan.io/tx/${signature}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
/** A block explorer page of an address. */
export const explorerAddressUrl = (cluster: Cluster, address: string): string => `https://solscan.io/account/${address}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
