import { describe, expect, it } from 'vitest';
import { handleWaitlistJoin, handleWaitlistReferrals } from '../waitlist/handler.ts';
import { REFERRAL_ALPHABET, REFERRAL_CODE_RE, generateReferralCode, generateViewKey, hashViewKey, normalizeRefCode, parseJoinBody, parseStatsBody } from '../waitlist/logic.ts';
import { createFakeWaitlistStore } from './fakeWaitlistStore.ts';
import { DEFAULT_TIERS, paidPassCount, emailCanonical } from './referralModel.ts';
import type { Entitlement } from './referralModel.ts';

const ORIGIN = 'https://portal.example.test';
const SECRET = 'a-long-random-test-secret-0123456789';
const DAY = 86_400_000;

function setup() {
  const fake = createFakeWaitlistStore();
  const deps = { allowedOrigins: [ORIGIN], secret: SECRET, store: fake.store };
  let n = 0;
  /** Signs `email` up through the real handler. Every call uses its own IP (and /24) unless one is given. */
  const join = async (email: string, opts: { ref?: string | null; ip?: string } = {}) => {
    n += 1;
    const res = await handleWaitlistJoin(
      new Request('https://x/functions/v1/waitlist-join', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': opts.ip ?? `10.${Math.floor(n / 250)}.${n % 250}.9` },
        body: JSON.stringify({ email, locale: 'pt', consent: true, ref: opts.ref ?? undefined }),
      }),
      deps,
    );
    return { status: res.status, body: (await res.json()) as { ok: boolean; code?: string; key?: string } };
  };
  const stats = async (code: string, key: string) =>
    handleWaitlistReferrals(new Request('https://x/functions/v1/waitlist-referrals', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '198.51.100.20' }, body: JSON.stringify({ code, key }) }), deps);
  const row = (email: string) => fake.rows.find((r) => r.email === email)!;
  let accountSeq = 0;
  /** A confirmed game account with that e-mail. */
  const account = (email: string, confirmed = true) => {
    const id = `00000000-0000-4000-9000-${String(++accountSeq).padStart(12, '0')}`;
    fake.world.accounts.push({ id, email, confirmed });
    return id;
  };
  const snapshot = (userId: string, heroLevel: number, over: Partial<{ verdict: 'ok' | 'flagged' | 'rejected'; createdAtMs: number }> = {}) => {
    fake.world.snapshots.push({ userId, heroLevel, verdict: over.verdict ?? 'ok', createdAtMs: over.createdAtMs ?? fake.world.nowMs });
    fake.processUser(userId); // the trigger on progress_snapshots
  };
  const launch = () => { fake.world.config.launchAtMs = fake.world.nowMs - DAY; };
  const buy = (userId: string, source: Entitlement['source'] = 'stripe', over: Partial<Entitlement> = {}) => {
    const e: Entitlement = { userId, kind: 'adventurer_pass', source, providerRef: `ref-${userId}-${source}`, status: 'active', livemode: true, ...over };
    fake.world.entitlements.push(e);
    fake.processUser(userId); // the trigger on entitlements
    return e;
  };
  return { fake, deps, join, stats, row, account, snapshot, launch, buy };
}

/** An inviter with a confirmed game account, and `count` invited people who each made an account and reached the level. */
async function inviterWith(t: ReturnType<typeof setup>, count: number, level = 10) {
  t.launch();
  const ana = await t.join('ana@example.com');
  const anaId = t.account('ana@example.com');
  const invited: string[] = [];
  for (let i = 0; i < count; i++) {
    const email = `friend${i}@example.com`;
    await t.join(email, { ref: ana.body.code });
    const id = t.account(email);
    if (level > 0) t.snapshot(id, level);
    invited.push(id);
  }
  return { ana, anaId, invited };
}

