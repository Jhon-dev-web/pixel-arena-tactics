import { createElement as h } from 'react';
import { Dialog } from '../../components/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import TaticasView from '../../components/TaticasView';
import { setLocale, t } from '../../locales';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import { defaultSave, effectiveRotation } from '../engine';
import { AbilityId, abilityCdScale, abilityDef } from '../abilities';

// The rotation on the Taticas screen is a list of rows, and the whole point of the rows is that the player moves an ability with ONE tap on its own row (before, he had to select it and then use the footer). The
// grid of what the gear grants stays images only. Nothing here can show on a green screen if it breaks: a row that lost its name, its source or one of its two buttons still renders.
describe('Taticas: the rotation rows', () => {
  beforeEach(() => setLocale('pt'));
  const save = automaticRotation(hero('2', 3, { level: 15 }));
  const html = renderToStaticMarkup(h(TaticasView, { save, onApply: () => undefined }));
  const rotation = effectiveRotation(save);

  it('every filled row carries its name, its source, its cooldown and the up and down buttons', () => {
    expect(rotation.length).toBeGreaterThan(1);
    const rows = html.split('class="tc-row"').slice(1);
    expect(rows.length).toBe(4);
    rotation.forEach((id, i) => {
      const row = rows[i];
      expect(row, id).toContain(t(`tactics.names.${id}`));
      expect(row, id).toMatch(/(Arma|Peitoral): /);
      expect(row, id).toContain('Recarga ');
      for (const k of ['up', 'down']) expect(row, `${id} ${k}`).toContain(`aria-label="${t(`tactics.${k}`)}: ${t(`tactics.names.${id}`)}"`);
    });
  });

  it('the first row cannot go up and the last filled one cannot go down', () => {
    const rows = html.split('class="tc-row"').slice(1);
    const up = (row: string) => new RegExp(`<button[^>]*disabled=""[^>]*aria-label="${t('tactics.up')}:`).test(row) || new RegExp(`<button[^>]*aria-label="${t('tactics.up')}:[^>]*disabled=""`).test(row);
    const down = (row: string) => new RegExp(`<button[^>]*disabled=""[^>]*aria-label="${t('tactics.down')}:`).test(row) || new RegExp(`<button[^>]*aria-label="${t('tactics.down')}:[^>]*disabled=""`).test(row);
    expect(up(rows[0])).toBe(true);
    expect(up(rows[1])).toBe(false);
    expect(down(rows[rotation.length - 1])).toBe(true);
    expect(down(rows[0])).toBe(false);
  });

  it('the grid of what the gear grants keeps the images only: no cooldown or source text on its tiles', () => {
    const grid = html.slice(html.indexOf('class="tc-grid"'));
    const tiles = grid.slice(0, grid.indexOf('</ul>'));
    expect(tiles).not.toContain('Recarga ');
    expect(tiles).not.toContain('Arma: ');
  });
});

describe('Taticas with the starting gear (tier 0)', () => {
  beforeEach(() => setLocale('pt'));
  it('says why it is empty and what to do, in both languages, instead of showing empty rows', () => {
    for (const lang of ['pt', 'en'] as const) {
      setLocale(lang);
      const html = renderToStaticMarkup(h(TaticasView, { save: defaultSave(), onApply: () => undefined }));
      expect(html).toContain(t('tactics.noGear'));
      expect(html).not.toContain('class="tc-row"');
      expect(html).not.toContain('class="tc-grid"');
    }
    expect(t('tactics.noGear')).not.toBe('tactics.noGear');
  });
});

// Found by a review on 29/10 reading the screen against the engine: every cooldown is multiplied by abilityCdScale(level) since the AGI scaling landed that morning, and the screen was still printing the raw
// tunable. A level 40 hero read "4.5s" for an ability that fires every 5.3s. The number on the screen has to be the number the player gets, and this is the guard that keeps it that way.
describe('Taticas: the cooldown shown is the one the hero gets', () => {
  beforeEach(() => setLocale('pt'));
  const label = (level: number, id: AbilityId): string => {
    const save = automaticRotation(hero('2', 3, { level }));
    const html = renderToStaticMarkup(h(TaticasView, { save, onApply: () => undefined }));
    const row = html.split('class="tc-row"').slice(1)[effectiveRotation(save).indexOf(id)];
    return row.slice(row.indexOf('tc-row-meta'));
  };

  it('a low level hero sees a LONGER cooldown than the raw tunable, and a level 100 hero sees the raw one', () => {
    const id = effectiveRotation(automaticRotation(hero('2', 3, { level: 15 })))[0];
    const raw = abilityDef(id)!.cooldownMs;
    const seconds = (ms: number): number => Math.round((ms / 1000) * 10) / 10;

    expect(abilityCdScale(15)).toBeGreaterThan(1);
    expect(abilityCdScale(100)).toBe(1);
    expect(label(15, id)).toContain(t('tactics.cooldown', { s: seconds(raw * abilityCdScale(15)) }));
    expect(label(100, id)).toContain(t('tactics.cooldown', { s: seconds(raw) }));
    // the bug this replaces: the two levels printed the same number
    expect(label(15, id)).not.toBe(label(100, id));
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
