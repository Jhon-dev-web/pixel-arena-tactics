import { describe, expect, it } from 'vitest';
import { MarketApi, PublicListing, createMarketApi } from '../market/api';
import { MarketLive, applyMarketChange, makeReadSequence, myListingFrom } from '../market/liveState';
import { submitPassWithPolling } from '../market/passPay';
import { CONFIRM_MAX_TRIES, confirmRetryDelayMs, elapsedSeconds, submitWithPolling } from '../market/payFlow';
import { SOLANA_VERIFY_COMMITMENT } from '../../../supabase/functions/_shared/chain/solana';
import type { MarketItemView, MarketOverview, MyListingView, ReservationView } from '../../../supabase/functions/_shared/market/types';

// OWNER RULE (2026-10-21): every click is a request to the server and its answer shows at once. These tests pin the pure parts: the reducers that put a server answer on the screen, the numbered
// reads, and the pace at which a payment signature is asked about again (the first question has no delay).

const ITEM: MarketItemView = { kind: 'gear', templateId: 'iron_sword', rarity: 'epic', tier: 3, substats: [], goldAmount: null };
const mine = (id: string, status: MyListingView['status'] = 'open'): MyListingView => ({ id, certificateId: `c-${id}`, priceLamports: 1_000_000, status, createdAt: '2026-10-21T12:00:00.000Z', expiresAt: '2026-10-28T12:00:00.000Z', item: ITEM });
const pub = (id: string, status: PublicListing['status'] = 'open'): PublicListing => ({ id, kind: 'gear', template_id: 'iron_sword', rarity: 'epic', tier: 3, substats: [], gold_amount: null, content_hash: 'h', price_lamports: 1_000_000, status, created_at: '', expires_at: '' });
const overview = (listings: MyListingView[] = [], reservation: ReservationView | null = null): MarketOverview => ({ wallet: { address: 'w', chainId: 502 }, chain: null, listings, reservation, sales: [], refundsDue: [], pending: [], solUsd: null });
const reservation = (over: Partial<ReservationView> = {}): ReservationView => ({
  id: 'r1',
  listingId: 'l1',
  status: 'pending',
  priceLamports: 1_000_000,
  feeLamports: 50_000,
  sellerLamports: 950_000,
  sellerAddress: 's',
  feeAddress: 'f',
  buyerAddress: 'b',
  expiresAt: '',
  graceUntil: '',
  payments: [],
  chain: { network: 'solana', cluster: 'devnet', chainId: 502, usdcMint: 'm', livemode: false, feePercent: 5 },
  ...over,
});

describe('a server answer shows on the screen at once', () => {
  it('a published offer is the first line of "Minhas ofertas" before anything is asked again', () => {
    const live: MarketLive = { overview: overview([mine('old')]), listings: [pub('old')] };
    const fresh = myListingFrom({ id: 'new', certificateId: 'c-new', priceLamports: 5_000_000, item: ITEM, expiresAt: '2026-10-28T12:00:00.000Z', now: Date.parse('2026-10-21T12:00:00Z') });
    const next = applyMarketChange(live, { kind: 'listed', listing: fresh });
    expect(next.overview?.listings.map((l) => l.id)).toEqual(['new', 'old']);
    expect(next.overview?.listings[0]).toMatchObject({ status: 'open', priceLamports: 5_000_000, createdAt: '2026-10-21T12:00:00.000Z' });
    // applying the same answer twice does not list it twice
    expect(applyMarketChange(next, { kind: 'listed', listing: fresh }).overview?.listings).toHaveLength(2);
  });

  it('a cancelled offer leaves "Minhas ofertas" and the browse list in the same moment', () => {
    const live: MarketLive = { overview: overview([mine('a'), mine('b')]), listings: [pub('a'), pub('b')] };
    const next = applyMarketChange(live, { kind: 'cancelled', listingId: 'a' });
    expect(next.overview?.listings.map((l) => l.id)).toEqual(['b']);
    expect(next.listings.map((l) => l.id)).toEqual(['b']);
  });

  it('reserving takes the offer in the browse list and opens the payment; releasing opens it again', () => {
    const live: MarketLive = { overview: overview([mine('l1')]), listings: [pub('l1'), pub('l2')] };
    const r = reservation();
    const taken = applyMarketChange(live, { kind: 'reserved', reservation: r });
    expect(taken.listings.map((l) => [l.id, l.status])).toEqual([
      ['l1', 'reserved'],
      ['l2', 'open'],
    ]);
    expect(taken.overview?.reservation).toEqual(r);
    expect(taken.overview?.listings[0].status).toBe('reserved');
    const freed = applyMarketChange(taken, { kind: 'reservationReleased', reservation: r });
    expect(freed.listings.map((l) => l.status)).toEqual(['open', 'open']);
    expect(freed.overview?.reservation).toBeNull();
    expect(freed.overview?.listings[0].status).toBe('open');
  });

  it('a recorded payment removes the offer from the browse list; a payment that is not recorded as sold leaves the lists alone', () => {
    const live: MarketLive = { overview: overview([], reservation()), listings: [pub('l1'), pub('l2')] };
    const paid = applyMarketChange(live, { kind: 'paid', reservation: reservation({ status: 'paid' }) });
    expect(paid.listings.map((l) => l.id)).toEqual(['l2']);
    expect(paid.overview?.reservation?.status).toBe('paid');
    const still = applyMarketChange(live, { kind: 'paid', reservation: reservation({ status: 'pending' }) });
    expect(still.listings.map((l) => l.id)).toEqual(['l1', 'l2']);
  });

  it('works before the first read arrived (no overview yet) without throwing', () => {
    const live: MarketLive = { overview: null, listings: [pub('l1')] };
    expect(applyMarketChange(live, { kind: 'cancelled', listingId: 'l1' })).toEqual({ overview: null, listings: [] });
    expect(applyMarketChange(live, { kind: 'listed', listing: mine('x') })).toBe(live);
  });

  it('a read that was asked before a newer one never lands on top of it', () => {
    const seq = makeReadSequence();
    const first = seq.next();
    const second = seq.next();
    expect(seq.isLatest(first)).toBe(false);
    expect(seq.isLatest(second)).toBe(true);
  });
});

