// What the Mining / Woodcutting screen says about a running session. The engine (engine.ts gatherAccrual) keeps `pendingMs = min(elapsed, cap)` and calls the storage `full`
// once pendingMs reaches the cap: from then on nothing more piles up, the session only waits to be collected. This turns that into the labels the screen needs, so the time
// since the start and the time that actually produced something are never mixed up.
export interface GatherSessionView {
  state: 'running' | 'full';
  // time since the session started
  elapsedMs: number;
  // time that actually produced material (never above the storage cap)
  producedMs: number;
  capMs: number;
  // time the storage has been full, waiting for collection (0 while running)
  idleMs: number;
}

export function gatherSessionView(status: { capMs: number; pendingMs: number; full: boolean }, elapsedMs: number): GatherSessionView {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const full = status.full && status.capMs > 0;
  const produced = Math.max(0, Math.min(status.pendingMs, status.capMs));
  return { state: full ? 'full' : 'running', elapsedMs: elapsed, producedMs: produced, capMs: status.capMs, idleMs: full ? Math.max(0, elapsed - status.capMs) : 0 };
}
