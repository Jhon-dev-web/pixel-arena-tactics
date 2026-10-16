import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { TRANSFER_TOPIC, RpcClient } from '../chain/bsc.ts';
import { ChainConfig } from '../chain/config.ts';
import { centsToUnits } from '../chain/money.ts';
import { MarketChain } from '../market/chainEnv.ts';
import type { MarketDeps } from '../market/deps.ts';
import { handleMarketBuy, handleMarketList, handleMarketMy } from '../market/handler.ts';
import { handleMarketWallet } from '../market/walletHandler.ts';
import { PassCryptoChain, handlePassCrypto } from '../market/passCrypto.ts';
import { authFetch, bearer, USER_A, USER_B } from './fakeItemStore.ts';
import { FakeMarketStore } from './fakeMarketStore.ts';

export { USER_A, USER_B };
export const USER_C = '33333333-3333-4333-8333-333333333333';
export const USER_D = '44444444-4444-4444-8444-444444444444';

export const TOKEN = '0x5555555555555555555555555555555555555555';
export const FEE_ADDRESS = '0x3333333333333333333333333333333333333333';
export const PASS_ADDRESS = '0x6666666666666666666666666666666666666666';
export const WALLET: Record<string, string> = {
  [USER_A]: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  [USER_B]: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2',
  [USER_C]: '0xccccccccccccccccccccccccccccccccccccccc3',
  [USER_D]: '0xddddddddddddddddddddddddddddddddddddddd4',
};

export const CONFIG: ChainConfig = { chainId: 97, usdtContract: TOKEN, minConfirmations: 15, livemode: false };
const BLOCK = 40_000_000;

const pad = (addr: string): string => `0x${addr.slice(2).padStart(64, '0')}`;
const word = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;

interface Tx {
  from: string;
  to: string;
  value: bigint;
  emitter: string;
  blockTimeSec: number;
  blockNumber: number;
  status: '0x1' | '0x0';
}

/** A fake BSC node with a ledger the tests write transfers into. Counts calls; can hold every receipt answer until released (to interleave two requests). */
export class FakeChain implements RpcClient {
  txs = new Map<string, Tx>();
  latest = BLOCK + 100;
  calls = 0;
  chainId = 97;
  down = false;
  gate: Promise<void> | null = null;
  private n = 0;

  constructor(private readonly clock: () => number) {}

  /** Writes a confirmed USDT transfer into the ledger and returns its hash. */
  pay(from: string, to: string, cents: number, over: Partial<Tx> = {}): string {
    this.n++;
    const hash = `0x${this.n.toString(16).padStart(64, '0')}`;
    this.txs.set(hash, { from, to, value: centsToUnits(cents), emitter: TOKEN, blockTimeSec: Math.floor(this.clock() / 1000), blockNumber: BLOCK + this.n, status: '0x1', ...over });
    return hash;
  }

  async call(method: string, params: unknown[]): Promise<unknown> {
    this.calls++;
    if (this.down) throw new Error('rpc_down');
    if (this.gate) await this.gate;
    switch (method) {
      case 'eth_chainId':
        return `0x${this.chainId.toString(16)}`;
      case 'eth_blockNumber':
        return `0x${this.latest.toString(16)}`;
      case 'eth_getTransactionReceipt': {
        const tx = this.txs.get(String(params[0]));
        if (!tx) return null;
        return {
          transactionHash: String(params[0]),
          status: tx.status,
          blockNumber: `0x${tx.blockNumber.toString(16)}`,
          logs: [{ address: tx.emitter, topics: [TRANSFER_TOPIC, pad(tx.from), pad(tx.to)], data: word(tx.value), logIndex: '0x0', removed: false }],
        };
      }
      case 'eth_getBlockByNumber': {
        const number = parseInt(String(params[0]), 16);
        const tx = [...this.txs.values()].find((t) => t.blockNumber === number);
        return { number: params[0], timestamp: `0x${(tx?.blockTimeSec ?? 0).toString(16)}` };
      }
      default:
        throw new Error(`unexpected ${method}`);
    }
  }
}

export function makeMarket(opts: { chain?: boolean } = {}) {
  const store = new FakeMarketStore();
  const chain = new FakeChain(() => store.nowMs);
  let nonceCounter = 0;
  const marketChain: MarketChain = { config: CONFIG, rpc: chain, feeAddress: FEE_ADDRESS };
  const deps: MarketDeps = {
    auth: { supabaseUrl: 'https://example.invalid', anonKey: 'anon-key-for-tests', fetchFn: authFetch },
    allowedOrigins: ['https://play.example'],
    store,
    nowMs: () => store.nowMs,
    chain: () => (opts.chain === false ? null : marketChain),
    nonce: () => `nonce-${String(++nonceCounter).padStart(8, '0')}`,
  };
  const passChain: PassCryptoChain = { config: CONFIG, rpc: chain, receiveAddress: PASS_ADDRESS, priceCents: 1000 };
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

/** A throwaway wallet made in memory (never written anywhere): signs the message the server wrote. */
export function throwawayWallet() {
  const priv = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(priv, false);
  const address = `0x${Array.from(keccak_256(pub.slice(1)).slice(12), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  const sign = (message: string): string => {
    const body = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(`\u0019Ethereum Signed Message:\n${body.length}`);
    const joined = new Uint8Array(prefix.length + body.length);
    joined.set(prefix);
    joined.set(body, prefix.length);
    const sig = secp256k1.sign(keccak_256(joined), priv);
    return `0x${sig.toCompactHex()}${(27 + sig.recovery).toString(16)}`;
  };
  return { address, sign };
}
