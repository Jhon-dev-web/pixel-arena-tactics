import { describe, expect, it } from 'vitest';
import { ITEM_BOUNDS } from '../items/bounds.ts';
import { parseBindBody, parseMintBody } from '../items/handler.ts';
import { FORGE_TEMPLATES, HUNT_ZONES, POUCH_TABLE } from '../items/tables.ts';
import { DAY, FakeItemStore, USER_A, USER_B, makeServer } from './fakeItemStore.ts';

// The mint-item / bind-item handlers over an in-memory store that behaves like migration 0010. No Deno, no Supabase: the same modules the Edge Functions import.

const REQ = (n: number): string => `req-${String(n).padStart(8, '0')}`;
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
/** An rng that answers `values` in turn and then 0.99 (a miss everywhere). */
const scripted = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.99);
};
const OLD_ACCOUNT = Date.UTC(2026, 3, 1); // plenty of days old: no age gate in the way

function oldServer(rng: () => number = seeded(1)) {
  const s = makeServer({ rng });
  s.store.accountCreatedMs = OLD_ACCOUNT;
  return s;
}

describe('who is asking: the user id comes from the JWT and from nowhere else', () => {
  it('refuses an unauthenticated call before touching the store', async () => {
    const s = oldServer();
    const r = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm' }, null);
    expect(r.status).toBe(401);
    expect(s.store.requests.size).toBe(0);
    expect(s.store.buckets.size).toBe(0);
  });

  it('ignores any user id in the body: the certificate belongs to the caller of the JWT', async () => {
    // the rarity roll 0.95 is epic: 0.63 + 0.25 = 0.88 <= 0.95 < 0.98
    const s2 = oldServer(scripted(0.95, 0.1, 0.1, 0.1, 0.1));
    const r = await s2.mint({ kind: 'forge', requestId: REQ(2), templateId: 'iron_helm', userId: USER_B, user_id: USER_B }, USER_A);
    expect(r.status).toBe(200);
    expect(s2.store.certs).toHaveLength(1);
    expect(s2.store.certs[0].userId).toBe(USER_A);
  });

  it('bind-item cannot touch another account\'s certificate, and does not say whether the id exists', async () => {
    const s = oldServer(scripted(0.95, 0.1, 0.1, 0.1, 0.1));
    const minted = await s.mint({ kind: 'forge', requestId: REQ(3), templateId: 'iron_helm' });
    const id = (minted.body.item as { certificate: { id: string } }).certificate.id;
    const other = await s.bind({ action: 'bind', certificateIds: [id] }, USER_B);
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ ok: false, reason: 'not_found' });
    expect(s.store.certs[0].bound).toBe(false);
  });
});

