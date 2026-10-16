-- Referral rewards in the game (Settings > Convites): the ONE read the game still needed on top of 0016. NOT APPLIED from this repo: run it in the SQL editor when the owner decides.
--
-- What the game reads, all through functions that only ever answer for the signed-in account (auth.uid(); no id is ever passed in):
--   * public.my_referral_status()   (0016)  the account's own invite code, its two counters (qualified, paying), the Pass goal and the rewards already granted to it.
--   * public.referral_tiers()       (THIS FILE)  the list of ACTIVE reward tiers (arena_private.referral_rewards), so the panel can show what is still to earn, with a check on what was earned.
-- The granted rewards table (public.referral_rewards_granted) is NOT opened any wider: the game does not select from it, my_referral_status already returns the caller's own rows.
-- The tier list is configuration, not personal data: it holds no account, no e-mail and no count. It is only handed to a signed-in account, never to anon.
--
-- If this migration is not applied the game still works: the panel falls back to the default tiers it ships (the same four rows 0016 inserts).
--
-- ROLLBACK: drop function if exists public.referral_tiers();

create or replace function public.referral_tiers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('metric', r.metric, 'min_count', r.min_count, 'kind', r.kind, 'ref', r.reward_ref, 'label_pt', r.label_pt, 'label_en', r.label_en)
      order by r.id
    )
    from arena_private.referral_rewards as r
    where r.active
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.referral_tiers() from public, anon, authenticated;
grant execute on function public.referral_tiers() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. Only a signed-in account can ask. As anon:  select public.referral_tiers();  -> permission denied for function.  Through REST (anon key): POST /rest/v1/rpc/referral_tiers -> 401/403.
-- B. As an authenticated user (set local role authenticated; set local request.jwt.claim.sub = '<any uuid>'; ...):  select public.referral_tiers();
--      -> the four default tiers in the order they were inserted: qualified 1 title 'recruiter', qualified 3 cosmetic 'portrait_frame_recruiter', paying 10 pass 'adventurer_pass', qualified 25 title 'recruitment_legend',
--         each with metric, min_count, kind, ref, label_pt, label_en. Nothing about any account.
-- C. A tier switched off is not listed:  update arena_private.referral_rewards set active = false where reward_ref = 'recruitment_legend';  -> three tiers.  Put it back: set active = true.
-- D. The client roles still cannot read the private table:  select * from arena_private.referral_rewards;  as authenticated -> permission denied for schema arena_private.
-- E. my_referral_status() is unchanged and answers only for the caller:  two different users see their own code, counters and rewards, never each other's.
-- ---------------------------------------------------------------------------------------------------------------------------------------
