import { describe, expect, it, vi } from 'vitest';
import { handleCreateCheckout, CHECKOUT_PENDING_MS, CHECKOUT_RATE_LIMIT, CHECKOUT_REUSE_MIN_REMAINING_MS, AttemptRow, CheckoutDeps, decideCheckoutClaim } from '../checkout.ts';
import { handleWebhook } from '../webhook.ts';
import { createRestStore } from '../db.ts';
import { parseAllowedOrigins } from '../http.ts';
import { createStripeProvider, hmacSha256Hex, mapStripeEvent, verifyStripeSignature } from '../providers/stripe.ts';
import { CheckoutClaim, CheckoutSession, EntitlementKind, EntitlementSource, InsertEntitlementResult, ProviderEvent, Store, WebhookRejected } from '../types.ts';

// Everything here runs under the Node test runner. The Edge Functions were NEVER executed in Deno from this repo (no Deno installed): these tests
// cover the pure parts (signature, mapping, idempotency, refusal paths) through the same modules the functions import.

const NOW = 1_800_000_000_000;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const ORIGIN = 'https://game.example.test';
// A secret that only exists inside this test run. It is not a real Stripe secret.
const WEBHOOK_SECRET = `whsec_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`;

async function sign(body: string, secret = WEBHOOK_SECRET, tSeconds = Math.floor(NOW / 1000)): Promise<string> {
  return `t=${tSeconds},v1=${await hmacSha256Hex(secret, `${tSeconds}.${body}`)}`;
}

interface MemAttempt extends AttemptRow {
  id: number;
  userId: string;
  sessionId: string | null;
}

class MemoryStore implements Store {
  entitlements: { userId: string; kind: EntitlementKind; source: EntitlementSource; providerRef: string; livemode: boolean; status: string }[] = [];
  events = new Map<string, { summary: ProviderEvent['summary']; result: string | null }>();
  attempts: MemAttempt[] = [];
  failNextEventWrite = false;
  now = NOW;
  /** Test helper: an attempt made `agoMs` ago (with or without a stored session). */
  addAttempt(userId: string, agoMs: number, session?: { url: string; expiresInMs: number; id?: string }) {
    this.attempts.push({ id: this.attempts.length + 1, userId, sessionId: session?.id ?? null, createdAtMs: NOW - agoMs, sessionUrl: session?.url ?? null, sessionExpiresAtMs: session ? NOW + session.expiresInMs : null, completed: false });
  }
  async hasActiveEntitlement(userId: string, kind: EntitlementKind) {
    return this.entitlements.some((e) => e.userId === userId && e.kind === kind && e.status === 'active');
  }
  // The same rules as the SQL function, through the same pure decision; synchronous inside, like the database's per-user lock.
  async claimCheckout(userId: string): Promise<CheckoutClaim> {
    const d = decideCheckoutClaim(this.attempts.filter((a) => a.userId === userId), this.now);
    if (d.outcome !== 'create') return d;
    const id = this.attempts.length + 1;
    this.attempts.push({ id, userId, sessionId: null, createdAtMs: this.now, sessionUrl: null, sessionExpiresAtMs: null, completed: false });
    return { outcome: 'create', attemptId: id };
  }
  async attachCheckoutSession(attemptId: number, session: CheckoutSession) {
    const a = this.attempts.find((x) => x.id === attemptId)!;
    a.sessionUrl = session.url;
    a.sessionId = session.id;
    a.sessionExpiresAtMs = session.expiresAtMs;
  }
  async abandonCheckoutAttempt(attemptId: number) {
    this.attempts = this.attempts.filter((x) => x.id !== attemptId);
  }
  async completeCheckoutSession(sessionId: string) {
    this.attempts.filter((a) => a.sessionId === sessionId).forEach((a) => (a.completed = true));
  }
  async recordPaymentEvent(provider: string, eventId: string, summary: ProviderEvent['summary']) {
    if (this.failNextEventWrite) {
      this.failNextEventWrite = false;
      throw new Error('event_write_500');
    }
    const key = `${provider}:${eventId}`;
    const seen = this.events.get(key);
    if (seen) return { isNew: false, processed: seen.result !== null };
    this.events.set(key, { summary, result: null });
    return { isNew: true, processed: false };
  }
  async finishPaymentEvent(provider: string, eventId: string, result: string) {
    this.events.get(`${provider}:${eventId}`)!.result = result;
  }
  async insertEntitlement(row: { userId: string; kind: EntitlementKind; source: EntitlementSource; providerRef: string; livemode: boolean }): Promise<InsertEntitlementResult> {
    if (this.entitlements.some((e) => e.source === row.source && e.providerRef === row.providerRef)) return 'duplicate_ref';
    if (this.entitlements.some((e) => e.userId === row.userId && e.kind === row.kind && e.status === 'active')) return 'already_active';
    this.entitlements.push({ ...row, status: 'active' });
    return 'inserted';
  }
  async markReversed(source: EntitlementSource, providerRef: string, reason: 'refund' | 'dispute') {
    const rows = this.entitlements.filter((e) => e.source === source && e.providerRef === providerRef && e.status === 'active');
    rows.forEach((r) => (r.status = reason === 'dispute' ? 'revoked' : 'refunded'));
    return rows.length;
  }
  async restoreRevoked(source: EntitlementSource, providerRef: string) {
    const row = this.entitlements.find((e) => e.source === source && e.providerRef === providerRef && e.status === 'revoked');
    if (!row) return 'none' as const;
    if (this.entitlements.some((e) => e.userId === row.userId && e.kind === row.kind && e.status === 'active')) return 'blocked' as const;
    row.status = 'active';
    return 'restored' as const;
  }
}

