import { describe, expect, it, vi } from 'vitest';
import { handleWaitlistJoin, handleWaitlistUnsubscribe } from '../waitlist/handler.ts';
import { WAITLIST_LIMITS, cleanSource, clientIp, corsHeaders, hashKeys, hmacHex, normalizeEmail, parseJoinBody, subnetOf, withinLimit } from '../waitlist/logic.ts';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../waitlist/token.ts';
import { createFakeWaitlistStore } from './fakeWaitlistStore.ts';

const ORIGIN = 'https://portal.example.test';
const SECRET = 'a-long-random-test-secret-0123456789';

function setup(over: Partial<Parameters<typeof handleWaitlistJoin>[1]> = {}) {
  const fake = createFakeWaitlistStore();
  const deps = { allowedOrigins: [ORIGIN], secret: SECRET, store: fake.store, ...over };
  return { fake, deps };
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x.supabase.co/functions/v1/waitlist-join', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { email: 'Ana@Example.com', locale: 'pt', source: 'twitter', consent: true, hp: '' };

describe('email validation', () => {
  it('lower-cases and accepts ordinary addresses', () => {
    expect(normalizeEmail('  Ana.Silva+arena@Example.COM ')).toBe('ana.silva+arena@example.com');
    expect(normalizeEmail('a@b.co')).toBe('a@b.co');
  });
  it('rejects what is not an address', () => {
    for (const bad of ['', 'a', 'a@b', 'a@b.', '@b.co', 'a@@b.co', 'a b@c.co', 'a@b.c', 'a..b@c.co', '.a@c.co', 'a.@c.co', 'a@-b.co', 'a@b.co.', 'a@1.2.3.4', 'a@b.c0', '<a>@b.co', '=cmd@b.co', '+a@b.co', '-a@b.co', 'a@b.co\nbcc:x@y.zz', null, 42, {}]) {
      expect(normalizeEmail(bad), String(bad)).toBeNull();
    }
    expect(normalizeEmail('a'.repeat(65) + '@b.co')).toBeNull();
    expect(normalizeEmail('a@' + 'b'.repeat(250) + '.co')).toBeNull();
  });
  it('source is a short harmless token or null', () => {
    expect(cleanSource('Twitter')).toBe('twitter');
    expect(cleanSource('t.co/x_1')).toBe('t.co/x_1');
    for (const bad of ['', ' ', '<script>', 'a b', 'xxxxx"', 42, null]) expect(cleanSource(bad), String(bad)).toBeNull();
    expect(cleanSource('a'.repeat(100))).toBe('a'.repeat(64));
  });
});

describe('body parsing: consent and honeypot', () => {
  it('needs consent: true exactly', () => {
    expect(parseJoinBody({ ...good, consent: false })).toEqual({ kind: 'invalid', reason: 'no_consent' });
    expect(parseJoinBody({ ...good, consent: 'true' })).toEqual({ kind: 'invalid', reason: 'no_consent' });
    const without: Record<string, unknown> = { ...good };
    delete without.consent;
    expect(parseJoinBody(without)).toEqual({ kind: 'invalid', reason: 'no_consent' });
  });
  it('a filled honeypot is a bot, whatever else is in the body', () => {
    expect(parseJoinBody({ ...good, hp: 'x' })).toEqual({ kind: 'honeypot' });
    expect(parseJoinBody({ email: 'nonsense', hp: 'https://spam' })).toEqual({ kind: 'honeypot' });
  });
  it('an empty or missing honeypot is a person; an unknown locale falls back to pt', () => {
    expect(parseJoinBody({ ...good, hp: undefined })).toMatchObject({ kind: 'ok' });
    expect(parseJoinBody({ ...good, locale: 'fr' })).toMatchObject({ kind: 'ok', input: { locale: 'pt', email: 'ana@example.com', source: 'twitter' } });
    expect(parseJoinBody({ ...good, locale: 'en' })).toMatchObject({ input: { locale: 'en' } });
  });
  it('bodies that are not objects are refused', () => {
    for (const bad of [null, 'x', 3, [], undefined]) expect(parseJoinBody(bad)).toEqual({ kind: 'invalid', reason: 'bad_body' });
    expect(parseJoinBody({ ...good, email: 'nope' })).toEqual({ kind: 'invalid', reason: 'bad_email' });
  });
});

describe('the rate-limit decision', () => {
  it('allows up to the limit, counted after the hit', () => {
    expect(withinLimit(1, 5)).toBe(true);
    expect(withinLimit(5, 5)).toBe(true);
    expect(withinLimit(6, 5)).toBe(false);
    expect(withinLimit(0, 5)).toBe(false);
    expect(withinLimit(Number.NaN, 5)).toBe(false);
  });
});

describe('addresses are only ever hashed', () => {
  it('reads the client address and its network', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '203.0.113.7' }))).toBe('198.51.100.9');
    expect(clientIp(new Headers({ 'x-forwarded-for': '<script>' }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
    expect(subnetOf('203.0.113.7')).toBe('203.0.113.0/24');
    expect(subnetOf('2001:db8:1:2:3:4:5:6')).toBe('2001:0db8:0001::/48');
    expect(subnetOf('2001:db8::1')).toBe('2001:0db8:0000::/48');
    expect(subnetOf('999.1.1.1')).toBeNull();
    expect(subnetOf('1:2:3:4:5:6:7:8:9')).toBeNull();
  });
  it('the keys are HMACs: stable, secret-dependent, and contain neither the address nor the IP', async () => {
    const a = await hashKeys(SECRET, 'ana@example.com', '203.0.113.7');
    const b = await hashKeys(SECRET, 'ana@example.com', '203.0.113.7');
    const c = await hashKeys('another-secret-another-secret-123', 'ana@example.com', '203.0.113.7');
    expect(a).toEqual(b);
    expect(a.emailKey).not.toBe(c.emailKey);
    expect(JSON.stringify(a)).not.toMatch(/ana|example|203\.0\.113/);
    expect(a.emailKey).toMatch(/^[0-9a-f]{64}$/);
    expect((await hashKeys(SECRET, 'x@y.zz', null)).ipHash).toBeNull();
    expect(await hmacHex('k', 'm')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CORS', () => {
  it('echoes only a listed origin, never a wildcard', () => {
    expect(corsHeaders(ORIGIN, [ORIGIN])?.['access-control-allow-origin']).toBe(ORIGIN);
    expect(corsHeaders('https://evil.example', [ORIGIN])).toBeNull();
    expect(corsHeaders(null, [ORIGIN])).toBeNull();
    expect(corsHeaders(ORIGIN, [])).toBeNull();
    expect(JSON.stringify(corsHeaders(ORIGIN, [ORIGIN]))).not.toContain('*');
  });
});

describe('waitlist-join', () => {
  it('stores a lower-case address and answers ok', async () => {
    const { fake, deps } = setup();
    const res = await handleWaitlistJoin(post(good), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: fake.rows[0].refCode, key: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]).toMatchObject({ email: 'ana@example.com', locale: 'pt', source: 'twitter' });
    expect(fake.rows[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fake.rows[0])).not.toContain('203.0.113.7');
  });

  it('is idempotent and the answer for an existing address is identical to a new one', async () => {
    const { fake, deps } = setup();
    const first = await handleWaitlistJoin(post(good), deps);
    const again = await handleWaitlistJoin(post({ ...good, email: 'ANA@example.com', locale: 'en' }), deps);
    expect(again.status).toBe(first.status);
    expect([...again.headers.entries()].sort()).toEqual([...first.headers.entries()].sort());
    const a = (await first.json()) as Record<string, string>;
    const b = (await again.json()) as Record<string, string>;
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort()); // same shape
    expect(b.code).toBe(a.code); // the PUBLIC share code (it is in every link they post anyway)
    expect(b.key).toMatch(/^[0-9a-f]{32}$/);
    expect(b.key).not.toBe(a.key); // the private key of the first sign-up is never handed out again
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0].locale).toBe('pt'); // the first sign-up is not overwritten by a stranger
  });

  it('a filled honeypot looks like a success and stores nothing', async () => {
    const { fake, deps } = setup();
    const res = await handleWaitlistJoin(post({ ...good, hp: 'http://spam' }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{10}$/), key: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect(fake.rows).toHaveLength(0);
  });

  it('refuses a missing consent, a bad address, a bad body and an oversized body', async () => {
    const { fake, deps } = setup();
    expect((await handleWaitlistJoin(post({ ...good, consent: false }), deps)).status).toBe(400);
    expect((await handleWaitlistJoin(post({ ...good, email: 'nope' }), deps)).status).toBe(400);
    expect((await handleWaitlistJoin(post('{not json'), deps)).status).toBe(400);
    expect((await handleWaitlistJoin(post({ ...good, pad: 'x'.repeat(5000) }), deps)).status).toBe(400);
    expect(fake.rows).toHaveLength(0);
  });

  it('refuses a browser origin that is not the portal, and answers the preflight only for the portal', async () => {
    const { fake, deps } = setup();
    const evil = await handleWaitlistJoin(post(good, { origin: 'https://evil.example' }), deps);
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    expect(fake.rows).toHaveLength(0);
    const pre = await handleWaitlistJoin(new Request('https://x/', { method: 'OPTIONS', headers: { origin: ORIGIN } }), deps);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect((await handleWaitlistJoin(new Request('https://x/', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), deps)).status).toBe(403);
    expect((await handleWaitlistJoin(new Request('https://x/', { method: 'GET', headers: { origin: ORIGIN } }), deps)).status).toBe(405);
  });

  it('is unavailable (503) until PORTAL_ORIGIN, WAITLIST_SECRET and the database are all configured', async () => {
    for (const over of [{ allowedOrigins: [] }, { secret: '' }, { store: null }]) {
      const { deps } = setup(over);
      expect((await handleWaitlistJoin(post(good), deps)).status).toBe(503);
    }
  });

  it('rate-limits per e-mail and per IP, without telling who is on the list', async () => {
    const { fake, deps } = setup();
    for (let i = 0; i < WAITLIST_LIMITS.perEmail; i++) expect((await handleWaitlistJoin(post(good), deps)).status).toBe(200);
    const limited = await handleWaitlistJoin(post(good), deps);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: 'rate_limited' });
    const ipCase = setup();
    let status = 200;
    for (let i = 0; i < WAITLIST_LIMITS.perIp + 1; i++) status = (await handleWaitlistJoin(post({ ...good, email: `p${i}@example.com` }), ipCase.deps)).status;
    expect(status).toBe(429);
    expect(ipCase.fake.rows).toHaveLength(WAITLIST_LIMITS.perIp);
    expect(fake.rows).toHaveLength(1);
  });

  it('a database failure is a 503 and the log never holds the address, the IP or a secret', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = setup({
      store: {
        join: async () => {
          throw new Error('waitlist_join_500 ana@example.com 203.0.113.7');
        },
        unsubscribe: async () => ({ status: 'ok' as const }),
        referralStats: async () => ({ status: 'rate_limited' as const }),
      },
    });
    const res = await handleWaitlistJoin(post(good), deps);
    expect(res.status).toBe(503);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/ana|example|203\.0|waitlist_join_500/);
    expect(await res.text()).not.toMatch(/ana|example/);
    spy.mockRestore();
  });
});

