import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHuntSession, defaultSave, SaveData } from '../engine';
import { getServerPassOwned, grantDailyPassKit, isServerPassSource, ownsAdventurerPass, purchaseAdventurerPass, setPassSource, setServerPassOwned } from '../entitlements';
import {
  applyServerPass,
  buyIntentAction,
  BUY_INTENT_KEY,
  BUY_INTENT_MAX_AGE_MS,
  captureBuyIntent,
  clearBuyIntent,
  hasBuyIntent,
  isTrustedCheckoutUrl,
  PASS_CACHE_KEY,
  PASS_CACHE_MAX_AGE_MS,
  passPurchaseEnabled,
  pollPassOwned,
  readPassCache,
  resolvePassOwned,
  startCheckout,
  writePassCache,
} from '../passServer';
import { applySelectSkin } from '../seasonItems';
import { stashCapacity } from '../stash';
import { HUNTING_ZONES } from '../huntingZones';

const NOW = 1_800_000_000_000;
const DAY = 24 * 3600 * 1000;
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};

// A save edited by hand: the Pass flag on, the golden skin owned and worn.
const forged = (): SaveData => ({ ...defaultSave(), hasBattlePass: true, cosmetics: ['skin_golden_knight'], activeSkin: 'skin_golden_knight' });

afterEach(() => setPassSource('save'));

describe('server mode: the save cannot grant the Pass', () => {
  it('a save edited to hasBattlePass: true gains nothing while the server says no', () => {
    setPassSource('server');
    expect(isServerPassSource()).toBe(true);
    const save = forged();
    expect(ownsAdventurerPass(save)).toBe(false);
    // the Pass-gated effects all read ownsAdventurerPass, so none of them fire
    expect(grantDailyPassKit(save, '2026-10-13')).toBe(save);
    expect(stashCapacity(save)).toBe(stashCapacity({ ...save, hasBattlePass: false }));
    expect(applySelectSkin(save, 'skin_golden_knight')).toBeNull();
    expect(purchaseAdventurerPass(save, NOW)).toMatchObject({ ok: false, reason: 'unavailable' }); // no client-side grant exists in server mode
  });

  it('the server answer alone decides, even for a save whose flag says the opposite', () => {
    setPassSource('server');
    setServerPassOwned(true);
    expect(ownsAdventurerPass({ hasBattlePass: false })).toBe(true);
    expect(grantDailyPassKit(defaultSave(), '2026-10-13').consumables.repair_kit).toBe(1);
    setServerPassOwned(false);
    expect(ownsAdventurerPass({ hasBattlePass: true })).toBe(false);
  });

  it('applyServerPass overwrites a forged save: the flag, the skin and the hunt pass windows go; it is idempotent', () => {
    setPassSource('server');
    const zone = HUNTING_ZONES[0];
    const base = { ...forged(), activeHuntingZone: zone.id, activeHuntingDepth: 'shallow' as const, huntingOfflineStart: NOW - 1000 };
    const withHunt: SaveData = { ...base, huntSession: { ...buildHuntSession({ ...base, hasBattlePass: false }, NOW - 1000), pass: [{ from: NOW - 1000, to: null }] } };
    const cleaned = applyServerPass(withHunt, false, NOW);
    expect(cleaned.hasBattlePass).toBe(false);
    expect(cleaned.activeSkin).toBeNull();
    expect(cleaned.huntSession?.pass).toEqual([]);
    expect(applyServerPass(cleaned, false, NOW)).toBe(cleaned);
  });

  it('applyServerPass gives the owner the flag, and opens the pass window of a running hunt', () => {
    const zone = HUNTING_ZONES[0];
    const base = { ...defaultSave(), activeHuntingZone: zone.id, activeHuntingDepth: 'shallow' as const, huntingOfflineStart: NOW - 1000 };
    const hunting: SaveData = { ...base, huntSession: buildHuntSession(base, NOW - 1000) };
    const owned = applyServerPass(hunting, true, NOW);
    expect(owned.hasBattlePass).toBe(true);
    expect(owned.huntSession?.pass.some((w) => w.to === null)).toBe(true);
    expect(applyServerPass(owned, true, NOW)).toBe(owned);
  });

  it('the server value resets with the source (signing out / leaving server mode never leaks an old yes)', () => {
    setPassSource('server');
    setServerPassOwned(true);
    setPassSource('save');
    expect(getServerPassOwned()).toBe(false);
  });
});

