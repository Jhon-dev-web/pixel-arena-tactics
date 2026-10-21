import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0028: promo codes that give Gold, Eter (shards) and potions through the credit ledger. Run for real in an in-memory Postgres; every call is made under `set role anon` / `authenticated` / `service_role`.
let db: PGlite;

const U = (n: number) => `00000000-0000-4000-8000-0000000007${String(n).padStart(2, '0')}`;
const OWNER = U(90);
const P = (n: number) => U(n);

const addUser = (id: string, name: string) =>
  db
    .query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${name.toLowerCase()}@example.com`])
    .then(() => db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [id]))
    .then(() => db.query(`update public.profiles set username = $2, username_set_at = now() where user_id = $1`, [id, name]));

const admin = async <T = any>(sql: string, params: unknown[] = []): Promise<T> => as(db, 'authenticated', OWNER, async () => (await db.query<{ r: T }>(sql, params)).rows[0].r);
const create = (reward: string, item: string | null, amount: number | null, maxUses = 1, count = 1, expires: string | null = null) =>
  admin<{ codes: string[] }>('select public.admin_create_promo_codes($1, $2, $3, $4::timestamptz, $5, $6, $7) as r', [count, reward, maxUses, expires, 'youtuber de teste', item, amount]);
const oneCode = async (reward: string, item: string | null, amount: number | null, maxUses = 1) => (await create(reward, item, amount, maxUses)).codes[0];
const list = () => admin<any[]>('select public.admin_list_promo_codes() as r');
const redeem = (uid: string, code: string): Promise<any> => as(db, 'authenticated', uid, async () => (await db.query<any>('select public.redeem_promo_code($1) as r', [code])).rows[0].r);
const claim = (uid: string): Promise<any[]> => as(db, 'authenticated', uid, async () => (await db.query<any>('select public.claim_server_credits() as r')).rows[0].r);
const recent = (uid: string, days?: number): Promise<any[]> =>
  as(db, 'authenticated', uid, async () => (await (days === undefined ? db.query<any>('select public.my_recent_credits() as r') : db.query<any>('select public.my_recent_credits($1) as r', [days]))).rows[0].r);
const pending = (uid: string): Promise<any> => as(db, 'service_role', null, async () => (await db.query<any>('select public.progress_credits_pending($1) as r', [uid])).rows[0].r);
const markCounted = (uid: string, through: string | null): Promise<number> => as(db, 'service_role', null, async () => (await db.query<any>('select public.progress_credits_mark_counted($1, $2::timestamptz) as r', [uid, through])).rows[0].r);
const codeRow = async (code: string) => (await db.query<any>('select * from arena_private.promo_codes where code = $1', [code])).rows[0];
const credits = async (user: string) => (await db.query<any>('select * from arena_private.server_credits where user_id = $1 order by created_at, id', [user])).rows;
const passes = async (user: string) => (await db.query<any>(`select * from public.entitlements where user_id = $1`, [user])).rows;
const audit = async (action: string) => (await db.query<any>(`select * from arena_private.admin_audit where action = $1 order by id`, [action])).rows;

beforeAll(async () => {
  db = await createDb();
  await addUser(OWNER, 'Owner');
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [OWNER]);
  for (let i = 1; i <= 14; i++) await addUser(P(i), `Player${i}`);
}, 180_000);

describe('who can do what', () => {
  test('creating is admin-only; anon has no permission on anything; the ledger table is closed to the API roles', async () => {
    const asPlayer = (sql: string, params: unknown[] = []) => as(db, 'authenticated', P(1), () => db.query(sql, params));
    await expect(asPlayer(`select public.admin_create_promo_codes(1, 'gold', 1, null, 'tentando', null, 100)`)).rejects.toThrow(/ADMIN_ONLY/);
    for (const sql of [
      `select public.admin_create_promo_codes(1, 'gold', 1, null, 'tentando', null, 100)`,
      `select public.claim_server_credits()`,
      `select public.my_recent_credits(7)`,
      `select public.progress_credits_pending('${P(1)}')`,
      `select public.progress_credits_mark_counted('${P(1)}', now())`,
    ]) {
      await expect(as(db, 'anon', null, () => db.query(sql)), sql).rejects.toThrow(/permission denied/i);
    }
    for (const role of ['anon', 'authenticated'] as const) await expect(as(db, role, OWNER, () => db.query('select * from arena_private.server_credits'))).rejects.toThrow(/permission denied/i);
    expect((await db.query<any>('select count(*)::int as n from arena_private.promo_codes')).rows[0].n).toBe(0);
  });
  test('a signed-in PLAYER cannot read the service-role counters (they would tell him what the audit allows)', async () => {
    await expect(as(db, 'authenticated', P(1), () => db.query(`select public.progress_credits_pending('${P(1)}')`))).rejects.toThrow(/permission denied/i);
    await expect(as(db, 'authenticated', P(1), () => db.query(`select public.progress_credits_mark_counted('${P(1)}', now())`))).rejects.toThrow(/permission denied/i);
  });
  test('claim and recent need a signed-in account', async () => {
    await expect(as(db, 'authenticated', null, () => db.query('select public.claim_server_credits()'))).rejects.toThrow(/AUTH_REQUIRED/);
    await expect(as(db, 'authenticated', null, () => db.query('select public.my_recent_credits(3)'))).rejects.toThrow(/AUTH_REQUIRED/);
  });
});

describe('creating codes with a reward', () => {
  test('refuses an unknown reward, a missing or forbidden potion, and amounts outside the caps; nothing is created', async () => {
    await expect(create('diamonds', null, 5)).rejects.toThrow(/PROMO_BAD_REWARD/);
    await expect(create('gold', null, null)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('gold', null, 0)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('gold', null, 1_000_001)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('shards', null, 10_001)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('shards', null, -3)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('consumable', 'small_hp', 101)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('consumable', 'small_hp', 0)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('consumable', 'small_hp', null)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    await expect(create('gold', 'small_hp', 100)).rejects.toThrow(/PROMO_BAD_ITEM/);
    await expect(create('consumable', null, 5)).rejects.toThrow(/PROMO_BAD_ITEM/);
    await expect(create('consumable', 'dragon_egg', 5)).rejects.toThrow(/PROMO_BAD_ITEM/);
    await expect(create('pass', 'small_hp', null)).rejects.toThrow(/PROMO_BAD_ITEM/);
    await expect(create('pass', null, 5)).rejects.toThrow(/PROMO_BAD_AMOUNT/);
    expect((await db.query<any>('select count(*)::int as n from arena_private.promo_codes')).rows[0].n).toBe(0);
  });

  test('the potions that would mint a market good or a Pass-track exclusive are refused', async () => {
    for (const id of ['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l', 'stash_deed', 'forge_seal', 'refine_catalyst', 'expedition_ticket_1h', 'expedition_ticket_2h', 'expedition_ticket_4h']) {
      await expect(create('consumable', id, 1), id).rejects.toThrow(/PROMO_BAD_ITEM/);
    }
  });

  test('every listed potion is accepted; a pass code keeps item and amount empty', async () => {
    const ids: string[] = (await db.query<any>('select unnest(arena_private.promo_consumable_ids()) as id')).rows.map((r: any) => r.id);
    expect(ids).toHaveLength(19);
    for (const id of ids) expect((await create('consumable', id, 1)).codes).toHaveLength(1);
    const pass = await oneCode('pass', null, null);
    expect(await codeRow(pass)).toMatchObject({ reward_kind: 'pass', reward_item_id: null, reward_amount: null });
  });

  test('the caps are accepted exactly: 1,000,000 Gold, 10,000 Eter, 100 potions', async () => {
    for (const [k, i, a] of [['gold', null, 1_000_000], ['shards', null, 10_000], ['consumable', 'large_hp', 100]] as const) {
      const c = await oneCode(k, i, a);
      expect(await codeRow(c)).toMatchObject({ reward_kind: k, reward_item_id: i, reward_amount: a });
    }
  });

  test('the audit row names the reward, the potion and the amount (and not the code); the list shows them', async () => {
    const c = await oneCode('consumable', 'knowledge_elixir', 7);
    const rows = await audit('create_promo_codes');
    const last = rows[rows.length - 1];
    expect(last.details).toMatchObject({ count: 1, reward: 'consumable', item_id: 'knowledge_elixir', amount: 7, max_uses: 1, note: 'youtuber de teste' });
    expect(JSON.stringify(last.details)).not.toContain(c);
    const row = (await list()).find((x: any) => x.code === c);
    expect(row).toMatchObject({ reward_kind: 'consumable', reward_item_id: 'knowledge_elixir', reward_amount: 7, status: 'active' });
    const g = await oneCode('gold', null, 5000);
    expect((await list()).find((x: any) => x.code === g)).toMatchObject({ reward_kind: 'gold', reward_item_id: null, reward_amount: 5000 });
  });

  test('the table itself refuses a shape the function would not make (editing in the SQL editor cannot exceed the caps)', async () => {
    const ins = (kind: string, item: string | null, amount: number | null) =>
      db.query(`insert into arena_private.promo_codes (code, reward_kind, reward_item_id, reward_amount, max_uses, created_by, note) values ('ABCDEFGHJK', $1, $2, $3, 1, $4, 'xxx')`, [kind, item, amount, OWNER]);
    await expect(ins('gold', null, 2_000_000)).rejects.toThrow();
    await expect(ins('gold', 'small_hp', 5)).rejects.toThrow();
    await expect(ins('consumable', 'gold_pouch_l', 5)).rejects.toThrow();
    await expect(ins('shards', null, null)).rejects.toThrow();
    await expect(ins('pass', null, 10)).rejects.toThrow();
    const rows = (await db.query<any>(`select count(*)::int as n from arena_private.promo_codes where code = 'ABCDEFGHJK'`)).rows[0].n;
    expect(rows).toBe(0);
  });
});

describe('redeeming a Gold / Eter / potion code', () => {
  test('Gold: one ledger row, uses + 1, one redemption, NO Pass; the answer names the reward and the credit', async () => {
    const c = await oneCode('gold', null, 25_000, 3);
    const r = await redeem(P(1), c);
    expect(r).toMatchObject({ status: 'ok', reward: 'gold', item_id: null, amount: 25_000 });
    const rows = await credits(P(1));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: r.credit_id, kind: 'gold', item_id: null, amount: 25_000, source: 'promo', source_ref: c, claimed_at: null, counted_at: null });
    expect((await codeRow(c)).uses).toBe(1);
    expect((await db.query<any>('select count(*)::int as n from arena_private.promo_redemptions where code = $1', [c])).rows[0].n).toBe(1);
    expect(await passes(P(1))).toHaveLength(0);
  });

  test('Eter and a potion work the same way, typed as a person types them', async () => {
    const s = await oneCode('shards', null, 40);
    const typed = ` ${s.slice(0, 5).toLowerCase()}-${s.slice(5).toLowerCase()} `;
    expect(await redeem(P(2), typed)).toMatchObject({ status: 'ok', reward: 'shards', amount: 40 });
    const p = await oneCode('consumable', 'greater_elixir', 12);
    expect(await redeem(P(2), p)).toMatchObject({ status: 'ok', reward: 'consumable', item_id: 'greater_elixir', amount: 12 });
    expect((await credits(P(2))).map((x: any) => [x.kind, x.item_id, x.amount])).toEqual([['shards', null, 40], ['consumable', 'greater_elixir', 12]]);
  });

  test('a player who already has the Pass can still use a Gold code (already_has_pass is only about a code that gives the Pass)', async () => {
    await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'stripe', 'pi_cr3', 'active', true)`, [P(3)]);
    const c = await oneCode('gold', null, 100);
    expect(await redeem(P(3), c)).toMatchObject({ status: 'ok', reward: 'gold' });
    expect(await passes(P(3))).toHaveLength(1);
  });

  test('the same account cannot redeem the same code twice: no second credit, no second use', async () => {
    const c = await oneCode('gold', null, 500, 5);
    expect((await redeem(P(4), c)).status).toBe('ok');
    expect(await redeem(P(4), c)).toEqual({ status: 'already_redeemed' });
    expect(await credits(P(4))).toHaveLength(1);
    expect((await codeRow(c)).uses).toBe(1);
  });

  test('max uses, expiry and a disabled code behave as for the Pass: no credit is written', async () => {
    const one = await oneCode('shards', null, 5, 1);
    expect((await redeem(P(5), one)).status).toBe('ok');
    expect(await redeem(P(6), one)).toEqual({ status: 'exhausted' });
    expect(await credits(P(6))).toHaveLength(0);
    const old = await oneCode('gold', null, 5, 1);
    await db.query(`update arena_private.promo_codes set expires_at = now() - interval '1 second' where code = $1`, [old]);
    expect(await redeem(P(6), old)).toEqual({ status: 'expired' });
    const off = await oneCode('gold', null, 5, 1);
    await admin('select public.admin_disable_promo_code($1) as r', [off]);
    expect(await redeem(P(6), off)).toEqual({ status: 'invalid' });
    expect(await credits(P(6))).toHaveLength(0);
  });

  test('the credit and the redemption are ATOMIC: if the ledger refuses the row nothing else moves', async () => {
    const c = await oneCode('gold', null, 900, 5);
    // a leftover ledger row for the same (source, code, user) makes the insert hit the unique key
    await db.query(`insert into arena_private.server_credits (user_id, kind, amount, source, source_ref) values ($1, 'gold', 900, 'promo', $2)`, [P(7), c]);
    await expect(redeem(P(7), c)).rejects.toThrow(/server_credits_once|duplicate key/i);
    expect((await codeRow(c)).uses).toBe(0);
    expect((await db.query<any>('select count(*)::int as n from arena_private.promo_redemptions where code = $1 and user_id = $2', [c, P(7)])).rows[0].n).toBe(0);
  });

  test('guessing is still rate limited (10 misses an hour) and a successful redeem is not an attempt', async () => {
    const good = await oneCode('gold', null, 50, 5);
    for (let i = 0; i < 10; i++) expect((await redeem(P(8), `ZZZZZZZZZ${i + 2}`)).status).toBe('invalid');
    expect(await redeem(P(8), good)).toEqual({ status: 'rate_limited' });
    expect(await credits(P(8))).toHaveLength(0);
    expect((await redeem(P(9), good)).status).toBe('ok');
  });
});

