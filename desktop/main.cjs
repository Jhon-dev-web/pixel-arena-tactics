'use strict';

// Electron main process for the Arena Idle desktop (Steam) build.
//
// Production: the Vite bundle built with `--mode desktop` (dist-desktop/) is served through a privileged
// app://game/ protocol, never file://, so the game's absolute asset URLs (/assets/...), fetch() and Web Audio
// behave exactly like on the web, and localStorage lives under a stable origin.
// Development: set ARENA_DEV_URL (scripts/desktop-dev.mjs does it) to load the Vite dev server instead.

const { app, BrowserWindow, ipcMain, Menu, net, Notification, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_SCHEME = 'app';
const APP_HOST = 'game';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const DIST_DIR = path.join(app.getAppPath(), 'dist-desktop');
const BACKGROUND = '#07050b'; // body background in src/App.css, so the window never flashes white
const TITLE = 'Arena Idle';

const DEV_URL = !app.isPackaged && process.env.ARENA_DEV_URL ? process.env.ARENA_DEV_URL : null;
const ALLOWED_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;

// Tight CSP for the packaged game: everything must come from the app itself. data: images are needed
// because Vite inlines tiny assets as data URIs. Add the Steam / backend origins here when they exist.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// ---- command line / flags --------------------------------------------------------------------------------

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}
const SMOKE = process.argv.includes('--smoke-test');
const smokeUserData = argValue('smoke-user-data');
// The game was called "Arena Duel" when the first desktop builds shipped. Electron derives the default
// userData folder from productName, so pin it to the old name: saves and window state survive the rename.
// The smoke-test override below still wins, so tests never touch the real folder.
app.setPath('userData', path.join(app.getPath('appData'), 'Arena Duel'));
if (SMOKE && smokeUserData) app.setPath('userData', path.resolve(smokeUserData));

// Let Web Audio start without a prior click if the game tries to.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

// Steam hook: once there is an App ID, add desktop/steam.cjs (init the Steamworks client, achievements,
// overlay) and call its init() here, before the first window is created. Keep it optional so the game
// still runs outside Steam.
// Adventurer Pass entitlement: the same steam.cjs will expose "does this account own the Passe de Aventureiro DLC" (SteamApps.isDlcInstalled)
// and "open the DLC store page" over IPC; src/game/entitlements.ts is the single place in the game that consumes them.

// ---- single instance -------------------------------------------------------------------------------------

let mainWindow = null;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

// ---- window state ----------------------------------------------------------------------------------------

const DEFAULT_STATE = { width: 1280, height: 720, x: undefined, y: undefined, maximized: false, fullscreen: false };

function stateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const state = { ...DEFAULT_STATE };
    if (Number.isFinite(raw.width) && Number.isFinite(raw.height)) {
      state.width = Math.max(1024, Math.round(raw.width));
      state.height = Math.max(600, Math.round(raw.height));
    }
    if (Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      // Only restore the position if the window would still be on a connected display.
      const rect = { x: Math.round(raw.x), y: Math.round(raw.y), width: state.width, height: state.height };
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return rect.x < b.x + b.width - 80 && rect.x + rect.width > b.x + 80 && rect.y >= b.y - 10 && rect.y < b.y + b.height - 80;
      });
      if (visible) {
        state.x = rect.x;
        state.y = rect.y;
      }
    }
    state.maximized = raw.maximized === true;
    state.fullscreen = raw.fullscreen === true;
    return state;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function trackWindowState(win) {
  let timer = null;
  const write = () => {
    if (win.isDestroyed()) return;
    // Keep the last windowed bounds while maximized / fullscreen so leaving those modes restores them.
    const fullscreen = win.isFullScreen();
    const maximized = win.isMaximized();
    const bounds = fullscreen || maximized ? win.getNormalBounds() : win.getBounds();
    const data = { ...bounds, maximized, fullscreen };
    try {
      fs.writeFileSync(stateFile(), JSON.stringify(data));
    } catch {
      /* non-fatal: window state is a convenience */
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(write, 400);
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    win.on(ev, schedule);
  }
  win.on('close', () => {
    clearTimeout(timer);
    write();
  });
}

function toggleFullscreen(win) {
  win.setFullScreen(!win.isFullScreen());
}

// ---- app:// protocol -------------------------------------------------------------------------------------

const smoke = { failedRequests: [], externalRequests: [], pageEvents: [], consoleErrors: [] };

function respond(status, body, headers = {}) {
  if (status >= 400) smoke.failedRequests.push(`${status} ${body}`);
  return new Response(status >= 400 ? String(body) : body, { status, headers });
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return respond(403, `forbidden host ${url.host}`);

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return respond(400, `bad request ${url.pathname}`);
    }
    if (pathname.includes('\0')) return respond(400, 'bad request');
    if (pathname === '/' || pathname === '') pathname = '/index.html';

    // Resolve inside dist-desktop/ and refuse anything that escapes it (../, encoded dots, backslashes, drive letters).
    const file = path.resolve(DIST_DIR, `.${pathname}`);
    const rel = path.relative(DIST_DIR, file);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return respond(403, `forbidden ${pathname}`);

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return respond(404, `not found ${pathname}`);
    }
    if (!stat.isFile()) return respond(404, `not found ${pathname}`);

    const upstream = await net.fetch(pathToFileURL(file).toString(), {
      headers: request.headers, // keeps Range requests working for audio
      bypassCustomProtocolHandlers: true,
    });
    const headers = new Headers(upstream.headers);
    headers.set('Content-Security-Policy', CSP);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  });
}