describe('parsing', () => {
  it('rejects malformed bodies', () => {
    expect(parseMintBody(null)).toBeNull();
    expect(parseMintBody({ kind: 'forge', templateId: 'iron_helm' })).toBeNull(); // no request id
    expect(parseMintBody({ kind: 'forge', requestId: 'short', templateId: 'iron_helm' })).toBeNull();
    expect(parseMintBody({ kind: 'nope', requestId: REQ(1) })).toBeNull();
    expect(parseMintBody({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: -5 })).toBeNull();
    expect(parseMintBody({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: Number.NaN })).toBeNull();
    expect(parseMintBody({ kind: 'boss_drop', requestId: REQ(1), stages: [] })).toBeNull();
    expect(parseMintBody({ kind: 'boss_drop', requestId: REQ(1), stages: [25.5] })).toBeNull();
    expect(parseMintBody({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm', burnCertificateIds: ['not-a-uuid'] })).toBeNull();
    expect(parseBindBody({ action: 'hack', certificateIds: [USER_A] })).toBeNull();
    expect(parseBindBody({ action: 'bind', certificateIds: [] })).toBeNull();
    expect(parseBindBody({ action: 'bind', certificateIds: [USER_A, USER_A] })).toBeNull();
  });

  it('accepts the four mint kinds', () => {
    expect(parseMintBody({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm', seal: true })).toMatchObject({ kind: 'forge', seal: true });
    expect(parseMintBody({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: 1000 })).toMatchObject({ kind: 'hunt_drop' });
    expect(parseMintBody({ kind: 'boss_drop', requestId: REQ(1), stages: [25, 125] })).toMatchObject({ kind: 'boss_drop' });
    expect(parseMintBody({ kind: 'pouch', requestId: REQ(1), pouchId: 'gold_pouch_s' })).toMatchObject({ kind: 'pouch' });
  });

  it('a bad body is a 400 and costs nothing', async () => {
    const s = oldServer();
    const r = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'does_not_exist' });
    expect(r.status).toBe(400);
    const r2 = await s.mint({ kind: 'forge' });
    expect(r2.status).toBe(400);
    expect(s.store.buckets.size).toBe(0);
    expect(s.rngCalls()).toBe(0);
  });
});

describe('forge: the server rolls, the client only asks', () => {
  it('rolls the rarity and the substats itself and certifies an Epic', async () => {
    const s = oldServer(scripted(0.95, 0, 0, 0, 0, 0)); // 0.95 -> epic, then the substat dice
    const r = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm' });
    expect(r.status).toBe(200);
    const item = (r.body as { item: { rarity: string; substats: unknown[]; bound: boolean; certificate: { id: string; kind: string; status: string; bound: boolean; tier: number } } }).item;
    expect(item.rarity).toBe('epic');
    expect(item.substats).toHaveLength(2);
    expect(item.bound).toBe(false);
    expect(item.certificate).toMatchObject({ kind: 'gear', status: 'held', bound: false, tier: FORGE_TEMPLATES.iron_helm.tier });
    expect(s.store.events.filter((e) => e.event === 'mint')).toHaveLength(1);
  });

  it('certifies a Legendary with three substats', async () => {
    const s = oldServer(scripted(0.99, 0, 0, 0, 0, 0, 0));
    const r = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm' });
    const item = (r.body as { item: { rarity: string; substats: unknown[] } }).item;
    expect(item.rarity).toBe('legendary');
    expect(item.substats).toHaveLength(3);
  });

  it('a Common or a Rare is returned (the roll still comes from the server) but gets no certificate', async () => {
    const s = oldServer(scripted(0.1, 0.7, 0, 0));
    const common = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm' });
    const rare = await s.mint({ kind: 'forge', requestId: REQ(2), templateId: 'iron_helm' });
    expect((common.body.item as { rarity: string; certificate: unknown }).rarity).toBe('common');
    expect((common.body.item as { certificate: unknown }).certificate).toBeNull();
    expect((rare.body.item as { rarity: string }).rarity).toBe('rare');
    expect((rare.body.item as { certificate: unknown }).certificate).toBeNull();
    expect(s.store.certs).toHaveLength(0);
    expect(s.rngCalls()).toBeGreaterThan(0);
  });

  it('the client cannot choose the outcome: extra fields in the body do nothing', async () => {
    const s = oldServer(scripted(0.1, 0, 0)); // a common roll
    const r = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm', rarity: 'legendary', substats: [{ type: 'critRate', value: 99 }] });
    expect((r.body.item as { rarity: string }).rarity).toBe('common');
  });

  it('a same-request retry returns the SAME answer and spends no second token and no second roll', async () => {
    const s = oldServer(scripted(0.95, 0, 0, 0, 0, 0));
    const first = await s.mint({ kind: 'forge', requestId: REQ(7), templateId: 'iron_helm' });
    const calls = s.rngCalls();
    const bucketsBefore = JSON.stringify([...s.store.buckets]);
    const second = await s.mint({ kind: 'forge', requestId: REQ(7), templateId: 'iron_helm' });
    expect(second.body).toEqual(first.body);
    expect(s.rngCalls()).toBe(calls);
    expect(JSON.stringify([...s.store.buckets])).toBe(bucketsBefore);
    expect(s.store.certs).toHaveLength(1);
    // another account reusing the id gets its own roll
    const other = await s.mint({ kind: 'forge', requestId: REQ(7), templateId: 'iron_helm' }, USER_B);
    expect(other.status).toBe(200);
    expect(s.rngCalls()).toBeGreaterThan(calls);
  });

  it('the Blacksmith\'s Seal: Pass owners only, Epic or better, born bound, never certified', async () => {
    const s = oldServer(scripted(0.5, 0, 0, 0, 0, 0));
    const noPass = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm', seal: true });
    expect(noPass.status).toBe(403);
    expect(noPass.body).toEqual({ ok: false, reason: 'seal_pass_required' });
    expect(s.store.flags.map((f) => f.code)).toContain('SEAL_WITHOUT_PASS');
    expect(s.store.certs).toHaveLength(0);
    s.store.pass = true;
    const r = await s.mint({ kind: 'forge', requestId: REQ(2), templateId: 'iron_helm', seal: true });
    const item = (r.body as { item: { rarity: string; bound: boolean; certificate: unknown } }).item;
    expect(['epic', 'legendary']).toContain(item.rarity);
    expect(item.bound).toBe(true);
    expect(item.certificate).toBeNull();
    expect(s.store.certs).toHaveLength(0);
  });

  it('the Seal has its own limit (a season of seals, with the margin)', async () => {
    const s = oldServer(seeded(5));
    s.store.pass = true;
    const results: number[] = [];
    for (let i = 0; i < ITEM_BOUNDS.sealCapacity + 3; i++) results.push((await s.mint({ kind: 'forge', requestId: REQ(100 + i), templateId: 'bronze_dagger', seal: true })).status);
    expect(results.filter((x) => x === 200)).toHaveLength(ITEM_BOUNDS.sealCapacity);
    expect(results.filter((x) => x === 429)).toHaveLength(3);
    expect(s.store.flags.some((f) => f.code === 'LIMIT_SEAL')).toBe(true);
  });

  it('burns the certified ingredients of the recipe in the same atomic step', async () => {
    const s = oldServer(scripted(0.95, 0, 0, 0, 0, 0.95, 0, 0, 0, 0));
    const a = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'bronze_dagger' });
    const ingredient = (a.body.item as { certificate: { id: string } }).certificate.id;
    const b = await s.mint({ kind: 'forge', requestId: REQ(2), templateId: 'iron_short_sword', burnCertificateIds: [ingredient] });
    expect(b.status).toBe(200);
    expect(s.store.certs.find((c) => c.id === ingredient)?.status).toBe('burned');
    // burning it a second time (or burning someone else's) refuses the whole forge and mints nothing
    const before = s.store.certs.length;
    const again = await s.mint({ kind: 'forge', requestId: REQ(3), templateId: 'iron_short_sword', burnCertificateIds: [ingredient] });
    expect(again.body).toEqual({ ok: false, reason: 'burn_not_held' });
    expect(s.store.certs).toHaveLength(before);
  });
});

describe('plausibility limits: refused with no roll, and the account is flagged', () => {
  it('the forge rate is a bucket: the capacity goes through, the next one is refused without a roll', async () => {
    const s = oldServer(seeded(11));
    const tier = FORGE_TEMPLATES.iron_helm.tier;
    const cap = ITEM_BOUNDS.forgeCapacity(tier);
    let ok = 0;
    for (let i = 0; i < cap; i++) if ((await s.mint({ kind: 'forge', requestId: REQ(i), templateId: 'iron_helm' })).status === 200) ok++;
    // the cert cap may stop a lucky run early; what matters is that nothing past the forge capacity ever passes
    expect(ok).toBeLessThanOrEqual(cap);
    const callsBefore = s.rngCalls();
    const over = await s.mint({ kind: 'forge', requestId: REQ(9999), templateId: 'iron_helm' });
    expect(over.status).toBe(429);
    expect(['forge_rate', 'cert_day_limit']).toContain((over.body as { reason: string }).reason);
    expect(s.rngCalls()).toBe(callsBefore); // refused BEFORE the roll
    expect(s.store.flags.length).toBeGreaterThan(0);
  });

  it('atomic under parallel calls: 40 at once never pass more than the bucket holds', async () => {
    const s = oldServer(() => 0.1); // always a Common: the daily cap is not what stops them
    const tier = FORGE_TEMPLATES.iron_helm.tier;
    const cap = ITEM_BOUNDS.forgeCapacity(tier);
    const calls = Array.from({ length: cap + 40 }, (_, i) => s.mint({ kind: 'forge', requestId: REQ(i), templateId: 'iron_helm' }));
    const done = await Promise.all(calls);
    expect(done.filter((d) => d.status === 200)).toHaveLength(cap);
    expect(done.filter((d) => d.status === 429)).toHaveLength(40);
    expect(s.store.requests.size).toBe(cap);
  });

  it('the bucket refills with the server clock', async () => {
    const s = oldServer(() => 0.1);
    const tier = FORGE_TEMPLATES.iron_helm.tier;
    const cap = ITEM_BOUNDS.forgeCapacity(tier);
    for (let i = 0; i < cap; i++) await s.mint({ kind: 'forge', requestId: REQ(i), templateId: 'iron_helm' });
    expect((await s.mint({ kind: 'forge', requestId: REQ(5000), templateId: 'iron_helm' })).status).toBe(429);
    s.store.nowMs += (1 / ITEM_BOUNDS.forgeRatePerHour(tier)) * 3_600_000 * 1.01; // one piece of supply later
    expect((await s.mint({ kind: 'forge', requestId: REQ(5001), templateId: 'iron_helm' })).status).toBe(200);
    expect((await s.mint({ kind: 'forge', requestId: REQ(5002), templateId: 'iron_helm' })).status).toBe(429);
  });

  it('a brand-new account starts with only what its age could have earned', async () => {
    const s = makeServer({ rng: () => 0.1 });
    s.store.accountCreatedMs = s.store.nowMs - 2 * 3_600_000; // two hours old
    const tier = FORGE_TEMPLATES.bronze_dagger.tier;
    const earned = Math.floor(ITEM_BOUNDS.forgeRatePerHour(tier) * 2);
    let ok = 0;
    for (let i = 0; i < earned + 5; i++) if ((await s.mint({ kind: 'forge', requestId: REQ(i), templateId: 'bronze_dagger' })).status === 200) ok++;
    expect(ok).toBe(earned);
  });

  it('after the league reset the clock restarts: an old account is as new as the League', async () => {
    const s = makeServer({ rng: () => 0.1 });
    s.store.accountCreatedMs = OLD_ACCOUNT;
    s.store.resetMs = s.store.nowMs - 3_600_000; // the League opened an hour ago
    const tier = FORGE_TEMPLATES.bronze_dagger.tier;
    const earned = Math.floor(ITEM_BOUNDS.forgeRatePerHour(tier) * 1);
    let ok = 0;
    for (let i = 0; i < earned + 5; i++) if ((await s.mint({ kind: 'forge', requestId: REQ(i), templateId: 'bronze_dagger' })).status === 200) ok++;
    expect(ok).toBe(earned);
  });

  it('a piece the fastest hero cannot own yet is refused: a day-old account asking for tier 6', async () => {
    const s = makeServer({ rng: () => 0.99 });
    s.store.accountCreatedMs = s.store.nowMs - DAY;
    const r = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'abyssal_greatblade' });
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ ok: false, reason: 'too_early' });
    expect(s.store.flags.map((f) => f.code)).toContain('FORGE_TOO_EARLY');
    expect(s.rngCalls()).toBe(0);
  });

  it('the daily cap of certified Epic / Legendary: the issue is refused (the roll is thrown away unseen) and flagged', async () => {
    const s = oldServer(() => 0.99); // legendary every time
    const tier = FORGE_TEMPLATES.iron_helm.tier;
    const cap = ITEM_BOUNDS.certDayCap(tier);
    const statuses: number[] = [];
    for (let i = 0; i < cap + 2; i++) statuses.push((await s.mint({ kind: 'forge', requestId: REQ(i), templateId: 'iron_helm' })).status);
    expect(statuses.filter((x) => x === 200)).toHaveLength(cap);
    expect(s.store.certs).toHaveLength(cap);
    expect(s.store.flags.some((f) => f.code === 'LIMIT_CERT_DAY')).toBe(true);
    // a day later the cap has slid
    s.store.nowMs += DAY + 1000;
    expect((await s.mint({ kind: 'forge', requestId: REQ(777), templateId: 'iron_helm' })).status).toBe(200);
  });
});

