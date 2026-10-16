import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MATERIAL_BOUNDS } from '../materials/bounds.ts';
import { MARKET_RULES } from '../market/rules.ts';
import { ITEM_BOUNDS } from '../items/bounds.ts';

// Migration 0015 (tradeable materials) is SQL that was never run from this repo: these tests read the file and pin what it must guarantee. The SQL TEST PLAN at the end of the file is what
// proves it against a real database.

const root = resolve(__dirname, '../../../..');
const raw = readFileSync(resolve(root, 'supabase/migrations/0015_tradeable_materials.sql'), 'utf8').split('\r\n').join('\n'); // (a checkout on Windows may carry CRLF)
const code = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

function fn(name: string): string {
  const start = code.indexOf(`create or replace function ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('$$;', code.indexOf('as $$', start)) + 3);
}

describe('0015 (part A): the balance cannot be written by a client', () => {
  it('RLS is on for every table, the only policies are "select own", and a client gets SELECT and nothing else', () => {
    for (const t of ['material_balances', 'material_ledger', 'material_requests']) {
      expect(code).toContain(`alter table public.${t} enable row level security;`);
      expect(code).toContain(`revoke all on table public.${t} from public, anon, authenticated;`);
    }
    const policies = code.match(/create policy [a-z_]+/g) ?? [];
    expect(policies.sort()).toEqual(['create policy material_balances_select_own', 'create policy material_ledger_select_own']);
    expect(code).toMatch(/create policy material_balances_select_own\s+on public\.material_balances\s+for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\);/);
    expect(code).toMatch(/create policy material_ledger_select_own\s+on public\.material_ledger\s+for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\);/);
    const grants = code.match(/grant [a-z, ]+ on (?:table )?[a-z_.]+ to [a-z_]+;/g) ?? [];
    for (const g of grants) {
      expect(g).not.toMatch(/to anon;|to public;/);
      if (/to authenticated;/.test(g)) expect(g).toMatch(/^grant select on table public\.material_(?:balances|ledger) to authenticated;$/);
    }
    expect(code).not.toMatch(/grant (?:insert|update|delete|all)[a-z, ]* on [a-z_.\s]+ to authenticated/);
    // the idempotency table is not even readable
    expect(code).not.toMatch(/grant [a-z, ]*select[a-z, ]* on table public\.material_requests to authenticated/);
  });

  it('every function is security definer with an empty search_path and callable by the service role only', () => {
    for (const [name, sig] of [
      ['public.item_take_tokens(', 'public.item_take_tokens(uuid, timestamptz, jsonb)'],
      ['public.material_credit(', 'public.material_credit(uuid, text, jsonb)'],
      ['public.material_burn(', 'public.material_burn(uuid, text, jsonb)'],
      ['public.material_ack(', 'public.material_ack(uuid, text, jsonb)'],
    ] as const) {
      const body = fn(name);
      expect(body, name).toContain('security definer');
      expect(body, name).toContain("set search_path = ''");
      expect(code).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function ${sig} to service_role;`);
    }
    expect(code).not.toMatch(/grant execute on function [^;]* to (?:anon|authenticated|public);/);
  });
});

describe('0015 (part A): the balance rules', () => {
  it('a balance is never negative, never over 100 million, and pending never exceeds it', () => {
    expect(code).toContain('constraint material_balances_qty_check check (qty >= 0 and qty <= 100000000)');
    expect(code).toContain('constraint material_balances_pending_check check (pending >= 0 and pending <= qty)');
    expect(code).toContain("constraint material_balances_id_check check (material_id ~ '^[a-z][a-z_]{1,39}$')");
  });

  it('credit, burn and ack run under the per-user lock the certificates and the market share, and answer a request id once', () => {
    for (const name of ['public.material_credit(', 'public.material_burn(', 'public.material_ack(']) {
      const f = fn(name);
      expect(f, name).toContain("pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0))");
      expect(f, name).toContain('public.material_requests');
      // the replay answer comes before any write
      expect(f.indexOf("'replay'"), name).toBeGreaterThan(-1);
      expect(f.indexOf("'replay'"), name).toBeLessThan(f.indexOf('insert into public.material_ledger'));
    }
    expect(fn('public.material_credit(')).toContain('on conflict (user_id, material_id) do update set qty = b.qty + excluded.qty');
  });

  it('a burn never goes below zero and pulls pending down with it; an ack never goes below zero', () => {
    const burn = fn('public.material_burn(');
    expect(burn).toContain('v_take := least(v_ask, v_qty);');
    expect(burn).toContain('pending = least(b.pending, b.qty - v_take)');
    const ack = fn('public.material_ack(');
    expect(ack).toContain('v_take := least(v_ask, v_pending);');
    expect(ack).toContain('pending = b.pending - v_take');
  });

  it('bad arguments are refused before anything is written', () => {
    expect(fn('public.material_credit(')).toContain('MATERIAL_CREDIT_BAD_ARGUMENT');
    expect(fn('public.material_burn(')).toContain('MATERIAL_BURN_BAD_ARGUMENT');
    expect(fn('public.material_ack(')).toContain('MATERIAL_ACK_BAD_ARGUMENT');
    for (const name of ['public.material_credit(', 'public.material_burn(', 'public.material_ack(']) expect(fn(name)).toContain("p_request_id !~ '^[A-Za-z0-9_.:-]{8,64}$'");
  });

  it('the ledger is append-only (updates raise), but deleting an account can still cascade', () => {
    expect(code).toContain('before update on public.material_ledger');
    expect(code).not.toContain('before update or delete on public.material_ledger');
    expect(code).toContain('MATERIAL_LEDGER_APPEND_ONLY');
  });
});

