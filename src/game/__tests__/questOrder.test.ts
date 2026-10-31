import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import QuestsModal from '../../components/QuestsModal';
import { byClaimOrder } from '../../components/questOrder';
import { setLocale } from '../../locales';
import { defaultSave } from '../engine';
import { QUESTS_DAILY } from '../quests';

// The owner's rule of 31/10: a finished mission is seen first, without scrolling for it. Nothing on the screen would say it stopped working.
const noop = () => undefined;
const firstQuest = (markup: string) => /data-quest-id="([^"]+)"/.exec(markup)?.[1];

describe('finished missions come first', () => {
  beforeAll(() => setLocale('pt'));

  it('claimable, then in progress, then claimed, keeping the order of the game inside each group', () => {
    const list = [
      { id: 'a', ready: false, claimed: true },
      { id: 'b', ready: false, claimed: false },
      { id: 'c', ready: true, claimed: false },
      { id: 'd', ready: false, claimed: false },
      { id: 'e', ready: true, claimed: false },
      { id: 'f', ready: true, claimed: true },
    ];
    expect(byClaimOrder(list, (x) => x.ready, (x) => x.claimed).map((x) => x.id)).toEqual(['c', 'e', 'b', 'd', 'a', 'f']);
  });

  it('the last daily of the list, once finished, is the first card on the screen', () => {
    const last = QUESTS_DAILY[QUESTS_DAILY.length - 1];
    expect(last.id).not.toBe(QUESTS_DAILY[0].id);
    const save = defaultSave();
    const fresh = { ...save, quests: { ...save.quests, daily: { ...save.quests.daily, kills: 0, forge: 0, purchases: 0, deliveries: 0 } } };
    const done = { ...fresh, quests: { ...fresh.quests, daily: { ...fresh.quests.daily, deliveries: 1 } } };
    const render = (s: typeof save) => renderToStaticMarkup(h(QuestsModal, { save: s, onClaim: noop, ownsPass: false, onClaimWeekly: noop, onClaimWeeklyBonus: noop, onClaimStreak: noop, onClose: noop }));
    expect(firstQuest(render(fresh))).toBe(QUESTS_DAILY[0].id);
    expect(firstQuest(render(done))).toBe('daily_explorer');
  });

  it('the weekly goals and the achievements go through the same order', () => {
    const src = readFileSync(resolve(__dirname, '../../components/QuestsModal.tsx'), 'utf8');
    expect(src).toMatch(/byClaimOrder\(weekly\.goals/);
    expect(src).toMatch(/achievementsReady\.map\(card\)/);
  });
});
