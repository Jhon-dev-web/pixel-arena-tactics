import { GearItem, weaponWeight } from '../game/gear';
import { AffinityClass, AffinityWeight, CLASS_OF_WEIGHT } from '../game/affinity';

// The Forge's class filter (classes reform, phase 7): a view over the recipe list, never a rule. 'all' is the default and always on offer, because mixing the three lines is legitimate in this game.
export type ForgeClassFilter = 'all' | AffinityClass;
export const FORGE_CLASS_FILTERS: ForgeClassFilter[] = ['all', 'warrior', 'archer', 'mage'];

// The class a piece belongs to by what it is made of: a missing `weight` means plate, a missing `line` means sword (both are the warrior's), the bow / crossbow are the archer's and the staff / scepter the mage's.
// The ring and the relic carry no weight and no class: they belong to every filter.
export function forgeClassOf(g: GearItem): AffinityClass | null {
  const weight = affinityWeightOf(g);
  return weight ? CLASS_OF_WEIGHT[weight] : null;
}

// The weight a piece counts for in affinity.ts (plate when `weight` / `line` are absent; the weapon reads its line). The ring and the relic have none.
export function affinityWeightOf(g: GearItem): AffinityWeight | null {
  if (g.slot === 'ring' || g.slot === 'relic') return null;
  return g.slot === 'weapon' ? weaponWeight(g) ?? 'plate' : g.weight ?? 'plate';
}

export function matchesForgeClass(g: GearItem, filter: ForgeClassFilter): boolean {
  if (filter === 'all') return true;
  const cls = forgeClassOf(g);
  return cls === null || cls === filter;
}

// The note of the first forge (where the class comes from: the leading armor WEIGHT, affinity.ts, never a slot and never this filter): on offer only while the hero has forged nothing yet (the lifetime counter stats.itemsForged, no field of its own) and
// the class filter is on 'all', so it never sits on top of a list the player already narrowed. It goes away with the first forge, not when it is seen. A League reset starts a fresh hero (defaultSave), so it comes back then.
export const showForgeClassNote = (itemsForged: number, filter: ForgeClassFilter): boolean => itemsForged === 0 && filter === 'all';
