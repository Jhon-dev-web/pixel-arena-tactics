import { supabase } from './supabaseClient';

// Settings > Passe: HOW the account got the Adventurer Pass, read-only from the account's own active entitlement row (the same row passServer.ts reads for "does it own the Pass"; RLS lets a user read
// only his own). Nothing is written and nothing here decides ownership.
// 'stripe' is a HISTORICAL value, kept on purpose: the card checkout was removed (docs/PAGAMENTOS_DESCARTADOS.md), but rows written by it can still be in the database, and the admin panel
// reads the same value as "cartão (legado)". Do not remove it.
export type PassSourceId = 'stripe' | 'mercadopago' | 'crypto_bsc' | 'crypto_sol' | 'grant' | 'referral' | 'promo';
const KNOWN: PassSourceId[] = ['stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant', 'referral', 'promo'];

/** The way the active Pass was obtained, or null when it cannot be told (no backend, not signed in, no row, an answer from a newer server). */
export async function fetchPassSource(): Promise<PassSourceId | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('entitlements').select('source').eq('kind', 'adventurer_pass').eq('status', 'active').order('valid_through_season', { ascending: false }).limit(1);
    if (error || !data?.length) return null;
    const source = String((data[0] as { source?: unknown }).source);
    return (KNOWN as string[]).includes(source) ? (source as PassSourceId) : null;
  } catch {
    return null;
  }
}
