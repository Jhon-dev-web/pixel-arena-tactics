-- The "Kit Pioneiro": a thank-you for the players of the open pre-season, delivered when the first League opens and every online hero is reset (depends on 0004 progress_snapshots, 0009 reset_at /
-- my_pioneer, 0028 server credit ledger). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is run for real by
-- admin/tests/sql/pioneer.integration.test.ts (an in-memory Postgres).
--
-- OWNER DECISION (2026-10-21). The kit has three parts: the title "Pioneiro" (cosmetic, the game grants it at the reset, see 0009), the portrait frame "Moldura de Pioneiro" (cosmetic, granted with the
-- title) and a STARTER CHEST of Gold and potions. The chest is a number in the save, so it goes through the server credit ledger of 0028 (arena_private.server_credits): the reset inserts the rows, the reset
-- hero claims them (public.claim_server_credits) and applies each once, and submit-progress counts claimed credits in what the save may gain, so the chest never flags the player.
--
-- WHO QUALIFIES (one rule for the title, the frame and the chest): the account had at least one ACCEPTED progress snapshot (verdict 'ok') created BEFORE reset_at whose hero level was 10 or more.
-- Why the snapshots and not characters.save_data: the save is a client document the player can edit; a snapshot is written only by the Edge Function (service role), after the audit accepted it, is
-- append-only, and carries the metrics the SERVER extracted (metrics.heroLevel). A made-up level 10 save either never produced an 'ok' snapshot or produced one the audit already judged against the
-- account's age, so a fake account made to farm the chest needs real, accepted play. Accounts created after the reset have no snapshot before it, so they never qualify (and a reset that has not happened
-- grants nothing). Flagged / rejected snapshots do not count.
--
-- THE AMOUNTS (the ONE place on the server is arena_private.pioneer_kit(); src/game/pioneerKit.ts mirrors it and a test pins the two together):
--   Gold    500      owner's decision (2026-10-21): enough to be worth announcing (about a first day of early-game income: ~27 Gold/h from Hunting at level 1 plus Delivery
--                    orders at 25 to 40 Gold/h), still far from deciding the League ranking.
--   Potion  10 x small_hp (the basic healing potion, 30 Gold in the shop: ~300 Gold of value; small_hp is on arena_private.promo_consumable_ids(), so the
--           ledger accepts it and it is never a tradeable good).
--   Level   10 (the same level the invite program calls an "active" player).
--
-- WHAT THIS FILE DOES
--   1. server_credits.source also accepts 'pioneer' (the check of 0028 allowed only 'promo'). The ledger rows are ('pioneer', 'pioneer-gold') and ('pioneer', 'pioneer-potion') per user: server_credits_once
--      (source, source_ref, user_id) makes a second grant impossible.
--   2. arena_private.pioneer_kit() the amounts; arena_private.is_pioneer(user, reset_at) the rule.
--   3. arena_private.grant_pioneer_credits(reset_at) inserts the two rows for every qualifying account (on conflict do nothing: idempotent). A NEW trigger on arena_private.season_goal (it fires the one
--      time reset_at goes from null to a value, next to the certificate void of 0010 / 0032, which is NOT touched) calls it. It is also called once at the end of this file for a project where the League
--      already opened (a no-op while reset_at is null).
--   4. public.my_pioneer() (0009) now applies the same rule (level 10 or more), so the game grants the title and the frame to exactly the accounts that got the chest.
--
-- ROLLBACK (by hand; export arena_private.server_credits where source = 'pioneer' first if chests were handed out, they are the record of what the players were owed):
--   drop trigger if exists season_goal_pioneer_kit on arena_private.season_goal;
--   drop function if exists arena_private.season_goal_pioneer_kit();
--   drop function if exists arena_private.grant_pioneer_credits(timestamptz);
--   -- re-run the `create or replace function public.my_pioneer()` block of 0009_first_league_reset.sql (any accepted snapshot, no level condition);
--   drop function if exists arena_private.is_pioneer(uuid, timestamptz);
--   drop function if exists arena_private.pioneer_kit();
--   delete from arena_private.server_credits where source = 'pioneer';
--   alter table arena_private.server_credits drop constraint if exists server_credits_source_check;
--   alter table arena_private.server_credits add constraint server_credits_source_check check (source in ('promo'));

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 1. The ledger learns a new source.
-- ---------------------------------------------------------------------------------------------------------------------------------------
alter table arena_private.server_credits drop constraint if exists server_credits_source_check;
alter table arena_private.server_credits add constraint server_credits_source_check check (source in ('promo', 'pioneer'));

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 2. The amounts (one place) and the rule.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function arena_private.pioneer_kit()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('min_level', 10, 'gold', 500, 'potion_id', 'small_hp', 'potion_amount', 10);
$$;

