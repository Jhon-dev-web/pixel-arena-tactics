import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import HuntRunning from '../../components/HuntRunning';
import HuntSelection from '../../components/HuntSelection';
import { buildHuntSession, computeHuntingStatus, defaultSave, SaveData } from '../engine';
import { equipmentIndex } from '../gearIndex';
import { HUNTING_DEPTHS, HUNTING_ZONES, isDepthUnlocked, isZoneOpen } from '../huntingZones';
import { startBlockedReason, zoneLockedText } from '../huntView';
import { playerLevel } from '../heroLevel';
import { setLocale, t } from '../../locales';

// The Hunt screens were rebuilt as three simple steps (zone cards, depth + start, the small hunt view). What must not be lost on the way is what keeps a hero from starting
// where he cannot, and what warns him before his bag overflows. None of it shows as a crash when it goes: the start button would just light up, the warning would just not print.
const noop = () => undefined;
const select = (over: Record<string, unknown> = {}, save: SaveData = defaultSave()) => renderToStaticMarkup(h(HuntSelection, { save, onStartHunt: noop, onClose: noop, ...over }));
const startTag = (html: string): string => /<button[^>]*hunt-start[^>]*>/.exec(html)?.[0] ?? '';
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => setLocale('pt'));

describe('Hunt selection: the blocks the new screen must keep', () => {
  it('a zone the hero has not unlocked cannot be started and says what opens it', () => {
    const save = defaultSave();
    const zone = HUNTING_ZONES.find((z) => !isZoneOpen(z, save.highestDungeonFloor, playerLevel(save.xp)))!;
    expect(zone, 'the default hero must have a locked zone for this test to mean anything').toBeDefined();
    const reason = zoneLockedText(zone);
    const html = select({ initialZoneId: zone.id }, save);
    expect(startTag(html)).toContain('disabled');
    expect(text(html)).toContain(t(reason.key, reason.vars)); // on the start button and on the card
    expect(html).toMatch(new RegExp(`hs-zone state-locked[^>]*>`)); // the card is marked locked
    expect(startBlockedReason(save, zone, 'shallow', equipmentIndex(save))).not.toBeNull();
  });

  it('a depth the equipment does not reach cannot be started and says what gear it asks', () => {
    const save = defaultSave();
    const gear = equipmentIndex(save);
    const zone = HUNTING_ZONES.find((z) => isZoneOpen(z, save.highestDungeonFloor, playerLevel(save.xp)) && HUNTING_DEPTHS.some((d) => !isDepthUnlocked(z, d.id, gear)))!;
    expect(zone, 'the default hero must have an open zone with a depth that is out of reach').toBeDefined();
    const depth = HUNTING_DEPTHS.find((d) => !isDepthUnlocked(zone, d.id, gear))!.id;
    const html = select({ initialZoneId: zone.id, initialDepth: depth }, save);
    const reason = startBlockedReason(save, zone, depth, gear)!;
    expect(reason.key).toBe('hunting.startNeedGear');
    expect(startTag(html)).toContain('disabled');
    expect(text(html)).toContain(t(reason.key, reason.vars));
    expect(html).toContain('hs-depth active locked'); // the picked depth is shown as locked, with its requirement under the name
    expect(text(html)).toContain(t('hunting.depthLocked', { tier: reason.vars!.tier, refine: reason.vars!.refine }));
  });

  it('an open zone at an open depth starts (the gate is not over-eager)', () => {
    const save = defaultSave();
    const zone = HUNTING_ZONES.find((z) => isZoneOpen(z, save.highestDungeonFloor, playerLevel(save.xp)))!;
    const depth = HUNTING_DEPTHS.find((d) => isDepthUnlocked(zone, d.id, equipmentIndex(save)))!.id;
    expect(startBlockedReason(save, zone, depth, equipmentIndex(save))).toBeNull();
    const tag = startTag(select({ initialZoneId: zone.id, initialDepth: depth }, save));
    expect(tag).not.toBe('');
    expect(tag).not.toContain('disabled');
  });

  it('a nearly full bag is warned about before the hunt starts, without opening "Mais detalhes"', () => {
    const save = defaultSave();
    const zone = HUNTING_ZONES.find((z) => isZoneOpen(z, save.highestDungeonFloor, playerLevel(save.xp)))!;
    const fill = Object.fromEntries(zone.drops.map((d) => [d.material, 99 * 14])) as SaveData['materials'];
    const full: SaveData = { ...save, materials: { ...save.materials, ...fill } };
    const html = select({ initialZoneId: zone.id }, full);
    const warn = html.split('class="hs-warns"')[1]?.split('class="hs-p-mats"')[0] ?? '';
    expect(warn, 'the warning block comes before the drops and outside the folded details').not.toBe('');
    expect(text(warn)).toMatch(/Inventário: \d+\/\d+/);
    expect(warn).toContain('hs-fact bad');
  });
});

describe('Hunt running view: what must stay in sight', () => {
  const HOUR = 3600 * 1000;
  // A hero that wins in the first zone, hunting for hours, with a bag that cannot take what he collected.
  const hunting = (full: boolean): SaveData => {
    const zone = HUNTING_ZONES[0];
    const start = Date.now() - 5 * HOUR;
    const base: SaveData = { ...defaultSave(), xp: 1_000_000_000, activeHuntingZone: zone.id, activeHuntingDepth: 'shallow', huntingOfflineStart: start };
    const fill = Object.fromEntries(zone.drops.map((d) => [d.material, 99 * 14])) as SaveData['materials'];
    const s: SaveData = full ? { ...base, materials: { ...base.materials, ...fill } } : base;
    return { ...s, huntSession: buildHuntSession(s, start) };
  };
  const run = (save: SaveData) => renderToStaticMarkup(h(HuntRunning, { save, onStopHunt: noop, onClose: noop }));

  it('the top bar has the time, Resumo and Resgatar, and the scene shows both lives', () => {
    const html = run(hunting(false));
    expect(computeHuntingStatus(hunting(false), Date.now()).kills, 'the test hero must be killing monsters').toBeGreaterThan(0);
    expect(html).toContain('hs-topbar');
    expect(text(html)).toContain(t('hunting.summary'));
    expect(html).toMatch(/class="[^"]*hunt-claim[^"]*"/);
    expect(html).toContain('battle-hud enemy');
    expect(html).toContain('battle-hud hero');
  });

  it('a bag that cannot hold the haul shows the warning and what would be left behind, outside the summary', () => {
    const html = run(hunting(true));
    expect(computeHuntingStatus(hunting(true), Date.now()).drops, 'the hunt must have collected something').not.toEqual({});
    expect(html).toContain('hs-alert');
    expect(text(html)).toMatch(/ficari(a|am) para trás/);
    expect(html).toContain('hs-lost'); // the left-behind list
    expect(html).not.toContain('id="hs-summary"'); // the summary is closed: the warning does not depend on opening it
  });

  it('a bag with room shows no left-behind alert', () => {
    expect(run(hunting(false))).not.toContain('hs-alert');
  });
});
