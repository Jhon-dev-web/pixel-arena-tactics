import { RpcClient, createJsonRpc } from '../chain/bsc.ts';
import { ChainConfig, ChainEnv, cleanAddress, loadChainConfig } from '../chain/config.ts';
import type { ChainPublic } from './types.ts';
import { MARKET_RULES } from './rules.ts';

// Everything a market function needs from the chain secrets, or null when it is not configured (the function then answers 503 "unavailable": it never half-works).
export interface MarketChain {
  config: ChainConfig;
  rpc: RpcClient;
  /** where the game's 5% goes (secret MARKET_FEE_ADDRESS): an address the OWNER controls. The game never holds its key. */
  feeAddress: string;
}

export function loadMarketChain(env: ChainEnv, fetchFn?: typeof fetch): MarketChain | null {
  const loaded = loadChainConfig(env);
  if (!loaded.ok) return null;
  const feeAddress = cleanAddress(env.MARKET_FEE_ADDRESS);
  if (!feeAddress) return null;
  return { config: loaded.config, rpc: createJsonRpc(loaded.rpcUrl, { fetchFn }), feeAddress };
}

export const chainPublic = (c: ChainConfig): ChainPublic => ({ chainId: c.chainId, usdtContract: c.usdtContract, minConfirmations: c.minConfirmations, livemode: c.livemode, feePercent: MARKET_RULES.feePercent });
