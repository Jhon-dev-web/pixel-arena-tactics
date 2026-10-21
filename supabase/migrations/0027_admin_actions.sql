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
