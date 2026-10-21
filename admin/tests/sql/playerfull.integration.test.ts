import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createDb } from './harness';
import { ADMIN, ANA, BRUNO, CARLA, ELOA, seed } from './seed';

// Migration 0034: public.admin_player_full, the live read of ONE account for the drawer. Run for real in an in-memory Postgres, called the way the app calls it.
let db: PGlite;

const call = async <T = any>(uid: string | null, role: 'authenticated' | 'anon', sql: string, params: unknown[] = []): Promise<T> =>
  as(db, role, uid, async () => (await db.query<{ r: T }>(sql, params)).rows[0].r);
const full = (id: string) => call<any>(ADMIN, 'authenticated', 'select public.admin_player_full($1) as r', [id]);

const WEAPON = 'gi_weapon_1';
const SPARE = 'gi_spare_2';
const ANA_SAVE = {
  gold: 1234567,
  shards: 88,
  xp: 5000,
  victories: 40,
  highestDungeonFloor: 37,
  heroName: 'Ana',
  str: 12,
  vit: 9,
  agi: 7,
  res: 5,
  weaponLevel: 3,
  armorLevel: 2,
  stats: { kills: 900, goldEarned: 2000000, secondsPlayed: 7200, deepestDepth: 4, bossesKilled: 3, itemsForged: 11, forgedByRarity: { common: 8, rare: 2, epic: 1, legendary: 0 } },
  skillXp: { mining: 5, woodcutting: 0, gardening: 60 },
  activeOreId: 'iron_ore',
  activeHuntingZone: 'forest',
  activeHuntingDepth: 2,
  unlockedHuntingZones: ['forest', 'cave'],
  huntProgress: { 'forest:2': { ceiling: 4, promotionWins: 1 } },
  skillTree: { active: 0, sets: [{ power: 2, guard: 1 }, {}], respecUsed: false },
  equipped: { weapon: WEAPON, armor: null, helmet: null, gloves: null, boots: null, ring: null, shield: null, relic: null },
  gearInstances: {
    [WEAPON]: { id: WEAPON, templateId: '@@WEAPON4@@', rarity: 'epic', substats: [{ id: 'crit', value: 3 }], upgrade: 5, sockets: ['ruby'], durability: 80, reforgeCount: 1, bound: true, certificateId: 'abc' },
    [SPARE]: { id: SPARE, templateId: '@@ARMOR4@@', rarity: 'common', substats: [], upgrade: 0, sockets: [], durability: 100, reforgeCount: 0 },
  },
  inventory: { sword_relic: 2 },
  inventoryCapacity: 40,
  stash: { level: 2, materials: { iron_ore: 15 }, consumables: { small_hp: 4 }, gear: {} },
  stashBonusSlots: 3,
  materials: { iron_ore: 120, oak_log: 10 },
  tradeableMaterials: { iron_ore: 20 },
  potions: { hp: 7, stamina: 2, elixir: 1 },
  consumables: { repair_kit: 3 },
  gems: { ruby: 2, sapphire: 0, emerald: 1 },
  hasBattlePass: true,
  battlePassLevel: 12,
  battlePassXp: 340,
  passSeason: 1,
  claimedPassRewards: { free: [1, 2, 3], premium: [1] },
  cosmetics: ['title_pioneer', 'frame_pioneer'],
  activeTitle: 'title_pioneer',
  activeFrame: 'frame_pioneer',
  activeSkin: null,
  appliedCredits: ['a', 'b'],
  craftJob: null,
};

beforeAll(async () => {
  db = await createDb();
  const { weapon4, armor4 } = await seed(db);
  await db.query(`insert into arena_private.admins (user_id, note) values ($1, 'owner')`, [ADMIN]);
  const save = JSON.parse(JSON.stringify(ANA_SAVE).replace('@@WEAPON4@@', weapon4).replace('@@ARMOR4@@', armor4));
  await db.query('update public.characters set save_data = $2::jsonb, revision = 9 where user_id = $1', [ANA, JSON.stringify(save)]);
  // Eloa: past level 100 (Paragon 1). Carla: a broken save (wrong types everywhere).
  await db.query('update public.characters set save_data = $2::jsonb where user_id = $1', [ELOA, JSON.stringify({ xp: 18042760 + 401387 + 10, gold: 5 })]);
  await db.query('update public.characters set save_data = $2::jsonb where user_id = $1', [CARLA, JSON.stringify({ gold: 'lots', xp: 'many', gearInstances: [1, 2], equipped: 'x', stats: 7, skillXp: null, inventory: [], stash: 5, skillTree: 3 })]);

  await db.query(
    `insert into arena_private.server_credits (user_id, kind, item_id, amount, source, source_ref, claimed_at) values
    ($1, 'gold', null, 500, 'pioneer', 'pioneer-gold', now()), ($1, 'consumable', 'small_hp', 10, 'pioneer', 'pioneer-potion', null)`,
    [ANA],
  );
  await db.query(`insert into arena_private.promo_codes (code, reward_kind, max_uses, uses, created_by, note, reward_amount) values ('ABCDEFGHJK', 'gold', 5, 1, $1, 'youtuber de teste', 250)`, [ADMIN]);
  await db.query(`insert into arena_private.promo_redemptions (code, user_id) values ('ABCDEFGHJK', $1)`, [ANA]);
  await db.query(`insert into arena_private.invite_codes (user_id, code) values ($1, 'KLMNPQRSTU')`, [ANA]);
  await db.query(`insert into arena_private.account_referrals (user_id, referrer_id, qualified_at) values ($1, $2, now())`, [BRUNO, ANA]);
  await db.query(`insert into arena_private.admin_audit (admin_id, action, target_user, details) values ($1, 'grant_pass', $2, '{"note":"cortesia"}')`, [ADMIN, ANA]);
}, 180_000);

