-- Admin panel: the account drawer reads LIVE (depends on 0020 admin, 0026 pass season, 0027 audit and promo codes, 0028 server credits, 0024 invites). NOT APPLIED from this repo: the owner runs it (SQL editor or
-- `supabase db push`), in the DEVELOPMENT project first. It is run for real by admin/tests/sql/playerfull.integration.test.ts (an in-memory Postgres).
--
-- THE PROBLEM. The player drawer showed "Ouro no save —", "Itens 0" and "Ainda sem dados de progresso" because level, gold and items came ONLY from arena_private.admin_player_cache, which a pg_cron routine
-- fills every 6 hours, and that routine was never scheduled on the test project. One account is one row: reading its save live is cheap, so the drawer no longer needs the cache.
--
-- WHAT THIS FILE DOES
--   1. public.admin_player_full(user): everything the server has for ONE account, read live: the save (characters.save_data: hero, level, XP, Paragon, Gold, Eter, gems, dungeon floor, Hunting, professions, gear with
--      rarity / tier / upgrade, bag and stash, materials, potions, skill points, Pass flags, title / frame / skin / cosmetics), the last 10 progress snapshots with their verdicts, the server credit ledger
--      (promo and pioneer: owed / claimed), the promo codes redeemed, the market activity (listings, reservations as buyer, sales totals), the invites (who invited, who was invited, rewards) and the waiting-list
--      row (matched by e-mail), plus the audit rows that name this account. Admin-only (is_admin() first), security definer, empty search_path, STABLE, no write, granted only to `authenticated`.
--      The e-mail is NOT in it (admin_player_detail keeps the masked / full flow). admin_player_detail is NOT changed: the drawer calls both.
--   2. Helpers arena_private.admin_jnum / admin_jobj / admin_jarr (read a JSON value defensively: a save is player-editable, so a wrong type becomes null / {} / [], never an error) and
--      arena_private.admin_level_from_xp / admin_paragon_from_xp / admin_prof_level: the hero and profession levels computed from XP with the SAME tables as supabase/functions/_shared/progress/tables.ts
--      (admin/tests/sql/playerfull.static.test.ts pins the two copies together).
--   3. A SAFE attempt to schedule the two maintenance routines of docs/ADMIN.md section 4, and to fill the cache once. It only does anything when the pg_cron extension is already installed or is AVAILABLE on this
--      server (pg_extension / pg_available_extensions); when it is not, it does nothing and says so with a NOTICE. Every step is wrapped, so this file can never fail because of it. The cron jobs are
--      'arena-admin-daily' (every 15 minutes) and 'arena-admin-aggregates' (every 6 hours); cron.schedule with a name replaces a job of the same name, so re-running is harmless. The one-time fill (admin_refresh_daily(90)
--      and admin_refresh_aggregates(true)) runs only when the project already has accounts (an empty project writes nothing), and it reads every save once: on a big project run this file outside peak hours.
--
-- ROLLBACK (by hand; nothing else depends on these objects):
--   drop function if exists public.admin_player_full(uuid);
--   drop function if exists arena_private.admin_prof_level(text, numeric);
--   drop function if exists arena_private.admin_paragon_from_xp(numeric);
--   drop function if exists arena_private.admin_level_from_xp(numeric);
--   drop function if exists arena_private.admin_jarr(jsonb);
--   drop function if exists arena_private.admin_jobj(jsonb);
--   drop function if exists arena_private.admin_jnum(jsonb);
--   -- and, if pg_cron took the jobs: select cron.unschedule('arena-admin-daily'); select cron.unschedule('arena-admin-aggregates');

