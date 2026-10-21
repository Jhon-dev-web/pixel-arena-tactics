import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultSave, normalizeSave } from '../engine';
import { APPLIED_CREDITS_CAP, applyServerCredits, isPromoConsumable, parseServerCredits, PROMO_CAPS, PROMO_CONSUMABLE_IDS, sanitizeAppliedCredits, type ServerCredit } from '../promoRewards';
import { CONSUMABLES, TRADEABLE_CONSUMABLES } from '../consumables';
import { promoRewardText, promoRewardsToast } from '../promoText';
import { claimServerCredits, fetchCreditsToApply, recentServerCredits } from '../../lib/serverCredits';
import { parsePromoReward, redeemPromoDetailed } from '../../lib/promo';
import { setLocale } from '../../locales';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Promo rewards that are numbers in the save (migration 0028): the client applies each server credit EXACTLY ONCE, by id.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const credit = (n: number, kind: ServerCredit['kind'] = 'gold', amount = 100, itemId: string | null = null): ServerCredit => ({ id: id(n), kind, itemId, amount, sourceRef: 'ABCDEFGHJK' });
const row = (n: number, kind: string, amount: number, item: string | null = null) => ({ id: id(n), kind, item_id: item, amount, source_ref: 'ABCDEFGHJK' });

describe('the potion list', () => {
  it('every id is a real consumable, none is tradeable, none is a Pass-track exclusive', () => {
    for (const cid of PROMO_CONSUMABLE_IDS) {
      expect(CONSUMABLES.some((c) => c.id === cid), cid).toBe(true);
      expect(isPromoConsumable(cid), cid).toBe(true);
    }
    for (const cid of [...TRADEABLE_CONSUMABLES, 'stash_deed', 'forge_seal', 'refine_catalyst', 'expedition_ticket_1h', 'expedition_ticket_2h', 'expedition_ticket_4h']) expect(isPromoConsumable(cid), cid).toBe(false);
    expect(new Set(PROMO_CONSUMABLE_IDS).size).toBe(PROMO_CONSUMABLE_IDS.length);
  });
  it('it is exactly every consumable that is neither tradeable nor reward-only (a new consumable must be a decision, not an accident)', () => {
    const excluded = new Set<string>([...TRADEABLE_CONSUMABLES, 'stash_deed', 'forge_seal', 'refine_catalyst', 'expedition_ticket_1h', 'expedition_ticket_2h', 'expedition_ticket_4h']);
    expect([...PROMO_CONSUMABLE_IDS].sort()).toEqual(CONSUMABLES.map((c) => c.id as string).filter((x) => !excluded.has(x)).sort());
  });
  it('the SQL list and the SQL caps (migration 0028) are the same as the game list and PROMO_CAPS', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/0028_server_credits.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
    const list = /promo_consumable_ids\(\)\s*returns text\[\][\s\S]*?array\[([\s\S]*?)\]::text/.exec(sql)![1];
    const ids = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual([...PROMO_CONSUMABLE_IDS].sort());
    expect(sql).toContain(`kind = 'gold' and item_id is null and amount between 1 and ${PROMO_CAPS.gold}`);
    expect(sql).toContain(`kind = 'shards' and item_id is null and amount between 1 and ${PROMO_CAPS.shards}`);
    expect(sql).toMatch(new RegExp(`kind = 'consumable'[\\s\\S]*?amount between 1 and ${PROMO_CAPS.consumable}\\)`));
  });
});

