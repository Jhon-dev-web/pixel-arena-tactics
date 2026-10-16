import { describe, expect, it } from 'vitest';
import { DAY, USER_A, USER_B } from './fakeItemStore.ts';
import { FakeMaterialStore, makeMaterialServer } from './fakeMaterialStore.ts';
import { MATERIAL_BOUNDS, dayBucket } from '../materials/bounds.ts';
import { parseClaimBody, parseUnits, rollTradeable } from '../materials/handler.ts';
import { CLASS_RATE, HONEST_PEAK_DAY_UNITS, TRADEABLE_CHANCE } from '../materials/rates.ts';
import { GARDEN_TABLE, HUNT_CEILING, MATERIAL_CLASS, MATERIAL_IDS } from '../materials/tables.ts';

// material-claim and material-sync (docs/MARKET_FOUNDATION.md "Materiais negociaveis"): the SERVER creates tradeable units. These tests run the real handlers over an in-memory store that follows
// migration 0015, with scripted dice.

const NEVER = () => 0.999; // no unit is tradeable
const ALWAYS = () => 0; // every unit is tradeable
const HOUR = 3600_000;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mining = (requestId: string, units: Record<string, number>, hours = 3, place = 'iron') => ({ requestId, activity: 'mining', place, durationMs: hours * HOUR, units });

describe('what a claim body may be', () => {
  it('needs a request id, a known activity, a place, a duration and at least one eligible material', () => {
    const ok = { requestId: 'mine:iron:1:2', activity: 'mining', place: 'iron', durationMs: 1000, units: { iron: 5 } };
    expect(parseClaimBody(ok)).not.toBeNull();
    for (const bad of [
      { ...ok, requestId: 'short' },
      { ...ok, requestId: 'has space in it' },
      { ...ok, activity: 'fishing' },
      { ...ok, place: 5 },
      { ...ok, durationMs: -1 },
      { ...ok, durationMs: Number.NaN },
      { ...ok, units: {} },
      { ...ok, units: { copper_bar: 5 } }, // not a material that can be tradeable
      { ...ok, units: 'iron' },
    ]) {
      expect(parseClaimBody(bad as Record<string, unknown>), JSON.stringify(bad)).toBeNull();
    }
  });

  it('units are whole, positive and eligible; anything else is dropped, and an oversized report is cut', () => {
    expect(parseUnits({ iron: 5.9, copper: -3, silver: 'x', copper_bar: 9, Bad: 1, gold_ore: 0 }, 100)).toEqual({ iron: 5 });
    expect(parseUnits({ iron: 1e9 }, 100)).toEqual({ iron: 100 });
    expect(parseUnits([1, 2], 100)).toBeNull();
  });
});

