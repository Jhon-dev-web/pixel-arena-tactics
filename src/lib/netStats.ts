// How many requests the game makes to the server, by kind. DEV only: in a production build nothing is recorded and `window.__netStats` does not exist (npm run check:bundle checks it).
// In a DEV tab, `__netStats.perMinute()` shows the calls of the last minute by kind, `__netStats.total()` since the page opened, `__netStats.reset()` starts counting again. The kinds:
//   save-upload (the batched cloud save), save-load, save-create, fn:<edge function> (submit-progress, mint-item, material-claim, market-my ...), rpc:<name>, db:<table>, auth:<what>.
// Every request of the Supabase client passes through supabaseFetch.ts, which records it here, so nothing that calls the server can be missed.

const KEEP_MS = 60 * 60 * 1000;
const MAX_LOG = 20_000;

interface Entry {
  at: number;
  type: string;
}

let log: Entry[] = [];
const totals = new Map<string, number>();

/** The kind of a request, from its URL and method. Anything that is not a Supabase request is "other". */
export function classifyRequest(url: string, method = 'GET'): string {
  let path: string;
  try {
    path = new URL(url, 'https://local.invalid').pathname;
  } catch {
    return 'other';
  }
  const m = method.toUpperCase();
  const rest = /\/rest\/v1\/(.+)$/.exec(path);
  if (rest) {
    const target = rest[1];
    if (target.startsWith('rpc/')) return `rpc:${target.slice(4)}`;
    if (target === 'characters') return m === 'PATCH' ? 'save-upload' : m === 'POST' ? 'save-create' : 'save-load';
    return `db:${target}`;
  }
  const fn = /\/functions\/v1\/([^/?]+)/.exec(path);
  if (fn) return `fn:${fn[1]}`;
  const auth = /\/auth\/v1\/(.+)$/.exec(path);
  if (auth) return `auth:${auth[1].split('/')[0]}`;
  return 'other';
}

/** Counts one request. A no-op outside DEV. */
export function recordRemoteCall(type: string, at: number = Date.now()): void {
  if (!import.meta.env.DEV) return;
  totals.set(type, (totals.get(type) ?? 0) + 1);
  log.push({ at, type });
  if (log.length > MAX_LOG || (log.length > 0 && at - log[0].at > KEEP_MS)) log = log.filter((e) => at - e.at <= KEEP_MS).slice(-MAX_LOG);
}

export interface NetStats {
  /** requests since the page opened (or the last reset), by kind */
  total: () => Record<string, number>;
  /** requests in the last `windowMs` (default one minute), by kind */
  perMinute: (windowMs?: number, now?: number) => Record<string, number>;
  /** the same window scaled to one hour, by kind */
  perHour: (windowMs?: number, now?: number) => Record<string, number>;
  reset: () => void;
}

const entries = (m: Map<string, number>): Record<string, number> => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));

export const netStats: NetStats = {
  total: () => entries(totals),
  perMinute: (windowMs = 60_000, now = Date.now()) => {
    const out = new Map<string, number>();
    for (const e of log) if (now - e.at <= windowMs) out.set(e.type, (out.get(e.type) ?? 0) + 1);
    return entries(out);
  },
  perHour: (windowMs = 60 * 60_000, now = Date.now()) => {
    const per = netStats.perMinute(windowMs, now);
    return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, Math.round((v * 60 * 60_000) / windowMs)]));
  },
  reset: () => {
    log = [];
    totals.clear();
  },
};

/** DEV only (main.tsx): puts the counter on `window.__netStats`. */
export function installNetStats(target: object): void {
  (target as { __netStats?: NetStats }).__netStats = netStats;
}
