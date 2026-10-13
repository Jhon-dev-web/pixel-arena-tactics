import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHuntSession, defaultSave, SaveData } from '../engine';
import { PLANTS } from '../garden';
import { loadNotifyPref, planNotifications, readyEvents, saveNotifyPref } from '../notify';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const huntingFull = (): SaveData => {
  const base = { ...defaultSave(), activeHuntingZone: 'demon_glade', huntingOfflineStart: NOW - 48 * HOUR };
  return { ...base, huntSession: buildHuntSession(base, NOW - 48 * HOUR) };
};

describe('what is finished right now', () => {
  it('nothing on a new save', () => {
    expect(readyEvents(defaultSave(), NOW)).toEqual([]);
  });

  it('a hunt only once its storage is full, mining at its cap, a ready plot, a delivered order', () => {
    const running = { ...defaultSave(), activeHuntingZone: 'demon_glade', huntingOfflineStart: NOW - HOUR };
    expect(readyEvents({ ...running, huntSession: buildHuntSession(running, NOW - HOUR) }, NOW)).toEqual([]);
    expect(readyEvents(huntingFull(), NOW).map((e) => e.kind)).toEqual(['hunt']);

    const mining = { ...defaultSave(), activeOreId: 'copper', lastMiningClaim: NOW - HOUR };
    expect(readyEvents(mining, NOW)).toEqual([]);
    expect(readyEvents({ ...mining, lastMiningClaim: NOW - 48 * HOUR }, NOW).map((e) => e.kind)).toEqual(['mining']);

    const plant = PLANTS[0].id;
    const garden = defaultSave();
    const planted = { ...garden, gardenSlots: garden.gardenSlots.map((s, i) => (i === 0 ? { ...s, plantId: plant, startedAt: NOW - 1000 } : s)) };
    expect(readyEvents(planted, NOW)).toEqual([]);
    const grown = { ...planted, gardenSlots: planted.gardenSlots.map((s, i) => (i === 0 ? { ...s, startedAt: NOW - 500 * HOUR } : s)) };
    expect(readyEvents(grown, NOW)).toEqual([{ kind: 'garden', ids: [expect.stringContaining('garden:0:')] }]);

    const offer = { id: 'd1' } as unknown as SaveData['deliveries']['offers'][number];
    const ordered = { ...defaultSave(), deliveries: { ...defaultSave().deliveries, active: { offer, startedAt: NOW - 2 * HOUR, endsAt: NOW + HOUR } } };
    expect(readyEvents(ordered, NOW)).toEqual([]);
    expect(readyEvents(ordered, NOW + 2 * HOUR).map((e) => e.kind)).toEqual(['order']);
  });

  it('a new fill of the same activity has a new id', () => {
    const a = readyEvents({ ...defaultSave(), activeOreId: 'copper', lastMiningClaim: NOW - 48 * HOUR }, NOW)[0].ids;
    const b = readyEvents({ ...defaultSave(), activeOreId: 'copper', lastMiningClaim: NOW - 40 * HOUR }, NOW)[0].ids;
    expect(a).not.toEqual(b);
  });
});

describe('one notification per fill, never while focused', () => {
  const ev = (kind: 'mining' | 'garden', ...ids: string[]) => ({ kind, ids });

  it('the first look after opening only remembers: what finished while the game was closed is not announced', () => {
    const plan = planNotifications([ev('mining', 'm1')], null, false, true);
    expect(plan.announce).toEqual([]);
    expect([...plan.seen]).toEqual(['m1']);
  });

  it('announces a new fill once when the window is not focused', () => {
    let seen = planNotifications([], null, false, true).seen;
    const first = planNotifications([ev('mining', 'm1')], seen, false, true);
    expect(first.announce).toEqual([{ kind: 'mining', count: 1 }]);
    seen = first.seen;
    expect(planNotifications([ev('mining', 'm1')], seen, false, true).announce).toEqual([]); // still full: no second notice
    const next = planNotifications([ev('mining', 'm2')], seen, false, true); // the next session fills up
    expect(next.announce).toEqual([{ kind: 'mining', count: 1 }]);
  });

  it('nothing while focused, and what was seen focused is never announced afterwards', () => {
    const seen0 = planNotifications([], null, true, true).seen;
    const focused = planNotifications([ev('mining', 'm1')], seen0, true, true);
    expect(focused.announce).toEqual([]);
    expect(planNotifications([ev('mining', 'm1')], focused.seen, false, true).announce).toEqual([]);
  });

  it('nothing when the preference is off', () => {
    const seen0 = planNotifications([], null, false, false).seen;
    expect(planNotifications([ev('mining', 'm1')], seen0, false, false).announce).toEqual([]);
  });

  it('plots: one notice per activity, counting the newly ready ones; plots announced before stay quiet', () => {
    const seen0 = planNotifications([], null, false, true).seen;
    const one = planNotifications([ev('garden', 'g1')], seen0, false, true);
    expect(one.announce).toEqual([{ kind: 'garden', count: 1 }]);
    const two = planNotifications([ev('garden', 'g1', 'g2', 'g3')], one.seen, false, true);
    expect(two.announce).toEqual([{ kind: 'garden', count: 2 }]);
  });

  it('an id that is no longer finished is forgotten (the set does not grow without bound)', () => {
    const seen0 = planNotifications([], null, false, true).seen;
    const a = planNotifications([ev('mining', 'm1')], seen0, false, true);
    expect([...planNotifications([], a.seen, false, true).seen]).toEqual([]);
  });
});

describe('the preference', () => {
  it('is OFF in a browser until the player turns it on, and remembered', () => {
    localStorage.removeItem('arena-rpg-notify');
    expect(loadNotifyPref()).toBe(false);
    saveNotifyPref(true);
    expect(loadNotifyPref()).toBe(true);
    saveNotifyPref(false);
    expect(loadNotifyPref()).toBe(false);
    localStorage.removeItem('arena-rpg-notify');
  });

  it('has text in both languages', () => {
    for (const tree of [pt, en]) {
      for (const k of ['title', 'hunt', 'mining', 'woodcutting', 'garden', 'gardenMany', 'order']) expect((tree.notify as Record<string, string>)[k], k).toBeTruthy();
      for (const k of ['notifications', 'notificationsHint', 'notificationsEnable', 'notificationsDisable', 'notificationsDenied']) expect((tree.settings as Record<string, string>)[k], k).toBeTruthy();
    }
  });
});

// Electron cannot run in the test environment: this only pins the shape of the (tiny) IPC surface so it cannot grow by accident.
describe('the Electron bridge', () => {
  const preload = readFileSync('desktop/preload.cjs', 'utf8');
  const main = readFileSync('desktop/main.cjs', 'utf8');

  it('exposes ONE extra channel, with two plain strings, mirroring the fullscreen ones', () => {
    expect(preload).toContain("notify: (payload) => ipcRenderer.invoke('notify:show'");
    expect((preload.match(/ipcRenderer\.invoke\(/g) ?? []).length).toBe(3); // fullscreen toggle, is-fullscreen, notify
  });

  it('the main process only answers its own window, validates the text, and never notifies a focused window', () => {
    const handler = main.slice(main.indexOf("ipcMain.handle('notify:show'"), main.indexOf('return true;', main.indexOf("ipcMain.handle('notify:show'")));
    expect(handler).toContain('event.sender !== win.webContents');
    expect(handler).toContain("typeof v === 'string'");
    expect(handler).toContain('win.isFocused()');
    expect(handler).toContain('Notification.isSupported()');
    expect(handler).toContain('win.flashFrame(true)');
  });
});
