import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Assets from '../../assets.json';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { ARMOR_LOOKS, GEAR, HERO_LOOKS } from '../gear';
import { createGearInstance } from '../gearInstances';
import { artGeometry, HERO_ART } from '../huntingZones';
import { armorLook, heroBaseLook, HeroSheet, heroSheet, heroSheetUrl, looksUpTo, playerSpriteUrl, withLookMoment } from '../sprites';

const wire = (s: unknown): SaveData => JSON.parse(JSON.stringify(s));
const ARMORS = GEAR.filter((g) => g.slot === 'armor');
const ALL_SHEETS: HeroSheet[] = [...HERO_LOOKS, 'knight_golden'];

// A save wearing the given armor template (a forged / dropped / unique piece) in its armor slot.
const wearing = (templateId: string, base: SaveData = defaultSave()): SaveData => {
  const inst = createGearInstance(templateId, { id: `t_${templateId}`, origin: 'craft', rarity: 'common' });
  return { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, armor: inst.id } };
};
const bare = (base: SaveData = defaultSave()): SaveData => ({ ...base, equipped: { ...base.equipped, armor: null } });
const withSkin = (s: SaveData, patch: Partial<SaveData> = {}): SaveData => ({ ...s, hasBattlePass: true, cosmetics: ['skin_golden_knight'], activeSkin: 'skin_golden_knight', ...patch });

describe('the armor -> look mapping', () => {
  it('every armor template, forged or unique, has a look, and every look is a known sheet', () => {
    expect(ARMORS.length).toBeGreaterThanOrEqual(10);
    for (const a of ARMORS) {
      expect(a.look, a.id).toBeDefined();
      expect(HERO_LOOKS as readonly string[], a.id).toContain(a.look);
    }
    for (const a of ARMORS.filter((g) => !g.unique)) expect(ARMOR_LOOKS[a.id], a.id).toBe(a.look);
    // only armors carry a look
    for (const g of GEAR.filter((x) => x.slot !== 'armor')) expect(g.look, g.id).toBeUndefined();
  });

  it('the documented mapping', () => {
    const m = Object.fromEntries(ARMORS.map((a) => [a.id, a.look]));
    expect(m).toMatchObject({
      ragged_clothes: 'hero_peasant_v2',
      bronze_leather: 'hero_bronze_v2',
      iron_chainmail: 'hero_iron_v2',
      steel_plate: 'hero_steel_v2',
      gilded_aegis: 'hero_dark_knight',
      dragon_scale_armor: 'hero_dragon_v2',
      voidsteel_plate: 'hero_voidsteel_v2',
      abyssal_bulwark: 'hero_abyssal_v2',
      demonhide_vest: 'hero_iron_v2', // twin: iron_chainmail
      bloodvein_plate: 'hero_steel_v2', // twin: steel_plate
    });
  });

  it('every look has a registered sheet on disk, 4 x 4 cells of its HERO_ART cell, and an art row inside the frame', () => {
    const sheets = Assets.spritesheets as Record<string, { url: string; imageWidth: number; imageHeight: number }>;
    for (const sheet of ALL_SHEETS) {
      expect(sheets[sheet], sheet).toBeDefined();
      expect(heroSheetUrl(sheet)).toBe(sheets[sheet].url);
      const file = join(process.cwd(), 'public', sheets[sheet].url);
      expect(existsSync(file), sheet).toBe(true);
      const b = readFileSync(file);
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], sheet).toEqual([HERO_ART[sheet].cell * 4, HERO_ART[sheet].cell * 4]);
      const [x0, y0, x1, y1] = HERO_ART[sheet].box;
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThan(HERO_ART[sheet].cell);
      expect(y1).toBeLessThan(HERO_ART[sheet].cell);
    }
    expect(Object.keys(HERO_ART).sort()).toEqual([...ALL_SHEETS].sort());
  });

  it('all sheets stand on the same ground line (within 2 sheet pixels); the new-hero looks share one body size (the peasant a touch smaller)', () => {
    const foot = (s: HeroSheet) => artGeometry(HERO_ART[s]).foot * 256;
    for (const s of ALL_SHEETS) expect(Math.abs(foot(s) - foot('knight_golden')), s).toBeLessThanOrEqual(2);
    const h = (s: HeroSheet) => artGeometry(HERO_ART[s]).h;
    expect(h('hero_peasant_v2')).toBeLessThan(h('knight_golden'));
    expect(Math.abs(h('hero_dragon_v2') - h('hero_steel_v2'))).toBeLessThan(0.03);
  });
});

