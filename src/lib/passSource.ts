import { supabase } from './supabaseClient';

// Settings > Passe: HOW the account got the Adventurer Pass, read-only from the account's own active entitlement row (the same row passServer.ts reads for "does it own the Pass"; RLS lets a user read
// only his own). Nothing is written and nothing here decides ownership.
export type PassSourceId = 'stripe' | 'mercadopago' | 'crypto_bsc' | 'crypto_sol' | 'grant';
const KNOWN: PassSourceId[] = ['stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant'];

/** The way the active Pass was obtained, or null when it cannot be told (no backend, not signed in, no row, an answer from a newer server). */
export async function fetchPassSource(): Promise<PassSourceId | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('entitlements').select('source').eq('kind', 'adventurer_pass').eq('status', 'active').limit(1);
    if (error || !data?.length) return null;
    const source = String((data[0] as { source?: unknown }).source);
    return (KNOWN as string[]).includes(source) ? (source as PassSourceId) : null;
  } catch {
    return null;
  }
}
