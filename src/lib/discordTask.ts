import { DISCORD_RETURNS, parseDiscordTask } from '../game/discordTask';
import type { DiscordReturn, DiscordTaskStatus } from '../game/discordTask';
import { supabase } from './supabaseClient';
import { safeHttpsUrl } from './supportConfig';

// The game's side of the Discord task (migration 0038, Edge Functions discord-link-start / discord-link-callback). ONLINE ONLY. Nothing is stored in the browser: the OAuth `state` lives on the server
// (single use, 10 minutes), the answer of the round trip comes back as `/?discord=ok|not_member|used|error` and is kept in MEMORY until the game shows it once. The game never sees a Discord token.

export interface DiscordClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  functions: { invoke(name: string, opts: { method: 'POST'; body: Record<string, unknown> }): PromiseLike<{ data: unknown; error: unknown }> };
}

/** The invite link of the game's Discord server (VITE_DISCORD_INVITE_URL, a build variable), or null when it is not set or is not a plain https address: then the "Entrar no servidor" button is hidden. */
export const discordInviteUrl = (raw: string | undefined = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined): string | null => safeHttpsUrl(raw);

/** The account's status of the task. null: no backend (offline / desktop), signed out, migration not applied or unreachable. */
export async function fetchDiscordTask(client: DiscordClient | null = supabase): Promise<DiscordTaskStatus | null> {
  if (!client) return null;
  try {
    const { data, error } = await client.rpc('my_discord_task');
    if (error) return null;
    return parseDiscordTask(data);
  } catch {
    return null;
  }
}

export type StartResult = { kind: 'url'; url: string } | { kind: 'already_verified' } | { kind: 'rate_limited' } | { kind: 'error' };

/** The authorize address must be Discord's own: anything else is never followed. */
export const isDiscordAuthorizeUrl = (value: unknown): value is string => typeof value === 'string' && value.startsWith('https://discord.com/oauth2/authorize?');

/** Step 1: asks the server for the Discord authorize address. Never throws. */
export async function startDiscordLink(client: DiscordClient | null = supabase): Promise<StartResult> {
  if (!client) return { kind: 'error' };
  try {
    const { data, error } = await client.functions.invoke('discord-link-start', { method: 'POST', body: {} });
    const body = data && typeof data === 'object' ? (data as { status?: unknown; url?: unknown }) : null;
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      return status === 429 ? { kind: 'rate_limited' } : { kind: 'error' };
    }
    if (body?.status === 'already_verified') return { kind: 'already_verified' };
    if (body?.status === 'ok' && isDiscordAuthorizeUrl(body.url)) return { kind: 'url', url: body.url };
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

let pendingReturn: DiscordReturn | null = null;

/** Reads `?discord=` once, removes it from the address bar and keeps a known value in memory. Returns it (or null). Never throws, never touches storage. */
export function captureDiscordReturn(
  href: string = typeof window !== 'undefined' ? window.location.href : '',
  replaceUrl: (relative: string) => void = (u) => window.history.replaceState(null, '', u),
): DiscordReturn | null {
  try {
    const url = new URL(href);
    if (!url.searchParams.has('discord')) return null;
    const value = url.searchParams.get('discord') ?? '';
    url.searchParams.delete('discord');
    replaceUrl(url.pathname + url.search + url.hash);
    const found = (DISCORD_RETURNS as readonly string[]).includes(value) ? (value as DiscordReturn) : null;
    if (found) pendingReturn = found;
    return found;
  } catch {
    return null;
  }
}

/** The answer waiting in memory (once): reading it clears it. */
export function takeDiscordReturn(): DiscordReturn | null {
  const v = pendingReturn;
  pendingReturn = null;
  return v;
}

/** Test helper. */
export function setDiscordReturnForTest(v: DiscordReturn | null): void {
  pendingReturn = v;
}
