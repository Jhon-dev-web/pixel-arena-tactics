import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { SaveData } from './engine';
import { assertUploadSize, toUploadBlob } from './saveUpload';

// The client side of the season ranking (server side: supabase/migrations/0004 + 0005 and the submit-progress function; docs/SEASON_RANKING.md).
// The client NEVER decides anything here: it posts the save, then only reads what the server says (the season row, the public leaderboard, its own place).
// No prize amount exists in the client: the owner may fill `prize_note` on the season row and the game then shows that text, verbatim.

/** Shipped switched OFF. Until the owner sets VITE_SEASON_RANKING_ENABLED=true (a build variable: redeploy after changing it) the screen is hidden and nothing is submitted. */
export const seasonRankingEnabled: boolean = import.meta.env.VITE_SEASON_RANKING_ENABLED === 'true';

/** The server accepts one snapshot per user per 10 minutes (SNAPSHOT_MIN_INTERVAL_MS in the function); the game never asks more often than that on a timer. */
export const SUBMIT_INTERVAL_MS = 10 * 60 * 1000;
/** An important event (level up, boss kill) may ask sooner, but never more than once a minute. */
export const EVENT_MIN_GAP_MS = 60 * 1000;
/** Wait after login before the first submission, so the save and the Pass answer have settled. */
export const FIRST_SUBMIT_DELAY_MS = 15 * 1000;

// ---- types --------------------------------------------------------------------------------------------------------------------------------

export type SeasonStatus = 'upcoming' | 'open' | 'frozen' | 'closed' | 'paid';

export interface SeasonRow {
  number: number;
  // null while a ranked season waits for the Pass goal (migration 0006); the pre-season (kind 'pre', number 0) has no prize and no real end.
  starts_at: string | null;
  ends_at: string | null;
  freeze_at: string | null;
  kind?: 'pre' | 'ranked';
  status: SeasonStatus;
  prize_note: string | null;
}

export interface LeaderRow {
  rank: number;
  username: string | null;
  level_total: number;
  paragon_level: number;
  highest_floor: number;
  deepest_depth: number;
  flag_count: number;
}

export interface MyEntry {
  season: number;
  rank: number | null;
  level_total: number;
  paragon_level: number;
  highest_floor: number;
  deepest_depth: number;
  flag_count: number;
  disqualified: boolean;
}

export type Verdict = 'ok' | 'flagged' | 'rejected';

// ---- pure helpers (unit tested) ------------------------------------------------------------------------------------------------------------

/** Which season the screen shows: the open one; otherwise the newest that already ran; otherwise the next one coming. */
export function pickSeason(rows: SeasonRow[], now: number): SeasonRow | null {
  const sorted = [...rows].sort((a, b) => a.number - b.number);
  const open = sorted.filter((s) => s.status === 'open' && s.starts_at !== null && Date.parse(s.starts_at) <= now);
  if (open.length > 0) return open[open.length - 1];
  const ran = sorted.filter((s) => s.status === 'frozen' || s.status === 'closed' || s.status === 'paid');
  if (ran.length > 0) return ran[ran.length - 1];
  return sorted.find((s) => s.status === 'upcoming' || s.status === 'open') ?? null;
}

export type Eligibility = 'web_only' | 'no_season' | 'not_open' | 'over' | 'needs_pass' | 'needs_email' | 'disqualified' | 'flagged' | 'eligible';

export interface EligibilityInput {
  /** Signed in against a Supabase backend (false in the desktop / offline build). */
  online: boolean;
  season: SeasonRow | null;
  now: number;
  /** The SERVER's answer about the Pass (never the save's flag). */
  ownsPass: boolean;
  emailConfirmed: boolean;
  /** The verdict the server gave the last submission of this session, if any. */
  lastVerdict: Verdict | null;
  mine: MyEntry | null;
}

/** The plain-language state of the player for the screen. The server enforces every one of these again; this only explains. */
export function seasonEligibility(i: EligibilityInput): Eligibility {
  if (!i.online) return 'web_only';
  if (!i.season) return 'no_season';
  if (i.season.status === 'upcoming' || !i.season.starts_at || !i.season.freeze_at || (i.season.status === 'open' && i.now < Date.parse(i.season.starts_at))) return 'not_open';
  if (i.season.status !== 'open' || i.now >= Date.parse(i.season.freeze_at)) return 'over';
  if (!i.ownsPass) return 'needs_pass';
  if (!i.emailConfirmed) return 'needs_email';
  if (i.mine?.disqualified) return 'disqualified';
  if (i.lastVerdict === 'flagged' || i.lastVerdict === 'rejected') return 'flagged';
  return 'eligible';
}

