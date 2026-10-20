// Builds public/assets/spritesheets/<look>.png (+ <look>_walk.png) from the owner's per-armor 1536x1024 sheets
// (rows idle / walk / attack / hurt, 4 frames each; some have text label boxes + frame numbers, some are opaque, some carry a soft glow halo).
// Same output convention as build-hero-dark-knight.mjs (256 cells, rows idle/attack/hurt/death, facing right, idle body ~208 px, feet at y=251),
// but there is no death art: the death row is hurt1, hurt1, hurt2, hurt2 (the game plays it once and holds the last frame).
// Usage: node scripts/art/build-hero-sheets.mjs <uploadsDir> <previewOut.png> [lookId ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../../portal/package.json', import.meta.url));
const sharp = require('sharp');

const [DIR, PREVIEW, ...ONLY] = process.argv.slice(2);
const OUT = path.resolve('public/assets/spritesheets');
const CELL = 256, BASE = CELL - 4, IDLE_TARGET = 208, ALPHA = 24, GAP = 9;

// bg: 'alpha' = already transparent; 'black' = opaque pure-black background; 'gradient' = opaque dark navy gradient with a soft reddish glow.
// minAlpha: pixels below it are cleared (kills the chromatic fringes of soft edges and, with a high value, the glow halos).
const LOOKS = {
  hero_iron_v2: { file: '7716936a-image.png', bg: 'alpha', labels: true, minAlpha: 96 },
  hero_peasant_v2: { file: 'fe8543cc-image.png', bg: 'alpha', labels: false, minAlpha: 150 },
  hero_steel_v2: { file: '166c10ea-image.png', bg: 'black', labels: true, minAlpha: 0 },
  hero_voidsteel_v2: { file: '08397be6-image.png', bg: 'alpha', labels: false, minAlpha: 215 },
  hero_dragon_v2: { file: 'f1857e82-image.png', bg: 'alpha', labels: false, minAlpha: 215 },
  hero_abyssal_v2: { file: '13c12581-image.png', bg: 'black', labels: true, minAlpha: 0 },
  hero_bronze_v2: { file: '4f00acc0-image.png', bg: 'alpha', labels: false, minAlpha: 215, rows: 5 }, // 5th row = a real death animation
};

async function load(p) {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}
const lumAt = (d, i) => 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
const maxAt = (d, i) => Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);

// Flood-fill the background from the image borders only: whatever is not connected to the edge (dark armour, hair, outlines inside the figure) stays.
function floodBackground(img, mode) {
  const { data: d, W, H } = img;
  const seen = new Uint8Array(W * H);
  const q = [];
  const isBg = (i, from) => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (mode === 'black') return Math.max(r, g, b) <= 12;
    // gradient: relative to the neighbour it grew from (the gradient is smooth, armour and hair are not), and either the dark navy ground or the brownish low-saturation glow
    const f = from * 4;
    const lum = lumAt(d, i);
    const step = Math.abs(r - d[f]) + Math.abs(g - d[f + 1]) + Math.abs(b - d[f + 2]);
    const navy = step <= 12 && lum < 40 && b + 2 >= r;
    const glow = g >= 0.3 * r && r >= b - 3 && r <= 125 && lum < 80 && step <= 40;
    return navy || glow;
  };
  const seed = (i) => { if (!seen[i] && isBg(i, i)) { seen[i] = 1; q.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!seen[j] && isBg(j, i)) { seen[j] = 1; q.push(j); }
    }
  }
  if (mode === 'black') {
    // enclosed pure-black pockets (between the sword and the slash arc, holes in a cape): background too, when large enough to not be armour shading
    const seen2 = new Uint8Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (seen[s] || seen2[s] || maxAt(d, s) > 4) continue;
      const comp = [s]; seen2[s] = 1;
      for (let h = 0; h < comp.length; h++) {
        const i = comp[h], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!seen[j] && !seen2[j] && maxAt(d, j) <= 4) { seen2[j] = 1; comp.push(j); }
        }
      }
      if (comp.length >= 120) for (const i of comp) seen[i] = 1;
    }
  }
  for (let i = 0; i < W * H; i++) if (seen[i]) d[i * 4 + 3] = 0;
}

