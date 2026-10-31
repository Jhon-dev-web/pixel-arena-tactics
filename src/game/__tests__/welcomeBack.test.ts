import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { applyHuntStart, applyHuntStop } from '../huntLifecycle';
import { applyStartGathering } from '../gathering';
import { applyPlant } from '../gardenActions';
import { applyDeliveryAccept, ensureDeliveryOffers } from '../deliveries';
import { HUNTING_ZONES } from '../huntingZones';
import { emptyMaterials } from '../materials';
import { skillXpToReachLevel } from '../skills';
import { awayFor, awayLongEnough, buildWelcomeBack, readLastSeen, splitMaterials, writeLastSeen } from '../welcomeBack';
import { buildLeagueHero, buildNewLeagueHero } from '../leagueReset';
import { welcomeRowText } from '../../components/welcomeBackText';
import { mulberry32 } from '../../../scripts/sim/driver';

const HOUR = 3600 * 1000;
const T0 = new Date(2026, 9, 10, 9, 0, 0).getTime();
const base = (): SaveData => ({
  ...defaultSave(),
  lastMiningClaim: T0,
  lastWoodcuttingClaim: T0,
  huntingOfflineStart: T0,
  skillXp: { mining: skillXpToReachLevel(5, 'mining'), woodcutting: 0, gardening: skillXpToReachLevel(5, 'gardening') },
});

