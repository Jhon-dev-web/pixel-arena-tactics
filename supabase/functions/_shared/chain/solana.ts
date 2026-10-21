import { decodeBase58, isSolAddress } from './base58.ts';
import { MEMO_PROGRAM_ID } from './memo.ts';
import { RpcClient } from './rpc.ts';
import { DEFAULT_PASS_PRICE_USDC_UNITS, USDC_DECIMALS, parseUsdcAmount } from './solMoney.ts';

// The Solana side of the market and the Pass: the configuration read from secrets BY NAME, and the verification of a payment by asking a JSON-RPC node (the URL is the secret
// SOLANA_RPC_URL; the provider is the owner's choice) with `getTransaction` at commitment `confirmed` (SOLANA_VERIFY_COMMITMENT below).
//
// NON-CUSTODIAL: this module only READS the chain. The game never holds a key, never signs, never sends a transaction (the player's own wallet does).
//
// What "verified" means, all of it required:
//   * the node is on the cluster we expect (getGenesisHash), the transaction is CONFIRMED (more than two thirds of the stake voted for its block) and `meta.err` is null (a transaction the cluster has not confirmed yet is "not yet", never accepted);
//   * SALE (SOL): ONE transaction carries both SystemProgram transfers. The sum of the transfers FROM the buyer's linked address TO the seller is at least 95% of the price and TO the game's fee
//     address at least 5% (lamports; instructions inside inner instructions count too). Any other sender, recipient or short amount is refused;
//   * PASS (USDC): the net change of the USDC token balances OWNED by the receiving address is at least the price, and the buyer's own USDC balance went down by at least the price (the mint is the
//     official USDC mint of the cluster; any other token is refused);
//   * the block time is not older than the reservation / intent it is paid for.
// A transaction signature can be spent ONCE: that part is the database's (a primary key on the signature, migration 0013), not this module's.

/**
 * The commitment a payment is verified at. `confirmed` is about 1 to 2 seconds after the wallet sends; `finalized` is about 13 seconds later still (owner rule of 2026-10-21: a click is a request and
 * what the player paid for must show at once). `confirmed` means more than two thirds of the stake voted for the block, and a confirmed block has not been rolled back on mainnet-beta, so for a
 * one-off payment of this size the remaining risk is negligible. Replay protection does not depend on the level: a signature is consumed ONCE by the database (primary key, migration 0013), so a
 * retry, a second tab or a re-sent hash can never pay twice. `processed` is NOT acceptable (one leader's block, it can be dropped).
 */
export const SOLANA_VERIFY_COMMITMENT = 'confirmed' as const;

export const SOLANA_CLUSTERS = ['mainnet-beta', 'devnet'] as const;
export type SolanaCluster = (typeof SOLANA_CLUSTERS)[number];

// >>> OWNER: DOUBLE-CHECK THIS ADDRESS ON SOLSCAN BEFORE GOING LIVE. <<<
// This is the mint of USDC (Circle) on Solana mainnet-beta, 6 decimals. Open https://solscan.io/token/<address> and confirm the name "USD Coin" / symbol USDC, the 6 decimals and the Circle
// issuer. A wrong address here would accept Pass payments in a worthless token. It can be overridden WITHOUT a code change by the secret SOLANA_USDC_MINT (which is also how a test USDC on
// devnet is used: devnet has no official mint this code trusts, so on devnet the secret is mandatory).
export const SOLANA_USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

// The genesis hash identifies the cluster a node serves. The server refuses to verify against a node whose genesis is not the configured cluster's: a devnet node behind a mainnet-beta
// configuration would otherwise turn free devnet SOL into "real" sales. OWNER: if either value ever looks wrong, compare with https://docs.solana.com/clusters and fix it here.
export const SOLANA_GENESIS_HASHES: Record<SolanaCluster, string> = {
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};

/** An internal tag stored in the `chain_id` columns (Solana has no chain id). Not a protocol value. */
export const SOLANA_CHAIN_TAG: Record<SolanaCluster, number> = { 'mainnet-beta': 501, devnet: 502 };

