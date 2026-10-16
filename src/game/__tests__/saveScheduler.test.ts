import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_SAVE_BACKOFF_BASE_MS,
  CLOUD_SAVE_FIRST_DELAY_MS,
  CLOUD_SAVE_IMPORTANT_GAP_MS,
  CLOUD_SAVE_MIN_INTERVAL_MS,
  CLOUD_SAVE_SKIP_RETRY_MS,
  SaveScheduler,
  UploadOutcome,
  flushCloudSave,
  setActiveSaveScheduler,
} from '../saveScheduler';

// A scheduler on a fake clock whose uploads are counted. `outcomes` lets a test script what the "server" answers, one answer per upload (then 'ok').
function setup(outcomes: UploadOutcome[] = [], uploadMs = 0) {
  const uploads: { at: number; keepalive: boolean }[] = [];
  const scheduler = new SaveScheduler({
    upload: async ({ keepalive }) => {
      uploads.push({ at: Date.now(), keepalive });
      if (uploadMs > 0) await new Promise((r) => setTimeout(r, uploadMs));
      return outcomes.shift() ?? 'ok';
    },
  });
  return { scheduler, uploads };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
});
afterEach(() => {
  setActiveSaveScheduler(null);
  vi.useRealTimers();
});

describe('batched cloud save: when the upload happens', () => {
  it('the first change after a quiet spell goes out after the short debounce, and a burst is one upload', async () => {
    const { scheduler, uploads } = setup();
    for (let i = 0; i < 20; i++) scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS - 1);
    expect(uploads).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(uploads).toHaveLength(1);
    expect(scheduler.pending).toBe(false);
  });

  it('changes made every two seconds are coalesced into one upload per interval', async () => {
    const { scheduler, uploads } = setup();
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS); // upload #1
    for (let t = 0; t < CLOUD_SAVE_MIN_INTERVAL_MS - 2_000; t += 2_000) {
      scheduler.markDirty();
      await vi.advanceTimersByTimeAsync(2_000);
    }
    expect(uploads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(uploads).toHaveLength(2);
    expect(uploads[1].at - uploads[0].at).toBeGreaterThanOrEqual(CLOUD_SAVE_MIN_INTERVAL_MS);
  });

  it('nothing is uploaded while nothing changed', async () => {
    const { scheduler, uploads } = setup();
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(uploads).toHaveLength(1);
  });

  it('an important change does not wait for the batch, but never twice inside the short gap', async () => {
    const { scheduler, uploads } = setup();
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS); // #1 at t=800
    await vi.advanceTimersByTimeAsync(10_000);
    scheduler.markDirty(true); // last upload was long ago: at once
    await vi.advanceTimersByTimeAsync(0);
    expect(uploads).toHaveLength(2);
    scheduler.markDirty(true); // right after: held back to the gap
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_IMPORTANT_GAP_MS - 1);
    expect(uploads).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(uploads).toHaveLength(3);
  });

  it('an important change pulls a later batch forward, an ordinary one never pushes an earlier wake-up back', async () => {
    const { scheduler, uploads } = setup();
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS); // #1
    scheduler.markDirty(); // the batch is 45 s away
    await vi.advanceTimersByTimeAsync(20_000);
    scheduler.markDirty(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(uploads).toHaveLength(2);
    expect(uploads[1].at - uploads[0].at).toBeLessThan(CLOUD_SAVE_MIN_INTERVAL_MS);
  });
});

