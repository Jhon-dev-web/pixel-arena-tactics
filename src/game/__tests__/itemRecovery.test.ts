import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { certificatesToBurnOnDiscard, certifiedPouchIds, pouchCost, uncertifiedPouchCount } from '../goldPouch';
import { setItemAuthority } from '../itemAuthority';
import { clearCertificates } from '../itemCerts';
import { createPouchAction, discardPouchAction, forgeAction } from '../itemActions';
import { ItemApi, createItemApi } from '../itemServer';
import { MINT_INTENT_MAX_AGE_MS, MINT_INTENTS_KEY, clearIntent, intentRequestId } from '../mintIntents';
import { emptyMaterials } from '../materials';
import { recipeStock } from './recipeStock';
import { DAY, makeServer } from '../../../supabase/functions/_shared/__tests__/fakeItemStore';

// The two gaps the foundation round left open (docs/MARKET_FOUNDATION.md): a lost forge / pouch answer used to leave an orphan certificate, and throwing a certified pouch away from the
// stack menu left its certificate held. Both are closed here, against the same in-memory server the other item tests use.

const OLD_ACCOUNT = Date.UTC(2026, 3, 1);
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

function setup() {
  const server = makeServer({ rng: seeded(7) });
  server.store.accountCreatedMs = OLD_ACCOUNT;
  let lose = 0; // answers to drop AFTER the server committed (the response is lost on the way back)
  let down = false;
  const api: ItemApi = createItemApi(
    async (fn, body) => {
      if (down) throw new Error('offline');
      const r = fn === 'mint-item' ? await server.mint(body) : await server.bind(body);
      if (lose > 0) {
        lose--;
        throw new Error('response lost');
      }
      return { status: r.status, body: r.body };
    },
    { retries: 1, sleep: async () => undefined },
  );
  return { server, api, loseNext: (n: number) => (lose = n), goDown: () => (down = true), comeBack: () => (down = false) };
}

let current: SaveData;
const getSave = () => current;
const richForge = (): SaveData => ({ ...defaultSave(), gold: 1e7, shards: 50, materials: { ...emptyMaterials(), ...recipeStock('bronze_dagger', 3) } as SaveData['materials'] });

beforeEach(() => {
  localStorage.removeItem(MINT_INTENTS_KEY);
  clearCertificates();
  setItemAuthority('server');
});
afterEach(() => {
  setItemAuthority('local');
  clearCertificates();
  localStorage.removeItem(MINT_INTENTS_KEY);
});

describe('mint intents: the request id of an unfinished action', () => {
  const mem = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  };
  let n = 0;
  const make = () => `id-${++n}-xxxxxxxx`;

  it('hands back the same id until the action is cleared, then a new one', () => {
    const storage = mem();
    const a = intentRequestId('forge:x', make, 1000, storage);
    expect(intentRequestId('forge:x', make, 2000, storage)).toBe(a);
    expect(intentRequestId('forge:y', make, 2000, storage)).not.toBe(a);
    clearIntent('forge:x', 3000, storage);
    expect(intentRequestId('forge:x', make, 4000, storage)).not.toBe(a);
  });

  it('forgets an intent after a day, ignores a corrupt book, and survives a blocked storage', () => {
    const storage = mem();
    const a = intentRequestId('k', make, 0, storage);
    expect(intentRequestId('k', make, MINT_INTENT_MAX_AGE_MS, storage)).toBe(a);
    expect(intentRequestId('k', make, MINT_INTENT_MAX_AGE_MS + 1, storage)).not.toBe(a);
    storage.setItem(MINT_INTENTS_KEY, '{nope');
    expect(typeof intentRequestId('k', make, 5, storage)).toBe('string');
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(typeof intentRequestId('k', make, 5, broken)).toBe('string');
    expect(typeof intentRequestId('k', make, 5, null)).toBe('string');
  });

  it('keeps only the newest intents', () => {
    const storage = mem();
    for (let i = 0; i < 30; i++) intentRequestId(`k${i}`, make, 1000 + i, storage);
    expect(Object.keys(JSON.parse(storage.getItem(MINT_INTENTS_KEY) as string))).toHaveLength(20);
  });
});

