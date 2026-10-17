import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { handleCreateCheckout } from '../checkout.ts';
import { NO_FLAGS, PAUSED_HEADER, createFlagReader, isPaused, parseOpsStatus, pausedResponse, type OpsFlagReader, type OpsFlags } from '../ops/flags.ts';
import { handlePassCrypto } from '../market/passCrypto.ts';
import { canonicalJson, handleSubmitProgress, type NewSnapshot, type ProgressStore, type StoredSnapshot } from '../progress/handler.ts';
import { authFetch, bearer } from './fakeItemStore.ts';
import { USER_A, makeMarket } from './marketHarness.ts';

const root = resolve(__dirname, '../../../..');
const flags = (over: Partial<OpsFlags> = {}): OpsFlagReader => async () => ({ ...NO_FLAGS, ...over });

describe('the flag reader', () => {
  it('reads only exact booleans and fails open on anything odd', () => {
    expect(parseOpsStatus({ market_paused: true, pass_sales_paused: 'true', season_scoring_paused: 1, maintenance_mode: false })).toEqual({ ...NO_FLAGS, market_paused: true });
    expect(parseOpsStatus(null)).toEqual(NO_FLAGS);
    expect(parseOpsStatus([true])).toEqual(NO_FLAGS);
  });

  it('isPaused: no reader, a throwing reader and a missing key all mean "not paused"', async () => {
    expect(await isPaused(undefined, 'market_paused')).toBe(false);
    expect(await isPaused(async () => Promise.reject(new Error('db down')), 'market_paused')).toBe(false);
    expect(await isPaused(flags({ market_paused: true }), 'market_paused')).toBe(true);
    expect(await isPaused(flags({ market_paused: true }), 'pass_sales_paused')).toBe(false);
  });

  it('caches for 10 s, keeps the last good answer for 5 min when a read fails, then fails open', async () => {
    let t = 0;
    let down = false;
    let calls = 0;
    const fetchFn = (async (url: unknown, init?: RequestInit) => {
      calls++;
      expect(String(url)).toBe('https://p.test/rest/v1/rpc/ops_status');
      expect((init?.headers as Record<string, string>).apikey).toBe('k');
      if (down) return new Response('boom', { status: 500 });
      return new Response(JSON.stringify({ ...NO_FLAGS, market_paused: true }), { status: 200 });
    }) as typeof fetch;
    const read = createFlagReader({ supabaseUrl: 'https://p.test/', apiKey: 'k', fetchFn, nowMs: () => t });
    expect((await read()).market_paused).toBe(true);
    t = 5_000;
    await read();
    expect(calls).toBe(1); // within the ttl
    down = true;
    t = 20_000;
    expect((await read()).market_paused).toBe(true); // read failed: the last good answer holds (a blip does not un-pause a deliberate pause)
    t = 20_000 + 6 * 60_000;
    expect((await read()).market_paused).toBe(false); // long outage: fail open
  });

  it('without a url or key it never calls the network', async () => {
    const fetchFn = vi.fn();
    const read = createFlagReader({ supabaseUrl: '', apiKey: '', fetchFn: fetchFn as unknown as typeof fetch });
    expect(await read()).toEqual(NO_FLAGS);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('the paused answer', () => {
  it('is a 503 with Retry-After, the body the game reads and the marker header; CORS headers are kept', async () => {
    const res = pausedResponse('market_paused', { 'access-control-allow-origin': 'https://play.example' });
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('300');
    expect(res.headers.get(PAUSED_HEADER)).toBe('market_paused');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://play.example');
    expect(await res.json()).toEqual({ ok: false, error: 'paused', reason: 'market_paused' });
  });
});

describe('market_paused', () => {
  it('refuses to list, to list a lot, to reserve, to prepare and to submit a payment, with 503 + Retry-After + the marker the 5xx monitor ignores; cancel, status, overview and the wallet stay open', async () => {
    const h = makeMarket();
    h.deps.opsFlags = flags({ market_paused: true });
    for (const body of [
      { action: 'list', certificateId: '10000000-0000-4000-8000-000000000001', priceLamports: 1_000_000_000 },
      { action: 'list_material', requestId: 'req-12345678', materialId: 'iron_ore', quantity: 5, unitPriceMicro: 400_000 },
    ]) {
      const r = await h.list(body);
      expect(r.status).toBe(503);
      expect(r.body).toEqual({ ok: false, error: 'paused', reason: 'market_paused' });
    }
    for (const body of [
      { action: 'reserve', listingId: '20000000-0000-4000-8000-000000000001' },
      { action: 'prepare', reservationId: '30000000-0000-4000-8000-000000000001' },
      { action: 'submit', reservationId: '30000000-0000-4000-8000-000000000001', signature: '1'.repeat(88) },
    ]) {
      const r = await h.buy(body);
      expect(r.status).toBe(503);
      expect(r.body).toMatchObject({ error: 'paused', reason: 'market_paused' });
    }
    // still open: a player can release a reservation, see where things stand, see his own overview and link his wallet
    expect((await h.buy({ action: 'cancel', reservationId: '30000000-0000-4000-8000-000000000001' })).body.error).not.toBe('paused');
    expect((await h.buy({ action: 'status', reservationId: '30000000-0000-4000-8000-000000000001' })).body.error).not.toBe('paused');
    expect((await h.list({ action: 'cancel', listingId: '20000000-0000-4000-8000-000000000001' })).body.error).not.toBe('paused');
    expect((await h.my({ action: 'overview' })).status).toBe(200);
    expect((await h.wallet({ action: 'status' })).status).toBe(200);
  });

  it('does nothing when the flag is off, when no reader is wired, and when the reader fails', async () => {
    for (const reader of [flags(), undefined, async () => Promise.reject(new Error('down'))] as (OpsFlagReader | undefined)[]) {
      const h = makeMarket();
      h.deps.opsFlags = reader;
      const r = await h.list({ action: 'list', certificateId: '10000000-0000-4000-8000-000000000001', priceLamports: 1_000_000_000 });
      expect(r.body.error).not.toBe('paused');
      expect(r.body.reason).not.toBe('market_paused');
    }
  });

  it('a Pass-sales pause does not pause the market, and a market pause does not pause the Pass', async () => {
    const h = makeMarket();
    h.deps.opsFlags = flags({ pass_sales_paused: true });
    expect((await h.list({ action: 'list', certificateId: '10000000-0000-4000-8000-000000000001', priceLamports: 1_000_000_000 })).body.error).not.toBe('paused');
    const asPass = async (opsFlags: OpsFlagReader, body: unknown) => {
      const req = new Request('https://example.invalid/fn', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://play.example', authorization: bearer(USER_A) }, body: JSON.stringify(body) });
      const res = await handlePassCrypto(req, { auth: h.deps.auth, allowedOrigins: h.deps.allowedOrigins, store: h.store, nowMs: h.deps.nowMs, pass: () => h.passChain, opsFlags });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };
    expect((await asPass(flags({ market_paused: true }), { action: 'price' })).status).toBe(200);
    expect((await asPass(flags({ market_paused: true }), { action: 'start' })).body.error).not.toBe('paused');
    for (const action of ['start', 'prepare', 'submit']) {
      const r = await asPass(flags({ pass_sales_paused: true }), { action, signature: '1'.repeat(88) });
      expect(r.status).toBe(503);
      expect(r.body).toEqual({ ok: false, error: 'paused', reason: 'pass_sales_paused' });
    }
    expect((await asPass(flags({ pass_sales_paused: true }), { action: 'price' })).status).toBe(200); // the price is a read
  });
});

describe('pass_sales_paused on the card checkout', () => {
  const untouched = () => new Proxy({}, { get: (_t, prop) => () => Promise.reject(new Error(`store.${String(prop)} must not be called while paused`)) });
  const setup = (opsFlags?: OpsFlagReader) => {
    const createCheckout = vi.fn();
    return {
      createCheckout,
      deps: {
        auth: { supabaseUrl: 'https://p.test', anonKey: 'anon', fetchFn: authFetch as unknown as typeof fetch },
        allowedOrigins: ['https://play.example'],
        provider: { name: 'stripe' as const, createCheckout, refundPayment: vi.fn(), parseWebhook: vi.fn() },
        store: untouched() as never,
        nowMs: () => 1_000,
        opsFlags,
      },
    };
  };
  const req = () => new Request('https://fn.test/create-checkout', { method: 'POST', headers: { origin: 'https://play.example', authorization: bearer(USER_A) } });

  it('answers 503 before the database or Stripe is touched', async () => {
    const { deps, createCheckout } = setup(flags({ pass_sales_paused: true }));
    const res = await handleCreateCheckout(req(), deps);
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('300');
    expect(res.headers.get(PAUSED_HEADER)).toBe('pass_sales_paused');
    expect(await res.json()).toEqual({ ok: false, error: 'paused', reason: 'pass_sales_paused' });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it('a market pause alone leaves the checkout open (it gets as far as the store)', async () => {
    const { deps } = setup(flags({ market_paused: true, season_scoring_paused: true, maintenance_mode: true }));
    const res = await handleCreateCheckout(req(), deps);
    expect(res.status).toBe(502); // reached the (deliberately failing) store: not refused as paused
  });

  it('the Stripe webhook is never paused: money already taken must still be recorded', () => {
    const idx = readFileSync(resolve(root, 'supabase/functions/stripe-webhook/index.ts'), 'utf8');
    expect(idx).not.toContain('opsFlags');
    expect(readFileSync(resolve(root, 'supabase/functions/_shared/webhook.ts'), 'utf8')).not.toMatch(/ops\/flags|isPaused/);
  });
});

describe('season_scoring_paused on submit-progress', () => {
  const USER = '11111111-1111-4111-8111-111111111111';
  const save = { xp: 5000, highestDungeonFloor: 3, stats: { deepestDepth: 0, kills: 10, goldEarned: 100, secondsPlayed: 600, bossesKilled: 0, dungeonRuns: 1, dungeonFloors: 3, uniquesFound: 0 }, skillXp: { mining: 0, woodcutting: 0, gardening: 0 }, quests: { claimed: [] }, schemaVersion: 2, appVersion: '0.1.0' };

  class Store implements ProgressStore {
    rows: NewSnapshot[] = [];
    seasonCalls = 0;
    professionCalls = 0;
    async hasActivePass() {
      return true;
    }
    async character() {
      return { revision: 1, saveData: save };
    }
    async accountCreatedAtMs() {
      return 0;
    }
    async claimSlot() {
      return true;
    }
    async lastSnapshot(): Promise<StoredSnapshot | null> {
      return null;
    }
    async acceptedHistory() {
      return { first: null, last: null };
    }
    async insertSnapshot(row: NewSnapshot) {
      this.rows.push(row);
      return { id: `snap-${this.rows.length}` };
    }
    async applyToSeason() {
      this.seasonCalls++;
      return 'updated' as const;
    }
    async applyProfessionsToSeason() {
      this.professionCalls++;
      return 'updated' as const;
    }
  }
  const run = async (store: Store, opsFlags?: OpsFlagReader) => {
    const body = canonicalJson(save);
    const res = await handleSubmitProgress(new Request('https://x.test/submit-progress', { method: 'POST', headers: { origin: 'https://game.example.test', authorization: bearer(USER), 'content-type': 'application/json' }, body }), {
      auth: { supabaseUrl: 'https://p.test', anonKey: 'anon', fetchFn: (async () => new Response(JSON.stringify({ id: USER }), { status: 200 })) as typeof fetch },
      allowedOrigins: ['https://game.example.test'],
      store,
      nowMs: () => 1_000_000,
      opsFlags,
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it('still judges and stores the snapshot (the audit trail goes on) but never touches the League', async () => {
    const store = new Store();
    const r = await run(store, flags({ season_scoring_paused: true }));
    expect(r.status).toBe(200);
    expect(r.body.season).toBe('paused');
    expect(r.body.professions).toBeNull();
    expect(store.rows).toHaveLength(1);
    expect(store.seasonCalls).toBe(0);
    expect(store.professionCalls).toBe(0);
  });

  it('scores normally when the flag is off, when no reader is wired, when another flag is on, and when the reader fails', async () => {
    for (const reader of [flags(), undefined, flags({ market_paused: true, maintenance_mode: true }), async () => Promise.reject(new Error('down'))] as (OpsFlagReader | undefined)[]) {
      const store = new Store();
      const r = await run(store, reader);
      expect(r.body.season).toBe('updated');
      expect(store.seasonCalls).toBe(1);
    }
  });
});

describe('the Edge Function wiring', () => {
  const read = (fn: string) => readFileSync(resolve(root, `supabase/functions/${fn}/index.ts`), 'utf8');

  it('every flag-aware function passes the reader, and every watched function is wrapped by the 5xx monitor', () => {
    for (const fn of ['submit-progress', 'market-list', 'market-buy', 'pass-crypto', 'create-checkout']) expect(read(fn), fn).toContain('opsFlags: ops.flags');
    for (const fn of ['submit-progress', 'market-list', 'market-buy', 'market-my', 'market-wallet', 'pass-crypto', 'create-checkout', 'stripe-webhook']) {
      expect(read(fn), fn).toContain(`withOpsMonitor('${fn}'`);
      expect(read(fn), fn).toContain('ops.report');
    }
  });
});
