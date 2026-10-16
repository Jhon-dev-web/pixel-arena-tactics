import { UUID_RE } from '../http.ts';

// Signed unsubscribe tokens. A future e-mail (sent through a provider the owner chooses later) carries a link to the portal's unsubscribe page with `?t=<token>`; the page POSTs the token to
// waitlist-unsubscribe, which verifies it here. The token is "<base64url(payload)>.<base64url(HMAC-SHA256(secret, payload))>" with payload "u1:<waitlist id>".
// It has no expiry on purpose: an unsubscribe link in an old e-mail must keep working. It proves "whoever built this link knew the secret WAITLIST_SECRET", nothing more, and it can only
// ever do one thing: unsubscribe that row. Changing WAITLIST_SECRET invalidates every token already sent.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function key(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signUnsubscribeToken(secret: string, waitlistId: string): Promise<string> {
  if (!secret || !UUID_RE.test(waitlistId)) throw new Error('bad_token_input');
  const payload = enc.encode(`u1:${waitlistId.toLowerCase()}`);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret, 'sign'), payload));
  return `${b64url(payload)}.${b64url(sig)}`;
}

/** The waitlist id inside a token whose signature is valid, or null. The comparison is done by WebCrypto's verify (constant time). */
export async function verifyUnsubscribeToken(secret: string, token: unknown): Promise<string | null> {
  if (!secret || typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payload = fromB64url(parts[0]);
  const sig = fromB64url(parts[1]);
  if (!payload || !sig) return null;
  let ok: boolean;
  try {
    ok = await crypto.subtle.verify('HMAC', await key(secret, 'verify'), sig, payload);
  } catch {
    return null;
  }
  if (!ok) return null;
  const text = dec.decode(payload);
  const m = /^u1:([0-9a-f-]{36})$/.exec(text);
  return m && UUID_RE.test(m[1]) ? m[1] : null;
}
