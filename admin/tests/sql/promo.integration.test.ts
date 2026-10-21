import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';

// Migration 0027 part C: promo codes. Run for real in an in-memory Postgres; every call is made under `set role anon` / `authenticated`.
let db: PGlite;

const U = (n: number) => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, '0')}`;
const OWNER = U(90);
const P = (n: number) => U(n); // players 1..

const addUser = (id: string, name: string) =>
  db
    .query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${name.toLowerCase()}@example.com`])
    .then(() => db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [id]))
    .then(() => db.query(`update public.profiles set username = $2, username_set_at = now() where user_id = $1`, [id, name]));

const admin = async <T = any>(sql: string, params: unknown[] = []): Promise<T> => as(db, 'authenticated', OWNER, async () => (await db.query<{ r: T }>(sql, params)).rows[0].r);
const create = (count = 1, reward = 'pass', maxUses = 1, expires: string | null = null, note: string | null = 'campanha de teste') =>
  admin<{ codes: string[] }>('select public.admin_create_promo_codes($1, $2, $3, $4::timestamptz, $5) as r', [count, reward, maxUses, expires, note]);
const list = () => admin<any[]>('select public.admin_list_promo_codes() as r');
const disable = (code: string) => admin('select public.admin_disable_promo_code($1) as r', [code]);
const redeem = (uid: string, code: string): Promise<any> => as(db, 'authenticated', uid, async () => (await db.query<any>('select public.redeem_promo_code($1) as r', [code])).rows[0].r);
const oneCode = async (maxUses = 1, expires: string | null = null) => (await create(1, 'pass', maxUses, expires)).codes[0];
const codeRow = async (code: string) => (await db.query<any>('select * from arena_private.promo_codes where code = $1', [code])).rows[0];
const redemptions = async (code: string) => (await db.query<any>('select * from arena_private.promo_redemptions where code = $1 order by at, user_id', [code])).rows;
const passes = async (user: string) => (await db.query<any>(`select * from public.entitlements where user_id = $1 order by granted_at, id`, [user])).rows;
const audit = async (action: string) => (await db.query<any>(`select * from arena_private.admin_audit where action = $1 order by id`, [action])).rows;
const paidCount = async () => Number((await db.query<any>('select arena_private.paid_pass_count() as n')).rows[0].n);

beforeAll(async () => {
  db = await createDb();
  await addUser(OWNER, 'Owner');
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [OWNER]);
  for (let i = 1; i <= 12; i++) await addUser(P(i), `Player${i}`);
}, 180_000);

describe('the admin functions are admin-only', () => {
  test('a signed-in player gets ADMIN_ONLY from all three; anon gets permission denied; nothing is created or audited', async () => {
    const asPlayer = (sql: string, params: unknown[] = []) => as(db, 'authenticated', P(1), () => db.query(sql, params));
    await expect(asPlayer(`select public.admin_create_promo_codes(1, 'pass', 1, null, 'tentando')`)).rejects.toThrow(/ADMIN_ONLY/);
    await expect(asPlayer('select public.admin_list_promo_codes()')).rejects.toThrow(/ADMIN_ONLY/);
    await expect(asPlayer(`select public.admin_disable_promo_code('ABCDEFGHJK')`)).rejects.toThrow(/ADMIN_ONLY/);
    const anon = (sql: string) => as(db, 'anon', null, () => db.query(sql));
    await expect(anon(`select public.admin_create_promo_codes(1, 'pass', 1, null, 'tentando')`)).rejects.toThrow(/permission denied/i);
    await expect(anon('select public.admin_list_promo_codes()')).rejects.toThrow(/permission denied/i);
    await expect(anon(`select public.admin_disable_promo_code('ABCDEFGHJK')`)).rejects.toThrow(/permission denied/i);
    expect((await db.query<any>('select count(*)::int as n from arena_private.promo_codes')).rows[0].n).toBe(0);
    expect((await db.query<any>('select count(*)::int as n from arena_private.admin_audit')).rows[0].n).toBe(0);
  });
  test('the tables are closed to the API roles', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      for (const t of ['promo_codes', 'promo_redemptions']) await expect(as(db, role, OWNER, () => db.query(`select * from arena_private.${t}`))).rejects.toThrow(/permission denied/i);
    }
  });
});

