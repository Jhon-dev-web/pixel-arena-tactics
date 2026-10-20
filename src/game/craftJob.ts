import type { SaveData } from './engine';
import { playerLevel } from './heroLevel';
import { heroActivity, HeroActivity } from './activity';
import { CraftJob, CraftJobKind } from './craftJobTypes';
import { getRefiningRecipe } from './refining';
import { getPotionRecipe, potionRecipeInTier } from './potions';
import { MaterialId, hasMaterials } from './materials';
import { GemId, hasGems } from './gems';
import { getGear } from './gear';
import { addForced, addWithOverflow, bagFreeSlots, stockIsEmpty } from './inventory';
import { countUsableInstances, gearInstanceCount, maxGearInstances, selectIngredientInstances } from './gearInstances';
import type { GearInstance } from './gearInstances';
import { recordPotion } from './stats';
import T, { CRAFT_SECONDS_OVERRIDES } from './tunables';

// Batch production with time (Forge and Oficios). A job makes `qty` units of ONE recipe; the hero takes `unitMs` per unit (1 s by default, T.crafting.secondsPerUnit, with a per-recipe override).
// Everything the batch costs is taken when it STARTS; the units are delivered one after another as the clock passes (on every tick and on load, so a closed game finishes them too);
// cancelling gives back the cost of the units not yet delivered - the delivered ones stay. One job at a time, and the hero is busy while it runs (activity.ts).
//
// refine / potion: pure here (the output is known). forge: a gear piece needs its OWN roll, which the web build gets from the server (itemActions.forgeAction, one call per finished unit), so the
// pure part here only does the money side: `prepaidForgeSave` hands that action a save in which the unit's cost is still to pay (the batch already paid it), and `settleForgeUnit` counts the unit.

export type CraftStartFailure = 'unknown' | 'busy' | 'qty' | 'tier' | 'level' | 'gold' | 'materials' | 'gems' | 'shards' | 'ingredients' | 'bag' | 'capacity';
export interface CraftStart {
  ok: boolean;
  reason?: CraftStartFailure;
  /** busy: what the hero is doing */
  busyWith?: HeroActivity;
  save?: SaveData;
}
const fail = (reason: CraftStartFailure, busyWith?: HeroActivity): CraftStart => ({ ok: false, reason, ...(busyWith ? { busyWith } : {}) });

export const craftUnitMs = (recipeId: string): number => Math.max(50, Math.round((CRAFT_SECONDS_OVERRIDES[recipeId] ?? T.crafting.secondsPerUnit) * 1000));

/** Units finished by `now` (delivered or not). */
export const craftUnitsFinished = (job: CraftJob, now: number): number => Math.max(0, Math.min(job.qty, Math.floor((now - job.startedAt) / job.unitMs)));
/** Units finished and not yet delivered. */
export const craftUnitsDue = (job: CraftJob, now: number): number => Math.max(0, craftUnitsFinished(job, now) - job.done);
/** ms until the whole batch is done (0 once it is). */
export const craftTimeLeftMs = (job: CraftJob, now: number): number => Math.max(0, job.startedAt + job.qty * job.unitMs - now);

// ---- the per-unit recipe, whichever kind ---------------------------------------------------------------------------------------------------------------------------

interface UnitCost {
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
  gems: Partial<Record<GemId, number>>;
  shards: number;
}
const ZERO: UnitCost = { gold: 0, materials: {}, gems: {}, shards: 0 };

function unitCost(kind: CraftJobKind, recipeId: string): UnitCost | null {
  if (kind === 'refine') {
    const r = getRefiningRecipe(recipeId);
    return r ? { ...ZERO, gold: r.cost, materials: r.input } : null;
  }
  if (kind === 'potion') {
    const r = getPotionRecipe(recipeId);
    return r ? { ...ZERO, gold: r.cost, materials: r.input } : null;
  }
  const g = getGear(recipeId);
  if (!g || !g.recipe) return null;
  return { gold: g.cost, materials: g.recipe.materials ?? {}, gems: (g.recipe.gems ?? {}) as Partial<Record<GemId, number>>, shards: g.recipe.shards ?? 0 };
}

const scaled = <K extends string>(m: Partial<Record<K, number>>, n: number): Partial<Record<K, number>> => {
  const out: Partial<Record<K, number>> = {};
  for (const [k, v] of Object.entries(m)) out[k as K] = (v as number) * n;
  return out;
};