describe('a lost forge answer is fetched again with the same request id: no orphan, no second roll', () => {
  it('the server committed, the answer never arrived: the next try returns the SAME piece and there is one certificate', async () => {
    const { api, server, loseNext } = setup();
    current = richForge();
    loseNext(2); // the call and its one automatic retry both lose their answer
    const first = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(first).toEqual({ ok: false, blocked: 'unreachable' });
    expect(current.gearInstances).toEqual(defaultSave().gearInstances); // nothing was applied
    const mintedBefore = server.store.requests.size;
    expect(mintedBefore).toBe(1); // the server did roll it
    const certsBefore = server.store.certs.length;

    const second = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(second.ok).toBe(true);
    expect(server.store.requests.size).toBe(1); // the same request: replayed, not rolled again
    expect(server.store.certs.length).toBe(certsBefore);
    const inst = (second as { instance: { rarity: string; certificateId?: string } }).instance;
    if (certsBefore > 0) expect(inst.certificateId).toBe(server.store.certs[0].id);
    // and the intent is finished: the NEXT forge is a new request
    current = (second as { save: SaveData }).save;
    current = { ...current, gold: 1e7, materials: { ...emptyMaterials(), ...recipeStock('bronze_dagger', 3) } as SaveData['materials'] };
    await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(server.store.requests.size).toBe(2);
  });

  it('survives a reload: the remembered id is in storage, so a second api (a new page) gets the same result', async () => {
    const a = setup();
    current = richForge();
    a.loseNext(2);
    await forgeAction(a.api, getSave, 'bronze_dagger', { level: 1 });
    expect(JSON.parse(localStorage.getItem(MINT_INTENTS_KEY) as string)).toBeTruthy();
    // "a new page": a fresh api over the SAME server and the same storage
    const sameServer: ItemApi = createItemApi(async (fn, body) => {
      const r = fn === 'mint-item' ? await a.server.mint(body) : await a.server.bind(body);
      return { status: r.status, body: r.body };
    });
    const again = await forgeAction(sameServer, getSave, 'bronze_dagger', { level: 1 });
    expect(again.ok).toBe(true);
    expect(a.server.store.requests.size).toBe(1);
  });

  it('a final refusal forgets the id (nothing was stored, so the next try is a new request)', async () => {
    const { api, server } = setup();
    server.store.accountCreatedMs = server.store.nowMs - DAY; // 10,000 Gold of income at most: a Large pouch is refused
    current = { ...defaultSave(), gold: 1_000_000 };
    const refused = await createPouchAction(api, getSave, 'gold_pouch_l', Date.now());
    expect(refused).toMatchObject({ ok: false, blocked: 'refused' });
    expect(localStorage.getItem(MINT_INTENTS_KEY)).toBe('{}');
  });
});

describe('a lost pouch answer is fetched again: one pouch, one certificate', () => {
  it('the retry returns the stored pouch instead of minting a second one, and the Gold is spent once', async () => {
    const { api, server, loseNext } = setup();
    server.store.accountCreatedMs = server.store.nowMs - 60 * DAY;
    current = { ...defaultSave(), gold: 100_000, inventoryCapacity: 50 };
    loseNext(2);
    expect(await createPouchAction(api, getSave, 'gold_pouch_s', Date.now())).toEqual({ ok: false, blocked: 'unreachable' });
    expect(server.store.certs).toHaveLength(1); // the orphan the old code left behind
    const made = await createPouchAction(api, getSave, 'gold_pouch_s', Date.now());
    expect(made.ok).toBe(true);
    expect(server.store.certs).toHaveLength(1); // still ONE: it was replayed
    current = (made as { save: SaveData }).save;
    expect(certifiedPouchIds(current, 'gold_pouch_s')).toEqual([server.store.certs[0].id]);
    expect(current.gold).toBe(100_000 - pouchCost('gold_pouch_s', false)); // face + the fee, charged ONCE
  });
});

