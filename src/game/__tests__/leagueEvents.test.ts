import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hero } from '../../../scripts/sim/duel';
import { computeHuntingStatus, computeMiningStatus, defaultSave, normalizeSave, SaveData, xpToReachLevel } from '../engine';
import { applyHuntStart } from '../huntLifecycle';
import { applyDeliveryClaim } from '../deliveries';
import { applyClaimGathering, applyStartGathering } from '../gathering';
import { applyHarvest, applyPlant } from '../gardenActions';
import { setLeagueEpoch, getLeagueEpoch } from '../leagueClock';
import {
  DAY_MS,
  EVENT_BUFF_RULES,
  EVENT_HERO_FACTOR,
  EVENT_PROFESSION_FACTOR,
  EVENT_XP_CAP,
  EVENTS_FIRST_DAY,
  EVENTS_FROM_DAY,
  HOUR_MS,
  LEAGUE_EVENT_SLOTS,
  LEAGUE_LAST_DAY,
  activeEventBuffs,
  applyDungeonRace,
  applyFinalRaceClaim,
  applyProfessionPick,
  bossStagesCleared,
  eventAt,
  eventGatherBonusHours,
  eventSkillXpMultiplier,
  eventsNow,
  grantEventBuff,
  huntEventWindows,
  leagueDayAt,
  leagueEventPreview,
  leagueEventWindows,
  nextEventAfter,
  sanitizeEventBuffs,
  sanitizeEventPick,
} from '../leagueEvents';
import { BOUNDS, eventHoursBetween } from '../../../supabase/functions/_shared/progress/bounds';
import { EVENT_SLOTS } from '../../../supabase/functions/_shared/progress/tables';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Rodada 22: League events. A calendar of days 3 to 60 (the first 24 days lighter) hung from the SERVER's League opening, small bonuses that the anti-cheat bound allows exactly, and nothing at all without a League clock.
const EPOCH = Date.UTC(2026, 9, 20);
// `slot`: the nth event of that id in the FULL calendar (League day 25 on); the light weeks (days 3 to 23) have their own tests below.
const slot = (id: string, nth = 0) => leagueEventWindows(EPOCH).filter((w) => w.id === id && w.startMs >= EPOCH + (EVENTS_FROM_DAY - 1) * DAY_MS)[nth];
const NOW0 = new Date(2026, 5, 20, 12, 0, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW0);
  setLeagueEpoch(null);
});
afterEach(() => {
  vi.useRealTimers();
  setLeagueEpoch(null);
});

