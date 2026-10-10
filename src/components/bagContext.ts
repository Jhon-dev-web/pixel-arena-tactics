import { createContext } from 'react';
import { SaveData } from '../game/engine';
import { ItemUse } from '../game/itemUses';
import { StackKind } from '../game/stash';

// What the bag / stash / merchant screens share and App provides once, so the many screens that show an item (the inventory in the Hero view and in its
// modal, every recipe screen's "you lack X" hint) need no new props: the save, and the actions on stacks.
export interface BagContextValue {
  save: SaveData;
  // move units between the inventory and the Baú
  move: (dir: 'store' | 'take', kind: StackKind, id: string, qty: number | 'all') => void;
  storeAllMaterials: () => void;
  sell: (kind: 'material' | 'consumable', id: string, qty: number | 'all') => void;
  // "Usar em...": open the screen that consumes the item
  openUse: (use: ItemUse) => void;
  upgradeStash: () => void;
}

export const BagContext = createContext<BagContextValue | null>(null);
