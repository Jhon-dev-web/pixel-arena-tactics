// Shared types of the payment Edge Functions. Everything under _shared/ except the *.ts files named in index.ts wiring is plain TypeScript with
// Web-standard APIs only (fetch, Request, Response, crypto.subtle), so it runs in Deno (Supabase Edge) and under the repo's Node test runner.

export type EntitlementKind = 'adventurer_pass';
export type EntitlementSource = 'stripe' | 'mercadopago' | 'grant';

/** What a verified provider event asks us to do. Providers map their own event shapes into exactly these three. */
export type ProviderAction =
  | { type: 'grant'; userId: string; providerRef: string; kind: EntitlementKind }
  | { type: 'reverse'; providerRef: string; reason: 'refund' | 'dispute' }
  | { type: 'ignore'; reason: string };

export interface ProviderEvent {
  /** The provider's unique event id (idempotency key together with the provider name). */
  eventId: string;
  /** Minimal, non-sensitive summary stored in payment_events.payload (ids and statuses only; never the raw event). */
  summary: Record<string, string | number | boolean | null>;
  action: ProviderAction;
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
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  /** Verifies the signature against the RAW body and returns the mapped event; throws WebhookRejected when it must not be trusted. */
  parseWebhook(rawBody: string, headers: Headers, nowMs: number): Promise<ProviderEvent>;
}

export class WebhookRejected extends Error {
  constructor(public readonly reason: 'missing_signature' | 'bad_signature' | 'stale' | 'bad_payload') {
    super(reason);
  }
}

export type InsertEntitlementResult = 'inserted' | 'duplicate_ref' | 'already_active';

/** Persistence used by the handlers. The real one (db.ts) talks to PostgREST with the service role; tests use an in-memory fake. */
export interface Store {
  hasActiveEntitlement(userId: string, kind: EntitlementKind): Promise<boolean>;
  countCheckoutAttemptsSince(userId: string, sinceMs: number): Promise<number>;
  recordCheckoutAttempt(userId: string): Promise<void>;
  /** Inserts the event; returns whether it was new and, when it was not, whether an earlier delivery already finished processing it. */
  recordPaymentEvent(provider: string, eventId: string, summary: ProviderEvent['summary']): Promise<{ isNew: boolean; processed: boolean }>;
  finishPaymentEvent(provider: string, eventId: string, result: string): Promise<void>;
  insertEntitlement(row: { userId: string; kind: EntitlementKind; source: EntitlementSource; providerRef: string }): Promise<InsertEntitlementResult>;
  /** Marks the ACTIVE entitlement of this provider payment as refunded; returns how many rows changed. */
  markRefunded(source: EntitlementSource, providerRef: string): Promise<number>;
}
