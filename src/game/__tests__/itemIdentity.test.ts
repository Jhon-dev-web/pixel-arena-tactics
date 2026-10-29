import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import ItemIdentity from '../../components/ItemIdentity';
import { itemIdentity } from '../../components/identityView';
import { AffinityWeight, CLASS_OF_WEIGHT } from '../affinity';
import { defaultSave, equippedAbilities } from '../engine';
import { GEAR, GearItem, INSTANCED_SLOTS, InstancedSlot, WeaponLine } from '../gear';
import { createGearInstance } from '../gearInstances';
import { setLocale } from '../../locales';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

// The item card says what each piece is made of (ItemIdentity: weight, style, weapon line, abilities). "You are what you wear" is empty if the player chooses blind, and the strip is a text that would lie in
// silence: a new piece with no label, a leather piece labelled as the mage's, a helmet promising an ability. Nothing on a green screen shows it, so the whole gear list is swept here, in both languages.

// The line -> weight pairing is the owner's design (the bow and the crossbow are the archer's, the staff and the scepter the mage's, the sword and the axe the warrior's), written out here on purpose: the code that
// reads it (gear.ts) must agree with it, not be copied from it.
const WEIGHT_OF_LINE: Record<WeaponLine, AffinityWeight> = { sword: 'plate', axe: 'plate', bow: 'leather', crossbow: 'leather', staff: 'cloth', scepter: 'cloth' };
const expectedWeight = (g: GearItem): AffinityWeight => (g.slot === 'weapon' ? WEIGHT_OF_LINE[g.line ?? 'sword'] : g.weight ?? 'plate');

const carriesWeight = (g: GearItem): boolean => g.slot !== 'ring' && g.slot !== 'relic' && g.tier !== 0;
const pieces = GEAR.filter(carriesWeight);
const forgeable = pieces.filter((g) => g.recipe !== undefined);

const LANGS = { pt, en } as const;
const render = (g: GearItem): string => renderToStaticMarkup(h(ItemIdentity, { item: g }));
const STYLES = ['warrior', 'archer', 'mage'] as const;

afterEach(() => setLocale('pt'));

describe('every forgeable piece says its weight, its style and (a weapon) its line', () => {
  it('the sweep reaches every slot with a weight and every weapon line, so an empty list cannot pass', () => {
    expect(new Set(forgeable.map((g) => g.slot))).toEqual(new Set(['weapon', 'armor', 'helmet', 'gloves', 'boots', 'shield']));
    expect(new Set(forgeable.filter((g) => g.slot === 'weapon').map((g) => g.line ?? 'sword'))).toEqual(new Set(Object.keys(WEIGHT_OF_LINE)));
  });

  for (const lang of ['pt', 'en'] as const) {
    it(`${lang}: the label agrees with CLASS_OF_WEIGHT, names no other style and leaves no raw key behind`, () => {
      setLocale(lang);
      const L = LANGS[lang];
      for (const g of pieces) {
        const weight = expectedWeight(g);
        const cls = CLASS_OF_WEIGHT[weight];
        const html = render(g);
        const where = `${g.id} (${lang})`;
        expect(html, where).toContain(`data-weight="${weight}"`);
        expect(html, where).toContain(`data-class="${cls}"`);
        expect(html, where).toContain(L.affinity.style[cls]);
        for (const other of STYLES.filter((s) => s !== cls)) expect(html, `${where} must not name ${other}`).not.toContain(L.affinity.style[other]);
        if (g.slot === 'weapon') expect(html, where).toContain(L.tactics.line[g.line ?? 'sword']);
        else expect(html, where).toContain(L.affinity.weight[weight]);
        expect(html, where).not.toMatch(/itemIdentity\.|affinity\.|tactics\./);
      }
    });
  }

  it('the view the strip is drawn from agrees too (weight, class, line)', () => {
    for (const g of pieces) {
      const v = itemIdentity(g)!;
      expect(v.weight, g.id).toBe(expectedWeight(g));
      expect(v.cls, g.id).toBe(CLASS_OF_WEIGHT[expectedWeight(g)]);
      expect(v.line, g.id).toBe(g.slot === 'weapon' ? g.line ?? 'sword' : null);
    }
  });
});

describe('no label where there is nothing true to say', () => {
  it('the ring, the relic and the tier 0 starting gear print nothing', () => {
    const none = GEAR.filter((g) => !carriesWeight(g));
    expect(none.some((g) => g.slot === 'ring')).toBe(true);
    expect(none.some((g) => g.slot === 'relic')).toBe(true);
    expect(none.some((g) => g.tier === 0 && g.slot === 'weapon')).toBe(true);
    expect(none.some((g) => g.tier === 0 && g.slot === 'armor')).toBe(true);
    for (const g of none) expect(render(g), g.id).toBe('');
  });
});

// The ability line must tell the truth about the ENGINE, not about this file: each piece is worn alone (the other slots stay at the tier 0 starting gear, which grants nothing) and the abilities the engine
// reports for it are what the strip announces. If equippedAbilities ever reads another slot, or a weapon line grants a different number, this lights up.
describe('abilities are announced exactly where the engine grants them', () => {
  const fresh = defaultSave();
  const wearAlone = (g: GearItem): number => {
    const inst = createGearInstance(g.id, { id: `gi_identity_${g.id}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 0 });
    const slot = g.slot as InstancedSlot;
    return equippedAbilities({ ...fresh, gearInstances: { ...fresh.gearInstances, [inst.id]: inst }, equipped: { ...fresh.equipped, [slot]: inst.id } }).length;
  };
  const wearable = GEAR.filter((g) => (INSTANCED_SLOTS as readonly string[]).includes(g.slot));

  it('the count on the card is the count the engine grants, for every wearable piece', () => {
    expect(wearable.some((g) => g.slot === 'helmet') && wearable.some((g) => g.slot === 'ring')).toBe(true);
    for (const g of wearable) expect(itemIdentity(g)?.abilities ?? 0, g.id).toBe(wearAlone(g));
  });

  for (const lang of ['pt', 'en'] as const) {
    it(`${lang}: the ability line shows for the weapon and the chestpiece and for no other piece`, () => {
      setLocale(lang);
      const L = LANGS[lang].itemIdentity;
      const noun = lang === 'pt' ? 'habilidade' : 'abilit';
      let granting = 0;
      for (const g of GEAR) {
        const html = render(g);
        const n = itemIdentity(g)?.abilities ?? 0;
        if (n > 0) {
          granting++;
          expect(['weapon', 'armor'], g.id).toContain(g.slot);
          expect(html, g.id).toContain('item-identity-abilities');
          const say = n === 1 ? L.grantsOne : L.grants.replace('{n}', String(n));
          expect(html, g.id).toContain(say);
        } else {
          expect(html, g.id).not.toContain('item-identity-abilities');
          expect(html.toLowerCase(), `${g.id} must say nothing about abilities`).not.toContain(noun);
        }
      }
      expect(granting).toBeGreaterThan(0);
    });
  }
});
