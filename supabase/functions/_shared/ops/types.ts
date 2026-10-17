// Shared vocabulary of the AI operations layer. Pure TypeScript.

export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const severityRank = (s: Severity): number => SEVERITIES.indexOf(s);
export const maxSeverity = (list: Severity[]): Severity => list.reduce<Severity>((m, s) => (severityRank(s) > severityRank(m) ? s : m), 'info');
export const isSeverity = (v: unknown): v is Severity => typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);
/** An alert goes to the webhook only from this severity up. */
export const ALERT_MIN_SEVERITY: Severity = 'high';
export const shouldAlert = (s: Severity): boolean => severityRank(s) >= severityRank(ALERT_MIN_SEVERITY);

/** What a finding is about. Fixed list: the model cannot invent a category. */
export const CATEGORIES = ['anticheat', 'level_jump', 'legendary_spike', 'market_outlier', 'market_wash', 'market_concentration', 'referral_cluster', 'payments', 'errors'] as const;
export type Category = (typeof CATEGORIES)[number];

/** The only things the model may suggest. Every one of them is a recommendation for a human; none of them is executed by any code in this repo. */
export const ACTIONS = ['review_account', 'watch', 'pause_market', 'pause_scoring', 'none'] as const;
export type SuggestedAction = (typeof ACTIONS)[number];

export type EvidenceType = 'user' | 'sale' | 'listing' | 'waitlist' | 'ip_prefix' | 'subnet_prefix' | 'reason' | 'function' | 'code' | 'metric';

/** A pointer into the data the pre-checks looked at. The `id` is what a finding cites; the dashboard turns users / sales into links. */
export interface Evidence {
  type: EvidenceType;
  id: string;
  /** A short human label (a username, a template id). Player-supplied text: treated as data everywhere. */
  label?: string;
}

/** What the deterministic pre-checks found. Computed from the aggregates with plain arithmetic; the model never sees a thing that is not here or in the aggregates. */
export interface Signal {
  /** Stable id: category + the subject, e.g. "market_outlier:<sale id>". */
  id: string;
  category: Category;
  severity: Severity;
  /** Portuguese, machine-written from numbers (no player text inside). */
  summary: string;
  evidence: Evidence[];
}

// ---- the aggregates (public.ai_gather_aggregates), normalised --------------------------------------------------------------------------------------------------------------------------------------

export interface AggAccount {
  user_id: string;
  username: string | null;
  flagged: number;
  rejected: number;
  reasons: string[];
}
export interface AggJump {
  user_id: string;
  username: string | null;
  snapshots: number;
  level_from: number;
  level_to: number;
  xp_from: number;
  xp_to: number;
  minutes_between: number;
}
export interface AggOutlier {
  sale_id: string;
  thing: string;
  seller_id: string;
  seller_username: string | null;
  buyer_id: string;
  buyer_username: string | null;
  price_lamports: number;
  ratio_to_median: number;
  median_samples: number;
}
export interface AggPair {
  seller_id: string;
  seller_username: string | null;
  buyer_id: string;
  buyer_username: string | null;
  sales: number;
  volume_lamports: number;
  reciprocal: boolean;
}
export interface AggBuyer {
  buyer_id: string;
  buyer_username: string | null;
  purchases: number;
  distinct_sellers: number;
  volume_lamports: number;
}

export interface Aggregates {
  windowHours: number;
  anticheat: {
    flaggedSnapshots: number;
    rejectedSnapshots: number;
    accountsWithNewFlags: number;
    reasonCounts: { reason: string; count: number }[];
    accounts: AggAccount[];
    itemFlags: { code: string; count: number; accounts: number }[];
  };
  levelJumps: { accountsCompared: number; top: AggJump[] };
  legendary: { issuedInWindow: number; baselinePerHour: number; bySource: { source: string; count: number }[]; topAccounts: { user_id: string; username: string | null; count: number; sources: string[] }[] };
  market: { salesInWindow: number; volumeLamports: number; pairLookbackHours: number; outliers: AggOutlier[]; pairs: AggPair[]; heavyBuyers: AggBuyer[] };
  referrals: {
    lookbackHours: number;
    signups: number;
    ipClusters: { ip_prefix: string; signups: number }[];
    subnetClusters: { subnet_prefix: string; signups: number }[];
    inviters: { waitlist_id: string; invited: number }[];
    ignored: { reason: string; count: number }[];
  };
  payments: { refunded: number; revokedDisputes: number; newActive: number; eventErrors: number; eventsUnprocessed10min: number };
  errors: { byFunction: { function: string; errors: number }[] };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown, max = 80): string => (typeof v === 'string' ? v.slice(0, max) : '');
const nstr = (v: unknown, max = 40): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj).slice(0, 50) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 20) : []);

