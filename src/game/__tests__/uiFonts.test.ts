import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { woffCodepoints } from '../../../scripts/fontCoverage.mjs';

// The body face of the UI is Jersey 10 (src/ui/base.css), bundled from @fontsource; titles keep Press Start 2P. Everything the locale files print must be drawn by one of the two (or by the
// known symbol fallbacks of the system), and the font must stay local: no remote font loading (CSP `font-src 'self'`, offline desktop build).
const jersey: Set<number> = woffCodepoints('node_modules/@fontsource/jersey-10/files/jersey-10-latin-400-normal.woff');
const pressStart: Set<number> = woffCodepoints('node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff');
const KNOWN_FALLBACK = new Set([...'🏕️⚠🏆🪙◆🛒⚒⚔🛡⚡🎉💪💎🔷🔥⚙📜'].map((c) => c.codePointAt(0)));
const strip = (s: string) => [...s].filter((c) => (c.codePointAt(0) ?? 0) > 31 && c !== '️' && c !== '‍');

describe('UI body font', () => {
  it('has every accented capital and lowercase letter Portuguese needs', () => {
    for (const ch of 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç') expect(jersey.has(ch.codePointAt(0)!), ch).toBe(true);
  });

  it.each(['pt', 'en'])('%s.json only uses characters the body or display font covers (plus the known symbol fallbacks)', (lang) => {
    const text = readFileSync(`src/locales/${lang}.json`, 'utf8');
    const outside = [...new Set(strip(text))].filter((c) => {
      const cp = c.codePointAt(0)!;
      return !jersey.has(cp) && !pressStart.has(cp) && !KNOWN_FALLBACK.has(cp);
    });
    expect(outside.join('')).toBe('');
  });

  it('is declared from a local file, with its licence shipped, and the CSS loads no remote fonts', () => {
    const base = readFileSync('src/ui/base.css', 'utf8');
    expect(base).toMatch(/font-family:\s*'Jersey 10'/);
    expect(base).toMatch(/jersey-10-latin-400-normal\.woff2/);
    expect(existsSync('public/licenses/jersey-10-OFL.txt')).toBe(true);
    for (const f of ['src/ui/base.css', 'src/ui/tokens.css', 'src/ui/ui.css', 'index.html']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\/[^'")\s]*\.(woff2?|ttf)/);
  });

  it('keeps the display face for titles and a body size of at least 14 px with a line height of at least 1.4', () => {
    const tokens = readFileSync('src/ui/tokens.css', 'utf8');
    expect(tokens).toMatch(/--font-display:\s*'Press Start 2P'/);
    expect(Number(/--font-size:\s*(\d+)px/.exec(tokens)?.[1])).toBeGreaterThanOrEqual(14);
    expect(Number(/--lh-body:\s*([\d.]+)/.exec(tokens)?.[1])).toBeGreaterThanOrEqual(1.4);
  });
});
