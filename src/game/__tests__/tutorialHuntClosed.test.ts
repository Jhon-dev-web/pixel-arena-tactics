import { describe, expect, it } from 'vitest';
import { stepWhenHuntScreenClosed } from '../tutorialSteps';

describe('the "start the hunt" tutorial step needs the Hunt screen', () => {
  it('goes back to the Caça entry step when the screen is closed and no hunt runs', () => {
    expect(stepWhenHuntScreenClosed('huntModal', false, { activeHuntingZone: null })).toBe('hunt');
  });
  it('stays while the screen is open', () => {
    expect(stepWhenHuntScreenClosed('huntModal', true, { activeHuntingZone: null })).toBe('huntModal');
  });
  it('is left alone once a hunt runs (the step is about to finish) and for other steps', () => {
    expect(stepWhenHuntScreenClosed('huntModal', false, { activeHuntingZone: 'demon_glade' })).toBe('huntModal');
    expect(stepWhenHuntScreenClosed('hunt', false, { activeHuntingZone: null })).toBe('hunt');
    expect(stepWhenHuntScreenClosed('dungeon', false, { activeHuntingZone: null })).toBe('dungeon');
  });
});
