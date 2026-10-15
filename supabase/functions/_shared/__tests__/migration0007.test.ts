import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0007 is SQL that was never run from this repo: these tests read the file and pin the guarantees the review asked for. The SQL TEST PLAN at the end of the file is what
// proves it against a real database (docs/SEASON_RANKING.md and docs/PASS_SALES.md tell the owner to run it in the dev project first).

const root = resolve(__dirname, '../../../..');
const m7 = readFileSync(resolve(root, 'supabase/migrations/0007_review_fixes.sql'), 'utf8');
const code = m7
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

/** The text of one `create or replace function|view <name>` statement up to its terminating `$$;` / `;`. */
function block(name: string, kind: 'function' | 'view' = 'function'): string {
  const start = code.indexOf(`create or replace ${kind} ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  if (kind === 'view') return code.slice(start, code.indexOf(';', start) + 1);
  return code.slice(start, code.indexOf('$$;', code.indexOf('as $$', start)) + 3);
}

describe('0007 B1: account age and characters.created_at', () => {
  it('the age comes from auth.users through a service-role-only function', () => {
    expect(block('arena_private.account_created_at(p_user_id uuid)')).toContain('from auth.users as u where u.id = p_user_id');
    expect(code).toContain('revoke all on function arena_private.account_created_at(uuid) from public, anon, authenticated;');
    expect(code).toContain('revoke all on function public.progress_account_created_at(uuid) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.progress_account_created_at(uuid) to service_role;');
    expect(code).not.toMatch(/grant execute on function (arena_private|public)\.(account_created_at|progress_account_created_at)[^;]*(anon|authenticated)/);
  });

  it('characters.created_at is stamped on insert and immutable on update, for every writer', () => {
    const fn = block('arena_private.characters_created_at_guard()');
    expect(fn).toContain("if tg_op = 'INSERT' then");
    expect(fn).toContain('new.created_at := pg_catalog.now();');
    expect(fn).toContain('new.created_at := old.created_at;');
    expect(code).toMatch(/create trigger characters_created_at_guard\s+before insert or update on public\.characters\s+for each row/);
  });

  it('the client roles keep exactly the columns the save flow writes, and created_at / updated_at / id are not among them', () => {
    const repo = readFileSync(resolve(root, 'src/game/saveRepository.ts'), 'utf8');
    const keysOf = (call: string): string[] => {
      const at = repo.indexOf(call);
      expect(at, call).toBeGreaterThan(-1);
      const open = repo.indexOf('({', at);
      const body = repo.slice(open + 2, repo.indexOf('})', open));
      return [...body.matchAll(/^\s*(\w+):/gm)].map((x) => x[1]);
    };
    const insertCols = keysOf('.insert');
    const updateCols = keysOf('.update');
    const grant = (verb: 'insert' | 'update') => {
      const m = new RegExp(`grant ${verb} \\(([^)]*)\\) on public\\.characters to authenticated;`).exec(code);
      expect(m, verb).not.toBeNull();
      return m![1].split(',').map((c) => c.trim());
    };
    expect(insertCols.length).toBeGreaterThanOrEqual(6);
    expect(updateCols.length).toBeGreaterThanOrEqual(4);
    for (const c of insertCols) expect(grant('insert'), `insert ${c}`).toContain(c);
    for (const c of updateCols) expect(grant('update'), `update ${c}`).toContain(c);
    for (const verb of ['insert', 'update'] as const) for (const bad of ['created_at', 'updated_at', 'id']) expect(grant(verb)).not.toContain(bad);
    expect(code).toContain('revoke insert, update on public.characters from anon, authenticated;');
    expect(code.indexOf('revoke insert, update on public.characters')).toBeLessThan(code.indexOf('grant insert ('));
  });
});

describe('0007 B3: save size and the atomic snapshot slot', () => {
  it('the save_data ceiling is the same number as MAX_SAVE_UPLOAD_BYTES (288 KiB)', () => {
    const upload = readFileSync(resolve(root, 'src/game/saveUpload.ts'), 'utf8');
    expect(/MAX_SAVE_UPLOAD_BYTES = 288 \* 1024;/.test(upload)).toBe(true);
    const m = /check \(pg_catalog\.pg_column_size\(save_data\) <= (\d+)\) not valid/.exec(code);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(288 * 1024);
  });

  it('progress_claim_slot is ONE insert ... on conflict do update ... where statement, callable by the service role only', () => {
    const fn = block('public.progress_claim_slot(p_user_id uuid, p_interval_seconds integer)');
    expect(fn).toMatch(/insert into arena_private\.progress_rate as r[\s\S]*on conflict \(user_id\) do update[\s\S]*where r\.last_at <= pg_catalog\.now\(\) - pg_catalog\.make_interval\(secs => p_interval_seconds\)[\s\S]*returning r\.user_id into v_user;/);
    expect(fn.match(/\binsert into\b/g)).toHaveLength(1);
    expect(fn).not.toMatch(/\bselect\b[^;]*progress_rate/); // no read-then-write gap
    expect(code).toContain('grant execute on function public.progress_claim_slot(uuid, integer) to service_role;');
    expect(code).toContain('revoke all on function public.progress_claim_slot(uuid, integer) from public, anon, authenticated;');
    expect(code).toContain('revoke all on table arena_private.progress_rate from public, anon, authenticated;');
  });
});

describe('0007 B2: lifetime flags', () => {
  it('has_open_flags is any flagged / rejected snapshot without a clear row, over the whole history', () => {
    const fn = block('arena_private.has_open_flags(p_user_id uuid)');
    expect(fn).toContain("s.verdict <> 'ok'");
    expect(fn).toContain('not exists (select 1 from public.progress_flag_clears as c where c.snapshot_id = s.id)');
    expect(fn).not.toMatch(/created_at|interval/); // no time window: the whole life of the account
    expect(code).toContain('revoke all on function arena_private.has_open_flags(uuid) from public, anon, authenticated;');
  });

  it('the paid season refuses an account with an open flag (ok snapshot, professions) and both apply functions use the ranking Pass', () => {
    for (const name of ['public.season_apply_snapshot(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_reasons text[], p_score bigint)', 'public.season_apply_professions(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_professions jsonb)']) {
      const fn = block(name);
      expect(fn).toContain("if v_kind = 'ranked' and arena_private.has_open_flags(p_user_id) then");
      expect(fn).toContain("return 'flagged_history';");
      expect(fn).toContain('arena_private.owns_ranking_pass(p_user_id)');
      expect(fn).not.toContain('owns_adventurer_pass');
    }
    const snap = block('public.season_apply_snapshot(p_user_id uuid, p_snapshot_id uuid, p_verdict text, p_reasons text[], p_score bigint)');
    expect(snap.indexOf("if p_verdict <> 'ok' then")).toBeLessThan(snap.indexOf('has_open_flags')); // a flagged snapshot still records its flags first
    expect(snap).toContain('p_score > v_entry.score');
  });

  it('only the service role can clear flags, an audit note is mandatory, and nothing is deleted', () => {
    const fn = block('public.progress_clear_flags(p_user_id uuid, p_note text, p_adopt_baseline boolean default false)');
    expect(fn).toContain("raise exception using errcode = '22023', message = 'AUDIT_NOTE_REQUIRED';");
    expect(fn).toContain('insert into public.progress_flag_clears (snapshot_id, user_id, note)');
    expect(fn).not.toMatch(/\bdelete\b/);
    expect(code).toContain('constraint progress_flag_clears_note_check check (pg_catalog.char_length(note) between 5 and 500)');
    expect(code).toContain('revoke all on function public.progress_clear_flags(uuid, text, boolean) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.progress_clear_flags(uuid, text, boolean) to service_role;');
    expect(code).toContain('revoke all on table public.progress_flag_clears from public, anon, authenticated;');
    expect(code).not.toMatch(/grant [^;]*progress_flag_clears[^;]*(anon|authenticated)/);
  });
});

describe('0007 P2/P4: the public boards need an active real Pass; livemode', () => {
  const columns = (view: string, from: string) =>
    view
      .slice(view.indexOf('select') + 6, view.indexOf(from))
      .split('\n')
      .map((l) => l.trim().replace(/,$/, ''))
      .filter(Boolean)
      .map((l) => / as (\w+)$/.exec(l)?.[1] ?? l.replace(/^\w+\./, ''));

  it('season_leaderboard: same columns as before, hides inactive Pass owners, and in a ranked season anything flagged', () => {
    const view = block('public.season_leaderboard', 'view');
    expect(columns(view, 'from public.season_entries')).toEqual(['season', 'rank', 'username', 'level_total', 'paragon_level', 'highest_floor', 'deepest_depth', 'flag_count']);
    expect(view).toContain('with (security_invoker = false)');
    expect(view).toContain('arena_private.owns_ranking_pass(e.user_id)');
    expect(view).toContain("(s.kind = 'pre' or (pg_catalog.cardinality(e.flags) = 0 and not arena_private.has_open_flags(e.user_id)))");
    expect(view).toContain('e.disqualified = false');
  });

  it('season_profession_leaderboard: same columns, active Pass, no flags, no open lifetime flag in a ranked season', () => {
    const view = block('public.season_profession_leaderboard', 'view');
    expect(columns(view, 'from public.season_profession_entries')).toEqual(['season', 'profession', 'rank', 'username', 'level', 'score']);
    expect(view).toContain('arena_private.owns_ranking_pass(e.user_id)');
    expect(view).toContain('pg_catalog.cardinality(se.flags) = 0');
    expect(view).toContain("(s.kind = 'pre' or not arena_private.has_open_flags(e.user_id))");
  });

  it('season_my_entry ranks only visible players the same way and still returns the caller his own row', () => {
    const fn = block('public.season_my_entry(p_season integer default null)');
    expect(fn).toContain('arena_private.owns_ranking_pass(e.user_id)');
    expect(fn).toContain('arena_private.has_open_flags(e.user_id)');
    expect(fn).toContain('left join ranked as r on r.entry_id = e.id');
    expect(fn).toContain('e.user_id = (select auth.uid())');
  });

  it('livemode: the columns exist, the backfill reads the stored payload, only live paid rows count and fire the goal', () => {
    expect(code).toContain('alter table public.entitlements add column if not exists livemode boolean not null default false;');
    expect(code).toContain('alter table public.payment_events add column if not exists livemode boolean not null default false;');
    expect(code).toContain("(payload ->> 'livemode') = 'true'");
    expect(block('arena_private.paid_pass_count()')).toContain("e.source in ('stripe', 'mercadopago') and e.livemode");
    expect(block('arena_private.entitlements_goal_trigger()')).toContain("new.status = 'active' and new.livemode and new.source in ('stripe', 'mercadopago')");
    expect(code).toMatch(/after insert or update of status, livemode on public\.entitlements/);
    const own = block('arena_private.owns_ranking_pass(p_user_id uuid)');
    expect(own).toContain("e.status = 'active'");
    expect(own).toContain("(e.livemode or e.source = 'grant')");
  });
});

describe('0007 P1: checkout_claim', () => {
  const fn = block('public.checkout_claim(\n  p_user_id uuid,\n  p_max integer,\n  p_window_seconds integer,\n  p_pending_seconds integer,\n  p_reuse_min_remaining_seconds integer,\n  p_reuse_max_age_seconds integer\n)');

  it('takes a per-user lock first, then decides in the same order as decideCheckoutClaim, then inserts', () => {
    const lock = fn.indexOf('pg_advisory_xact_lock');
    const reuse = fn.indexOf("'outcome', 'reuse'");
    const pending = fn.indexOf("'outcome', 'in_progress'");
    const limit = fn.indexOf("'outcome', 'rate_limited'");
    const create = fn.indexOf("'outcome', 'create'");
    expect(lock).toBeGreaterThan(-1);
    expect([lock, reuse, pending, limit, create].every((x, i, a) => i === 0 || x > a[i - 1])).toBe(true);
    expect(fn).toContain('insert into public.checkout_attempts (user_id) values (p_user_id) returning id into v_id;');
    expect(fn).toContain('v_count >= p_max');
    expect(fn).toContain('not a.session_completed');
    expect(fn).toContain('a.session_url is null');
  });

  it('is callable by the service role only, and the attempt table stores the session', () => {
    expect(code).toContain('revoke all on function public.checkout_claim(uuid, integer, integer, integer, integer, integer) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.checkout_claim(uuid, integer, integer, integer, integer, integer) to service_role;');
    for (const col of ['provider_session_id text', 'session_url text', 'session_expires_at timestamptz', 'session_completed boolean not null default false']) expect(code).toContain(`add column if not exists ${col}`);
    expect(code).toContain('grant select, insert, update, delete on table public.checkout_attempts to service_role;');
  });
});

describe('0007 hygiene', () => {
  it('has a rollback, owner controls and an SQL test plan, grants nothing write-capable to clients and contains no secrets', () => {
    expect(m7).toContain('-- ROLLBACK');
    expect(m7).toContain('-- OWNER CONTROLS');
    expect(m7).toContain('-- SQL TEST PLAN');
    expect(code).not.toMatch(/grant (insert|update|delete|all)\b[^;(]*to (anon|authenticated)/); // only the column-level grants on characters below
    expect(code).not.toMatch(/sk_(live|test)_|whsec_|service_role_key|eyJ[A-Za-z0-9]{20,}/);
  });
});
