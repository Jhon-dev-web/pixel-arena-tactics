import { expect, test } from 'vitest';
import { createDb } from './harness';

// Migration 0030: the Pass-sales goal that opens Season 1 is 1,000 paid Passes.
test('a fresh database has the 1,000-Pass goal, not fired yet', async () => {
  const db = await createDb();
  const g = (await db.query<any>('select target, season_number, opened_at from arena_private.season_goal')).rows;
  expect(g).toEqual([{ target: 1000, season_number: 1, opened_at: null }]);
}, 180_000);
