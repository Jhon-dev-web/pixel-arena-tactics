import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessDeniedError, type AdminApi } from './lib/api';
import { errorText } from './lib/auth';

export interface AppContextValue {
  api: AdminApi;
  /** The database said "not an admin": the app goes back to the access-denied screen. */
  onDenied: () => void;
  demo: boolean;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('AppContext missing');
  return v;
}

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Time (ms since epoch) the last successful load finished. */
  loadedAt: number | null;
  reload: () => void;
}

/**
 * Runs `load` on mount and whenever `deps` change, ignoring answers that arrive after a newer request started (so a slow page never overwrites a fast one).
 * The previous data stays on screen while the next one loads (no flicker on paging or on the 60 s refresh).
 */
export function useAsync<T>(load: (api: AdminApi) => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const { api, onDenied } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const ticket = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(() => {
    const mine = ++ticket.current;
    setLoading(true);
    loadRef.current(api).then(
      (value) => {
        if (mine !== ticket.current) return;
        setData(value);
        setError(null);
        setLoading(false);
        setLoadedAt(Date.now());
      },
      (e: unknown) => {
        if (mine !== ticket.current) return;
        if (e instanceof AccessDeniedError) {
          onDenied();
          return;
        }
        setError(errorText(e));
        setLoading(false);
      },
    );
  }, [api, onDenied]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, [run, ...deps]);
  useEffect(
    () => () => {
      ticket.current++;
    },
    [],
  );

  return { data, error, loading, loadedAt, reload: run };
}

/** Re-renders every `ms` and returns Date.now(). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Calls `fn` every `ms` while the tab is visible. */
export function useInterval(fn: () => void, ms: number): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** Debounces a fast-changing value (the search box). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