describe('asking the server about a payment', () => {
  it('the server verifies at `confirmed` (1 to 2 s), never `processed`; replay protection is the signature key, not the commitment', () => {
    expect(SOLANA_VERIFY_COMMITMENT).toBe('confirmed');
  });

  it('the first question has no delay; then every 2 s for 30 s, every 4 s up to 90 s, then every 8 s', () => {
    expect(Array.from({ length: 15 }, (_, i) => confirmRetryDelayMs(i))).toEqual(Array(15).fill(2000));
    expect(Array.from({ length: 15 }, (_, i) => confirmRetryDelayMs(15 + i))).toEqual(Array(15).fill(4000));
    expect(confirmRetryDelayMs(30)).toBe(8000);
    expect(confirmRetryDelayMs(500)).toBe(8000);
    // the whole patience is about 3.5 minutes and about 45 questions: well inside the server's 240 an hour
    const total = Array.from({ length: CONFIRM_MAX_TRIES - 1 }, (_, i) => confirmRetryDelayMs(i)).reduce((a, b) => a + b, 0);
    expect(CONFIRM_MAX_TRIES).toBe(45);
    expect(total).toBeGreaterThan(150_000);
    expect(total).toBeLessThan(240_000);
  });

  it('the timer line counts whole seconds and is never negative', () => {
    expect(elapsedSeconds(1000, 1000)).toBe(0);
    expect(elapsedSeconds(1000, 13_999)).toBe(12);
    expect(elapsedSeconds(5000, 1000)).toBe(0);
  });

  const sequence = (answers: { status?: number; body: Record<string, unknown> }[]): { api: MarketApi; calls: () => number } => {
    let i = 0;
    const api = createMarketApi(async () => {
      const a = answers[Math.min(i++, answers.length - 1)];
      return { status: a.status ?? 200, body: a.body };
    });
    return { api, calls: () => i };
  };
  const notYet = { status: 409, body: { ok: false, reason: 'unconfirmed' } };
  const SIG = 's'.repeat(88);

  it('market: asks at once, waits 2 s between "not yet" answers, and stops at the recorded payment', async () => {
    const waits: number[] = [];
    const { api, calls } = sequence([notYet, notYet, { body: { ok: true, status: 'sold', reservation: null } }]);
    const out = await submitWithPolling(api, 'r1', SIG, { sleep: async (ms) => void waits.push(ms) });
    expect(out).toMatchObject({ kind: 'recorded', status: 'sold' });
    expect(calls()).toBe(3);
    expect(waits).toEqual([2000, 2000]); // nothing before the first question
  });

  it('market: keeps the 2 s pace through the first 30 s, then slows down, and does not wait after the last question', async () => {
    const waits: number[] = [];
    const { api, calls } = sequence([notYet]);
    const out = await submitWithPolling(api, 'r1', SIG, { sleep: async (ms) => void waits.push(ms), maxTries: 17 });
    expect(out).toMatchObject({ kind: 'pending', reason: 'unconfirmed' });
    expect(calls()).toBe(17);
    expect(waits).toHaveLength(16);
    expect(waits.slice(0, 15).every((w) => w === 2000)).toBe(true);
    expect(waits[15]).toBe(4000);
  });

  it('pass: asks at once, retries on the same schedule while "not yet", and reports each final answer', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => void waits.push(ms);
    const ok = sequence([{ status: 409, body: { ok: false, reason: 'not_found_tx' } }, notYet, { body: { ok: true, status: 'granted' } }]);
    expect(await submitPassWithPolling(ok.api, 'sig', { sleep })).toEqual({ kind: 'granted' });
    expect(waits).toEqual([2000, 2000]);
    expect(await submitPassWithPolling(sequence([{ status: 409, body: { ok: false, reason: 'short_amount' } }]).api, 'sig', { sleep })).toEqual({ kind: 'refused', reason: 'short_amount' });
    expect(await submitPassWithPolling(sequence([{ status: 409, body: { ok: false, reason: 'payment_unmatched', code: 'CODE' } }]).api, 'sig', { sleep })).toEqual({ kind: 'unmatched', code: 'CODE' });
    expect(await submitPassWithPolling(sequence([{ status: 409, body: { ok: false, reason: 'already_owned', refundDue: true } }]).api, 'sig', { sleep })).toEqual({ kind: 'alreadyOwned', refundDue: true });
    expect(await submitPassWithPolling(sequence([{ status: 503, body: { ok: false, reason: 'pass_sales_paused' } }]).api, 'sig', { sleep })).toEqual({ kind: 'held', reason: 'pass_sales_paused' });
    const down = createMarketApi(async () => {
      throw new Error('offline');
    });
    expect(await submitPassWithPolling(down, 'sig', { sleep })).toEqual({ kind: 'unreachable' });
    expect(await submitPassWithPolling(sequence([notYet]).api, 'sig', { sleep, maxTries: 3 })).toEqual({ kind: 'pending', reason: 'unconfirmed' });
    expect(await submitPassWithPolling(sequence([notYet]).api, 'sig', { sleep, isCancelled: () => true })).toEqual({ kind: 'stopped' });
  });
});