const sessionEvent = (over: Record<string, unknown> = {}, objOver: Record<string, unknown> = {}, type = 'checkout.session.completed') =>
  JSON.stringify({
    id: 'evt_test_1',
    type,
    livemode: false,
    data: {
      object: {
        id: 'cs_test_1',
        mode: 'payment',
        payment_status: 'paid',
        client_reference_id: USER_A,
        payment_intent: 'pi_test_1',
        metadata: { user_id: USER_A, kind: 'adventurer_pass' },
        customer_details: { email: 'private@example.test' },
        ...objOver,
      },
    },
    ...over,
  });

const webhookReq = async (body: string, header?: string | null) =>
  new Request('https://fn.test/stripe-webhook', { method: 'POST', body, headers: header === null ? {} : { 'stripe-signature': header ?? (await sign(body)) } });

function webhookDeps(store = new MemoryStore()) {
  const stripeCalls: { url: string; headers: Record<string, string>; form: URLSearchParams }[] = [];
  const state = { refundStatus: 200 };
  const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
    stripeCalls.push({ url, headers: init.headers as Record<string, string>, form: new URLSearchParams(String(init.body ?? '')) });
    return new Response(state.refundStatus === 200 ? JSON.stringify({ id: 're_test_1' }) : 'echoed secret body', { status: state.refundStatus });
  });
  const provider = createStripeProvider({ secretKey: 'sk_test_unused', priceId: 'price_test', webhookSecret: WEBHOOK_SECRET, fetchFn: fetchFn as unknown as typeof fetch });
  return { store, stripeCalls, state, deps: { provider, store, nowMs: () => NOW } };
}

describe('Stripe signature (documented scheme: t=..,v1=.. over "<t>.<raw body>")', () => {
  const body = '{"id":"evt_x"}';

  it('accepts a correct signature on the raw body', async () => {
    await expect(verifyStripeSignature(body, await sign(body), WEBHOOK_SECRET, NOW)).resolves.toBeUndefined();
  });
  it('accepts when any one of several v1 values matches', async () => {
    const good = await sign(body);
    await expect(verifyStripeSignature(body, `${good},v1=${'0'.repeat(64)}`, WEBHOOK_SECRET, NOW)).resolves.toBeUndefined();
  });
  it('rejects a body changed by even one byte, a wrong secret, and a missing or garbled header', async () => {
    const header = await sign(body);
    await expect(verifyStripeSignature(`${body} `, header, WEBHOOK_SECRET, NOW)).rejects.toMatchObject({ reason: 'bad_signature' });
    await expect(verifyStripeSignature(body, header, 'whsec_another', NOW)).rejects.toMatchObject({ reason: 'bad_signature' });
    await expect(verifyStripeSignature(body, null, WEBHOOK_SECRET, NOW)).rejects.toMatchObject({ reason: 'missing_signature' });
    await expect(verifyStripeSignature(body, 'garbage', WEBHOOK_SECRET, NOW)).rejects.toMatchObject({ reason: 'missing_signature' });
    await expect(verifyStripeSignature(body, `t=${Math.floor(NOW / 1000)}`, WEBHOOK_SECRET, NOW)).rejects.toMatchObject({ reason: 'missing_signature' });
  });
  it('rejects a stale (replayed) or far-future timestamp even with a valid HMAC', async () => {
    const old = await sign(body, WEBHOOK_SECRET, Math.floor(NOW / 1000) - 301);
    const future = await sign(body, WEBHOOK_SECRET, Math.floor(NOW / 1000) + 301);
    const edge = await sign(body, WEBHOOK_SECRET, Math.floor(NOW / 1000) - 299);
    await expect(verifyStripeSignature(body, old, WEBHOOK_SECRET, NOW)).rejects.toMatchObject({ reason: 'stale' });
    await expect(verifyStripeSignature(body, future, WEBHOOK_SECRET, NOW)).rejects.toMatchObject({ reason: 'stale' });
    await expect(verifyStripeSignature(body, edge, WEBHOOK_SECRET, NOW)).resolves.toBeUndefined();
  });
});

