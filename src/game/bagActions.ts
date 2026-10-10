import type { SaveData } from './engine';
import { applyDiscardInstance } from './gearInstances';
import { ConsumableId } from './consumables';
import { MaterialId } from './materials';
import { StackKind, bagCount } from './stash';

// Descartar: throw away part or all of a stack, or one stored gear instance. Always available (it is how a player makes room in the worst case), never
// gives anything back, and never touches what is worn: an equipped instance cannot be discarded, and the one copy of a stackable that is equipped stays.
// The UI asks for a confirmation before it calls this.

export function applyDiscard(save: SaveData, kind: StackKind | 'instance', id: string, qty: number | 'all' = 'all'): SaveData | null {
  if (kind === 'instance') return applyDiscardInstance(save, id);
  const equippedCopy = kind === 'gear' && Object.values(save.equipped).includes(id) ? 1 : 0;
  const removable = bagCount(save, kind, id) - equippedCopy;
  const n = Math.min(removable, qty === 'all' ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.floor(qty)));
  if (n <= 0) return null;
  if (kind === 'material') return { ...save, materials: { ...save.materials, [id]: (save.materials[id as MaterialId] ?? 0) - n } };
  if (kind === 'consumable') return { ...save, consumables: { ...save.consumables, [id]: (save.consumables[id as ConsumableId] ?? 0) - n } };
  const inventory = { ...save.inventory, [id]: (save.inventory[id] ?? 0) - n };
  if (inventory[id] <= 0) delete inventory[id];
  return { ...save, inventory };
}
