import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';
import { ADMIN, ANA, BRUNO, DIEGO, seed } from './seed';

// Migration 0022 (payment references and the queue of unmatched payments) run for real in an in-memory Postgres (PGlite) together with 0001-0021. Nothing here talks to any remote service.
let db: PGlite;

const call = async <T = any>(uid: string | null, role: 'authenticated' | 'anon' | 'service_role' | 'postgres', sql: string, params: unknown[] = []): Promise<T> =>
  as(db, role, uid, async () => {
    const r = await db.query<{ r: T }>(sql, params);
    return r.rows[0].r;
  });
const asService = <T = any>(sql: string, params: unknown[] = []) => call<T>(null, 'service_role', sql, params);
const asAdmin = <T = any>(sql: string, params: unknown[] = []) => call<T>(ADMIN, 'authenticated', sql, params);
const asOwner = <T = any>(sql: string, params: unknown[] = []) => call<T>(null, 'postgres', sql, params);

const SIG = (c: string): string => c.repeat(88);
let WALLET = '';
const PAYER = '11111111111111111111111111111113';
const RECEIVER = '11111111111111111111111111111114';

const record = (signature: string, userId: string | null, over: { purpose?: string; reason?: string; amount?: number } = {}) =>
  asService(`select public.payment_exception_record($1, 502, false, $2, $3, $4, null, $5, $6, $7, 'pa1:pass:abc', now()) as r`, [signature, over.purpose ?? 'pass', over.reason ?? 'no_memo', userId, PAYER, RECEIVER, over.amount ?? 10_000_000]);

beforeAll(async () => {
  db = await createDb();
  await seed(db);
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [ADMIN]);
  WALLET = (await db.query<{ address: string }>('select address from public.market_wallets where user_id = $1', [ANA])).rows[0].address; // the seed linked Ana's wallet
}, 180_000);

describe('the Pass reference', () => {
  test('one stable random reference of 32 hex characters per player, different for each player', async () => {
    const a = await asService<string>(`select public.pass_crypto_ref($1) as r`, [ANA]);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await asService(`select public.pass_crypto_ref($1) as r`, [ANA])).toBe(a);
    expect(await asService(`select public.pass_crypto_ref($1) as r`, [BRUNO])).not.toBe(a);
  });

  test('nobody with an API role can read or call anything of it', async () => {
    await expect(call(ANA, 'authenticated', `select public.pass_crypto_ref($1) as r`, [ANA])).rejects.toThrow(/permission denied/);
    await expect(call(ANA, 'authenticated', 'select count(*)::int as r from public.pass_payment_refs')).rejects.toThrow(/permission denied/);
    await expect(call(null, 'anon', 'select count(*)::int as r from public.payment_exceptions')).rejects.toThrow(/permission denied/);
    await expect(call(ANA, 'authenticated', 'select count(*)::int as r from public.payment_exceptions')).rejects.toThrow(/permission denied/);
  });
});

describe('recording an unmatched payment', () => {
  test('recorded once, "exists" the second time, and a second player claiming it is only noted', async () => {
    expect(await record(SIG('2'), ANA)).toMatchObject({ status: 'recorded' });
    expect(await record(SIG('2'), ANA)).toMatchObject({ status: 'exists' });
    expect(await record(SIG('2'), BRUNO)).toMatchObject({ status: 'exists' });
    const row = await asOwner(`select to_jsonb(x) as r from public.payment_exceptions as x where signature = $1`, [SIG('2')]);
    expect(row).toMatchObject({ user_id: ANA, claimed_by: [BRUNO], status: 'open', reason: 'no_memo', purpose: 'pass', livemode: false });
    expect(await asOwner(`select count(*)::int as r from public.payment_exceptions where signature = $1`, [SIG('2')])).toBe(1);
  });

  test('malformed signatures and addresses are refused; a payment that is already counted is not an exception', async () => {
    await expect(record('short', ANA)).rejects.toThrow(/PAYMENT_EXCEPTION_BAD_ARGUMENT/);
    await expect(asService(`select public.payment_exception_record($1, 502, false, 'pass', 'no_memo', $2, null, 'bad', $3, 1, null, now()) as r`, [SIG('3'), ANA, RECEIVER])).rejects.toThrow(/PAYMENT_EXCEPTION_BAD_ARGUMENT/);
    await asOwner(`insert into public.chain_payments (tx_hash, chain_id, livemode, purpose, leg, user_id, from_address, to_address, amount_units, block_number, block_time) values ($1, 502, false, 'pass', 'pass', $2, $3, $4, 10000000, 1, now()) returning 1 as r`, [SIG('4'), BRUNO, PAYER, RECEIVER]);
    expect(await record(SIG('4'), BRUNO)).toMatchObject({ status: 'applied' });
  });

  test('the reasons are an allow-list', async () => {
    await expect(record(SIG('5'), ANA, { reason: 'because' })).rejects.toThrow(/payment_exceptions_reason_check/);
    await expect(record(SIG('5'), ANA, { amount: 0 })).rejects.toThrow(/payment_exceptions_amount_check/);
  });

  test('closing it by itself (matched after all) works once', async () => {
    await record(SIG('6'), ANA);
    expect(await asService(`select public.payment_exception_close($1) as r`, [SIG('6')])).toBe(true);
    expect(await asService(`select public.payment_exception_close($1) as r`, [SIG('6')])).toBe(false);
  });
});

