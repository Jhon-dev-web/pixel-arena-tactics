import { supabase } from '../lib/supabaseClient';

export type UsernameRpcStatus =
  | 'AVAILABLE'
  | 'SUCCESS'
  | 'USERNAME_TAKEN'
  | 'INVALID_USERNAME'
  | 'USERNAME_ALREADY_SET'
  | 'NOT_AUTHENTICATED';

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

function readStatus(data: unknown): UsernameRpcStatus {
  if (typeof data !== 'string') throw new Error('Unexpected username response.');
  return data as UsernameRpcStatus;
}

export async function getMyUsername(): Promise<string | null> {
  const client = requireSupabase();
  const { data, error } = await client.from('profiles').select('username').maybeSingle();
  if (error) throw error;
  return typeof data?.username === 'string' ? data.username : null;
}

export async function checkUsernameAvailability(username: string): Promise<UsernameRpcStatus> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('check_username_availability', { p_username: username });
  if (error) throw error;
  return readStatus(data);
}

export async function claimUsername(username: string): Promise<UsernameRpcStatus> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('claim_username', { p_username: username });
  if (error) throw error;
  return readStatus(data);
}