// 8-connected components of the visible pixels
function components(img) {
  const { data: d, W, H } = img;
  const label = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let s = 0; s < W * H; s++) {
    if (label[s] >= 0 || d[s * 4 + 3] <= ALPHA) continue;
    const id = comps.length, list = [s];
    label[s] = id;
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let h = 0; h < list.length; h++) {
      const i = list[h], x = i % W, y = (i / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (label[j] < 0 && d[j * 4 + 3] > ALPHA) { label[j] = id; list.push(j); }
      }
    }
    let sx = 0, sy = 0; for (const i of list) { sx += i % W; sy += (i / W) | 0; }
    comps.push({ id, size: list.length, x0, x1, y0, y1, cx: sx / list.length, cy: sy / list.length });
  }
  return { label, comps };
}

// drop label boxes, frame numbers and floating specks: big components stay; a small one stays only when it is close to a big one and is not a number under the feet
function cleanSpecks(img, cfg) {
  const { data: d, W } = img;
  // label boxes sit at the left, one per row
  if (cfg.labels) for (const [ya, yb] of [[78, 140], [340, 402], [598, 662], [832, 895]]) for (let y = ya; y <= yb; y++) for (let x = 0; x < 178; x++) d[(y * W + x) * 4 + 3] = 0;
  const { label, comps } = components(img);
  const big = comps.filter((c) => c.size >= 1500);
  const keep = new Set(big.map((c) => c.id));
  for (const c of comps) {
    if (keep.has(c.id) || c.size < 6) continue;
    const nears = big.filter((b) => c.x0 <= b.x1 + 50 && c.x1 >= b.x0 - 50 && c.y0 <= b.y1 + 50 && c.y1 >= b.y0 - 50);
    if (!nears.length) continue;
    // numbers sit just below the shadow, inside the x-range of the figure above them
    if (c.size < 400 && big.some((b) => b.y1 <= c.y0 + 2 && c.y0 - b.y1 <= 40 && c.x0 >= b.x0 - 20 && c.x1 <= b.x1 + 20)) continue;
    keep.add(c.id);
  }
  for (let i = 0; i < label.length; i++) if (label[i] >= 0 && !keep.has(label[i])) d[i * 4 + 3] = 0;
}

async function prepare(cfg) {
  const img = await load(path.join(DIR, cfg.file));
  if (cfg.bg !== 'alpha') floodBackground(img, cfg.bg);
  if (cfg.minAlpha) for (let i = 0; i < img.W * img.H; i++) if (img.data[i * 4 + 3] < cfg.minAlpha) img.data[i * 4 + 3] = 0;
  cleanSpecks(img, cfg);
  img.cl = components(img);
  return img;
}

