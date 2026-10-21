import { describe, expect, test } from 'vitest';
import { AUDIT_ACTION_LABEL, auditActionLabel, countEntries, countsLine, creditLabel, fmtDuration, gearDetails, huntingLine, normalizeFull, passMismatch, promoRewardLabel, rarityTally, sumCounts } from '../src/lib/full';
import { createDemoApi } from '../src/lib/demo';
import type { FullGear } from '../src/lib/types';

const gear = (over: Partial<FullGear>): FullGear => ({ id: 'g', template_id: 'iron_sword', rarity: 'common', upgrade: 0, durability: 100, reforge_count: 0, lapidar_count: null, sockets: [], substats: [], bound: false, certified: false, equipped_slot: null, tier: 1, slot: 'weapon', ...over });

describe('normalizeFull', () => {
  test('anything that is not an object is no account', () => {
    expect(normalizeFull(null)).toBeNull();
    expect(normalizeFull('x')).toBeNull();
    expect(normalizeFull([])).toBeNull();
  });

  test('a bare object becomes a complete, renderable answer', () => {
    const f = normalizeFull({})!;
    expect(f.save).toBeNull();
    expect(f.has_character).toBe(false);
    expect(f.progress).toEqual({ latest_verdict: null, counts: { ok: 0, flagged: 0, rejected: 0, total: 0 }, snapshots: [] });
    expect(f.credits).toEqual({ unclaimed: 0, claimed: 0, rows: [] });
    expect(f.promo).toEqual([]);
    expect(f.market).toMatchObject({ listings: [], reservations: [], sold: { count: 0, lamports: 0 }, bought: { count: 0, lamports: 0 } });
    expect(f.invites).toMatchObject({ code: null, invited_by: null, invited_total: 0, invited: [], rewards: [] });
    expect(f.waitlist).toBeNull();
    expect(f.audit).toEqual([]);
  });

  test('a save with missing parts gets empty collections, real values are kept', () => {
    const f = normalizeFull({ has_character: true, save: { hero_name: 'Ana', level: 10, gold: 5, gear: 'bad', materials: { iron_ore: 3 }, stash: { level: 2 }, hunting: { zone: 'forest' } } })!;
    const s = f.save!;
    expect(s).toMatchObject({ hero_name: 'Ana', level: 10, gold: 5, materials: { iron_ore: 3 } });
    expect(s.gear).toEqual([]);
    expect(s.potions).toEqual({});
    expect(s.stash).toMatchObject({ level: 2, materials: {}, consumables: {}, gear: {} });
    expect(s.hunting).toMatchObject({ zone: 'forest', unlocked_zones: [], progress: {} });
    expect(s.skill_tree).toMatchObject({ sets: [], spent: [], respec_used: false });
    expect(s.pass).toMatchObject({ has_flag: false, claimed_free: [], claimed_premium: [] });
  });

  test('the demo answer has every section and survives normalization unchanged in shape', async () => {
    const api = createDemoApi();
    const first = (await api.players({ search: '', sort: 'last_seen', dir: 'desc', page: 0, pageSize: 5, filters: {} })).rows[0];
    const raw = await api.playerFull(first.user_id);
    const f = normalizeFull(raw)!;
    expect(f.save!.gear.length).toBeGreaterThan(0);
    expect(f.save!.professions.map((p) => p.id)).toEqual(['mining', 'woodcutting', 'gardening']);
    expect(f.credits.rows.length).toBeGreaterThan(0);
    expect(f.market.listings.length).toBeGreaterThan(0);
    expect(await api.playerFull('nope')).toBeNull();
  });
});

describe('describing the counts', () => {
  test('countEntries keeps positive numbers only, biggest first', () => {
    expect(countEntries({ b: 2, a: 2, c: 9, z: 0, q: -1, w: 'x' as unknown as number })).toEqual([['c', 9], ['a', 2], ['b', 2]]);
    expect(countEntries(null)).toEqual([]);
  });
  test('sums and lines', () => {
    expect(sumCounts({ a: 2, b: 3 })).toBe(5);
    expect(countsLine({ iron_ore: 1200, oak_log: 10 })).toBe('Iron ore ×1.200 · Oak log ×10');
    expect(countsLine({})).toBe('nenhum');
  });
  test('rarity tally', () => {
    expect(rarityTally([gear({ rarity: 'epic' }), gear({ rarity: 'epic' }), gear({ rarity: 'legendary' }), gear({ rarity: null })])).toEqual({ common: 0, rare: 0, epic: 2, legendary: 1 });
  });
});

describe('describing one thing', () => {
  test('gear details', () => {
    expect(gearDetails(gear({ upgrade: 5, durability: 80, reforge_count: 1, sockets: ['ruby'], substats: [{}, {}] }))).toBe('+5 · durabilidade 80 · 1 reforja · engastes: Ruby · 2 atributos extras');
    expect(gearDetails(gear({ upgrade: null, durability: null }))).toBe('—');
  });
  test('durations', () => {
    expect(fmtDuration(45)).toBe('45 s');
    expect(fmtDuration(7260)).toBe('2 h 1 min');
    expect(fmtDuration(90_000)).toBe('1 d 1 h');
    expect(fmtDuration(null)).toBe('—');
  });
  test('credits and promo rewards', () => {
    expect(creditLabel({ kind: 'gold', item_id: null, amount: 500 })).toBe('500 de Ouro');
    expect(creditLabel({ kind: 'shards', item_id: null, amount: 20 })).toBe('20 de Éter');
    expect(creditLabel({ kind: 'consumable', item_id: 'small_hp', amount: 10 })).toBe('10 × Small hp');
    expect(promoRewardLabel({ reward_kind: 'pass', reward_item_id: null, reward_amount: null })).toBe('Passe da temporada');
    expect(promoRewardLabel({ reward_kind: 'gold', reward_item_id: null, reward_amount: 250 })).toBe('250 de Ouro');
    expect(promoRewardLabel({ reward_kind: null, reward_item_id: null, reward_amount: null })).toBe('—');
  });
  test('audit actions and hunting', () => {
    expect(auditActionLabel('grant_pass')).toBe(AUDIT_ACTION_LABEL.grant_pass);
    expect(auditActionLabel('something_new')).toBe('Something new');
    expect(huntingLine({ zone: null, depth: null })).toBe('sem caça ativa');
    expect(huntingLine({ zone: 'dark_forest', depth: 3 })).toBe('Dark forest · profundeza 3');
  });
  test('the save flag against the server Pass', () => {
    expect(passMismatch(true, true)).toBeNull();
    expect(passMismatch(false, false)).toBeNull();
    expect(passMismatch(true, false)).toMatch(/save diz que tem/);
    expect(passMismatch(false, true)).toMatch(/servidor reconhece/);
    expect(passMismatch(true, undefined)).toBeNull();
  });
});
