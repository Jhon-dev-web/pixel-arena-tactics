// The storage the waitlist handlers need. The real one is a thin client of the service-role-only SQL functions of migration 0016 (restStore.ts); tests use an in-memory fake.

export type JoinStatus = 'joined' | 'exists' | 'rate_limited' | 'code_taken';

export interface JoinRequest {
  email: string;
  locale: 'pt' | 'en';
  source: string | null;
  ipHash: string | null;
  subnetHash: string | null;
  emailKey: string;
  /** The code from ?ref= (well-formed) or null. */
  refCode: string | null;
  /** The random public code for a NEW row, and the hash of the random private view key. */
  newCode: string;
  viewKeyHash: string;
}

export interface JoinResult {
  status: JoinStatus;
  /** The public share code of the row: the new one on 'joined', the existing person's on 'exists'. */
  code?: string;
}

export interface ReferralStats {
  qualified: number;
  paying: number;
  passGoal: number | null;
}

export interface WaitlistStore {
  join(req: JoinRequest): Promise<JoinResult>;
  unsubscribe(waitlistId: string, ipKey: string | null): Promise<{ status: 'ok' | 'rate_limited' }>;
  /** Zeros for an unknown code or a wrong key (the answer never tells which). */
  referralStats(code: string, viewKeyHash: string, ipKey: string | null): Promise<{ status: 'ok'; stats: ReferralStats } | { status: 'rate_limited' }>;
}
