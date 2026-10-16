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
