import { SaveData, normalizeSave } from './engine';
import { fromUploadBlob } from './saveUpload';

// The device copy of a signed-in hero's save. The cloud upload is batched (saveScheduler.ts), so every change is also written here at once: if the tab or the phone dies before the next upload,
// the next load finds it and carries on from it. It is NOT a second source of truth: it is used only when it belongs to the same account AND the same character row AND the server still holds the
// exact revision the journal was based on (nothing else saved in between); if another tab or device saved since, the server wins, as it always did, and the journal is dropped. It lives under its
// own key PER ACCOUNT (`arena-rpg-pending-cloud-v1.<userId>`), never `arena-rpg-save-v1`, so it can never be mistaken for a legacy local save by the import prompt nor reach another account, and
// it is cleared when the server confirms the latest save.

/** The pre-namespacing key (one journal for the whole device). Only read to migrate it to the account that wrote it. */
export const PENDING_CLOUD_SAVE_KEY = 'arena-rpg-pending-cloud-v1';
export const pendingCloudSaveKey = (userId: string): string => `${PENDING_CLOUD_SAVE_KEY}.${userId}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

interface Journal {
  userId: string;
  /** the server character row this journal belongs to (absent in journals written before it was recorded) */
  characterId?: string;
  /** the server revision the pending save was made on top of */
  baseRevision: number;
  at: number;
  save: unknown;
}

export function writePendingCloudSave(
  userId: string,
  baseRevision: number,
  save: SaveData,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now(),
  characterId?: string,
): void {
  if (!storage) return;
  try {
    const journal: Journal = { userId, characterId, baseRevision, at: now, save };
    storage.setItem(pendingCloudSaveKey(userId), JSON.stringify(journal));
  } catch {
    /* quota or private mode: the cloud upload is still the copy that matters */
  }
}

export function clearPendingCloudSave(userId: string, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(pendingCloudSaveKey(userId));
  } catch {
    /* ignore */
  }
}

/** Moves a journal left under the old shared key to the account that wrote it (once); it never reaches another account. */
function migrateOldJournal(storage: StorageLike): void {
  try {
    const raw = storage.getItem(PENDING_CLOUD_SAVE_KEY);
    if (raw === null) return;
    storage.removeItem(PENDING_CLOUD_SAVE_KEY);
    const j = JSON.parse(raw) as Partial<Journal>;
    if (j && typeof j.userId === 'string' && j.userId && storage.getItem(pendingCloudSaveKey(j.userId)) === null) storage.setItem(pendingCloudSaveKey(j.userId), raw);
  } catch {
    /* unreadable: gone */
  }
}

/**
 * The save to continue from: this account's journal, when it was made for this same character row (when both sides know it) and based on exactly the revision the server holds now.
 * Otherwise null (and the stale journal is removed). A journal of another account is never even read.
 */
export function takePendingCloudSave(userId: string, serverRevision: number, storage: StorageLike | null = defaultStorage(), characterId?: string): SaveData | null {
  if (!storage) return null;
  migrateOldJournal(storage);
  let raw: string | null;
  try {
    raw = storage.getItem(pendingCloudSaveKey(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<Journal>;
    const sameRow = !j.characterId || !characterId || j.characterId === characterId;
    if (j && j.userId === userId && sameRow && j.baseRevision === serverRevision && j.save && typeof j.save === 'object') return normalizeSave(fromUploadBlob(j.save));
  } catch {
    /* unreadable: drop it below */
  }
  // an older revision (the server moved on), another character row or garbage
  clearPendingCloudSave(userId, storage);
  return null;
}