describe('the hero look (heroSheet)', () => {
  it('a new hero (starter rags + wooden club) is the peasant', () => {
    const s = defaultSave();
    expect(s.gearInstances[s.equipped.armor as string].templateId).toBe('ragged_clothes');
    expect(heroBaseLook(s)).toBe('hero_peasant_v2');
    expect(heroSheet(s)).toBe('hero_peasant_v2');
    expect(playerSpriteUrl(s)).toBe('/assets/spritesheets/hero_peasant_v2.png');
    expect(armorLook('ragged_clothes')).toBe('hero_peasant_v2');
  });

  it('an empty armor slot is the peasant too, and so is an id that points nowhere', () => {
    expect(heroSheet(bare())).toBe('hero_peasant_v2');
    expect(heroSheet({ ...defaultSave(), equipped: { ...defaultSave().equipped, armor: 'gi_missing' } })).toBe('hero_peasant_v2');
  });

  it('every armor template, forged or unique, draws the sheet of its look', () => {
    for (const a of ARMORS) {
      expect(heroSheet(wearing(a.id)), a.id).toBe(a.look);
      expect(playerSpriteUrl(wearing(a.id)), a.id).toBe(heroSheetUrl(a.look as HeroSheet));
    }
    expect(playerSpriteUrl(wearing('steel_plate'))).toBe('/assets/spritesheets/hero_steel_v2.png');
    expect(playerSpriteUrl(wearing('dragon_scale_armor'))).toBe('/assets/spritesheets/hero_dragon_v2.png');
    expect(heroSheet(wearing('demonhide_vest'))).toBe('hero_iron_v2');
    expect(heroSheet(wearing('bloodvein_plate'))).toBe('hero_steel_v2');
  });

  it('the weapon never matters: a peasant with a forged sword is still the peasant sheet', () => {
    const s = defaultSave();
    const sword = createGearInstance('iron_short_sword', { id: 't_sword', origin: 'craft', rarity: 'common' });
    const armed: SaveData = { ...s, gearInstances: { ...s.gearInstances, [sword.id]: sword }, equipped: { ...s.equipped, weapon: sword.id } };
    expect(heroSheet(armed)).toBe('hero_peasant_v2');
  });

  it('a helmet or shield never changes the look either', () => {
    const s = wearing('iron_chainmail');
    const helm = createGearInstance('iron_helm', { id: 't_helm', origin: 'craft', rarity: 'common' });
    const withHelm: SaveData = { ...s, gearInstances: { ...s.gearInstances, [helm.id]: helm }, equipped: { ...s.equipped, helmet: helm.id } };
    expect(heroSheet(withHelm)).toBe('hero_iron_v2');
  });

  it('taking the armor off shows the peasant again', () => {
    const knight = wearing('iron_chainmail');
    expect(heroSheet(knight)).toBe('hero_iron_v2');
    expect(heroSheet(bare(knight))).toBe('hero_peasant_v2');
  });

  it('a skin the hero owns (and the Pass) wins over every armor', () => {
    expect(heroSheet(withSkin(defaultSave()))).toBe('knight_golden');
    for (const a of ARMORS) expect(heroSheet(withSkin(wearing(a.id))), a.id).toBe('knight_golden');
    expect(playerSpriteUrl(withSkin(defaultSave()))).toBe('/assets/spritesheets/knight_golden.png');
  });

  it('an unknown, un-owned or Pass-less skin falls back to the armor-driven look', () => {
    expect(heroSheet(withSkin(defaultSave(), { activeSkin: 'skin_nope' }))).toBe('hero_peasant_v2');
    expect(heroSheet(withSkin(wearing('dragon_scale_armor'), { activeSkin: 'skin_nope' }))).toBe('hero_dragon_v2');
    expect(heroSheet(withSkin(defaultSave(), { cosmetics: [] }))).toBe('hero_peasant_v2'); // not owned
    expect(heroSheet(withSkin(wearing('steel_plate'), { cosmetics: [] }))).toBe('hero_steel_v2');
    expect(heroSheet(withSkin(defaultSave(), { hasBattlePass: false }))).toBe('hero_peasant_v2'); // no Pass
    expect(heroSheet({ ...defaultSave(), activeSkin: null })).toBe('hero_peasant_v2');
  });

  it('the gilded look is its own sheet, not the Pass skin', () => {
    expect(heroSheetUrl('hero_dark_knight')).not.toBe(heroSheetUrl('knight_golden'));
    expect(heroSheet(wearing('gilded_aegis'))).toBe('hero_dark_knight');
  });
});