export interface SolanaConfig {
  cluster: SolanaCluster;
  /** the internal tag stored in the database (501 mainnet-beta, 502 devnet) */
  chainId: number;
  /** the USDC mint of this cluster */
  usdcMint: string;
  /** true only on mainnet-beta: sales and entitlements bought on devnet are stored with livemode = false and never count as real */
  livemode: boolean;
}

export interface SolanaEnv {
  SOLANA_RPC_URL?: string;
  SOLANA_CLUSTER?: string;
  SOLANA_USDC_MINT?: string;
  MARKET_FEE_ADDRESS?: string;
  PASS_RECEIVE_ADDRESS?: string;
  PASS_PRICE_USDC?: string;
  SOL_USD_PRICE_URL?: string;
}

/** A well-formed 32 byte address (case sensitive, kept as given), or null. The system program id (all ones) is not an owner's wallet. */
export function cleanSolAddress(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!isSolAddress(v) || v === SYSTEM_PROGRAM_ID) return null;
  return v;
}

export type SolanaConfigResult = { ok: true; config: SolanaConfig; rpcUrl: string } | { ok: false; reason: 'rpc_missing' | 'cluster_unsupported' | 'mint_missing' | 'mint_invalid' };

/** The cluster config from the secrets. Fails closed: no RPC, an unknown cluster, or devnet without its own USDC mint means "unavailable", never a guess. */
export function loadSolanaConfig(env: SolanaEnv): SolanaConfigResult {
  const rpcUrl = (env.SOLANA_RPC_URL ?? '').trim();
  if (!/^https:\/\//i.test(rpcUrl)) return { ok: false, reason: 'rpc_missing' };
  const raw = (env.SOLANA_CLUSTER ?? '').trim();
  const cluster = (raw === '' ? 'mainnet-beta' : raw) as SolanaCluster;
  if (!SOLANA_CLUSTERS.includes(cluster)) return { ok: false, reason: 'cluster_unsupported' };
  let usdcMint: string | null;
  if (env.SOLANA_USDC_MINT && env.SOLANA_USDC_MINT.trim() !== '') {
    usdcMint = cleanSolAddress(env.SOLANA_USDC_MINT);
    if (!usdcMint) return { ok: false, reason: 'mint_invalid' };
  } else if (cluster === 'mainnet-beta') usdcMint = SOLANA_USDC_MINT_MAINNET;
  else return { ok: false, reason: 'mint_missing' };
  return { ok: true, rpcUrl, config: { cluster, chainId: SOLANA_CHAIN_TAG[cluster], usdcMint, livemode: cluster === 'mainnet-beta' } };
}

/** The Pass price in USDC base units from PASS_PRICE_USDC (default "10.00"), or null for a malformed value: that switches the Pass OFF instead of giving it away. */
export function loadPassPriceUnits(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PASS_PRICE_USDC_UNITS;
  const parsed = parseUsdcAmount(raw);
  return parsed === null || parsed < 1 ? null : parsed;
}

/** A well-formed signature (64 bytes of base58). The text is kept exactly as given: base58 is case sensitive. */
function isSignatureText(v: string): boolean {
  const b = decodeBase58(v);
  return b !== null && b.length === 64;
}

/** The normalised signature (trimmed, never lowercased) or null. */
export const normalizeSolSignature = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return isSignatureText(t) ? t : null;
};

// ---- verification --------------------------------------------------------------------------------------------------------------------------------------------------------

export type SolVerifyFailure =
  | 'bad_signature'
  | 'rpc_error'
  | 'wrong_network'
  | 'not_found'
  | 'unconfirmed'
  | 'tx_failed'
  | 'no_transfer'
  | 'wrong_mint'
  | 'wrong_recipient'
  | 'wrong_sender'
  | 'short_amount'
  | 'too_early';

export interface VerifiedSolPayment {
  signature: string;
  slot: number;
  /** seconds since the epoch, from the block */
  blockTime: number;
  /** SOL sales: lamports moved from the buyer, per recipient. Pass: the USDC units received by the receiving address. */
  paid: { to: string; amount: bigint }[];
  /** SOL sales: the wallet that actually paid (the linked one, or the one that carried the reservation's memo) */
  payer?: string;
  /** SOL sales: true when the payment was recognised by the reservation's memo rather than by the linked address */
  viaMemo?: boolean;
}

