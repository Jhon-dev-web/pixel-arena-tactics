import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';
import { ANA, BRUNO, CARLA, ELOA, seed } from './seed';

// Migration 0027 part A: delete an account. Run for real in an in-memory Postgres; every client-side call is made under `set role anon` / `authenticated` / `service_role`.
let db: PGlite;

const OWNER = '00000000-0000-4000-8000-0000000002a1';
const OTHER_ADMIN = '00000000-0000-4000-8000-0000000002a2';
const PLAYER = '00000000-0000-4000-8000-0000000002b1';
const NAMELESS = '00000000-0000-4000-8000-0000000002b2';

const addUser = async (id: string, email: string, username: string | null, hero: string | null) => {
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, email]);
  await db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [id]);
  if (username) await db.query(`update public.profiles set username = $2, username_set_at = now() where user_id = $1`, [id, username]);
  if (hero) await db.query(`insert into public.characters (user_id, hero_name, save_data) values ($1, $2, '{"gold":5}'::jsonb)`, [id, hero]);
};
const prepare = (uid: string | null, role: 'authenticated' | 'anon', user: string, confirm: string): Promise<any> =>
  as(db, role, uid, async () => (await db.query<any>('select public.admin_delete_user_prepare($1, $2) as r', [user, confirm])).rows[0].r);
const audit = async (action?: string): Promise<any[]> => (await db.query<any>(`select * from arena_private.admin_audit ${action ? 'where action = $1' : ''} order by id`, action ? [action] : [])).rows;
const exists = async (id: string) => (await db.query<any>('select 1 from auth.users where id = $1', [id])).rows.length === 1;