describe('claiming', () => {
  test('claim hands over the unclaimed credits, oldest first, marks them claimed, and a second claim is empty', async () => {
    const a = await oneCode('gold', null, 111, 5);
    const b = await oneCode('consumable', 'small_hp', 3, 5);
    await redeem(P(10), a);
    await redeem(P(10), b);
    const first = await claim(P(10));
    expect(first.map((c: any) => [c.kind, c.item_id, c.amount, c.source_ref])).toEqual([['gold', null, 111, a], ['consumable', 'small_hp', 3, b]]);
    for (const c of first) expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await credits(P(10))).every((c: any) => c.claimed_at !== null && c.counted_at === null)).toBe(true);
    expect(await claim(P(10))).toEqual([]);
  });

  test('a player sees only his own credits', async () => {
    const c = await oneCode('shards', null, 9, 5);
    await redeem(P(11), c);
    expect(await claim(P(12))).toEqual([]);
    expect(await recent(P(12))).toEqual([]);
    expect(await claim(P(11))).toHaveLength(1);
  });

  test('claim marks inside one statement: a second claim never returns a row the first one got (the claim is not repeated by a retry)', async () => {
    const c = await oneCode('gold', null, 7, 5);
    await redeem(P(13), c);
    const [x, y] = [await claim(P(13)), await claim(P(13))];
    expect(x).toHaveLength(1);
    expect(y).toHaveLength(0);
  });

  test('my_recent_credits gives back what was claimed (a lost answer), never an unclaimed credit, within the window only', async () => {
    const c = await oneCode('gold', null, 33, 5);
    await redeem(P(14), c);
    expect(await recent(P(14))).toEqual([]); // not claimed yet: only claim_server_credits may hand it out
    const got = await claim(P(14));
    const again = await recent(P(14));
    expect(again).toEqual(got);
    await db.query(`update arena_private.server_credits set claimed_at = now() - interval '20 days' where user_id = $1`, [P(14)]);
    expect(await recent(P(14), 7)).toEqual([]);
    expect(await recent(P(14), 30)).toHaveLength(1);
    expect(await recent(P(14), 999)).toHaveLength(1); // clamped to 30
    await db.query(`update arena_private.server_credits set claimed_at = now() - interval '40 days' where user_id = $1`, [P(14)]);
    expect(await recent(P(14), 999)).toEqual([]);
  });
});

