import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';
// the TypeScript twin of the same sum: the SQL and pouchFloorLamports must agree on every face and rate
import { pouchFloorLamports, solUsdMicro } from '../../../supabase/functions/_shared/chain/solMoney';

// Migration 0036: market_list refuses a Gold Pouch below US$ 0.25 per 1,000 Gold (converted at the server's SOL price, rounded up to 0.001 SOL) and keeps items and a caller without the floor untouched.
let db: PGlite;
const U = (n: number) => `00000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`;
const SELLER = U(1);
const svc = async (sql: string, params: unknown[] = []): Promise<any> => as(db, 'service_role', null, async () => (await db.query<any>(sql, params)).rows[0].r);
const status = async (id: string) => (await db.query<any>('select status from public.item_certificates where id = $1', [id])).rows[0].status;

let n = 0;
async function mint(kind: 'gear' | 'gold_pouch', gold: number | null = null): Promise<string> {
  n += 1;
  const id = `90000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
  if (kind === 'gold_pouch') {
    await db.query(
      `insert into public.item_certificates (id,user_id,kind,template_id,gold_amount,source,status,bound,request_id,content_hash,created_at)
       values ($1,$2,'gold_pouch','gold_pouch_s',$3,'pouch','held',false,$4,repeat('c',64), now() - interval '1 day')`,
      [id, SELLER, gold, `rq-${n}`],
    );
  } else {
    await db.query(
      `insert into public.item_certificates (id,user_id,kind,template_id,rarity,tier,source,status,bound,request_id,content_hash,created_at)
       values ($1,$2,'gear','iron_sword','legendary',4,'forge','held',false,$3,repeat('b',64), now() - interval '1 day')`,
      [id, SELLER, `rq-${n}`],
    );
  }
  return id;
}
// the 8 old arguments + the floor (micro-USD per 1,000 Gold) + the SOL rate (micro-USD per SOL)
const list = (cert: string, price: number, floor: number | null, rate: number | null) =>
  svc(`select public.market_list($1,$2,$3,30,50,50,1000000,50000000000,$4,$5) as r`, [SELLER, cert, price, floor, rate]);

beforeAll(async () => {
  db = await createDb();
  await db.query(`insert into auth.users (id,email,created_at,email_confirmed_at) values ($1,$2,now()-interval '10 days',now())`, [SELLER, `${SELLER}@x.com`]);
  await db.query('insert into public.profiles (user_id) values ($1) on conflict do nothing', [SELLER]);
  await db.query(`insert into public.market_wallets (user_id,address,chain_id) values ($1,$2,103)`, [SELLER, 'SeLLer'.padEnd(40, '1')]);
}, 180_000);

describe('the Gold Pouch floor in market_list', () => {
  test('below the floor: refused with the floor in lamports, and the pouch stays held', async () => {
    const c = await mint('gold_pouch', 2000);
    const r = await list(c, 3_000_000, 250_000, 150_000_000);
    expect(r).toEqual({ status: 'refused', reason: 'below_pouch_floor', floor_lamports: 4_000_000 });
    expect(await status(c)).toBe('held');
  });

  test('at the floor it is listed; the price above is free', async () => {
    const c = await mint('gold_pouch', 2000);
    expect((await list(c, 4_000_000, 250_000, 150_000_000)).status).toBe('listed');
    const d = await mint('gold_pouch', 20_000);
    expect((await list(d, 40_000_000_000, 250_000, 150_000_000)).status).toBe('listed');
  });

  test('no SOL rate: retryable refusal, nothing listed', async () => {
    const c = await mint('gold_pouch', 2000);
    expect(await list(c, 50_000_000_000, 250_000, null)).toEqual({ status: 'refused', reason: 'pouch_rate_unavailable' });
    expect(await status(c)).toBe('held');
  });

  test('items are not touched, and a caller without the floor keeps the old behaviour', async () => {
    const gear = await mint('gear');
    expect((await list(gear, 1_000_000, 250_000, null)).status).toBe('listed');
    const pouch = await mint('gold_pouch', 2000);
    expect((await list(pouch, 1_000_000, null, null)).status).toBe('listed');
    const old = await mint('gear');
    expect((await svc(`select public.market_list($1,$2,1000000,30,50,50,1000000,50000000000) as r`, [SELLER, old])).status).toBe('listed'); // the 8-argument call still resolves
  });

  test('the SQL and the TypeScript compute the same floor for every face and many rates', async () => {
    for (const gold of [2000, 5000, 20_000, 10_000, 50_000, 100_000]) {
      for (const usd of [99.99, 150.2, 1234.56]) {
        const c = await mint('gold_pouch', gold);
        const expected = pouchFloorLamports(gold, usd) as number;
        if (expected - 1_000_000 >= 1_000_000) expect(await list(c, expected - 1_000_000, 250_000, solUsdMicro(usd)), `${gold} @ ${usd}`).toEqual({ status: 'refused', reason: 'below_pouch_floor', floor_lamports: expected });
        const ok = await list(c, expected, 250_000, solUsdMicro(usd));
        expect(ok.status, `${gold} @ ${usd}`).toBe('listed');
      }
    }
  });
});
