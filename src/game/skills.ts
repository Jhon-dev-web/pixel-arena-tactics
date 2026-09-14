import T from './tunables';

// Gathering skills — separate from character level entirely. Each levels up purely from doing the
// activity (XP per unit mined/chopped, per Garden harvest), never from combat/quests/anything else.
// Tier gates (ores.ts/woodcutting.ts/garden.ts requiredLevel) check these, not character level or
// tool ownership — there is exactly one Mining tool and one Woodcutting tool, forever (see gear.ts).
export type SkillId = 'mining' | 'woodcutting' | 'gardening';

export function emptySkillXp(): Record<SkillId, number> {
  return { mining: 0, woodcutting: 0, gardening: 0 };
}

export function skillXpForNextLevel(level: number): number {
  return Math.round(T.skills.xpBase * Math.pow(T.skills.xpGrowth, level - 1));
}

export function skillLevel(xp: number): number {
  let level = 1;
  let total = 0;
  while (level < T.skills.maxLevel) {
    const need = skillXpForNextLevel(level);
    if (xp < total + need) return level;
    total += need;
    level++;
  }
  return T.skills.maxLevel;
}

export function skillXpToReachLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += skillXpForNextLevel(l);
  return total;
}

// Fraction (0-1) of the way from the current level to the next — used to render a progress bar
// without ever exposing the raw XP numbers (those stay hidden, same policy as character XP).
export function skillLevelProgress(xp: number): number {
  const level = skillLevel(xp);
  if (level >= T.skills.maxLevel) return 1;
  const base = skillXpToReachLevel(level);
  const need = skillXpForNextLevel(level);
  if (need <= 0) return 0;
  return Math.max(0, Math.min(1, (xp - base) / need));
}

// Mining/Woodcutting no longer have tiered tools — the single starting tool's power is boosted by
// skill level instead, so gathering throughput still scales with progression (see tunables.ts
// powerPerLevel comment for why this replaces the old per-tool power table).
export function gatherPower(basePower: number, xp: number): number {
  return basePower + skillLevel(xp) * T.skills.powerPerLevel;
}
