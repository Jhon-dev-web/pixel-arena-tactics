import { describe, expect, it } from 'vitest';
import { gatherBusyWith, gatherSessionView } from '../gatherView';

const H = 3600 * 1000;

describe('gatherSessionView', () => {
  it('a running session produced exactly the time elapsed', () => {
    const v = gatherSessionView({ capMs: 10 * H, pendingMs: 3 * H, full: false }, 3 * H);
    expect(v).toEqual({ state: 'running', elapsedMs: 3 * H, producedMs: 3 * H, capMs: 10 * H, idleMs: 0 });
  });

  it('a full storage reports the real state, the capped production and how long it has been idle', () => {
    const v = gatherSessionView({ capMs: 10 * H, pendingMs: 10 * H, full: true }, 29 * H);
    expect(v.state).toBe('full');
    expect(v.producedMs).toBe(10 * H);
    expect(v.elapsedMs).toBe(29 * H);
    expect(v.idleMs).toBe(19 * H);
  });

  it('never shows more produced time than the cap, and ignores a bad clock', () => {
    expect(gatherSessionView({ capMs: 6 * H, pendingMs: 9 * H, full: true }, 9 * H).producedMs).toBe(6 * H);
    const bad = gatherSessionView({ capMs: 6 * H, pendingMs: 0, full: false }, Number.NaN);
    expect(bad.elapsedMs).toBe(0);
    expect(bad.state).toBe('running');
  });

  it('a zero cap is never "full"', () => {
    expect(gatherSessionView({ capMs: 0, pendingMs: 0, full: true }, H).state).toBe('running');
  });
});

describe('gatherBusyWith', () => {
  const idle = { activeHuntingZone: null, activeOreId: null, activeWoodId: null, craftJob: null };
  it('is null when nothing else keeps the hero busy', () => {
    expect(gatherBusyWith(idle, 'mining')).toBeNull();
  });
  it('names the other activity', () => {
    expect(gatherBusyWith({ ...idle, activeWoodId: 'common_wood' }, 'mining')).toBe('woodcutting');
    expect(gatherBusyWith({ ...idle, activeOreId: 'copper' }, 'woodcutting')).toBe('mining');
    expect(gatherBusyWith({ ...idle, activeHuntingZone: 'demon_glade' }, 'mining')).toBe('hunt');
  });
  it("the screen's own session is not 'another' activity", () => {
    expect(gatherBusyWith({ ...idle, activeOreId: 'copper' }, 'mining')).toBeNull();
  });
});
