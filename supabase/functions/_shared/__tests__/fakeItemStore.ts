import { handleBindItem, handleMintItem } from '../items/handler.ts';
import type { CommitOutcome, DayCap, ItemStore, NewCertificate, StoredRequest, TokenOutcome, TokenTake } from '../items/store.ts';
import type { BindAction, BindResult, CertStatus, CertificateView, StoredTemplate } from '../items/types.ts';

// An in-memory ItemStore that behaves like migration 0010: every method is one atomic step (JS is single threaded between awaits, and each body below has no await in the middle of its
// read-modify-write), the buckets refill with the CLOCK it is given, and commit / transition keep the same rules as the SQL (cap, burn, bind irreversible, finished stays finished).
export const DAY = 86_400_000;

export interface FakeCert extends CertificateView {
  userId: string;
  requestId: string;
  requestIndex: number;
  createdMs: number;
}

export class FakeItemStore implements ItemStore {
  nowMs = Date.UTC(2026, 10, 1);
  accountCreatedMs: number | null = Date.UTC(2026, 8, 1);
  resetMs: number | null = null;
  pass = false;
  /** The hero level of the newest ACCEPTED progress snapshot per user (absent = no snapshot yet); a test sets it. */
  acceptedLevels = new Map<string, number>();
  buckets = new Map<string, { tokens: number; updatedMs: number }>();
  requests = new Map<string, StoredTemplate>();
  certs: FakeCert[] = [];
  flags: { userId: string; code: string; detail: Record<string, unknown> }[] = [];
  events: { certificateId: string; event: string }[] = [];
  private seq = 0;

  async accountStartMs(): Promise<number | null> {
    if (this.accountCreatedMs === null) return null;
    return Math.max(this.accountCreatedMs, this.resetMs ?? 0);
  }

  async hasActivePass(): Promise<boolean> {
    return this.pass;
  }

  async findRequest(userId: string, requestId: string): Promise<StoredRequest | null> {
    const template = this.requests.get(`${userId}:${requestId}`);
    if (!template) return null;
    const certificates = this.certs.filter((c) => c.userId === userId && c.requestId === requestId).sort((a, b) => a.requestIndex - b.requestIndex);
    return { template, certificates: certificates.map((c) => this.view(c)) };
  }

  async issuedLastDay(userId: string, kind: string, tier: number | null): Promise<number> {
    return this.certs.filter((c) => c.userId === userId && c.kind === kind && (tier === null || c.tier === tier) && c.createdMs >= this.nowMs - DAY).length;
  }

  async takeTokens(userId: string, startMs: number, takes: TokenTake[]): Promise<TokenOutcome> {
    const plan: { key: string; left: number }[] = [];
    const granted: number[] = [];
    for (const t of takes) {
      const key = `${userId}:${t.bucket}`;
      const b = this.buckets.get(key);
      let tokens: number;
      if (!b || b.updatedMs < startMs) tokens = Math.min(t.capacity, t.ratePerHour * Math.max(0, (this.nowMs - startMs) / 3_600_000));
      else tokens = Math.min(t.capacity, b.tokens + t.ratePerHour * Math.max(0, (this.nowMs - b.updatedMs) / 3_600_000));
      let g: number;
      if (t.partial) g = t.whole ? Math.floor(Math.min(t.cost, tokens)) : Math.min(t.cost, tokens);
      else if (tokens >= t.cost) g = t.cost;
      else return { ok: false, failed: t.bucket };
      plan.push({ key, left: tokens - g });
      granted.push(g);
    }
    for (const p of plan) this.buckets.set(p.key, { tokens: p.left, updatedMs: this.nowMs });
    return { ok: true, granted };
  }

  async commit(args: { userId: string; requestId: string; kind: string; template: StoredTemplate; certificates: NewCertificate[]; burnIds: string[]; caps: DayCap[] }): Promise<CommitOutcome> {
    if (this.requests.has(`${args.userId}:${args.requestId}`)) return { status: 'replay' };
    for (const cap of args.caps) {
      const existing = this.certs.filter((c) => c.userId === args.userId && c.kind === cap.kind && (cap.tier === null || c.tier === cap.tier) && c.createdMs >= this.nowMs - DAY).length;
      const added = args.certificates.filter((c) => c.kind === cap.kind && (cap.tier === null || c.tier === cap.tier)).length;
      if (added > 0 && existing + added > cap.max) return { status: 'cap' };
    }
    if (args.burnIds.length > 0) {
      const held = this.certs.filter((c) => args.burnIds.includes(c.id) && c.userId === args.userId && c.status === 'held');
      if (held.length !== args.burnIds.length) return { status: 'burn_failed' };
      for (const c of held) {
        c.status = 'burned';
        this.events.push({ certificateId: c.id, event: 'burn' });
      }
    }
    this.requests.set(`${args.userId}:${args.requestId}`, args.template);
    const created = args.certificates.map((c, i) => {
      const id = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
      const createdAt = new Date(this.nowMs).toISOString();
      this.certs.push({
        id,
        kind: c.kind,
        templateId: c.templateId,
        rarity: c.rarity,
        tier: c.tier,
        substats: c.substats,
        upgrade: 0,
        goldAmount: c.goldAmount,
        source: c.source,
        status: 'held',
        bound: false,
        createdAt,
        contentHash: c.contentHash,
        userId: args.userId,
        requestId: args.requestId,
        requestIndex: i,
        createdMs: this.nowMs,
      });
      this.events.push({ certificateId: id, event: 'mint' });
      return { id, createdAt };
    });
    return { status: 'created', certificates: created };
  }

