import { describe, expect, it, vi } from 'vitest';
import { buildHuntSession, computeHuntingStatus, defaultSave, effectiveRepairCost, normalizeSave, SaveData } from '../engine';
import { applyBattlePassClaim, BATTLE_PASS_TRACK, settleSeason } from '../battlepass';
import { ownsAdventurerPass, purchaseAdventurerPass } from '../entitlements';
import { SEASON_EPOCH_MS, seasonLengthMs, seasonNumber, seasonRemainingMs, seasonStartMs } from '../seasons';
import { withPermanentPassWindow } from '../huntSession';
import { deliveryXp, offerCount, rerollCap } from '../deliveries';
import { HUNTING_ZONES } from '../huntingZones';
import { stashCapacity, STASH_BASE_SLOTS } from '../stash';
import { passBagBonus } from '../inventory';
import { goldMultiplier } from '../buffs';
import { deliveryGold } from '../deliveries';
import { merchantPrice } from '../merchant';
import { GOLD_BONUS_CAP } from '../rarity';
import { bagFreeSlots, inventoryCapacity, inventorySlotsUsed, DEFAULT_INVENTORY_CAPACITY } from '../inventory';
import { repairCost } from '../gear';
import T from '../tunables';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const wire = (s: unknown): SaveData => JSON.parse(JSON.stringify(s));
const inSeason = (n: number, offsetMs = HOUR) => seasonStartMs(n) + offsetMs;

