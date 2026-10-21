import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0025: the Adventurer Pass covers the pre-season and Season 1 only. Run for real in an in-memory Postgres; the tests are ORDERED (they walk the calendar:
// pre-season -> Season 1 -> Season 2), and every client-side read is made under `set role`.
let db: PGlite;

const U = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const A = U(1); // bought in the pre-season / Season 1
const B = U(2); // buys during Season 2
const C = U(3); // referral reward
const D = U(4); // pays in USDC during Season 2

const addUser = (id: string, name: string) =>
  db
    .query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${name.toLowerCase()}@example.com`])
    .then(() => db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [id]))
    .then(() => db.query(`update public.profiles set username = $2, username_set_at = now() where user_id = $1`, [id, name]));
const addPass = (user: string, ref: string, source = 'stripe', livemode = true) =>
  db.query<any>(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', $3, $2, 'active', $4) returning valid_through_season`, [user, ref, source, livemode]);
const one = async (sql: string, params: unknown[] = []): Promise<any> => (await db.query<any>(sql, params)).rows[0];
const owns = async (user: string) => (await one('select arena_private.owns_adventurer_pass($1) as v', [user])).v;
const ranks = async (user: string) => (await one('select arena_private.owns_ranking_pass($1) as v', [user])).v;
const current = async () => (await one('select arena_private.current_pass_season() as v')).v;

beforeAll(async () => {
  db = await createDb();
  for (const [id, name] of [[A, 'Ana'], [B, 'Bia'], [C, 'Caio'], [D, 'Dani']] as const) await addUser(id, name);
}, 180_000);

describe('before Season 1 opens: the pre-season is covered by Season 1', () => {
  test('current_pass_season is 1 (pre-season open, Season 1 upcoming) and a new Pass is stamped 1', async () => {
    expect((await one(`select status, kind from public.seasons where number = 0`))).toMatchObject({ status: 'open', kind: 'pre' });
    expect(await current()).toBe(1);
    expect((await addPass(A, 'pi_a')).rows[0].valid_through_season).toBe(1);
    expect(await owns(A)).toBe(true);
    expect(await ranks(A)).toBe(true);
  });

  test('the column is NOT NULL, defaults to 1, and a hand-written value is replaced by the current season on insert', async () => {
    const col = await one(`select is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'entitlements' and column_name = 'valid_through_season'`);
    expect(col).toMatchObject({ is_nullable: 'NO', column_default: '1' });
    const r = await db.query<any>(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode, valid_through_season) values ($1, 'adventurer_pass', 'grant', 'x', 'revoked', false, 7) returning valid_through_season`, [B]);
    expect(r.rows[0].valid_through_season).toBe(1);
    await db.query(`delete from public.entitlements where user_id = $1`, [B]);
  });
});

describe('Season 1 open', () => {
  test('the Pass is still valid, and the player ranks', async () => {
    await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 1`);
    await db.query(`update public.seasons set status = 'closed' where number = 0`);
    expect(await current()).toBe(1);
    expect(await owns(A)).toBe(true);
    expect(await ranks(A)).toBe(true);
    await db.query(`insert into public.season_entries (season, user_id, score) values (1, $1, 60000000)`, [A]);
    const rows = await as(db, 'anon', null, async () => (await db.query<any>('select username, season from public.season_leaderboard order by rank')).rows);
    expect(rows).toEqual([{ username: 'Ana', season: 1 }]);
  });

  test('the same Pass cannot be bought twice for the same season', async () => {
    await expect(addPass(A, 'pi_a_again')).rejects.toThrow(/entitlements_one_active_per_user_kind/);
  });

  test('my_pass_status tells the game who holds what', async () => {
    const s = await as(db, 'authenticated', A, async () => (await db.query<any>('select public.my_pass_status() as s')).rows[0].s);
    expect(s).toEqual({ owned: true, valid_through: 1, current_season: 1 });
    await expect(as(db, 'anon', null, () => db.query('select public.my_pass_status()'))).rejects.toThrow(/permission denied/);
  });
});

