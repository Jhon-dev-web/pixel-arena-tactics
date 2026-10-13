import { UUID_RE } from '../http.ts';
import { CheckoutInput, PaymentProvider, ProviderAction, ProviderEvent, WebhookRejected } from '../types.ts';

// Stripe, with plain fetch and Web Crypto: no SDK, so nothing to install and nothing added to the web bundle.
// Secrets are only ever read by NAME in index.ts (STRIPE_SECRET_KEY, STRIPE_PRICE_ADVENTURER_PASS, STRIPE_WEBHOOK_SECRET) and passed in here.

export const STRIPE_SIGNATURE_TOLERANCE_S = 300; // Stripe's own default
const STRIPE_API = 'https://api.stripe.com/v1';
const CHECKOUT_HOST = 'checkout.stripe.com';

export interface StripeConfig {
  secretKey: string;
  priceId: string;
  webhookSecret: string;
  fetchFn?: typeof fetch;
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string compare (lengths are public: hex digests). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/**
 * Stripe's documented scheme: header `t=<unix seconds>,v1=<hex>[,v1=<hex>...]`; signed payload is `<t>.<raw body>`; HMAC-SHA256 keyed with the
 * endpoint secret. Rejects a missing/garbled header, a signature that matches none of the v1 values, and a timestamp further than the tolerance
 * from now (replay of an old delivery, or a clock far in the future).
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowMs: number, toleranceS = STRIPE_SIGNATURE_TOLERANCE_S): Promise<void> {
  if (!header || !secret) throw new WebhookRejected('missing_signature');
  let timestamp = '';
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') candidates.push(v);
  }
  if (!/^\d{1,12}$/.test(timestamp) || candidates.length === 0) throw new WebhookRejected('missing_signature');
  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!candidates.some((c) => safeEqual(c, expected))) throw new WebhookRejected('bad_signature');
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceS) throw new WebhookRejected('stale');
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Maps a (signature-verified) Stripe event to what we do about it. Pure. */
export function mapStripeEvent(event: unknown): ProviderEvent {
  if (!isObj(event)) throw new WebhookRejected('bad_payload');
  const eventId = str(event.id);
  const type = str(event.type);
  const obj = isObj(event.data) && isObj(event.data.object) ? event.data.object : null;
  if (!eventId || !/^evt_[A-Za-z0-9_]{3,200}$/.test(eventId) || !type || !obj) throw new WebhookRejected('bad_payload');

  const summary: ProviderEvent['summary'] = { type, livemode: event.livemode === true };
  const ignore = (reason: string): ProviderEvent => ({ eventId, summary: { ...summary, reason }, action: { type: 'ignore', reason } });

  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    const metadata = isObj(obj.metadata) ? obj.metadata : {};
    summary.payment_status = str(obj.payment_status);
    if (metadata.kind !== 'adventurer_pass') return ignore('not_a_pass_session'); // another product of the same Stripe account
    if (obj.mode !== 'payment') return ignore('not_payment_mode');
    if (obj.payment_status !== 'paid') return ignore('not_paid');
    const userId = str(obj.client_reference_id);
    if (!userId || !UUID_RE.test(userId)) throw new WebhookRejected('bad_payload');
    if (metadata.user_id !== undefined && String(metadata.user_id).toLowerCase() !== userId.toLowerCase()) throw new WebhookRejected('bad_payload');
    const providerRef = str(obj.payment_intent) ?? str(obj.id);
    if (!providerRef || providerRef.length > 200) throw new WebhookRejected('bad_payload');
    summary.ref = providerRef;
    const action: ProviderAction = { type: 'grant', userId: userId.toLowerCase(), providerRef, kind: 'adventurer_pass' };
    return { eventId, summary, action };
  }

  if (type === 'charge.refunded') {
    const ref = str(obj.payment_intent);
    if (!ref) return ignore('no_payment_intent');
    summary.ref = ref;
    if (obj.refunded !== true) return ignore('partial_refund'); // only a full refund takes the Pass back
    return { eventId, summary, action: { type: 'reverse', providerRef: ref, reason: 'refund' } };
  }

  if (type === 'charge.dispute.created') {
    const ref = str(obj.payment_intent);
    if (!ref) return ignore('no_payment_intent');
    summary.ref = ref;
    return { eventId, summary, action: { type: 'reverse', providerRef: ref, reason: 'dispute' } };
  }

  return ignore('unhandled_type');
}

export function createStripeProvider(cfg: StripeConfig): PaymentProvider {
  const doFetch = cfg.fetchFn ?? fetch;
  return {
    name: 'stripe',

    async createCheckout(input: CheckoutInput) {
      const form = new URLSearchParams();
      form.set('mode', 'payment');
      form.set('line_items[0][price]', cfg.priceId);
      form.set('line_items[0][quantity]', '1');
      form.set('client_reference_id', input.userId);
      form.set('metadata[user_id]', input.userId);
      form.set('metadata[kind]', 'adventurer_pass');
      form.set('payment_intent_data[metadata][user_id]', input.userId);
      form.set('payment_intent_data[metadata][kind]', 'adventurer_pass');
      form.set('success_url', input.successUrl);
      form.set('cancel_url', input.cancelUrl);
      const res = await doFetch(`${STRIPE_API}/checkout/sessions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!res.ok) throw new Error(`stripe_checkout_${res.status}`); // status only: the response body may echo request data
      const body = (await res.json()) as { url?: unknown };
      const url = typeof body.url === 'string' ? body.url : '';
      let host = '';
      try {
        const u = new URL(url);
        host = u.protocol === 'https:' ? u.hostname : '';
      } catch {
        /* falls through */
      }
      if (host !== CHECKOUT_HOST) throw new Error('stripe_checkout_bad_url');
      return { url };
    },

    async parseWebhook(rawBody: string, headers: Headers, nowMs: number) {
      await verifyStripeSignature(rawBody, headers.get('stripe-signature'), cfg.webhookSecret, nowMs);
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new WebhookRejected('bad_payload');
      }
      return mapStripeEvent(parsed);
    },
  };
}
