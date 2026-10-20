import { describe, expect, it } from 'vitest';
import { decodeBase58, encodeBase58 } from '../../../supabase/functions/_shared/chain/base58';
import { MEMO_PROGRAM_ID } from '../../../supabase/functions/_shared/chain/memo';
import { SOLANA_USDC_MINT_MAINNET, SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID } from '../../../supabase/functions/_shared/chain/solana';
import { buildSolTransfersTx, buildUsdcTransferTx, compactU16 } from '../market/solTx';
import { parseLegacyTx, readU64 } from './solTxParse';

// The hand serialised transactions the wallet is asked to sign. Checked against bytes assembled independently here, and read back with a separate parser.

const key = (n: number): Uint8Array => new Uint8Array(32).fill(n);
const addr = (n: number): string => encodeBase58(key(n));
const PAYER = addr(1);
const SELLER = addr(2);
const FEE = addr(3);
const HASH = addr(9);

const u64 = (n: bigint): number[] => Array.from({ length: 8 }, (_, i) => Number((n >> BigInt(8 * i)) & 0xffn));

describe('compact-u16', () => {
  it('uses 1 byte below 128, 2 bytes up to 16383, 3 beyond, low bits first', () => {
    expect(compactU16(0)).toEqual([0]);
    expect(compactU16(127)).toEqual([127]);
    expect(compactU16(128)).toEqual([0x80, 0x01]);
    expect(compactU16(16383)).toEqual([0xff, 0x7f]);
    expect(compactU16(16384)).toEqual([0x80, 0x80, 0x01]);
    expect(() => compactU16(-1)).toThrow();
    expect(() => compactU16(65536)).toThrow();
  });
});

describe('the SOL payment: one legacy transaction with two SystemProgram transfers', () => {
  it('matches the wire format byte for byte (a golden transaction assembled by hand)', () => {
    const tx = buildSolTransfersTx({ payer: PAYER, blockhash: HASH, transfers: [{ to: SELLER, lamports: 950_000_000 }, { to: FEE, lamports: 50_000_000 }] });
    const system = new Uint8Array(32); // the system program id is 32 zero bytes
    expect(SYSTEM_PROGRAM_ID).toBe(encodeBase58(system));
    const expected = Uint8Array.from([
      1, // one signature slot...
      ...new Uint8Array(64), // ...empty: the wallet signs
      1, 0, 1, // header: 1 signer, 0 readonly signed, 1 readonly unsigned (the system program)
      4, // 4 account keys
      ...key(1), ...key(2), ...key(3), ...system,
      ...key(9), // recent blockhash
      2, // two instructions
      3, 2, 0, 1, 12, 2, 0, 0, 0, ...u64(950_000_000n), // system program (index 3), accounts [payer, seller], data: transfer 0.95 SOL
      3, 2, 0, 2, 12, 2, 0, 0, 0, ...u64(50_000_000n), // system program, accounts [payer, fee], data: transfer 0.05 SOL
    ]);
    expect(Array.from(tx)).toEqual(Array.from(expected));
  });

  it('reads back as the seller share and the game fee, paid by the only signer', () => {
    const tx = parseLegacyTx(buildSolTransfersTx({ payer: PAYER, blockhash: HASH, transfers: [{ to: SELLER, lamports: 1_234_567 }, { to: FEE, lamports: 61_729 }] }));
    expect(tx).toMatchObject({ signatureSlots: 1, signaturesAreEmpty: true, header: [1, 0, 1], keys: [PAYER, SELLER, FEE, SYSTEM_PROGRAM_ID], blockhash: HASH, exact: true });
    expect(tx.instructions.map((i) => i.program)).toEqual([SYSTEM_PROGRAM_ID, SYSTEM_PROGRAM_ID]);
    expect(tx.instructions.map((i) => i.accounts)).toEqual([[PAYER, SELLER], [PAYER, FEE]]);
    expect(tx.instructions.map((i) => readU64(i.data, 4))).toEqual([1_234_567n, 61_729n]);
    for (const i of tx.instructions) expect(Array.from(i.data.slice(0, 4))).toEqual([2, 0, 0, 0]);
  });

  it('a recipient listed twice is one account key (two instructions, one key)', () => {
    const tx = parseLegacyTx(buildSolTransfersTx({ payer: PAYER, blockhash: HASH, transfers: [{ to: SELLER, lamports: 5 }, { to: SELLER, lamports: 7 }] }));
    expect(tx.keys).toEqual([PAYER, SELLER, SYSTEM_PROGRAM_ID]);
    expect(tx.instructions).toHaveLength(2);
  });

  it('refuses nonsense: no transfers, a zero or fractional amount, paying oneself, a bad address or blockhash', () => {
    const base = { payer: PAYER, blockhash: HASH, transfers: [{ to: SELLER, lamports: 5 }] };
    expect(() => buildSolTransfersTx({ ...base, transfers: [] })).toThrow();
    expect(() => buildSolTransfersTx({ ...base, transfers: [{ to: SELLER, lamports: 0 }] })).toThrow();
    expect(() => buildSolTransfersTx({ ...base, transfers: [{ to: SELLER, lamports: 1.5 }] })).toThrow();
    expect(() => buildSolTransfersTx({ ...base, transfers: [{ to: PAYER, lamports: 5 }] })).toThrow();
    expect(() => buildSolTransfersTx({ ...base, transfers: [{ to: 'nope', lamports: 5 }] })).toThrow();
    expect(() => buildSolTransfersTx({ ...base, blockhash: 'short' })).toThrow();
  });
});