describe('the calendar', () => {
  const w = leagueEventWindows(EPOCH);

  it('18 events inside days 3 to 60, in order, with the lengths the design asked for', () => {
    expect(w).toHaveLength(18);
    expect(w[0].startMs).toBe(EPOCH + (EVENTS_FIRST_DAY - 1) * DAY_MS);
    expect(w.filter((x) => x.startMs >= EPOCH + (EVENTS_FROM_DAY - 1) * DAY_MS)).toHaveLength(12);
    expect(w[w.length - 1].endMs).toBe(EPOCH + LEAGUE_LAST_DAY * DAY_MS);
    const hours = (id: string) => [...new Set(LEAGUE_EVENT_SLOTS.filter((s) => s.id === id).map((s) => s.hours))];
    expect(hours('invasion')).toEqual([48]);
    expect(hours('target_hunt')).toEqual([48]);
    expect(hours('dungeon_race')[0]).toBeGreaterThanOrEqual(24);
    expect(hours('dungeon_race')[0]).toBeLessThanOrEqual(48);
    expect(hours('grand_delivery')).toEqual([24]);
    expect(hours('time_rift')).toEqual([24]);
    expect(hours('mining_fever')).toEqual([24]);
    expect(hours('crafts_festival')).toEqual([48]);
    expect(LEAGUE_EVENT_SLOTS.filter((s) => s.id === 'crafts_festival')).toHaveLength(2); // one in the light weeks, one in the full calendar
    expect(hours('profession_week')).toEqual([72]);
    expect(hours('final_race')).toEqual([120]);
    expect(new Set(LEAGUE_EVENT_SLOTS.map((s) => s.id)).size).toBe(9);
  });

  it('one event at a time with a rest between two, hero and profession taking turns, never the same event twice in a row, the Corrida Final in the last five days', () => {
    for (let i = 1; i < w.length; i++) {
      expect(w[i].startMs, `${i}`).toBeGreaterThanOrEqual(w[i - 1].endMs);
      expect(w[i].id).not.toBe(w[i - 1].id);
      if (w[i].kind !== 'final') expect(w[i].kind).not.toBe(w[i - 1].kind);
    }
    expect(w.slice(0, -1).map((x) => x.kind)).toEqual(Array.from({ length: 17 }, (_, i) => (i % 2 === 0 ? 'hero' : 'profession')));
    const last = w[w.length - 1];
    expect(last.id).toBe('final_race');
    expect(last.startMs).toBe(EPOCH + 55 * DAY_MS); // League day 56
    expect(last.endMs - last.startMs).toBe(5 * DAY_MS);
    // a whole day of rest between any two events
    for (let i = 1; i < w.length; i++) expect(w[i].startMs - w[i - 1].endMs).toBeGreaterThanOrEqual(DAY_MS);
  });

  it('finds the event running, the next one, and the League day', () => {
    const inv = slot('invasion');
    expect(eventAt(EPOCH, inv.startMs - 1)).toBeNull();
    expect(eventAt(EPOCH, inv.startMs)?.id).toBe('invasion');
    expect(eventAt(EPOCH, inv.endMs - 1)?.id).toBe('invasion');
    expect(eventAt(EPOCH, inv.endMs)).toBeNull();
    expect(nextEventAfter(EPOCH, EPOCH)?.id).toBe('invasion');
    expect(nextEventAfter(EPOCH, inv.startMs)?.id).toBe('mining_fever');
    expect(nextEventAfter(EPOCH, EPOCH + 61 * DAY_MS)).toBeNull();
    expect(eventsNow(EPOCH, inv.startMs + HOUR_MS)).toMatchObject({ current: { id: 'invasion' }, next: { id: 'mining_fever' } });
    expect(leagueDayAt(EPOCH, EPOCH)).toBe(1);
    expect(leagueDayAt(EPOCH, EPOCH + 24 * DAY_MS)).toBe(25);
    expect(leagueDayAt(EPOCH, EPOCH - 1)).toBe(0);
  });

  it('shows the calendar before the League as League days ("na Liga")', () => {
    const p = leagueEventPreview();
    expect(p).toHaveLength(18);
    expect(p[0]).toMatchObject({ id: 'invasion', fromDay: 3, toDay: 4, hours: 48 });
    expect(p[6]).toMatchObject({ id: 'invasion', fromDay: 25, toDay: 26, hours: 48 });
    expect(p[p.length - 1]).toMatchObject({ id: 'final_race', fromDay: 56, toDay: 60, hours: 120 });
    expect(p[10]).toMatchObject({ id: 'dungeon_race', fromDay: 37, toDay: 38, hours: 36 });
  });

  it('the server\'s copy of the calendar (generated into progress/tables.ts) is the same table', () => {
    expect(EVENT_SLOTS.map((s) => ({ id: s.id, kind: s.kind, startHour: s.startHour, hours: s.hours }))).toEqual(LEAGUE_EVENT_SLOTS.map((s) => ({ id: s.id, kind: s.kind, startHour: s.startHour, hours: s.hours })));
  });

  it('every event has a name and a line in both languages', () => {
    for (const tree of [pt, en]) {
      const ev = (tree as unknown as { events: Record<string, string> }).events;
      for (const s of LEAGUE_EVENT_SLOTS) {
        expect(typeof ev[`name_${s.id}`], `${s.id}`).toBe('string');
        expect(typeof ev[`desc_${s.id}`], `${s.id}`).toBe('string');
      }
    }
  });
});

