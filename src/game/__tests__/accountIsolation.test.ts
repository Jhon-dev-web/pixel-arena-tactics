import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSave } from '../engine';
import { buildNewLeagueHero } from '../leagueReset';
import { PENDING_CLOUD_SAVE_KEY, pendingCloudSaveKey, takePendingCloudSave, writePendingCloudSave } from '../pendingCloudSave';
import { LEGACY_CLAIM_KEY, LEGACY_LOCAL_SAVE_KEY, claimLegacyLocalSave, legacyOfferFor } from '../saveRepository';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), raw: m };
};

const veteran = () => ({ ...defaultSave(), xp: 900_000, highestDungeonFloor: 31, gold: 55_555, heroName: 'Old Hero' });

describe('two accounts in one browser', () => {
  it('account B never receives account A\'s journal, and A still gets its own back', () => {
    const storage = memory();
    writePendingCloudSave(A, 4, veteran(), storage, 1, 'char-a');
    // B signs up: a brand-new row at revision 1, a different character id, even the same revision number
    writePendingCloudSave(A, 1, veteran(), storage, 2, 'char-a');
    expect(takePendingCloudSave(B, 1, storage, 'char-b')).toBeNull();
    expect(takePendingCloudSave(A, 1, storage, 'char-a')?.gold).toBe(55_555);
  });

  it('a journal for another character row of the same account is not adopted', () => {
    const storage = memory();
    writePendingCloudSave(A, 1, veteran(), storage, 1, 'char-old');
    expect(takePendingCloudSave(A, 1, storage, 'char-new')).toBeNull();
    expect(storage.raw.has(pendingCloudSaveKey(A))).toBe(false);
  });

  it('migrates an old shared-key journal to the account that wrote it, never to another', () => {
    const storage = memory();
    storage.setItem(PENDING_CLOUD_SAVE_KEY, JSON.stringify({ userId: A, baseRevision: 3, at: 1, save: veteran() }));
    expect(takePendingCloudSave(B, 3, storage)).toBeNull();
    expect(storage.raw.has(PENDING_CLOUD_SAVE_KEY)).toBe(false);
    expect(takePendingCloudSave(A, 3, storage)?.gold).toBe(55_555);
  });

  it('a new account starts from the default hero (tutorial on, empty bag, no hunt)', () => {
    const fresh = buildNewLeagueHero(null);
    expect(fresh.tutorial.initial).toBe('pending');
    expect(fresh.activeHuntingZone ?? null).toBeNull();
    expect(fresh.gold).toBe(defaultSave().gold);
  });
});

describe('the device\'s offline save', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is offered, with its stats, to an account when nobody took it', () => {
    localStorage.setItem(LEGACY_LOCAL_SAVE_KEY, JSON.stringify(veteran()));
    const offer = legacyOfferFor(B);
    expect(offer).not.toBeNull();
    expect(offer!.floor).toBe(31);
    expect(offer!.level).toBeGreaterThan(1);
  });

  it('is never offered to another account once one took it (or already played online here)', () => {
    localStorage.setItem(LEGACY_LOCAL_SAVE_KEY, JSON.stringify(veteran()));
    claimLegacyLocalSave(A);
    expect(localStorage.getItem(LEGACY_CLAIM_KEY)).toBe(A);
    claimLegacyLocalSave(B); // the first claim stands
    expect(localStorage.getItem(LEGACY_CLAIM_KEY)).toBe(A);
    expect(legacyOfferFor(B)).toBeNull();
  });

  it('is not offered when there is none', () => {
    expect(legacyOfferFor(B)).toBeNull();
  });
});
