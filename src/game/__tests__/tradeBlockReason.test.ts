import { describe, expect, it } from 'vitest';
import { createGearInstance, isTradeable, tradeBlockReason } from '../gearInstances';
import { GEAR } from '../gear';
import type { Rarity } from '../rarity';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

const CERT = '123e4567-e89b-42d3-a456-426614174000';
const mk = (templateId: string, rarity: Rarity, extra: { bound?: boolean; certificateId?: string; certified?: false } = {}) =>
  createGearInstance(templateId, { id: 'x', origin: 'craft', rarity, substats: [], ...extra });

describe('tradeBlockReason explains isTradeable', () => {
  it('is null exactly when the piece can be sold', () => {
    const ok = mk('steel_plate', 'epic', { certificateId: CERT });
    expect(isTradeable(ok)).toBe(true);
    expect(tradeBlockReason(ok)).toBeNull();
  });

  it('rarity below Epic and not unique: the rarity reason (even when bound)', () => {
    expect(tradeBlockReason(mk('steel_plate', 'rare', { certificateId: CERT }))).toBe('rarity');
    expect(tradeBlockReason(mk('steel_plate', 'common', { bound: true, certificateId: CERT }))).toBe('rarity');
  });

  it('a unique below Epic is not blocked by rarity', () => {
    expect(tradeBlockReason(mk(GEAR.find((g) => g.unique)!.id, 'common', { certificateId: CERT }))).toBeNull();
  });

  it('bound Epic / Legendary: the bound reason', () => {
    expect(tradeBlockReason(mk('steel_plate', 'legendary', { bound: true, certificateId: CERT }))).toBe('bound');
  });

  it('Epic without a certificate (made offline / before the server): the uncertified reason', () => {
    expect(tradeBlockReason(mk('steel_plate', 'epic'))).toBe('uncertified');
    expect(tradeBlockReason(mk('steel_plate', 'epic', { certified: false }))).toBe('uncertified');
  });

  it('agrees with isTradeable for every combination', () => {
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as Rarity[])
      for (const bound of [false, true])
        for (const certificateId of [undefined, CERT]) {
          const i = mk('steel_plate', rarity, { bound, certificateId });
          expect(tradeBlockReason(i) === null).toBe(isTradeable(i));
        }
  });

  it('pt and en both say all three', () => {
    for (const bundle of [pt, en] as Array<{ inventory: { tradeReason: Record<string, string> } }>) {
      expect(Object.keys(bundle.inventory.tradeReason).sort()).toEqual(['bound', 'rarity', 'uncertified']);
    }
    expect(pt.inventory.tradeReason.rarity).toBe('Só Épico, Lendário ou Único pode ser vendido');
  });
});
