import type { AuthConfig } from '../auth.ts';
import { json } from '../http.ts';
import { prelude } from '../market/prelude.ts';

// The community task "Entrar no Discord" (docs/DISCORD_TASK.md, migration 0038). Two functions:
//   discord-link-start     (JWT required)   creates a single-use `state` for the signed-in account and answers the Discord authorize URL.
//   discord-link-callback  (--no-verify-jwt: Discord's redirect is a plain browser GET with no Authorization header) validates the state, exchanges the code, asks Discord whether the user is a member
//                          of the game's server, stores the VERDICT and sends the browser back to the game with ?discord=ok|not_member|used|error.
// The access token lives in one local variable of the callback: it is used for two reads and a revoke, never stored, never logged, never put in the redirect. The store has no method that could take it.
//
// Discord endpoints (checked against the official documentation, 2026-10-22):
//   * Authorization URL      https://discord.com/oauth2/authorize?response_type=code&client_id&scope&state&redirect_uri   scopes are space separated and URL-encoded as %20; Discord redirects back with
//                            `code`, `state` and `iss=https://discord.com` (which is checked before the exchange). https://docs.discord.com/developers/topics/oauth2
//   * Token exchange         POST https://discord.com/api/oauth2/token, content-type application/x-www-form-urlencoded ONLY (JSON is an error), body grant_type=authorization_code, code, redirect_uri (the same
//                            one used in the authorization request), client authentication by HTTP Basic (client id : secret) or client_id/client_secret in the body. Response: access_token, token_type 'Bearer',
//                            expires_in, refresh_token, scope. Same page.
//   * Token revocation       POST https://discord.com/api/oauth2/token/revoke, form body token (+ optional token_type_hint), client authentication as above. Same page.
//   * Scope `identify`       lets us call GET https://discord.com/api/users/@me for the user's `id` (a snowflake string), without the e-mail. https://docs.discord.com/developers/resources/user
//   * Scope `guilds.members.read`  lets us call GET https://discord.com/api/users/@me/guilds/{guild.id}/member, which returns the guild member object of the current user in that guild. Same page.
//     The documentation does not name the answer for a user who is NOT in the guild; Discord answers 404 (unknown member / unknown guild). Here: 200 with an object = member, 404 = not a member,
//     anything else (401, 403, 429, 5xx, a body that is not an object) = we could not tell, so 'error' and nothing is stored. A wrong DISCORD_GUILD_ID is therefore never turned into "not a member".

export const DISCORD_API = 'https://discord.com/api';
export const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_SCOPES = ['identify', 'guilds.members.read'] as const;
export const DISCORD_ISSUER = 'https://discord.com';
export const SNOWFLAKE_RE = /^[0-9]{15,25}$/;
export const STATE_RE = /^[A-Za-z0-9_-]{32,128}$/;

export type LinkStatus = 'verified' | 'not_member' | 'already_used' | 'already_verified';

export interface DiscordStore {
  /** public.discord_state_create. 'already_verified' = nothing to do; 'rate_limited' = too many open round trips. Throws when the database does not answer. */
  createState(userId: string, state: string): Promise<'ok' | 'already_verified' | 'rate_limited'>;
  /** public.discord_state_consume: the account the state was made for, or null (unknown, expired, already used). The state is gone afterwards either way. */
  consumeState(state: string): Promise<string | null>;
  /** public.discord_link_complete: stores the verdict ONLY (the Discord user id and whether he is a member). No token ever goes through here. */
  complete(userId: string, discordUserId: string, isMember: boolean): Promise<LinkStatus>;
}

export interface DiscordConfig {
  clientId: string;
  /** Read by the callback only. */
  clientSecret: string;
  guildId: string;
  /** The function URL of discord-link-callback (also the redirect URI registered in the Discord application). */
  callbackUrl: string;
}

export interface StartDeps {
  auth: AuthConfig;
  /** APP_ORIGIN, parsed. */
  allowedOrigins: string[];
  config: Pick<DiscordConfig, 'clientId' | 'callbackUrl'> | null;
  store: DiscordStore | null;
  /** A fresh state (43 url-safe characters). */
  randomState: () => string;
}

export interface CallbackDeps {
  /** APP_ORIGIN, parsed: the browser is sent back to the FIRST one. */
  allowedOrigins: string[];
  config: DiscordConfig | null;
  store: DiscordStore | null;
  fetchFn?: typeof fetch;
}

export type ReturnCode = 'ok' | 'not_member' | 'used' | 'error';

