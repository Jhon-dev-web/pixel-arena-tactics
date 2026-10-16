import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { decodeBase58, encodeBase58 } from './base58.ts';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from './solana.ts';

// The address of an associated token account (ATA): where a wallet's USDC lives. It is a program derived address (PDA): sha256(seeds || bump || programId || "ProgramDerivedAddress"), the first bump
// from 255 down whose hash is NOT a valid ed25519 point (a PDA has no private key). Only the Edge Function `pass-crypto` uses this file (it needs @noble/curves and @noble/hashes through the npm
// import map in its folder); the game never derives anything, the server hands it the two token accounts.

const encoder = new TextEncoder();

/** True when the 32 bytes decode to a point on the ed25519 curve (zip215: a non canonical y is accepted, like Solana's own check). */
function isOnCurve(bytes: Uint8Array): boolean {
  try {
    (ed25519.ExtendedPoint as unknown as { fromHex(hex: Uint8Array, zip215: boolean): unknown }).fromHex(bytes, true);
    return true;
  } catch {
    return false;
  }
}

function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Uint8Array {
  const marker = encoder.encode('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), programId, marker];
    const joined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      joined.set(p, at);
      at += p.length;
    }
    const hash = sha256(joined);
    if (!isOnCurve(hash)) return hash;
  }
  throw new Error('no_pda');
}

/** The associated token account of `owner` for `mint` (all base58 addresses): PDA of [owner, TokenProgram, mint] under the Associated Token Program. */
export function associatedTokenAddress(owner: string, mint: string): string {
  const o = decodeBase58(owner);
  const m = decodeBase58(mint);
  const token = decodeBase58(TOKEN_PROGRAM_ID);
  const ata = decodeBase58(ASSOCIATED_TOKEN_PROGRAM_ID);
  if (!o || o.length !== 32 || !m || m.length !== 32 || !token || !ata) throw new RangeError('bad address');
  return encodeBase58(findProgramAddress([o, token, m], ata));
}