describe('Season 2 opens', () => {
  beforeAll(async () => {
    await db.query(`update public.seasons set status = 'closed' where number = 1`);
    await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 2`);
  });

  test('the Season-1 Pass stops: no perks, no ranking, and the Pass goal no longer counts it', async () => {
    expect(await current()).toBe(2);
    expect(await owns(A)).toBe(false);
    expect(await ranks(A)).toBe(false);
    expect(Number((await one('select arena_private.paid_pass_count() as n')).n)).toBe(0);
    const s = await as(db, 'authenticated', A, async () => (await db.query<any>('select public.my_pass_status() as s')).rows[0].s);
    expect(s).toEqual({ owned: false, valid_through: 1, current_season: 2 });
    expect(await one('select public.pass_owned_now($1) as v', [A])).toEqual({ v: false });
  });

  test('Season 1 final standings keep showing (the row asks for the Pass of ITS season)', async () => {
    expect(await one('select arena_private.owns_ranking_pass($1, 1) as v', [A])).toEqual({ v: true });
    expect(await one('select arena_private.owns_ranking_pass($1, 2) as v', [A])).toEqual({ v: false });
    const rows = await as(db, 'anon', null, async () => (await db.query<any>('select username, season from public.season_leaderboard')).rows);
    expect(rows).toEqual([{ username: 'Ana', season: 1 }]);
    const mine = await as(db, 'authenticated', A, async () => (await db.query<any>('select * from public.season_my_entry(1)')).rows);
    expect(mine[0]).toMatchObject({ season: 1, rank: 1 });
  });

  test('a new purchase during Season 2 is allowed, stamped 2, and the old row stays as history', async () => {
    expect((await addPass(A, 'pi_a_s2')).rows[0].valid_through_season).toBe(2);
    expect(await owns(A)).toBe(true);
    expect(await ranks(A)).toBe(true);
    expect((await one(`select count(*)::int as n from public.entitlements where user_id = $1 and status = 'active'`, [A])).n).toBe(2);
    expect(Number((await one('select arena_private.paid_pass_count() as n')).n)).toBe(1);
    // ... and a second one for the same season is refused
    await expect(addPass(A, 'pi_a_s2_again')).rejects.toThrow(/entitlements_one_active_per_user_kind/);
  });

  test('the referral reward is stamped with the current season', async () => {
    const r = await addPass(C, 'referral-' + C, 'referral');
    expect(r.rows[0].valid_through_season).toBe(2);
    expect(await owns(C)).toBe(true);
    // a referral Pass is not a paid one: the goal does not move
    expect(Number((await one('select arena_private.paid_pass_count() as n')).n)).toBe(1);
  });

  test('USDC: an old Pass does not block the new payment, a current Pass does', async () => {
    // B holds a Season-1 Pass (made in the past)
    await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'stripe', 'pi_b', 'active', true)`, [B]);
    await db.query(`update public.entitlements set valid_through_season = 1 where user_id = $1`, [B]);
    expect(await owns(B)).toBe(false);
    const W = 'BrunoWa11et11111111111111111111111111';
    const R = 'QwnerWa11et111111111111111111111111111';
    await db.query(`select public.pass_crypto_start($1, 24)`, [B]);
    const first = await one(`select public.pass_crypto_grant($1, $2, $3, $4, 10000000, 10000000, 300000001, now(), 502, true) as r`, [B, '4'.repeat(88), W, R]);
    expect(first.r).toEqual({ status: 'granted' });
    expect((await one(`select valid_through_season as v from public.entitlements where user_id = $1 and source = 'crypto_sol'`, [B])).v).toBe(2);
    expect(await owns(B)).toBe(true);
    // paying AGAIN in the same season: refused, the payment waits for a refund
    const second = await one(`select public.pass_crypto_grant($1, $2, $3, $4, 10000000, 10000000, 300000002, now(), 502, true) as r`, [B, '5'.repeat(88), W, R]);
    expect(second.r).toEqual({ status: 'already_owned' });
    expect((await one(`select status from public.chain_payments where tx_hash = $1`, ['5'.repeat(88)])).status).toBe('refund_due');
  });

  test('a payment exception can be granted to a player whose Pass has ended, not to one whose Pass is current', async () => {
    await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'stripe', 'pi_d', 'active', true)`, [D]);
    await db.query(`update public.entitlements set valid_through_season = 1 where user_id = $1`, [D]);
    const sig = (c: string) => c.repeat(88);
    const record = (signature: string) =>
      db.query(`select public.payment_exception_record($1, 502, false, 'pass', 'no_memo', $2, null, '11111111111111111111111111111113', '11111111111111111111111111111114', 10000000, 'pa1:pass:abc', now())`, [signature, D]);
    await record(sig('6'));
    await record(sig('7'));
    const granted = await one(`select arena_private.payment_exception_grant_pass($1) as r`, [sig('6')]);
    expect(granted.r.status).toBe('granted');
    expect((await one(`select valid_through_season as v from public.entitlements where user_id = $1 and source = 'grant'`, [D])).v).toBe(2);
    await expect(one(`select arena_private.payment_exception_grant_pass($1)`, [sig('7')])).rejects.toThrow(/PAYMENT_EXCEPTION_ALREADY_OWNED/);
  });
});
