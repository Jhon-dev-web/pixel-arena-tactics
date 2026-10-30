import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_ICON } from '../../components/uiIcons';

describe('uiIcons', () => {
  it('every UI icon is an existing pixel-art file in public/assets', () => {
    for (const [name, url] of Object.entries(UI_ICON)) {
      expect(url.startsWith('/assets/'), name).toBe(true);
      expect(existsSync(resolve(__dirname, '../../../public', url.slice(1))), `${name}: ${url}`).toBe(true);
    }
  });

  it('the shared pictures of an activity are the ones the side menu uses (no second drawing in the Camp)', () => {
    const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    for (const name of ['hero', 'skills', 'hunt', 'dungeon', 'codex', 'mining', 'woodcutting', 'garden', 'oficios', 'forge', 'deliveries', 'pass', 'settings']) {
      expect(app, name).toContain(`<PixelIcon name="${name}" />`);
    }
    // the quests button (top bar) and the bag button (camp) draw their own, from the same table
    expect(readFileSync(resolve(__dirname, '../../components/DesktopTopbar.tsx'), 'utf8')).toContain('<PixelIcon name="quests" />');
    expect(readFileSync(resolve(__dirname, '../../components/DesktopHome.tsx'), 'utf8')).toContain('<PixelIcon name="inventory" />');
  });

  it('the side menu and the camp carry no emoji as icons', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2694}\u{2699}]/u;
    for (const file of ['../../components/DesktopHome.tsx', '../../components/DesktopTopbar.tsx', '../../components/DesktopSidebar.tsx']) {
      expect(readFileSync(resolve(__dirname, file), 'utf8')).not.toMatch(emoji);
    }
  });
});
