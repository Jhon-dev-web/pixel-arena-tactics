-- The owner's admin area shows the Adventurer Pass the way the game now counts it (depends on 0020 admin, 0025 pass per season). NOT APPLIED from this repo: the owner runs it (SQL editor or
-- "supabase db push"), in the DEVELOPMENT project first. It is run for real by admin/tests/sql/adminpass.integration.test.ts.
--
-- WHY. Since 0025 a Pass covers one season (the pre-season and Season 1 share one Pass): entitlements.valid_through_season >= arena_private.current_pass_season() is what gives the perks
-- (owns_adventurer_pass) and, for a live or granted Pass, the ranking (owns_ranking_pass). admin_overview, admin_players and admin_player_detail still counted any 'active' row, so a Season-1 Pass
-- read as a current right after Season 2 opened. Now each of them says BOTH things, as two different measures:
--   * VALID THIS SEASON   the same rule as owns_adventurer_pass (perks) / owns_ranking_pass (ranking eligibility: live or grant only; a test-mode Pass does not rank).
--   * HISTORY             every active row ever granted, whatever season it covered (the old meaning of 'owners_active', which keeps that name and value).
--   admin_overview.pass:  + current_season, owners_history, owners_valid_now, owners_valid_ranking, owners_expired; by_source rows + valid_now.
--   admin_players:        rows + pass_valid_now, pass_ranking, pass_history, pass_valid_through; filter "pass": yes (valid now) | no (not valid now) | expired (had one, none valid now) | history (ever had one).
--                         pass_source / pass_livemode describe the Pass valid now when there is one, else the latest active one.
--   admin_player_detail:  + pass { current_season, valid_now, ranking_eligible, history, valid_through }; each entitlement + valid_through_season, valid_now.
-- REVENUE IS NOT TOUCHED: card_sold_*, usdc_*, collected stay all-time. Money received and a benefit that is valid now are different measures. livemode and source stay on every row.
-- Nothing else changes: same signatures, same grants, still read-only. Everything is create or replace, so running it twice is harmless.
--
-- ROLLBACK: re-run the three create-or-replace blocks of 0020_admin.sql (admin_overview, admin_players, admin_player_detail).

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_today timestamptz;
  v_online interval;
  v_price numeric;
  v_players jsonb;
  v_pass jsonb;
  v_pass_rows jsonb;
  v_market jsonb;
  v_items jsonb;
  v_pouches jsonb;
  v_materials jsonb;
  v_league jsonb;
  v_waitlist jsonb;
  v_collected jsonb;
  v_cache jsonb;
  v_season integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_tz := arena_private.admin_cfg('timezone', 'America/Sao_Paulo');
  v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_online := make_interval(mins => arena_private.admin_cfg('online_window_minutes', '5')::integer);
  v_price := arena_private.admin_cfg('pass_price_card_usd', '10.00')::numeric;
  v_season := arena_private.current_pass_season();

  -- Players -------------------------------------------------------------------------------------------------------------------------------
  select jsonb_build_object(
    'registered', (select count(*) from auth.users),
    'confirmed', (select count(*) from auth.users as u where u.email_confirmed_at is not null),
    'with_username', (select count(*) from public.profiles as p where p.username is not null),
    'signups_today', (select count(*) from auth.users as u where u.created_at >= v_today),
    'signups_7d', (select count(*) from auth.users as u where u.created_at >= now() - interval '7 days'),
    'signups_30d', (select count(*) from auth.users as u where u.created_at >= now() - interval '30 days'),
    'characters', c.total,
    'online_now', c.online_now,
    'active_today', c.active_today,
    'active_7d', c.active_7d,
    'active_30d', c.active_30d,
    'online_window_minutes', (extract(epoch from v_online) / 60)::integer
  ) into v_players
  from (
    select count(*) as total,
           count(*) filter (where ch.updated_at >= now() - v_online) as online_now,
           count(*) filter (where ch.updated_at >= v_today) as active_today,
           count(*) filter (where ch.updated_at >= now() - interval '7 days') as active_7d,
           count(*) filter (where ch.updated_at >= now() - interval '30 days') as active_30d
    from public.characters as ch
  ) as c;

  -- Pass: owners by source, live vs test --------------------------------------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('source', g.source, 'livemode', g.livemode, 'active', g.active, 'valid_now', g.valid_now, 'refunded', g.refunded, 'revoked', g.revoked) order by g.source, g.livemode desc), '[]'::jsonb)
  into v_pass_rows
  from (
    select e.source, e.livemode,
           count(*) filter (where e.status = 'active') as active,
           count(*) filter (where e.status = 'active' and e.valid_through_season >= v_season) as valid_now,
           count(*) filter (where e.status = 'refunded') as refunded,
           count(*) filter (where e.status = 'revoked') as revoked
    from public.entitlements as e
    where e.kind = 'adventurer_pass'
    group by e.source, e.livemode
  ) as g;

  select jsonb_build_object(
    'by_source', v_pass_rows,
    'current_season', v_season,
    -- HISTORY: every account that was ever granted an active Pass, whatever season it covered (the old meaning of owners_active, kept under that name too).
    'owners_active', (select count(distinct e.user_id) from public.entitlements as e where e.kind = 'adventurer_pass' and e.status = 'active'),
    'owners_history', (select count(distinct e.user_id) from public.entitlements as e where e.kind = 'adventurer_pass' and e.status = 'active'),
    -- VALID NOW: the perks rule (owns_adventurer_pass) and the ranking rule (owns_ranking_pass: live or grant only). Never used for revenue.
    'owners_valid_now', (select count(distinct e.user_id) from public.entitlements as e where e.kind = 'adventurer_pass' and e.status = 'active' and e.valid_through_season >= v_season),
    'owners_valid_ranking', (select count(distinct e.user_id) from public.entitlements as e where e.kind = 'adventurer_pass' and e.status = 'active' and (e.livemode or e.source = 'grant') and e.valid_through_season >= v_season),
    'owners_expired', (select count(distinct e.user_id) from public.entitlements as e where e.kind = 'adventurer_pass' and e.status = 'active' and not exists (select 1 from public.entitlements as f where f.user_id = e.user_id and f.kind = 'adventurer_pass' and f.status = 'active' and f.valid_through_season >= v_season)),
    'card_price_usd', v_price,
    'card_sold_live', (select count(*) from public.entitlements as e where e.kind = 'adventurer_pass' and e.source = 'stripe' and e.livemode and e.status = 'active'),
    'card_refunded_live', (select count(*) from public.entitlements as e where e.kind = 'adventurer_pass' and e.source = 'stripe' and e.livemode and e.status = 'refunded'),
    'card_sold_test', (select count(*) from public.entitlements as e where e.kind = 'adventurer_pass' and e.source = 'stripe' and not e.livemode and e.status = 'active'),
    'usdc_live', coalesce((select sum(p.amount_units) from public.chain_payments as p where p.purpose = 'pass' and p.status = 'applied' and p.livemode), 0) / 1000000,
    'usdc_test', coalesce((select sum(p.amount_units) from public.chain_payments as p where p.purpose = 'pass' and p.status = 'applied' and not p.livemode), 0) / 1000000,
    'usdc_to_refund', coalesce((select sum(p.amount_units) from public.chain_payments as p where p.purpose = 'pass' and p.status = 'refund_due'), 0) / 1000000,
    'usdc_payments_live', (select count(*) from public.chain_payments as p where p.purpose = 'pass' and p.status = 'applied' and p.livemode),
    'goal_target', coalesce((select g.target from arena_private.season_goal as g where g.id), 0),
    'goal_paid', arena_private.paid_pass_count()
  ) into v_pass;

  -- Market: live vs test ------------------------------------------------------------------------------------------------------------------
  select jsonb_object_agg(case when v.lm then 'live' else 'test' end, x.o)
  into v_market
  from (values (true), (false)) as v (lm)
  cross join lateral (
    select jsonb_build_object(
      'sales', count(*),
      'sales_items', count(*) filter (where s.material_id is null),
      'sales_materials', count(*) filter (where s.material_id is not null),
      'volume_lamports', coalesce(sum(s.price_lamports), 0),
      'fee_lamports', coalesce(sum(s.fee_lamports), 0),
      'buyers', count(distinct s.buyer_id),
      'sellers', count(distinct s.seller_id)
    ) as o
    from public.market_sales as s
    where s.livemode = v.lm
  ) as x;

  v_market := coalesce(v_market, '{}'::jsonb) || jsonb_build_object(
    'listings_open', (select count(*) from public.market_listings as l where l.status in ('open', 'reserved')),
    'listings_open_items', (select count(*) from public.market_listings as l where l.status in ('open', 'reserved') and l.material_id is null),
    'listings_open_materials', (select count(*) from public.market_listings as l where l.status in ('open', 'reserved') and l.material_id is not null),
    'listings_total', (select count(*) from public.market_listings),
    'refund_due_count', (select count(*) from public.chain_payments as p where p.purpose = 'market' and p.status = 'refund_due'),
    'refund_due_lamports', coalesce((select sum(p.amount_units) from public.chain_payments as p where p.purpose = 'market' and p.status = 'refund_due'), 0)
  );

  -- Collected in Solana (live only): the game's 5% fees in SOL and the Passes paid in USDC ----------------------------------------------------
  v_collected := jsonb_build_object(
    'fees_lamports', coalesce((v_market -> 'live' ->> 'fee_lamports')::numeric, 0),
    'volume_lamports', coalesce((v_market -> 'live' ->> 'volume_lamports')::numeric, 0),
    'usdc', (v_pass ->> 'usdc_live')::numeric
  );

  -- Certified items --------------------------------------------------------------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'rarity', g.rarity, 'status', g.status, 'bound', g.bound, 'bought', g.bought, 'count', g.n) order by g.kind, g.rarity, g.status), '[]'::jsonb)
  into v_items
  from (
    select c.kind, c.rarity, c.status, c.bound, (c.origin_certificate_id is not null) as bought, count(*) as n
    from public.item_certificates as c
    group by c.kind, c.rarity, c.status, c.bound, (c.origin_certificate_id is not null)
  ) as g;

  -- Gold Pouches outstanding (unopened, still held or listed) ----------------------------------------------------------------------------------
  select jsonb_build_object(
    'outstanding', count(*) filter (where c.status in ('held', 'listed')),
    'outstanding_gold', coalesce(sum(c.gold_amount) filter (where c.status in ('held', 'listed')), 0),
    'listed', count(*) filter (where c.status = 'listed'),
    'minted', count(*) filter (where c.origin_certificate_id is null),
    'opened', count(*) filter (where c.status = 'burned')
  ) into v_pouches
  from public.item_certificates as c
  where c.kind = 'gold_pouch';

  -- Tradeable materials (balances plus what sits in open listings) -----------------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object('material_id', m.material_id, 'qty', m.qty, 'pending', m.pending, 'listed', m.listed) order by m.qty + m.listed desc, m.material_id), '[]'::jsonb)
  into v_materials
  from (
    select coalesce(b.material_id, l.material_id) as material_id, coalesce(b.qty, 0) as qty, coalesce(b.pending, 0) as pending, coalesce(l.listed, 0) as listed
    from (select mb.material_id, sum(mb.qty) as qty, sum(mb.pending) as pending from public.material_balances as mb group by mb.material_id) as b
    full join (select ml.material_id, sum(ml.material_qty) as listed from public.market_listings as ml where ml.status in ('open', 'reserved') and ml.material_id is not null group by ml.material_id) as l
      on l.material_id = b.material_id
  ) as m;

  -- League ----------------------------------------------------------------------------------------------------------------------------------
  select jsonb_build_object(
    'season', (
      select jsonb_build_object('number', s.number, 'kind', s.kind, 'status', s.status, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'freeze_at', s.freeze_at)
      from public.seasons as s
      where s.status in ('open', 'frozen')
      order by (s.kind = 'ranked') desc, s.number desc
      limit 1
    ),
    'goal_target', (select g.target from arena_private.season_goal as g where g.id),
    'goal_paid', arena_private.paid_pass_count(),
    'goal_opened_at', (select g.opened_at from arena_private.season_goal as g where g.id),
    'reset_at', (select g.reset_at from arena_private.season_goal as g where g.id),
    'entries', (select count(*) from public.season_entries as e where e.season = (select s2.number from public.seasons as s2 where s2.status in ('open', 'frozen') order by (s2.kind = 'ranked') desc, s2.number desc limit 1)),
    'entries_flagged', (select count(*) from public.season_entries as e where cardinality(e.flags) > 0),
    'entries_disqualified', (select count(*) from public.season_entries as e where e.disqualified),
    'players_with_open_flags', (
      select count(distinct f.user_id)
      from public.progress_snapshots as f
      where f.verdict <> 'ok'
        and f.created_at >= coalesce((select g.reset_at from arena_private.season_goal as g where g.id), '-infinity'::timestamptz)
        and not exists (select 1 from public.progress_flag_clears as k where k.snapshot_id = f.id)
    ),
    'players_with_item_flags', (select count(distinct f.user_id) from arena_private.item_account_flags as f)
  ) into v_league;

  -- Waiting list -------------------------------------------------------------------------------------------------------------------------------
  select jsonb_build_object(
    'total', count(*),
    'unsubscribed', count(*) filter (where w.unsubscribed_at is not null),
    'today', count(*) filter (where w.created_at >= v_today),
    'last_7d', count(*) filter (where w.created_at >= now() - interval '7 days'),
    'referred', count(*) filter (where w.referred_by is not null),
    'qualified', count(*) filter (where w.qualified_at is not null)
  ) into v_waitlist
  from public.waitlist as w;

  -- How fresh the derived numbers are ----------------------------------------------------------------------------------------------------------
  select jsonb_build_object(
    'player_cache_rows', count(*),
    'player_cache_refreshed_at', max(pc.refreshed_at),
    'gold_total', coalesce(sum(pc.gold), 0),
    'gold_day', (select max(gd.day) from arena_private.admin_gold_daily as gd),
    'gold_captured_at', (select max(gd.captured_at) from arena_private.admin_gold_daily as gd),
    'daily_captured_at', (select max(d.captured_at) from arena_private.admin_daily as d)
  ) into v_cache
  from arena_private.admin_player_cache as pc;

  return jsonb_build_object(
    'generated_at', now(),
    'timezone', v_tz,
    'players', v_players,
    'pass', v_pass,
    'market', v_market,
    'collected', v_collected,
    'items', v_items,
    'pouches', v_pouches,
    'materials', v_materials,
    'league', v_league,
    'waitlist', v_waitlist,
    'freshness', v_cache
  );
