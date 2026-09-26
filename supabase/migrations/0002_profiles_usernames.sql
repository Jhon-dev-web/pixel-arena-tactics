-- Permanent account usernames. This migration intentionally does not modify characters or SaveData.

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

create table if not exists arena_private.reserved_usernames (
  username_normalized text primary key,
  constraint reserved_usernames_format_check
    check (username_normalized ~ '^[a-z0-9_]{3,16}$')
);

alter table arena_private.reserved_usernames enable row level security;
revoke all on table arena_private.reserved_usernames from public, anon, authenticated;

insert into arena_private.reserved_usernames (username_normalized)
values
  ('admin'),
  ('administrator'),
  ('mod'),
  ('moderator'),
  ('support'),
  ('staff'),
  ('system'),
  ('root'),
  ('official'),
  ('help'),
  ('security'),
  ('arena'),
  ('arenaduel'),
  ('arena_duel'),
  ('null'),
  ('undefined')
on conflict (username_normalized) do nothing;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text,
  username_normalized text generated always as (pg_catalog.lower(username)) stored,
  created_at timestamptz not null default now(),
  username_set_at timestamptz,
  constraint profiles_username_format_check
    check (
      username is null
      or (
        pg_catalog.char_length(username) between 3 and 16
        and username ~ '^[A-Za-z0-9_]{3,16}$'
        and username = pg_catalog.btrim(username)
      )
    ),
  constraint profiles_username_set_at_check
    check ((username is null) = (username_set_at is null)),
  constraint profiles_username_normalized_unique unique (username_normalized)
);

-- Existing Auth accounts receive an empty profile. No character row or save field is read or changed.
insert into public.profiles (user_id)
select users.id
from auth.users as users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Every profile starts empty; a username can only be added once, by the claim RPC.
--
-- IMPORTANT: username_normalized is GENERATED ALWAYS ... STORED. Inside a BEFORE trigger, a stored
-- generated column has NOT been (re)computed yet — NEW.username_normalized still holds the row's
-- previous value (or NULL on INSERT), never the value that will actually be stored for NEW.username.
-- This function must never read NEW.username_normalized for that reason; every check below is derived
-- from the base columns (username, username_set_at, user_id) instead, which is sufficient because
-- username_normalized is a pure, deterministic function of username.
create or replace function arena_private.profiles_guard_username_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized text;
begin
  if tg_op = 'INSERT' then
    if new.username is not null or new.username_set_at is not null then
      raise exception using errcode = '23514', message = 'USERNAME_MUST_BE_CLAIMED';
    end if;
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception using errcode = '23514', message = 'PROFILE_OWNER_IMMUTABLE';
  end if;

  if old.username is not null then
    if new.username is distinct from old.username
      or new.username_set_at is distinct from old.username_set_at then
      raise exception using errcode = '23514', message = 'USERNAME_IMMUTABLE';
    end if;
    return new;
  end if;

  if new.username is null then
    if new.username_set_at is distinct from old.username_set_at then
      raise exception using errcode = '23514', message = 'USERNAME_MUST_BE_CLAIMED';
    end if;
    return new;
  end if;

  v_normalized := pg_catalog.lower(new.username);
  if new.username <> pg_catalog.btrim(new.username)
    or pg_catalog.char_length(new.username) not between 3 and 16
    or new.username !~ '^[A-Za-z0-9_]{3,16}$'
    or new.username_set_at is null
    or exists (
      select 1
      from arena_private.reserved_usernames as reserved
      where reserved.username_normalized = v_normalized
    ) then
    raise exception using errcode = '23514', message = 'INVALID_USERNAME';
  end if;

  return new;
end;
$$;

revoke all on function arena_private.profiles_guard_username_identity() from public, anon, authenticated;

drop trigger if exists profiles_guard_username_identity on public.profiles;
create trigger profiles_guard_username_identity
  before insert or update on public.profiles
  for each row
  execute function arena_private.profiles_guard_username_identity();

create or replace function public.check_username_availability(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := pg_catalog.btrim(p_username);
  v_normalized text;
begin
  if v_user_id is null then
    return 'NOT_AUTHENTICATED';
  end if;

  if v_username is null
    or pg_catalog.char_length(v_username) not between 3 and 16
    or v_username !~ '^[A-Za-z0-9_]{3,16}$' then
    return 'INVALID_USERNAME';
  end if;

  v_normalized := pg_catalog.lower(v_username);

  if exists (
    select 1
    from arena_private.reserved_usernames as reserved
    where reserved.username_normalized = v_normalized
  ) then
    return 'INVALID_USERNAME';
  end if;

  if exists (
    select 1
    from public.profiles as own_profile
    where own_profile.user_id = v_user_id
      and own_profile.username is not null
  ) then
    return 'USERNAME_ALREADY_SET';
  end if;

  if exists (
    select 1
    from public.profiles as profile
    where profile.username_normalized = v_normalized
  ) then
    return 'USERNAME_TAKEN';
  end if;

  return 'AVAILABLE';
end;
$$;

revoke all on function public.check_username_availability(text) from public, anon, authenticated;
grant execute on function public.check_username_availability(text) to authenticated;

create or replace function public.claim_username(p_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_username text := pg_catalog.btrim(p_username);
  v_normalized text;
  v_existing_username text;
  v_rows integer;
  v_constraint_name text;
begin
  if v_user_id is null then
    return 'NOT_AUTHENTICATED';
  end if;

  if v_username is null
    or pg_catalog.char_length(v_username) not between 3 and 16
    or v_username !~ '^[A-Za-z0-9_]{3,16}$' then
    return 'INVALID_USERNAME';
  end if;

  v_normalized := pg_catalog.lower(v_username);

  if exists (
    select 1
    from arena_private.reserved_usernames as reserved
    where reserved.username_normalized = v_normalized
  ) then
    return 'INVALID_USERNAME';
  end if;

  -- Create an empty row if needed, then serialize claims made by multiple sessions for this account.
  insert into public.profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select profile.username
  into v_existing_username
  from public.profiles as profile
  where profile.user_id = v_user_id
  for update;

  if v_existing_username is not null then
    return 'USERNAME_ALREADY_SET';
  end if;

  begin
    update public.profiles as profile
    set username = v_username,
        username_set_at = pg_catalog.clock_timestamp()
    where profile.user_id = v_user_id
      and profile.username is null;

    get diagnostics v_rows = row_count;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = 'profiles_username_normalized_unique' then
        return 'USERNAME_TAKEN';
      end if;
      raise;
  end;

  if v_rows <> 1 then
    return 'USERNAME_ALREADY_SET';
  end if;

  return 'SUCCESS';
end;
$$;

revoke all on function public.claim_username(text) from public, anon, authenticated;
grant execute on function public.claim_username(text) to authenticated;
