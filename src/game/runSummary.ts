import { playerLevel, SaveData } from './engine';
import { dungeonRunXp, milestoneXpBonus } from './dungeon';
import { characterXpBonusPct } from './heroSkills';

// The character XP a finished Dungeon descent pays (App.finishRun banks exactly this number, and the result screen prints it), the Season Relic bonus included.
// XP is paid for the floors cleared whether the run ended in a retreat or a defeat.
export function dungeonRunXpGain(save: SaveData, startFloor: number, stages: number): number {
  const cleared = Math.max(0, stages);
  return Math.round((dungeonRunXp(startFloor, cleared) + milestoneXpBonus(startFloor, cleared)) * (1 + characterXpBonusPct(save) / 100));
}

// The XP of a descent and how many levels it adds to this hero.
export function dungeonRunGain(save: SaveData, startFloor: number, stages: number): { xp: number; levels: number } {
  const xp = dungeonRunXpGain(save, startFloor, stages);
  return { xp, levels: Math.max(0, playerLevel(save.xp + xp) - playerLevel(save.xp)) };
}
