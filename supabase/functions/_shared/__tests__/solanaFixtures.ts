import { encodeBase58 } from '../chain/base58.ts';
import type { RpcClient } from '../chain/rpc.ts';
import { SOLANA_GENESIS_HASHES, SOLANA_USDC_MINT_MAINNET, SYSTEM_PROGRAM_ID, SolanaConfig, TOKEN_PROGRAM_ID } from '../chain/solana.ts';

// Hand written Solana JSON-RPC answers in the exact shape of `getTransaction` with encoding "jsonParsed" (what the verifier reads). No network, no node: a FakeSolana holds a ledger of
// transactions the tests write into, and answers getGenesisHash / getTransaction / getSignatureStatuses / getLatestBlockhash from it.

/** A valid 32 byte base58 address made of one repeated byte (deterministic, never a real account). */
export const addr = (n: number): string => encodeBase58(new Uint8Array(32).fill(n));
/** A valid 64 byte base58 signature made of one repeated byte. */
export const sig = (n: number): string => encodeBase58(new Uint8Array(64).fill(n));

export const MAINNET: SolanaConfig = { cluster: 'mainnet-beta', chainId: 501, usdcMint: SOLANA_USDC_MINT_MAINNET, livemode: true };
export const DEVNET: SolanaConfig = { cluster: 'devnet', chainId: 502, usdcMint: addr(77), livemode: false };

export interface Transfer {
  source: string;
  destination: string;
  lamports: number;
}
export interface TokenMove {
  owner: string;
  mint: string;
  /** units before / after, in the token's base units */
  pre: number;
  post: number;
  decimals?: number;
}

export interface FakeTx {
  slot: number;
  blockTime: number | null;
  err: unknown;
  /** top level SystemProgram transfers */
  transfers: Transfer[];
  /** SystemProgram transfers made through a program (inner instructions) */
  innerTransfers: Transfer[];
  /** instructions of another program that merely LOOK like a transfer (program id is not the system program) */
  decoyTransfers: Transfer[];
  tokens: TokenMove[];
}

export const sysIx = (t: Transfer) => ({ program: 'system', programId: SYSTEM_PROGRAM_ID, parsed: { type: 'transfer', info: { source: t.source, destination: t.destination, lamports: t.lamports } }, stackHeight: null });

export class FakeSolana implements RpcClient {
  txs = new Map<string, FakeTx>();
  /** signatures that were seen at a lower commitment only */
  unfinalized = new Map<string, { err: unknown }>();
  /** signatures the cluster has seen but not finalized yet: getTransaction (finalized) answers null for them until they are released */
  held = new Set<string>();
  /** accounts that exist (getAccountInfo answers null for any other address) */
  accounts = new Set<string>();
  genesis = SOLANA_GENESIS_HASHES['mainnet-beta'];
  down = false;
  /** while set, every call waits for it (to interleave two requests) */
  gate: Promise<void> | null = null;
  calls = 0;
  methods: string[] = [];
  private n = 0;

  constructor(private readonly clockMs: () => number) {}

  /** Writes a finalized transaction and returns its signature. */
  add(over: Partial<FakeTx> = {}): string {
    this.n++;
    const signature = sig(this.n);
    this.txs.set(signature, { slot: 300_000_000 + this.n, blockTime: Math.floor(this.clockMs() / 1000), err: null, transfers: [], innerTransfers: [], decoyTransfers: [], tokens: [], ...over });
    return signature;
  }

  /** A sale transaction: the buyer pays the seller and the fee address in ONE transaction. */
  sale(buyer: string, payouts: { to: string; lamports: number }[], over: Partial<FakeTx> = {}): string {
    return this.add({ transfers: payouts.map((p) => ({ source: buyer, destination: p.to, lamports: p.lamports })), ...over });
  }

  /** A USDC transfer between two wallets (each owns one token account, index 1 and 2). */
  usdc(from: string, to: string, units: number, over: Partial<FakeTx> = {}, mint = SOLANA_USDC_MINT_MAINNET): string {
    return this.add({
      tokens: [
        { owner: from, mint, pre: units + 5_000_000, post: 5_000_000 },
        { owner: to, mint, pre: 1_000_000, post: 1_000_000 + units },
      ],
      ...over,
    });
  }

  async call(method: string, params: unknown[]): Promise<unknown> {
    this.calls++;
    this.methods.push(method);
    if (this.down) throw new Error('rpc_down');
    if (this.gate) await this.gate;
    switch (method) {
      case 'getGenesisHash':
        return this.genesis;
      case 'getTransaction': {
        const tx = this.txs.get(String(params[0]));
        if (!tx || this.held.has(String(params[0]))) return null;
        const bal = (key: 'pre' | 'post') =>
          tx.tokens.map((t, i) => ({ accountIndex: i + 1, mint: t.mint, owner: t.owner, programId: TOKEN_PROGRAM_ID, uiTokenAmount: { amount: String(t[key]), decimals: t.decimals ?? 6, uiAmount: t[key] / 1e6, uiAmountString: String(t[key] / 1e6) } }));
        return {
          slot: tx.slot,
          blockTime: tx.blockTime,
          version: 'legacy',
          meta: {
            err: tx.err,
            fee: 5000,
            innerInstructions: tx.innerTransfers.length > 0 ? [{ index: 0, instructions: tx.innerTransfers.map(sysIx) }] : [],
            preTokenBalances: bal('pre'),
            postTokenBalances: bal('post'),
          },
          transaction: {
            signatures: [String(params[0])],
            message: {
              accountKeys: [],
              recentBlockhash: addr(9),
              instructions: [
                ...tx.transfers.map(sysIx),
                ...tx.decoyTransfers.map((t) => ({ program: 'spl-token', programId: TOKEN_PROGRAM_ID, parsed: { type: 'transfer', info: { source: t.source, destination: t.destination, lamports: t.lamports } }, stackHeight: null })),
              ],
            },
          },
        };
      }
      case 'getSignatureStatuses': {
        const list = (params[0] as string[]).map((s) => {
          const u = this.unfinalized.get(s) ?? (this.held.has(s) ? { err: null } : undefined);
          return u ? { slot: 1, confirmations: 3, err: u.err, confirmationStatus: 'confirmed' } : null;
        });
        return { context: { slot: 1 }, value: list };
      }
      case 'getAccountInfo':
        return { context: { slot: 1 }, value: this.accounts.has(String(params[0])) ? { lamports: 2_039_280, owner: TOKEN_PROGRAM_ID, data: ['', 'base64'], executable: false, rentEpoch: 0 } : null };
      case 'getLatestBlockhash':
        return { context: { slot: 1 }, value: { blockhash: addr(5), lastValidBlockHeight: 400_000_000 } };
      default:
        throw new Error(`unexpected ${method}`);
    }
  }
}
