import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { woffCodepoints } from '../../../scripts/fontCoverage.mjs';

// Press Start 2P (the only UI font) ships in two subsets. The game bundles `latin` only (main.tsx), so every character a locale string uses must be in it,
// except the few symbols below that fall back to the system font. A new unsupported character (a new emoji, a typographic dash...) fails here instead of
// silently rendering as a blank box / system glyph.
const ROOT = 'node_modules/@fontsource/press-start-2p/files/';
const latin: Set<number> = woffCodepoints(`${ROOT}press-start-2p-latin-400-normal.woff`);
const KNOWN_FALLBACK = new Set([...'🏕️⚠🏆🪙◆🛒⚒⚔🛡⚡🎉💪💎🔷🔥⚙📜'].map((c) => c.codePointAt(0)));
const strip = (s: string) => [...s].filter((c) => (c.codePointAt(0) ?? 0) > 31 && c !== '️' && c !== '‍');

describe('font coverage', () => {
  it('the bundled latin subset has every accented capital and lowercase letter Portuguese needs', () => {
    for (const ch of 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç') expect(latin.has(ch.codePointAt(0)!), ch).toBe(true);
  });

  it.each(['pt', 'en'])('%s.json only uses characters the font covers (plus the known symbol fallbacks)', (lang) => {
    const text = readFileSync(`src/locales/${lang}.json`, 'utf8');
    const outside = [...new Set(strip(text))].filter((c) => !latin.has(c.codePointAt(0)!) && !KNOWN_FALLBACK.has(c.codePointAt(0)!));
    expect(outside.join('')).toBe('');
  });

  it('App.css keeps the per-character fallback for the accented capitals the font squeezes into lowercase-looking glyphs', () => {
    const css = readFileSync('src/App.css', 'utf8');
    expect(css).toMatch(/unicode-range:\s*U\+00C0-00D6,\s*U\+00D8-00DE/);
    expect(css).toMatch(/font-variant-ligatures:\s*none/);
  });
});