describe('offline / desktop build: unchanged', () => {
  it('the source defaults to the save flag, and the DEV grant path still works there', () => {
    expect(isServerPassSource()).toBe(false);
    expect(ownsAdventurerPass({ hasBattlePass: true })).toBe(true);
    expect(ownsAdventurerPass({ hasBattlePass: false })).toBe(false);
    setServerPassOwned(true); // an answer from a server nobody asked has no effect in save mode
    expect(ownsAdventurerPass({ hasBattlePass: false })).toBe(false);
    setServerPassOwned(false);
    expect(purchaseAdventurerPass(defaultSave(), NOW).ok).toBe(true); // vitest runs with import.meta.env.DEV true
  });
});

describe('offline grace cache (a convenience, not security)', () => {
  it('returns a fresh entry for the same user only, and nothing once it is older than the grace period', () => {
    const st = memoryStorage();
    writePassCache(USER, true, NOW, st);
    expect(readPassCache(USER, NOW + DAY, st)).toBe(true);
    expect(readPassCache(OTHER, NOW + DAY, st)).toBeNull();
    expect(readPassCache(USER, NOW + PASS_CACHE_MAX_AGE_MS + 1, st)).toBeNull();
    expect(PASS_CACHE_MAX_AGE_MS).toBeLessThanOrEqual(7 * DAY);
  });
  it('ignores garbage and entries dated in the future', () => {
    const st = memoryStorage();
    st.setItem(PASS_CACHE_KEY, 'not json');
    expect(readPassCache(USER, NOW, st)).toBeNull();
    st.setItem(PASS_CACHE_KEY, JSON.stringify({ userId: USER, owned: 'yes', checkedAt: NOW }));
    expect(readPassCache(USER, NOW, st)).toBeNull();
    st.setItem(PASS_CACHE_KEY, JSON.stringify({ userId: USER, owned: true, checkedAt: NOW + 10 * DAY }));
    expect(readPassCache(USER, NOW, st)).toBeNull();
    expect(readPassCache(USER, NOW, null)).toBeNull();
  });
  it('resolvePassOwned: the server wins and refreshes the cache; offline uses a fresh cache; otherwise it fails closed', async () => {
    const st = memoryStorage();
    const up = await resolvePassOwned(USER, { fetchOwned: async () => true, storage: st, now: () => NOW });
    expect(up).toEqual({ owned: true, from: 'server' });
    const down = async () => {
      throw new Error('offline');
    };
    expect(await resolvePassOwned(USER, { fetchOwned: down, storage: st, now: () => NOW + 2 * DAY })).toEqual({ owned: true, from: 'cache' });
    expect(await resolvePassOwned(USER, { fetchOwned: down, storage: st, now: () => NOW + 4 * DAY })).toEqual({ owned: false, from: 'none' });
    expect(await resolvePassOwned(OTHER, { fetchOwned: down, storage: st, now: () => NOW })).toEqual({ owned: false, from: 'none' });
    // a server "no" overwrites an old cached "yes" (a refund)
    await resolvePassOwned(USER, { fetchOwned: async () => false, storage: st, now: () => NOW + DAY });
    expect(readPassCache(USER, NOW + DAY, st)).toBe(false);
  });
});

describe('waiting for the webhook after checkout', () => {
  const noSleep = async () => {};
  it('resolves owned as soon as the entitlement appears, tolerating errors in between', async () => {
    let calls = 0;
    const r = await pollPassOwned(
      async () => {
        calls++;
        if (calls === 1) throw new Error('blip');
        return calls >= 3;
      },
      { intervalMs: 1000, maxMs: 10_000, sleep: noSleep },
    );
    expect(r).toBe('owned');
    expect(calls).toBe(3);
  });
  it('gives up with pending after the time budget, and stops when cancelled', async () => {
    let calls = 0;
    const never = async () => {
      calls++;
      return false;
    };
    expect(await pollPassOwned(never, { intervalMs: 1000, maxMs: 5000, sleep: noSleep })).toBe('pending');
    expect(calls).toBe(5);
    expect(await pollPassOwned(never, { intervalMs: 1000, maxMs: 5000, sleep: noSleep, isCancelled: () => true })).toBe('cancelled');
  });
});