create schema if not exists arena_private;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Defensive JSON readers
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.admin_jnum(p_value jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when pg_catalog.jsonb_typeof(p_value) = 'number' then (p_value #>> '{}')::numeric end;
$$;

create or replace function arena_private.admin_jobj(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when pg_catalog.jsonb_typeof(p_value) = 'object' then p_value else '{}'::jsonb end;
$$;

create or replace function arena_private.admin_jarr(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when pg_catalog.jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end;
$$;

revoke all on function arena_private.admin_jnum(jsonb) from public, anon, authenticated;
revoke all on function arena_private.admin_jobj(jsonb) from public, anon, authenticated;
revoke all on function arena_private.admin_jarr(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Levels from XP (the tables of supabase/functions/_shared/progress/tables.ts: XP_TO_LEVEL and PROFESSION_XP_TO_LEVEL; entry i is the XP at which level i + 1 begins)
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.admin_level_from_xp(p_xp numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  with t as (select array[0,100,470,884,1348,1867,2449,3100,3830,4647,5562,6587,7735,9021,10461,12074,13687,15336,17023,18748,20513,22318,24164,26052,27983,29958,31977,34042,36397,39081,42141,45629,49606,54140,59308,65200,71092,77985,86050,95486,106526,119443,134556,152239,172928,197134,225455,258590,297358,342717,395787,457879,530526,615523,714970,831323,967455,1126730,1313082,1531114,1786211,2041308,2302272,2569238,2842345,3121733,3407547,3699935,3999048,4305040,4618070,4938300,5265895,5601025,5943863,6294586,6653375,7020417,7395901,7780021,8172975,8565929,8970672,9387557,9816949,10259223,10714765,11183973,11667257,12165040,12677756,13205854,13749795,14310054,14887121,15481500,16093710,16724287,17373781,18042760]::numeric[] as a, least(greatest(coalesce(p_xp, 0), 0), 1000000000000) as x)
  select coalesce(max(i), 1)::integer from t, pg_catalog.generate_subscripts(t.a, 1) as i where t.x >= t.a[i];
$$;

-- Paragon level: past hero level 100, level n costs round(401387.4 * 1.01 ^ (n - 1)) XP (PARAGON_FIRST_XP / PARAGON_GROWTH of tables.ts); 0 below hero level 100.
create or replace function arena_private.admin_paragon_from_xp(p_xp numeric)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_left numeric := least(greatest(coalesce(p_xp, 0), 0), 1000000000000) - 18042760;
  v_level integer := 0;
  v_need numeric;
begin
  if v_left < 0 then
    return 0;
  end if;
  loop
    v_need := greatest(1, pg_catalog.round(401387.39999999997 * pg_catalog.power(1.01::numeric, v_level)));
    exit when v_left < v_need or v_level >= 9999;
    v_left := v_left - v_need;
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

create or replace function arena_private.admin_prof_level(p_profession text, p_xp numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  with t as (
    select case p_profession
             when 'mining' then array[0,5,10,16,22,28,35,42,50,58,66,74,83,93,104,116,130,145,161,179,199,221,245,272,301,333,365,399,435,473,513,556,602,650,701,755,812,873,938,1006,1079,1156,1237,1323,1415,1512,1615,1724,1840,1963,2093,2223,2366,2523,2696,2886,3095,3325,3578,3856,4162,4468,4927,5616,6650,8200,10526,14015,19248,27097,38871,56532,83023,122760,182365]::numeric[]
             when 'woodcutting' then array[0,5,10,16,22,28,35,42,50,58,66,74,83,93,104,116,130,145,161,179,199,221,245,272,301,333,365,399,435,473,513,556,602,650,701,755,812,873,938,1006,1079,1156,1237,1323,1415,1512,1615,1724,1840,1963,2093,2223,2366,2523,2696,2886,3095,3325,3578,3856,4162,4468,4927,5616,6650,8200,10526,14015,19248,27097,38871,56532,83023,122760,182365]::numeric[]
             else array[0,5,10,16,22,29,36,44,53,62,72,83,95,108,122,137,153,170,189,209,231,254,279,306,335,367,401,438,478,521,568,618,672,731,794,862,936,1016,1102,1195,1296,1405,1522,1649,1786,1934,2102,2294,2513,2763,3048,3372,3742,4164,4645,5193,5818,6530,7342,8267,9322,10525,11896,13459,15241,17272,19587,22227,25236,28666,32577,37035,42117,47911,54516]::numeric[]
           end as a,
           least(greatest(coalesce(p_xp, 0), 0), 1000000000000) as x
  )
  select coalesce(max(i), 1)::integer from t, pg_catalog.generate_subscripts(t.a, 1) as i where t.x >= t.a[i];
$$;

revoke all on function arena_private.admin_level_from_xp(numeric) from public, anon, authenticated;
revoke all on function arena_private.admin_paragon_from_xp(numeric) from public, anon, authenticated;
revoke all on function arena_private.admin_prof_level(text, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- admin_player_full(user): everything the server has for one account, live. Null for an unknown id.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_player_full(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_char public.characters%rowtype;
  v_has_char boolean;
  v_save jsonb;
  v_stats jsonb;
  v_equipped jsonb;
  v_pass jsonb;
  v_skill jsonb;
  v_xp numeric;
  v_save_out jsonb := null;
  v_wait jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'ADMIN_BAD_ARGUMENT';
  end if;

  select u.email into v_email from auth.users as u where u.id = p_user_id;
  if not found then
    return null;
  end if;

  select * into v_char from public.characters as c where c.user_id = p_user_id;
  v_has_char := found;

  if v_has_char then
    v_save := arena_private.admin_jobj(v_char.save_data);
    v_stats := arena_private.admin_jobj(v_save -> 'stats');
    v_equipped := arena_private.admin_jobj(v_save -> 'equipped');
    v_pass := arena_private.admin_jobj(v_save -> 'claimedPassRewards');
    v_skill := arena_private.admin_jobj(v_save -> 'skillXp');
    v_xp := coalesce(arena_private.admin_jnum(v_save -> 'xp'), 0);

    v_save_out := jsonb_build_object(
      'hero_name', v_char.hero_name,
      'revision', v_char.revision,
      'schema_version', v_char.save_schema_version,
      'updated_at', v_char.updated_at,
      'created_at', v_char.created_at,
      'imported_from_legacy', v_char.imported_from_legacy,
      'level', arena_private.admin_level_from_xp(v_xp),
      'paragon_level', arena_private.admin_paragon_from_xp(v_xp),
      'xp', v_xp,
      'gold', arena_private.admin_jnum(v_save -> 'gold'),
      'shards', arena_private.admin_jnum(v_save -> 'shards'),
      'victories', arena_private.admin_jnum(v_save -> 'victories'),
      'highest_dungeon_floor', arena_private.admin_jnum(v_save -> 'highestDungeonFloor'),
      'attributes', jsonb_build_object('str', arena_private.admin_jnum(v_save -> 'str'), 'vit', arena_private.admin_jnum(v_save -> 'vit'), 'agi', arena_private.admin_jnum(v_save -> 'agi'), 'res', arena_private.admin_jnum(v_save -> 'res')),
      'weapon_level', arena_private.admin_jnum(v_save -> 'weaponLevel'),
      'armor_level', arena_private.admin_jnum(v_save -> 'armorLevel'),
      'counters', jsonb_build_object(
        'kills', arena_private.admin_jnum(v_stats -> 'kills'),
        'gold_earned', arena_private.admin_jnum(v_stats -> 'goldEarned'),
        'seconds_played', arena_private.admin_jnum(v_stats -> 'secondsPlayed'),
        'hunt_seconds', arena_private.admin_jnum(v_stats -> 'huntSeconds'),
        'deepest_depth', arena_private.admin_jnum(v_stats -> 'deepestDepth'),
        'bosses_killed', arena_private.admin_jnum(v_stats -> 'bossesKilled'),
        'dungeon_runs', arena_private.admin_jnum(v_stats -> 'dungeonRuns'),
        'dungeon_floors', arena_private.admin_jnum(v_stats -> 'dungeonFloors'),
        'items_forged', arena_private.admin_jnum(v_stats -> 'itemsForged'),
        'uniques_found', arena_private.admin_jnum(v_stats -> 'uniquesFound'),
        'refine_success', arena_private.admin_jnum(v_stats -> 'refineSuccess'),
        'refine_fail', arena_private.admin_jnum(v_stats -> 'refineFail'),
        'deliveries', arena_private.admin_jnum(v_stats -> 'deliveries'),
        'potions_brewed', arena_private.admin_jnum(v_stats -> 'potionsBrewed'),
        'forged_by_rarity', arena_private.admin_jobj(v_stats -> 'forgedByRarity')
      ),
      'professions', jsonb_build_array(
        jsonb_build_object('id', 'mining', 'xp', coalesce(arena_private.admin_jnum(v_skill -> 'mining'), 0), 'level', arena_private.admin_prof_level('mining', arena_private.admin_jnum(v_skill -> 'mining')), 'active', v_save -> 'activeOreId'),
        jsonb_build_object('id', 'woodcutting', 'xp', coalesce(arena_private.admin_jnum(v_skill -> 'woodcutting'), 0), 'level', arena_private.admin_prof_level('woodcutting', arena_private.admin_jnum(v_skill -> 'woodcutting')), 'active', v_save -> 'activeWoodId'),
        jsonb_build_object('id', 'gardening', 'xp', coalesce(arena_private.admin_jnum(v_skill -> 'gardening'), 0), 'level', arena_private.admin_prof_level('gardening', arena_private.admin_jnum(v_skill -> 'gardening')), 'active', null)
      ),
      'hunting', jsonb_build_object(
        'zone', v_save -> 'activeHuntingZone',
        'depth', v_save -> 'activeHuntingDepth',
        'unlocked_zones', arena_private.admin_jarr(v_save -> 'unlockedHuntingZones'),
        'progress', arena_private.admin_jobj(v_save -> 'huntProgress')
      ),
      'dungeon', jsonb_build_object('checkpoints', arena_private.admin_jarr(v_save -> 'dungeonCheckpoints'), 'sessions_today', arena_private.admin_jnum(v_save -> 'dungeonSessionsUsed')),
      'skill_tree', jsonb_build_object(
        'active_set', arena_private.admin_jnum(v_save -> 'skillTree' -> 'active'),
        'respec_used', (v_save -> 'skillTree' -> 'respecUsed') = 'true'::jsonb,
        'sets', arena_private.admin_jarr(v_save -> 'skillTree' -> 'sets'),
        -- ranks spent in each of the two sets
        'spent', (
          select coalesce(jsonb_agg(coalesce((select sum(arena_private.admin_jnum(r.value)) from pg_catalog.jsonb_each(arena_private.admin_jobj(s.value)) as r), 0) order by s.ord), '[]'::jsonb)
          from pg_catalog.jsonb_array_elements(arena_private.admin_jarr(v_save -> 'skillTree' -> 'sets')) with ordinality as s(value, ord)
        )
      ),
      'gear', (
        select coalesce(jsonb_agg(g.item order by g.is_worn desc, g.rarity_rank desc, g.template_id), '[]'::jsonb)
        from (
          select x.template_id, x.is_worn,
                 case x.rarity when 'legendary' then 4 when 'epic' then 3 when 'rare' then 2 else 1 end as rarity_rank,
                 jsonb_build_object(
                   'id', x.id, 'template_id', x.template_id, 'rarity', x.rarity, 'upgrade', x.upgrade, 'durability', x.durability, 'reforge_count', x.reforge, 'lapidar_count', x.lapidar,
                   'sockets', x.sockets, 'substats', x.substats, 'bound', x.bound, 'certified', x.certified, 'equipped_slot', x.slot_worn, 'tier', x.tier, 'slot', x.slot
                 ) as item
          from (
            select gi.key as id,
                   gi.value ->> 'templateId' as template_id,
                   gi.value ->> 'rarity' as rarity,
                   arena_private.admin_jnum(gi.value -> 'upgrade') as upgrade,
                   arena_private.admin_jnum(gi.value -> 'durability') as durability,
                   arena_private.admin_jnum(gi.value -> 'reforgeCount') as reforge,
                   arena_private.admin_jnum(gi.value -> 'lapidarCount') as lapidar,
                   arena_private.admin_jarr(gi.value -> 'sockets') as sockets,
                   arena_private.admin_jarr(gi.value -> 'substats') as substats,
                   coalesce((gi.value -> 'bound') = 'true'::jsonb, false) as bound,
                   (gi.value ? 'certificateId') as certified,
                   w.slot_worn,
                   w.slot_worn is not null as is_worn,
                   ti.tier, ti.slot
            from (select k.key, k.value from pg_catalog.jsonb_each(arena_private.admin_jobj(v_save -> 'gearInstances')) as k limit 400) as gi
            left join lateral (select e.key as slot_worn from pg_catalog.jsonb_each_text(v_equipped) as e where e.value = gi.key limit 1) as w on true
            left join lateral (select i.tier, i.slot from arena_private.admin_template_info as i where i.template_id = gi.value ->> 'templateId' order by i.kind limit 1) as ti on true
            where pg_catalog.jsonb_typeof(gi.value) = 'object'
          ) as x
        ) as g
      ),
      'equipped', v_equipped,
      'inventory', arena_private.admin_jobj(v_save -> 'inventory'),
      'inventory_capacity', arena_private.admin_jnum(v_save -> 'inventoryCapacity'),
      'stash', jsonb_build_object(
        'level', arena_private.admin_jnum(v_save -> 'stash' -> 'level'),
        'materials', arena_private.admin_jobj(v_save -> 'stash' -> 'materials'),
        'consumables', arena_private.admin_jobj(v_save -> 'stash' -> 'consumables'),
        'gear', arena_private.admin_jobj(v_save -> 'stash' -> 'gear'),
        'bonus_slots', arena_private.admin_jnum(v_save -> 'stashBonusSlots')
      ),
      'materials', arena_private.admin_jobj(v_save -> 'materials'),
      'tradeable_materials', arena_private.admin_jobj(v_save -> 'tradeableMaterials'),
      'potions', arena_private.admin_jobj(v_save -> 'potions'),
      'consumables', arena_private.admin_jobj(v_save -> 'consumables'),
      'gems', arena_private.admin_jobj(v_save -> 'gems'),
      'pass', jsonb_build_object(
        'has_flag', (v_save -> 'hasBattlePass') = 'true'::jsonb,
        'level', arena_private.admin_jnum(v_save -> 'battlePassLevel'),
        'xp', arena_private.admin_jnum(v_save -> 'battlePassXp'),
        'season', arena_private.admin_jnum(v_save -> 'passSeason'),
        'claimed_free', arena_private.admin_jarr(v_pass -> 'free'),
        'claimed_premium', arena_private.admin_jarr(v_pass -> 'premium')
      ),
      'cosmetics', arena_private.admin_jarr(v_save -> 'cosmetics'),
      'active_title', v_save -> 'activeTitle',
      'active_frame', v_save -> 'activeFrame',
      'active_skin', v_save -> 'activeSkin',
      'applied_credits', pg_catalog.jsonb_array_length(arena_private.admin_jarr(v_save -> 'appliedCredits')),
      'craft_job', v_save -> 'craftJob',
      'league', v_save -> 'league'
    );
  end if;

  -- the waiting-list row that carries this e-mail (no hashes are returned)
  select jsonb_build_object(
           'created_at', w.created_at, 'source', w.source, 'locale', w.locale, 'qualified_at', w.qualified_at, 'unsubscribed_at', w.unsubscribed_at, 'referral_ignored', w.referral_ignored,
           'was_referred', w.referred_by is not null,
           'invited', (select count(*) from public.waitlist as x where x.referred_by = w.id),
           'invited_qualified', (select count(*) from public.waitlist as x where x.referred_by = w.id and x.qualified_at is not null)
         )
    into v_wait
  from public.waitlist as w
  where v_email is not null and w.email::text = pg_catalog.lower(v_email)
  limit 1;

  return jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'has_character', v_has_char,
    'save', v_save_out,
    'progress', jsonb_build_object(
      'latest_verdict', (select s.verdict from public.progress_snapshots as s where s.user_id = p_user_id order by s.created_at desc limit 1),
      'counts', (select jsonb_build_object('ok', count(*) filter (where s.verdict = 'ok'), 'flagged', count(*) filter (where s.verdict = 'flagged'), 'rejected', count(*) filter (where s.verdict = 'rejected'), 'total', count(*)) from public.progress_snapshots as s where s.user_id = p_user_id),
      'snapshots', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'created_at', s.created_at, 'verdict', s.verdict, 'reasons', s.reasons, 'app_version', s.app_version,
          'hero_level', s.metrics -> 'heroLevel', 'paragon_level', s.metrics -> 'paragonLevel', 'highest_floor', s.metrics -> 'highestFloor',
          'gold', s.metrics -> 'gold', 'shards', s.metrics -> 'shards', 'seconds_played', s.metrics -> 'secondsPlayed'
        ) order by s.created_at desc), '[]'::jsonb)
        from (select x.created_at, x.verdict, x.reasons, x.app_version, x.metrics from public.progress_snapshots as x where x.user_id = p_user_id order by x.created_at desc limit 10) as s
      )
    ),
    'credits', jsonb_build_object(
      'unclaimed', (select count(*) from arena_private.server_credits as c where c.user_id = p_user_id and c.claimed_at is null),
      'claimed', (select count(*) from arena_private.server_credits as c where c.user_id = p_user_id and c.claimed_at is not null),
      'rows', (
        select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'item_id', c.item_id, 'amount', c.amount, 'source', c.source, 'source_ref', c.source_ref, 'created_at', c.created_at, 'claimed_at', c.claimed_at, 'counted_at', c.counted_at) order by c.created_at desc), '[]'::jsonb)
        from (select x.* from arena_private.server_credits as x where x.user_id = p_user_id order by x.created_at desc limit 50) as c
      )
    ),
    'promo', (
      select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'at', r.at, 'reward_kind', pc.reward_kind, 'reward_item_id', pc.reward_item_id, 'reward_amount', pc.reward_amount, 'note', pc.note) order by r.at desc), '[]'::jsonb)
      from arena_private.promo_redemptions as r
      left join arena_private.promo_codes as pc on pc.code = r.code
      where r.user_id = p_user_id
    ),
    'market', jsonb_build_object(
      'listing_counts', (select coalesce(jsonb_object_agg(g.status, g.n), '{}'::jsonb) from (select l.status, count(*) as n from public.market_listings as l where l.seller_id = p_user_id group by l.status) as g),
      'listings', (
        select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'status', l.status, 'price_lamports', l.price_lamports, 'material_id', l.material_id, 'material_qty', l.material_qty, 'template_id', l.template_id, 'rarity', l.rarity, 'created_at', l.created_at, 'expires_at', l.expires_at, 'closed_at', l.closed_at) order by l.created_at desc), '[]'::jsonb)
        from (
          select x.id, x.status, x.price_lamports, x.material_id, x.material_qty, x.created_at, x.expires_at, x.closed_at, c.template_id, c.rarity
          from public.market_listings as x left join public.item_certificates as c on c.id = x.certificate_id
          where x.seller_id = p_user_id order by x.created_at desc limit 20
        ) as l
      ),
      'reservations', (
        select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'price_lamports', r.price_lamports, 'livemode', r.livemode, 'created_at', r.created_at, 'expires_at', r.expires_at) order by r.created_at desc), '[]'::jsonb)
        from (select x.id, x.status, x.price_lamports, x.livemode, x.created_at, x.expires_at from public.market_reservations as x where x.buyer_id = p_user_id order by x.created_at desc limit 20) as r
      ),
      'sold', (select jsonb_build_object('count', count(*), 'lamports', coalesce(sum(s.price_lamports), 0)) from public.market_sales as s where s.seller_id = p_user_id and s.livemode),
      'bought', (select jsonb_build_object('count', count(*), 'lamports', coalesce(sum(s.price_lamports), 0)) from public.market_sales as s where s.buyer_id = p_user_id and s.livemode)
    ),
    'invites', jsonb_build_object(
      'code', (select i.code from arena_private.invite_codes as i where i.user_id = p_user_id),
      'invited_by', (
        select jsonb_build_object('user_id', r.referrer_id, 'username', pr.username, 'created_at', r.created_at, 'ignored_reason', r.ignored_reason, 'qualified_at', r.qualified_at)
        from arena_private.account_referrals as r left join public.profiles as pr on pr.user_id = r.referrer_id
        where r.user_id = p_user_id
      ),
      'invited_total', (select count(*) from arena_private.account_referrals as r where r.referrer_id = p_user_id),
      'invited_qualified', (select count(*) from arena_private.account_referrals as r where r.referrer_id = p_user_id and r.ignored_reason is null and r.qualified_at is not null),
      'invited_ignored', (select count(*) from arena_private.account_referrals as r where r.referrer_id = p_user_id and r.ignored_reason is not null),
      'invited', (
        select coalesce(jsonb_agg(jsonb_build_object('user_id', r.user_id, 'username', r.username, 'created_at', r.created_at, 'qualified_at', r.qualified_at, 'ignored_reason', r.ignored_reason) order by r.created_at desc), '[]'::jsonb)
        from (
          select x.user_id, pr.username, x.created_at, x.qualified_at, x.ignored_reason
          from arena_private.account_referrals as x left join public.profiles as pr on pr.user_id = x.user_id
          where x.referrer_id = p_user_id order by x.created_at desc limit 20
        ) as r
      ),
      'rewards', (
        select coalesce(jsonb_agg(jsonb_build_object('metric', r.metric, 'min_count', r.min_count, 'kind', r.kind, 'reward_ref', r.reward_ref, 'granted_at', r.granted_at) order by r.granted_at desc), '[]'::jsonb)
        from public.referral_rewards_granted as r where r.user_id = p_user_id
      )
    ),
    'waitlist', v_wait,
    'audit', (
      select coalesce(jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'details', a.details, 'admin_id', a.admin_id, 'admin_username', a.admin_username) order by a.at desc), '[]'::jsonb)
      from (
        select x.at, x.action, x.details, x.admin_id, pr.username as admin_username
        from arena_private.admin_audit as x left join public.profiles as pr on pr.user_id = x.admin_id
        where x.target_user = p_user_id order by x.at desc limit 30
      ) as a
    )
  );
