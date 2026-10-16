// `npm run check:bundle` — fails if a production build ships developer tools.
//
// It builds twice with Vite's JS API, always with the Supabase variables forced empty and WITHOUT reading any .env* file (envDir: false):
//  - a production build (the thing that gets hosted), which must contain none of the DEV-only markers below;
//  - a control build with import.meta.env.DEV forced to true, which must contain ALL of them. The control proves that every marker is still
//    a real string in the output (a minifier change or a rename would otherwise turn the check into a silent no-op).
// Both builds go to a temp directory; nothing under dist/ is touched. Run it after any change to the DEV gates.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Strings that exist only in code paths guarded by import.meta.env.DEV. Each one is tagged with the thing it proves.
export const DEV_MARKERS = [
  { marker: 'dev-admin-fab', what: 'the admin panel button (App.tsx)' },
  { marker: 'admin-modal', what: 'the admin panel itself (AdminModal.tsx)' },
  { marker: '__uiAudit', what: 'window.__uiAudit (main.tsx)' },
  { marker: '__netStats', what: 'window.__netStats, the request counter (main.tsx, lib/netStats.ts)' },
  { marker: 'unnamed-button', what: 'the UI audit checker (lib/uiAudit.ts)' },
  { marker: 'hasBattlePass:!0,huntSession', what: 'the DEV purchase path of the Adventurer Pass, ADVENTURER_PASS_TESTABLE being true (entitlements.ts)' },
  { marker: 'VITE_SUPABASE_ANON_KEY are not set', what: 'the DEV-only missing-backend console warning (lib/supabaseClient.ts)' },
];

/** Returns the markers found in the given text (pure; unit-tested). */
export function findMarkers(text, markers = DEV_MARKERS) {
  return markers.filter((m) => text.includes(m.marker));
}

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (/\.(m?js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function buildTo(outDir, dev) {
  await build({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    envDir: false,
    logLevel: 'error',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': '""',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
      // Explicit in both directions: under vitest NODE_ENV is 'test', which would otherwise make the "production" build a DEV one.
      'import.meta.env.DEV': dev ? 'true' : 'false',
      'import.meta.env.PROD': dev ? 'false' : 'true',
    },
    build: { outDir, emptyOutDir: true },
  });
  const found = new Map();
  for (const f of jsFiles(outDir)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of findMarkers(text)) found.set(m.marker, path.relative(outDir, f));
  }
  return found;
}

/** Builds production + control and returns { leaked, missingInControl } (marker lists). */
export async function checkBundle() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-bundle-'));
  try {
    const prod = await buildTo(path.join(tmp, 'prod'), false);
    const control = await buildTo(path.join(tmp, 'control'), true);
    const leaked = DEV_MARKERS.filter((m) => prod.has(m.marker)).map((m) => ({ ...m, file: prod.get(m.marker) }));
    const missingInControl = DEV_MARKERS.filter((m) => !control.has(m.marker));
    return { leaked, missingInControl };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { leaked, missingInControl } = await checkBundle();
  for (const m of missingInControl) console.error(`STALE MARKER (not found even in the DEV control build): "${m.marker}" — ${m.what}. Update scripts/check-bundle.mjs.`);
  for (const m of leaked) console.error(`LEAK: "${m.marker}" is in the production bundle (${m.file}) — ${m.what}`);
  if (leaked.length || missingInControl.length) process.exit(1);
  console.log(`check:bundle OK — ${DEV_MARKERS.length} DEV markers absent from the production bundle (and present in the DEV control build).`);
}
