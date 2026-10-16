import { useEffect, useRef } from 'react';
import { mt } from '../../locales/market';
import { MarketUnreachable } from '../../game/market/api';
import { syncMarket } from '../../game/market/sync';
import { MarketHost, syncDepsFor } from './marketDeps';

// Renders nothing. While the market is switched on (web build, signed in) it keeps the save and the server's certificates in line: items listed or sold leave the save, bought or returned items
// come in from their certificate, and each delivery is acknowledged only after the server confirmed a save that has the item (game/market/sync.ts).
const EVERY_MS = 60_000;
const SOON_MS = 6_000;
const MAX_SOON = 12;

export default function MarketSync({ host }: { host: MarketHost }) {
  const hostRef = useRef(host);
  hostRef.current = host;

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let soon = 0;
    const tick = async () => {
      if (stopped) return;
      let next = EVERY_MS;
      if (document.visibilityState === 'visible') {
        try {
          const r = await syncMarket(syncDepsFor(hostRef.current));
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
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), next);
    };
    timer = window.setTimeout(() => void tick(), 1500);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void tick(), 500);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
