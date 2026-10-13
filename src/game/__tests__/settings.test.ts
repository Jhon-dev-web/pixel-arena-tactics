import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, playerLevel, SaveData, xpToReachLevel } from '../engine';
import { MAX_IMPORT_BYTES, buildSaveExport, parseSaveImport, readBackup, resetSave, resetWordMatches, writeBackup } from '../saveTransfer';
import { DEFAULT_AUDIO_PREFS, clampVolume, musicGain, parseAudioPrefs, sfxGain } from '../audio';

const NOW = new Date('2026-10-12T10:20:30Z').getTime();
const played = (): SaveData => ({ ...defaultSave(), gold: 4321, xp: xpToReachLevel(33), highestDungeonFloor: 41, heroName: 'Teste' });

beforeEach(() => localStorage.clear());

describe('audio preferences', () => {
  it('clamp volumes to 0..100 and fall back to full volume on garbage', () => {
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(250)).toBe(100);
    expect(clampVolume(42.4)).toBe(42);
    expect(clampVolume('abc')).toBe(100);
  });

  it('a new device has both channels at full volume and unmuted (what the game always did)', () => {
    expect(parseAudioPrefs(null)).toEqual(DEFAULT_AUDIO_PREFS);
    expect(sfxGain(DEFAULT_AUDIO_PREFS)).toBeCloseTo(0.9);
    expect(musicGain(DEFAULT_AUDIO_PREFS)).toBeCloseTo(0.32);
  });

  it('the old single mute flag becomes both channels muted; stored prefs win over it', () => {
    expect(parseAudioPrefs(null, '1')).toMatchObject({ musicMuted: true, sfxMuted: true });
    expect(parseAudioPrefs(null, '0')).toMatchObject({ musicMuted: false, sfxMuted: false });
    const stored = JSON.stringify({ music: 30, sfx: 80, musicMuted: false, sfxMuted: true });
    expect(parseAudioPrefs(stored, '1')).toEqual({ music: 30, sfx: 80, musicMuted: false, sfxMuted: true });
  });

  it('each channel has its own volume and mute; the gain follows the slider and is zero when muted', () => {
    const p = { music: 50, sfx: 100, musicMuted: false, sfxMuted: false };
    expect(musicGain(p)).toBeLessThan(musicGain({ ...p, music: 100 }));
    expect(musicGain({ ...p, music: 0 })).toBe(0);
    expect(musicGain({ ...p, musicMuted: true })).toBe(0);
    expect(sfxGain({ ...p, musicMuted: true })).toBeGreaterThan(0);
    expect(sfxGain({ ...p, sfxMuted: true })).toBe(0);
    expect(parseAudioPrefs('{not json')).toEqual(DEFAULT_AUDIO_PREFS);
  });
});

describe('save export', () => {
  it('holds the hero and nothing that looks like credentials or account data', () => {
    const { text, filename } = buildSaveExport({ ...played(), email: 'a@b.c', accessToken: 'x', password: 'y' } as unknown as SaveData, NOW);
    expect(filename).toMatch(/^arena-duel-save-\d{8}\d{6}\.json$/);
    const file = JSON.parse(text);
    expect(file.format).toBe('arena-duel-save');
    expect(file.save.gold).toBe(4321);
    expect(text).not.toMatch(/a@b\.c|accessToken|password|"email"/i);
  });

  it('a normal save loses nothing in the export (it round-trips unchanged)', () => {
    const s = normalizeSave(JSON.parse(JSON.stringify(played())));
    const { text } = buildSaveExport(s, NOW);
    const back = parseSaveImport(text, s);
    expect('reason' in back).toBe(false);
    if ('reason' in back) return;
    expect(back.save).toEqual(s);
  });
});

