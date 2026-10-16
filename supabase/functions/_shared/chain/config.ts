// The chain the market and the USDT Pass talk to, read from secrets BY NAME. Nothing here ever reaches a client except the public parts (chain id, token address, confirmations).

export const BSC_MAINNET_CHAIN_ID = 56;
export const BSC_TESTNET_CHAIN_ID = 97;

// >>> OWNER: DOUBLE-CHECK THIS ADDRESS ON BSCSCAN BEFORE GOING LIVE. <<<
// This is the Binance-Peg "BSC-USD" token, the USDT of BNB Smart Chain mainnet (18 decimals). Open https://bscscan.com/token/<address> and confirm the name "Tether USD" / symbol "USDT",
// the 18 decimals and the verified contract. A wrong address here would accept payments in a worthless token. It can be overridden WITHOUT a code change by the secret BSC_USDT_CONTRACT
// (which is also how a test token on the BSC testnet is used: the testnet has no official USDT, so on chain 97 the secret is mandatory).
export const BSC_USDT_CONTRACT_MAINNET = '0x55d398326f99059ff775485246999027b3197955';

export const DEFAULT_MIN_CONFIRMATIONS = 15;
export const MAX_MIN_CONFIRMATIONS = 200;

export interface ChainConfig {
  chainId: number;
  /** lowercase 0x address of the USDT (BEP-20) contract */
  usdtContract: string;
  minConfirmations: number;
  /** true only on BSC mainnet: sales and entitlements bought on a testnet are stored with livemode = false and never count as real */
  livemode: boolean;
}

export interface ChainEnv {
  BSC_RPC_URL?: string;
  BSC_CHAIN_ID?: string;
  BSC_MIN_CONFIRMATIONS?: string;
  BSC_USDT_CONTRACT?: string;
  MARKET_FEE_ADDRESS?: string;
  PASS_RECEIVE_ADDRESS?: string;
  PASS_PRICE_USDT?: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** A real, non-zero address in lowercase, or null. */
export function cleanAddress(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!ADDRESS_RE.test(v)) return null;
  const lower = v.toLowerCase();
  return lower === ZERO_ADDRESS ? null : lower;
}

export type ChainConfigResult = { ok: true; config: ChainConfig; rpcUrl: string } | { ok: false; reason: 'rpc_missing' | 'chain_unsupported' | 'contract_missing' | 'contract_invalid' };

/** The chain config from the secrets. Fails closed: no RPC, an unknown chain, or a testnet without its own token address means "unavailable", never a guess. */
export function loadChainConfig(env: ChainEnv): ChainConfigResult {
  const rpcUrl = (env.BSC_RPC_URL ?? '').trim();
  if (!/^https:\/\//i.test(rpcUrl)) return { ok: false, reason: 'rpc_missing' };
  const chainId = env.BSC_CHAIN_ID ? Number(env.BSC_CHAIN_ID) : BSC_MAINNET_CHAIN_ID;
  if (chainId !== BSC_MAINNET_CHAIN_ID && chainId !== BSC_TESTNET_CHAIN_ID) return { ok: false, reason: 'chain_unsupported' };
  let usdtContract: string | null;
  if (env.BSC_USDT_CONTRACT) {
    usdtContract = cleanAddress(env.BSC_USDT_CONTRACT);
    if (!usdtContract) return { ok: false, reason: 'contract_invalid' };
  } else if (chainId === BSC_MAINNET_CHAIN_ID) usdtContract = BSC_USDT_CONTRACT_MAINNET;
  else return { ok: false, reason: 'contract_missing' };
  const requested = env.BSC_MIN_CONFIRMATIONS ? Number(env.BSC_MIN_CONFIRMATIONS) : DEFAULT_MIN_CONFIRMATIONS;
  const minConfirmations = Number.isInteger(requested) && requested >= 1 && requested <= MAX_MIN_CONFIRMATIONS ? requested : DEFAULT_MIN_CONFIRMATIONS;
  return { ok: true, rpcUrl, config: { chainId, usdtContract, minConfirmations, livemode: chainId === BSC_MAINNET_CHAIN_ID } };
}
