import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAuthorizeUrl, handleDiscordLinkCallback, handleDiscordLinkStart, randomStateValue, STATE_RE } from '../discord/handler.ts';
import type { CallbackDeps, DiscordStore, LinkStatus, StartDeps } from '../discord/handler.ts';
import { createDiscordStore } from '../discord/restStore.ts';
import { EDGE_ENV_NAMES } from '../env.ts';

const ORIGIN = 'https://game.example.test';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const JWT = 'a'.repeat(40) + '.' + 'b'.repeat(40) + '.' + 'c'.repeat(40);
const DISCORD_ID = '123456789012345678';
const TOKEN = 'SECRET-ACCESS-TOKEN-abc123';
const CLIENT_SECRET = 'CLIENT-SECRET-xyz789';
const CALLBACK = 'https://x.supabase.co/functions/v1/discord-link-callback';
const config = { clientId: '999', clientSecret: CLIENT_SECRET, guildId: '555', callbackUrl: CALLBACK };

/** An in-memory store with the semantics of migration 0038 (single-use state with expiry, one verified account per Discord id). */
function fakeStore(now: () => number = () => 0) {
  const states = new Map<string, { user: string; expires: number }>();
  const verified = new Map<string, string>(); // discord id -> user
  const links: { user: string; discord: string; member: boolean }[] = [];
  const calls: unknown[][] = [];
  const store: DiscordStore = {
    async createState(user, state) {
      calls.push(['createState', user, state]);
      if (links.some((l) => l.user === user && l.member)) return 'already_verified';
      states.set(state, { user, expires: now() + 10 * 60_000 });
      return 'ok';
    },
    async consumeState(state) {
      calls.push(['consumeState', state]);
      const row = states.get(state);
      states.delete(state);
      return row && row.expires > now() ? row.user : null;
    },
    async complete(user, discord, member): Promise<LinkStatus> {
      calls.push(['complete', user, discord, member]);
      if (links.some((l) => l.user === user && l.member)) return 'already_verified';
      if (!member) {
        links.push({ user, discord, member: false });
        return 'not_member';
      }
      const owner = verified.get(discord);
      if (owner && owner !== user) return 'already_used';
      verified.set(discord, user);
      links.push({ user, discord, member: true });
      return 'verified';
    },
  };
  return { store, states, calls, links };
}

interface Script {
  token?: Response;
  me?: Response;
  member?: Response;
}
function discordFetch(script: Script = {}) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init: init ?? {} });
    if (url.endsWith('/oauth2/token')) return script.token ?? new Response(JSON.stringify({ access_token: TOKEN, token_type: 'Bearer', expires_in: 604800, refresh_token: 'REFRESH-TOKEN-1', scope: 'identify guilds.members.read' }), { status: 200 });
    if (url.endsWith('/oauth2/token/revoke')) return new Response('{}', { status: 200 });
    if (url.endsWith('/users/@me')) return script.me ?? new Response(JSON.stringify({ id: DISCORD_ID, username: 'x' }), { status: 200 });
    if (url.includes('/guilds/')) return script.member ?? new Response(JSON.stringify({ roles: [], joined_at: '2026-01-01T00:00:00Z' }), { status: 200 });
    return new Response('nope', { status: 500 });
  }) as unknown as typeof fetch;
  return { fn, seen };
}

function callbackSetup(script: Script = {}, st = fakeStore()) {
  const f = discordFetch(script);
  const deps: CallbackDeps = { allowedOrigins: [ORIGIN], config, store: st.store, fetchFn: f.fn };
  return { ...st, ...f, deps };
}
const withState = async (st: ReturnType<typeof fakeStore>, user = USER) => {
  const state = randomStateValue();
  await st.store.createState(user, state);
  return state;
};
const cb = (state: string, extra = '') => new Request(`${CALLBACK}?code=CODE123&state=${state}&iss=${encodeURIComponent('https://discord.com')}${extra}`);
const landing = (res: Response) => new URL(res.headers.get('location') ?? 'http://none').searchParams.get('discord');