function bbox(img, f, th = ALPHA) {
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++)
    if (img.data[(y * img.W + x) * 4 + 3] > th) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { ...f, x0, x1, y0, y1 };
}
// Frames: the 16 biggest cores (the visible pixels eroded by 2, so thin bridges between neighbours disappear) are the 16 bodies (row = sorted by height, column = by x).
// Every visible pixel is then owned by the nearest body through the visible pixels (multi-source flood from the cores); pieces not connected to any body (stars, detached
// sparks) go to the nearest body by centroid. Each frame keeps only its own pixels, so neighbours that overlap in x (a sword tip meeting the next frame's slash) cannot leak.
function frames(img, nRows = 4) {
  const { data: d, W, H } = img;
  const vis = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > ALPHA;
  const R = 2;
  const core = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!vis(x, y)) continue;
    let ok = true;
    for (let dy = -R; dy <= R && ok; dy++) for (let dx = -R; dx <= R; dx++) if (!vis(x + dx, y + dy)) { ok = false; break; }
    if (ok) core[y * W + x] = 1;
  }
  const cl = new Int32Array(W * H).fill(-1), cc = [];
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!core[s0] || cl[s0] >= 0) continue;
    const id = cc.length, list = [s0]; cl[s0] = id;
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, sx = 0, sy = 0;
    for (let h = 0; h < list.length; h++) {
      const i = list[h], x = i % W, y = (i / W) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (core[j] && cl[j] < 0) { cl[j] = id; list.push(j); }
      }
    }
    cc.push({ id, size: list.length, x0, x1, y0, y1, cx: sx / list.length, cy: sy / list.length, list });
  }
  const sorted = [...cc].sort((p, q) => q.size - p.size);
  if (process.env.DEBUG) console.log(sorted.slice(0, 20).map((c) => `${c.size}:${c.x0}-${c.x1}x${c.y0}-${c.y1}`).join(' '));
  // rows by height; a row with fewer than 4 bodies has two frames fused by a thick glow: split its widest core at the emptiest column of the core, repeatedly
  const big = sorted.filter((c) => c.size >= 3000).sort((p, q) => p.cy - q.cy);
  const rows = [];
  for (const c of big) { const r = rows[rows.length - 1]; if (r && Math.abs(c.cy - r.reduce((t, k) => t + k.cy, 0) / r.length) < 110) r.push(c); else rows.push([c]); }
  if (rows.length !== nRows) throw new Error(`expected ${nRows} rows, found ` + rows.length);
  for (const row of rows) {
    while (row.length < 4) {
      row.sort((p, q) => q.size - p.size);
      const c = row.shift();
      const cnt = new Map();
      for (const i of c.list) cnt.set(i % W, (cnt.get(i % W) ?? 0) + 1);
      let bx = 0, best = 1e9;
      for (let x = c.x0 + Math.round((c.x1 - c.x0) * 0.3); x <= c.x0 + Math.round((c.x1 - c.x0) * 0.7); x++) { const v = cnt.get(x) ?? 0; if (v <= best) { best = v; bx = x; } }
      console.log(`  fused core ${c.x0}-${c.x1} split at ${bx} (${best} core px)`);
      for (const part of [c.list.filter((i) => i % W < bx), c.list.filter((i) => i % W >= bx)]) {
        let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, sx = 0, sy = 0;
        for (const i of part) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y; }
        row.push({ size: part.length, x0, x1, y0, y1, cx: sx / part.length, cy: sy / part.length, list: part });
      }
    }
    if (row.length !== 4) throw new Error('expected 4 bodies in a row, found ' + row.length);
    row.sort((p, q) => p.cx - q.cx);
  }
  const all = rows.flat();
  const owner = new Int8Array(W * H).fill(-1);
  let q = [];
  all.forEach((an, k) => { for (const i of an.list) { owner[i] = k; q.push(i); } });
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!vis(nx, ny)) continue;
      const j = ny * W + nx;
      if (owner[j] < 0) { owner[j] = owner[i]; q.push(j); }
    }
  }
  // detached pieces: group by the visible components of cleanSpecks, nearest body by centroid
  const { label, comps } = img.cl;
  const near = new Map();
  for (const c of comps) {
    const mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2;
    let best = 0, bd = 1e12;
    all.forEach((an, k) => { const dd = (mx - an.cx) ** 2 + 4 * (my - an.cy) ** 2; if (dd < bd) { bd = dd; best = k; } });
    near.set(c.id, best);
  }
  for (let i = 0; i < W * H; i++) if (owner[i] < 0 && label[i] >= 0) owner[i] = near.get(label[i]);
  const box = all.map(() => ({ x0: 1e9, x1: -1, y0: 1e9, y1: -1 }));
  for (let i = 0; i < W * H; i++) { const k = owner[i]; if (k < 0) continue; const b = box[k], x = i % W, y = (i / W) | 0; b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); }
  return rows.map((row, r) => row.map((_, c) => { const k = r * 4 + c; return { ...box[k], keep: new Set([k]), label: owner }; }));
}

// body centre: mean x of dark armour/hair pixels (sword and slash are light)
function bodyCx(img, f) {
  let sum = 0, n = 0;
  for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) {
    const i = (y * img.W + x) * 4;
    if (img.data[i + 3] < 200 || !f.keep.has(f.label[y * img.W + x])) continue;
    if (0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2] < 80) { sum += x; n++; }
  }
  return n ? sum / n : (f.x0 + f.x1) / 2;
}

async function renderCell(img, f, s) {
  const w = Math.max(1, Math.round((f.x1 - f.x0 + 1) * s)), h = Math.max(1, Math.round((f.y1 - f.y0 + 1) * s));
  let src = img.data;
  if (f.keep) {
    src = Buffer.from(img.data);
    for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) { const l = f.label[y * img.W + x]; if (l < 0 || !f.keep.has(l)) src[(y * img.W + x) * 4 + 3] = 0; }
  }
  const crop = await sharp(src, { raw: { width: img.W, height: img.H, channels: 4 } })
    .extract({ left: f.x0, top: f.y0, width: f.x1 - f.x0 + 1, height: f.y1 - f.y0 + 1 })
    .resize(w, h, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  const cx = Math.round((bodyCx(img, f) - f.x0) * s);
  let ox = Math.round(CELL / 2 - cx);
  if (w > CELL) ox = Math.round((ox + (CELL - w) / 2) / 2);
  const oy = BASE - h;
  const cell = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + ox, dy = y + oy;
    if (dx < 0 || dx >= CELL || dy < 0 || dy >= CELL) continue;
    const si = (y * w + x) * 4, di = (dy * CELL + dx) * 4;
    crop.copy(cell, di, si, si + 4);
  }
  return cell;
}

