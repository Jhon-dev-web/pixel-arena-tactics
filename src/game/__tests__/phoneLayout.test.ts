import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

const read = (p: string): string => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const get = (obj: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);

describe('phone layouts and accessible names', () => {
  it.each(['camp.equipmentTitle', 'camp.equipmentShow', 'camp.equipmentHide', 'nav.mainNavigation', 'nav.attention', 'forge.missing'])('%s exists in pt and en', (key) => {
    expect(typeof get(pt, key), `pt ${key}`).toBe('string');
    expect(typeof get(en, key), `en ${key}`).toBe('string');
  });

  it('the side navigation takes its accessible name from the locale, not from a hard-coded English string', () => {
    const src = read('components/DesktopSidebar.tsx');
    expect(src).not.toContain('aria-label="Main navigation"');
    expect(src).toContain("t('nav.mainNavigation')");
    expect(src).toContain("aria-current={item.active ? 'page' : undefined}");
  });

  it('the camp keeps the nextStep logic and folds the slots on a phone without saving anything', () => {
    const src = read('components/DesktopHome.tsx');
    expect(src).toContain("from '../game/nextStep'");
    expect(src).toContain('useIsPhone()');
    expect(src).toContain('aria-expanded={gearOpen}');
    expect(src).not.toMatch(/localStorage|deviceStorage/);
  });

  it('the hunt start button is in-flow (not sticky) in the zone detail, at every width, right after the depth choice', () => {
    const css = read('ui/hunt.css');
    expect(css).toMatch(/\.hs-detail \.hs-foot\s*\{[^}]*position:\s*static/);
    expect(css).toMatch(/\.hs-p-depth\s*\{[^}]*order:\s*2/);
    expect(css).toMatch(/\.hs-detail \.hs-foot\s*\{[^}]*order:\s*3/);
  });

  it('the forge opens the craft panel under the picked recipe on a phone', () => {
    const src = read('components/ForgeModal.tsx');
    expect(src).toContain('phone && selected && craftPanel');
    expect(src).toContain('side={phone ? undefined : craftPanel}');
  });
});
