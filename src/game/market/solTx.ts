import { decodeBase58 } from '../../../supabase/functions/_shared/chain/base58';
import { MEMO_PROGRAM_ID, isBuildableMemo } from '../../../supabase/functions/_shared/chain/memo';
import { SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID } from '../../../supabase/functions/_shared/chain/solana';

// Hand serialised Solana transactions: the smallest reliable way to ask a wallet to pay. NO Solana SDK is loaded into the game (@solana/web3.js is ~400 KB minified and its supply chain was hit by a
// compromised release in December 2024); the two shapes the market needs are a handful of bytes each:
//   * buildSolTransfersTx: a LEGACY transaction with N SystemProgram.transfer instructions (the seller's share and the game's fee in ONE transaction);
//   * buildUsdcTransferTx: a legacy transaction with ONE SPL Token transferChecked instruction (the Adventurer Pass, in USDC).
// Every payment may carry a REFERENCE: an SPL Memo instruction (the Memo program, signed by the payer) with the text the server handed over, so the server recognises the payment by it, from any wallet of
// the same player (chain/memo.ts). It is the last instruction, after the transfers.
// The result is the wire format with an EMPTY signature slot: `1 signature (64 zero bytes) + message`. The wallet signs and sends it (Wallet Standard `solana:signAndSendTransaction`). The recent
// blockhash comes from the SERVER (the node URL may hold an API key, so the browser never calls the node), and every amount and address comes from the server's reservation.
//
// Wire format of a legacy message (https://solana.com/docs/core/transactions): header [numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned], compact-u16 account count + 32 byte keys
// (writable signers first, then readonly signers, then writable non signers, then readonly non signers), 32 byte recent blockhash, compact-u16 instruction count, and per instruction:
// program id index (u8), compact-u16 account index count + the indexes, compact-u16 data length + data.

const KEY_LENGTH = 32;

function key(address: string): Uint8Array {
  const b = decodeBase58(address);
  if (!b || b.length !== KEY_LENGTH) throw new RangeError('bad address');
  return b;
}

/** Solana's "compact-u16": 1 to 3 bytes, 7 bits at a time, low bits first. */
export function compactU16(n: number): number[] {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new RangeError('bad length');
  const out: number[] = [];
  let v = n;
  for (;;) {
    const low = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(low);
      return out;
    }
    out.push(low | 0x80);
  }
}

function u64le(value: number | bigint): Uint8Array {
  const v = BigInt(value);
  if (v < 0n || v > 0xffffffffffffffffn) throw new RangeError('bad amount');
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
  return out;
}

