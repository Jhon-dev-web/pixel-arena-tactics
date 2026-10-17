// The four operations flags (migration 0021_ai_ops.sql) as the Edge Functions see them. Pure TypeScript, Web APIs only (runs in Deno and in the repo's Node tests).
// The flags are read through public.ops_status() and the readers here FAIL OPEN: if the flags cannot be read, nothing is paused, because a broken read must never take the game down by itself.
// (The last answer that was good a moment ago is kept for a few minutes, so a blip does not silently un-pause a market that is paused on purpose.)

import { json } from '../http.ts';

export const FLAG_KEYS = ['maintenance_mode', 'market_paused', 'season_scoring_paused', 'pass_sales_paused'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];
export type OpsFlags = Record<FlagKey, boolean>;

export const NO_FLAGS: OpsFlags = { maintenance_mode: false, market_paused: false, season_scoring_paused: false, pass_sales_paused: false };

/** Reads the jsonb public.ops_status() returns. Anything that is not exactly `true` is `false`; a non-object is "no flags". */
export function parseOpsStatus(raw: unknown): OpsFlags {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...NO_FLAGS };
  const o = raw as Record<string, unknown>;
  const out = { ...NO_FLAGS };
  for (const k of FLAG_KEYS) out[k] = o[k] === true;
  return out;
}

export type OpsFlagReader = () => Promise<OpsFlags>;

/** True only when a reader exists, answers, and says `key` is on. Never throws: no reader / a failing reader = not paused. */
export async function isPaused(read: OpsFlagReader | undefined, key: FlagKey): Promise<boolean> {
  if (!read) return false;
  try {
    return (await read())[key] === true;
  } catch {
    return false;
  }
}

export interface FlagReaderConfig {
  supabaseUrl: string;
  /** The service role key (functions) or the anon key: ops_status is public. Never logged, never returned. */
  apiKey: string;
  fetchFn?: typeof fetch;
  nowMs?: () => number;
  /** A fresh answer is reused this long (default 10 s): 50 000 players must not turn into 50 000 flag reads. */
  ttlMs?: number;
  /** The last good answer is used for this long when a read fails (default 5 min); after it the reader fails open. */
  staleMs?: number;
  /** A slow database must not hold the request (default 2.5 s). */
  timeoutMs?: number;
}

export function createFlagReader(cfg: FlagReaderConfig): OpsFlagReader {
  const doFetch = cfg.fetchFn ?? fetch;
  const now = cfg.nowMs ?? (() => Date.now());
  const ttl = cfg.ttlMs ?? 10_000;
  const stale = cfg.staleMs ?? 5 * 60_000;
  const timeout = cfg.timeoutMs ?? 2_500;
  let last: { flags: OpsFlags; at: number } | null = null;
  let inflight: Promise<OpsFlags> | null = null;

  const fetchOnce = async (): Promise<OpsFlags> => {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const res = await doFetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/ops_status`, {
        method: 'POST',
        headers: { apikey: cfg.apiKey, authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
        body: '{}',
        signal: ctrl?.signal,
      });
      if (!res.ok) throw new Error(`ops_status_${res.status}`); // status only: bodies can echo data
      return parseOpsStatus(await res.json());
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  return async () => {
    if (!cfg.supabaseUrl || !cfg.apiKey) return { ...NO_FLAGS };
    const t = now();
    if (last && t - last.at < ttl) return last.flags;
    if (!inflight) {
      inflight = fetchOnce()
        .then((flags) => {
          last = { flags, at: now() };
          return flags;
        })
        .catch(() => {
          // fail open, after the grace of the last good answer
          if (last && now() - last.at < stale) return last.flags;
          return { ...NO_FLAGS };
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  };
}

/** The answer of a function that refuses because a flag is on. 503 + Retry-After: the game shows "back soon", nothing is consumed. */
export function pausedBody(flag: FlagKey): { ok: false; error: 'paused'; reason: FlagKey } {
  return { ok: false, error: 'paused', reason: flag };
}
export const PAUSED_RETRY_AFTER_S = 300;

/** Marks an answer as a DELIBERATE pause: the 5xx monitor does not count it as a failure (otherwise a pause would keep its own incident open, and re-pause the area right after the owner clears it). */
export const PAUSED_HEADER = 'x-ops-paused';

/** The 503 every paused function answers: the body above, Retry-After, and the marker header. */
export function pausedResponse(flag: FlagKey, cors: Record<string, string> = {}): Response {
  return json(pausedBody(flag), 503, { ...cors, 'retry-after': String(PAUSED_RETRY_AFTER_S), [PAUSED_HEADER]: flag });
}
