-- Server-owned entitlements (the Adventurer Pass).
--
-- Until now the Pass was a field in the editable client save (SaveData.hasBattlePass). From this migration on, when the game runs against
-- Supabase, ownership is decided ONLY by a row in public.entitlements, which only the service role (Edge Functions, or the owner in the SQL
-- editor) can write. Providers (Stripe now; Mercado Pago, crypto, a manual grant later) are just different values of `source`.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it (SQL editor or `supabase db push`) when ready.
--
-- Scope: this migration does not touch characters, profiles or any save data.
--
-- ROLLBACK (run by hand, in this order; it deletes every recorded entitlement, so export the rows first if any were sold):
--   drop function if exists arena_private.owns_adventurer_pass(uuid);
--   drop table if exists public.checkout_attempts;
--   drop table if exists public.payment_events;
--   drop table if exists public.entitlements;
--   drop function if exists arena_private.entitlements_guard();

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- entitlements: one row per thing a user owns because of a payment (or a manual grant).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  -- Who vouched for it. 'grant' = the owner inserted it by hand (testers, gifts, support). To add a provider later: alter the check.
  source text not null,
  -- The provider's own id of the payment (Stripe: the PaymentIntent id). For 'grant' any unique note, e.g. 'tester-2026-10-13-<name>'.
  provider_ref text not null,
  status text not null default 'active',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_kind_check check (kind in ('adventurer_pass')),
  constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'grant')),
  constraint entitlements_status_check check (status in ('active', 'refunded', 'revoked')),
  constraint entitlements_provider_ref_check check (pg_catalog.char_length(provider_ref) between 1 and 200),
  -- Idempotency: the same provider payment can never produce two rows, however many times a webhook is replayed.
  constraint entitlements_source_ref_unique unique (source, provider_ref)
);

-- At most one ACTIVE entitlement of a kind per user. A refunded/revoked row stays as history and does not block a new purchase.
create unique index if not exists entitlements_one_active_per_user_kind
  on public.entitlements (user_id, kind)
  where status = 'active';

create index if not exists entitlements_user_id_idx on public.entitlements (user_id);

-- Identity columns never change after insert (only status moves); updated_at follows the database clock.
create or replace function arena_private.entitlements_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.kind is distinct from old.kind
    or new.source is distinct from old.source
    or new.provider_ref is distinct from old.provider_ref
    or new.granted_at is distinct from old.granted_at then
    raise exception using errcode = '23514', message = 'ENTITLEMENT_IDENTITY_IMMUTABLE';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function arena_private.entitlements_guard() from public, anon, authenticated;

drop trigger if exists entitlements_guard on public.entitlements;
create trigger entitlements_guard
  before update on public.entitlements
  for each row
  execute function arena_private.entitlements_guard();

alter table public.entitlements enable row level security;
-- No privilege at all for the client roles except SELECT, and that one only through the policy below. There is deliberately NO insert,
-- update or delete policy (and no grant): only the service role (which bypasses RLS) writes here.
revoke all on table public.entitlements from public, anon, authenticated;
grant select on table public.entitlements to authenticated;
grant select, insert, update on table public.entitlements to service_role;

drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own
  on public.entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- For future server-side code (the season ranking RPCs): the one question "does this user own the Pass right now?".
-- Lives in the private schema, so a client cannot call it for someone else's id.
create or replace function arena_private.owns_adventurer_pass(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entitlements as e
    where e.user_id = p_user_id
      and e.kind = 'adventurer_pass'
      and e.status = 'active'
  );
$$;

revoke all on function arena_private.owns_adventurer_pass(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- payment_events: every webhook delivery, once. Idempotency (unique event id) and audit. Payload is MINIMAL on purpose (ids, type, status);
-- never store the raw event: it carries customer data we do not need.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  -- 'granted' | 'already_active' | 'reversed' | 'ignored' | 'unmatched' | 'error:<short reason>'
  result text,
  constraint payment_events_provider_event_unique unique (provider, event_id)
);

alter table public.payment_events enable row level security;
revoke all on table public.payment_events from public, anon, authenticated;
grant select, insert, update on table public.payment_events to service_role;
-- No policy: with RLS on and no policy, anon/authenticated see and change nothing.

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- checkout_attempts: the create-checkout function counts these to rate-limit one user. Service role only.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.checkout_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists checkout_attempts_user_created_idx on public.checkout_attempts (user_id, created_at desc);

alter table public.checkout_attempts enable row level security;
revoke all on table public.checkout_attempts from public, anon, authenticated;
grant select, insert, delete on table public.checkout_attempts to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. A signed-in client cannot write. In the SQL editor, impersonate a normal user:
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<some user uuid>","role":"authenticated"}', true);
--      insert into public.entitlements (user_id, kind, source, provider_ref) values ('<same uuid>', 'adventurer_pass', 'grant', 'x');
--        -> must fail: permission denied for table entitlements
--      update public.entitlements set status = 'active';          -> must fail: permission denied
--      delete from public.entitlements;                            -> must fail: permission denied
--      select * from public.payment_events;                        -> must fail: permission denied
--      select * from public.checkout_attempts;                     -> must fail: permission denied
--      select arena_private.owns_adventurer_pass('<uuid>');        -> must fail: permission denied for schema arena_private
--    Repeat with `set local role anon;` -> every statement above must fail, including select on entitlements.
--    Same checks from the game client (anon key + a user JWT) through the REST API: POST/PATCH/DELETE /rest/v1/entitlements -> 401/403.
--
-- B. A user reads only his own rows. As `authenticated` with sub = user A: `select * from public.entitlements;` returns A's rows only,
--    never B's (insert one row for each as the service role first).
--
-- C. Idempotency and the one-active rule (as the owner / service role):
--      insert into public.entitlements (user_id, kind, source, provider_ref) values ('<A>', 'adventurer_pass', 'grant', 'test-1');   -- ok
--      insert into public.entitlements (user_id, kind, source, provider_ref) values ('<A>', 'adventurer_pass', 'grant', 'test-1');   -- unique violation (source, provider_ref)
--      insert into public.entitlements (user_id, kind, source, provider_ref) values ('<A>', 'adventurer_pass', 'stripe', 'pi_test'); -- unique violation entitlements_one_active_per_user_kind
--      update public.entitlements set status = 'refunded' where provider_ref = 'test-1';
--      insert into public.entitlements (user_id, kind, source, provider_ref) values ('<A>', 'adventurer_pass', 'stripe', 'pi_test'); -- ok now
--      update public.entitlements set user_id = '<B>' where provider_ref = 'pi_test';                                                  -- ENTITLEMENT_IDENTITY_IMMUTABLE
--    Clean up the test rows afterwards.
--
-- D. Webhook idempotency: insert into public.payment_events (provider, event_id) values ('stripe', 'evt_test') twice -> the second fails
--    with a unique violation (the Edge Function relies on exactly this).
-- ---------------------------------------------------------------------------------------------------------------------------------------
