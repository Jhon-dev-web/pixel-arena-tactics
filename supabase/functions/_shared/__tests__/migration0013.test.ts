import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKET_ABSOLUTE_MAX_PRICE_LAMPORTS, MARKET_FEE_PERCENT, MARKET_MAX_PRICE_LAMPORTS, MARKET_MIN_PRICE_LAMPORTS, SOL_PRICE_STEP_LAMPORTS, splitLamports } from '../chain/solMoney.ts';
import { decodeBase58, encodeBase58, isSolAddress } from '../chain/base58.ts';
import { MARKET_RULES } from '../market/rules.ts';

// Migration 0013 (the market and the Pass move to Solana) is SQL that was never run from this repo: these tests read the file and pin what it must guarantee. The SQL TEST PLAN at the end of the
// file is what proves it against a real database.

const root = resolve(__dirname, '../../../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const stripComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

const raw = read('supabase/migrations/0013_solana.sql');
const m = stripComments(raw);

function body(name: string): string {
  const start = m.indexOf(`create or replace function ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return m.slice(start, m.indexOf('$$;', m.indexOf('as $$', start)) + 3);
}

// base58 for Solana: 32..44 characters for a public key, 64..90 for a signature (88 is the usual one)
const ADDRESS_RE = new RegExp('^[1-9A-HJ-NP-Za-km-z]{32,44}$');
const SIGNATURE_RE = new RegExp('^[1-9A-HJ-NP-Za-km-z]{64,90}$');

describe('0013: it only runs over an empty market, and says so', () => {
  it('refuses to run when any market table holds a row (the old rows hold 0x addresses and cent prices)', () => {
    const guard = m.slice(0, m.indexOf('drop view if exists public.market_listings_public;'));
    for (const t of ['market_wallets', 'market_listings', 'market_reservations', 'chain_payments', 'market_sales']) expect(guard, t).toContain(`exists (select 1 from public.${t})`);
    expect(guard).toContain('MIGRATION_0013_NEEDS_EMPTY_MARKET_TABLES');
  });

  it('is documented: what it does, not applied, a rollback, and a SQL test plan A to J', () => {
    expect(raw).toContain('NOT APPLIED');
    expect(raw).toContain('ROLLBACK');
    expect(raw).toContain('SQL TEST PLAN');
    for (const letter of 'ABCDEFGHIJ') expect(raw).toContain(`-- ${letter}. `);
    for (const drop of ['drop function if exists public.market_record_payment(uuid, uuid, text, text, text, numeric, bigint, timestamptz);', 'drop function if exists public.market_list(uuid, uuid, bigint, integer, integer, integer, bigint, bigint);']) expect(raw).toContain(drop);
  });
});

describe('0013: Solana addresses, signatures and lamports', () => {
  it('addresses are base58 public keys everywhere: wallets, seller address on a listing, the function arguments', () => {
    expect(m).toContain("add constraint market_wallets_address_check check (address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')");
    expect(m).toContain("add constraint market_listings_address_check check (seller_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')");
    expect(body('public.market_wallet_set(')).toContain("p_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'");
    // the regex accepts a real address and a real signature and refuses a 0x one
    expect(ADDRESS_RE.test(encodeBase58(new Uint8Array(32).fill(7)))).toBe(true);
    expect(ADDRESS_RE.test(`0x${'a'.repeat(40)}`)).toBe(false);
    expect(SIGNATURE_RE.test(encodeBase58(new Uint8Array(64).fill(200)))).toBe(true);
    expect(SIGNATURE_RE.test(encodeBase58(new Uint8Array(32).fill(200)))).toBe(false);
    // any 32 byte key encodes within 32..44 characters and any 64 byte signature within 64..90 (so the regexes never refuse a real one)
    for (const fill of [0, 1, 57, 128, 255]) {
      expect(ADDRESS_RE.test(encodeBase58(new Uint8Array(32).fill(fill))), String(fill)).toBe(true);
      expect(SIGNATURE_RE.test(encodeBase58(new Uint8Array(64).fill(fill))), String(fill)).toBe(true);
    }
    expect(isSolAddress(encodeBase58(decodeBase58('11111111111111111111111111111112') as Uint8Array))).toBe(true);
  });

  it('a transaction SIGNATURE is the primary key of chain_payments, consumed once EVER', () => {
    expect(m).toContain("add constraint chain_payments_hash_check check (tx_hash ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$')");
    expect(m).toContain("add constraint chain_payments_leg_check check (leg in ('seller', 'fee', 'sale', 'extra', 'pass'))");
    expect(m).toMatch(/create unique index if not exists chain_payments_one_leg_per_reservation on public\.chain_payments \(reservation_id, leg\) where reservation_id is not null and leg in \('seller', 'fee', 'sale'\);/);
    expect(read('supabase/migrations/0011_market.sql')).toMatch(/create table if not exists public\.chain_payments \(\s*tx_hash text primary key,/);
  });

  it('prices are bigint lamports in whole 0.001 SOL steps, with the same absolute bounds as the TypeScript', () => {
    for (const t of ['market_listings', 'market_reservations', 'market_sales']) {
      expect(m).toContain(`alter table public.${t} rename column price_cents to price_lamports;`);
      expect(m).toContain(`alter table public.${t} alter column price_lamports type bigint;`);
      if (t === 'market_listings') continue; // a listing has only a price; the split lives on the reservation and the sale
      expect(m).toContain(`alter table public.${t} alter column fee_lamports type bigint;`);
      expect(m).toContain(`alter table public.${t} alter column seller_lamports type bigint;`);
    }
    expect(m).toContain(`check (price_lamports between ${MARKET_MIN_PRICE_LAMPORTS} and ${MARKET_ABSOLUTE_MAX_PRICE_LAMPORTS} and price_lamports % ${SOL_PRICE_STEP_LAMPORTS} = 0)`);
    expect(MARKET_MAX_PRICE_LAMPORTS).toBeLessThanOrEqual(MARKET_ABSOLUTE_MAX_PRICE_LAMPORTS); // the tunable cap fits inside the table's bound
    expect(m).toContain('check (fee_lamports + seller_lamports = price_lamports and fee_lamports > 0 and seller_lamports > 0)');
    expect(m).toContain('check (fee_lamports + seller_lamports = price_lamports);');
    expect(m.replace(/rename column \w+ to \w+;/g, '')).not.toMatch(/price_cents|fee_cents|seller_cents/); // only the renames name the old columns
  });

  it('the fee formula in SQL is the TypeScript split, for every price step in range (rounded UP to the lamport)', () => {
    expect(m).toContain('v_fee := (v_listing.price_lamports * p_fee_percent + 99) / 100;');
    expect(MARKET_RULES.feePercent).toBe(MARKET_FEE_PERCENT);
    for (let lamports = MARKET_MIN_PRICE_LAMPORTS; lamports <= MARKET_MAX_PRICE_LAMPORTS; lamports += 7 * SOL_PRICE_STEP_LAMPORTS + (lamports % 3) * SOL_PRICE_STEP_LAMPORTS) {
      const price = Math.round(lamports / SOL_PRICE_STEP_LAMPORTS) * SOL_PRICE_STEP_LAMPORTS;
      const sqlFee = Math.floor((price * MARKET_RULES.feePercent + 99) / 100); // integer division of a positive number
      expect(sqlFee).toBe(splitLamports(price).feeLamports);
    }
  });

  it('the market sales ledger keeps ONE signature per sale (not two hashes)', () => {
    expect(m).toContain('alter table public.market_sales drop column if exists seller_tx_hash;');
    expect(m).toContain('alter table public.market_sales drop column if exists fee_tx_hash;');
    expect(m).toContain('alter table public.market_sales add column if not exists tx_signature text not null;');
    expect(m).toContain("add constraint market_sales_signature_check check (tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$')");
  });
});

describe('0013: the privileges of 0011 are kept', () => {
  it('the public view is recreated with the price in lamports and STILL shows no address, seller, certificate id or hash', () => {
    const start = m.indexOf('create or replace view public.market_listings_public');
    const view = m.slice(start, m.indexOf(';', start));
    const columns = view.slice(view.indexOf('select'), view.indexOf('from public.market_listings'));
    for (const forbidden of ['address', 'seller_id', 'buyer', 'certificate_id', 'user_id', 'tx_hash', 'tx_signature', 'wallet']) expect(columns, forbidden).not.toContain(forbidden);
    for (const wanted of ['l.id', 'c.kind', 'c.template_id', 'c.rarity', 'c.substats', 'c.gold_amount', 'l.price_lamports', 'l.status', 'l.expires_at']) expect(view, wanted).toContain(wanted);
    expect(view).toContain("l.status in ('open', 'reserved')");
    expect(view).toContain('l.expires_at > pg_catalog.now()');
    expect(m).toContain('revoke all on table public.market_listings_public from public, anon, authenticated;');
    expect(m).toContain('grant select on table public.market_listings_public to anon, authenticated, service_role;');
  });

  it("the owner's ledger is recreated in the private schema, in SOL and lamports, readable by the service role only", () => {
    expect(m).toContain('create or replace view arena_private.market_sales_ledger');
    for (const col of ['price_sol', 'fee_sol', 'seller_sol', 's.price_lamports', 's.fee_lamports', 's.tx_signature']) expect(m, col).toContain(col);
    expect(m).toContain('revoke all on table arena_private.market_sales_ledger from public, anon, authenticated;');
    expect(m).toContain('grant select on table arena_private.market_sales_ledger to service_role;');
  });

  it('every function it defines is security definer with an empty search_path and callable by the service role only', () => {
    const fns: [string, string][] = [
      ['public.market_wallet_set(', 'uuid, text, integer'],
      ['public.market_list(', 'uuid, uuid, bigint, integer, integer, integer, bigint, bigint'],
      ['public.market_reserve(', 'uuid, uuid, text, integer, boolean, integer, integer, integer, integer, integer'],
      ['public.market_record_payment(', 'uuid, uuid, text, text, text, numeric, bigint, timestamptz'],
      ['public.pass_crypto_grant(', 'uuid, text, text, text, numeric, numeric, bigint, timestamptz, integer, boolean'],
    ];
    for (const [name, args] of fns) {
      const f = body(name);
      expect(f, name).toContain('security definer');
      expect(f, name).toContain("set search_path = ''");
      expect(m, name).toContain(`revoke all on function ${name}${args}) from public, anon, authenticated;`);
      expect(m, name).toContain(`grant execute on function ${name}${args}) to service_role;`);
    }
    expect(m).not.toMatch(/grant execute on function [^;]* to (?:anon|authenticated|public);/);
    expect(m).not.toMatch(/create policy/);
  });

  it('the functions whose argument TYPES changed drop the old overload first (two overloads would make the API call ambiguous)', () => {
    expect(m.indexOf('drop function if exists public.market_list(uuid, uuid, integer, integer, integer, integer, integer, integer);')).toBeGreaterThan(-1);
    expect(m.indexOf('drop function if exists public.market_list(uuid, uuid, integer, integer, integer, integer, integer, integer);')).toBeLessThan(m.indexOf('create or replace function public.market_list('));
    expect(m.indexOf('drop function if exists public.market_record_payment(uuid, uuid, text, text, text, text, numeric, bigint, timestamptz);')).toBeLessThan(m.indexOf('create or replace function public.market_record_payment('));
  });
});

describe('0013: every change of state is still one locked function, and ONE payment sells', () => {
  it('listing: the lock of item_commit, the certificate row lock, every refusal before any write, the price rule', () => {
    const f = body('public.market_list(');
    expect(f).toContain("hashtextextended('item_commit:' || p_user_id::text, 0)");
    expect(f).toContain('where c.id = p_certificate_id and c.user_id = p_user_id for update');
    for (const reason of ['no_wallet', 'flagged', 'price', 'not_found', 'already_listed', 'not_held', 'bound', 'not_in_save', 'limit_active', 'limit_day']) expect(f, reason).toContain(`'reason', '${reason}'`);
    expect(f).toContain('p_price_lamports < p_min_lamports or p_price_lamports > p_max_lamports or p_price_lamports % 1000000 <> 0');
    expect(f.indexOf("'reason', 'limit_day'")).toBeLessThan(f.indexOf("set status = 'listed', in_save = false"));
    expect(f.indexOf("'reason', 'bound'")).toBeLessThan(f.indexOf('insert into public.market_listings'));
  });

  it('reserving: the buyer lock, then the listing row lock, one at a time, the seller cannot buy his own', () => {
    const f = body('public.market_reserve(');
    expect(f).toContain("hashtextextended('market_buyer:' || p_buyer_id::text, 0)");
    expect(f).toContain('from public.market_listings as l where l.id = p_listing_id for update');
    expect(f).toContain('arena_private.market_release_stale(p_listing_id)');
    for (const reason of ['reservation_exists', 'no_wallet', 'rate_limited', 'not_found', 'reserved', 'not_open', 'own_listing']) expect(f, reason).toContain(`'reason', '${reason}'`);
    expect(f).toContain('v_listing.seller_id = p_buyer_id or v_listing.seller_address = v_buyer_address');
    expect(f).toContain('insert into public.market_reservations (listing_id, buyer_id, buyer_address, seller_address, fee_address, price_lamports, fee_lamports, seller_lamports, chain_id, livemode, expires_at, grace_until)');
  });

  it('recording a payment: lock order, mismatch check, the SIGNATURE consumed first, then the sale (no "both legs" any more)', () => {
    const f = body('public.market_record_payment(');
    const order = [
      'from public.market_listings as l where l.id = v_res.listing_id for update',
      'from public.market_reservations as r where r.id = p_reservation_id for update',
      "raise exception using errcode = '22023', message = 'MARKET_PAYMENT_MISMATCH'",
      'insert into public.chain_payments',
      'on conflict (tx_hash) do nothing',
      "'late_payment_accepted'",
      "set status = 'transferred'",
      'insert into public.market_sales',
      "set status = 'sold'",
      "set status = 'paid'",
    ].map((s) => f.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(f).toContain('p_from <> v_res.buyer_address or p_to <> v_res.seller_address or p_amount_units < v_res.price_lamports::numeric');
    expect(f).toContain("v_leg text := 'sale'");
    expect(f).toContain("p.leg = 'sale'");
    expect(f).not.toContain('v_seller_paid');
    expect(f).not.toContain('v_fee_paid');
    expect(f).toContain("'status', 'tx_reused'");
    expect(f).toContain("'status', 'replayed'");
    expect(f).toContain("'held', false, v_cert.content_hash, 'market:' || v_sale_id::text, 0, false, v_cert.id");
    expect(f).toContain('v_res.price_lamports, v_res.fee_lamports, v_res.seller_lamports, p_tx_hash');
    expect(f).toContain('v_now <= v_res.grace_until');
    expect(f).toContain("(v_listing.status = 'open' or (v_listing.status = 'reserved' and v_res.status = 'pending'))");
    expect(f).toMatch(/if v_res\.status = 'pending' then\s+update public\.market_listings as l set status = 'open'/);
  });
});

describe('0013: the Pass in USDC on Solana', () => {
  it('the source check allows crypto_sol, keeps the others (crypto_bsc stays for history)', () => {
    expect(m).toContain("check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant'))");
  });

  it('the goal and the public meter count crypto_sol, livemode only, like stripe; a failing ranking never blocks a payment', () => {
    const count = body('arena_private.paid_pass_count(');
    expect(count).toContain("e.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol') and e.livemode");
    expect(count).toContain("e.status = 'active'");
    const trg = body('arena_private.entitlements_goal_trigger(');
    expect(trg).toContain("new.status = 'active' and new.livemode and new.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol')");
    expect(trg).toContain('exception when others then');
  });

  it('grant is one locked transaction: the signature first, then the entitlement; a second Pass becomes a refund due; the livemode comes from the cluster', () => {
    const f = body('public.pass_crypto_grant(');
    expect(f).toContain("hashtextextended('pass_crypto:'");
    const order = ['PASS_CRYPTO_MISMATCH', 'insert into public.chain_payments', 'on conflict (tx_hash) do nothing', 'insert into public.entitlements', "'crypto_sol'"].map((s) => f.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(f).toContain("set status = 'refund_due'");
    expect(f).toContain("'tx_reused'");
    expect(f).toContain('p_block_time < v_intent');
    expect(f).toContain("values (p_user_id, 'adventurer_pass', 'crypto_sol', p_tx_hash, 'active', p_livemode)");
    expect(f).toContain("p_tx_hash !~ '^[1-9A-HJ-NP-Za-km-z]{64,90}$' or p_from !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' or p_to !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'");
  });
});
