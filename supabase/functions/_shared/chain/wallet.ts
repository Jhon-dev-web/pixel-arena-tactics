import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { cleanAddress } from './config.ts';

// Wallet ownership: a player proves that he controls a BNB Smart Chain address by signing, in his OWN wallet (MetaMask, Trust Wallet...), a message the SERVER wrote. The server
// recovers the signer from the signature (EIP-191 personal_sign, secp256k1) and compares it with the address the player claims.
//
// Dependencies: @noble/curves and @noble/hashes (audited, tiny, no transitive dependencies, used by most of the Ethereum tooling). This is the ONLY place that touches them, and only the Edge
// Function `market-wallet` imports it: the game bundle has no crypto library for this (the wallet does the signing, the server does the checking).
//
// The game NEVER asks for, receives or stores a private key or a seed phrase. A signature of a short readable message is all it ever sees.

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const NONCE_TTL_MS = 10 * 60 * 1000;

export interface LinkMessageParts {
  userId: string;
  /** lowercase 0x address the player claims */
  address: string;
  nonce: string;
  /** ISO timestamp the server wrote when it issued the nonce */
  issuedAtIso: string;
  chainId: number;
}

/**
 * The exact text the player signs. It names what is being proven and why, the account, the address, the one-time nonce and the chain, so a signature cannot be replayed for another account,
 * another address, another nonce or another purpose. Built on the server from its own stored nonce (never taken from the client).
 */
export function linkMessage(p: LinkMessageParts): string {
  return [
    'Arena Idle: link this wallet to my game account.',
    'This only proves I own this address. It sends no transaction and costs nothing.',
    `Account: ${p.userId}`,
    `Address: ${p.address}`,
    `Nonce: ${p.nonce}`,
    `Issued: ${p.issuedAtIso}`,
    `Chain: ${p.chainId}`,
  ].join('\n');
}

/** keccak256("\x19Ethereum Signed Message:\n" + byteLength + message) */
export function personalMessageHash(message: string): Uint8Array {
  const body = encoder.encode(message);
  const prefix = encoder.encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const all = new Uint8Array(prefix.length + body.length);
  all.set(prefix, 0);
  all.set(body, prefix.length);
  return keccak_256(all);
}

/** The address that signed `message` (lowercase 0x...), or null when the signature is not a well-formed 65 byte secp256k1 signature. */
export function recoverPersonalSigner(message: string, signatureHex: string): string | null {
  if (typeof signatureHex !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signatureHex)) return null;
  const sig = signatureHex.slice(2);
  let v = parseInt(sig.slice(128, 130), 16);
  if (v >= 27) v -= 27; // wallets answer 27 / 28 (some 0 / 1)
  if (v !== 0 && v !== 1) return null;
  try {
    const point = secp256k1.Signature.fromCompact(sig.slice(0, 128)).addRecoveryBit(v).recoverPublicKey(personalMessageHash(message));
    const uncompressed = point.toRawBytes(false); // 0x04 || X || Y
    return `0x${toHex(keccak_256(uncompressed.slice(1)).slice(12))}`;
  } catch {
    return null;
  }
}

/** True only when `signatureHex` over `message` recovers exactly `address`. */
export function verifyPersonalSignature(message: string, signatureHex: string, address: string): boolean {
  const claimed = cleanAddress(address);
  if (!claimed) return false;
  return recoverPersonalSigner(message, signatureHex) === claimed;
}
