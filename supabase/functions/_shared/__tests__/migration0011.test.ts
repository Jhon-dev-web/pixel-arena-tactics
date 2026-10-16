import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKET_MAX_PRICE_CENTS, MARKET_MIN_PRICE_CENTS, splitPrice, MARKET_FEE_PERCENT } from '../chain/money.ts';
import { MARKET_RULES } from '../market/rules.ts';

// Migrations 0011 (the market) and 0012 (the USDT Pass) are SQL that was never run from this repo: these tests read the files and pin the guarantees (no client can write or even read the market tables,
// the public view shows no wallet address, a transaction hash is consumed once, one pending reservation per buyer and per listing, every state change is one locked function, the TypeScript calls
// the SQL with exactly the arguments it declares). The SQL TEST PLAN at the end of each file is what proves it against a real database.

const root = resolve(__dirname, '../../../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const stripComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

const raw11 = read('supabase/migrations/0011_market.sql');
const m11 = stripComments(raw11);
const raw12 = read('supabase/migrations/0012_pass_crypto.sql');
const m12 = stripComments(raw12);
const m10 = stripComments(read('supabase/migrations/0010_item_certificates.sql'));
const marketDb = read('supabase/functions/_shared/market/marketDb.ts');

function body(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start)) + 3);
}

const TABLES = ['market_wallets', 'market_wallet_history', 'market_wallet_nonces', 'market_listings', 'market_reservations', 'chain_payments', 'market_sales', 'market_events'];
const PUBLIC_FUNCTIONS = [
  ['market_wallet_nonce', 'uuid, text, integer, integer, integer'],
  ['market_wallet_take_nonce', 'uuid, text'],
  ['market_wallet_set', 'uuid, text, integer'],
  ['market_list', 'uuid, uuid, integer, integer, integer, integer, integer, integer'],
  ['market_cancel_listing', 'uuid, uuid'],
  ['market_reserve', 'uuid, uuid, text, integer, boolean, integer, integer, integer, integer, integer'],
  ['market_cancel_reservation', 'uuid, uuid'],
  ['market_record_payment', 'uuid, uuid, text, text, text, text, numeric, bigint, timestamptz'],
  ['market_deliver_ack', 'uuid, uuid[]'],
  ['market_expire_due', 'integer'],
] as const;

