import type { SaveData } from './engine';
import { ownsAdventurerPass } from './entitlements';

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

export const FRAMES: FrameDef[] = [
  { id: 'frame_season_gold', nameKey: 'frame_season_gold', descKey: 'frame_season_gold_d' },
  // The portrait frame of the invite program (referralRewards.ts): not on the Pass track, granted by the server when three invited people qualify.
  { id: 'frame_recruiter', nameKey: 'frame_recruiter', descKey: 'frame_recruiter_d' },
  // The portrait frame of the Pioneer kit (leagueReset.ts): granted with the Pioneer title to the players of the open pre-season when the first League resets the heroes. Not on the Pass track.
  { id: 'frame_pioneer', nameKey: 'frame_pioneer', descKey: 'frame_pioneer_d' },
];

export const getFrameDef = (id: string): FrameDef | undefined => FRAMES.find((f) => f.id === id);

// Only a frame the hero owns can be active; anything else loads as no frame.
export function sanitizeActiveFrame(raw: unknown, cosmetics: string[]): string | null {
  return typeof raw === 'string' && getFrameDef(raw) && cosmetics.includes(raw) ? raw : null;
}

export function applySelectFrame(save: SaveData, id: string | null): SaveData | null {
  if (id !== null && (!getFrameDef(id) || !save.cosmetics.includes(id))) return null;
  return { ...save, activeFrame: id };
}

// ---- Hero skins: a recolor of the hero sheet (same 1024x1024 layout and animation rows as the knight, so it is a drop-in). A deliberate cosmetic choice, never
// gear-driven (armour does not change the sprite, see sprites.ts). Earned on the premium track, owner-only to select, persisted in the save.
export interface SkinDef {
  id: string;
  nameKey: string;
  descKey: string;
}

export const SKINS: SkinDef[] = [{ id: 'skin_golden_knight', nameKey: 'skin_golden_knight', descKey: 'skin_golden_knight_d' }];

export const getSkinDef = (id: string): SkinDef | undefined => SKINS.find((s) => s.id === id);

// Only a skin the hero owns can be active; anything else (unknown, not owned, no Pass) loads as the default knight.
export function sanitizeActiveSkin(raw: unknown, cosmetics: string[], owner: boolean): string | null {
  return owner && typeof raw === 'string' && getSkinDef(raw) && cosmetics.includes(raw) ? raw : null;
}

// null = the default knight, always available. A skin needs ownership of the cosmetic AND the Pass.
export function applySelectSkin(save: SaveData, id: string | null): SaveData | null {
  if (id !== null && (!ownsAdventurerPass(save) || !getSkinDef(id) || !save.cosmetics.includes(id))) return null;
  return { ...save, activeSkin: id };
}

// The CSS class the portrait carries for the active frame ('' = none). One place so every portrait (Home, Personagem, the top bars) frames the same way.
export const portraitFrameClass = (save: Pick<SaveData, 'activeFrame'>): string => (save.activeFrame ? ` portrait-frame ${save.activeFrame.replace(/_/g, '-')}` : '');
