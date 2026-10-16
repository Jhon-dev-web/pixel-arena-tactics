import { encodeBase58 } from '../../../supabase/functions/_shared/chain/base58';

// A tiny reader of the LEGACY Solana transaction wire format, written for the tests only: it lets them check what the builder in game/market/solTx.ts produced from the other side, byte by byte.

export interface ParsedTx {
  signatureSlots: number;
  signaturesAreEmpty: boolean;
  header: [number, number, number];
  keys: string[];
  blockhash: string;
  instructions: { program: string; accounts: string[]; data: Uint8Array }[];
  /** true when the whole input was consumed (no trailing bytes) */
  exact: boolean;
}

export function parseLegacyTx(bytes: Uint8Array): ParsedTx {
  let o = 0;
  const u16 = (): number => {
    let v = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[o++];
      v |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return v;
      shift += 7;
    }
  };
  const key = (): string => {
    const k = encodeBase58(bytes.slice(o, o + 32));
    o += 32;
    return k;
  };
  const slots = u16();
  const signaturesAreEmpty = bytes.slice(o, o + 64 * slots).every((b) => b === 0);
  o += 64 * slots;
  const header: [number, number, number] = [bytes[o++], bytes[o++], bytes[o++]];
  const keys = Array.from({ length: u16() }, key);
  const blockhash = key();
  const instructions = Array.from({ length: u16() }, () => {
    const program = keys[bytes[o++]];
    const accounts = Array.from({ length: u16() }, () => keys[bytes[o++]]);
    const len = u16();
    const data = bytes.slice(o, o + len);
    o += len;
    return { program, accounts, data };
  });
  return { signatureSlots: slots, signaturesAreEmpty, header, keys, blockhash, instructions, exact: o === bytes.length };
}

export const readU64 = (b: Uint8Array, at = 0): bigint => new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(at, true);
