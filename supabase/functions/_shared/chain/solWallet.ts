import { ed25519 } from '@noble/curves/ed25519';
import { decodeBase58 } from './base58.ts';
import { cleanSolAddress } from './solana.ts';

// Wallet ownership on Solana: a player proves that he controls an address by signing, in his OWN wallet (Phantom, Solflare...), a message the SERVER wrote with the wallet's `signMessage`.
// A Solana address IS the ed25519 public key (32 bytes, base58), so the server checks the 64 byte signature against the address directly. No account, no transaction, no cost.
//
// Dependency: @noble/curves (audited, tiny, no transitive dependencies; the ed25519 module is the only part used). No Solana web3 SDK is needed on the server: base58 and the check are ~60 lines.
// Only the Edge Function `market-wallet` imports this file; the game bundle has no crypto library for it (the wallet does the signing, the server does the checking).
//
// The game NEVER asks for, receives or stores a private key or a seed phrase. A signature of a short readable message is all it ever sees.

export const NONCE_TTL_MS = 10 * 60 * 1000;

const encoder = new TextEncoder();

export interface LinkMessageParts {
  userId: string;
  /** the base58 address the player claims */
  address: string;
  nonce: string;
  /** ISO timestamp the server wrote when it issued the nonce */
  issuedAtIso: string;
  cluster: string;
}

/**
 * The exact text the player signs. It names what is being proven and why, the account, the address, the one-time nonce and the network, so a signature cannot be replayed for another account,
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
    `Network: Solana ${p.cluster}`,
  ].join('\n');
}

/** True only when `signature` (base58, 64 bytes) over the UTF-8 bytes of `message` was made by the key `address`. */
export function verifySolanaSignature(message: string, signature: string, address: string): boolean {
  const claimed = cleanSolAddress(address);
  if (!claimed) return false;
  const pub = decodeBase58(claimed);
  const sig = typeof signature === 'string' ? decodeBase58(signature) : null;
  if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return false;
  try {
    return ed25519.verify(sig, encoder.encode(message), pub);
  } catch {
    return false;
  }
}
