import { useEffect, useSyncExternalStore } from 'react';
import { startPolling, type PollEnv } from './poller';
import { supabase } from './supabaseClient';

// The operations flags (migration 0021_ai_ops.sql) as the game sees them. The server answers public.ops_status(): maintenance_mode, market_paused, season_scoring_paused, pass_sales_paused.
//   * Normally the game asks every 5 minutes (jittered, paused in a hidden tab, like every periodic call of the game: lib/poller.ts) and right away after a failure it re-asks every 45 s.
//   * When the server cannot be reached the game does NOT guess from silence: it reads a STATIC file served by the game's own host (/status.json, edited and redeployed by the owner, no database behind
//     it). If that file says "maintenance": true the banner shows. If the host answers but the database does not for UNREACHABLE_AFTER_MS in a row, the game itself shows the maintenance banner
//     ("the server is not answering"). If the host does not answer either, the player is simply offline: no banner (the game already copes with that).
// Everything fails SOFT: nothing here blocks the game, throws, or changes a save.

export const OPS_POLL_MS = 5 * 60 * 1000;
export const OPS_RETRY_MS = 45 * 1000;
/** The database counts as unreachable (maintenance banner) after failing this long while the game's own host still answers. */
export const UNREACHABLE_AFTER_MS = 3 * 60 * 1000;
export const STATIC_STATUS_PATH = '/status.json';

export interface OpsFlagsView {
  maintenance: boolean;
  marketPaused: boolean;
  scoringPaused: boolean;
  passSalesPaused: boolean;
}

export type MaintenanceReason = 'flag' | 'static' | 'unreachable' | null;

export interface OpsState extends OpsFlagsView {
  /** Why the maintenance banner shows (null = it does not). */
  maintenanceReason: MaintenanceReason;
  /** Message from /status.json, if the owner wrote one (plain text, clipped). */
  staticMessage: string | null;
}

export const OPS_QUIET: OpsState = { maintenance: false, marketPaused: false, scoringPaused: false, passSalesPaused: false, maintenanceReason: null, staticMessage: null };

/** public.ops_status() -> flags. Only an exact `true` counts; anything else (null, a string, a missing key) is false. null when the answer is not an object at all. */
export function parseServerStatus(raw: unknown): OpsFlagsView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return { maintenance: o.maintenance_mode === true, marketPaused: o.market_paused === true, scoringPaused: o.season_scoring_paused === true, passSalesPaused: o.pass_sales_paused === true };
}

/** /status.json -> { maintenance, message }. `{ "maintenance": true, "message": "..." }`; anything else is "not in maintenance". null when the file is missing or not JSON. */
export function parseStaticStatus(raw: unknown): { maintenance: boolean; message: string | null } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const message = typeof o.message === 'string' ? o.message.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return { maintenance: o.maintenance === true, message: message || null };
}

/** What one probe found. */
export type Probe =
  | { kind: 'server'; flags: OpsFlagsView }
  // the database did not answer; `staticFile` is what /status.json said (null = the file could not be read either, i.e. the player's own network is the likely problem)
  | { kind: 'server_failed'; staticFile: { maintenance: boolean; message: string | null } | null };

export interface Tracker {
  state: OpsState;
  /** When the current run of failed server reads began while the host itself still answered. */
  failingSince: number | null;
}

export const INITIAL_TRACKER: Tracker = { state: OPS_QUIET, failingSince: null };

/** The state machine. Pure: (previous tracker, probe, now) -> next tracker. */
export function nextTracker(prev: Tracker, probe: Probe, now: number): Tracker {
  if (probe.kind === 'server') {
    return { failingSince: null, state: { ...probe.flags, maintenanceReason: probe.flags.maintenance ? 'flag' : null, staticMessage: null } };
  }
  const file = probe.staticFile;
  if (file === null) {
    // Neither the database nor the host answered: this is the player's connection, not an outage. Keep what is known, show nothing new.
    return { failingSince: null, state: prev.state.maintenanceReason === 'unreachable' ? OPS_QUIET : prev.state };
  }
  if (file.maintenance) {
    return { failingSince: prev.failingSince ?? now, state: { ...prev.state, maintenance: true, maintenanceReason: 'static', staticMessage: file.message } };
  }
  // The host answers, the database does not.
  const since = prev.failingSince ?? now;
  const unreachable = now - since >= UNREACHABLE_AFTER_MS;
  return { failingSince: since, state: unreachable ? { ...prev.state, maintenance: true, maintenanceReason: 'unreachable', staticMessage: file.message } : prev.state.maintenanceReason === 'flag' ? prev.state : { ...prev.state, maintenance: false, maintenanceReason: null } };
}

// ---- the store ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

let tracker: Tracker = INITIAL_TRACKER;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((l) => l());

export const getOpsState = (): OpsState => tracker.state;

export function applyProbe(probe: Probe, now: number = Date.now()): void {
  const next = nextTracker(tracker, probe, now);
  const changed = next.state !== tracker.state && JSON.stringify(next.state) !== JSON.stringify(tracker.state);
  tracker = changed ? next : { ...next, state: tracker.state };
  if (changed) emit();
}

/** For tests: back to the quiet state. */
export function resetOpsStatus(): void {
  tracker = INITIAL_TRACKER;
  emit();
}

export interface ProbeIO {
  readServer: () => Promise<unknown>;
  readStatic: () => Promise<unknown | null>;
}

/** One probe: the server first; only if it fails, the static file. Never throws. */
export async function probeOnce(io: ProbeIO): Promise<Probe> {
  try {
    const flags = parseServerStatus(await io.readServer());
    if (flags) return { kind: 'server', flags };
  } catch {
    /* fall through to the static file */
  }
  const staticFile = await io.readStatic().then(parseStaticStatus, () => null);
  return { kind: 'server_failed', staticFile };
}

const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error('failed'));
      },
    );
  });

/** The real IO: the Supabase RPC, and /status.json from the game's own host (never cached). */
export const browserProbeIO: ProbeIO = {
  readServer: async () => {
    if (!supabase) throw new Error('not_configured');
    const { data, error } = await withTimeout(supabase.rpc('ops_status'), 6_000);
    if (error) throw new Error('ops_status_failed');
    return data;
  },
  readStatic: async () => {
    const res = await withTimeout(fetch(`${STATIC_STATUS_PATH}?t=${Date.now()}`, { cache: 'no-store' }), 5_000);
    if (!res.ok) return null;
    return res.json();
  },
};

/** Starts the polling loop. Returns the stop function. No-op (and the state stays quiet) without a backend, i.e. in the offline / desktop build. */
export function startOpsStatusPolling(io: ProbeIO = browserProbeIO, configured: boolean = !!supabase, env?: Partial<PollEnv>): () => void {
  if (!configured) return () => undefined;
  return startPolling({
    intervalMs: OPS_POLL_MS,
    startDelayMs: 1_500,
    env,
    run: async () => {
      const probe = await probeOnce(io);
      applyProbe(probe);
      // Re-ask soon while the server is not answering (the unreachable rule needs several failed reads in a row); relax again once it does.
      return probe.kind === 'server_failed' && probe.staticFile !== null ? OPS_RETRY_MS : undefined;
    },
  });
}

/** React: the current flags. Mounts the polling once per consumer tree via OpsBanner; other components just read. */
export function useOpsState(): OpsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getOpsState,
    getOpsState,
  );
}

/** Mounted once (by OpsBanner): runs the polling for as long as the game is open. */
export function useOpsStatusPolling(): void {
  useEffect(() => startOpsStatusPolling(), []);
}
