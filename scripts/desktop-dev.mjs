// npm run desktop:dev  ->  the same Electron shell, pointed at a Vite dev server (hot reload).
//
// Starts Vite on DESKTOP_DEV_PORT (default 5200, strict so it never grabs another dev server's port), waits for
// it, launches Electron with ARENA_DEV_URL, and stops Vite when the window closes. If ARENA_DEV_URL is already
// set, it is used as is and no Vite server is started.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electronBin = require('electron'); // path to the electron executable

let vite = null;
let devUrl = process.env.ARENA_DEV_URL;

if (!devUrl) {
  const port = process.env.DESKTOP_DEV_PORT || '5200';
  devUrl = `http://localhost:${port}`;
  vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', port, '--strictPort'], {
    cwd: root,
    stdio: 'inherit',
  });
  vite.on('exit', (code) => {
    if (code) {
      console.error(`vite exited with code ${code}`);
      process.exit(code);
    }
  });
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(devUrl);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - started > 60000) {
      console.error(`Timed out waiting for ${devUrl}`);
      vite.kill();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const child = spawn(electronBin, [root], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ARENA_DEV_URL: devUrl },
});
child.on('exit', (code) => {
  if (vite) vite.kill();
  process.exit(code ?? 0);
});