describe('parseServerCredits: only what the game can apply gets through', () => {
  it('accepts the three kinds and keeps their order', () => {
    const got = parseServerCredits([row(1, 'gold', 500), row(2, 'shards', 20), row(3, 'consumable', 4, 'large_hp')]);
    expect(got.map((c) => [c.kind, c.itemId, c.amount])).toEqual([['gold', null, 500], ['shards', null, 20], ['consumable', 'large_hp', 4]]);
  });
  it('drops garbage: not a list, bad ids, unknown kinds, zero / fractional / oversized amounts, a forbidden potion, an item on Gold, duplicates', () => {
    expect(parseServerCredits(null)).toEqual([]);
    expect(parseServerCredits({})).toEqual([]);
    const bad = [
      null,
      5,
      { ...row(1, 'gold', 5), id: 'not-a-uuid' },
      row(2, 'diamonds', 5),
      row(3, 'gold', 0),
      row(4, 'gold', 2.5),
      row(5, 'gold', PROMO_CAPS.gold + 1),
      row(6, 'shards', PROMO_CAPS.shards + 1),
      row(7, 'consumable', PROMO_CAPS.consumable + 1, 'small_hp'),
      row(8, 'consumable', 5, 'gold_pouch_l'),
      row(9, 'consumable', 5, 'stash_deed'),
      row(10, 'consumable', 5, null),
      row(11, 'gold', 5, 'small_hp'),
      { ...row(12, 'gold', 5), amount: '5' },
    ];
    expect(parseServerCredits(bad)).toEqual([]);
    expect(parseServerCredits([row(1, 'gold', 5), row(1, 'gold', 9)])).toHaveLength(1);
    expect(parseServerCredits([row(1, 'gold', PROMO_CAPS.gold), row(2, 'consumable', PROMO_CAPS.consumable, 'small_hp')])).toHaveLength(2);
  });
});

describe('applyServerCredits: each credit lands once', () => {
  it('gold and Éter are added to the balances; stats.goldEarned (the ranking counter) is not touched', () => {
    const s = { ...defaultSave(), gold: 10, shards: 1 };
    const { save, applied } = applyServerCredits(s, [credit(1, 'gold', 25_000), credit(2, 'shards', 40)]);
    expect(save.gold).toBe(25_010);
    expect(save.shards).toBe(41);
    expect(save.stats.goldEarned).toBe(s.stats.goldEarned);
    expect(applied.map((c) => c.id)).toEqual([id(1), id(2)]);
    expect(save.appliedCredits).toEqual([id(1), id(2)]);
  });

  it('a potion goes into the bag', () => {
    const s = defaultSave();
    const { save } = applyServerCredits(s, [credit(1, 'consumable', 12, 'greater_elixir')]);
    expect(save.consumables.greater_elixir).toBe(s.consumables.greater_elixir + 12);
  });

  it('a potion is NEVER refused or dropped, even with a full bag (the bag may go over its capacity, like the season settlement)', () => {
    const s = { ...defaultSave(), inventoryCapacity: 1, consumables: { ...defaultSave().consumables, small_hp: 20, large_hp: 20 } };
    const { save, applied } = applyServerCredits(s, [credit(1, 'consumable', 100, 'atk_elixir')]);
    expect(save.consumables.atk_elixir).toBe(100);
    expect(save.consumables.small_hp).toBe(20);
    expect(applied).toHaveLength(1);
  });

  it('the same list applied again changes nothing and returns the very same save object (login, focus and redeem can all call it)', () => {
    const list = [credit(1, 'gold', 500), credit(2, 'consumable', 3, 'small_hp')];
    const once = applyServerCredits(defaultSave(), list);
    const twice = applyServerCredits(once.save, list);
    expect(twice.save).toBe(once.save);
    expect(twice.applied).toEqual([]);
    expect(once.save.gold).toBe(defaultSave().gold + 500);
  });

  it('the same credit twice in ONE list counts once', () => {
    const { save, applied } = applyServerCredits(defaultSave(), [credit(1, 'gold', 500), credit(1, 'gold', 500)]);
    expect(save.gold).toBe(defaultSave().gold + 500);
    expect(applied).toHaveLength(1);
  });

  it('a lost claim answer: the recent list gives the credit back and ONLY the new one is applied', () => {
    const a = credit(1, 'gold', 100);
    const b = credit(2, 'shards', 7);
    const first = applyServerCredits(defaultSave(), [a]).save;
    const recovered = applyServerCredits(first, [b, a]); // my_recent_credits lists newest first
    expect(recovered.applied.map((c) => c.id)).toEqual([b.id]);
    expect(recovered.save.gold).toBe(first.gold);
    expect(recovered.save.shards).toBe(first.shards + 7);
  });

  it('the list of applied ids is capped at the newest APPLIED_CREDITS_CAP and survives a save round trip', () => {
    let s = defaultSave();
    const many = Array.from({ length: APPLIED_CREDITS_CAP + 25 }, (_, i) => credit(i + 1, 'gold', 1));
    s = applyServerCredits(s, many).save;
    expect(s.appliedCredits).toHaveLength(APPLIED_CREDITS_CAP);
    expect(s.appliedCredits![APPLIED_CREDITS_CAP - 1]).toBe(id(APPLIED_CREDITS_CAP + 25));
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.appliedCredits).toEqual(s.appliedCredits);
  });

  it('a save without any credit stays exactly as it was: no field, so nothing changes for the players who never used a code', () => {
    const back = normalizeSave(JSON.parse(JSON.stringify(defaultSave())));
    expect('appliedCredits' in back).toBe(false);
    expect(sanitizeAppliedCredits(['x', 5, null, id(1), id(1), id(2).toUpperCase()])).toEqual([id(1), id(2)]);
    expect(sanitizeAppliedCredits('no')).toEqual([]);
  });
});

