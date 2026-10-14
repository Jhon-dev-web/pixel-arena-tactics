-- Progress snapshots stamped by the SERVER clock (the plausibility audit of the season ranking).
--
-- The save is client-authoritative (docs/backend-phase1.md), so the ranking cannot trust a save. What it can trust is TIME: every snapshot is written by the
-- `submit-progress` Edge Function (service role) with created_at = the database clock, and the function judges each new snapshot against the account's own
-- server history (supabase/functions/_shared/progress/). The table is append-only; clients can only read their own rows and have NO insert privilege.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it (SQL editor or `supabase db push`) when ready.
--
-- ROLLBACK (by hand; deletes every stored snapshot, so export first if a season already ran):
--   drop table if exists public.progress_snapshots;
--   drop function if exists arena_private.progress_snapshots_no_update();

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

create table if not exists public.progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- THE SERVER CLOCK. Nothing a client sends ever sets this.
  created_at timestamptz not null default now(),
  -- characters.revision when the snapshot was taken (read by the function, not sent by the client).
  save_revision integer not null default 0,
  schema_version integer not null default 0,
  app_version text,
  -- ProgressMetrics (supabase/functions/_shared/progress/metrics.ts) plus the running "peak" of the never-decreasing counters. Never the save itself.
  metrics jsonb not null,
  -- sha-256 (hex) of the canonical metrics JSON: lets the owner see at a glance that two rows carry the same numbers.
  metrics_hash text not null,
  verdict text not null,
  -- Stable reason codes (docs/SEASON_RANKING.md). Empty for an 'ok' verdict.
  reasons text[] not null default '{}',
  constraint progress_snapshots_verdict_check check (verdict in ('ok', 'flagged', 'rejected')),
  constraint progress_snapshots_hash_check check (pg_catalog.char_length(metrics_hash) = 64)
);

create index if not exists progress_snapshots_user_created_idx on public.progress_snapshots (user_id, created_at desc);
-- "the first accepted snapshot of a user" and "the last accepted one" are the two lookups the function does on every call.
create index if not exists progress_snapshots_user_accepted_idx on public.progress_snapshots (user_id, created_at) where verdict <> 'rejected';

-- Append-only: even the service role cannot update a row (deleting is left to the account-erasure cascade and to the owner as database superuser).
create or replace function arena_private.progress_snapshots_no_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PROGRESS_SNAPSHOTS_APPEND_ONLY';
end;
$$;

revoke all on function arena_private.progress_snapshots_no_update() from public, anon, authenticated;

drop trigger if exists progress_snapshots_no_update on public.progress_snapshots;
create trigger progress_snapshots_no_update
  before update on public.progress_snapshots
  for each row
  execute function arena_private.progress_snapshots_no_update();

alter table public.progress_snapshots enable row level security;
-- Clients: SELECT of their own rows only. No insert, no update, no delete: only the Edge Function (service role) writes.
revoke all on table public.progress_snapshots from public, anon, authenticated;
grant select on table public.progress_snapshots to authenticated;
grant select, insert, delete on table public.progress_snapshots to service_role;

drop policy if exists progress_snapshots_select_own on public.progress_snapshots;
create policy progress_snapshots_select_own
  on public.progress_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. A signed-in client cannot write. Impersonate a normal user:
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<some user uuid>","role":"authenticated"}', true);
--      insert into public.progress_snapshots (user_id, metrics, metrics_hash, verdict) values ('<same uuid>', '{}', repeat('0', 64), 'ok');  -> permission denied
--      update public.progress_snapshots set verdict = 'ok';                                                                              -> permission denied
--      delete from public.progress_snapshots;                                                                                            -> permission denied
--    `select * from public.progress_snapshots;` returns that user's own rows only. As `anon` every statement fails, select included.
-- B. Append-only: as the owner (service role / postgres) insert a row, then `update public.progress_snapshots set verdict = 'ok' where ...;`
--    -> must fail with PROGRESS_SNAPSHOTS_APPEND_ONLY.
-- C. created_at is the database clock: insert without created_at and compare with now().
-- ---------------------------------------------------------------------------------------------------------------------------------------
