import T from './tunables';
import type { SaveData } from './engine';
import { ownsAdventurerPass } from './entitlements';
import { relicXpBonusPct } from './gear';

// Hero skills: three paths (Guerreiro, Guardiao, Cacador) of passive skills the hero buys with skill points. 1 point every T.heroSkills.pointEveryLevels character
// levels (level 5, 10, ... 100 = 20 points), separate from the STR / VIT / AGI / RES points. Everything here is PASSIVE and automatic: the effects reach combat only
// through buildCombatStats (engine.ts) so the Dungeon, Hunting and the simulator agree, and the economy ones through the single function each system already has.
//
// Layout of a path: tier 1 (two skills), tier 2 (two, needs tier2Req points in the path), tier 3 (two, needs tier3Req) and a capstone (one rank, needs capstoneReq).
// A skill has up to 3 ranks (1 point each). All the per-rank numbers live in tunables.ts T.heroSkills; the descriptions in the locale files hold NO numbers,
// they are filled from skillParams() below.

export type SkillPathId = 'warrior' | 'guardian' | 'hunter';
export const SKILL_PATH_IDS: SkillPathId[] = ['warrior', 'guardian', 'hunter'];

export type HeroSkillId =
  | 'w_heavy_blow' | 'w_keen_eye' | 'w_execution' | 'w_fury' | 'w_bleed' | 'w_weapon_master' | 'w_devastating_strike'
  | 'g_thick_skin' | 'g_bulwark' | 'g_thorns' | 'g_second_wind' | 'g_firm_stance' | 'g_block' | 'g_last_bastion'
  | 'h_light_step' | 'h_greed' | 'h_scent' | 'h_quick_learner' | 'h_packer' | 'h_gatherer' | 'h_great_luck';

export type SkillTier = 1 | 2 | 3 | 4; // 4 = capstone

export interface HeroSkillDef {
  id: HeroSkillId;
  path: SkillPathId;
  tier: SkillTier;
  maxRank: number;
  icon: string;
}

const skill = (id: HeroSkillId, path: SkillPathId, tier: SkillTier): HeroSkillDef => ({ id, path, tier, maxRank: tier === 4 ? 1 : 3, icon: `/assets/icons/skill_${id}.png` });

// Display order: the tiers top to bottom, left to right inside a tier.
export const HERO_SKILLS: HeroSkillDef[] = [
  skill('w_heavy_blow', 'warrior', 1), skill('w_keen_eye', 'warrior', 1),
  skill('w_execution', 'warrior', 2), skill('w_fury', 'warrior', 2),
  skill('w_bleed', 'warrior', 3), skill('w_weapon_master', 'warrior', 3),
  skill('w_devastating_strike', 'warrior', 4),
  skill('g_thick_skin', 'guardian', 1), skill('g_bulwark', 'guardian', 1),
  skill('g_thorns', 'guardian', 2), skill('g_second_wind', 'guardian', 2),
  skill('g_firm_stance', 'guardian', 3), skill('g_block', 'guardian', 3),
  skill('g_last_bastion', 'guardian', 4),
  skill('h_light_step', 'hunter', 1), skill('h_greed', 'hunter', 1),
  skill('h_scent', 'hunter', 2), skill('h_quick_learner', 'hunter', 2),
  skill('h_packer', 'hunter', 3), skill('h_gatherer', 'hunter', 3),
  skill('h_great_luck', 'hunter', 4),
];

const BY_ID = new Map<string, HeroSkillDef>(HERO_SKILLS.map((s) => [s.id, s]));
export const getSkillDef = (id: string): HeroSkillDef | undefined => BY_ID.get(id);
export const skillsOfPath = (path: SkillPathId): HeroSkillDef[] => HERO_SKILLS.filter((s) => s.path === path);
export const pathIcon = (path: SkillPathId): string => `/assets/icons/skill_path_${path}.png`;

export const MAX_SKILL_LEVEL = 100;

// ---- points --------------------------------------------------------------------------------------------------------

export function skillPointsEarned(level: number): number {
  const lv = Number.isFinite(level) ? Math.min(MAX_SKILL_LEVEL, Math.max(0, Math.floor(level))) : 0;
  return Math.floor(lv / Math.max(1, T.heroSkills.pointEveryLevels));
}

// The next character level that grants a point (null at the cap).
export function nextSkillPointLevel(level: number): number | null {
  const every = Math.max(1, T.heroSkills.pointEveryLevels);
  const next = (Math.floor(Math.max(0, level) / every) + 1) * every;
  return next > MAX_SKILL_LEVEL ? null : next;
}

