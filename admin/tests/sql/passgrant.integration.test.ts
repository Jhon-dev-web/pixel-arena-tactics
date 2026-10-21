import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0027 part B: the owner grants / revokes the Adventurer Pass from the dashboard. Run for real in an in-memory Postgres.
let db: PGlite;

const U = (n: number) => `00000000-0000-4000-8000-0000000004${String(n).padStart(2, '0')}`;
const OWNER = U(90);
const PLAYER = U(1);
const BUYER = U(2); // bought the Pass with a card
const OTHER = U(3);
const MISSING = U(77);

const addUser = (id: string, name: string) =>
  db
    .query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${name.toLowerCase()}@example.com`])
    .then(() => db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [id]))
    .then(() => db.query(`update public.profiles set username = $2, username_set_at = now() where user_id = $1`, [id, name]));
const call = (uid: string | null, role: 'authenticated' | 'anon', fn: 'admin_grant_pass' | 'admin_revoke_pass', user: string | null, note: string | null): Promise<any> =>
  as(db, role, uid, async () => (await db.query<any>(`select public.${fn}($1, $2) as r`, [user, note])).rows[0].r);
const grant = (user: string, note: string | null = 'cortesia do dono') => call(OWNER, 'authenticated', 'admin_grant_pass', user, note);
const revoke = (user: string, note: string | null = 'devolvido a pedido') => call(OWNER, 'authenticated', 'admin_revoke_pass', user, note);
const rows = async (user: string) => (await db.query<any>(`select * from public.entitlements where user_id = $1 order by granted_at, id`, [user])).rows;
const audit = async (action: string) => (await db.query<any>(`select * from arena_private.admin_audit where action = $1 order by id`, [action])).rows;
const owns = async (user: string) => (await db.query<any>(`select arena_private.owns_adventurer_pass($1) as a, arena_private.owns_ranking_pass($1) as r`, [user])).rows[0];
const paidCount = async () => Number((await db.query<any>('select arena_private.paid_pass_count() as n')).rows[0].n);

beforeAll(async () => {
  db = await createDb();
  for (const [id, n] of [[OWNER, 'Owner'], [PLAYER, 'Paula'], [BUYER, 'Beto'], [OTHER, 'Otto']] as const) await addUser(id, n);
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [OWNER]);
  await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'stripe', 'pi_beto', 'active', true)`, [BUYER]);
}, 180_000);

describe('who may call them', () => {
  test('a signed-in player who is not an admin is refused and nothing is written', async () => {
    await expect(call(OTHER, 'authenticated', 'admin_grant_pass', PLAYER, 'tentando')).rejects.toThrow(/ADMIN_ONLY/);
    await expect(call(OTHER, 'authenticated', 'admin_revoke_pass', BUYER, 'tentando')).rejects.toThrow(/ADMIN_ONLY/);
    expect(await rows(PLAYER)).toHaveLength(0);
    expect((await rows(BUYER))[0].status).toBe('active');
    expect((await db.query<any>('select count(*)::int as n from arena_private.admin_audit')).rows[0].n).toBe(0);
  });
  test('anon has no permission at all', async () => {
    await expect(call(null, 'anon', 'admin_grant_pass', PLAYER, 'x x x')).rejects.toThrow(/permission denied/i);
    await expect(call(null, 'anon', 'admin_revoke_pass', PLAYER, 'x x x')).rejects.toThrow(/permission denied/i);
  });
});

describe('what they refuse', () => {
  test('a missing, blank, too short or too long note', async () => {
    for (const note of [null, '', '   ', 'ab']) {
      await expect(grant(PLAYER, note)).rejects.toThrow(/ADMIN_NOTE_REQUIRED/);
      await expect(revoke(PLAYER, note)).rejects.toThrow(/ADMIN_NOTE_REQUIRED/);
    }
    await expect(grant(PLAYER, 'x'.repeat(301))).rejects.toThrow(/ADMIN_NOTE_TOO_LONG/);
    expect(await rows(PLAYER)).toHaveLength(0);
  });
  test('an account that does not exist', async () => {
    await expect(grant(MISSING)).rejects.toThrow(/USER_NOT_FOUND/);
    await expect(revoke(MISSING)).rejects.toThrow(/USER_NOT_FOUND/);
    await expect(call(OWNER, 'authenticated', 'admin_grant_pass', null, 'cortesia')).rejects.toThrow(/USER_NOT_FOUND/);
  });
});