describe('unsubscribe tokens', () => {
  const id = '3f0c5a52-9a53-4e7e-8d0c-2a6b1f6b9c11';
  it('round-trips and carries only the id', async () => {
    const token = await signUnsubscribeToken(SECRET, id);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(await verifyUnsubscribeToken(SECRET, token)).toBe(id);
    expect(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).toBe(`u1:${id}`);
  });
  it('rejects a wrong secret, a changed id, a changed signature and junk', async () => {
    const token = await signUnsubscribeToken(SECRET, id);
    expect(await verifyUnsubscribeToken('another-secret-another-secret-123', token)).toBeNull();
    const other = await signUnsubscribeToken(SECRET, '11111111-1111-4111-8111-111111111111');
    expect(await verifyUnsubscribeToken(SECRET, other.split('.')[0] + '.' + token.split('.')[1])).toBeNull();
    expect(await verifyUnsubscribeToken(SECRET, token.slice(0, -2) + 'AA')).toBeNull();
    for (const bad of ['', 'x', 'a.b.c', '.', 'a.', null, 5, 'x'.repeat(300)]) expect(await verifyUnsubscribeToken(SECRET, bad)).toBeNull();
    expect(await verifyUnsubscribeToken('', token)).toBeNull();
    await expect(signUnsubscribeToken(SECRET, 'not-a-uuid')).rejects.toThrow();
  });
});

