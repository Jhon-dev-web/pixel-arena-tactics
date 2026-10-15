-- Item certificates: the foundation of the player market (depends on 0004 / 0007 / 0009 only for the helper functions public.progress_account_created_at and public.league_reset_at).
--
-- WHY. The save is client-authoritative (docs/backend-phase1.md): an edited save can fabricate a Legendary. That is harmless while the item is only used inside the game, and
-- unacceptable the day the item can be sold for money. So a tradeable thing (an unbound Epic / Legendary forged piece, a unique drop, a Gold Pouch) can only ever reach the market
-- when the SERVER issued a certificate for it. The server also rolls the random outcome (the forge rarity and substats, the unique drops, the pouch amount) and refuses implausible
-- amounts, so a certificate is evidence of an honest roll. Nothing is retro-certified: items that already exist in saves stay usable and stay untradeable.
--
-- WHAT THIS FILE CREATES (docs/MARKET_FOUNDATION.md explains it in Portuguese)
--   * public.item_certificates         one row per certified item. Owner may SELECT own rows; NO client write at all (service role only). Content is immutable once written.
--   * public.item_certificate_events   append-only audit: mint, bind, list, transfer, burn, revoke.
--   * public.item_mint_requests        idempotency of mint-item: the same request id returns the same answer, never a second roll.
--   * arena_private.item_buckets       the atomic plausibility limits (a token bucket per user and bucket name, refilled with the server clock).
--   * arena_private.item_account_flags what the owner audits: an account that hit a limit or asked for something it should not.
--   * public.item_take_tokens / item_commit / item_certificate_transition / item_flag_account   service-role-only functions: every limit and every state change is ONE locked statement.
--
-- NOT APPLIED by the work that wrote this file. The owner applies it (SQL editor or `supabase db push`), AFTER 0009, in the DEVELOPMENT project first. It was never run against a real
-- database: only read by static tests (supabase/functions/_shared/__tests__/migration0010.test.ts). The SQL TEST PLAN at the end is what proves it for real.
--
-- ROLLBACK (by hand, in this order; it deletes every certificate, so export first if the market already ran):
--   drop function if exists public.item_flag_account(uuid, text, jsonb);
--   drop function if exists public.item_certificate_transition(uuid, uuid[], text, jsonb);
--   drop function if exists public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb);
--   drop function if exists public.item_take_tokens(uuid, timestamptz, jsonb);
--   drop function if exists arena_private.has_item_flags(uuid);
--   drop table if exists public.item_mint_requests;
--   drop table if exists public.item_certificate_events;
--   drop table if exists public.item_certificates;
--   drop table if exists arena_private.item_account_flags;
--   drop table if exists arena_private.item_buckets;
--   drop function if exists arena_private.item_certificates_guard();
--   drop function if exists arena_private.item_certificate_events_no_change();

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The certificate
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.item_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  -- the gear / unique template id, or the pouch id (gold_pouch_s / _m / _l)
  template_id text not null,
  rarity text,
  tier integer,
  -- [{type, value}, ...] exactly as rolled by the server
  substats jsonb not null default '[]'::jsonb,
  -- the refine level at the moment of issue: always 0. A certificate describes the piece AS ROLLED; refining it changes the piece, so the client voids the certificate first (action 'void').
  upgrade integer not null default 0,
  -- only for a Gold Pouch: the face value, paid for in Gold by the hero when the pouch was made
  gold_amount integer,
  source text not null,
  status text not null default 'held',
  -- Bind on equip: set by the bind action, never cleared. A bound certificate can never be listed.
  bound boolean not null default false,
  bound_at timestamptz,
  -- THE SERVER CLOCK. Nothing a client sends ever sets this.
  created_at timestamptz not null default now(),
  -- sha-256 (hex) of the canonical JSON of the content columns, computed by the function that issued it: two certificates with the same numbers show the same hash
  content_hash text not null,
  -- the mint request that issued it (idempotency) and its position in that request
  request_id text not null,
  request_index integer not null default 0,
  constraint item_certificates_kind_check check (kind in ('gear', 'unique', 'gold_pouch')),
  constraint item_certificates_source_check check (source in ('forge', 'hunt_drop', 'boss_drop', 'pouch')),
  constraint item_certificates_status_check check (status in ('held', 'listed', 'transferred', 'burned', 'revoked')),
  constraint item_certificates_rarity_check check (rarity is null or rarity in ('common', 'rare', 'epic', 'legendary')),
  constraint item_certificates_hash_check check (pg_catalog.char_length(content_hash) = 64),
  constraint item_certificates_upgrade_check check (upgrade >= 0),
  constraint item_certificates_pouch_check check ((kind = 'gold_pouch') = (gold_amount is not null)),
  constraint item_certificates_bound_listed_check check (not (bound and status = 'listed')),
  constraint item_certificates_request_unique unique (user_id, request_id, request_index)
);

