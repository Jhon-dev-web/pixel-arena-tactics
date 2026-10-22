import type { CraftStartFailure } from './craftJob';

// The recipe list of a Ofícios station: what the hero can make now comes first and stands out, what a level still locks goes to the end, compact. Pure ordering, no recipe data is changed.

export interface OficioEntry {
  id: string;
  requiredLevel: number;
  /** a batch of one could start now (level, materials, Gold, room). Hero busy does not count against it: that is a state of the hero, not of the recipe. */
  craftable: boolean;
}

export const oficioLocked = (requiredLevel: number, level: number): boolean => level < requiredLevel;

/** Unlocked recipes (craftable ones first, the station's own order inside each group) and level-locked ones (the nearest level first). */
export function orderOficios<T extends OficioEntry>(entries: readonly T[], level: number): { available: T[]; locked: T[] } {
  const open = entries.filter((e) => !oficioLocked(e.requiredLevel, level));
  const available = [...open.filter((e) => e.craftable), ...open.filter((e) => !e.craftable)];
  const locked = entries.map((e, i) => ({ e, i })).filter(({ e }) => oficioLocked(e.requiredLevel, level)).sort((a, b) => a.e.requiredLevel - b.e.requiredLevel || a.i - b.i).map(({ e }) => e);
  return { available, locked };
}

/** The recipe shown in the production sheet: the one asked for (a deep link) when this station has it, else the first one the hero can make, else the first open one, else the nearest locked one. */
export function pickOficioId<T extends OficioEntry>(entries: readonly T[], level: number, preferred?: string | null): string | null {
  if (preferred && entries.some((e) => e.id === preferred)) return preferred;
  const { available, locked } = orderOficios(entries, level);
  return (available[0] ?? locked[0])?.id ?? null;
}

/** Which message explains a blocked batch. 'busy' comes first (the hero's own state), then the recipe's own reasons. */
export type OficioBlockKind = 'busy' | 'level' | 'materials' | 'gold' | 'bag' | 'other';
export function oficioBlockKind(reason: CraftStartFailure | null | undefined): OficioBlockKind | null {
  if (!reason) return null;
  switch (reason) {
    case 'busy':
    case 'level':
    case 'materials':
    case 'gold':
    case 'bag':
      return reason;
    default:
      return 'other';
  }
}
