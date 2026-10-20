-- Payments that carry a reference, and the queue for the ones that cannot be matched (depends on 0003 entitlements, 0011-0013 market / Pass, 0020 is_admin()). NOT APPLIED from this repo: the owner runs it
-- (SQL editor or `supabase db push`), in the DEVELOPMENT project first. It is read by static tests (supabase/functions/_shared/__tests__/migration0022.test.ts).
--
-- WHY. A Pass payment used to be accepted only from the LINKED wallet; a payment from any other account, a payment with the wrong amount or one that arrived after the intent had been renewed was refused
-- and the money sat in the game's wallet with nobody told. Now the game's transactions carry an SPL Memo with a reference, the server recognises the payment by it, and any verified on-chain payment that
-- reached the game's receiving address but cannot be matched is written down HERE for the owner, who sees it in the admin dashboard ("Pagamentos a resolver") and resolves it with the two functions below.
--
--   * public.pass_payment_refs        one random reference per player (32 hex characters). It is what the Pass memo carries: "pa1:pass:<ref>". Unguessable, never shown to anybody but its owner.
--   * public.payment_exceptions       the queue: who / what / how much / which signature / why it could not be matched, and how it was resolved.
--   * public.pass_crypto_ref          get-or-create the reference of a player (service role).
--   * public.payment_exception_record writes a row (idempotent on the signature; a second player claiming the same signature is only noted).
--   * public.payment_exception_close  closes a row by itself when the payment is matched after all (the player submitted it properly).
--   * public.chain_payment_set_payer  a payment recognised by its memo but made from another wallet of the player: the counted payment records the wallet that REALLY paid, and the audit log (market_events,
--                                     kind paid_from_other_wallet) keeps the soft signal.
--   * public.admin_payment_exceptions the owner's read (is_admin() only).
--   * arena_private.payment_exception_grant_pass / payment_exception_mark_refunded   the two resolutions, run by the owner in the SQL editor (never callable from the API).
--
-- Everything is private: RLS on, no policy, every grant revoked. Functions are security definer with an empty search_path.
--
-- ROLLBACK (by hand; the queue holds only derived data, the chain is the record):
--   drop function if exists public.admin_payment_exceptions(text, integer, integer);
--   drop function if exists arena_private.payment_exception_mark_refunded(text, text);
--   drop function if exists arena_private.payment_exception_grant_pass(text);
--   drop function if exists public.chain_payment_set_payer(text, text);
--   drop function if exists public.payment_exception_close(text);
--   drop function if exists public.payment_exception_record(text, integer, boolean, text, text, uuid, uuid, text, text, numeric, text, timestamptz);
--   drop function if exists public.pass_crypto_ref(uuid);
--   drop table if exists public.payment_exceptions;  drop table if exists public.pass_payment_refs;

create schema if not exists arena_private;
revoke all on schema arena_private from public, anon, authenticated;
grant usage on schema arena_private to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The player's Pass reference.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.pass_payment_refs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ref text not null unique,
  created_at timestamptz not null default now(),
  constraint pass_payment_refs_ref_check check (ref ~ '^[0-9a-f]{32}$')
);

alter table public.pass_payment_refs enable row level security;
revoke all on table public.pass_payment_refs from public, anon, authenticated;
grant select, insert on table public.pass_payment_refs to service_role;