describe('hunting unique drops: rolled by the server, bounded by server-observed time', () => {
  const glade = HUNT_ZONES.find((z) => z.id === 'demon_glade')!;

  it('rolls with the zone\'s chances and certifies every unique', async () => {
    const s = oldServer(() => 0); // every dice is a hit
    const r = await s.mint({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: 16_000 }); // 16 s: 0.996 of a roll -> 1 with a rng that always rounds up
    expect(r.status).toBe(200);
    const body = r.body as { items: { templateId: string; certificate: { kind: string; source: string } }[]; rolls: number };
    expect(body.rolls).toBe(1);
    expect(body.items).toHaveLength(glade.uniques.length);
    for (const it of body.items) {
      expect(glade.uniques.map((u) => u.itemId)).toContain(it.templateId);
      expect(it.certificate).toMatchObject({ kind: 'unique', source: 'hunt_drop' });
    }
  });

  it('a made-up duration is paid only as far as the server clock allows, and the excess is flagged', async () => {
    const s = oldServer(() => 0.99);
    s.store.accountCreatedMs = s.store.nowMs - 3 * DAY; // old enough for the glade, young for any bigger claim
    const first = await s.mint({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: 100 * 3_600_000 });
    expect(first.status).toBe(200);
    expect((first.body as { rolls: number }).rolls).toBe(ITEM_BOUNDS.huntCapacitySeconds / 3600 * glade.rollsPerHour); // capped at the Pass storage (10 h)
    // asking again straight away: the 10 hours are spent, the clock has not moved
    const second = await s.mint({ kind: 'hunt_drop', requestId: REQ(2), zoneId: 'demon_glade', durationMs: 5 * 3_600_000 });
    expect((second.body as { rolls: number }).rolls).toBe(0);
    expect(s.store.flags.map((f) => f.code)).toContain('HUNT_TIME_EXCESS');
  });

  it('a claim cannot be split to get the time twice: the bucket is the same', async () => {
    const s = oldServer(() => 0.99);
    s.store.accountCreatedMs = s.store.nowMs - 3 * DAY;
    s.store.nowMs += 1; // keep ms-exact math simple
    const total = ITEM_BOUNDS.huntCapacitySeconds / 3600;
    let rolls = 0;
    for (let i = 0; i < 6; i++) rolls += (await s.mint({ kind: 'hunt_drop', requestId: REQ(i), zoneId: 'demon_glade', durationMs: 6 * 3_600_000 })).body.rolls as number;
    expect(rolls).toBeLessThanOrEqual(Math.ceil(total * glade.rollsPerHour) + 6);
  });

  it('an unknown zone is a bad request; a zone the fastest hero cannot reach yet is refused', async () => {
    const s = makeServer({ rng: () => 0.99 });
    s.store.accountCreatedMs = s.store.nowMs - 2 * DAY;
    expect((await s.mint({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'nowhere', durationMs: 1000 })).status).toBe(400);
    const r = await s.mint({ kind: 'hunt_drop', requestId: REQ(2), zoneId: 'blood_abyss', durationMs: 3_600_000 });
    expect(r.body).toEqual({ ok: false, reason: 'too_early' });
    expect(s.store.flags.map((f) => f.code)).toContain('HUNT_ZONE_TOO_EARLY');
  });

  it('the luck a client claims is clamped to what Sorte Grande can give', async () => {
    const lowLuck = oldServer(seeded(3));
    const hugeLuck = oldServer(seeded(3));
    const a = await lowLuck.mint({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: 3_600_000, luck: 1.5 });
    const b = await hugeLuck.mint({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: 3_600_000, luck: 1e9 });
    expect(b.body).toEqual(a.body); // same stream, same answer: 1e9 was clamped to 1.5
  });

  it('the daily cap of certified uniques holds', async () => {
    const s = oldServer(() => 0);
    const first = await s.mint({ kind: 'hunt_drop', requestId: REQ(1), zoneId: 'demon_glade', durationMs: 3_600_000 });
    expect(first.status).toBe(429); // 224 rolls x 2 uniques of certain drops is far past the cap
    expect(first.body).toEqual({ ok: false, reason: 'cert_day_limit' });
    expect(s.store.certs).toHaveLength(0);
    expect(s.store.flags.map((f) => f.code)).toContain('LIMIT_CERT_DAY');
  });
});