describe('creating codes', () => {
  test('refuses bad arguments', async () => {
    await expect(create(0)).rejects.toThrow(/PROMO_BAD_COUNT/);
    await expect(create(501)).rejects.toThrow(/PROMO_BAD_COUNT/);
    await expect(create(1, 'gold')).rejects.toThrow(/PROMO_BAD_REWARD/);
    await expect(create(1, 'pass', 0)).rejects.toThrow(/PROMO_BAD_MAX_USES/);
    await expect(create(1, 'pass', 100001)).rejects.toThrow(/PROMO_BAD_MAX_USES/);
    await expect(create(1, 'pass', 1, new Date(Date.now() - 60_000).toISOString())).rejects.toThrow(/PROMO_BAD_EXPIRY/);
    await expect(create(1, 'pass', 1, null, null)).rejects.toThrow(/ADMIN_NOTE_REQUIRED/);
    await expect(create(1, 'pass', 1, null, 'ab')).rejects.toThrow(/ADMIN_NOTE_REQUIRED/);
    expect((await db.query<any>('select count(*)::int as n from arena_private.promo_codes')).rows[0].n).toBe(0);
  });
  test('makes distinct 10-character codes in the unambiguous alphabet, writes one audit row WITHOUT the codes, and stores who and why', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const r = await create(25, 'pass', 3, future, 'sorteio do Discord');
    expect(r.codes).toHaveLength(25);
    expect(new Set(r.codes).size).toBe(25);
    for (const c of r.codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    const row = await codeRow(r.codes[0]);
    expect(row).toMatchObject({ reward_kind: 'pass', max_uses: 3, uses: 0, active: true, created_by: OWNER, note: 'sorteio do Discord' });
    expect(new Date(row.expires_at).getTime()).toBe(new Date(future).getTime());
    const a = await audit('create_promo_codes');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ admin_id: OWNER, target_user: null });
    expect(a[0].details).toMatchObject({ count: 25, reward: 'pass', max_uses: 3, note: 'sorteio do Discord' });
    expect(JSON.stringify(a[0].details)).not.toContain(r.codes[0]);
  });
  test('the table itself refuses a code of the wrong shape or a reward it does not know', async () => {
    await expect(db.query(`insert into arena_private.promo_codes (code, reward_kind, max_uses, created_by, note) values ('abc', 'pass', 1, $1, 'xxx')`, [OWNER])).rejects.toThrow();
    await expect(db.query(`insert into arena_private.promo_codes (code, reward_kind, max_uses, created_by, note) values ('ABCDEFGHJK', 'gold', 1, $1, 'xxx')`, [OWNER])).rejects.toThrow();
  });
});

describe('listing and disabling', () => {
  test('the list says uses, expiry, note and a status; expired and exhausted are worked out now', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const [active, expired, exhausted, off] = [await oneCode(1, future), await oneCode(1, future), await oneCode(1), await oneCode(1)];
    await db.query(`update arena_private.promo_codes set expires_at = now() - interval '1 minute' where code = $1`, [expired]);
    await db.query(`update arena_private.promo_codes set uses = 1 where code = $1`, [exhausted]);
    await disable(off);
    const byCode = Object.fromEntries((await list()).map((x: any) => [x.code, x]));
    expect(byCode[active]).toMatchObject({ status: 'active', uses: 0, max_uses: 1, reward_kind: 'pass', active: true, last_redeemed_at: null });
    expect(byCode[expired].status).toBe('expired');
    expect(byCode[exhausted].status).toBe('exhausted');
    expect(byCode[off]).toMatchObject({ status: 'disabled', active: false });
    expect((await list()).length).toBeGreaterThanOrEqual(29);
  });
  test('disabling is idempotent, accepts a code as a person types it, is audited once, and an unknown code is an error', async () => {
    const c = await oneCode();
    const typed = `${c.slice(0, 5).toLowerCase()}-${c.slice(5).toLowerCase()}`;
    expect(await disable(typed)).toEqual({ status: 'disabled' });
    expect(await disable(c)).toEqual({ status: 'already' });
    expect((await audit('disable_promo_code')).filter((a) => a.details.code === c)).toHaveLength(1);
    await expect(disable('AAAAAAAAAA')).rejects.toThrow(/PROMO_NOT_FOUND/);
    await expect(disable('nope')).rejects.toThrow(/PROMO_NOT_FOUND/);
  });
});

