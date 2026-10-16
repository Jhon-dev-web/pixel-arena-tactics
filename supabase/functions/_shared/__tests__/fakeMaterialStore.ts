import { handleMaterialClaim, handleMaterialSync } from '../materials/handler.ts';
import type { MaterialStore, StoredMaterialRequest } from '../materials/store.ts';
import type { MaterialBalance, MaterialBalances } from '../materials/types.ts';
import { authFetch, bearer, FakeItemStore, USER_A, USER_B } from './fakeItemStore.ts';

// An in-memory MaterialStore that behaves like migration 0015: every method is one atomic step (JS is single threaded between awaits, and each body has no await in the middle of its
// read-modify-write), the buckets are FakeItemStore's (the same arithmetic as item_take_tokens, with `whole`), a request id is answered once, a burn never goes below zero and pending never
// exceeds qty.
export interface LedgerRow {
  userId: string;
  materialId: string;
  delta: number;
  pendingDelta: number;
  qtyAfter: number;
  reason: string;
  ref: string;
}

export class FakeMaterialStore implements MaterialStore {
  /** the buckets, the account age and the flags are the item server's own (the same arithmetic as item_take_tokens) */
  items = new FakeItemStore();
  balancesByUser = new Map<string, Map<string, MaterialBalance>>();
  matRequests = new Map<string, StoredMaterialRequest>();
  ledger: LedgerRow[] = [];

  get nowMs(): number {
    return this.items.nowMs;
  }
  set nowMs(v: number) {
    this.items.nowMs = v;
  }
  get flags() {
    return this.items.flags;
  }
  accountStartMs = () => this.items.accountStartMs();
  takeTokens: MaterialStore['takeTokens'] = (userId, startMs, takes) => this.items.takeTokens(userId, startMs, takes);
  flag: MaterialStore['flag'] = (userId, code, detail) => this.items.flag(userId, code, detail);

  protected row(userId: string, id: string): MaterialBalance {
    let m = this.balancesByUser.get(userId);
    if (!m) this.balancesByUser.set(userId, (m = new Map()));
    let b = m.get(id);
    if (!b) m.set(id, (b = { qty: 0, pending: 0, seq: 0 }));
    return b;
  }

  qty(userId: string, id: string): number {
    return this.balancesByUser.get(userId)?.get(id)?.qty ?? 0;
  }

  requestsFor(userId: string): number {
    return [...this.matRequests.keys()].filter((k) => k.startsWith(`${userId}:`)).length;
  }

  async findRequest(userId: string, requestId: string): Promise<StoredMaterialRequest | null> {
    return this.matRequests.get(`${userId}:${requestId}`) ?? null;
  }

  async credit(args: { userId: string; requestId: string; credits: Record<string, number> }): Promise<{ status: 'created' | 'replay' }> {
    const key = `${args.userId}:${args.requestId}`;
    if (this.matRequests.has(key)) return { status: 'replay' };
    for (const [id, n] of Object.entries(args.credits)) {
      if (!(n > 0)) continue;
      const b = this.row(args.userId, id);
      b.qty += n;
      this.ledger.push({ userId: args.userId, materialId: id, delta: n, pendingDelta: 0, qtyAfter: b.qty, reason: 'claim', ref: args.requestId });
    }
    this.matRequests.set(key, { kind: 'claim', tradeable: { ...args.credits } });
    return { status: 'created' };
  }

  async burn(args: { userId: string; requestId: string; units: Record<string, number> }): Promise<{ applied: Record<string, number>; replay: boolean }> {
    const key = `${args.userId}:${args.requestId}`;
    const old = this.matRequests.get(key);
    if (old) return { applied: old.kind === 'claim' ? {} : old.applied, replay: true };
    const applied: Record<string, number> = {};
    for (const [id, ask] of Object.entries(args.units)) {
      const b = this.balancesByUser.get(args.userId)?.get(id);
      const take = b ? Math.min(ask, b.qty) : 0;
      if (b && take > 0) {
        b.qty -= take;
        b.pending = Math.min(b.pending, b.qty);
        this.ledger.push({ userId: args.userId, materialId: id, delta: -take, pendingDelta: 0, qtyAfter: b.qty, reason: 'burn', ref: args.requestId });
      }
      applied[id] = take;
    }
    this.matRequests.set(key, { kind: 'burn', applied });
    return { applied, replay: false };
  }

  async ack(args: { userId: string; requestId: string; units: Record<string, number> }): Promise<{ applied: Record<string, number>; replay: boolean }> {
    const key = `${args.userId}:${args.requestId}`;
    const old = this.matRequests.get(key);
    if (old) return { applied: old.kind === 'claim' ? {} : old.applied, replay: true };
    const applied: Record<string, number> = {};
    for (const [id, ask] of Object.entries(args.units)) {
      const b = this.balancesByUser.get(args.userId)?.get(id);
      const take = b ? Math.min(ask, b.pending) : 0;
      if (b && take > 0) {
        b.pending -= take;
        this.ledger.push({ userId: args.userId, materialId: id, delta: 0, pendingDelta: -take, qtyAfter: b.qty, reason: 'deliver', ref: args.requestId });
      }
      applied[id] = take;
    }
    this.matRequests.set(key, { kind: 'ack', applied });
    return { applied, replay: false };
  }

  async balances(userId: string): Promise<MaterialBalances> {
    const out: MaterialBalances = {};
    for (const [id, b] of this.balancesByUser.get(userId) ?? []) out[id] = { ...b };
    return out;
  }

  /** What the market does to a balance on a delivery (migration 0015 part B): units arrive pending, seq counts the delivery. */
  deliver(userId: string, id: string, n: number): void {
    const b = this.row(userId, id);
    b.qty += n;
    b.pending += n;
    b.seq += 1;
  }
}

export function makeMaterialServer(opts: { rng?: () => number; store?: FakeMaterialStore } = {}) {
  const store = opts.store ?? new FakeMaterialStore();
  let calls = 0;
  const rng = opts.rng ?? Math.random;
  const counted = () => {
    calls++;
    return rng();
  };
  const deps = { auth: { supabaseUrl: 'https://example.invalid', anonKey: 'anon-key-for-tests', fetchFn: authFetch }, allowedOrigins: ['https://play.example'], store, nowMs: () => store.nowMs, rng: counted };
  const request = (body: unknown, userId: string | null = USER_A) =>
    new Request('https://example.invalid/fn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://play.example', ...(userId ? { authorization: bearer(userId) } : {}) },
      body: JSON.stringify(body),
    });
  return {
    store,
    rngCalls: () => calls,
    claim: async (body: unknown, userId: string | null = USER_A) => {
      const res = await handleMaterialClaim(request(body, userId), deps);
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    sync: async (body: unknown, userId: string | null = USER_A) => {
      const res = await handleMaterialSync(request(body, userId), deps);
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
  };
}

export { USER_A, USER_B };