/** Reads the jsonb of ai_gather_aggregates defensively: every missing or odd field becomes an empty list or a zero, so the pre-checks never throw on a database that answered something unexpected. */
export function normalizeAggregates(raw: unknown): Aggregates {
  const r = isObj(raw) ? raw : {};
  const ac = isObj(r.anticheat) ? r.anticheat : {};
  const lj = isObj(r.level_jumps) ? r.level_jumps : {};
  const lg = isObj(r.legendary) ? r.legendary : {};
  const mk = isObj(r.market) ? r.market : {};
  const rf = isObj(r.referrals) ? r.referrals : {};
  const py = isObj(r.payments) ? r.payments : {};
  const er = isObj(r.errors) ? r.errors : {};
  return {
    windowHours: num(r.window_hours) || 1,
    anticheat: {
      flaggedSnapshots: num(ac.flagged_snapshots),
      rejectedSnapshots: num(ac.rejected_snapshots),
      accountsWithNewFlags: num(ac.accounts_with_new_flags),
      reasonCounts: arr(ac.reason_counts).map((x) => ({ reason: str(x.reason), count: num(x.count) })),
      accounts: arr(ac.accounts).map((x) => ({ user_id: str(x.user_id, 40), username: nstr(x.username), flagged: num(x.flagged), rejected: num(x.rejected), reasons: strs(x.reasons) })),
      itemFlags: arr(ac.item_flags).map((x) => ({ code: str(x.code), count: num(x.count), accounts: num(x.accounts) })),
    },
    levelJumps: {
      accountsCompared: num(lj.accounts_compared),
      top: arr(lj.top).map((x) => ({
        user_id: str(x.user_id, 40),
        username: nstr(x.username),
        snapshots: num(x.snapshots),
        level_from: num(x.level_from),
        level_to: num(x.level_to),
        xp_from: num(x.xp_from),
        xp_to: num(x.xp_to),
        minutes_between: num(x.minutes_between),
      })),
    },
    legendary: {
      issuedInWindow: num(lg.issued_in_window),
      baselinePerHour: num(lg.baseline_per_hour),
      bySource: arr(lg.by_source).map((x) => ({ source: str(x.source), count: num(x.count) })),
      topAccounts: arr(lg.top_accounts).map((x) => ({ user_id: str(x.user_id, 40), username: nstr(x.username), count: num(x.count), sources: strs(x.sources) })),
    },
    market: {
      salesInWindow: num(mk.sales_in_window),
      volumeLamports: num(mk.volume_lamports),
      pairLookbackHours: num(mk.pair_lookback_hours) || 24,
      outliers: arr(mk.outliers).map((x) => ({
        sale_id: str(x.sale_id, 40),
        thing: str(x.thing),
        seller_id: str(x.seller_id, 40),
        seller_username: nstr(x.seller_username),
        buyer_id: str(x.buyer_id, 40),
        buyer_username: nstr(x.buyer_username),
        price_lamports: num(x.price_lamports),
        ratio_to_median: num(x.ratio_to_median),
        median_samples: num(x.median_samples),
      })),
      pairs: arr(mk.pairs).map((x) => ({
        seller_id: str(x.seller_id, 40),
        seller_username: nstr(x.seller_username),
        buyer_id: str(x.buyer_id, 40),
        buyer_username: nstr(x.buyer_username),
        sales: num(x.sales),
        volume_lamports: num(x.volume_lamports),
        reciprocal: x.reciprocal === true,
      })),
      heavyBuyers: arr(mk.heavy_buyers).map((x) => ({ buyer_id: str(x.buyer_id, 40), buyer_username: nstr(x.buyer_username), purchases: num(x.purchases), distinct_sellers: num(x.distinct_sellers), volume_lamports: num(x.volume_lamports) })),
    },
    referrals: {
      lookbackHours: num(rf.lookback_hours) || 24,
      signups: num(rf.signups),
      ipClusters: arr(rf.ip_clusters).map((x) => ({ ip_prefix: str(x.ip_prefix, 16), signups: num(x.signups) })),
      subnetClusters: arr(rf.subnet_clusters).map((x) => ({ subnet_prefix: str(x.subnet_prefix, 16), signups: num(x.signups) })),
      inviters: arr(rf.inviters).map((x) => ({ waitlist_id: str(x.waitlist_id, 40), invited: num(x.invited) })),
      ignored: arr(rf.ignored).map((x) => ({ reason: str(x.reason), count: num(x.count) })),
    },
    payments: {
      refunded: num(py.refunded),
      revokedDisputes: num(py.revoked_disputes),
      newActive: num(py.new_active),
      eventErrors: num(py.event_errors),
      eventsUnprocessed10min: num(py.events_unprocessed_10min),
    },
    errors: { byFunction: arr(er.by_function).map((x) => ({ function: str(x.function, 40), errors: num(x.errors) })) },
  };
}
