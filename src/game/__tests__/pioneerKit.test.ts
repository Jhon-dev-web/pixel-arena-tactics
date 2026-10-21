import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { defaultSave } from '../engine';
import { applyPioneerAnswer, buildLeagueHero, buildNewLeagueHero, PIONEER_FRAME_ID, PIONEER_TITLE_ID } from '../leagueReset';
import { PIONEER_KIT, PIONEER_SOURCE_REFS, isPioneerCredit } from '../pioneerKit';
import { applyServerCredits, isPromoConsumable, parseServerCredits } from '../promoRewards';
import { applySelectFrame, FRAMES, getFrameDef, portraitFrameClass } from '../seasonItems';
import { getTitleDef } from '../titles';

const R = Date.parse('2026-12-01T12:00:00.000Z');
const root = resolve(__dirname, '../../..');
const sql = readFileSync(resolve(root, 'supabase/migrations/0033_pioneer_kit.sql'), 'utf8');
const css = readFileSync(resolve(root, 'src/App.css'), 'utf8');
const EMOJI = /\p{Extended_Pictographic}/u;

describe('Pioneer kit: title and frame (cosmetic, client side)', () => {
  it('the reset hero of a pioneer gets the title AND the frame; a non-pioneer or an unanswered question gets neither', () => {
    const yes = buildLeagueHero({ heroName: 'Aldric' }, R, true);
    expect(yes.cosmetics).toContain(PIONEER_TITLE_ID);
    expect(yes.cosmetics).toContain(PIONEER_FRAME_ID);
    for (const answer of [false, null]) {
      const no = buildLeagueHero({ heroName: 'Aldric' }, R, answer);
      expect(no.cosmetics).not.toContain(PIONEER_TITLE_ID);
      expect(no.cosmetics).not.toContain(PIONEER_FRAME_ID);
    }
    expect(buildNewLeagueHero(R).cosmetics).not.toContain(PIONEER_FRAME_ID);
  });

  it('a late answer grants both, once', () => {
    const base = { ...defaultSave(), league: { epoch: R, noticeSeen: false, pioneerChecked: false } };
    const out = applyPioneerAnswer(base, true);
    expect(out.cosmetics.filter((c) => c === PIONEER_FRAME_ID)).toHaveLength(1);
    expect(out.cosmetics.filter((c) => c === PIONEER_TITLE_ID)).toHaveLength(1);
    const again = applyPioneerAnswer({ ...out, league: { epoch: R, noticeSeen: false, pioneerChecked: false } }, true);
    expect(again.cosmetics.filter((c) => c === PIONEER_FRAME_ID)).toHaveLength(1);
    expect(applyPioneerAnswer(base, false).cosmetics).not.toContain(PIONEER_FRAME_ID);
  });

  it('the frame is a real FRAMES entry the hero can wear once owned, with its own CSS look', () => {
    expect(getFrameDef(PIONEER_FRAME_ID)).toBeDefined();
    expect(FRAMES.map((f) => f.id)).toContain(PIONEER_FRAME_ID);
    expect(getTitleDef(PIONEER_TITLE_ID)).toBeDefined();
    expect(applySelectFrame(defaultSave(), PIONEER_FRAME_ID)).toBeNull();
    const owner = { ...defaultSave(), cosmetics: [PIONEER_FRAME_ID] };
    const worn = applySelectFrame(owner, PIONEER_FRAME_ID);
    expect(worn?.activeFrame).toBe(PIONEER_FRAME_ID);
    expect(portraitFrameClass(worn!)).toContain('frame-pioneer');
    expect(css).toContain('.portrait-frame.frame-pioneer');
  });

  it('every text exists in Portuguese and English, with the same placeholders, and carries no emoji', () => {
    const g = (tree: unknown, path: string[]): string => path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], tree) as string;
    for (const path of [['titles', 'frame_pioneer'], ['titles', 'frame_pioneer_d'], ['leagueReset', 'pioneer'], ['leagueReset', 'chestToast']]) {
      const a = g(en, path);
      const b = g(pt, path);
      expect(typeof a, path.join('.')).toBe('string');
      expect(typeof b, path.join('.')).toBe('string');
      expect(a.length).toBeGreaterThan(5);
      expect(EMOJI.test(a) || EMOJI.test(b)).toBe(false);
      expect([...a.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()).toEqual([...b.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
    }
    expect(g(en, ['leagueReset', 'pioneer'])).toContain('{gold}');
    expect(g(pt, ['leagueReset', 'pioneer'])).toContain('{potions}');
    expect(g(pt, ['titles', 'frame_pioneer'])).toBe('Moldura de Pioneiro');
  });
});

describe('Pioneer kit: starter chest (server credits, migration 0033)', () => {
  it('the TS constants and the migration agree (the ONE server place is arena_private.pioneer_kit())', () => {
    const m = /jsonb_build_object\('min_level', (\d+), 'gold', (\d+), 'potion_id', '(\w+)', 'potion_amount', (\d+)\)/.exec(sql);
    expect(m).not.toBeNull();
    expect({ minLevel: Number(m![1]), gold: Number(m![2]), potionId: m![3], potionAmount: Number(m![4]) }).toEqual(PIONEER_KIT);
    // the source refs written by the grant function are the ones the game recognises
    for (const ref of PIONEER_SOURCE_REFS) expect(sql).toContain(`'${ref}'`);
    expect(sql).toContain("source in ('promo', 'pioneer')");
  });

  it('the potion is a basic healing potion on the promo list (the ledger accepts it) and the amounts are modest', () => {
    expect(isPromoConsumable(PIONEER_KIT.potionId)).toBe(true);
    expect(PIONEER_KIT.potionAmount).toBeGreaterThanOrEqual(3);
    expect(PIONEER_KIT.potionAmount).toBeLessThanOrEqual(5);
    expect(PIONEER_KIT.minLevel).toBe(10);
  });

  it('the reset hero applies the chest exactly once, from the ledger rows the server hands out', () => {
    const rows = [
      { id: '11111111-1111-4111-8111-111111111111', kind: 'gold', item_id: null, amount: PIONEER_KIT.gold, source_ref: 'pioneer-gold' },
      { id: '22222222-2222-4222-8222-222222222222', kind: 'consumable', item_id: PIONEER_KIT.potionId, amount: PIONEER_KIT.potionAmount, source_ref: 'pioneer-potion' },
    ];
    const credits = parseServerCredits(rows);
    expect(credits).toHaveLength(2);
    expect(credits.every(isPioneerCredit)).toBe(true);
    const fresh = defaultSave();
    const first = applyServerCredits(fresh, credits);
    expect(first.save.gold).toBe(fresh.gold + PIONEER_KIT.gold);
    expect(first.save.consumables[PIONEER_KIT.potionId]).toBe((fresh.consumables[PIONEER_KIT.potionId] ?? 0) + PIONEER_KIT.potionAmount);
    const second = applyServerCredits(first.save, credits);
    expect(second.applied).toEqual([]);
    expect(second.save).toBe(first.save);
    expect(isPioneerCredit({ sourceRef: 'K7M2QXA9RB' })).toBe(false);
    expect(isPioneerCredit({ sourceRef: null })).toBe(false);
  });
});
