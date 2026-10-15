// npm run desktop:build  ->  release/win-unpacked/Arena Idle.exe (unpacked folder for a Steam depot, no installer)
//
// 1. Builds the web bundle in Vite's "desktop" mode into dist-desktop/ with the backend variables forced empty
//    (offline / local save only) regardless of any .env* file or shell variable.
// 2. Packages it with electron-builder (win x64, `dir` target; config in electron-builder.yml).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (pkg, file) => path.join(root, 'node_modules', pkg, file);

function run(label, args, extraEnv = {}) {
  console.log(`\n> ${label}`);
  const res = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    console.error(`\n${label} failed (exit ${res.status ?? res.signal}).`);
    process.exit(res.status ?? 1);
  }
}

fs.rmSync(path.join(root, 'dist-desktop'), { recursive: true, force: true });
fs.rmSync(path.join(root, 'release', 'win-unpacked'), { recursive: true, force: true });

run('vite build --mode desktop', [bin('vite', 'bin/vite.js'), 'build', '--mode', 'desktop'], {
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_ANON_KEY: '',
});

run('electron-builder --win dir --x64', [bin('electron-builder', 'cli.js'), '--win', 'dir', '--x64'], {
  CSC_IDENTITY_AUTO_DISCOVERY: 'false', // no code signing yet
});

console.log('\nDone: release/win-unpacked/Arena Idle.exe');
