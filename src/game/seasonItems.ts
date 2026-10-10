import type { SaveData } from './engine';

// What only the Adventurer Pass track gives (battlepass.ts): the Stash Deed, the portrait frame. (The Season Relic is gear.ts season_emblem and the
// Blacksmith's Seal is consumed by gearInstances.applyForge.) Everything here is a pure SaveData transition.

// ---- Stash Deed: +5 stash slots each, for good, beyond the normal upgrade ladder (stash.ts). Tracked in its own field (stashBonusSlots) and capped over ALL seasons.
export const STASH_DEED_SLOTS = 5;
export const STASH_BONUS_CAP = 20;

export function sanitizeStashBonus(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(0, Math.min(STASH_BONUS_CAP, n)) : 0;
}

export type StashDeedBlock = 'noDeed' | 'cap';

export function stashDeedBlockReason(save: Pick<SaveData, 'consumables' | 'stashBonusSlots'>): StashDeedBlock | null {
  if ((save.consumables.stash_deed ?? 0) < 1) return 'noDeed';
  if ((save.stashBonusSlots ?? 0) + STASH_DEED_SLOTS > STASH_BONUS_CAP) return 'cap';
  return null;
}

// Uses one deed. A deed used at the cap is refused (null) and stays in the bag.
export function applyUseStashDeed(save: SaveData): SaveData | null {
  if (stashDeedBlockReason(save)) return null;
  return {
    ...save,
    consumables: { ...save.consumables, stash_deed: (save.consumables.stash_deed ?? 0) - 1 },
    stashBonusSlots: (save.stashBonusSlots ?? 0) + STASH_DEED_SLOTS,
  };
}

// ---- Portrait frames: cosmetics earned from the track, switched on and off where titles are chosen. Purely cosmetic (a CSS frame around the hero portrait).
export interface FrameDef {
  id: string;
  nameKey: string;
  descKey: string;
}

export const FRAMES: FrameDef[] = [{ id: 'frame_season_gold', nameKey: 'frame_season_gold', descKey: 'frame_season_gold_d' }];

export const getFrameDef = (id: string): FrameDef | undefined => FRAMES.find((f) => f.id === id);

// Only a frame the hero owns can be active; anything else loads as no frame.
export function sanitizeActiveFrame(raw: unknown, cosmetics: string[]): string | null {
  return typeof raw === 'string' && getFrameDef(raw) && cosmetics.includes(raw) ? raw : null;
}

export function applySelectFrame(save: SaveData, id: string | null): SaveData | null {
  if (id !== null && (!getFrameDef(id) || !save.cosmetics.includes(id))) return null;
  return { ...save, activeFrame: id };
}

// The CSS class the portrait carries for the active frame ('' = none). One place so every portrait (Home, Personagem, the top bars) frames the same way.
export const portraitFrameClass = (save: Pick<SaveData, 'activeFrame'>): string => (save.activeFrame ? ` portrait-frame ${save.activeFrame.replace(/_/g, '-')}` : '');
