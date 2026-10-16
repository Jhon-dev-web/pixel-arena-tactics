// The fetch the Supabase client uses. Today its only job is the keepalive upload: a save sent while the page is closing (pagehide, tab hidden, beforeunload) must outlive the page, which the
// browser only allows for a fetch made with `keepalive: true` and a body under 64 KiB. supabase-js has no such option, so the repository wraps that one call in `withKeepalive` and this fetch adds
// the flag to the requests made inside the wrapper. A body that is too big (a late-game save) simply goes out as a normal request: the flag is only an extra chance, never a requirement.

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

export const supabaseFetch: typeof fetch = (input, init) => fetch(input, keepaliveFor(init));
