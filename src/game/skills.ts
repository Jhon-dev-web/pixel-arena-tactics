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

// C2-B profession curve (Mining/Woodcutting ONLY — Gardening keeps its original exponential curve
// below untouched; see tunables.ts skills.professionBand*/professionGrowth* for the rationale). 4
// bands, continuous at every boundary — mirrors engine.ts's heroBandTable exactly (same construction,
// same "each band's base is the previous band's own need() at its last level" rule).
function professionBandTable(): { from: number; base: number; growth: number }[] {
  const s = T.skills;
  const bounds = [1, s.professionBand1To + 1, s.professionBand2To + 1, s.professionBand3To + 1];
  const growths = [s.professionGrowth1, s.professionGrowth2, s.professionGrowth3, s.professionGrowth4];
  const bands: { from: number; base: number; growth: number }[] = [];
  let base = s.professionXpBase;
  for (let i = 0; i < bounds.length; i++) {
    bands.push({ from: bounds[i], base, growth: growths[i] });
    if (i + 1 < bounds.length) base *= Math.pow(growths[i], bounds[i + 1] - 1 - bounds[i]);
  }
  return bands;
}
function professionNeed(level: number): number {
  const bands = professionBandTable();
  let band = bands[0];
  for (const b of bands) {
    if (b.from > level) break;
    band = b;
  }
  return Math.round(band.base * Math.pow(band.growth, level - band.from));
}
function professionXpToReachLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += professionNeed(l);
  return total;
}

export function skillXpForNextLevel(level: number, skillId: SkillId): number {
  if (isProfession(skillId)) return professionNeed(level);
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
// share the exact same C2-B XP curve, so 'mining' here is just a representative profession id.
export function gatherPower(basePower: number, xp: number): number {
  return basePower + skillLevel(xp, 'mining') * T.skills.powerPerLevel;
}
