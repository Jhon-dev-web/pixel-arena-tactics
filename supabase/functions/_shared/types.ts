// Shared types of the payment Edge Functions. Everything under _shared/ except the *.ts files named in index.ts wiring is plain TypeScript with
// Web-standard APIs only (fetch, Request, Response, crypto.subtle), so it runs in Deno (Supabase Edge) and under the repo's Node test runner.

export type EntitlementKind = 'adventurer_pass';
export type EntitlementSource = 'stripe' | 'mercadopago' | 'grant';

/** What a verified provider event asks us to do. Providers map their own event shapes into exactly these four. */
export type ProviderAction =
  // livemode: stored on the entitlement. Only livemode rows count toward the paid-Pass goal and the ranking (migration 0007); sessionId marks the checkout attempt done.
  | { type: 'grant'; userId: string; providerRef: string; kind: EntitlementKind; livemode: boolean; sessionId: string | null }
  // refund -> status 'refunded'; dispute opened -> status 'revoked' (a different word on purpose: a won dispute can restore it, a refund cannot).
  | { type: 'reverse'; providerRef: string; reason: 'refund' | 'dispute' }
  // A dispute that closed in our favour: a 'revoked' entitlement of that payment becomes 'active' again.
  | { type: 'restore'; providerRef: string }
  | { type: 'ignore'; reason: string };

export interface ProviderEvent {
  /** The provider's unique event id (idempotency key together with the provider name). */
  eventId: string;
  /** Minimal, non-sensitive summary stored in payment_events.payload (ids and statuses only; never the raw event). */
  summary: Record<string, string | number | boolean | null>;
  action: ProviderAction;
}

/** A created checkout session: the hosted page url, Stripe's session id and when it expires (null when the provider did not say; such a session is never reused). */
export interface CheckoutSession {
  url: string;
  id: string | null;
  expiresAtMs: number | null;
}

export interface CheckoutInput {
  /** Always the authenticated user's id taken from the verified JWT. */
  userId: string;
  successUrl: string;
  cancelUrl: string;
}

/** The tiny surface a payment provider implements. A new provider = a new file in providers/ + a new webhook route; nothing else changes. */
export interface PaymentProvider {
  readonly name: Exclude<EntitlementSource, 'grant'>;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Refunds a whole payment. `idempotencyKey` makes a retry return the same refund instead of a second one. Throws when the provider refuses. */
  refundPayment(providerRef: string, idempotencyKey: string): Promise<void>;
  /** Verifies the signature against the RAW body and returns the mapped event; throws WebhookRejected when it must not be trusted. */
  parseWebhook(rawBody: string, headers: Headers, nowMs: number): Promise<ProviderEvent>;
}

export class WebhookRejected extends Error {
  constructor(public readonly reason: 'missing_signature' | 'bad_signature' | 'stale' | 'bad_payload') {
    super(reason);
  }
}

export type InsertEntitlementResult = 'inserted' | 'duplicate_ref' | 'already_active';

/** The answer of the single atomic claim (SQL function checkout_claim). */
export type CheckoutClaim =
  | { outcome: 'create'; attemptId: number }
  | { outcome: 'reuse'; url: string }
  | { outcome: 'in_progress' }
  | { outcome: 'rate_limited' };

/** Persistence used by the handlers. The real one (db.ts) talks to PostgREST with the service role; tests use an in-memory fake. */
export interface Store {
  hasActiveEntitlement(userId: string, kind: EntitlementKind): Promise<boolean>;
  /**
   * ONE atomic step (under a per-user lock in the database): reuse this user's still-open checkout session if there is one, else refuse while another request is creating one,
   * else refuse over the rate limit, else record an attempt and say "create". Two parallel requests can therefore never both create a session or both slip past the limit.
   */
  claimCheckout(userId: string): Promise<CheckoutClaim>;
  /** Stores the session of a claimed attempt so the next request can reuse it. */
  attachCheckoutSession(attemptId: number, session: CheckoutSession): Promise<void>;
  /** Drops a claimed attempt whose session could not be created (best effort). */
  abandonCheckoutAttempt(attemptId: number): Promise<void>;
  /** Marks the attempt of this provider session as paid, so it is never offered again. */
  completeCheckoutSession(sessionId: string): Promise<void>;
  /** Inserts the event; returns whether it was new and, when it was not, whether an earlier delivery already finished processing it. */
  recordPaymentEvent(provider: string, eventId: string, summary: ProviderEvent['summary']): Promise<{ isNew: boolean; processed: boolean }>;
  finishPaymentEvent(provider: string, eventId: string, result: string): Promise<void>;
  insertEntitlement(row: { userId: string; kind: EntitlementKind; source: EntitlementSource; providerRef: string; livemode: boolean }): Promise<InsertEntitlementResult>;
  /** Moves the ACTIVE entitlement of this provider payment to 'refunded' (refund) or 'revoked' (dispute opened); returns how many rows changed. */
  markReversed(source: EntitlementSource, providerRef: string, reason: 'refund' | 'dispute'): Promise<number>;
  /** A won dispute: 'revoked' -> 'active' for this payment. 'blocked' = the user holds another active Pass meanwhile (the unique index refused). */
  restoreRevoked(source: EntitlementSource, providerRef: string): Promise<'restored' | 'none' | 'blocked'>;
}
