import type { DiscordStore, LinkStatus } from './handler.ts';

// The real store of the Discord task: three PostgREST rpc calls with the service-role key (the functions of migration 0038 are granted to service_role only). Nothing here logs or returns a key, and no
// call carries a Discord token: the callback hands over only the account id, the Discord user id and the membership verdict.
export interface DiscordDbConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

const LINK_STATUSES: readonly LinkStatus[] = ['verified', 'not_member', 'already_used', 'already_verified'];

export function createDiscordStore(cfg: DiscordDbConfig): DiscordStore {
  const doFetch = cfg.fetchFn ?? fetch;
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const res = await doFetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`${name}_${res.status}`);
    return res.json();
  }
  return {
    async createState(userId, state) {
      const out = (await rpc('discord_state_create', { p_user: userId, p_state: state })) as { status?: unknown } | null;
      if (out?.status === 'ok' || out?.status === 'already_verified' || out?.status === 'rate_limited') return out.status;
      throw new Error('discord_state_create_bad_answer');
    },
    async consumeState(state) {
      const out = await rpc('discord_state_consume', { p_state: state });
      return typeof out === 'string' && out !== '' ? out : null;
    },
    async complete(userId, discordUserId, isMember) {
      const out = (await rpc('discord_link_complete', { p_user: userId, p_discord_user_id: discordUserId, p_is_member: isMember })) as { status?: unknown } | null;
      if (typeof out?.status === 'string' && (LINK_STATUSES as readonly string[]).includes(out.status)) return out.status as LinkStatus;
      throw new Error('discord_link_complete_bad_answer');
    },
  };
}
