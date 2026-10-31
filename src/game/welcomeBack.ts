import { deviceStorage, isOnlineStorage } from '../lib/deviceStore';
import { computeHuntingStatus, computeMiningStatus, computeWoodcuttingStatus, SaveData } from './engine';
import { isDeliveryReady } from './deliveries';
import { readySlots } from './gardenActions';
import { claimOrder } from './huntLifecycle';
import { MaterialId } from './materials';
import { UniqueDrop } from './uniques';

// "Welcome back": what the idle activities have produced (or are ready to hand over) since the player last looked. A pure read of the save at `now`;
// nothing is paid and nothing rolls, so it can be computed on load and again whenever the window comes back. An activity that has produced nothing is
// simply not a row, and no rows means no modal.
//
// A hunt whose reward is already waiting (pendingHuntReward) is NOT listed: that reward has its own mandatory screen.

// The longest absence that is not worth a summary: under half an hour away (an alt-tab, a lunch call, the phone locked for a while) nothing is shown.
export const WELCOME_BACK_AWAY_MS = 30 * 60 * 1000;

// How many materials a card shows as icons; the others are counted ("+N"), never dropped silently.
export const WELCOME_MATERIALS_SHOWN = 4;

export interface WelcomeMaterial {
  id: MaterialId;
  n: number;
}
// The first `limit` materials (the list already comes rarest first) and how many were left out.
export function splitMaterials(all: WelcomeMaterial[], limit = WELCOME_MATERIALS_SHOWN): { shown: WelcomeMaterial[]; more: number } {
  return { shown: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

export type WelcomeBackRow =
  | { kind: 'hunt'; zoneId: string; timeMs: number; kills: number; gold: number; xp: number; mats: WelcomeMaterial[]; uniques: number; capHit: boolean }
  | { kind: 'mining' | 'woodcutting'; material: MaterialId; units: number; gold: number; timeMs: number; capHit: boolean }
  | { kind: 'garden'; ready: number }
  | { kind: 'delivery' };

export interface WelcomeBackSummary {
  rows: WelcomeBackRow[];
  // How long the player was away (the modal says so); left out when the last visit is not known.
  awayMs?: number;
}

// How long ago the game was last seen alive, or null when that is not known (or not a real past moment).
export function awayFor(lastSeen: number | null, now: number): number | null {
  return lastSeen !== null && Number.isFinite(lastSeen) && now > lastSeen ? now - lastSeen : null;
}

// Whether the player has been away long enough: `lastSeen` is the last time THIS account's game was seen alive. null = never recorded = the first session of
// this hero on this device (a brand-new account, or storage that cannot remember): nobody is "back", so there is no summary.
export function awayLongEnough(lastSeen: number | null, now: number): boolean {
  return lastSeen !== null && Number.isFinite(lastSeen) && now - lastSeen >= WELCOME_BACK_AWAY_MS;
}

const countUniques = (u: UniqueDrop[] | undefined): number => (u ?? []).length;

export function buildWelcomeBack(save: SaveData, now: number): WelcomeBackSummary {
  const rows: WelcomeBackRow[] = [];

  if (save.activeHuntingZone && !save.pendingHuntReward) {
    const st = computeHuntingStatus(save, now);
    const ids = (Object.keys(st.drops) as MaterialId[]).filter((id) => (st.drops[id] ?? 0) > 0);
    if (st.kills > 0 || ids.length > 0) {
      // Every material the hunt found, rarest first (the order the reward screen uses); the card decides how many to show and counts the rest.
      const mats = claimOrder(save.activeHuntingZone, ids).map((id) => ({ id, n: st.drops[id] ?? 0 }));
      rows.push({
        kind: 'hunt',
        zoneId: save.activeHuntingZone,
        timeMs: st.pendingMs,
        kills: st.kills,
        gold: st.goldReady,
        xp: st.xpReady,
        mats,
        uniques: countUniques(st.uniques),
        capHit: st.full && st.capMs > 0,
      });
    }
  }

  const mining = computeMiningStatus(save, now);
  if (save.activeOreId && mining.oreId && (mining.oreReady > 0 || mining.goldReady > 0)) {
    rows.push({ kind: 'mining', material: mining.oreId as MaterialId, units: mining.oreReady, gold: mining.goldReady, timeMs: mining.pendingMs, capHit: mining.full });
  }
  const wood = computeWoodcuttingStatus(save, now);
  if (save.activeWoodId && wood.woodId && (wood.woodReady > 0 || wood.goldReady > 0)) {
    rows.push({ kind: 'woodcutting', material: wood.woodId, units: wood.woodReady, gold: wood.goldReady, timeMs: wood.pendingMs, capHit: wood.full });
  }

  const garden = readySlots(save, now).length;
  if (garden > 0) rows.push({ kind: 'garden', ready: garden });
  if (isDeliveryReady(save, now)) rows.push({ kind: 'delivery' });

  return { rows };
}

// When the game was last seen alive in THIS browser / app (a local convenience only, never saved with the hero).
// Stamped per account (a second account on the same browser never inherits the first one's absence) and mirrored in memory (storage that refuses writes
// still answers within a session).
const LAST_SEEN_KEY = 'arena-last-seen';
const memorySeen = new Map<string, number>();
const seenKey = (accountId: string | null | undefined) => (accountId ? `${LAST_SEEN_KEY}.${accountId}` : LAST_SEEN_KEY);
export function readLastSeen(accountId?: string | null): number | null {
  const key = seenKey(accountId);
  let stored: number | null = null;
  try {
    const v = Number(deviceStorage.getItem(key));
    stored = Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    /* no storage: the in-memory stamp below still answers */
  }
  const mem = isOnlineStorage() ? null : (memorySeen.get(key) ?? null); // online the in-memory store already answers, and is emptied at sign-out
  return stored === null ? mem : mem === null ? stored : Math.max(stored, mem);
}
export function writeLastSeen(now: number, accountId?: string | null): void {
  const key = seenKey(accountId);
  if (!isOnlineStorage()) memorySeen.set(key, Math.floor(now));
  try {
    deviceStorage.setItem(key, String(Math.floor(now)));
  } catch {
    /* private mode: the in-memory stamp keeps short absences quiet */
  }
}
