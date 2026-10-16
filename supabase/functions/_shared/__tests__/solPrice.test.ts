import { describe, expect, it } from 'vitest';
import { createSolUsdReader, extractUsdPrice } from '../market/solPrice.ts';

// The optional "about US$" line: the SERVER reads one https JSON endpoint (the owner's secret SOL_USD_PRICE_URL), caches it for 5 minutes, and the game never calls a third party.

const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;

describe('reading a dollar price out of whatever JSON the owner pointed at', () => {
  it('finds the number in the usual shapes', () => {
    expect(extractUsdPrice({ solana: { usd: 148.25 } })).toBe(148.25); // CoinGecko
    expect(extractUsdPrice({ data: { amount: '148.25', currency: 'USD' } })).toBe(148.25); // Coinbase
    expect(extractUsdPrice({ data: { So11111111111111111111111111111111111111112: { price: '148.25' } } })).toBe(148.25); // Jupiter
    expect(extractUsdPrice({ usd: 150 })).toBe(150);
  });

  it('refuses anything that is not a sane positive price', () => {
    for (const bad of [null, 5, 'x', {}, { usd: 0 }, { usd: -3 }, { usd: 1e9 }, { usd: 'free' }, { usd: NaN }, { a: { b: { c: { d: { e: { usd: 150 } } } } } }, { price: '1e3' }]) expect(extractUsdPrice(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('the cached reader', () => {
  it('without a URL, or with a URL that is not https, there is no dollar line and no request', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return jsonResponse({ usd: 1 });
    }) as unknown as typeof fetch;
    expect(await createSolUsdReader(undefined, { fetchFn })()).toBeNull();
    expect(await createSolUsdReader('', { fetchFn })()).toBeNull();
    expect(await createSolUsdReader('http://insecure.example/price', { fetchFn })()).toBeNull();
    expect(calls).toBe(0);
  });

  it('asks the endpoint once and keeps the answer for 5 minutes', async () => {
    let calls = 0;
    let now = 1_000_000;
    const fetchFn = (async () => {
      calls++;
      return jsonResponse({ solana: { usd: 100 + calls } });
    }) as unknown as typeof fetch;
    const read = createSolUsdReader('https://prices.example/sol', { fetchFn, nowMs: () => now });
    expect(await read()).toBe(101);
    now += 4 * 60_000;
    expect(await read()).toBe(101);
    expect(calls).toBe(1);
    now += 2 * 60_000; // 6 minutes: stale
    expect(await read()).toBe(102);
    expect(calls).toBe(2);
  });

  it('many readers at the same instant make one request', async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return jsonResponse({ usd: 150 });
    }) as unknown as typeof fetch;
    const read = createSolUsdReader('https://prices.example/sol', { fetchFn });
    expect(await Promise.all([read(), read(), read()])).toEqual([150, 150, 150]);
    expect(calls).toBe(1);
  });

  it('a failing endpoint keeps the last good value for up to an hour, then there is no line at all', async () => {
    let now = 0;
    let fail = false;
    const fetchFn = (async () => {
      if (fail) throw new Error('down');
      return jsonResponse({ usd: 150 });
    }) as unknown as typeof fetch;
    const read = createSolUsdReader('https://prices.example/sol', { fetchFn, nowMs: () => now });
    expect(await read()).toBe(150);
    fail = true;
    now += 10 * 60_000;
    expect(await read()).toBe(150); // stale but recent
    now += 61 * 60_000;
    expect(await read()).toBeNull();
  });

  it('an error status or garbage is "no price", never a thrown error', async () => {
    const read = createSolUsdReader('https://prices.example/sol', { fetchFn: (async () => jsonResponse({}, false)) as unknown as typeof fetch });
    expect(await read()).toBeNull();
    const garbage = createSolUsdReader('https://prices.example/sol', { fetchFn: (async () => jsonResponse({ nothing: 'here' })) as unknown as typeof fetch });
    expect(await garbage()).toBeNull();
  });
});
