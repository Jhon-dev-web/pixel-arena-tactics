-- The owner's dashboard can ACT (depends on 0003 entitlements, 0020 admins / is_admin, 0016 waitlist_hit, 0024 new_invite_code, 0025 current_pass_season). NOT APPLIED from this repo: the owner runs it
-- (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is run for real by admin/tests/sql/{deleteuser,passgrant,promo}.integration.test.ts.
--
-- Until now the admin dashboard only read. This migration adds the three things the owner asked for, each one admin-only (public.is_admin(), raised as ADMIN_ONLY), server-side and AUDITED:
--
--   PART A  Delete an account.   arena_private.admin_audit (the audit log, append-only), public.admin_delete_user_prepare(user, typed name), public.admin_audit_record(...) (service role only).
--   PART B  Grant / revoke the Pass.   public.admin_grant_pass(user, note), public.admin_revoke_pass(user, note).
--   PART C  Promo codes.   arena_private.promo_codes / promo_redemptions, public.admin_create_promo_codes / admin_list_promo_codes / admin_disable_promo_code, and the player's public.redeem_promo_code(code).
--
-- Nothing here touches the game tables' data. Every new function is security definer with search_path = '', revoked from public / anon, and granted only to the role that needs it.
-- See each part's header for its rules, and docs/ADMIN.md (section "Ações do painel") for the operation guide.
--
-- ROLLBACK (by hand; it deletes the audit log and the promo codes, so export them first if they matter; Passes already given by codes stay as 'promo' rows, so revoke or re-source them before step 4):
--   1. drop function if exists public.redeem_promo_code(text);  drop function if exists public.admin_disable_promo_code(text);  drop function if exists public.admin_list_promo_codes();
--      drop function if exists public.admin_create_promo_codes(integer, text, integer, timestamptz, text);
--      drop function if exists arena_private.promo_attempts_blocked(uuid);  drop function if exists arena_private.promo_normalize(text);
--   2. drop table if exists arena_private.promo_redemptions;  drop table if exists arena_private.promo_codes;
--   3. drop function if exists public.admin_revoke_pass(uuid, text);  drop function if exists public.admin_grant_pass(uuid, text);  drop function if exists arena_private.admin_clean_note(text);
--   4. alter table public.entitlements drop constraint if exists entitlements_source_check;
--      alter table public.entitlements add constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant', 'referral'));   -- only when no 'promo' row exists
--   5. drop function if exists public.admin_audit_record(uuid, text, uuid, jsonb);  drop function if exists public.admin_delete_user_prepare(uuid, text);
--      drop trigger if exists admin_audit_append_only on arena_private.admin_audit;  drop table if exists arena_private.admin_audit;
--      drop function if exists arena_private.admin_audit_add(text, uuid, jsonb);  drop function if exists arena_private.admin_audit_append_only();

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

-- =======================================================================================================================================
-- PART A. The audit log and the deletion of an account.
-- =======================================================================================================================================
-- The audit log. admin_id and target_user are PLAIN uuids on purpose (no foreign key): a record of "who deleted whom" must survive the deletion of the target (and of the admin). Append-only: a trigger refuses
-- update and delete, so even the SQL editor needs `alter table ... disable trigger` to rewrite history (and that itself is a deliberate act).
create table if not exists arena_private.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  action text not null,
  target_user uuid,
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default pg_catalog.now(),
  constraint admin_audit_action_shape check (action ~ '^[a-z_]{3,48}$')
);

create index if not exists admin_audit_at_idx on arena_private.admin_audit (at desc);
create index if not exists admin_audit_target_idx on arena_private.admin_audit (target_user, at desc);

alter table arena_private.admin_audit enable row level security;
revoke all on table arena_private.admin_audit from public, anon, authenticated;

create or replace function arena_private.admin_audit_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'ADMIN_AUDIT_APPEND_ONLY';
end;
$$;

revoke all on function arena_private.admin_audit_append_only() from public, anon, authenticated;

drop trigger if exists admin_audit_append_only on arena_private.admin_audit;
create trigger admin_audit_append_only
  before update or delete on arena_private.admin_audit
  for each row execute function arena_private.admin_audit_append_only();

-- The one writer of the log for the SQL functions below (they all check is_admin() first).
create or replace function arena_private.admin_audit_add(p_action text, p_target uuid, p_details jsonb)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into arena_private.admin_audit (admin_id, action, target_user, details)
  values ((select auth.uid()), p_action, p_target, coalesce(p_details, '{}'::jsonb))
  returning id;
