// Generates the six celebration sounds (public/assets/sfx/*.wav) by pure synthesis: oscillators, exponential envelopes and a little seeded noise,
// written as 16-bit mono PCM WAV. No samples, no downloads, deterministic (running it twice gives identical files).
//
//   node scripts/gen-sfx.mjs
//
// Each sound is under one second and peaks around -11 dBFS, so it sits quietly under the existing effects (which are normalised much hotter).
// level_up, forge_success, forge_rare (an Epic / Legendary result), refine_fail, drop_rare, drop_unique.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const PEAK = 0.28;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'sfx');

// Seeded noise (mulberry32) so the files never change between runs.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * SR));

function wave(type, phase) {
  const x = phase - Math.floor(phase);
  switch (type) {
    case 'triangle':
      return 4 * Math.abs(x - 0.5) - 1;
    case 'square':
      return x < 0.5 ? 0.6 : -0.6;
    case 'saw':
      return 2 * x - 1;
    default:
      return Math.sin(2 * Math.PI * phase);
  }
}

// One note: `freq` may be a number or a function of time (a sweep). Linear attack, exponential-ish decay.
function note(out, start, freq, dur, { type = 'sine', vol = 1, attack = 0.004, curve = 2.5, tremolo = 0 } = {}) {
  const from = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  let phase = 0;
  for (let i = 0; i < n && from + i < out.length; i++) {
    const t = i / SR;
    const f = typeof freq === 'function' ? freq(t) : freq;
    phase += f / SR;
    const env = Math.min(1, t / attack) * Math.pow(1 - i / n, curve);
    const trem = tremolo ? 1 - 0.35 * (0.5 + 0.5 * Math.sin(2 * Math.PI * tremolo * t)) : 1;
    out[from + i] += wave(type, phase) * env * vol * trem;
  }
}

// A struck piece of metal: inharmonic partials, each decaying faster the higher it is.
function clang(out, start, base, dur, vol = 1) {
  const partials = [1, 2.76, 5.4, 8.93];
  partials.forEach((ratio, k) => note(out, start, base * ratio, dur / (1 + k * 0.7), { vol: vol / (1 + k * 0.9), attack: 0.001, curve: 3 }));
}

function noise(out, start, dur, seed, { vol = 1, curve = 3, lowpass = 0.35 } = {}) {
  const r = rng(seed);
  const from = Math.floor(start * SR);
  const n = Math.floor(dur * SR);
  let y = 0;
  for (let i = 0; i < n && from + i < out.length; i++) {
    y += lowpass * (r() * 2 - 1 - y);
    out[from + i] += y * vol * Math.pow(1 - i / n, curve);
  }
}

function finish(out) {
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? PEAK / peak : 1;
  const fade = Math.floor(0.012 * SR);
  const pcm = Buffer.alloc(44 + out.length * 2);
  pcm.write('RIFF', 0);
  pcm.writeUInt32LE(36 + out.length * 2, 4);
  pcm.write('WAVEfmt ', 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20); // PCM
  pcm.writeUInt16LE(1, 22); // mono
  pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 2, 28);
  pcm.writeUInt16LE(2, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36);
  pcm.writeUInt32LE(out.length * 2, 40);
  for (let i = 0; i < out.length; i++) {
    const tail = Math.min(1, (out.length - i) / fade);
    const v = Math.max(-1, Math.min(1, out[i] * k * tail));
    pcm.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return pcm;
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, B5 = 987.77, C6 = 1046.5, E6 = 1318.5, G6 = 1568, A6 = 1760, C7 = 2093;

const SOUNDS = {
  // A bright four-note climb.
  level_up() {
    const o = buffer(0.8);
    [C5, E5, G5, C6].forEach((f, i) => note(o, i * 0.09, f, 0.32, { type: 'triangle', vol: 0.8 }));
    note(o, 0.27, C6 * 2, 0.45, { vol: 0.25, curve: 3 });
    return o;
  },
  // One anvil strike and a small chime.
  forge_success() {
    const o = buffer(0.6);
    clang(o, 0, 330, 0.5, 0.9);
    noise(o, 0, 0.03, 11, { vol: 0.5, curve: 2, lowpass: 0.6 });
    note(o, 0.11, 880, 0.3, { vol: 0.35, curve: 3 });
    return o;
  },
  // The strike, then a rising arpeggio with a shimmer on top: an Epic or Legendary came out.
  forge_rare() {
    const o = buffer(0.95);
    clang(o, 0, 280, 0.55, 0.85);
    noise(o, 0, 0.03, 12, { vol: 0.5, curve: 2, lowpass: 0.6 });
    [E5, G5, B5, E6].forEach((f, i) => note(o, 0.14 + i * 0.1, f, 0.4, { type: 'triangle', vol: 0.55 }));
    note(o, 0.4, C7, 0.55, { vol: 0.3, curve: 2, tremolo: 14 });
    return o;
  },
  // A dull downward slide and a low thump: the refine broke.
  refine_fail() {
    const o = buffer(0.55);
    note(o, 0, (t) => 320 - 560 * t, 0.4, { type: 'saw', vol: 0.35, curve: 1.6 });
    note(o, 0, (t) => 120 - 100 * t, 0.3, { vol: 0.8, curve: 2 });
    noise(o, 0, 0.12, 13, { vol: 0.35, curve: 2, lowpass: 0.15 });
    return o;
  },
  // Two soft bells.
  drop_rare() {
    const o = buffer(0.6);
    note(o, 0, E6, 0.4, { vol: 0.8, curve: 2.2 });
    note(o, 0.11, A6, 0.45, { vol: 0.7, curve: 2.2 });
    note(o, 0.11, A6 * 2, 0.3, { vol: 0.12, curve: 3 });
    return o;
  },
  // Four bells climbing and a long sparkle: a unique piece.
  drop_unique() {
    const o = buffer(0.95);
    [C6, E6, G6, C7].forEach((f, i) => note(o, i * 0.085, f, 0.55, { vol: 0.65, curve: 2 }));
    note(o, 0.26, 3136, 0.6, { vol: 0.3, curve: 2, tremolo: 16 });
    note(o, 0.26, 4186, 0.45, { vol: 0.12, curve: 3 });
    return o;
  },
};

mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
  const wav = finish(make());
  writeFileSync(join(OUT, `${name}.wav`), wav);
  console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB  ${((wav.length - 44) / 2 / SR).toFixed(2)} s`);
}
