import { gearRequiredLevel } from '../gear';

/** Buying a piece above the buyer's level is allowed (it waits in the bag until he can wear it); the market detail says at which level. null = nothing to say (a pouch, a lot, a piece the level already allows). */
export function usableAtLevel(l: { kind: string; template_id: string }, heroLevel: number | undefined): number | null {
  if (heroLevel === undefined || l.kind === 'gold_pouch' || l.kind === 'material') return null;
  const need = gearRequiredLevel(l.template_id);
  return need > heroLevel ? need : null;
}
