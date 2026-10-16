// Base58 (the Bitcoin alphabet Solana uses for addresses and signatures). Pure, dependency free: the Edge Functions and the game both import it.
// An address is 32 bytes (32 to 44 characters), a transaction signature is 64 bytes (86 to 88 characters). Base58 is case SENSITIVE: never lowercase one.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]] = i;

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

/** The bytes of a base58 string, or null for any character outside the alphabet. */
export function decodeBase58(text: string): Uint8Array | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 128) return null;
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < text.length; i++) {
    const v = INDEX[text[i]];
    if (v === undefined) return null;
    let carry = v;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
  return out;
}

const bytesLength = (text: unknown, n: number): boolean => {
  if (typeof text !== 'string') return false;
  const b = decodeBase58(text);
  return b !== null && b.length === n;
};

/** A well-formed Solana address (32 bytes). It says nothing about whether the account exists. */
export const isSolAddress = (v: unknown): v is string => bytesLength(v, 32);
/** A well-formed transaction signature (64 bytes). */
export const isSolSignature = (v: unknown): v is string => bytesLength(v, 64);