describe('0015 (part A): item_take_tokens keeps the 0010 behaviour and learns "whole"', () => {
  const f = fn('public.item_take_tokens(');
  it('is still one advisory lock per user, all-or-nothing for non-partial takes, with the database clock', () => {
    expect(f).toContain("pg_advisory_xact_lock(pg_catalog.hashtextextended('item_tokens:' || p_user_id::text, 0))");
    expect(f).toContain('for update');
    expect(f).toContain("'ok', false, 'failed'");
    expect(f.indexOf("return pg_catalog.jsonb_build_object('ok', false")).toBeLessThan(f.indexOf('insert into arena_private.item_buckets'));
    expect(f).toContain('pg_catalog.now()');
    expect(f).toContain('least(v_capacity');
  });
  it('whole grants floor(min(cost, tokens)) and only with partial', () => {
    expect(f).toContain("v_whole := coalesce((v_take ->> 'whole')::boolean, false);");
    expect(f).toMatch(/if v_partial then\s+v_granted := least\(v_cost, v_tokens\);\s+if v_whole then\s+v_granted := pg_catalog\.floor\(v_granted\);\s+end if;\s+elsif/);
  });
});

describe('0015 (part A): the League reset empties the balances of the replaced heroes', () => {
  it('writes the ledger before it zeroes the balances, and only touches balances older than the reset', () => {
    const f = fn('arena_private.item_certificates_league_reset()');
    expect(f).toContain('update public.material_balances as b set qty = 0, pending = 0, seq = b.seq + 1');
    expect(f.indexOf('insert into public.material_ledger')).toBeLessThan(f.indexOf('update public.material_balances'));
    expect(f.match(/b\.updated_at < new\.reset_at/g)?.length).toBe(2);
    // the certificates' part of the trigger is still there
    expect(f).toContain("set status = 'revoked'");
  });
});

describe('0015: documented', () => {
  it('says what it does, that it was not applied, how to roll back, and has a SQL test plan', () => {
    expect(raw).toContain('NOT APPLIED');
    expect(raw).toContain('ROLLBACK');
    expect(raw).toContain('SQL TEST PLAN');
    for (const drop of ['drop function if exists public.material_ack(uuid, text, jsonb);', 'drop function if exists public.material_burn(uuid, text, jsonb);', 'drop function if exists public.material_credit(uuid, text, jsonb);', 'drop table if exists public.material_balances;']) expect(raw).toContain(drop);
  });
  it('the server numbers the SQL relies on are the ones in the TypeScript tables (a sanity link, not a copy)', () => {
    expect(MATERIAL_BOUNDS.heroCapacitySeconds).toBe(ITEM_BOUNDS.huntCapacitySeconds);
    expect(MARKET_RULES.maxActiveListings).toBeGreaterThan(0);
  });
});

