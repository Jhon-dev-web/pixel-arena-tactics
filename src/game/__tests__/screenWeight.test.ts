import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BattlePassView from '../../components/BattlePassModal';
import CalendarScreen from '../../components/calendar/CalendarScreen';
import CodexModal from '../../components/CodexModal';
import DeliveryModal from '../../components/DeliveryModal';
import ForgeView from '../../components/ForgeModal';
import GardenModal from '../../components/GardenModal';
import GatheringModal from '../../components/GatheringModal';
import InventoryModal from '../../components/InventoryModal';
import PersonagemView from '../../components/PersonagemView';
import QuestsModal from '../../components/QuestsModal';
import ShopModal from '../../components/ShopModal';
import TaticasView from '../../components/TaticasView';
import { setLocale, t } from '../../locales';
import { automaticRotation, hero } from '../../../scripts/sim/duel';
import { defaultSave, SaveData } from '../engine';
import { codexProgress } from '../codex';
import { applyCalendarEvents, devMockCalendar } from '../eventCalendar';
import { xpToReachLevel } from '../heroLevel';
import { ensureDeliveryOffers } from '../deliveries';
import { inventoryCapacity, inventorySlotsUsed } from '../inventory';
import { MATERIALS } from '../materials';
import { skillXpToReachLevel } from '../skills';
import T from '../tunables';
import { playerLevel } from '../engine';

// "The interface carries too many things" (30/10): the weight is not in one big screen, it is in the same few shapes repeated on every screen. These guards pin the two shapes that can come back without any sign
// on a green test run: a modal that says its title twice (the ModalShell head plus a panel or a PageHeader of its own), and a screen that stacks more than three panels before the first folded one.
//
// jsdom would not help (it computes no heights), so the unit is the markup: a small reader walks the tags of renderToStaticMarkup, tracks which element is inside which, and counts the FIRST-LEVEL panels (a `ui-panel`
// that is not inside another one) in document order up to the first folded panel (a <details class="ui-panel">). A sticky action bar (`ui-bar`) is a bar, not a block of content, and is not counted.

vi.mock('../../hooks/useIsPhone', () => ({ default: () => true }));

const noop = () => undefined;
const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'path', 'circle', 'rect', 'line']);

interface PanelRead {
  firstLevel: { index: number; fold: boolean; bar: boolean }[];
  pageHeads: number;
  panelTitles: string[];
  modalTitles: string[];
}

function readPanels(html: string): PanelRead {
  const out: PanelRead = { firstLevel: [], pageHeads: 0, panelTitles: [], modalTitles: [] };
  const stack: { tag: string; panel: boolean }[] = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = tag.exec(html))) {
    const [, closing, name, attrs, selfClose] = m;
    const lower = name.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === lower) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const classes = cls.split(/\s+/);
    if (classes.includes('ui-pagehead')) out.pageHeads++;
    const isPanel = classes.includes('ui-panel');
    if (isPanel && !stack.some((s) => s.panel)) out.firstLevel.push({ index: n++, fold: lower === 'details', bar: classes.includes('ui-bar') });
    if (classes.includes('ui-panel-title')) {
      const end = html.indexOf('</', m.index);
      out.panelTitles.push(html.slice(m.index + m[0].length, end));
    }
    if (classes.includes('ui-pagehead-title')) {
      const end = html.indexOf('</', m.index);
      out.modalTitles.push(html.slice(m.index + m[0].length, end));
    }
    if (VOID.has(lower) || selfClose) continue;
    stack.push({ tag: lower, panel: isPanel });
  }
  return out;
}

// the first-level panels (bars left out) that sit before the first folded one
const panelsBeforeFold = (html: string): number => {
  const panels = readPanels(html).firstLevel.filter((p) => !p.bar);
  const firstFold = panels.findIndex((p) => p.fold);
  return firstFold === -1 ? panels.length : firstFold;
};

const level40 = (): SaveData => ({ ...defaultSave(), xp: xpToReachLevel(40) });
const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);