$$;

revoke all on function arena_private.admin_audit_add(text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_delete_user_prepare(p_user, p_confirm): the database half of "delete this account". It is called by the Edge Function admin-delete-user WITH THE CALLER'S OWN JWT, so auth.uid() is the admin.
-- It decides everything and writes the audit row; the function then deletes the auth user with the service key (cascades remove the game data).
--   * not an admin                       -> ADMIN_ONLY (42501)
--   * the target is the caller           -> ADMIN_DELETE_SELF;  the target is any admin -> ADMIN_DELETE_ADMIN (remove the row from arena_private.admins first, by hand)
--   * the account does not exist         -> USER_NOT_FOUND
--   * p_confirm is not the account's username or hero name (case-insensitive; an account with neither: its full e-mail) -> CONFIRM_MISMATCH
--   * the deletion would be refused by a foreign key (a DRY RUN inside a rolled-back sub-transaction finds out; it changes nothing) -> returns {status:'blocked', constraint, table} and writes an audit row 'delete_user_blocked'
--   * otherwise writes the audit row 'delete_user' (BEFORE anything is deleted) and returns {status:'ok', user_id, username, hero_name, audit_id}.
-- Failed validation raises (nothing is written); 'blocked' returns so its audit row is kept.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_delete_user_prepare(p_user uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_confirm text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_confirm, '')));
  v_email text;
  v_username text;
  v_hero text;
  v_created timestamptz;
  v_expected text[];
  v_audit bigint;
  v_constraint text;
  v_table text;
  v_blocked boolean := false;
  v_state text;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_admin := (select auth.uid());
  if p_user is null then
    raise exception using errcode = '22023', message = 'USER_NOT_FOUND';
  end if;
  if p_user = v_admin then
    raise exception using errcode = '22023', message = 'ADMIN_DELETE_SELF';
  end if;
  if exists (select 1 from arena_private.admins as a where a.user_id = p_user) then
    raise exception using errcode = '22023', message = 'ADMIN_DELETE_ADMIN';
  end if;
  select u.email, u.created_at into v_email, v_created from auth.users as u where u.id = p_user;
  if not found then
    raise exception using errcode = '22023', message = 'USER_NOT_FOUND';
  end if;
  select p.username into v_username from public.profiles as p where p.user_id = p_user;
  select c.hero_name into v_hero from public.characters as c where c.user_id = p_user;

  v_expected := pg_catalog.array_remove(array[pg_catalog.lower(pg_catalog.btrim(coalesce(v_username, ''))), pg_catalog.lower(pg_catalog.btrim(coalesce(v_hero, '')))], '');
  if pg_catalog.cardinality(v_expected) = 0 and v_email is not null then
    v_expected := array[pg_catalog.lower(pg_catalog.btrim(v_email))];
  end if;
  if v_confirm = '' or not (v_confirm = any (v_expected)) then
    raise exception using errcode = '22023', message = 'CONFIRM_MISMATCH';
  end if;

  -- The dry run: delete inside a sub-transaction that is ALWAYS rolled back (the block raises on purpose). If a foreign key without a cascade (or a guard trigger) would stop the real deletion,
  -- the owner is told now, before anything is half done.
  begin
    delete from auth.users as u where u.id = p_user;
    raise exception using errcode = 'P0001', message = 'DELETE_DRY_RUN_OK';
  exception
    when foreign_key_violation then
      v_blocked := true;
      get stacked diagnostics v_constraint = constraint_name, v_table = table_name;
    when others then
      get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name, v_table = table_name;
      if sqlerrm is distinct from 'DELETE_DRY_RUN_OK' then
        v_blocked := true;
      end if;
  end;

  if v_blocked then
    perform arena_private.admin_audit_add('delete_user_blocked', p_user, pg_catalog.jsonb_build_object('username', v_username, 'constraint', v_constraint, 'table', v_table, 'sqlstate', v_state));
    return pg_catalog.jsonb_build_object('status', 'blocked', 'constraint', v_constraint, 'table', v_table);
  end if;

  v_audit := arena_private.admin_audit_add(
    'delete_user',
    p_user,
    pg_catalog.jsonb_build_object(
      'username', v_username,
      'hero_name', v_hero,
      -- masked: enough to recognise the account later, not the address
      'email_masked', case when v_email is null then null else pg_catalog.left(v_email, 2) || '***' || pg_catalog.substr(v_email, pg_catalog.strpos(v_email, '@')) end,
      'account_created_at', v_created
    )
  );
  return pg_catalog.jsonb_build_object('status', 'ok', 'user_id', p_user, 'username', v_username, 'hero_name', v_hero, 'audit_id', v_audit);