describe('discord-link-start', () => {
  const authFetch = (id: string | null) => vi.fn(async () => (id ? new Response(JSON.stringify({ id }), { status: 200 }) : new Response('{}', { status: 401 }))) as unknown as typeof fetch;
  const post = (headers: Record<string, string> = {}) =>
    new Request('https://x.supabase.co/functions/v1/discord-link-start', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, authorization: `Bearer ${JWT}`, ...headers }, body: '{}' });
  const startDeps = (st = fakeStore(), authId: string | null = USER): StartDeps => ({
    auth: { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', fetchFn: authFetch(authId) },
    allowedOrigins: [ORIGIN],
    config: { clientId: config.clientId, callbackUrl: CALLBACK },
    store: st.store,
    randomState: randomStateValue,
  });

  it('answers the authorize URL with the two scopes, the callback and a fresh state bound to the caller', async () => {
    const st = fakeStore();
    const res = await handleDiscordLinkStart(post(), startDeps(st));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; url: string };
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('999');
    expect(url.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(body.url).toContain('scope=identify%20guilds.members.read');
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK);
    const state = url.searchParams.get('state')!;
    expect(STATE_RE.test(state)).toBe(true);
    expect(st.states.get(state)?.user).toBe(USER);
    expect(body.url).not.toContain(CLIENT_SECRET);
  });
  it('two starts never share a state', () => {
    expect(randomStateValue()).not.toBe(randomStateValue());
    expect(buildAuthorizeUrl(config, 'x'.repeat(43))).toContain('state=' + 'x'.repeat(43));
  });
  it('needs a signed-in caller, an allowed origin and POST', async () => {
    expect((await handleDiscordLinkStart(post(), startDeps(fakeStore(), null))).status).toBe(401);
    expect((await handleDiscordLinkStart(post({ origin: 'https://evil.test' }), startDeps())).status).toBe(403);
    expect((await handleDiscordLinkStart(new Request('https://x.test/', { method: 'GET' }), startDeps())).status).toBe(405);
  });
  it('is unavailable until the Discord application is configured', async () => {
    const deps = startDeps();
    expect((await handleDiscordLinkStart(post(), { ...deps, config: null })).status).toBe(503);
  });
  it('an already verified account is told so and gets no URL', async () => {
    const st = fakeStore();
    await st.store.complete(USER, DISCORD_ID, true);
    const res = await handleDiscordLinkStart(post(), startDeps(st));
    expect(await res.json()).toEqual({ status: 'already_verified' });
  });
});

describe('discord-link-callback: the state', () => {
  it('a state works once: the second use is refused and Discord is never asked', async () => {
    const s = callbackSetup();
    const state = await withState(s);
    expect(landing(await handleDiscordLinkCallback(cb(state), s.deps))).toBe('ok');
    const asked = s.seen.length;
    expect(landing(await handleDiscordLinkCallback(cb(state), s.deps))).toBe('error');
    expect(s.seen.length).toBe(asked);
  });
  it('an expired state is refused without calling Discord', async () => {
    let now = 0;
    const s = callbackSetup({}, fakeStore(() => now));
    const state = await withState(s);
    now = 10 * 60_000 + 1;
    expect(landing(await handleDiscordLinkCallback(cb(state), s.deps))).toBe('error');
    expect(s.seen).toHaveLength(0);
    expect(s.links).toHaveLength(0);
  });
  it('an unknown or malformed state is refused without calling Discord', async () => {
    const s = callbackSetup();
    expect(landing(await handleDiscordLinkCallback(cb('A'.repeat(43)), s.deps))).toBe('error');
    expect(landing(await handleDiscordLinkCallback(cb('short'), s.deps))).toBe('error');
    expect(landing(await handleDiscordLinkCallback(new Request(`${CALLBACK}?code=x`), s.deps))).toBe('error');
    expect(s.seen).toHaveLength(0);
  });
  it('a denied approval (error=access_denied) burns the state and stores nothing', async () => {
    const s = callbackSetup();
    const state = await withState(s);
    const res = await handleDiscordLinkCallback(new Request(`${CALLBACK}?error=access_denied&state=${state}`), s.deps);
    expect(landing(res)).toBe('error');
    expect(s.seen).toHaveLength(0);
    expect(s.states.has(state)).toBe(false);
  });
  it('a wrong issuer is refused before the code is exchanged', async () => {
    const s = callbackSetup();
    const state = await withState(s);
    expect(landing(await handleDiscordLinkCallback(new Request(`${CALLBACK}?code=c&state=${state}&iss=${encodeURIComponent('https://evil.test')}`), s.deps))).toBe('error');
    expect(s.seen).toHaveLength(0);
  });
});

