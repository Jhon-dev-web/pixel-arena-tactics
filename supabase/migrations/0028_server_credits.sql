-- Promo codes can give Gold, Eter (shards) and potions, not only the Pass (depends on 0027 promo codes / admin audit, 0007 progress functions). NOT APPLIED from this repo: the owner runs it
-- (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is run for real by admin/tests/sql/credits.integration.test.ts (an in-memory Postgres).
--
-- THE PROBLEM THIS SOLVES. Gold, Eter and potions live in the client save; the server never writes the save, and submit-progress only BOUNDS what a save may claim from play. A promo amount typed into the
-- save by the server would be impossible progress; a number the client invents is a free edit. So the server keeps a CREDIT LEDGER (arena_private.server_credits): a redemption inserts one row, the game CLAIMS
-- its rows (public.claim_server_credits) and applies each one to the save exactly once, and submit-progress adds the claimed-and-not-yet-counted credits to what a save may gain (see
-- supabase/functions/_shared/progress/evaluate.ts), so a promo reward never flags the player and a forged jump with no credit does.
--
--   PART A  arena_private.server_credits (the ledger) + the checks of what a credit may be.
--   PART B  arena_private.promo_codes learns reward_kind 'gold' | 'shards' | 'consumable' (reward_item_id, reward_amount); admin_create_promo_codes / admin_list_promo_codes / redeem_promo_code are redefined.
--   PART C  The game's side: public.claim_server_credits() and public.my_recent_credits(days).
--   PART D  The Edge Function's side (service role only): arena_private.progress_credits_pending / progress_credits_mark_counted, exposed as public.progress_credits_pending / _mark_counted.
--
-- CAPS (per code, per account; also checked by the tables, so the SQL editor cannot exceed them by accident):
--   gold      1 to 1,000,000        shards (Eter)   1 to 10,000        consumable (potion)   1 to 100 units of ONE item from arena_private.promo_consumable_ids()
-- The potion list is every consumable the owner may hand out WITHOUT minting a market good: it leaves out the Gold Pouches (tradeable Gold), Stash Deeds (permanent slots), Forge Seals and Refine Catalysts
-- (Pass track rewards), and the Expedition Tickets (the Expedition no longer exists). src/game/promoRewards.ts has the same list; a test pins the two together.
--
-- ROLLBACK (by hand; export server_credits first if rewards were handed out, they are the record of what the players were owed):
--   1. drop function if exists public.admin_create_promo_codes(integer, text, integer, timestamptz, text, text, integer);  then re-run the create statements of public.admin_create_promo_codes(integer, text, integer, timestamptz, text),
--      public.admin_list_promo_codes() and public.redeem_promo_code(text) from 0027.
--   2. drop function if exists public.progress_credits_mark_counted(uuid, timestamptz);  drop function if exists public.progress_credits_pending(uuid);
--      drop function if exists public.my_recent_credits(integer);  drop function if exists public.claim_server_credits();
--      drop function if exists arena_private.progress_credits_mark_counted(uuid, timestamptz);  drop function if exists arena_private.progress_credits_pending(uuid);
--   3. delete from arena_private.promo_codes where reward_kind <> 'pass' (after exporting; redemptions reference the codes, delete those rows first);  alter table arena_private.promo_codes drop constraint promo_codes_reward_check;
--      alter table arena_private.promo_codes drop constraint promo_codes_reward_shape;  alter table arena_private.promo_codes drop column reward_item_id, drop column reward_amount;
--      alter table arena_private.promo_codes add constraint promo_codes_reward_check check (reward_kind in ('pass'));
--   4. drop table if exists arena_private.server_credits;  drop function if exists arena_private.promo_consumable_ids();

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

-- =======================================================================================================================================
-- PART A. The ledger.
-- =======================================================================================================================================
-- The potions a code may give (see the header). Immutable so the tables can check against it.
create or replace function arena_private.promo_consumable_ids()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'small_hp', 'large_hp', 'atk_elixir', 'knowledge_elixir', 'greater_elixir', 'strength_elixir', 'stoneskin_tonic', 'fortune_tonic', 'haste_tonic', 'gatherer_brew',
    'precision_elixir', 'whetstone_oil', 'fertilizer', 'repair_kit', 'master_repair_kit', 'sharpening_stone', 'armor_polish', 'hunter_lure', 'prospector_tonic'
  ]::text[];
