import { useEffect, useRef } from 'react';
import { mt } from '../../locales/market';
import { MarketUnreachable } from '../../game/market/api';
import { syncMarket } from '../../game/market/sync';
import { syncMaterials } from '../../game/market/materialSync';
import { MarketHost, syncDepsFor } from './marketDeps';
import { startPolling } from '../../lib/poller';

// Renders nothing. THE SAFETY NET, not the way actions show up: every click on the market screens is one server request whose answer is applied to the screen and the save at once (MarketScreen,
// game/market/liveState.ts). This pass only catches what an action could not finish (a closed tab, a lost answer, a full bag, a sale that happened while the player was away).
// While the market is switched on (web build, signed in) it keeps the save and the server's certificates in line: items listed or sold leave the save, bought or returned items
// come in from their certificate, and each delivery is acknowledged only after the server confirmed a save that has the item (game/market/sync.ts).
// A pass every 10 minutes (it is 3 to 4 requests), paused while the tab is hidden and jittered (lib/poller.ts); the market screens run a pass of their own when the player opens them, and a
// delivery that waits for a confirmed save looks again every few seconds (SOON_MS) for a little while.
const EVERY_MS = 10 * 60_000;
const SOON_MS = 6_000;
const MAX_SOON = 12;

export default function MarketSync({ host }: { host: MarketHost }) {
  const hostRef = useRef(host);
  hostRef.current = host;

  useEffect(() => {
    let soon = 0;
    // One pass. The number it returns (when a delivery is waiting for the server to confirm a save) is the wait before the next pass instead of the 10 minutes.
    const tick = async (): Promise<number | undefined> => {
      let next: number | undefined;
      try {
        const r = await syncMarket(syncDepsFor(hostRef.current));
        // the lots of tradeable materials the server holds for this account (a purchase, a cancelled or an expired lot)
        const lots = await syncMaterials(hostRef.current).catch(() => null);
        if (lots && lots.added > 0) hostRef.current.notify(mt('toast.materials', { n: lots.added }));
        if (lots?.waiting && soon < MAX_SOON) {
          soon++;
          next = SOON_MS;
        }
        if (r.added > 0) hostRef.current.notify(mt('toast.received'));
        if (r.removed > 0) hostRef.current.notify(mt('toast.removed'));
        if (r.waitingForRoom > 0 && soon === 0) hostRef.current.notify(mt('toast.bagFull'));
        // a delivery waits for a confirmed save before it is acknowledged: look again soon
        if (r.ok && (r.added > 0 || r.waitingForRoom > 0 || soon > 0) && soon < MAX_SOON) {
          soon++;
          next = SOON_MS;
        } else soon = 0;
      } catch (err) {
        if (!(err instanceof MarketUnreachable)) console.error('[market-sync] failed', err instanceof Error ? err.message : 'unknown');
      }
      return next;
    };
    return startPolling({ intervalMs: EVERY_MS, startDelayMs: 1500, run: tick });
  }, []);

  return null;
}