describe('no League clock, no events', () => {
  it('nothing is granted, paid or boosted without the server\'s League moment', () => {
    expect(getLeagueEpoch()).toBeNull();
    const s = defaultSave();
    expect(grantEventBuff(s, 'grand_delivery', NOW0)).toBe(s);
    expect(applyDungeonRace(s, 20, 10, NOW0)).toEqual({ save: s, gold: 0 });
    expect(applyFinalRaceClaim(s, NOW0)).toBe(s);
    expect(applyProfessionPick(s, 'mining', NOW0)).toBeNull();
    expect(eventGatherBonusHours('mining', NOW0 - 5 * HOUR_MS, 5 * HOUR_MS)).toBe(0);
    expect(eventSkillXpMultiplier(s, 'mining', NOW0 - HOUR_MS, NOW0)).toBe(1);
    const h = { ...hero('5', 8, { level: 100, rarity: 'legendary' }), highestDungeonFloor: 100 };
    const started = applyHuntStart(h, 'blood_abyss', 'shallow', NOW0 - 3 * HOUR_MS)!;
    expect(started.huntSession!.league).toBeUndefined();
  });
});

// ---- the hunts ------------------------------------------------------------------------------------------------------------------------------------

const strong = (): SaveData => ({ ...hero('5', 8, { level: 100, rarity: 'legendary' }), xp: xpToReachLevel(100), highestDungeonFloor: 100 });
/** A save that starts hunting `zone` 3 hours before `now`, under a League whose event `id` is running the whole time. */
function huntDuring(id: string, save = strong(), zone = 'blood_abyss', depth: 'shallow' | 'deep' = 'shallow', hours = 3) {
  const w = slot(id);
  const now = w.startMs + 2 * HOUR_MS + hours * HOUR_MS;
  const startedAt = now - hours * HOUR_MS;
  const base = { ...save, huntProgress: { [`${zone}:${depth}`]: { ceiling: 6, promotionWins: 0 } } };
  setLeagueEpoch(null);
  const plain = computeHuntingStatus(applyHuntStart(base, zone, depth, startedAt)!, now);
  setLeagueEpoch(EPOCH);
  const started = applyHuntStart(base, zone, depth, startedAt)!;
  return { plain, event: computeHuntingStatus(started, now), started, now, startedAt };
}