describe('what submit-progress is told (service role)', () => {
  const U2 = (n: number) => `00000000-0000-4000-8000-0000000008${String(n).padStart(2, '0')}`;
  const give = async (user: string, kind: string, item: string | null, amount: number, claimed: boolean, ago = '0 seconds') =>
    (await db.query<any>(
      `insert into arena_private.server_credits (user_id, kind, item_id, amount, source, source_ref, claimed_at) values ($1, $2, $3, $4, 'promo', $5, ${claimed ? `now() - interval '${ago}'` : 'null'}) returning id`,
      [user, kind, item, amount, 'REF' + Math.random().toString(36).slice(2, 9).toUpperCase()],
    )).rows[0].id;

  beforeAll(async () => {
    for (let i = 1; i <= 3; i++) await addUser(U2(i), `Credit${i}`);
  });

  test('pending sums the CLAIMED, not yet counted credits per kind; an unclaimed one is not an allowance', async () => {
    await give(U2(1), 'gold', null, 1000, true);
    await give(U2(1), 'gold', null, 500, true);
    await give(U2(1), 'shards', null, 20, true);
    await give(U2(1), 'consumable', 'small_hp', 3, true);
    await give(U2(1), 'consumable', 'large_hp', 4, true);
    await give(U2(1), 'gold', null, 99999, false);
    const p = await pending(U2(1));
    expect(p).toMatchObject({ gold: 1500, shards: 20, consumable: 7 });
    expect(typeof p.through).toBe('string');
    expect(await pending(U2(2))).toEqual({ gold: 0, shards: 0, consumable: 0, through: null });
  });

  test('a credit counts ONCE: after mark_counted it is gone from pending, and a second mark changes nothing', async () => {
    const p = await pending(U2(1));
    expect(await markCounted(U2(1), p.through)).toBe(5);
    expect(await pending(U2(1))).toEqual({ gold: 0, shards: 0, consumable: 0, through: null });
    expect(await markCounted(U2(1), p.through)).toBe(0);
    expect(await markCounted(U2(1), null)).toBe(0);
  });

  test('a credit claimed after the `through` the snapshot saw is NOT marked: it counts in the next snapshot', async () => {
    await give(U2(3), 'gold', null, 100, true, '5 minutes');
    const seen = await pending(U2(3));
    await give(U2(3), 'gold', null, 250, true); // claimed while the snapshot was being judged
    expect(await markCounted(U2(3), seen.through)).toBe(1);
    expect(await pending(U2(3))).toMatchObject({ gold: 250 });
  });

  test('marking is per user: another account is untouched', async () => {
    await give(U2(2), 'shards', null, 8, true);
    const mine = await pending(U2(1));
    expect(mine.shards).toBe(0);
    expect(await markCounted(U2(1), new Date(Date.now() + 60_000).toISOString())).toBe(0);
    expect(await pending(U2(2))).toMatchObject({ shards: 8 });
  });
});

describe('the ledger follows the account', () => {
  test('deleting the account removes its credits (cascade); the codes and the audit log stay', async () => {
    const id = U(60);
    await addUser(id, 'Gone');
    const c = await oneCode('gold', null, 10, 5);
    await redeem(id, c);
    expect(await credits(id)).toHaveLength(1);
    await db.query('delete from public.profiles where user_id = $1', [id]).catch(() => undefined);
    await db.query('delete from auth.users where id = $1', [id]);
    expect(await credits(id)).toHaveLength(0);
    expect((await db.query<any>('select count(*)::int as n from arena_private.promo_redemptions where user_id = $1', [id])).rows[0].n).toBe(0);
    expect((await codeRow(c)).uses).toBe(1);
  });
});
