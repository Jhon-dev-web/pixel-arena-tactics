// The storage the waitlist handlers need. The real one is a thin client of the service-role-only SQL functions of migration 0016 (restStore.ts); tests use an in-memory fake.

export type JoinStatus = 'joined' | 'exists' | 'rate_limited';

export interface JoinRequest {
  email: string;
  locale: 'pt' | 'en';
  source: string | null;
  ipHash: string | null;
  subnetHash: string | null;
  emailKey: string;
}

export interface WaitlistStore {
  join(req: JoinRequest): Promise<{ status: JoinStatus }>;
  unsubscribe(waitlistId: string, ipKey: string | null): Promise<{ status: 'ok' | 'rate_limited' }>;
}