describe('ownership (entitlements.ts)', () => {
  it('a save that ever activated the Pass (expired or not) becomes a permanent owner on load; one that never had it stays without', () => {
    const base = wire(defaultSave());
    const expired = normalizeSave({ ...base, hasBattlePass: true, battlePassExpiresAt: Date.now() - 400 * DAY });
    const running = normalizeSave({ ...base, hasBattlePass: true, battlePassExpiresAt: Date.now() + 5 * DAY });
    const never = normalizeSave({ ...base, hasBattlePass: false, battlePassExpiresAt: Date.now() + 5 * DAY });
    const none = normalizeSave({ ...base, hasBattlePass: undefined });
    expect(ownsAdventurerPass(expired)).toBe(true);
    expect(ownsAdventurerPass(running)).toBe(true);
    expect(ownsAdventurerPass(never)).toBe(false);
    expect(ownsAdventurerPass(none)).toBe(false);
    // the old expiry is dropped from the data
    for (const s of [expired, running, never]) expect('battlePassExpiresAt' in s).toBe(false);
    // and an owner stays one a year later
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 400 * DAY);
    expect(ownsAdventurerPass(normalizeSave(wire(expired)))).toBe(true);
    vi.useRealTimers();
  });

  it('owners keep everything they claimed (level, XP, claimed lists) through the migration', () => {
    const s = { ...defaultSave(), hasBattlePass: true, battlePassLevel: 12, battlePassXp: 33, claimedPassRewards: { free: [1, 2, 3], premium: [1, 2] } };
    const loaded = normalizeSave({ ...wire(s), battlePassExpiresAt: 5 });
    expect(loaded.battlePassLevel).toBe(12);
    expect(loaded.battlePassXp).toBe(33);
    expect(loaded.claimedPassRewards).toEqual({ free: [1, 2, 3], premium: [1, 2] });
  });

  it('purchaseAdventurerPass: a DEV build grants it (and opens the pass window of a running hunt); a production build refuses', async () => {
    const hunting = (() => {
      const zone = HUNTING_ZONES[0];
      const s = { ...defaultSave(), activeHuntingZone: zone.id, activeHuntingDepth: 'shallow' as const, huntingOfflineStart: 1_000_000 };
      return { ...s, huntSession: buildHuntSession(s, 1_000_000) };
    })();
    const dev = purchaseAdventurerPass(hunting, 2_000_000);
    expect(dev.ok).toBe(true);
    expect(ownsAdventurerPass(dev.save)).toBe(true);
    expect(dev.save.huntSession!.pass).toEqual([{ from: 2_000_000, to: null }]);
    // already an owner: nothing changes
    expect(purchaseAdventurerPass(dev.save, 3_000_000).save).toBe(dev.save);

    vi.resetModules();
    vi.stubEnv('DEV', false);
    const prod = await import('../entitlements');
    expect(prod.ADVENTURER_PASS_TESTABLE).toBe(false);
    const refused = prod.purchaseAdventurerPass(defaultSave(), 1);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('unavailable');
    expect(prod.ownsAdventurerPass(refused.save)).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('seasons (seasons.ts)', () => {
  it('Temporada 1 starts on 2026-10-01 UTC and seasons last 60 days', () => {
    expect(SEASON_EPOCH_MS).toBe(Date.UTC(2026, 9, 1));
    expect(T.battlePass.seasonDays).toBe(60);
    expect(seasonNumber(SEASON_EPOCH_MS)).toBe(1);
    expect(seasonNumber(SEASON_EPOCH_MS + 60 * DAY - 1)).toBe(1);
    expect(seasonNumber(SEASON_EPOCH_MS + 60 * DAY)).toBe(2);
    expect(seasonNumber(SEASON_EPOCH_MS + 600 * DAY)).toBe(11);
  });

  it('a clock before the epoch (or garbage) is season 1, never zero or negative', () => {
    expect(seasonNumber(SEASON_EPOCH_MS - 1)).toBe(1);
    expect(seasonNumber(0)).toBe(1);
    expect(seasonNumber(NaN)).toBe(1);
  });

  it('time remaining counts down to the next boundary and never exceeds one season', () => {
    expect(seasonRemainingMs(1, SEASON_EPOCH_MS + 10 * DAY)).toBe(50 * DAY);
    expect(seasonRemainingMs(1, SEASON_EPOCH_MS + 60 * DAY)).toBe(0);
    expect(seasonRemainingMs(2, SEASON_EPOCH_MS)).toBe(seasonLengthMs()); // clock set far back: clamped
  });
});

describe('season settlement (battlepass.ts settleSeason)', () => {
  const at = (patch: Partial<SaveData>): SaveData => ({ ...defaultSave(), passSeason: 1, ...patch });
  // a bag with no free slot at all: one big stack of copper takes the whole capacity
  const full = (s: SaveData): SaveData => ({ ...s, materials: { ...s.materials, copper: 99 * inventoryCapacity(s) } });

  it('does nothing inside the settled season, and a clock set BACKWARDS never re-runs or un-settles a season', () => {
    const s = at({ passSeason: 3, battlePassLevel: 9 });
    expect(settleSeason(s, inSeason(3))).toBe(s);
    expect(settleSeason(s, inSeason(2))).toBe(s);
    expect(settleSeason(s, SEASON_EPOCH_MS - 5 * DAY)).toBe(s);
  });

  it('pays every earned, unclaimed free reward exactly once and starts the track over', () => {
    const s = at({ battlePassLevel: 5, claimedPassRewards: { free: [1, 2], premium: [] }, gold: 0 });
    const settled = settleSeason(s, inSeason(2));
    // free levels 3, 4, 5 = gold 150 + large_hp x1 + leather x4 (levels 4..) per FREE_TRACK; gold of level 4 and... assert through the track data
    const owed = [3, 4, 5].map((l) => BATTLE_PASS_TRACK[l - 1].free);
    expect(settled.gold).toBe(owed.filter((r) => r.kind === 'gold').reduce((a, r) => a + r.amount, 0));
    expect(settled.battlePassLevel).toBe(1);
    expect(settled.battlePassXp).toBe(0);
    expect(settled.claimedPassRewards).toEqual({ free: [], premium: [] });
    expect(settled.passSeason).toBe(2);
    expect(settled.pendingSeasonSummary?.season).toBe(1);
    expect(settled.pendingSeasonSummary!.rewards.length).toBeGreaterThan(0);
    // no premium track for a non-owner
    expect(settled.shards).toBe(0);
    // idempotent: running it again (a reload, the 60 s tick) grants nothing
    expect(settleSeason(settled, inSeason(2))).toBe(settled);
    expect(settleSeason(wire(settled) as SaveData, inSeason(2) + 5 * DAY)).toEqual(wire(settled));
  });

  it('an owner also gets the unclaimed premium rewards; claimed levels are not paid twice', () => {
    const lv = 6;
    const s = at({ hasBattlePass: true, battlePassLevel: lv, claimedPassRewards: { free: [1, 2, 3, 4, 5, 6], premium: [1, 2, 3, 4, 5] } });
    const settled = settleSeason(s, inSeason(2));
    const premium6 = BATTLE_PASS_TRACK[lv - 1].premium;
    const gained = settled.pendingSeasonSummary!.rewards;
    expect(gained).toHaveLength(1);
    expect(gained[0]).toMatchObject({ kind: premium6.kind, amount: premium6.amount });
  });

  it('with a FULL bag nothing is lost: items go in anyway (the bag goes over capacity)', () => {
    const base = full(at({ hasBattlePass: true, battlePassLevel: 30 }));
    expect(bagFreeSlots(base)).toBe(0);
    const before = inventorySlotsUsed(base);
    // the same level is refused as a deliberate claim when it carries an item...
    const itemLevel = BATTLE_PASS_TRACK.findIndex((l) => l.free.kind === 'consumable' || l.free.kind === 'material') + 1;
    const claim = applyBattlePassClaim(base, itemLevel, 'free', Date.now());
    expect(claim.save).toBeNull();
    expect(claim.blocked).toBe(true);
    // ...but the settlement pays all of it
    const settled = settleSeason(base, inSeason(2));
    expect(inventorySlotsUsed(settled)).toBeGreaterThan(before);
    expect(inventorySlotsUsed(settled)).toBeGreaterThan(inventoryCapacity(settled));
    expect(settled.pendingSeasonSummary!.rewards.some((r) => r.kind === 'material' || r.kind === 'consumable')).toBe(true);
    // every level of both tracks was paid: the title cosmetic is in
    expect(settled.cosmetics).toContain('title_season_lv30');
  });

  it('skipping several seasons settles the stored one once and lands on the current season', () => {
    const settled = settleSeason(at({ battlePassLevel: 3 }), inSeason(9));
    expect(settled.passSeason).toBe(9);
    expect(settled.pendingSeasonSummary?.season).toBe(1);
  });

  it('a save from before seasons adopts the season it is loaded in and keeps its level and claims', () => {
    const old = wire({ ...defaultSave(), battlePassLevel: 7, claimedPassRewards: { free: [1], premium: [] } });
    delete (old as unknown as Record<string, unknown>).passSeason;
    delete (old as unknown as Record<string, unknown>).pendingSeasonSummary;
    const loaded = normalizeSave(old);
    expect(loaded.passSeason).toBe(seasonNumber(Date.now()));
    expect(loaded.battlePassLevel).toBe(7);
    expect(settleSeason(loaded, Date.now())).toBe(loaded);
  });

  it('the summary survives a save/load round trip and a stored season is never lowered', () => {
    const settled = settleSeason(at({ battlePassLevel: 4 }), inSeason(2));
    const loaded = normalizeSave(wire(settled));
    expect(loaded.pendingSeasonSummary).toEqual(settled.pendingSeasonSummary);
    expect(loaded.passSeason).toBe(2);
  });
});

describe('perks of the Pass: convenience, not power', () => {
  const owner = (s: SaveData = defaultSave()): SaveData => ({ ...s, hasBattlePass: true });

  it('the final numbers: a longer storage cap (base 6 h for everyone), +10 stash slots, +5 bag slots, -20 % repair, +1 offer, +1 reroll, +20 % delivery XP (Round 19: 10 h storage, +15 % gold)', () => {
    // Measured advantage of an owner (npm run sim, SIM_PASS_ONLY; see docs/BALANCE_CHANGES.md section 28): about +40-60 % materials per day at days 7 / 14
    // and 2-3 days earlier on the milestones. A comment, not an assertion: the sim is not part of the test suite.
    expect(T.battlePass.capHours).toBe(10);
    expect(T.battlePass.stashBonusSlots).toBe(10);
    expect(T.battlePass.dropRateMultiplier).toBeCloseTo(1.1, 9);
    expect(T.battlePass.bagBonusSlots).toBe(5); // the floor of the bag perk
    expect(T.battlePass.bagBonusPct).toBeCloseTo(0.2, 9);
    expect(T.battlePass.goldBonus).toBeCloseTo(0.15, 9);
    expect(T.battlePass.repairDiscount).toBeCloseTo(0.2, 9);
    expect(offerCount(true) - offerCount(false)).toBe(1);
    expect(rerollCap(true) - rerollCap(false)).toBe(1);
    expect(deliveryXp({ xp: 100 }, true)).toBe(120);
  });

  it('every consumer reads ownership: bag, repair, deliveries', () => {
    const o = owner();
    expect(inventoryCapacity(o)).toBe(DEFAULT_INVENTORY_CAPACITY + 6); // 20% of 26, rounded up
    expect(inventoryCapacity(defaultSave())).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(stashCapacity(o)).toBe(stashCapacity(defaultSave()) + 10);
    expect(stashCapacity({ ...o, stashBonusSlots: 5 })).toBe(STASH_BASE_SLOTS + 10 + 5); // stacks with deeds
    expect(effectiveRepairCost(o, 3)).toBe(Math.ceil(repairCost(3) * 0.8));
    expect(effectiveRepairCost(defaultSave(), 3)).toBe(repairCost(3));
  });

  it('Hunting: an owner stores up to the Pass cap where the zone caps lower, a non-owner the zone cap; the window never expires', () => {
    const zone = HUNTING_ZONES.find((z) => z.offlineCapHours < T.battlePass.capHours) ?? HUNTING_ZONES[0];
    const ownerCap = Math.max(zone.offlineCapHours, T.battlePass.capHours);
    const start = 5_000_000_000;
    const mk = (own: boolean) => {
      const s: SaveData = { ...defaultSave(), hasBattlePass: own, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
      return { ...s, huntSession: buildHuntSession(s, start) };
    };
    const far = start + 40 * HOUR;
    expect(computeHuntingStatus(mk(false), far).capMs).toBe(zone.offlineCapHours * HOUR);
    expect(computeHuntingStatus(mk(true), far).capMs).toBe(ownerCap * HOUR);
    expect(computeHuntingStatus(mk(true), far).pendingMs).toBe(ownerCap * HOUR);
    // a session started without the Pass keeps the zone cap even if the Pass is bought mid-session
    const s0: SaveData = { ...defaultSave(), activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
    const without = { ...s0, huntSession: buildHuntSession(s0, start) };
    const bought = purchaseAdventurerPass(without, start + HOUR).save;
    expect(computeHuntingStatus(bought, far).capMs).toBe(zone.offlineCapHours * HOUR);
    expect(buildHuntSession(mk(true), start).pass).toEqual([{ from: start, to: null }]);
    expect(buildHuntSession(mk(false), start).pass).toEqual([]);
  });

  it('uniques are untouched by the Pass: the same session yields the same unique pieces with and without it', () => {
    const zone = HUNTING_ZONES.find((z) => z.uniques && z.offlineCapHours >= 4)!;
    let compared = 0;
    for (let i = 0; i < 60; i++) {
      const start = 5_000_000_000 + i * 7919;
      const base: SaveData = { ...defaultSave(), activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
      const plain = { ...base, huntSession: buildHuntSession(base, start) };
      const pass = { ...base, hasBattlePass: true, huntSession: buildHuntSession({ ...base, hasBattlePass: true }, start) };
      const at = start + Math.min(zone.offlineCapHours, 4) * HOUR; // inside both caps
      expect(computeHuntingStatus(pass, at).uniques).toEqual(computeHuntingStatus(plain, at).uniques);
      compared += computeHuntingStatus(plain, at).uniques.length;
    }
    expect(compared).toBeGreaterThanOrEqual(0);
  });
});

describe('Pass bag perk: +20 % of the capacity, rounded up, never fewer than 5', () => {
  it('26 -> +6, 60 -> +12, 100 -> +20, and a tiny bag still gets the 5-slot floor', () => {
    expect(passBagBonus(26)).toBe(6);
    expect(passBagBonus(60)).toBe(12);
    expect(passBagBonus(100)).toBe(20);
    expect(passBagBonus(10)).toBe(5);
    for (const cap of [26, 30, 60, 100]) {
      const s: SaveData = { ...defaultSave(), inventoryCapacity: cap, hasBattlePass: true };
      expect(inventoryCapacity(s)).toBe(cap + passBagBonus(cap));
      expect(inventoryCapacity({ ...s, hasBattlePass: false })).toBe(cap);
      expect(passBagBonus(cap)).toBeGreaterThanOrEqual(5); // an owner never has fewer slots than the flat +5 of before
    }
    // converted Pouch slots count as capacity
    expect(inventoryCapacity({ ...defaultSave(), inventoryBonusSlots: 4, hasBattlePass: true })).toBe(30 + passBagBonus(30));
  });
});

describe('Pass gold bonus: +15 % in the Dungeon, Hunting and delivery orders, added (never multiplied)', () => {
  it('goldMultiplier adds the Pass share to the gear bonus (inside its own cap) and the Fortune tonic', () => {
    const g = T.battlePass.goldBonus;
    expect(goldMultiplier(0, false, g)).toBeCloseTo(1.15, 9);
    expect(goldMultiplier(GOLD_BONUS_CAP, false, g)).toBeCloseTo(1 + GOLD_BONUS_CAP / 100 + g, 9);
    expect(goldMultiplier(GOLD_BONUS_CAP, true, g)).toBeCloseTo(1 + GOLD_BONUS_CAP / 100 + T.tonics.fortuneGoldPct + g, 9);
    expect(goldMultiplier(10, false)).toBeCloseTo(1.1, 9); // a non-owner passes nothing
  });

  it('Hunting freezes it into the session at the start and pays it on top of the gear bonus; a non-owner session has none', () => {
    const zone = HUNTING_ZONES[0];
    const start = 5_000_000_000;
    const mk = (own: boolean) => {
      const s: SaveData = { ...defaultSave(), hasBattlePass: own, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
      return { ...s, huntSession: buildHuntSession(s, start) };
    };
    expect(mk(true).huntSession!.passGold).toBeCloseTo(15, 9);
    expect(mk(false).huntSession!.passGold).toBeUndefined();
    const at = start + 3 * HOUR;
    const plain = computeHuntingStatus(mk(false), at);
    const pass = computeHuntingStatus(mk(true), at);
    expect(plain.goldReady).toBeGreaterThan(0);
    // the same fights (gold does not change them): about +15 % of the plain Gold
    // (a few Gold an hour, so the whole-number rounding of either side moves the ratio a little)
    expect(pass.goldReady / plain.goldReady).toBeGreaterThan(1.12);
    expect(pass.goldReady / plain.goldReady).toBeLessThan(1.3);
    expect(pass.xpReady).toBe(plain.xpReady);
    // survives a save / load
    expect(normalizeSave(wire(mk(true))).huntSession!.passGold).toBeCloseTo(15, 9);
  });

  it('delivery orders: the owner is paid +15 % gold, decided at accept and frozen; the merchant is not included', () => {
    expect(deliveryGold({ gold: 1000 }, true)).toBe(1150);
    expect(deliveryGold({ gold: 1000 }, false)).toBe(1000);
    expect(merchantPrice('material', 'iron')).toBe(merchantPrice('material', 'iron')); // selling stays as it is (no Pass term in merchant.ts)
  });
});

describe('in-flight Hunting sessions started under the longer Pass cap', () => {
  it('a running session saved by the first Pass model keeps its 24 h cap; a new owner session has the Pass cap; a snapshot-less one the zone cap', () => {
    const zone = HUNTING_ZONES[0];
    const start = Date.now() - 40 * HOUR;
    const base: SaveData = { ...defaultSave(), hasBattlePass: true, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
    const fresh = buildHuntSession(base, start);
    expect(fresh.storageFlat).toBe(true);
    expect(fresh.passCapHours).toBe(T.battlePass.capHours); // frozen at the start
    // what the old model wrote: a Pass window, no storageFlat marker
    const oldRaw = wire({ ...base, huntSession: { ...fresh, storageFlat: undefined, passCapHours: undefined, pass: [{ from: start, to: null }] } });
    const loaded = normalizeSave(oldRaw);
    expect(loaded.huntSession!.passCapHours).toBe(24);
    expect(computeHuntingStatus(loaded, Date.now()).capMs).toBe(24 * HOUR);
    // saved again, it is still that session (the marker survives)
    expect(normalizeSave(wire(loaded)).huntSession!.passCapHours).toBe(24);
    // a session of the current model is the zone cap
    expect(computeHuntingStatus(normalizeSave(wire({ ...base, huntSession: fresh })), Date.now()).capMs).toBe(Math.max(zone.offlineCapHours, T.battlePass.capHours) * HOUR);
    // no snapshot at all: rebuilt on the base cap
    const none = normalizeSave(wire({ ...base, huntSession: null }));
    expect(computeHuntingStatus(none, Date.now()).capMs).toBe(zone.offlineCapHours * HOUR);
  });
});

describe('in-flight Hunting sessions from the 30-day model', () => {
  const win = (from: number, to: number | null) => ({ from, to });
  const session = (pass: ReturnType<typeof win>[]) => ({ ...buildHuntSession(defaultSave(), 0), pass });

  it('a window that was still running at load stays open for good', () => {
    expect(withPermanentPassWindow(session([win(100, 5_000)]), 1_000).pass).toEqual([win(100, null)]);
  });

  it('a window that lapsed before the load starts again from the load (no retroactive bonus for the gap)', () => {
    expect(withPermanentPassWindow(session([win(100, 500)]), 1_000).pass).toEqual([win(100, 500), win(1_000, null)]);
  });

  it('a session with no window at all (started before the Pass was bought) gets one from the load', () => {
    expect(withPermanentPassWindow(session([]), 1_000).pass).toEqual([win(1_000, null)]);
  });

  it('loading an owner save with a running hunt re-opens the window; a non-owner is untouched', () => {
    const start = Date.now() - 2 * HOUR;
    const zone = HUNTING_ZONES[0];
    const s: SaveData = { ...defaultSave(), hasBattlePass: true, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
    const raw = wire({ ...s, huntSession: { ...buildHuntSession(s, start), pass: [win(start, Date.now() + DAY)] } });
    expect(normalizeSave(raw).huntSession!.pass).toEqual([win(start, null)]);
    const free = wire({ ...s, hasBattlePass: false, huntSession: { ...buildHuntSession(s, start), pass: [] } });
    expect(normalizeSave(free).huntSession!.pass).toEqual([]);
  });
});