$$;

revoke all on function arena_private.promo_consumable_ids() from public, anon, authenticated;

create table if not exists arena_private.server_credits (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  item_id text,
  amount integer not null,
  source text not null,
  -- the promo code (canonical, 10 characters) that made the credit: with user_id it is unique, so a redemption can never create two
  source_ref text not null,
  created_at timestamptz not null default pg_catalog.now(),
  -- set by claim_server_credits(): the game has been handed this credit (and applies it once, by id)
  claimed_at timestamptz,
  -- set by submit-progress when an ACCEPTED snapshot has counted this credit in what the save may gain: a credit counts once
  counted_at timestamptz,
  constraint server_credits_kind_check check (kind in ('gold', 'shards', 'consumable')),
  constraint server_credits_source_check check (source in ('promo')),
  constraint server_credits_shape check (
    (kind = 'gold' and item_id is null and amount between 1 and 1000000)
    or (kind = 'shards' and item_id is null and amount between 1 and 10000)
    or (kind = 'consumable' and item_id is not null and item_id = any (arena_private.promo_consumable_ids()) and amount between 1 and 100)
  ),
  constraint server_credits_once unique (source, source_ref, user_id)
);

create index if not exists server_credits_user_idx on arena_private.server_credits (user_id, created_at desc);
create index if not exists server_credits_unclaimed_idx on arena_private.server_credits (user_id) where claimed_at is null;
create index if not exists server_credits_uncounted_idx on arena_private.server_credits (user_id) where claimed_at is not null and counted_at is null;

alter table arena_private.server_credits enable row level security;
revoke all on table arena_private.server_credits from public, anon, authenticated;

-- =======================================================================================================================================
-- PART B. Promo codes with a choice of reward.
-- =======================================================================================================================================
alter table arena_private.promo_codes add column if not exists reward_item_id text;
alter table arena_private.promo_codes add column if not exists reward_amount integer;

alter table arena_private.promo_codes drop constraint if exists promo_codes_reward_check;
alter table arena_private.promo_codes drop constraint if exists promo_codes_reward_shape;
alter table arena_private.promo_codes add constraint promo_codes_reward_check check (reward_kind in ('pass', 'gold', 'shards', 'consumable'));
alter table arena_private.promo_codes
  add constraint promo_codes_reward_shape check (
    (reward_kind = 'pass' and reward_item_id is null and reward_amount is null)
    or (reward_kind = 'gold' and reward_item_id is null and reward_amount is not null and reward_amount between 1 and 1000000)
    or (reward_kind = 'shards' and reward_item_id is null and reward_amount is not null and reward_amount between 1 and 10000)
    or (reward_kind = 'consumable' and reward_item_id is not null and reward_item_id = any (arena_private.promo_consumable_ids()) and reward_amount is not null and reward_amount between 1 and 100)
  );

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_create_promo_codes(p_count, p_reward, p_max_uses, p_expires_at, p_note, p_item_id, p_amount) -> {codes: [...]}
--   Same rules as 0027, plus the reward: 'pass' (item and amount must be null), 'gold' (1 to 1,000,000), 'shards' (1 to 10,000), 'consumable' (a potion from promo_consumable_ids(), 1 to 100).
--   PROMO_BAD_REWARD (unknown kind), PROMO_BAD_ITEM (a potion not on the list, or an item where there is none), PROMO_BAD_AMOUNT. The audit row carries reward, item and amount.
-- The 0027 five-argument function is dropped (two overloads would make the RPC ambiguous).
-- ---------------------------------------------------------------------------------------------------------------------------------------
drop function if exists public.admin_create_promo_codes(integer, text, integer, timestamptz, text);

