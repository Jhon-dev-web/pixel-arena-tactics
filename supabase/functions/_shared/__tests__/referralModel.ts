// A TypeScript model of the referral rules of migration 0016 (part B). The rules live in SQL (the database is the authority and runs them in one transaction); this file restates the same
// decisions as small pure functions so they can be tested exhaustively without a database. migration0016.test.ts reads the SQL and pins the same predicates (the paid-source list, the
// qualification conditions, the idempotent grant), so the two cannot drift apart silently.

/** The sources of a PAID Adventurer's Pass: the same list as arena_private.paid_pass_count() (0013). 'grant' and 'referral' are NOT sales. */
export const PAID_PASS_SOURCES = ['stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol'] as const;

export interface Entitlement {
  userId: string;
  kind: 'adventurer_pass';
  source: 'stripe' | 'mercadopago' | 'crypto_bsc' | 'crypto_sol' | 'grant' | 'referral';
  providerRef: string;
  status: 'active' | 'refunded' | 'revoked';
  livemode: boolean;
}

export const isPaidActivePass = (e: Entitlement): boolean => e.kind === 'adventurer_pass' && e.status === 'active' && e.livemode && (PAID_PASS_SOURCES as readonly string[]).includes(e.source);

/** arena_private.paid_pass_count(): the number behind the Pass goal and the public meter. */
export const paidPassCount = (entitlements: readonly Entitlement[]): number => entitlements.filter(isPaidActivePass).length;

/** arena_private.email_canonical(): lower case, no +tag, no dots for gmail (and googlemail is gmail). */
export function emailCanonical(email: string): string {
  const lower = email.toLowerCase();
  const at = lower.indexOf('@');
  let local = lower.slice(0, at).split('+')[0];
  let domain = lower.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.split('.').join('');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

export interface Inviter {
  id: string;
  canon: string;
  ipHash: string | null;
  createdAtMs: number;
}

export type RefDecision = { referredBy: string | null; ignored: 'unknown_code' | 'self_email' | 'self_ip' | null };

/** The part of waitlist_join that decides what to do with a ?ref= : only for a NEW row, and never for oneself. */
export function decideReferral(args: {
  inviter: Inviter | null | undefined; // the row owning the ref code, if any
  hasRef: boolean;
  newCanon: string;
  ipHash: string | null;
  nowMs: number;
  windowHours: number;
  /** Does another sign-up invited by this inviter come from the same IP hash inside the window? */
  otherReferralFromSameIpInWindow: boolean;
}): RefDecision {
  if (!args.hasRef) return { referredBy: null, ignored: null };
  if (!args.inviter) return { referredBy: null, ignored: 'unknown_code' };
  if (args.inviter.canon === args.newCanon) return { referredBy: null, ignored: 'self_email' };
  const windowMs = args.windowHours * 3_600_000;
  if (args.ipHash !== null && ((args.inviter.ipHash === args.ipHash && args.inviter.createdAtMs > args.nowMs - windowMs) || args.otherReferralFromSameIpInWindow)) {
    return { referredBy: null, ignored: 'self_ip' };
  }
  return { referredBy: args.inviter.id, ignored: null };
}

export interface Invited {
  canon: string;
  email: string;
  qualified: boolean;
}

export interface Account {
  id: string;
  email: string;
  confirmed: boolean;
}

/** arena_private.referral_counts(): aliases of one person count once, the inviter's own alias never counts, "paying" is read live from the entitlements. */
export function countReferrals(args: { inviterCanon: string; invited: readonly Invited[]; accounts: readonly Account[]; entitlements: readonly Entitlement[] }) {
  const rows = args.invited.filter((r) => r.canon !== args.inviterCanon);
  const distinct = (list: readonly Invited[]) => new Set(list.map((r) => r.canon)).size;
  const payingOf = (r: Invited) =>
    args.accounts.some((a) => a.email.toLowerCase() === r.email && args.entitlements.some((e) => e.userId === a.id && isPaidActivePass(e)));
  return { referred: distinct(rows), qualified: distinct(rows.filter((r) => r.qualified)), paying: distinct(rows.filter(payingOf)) };
}

export interface Snapshot {
  userId: string;
  verdict: 'ok' | 'flagged' | 'rejected';
  createdAtMs: number;
  heroLevel: number;
}

/** arena_private.referral_qualify_user(): confirmed account with the same e-mail + an accepted snapshot after launch at min level or more. Nothing before launch_at is set. */
export function qualifies(args: { account: Account | undefined; email: string; snapshots: readonly Snapshot[]; launchAtMs: number | null; nowMs: number; minLevel: number }): boolean {
  const { account, launchAtMs } = args;
  if (!account || !account.confirmed || account.email.toLowerCase() !== args.email) return false;
  if (launchAtMs === null || launchAtMs > args.nowMs) return false;
  return args.snapshots.some((s) => s.userId === account.id && s.verdict === 'ok' && s.createdAtMs >= launchAtMs && s.heroLevel >= args.minLevel);
}

export interface Tier {
  metric: 'qualified' | 'paying';
  minCount: number;
  kind: 'title' | 'cosmetic' | 'pass';
  rewardRef: string;
  active: boolean;
}

/** The default tiers seeded by the migration. */
export const DEFAULT_TIERS: readonly Tier[] = [
  { metric: 'qualified', minCount: 1, kind: 'title', rewardRef: 'recruiter', active: true },
  { metric: 'qualified', minCount: 3, kind: 'cosmetic', rewardRef: 'portrait_frame_recruiter', active: true },
  { metric: 'paying', minCount: 10, kind: 'pass', rewardRef: 'adventurer_pass', active: true },
  { metric: 'qualified', minCount: 25, kind: 'title', rewardRef: 'recruitment_legend', active: true },
];

export interface Granted {
  userId: string;
  metric: Tier['metric'];
  minCount: number;
  kind: Tier['kind'];
  rewardRef: string;
}

/**
 * arena_private.referral_grant(): grants every active tier reached and not granted yet, once per account. The free Pass is a new entitlement (source 'referral', livemode true, a fixed
 * providerRef) and is skipped, with the tier left open, when the account already holds an active Pass. Mutates `granted` and `entitlements` like the SQL does; returns what it granted.
 */
export function grantTiers(args: { userId: string; counts: { qualified: number; paying: number }; tiers: readonly Tier[]; granted: Granted[]; entitlements: Entitlement[] }): Granted[] {
  const out: Granted[] = [];
  for (const tier of [...args.tiers].filter((t) => t.active).sort((a, b) => a.minCount - b.minCount)) {
    if ((tier.metric === 'paying' ? args.counts.paying : args.counts.qualified) < tier.minCount) continue;
    if (args.granted.some((g) => g.userId === args.userId && g.metric === tier.metric && g.minCount === tier.minCount)) continue;
    if (tier.kind === 'pass') {
      const holdsActive = args.entitlements.some((e) => e.userId === args.userId && e.kind === 'adventurer_pass' && e.status === 'active');
      const sameRef = args.entitlements.some((e) => e.source === 'referral' && e.providerRef === `referral-${args.userId}`);
      if (holdsActive || sameRef) continue;
      args.entitlements.push({ userId: args.userId, kind: 'adventurer_pass', source: 'referral', providerRef: `referral-${args.userId}`, status: 'active', livemode: true });
    }
    const row: Granted = { userId: args.userId, metric: tier.metric, minCount: tier.minCount, kind: tier.kind, rewardRef: tier.rewardRef };
    args.granted.push(row);
    out.push(row);
  }
  return out;
}