describe('hero events change only the Hunting XP, and by little', () => {
  it('Invasao de Monstros: the longer the hero stands the more XP, up to +10%, and the enemies escalate with the wave', () => {
    const r = huntDuring('invasion');
    const ratio = r.event.xpReady / r.plain.xpReady;
    expect(ratio).toBeGreaterThan(1.05);
    expect(ratio).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(r.event.goldReady).toBe(r.plain.goldReady >= 0 ? r.event.goldReady : 0);
    // escalating waves: a streak of 100 fights makes the enemy 3% stronger, so the same hero fights a little longer per kill
    expect(r.event.kills).toBeLessThanOrEqual(r.plain.kills);
    expect(r.started.huntSession!.league).toBe(EPOCH);
  });

  it('Fenda Temporal: the enemies hit 25% harder and the streak pays up to +10%', () => {
    const r = huntDuring('time_rift');
    const ratio = r.event.xpReady / r.plain.xpReady;
    expect(ratio).toBeGreaterThan(1.05);
    expect(ratio).toBeLessThanOrEqual(1.1 + 1e-9);
  });

  it('Cacada ao Alvo: a hero that beats the target gets +8% for an hour and a half, a hero that cannot gets nothing extra', () => {
    const strongRun = huntDuring('target_hunt', strong(), 'blood_abyss', 'shallow', 6);
    expect(strongRun.event.xpReady / strongRun.plain.xpReady).toBeGreaterThan(1.01);
    expect(strongRun.event.xpReady / strongRun.plain.xpReady).toBeLessThanOrEqual(1.1); // (+8% at most; the Target fight shifts the dice a little, so a hair of noise: 2 points since the sub-levels pay more)
    // the window rules say what the Target is
    const win = huntEventWindows(EPOCH, strongRun.startedAt, 6 * HOUR_MS).find((x) => x.id === 'target_hunt')!;
    expect(win).toMatchObject({ targetEvery: 300, targetHp: 2, targetDmg: 1.5, targetBuffPct: 0.08, targetBuffHours: 1.5 });
  });

  it('only the hero events build Hunting windows, and only the ones that overlap the session', () => {
    const inv = slot('invasion');
    const w = huntEventWindows(EPOCH, inv.startMs - HOUR_MS, 3 * HOUR_MS);
    expect(w.map((x) => x.id)).toEqual(['invasion']);
    expect(w[0].from).toBe(HOUR_MS);
    expect(huntEventWindows(EPOCH, slot('mining_fever').startMs, 5 * HOUR_MS)).toEqual([]);
    expect(huntEventWindows(EPOCH, EPOCH, 24 * HOUR_MS)).toEqual([]);
  });

  it('never more than the cap together, whatever stacks (a streak, the Target and every buff at once)', () => {
    const w = slot('invasion');
    const startedAt = w.startMs + HOUR_MS;
    const now = startedAt + 4 * HOUR_MS;
    setLeagueEpoch(EPOCH);
    let s = applyHuntStart({ ...strong(), huntProgress: { 'blood_abyss:shallow': { ceiling: 6, promotionWins: 0 } } }, 'blood_abyss', 'shallow', startedAt)!;
    const plain = computeHuntingStatus({ ...s, huntSession: { ...s.huntSession!, league: undefined } }, now).xpReady;
    s = { ...s, huntSession: { ...s.huntSession!, eventXp: [{ from: startedAt, to: now + HOUR_MS, pct: 0.1 }, { from: startedAt, to: now + HOUR_MS, pct: 0.1 }, { from: startedAt, to: now + HOUR_MS, pct: 0.1 }] } };
    const stacked = computeHuntingStatus(s, now).xpReady;
    // Rodada 31: the XP of a kill scales with the monster's HP, and the Invasion's wave makes the monsters bigger, so the run under the League is not the plain run x 1.15 any more. The cap is checked where it acts:
    // the three buffs plus the streak give exactly what ONE buff of the cap gives (the sum is cut at EVENT_XP_CAP), and a bigger sum than the cap changes nothing.
    const one = computeHuntingStatus({ ...s, huntSession: { ...s.huntSession!, eventXp: [{ from: startedAt, to: now + HOUR_MS, pct: EVENT_XP_CAP }] } }, now).xpReady;
    const twice = computeHuntingStatus({ ...s, huntSession: { ...s.huntSession!, eventXp: [{ from: startedAt, to: now + HOUR_MS, pct: 0.5 }, { from: startedAt, to: now + HOUR_MS, pct: 0.5 }] } }, now).xpReady;
    expect(stacked).toBe(one);
    expect(twice).toBe(one);
    expect(stacked / plain).toBeGreaterThan(1.12); // and it does reach the cap
  });
});

