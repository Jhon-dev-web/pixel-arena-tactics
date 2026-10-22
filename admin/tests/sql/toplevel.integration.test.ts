import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0037: public.admin_top_level, the "Top 25 por nível" of the playtest prize. Run for real in an in-memory Postgres, called the way the app calls it.
let db: PGlite;

const U = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;
const ADMIN = U(0);
const ANA = U(1); // level 30, reached 5 h ago
const BIA = U(2); // level 30 too, reached 3 h ago (loses the tie)
const CAIO = U(3); // level 10 + Paragon 25 = 35, but only through a REJECTED submission; accepted max is 20
const DANI = U(4); // level 40, reached 1 h ago, already has a Pass
const EDU = U(5); // level 50 only AFTER the cut-off used below

const call = async (uid: string, sql: string, params: unknown[] = []): Promise<any> => as(db, 'authenticated', uid, async () => (await db.query<{ r: any }>(sql, params)).rows[0].r);
const top = (limit?: number, until?: string) => call(ADMIN, 'select public.admin_top_level($1, $2) as r', [limit ?? 25, until ?? null]);
const snap = (user: string, hero: number, hoursAgo: number, verdict = 'ok', paragon = 0) =>
  db.query(`insert into public.progress_snapshots (user_id, metrics, metrics_hash, verdict, reasons, created_at) values ($1, $2::jsonb, repeat('a', 64), $3, '{}', now() - ($4 || ' hours')::interval)`, [
    user,
    JSON.stringify({ heroLevel: hero, paragonLevel: paragon }),
    verdict,
    String(hoursAgo),
  ]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, name] of [[ADMIN, 'Dono'], [ANA, 'Ana'], [BIA, 'Bia'], [CAIO, 'Caio'], [DANI, 'Dani'], [EDU, 'Edu']] as const) {
    await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${name.toLowerCase()}@example.com`]);
    await db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [id]);
    await db.query(`update public.profiles set username = $2, username_set_at = now() where user_id = $1`, [id, name]);
  }
  await db.query(`insert into arena_private.admins (user_id) values ($1)`, [ADMIN]);
  await snap(ANA, 20, 8);
  await snap(ANA, 30, 5);
  await snap(ANA, 30, 2); // same level again later: the date stays the first one
  await snap(BIA, 30, 3);
  await snap(CAIO, 20, 4);
  await snap(CAIO, 10, 2, 'rejected', 25);
  await snap(DANI, 40, 1, 'flagged');
  await snap(EDU, 50, 0.1);
  await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'grant', 'g1', 'active', false)`, [DANI]);
}, 180_000);

describe('admin_top_level', () => {
  test('ranks by level, ties go to whoever reached it first, rejected submissions never count', async () => {
    const r = await top();
    expect(r.rows.map((x: any) => [x.username, x.level])).toEqual([
      ['Edu', 50],
      ['Dani', 40],
      ['Ana', 30],
      ['Bia', 30],
      ['Caio', 20],
    ]);
    const ana = r.rows.find((x: any) => x.username === 'Ana');
    const bia = r.rows.find((x: any) => x.username === 'Bia');
    expect(Date.parse(ana.reached_at)).toBeLessThan(Date.parse(bia.reached_at));
    expect(Date.now() - Date.parse(ana.reached_at)).toBeGreaterThan(4.5 * 3600_000); // the first submission at 30, not the later one
    expect(r.ranked).toBe(5);
  });

  test('a flagged account still ranks and shows its alert; the Pass already held is reported', async () => {
    const dani = (await top()).rows.find((x: any) => x.username === 'Dani');
    expect(dani.open_flags).toBe(1);
    expect(dani.pass_valid_now).toBe(true);
    expect(dani.pass_source).toBe('grant');
    expect((await top()).rows.find((x: any) => x.username === 'Ana').pass_valid_now).toBe(false);
  });

  test('the cut-off ignores later submissions, and the limit cuts the list', async () => {
    const until = (await db.query<any>(`select (now() - interval '30 minutes') as t`)).rows[0].t;
    const r = await top(2, new Date(until).toISOString());
    expect(r.rows.map((x: any) => x.username)).toEqual(['Dani', 'Ana']);
    expect(r.limit).toBe(2);
    expect(r.ranked).toBe(4);
  });

  test('admin only', async () => {
    await expect(call(ANA, 'select public.admin_top_level(25, null) as r')).rejects.toThrow(/ADMIN_ONLY|permission/);
    await expect(as(db, 'anon', null, () => db.query('select public.admin_top_level(25, null)'))).rejects.toThrow(/permission/);
  });
});