describe('boss unique drops', () => {
  it('rolls the biome boss pool and certifies the drops', async () => {
    const s = oldServer(() => 0);
    const r = await s.mint({ kind: 'boss_drop', requestId: REQ(1), stages: [50] });
    expect(r.status).toBe(200);
    const items = (r.body as { items: { templateId: string }[] }).items.map((i) => i.templateId).sort();
    expect(items).toEqual(['warchief_gauntlets', 'warden_bulwark']);
  });

  it('depth bosses drop from the pool of the boss in turn', async () => {
    const s = oldServer(() => 0);
    const r = await s.mint({ kind: 'boss_drop', requestId: REQ(1), stages: [110] }); // depth 10 -> the first pool (25)
    expect((r.body as { items: { templateId: string }[] }).items.map((i) => i.templateId)).toEqual(['goblin_king_crown']);
  });

  it('a stage that is not a boss is a bad request', async () => {
    const s = oldServer(() => 0);
    expect((await s.mint({ kind: 'boss_drop', requestId: REQ(1), stages: [24] })).status).toBe(400);
    expect((await s.mint({ kind: 'boss_drop', requestId: REQ(2), stages: [105] })).status).toBe(400);
    expect((await s.mint({ kind: 'boss_drop', requestId: REQ(3), stages: [0] })).status).toBe(400);
  });

  it('boss kills are bounded by a day of runs: a claim of more stages than the bucket holds is paid only up to it, and flagged', async () => {
    const s = oldServer(() => 0.99);
    const stages = Array.from({ length: 60 }, () => 25);
    let rolled = 0;
    for (let i = 0; i < 5; i++) rolled += (await s.mint({ kind: 'boss_drop', requestId: REQ(i), stages })).body.rolls as number;
    expect(rolled).toBeLessThanOrEqual(ITEM_BOUNDS.bossCapacity);
    expect(s.store.flags.map((f) => f.code)).toContain('BOSS_KILLS_EXCESS');
  });

  it('a boss floor the fastest hero cannot have reached yet is refused', async () => {
    const s = makeServer({ rng: () => 0.99 });
    s.store.accountCreatedMs = s.store.nowMs - 2 * DAY;
    const r = await s.mint({ kind: 'boss_drop', requestId: REQ(1), stages: [100] });
    expect(r.body).toEqual({ ok: false, reason: 'too_early' });
  });
});