describe('the server rolls, the client never supplies the outcome', () => {
  it('a claim answers with the units the SERVER found tradeable and credits the balance with exactly that', async () => {
    const s = makeMaterialServer({ rng: lcg(7) });
    const r = await s.claim(mining('mine:iron:a:b', { iron: 400 }));
    expect(r.status).toBe(200);
    const got = (r.body.tradeable as Record<string, number>).iron ?? 0;
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThan(40); // 1% of 400 is 4; well under the daily cap of iron
    expect(s.store.qty(USER_A, 'iron')).toBe(got);
    expect(s.rngCalls()).toBe(400); // one die per eligible unit
  });

  it('nothing in the request can make units tradeable: fields that name an outcome are ignored', async () => {
    const s = makeMaterialServer({ rng: NEVER });
    const body = { ...mining('mine:iron:a:c', { iron: 50 }), tradeable: { iron: 999 }, granted: { iron: 999 }, qty: 999, userId: USER_B };
    const r = await s.claim(body);
    expect(r.status).toBe(200);
    expect(r.body.tradeable).toEqual({});
    expect(s.store.qty(USER_A, 'iron')).toBe(0);
    expect(s.store.qty(USER_B, 'iron')).toBe(0);
  });

  it('a request needs a signed-in account: no token, no roll', async () => {
    const s = makeMaterialServer({ rng: ALWAYS });
    const r = await s.claim(mining('mine:iron:a:d', { iron: 50 }), null);
    expect(r.status).toBe(401);
    expect(s.rngCalls()).toBe(0);
    expect(s.store.balancesByUser.size).toBe(0);
  });

  it('the same request id gets the same answer and never a second roll', async () => {
    const s = makeMaterialServer({ rng: lcg(3) });
    const first = await s.claim(mining('mine:iron:a:e', { iron: 400 }));
    const calls = s.rngCalls();
    const qty = s.store.qty(USER_A, 'iron');
    const again = await s.claim(mining('mine:iron:a:e', { iron: 400 }));
    expect(again.body).toEqual(first.body);
    expect(s.rngCalls()).toBe(calls);
    expect(s.store.qty(USER_A, 'iron')).toBe(qty);
    // the same request id of ANOTHER account is another request
    const other = await s.claim(mining('mine:iron:a:e', { iron: 400 }), USER_B);
    expect(other.status).toBe(200);
    expect(s.store.requestsFor(USER_B)).toBe(1);
  });

  it('the chance of a unit is the chance of its material: about 1% / 2% / 3% of the units over many claims', async () => {
    for (const [id, chance] of [['iron', 0.01], ['silver', 0.02], ['obsidian', 0.03]] as const) {
      const rng = lcg(11);
      let k = 0;
      const n = 200_000;
      k += rollTradeable(n, TRADEABLE_CHANCE[id], rng);
      expect(TRADEABLE_CHANCE[id]).toBe(chance);
      expect(k / n, id).toBeGreaterThan(chance * 0.93);
      expect(k / n, id).toBeLessThan(chance * 1.07);
    }
  });
});