end;
$$;

revoke all on function public.admin_player_full(uuid) from public, anon, authenticated;
grant execute on function public.admin_player_full(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- pg_cron: schedule the two maintenance routines and fill the cache once, ONLY when the extension exists. Never fails the migration.
-- ---------------------------------------------------------------------------------------------------------------------------------------
do $cron$
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
      begin
        create extension if not exists pg_cron;
      exception when others then
        raise notice '0034: pg_cron is available but could not be enabled here (%): enable it in Database > Extensions and run docs/ADMIN.md section 4.', sqlerrm;
      end;
    else
      raise notice '0034: pg_cron is not available on this server: the maintenance routines were NOT scheduled (docs/ADMIN.md section 4).';
    end if;
  end if;

  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('arena-admin-daily', '*/15 * * * *', $job$select arena_private.admin_refresh_daily(2)$job$);
      perform cron.schedule('arena-admin-aggregates', '5 */6 * * *', $job$select arena_private.admin_refresh_aggregates()$job$);
    exception when others then
      raise notice '0034: could not schedule the maintenance routines (%): run docs/ADMIN.md section 4 by hand.', sqlerrm;
    end;
  end if;

  -- one-time fill so the list page shows level and Gold right away (skipped for an empty project)
  if exists (select 1 from public.characters) then
    begin
      perform arena_private.admin_refresh_daily(90);
      perform arena_private.admin_refresh_aggregates(true);
    exception when others then
      raise notice '0034: the first fill of the admin cache did not run (%): run docs/ADMIN.md section 4 by hand.', sqlerrm;
    end;
  end if;
end;
$cron$;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (nothing here runs automatically). Replace <ADMIN> with your account id and <PLAYER> with an account id.
--   As <ADMIN>:  select public.admin_player_full('<PLAYER>');  -> save (level, gold, gear, bag, materials ...), progress, credits, promo, market, invites, waitlist, audit
--   As a player: select public.admin_player_full('<PLAYER>');  -> ADMIN_ONLY.   As anon: permission denied.
--   select jobname, schedule from cron.job where jobname like 'arena-admin-%';  -> the two jobs, when pg_cron is present.
-- ---------------------------------------------------------------------------------------------------------------------------------------
