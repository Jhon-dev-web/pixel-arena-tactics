import { RpcClient, createJsonRpc } from '../chain/rpc.ts';
import { SolanaConfig, SolanaEnv, cleanSolAddress, loadSolanaConfig } from '../chain/solana.ts';
import type { ChainPublic } from './types.ts';
import { MARKET_RULES } from './rules.ts';

// Everything a market function needs from the chain secrets, or null when it is not configured (the function then answers 503 "unavailable": it never half-works).
export interface MarketChain {
  config: SolanaConfig;
  rpc: RpcClient;
  /** where the game's 5% goes (secret MARKET_FEE_ADDRESS): an address the OWNER controls. The game never holds its key. */
  feeAddress: string;
}

// One RPC client per node URL for the life of the isolate (so the genesis check of the verifier is made once, not on every request). The URL is only a key of this map: it is never logged.
const clients = new Map<string, RpcClient>();
export function rpcFor(url: string, fetchFn?: typeof fetch): RpcClient {
  if (fetchFn) return createJsonRpc(url, { fetchFn }); // tests: a private client
  let c = clients.get(url);
  if (!c) {
    c = createJsonRpc(url);
    clients.set(url, c);
  }
  return c;
}

export function loadMarketChain(env: SolanaEnv, fetchFn?: typeof fetch): MarketChain | null {
  const loaded = loadSolanaConfig(env);
  if (!loaded.ok) return null;
  const feeAddress = cleanSolAddress(env.MARKET_FEE_ADDRESS);
  if (!feeAddress) return null;
  return { config: loaded.config, rpc: rpcFor(loaded.rpcUrl, fetchFn), feeAddress };
}

export const chainPublic = (c: SolanaConfig): ChainPublic => ({ network: 'solana', cluster: c.cluster, chainId: c.chainId, usdcMint: c.usdcMint, livemode: c.livemode, feePercent: MARKET_RULES.feePercent });
