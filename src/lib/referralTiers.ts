// The shapes of the referral rewards and the default tiers, with no dependency (so the tests of the SQL migrations can read them without the app's client). The reads are in referral.ts.

export type TierMetric = 'qualified' | 'paying';
export type TierKind = 'title' | 'cosmetic' | 'pass';

/** A reward the server granted to this account (a row of public.referral_rewards_granted, with the tier's label). */
export interface GrantedReward {
  kind: TierKind;
  ref: string;
  metric: TierMetric;
  minCount: number;
  grantedAt: string | null;
}

/** What my_referral_status() answers. `code` is null when the account's e-mail is not on the waitlist (there is no invite link to give). */
export interface ReferralStatus {
  code: string | null;
  /** invited people who qualified (made an account and reached the hero level) */
  qualified: number;
  /** invited people who bought the Pass */
  paying: number;
  /** the number of paying invites that earns the free Pass (the 'pass' tier), or null when no such tier is active */
  passGoal: number | null;
  rewards: GrantedReward[];
}

/** One reward tier: what it takes and what it gives. */
export interface ReferralTier {
  metric: TierMetric;
  minCount: number;
  kind: TierKind;
  ref: string;
  labelPt: string;
  labelEn: string;
}

/** The tiers migration 0016 seeds. Shown when the server cannot tell the list (migration 0017 not applied yet, or the call failed). */
export const DEFAULT_REFERRAL_TIERS: readonly ReferralTier[] = [
  { metric: 'qualified', minCount: 1, kind: 'title', ref: 'recruiter', labelPt: 'Título: Recrutador', labelEn: 'Title: Recruiter' },
  { metric: 'qualified', minCount: 3, kind: 'cosmetic', ref: 'portrait_frame_recruiter', labelPt: 'Moldura de retrato: Recrutador', labelEn: 'Portrait frame: Recruiter' },
  { metric: 'paying', minCount: 10, kind: 'pass', ref: 'adventurer_pass', labelPt: 'Passe de Aventureiro grátis', labelEn: 'Free Adventurer’s Pass' },
  { metric: 'qualified', minCount: 25, kind: 'title', ref: 'recruitment_legend', labelPt: 'Título: Lenda do Recrutamento', labelEn: 'Title: Recruitment Legend' },
];
