import type { ServerCredit } from './promoRewards';

// The community task "Entrar no Discord" (migration 0038_discord_task.sql, docs/DISCORD_TASK.md). The player links his Discord account, the SERVER checks that he is in the game's Discord server and, for a verified
// account, puts one Gold credit in the server ledger (source 'discord'): at the League opening when it is still pre-season (the pre-season Gold is wiped at the reset), at once when the League is already open. The
// game only asks the server for the status and shows it; it never decides anything. This amount mirrors arena_private.discord_reward() in the migration (the one place on the server); a test pins the two together.

export const DISCORD_TASK = { gold: 500 } as const;

/** The source_ref the server writes for the reward (arena_private.server_credits, source 'discord'). */
export const DISCORD_SOURCE_REFS: readonly string[] = ['discord-gold'];

export const isDiscordCredit = (c: Pick<ServerCredit, 'sourceRef'>): boolean => c.sourceRef !== null && DISCORD_SOURCE_REFS.includes(c.sourceRef);

export type DiscordReward = 'none' | 'pending' | 'credited';

export interface DiscordTaskStatus {
  /** The account went through the check (the server has a verdict). */
  linked: boolean;
  /** The Discord account is a member of the game's server. */
  verified: boolean;
  reward: DiscordReward;
  rewardAmount: number;
}

/** What the Discord redirect brought back to the game (`/?discord=...`). */
export type DiscordReturn = 'ok' | 'not_member' | 'used' | 'error';
export const DISCORD_RETURNS: readonly DiscordReturn[] = ['ok', 'not_member', 'used', 'error'];

/** my_discord_task() -> status, or null when the answer is not usable (a signed-out call, an old server). */
export function parseDiscordTask(raw: unknown): DiscordTaskStatus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.linked !== 'boolean' || typeof r.verified !== 'boolean') return null;
  const reward: DiscordReward = r.reward === 'pending' || r.reward === 'credited' ? r.reward : 'none';
  const amount = typeof r.reward_amount === 'number' && Number.isInteger(r.reward_amount) && r.reward_amount > 0 ? r.reward_amount : DISCORD_TASK.gold;
  return { linked: r.linked, verified: r.verified, reward: r.verified ? reward : 'none', rewardAmount: amount };
}

export type DiscordView = 'not_linked' | 'not_member' | 'verified_pending' | 'verified_credited';

/** The four states of the task card. */
export function discordView(status: DiscordTaskStatus): DiscordView {
  if (status.verified) return status.reward === 'credited' ? 'verified_credited' : 'verified_pending';
  return status.linked ? 'not_member' : 'not_linked';
}
