import type { SaveData } from './engine';
import type { GrantedReward, TierKind } from '../lib/referral';

// Referral rewards in the save (docs/WAITLIST.md: the reward_ref values are the contract with the server). The SERVER grants (public.referral_rewards_granted); the game reads what it granted and puts
// the cosmetics into the save so they show where titles and portrait frames show. Pure and idempotent: applying the same rewards again changes nothing and returns the same save object.
// The free Adventurer's Pass is not here on purpose: it is an entitlement row (source 'referral') the game already reads like any other Pass; there is nothing to grant on the client.

/** The cosmetic each granted reward id maps to, and the kind the server must have granted it as (a 'title' ref can only be a title). */
export const REFERRAL_COSMETICS: Readonly<Record<string, { kind: Exclude<TierKind, 'pass'>; cosmetic: string }>> = {
  recruiter: { kind: 'title', cosmetic: 'title_recruiter' },
  portrait_frame_recruiter: { kind: 'cosmetic', cosmetic: 'frame_recruiter' },
  recruitment_legend: { kind: 'title', cosmetic: 'title_recruitment_legend' },
};

/** The cosmetic ids a list of granted rewards gives (unknown refs, wrong kinds and the Pass are ignored), without duplicates. */
export function referralCosmeticIds(rewards: readonly Pick<GrantedReward, 'kind' | 'ref'>[]): string[] {
  const ids: string[] = [];
  for (const r of rewards) {
    const known = Object.prototype.hasOwnProperty.call(REFERRAL_COSMETICS, r.ref) ? REFERRAL_COSMETICS[r.ref] : undefined;
    if (known && known.kind === r.kind && !ids.includes(known.cosmetic)) ids.push(known.cosmetic);
  }
  return ids;
}

/** The save with every granted referral cosmetic in `cosmetics`. Returns the SAME object when there is nothing new, so applying it twice (or on every login) is free and never re-renders. */
export function applyReferralCosmetics(save: SaveData, rewards: readonly Pick<GrantedReward, 'kind' | 'ref'>[]): SaveData {
  const missing = referralCosmeticIds(rewards).filter((id) => !save.cosmetics.includes(id));
  if (missing.length === 0) return save;
  return { ...save, cosmetics: [...save.cosmetics, ...missing] };
}