function charge(save: SaveData, c: UnitCost, n: number): SaveData {
  const materials = { ...save.materials };
  for (const [k, v] of Object.entries(c.materials)) materials[k as MaterialId] = (materials[k as MaterialId] ?? 0) - (v as number) * n;
  const gems = { ...save.gems };
  for (const [k, v] of Object.entries(c.gems)) gems[k as GemId] = (gems[k as GemId] ?? 0) - (v as number) * n;
  return { ...save, gold: save.gold - c.gold * n, materials, gems, shards: save.shards - c.shards * n };
}
const refund = (save: SaveData, c: UnitCost, n: number): SaveData => charge(save, c, -n);

const countForge = (save: SaveData): SaveData['quests'] => ({ ...save.quests, daily: { ...save.quests.daily, forge: (save.quests.daily.forge ?? 0) + 1 } });

type Output = { materials?: Record<string, number>; consumables?: Record<string, number> };

/** What one finished unit of a refine / potion job puts in the bag. */
function unitOutput(kind: CraftJobKind, recipeId: string): Output | null {
  if (kind === 'refine') {
    const r = getRefiningRecipe(recipeId);
    return r ? { materials: { [r.output]: r.outputQty } } : null;
  }
  const r = getPotionRecipe(recipeId);
  return r ? { consumables: { [r.id]: 1 } } : null;
}

const times = (a: Record<string, number> | undefined, n: number): Record<string, number> | undefined =>
  a ? Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v * n])) : undefined;

// ---- limits ---------------------------------------------------------------------------------------------------------------------------------------------------------

/** Why `qty` units of this recipe cannot start now (null = they can). Checks what the hero is doing, the Gold, materials, gems, shards, level, ingredients and room in the bag. */
export function craftBlock(save: SaveData, kind: CraftJobKind, recipeId: string, qty: number): { reason: CraftStartFailure; busyWith?: HeroActivity } | null {
  const busy = heroActivity(save);
  if (busy) return { reason: 'busy', busyWith: busy };
  if (!Number.isInteger(qty) || qty < 1 || qty > T.crafting.maxBatch) return { reason: 'qty' };
  const c = unitCost(kind, recipeId);
  if (!c) return { reason: 'unknown' };
  const level = playerLevel(save.xp);
  if (kind === 'refine' && level < (getRefiningRecipe(recipeId)?.requiredLevel ?? 0)) return { reason: 'level' };
  if (kind === 'potion') {
    const r = getPotionRecipe(recipeId)!;
    if (!potionRecipeInTier(r, save.highestDungeonFloor, level)) return { reason: 'tier' };
    if (level < r.requiredLevel) return { reason: 'level' };
  }
  if (kind === 'forge' && level < (getGear(recipeId).recipe?.requiredLevel ?? 0)) return { reason: 'level' };
  if (save.gold < c.gold * qty) return { reason: 'gold' };
  if (!hasMaterials(save.materials, scaled(c.materials, qty))) return { reason: 'materials' };
  if (!hasGems(save.gems, scaled(c.gems, qty))) return { reason: 'gems' };
  if (save.shards < c.shards * qty) return { reason: 'shards' };
  if (kind === 'forge') {
    const item = getGear(recipeId);
    const needs = Object.entries(item.recipe?.items ?? {}) as [string, number][];
    for (const [tid, n] of needs) if (countUsableInstances(save, tid) < n * qty) return { reason: 'ingredients' };
    const eaten = needs.reduce((a, [, n]) => a + n, 0);
    // the technical ceiling on pieces, then the shared bag: each unit takes a slot and its ingredients free theirs
    if (gearInstanceCount(save) + (1 - eaten) * qty > maxGearInstances() && 1 - eaten > 0) return { reason: 'capacity' };
    if ((1 - eaten) * qty > bagFreeSlots(save)) return { reason: 'bag' };
  } else {
    const out = unitOutput(kind, recipeId);
    if (out) {
      const placed = addWithOverflow(charge(save, c, qty), { materials: times(out.materials, qty), consumables: times(out.consumables, qty) } as never);
      if (!stockIsEmpty(placed.leftover)) return { reason: 'bag' };
    }
  }
  return null;
}

