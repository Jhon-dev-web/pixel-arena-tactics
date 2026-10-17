-- Legendary pity for the forge (Rodada 26). NOT APPLIED from this repo: the owner runs it (SQL editor or `supabase db push`), AFTER 0017, in the DEVELOPMENT project first. It was never run against a
-- real database: only read by static tests (supabase/functions/_shared/__tests__/migration0018.test.ts). The SQL TEST PLAN at the end is what proves it for real.
--
-- WHAT. A forge of tier 4 or above that does not come out Legendary adds 1 to the account's counter; the forge after 40 of them is Legendary and the counter goes back to 0 (a Legendary by the
-- dice resets it too). The dice are rolled by mint-item (items/roll.ts rollForgeRarity); the counter lives HERE, per account, and nothing in a request can move it. A Blacksmith's Seal forge neither
-- counts nor resets it (mint-item does not pass `p_pity` for it).
--
-- THIS FILE
--   * public.item_pity                  one row per account that ever forged tier 4+: { user_id, forges, updated_at }. RLS on, no policy: only the service role reads or writes it.
--   * public.item_commit(..., p_pity)   REPLACES the 0011 function (the old 7-argument signature is dropped first, otherwise PostgREST would see two overloads and refuse the call). Same body as 0011
--                                       plus ONE step under the same per-user lock: when `p_pity` ({ "expect": int, "next": int }) is given, the stored counter must equal `expect` (else the answer is
--                                       { "status": "pity_changed" } and nothing is written: the roll is thrown away unseen and the client asks again), and it is set to `next` in the same statement as
--                                       the certificates. A replay answers before the counter is looked at, so a lost response is never a second step.
--
-- ROLLBACK (by hand): restore the 0011 item_commit (re-run that create-or-replace block of 0011) after
--   drop function if exists public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb, jsonb);
--   drop table if exists public.item_pity;

create table if not exists public.item_pity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  forges integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint item_pity_forges_check check (forges >= 0)
);

alter table public.item_pity enable row level security;
revoke all on table public.item_pity from public, anon, authenticated;
grant select, insert, update on table public.item_pity to service_role;

drop function if exists public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb);

create or replace function public.item_commit(
  p_user_id uuid,
  p_request_id text,
  p_kind text,
  p_template jsonb,
  p_certs jsonb,
  p_burn_ids uuid[],
  p_caps jsonb,
  p_pity jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap jsonb;
  v_existing integer;
  v_new integer;
  v_cert jsonb;
  v_index integer := 0;
  v_id uuid;
  v_created timestamptz;
  v_out jsonb := '[]'::jsonb;
  v_burn_count integer;
  v_pity integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  if exists (select 1 from public.item_mint_requests as r where r.user_id = p_user_id and r.request_id = p_request_id) then
    return pg_catalog.jsonb_build_object('status', 'replay');
  end if;

  for v_cap in select e.value from pg_catalog.jsonb_array_elements(coalesce(p_caps, '[]'::jsonb)) as e loop
    select pg_catalog.count(*)::integer into v_existing
    from public.item_certificates as c
    where c.user_id = p_user_id
      and c.origin_certificate_id is null
      and c.kind = v_cap ->> 'kind'
      and (v_cap ->> 'tier' is null or c.tier = (v_cap ->> 'tier')::integer)
      and c.created_at >= pg_catalog.now() - interval '1 day';
    select pg_catalog.count(*)::integer into v_new
    from pg_catalog.jsonb_array_elements(p_certs) as e
    where e.value ->> 'kind' = v_cap ->> 'kind'
      and (v_cap ->> 'tier' is null or (e.value ->> 'tier')::integer = (v_cap ->> 'tier')::integer);
    if v_new > 0 and v_existing + v_new > (v_cap ->> 'max')::integer then
      return pg_catalog.jsonb_build_object('status', 'cap');
    end if;
  end loop;

  if p_pity is not null then
    select p.forges into v_pity from public.item_pity as p where p.user_id = p_user_id for update;
    if coalesce(v_pity, 0) is distinct from (p_pity ->> 'expect')::integer then
      return pg_catalog.jsonb_build_object('status', 'pity_changed');
    end if;
  end if;

  if p_burn_ids is not null and pg_catalog.cardinality(p_burn_ids) > 0 then
    select pg_catalog.count(*)::integer into v_burn_count
    from public.item_certificates as c
    where c.id = any (p_burn_ids) and c.user_id = p_user_id and c.status = 'held';
    if v_burn_count <> pg_catalog.cardinality(p_burn_ids) then
      return pg_catalog.jsonb_build_object('status', 'burn_failed');
    end if;
    update public.item_certificates as c set status = 'burned' where c.id = any (p_burn_ids) and c.user_id = p_user_id and c.status = 'held';
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    select u.burn_id, p_user_id, 'burn', pg_catalog.jsonb_build_object('reason', 'forge_ingredient', 'request_id', p_request_id)
    from pg_catalog.unnest(p_burn_ids) as u (burn_id);
  end if;

  insert into public.item_mint_requests (user_id, request_id, kind, template) values (p_user_id, p_request_id, p_kind, p_template);

  if p_pity is not null then
    insert into public.item_pity as p (user_id, forges, updated_at)
    values (p_user_id, greatest(0, (p_pity ->> 'next')::integer), pg_catalog.now())
    on conflict (user_id) do update set forges = excluded.forges, updated_at = excluded.updated_at;
  end if;

  for v_cert in select e.value from pg_catalog.jsonb_array_elements(p_certs) as e loop
    insert into public.item_certificates (user_id, kind, template_id, rarity, tier, substats, upgrade, gold_amount, source, content_hash, request_id, request_index)
    values (
      p_user_id,
      v_cert ->> 'kind',
      v_cert ->> 'template_id',
      v_cert ->> 'rarity',
      (v_cert ->> 'tier')::integer,
      coalesce(v_cert -> 'substats', '[]'::jsonb),
      0,
      (v_cert ->> 'gold_amount')::integer,
      v_cert ->> 'source',
      v_cert ->> 'content_hash',
      p_request_id,
      v_index
    )
    returning id, created_at into v_id, v_created;
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    values (v_id, p_user_id, 'mint', pg_catalog.jsonb_build_object('source', v_cert ->> 'source', 'request_id', p_request_id));
    v_out := v_out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', v_id, 'created_at', v_created));
    v_index := v_index + 1;
  end loop;

  return pg_catalog.jsonb_build_object('status', 'created', 'certificates', v_out);
end;
$$;

revoke all on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. Only one item_commit exists: select pronargs from pg_proc where proname = 'item_commit';  -> a single row, 8.
-- B. Client roles cannot touch the table or the function: as authenticated, select * from public.item_pity -> permission denied; select public.item_commit(...) -> permission denied.
-- C. A forge without p_pity (a Seal forge, a tier 1-3 forge, a hunt drop, a pouch) behaves exactly as before and writes no item_pity row.
-- D. A tier 4+ forge with p_pity = {"expect":0,"next":1} on an account with no row -> status created, item_pity.forges = 1. The same request id again -> status replay, forges stays 1.
-- E. p_pity = {"expect":0,"next":1} again with a NEW request id -> status pity_changed, no request, no certificate, forges stays 1.
-- F. p_pity = {"expect":40,"next":0} (the guaranteed Legendary) -> created, forges = 0.
-- G. A commit that returns 'cap' or 'burn_failed' leaves forges untouched.
-- ---------------------------------------------------------------------------------------------------------------------------------------
