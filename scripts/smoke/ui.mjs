// `npm run smoke:ui`: a screenshot smoke test of the built app. It loads three prepared saves (a new hero, a mid-game hero, an end-game hero with paragon and Profundezas)
// at 390x800, 1280x800 and 1920x1080, opens every screen of the side menu and fails on: console errors, raw locale keys on screen, NaN / undefined in the visible
// text, horizontal overflow of the page, and buttons with no accessible name (all found by src/lib/uiAudit.ts, the same checker as `window.__uiAudit()` in DEV).
// Screenshots go to smoke-out/screens (git-ignored).
//
// How it drives the browser: Playwright is not a dependency of this project (and is not installed), and adding it would mean downloading a browser. So this script talks
// the Chrome DevTools Protocol directly to the Chrome / Edge / Chromium already on the machine (no dependency, no download; Node 22.18+ for the built-in WebSocket and
// TypeScript import). SMOKE_BROWSER=<path to the executable> picks one; with no browser found the script says so and exits 0 (a documented no-op, never a download).
//
// Steps: generate the three saves (vitest, scripts/sim/smokeSaves.gen.ts), build the app with no backend keys into smoke-out/dist, serve it with `vite preview`.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'smoke-out');
const shots = path.join(out, 'screens');
const SAVE_KEY = 'arena-rpg-save-v1';
const VIEWPORTS = [
  { w: 390, h: 800 },
  { w: 1280, h: 800 },
  { w: 1920, h: 1080 },
];
const SAVES = ['new', 'mid', 'end'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const env = process.env.SMOKE_BROWSER;
  const pf = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA ?? '';
  const candidates = [
    env,
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

// ---- a minimal DevTools client ----------------------------------------------------------------------------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) for (const l of this.listeners) l(msg);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn) {
    this.listeners.push(fn);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

async function main() {
  const browser = findBrowser();
  if (!browser) {
    console.log('smoke:ui skipped: no Chrome, Edge or Chromium found (set SMOKE_BROWSER to the executable). Nothing was downloaded.');
    return 0;
  }
  let uiAudit;
  try {
    ({ uiAudit } = await import('../../src/lib/uiAudit.ts'));
  } catch (err) {
    console.log(`smoke:ui skipped: this Node (${process.version}) cannot import TypeScript directly (needs 22.18 or newer): ${err.message}`);
    return 0;
  }
  const namespaces = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'src', 'locales', 'pt.json'), 'utf8')));
  fs.rmSync(shots, { recursive: true, force: true });
  fs.mkdirSync(shots, { recursive: true });

  console.log('smoke:ui: generating the saves');
  run(process.execPath, [path.join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--config', 'vitest.sim.config.ts', 'smokeSaves']);
  const saves = JSON.parse(fs.readFileSync(path.join(out, 'saves.json'), 'utf8'));

  console.log('smoke:ui: building the app (no backend keys)');
  run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', path.join(out, 'dist'), '--emptyOutDir'], { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' });

  const appPort = await freePort();
  const preview = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', path.join(out, 'dist'), '--port', String(appPort), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root,
    stdio: 'ignore',
  });
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-smoke-'));
  const chrome = spawn(browser, [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], {
    stdio: 'ignore',
  });
  const cleanup = () => {
    try {
      chrome.kill();
    } catch {}
    try {
      preview.kill();
    } catch {}
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {}
  };

  const failures = [];
  try {
    const base = `http://127.0.0.1:${appPort}/`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await sleep(200);
    }
    let targets = null;
    for (let i = 0; i < 100 && !targets; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      } catch {
        await sleep(200);
      }
    }
    const page = targets.find((t) => t.type === 'page');
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    let where = '';
    const note = (kind, detail) => failures.push({ where, kind, detail: String(detail).slice(0, 220) });
    cdp.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') note('console-error', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') note('console-error', m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') note('console-error', `${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    });

    const auditSource = `(${uiAudit.toString()})(${JSON.stringify(namespaces)})`;
    let shotIndex = 0;
    const check = async (screen) => {
      await sleep(450);
      const findings = await cdp.eval(auditSource);
      for (const f of findings) note(f.kind, `${screen}: ${f.detail}`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = `${String(++shotIndex).padStart(3, '0')}_${where.replace(/[^\w]+/g, '_')}_${screen.replace(/[^\w]+/g, '_')}.png`;
      fs.writeFileSync(path.join(shots, file), Buffer.from(shot.data, 'base64'));
    };
    const key = async (name) => {
      for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: name === 'Escape' ? 27 : 13 });
    };
    const navLabels = () =>
      cdp.eval(`[...document.querySelectorAll('.desktop-sidebar .desktop-nav-item')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.textContent.trim())`);
    const clickNav = (index) =>
      cdp.eval(`(() => { const b = [...document.querySelectorAll('.desktop-sidebar .desktop-nav-item')].filter((x) => x.getBoundingClientRect().width > 0)[${index}]; if (b) b.click(); return !!b; })()`);

    for (const view of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: view.w, height: view.h, deviceScaleFactor: 1, mobile: view.w < 500 });
      for (const name of SAVES) {
        where = `${name}@${view.w}x${view.h}`;
        console.log(`smoke:ui: ${where}`);
        // the save is written before any page script runs (the app flushes its in-memory save when a page unloads, so setting it from a loaded page gets overwritten)
        const seed = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear(); localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(JSON.stringify(saves[name]))});` });
        await cdp.send('Page.navigate', { url: base });
        await sleep(1500);
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seed.identifier });

        // first-run layers: the welcome modal and the guided tutorial (the new hero), then the home screen
        for (let step = 0; step < 12; step++) {
          const layer = await cdp.eval(`document.querySelector('.tutorial-card') ? 'tutorial' : document.querySelector('.welcome-modal') ? 'welcome' : ''`);
          if (!layer) break;
          await check(`${layer} ${step}`);
          await cdp.eval(
            layer === 'welcome'
              ? `document.querySelector('.welcome-modal .result-btn').click()`
              : `(document.querySelector('.tutorial-card .result-btn') ?? document.querySelector('.tutorial-card .tutorial-skip')).click()`,
          );
          await sleep(500);
        }
        await check('home');

        const phone = view.w < 1024;
        const openMenu = () => cdp.eval(`(document.querySelector('.desktop-topbar-menu') ?? document.querySelector('[aria-label="Abrir menu"]'))?.click(); true`);
        if (phone) await openMenu();
        await sleep(400);
        const labels = await navLabels();
        for (let i = 0; i < labels.length; i++) {
          if (phone && !(await navLabels()).length) await openMenu();
          await sleep(250);
          if (!(await clickNav(i))) continue;
          await sleep(500);
          await check(labels[i] || `item ${i}`);
          await key('Escape');
          await sleep(200);
          await key('Escape');
          await sleep(250);
          if (phone) await openMenu();
        }
      }
    }
    await cdp.eval('true');
  } finally {
    cleanup();
  }

  // the same finding on the same screen of several saves counts once per save and viewport; the report groups by kind
  const seen = new Set();
  const unique = failures.filter((f) => {
    const k = `${f.where}|${f.kind}|${f.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const byKind = {};
  for (const f of unique) (byKind[f.kind] ??= []).push(f);
  for (const [kind, list] of Object.entries(byKind)) {
    console.log(`\n${kind}: ${list.length}`);
    for (const f of list.slice(0, 25)) console.log(`  [${f.where}] ${f.detail}`);
    if (list.length > 25) console.log(`  ... and ${list.length - 25} more`);
  }
  console.log(`\nsmoke:ui: ${unique.length === 0 ? 'clean' : `${unique.length} finding(s)`}. Screenshots: ${path.relative(root, shots)}`);
  return unique.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
