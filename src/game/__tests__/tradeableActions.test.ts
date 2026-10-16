import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHuntSession, defaultSave, normalizeSave, SaveData } from '../engine';
import { applyHuntClaim, applyHuntStop } from '../huntLifecycle';
import { applyClaimGathering } from '../gathering';
import { applyHarvest } from '../gardenActions';
import { setItemAuthority } from '../itemAuthority';
import { ItemServerUnreachable } from '../itemServer';
import { MaterialApi, createMaterialApi } from '../materialServer';
import { flushBurns, planSync, resolveNextClaim, runSync } from '../tradeableActions';
import { isTradeableReachable, setTradeableReachable } from '../tradeableStatus';
import { gateTradeableUse, reconcileTradeable, tradeableOf, materialPrefs, withMaterialPrefs, listTradeable } from '../tradeableMaterials';
import { USER_A, makeMaterialServer } from '../../../supabase/functions/_shared/__tests__/fakeMaterialStore';
import { MATERIAL_BOUNDS } from '../../../supabase/functions/_shared/materials/bounds';

// The web build's tradeable-material flow from the claim reducers to the server and back, with the REAL handlers behind a fake api: a claim queues a report, the server rolls, the game marks the
// units; spending queues a burn; the balance and the save are reconciled. No browser, no network.

const HOUR = 3600 * 1000;
const START = new Date('2026-10-16T08:00:00Z').getTime();

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Server = ReturnType<typeof makeMaterialServer>;

/** The api of the game over the real handlers. `down` makes every call fail like a dead network. */
function apiFor(server: Server, state: { down: boolean; calls: number } = { down: false, calls: 0 }): MaterialApi {
  return createMaterialApi(
    async (fn, body) => {
      state.calls++;
      if (state.down) throw new ItemServerUnreachable('network');
      const r = fn === 'material-claim' ? await server.claim(body) : await server.sync(body);
      return { status: r.status, body: r.body };
    },
    { retries: 0, sleep: async () => undefined },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  setItemAuthority('server');
  setTradeableReachable(true);
});
afterEach(() => {
  vi.useRealTimers();
  setItemAuthority('local');
  setTradeableReachable(true);
});

/** A hero that has just finished a 5 h hunt in the Glade (the reward waits to be claimed). */
function huntedSave(): SaveData {
  const s0 = { ...defaultSave(), huntingOfflineStart: START - 5 * HOUR };
  const hunting: SaveData = { ...s0, activeHuntingZone: 'demon_glade', activeHuntingDepth: 'shallow', huntSession: buildHuntSession(s0, START - 5 * HOUR) };
  const stopped = applyHuntStop(hunting, START)!;
  const rolled = stopped.pendingHuntReward!;
  // (the server rolls the uniques of a web reward: that part is mint-item's, not this test's)
  const { uniqueRoll: _u, ...rest } = rolled;
  void _u;
  return { ...stopped, pendingHuntReward: { ...rest, drops: { leather_scrap: 120, demon_claw: 40, demon_core: 6 }, uniques: [] } };
}

describe('a claim queues a report, only in the web build', () => {
  it('Hunting: the units that went into the bag are reported (and the claim itself pays exactly as before)', () => {
    const s = huntedSave();
    const claimed = applyHuntClaim(s, s.pendingHuntReward!.id)!;
    expect(claimed.materialClaims).toHaveLength(1);
    const c = claimed.materialClaims![0];
    expect(c).toMatchObject({ activity: 'hunt', place: 'demon_glade', durationMs: s.pendingHuntReward!.pendingMs });
    expect(c.units).toEqual({ leather_scrap: 120, demon_claw: 40, demon_core: 6 });
    expect(claimed.materials.leather_scrap).toBe(120);
    setItemAuthority('local');
    const offline = applyHuntClaim(s, s.pendingHuntReward!.id)!;
    expect(offline.materialClaims).toBeUndefined();
    expect({ ...offline, materialClaims: undefined }).toEqual({ ...claimed, materialClaims: undefined });
  });

  it('Mining and Woodcutting: the tier\'s units, over the session time; the by-products are not reported', () => {
    const base = defaultSave();
    const s: SaveData = { ...base, activeOreId: 'copper', lastMiningClaim: START - 4 * HOUR, miningPass: { active: false, capHours: 6 } };
    const claim = applyClaimGathering(s, 'mining', START)!;
    expect(claim.save.materialClaims).toHaveLength(1);
    expect(claim.save.materialClaims![0]).toMatchObject({ activity: 'mining', place: 'copper', durationMs: 4 * HOUR });
    expect(Object.keys(claim.save.materialClaims![0].units)).toEqual(['copper']);
    setItemAuthority('local');
    expect(applyClaimGathering(s, 'mining', START)!.save.materialClaims).toBeUndefined();
  });

  it('Garden: what was harvested, with the growth time of the plants added up', () => {
    const base = defaultSave();
    const gardenSlots = base.gardenSlots.map((slot, i) => (i < 2 ? { plantId: 'common_herb' as const, startedAt: START - 3 * HOUR, lastPlantId: 'common_herb' as const, fertilized: false } : slot));
    const res = applyHarvest({ ...base, gardenSlots }, [0, 1], START)!;
    expect(res.save.materialClaims).toHaveLength(1);
    expect(res.save.materialClaims![0]).toMatchObject({ activity: 'garden', durationMs: 2 * 2 * HOUR });
    expect(res.save.materialClaims![0].units).toEqual({ common_herb: 4 });
  });
});

