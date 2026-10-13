import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { applyHuntStart, applyHuntStop } from '../huntLifecycle';
import { applyStartGathering } from '../gathering';
import { applyPlant } from '../gardenActions';
import { applyDeliveryAccept, ensureDeliveryOffers } from '../deliveries';
import { HUNTING_ZONES } from '../huntingZones';
import { emptyMaterials } from '../materials';
import { skillXpToReachLevel } from '../skills';
import { awayLongEnough, buildWelcomeBack, WELCOME_BACK_AWAY_MS } from '../welcomeBack';
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

  it('is away only after ten minutes (or when the last visit is unknown)', () => {
    expect(awayLongEnough(T0, T0 + WELCOME_BACK_AWAY_MS - 1)).toBe(false);
    expect(awayLongEnough(T0, T0 + WELCOME_BACK_AWAY_MS)).toBe(true);
    expect(awayLongEnough(null, T0)).toBe(true);
  });

  it('a running hunt lists time hunted, kills and the rarest materials first, and says when the storage cap was hit', () => {
    const started = applyHuntStart(base(), HUNTING_ZONES[0].id, 'shallow', T0)!;
    const mid = buildWelcomeBack(started, T0 + 3 * HOUR).rows.find((r) => r.kind === 'hunt');
    expect(mid).toBeDefined();
    if (mid?.kind !== 'hunt') return;
    expect(mid.kills).toBeGreaterThan(0);
    expect(mid.timeMs).toBe(3 * HOUR);
    expect(mid.top.length).toBeGreaterThan(0);
    expect(mid.top.length).toBeLessThanOrEqual(3);
    expect(mid.capHit).toBe(false);
    const past = buildWelcomeBack(started, T0 + 200 * HOUR).rows.find((r) => r.kind === 'hunt');
    expect(past && past.kind === 'hunt' && past.capHit).toBe(true);
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
