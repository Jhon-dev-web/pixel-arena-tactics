import { supabase } from './supabaseClient';

// The game's side of the promo codes (migration 0027 part C). ONLINE ONLY: one security-definer function, public.redeem_promo_code(code), which answers for the signed-in account (no id is ever sent).
// The server decides everything (valid, expired, used up, already used by this account, already holds the Pass, too many tries) and, when it says 'ok', has already written the Adventurer Pass. This file only
// sends what the player typed and maps the answer; it never grants anything. After an 'ok' the caller re-asks the server about the Pass (App: recheckServerPass).

/** What a code gave, as the server says it (the Pass, or a number of Gold / Éter / one potion). */
export interface PromoReward {
  kind: 'pass' | 'gold' | 'shards' | 'consumable';
  itemId: string | null;
  amount: number | null;
}

export interface PromoResult {
  outcome: PromoOutcome;
  /** Only with outcome 'ok' and a reward the game understood; null otherwise. */
  reward: PromoReward | null;
}

export type PromoOutcome = 'ok' | 'invalid' | 'expired' | 'exhausted' | 'already_redeemed' | 'already_has_pass' | 'rate_limited' | 'offline' | 'error';

/** The shape of a code: 10 characters of the invite alphabet (no I O 0 1). */
export const PROMO_CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;

/** What the player typed ("abcde-fghjk", spaces, lower case) -> the canonical code (upper case, no spaces or dashes). Does not check the shape. */
export function normalizePromoInput(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export const looksLikePromoCode = (raw: string): boolean => PROMO_CODE_RE.test(normalizePromoInput(raw));

const SERVER_STATUS: readonly PromoOutcome[] = ['ok', 'invalid', 'expired', 'exhausted', 'already_redeemed', 'already_has_pass', 'rate_limited'];

/** The server's answer -> an outcome. Anything that is not a clear known status is 'error' (never 'ok' by accident). */
export function parsePromoResult(raw: unknown): PromoOutcome {
  const status = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { status?: unknown }).status : undefined;
  return typeof status === 'string' && (SERVER_STATUS as readonly string[]).includes(status) ? (status as PromoOutcome) : 'error';
}

/** The reward an 'ok' answer names, or null when it is missing or not one this game knows. */
export function parsePromoReward(raw: unknown): PromoReward | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { reward?: unknown; item_id?: unknown; amount?: unknown };
  if (r.reward === 'pass') return { kind: 'pass', itemId: null, amount: null };
  const amount = typeof r.amount === 'number' && Number.isInteger(r.amount) && r.amount > 0 ? r.amount : null;
  if ((r.reward === 'gold' || r.reward === 'shards') && amount) return { kind: r.reward, itemId: null, amount };
  if (r.reward === 'consumable' && amount && typeof r.item_id === 'string' && /^[a-z0-9_]{1,40}$/.test(r.item_id)) return { kind: 'consumable', itemId: r.item_id, amount };
  return null;
}

export interface PromoClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Redeems a code and says what it gave. A text that cannot be a code never leaves the device ('invalid', and it does not use up one of the account's hourly attempts). 'offline' = no backend (the desktop build / not
 * configured). Never throws.
 */
export async function redeemPromoDetailed(raw: string, client: PromoClient | null = supabase): Promise<PromoResult> {
  if (!client) return { outcome: 'offline', reward: null };
  const code = normalizePromoInput(raw);
  if (!PROMO_CODE_RE.test(code)) return { outcome: 'invalid', reward: null };
  try {
    const { data, error } = await client.rpc('redeem_promo_code', { p_code: code });
    if (error) return { outcome: 'error', reward: null };
    const outcome = parsePromoResult(data);
    return { outcome, reward: outcome === 'ok' ? parsePromoReward(data) : null };
  } catch {
    return { outcome: 'error', reward: null };
  }
}

/** Same as redeemPromoDetailed, only the outcome. */
export async function redeemPromoCode(raw: string, client: PromoClient | null = supabase): Promise<PromoOutcome> {
  return (await redeemPromoDetailed(raw, client)).outcome;
}
