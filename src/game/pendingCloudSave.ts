import { SaveData, normalizeSave } from './engine';
import { fromUploadBlob } from './saveUpload';

// The device copy of a signed-in hero's save. The cloud upload is batched (saveScheduler.ts), so every change is also written here at once: if the tab or the phone dies before the next upload,
// the next load finds it and carries on from it. It is NOT a second source of truth: it is used only when the server still holds the exact revision the journal was based on (nothing else saved
// in between); if another tab or device saved since, the server wins, as it always did, and the journal is dropped. It lives under its own key, never `arena-rpg-save-v1`, so it can never be
// mistaken for a legacy local save by the import prompt, and it is cleared when the server confirms the latest save (or on sign-out of that account).

export const PENDING_CLOUD_SAVE_KEY = 'arena-rpg-pending-cloud-v1';

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
  /** the server revision the pending save was made on top of */
  baseRevision: number;
  at: number;
  save: unknown;
}

export function writePendingCloudSave(userId: string, baseRevision: number, save: SaveData, storage: StorageLike | null = defaultStorage(), now: number = Date.now()): void {
  if (!storage) return;
  try {
    const journal: Journal = { userId, baseRevision, at: now, save };
    storage.setItem(PENDING_CLOUD_SAVE_KEY, JSON.stringify(journal));
  } catch {
    /* quota or private mode: the cloud upload is still the copy that matters */
  }
}

export function clearPendingCloudSave(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(PENDING_CLOUD_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/** The save to continue from: the journal's, when it belongs to this account and was based on exactly the revision the server holds now. Otherwise null (and the stale journal is removed). */
export function takePendingCloudSave(userId: string, serverRevision: number, storage: StorageLike | null = defaultStorage()): SaveData | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(PENDING_CLOUD_SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<Journal>;
    if (j && j.userId === userId && j.baseRevision === serverRevision && j.save && typeof j.save === 'object') return normalizeSave(fromUploadBlob(j.save));
  } catch {
    /* unreadable: drop it below */
  }
  // another account's, an older revision (the server moved on) or garbage
  clearPendingCloudSave(storage);
  return null;
}