describe('who may call it', () => {
  test('a normal player gets ADMIN_ONLY, anon is denied, the admin gets an object', async () => {
    await expect(call(ANA, 'authenticated', 'select public.admin_player_full($1) as r', [ANA])).rejects.toThrow(/ADMIN_ONLY/);
    await expect(call(null, 'anon', 'select public.admin_player_full($1) as r', [ANA])).rejects.toThrow(/permission denied/);
    expect((await full(ANA)).has_character).toBe(true);
  });

  test('an unknown account is null; a null id is refused', async () => {
    expect(await full('00000000-0000-4000-8000-00000000ffff')).toBeNull();
    await expect(call(ADMIN, 'authenticated', 'select public.admin_player_full(null) as r')).rejects.toThrow(/ADMIN_BAD_ARGUMENT/);
  });

  test('it writes nothing (READ ONLY transaction)', async () => {
    await as(db, 'authenticated', ADMIN, async () => {
      await db.exec('begin transaction read only');
      try {
        expect((await db.query(`select public.admin_player_full('${ANA}') as r`)).rows.length).toBe(1);
      } finally {
        await db.exec('rollback');
      }
    });
  });

  test('the helpers are closed to the API roles', async () => {
    await expect(call(ADMIN, 'authenticated', 'select arena_private.admin_level_from_xp(1) as r')).rejects.toThrow(/permission denied/);
  });
});