create index if not exists item_certificates_user_idx on public.item_certificates (user_id, created_at desc);
create index if not exists item_certificates_user_status_idx on public.item_certificates (user_id, status);
-- the daily limit counts what one account was issued by kind and tier
create index if not exists item_certificates_limit_idx on public.item_certificates (user_id, kind, tier, created_at);

-- Guard: the content never changes after the insert, a bound certificate stays bound, a finished certificate (transferred / burned / revoked) never comes back, and a bound certificate
-- is never listed. Even the service role goes through this (it cannot be used to quietly rewrite what a certificate says).
create or replace function arena_private.item_certificates_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.template_id is distinct from old.template_id
     or new.rarity is distinct from old.rarity
     or new.tier is distinct from old.tier
     or new.substats is distinct from old.substats
     or new.upgrade is distinct from old.upgrade
     or new.gold_amount is distinct from old.gold_amount
     or new.source is distinct from old.source
     or new.created_at is distinct from old.created_at
     or new.content_hash is distinct from old.content_hash
     or new.request_id is distinct from old.request_id then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_CONTENT_IS_IMMUTABLE';
  end if;
  if old.bound and not new.bound then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_BIND_IS_IRREVERSIBLE';
  end if;
  if old.status in ('transferred', 'burned', 'revoked') and new.status is distinct from old.status then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_IS_FINISHED';
  end if;
  if new.status = 'listed' and new.bound then
    raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_BOUND_CANNOT_BE_LISTED';
  end if;
  return new;
end;
$$;

revoke all on function arena_private.item_certificates_guard() from public, anon, authenticated;

drop trigger if exists item_certificates_guard on public.item_certificates;
create trigger item_certificates_guard
  before update on public.item_certificates
  for each row
  execute function arena_private.item_certificates_guard();

alter table public.item_certificates enable row level security;
-- Clients: SELECT of their own rows only. No insert, no update, no delete: only the Edge Functions (service role) write.
revoke all on table public.item_certificates from public, anon, authenticated;
grant select on table public.item_certificates to authenticated;
grant select, insert, update on table public.item_certificates to service_role;

drop policy if exists item_certificates_select_own on public.item_certificates;
create policy item_certificates_select_own
  on public.item_certificates
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The audit trail (append-only)
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.item_certificate_events (
  id bigint generated always as identity primary key,
  certificate_id uuid not null references public.item_certificates (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint item_certificate_events_event_check check (event in ('mint', 'bind', 'list', 'transfer', 'burn', 'revoke'))
);

create index if not exists item_certificate_events_cert_idx on public.item_certificate_events (certificate_id, id);

create or replace function arena_private.item_certificate_events_no_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'ITEM_CERTIFICATE_EVENTS_APPEND_ONLY';
end;
$$;

revoke all on function arena_private.item_certificate_events_no_change() from public, anon, authenticated;

drop trigger if exists item_certificate_events_no_update on public.item_certificate_events;
create trigger item_certificate_events_no_update
  before update on public.item_certificate_events
  for each row
  execute function arena_private.item_certificate_events_no_change();

alter table public.item_certificate_events enable row level security;
revoke all on table public.item_certificate_events from public, anon, authenticated;
grant select on table public.item_certificate_events to authenticated;
grant select, insert on table public.item_certificate_events to service_role;

drop policy if exists item_certificate_events_select_own on public.item_certificate_events;
create policy item_certificate_events_select_own
  on public.item_certificate_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Idempotency: one row per (user, request id). The same request id always gets the same answer, so a lost response is never a second roll.
-- `template` is the answer WITHOUT the certificate bodies (those are the item_certificates rows with this request id, by request_index).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.item_mint_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id text not null,
  kind text not null,
  template jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id),
  constraint item_mint_requests_kind_check check (kind in ('forge', 'hunt_drop', 'boss_drop', 'pouch'))
);

