import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMarketApi } from '../market/api';
import { submitWithPolling } from '../market/payFlow';
import {
  PASS_PENDING_KEY,
  PENDING_PAYMENTS_KEY,
  PENDING_PAYMENT_MAX_AGE_MS,
  clearPending,
  isHeldReason,
  isPausedReason,
  loadPending,
  marketPendingKey,
  savePending,
} from '../market/pendingPayment';
import { mt } from '../../locales/market';
import { setLocale } from '../../locales';
import { sig } from '../../../supabase/functions/_shared/__tests__/solanaFixtures';

// The signature the wallet returns is remembered in the browser until the server answers a FINAL status, so a reload, a crash or a paused market never loses a payment that is already on chain.

beforeEach(() => localStorage.clear());
afterEach(() => setLocale('pt'));

describe('the remembered signature', () => {
  it('is saved, found after a "reload" (a fresh read of storage), and forgotten on clear', () => {
    const key = marketPendingKey('res-1');
    expect(loadPending(key)).toBeNull();
    savePending(key, sig(1), 'WalletAddr');
    expect(JSON.parse(localStorage.getItem(PENDING_PAYMENTS_KEY) as string)[key]).toMatchObject({ signature: sig(1), wallet: 'WalletAddr' });
    expect(loadPending(key)).toMatchObject({ signature: sig(1), wallet: 'WalletAddr' });
    clearPending(key);
    expect(loadPending(key)).toBeNull();
  });

  it('keeps the market reservation and the Pass apart, and a newer signature replaces the older one', () => {
    savePending(marketPendingKey('a'), sig(1));
    savePending(marketPendingKey('b'), sig(2));
    savePending(PASS_PENDING_KEY, sig(3), 'W');
    expect(loadPending(marketPendingKey('a'))?.signature).toBe(sig(1));
    expect(loadPending(marketPendingKey('b'))?.signature).toBe(sig(2));
    expect(loadPending(PASS_PENDING_KEY)?.signature).toBe(sig(3));
    savePending(marketPendingKey('a'), sig(4));
    expect(loadPending(marketPendingKey('a'))?.signature).toBe(sig(4));
    clearPending(PASS_PENDING_KEY);
    expect(loadPending(marketPendingKey('b'))?.signature).toBe(sig(2));
  });

  it('expires after a week and ignores garbage in storage', () => {
    const t0 = 1_000_000_000_000;
    savePending('k', sig(1), undefined, t0);
    expect(loadPending('k', t0 + PENDING_PAYMENT_MAX_AGE_MS - 1)).not.toBeNull();
    expect(loadPending('k', t0 + PENDING_PAYMENT_MAX_AGE_MS + 1)).toBeNull();
    localStorage.setItem(PENDING_PAYMENTS_KEY, '{not json');
    expect(loadPending('k')).toBeNull();
    localStorage.setItem(PENDING_PAYMENTS_KEY, JSON.stringify({ k: { signature: 5, at: 'x' }, j: null }));
    expect(loadPending('k')).toBeNull();
  });

  it('never throws when the storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => savePending('k', sig(1), undefined, Date.now(), blocked)).not.toThrow();
    expect(loadPending('k', Date.now(), blocked)).toBeNull();
    expect(() => clearPending('k', Date.now(), blocked)).not.toThrow();
    expect(() => savePending('k', sig(1), undefined, Date.now(), null)).not.toThrow();
  });
});

describe('which server answers keep the signature', () => {
  it('a pause, a rate limit or a server error keep it; a final answer does not', () => {
    for (const r of ['market_paused', 'pass_sales_paused', 'rate_limited', 'status_500', 'status_503']) expect(isHeldReason(r)).toBe(true);
    for (const r of ['tx_reused', 'short_amount', 'wrong_recipient', 'not_found', 'payment_unmatched', 'already_owned', 'status_404']) expect(isHeldReason(r)).toBe(false);
    expect(isPausedReason('market_paused')).toBe(true);
    expect(isPausedReason('pass_sales_paused')).toBe(true);
    expect(isPausedReason('rate_limited')).toBe(false);
  });

  it('submitting while the market is paused comes back as a held refusal (the real 503 body of the paused function)', async () => {
    const api = createMarketApi(async () => ({ status: 503, body: { ok: false, error: 'paused', reason: 'market_paused' } }));
    const out = await submitWithPolling(api, 'res-1', sig(9), { intervalMs: 0, sleep: async () => undefined });
    expect(out).toEqual({ kind: 'refused', reason: 'market_paused' });
    if (out.kind === 'refused') expect(isHeldReason(out.reason)).toBe(true);
  });
});

describe('the message for a payment made while sales are paused (both languages)', () => {
  it('says the network received it, it is saved and it will be confirmed by itself', () => {
    for (const key of ['pay.fail.market_paused', 'pay.fail.pass_sales_paused']) {
      setLocale('pt');
      const pt = mt(key);
      expect(pt).not.toBe(key);
      expect(pt).toContain('recebido pela rede');
      expect(pt).toContain('automaticamente');
      setLocale('en');
      const en = mt(key);
      expect(en).not.toBe(key);
      expect(en).toContain('received by the network');
      expect(en).toContain('automatically');
    }
  });
});

describe('the screens use it', () => {
  const panel = readFileSync('src/components/market/ReservationPanel.tsx', 'utf8');
  const pass = readFileSync('src/components/PassUsdc.tsx', 'utf8');
  it('both payment screens save the signature as soon as the wallet returns it, resume on open and clear on a final answer', () => {
    for (const src of [panel, pass]) {
      expect(src).toContain('savePending(');
      expect(src).toContain('loadPending(');
      expect(src).toContain('clearPending(');
      expect(src).toContain('PAUSED_RETRY_MS');
    }
    expect(panel).toContain('isHeldReason(');
    // the Pass screen asks submitPassWithPolling, which tells a held answer (paused / busy: keep the signature) from a final one
    expect(pass).toContain('isPausedReason(');
    expect(readFileSync('src/game/market/passPay.ts', 'utf8')).toContain('isHeldReason(');
  });
});