create or replace function public.admin_create_promo_codes(p_count integer, p_reward text, p_max_uses integer, p_expires_at timestamptz, p_note text, p_item_id text default null, p_amount integer default null)
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
  v_item text := nullif(pg_catalog.btrim(coalesce(p_item_id, '')), '');
  v_max integer;
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
  if p_reward is null or p_reward not in ('pass', 'gold', 'shards', 'consumable') then
    raise exception using errcode = '22023', message = 'PROMO_BAD_REWARD';
  end if;
  if p_reward = 'pass' then
    if v_item is not null then
      raise exception using errcode = '22023', message = 'PROMO_BAD_ITEM';
    end if;
    if p_amount is not null then
      raise exception using errcode = '22023', message = 'PROMO_BAD_AMOUNT';
    end if;
  elsif p_reward = 'consumable' then
    if v_item is null or not (v_item = any (arena_private.promo_consumable_ids())) then
      raise exception using errcode = '22023', message = 'PROMO_BAD_ITEM';
    end if;
    if p_amount is null or p_amount < 1 or p_amount > 100 then
      raise exception using errcode = '22023', message = 'PROMO_BAD_AMOUNT';
    end if;
  else
    if v_item is not null then
      raise exception using errcode = '22023', message = 'PROMO_BAD_ITEM';
    end if;
    v_max := case when p_reward = 'gold' then 1000000 else 10000 end;
    if p_amount is null or p_amount < 1 or p_amount > v_max then
      raise exception using errcode = '22023', message = 'PROMO_BAD_AMOUNT';
    end if;
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
        insert into arena_private.promo_codes (code, reward_kind, reward_item_id, reward_amount, max_uses, expires_at, created_by, note)
        values (v_code, p_reward, v_item, case when p_reward = 'pass' then null else p_amount end, p_max_uses, p_expires_at, v_admin, v_note);
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
    pg_catalog.jsonb_build_object('count', p_count, 'reward', p_reward, 'item_id', v_item, 'amount', case when p_reward = 'pass' then null else p_amount end, 'max_uses', p_max_uses, 'expires_at', p_expires_at, 'note', v_note)
  );
  return pg_catalog.jsonb_build_object('codes', pg_catalog.to_jsonb(v_codes));
end;
$$;