describe('seen looks and the first-time moment', () => {
  it('looksUpTo lists the looks in progression order, never the peasant', () => {
    expect(looksUpTo('hero_peasant_v2')).toEqual([]);
    expect(looksUpTo('hero_steel_v2')).toEqual(['hero_bronze_v2', 'hero_iron_v2', 'hero_steel_v2']);
    expect(looksUpTo('hero_abyssal_v2')).toEqual(HERO_LOOKS.slice(1));
  });

  it('each look fires once, in any order; unequip and re-equip never repeats; the peasant never fires', () => {
    let s = defaultSave();
    expect(withLookMoment(s)).toBeNull();
    for (const [armor, look] of [['bronze_leather', 'hero_bronze_v2'], ['steel_plate', 'hero_steel_v2'], ['dragon_scale_armor', 'hero_dragon_v2']] as const) {
      const m = withLookMoment(wearing(armor, s));
      expect(m?.look, armor).toBe(look);
      expect(m?.armorNameKey).toBe(armor);
      s = m!.save;
      expect(s.seenLooks).toContain(look);
      expect(withLookMoment(s)).toBeNull(); // already recorded
    }
    // back to the rags and into an already-seen armor: nothing
    expect(withLookMoment(bare(s))).toBeNull();
    expect(withLookMoment(wearing('bronze_leather', bare(s)))).toBeNull();
    // a look reached out of order still fires once, and a unique wearing a twin's look fires that look
    expect(withLookMoment(wearing('abyssal_bulwark', s))?.look).toBe('hero_abyssal_v2');
    expect(withLookMoment(wearing('demonhide_vest', defaultSave()))?.look).toBe('hero_iron_v2');
  });

  it('a skin does not hide or trigger the moment: it follows the armor', () => {
    const start = withSkin(defaultSave());
    expect(withLookMoment(start)).toBeNull();
    expect(withLookMoment(wearing('bronze_leather', start))?.look).toBe('hero_bronze_v2');
  });

  it('old saves load with every look up to their current armor seen, and nothing above it', () => {
    const old = wire(wearing('iron_chainmail'));
    delete (old as unknown as Record<string, unknown>).seenLooks;
    const loaded = normalizeSave(old);
    expect(loaded.seenLooks).toEqual(['hero_bronze_v2', 'hero_iron_v2']);
    expect(withLookMoment(loaded)).toBeNull(); // wears iron: no celebration
    expect(withLookMoment(wearing('bronze_leather', loaded))).toBeNull(); // a lower look: none
    expect(withLookMoment(wearing('steel_plate', loaded))?.look).toBe('hero_steel_v2'); // a higher one still celebrates
  });

  it('a hero in dragon armor loads as the dragon look with everything up to it seen; the rags load with nothing seen', () => {
    const d = normalizeSave(wire(wearing('dragon_scale_armor')));
    expect(heroSheet(d)).toBe('hero_dragon_v2');
    expect(d.seenLooks).toEqual(['hero_bronze_v2', 'hero_iron_v2', 'hero_steel_v2', 'hero_dark_knight', 'hero_dragon_v2']);
    expect(normalizeSave(wire(defaultSave())).seenLooks).toEqual([]);
  });

  it('migrates the old heroKnighted flag to a set containing the knight (and the looks below it)', () => {
    const old = wire(defaultSave());
    delete (old as unknown as Record<string, unknown>).seenLooks;
    (old as unknown as Record<string, unknown>).heroKnighted = true;
    const loaded = normalizeSave(old);
    expect(loaded.seenLooks).toContain('hero_steel_v2');
    expect(withLookMoment(wearing('steel_plate', loaded))).toBeNull();
  });

  it('the stored list round-trips; unknown ids and the peasant are dropped', () => {
    const s = wire({ ...defaultSave(), seenLooks: ['hero_dark_knight', 'peasant', 'nope', 42] });
    expect(normalizeSave(s).seenLooks).toEqual(['hero_dark_knight']);
    expect(normalizeSave(wire(normalizeSave(wire({ ...wearing('steel_plate') })))).seenLooks).toEqual(['hero_bronze_v2', 'hero_iron_v2', 'hero_steel_v2']);
  });

  it('look ids from before the new hero art map to the look that replaced them instead of being dropped', () => {
    const s = wire({ ...defaultSave(), seenLooks: ['bronze', 'dragon', 'iron', 'knight', 'hero_gilded', 'hero_voidsteel', 'hero_abyssal'] });
    expect(normalizeSave(s).seenLooks).toEqual(['hero_bronze_v2', 'hero_iron_v2', 'hero_steel_v2', 'hero_dark_knight', 'hero_dragon_v2', 'hero_voidsteel_v2', 'hero_abyssal_v2']);
  });
});
