import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import ForgeView from '../../components/ForgeModal';
import { showForgeClassNote } from '../../components/forgeFilter';
import { AFFINITY_WEIGHTS, CLASS_OF_WEIGHT } from '../affinity';
import { defaultSave } from '../engine';
import { setLocale, t } from '../../locales';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

// The first forge says where the class comes from. The note is a rule that would break silently: it must show for a hero who has forged nothing with the class filter on 'all', and never otherwise (not after the
// first forge, not over a list the player already narrowed to one class).
const noop = () => undefined;
const render = (itemsForged: number): string => {
  const save = defaultSave();
  return renderToStaticMarkup(h(ForgeView, { save: { ...save, stats: { ...save.stats, itemsForged } }, onForge: noop, onUpgrade: noop, onUpgradeWithCatalyst: noop, onRepair: noop, onSocket: noop, onUnsocket: noop }));
};

describe('the first-forge note', () => {
  beforeEach(() => setLocale('pt'));

  it('shows on a hero who forged nothing, in both languages, and is gone after the first forge', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLocale(lang);
      const note = t('forge.classNote');
      expect(note).not.toBe('forge.classNote');
      expect(render(0)).toContain(note);
      expect(render(1)).not.toContain(note);
    }
  });

  it('only with the class filter on All', () => {
    expect(showForgeClassNote(0, 'all')).toBe(true);
    for (const f of ['warrior', 'archer', 'mage'] as const) expect(showForgeClassNote(0, f), f).toBe(false);
    expect(showForgeClassNote(1, 'all')).toBe(false);
  });

  // The note pairs each armor weight with a class, and affinity.ts is what really decides (the leading weight of the five weight slots, CLASS_OF_WEIGHT). A note that swapped a pair, dropped a weight or went back to
  // claiming a slot decides would be a text that lies about the code, which is the defect this repository produces most: it names the three weights, in the order of the mapping, and names no slot.
  const pairsInOrder = (note: string, weightWord: (w: 'plate' | 'leather' | 'cloth') => string, classWord: (c: 'warrior' | 'archer' | 'mage') => string): void => {
    const low = note.toLowerCase();
    let cursor = -1;
    for (const w of AFFINITY_WEIGHTS) {
      const atWeight = low.indexOf(weightWord(w).toLowerCase(), cursor + 1);
      expect(atWeight, `weight ${w} in "${note}"`).toBeGreaterThan(cursor);
      const cls = classWord(CLASS_OF_WEIGHT[w]).toLowerCase();
      const atClass = low.indexOf(cls, atWeight);
      expect(atClass, `${w} followed by ${CLASS_OF_WEIGHT[w]} in "${note}"`).toBeGreaterThan(atWeight);
      cursor = atClass;
    }
  };

  it('pairs each weight with the class affinity.ts gives it, in both languages', () => {
    pairsInOrder(pt.forge.classNote, (w) => pt.affinity.weight[w], (c) => pt.forge[`class_${c}`]);
    pairsInOrder(en.forge.classNote, (w) => en.affinity.weight[w], (c) => en.forge[`class_${c}`]);
  });

  it('promises no slot and allows mixing, in both languages', () => {
    for (const [note, slots, mix] of [
      [pt.forge.classNote, [pt.gear.armor, pt.gear.weapon, pt.gear.helmet, pt.gear.boots, pt.gear.gloves], 'misturar'],
      [en.forge.classNote, [en.gear.armor, en.gear.weapon, en.gear.helmet, en.gear.boots, en.gear.gloves], 'mixing'],
    ] as const) {
      const low = note.toLowerCase();
      for (const slot of slots) expect(low, `"${note}" must not say the ${slot} decides`).not.toContain(slot.toLowerCase());
      expect(low).toContain(mix);
    }
  });
});