revoke all on function public.admin_create_promo_codes(integer, text, integer, timestamptz, text, text, integer) from public, anon, authenticated;
grant execute on function public.admin_create_promo_codes(integer, text, integer, timestamptz, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.admin_list_promo_codes(): as 0027, plus reward_item_id and reward_amount on every row.
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
          'reward_item_id', c.reward_item_id,
          'reward_amount', c.reward_amount,
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
-- public.redeem_promo_code(p_code): as 0027 (same statuses, same rate limit, same locks). What changes is what 'ok' does:
--   reward 'pass'       the Adventurer Pass for the current season (unchanged): {status:'ok', reward:'pass', season}
--   reward 'gold' | 'shards' | 'consumable'   ONE row in arena_private.server_credits, in the same transaction as uses + 1 and the redemption row:
--                       {status:'ok', reward:'gold'|'shards'|'consumable', item_id, amount, credit_id}. The game claims it (claim_server_credits) and applies it once.
--   'already_has_pass' only concerns a code that gives the Pass: a player who has the Pass can still use a Gold / Eter / potion code.
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
  v_credit uuid;
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
    elsif v_row.reward_kind <> 'pass' then
      -- Gold / Eter / potion: a ledger row, nothing else. uses + 1, the redemption and the credit stand or fall together (one transaction; the unique key stops a second credit).
      update arena_private.promo_codes as c set uses = c.uses + 1 where c.code = v_code;
      insert into arena_private.promo_redemptions (code, user_id) values (v_code, v_user);
      insert into arena_private.server_credits (user_id, kind, item_id, amount, source, source_ref)
      values (v_user, v_row.reward_kind, v_row.reward_item_id, v_row.reward_amount, 'promo', v_code)
      returning id into v_credit;
      return pg_catalog.jsonb_build_object('status', 'ok', 'reward', v_row.reward_kind, 'item_id', v_row.reward_item_id, 'amount', v_row.reward_amount, 'credit_id', v_credit);
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

-- =======================================================================================================================================
-- PART C. The game claims its credits.
-- =======================================================================================================================================
-- public.claim_server_credits(): hands the signed-in account its UNCLAIMED credits (oldest first, at most 100 a call) and marks them claimed in the same statement, so two tabs racing for them cannot both get a row.
--   [{id, kind, item_id, amount, source_ref}, ...]  (empty when there is nothing). The game applies each credit to the save ONCE, remembering the id in the save (save.appliedCredits).
--   If the answer is lost (the tab closed before the save), the rows are already marked claimed, so my_recent_credits() gives them back.
create or replace function public.claim_server_credits()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_out jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  with picked as (
    select c.id
    from arena_private.server_credits as c
    where c.user_id = v_user and c.claimed_at is null
    order by c.created_at, c.id
    limit 100
    for update
  ), claimed as (
    update arena_private.server_credits as c
       set claimed_at = pg_catalog.now()
      from picked
     where c.id = picked.id
    returning c.id, c.kind, c.item_id, c.amount, c.source_ref, c.created_at
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', x.id, 'kind', x.kind, 'item_id', x.item_id, 'amount', x.amount, 'source_ref', x.source_ref) order by x.created_at, x.id), '[]'::jsonb)
    into v_out
    from claimed as x;
  return v_out;
end;
$$;

revoke all on function public.claim_server_credits() from public, anon, authenticated;
grant execute on function public.claim_server_credits() to authenticated;

-- public.my_recent_credits(p_days): the account's credits claimed in the last p_days days (1 to 30; default 14), newest first, at most 100. Read only. The game re-applies the ones whose id is not in
-- save.appliedCredits (a lost answer, a save that never reached the server). Never returns a credit that was not claimed yet (claim_server_credits is the only way to get it).
create or replace function public.my_recent_credits(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_days integer := least(30, greatest(1, coalesce(p_days, 14)));
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', x.id, 'kind', x.kind, 'item_id', x.item_id, 'amount', x.amount, 'source_ref', x.source_ref) order by x.claimed_at desc, x.id)
    from (
      select c.id, c.kind, c.item_id, c.amount, c.source_ref, c.claimed_at
      from arena_private.server_credits as c
      where c.user_id = v_user and c.claimed_at is not null and c.claimed_at >= pg_catalog.now() - pg_catalog.make_interval(days => v_days)
      order by c.claimed_at desc, c.id
      limit 100
    ) as x
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_recent_credits(integer) from public, anon, authenticated;
grant execute on function public.my_recent_credits(integer) to authenticated;

-- =======================================================================================================================================
-- PART D. submit-progress counts the credits (service role only).
-- =======================================================================================================================================
-- arena_private.progress_credits_pending(p_user): what the save may gain on top of play right now = the SUM of this user's credits that were claimed and not yet counted, per kind, and `through` (the newest
-- claimed_at among them; null when none). Consumable amounts are summed across potions: the bound counts potion units.
create or replace function arena_private.progress_credits_pending(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'gold', coalesce(pg_catalog.sum(c.amount) filter (where c.kind = 'gold'), 0),
    'shards', coalesce(pg_catalog.sum(c.amount) filter (where c.kind = 'shards'), 0),
    'consumable', coalesce(pg_catalog.sum(c.amount) filter (where c.kind = 'consumable'), 0),
    'through', pg_catalog.max(c.claimed_at)
  )
  from arena_private.server_credits as c
  where c.user_id = p_user and c.claimed_at is not null and c.counted_at is null;
$$;

revoke all on function arena_private.progress_credits_pending(uuid) from public, anon, authenticated;

-- arena_private.progress_credits_mark_counted(p_user, p_through): called ONLY after an ACCEPTED (ok) snapshot used the numbers above: every credit claimed up to p_through is counted, once. A credit claimed
-- after p_through (while the snapshot was being judged) is untouched and counts in the next snapshot. Returns how many rows it marked.
create or replace function arena_private.progress_credits_mark_counted(p_user uuid, p_through timestamptz)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_through is null then
    return 0;
  end if;
  update arena_private.server_credits as c
     set counted_at = pg_catalog.now()
   where c.user_id = p_user and c.claimed_at is not null and c.claimed_at <= p_through and c.counted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function arena_private.progress_credits_mark_counted(uuid, timestamptz) from public, anon, authenticated;

-- The PostgREST doors (service role only, like progress_claim_slot): the Edge Function calls these two.
create or replace function public.progress_credits_pending(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select arena_private.progress_credits_pending(p_user_id);
$$;

revoke all on function public.progress_credits_pending(uuid) from public, anon, authenticated;
grant execute on function public.progress_credits_pending(uuid) to service_role;

create or replace function public.progress_credits_mark_counted(p_user_id uuid, p_through timestamptz)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select arena_private.progress_credits_mark_counted(p_user_id, p_through);
$$;

revoke all on function public.progress_credits_mark_counted(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.progress_credits_mark_counted(uuid, timestamptz) to service_role;
