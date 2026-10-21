import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAdminDeleteUser, parseDeleteBody } from '../admin/deleteUser.ts';
import type { AdminDeleteStore, PrepareResult } from '../admin/deleteUser.ts';
import { createAdminDeleteStore } from '../admin/restStore.ts';
import { EDGE_ENV_NAMES } from '../env.ts';

const ORIGIN = 'https://admin.example.test';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const JWT = 'a'.repeat(40) + '.' + 'b'.repeat(40) + '.' + 'c'.repeat(40);

const authFetch = (id: string | null) =>
  vi.fn(async () => (id ? new Response(JSON.stringify({ id }), { status: 200 }) : new Response('{}', { status: 401 }))) as unknown as typeof fetch;

function setup(prepared: PrepareResult | Error = { kind: 'ok', username: 'Sofia', heroName: 'Sofia the Brave', auditId: 7 }, opts: { deleteFails?: boolean; authId?: string | null } = {}) {
  const calls: string[] = [];
  const store: AdminDeleteStore = {
    prepare: vi.fn(async (_jwt, userId, confirm) => {
      calls.push(`prepare:${userId}:${confirm}`);
      if (prepared instanceof Error) throw prepared;
      return prepared;
    }),
    deleteAuthUser: vi.fn(async (userId) => {
      calls.push(`delete:${userId}`);
      if (opts.deleteFails) throw new Error('auth_delete_500');
    }),
    record: vi.fn(async (_admin, action) => {
      calls.push(`record:${action}`);
    }),
  };
  const deps = { auth: { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', fetchFn: authFetch(opts.authId === undefined ? ADMIN : opts.authId) }, allowedOrigins: [ORIGIN], store };
  return { calls, store, deps };
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x.supabase.co/functions/v1/admin-delete-user', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, authorization: `Bearer ${JWT}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { user_id: TARGET, confirm_username: 'Sofia' };

describe('request shape', () => {
  it('needs a uuid and a short typed name', () => {
    expect(parseDeleteBody(good)).toEqual({ userId: TARGET, confirm: 'Sofia' });
    expect(parseDeleteBody({ user_id: TARGET.toUpperCase(), confirm_username: '  Sofia  ' })).toEqual({ userId: TARGET, confirm: 'Sofia' });
    for (const bad of [{}, { user_id: 'nope', confirm_username: 'x' }, { user_id: TARGET }, { user_id: TARGET, confirm_username: '' }, { user_id: TARGET, confirm_username: '   ' }, { user_id: TARGET, confirm_username: 'x'.repeat(201) }, { user_id: TARGET, confirm_username: 5 }, { user_id: 5, confirm_username: 'x' }]) {
      expect(parseDeleteBody(bad as Record<string, unknown>), JSON.stringify(bad)).toBeNull();
    }
  });
  it('a bad body is a 400 and touches nothing', async () => {
    const { deps, calls } = setup();
    const res = await handleAdminDeleteUser(post({ user_id: 'x' }), deps);
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('who gets in', () => {
  it('no token: 401. Wrong method: 405. Foreign origin: 403. No ADMIN_ORIGIN configured: 503', async () => {
    const noToken = setup();
    expect((await handleAdminDeleteUser(post(good, { authorization: '' }), noToken.deps)).status).toBe(401);
    expect((await handleAdminDeleteUser(post(good), setup(undefined, { authId: null }).deps)).status).toBe(401);
    expect((await handleAdminDeleteUser(new Request('https://x.supabase.co/f', { method: 'GET' }), setup().deps)).status).toBe(405);
    expect((await handleAdminDeleteUser(post(good, { origin: 'https://evil.example' }), setup().deps)).status).toBe(403);
    const closed = setup();
    expect((await handleAdminDeleteUser(post(good), { ...closed.deps, allowedOrigins: [] })).status).toBe(503);
    expect((await handleAdminDeleteUser(post(good), { ...closed.deps, store: null })).status).toBe(503);
    expect(closed.calls).toEqual([]);
    expect(noToken.calls).toEqual([]);
  });
  it('answers the preflight for the dashboard origin only', async () => {
    const { deps } = setup();
    const res = await handleAdminDeleteUser(new Request('https://x.supabase.co/f', { method: 'OPTIONS', headers: { origin: ORIGIN } }), deps);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const other = await handleAdminDeleteUser(new Request('https://x.supabase.co/f', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), deps);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('a signed-in player who is not an admin is refused by the database (403) and the service key is never used', async () => {
    const { deps, calls } = setup({ kind: 'refused', code: 'ADMIN_ONLY' });
    const res = await handleAdminDeleteUser(post(good), deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'refused', reason: 'ADMIN_ONLY' });
    expect(calls).toEqual([`prepare:${TARGET}:Sofia`]);
  });
});

describe('what the database can refuse', () => {
  it.each([
    ['ADMIN_DELETE_SELF', 409],
    ['ADMIN_DELETE_ADMIN', 409],
    ['USER_NOT_FOUND', 404],
    ['CONFIRM_MISMATCH', 400],
  ] as const)('%s -> %i, nothing deleted, nothing recorded as done', async (code, status) => {
    const { deps, calls } = setup({ kind: 'refused', code });
    const res = await handleAdminDeleteUser(post(good), deps);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: 'refused', reason: code });
    expect(calls.some((c) => c.startsWith('delete:') || c.startsWith('record:'))).toBe(false);
  });
  it('a foreign key that would block the deletion: 409 with the constraint, nothing deleted', async () => {
    const { deps, calls } = setup({ kind: 'blocked', constraint: 'item_certificates_origin_certificate_id_fkey', table: 'item_certificates' });
    const res = await handleAdminDeleteUser(post(good), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'blocked', constraint: 'item_certificates_origin_certificate_id_fkey', table: 'item_certificates' });
    expect(calls).toEqual([`prepare:${TARGET}:Sofia`]);
  });
  it('the database being unreachable is a 502 and nothing is deleted', async () => {
    const { deps, calls } = setup(new Error('prepare_500'));
    expect((await handleAdminDeleteUser(post(good), deps)).status).toBe(502);
    expect(calls).toEqual([`prepare:${TARGET}:Sofia`]);
  });
});

describe('the happy path and its failure', () => {
  it('prepare (which wrote the audit row) comes first, then the deletion, then the outcome is recorded', async () => {
    const { deps, calls } = setup();
    const res = await handleAdminDeleteUser(post(good), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, user_id: TARGET, username: 'Sofia' });
    expect(calls).toEqual([`prepare:${TARGET}:Sofia`, `delete:${TARGET}`, 'record:delete_user_done']);
  });
  it('the id deleted is the one the database approved (lower-cased), never something else in the body', async () => {
    const { deps, calls } = setup();
    await handleAdminDeleteUser(post({ ...good, user_id: TARGET.toUpperCase(), extra: ADMIN }), deps);
    expect(calls[1]).toBe(`delete:${TARGET}`);
  });
  it('when the Auth server refuses, a failure line is recorded and the caller gets a 502', async () => {
    const { deps, calls } = setup(undefined, { deleteFails: true });
    const res = await handleAdminDeleteUser(post(good), deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'delete_failed' });
    expect(calls).toEqual([`prepare:${TARGET}:Sofia`, `delete:${TARGET}`, 'record:delete_user_failed']);
  });
  it('a failing audit write after a successful deletion does not turn the answer into an error', async () => {
    const { deps, store } = setup();
    (store.record as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('audit_500'));
    expect((await handleAdminDeleteUser(post(good), deps)).status).toBe(200);
  });
});

describe('the real store (rest calls)', () => {
  const cfg = { supabaseUrl: 'https://x.supabase.co/', anonKey: 'ANON', serviceRoleKey: 'SERVICE' };
  const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

  it('prepare sends the caller JWT with the ANON key, never the service key', async () => {
    const f = respond(200, { status: 'ok', username: 'Sofia', hero_name: 'H', audit_id: 9 });
    const out = await createAdminDeleteStore({ ...cfg, fetchFn: f }).prepare(JWT, TARGET, 'Sofia');
    expect(out).toEqual({ kind: 'ok', username: 'Sofia', heroName: 'H', auditId: 9 });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/admin_delete_user_prepare');
    expect(init.headers).toMatchObject({ apikey: 'ANON', authorization: `Bearer ${JWT}` });
    expect(JSON.stringify(init)).not.toContain('SERVICE');
    expect(JSON.parse(String(init.body))).toEqual({ p_user: TARGET, p_confirm: 'Sofia' });
  });
  it('maps the database errors by their message, permission denied as not-an-admin, anything else as a throw', async () => {
    for (const code of ['ADMIN_ONLY', 'ADMIN_DELETE_SELF', 'ADMIN_DELETE_ADMIN', 'USER_NOT_FOUND', 'CONFIRM_MISMATCH']) {
      const out = await createAdminDeleteStore({ ...cfg, fetchFn: respond(400, { code: 'P0001', message: code }) }).prepare(JWT, TARGET, 'x');
      expect(out).toEqual({ kind: 'refused', code });
    }
    expect(await createAdminDeleteStore({ ...cfg, fetchFn: respond(403, { code: '42501', message: 'permission denied for function' }) }).prepare(JWT, TARGET, 'x')).toEqual({ kind: 'refused', code: 'ADMIN_ONLY' });
    await expect(createAdminDeleteStore({ ...cfg, fetchFn: respond(500, { message: 'boom' }) }).prepare(JWT, TARGET, 'x')).rejects.toThrow('prepare_500');
    await expect(createAdminDeleteStore({ ...cfg, fetchFn: respond(200, { status: 'weird' }) }).prepare(JWT, TARGET, 'x')).rejects.toThrow('prepare_bad_answer');
  });
  it('a blocked answer carries the constraint and the table', async () => {
    const out = await createAdminDeleteStore({ ...cfg, fetchFn: respond(200, { status: 'blocked', constraint: 'c', table: 't' }) }).prepare(JWT, TARGET, 'x');
    expect(out).toEqual({ kind: 'blocked', constraint: 'c', table: 't' });
  });
  it('deleteAuthUser uses the service key on the Auth admin API, with a hard delete; record uses the service key on the audit rpc', async () => {
    const f = respond(200, {});
    const store = createAdminDeleteStore({ ...cfg, fetchFn: f });
    await store.deleteAuthUser(TARGET);
    await store.record(ADMIN, 'delete_user_done', TARGET, { audit_id: 1 });
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect(calls[0][0]).toBe(`https://x.supabase.co/auth/v1/admin/users/${TARGET}`);
    expect(calls[0][1].method).toBe('DELETE');
    expect(calls[0][1].headers).toMatchObject({ authorization: 'Bearer SERVICE' });
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ should_soft_delete: false });
    expect(calls[1][0]).toBe('https://x.supabase.co/rest/v1/rpc/admin_audit_record');
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ p_admin: ADMIN, p_action: 'delete_user_done', p_target: TARGET, p_details: { audit_id: 1 } });
    await expect(createAdminDeleteStore({ ...cfg, fetchFn: respond(500, {}) }).deleteAuthUser(TARGET)).rejects.toThrow('auth_delete_500');
  });
});

describe('the entry point', () => {
  const src = readFileSync(resolve(process.cwd(), 'supabase/functions/admin-delete-user/index.ts'), 'utf8');
  it('leaves JWT verification ON, reads secrets only through getEdgeEnv and has no key in the file', () => {
    expect(src).toContain('Deploy with JWT verification ON');
    expect(src).toContain('handleAdminDeleteUser(req');
    expect(src).not.toMatch(/Deno\.env/);
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
  it('ADMIN_ORIGIN is a known secret name, apart from APP_ORIGIN', () => {
    expect(EDGE_ENV_NAMES).toContain('ADMIN_ORIGIN');
    expect(src).toContain('env.ADMIN_ORIGIN');
    expect(src).not.toContain('env.APP_ORIGIN');
  });
});
