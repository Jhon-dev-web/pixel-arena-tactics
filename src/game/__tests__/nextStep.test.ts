import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { attributePointsAvailable, craftableUpgrade, nextStep } from '../nextStep';
import { inventoryCapacity, STACK_LIMIT } from '../inventory';

// A hero with every point spent and nothing running, so each test switches exactly one thing on.
const quiet = (): SaveData => {
  const s = defaultSave();
  const level = 1;
  return { ...s, xp: 0, str: level * 3, vit: 0, agi: 0, res: 0, highestDungeonFloor: 0, huntProgress: { 'demon_glade:shallow': { ceiling: 1, promotionWins: 0 } } as SaveData['huntProgress'] };
};
const atLevel = (s: SaveData, xp: number): SaveData => ({ ...s, xp });

describe('nextStep (Home "próximo passo")', () => {
  it('a quiet hero with nothing running is told to start a hunt', () => {
    expect(nextStep(quiet())).toMatchObject({ id: 'start_hunt', target: 'hunt' });
  });

  it('something already running -> "everything is running" (no button)', () => {
    expect(nextStep({ ...quiet(), activeOreId: 'copper' })).toMatchObject({ id: 'running', target: 'none' });
    expect(nextStep({ ...quiet(), activeHuntingZone: 'demon_glade' })).toMatchObject({ id: 'running' });
  });

  it('a full bag outranks everything else', () => {
    const s = quiet();
    const full: SaveData = { ...s, materials: { ...s.materials, leather_scrap: inventoryCapacity(s) * STACK_LIMIT }, activeOreId: 'copper' };
    expect(nextStep({ ...full, str: 0 })).toMatchObject({ id: 'bag_full', target: 'inventory' });
  });

  it('unspent attribute points are reported (3 per level)', () => {
    const s = { ...quiet(), str: 0 };
    expect(attributePointsAvailable(s)).toBe(3);
    expect(nextStep({ ...s, activeOreId: 'copper' })).toMatchObject({ id: 'attribute_points', target: 'hero', params: { n: 3 } });
  });

  it('unspent skill points beat attribute points', () => {
    // level 5 earns the first skill point (see heroSkills.skillPointsEarned)
    const s = { ...quiet(), str: 0, activeOreId: 'copper' };
    let found: SaveData | null = null;
    for (let xp = 0; xp < 5_000_000 && !found; xp = xp ? xp * 2 : 100) {
      const c = atLevel(s, xp);
      if (nextStep(c).id === 'skill_points') found = c;
    }
    expect(found).not.toBeNull();
  });

  it('a hunting zone the player never hunted in is suggested once its floor is reached, and goes away after the first session there', () => {
    const base = { ...quiet(), activeOreId: 'copper', huntProgress: {} as SaveData['huntProgress'], highestDungeonFloor: 0 };
    expect(nextStep(base)).toMatchObject({ id: 'new_zone', target: 'hunt' });
    const hunted = { ...base, huntProgress: { 'demon_glade:shallow': { ceiling: 1, promotionWins: 0 } } as SaveData['huntProgress'] };
    expect(nextStep(hunted).id).toBe('running');
  });

  it('a dungeon milestone a few floors away is suggested', () => {
    const s = { ...quiet(), activeOreId: 'copper', highestDungeonFloor: 23 };
    expect(nextStep(s)).toMatchObject({ id: 'milestone', target: 'dungeon' });
    expect(nextStep({ ...s, highestDungeonFloor: 1 }).id).not.toBe('milestone');
  });

  it('a forgeable better piece is suggested before points and zones', () => {
    const s = defaultSave();
    const rich: SaveData = {
      ...s,
      gold: 100000,
      xp: 0,
      str: 3,
      activeOreId: 'copper',
      materials: { ...s.materials, copper_bar: 5, wood_handle_common: 5, leather: 30, leather_scrap: 30 },
    };
    expect(craftableUpgrade(rich)).not.toBeNull();
    expect(nextStep(rich)).toMatchObject({ id: 'forge', target: 'forge' });
    expect(craftableUpgrade({ ...rich, gold: 0 })).toBeNull();
  });

  it('is a pure read: the save is not touched', () => {
    const s = quiet();
    const copy = JSON.stringify(s);
    nextStep(s);
    expect(JSON.stringify(s)).toBe(copy);
  });
});