// Ranks per skill; a missing key = rank 0.
export type SkillRanks = Partial<Record<HeroSkillId, number>>;

export const rankOf = (ranks: SkillRanks, id: HeroSkillId): number => ranks[id] ?? 0;
export const pointsSpent = (ranks: SkillRanks): number => HERO_SKILLS.reduce((a, s) => a + rankOf(ranks, s.id), 0);
export const pathPoints = (ranks: SkillRanks, path: SkillPathId): number => skillsOfPath(path).reduce((a, s) => a + rankOf(ranks, s.id), 0);

// Points a path needs to have spent before a skill of this tier can take its first rank.
export function tierRequirement(tier: SkillTier): number {
  return tier === 1 ? 0 : tier === 2 ? T.heroSkills.tier2Req : tier === 3 ? T.heroSkills.tier3Req : T.heroSkills.capstoneReq;
}

export type AddRankBlock = 'max' | 'points' | 'path';

// Can one more rank of `id` be bought with `available` points left? Gating counts the points already in the PATH (the skill's own included): a new tier opens
// once enough of the tiers below it are paid for.
export function addRankBlock(ranks: SkillRanks, id: HeroSkillId, available: number): AddRankBlock | null {
  const def = getSkillDef(id);
  if (!def) return 'max';
  if (rankOf(ranks, id) >= def.maxRank) return 'max';
  if (available < 1) return 'points';
  if (pathPoints(ranks, def.path) < tierRequirement(def.tier)) return 'path';
  return null;
}

export function addRank(ranks: SkillRanks, id: HeroSkillId): SkillRanks {
  return { ...ranks, [id]: rankOf(ranks, id) + 1 };
}

// Any input (a tampered save, a pending allocation) -> a legal allocation: known ids, 0..maxRank whole ranks, the tier gates respected and no more points than
// `earned`. Skills are visited path by path in display order, so what a gate or the budget cuts off is always the latest part of the tree.
export function sanitizeRanks(raw: unknown, earned: number): SkillRanks {
  const out: SkillRanks = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  let budget = Math.max(0, Math.floor(earned));
  for (const path of SKILL_PATH_IDS) {
    let inPath = 0;
    for (const def of skillsOfPath(path)) {
      const v = src[def.id];
      let rank = typeof v === 'number' && Number.isFinite(v) ? Math.min(def.maxRank, Math.max(0, Math.floor(v))) : 0;
      if (rank > 0 && inPath < tierRequirement(def.tier)) rank = 0;
      rank = Math.min(rank, budget);
      if (rank > 0) {
        out[def.id] = rank;
        budget -= rank;
        inPath += rank;
      }
    }
  }
  return out;
}

// ---- saved state ---------------------------------------------------------------------------------------------------

// Two independent allocations ("Conjunto 1" / "Conjunto 2", the second one a Pass perk) and the free-respec flag. `active` is the set that counts.
export interface SkillTreeState {
  active: 0 | 1;
  sets: [SkillRanks, SkillRanks];
  respecUsed: boolean;
}

export const emptySkillTree = (): SkillTreeState => ({ active: 0, sets: [{}, {}], respecUsed: false });

export function sanitizeSkillTree(raw: unknown, level: number, ownsPass: boolean): SkillTreeState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SkillTreeState>;
  const earned = skillPointsEarned(level);
  const sets = Array.isArray(r.sets) ? r.sets : [];
  const first = sanitizeRanks(sets[0], earned);
  // The second set is the Pass perk: without the Pass it is empty and never active.
  const second = ownsPass ? sanitizeRanks(sets[1], earned) : {};
  return { active: ownsPass && r.active === 1 ? 1 : 0, sets: [first, second], respecUsed: r.respecUsed === true };
}

export const activeSkillRanks = (save: Pick<SaveData, 'skillTree'>): SkillRanks => save.skillTree?.sets[save.skillTree.active] ?? {};

export function skillPointsAvailable(save: Pick<SaveData, 'skillTree'>, level: number): number {
  return Math.max(0, skillPointsEarned(level) - pointsSpent(activeSkillRanks(save)));
}

// ---- effects -------------------------------------------------------------------------------------------------------