describe('Stripe event -> entitlement mapping', () => {
  it('a paid Pass session grants to the user in client_reference_id, keyed by the PaymentIntent', () => {
    const e = mapStripeEvent(JSON.parse(sessionEvent()));
    expect(e.action).toEqual({ type: 'grant', userId: USER_A, providerRef: 'pi_test_1', kind: 'adventurer_pass', livemode: false, sessionId: 'cs_test_1' });
  });
  it('the stored summary has ids and statuses only, never the customer data in the payload', () => {
    const e = mapStripeEvent(JSON.parse(sessionEvent()));
    expect(JSON.stringify(e.summary)).not.toContain('private@example.test');
    expect(Object.keys(e.summary).sort()).toEqual(['livemode', 'payment_status', 'ref', 'type']);
  });
  it('async_payment_succeeded grants too; unpaid, other products and non-payment modes are ignored', () => {
    expect(mapStripeEvent(JSON.parse(sessionEvent({}, {}, 'checkout.session.async_payment_succeeded'))).action.type).toBe('grant');
    expect(mapStripeEvent(JSON.parse(sessionEvent({}, { payment_status: 'unpaid' }))).action.type).toBe('ignore');
    expect(mapStripeEvent(JSON.parse(sessionEvent({}, { metadata: { kind: 'something_else', user_id: USER_A } }))).action.type).toBe('ignore');
    expect(mapStripeEvent(JSON.parse(sessionEvent({}, { mode: 'subscription' }))).action.type).toBe('ignore');
  });
  it('a missing/malformed user id, or metadata that disagrees with client_reference_id, is rejected rather than guessed', () => {
    expect(() => mapStripeEvent(JSON.parse(sessionEvent({}, { client_reference_id: 'not-a-uuid' })))).toThrow(WebhookRejected);
    expect(() => mapStripeEvent(JSON.parse(sessionEvent({}, { client_reference_id: null })))).toThrow(WebhookRejected);
    expect(() => mapStripeEvent(JSON.parse(sessionEvent({}, { metadata: { kind: 'adventurer_pass', user_id: USER_B } })))).toThrow(WebhookRejected);
    expect(() => mapStripeEvent({ id: 'nope', type: 'x', data: {} })).toThrow(WebhookRejected);
  });
  it('a full refund and a dispute reverse by PaymentIntent; a partial refund and unknown types are ignored', () => {
    const ev = (type: string, object: Record<string, unknown>) => mapStripeEvent({ id: 'evt_refund_a', type, data: { object } });
    expect(ev('charge.refunded', { payment_intent: 'pi_test_1', refunded: true }).action).toEqual({ type: 'reverse', providerRef: 'pi_test_1', reason: 'refund' });
    expect(ev('charge.dispute.created', { payment_intent: 'pi_test_1' }).action).toEqual({ type: 'reverse', providerRef: 'pi_test_1', reason: 'dispute' });
    expect(ev('charge.dispute.closed', { payment_intent: 'pi_test_1', status: 'won' }).action).toEqual({ type: 'restore', providerRef: 'pi_test_1' });
    expect(ev('charge.dispute.closed', { payment_intent: 'pi_test_1', status: 'lost' }).action.type).toBe('ignore');
    expect(ev('charge.refunded', { payment_intent: 'pi_test_1', refunded: false }).action.type).toBe('ignore');
    expect(ev('customer.created', {}).action.type).toBe('ignore');
  });
});