create or replace function public.pass_crypto_ref(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pass_ref:' || p_user_id::text, 0));
  select r.ref into v_ref from public.pass_payment_refs as r where r.user_id = p_user_id;
  if v_ref is null then
    v_ref := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
    insert into public.pass_payment_refs (user_id, ref) values (p_user_id, v_ref);
  end if;
  return v_ref;
end;
$$;

revoke all on function public.pass_crypto_ref(uuid) from public, anon, authenticated;
grant execute on function public.pass_crypto_ref(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The queue.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.payment_exceptions (
  id uuid primary key default gen_random_uuid(),
  -- the transaction signature: one row per payment, ever (the same payment submitted twice is the same row)
  signature text not null unique,
  chain_id integer not null,
  livemode boolean not null,
  -- 'pass' = the Adventurer Pass, 'market' = a sale
  purpose text not null,
  -- why it could not be matched:
  --   no_memo / wrong_memo   the payment carries no game reference, or one that is not this player's, and did not come from his linked wallet
  --   short_amount           it reached the game but is less than the price
  --   too_early              it was made before the intent / reservation it was submitted for
  --   wrong_sender           (market) the transfers came from several wallets, or from an address that must be paid
  --   already_owned          (Pass) the player already had the Pass: the payment is owed back
  --   duplicate              (market) a second payment for a reservation that was already paid, or for a sold listing
  reason text not null,
  -- the player who submitted it (the first one; others are noted in claimed_by). Null when unknown.
  user_id uuid references auth.users (id) on delete set null,
  claimed_by uuid[] not null default '{}'::uuid[],
  reservation_id uuid,
  payer_address text,
  receiver_address text not null,
  -- USDC base units (6 decimals) for the Pass, lamports for a sale: what reached the game
  amount_units numeric(40, 0) not null,
  memo text,
  block_time timestamptz,
  -- 'open' | 'granted' (the Pass was granted by hand) | 'refunded' (returned to the payer) | 'resolved' (matched after all)
  status text not null default 'open',
  -- the entitlement id (granted) or the refund transaction signature (refunded)
  resolution_ref text,
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint payment_exceptions_signature_check check (signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$'),
  constraint payment_exceptions_purpose_check check (purpose in ('pass', 'market')),
  constraint payment_exceptions_reason_check check (reason in ('no_memo', 'wrong_memo', 'short_amount', 'too_early', 'wrong_sender', 'already_owned', 'duplicate')),
  constraint payment_exceptions_status_check check (status in ('open', 'granted', 'refunded', 'resolved')),
  constraint payment_exceptions_amount_check check (amount_units > 0),
  constraint payment_exceptions_memo_check check (memo is null or pg_catalog.char_length(memo) <= 120),
  constraint payment_exceptions_note_check check (note is null or pg_catalog.char_length(note) <= 300)
);

create index if not exists payment_exceptions_status_idx on public.payment_exceptions (status, created_at desc);
create index if not exists payment_exceptions_user_idx on public.payment_exceptions (user_id, created_at desc);

alter table public.payment_exceptions enable row level security;
revoke all on table public.payment_exceptions from public, anon, authenticated;
grant select on table public.payment_exceptions to service_role;

-- Records one unmatched payment. Idempotent on the signature. Answers { "status": "recorded" | "exists" | "applied", "id" }:
--   * "applied"  the signature is already a counted payment (chain_payments): there is nothing to resolve;
--   * "exists"   the row was there; another player submitting the same signature is added to claimed_by (the owner decides who is right).
create or replace function public.payment_exception_record(
  p_signature text,
  p_chain_id integer,
  p_livemode boolean,
  p_purpose text,
  p_reason text,
  p_user_id uuid,
  p_reservation_id uuid,
  p_payer text,
  p_receiver text,
  p_amount_units numeric,
  p_memo text,
  p_block_time timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$' or p_receiver !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' or (p_payer is not null and p_payer !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$') then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_BAD_ARGUMENT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment_exception:' || p_signature, 0));

  if exists (select 1 from public.chain_payments as p where p.tx_hash = p_signature and p.status = 'applied') then
    return pg_catalog.jsonb_build_object('status', 'applied');
  end if;

  insert into public.payment_exceptions (signature, chain_id, livemode, purpose, reason, user_id, reservation_id, payer_address, receiver_address, amount_units, memo, block_time)
  values (p_signature, p_chain_id, p_livemode, p_purpose, p_reason, p_user_id, p_reservation_id, p_payer, p_receiver, p_amount_units, pg_catalog.left(p_memo, 120), p_block_time)
  on conflict (signature) do nothing
  returning id into v_id;
  if v_id is not null then
    return pg_catalog.jsonb_build_object('status', 'recorded', 'id', v_id);
  end if;

  update public.payment_exceptions as x
     set claimed_by = case when p_user_id is not null and x.user_id is distinct from p_user_id and not (p_user_id = any (x.claimed_by)) then pg_catalog.array_append(x.claimed_by, p_user_id) else x.claimed_by end
   where x.signature = p_signature
   returning x.id into v_id;
  return pg_catalog.jsonb_build_object('status', 'exists', 'id', v_id);
end;
$$;

revoke all on function public.payment_exception_record(text, integer, boolean, text, text, uuid, uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.payment_exception_record(text, integer, boolean, text, text, uuid, uuid, text, text, numeric, text, timestamptz) to service_role;

-- The payment was matched after all (the player submitted it again with the right reference, or from the linked wallet): the open row closes itself.
create or replace function public.payment_exception_close(p_signature text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_closed integer;
begin
  update public.payment_exceptions as x
     set status = 'resolved', resolved_at = pg_catalog.now(), note = 'matched after all'
   where x.signature = p_signature and x.status = 'open';
  get diagnostics v_closed = row_count;
  return v_closed > 0;
end;
$$;

revoke all on function public.payment_exception_close(text) from public, anon, authenticated;
grant execute on function public.payment_exception_close(text) to service_role;

-- A payment was recognised by its memo but made from another wallet of the player (the soft signal: never a refusal). market_record_payment (0013) stores the reservation's buyer address as the payer of a
-- sale; this records the wallet that really paid, notes it on the counted payment and writes the audit event. Only from_address and note of a counted payment change.
create or replace function public.chain_payment_set_payer(p_tx_hash text, p_payer text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.chain_payments%rowtype;
begin
  if p_tx_hash !~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$' or p_payer !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    raise exception using errcode = '22023', message = 'PAYMENT_PAYER_BAD_ARGUMENT';
  end if;
  select * into v_row from public.chain_payments as p where p.tx_hash = p_tx_hash;
  if not found then
    return false;
  end if;
  update public.chain_payments as p
     set from_address = p_payer, note = coalesce(p.note || '; ', '') || 'paid from another wallet of the player (memo)'
   where p.tx_hash = p_tx_hash;
  perform arena_private.market_log('paid_from_other_wallet', v_row.user_id, null, v_row.reservation_id, pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'payer', p_payer, 'purpose', v_row.purpose));
  return true;
end;
$$;

revoke all on function public.chain_payment_set_payer(text, text) from public, anon, authenticated;
grant execute on function public.chain_payment_set_payer(text, text) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The owner's read. p_status: 'open' (default), 'resolved' (granted, refunded or matched) or 'all'. Newest first. Shows the player's username, the wallet linked to him now (to compare with the payer),
-- and everything needed to find the transaction. Never an e-mail.
-- ---------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.admin_payment_exceptions(p_status text default 'open', p_page integer default 0, p_page_size integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size integer;
  v_offset integer;
  v_total bigint;
  v_open bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  if p_status is null or p_status not in ('open', 'resolved', 'all') then
    raise exception using errcode = '22023', message = 'ADMIN_BAD_STATUS';
  end if;
  v_size := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset := greatest(coalesce(p_page, 0), 0) * v_size;

  select count(*) into v_total from public.payment_exceptions as x where p_status = 'all' or (p_status = 'open' and x.status = 'open') or (p_status = 'resolved' and x.status <> 'open');
  select count(*) into v_open from public.payment_exceptions as x where x.status = 'open';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'signature', q.signature, 'purpose', q.purpose, 'reason', q.reason, 'status', q.status, 'livemode', q.livemode,
           'user_id', q.user_id, 'username', q.username, 'linked_wallet', q.linked_wallet, 'claimed_by', q.claimed_by, 'reservation_id', q.reservation_id,
           'payer_address', q.payer_address, 'receiver_address', q.receiver_address, 'amount_units', q.amount_units, 'memo', q.memo, 'block_time', q.block_time,
           'resolution_ref', q.resolution_ref, 'note', q.note, 'created_at', q.created_at, 'resolved_at', q.resolved_at
         ) order by q.created_at desc, q.id), '[]'::jsonb)
    into v_rows
  from (
    select x.*, pr.username, w.address as linked_wallet
    from public.payment_exceptions as x
    left join public.profiles as pr on pr.user_id = x.user_id
    left join public.market_wallets as w on w.user_id = x.user_id
    where p_status = 'all' or (p_status = 'open' and x.status = 'open') or (p_status = 'resolved' and x.status <> 'open')
    order by x.created_at desc, x.id
    limit v_size offset v_offset
  ) as q;

  return jsonb_build_object('total', v_total, 'open', v_open, 'page', greatest(coalesce(p_page, 0), 0), 'page_size', v_size, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_payment_exceptions(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_payment_exceptions(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- The two resolutions. Run by the OWNER in the SQL editor (role postgres); revoked from every API role, so no player and no admin session can call them.
--   select arena_private.payment_exception_grant_pass('<signature>');
--   select arena_private.payment_exception_mark_refunded('<signature>', '<signature of the refund transaction>');
-- ---------------------------------------------------------------------------------------------------------------------------------------

-- Grants the Adventurer Pass to the player of an OPEN Pass exception: an entitlement with source 'grant' and the payment's signature as its reference (so the same payment can never grant twice and the
-- entitlement says where it came from). Refuses when the exception is not open, is not a Pass payment, has no player, or the player already has the Pass.
create or replace function arena_private.payment_exception_grant_pass(p_signature text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x public.payment_exceptions%rowtype;
  v_entitlement uuid;
begin
  select * into v_x from public.payment_exceptions as x where x.signature = p_signature for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_EXCEPTION_NOT_FOUND';
  end if;
  if v_x.status <> 'open' then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_NOT_OPEN';
  end if;
  if v_x.purpose <> 'pass' or v_x.user_id is null then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_NOT_A_PASS_PAYMENT';
  end if;
  if exists (select 1 from public.entitlements as e where e.user_id = v_x.user_id and e.kind = 'adventurer_pass' and e.status = 'active') then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_ALREADY_OWNED';
  end if;

  insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode)
  values (v_x.user_id, 'adventurer_pass', 'grant', p_signature, 'active', v_x.livemode)
  returning id into v_entitlement;

  update public.payment_exceptions as x set status = 'granted', resolution_ref = v_entitlement::text, resolved_at = pg_catalog.now() where x.id = v_x.id;
  perform arena_private.market_log('payment_exception_granted', v_x.user_id, null, null, pg_catalog.jsonb_build_object('signature', p_signature, 'entitlement', v_entitlement));
  return pg_catalog.jsonb_build_object('status', 'granted', 'entitlement_id', v_entitlement);
end;
$$;

revoke all on function arena_private.payment_exception_grant_pass(text) from public, anon, authenticated;

-- Marks an OPEN exception as returned to the payer, with the signature of the transaction that returned it.
create or replace function arena_private.payment_exception_mark_refunded(p_signature text, p_refund_signature text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_x public.payment_exceptions%rowtype;
begin
  if p_refund_signature !~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$' then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_BAD_REFUND_SIGNATURE';
  end if;
  select * into v_x from public.payment_exceptions as x where x.signature = p_signature for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_EXCEPTION_NOT_FOUND';
  end if;
  if v_x.status <> 'open' then
    raise exception using errcode = '22023', message = 'PAYMENT_EXCEPTION_NOT_OPEN';
  end if;
  update public.payment_exceptions as x set status = 'refunded', resolution_ref = p_refund_signature, resolved_at = pg_catalog.now() where x.id = v_x.id;
  perform arena_private.market_log('payment_exception_refunded', v_x.user_id, null, null, pg_catalog.jsonb_build_object('signature', p_signature, 'refund_signature', p_refund_signature));
  return pg_catalog.jsonb_build_object('status', 'refunded');
end;
$$;

revoke all on function arena_private.payment_exception_mark_refunded(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------
-- SQL TEST PLAN (run after applying 0022 to the DEVELOPMENT project; nothing here is run automatically).
--   A. As `authenticated` (set local role authenticated): select * from public.payment_exceptions; select * from public.pass_payment_refs; -> permission denied. select public.pass_crypto_ref('<U>'); -> permission denied.
--   B. As the service role: select public.pass_crypto_ref('<U>'); twice -> the same 32 hex characters; another user gets another one.
--   C. select public.payment_exception_record(repeat('2', 88), 502, false, 'pass', 'no_memo', '<U1>', null, '<W>', '<R>', 10000000, null, now()); -> recorded; again -> exists;
--      with '<U2>' -> exists, and claimed_by now holds U2. An address of 31 characters -> exception PAYMENT_EXCEPTION_BAD_ARGUMENT.
--   D. As an admin session: select public.admin_payment_exceptions(); -> one row with the username and linked_wallet. As a non-admin -> ADMIN_ONLY.
--   E. As postgres: select arena_private.payment_exception_grant_pass(repeat('2', 88)); -> granted, and select * from entitlements where provider_ref = repeat('2', 88) -> source 'grant'.
--      Again -> PAYMENT_EXCEPTION_NOT_OPEN. For a user who already has the Pass -> PAYMENT_EXCEPTION_ALREADY_OWNED.
--   F. select arena_private.payment_exception_mark_refunded('<sig of an open row>', repeat('3', 88)); -> refunded, resolution_ref = the refund signature.
