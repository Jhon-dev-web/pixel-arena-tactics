import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEAR_SCREENS, NAV_ENTRIES, ONLINE_ONLY, TOPBAR_SCREENS, entryBadge, visibleScreens, whereIs } from '../../components/navMap';
import type { ScreenId } from '../../components/navMap';

// Every screen the old 18-entry side menu (20 online) opened with one tap. A screen that drops out of navMap.ts disappears from the game without any sign on screen.
const SCREENS_ONE_TAP_BEFORE: ScreenId[] = [
  'personagem', 'skills', 'tactics', 'hunt', 'dungeon', 'quests', 'codex', 'calendar', // the first, untitled group
  'mining', 'woodcutting', 'garden', 'oficios', // Profissões
  'forge', 'inventory', // Equipamento
  'deliveries', 'pass', 'invites', 'shop', 'market', // Economia
  'settings',
];

// The screens whose "needs attention" dot the old menu showed on their own row (App.tsx screenBadges + the quests dot of the top bar).
const SCREENS_WITH_A_DOT: ScreenId[] = ['personagem', 'skills', 'hunt', 'mining', 'woodcutting', 'garden', 'deliveries', 'quests'];

const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('the eight-entry menu keeps every screen reachable', () => {
  it('has eight entries, none of them listed twice', () => {
    expect(NAV_ENTRIES).toHaveLength(8);
    const all = NAV_ENTRIES.flatMap((e) => e.screens);
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(SCREENS_ONE_TAP_BEFORE)('%s is still within one tap of an entry, the top bar or the gear', (screen) => {
    expect(whereIs(screen), `${screen} fell out of the menu`).not.toBeNull();
  });

  it('what moved out of the menu is on the top bar or the gear, never lost', () => {
    expect(TOPBAR_SCREENS).toEqual(['quests']);
    expect([...GEAR_SCREENS].sort()).toEqual(['calendar', 'codex', 'invites', 'settings']);
  });

  it.each(SCREENS_WITH_A_DOT.filter((s) => whereIs(s)?.via === 'entry'))('the dot of %s reaches its entry', (screen) => {
    const entry = NAV_ENTRIES.find((e) => e.screens.includes(screen))!;
    expect(entryBadge(entry, { [screen]: true })).toBe(true);
    expect(entryBadge(entry, {})).toBe(false);
  });

  it('the quests dot has a home on the top bar, not in a closed menu', () => {
    expect(TOPBAR_SCREENS).toContain('quests');
    expect(app).toContain('questsBadge={questsBadge}');
  });

  it('the screens that only exist online stay online-only', () => {
    expect([...ONLINE_ONLY].sort()).toEqual(['invites', 'market']);
    const shop = NAV_ENTRIES.find((e) => e.id === 'shop')!;
    expect(visibleScreens(shop, { market: false, account: false })).toEqual(['shop', 'deliveries']);
    expect(visibleScreens(shop, { market: true, account: false })).toEqual(['shop', 'deliveries', 'market']);
    // the market tab and the invites row are added only behind the same flags as before
    expect(app).toContain('const onlineScreens = { market: marketOn, account: configured };');
    expect(app).toContain('...(configured ? [{ key: \'invites\'');
  });

  it('every screen of the map has an opener in App.tsx (a case in goScreen)', () => {
    for (const screen of new Set<ScreenId>([...NAV_ENTRIES.flatMap((e) => e.screens), ...TOPBAR_SCREENS, ...GEAR_SCREENS, 'inventory'])) {
      expect(app, `goScreen has no case for ${screen}`).toContain(`case '${screen}':`);
    }
  });
});
