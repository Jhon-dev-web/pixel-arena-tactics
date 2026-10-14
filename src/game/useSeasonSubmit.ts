import { MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { extractMetrics } from '../../supabase/functions/_shared/progress/metrics';
import type { SaveData } from './engine';
import { FIRST_SUBMIT_DELAY_MS, resetSubmitStatus, shouldSubmitNow, submitProgress } from './seasonRanking';

// Feeds the season ranking: after login, posts the save to the server at most every 10 minutes and soon after an important event (a level gained, a boss killed).
// Fire and forget: it never awaits anything the game needs, never throws, and a failure only changes the one status line on the ranking screen.
// `enabled` is false in the desktop / offline build (no backend) and whenever VITE_SEASON_RANKING_ENABLED is off, and then this hook does nothing at all.
export function useSeasonSubmit(enabled: boolean, save: SaveData, saveRef: MutableRefObject<SaveData>): void {
  const lastAttemptAt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const seen = useRef<{ levelTotal: number; bosses: number } | null>(null);

  const attempt = useCallback(
    (event: boolean) => {
      if (!enabled || inFlight.current) return;
      const now = Date.now();
      if (!shouldSubmitNow({ now, lastAttemptAt: lastAttemptAt.current, event })) return;
      lastAttemptAt.current = now;
      inFlight.current = true;
      void submitProgress(saveRef.current, now).finally(() => {
        inFlight.current = false;
      });
    },
    [enabled, saveRef],
  );

  // The 10 minute rhythm: one check a minute, the first shortly after login.
  useEffect(() => {
    if (!enabled) {
      resetSubmitStatus();
      return;
    }
    const first = window.setTimeout(() => attempt(false), FIRST_SUBMIT_DELAY_MS);
    const every = window.setInterval(() => attempt(false), 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
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
