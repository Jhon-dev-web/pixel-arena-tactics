import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MARKET_TEXT } from '../../locales/market';

// The market is web only and switched off by default; the desktop / Steam bundle must contain none of it (Valve forbids crypto trading); no screen can take a private key; both languages say the
// same things. See scripts/check-desktop.mjs for the real bundle check, run below.

const root = path.resolve(__dirname, '../../..');
const read = (p: string): string => readFileSync(path.resolve(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(path.resolve(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(path.resolve(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is OFF unless VITE_MARKET_ENABLED is "true" and a backend is configured', async () => {
    const flag = async (env: string, configured: boolean) => {
      vi.resetModules();
      vi.stubEnv('VITE_MARKET_ENABLED', env);
      vi.doMock('../../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: configured }));
      return (await import('../marketFlag')).marketEnabled;
    };
    expect(await flag('', true)).toBe(false); // the default
    expect(await flag('yes', true)).toBe(false);
    expect(await flag('TRUE', true)).toBe(false);
    expect(await flag('true', false)).toBe(false); // no backend (the offline / desktop build): never
    expect(await flag('true', true)).toBe(true);
  });
});

describe('the desktop build', () => {
  it('forces the variable off, whatever the environment says', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toMatch(/"import\.meta\.env\.VITE_MARKET_ENABLED": JSON\.stringify\("false"\)/);
    expect(read('scripts/desktop-build.mjs')).toContain("'--mode', 'desktop'");
  });

  it('nothing in the main bundle imports the market statically: only lazy imports behind the build constant, plus the type-only host', () => {
    const app = read('src/App.tsx');
    expect(app).toContain("const MARKET_BUILD = import.meta.env.VITE_MARKET_ENABLED === 'true';");
    for (const lazyImport of ["import('./components/MarketScreen')", "import('./components/market/MarketSync')", "import('./components/PassUsdc')"]) {
      expect(app).toMatch(new RegExp(`MARKET_BUILD \\? lazy\\(\\(\\) => ${lazyImport.replace(/[().]/g, '\\$&')}\\) : null`));
    }
    const staticMarket = app.split('\n').filter((l) => /^import .* from '.*(market|Market|PassUsdc)/.test(l));
    expect(staticMarket).toEqual([
      "import { marketEnabled } from './game/marketFlag';",
      "import type { MarketHost } from './components/market/marketDeps';",
      "import { mt } from './locales/market';",
    ]);
    // every use of the text and of the screens is behind marketOn (which is false in the desktop bundle)
    expect(app.match(/mt\('/g)?.length).toBe(1);
    expect(app).toContain("label: mt('title')");
    const uses = app.split('\n').filter((l) => /marketOn/.test(l));
    expect(uses.length).toBeGreaterThanOrEqual(4);
  });

  it('no other file outside the market itself imports the market modules', () => {
    const allowedInside = (f: string) => f.startsWith('src/game/market/') || f.startsWith('src/components/market/') || f === 'src/components/MarketScreen.tsx' || f === 'src/components/PassUsdc.tsx' || f === 'src/locales/market.ts' || f === 'src/game/marketFlag.ts' || f.includes('__tests__');
    const offenders: string[] = [];
    for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) {
      if (allowedInside(f) || f === 'src/App.tsx') continue;
      if (/from '[./]*(?:game\/market|components\/market|locales\/market|components\/MarketModal|components\/PassUsdc|market\.css)/.test(read(f)) || /import '[./]*market\.css'/.test(read(f))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('BattlePassView only renders what App hands it (no market import)', () => {
    const modal = read('src/components/BattlePassModal.tsx');
    expect(modal).not.toMatch(/market|PassUsdc|USDC|USDT|solana/i);
    expect(modal).toContain('buyExtra');
  });

  it.skipIf(!!process.env.SKIP_BUNDLE_CHECK)(
    'the real desktop bundle has none of the market, and the web control build has all of it',
    async () => {
      const mod = (await import(/* @vite-ignore */ pathToFileURL(path.resolve(root, 'scripts/check-desktop.mjs')).href)) as {
        MARKET_MARKERS: { marker: string }[];
        findMarkers: (text: string) => { marker: string }[];
        checkDesktop: () => Promise<{ leaked: { marker: string }[]; missingInControl: { marker: string }[] }>;
      };
      expect(mod.findMarkers('console.log(1)')).toEqual([]);
      expect(mod.findMarkers('f["solana:signAndSendTransaction"]').map((m) => m.marker)).toEqual(['solana:signAndSendTransaction']);
      expect(mod.MARKET_MARKERS.length).toBeGreaterThanOrEqual(10);
      const { leaked, missingInControl } = await mod.checkDesktop();
      expect(leaked.map((m) => m.marker)).toEqual([]);
      expect(missingInControl.map((m) => m.marker)).toEqual([]);
    },
    240_000,
  );
});

describe('no screen can take a private key or a seed phrase', () => {
  const files = [...walk('src/game/market'), ...walk('src/components/market'), 'src/components/MarketScreen.tsx', 'src/components/PassUsdc.tsx', ...walk('supabase/functions/_shared/market'), ...walk('supabase/functions/_shared/chain')].filter((f) => /\.(ts|tsx)$/.test(f));

  it('no code identifier, field name or request names a private key, a seed or a mnemonic', () => {
    for (const f of files) {
      const code = stripComments(read(f)).replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, '""');
      expect(code, f).not.toMatch(/private ?key|secret ?key|mnemonic|seed ?phrase|recovery ?phrase|secretRecovery|\bseed\b/i);
    }
  });

  it('there is no password / secret input anywhere in the market screens', () => {
    for (const f of files.filter((x) => x.endsWith('.tsx'))) {
      const code = read(f);
      expect(code, f).not.toMatch(/type=["']password["']/);
      expect(code, f).not.toMatch(/<textarea/);
    }
  });

  it('the only text input that takes a long secret-looking string is the transaction signature, capped at 100 characters (a signature is about 88)', () => {
    for (const f of files.filter((x) => x.endsWith('.tsx'))) {
      for (const m of read(f).matchAll(/<input[\s\S]*?\/>/g)) {
        const cap = /maxLength=\{?"?(\d+)/.exec(m[0]);
        expect(cap, f).not.toBeNull();
        expect(Number((cap as RegExpExecArray)[1]), f).toBeLessThanOrEqual(100);
      }
    }
  });

  it('the in-UI warning that the game never asks for a key is in the wallet, buying and Pass screens', () => {
    expect(MARKET_TEXT.pt.rules).toMatchObject({ neverKey: expect.stringContaining('NUNCA pede sua chave privada') });
    expect(MARKET_TEXT.en.rules).toMatchObject({ neverKey: expect.stringContaining('NEVER asks for your private key') });
    expect(read('src/components/market/WalletPanel.tsx')).toContain("mt('rules.neverKey')");
    expect(read('src/components/MarketScreen.tsx')).toContain('<Notices'); // the browse / sell / history tabs: one compact line, the full text behind "Saiba mais"
    expect(read('src/components/market/Notices.tsx')).toContain('<Warnings');
    expect(read('src/components/market/ReservationPanel.tsx')).toContain('<Warnings');
    expect(read('src/components/PassUsdc.tsx')).toContain('<Warnings');
  });
});

describe('the market styles', () => {
  const css = read('src/market.css');
  const rule = (selector: string): string => {
    const at = css.indexOf(`
${selector} {`) + 1; // at the start of a line: not inside a longer selector
    expect(at, selector).toBeGreaterThan(0);
    return css.slice(at, css.indexOf('}', at));
  };

  it('an item name breaks only between words: break-word, never "anywhere", normal word-break, hyphenation of the language the screen declares', () => {
    for (const sel of ['.mk-item-name', '.mk-notices-line']) {
      const r = rule(sel);
      expect(r, sel).toContain('overflow-wrap: break-word;');
      expect(r, sel).toContain('word-break: normal;');
      expect(r, sel).toContain('hyphens: auto;');
      expect(r, sel).not.toContain('anywhere');
    }
    // the notes and warnings of the market are the shared .ui-note / .ui-alert: they wrap the same way
    const ui = read('src/ui/ui.css');
    for (const sel of ['.ui-note', '.ui-alert']) {
      const at = ui.indexOf(`
${sel} {`) + 1;
      expect(at, sel).toBeGreaterThan(0);
      const r = ui.slice(at, ui.indexOf('}', at));
      expect(r, sel).toContain('overflow-wrap: break-word;');
      expect(r, sel).toContain('word-break: normal;');
      expect(r, sel).toContain('hyphens: auto;');
    }
    expect(read('src/components/MarketScreen.tsx')).toMatch(/className="mk-screen"[^>]*lang=\{activeLocale === 'en' \? 'en' : 'pt-BR'\}/);
    // the card title breaks between words too
    expect(css).toMatch(/\.mk-card \.ui-item-name,\s*\.mk-item-name \{/);
  });

  it('a pouch card has a gold border and a shine that stops for people who asked for less motion', () => {
    const pouch = rule('.mk-card.pouch');
    expect(pouch).toContain('border-color: var(--c-gold-300);');
    expect(css).toContain('@keyframes mk-pouch-shine');
    expect(rule('.mk-card.pouch::after')).toContain('animation: mk-pouch-shine');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced.slice(0, reduced.indexOf('\n}\n') + 3)).toContain('.mk-card.pouch::after');
    expect(reduced).toContain('animation: none;');
  });
});

describe('the market text', () => {
  const keys = (tree: unknown, prefix = ''): string[] =>
    Object.entries(tree as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));

  it('Portuguese and English have exactly the same keys, every placeholder in both, and nothing is empty', () => {
    const pt = keys(MARKET_TEXT.pt).sort();
    const en = keys(MARKET_TEXT.en).sort();
    expect(en).toEqual(pt);
    const read2 = (tree: unknown, key: string): string => key.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], tree) as string;
    for (const k of pt) {
      const a = read2(MARKET_TEXT.pt, k);
      const b = read2(MARKET_TEXT.en, k);
      expect(a.length, k).toBeGreaterThan(0);
      expect(b.length, k).toBeGreaterThan(0);
      expect((a.match(/\{\w+\}/g) ?? []).sort(), k).toEqual((b.match(/\{\w+\}/g) ?? []).sort());
    }
  });

  it('every key a screen asks for exists', () => {
    const known = new Set(keys(MARKET_TEXT.pt));
    const files = [...walk('src/components/market'), 'src/components/MarketScreen.tsx', 'src/components/PassUsdc.tsx', 'src/components/market/ItemCard.tsx'].filter((f) => /\.tsx?$/.test(f));
    const missing: string[] = [];
    for (const f of files) {
      for (const m of read(f).matchAll(/\bmt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!known.has(m[1])) missing.push(`${f}: ${m[1]}`);
      // dynamic keys: mt(`slots.${x}`), mt(`tabs.${id}`), mt(`sell.status.${...}`), mt(key)
      for (const m of read(f).matchAll(/\bmt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) if (![...known].some((k) => k.startsWith(`${m[1]}.`))) missing.push(`${f}: ${m[1]}.*`);
    }
    expect(missing).toEqual([]);
  });

  it('the fee is stated plainly in both languages', () => {
    expect(MARKET_TEXT.pt.rules).toMatchObject({ fee: 'Taxa do jogo {pct}%' });
    expect(MARKET_TEXT.en.rules).toMatchObject({ fee: 'Game fee {pct}%' });
  });
});