end;
$$;

revoke all on function public.admin_overview() from public, anon, authenticated;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_players(
  p_search text default null,
  p_sort text default 'last_seen',
  p_dir text default 'desc',
  p_page integer default 0,
  p_page_size integer default 50,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size integer;
  v_offset integer;
  v_search text;
  v_like text;
  v_desc boolean;
  v_online interval;
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  if p_sort is null or p_sort not in ('last_seen', 'created', 'level', 'floor', 'depth', 'gold', 'username') then
    raise exception using errcode = '22023', message = 'ADMIN_BAD_SORT';
  end if;

  v_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset := greatest(coalesce(p_page, 0), 0) * v_size;
  v_search := nullif(btrim(p_search), '');
  v_like := '%' || replace(replace(replace(coalesce(v_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_desc := lower(coalesce(p_dir, 'desc')) <> 'asc';
  v_online := make_interval(mins => arena_private.admin_cfg('online_window_minutes', '5')::integer);

  with base as (
    select u.id as user_id,
           u.email,
           u.created_at,
           pr.username,
           ch.hero_name,
           ch.updated_at as last_seen,
           pc.hero_level,
           pc.paragon_level,
           pc.highest_floor,
           pc.deepest_depth,
           pc.gold,
           pc.refreshed_at as stats_at
    from auth.users as u
    left join public.profiles as pr on pr.user_id = u.id
    left join public.characters as ch on ch.user_id = u.id
    left join arena_private.admin_player_cache as pc on pc.user_id = u.id
    where (
        v_search is null
        or u.id::text = v_search
        or pr.username ilike v_like
        or ch.hero_name ilike v_like
        or u.email ilike v_like
      )
      and (not coalesce((p_filters ->> 'online')::boolean, false) or ch.updated_at >= now() - v_online)
      and (
        p_filters ->> 'pass' is null
        or (p_filters ->> 'pass') not in ('yes', 'no', 'expired', 'history')
        or ((p_filters ->> 'pass') = 'yes' and arena_private.owns_adventurer_pass(u.id))
        or ((p_filters ->> 'pass') = 'no' and not arena_private.owns_adventurer_pass(u.id))
        or ((p_filters ->> 'pass') = 'history' and exists (select 1 from public.entitlements as e where e.user_id = u.id and e.kind = 'adventurer_pass' and e.status = 'active'))
        or ((p_filters ->> 'pass') = 'expired' and not arena_private.owns_adventurer_pass(u.id) and exists (select 1 from public.entitlements as e where e.user_id = u.id and e.kind = 'adventurer_pass' and e.status = 'active'))
      )
      and (not coalesce((p_filters ->> 'flagged')::boolean, false) or arena_private.has_open_flags(u.id) or arena_private.has_item_flags(u.id))
      and (not coalesce((p_filters ->> 'wallet')::boolean, false) or exists (select 1 from public.market_wallets as w where w.user_id = u.id))
  ),
  keyed as (
    select b.*,
           case p_sort
             when 'last_seen' then extract(epoch from b.last_seen)
             when 'created' then extract(epoch from b.created_at)
             when 'level' then (coalesce(b.hero_level, 0) + coalesce(b.paragon_level, 0))::numeric
             when 'floor' then b.highest_floor::numeric
             when 'depth' then b.deepest_depth::numeric
             when 'gold' then b.gold
             else null
           end as sort_num,
           case when p_sort = 'username' then lower(b.username) else null end as sort_txt
    from base as b
  ),
  page as (
    select k.*, count(*) over () as total, row_number() over (
      order by
        (case when v_desc then k.sort_num end) desc nulls last,
        (case when not v_desc then k.sort_num end) asc nulls last,
        (case when v_desc then k.sort_txt end) desc nulls last,
        (case when not v_desc then k.sort_txt end) asc nulls last,
        k.user_id
    ) as rn
    from keyed as k
    order by rn
    limit v_size offset v_offset
  )
  select coalesce(max(p.total), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id', p.user_id,
           'username', p.username,
           'hero_name', p.hero_name,
           'email_masked', case when p.email is null then null else left(split_part(p.email, '@', 1), 2) || '***@' || split_part(p.email, '@', 2) end,
           'created_at', p.created_at,
           'last_seen', p.last_seen,
           'online', coalesce(p.last_seen >= now() - v_online, false),
           'hero_level', coalesce(p.hero_level, (lm.metrics ->> 'heroLevel')::integer),
           'paragon_level', coalesce(p.paragon_level, (lm.metrics ->> 'paragonLevel')::integer),
           'highest_floor', coalesce(p.highest_floor, (lm.metrics ->> 'highestFloor')::integer),
           'deepest_depth', coalesce(p.deepest_depth, (lm.metrics ->> 'deepestDepth')::integer),
           'gold', p.gold,
           'stats_at', p.stats_at,
           'pass_source', pass.source,
           'pass_livemode', pass.livemode,
           'pass_valid_now', arena_private.owns_adventurer_pass(p.user_id),
           'pass_ranking', arena_private.owns_ranking_pass(p.user_id),
           'pass_history', (select count(*) from public.entitlements as e where e.user_id = p.user_id and e.kind = 'adventurer_pass' and e.status = 'active'),
           'pass_valid_through', pass.valid_through_season,
           'wallet', wal.address,
           'open_flags', (
             select count(*) from public.progress_snapshots as f
             where f.user_id = p.user_id and f.verdict <> 'ok'
               and f.created_at >= coalesce((select g.reset_at from arena_private.season_goal as g where g.id), '-infinity'::timestamptz)
               and not exists (select 1 from public.progress_flag_clears as k where k.snapshot_id = f.id)
           ),
           'item_flags', (select count(*) from arena_private.item_account_flags as f where f.user_id = p.user_id),
           'items_held', (select count(*) from public.item_certificates as c where c.user_id = p.user_id and c.status in ('held', 'listed') and c.kind <> 'gold_pouch'),
           'items_listed', (select count(*) from public.item_certificates as c where c.user_id = p.user_id and c.status = 'listed'),
           'sales', (select count(*) from public.market_sales as s where s.seller_id = p.user_id),
           'purchases', (select count(*) from public.market_sales as s where s.buyer_id = p.user_id)
         ) order by p.rn), '[]'::jsonb)
  into v_total, v_rows
  from page as p
  left join lateral (
    select e.source, e.livemode, e.valid_through_season from public.entitlements as e
    where e.user_id = p.user_id and e.kind = 'adventurer_pass' and e.status = 'active'
    order by (e.valid_through_season >= arena_private.current_pass_season()) desc, e.granted_at desc limit 1
  ) as pass on true
  left join public.market_wallets as wal on wal.user_id = p.user_id
  left join lateral (
    select s.metrics from public.progress_snapshots as s
    where p.hero_level is null and s.user_id = p.user_id and s.verdict <> 'rejected'
    order by s.created_at desc limit 1
  ) as lm on true;

  return jsonb_build_object('total', v_total, 'page', greatest(coalesce(p_page, 0), 0), 'page_size', v_size, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_players(text, text, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.admin_players(text, text, text, integer, integer, jsonb) to authenticated;

create or replace function public.admin_player_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'ADMIN_BAD_ARGUMENT';
  end if;

  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'email_confirmed_at', u.email_confirmed_at,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'username', pr.username,
    'username_set_at', pr.username_set_at
  ) into v_account
  from auth.users as u
  left join public.profiles as pr on pr.user_id = u.id
  where u.id = p_user_id;

  if v_account is null then
    return null;
  end if;

  return jsonb_build_object(
    'account', v_account,
    'character', (
      select jsonb_build_object('hero_name', ch.hero_name, 'revision', ch.revision, 'schema_version', ch.save_schema_version, 'imported_from_legacy', ch.imported_from_legacy, 'created_at', ch.created_at, 'updated_at', ch.updated_at)
      from public.characters as ch where ch.user_id = p_user_id
    ),
    'stats', (
      select jsonb_build_object('hero_level', pc.hero_level, 'paragon_level', pc.paragon_level, 'highest_floor', pc.highest_floor, 'deepest_depth', pc.deepest_depth, 'gold', pc.gold,
                                'items_common', pc.items_common, 'items_rare', pc.items_rare, 'items_epic', pc.items_epic, 'items_legendary', pc.items_legendary, 'refreshed_at', pc.refreshed_at)
      from arena_private.admin_player_cache as pc where pc.user_id = p_user_id
    ),
    'entitlements', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'source', e.source, 'provider_ref', e.provider_ref, 'status', e.status, 'livemode', e.livemode, 'granted_at', e.granted_at, 'valid_through_season', e.valid_through_season, 'valid_now', (e.kind = 'adventurer_pass' and e.status = 'active' and e.valid_through_season >= arena_private.current_pass_season())) order by e.granted_at desc), '[]'::jsonb)
      from public.entitlements as e where e.user_id = p_user_id
    ),
    'pass', jsonb_build_object(
      'current_season', arena_private.current_pass_season(),
      'valid_now', arena_private.owns_adventurer_pass(p_user_id),
      'ranking_eligible', arena_private.owns_ranking_pass(p_user_id),
      'history', (select count(*) from public.entitlements as e where e.user_id = p_user_id and e.kind = 'adventurer_pass' and e.status = 'active'),
      'valid_through', (select max(e.valid_through_season) from public.entitlements as e where e.user_id = p_user_id and e.kind = 'adventurer_pass' and e.status = 'active')
    ),
    'wallet', (select jsonb_build_object('address', w.address, 'chain_id', w.chain_id, 'linked_at', w.linked_at) from public.market_wallets as w where w.user_id = p_user_id),
    'snapshots', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'created_at', s.created_at, 'verdict', s.verdict, 'reasons', s.reasons, 'app_version', s.app_version,
        'hero_level', s.metrics -> 'heroLevel', 'paragon_level', s.metrics -> 'paragonLevel', 'highest_floor', s.metrics -> 'highestFloor', 'deepest_depth', s.metrics -> 'deepestDepth',
        'seconds_played', s.metrics -> 'secondsPlayed'
      ) order by s.created_at desc), '[]'::jsonb)
      from (select x.created_at, x.verdict, x.reasons, x.app_version, x.metrics from public.progress_snapshots as x where x.user_id = p_user_id order by x.created_at desc limit 15) as s
    ),
    'open_flags', (
      select coalesce(jsonb_agg(jsonb_build_object('created_at', f.created_at, 'verdict', f.verdict, 'reasons', f.reasons) order by f.created_at desc), '[]'::jsonb)
      from public.progress_snapshots as f
      where f.user_id = p_user_id and f.verdict <> 'ok'
        and f.created_at >= coalesce((select g.reset_at from arena_private.season_goal as g where g.id), '-infinity'::timestamptz)
        and not exists (select 1 from public.progress_flag_clears as k where k.snapshot_id = f.id)
    ),
    'item_flags', (
      select coalesce(jsonb_agg(jsonb_build_object('code', f.code, 'detail', f.detail, 'created_at', f.created_at) order by f.created_at desc), '[]'::jsonb)
      from (select x.code, x.detail, x.created_at from arena_private.item_account_flags as x where x.user_id = p_user_id order by x.created_at desc limit 30) as f
    ),
    'certificates', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'rarity', g.rarity, 'status', g.status, 'bound', g.bound, 'count', g.n) order by g.kind, g.rarity, g.status), '[]'::jsonb)
      from (select c.kind, c.rarity, c.status, c.bound, count(*) as n from public.item_certificates as c where c.user_id = p_user_id group by c.kind, c.rarity, c.status, c.bound) as g
    ),
    'recent_certificates', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'template_id', c.template_id, 'rarity', c.rarity, 'tier', c.tier, 'status', c.status, 'bound', c.bound, 'source', c.source, 'created_at', c.created_at) order by c.created_at desc), '[]'::jsonb)
      from (select x.id, x.kind, x.template_id, x.rarity, x.tier, x.status, x.bound, x.source, x.created_at from public.item_certificates as x where x.user_id = p_user_id and x.kind <> 'gold_pouch' order by x.created_at desc limit 20) as c
    ),
    'sales', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'sold_at', s.sold_at, 'role', case when s.seller_id = p_user_id then 'seller' else 'buyer' end, 'item_kind', s.item_kind, 'item_template', s.item_template,
                                                   'material_id', s.material_id, 'material_qty', s.material_qty, 'price_lamports', s.price_lamports, 'fee_lamports', s.fee_lamports, 'tx_signature', s.tx_signature, 'livemode', s.livemode)
                                  order by s.sold_at desc), '[]'::jsonb)
      from (select * from public.market_sales as x where x.seller_id = p_user_id or x.buyer_id = p_user_id order by x.sold_at desc limit 20) as s
    ),
    'materials', (
      select coalesce(jsonb_agg(jsonb_build_object('material_id', m.material_id, 'qty', m.qty, 'pending', m.pending) order by m.material_id), '[]'::jsonb)
      from public.material_balances as m where m.user_id = p_user_id and (m.qty > 0 or m.pending > 0)
    ),
    'season_entries', (
      select coalesce(jsonb_agg(jsonb_build_object('season', e.season, 'score', e.score, 'level_total', e.score / 1000000, 'highest_floor', least(e.score % 1000000, 100), 'flags', e.flags, 'disqualified', e.disqualified, 'created_at', e.created_at) order by e.season desc), '[]'::jsonb)
      from public.season_entries as e where e.user_id = p_user_id
    ),
    'referral_rewards', (
      select coalesce(jsonb_agg(jsonb_build_object('metric', r.metric, 'min_count', r.min_count, 'kind', r.kind, 'reward_ref', r.reward_ref, 'granted_at', r.granted_at) order by r.granted_at desc), '[]'::jsonb)
      from public.referral_rewards_granted as r where r.user_id = p_user_id
    )
  );
end;
$$;

revoke all on function public.admin_player_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_player_detail(uuid) to authenticated;
