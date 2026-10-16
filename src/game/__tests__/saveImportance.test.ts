import { describe, expect, it } from 'vitest';
import { defaultSave } from '../engine';
import { GEAR, isInstancedSlot } from '../gear';
import { createGearInstance } from '../gearInstances';
import { isImportantChange } from '../saveImportance';
import { PENDING_CLOUD_SAVE_KEY, clearPendingCloudSave, takePendingCloudSave, writePendingCloudSave } from '../pendingCloudSave';
import { keepaliveFor, withKeepalive } from '../../lib/supabaseFetch';

const CERT = '11111111-1111-4111-8111-111111111111';

describe('which changes of the save go to the server at once', () => {
  const base = defaultSave();

  it('ordinary play does not: gold, materials, a hunt that ticks', () => {
    expect(isImportantChange(base, { ...base, gold: base.gold + 500 })).toBe(false);
    expect(isImportantChange(base, { ...base, materials: { ...base.materials } })).toBe(false);
    expect(isImportantChange(base, base)).toBe(false);
  });

  it('a level up does', () => {
    expect(isImportantChange(base, { ...base, xp: 10_000_000 })).toBe(true);
  });

  it('XP that stays inside the same level does not', () => {
    expect(isImportantChange(base, { ...base, xp: base.xp + 1 })).toBe(false);
  });

  it('a boss kill does', () => {
    expect(isImportantChange(base, { ...base, stats: { ...base.stats, bossesKilled: base.stats.bossesKilled + 1 } })).toBe(true);
  });

  it('a change of the Adventurer Pass does (bought, refunded or a new season)', () => {
    expect(isImportantChange(base, { ...base, hasBattlePass: !base.hasBattlePass })).toBe(true);
    expect(isImportantChange(base, { ...base, passSeason: base.passSeason + 1 })).toBe(true);
  });

  it('a League mark does; the same mark in a new object does not', () => {
    const marked = { ...base, league: { reset: 1, pioneer: false } } as unknown as typeof base;
    expect(isImportantChange(base, marked)).toBe(true);
    expect(isImportantChange(marked, { ...marked, league: { ...(marked.league as object) } as typeof marked.league })).toBe(false);
  });

  it('a certified piece arriving or leaving does; an uncertified one does not', () => {
    const template = GEAR.find((g) => isInstancedSlot(g.slot))!;
    const plain = createGearInstance(template.id, { origin: 'drop', rarity: 'common', createdAt: 1 });
    const certified = createGearInstance(template.id, { origin: 'craft', rarity: 'rare', createdAt: 1, certificateId: CERT });
    const withPlain = { ...base, gearInstances: { ...base.gearInstances, [plain.id]: plain } };
    const withCert = { ...base, gearInstances: { ...base.gearInstances, [certified.id]: certified } };
    expect(isImportantChange(base, withPlain)).toBe(false);
    expect(isImportantChange(base, withCert)).toBe(true);
    expect(isImportantChange(withCert, base)).toBe(true);
    expect(isImportantChange(withCert, { ...withCert, gearInstances: { ...withCert.gearInstances } })).toBe(false);
  });

  it('a server roll that is owed (a boss claim, a material claim) does', () => {
    expect(isImportantChange(base, { ...base, materialClaims: [] })).toBe(true);
    expect(isImportantChange(base, { ...base, pendingBossClaims: [] })).toBe(true);
  });
});

describe('the device journal of a signed-in hero', () => {
  function memory() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      raw: data,
    };
  }

  it('carries on from the journal when the server still holds the revision it was made on', () => {
    const storage = memory();
    const played = { ...defaultSave(), gold: 4_321 };
    writePendingCloudSave('user-1', 7, played, storage, 1000);
    const back = takePendingCloudSave('user-1', 7, storage);
    expect(back?.gold).toBe(4_321);
  });

  it('the server wins when it moved on (another tab or device saved), and the stale journal is dropped', () => {
    const storage = memory();
    writePendingCloudSave('user-1', 7, defaultSave(), storage, 1000);
    expect(takePendingCloudSave('user-1', 8, storage)).toBeNull();
    expect(storage.raw.has(PENDING_CLOUD_SAVE_KEY)).toBe(false);
  });

  it('never hands one account\'s journal to another', () => {
    const storage = memory();
    writePendingCloudSave('user-1', 7, defaultSave(), storage, 1000);
    expect(takePendingCloudSave('user-2', 7, storage)).toBeNull();
    expect(storage.raw.has(PENDING_CLOUD_SAVE_KEY)).toBe(false);
  });

  it('survives garbage and a missing storage', () => {
    const storage = memory();
    storage.setItem(PENDING_CLOUD_SAVE_KEY, '{not json');
    expect(takePendingCloudSave('user-1', 1, storage)).toBeNull();
    expect(takePendingCloudSave('user-1', 1, null)).toBeNull();
    expect(() => writePendingCloudSave('user-1', 1, defaultSave(), null)).not.toThrow();
  });

  it('is cleared once the server holds everything, and uses its own key (never the legacy local save)', () => {
    const storage = memory();
    writePendingCloudSave('user-1', 1, defaultSave(), storage);
    expect(PENDING_CLOUD_SAVE_KEY).not.toBe('arena-rpg-save-v1');
    clearPendingCloudSave(storage);
    expect(storage.raw.size).toBe(0);
  });
});

describe('the keepalive upload', () => {
  const body = JSON.stringify({ a: 1 });

  it('adds keepalive only inside withKeepalive, and only for a body under the browser limit', async () => {
    expect(keepaliveFor({ method: 'PATCH', body })).toEqual({ method: 'PATCH', body });
    let inside: RequestInit | undefined;
    let huge: RequestInit | undefined;
    await withKeepalive(async () => {
      inside = keepaliveFor({ method: 'PATCH', body });
      huge = keepaliveFor({ method: 'PATCH', body: 'x'.repeat(70 * 1024) });
    });
    expect(inside?.keepalive).toBe(true);
    expect(huge?.keepalive).toBeUndefined();
    expect(keepaliveFor({ method: 'PATCH', body })?.keepalive).toBeUndefined();
  });

  it('turns off again after a failing request', async () => {
    await expect(
      withKeepalive(async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(keepaliveFor({ method: 'PATCH', body })?.keepalive).toBeUndefined();
  });
});
