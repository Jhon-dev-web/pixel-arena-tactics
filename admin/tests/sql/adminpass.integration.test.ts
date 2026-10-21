import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0026: the admin overview / player list / player detail say BOTH "Pass valid this season" (the owns_adventurer_pass / owns_ranking_pass rule) and the all-time history,
// and revenue is never filtered by validity. The tests walk the calendar like passseason.integration.test.ts: pre-season -> Season 1 -> Season 2.
let db: PGlite;

const U = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;
const OWNER = U(90);
const A = U(1); // live card Pass bought for the pre-season / Season 1
const B = U(2); // test-mode card Pass (does not rank)
const C = U(3); // referral Pass (a grant: perks, and the ranking rule lets it in)
const D = U(4); // paid USDC (live)
const E = U(5); // never had a Pass

const SIG = (c: string) => c.repeat(88);

const addUser = (id: string, name: string) =>
  db
    .query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${name.toLowerCase()}@example.com`])
    .then(() => db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [id]))
    .then(() => db.query(`update public.profiles set username = $2, username_set_at = now() where user_id = $1`, [id, name]));
const addPass = (user: string, ref: string, source: string, livemode: boolean) =>
  db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', $3, $2, 'active', $4)`, [user, ref, source, livemode]);
const asOwner = async <T = any>(sql: string, params: unknown[] = []): Promise<T> => as(db, 'authenticated', OWNER, async () => (await db.query<{ r: T }>(sql, params)).rows[0].r);
const overview = () => asOwner('select public.admin_overview() as r');
const players = (filters: Record<string, unknown> = {}) => asOwner(`select public.admin_players(null, 'username', 'asc', 0, 50, $1::jsonb) as r`, [JSON.stringify(filters)]);
const names = (page: any) => page.rows.map((r: any) => r.username).sort();

beforeAll(async () => {
  db = await createDb();
  await addUser(OWNER, 'Owner');
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [OWNER]);
  for (const [id, n] of [[A, 'Ana'], [B, 'Bia'], [C, 'Caio'], [D, 'Dani'], [E, 'Edu']] as const) await addUser(id, n);
  await addPass(A, 'pi_a', 'stripe', true);
  await addPass(B, 'pi_b', 'stripe', false);
  await addPass(C, 'referral-c', 'referral', true);
  await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'crypto_sol', $2, 'active', true)`, [D, SIG('4')]);
  await db.query(
    `insert into public.chain_payments (tx_hash, chain_id, livemode, purpose, leg, user_id, from_address, to_address, amount_units, block_number, block_time, status)
     values ($1, 101, true, 'pass', 'pass', $2, 'DaniWa11et1111111111111111111111111111', 'QwnerWa11et111111111111111111111111111', 10000000, 1, now(), 'applied')`,
    [SIG('4'), D],
  );
}, 180_000);

describe('pre-season (covered by Season 1)', () => {
  test('every Pass is valid now; the ranking rule leaves out the test-mode one; history agrees', async () => {
    const o = await overview();
    expect(o.pass.current_season).toBe(1);
    expect(o.pass.owners_valid_now).toBe(4);
    expect(o.pass.owners_valid_ranking).toBe(3);
    expect(o.pass.owners_history).toBe(4);
    expect(o.pass.owners_active).toBe(4);
    expect(o.pass.owners_expired).toBe(0);
  });

  test('the player list says valid now / ranking per row and keeps source and live/test', async () => {
    const all = await players();
    const row = (n: string) => all.rows.find((r: any) => r.username === n);
    expect(row('Ana')).toMatchObject({ pass_valid_now: true, pass_ranking: true, pass_history: 1, pass_valid_through: 1, pass_source: 'stripe', pass_livemode: true });
    expect(row('Bia')).toMatchObject({ pass_valid_now: true, pass_ranking: false, pass_source: 'stripe', pass_livemode: false });
    expect(row('Caio')).toMatchObject({ pass_valid_now: true, pass_ranking: true, pass_source: 'referral' });
    expect(row('Edu')).toMatchObject({ pass_valid_now: false, pass_ranking: false, pass_history: 0, pass_source: null });
    expect(names(await players({ pass: 'yes' }))).toEqual(['Ana', 'Bia', 'Caio', 'Dani']);
    expect(names(await players({ pass: 'no' }))).toEqual(['Edu', 'Owner']);
  });
});

describe('Season 1 open: nothing changes', () => {
  test('still valid now', async () => {
    await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 1`);
    await db.query(`update public.seasons set status = 'closed' where number = 0`);
    const o = await overview();
    expect(o.pass.current_season).toBe(1);
    expect(o.pass.owners_valid_now).toBe(4);
    expect(names(await players({ pass: 'yes' }))).toEqual(['Ana', 'Bia', 'Caio', 'Dani']);
  });
});