describe('stripe-webhook handler', () => {
  it('grants the Pass once for a signed paid session and records the event', async () => {
    const { store, deps } = webhookDeps();
    const res = await handleWebhook(await webhookReq(sessionEvent()), deps);
    expect(res.status).toBe(200);
    expect(store.entitlements).toEqual([{ userId: USER_A, kind: 'adventurer_pass', source: 'stripe', providerRef: 'pi_test_1', livemode: false, status: 'active' }]);
    expect(store.events.get('stripe:evt_test_1')?.result).toBe('granted');
  });

  it('is idempotent: replaying the same event (or a new event for the same payment) never creates a second row', async () => {
    const { store, deps } = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent()), deps);
    const replay = await handleWebhook(await webhookReq(sessionEvent()), deps);
    expect(await replay.json()).toMatchObject({ duplicate: true });
    const sameSessionOtherEvent = await handleWebhook(await webhookReq(sessionEvent({ id: 'evt_test_2' })), deps);
    expect(sameSessionOtherEvent.status).toBe(200);
    expect(store.entitlements).toHaveLength(1);
    expect(store.events.get('stripe:evt_test_2')?.result).toBe('already_active');
  });

  it('a second, different payment by a user who already owns the Pass creates nothing and is refunded automatically (idempotency key = the event id)', async () => {
    const { store, deps, stripeCalls } = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent()), deps);
    expect(stripeCalls).toHaveLength(0); // the first, legitimate payment is never refunded
    const second = await webhookReq(sessionEvent({ id: 'evt_test_3' }, { id: 'cs_test_2', payment_intent: 'pi_test_2' }));
    expect((await handleWebhook(second, deps)).status).toBe(200);
    expect(store.entitlements).toHaveLength(1);
    expect(store.events.get('stripe:evt_test_3')?.result).toBe('duplicate_refunded');
    expect(stripeCalls).toHaveLength(1);
    expect(stripeCalls[0].url).toBe('https://api.stripe.com/v1/refunds');
    expect(stripeCalls[0].form.get('payment_intent')).toBe('pi_test_2');
    expect(stripeCalls[0].headers['idempotency-key']).toBe('evt_test_3');
    // the same delivery again is a duplicate: no second refund call
    await handleWebhook(await webhookReq(sessionEvent({ id: 'evt_test_3' }, { id: 'cs_test_2', payment_intent: 'pi_test_2' })), deps);
    expect(stripeCalls).toHaveLength(1);
  });

  it('a refund that Stripe refuses answers 500 (so the delivery is retried with the same idempotency key) and the retry refunds once it works', async () => {
    const { store, deps, stripeCalls, state } = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent()), deps);
    const body = sessionEvent({ id: 'evt_test_4' }, { id: 'cs_test_2', payment_intent: 'pi_test_2' });
    state.refundStatus = 500;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleWebhook(await webhookReq(body), deps)).status).toBe(500);
    spy.mockRestore();
    expect(store.events.get('stripe:evt_test_4')?.result).toBeNull();
    state.refundStatus = 200;
    expect((await handleWebhook(await webhookReq(body), deps)).status).toBe(200);
    expect(store.events.get('stripe:evt_test_4')?.result).toBe('duplicate_refunded');
    expect(stripeCalls.map((c) => c.headers['idempotency-key'])).toEqual(['evt_test_4', 'evt_test_4']);
    expect(store.entitlements.filter((e) => e.status === 'active')).toHaveLength(1);
  });

  it('the livemode of the event is stored on the entitlement (test-mode purchases are told apart from live ones)', async () => {
    const live = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent({ livemode: true })), live.deps);
    expect(live.store.entitlements[0].livemode).toBe(true);
    const test = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent({ livemode: false })), test.deps);
    expect(test.store.entitlements[0].livemode).toBe(false);
  });

  it('a dispute opened records revoked (not refunded); a dispute won restores the Pass; a dispute lost leaves it revoked', async () => {
    const dispute = (id: string, type: string, status?: string) => JSON.stringify({ id, type, data: { object: { payment_intent: 'pi_test_1', ...(status ? { status } : {}) } } });
    const { store, deps } = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent()), deps);
    await handleWebhook(await webhookReq(dispute('evt_dispute_1', 'charge.dispute.created')), deps);
    expect(store.entitlements[0].status).toBe('revoked');
    expect(store.events.get('stripe:evt_dispute_1')?.result).toBe('revoked');
    await handleWebhook(await webhookReq(dispute('evt_dispute_2', 'charge.dispute.closed', 'lost')), deps);
    expect(store.entitlements[0].status).toBe('revoked');
    expect(store.events.get('stripe:evt_dispute_2')?.result).toBe('ignored:dispute_not_won');
    await handleWebhook(await webhookReq(dispute('evt_dispute_3', 'charge.dispute.closed', 'won')), deps);
    expect(store.entitlements[0].status).toBe('active');
    expect(store.events.get('stripe:evt_dispute_3')?.result).toBe('restored');
  });

  it('a won dispute does not restore a Pass the player re-bought meanwhile (one active Pass per user), and a refunded one is never restored', async () => {
    const closed = (id: string) => JSON.stringify({ id, type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_test_1', status: 'won' } } });
    const { store, deps } = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent()), deps);
    store.entitlements[0].status = 'revoked';
    await handleWebhook(await webhookReq(sessionEvent({ id: 'evt_test_5' }, { id: 'cs_test_5', payment_intent: 'pi_test_5' })), deps); // bought again
    await handleWebhook(await webhookReq(closed('evt_dispute_5')), deps);
    expect(store.events.get('stripe:evt_dispute_5')?.result).toBe('restore_blocked_already_active');
    expect(store.entitlements.find((e) => e.providerRef === 'pi_test_1')!.status).toBe('revoked');
    const refunded = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent()), refunded.deps);
    refunded.store.entitlements[0].status = 'refunded';
    await handleWebhook(await webhookReq(closed('evt_dispute_6')), refunded.deps);
    expect(refunded.store.entitlements[0].status).toBe('refunded');
  });

  it('rejects unsigned, wrongly signed and stale deliveries with 400 and writes nothing', async () => {
    const { store, deps } = webhookDeps();
    const body = sessionEvent();
    expect((await handleWebhook(await webhookReq(body, null), deps)).status).toBe(400);
    expect((await handleWebhook(await webhookReq(body, await sign(body, 'whsec_attacker')), deps)).status).toBe(400);
    expect((await handleWebhook(await webhookReq(body, await sign(body, WEBHOOK_SECRET, Math.floor(NOW / 1000) - 3600)), deps)).status).toBe(400);
    expect((await handleWebhook(await webhookReq(''), deps)).status).toBe(400);
    expect(store.entitlements).toHaveLength(0);
    expect(store.events.size).toBe(0);
  });

  it('a signed event for another user id in the body cannot be forged: the id is the one Stripe signed, and a tampered body fails the signature', async () => {
    const { store, deps } = webhookDeps();
    const original = sessionEvent();
    const header = await sign(original);
    const tampered = original.replaceAll(USER_A, USER_B);
    expect((await handleWebhook(await webhookReq(tampered, header), deps)).status).toBe(400);
    expect(store.entitlements).toHaveLength(0);
  });

  it('a refund marks the entitlement refunded; an unknown payment is recorded as unmatched', async () => {
    const { store, deps } = webhookDeps();
    await handleWebhook(await webhookReq(sessionEvent()), deps);
    const refund = JSON.stringify({ id: 'evt_refund_1', type: 'charge.refunded', data: { object: { payment_intent: 'pi_test_1', refunded: true } } });
    expect((await handleWebhook(await webhookReq(refund), deps)).status).toBe(200);
    expect(store.entitlements[0].status).toBe('refunded');
    const unknown = JSON.stringify({ id: 'evt_refund_2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_other', refunded: true } } });
    await handleWebhook(await webhookReq(unknown), deps);
    expect(store.events.get('stripe:evt_refund_2')?.result).toBe('unmatched');
    // after a refund the same user can buy again
    await handleWebhook(await webhookReq(sessionEvent({ id: 'evt_test_9' }, { payment_intent: 'pi_test_9' })), deps);
    expect(store.entitlements.filter((e) => e.status === 'active')).toHaveLength(1);
  });

  it('a store failure answers 500 (so Stripe retries) and the retry then succeeds exactly once', async () => {
    const { store, deps } = webhookDeps();
    store.failNextEventWrite = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleWebhook(await webhookReq(sessionEvent()), deps)).status).toBe(500);
    spy.mockRestore();
    expect((await handleWebhook(await webhookReq(sessionEvent()), deps)).status).toBe(200);
    expect(store.entitlements).toHaveLength(1);
  });

  it('refuses a non-POST and never logs the secret, the signature or the payload', async () => {
    const { deps } = webhookDeps();
    const logs: string[] = [];
    const spies = (['log', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' '))));
    expect((await handleWebhook(new Request('https://fn.test/x', { method: 'GET' }), deps)).status).toBe(405);
    await handleWebhook(await webhookReq(sessionEvent()), deps);
    await handleWebhook(await webhookReq(sessionEvent(), 't=1,v1=abc'), deps);
    spies.forEach((s) => s.mockRestore());
    const all = logs.join('\n');
    expect(all).not.toContain(WEBHOOK_SECRET);
    expect(all).not.toContain('private@example.test');
    expect(all).not.toContain('v1=');
    expect(all).not.toContain(USER_A);
  });
});

