import { afterEach, describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import { expiredPassSeason, getServerPassOwned, ownsAdventurerPass, setPassSource, setServerPassStatus } from '../entitlements';
import { applyServerPass, mapPassStatus, readPassCache, resolvePassStatus } from '../passServer';
import ptJson from '../../locales/pt.json';
import enJson from '../../locales/en.json';

const NOW = 1_800_000_000_000;
const USER = '11111111-1111-4111-8111-111111111111';
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

afterEach(() => {
  setServerPassStatus({ owned: false, validThrough: null, currentSeason: null });
  setPassSource('save');
});

describe('mapPassStatus: what the server says about the Pass', () => {
  it('maps an owner of the current season', () => {
    expect(mapPassStatus({ owned: true, valid_through: 1, current_season: 1 })).toEqual({ owned: true, validThrough: 1, currentSeason: 1 });
  });
  it('a Season-1 Pass in Season 2 is not owned, and keeps the seasons for the message', () => {
    expect(mapPassStatus({ owned: false, valid_through: 1, current_season: 2 })).toEqual({ owned: false, validThrough: 1, currentSeason: 2 });
  });
  it('never had a Pass: validThrough is null', () => {
    expect(mapPassStatus({ owned: false, valid_through: null, current_season: 1 })).toEqual({ owned: false, validThrough: null, currentSeason: 1 });
  });
  it('fails closed on anything odd', () => {
    for (const raw of [null, undefined, 'yes', 42, [], {}, { owned: 'true' }, { owned: 1 }]) expect(mapPassStatus(raw).owned).toBe(false);
    expect(mapPassStatus({ owned: true, valid_through: '2', current_season: -1 })).toEqual({ owned: true, validThrough: null, currentSeason: null });
    expect(mapPassStatus({ owned: true, valid_through: 1.5, current_season: 1e9 })).toEqual({ owned: true, validThrough: null, currentSeason: null });
  });
});

describe('the entitlement store: an ended Pass shows as not owned', () => {
  it('server mode: perks off, and the ended / to-buy seasons are known', () => {
    setPassSource('server');
    setServerPassStatus({ owned: false, validThrough: 1, currentSeason: 2 });
    expect(getServerPassOwned()).toBe(false);
    expect(ownsAdventurerPass({ hasBattlePass: true })).toBe(false); // the save's flag is ignored
    expect(expiredPassSeason()).toEqual({ ended: 1, buy: 2 });
  });
  it('an owner, a newcomer and a missing answer are not "expired"', () => {
    setPassSource('server');
    setServerPassStatus({ owned: true, validThrough: 2, currentSeason: 2 });
    expect(expiredPassSeason()).toBeNull();
    setServerPassStatus({ owned: false, validThrough: null, currentSeason: 1 });
    expect(expiredPassSeason()).toBeNull();
    setServerPassStatus({ owned: false, validThrough: null, currentSeason: null });
    expect(expiredPassSeason()).toBeNull();
  });
  it('the offline build has no seasons of Pass at all', () => {
    setServerPassStatus({ owned: false, validThrough: 1, currentSeason: 2 });
    expect(expiredPassSeason()).toBeNull();
  });
  it('switching back to the save source forgets the server facts', () => {
    setPassSource('server');
    setServerPassStatus({ owned: false, validThrough: 1, currentSeason: 2 });
    setPassSource('save');
    setPassSource('server');
    expect(expiredPassSeason()).toBeNull();
  });
});

describe('resolvePassStatus', () => {
  it('takes the server answer and caches the yes/no', async () => {
    const storage = memoryStorage();
    const r = await resolvePassStatus(USER, { fetchStatus: async () => ({ owned: false, validThrough: 1, currentSeason: 2 }), storage, now: () => NOW });
    expect(r).toEqual({ status: { owned: false, validThrough: 1, currentSeason: 2 }, from: 'server' });
    expect(readPassCache(USER, NOW, storage)).toBe(false);
  });
  it('offline: a fresh cache answer is used, with no season facts; no cache means not owned', async () => {
    const storage = memoryStorage();
    await resolvePassStatus(USER, { fetchStatus: async () => ({ owned: true, validThrough: 1, currentSeason: 1 }), storage, now: () => NOW });
    const down = async () => {
      throw new Error('offline');
    };
    expect(await resolvePassStatus(USER, { fetchStatus: down, storage, now: () => NOW + 1000 })).toEqual({ status: { owned: true, validThrough: null, currentSeason: null }, from: 'cache' });
    expect(await resolvePassStatus('other', { fetchStatus: down, storage, now: () => NOW })).toEqual({ status: { owned: false, validThrough: null, currentSeason: null }, from: 'none' });
  });
});

describe('what the Pass already gave stays when it ends', () => {
  it('losing the Pass keeps claimed rewards and owned cosmetics in the save', () => {
    const save: SaveData = { ...defaultSave(), hasBattlePass: true, claimedPassRewards: { free: [1, 2], premium: [1, 2, 3] }, battlePassLevel: 5, cosmetics: ['portrait_frame_recruiter'] };
    const after = applyServerPass(save, false, NOW);
    expect(after.hasBattlePass).toBe(false);
    expect(after.claimedPassRewards.premium).toEqual([1, 2, 3]);
    expect(after.claimedPassRewards.free).toEqual([1, 2]);
    expect(after.battlePassLevel).toBe(5);
    expect(after.cosmetics).toContain('portrait_frame_recruiter');
  });
});

describe('the words', () => {
  it('the expired message names the seasons (pt and en)', () => {
    const pt = ptJson.battlePass as Record<string, string>;
    const en = enJson.battlePass as Record<string, string>;
    expect(pt.expired.replace('{ended}', '1').replace('{n}', '2')).toBe('Seu Passe da Temporada 1 terminou. Compre o Passe da Temporada 2 para continuar.');
    expect(en.expired).toContain('{ended}');
    expect(en.expired).toContain('{n}');
  });
});
