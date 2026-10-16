import { useEffect, useRef, useState } from 'react';
import type { SaveData } from './engine';
import { materialApi } from './materialServer';
import { getSyncedSave } from './syncedSave';
import { resolveNextClaim, runSync, flushBurns } from './tradeableActions';

// Keeps the web build's tradeable materials in step with the server (tradeableActions.ts): the roll of each claim the game reported, the burn of units it spent, and the reconcile of the save
// with the account's balance on load and now and then. Nothing here runs without an account on a build with a backend. Every step is retried with the same request id, so a closed tab or a
// server that is down never loses a roll and never repeats one.

const RETRY_MS = 30_000;
const BURN_DELAY_MS = 1_200;
const RESYNC_MS = 5 * 60_000;
const WAITING_MS = 8_000;

export function useTradeableSync({
  enabled,
  userId,
  save,
  getSave,
  commit,
  onFound,
}: {
  enabled: boolean;
  userId: string | null;
  save: SaveData;
  getSave: () => SaveData;
  commit: (next: SaveData) => void;
  /** tradeable units a claim just turned up, by material (the game says so in a toast) */
  onFound: (found: Record<string, number>) => void;
}) {
  const live = useRef({ getSave, commit, onFound });
  live.current = { getSave, commit, onFound };
  // The save the SERVER holds: the last one it confirmed this session, or (before the first save) the one the game loaded, which came from the server.
  const loaded = useRef(save);
  const confirmed = (): SaveData => getSyncedSave() ?? loaded.current;
  const active = enabled && !!userId;

  // 1. the reconcile on load, when the tab comes back after a while, and every few minutes
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    void (async () => {
      const r = await runSync(materialApi, () => live.current.getSave(), (s) => live.current.commit(s), undefined, confirmed);
      if (stopped) return;
      // unreachable: try again in a while; a delivery waiting for the server to confirm a save that holds it: look again very soon
      if (r.status === 'unreachable') window.setTimeout(() => !stopped && setSyncTick((n) => n + 1), RETRY_MS);
      else if (r.waiting) window.setTimeout(() => !stopped && setSyncTick((n) => n + 1), WAITING_MS);
    })();
    return () => {
      stopped = true;
    };
  }, [active, userId, syncTick]);
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > RESYNC_MS) {
        last = Date.now();
        setSyncTick((n) => n + 1);
      }
    };
    const timer = window.setInterval(() => {
      last = Date.now();
      if (document.visibilityState === 'visible') setSyncTick((n) => n + 1);
    }, RESYNC_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active]);

  // 2. the claims waiting for the server's roll, one after the other
  const claimId = save.materialClaims?.[0]?.id ?? null;
  const [claimRetry, setClaimRetry] = useState(0);
  useEffect(() => {
    if (!active || !claimId) return;
    let stopped = false;
    let timer: number | undefined;
    void (async () => {
      const step = await resolveNextClaim(materialApi, () => live.current.getSave());
      if (stopped) return;
      if (step.status === 'unreachable') {
        timer = window.setTimeout(() => setClaimRetry((n) => n + 1), RETRY_MS);
        return;
      }
      if (step.save) live.current.commit(step.save);
      if (step.found && Object.keys(step.found).length > 0) live.current.onFound(step.found);
    })();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [active, claimId, claimRetry]);

  // 3. the burns of the units the game spent, batched a moment after the last one
  const burnKey = `${JSON.stringify(save.tradeableBurns ?? null)}|${save.tradeableBurning?.id ?? ''}`;
  const hasBurns = !!save.tradeableBurns || !!save.tradeableBurning;
  const [burnRetry, setBurnRetry] = useState(0);
  useEffect(() => {
    if (!active || !hasBurns) return;
    let stopped = false;
    let retry: number | undefined;
    const timer = window.setTimeout(async () => {
      const r = await flushBurns(materialApi, () => live.current.getSave(), (s) => live.current.commit(s));
      if (!stopped && r === 'unreachable') retry = window.setTimeout(() => setBurnRetry((n) => n + 1), RETRY_MS);
    }, BURN_DELAY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (retry) window.clearTimeout(retry);
    };
  }, [active, hasBurns, burnKey, burnRetry]);
}
