import type { ChainConfig } from './config.ts';
import { createJsonRpc } from './rpc.ts';
import type { RpcClient } from './rpc.ts';

// DORMANT (owner decision: the market runs on Solana only, chain/solana.ts). This BNB Smart Chain verifier is kept, tested, and wired to nothing.

// Verifies that a BEP-20 USDT transfer really happened on BNB Smart Chain, by asking a JSON-RPC node (the URL is the secret BSC_RPC_URL; the provider is the owner's choice).
// NON-CUSTODIAL: this module only READS the chain. The game never holds a key, never signs, never sends a transaction.
//
// What "verified" means, all of it required:
//   * the node is on the chain we expect (eth_chainId), the transaction exists and its receipt says success;
//   * it has at least `minConfirmations` confirmations (a reorg that undoes it is then practically impossible);
//   * it contains a Transfer(from, to, value) log EMITTED BY THE USDT CONTRACT (any other token, or a contract that merely mimics the event, is refused);
//   * `to` is exactly the expected recipient, `from` is exactly the expected sender, `value` is at least the expected amount (18 decimals);
//   * its block is not older than the reservation / intent it is paid for.
// A transaction hash can be spent ONCE: that part is the database's (a primary key on the hash, migration 0011), not this module's.

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // keccak256("Transfer(address,address,uint256)")

export type VerifyFailure =
  | 'bad_hash'
  | 'rpc_error'
  | 'wrong_network'
  | 'not_found'
  | 'tx_failed'
  | 'unconfirmed'
  | 'no_transfer'
  | 'wrong_contract'
  | 'wrong_recipient'
  | 'wrong_sender'
  | 'short_amount'
  | 'too_early';

export interface VerifiedTransfer {
  txHash: string;
  from: string;
  to: string;
  amountUnits: bigint;
  blockNumber: number;
  /** seconds since the epoch, from the block header */
  blockTime: number;
  confirmations: number;
  logIndex: number;
}

export type VerifyResult = { ok: true; transfer: VerifiedTransfer } | { ok: false; reason: VerifyFailure; confirmations?: number };

export interface TransferExpectation {
  txHash: string;
  /** the payer: the buyer's LINKED address */
  from: string;
  /** the recipient: the seller's address, the fee address, or the Pass receiving address */
  to: string;
  /** the least amount, in base units (18 decimals) */
  minAmountUnits: bigint;
  /** the transfer must be mined at or after this moment (ms): the reservation / intent time */
  notBeforeMs: number;
}

export { createJsonRpc };
export type { RpcClient };

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export const isTxHash = (v: unknown): v is string => typeof v === 'string' && TX_HASH_RE.test(v);
export const normalizeTxHash = (v: unknown): string | null => (isTxHash(v) ? v.toLowerCase() : null);

function quantity(v: unknown): number | null {
  if (typeof v !== 'string' || !/^0x[0-9a-fA-F]{1,16}$/.test(v)) return null;
  const n = Number(BigInt(v));
  return Number.isSafeInteger(n) ? n : null;
}

interface RawLog {
  address?: unknown;
  topics?: unknown;
  data?: unknown;
  logIndex?: unknown;
  removed?: unknown;
}

interface Decoded {
  emitter: string;
  from: string;
  to: string;
  value: bigint;
  logIndex: number;
}

const topicAddress = (t: string): string => `0x${t.slice(26).toLowerCase()}`;

function decodeTransfers(logs: unknown): Decoded[] {
  if (!Array.isArray(logs)) return [];
  const out: Decoded[] = [];
  for (let i = 0; i < logs.length; i++) {
    const l = logs[i] as RawLog;
    if (!l || typeof l !== 'object' || l.removed === true) continue;
    const topics = l.topics;
    if (typeof l.address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(l.address) || !Array.isArray(topics)) continue;
    // A BEP-20 Transfer has the signature and the two indexed addresses as topics and the value as 32 bytes of data (an ERC-721 Transfer has 4 topics and is not a token amount).
    if (topics.length !== 3 || typeof topics[0] !== 'string' || topics[0].toLowerCase() !== TRANSFER_TOPIC) continue;
    if (typeof topics[1] !== 'string' || typeof topics[2] !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(topics[1]) || !/^0x[0-9a-fA-F]{64}$/.test(topics[2])) continue;
    if (typeof l.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(l.data)) continue;
    out.push({ emitter: l.address.toLowerCase(), from: topicAddress(topics[1]), to: topicAddress(topics[2]), value: BigInt(l.data), logIndex: quantity(l.logIndex) ?? i });
  }
  return out;
}

