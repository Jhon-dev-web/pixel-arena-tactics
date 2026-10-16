import { supabase } from '../lib/supabaseClient';
import type { MaterialBalances, MaterialClaimBody, MaterialClaimResult, MaterialSyncBody, MaterialSyncResult } from '../../supabase/functions/_shared/materials/types';
import { ItemServerUnreachable, TransportAnswer } from './itemServer';

// The web build's side of the material server (supabase/functions/material-claim and material-sync, docs/MARKET_FOUNDATION.md "Materiais negociaveis"). The client reports WHAT it claimed and
// receives how many units the server made tradeable; it never sends a user id (the JWT supabase-js attaches is the only identity) and never a number for the outcome. If the server cannot be
// reached the call throws ItemServerUnreachable: tradeable units are never created without it, and spending them waits for it.

export type MaterialTransport = (fn: 'material-claim' | 'material-sync', body: object) => Promise<TransportAnswer>;

export const supabaseMaterialTransport: MaterialTransport = async (fn, body) => {
  if (!supabase) throw new ItemServerUnreachable('not_configured');
  const { data, error } = await supabase.functions.invoke(fn, { method: 'POST', body });
  if (!error) return { status: 200, body: data };
  const ctx = (error as { context?: unknown }).context;
  if (typeof Response !== 'undefined' && ctx instanceof Response) {
    let parsed: unknown = null;
    try {
      parsed = await ctx.json();
    } catch {
      /* no JSON body */
    }
    return { status: ctx.status, body: parsed };
  }
  throw new ItemServerUnreachable('network');
};

export interface MaterialApi {
  /** Reports a claim; resolves with the server's answer (ok, or a refusal); throws ItemServerUnreachable when no answer could be had. */
  claim(body: MaterialClaimBody): Promise<MaterialClaimResult>;
  /** The account's balances, or the burn / acknowledgement of units (idempotent by request id). */
  sync(body: MaterialSyncBody): Promise<MaterialSyncResult>;
  /** Shorthand: the balances. */
  balances(): Promise<MaterialBalances>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function createMaterialApi(transport: MaterialTransport = supabaseMaterialTransport, opts: { retries?: number; sleep?: (ms: number) => Promise<void> } = {}): MaterialApi {
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // 5xx, 429 busy or a thrown network error are retried (the request id makes that safe); anything else is the server's real answer.
  async function call(fn: 'material-claim' | 'material-sync', body: object): Promise<TransportAnswer> {
    let last: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const answer = await transport(fn, body);
        const retryable = answer.status >= 500 || (answer.status === 429 && isObj(answer.body) && answer.body.error === 'busy');
        if (!retryable) return answer;
        last = new ItemServerUnreachable(`status_${answer.status}`);
      } catch (err) {
        last = err;
      }
      if (attempt < retries) await sleep(400 * (attempt + 1));
    }
    throw last instanceof ItemServerUnreachable ? last : new ItemServerUnreachable('network');
  }

  const sync = async (body: MaterialSyncBody): Promise<MaterialSyncResult> => {
    const answer = await call('material-sync', body);
    if (isObj(answer.body) && answer.body.ok === true && isObj(answer.body.balances)) return answer.body as unknown as MaterialSyncResult;
    if (isObj(answer.body) && answer.body.ok === false) return { ok: false, reason: 'bad_request' };
    throw new ItemServerUnreachable(`status_${answer.status}`);
  };

  return {
    async claim(body) {
      const answer = await call('material-claim', body);
      if (isObj(answer.body) && answer.body.ok === true && isObj(answer.body.tradeable)) return answer.body as unknown as MaterialClaimResult;
      if (isObj(answer.body) && answer.body.ok === false && typeof answer.body.reason === 'string') return answer.body as unknown as MaterialClaimResult;
      if (answer.status === 401 || answer.status === 403 || answer.status === 503) throw new ItemServerUnreachable(`status_${answer.status}`);
      return { ok: false, reason: 'bad_request' };
    },
    sync,
    async balances() {
      const r = await sync({ action: 'balances' });
      if (r.ok === true) return r.balances;
      throw new ItemServerUnreachable('bad_answer');
    },
  };
}

/** The app's api (the real transport). */
export const materialApi: MaterialApi = createMaterialApi();