// Everything the active allocation does, as the numbers the systems consume. Fractions are 0.04 = 4 %.
export interface SkillEffects {
  damagePct: number; // final damage
  critChance: number; // absolute
  critMultBonus: number; // absolute, added to the crit multiplier
  attackSpeed: number; // joins the relic's attack speed bonus in heroAttackIntervalMs
  bleed: number; // share of the (pre-crit) hit dealt per second while bleeding; 0 = none
  weaponPct: number; // share of the equipped weapon's base damage
  strikeEvery: number; // every Nth hit of the hero is a Devastating Strike; 0 = none
  maxHpPct: number;
  resistancePct: number; // multiplies the Layer-2 resistance sum
  reflect: number;
  hpRegenPct: number; // max HP per second
  bossReduction: number; // damage taken on boss / checkpoint floors (Dungeon only)
  blockChance: number;
  lastBastion: boolean;
  goldPct: number; // Gold, outside the gear cap
  materialsMult: number; // Hunting material yield (1 = none)
  xpPct: number; // character XP
  bagSlots: number;
  gatherPct: number; // Mining and Woodcutting yield
  huntUniqueMult: number; // 1 = none
  bossLootMult: number;
}

const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export function skillEffects(ranks: SkillRanks): SkillEffects {
  const H = T.heroSkills;
  const k = (id: HeroSkillId): number => rankOf(ranks, id);
  const luck = k('h_great_luck') > 0;
  return {
    damagePct: r6(k('w_heavy_blow') * H.heavyBlowPct),
    critChance: r6(k('w_keen_eye') * H.keenEyeCrit),
    critMultBonus: r6(k('w_execution') * H.executionCritMult),
    attackSpeed: r6(k('w_fury') * H.furyAttackSpeed + k('h_light_step') * H.lightStepAttackSpeed),
    bleed: r6(k('w_bleed') * H.bleedPct),
    weaponPct: r6(k('w_weapon_master') * H.weaponMasterPct),
    strikeEvery: k('w_devastating_strike') > 0 ? Math.max(2, Math.round(H.strikeEvery)) : 0,
    maxHpPct: r6(k('g_thick_skin') * H.thickSkinHp),
    resistancePct: r6(k('g_bulwark') * H.bulwarkRes),
    reflect: r6(k('g_thorns') * H.thornsReflect),
    hpRegenPct: r6(k('g_second_wind') * H.secondWindRegen),
    bossReduction: r6(k('g_firm_stance') * H.firmStanceReduction),
    blockChance: r6(k('g_block') * H.blockChance),
    lastBastion: k('g_last_bastion') > 0,
    goldPct: r6(k('h_greed') * H.greedGold),
    materialsMult: r6(1 + k('h_scent') * H.scentMaterials),
    xpPct: r6(k('h_quick_learner') * H.quickLearnerXp),
    bagSlots: Math.round(k('h_packer') * H.packerSlots),
    gatherPct: r6(k('h_gatherer') * H.gathererYield),
    huntUniqueMult: luck ? H.luckHuntUnique : 1,
    bossLootMult: luck ? H.luckBossDrop : 1,
  };
}

export const saveSkillEffects = (save: Pick<SaveData, 'skillTree'>): SkillEffects => skillEffects(activeSkillRanks(save));

// Percent extra character XP the hero's Season Relic and Aprendiz Veloz give together (the Dungeon, Hunting via CombatStats.xpBonus, and delivery orders).
export function characterXpBonusPct(save: Pick<SaveData, 'skillTree' | 'equipped'>): number {
  return relicXpBonusPct(save.equipped.relic) + Math.round(saveSkillEffects(save).xpPct * 10000) / 100;
}