// ---- security --------------------------------------------------------------------------------------------

function isSafeExternal(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function hardenSession() {
  const ses = session.defaultSession;
  // The game needs no browser permission (audio does not). Deny everything, including device pickers.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  if (SMOKE) {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, cb) => {
      if (!DEV_URL || new URL(details.url).origin !== ALLOWED_ORIGIN) smoke.externalRequests.push(details.url);
      cb({});
    });
  }
}

function hardenContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  const guard = (event, url) => {
    let origin = null;
    try {
      origin = new URL(url).origin;
    } catch {
      /* fall through: blocked */
    }
    if (origin === ALLOWED_ORIGIN) return;
    event.preventDefault();
    if (isSafeExternal(url)) shell.openExternal(url);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

// ---- window ----------------------------------------------------------------------------------------------

function createWindow() {
  const state = SMOKE ? { ...DEFAULT_STATE } : loadWindowState();
  const win = new BrowserWindow({
    title: TITLE,
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    center: state.x === undefined,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: BACKGROUND,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      spellcheck: false,
      additionalArguments: SMOKE ? ['--smoke-test'] : [],
    },
  });
  mainWindow = win;

  if (app.isPackaged) win.removeMenu();
  hardenContents(win.webContents);

  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize();
    win.show();
    if (state.fullscreen) win.setFullScreen(true);
  });
  // The page controls document.title; keep ours stable.
  win.on('page-title-updated', (e) => e.preventDefault());
  // A taskbar flash raised by an activity notification ends when the player comes back.
  win.on('focus', () => win.flashFrame(false));

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const alt = input.alt && !input.control && !input.meta && !input.shift;
    if (input.key === 'F11' || (alt && input.key === 'Enter')) {
      event.preventDefault();
      toggleFullscreen(win);
    }
  });

  if (!SMOKE) trackWindowState(win);
  win.on('closed', () => {
    mainWindow = null;
  });

  win.loadURL(DEV_URL ?? `${APP_ORIGIN}/index.html`);
  return win;
}

// ---- smoke test (CI / packaging check) -------------------------------------------------------------------
// Inert unless started with --smoke-test. Options: --smoke-out=<dir> (result.json + screenshot.png, default
// the OS temp dir), --smoke-user-data=<dir> (isolated userData so the player's real save is untouched),
// --smoke-marker=<value> (write that value into localStorage after reading the previous one).

