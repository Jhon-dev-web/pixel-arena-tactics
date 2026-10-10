import type { SaveData } from './engine';
import { BUFF_ITEM } from './buffs';
import { deliverableMaterials } from './deliveries';
import { EXPEDITION_TICKET_SKIP_MS, ConsumableId } from './consumables';
import { GEAR, MAX_REFINE, isInstancedSlot, upgradeCost } from './gear';
import { MATERIALS, MaterialId } from './materials';
import { POTION_RECIPES } from './potions';
import { REFINING_RECIPES } from './refining';
import { STASH_UPGRADES } from './stash';
import { getReforgeCost } from './reforge';
import { createGearInstance } from './gearInstances';

// "Usar em...": where an item is consumed, derived from the REAL recipe data (never a hand-kept list): forge recipes, refining stations, alchemy, gear
// refining (upgrade), reforge, delivery orders, the Garden, the stash upgrades. One pure function; the inventory turns each entry into a button that
// opens that screen, ideally focused on a recipe that uses the item.

export type UseKind = 'forge' | 'refine' | 'alchemy' | 'upgrade' | 'reforge' | 'delivery' | 'garden' | 'stash' | 'use' | 'auto';

export interface ItemUse {
  kind: UseKind;
  // The recipes / pieces / orders that use it (forge: gear ids, refine / alchemy: recipe ids, delivery: offer ids on the board right now when known).
  refs: string[];
}

// Materials nothing consumes yet, on purpose (so the test that every material has a use can say so out loud). Empty = every material has a consumer.
export const MATERIALS_WITHOUT_USE: readonly MaterialId[] = [];
// Consumables that are only ever bought / dropped / sold and have no screen to open (none right now).
export const CONSUMABLES_WITHOUT_USE: readonly ConsumableId[] = [];

// Gear refining costs depend on the piece's tier and level: scan every tier of the catalog at every level, once.
let upgradeMaterialsCache: Set<MaterialId> | null = null;
function upgradeMaterials(): Set<MaterialId> {
  if (upgradeMaterialsCache) return upgradeMaterialsCache;
  const out = new Set<MaterialId>();
  const tiers = new Set(GEAR.map((g) => g.tier ?? 0));
  const sample = GEAR.find((g) => g.recipe)!;
  for (const tier of tiers) for (let lvl = 0; lvl < MAX_REFINE; lvl++) for (const m of Object.keys(upgradeCost({ ...sample, tier }, lvl).materials ?? {})) out.add(m as MaterialId);
  upgradeMaterialsCache = out;
  return out;
}

let reforgeMaterialsCache: Set<MaterialId> | null = null;
function reforgeMaterials(): Set<MaterialId> {
  if (reforgeMaterialsCache) return reforgeMaterialsCache;
  const out = new Set<MaterialId>();
  // a reforge needs a piece with substats: any rarity above common, at the lowest and the highest tier, in a weapon and an armor family
  const templates = [GEAR.find((g) => g.slot === 'weapon' && (g.tier ?? 0) === 1), GEAR.filter((g) => g.slot === 'weapon').slice(-1)[0], GEAR.find((g) => g.slot === 'armor' && (g.tier ?? 0) === 1), GEAR.filter((g) => g.slot === 'armor').slice(-1)[0]];
  for (const tpl of templates) {
    if (!tpl) continue;
    const inst = createGearInstance(tpl.id, { id: 'probe', origin: 'admin', rarity: 'rare', substats: [] });
    const probe = { gearInstances: { probe: inst } } as Pick<SaveData, 'gearInstances'>;
    for (const m of Object.keys(getReforgeCost(probe, 'probe')?.materials ?? {})) out.add(m as MaterialId);
  }
  reforgeMaterialsCache = out;
  return out;
}

const push = (out: ItemUse[], kind: UseKind, refs: string[]) => {
  if (refs.length > 0 || kind === 'auto') out.push({ kind, refs });
};

// What consumes a material or a consumable. `save` (optional) narrows 'delivery' to the offers on the board that ask for it right now (an accepted order has already taken its cargo).
export function usesOf(kind: 'material' | 'consumable', id: string, save?: Pick<SaveData, 'deliveries'>): ItemUse[] {
  const out: ItemUse[] = [];
  if (kind === 'material') {
    const m = id as MaterialId;
    push(out, 'forge', GEAR.filter((g) => !g.unique && (g.recipe?.materials?.[m] ?? 0) > 0).map((g) => g.id));
    push(out, 'refine', REFINING_RECIPES.filter((r) => (r.input[m] ?? 0) > 0).map((r) => r.id));
    push(out, 'alchemy', POTION_RECIPES.filter((r) => (r.input[m] ?? 0) > 0).map((r) => r.id));
    if (upgradeMaterials().has(m)) push(out, 'upgrade', ['refine']);
    if (reforgeMaterials().has(m)) push(out, 'reforge', ['reforge']);
    if (deliverableMaterials().has(m)) {
      const board = save?.deliveries?.offers?.filter((o) => (o.items[m] ?? 0) > 0).map((o) => o.id) ?? [];
      push(out, 'delivery', board.length > 0 ? board : ['board']);
    }
    if (STASH_UPGRADES.some((u) => (u.materials[m] ?? 0) > 0)) push(out, 'stash', ['stash']);
    return out;
  }
  const c = id as ConsumableId;
  if (c === 'small_hp' || c === 'large_hp' || c === 'greater_elixir') push(out, 'auto', [c]);
  if (c === 'refine_catalyst') push(out, 'upgrade', ['refine']);
  if (EXPEDITION_TICKET_SKIP_MS[c]) push(out, 'delivery', ['board']);
  if (c === 'fertilizer') push(out, 'garden', ['garden']);
  if (c === 'forge_seal') push(out, 'forge', GEAR.filter((g) => g.recipe && !g.unique && isInstancedSlot(g.slot)).map((g) => g.id));
  if (c === 'stash_deed') push(out, 'use', [c]);
  if (c === 'xp_potion' || c === 'whetstone_oil' || c === 'atk_elixir' || BUFF_ITEM[c]) push(out, 'use', [c]);
  return out;
}

// Every material / consumable that has no use at all (what the catalog test pins to the two lists above).
export const materialsWithoutUse = (): MaterialId[] => MATERIALS.map((m) => m.id).filter((id) => usesOf('material', id).length === 0);
