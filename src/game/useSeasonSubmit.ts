import { useCallback, useEffect, useRef } from 'react';
import { extractMetrics } from '../../supabase/functions/_shared/progress/metrics';
import type { SaveData } from './engine';
import { getSyncedSave } from './syncedSave';
import { flushCloudSave } from './saveScheduler';
import { startPolling } from '../lib/poller';
import { getServerResetAt, shouldHoldSubmission } from './leagueReset';
import { FIRST_SUBMIT_DELAY_MS, EVENT_MIN_GAP_MS, SUBMIT_INTERVAL_MS, resetSubmitStatus, shouldSubmitNow, submitProgress } from './seasonRanking';

// Feeds the season ranking: after login, posts the save to the server at most every 10 minutes and soon after an important event (a level gained, a boss killed).
// Fire and forget: it never awaits anything the game needs, never throws, and a failure only changes the one status line on the ranking screen.
// `enabled` is false in the desktop / offline build (no backend) and whenever VITE_SEASON_RANKING_ENABLED is off, and then this hook does nothing at all.
// It posts the last SAVED save (syncedSave.ts), not the live state: the server compares the blob with the stored game and answers a retryable 409 when they differ.
export function useSeasonSubmit(enabled: boolean, save: SaveData): void {
  const lastAttemptAt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const seen = useRef<{ levelTotal: number; bosses: number } | null>(null);
  // 10 minutes plus up to 10 % (rolled again after each attempt): never less, because the server refuses a second snapshot inside 10 minutes
  const jitter = useRef(1 + Math.random() * 0.1);

  const attempt = useCallback(
    (event: boolean) => {
      if (!enabled || inFlight.current) return;
      const now = Date.now();
      if (!shouldSubmitNow({ now, lastAttemptAt: lastAttemptAt.current, event, jitter: jitter.current })) return;
      jitter.current = 1 + Math.random() * 0.1;
      inFlight.current = true;
      void (async () => {
        try {
          // The server compares the blob's hash with the game it stores, and uploads are batched: make it hold the latest save first, then post exactly that one.
          await flushCloudSave();
          const synced = getSyncedSave();
          if (!synced) return; // nothing saved yet this session: try again on the next minute tick
          if (shouldHoldSubmission(synced, getServerResetAt())) return; // a hero from before the first League's reset: the game is about to replace it, the server would only say "wait"
          lastAttemptAt.current = now;
          const status = await submitProgress(synced, now);
          // The server said the saved game was not (yet) the one posted: ask again in about a minute instead of waiting 10.
          if (status.pendingSync) lastAttemptAt.current = now - SUBMIT_INTERVAL_MS + EVENT_MIN_GAP_MS;
        } finally {
          inFlight.current = false;
        }
      })();
    },
    [enabled],
  );

  // The 10 minute rhythm: one check a minute, the first shortly after login.
  useEffect(() => {
    if (!enabled) {
      resetSubmitStatus();
      return;
    }
    // the check itself is local and cheap; it is paused while the tab is hidden, and the request it may make is the 10 minute one
    return startPolling({ intervalMs: 60 * 1000, startDelayMs: FIRST_SUBMIT_DELAY_MS, run: () => attempt(false) });
  }, [enabled, attempt]);

  // Important events: the first reading only remembers where the hero is; a higher level (paragon included) or one more boss afterwards asks for a submission.
  const bosses = save.stats?.bossesKilled ?? 0;
  useEffect(() => {
    if (!enabled) return;
    const m = extractMetrics(save);
    if (!m) return;
    const prev = seen.current;
    seen.current = { levelTotal: m.levelTotal, bosses: m.bossesKilled };
    if (prev && (m.levelTotal > prev.levelTotal || m.bossesKilled > prev.bosses)) attempt(true);
    // only a new XP total or boss count matters; `save` itself changes on every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt, save.xp, bosses]);
}
