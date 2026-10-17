-- The owner's admin area (read-only): who the players are, how many are online, sign-ups, Pass sales, the market, the items, the Legendaries, the economy, the League and the waiting list.
--
-- The admin app lives outside the game (admin/, its own Vercel project). It signs in with a normal game account (e-mail + password, the anon key) and only calls the functions below. EVERY one of them
-- starts by asking public.is_admin() and raises ADMIN_ONLY otherwise, runs as the function owner (security definer, fixed empty search_path), is granted to `authenticated` only and writes NOTHING
-- (stable). No table of the game becomes readable by the client: the policies and grants of the earlier migrations are untouched.
--
-- Who is an admin: a row in arena_private.admins, inserted by the OWNER in the SQL editor (nothing in the game or the app can add one):
--   insert into arena_private.admins (user_id, note) select id, 'owner' from auth.users where email = 'you@example.com';
--
-- "Gold in circulation" is NOT a live scan of every save (a save is up to 288 KB of jsonb): arena_private.admin_refresh_aggregates() copies the few numbers it needs from the saves that CHANGED since its last
-- run into arena_private.admin_player_cache and writes one row a day to arena_private.admin_gold_daily; arena_private.admin_refresh_daily() keeps arena_private.admin_daily (sign-ups and active players per day,
-- which cannot be rebuilt later because the retention job (0019) thins old progress snapshots). Both are scheduled with pg_cron by the OWNER (docs/ADMIN.md section 4), never called by a client.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it (SQL editor or `supabase db push`) after 0001-0019.
--
-- ROLLBACK (by hand; the aggregate tables hold only derived numbers, the admins table only the list):
--   select cron.unschedule('arena-admin-daily');  select cron.unschedule('arena-admin-aggregates');   -- only if you scheduled them
--   drop function if exists public.admin_overview();
--   drop function if exists public.admin_players(text, text, text, integer, integer, jsonb);
--   drop function if exists public.admin_player_detail(uuid);
--   drop function if exists public.admin_legendaries(text, integer, integer, jsonb);
--   drop function if exists public.admin_market(text, text, integer, integer, jsonb);
--   drop function if exists public.admin_economy();
--   drop function if exists public.admin_economy_series(integer);
--   drop function if exists public.admin_flags(integer, integer, jsonb);
--   drop function if exists public.admin_league(integer, integer);
--   drop function if exists public.admin_waitlist(integer);
--   drop function if exists public.is_admin();
--   drop function if exists arena_private.admin_refresh_aggregates(boolean);
--   drop function if exists arena_private.admin_refresh_daily(integer);
--   drop function if exists arena_private.admin_cfg(text, text);
--   drop table if exists arena_private.admin_daily;  drop table if exists arena_private.admin_gold_daily;  drop table if exists arena_private.admin_player_cache;
--   drop table if exists arena_private.admin_template_info;  drop table if exists arena_private.admin_config;  drop table if exists arena_private.admins;
--   drop index if exists public.characters_updated_at_idx;  drop index if exists public.progress_snapshots_created_idx;  drop index if exists public.item_certificates_admin_special_idx;
--   drop index if exists public.item_certificates_pouch_idx;  drop index if exists public.item_certificate_events_burn_idx;  drop index if exists public.entitlements_granted_idx;

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The admin list. The owner inserts himself by SQL; no client privilege at all (RLS on, no policy, every grant revoked).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  note text
);

alter table arena_private.admins enable row level security;
revoke all on table arena_private.admins from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The owner's own settings for the dashboard (read by the functions below). Edit with ordinary updates in the SQL editor.
--   timezone              the day boundary of "hoje" and of every daily series
--   pass_price_card_usd   what a card Pass costs. The real price lives in Stripe (docs/PASS_SALES.md); this is the owner's own copy, used only to turn a COUNT of card sales into a revenue estimate
--   online_window_minutes a player counts as online when the character was saved this many minutes ago or less
--   pity_min_tier / pity_threshold  the Legendary pity (supabase/functions/_shared/items/tables.ts PITY_TABLE): used only to LABEL a Legendary as "pity" in the Legendaries list
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.admin_config (
  key text primary key,
  value text not null,
  note text
);

insert into arena_private.admin_config (key, value, note) values
  ('timezone', 'America/Sao_Paulo', 'day boundary of the dashboard'),
  ('pass_price_card_usd', '10.00', 'owner copy of the Stripe price; revenue estimate only'),
  ('online_window_minutes', '5', 'online = character saved within this many minutes'),
  ('pity_min_tier', '4', 'PITY_TABLE.minTier'),
  ('pity_threshold', '40', 'PITY_TABLE.threshold')
on conflict (key) do nothing;

alter table arena_private.admin_config enable row level security;
revoke all on table arena_private.admin_config from public, anon, authenticated;

create or replace function arena_private.admin_cfg(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value from arena_private.admin_config as c where c.key = p_key), p_default);
$$;