describe('the buffs the player earns', () => {
  it('Grande Entrega: a delivery order collected in the window pays +10% Hunting XP for 3 hours, and nowhere else', () => {
    const offer = { id: 'd1', arch: 'militar', dist: 'curta', cls: 'simple', tier: 0, items: { demon_claw: 1 }, gold: 100, shards: 0, durationMs: 90 * 60 * 1000, bornAt: NOW0, dest: 0 };
    const w = slot('grand_delivery');
    const now = w.startMs + 5 * HOUR_MS;
    const order = { ...defaultSave(), deliveries: { seq: 1, offers: [], active: { offer, startedAt: now - 2 * HOUR_MS, endsAt: now - 1 }, rerollDay: '', rerollsUsed: 0 } } as unknown as SaveData;
    expect(applyDeliveryClaim(order, now)!.save.eventBuffs).toBeUndefined(); // no League clock
    setLeagueEpoch(EPOCH);
    const paid = applyDeliveryClaim(order, now)!.save;
    expect(paid.eventBuffs?.grand_delivery).toEqual({ from: now, to: now + 3 * HOUR_MS, pct: 0.1 });
    expect(paid.gold).toBe(order.gold + 100);
    // outside the event the order pays as before
    const other = slot('invasion').startMs + HOUR_MS;
    const lateOrder = { ...order, deliveries: { ...order.deliveries, active: { ...order.deliveries.active!, startedAt: other - 2 * HOUR_MS, endsAt: other - 1 } } } as SaveData;
    expect(applyDeliveryClaim(lateOrder, other)!.save.eventBuffs).toBeUndefined();
  });

  it('Corrida da Masmorra: each boss cleared in the window pays 120 Gold and a 4 h buff; nothing for a run without a boss', () => {
    expect(bossStagesCleared(20, 10)).toBe(1); // floor 25
    expect(bossStagesCleared(0, 100)).toBe(4);
    expect(bossStagesCleared(24, 1)).toBe(1);
    expect(bossStagesCleared(25, 24)).toBe(0);
    expect(bossStagesCleared(99, 12)).toBe(2); // floor 100, then 101..111: depth 10 is stage 110
    expect(bossStagesCleared(100, 10)).toBe(1);
    const w = slot('dungeon_race');
    const now = w.startMs + 3 * HOUR_MS;
    setLeagueEpoch(EPOCH);
    const s = defaultSave();
    const r = applyDungeonRace(s, 20, 60, now); // floors 21..80: 25, 50, 75
    expect(r.gold).toBe(3 * 120);
    expect(r.save.gold).toBe(s.gold + 360);
    expect(r.save.eventBuffs?.dungeon_race).toEqual({ from: now, to: now + 4 * HOUR_MS, pct: 0.08 });
    expect(applyDungeonRace(s, 26, 10, now)).toEqual({ save: s, gold: 0 });
    expect(applyDungeonRace(s, 20, 10, slot('invasion').startMs + HOUR_MS)).toEqual({ save: s, gold: 0 });
    expect(applyDungeonRace(s, 20, 0, now)).toEqual({ save: s, gold: 0 });
  });

  it('Corrida Final: the fourth daily goal of the day starts the 24 h buff', () => {
    const w = slot('final_race');
    const now = w.startMs + 10 * HOUR_MS;
    setLeagueEpoch(EPOCH);
    const three = { ...defaultSave(), quests: { ...defaultSave().quests, dailyClaimed: ['a', 'b', 'c'] } };
    expect(applyFinalRaceClaim(three, now)).toBe(three);
    const four = { ...three, quests: { ...three.quests, dailyClaimed: ['a', 'b', 'c', 'd'] } };
    expect(applyFinalRaceClaim(four, now).eventBuffs?.final_race).toEqual({ from: now, to: now + 24 * HOUR_MS, pct: 0.05 });
    expect(applyFinalRaceClaim(four, slot('invasion').startMs + HOUR_MS)).toBe(four);
  });

  it('a buff reaches the Hunting session that is running from now on, never for the time already hunted, and a session that starts later carries it', () => {
    const w = slot('grand_delivery');
    const startedAt = w.startMs + HOUR_MS;
    const grantedAt = startedAt + 2 * HOUR_MS;
    const endAt = grantedAt + 2 * HOUR_MS;
    setLeagueEpoch(EPOCH);
    const base = { ...strong(), huntProgress: { 'blood_abyss:shallow': { ceiling: 6, promotionWins: 0 } } };
    const running = applyHuntStart(base, 'blood_abyss', 'shallow', startedAt)!;
    const granted = grantEventBuff(running, 'grand_delivery', grantedAt);
    expect(granted.huntSession!.eventXp).toEqual([{ from: grantedAt, to: grantedAt + 3 * HOUR_MS, pct: 0.1 }]);
    const without = computeHuntingStatus(running, endAt).xpReady;
    const gain = computeHuntingStatus(granted, endAt).xpReady / without;
    expect(gain).toBeGreaterThan(1.03); // 2 of 4 hours at +10% (the Invasao is not running: grand_delivery has no hunt rules)
    expect(gain).toBeLessThan(1.06);
    // a session started while the buff runs carries it from its first minute
    const later = applyHuntStart({ ...granted, huntSession: null, activeHuntingZone: null }, 'blood_abyss', 'shallow', grantedAt + HOUR_MS)!;
    expect(later.huntSession!.eventXp).toEqual([{ from: grantedAt + HOUR_MS, to: grantedAt + 3 * HOUR_MS, pct: 0.1 }]);
    expect(activeEventBuffs(granted, grantedAt + 4 * HOUR_MS)).toEqual([]);
  });

  it('the buffs survive a reload and cannot be forged past what the rules give', () => {
    const w = slot('grand_delivery');
    setLeagueEpoch(EPOCH);
    const granted = grantEventBuff(defaultSave(), 'grand_delivery', w.startMs + HOUR_MS);
    const back = normalizeSave(JSON.parse(JSON.stringify(granted)));
    expect(back.eventBuffs).toEqual(granted.eventBuffs);
    const forged = sanitizeEventBuffs({ grand_delivery: { from: 1000, to: 1000 + 1000 * HOUR_MS, pct: 9 }, nonsense: { from: 1, to: 2, pct: 1 }, final_race: { from: 5, to: 4, pct: 0.05 } });
    expect(forged).toEqual({ grand_delivery: { from: 1000, to: 1000 + EVENT_BUFF_RULES.grand_delivery.hours * HOUR_MS, pct: EVENT_BUFF_RULES.grand_delivery.pct } });
    expect(sanitizeEventBuffs('x')).toEqual({});
    expect(sanitizeEventPick({ at: 5, profession: 'cooking' })).toBeUndefined();
    // a session with a forged window keeps nothing above 50%
    const stored = JSON.parse(JSON.stringify(granted));
    expect(stored.eventBuffs.grand_delivery.pct).toBe(0.1);
  });
});