  async certificateTemplates(userId: string, ids: string[]) {
    return this.certs.filter((c) => c.userId === userId && ids.includes(c.id)).map((c) => ({ id: c.id, kind: c.kind, templateId: c.templateId, bound: c.bound }));
  }

  async acceptedHeroLevel(userId: string): Promise<number | null> {
    return this.acceptedLevels.get(userId) ?? null;
  }

  async transition(args: { userId: string; ids: string[]; action: BindAction; reason: string }): Promise<BindResult> {
    const rows = args.ids.map((id) => this.certs.find((c) => c.id === id && c.userId === args.userId));
    if (rows.some((r) => !r)) return { ok: false, reason: 'not_found' };
    const mine = rows as FakeCert[];
    if (mine.some((c) => c.status === 'listed')) return { ok: false, reason: 'listed' };
    const accepts: Record<BindAction, CertStatus[]> = { bind: ['held'], void: ['held', 'revoked'], burn: ['held', 'burned'] };
    if (mine.some((c) => !accepts[args.action].includes(c.status))) return { ok: false, reason: 'not_held' };
    for (const c of mine) {
      if (args.action === 'bind' && c.status === 'held' && !c.bound) {
        c.bound = true;
        this.events.push({ certificateId: c.id, event: 'bind' });
      } else if (args.action === 'void' && c.status === 'held') {
        c.status = 'revoked';
        this.events.push({ certificateId: c.id, event: 'revoke' });
      } else if (args.action === 'burn' && c.status === 'held') {
        c.status = 'burned';
        this.events.push({ certificateId: c.id, event: 'burn' });
      }
    }
    return { ok: true, certificates: mine.map((c) => ({ id: c.id, status: c.status, bound: c.bound })) };
  }

  async flag(userId: string, code: string, detail: Record<string, unknown>): Promise<void> {
    this.flags.push({ userId, code, detail });
  }

  private view(c: FakeCert): CertificateView {
    const { userId: _u, requestId: _r, requestIndex: _i, createdMs: _c, ...rest } = c;
    void _u;
    void _r;
    void _i;
    void _c;
    return rest;
  }
}

export const USER_A = '11111111-1111-4111-8111-111111111111';
export const USER_B = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'a'.repeat(40);

/** A fetch that answers the Auth server: the bearer token "<user id>.<padding>" belongs to that user (anything else is unauthenticated). */
export const authFetch = (async (_url: unknown, init?: RequestInit) => {
  const header = String((init?.headers as Record<string, string> | undefined)?.authorization ?? '');
  const m = /^Bearer ([0-9a-f-]{36})\./.exec(header);
  if (!m) return new Response('{}', { status: 401 });
  return new Response(JSON.stringify({ id: m[1] }), { status: 200 });
}) as typeof fetch;

export const bearer = (userId: string): string => `Bearer ${userId}.${TOKEN}`;

export function makeServer(opts: { rng?: () => number; store?: FakeItemStore } = {}) {
  const store = opts.store ?? new FakeItemStore();
  let calls = 0;
  const rng = opts.rng ?? Math.random;
  const counted = () => {
    calls++;
    return rng();
  };
  const deps = { auth: { supabaseUrl: 'https://example.invalid', anonKey: 'anon-key-for-tests', fetchFn: authFetch }, allowedOrigins: ['https://play.example'], store, nowMs: () => store.nowMs, rng: counted };
  const request = (body: unknown, userId: string | null = USER_A, extra: Record<string, string> = {}) =>
    new Request('https://example.invalid/fn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://play.example', ...(userId ? { authorization: bearer(userId) } : {}), ...extra },
      body: JSON.stringify(body),
    });
  return {
    store,
    rngCalls: () => calls,
    mint: async (body: unknown, userId: string | null = USER_A) => {
      const res = await handleMintItem(request(body, userId), deps);
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    bind: async (body: unknown, userId: string | null = USER_A) => {
      const res = await handleBindItem(request(body, userId), deps);
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
  };
}
