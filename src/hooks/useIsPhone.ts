import { useSyncExternalStore } from 'react';

// A phone-sized window (the layouts that stack and shorten their first screen). Presentation only: it never decides what the game does.
export const PHONE_MAX_WIDTH = 700;
const QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`;

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

const snapshot = (): boolean => (typeof window !== 'undefined' && !!window.matchMedia ? window.matchMedia(QUERY).matches : false);

export default function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