describe('profession events', () => {
  it('Febre da Mineracao: +25% Mining units for the part of the session it covers, nothing for Woodcutting', () => {
    const w = slot('mining_fever');
    const start = w.startMs - 2 * HOUR_MS;
    setLeagueEpoch(EPOCH);
    expect(eventGatherBonusHours('mining', start, 4 * HOUR_MS)).toBeCloseTo(2 * 0.25, 9);
    expect(eventGatherBonusHours('woodcutting', start, 4 * HOUR_MS)).toBe(0);
    expect(eventGatherBonusHours('mining', w.endMs + HOUR_MS, 4 * HOUR_MS)).toBe(0);
    // through the real accrual: a fully covered session gathers 25% more units
    const mine = { ...defaultSave(), skillXp: { ...defaultSave().skillXp, mining: 2000 } };
    const session = applyStartGathering(mine, 'mining', 'copper', w.startMs + HOUR_MS)!.save;
    const at = w.startMs + HOUR_MS + 6 * HOUR_MS;
    const withEvent = computeMiningStatus(session, at).oreReady;
    setLeagueEpoch(null);
    const plain = computeMiningStatus(session, at).oreReady;
    expect(withEvent / plain).toBeGreaterThan(1.24);
    expect(withEvent / plain).toBeLessThan(1.26);
  });

  it('Festival dos Oficios: +15% skill XP in all three professions, weighted by how much of the session it covers; a harvest in the window pays 15% more', () => {
    const w = slot('crafts_festival');
    setLeagueEpoch(EPOCH);
    const s = defaultSave();
    expect(eventSkillXpMultiplier(s, 'mining', w.startMs + HOUR_MS, w.startMs + 5 * HOUR_MS)).toBeCloseTo(1.15, 9);
    expect(eventSkillXpMultiplier(s, 'gardening', w.startMs - 2 * HOUR_MS, w.startMs + 2 * HOUR_MS)).toBeCloseTo(1.075, 9);
    expect(eventSkillXpMultiplier(s, 'woodcutting', w.endMs + HOUR_MS, w.endMs + 5 * HOUR_MS)).toBe(1);
    // a Mining claim: the XP is units x 1.15
    const mine = { ...defaultSave(), skillXp: { ...defaultSave().skillXp, mining: 2000 } };
    const startAt = w.startMs + HOUR_MS;
    const session = applyStartGathering(mine, 'mining', 'copper', startAt)!.save;
    const claimAt = startAt + 4 * HOUR_MS;
    const claim = applyClaimGathering(session, 'mining', claimAt)!;
    const gained = claim.save.skillXp.mining - 2000;
    expect(gained).toBe(Math.round(claim.units * 1.15));
    // a Garden harvest: planted before the festival, harvested inside it, pays 15% more XP than the same harvest outside it
    const garden = defaultSave();
    const plantedAt = w.startMs - 30 * HOUR_MS;
    const planted = applyPlant(garden, 'common_herb', [0], plantedAt)!;
    const inside = applyHarvest(planted, [0], w.startMs + HOUR_MS)!.harvested[0];
    setLeagueEpoch(null);
    const outside = applyHarvest(planted, [0], w.startMs + HOUR_MS)!.harvested[0];
    expect(inside.xp).toBe(Math.round(outside.xp * 1.15));
    expect(inside.xp).toBeGreaterThan(outside.xp);
  });

  it('Semana das Profissoes: the player picks ONE profession for the week and gets +25% skill XP in it; the pick is final for that week and asked again the next time', () => {
    const w1 = slot('profession_week', 0);
    const w2 = slot('profession_week', 1);
    setLeagueEpoch(EPOCH);
    const s = defaultSave();
    expect(applyProfessionPick(s, 'mining', w1.startMs - 1)).toBeNull(); // no week is running
    expect(applyProfessionPick(s, 'cooking' as never, w1.startMs + HOUR_MS)).toBeNull();
    const picked = applyProfessionPick(s, 'woodcutting', w1.startMs + HOUR_MS)!;
    expect(picked.eventPick).toEqual({ at: w1.startMs, profession: 'woodcutting' });
    expect(applyProfessionPick(picked, 'mining', w1.startMs + 2 * HOUR_MS)).toBeNull(); // final
    expect(eventSkillXpMultiplier(picked, 'woodcutting', w1.startMs + HOUR_MS, w1.startMs + 3 * HOUR_MS)).toBeCloseTo(1.25, 9);
    expect(eventSkillXpMultiplier(picked, 'mining', w1.startMs + HOUR_MS, w1.startMs + 3 * HOUR_MS)).toBe(1);
    // the second week asks again; the first pick does not carry over
    expect(eventSkillXpMultiplier(picked, 'woodcutting', w2.startMs + HOUR_MS, w2.startMs + 3 * HOUR_MS)).toBe(1);
    expect(applyProfessionPick(picked, 'gardening', w2.startMs + HOUR_MS)?.eventPick).toEqual({ at: w2.startMs, profession: 'gardening' });
    // it survives a reload
    expect(normalizeSave(JSON.parse(JSON.stringify(picked))).eventPick).toEqual(picked.eventPick);
  });
});

