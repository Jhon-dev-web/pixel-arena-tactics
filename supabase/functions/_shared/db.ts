import type { EntitlementKind, EntitlementSource, InsertEntitlementResult, ProviderEvent, Store } from './types.ts';

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

    async countCheckoutAttemptsSince(userId: string, sinceMs: number) {
      const q = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, created_at: `gte.${new Date(sinceMs).toISOString()}`, limit: '50' });
      const res = await request(`checkout_attempts?${q}`, { headers: headers() });
      if (!res.ok) throw failure('attempt_read', res);
      return ((await res.json()) as unknown[]).length;
    },

    async recordCheckoutAttempt(userId: string) {
      const res = await request('checkout_attempts', { method: 'POST', headers: headers({ prefer: 'return=minimal' }), body: JSON.stringify({ user_id: userId }) });
      if (!res.ok) throw failure('attempt_write', res);
    },

    async recordPaymentEvent(provider: string, eventId: string, summary: ProviderEvent['summary']) {
      const insert = await request('payment_events', {
        method: 'POST',
        headers: headers({ prefer: 'return=minimal' }),
        body: JSON.stringify({ provider, event_id: eventId, payload: summary }),
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

    async insertEntitlement(row: { userId: string; kind: EntitlementKind; source: EntitlementSource; providerRef: string }): Promise<InsertEntitlementResult> {
      const res = await request('entitlements', {
        method: 'POST',
        headers: headers({ prefer: 'return=minimal' }),
        body: JSON.stringify({ user_id: row.userId, kind: row.kind, source: row.source, provider_ref: row.providerRef, status: 'active' }),
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

    async markRefunded(source: EntitlementSource, providerRef: string) {
      const q = new URLSearchParams({ source: `eq.${source}`, provider_ref: `eq.${providerRef}`, status: 'eq.active', select: 'id' });
      const res = await request(`entitlements?${q}`, {
        method: 'PATCH',
        headers: headers({ prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'refunded' }),
      });
      if (!res.ok) throw failure('entitlement_refund', res);
      return ((await res.json()) as unknown[]).length;
    },
  };
}