/** Verifies one USDT transfer. Resolves with the transfer or the FIRST reason it is not acceptable; a node that cannot be reached is 'rpc_error' (retry later: nothing is consumed). */
export async function verifyUsdtTransfer(rpc: RpcClient, cfg: ChainConfig, exp: TransferExpectation): Promise<VerifyResult> {
  const txHash = normalizeTxHash(exp.txHash);
  if (!txHash) return { ok: false, reason: 'bad_hash' };
  const from = exp.from.toLowerCase();
  const to = exp.to.toLowerCase();
  const contract = cfg.usdtContract.toLowerCase();

  try {
    const chainId = quantity(await rpc.call('eth_chainId', []));
    if (chainId !== cfg.chainId) return { ok: false, reason: 'wrong_network' };

    const receipt = (await rpc.call('eth_getTransactionReceipt', [txHash])) as { status?: unknown; blockNumber?: unknown; logs?: unknown; transactionHash?: unknown } | null;
    if (receipt === null || receipt === undefined) return { ok: false, reason: 'not_found' };
    if (typeof receipt !== 'object') return { ok: false, reason: 'rpc_error' };
    if (typeof receipt.transactionHash === 'string' && receipt.transactionHash.toLowerCase() !== txHash) return { ok: false, reason: 'rpc_error' };
    if (receipt.status !== '0x1') return { ok: false, reason: 'tx_failed' };
    const blockNumber = quantity(receipt.blockNumber);
    if (blockNumber === null) return { ok: false, reason: 'not_found' };

    const latest = quantity(await rpc.call('eth_blockNumber', []));
    if (latest === null) return { ok: false, reason: 'rpc_error' };
    const confirmations = latest - blockNumber + 1;
    if (confirmations < cfg.minConfirmations) return { ok: false, reason: 'unconfirmed', confirmations: Math.max(0, confirmations) };

    const transfers = decodeTransfers(receipt.logs);
    const official = transfers.filter((t) => t.emitter === contract);
    if (official.length === 0) return { ok: false, reason: transfers.length > 0 ? 'wrong_contract' : 'no_transfer' };
    const toRecipient = official.filter((t) => t.to === to);
    if (toRecipient.length === 0) return { ok: false, reason: 'wrong_recipient' };
    const fromPayer = toRecipient.filter((t) => t.from === from);
    if (fromPayer.length === 0) return { ok: false, reason: 'wrong_sender' };
    const enough = fromPayer.find((t) => t.value >= exp.minAmountUnits);
    if (!enough) return { ok: false, reason: 'short_amount' };

    const block = (await rpc.call('eth_getBlockByNumber', [`0x${blockNumber.toString(16)}`, false])) as { timestamp?: unknown } | null;
    const blockTime = block && typeof block === 'object' ? quantity(block.timestamp) : null;
    if (blockTime === null) return { ok: false, reason: 'rpc_error' };
    if (blockTime * 1000 < exp.notBeforeMs) return { ok: false, reason: 'too_early' };

    return { ok: true, transfer: { txHash, from, to, amountUnits: enough.value, blockNumber, blockTime, confirmations, logIndex: enough.logIndex } };
  } catch {
    return { ok: false, reason: 'rpc_error' };
  }
}

/** The calldata of USDT.transfer(to, amount): what the game asks the player's wallet to sign. Exported for the client and for tests. */
export function encodeTransferCall(to: string, amountUnits: bigint): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new RangeError('bad address');
  if (amountUnits < 0n) throw new RangeError('bad amount');
  return `0xa9059cbb${to.slice(2).toLowerCase().padStart(64, '0')}${amountUnits.toString(16).padStart(64, '0')}`;
}
