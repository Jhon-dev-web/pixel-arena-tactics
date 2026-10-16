import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0009 is SQL that was never run from this repo: these tests read the file and pin the guarantees of the owner's decision (the first paid League resets every online hero, once).
// The SQL TEST PLAN at the end of the file is what proves it against a real database.

const root = resolve(__dirname, '../../../..');
const dir = resolve(root, 'supabase/migrations');
const read = (name: string) => readFileSync(resolve(dir, name), 'utf8');
const noComments = (sql: string) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
const m9 = read('0009_first_league_reset.sql');
const code = noComments(m9);

function block(name: string): string {
  const start = code.indexOf(`create or replace function ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('$$;', code.indexOf('as $$', start)) + 3);
}

describe('0009: the reset timestamp is set only once and only by the opening path', () => {
  it('is a nullable column of the private goal row, null until the first League opens', () => {
    expect(code).toContain('alter table arena_private.season_goal add column if not exists reset_at timestamptz;');
    expect(code).not.toMatch(/reset_at timestamptz not null/);
    expect(code).not.toMatch(/reset_at timestamptz default/);
  });

  it('exactly one statement assigns it, inside the stamp function, and only while it is still null', () => {
    const assignments = code.match(/set reset_at\s*=/g) ?? [];
    expect(assignments).toHaveLength(1);
    const stamp = block('arena_private.stamp_league_reset()');
    expect(stamp).toContain('update arena_private.season_goal set reset_at = pg_catalog.now() where id and reset_at is null;');
    expect(stamp).toContain("new.kind = 'ranked' and new.status = 'open'");
    expect(stamp).toContain("(tg_op = 'INSERT' or old.status is distinct from 'open')");
  });

  it('is fired by the ranked season becoming open (every opening path ends in that update) and by nothing else', () => {
    expect(code).toMatch(/create trigger seasons_stamp_league_reset\s+after insert or update of status on public\.seasons\s+for each row\s+execute function arena_private\.stamp_league_reset\(\);/);
    expect(code.match(/stamp_league_reset\(\)/g)?.length).toBeGreaterThanOrEqual(3); // create, revoke, trigger
    expect(code).not.toMatch(/perform arena_private\.stamp_league_reset/);
    // the opening function of 0006 (the goal and the owner's manual call) really does flip a RANKED season to open with an UPDATE on public.seasons
    const m6 = noComments(read('0006_portal_meter_and_profession_ranking.sql'));
    const open = m6.slice(m6.indexOf('create or replace function arena_private.open_paid_season'), m6.indexOf('create or replace function arena_private.try_open_paid_season'));
    expect(open).toContain('update public.seasons');
    expect(open).toContain("status = 'open'");
    expect(open).toContain("kind = 'ranked'");
  });

  it('a second opening, a later League or any update cannot move or clear it (set-once guard, no bypass for the app roles)', () => {
    const guard = block('arena_private.season_goal_reset_once()');
    expect(guard).toContain('if old.reset_at is not null and new.reset_at is distinct from old.reset_at then');
    expect(guard).toContain("message = 'LEAGUE_RESET_IS_SET_ONCE'");
    expect(code).toMatch(/create trigger season_goal_reset_once\s+before update on arena_private\.season_goal\s+for each row/);
    expect(code).toContain('revoke all on function arena_private.stamp_league_reset() from public, anon, authenticated;');
    expect(code).toContain('revoke all on function arena_private.season_goal_reset_once() from public, anon, authenticated;');
    // the stamp also clears the snapshot rate limit, but only the first time
    expect(block('arena_private.stamp_league_reset()')).toMatch(/if found then\s+delete from arena_private\.progress_rate where true;\s+end if;/);
  });

  it('no other migration, and no code in the game or the functions, writes reset_at', () => {
    // Another migration may READ reset_at (0010 revokes the certificates minted before it, from a trigger on the column; 0011 replaces that trigger function so it also pulls open listings down); none may write it: no `set reset_at`.
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql') && !n.startsWith('0009'))) {
      const sql = noComments(read(f));
      if (!f.startsWith('0010') && !f.startsWith('0011')) expect(sql, f).not.toContain('reset_at');
      expect(sql, f).not.toMatch(/\bset\s+reset_at\b/);
    }
    for (const f of ['functions/_shared/progress/progressDb.ts', 'functions/_shared/progress/handler.ts', 'functions/_shared/progress/league.ts']) {
      expect(readFileSync(resolve(root, 'supabase', f), 'utf8'), f).not.toMatch(/season_goal['"`]/);
    }
  });
});

describe('0009: what the public and the clients can reach', () => {
  it('anon and authenticated read the timestamp and nothing else', () => {
    const fn = block('public.league_reset_at()');
    expect(fn).toContain('returns timestamptz');
    expect(fn).toContain('select g.reset_at from arena_private.season_goal as g where g.id;');
    expect(code).toContain('revoke all on function public.league_reset_at() from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.league_reset_at() to anon, authenticated, service_role;');
    expect(code).not.toMatch(/grant (select|update|insert)[^;]*arena_private\.season_goal[^;]*(anon|authenticated)/);
  });

  it('my_pioneer is for signed-in players, reads only their own accepted pre-reset snapshots, and is false before the League', () => {
    const fn = block('public.my_pioneer()');
    expect(fn).toContain('returns boolean');
    expect(fn).toContain('s.user_id = (select auth.uid())');
    expect(fn).toContain("s.verdict = 'ok' and s.created_at < g.reset_at");
    expect(fn).toContain('g.reset_at is not null');
    expect(fn).toMatch(/\),\s+false\s+\)/);
    expect(code).toContain('grant execute on function public.my_pioneer() to authenticated;');
    expect(code).not.toMatch(/grant execute on function public\.my_pioneer\(\) to[^;]*anon/);
  });

  it('lifetime flags start at the reset', () => {
    const fn = block('arena_private.has_open_flags(p_user_id uuid)');
    expect(fn).toContain("s.created_at >= coalesce((select g.reset_at from arena_private.season_goal as g where g.id), '-infinity'::timestamptz)");
    expect(fn).toContain('progress_flag_clears');
  });
});

describe('0009: the owner can run and undo it', () => {
  it('documents the rollback, the manual opening and a SQL test plan, and does not apply anything by itself', () => {
    expect(m9).toContain('ROLLBACK (by hand');
    expect(m9).toContain('SQL TEST PLAN');
    expect(m9).toContain('NOT APPLIED by the work that wrote this file');
    expect(m9).toContain('arena_private.open_paid_season');
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) expect(m9, letter).toContain(`-- ${letter}. `);
    // no top-level data statement: the only updates / deletes live (indented) inside the trigger function bodies
    expect(code).not.toMatch(/^(insert into|delete from|update)\s/m);
  });
});
