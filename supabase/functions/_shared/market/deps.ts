import type { AuthConfig } from '../auth.ts';
import type { MarketChain } from './chainEnv.ts';
import type { OpsFlagReader } from '../ops/flags.ts';
import type { MarketStore } from './store.ts';

export interface MarketDeps {
  auth: AuthConfig;
  allowedOrigins: string[];
  store: MarketStore;
  nowMs: () => number;
  /** null = the chain secrets are not set: every money action answers 503 */
  chain: () => MarketChain | null;
  /** a fresh unguessable nonce (production: 16 random bytes in hex) */
  nonce: () => string;
  /** US dollars per SOL from the optional SOL_USD_PRICE_URL (cached on the server), or null */
  solUsd: () => Promise<number | null>;
  /** The operations flags (migration 0021). Absent or failing = nothing is paused. `market_paused` makes listing, reserving, preparing and submitting answer 503. */
  opsFlags?: OpsFlagReader;
}