describe('starting a purchase', () => {
  it('only a Stripe-hosted https Checkout URL is ever navigated to', () => {
    expect(isTrustedCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_1')).toBe(true);
    for (const bad of ['http://checkout.stripe.com/x', 'https://evil.test/x', 'https://checkout.stripe.com.evil.test/x', 'javascript:alert(1)', '', null, 42]) {
      expect(isTrustedCheckoutUrl(bad)).toBe(false);
    }
  });
  it('is unavailable (no network call) while the sales flag is off, the shipped default', async () => {
    expect(passPurchaseEnabled).toBe(false);
    let redirected = false;
    expect(await startCheckout(() => void (redirected = true))).toEqual({ ok: false, reason: 'unavailable' });
    expect(redirected).toBe(false);
  });
});

describe('the buy link from the website (?comprar=passe)', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
  };

  it('captures the marker once, cleans the address bar and keeps the rest of the URL', () => {
    clearBuyIntent(store());
    const s = store();
    let replaced = '';
    expect(captureBuyIntent('https://jogo.example.test/play?x=1&comprar=passe#top', (u) => (replaced = u), NOW, s)).toBe(true);
    expect(replaced).toBe('/play?x=1#top');
    expect(hasBuyIntent(NOW + 1000, s)).toBe(true);
    // other values and a plain URL are ignored
    expect(captureBuyIntent('https://jogo.example.test/?comprar=outra', () => undefined, NOW, store())).toBe(false);
    expect(captureBuyIntent('https://jogo.example.test/', () => undefined, NOW, store())).toBe(false);
  });

  it('survives the login screen (a reload reads it back from the tab storage) and expires after 30 minutes', () => {
    clearBuyIntent(store());
    const s = store();
    captureBuyIntent('https://jogo.example.test/?comprar=passe', () => undefined, NOW, s);
    clearBuyIntent(null); // a fresh page load forgets the in-memory copy but the tab storage stays
    s.setItem(BUY_INTENT_KEY, JSON.stringify({ at: NOW }));
    expect(hasBuyIntent(NOW + 60_000, s)).toBe(true);
    expect(hasBuyIntent(NOW + BUY_INTENT_MAX_AGE_MS + 1, s)).toBe(false);
    clearBuyIntent(s);
    expect(hasBuyIntent(NOW + 1000, s)).toBe(false);
    expect(s.raw.has(BUY_INTENT_KEY)).toBe(false);
  });

  it('highlights the buy button only with sales on AND an account the server says does not own the Pass; otherwise it just opens the modal', () => {
    expect(buyIntentAction(true, false)).toBe('highlight');
    expect(buyIntentAction(true, true)).toBe('open'); // already owned
    expect(buyIntentAction(true, null)).toBe('open'); // the server could not be asked: never guess
    expect(buyIntentAction(false, false)).toBe('open'); // VITE_PASS_PURCHASE_ENABLED off: harmless
  });

  it('the link never starts a checkout by itself: the buy-intent effect in App calls neither startCheckout nor purchaseBattlePass, only the modal and the highlight', () => {
    const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    const start = app.indexOf('const buyIntentDone = useRef(false);');
    expect(start).toBeGreaterThan(-1);
    const effect = app.slice(start, app.indexOf('}, [userId, passVersion]);', start));
    expect(effect).not.toMatch(/startCheckout|purchaseBattlePass|create-checkout/);
    expect(effect).toContain('openPassView()');
    expect(effect).toContain('setHighlightBuy(');
  });

  it('with the flag off (the test build) startCheckout stays unavailable, so the link can never reach a payment page', async () => {
    expect(passPurchaseEnabled).toBe(false);
    expect(await startCheckout(() => undefined)).toEqual({ ok: false, reason: 'unavailable' });
  });
});
