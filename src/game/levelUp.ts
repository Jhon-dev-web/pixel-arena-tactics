import { GEAR } from './gear';
import { skillPointsEarned } from './heroSkills';

// What a batch of levels gave, as plain numbers for the level-up banner (the locale lines are picked in the component). One batch = every level gained since the banner
// was last dismissed (a long absence that pays several levels at once shows ONE "+3 levels"). A pure function of the two levels.

export interface LevelUpSummary {
  from: number;
  to: number;
  gained: number;
  attributePoints: number; // 3 per level
  skillPoints: number; // one every T.heroSkills.pointEveryLevels levels
  recipes: string[]; // forge pieces (GEAR ids) whose level gate was crossed
}

export const ATTRIBUTE_POINTS_PER_LEVEL = 3;

export function levelUpSummary(from: number, to: number): LevelUpSummary | null {
  if (!(to > from)) return null;
  const recipes = GEAR.filter((g) => !g.unique && g.recipe?.requiredLevel !== undefined && g.recipe.requiredLevel > from && g.recipe.requiredLevel <= to).map((g) => g.id);
  return {
    from,
    to,
    gained: to - from,
    attributePoints: (to - from) * ATTRIBUTE_POINTS_PER_LEVEL,
    skillPoints: Math.max(0, skillPointsEarned(to) - skillPointsEarned(from)),
    recipes,
  };
}

// A batch that is still on screen grows (a second level-up before the banner is gone): the same banner starts from its first level and ends at the latest.
export function extendLevelUp(current: LevelUpSummary | null, from: number, to: number): LevelUpSummary | null {
  return levelUpSummary(current ? current.from : from, to);
}
