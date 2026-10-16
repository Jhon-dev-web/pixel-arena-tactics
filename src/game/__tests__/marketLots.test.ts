import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { ItemServerUnreachable } from '../itemServer';
import { MarketApi, MarketFn, MarketUnreachable, createMarketApi } from '../market/api';
import { listLot, lotQuote, sellableLots } from '../market/lots';
import { MaterialApi, createMaterialApi } from '../materialServer';
import { MINT_INTENTS_KEY } from '../mintIntents';
import { setItemAuthority } from '../itemAuthority';
import { runSync } from '../tradeableActions';
import { listTradeable, tradeableOf, totalTradeable } from '../tradeableMaterials';
import { USER_A, USER_B, WALLET, FEE_ADDRESS, makeMarket } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import { makeMaterialServer } from '../../../supabase/functions/_shared/__tests__/fakeMaterialStore';
import { MARKET_RULES } from '../../../supabase/functions/_shared/market/rules';

// Lots of tradeable materials, from the game's side, against the REAL handlers over the in-memory stores that follow migration 0015: the server issues the units, the player lists a lot (the units
// leave the save into escrow), another player buys it whole, and the units arrive in his save. No unit is ever created or lost on the way.

type Harness = ReturnType<typeof makeMarket>;
let m: Harness;

const marketApi = (userId: string): MarketApi =>
  createMarketApi(async (fn: MarketFn, body: object) => {
    const run = fn === 'market-wallet' ? m.wallet : fn === 'market-list' ? m.list : fn === 'market-buy' ? m.buy : fn === 'market-my' ? m.my : m.pass;
    return run(body, userId);
  });

// The material server shares the market store's balances (one account, one balance).
const materialApiFor = (userId: string): MaterialApi => {
  const server = makeMaterialServer({ store: m.store.materials });
  return createMaterialApi(
    async (fn, body) => {
      const r = fn === 'material-claim' ? await server.claim(body, userId) : await server.sync(body, userId);
      return { status: r.status, body: r.body };
    },
    { retries: 0, sleep: async () => undefined },
  );
};

/** A player with a save in which the server has issued `n` tradeable units of a material. */
async function holder(userId: string, id: 'iron' | 'copper', n: number, extra = 0): Promise<{ state: { save: SaveData; synced: SaveData | null }; market: MarketApi; materials: MaterialApi }> {
  await m.store.materials.credit({ userId, requestId: `seed:${id}:${userId.slice(0, 4)}`, credits: { [id]: n } });
  const base = defaultSave();
  const save: SaveData = { ...base, materials: { ...base.materials, [id]: n + extra }, tradeableMaterials: { [id]: n } };
  return { state: { save, synced: save }, market: marketApi(userId), materials: materialApiFor(userId) };
}

const deps = (p: { state: { save: SaveData }; market: MarketApi }) => ({ api: p.market, getSave: () => p.state.save, applySave: (next: SaveData) => void (p.state.save = next) });
const bal = (userId: string, id = 'iron') => ({ ...m.store.materials.row(userId, id) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  localStorage.clear();
  setItemAuthority('server');
  m = makeMarket();
  for (const u of [USER_A, USER_B]) m.link(u);
});
afterEach(() => {
  vi.useRealTimers();
  setItemAuthority('local');
});

describe('what can be put on the market', () => {
  it('the tradeable stacks of the bag, each capped at the most one lot may hold', () => {
    const s: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, iron: 30_000, copper: 9 }, tradeableMaterials: { iron: 20_000, copper: 4 } };
    expect(sellableLots(s)).toEqual([
      { materialId: 'iron', stack: 20_000, max: MARKET_RULES.maxMaterialQtyPerListing },
      { materialId: 'copper', stack: 4, max: 4 },
    ]);
    expect(sellableLots(defaultSave())).toEqual([]);
  });

  it('a typed price and a quantity make a lot of 0.001 SOL to 50 SOL; anything else makes none', () => {
    expect(lotQuote('0,0025', 20)).toEqual({ unitPriceMicro: 2500, quantity: 20, totalLamports: 50_000_000 });
    expect(lotQuote('0.000001', 1000)?.totalLamports).toBe(1_000_000);
    expect(lotQuote('0.000001', 999)).toBeNull(); // under 0.001 SOL
    expect(lotQuote('0.0000001', 5)).toBeNull(); // 7 decimals
    expect(lotQuote('0', 5)).toBeNull();
    expect(lotQuote('abc', 5)).toBeNull();
    expect(lotQuote('1', 0)).toBeNull();
    expect(lotQuote('1', 1.5)).toBeNull();
    expect(lotQuote('1', MARKET_RULES.maxMaterialQtyPerListing + 1)).toBeNull();
    expect(lotQuote('5.1', 10)).toBeNull(); // 51 SOL
    expect(lotQuote('5', 10)?.totalLamports).toBe(50_000_000_000);
  });
});