// The numbers a skill's description shows at `rank`, by placeholder name (percentages as 4 = 4 %). Generated from T.heroSkills, never typed into a locale file.
export function skillParams(id: HeroSkillId, rank: number): Record<string, number> {
  const H = T.heroSkills;
  const pct = (x: number): number => Math.round(x * rank * 1000) / 10;
  switch (id) {
    case 'w_heavy_blow': return { n: pct(H.heavyBlowPct) };
    case 'w_keen_eye': return { n: pct(H.keenEyeCrit) };
    case 'w_execution': return { n: pct(H.executionCritMult) };
    case 'w_fury': return { n: pct(H.furyAttackSpeed) };
    case 'w_bleed': return { n: pct(H.bleedPct), s: H.bleedDurationMs / 1000 };
    case 'w_weapon_master': return { n: pct(H.weaponMasterPct) };
    case 'w_devastating_strike': return { every: Math.round(H.strikeEvery), mult: H.strikeMult };
    case 'g_thick_skin': return { n: pct(H.thickSkinHp) };
    case 'g_bulwark': return { n: pct(H.bulwarkRes) };
    case 'g_thorns': return { n: pct(H.thornsReflect) };
    case 'g_second_wind': return { n: pct(H.secondWindRegen) };
    case 'g_firm_stance': return { n: pct(H.firmStanceReduction) };
    case 'g_block': return { n: pct(H.blockChance) };
    case 'g_last_bastion': return { hp: 1, heal: Math.round(H.bastionHealPct * 100), s: Math.round(H.bastionCooldownMs / 1000) };
    case 'h_light_step': return { n: pct(H.lightStepAttackSpeed) };
    case 'h_greed': return { n: pct(H.greedGold) };
    case 'h_scent': return { n: pct(H.scentMaterials) };
    case 'h_quick_learner': return { n: pct(H.quickLearnerXp) };
    case 'h_packer': return { n: Math.round(H.packerSlots * rank) };
    case 'h_gatherer': return { n: pct(H.gathererYield) };
    case 'h_great_luck': return { hunt: Math.round((H.luckHuntUnique - 1) * 100), boss: Math.round((H.luckBossDrop - 1) * 100) };
  }
}

// ---- actions (pure transitions on the save) ------------------------------------------------------------------------

export type SkillActionBlock = 'battle' | 'invalid' | 'gold' | 'pass' | 'nothing';

export interface SkillActionResult {
  ok: boolean;
  reason?: SkillActionBlock;
  save: SaveData;
  cost?: number;
}

const withSet = (tree: SkillTreeState, index: 0 | 1, ranks: SkillRanks): SkillTreeState => ({ ...tree, sets: index === 0 ? [ranks, tree.sets[1]] : [tree.sets[0], ranks] });

// Applies a pending allocation: it must contain every rank the active set already has (points are only ever ADDED here, taking them back is a respec), be legal for
// the level and spend no more than the points earned. Allowed in a Dungeon battle too: the fight in progress keeps the stats it started with.
export function applySkillAllocation(save: SaveData, level: number, draft: SkillRanks): SkillActionResult {
  const tree = save.skillTree;
  const current = activeSkillRanks(save);
  const clean = sanitizeRanks(draft, skillPointsEarned(level));
  const keepsCurrent = HERO_SKILLS.every((s) => rankOf(clean, s.id) >= rankOf(current, s.id));
  if (!keepsCurrent || pointsSpent(clean) <= pointsSpent(current)) return { ok: false, reason: keepsCurrent ? 'nothing' : 'invalid', save };
  // Sanitising may have cut the draft; applying it as it came would hide that, so anything that changed is refused.
  if (!HERO_SKILLS.every((s) => rankOf(clean, s.id) === rankOf(draft, s.id))) return { ok: false, reason: 'invalid', save };
  return { ok: true, save: { ...save, skillTree: withSet(tree, tree.active, clean) } };
}

// "Redistribuir": gold per point spent, scaled by the character level (free the first time). Nothing spent = nothing to do.
export function respecCost(save: Pick<SaveData, 'skillTree'>, level: number): number {
  if (!save.skillTree || !save.skillTree.respecUsed) return 0;
  const spent = pointsSpent(activeSkillRanks(save));
  return Math.round((T.heroSkills.respecGoldPerPoint * spent * Math.max(1, level)) / Math.max(1, T.heroSkills.respecLevelDivisor));
}

export function applyRespec(save: SaveData, level: number, battleActive: boolean): SkillActionResult {
  if (battleActive) return { ok: false, reason: 'battle', save };
  const tree = save.skillTree;
  if (pointsSpent(activeSkillRanks(save)) === 0) return { ok: false, reason: 'nothing', save };
  const cost = respecCost(save, level);
  if (save.gold < cost) return { ok: false, reason: 'gold', save, cost };
  return { ok: true, cost, save: { ...save, gold: save.gold - cost, skillTree: { ...withSet(tree, tree.active, {}), respecUsed: true } } };
}

// Loadouts: set 1 is everyone's, set 2 belongs to the Adventurer Pass. Switching follows the respec rules but costs no Gold.
export function applyLoadoutSwitch(save: SaveData, index: 0 | 1, battleActive: boolean): SkillActionResult {
  if (battleActive) return { ok: false, reason: 'battle', save };
  if (index === 1 && !ownsAdventurerPass(save)) return { ok: false, reason: 'pass', save };
  if (save.skillTree.active === index) return { ok: false, reason: 'nothing', save };
  return { ok: true, save: { ...save, skillTree: { ...save.skillTree, active: index } } };
}
