import { classifyRequest, recordRemoteCall } from './netStats';

// The fetch the Supabase client uses. It does two things. (1) The keepalive upload: a save sent while the page is closing (pagehide, tab hidden, beforeunload) must outlive the page, which the
// browser only allows for a fetch made with `keepalive: true` and a body under 64 KiB. supabase-js has no such option, so the repository wraps that one call in `withKeepalive` and this fetch adds
// the flag to the requests made inside the wrapper. A body that is too big (a late-game save) simply goes out as a normal request: the flag is only an extra chance, never a requirement. (2) In DEV it counts every request by kind (netStats.ts, window.__netStats).

const KEEPALIVE_BODY_LIMIT = 60 * 1024; // the browser's cap is 64 KiB for all in-flight keepalive bodies together; stay clear of it

let keepaliveDepth = 0;

/** Runs `fn` (which starts a request) with keepalive on for the requests it makes. Resolves with whatever `fn` resolves with. */
export async function withKeepalive<T>(fn: () => PromiseLike<T>): Promise<T> {
  keepaliveDepth++;
  try {
    return await fn();
  } finally {
    keepaliveDepth--;
  }
}

export function keepaliveFor(init: RequestInit | undefined): RequestInit | undefined {
  if (keepaliveDepth <= 0 || !init || typeof init.body !== 'string' || init.body.length > KEEPALIVE_BODY_LIMIT) return init;
  return { ...init, keepalive: true };
}

export const supabaseFetch: typeof fetch = (input, init) => {
  if (import.meta.env.DEV) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    recordRemoteCall(classifyRequest(url, init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')));
  }
  return fetch(input, keepaliveFor(init));
};