describe('waitlist-unsubscribe', () => {
  const unsub = (body: unknown) =>
    new Request('https://x/functions/v1/waitlist-unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) });
  it('unsubscribes with a valid token, idempotently, and refuses a forged one', async () => {
    const { fake, deps } = setup();
    await handleWaitlistJoin(post(good), deps);
    const token = await signUnsubscribeToken(SECRET, fake.rows[0].id);
    expect((await handleWaitlistUnsubscribe(unsub({ token }), deps)).status).toBe(200);
    expect((await handleWaitlistUnsubscribe(unsub({ token }), deps)).status).toBe(200);
    expect(fake.rows[0].unsubscribedAt).not.toBeNull();
    const forged = await handleWaitlistUnsubscribe(unsub({ token: token.slice(0, -3) + 'AAA' }), deps);
    expect(forged.status).toBe(400);
    expect((await handleWaitlistUnsubscribe(unsub({}), deps)).status).toBe(400);
  });
  it('another sign-up from the same address does not undo an unsubscribe', async () => {
    const { fake, deps } = setup();
    await handleWaitlistJoin(post(good), deps);
    await handleWaitlistUnsubscribe(unsub({ token: await signUnsubscribeToken(SECRET, fake.rows[0].id) }), deps);
    await handleWaitlistJoin(post(good), deps);
    expect(fake.rows[0].unsubscribedAt).not.toBeNull();
  });
});
