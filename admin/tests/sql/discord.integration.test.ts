import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { as, createDb, MIGRATIONS_DIR } from './harness';

// migration 0038: the "Entrar no Discord" community task. A verified account gets 500 Gold for the season: held until the League opens (reset_at stamped) and inserted at once when verified after the opening.
// Run for real in an in-memory Postgres.
let db: PGlite;
const U = (n: number) => `00000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`;
const EARLY = U(1); // verified before the League opens
const EARLY2 = U(2); // verified before, a second account
const LATE = U(3); // verified after the League opens
const NOTYET = U(4); // not a member when checked, later joins
const CLASH = U(5); // tries a Discord id already verified on EARLY
const NOBODY = U(6); // never linked
const D = (n: number) => `1234567890123456${String(n).padStart(2, '0')}`;

const svc = <T>(fn: () => Promise<T>) => as(db, 'service_role', null, fn);
const complete = (user: string, discord: string, member: boolean): Promise<any> => svc(async () => (await db.query<any>('select public.discord_link_complete($1, $2, $3) as r', [user, discord, member])).rows[0].r);
const stateCreate = (user: string, state: string): Promise<any> => svc(async () => (await db.query<any>('select public.discord_state_create($1, $2) as r', [user, state])).rows[0].r);
const stateConsume = (state: string): Promise<string | null> => svc(async () => (await db.query<any>('select public.discord_state_consume($1) as r', [state])).rows[0].r);
const task = (uid: string): Promise<any> => as(db, 'authenticated', uid, async () => (await db.query<any>('select public.my_discord_task() as r')).rows[0].r);
const claim = (uid: string): Promise<any[]> => as(db, 'authenticated', uid, async () => (await db.query<any>('select public.claim_server_credits() as r')).rows[0].r);
const credits = async (user: string) => (await db.query<any>(`select kind, item_id, amount, source, source_ref, claimed_at from arena_private.server_credits where user_id = $1 and source = 'discord'`, [user])).rows;
const discordRows = async (): Promise<number> => (await db.query<any>(`select count(*)::int as n from arena_private.server_credits where source = 'discord'`)).rows[0].n;
const openLeague = () => db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 1`);
const state = (n: number) => `s${String(n).padStart(2, '0')}`.padEnd(43, 'x');

beforeAll(async () => {
  db = await createDb();
  for (const u of [EARLY, EARLY2, LATE, NOTYET, CLASH, NOBODY]) {
    await db.query(`insert into auth.users (id, email, created_at, email_confirmed_at) values ($1, $2, now() - interval '20 days', now())`, [u, `${u}@x.com`]);
    await db.query('insert into public.profiles (user_id) values ($1) on conflict do nothing', [u]);
  }
}, 180_000);

describe('the pieces and the permissions', () => {
  test('the amount lives in one function; the ledger accepts the source discord and nothing else new', async () => {
    expect((await db.query<any>('select arena_private.discord_reward() as r')).rows[0].r).toEqual({ gold: 500, source_ref: 'discord-gold' });
    await expect(db.query(`insert into arena_private.server_credits (user_id, kind, amount, source, source_ref) values ($1, 'gold', 1, 'other', 'x')`, [NOBODY])).rejects.toThrow(/server_credits_source_check/);
  });

  test('the RPCs of the Edge Functions are service role only; the game may only ask its own status', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(as(db, role, EARLY, () => db.query('select public.discord_link_complete($1, $2, true)', [EARLY, D(1)]))).rejects.toThrow(/permission denied/i);
      await expect(as(db, role, EARLY, () => db.query('select public.discord_state_create($1, $2)', [EARLY, state(1)]))).rejects.toThrow(/permission denied/i);
      await expect(as(db, role, EARLY, () => db.query('select public.discord_state_consume($1)', [state(1)]))).rejects.toThrow(/permission denied/i);
    }
    await expect(as(db, 'anon', null, () => db.query('select public.my_discord_task()'))).rejects.toThrow(/permission denied/i);
    await expect(as(db, 'authenticated', EARLY, () => db.query('select * from arena_private.discord_links'))).rejects.toThrow(/permission denied/i);
    await expect(as(db, 'authenticated', EARLY, () => db.query('select * from arena_private.discord_oauth_states'))).rejects.toThrow(/permission denied/i);
  });
});

describe('the OAuth state', () => {
  test('single use: the second consume answers null', async () => {
    expect((await stateCreate(NOBODY, state(1))).status).toBe('ok');
    expect(await stateConsume(state(1))).toBe(NOBODY);
    expect(await stateConsume(state(1))).toBeNull();
    expect(await stateConsume('does-not-exist'.padEnd(40, 'z'))).toBeNull();
  });

  test('expires after 10 minutes: an expired state is refused (and gone)', async () => {
    await stateCreate(NOBODY, state(2));
    await db.query(`update arena_private.discord_oauth_states set expires_at = now() - interval '1 second' where state = $1`, [state(2)]);
    expect(await stateConsume(state(2))).toBeNull();
    expect((await db.query<any>('select count(*)::int as n from arena_private.discord_oauth_states where state = $1', [state(2)])).rows[0].n).toBe(0);
    const fresh = (await db.query<any>(`select expires_at - created_at as d from arena_private.discord_oauth_states where state = $1`, [state(1)])).rows;
    expect(fresh).toEqual([]);
    await stateCreate(NOBODY, state(3));
    expect((await db.query<any>(`select (expires_at - created_at = interval '10 minutes') as ok from arena_private.discord_oauth_states where state = $1`, [state(3)])).rows[0].ok).toBe(true);
    await stateConsume(state(3));
  });

  test('an account may hold 10 open states at once, then it is rate limited; a bad state is refused', async () => {
    for (let i = 10; i < 20; i++) expect((await stateCreate(NOBODY, state(i))).status).toBe('ok');
    expect((await stateCreate(NOBODY, state(30))).status).toBe('rate_limited');
    for (let i = 10; i < 20; i++) await stateConsume(state(i));
    await expect(stateCreate(NOBODY, 'short')).rejects.toThrow(/DISCORD_BAD_STATE/);
  });
});

describe('before the League opens', () => {
  test('a verified account is linked and the reward is pending: no credit is inserted (the pre-season Gold would be wiped)', async () => {
    expect((await task(EARLY))).toEqual({ linked: false, verified: false, reward: 'none', reward_amount: 500 });
    expect((await complete(EARLY, D(1), true)).status).toBe('verified');
    expect((await complete(EARLY2, D(2), true)).status).toBe('verified');
    expect(await task(EARLY)).toEqual({ linked: true, verified: true, reward: 'pending', reward_amount: 500 });
    expect(await discordRows()).toBe(0);
    expect(await claim(EARLY)).toEqual([]);
  });

  test('not a member yet: linked but not verified, no reward; joining later and trying again verifies', async () => {
    expect((await complete(NOTYET, D(4), false)).status).toBe('not_member');
    expect(await task(NOTYET)).toEqual({ linked: true, verified: false, reward: 'none', reward_amount: 500 });
    expect((await complete(NOTYET, D(4), true)).status).toBe('verified');
    expect((await task(NOTYET)).reward).toBe('pending');
  });

  test('a Discord account verifies one game account only; the first account keeps its link', async () => {
    expect((await complete(CLASH, D(1), true)).status).toBe('already_used');
    expect(await task(CLASH)).toEqual({ linked: false, verified: false, reward: 'none', reward_amount: 500 });
    // a stranger who is NOT a member does not reserve anybody's Discord id
    expect((await complete(CLASH, D(1), false)).status).toBe('not_member');
    expect((await complete(EARLY, D(9), true)).status).toBe('already_verified');
    expect((await db.query<any>('select discord_user_id from arena_private.discord_links where user_id = $1', [EARLY])).rows[0].discord_user_id).toBe(D(1));
  });

  test('a start for a verified account answers already_verified; the table refuses a malformed id', async () => {
    expect((await stateCreate(EARLY, state(40))).status).toBe('already_verified');
    await expect(complete(NOBODY, 'abc', true)).rejects.toThrow(/DISCORD_BAD_LINK/);
    await expect(complete('00000000-0000-4000-8000-000000000999', D(7), true)).rejects.toThrow(/DISCORD_NO_USER/);
  });

  test('the unique index also stops two verified rows with the same Discord id', async () => {
    await expect(db.query(`insert into arena_private.discord_links (user_id, discord_user_id, guild_member, verified_at) values ($1, $2, true, now())`, [NOBODY, D(1)])).rejects.toThrow(/discord_links_verified_discord_uniq/);
    await expect(db.query(`insert into arena_private.discord_links (user_id, discord_user_id, guild_member, verified_at) values ($1, $2, true, null)`, [NOBODY, D(8)])).rejects.toThrow(/discord_links_verified_shape/);
  });
});

describe('when the League opens (reset_at is stamped)', () => {
  beforeAll(async () => {
    await openLeague();
  }, 60_000);

  test('every verified account gets exactly one Gold credit, source discord; the others get nothing', async () => {
    for (const u of [EARLY, EARLY2, NOTYET]) {
      const rows = await credits(u);
      expect(rows.map((r) => [r.kind, r.item_id, r.amount, r.source, r.source_ref]), u).toEqual([['gold', null, 500, 'discord', 'discord-gold']]);
      expect(rows[0].claimed_at).toBeNull();
    }
    for (const u of [CLASH, NOBODY, LATE]) expect(await credits(u), u).toEqual([]);
    expect(await discordRows()).toBe(3);
    expect((await task(EARLY)).reward).toBe('credited');
  });

  test('firing again gives no duplicates', async () => {
    const reset = (await db.query<any>('select reset_at from arena_private.season_goal where id')).rows[0].reset_at;
    expect((await db.query<any>(`select arena_private.grant_discord_credits($1::timestamptz) as r`, [reset])).rows[0].r).toBe(0);
    expect((await db.query<any>(`select arena_private.grant_discord_credits(null) as r`)).rows[0].r).toBe(0);
    expect(await discordRows()).toBe(3);
    await expect(db.query(`insert into arena_private.server_credits (user_id, kind, amount, source, source_ref) values ($1, 'gold', 500, 'discord', 'discord-gold')`, [EARLY])).rejects.toThrow(/server_credits_once/);
  });

  test('an account verified AFTER the opening is credited immediately, once', async () => {
    expect((await complete(LATE, D(3), true)).status).toBe('verified');
    expect((await credits(LATE)).map((r) => [r.amount, r.source_ref])).toEqual([[500, 'discord-gold']]);
    expect((await complete(LATE, D(3), true)).status).toBe('already_verified');
    expect(await credits(LATE)).toHaveLength(1);
    expect(await discordRows()).toBe(4);
    expect(await task(LATE)).toEqual({ linked: true, verified: true, reward: 'credited', reward_amount: 500 });
  });

  test('the player claims the Gold once; the audit counts it so the balance jump never flags him', async () => {
    const got = await claim(EARLY);
    expect(got.map((r) => [r.kind, r.amount, r.source_ref])).toEqual([['gold', 500, 'discord-gold']]);
    expect(await claim(EARLY)).toEqual([]);
    const p = await svc(async () => (await db.query<any>('select public.progress_credits_pending($1) as r', [EARLY])).rows[0].r);
    expect(p.gold).toBe(500);
    // another player cannot claim it
    expect((await credits(EARLY2))[0].claimed_at).toBeNull();
  });

  test('deleting the account removes its link and states', async () => {
    await db.query('delete from auth.users where id = $1', [EARLY2]);
    expect((await db.query<any>('select count(*)::int as n from arena_private.discord_links where user_id = $1', [EARLY2])).rows[0].n).toBe(0);
  });
});

describe('the migration file', () => {
  test('keeps the rollback block and never stores a token column', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0038_discord_task.sql'), 'utf8');
    expect(sql).toMatch(/ROLLBACK/);
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/access_token|refresh_token|client_secret/i);
  });
});
