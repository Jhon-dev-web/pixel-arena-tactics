// Vendors every remote (http/https) asset referenced by src/assets.json into public/assets
// and rewrites the manifest url to the local path. Idempotent: once nothing is remote, it is a no-op.
// Usage: node scripts/vendor-remote-assets.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, posix } from 'path';

const MANIFEST = 'src/assets.json';
const OUT_ROOT = 'public/assets';

// manifest top-level section -> folder under public/assets
const CATEGORY_DIR = {
  spritesheets: 'spritesheets',
  background: 'backgrounds',
  sfx: 'sfx',
  music: 'music',
  characters: 'characters',
  weapons: 'weapons',
  icons: 'icons',
  gear_icons: 'gear_icons',
};

const isRemote = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

const raw = readFileSync(MANIFEST, 'utf8');
const manifest = JSON.parse(raw);

// Plan first so a collision aborts before anything is downloaded or written.
const plan = [];
const targets = new Set();
for (const [section, entries] of Object.entries(manifest)) {
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry || !isRemote(entry.url)) continue;
    const dir = CATEGORY_DIR[section];
    if (!dir) throw new Error(`No target folder configured for manifest section "${section}"`);
    const ext = posix.extname(new URL(entry.url).pathname).toLowerCase();
    if (!ext) throw new Error(`Cannot determine file extension for ${section}.${key}: ${entry.url}`);
    const localUrl = `/assets/${dir}/${key}${ext}`;
    const diskPath = join(OUT_ROOT, dir, `${key}${ext}`);
    if (existsSync(diskPath)) throw new Error(`Refusing to overwrite existing file: ${diskPath} (${section}.${key})`);
    if (targets.has(diskPath)) throw new Error(`Two entries map to the same file: ${diskPath}`);
    targets.add(diskPath);
    plan.push({ section, key, entry, remote: entry.url, localUrl, diskPath });
  }
}

if (plan.length === 0) {
  console.log('Nothing to do: no remote URLs left in', MANIFEST);
  process.exit(0);
}

let total = 0;
for (const item of plan) {
  const res = await fetch(item.remote);
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status} for ${item.section}.${item.key}: ${item.remote}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`Empty response for ${item.section}.${item.key}: ${item.remote}`);
  mkdirSync(dirname(item.diskPath), { recursive: true });
  writeFileSync(item.diskPath, buf);
  total += buf.length;
  console.log(`${item.section}.${item.key} -> ${item.localUrl} (${buf.length} bytes)`);
}

// Only rewrite the manifest once every download succeeded.
for (const item of plan) item.entry.url = item.localUrl;
const eol = raw.includes('\r\n') ? '\r\n' : '\n'; // keep the file's existing line endings
const trailingNewline = /\r?\n$/.test(raw) ? eol : '';
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2).replace(/\n/g, eol) + trailingNewline);
console.log(`Vendored ${plan.length} files, ${total} bytes total.`);
