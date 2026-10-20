import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, persistSave, loadSave } from '../engine';
import { buildNewLeagueHero, readLeagueResetAt } from '../leagueReset';
import { intentRequestId } from '../mintIntents';
import { writePassCache } from '../passServer';
import { writeBackup } from '../saveTransfer';
import { fromUploadBlob, toUploadBlob } from '../saveUpload';
import { readLastSeen, writeLastSeen } from '../welcomeBack';
import { saveNotifyPref, loadNotifyPref } from '../notify';
import { getAudioPrefs, reloadAudioPrefs, setMusicVolume } from '../audio';
import { recordError, readErrorLog } from '../../lib/errorLog';
import { setManualReduceMotion, manualReduceMotion } from '../../lib/motionPref';
import { activeLocale, reloadLocale, setLocale } from '../../locales';
import { clearMemoryStore, deviceStorage, hydratePrefs, purgeLegacyBrowserGameData, setStorageMode, snapshotPrefs } from '../../lib/deviceStore';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const veteran = () => ({ ...defaultSave(), xp: 900_000, highestDungeonFloor: 31, gold: 55_555, heroName: 'Old Hero' });

/** What the server stores and returns for a save. */
const viaServer = (s: ReturnType<typeof defaultSave>) => normalizeSave(fromUploadBlob(JSON.parse(JSON.stringify(toUploadBlob(s)))));

describe('the online build keeps nothing in the browser', () => {
  beforeEach(() => {
    localStorage.clear();
    setStorageMode('online');
  });
  afterEach(() => setStorageMode('device'));

  it('never calls localStorage for game data, whatever the game does', async () => {
    const set = vi.spyOn(localStorage, 'setItem');
    const get = vi.spyOn(localStorage, 'getItem');
    const remove = vi.spyOn(localStorage, 'removeItem');

    persistSave(veteran());
    loadSave();
    writeBackup(veteran(), 1);
    writeLastSeen(1000, A);
    readLastSeen(A);
    saveNotifyPref(true);
    loadNotifyPref();
    setMusicVolume(30);
    reloadAudioPrefs();
    setManualReduceMotion(true);
    setLocale('en');
    reloadLocale();
    recordError('error', new Error('boom'));
    readErrorLog();
    writePassCache(A, true, 1000);
    intentRequestId('k', () => 'id-1');
    await readLeagueResetAt({ fetchAt: async () => 5000 });

    expect(set).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    // ...and the game still works from memory
    expect(manualReduceMotion()).toBe(true);
    expect(readLastSeen(A)).toBe(1000);
    set.mockRestore();
    get.mockRestore();
    remove.mockRestore();
    setLocale('pt');
  });

  it('settings, language and the welcome-back stamp round-trip through the server save', () => {
    setLocale('en');
    saveNotifyPref(true);
    setMusicVolume(20);
    setManualReduceMotion(true);
    writeLastSeen(123_000, A);
    const played = { ...veteran(), prefs: snapshotPrefs() };
    const tutorial = { ...played.tutorial, initial: 'completed' as const };
    const stored = viaServer({ ...played, tutorial });

    // a brand-new tab: nothing in memory, the server save is the only source
    clearMemoryStore();
    expect(readLastSeen(A)).toBeNull();
    hydratePrefs(stored.prefs);
    reloadAudioPrefs();
    reloadLocale();
    expect(activeLocale).toBe('en');
    expect(loadNotifyPref()).toBe(true);
    expect(getAudioPrefs().music).toBe(20);
    expect(manualReduceMotion()).toBe(true);
    expect(readLastSeen(A)).toBe(123_000);
    expect(stored.tutorial.initial).toBe('completed');
    setLocale('pt');
  });

  it('a save cannot smuggle unknown or oversized preference keys', () => {
    const s = normalizeSave({ ...defaultSave(), prefs: { locale: 'en', evil: 'x', 'arena-rpg-audio': 'y'.repeat(1000) } });
    expect(s.prefs).toEqual({ locale: 'en' });
  });
});

describe('two accounts in one browser', () => {
  beforeEach(() => {
    localStorage.clear();
    setStorageMode('online');
  });
  afterEach(() => setStorageMode('device'));

  it('B signing up after A starts from a fresh hero with the tutorial; A still has its own', () => {
    const heroA = viaServer(veteran()); // A's row on the server
    // A played and left things behind in the browser the way old versions did
    localStorage.setItem('arena-rpg-save-v1', JSON.stringify(veteran()));
    localStorage.setItem('arena-rpg-pending-cloud-v1', JSON.stringify({ userId: A, baseRevision: 1, save: veteran() }));
    localStorage.setItem(`arena-last-seen.${A}`, '1');
    localStorage.setItem('sb-project-auth-token', '{"session":1}');

    // first online load on this device: old game keys are deleted, never read; the login session is not touched
    expect(purgeLegacyBrowserGameData(localStorage as never)).toBe(3);
    expect(localStorage.getItem('sb-project-auth-token')).not.toBeNull();

    // B has no row: a brand-new hero; the (now gone) device save cannot reach it
    const heroB = buildNewLeagueHero(null);
    expect(heroB.tutorial.initial).toBe('pending');
    expect(heroB.gold).toBe(defaultSave().gold);
    expect(heroB.highestDungeonFloor).toBe(defaultSave().highestDungeonFloor);
    expect(deviceStorage.getItem('arena-rpg-save-v1')).toBeNull();

    // A signs back in: the server hands its own hero back
    expect(heroA.gold).toBe(55_555);
    expect(heroA.heroName).toBe('Old Hero');
  });

  it('signing out clears what the previous account left in memory', () => {
    writeLastSeen(5, A);
    setLocale('en');
    clearMemoryStore();
    expect(readLastSeen(B)).toBeNull();
    expect(snapshotPrefs()).toEqual({});
    setLocale('pt');
  });
});
