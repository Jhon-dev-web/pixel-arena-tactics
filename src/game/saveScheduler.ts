// When the game's save goes to the server. The save itself is changed (and mirrored to the device, pendingCloudSave.ts) on every action; the cloud copy is uploaded in BATCHES:
// changes are coalesced and uploaded at most once every CLOUD_SAVE_MIN_INTERVAL_MS while something is pending, plus at once when something that must not wait happens (an "important" change,
// saveImportance.ts), when a caller needs the server to hold the latest save (flushCloudSave), and when the page is going away (hidden / pagehide / beforeunload, with a keepalive request).
// A change is never dropped: a failed upload keeps the pending flag and is retried with a growing delay; the optimistic-revision conflict handling lives in the upload function (App.tsx) and is
// not touched here. This file only decides WHEN, so it knows nothing about React, Supabase or the save's shape and is tested with a fake clock.

/** At most one background upload per this long while changes are pending (tunable). 45 s caps a constantly-playing hero at 80 uploads an hour. */
export const CLOUD_SAVE_MIN_INTERVAL_MS = 45_000;
/** The first change after a quiet spell is uploaded this soon (the debounce that groups the burst of one action). */
export const CLOUD_SAVE_FIRST_DELAY_MS = 800;
/** An important change is uploaded at once, but never twice within this gap (a loop of important changes cannot hammer the server). */
export const CLOUD_SAVE_IMPORTANT_GAP_MS = 5_000;
/** Retry delay after a failed upload: 5 s, 10 s, 20 s ... up to 2 minutes. */
export const CLOUD_SAVE_BACKOFF_BASE_MS = 5_000;
export const CLOUD_SAVE_BACKOFF_MAX_MS = 120_000;
/** When the upload function says "not now" (the League swap is running) the scheduler asks again after this long. */
export const CLOUD_SAVE_SKIP_RETRY_MS = 2_000;

/** ok = the server has it. conflict = another tab / device saved first and the caller already adopted the server's copy. failed = network or server trouble, keep it pending. skipped = not now, ask again soon. */
export type UploadOutcome = 'ok' | 'conflict' | 'failed' | 'skipped';

export interface SaveSchedulerOptions {
  /** Uploads whatever the app holds RIGHT NOW (it reads its own latest state). `keepalive` asks for a request that survives the page closing. */
  upload: (opts: { keepalive: boolean }) => Promise<UploadOutcome>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  minIntervalMs?: number;
  firstDelayMs?: number;
  importantGapMs?: number;
}

export class SaveScheduler {
  private dirty = false;
  private timer: unknown = null;
  private timerDue = 0;
  private inflight: Promise<UploadOutcome> | null = null;
  private lastUploadAt = Number.NEGATIVE_INFINITY;
  private failures = 0;
  private disposed = false;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly minInterval: number;
  private readonly firstDelay: number;
  private readonly importantGap: number;

  constructor(private readonly opts: SaveSchedulerOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.minInterval = opts.minIntervalMs ?? CLOUD_SAVE_MIN_INTERVAL_MS;
    this.firstDelay = opts.firstDelayMs ?? CLOUD_SAVE_FIRST_DELAY_MS;
    this.importantGap = opts.importantGapMs ?? CLOUD_SAVE_IMPORTANT_GAP_MS;
  }

  /** True while a change waits for the server (or an upload is running). */
  get pending(): boolean {
    return this.dirty || this.inflight !== null;
  }

  /** The app changed its save. `important` changes are uploaded at once (within the small gap); the rest wait for the batch. */
  markDirty(important = false): void {
    if (this.disposed) return;
    this.dirty = true;
    if (this.inflight) return; // when the running upload ends it schedules the next one
    this.schedule(important);
  }

  /** The device is back online: forget the backoff and try now. */
  resumeNow(): void {
    this.failures = 0;
    if (this.dirty) void this.flush();
  }

  /**
   * Uploads everything pending and waits for it. Resolves true when the server holds the latest save, false when it could not be done (the change stays pending and retries on its own).
   * `keepalive` is for a page that is going away.
   */
  async flush(opts: { keepalive?: boolean } = {}): Promise<boolean> {
    this.cancelTimer();
    for (let guard = 0; guard < 5; guard++) {
      if (this.inflight) await this.inflight.catch(() => undefined);
      if (!this.dirty) return true;
      const outcome = await this.runOnce(!!opts.keepalive);
      if (outcome === 'failed' || outcome === 'skipped') return false;
    }
    return !this.dirty;
  }

  /** Undo dispose (React StrictMode runs an effect's cleanup and setup again on the same instance). */
  enable(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private arm(delay: number): void {
    this.cancelTimer();
    this.timerDue = this.now() + delay;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.runOnce(false);
    }, delay);
  }

  private schedule(important: boolean): void {
    if (!this.dirty || this.inflight || this.disposed) return;
    const sinceLast = this.now() - this.lastUploadAt;
    let delay: number;
    if (this.failures > 0) delay = this.backoff();
    else if (important) delay = Math.max(0, this.importantGap - sinceLast);
    else delay = Math.max(this.firstDelay, this.minInterval - sinceLast);
    // an earlier wake-up replaces a later one (an important change must not wait behind the batch), never the other way round
    if (this.timer !== null && this.timerDue <= this.now() + delay) return;
    this.arm(delay);
  }

  private backoff(): number {
    return Math.min(CLOUD_SAVE_BACKOFF_BASE_MS * 2 ** (this.failures - 1), CLOUD_SAVE_BACKOFF_MAX_MS);
  }

  private runOnce(keepalive: boolean): Promise<UploadOutcome> {
    if (this.inflight) return this.inflight;
    this.cancelTimer();
    this.dirty = false; // a change made while the upload runs sets it again
    const run = (async (): Promise<UploadOutcome> => {
      let outcome: UploadOutcome;
      try {
        outcome = await this.opts.upload({ keepalive });
      } catch {
        outcome = 'failed';
      }
      if (outcome === 'ok' || outcome === 'conflict') {
        this.failures = 0;
        this.lastUploadAt = this.now();
      } else {
        this.dirty = true; // nothing is dropped
        if (outcome === 'failed') this.failures++;
      }
      return outcome;
    })();
    this.inflight = run;
    void run.then((outcome) => {
      this.inflight = null;
      if (!this.dirty || this.disposed) return;
      if (outcome === 'skipped') this.arm(CLOUD_SAVE_SKIP_RETRY_MS);
      else this.schedule(false);
    });
    return run;
  }
}

// ---- the app's one scheduler, reachable from hooks that need the server to hold the latest save --------------------------------------------------

let active: SaveScheduler | null = null;

export function setActiveSaveScheduler(scheduler: SaveScheduler | null): void {
  active = scheduler;
}

/** Uploads the pending save and waits for it. Resolves true when there is nothing pending (also when there is no cloud save at all: the offline build). */
export function flushCloudSave(opts: { keepalive?: boolean } = {}): Promise<boolean> {
  return active ? active.flush(opts) : Promise.resolve(true);
}
