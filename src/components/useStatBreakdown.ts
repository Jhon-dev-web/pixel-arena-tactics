import { useEffect, useMemo, useState } from 'react';
import type { SaveData } from '../game/engine';
import { runningTemporaries, statBreakdown, StatBreakdown } from '../game/statBreakdown';

// The hero's breakdown at the current moment. It re-reads the clock every second while something temporary is running (the timers tick, an elixir that runs out drops off the
// totals) and stays still otherwise; any change of the save recomputes it at once.
export function useStatBreakdown(save: SaveData): StatBreakdown {
  const [tick, setTick] = useState(0);
  const running = runningTemporaries(save, Date.now()).length > 0;
  useEffect(() => {
    if (!running) return;
    const iv = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(iv);
  }, [running]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => statBreakdown(save, Date.now()), [save, tick]);
}