describe('plausibility: time and units', () => {
  it('a claim is paid for the time the server clock allows: a long report is cut to the hero bucket (10 h)', async () => {
    const s = makeMaterialServer({ rng: ALWAYS });
    const r = await s.claim(mining('mine:iron:long:1', { iron: 100_000 }, 100));
    expect(r.status).toBe(200);
    // 10 h of the best build: at most gatherUnitsPerHour x 10 units were eligible, and ALL are tradeable with these dice, so the daily cap is what stops it
    expect(s.store.qty(USER_A, 'iron')).toBe(MATERIAL_BOUNDS.dailyCap('iron'));
    expect(s.rngCalls()).toBe(Math.ceil(MATERIAL_BOUNDS.gatherUnitsPerHour * 10));
  });

  it('a second claim right after, with no server time in between, has no hero time left: nothing is eligible and the account is flagged', async () => {
    const s = makeMaterialServer({ rng: ALWAYS });
    await s.claim(mining('mine:iron:t:1', { iron: 100_000 }, 10));
    const calls = s.rngCalls();
    const r = await s.claim(mining('mine:iron:t:2', { iron: 500 }, 5));
    expect(r.status).toBe(200);
    expect(r.body.tradeable).toEqual({});
    expect(s.rngCalls()).toBe(calls);
    expect(s.store.flags.some((f) => f.code === 'MATERIAL_TIME_EXCESS')).toBe(true);
  });

  it('after the clock moves, the hero time comes back one hour per hour', async () => {
    const s = makeMaterialServer({ rng: ALWAYS });
    await s.claim(mining('mine:iron:u:1', { iron: 100_000 }, 10));
    s.store.nowMs += 2 * HOUR;
    const calls = s.rngCalls();
    await s.claim(mining('mine:iron:u:2', { iron: 100_000 }, 10));
    expect(s.rngCalls() - calls).toBe(Math.ceil(MATERIAL_BOUNDS.gatherUnitsPerHour * 2));
  });

  it('units far beyond what the time allows are cut and flagged; a claim with zero time rolls nothing', async () => {
    const s = makeMaterialServer({ rng: NEVER });
    await s.claim(mining('mine:iron:v:1', { iron: 50_000 }, 1));
    expect(s.rngCalls()).toBe(Math.ceil(MATERIAL_BOUNDS.gatherUnitsPerHour));
    expect(s.store.flags.some((f) => f.code === 'MATERIAL_UNITS_EXCESS')).toBe(true);
    const z = await s.claim({ requestId: 'mine:iron:v:2', activity: 'mining', place: 'iron', durationMs: 0, units: { iron: 10 } });
    expect(z.status).toBe(200);
    expect(s.rngCalls()).toBe(Math.ceil(MATERIAL_BOUNDS.gatherUnitsPerHour));
  });

  it('a session produces only its own tier: another material in the report is not eligible', async () => {
    const s = makeMaterialServer({ rng: ALWAYS });
    const r = await s.claim(mining('mine:iron:w:1', { iron: 5, obsidian: 50 }, 3));
    expect(r.body.tradeable).toEqual({ iron: 5 });
    expect(s.store.flags.some((f) => f.code === 'MATERIAL_UNITS_EXCESS')).toBe(true);
  });

  it('Hunting: an unknown zone is refused; a zone this young an account cannot have reached is refused and flagged; its drops are limited by the zone ceilings', async () => {
    const s = makeMaterialServer({ rng: NEVER });
    const unknown = await s.claim({ requestId: 'hunt:x:1', activity: 'hunt', place: 'moon_base', durationMs: HOUR, units: { leather_scrap: 5 } });
    expect(unknown.status).toBe(400);
    expect(unknown.body.reason).toBe('unknown_place');

    const young = makeMaterialServer({ rng: NEVER });
    young.store.items.accountCreatedMs = young.store.nowMs - DAY; // one day old
    const early = await young.claim({ requestId: 'hunt:x:2', activity: 'hunt', place: 'blood_abyss', durationMs: HOUR, units: { bone_fragment: 5 } });
    expect(early.status).toBe(429);
    expect(early.body.reason).toBe('too_early');
    expect(young.store.flags.some((f) => f.code === 'MATERIAL_ZONE_TOO_EARLY')).toBe(true);

    const ok = await s.claim({ requestId: 'hunt:x:3', activity: 'hunt', place: 'demon_glade', durationMs: HOUR, units: { leather_scrap: 100_000, demon_claw: 100_000, bone_fragment: 4 } });
    expect(ok.status).toBe(200);
    // leather_scrap and demon_claw are limited to one hour of the zone's ceilings; bone_fragment is not dropped there at all
    expect(s.rngCalls()).toBe(Math.ceil(HUNT_CEILING.demon_glade.leather_scrap) + Math.ceil(HUNT_CEILING.demon_glade.demon_claw));
  });

  it('Garden: plot time is the clock of the plots, and the units are limited by the plant', async () => {
    const s = makeMaterialServer({ rng: ALWAYS });
    const plant = GARDEN_TABLE.common_herb;
    const hours = (plant.durationMs / HOUR) * 6; // six plots of one plant
    const r = await s.claim({ requestId: 'garden:1:1', activity: 'garden', place: '', durationMs: hours * HOUR, units: { common_herb: 12 } });
    expect(r.status).toBe(200);
    expect(s.rngCalls()).toBe(12); // every herb of the harvest is rolled; with these dice all are tradeable, and the daily cap of the material (the floor of 3) is what stops it
    expect(r.body.tradeable).toEqual({ common_herb: MATERIAL_BOUNDS.dailyCap('common_herb') });
    // a report that claims a thousand herbs for those plots is cut to what they can grow
    s.store.nowMs += 24 * HOUR;
    const before = s.rngCalls();
    const cheat = await s.claim({ requestId: 'garden:1:2', activity: 'garden', place: '', durationMs: hours * HOUR, units: { common_herb: 1000 } });
    expect(cheat.status).toBe(200);
    expect(s.rngCalls() - before).toBe(Math.ceil(plant.perPlotHour * hours));
    expect(s.store.flags.some((f) => f.code === 'MATERIAL_UNITS_EXCESS')).toBe(true);
  });
});

