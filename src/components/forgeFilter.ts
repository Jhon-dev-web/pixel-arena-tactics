import { GearItem, weaponWeight } from '../game/gear';
import { AFFINITY_THREE, AffinityClass, AffinityWeight, CLASS_OF_WEIGHT, affinityView } from '../game/affinity';
import { equippedSetItems } from '../game/gearInstances';

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

// The filter the Forge opens on. A hero who already wears a class (three or more pieces of one armor weight, affinity.ts) opens on that class: the list is the pieces he can wear with what he has, and the other two lines are one
// tap away (the chips stay, and "Todas" stays: mixing is legitimate). A hero without a class yet (a fresh one, a mixed set) opens on 'all', which is also where the first-forge note lives.
export function defaultForgeClass(save: Parameters<typeof equippedSetItems>[0]): ForgeClassFilter {
  const view = affinityView(equippedSetItems(save));
  return view && view.pieces >= AFFINITY_THREE ? view.cls : 'all';
}
