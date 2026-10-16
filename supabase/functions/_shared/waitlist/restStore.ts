import { REFERRAL_CODE_RE } from './logic.ts';
import type { JoinRequest, JoinResult, WaitlistStore } from './store.ts';

// The real store: PostgREST rpc calls with the SERVICE ROLE key (injected by the Edge runtime; never logged, never returned). One rpc = one transaction in the database.
// Errors carry the HTTP status only: a response body could echo what was sent, and what was sent contains an e-mail address.
export interface WaitlistDbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

export function createWaitlistStore(cfg: WaitlistDbConfig): WaitlistStore {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc`;
  async function rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await doFetch(`${base}/${name}`, {
      method: 'POST',
      headers: { apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`${name}_${res.status}`);
    const out = (await res.json()) as unknown;
    if (!out || typeof out !== 'object' || Array.isArray(out)) throw new Error(`${name}_bad_answer`);
    return out as Record<string, unknown>;
  }
  return {
    async join(req: JoinRequest): Promise<JoinResult> {
      const out = await rpc('waitlist_join', {
        p_email: req.email,
        p_locale: req.locale,
        p_source: req.source,
        p_ip_hash: req.ipHash,
        p_subnet_hash: req.subnetHash,
        p_email_key: req.emailKey,
        p_ref_code: req.refCode,
        p_new_code: req.newCode,
        p_view_key_hash: req.viewKeyHash,
      });
      if (out.status === 'rate_limited' || out.status === 'code_taken') return { status: out.status };
      if ((out.status === 'joined' || out.status === 'exists') && typeof out.code === 'string' && REFERRAL_CODE_RE.test(out.code)) return { status: out.status, code: out.code };
      throw new Error('waitlist_join_bad_status');
    },
    async unsubscribe(waitlistId: string, ipKey: string | null) {
      const out = await rpc('waitlist_unsubscribe', { p_id: waitlistId, p_ip_key: ipKey });
      if (out.status === 'ok' || out.status === 'rate_limited') return { status: out.status };
      throw new Error('waitlist_unsubscribe_bad_status');
    },
    async referralStats(code: string, viewKeyHash: string, ipKey: string | null) {
      const out = await rpc('waitlist_referral_stats', { p_code: code, p_view_key_hash: viewKeyHash, p_ip_key: ipKey });
      if (out.status === 'rate_limited') return { status: 'rate_limited' as const };
      if (out.status !== 'ok') throw new Error('waitlist_referral_stats_bad_status');
      return { status: 'ok' as const, stats: { qualified: count(out.qualified), paying: count(out.paying), passGoal: typeof out.pass_goal === 'number' ? count(out.pass_goal) || null : null } };
    },
  };
}