describe('the bot bound: a daily cap on tradeable units per material', () => {
  it('every material has a cap, about twice the best honest day times the chance (never under the floor)', () => {
    for (const id of MATERIAL_IDS) {
      const honest = (HONEST_PEAK_DAY_UNITS[id] ?? 0) * TRADEABLE_CHANCE[id];
      const cap = MATERIAL_BOUNDS.dailyCap(id);
      expect(cap, id).toBeGreaterThanOrEqual(3);
      expect(cap, id).toBeGreaterThanOrEqual(Math.floor(2 * honest));
      expect(cap, id).toBeLessThanOrEqual(Math.ceil(2 * honest) + 3);
    }
  });

  it('a bot that reports the most the game allows, all day, in the fastest material, never gets more than the cap a day (+ one starting day)', async () => {
    const s = makeMaterialServer({ rng: ALWAYS }); // every die is a success: the cap is the only limit
    let total = 0;
    for (let h = 0; h < 72; h++) {
      s.store.nowMs += HOUR;
      const r = await s.claim({ requestId: `bot:obsidian:${h}`, activity: 'mining', place: 'obsidian', durationMs: HOUR, units: { obsidian: 100_000 } });
      expect(r.status).toBe(200);
      total += (r.body.tradeable as Record<string, number>).obsidian ?? 0;
    }
    const cap = MATERIAL_BOUNDS.dailyCap('obsidian');
    // three days of claims: the bucket starts full (one day) and refills a day's worth per day, so a bot gets the cap a day, plus the one starting day
    expect(total).toBeLessThanOrEqual(cap * 4 + 1);
    expect(total - cap).toBeLessThanOrEqual(cap * 3 + 1);
    expect(total).toBeGreaterThan(cap * 3); // and the cap is not zero: it is the honest ceiling
    // ... which is about twice what the fastest honest player found, per day
    expect((total - cap) / 3).toBeLessThanOrEqual(2 * HONEST_PEAK_DAY_UNITS.obsidian * TRADEABLE_CHANCE.obsidian + 1);
    expect(s.store.flags.some((f) => f.code === 'LIMIT_MATERIAL_DAY')).toBe(true);
  });

  it('the cap counts whole units: a bucket with a fraction of a unit grants none and keeps the fraction', async () => {
    const s = makeMaterialServer({ rng: ALWAYS });
    const id = 'elder_root'; // the daily floor of 3 and a slow bucket
    s.store.items.accountCreatedMs = s.store.nowMs - 6 * HOUR; // six hours old: 3/24 x 6 = 0.75 of a unit
    const r = await s.claim({ requestId: 'garden:frac:1', activity: 'garden', place: '', durationMs: GARDEN_TABLE[id].durationMs, units: { [id]: 1 } });
    expect(r.status).toBe(200);
    expect(r.body.tradeable).toEqual({}); // a quarter of a unit short
    s.store.nowMs += 3 * HOUR; // +0.375: now 1.125
    const again = await s.claim({ requestId: 'garden:frac:2', activity: 'garden', place: '', durationMs: GARDEN_TABLE[id].durationMs, units: { [id]: 1 } });
    expect((again.body.tradeable as Record<string, number>)[id]).toBe(1);
    expect(s.store.items.buckets.get(`${USER_A}:${dayBucket(id)}`)!.tokens).toBeGreaterThanOrEqual(0);
  });
});

