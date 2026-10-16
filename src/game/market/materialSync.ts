import type { SaveData } from '../engine';
import { materialApi } from '../materialServer';
import { getSyncedSave } from '../syncedSave';
import { runSync } from '../tradeableActions';
import { totalTradeable } from '../tradeableMaterials';

// The market's side of the tradeable-material reconcile (tradeableActions.runSync): after a purchase, a cancelled or an expired lot, the units the server holds FOR this account are added to the save,
// and acknowledged only once the server confirmed a save that has them. The app also runs this on load and every few minutes (useTradeableSync); this is the quick path the market screens call.
export interface MaterialSyncResult {
  ok: boolean;
  /** tradeable units that came into the save this pass */
  added: number;
  /** a delivery is waiting for the server to confirm a save that has it (look again soon) */
  waiting: boolean;
}

export async function syncMaterials(d: { getSave: () => SaveData; applySave: (next: SaveData) => void }): Promise<MaterialSyncResult> {
  const before = totalTradeable(d.getSave());
  const r = await runSync(materialApi, d.getSave, d.applySave, undefined, getSyncedSave);
  return { ok: r.status === 'ok', added: Math.max(0, totalTradeable(d.getSave()) - before), waiting: r.waiting };
}