describe('the minting limits close the bot gap (Rodada 22)', () => {
  it('the three numbers the League review set', () => {
    expect(ITEM_BOUNDS.bossCapacity).toBe(15);
    expect(ITEM_BOUNDS.bossRatePerHour * 24).toBeCloseTo(15, 9);
    expect(ITEM_BOUNDS.uniqueDayCap).toBe(2);
    expect(ITEM_BOUNDS.pouchGoldPerDay).toBe(3_000);
  });

  it('a bot whose every roll is a hit still gets at most 2 certified uniques in a day, from bosses and hunting together', async () => {
    const s = oldServer(() => 0);
    const out: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await s.mint({ kind: 'boss_drop', requestId: REQ(i), stages: [25] });
      out.push(r.status);
    }
    const hunt = await s.mint({ kind: 'hunt_drop', requestId: REQ(50), zoneId: 'demon_glade', durationMs: 16_000 });
    expect(s.store.certs.filter((c) => c.kind === 'unique')).toHaveLength(2); // goblin_king_crown twice, then the cap
    expect(out.filter((st) => st === 200)).toHaveLength(2);
    expect(hunt.status).toBe(429);
    expect(s.store.flags.map((f) => f.code)).toContain('LIMIT_UNIQUE_DAY');
  });

  it('a day of boss claims is paid for at most 15 kills', async () => {
    const s = oldServer(() => 0.99);
    let rolled = 0;
    for (let i = 0; i < 10; i++) rolled += (await s.mint({ kind: 'boss_drop', requestId: REQ(i), stages: [100, 100, 100, 100, 100, 100] })).body.rolls as number;
    expect(rolled).toBe(15);
  });
});

