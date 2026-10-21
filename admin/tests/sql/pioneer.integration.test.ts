import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0033: the Pioneer kit's starter chest. When the League opens (reset_at is stamped) the server puts one Gold credit and one potion credit, source 'pioneer', in the credit ledger of every account that
// had an ACCEPTED snapshot at hero level 10 or more before the reset. Run for real in an in-memory Postgres.
let db: PGlite;
const U = (n: number) => `00000000-0000-4000-8000-0000000008${String(n).padStart(2, '0')}`;
const VET = U(1); // level 12, accepted: qualifies
const EDGE = U(2); // exactly level 10, accepted: qualifies
const LOW = U(3); // level 9: does not
const FLAGGED = U(4); // level 40 but only a flagged snapshot: does not
const REJECTED = U(5); // level 40 but only a rejected snapshot: does not
const NONE = U(6); // never posted a snapshot: does not
const LATE = U(7); // account whose only snapshot is AFTER the reset: does not
const MIXED = U(8); // an early level 3 snapshot and a later accepted level 20 one, both before the reset: qualifies (once)

const credits = async (user: string) => (await db.query<any>(`select kind, item_id, amount, source, source_ref, claimed_at, counted_at from arena_private.server_credits where user_id = $1 order by source_ref`, [user])).rows;
const snap = (user: string, verdict: string, level: number, when: string) =>
  db.query(
    `insert into public.progress_snapshots (user_id, metrics, metrics_hash, verdict, reasons, created_at) values ($1, $2::jsonb, repeat('a', 64), $3, $4::text[], ${when})`,
    [user, JSON.stringify({ heroLevel: level, paragonLevel: 0, highestFloor: 3 }), verdict, verdict === 'ok' ? '{}' : '{PACE_TOO_FAST}'],
  );
