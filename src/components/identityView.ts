import { grantedAbilities } from '../game/abilities';
import { AffinityClass, AffinityWeight, CLASS_OF_WEIGHT } from '../game/affinity';
import { GearItem, WeaponLine } from '../game/gear';
import { affinityWeightOf } from './forgeFilter';

// What an item card says about WHERE THE CLASS COMES FROM (the strip of ItemIdentity.tsx): the weight of the piece, the class that weight counts for, the line of a weapon and how many abilities it grants.
// The weight and the class come from the same reading the forge filter and affinity.ts use (affinityWeightOf, CLASS_OF_WEIGHT), never from a table of this file.
export interface ItemIdentityView {
  weight: AffinityWeight;
  cls: AffinityClass;
  line: WeaponLine | null; // a weapon's line (an absent `line` is the sword); null for every other slot
  abilities: number; // how many abilities the piece grants; 0 for every slot but the weapon and the chestpiece
}

// Null where there is nothing honest to say: the ring and the relic have no weight and no class, and the tier 0 starting gear (club, rags) counts for nothing in affinity.ts and grants no ability
// (engine.ts equippedAbilities), so a "Plate / Warrior" label on it would be false.
// Abilities: ONLY the weapon and the chestpiece (slot 'armor') grant any (engine.ts equippedAbilities reads just those two), so the helmet, gloves, boots and shield stay at 0 and the card prints nothing about
// abilities for them. game/__tests__/itemIdentity.test.ts checks this count against equippedAbilities itself, so the day another slot starts granting, the test lights up.
export function itemIdentity(g: GearItem): ItemIdentityView | null {
  const weight = affinityWeightOf(g);
  if (!weight || g.tier === 0) return null;
  const line: WeaponLine | null = g.slot === 'weapon' ? g.line ?? 'sword' : null;
  const abilities = g.slot === 'weapon' ? grantedAbilities(line, null).length : g.slot === 'armor' ? grantedAbilities(null, g.weight).length : 0;
  return { weight, cls: CLASS_OF_WEIGHT[weight], line, abilities };
}