describe('the words', () => {
  it('Gold, Éter and a potion, in both languages, with the amount formatted', () => {
    setLocale('pt');
    expect(promoRewardText({ kind: 'gold', itemId: null, amount: 25_000 })).toMatch(/^Código resgatado: \+25\.000 Ouro$/);
    expect(promoRewardText({ kind: 'shards', itemId: null, amount: 40 })).toBe('Código resgatado: +40 Éter');
    expect(promoRewardText({ kind: 'consumable', itemId: 'small_hp', amount: 3 })).toMatch(/^Código resgatado: \+3 \S+/);
    expect(promoRewardText({ kind: 'pass', itemId: null, amount: null })).toBe(pt.settings.promoOk);
    expect(promoRewardsToast([{ kind: 'gold', itemId: null, amount: 1 }, { kind: 'shards', itemId: null, amount: 2 }])).toBe('Código resgatado: +1 Ouro · Código resgatado: +2 Éter');
    setLocale('en');
    expect(promoRewardText({ kind: 'gold', itemId: null, amount: 25_000 })).toBe('Code redeemed: +25,000 Gold');
    expect(promoRewardText({ kind: 'shards', itemId: null, amount: 40 })).toBe('Code redeemed: +40 Aether');
    setLocale('pt');
  });
  it('every potion a code can give has a name in both languages', () => {
    for (const cid of PROMO_CONSUMABLE_IDS) {
      expect((pt.consumables as Record<string, string>)[cid], cid).toBeTruthy();
      expect((en.consumables as Record<string, string>)[cid], cid).toBeTruthy();
    }
  });
});

describe('what the server says an ok redeem gave', () => {
  it('maps the four rewards; anything it does not understand is null (the message falls back to a generic ok)', () => {
    expect(parsePromoReward({ status: 'ok', reward: 'pass', season: 1 })).toEqual({ kind: 'pass', itemId: null, amount: null });
    expect(parsePromoReward({ status: 'ok', reward: 'gold', amount: 500 })).toEqual({ kind: 'gold', itemId: null, amount: 500 });
    expect(parsePromoReward({ status: 'ok', reward: 'shards', amount: 9 })).toEqual({ kind: 'shards', itemId: null, amount: 9 });
    expect(parsePromoReward({ status: 'ok', reward: 'consumable', item_id: 'small_hp', amount: 2 })).toEqual({ kind: 'consumable', itemId: 'small_hp', amount: 2 });
    for (const bad of [null, 5, [], {}, { reward: 'gold' }, { reward: 'gold', amount: 0 }, { reward: 'gold', amount: 1.5 }, { reward: 'consumable', amount: 3 }, { reward: 'consumable', item_id: '<b>', amount: 3 }, { reward: 'diamonds', amount: 3 }]) {
      expect(parsePromoReward(bad), JSON.stringify(bad)).toBeNull();
    }
  });
  it('redeemPromoDetailed returns the reward only with an ok', async () => {
    const client = (data: unknown) => ({ rpc: async () => ({ data, error: null }) });
    expect(await redeemPromoDetailed('ABCDEFGHJK', client({ status: 'ok', reward: 'gold', amount: 500, credit_id: id(1) }))).toEqual({ outcome: 'ok', reward: { kind: 'gold', itemId: null, amount: 500 } });
    expect(await redeemPromoDetailed('ABCDEFGHJK', client({ status: 'expired', reward: 'gold', amount: 500 }))).toEqual({ outcome: 'expired', reward: null });
    expect(await redeemPromoDetailed('hello', client({ status: 'ok' }))).toEqual({ outcome: 'invalid', reward: null });
    expect(await redeemPromoDetailed('ABCDEFGHJK', null)).toEqual({ outcome: 'offline', reward: null });
  });
});