describe('the owner\'s page', () => {
  test('only an admin reads it; it shows the player\'s username, the wallet linked now (to compare with the payer) and never an e-mail', async () => {
    await expect(call(ANA, 'authenticated', `select public.admin_payment_exceptions() as r`)).rejects.toThrow(/ADMIN_ONLY/);
    await expect(call(null, 'anon', `select public.admin_payment_exceptions() as r`)).rejects.toThrow(/permission denied/);
    const page = await asAdmin(`select public.admin_payment_exceptions('open', 0, 50) as r`);
    expect(page.open).toBeGreaterThanOrEqual(1);
    const row = page.rows.find((x: any) => x.signature === SIG('2'));
    expect(row).toMatchObject({ username: 'AnaSilva', linked_wallet: WALLET, payer_address: PAYER, receiver_address: RECEIVER, amount_units: 10000000, reason: 'no_memo', status: 'open', purpose: 'pass' });
    expect(JSON.stringify(page)).not.toMatch(/@example\.com/);
    await expect(asAdmin(`select public.admin_payment_exceptions('nope') as r`)).rejects.toThrow(/ADMIN_BAD_STATUS/);
  });
});

describe('the two resolutions (run by the owner in the SQL editor)', () => {
  test('nobody on the API can call them', async () => {
    await expect(call(ADMIN, 'authenticated', `select arena_private.payment_exception_grant_pass($1) as r`, [SIG('2')])).rejects.toThrow(/permission denied/);
    await expect(asService(`select arena_private.payment_exception_mark_refunded($1, $2) as r`, [SIG('2'), SIG('9')])).rejects.toThrow(/permission denied/);
  });

  test('grant: an entitlement with source "grant" and the payment signature as its reference; the row closes; it cannot grant twice', async () => {
    await record(SIG('g'), DIEGO); // Diego's Pass was refunded: he has none active
    expect(await asOwner(`select arena_private.payment_exception_grant_pass($1) as r`, [SIG('g')])).toMatchObject({ status: 'granted' });
    const e = await asOwner(`select to_jsonb(e) as r from public.entitlements as e where provider_ref = $1`, [SIG('g')]);
    expect(e).toMatchObject({ user_id: DIEGO, kind: 'adventurer_pass', source: 'grant', status: 'active', livemode: false });
    const row = await asOwner(`select to_jsonb(x) as r from public.payment_exceptions as x where signature = $1`, [SIG('g')]);
    expect(row).toMatchObject({ status: 'granted', resolution_ref: e.id });
    await expect(asOwner(`select arena_private.payment_exception_grant_pass($1) as r`, [SIG('g')])).rejects.toThrow(/PAYMENT_EXCEPTION_NOT_OPEN/);
    // resolved rows are listed under "resolved"
    const resolved = await asAdmin(`select public.admin_payment_exceptions('resolved') as r`);
    expect(resolved.rows.map((x: any) => x.signature)).toContain(SIG('g'));
  });

  test('grant refuses a player who already has the Pass, a market payment and an unknown signature', async () => {
    // Ana already has a Pass (the seed)
    await record(SIG('7'), ANA);
    await expect(asOwner(`select arena_private.payment_exception_grant_pass($1) as r`, [SIG('7')])).rejects.toThrow(/PAYMENT_EXCEPTION_ALREADY_OWNED/);
    await record(SIG('8'), BRUNO, { purpose: 'market', reason: 'short_amount' });
    await expect(asOwner(`select arena_private.payment_exception_grant_pass($1) as r`, [SIG('8')])).rejects.toThrow(/PAYMENT_EXCEPTION_NOT_A_PASS_PAYMENT/);
    await expect(asOwner(`select arena_private.payment_exception_grant_pass($1) as r`, [SIG('z')])).rejects.toThrow(/PAYMENT_EXCEPTION_NOT_FOUND/);
  });

  test('refund: needs a well-formed refund signature, records it, and closes the row once', async () => {
    await expect(asOwner(`select arena_private.payment_exception_mark_refunded($1, 'short') as r`, [SIG('7')])).rejects.toThrow(/PAYMENT_EXCEPTION_BAD_REFUND_SIGNATURE/);
    expect(await asOwner(`select arena_private.payment_exception_mark_refunded($1, $2) as r`, [SIG('7'), SIG('9')])).toMatchObject({ status: 'refunded' });
    expect(await asOwner(`select to_jsonb(x) as r from public.payment_exceptions as x where signature = $1`, [SIG('7')])).toMatchObject({ status: 'refunded', resolution_ref: SIG('9') });
    await expect(asOwner(`select arena_private.payment_exception_mark_refunded($1, $2) as r`, [SIG('7'), SIG('9')])).rejects.toThrow(/PAYMENT_EXCEPTION_NOT_OPEN/);
  });
});

describe('the soft signal: a payment from another wallet of the player', () => {
  test('chain_payment_set_payer notes the wallet that really paid and writes the audit event', async () => {
    await asOwner(`insert into public.chain_payments (tx_hash, chain_id, livemode, purpose, leg, user_id, from_address, to_address, amount_units, block_number, block_time) values ($1, 502, false, 'pass', 'pass', $2, $3, $4, 10000000, 1, now()) returning 1 as r`, [SIG('a'), BRUNO, WALLET, RECEIVER]);
    expect(await asService(`select public.chain_payment_set_payer($1, $2) as r`, [SIG('a'), PAYER])).toBe(true);
    expect(await asOwner(`select to_jsonb(p) as r from public.chain_payments as p where tx_hash = $1`, [SIG('a')])).toMatchObject({ from_address: PAYER });
    expect(await asOwner(`select count(*)::int as r from public.market_events where kind = 'paid_from_other_wallet' and user_id = $1`, [BRUNO])).toBe(1);
    expect(await asService(`select public.chain_payment_set_payer($1, $2) as r`, [SIG('b'), PAYER])).toBe(false);
    await expect(call(ANA, 'authenticated', `select public.chain_payment_set_payer($1, $2) as r`, [SIG('a'), PAYER])).rejects.toThrow(/permission denied/);
  });
});
