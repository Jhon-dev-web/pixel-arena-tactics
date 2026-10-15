import { supabase } from '../lib/supabaseClient';
import type { BindAction, BindResult, CertificateView, MintBody, MintResult } from '../../supabase/functions/_shared/items/types';
import { CERT_COLUMNS, CertRow, toCertificateView } from '../../supabase/functions/_shared/items/view';

// The web build's side of the item server (supabase/functions/mint-item and bind-item, docs/MARKET_FOUNDATION.md). The client sends WHAT it asks for (a recipe, a zone and a duration, boss
// stages, a pouch id) and receives what the server rolled; it never sends a user id (the JWT supabase-js attaches is the only identity) and never a number for the outcome.
// If the server cannot be reached the action is BLOCKED: there is no local fallback that could create a tradeable item.

/** The server could not be asked (no network, not signed in, a 5xx after the retries). The action must not happen. */
export class ItemServerUnreachable extends Error {
  constructor(detail: string) {
    super(`item_server_unreachable:${detail}`);
    this.name = 'ItemServerUnreachable';
  }
}

export interface TransportAnswer {
  status: number;
  body: unknown;
}
/** One call of an Edge Function. Throws when nothing came back at all (network). A tests passes a fake one. */
export type ItemTransport = (fn: 'mint-item' | 'bind-item', body: object) => Promise<TransportAnswer>;

export const supabaseTransport: ItemTransport = async (fn, body) => {
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

/** A fresh request id: 36 characters of a random uuid. The same id is reused for the retries of ONE action, so a lost answer is never a second roll. */
export function newRequestId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('No secure random source available for a request id');
}

export interface ItemApi {
  /** Asks the server to roll. Resolves with the answer (ok or a refusal such as a limit); throws ItemServerUnreachable when no answer could be had. */
  mint(body: MintBody): Promise<MintResult>;
  /** bind / void / burn the caller's own certificates. Resolves with the server's answer; throws ItemServerUnreachable when none could be had. */
  bind(action: BindAction, certificateIds: string[], reason?: string): Promise<BindResult>;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function createItemApi(transport: ItemTransport = supabaseTransport, opts: { retries?: number; sleep?: (ms: number) => Promise<void> } = {}): ItemApi {
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // 5xx, 429 busy, or a thrown network error are retried (the request id makes that safe); anything else is the server's real answer.
  async function call(fn: 'mint-item' | 'bind-item', body: object): Promise<TransportAnswer> {
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

  return {
    async mint(body) {
      const answer = await call('mint-item', body);
      if (isObj(answer.body) && answer.body.ok === true) return answer.body as unknown as MintResult;
      if (isObj(answer.body) && answer.body.ok === false && typeof answer.body.reason === 'string') return answer.body as unknown as MintResult;
      if (answer.status === 401 || answer.status === 403 || answer.status === 503) throw new ItemServerUnreachable(`status_${answer.status}`);
      return { ok: false, reason: 'bad_request' };
    },
    async bind(action, certificateIds, reason) {
      const answer = await call('bind-item', { action, certificateIds, ...(reason ? { reason } : {}) });
      if (isObj(answer.body) && answer.body.ok === true) return answer.body as unknown as BindResult;
      if (isObj(answer.body) && answer.body.ok === false && typeof answer.body.reason === 'string') return answer.body as unknown as BindResult;
      throw new ItemServerUnreachable(`status_${answer.status}`);
    },
  };
}

/** The app's api (the real transport). */
export const itemApi: ItemApi = createItemApi();

/** The account's own certificates, straight from the table (RLS lets a user read only his own rows; no id is sent). Throws when the server cannot be asked. */
export async function fetchMyCertificates(): Promise<CertificateView[]> {
  if (!supabase) throw new ItemServerUnreachable('not_configured');
  const { data, error } = await supabase.from('item_certificates').select(CERT_COLUMNS).order('created_at', { ascending: false }).limit(1000);
  if (error) throw new ItemServerUnreachable('read_failed');
  return ((data ?? []) as CertRow[]).map(toCertificateView);
}