export type SolVerifyResult = { ok: true; payment: VerifiedSolPayment } | { ok: false; reason: SolVerifyFailure };

export interface SolSaleExpectation {
  signature: string;
  /** the payer: the buyer's LINKED address */
  buyer: string;
  /** who must receive at least how many lamports (the seller and the game's fee address; the same address twice is added up) */
  payouts: { to: string; minLamports: bigint }[];
  /** the transaction must be in a block at or after this moment (ms): the reservation time */
  notBeforeMs: number;
  /**
   * The reference of the reservation (chain/memo.ts). A transaction that carries it in a Memo instruction may be paid by ANY wallet (a single one for both transfers): the reservation is bound to the
   * player on the server, the signature is single use and the memo selects nothing else. Without it, only `buyer` (the linked address) counts, as before.
   */
  memo?: string;
  /** called with what the transaction showed, before the checks decide (so a refused payment that did reach the game can be queued for the owner) */
  onInspect?: (i: SolSaleInspection) => void;
}

/** What a SOL sale transaction showed, whether or not it was accepted. */
export interface SolSaleInspection {
  /** the one wallet that paid the owed addresses, or null when none did / several different ones did */
  payer: string | null;
  /** lamports that reached the owed addresses, from anybody */
  reachedLamports: bigint;
  memos: string[];
  slot: number;
  blockTime: number;
  viaMemo: boolean;
}

export interface UsdcInspection {
  signature: string;
  slot: number;
  /** seconds since the epoch, from the block */
  blockTime: number;
  /** the net USDC the receiving wallet gained (0 or less: nothing reached it) */
  receivedUnits: bigint;
  /** every other wallet whose USDC went down, with how much */
  payers: { owner: string; units: bigint }[];
  memos: string[];
}

export interface UsdcExpectation {
  signature: string;
  buyer: string;
  /** the owner of the token account that receives the USDC (PASS_RECEIVE_ADDRESS) */
  receiver: string;
  minUnits: bigint;
  /** the intent time (ms) */
  notBeforeMs: number;
}

const genesisChecked = new WeakMap<RpcClient, Set<string>>();

interface RawInstruction {
  programId?: unknown;
  parsed?: unknown;
}
interface RawTokenBalance {
  accountIndex?: unknown;
  mint?: unknown;
  owner?: unknown;
  uiTokenAmount?: { amount?: unknown; decimals?: unknown };
}
interface RawTx {
  slot?: unknown;
  blockTime?: unknown;
  meta?: { err?: unknown; innerInstructions?: unknown; preTokenBalances?: unknown; postTokenBalances?: unknown } | null;
  transaction?: { message?: { instructions?: unknown } };
}

const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null);