describe('save import', () => {
  const current = { hasBattlePass: false };

  it('shows the level and floor of what it would load', () => {
    const { text } = buildSaveExport(played(), NOW);
    const res = parseSaveImport(text, current);
    expect('reason' in res).toBe(false);
    if ('reason' in res) return;
    expect(res.level).toBe(33);
    expect(res.floor).toBe(41);
    expect(playerLevel(res.save.xp)).toBe(33);
  });

  it('also accepts a bare save (what a raw localStorage dump holds)', () => {
    const res = parseSaveImport(JSON.stringify(played()), current);
    expect('reason' in res).toBe(false);
  });

  it('goes through the normal load path: clamps and migrations apply', () => {
    const raw = JSON.parse(JSON.stringify(played())) as Record<string, unknown>;
    raw.gold = 5;
    raw.str = 9999999;
    raw.cosmetics = ['title_nope'];
    delete raw.stats;
    delete raw.codex;
    const res = parseSaveImport(JSON.stringify(raw), current);
    expect('reason' in res).toBe(false);
    if ('reason' in res) return;
    expect(res.save.stats.kills).toBe(0);
    expect(res.save.codex).toBeDefined();
    expect(res.save.gold).toBe(5);
  });

  it('refuses what is not a save, without touching anything', () => {
    const fail = (text: string) => ('reason' in parseSaveImport(text, current) ? (parseSaveImport(text, current) as { reason: string }).reason : 'ok');
    expect(fail('')).toBe('empty');
    expect(fail('   ')).toBe('empty');
    expect(fail('{nope')).toBe('not_json');
    expect(fail('[1,2,3]')).toBe('not_a_save');
    expect(fail('"hello"')).toBe('not_a_save');
    expect(fail(JSON.stringify({ gold: 'lots', xp: 1 }))).toBe('not_a_save');
    expect(fail(JSON.stringify({ foo: 1 }))).toBe('not_a_save');
    expect(fail('x'.repeat(MAX_IMPORT_BYTES + 1))).toBe('too_big');
  });

  it('the Adventurer Pass belongs to the account: an imported hero never brings or loses it', () => {
    const withPass = { ...played(), hasBattlePass: true };
    const res = parseSaveImport(JSON.stringify(withPass), { hasBattlePass: false });
    expect('reason' in res ? null : res.save.hasBattlePass).toBe(false);
    const res2 = parseSaveImport(JSON.stringify(played()), { hasBattlePass: true });
    expect('reason' in res2 ? null : res2.save.hasBattlePass).toBe(true);
  });
});

describe('backup and reset', () => {
  it('a backup keeps the current hero, and the one before it in a second slot', () => {
    const a = { ...played(), gold: 1 };
    const b = { ...played(), gold: 2 };
    expect(writeBackup(a, NOW)).toBe(true);
    expect(writeBackup(b, NOW + 1000)).toBe(true);
    expect(readBackup('latest')?.save.gold).toBe(2);
    expect(readBackup('previous')?.save.gold).toBe(1);
    expect(readBackup('latest')?.at).toBe(NOW + 1000);
  });

  it('reset is a brand new hero that keeps only the Pass entitlement', () => {
    // defaultSave() stamps Date.now() into a few fields: freeze the clock so two calls in different milliseconds cannot differ
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const fresh = resetSave({ hasBattlePass: true });
    expect(fresh.hasBattlePass).toBe(true);
    expect({ ...fresh, hasBattlePass: false, passSeason: 0 }).toEqual({ ...defaultSave(), hasBattlePass: false, passSeason: 0 });
    expect(resetSave({ hasBattlePass: false }).hasBattlePass).toBe(false);
    expect(fresh.xp).toBe(0);
    vi.useRealTimers();
  });

  it('the typed confirmation ignores case and surrounding spaces, and nothing else', () => {
    expect(resetWordMatches('reiniciar', 'REINICIAR')).toBe(true);
    expect(resetWordMatches('  Reiniciar ', 'REINICIAR')).toBe(true);
    expect(resetWordMatches('reinicia', 'REINICIAR')).toBe(false);
    expect(resetWordMatches('', 'REINICIAR')).toBe(false);
  });
});