describe('granting', () => {
  test('creates ONE active grant row stamped with the current season, gives the perks and the ranking, and is audited with the note', async () => {
    const r = await grant(PLAYER, '  cortesia do dono  ');
    expect(r).toMatchObject({ status: 'granted', season: 1 });
    const e = await rows(PLAYER);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ kind: 'adventurer_pass', source: 'grant', status: 'active', livemode: true, valid_through_season: 1 });
    expect(e[0].provider_ref).toMatch(/^admin-grant-[0-9a-f-]{36}$/);
    expect(r.entitlement_id).toBe(e[0].id);
    expect(await owns(PLAYER)).toEqual({ a: true, r: true });
    const a = await audit('grant_pass');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ admin_id: OWNER, target_user: PLAYER });
    expect(a[0].details).toMatchObject({ note: 'cortesia do dono', season: 1, entitlement_id: e[0].id });
  });
  test('it is not a sale: the paid count and the goal do not move', async () => {
    expect(await paidCount()).toBe(1); // only Beto's card Pass
  });
  test('idempotent: asking again changes nothing and writes no second audit row', async () => {
    expect(await grant(PLAYER)).toMatchObject({ status: 'already', season: 1 });
    expect(await rows(PLAYER)).toHaveLength(1);
    expect(await audit('grant_pass')).toHaveLength(1);
  });
  test('an account that already bought the Pass gets no second one', async () => {
    expect(await grant(BUYER)).toMatchObject({ status: 'already' });
    expect((await rows(BUYER)).map((x: any) => x.source)).toEqual(['stripe']);
    expect(await audit('grant_pass')).toHaveLength(1);
  });
});

describe('revoking', () => {
  test('marks the current Pass revoked (history stays), takes the perks and the ranking, and is audited with the sources', async () => {
    expect(await revoke(PLAYER, 'concedido por engano')).toMatchObject({ status: 'revoked', season: 1, sources: ['grant'] });
    const e = await rows(PLAYER);
    expect(e).toHaveLength(1);
    expect(e[0].status).toBe('revoked');
    expect(await owns(PLAYER)).toEqual({ a: false, r: false });
    const a = await audit('revoke_pass');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ admin_id: OWNER, target_user: PLAYER });
    expect(a[0].details).toMatchObject({ note: 'concedido por engano', season: 1, sources: ['grant'] });
  });
  test('idempotent: nothing left to revoke, no new audit row', async () => {
    expect(await revoke(PLAYER)).toMatchObject({ status: 'none' });
    expect(await revoke(OTHER)).toMatchObject({ status: 'none' });
    expect(await audit('revoke_pass')).toHaveLength(1);
  });
  test('after a revoke a new grant works (a revoked row does not block it, and the references never collide)', async () => {
    expect(await grant(PLAYER, 'de volta')).toMatchObject({ status: 'granted' });
    expect((await rows(PLAYER)).map((x: any) => x.status)).toEqual(['revoked', 'active']);
    expect(await owns(PLAYER)).toEqual({ a: true, r: true });
  });
  test('a paid Pass can be revoked too, and the audit row says it was paid (the money is not touched)', async () => {
    expect(await revoke(BUYER, 'estorno feito por fora')).toMatchObject({ status: 'revoked', sources: ['stripe'] });
    expect(await paidCount()).toBe(0);
    expect((await audit('revoke_pass')).at(-1)!.details.sources).toEqual(['stripe']);
  });
});

describe('seasons', () => {
  test('when Season 2 opens, an old Pass covers nothing: a grant makes a NEW row for Season 2 and a revoke touches only that one', async () => {
    await db.query(`update public.seasons set status = 'closed' where number = 0`);
    await db.query(`update public.seasons set status = 'closed' where number = 1`);
    await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 2`);
    expect(await owns(PLAYER)).toEqual({ a: false, r: false }); // the Season-1 grant is history now
    const g = await grant(PLAYER, 'temporada 2');
    expect(g).toMatchObject({ status: 'granted', season: 2 });
    const e = await rows(PLAYER);
    expect(e.map((x: any) => [x.status, x.valid_through_season])).toEqual([['revoked', 1], ['active', 1], ['active', 2]]);
    expect(await owns(PLAYER)).toEqual({ a: true, r: true });
    expect(await grant(PLAYER)).toMatchObject({ status: 'already', season: 2 });

    expect(await revoke(PLAYER, 'fim do teste')).toMatchObject({ status: 'revoked', season: 2, sources: ['grant'] });
    const after = await rows(PLAYER);
    expect(after.map((x: any) => [x.status, x.valid_through_season])).toEqual([['revoked', 1], ['active', 1], ['revoked', 2]]); // the Season-1 row is not touched
    expect(await owns(PLAYER)).toEqual({ a: false, r: false });
  });
  test('the player-facing status agrees', async () => {
    await grant(OTHER, 'cortesia');
    const s = await as(db, 'authenticated', OTHER, async () => (await db.query<any>('select public.my_pass_status() as r')).rows[0].r);
    expect(s).toEqual({ owned: true, valid_through: 2, current_season: 2 });
  });
});