const SCREENS: { name: string; render: () => string; modal: boolean }[] = [
  {
    name: 'Personagem',
    modal: false,
    render: () =>
      html(
        h(PersonagemView, {
          save: level40(),
          spriteUrl: '/x.png',
          onAttrChange: noop,
          onSuggestAttrs: noop,
          onEquip: noop,
          onUnequip: noop,
          onSelectTitle: noop,
          onSelectFrame: noop,
          onSelectSkin: noop,
          onDiscard: noop,
          onReforge: noop,
          onLapidar: noop,
          onSalvage: noop,
          onUseConsumable: noop,
          onExpandInventory: noop,
          onOpenSkills: noop,
        }),
      ),
  },
  { name: 'Forja', modal: false, render: () => html(h(ForgeView, { save: level40(), onForge: noop, onUpgrade: noop, onUpgradeWithCatalyst: noop, onRepair: noop, onSocket: noop, onUnsocket: noop })) },
  {
    name: 'Passe (sem Passe)',
    modal: false,
    render: () => html(h(BattlePassView, { save: level40(), onActivate: noop, passFlow: 'idle', onRecheck: noop, onClaim: noop, onClaimAll: () => ({ claimed: 0, blocked: 0 }) })),
  },
  { name: 'Táticas', modal: false, render: () => html(h(TaticasView, { save: automaticRotation(hero('2', 3, { level: 40 })) })) },
  {
    name: 'Horta',
    modal: true,
    render: () => html(h(GardenModal, { save: level40(), onPlant: noop, onHarvest: noop, onUproot: noop, onFertilize: noop, onClose: noop })),
  },
  {
    name: 'Pedidos',
    modal: true,
    render: () =>
      html(
        h(DeliveryModal, {
          save: ensureDeliveryOffers(level40(), Date.now(), () => 0.5, false),
          passActive: false,
          onAccept: noop,
          onClaim: noop,
          onReroll: noop,
          onUseTicket: noop,
          onClaimLegacy: noop,
          onUseLegacyTicket: noop,
          onClose: noop,
        }),
      ),
  },
  {
    name: 'Loja',
    modal: true,
    render: () => html(h(ShopModal, { save: level40(), onBuyConsumable: noop, onBuyGem: noop, onSell: noop, onSellWholesale: noop, onCreatePouch: noop, onOpenPouch: noop, onClose: noop })),
  },
  {
    name: 'Missões',
    modal: true,
    render: () => html(h(QuestsModal, { save: level40(), onClaim: noop, ownsPass: false, onClaimWeekly: noop, onClaimWeeklyBonus: noop, onClaimStreak: noop, onClose: noop })),
  },
  { name: 'Mineração', modal: true, render: () => html(h(GatheringModal, { kind: 'mining', save: level40(), onStart: noop, onClaim: noop, onCancel: noop, onClose: noop })) },
  { name: 'Lenhador', modal: true, render: () => html(h(GatheringModal, { kind: 'woodcutting', save: level40(), onStart: noop, onClaim: noop, onCancel: noop, onClose: noop })) },
  { name: 'Códice', modal: true, render: () => html(h(CodexModal, { save: level40(), onClose: noop })) },
  {
    // a screen, not a modal (it has its own PageHeader); the sample calendar is the one the dev build loads with ?calendarMock=1
    name: 'Calendário',
    modal: false,
    render: () => {
      applyCalendarEvents(devMockCalendar());
      return html(h(CalendarScreen));
    },
  },
  {
    name: 'Inventário',
    modal: true,
    render: () => html(h(InventoryModal, { save: level40(), onEquip: noop, onUnequip: noop, onDiscard: noop, onReforge: noop, onLapidar: noop, onSalvage: noop, onUseConsumable: noop, onExpand: noop, onClose: noop })),
  },
];

describe('a modal says its title once', () => {
  beforeEach(() => setLocale('pt'));
  for (const s of SCREENS.filter((x) => x.modal)) {
    it(`${s.name}: one header (the ModalShell's), and no panel repeats the title`, () => {
      const out = html2(s.render());
      expect(out.pageHeads, 'a PageHeader inside a ModalShell body doubles its header').toBe(1);
      expect(out.modalTitles).toHaveLength(1);
      expect(out.panelTitles, `a panel titled "${out.modalTitles[0]}" under the modal that already says it`).not.toContain(out.modalTitles[0]);
    });
  }
});

const html2 = (markup: string): PanelRead => readPanels(markup);

describe('at most three panels before the first folded one', () => {
  beforeEach(() => setLocale('pt'));
  for (const s of SCREENS) {
    it(`${s.name}: ${'≤'} 3 first-level panels before the first fold`, () => {
      const markup = s.render();
      // the Forja list and the Inventário are lists of rows, not of panels (the Forja panel opens under a tapped row): the reader finds none there, and that is right
      if (!['Forja', 'Inventário'].includes(s.name)) expect(readPanels(markup).firstLevel.length, 'the reader found no panel at all: the markup changed shape').toBeGreaterThan(0);
      expect(panelsBeforeFold(markup)).toBeLessThanOrEqual(3);
    });
  }

  it('the reader counts what it should: a fold ends the run, a sticky bar is not a block, a nested panel is not first-level', () => {
    const sample =
      '<div><section class="ui-panel"><div class="ui-panel">in</div></section><section class="ui-panel ui-bar">bar</section><section class="ui-panel">b</section><details class="ui-panel pg-fold">f</details><section class="ui-panel">after</section></div>';
    expect(readPanels(sample).firstLevel).toHaveLength(5);
    expect(panelsBeforeFold(sample)).toBe(2);
  });
});