async function sheet(rowsList, w, h, file) {
  const comps = [];
  for (let r = 0; r < rowsList.length; r++) for (let c = 0; c < 4; c++)
    comps.push({ input: await sharp(rowsList[r][c], { raw: { width: CELL, height: CELL, channels: 4 } }).png().toBuffer(), left: c * CELL, top: r * CELL });
  const buf = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(comps).png({ compressionLevel: 9, palette: true, quality: 92, colours: 256, effort: 10, dither: 0 }).toBuffer();
  fs.writeFileSync(file, buf);
  console.log(' ', path.basename(file), (buf.length / 1024).toFixed(0), 'KB');
  return buf;
}

const built = [];
for (const [id, cfg] of Object.entries(LOOKS)) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  console.log(id);
  const A = await prepare(cfg);
  if (process.env.DUMP) await sharp({ create: { width: A.W, height: A.H, channels: 4, background: '#808080' } }).composite([{ input: A.data, raw: { width: A.W, height: A.H, channels: 4 } }]).png().toFile(process.env.DUMP + id + '.png');
  const [idle, walk, attack, hurt, death] = frames(A, cfg.rows ?? 4);
  const solidH = (f) => { let y0 = 1e9, y1 = -1; for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) if (A.data[(y * A.W + x) * 4 + 3] > 200 && f.keep.has(f.label[y * A.W + x])) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return y1 - y0 + 1; };
  const idleH = Math.max(...idle.map(solidH));
  const s = IDLE_TARGET / idleH;
  console.log('  idleH', idleH, 'scale', s.toFixed(4), 'frames', [idle, walk, attack, hurt, death].filter(Boolean).map((r) => r.map((f) => `${f.x0}-${f.x1}`).join('/')).join(' | '));
  const cells = async (frames) => Promise.all(frames.map((f) => renderCell(A, f, s)));
  const [ci, ca, ch] = [await cells(idle), await cells(attack), await cells(hurt)];
  const cd = death ? await cells(death) : [ch[0], ch[0], ch[1], ch[1]];
  const main = await sheet([ci, ca, ch, cd], 1024, 1024, path.join(OUT, `${id}.png`));
  await sheet([await cells(walk)], 1024, 256, path.join(OUT, `${id}_walk.png`));
  built.push({ id, main, idleBox: (() => { const c = ci[0]; let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (c[(y * CELL + x) * 4 + 3] > ALPHA) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; })() });
}
console.log('IDLE BOXES', JSON.stringify(Object.fromEntries(built.map((b) => [b.id, b.idleBox]))));

if (PREVIEW && built.length) {
  // every sheet over mid-grey and over white, cell lines (magenta) and the y=251 feet line (cyan); two sheets per row of the combined image, grey left / white right
  const lines = [];
  for (let i = 0; i <= 4; i++) {
    lines.push(`<rect x="0" y="${i * 256}" width="1024" height="1" fill="#f0f"/>`, `<rect x="${i * 256}" y="0" width="1" height="1024" fill="#f0f"/>`);
    lines.push(`<rect x="0" y="${i * 256 + 251}" width="1024" height="1" fill="#0ff" opacity=".5"/>`);
  }
  const overlay = Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`);
  const tiles = [];
  for (const b of built) for (const bg of ['#808080', '#ffffff'])
    tiles.push(await sharp({ create: { width: 1024, height: 1024, channels: 4, background: bg } }).composite([{ input: b.main }, { input: overlay }]).png().toBuffer());
  const cols = 2, rowsN = built.length;
  await sharp({ create: { width: 1024 * cols, height: 1024 * rowsN, channels: 4, background: '#202020' } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 1024, top: Math.floor(i / cols) * 1024 }))).png().toFile(PREVIEW);
}