describe('the server rolls, the game marks the units', () => {
  it('end to end: the report is sent, the server\'s answer is applied, the report leaves the queue and the balance matches the stack', async () => {
    const server = makeMaterialServer({ rng: lcg(5) });
    const api = apiFor(server);
    let save = huntedSave();
    save = applyHuntClaim(save, save.pendingHuntReward!.id)!;
    const total = { ...save.materials };
    const step = await resolveNextClaim(api, () => save);
    expect(step.status).toBe('applied');
    save = step.save!;
    expect(save.materialClaims).toBeUndefined();
    expect(save.materials).toEqual(total); // the totals never change: tradeable units are the same material
    const stack = Object.fromEntries(listTradeable(save).map((x) => [x.id, x.qty]));
    expect(step.found).toEqual(stack);
    const balances = await server.store.balances(USER_A);
    for (const [id, qty] of Object.entries(stack)) expect(balances[id].qty).toBe(qty);
    expect(Object.values(stack).reduce((a, n) => a + n, 0)).toBeGreaterThan(0);
  });

  it('the stack can never be larger than the server gave: marking is bounded by the answer and by the units the bag holds', async () => {
    const server = makeMaterialServer({ rng: () => 0 }); // every unit rolls tradeable, so the daily cap decides
    const api = apiFor(server);
    let save = huntedSave();
    save = applyHuntClaim(save, save.pendingHuntReward!.id)!;
    save = (await resolveNextClaim(api, () => save)).save!;
    for (const x of listTradeable(save)) {
      expect(x.qty).toBeLessThanOrEqual(MATERIAL_BOUNDS.dailyCap(x.id));
      expect(x.qty).toBeLessThanOrEqual(save.materials[x.id]);
    }
  });

  it('a server that is down leaves the report queued, marks nothing, and the game then refuses to spend tradeable units', async () => {
    const server = makeMaterialServer({ rng: lcg(5) });
    const down = { down: true, calls: 0 };
    const api = apiFor(server, down);
    let save = huntedSave();
    save = applyHuntClaim(save, save.pendingHuntReward!.id)!;
    const step = await resolveNextClaim(api, () => save);
    expect(step.status).toBe('unreachable');
    expect(isTradeableReachable()).toBe(false);
    expect(save.materialClaims).toHaveLength(1);
    expect(save.tradeableMaterials).toBeUndefined();
    expect(gateTradeableUse({ iron: 2 }, { server: true, reachable: isTradeableReachable(), acked: true, npc: false })).toBe('blocked');
    // it comes back: the same report is sent with the SAME request id and the roll happens once
    down.down = false;
    const again = await resolveNextClaim(api, () => save);
    expect(again.status).toBe('applied');
    expect(isTradeableReachable()).toBe(true);
    expect(server.store.requestsFor(USER_A)).toBe(1);
  });

  it('a refusal is final: the units stay normal and the report is dropped', async () => {
    const server = makeMaterialServer({ rng: () => 0 });
    server.store.items.accountCreatedMs = server.store.nowMs - 86_400_000; // a day old: the Blood Abyss is out of reach
    const api = apiFor(server);
    let save: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, bone_fragment: 20 } };
    save = { ...save, materialClaims: [{ id: 'h:abyss:1:20', activity: 'hunt', place: 'blood_abyss', durationMs: HOUR, units: { bone_fragment: 20 }, at: START }] };
    const step = await resolveNextClaim(api, () => save);
    expect(step.status).toBe('dropped');
    expect(step.save!.materialClaims).toBeUndefined();
    expect(step.save!.tradeableMaterials).toBeUndefined();
    expect(step.save!.materials.bone_fragment).toBe(20);
  });

  it('a report survives a reload (it is part of the save) and a damaged one is dropped on load', () => {
    const s = applyHuntClaim(huntedSave(), huntedSave().pendingHuntReward!.id)!;
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.materialClaims).toEqual(s.materialClaims);
    const bad = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    (bad.materialClaims as Record<string, unknown>[])[0].activity = 'fishing';
    expect(normalizeSave(bad).materialClaims).toBeUndefined();
  });
});