describe('the save, read live', () => {
  test('real values come out of the seeded save', async () => {
    const f = await full(ANA);
    const s = f.save;
    expect(s).toMatchObject({ hero_name: 'Ana', revision: 9, level: 10, paragon_level: 0, xp: 5000, gold: 1234567, shards: 88, highest_dungeon_floor: 37, weapon_level: 3, armor_level: 2, inventory_capacity: 40 });
    expect(s.attributes).toEqual({ str: 12, vit: 9, agi: 7, res: 5 });
    expect(s.counters).toMatchObject({ kills: 900, gold_earned: 2000000, seconds_played: 7200, deepest_depth: 4, bosses_killed: 3, items_forged: 11 });
    expect(s.professions.map((p: any) => [p.id, p.xp, p.level])).toEqual([['mining', 5, 2], ['woodcutting', 0, 1], ['gardening', 60, 9]]);
    expect(s.professions[0].active).toBe('iron_ore');
    expect(s.hunting).toMatchObject({ zone: 'forest', depth: 2, unlocked_zones: ['forest', 'cave'], progress: { 'forest:2': { ceiling: 4, promotionWins: 1 } } });
    expect(s.skill_tree.spent).toEqual([3, 0]);
    expect(s.skill_tree.respec_used).toBe(false);
    expect(s.inventory).toEqual({ sword_relic: 2 });
    expect(s.stash).toMatchObject({ level: 2, materials: { iron_ore: 15 }, consumables: { small_hp: 4 }, bonus_slots: 3 });
    expect(s.materials).toEqual({ iron_ore: 120, oak_log: 10 });
    expect(s.tradeable_materials).toEqual({ iron_ore: 20 });
    expect(s.potions).toEqual({ hp: 7, stamina: 2, elixir: 1 });
    expect(s.consumables).toEqual({ repair_kit: 3 });
    expect(s.gems).toEqual({ ruby: 2, sapphire: 0, emerald: 1 });
    expect(s.pass).toMatchObject({ has_flag: true, level: 12, xp: 340, season: 1, claimed_free: [1, 2, 3], claimed_premium: [1] });
    expect(s).toMatchObject({ cosmetics: ['title_pioneer', 'frame_pioneer'], active_title: 'title_pioneer', active_frame: 'frame_pioneer', active_skin: null, applied_credits: 2 });
  });

  test('gear: the worn piece comes first, with rarity, tier, slot, upgrade and the slot it is worn in', async () => {
    const gear = (await full(ANA)).save.gear;
    expect(gear.length).toBe(2);
    expect(gear[0]).toMatchObject({ id: WEAPON, rarity: 'epic', upgrade: 5, durability: 80, reforge_count: 1, bound: true, certified: true, equipped_slot: 'weapon', tier: 4, slot: 'weapon', sockets: ['ruby'] });
    expect(gear[1]).toMatchObject({ id: SPARE, rarity: 'common', equipped_slot: null, bound: false, certified: false, tier: 4, slot: 'armor' });
  });

  test('Paragon is computed past hero level 100', async () => {
    const s = (await full(ELOA)).save;
    expect(s.level).toBe(100);
    expect(s.paragon_level).toBe(1);
  });

  test('a save with the wrong types everywhere never raises: numbers are null, collections empty', async () => {
    const f = await full(CARLA);
    expect(f.save.gold).toBeNull();
    expect(f.save.level).toBe(1);
    expect(f.save.gear).toEqual([]);
    expect(f.save.inventory).toEqual({});
    expect(f.save.stash.materials).toEqual({});
    expect(f.save.skill_tree.spent).toEqual([]);
  });

  test('an account with no character has save null and has_character false', async () => {
    await db.query(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d1', 'nochar@example.com')`);
    const f = await full('00000000-0000-4000-8000-0000000000d1');
    expect(f.has_character).toBe(false);
    expect(f.save).toBeNull();
    expect(f.progress.snapshots).toEqual([]);
    expect(f.audit).toEqual([]);
  });

  test('the e-mail is not part of it', async () => {
    expect(JSON.stringify(await full(ANA))).not.toContain('ana.silva@example.com');
  });
});

describe('the rest of the account', () => {
  test('progress: last snapshots with verdicts, newest first, and the counts', async () => {
    const p = (await full(ANA)).progress;
    expect(p.latest_verdict).toBe('flagged');
    expect(p.counts).toMatchObject({ ok: 1, flagged: 1, rejected: 0, total: 2 });
    expect(p.snapshots.map((s: any) => s.verdict)).toEqual(['flagged', 'ok']);
    expect(p.snapshots[0]).toMatchObject({ hero_level: 100, paragon_level: 15, highest_floor: 100, reasons: ['PACE_TOO_FAST', 'GOLD_JUMP'] });
  });

  test('server credits (promo and pioneer): owed and claimed, and the promo codes redeemed', async () => {
    const f = await full(ANA);
    expect(f.credits).toMatchObject({ unclaimed: 1, claimed: 1 });
    expect(f.credits.rows.map((c: any) => [c.source, c.kind, c.amount, c.claimed_at !== null]).sort()).toEqual([['pioneer', 'consumable', 10, false], ['pioneer', 'gold', 500, true]]);
    expect(f.promo).toEqual([expect.objectContaining({ code: 'ABCDEFGHJK', reward_kind: 'gold', reward_amount: 250 })]);
  });

  test('market: listings as seller, sales totals as seller and buyer (live only)', async () => {
    const b = (await full(BRUNO)).market;
    expect(b.listing_counts).toEqual({ open: 1 });
    expect(b.listings[0]).toMatchObject({ status: 'open', price_lamports: 2000000000, rarity: 'legendary' });
    expect(b.bought).toEqual({ count: 1, lamports: 1000000000 });
    expect(b.sold).toEqual({ count: 0, lamports: 0 });
    expect((await full(CARLA)).market.sold).toEqual({ count: 1, lamports: 1000000000 });
  });

  test('invites: the code, who invited, how many were invited and qualified', async () => {
    const a = (await full(ANA)).invites;
    expect(a.code).toBe('KLMNPQRSTU');
    expect(a).toMatchObject({ invited_total: 1, invited_qualified: 1, invited_ignored: 0 });
    expect(a.invited[0]).toMatchObject({ user_id: BRUNO, username: 'Bruno' });
    const b = (await full(BRUNO)).invites;
    expect(b.invited_by).toMatchObject({ user_id: ANA, username: 'AnaSilva' });
  });

  test('waiting list: matched by e-mail, with the people that row invited', async () => {
    const w = (await full(BRUNO)).waitlist;
    expect(w).toMatchObject({ source: 'tiktok', was_referred: false, invited: 2, invited_qualified: 1 });
    expect(JSON.stringify(w)).not.toMatch(/hash/);
    expect((await full(ANA)).waitlist).toBeNull();
  });

  test('audit: the rows that name this account', async () => {
    const f = await full(ANA);
    expect(f.audit).toEqual([expect.objectContaining({ action: 'grant_pass', admin_id: ADMIN, details: { note: 'cortesia' } })]);
    expect((await full(BRUNO)).audit).toEqual([]);
  });
});