describe('0015 (part B): a listing is an item OR a lot, never both, never neither', () => {
  it('the table checks say so, and the lot\'s price is exactly unit x quantity x 1000 lamports', () => {
    expect(code).toContain('alter table public.market_listings alter column certificate_id drop not null;');
    expect(code).toMatch(/constraint \(\s*\(certificate_id is not null and material_id is null and material_qty is null and unit_price_micro is null\)|add constraint market_listings_item_check check \(\s*\(certificate_id is not null and material_id is null and material_qty is null and unit_price_micro is null\)/);
    expect(code).toContain("or (certificate_id is null and material_id ~ '^[a-z][a-z_]{1,39}$' and material_qty between 1 and 100000 and unit_price_micro >= 1 and price_lamports = unit_price_micro * material_qty * 1000)");
    expect(code).toContain('(certificate_id is not null and new_certificate_id is not null and material_id is null and material_qty is null)');
    expect(code).toContain('or (certificate_id is null and new_certificate_id is null and material_id is not null and material_qty > 0)');
  });

  it('items keep their 0.001 SOL steps; a lot only needs a whole number of micro-SOL', () => {
    expect(code).toContain('price_lamports between 1000000 and 1000000000000 and (price_lamports % 1000000 = 0 or (material_id is not null and price_lamports % 1000 = 0))');
  });

  it('a retry of the same lot is the same listing (one request id per seller)', () => {
    expect(code).toContain('create unique index if not exists market_listings_request_unique on public.market_listings (seller_id, request_id) where request_id is not null;');
  });

  it('the public view shows lots without a seller, a wallet address or a certificate id, and keeps its first twelve columns', () => {
    const start = code.indexOf('create or replace view public.market_listings_public as');
    const view = code.slice(start, code.indexOf('revoke all on table public.market_listings_public', start));
    expect(view).toContain('union all');
    expect(view).not.toMatch(/seller_|buyer_|certificate_id,|wallet|address/);
    expect(view).toContain("l.status in ('open', 'reserved') and l.expires_at > pg_catalog.now()");
    expect(view.match(/l\.material_qty/g)?.length).toBe(1);
    expect(code).toContain('grant select on table public.market_listings_public to anon, authenticated, service_role;');
  });
});

describe('0015 (part B): the units move exactly once', () => {
  const list = fn('public.market_list_material(');
  it('listing: under the seller\'s lock, idempotent first, then the checks, then the escrow, then the listing and the ledger', () => {
    expect(list).toContain("pg_advisory_xact_lock(pg_catalog.hashtextextended('item_commit:' || p_user_id::text, 0))");
    const order = ["where l.seller_id = p_user_id and l.request_id = p_request_id", "'reason', 'price'", "'reason', 'no_wallet'", "'reason', 'flagged'", "'reason', 'not_enough'", "'reason', 'limit_active'", "'reason', 'limit_day'", 'update public.material_balances', 'insert into public.market_listings', "insert into public.material_ledger"];
    const at = order.map((s) => list.indexOf(s));
    expect(at.every((i) => i > -1), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('the balance that can be listed is the one IN THE SAVE (qty - pending), taken with a row lock', () => {
    expect(list).toContain('v_bal.qty - v_bal.pending < p_qty');
    expect(list).toContain('for update');
    expect(list).toContain('set qty = b.qty - p_qty');
    expect(list).toContain('v_total := p_unit_price_micro * p_qty * 1000;');
    expect(list).toContain('p_qty > p_max_qty');
  });
  it('a cancelled or expired lot goes back to the seller through the delivery helper, not to the stack directly', () => {
    expect(fn('public.market_cancel_listing(')).toContain("arena_private.material_deliver(p_user_id, v_listing.material_id, v_listing.material_qty, 'unlist'");
    expect(fn('arena_private.market_release_stale(')).toContain("arena_private.material_deliver(v_listing.seller_id, v_listing.material_id, v_listing.material_qty, 'unlist'");
    const deliver = fn('arena_private.material_deliver(');
    expect(deliver).toContain('qty = b.qty + excluded.qty, pending = b.pending + excluded.pending, seq = b.seq + 1');
    expect(code).toContain('revoke all on function arena_private.material_deliver(uuid, text, integer, text, text) from public, anon, authenticated;');
  });
  it('a sale of a lot delivers the whole lot to the BUYER and creates no certificate; items keep their path', () => {
    const f = fn('public.market_record_payment(');
    const lot = f.indexOf('if v_listing.material_id is not null then');
    expect(lot).toBeGreaterThan(-1);
    expect(f.indexOf("arena_private.material_deliver(p_buyer_id, v_listing.material_id, v_listing.material_qty, 'sale'")).toBeGreaterThan(lot);
    // the lot returns before any certificate is touched
    expect(f.indexOf("'material_qty', v_listing.material_qty);\n  end if;")).toBeGreaterThan(lot);
    expect(f.indexOf('select * into v_cert from public.item_certificates')).toBeGreaterThan(f.indexOf("'material_qty', v_listing.material_qty);\n  end if;"));
    // the money steps are untouched: the numbers, the signature consumed first, the late-payment rules
    for (const part of ["raise exception using errcode = '22023', message = 'MARKET_PAYMENT_MISMATCH';", 'on conflict (tx_hash) do nothing;', "'late_payment_accepted'", "'refund_due'", "'already_sold'"]) expect(f, part).toContain(part);
    expect(f.indexOf('on conflict (tx_hash) do nothing;')).toBeLessThan(lot);
  });
  it('every new function is service-role only', () => {
    for (const sig of ['public.market_list_material(uuid, text, text, integer, bigint, integer, integer, integer, bigint, bigint, integer)', 'public.market_cancel_listing(uuid, uuid)', 'public.market_record_payment(uuid, uuid, text, text, text, numeric, bigint, timestamptz)']) {
      expect(code).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function ${sig} to service_role;`);
    }
    for (const name of ['public.market_list_material(', 'public.market_cancel_listing(', 'public.market_record_payment(', 'arena_private.market_release_stale(', 'arena_private.material_deliver(']) {
      expect(fn(name), name).toContain('security definer');
      expect(fn(name), name).toContain("set search_path = ''");
    }
  });
  it('the League reset cancels the open lots of the replaced heroes (a reserved lot is left alone)', () => {
    const f = fn('arena_private.item_certificates_league_reset()');
    expect(f).toContain("l.material_id is not null and l.status = 'open' and l.created_at < new.reset_at");
  });
  it('the test plan covers lots', () => {
    for (const letter of 'IJKLMN') expect(raw).toContain(`-- ${letter}. `);
  });
});
