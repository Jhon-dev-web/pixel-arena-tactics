import type { CommitOutcome, ItemStore, StoredRequest, TokenOutcome } from './store.ts';
import type { BindResult, CertStatus, StoredTemplate } from './types.ts';
import { CERT_COLUMNS, CertRow, toCertificateView } from './view.ts';

// The real ItemStore: PostgREST over fetch with the SERVICE ROLE key (injected by the Supabase Edge runtime; never logged, never returned). Values go through URLSearchParams / JSON,
// never concatenated into a filter by hand. Errors carry the status only (bodies can echo data). Every limit and every state change is ONE rpc = one locked statement (migration 0010).
export interface ItemDbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

export function createItemStore(cfg: ItemDbConfig): ItemStore {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: cfg.serviceRoleKey,
    authorization: `Bearer ${cfg.serviceRoleKey}`,
    'content-type': 'application/json',
    ...extra,
  });
  const failure = (what: string, res: Response): Error => new Error(`${what}_${res.status}`);

  const getRows = async <T>(path: string, params: URLSearchParams, what: string): Promise<T[]> => {
    const res = await doFetch(`${base}/${path}?${params}`, { headers: headers() });
    if (!res.ok) throw failure(what, res);
    return (await res.json()) as T[];
  };

  const rpc = async <T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> => {
    const res = await doFetch(`${base}/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    if (!res.ok) throw failure(what, res);
    return (await res.json()) as T;
  };

  return {
    // The account age comes from auth.users (migration 0007, service role only) and the reset moment from public.league_reset_at() (migration 0009): never from a column the player can write.
    async accountStartMs(userId) {
      const created = await rpc<string | null>('progress_account_created_at', { p_user_id: userId }, 'account_age_read');
      const createdMs = typeof created === 'string' ? Date.parse(created) : Number.NaN;
      if (!Number.isFinite(createdMs)) return null;
      const reset = await rpc<string | null>('league_reset_at', {}, 'league_reset_read');
      const resetMs = typeof reset === 'string' ? Date.parse(reset) : Number.NaN;
      return Number.isFinite(resetMs) ? Math.max(createdMs, resetMs) : createdMs;
    },

    async hasActivePass(userId) {
      const q = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, kind: 'eq.adventurer_pass', status: 'eq.active', limit: '1' });
      return (await getRows<unknown>('entitlements', q, 'entitlement_read')).length > 0;
    },

    async findRequest(userId, requestId): Promise<StoredRequest | null> {
      const q = new URLSearchParams({ select: 'template', user_id: `eq.${userId}`, request_id: `eq.${requestId}`, limit: '1' });
      const rows = await getRows<{ template: StoredTemplate }>('item_mint_requests', q, 'request_read');
      if (!rows[0]) return null;
      const cq = new URLSearchParams({ select: CERT_COLUMNS, user_id: `eq.${userId}`, request_id: `eq.${requestId}`, order: 'request_index.asc' });
      const certs = await getRows<CertRow>('item_certificates', cq, 'request_certificates_read');
      return { template: rows[0].template, certificates: certs.map(toCertificateView) };
    },

    async issuedLastDay(userId, kind, tier) {
      const q = new URLSearchParams({ select: 'id', user_id: `eq.${userId}`, kind: `eq.${kind}`, created_at: `gte.${new Date(Date.now() - 86_400_000).toISOString()}`, limit: '1000' });
      if (tier !== null) q.set('tier', `eq.${tier}`);
      return (await getRows<unknown>('item_certificates', q, 'issued_read')).length;
    },

    async takeTokens(userId, startMs, takes): Promise<TokenOutcome> {
      const r = await rpc<{ ok?: unknown; granted?: unknown; failed?: unknown }>(
        'item_take_tokens',
        {
          p_user_id: userId,
          p_start_at: new Date(startMs).toISOString(),
          p_takes: takes.map((t) => ({ bucket: t.bucket, cost: t.cost, rate_per_hour: t.ratePerHour, capacity: t.capacity, partial: t.partial === true })),
        },
        'take_tokens',
      );
      if (r.ok === true && Array.isArray(r.granted)) return { ok: true, granted: (r.granted as unknown[]).map((g) => Number(g)) };
      if (r.ok === false && typeof r.failed === 'string') return { ok: false, failed: r.failed };
      throw new Error('take_tokens_bad_answer');
    },

    async commit(args): Promise<CommitOutcome> {
      const r = await rpc<{ status?: unknown; certificates?: { id: string; created_at: string }[] }>(
        'item_commit',
        {
          p_user_id: args.userId,
          p_request_id: args.requestId,
          p_kind: args.kind,
          p_template: args.template,
          p_certs: args.certificates.map((c) => ({ kind: c.kind, template_id: c.templateId, rarity: c.rarity, tier: c.tier, substats: c.substats, gold_amount: c.goldAmount, source: c.source, content_hash: c.contentHash })),
          p_burn_ids: args.burnIds,
          p_caps: args.caps.map((c) => ({ kind: c.kind, tier: c.tier, max: c.max })),
        },
        'item_commit',
      );
      if (r.status === 'created' && Array.isArray(r.certificates)) return { status: 'created', certificates: r.certificates.map((c) => ({ id: c.id, createdAt: c.created_at })) };
      if (r.status === 'replay' || r.status === 'cap' || r.status === 'burn_failed') return { status: r.status };
      throw new Error('item_commit_bad_answer');
    },

    async transition(args): Promise<BindResult> {
      const r = await rpc<{ ok?: unknown; reason?: unknown; certificates?: { id: string; status: CertStatus; bound: boolean }[] }>(
        'item_certificate_transition',
        { p_user_id: args.userId, p_ids: args.ids, p_action: args.action, p_detail: { reason: args.reason } },
        'item_transition',
      );
      if (r.ok === true && Array.isArray(r.certificates)) return { ok: true, certificates: r.certificates };
      if (r.ok === false && (r.reason === 'not_found' || r.reason === 'not_held' || r.reason === 'listed')) return { ok: false, reason: r.reason };
      throw new Error('item_transition_bad_answer');
    },

    async flag(userId, code, detail) {
      const res = await doFetch(`${base}/rpc/item_flag_account`, { method: 'POST', headers: headers(), body: JSON.stringify({ p_user_id: userId, p_code: code, p_detail: detail }) });
      if (!res.ok) throw failure('item_flag', res); // a void function answers with an empty body: nothing to parse
    },
  };
}
