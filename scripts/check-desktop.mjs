// `npm run check:desktop` — fails if the desktop / Steam bundle carries any of the player market (crypto trading, web only: Valve forbids it in a Steam game).
//
// It builds twice with Vite's JS API, without reading any .env* file, into temp folders (nothing under dist/ or dist-desktop/ is touched):
//  - the DESKTOP build (`mode: 'desktop'`, exactly what scripts/desktop-build.mjs builds), which must contain NONE of the markers below, not even with the market variable set in the shell;
//  - a WEB control build with VITE_MARKET_ENABLED=true and a (fake) backend, which must contain ALL of them. The control proves that every marker is still a real string in the output (a rename
//    or a minifier change would otherwise turn the check into a silent no-op).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Strings that exist only in market code, its text or its styles. Each is tagged with the thing it proves.
export const MARKET_MARKERS = [
  { marker: 'solana:signAndSendTransaction', what: 'the wallet payment request (game/market/wallet.ts)' },
  { marker: 'solana:signMessage', what: 'the wallet signature request (game/market/wallet.ts)' },
  { marker: 'wallet-standard:app-ready', what: 'the wallet discovery (game/market/wallet.ts)' },
  { marker: 'market_listings_public', what: 'the public listings view (game/market/api.ts)' },
  { marker: 'market-wallet', what: 'the wallet function call (game/market/api.ts)' },
  { marker: 'market-buy', what: 'the purchase function call (game/market/api.ts)' },
  { marker: 'pass-crypto', what: 'the USDC Pass function call (game/market/api.ts)' },
  { marker: 'solscan.io', what: 'the block explorer links (game/market/wallet.ts)' },
  { marker: 'NUNCA pede sua chave privada', what: 'the market text, Portuguese (locales/market.ts)' },
  { marker: 'NEVER asks for your private key', what: 'the market text, English (locales/market.ts)' },
  { marker: 'Pagar com USDC', what: 'the Pass button text (locales/market.ts)' },
  { marker: 'mk-listing', what: 'the market styles (market.css)' },
];

/** Returns the markers found in the given text (pure; unit-tested). */
export function findMarkers(text, markers = MARKET_MARKERS) {
  return markers.filter((m) => text.includes(m.marker));
}

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(m?js|css|html|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

function scan(outDir) {
  const found = new Map();
  for (const f of files(outDir)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of findMarkers(text)) found.set(m.marker, path.relative(outDir, f));
  }
  return found;
}

/** Builds the desktop bundle and a web control; returns { leaked, missingInControl }. */
export async function checkDesktop() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-desktop-'));
  try {
    // The shell may carry the market variable: the desktop build must ignore it (vite.config.ts forces it off).
    const before = process.env.VITE_MARKET_ENABLED;
    process.env.VITE_MARKET_ENABLED = 'true';
    try {
      await build({ root, configFile: path.join(root, 'vite.config.ts'), mode: 'desktop', envDir: false, logLevel: 'error', build: { outDir: path.join(tmp, 'desktop'), emptyOutDir: true } });
    } finally {
      if (before === undefined) delete process.env.VITE_MARKET_ENABLED;
      else process.env.VITE_MARKET_ENABLED = before;
    }
    await build({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      envDir: false,
      logLevel: 'error',
      define: {
        'import.meta.env.VITE_SUPABASE_URL': '"https://example.invalid"',
        'import.meta.env.VITE_SUPABASE_ANON_KEY': '"anon-key-for-the-control-build"',
        'import.meta.env.VITE_MARKET_ENABLED': '"true"',
        'import.meta.env.DEV': 'false',
        'import.meta.env.PROD': 'true',
      },
      build: { outDir: path.join(tmp, 'control'), emptyOutDir: true },
    });
    const desktop = scan(path.join(tmp, 'desktop'));
    const control = scan(path.join(tmp, 'control'));
    return {
      leaked: MARKET_MARKERS.filter((m) => desktop.has(m.marker)).map((m) => ({ ...m, file: desktop.get(m.marker) })),
      missingInControl: MARKET_MARKERS.filter((m) => !control.has(m.marker)),
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { leaked, missingInControl } = await checkDesktop();
  for (const m of missingInControl) console.error(`STALE MARKER (not found even in the web control build): "${m.marker}" — ${m.what}. Update scripts/check-desktop.mjs.`);
  for (const m of leaked) console.error(`LEAK: "${m.marker}" is in the DESKTOP bundle (${m.file}) — ${m.what}`);
  if (leaked.length || missingInControl.length) process.exit(1);
  console.log(`check:desktop OK — ${MARKET_MARKERS.length} market markers absent from the desktop bundle (and present in the web control build).`);
}
