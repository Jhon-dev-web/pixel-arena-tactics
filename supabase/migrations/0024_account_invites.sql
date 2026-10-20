-- Invites live in the game, not in the e-mail list (depends on 0004 progress_snapshots, 0003 entitlements, 0016 referral tiers / config / email_canonical / waitlist_hit, 0020 admin_waitlist).
-- NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is run for real by admin/tests/sql/invites.integration.test.ts.
--
-- WHY. Nobody wants to receive e-mail, so the invite program can no longer hang on the waitlist. Every GAME ACCOUNT now has its own invite code, the friend's sign-up records WHO invited it on the
-- account itself, and the rewards are counted and granted by account. The rewards are exactly the same (arena_private.referral_rewards, 0016), and so are the qualification rule (a hero at
-- referral_config.min_hero_level in an accepted progress snapshot taken after referral_config.launch_at) and the "paying" rule (an active, live, paid Pass: the same sources as paid_pass_count).
--
--   * arena_private.invite_codes       one code per account (10 characters, the waitlist alphabet), created lazily by public.my_invite().
--   * arena_private.account_referrals  invited account -> inviter. Written ONCE (never changed afterwards except for qualified_at). A refused self-invite is kept with ignored_reason, for the audit.
--   * trigger on auth.users            the game's sign-up passes the code as user metadata { invite: CODE }; the trigger records the referral. It NEVER raises: any error is a warning, a sign-up cannot fail.
--   * public.claim_invite(code)        fallback for an account created in the last 24 h with no referral yet and no accepted snapshot above level 1. Idempotent.
--   * public.my_invite()               what the game shows (Convites): the account's code, counters, Pass goal and the rewards already granted (same shape as my_referral_status).
--   * the snapshot / entitlement triggers and referral_sweep() also process account referrals. The old waitlist referrals keep working untouched (no data is dropped); the game reads only this path.
--   * admin_waitlist() also reports account_referred / account_qualified.
--
-- Everything private: RLS on, no policy, every grant revoked. The client reaches the data only through the two security-definer functions below, which answer for auth.uid() and never take an id.
-- The owner must set arena_private.referral_config.launch_at (NULL = nothing qualifies, as before):  update arena_private.referral_config set launch_at = now();
--
-- ROLLBACK (by hand; it deletes the invite codes and the recorded account referrals; granted rewards stay):
--   drop trigger if exists account_referral_signup on auth.users;
--   drop function if exists arena_private.account_referral_on_signup();
--   drop function if exists public.claim_invite(text);
--   drop function if exists public.my_invite();
--   drop function if exists arena_private.account_referral_process_user(uuid);
--   drop function if exists arena_private.account_referral_grant(uuid);
--   drop function if exists arena_private.account_referral_qualify_user(uuid);
--   drop function if exists arena_private.account_referral_counts(uuid);
--   drop function if exists arena_private.account_referral_record(uuid, text);
--   drop function if exists arena_private.invite_code_for(uuid);
--   drop function if exists arena_private.new_invite_code();
--   drop table if exists arena_private.account_referrals;  drop table if exists arena_private.invite_codes;
--   (and re-run the 0016 blocks of referral_on_snapshot, referral_on_entitlement and referral_sweep, and the 0020 block of admin_waitlist)

create schema if not exists arena_private;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.invite_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint invite_codes_code_key unique (code),
  constraint invite_codes_code_shape check (code ~ '^[A-HJ-NP-Z2-9]{10}$')
);

alter table arena_private.invite_codes enable row level security;
revoke all on table arena_private.invite_codes from public, anon, authenticated;

-- user_id: the INVITED account. referrer_id: who invited it. ignored_reason: why it does not count ('self' = the same account, 'self_email' = the same person under another alias of the e-mail).
-- qualified_at: when the invited account reached the hero level (kept, so the counter never drops if the snapshots are purged later).
create table if not exists arena_private.account_referrals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  referrer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  ignored_reason text,
  qualified_at timestamptz,
  constraint account_referrals_reason_check check (ignored_reason is null or ignored_reason in ('self', 'self_email')),
  constraint account_referrals_not_self check (referrer_id <> user_id or ignored_reason is not null)
);

create index if not exists account_referrals_referrer_idx on arena_private.account_referrals (referrer_id);

