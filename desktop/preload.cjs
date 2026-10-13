'use strict';

// Preload (sandboxed, context-isolated). Exposes a tiny, read-only surface to the game; nothing from Node
// or Electron leaks into the page. The Steam bridge (achievements, overlay, ...) will be added here later.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'arenaDesktop',
  Object.freeze({
    isDesktop: true,
    platform: process.platform,
    // Window fullscreen (Settings): the main process owns the window, the page only asks.
    toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
    isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  }),
);

// Smoke test only (--smoke-test): forward resource load errors and CSP violations to the main process.
if (process.argv.includes('--smoke-test')) {
  const report = (text) => ipcRenderer.send('smoke:page-event', text);
  window.addEventListener(
    'error',
    (e) => {
      const t = e.target;
      if (t && t !== window && t.tagName) report(`resource error <${t.tagName.toLowerCase()}> ${t.src || t.href || ''}`);
      else report(`script error ${e.message || ''}`);
    },
    true,
  );
  window.addEventListener('securitypolicyviolation', (e) => {
    report(`csp ${e.violatedDirective} blocked ${e.blockedURI}`);
  });
  window.addEventListener('unhandledrejection', (e) => report(`unhandled rejection ${String(e.reason)}`));
}