/** The most units that can start now (0 when not even one can). What is affordable only shrinks as qty grows, so a binary search over the ceiling finds it. */
export function maxCraftQty(save: SaveData, kind: CraftJobKind, recipeId: string): number {
  if (craftBlock(save, kind, recipeId, 1)) return 0;
  let lo = 1;
  let hi = Math.max(1, Math.floor(T.crafting.maxBatch));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (craftBlock(save, kind, recipeId, mid)) hi = mid - 1;
    else lo = mid;
  }
  return lo;
}

/** The gear pieces a forge batch would eat (cheapest first, the order the units take them) - for the confirmation of valuable ones. */
export function planBatchIngredients(save: SaveData, recipeId: string, qty: number): GearInstance[] | null {
  const item = getGear(recipeId);
  const out: GearInstance[] = [];
  const used = new Set<string>();
  for (const [tid, n] of Object.entries(item?.recipe?.items ?? {}) as [string, number][]) {
    const part = selectIngredientInstances(save, tid, n * qty, used);
    if (!part) return null;
    for (const i of part) used.add(i.id);
    out.push(...part);
  }
  return out;
}

// ---- start / deliver / cancel ---------------------------------------------------------------------------------------------------------------------------------------

export function startCraftJob(save: SaveData, kind: CraftJobKind, recipeId: string, qty: number, now: number, opts: { seal?: boolean } = {}): CraftStart {
  if (!Number.isFinite(now) || now <= 0) return fail('unknown');
  const block = craftBlock(save, kind, recipeId, qty);
  if (block) return fail(block.reason, block.busyWith);
  const c = unitCost(kind, recipeId)!;
  const job: CraftJob = { kind, recipeId, qty, done: 0, startedAt: Math.floor(now), unitMs: craftUnitMs(recipeId), ...(kind === 'forge' && opts.seal ? { seal: true } : {}) };
  return { ok: true, save: { ...charge(save, c, qty), craftJob: job } };
}

function withoutJob(save: SaveData): SaveData {
  const { craftJob: _gone, ...rest } = save;
  void _gone;
  return rest as SaveData;
}

/** Counts one delivered forge unit: the job ends with its last one. */
export function settleForgeUnit(save: SaveData): SaveData {
  const job = save.craftJob;
  if (!job) return save;
  return job.done + 1 >= job.qty ? withoutJob(save) : { ...save, craftJob: { ...job, done: job.done + 1 } };
}

/** refine / potion: delivers every unit the clock has finished. Forge jobs are delivered by the caller (they need the server's roll), unit by unit, with `prepaidForgeSave` + `settleForgeUnit`. */
export function resolveCraftJob(save: SaveData, now: number): SaveData {
  const job = save.craftJob;
  if (!job || job.kind === 'forge') return save;
  const due = craftUnitsDue(job, now);
  if (due <= 0) return save;
  const out = unitOutput(job.kind, job.recipeId);
  if (!out) return withoutJob(save); // a recipe that no longer exists: nothing to deliver
  let next = save;
  for (let i = 0; i < due; i++) {
    next = addForced(next, out as never); // paid for and room-checked at the start: a unit is never lost (a bag filled meanwhile just runs over, as it supports)
    next = { ...next, quests: countForge(next) };
    if (job.kind === 'potion') next = recordPotion(next);
  }
  return job.done + due >= job.qty ? withoutJob(next) : { ...next, craftJob: { ...job, done: job.done + due } };
}

/** forge: the save the forge action should see for the next unit - the unit's cost added back, since the batch paid it at the start (the action charges it again). */
export function prepaidForgeSave(save: SaveData): SaveData {
  const job = save.craftJob;
  if (!job || job.kind !== 'forge') return save;
  const c = unitCost('forge', job.recipeId);
  return c ? refund(save, c, 1) : save;
}

/** Stops the job: gives back the cost of the units not yet delivered (the delivered ones stay). For refine / potion call resolveCraftJob first; for forge deliver what is due first. */
export function cancelCraftJob(save: SaveData): { save: SaveData; refundedUnits: number } {
  const job = save.craftJob;
  if (!job) return { save, refundedUnits: 0 };
  const left = job.qty - job.done;
  const c = unitCost(job.kind, job.recipeId);
  return { save: withoutJob(c ? refund(save, c, left) : save), refundedUnits: left };
}