// What must NOT be lost by the cuts. Each of these used to be on the screen and nothing but a test notices when a rework drops it.
describe('what the lean screens still say', () => {
  beforeEach(() => setLocale('pt'));

  it('Personagem: the attribute points to spend and the "Sugerir" button are on the closed Atributos fold itself', () => {
    const save = level40(); // a hero who has spent nothing: every point is still free
    const out = SCREENS[0].render();
    const left = playerLevel(save.xp) * 3;
    const summary = out.slice(out.indexOf('id="pg-attrs"'), out.indexOf('</summary>', out.indexOf('id="pg-attrs"')));
    expect(summary).toContain(t('attributes.points', { n: left }));
    expect(summary).toContain('data-tutorial-target="attrs-suggest"');
    // closed on a phone (the hook above says phone): the combat table and the four rows are one tap away
    expect(out.slice(out.indexOf('id="pg-attrs"') - 80, out.indexOf('id="pg-attrs"') + 20)).not.toContain(' open=""');
  });

  it('Personagem: the set bonus and the class affinity are one summary line with both heads', () => {
    const steel = hero('2', 3, { level: 40 });
    const out = html(
      h(PersonagemView, {
        save: steel,
        spriteUrl: '/x.png',
        onAttrChange: noop,
        onEquip: noop,
        onUnequip: noop,
        onSelectTitle: noop,
        onSelectFrame: noop,
        onSelectSkin: noop,
        onDiscard: noop,
        onReforge: noop,
        onLapidar: noop,
        onSalvage: noop,
        onUseConsumable: noop,
        onExpandInventory: noop,
        onOpenSkills: noop,
      }),
    );
    const sum = out.slice(out.indexOf('pg-setfold-sum'), out.indexOf('</summary>', out.indexOf('pg-setfold-sum')));
    expect(sum).toContain(t('affinity.title'));
  });

  it('Horta: the full-bag warning stays above the plots, and the locked plots are one row that lists their levels', () => {
    const now = Date.now();
    let save: SaveData = { ...level40(), skillXp: { ...level40().skillXp, gardening: skillXpToReachLevel(5, 'gardening') } };
    save = { ...save, gardenSlots: save.gardenSlots.map((s, i) => (i === 0 ? { ...s, plantId: 'common_herb' as never, startedAt: now - 1000 * 3600 * 1000 } : s)) };
    // fill the bag: every material takes a stack
    const materials = { ...save.materials };
    for (const m of MATERIALS) materials[m.id] = 99;
    save = { ...save, materials };
    expect(inventorySlotsUsed(save)).toBeGreaterThanOrEqual(inventoryCapacity(save));
    const out = html(h(GardenModal, { save, onPlant: noop, onHarvest: noop, onUproot: noop, onFertilize: noop, onClose: noop }));
    expect(out).toContain(t('garden.bagFull'));
    expect((out.match(/gd-plot locked/g) ?? []).length).toBe(1);
  });

  it('Pedidos: "faltam materiais" is still the label of the button when the hero cannot afford the order', () => {
    const save = { ...ensureDeliveryOffers(level40(), Date.now(), () => 0.5, false), materials: {} } as SaveData;
    const out = html(h(DeliveryModal, { save, passActive: false, onAccept: noop, onClaim: noop, onReroll: noop, onUseTicket: noop, onClaimLegacy: noop, onUseLegacyTicket: noop, onClose: noop }));
    expect(out).toContain(t('deliveries.missing'));
    expect(out).toContain('ord-more-sum short'); // and the closed card says how many of its materials are held
  });

  it('Passe: the buy button and "claim all" are in the stuck bar, and every perk the Pass promises is still on the page', () => {
    const out = SCREENS[2].render();
    const bar = out.slice(out.indexOf('pa-foot'));
    expect(bar).toContain('pa-buy-btn');
    expect(bar).toContain('pa-claimall');
    expect(out).toContain(t('battlePass.buyBlurb', { h: T.battlePass.capHours }).slice(0, 20));
  });

  it('Códice: the gear tab is one row per slot (a fold with its count) and only the first slot starts open', () => {
    const out = SCREENS.find((x) => x.name === 'Códice')!.render();
    expect((out.match(/<details class="ui-panel pg-fold"/g) ?? []).length, 'every slot of the gear tab is a fold: eleven open panels were 5,4 screens on a phone').toBeGreaterThanOrEqual(6);
    expect(out.match(/<details class="ui-panel pg-fold" open=""/g) ?? []).toHaveLength(1);
    const gear = codexProgress(level40().codex).items;
    expect(out).toContain(t('codex.hint', { n: gear.found, m: gear.total })); // the count of the tab is still on the screen, as one plain line
  });

  it('Calendário: only the next event is an open card; the other upcoming ones, Passados and Liga are folds that hold their text', () => {
    const out = SCREENS.find((x) => x.name === 'Calendário')!.render();
    const upcoming = out.slice(out.indexOf('data-testid="cal-upcoming"'), out.indexOf('data-testid="cal-month"'));
    const cards = (upcoming.match(/data-testid="cal-item"/g) ?? []).length;
    const folded = (upcoming.match(/class="cal-fold"/g) ?? []).length;
    expect(cards, 'the sample has several upcoming events').toBeGreaterThan(2);
    expect(cards - folded).toBe(1);
    expect(upcoming).toContain(t('events.startsIn', { t: '' }).slice(0, 6)); // and that one open card is the one with the countdown
    expect(out).toContain('<details class="ui-panel pg-fold cal-section" data-testid="cal-past"');
    expect(out).toContain('<details class="ui-panel pg-fold cal-section" data-testid="cal-league"');
    expect(out).toContain(t('calendar.leagueNote')); // the League note moved inside its fold, it did not go away
  });
});
