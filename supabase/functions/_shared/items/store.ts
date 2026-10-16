import type { RarityId } from './tables.ts';
import type { BindAction, BindResult, CertKind, CertSource, CertificateView, StoredTemplate, SubstatRoll } from './types.ts';

/** One bucket take of public.item_take_tokens (migration 0010). */
export interface TokenTake {
  bucket: string;
  cost: number;
  ratePerHour: number;
  capacity: number;
  /** true: grant min(cost, what the bucket holds) instead of refusing (the hunt time). */
  partial?: boolean;
  /** true (with partial): grant WHOLE units only, floor(min(cost, what the bucket holds)), and take only those (the daily cap on tradeable materials, migration 0015). */
  whole?: boolean;
}

export type TokenOutcome = { ok: true; granted: number[] } | { ok: false; failed: string };

/** A certificate about to be issued (its id and clock come from the database). */
export interface NewCertificate {
  kind: CertKind;
  templateId: string;
  rarity: RarityId | null;
  tier: number | null;
  substats: SubstatRoll[];
  goldAmount: number | null;
  source: CertSource;
  contentHash: string;
}

/** A daily cap checked INSIDE the commit, under the user lock (kind, and tier when set): counts the certificates issued to the account in the last 24 hours plus the new ones. */
export interface DayCap {
  kind: CertKind;
  tier: number | null;
  max: number;
}

export type CommitOutcome =
  | { status: 'created'; certificates: { id: string; createdAt: string }[] }
  | { status: 'replay' | 'cap' | 'burn_failed' };

export interface StoredRequest {
  template: StoredTemplate;
  certificates: CertificateView[];
}

/** Persistence used by the handlers. The real one (itemDb.ts) talks to PostgREST with the service role; tests use an in-memory fake with the same atomic behavior. */
export interface ItemStore {
  /** max(account created, league reset), in ms: where every "since the account started" limit begins. null when the account age is unknown (the call is then refused, never guessed). */
  accountStartMs(userId: string): Promise<number | null>;
  /** The Adventurer Pass is a server entitlement (only the payment webhook writes it). */
  hasActivePass(userId: string): Promise<boolean>;
  /** The stored answer of a request id the user already made (or null). */
  findRequest(userId: string, requestId: string): Promise<StoredRequest | null>;
  /** How many certificates of this kind (and tier, when set) the account was issued in the last 24 hours (a read-only look before the roll; the commit re-checks it under the lock). */
  issuedLastDay(userId: string, kind: CertKind, tier: number | null): Promise<number>;
  /** The atomic limit (a single locked statement in the database): all non-partial takes fit or nothing is taken. */
  takeTokens(userId: string, startMs: number, takes: TokenTake[]): Promise<TokenOutcome>;
  /** Issues the certificates of one request atomically; see public.item_commit. */
  commit(args: { userId: string; requestId: string; kind: CertSource; template: StoredTemplate; certificates: NewCertificate[]; burnIds: string[]; caps: DayCap[] }): Promise<CommitOutcome>;
  /** bind / void / burn certificates the user owns, atomically; see public.item_certificate_transition. */
  transition(args: { userId: string; ids: string[]; action: BindAction; reason: string }): Promise<BindResult>;
  /** Records a flag for the owner's audit. Never throws to the caller of a refusal (best effort). */
  flag(userId: string, code: string, detail: Record<string, unknown>): Promise<void>;
}
