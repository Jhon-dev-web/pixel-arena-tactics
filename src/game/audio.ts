import Assets from '../assets.json';

export type SfxKey = keyof typeof Assets.sfx;

const MUTE_KEY = 'arena-rpg-muted';

let ctx: AudioContext | null = null;
const buffers: Record<string, AudioBuffer> = {};
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let muted = false;
let ambientStarted = false;

// Web Audio is notoriously inconsistent across mobile browsers (iOS Safari especially — internal
// context limits, strict user-gesture requirements, resume() rejecting) in ways desktop Chrome
// tolerates silently. Every entry point below is wrapped so a failure here never takes down the
// caller's action (e.g. harvesting a Garden slot) — see ErrorBoundary.tsx for the same reasoning
// applied at the whole-app level.
function ensureCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        /* ignore — playback just won't happen this time */
      });
    }
    return ctx;
  } catch (e) {
    console.warn('AudioContext unavailable (game continues without sound).', e);
    return null;
  }
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
  try {
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
  } catch (e) {
    console.warn('Ambient audio failed to start (game continues without sound).', e);
  }
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

// Never throws — every caller (Garden harvest/cancel, combat hits, Forge clicks, etc.) relies on
// this to fire-and-forget; a sound failing to play must never block the action that triggered it.
export function playSfx(key: SfxKey, pitchVariance = 0): void {
  if (muted) return;
  try {
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
  } catch (e) {
    console.warn(`playSfx("${key}") failed (ignored so the triggering action still completes).`, e);
  }
}