describe('discord-link-callback: membership', () => {
  it('a member is verified: the server asked Discord the documented way', async () => {
    const s = callbackSetup();
    const state = await withState(s);
    const res = await handleDiscordLinkCallback(cb(state), s.deps);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/?discord=ok`);
    expect(s.links).toEqual([{ user: USER, discord: DISCORD_ID, member: true }]);
    const token = s.seen[0]!;
    expect(token.url).toBe('https://discord.com/api/oauth2/token');
    expect((token.init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(String(token.init.body));
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('CODE123');
    expect(form.get('redirect_uri')).toBe(CALLBACK);
    expect(s.seen[1]!.url).toBe('https://discord.com/api/users/@me');
    expect(s.seen[2]!.url).toBe('https://discord.com/api/users/@me/guilds/555/member');
    expect((s.seen[2]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });
  it('not in the server (404): stored as not a member, nothing verified', async () => {
    const s = callbackSetup({ member: new Response('{"code":10007}', { status: 404 }) });
    const state = await withState(s);
    expect(landing(await handleDiscordLinkCallback(cb(state), s.deps))).toBe('not_member');
    expect(s.links).toEqual([{ user: USER, discord: DISCORD_ID, member: false }]);
  });
  it('a Discord failure that is not a clean 404 is an error, never "not a member"', async () => {
    for (const member of [new Response('{}', { status: 403 }), new Response('{}', { status: 429 }), new Response('{}', { status: 500 }), new Response('[]', { status: 200 })]) {
      const s = callbackSetup({ member });
      const state = await withState(s);
      const where = landing(await handleDiscordLinkCallback(cb(state), s.deps));
      expect(where, String(member.status)).toBe('error');
      expect(s.links).toHaveLength(0);
    }
  });
  it('a failed code exchange or an unreadable user id is an error and stores nothing', async () => {
    for (const script of [{ token: new Response('{}', { status: 400 }) }, { token: new Response('{"access_token":5}', { status: 200 }) }, { me: new Response('{"id":"abc"}', { status: 200 }) }, { me: new Response('{}', { status: 401 }) }]) {
      const s = callbackSetup(script);
      const state = await withState(s);
      expect(landing(await handleDiscordLinkCallback(cb(state), s.deps))).toBe('error');
      expect(s.links).toHaveLength(0);
    }
  });
  it('a network failure is an error', async () => {
    const s = callbackSetup();
    const state = await withState(s);
    const deps: CallbackDeps = { ...s.deps, fetchFn: (async () => { throw new Error('down'); }) as unknown as typeof fetch };
    expect(landing(await handleDiscordLinkCallback(cb(state), deps))).toBe('error');
  });
});

describe('discord-link-callback: one Discord account, one game account', () => {
  it('the Discord id of a verified account cannot verify a second one', async () => {
    const st = fakeStore();
    const first = callbackSetup({}, st);
    expect(landing(await handleDiscordLinkCallback(cb(await withState(st, USER)), first.deps))).toBe('ok');
    const second = callbackSetup({}, st);
    const res = await handleDiscordLinkCallback(cb(await withState(st, OTHER)), second.deps);
    expect(landing(res)).toBe('used');
    expect(st.links.filter((l) => l.member).map((l) => l.user)).toEqual([USER]);
  });
  it('an account verified before keeps its link', async () => {
    const st = fakeStore();
    const a = callbackSetup({}, st);
    expect(landing(await handleDiscordLinkCallback(cb(await withState(st)), a.deps))).toBe('ok');
    const b = callbackSetup({ me: new Response(JSON.stringify({ id: '987654321098765432' }), { status: 200 }) }, st);
    const state = randomStateValue();
    st.states.set(state, { user: USER, expires: 1e9 });
    expect(landing(await handleDiscordLinkCallback(cb(state), b.deps))).toBe('ok');
    expect(st.links.filter((l) => l.member)).toHaveLength(1);
  });
});

describe('the token is never kept', () => {
  it('the store never sees a token, the redirect never carries one, the token is revoked and nothing is logged', async () => {
    const logged: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(' '))));
    try {
      const s = callbackSetup();
      const state = await withState(s);
      const res = await handleDiscordLinkCallback(cb(state), s.deps);
      const everything = JSON.stringify(s.calls) + (res.headers.get('location') ?? '') + JSON.stringify([...res.headers.entries()]) + logged.join('\n');
      expect(everything).not.toContain(TOKEN);
      expect(everything).not.toContain('REFRESH-TOKEN-1');
      expect(everything).not.toContain(CLIENT_SECRET);
      const completeCall = s.calls.find((c) => c[0] === 'complete')!;
      expect(completeCall).toEqual(['complete', USER, DISCORD_ID, true]);
      const revoke = s.seen.find((x) => x.url.endsWith('/oauth2/token/revoke'))!;
      expect(new URLSearchParams(String(revoke.init.body)).get('token')).toBe(TOKEN);
    } finally {
      for (const sp of spies) sp.mockRestore();
    }
  });
  it('the real store sends only the verdict to the database', async () => {
    const bodies: string[] = [];
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ status: 'verified' }), { status: 200 });
    }) as unknown as typeof fetch;
    const store = createDiscordStore({ supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'service', fetchFn });
    expect(await store.complete(USER, DISCORD_ID, true)).toBe('verified');
    expect(JSON.parse(bodies[0]!)).toEqual({ p_user: USER, p_discord_user_id: DISCORD_ID, p_is_member: true });
  });
});

describe('configuration', () => {
  it('without the Discord secrets the callback goes back to the game with an error', async () => {
    const s = callbackSetup();
    expect(landing(await handleDiscordLinkCallback(cb('A'.repeat(43)), { ...s.deps, config: null }))).toBe('error');
  });
  it('the secrets are read by name from the edge env list', () => {
    for (const n of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'APP_ORIGIN']) expect(EDGE_ENV_NAMES as readonly string[]).toContain(n);
    const root = resolve(__dirname, '../../..');
    const cbSrc = readFileSync(resolve(root, 'functions/discord-link-callback/index.ts'), 'utf8');
    const startSrc = readFileSync(resolve(root, 'functions/discord-link-start/index.ts'), 'utf8');
    expect(cbSrc).toContain('env.DISCORD_CLIENT_SECRET');
    expect(startSrc.replace(/\/\/.*$/gm, '')).not.toContain('CLIENT_SECRET');
  });
});
