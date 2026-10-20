// Builds public/assets/spritesheets/hero_dark_knight.png (+ walk strip) from the owner's art.
// Usage: node scripts/art/build-hero-dark-knight.mjs <sheetA.png> <deathB.png> [previewOut.png]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../../portal/package.json', import.meta.url));
const sharp = require('sharp');

const [A_PATH, B_PATH, PREVIEW] = process.argv.slice(2);
const OUT = path.resolve('public/assets/spritesheets');
const CELL = 256, BASE = CELL - 4, IDLE_TARGET = 208, ALPHA = 24, GAP = 9;

async function load(p) {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}
// column-projection segmentation inside [y0,y1], x>=xmin
function segment(img, y0, y1, xmin) {
  const cols = [];
  for (let x = xmin; x < img.W; x++) {
    let on = false;
    for (let y = y0; y <= y1; y++) if (img.data[(y * img.W + x) * 4 + 3] > ALPHA) { on = true; break; }
    cols.push(on);
  }
  const segs = []; let s = -1, last = -1;
  cols.forEach((on, i) => {
    if (on) { if (s < 0) s = i; else if (i - last > GAP) { segs.push([s, last]); s = i; } last = i; }
  });
  if (s >= 0) segs.push([s, last]);
  return segs.map(([a, b]) => ({ x0: a + xmin, x1: b + xmin, y0, y1 }));
}
function bbox(img, f, th = ALPHA) {
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++)
    if (img.data[(y * img.W + x) * 4 + 3] > th) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { ...f, x0, x1, y0, y1 };
}
// body centre: mean x of dark armour/hair pixels (sword and slash are light)
function bodyCx(img, f) {
  let sum = 0, n = 0;
  for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) {
    const i = (y * img.W + x) * 4;
    if (img.data[i + 3] < 200) continue;
    const lum = 0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2];
    if (lum < 80) { sum += x; n++; }
  }
  return n ? sum / n : (f.x0 + f.x1) / 2;
}
const A = await load(A_PATH), B = await load(B_PATH);
const bands = { idle: [14, 248], walk: [294, 505], attack: [536, 752], hurt: [794, 981] };
const fr = {};
for (const [k, [a, b]] of Object.entries(bands)) fr[k] = segment(A, a, b, 170).map((f) => bbox(A, f));
// attack frames 2 and 3 touch (sword tip meets the slash glow): split at the emptiest column between them
{
  const segs = fr.attack;
  if (segs.length === 3) {
    const m = segs.findIndex((f) => f.x1 - f.x0 > 500);
    const f = segs[m];
    let best = 1e9, bx = 0;
    for (let x = 780; x <= 840; x++) {
      let c = 0;
      for (let y = f.y0; y <= f.y1; y++) if (A.data[(y * A.W + x) * 4 + 3] > ALPHA) c++;
      if (c < best) { best = c; bx = x; }
    }
    console.log('attack split at', bx, 'pixels', best);
    // frame 2's sword tip (low, y>=655) pokes into the glow's columns; keep it with frame 2
    const tip = (x, y) => x <= 826 && y >= 655;
    const f2 = bbox(A, { ...f, x1: 826 }), f3 = bbox(A, { ...f, x0: bx });
    f2.keep = (x, y) => x < bx || tip(x, y);
    f3.keep = (x, y) => x >= bx && !tip(x, y);
    fr.attack.splice(m, 1, f2, f3);
  }
}
// B: whole image is one row; ignore tiny specks
fr.death = segment(B, 0, B.H - 1, 0).map((f) => bbox(B, f)).filter((f) => f.x1 - f.x0 > 40);
for (const [k, v] of Object.entries(fr)) console.log(k, v.length, v.map((f) => `${f.x0}-${f.x1}x${f.y0}-${f.y1}`).join(' '));
for (const k of Object.keys(fr)) if (fr[k].length !== 4) throw new Error(`${k}: expected 4 frames, got ${fr[k].length}`);

// heights: idle body (opaque pixels) vs standing death frame
const solidH = (img, f) => { const b = bbox(img, f, 200); return b.y1 - b.y0 + 1; };
const idleH = Math.max(...fr.idle.map((f) => solidH(A, f)));
const deathH = solidH(B, fr.death[0]);
const sA = IDLE_TARGET / idleH;
const sB = sA * (idleH / deathH);
console.log({ idleH, deathH, sA: sA.toFixed(4), sB: sB.toFixed(4) });

async function renderCell(img, f, s) {
  const w = Math.max(1, Math.round((f.x1 - f.x0 + 1) * s)), h = Math.max(1, Math.round((f.y1 - f.y0 + 1) * s));
  const src = Buffer.from(img.data);
  if (f.keep) for (let y = 0; y < img.H; y++) for (let x = 0; x < img.W; x++) if ((x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1) && !f.keep(x, y)) src[(y * img.W + x) * 4 + 3] = 0;
  const crop = await sharp(src, { raw: { width: img.W, height: img.H, channels: 4 } })
    .extract({ left: f.x0, top: f.y0, width: f.x1 - f.x0 + 1, height: f.y1 - f.y0 + 1 })
    .resize(w, h, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  // feet baseline: bottom of the bbox; body centre
  const cx = Math.round((bodyCx(img, f) - f.x0) * s);
  let ox = Math.round(CELL / 2 - cx);
  if (w > CELL) ox = Math.round((ox + (CELL - w) / 2) / 2); // very wide frame: split the clipping between both sides
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
const rows = [];
for (const [k, img, s] of [['idle', A, sA], ['attack', A, sA], ['hurt', A, sA], ['death', B, sB]])
  rows.push(await Promise.all(fr[k].map((f) => renderCell(img, f, s))));
const walk = await Promise.all(fr.walk.map((f) => renderCell(A, f, sA)));

async function sheet(rowsList, w, h, file) {
  const comps = [];
  for (let r = 0; r < rowsList.length; r++) for (let c = 0; c < 4; c++)
    comps.push({ input: await sharp(rowsList[r][c], { raw: { width: CELL, height: CELL, channels: 4 } }).png().toBuffer(), left: c * CELL, top: r * CELL });
  const buf = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(comps).png({ compressionLevel: 9, palette: true, quality: 92, colours: 256, effort: 10, dither: 0 }).toBuffer();
  fs.writeFileSync(file, buf);
  console.log(file, (buf.length / 1024).toFixed(0), 'KB');
  return buf;
}
const main = await sheet(rows, 1024, 1024, path.join(OUT, 'hero_dark_knight.png'));
await sheet([walk], 1024, 256, path.join(OUT, 'hero_dark_knight_walk.png'));
if (PREVIEW) {
  const lines = [];
  for (let i = 0; i <= 4; i++) {
    lines.push(`<rect x="0" y="${i * 256}" width="1024" height="1" fill="#f0f"/>`, `<rect x="${i * 256}" y="0" width="1" height="1024" fill="#f0f"/>`);
    lines.push(`<rect x="0" y="${i * 256 + 248}" width="1024" height="1" fill="#0ff" opacity=".4"/>`);
  }
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#808080' } })
    .composite([{ input: main }, { input: Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">${lines.join('')}</svg>`) }])
    .png().toFile(PREVIEW);
}
