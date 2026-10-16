import type { SaveData } from '../../game/engine';
import { setCertificates } from '../../game/itemCerts';
import { fetchMyCertificates } from '../../game/itemServer';
import { marketApi } from '../../game/market/api';
import type { SyncDeps } from '../../game/market/sync';
import { getSyncedSave } from '../../game/syncedSave';

// What App hands the market screens: the live save and a way to change it. The real api and the real certificate table are wired here, once.
export interface MarketHost {
  getSave: () => SaveData;
  applySave: (next: SaveData) => void;
  notify: (message: string) => void;
}

export function syncDepsFor(host: MarketHost): SyncDeps {
  return {
    api: marketApi,
    getSave: host.getSave,
    getSynced: getSyncedSave,
    applySave: host.applySave,
    loadCertificates: async () => {
      const list = await fetchMyCertificates();
      setCertificates(list);
      return list;
    },
    now: () => Date.now(),
  };
}
