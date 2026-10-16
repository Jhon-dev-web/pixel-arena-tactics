import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { woffCodepoints } from '../../../scripts/fontCoverage.mjs';

// The body face of the UI is Departure Mono (src/ui/base.css), bundled from @proj-airi/font-departure-mono (the font is SIL OFL); the titles keep Press Start 2P. Everything the locale files print must be drawn by one of
// the two (or by the known symbol fallbacks of the system), and the font must stay local: no remote font loading (CSP `font-src 'self'`, offline desktop build). The type scale is strict: two faces, four sizes (tokens.css).
const departure: Set<number> = woffCodepoints('node_modules/@proj-airi/font-departure-mono/dist/files/DepartureMono-Regular.woff');
const pressStart: Set<number> = woffCodepoints('node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff');
const KNOWN_FALLBACK = new Set([...'🏕️⚠🏆🪙◆🛒⚒⚔🛡⚡🎉💪💎🔷🔥⚙📜'].map((c) => c.codePointAt(0)));
const strip = (s: string) => [...s].filter((c) => (c.codePointAt(0) ?? 0) > 31 && c !== '️' && c !== '‍');

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

describe('UI body font', () => {
  it('has every accented capital and lowercase letter Portuguese needs', () => {
    for (const ch of 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç') expect(departure.has(ch.codePointAt(0)!), ch).toBe(true);
  });

  it.each(['pt', 'en'])('%s.json only uses characters the body or display font covers (plus the known symbol fallbacks)', (lang) => {
    const text = readFileSync(`src/locales/${lang}.json`, 'utf8');
    const outside = [...new Set(strip(text))].filter((c) => {
      const cp = c.codePointAt(0)!;
      return !departure.has(cp) && !pressStart.has(cp) && !KNOWN_FALLBACK.has(cp);
    });
    expect(outside.join('')).toBe('');
  });

  it('is declared from a local file, with its licence shipped, and the CSS loads no remote fonts', () => {
    const base = readFileSync('src/ui/base.css', 'utf8');
    expect(base).toMatch(/font-family:\s*'Departure Mono'/);
    expect(base).toMatch(/DepartureMono-Regular\.woff2/);
    expect(existsSync('public/licenses/departure-mono-OFL.txt')).toBe(true);
    expect(existsSync('public/licenses/press-start-2p-OFL.txt')).toBe(true);
    for (const f of ['src/ui/base.css', 'src/ui/tokens.css', 'src/ui/ui.css', 'index.html']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\/[^'")\s]*\.(woff2?|ttf)/);
  });

  it('keeps the display face for titles and a body face with a readable size and line height', () => {
    const tokens = readFileSync('src/ui/tokens.css', 'utf8');
    expect(tokens).toMatch(/--font-display:\s*'Press Start 2P'/);
    expect(tokens).toMatch(/--font-body:\s*'Departure Mono'/);
    expect(Number(/--fs-body:\s*(\d+)px/.exec(tokens)?.[1])).toBeGreaterThanOrEqual(13);
    expect(Number(/--fs-small:\s*(\d+)px/.exec(tokens)?.[1])).toBeGreaterThanOrEqual(11);
    expect(Number(/--lh-body:\s*([\d.]+)/.exec(tokens)?.[1])).toBeGreaterThanOrEqual(1.4);
  });
});

describe('type scale', () => {
  const tokens = readFileSync('src/ui/tokens.css', 'utf8');

  it('defines exactly four text sizes (plus the icon glyph sizes, which are pictures and not letters)', () => {
    const text = [...tokens.matchAll(/^\s*--fs-([a-z]+):/gm)].map((m) => m[1]);
    expect(new Set(text)).toEqual(new Set(['title', 'section', 'body', 'small']));
  });

  it('has no font-size anywhere in the CSS that bypasses the scale', () => {
    const allowed = /^(var\(--fs-(title|section|body|small)\)|var\(--glyph-[sml]\)|inherit)$/;
    const offenders: string[] = [];
    for (const file of cssFiles('src')) {
      if (file.endsWith('tokens.css')) continue;
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/(^|[;{\s])font-size:\s*([^;}]+)[;}]/g)) if (!allowed.test(m[2].trim())) offenders.push(`${file}: ${m[2].trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the old size tokens and calc() sizes out of the CSS', () => {
    for (const file of cssFiles('src')) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, file).not.toMatch(/var\(--font-size\)|var\(--fs-(xs|sm|md|lg|xl)\)/);
    }
  });

  it('uses the display face only through the title rules of base.css, and only for upper-case text', () => {
    const base = readFileSync('src/ui/base.css', 'utf8');
    for (const block of base.split('}').filter((b) => /font-family:\s*var\(--font-display\)/.test(b))) expect(block).toMatch(/text-transform:\s*uppercase/);
    for (const file of cssFiles('src').filter((f) => !f.endsWith('base.css') && !f.endsWith('tokens.css'))) {
      const css = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/@font-face\s*\{[^}]*\}/g, '');
      expect(css, file).not.toMatch(/font-family:\s*(var\(--font-display\)|'Press Start 2P')\s*[,;]/);
    }
  });
});
