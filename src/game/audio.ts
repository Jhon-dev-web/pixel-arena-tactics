import { deviceStorage } from '../lib/deviceStore';
import Assets from '../assets.json';

export type SfxKey = keyof typeof Assets.sfx;

// Two channels, each with its own volume (0 to 100) and its own mute: the ambient music and the effects. They are device preferences (localStorage), not part of
// the save. The mute button in the top bar still toggles both at once; the Settings screen has one slider and one mute button per channel.
const LEGACY_MUTE_KEY = 'arena-rpg-muted';
const PREFS_KEY = 'arena-rpg-audio';

export interface AudioPrefs {
  music: number;
  sfx: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = { music: 100, sfx: 100, musicMuted: false, sfxMuted: false };

export function clampVolume(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100;
}

// A stored value (absent, partial, corrupt) -> trusted prefs. The old single mute flag ('1') becomes both channels muted, once.
export function parseAudioPrefs(raw: string | null, legacyMuted: string | null = null): AudioPrefs {
  const out: AudioPrefs = { ...DEFAULT_AUDIO_PREFS };
  if (raw) {
    try {
      const p = JSON.parse(raw) as Partial<Record<keyof AudioPrefs, unknown>>;
      if (p && typeof p === 'object') {
        if ('music' in p) out.music = clampVolume(p.music);
        if ('sfx' in p) out.sfx = clampVolume(p.sfx);
        out.musicMuted = p.musicMuted === true;
        out.sfxMuted = p.sfxMuted === true;
        return out;
      }
    } catch {
      /* corrupt: fall through to the defaults / legacy flag */
    }
  }
  if (legacyMuted === '1') {
    out.musicMuted = true;
    out.sfxMuted = true;
  }
  return out;
}

// Volume curve: the slider is perceptual, so the gain follows its square (50 % on the slider is a quarter of the amplitude).
export const MUSIC_BASE_GAIN = 0.32;
export const SFX_BASE_GAIN = 0.9;
const curve = (v: number): number => (clampVolume(v) / 100) ** 2;
export const musicGain = (p: AudioPrefs): number => (p.musicMuted ? 0 : MUSIC_BASE_GAIN * curve(p.music));
export const sfxGain = (p: AudioPrefs): number => (p.sfxMuted ? 0 : SFX_BASE_GAIN * curve(p.sfx));

function readStored(): AudioPrefs {
  try {
    return parseAudioPrefs(deviceStorage.getItem(PREFS_KEY), deviceStorage.getItem(LEGACY_MUTE_KEY));
  } catch {
    return { ...DEFAULT_AUDIO_PREFS };
  }
}

let ctx: AudioContext | null = null;
const buffers: Record<string, AudioBuffer> = {};
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let prefs: AudioPrefs = readStored();
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

function persist(): void {
  try {
    deviceStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    deviceStorage.setItem(LEGACY_MUTE_KEY, prefs.musicMuted && prefs.sfxMuted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** The online game hydrates the preferences from the server save after this module loaded: read them again (applies to the music already playing). */
export function reloadAudioPrefs(): void {
  prefs = readStored();
  if (ambientGain) ambientGain.gain.value = musicGain(prefs);
}

export function getAudioPrefs(): AudioPrefs {
  return { ...prefs };
}

// Both channels muted (what the top bar's mute button shows).
export function loadMuted(): boolean {
  const p = readStored();
  return p.musicMuted && p.sfxMuted;
}

export function isMuted(): boolean {
  return prefs.musicMuted && prefs.sfxMuted;
}

export async function initAudio(): Promise<void> {
  prefs = readStored();
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
  if (prefs.musicMuted || ambientStarted) return;
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
    ambientGain.gain.value = musicGain(prefs);
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

// Applies the music prefs to what is playing: a muted channel stops the loop, an audible one starts it (when the browser allows) and follows the slider live.
function applyMusic(): void {
  if (prefs.musicMuted) {
    stopAmbient();
    return;
  }
  startAmbient();
  if (ambientGain) ambientGain.gain.value = musicGain(prefs);
}

export function setMusicVolume(volume: number): void {
  prefs = { ...prefs, music: clampVolume(volume) };
  persist();
  applyMusic();
}

export function setSfxVolume(volume: number): void {
  prefs = { ...prefs, sfx: clampVolume(volume) };
  persist();
}

export function setMusicMuted(next: boolean): void {
  prefs = { ...prefs, musicMuted: next };
  persist();
  applyMusic();
}

export function setSfxMuted(next: boolean): void {
  prefs = { ...prefs, sfxMuted: next };
  persist();
}

// The top bar's single mute button: both channels together.
export function setMuted(next: boolean): void {
  prefs = { ...prefs, musicMuted: next, sfxMuted: next };
  persist();
  applyMusic();
}

// Never throws — every caller (Garden harvest/cancel, combat hits, Forge clicks, etc.) relies on
// this to fire-and-forget; a sound failing to play must never block the action that triggered it.
export function playSfx(key: SfxKey, pitchVariance = 0): void {
  const gain = sfxGain(prefs);
  if (gain <= 0) return;
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
    g.gain.value = gain;
    src.connect(g);
    g.connect(c.destination);
    src.start(0);
  } catch (e) {
    console.warn(`playSfx("${key}") failed (ignored so the triggering action still completes).`, e);
  }
}
