import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';
import { ANA, BRUNO, ELOA, seed } from './seed';

// Migration 0023: the public season boards must load for the API roles. The superuser bypasses EXECUTE checks, which is how the bug (42501 on arena_private.owns_ranking_pass) slipped through, so every
// read here runs under `set role anon` / `set role authenticated`.
let db: PGlite;

const read = async (role: 'anon' | 'authenticated', sql: string): Promise<any[]> => as(db, role, role === 'anon' ? null : BRUNO, async () => (await db.query(sql)).rows);

beforeAll(async () => {
  db = await createDb();
  await seed(db);
  await db.query(`insert into public.season_profession_entries (season, user_id, profession, score, level) values (1, $1, 'mining', 5000, 12), (1, $2, 'mining', 900, 4)`, [BRUNO, ANA]);
}, 180_000);

describe('the season boards for anon and authenticated', () => {
  test.each(['anon', 'authenticated'] as const)('%s reads season_leaderboard: eligible players only, no user ids', async (role) => {
    const rows = await read(role, 'select * from public.season_leaderboard order by rank');
    expect(rows.map((r) => r.username)).toEqual(['Bruno', 'Eloa']);
    expect(rows[0]).toMatchObject({ season: 1, rank: 1, level_total: 60, flag_count: 0 });
    expect(Object.keys(rows[0])).toEqual(['season', 'rank', 'username', 'level_total', 'paragon_level', 'highest_floor', 'deepest_depth', 'flag_count']);
  });

  test.each(['anon', 'authenticated'] as const)('%s reads season_profession_leaderboard', async (role) => {
    const rows = await read(role, 'select * from public.season_profession_leaderboard order by rank');
    expect(rows.map((r) => r.username)).toEqual(['Bruno']);
    expect(Object.keys(rows[0])).toEqual(['season', 'profession', 'rank', 'username', 'level', 'score']);
  });

  test('the helpers and the row functions stay out of reach by name', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(read(role, `select arena_private.owns_ranking_pass('${ELOA}')`)).rejects.toThrow(/permission denied/);
      await expect(read(role, 'select * from arena_private.season_leaderboard_rows()')).rejects.toThrow(/permission denied/);
      await expect(read(role, 'select * from arena_private.season_profession_leaderboard_rows()')).rejects.toThrow(/permission denied/);
    }
  });
});