function runSmokeTest(win) {
  const outDir = path.resolve(argValue('smoke-out') || path.join(app.getPath('temp'), 'arena-duel-smoke'));
  const marker = argValue('smoke-marker');
  fs.mkdirSync(outDir, { recursive: true });
  const result = { ok: false, errors: [] };
  let finished = false;

  const finish = async (code) => {
    if (finished) return;
    finished = true;
    clearTimeout(watchdog);
    result.ok = code === 0;
    let captured = false;
    for (let attempt = 1; attempt <= 6 && !captured; attempt++) {
      try {
        const image = await win.webContents.capturePage();
        if (image.isEmpty()) throw new Error('empty image');
        fs.writeFileSync(path.join(outDir, 'screenshot.png'), image.toPNG());
        captured = true;
      } catch (e) {
        if (attempt === 6) result.errors.push(`capturePage failed: ${e.message}`);
        else await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!captured) {
      result.ok = false;
      code = 1;
    }
    fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
    try {
      await session.defaultSession.flushStorageData();
    } catch {
      /* ignore */
    }
    app.exit(code);
  };
  const watchdog = setTimeout(() => {
    result.errors.push('timeout: smoke test did not finish in 40s');
    finish(1);
  }, 40000);

  win.webContents.on('console-message', (event) => {
    const level = event.level ?? event;
    if (level === 'error' || level === 3) smoke.consoleErrors.push(String(event.message ?? ''));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    result.errors.push(`did-fail-load ${code} ${desc} ${url}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    result.errors.push(`render-process-gone ${details.reason}`);
    finish(1);
  });

  win.webContents.once('did-finish-load', async () => {
    try {
      const probe = `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 100; i++) {
          const root = document.querySelector('#root');
          if (root && root.children.length > 0 && !document.querySelector('.loading-container')) break;
          await wait(100);
        }
        await wait(1500); // let the first screen settle (images, first paint)
        const root = document.querySelector('#root');
        const marker = ${JSON.stringify(marker)};
        const markerBefore = localStorage.getItem('__smoke_marker__');
        if (marker !== null) localStorage.setItem('__smoke_marker__', marker);
        let rangeStatus = null;
        try {
          const r = await fetch('/assets/music/ambient.ogg', { headers: { Range: 'bytes=0-9' } });
          rangeStatus = r.status + ' ' + (r.headers.get('content-type') || '');
        } catch (e) { rangeStatus = 'error: ' + e.message; }
        return {
          title: document.title,
          location: location.href,
          rootChildren: root ? root.children.length : -1,
          loaderStillVisible: !!document.querySelector('.loading-container'),
          bodyTextLength: document.body.innerText.length,
          bodyTextSample: document.body.innerText.slice(0, 120),
          imagesLoaded: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length,
          imagesBroken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
          localStorageKeys: Object.keys(localStorage).length,
          markerBefore,
          markerNow: localStorage.getItem('__smoke_marker__'),
          fontCheck: (await document.fonts.load('12px "Press Start 2P"', 'Aãçéõ'), document.fonts.check('12px "Press Start 2P"')),
          fontFacesLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.unicodeRange.slice(0, 24)),
          audioContext: typeof (window.AudioContext || window.webkitAudioContext),
          rangeRequest: rangeStatus,
          userAgentHasElectron: navigator.userAgent.includes('Electron'),
        };
      })()`;
      Object.assign(result, await win.webContents.executeJavaScript(probe));
    } catch (e) {
      result.errors.push(`probe failed: ${e.message}`);
    }
    result.userData = app.getPath('userData');
    result.appVersion = app.getVersion();
    result.appName = app.getName();
    result.electron = process.versions.electron;
    result.failedRequests = smoke.failedRequests;
    result.externalRequests = smoke.externalRequests;
    result.consoleErrors = smoke.consoleErrors;
    result.pageEvents = smoke.pageEvents;
    const bad =
      result.errors.length > 0 ||
      !(result.rootChildren > 0) ||
      result.loaderStillVisible ||
      smoke.failedRequests.length > 0 ||
      smoke.externalRequests.length > 0 ||
      smoke.consoleErrors.length > 0 ||
      smoke.pageEvents.length > 0 ||
      result.imagesBroken > 0 ||
      result.fontCheck !== true;
    finish(bad ? 1 : 0);
  });
}

// ---- lifecycle -------------------------------------------------------------------------------------------

app.on('web-contents-created', (_e, contents) => hardenContents(contents));

app.whenReady().then(() => {
  if (!app.isPackaged && !DEV_URL && !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    console.error('dist-desktop/ not found. Run `npm run desktop:build` first, or `npm run desktop:dev`.');
  }
  if (app.isPackaged) Menu.setApplicationMenu(null);
  registerAppProtocol();
  hardenSession();
  // Fullscreen from the Settings button: the same toggle as F11 / Alt+Enter, acting only on the game window.
  ipcMain.handle('window:toggle-fullscreen', () => {
    if (mainWindow) toggleFullscreen(mainWindow);
    return mainWindow ? mainWindow.isFullScreen() : false;
  });
  ipcMain.handle('window:is-fullscreen', () => (mainWindow ? mainWindow.isFullScreen() : false));
  // Activity-finished notification (src/game/notify.ts): {title, body} from the game window only; shown only while that window is NOT focused; one native
  // notification (clicking it brings the window back) and a taskbar flash. Anything malformed is ignored and nothing else is exposed.
  ipcMain.handle('notify:show', (event, payload) => {
    const win = mainWindow;
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return false;
    const clean = (v, max) => (typeof v === 'string' ? Array.from(v, (ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').trim().slice(0, max) : '');
    const title = clean(payload && payload.title, 80);
    const body = clean(payload && payload.body, 200);
    if (!title || !body || win.isFocused() || !Notification.isSupported()) return false;
    const notice = new Notification({ title, body, icon: path.join(__dirname, 'icon.png') });
    notice.on('click', () => {
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });
    notice.show();
    win.flashFrame(true);
    return true;
  });
  if (SMOKE) {
    ipcMain.on('smoke:page-event', (_e, text) => smoke.pageEvents.push(String(text)));
  }
  const win = createWindow();
  if (SMOKE) runSmokeTest(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
