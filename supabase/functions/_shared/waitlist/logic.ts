// Pure logic of the launch waitlist (no network, no clock, no randomness unless it is passed in), shared by waitlist-join, waitlist-unsubscribe and their tests.
// Nothing in here logs anything: an e-mail address must never reach a log line.

export type Locale = 'pt' | 'en';

/** Fixed-window limits, mirrored by the SQL in migration 0016 (public.waitlist_join). Documented for the owner in docs/WAITLIST.md. */
export const WAITLIST_LIMITS = {
  windowSeconds: 3600,
  global: 2000,
  perIp: 10,
  perSubnet: 40,
  perEmail: 5,
} as const;

/** The rate-limit decision as one pure function: `hits` is the counter AFTER this request was counted (the SQL does the counting in one atomic statement). */
export function withinLimit(hitsAfterCounting: number, max: number): boolean {
  return Number.isInteger(hitsAfterCounting) && hitsAfterCounting >= 1 && hitsAfterCounting <= max;
}

export const MAX_BODY_BYTES = 4096;

// The first character is a letter, a digit or _ : an address starting with = + - @ would be read as a formula when the list is opened in a spreadsheet.
const EMAIL_RE = /^[a-z0-9_][a-z0-9.!#$%&'*+/=?^_`{|}~-]*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lower-cased, trimmed address, or null when it is not a plausible address (length, shape, a dot in the domain, a 2+ letter ending). */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  const at = email.lastIndexOf('@');
  if (at < 1 || at > 64) return null; // the part before the @ is at most 64 characters
  if (email.includes('..') || email.startsWith('.') || email.slice(0, at).endsWith('.')) return null;
  if (!EMAIL_RE.test(email)) return null;
  if (!/\.[a-z]{2,}$/.test(email)) return null; // the ending is letters (an IP-literal or a number is not an address we can write to)
  return email;
}

// ---- referral codes ------------------------------------------------------------------------------------------------------------------------

/** 32 characters without I, O, 0 and 1 (easy to read aloud and to type). The same set as the check constraint of migration 0016. */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 10; // 32^10 = 2^50 possibilities
export const REFERRAL_CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;

export type RandomBytes = (n: number) => Uint8Array;
export const systemRandom: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** A random public share code. 256 is a multiple of 32, so taking the low five bits of a random byte has no bias. */
export function generateReferralCode(random: RandomBytes = systemRandom): string {
  const bytes = random(REFERRAL_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) code += REFERRAL_ALPHABET[bytes[i] & 31];
  return code;
}

/** The PRIVATE view key: 128 random bits as 32 lower-case hex characters. It is shown once, to the person's own browser. */
export function generateViewKey(random: RandomBytes = systemRandom): string {
  return Array.from(random(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const VIEW_KEY_RE = /^[0-9a-f]{32}$/;

/** The code from ?ref=, upper-cased, or null when it is not a well-formed code (a bad ref never blocks a sign-up: it is just not counted). */
export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
}

export type StatsParse = { kind: 'ok'; code: string; key: string } | { kind: 'invalid' };

/** The body of waitlist-referrals: { code, key }. */
export function parseStatsBody(raw: unknown): StatsParse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'invalid' };
  const body = raw as Record<string, unknown>;
  const code = normalizeRefCode(body.code);
  const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : '';
  return code && VIEW_KEY_RE.test(key) ? { kind: 'ok', code, key } : { kind: 'invalid' };
}

/** What the database stores of a view key: an HMAC, so the table alone cannot be used to read anybody's counters. */
export const hashViewKey = (secret: string, key: string): Promise<string> => hmacHex(secret, `viewkey:${key}`);

/** utm / referrer: a short, harmless token. Anything else becomes null. */
export function cleanSource(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase().slice(0, 64);
  return /^[a-z0-9][a-z0-9._:/-]{0,63}$/.test(value) ? value : null;
}

export type JoinInput = { email: string; locale: Locale; source: string | null; refCode: string | null };
export type JoinParse =
  | { kind: 'ok'; input: JoinInput }
  | { kind: 'honeypot' }
  | { kind: 'invalid'; reason: 'bad_body' | 'bad_email' | 'no_consent' };

/**
 * The body of waitlist-join: { email, locale, source, consent: true, hp }. `hp` is the honeypot field: a human never sees it, so any non-empty value means a bot and the request
 * is dropped SILENTLY (the caller answers like a success, without storing anything). Consent must be the boolean true.
 */
export function parseJoinBody(raw: unknown): JoinParse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'invalid', reason: 'bad_body' };
  const body = raw as Record<string, unknown>;
  if (body.hp !== undefined && body.hp !== null && body.hp !== '') return { kind: 'honeypot' };
  const email = normalizeEmail(body.email);
  if (email === null) return { kind: 'invalid', reason: 'bad_email' };
  if (body.consent !== true) return { kind: 'invalid', reason: 'no_consent' };
  const locale: Locale = body.locale === 'en' ? 'en' : 'pt';
  return { kind: 'ok', input: { email, locale, source: cleanSource(body.source), refCode: normalizeRefCode(body.ref) } };
}

/** The client address as the platform reports it. Used only to be hashed; it is best-effort (a forged header can only move the abuse counters, never reach the data). */
export function clientIp(headers: Headers): string | null {
  const candidates = [headers.get('cf-connecting-ip'), headers.get('x-real-ip'), (headers.get('x-forwarded-for') ?? '').split(',')[0]];
  for (const c of candidates) {
    const v = (c ?? '').trim();
    if (v && v.length <= 45 && /^[0-9a-fA-F:.]+$/.test(v)) return v.toLowerCase();
  }
  return null;
}

/** The /24 (IPv4) or /48 (IPv6) network of an address, as text, or null when it is not an address. */
export function subnetOf(ip: string): string | null {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every((p) => p <= 255) ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : null;
  }
  if (!/^[0-9a-f:]+$/.test(ip) || !ip.includes(':')) return null;
  const [head, tail = ''] = ip.split('::');
  if (ip.split('::').length > 2) return null;
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const missing = ip.includes('::') ? 8 - left.length - right.length : 0;
  if (missing < 0) return null;
  const groups = [...left, ...Array(ip.includes('::') ? missing : 0).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups.slice(0, 3).map((g) => g.padStart(4, '0')).join(':')}::/48`;
}

/** HMAC-SHA256 (hex) of `message` with `secret`. WebCrypto: the same call works in Deno and in Node. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The keys the database sees: none of them is the address or the IP itself. */
export async function hashKeys(secret: string, email: string, ip: string | null): Promise<{ emailKey: string; ipHash: string | null; subnetHash: string | null }> {
  const subnet = ip ? subnetOf(ip) : null;
  return {
    emailKey: await hmacHex(secret, `email:${email}`),
    ipHash: ip ? await hmacHex(secret, `ip:${ip}`) : null,
    subnetHash: subnet ? await hmacHex(secret, `subnet:${subnet}`) : null,
  };
}

// ---- CORS ---------------------------------------------------------------------------------------------------------------------------------

/** CORS headers for an allowed origin, or null. The origin must be listed in PORTAL_ORIGIN exactly; there is never a wildcard. */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}