describe('the burn', () => {
  const holding = async (): Promise<{ server: Server; save: SaveData }> => {
    const server = makeMaterialServer({ rng: () => 0 });
    await server.store.credit({ userId: USER_A, requestId: 'seed:iron:aaaa', credits: { iron: 8 } });
    return { server, save: { ...defaultSave(), materials: { ...defaultSave().materials, iron: 30 }, tradeableMaterials: { iron: 8 } } };
  };

  it('spending tradeable units queues a burn; the batch is sent, answered once and leaves the save', async () => {
    const { server, save: s0 } = await holding();
    const spent = reconcileTradeable(s0, { ...s0, materials: { ...s0.materials, iron: 5 } }); // 30 -> 5: 22 normal + 3 tradeable
    expect(spent.used).toEqual({ iron: 3 });
    expect(spent.save.tradeableBurns).toEqual({ iron: 3 });
    let save = spent.save;
    const out = await flushBurns(apiFor(server), () => save, (s) => (save = s), () => 'aaaaaaaa');
    expect(out).toBe('ok');
    expect(save.tradeableBurns).toBeUndefined();
    expect(save.tradeableBurning).toBeUndefined();
    expect(server.store.qty(USER_A, 'iron')).toBe(5);
  });

  it('a lost answer is retried with the SAME request id: the server burns once', async () => {
    const { server, save: s0 } = await holding();
    let save = reconcileTradeable(s0, { ...s0, materials: { ...s0.materials, iron: 5 } }).save;
    // the server applies the burn but the answer never arrives
    const lost = createMaterialApi(
      async (fn, body) => {
        await server.sync(body);
        throw new ItemServerUnreachable('network');
        void fn;
      },
      { retries: 0, sleep: async () => undefined },
    );
    expect(await flushBurns(lost, () => save, (s) => (save = s), () => 'bbbbbbbb')).toBe('unreachable');
    expect(save.tradeableBurning).toEqual({ id: 'burn:bbbbbbbb', units: { iron: 3 } });
    expect(server.store.qty(USER_A, 'iron')).toBe(5);
    // meanwhile the player spends more: it queues behind the batch in flight
    save = reconcileTradeable(save, { ...save, materials: { ...save.materials, iron: 2 } }).save;
    expect(save.tradeableBurns).toEqual({ iron: 3 }); // 5 -> 2: 22 normal were gone, so the 3 more are tradeable
    // the retry reuses the batch id, so the first 3 are not burned again; then the second batch goes
    expect(await flushBurns(apiFor(server), () => save, (s) => (save = s), () => 'cccccccc')).toBe('ok');
    expect(server.store.qty(USER_A, 'iron')).toBe(2);
    expect(save.tradeableBurns).toBeUndefined();
  });
});

