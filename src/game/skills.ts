import T from './tunables';

// Gathering skills — separate from character level entirely. Each levels up purely from doing the
// activity (XP per unit mined/chopped, per Garden harvest), never from combat/quests/anything else.
// Tier gates (ores.ts/woodcutting.ts/garden.ts requiredLevel) check these, not character level or
// tool ownership — there is exactly one Mining tool and one Woodcutting tool, forever (see gear.ts).
export type SkillId = 'mining' | 'woodcutting' | 'gardening';

export function emptySkillXp(): Record<SkillId, number> {
  return { mining: 0, woodcutting: 0, gardening: 0 };
}

const isProfession = (skillId: SkillId): boolean => skillId === 'mining' || skillId === 'woodcutting';

// Modelo C profession curve (Mining/Woodcutting ONLY — Gardening keeps its original exponential curve
// below untouched; see CHAMPIONSHIP_45_DAY_CURVE_OPTIONS.md / CHAMPIONSHIP_45_DAY_OPTIMAL_STRATEGIES.md
// for the approval and search validation). Cumulative XP required to REACH `level` (level 1 = 0 XP):
// professionXpCoeff x (level-1)^professionXpExponent. skillXpForNextLevel derives the per-level step
// from this directly, so the two never drift apart.
function professionXpToReachLevel(level: number): number {
  return Math.round(T.skills.professionXpCoeff * Math.pow(Math.max(0, level - 1), T.skills.professionXpExponent));
}

export function skillXpForNextLevel(level: number, skillId: SkillId): number {
  if (isProfession(skillId)) return professionXpToReachLevel(level + 1) - professionXpToReachLevel(level);
  return Math.round(T.skills.xpBase * Math.pow(T.skills.xpGrowth, level - 1));
}

export function skillLevel(xp: number, skillId: SkillId): number {
  let level = 1;
  let total = 0;
  while (level < T.skills.maxLevel) {
    const need = skillXpForNextLevel(level, skillId);
    if (xp < total + need) return level;
    total += need;
    level++;
  }
  return T.skills.maxLevel;
}

export function skillXpToReachLevel(level: number, skillId: SkillId): number {
  if (isProfession(skillId)) return professionXpToReachLevel(level);
  let total = 0;
  for (let l = 1; l < level; l++) total += skillXpForNextLevel(l, skillId);
  return total;
}

// Fraction (0-1) of the way from the current level to the next — used to render a progress bar
// without ever exposing the raw XP numbers (those stay hidden, same policy as character XP).
export function skillLevelProgress(xp: number, skillId: SkillId): number {
  const level = skillLevel(xp, skillId);
  if (level >= T.skills.maxLevel) return 1;
  const base = skillXpToReachLevel(level, skillId);
  const need = skillXpForNextLevel(level, skillId);
  if (need <= 0) return 0;
  return Math.max(0, Math.min(1, (xp - base) / need));
}

// Mining/Woodcutting no longer have tiered tools — the single starting tool's power is boosted by
// skill level instead, so gathering throughput still scales with progression (see tunables.ts
// powerPerLevel comment for why this replaces the old per-tool power table). Mining and Woodcutting
// share the exact same XP curve under Modelo C, so 'mining' here is just a representative profession id.
export function gatherPower(basePower: number, xp: number): number {
  return basePower + skillLevel(xp, 'mining') * T.skills.powerPerLevel;
}