describe('0011: no client can read or write the market tables', () => {
  it('row level security is on for every table, with NO policy at all', () => {
    for (const t of TABLES) expect(m11).toContain(`alter table public.${t} enable row level security;`);
    expect(m11).not.toMatch(/create policy/);
  });

  it('every table is revoked from public, anon and authenticated, and granted to the service role only', () => {
    for (const t of TABLES) {
      expect(m11).toContain(`revoke all on table public.${t} from public, anon, authenticated;`);
      expect(m11).toMatch(new RegExp(`grant [a-z, ]+ on table public\\.${t} to service_role;`));
    }
    const grants = m11.match(/grant [a-z, ]+ on (?:table |function )?[a-z_.]+(?:\([^)]*\))? to [a-z_, ]+;/g) ?? [];
    for (const g of grants) {
      if (/to (?:anon|authenticated|public)/.test(g)) expect(g, g).toBe('grant select on table public.market_listings_public to anon, authenticated, service_role;');
    }
    expect(m11).not.toMatch(/grant (?:insert|update|delete|all)[a-z, ]* on [a-z_.\s]+ to (?:anon|authenticated|public)/);
  });

  it('the only door for a client is the public view, and it has NO address, no seller, no certificate id', () => {
    const start = m11.indexOf('create or replace view public.market_listings_public');
    const view = m11.slice(start, m11.indexOf(';', start));
    expect(view.length).toBeGreaterThan(50);
    const columns = view.slice(view.indexOf('select'), view.indexOf('from public.market_listings')); // what the view EXPOSES (the join may use certificate_id)
    for (const forbidden of ['address', 'seller_id', 'buyer', 'certificate_id', 'user_id', 'tx_hash', 'wallet']) expect(columns, forbidden).not.toContain(forbidden);
    for (const wanted of ['l.id', 'c.kind', 'c.template_id', 'c.rarity', 'c.substats', 'c.gold_amount', 'l.price_cents', 'l.status', 'l.expires_at']) expect(view, wanted).toContain(wanted);
    expect(view).toContain("l.status in ('open', 'reserved')");
    expect(view).toContain('l.expires_at > pg_catalog.now()');
    expect(m11).toContain('revoke all on table public.market_listings_public from public, anon, authenticated;');
    expect(m11).toContain('grant select on table public.market_listings_public to anon, authenticated, service_role;');
  });

  it('the owner\'s ledger lives in the private schema and only the service role reads it', () => {
    expect(m11).toContain('create or replace view arena_private.market_sales_ledger');
    expect(m11).toContain('revoke all on table arena_private.market_sales_ledger from public, anon, authenticated;');
    expect(m11).toContain('grant select on table arena_private.market_sales_ledger to service_role;');
  });

  it('every function is security definer with an empty search_path and callable by the service role only', () => {
    for (const [name, args] of PUBLIC_FUNCTIONS) {
      const f = body(m11, `public.${name}(`);
      expect(f, name).toContain('security definer');
      expect(f, name).toContain("set search_path = ''");
      expect(m11, name).toContain(`revoke all on function public.${name}(${args}) from public, anon, authenticated;`);
      expect(m11, name).toContain(`grant execute on function public.${name}(${args}) to service_role;`);
    }
    for (const priv of ['arena_private.market_log(', 'arena_private.market_release_stale(', 'arena_private.market_events_no_change(']) {
      const f = body(m11, priv);
      expect(f).toContain('security definer');
      expect(f).toContain("set search_path = ''");
    }
    expect(m11).not.toMatch(/grant execute on function [^;]* to (?:anon|authenticated|public);/);
  });

  it('the audit log is append-only', () => {
    expect(m11).toMatch(/before update or delete on public\.market_events/);
    expect(body(m11, 'arena_private.market_events_no_change(')).toContain('MARKET_EVENTS_APPEND_ONLY');
  });
});