describe('the Pass payment: one SPL Token transferChecked', () => {
  const SRC = addr(21);
  const DST = addr(22);
  const MINT = SOLANA_USDC_MINT_MAINNET;
  const plan = { payer: PAYER, blockhash: HASH, sourceTokenAccount: SRC, destinationTokenAccount: DST, mint: MINT, units: 10_000_000, decimals: 6 };

  it('has the payer as the only signer, the token program, and the accounts in the order transferChecked expects', () => {
    const tx = parseLegacyTx(buildUsdcTransferTx(plan));
    expect(tx).toMatchObject({ signatureSlots: 1, signaturesAreEmpty: true, header: [1, 0, 2], blockhash: HASH, exact: true });
    // writable signer, writable (source, destination), then readonly (mint, token program)
    expect(tx.keys).toEqual([PAYER, SRC, DST, MINT, TOKEN_PROGRAM_ID]);
    expect(tx.instructions).toHaveLength(1);
    const ix = tx.instructions[0];
    expect(ix.program).toBe(TOKEN_PROGRAM_ID);
    expect(ix.accounts).toEqual([SRC, MINT, DST, PAYER]); // source, mint, destination, owner
    expect(Array.from(ix.data)).toEqual([12, ...u64(10_000_000n), 6]); // transferChecked, amount, decimals
  });

  it('refuses a bad amount or decimals', () => {
    expect(() => buildUsdcTransferTx({ ...plan, units: 0 })).toThrow();
    expect(() => buildUsdcTransferTx({ ...plan, units: 1.5 })).toThrow();
    expect(() => buildUsdcTransferTx({ ...plan, decimals: -1 })).toThrow();
    expect(() => buildUsdcTransferTx({ ...plan, sourceTokenAccount: 'x' })).toThrow();
  });
});

describe('the reference every payment carries: an SPL Memo instruction', () => {
  const MEMO = 'pa1:sale:11111111-2222-4333-8444-555555555555';
  const memoProgram = decodeBase58(MEMO_PROGRAM_ID) as Uint8Array;
  const text = Array.from(new TextEncoder().encode(MEMO));

  it('the Memo program id is the real one (a typo would send the reference nowhere)', () => {
    expect(MEMO_PROGRAM_ID).toBe('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    expect(memoProgram).toHaveLength(32);
  });

  it('SOL sale: matches the wire format byte for byte (golden), the memo is the LAST instruction, signed by the payer', () => {
    const tx = buildSolTransfersTx({ payer: PAYER, blockhash: HASH, transfers: [{ to: SELLER, lamports: 950_000_000 }, { to: FEE, lamports: 50_000_000 }], memo: MEMO });
    const system = new Uint8Array(32);
    const expected = Uint8Array.from([
      1, // one signature slot...
      ...new Uint8Array(64), // ...empty
      1, 0, 2, // header: 1 signer, 0 readonly signed, 2 readonly unsigned (the system program and the memo program)
      5, // 5 account keys: payer, seller, fee, system program, memo program
      ...key(1), ...key(2), ...key(3), ...system, ...memoProgram,
      ...key(9), // recent blockhash
      3, // three instructions
      3, 2, 0, 1, 12, 2, 0, 0, 0, ...u64(950_000_000n),
      3, 2, 0, 2, 12, 2, 0, 0, 0, ...u64(50_000_000n),
      4, 1, 0, text.length, ...text, // memo program (index 4), one account: the payer (a signer), the text
    ]);
    expect(Array.from(tx)).toEqual(Array.from(expected));
  });

  it('SOL sale: without a memo the transaction is exactly what it was before', () => {
    const plan = { payer: PAYER, blockhash: HASH, transfers: [{ to: SELLER, lamports: 5 }] };
    const parsed = parseLegacyTx(buildSolTransfersTx(plan));
    expect(parsed.keys).toEqual([PAYER, SELLER, SYSTEM_PROGRAM_ID]);
    expect(parsed.instructions).toHaveLength(1);
  });

  it('Pass: transferChecked first, then the memo with the payer as its signer; read back by the independent parser', () => {
    const passMemo = 'pa1:pass:0123456789abcdef0123456789abcdef';
    const tx = parseLegacyTx(
      buildUsdcTransferTx({ payer: PAYER, blockhash: HASH, sourceTokenAccount: addr(21), destinationTokenAccount: addr(22), mint: SOLANA_USDC_MINT_MAINNET, units: 10_000_000, decimals: 6, memo: passMemo }),
    );
    expect(tx).toMatchObject({ signatureSlots: 1, signaturesAreEmpty: true, header: [1, 0, 3], blockhash: HASH, exact: true });
    expect(tx.keys).toEqual([PAYER, addr(21), addr(22), SOLANA_USDC_MINT_MAINNET, TOKEN_PROGRAM_ID, MEMO_PROGRAM_ID]);
    expect(tx.instructions.map((i) => i.program)).toEqual([TOKEN_PROGRAM_ID, MEMO_PROGRAM_ID]);
    expect(tx.instructions[1].accounts).toEqual([PAYER]);
    expect(new TextDecoder().decode(tx.instructions[1].data)).toBe(passMemo);
  });

  it('refuses a memo that is empty, too long or not printable ASCII', () => {
    const base = { payer: PAYER, blockhash: HASH, transfers: [{ to: SELLER, lamports: 5 }] };
    expect(() => buildSolTransfersTx({ ...base, memo: '' })).toThrow();
    expect(() => buildSolTransfersTx({ ...base, memo: 'x'.repeat(201) })).toThrow();
    expect(() => buildSolTransfersTx({ ...base, memo: 'line\nbreak' })).toThrow();
  });
});
