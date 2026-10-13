import { computeCP, SaveData } from './engine';
import { questMaxRefine } from './gearInstances';
import { skillLevel } from './skills';
import { QuestContext } from './quests';
import { statsOf } from './stats';

// Everything the achievements read from a save, in one place (the quests screen, the nav badge and the claim all build it the same way).
export function questContext(save: SaveData): QuestContext {
  return {
    cp: computeCP(save),
    maxRefine: questMaxRefine(save),
    stats: statsOf(save),
    skillLevels: {
      mining: skillLevel(save.skillXp.mining, 'mining'),
      woodcutting: skillLevel(save.skillXp.woodcutting, 'woodcutting'),
      gardening: skillLevel(save.skillXp.gardening, 'gardening'),
    },
  };
}