end;
$$;

revoke all on function public.admin_delete_user_prepare(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_user_prepare(uuid, text) to authenticated;

-- What the Edge Function writes AFTER trying the deletion with the service key: 'delete_user_done' or 'delete_user_failed'. Service role only (a player or an admin cannot forge a line of the log through it).
create or replace function public.admin_audit_record(p_admin uuid, p_action text, p_target uuid, p_details jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_action is null or p_action not in ('delete_user_done', 'delete_user_failed') then
    raise exception using errcode = '22023', message = 'AUDIT_BAD_ACTION';
  end if;
  if p_admin is null or not exists (select 1 from arena_private.admins as a where a.user_id = p_admin) then
    raise exception using errcode = '22023', message = 'AUDIT_BAD_ADMIN';
  end if;
  insert into arena_private.admin_audit (admin_id, action, target_user, details)
  values (p_admin, p_action, p_target, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_audit_record(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_audit_record(uuid, text, uuid, jsonb) to service_role;

-- =======================================================================================================================================
-- PART B. Grant and revoke the Adventurer Pass by hand.
-- =======================================================================================================================================
-- A note is mandatory on both (3 to 300 characters): it goes into the audit row, so "why" is never lost.
create or replace function arena_private.admin_clean_note(p_note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  if v_note is null or pg_catalog.char_length(v_note) < 3 then
    raise exception using errcode = '22023', message = 'ADMIN_NOTE_REQUIRED';
  end if;
  if pg_catalog.char_length(v_note) > 300 then
    raise exception using errcode = '22023', message = 'ADMIN_NOTE_TOO_LONG';
  end if;
  return v_note;
end;
$$;

revoke all on function arena_private.admin_clean_note(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_grant_pass(p_user, p_note): gives the account an Adventurer Pass for the CURRENT season (arena_private.current_pass_season(); the 0025 trigger stamps valid_through_season on insert, whoever inserts).
--   * source 'grant', livemode true: the same rows the owner used to insert by hand. They give the perks, count for the ranking (owns_ranking_pass lets 'grant' in) and do NOT count in paid_pass_count / the goal / the revenue.
--   * idempotent: an account that already holds an active Pass covering the current season gets {status:'already'} and nothing is written (no second Pass, no audit row for a non-event).
--   * the audit row 'grant_pass' carries the note, the season and the entitlement id.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_grant_pass(p_user uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_season integer;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_note := arena_private.admin_clean_note(p_note);
  if p_user is null or not exists (select 1 from auth.users as u where u.id = p_user) then
    raise exception using errcode = '22023', message = 'USER_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin_pass:' || p_user::text, 27));
  v_season := arena_private.current_pass_season();
  if exists (
    select 1 from public.entitlements as e
    where e.user_id = p_user and e.kind = 'adventurer_pass' and e.status = 'active' and e.valid_through_season >= v_season
  ) then
    return pg_catalog.jsonb_build_object('status', 'already', 'season', v_season);
  end if;

  begin
    insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
    values (p_user, 'adventurer_pass', 'grant', 'admin-grant-' || pg_catalog.gen_random_uuid()::text, 'active', true)
    returning id into v_id;
  exception when unique_violation then
    -- the one-active-Pass-per-season index won a race with a purchase: nothing to add
    return pg_catalog.jsonb_build_object('status', 'already', 'season', v_season);
  end;

  perform arena_private.admin_audit_add('grant_pass', p_user, pg_catalog.jsonb_build_object('note', v_note, 'season', v_season, 'entitlement_id', v_id));
  return pg_catalog.jsonb_build_object('status', 'granted', 'season', v_season, 'entitlement_id', v_id);
end;
$$;

revoke all on function public.admin_grant_pass(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_grant_pass(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_revoke_pass(p_user, p_note): marks the account's active Pass(es) that cover the CURRENT season as 'revoked' (history stays). Any source: a paid Pass revoked here is not refunded by this function
-- (that is money, done by hand); the answer lists the sources revoked so the audit row and the screen say what was taken away. An older Pass that no longer covers anything is left alone.
--   {status:'revoked', season, sources:[...]} | {status:'none', season} (nothing to revoke: no audit row)
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_revoke_pass(p_user uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_season integer;
  v_sources text[];
  v_ids uuid[];
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_note := arena_private.admin_clean_note(p_note);
  if p_user is null or not exists (select 1 from auth.users as u where u.id = p_user) then
    raise exception using errcode = '22023', message = 'USER_NOT_FOUND';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('admin_pass:' || p_user::text, 27));
  v_season := arena_private.current_pass_season();

  with revoked as (
    update public.entitlements as e
       set status = 'revoked'
     where e.user_id = p_user and e.kind = 'adventurer_pass' and e.status = 'active' and e.valid_through_season >= v_season
    returning e.id, e.source
  )
  select pg_catalog.array_agg(r.source order by r.source), pg_catalog.array_agg(r.id) into v_sources, v_ids from revoked as r;

  if v_ids is null then
    return pg_catalog.jsonb_build_object('status', 'none', 'season', v_season);
  end if;
  perform arena_private.admin_audit_add('revoke_pass', p_user, pg_catalog.jsonb_build_object('note', v_note, 'season', v_season, 'sources', v_sources, 'entitlement_ids', v_ids));
  return pg_catalog.jsonb_build_object('status', 'revoked', 'season', v_season, 'sources', v_sources);
end;
$$;

revoke all on function public.admin_revoke_pass(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_pass(uuid, text) to authenticated;

-- =======================================================================================================================================
-- PART C. Promo codes.
-- =======================================================================================================================================
-- The owner generates codes in the dashboard; a player types one in Settings > "Codigo promocional". For now a code gives ONE thing: the Adventurer Pass (reward_kind 'pass').
--
--   * Gold / Aether are NOT rewards here on purpose. The server never writes the save: gold and Aether live in the client save, and submit-progress only BOUNDS what a save may claim from play (time, floors, drops).
--     There is no server-side "credit" that the bounds add to the allowance (referral cosmetics and titles are applied by the client from a server-granted record, and carry no number the bounds see). A promo
--     amount would therefore either be rejected as impossible progress or be a free edit of the save. What it would take: a server-owned credit ledger (a table of granted amounts) that submit-progress adds to
--     the allowed total, and a claim step that moves it into the save. Not built here.
--   * The Pass a code gives is an entitlement with source 'promo' (livemode true), stamped with the current season by the 0025 trigger. RANKING: it counts, exactly like a 'grant' (owns_ranking_pass only asks
--     livemode or 'grant', and the row is livemode). It does NOT count in paid_pass_count (the goal and the public meter), in the revenue (card / USDC only) or as a "paying" friend in the invite rewards:
--     all three list their sources explicitly and 'promo' is not among them.
--   * Codes are 10 characters of the invite alphabet (no I O 0 1), random (gen_random_uuid bytes). They all have the same length, so none is a prefix of another.
--   * A code works for `max_uses` accounts (one use per account), until `expires_at` (null = no expiry), while `active`.
--   * Guessing is rate limited per account: every attempt that does not end in a redemption counts, 10 per hour (arena_private.waitlist_limits, bucket 'promo:<user>'); the 11th is refused even with a good code.
--     The answers: invalid (unknown or disabled), expired, exhausted, already_redeemed, already_has_pass, rate_limited.
--   * A player who already holds a Pass covering the current season gets 'already_has_pass' and the code is NOT consumed.

create table if not exists arena_private.promo_codes (
  code text primary key,
  reward_kind text not null,
  max_uses integer not null,
  uses integer not null default 0,
  expires_at timestamptz,
  -- plain uuid, like the audit log: who made the code outlives the account
  created_by uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  note text not null,
  active boolean not null default true,
  constraint promo_codes_code_shape check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  constraint promo_codes_reward_check check (reward_kind in ('pass')),
  constraint promo_codes_max_uses_check check (max_uses between 1 and 100000),
  constraint promo_codes_uses_check check (uses between 0 and max_uses),
  constraint promo_codes_note_check check (pg_catalog.char_length(note) between 3 and 300)
);

create index if not exists promo_codes_created_idx on arena_private.promo_codes (created_at desc);

alter table arena_private.promo_codes enable row level security;
revoke all on table arena_private.promo_codes from public, anon, authenticated;

create table if not exists arena_private.promo_redemptions (
  code text not null references arena_private.promo_codes (code),
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default pg_catalog.now(),
  constraint promo_redemptions_unique unique (code, user_id)
);

create index if not exists promo_redemptions_user_idx on arena_private.promo_redemptions (user_id);

alter table arena_private.promo_redemptions enable row level security;
revoke all on table arena_private.promo_redemptions from public, anon, authenticated;

-- 'promo' is a source of entitlements (everything the earlier migrations allowed, plus this one).
alter table public.entitlements drop constraint if exists entitlements_source_check;
alter table public.entitlements
  add constraint entitlements_source_check check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant', 'referral', 'promo'));

-- The code as a player may type it ("abcde-fghjk", spaces, lower case) -> the canonical 10 characters, or null when it cannot be a code.
create or replace function arena_private.promo_normalize(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')) ~ '^[A-HJ-NP-Z2-9]{10}$'
              then pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')) end;
$$;

revoke all on function arena_private.promo_normalize(text) from public, anon, authenticated;

-- Has this account used up its 10 attempts of the current hour? Reads the same fixed window waitlist_hit counts in (it does not count by itself).
create or replace function arena_private.promo_attempts_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select l.hits
    from arena_private.waitlist_limits as l
    where l.bucket = 'promo:' || p_user::text
      and l.window_start = pg_catalog.to_timestamp(pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now()) / 3600) * 3600)
  ), 0) >= 10;
$$;

revoke all on function arena_private.promo_attempts_blocked(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_create_promo_codes(p_count, p_reward, p_max_uses, p_expires_at, p_note) -> {codes: [...]}
--   1 to 500 codes per call; reward 'pass'; max_uses 1 to 100000; expiry in the future or null; a note (3 to 300). Audited ('create_promo_codes'); the codes themselves are not copied into the audit log.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_create_promo_codes(p_count integer, p_reward text, p_max_uses integer, p_expires_at timestamptz, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_admin uuid;
  v_codes text[] := '{}';
  v_code text;
  v_try integer;
  i integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_admin := (select auth.uid());
  v_note := arena_private.admin_clean_note(p_note);
  if p_count is null or p_count < 1 or p_count > 500 then
    raise exception using errcode = '22023', message = 'PROMO_BAD_COUNT';
  end if;
  if p_reward is null or p_reward not in ('pass') then
    raise exception using errcode = '22023', message = 'PROMO_BAD_REWARD';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 100000 then
    raise exception using errcode = '22023', message = 'PROMO_BAD_MAX_USES';
  end if;
  if p_expires_at is not null and p_expires_at <= pg_catalog.now() then
    raise exception using errcode = '22023', message = 'PROMO_BAD_EXPIRY';
  end if;

  for i in 1..p_count loop
    v_try := 0;
    loop
      v_try := v_try + 1;
      v_code := arena_private.new_invite_code();
      begin
        insert into arena_private.promo_codes (code, reward_kind, max_uses, expires_at, created_by, note)
        values (v_code, p_reward, p_max_uses, p_expires_at, v_admin, v_note);
        exit;
      exception when unique_violation then
        if v_try >= 8 then
          raise;
        end if;
      end;
    end loop;
    v_codes := pg_catalog.array_append(v_codes, v_code);
  end loop;

  perform arena_private.admin_audit_add(
    'create_promo_codes',
    null,
    pg_catalog.jsonb_build_object('count', p_count, 'reward', p_reward, 'max_uses', p_max_uses, 'expires_at', p_expires_at, 'note', v_note)
  );
  return pg_catalog.jsonb_build_object('codes', pg_catalog.to_jsonb(v_codes));
end;
$$;

revoke all on function public.admin_create_promo_codes(integer, text, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.admin_create_promo_codes(integer, text, integer, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_list_promo_codes() -> the newest 1000 codes: code, reward, uses / max, expiry, created, note and a status (active | disabled | expired | exhausted) computed now.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_list_promo_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(x.j order by x.created_at desc, x.code)
    from (
      select
        c.created_at,
        c.code,
        pg_catalog.jsonb_build_object(
          'code', c.code,
          'reward_kind', c.reward_kind,
          'max_uses', c.max_uses,
          'uses', c.uses,
          'expires_at', c.expires_at,
          'active', c.active,
          'created_at', c.created_at,
          'created_by', c.created_by,
          'note', c.note,
          'last_redeemed_at', (select pg_catalog.max(r.at) from arena_private.promo_redemptions as r where r.code = c.code),
          'status', case
            when not c.active then 'disabled'
            when c.expires_at is not null and c.expires_at <= pg_catalog.now() then 'expired'
            when c.uses >= c.max_uses then 'exhausted'
            else 'active'
          end
        ) as j
      from arena_private.promo_codes as c
      order by c.created_at desc, c.code
      limit 1000
    ) as x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_promo_codes() from public, anon, authenticated;
grant execute on function public.admin_list_promo_codes() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_disable_promo_code(p_code): stops a code from being redeemed (redemptions already made stay). Idempotent. Audited ('disable_promo_code', with the code: the log is admin-only).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_disable_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_active boolean;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_code := arena_private.promo_normalize(p_code);
  if v_code is null then
    raise exception using errcode = '22023', message = 'PROMO_NOT_FOUND';
  end if;
  select c.active into v_active from arena_private.promo_codes as c where c.code = v_code for update;
  if not found then
    raise exception using errcode = '22023', message = 'PROMO_NOT_FOUND';
  end if;
  if not v_active then
    return pg_catalog.jsonb_build_object('status', 'already');
  end if;
  update arena_private.promo_codes as c set active = false where c.code = v_code;
  perform arena_private.admin_audit_add('disable_promo_code', null, pg_catalog.jsonb_build_object('code', v_code));
  return pg_catalog.jsonb_build_object('status', 'disabled');
end;
$$;

revoke all on function public.admin_disable_promo_code(text) from public, anon, authenticated;
grant execute on function public.admin_disable_promo_code(text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.redeem_promo_code(p_code): the player's side. Answers for auth.uid() only (an id is never taken from the call).
--   {status:'ok', reward:'pass', season}                  redeemed: uses + 1, one redemption row, and the Pass (source 'promo') for the current season
--   {status:'invalid'}          not a code, unknown, or disabled          {status:'expired'}     past expires_at
--   {status:'exhausted'}        uses reached max_uses                      {status:'already_redeemed'}  this account used this code already
--   {status:'already_has_pass'} he already holds a Pass for the current season: the code is NOT consumed
--   {status:'rate_limited'}     10 attempts that did not redeem in the last hour (the answer comes BEFORE the code is looked at)
-- Every answer that is not 'ok' and not 'rate_limited' counts as an attempt. The code row is locked (FOR UPDATE), so two accounts racing for the last use cannot both win, and the account is locked too.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
  v_row arena_private.promo_codes%rowtype;
  v_season integer;
  v_status text;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if arena_private.promo_attempts_blocked(v_user) then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promo_user:' || v_user::text, 27));

  v_code := arena_private.promo_normalize(p_code);
  if v_code is null then
    v_status := 'invalid';
  else
    select * into v_row from arena_private.promo_codes as c where c.code = v_code for update;
    if not found or not v_row.active then
      v_status := 'invalid';
    elsif v_row.expires_at is not null and v_row.expires_at <= pg_catalog.now() then
      v_status := 'expired';
    elsif exists (select 1 from arena_private.promo_redemptions as r where r.code = v_code and r.user_id = v_user) then
      v_status := 'already_redeemed';
    elsif v_row.uses >= v_row.max_uses then
      v_status := 'exhausted';
    else
      v_season := arena_private.current_pass_season();
      if exists (
        select 1 from public.entitlements as e
        where e.user_id = v_user and e.kind = 'adventurer_pass' and e.status = 'active' and e.valid_through_season >= v_season
      ) then
        v_status := 'already_has_pass';
      else
        begin
          update arena_private.promo_codes as c set uses = c.uses + 1 where c.code = v_code;
          insert into arena_private.promo_redemptions (code, user_id) values (v_code, v_user);
          insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
          values (v_user, 'adventurer_pass', 'promo', 'promo-' || v_code || '-' || v_user::text, 'active', true);
          return pg_catalog.jsonb_build_object('status', 'ok', 'reward', v_row.reward_kind, 'season', v_season);
        exception when unique_violation then
          -- a purchase landed between the check and the insert (the one-active-Pass-per-season index): the use and the redemption above are rolled back with this block
          v_status := 'already_has_pass';
        end;
      end if;
    end if;
  end if;

  perform arena_private.waitlist_hit('promo:' || v_user::text, 3600, 10);
  return pg_catalog.jsonb_build_object('status', v_status);
end;
$$;

revoke all on function public.redeem_promo_code(text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(text) to authenticated;