const myPioneer = (uid: string): Promise<boolean> => as(db, 'authenticated', uid, async () => (await db.query<any>('select public.my_pioneer() as r')).rows[0].r);
const claim = (uid: string): Promise<any[]> => as(db, 'authenticated', uid, async () => (await db.query<any>('select public.claim_server_credits() as r')).rows[0].r);
const pending = (uid: string): Promise<any> => as(db, 'service_role', null, async () => (await db.query<any>('select public.progress_credits_pending($1) as r', [uid])).rows[0].r);
const pioneerRows = async (): Promise<number> => (await db.query<any>(`select count(*)::int as n from arena_private.server_credits where source = 'pioneer'`)).rows[0].n;
const openLeague = () => db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 1`);

beforeAll(async () => {
  db = await createDb();
  for (const u of [VET, EDGE, LOW, FLAGGED, REJECTED, NONE, LATE, MIXED]) {
    await db.query(`insert into auth.users (id, email, created_at, email_confirmed_at) values ($1, $2, now() - interval '20 days', now())`, [u, `${u}@x.com`]);
    await db.query('insert into public.profiles (user_id) values ($1) on conflict do nothing', [u]);
  }
  await snap(VET, 'ok', 12, "now() - interval '3 days'");
  await snap(EDGE, 'ok', 10, "now() - interval '3 days'");
  await snap(LOW, 'ok', 9, "now() - interval '3 days'");
  await snap(FLAGGED, 'flagged', 40, "now() - interval '3 days'");
  await snap(REJECTED, 'rejected', 40, "now() - interval '3 days'");
  await snap(MIXED, 'ok', 3, "now() - interval '5 days'");
  await snap(MIXED, 'ok', 20, "now() - interval '2 days'");
}, 180_000);

describe('before the League opens', () => {
  test('nobody has a chest and nobody is a pioneer', async () => {
    expect(await pioneerRows()).toBe(0);
    expect(await myPioneer(VET)).toBe(false);
    expect((await db.query<any>(`select arena_private.grant_pioneer_credits(null) as r`)).rows[0].r).toBe(0);
  });
});

describe('when the League opens (reset_at is stamped)', () => {
  beforeAll(async () => {
    await openLeague();
    // an account that exists after the reset, with accepted play at a high level: it never qualifies
    await db.query(`update auth.users set created_at = now() + interval '1 minute' where id = $1`, [LATE]);
    await snap(LATE, 'ok', 30, "now() + interval '5 minutes'");
  }, 60_000);

  test('a level 10+ account with an accepted snapshot gets exactly one Gold, one potion and one XP elixir credit, source pioneer', async () => {
    for (const u of [VET, EDGE, MIXED]) {
      const rows = await credits(u);
      expect(rows.map((r) => [r.kind, r.item_id, r.amount, r.source, r.source_ref]), u).toEqual([
        ['gold', null, 500, 'pioneer', 'pioneer-gold'],
        ['consumable', 'small_hp', 10, 'pioneer', 'pioneer-potion'],
        ['consumable', 'knowledge_elixir', 1, 'pioneer', 'pioneer-xp'],
      ]);
      expect(rows.every((r) => r.claimed_at === null && r.counted_at === null)).toBe(true);
    }
  });

  test('level below 10, flagged / rejected only, no snapshot and post-reset accounts get nothing', async () => {
    for (const u of [LOW, FLAGGED, REJECTED, NONE, LATE]) expect(await credits(u), u).toEqual([]);
    expect(await pioneerRows()).toBe(9);
  });

  test('the title / frame question (my_pioneer) follows the same rule', async () => {
    for (const u of [VET, EDGE, MIXED]) expect(await myPioneer(u), u).toBe(true);
    for (const u of [LOW, FLAGGED, REJECTED, NONE, LATE]) expect(await myPioneer(u), u).toBe(false);
    await expect(as(db, 'anon', null, () => db.query('select public.my_pioneer()'))).rejects.toThrow(/permission denied/i);
  });

  test('firing again gives no duplicates (server_credits_once), and the stamp itself cannot move', async () => {
    const reset = (await db.query<any>('select reset_at from arena_private.season_goal where id')).rows[0].reset_at;
    expect((await db.query<any>(`select arena_private.grant_pioneer_credits($1::timestamptz) as r`, [reset])).rows[0].r).toBe(0);
    expect((await credits(VET)).length).toBe(3);
    expect((await credits(MIXED)).length).toBe(3);
    await expect(db.query(`update arena_private.season_goal set reset_at = now()`)).rejects.toThrow(/LEAGUE_RESET_IS_SET_ONCE/);
    expect(await pioneerRows()).toBe(9);
  });

  test('the table refuses a hand-made duplicate of a pioneer credit and an unknown source', async () => {
    await expect(db.query(`insert into arena_private.server_credits (user_id, kind, amount, source, source_ref) values ($1, 'gold', 60, 'pioneer', 'pioneer-gold')`, [VET])).rejects.toThrow(/server_credits_once/);
    await expect(db.query(`insert into arena_private.server_credits (user_id, kind, amount, source, source_ref) values ($1, 'gold', 60, 'other', 'x')`, [VET])).rejects.toThrow(/server_credits_source_check/);
  });

  test('the player claims the chest once; the audit counts it so the balance jump never flags him', async () => {
    const got = await claim(VET);
    expect(got.map((r) => [r.kind, r.item_id, r.amount, r.source_ref]).sort()).toEqual([
      ['consumable', 'knowledge_elixir', 1, 'pioneer-xp'],
      ['consumable', 'small_hp', 10, 'pioneer-potion'],
      ['gold', null, 500, 'pioneer-gold'],
    ]);
    expect(await claim(VET)).toEqual([]); // a second claim hands over nothing
    const p = await pending(VET);
    expect(p.gold).toBe(500);
    expect(p.consumable).toBe(11);
    // a player with nothing owed claims nothing, and one player cannot claim another's chest
    expect(await claim(LOW)).toEqual([]);
    expect((await credits(EDGE)).every((r) => r.claimed_at === null)).toBe(true);
  });
});