describe('listing a lot', () => {
  it('the server holds the units first; then they leave the save; the bag keeps everything else', async () => {
    const a = await holder(USER_A, 'iron', 50, 10);
    const r = await listLot(deps(a), 'iron', 20, 2500);
    expect(r).toMatchObject({ ok: true });
    expect(bal(USER_A).qty).toBe(30); // escrow
    expect(tradeableOf(a.state.save, 'iron')).toBe(30);
    expect(a.state.save.materials.iron).toBe(40); // 50 + 10 normal - 20 listed
    expect(m.store.listings.size).toBe(1);
  });

  it('a refusal (not enough, no wallet...) leaves the save alone and forgets the request id', async () => {
    const a = await holder(USER_A, 'iron', 5);
    const r = await listLot(deps(a), 'iron', 6, 2500);
    expect(r).toEqual({ ok: false, reason: 'not_enough' });
    expect(a.state.save.materials.iron).toBe(5);
    expect(JSON.parse(localStorage.getItem(MINT_INTENTS_KEY) ?? '{}')).toEqual({});
  });

  it('a lost answer is retried with the SAME request id: one listing, the units move once', async () => {
    const a = await holder(USER_A, 'iron', 50);
    // the server lists but the answer never arrives
    let first = true;
    const flaky = createMarketApi(async (fn, body) => {
      const r = await m.list(body, USER_A);
      if (first && fn === 'market-list') {
        first = false;
        throw new MarketUnreachable('network');
      }
      return r;
    });
    await expect(listLot({ api: flaky, getSave: () => a.state.save, applySave: (n) => void (a.state.save = n) }, 'iron', 20, 2500)).rejects.toBeInstanceOf(MarketUnreachable);
    expect(m.store.listings.size).toBe(1);
    expect(bal(USER_A).qty).toBe(30);
    expect(tradeableOf(a.state.save, 'iron')).toBe(50); // the game did not hear back
    // the player tries again: the same lot, the same id
    const again = await listLot({ api: flaky, getSave: () => a.state.save, applySave: (n) => void (a.state.save = n) }, 'iron', 20, 2500);
    expect(again).toMatchObject({ ok: true });
    expect(m.store.listings.size).toBe(1);
    expect(bal(USER_A).qty).toBe(30);
    expect(tradeableOf(a.state.save, 'iron')).toBe(30);
  });

  it('if the stack shrank while the request was in flight, only what the bag still holds is removed', async () => {
    const a = await holder(USER_A, 'iron', 50);
    const sneaky = createMarketApi(async (fn, body) => {
      const r = await m.list(body, USER_A);
      if (fn === 'market-list') a.state.save = { ...a.state.save, materials: { ...a.state.save.materials, iron: 10 }, tradeableMaterials: { iron: 10 } }; // spent meanwhile
      return r;
    });
    await listLot({ api: sneaky, getSave: () => a.state.save, applySave: (n) => void (a.state.save = n) }, 'iron', 20, 2500);
    expect(a.state.save.materials.iron).toBe(0);
    expect(tradeableOf(a.state.save, 'iron')).toBe(0);
  });
});