revoke all on function arena_private.admin_cfg(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Tier and slot of every forgeable / unique template (generated from supabase/functions/_shared/items/tables.ts: FORGE_TEMPLATES and UNIQUE_TEMPLATES). A certificate stores only the template id;
-- the admin lists show the tier and slot, and the pity label needs the tier of every forge. When a template is added to the game, insert one row here (docs/ADMIN.md).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.admin_template_info (
  kind text not null,
  template_id text not null,
  tier integer not null,
  slot text not null,
  primary key (kind, template_id),
  constraint admin_template_info_kind_check check (kind in ('gear', 'unique'))
);

insert into arena_private.admin_template_info (kind, template_id, tier, slot) values
  ('gear', 'bronze_dagger', 1, 'weapon'),
  ('gear', 'iron_short_sword', 2, 'weapon'),
  ('gear', 'steel_greatsword', 3, 'weapon'),
  ('gear', 'gilded_warblade', 4, 'weapon'),
  ('gear', 'dragon_flameblade', 4, 'weapon'),
  ('gear', 'voidsteel_blade', 5, 'weapon'),
  ('gear', 'abyssal_greatblade', 6, 'weapon'),
  ('gear', 'bronze_hatchet', 1, 'weapon'),
  ('gear', 'iron_battleaxe', 2, 'weapon'),
  ('gear', 'steel_greataxe', 3, 'weapon'),
  ('gear', 'gilded_waraxe', 4, 'weapon'),
  ('gear', 'voidsteel_cleaver', 5, 'weapon'),
  ('gear', 'abyssal_reaver', 6, 'weapon'),
  ('gear', 'bronze_leather', 1, 'armor'),
  ('gear', 'iron_chainmail', 2, 'armor'),
  ('gear', 'steel_plate', 3, 'armor'),
  ('gear', 'gilded_aegis', 4, 'armor'),
  ('gear', 'dragon_scale_armor', 4, 'armor'),
  ('gear', 'voidsteel_plate', 5, 'armor'),
  ('gear', 'abyssal_bulwark', 6, 'armor'),
  ('gear', 'bronze_helm', 1, 'helmet'),
  ('gear', 'iron_helm', 2, 'helmet'),
  ('gear', 'steel_helm', 3, 'helmet'),
  ('gear', 'gilded_helm', 4, 'helmet'),
  ('gear', 'voidsteel_helm', 5, 'helmet'),
  ('gear', 'abyssal_helm', 6, 'helmet'),
  ('gear', 'leather_gloves', 1, 'gloves'),
  ('gear', 'iron_gauntlets', 2, 'gloves'),
  ('gear', 'steel_gauntlets', 3, 'gloves'),
  ('gear', 'gilded_gauntlets', 4, 'gloves'),
  ('gear', 'voidsteel_gauntlets', 5, 'gloves'),
  ('gear', 'abyssal_gauntlets', 6, 'gloves'),
  ('gear', 'leather_boots', 1, 'boots'),
  ('gear', 'iron_greaves', 2, 'boots'),
  ('gear', 'steel_greaves', 3, 'boots'),
  ('gear', 'gilded_greaves', 4, 'boots'),
  ('gear', 'voidsteel_greaves', 5, 'boots'),
  ('gear', 'abyssal_greaves', 6, 'boots'),
  ('gear', 'copper_ring', 1, 'ring'),
  ('gear', 'silver_ring', 2, 'ring'),
  ('gear', 'gold_ring', 3, 'ring'),
  ('gear', 'ruby_ring', 4, 'ring'),
  ('gear', 'obsidian_ring', 5, 'ring'),
  ('gear', 'abyssal_ring', 6, 'ring'),
  ('gear', 'bronze_buckler', 1, 'shield'),
  ('gear', 'iron_shield', 2, 'shield'),
  ('gear', 'steel_kite_shield', 3, 'shield'),
  ('gear', 'gilded_shield', 4, 'shield'),
  ('gear', 'voidsteel_shield', 5, 'shield'),
  ('gear', 'abyssal_shield', 6, 'shield'),
  ('unique', 'demon_fang_dagger', 2, 'weapon'),
  ('unique', 'demonhide_vest', 2, 'armor'),
  ('unique', 'bloodbound_cleaver', 3, 'weapon'),
  ('unique', 'bloodvein_plate', 3, 'armor'),
  ('unique', 'bone_ward', 3, 'shield'),
  ('unique', 'riftwalker_boots', 4, 'boots'),
  ('unique', 'shadow_hood', 4, 'helmet'),
  ('unique', 'abyss_heart_ring', 6, 'ring'),
  ('unique', 'bonecrusher_maul', 6, 'weapon'),
  ('unique', 'goblin_king_crown', 3, 'helmet'),
  ('unique', 'warchief_gauntlets', 4, 'gloves'),
  ('unique', 'warden_bulwark', 4, 'shield'),
  ('unique', 'lich_soul_ring', 5, 'ring'),
  ('unique', 'overlord_greataxe', 6, 'weapon')
on conflict (kind, template_id) do nothing;

alter table arena_private.admin_template_info enable row level security;
revoke all on table arena_private.admin_template_info from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Derived numbers, filled by the maintenance functions (never by a client).
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- One row per account: the few numbers of its save and of its latest server-extracted snapshot. refreshed_at is the last time THIS row was rebuilt.
create table if not exists arena_private.admin_player_cache (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hero_level integer,
  paragon_level integer,
  highest_floor integer,
  deepest_depth integer,
  gold numeric,
  items_common integer,
  items_rare integer,
  items_epic integer,
  items_legendary integer,
  refreshed_at timestamptz not null default now()
);

create index if not exists admin_player_cache_gold_idx on arena_private.admin_player_cache (gold desc nulls last);

-- One row per local day: what the saves held when the last refresh of that day ran. Gold is what the (client-authoritative) saves DECLARE: a circulation indicator, not an audited balance.
create table if not exists arena_private.admin_gold_daily (
  day date primary key,
  accounts integer not null,
  gold_total numeric not null,
  gold_avg numeric not null,
  gold_median numeric not null,
  gold_p90 numeric not null,
  gold_max numeric not null,
  top10_share numeric not null,
  pouch_count bigint not null default 0,
  pouch_gold numeric not null default 0,
  materials_qty numeric not null default 0,
  captured_at timestamptz not null default now()
);

-- One row per local day: sign-ups and active players (the history of active players cannot be rebuilt later: the retention job thins old snapshots).
create table if not exists arena_private.admin_daily (
  day date primary key,
  signups integer not null default 0,
  active_players integer not null default 0,
  captured_at timestamptz not null default now()
);

alter table arena_private.admin_player_cache enable row level security;
alter table arena_private.admin_gold_daily enable row level security;
alter table arena_private.admin_daily enable row level security;
revoke all on table arena_private.admin_player_cache from public, anon, authenticated;
revoke all on table arena_private.admin_gold_daily from public, anon, authenticated;
revoke all on table arena_private.admin_daily from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Indexes the dashboard needs on tables of the earlier migrations (indexes only; no column, no policy, no data changes).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create index if not exists characters_updated_at_idx on public.characters (updated_at desc);
create index if not exists progress_snapshots_created_idx on public.progress_snapshots (created_at);
create index if not exists item_certificates_admin_special_idx on public.item_certificates (created_at desc) where origin_certificate_id is null and (rarity = 'legendary' or kind = 'unique');
create index if not exists item_certificates_pouch_idx on public.item_certificates (created_at) where kind = 'gold_pouch';
create index if not exists item_certificate_events_burn_idx on public.item_certificate_events (created_at) where event = 'burn';
create index if not exists entitlements_granted_idx on public.entitlements (granted_at);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.is_admin(): the one question every admin function asks first. Callable by any signed-in user (it only ever answers about the caller), false for anon.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from arena_private.admins as a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_overview(): the numbers of the first page, in one call.
-- ---------------------------------------------------------------------------------------------------------------------------------------
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
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_tz := arena_private.admin_cfg('timezone', 'America/Sao_Paulo');
  v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_online := make_interval(mins => arena_private.admin_cfg('online_window_minutes', '5')::integer);
  v_price := arena_private.admin_cfg('pass_price_card_usd', '10.00')::numeric;

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
  select coalesce(jsonb_agg(jsonb_build_object('source', g.source, 'livemode', g.livemode, 'active', g.active, 'refunded', g.refunded, 'revoked', g.revoked) order by g.source, g.livemode desc), '[]'::jsonb)
  into v_pass_rows
  from (
    select e.source, e.livemode,
           count(*) filter (where e.status = 'active') as active,
           count(*) filter (where e.status = 'refunded') as refunded,
           count(*) filter (where e.status = 'revoked') as revoked
    from public.entitlements as e
    where e.kind = 'adventurer_pass'
    group by e.source, e.livemode
  ) as g;

  select jsonb_build_object(
    'by_source', v_pass_rows,
    'owners_active', (select count(distinct e.user_id) from public.entitlements as e where e.kind = 'adventurer_pass' and e.status = 'active'),
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_players(search, sort, dir, page, page_size, filters): one page of accounts plus the total.
--   p_search   matches (case-insensitive, substring) the username, the hero name and the e-mail, or is exactly an account id
--   p_sort     last_seen | created | level | floor | depth | gold | username
--   p_filters  { "online": true, "pass": "yes"|"no", "flagged": true, "wallet": true }
-- The e-mail comes back MASKED here; admin_player_detail returns it in full. Level, floor, depth and gold come from arena_private.admin_player_cache (refreshed by the maintenance job);
-- an account the job has not seen yet shows its latest snapshot instead.
-- ---------------------------------------------------------------------------------------------------------------------------------------
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
        or exists (select 1 from public.entitlements as e where e.user_id = u.id and e.kind = 'adventurer_pass' and e.status = 'active') = ((p_filters ->> 'pass') = 'yes')
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
    select e.source, e.livemode from public.entitlements as e
    where e.user_id = p.user_id and e.kind = 'adventurer_pass' and e.status = 'active'
    order by e.granted_at desc limit 1
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_player_detail(user): everything the drawer shows, INCLUDING the full e-mail. Only for admins. Returns null for an unknown id.
-- ---------------------------------------------------------------------------------------------------------------------------------------
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
      select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'source', e.source, 'provider_ref', e.provider_ref, 'status', e.status, 'livemode', e.livemode, 'granted_at', e.granted_at) order by e.granted_at desc), '[]'::jsonb)
      from public.entitlements as e where e.user_id = p_user_id
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_legendaries(search, page, page_size, filters): every Legendary piece and every unique ever ISSUED (a bought copy is not a new issue), newest first.
--   source   forge | pity | seal | drop (a Hunting unique) | boss (a boss unique)
--   status   held | listed | sold | bound | burned | revoked   (a Seal piece is born bound; a held piece the hero wears is bound)
--   p_filters { "source": "...", "status": "...", "kind": "gear"|"unique", "tier": 4, "from": "<iso>", "to": "<iso>" }
-- Seal Legendaries have no certificate (they are born bound), so they come from item_mint_requests. "pity" is a best-effort label: a normal forge of tier >= pity_min_tier that came after at least
-- pity_threshold such forges without a Legendary, counted from the mint requests (arena_private.admin_config). An item that was sold shows its CURRENT owner and state (the end of the origin chain).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_legendaries(
  p_search text default null,
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
  v_min_tier integer;
  v_threshold integer;
  v_from timestamptz;
  v_to timestamptz;
  v_total bigint;
  v_rows jsonb;
  v_summary jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset := greatest(coalesce(p_page, 0), 0) * v_size;
  v_search := nullif(btrim(p_search), '');
  v_like := '%' || replace(replace(replace(coalesce(v_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_min_tier := arena_private.admin_cfg('pity_min_tier', '4')::integer;
  v_threshold := arena_private.admin_cfg('pity_threshold', '40')::integer;
  v_from := nullif(p_filters ->> 'from', '')::timestamptz;
  v_to := nullif(p_filters ->> 'to', '')::timestamptz;

  with issued as (
    select c.id::text as item_id, c.id as cert_id, c.user_id, c.created_at, c.kind, c.template_id, c.rarity, c.tier, c.source as cert_source,
           case when c.status = 'transferred' then 'sold' when c.status = 'held' and c.bound then 'bound' else c.status end as status,
           c.request_id, false as seal
    from public.item_certificates as c
    where c.origin_certificate_id is null and (c.rarity = 'legendary' or c.kind = 'unique')
    union all
    select r.request_id, null::uuid, r.user_id, r.created_at, 'gear', r.template -> 'item' ->> 'templateId', 'legendary', info.tier, 'forge', 'bound', r.request_id, true
    from public.item_mint_requests as r
    left join arena_private.admin_template_info as info on info.kind = 'gear' and info.template_id = r.template -> 'item' ->> 'templateId'
    where r.kind = 'forge' and r.template -> 'item' ->> 'rarity' = 'legendary' and (r.template -> 'item' ->> 'certIndex') is null
  ),
  labelled as (
    select i.item_id, i.cert_id, i.user_id, i.created_at, i.kind, i.template_id, i.rarity, coalesce(info.tier, i.tier) as tier, info.slot, i.status, i.request_id,
           case
             when i.seal then 'seal'
             when i.cert_source = 'hunt_drop' then 'drop'
             when i.cert_source = 'boss_drop' then 'boss'
             when coalesce(pity.is_pity, false) then 'pity'
             else 'forge'
           end as src
    from issued as i
    left join arena_private.admin_template_info as info on info.kind = i.kind and info.template_id = i.template_id
    left join lateral (
      select (
        (
          select count(*)
          from public.item_mint_requests as q
          join arena_private.admin_template_info as qi on qi.kind = 'gear' and qi.template_id = q.template -> 'item' ->> 'templateId'
          where q.user_id = i.user_id and q.kind = 'forge'
            and not coalesce((q.template -> 'item' ->> 'bound')::boolean, false)
            and qi.tier >= v_min_tier
            and q.created_at < req.created_at
            and q.created_at > coalesce((
              select max(q2.created_at)
              from public.item_mint_requests as q2
              join arena_private.admin_template_info as qi2 on qi2.kind = 'gear' and qi2.template_id = q2.template -> 'item' ->> 'templateId'
              where q2.user_id = i.user_id and q2.kind = 'forge'
                and not coalesce((q2.template -> 'item' ->> 'bound')::boolean, false)
                and qi2.tier >= v_min_tier
                and q2.template -> 'item' ->> 'rarity' = 'legendary'
                and q2.created_at < req.created_at
            ), '-infinity'::timestamptz)
        ) >= v_threshold
        and coalesce(info.tier, i.tier, 0) >= v_min_tier
      ) as is_pity
      from public.item_mint_requests as req
      where i.cert_source = 'forge' and not i.seal and i.kind = 'gear' and req.user_id = i.user_id and req.request_id = i.request_id
    ) as pity on true
  ),
  filtered as (
    select l.*
    from labelled as l
    left join public.profiles as pr on pr.user_id = l.user_id
    where (v_search is null or l.template_id ilike v_like or pr.username ilike v_like or l.user_id::text = v_search or l.item_id = v_search)
      and (p_filters ->> 'source' is null or l.src = p_filters ->> 'source')
      and (p_filters ->> 'status' is null or l.status = p_filters ->> 'status')
      and (p_filters ->> 'kind' is null or l.kind = p_filters ->> 'kind')
      and (p_filters ->> 'tier' is null or l.tier = (p_filters ->> 'tier')::integer)
      and (v_from is null or l.created_at >= v_from)
      and (v_to is null or l.created_at < v_to)
  ),
  page as (
    select f.*, row_number() over (order by f.created_at desc, f.item_id) as rn
    from filtered as f
    order by rn
    limit v_size offset v_offset
  ),
  enriched as (
    select p.*, own.user_id as owner_id, own.status as owner_status, own.bound as owner_bound
    from page as p
    left join lateral (
      with recursive chain as (
        select c.id, c.user_id, c.status, c.bound, 0 as depth
        from public.item_certificates as c
        where c.id = p.cert_id
        union all
        select n.id, n.user_id, n.status, n.bound, ch.depth + 1
        from public.item_certificates as n
        join chain as ch on n.origin_certificate_id = ch.id
        where ch.status = 'transferred' and ch.depth < 25
      )
      select x.user_id, x.status, x.bound from chain as x order by x.depth desc limit 1
    ) as own on true
  )
  select (select count(*) from filtered),
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'item_id', e.item_id,
             'issued_at', e.created_at,
             'user_id', e.user_id,
             'username', pr.username,
             'kind', e.kind,
             'template_id', e.template_id,
             'tier', e.tier,
             'slot', e.slot,
             'rarity', e.rarity,
             'source', e.src,
             'status', e.status,
             'current_owner_id', coalesce(e.owner_id, e.user_id),
             'current_owner_username', cpr.username,
             'current_status', case when e.cert_id is null then 'bound' when e.owner_status = 'held' and e.owner_bound then 'bound' when e.owner_status = 'transferred' then 'sold' else coalesce(e.owner_status, e.status) end
           ) order by e.rn)
           from enriched as e
           left join public.profiles as pr on pr.user_id = e.user_id
           left join public.profiles as cpr on cpr.user_id = coalesce(e.owner_id, e.user_id)
         ), '[]'::jsonb),
         jsonb_build_object(
           'by_source', coalesce((select jsonb_object_agg(s.src, s.n) from (select f.src, count(*) as n from filtered as f group by f.src) as s), '{}'::jsonb),
           'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from (select f.status, count(*) as n from filtered as f group by f.status) as s), '{}'::jsonb),
           'by_rarity_kind', coalesce((select jsonb_object_agg(s.k, s.n) from (select f.kind as k, count(*) as n from filtered as f group by f.kind) as s), '{}'::jsonb)
         )
  into v_total, v_rows, v_summary;

  return jsonb_build_object('total', v_total, 'page', greatest(coalesce(p_page, 0), 0), 'page_size', v_size, 'rows', v_rows, 'summary', v_summary);
end;
$$;

revoke all on function public.admin_legendaries(text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.admin_legendaries(text, integer, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_market(view, search, page, page_size, filters): listings or sales with prices (in lamports; 1 SOL = 1,000,000,000), the 5% fee, buyer, seller and the transaction signature.
--   p_view     'sales' (default) | 'listings'
--   p_filters  { "mode": "live"|"test"|"all" (sales only, default all), "status": "open"|"reserved"|"sold"|"cancelled"|"expired" (listings only), "kind": "item"|"material", "from": "<iso>", "to": "<iso>" }
-- Search matches a username (seller or buyer), the template / material id, or exactly a transaction signature or id. "totals" sums the whole filtered set, not only the page.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_market(
  p_view text default 'sales',
  p_search text default null,
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
  v_from timestamptz;
  v_to timestamptz;
  v_mode text;
  v_total bigint;
  v_rows jsonb;
  v_totals jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  if p_view is null or p_view not in ('sales', 'listings') then
    raise exception using errcode = '22023', message = 'ADMIN_BAD_VIEW';
  end if;

  v_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset := greatest(coalesce(p_page, 0), 0) * v_size;
  v_search := nullif(btrim(p_search), '');
  v_like := '%' || replace(replace(replace(coalesce(v_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_from := nullif(p_filters ->> 'from', '')::timestamptz;
  v_to := nullif(p_filters ->> 'to', '')::timestamptz;
  v_mode := coalesce(nullif(p_filters ->> 'mode', ''), 'all');

  if p_view = 'sales' then
    with filtered as (
      select s.*, sp.username as seller_username, bp.username as buyer_username
      from public.market_sales as s
      left join public.profiles as sp on sp.user_id = s.seller_id
      left join public.profiles as bp on bp.user_id = s.buyer_id
      where (v_search is null or sp.username ilike v_like or bp.username ilike v_like or s.item_template ilike v_like or s.material_id ilike v_like
             or s.tx_signature = v_search or s.id::text = v_search or s.seller_id::text = v_search or s.buyer_id::text = v_search)
        and (v_mode = 'all' or (v_mode = 'live' and s.livemode) or (v_mode = 'test' and not s.livemode))
        and (p_filters ->> 'kind' is null or (p_filters ->> 'kind' = 'material') = (s.material_id is not null))
        and (v_from is null or s.sold_at >= v_from)
        and (v_to is null or s.sold_at < v_to)
    ),
    page as (
      select f.*, row_number() over (order by f.sold_at desc, f.id) as rn
      from filtered as f
      order by rn
      limit v_size offset v_offset
    )
    select (select count(*) from filtered),
           coalesce((select jsonb_agg(jsonb_build_object(
             'id', p.id, 'sold_at', p.sold_at, 'seller_id', p.seller_id, 'seller_username', p.seller_username, 'buyer_id', p.buyer_id, 'buyer_username', p.buyer_username,
             'item_kind', p.item_kind, 'item_template', p.item_template, 'material_id', p.material_id, 'material_qty', p.material_qty,
             'price_lamports', p.price_lamports, 'fee_lamports', p.fee_lamports, 'seller_lamports', p.seller_lamports,
             'tx_signature', p.tx_signature, 'livemode', p.livemode
           ) order by p.rn) from page as p), '[]'::jsonb),
           (select jsonb_build_object('count', count(*), 'volume_lamports', coalesce(sum(f.price_lamports), 0), 'fee_lamports', coalesce(sum(f.fee_lamports), 0),
                                      'buyers', count(distinct f.buyer_id), 'sellers', count(distinct f.seller_id)) from filtered as f)
    into v_total, v_rows, v_totals;
  else
    with filtered as (
      select l.*, sp.username as seller_username, c.template_id, c.kind as cert_kind, c.rarity, c.tier
      from public.market_listings as l
      left join public.profiles as sp on sp.user_id = l.seller_id
      left join public.item_certificates as c on c.id = l.certificate_id
      where (v_search is null or sp.username ilike v_like or c.template_id ilike v_like or l.material_id ilike v_like or l.id::text = v_search or l.seller_id::text = v_search)
        and (p_filters ->> 'status' is null or l.status = p_filters ->> 'status')
        and (p_filters ->> 'kind' is null or (p_filters ->> 'kind' = 'material') = (l.material_id is not null))
        and (v_from is null or l.created_at >= v_from)
        and (v_to is null or l.created_at < v_to)
    ),
    page as (
      select f.*, row_number() over (order by f.created_at desc, f.id) as rn
      from filtered as f
      order by rn
      limit v_size offset v_offset
    )
    select (select count(*) from filtered),
           coalesce((select jsonb_agg(jsonb_build_object(
             'id', p.id, 'created_at', p.created_at, 'seller_id', p.seller_id, 'seller_username', p.seller_username, 'status', p.status,
             'item_kind', p.cert_kind, 'item_template', p.template_id, 'rarity', p.rarity, 'tier', p.tier, 'material_id', p.material_id, 'material_qty', p.material_qty,
             'price_lamports', p.price_lamports, 'expires_at', p.expires_at, 'closed_at', p.closed_at
           ) order by p.rn) from page as p), '[]'::jsonb),
           (select jsonb_build_object('count', count(*), 'open_price_lamports', coalesce(sum(f.price_lamports) filter (where f.status in ('open', 'reserved')), 0)) from filtered as f)
    into v_total, v_rows, v_totals;
  end if;

  return jsonb_build_object('view', p_view, 'total', v_total, 'page', greatest(coalesce(p_page, 0), 0), 'page_size', v_size, 'rows', v_rows, 'totals', v_totals);
end;
$$;

revoke all on function public.admin_market(text, text, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.admin_market(text, text, integer, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_economy(): the circulation page. Gold comes from the daily aggregate (never a live scan of the saves); everything else is live.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_economy()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gold_latest jsonb;
  v_gold_series jsonb;
  v_gold_top jsonb;
  v_saves_items jsonb;
  v_pouches jsonb;
  v_pouch_by_id jsonb;
  v_materials jsonb;
  v_items jsonb;
  v_sol jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  select to_jsonb(g) into v_gold_latest from arena_private.admin_gold_daily as g order by g.day desc limit 1;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.day), '[]'::jsonb) into v_gold_series
  from (select * from arena_private.admin_gold_daily as x order by x.day desc limit 120) as g;

  select coalesce(jsonb_agg(jsonb_build_object('user_id', t.user_id, 'username', t.username, 'gold', t.gold, 'hero_level', t.hero_level) order by t.gold desc), '[]'::jsonb) into v_gold_top
  from (
    select pc.user_id, pr.username, pc.gold, pc.hero_level
    from arena_private.admin_player_cache as pc
    left join public.profiles as pr on pr.user_id = pc.user_id
    where pc.gold is not null
    order by pc.gold desc
    limit 10
  ) as t;

  select jsonb_build_object(
    'accounts', count(*),
    'common', coalesce(sum(pc.items_common), 0),
    'rare', coalesce(sum(pc.items_rare), 0),
    'epic', coalesce(sum(pc.items_epic), 0),
    'legendary', coalesce(sum(pc.items_legendary), 0),
    'refreshed_at', max(pc.refreshed_at)
  ) into v_saves_items
  from arena_private.admin_player_cache as pc;

  select jsonb_build_object(
    'outstanding', count(*) filter (where c.status in ('held', 'listed')),
    'outstanding_gold', coalesce(sum(c.gold_amount) filter (where c.status in ('held', 'listed')), 0),
    'listed', count(*) filter (where c.status = 'listed'),
    'minted', count(*) filter (where c.origin_certificate_id is null),
    'opened', count(*) filter (where c.status = 'burned'),
    'minted_gold', coalesce(sum(c.gold_amount) filter (where c.origin_certificate_id is null), 0),
    'opened_gold', coalesce(sum(c.gold_amount) filter (where c.status = 'burned'), 0)
  ) into v_pouches
  from public.item_certificates as c
  where c.kind = 'gold_pouch';

  select coalesce(jsonb_agg(jsonb_build_object('pouch_id', g.template_id, 'count', g.n, 'gold', g.gold) order by g.gold desc), '[]'::jsonb) into v_pouch_by_id
  from (
    select c.template_id, count(*) as n, coalesce(sum(c.gold_amount), 0) as gold
    from public.item_certificates as c
    where c.kind = 'gold_pouch' and c.status in ('held', 'listed')
    group by c.template_id
  ) as g;

  select coalesce(jsonb_agg(jsonb_build_object('material_id', m.material_id, 'qty', m.qty, 'pending', m.pending, 'listed', m.listed, 'holders', m.holders) order by m.qty + m.listed desc, m.material_id), '[]'::jsonb) into v_materials
  from (
    select coalesce(b.material_id, l.material_id) as material_id, coalesce(b.qty, 0) as qty, coalesce(b.pending, 0) as pending, coalesce(l.listed, 0) as listed, coalesce(b.holders, 0) as holders
    from (select mb.material_id, sum(mb.qty) as qty, sum(mb.pending) as pending, count(*) filter (where mb.qty > 0) as holders from public.material_balances as mb group by mb.material_id) as b
    full join (select ml.material_id, sum(ml.material_qty) as listed from public.market_listings as ml where ml.status in ('open', 'reserved') and ml.material_id is not null group by ml.material_id) as l
      on l.material_id = b.material_id
  ) as m;

  select coalesce(jsonb_agg(jsonb_build_object('kind', g.kind, 'rarity', g.rarity, 'status', g.status, 'bound', g.bound, 'bought', g.bought, 'count', g.n) order by g.kind, g.rarity, g.status), '[]'::jsonb) into v_items
  from (
    select c.kind, c.rarity, c.status, c.bound, (c.origin_certificate_id is not null) as bought, count(*) as n
    from public.item_certificates as c
    group by c.kind, c.rarity, c.status, c.bound, (c.origin_certificate_id is not null)
  ) as g;

  select jsonb_build_object(
    'volume_7d_lamports', coalesce(sum(s.price_lamports) filter (where s.sold_at >= now() - interval '7 days'), 0),
    'volume_30d_lamports', coalesce(sum(s.price_lamports) filter (where s.sold_at >= now() - interval '30 days'), 0),
    'fees_7d_lamports', coalesce(sum(s.fee_lamports) filter (where s.sold_at >= now() - interval '7 days'), 0),
    'fees_30d_lamports', coalesce(sum(s.fee_lamports) filter (where s.sold_at >= now() - interval '30 days'), 0),
    'volume_total_lamports', coalesce(sum(s.price_lamports), 0),
    'fees_total_lamports', coalesce(sum(s.fee_lamports), 0),
    'sales_total', count(*)
  ) into v_sol
  from public.market_sales as s
  where s.livemode;

  return jsonb_build_object(
    'generated_at', now(),
    'gold_latest', v_gold_latest,
    'gold_series', v_gold_series,
    'gold_top', v_gold_top,
    'saves_items', v_saves_items,
    'pouches', v_pouches,
    'pouches_by_id', v_pouch_by_id,
    'materials', v_materials,
    'items', v_items,
    'sol', v_sol
  );
end;
$$;

revoke all on function public.admin_economy() from public, anon, authenticated;
grant execute on function public.admin_economy() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_economy_series(days): one object per local day, oldest first (1 to 365 days). Sign-ups come from the accounts, active players from arena_private.admin_daily (the history of "who played"
-- is kept there on purpose), the rest from the permanent tables. Pass sales are counted when granted: 'stripe' and 'usdc' are LIVE sales only, 'test' the test-mode ones, 'grant' and 'referral' free ones.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_economy_series(p_days integer default 30)
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
  v_price numeric;
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_days := least(greatest(coalesce(p_days, 30), 1), 365);
  v_tz := arena_private.admin_cfg('timezone', 'America/Sao_Paulo');
  v_price := arena_private.admin_cfg('pass_price_card_usd', '10.00')::numeric;
  v_end := (now() at time zone v_tz)::date;
  v_start := v_end - (v_days - 1);
  v_since := v_start::timestamp at time zone v_tz;

  with d as (
    select g::date as day from generate_series(v_start::timestamp, v_end::timestamp, interval '1 day') as g
  ),
  su as (
    select (u.created_at at time zone v_tz)::date as day, count(*) as n
    from auth.users as u where u.created_at >= v_since group by 1
  ),
  sales as (
    select (s.sold_at at time zone v_tz)::date as day, count(*) as n, sum(s.price_lamports) as volume, sum(s.fee_lamports) as fee
    from public.market_sales as s where s.livemode and s.sold_at >= v_since group by 1
  ),
  pass as (
    select (e.granted_at at time zone v_tz)::date as day,
           count(*) filter (where e.source = 'stripe' and e.livemode) as stripe,
           count(*) filter (where e.source = 'crypto_sol' and e.livemode) as usdc,
           count(*) filter (where not e.livemode and e.source not in ('grant', 'referral')) as test,
           count(*) filter (where e.source = 'grant') as grants,
           count(*) filter (where e.source = 'referral') as referral,
           count(*) filter (where e.livemode and e.source not in ('stripe', 'crypto_sol', 'grant', 'referral')) as other
    from public.entitlements as e
    where e.kind = 'adventurer_pass' and e.granted_at >= v_since
    group by 1
  ),
  usdc as (
    select (p.created_at at time zone v_tz)::date as day, sum(p.amount_units) / 1000000 as usd
    from public.chain_payments as p
    where p.purpose = 'pass' and p.status = 'applied' and p.livemode and p.created_at >= v_since
    group by 1
  ),
  leg as (
    select (x.created_at at time zone v_tz)::date as day, count(*) filter (where x.kind = 'gear') as legendaries, count(*) filter (where x.kind = 'unique') as uniques
    from (
      select c.created_at, c.kind
      from public.item_certificates as c
      where c.origin_certificate_id is null and (c.rarity = 'legendary' or c.kind = 'unique') and c.created_at >= v_since
      union all
      select r.created_at, 'gear'
      from public.item_mint_requests as r
      where r.kind = 'forge' and r.created_at >= v_since and r.template -> 'item' ->> 'rarity' = 'legendary' and (r.template -> 'item' ->> 'certIndex') is null
    ) as x
    group by 1
  ),
  pm as (
    select (c.created_at at time zone v_tz)::date as day, count(*) as n, coalesce(sum(c.gold_amount), 0) as gold
    from public.item_certificates as c
    where c.kind = 'gold_pouch' and c.origin_certificate_id is null and c.created_at >= v_since
    group by 1
  ),
  po as (
    select (e.created_at at time zone v_tz)::date as day, count(*) as n
    from public.item_certificate_events as e
    join public.item_certificates as c on c.id = e.certificate_id
    where e.event = 'burn' and e.created_at >= v_since and c.kind = 'gold_pouch'
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'signups', coalesce(su.n, 0),
    'active_players', coalesce(ad.active_players, 0),
    'sales', coalesce(sales.n, 0),
    'volume_lamports', coalesce(sales.volume, 0),
    'fee_lamports', coalesce(sales.fee, 0),
    'pass_stripe', coalesce(pass.stripe, 0),
    'pass_usdc', coalesce(pass.usdc, 0),
    'pass_test', coalesce(pass.test, 0),
    'pass_grant', coalesce(pass.grants, 0),
    'pass_referral', coalesce(pass.referral, 0),
    'pass_other', coalesce(pass.other, 0),
    'pass_revenue_usd', coalesce(pass.stripe, 0) * v_price + coalesce(usdc.usd, 0),
    'legendaries', coalesce(leg.legendaries, 0),
    'uniques', coalesce(leg.uniques, 0),
    'pouches_minted', coalesce(pm.n, 0),
    'pouches_minted_gold', coalesce(pm.gold, 0),
    'pouches_opened', coalesce(po.n, 0)
  ) order by d.day), '[]'::jsonb)
  into v_out
  from d
  left join su on su.day = d.day
  left join arena_private.admin_daily as ad on ad.day = d.day
  left join sales on sales.day = d.day
  left join pass on pass.day = d.day
  left join usdc on usdc.day = d.day
  left join leg on leg.day = d.day
  left join pm on pm.day = d.day
  left join po on po.day = d.day;

  return v_out;
end;
$$;

revoke all on function public.admin_economy_series(integer) from public, anon, authenticated;
grant execute on function public.admin_economy_series(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_flags(page, page_size, filters): the anti-cheat audit queue. One row per account that has an open progress flag, an item flag or a disqualification.
--   p_filters { "kind": "progress"|"items"|"disqualified", "search": "<username or account id>" }
-- "Open" is the same rule the ranking uses (arena_private.has_open_flags): a non-ok snapshot since the League reset that the owner has not cleared. The result also carries the count of accounts per reason code.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_flags(
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
  v_reset timestamptz;
  v_total bigint;
  v_rows jsonb;
  v_reasons jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset := greatest(coalesce(p_page, 0), 0) * v_size;
  v_search := nullif(btrim(p_filters ->> 'search'), '');
  v_like := '%' || replace(replace(replace(coalesce(v_search, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  select g.reset_at into v_reset from arena_private.season_goal as g where g.id;

  with open_snaps as (
    select f.id, f.user_id, f.verdict, f.reasons, f.created_at
    from public.progress_snapshots as f
    where f.verdict <> 'ok'
      and f.created_at >= coalesce(v_reset, '-infinity'::timestamptz)
      and not exists (select 1 from public.progress_flag_clears as k where k.snapshot_id = f.id)
  ),
  prog as (
    select o.user_id,
           count(distinct o.id) filter (where o.verdict = 'flagged') as flagged,
           count(distinct o.id) filter (where o.verdict = 'rejected') as rejected,
           max(o.created_at) as last_at,
           array_agg(distinct r.reason) filter (where r.reason is not null) as reasons
    from open_snaps as o
    left join lateral unnest(o.reasons) as r (reason) on true
    group by o.user_id
  ),
  itm as (
    select f.user_id, count(*) as n, max(f.created_at) as last_at, array_agg(distinct f.code) as codes
    from arena_private.item_account_flags as f
    group by f.user_id
  ),
  dq as (
    select e.user_id, true as disqualified
    from public.season_entries as e
    where e.disqualified
    group by e.user_id
  ),
  merged as (
    select coalesce(p.user_id, i.user_id, q.user_id) as user_id,
           coalesce(p.flagged, 0) as flagged, coalesce(p.rejected, 0) as rejected, p.reasons as reasons,
           coalesce(i.n, 0) as item_flags, i.codes as item_codes,
           coalesce(q.disqualified, false) as disqualified,
           greatest(p.last_at, i.last_at) as last_at
    from prog as p
    full join itm as i on i.user_id = p.user_id
    full join dq as q on q.user_id = coalesce(p.user_id, i.user_id)
  ),
  filtered as (
    select m.*, pr.username
    from merged as m
    left join public.profiles as pr on pr.user_id = m.user_id
    where (v_search is null or pr.username ilike v_like or m.user_id::text = v_search)
      and (p_filters ->> 'kind' is null
           or (p_filters ->> 'kind' = 'progress' and (m.flagged + m.rejected) > 0)
           or (p_filters ->> 'kind' = 'items' and m.item_flags > 0)
           or (p_filters ->> 'kind' = 'disqualified' and m.disqualified))
  ),
  page as (
    select f.*, row_number() over (order by f.last_at desc nulls last, f.user_id) as rn
    from filtered as f
    order by rn
    limit v_size offset v_offset
  )
  select (select count(*) from filtered),
         coalesce((select jsonb_agg(jsonb_build_object(
           'user_id', p.user_id,
           'username', p.username,
           'flagged_snapshots', p.flagged,
           'rejected_snapshots', p.rejected,
           'reasons', coalesce(to_jsonb(p.reasons), '[]'::jsonb),
           'item_flags', p.item_flags,
           'item_codes', coalesce(to_jsonb(p.item_codes), '[]'::jsonb),
           'disqualified', p.disqualified,
           'last_flag_at', p.last_at,
           'hero_level', pc.hero_level,
           'paragon_level', pc.paragon_level,
           'highest_floor', pc.highest_floor,
           'pass_source', pass.source,
           'last_seen', ch.updated_at
         ) order by p.rn)
         from page as p
         left join arena_private.admin_player_cache as pc on pc.user_id = p.user_id
         left join public.characters as ch on ch.user_id = p.user_id
         left join lateral (
           select e.source from public.entitlements as e where e.user_id = p.user_id and e.kind = 'adventurer_pass' and e.status = 'active' order by e.granted_at desc limit 1
         ) as pass on true), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('code', x.code, 'players', x.n) order by x.n desc, x.code)
                   from (
                     select code, count(distinct user_id) as n from (
                       select m.user_id, unnest(m.reasons) as code from merged as m
                       union all
                       select m.user_id, unnest(m.item_codes) from merged as m
                     ) as u where code is not null group by code
                   ) as x), '[]'::jsonb)
  into v_total, v_rows, v_reasons;

  return jsonb_build_object('total', v_total, 'page', greatest(coalesce(p_page, 0), 0), 'page_size', v_size, 'rows', v_rows, 'reasons', v_reasons, 'reset_at', v_reset);
end;
$$;

revoke all on function public.admin_flags(integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.admin_flags(integer, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_league(season, top): the League page. Status, the Pass goal, the counters and the TOP of the audit ranking. Every row says whether the PUBLIC ranking would show that player
-- ("eligible"): Pass owner with a live Pass, not disqualified, and (outside the pre-season) no flag on the entry and no open flag. The score decodes as in season_my_entry.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_league(p_season integer default null, p_top integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_top integer;
  v_season integer;
  v_status jsonb;
  v_goal jsonb;
  v_counts jsonb;
  v_rows jsonb;
  v_seasons jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;

  v_top := least(greatest(coalesce(p_top, 50), 1), 500);
  v_season := coalesce(p_season, (select s.number from public.seasons as s where s.status in ('open', 'frozen') order by (s.kind = 'ranked') desc, s.number desc limit 1));

  select jsonb_build_object('number', s.number, 'kind', s.kind, 'status', s.status, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'freeze_at', s.freeze_at, 'prize_note', s.prize_note)
  into v_status
  from public.seasons as s
  where s.number = v_season;

  select jsonb_build_object(
    'target', g.target,
    'paid', arena_private.paid_pass_count(),
    'season_number', g.season_number,
    'opened_at', g.opened_at,
    'reset_at', g.reset_at
  ) into v_goal
  from arena_private.season_goal as g
  where g.id;

  select coalesce(jsonb_agg(jsonb_build_object('number', s.number, 'kind', s.kind, 'status', s.status) order by s.number), '[]'::jsonb) into v_seasons from public.seasons as s;

  select jsonb_build_object(
    'entries', count(*),
    'with_score', count(*) filter (where e.score > 0),
    'flagged', count(*) filter (where cardinality(e.flags) > 0),
    'disqualified', count(*) filter (where e.disqualified)
  ) into v_counts
  from public.season_entries as e
  where e.season = v_season;

  select coalesce(jsonb_agg(jsonb_build_object(
    'audit_rank', t.rn,
    'user_id', t.user_id,
    'username', t.username,
    'score', t.score,
    'level_total', (t.score / 1000000),
    'hero_level', least((t.score / 1000000), 100),
    'paragon_level', greatest((t.score / 1000000) - 100, 0),
    'highest_floor', least((t.score % 1000000), 100),
    'deepest_depth', greatest((t.score % 1000000) - 100, 0),
    'tiebreak_at', t.tiebreak_at,
    'entry_flags', coalesce(to_jsonb(t.flags), '[]'::jsonb),
    'open_flags', t.open_flags,
    'item_flags', t.item_flags,
    'disqualified', t.disqualified,
    'has_pass', t.pass_ok,
    'eligible', (not t.disqualified and t.pass_ok and (t.kind = 'pre' or (cardinality(t.flags) = 0 and not t.open_flags)))
  ) order by t.rn), '[]'::jsonb)
  into v_rows
  from (
    select row_number() over (order by e.score desc, e.tiebreak_at asc, e.user_id) as rn,
           e.user_id, pr.username, e.score, e.tiebreak_at, e.flags, e.disqualified, s.kind,
           arena_private.has_open_flags(e.user_id) as open_flags,
           arena_private.has_item_flags(e.user_id) as item_flags,
           arena_private.owns_ranking_pass(e.user_id) as pass_ok
    from public.season_entries as e
    join public.seasons as s on s.number = e.season
    left join public.profiles as pr on pr.user_id = e.user_id
    where e.season = v_season and e.score > 0
    order by e.score desc, e.tiebreak_at asc, e.user_id
    limit v_top
  ) as t;

  return jsonb_build_object('season', v_status, 'goal', v_goal, 'counts', v_counts, 'seasons', v_seasons, 'top', v_rows);
end;
$$;

revoke all on function public.admin_league(integer, integer) from public, anon, authenticated;
grant execute on function public.admin_league(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_waitlist(days): the waiting list. Totals, sign-ups per local day, by source, and the top referrers (their e-mail masked).
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

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- MAINTENANCE (service role / pg_cron only; never callable by a client). These two functions are the only code in this file that writes, and only to the derived tables above.
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- arena_private.admin_refresh_daily(backfill_days): upserts sign-ups and active players for today and the (backfill_days - 1) days before it. Cheap (indexed counts): schedule it every 15 minutes to an hour.
-- Run it once with 90 to fill the past (active players come from the snapshots that still exist). active_players never goes down on a re-run, so the retention job cannot shrink a day already stored.
create or replace function arena_private.admin_refresh_daily(p_backfill_days integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := arena_private.admin_cfg('timezone', 'America/Sao_Paulo');
  v_days integer := least(greatest(coalesce(p_backfill_days, 1), 1), 400);
  v_today date := (now() at time zone arena_private.admin_cfg('timezone', 'America/Sao_Paulo'))::date;
  v_rows integer;
begin
  insert into arena_private.admin_daily as ad (day, signups, active_players, captured_at)
  select g.day,
         (select count(*) from auth.users as u where u.created_at >= g.day::timestamp at time zone v_tz and u.created_at < (g.day + 1)::timestamp at time zone v_tz),
         greatest(
           (select count(distinct s.user_id) from public.progress_snapshots as s where s.created_at >= g.day::timestamp at time zone v_tz and s.created_at < (g.day + 1)::timestamp at time zone v_tz),
           case when g.day = v_today then (select count(*) from public.characters as c where c.updated_at >= g.day::timestamp at time zone v_tz) else 0 end
         ),
         now()
  from (select x::date as day from generate_series((v_today - (v_days - 1))::timestamp, v_today::timestamp, interval '1 day') as x) as g
  on conflict (day) do update
    set signups = excluded.signups,
        active_players = greatest(ad.active_players, excluded.active_players),
        captured_at = excluded.captured_at;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function arena_private.admin_refresh_daily(integer) from public, anon, authenticated;
grant execute on function arena_private.admin_refresh_daily(integer) to service_role;

-- arena_private.admin_refresh_aggregates(full): rebuilds arena_private.admin_player_cache for the characters that changed since their row was last built (or all of them with p_full), then writes today's
-- row of arena_private.admin_gold_daily from the cache (cheap) plus the pouches and tradeable materials. The expensive part (reading changed saves) only touches saves that changed: schedule it every 6 hours.
create or replace function arena_private.admin_refresh_aggregates(p_full boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := arena_private.admin_cfg('timezone', 'America/Sao_Paulo');
  v_day date := (now() at time zone arena_private.admin_cfg('timezone', 'America/Sao_Paulo'))::date;
  v_stamp timestamptz := now() - interval '2 minutes';
  v_changed integer;
  v_removed integer;
  v_pouch_count bigint;
  v_pouch_gold numeric;
  v_materials numeric;
begin
  insert into arena_private.admin_player_cache as pc (user_id, hero_level, paragon_level, highest_floor, deepest_depth, gold, items_common, items_rare, items_epic, items_legendary, refreshed_at)
  select c.user_id,
         least(greatest((m.metrics ->> 'heroLevel')::numeric, 0), 1000)::integer,
         least(greatest((m.metrics ->> 'paragonLevel')::numeric, 0), 100000)::integer,
         least(greatest((m.metrics ->> 'highestFloor')::numeric, 0), 1000)::integer,
         least(greatest((m.metrics ->> 'deepestDepth')::numeric, 0), 1000000)::integer,
         case when jsonb_typeof(c.save_data -> 'gold') = 'number' then least(greatest((c.save_data ->> 'gold')::numeric, 0), 1000000000000000) else null end,
         least(greatest((m.metrics -> 'items' ->> 'common')::numeric, 0), 1000000)::integer,
         least(greatest((m.metrics -> 'items' ->> 'rare')::numeric, 0), 1000000)::integer,
         least(greatest((m.metrics -> 'items' ->> 'epic')::numeric, 0), 1000000)::integer,
         least(greatest((m.metrics -> 'items' ->> 'legendary')::numeric, 0), 1000000)::integer,
         v_stamp
  from public.characters as c
  left join arena_private.admin_player_cache as old on old.user_id = c.user_id
  left join lateral (
    select s.metrics from public.progress_snapshots as s
    where s.user_id = c.user_id and s.verdict <> 'rejected'
    order by s.created_at desc limit 1
  ) as m on true
  where p_full or old.user_id is null or c.updated_at >= old.refreshed_at
  on conflict (user_id) do update
    set hero_level = excluded.hero_level, paragon_level = excluded.paragon_level, highest_floor = excluded.highest_floor, deepest_depth = excluded.deepest_depth,
        gold = excluded.gold, items_common = excluded.items_common, items_rare = excluded.items_rare, items_epic = excluded.items_epic, items_legendary = excluded.items_legendary,
        refreshed_at = excluded.refreshed_at;
  get diagnostics v_changed = row_count;

  delete from arena_private.admin_player_cache as pc where not exists (select 1 from public.characters as c where c.user_id = pc.user_id);
  get diagnostics v_removed = row_count;

  select count(*), coalesce(sum(c.gold_amount), 0) into v_pouch_count, v_pouch_gold
  from public.item_certificates as c
  where c.kind = 'gold_pouch' and c.status in ('held', 'listed');

  select coalesce((select sum(b.qty) from public.material_balances as b), 0) + coalesce((select sum(l.material_qty) from public.market_listings as l where l.status in ('open', 'reserved') and l.material_id is not null), 0)
  into v_materials;

  insert into arena_private.admin_gold_daily as gd (day, accounts, gold_total, gold_avg, gold_median, gold_p90, gold_max, top10_share, pouch_count, pouch_gold, materials_qty, captured_at)
  select v_day,
         count(*),
         coalesce(sum(r.gold), 0),
         coalesce(avg(r.gold), 0),
         coalesce(percentile_cont(0.5) within group (order by r.gold), 0),
         coalesce(percentile_cont(0.9) within group (order by r.gold), 0),
         coalesce(max(r.gold), 0),
         coalesce(sum(r.gold) filter (where r.rn <= 10) / nullif(sum(r.gold), 0), 0),
         v_pouch_count, v_pouch_gold, v_materials, now()
  from (select pc.gold, row_number() over (order by pc.gold desc) as rn from arena_private.admin_player_cache as pc where pc.gold is not null) as r
  on conflict (day) do update
    set accounts = excluded.accounts, gold_total = excluded.gold_total, gold_avg = excluded.gold_avg, gold_median = excluded.gold_median, gold_p90 = excluded.gold_p90,
        gold_max = excluded.gold_max, top10_share = excluded.top10_share, pouch_count = excluded.pouch_count, pouch_gold = excluded.pouch_gold,
        materials_qty = excluded.materials_qty, captured_at = excluded.captured_at;

  return jsonb_build_object('day', v_day, 'rebuilt', v_changed, 'removed', v_removed, 'full', p_full);
end;
$$;

revoke all on function arena_private.admin_refresh_aggregates(boolean) from public, anon, authenticated;
grant execute on function arena_private.admin_refresh_aggregates(boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically). Replace <ADMIN> with your account id and <PLAYER> with any other account id.
--
-- A. A normal player and anon are refused. In the SQL editor:
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<PLAYER>","role":"authenticated"}', true);
--      select public.is_admin();                    -> false
--      select public.admin_overview();              -> ERROR ADMIN_ONLY (42501)
--      select public.admin_players();               -> ERROR ADMIN_ONLY
--      select public.admin_player_detail('<PLAYER>'); select public.admin_legendaries(); select public.admin_market(); select public.admin_economy();
--      select public.admin_economy_series(30); select public.admin_flags(); select public.admin_league(); select public.admin_waitlist();   -> every one: ERROR ADMIN_ONLY
--      select * from arena_private.admins;          -> permission denied for schema arena_private
--      set local role anon; select public.is_admin();  -> permission denied for function is_admin   (and the same for each admin_* function)
--    Same from the app: sign in as a normal account, the page must say "acesso negado".
--
-- B. The owner (see the header) is admin:
--      insert into arena_private.admins (user_id, note) values ('<ADMIN>', 'owner');
--      set local role authenticated;  select set_config('request.jwt.claims', '{"sub":"<ADMIN>","role":"authenticated"}', true);
--      select public.is_admin();  -> true
--      select public.admin_overview();   -> a jsonb with players, pass, market, collected, items, pouches, materials, league, waitlist, freshness
--      select public.admin_players('ana', 'level', 'desc', 0, 25);   -> {total, rows} with the e-mail MASKED ("an***@example.com")
--      select public.admin_player_detail('<PLAYER>');   -> the FULL e-mail inside account.email
--      select public.admin_legendaries(null, 0, 50, '{"source":"pity"}');  select public.admin_market('sales', null, 0, 50, '{"mode":"live"}');
--      select public.admin_economy_series(30);  -> 30 objects, oldest first
--
-- C. Read-only: as <ADMIN>, `begin; select public.admin_overview(); ... ; rollback;` changes nothing, and no admin_* function can write (they are `stable`: a write inside raises "cannot execute ... in a read-only transaction"
--    when called through PostgREST's GET, and the static test of admin/ checks that no body contains insert/update/delete).
--
-- D. Maintenance (as the owner / service role):
--      select arena_private.admin_refresh_daily(90);                 -> number of days written; select * from arena_private.admin_daily order by day desc limit 5;
--      select arena_private.admin_refresh_aggregates(true);          -> {rebuilt: <accounts>, ...}; select * from arena_private.admin_gold_daily;
--      select arena_private.admin_refresh_aggregates();              -> rebuilt only the characters saved since the last run (usually few)
--    As `authenticated`: `select arena_private.admin_refresh_aggregates();` -> permission denied for schema arena_private (a client can never run them).
--
-- E. Sanity of the numbers: admin_overview().players.registered = (select count(*) from auth.users); collected.fees_lamports = (select sum(fee_lamports) from market_sales where livemode);
--    pass.card_sold_live = (select count(*) from entitlements where source = 'stripe' and livemode and status = 'active').
-- ---------------------------------------------------------------------------------------------------------------------------------------
