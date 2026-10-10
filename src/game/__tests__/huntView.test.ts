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
    expect(zoneState(glade, save, 100)).toBe('ok');
    expect(zoneState(marsh, save, 100)).toBe('hard');
    expect(zoneState(marsh, save, 10_000)).toBe('ok');
    expect(zoneState(marsh, { ...save, highestDungeonFloor: 5 }, 10_000)).toBe('locked');
    expect(depthsOpen(marsh, 10_000)).toBe(3);
    expect(depthsOpen(marsh, 100)).toBe(0);
    expect(defaultZone(HUNTING_ZONES, save, 100).id).toBe(glade.id);
  });

  it('says why a hunt cannot start, in the order floor, CP, pending reward, busy hero', () => {
    const [glade, marsh] = HUNTING_ZONES;
    const save = defaultSave();
    expect(startBlockedReason(save, glade, 'shallow', 100)).toBeNull();
    expect(startBlockedReason(save, marsh, 'shallow', 10_000)?.key).toBe('hunting.startLocked');
    expect(startBlockedReason({ ...save, highestDungeonFloor: 30 }, marsh, 'shallow', 100)?.key).toBe('hunting.startNeedCp');
    expect(startBlockedReason({ ...save, activeOreId: 'copper' }, glade, 'shallow', 100)?.key).toBe('hunting.startBusy');
  });
});
