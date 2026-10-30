import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The Forja is a page like Ofícios (activeView 'forja'), not a modal; an empty equipment slot shows no picture; the upgrade cards size their gold / shard icons.

const root = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.resolve(root, p), 'utf8');
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the Forge is a page', () => {
  const app = stripComments(read('src/App.tsx'));
  const view = stripComments(read('src/components/ForgeModal.tsx'));

  it('App opens it through activeView, never through a modal flag', () => {
    expect(app).toContain("'forja'");
    expect(app).not.toMatch(/forgeOpen|setForgeOpen|<ForgeModal/);
    expect(app).toMatch(/<ForgeView/);
    // the menu entry is active when the page in view is the Forge (viewScreen maps the view onto the screen the menu knows)
    expect(app).toMatch(/forja: 'forge'/);
  });

  it('every entry point switches the view (nav, next step, "Usar em..."; the camp no longer has a forge shortcut)', () => {
    expect((app.match(/setActiveView\('forja'\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the deep link: the focus carries its tab and recipe and remounts the page', () => {
    expect(app).toMatch(/setForgeFocus\(\{ tab: [^}]*itemId:[^}]*nonce/);
    expect(app).toMatch(/key=\{forgeFocus\?\.nonce/);
    expect(app).toMatch(/initialTab=\{forgeFocus\?\.tab\}/);
    expect(app).toMatch(/focusItemId=\{forgeFocus\?\.itemId\}/);
  });

  it('the component renders a Screen with a PageHeader and no ModalShell / close button', () => {
    expect(view).toMatch(/<Screen /);
    expect(view).toMatch(/<PageHeader /);
    expect(view).not.toMatch(/ModalShell|onClose/);
  });
});

describe('empty equipment slots', () => {
  it('show no placeholder picture (character panel and home)', () => {
    const panel = stripComments(read('src/components/HeroPanels.tsx'));
    expect(panel).not.toMatch(/GearIcon item=\{\{/);
    expect(panel).toMatch(/pg-slot empty/);
    const home = stripComments(read('src/components/DesktopHome.tsx'));
    expect(home).not.toContain('hm-slot-empty');
  });
});

describe('the upgrade tab rows', () => {
  it('the gold / shard pictures of a cost row are sized by the stylesheet', () => {
    const css = read('src/ui/screens.css');
    expect(css).toMatch(/\.fg-card \.mat-icon > img\s*\{[^}]*width: 100%/);
  });

});
