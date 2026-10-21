-- The Pass-sales goal that opens Season 1: 1,000 paid Passes (owner's decision, 2026-10-21; was the placeholder 15,000 of 0006). NOT APPLIED from this repo: the owner runs it (SQL editor or
-- `supabase db push`), in the DEVELOPMENT project first. The number stays secret (pass_meter() returns only a fraction since 0008).
--
-- Only a goal that has not fired and still holds the old placeholder is changed: a target the owner already set by hand, or a goal that already opened the season, is left alone.
--
-- ROLLBACK (by hand): update arena_private.season_goal set target = 15000 where id and opened_at is null;  alter table arena_private.season_goal alter column target set default 15000;

alter table arena_private.season_goal alter column target set default 1000;
update arena_private.season_goal set target = 1000 where id and opened_at is null and target = 15000;
