// Characters of a font file's cmap (WOFF1 as shipped by @fontsource, no dependency): used by the font coverage test and runnable by hand.
// node scripts/fontCoverage.mjs  -> prints, per language, every character of the locale files that the bundled font does not cover.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function woffCodepoints(path) {
  const buf = readFileSync(path);
  if (buf.toString('latin1', 0, 4) !== 'wOFF') throw new Error('not a WOFF1 file: ' + path);
  const numTables = buf.readUInt16BE(12);
  let cmap = null;
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    if (buf.toString('latin1', o, o + 4) === 'cmap') {
      const off = buf.readUInt32BE(o + 4);
      const comp = buf.readUInt32BE(o + 8);
      const orig = buf.readUInt32BE(o + 12);
      const raw = buf.subarray(off, off + comp);
      cmap = comp < orig ? inflateSync(raw) : raw;
    }
  }
  if (!cmap) throw new Error('no cmap');
  const set = new Set();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const sub = cmap.readUInt32BE(4 + i * 8 + 4);
    const fmt = cmap.readUInt16BE(sub);
    if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(sub + 6);
      const endO = sub + 14;
      const startO = endO + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = cmap.readUInt16BE(endO + s * 2);
        const start = cmap.readUInt16BE(startO + s * 2);
        for (let c = start; c <= end && c < 0xffff; c++) set.add(c);
      }
    } else if (fmt === 12) {
      const groups = cmap.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const start = cmap.readUInt32BE(sub + 16 + g * 12);
        const end = cmap.readUInt32BE(sub + 20 + g * 12);
        for (let c = start; c <= end; c++) set.add(c);
      }
    }
    void platform;
  }
  return set;
}

const FILES = ['latin-400-normal', 'latin-ext-400-normal'].map((f) => `node_modules/@fontsource/press-start-2p/files/press-start-2p-${f}.woff`);

if (process.argv[1] && process.argv[1].endsWith('fontCoverage.mjs')) {
  const sets = FILES.map((f) => woffCodepoints(f));
  const accents = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ';
  for (const [i, f] of FILES.entries()) console.log(f.split('/').pop(), 'size', sets[i].size, 'missing accents:', [...accents].filter((ch) => !sets[i].has(ch.codePointAt(0))).join('') || '-');
  for (const lang of ['pt', 'en']) {
    const text = readFileSync(`src/locales/${lang}.json`, 'utf8');
    const chars = new Set([...text].filter((c) => c.codePointAt(0) > 31 && c !== '\n'));
    const missing = [...chars].filter((c) => !sets[0].has(c.codePointAt(0)) && !sets[1].has(c.codePointAt(0)));
    console.log(lang, 'characters outside both subsets:', missing.join('') || '-');
  }
}