export interface SubmitClock {
  now: number;
  lastAttemptAt: number | null;
  /** Something worth reporting happened (the hero gained a level, a boss fell). */
  event: boolean;
}

/** When to post the save: on the 10 minute rhythm, and early (but not more than once a minute) after an important event. */
export function shouldSubmitNow(c: SubmitClock): boolean {
  if (c.lastAttemptAt === null) return true;
  const gap = c.now - c.lastAttemptAt;
  if (gap < 0) return true; // the clock went back: ask again rather than wait forever
  if (c.event) return gap >= EVENT_MIN_GAP_MS;
  return gap >= SUBMIT_INTERVAL_MS;
}

// ---- the submission status (a tiny external store so the screen can show one line without prop drilling) ------------------------------------

export interface SubmitStatus {
  state: 'idle' | 'sending' | 'done' | 'error';
  at: number | null;
  verdict: Verdict | null;
  reasons: string[];
  throttled: boolean;
  /** What the ranking did with it: 'updated', 'unchanged', 'no_pass', 'email_unconfirmed', 'season_not_open', ... */
  season: string | null;
  /** The server answered 409 save_not_synced: the posted save was not the stored one (yet). Nothing was judged or flagged; try again shortly. */
  pendingSync?: boolean;
}

let status: SubmitStatus = { state: 'idle', at: null, verdict: null, reasons: [], throttled: false, season: null };
const listeners = new Set<() => void>();

function setStatus(next: SubmitStatus): void {
  status = next;
  listeners.forEach((l) => l());
}

export const getSubmitStatus = (): SubmitStatus => status;
export function resetSubmitStatus(): void {
  setStatus({ state: 'idle', at: null, verdict: null, reasons: [], throttled: false, season: null });
}
export function useSubmitStatus(): SubmitStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSubmitStatus,
    getSubmitStatus,
  );
}

// ---- network -----------------------------------------------------------------------------------------------------------------------------

interface SubmitResponse {
  verdict?: unknown;
  reasons?: unknown;
  throttled?: unknown;
  season?: unknown;
}

/**
 * Posts the save to the submit-progress function. NEVER throws and never blocks play: any failure becomes state 'error' (the screen shows one small line).
 * Returns immediately when the flag is off or there is no backend (desktop / offline build), without any request.
 */
export async function submitProgress(save: SaveData, now: number = Date.now()): Promise<SubmitStatus> {
  if (!seasonRankingEnabled || !supabase) return status;
  setStatus({ ...status, state: 'sending' });
  try {
    const blob = assertUploadSize(toUploadBlob(save)); // refuses oversized saves before any request, like the save upload does
    const { data, error } = await supabase.functions.invoke('submit-progress', { body: blob });
    if (error) throw error;
    const r = (data ?? {}) as SubmitResponse;
    const verdict = r.verdict === 'ok' || r.verdict === 'flagged' || r.verdict === 'rejected' ? r.verdict : null;
    if (!verdict) throw new Error('bad_response');
    setStatus({
      pendingSync: false,
      state: 'done',
      at: now,
      verdict,
      reasons: Array.isArray(r.reasons) ? r.reasons.filter((x): x is string => typeof x === 'string').slice(0, 20) : [],
      throttled: r.throttled === true,
      season: typeof r.season === 'string' ? r.season : null,
    });
  } catch (err) {
    if ((err as { context?: { status?: number } } | null)?.context?.status === 409) setStatus({ ...status, state: 'idle', at: now, pendingSync: true });
    else setStatus({ ...status, state: 'error', at: now });
  }
  return status;
}

export async function fetchSeasons(): Promise<SeasonRow[]> {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase.from('seasons').select('number,kind,starts_at,ends_at,freeze_at,status,prize_note').order('number');
  if (error) throw new Error('seasons_read_failed');
  return (data ?? []) as SeasonRow[];
}

/** The public top 100 of a season (the view has no user ids or e-mails). */
export async function fetchLeaderboard(season: number): Promise<LeaderRow[]> {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase
    .from('season_leaderboard')
    .select('rank,username,level_total,paragon_level,highest_floor,deepest_depth,flag_count')
    .eq('season', season)
    .order('rank')
    .limit(100);
  if (error) throw new Error('leaderboard_read_failed');
  return (data ?? []) as LeaderRow[];
}

export async function fetchMyEntry(season: number): Promise<MyEntry | null> {
  if (!supabase) throw new Error('not_configured');
  const { data, error } = await supabase.rpc('season_my_entry', { p_season: season });
  if (error) throw new Error('my_entry_read_failed');
  const rows = (data ?? []) as MyEntry[];
  return rows[0] ?? null;
}