describe('gold pouches', () => {
  it('certifies a pouch with its face value', async () => {
    const s = oldServer();
    s.store.accountCreatedMs = s.store.nowMs - 30 * DAY;
    const r = await s.mint({ kind: 'pouch', requestId: REQ(1), pouchId: 'gold_pouch_s' });
    expect(r.status).toBe(200);
    const body = r.body as { goldAmount: number; certificate: { kind: string; goldAmount: number; templateId: string; rarity: unknown } };
    expect(body.goldAmount).toBe(POUCH_TABLE.faces.gold_pouch_s);
    expect(body.certificate).toMatchObject({ kind: 'gold_pouch', goldAmount: POUCH_TABLE.faces.gold_pouch_s, templateId: 'gold_pouch_s', rarity: null });
  });

  it('is bounded by the Gold a hero could have earned', async () => {
    const s = oldServer();
    const face = POUCH_TABLE.faces.gold_pouch_s;
    s.store.accountCreatedMs = s.store.nowMs - ((2 * face) / ITEM_BOUNDS.pouchGoldPerDay + 0.5) * DAY; // room for two pouches of Gold at the daily limit, not for three
    expect((await s.mint({ kind: 'pouch', requestId: REQ(1), pouchId: 'gold_pouch_s' })).status).toBe(200);
    expect((await s.mint({ kind: 'pouch', requestId: REQ(2), pouchId: 'gold_pouch_s' })).status).toBe(200);
    const third = await s.mint({ kind: 'pouch', requestId: REQ(3), pouchId: 'gold_pouch_s' });
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ ok: false, reason: 'pouch_gold_limit' });
    expect(s.store.flags.map((f) => f.code)).toContain('LIMIT_POUCH_GOLD');
  });

  it('is bounded by how many a day', async () => {
    const s = oldServer();
    s.store.accountCreatedMs = s.store.nowMs - 400 * DAY;
    const out: string[] = [];
    for (let i = 0; i < ITEM_BOUNDS.pouchCountCapacity + 2; i++) {
      const r = await s.mint({ kind: 'pouch', requestId: REQ(i), pouchId: 'gold_pouch_s' });
      out.push(r.status === 200 ? 'ok' : (r.body as { reason: string }).reason);
    }
    expect(out.filter((x) => x === 'ok')).toHaveLength(ITEM_BOUNDS.pouchCountCapacity);
    expect(out).toContain('pouch_count_limit');
  });

  it('an unknown pouch id is a bad request', async () => {
    const s = oldServer();
    expect((await s.mint({ kind: 'pouch', requestId: REQ(1), pouchId: 'gold_pouch_xl' })).status).toBe(400);
  });
});

describe('bind-item: bind, void and burn', () => {
  async function minted(s: ReturnType<typeof oldServer>, n = 1): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = await s.mint({ kind: 'forge', requestId: REQ(40 + i), templateId: 'bronze_dagger' });
      ids.push((r.body.item as { certificate: { id: string } }).certificate.id);
    }
    return ids;
  }

  it('binding is irreversible and idempotent', async () => {
    const s = oldServer(() => 0.99);
    const [id] = await minted(s);
    const a = await s.bind({ action: 'bind', certificateIds: [id] });
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ ok: true, certificates: [{ id, status: 'held', bound: true }] });
    const b = await s.bind({ action: 'bind', certificateIds: [id] });
    expect(b.status).toBe(200);
    expect(s.store.events.filter((e) => e.certificateId === id && e.event === 'bind')).toHaveLength(1);
    // there is no action that unbinds
    expect((await s.bind({ action: 'unbind', certificateIds: [id] })).status).toBe(400);
    expect(s.store.certs[0].bound).toBe(true);
  });

  it('a voided (refined) certificate can never be bound, burned or used again', async () => {
    const s = oldServer(() => 0.99);
    const [id] = await minted(s);
    expect((await s.bind({ action: 'void', certificateIds: [id], reason: 'refine' })).status).toBe(200);
    expect(s.store.certs[0].status).toBe('revoked');
    expect((await s.bind({ action: 'void', certificateIds: [id] })).status).toBe(200); // idempotent
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).body).toEqual({ ok: false, reason: 'not_held' });
    expect((await s.bind({ action: 'burn', certificateIds: [id] })).body).toEqual({ ok: false, reason: 'not_held' });
  });

  it('a burned certificate (salvaged, pouch opened) stays burned', async () => {
    const s = oldServer(() => 0.99);
    const [id] = await minted(s);
    expect((await s.bind({ action: 'burn', certificateIds: [id] })).status).toBe(200);
    expect((await s.bind({ action: 'burn', certificateIds: [id] })).status).toBe(200);
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).status).toBe(409);
    expect(s.store.certs[0].status).toBe('burned');
  });

  it('a listed certificate cannot be bound, voided or burned', async () => {
    const s = oldServer(() => 0.99);
    const [id] = await minted(s);
    s.store.certs[0].status = 'listed'; // the market of the next round does this
    for (const action of ['bind', 'void', 'burn']) expect((await s.bind({ action, certificateIds: [id] })).body).toEqual({ ok: false, reason: 'listed' });
  });

  it('acts on several certificates all-or-nothing', async () => {
    const s = oldServer(() => 0.99);
    const ids = await minted(s, 2);
    s.store.certs[1].status = 'burned';
    const r = await s.bind({ action: 'bind', certificateIds: ids });
    expect(r.status).toBe(409);
    expect(s.store.certs[0].bound).toBe(false);
  });
});