describe('codes and keys', () => {
  it('a share code is 10 characters from the 32-letter alphabet without I, O, 0 and 1', () => {
    expect(REFERRAL_ALPHABET).toHaveLength(32);
    expect(REFERRAL_ALPHABET).not.toMatch(/[IO01]/);
    for (let i = 0; i < 200; i++) expect(generateReferralCode()).toMatch(REFERRAL_CODE_RE);
  });
  it('every alphabet letter is reached equally often (no modulo bias)', () => {
    const counts = new Map<string, number>();
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (let offset = 0; offset < 256; offset += 10) {
      const code = generateReferralCode((n) => bytes.slice(offset, offset + n).length === n ? bytes.slice(offset, offset + n) : Uint8Array.from({ length: n }, (_, i) => (offset + i) % 256));
      for (const ch of code) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect([...counts.keys()].every((ch) => REFERRAL_ALPHABET.includes(ch))).toBe(true);
    const all = new Map<string, number>();
    for (const b of bytes) all.set(REFERRAL_ALPHABET[b & 31], (all.get(REFERRAL_ALPHABET[b & 31]) ?? 0) + 1);
    expect([...all.values()].every((v) => v === 8)).toBe(true);
  });
  it('20 000 random codes are all different, and the view key is 128 random bits', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(generateReferralCode());
    expect(seen.size).toBe(20_000);
    const keys = new Set(Array.from({ length: 500 }, () => generateViewKey()));
    expect(keys.size).toBe(500);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
  it('a ?ref= code is normalized, and junk is just ignored', () => {
    expect(normalizeRefCode(' abcdefgh23 ')).toBe('ABCDEFGH23');
    for (const bad of ['', 'ABCDEFGH2', 'ABCDEFGH234', 'ABCDEFGHI0', 'ABCDEFGHO1', '<script>', null, 5, undefined]) expect(normalizeRefCode(bad), String(bad)).toBeNull();
    expect(parseJoinBody({ email: 'a@b.co', consent: true, ref: 'zzzzzzzzzz' })).toMatchObject({ kind: 'ok', input: { refCode: 'ZZZZZZZZZZ' } });
    expect(parseJoinBody({ email: 'a@b.co', consent: true, ref: 'nope' })).toMatchObject({ kind: 'ok', input: { refCode: null } });
    expect(parseStatsBody({ code: 'abcdefgh23', key: 'A'.repeat(32) })).toEqual({ kind: 'ok', code: 'ABCDEFGH23', key: 'a'.repeat(32) });
    expect(parseStatsBody({ code: 'abcdefgh23', key: 'short' })).toEqual({ kind: 'invalid' });
    expect(parseStatsBody(null)).toEqual({ kind: 'invalid' });
  });
  it('a colliding random code is retried, and gives up with 503 only after several collisions', async () => {
    const t = setup();
    t.fake.world.collisions = 2;
    const ok = await t.join('ana@example.com');
    expect(ok.status).toBe(200);
    expect(t.fake.rows).toHaveLength(1);
    t.fake.world.collisions = 4;
    expect((await t.join('bia@example.com')).status).toBe(503);
  });
});

describe('who invited whom', () => {
  it('records the inviter on a new sign-up, and shows the sharer a working code', async () => {
    const t = setup();
    const ana = await t.join('ana@example.com');
    const bia = await t.join('bia@example.com', { ref: ana.body.code });
    expect(t.row('bia@example.com')).toMatchObject({ referredBy: t.row('ana@example.com').id, ignored: null });
    expect(bia.body.code).not.toBe(ana.body.code);
  });
  it('never oneself: the same e-mail, an alias of it, or the same IP within the window', async () => {
    const t = setup();
    const ana = await t.join('a.na+x@gmail.com', { ip: '203.0.113.5' });
    expect(emailCanonical('a.na+x@gmail.com')).toBe('ana@gmail.com');
    await t.join('ana@googlemail.com', { ref: ana.body.code });
    expect(t.row('ana@googlemail.com')).toMatchObject({ referredBy: null, ignored: 'self_email' });
    await t.join('other@example.com', { ref: ana.body.code, ip: '203.0.113.5' });
    expect(t.row('other@example.com')).toMatchObject({ referredBy: null, ignored: 'self_ip' });
    // a second fake from the same IP is caught through the first referral too
    const bia = await t.join('bia@example.com', { ip: '198.51.100.1' });
    await t.join('c1@example.com', { ref: bia.body.code, ip: '198.51.100.99' });
    t.fake.world.nowMs += 3_600_000;
    await t.join('c2@example.com', { ref: bia.body.code, ip: '198.51.100.99' });
    expect(t.row('c1@example.com').referredBy).toBe(t.row('bia@example.com').id);
    expect(t.row('c2@example.com')).toMatchObject({ referredBy: null, ignored: 'self_ip' });
    // after the window the same IP is accepted again
    t.fake.world.nowMs += 2 * DAY;
    await t.join('c3@example.com', { ref: bia.body.code, ip: '198.51.100.99' });
    expect(t.row('c3@example.com').referredBy).toBe(t.row('bia@example.com').id);
  });
  it('an unknown or malformed code is not an error: the sign-up works and nothing is credited', async () => {
    const t = setup();
    expect((await t.join('x@example.com', { ref: 'ZZZZZZZZZZ' })).status).toBe(200);
    expect(t.row('x@example.com')).toMatchObject({ referredBy: null, ignored: 'unknown_code' });
    expect((await t.join('y@example.com', { ref: 'bad' })).status).toBe(200);
    expect(t.row('y@example.com')).toMatchObject({ referredBy: null, ignored: null });
  });
  it('one inviter per e-mail: signing up again through somebody else changes nothing', async () => {
    const t = setup();
    const ana = await t.join('ana@example.com');
    const bia = await t.join('bia@example.com');
    await t.join('cris@example.com', { ref: ana.body.code });
    const again = await t.join('cris@example.com', { ref: bia.body.code });
    expect(again.status).toBe(200);
    expect(t.row('cris@example.com').referredBy).toBe(t.row('ana@example.com').id);
    expect(t.fake.rows).toHaveLength(3);
  });
});

describe('qualification: a game account with the same e-mail and hero level 10, after launch', () => {
  it('nothing qualifies before the launch date is set', async () => {
    const t = setup();
    const ana = await t.join('ana@example.com');
    t.account('ana@example.com');
    await t.join('bia@example.com', { ref: ana.body.code });
    const bia = t.account('bia@example.com');
    t.snapshot(bia, 40);
    expect(t.row('bia@example.com').qualified).toBe(false);
    expect(t.fake.world.granted).toHaveLength(0);
    t.launch();
    t.fake.sweep();
    expect(t.row('bia@example.com').qualified).toBe(true);
  });
  it('level 9, a flagged or rejected snapshot, an unconfirmed e-mail, an old snapshot and another e-mail do not qualify', async () => {
    const t = setup();
    t.launch();
    const ana = await t.join('ana@example.com');
    for (const name of ['lvl9', 'flagged', 'unconfirmed', 'old', 'other']) await t.join(`${name}@example.com`, { ref: ana.body.code });
    t.snapshot(t.account('lvl9@example.com'), 9);
    t.snapshot(t.account('flagged@example.com'), 50, { verdict: 'flagged' });
    t.snapshot(t.account('flagged@example.com'), 50, { verdict: 'rejected' });
    t.snapshot(t.account('unconfirmed@example.com', false), 50);
    t.snapshot(t.account('old@example.com'), 50, { createdAtMs: t.fake.world.config.launchAtMs! - 1 });
    t.snapshot(t.account('someone-else@example.com'), 50);
    for (const name of ['lvl9', 'flagged', 'unconfirmed', 'old', 'other']) expect(t.row(`${name}@example.com`).qualified, name).toBe(false);
    // and exactly level 10 does
    t.snapshot(t.account('exact@example.com'), 10);
    await t.join('exact@example.com', { ref: ana.body.code });
    t.fake.sweep();
    expect(t.row('exact@example.com').qualified).toBe(true);
  });
  it('the inviter\'s first reward (title Recrutador) needs HIS OWN confirmed account', async () => {
    const t = setup();
    t.launch();
    const ana = await t.join('ana@example.com');
    await t.join('bia@example.com', { ref: ana.body.code });
    t.snapshot(t.account('bia@example.com'), 10);
    expect(t.fake.world.granted).toHaveLength(0); // ana has no account yet
    const anaId = t.account('ana@example.com');
    t.fake.sweep(); // the periodic job catches up
    expect(t.fake.world.granted).toEqual([{ userId: anaId, metric: 'qualified', minCount: 1, kind: 'title', rewardRef: 'recruiter' }]);
  });
  it('three aliases of the same person count once; so does the inviter\'s own alias', async () => {
    const t = setup();
    t.launch();
    const ana = await t.join('ana@example.com');
    for (const email of ['bia@gmail.com', 'b.ia+1@gmail.com', 'bia+2@googlemail.com', 'ana+me@example.com']) {
      await t.join(email, { ref: ana.body.code });
      t.snapshot(t.account(email), 10);
    }
    expect(t.fake.countsOf(t.row('ana@example.com')).qualified).toBe(1);
  });
});

describe('rewards: tiers, idempotent, edited in one table', () => {
  it('1 qualified -> title, 3 -> portrait frame, 25 -> legend title, each exactly once, however often it runs', async () => {
    const t = setup();
    const { anaId } = await inviterWith(t, 1);
    expect(t.fake.world.granted.map((g) => g.rewardRef)).toEqual(['recruiter']);
    const code = t.row('ana@example.com').refCode;
    const invite = async (i: number) => {
      const email = `friend${i}@example.com`;
      await t.join(email, { ref: code });
      t.snapshot(t.account(email), 10);
    };
    await invite(1);
    await invite(2);
    expect(t.fake.world.granted.map((g) => g.rewardRef)).toEqual(['recruiter', 'portrait_frame_recruiter']);
    for (let i = 0; i < 3; i++) t.fake.sweep();
    expect(t.fake.world.granted.filter((g) => g.userId === anaId)).toHaveLength(2);
    for (let i = 3; i < 25; i++) await invite(i);
    expect(t.fake.countsOf(t.row('ana@example.com')).qualified).toBe(25);
    expect(t.fake.world.granted.map((g) => g.rewardRef)).toEqual(['recruiter', 'portrait_frame_recruiter', 'recruitment_legend']);
    for (let i = 0; i < 3; i++) t.fake.sweep();
    expect(t.fake.world.granted).toHaveLength(3);
  });
  it('the owner can change a tier in the table; a reward already granted stays', async () => {
    const t = setup();
    const { anaId } = await inviterWith(t, 2);
    expect(t.fake.world.granted.map((g) => g.rewardRef)).toEqual(['recruiter']);
    t.fake.world.tiers.find((x) => x.kind === 'cosmetic')!.minCount = 2;
    t.fake.sweep();
    expect(t.fake.world.granted.map((g) => g.rewardRef)).toEqual(['recruiter', 'portrait_frame_recruiter']);
    t.fake.world.tiers.find((x) => x.kind === 'title' && x.minCount === 1)!.active = false;
    t.fake.sweep();
    expect(t.fake.world.granted.filter((g) => g.userId === anaId)).toHaveLength(2);
    expect(DEFAULT_TIERS.map((x) => [x.metric, x.minCount, x.kind])).toEqual([['qualified', 1, 'title'], ['qualified', 3, 'cosmetic'], ['paying', 10, 'pass'], ['qualified', 25, 'title']]);
  });
});

describe('the free Adventurer Pass: only for 10 invited people who BOUGHT the Pass', () => {
  it('ten qualified friends who did not buy give no Pass', async () => {
    const t = setup();
    await inviterWith(t, 12);
    expect(t.fake.world.entitlements).toHaveLength(0);
    expect(t.fake.world.granted.some((g) => g.kind === 'pass')).toBe(false);
  });

  it('counts only active, paid, livemode purchases: grant, referral, test mode, refunded and revoked do not count', async () => {
    const t = setup();
    const { ana, invited } = await inviterWith(t, 8, 0);
    expect(ana.body.ok).toBe(true);
    const row = t.row('ana@example.com');
    const [a, b, c, d, e, f, g, h] = invited;
    t.buy(a, 'stripe');
    t.buy(b, 'mercadopago');
    t.buy(c, 'crypto_sol');
    t.buy(d, 'grant');
    t.buy(e, 'referral');
    t.buy(f, 'stripe', { livemode: false });
    t.buy(g, 'stripe', { status: 'refunded' });
    t.buy(h, 'crypto_bsc', { status: 'revoked' });
    expect(t.fake.countsOf(row).paying).toBe(3);
  });

  it('on the 10th buyer the inviter gets ONE free Pass (source referral, livemode true), idempotently', async () => {
    const t = setup();
    const { anaId, invited } = await inviterWith(t, 10, 0);
    for (const id of invited.slice(0, 9)) t.buy(id);
    expect(t.fake.countsOf(t.row('ana@example.com')).paying).toBe(9);
    expect(t.fake.world.entitlements.filter((x) => x.userId === anaId)).toHaveLength(0);
    t.buy(invited[9], 'crypto_sol');
    const mine = t.fake.world.entitlements.filter((x) => x.userId === anaId);
    expect(mine).toEqual([{ userId: anaId, kind: 'adventurer_pass', source: 'referral', providerRef: `referral-${anaId}`, status: 'active', livemode: true }]);
    expect(t.fake.world.granted.filter((x) => x.kind === 'pass')).toHaveLength(1);
    for (let i = 0; i < 3; i++) t.fake.sweep();
    t.buy(invited[0], 'mercadopago', { providerRef: 'again' }); // another event for the same people
    expect(t.fake.world.entitlements.filter((x) => x.userId === anaId)).toHaveLength(1);
    expect(t.fake.world.granted.filter((x) => x.kind === 'pass')).toHaveLength(1);
  });

  it('a refund or dispute later lowers the count, and a Pass already granted stays', async () => {
    const t = setup();
    const { anaId, invited } = await inviterWith(t, 10, 0);
    const purchases = invited.map((id) => t.buy(id));
    expect(t.fake.world.entitlements.some((x) => x.userId === anaId && x.source === 'referral')).toBe(true);
    purchases[3].status = 'refunded';
    purchases[4].status = 'revoked';
    t.fake.sweep();
    expect(t.fake.countsOf(t.row('ana@example.com')).paying).toBe(8);
    expect(t.fake.world.entitlements.some((x) => x.userId === anaId && x.source === 'referral' && x.status === 'active')).toBe(true);
    expect(t.fake.world.granted.some((x) => x.kind === 'pass')).toBe(true);
  });

  it('a refund BEFORE the 10th purchase keeps the count honest: the Pass waits for a real 10', async () => {
    const t = setup();
    const { anaId, invited } = await inviterWith(t, 10, 0);
    const purchases = invited.slice(0, 9).map((id) => t.buy(id));
    purchases[0].status = 'refunded';
    t.buy(invited[9]);
    expect(t.fake.countsOf(t.row('ana@example.com')).paying).toBe(9);
    expect(t.fake.world.entitlements.some((x) => x.userId === anaId)).toBe(false);
  });

  it('an inviter who already holds a Pass gets no second one and the tier stays open', async () => {
    const t = setup();
    const { anaId, invited } = await inviterWith(t, 10, 0);
    const own = t.buy(anaId, 'stripe');
    for (const id of invited) t.buy(id);
    expect(t.fake.world.entitlements.filter((x) => x.userId === anaId)).toHaveLength(1);
    expect(t.fake.world.granted.some((x) => x.kind === 'pass')).toBe(false);
    own.status = 'refunded'; // his own Pass is refunded: the next sweep delivers the one he earned
    t.fake.sweep();
    expect(t.fake.world.entitlements.filter((x) => x.userId === anaId && x.source === 'referral')).toHaveLength(1);
  });

  it('the free Pass never counts toward the paid Pass goal or the public meter', async () => {
    const t = setup();
    const { anaId, invited } = await inviterWith(t, 10, 0);
    for (const id of invited) t.buy(id);
    const all = t.fake.world.entitlements;
    expect(all.filter((x) => x.source === 'referral')).toHaveLength(1);
    expect(paidPassCount(all)).toBe(10); // the ten purchases, not eleven
    expect(paidPassCount(all.filter((x) => x.userId === anaId))).toBe(0);
    expect(paidPassCount([{ userId: 'u', kind: 'adventurer_pass', source: 'referral', providerRef: 'r', status: 'active', livemode: true }])).toBe(0);
    expect(paidPassCount([{ userId: 'u', kind: 'adventurer_pass', source: 'grant', providerRef: 'r', status: 'active', livemode: true }])).toBe(0);
  });
});

describe('the counters shown to the person right after signing up', () => {
  it('right code + right key: the two counters; wrong key, made-up key or unknown code: zeros, the same shape', async () => {
    const t = setup();
    t.launch();
    const ana = await t.join('ana@example.com');
    await t.join('bia@example.com', { ref: ana.body.code });
    t.snapshot(t.account('bia@example.com'), 10);
    const right = await (await t.stats(ana.body.code!, ana.body.key!)).json();
    expect(right).toEqual({ ok: true, qualified: 1, paying: 0, passGoal: 10 });
    // somebody types ana's address: they get her PUBLIC code and a throw-away key, which shows nothing of hers
    const stranger = await t.join('ana@example.com');
    expect(stranger.body.code).toBe(ana.body.code);
    const decoy = await (await t.stats(stranger.body.code!, stranger.body.key!)).json();
    expect(decoy).toEqual({ ok: true, qualified: 0, paying: 0, passGoal: 10 });
    const unknown = await (await t.stats('ZZZZZZZZZZ', 'a'.repeat(32))).json();
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(right).sort());
    // a brand-new sign-up has zeros, exactly like the decoy: nothing tells them apart
    const fresh = await t.join('fresh@example.com');
    expect(await (await t.stats(fresh.body.code!, fresh.body.key!)).json()).toEqual(decoy);
  });
  it('there is no lookup by e-mail, bad bodies are refused, and the view key is stored hashed', async () => {
    const t = setup();
    const res = await t.stats('ABCDEFGH23', 'short');
    expect(res.status).toBe(400);
    const byEmail = await handleWaitlistReferrals(new Request('https://x/', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'ana@example.com' }) }), t.deps);
    expect(byEmail.status).toBe(400);
    const ana = await t.join('ana@example.com');
    expect(t.row('ana@example.com').viewKeyHash).toBe(await hashViewKey(SECRET, ana.body.key!));
    expect(t.row('ana@example.com').viewKeyHash).not.toContain(ana.body.key!);
    expect(JSON.stringify(t.fake.rows)).not.toContain(ana.body.key!);
  });
  it('is rate-limited', async () => {
    const t = setup();
    let last = 200;
    for (let i = 0; i < 121; i++) last = (await t.stats('ABCDEFGH23', 'a'.repeat(32))).status;
    expect(last).toBe(429);
  });
});
