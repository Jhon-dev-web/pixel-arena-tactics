// Pure helpers of the "Avise-me no lançamento" block: no DOM, no network, no imports. The browser imports this file (waitlist.js) and the Node check (scripts/waitlist-check.mjs) imports the same one.
// Text from the server is never put in the page as HTML; the only things that come back are a status code and a number.
/** Replaces {name} in a template with the value as plain text (for textContent). */
export const fillText = (template, values) => String(template).replace(/\{(\w+)\}/g, (_, key) => (key in values ? String(values[key]) : ''));

/** A light check of the address for the form (the server checks again, and decides). */
export function looksLikeEmail(value) {
  const email = String(value ?? '').trim();
  return email.length >= 6 && email.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[a-zA-Z]{2,}$/.test(email);
}

/** The addresses of the two functions and of the counter. `base` is the public project address already cleaned by cleanSupabaseUrl (season-core.js); null = not configured. */
export function waitlistEndpoints(base) {
  if (!base) return null;
  return { join: `${base}/functions/v1/waitlist-join`, unsubscribe: `${base}/functions/v1/waitlist-unsubscribe`, count: `${base}/rest/v1/rpc/waitlist_count` };
}

/** utm_source, else the referrer host: a short harmless token, or null. The server cleans it again. */
export function sourceFrom(search, referrer, ownHost = '') {
  let value = '';
  try { value = new URLSearchParams(String(search ?? '')).get('utm_source') ?? ''; } catch { value = ''; }
  if (!value && referrer) {
    try { const host = new URL(referrer).hostname; if (host && host !== ownHost) value = host; } catch { value = ''; }
  }
  value = value.trim().toLowerCase().slice(0, 64);
  return /^[a-z0-9][a-z0-9._:/-]{0,63}$/.test(value) ? value : null;
}

/** The JSON body sent to waitlist-join. `hp` is the honeypot as typed (a person leaves it empty). */
export function buildJoinBody({ email, consent, hp, lang, source }) {
  return { email: String(email ?? '').trim(), locale: lang === 'en' ? 'en' : 'pt', source: source ?? null, consent: consent === true, hp: String(hp ?? '') };
}

/**
 * What the form shows after the function answered. A new address and one that was already on the list get the same 200 and so the same text. Anything unexpected is "failed".
 * Returns one of: 'registered' | 'badEmail' | 'needConsent' | 'rateLimited' | 'failed'.
 */
export function classifyJoin(status, body) {
  if (status === 200 && body && body.ok === true) return 'registered';
  if (status === 400 && body) {
    if (body.error === 'bad_email') return 'badEmail';
    if (body.error === 'no_consent') return 'needConsent';
  }
  if (status === 429) return 'rateLimited';
  return 'failed';
}

/** The counter: shown only for a real, non-negative whole number. null (flag off), an error or anything else shows nothing. */
export function countView(raw, lang, template) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
  return fillText(template, { n: new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US').format(value) });
}

/** Request for the counter (PostgREST rpc, public anon key). */
export function countRequest(endpoints, anonKey) {
  return { url: endpoints.count, init: { method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json', accept: 'application/json' }, body: '{}', cache: 'no-store' } };
}

/** The token of the unsubscribe link: only the characters a signed token has. */
export function tokenFrom(search) {
  let value = '';
  try { value = new URLSearchParams(String(search ?? '')).get('t') ?? ''; } catch { value = ''; }
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) && value.length <= 200 ? value : null;
}

export function classifyUnsubscribe(status, body) {
  if (status === 200 && body && body.ok === true) return 'done';
  if (status === 400) return 'bad';
  return 'failed';
}

// ---- referral links -----------------------------------------------------------------------------------------------------------------------

/** The same shapes the Edge Function accepts: a 10-letter public code (no I, O, 0, 1) and a 32-hex private view key. */
export const CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;
export const KEY_RE = /^[0-9a-f]{32}$/;
export const REF_STORAGE_KEY = 'arena.ref';
export const INVITE_STORAGE_KEY = 'arena.invite';

/** The ?ref=CODE of an invite link (upper-cased), or null. A malformed code is simply not used. */
export function refFromSearch(search) {
  let value = '';
  try { value = new URLSearchParams(String(search ?? '')).get('ref') ?? ''; } catch { value = ''; }
  value = value.trim().toUpperCase();
  return CODE_RE.test(value) ? value : null;
}

/** Adds the stored ?ref= (if any) to the body of the sign-up. */
export function withRef(body, ref) {
  return ref && CODE_RE.test(ref) ? { ...body, ref } : body;
}

/** What waitlist-join answered: { ok, code, key } with well-formed values, or null. */
export function parseJoinResult(json) {
  if (!json || json.ok !== true) return null;
  return CODE_RE.test(String(json.code)) && KEY_RE.test(String(json.key)) ? { code: json.code, key: json.key } : null;
}

/** The invite kept in this browser (JSON text from storage), validated, or null. It never holds the e-mail address. */
export function readInvite(text) {
  try {
    const value = JSON.parse(String(text));
    return value && CODE_RE.test(String(value.code)) && KEY_RE.test(String(value.key)) ? { code: value.code, key: value.key } : null;
  } catch { return null; }
}

/**
 * Which key to keep after a sign-up. The server hands the PUBLIC code of an address already on the list together with a throw-away key (so typing somebody else's address shows nothing of theirs):
 * when this browser already holds the key for that very code, keep it; otherwise take what came back.
 */
export function mergeInvite(stored, fresh) {
  return stored && fresh && stored.code === fresh.code ? stored : fresh;
}

/** `<site>/?ref=CODE`: from the configured site address, else the page's own origin. Anything that is not an http(s) origin, or a bad code, gives null. */
export function inviteUrl(siteUrl, origin, code) {
  if (!CODE_RE.test(String(code))) return null;
  for (const candidate of [siteUrl, origin]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' || url.protocol === 'http:') return `${url.origin}/?ref=${code}`;
    } catch { /* try the next one */ }
  }
  return null;
}

/** Share intents: they only OPEN the app or site of the network (no third-party script is loaded). The text and the link are percent-encoded. */
/** encodeURIComponent plus the five characters it leaves alone (! ' ( ) *), so nothing but letters, digits and %XX survives. */
const strictEncode = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export function shareLinks(url, text) {
  const u = strictEncode(url);
  const t = strictEncode(text);
  return {
    whatsapp: `https://wa.me/?text=${t}`,
    x: `https://twitter.com/intent/tweet?text=${t}`,
    telegram: `https://t.me/share/url?url=${u}&text=${strictEncode(text.split(url).join('').trim())}`,
  };
}

export const SHARE_PREFIXES = { whatsapp: 'https://wa.me/', x: 'https://twitter.com/intent/tweet', telegram: 'https://t.me/share/url' };

export function referralEndpoint(base) {
  return base ? `${base}/functions/v1/waitlist-referrals` : null;
}

/** The two counters of waitlist-referrals, or null when the answer is not what it should be. */
export function parseCounts(status, json) {
  if (status !== 200 || !json || json.ok !== true) return null;
  const whole = v => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
  const active = whole(json.qualified);
  const paying = whole(json.paying);
  if (active === null || paying === null) return null;
  const goal = whole(json.passGoal);
  return { active, paying, goal: goal || null };
}

/** The line under the invite link, as plain text (the script sets it with textContent). */
export function countsText(counts, lang, labels) {
  if (!counts) return '';
  const format = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US');
  return fillText(counts.goal ? labels.counts : labels.countsNoGoal, { active: format.format(counts.active), paying: format.format(counts.paying), goal: counts.goal ? format.format(counts.goal) : '' });
}
