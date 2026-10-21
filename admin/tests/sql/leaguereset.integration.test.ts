import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0032: a certificate (or lot) that was RESERVED when the League reset can never come back. The reservation is owed back ('refund_due'),
// the listing is cancelled, the certificate revoked, and a payment that arrives afterwards is recorded as refund_due, not lost and not an error.
let db: PGlite;
const U = (n: number) => `00000000-0000-4000-8000-0000000007${String(n).padStart(2, '0')}`;
const SELLER = U(1), BUYER = U(2);
const A = (n: string) => n.padEnd(40, '1');
const ADDR = { SELLER: A('SeLLer'), BUYER: A('Buyer1'), FEE: A('FeeAddr') };
const SIG = (c: string): string => c.repeat(88);
const svc = async (sql: string, params: unknown[] = []): Promise<any> => as(db, 'service_role', null, async () => (await db.query<any>(sql, params)).rows[0].r);
const rows = async (sql: string, params: unknown[] = []): Promise<any[]> => (await db.query<any>(sql, params)).rows;
const certStatus = async (id: string) => (await rows('select status from public.item_certificates where id = $1', [id]))[0].status;

let n = 0;
async function mintCert(): Promise<string> {
  n += 1;
  const id = `70000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
  await db.query(
    `insert into public.item_certificates (id,user_id,kind,template_id,rarity,tier,source,status,bound,request_id,content_hash,created_at)
     values ($1,$2,'gear','iron_sword','legendary',4,'forge','held',false,$3,repeat('b',64), now() - interval '1 day')`,
    [id, SELLER, `rq-${n}`],
  );
  return id;
}
const list = (cert: string) => svc(`select public.market_list($1,$2,1000000000,30,50,50,1000000,50000000000) as r`, [SELLER, cert]);
const reserve = (listingId: string) => svc(`select public.market_reserve($1,$2,$3,103,false,5,30,120,100,3600) as r`, [BUYER, listingId, ADDR.FEE]);

beforeAll(async () => {
  db = await createDb();
  for (const u of [SELLER, BUYER]) {
    await db.query(`insert into auth.users (id,email,created_at,email_confirmed_at) values ($1,$2,now()-interval '10 days',now())`, [u, `${u}@x.com`]);
    await db.query('insert into public.profiles (user_id) values ($1) on conflict do nothing', [u]);
  }
  await db.query(`insert into public.market_wallets (user_id,address,chain_id) values ($1,$2,103),($3,$4,103)`, [SELLER, ADDR.SELLER, BUYER, ADDR.BUYER]);
}, 180_000);

describe('League reset and a reserved listing', () => {
  test('the reserved item is revoked, cannot come back, and a later payment is recorded as refund_due', async () => {
    const held = await mintCert();
    const open = await mintCert();
    const reservedCert = await mintCert();
    await list(open);
    const l = await list(reservedCert);
    const r = await reserve(l.listing_id);
    expect(r.status).toBe('reserved');
    expect((await rows('select status from public.market_listings where id = $1', [l.listing_id]))[0].status).toBe('reserved');

    await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 1`);

    expect(await certStatus(held)).toBe('revoked');
    expect(await certStatus(open)).toBe('revoked');
    expect(await certStatus(reservedCert)).toBe('revoked');
    expect((await rows('select status from public.market_listings where id = $1', [l.listing_id]))[0].status).toBe('cancelled');
    expect((await rows('select status from public.market_reservations where id = $1', [r.reservation_id]))[0].status).toBe('refund_due');

    // the reservation lapses, the seller cancels: nothing comes back
    await db.query(`update public.market_reservations set expires_at = now() - interval '1 minute' where id = $1`, [r.reservation_id]);
    await svc(`select public.market_expire_due(50) as r`);
    const c = await svc(`select public.market_cancel_listing($1,$2) as r`, [SELLER, l.listing_id]);
    expect(c.status).toBe('not_open');
    expect(await certStatus(reservedCert)).toBe('revoked');
    const again = await svc(`select public.market_list($1,$2,1000000000,30,50,50,1000000,50000000000) as r`, [SELLER, reservedCert]);
    expect(again.status).not.toBe('listed');

    // the buyer's payment arrives late (wallet was slow): recorded as refund_due, the signature is consumed, nothing is raised
    const res = (await rows('select price_lamports, buyer_address, seller_address from public.market_reservations where id = $1', [r.reservation_id]))[0];
    const paid = await svc(`select public.market_record_payment($1,$2,$3,$4,$5,$6,1,now()) as r`, [BUYER, r.reservation_id, SIG('R'), res.buyer_address, res.seller_address, String(res.price_lamports)]);
    expect(paid.status).toBe('refund_due');
    const cp = await rows('select status, leg from public.chain_payments where tx_hash = $1', [SIG('R')]);
    expect(cp).toEqual([{ status: 'refund_due', leg: 'sale' }]);
    expect(await certStatus(reservedCert)).toBe('revoked');
  }, 120_000);

  test('re-running the migration logic is idempotent and the audit shows the void', async () => {
    await db.exec(`select arena_private.league_reset_void((select g.reset_at from arena_private.season_goal as g where g.id))`);
    const ev = await rows(`select count(*)::int as n from public.market_events where kind = 'refund_due' and detail->>'why' = 'league_reset'`);
    expect(ev[0].n).toBe(1);
  });
});
