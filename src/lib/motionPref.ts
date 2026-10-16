// Reduced motion. The game follows the system setting (prefers-reduced-motion) by default; Settings adds a manual switch for someone whose system does not ask for it. When it is on, the root element
// carries data-motion="reduce" (base.css then stops every CSS animation and transition) and the scenes that animate from script read reducedMotion() below.
const KEY = 'arena.reduceMotion.v1';
const listeners = new Set<() => void>();

const storage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const systemReducesMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The player's own switch (false when never set). */
export function manualReduceMotion(): boolean {
  try {
    return storage()?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** True when the game should not animate: the system asks for it, or the player switched it on. */
export const reducedMotion = (): boolean => systemReducesMotion() || manualReduceMotion();

export function applyMotionPref(): void {
  if (typeof document === 'undefined') return;
  if (manualReduceMotion()) document.documentElement.setAttribute('data-motion', 'reduce');
  else document.documentElement.removeAttribute('data-motion');
}

export function setManualReduceMotion(on: boolean): void {
  try {
    if (on) storage()?.setItem(KEY, '1');
    else storage()?.removeItem(KEY);
  } catch {
    /* storage blocked: the switch simply does not stick */
  }
  applyMotionPref();
  listeners.forEach((l) => l());
}

export function subscribeMotion(fn: () => void): () => void {
  listeners.add(fn);
  let mq: MediaQueryList | null = null;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', fn);
  }
  return () => {
    listeners.delete(fn);
    mq?.removeEventListener('change', fn);
  };
}