describe('redeeming', () => {
  test('only a signed-in account can; anon has no permission', async () => {
    await expect(as(db, 'anon', null, () => db.query(`select public.redeem_promo_code('ABCDEFGHJK')`))).rejects.toThrow(/permission denied/i);
    await expect(as(db, 'authenticated', null, () => db.query(`select public.redeem_promo_code('ABCDEFGHJK')`))).rejects.toThrow(/AUTH_REQUIRED/);
  });

  test('a good code gives ONE active Pass (source promo, live, stamped with the season), uses + 1, one redemption; typing it with lower case, spaces and a dash works', async () => {
    const c = await oneCode();
    const typed = ` ${c.slice(0, 5).toLowerCase()} - ${c.slice(5).toLowerCase()} `;
    expect(await redeem(P(1), typed)).toEqual({ status: 'ok', reward: 'pass', season: 1 });
    const e = await passes(P(1));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ kind: 'adventurer_pass', source: 'promo', status: 'active', livemode: true, valid_through_season: 1 });
    expect(e[0].provider_ref).toBe(`promo-${c}-${P(1)}`);
    expect((await codeRow(c)).uses).toBe(1);
    expect(await redemptions(c)).toHaveLength(1);
    const status = await as(db, 'authenticated', P(1), async () => (await db.query<any>('select public.my_pass_status() as r')).rows[0].r);
    expect(status).toEqual({ owned: true, valid_through: 1, current_season: 1 });
  });

  test('RANKING DECISION: the promo Pass gives the perks and counts for the ranking like a grant, but is not a sale (goal, meter)', async () => {
    const r = (await db.query<any>('select arena_private.owns_adventurer_pass($1) as a, arena_private.owns_ranking_pass($1) as r, arena_private.owns_ranking_pass($1, 1) as r1', [P(1)])).rows[0];
    expect(r).toEqual({ a: true, r: true, r1: true });
    expect(await paidCount()).toBe(0);
    // and the invite rule that asks "did the friend pay?" does not see it either
    const paying = await db.query<any>(
      `select count(*)::int as n from public.entitlements e where e.user_id = $1 and e.kind = 'adventurer_pass' and e.status = 'active' and e.livemode and e.source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol')`,
      [P(1)],
    );
    expect(paying.rows[0].n).toBe(0);
  });

  test('the same account cannot redeem the same code twice: already_redeemed, nothing moves', async () => {
    const c = await oneCode(5);
    expect((await redeem(P(2), c)).status).toBe('ok');
    expect(await redeem(P(2), c)).toEqual({ status: 'already_redeemed' });
    expect((await codeRow(c)).uses).toBe(1);
    expect(await redemptions(c)).toHaveLength(1);
    expect(await passes(P(2))).toHaveLength(1);
  });

  test('max uses: the last use wins, the next account gets exhausted and no Pass', async () => {
    const c = await oneCode(2);
    expect((await redeem(P(3), c)).status).toBe('ok');
    expect((await redeem(P(4), c)).status).toBe('ok');
    expect(await redeem(P(5), c)).toEqual({ status: 'exhausted' });
    expect((await codeRow(c)).uses).toBe(2);
    expect(await passes(P(5))).toHaveLength(0);
  });

  test('an expired code is refused and nothing is consumed', async () => {
    const c = await oneCode(1, new Date(Date.now() + 86_400_000).toISOString());
    await db.query(`update arena_private.promo_codes set expires_at = now() - interval '1 second' where code = $1`, [c]);
    expect(await redeem(P(6), c)).toEqual({ status: 'expired' });
    expect((await codeRow(c)).uses).toBe(0);
    expect(await passes(P(6))).toHaveLength(0);
  });

  test('a disabled code and an unknown code both read as invalid (the answer does not say which)', async () => {
    const c = await oneCode();
    await disable(c);
    expect(await redeem(P(6), c)).toEqual({ status: 'invalid' });
    expect(await redeem(P(6), 'AAAAAAAAAA')).toEqual({ status: 'invalid' });
    expect(await redeem(P(6), 'not a code')).toEqual({ status: 'invalid' });
    expect(await redeem(P(6), '')).toEqual({ status: 'invalid' });
    expect((await codeRow(c)).uses).toBe(0);
  });

  test('an account that already holds a Pass for this season gets already_has_pass and the code is NOT consumed; after a revoke the same code works', async () => {
    const c = await oneCode();
    await db.query(`insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values ($1, 'adventurer_pass', 'stripe', 'pi_p7', 'active', true)`, [P(7)]);
    expect(await redeem(P(7), c)).toEqual({ status: 'already_has_pass' });
    expect((await codeRow(c)).uses).toBe(0);
    expect(await redemptions(c)).toHaveLength(0);
    expect(await passes(P(7))).toHaveLength(1);
    // another account can still use it, and so can he once the Pass is gone
    await db.query(`update public.entitlements set status = 'revoked' where user_id = $1`, [P(7)]);
    expect((await redeem(P(7), c)).status).toBe('ok');
    expect((await codeRow(c)).uses).toBe(1);
  });

  test('a promo Pass is a Pass for the season: holding one, a second code is already_has_pass', async () => {
    const c = await oneCode(3);
    expect((await redeem(P(8), c)).status).toBe('ok');
    const d = await oneCode();
    expect(await redeem(P(8), d)).toEqual({ status: 'already_has_pass' });
    expect((await codeRow(d)).uses).toBe(0);
  });
});

