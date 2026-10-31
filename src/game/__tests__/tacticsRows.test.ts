import { createElement as h } from 'react';
import { Dialog } from '../../components/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import TaticasView from '../../components/TaticasView';
import { setLocale, t } from '../../locales';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import { buildCombatStats, defaultSave, effectiveRotation, SaveData } from '../engine';
import { AbilityId, abilityCdScale, abilityDef } from '../abilities';
import { GEAR } from '../gear';
import { createGearInstance } from '../gearInstances';

// The Taticas screen (2026-10-31) has three blocks and NOTHING to choose: the basic attack, the abilities the worn gear grants (every one of them fires by itself), and the passives. What can break without any sign on
// a green screen: an ability that lost its cooldown or one of its effects, a cooldown that went back to the raw tunable (the 29/10 bug: a level 40 hero read 4.5 s for an ability that fires every 5.3 s), a basic attack
// that prints a made-up interval, or a control that comes back and promises a choice the engine no longer reads.

const render = (save: SaveData): string => renderToStaticMarkup(h(TaticasView, { save }));
// the same one-decimal format as the screen, with the comma of Portuguese
const dec = (n: number): string => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');
const wear = (base: SaveData, slot: 'weapon' | 'armor', templateId: string): SaveData => {
  const inst = createGearInstance(templateId, { id: `gi_test_${templateId}`, origin: 'craft', rarity: 'common', substats: [], upgrade: 0 });
  return { ...base, gearInstances: { ...base.gearInstances, [inst.id]: inst }, equipped: { ...base.equipped, [slot]: inst.id } };
};
// the rows of the abilities block, one string per ability, in the order of the screen
const abilityRows = (html: string): string[] => html.split('class="tc-ab"').slice(1).map((r) => r.slice(0, r.indexOf('</li>')));

describe('Taticas: the abilities block', () => {
  beforeEach(() => setLocale('pt'));
  const save = automaticRotation(hero('2', 3, { level: 15 }));
  const html = render(save);
  const granted = effectiveRotation(save);

  it('every ability the gear grants has its row, with name, source, icon and every effect in words, and no more rows than that', () => {
    expect(granted.length).toBeGreaterThan(1);
    const rows = abilityRows(html);
    expect(rows).toHaveLength(granted.length);
    granted.forEach((id, i) => {
      const def = abilityDef(id)!;
      expect(rows[i], id).toContain(t(`tactics.names.${id}`));
      expect(rows[i], id).toMatch(/(Arma|Peitoral): /);
      expect(rows[i], id).toContain(def.icon);
      expect((rows[i].match(/class="tc-ab-fx"/g) ?? []).length, `${id} effects`).toBe(def.effects.length);
    });
  });

  it('says that they fire by themselves, and that the longer cooldown fires less often', () => {
    expect(html).toContain(t('tactics.auto.rule'));
  });

  it('the cooldown shown is the one the hero gets: longer than the raw tunable at a low level, the raw one at level 100', () => {
    const rowOf = (level: number, id: AbilityId): string => {
      const s = automaticRotation(hero('2', 3, { level }));
      return abilityRows(render(s))[effectiveRotation(s).indexOf(id)];
    };
    const id = granted[0];
    const raw = abilityDef(id)!.cooldownMs;
    expect(abilityCdScale(15)).toBeGreaterThan(1);
    expect(abilityCdScale(100)).toBe(1);
    expect(rowOf(15, id)).toContain(t('tactics.cooldown', { s: dec((raw * abilityCdScale(15)) / 1000) }));
    expect(rowOf(100, id)).toContain(t('tactics.cooldown', { s: dec(raw / 1000) }));
    expect(rowOf(15, id)).not.toBe(rowOf(100, id)); // the bug this replaces: the two levels printed the same number
  });

  it('every ability of every weapon line and chestpiece weight shows its own real cooldown', () => {
    const weapons = ['iron_short_sword', 'short_bow', 'oak_staff'];
    const chests = [GEAR.find((g) => g.slot === 'armor' && g.weight === 'leather')!.id, GEAR.find((g) => g.slot === 'armor' && g.weight === 'cloth')!.id];
    for (const w of weapons) {
      for (const c of chests) {
        const s = wear(wear(automaticRotation(hero('2', 3, { level: 40 })), 'weapon', w), 'armor', c);
        const rows = abilityRows(render(s));
        const ids = effectiveRotation(s);
        expect(rows).toHaveLength(ids.length);
        ids.forEach((id, i) => expect(rows[i], `${w} + ${c}: ${id}`).toContain(t('tactics.cooldown', { s: dec((abilityDef(id)!.cooldownMs * abilityCdScale(40)) / 1000) })));
      }
    }
  });
});

describe('Taticas: the basic attack', () => {
  beforeEach(() => setLocale('pt'));

  it('shows the weapon worn, the damage of a hit and the real interval between hits (they move with the gear and the AGI)', () => {
    const slow = automaticRotation({ ...hero('2', 3, { level: 40 }), agi: 0 });
    const quick = automaticRotation({ ...hero('2', 3, { level: 40 }), agi: 300 });
    for (const s of [slow, quick]) {
      const stats = buildCombatStats(s);
      const html = render(s);
      expect(html).toContain(t('tactics.basic.hit', { n: Math.round(stats.dmgBase) }));
      expect(html).toContain(t('tactics.basic.every', { s: dec(stats.heroMs / 1000) }));
      expect(html).toContain(t('gear.iron_short_sword'));
    }
    expect(buildCombatStats(slow).heroMs).toBeGreaterThan(buildCombatStats(quick).heroMs);
    expect(render(slow)).not.toBe(render(quick));
  });

  it('is there with the starting gear too, in both languages, beside the note that the gear grants no ability', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLocale(lang);
      const html = render(defaultSave());
      expect(html).toContain(t('tactics.basic.title'));
      expect(html).toContain(t('gear.wooden_club'));
      expect(html).toContain(t('tactics.noGear'));
      expect(html).not.toContain('class="tc-ab"');
      expect(t('tactics.noGear')).not.toBe('tactics.noGear');
    }
  });
});

describe('Taticas: nothing to choose', () => {
  beforeEach(() => setLocale('pt'));
  it('has no button, no list to order and nothing that apply or undo, for a hero with abilities and passives and for one with neither', () => {
    for (const s of [automaticRotation(hero('3', 3, { level: 40 })), defaultSave()]) {
      const html = render(s);
      expect(html).not.toContain('<button');
      expect(html).not.toContain('ui-btn');
      expect(html).not.toContain('aria-pressed');
    }
  });
});

describe('Dialog as a dismissable card', () => {
  it('shows the X only when it can be dismissed: a dialog that must be answered (a reward, a result) stays without one', () => {
    const withClose = renderToStaticMarkup(h(Dialog, { title: 'a', onClose: () => undefined, closeLabel: 'Fechar', children: 'x' }));
    const without = renderToStaticMarkup(h(Dialog, { title: 'a', children: 'x' }));
    expect(withClose).toContain('aria-label="Fechar"');
    expect(without).not.toContain('ui-modal-close');
  });
});