beforeAll(async () => {
  db = await createDb();
  await seed(db);
  await addUser(OWNER, 'owner2@example.com', 'OwnerTwo', null);
  await addUser(OTHER_ADMIN, 'admin2@example.com', 'AdminTwo', null);
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner'), ($2, 'second')`, [OWNER, OTHER_ADMIN]);
  await addUser(PLAYER, 'sofia@example.com', 'Sofia', 'Sofia the Brave');
  await addUser(NAMELESS, 'nameless@example.com', null, null);
  await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'stripe', 'pi_sofia', 'active', true)`, [PLAYER]);
}, 180_000);

describe('who may call it', () => {
  test('a signed-in player who is not an admin gets ADMIN_ONLY and nothing is written', async () => {
    await expect(prepare(BRUNO, 'authenticated', PLAYER, 'Sofia')).rejects.toThrow(/ADMIN_ONLY/);
    expect(await audit()).toHaveLength(0);
  });
  test('anon has no permission at all; admin_audit_record is not callable by authenticated either', async () => {
    await expect(prepare(null, 'anon', PLAYER, 'Sofia')).rejects.toThrow(/permission denied/i);
    await expect(as(db, 'authenticated', OWNER, () => db.query(`select public.admin_audit_record($1, 'delete_user_done', $2, '{}'::jsonb)`, [OWNER, PLAYER]))).rejects.toThrow(/permission denied/i);
  });
  test('the audit table itself is closed to the API roles', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(as(db, role, OWNER, () => db.query('select * from arena_private.admin_audit'))).rejects.toThrow(/permission denied/i);
    }
  });
});

describe('what it refuses', () => {
  test('deleting yourself', async () => {
    await expect(prepare(OWNER, 'authenticated', OWNER, 'OwnerTwo')).rejects.toThrow(/ADMIN_DELETE_SELF/);
  });
  test('deleting another admin', async () => {
    await expect(prepare(OWNER, 'authenticated', OTHER_ADMIN, 'AdminTwo')).rejects.toThrow(/ADMIN_DELETE_ADMIN/);
  });
  test('an account that does not exist, and a null id', async () => {
    await expect(prepare(OWNER, 'authenticated', '00000000-0000-4000-8000-00000000dead', 'x')).rejects.toThrow(/USER_NOT_FOUND/);
    await expect(prepare(OWNER, 'authenticated', null as unknown as string, 'x')).rejects.toThrow(/USER_NOT_FOUND/);
  });
  test('a typed name that is not the username or the hero name (empty, partial, someone else, the e-mail of a named account)', async () => {
    for (const typed of ['', '   ', 'Sofi', 'Bruno', 'sofia@example.com', 'Sofia the']) {
      await expect(prepare(OWNER, 'authenticated', PLAYER, typed)).rejects.toThrow(/CONFIRM_MISMATCH/);
    }
    expect(await exists(PLAYER)).toBe(true);
    expect(await audit()).toHaveLength(0);
  });
  test('an account with no name needs its e-mail (and the audit line is created only on the right one)', async () => {
    await expect(prepare(OWNER, 'authenticated', NAMELESS, 'nameless')).rejects.toThrow(/CONFIRM_MISMATCH/);
    expect((await prepare(OWNER, 'authenticated', NAMELESS, ' Nameless@Example.com ')).status).toBe('ok');
    expect(await exists(NAMELESS)).toBe(true);
  });
});

describe('the dry run finds a foreign key that would block the real deletion', () => {
  test('Carla sold a piece whose copy lives on with a buyer: blocked, audited, nothing deleted', async () => {
    const r = await prepare(OWNER, 'authenticated', CARLA, 'Carla');
    expect(r).toMatchObject({ status: 'blocked', table: 'item_certificates', constraint: 'item_certificates_origin_certificate_id_fkey' });
    expect(await exists(CARLA)).toBe(true);
    const rows = await audit('delete_user_blocked');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ admin_id: OWNER, target_user: CARLA });
  });
  test('accounts with game data but no market history pass the dry run (and the dry run deleted nothing)', async () => {
    for (const [id, name] of [[ANA, 'AnaSilva'], [ELOA, 'Eloa'], [BRUNO, 'Bruno']] as const) {
      expect((await prepare(OWNER, 'authenticated', id, name)).status).toBe('ok');
      expect(await exists(id)).toBe(true);
    }
  });
});

describe('the happy path', () => {
  test('hero name, any case: the audit row is written BEFORE the deletion and survives it; the cascades remove the game data', async () => {
    const before = (await audit('delete_user')).length;
    const r = await prepare(OWNER, 'authenticated', PLAYER, '  SOFIA THE BRAVE ');
    expect(r).toMatchObject({ status: 'ok', user_id: PLAYER, username: 'Sofia', hero_name: 'Sofia the Brave' });
    expect(await exists(PLAYER)).toBe(true); // prepare never deletes
    const rows = await audit('delete_user');
    expect(rows).toHaveLength(before + 1);
    const row = rows[rows.length - 1];
    expect(row).toMatchObject({ admin_id: OWNER, target_user: PLAYER });
    expect(Number(row.id)).toBe(Number(r.audit_id));
    expect(row.details).toMatchObject({ username: 'Sofia', hero_name: 'Sofia the Brave', email_masked: 'so***@example.com' });
    expect(JSON.stringify(row.details)).not.toContain('sofia@example.com');

    // what the Edge Function does next, with the service role
    await db.query(`delete from auth.users where id = $1`, [PLAYER]);
    expect(await exists(PLAYER)).toBe(false);
    for (const t of ['public.characters', 'public.profiles', 'public.entitlements']) {
      expect((await db.query<any>(`select count(*)::int as n from ${t} where user_id = $1`, [PLAYER])).rows[0].n).toBe(0);
    }
    expect((await audit('delete_user')).some((a) => a.target_user === PLAYER)).toBe(true);
  });
  test('the service role records the outcome; only the two outcome actions and only a real admin id are accepted', async () => {
    const rec = (admin: string, action: string) => as(db, 'service_role', null, async () => (await db.query<any>(`select public.admin_audit_record($1, $2, $3, '{"note":"x"}'::jsonb) as r`, [admin, action, PLAYER])).rows[0].r);
    expect(Number(await rec(OWNER, 'delete_user_done'))).toBeGreaterThan(0);
    expect(Number(await rec(OWNER, 'delete_user_failed'))).toBeGreaterThan(0);
    await expect(rec(OWNER, 'grant_pass')).rejects.toThrow(/AUDIT_BAD_ACTION/);
    await expect(rec(BRUNO, 'delete_user_done')).rejects.toThrow(/AUDIT_BAD_ADMIN/);
  });
});

describe('the log is append-only', () => {
  test('update and delete are refused, even for the table owner', async () => {
    await expect(db.query(`update arena_private.admin_audit set action = 'x_x'`)).rejects.toThrow(/ADMIN_AUDIT_APPEND_ONLY/);
    await expect(db.query(`delete from arena_private.admin_audit`)).rejects.toThrow(/ADMIN_AUDIT_APPEND_ONLY/);
  });
  test('no foreign key to auth.users is left without a delete rule', async () => {
    const r = await db.query<any>(`select conrelid::regclass::text as tbl, conname from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass and confdeltype = 'a' order by 1`);
    expect(r.rows).toEqual([]);
  });
});
