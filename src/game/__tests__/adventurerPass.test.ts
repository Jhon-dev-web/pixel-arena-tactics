import { describe, expect, it, vi } from 'vitest';
import { buildHuntSession, computeHuntingStatus, defaultSave, effectiveRepairCost, normalizeSave, SaveData } from '../engine';
import { applyBattlePassClaim, BATTLE_PASS_TRACK, settleSeason } from '../battlepass';
import { ownsAdventurerPass, purchaseAdventurerPass } from '../entitlements';
import { SEASON_EPOCH_MS, seasonLengthMs, seasonNumber, seasonRemainingMs, seasonStartMs } from '../seasons';
import { withPermanentPassWindow } from '../huntSession';
import { deliveryXp, offerCount, rerollCap } from '../deliveries';
import { HUNTING_ZONES } from '../huntingZones';
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

  it('the final numbers: 12 h storage, +10 % materials, +5 slots, -20 % repair, +1 offer, +1 reroll, +10 % delivery XP', () => {
    expect(T.battlePass.capHours).toBe(12);
    expect(T.battlePass.dropRateMultiplier).toBeCloseTo(1.1, 9);
    expect(T.battlePass.bagBonusSlots).toBe(5);
    expect(T.battlePass.repairDiscount).toBeCloseTo(0.2, 9);
    expect(offerCount(true) - offerCount(false)).toBe(1);
    expect(rerollCap(true) - rerollCap(false)).toBe(1);
    expect(deliveryXp({ xp: 100 }, true)).toBe(110);
  });

  it('every consumer reads ownership: bag, repair, deliveries', () => {
    const o = owner();
    expect(inventoryCapacity(o)).toBe(DEFAULT_INVENTORY_CAPACITY + 5);
    expect(inventoryCapacity(defaultSave())).toBe(DEFAULT_INVENTORY_CAPACITY);
    expect(effectiveRepairCost(o, 3)).toBe(Math.ceil(repairCost(3) * 0.8));
    expect(effectiveRepairCost(defaultSave(), 3)).toBe(repairCost(3));
  });

  it('Hunting: an owner stores 12 h where the zone caps at less, a non-owner the zone cap; the window never expires', () => {
    const zone = HUNTING_ZONES.find((z) => z.offlineCapHours < T.battlePass.capHours)!;
    const start = 5_000_000_000;
    const mk = (own: boolean) => {
      const s: SaveData = { ...defaultSave(), hasBattlePass: own, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
      return { ...s, huntSession: buildHuntSession(s, start) };
    };
    const far = start + 40 * HOUR;
    expect(computeHuntingStatus(mk(false), far).capMs).toBe(zone.offlineCapHours * HOUR);
    expect(computeHuntingStatus(mk(true), far).capMs).toBe(T.battlePass.capHours * HOUR);
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
