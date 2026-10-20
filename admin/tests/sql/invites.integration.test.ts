import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0024: invites live in the game. Run for real in an in-memory Postgres; every client-side call is made under `set role anon` / `set role authenticated`.
let db: PGlite;

const U = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const INVITER = U(1);
const FRIEND = U(2);
const FRIEND2 = U(3);

const addUser = async (id: string, email: string, meta: Record<string, string> | null = null, ageHours = 0) =>
  db.query<any>(`insert into auth.users (id, email, created_at, email_confirmed_at, raw_user_meta_data) values ($1, $2, now() - ($3 || ' hours')::interval, now(), $4::jsonb)`, [id, email, String(ageHours), meta ? JSON.stringify(meta) : null]);
const snapshot = async (user: string, level: number, verdict = 'ok', hoursAgo = 0) =>
  db.query<any>(`insert into public.progress_snapshots (user_id, metrics, metrics_hash, verdict, reasons, created_at) values ($1, $2::jsonb, repeat('a', 64), $3, '{}', now() - ($4 || ' hours')::interval)`, [user, JSON.stringify({ heroLevel: level }), verdict, String(hoursAgo)]);
const pass = async (user: string, ref: string, source = 'stripe') =>
  db.query<any>(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', $3, $2, 'active', true)`, [user, ref, source]);
const rpc = async (uid: string, fn: string, arg?: string): Promise<any> =>
  as(db, 'authenticated', uid, async () => (await db.query<any>(arg === undefined ? `select public.${fn}() as r` : `select public.${fn}($1) as r`, arg === undefined ? [] : [arg])).rows[0].r);
const referral = async (user: string): Promise<any> => (await db.query<any>('select * from arena_private.account_referrals where user_id = $1', [user])).rows[0];

let code = '';

beforeAll(async () => {
  db = await createDb();
  await addUser(INVITER, 'inviter@example.com');
  code = (await rpc(INVITER, 'my_invite')).code;
}, 180_000);

describe('my_invite', () => {
  test('creates the code lazily, once, in the waitlist alphabet; the shape matches my_referral_status', async () => {
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    const again = await rpc(INVITER, 'my_invite');
    expect(again.code).toBe(code);
    expect(again).toMatchObject({ qualified: 0, paying: 0, pass_goal: 10, rewards: [] });
    expect((await db.query<any>('select count(*)::int as n from arena_private.invite_codes')).rows[0].n).toBe(1);
  });

  test('anon cannot call my_invite / claim_invite, nor read the tables', async () => {
    await expect(as(db, 'anon', null, () => db.query<any>('select public.my_invite()'))).rejects.toThrow(/permission denied/);
    await expect(as(db, 'anon', null, () => db.query<any>(`select public.claim_invite('AAAAAAAAAA')`))).rejects.toThrow(/permission denied/);
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(as(db, role, role === 'anon' ? null : INVITER, () => db.query<any>('select * from arena_private.invite_codes'))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, role === 'anon' ? null : INVITER, () => db.query<any>('select * from arena_private.account_referrals'))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('recording a referral', () => {
  test('the sign-up metadata is read by the trigger', async () => {
    await addUser(FRIEND, 'friend@example.com', { invite: code });
    expect(await referral(FRIEND)).toMatchObject({ referrer_id: INVITER, ignored_reason: null, qualified_at: null });
  });

  test('a self-invite (same account, or the same e-mail under another alias) is kept but ignored', async () => {
    const alias = U(10);
    await addUser(alias, 'inviter+x@example.com', { invite: code });
    expect(await referral(alias)).toMatchObject({ referrer_id: INVITER, ignored_reason: 'self_email' });
    const gmail = U(11);
    await addUser(gmail, 'ana.silva@gmail.com');
    const gmailCode = (await rpc(gmail, 'my_invite')).code;
    const other = U(12);
    await addUser(other, 'anasilva+game@googlemail.com', { invite: gmailCode });
    expect((await referral(other)).ignored_reason).toBe('self_email');
    // the same account claiming its own code
    expect((await rpc(INVITER, 'claim_invite', code)).status).toBe('ignored');
    expect((await referral(INVITER)).ignored_reason).toBe('self');
    // none of them counts
    expect((await rpc(INVITER, 'my_invite')).qualified).toBe(0);
  });

  test('a bad or unknown code never fails the sign-up and writes nothing', async () => {
    await addUser(U(20), 'x20@example.com', { invite: 'not a code' });
    await addUser(U(21), 'x21@example.com', { invite: 'AAAAAAAAAA' });
    expect(await referral(U(20))).toBeUndefined();
    expect(await referral(U(21))).toBeUndefined();
  });

  test('the first referral is final', async () => {
    const other = U(30);
    await addUser(other, 'other-inviter@example.com');
    const otherCode = (await rpc(other, 'my_invite')).code;
    expect((await rpc(FRIEND, 'claim_invite', otherCode)).status).toBe('exists');
    expect((await referral(FRIEND)).referrer_id).toBe(INVITER);
  });
});

describe('claim_invite', () => {
  test('records for a new account, is idempotent, and refuses unknown codes', async () => {
    await addUser(FRIEND2, 'friend2@example.com');
    expect((await rpc(FRIEND2, 'claim_invite', 'AAAAAAAAAA')).status).toBe('unknown_code');
    expect((await rpc(FRIEND2, 'claim_invite', 'nope')).status).toBe('bad_code');
    expect((await rpc(FRIEND2, 'claim_invite', code.toLowerCase())).status).toBe('ok');
    expect((await referral(FRIEND2)).referrer_id).toBe(INVITER);
    expect((await rpc(FRIEND2, 'claim_invite', code)).status).toBe('exists');
  });

  test('only inside the first 24 hours and before any progress', async () => {
    const old = U(40);
    await addUser(old, 'old@example.com', null, 25);
    expect((await rpc(old, 'claim_invite', code)).status).toBe('too_old');
    const played = U(41);
    await addUser(played, 'played@example.com');
    await snapshot(played, 5);
    expect((await rpc(played, 'claim_invite', code)).status).toBe('too_late');
    const fresh = U(42);
    await addUser(fresh, 'fresh@example.com');
    await snapshot(fresh, 1);
    expect((await rpc(fresh, 'claim_invite', code)).status).toBe('ok');
    expect(await referral(old)).toBeUndefined();
    expect(await referral(played)).toBeUndefined();
  });
});

describe('counting and granting by account', () => {
  test('nothing qualifies before launch_at is set', async () => {
    await snapshot(FRIEND, 12, 'ok', 1); // taken before the launch: it can never count
    expect((await referral(FRIEND)).qualified_at).toBeNull();
    expect((await rpc(INVITER, 'my_invite')).qualified).toBe(0);
  });

  test('qualified at level 10 after launch_at; the inviter gets the first reward; flagged / low snapshots do not count', async () => {
    await db.query<any>(`update arena_private.referral_config set launch_at = now() - interval '1 minute'`);
    await snapshot(FRIEND, 30, 'flagged');
    await snapshot(FRIEND, 9);
    expect((await referral(FRIEND)).qualified_at).toBeNull();
    await snapshot(FRIEND, 10);
    expect((await referral(FRIEND)).qualified_at).not.toBeNull();
    const s = await rpc(INVITER, 'my_invite');
    expect(s.qualified).toBe(1);
    expect(s.rewards.map((r: any) => r.ref)).toEqual(['recruiter']);
    expect(s.rewards[0]).toMatchObject({ kind: 'title', metric: 'qualified', min_count: 1 });
  });

  test('the sweep catches up a missed qualification, twice without duplicates', async () => {
    await db.exec('alter table public.progress_snapshots disable trigger referral_snapshot_check');
    await snapshot(FRIEND2, 15);
    await db.exec('alter table public.progress_snapshots enable trigger referral_snapshot_check');
    expect((await referral(FRIEND2)).qualified_at).toBeNull();
    const n = (await as(db, 'postgres', null, () => db.query<any>('select public.referral_sweep() as n'))).rows[0].n;
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await referral(FRIEND2)).qualified_at).not.toBeNull();
    await db.query<any>('select public.referral_sweep()');
    const s = await rpc(INVITER, 'my_invite');
    expect(s.qualified).toBe(2);
    expect(s.rewards).toHaveLength(1);
    await expect(as(db, 'authenticated', INVITER, () => db.query<any>('select public.referral_sweep()'))).rejects.toThrow(/permission denied/);
  });

  test('the third qualified friend gives the frame; ten paying friends give ONE free Pass', async () => {
    for (let i = 0; i < 10; i++) {
      const id = U(50 + i);
      await addUser(id, `buyer${i}@example.com`, { invite: code });
      await snapshot(id, 10);
      await pass(id, `pi_buyer_${i}`, i % 2 ? 'mercadopago' : 'stripe');
    }
    const s = await rpc(INVITER, 'my_invite');
    expect(s.qualified).toBe(12);
    expect(s.paying).toBe(10);
    expect(s.rewards.map((r: any) => r.ref).sort()).toEqual(['adventurer_pass', 'portrait_frame_recruiter', 'recruiter']);
    const ent = await db.query<any>(`select source, status, livemode from public.entitlements where user_id = $1`, [INVITER]);
    expect(ent.rows).toEqual([{ source: 'referral', status: 'active', livemode: true }]);
    await db.query<any>('select public.referral_sweep()');
    expect((await db.query<any>(`select count(*)::int as n from public.entitlements where user_id = $1`, [INVITER])).rows[0].n).toBe(1);
  });

  test('a free or test Pass does not count as paying', async () => {
    const id = U(70);
    await addUser(id, 'freebie@example.com', { invite: code });
    await pass(id, 'ref-free', 'referral');
    expect((await rpc(INVITER, 'my_invite')).paying).toBe(10);
  });

  test('two accounts on the same e-mail alias count once', async () => {
    const a = U(80);
    const b = U(81);
    await addUser(a, 'twin.one+a@gmail.com', { invite: code });
    await addUser(b, 'twinone+b@gmail.com', { invite: code });
    await snapshot(a, 20);
    await snapshot(b, 20);
    expect((await rpc(INVITER, 'my_invite')).qualified).toBe(13);
  });
});

describe('admin', () => {
  test('admin_waitlist reports the account referrals', async () => {
    const admin = U(99);
    await addUser(admin, 'owner@example.com');
    await db.query<any>(`create or replace function public.is_admin() returns boolean language sql stable as $$ select true $$`);
    const r = await as(db, 'authenticated', admin, async () => (await db.query<any>('select public.admin_waitlist(30) as r')).rows[0].r);
    expect(r.totals.account_referred).toBeGreaterThanOrEqual(13);
    expect(r.totals.account_qualified).toBeGreaterThanOrEqual(13);
  });
});
