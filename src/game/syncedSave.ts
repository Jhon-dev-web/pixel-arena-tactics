import type { SaveData } from './engine';

// The save the server holds (the last one repository.save() stored successfully). The season ranking posts THIS object, never the live state: the submit-progress function
// refuses a blob whose canonical hash differs from characters.save_data (docs/SEASON_RANKING.md), so the only blob guaranteed to match is the one that was just saved.
// Null until the first successful save of the session (a freshly loaded save is normalized on load and may differ byte for byte from what the server stores).
let synced: SaveData | null = null;

export const getSyncedSave = (): SaveData | null => synced;
export const setSyncedSave = (save: SaveData | null): void => {
  synced = save;
};