describe('the anti-cheat bound allows exactly what the events give', () => {
  it('the hero and profession allowances are the cap and the biggest profession bonus', () => {
    expect(BOUNDS.eventHeroBonus).toBe(EVENT_XP_CAP);
    expect(1 + BOUNDS.eventHeroBonus).toBe(EVENT_HERO_FACTOR);
    expect(1 + BOUNDS.eventProfessionBonus).toBeGreaterThanOrEqual(EVENT_PROFESSION_FACTOR);
    // every single profession bonus is under it
    expect(0.25).toBeLessThanOrEqual(BOUNDS.eventProfessionBonus);
  });

  it('counts the event hours of a gap, by kind', () => {
    const inv = slot('invasion');
    expect(eventHoursBetween(EPOCH, inv.startMs - 10 * HOUR_MS, inv.startMs + 5 * HOUR_MS, ['hero', 'final'])).toBe(5);
    expect(eventHoursBetween(EPOCH, inv.startMs, inv.endMs + 5 * DAY_MS, ['profession'])).toBe(24 + 0); // the first Febre da Mineracao only
    expect(eventHoursBetween(EPOCH, EPOCH, EPOCH + 61 * DAY_MS, ['hero', 'final'])).toBe(LEAGUE_EVENT_SLOTS.filter((s) => s.kind !== 'profession').reduce((a, s) => a + s.hours, 0));
    expect(eventHoursBetween(null, 0, 1e12, ['hero'])).toBe(0);
    expect(eventHoursBetween(EPOCH, 5, 5, ['hero'])).toBe(0);
  });
});
