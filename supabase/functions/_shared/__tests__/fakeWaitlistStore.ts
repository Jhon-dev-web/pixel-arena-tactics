import { WAITLIST_LIMITS, withinLimit } from '../waitlist/logic.ts';
import type { JoinRequest, WaitlistStore } from '../waitlist/store.ts';
import { DEFAULT_TIERS, countReferrals, decideReferral, emailCanonical, grantTiers, qualifies } from './referralModel.ts';
import type { Account, Entitlement, Granted, Snapshot, Tier } from './referralModel.ts';

// In-memory stand-in for migration 0016: the same decisions as public.waitlist_join (limits first, short-circuiting like the SQL `or`, then the referral decision, then insert-if-absent; an
// unsubscribed address stays unsubscribed) plus the "world" the referral rules look at (game accounts, accepted snapshots, entitlements). The rules themselves are in referralModel.ts.
export interface Row {
  id: string;
  email: string;
  canon: string;
  locale: string;
  source: string | null;
  ipHash: string | null;
  subnetHash: string | null;
  unsubscribedAt: number | null;
  refCode: string;
  viewKeyHash: string;
  referredBy: string | null;
  ignored: string | null;
  qualified: boolean;
  createdAtMs: number;
}

export function createFakeWaitlistStore() {
  const rows: Row[] = [];
  const hits = new Map<string, number>();
  const world = {
    nowMs: Date.UTC(2026, 10, 1),
    accounts: [] as Account[],
    snapshots: [] as Snapshot[],
    entitlements: [] as Entitlement[],
    granted: [] as Granted[],
    tiers: DEFAULT_TIERS.map((t) => ({ ...t })) as Tier[],
    config: { launchAtMs: null as number | null, minLevel: 10, windowHours: 24 },
    /** Make the next N join attempts collide on the random public code (the retry path). */
    collisions: 0,
  };
  let seq = 0;
  const hit = (bucket: string, max: number) => {
    const n = (hits.get(bucket) ?? 0) + 1;
    hits.set(bucket, n);
    return withinLimit(n, max);
  };

  const countsOf = (row: Row) =>
    countReferrals({
      inviterCanon: row.canon,
      invited: rows.filter((r) => r.referredBy === row.id).map((r) => ({ canon: r.canon, email: r.email, qualified: r.qualified })),
      accounts: world.accounts,
      entitlements: world.entitlements,
    });

  const accountOf = (row: Row) => world.accounts.find((a) => a.email.toLowerCase() === row.email && a.confirmed);

  /** referral_grant(): the inviter's rewards. */
  const grant = (row: Row): Granted[] => {
    const account = accountOf(row);
    if (!account) return [];
    const c = countsOf(row);
    return grantTiers({ userId: account.id, counts: c, tiers: world.tiers, granted: world.granted, entitlements: world.entitlements });
  };

  /** referral_process_user(): qualify the user's own sign-up, then grant to his inviter and to himself. */
  const processUser = (userId: string) => {
    const account = world.accounts.find((a) => a.id === userId);
    const self = account && rows.find((r) => r.email === account.email.toLowerCase());
    if (!account || !self) return;
    if (self.referredBy && !self.qualified && qualifies({ account, email: self.email, snapshots: world.snapshots, launchAtMs: world.config.launchAtMs, nowMs: world.nowMs, minLevel: world.config.minLevel })) self.qualified = true;
    const inviter = self.referredBy ? rows.find((r) => r.id === self.referredBy) : undefined;
    if (inviter) grant(inviter);
    grant(self);
  };

  /** referral_sweep() */
  const sweep = () => {
    for (const row of rows) if (row.referredBy && !row.qualified) {
      const account = accountOf(row);
      if (account && qualifies({ account, email: row.email, snapshots: world.snapshots, launchAtMs: world.config.launchAtMs, nowMs: world.nowMs, minLevel: world.config.minLevel })) row.qualified = true;
    }
    for (const id of new Set(rows.map((r) => r.referredBy).filter((x): x is string => !!x))) {
      const inviter = rows.find((r) => r.id === id);
      if (inviter) grant(inviter);
    }
  };

  const store: WaitlistStore = {
    async join(req: JoinRequest) {
      const L = WAITLIST_LIMITS;
      if (!hit('global', L.global) || !hit('ip:' + (req.ipHash ?? 'none'), L.perIp) || !hit('subnet:' + (req.subnetHash ?? 'none'), L.perSubnet) || !hit('email:' + req.emailKey, L.perEmail)) {
        return { status: 'rate_limited' as const };
      }
      const email = req.email.toLowerCase();
      const canon = emailCanonical(email);
      const inviter = req.refCode ? rows.find((r) => r.refCode === req.refCode) : undefined;
      const windowMs = world.config.windowHours * 3_600_000;
      const decision = decideReferral({
        inviter: inviter ? { id: inviter.id, canon: inviter.canon, ipHash: inviter.ipHash, createdAtMs: inviter.createdAtMs } : null,
        hasRef: req.refCode !== null,
        newCanon: canon,
        ipHash: req.ipHash,
        nowMs: world.nowMs,
        windowHours: world.config.windowHours,
        otherReferralFromSameIpInWindow: !!inviter && rows.some((r) => r.referredBy === inviter.id && r.ipHash === req.ipHash && r.createdAtMs > world.nowMs - windowMs),
      });
      const existing = rows.find((r) => r.email === email);
      if (existing) return { status: 'exists' as const, code: existing.refCode };
      if (world.collisions > 0 || rows.some((r) => r.refCode === req.newCode)) {
        world.collisions = Math.max(0, world.collisions - 1);
        return { status: 'code_taken' as const };
      }
      rows.push({
        id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
        email, canon, locale: req.locale, source: req.source, ipHash: req.ipHash, subnetHash: req.subnetHash, unsubscribedAt: null,
        refCode: req.newCode, viewKeyHash: req.viewKeyHash, referredBy: decision.referredBy, ignored: decision.ignored, qualified: false, createdAtMs: world.nowMs,
      });
      return { status: 'joined' as const, code: req.newCode };
    },
    async unsubscribe(id: string, ipKey: string | null) {
      if (!hit('unsub:' + (ipKey ?? 'none'), 30)) return { status: 'rate_limited' as const };
      const row = rows.find((r) => r.id === id);
      if (row && row.unsubscribedAt === null) row.unsubscribedAt = 1;
      return { status: 'ok' as const };
    },
    async referralStats(code: string, viewKeyHash: string, ipKey: string | null) {
      if (!hit('refstats:' + (ipKey ?? 'none'), 120)) return { status: 'rate_limited' as const };
      const row = rows.find((r) => r.refCode === code && r.viewKeyHash === viewKeyHash);
      const c = row ? countsOf(row) : { qualified: 0, paying: 0 };
      return { status: 'ok' as const, stats: { qualified: c.qualified, paying: c.paying, passGoal: 10 } };
    },
  };
  return { store, rows, world, processUser, sweep, countsOf };
}
