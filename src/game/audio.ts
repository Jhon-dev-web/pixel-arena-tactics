import Assets from '../assets.json';

export type SfxKey = keyof typeof Assets.sfx;

const MUTE_KEY = 'arena-rpg-muted';

let ctx: AudioContext | null = null;
const buffers: Record<string, AudioBuffer> = {};
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let muted = false;
let ambientStarted = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

async function loadBuffer(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  return ctx!.decodeAudioData(arr);
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export async function initAudio(): Promise<void> {
  muted = loadMuted();
  try {
    ensureCtx();
    const sfxEntries = Object.entries(Assets.sfx) as [string, { url: string }][];
    await Promise.all(sfxEntries.map(async ([k, v]) => (buffers[k] = await loadBuffer(v.url))));
    buffers['ambient'] = await loadBuffer(Assets.music.ambient.url);
  } catch (e) {
    console.warn('Audio init failed (game continues without sound).', e);
  }
}

function startAmbient(): void {
  if (muted || ambientStarted) return;
  const c = ensureCtx();
  if (!c) return;
  const buf = buffers['ambient'];
  if (!buf) return;
  ambientStarted = true;
  ambientSource = c.createBufferSource();
  ambientSource.buffer = buf;
  ambientSource.loop = true;
  ambientGain = c.createGain();
  ambientGain.gain.value = 0.32;
  ambientSource.connect(ambientGain);
  ambientGain.connect(c.destination);
  ambientSource.start(0);
}

function stopAmbient(): void {
  if (ambientSource) {
    try {
      ambientSource.stop();
    } catch {
      /* already stopped */
    }
    ambientSource.disconnect();
    ambientSource = null;
  }
  if (ambientGain) {
    ambientGain.disconnect();
    ambientGain = null;
  }
  ambientStarted = false;
}

export function unlockAudio(): void {
  ensureCtx();
  startAmbient();
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (muted) stopAmbient();
  else startAmbient();
}

export function playSfx(key: SfxKey, pitchVariance = 0): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  startAmbient();
  const buf = buffers[key];
  if (!buf) return;

  const src = c.createBufferSource();
  src.buffer = buf;
  if (pitchVariance > 0) {
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchVariance;
  }
  const g = c.createGain();
  g.gain.value = 0.9;
  src.connect(g);
  g.connect(c.destination);
  src.start(0);
}
