import { describe, expect, it } from 'vitest';
import { defaultSave } from '../engine';
import { HUNTING_ZONES } from '../huntingZones';
import { defaultZone, depthsOpen, fmtRate, fmtSpan, startBlockedReason, zoneState } from '../huntView';

describe('Hunt screen helpers', () => {
  it('rates: one decimal under 10, whole numbers from 10, never negative or NaN', () => {
    expect(fmtRate(0.84)).toMatch(/^0[.,]8$/);
    expect(fmtRate(4.26)).toMatch(/^4[.,]3$/);
    expect(fmtRate(9.96)).toBe('10');
    expect(fmtRate(412.4)).toBe('412');
    expect(fmtRate(0)).toBe('0');
    expect(fmtRate(-3)).toBe('0');
    expect(fmtRate(Number.NaN)).toBe('0');
  });

  it('spans read as hours + minutes, minutes, or seconds', () => {
    expect(fmtSpan(4 * 3600 * 1000 + 5 * 60 * 1000)).toBe('4h 05m');
    expect(fmtSpan(12 * 60 * 1000)).toBe('12m');
    expect(fmtSpan(45 * 1000)).toBe('45s');
    expect(fmtSpan(-5)).toBe('0s');
  });

  it('zone state: locked by floor, hard when not even the shallow depth is open, ok otherwise', () => {
    const [glade, marsh] = HUNTING_ZONES;
    const save = { ...defaultSave(), highestDungeonFloor: 30 };
    // the third argument is the equipment index (gearIndex.ts): a fresh hero is 0, the marsh asks 1.4 to start and 1.9 for its deep depth
    expect(zoneState(glade, save, 0)).toBe('ok');
    expect(zoneState(marsh, save, 0)).toBe('hard');
    expect(zoneState(marsh, save, 8)).toBe('ok');
    expect(zoneState(marsh, { ...save, highestDungeonFloor: 5 }, 8)).toBe('locked');
    expect(depthsOpen(marsh, 8)).toBe(3);
    expect(depthsOpen(marsh, 0)).toBe(0);
    expect(depthsOpen(marsh, 1.5)).toBe(1);
    expect(defaultZone(HUNTING_ZONES, save, 0).id).toBe(glade.id);
  });

  it('says why a hunt cannot start, in the order floor, equipment, pending reward, busy hero', () => {
    const [glade, marsh] = HUNTING_ZONES;
    const save = defaultSave();
    expect(startBlockedReason(save, glade, 'shallow', 0)).toBeNull();
    expect(startBlockedReason(save, marsh, 'shallow', 8)?.key).toBe('hunting.startLocked');
    // the marsh shallow asks index 1.4: "a tier 1 +4 set" is the smallest common set that reaches it
    expect(startBlockedReason({ ...save, highestDungeonFloor: 30 }, marsh, 'shallow', 0)).toEqual({ key: 'hunting.startNeedGear', vars: { tier: 1, refine: 4 } });
    expect(startBlockedReason({ ...save, activeOreId: 'copper' }, glade, 'shallow', 0)?.key).toBe('hunting.startBusy');
  });
});
