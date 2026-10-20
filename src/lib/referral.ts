import { supabase } from './supabaseClient';
import { SUPPORT } from './supportConfig';
import { DEFAULT_REFERRAL_TIERS } from './referralTiers';
import type { GrantedReward, ReferralStatus, ReferralTier, TierKind, TierMetric } from './referralTiers';

// The game's side of the referral rewards (migration 0016 part B, docs/WAITLIST.md). ONLINE ONLY: both reads are security-definer functions that answer for the signed-in account (no id is ever sent):
//   * my_referral_status()  the account's own invite code, the two counters and the rewards already granted to it;
//   * referral_tiers()      (migration 0017, optional) the active reward tiers, so the panel can show what is still to earn.
// Nothing here writes anything and nothing here decides anything: the server grants, the game only reads and shows. A reward that the server has granted is applied to the save by game/referralRewards.ts.

export type { GrantedReward, ReferralStatus, ReferralTier, TierKind, TierMetric } from './referralTiers';
export { DEFAULT_REFERRAL_TIERS } from './referralTiers';

const isMetric = (v: unknown): v is TierMetric => v === 'qualified' || v === 'paying';
const isKind = (v: unknown): v is TierKind => v === 'title' || v === 'cosmetic' || v === 'pass';
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const text = (v: unknown, max = 120): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** The shape of an invite code (the same alphabet and length as the portal: 10 letters and digits, no I O 0 1). */
export const INVITE_CODE_RE = /^[A-HJ-NP-Z2-9]{10}$/;

/** my_referral_status() -> ReferralStatus, or null when the answer is not an object (a signed-out call returns null, an old server returns something else). Unknown rewards are skipped, never trusted. */
export function parseReferralStatus(raw: unknown): ReferralStatus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === 'string' && INVITE_CODE_RE.test(r.code) ? r.code : null;
  const goal = typeof r.pass_goal === 'number' && Number.isFinite(r.pass_goal) && r.pass_goal > 0 ? Math.floor(r.pass_goal) : null;
  const rewards: GrantedReward[] = [];
  if (Array.isArray(r.rewards)) {
    for (const item of r.rewards) {
      if (!item || typeof item !== 'object') continue;
      const g = item as Record<string, unknown>;
      if (!isKind(g.kind) || !isMetric(g.metric) || typeof g.ref !== 'string' || g.ref === '') continue;
      rewards.push({ kind: g.kind, ref: g.ref.slice(0, 80), metric: g.metric, minCount: count(g.min_count), grantedAt: typeof g.granted_at === 'string' ? g.granted_at : null });
    }
  }
  return { code, qualified: count(r.qualified), paying: count(r.paying), passGoal: goal, rewards };
}

/** referral_tiers() -> the tiers, or null when the answer is not a usable list (then the caller uses the defaults). */
export function parseReferralTiers(raw: unknown): ReferralTier[] | null {
  if (!Array.isArray(raw)) return null;
  const tiers: ReferralTier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    if (!isMetric(t.metric) || !isKind(t.kind) || typeof t.ref !== 'string' || t.ref === '') continue;
    const minCount = count(t.min_count);
    if (minCount < 1) continue;
    tiers.push({ metric: t.metric, minCount, kind: t.kind, ref: t.ref.slice(0, 80), labelPt: text(t.label_pt) || t.ref, labelEn: text(t.label_en) || t.ref });
  }
  return tiers.length > 0 ? tiers : null;
}

/** A tier with whether this account earned it: the server granted its reward (the same reward id, or the same metric and count: the owner may have moved the number since). The server's word, never the counters alone. */
export interface TierProgress extends ReferralTier {
  earned: boolean;
}

export function tierProgress(tiers: readonly ReferralTier[], status: Pick<ReferralStatus, 'rewards'> | null): TierProgress[] {
  return tiers.map((tier) => ({ ...tier, earned: !!status?.rewards.some((g) => g.ref === tier.ref || (g.metric === tier.metric && g.minCount === tier.minCount)) }));
}

/** `<portal>/?ref=CODE` from the configured portal origin, or null (no portal configured, an address that is not http(s), or a code that is not an invite code). */
export function inviteLink(code: string | null, portalUrl: string | null = SUPPORT.portalUrl): string | null {
  if (!code || !INVITE_CODE_RE.test(code) || !portalUrl) return null;
  try {
    const url = new URL(portalUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? `${url.origin}/?ref=${code}` : null;
  } catch {
    return null;
  }
}

/** The account's own referral status, read from the server. null: no backend (offline / desktop), signed out, or the server could not be reached. */
export async function fetchReferralStatus(): Promise<ReferralStatus | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('my_referral_status');
    if (error) return null;
    return parseReferralStatus(data);
  } catch {
    return null;
  }
}

/** The active tiers: the server's list when migration 0017 is applied, the defaults otherwise. Never throws and never returns an empty list. */
export async function fetchReferralTiers(): Promise<ReferralTier[]> {
  if (!supabase) return [...DEFAULT_REFERRAL_TIERS];
  try {
    const { data, error } = await supabase.rpc('referral_tiers');
    if (error) return [...DEFAULT_REFERRAL_TIERS];
    return parseReferralTiers(data) ?? [...DEFAULT_REFERRAL_TIERS];
  } catch {
    return [...DEFAULT_REFERRAL_TIERS];
  }
}

/** my_invite() (migration 0024): the account's own invite code (created the first time), its counters and the rewards granted to it. Same shape as my_referral_status. null: no backend, signed out, or unreachable. */
export async function fetchInvite(): Promise<ReferralStatus | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('my_invite');
    if (error) return null;
    return parseReferralStatus(data);
  } catch {
    return null;
  }
}

/** claim_invite(code): the fallback for a sign-up whose metadata did not reach the trigger. Fire and forget: the answer changes nothing on screen. */
export async function claimInvite(code: string): Promise<void> {
  if (!supabase || !INVITE_CODE_RE.test(code)) return;
  try {
    await supabase.rpc('claim_invite', { p_code: code });
  } catch {
    /* the sign-up already carried the code; this is only the second chance */
  }
}

/** The link the game gives out: `<game origin>/?ref=CODE` on the web build, null on the desktop build (no origin worth sharing: only the code is shown) or without a code. */
export function gameInviteLink(code: string | null, origin: string | null = typeof window !== 'undefined' && /^https?:$/.test(window.location?.protocol ?? '') ? window.location.origin : null, desktop: boolean = !supabase): string | null {
  if (desktop || !origin || !code || !INVITE_CODE_RE.test(code)) return null;
  return `${origin}/?ref=${code}`;
}

/** Share links that need no script of ours: WhatsApp, X and Telegram open their own page with the text filled in. */
export function shareLinks(text: string, link: string): { key: 'whatsapp' | 'x' | 'telegram'; href: string }[] {
  const both = encodeURIComponent(`${text} ${link}`);
  return [
    { key: 'whatsapp', href: `https://wa.me/?text=${both}` },
    { key: 'x', href: `https://twitter.com/intent/tweet?text=${both}` },
    { key: 'telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}` },
  ];
}
