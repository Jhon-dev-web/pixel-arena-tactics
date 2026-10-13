import { computeCP, SaveData } from './engine';
import { depthOfStage, isDepthStage, recommendedCpForFloor } from './dungeon';
import { recommendedCpForDepth } from './depths';
import { nextStep, NextStep, NextStepId } from './nextStep';

// What the first Dungeon defeat screen tells the player, as plain numbers (the locale lines are picked in BattleModal): what was kept, how the hero's
// CP compares with the floor where the run ended, and ONE concrete suggestion. A pure function of the pre-run save, the stage reached and the loot.

export type DefeatTip =
  | { kind: 'step'; step: NextStep }
  | { kind: 'hunt' } // the hero is weaker than the floor asks: hunting is where levels and materials come from
  | { kind: 'retry' }; // CP is fine: it was a close fight

export interface DefeatSummary {
  stage: number; // the stage the hero fell on
  stagesCleared: number;
  goldTotal: number;
  goldKept: number;
  goldLost: number;
  cp: number;
  recommended: number;
  below: boolean;
  tip: DefeatTip;
}

// The nextStep ids that make sense right after a loss; the others ("keep running", "a milestone is close", "start a hunt") are replaced by a reading of the CP gap.
const USEFUL_AFTER_DEFEAT: readonly NextStepId[] = ['bag_full', 'forge', 'skill_points', 'attribute_points', 'new_zone'];

export function defeatSummary(save: SaveData, stage: number, stagesCleared: number, goldTotal: number, goldKept: number): DefeatSummary {
  const cp = computeCP(save);
  const recommended = isDepthStage(stage) ? recommendedCpForDepth(depthOfStage(stage)) : recommendedCpForFloor(stage);
  const below = cp < recommended;
  const step = nextStep(save);
  const tip: DefeatTip = USEFUL_AFTER_DEFEAT.includes(step.id) ? { kind: 'step', step } : below ? { kind: 'hunt' } : { kind: 'retry' };
  return { stage, stagesCleared, goldTotal, goldKept, goldLost: Math.max(0, goldTotal - goldKept), cp, recommended, below, tip };
}