describe('guessing is rate limited per account', () => {
  test('10 attempts that do not redeem in an hour, then even a good code is refused (and not consumed); other accounts are not affected', async () => {
    const good = await oneCode(5);
    for (let i = 0; i < 10; i++) expect((await redeem(P(9), `ZZZZZZZZZ${i + 2}`)).status).toBe('invalid');
    expect(await redeem(P(9), good)).toEqual({ status: 'rate_limited' });
    expect(await redeem(P(9), good)).toEqual({ status: 'rate_limited' });
    expect((await codeRow(good)).uses).toBe(0);
    expect(await passes(P(9))).toHaveLength(0);
    expect((await redeem(P(10), good)).status).toBe('ok');
  });
  test('already_has_pass and already_redeemed count as attempts too (they would otherwise tell a guesser the code is real)', async () => {
    const c = await oneCode(50);
    expect((await redeem(P(11), c)).status).toBe('ok');
    for (let i = 0; i < 10; i++) expect((await redeem(P(11), c)).status).toBe('already_redeemed');
    expect(await redeem(P(11), c)).toEqual({ status: 'rate_limited' });
  });
  test('a successful redemption is not an attempt; the counter lives in the same table the waitlist uses', async () => {
    const hits = (await db.query<any>(`select hits from arena_private.waitlist_limits where bucket = $1`, [`promo:${P(10)}`])).rows;
    expect(hits).toHaveLength(0);
    const nine = (await db.query<any>(`select hits from arena_private.waitlist_limits where bucket = $1`, [`promo:${P(9)}`])).rows[0];
    expect(nine.hits).toBe(10); // the two refused attempts after the tenth were not counted
  });
});

describe('seasons', () => {
  test('when Season 2 opens, a Season-1 Pass covers nothing: a new code gives a Pass for Season 2', async () => {
    await db.query(`update public.seasons set status = 'closed' where number in (0, 1)`);
    await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 2`);
    const c = await oneCode();
    expect((await as(db, 'authenticated', P(1), async () => (await db.query<any>('select public.my_pass_status() as r')).rows[0].r)).owned).toBe(false);
    expect(await redeem(P(1), c)).toEqual({ status: 'ok', reward: 'pass', season: 2 });
    const e = await passes(P(1));
    expect(e.map((x: any) => [x.source, x.valid_through_season])).toEqual([['promo', 1], ['promo', 2]]);
    expect((await db.query<any>('select arena_private.owns_ranking_pass($1) as r', [P(1)])).rows[0].r).toBe(true);
  });
});