/** 32 random bytes as 43 url-safe characters (no padding). */
export function randomStateValue(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The Discord authorize URL for one state. Scopes use %20, as the documentation shows. */
export function buildAuthorizeUrl(config: Pick<DiscordConfig, 'clientId' | 'callbackUrl'>, state: string): string {
  const q = [
    ['response_type', 'code'],
    ['client_id', config.clientId],
    ['scope', DISCORD_SCOPES.join(' ')],
    ['state', state],
    ['redirect_uri', config.callbackUrl],
  ];
  return `${DISCORD_AUTHORIZE_URL}?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

export async function handleDiscordLinkStart(req: Request, deps: StartDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if (!pre.ok) return pre.response;
  const { userId, cors } = pre;
  if (!deps.config || !deps.store) return json({ error: 'unavailable' }, 503, cors);
  const state = deps.randomState();
  if (!STATE_RE.test(state)) return json({ error: 'unavailable' }, 503, cors);
  let result: 'ok' | 'already_verified' | 'rate_limited';
  try {
    result = await deps.store.createState(userId, state);
  } catch {
    return json({ error: 'unavailable' }, 502, cors);
  }
  if (result === 'already_verified') return json({ status: 'already_verified' }, 200, cors);
  if (result === 'rate_limited') return json({ error: 'rate_limited' }, 429, cors);
  return json({ status: 'ok', url: buildAuthorizeUrl(deps.config, state) }, 200, cors);
}

function redirectBack(origin: string, code: ReturnCode): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `${origin}/?discord=${code}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });
}

const UA = 'ArenaIdleLink/1.0';
const TIMEOUT_MS = 8000;

async function discordFetch(doFetch: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  return doFetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
}

/** The callback. Never throws; every failure ends in a redirect to the game with ?discord=error (or a plain 503 when there is no game origin to go back to). */
export async function handleDiscordLinkCallback(req: Request, deps: CallbackDeps): Promise<Response> {
  const origin = deps.allowedOrigins[0];
  if (!origin) return json({ error: 'unavailable' }, 503);
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
  if (!deps.config || !deps.store) return redirectBack(origin, 'error');
  const cfg = deps.config;
  const doFetch = deps.fetchFn ?? fetch;
  const url = new URL(req.url);
  const state = url.searchParams.get('state') ?? '';
  if (!STATE_RE.test(state)) return redirectBack(origin, 'error');

  // The state is used up FIRST, whatever happens next (a denied approval, a bad code): a state works once.
  let userId: string | null;
  try {
    userId = await deps.store.consumeState(state);
  } catch {
    return redirectBack(origin, 'error');
  }
  if (!userId) return redirectBack(origin, 'error');

  const code = url.searchParams.get('code') ?? '';
  const iss = url.searchParams.get('iss');
  if (url.searchParams.get('error') || !code || code.length > 512 || (iss !== null && iss !== DISCORD_ISSUER)) return redirectBack(origin, 'error');

  let accessToken: string;
  try {
    const tokenRes = await discordFetch(doFetch, `${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA, accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.callbackUrl, client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString(),
    });
    if (!tokenRes.ok) return redirectBack(origin, 'error');
    const tokenBody = (await tokenRes.json()) as { access_token?: unknown; token_type?: unknown };
    if (typeof tokenBody.access_token !== 'string' || tokenBody.access_token === '' || String(tokenBody.token_type).toLowerCase() !== 'bearer') return redirectBack(origin, 'error');
    accessToken = tokenBody.access_token;
  } catch {
    return redirectBack(origin, 'error');
  }

  const bearer = { authorization: `Bearer ${accessToken}`, 'user-agent': UA, accept: 'application/json' };
  let discordId: string | null = null;
  let isMember: boolean | null = null;
  try {
    const meRes = await discordFetch(doFetch, `${DISCORD_API}/users/@me`, { method: 'GET', headers: bearer });
    if (meRes.ok) {
      const me = (await meRes.json()) as { id?: unknown };
      if (typeof me.id === 'string' && SNOWFLAKE_RE.test(me.id)) discordId = me.id;
    }
    if (discordId) {
      const memRes = await discordFetch(doFetch, `${DISCORD_API}/users/@me/guilds/${encodeURIComponent(cfg.guildId)}/member`, { method: 'GET', headers: bearer });
      if (memRes.status === 404) {
        isMember = false;
      } else if (memRes.ok) {
        const member = await memRes.json();
        if (member && typeof member === 'object' && !Array.isArray(member)) isMember = true; // anything else: we cannot tell, isMember stays null
      }
    }
  } catch {
    discordId = null;
    isMember = null;
  }

  // Discard the token: revoke it at Discord (best effort) the variable is not used again.
  try {
    await discordFetch(doFetch, `${DISCORD_API}/oauth2/token/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
      body: new URLSearchParams({ token: accessToken, token_type_hint: 'access_token', client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString(),
    });
  } catch {
    /* best effort: the token expires by itself */
  }

  if (!discordId || isMember === null) return redirectBack(origin, 'error');
  try {
    const status = await deps.store.complete(userId, discordId, isMember);
    if (status === 'verified' || status === 'already_verified') return redirectBack(origin, 'ok');
    if (status === 'not_member') return redirectBack(origin, 'not_member');
    if (status === 'already_used') return redirectBack(origin, 'used');
  } catch {
    /* fall through */
  }
  return redirectBack(origin, 'error');
}
