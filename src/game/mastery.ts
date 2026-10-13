import { GEMS, GemId } from './gems';
import { ORE_TIERS } from './ores';
import { PLANTS, PlantDef } from './garden';
import type { SkillId } from './skills';
import T from './tunables';
import { WOOD_TIERS } from './woodcutting';

// Profession mastery (Round 12): every profession has something to unlock at regular intervals up to its cap (75). Mining and Woodcutting unlock their tiers
// (ores.ts / woodcutting.ts) and, at the four mastery levels, a perk; Gardening unlocks plants (garden.ts) and the same four perks. Every perk is a pure function of the
// profession level and DETERMINISTIC (extra units, a by-product per N units, a faster plant): no rolls, so a claim is reproducible and the progression simulator, whose
// professions stay below level 50 inside its 21 days, is untouched. Numbers live in T.mastery; the screens read them from here.

export type MasteryPerkId =
  | 'gather_yield_1' // Mining / Woodcutting
  | 'gather_dust'
  | 'gather_yield_2'
  | 'gather_gem'
  | 'garden_speed_1' // Gardening
  | 'garden_speed_2'
  | 'garden_dust'
  | 'garden_rare';

export interface MasteryPerk {
  id: MasteryPerkId;
  level: number;
  // Placeholders the description fills (percent as 4 = 4%), generated from T.mastery so the text can never drift from the code.
  params: Record<string, number>;
}

const levels = () => [T.mastery.levelA, T.mastery.levelB, T.mastery.levelC, T.mastery.levelD];

export function masteryPerks(skill: SkillId): MasteryPerk[] {
  const [a, b, c, d] = levels();
  const m = T.mastery;
  if (skill === 'gardening') {
    return [
      { id: 'garden_speed_1', level: a, params: { n: Math.round(m.gardenSpeedPct * 100) } },
      { id: 'garden_speed_2', level: b, params: { n: Math.round(m.gardenSpeedPct * 100), total: Math.round(m.gardenSpeedPct * 200) } },
      { id: 'garden_dust', level: c, params: { n: m.gardenDustHours } },
      { id: 'garden_rare', level: d, params: { n: m.gardenRareBonus } },
    ];
  }
  return [
    { id: 'gather_yield_1', level: a, params: { n: Math.round(m.gatherYieldPct * 100) } },
    { id: 'gather_dust', level: b, params: { n: m.gatherDustUnits } },
    { id: 'gather_yield_2', level: c, params: { n: Math.round(m.gatherYieldPct * 100), total: Math.round(m.gatherYieldPct * 200) } },
    { id: 'gather_gem', level: d, params: { n: m.gatherGemUnits } },
  ];
}

const has = (skill: SkillId, level: number, perk: MasteryPerkId): boolean => masteryPerks(skill).some((p) => p.id === perk && level >= p.level);

// ---- Mining / Woodcutting -------------------------------------------------------------------------------------------------------------------------------

// Multiplier on the units a session produces (the two yield perks add up, they do not compound).
export function gatherMasteryMult(skill: 'mining' | 'woodcutting', level: number): number {
  return 1 + (has(skill, level, 'gather_yield_1') ? T.mastery.gatherYieldPct : 0) + (has(skill, level, 'gather_yield_2') ? T.mastery.gatherYieldPct : 0);
}

export interface GatherByProducts {
  dust: number;
  gems: Partial<Record<GemId, number>>;
}

// What a collection of `units` gives on top of the units themselves: Refining Dust at the second perk, a gem at the last one. `seed` (the skill XP) only picks which gem.
export function gatherByProducts(skill: 'mining' | 'woodcutting', level: number, units: number, seed = 0): GatherByProducts {
  const u = Math.max(0, Math.floor(units));
  const dust = has(skill, level, 'gather_dust') ? Math.floor(u / T.mastery.gatherDustUnits) : 0;
  const count = has(skill, level, 'gather_gem') ? Math.floor(u / T.mastery.gatherGemUnits) : 0;
  const gems: Partial<Record<GemId, number>> = {};
  for (let i = 0; i < count; i++) {
    const id = GEMS[(Math.floor(Math.abs(seed)) + i) % GEMS.length].id;
    gems[id] = (gems[id] ?? 0) + 1;
  }
  return { dust, gems };
}

// ---- Gardening --------------------------------------------------------------------------------------------------------------------------------------------

// Share of a plant's growth time that is left (1 = no perk).
export function gardenTimeFactor(level: number): number {
  return 1 - (has('gardening', level, 'garden_speed_1') ? T.mastery.gardenSpeedPct : 0) - (has('gardening', level, 'garden_speed_2') ? T.mastery.gardenSpeedPct : 0);
}

export function plantGrowthMs(plant: PlantDef, level: number): number {
  return Math.max(1, Math.round(plant.durationMs * gardenTimeFactor(level)));
}

export function gardenDustFor(level: number, growthHours: number): number {
  return has('gardening', level, 'garden_dust') ? Math.floor(growthHours / T.mastery.gardenDustHours) : 0;
}

export function gardenYieldBonus(level: number, rarity: string): number {
  return has('gardening', level, 'garden_rare') && rarity === 'rare' ? T.mastery.gardenRareBonus : 0;
}

// ---- the list of upcoming unlocks a profession screen shows ---------------------------------------------------------------------------------------------

export type UnlockEntry =
  | { level: number; kind: 'tier'; id: string } // an ore / wood tier
  | { level: number; kind: 'plant'; id: string }
  | { level: number; kind: 'perk'; id: MasteryPerkId; params: Record<string, number> };

// Everything the profession unlocks, in level order (tiers / plants first when levels tie), whether or not it is already unlocked: the screen marks the ones at or below the level as done.
export function professionUnlocks(skill: SkillId): UnlockEntry[] {
  const out: UnlockEntry[] = [];
  if (skill === 'mining') for (const o of ORE_TIERS) if (o.requiredLevel > 1) out.push({ level: o.requiredLevel, kind: 'tier', id: o.id });
  if (skill === 'woodcutting') for (const w of WOOD_TIERS) if (w.requiredLevel > 1) out.push({ level: w.requiredLevel, kind: 'tier', id: w.id });
  if (skill === 'gardening') for (const p of PLANTS) if (p.requiredLevel > 1) out.push({ level: p.requiredLevel, kind: 'plant', id: p.material });
  for (const p of masteryPerks(skill)) out.push({ level: p.level, kind: 'perk', id: p.id, params: p.params });
  return out.sort((a, b) => a.level - b.level);
}