revoke all on function arena_private.pioneer_kit() from public, anon, authenticated;

-- True when the account had an accepted snapshot at hero level >= min_level before the reset. p_reset_at null (the League has not opened) = false.
create or replace function arena_private.is_pioneer(p_user uuid, p_reset_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_reset_at is not null and p_user is not null and exists (
    select 1
    from public.progress_snapshots as s
    where s.user_id = p_user
      and s.verdict = 'ok'
      and s.created_at < p_reset_at
      and (s.metrics ->> 'heroLevel')::numeric >= ((arena_private.pioneer_kit() ->> 'min_level')::numeric)
  );
$$;

revoke all on function arena_private.is_pioneer(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 3. The grant (idempotent) and its trigger.
-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Inserts the chest (one Gold credit and one potion credit) for every qualifying account. Returns how many rows it inserted. Running it again inserts nothing (server_credits_once).
create or replace function arena_private.grant_pioneer_credits(p_reset_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kit jsonb := arena_private.pioneer_kit();
  v_n integer;
begin
  if p_reset_at is null then
    return 0;
  end if;
  with who as (
    select distinct s.user_id
    from public.progress_snapshots as s
    where s.verdict = 'ok'
      and s.created_at < p_reset_at
      and (s.metrics ->> 'heroLevel')::numeric >= ((v_kit ->> 'min_level')::numeric)
  ), ins as (
    insert into arena_private.server_credits (user_id, kind, item_id, amount, source, source_ref)
    select w.user_id, c.kind, c.item_id, c.amount, 'pioneer', c.source_ref
    from who as w
    cross join (
      values
        ('gold'::text, null::text, (v_kit ->> 'gold')::integer, 'pioneer-gold'::text),
        ('consumable'::text, v_kit ->> 'potion_id', (v_kit ->> 'potion_amount')::integer, 'pioneer-potion'::text)
    ) as c (kind, item_id, amount, source_ref)
    on conflict on constraint server_credits_once do nothing
    returning 1
  )
  select pg_catalog.count(*)::integer into v_n from ins;
  return v_n;
end;
$$;

revoke all on function arena_private.grant_pioneer_credits(timestamptz) from public, anon, authenticated;

create or replace function arena_private.season_goal_pioneer_kit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reset_at is not null and old.reset_at is null then
    perform arena_private.grant_pioneer_credits(new.reset_at);
  end if;
  return new;
end;
$$;

revoke all on function arena_private.season_goal_pioneer_kit() from public, anon, authenticated;

drop trigger if exists season_goal_pioneer_kit on arena_private.season_goal;
create trigger season_goal_pioneer_kit
  after update of reset_at on arena_private.season_goal
  for each row
  execute function arena_private.season_goal_pioneer_kit();

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- 4. The game's question (title + frame): the same rule as the chest.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.my_pioneer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select arena_private.is_pioneer((select auth.uid()), g.reset_at)
     from arena_private.season_goal as g
     where g.id and g.reset_at is not null),
    false
  );
$$;

revoke all on function public.my_pioneer() from public, anon, authenticated;
grant execute on function public.my_pioneer() to authenticated;

-- Applied AFTER the League already opened: hand the chest out now (a no-op while reset_at is null, and idempotent).
select arena_private.grant_pioneer_credits((select g.reset_at from arena_private.season_goal as g where g.id));