describe('batched cloud save: flush', () => {
  it('flush uploads at once, waits for the answer and says the server holds the latest save', async () => {
    const { scheduler, uploads } = setup([], 300);
    scheduler.markDirty();
    scheduler.markDirty();
    const done = scheduler.flush();
    await vi.advanceTimersByTimeAsync(300);
    expect(await done).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(scheduler.pending).toBe(false);
  });

  it('a flush with nothing pending does not touch the network', async () => {
    const { scheduler, uploads } = setup();
    expect(await scheduler.flush()).toBe(true);
    expect(uploads).toHaveLength(0);
  });

  it('a change made while an upload is out is uploaded by the same flush', async () => {
    const { scheduler, uploads } = setup([], 200);
    scheduler.markDirty();
    const first = scheduler.flush();
    await vi.advanceTimersByTimeAsync(100);
    scheduler.markDirty(); // changed during the request
    const second = scheduler.flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(uploads).toHaveLength(2);
    expect(scheduler.pending).toBe(false);
  });

  it('the page-leaving flush asks for a keepalive request', async () => {
    const { scheduler, uploads } = setup();
    scheduler.markDirty();
    await scheduler.flush({ keepalive: true });
    expect(uploads[0].keepalive).toBe(true);
  });

  it('the module-level flush reaches the registered scheduler, and is a no-op without one (offline build)', async () => {
    expect(await flushCloudSave()).toBe(true);
    const { scheduler, uploads } = setup();
    setActiveSaveScheduler(scheduler);
    scheduler.markDirty();
    expect(await flushCloudSave()).toBe(true);
    expect(uploads).toHaveLength(1);
  });
});

describe('batched cloud save: a failure never drops a change', () => {
  it('keeps the change pending and retries with a growing delay until the server takes it', async () => {
    const { scheduler, uploads } = setup(['failed', 'failed', 'failed']);
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS); // attempt 1 fails
    expect(uploads).toHaveLength(1);
    expect(scheduler.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_BACKOFF_BASE_MS); // attempt 2 fails
    expect(uploads).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_BACKOFF_BASE_MS * 2 - 1);
    expect(uploads).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); // attempt 3 fails
    expect(uploads).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_BACKOFF_BASE_MS * 4); // attempt 4 works
    expect(uploads).toHaveLength(4);
    expect(scheduler.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(uploads).toHaveLength(4);
  });

  it('a throwing upload counts as a failure', async () => {
    let calls = 0;
    const scheduler = new SaveScheduler({
      upload: async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return 'ok';
      },
    });
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS);
    expect(scheduler.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_BACKOFF_BASE_MS);
    expect(calls).toBe(2);
    expect(scheduler.pending).toBe(false);
  });

  it('coming back online forgets the backoff and uploads now', async () => {
    const { scheduler, uploads } = setup(['failed', 'failed', 'failed']);
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS + CLOUD_SAVE_BACKOFF_BASE_MS + CLOUD_SAVE_BACKOFF_BASE_MS * 2);
    expect(uploads).toHaveLength(3);
    scheduler.resumeNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(uploads).toHaveLength(4);
    expect(scheduler.pending).toBe(false);
  });

  it('flush reports false while the server cannot be reached, and the change is still pending', async () => {
    const { scheduler } = setup(['failed']);
    scheduler.markDirty();
    expect(await scheduler.flush()).toBe(false);
    expect(scheduler.pending).toBe(true);
  });

  it('a "not now" answer (the League swap) is asked again after a short wait', async () => {
    const { scheduler, uploads } = setup(['skipped']);
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS);
    expect(uploads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_SKIP_RETRY_MS);
    expect(uploads).toHaveLength(2);
    expect(scheduler.pending).toBe(false);
  });

  it('a conflict (the server\'s copy was adopted) is not retried in a loop', async () => {
    const { scheduler, uploads } = setup(['conflict']);
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS + 5 * 60_000);
    expect(uploads).toHaveLength(1);
    expect(scheduler.pending).toBe(false);
  });
});

describe('batched cloud save: lifecycle', () => {
  it('a disposed scheduler uploads nothing; enable() brings it back (React StrictMode runs cleanup and setup again)', async () => {
    const { scheduler, uploads } = setup();
    scheduler.dispose();
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(uploads).toHaveLength(0);
    scheduler.enable();
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS);
    expect(uploads).toHaveLength(1);
  });

  it('the local build configuration (no interval) still writes within a second', async () => {
    const uploads: number[] = [];
    const scheduler = new SaveScheduler({
      upload: async () => {
        uploads.push(Date.now());
        return 'ok';
      },
      minIntervalMs: 0,
      importantGapMs: 0,
    });
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS);
    scheduler.markDirty();
    await vi.advanceTimersByTimeAsync(CLOUD_SAVE_FIRST_DELAY_MS);
    expect(uploads).toHaveLength(2);
  });
});
