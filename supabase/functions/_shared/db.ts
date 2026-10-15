import type { CheckoutClaim, CheckoutSession, EntitlementKind, EntitlementSource, InsertEntitlementResult, ProviderEvent, Store } from './types.ts';
import { CHECKOUT_PENDING_MS, CHECKOUT_RATE_LIMIT, CHECKOUT_REUSE_MAX_AGE_MS, CHECKOUT_REUSE_MIN_REMAINING_MS } from './checkout.ts';

// The real Store: PostgREST over fetch with the SERVICE ROLE key (injected by the Supabase Edge runtime as SUPABASE_SERVICE_ROLE_KEY; never
// logged, never returned). Values are passed through URLSearchParams / JSON, never concatenated into a filter by hand.
export interface DbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

export function createRestStore(cfg: DbConfig): Store {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: cfg.serviceRoleKey,
    authorization: `Bearer ${cfg.serviceRoleKey}`,
    'content-type': 'application/json',
    ...extra,
  });

  const request = (path: string, init: RequestInit): Promise<Response> => doFetch(`${base}/${path}`, init);
  const failure = (what: string, res: Response): Error => new Error(`${what}_${res.status}`); // status only: bodies can echo data

  return {
    async hasActiveEntitlement(userId: string, kind: EntitlementKind) {
      const q = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, kind: `eq.${kind}`, status: 'eq.active', limit: '1' });
      const res = await request(`entitlements?${q}`, { headers: headers() });
      if (!res.ok) throw failure('entitlement_read', res);
      return ((await res.json()) as unknown[]).length > 0;
    },

    // One rpc = one transaction under a per-user lock (migration 0007 checkout_claim). The numbers are the same constants the pure decision uses.
    async claimCheckout(userId: string): Promise<CheckoutClaim> {
      const res = await request('rpc/checkout_claim', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          p_user_id: userId,
          p_max: CHECKOUT_RATE_LIMIT.max,
          p_window_seconds: Math.ceil(CHECKOUT_RATE_LIMIT.windowMs / 1000),
          p_pending_seconds: Math.ceil(CHECKOUT_PENDING_MS / 1000),
          p_reuse_min_remaining_seconds: Math.ceil(CHECKOUT_REUSE_MIN_REMAINING_MS / 1000),
          p_reuse_max_age_seconds: Math.ceil(CHECKOUT_REUSE_MAX_AGE_MS / 1000),
        }),
      });
      if (!res.ok) throw failure('checkout_claim', res);
      const r = (await res.json()) as { outcome?: unknown; attempt_id?: unknown; session_url?: unknown };
      if (r.outcome === 'reuse' && typeof r.session_url === 'string') return { outcome: 'reuse', url: r.session_url };
      if (r.outcome === 'create' && typeof r.attempt_id === 'number') return { outcome: 'create', attemptId: r.attempt_id };
      if (r.outcome === 'in_progress' || r.outcome === 'rate_limited') return { outcome: r.outcome };
      throw new Error('checkout_claim_bad_answer');
    },

    async attachCheckoutSession(attemptId: number, session: CheckoutSession) {
      const q = new URLSearchParams({ id: `eq.${attemptId}` });
      const res = await request(`checkout_attempts?${q}`, {
        method: 'PATCH',
        headers: headers({ prefer: 'return=minimal' }),
        body: JSON.stringify({ provider_session_id: session.id, session_url: session.url, session_expires_at: session.expiresAtMs === null ? null : new Date(session.expiresAtMs).toISOString() }),
      });
      if (!res.ok) throw failure('attempt_attach', res);
    },

    async abandonCheckoutAttempt(attemptId: number) {
      const q = new URLSearchParams({ id: `eq.${attemptId}` });
      const res = await request(`checkout_attempts?${q}`, { method: 'DELETE', headers: headers({ prefer: 'return=minimal' }) });
      if (!res.ok) throw failure('attempt_abandon', res);
    },

    async completeCheckoutSession(sessionId: string) {
      const q = new URLSearchParams({ provider_session_id: `eq.${sessionId}` });
      const res = await request(`checkout_attempts?${q}`, { method: 'PATCH', headers: headers({ prefer: 'return=minimal' }), body: JSON.stringify({ session_completed: true }) });
      if (!res.ok) throw failure('attempt_complete', res);
    },

    async recordPaymentEvent(provider: string, eventId: string, summary: ProviderEvent['summary']) {
      const insert = await request('payment_events', {
        method: 'POST',
        headers: headers({ prefer: 'return=minimal' }),
        body: JSON.stringify({ provider, event_id: eventId, payload: summary, livemode: summary.livemode === true }),
      });
      if (insert.ok) return { isNew: true, processed: false };
      if (insert.status !== 409) throw failure('event_write', insert); // 409 = unique violation: the event was seen before
      const q = new URLSearchParams({ select: 'processed_at', provider: `eq.${provider}`, event_id: `eq.${eventId}`, limit: '1' });
      const read = await request(`payment_events?${q}`, { headers: headers() });
      if (!read.ok) throw failure('event_read', read);
      const rows = (await read.json()) as { processed_at: string | null }[];
      return { isNew: false, processed: !!rows[0]?.processed_at };
    },

    async finishPaymentEvent(provider: string, eventId: string, result: string) {
      const q = new URLSearchParams({ provider: `eq.${provider}`, event_id: `eq.${eventId}` });
      const res = await request(`payment_events?${q}`, {
        method: 'PATCH',
        headers: headers({ prefer: 'return=minimal' }),
        body: JSON.stringify({ processed_at: new Date().toISOString(), result }),
      });
      if (!res.ok) throw failure('event_finish', res);
    },

    async insertEntitlement(row: { userId: string; kind: EntitlementKind; source: EntitlementSource; providerRef: string; livemode: boolean }): Promise<InsertEntitlementResult> {
      const res = await request('entitlements', {
        method: 'POST',
        headers: headers({ prefer: 'return=minimal' }),
        body: JSON.stringify({ user_id: row.userId, kind: row.kind, source: row.source, provider_ref: row.providerRef, status: 'active', livemode: row.livemode }),
      });
      if (res.ok) return 'inserted';
      if (res.status === 409) {
        // Two different unique constraints answer 409: (source, provider_ref) = this payment was already recorded; the partial index = the user
        // already holds an active Pass from another payment. PostgREST puts the constraint name in the error body.
        const text = await res.text().catch(() => '');
        return text.includes('entitlements_one_active_per_user_kind') ? 'already_active' : 'duplicate_ref';
      }
      throw failure('entitlement_write', res);
    },

    async markReversed(source: EntitlementSource, providerRef: string, reason: 'refund' | 'dispute') {
      const q = new URLSearchParams({ source: `eq.${source}`, provider_ref: `eq.${providerRef}`, status: 'eq.active', select: 'id' });
      const res = await request(`entitlements?${q}`, {
        method: 'PATCH',
        headers: headers({ prefer: 'return=representation' }),
        body: JSON.stringify({ status: reason === 'dispute' ? 'revoked' : 'refunded' }),
      });
      if (!res.ok) throw failure('entitlement_refund', res);
      return ((await res.json()) as unknown[]).length;
    },

    async restoreRevoked(source: EntitlementSource, providerRef: string) {
      const q = new URLSearchParams({ source: `eq.${source}`, provider_ref: `eq.${providerRef}`, status: 'eq.revoked', select: 'id' });
      const res = await request(`entitlements?${q}`, {
        method: 'PATCH',
        headers: headers({ prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'active' }),
      });
      if (res.status === 409) return 'blocked'; // entitlements_one_active_per_user_kind: he bought again while the dispute was open
      if (!res.ok) throw failure('entitlement_restore', res);
      return ((await res.json()) as unknown[]).length > 0 ? 'restored' : 'none';
    },
  };
}