alter table arena_private.account_referrals enable row level security;
revoke all on table arena_private.account_referrals from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Codes
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 10 characters of the waitlist alphabet (no I O 0 1). Random bytes of two UUIDs (bytes 6 and 8 of a UUID carry fixed version bits and are skipped); 32 symbols, so a byte modulo 32 has no bias.
create or replace function arena_private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  c_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_a bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  v_b bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  v_code text := '';
  i integer;
begin
  for i in 0..5 loop
    v_code := v_code || pg_catalog.substr(c_alphabet, (pg_catalog.get_byte(v_a, i) % 32) + 1, 1);
  end loop;
  for i in 9..12 loop
    v_code := v_code || pg_catalog.substr(c_alphabet, (pg_catalog.get_byte(v_b, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

revoke all on function arena_private.new_invite_code() from public, anon, authenticated;

-- The account's code; created the first time it is asked for. Safe under concurrency (the primary key decides) and under a random collision (retried).
create or replace function arena_private.invite_code_for(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_try integer := 0;
begin
  select c.code into v_code from arena_private.invite_codes as c where c.user_id = p_user_id;
  if v_code is not null then
    return v_code;
  end if;
  loop
    v_try := v_try + 1;
    begin
      insert into arena_private.invite_codes (user_id, code) values (p_user_id, arena_private.new_invite_code()) on conflict (user_id) do nothing;
      exit;
    exception when unique_violation then
      -- the random code collided with someone else's: try another one
      if v_try >= 8 then
        raise;
      end if;
    end;
  end loop;
  select c.code into v_code from arena_private.invite_codes as c where c.user_id = p_user_id;
  return v_code;
end;
$$;

revoke all on function arena_private.invite_code_for(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Recording. The ONE place a referral is written; used by the sign-up trigger and by claim_invite. Returns 'ok' | 'exists' | 'bad_code' | 'unknown_code' | 'ignored'.
--   'exists'  the account already has a referral row (the first one is final); 'ignored' = a self-invite, kept with its reason; 'unknown_code' / 'bad_code' write nothing (a later claim may still work).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.account_referral_record(p_user_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));
  v_referrer uuid;
  v_reason text;
  v_email_new text;
  v_email_ref text;
  v_n integer;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{10}$' then
    return 'bad_code';
  end if;
  if exists (select 1 from arena_private.account_referrals as a where a.user_id = p_user_id) then
    return 'exists';
  end if;
  select c.user_id into v_referrer from arena_private.invite_codes as c where c.code = v_code;
  if v_referrer is null then
    return 'unknown_code';
  end if;
  if v_referrer = p_user_id then
    v_reason := 'self';
  else
    select u.email into v_email_new from auth.users as u where u.id = p_user_id;
    select u.email into v_email_ref from auth.users as u where u.id = v_referrer;
    if v_email_new is not null and v_email_ref is not null and arena_private.email_canonical(v_email_new) = arena_private.email_canonical(v_email_ref) then
      v_reason := 'self_email';
    end if;
  end if;
  insert into arena_private.account_referrals (user_id, referrer_id, ignored_reason) values (p_user_id, v_referrer, v_reason) on conflict (user_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return 'exists';
  end if;
  return case when v_reason is null then 'ok' else 'ignored' end;
end;
$$;

revoke all on function arena_private.account_referral_record(uuid, text) from public, anon, authenticated;

-- The sign-up trigger. The game's sign-up sends { invite: CODE } as user metadata. NEVER raises: whatever goes wrong becomes a warning, so a sign-up cannot fail because of an invite.
create or replace function arena_private.account_referral_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform arena_private.account_referral_record(new.id, new.raw_user_meta_data ->> 'invite');
  exception when others then
    raise warning 'account_referral_record failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function arena_private.account_referral_on_signup() from public, anon, authenticated;

drop trigger if exists account_referral_signup on auth.users;
create trigger account_referral_signup
  after insert on auth.users
  for each row
  when (new.raw_user_meta_data ->> 'invite' is not null)
  execute function arena_private.account_referral_on_signup();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Counters of an inviter, live (a refunded Pass drops out at once). Aliases of the same person count once; an ignored referral never counts.
--   referred = counted invitations; qualified = invited accounts with qualified_at; paying = invited accounts holding an active, live, PAID Pass (same sources as paid_pass_count).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.account_referral_counts(p_user_id uuid)
returns table (referred integer, qualified integer, paying integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (pg_catalog.count(distinct x.canon))::integer,
    (pg_catalog.count(distinct x.canon) filter (where x.qualified_at is not null))::integer,
    (pg_catalog.count(distinct x.canon) filter (where exists (
      select 1
      from public.entitlements as e
      where e.user_id = x.user_id
        and e.kind = 'adventurer_pass' and e.status = 'active' and e.livemode
        and e.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol')
    )))::integer
  from (
    select a.user_id, a.qualified_at, coalesce(arena_private.email_canonical(u.email), a.user_id::text) as canon
    from arena_private.account_referrals as a
    join auth.users as u on u.id = a.user_id
    where a.referrer_id = p_user_id and a.ignored_reason is null
  ) as x
  where x.canon <> coalesce((select arena_private.email_canonical(s.email) from auth.users as s where s.id = p_user_id), '');
$$;

revoke all on function arena_private.account_referral_counts(uuid) from public, anon, authenticated;

-- Qualification of ONE invited account: a confirmed e-mail and an accepted ('ok') progress snapshot taken after launch_at with a hero at min_hero_level or more.
create or replace function arena_private.account_referral_qualify_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update arena_private.account_referrals as a
  set qualified_at = pg_catalog.now()
  from auth.users as u, arena_private.referral_config as c
  where a.user_id = p_user_id
    and u.id = a.user_id
    and u.email_confirmed_at is not null
    and a.ignored_reason is null
    and a.qualified_at is null
    and c.id and c.launch_at is not null and c.launch_at <= pg_catalog.now()
    and exists (
      select 1
      from public.progress_snapshots as s
      where s.user_id = a.user_id
        and s.verdict = 'ok'
        and s.created_at >= c.launch_at
        and (s.metrics ->> 'heroLevel')::numeric >= c.min_hero_level
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function arena_private.account_referral_qualify_user(uuid) from public, anon, authenticated;

-- Granting for one inviter ACCOUNT. Same rules as referral_grant (0016): every active tier reached and not held yet, once per account (unique user_id, metric, min_count), the free Pass inserted
-- with a fixed provider_ref (it can exist only once, and not for an account that already holds an active Pass), a reward is never withdrawn. The tiers are the same table the waitlist path uses.
create or replace function arena_private.account_referral_grant(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts record;
  v_tier record;
  v_entitlement uuid;
  v_granted integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('invite:' || p_user_id::text, 16));
  if not exists (select 1 from auth.users as u where u.id = p_user_id) then
    return 0;
  end if;
  select * into v_counts from arena_private.account_referral_counts(p_user_id);
  for v_tier in select * from arena_private.referral_rewards as r where r.active order by r.min_count loop
    if (case v_tier.metric when 'paying' then v_counts.paying else v_counts.qualified end) < v_tier.min_count then
      continue;
    end if;
    if exists (select 1 from public.referral_rewards_granted as g where g.user_id = p_user_id and g.metric = v_tier.metric and g.min_count = v_tier.min_count) then
      continue;
    end if;
    if v_tier.kind = 'pass' then
      v_entitlement := null;
      insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
      values (p_user_id, 'adventurer_pass', 'referral', 'referral-' || p_user_id::text, 'active', true)
      on conflict do nothing
      returning id into v_entitlement;
      if v_entitlement is null then
        continue;
      end if;
    end if;
    insert into public.referral_rewards_granted (user_id, metric, min_count, kind, reward_ref)
    values (p_user_id, v_tier.metric, v_tier.min_count, v_tier.kind, v_tier.reward_ref)
    on conflict do nothing;
    v_granted := v_granted + 1;
  end loop;
  return v_granted;
end;
$$;

revoke all on function arena_private.account_referral_grant(uuid) from public, anon, authenticated;

-- One account just did something that can matter (a snapshot, a Pass purchase): qualify his own referral, then grant to his inviter and to himself (he may be an inviter too).
create or replace function arena_private.account_referral_process_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
begin
  perform arena_private.account_referral_qualify_user(p_user_id);
  select a.referrer_id into v_referrer from arena_private.account_referrals as a where a.user_id = p_user_id and a.ignored_reason is null;
  if v_referrer is not null then
    perform arena_private.account_referral_grant(v_referrer);
  end if;
  perform arena_private.account_referral_grant(p_user_id);
end;
$$;

revoke all on function arena_private.account_referral_process_user(uuid) from public, anon, authenticated;

-- The 0016 triggers now process both paths. Each path has its own exception block: neither can block or undo a snapshot or a payment, and one failing does not stop the other.
create or replace function arena_private.referral_on_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform arena_private.referral_process_user(new.user_id);
  exception when others then
    raise warning 'referral_process_user failed: %', sqlerrm;
  end;
  begin
    perform arena_private.account_referral_process_user(new.user_id);
  exception when others then
    raise warning 'account_referral_process_user failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function arena_private.referral_on_snapshot() from public, anon, authenticated;

create or replace function arena_private.referral_on_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform arena_private.referral_process_user(new.user_id);
  exception when others then
    raise warning 'referral_process_user failed: %', sqlerrm;
  end;
  begin
    perform arena_private.account_referral_process_user(new.user_id);
  exception when others then
    raise warning 'account_referral_process_user failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function arena_private.referral_on_entitlement() from public, anon, authenticated;

-- The periodic job: the 0016 sweep plus the account referrals (qualify what the triggers missed, then grant every inviter). Service role only.
create or replace function public.referral_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_inviter uuid;
  v_total integer := 0;
begin
  for v_user in
    select u.id
    from public.waitlist as w
    join auth.users as u on pg_catalog.lower(u.email) = w.email::text
    where w.referred_by is not null and w.qualified_at is null
  loop
    v_total := v_total + arena_private.referral_qualify_user(v_user);
  end loop;
  for v_inviter in select distinct w.referred_by from public.waitlist as w where w.referred_by is not null loop
    v_total := v_total + arena_private.referral_grant(v_inviter);
  end loop;
  for v_user in select a.user_id from arena_private.account_referrals as a where a.ignored_reason is null and a.qualified_at is null loop
    v_total := v_total + arena_private.account_referral_qualify_user(v_user);
  end loop;
  for v_inviter in select distinct a.referrer_id from arena_private.account_referrals as a where a.ignored_reason is null loop
    v_total := v_total + arena_private.account_referral_grant(v_inviter);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.referral_sweep() from public, anon, authenticated;
grant execute on function public.referral_sweep() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- What the game reads and calls. Authenticated only; the account is auth.uid(), no id is ever passed in.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.my_invite()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text;
  v_counts record;
  v_goal integer;
begin
  if v_uid is null then
    return null;
  end if;
  v_code := arena_private.invite_code_for(v_uid);
  select * into v_counts from arena_private.account_referral_counts(v_uid);
  select r.min_count into v_goal from arena_private.referral_rewards as r where r.kind = 'pass' and r.metric = 'paying' and r.active order by r.min_count limit 1;
  return pg_catalog.jsonb_build_object(
    'code', v_code,
    'qualified', coalesce(v_counts.qualified, 0),
    'paying', coalesce(v_counts.paying, 0),
    'pass_goal', v_goal,
    'rewards', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind', g.kind, 'ref', g.reward_ref, 'metric', g.metric, 'min_count', g.min_count, 'granted_at', g.granted_at,
        'label_pt', coalesce(t.label_pt, g.reward_ref), 'label_en', coalesce(t.label_en, g.reward_ref)) order by g.granted_at)
      from public.referral_rewards_granted as g
      left join arena_private.referral_rewards as t on t.metric = g.metric and t.min_count = g.min_count
      where g.user_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_invite() from public, anon, authenticated;
grant execute on function public.my_invite() to authenticated;

-- The fallback for a sign-up whose metadata did not carry the code. Only for a NEW account: created in the last 24 hours, no referral yet, no accepted snapshot above level 1.
-- Returns {"status": "ok" | "exists" | "ignored" | "unknown_code" | "bad_code" | "too_old" | "too_late" | "rate_limited"}. Idempotent: a second call answers 'exists' and changes nothing.
create or replace function public.claim_invite(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_created timestamptz;
  v_status text;
begin
  if v_uid is null then
    return null;
  end if;
  if not arena_private.waitlist_hit('claim:' || v_uid::text, 3600, 20) then
    return pg_catalog.jsonb_build_object('status', 'rate_limited');
  end if;
  if exists (select 1 from arena_private.account_referrals as a where a.user_id = v_uid) then
    return pg_catalog.jsonb_build_object('status', 'exists');
  end if;
  select u.created_at into v_created from auth.users as u where u.id = v_uid;
  if v_created is null or v_created < pg_catalog.now() - interval '24 hours' then
    return pg_catalog.jsonb_build_object('status', 'too_old');
  end if;
  if exists (select 1 from public.progress_snapshots as s where s.user_id = v_uid and s.verdict = 'ok' and (s.metrics ->> 'heroLevel')::numeric > 1) then
    return pg_catalog.jsonb_build_object('status', 'too_late');
  end if;
  v_status := arena_private.account_referral_record(v_uid, p_code);
  return pg_catalog.jsonb_build_object('status', v_status);
end;
$$;

revoke all on function public.claim_invite(text) from public, anon, authenticated;
grant execute on function public.claim_invite(text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Admin: the waitlist report also carries the account referrals (totals.account_referred / account_qualified). Same function as 0020 plus those two numbers.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_waitlist(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_tz text;
  v_end date;
  v_start date;
  v_since timestamptz;
  v_totals jsonb;
  v_by_day jsonb;
  v_by_source jsonb;
  v_referrers jsonb;
  v_ignored jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_days := least(greatest(coalesce(p_days, 30), 1), 365);
  v_tz := arena_private.admin_cfg('timezone', 'America/Sao_Paulo');
  v_end := (now() at time zone v_tz)::date;
  v_start := v_end - (v_days - 1);
  v_since := v_start::timestamp at time zone v_tz;

  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where w.unsubscribed_at is null),
    'unsubscribed', count(*) filter (where w.unsubscribed_at is not null),
    'confirmed', count(*) filter (where w.confirmed_at is not null),
    'locale_pt', count(*) filter (where w.locale = 'pt'),
    'locale_en', count(*) filter (where w.locale = 'en'),
    'referred', count(*) filter (where w.referred_by is not null),
    'qualified', count(*) filter (where w.qualified_at is not null),
    'registered_in_game', count(*) filter (where exists (select 1 from auth.users as u where u.email = w.email::text))
  ) into v_totals
  from public.waitlist as w;

  -- 0024: invites that live in the game (arena_private.account_referrals). An ignored one (a self-invite) is not counted.
  v_totals := v_totals || jsonb_build_object(
    'account_referred', (select count(*) from arena_private.account_referrals as a where a.ignored_reason is null),
    'account_qualified', (select count(*) from arena_private.account_referrals as a where a.ignored_reason is null and a.qualified_at is not null)
  );

  select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day), '[]'::jsonb) into v_by_day
  from (select g::date as day from generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') as g) as d
  left join (
    select (w.created_at at time zone v_tz)::date as day, count(*) as n
    from public.waitlist as w
    where w.created_at >= v_since
    group by 1
  ) as c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'count', x.n) order by x.n desc, x.source), '[]'::jsonb) into v_by_source
  from (
    select coalesce(w.source, '(direto)') as source, count(*) as n
    from public.waitlist as w
    group by 1
    order by n desc
    limit 30
  ) as x;

  select coalesce(jsonb_agg(jsonb_build_object('referral_ignored', x.reason, 'count', x.n) order by x.n desc), '[]'::jsonb) into v_ignored
  from (
    select w.referral_ignored as reason, count(*) as n
    from public.waitlist as w
    where w.referral_ignored is not null
    group by 1
  ) as x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ref_code', t.ref_code,
    'email_masked', left(split_part(t.email, '@', 1), 2) || '***@' || split_part(t.email, '@', 2),
    'invited', t.invited,
    'qualified', t.qualified,
    'since', t.created_at
  ) order by t.invited desc, t.qualified desc, t.ref_code), '[]'::jsonb) into v_referrers
  from (
    select r.ref_code, r.email::text as email, r.created_at, count(*) as invited, count(*) filter (where i.qualified_at is not null) as qualified
    from public.waitlist as i
    join public.waitlist as r on r.id = i.referred_by
    group by r.id, r.ref_code, r.email, r.created_at
    order by count(*) desc, r.ref_code
    limit 20
  ) as t;

  return jsonb_build_object('days', v_days, 'totals', v_totals, 'by_day', v_by_day, 'by_source', v_by_source, 'referral_ignored', v_ignored, 'top_referrers', v_referrers);
end;
$$;

revoke all on function public.admin_waitlist(integer) from public, anon, authenticated;
grant execute on function public.admin_waitlist(integer) to authenticated;