function concat(parts: (Uint8Array | number[])[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

interface Instruction {
  programIndex: number;
  accountIndexes: number[];
  data: Uint8Array;
}

interface Key {
  address: string;
  signer: boolean;
  writable: boolean;
}

/** Orders the keys the way the runtime expects, merges duplicates (the strongest role wins) and returns the index of each address. */
function orderKeys(keys: Key[]): { ordered: Key[]; index: (address: string) => number; header: [number, number, number] } {
  const merged = new Map<string, Key>();
  for (const k of keys) {
    const had = merged.get(k.address);
    merged.set(k.address, had ? { address: k.address, signer: had.signer || k.signer, writable: had.writable || k.writable } : { ...k });
  }
  const all = [...merged.values()];
  const ordered = [...all.filter((k) => k.signer && k.writable), ...all.filter((k) => k.signer && !k.writable), ...all.filter((k) => !k.signer && k.writable), ...all.filter((k) => !k.signer && !k.writable)];
  const header: [number, number, number] = [all.filter((k) => k.signer).length, all.filter((k) => k.signer && !k.writable).length, all.filter((k) => !k.signer && !k.writable).length];
  return { ordered, index: (address) => ordered.findIndex((k) => k.address === address), header };
}

function serialize(keys: Key[], blockhash: string, instructions: (index: (a: string) => number) => Instruction[]): Uint8Array {
  const { ordered, index, header } = orderKeys(keys);
  const ixs = instructions(index);
  const message = concat([
    header,
    compactU16(ordered.length),
    ...ordered.map((k) => key(k.address)),
    key(blockhash), // a blockhash is 32 bytes in base58 too
    compactU16(ixs.length),
    ...ixs.flatMap((ix) => [[ix.programIndex], compactU16(ix.accountIndexes.length), ix.accountIndexes, compactU16(ix.data.length), ix.data]),
  ]);
  // one signature slot, empty: the wallet fills it
  return concat([compactU16(header[0]), new Uint8Array(64 * header[0]), message]);
}

/** SystemProgram.transfer data: instruction 2 as a u32, then the lamports as a u64 (12 bytes). */
const systemTransferData = (lamports: number | bigint): Uint8Array => concat([[2, 0, 0, 0], u64le(lamports)]);

/** The Memo instruction: the text as UTF-8 data, the payer as the (signing) account. */
function memoInstruction(memo: string, payer: string, index: (a: string) => number): Instruction {
  if (!isBuildableMemo(memo)) throw new RangeError('bad memo');
  return { programIndex: index(MEMO_PROGRAM_ID), accountIndexes: [index(payer)], data: new TextEncoder().encode(memo) };
}

export interface SolTransferPlan {
  payer: string;
  blockhash: string;
  transfers: { to: string; lamports: number }[];
  /** the reference the server handed over (reservation.memo); without it no memo is added */
  memo?: string;
}

/** One legacy transaction, the payer is the fee payer and the only signer, with a SystemProgram.transfer for each entry. */
export function buildSolTransfersTx(plan: SolTransferPlan): Uint8Array {
  if (plan.transfers.length === 0 || plan.transfers.length > 8) throw new RangeError('bad transfers');
  for (const t of plan.transfers) if (!Number.isSafeInteger(t.lamports) || t.lamports < 1 || t.to === plan.payer) throw new RangeError('bad transfer');
  const keys: Key[] = [
    { address: plan.payer, signer: true, writable: true },
    ...plan.transfers.map((t) => ({ address: t.to, signer: false, writable: true })),
    { address: SYSTEM_PROGRAM_ID, signer: false, writable: false },
    ...(plan.memo !== undefined ? [{ address: MEMO_PROGRAM_ID, signer: false, writable: false }] : []),
  ];
  return serialize(keys, plan.blockhash, (index) => [
    ...plan.transfers.map((t) => ({ programIndex: index(SYSTEM_PROGRAM_ID), accountIndexes: [index(plan.payer), index(t.to)], data: systemTransferData(t.lamports) })),
    ...(plan.memo !== undefined ? [memoInstruction(plan.memo, plan.payer, index)] : []),
  ]);
}

export interface UsdcTransferPlan {
  payer: string;
  blockhash: string;
  sourceTokenAccount: string;
  destinationTokenAccount: string;
  mint: string;
  /** base units (6 decimals for USDC) */
  units: number;
  decimals: number;
  /** the reference the server handed over (plan.memo); without it no memo is added */
  memo?: string;
}

/** One legacy transaction with one SPL Token `transferChecked` (instruction 12: amount u64 + decimals u8) from the payer's token account to the receiver's. The mint is checked by the token program. */
export function buildUsdcTransferTx(plan: UsdcTransferPlan): Uint8Array {
  if (!Number.isSafeInteger(plan.units) || plan.units < 1 || !Number.isInteger(plan.decimals) || plan.decimals < 0 || plan.decimals > 18) throw new RangeError('bad amount');
  const keys: Key[] = [
    { address: plan.payer, signer: true, writable: true },
    { address: plan.sourceTokenAccount, signer: false, writable: true },
    { address: plan.destinationTokenAccount, signer: false, writable: true },
    { address: plan.mint, signer: false, writable: false },
    { address: TOKEN_PROGRAM_ID, signer: false, writable: false },
    ...(plan.memo !== undefined ? [{ address: MEMO_PROGRAM_ID, signer: false, writable: false }] : []),
  ];
  return serialize(keys, plan.blockhash, (index) => [
    {
      programIndex: index(TOKEN_PROGRAM_ID),
      // transferChecked accounts: source, mint, destination, owner (authority, signer)
      accountIndexes: [index(plan.sourceTokenAccount), index(plan.mint), index(plan.destinationTokenAccount), index(plan.payer)],
      data: concat([[12], u64le(plan.units), [plan.decimals]]),
    },
    ...(plan.memo !== undefined ? [memoInstruction(plan.memo, plan.payer, index)] : []),
  ]);
}
