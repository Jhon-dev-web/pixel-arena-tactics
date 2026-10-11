import { describe, expect, it } from 'vitest';
import Assets from '../../assets.json';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { createGearInstance } from '../gearInstances';
import { artGeometry, HERO_ART } from '../huntingZones';
import { heroBaseLook, HeroSheet, heroSheet, heroSheetUrl, playerSpriteUrl, withKnightingMoment } from '../sprites';

const wire = (s: unknown): SaveData => JSON.parse(JSON.stringify(s));

// A save wearing the given armor template (a forged / dropped / unique piece) in its armor slot.
const wearing = (templateId: string, base: SaveData = defaultSave()): SaveData => {
  const inst = createGearInstance(templateId, { id: `t_${templateId}`, origin: 'craft', rarity: 'common' });
  return { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, armor: inst.id } };
};
const bare = (base: SaveData = defaultSave()): SaveData => ({ ...base, equipped: { ...base.equipped, armor: null } });
const withSkin = (s: SaveData, patch: Partial<SaveData> = {}): SaveData => ({ ...s, hasBattlePass: true, cosmetics: ['skin_golden_knight'], activeSkin: 'skin_golden_knight', ...patch });

describe('the hero look (heroSheet)', () => {
  it('a new hero (starter rags + wooden club) is the peasant', () => {
    const s = defaultSave();
    expect(s.gearInstances[s.equipped.armor as string].templateId).toBe('ragged_clothes');
    expect(heroBaseLook(s)).toBe('peasant');
    expect(heroSheet(s)).toBe('peasant');
    expect(playerSpriteUrl(s)).toBe('/assets/spritesheets/peasant.png');
  });

  it('an empty armor slot is the peasant too, and so is an id that points nowhere', () => {
    expect(heroSheet(bare())).toBe('peasant');
    expect(heroSheet({ ...defaultSave(), equipped: { ...defaultSave().equipped, armor: 'gi_missing' } })).toBe('peasant');
  });

  it('any forged armor, of any tier, makes him the knight; so does a unique drop', () => {
    for (const id of ['bronze_leather', 'iron_chainmail', 'steel_plate', 'gilded_aegis', 'dragon_scale_armor', 'voidsteel_plate', 'abyssal_bulwark']) {
      expect(heroSheet(wearing(id)), id).toBe('knight');
    }
    for (const id of ['demonhide_vest', 'bloodvein_plate']) expect(heroSheet(wearing(id)), id).toBe('knight');
    expect(playerSpriteUrl(wearing('steel_plate'))).toBe('/assets/spritesheets/knight.png');
  });

  it('the weapon never matters: a peasant with a forged sword is still the peasant sheet', () => {
    const s = defaultSave();
    const sword = createGearInstance('iron_short_sword', { id: 't_sword', origin: 'craft', rarity: 'common' });
    const armed: SaveData = { ...s, gearInstances: { ...s.gearInstances, [sword.id]: sword }, equipped: { ...s.equipped, weapon: sword.id } };
    expect(heroSheet(armed)).toBe('peasant');
  });

  it('taking the armor off shows the peasant again', () => {
    const knight = wearing('iron_chainmail');
    expect(heroSheet(knight)).toBe('knight');
    expect(heroSheet(bare(knight))).toBe('peasant');
  });

  it('a skin the hero owns (and the Pass) wins over the gear, on the peasant and on the knight', () => {
    expect(heroSheet(withSkin(defaultSave()))).toBe('knight_golden');
    expect(heroSheet(withSkin(wearing('steel_plate')))).toBe('knight_golden');
    expect(playerSpriteUrl(withSkin(defaultSave()))).toBe('/assets/spritesheets/knight_golden.png');
  });

  it('an unknown, un-owned or Pass-less skin falls back to the gear-driven look', () => {
    expect(heroSheet(withSkin(defaultSave(), { activeSkin: 'skin_nope' }))).toBe('peasant');
    expect(heroSheet(withSkin(wearing('steel_plate'), { activeSkin: 'skin_nope' }))).toBe('knight');
    expect(heroSheet(withSkin(defaultSave(), { cosmetics: [] }))).toBe('peasant'); // not owned
    expect(heroSheet(withSkin(wearing('steel_plate'), { cosmetics: [] }))).toBe('knight');
    expect(heroSheet(withSkin(defaultSave(), { hasBattlePass: false }))).toBe('peasant'); // no Pass
    expect(heroSheet({ ...defaultSave(), activeSkin: null })).toBe('peasant');
  });

  it('every sheet resolves to a registered sheet', () => {
    const sheets = Assets.spritesheets as Record<string, { url: string }>;
    for (const sheet of ['peasant', 'knight', 'knight_golden'] as HeroSheet[]) expect(heroSheetUrl(sheet)).toBe(sheets[sheet].url);
  });
});

describe('HERO_ART', () => {
  it('has an entry per hero sheet; the peasant keeps his natural (shorter) proportions on about the same ground line as the knight', () => {
    expect(Object.keys(HERO_ART).sort()).toEqual(['knight', 'knight_golden', 'peasant']);
    const p = artGeometry(HERO_ART.peasant);
    const k = artGeometry(HERO_ART.knight);
    expect(p.h).toBeLessThan(k.h);
    expect(Math.abs(p.foot - k.foot) * 256).toBeLessThanOrEqual(2);
    expect(HERO_ART.knight_golden).toEqual(HERO_ART.knight);
  });
});

describe('the peasant -> knight moment', () => {
  it('fires when the first real armor goes on, once', () => {
    const start = defaultSave();
    const equipped = withKnightingMoment(start, wearing('bronze_leather', start));
    expect(equipped?.heroKnighted).toBe(true);
    // unequip (peasant again) and re-equip: the flag is set, no second celebration
    const off = bare(equipped!);
    expect(withKnightingMoment(equipped!, off)).toBeNull();
    expect(withKnightingMoment(off, wearing('bronze_leather', off))).toBeNull();
  });

  it('does not fire for changes that leave the look alone: other changes, a better armor over an armor, a skin', () => {
    const start = defaultSave();
    expect(withKnightingMoment(start, { ...start, gold: start.gold + 5 })).toBeNull();
    const knight = { ...wearing('bronze_leather', start), heroKnighted: true };
    expect(withKnightingMoment(knight, wearing('steel_plate', knight))).toBeNull();
    expect(withKnightingMoment(start, withSkin(start))).toBeNull();
  });

  it('a hero in a skin still gets the moment (the gear step is independent of the skin)', () => {
    const start = withSkin(defaultSave());
    expect(withKnightingMoment(start, wearing('bronze_leather', start))?.heroKnighted).toBe(true);
  });

  it('old saves that already wear armor load with the flag set, so they never see it, even after an unequip and re-equip', () => {
    const old = wire(wearing('iron_chainmail'));
    delete (old as unknown as Record<string, unknown>).heroKnighted;
    const loaded = normalizeSave(old);
    expect(loaded.heroKnighted).toBe(true);
    expect(heroSheet(loaded)).toBe('knight');
    expect(withKnightingMoment(bare(loaded), wearing('iron_chainmail', bare(loaded)))).toBeNull();
  });

  it('a save that still wears the rags loads unflagged, and the flag round-trips once set', () => {
    const fresh = normalizeSave(wire(defaultSave()));
    expect(fresh.heroKnighted).toBe(false);
    expect(normalizeSave(wire({ ...bare(), heroKnighted: true })).heroKnighted).toBe(true);
  });
});
