// One way to run something on a timer when it asks the server: every periodic remote call of the game goes through here, so they all behave the same.
//   - Hidden tab = no calls. The timer is stopped when the tab is hidden and nothing runs until it is visible again (a background tab is not playing, and 50 000 of them must not hit the server).
//   - Back in view, the call runs only if its time has come (a quick alt-tab never makes a request); if it is overdue it runs after a small random delay, so the clients that were all hidden together
//     do not come back in the same second.
//   - Every wait is jittered by +-10 % (JITTER), so clients that started together drift apart instead of calling at the same second forever.
// Pure of React and of `document`: the environment is injected, which is how the tests run it on a fake clock.

export const POLL_JITTER = 0.1;
/** An overdue call that was waiting for the tab to come back runs after a random delay up to this long. */
export const RESUME_SPREAD_MS = 2_000;

export interface PollEnv {
  visible: () => boolean;
  /** Calls `cb` whenever the tab's visibility changes; returns the unsubscribe. */
  onVisibility: (cb: () => void) => () => void;
  now: () => number;
  random: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export const browserPollEnv: PollEnv = {
  visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  onVisibility: (cb) => {
    if (typeof document === 'undefined') return () => undefined;
    document.addEventListener('visibilitychange', cb);
    return () => document.removeEventListener('visibilitychange', cb);
  },
  now: () => Date.now(),
  random: () => Math.random(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface PollOptions {
  intervalMs: number;
  /** The call. It may return a number: the wait (ms, not jittered) before the NEXT call instead of the interval (a quick re-check while something is pending). */
  run: () => unknown | Promise<unknown>;
  /** Wait before the first call; omitted = the first call comes after one interval (the caller already made it). */
  startDelayMs?: number;
  jitter?: number;
  env?: Partial<PollEnv>;
}

/** Jitter applied to a wait: +-`jitter` of it, never below 0. */
export function jittered(ms: number, jitter: number, random: () => number): number {
  return Math.max(0, Math.round(ms * (1 + (random() * 2 - 1) * jitter)));
}

/** Starts the timer; returns the function that stops it for good. */
export function startPolling(opts: PollOptions): () => void {
  const env: PollEnv = { ...browserPollEnv, ...opts.env };
  const jitter = opts.jitter ?? POLL_JITTER;
  let stopped = false;
  let timer: unknown = null;
  let running = false;
  let lastRunAt: number | null = null;
  let plannedDelay = opts.startDelayMs ?? opts.intervalMs;
  let plannedFrom = env.now();

  const arm = (delay: number): void => {
    if (timer !== null) env.clearTimer(timer);
    plannedDelay = delay;
    plannedFrom = env.now();
    timer = env.setTimer(() => void fire(), delay);
  };

  const fire = async (): Promise<void> => {
    timer = null;
    if (stopped || running) return;
    if (!env.visible()) return; // paused: the visibility handler restarts it
    running = true;
    let override: number | null = null;
    try {
      const out = await opts.run();
      if (typeof out === 'number' && out >= 0) override = out;
    } catch {
      /* a failing call must not stop the rhythm */
    } finally {
      running = false;
      lastRunAt = env.now();
    }
    if (stopped) return;
    if (!env.visible()) return; // hid while the call was out: wait for the tab
    arm(override ?? jittered(opts.intervalMs, jitter, env.random));
  };

  const onVisibility = (): void => {
    if (stopped) return;
    if (!env.visible()) {
      if (timer !== null) env.clearTimer(timer);
      timer = null;
      return;
    }
    if (timer !== null || running) return; // already scheduled
    const since = env.now() - (lastRunAt ?? plannedFrom);
    const remaining = plannedDelay - since;
    if (remaining <= 0) arm(Math.round(env.random() * RESUME_SPREAD_MS));
    else arm(jittered(remaining, jitter, env.random));
  };

  const unsubscribe = env.onVisibility(onVisibility);
  if (env.visible()) arm(opts.startDelayMs ?? jittered(opts.intervalMs, jitter, env.random));
  else timer = null;

  return () => {
    stopped = true;
    if (timer !== null) env.clearTimer(timer);
    timer = null;
    unsubscribe();
  };
}
