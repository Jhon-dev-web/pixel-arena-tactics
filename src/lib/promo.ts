import { supabase } from './supabaseClient';

// The game's side of the promo codes (migration 0027 part C). ONLINE ONLY: one security-definer function, public.redeem_promo_code(code), which answers for the signed-in account (no id is ever sent).
// The server decides everything (valid, expired, used up, already used by this account, already holds the Pass, too many tries) and, when it says 'ok', has already written the Adventurer Pass. This file only
// sends what the player typed and maps the answer; it never grants anything. After an 'ok' the caller re-asks the server about the Pass (App: recheckServerPass).

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

export interface PromoClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Redeems a code. A text that cannot be a code never leaves the device ('invalid', and it does not use up one of the account's hourly attempts). 'offline' = no backend (the desktop build / not configured).
 * Never throws.
 */
export async function redeemPromoCode(raw: string, client: PromoClient | null = supabase): Promise<PromoOutcome> {
  if (!client) return 'offline';
  const code = normalizePromoInput(raw);
  if (!PROMO_CODE_RE.test(code)) return 'invalid';
  try {
    const { data, error } = await client.rpc('redeem_promo_code', { p_code: code });
    if (error) return 'error';
    return parsePromoResult(data);
  } catch {
    return 'error';
  }
}