describe('discarding a certified pouch from the stack menu burns its certificate', () => {
  async function withPouches(certified: number, uncertified: number) {
    const ctx = setup();
    ctx.server.store.accountCreatedMs = ctx.server.store.nowMs - 60 * DAY;
    current = { ...defaultSave(), gold: 1e7, inventoryCapacity: 50 };
    for (let i = 0; i < certified; i++) {
      const r = await createPouchAction(ctx.api, getSave, 'gold_pouch_s', Date.now() + i);
      expect(r.ok).toBe(true);
      current = (r as { save: SaveData }).save;
      current = { ...current, pouchDay: undefined as never };
    }
    current = { ...current, consumables: { ...current.consumables, gold_pouch_s: certified + uncertified } };
    return ctx;
  }

  it('throwing one away burns the last certificate, takes it out of the save, and the count drops', async () => {
    const { api, server } = await withPouches(2, 0);
    const [first, second] = certifiedPouchIds(current, 'gold_pouch_s');
    expect(certificatesToBurnOnDiscard(current, 'gold_pouch_s', 1)).toEqual([second]);
    const r = await discardPouchAction(api, getSave, 'gold_pouch_s', 1);
    expect(r.ok).toBe(true);
    const next = (r as { save: SaveData }).save;
    expect(next.consumables.gold_pouch_s).toBe(1);
    expect(certifiedPouchIds(next, 'gold_pouch_s')).toEqual([first]);
    expect(server.store.certs.find((c) => c.id === second)?.status).toBe('burned');
    expect(server.store.certs.find((c) => c.id === first)?.status).toBe('held');
  });

  it('uncertified pouches go first; "all" burns every certificate', async () => {
    const { api, server } = await withPouches(2, 1);
    expect(uncertifiedPouchCount(current, 'gold_pouch_s')).toBe(1);
    expect(certificatesToBurnOnDiscard(current, 'gold_pouch_s', 1)).toEqual([]); // the uncertified one is thrown first
    const one = await discardPouchAction(api, getSave, 'gold_pouch_s', 1);
    expect(one.ok).toBe(true);
    current = (one as { save: SaveData }).save;
    expect(server.store.certs.every((c) => c.status === 'held')).toBe(true);
    const all = await discardPouchAction(api, getSave, 'gold_pouch_s', 'all');
    expect(all.ok).toBe(true);
    current = (all as { save: SaveData }).save;
    expect(server.store.certs.every((c) => c.status === 'burned')).toBe(true);
    expect(current.consumables.gold_pouch_s ?? 0).toBe(0);
    expect(current.pouchCerts?.gold_pouch_s).toBeUndefined();
  });

  it('the server unreachable: nothing is thrown away, the certificate stays held', async () => {
    const { api, server, goDown } = await withPouches(1, 0);
    goDown();
    const r = await discardPouchAction(api, getSave, 'gold_pouch_s', 1);
    expect(r).toEqual({ ok: false, blocked: 'unreachable' });
    expect(current.consumables.gold_pouch_s).toBe(1);
    expect(server.store.certs[0].status).toBe('held');
  });

  it('a pouch that is not in the bag cannot be discarded, and an offline (device) build burns nothing', async () => {
    const { api } = setup();
    current = { ...defaultSave() };
    expect(await discardPouchAction(api, getSave, 'gold_pouch_s', 1)).toEqual({ ok: false, blocked: 'game' });
    setItemAuthority('local');
    current = { ...defaultSave(), consumables: { ...defaultSave().consumables, gold_pouch_s: 3 } };
    const r = await discardPouchAction(api, getSave, 'gold_pouch_s', 2);
    expect(r.ok).toBe(true);
    expect((r as { save: SaveData }).save.consumables.gold_pouch_s).toBe(1);
  });
});