alter table public.item_mint_requests enable row level security;
revoke all on table public.item_mint_requests from public, anon, authenticated;
grant select, insert on table public.item_mint_requests to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- Limits (the buckets) and what the owner audits (the flags). Private: no client can even see them.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists arena_private.item_buckets (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  tokens double precision not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

create table if not exists arena_private.item_account_flags (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists item_account_flags_user_idx on arena_private.item_account_flags (user_id, created_at desc);

grant select, insert, update, delete on table arena_private.item_buckets to service_role;
grant select, insert on table arena_private.item_account_flags to service_role;

-- The market (next round) asks this before it lets an account list anything: true when the account ever hit a plausibility limit.
create or replace function arena_private.has_item_flags(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from arena_private.item_account_flags as f where f.user_id = p_user_id);
$$;

revoke all on function arena_private.has_item_flags(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.item_flag_account: records a flag (service role only).
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.item_flag_account(p_user_id uuid, p_code text, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into arena_private.item_account_flags (user_id, code, detail)
  values (p_user_id, pg_catalog.left(p_code, 64), coalesce(p_detail, '{}'::jsonb));
$$;

revoke all on function public.item_flag_account(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.item_flag_account(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.item_take_tokens: THE atomic limit. A token bucket per (user, bucket name), refilled with the DATABASE clock.
--
--   p_start_at  max(account created, league reset): a bucket that has never been used (or was last used before it) starts with what the account could have earned since then,
--               never more than its capacity. This is the "per account since max(created, reset)" rule.
--   p_takes     [{ "bucket": text, "cost": number, "rate_per_hour": number, "capacity": number, "partial": boolean }, ...]
--               Every non-partial take must be affordable or NOTHING is taken (all or nothing); a partial take grants min(cost, tokens) (the hunt time).
--   The whole call runs under one advisory lock per user, so two parallel calls can never both spend the same token (the same guarantee progress_claim_slot gives the snapshots).
--   Returns { "ok": true, "granted": [number, ...] } or { "ok": false, "failed": "<bucket>" }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.item_take_tokens(p_user_id uuid, p_start_at timestamptz, p_takes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_take jsonb;
  v_bucket text;
  v_cost double precision;
  v_rate double precision;
  v_capacity double precision;
  v_partial boolean;
  v_tokens double precision;
  v_updated timestamptz;
  v_found boolean;
  v_granted double precision;
  v_plan jsonb := '[]'::jsonb;
  v_grants jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_tokens:' || p_user_id::text, 0));

  for v_take in select e.value from pg_catalog.jsonb_array_elements(p_takes) as e loop
    v_bucket := v_take ->> 'bucket';
    v_cost := (v_take ->> 'cost')::double precision;
    v_rate := (v_take ->> 'rate_per_hour')::double precision;
    v_capacity := (v_take ->> 'capacity')::double precision;
    v_partial := coalesce((v_take ->> 'partial')::boolean, false);
    if v_bucket is null or v_cost is null or v_cost < 0 or v_rate is null or v_rate < 0 or v_capacity is null or v_capacity < 0 then
      raise exception using errcode = '22023', message = 'ITEM_TAKE_BAD_ARGUMENT';
    end if;

    select b.tokens, b.updated_at, true into v_tokens, v_updated, v_found
    from arena_private.item_buckets as b
    where b.user_id = p_user_id and b.bucket = v_bucket
    for update;

    if v_found is not true or v_updated < p_start_at then
      v_tokens := least(v_capacity, v_rate * greatest(0, pg_catalog.date_part('epoch', v_now - p_start_at) / 3600.0));
    else
      v_tokens := least(v_capacity, v_tokens + v_rate * greatest(0, pg_catalog.date_part('epoch', v_now - v_updated) / 3600.0));
    end if;
    v_found := null;

    if v_partial then
      v_granted := least(v_cost, v_tokens);
    elsif v_tokens >= v_cost then
      v_granted := v_cost;
    else
      return pg_catalog.jsonb_build_object('ok', false, 'failed', v_bucket);
    end if;
    v_plan := v_plan || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('bucket', v_bucket, 'left', v_tokens - v_granted));
    v_grants := v_grants || pg_catalog.jsonb_build_array(v_granted);
  end loop;

  for v_item in select e.value from pg_catalog.jsonb_array_elements(v_plan) as e loop
    insert into arena_private.item_buckets as b (user_id, bucket, tokens, updated_at)
    values (p_user_id, v_item ->> 'bucket', (v_item ->> 'left')::double precision, v_now)
    on conflict (user_id, bucket) do update set tokens = excluded.tokens, updated_at = excluded.updated_at;
  end loop;

  return pg_catalog.jsonb_build_object('ok', true, 'granted', v_grants);
end;
$$;

revoke all on function public.item_take_tokens(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.item_take_tokens(uuid, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.item_commit: issues the certificates of ONE mint request, atomically.
--
--   Under the per-user lock it (1) answers 'replay' when the request id was already committed (the function then reads the stored answer), (2) refuses with 'cap' when the certificates
--   would pass a daily cap (p_caps: [{ "kind": text, "tier": int|null, "max": int }], counted over the last 24 hours of the server clock, burned / revoked ones included: they were minted),
--   (3) refuses with 'burn_failed' unless EVERY id in p_burn_ids is a held certificate of this user (the forge ingredients), (4) burns them, writes the request, the certificates and their
--   events. Returns { "status": "created", "certificates": [{ "id", "created_at" }, ...] } in the order of p_certs, or { "status": "replay" | "cap" | "burn_failed" }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.item_commit(
  p_user_id uuid,
  p_request_id text,
  p_kind text,
  p_template jsonb,
  p_certs jsonb,
  p_burn_ids uuid[],
  p_caps jsonb
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
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  if exists (select 1 from public.item_mint_requests as r where r.user_id = p_user_id and r.request_id = p_request_id) then
    return pg_catalog.jsonb_build_object('status', 'replay');
  end if;

  for v_cap in select e.value from pg_catalog.jsonb_array_elements(coalesce(p_caps, '[]'::jsonb)) as e loop
    select pg_catalog.count(*)::integer into v_existing
    from public.item_certificates as c
    where c.user_id = p_user_id
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

revoke all on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- public.item_certificate_transition: bind / void / burn, atomically, for certificates the user OWNS.
--   bind  held, not bound -> held, bound (already bound: fine, nothing changes). Irreversible (the guard trigger refuses the opposite).
--   void  held -> revoked  (the piece was refined / reforged / lapidated: the certificate no longer describes it)
--   burn  held -> burned   (salvaged, discarded, a Gold Pouch opened)
--   All ids must exist, belong to p_user_id and be in a state the action accepts (an id already in the action's end state is accepted: the call is idempotent); otherwise nothing changes.
--   Returns { "ok": true, "certificates": [{ "id", "status", "bound" }] } or { "ok": false, "reason": "not_found" | "not_held" | "listed" }.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.item_certificate_transition(p_user_id uuid, p_ids uuid[], p_action text, p_detail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found integer;
  v_ok integer;
  v_out jsonb;
begin
  if p_action not in ('bind', 'void', 'burn') then
    raise exception using errcode = '22023', message = 'ITEM_TRANSITION_BAD_ACTION';
  end if;
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 or pg_catalog.cardinality(p_ids) > 16 then
    raise exception using errcode = '22023', message = 'ITEM_TRANSITION_BAD_IDS';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0));

  select pg_catalog.count(*)::integer into v_found from public.item_certificates as c where c.id = any (p_ids) and c.user_id = p_user_id;
  if v_found <> pg_catalog.cardinality(p_ids) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if exists (select 1 from public.item_certificates as c where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'listed') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'listed');
  end if;

  select pg_catalog.count(*)::integer into v_ok
  from public.item_certificates as c
  where c.id = any (p_ids) and c.user_id = p_user_id
    and ((p_action = 'bind' and c.status = 'held')
      or (p_action = 'void' and c.status in ('held', 'revoked'))
      or (p_action = 'burn' and c.status in ('held', 'burned')));
  if v_ok <> pg_catalog.cardinality(p_ids) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_held');
  end if;

  if p_action = 'bind' then
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    select c.id, p_user_id, 'bind', coalesce(p_detail, '{}'::jsonb) from public.item_certificates as c where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held' and not c.bound;
    update public.item_certificates as c set bound = true, bound_at = pg_catalog.now() where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held' and not c.bound;
  elsif p_action = 'void' then
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    select c.id, p_user_id, 'revoke', coalesce(p_detail, '{}'::jsonb) from public.item_certificates as c where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held';
    update public.item_certificates as c set status = 'revoked' where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held';
  else
    insert into public.item_certificate_events (certificate_id, user_id, event, detail)
    select c.id, p_user_id, 'burn', coalesce(p_detail, '{}'::jsonb) from public.item_certificates as c where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held';
    update public.item_certificates as c set status = 'burned' where c.id = any (p_ids) and c.user_id = p_user_id and c.status = 'held';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'status', c.status, 'bound', c.bound)), '[]'::jsonb) into v_out
  from public.item_certificates as c where c.id = any (p_ids) and c.user_id = p_user_id;
  return pg_catalog.jsonb_build_object('ok', true, 'certificates', v_out);
end;
$$;

revoke all on function public.item_certificate_transition(uuid, uuid[], text, jsonb) from public, anon, authenticated;
grant execute on function public.item_certificate_transition(uuid, uuid[], text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying; nothing here is run automatically).
--
-- A. A signed-in client cannot write. Impersonate a normal user:
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<some user uuid>","role":"authenticated"}', true);
--      insert into public.item_certificates (user_id, kind, template_id, source, content_hash, request_id) values ('<same uuid>', 'gear', 'iron_helm', 'forge', repeat('0', 64), 'x');  -> permission denied
--      update public.item_certificates set status = 'held';                                                                                                           -> permission denied
--      delete from public.item_certificates;                                                                                                                          -> permission denied
--      select public.item_commit(...);  select public.item_take_tokens(...);  select public.item_certificate_transition(...);  select public.item_flag_account(...);       -> permission denied for function
--    `select * from public.item_certificates;` returns that user's own rows only; `select * from arena_private.item_buckets;` fails (no schema access). As `anon` every statement fails, select included.
-- B. Atomic limit: as the service role, in two sessions at once, call
--      select public.item_take_tokens('<user>', now() - interval '10 days', '[{"bucket":"t","cost":1,"rate_per_hour":0.05,"capacity":3,"partial":false}]');
--    five times in parallel: the account starts with min(3, 0.05 x 240 h = 12) = 3 tokens, so exactly 3 calls answer { ok: true } and 2 answer { ok: false, failed: "t" }.
--    A partial take of cost 1000 on a bucket holding 12.5 grants 12.5. A call with one affordable and one unaffordable take changes nothing (read the bucket rows before and after).
--    Refill: update arena_private.item_buckets set updated_at = now() - interval '2 hours'; then a 0.05/hour bucket has gained 0.1.
-- C. Start of the window: a bucket row whose updated_at is older than p_start_at (the league reset) is treated as new: it restarts from rate x (now - p_start_at), not from its old tokens.
-- D. Immutable content: as the service role, `update public.item_certificates set rarity = 'legendary' where ...;` -> ITEM_CERTIFICATE_CONTENT_IS_IMMUTABLE. Same for substats, tier, gold_amount, content_hash.
-- E. Bind is irreversible: select public.item_certificate_transition('<user>', array['<cert>'], 'bind', '{}'); then `update public.item_certificates set bound = false where id = '<cert>';`
--    -> ITEM_CERTIFICATE_BIND_IS_IRREVERSIBLE. A bound certificate cannot be listed: `update public.item_certificates set status = 'listed' where id = '<cert>';` -> ITEM_CERTIFICATE_BOUND_CANNOT_BE_LISTED
--    (and the check constraint item_certificates_bound_listed_check says the same). Binding twice answers ok and writes one 'bind' event.
-- F. Finished stays finished: burn a certificate, then `update public.item_certificates set status = 'held' where id = '<cert>';` -> ITEM_CERTIFICATE_IS_FINISHED. The same after 'void' (revoked).
-- G. Commit is atomic and idempotent: item_commit with a new request id -> status created, one certificate per element of p_certs, one 'mint' event each; the same call again -> status replay and no new rows.
--    With p_caps = [{"kind":"gear","tier":3,"max":1}] a second tier-3 gear certificate inside 24 hours -> status cap and no rows at all. With p_burn_ids holding an id that is not held (or not the user's)
--    -> status burn_failed and the held ones stay held.
-- H. Events are append-only: `update public.item_certificate_events set event = 'mint';` -> ITEM_CERTIFICATE_EVENTS_APPEND_ONLY.
-- I. Transition rules: void a held certificate -> status revoked and one 'revoke' event; void it again -> ok, no new event; burn a revoked one -> not_held; bind a burned one -> not_held;
--    another user's id -> not_found (nothing changes, no hint that the id exists).
-- J. Flags: select public.item_flag_account('<user>', 'TEST', '{}'); then `select arena_private.has_item_flags('<user>');` -> true.
-- ---------------------------------------------------------------------------------------------------------------------------------------