describe('bind-item: wearing needs the hero level (the same gate as the game)', () => {
  /** A held certificate of `templateId` (gate known from the progress tables) for USER_A, minted the way the server would, or planted for a unique. */
  async function certOf(s: ReturnType<typeof oldServer>, templateId: string, n: number): Promise<string> {
    if (FORGE_TEMPLATES[templateId]) {
      const r = await s.mint({ kind: 'forge', requestId: REQ(900 + n), templateId });
      return (r.body.item as { certificate: { id: string } }).certificate.id;
    }
    const id = `00000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`;
    s.store.certs.push({ id, kind: 'unique', templateId, rarity: 'epic', tier: 3, substats: [], upgrade: 0, goldAmount: null, source: 'hunt_drop', status: 'held', bound: false, createdAt: '2026-10-01T00:00:00.000Z', contentHash: 'x', userId: USER_A, requestId: 'planted', requestIndex: 0, createdMs: s.store.nowMs });
    return id;
  }

  it('a piece with no gate binds with no snapshot at all', async () => {
    const s = oldServer(() => 0.99);
    const id = await certOf(s, 'bronze_dagger', 1);
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).status).toBe(200);
  });

  it('a gated piece is refused below its level (no snapshot counts as level 1), allowed at it, and nothing is bound by the refusal', async () => {
    const s = oldServer(() => 0.99);
    const id = await certOf(s, 'iron_helm', 2); // recipe level 10
    const none = await s.bind({ action: 'bind', certificateIds: [id] });
    expect(none.status).toBe(409);
    expect(none.body).toEqual({ ok: false, reason: 'level_too_low', requiredLevel: 10, heroLevel: 1 });
    s.store.acceptedLevels.set(USER_A, 9);
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).body).toEqual({ ok: false, reason: 'level_too_low', requiredLevel: 10, heroLevel: 9 });
    expect(s.store.certs[0].bound).toBe(false);
    expect(s.store.events.some((e) => e.event === 'bind')).toBe(false);
    s.store.acceptedLevels.set(USER_A, 10);
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).body).toEqual({ ok: true, certificates: [{ id, status: 'held', bound: true }] });
  });

  it('a unique takes its twin level', async () => {
    const s = oldServer(() => 0.99);
    const id = await certOf(s, 'bloodbound_cleaver', 3); // twin steel_greatsword: level 25
    s.store.acceptedLevels.set(USER_A, 24);
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).body).toMatchObject({ ok: false, reason: 'level_too_low', requiredLevel: 25 });
    s.store.acceptedLevels.set(USER_A, 25);
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).status).toBe(200);
  });

  it('several certificates are all-or-nothing: one above the level keeps the others unbound', async () => {
    const s = oldServer(() => 0.99);
    const low = await certOf(s, 'bronze_dagger', 4);
    const high = await certOf(s, 'steel_greatsword', 5); // level 25
    s.store.acceptedLevels.set(USER_A, 12);
    const r = await s.bind({ action: 'bind', certificateIds: [low, high] });
    expect(r.body).toMatchObject({ ok: false, reason: 'level_too_low', requiredLevel: 25, heroLevel: 12 });
    expect(s.store.certs.every((c) => !c.bound)).toBe(true);
  });

  it('void and burn (refine, salvage, discard) are not level-gated, and a piece already bound is not asked again', async () => {
    const s = oldServer(() => 0.99);
    const a = await certOf(s, 'iron_helm', 6);
    const b = await certOf(s, 'iron_gauntlets', 7);
    expect((await s.bind({ action: 'void', certificateIds: [a], reason: 'refine' })).status).toBe(200);
    expect((await s.bind({ action: 'burn', certificateIds: [b] })).status).toBe(200);
    const c = await certOf(s, 'iron_greaves', 8);
    s.store.certs.find((x) => x.id === c)!.bound = true; // worn earlier, when the level allowed it
    expect((await s.bind({ action: 'bind', certificateIds: [c] })).status).toBe(200);
  });

  it('only the level of the own accepted snapshot of the account counts, and the certificate of another account still answers not_found', async () => {
    const s = oldServer(() => 0.99);
    const id = await certOf(s, 'iron_helm', 9);
    s.store.acceptedLevels.set(USER_B, 99);
    expect((await s.bind({ action: 'bind', certificateIds: [id] }, USER_B)).body).toEqual({ ok: false, reason: 'not_found' });
    expect((await s.bind({ action: 'bind', certificateIds: [id] })).body).toMatchObject({ ok: false, reason: 'level_too_low' });
  });
});

