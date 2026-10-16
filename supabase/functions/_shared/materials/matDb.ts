import type { MaterialStore, StoredMaterialRequest } from './store.ts';
import type { MaterialBalance, MaterialBalances } from './types.ts';
import { createItemStore } from '../items/itemDb.ts';

// The real MaterialStore: PostgREST over fetch with the SERVICE ROLE key (injected by the Supabase Edge runtime; never logged, never returned). Values go through URLSearchParams / JSON, never
// concatenated into a filter by hand. Errors carry the status only (bodies can echo data). Every change of state is ONE rpc = one locked statement (migration 0015); the limits are the same
// buckets as the item server (public.item_take_tokens), so the account age and the flags are the item server's own.
export interface MaterialDbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

export function createMaterialStore(cfg: MaterialDbConfig): MaterialStore {
  const items = createItemStore(cfg);
  const doFetch = cfg.fetchFn ?? fetch;
  const base = `${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1`;
  const headers = () => ({ apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' });
  const failure = (what: string, res: Response): Error => new Error(`${what}_${res.status}`);

  const rows = async <T>(path: string, params: URLSearchParams, what: string): Promise<T[]> => {
    const res = await doFetch(`${base}/${path}?${params}`, { headers: headers() });
    if (!res.ok) throw failure(what, res);
    return (await res.json()) as T[];
  };
  const rpc = async <T>(fn: string, args: Record<string, unknown>, what: string): Promise<T> => {
    const res = await doFetch(`${base}/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    if (!res.ok) throw failure(what, res);
    return (await res.json()) as T;
  };
  const numbers = (raw: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return out;
  };

  return {
    accountStartMs: items.accountStartMs,
    takeTokens: items.takeTokens,
    flag: items.flag,

    async findRequest(userId, requestId): Promise<StoredMaterialRequest | null> {
      const q = new URLSearchParams({ select: 'kind,result', user_id: `eq.${userId}`, request_id: `eq.${requestId}`, limit: '1' });
      const r = (await rows<{ kind: string; result: { tradeable?: unknown; applied?: unknown } }>('material_requests', q, 'material_request_read'))[0];
      if (!r) return null;
      if (r.kind === 'claim') return { kind: 'claim', tradeable: numbers(r.result?.tradeable) };
      return { kind: r.kind === 'ack' ? 'ack' : 'burn', applied: numbers(r.result?.applied) };
    },

    async credit(args) {
      const r = await rpc<{ status?: unknown }>('material_credit', { p_user_id: args.userId, p_request_id: args.requestId, p_credits: args.credits }, 'material_credit');
      if (r.status === 'created' || r.status === 'replay') return { status: r.status };
      throw new Error('material_credit_bad_answer');
    },

    async burn(args) {
      const r = await rpc<{ status?: unknown; applied?: unknown }>('material_burn', { p_user_id: args.userId, p_request_id: args.requestId, p_units: args.units }, 'material_burn');
      if (r.status === 'burned' || r.status === 'replay') return { applied: numbers(r.applied), replay: r.status === 'replay' };
      throw new Error('material_burn_bad_answer');
    },

    async ack(args) {
      const r = await rpc<{ status?: unknown; applied?: unknown }>('material_ack', { p_user_id: args.userId, p_request_id: args.requestId, p_units: args.units }, 'material_ack');
      if (r.status === 'acked' || r.status === 'replay') return { applied: numbers(r.applied), replay: r.status === 'replay' };
      throw new Error('material_ack_bad_answer');
    },

    async balances(userId): Promise<MaterialBalances> {
      const q = new URLSearchParams({ select: 'material_id,qty,pending,seq', user_id: `eq.${userId}`, limit: '200' });
      const out: MaterialBalances = {};
      for (const r of await rows<{ material_id: string; qty: number; pending: number; seq: number }>('material_balances', q, 'material_balances_read')) {
        const b: MaterialBalance = { qty: r.qty, pending: r.pending, seq: r.seq };
        out[r.material_id] = b;
      }
      return out;
    },
  };
}