/** getTransaction at SOLANA_VERIFY_COMMITMENT, or the reason it is not usable yet. */
async function fetchVerified(rpc: RpcClient, cfg: SolanaConfig, signature: string): Promise<{ ok: true; tx: RawTx; slot: number; blockTime: number } | { ok: false; reason: SolVerifyFailure }> {
  const known = genesisChecked.get(rpc) ?? new Set<string>();
  if (!known.has(cfg.cluster)) {
    const genesis = await rpc.call('getGenesisHash', []);
    if (genesis !== SOLANA_GENESIS_HASHES[cfg.cluster]) return { ok: false, reason: 'wrong_network' };
    known.add(cfg.cluster);
    genesisChecked.set(rpc, known);
  }

  const raw = (await rpc.call('getTransaction', [signature, { encoding: 'jsonParsed', commitment: SOLANA_VERIFY_COMMITMENT, maxSupportedTransactionVersion: 0 }])) as RawTx | null;
  if (raw === null || raw === undefined) {
    // Not confirmed yet (or never seen). The signature status tells which, so the screen can say "waiting for the network" instead of "not found".
    const st = (await rpc.call('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])) as { value?: unknown } | null;
    const entry = st && Array.isArray(st.value) ? (st.value[0] as { err?: unknown } | null) : null;
    if (!entry) return { ok: false, reason: 'not_found' };
    if (entry.err !== null && entry.err !== undefined) return { ok: false, reason: 'tx_failed' };
    return { ok: false, reason: 'unconfirmed' };
  }
  if (typeof raw !== 'object' || !raw.meta || typeof raw.meta !== 'object') return { ok: false, reason: 'rpc_error' };
  if (raw.meta.err !== null && raw.meta.err !== undefined) return { ok: false, reason: 'tx_failed' };
  const slot = asNumber(raw.slot);
  const blockTime = asNumber(raw.blockTime);
  if (slot === null || blockTime === null) return { ok: false, reason: 'rpc_error' };
  return { ok: true, tx: raw, slot, blockTime };
}

interface SystemTransfer {
  source: string;
  destination: string;
  lamports: bigint;
}

/** Every SystemProgram `transfer` of the transaction, top level and inner (CPI) instructions alike. Anything that is not a parsed system transfer is ignored. */
function systemTransfers(tx: RawTx): SystemTransfer[] {
  const out: SystemTransfer[] = [];
  const take = (ix: unknown): void => {
    const i = ix as RawInstruction | null;
    if (!i || typeof i !== 'object' || i.programId !== SYSTEM_PROGRAM_ID) return;
    const parsed = i.parsed as { type?: unknown; info?: { source?: unknown; destination?: unknown; lamports?: unknown } } | undefined;
    if (!parsed || parsed.type !== 'transfer' || !parsed.info) return;
    const { source, destination, lamports } = parsed.info;
    if (typeof source !== 'string' || typeof destination !== 'string') return;
    if (typeof lamports !== 'number' && typeof lamports !== 'string') return;
    let amount: bigint;
    try {
      amount = BigInt(lamports);
    } catch {
      return;
    }
    if (amount > 0n) out.push({ source, destination, lamports: amount });
  };
  const top = tx.transaction?.message?.instructions;
  if (Array.isArray(top)) top.forEach(take);
  const inner = tx.meta?.innerInstructions;
  if (Array.isArray(inner)) for (const group of inner) if (group && Array.isArray((group as { instructions?: unknown }).instructions)) (group as { instructions: unknown[] }).instructions.forEach(take);
  return out;
}

const tooEarly = (blockTime: number, notBeforeMs: number): boolean => blockTime < Math.floor(notBeforeMs / 1000);

/** The texts of the Memo instructions of the transaction (top level only: a program cannot add a memo to a payment it did not sign). */
export function memosOf(tx: RawTx): string[] {
  const top = tx.transaction?.message?.instructions;
  if (!Array.isArray(top)) return [];
  const out: string[] = [];
  for (const ix of top) {
    const i = ix as RawInstruction | null;
    if (i && typeof i === 'object' && i.programId === MEMO_PROGRAM_ID && typeof i.parsed === 'string' && i.parsed.length <= 600) out.push(i.parsed);
  }
  return out;
}

/** Verifies the ONE transaction that pays a sale: the seller's share and the game's fee, both from the buyer's linked address. */
export async function verifySolSale(rpc: RpcClient, cfg: SolanaConfig, exp: SolSaleExpectation): Promise<SolVerifyResult> {
  if (typeof exp.signature !== 'string' || !isSignatureText(exp.signature)) return { ok: false, reason: 'bad_signature' };
  try {
    const got = await fetchVerified(rpc, cfg, exp.signature);
    if ('reason' in got) return got; // ("in", not ".ok": the game's tests compile this file without strict null checks, where the discriminant does not narrow)
    const transfers = systemTransfers(got.tx);
    if (transfers.length === 0) return { ok: false, reason: 'no_transfer' };

    // the same recipient listed twice is one obligation
    const owed = new Map<string, bigint>();
    for (const p of exp.payouts) owed.set(p.to, (owed.get(p.to) ?? 0n) + p.minLamports);

    // Who paid the owed addresses, and did the transaction carry the reservation's memo? With the memo, a single wallet paying all of it is the buyer, whichever of his wallets it is.
    const memos = memosOf(got.tx);
    const viaMemo = exp.memo !== undefined && memos.includes(exp.memo);
    const sources = new Set<string>();
    let reached = 0n;
    for (const t of transfers) {
      if (!owed.has(t.destination)) continue;
      sources.add(t.source);
      reached += t.lamports;
    }
    const soleSource = sources.size === 1 ? [...sources][0] : null;
    exp.onInspect?.({ payer: soleSource, reachedLamports: reached, memos, slot: got.slot, blockTime: got.blockTime, viaMemo });
    const buyer = viaMemo ? soleSource : exp.buyer;

    for (const to of owed.keys()) if (!transfers.some((t) => t.destination === to)) return { ok: false, reason: 'wrong_recipient' };
    // paying yourself nets nothing: the payer can never be one of the addresses that must be paid
    if (buyer === null || owed.has(buyer)) return { ok: false, reason: 'wrong_sender' };
    const fromBuyer = new Map<string, bigint>();
    for (const t of transfers) if (t.source === buyer) fromBuyer.set(t.destination, (fromBuyer.get(t.destination) ?? 0n) + t.lamports);
    for (const to of owed.keys()) if (!fromBuyer.has(to)) return { ok: false, reason: 'wrong_sender' };
    for (const [to, min] of owed) if ((fromBuyer.get(to) ?? 0n) < min) return { ok: false, reason: 'short_amount' };
    if (tooEarly(got.blockTime, exp.notBeforeMs)) return { ok: false, reason: 'too_early' };

    return { ok: true, payment: { signature: exp.signature, slot: got.slot, blockTime: got.blockTime, paid: [...owed.keys()].map((to) => ({ to, amount: fromBuyer.get(to) ?? 0n })), payer: buyer, viaMemo } };
  } catch {
    return { ok: false, reason: 'rpc_error' };
  }
}

function tokenEntries(list: unknown): RawTokenBalance[] {
  return Array.isArray(list) ? (list.filter((e) => e && typeof e === 'object') as RawTokenBalance[]) : [];
}

const unitsOf = (e: RawTokenBalance | undefined): bigint => {
  const a = e?.uiTokenAmount?.amount;
  if (typeof a !== 'string' || !/^\d{1,40}$/.test(a)) return 0n;
  return BigInt(a);
};

/** Net change (post - pre) of the balances of ONE mint owned by `owner`, summed over its token accounts. null when the owner has no entry for that mint at all. */
function netChange(tx: RawTx, owner: string, mint: string): { delta: bigint; decimals: number | null } | null {
  const pre = tokenEntries(tx.meta?.preTokenBalances);
  const post = tokenEntries(tx.meta?.postTokenBalances);
  const mine = (e: RawTokenBalance) => e.owner === owner && e.mint === mint;
  const indexes = new Set<number>();
  for (const e of [...pre, ...post]) if (mine(e) && typeof e.accountIndex === 'number') indexes.add(e.accountIndex);
  if (indexes.size === 0) return null;
  let delta = 0n;
  let decimals: number | null = null;
  for (const i of indexes) {
    const before = pre.find((e) => e.accountIndex === i && mine(e));
    const after = post.find((e) => e.accountIndex === i && mine(e));
    delta += unitsOf(after) - unitsOf(before);
    const d = (after ?? before)?.uiTokenAmount?.decimals;
    if (typeof d === 'number') decimals = d;
  }
  return { delta, decimals };
}

/** Verifies the USDC payment of the Adventurer Pass: the receiving wallet gained at least the price in the official USDC, and the buyer's wallet is the one that paid. */
export async function verifyUsdcPayment(rpc: RpcClient, cfg: SolanaConfig, exp: UsdcExpectation): Promise<SolVerifyResult> {
  if (typeof exp.signature !== 'string' || !isSignatureText(exp.signature)) return { ok: false, reason: 'bad_signature' };
  try {
    const got = await fetchVerified(rpc, cfg, exp.signature);
    if ('reason' in got) return got; // ("in", not ".ok": the game's tests compile this file without strict null checks, where the discriminant does not narrow)
    const all = [...tokenEntries(got.tx.meta?.preTokenBalances), ...tokenEntries(got.tx.meta?.postTokenBalances)];
    if (all.length === 0) return { ok: false, reason: 'no_transfer' };
    if (!all.some((e) => e.owner === exp.receiver)) return { ok: false, reason: 'wrong_recipient' };

    const received = netChange(got.tx, exp.receiver, cfg.usdcMint);
    if (!received || (received.decimals !== null && received.decimals !== USDC_DECIMALS)) return { ok: false, reason: 'wrong_mint' };
    const sent = netChange(got.tx, exp.buyer, cfg.usdcMint);
    if (!sent || sent.delta >= 0n) return { ok: false, reason: 'wrong_sender' };
    if (received.delta < exp.minUnits) return { ok: false, reason: 'short_amount' };
    if (-sent.delta < exp.minUnits) return { ok: false, reason: 'wrong_sender' }; // somebody else paid part of it
    if (tooEarly(got.blockTime, exp.notBeforeMs)) return { ok: false, reason: 'too_early' };

    return { ok: true, payment: { signature: exp.signature, slot: got.slot, blockTime: got.blockTime, paid: [{ to: exp.receiver, amount: received.delta }] } };
  } catch {
    return { ok: false, reason: 'rpc_error' };
  }
}

/**
 * What a confirmed transaction did with the official USDC around the receiving wallet, WITHOUT deciding whether it pays a purchase: how much the receiver gained, which wallets paid, and the memos.
 * The caller (pass-crypto) matches it to the player's reference and the price. Fails only when the transaction is unusable or never touched the receiver's USDC.
 */
export async function inspectUsdcTransfer(rpc: RpcClient, cfg: SolanaConfig, exp: { signature: string; receiver: string }): Promise<{ ok: true; inspection: UsdcInspection } | { ok: false; reason: SolVerifyFailure }> {
  if (typeof exp.signature !== 'string' || !isSignatureText(exp.signature)) return { ok: false, reason: 'bad_signature' };
  try {
    const got = await fetchVerified(rpc, cfg, exp.signature);
    if ('reason' in got) return got;
    const all = [...tokenEntries(got.tx.meta?.preTokenBalances), ...tokenEntries(got.tx.meta?.postTokenBalances)];
    if (all.length === 0) return { ok: false, reason: 'no_transfer' };
    if (!all.some((e) => e.owner === exp.receiver)) return { ok: false, reason: 'wrong_recipient' };
    const received = netChange(got.tx, exp.receiver, cfg.usdcMint);
    if (!received || (received.decimals !== null && received.decimals !== USDC_DECIMALS)) return { ok: false, reason: 'wrong_mint' };
    const owners = new Set<string>();
    for (const e of all) if (typeof e.owner === 'string' && e.mint === cfg.usdcMint && e.owner !== exp.receiver) owners.add(e.owner);
    const payers: { owner: string; units: bigint }[] = [];
    for (const owner of owners) {
      const change = netChange(got.tx, owner, cfg.usdcMint);
      if (change && change.delta < 0n) payers.push({ owner, units: -change.delta });
    }
    return { ok: true, inspection: { signature: exp.signature, slot: got.slot, blockTime: got.blockTime, receivedUnits: received.delta, payers, memos: memosOf(got.tx) } };
  } catch {
    return { ok: false, reason: 'rpc_error' };
  }
}

/** A recent blockhash for the transaction the player's wallet signs (the browser cannot call the node: its URL may hold an API key). */
export async function fetchRecentBlockhash(rpc: RpcClient): Promise<{ blockhash: string; lastValidBlockHeight: number } | null> {
  try {
    const r = (await rpc.call('getLatestBlockhash', [{ commitment: 'confirmed' }])) as { value?: { blockhash?: unknown; lastValidBlockHeight?: unknown } } | null;
    const v = r?.value;
    if (!v || typeof v.blockhash !== 'string' || !isSolAddress(v.blockhash) || typeof v.lastValidBlockHeight !== 'number') return null;
    return { blockhash: v.blockhash, lastValidBlockHeight: v.lastValidBlockHeight };
  } catch {
    return null;
  }
}
