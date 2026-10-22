import { describe, expect, it } from 'vitest';
import { MARKET_MIN_PRICE_LAMPORTS, POUCH_FLOOR_USD_MICRO_PER_1000_GOLD, SOL_PRICE_STEP_LAMPORTS, pouchFloorLamports, pouchFloorUsd, solUsdMicro } from '../chain/solMoney.ts';
import { POUCH_TABLE } from '../items/tables.ts';
import { USER_A, USER_B, makeMarket } from './marketHarness.ts';

// The Gold Pouch price floor (owner decision 2026-10-22): US$ 0.25 per 1,000 Gold of face value, charged in SOL at the server's rate, rounded UP to the 0.001 SOL step.

const SOL = 1_000_000_000;
const { gold_pouch_s: SMALL, gold_pouch_m: MEDIUM, gold_pouch_l: LARGE } = POUCH_TABLE.faces;

describe('the floor sum', () => {
  it('is US$ 0.25 per 1,000 Gold: the three faces and the three old faces', () => {
    expect(POUCH_FLOOR_USD_MICRO_PER_1000_GOLD).toBe(250_000);
    expect([SMALL, MEDIUM, LARGE].map(pouchFloorUsd)).toEqual([0.5, 1.25, 5]);
    expect([10_000, 50_000, 100_000].map(pouchFloorUsd)).toEqual([2.5, 12.5, 25]);
  });

  it('converts at the server rate and rounds UP to the 0.001 SOL step (never under its dollar value)', () => {
    // rate US$ 100: US$ 0.50 = 0.005 SOL exactly; US$ 1.25 = 0.0125 SOL; US$ 5 = 0.05 SOL
    expect(pouchFloorLamports(SMALL, 100)).toBe(5_000_000);
    expect(pouchFloorLamports(MEDIUM, 100)).toBe(13_000_000); // 0.0125 up to 0.013
    expect(pouchFloorLamports(LARGE, 100)).toBe(50_000_000);
    // rate US$ 150: 0.50 / 150 = 0.003333.. SOL -> 0.004
    expect(pouchFloorLamports(SMALL, 150)).toBe(4_000_000);
    for (const [gold, rate] of [[SMALL, 150], [MEDIUM, 137.31], [LARGE, 211.9], [10_000, 99.99], [100_000, 3000]] as [number, number][]) {
      const f = pouchFloorLamports(gold, rate) as number;
      expect(f % SOL_PRICE_STEP_LAMPORTS).toBe(0);
      expect((f / SOL) * rate).toBeGreaterThanOrEqual(pouchFloorUsd(gold) - 1e-9);
      expect(((f - SOL_PRICE_STEP_LAMPORTS) / SOL) * rate).toBeLessThan(pouchFloorUsd(gold) + 1e-9);
    }
  });

  it('the legacy faces follow the same per-1,000 rule from the gold amount', () => {
    expect(pouchFloorLamports(10_000, 100)).toBe(25_000_000);
    expect(pouchFloorLamports(50_000, 100)).toBe(125_000_000);
    expect(pouchFloorLamports(100_000, 100)).toBe(250_000_000);
  });

  it('is never below the general minimum, even at a huge SOL price', () => {
    expect(pouchFloorLamports(SMALL, 100_000)).toBe(MARKET_MIN_PRICE_LAMPORTS);
  });

  it('is null when the SOL rate is missing or unusable, or the amount is', () => {
    for (const rate of [null, undefined, 0, -5, NaN, Infinity]) expect(pouchFloorLamports(SMALL, rate)).toBeNull();
    expect(pouchFloorLamports(0, 150)).toBeNull();
    expect(pouchFloorLamports(1.5, 150)).toBeNull();
    expect(solUsdMicro(150.2)).toBe(150_200_000);
  });
});

async function pouchMarket(rate: number | null, goldAmount: number = SMALL) {
  const m = makeMarket();
  for (const u of [USER_A, USER_B]) m.link(u);
  m.usd.value = rate;
  const pouch = m.store.addCert(USER_A, { kind: 'gold_pouch', templateId: 'gold_pouch_s', rarity: null, tier: null, substats: [], goldAmount });
  const item = m.store.addCert(USER_A);
  return { m, pouch, item };
}

describe('market-list and the pouch floor', () => {
  it('refuses a pouch below the floor, with the floor in the answer, and keeps it with its owner', async () => {
    const { m, pouch } = await pouchMarket(150);
    const r = await m.list({ action: 'list', certificateId: pouch.id, priceLamports: 3_000_000 });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ ok: false, reason: 'below_pouch_floor', floorLamports: 4_000_000 });
    expect(m.store.certs.get(pouch.id)?.status).toBe('held');
    expect(m.store.listings.size).toBe(0);
  });

  it('accepts a pouch exactly at the floor and above it', async () => {
    const { m, pouch } = await pouchMarket(150);
    expect((await m.list({ action: 'list', certificateId: pouch.id, priceLamports: 4_000_000 })).status).toBe(200);
    const second = m.store.addCert(USER_A, { kind: 'gold_pouch', templateId: 'gold_pouch_s', rarity: null, tier: null, substats: [], goldAmount: SMALL });
    expect((await m.list({ action: 'list', certificateId: second.id, priceLamports: 5 * SOL })).status).toBe(200);
  });

  it('a legacy-face pouch follows the same per-1,000 rule', async () => {
    const { m, pouch } = await pouchMarket(100, 10_000);
    const low = await m.list({ action: 'list', certificateId: pouch.id, priceLamports: 24_000_000 });
    expect(low.body).toMatchObject({ reason: 'below_pouch_floor', floorLamports: 25_000_000 });
    expect((await m.list({ action: 'list', certificateId: pouch.id, priceLamports: 25_000_000 })).status).toBe(200);
  });

  it('with no SOL rate a pouch is refused with a retryable reason (503), never listed', async () => {
    const { m, pouch } = await pouchMarket(null);
    const r = await m.list({ action: 'list', certificateId: pouch.id, priceLamports: 50 * SOL });
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ ok: false, reason: 'pouch_rate_unavailable' });
    expect(m.store.certs.get(pouch.id)?.status).toBe('held');
  });

  it('a rate read that throws counts as no rate', async () => {
    const { m, pouch } = await pouchMarket(150);
    m.deps.solUsd = async () => {
      throw new Error('down');
    };
    expect((await m.list({ action: 'list', certificateId: pouch.id, priceLamports: 50 * SOL })).body.reason).toBe('pouch_rate_unavailable');
  });

  it('items keep the general minimum, with or without a rate', async () => {
    for (const rate of [null, 150]) {
      const { m, item } = await pouchMarket(rate);
      expect((await m.list({ action: 'list', certificateId: item.id, priceLamports: MARKET_MIN_PRICE_LAMPORTS })).status).toBe(200);
    }
  });

});
