import { ed25519 } from '@noble/curves/ed25519';
import { associatedTokenAddress } from '../chain/ata.ts';
import { encodeBase58 } from '../chain/base58.ts';
import { SOLANA_GENESIS_HASHES } from '../chain/solana.ts';
import { MarketChain } from '../market/chainEnv.ts';
import type { MarketDeps } from '../market/deps.ts';
import { handleMarketBuy, handleMarketList, handleMarketMy } from '../market/handler.ts';
import { handleMarketWallet } from '../market/walletHandler.ts';
import { PassCryptoChain, handlePassCrypto } from '../market/passCrypto.ts';
import { authFetch, bearer, USER_A, USER_B } from './fakeItemStore.ts';
import { FakeMarketStore } from './fakeMarketStore.ts';
import { DEVNET, FakeSolana, addr } from './solanaFixtures.ts';

export { USER_A, USER_B };
export const USER_C = '33333333-3333-4333-8333-333333333333';
export const USER_D = '44444444-4444-4444-8444-444444444444';

export const FEE_ADDRESS = addr(30);
export const PASS_ADDRESS = addr(31);
export const WALLET: Record<string, string> = {
  [USER_A]: addr(11),
  [USER_B]: addr(12),
  [USER_C]: addr(13),
  [USER_D]: addr(14),
};

/** The harness runs on devnet (livemode false), like the owner's first test. */
export const CONFIG = DEVNET;

export function makeMarket(opts: { chain?: boolean; passPriceUnits?: number } = {}) {
  const store = new FakeMarketStore();
  const chain = new FakeSolana(() => store.nowMs);
  chain.genesis = SOLANA_GENESIS_HASHES.devnet;
  chain.accounts.add(associatedTokenAddress(PASS_ADDRESS, CONFIG.usdcMint)); // the owner created the receiving USDC account
  let nonceCounter = 0;
  const usd: { value: number | null } = { value: null };
  const marketChain: MarketChain = { config: CONFIG, rpc: chain, feeAddress: FEE_ADDRESS };
  const deps: MarketDeps = {
    auth: { supabaseUrl: 'https://example.invalid', anonKey: 'anon-key-for-tests', fetchFn: authFetch },
    allowedOrigins: ['https://play.example'],
    store,
    nowMs: () => store.nowMs,
    chain: () => (opts.chain === false ? null : marketChain),
    nonce: () => `nonce-${String(++nonceCounter).padStart(8, '0')}`,
    solUsd: async () => usd.value,
  };
  const passChain: PassCryptoChain = { config: CONFIG, rpc: chain, receiveAddress: PASS_ADDRESS, priceUnits: opts.passPriceUnits ?? 10_000_000 };
  const request = (body: unknown, userId: string | null) =>
    new Request('https://example.invalid/fn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://play.example', ...(userId ? { authorization: bearer(userId) } : {}) },
      body: JSON.stringify(body),
    });
  const run = (handler: (req: Request, d: MarketDeps) => Promise<Response>) => async (body: unknown, userId: string | null = USER_A) => {
    const res = await handler(request(body, userId), deps);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return {
    store,
    chain,
    deps,
    usd,
    passChain,
    wallet: run(handleMarketWallet),
    list: run(handleMarketList),
    buy: run(handleMarketBuy),
    my: run(handleMarketMy),
    pass: async (body: unknown, userId: string | null = USER_A) => {
      const res = await handlePassCrypto(request(body, userId), { auth: deps.auth, allowedOrigins: deps.allowedOrigins, store, nowMs: deps.nowMs, pass: () => passChain });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    /** Gives the user a linked wallet (the address in WALLET) without going through the signature. */
    link(userId: string) {
      store.linkWallet(userId, WALLET[userId]);
    },
  };
}

/** A throwaway wallet made in memory (never written anywhere): signs the message the server wrote, like Phantom's signMessage. */
export function throwawayWallet() {
  const priv = ed25519.utils.randomPrivateKey();
  const address = encodeBase58(ed25519.getPublicKey(priv));
  const sign = (message: string): string => encodeBase58(ed25519.sign(new TextEncoder().encode(message), priv));
  return { address, sign };
}