describe('the whole trip: issue, list, buy, deliver, cancel', () => {
  it('no unit is created or lost, and the buyer\'s units arrive in his save once', async () => {
    const a = await holder(USER_A, 'iron', 50);
    const b = { state: { save: defaultSave() as SaveData, synced: defaultSave() as SaveData | null }, market: marketApi(USER_B), materials: materialApiFor(USER_B) };
    const ids = await listLot(deps(a), 'iron', 20, 2500);
    expect(ids).toMatchObject({ ok: true });
    const listingId = (ids as { listingId: string }).listingId;

    // B reserves and pays the whole lot in one transaction
    const reserved = await b.market.reserve(listingId);
    expect('reservation' in reserved).toBe(true);
    const res = (reserved as { reservation: { id: string; sellerAddress: string; sellerLamports: number; feeLamports: number } }).reservation;
    const signature = m.chain.sale(WALLET[USER_B], [{ to: res.sellerAddress, lamports: res.sellerLamports }, { to: FEE_ADDRESS, lamports: res.feeLamports }], {});
    const paid = await b.market.submitPayment(res.id, signature);
    expect(paid).toMatchObject({ ok: true, status: 'sold', materialId: 'iron', quantity: 20 });
    expect(bal(USER_B)).toEqual({ qty: 20, pending: 20, seq: 1 });

    // B's game collects the delivery: in memory first, acknowledged once the server holds a save that has it
    let b1 = await runSync(b.materials, () => b.state.save, (s) => (b.state.save = s), () => 'iiiiiiii', () => b.state.synced);
    expect(b1).toEqual({ status: 'ok', waiting: true });
    expect(tradeableOf(b.state.save, 'iron')).toBe(20);
    expect(bal(USER_B).pending).toBe(20);
    b.state.synced = b.state.save; // the autosave went through
    b1 = await runSync(b.materials, () => b.state.save, (s) => (b.state.save = s), () => 'jjjjjjjj', () => b.state.synced);
    expect(b1).toEqual({ status: 'ok', waiting: false });
    expect(bal(USER_B)).toEqual({ qty: 20, pending: 0, seq: 1 });
    expect(tradeableOf(b.state.save, 'iron')).toBe(20); // never twice
    expect(b.state.save.materials.iron).toBe(20);

    // conservation: what the server issued is what the two saves and the escrow hold
    expect(tradeableOf(a.state.save, 'iron') + tradeableOf(b.state.save, 'iron')).toBe(50);

    // B can sell them on right away
    const resale = await listLot(deps(b), 'iron', 20, 5000);
    expect(resale).toMatchObject({ ok: true });
    // and cancel it: the units come back as a delivery
    const back = await b.market.cancelListing((resale as { listingId: string }).listingId);
    expect(back).toMatchObject({ ok: true, materialId: 'iron', quantity: 20 });
    expect(bal(USER_B)).toEqual({ qty: 20, pending: 20, seq: 2 });
    b.state.synced = b.state.save;
    await runSync(b.materials, () => b.state.save, (s) => (b.state.save = s), () => 'kkkkkkkk', () => b.state.synced);
    expect(tradeableOf(b.state.save, 'iron')).toBe(20);
    b.state.synced = b.state.save;
    await runSync(b.materials, () => b.state.save, (s) => (b.state.save = s), () => 'llllllll', () => b.state.synced);
    expect(bal(USER_B)).toEqual({ qty: 20, pending: 0, seq: 2 });
    expect(totalTradeable(b.state.save)).toBe(20);
  });

  it('a unit that is still arriving (pending) cannot be listed, even by a game that thinks it has it', async () => {
    await m.store.materials.credit({ userId: USER_B, requestId: 'seed:iron:bbbb', credits: { iron: 0 } });
    m.store.materials.deliver(USER_B, 'iron', 8); // bought, not collected yet
    const cheater: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, iron: 8 }, tradeableMaterials: { iron: 8 } };
    const p = { state: { save: cheater }, market: marketApi(USER_B) };
    const r = await listLot(deps(p), 'iron', 8, 2500);
    expect(r).toEqual({ ok: false, reason: 'not_enough' });
    expect(bal(USER_B)).toEqual({ qty: 8, pending: 8, seq: 1 });
    // ... and the reconcile of such a save gives the units back to the account's delivery: the stack cannot exceed the balance, and a stack that equals it counts the pending as already held
    const sync = await runSync(materialApiFor(USER_B), () => p.state.save, (s) => (p.state.save = s));
    expect(sync.status).toBe('ok');
    expect(listTradeable(p.state.save)).toEqual([{ id: 'iron', qty: 8 }]);
    expect(bal(USER_B).pending).toBe(0);
  });

  it('with the server down, listing is refused and nothing leaves the save', async () => {
    const a = await holder(USER_A, 'iron', 50);
    const down = createMarketApi(async () => {
      throw new MarketUnreachable('network');
    });
    await expect(listLot({ api: down, getSave: () => a.state.save, applySave: (n) => void (a.state.save = n) }, 'iron', 20, 2500)).rejects.toBeInstanceOf(MarketUnreachable);
    expect(a.state.save.materials.iron).toBe(50);
    expect(m.store.listings.size).toBe(0);
    void ItemServerUnreachable;
  });
});
