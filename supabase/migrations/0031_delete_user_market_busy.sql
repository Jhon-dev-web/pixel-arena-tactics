-- The panel does not delete an account in the middle of a market sale (depends on 0011 market, 0027 admin delete, 0029). NOT APPLIED from this repo: the owner runs it (SQL editor or
-- `supabase db push`), in the DEVELOPMENT project first. It is run for real by admin/tests/sql/deleteuser.integration.test.ts (an in-memory Postgres).
--
-- THE PROBLEM THIS SOLVES. Since 0029 a seller can be deleted. If he had a listing RESERVED by a buyer, the cascade removed the listing while the reservation stayed 'pending'; the buyer could
-- still pay on chain and market_record_payment then raised (no listing), so the payment was recorded nowhere (not even as refund_due). The same holds for a deleted buyer with a pending reservation.
-- admin_delete_user_prepare now answers {status:'blocked', constraint:'market_sale_in_progress'} (audited as 'delete_user_blocked') while such a reservation exists; it ends in at most 30 minutes.
-- The Edge Function admin-delete-user passes 'blocked' through unchanged, so it needs no redeploy; the panel shows its own sentence for this constraint.
--
-- ROLLBACK (by hand): re-run the create statement of public.admin_delete_user_prepare(uuid, text) from 0027.

create or replace function public.admin_delete_user_prepare(p_user uuid, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_confirm text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_confirm, '')));
  v_email text;
  v_username text;
  v_hero text;
  v_created timestamptz;
  v_expected text[];
  v_audit bigint;
  v_constraint text;
  v_table text;
  v_blocked boolean := false;
  v_state text;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_ONLY';
  end if;
  v_admin := (select auth.uid());
  if p_user is null then
    raise exception using errcode = '22023', message = 'USER_NOT_FOUND';
  end if;
  if p_user = v_admin then
    raise exception using errcode = '22023', message = 'ADMIN_DELETE_SELF';
  end if;
  if exists (select 1 from arena_private.admins as a where a.user_id = p_user) then
    raise exception using errcode = '22023', message = 'ADMIN_DELETE_ADMIN';
  end if;
  select u.email, u.created_at into v_email, v_created from auth.users as u where u.id = p_user;
  if not found then
    raise exception using errcode = '22023', message = 'USER_NOT_FOUND';
  end if;
  select p.username into v_username from public.profiles as p where p.user_id = p_user;
  select c.hero_name into v_hero from public.characters as c where c.user_id = p_user;

  v_expected := pg_catalog.array_remove(array[pg_catalog.lower(pg_catalog.btrim(coalesce(v_username, ''))), pg_catalog.lower(pg_catalog.btrim(coalesce(v_hero, '')))], '');
  if pg_catalog.cardinality(v_expected) = 0 and v_email is not null then
    v_expected := array[pg_catalog.lower(pg_catalog.btrim(v_email))];
  end if;
  if v_confirm = '' or not (v_confirm = any (v_expected)) then
    raise exception using errcode = '22023', message = 'CONFIRM_MISMATCH';
  end if;

  -- 0031: never in the middle of a sale. A pending reservation on one of his listings (he is the seller), or one he holds (he is the buyer), means a payment may be on its way:
  -- deleting now would leave that payment with nothing to record it against. The owner waits for it to settle or expire (30 minutes) and tries again.
  if exists (
    select 1 from public.market_reservations as r
    where r.status = 'pending'
      and (r.buyer_id = p_user or exists (select 1 from public.market_listings as l where l.id = r.listing_id and l.seller_id = p_user))
  ) or exists (select 1 from public.market_listings as l where l.seller_id = p_user and l.status = 'reserved') then
    perform arena_private.admin_audit_add('delete_user_blocked', p_user, pg_catalog.jsonb_build_object('username', v_username, 'constraint', 'market_sale_in_progress', 'table', 'market_reservations'));
    return pg_catalog.jsonb_build_object('status', 'blocked', 'constraint', 'market_sale_in_progress', 'table', 'market_reservations');
  end if;

  -- The dry run: delete inside a sub-transaction that is ALWAYS rolled back (the block raises on purpose). If a foreign key without a cascade (or a guard trigger) would stop the real deletion,
  -- the owner is told now, before anything is half done.
  begin
    delete from auth.users as u where u.id = p_user;
    raise exception using errcode = 'P0001', message = 'DELETE_DRY_RUN_OK';
  exception
    when foreign_key_violation then
      v_blocked := true;
      get stacked diagnostics v_constraint = constraint_name, v_table = table_name;
    when others then
      get stacked diagnostics v_state = returned_sqlstate, v_constraint = constraint_name, v_table = table_name;
      if sqlerrm is distinct from 'DELETE_DRY_RUN_OK' then
        v_blocked := true;
      end if;
  end;

  if v_blocked then
    perform arena_private.admin_audit_add('delete_user_blocked', p_user, pg_catalog.jsonb_build_object('username', v_username, 'constraint', v_constraint, 'table', v_table, 'sqlstate', v_state));
    return pg_catalog.jsonb_build_object('status', 'blocked', 'constraint', v_constraint, 'table', v_table);
  end if;

  v_audit := arena_private.admin_audit_add(
    'delete_user',
    p_user,
    pg_catalog.jsonb_build_object(
      'username', v_username,
      'hero_name', v_hero,
      -- masked: enough to recognise the account later, not the address
      'email_masked', case when v_email is null then null else pg_catalog.left(v_email, 2) || '***' || pg_catalog.substr(v_email, pg_catalog.strpos(v_email, '@')) end,
      'account_created_at', v_created
    )
  );
  return pg_catalog.jsonb_build_object('status', 'ok', 'user_id', p_user, 'username', v_username, 'hero_name', v_hero, 'audit_id', v_audit);
end;
$$;

revoke all on function public.admin_delete_user_prepare(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_user_prepare(uuid, text) to authenticated;
