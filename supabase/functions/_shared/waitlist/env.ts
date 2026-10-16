// The only place the waitlist functions read environment variables, and only by NAME. Values are never logged or returned.
// PORTAL_ORIGIN: the exact origin(s) of the public portal (comma-separated, https). WAITLIST_SECRET: a long random string (HMAC key for hashes and unsubscribe tokens).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
export const WAITLIST_ENV_NAMES = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PORTAL_ORIGIN', 'WAITLIST_SECRET'] as const;

export type WaitlistEnv = Partial<Record<(typeof WAITLIST_ENV_NAMES)[number], string>>;

export function getWaitlistEnv(): WaitlistEnv {
  const out: WaitlistEnv = {};
  for (const name of WAITLIST_ENV_NAMES) {
    const v = Deno.env.get(name);
    if (v) out[name] = v;
  }
  return out;
}
