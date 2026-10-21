import { parseServerCredits, type ServerCredit } from '../game/promoRewards';
import { supabase } from './supabaseClient';

// The game's side of the server credit ledger (migration 0028). ONLINE ONLY, answers for the signed-in account (no id is ever sent). Two reads:
//   claim_server_credits()      hands over the credits not claimed yet and marks them claimed, in one statement (so two tabs cannot both get one)
//   my_recent_credits(days)     what was claimed in the last days: gives back a credit whose claim answer was lost (the save never got it)
// Neither one changes the save: App applies the result with applyServerCredits (game/promoRewards.ts), once per credit id. Nothing is stored in the browser. Never throws: a failure is `null`.

export interface CreditsClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

async function call(client: CreditsClient | null, name: string, args?: Record<string, unknown>): Promise<ServerCredit[] | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc(name, args);
    if (error) return null;
    return parseServerCredits(data);
  } catch {
    return null;
  }
}

export const claimServerCredits = (client: CreditsClient | null = supabase): Promise<ServerCredit[] | null> => call(client, 'claim_server_credits');
export const recentServerCredits = (days = 14, client: CreditsClient | null = supabase): Promise<ServerCredit[] | null> => call(client, 'my_recent_credits', { p_days: Math.min(30, Math.max(1, Math.floor(days))) });

/**
 * What the game should apply now: the credits just claimed and, when `recover` (at login), the recently claimed ones too, without duplicates. `null` when neither call worked (offline, migration not applied):
 * the caller keeps the save as it is and asks again later.
 */
export async function fetchCreditsToApply(opts: { recover: boolean }, client: CreditsClient | null = supabase): Promise<ServerCredit[] | null> {
  const claimed = await claimServerCredits(client);
  const recent = opts.recover ? await recentServerCredits(14, client) : [];
  if (claimed === null && recent === null) return null;
  const byId = new Map<string, ServerCredit>();
  for (const c of [...(recent ?? []), ...(claimed ?? [])]) if (!byId.has(c.id)) byId.set(c.id, c);
  return [...byId.values()];
}