describe('welcome back summary (welcomeBack.ts)', () => {
  it('a fresh hero that did nothing has nothing to show', () => {
    expect(buildWelcomeBack(base(), T0 + 5 * HOUR).rows).toEqual([]);
  });

  // The owner's rule is "half an hour": written in minutes here on purpose, so changing the limit in the code cannot pass by moving a constant along with it.
  it("29 minutes away shows nothing, 30 shows the summary, counted from the account's own last-seen stamp", () => {
    const MIN = 60 * 1000;
    const mining = applyStartGathering(base(), 'mining', 'copper', T0)!.save;
    const left = 'half-hour-account';
    writeLastSeen(T0, left);
    const at = (minutes: number) => {
      const now = T0 + minutes * MIN;
      return awayLongEnough(readLastSeen(left), now) ? buildWelcomeBack(mining, now).rows.length : 0;
    };
    expect(at(29)).toBe(0);
    expect(at(30)).toBeGreaterThan(0);
    // a stamp that was never written is a first session, never "away"
    expect(awayLongEnough(readLastSeen('never-seen-account'), T0 + 5 * HOUR)).toBe(false);
    expect(awayLongEnough(null, T0)).toBe(false);
  });

  it('says how long the player was away, and nothing when the last visit is unknown or not in the past', () => {
    expect(awayFor(T0, T0 + 17 * HOUR + 2 * 60 * 1000)).toBe(17 * HOUR + 2 * 60 * 1000);
    expect(awayFor(null, T0)).toBeNull();
    expect(awayFor(T0 + HOUR, T0)).toBeNull();
    expect(awayFor(Number.NaN, T0)).toBeNull();
  });

  it('a brand-new hero (online create path and league-reset rebuild) is idle with nothing produced, and has no last visit', () => {
    const later = Date.now() + 8 * HOUR;
    for (const hero of [buildNewLeagueHero(1_000), buildNewLeagueHero(null), buildLeagueHero({ heroName: 'Old' }, 1_000, true)]) {
      expect(hero.activeOreId).toBeNull();
      expect(hero.activeWoodId).toBeNull();
      expect(hero.activeHuntingZone).toBeNull();
      expect(buildWelcomeBack(hero, later).rows).toEqual([]);
    }
    // A second account on the same browser does not inherit the first one's stamp, and a new account has none.
    writeLastSeen(T0, 'old-account');
    expect(readLastSeen('new-account')).toBeNull();
    expect(awayLongEnough(readLastSeen('new-account'), T0 + 5 * HOUR)).toBe(false);
  });

  it('a returning player (stamp older than half an hour) still gets the summary', () => {
    writeLastSeen(T0, 'returning');
    const mining = applyStartGathering(base(), 'mining', 'copper', T0)!.save;
    const now = T0 + 3 * HOUR;
    expect(awayLongEnough(readLastSeen('returning'), now)).toBe(true);
    expect(buildWelcomeBack(mining, now).rows.some((r) => r.kind === 'mining')).toBe(true);
  });

  it('a running hunt lists time hunted, kills and the rarest materials first, and says when the storage cap was hit', () => {
    const started = applyHuntStart(base(), HUNTING_ZONES[0].id, 'shallow', T0)!;
    const mid = buildWelcomeBack(started, T0 + 3 * HOUR).rows.find((r) => r.kind === 'hunt');
    expect(mid).toBeDefined();
    if (mid?.kind !== 'hunt') return;
    expect(mid.kills).toBeGreaterThan(0);
    expect(mid.timeMs).toBe(3 * HOUR);
    expect(mid.mats.length).toBeGreaterThan(0);
    expect(mid.capHit).toBe(false);
    const past = buildWelcomeBack(started, T0 + 200 * HOUR).rows.find((r) => r.kind === 'hunt');
    expect(past && past.kind === 'hunt' && past.capHit).toBe(true);
  });

  it('a card shows at most four materials and counts the rest as "+N": nothing is hidden in silence', () => {
    const started = applyHuntStart(base(), HUNTING_ZONES[0].id, 'shallow', T0)!;
    const row = buildWelcomeBack(started, T0 + 200 * HOUR).rows.find((r) => r.kind === 'hunt');
    expect(row?.kind).toBe('hunt');
    if (row?.kind !== 'hunt') return;
    // the row keeps everything the hunt found; this zone drops more than four kinds over 200 hours, so the limit really bites
    expect(row.mats.length).toBeGreaterThan(4);
    const text = welcomeRowText(row);
    expect(text.mats.length).toBe(4);
    expect(text.more).toBe(row.mats.length - 4);
    expect(text.mats.map((m) => m.id)).toEqual(row.mats.slice(0, 4).map((m) => m.id));
    // and the pure split agrees on the edges
    const five = row.mats.slice(0, 5);
    expect(splitMaterials(five.slice(0, 4))).toEqual({ shown: five.slice(0, 4), more: 0 });
    expect(splitMaterials(five)).toEqual({ shown: five.slice(0, 4), more: 1 });
  });

  it('a full storage is a badge on the card, not a piece of its sentence', () => {
    const started = applyHuntStart(base(), HUNTING_ZONES[0].id, 'shallow', T0)!;
    const row = buildWelcomeBack(started, T0 + 200 * HOUR).rows.find((r) => r.kind === 'hunt');
    if (row?.kind !== 'hunt') throw new Error('no hunt row');
    expect(row.capHit).toBe(true);
    const text = welcomeRowText(row);
    expect(text.badges.length).toBe(1);
    expect(text.detail).not.toContain(text.badges[0].text);
    expect(welcomeRowText({ ...row, capHit: false }).badges).toEqual([]);
  });

  it('a hunt whose reward already waits is not listed (its own screen shows it)', () => {
    const started = applyHuntStart(base(), HUNTING_ZONES[0].id, 'shallow', T0)!;
    const stopped = applyHuntStop(started, T0 + 2 * HOUR)!;
    expect(buildWelcomeBack(stopped, T0 + 2 * HOUR).rows.some((r) => r.kind === 'hunt')).toBe(false);
  });

  it('mining and woodcutting list what they gathered; garden and delivery are listed when ready', () => {
    let s = applyStartGathering(base(), 'mining', 'copper', T0)!.save;
    s = applyPlant(s, 'common_herb', [0], T0)!;
    s = ensureDeliveryOffers(s, T0, mulberry32(1), false);
    const offer = s.deliveries.offers[0];
    s = { ...s, materials: { ...emptyMaterials(), ...Object.fromEntries(Object.entries(offer.items).map(([m, q]) => [m, (q as number) + 5])) } as SaveData['materials'] };
    s = applyDeliveryAccept(s, offer.id, T0, mulberry32(2), false)!;
    const rows = buildWelcomeBack(s, T0 + 200 * HOUR).rows;
    expect(rows.map((r) => r.kind).sort()).toEqual(['delivery', 'garden', 'mining']);
    const mining = rows.find((r) => r.kind === 'mining');
    expect(mining && mining.kind === 'mining' && mining.units).toBeGreaterThan(0);
    // each row maps to exactly one action button
    expect(rows.map((r) => welcomeRowText(r).action).sort()).toEqual(['delivery', 'garden', 'mining']);
  });

  it('is a pure read: building the summary changes nothing', () => {
    const s = applyStartGathering(base(), 'mining', 'copper', T0)!.save;
    const before = JSON.stringify(s);
    buildWelcomeBack(s, T0 + 10 * HOUR);
    expect(JSON.stringify(s)).toBe(before);
  });
});