describe('reconcile with the balance', () => {
  it('the tradeable stack can never exceed the balance: the excess becomes normal units (the total does not change)', () => {
    const s: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, iron: 50, copper: 9 }, tradeableMaterials: { iron: 30, copper: 9 } };
    const plan = planSync(s, { iron: { qty: 12, pending: 0, seq: 0 } });
    expect(plan.save.tradeableMaterials).toEqual({ iron: 12 });
    expect(plan.save.materials.iron).toBe(50);
    expect(plan.save.materials.copper).toBe(9);
    expect(tradeableOf(plan.save, 'copper')).toBe(0); // no balance at all
    expect(plan.ack).toEqual({});
  });

  it('a save edited to hold tradeable units the server never issued is clamped to nothing', () => {
    const forged: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, obsidian: 500 }, tradeableMaterials: { obsidian: 500 } };
    const plan = planSync(forged, {});
    expect(plan.save.tradeableMaterials).toBeUndefined();
    expect(plan.save.materials.obsidian).toBe(500); // still usable as normal units, like anything in a client save
  });

  it('units the server delivered are added to the save, once, and acknowledged', () => {
    const s: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, iron: 5 }, tradeableMaterials: { iron: 5 } };
    const plan = planSync(s, { iron: { qty: 12, pending: 7, seq: 2 } });
    expect(tradeableOf(plan.save, 'iron')).toBe(12);
    expect(plan.save.materials.iron).toBe(12);
    expect(plan.ack).toEqual({ iron: 7 });
    // the acknowledgement was lost: next time the server still says pending 7, but the stack already holds them: nothing is added again, and the 7 are acknowledged
    const again = planSync(plan.save, { iron: { qty: 12, pending: 7, seq: 2 } });
    expect(tradeableOf(again.save, 'iron')).toBe(12);
    expect(again.save.materials.iron).toBe(12);
    expect(again.ack).toEqual({ iron: 7 });
    expect(again.ackKey).toBe(plan.ackKey); // the same delivery has the same request id
    // a newer delivery has another one
    expect(planSync(s, { iron: { qty: 12, pending: 7, seq: 3 } }).ackKey).not.toBe(plan.ackKey);
  });

  it('a bag with no room keeps the rest pending (it is not lost, and it is not acknowledged)', () => {
    const base = defaultSave();
    let s: SaveData = { ...base, materials: { ...base.materials, iron: 1 }, tradeableMaterials: { iron: 1 } };
    // fill every other slot of the bag
    for (const id of ['copper', 'silver', 'gold_ore', 'obsidian', 'leather_scrap', 'demon_claw', 'demon_core', 'bone_fragment', 'concentrated_blood', 'corrupted_crystal', 'rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart', 'common_herb', 'energy_herb', 'uncommon_root', 'crimson_mushroom', 'rare_flower', 'iron_thistle', 'gold_blossom', 'swift_grass', 'moon_lily', 'silver_sage'] as const) {
      s = { ...s, materials: { ...s.materials, [id]: 99 } };
    }
    const plan = planSync(s, { iron: { qty: 1 + 500, pending: 500, seq: 1 } });
    const got = tradeableOf(plan.save, 'iron') - 1;
    expect(got).toBeLessThan(500);
    expect(plan.ack.iron ?? 0).toBe(got); // only what went in is acknowledged
  });

  it('on load the whole thing runs against the server: burns first, then the balance, then the acknowledgement', async () => {
    const server = makeMaterialServer({ rng: () => 0.9 });
    server.store.deliver(USER_A, 'iron', 4); // a purchase: qty 4, pending 4
    await server.store.credit({ userId: USER_A, requestId: 'seed:copper:aaaa', credits: { copper: 6 } });
    let save: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, copper: 10, silver: 3 }, tradeableMaterials: { copper: 10, silver: 3 }, tradeableBurns: { copper: 1 } };
    const out = await runSync(apiFor(server), () => save, (s) => (save = s), () => 'dddddddd');
    expect(out).toBe('ok');
    // the burn of 1 copper went first: the balance is 5, so the stack (10) is cut to 5; silver has no balance; the 4 delivered iron came in
    expect(server.store.qty(USER_A, 'copper')).toBe(5);
    expect(save.tradeableMaterials).toEqual({ copper: 5, iron: 4 });
    expect(save.materials.iron).toBe(4);
    expect(save.tradeableBurns).toBeUndefined();
    expect((await server.store.balances(USER_A)).iron.pending).toBe(0);
  });

  it('with the server down nothing changes (the stack is not touched without a balance to compare with)', async () => {
    const server = makeMaterialServer();
    const save: SaveData = { ...defaultSave(), materials: { ...defaultSave().materials, iron: 5 }, tradeableMaterials: { iron: 5 } };
    let current = save;
    const out = await runSync(apiFor(server, { down: true, calls: 0 }), () => current, (s) => (current = s));
    expect(out).toBe('unreachable');
    expect(current).toBe(save);
  });
});

describe('preferences', () => {
  it('default to normal units first and not yet asked; the setting is kept in the save and survives a load', () => {
    expect(materialPrefs(defaultSave())).toEqual({ useTradeableFirst: false, useAcked: false });
    const s = withMaterialPrefs(defaultSave(), { useTradeableFirst: true, useAcked: true });
    expect(normalizeSave(JSON.parse(JSON.stringify(s))).materialPrefs).toEqual({ useTradeableFirst: true, useAcked: true });
  });
});