describe('lib/serverCredits: claim, recover, never throw', () => {
  const rpcOf = (answers: Record<string, { data?: unknown; error?: unknown } | 'throw'>, spy = vi.fn()) => ({
    rpc: async (name: string, args?: Record<string, unknown>) => {
      spy(name, args);
      const a = answers[name];
      if (a === 'throw') throw new Error('network');
      return { data: a?.data ?? null, error: a?.error ?? null };
    },
  });

  it('claim and recent call the right functions; recent clamps its days to 1..30', async () => {
    const spy = vi.fn();
    const c = rpcOf({ claim_server_credits: { data: [row(1, 'gold', 5)] }, my_recent_credits: { data: [row(2, 'gold', 6)] } }, spy);
    expect((await claimServerCredits(c))!.map((x) => x.id)).toEqual([id(1)]);
    expect((await recentServerCredits(999, c))!.map((x) => x.id)).toEqual([id(2)]);
    await recentServerCredits(0, c);
    expect(spy).toHaveBeenCalledWith('claim_server_credits', undefined);
    expect(spy).toHaveBeenCalledWith('my_recent_credits', { p_days: 30 });
    expect(spy).toHaveBeenCalledWith('my_recent_credits', { p_days: 1 });
  });

  it('a failed or thrown call is null, not an exception; no backend is null', async () => {
    expect(await claimServerCredits(rpcOf({ claim_server_credits: { error: { message: 'boom' } } }))).toBeNull();
    expect(await claimServerCredits(rpcOf({ claim_server_credits: 'throw' }))).toBeNull();
    expect(await claimServerCredits(null)).toBeNull();
    expect(await recentServerCredits(7, null)).toBeNull();
  });

  it('at login (recover) it merges claimed and recent without duplicates; otherwise it only claims', async () => {
    const spy = vi.fn();
    const c = rpcOf({ claim_server_credits: { data: [row(1, 'gold', 5)] }, my_recent_credits: { data: [row(1, 'gold', 5), row(2, 'shards', 3)] } }, spy);
    const login = await fetchCreditsToApply({ recover: true }, c);
    expect(login!.map((x) => x.id).sort()).toEqual([id(1), id(2)]);
    spy.mockClear();
    const focus = await fetchCreditsToApply({ recover: false }, c);
    expect(focus!.map((x) => x.id)).toEqual([id(1)]);
    expect(spy.mock.calls.map((x) => x[0])).toEqual(['claim_server_credits']);
  });

  it('when the claim fails but the recent list works (or the other way round) what works is still applied; when both fail it is null', async () => {
    const partial = await fetchCreditsToApply({ recover: true }, rpcOf({ claim_server_credits: { error: 'x' }, my_recent_credits: { data: [row(2, 'shards', 3)] } }));
    expect(partial!.map((x) => x.id)).toEqual([id(2)]);
    expect(await fetchCreditsToApply({ recover: true }, rpcOf({ claim_server_credits: 'throw', my_recent_credits: { error: 'x' } }))).toBeNull();
  });
});

describe('the wiring', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  it('online only and nothing in the browser storage', () => {
    for (const f of ['../promoRewards.ts', '../appliedCredits.ts', '../promoText.ts', '../../lib/serverCredits.ts']) expect(read(f), f).not.toMatch(/localStorage|sessionStorage|indexedDB|deviceStorage|deviceStore/);
  });
  it('App claims at login, on focus and right after a redeem, and the credit is saved at once', () => {
    const app = read('../../App.tsx');
    expect(app).toContain('fetchCreditsToApply({ recover })');
    expect(app).toContain("window.addEventListener('focus', onFocus)");
    expect(app).toMatch(/onPromoRedeemed=\{\(\) => \{[\s\S]*?recheckServerPass\(userId\)[\s\S]*?syncCreditsRef\.current\(false\)/);
    expect(app).toMatch(/commitSave\(next, \{ important: true \}\);\s*showToast\(toast\)/);
  });
});