describe('burn, acknowledge and the balances', () => {
  const credit = async (s: ReturnType<typeof makeMaterialServer>, n: number) => {
    await s.store.credit({ userId: USER_A, requestId: `seed:${n}:aaaa`, credits: { iron: n } });
  };

  it('a burn lowers the balance by what the game spent, never below zero, and says what was really taken', async () => {
    const s = makeMaterialServer();
    await credit(s, 5);
    const r = await s.sync({ action: 'burn', requestId: 'burn:1:aaaaaa', units: { iron: 3, copper: 4 } });
    expect(r.status).toBe(200);
    expect(r.body.applied).toEqual({ iron: 3, copper: 0 }); // (a material the account has none of burns zero)
    expect(s.store.qty(USER_A, 'iron')).toBe(2);
    const over = await s.sync({ action: 'burn', requestId: 'burn:2:aaaaaa', units: { iron: 99 } });
    expect(over.body.applied).toEqual({ iron: 2 });
    expect(s.store.qty(USER_A, 'iron')).toBe(0);
  });

  it('a burn is idempotent by request id: a lost answer retried burns nothing twice', async () => {
    const s = makeMaterialServer();
    await credit(s, 5);
    const a = await s.sync({ action: 'burn', requestId: 'burn:3:aaaaaa', units: { iron: 2 } });
    const b = await s.sync({ action: 'burn', requestId: 'burn:3:aaaaaa', units: { iron: 2 } });
    expect(b.body.applied).toEqual(a.body.applied);
    expect(s.store.qty(USER_A, 'iron')).toBe(3);
  });

  it('pending never exceeds the balance after a burn, and an ack lowers it (never below zero, replay-safe)', async () => {
    const s = makeMaterialServer();
    s.store.deliver(USER_A, 'iron', 4); // 4 delivered, not yet in the save
    expect((await s.sync({ action: 'balances' })).body.balances).toEqual({ iron: { qty: 4, pending: 4, seq: 1 } });
    await s.sync({ action: 'burn', requestId: 'burn:4:aaaaaa', units: { iron: 3 } });
    expect((await s.sync({ action: 'balances' })).body.balances).toEqual({ iron: { qty: 1, pending: 1, seq: 1 } });
    s.store.deliver(USER_A, 'iron', 2); // qty 3, pending 3, seq 2
    const ack = await s.sync({ action: 'ack', requestId: 'ack:aaaaaaaa', units: { iron: 2 } });
    expect(ack.body.applied).toEqual({ iron: 2 });
    const replay = await s.sync({ action: 'ack', requestId: 'ack:aaaaaaaa', units: { iron: 2 } });
    expect(replay.body.applied).toEqual({ iron: 2 });
    expect((await s.sync({ action: 'balances' })).body.balances).toEqual({ iron: { qty: 3, pending: 1, seq: 2 } });
    const big = await s.sync({ action: 'ack', requestId: 'ack:bbbbbbbb', units: { iron: 50 } });
    expect(big.body.applied).toEqual({ iron: 1 });
  });

  it('balances are the caller\'s own', async () => {
    const s = makeMaterialServer();
    await credit(s, 5);
    expect((await s.sync({ action: 'balances' }, USER_B)).body.balances).toEqual({});
    expect((await s.sync({ action: 'balances' })).body.balances).toEqual({ iron: { qty: 5, pending: 0, seq: 0 } });
    expect((await s.sync({ action: 'balances' }, null)).status).toBe(401);
  });

  it('bad bodies are refused', async () => {
    const s = makeMaterialServer();
    expect((await s.sync({ action: 'steal' })).status).toBe(400);
    expect((await s.sync({ action: 'burn', requestId: 'x', units: { iron: 1 } })).status).toBe(400);
    expect((await s.sync({ action: 'burn', requestId: 'burn:5:aaaaaa', units: {} })).status).toBe(400);
    expect((await s.sync({ action: 'burn', requestId: 'burn:5:aaaaaa', units: { copper_bar: 3 } })).status).toBe(400);
  });
});

describe('the one table of chances', () => {
  it('spells out every material that can be tradeable and nothing else', () => {
    expect(Object.keys(TRADEABLE_CHANCE).sort()).toEqual([...MATERIAL_IDS].sort());
    expect(Object.keys(HONEST_PEAK_DAY_UNITS).sort()).toEqual([...MATERIAL_IDS].sort());
  });

  it('each chance is the rate of its class (1% common, 2% uncommon, 3% rare), except the one named exception', () => {
    for (const id of MATERIAL_IDS) {
      const expected = CLASS_RATE[MATERIAL_CLASS[id]];
      if (id === 'abyssal_marrow') expect(TRADEABLE_CHANCE[id], id).toBe(CLASS_RATE.rare);
      else expect(TRADEABLE_CHANCE[id], id).toBe(expected);
    }
    expect(CLASS_RATE).toEqual({ common: 0.01, uncommon: 0.02, rare: 0.03 });
  });
});

describe('the store a test uses is the state machine of the SQL', () => {
  it('a fresh store is empty', () => {
    expect(new FakeMaterialStore().balancesByUser.size).toBe(0);
  });
});