describe('Season 2 opens', () => {
  let revenueBefore: any;
  beforeAll(async () => {
    revenueBefore = (await overview()).pass;
    await db.query(`update public.seasons set status = 'closed' where number = 1`);
    await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 2`);
  });

  test('a Season-1-only account is no longer valid now but stays in the history', async () => {
    const o = await overview();
    expect(o.pass.current_season).toBe(2);
    expect(o.pass.owners_valid_now).toBe(0);
    expect(o.pass.owners_valid_ranking).toBe(0);
    expect(o.pass.owners_history).toBe(4);
    expect(o.pass.owners_expired).toBe(4);
    expect(o.pass.by_source.every((s: any) => s.valid_now === 0)).toBe(true);
    expect(o.pass.by_source.reduce((n: number, s: any) => n + s.active, 0)).toBe(4);
  });

  test('revenue and the all-time sale counts did not move', async () => {
    const p = (await overview()).pass;
    for (const k of ['card_sold_live', 'card_sold_test', 'card_refunded_live', 'usdc_live', 'usdc_test', 'usdc_to_refund', 'usdc_payments_live']) expect(Number(p[k])).toBe(Number(revenueBefore[k]));
    expect(Number(p.usdc_live)).toBe(10);
    expect(p.card_sold_live).toBe(1);
  });

  test('the list: valid-now filter drops them, the expired and history filters find them, the row still shows source and the old season', async () => {
    expect(names(await players({ pass: 'yes' }))).toEqual([]);
    expect(names(await players({ pass: 'expired' }))).toEqual(['Ana', 'Bia', 'Caio', 'Dani']);
    expect(names(await players({ pass: 'history' }))).toEqual(['Ana', 'Bia', 'Caio', 'Dani']);
    expect(names(await players({ pass: 'no' }))).toEqual(['Ana', 'Bia', 'Caio', 'Dani', 'Edu', 'Owner']);
    const ana = (await players()).rows.find((r: any) => r.username === 'Ana');
    expect(ana).toMatchObject({ pass_valid_now: false, pass_ranking: false, pass_history: 1, pass_valid_through: 1, pass_source: 'stripe', pass_livemode: true });
  });

  test('the detail separates valid now, ranking and history; each entitlement says what it covered', async () => {
    const d = await asOwner('select public.admin_player_detail($1) as r', [A]);
    expect(d.pass).toEqual({ current_season: 2, valid_now: false, ranking_eligible: false, history: 1, valid_through: 1 });
    expect(d.entitlements[0]).toMatchObject({ source: 'stripe', livemode: true, valid_through_season: 1, valid_now: false });
  });

  test('buying the Season-2 Pass: valid now again, the old row stays as history, revenue counts both purchases', async () => {
    await addPass(A, 'pi_a_s2', 'stripe', true);
    const o = await overview();
    expect(o.pass.owners_valid_now).toBe(1);
    expect(o.pass.owners_valid_ranking).toBe(1);
    expect(o.pass.owners_history).toBe(4);
    expect(o.pass.owners_expired).toBe(3);
    expect(o.pass.card_sold_live).toBe(2);
    expect(names(await players({ pass: 'yes' }))).toEqual(['Ana']);
    const d = await asOwner('select public.admin_player_detail($1) as r', [A]);
    expect(d.pass).toEqual({ current_season: 2, valid_now: true, ranking_eligible: true, history: 2, valid_through: 2 });
    expect(d.entitlements.map((e: any) => [e.valid_through_season, e.valid_now])).toEqual([[2, true], [1, false]]);
    const ana = (await players()).rows.find((r: any) => r.username === 'Ana');
    expect(ana).toMatchObject({ pass_valid_now: true, pass_valid_through: 2, pass_history: 2 });
  });

  test('a revoked Pass counts nowhere', async () => {
    await db.query(`update public.entitlements set status = 'revoked' where user_id = $1 and provider_ref = 'pi_a_s2'`, [A]);
    expect((await overview()).pass.owners_valid_now).toBe(0);
    expect((await asOwner('select public.admin_player_detail($1) as r', [A])).pass.valid_now).toBe(false);
  });
});
