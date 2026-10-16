import { playerLevel, SaveData } from './engine';
import { GEAR, INSTANCED_SLOTS } from './gear';
import { applyForge, resolveEquipped } from './gearInstances';
import { skillPointsAvailable } from './heroSkills';
import { HUNTING_ZONES, isZoneOpen } from './huntingZones';
import { inventoryCapacity, inventorySlotsUsed } from './inventory';
import { nextMilestone } from './dungeon';

// The single "next step" suggestion on the Home screen: ONE short line telling a returning player the most useful thing to do now. A pure function of the
// save (no clock, no RNG, nothing written), so it is cheap to test and can never disagree with the screens it points to. The first rule that applies wins.
//
//   1. the bag is full                     -> empty it (sell / store / salvage)
//   2. unspent skill or attribute points   -> spend them (free and instant, so it comes before a forge)
//   3. a better piece can be forged now    -> forge it
//   4. a hunting zone never hunted yet     -> go hunt there
//   5. a dungeon milestone is a few floors -> go for it
//      away
//   6. nothing is running                  -> start a hunt
//   7. otherwise                           -> everything is already going

export type NextStepId = 'bag_full' | 'forge' | 'skill_points' | 'attribute_points' | 'new_zone' | 'milestone' | 'start_hunt' | 'running';
export type NextStepTarget = 'inventory' | 'forge' | 'skills' | 'hero' | 'hunt' | 'dungeon' | 'none';

export interface NextStep {
  id: NextStepId;
  target: NextStepTarget;
  // Numbers / ids for the locale line: `piece` is a GEAR id (the caller names it), `zone` a hunting zone nameKey.
  params: { piece?: string; zone?: string; floor?: number; n?: number };
}

// How close (in floors) a milestone has to be before it is worth a suggestion.
export const MILESTONE_NEAR_FLOORS = 3;

// Attribute points are 3 per level (App.tsx attrChange); the spent ones are the four attributes.
export function attributePointsAvailable(save: Pick<SaveData, 'xp' | 'str' | 'vit' | 'agi' | 'res'>): number {
  return Math.max(0, playerLevel(save.xp) * 3 - (save.str + save.vit + save.agi + save.res));
}

// The best forgeable upgrade right now: a recipe piece (never a unique, never a relic) of a higher tier than what is worn in that slot that the forge would
// accept as it stands (gold, level, materials, gems, ingredients, bag room). Ties go to the highest tier.
export function craftableUpgrade(save: SaveData): string | null {
  const worn = resolveEquipped(save);
  const level = playerLevel(save.xp);
  let best: { id: string; tier: number } | null = null;
  for (const item of GEAR) {
    if (!item.recipe || item.unique || !(INSTANCED_SLOTS as readonly string[]).includes(item.slot)) continue;
    const tier = item.tier ?? 0;
    const view = worn[item.slot as keyof typeof worn];
    const wornTier = view && 'item' in view ? view.item.tier ?? 0 : 0;
    if (tier <= wornTier || (best && tier <= best.tier)) continue;
    if (applyForge(save, item.id, { level }).ok) best = { id: item.id, tier };
  }
  return best ? best.id : null;
}

export function nextStep(save: SaveData): NextStep {
  const step = (id: NextStepId, target: NextStepTarget, params: NextStep['params'] = {}): NextStep => ({ id, target, params });

  if (inventorySlotsUsed(save) >= inventoryCapacity(save)) return step('bag_full', 'inventory');

  const level = playerLevel(save.xp);
  const skillPoints = skillPointsAvailable(save, level);
  if (skillPoints > 0) return step('skill_points', 'skills', { n: skillPoints });
  const attrPoints = attributePointsAvailable(save);
  if (attrPoints > 0) return step('attribute_points', 'hero', { n: attrPoints });

  const piece = craftableUpgrade(save);
  if (piece) return step('forge', 'forge', { piece });

  // A zone is "new" while the player has never ended a session in it (huntProgress is written when a session ends).
  const hunted = new Set(Object.keys(save.huntProgress).map((k) => k.split(':')[0]));
  const fresh = HUNTING_ZONES.find((z) => isZoneOpen(z, save.highestDungeonFloor, level) && !hunted.has(z.id) && save.activeHuntingZone !== z.id);
  if (fresh) return step('new_zone', 'hunt', { zone: fresh.nameKey });

  const milestone = nextMilestone(save.highestDungeonFloor);
  if (milestone && milestone.floor - save.highestDungeonFloor <= MILESTONE_NEAR_FLOORS) return step('milestone', 'dungeon', { floor: milestone.floor });

  const busy = !!save.activeHuntingZone || !!save.activeOreId || !!save.activeWoodId || !!save.pendingHuntReward;
  if (!busy) return step('start_hunt', 'hunt');

  return step('running', 'none');
}