describe('create-checkout handler', () => {
  const fetchOk = (id: string) => vi.fn(async () => new Response(JSON.stringify({ id }), { status: 200 }));
  function setup(over: Partial<CheckoutDeps> = {}, authId: string | null = USER_A) {
    const store = new MemoryStore();
    const stripeFetch = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc', expires_at: Math.floor(NOW / 1000) + 24 * 3600 }), { status: 200, headers: { 'x-body': String(init?.body ?? '') } }));
    const provider = createStripeProvider({ secretKey: 'sk_test_unused', priceId: 'price_from_secret', webhookSecret: WEBHOOK_SECRET, fetchFn: stripeFetch as unknown as typeof fetch });
    const authFetch = authId ? fetchOk(authId) : vi.fn(async () => new Response('{}', { status: 401 }));
    const deps: CheckoutDeps = {
      auth: { supabaseUrl: 'https://proj.supabase.test', anonKey: 'anon_test', fetchFn: authFetch as unknown as typeof fetch },
      allowedOrigins: [ORIGIN],
      provider,
      store,
      nowMs: () => NOW,
      ...over,
    };
    return { store, deps, stripeFetch, authFetch };
  }
  const req = (init: { body?: string; auth?: string | null; origin?: string | null; method?: string } = {}) =>
    new Request('https://fn.test/create-checkout', {
      method: init.method ?? 'POST',
      body: init.body,
      headers: {
        ...(init.auth === null ? {} : { authorization: `Bearer ${init.auth ?? 'a'.repeat(40)}` }),
        ...(init.origin === null ? {} : { origin: init.origin ?? ORIGIN }),
      },
    });

  it('creates a Checkout Session for the JWT user: price from the secret, user id in client_reference_id, redirect URLs from the allow-listed origin', async () => {
    const { deps, stripeFetch, store } = setup();
    const res = await handleCreateCheckout(req(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_abc' });
    const sent = new URLSearchParams(String((stripeFetch.mock.calls[0][1] as RequestInit).body));
    expect(sent.get('mode')).toBe('payment');
    expect(sent.get('line_items[0][price]')).toBe('price_from_secret');
    expect(sent.get('client_reference_id')).toBe(USER_A);
    expect(sent.get('metadata[user_id]')).toBe(USER_A);
    expect(sent.get('success_url')).toBe(`${ORIGIN}/?pass=success`);
    expect(sent.get('cancel_url')).toBe(`${ORIGIN}/?pass=cancel`);
    expect(store.attempts).toHaveLength(1);
  });

  it('takes the user id from the JWT, never from the body (a body naming another user changes nothing and is not even read)', async () => {
    const { deps, stripeFetch } = setup();
    const res = await handleCreateCheckout(req({ body: JSON.stringify({ userId: USER_B, user_id: USER_B, client_reference_id: USER_B, success_url: 'https://evil.test' }) }), deps);
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String((stripeFetch.mock.calls[0][1] as RequestInit).body));
    expect(sent.get('client_reference_id')).toBe(USER_A);
    expect(sent.get('success_url')).toBe(`${ORIGIN}/?pass=success`);
  });

  it('refuses without a valid JWT (401) and never reaches the provider', async () => {
    const noHeader = setup();
    expect((await handleCreateCheckout(req({ auth: null }), noHeader.deps)).status).toBe(401);
    const rejected = setup({}, null);
    expect((await handleCreateCheckout(req(), rejected.deps)).status).toBe(401);
    expect(noHeader.stripeFetch).not.toHaveBeenCalled();
    expect(rejected.stripeFetch).not.toHaveBeenCalled();
  });

  it('refuses a user who already owns the Pass (409)', async () => {
    const { deps, store, stripeFetch } = setup();
    store.entitlements.push({ userId: USER_A, kind: 'adventurer_pass', source: 'grant', providerRef: 'g1', livemode: false, status: 'active' });
    const res = await handleCreateCheckout(req(), deps);
    expect(res.status).toBe(409);
    expect(stripeFetch).not.toHaveBeenCalled();
  });

  it('a refunded owner may buy again', async () => {
    const { deps, store } = setup();
    store.entitlements.push({ userId: USER_A, kind: 'adventurer_pass', source: 'stripe', providerRef: 'pi_old', livemode: false, status: 'refunded' });
    expect((await handleCreateCheckout(req(), deps)).status).toBe(200);
  });

  it('rate-limits one user (429 after the window quota) without affecting another', async () => {
    const { deps, store } = setup();
    // attempts whose session already expired (so nothing can be reused) still count toward the limit
    for (let i = 0; i < CHECKOUT_RATE_LIMIT.max; i++) store.addAttempt(USER_A, 120_000 + i, { url: 'https://checkout.stripe.com/c/pay/old', expiresInMs: 1000 });
    expect((await handleCreateCheckout(req(), deps)).status).toBe(429);
    store.attempts.length = 0;
    for (let i = 0; i < CHECKOUT_RATE_LIMIT.max; i++) store.addAttempt(USER_A, CHECKOUT_RATE_LIMIT.windowMs + 1 + i, { url: 'https://checkout.stripe.com/c/pay/old', expiresInMs: 1000 });
    expect((await handleCreateCheckout(req(), deps)).status).toBe(200); // old attempts left the window
    const other = setup({}, USER_B);
    for (let i = 0; i < CHECKOUT_RATE_LIMIT.max; i++) other.store.addAttempt(USER_A, 120_000 + i, { url: 'https://checkout.stripe.com/c/pay/old', expiresInMs: 1000 });
    expect((await handleCreateCheckout(req(), other.deps)).status).toBe(200);
  });

  it('refuses an Origin that is not in APP_ORIGIN, answers 503 when unconfigured, and 405 for GET', async () => {
    const { deps } = setup();
    expect((await handleCreateCheckout(req({ origin: 'https://evil.test' }), deps)).status).toBe(403);
    expect((await handleCreateCheckout(req(), { ...deps, allowedOrigins: [] })).status).toBe(503);
    expect((await handleCreateCheckout(req(), { ...deps, provider: null })).status).toBe(503);
    expect((await handleCreateCheckout(req({ method: 'GET' }), deps)).status).toBe(405);
  });

  it('answers the CORS preflight only for the allowed origin', async () => {
    const { deps } = setup();
    const ok = await handleCreateCheckout(req({ method: 'OPTIONS' }), deps);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const bad = await handleCreateCheckout(req({ method: 'OPTIONS', origin: 'https://evil.test' }), deps);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('a provider failure is a generic 502 that does not leak the cause, and a non-Stripe URL is never returned', async () => {
    const badUrl = setup();
    const provider = createStripeProvider({
      secretKey: 'sk_test_unused',
      priceId: 'p',
      webhookSecret: WEBHOOK_SECRET,
      fetchFn: (async () => new Response(JSON.stringify({ url: 'https://evil.test/pay' }), { status: 200 })) as unknown as typeof fetch,
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleCreateCheckout(req(), { ...badUrl.deps, provider });
    spy.mockRestore();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'checkout_failed' });
  });
});

describe('create-checkout: one open session per user, atomic limit', () => {
  const stripeOk = () =>
    vi.fn(async () => new Response(JSON.stringify({ id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/cs_test_abc', expires_at: Math.floor(NOW / 1000) + 24 * 3600 }), { status: 200 }));
  function setup2(stripeFetch = stripeOk(), userId = USER_A) {
    const store = new MemoryStore();
    const provider = createStripeProvider({ secretKey: 'sk_test_unused', priceId: 'p', webhookSecret: WEBHOOK_SECRET, fetchFn: stripeFetch as unknown as typeof fetch });
    const authFetch = vi.fn(async () => new Response(JSON.stringify({ id: userId }), { status: 200 }));
    const deps: CheckoutDeps = { auth: { supabaseUrl: 'https://proj.supabase.test', anonKey: 'anon_test', fetchFn: authFetch as unknown as typeof fetch }, allowedOrigins: [ORIGIN], provider, store, nowMs: () => NOW };
    return { store, deps, stripeFetch };
  }
  const r = () => new Request('https://fn.test/create-checkout', { method: 'POST', headers: { authorization: `Bearer ${'a'.repeat(40)}`, origin: ORIGIN } });

  it('a second request while the first session is still open gets the SAME url and creates no second Stripe session (and spends no rate-limit quota)', async () => {
    const { deps, store, stripeFetch } = setup2();
    const first = await (await handleCreateCheckout(r(), deps)).json();
    const second = await (await handleCreateCheckout(r(), deps)).json();
    expect(second).toEqual(first);
    expect(stripeFetch).toHaveBeenCalledTimes(1);
    expect(store.attempts).toHaveLength(1);
    expect(store.attempts[0].sessionId).toBe('cs_test_abc');
  });

  it('two parallel requests create exactly one session: the loser is told to retry (429 checkout_in_progress), never a second charge page', async () => {
    const { deps, stripeFetch } = setup2();
    const [a, b] = await Promise.all([handleCreateCheckout(r(), deps), handleCreateCheckout(r(), deps)]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    const loser = a.status === 429 ? a : b;
    expect(await loser.json()).toEqual({ error: 'checkout_in_progress' });
    expect(stripeFetch).toHaveBeenCalledTimes(1);
  });

  it('a session that was paid (or expired) is not offered again, and a failed provider call frees the attempt so the next try is not blocked', async () => {
    const { deps, store, stripeFetch } = setup2();
    await handleCreateCheckout(r(), deps);
    await store.completeCheckoutSession('cs_test_abc'); // the webhook saw it paid (and the refund removed the Pass again)
    expect((await handleCreateCheckout(r(), deps)).status).toBe(200);
    expect(stripeFetch).toHaveBeenCalledTimes(2);

    const failing = setup2(vi.fn(async () => new Response('x', { status: 500 })));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleCreateCheckout(r(), failing.deps)).status).toBe(502);
    spy.mockRestore();
    expect(failing.store.attempts).toHaveLength(0);
  });

  it('decideCheckoutClaim: the order is reuse, then in-progress, then the rate limit, then create', () => {
    const att = (ago: number, session?: { remaining: number }, completed = false): AttemptRow => ({
      createdAtMs: NOW - ago,
      sessionUrl: session ? 'https://checkout.stripe.com/c/pay/x' : null,
      sessionExpiresAtMs: session ? NOW + session.remaining : null,
      completed,
    });
    expect(decideCheckoutClaim([], NOW)).toEqual({ outcome: 'create' });
    expect(decideCheckoutClaim([att(1000, { remaining: 3_600_000 })], NOW).outcome).toBe('reuse');
    expect(decideCheckoutClaim([att(1000, { remaining: CHECKOUT_REUSE_MIN_REMAINING_MS - 1 })], NOW).outcome).toBe('create'); // about to expire: not offered
    expect(decideCheckoutClaim([att(1000, { remaining: 3_600_000 }, true)], NOW).outcome).toBe('create'); // paid
    expect(decideCheckoutClaim([att(1000)], NOW).outcome).toBe('in_progress');
    expect(decideCheckoutClaim([att(CHECKOUT_PENDING_MS + 1)], NOW).outcome).toBe('create'); // a crashed request does not block forever
    const many = Array.from({ length: CHECKOUT_RATE_LIMIT.max }, (_, i) => att(2000 + i, { remaining: 1000 }));
    expect(decideCheckoutClaim(many, NOW).outcome).toBe('rate_limited');
    expect(decideCheckoutClaim([...many, att(500, { remaining: 3_600_000 })], NOW).outcome).toBe('reuse'); // an open session beats the limit: the user keeps his page
  });

  it('the Stripe refund call: POST /v1/refunds, form-encoded PaymentIntent, the idempotency key header, status-only errors', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const provider = createStripeProvider({
      secretKey: 'sk_test_unused',
      priceId: 'p',
      webhookSecret: WEBHOOK_SECRET,
      fetchFn: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('secret body', { status: 402 });
      }) as unknown as typeof fetch,
    });
    await expect(provider.refundPayment('pi_x', 'evt_x')).rejects.toThrow('stripe_refund_402');
    expect(calls[0].url).toBe('https://api.stripe.com/v1/refunds');
    expect((calls[0].init.headers as Record<string, string>)['idempotency-key']).toBe('evt_x');
    expect(String(calls[0].init.body)).toContain('payment_intent=pi_x');
  });
});

describe('helpers', () => {
  it('APP_ORIGIN accepts https origins (and http only on localhost), drops anything else', () => {
    expect(parseAllowedOrigins('https://a.test, http://localhost:5173 ,http://evil.test, ftp://x, nonsense, https://b.test/path')).toEqual(['https://a.test', 'http://localhost:5173', 'https://b.test']);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it('the REST store uses the service role for entitlements and maps the two unique violations apart', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const answers = [new Response('{"message":"duplicate key value violates unique constraint \\"entitlements_one_active_per_user_kind\\""}', { status: 409 }), new Response('{"message":"duplicate key ... entitlements_source_ref_unique"}', { status: 409 }), new Response(null, { status: 201 })];
    const store = createRestStore({
      supabaseUrl: 'https://proj.supabase.test/',
      serviceRoleKey: 'service_role_test_value',
      fetchFn: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return answers.shift()!;
      }) as unknown as typeof fetch,
    });
    const row = { userId: USER_A, kind: 'adventurer_pass' as const, source: 'stripe' as const, providerRef: 'pi_1', livemode: true };
    expect(await store.insertEntitlement(row)).toBe('already_active');
    expect(await store.insertEntitlement(row)).toBe('duplicate_ref');
    expect(await store.insertEntitlement(row)).toBe('inserted');
    expect(calls[0].url).toBe('https://proj.supabase.test/rest/v1/entitlements');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer service_role_test_value');
    expect(JSON.parse(calls[2].init.body as string)).toMatchObject({ livemode: true, status: 'active' });
  });

  it('the REST store: a dispute sets revoked (a refund sets refunded), a won dispute restores, and the unique-index conflict is reported as blocked', async () => {
    const bodies: unknown[] = [];
    const answers = [new Response('[{"id":"1"}]', { status: 200 }), new Response('[{"id":"1"}]', { status: 200 }), new Response('[{"id":"1"}]', { status: 200 }), new Response('{}', { status: 409 }), new Response('[]', { status: 200 })];
    const store = createRestStore({
      supabaseUrl: 'https://proj.supabase.test',
      serviceRoleKey: 'k',
      fetchFn: (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return answers.shift()!;
      }) as unknown as typeof fetch,
    });
    expect(await store.markReversed('stripe', 'pi_1', 'dispute')).toBe(1);
    expect(await store.markReversed('stripe', 'pi_1', 'refund')).toBe(1);
    expect(await store.restoreRevoked('stripe', 'pi_1')).toBe('restored');
    expect(await store.restoreRevoked('stripe', 'pi_1')).toBe('blocked');
    expect(await store.restoreRevoked('stripe', 'pi_1')).toBe('none');
    expect(bodies).toEqual([{ status: 'revoked' }, { status: 'refunded' }, { status: 'active' }, { status: 'active' }, { status: 'active' }]);
  });
});