describe('0011: money and identity constraints', () => {
  it('a transaction hash is consumed once EVER: it is the primary key of chain_payments', () => {
    expect(m11).toMatch(/create table if not exists public\.chain_payments \(\s*tx_hash text primary key,/);
    expect(m11).toContain("constraint chain_payments_hash_check check (tx_hash ~ '^0x[0-9a-f]{64}$')");
    expect(m11).toContain('amount_units numeric(40, 0) not null');
  });

  it('one counted payment per leg of a reservation, one pending reservation per buyer and per listing, one live listing per certificate, one address per account', () => {
    expect(m11).toMatch(/create unique index if not exists chain_payments_one_leg_per_reservation on public\.chain_payments \(reservation_id, leg\) where reservation_id is not null and leg in \('seller', 'fee'\);/);
    expect(m11).toMatch(/market_reservations_one_pending_per_buyer on public\.market_reservations \(buyer_id\) where status = 'pending';/);
    expect(m11).toMatch(/market_reservations_one_pending_per_listing on public\.market_reservations \(listing_id\) where status = 'pending';/);
    expect(m11).toMatch(/market_listings_one_live_per_certificate on public\.market_listings \(certificate_id\) where status in \('open', 'reserved'\);/);
    expect(m11).toContain('constraint market_wallets_address_unique unique (address)');
    expect(m11).toMatch(/user_id uuid primary key references auth\.users \(id\) on delete cascade,\s*address text not null/);
    expect(m11).toContain('reservation_id uuid not null unique');
  });

  it('the statuses are the specified ones, the split always sums, the address is a lowercase 20 byte hex', () => {
    expect(m11).toContain("check (status in ('open', 'reserved', 'sold', 'cancelled', 'expired'))");
    expect(m11).toContain("check (status in ('pending', 'paid', 'expired', 'cancelled', 'refund_due', 'refunded'))");
    expect(m11).toContain('check (fee_cents + seller_cents = price_cents and fee_cents > 0 and seller_cents > 0)');
    expect(m11).toContain("check (seller_address ~ '^0x[0-9a-f]{40}$')");
    expect(m11).toContain("check (address ~ '^0x[0-9a-f]{40}$')");
  });

  it('the price bounds of the table are the TypeScript ones', () => {
    expect(m11).toContain(`check (price_cents between ${MARKET_MIN_PRICE_CENTS} and ${MARKET_MAX_PRICE_CENTS})`);
  });

  it('the fee formula in SQL is the TypeScript split, for every price in range', () => {
    expect(m11).toContain('v_fee := (v_listing.price_cents * p_fee_percent + 99) / 100;');
    expect(MARKET_RULES.feePercent).toBe(MARKET_FEE_PERCENT);
    for (let cents = MARKET_MIN_PRICE_CENTS; cents <= MARKET_MAX_PRICE_CENTS; cents += cents < 5000 ? 1 : 101) {
      const sqlFee = Math.floor((cents * MARKET_RULES.feePercent + 99) / 100); // integer division of a positive number
      expect(sqlFee).toBe(splitPrice(cents).feeCents);
    }
  });

  it('payments and sales keep plain uuids (no cascade from auth.users): the financial trail outlives an account', () => {
    const sales = m11.slice(m11.indexOf('create table if not exists public.market_sales'), m11.indexOf('create index if not exists market_sales_seller_idx'));
    expect(sales).not.toContain('references auth.users');
    const payments = m11.slice(m11.indexOf('create table if not exists public.chain_payments'), m11.indexOf('create unique index if not exists chain_payments_one_leg'));
    expect(payments).not.toContain('references auth.users');
    const reservations = m11.slice(m11.indexOf('create table if not exists public.market_reservations'), m11.indexOf('create unique index if not exists market_reservations_one_pending_per_buyer'));
    expect(reservations).not.toContain('references auth.users');
  });
});

describe('0011: every change of state is one locked function', () => {
  it('listing takes the SAME per-user lock as bind / burn (item_commit) and the certificate row lock, and checks everything before it changes anything', () => {
    const f = body(m11, 'public.market_list(');
    expect(f).toContain("hashtextextended('item_commit:' || p_user_id::text, 0)");
    expect(m10).toContain("hashtextextended('item_commit:' || p_user_id::text, 0)");
    expect(f).toContain('where c.id = p_certificate_id and c.user_id = p_user_id for update');
    for (const reason of ['no_wallet', 'flagged', 'price', 'not_found', 'already_listed', 'not_held', 'bound', 'not_in_save', 'limit_active', 'limit_day']) expect(f, reason).toContain(`'reason', '${reason}'`);
    expect(f).toContain('arena_private.has_item_flags(p_user_id)');
    // the writes come after every refusal
    expect(f.indexOf("'reason', 'limit_day'")).toBeLessThan(f.indexOf("set status = 'listed', in_save = false"));
    expect(f.indexOf("'reason', 'bound'")).toBeLessThan(f.indexOf('insert into public.market_listings'));
    expect(f).toContain("'list'"); // the certificate event
  });

  it('reserving: the buyer lock, then the listing row lock, stale reservations released, one at a time, rate limited, the seller cannot buy his own', () => {
    const f = body(m11, 'public.market_reserve(');
    expect(f).toContain("hashtextextended('market_buyer:' || p_buyer_id::text, 0)");
    expect(f).toContain('from public.market_listings as l where l.id = p_listing_id for update');
    expect(f).toContain('arena_private.market_release_stale(p_listing_id)');
    for (const reason of ['reservation_exists', 'no_wallet', 'rate_limited', 'not_found', 'reserved', 'not_open', 'own_listing']) expect(f, reason).toContain(`'reason', '${reason}'`);
    expect(f).toContain('v_listing.seller_id = p_buyer_id or v_listing.seller_address = v_buyer_address');
    expect(f.indexOf("'reason', 'own_listing'")).toBeLessThan(f.indexOf('insert into public.market_reservations'));
    expect(f).toContain("update public.market_listings as l set status = 'reserved'");
    // the address and amounts the buyer is shown are the ones stored (and later verified against)
    expect(f).toContain('insert into public.market_reservations (listing_id, buyer_id, buyer_address, seller_address, fee_address, price_cents, fee_cents, seller_cents, chain_id, livemode, expires_at, grace_until)');
  });

  it('recording a payment locks the listing then the reservation (the same order as reserve / cancel), consumes the hash FIRST, and sells only when both legs are applied', () => {
    const f = body(m11, 'public.market_record_payment(');
    const order = [
      'from public.market_listings as l where l.id = v_res.listing_id for update',
      'from public.market_reservations as r where r.id = p_reservation_id for update',
      'raise exception using errcode = \'22023\', message = \'MARKET_PAYMENT_MISMATCH\'',
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
    expect(f).toContain("'status', 'tx_reused'");
    expect(f).toContain("'status', 'replayed'");
    expect(f).toContain("v_leg := 'extra'");
    expect(f).toContain('if not (v_seller_paid and v_fee_paid) then');
    // the sale copies the certificate for the buyer: held, out of the save, with its origin, and the old one ends
    expect(f).toContain("'held', false, v_cert.content_hash, 'market:' || v_sale_id::text, 0, false, v_cert.id");
    // a late payment is delivered only inside the grace, when the listing is free for him, and he holds no other reservation
    expect(f).toContain('v_now <= v_res.grace_until');
    expect(f).toContain("(v_listing.status = 'open' or (v_listing.status = 'reserved' and v_res.status = 'pending'))");
    expect(f).toContain("r.buyer_id = p_buyer_id and r.status = 'pending' and r.id <> v_res.id");
    // the listing is reopened by a failed late payment ONLY when this very reservation held it
    expect(f).toMatch(/if v_res\.status = 'pending' then\s+update public\.market_listings as l set status = 'open'/);
  });

  it('cancelling a listing is refused while it is reserved; a reservation with a payment cannot be cancelled', () => {
    const c = body(m11, 'public.market_cancel_listing(');
    expect(c).toContain("hashtextextended('item_commit:'");
    expect(c).toContain("'status', 'reserved'");
    expect(c.indexOf("'status', 'reserved'")).toBeLessThan(c.indexOf("set status = 'cancelled'"));
    const r = body(m11, 'public.market_cancel_reservation(');
    expect(r).toContain("'status', 'has_payment'");
  });

  it('stale reservations and listings are released by ONE helper that expects the listing lock', () => {
    const f = body(m11, 'arena_private.market_release_stale(');
    expect(f).toContain("set status = 'expired'");
    expect(f).toContain("set status = 'refund_due'");
    expect(f).toContain('v_res.grace_until <= pg_catalog.now()');
    expect(f).toContain("set status = 'held' where c.id = v_listing.certificate_id and c.status = 'listed'");
    const sweep = body(m11, 'public.market_expire_due(');
    expect(sweep).toContain('skip locked');
  });

  it('the wallet is proved first: nonces are rate limited and consumed in one statement; changing it is refused while money or an item is in flight', () => {
    const take = body(m11, 'public.market_wallet_take_nonce(');
    expect(take).toMatch(/update public\.market_wallet_nonces as n\s+set used_at = pg_catalog\.now\(\)\s+where n\.user_id = p_user_id and n\.nonce = p_nonce and n\.used_at is null and n\.expires_at > pg_catalog\.now\(\)/);
    const set = body(m11, 'public.market_wallet_set(');
    expect(set).toContain("'status', 'busy'");
    expect(set).toContain("'status', 'address_taken'");
    expect(set).toContain('insert into public.market_wallet_history');
    expect(body(m11, 'public.market_wallet_nonce(')).toContain("'status', 'rate_limited'");
  });

  it('delivery is an ack on the owner\'s held, out-of-save certificates only', () => {
    const f = body(m11, 'public.market_deliver_ack(');
    expect(f).toContain('c.user_id = p_user_id and c.status = \'held\' and not c.in_save');
    expect(f).toContain("hashtextextended('item_commit:'");
  });
});

describe('0011: the certificates keep their guarantees', () => {
  it('the guard also freezes origin_certificate_id, and keeps every other rule of 0010', () => {
    const g = body(m11, 'arena_private.item_certificates_guard(');
    expect(g).toContain('new.origin_certificate_id is distinct from old.origin_certificate_id');
    const old = body(m10, 'arena_private.item_certificates_guard(');
    for (const msg of ['ITEM_CERTIFICATE_CONTENT_IS_IMMUTABLE', 'ITEM_CERTIFICATE_BIND_IS_IRREVERSIBLE', 'ITEM_CERTIFICATE_IS_FINISHED', 'ITEM_CERTIFICATE_BOUND_CANNOT_BE_LISTED']) {
      expect(g).toContain(msg);
      expect(old).toContain(msg);
    }
    expect(g).toContain('new.user_id is distinct from old.user_id'); // a certificate belongs to ONE account for life: a sale issues a new one
  });

  it('item_commit keeps its exact signature (it REPLACES the 0010 one) and its daily cap no longer counts what was bought', () => {
    const sig = (sql: string) => /create or replace function public\.item_commit\(([\s\S]*?)\)\s*returns jsonb/.exec(sql)?.[1].replace(/\s+/g, ' ').trim();
    expect(sig(m11)).toBe(sig(m10));
    const f = body(m11, 'public.item_commit(');
    expect(f).toContain('and c.origin_certificate_id is null');
    expect(f).toContain("hashtextextended('item_commit:'");
    expect(read('supabase/functions/_shared/items/itemDb.ts')).toContain("origin_certificate_id: 'is.null'");
  });

  it('the League reset also pulls open listings down, and leaves a reserved one alone', () => {
    const f = body(m11, 'arena_private.item_certificates_league_reset(');
    expect(f).toContain("set status = 'cancelled'");
    expect(f).toContain("l.status = 'open'");
    expect(f).toContain("l.status = 'reserved'");
  });

  it('the event check allows the new events', () => {
    expect(m11).toContain("check (event in ('mint', 'bind', 'list', 'unlist', 'transfer', 'burn', 'revoke', 'deliver'))");
  });
});

describe('0011: the TypeScript calls the SQL with exactly the arguments it declares', () => {
  const sqlParams = (src: string, name: string): string[] => {
    const m = new RegExp(`create or replace function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns`).exec(src);
    expect(m, name).not.toBeNull();
    return (m as RegExpExecArray)[1].split(',').map((p) => p.trim().split(/\s+/)[0]).sort();
  };
  const tsParams = (fn: string): string[] => {
    const at = marketDb.indexOf(`'${fn}',`);
    expect(at, fn).toBeGreaterThan(-1);
    const open = marketDb.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (let i = open; i < marketDb.length; i++) {
      if (marketDb[i] === '{') depth++;
      if (marketDb[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    return Array.from(marketDb.slice(open, end + 1).matchAll(/\b(p_[a-z_]+):/g), (m) => m[1]).sort();
  };

  it.each(PUBLIC_FUNCTIONS.map(([n]) => n))('%s', (name) => {
    expect(tsParams(name)).toEqual(sqlParams(m11, name));
  });

  it('the pass functions too', () => {
    expect(tsParams('pass_crypto_start')).toEqual(sqlParams(m12, 'pass_crypto_start'));
    expect(tsParams('pass_crypto_grant')).toEqual(sqlParams(m12, 'pass_crypto_grant'));
  });

  it('the rules the SQL receives as arguments are the TypeScript rules, and the SQL has no copy of them', () => {
    for (const k of ['listingTtlDays', 'maxActiveListings', 'maxListingsPerDay', 'minPriceCents', 'maxPriceCents', 'reservationTtlMinutes', 'graceMinutes', 'reserveRateMax', 'reserveRateWindowSeconds', 'nonceTtlSeconds', 'nonceMax', 'nonceWindowSeconds', 'feePercent', 'passIntentTtlHours']) {
      expect(marketDb, k).toContain(`MARKET_RULES.${k}`);
    }
    expect(MARKET_RULES.reservationTtlMinutes).toBe(30);
    expect(MARKET_RULES.feePercent).toBe(5);
    expect(m11).not.toMatch(/interval '30 minutes'|interval '120 minutes'/);
  });
});

describe('0011: documented', () => {
  it('has a rollback that names everything it creates, and a SQL test plan', () => {
    for (const t of TABLES) expect(raw11).toContain(`drop table if exists public.${t};`);
    for (const [name] of PUBLIC_FUNCTIONS) expect(raw11).toContain(`drop function if exists public.${name}(`);
    expect(raw11).toContain('drop view if exists public.market_listings_public;');
    expect(raw11).toContain('NOT APPLIED');
    expect(raw11).toContain('SQL TEST PLAN');
    for (const letter of 'ABCDEFGHIJKL') expect(raw11).toContain(`-- ${letter}. `);
  });
});

describe('0012: the USDT Pass', () => {
  it('the source check allows crypto_bsc and keeps the others', () => {
    expect(m12).toContain("check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'grant'))");
  });

  it('the goal and the public meter count crypto_bsc, livemode only, like stripe', () => {
    const count = body(m12, 'arena_private.paid_pass_count(');
    expect(count).toContain("e.source in ('stripe', 'mercadopago', 'crypto_bsc') and e.livemode");
    expect(count).toContain("e.status = 'active'");
    const trg = body(m12, 'arena_private.entitlements_goal_trigger(');
    expect(trg).toContain("new.status = 'active' and new.livemode and new.source in ('stripe', 'mercadopago', 'crypto_bsc')");
    expect(trg).toContain('exception when others then'); // never block a payment because of the ranking
  });

  it('the intents are private; start and grant are service-role-only security definer functions', () => {
    expect(m12).toContain('alter table public.pass_crypto_intents enable row level security;');
    expect(m12).toContain('revoke all on table public.pass_crypto_intents from public, anon, authenticated;');
    for (const sig of ['public.pass_crypto_start(uuid, integer)', 'public.pass_crypto_grant(uuid, text, text, text, numeric, numeric, bigint, timestamptz, integer, boolean)']) {
      expect(m12).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      expect(m12).toContain(`grant execute on function ${sig} to service_role;`);
    }
    expect(m12).not.toMatch(/grant [^;]* to (?:anon|authenticated|public);/);
  });

  it('grant is one locked transaction: the hash first, then the entitlement; a second Pass becomes a refund due; the livemode comes from the network', () => {
    const f = body(m12, 'public.pass_crypto_grant(');
    expect(f).toContain("hashtextextended('pass_crypto:'");
    const order = ['PASS_CRYPTO_MISMATCH', 'insert into public.chain_payments', 'on conflict (tx_hash) do nothing', 'insert into public.entitlements', "'crypto_bsc'"].map((s) => f.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(f).toContain("set status = 'refund_due'");
    expect(f).toContain("'tx_reused'");
    expect(f).toContain('p_block_time < v_intent');
    expect(f).toContain("values (p_user_id, 'adventurer_pass', 'crypto_bsc', p_tx_hash, 'active', p_livemode)");
  });

  it('has a rollback and a SQL test plan', () => {
    expect(raw12).toContain('drop function if exists public.pass_crypto_grant(');
    expect(raw12).toContain('NOT APPLIED');
    for (const letter of 'ABCDE') expect(raw12).toContain(`-- ${letter}. `);
  });
});