describe('what a cheater can still do is bounded, not impossible (docs/MARKET_FOUNDATION.md)', () => {
  it('a flood of forge calls never certifies more than the daily caps per tier', async () => {
    const s = oldServer(() => 0.99); // legendary on every roll
    const allTiers = Object.entries(FORGE_TEMPLATES).filter(([, t]) => t.levelGate === 0);
    let certified = 0;
    for (let i = 0; i < 400; i++) {
      const [id] = allTiers[i % allTiers.length];
      const r = await s.mint({ kind: 'forge', requestId: REQ(10_000 + i), templateId: id });
      if (r.status === 200 && (r.body.item as { certificate: unknown }).certificate) certified++;
    }
    const tiers = new Set(allTiers.map(([, t]) => t.tier));
    const max = [...tiers].reduce((sum, t) => sum + ITEM_BOUNDS.certDayCap(t), 0);
    expect(certified).toBeLessThanOrEqual(max);
  });
});

describe('the store is untouched by refused/invalid calls', () => {
  it('a fresh store has nothing and a failed store call is a 502 that leaks nothing', async () => {
    const store = new FakeItemStore();
    store.accountCreatedMs = OLD_ACCOUNT;
    store.takeTokens = async () => {
      throw new Error('take_tokens_500');
    };
    const s = makeServer({ store, rng: () => 0.5 });
    const r = await s.mint({ kind: 'forge', requestId: REQ(1), templateId: 'iron_helm' });
    expect(r.status).toBe(502);
    expect(r.body).toEqual({ error: 'mint_failed' });
    expect(store.certs).toHaveLength(0);
  });
});

// ---- static checks of the source (nothing here runs the functions) ---------------------------------------------------------------------------------------------------------

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

describe('static: the identity and the secrets', () => {
  const root = resolve(__dirname, '../../../..');
  const itemsDir = resolve(root, 'supabase/functions/_shared/items');
  const handler = readFileSync(resolve(itemsDir, 'handler.ts'), 'utf8');

  it('the handler takes the user id from the verified JWT and from nowhere else', () => {
    expect(handler).toContain('getAuthenticatedUserId(req, auth)');
    // the id is read once, from the prelude; no request field is ever turned into one
    expect(handler).not.toMatch(/body\.(?:userId|user_id)|raw\.(?:userId|user_id)|\.get\('x-user/);
    expect(handler.match(/userId/g)?.length).toBeGreaterThan(10);
    // the parsed bodies have no user id field at all
    expect(JSON.stringify(parseMintBody({ kind: 'pouch', requestId: 'req-00000001', pouchId: 'gold_pouch_s', userId: USER_B, user_id: USER_B }))).not.toMatch(/user/i);
    expect(JSON.stringify(parseBindBody({ action: 'bind', certificateIds: [USER_A], userId: USER_B }))).not.toMatch(/user/i);
  });

  it('both Edge Functions are deployed with JWT verification on (no flag, no bypass) and read secrets by name only', () => {
    for (const fn of ['mint-item', 'bind-item']) {
      const src = readFileSync(resolve(root, `supabase/functions/${fn}/index.ts`), 'utf8');
      expect(src).not.toMatch(/verify_jwt\s*=\s*false/);
      expect(src).toContain('getEdgeEnv()');
      expect(src).not.toMatch(/Deno\.env\.get\(/);
    }
  });

  it('the game never imports the REST store and never names the service role key', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? (n === '__tests__' ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    for (const f of walk(resolve(root, 'src'))) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/SERVICE_ROLE|serviceRoleKey/);
      expect(text, f).not.toMatch(/items\/itemDb/);
    }
  });

  it('no random number the server rolls with comes from Math.random', () => {
    for (const f of ['roll.ts', 'handler.ts', 'itemDb.ts']) expect(readFileSync(resolve(itemsDir, f), 'utf8'), f).not.toContain('Math.random');
    expect(readFileSync(resolve(root, 'supabase/functions/mint-item/index.ts'), 'utf8')).toContain('rng: secureRng');
  });
});
