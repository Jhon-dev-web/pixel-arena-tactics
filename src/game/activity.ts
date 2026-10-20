import type { SaveData } from './engine';

// What the hero is busy with. ONE task at a time: a Hunt, Mining, Woodcutting, a Dungeon run or a Forge / Oficios production job. The Garden is not a task of the hero and always runs in
// parallel. The first three and the production job live in the save; the Dungeon run only exists on screen (App.tsx knows it), so it is not listed here.
export type HeroActivity = 'hunt' | 'mining' | 'woodcutting' | 'craft';

export function heroActivity(save: Pick<SaveData, 'activeHuntingZone' | 'activeOreId' | 'activeWoodId' | 'craftJob'>): HeroActivity | null {
  if (save.activeHuntingZone) return 'hunt';
  if (save.activeOreId) return 'mining';
  if (save.activeWoodId) return 'woodcutting';
  if (save.craftJob) return 'craft';
  return null;
}
