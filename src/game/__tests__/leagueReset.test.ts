import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { sanitizeLeagueMark } from '../leagueMark';
import {
  PIONEER_TITLE_ID,
  PRE_LEAGUE_BACKUP_PREFIX,
  applyPioneerAnswer,
  buildLeagueHero,
  buildNewLeagueHero,
  fetchIsPioneer,
  getServerResetAt,
  needsLeagueReset,
  needsPioneerCheck,
  parseResetAt,
  readLeagueResetAt,
  resetKnownLeagueResetAt,
  settleLeague,
  shouldHoldSubmission,
  writePreLeagueMemory,
} from '../leagueReset';
import { applyServerPass } from '../passServer';
import { SaveConflictError } from '../saveRepository';
import { parseSaveImport, buildSaveExport, resetSave } from '../saveTransfer';
import { getTitleDef } from '../titles';

const R = Date.parse('2026-12-01T12:00:00.000Z');
const NOW = R + 60_000;
const USER = '11111111-1111-4111-8111-111111111111';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m };
};

/** A veteran hero from the pre-season: deep in the Dungeon, with the Pass and a golden skin. */
const veteran = (): SaveData => ({ ...defaultSave(), xp: 6_000_000, gold: 123_456, shards: 40, highestDungeonFloor: 90, heroName: 'Aldric', hasBattlePass: true, cosmetics: ['skin_golden_knight'] });

/** The server's `characters` row with optimistic concurrency, as SupabaseSaveRepository behaves. */
class FakeRepo {
  revision = 5;
  saves = 0;
  failNextWith: Error | null = null;
  constructor(public stored: SaveData) {}
  async load() {
    return { save: structuredClone(this.stored), revision: this.revision };
  }
  async save(data: SaveData, expectedRevision: number) {
    if (this.failNextWith) {
      const e = this.failNextWith;
      this.failNextWith = null;
      throw e;
    }
    if (expectedRevision !== this.revision) throw new SaveConflictError();
    this.stored = structuredClone(data);
    this.revision += 1;
    this.saves += 1;
    return { revision: this.revision };
  }
}

const deps = (storage = memoryStorage(), pioneer: () => Promise<boolean> = async () => true) => ({
  accountId: USER,
  resetAt: R,
  applyPass: (s: SaveData) => applyServerPass(s, true, NOW),
  fetchPioneer: pioneer,
  now: () => NOW,
  storage,
});

beforeEach(() => resetKnownLeagueResetAt());

describe('the decision', () => {
  it('only a hero from before the reset is replaced, and only when the server has given a moment', () => {
    expect(needsLeagueReset(veteran(), R)).toBe(true);
    expect(needsLeagueReset(veteran(), null)).toBe(false); // the League has not opened
    expect(needsLeagueReset(veteran(), undefined)).toBe(false); // the server was not reachable: nothing is touched without its word
    expect(needsLeagueReset({ league: { epoch: R - 1, noticeSeen: true, pioneerChecked: true } }, R)).toBe(true);
    expect(needsLeagueReset({ league: { epoch: R, noticeSeen: false, pioneerChecked: true } }, R)).toBe(false);
    expect(needsLeagueReset({ league: { epoch: R + 5, noticeSeen: false, pioneerChecked: true } }, R)).toBe(false);
    expect(shouldHoldSubmission(veteran(), R)).toBe(true);
    expect(shouldHoldSubmission(veteran(), null)).toBe(false);
  });

  it('parses the server timestamp (microseconds included) and rejects anything else', () => {
    expect(parseResetAt('2026-12-01T12:00:00.123456+00:00')).toBe(Date.parse('2026-12-01T12:00:00.123Z'));
    expect(parseResetAt(null)).toBeNull();
    expect(parseResetAt('not a date')).toBeNull();
    expect(parseResetAt(12345)).toBeNull();
  });
});

describe('the reset happens exactly once per save', () => {
  it('wipes the hero, keeps name and Pass, stamps the server epoch, uploads once, and a second settle changes nothing', async () => {
    const repo = new FakeRepo(veteran());
    const first = await settleLeague(repo, await repo.load(), deps());
    expect(first).toMatchObject({ reset: true, changed: true, persisted: true, revision: 6 });
    expect(first.save.xp).toBe(0);
    expect(first.save.gold).toBe(0);
    expect(first.save.highestDungeonFloor).toBe(1);
    expect(first.save.cosmetics).toContain(PIONEER_TITLE_ID);
    expect(first.save.cosmetics).not.toContain('skin_golden_knight');
    expect(first.save.heroName).toBe('Aldric');
    expect(first.save.hasBattlePass).toBe(true); // the Pass is the server's, applied to the fresh hero
    expect(first.save.league).toEqual({ epoch: R, noticeSeen: false, pioneerChecked: true });
    expect(repo.stored.xp).toBe(0);

    const again = await settleLeague(repo, await repo.load(), deps());
    expect(again).toMatchObject({ reset: false, changed: false });
    expect(repo.saves).toBe(1);
  });

  it('a reload (a fresh load of the stored save through normalizeSave) is not reset again', async () => {
    const repo = new FakeRepo(veteran());
    await settleLeague(repo, await repo.load(), deps());
    const reloaded = normalizeSave(JSON.parse(JSON.stringify(repo.stored)));
    expect(needsLeagueReset(reloaded, R)).toBe(false);
    expect(reloaded.league?.epoch).toBe(R);
  });

  it("two tabs: the second one adopts the first one's fresh hero, never resets it again", async () => {
    const repo = new FakeRepo(veteran());
    const tabA = await repo.load();
    const tabB = await repo.load(); // both loaded the old hero at revision 5
    const a = await settleLeague(repo, tabA, deps());
    expect(a.reset).toBe(true);
    // the player already made progress in the fresh hero through tab A
    repo.stored = { ...repo.stored, gold: 77 };
    const b = await settleLeague(repo, tabB, deps()); // stale revision: conflict, then it settles what the server holds
    expect(b.reset).toBe(false);
    expect(b.save.gold).toBe(77);
    expect(repo.stored.gold).toBe(77);
    expect(repo.saves).toBe(1);
  });

  it('an old hero autosaved during the swap is settled again (bounded retries), the fresh one wins in the end', async () => {
    const repo = new FakeRepo(veteran());
    const loaded = await repo.load();
    repo.revision += 1; // the old tab's autosave landed first: same old hero, new revision
    const out = await settleLeague(repo, loaded, deps());
    expect(out.save.xp).toBe(0);
    expect(repo.stored.xp).toBe(0);
    expect(out.reset).toBe(true);
  });

  it('a failed upload keeps playing the fresh hero at the old revision; trying again gives the same hero and the one-time memory is written once', async () => {
    const storage = memoryStorage();
    const repo = new FakeRepo(veteran());
    repo.failNextWith = new Error('network');
    const first = await settleLeague(repo, await repo.load(), deps(storage));
    expect(first).toMatchObject({ reset: true, persisted: false, revision: 5 });
    expect(repo.stored.xp).toBe(6_000_000); // not uploaded yet
    const second = await settleLeague(repo, await repo.load(), deps(storage));
    expect(second).toMatchObject({ reset: true, persisted: true });
    expect(repo.stored.xp).toBe(0);
    expect([...storage.raw.keys()].filter((k) => k.startsWith(PRE_LEAGUE_BACKUP_PREFIX))).toHaveLength(1);
  });

  it('the server pass answer is applied to the fresh hero, so a hero that lost the Pass does not get it back', async () => {
    const repo = new FakeRepo(veteran());
    const out = await settleLeague(repo, await repo.load(), { ...deps(), applyPass: (s) => applyServerPass(s, false, NOW) });
    expect(out.save.hasBattlePass).toBe(false);
  });

  it('building the hero directly: everything but the name is the default hero', () => {
    // Both heroes stamp Date.now(); freeze the clock so they cannot land on different milliseconds.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const hero = buildLeagueHero({ heroName: 'Aldric' }, R, false);
    expect({ ...hero, heroName: 'Hero', league: undefined }).toEqual({ ...defaultSave(), league: undefined });
    expect(hero.cosmetics).toEqual([]);
    expect(buildLeagueHero({ heroName: '' }, R, null).heroName).toBe('Hero');
    vi.useRealTimers();
  });
});

describe('the one-time memory of the old hero', () => {
  it('is labelled, written once per account and reset, and never overwritten', () => {
    const storage = memoryStorage();
    expect(writePreLeagueMemory(veteran(), USER, R, NOW, storage)).toBe(true);
    const key = `${PRE_LEAGUE_BACKUP_PREFIX}${USER}.${R}`;
    const first = storage.raw.get(key) as string;
    expect(JSON.parse(first).label).toMatch(/can never be imported/);
    expect(JSON.parse(first).save.xp).toBe(6_000_000);
    expect(writePreLeagueMemory({ ...veteran(), xp: 1 }, USER, R, NOW + 1, storage)).toBe(true);
    expect(storage.raw.get(key)).toBe(first);
  });

  it('a device that refuses the write does not break anything', () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(writePreLeagueMemory(veteran(), USER, R, NOW, refusing)).toBe(false);
    expect(writePreLeagueMemory(veteran(), USER, R, NOW, null)).toBe(false);
  });

  it('nothing in the game reads the memory back: the key prefix appears in leagueReset.ts only', () => {
    const root = resolve(__dirname, '../..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name !== '__tests__') walk(p);
        } else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, 'utf8').includes('arena-pre-league-memory')) hits.push(p.replace(root, '').replace(/\\/g, '/'));
      }
    };
    walk(root);
    expect(hits).toEqual(['/game/leagueReset.ts']);
  });
});

describe('the Pioneiro title', () => {
  it('goes to a tester at the reset, is cosmetic, and exists in the catalog and both languages', async () => {
    const repo = new FakeRepo(veteran());
    const out = await settleLeague(repo, await repo.load(), deps(memoryStorage(), async () => true));
    expect(out.save.cosmetics).toContain(PIONEER_TITLE_ID);
    expect(getTitleDef(PIONEER_TITLE_ID)).toBeDefined();
    for (const tree of [pt, en]) {
      expect((tree.titles as Record<string, string>).title_pioneer).toBeTruthy();
      expect((tree.titles as Record<string, string>).req_pioneer).toBeTruthy();
    }
  });

  it('a player who did not test gets no title', async () => {
    const repo = new FakeRepo(veteran());
    const out = await settleLeague(repo, await repo.load(), deps(memoryStorage(), async () => false));
    expect(out.save.cosmetics).not.toContain(PIONEER_TITLE_ID);
    expect(out.save.league?.pioneerChecked).toBe(true);
  });

  it('if the server cannot answer at the reset, the hero is reset anyway and the question is asked again at the next check, once', async () => {
    const repo = new FakeRepo(veteran());
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return true;
    };
    const reset = await settleLeague(repo, await repo.load(), deps(memoryStorage(), flaky));
    expect(reset.save.league?.pioneerChecked).toBe(false);
    expect(needsPioneerCheck(reset.save, R)).toBe(true);
    const later = await settleLeague(repo, await repo.load(), deps(memoryStorage(), flaky));
    expect(later.reset).toBe(false);
    expect(later.save.cosmetics).toContain(PIONEER_TITLE_ID);
    expect(later.save.league?.pioneerChecked).toBe(true);
    const done = await settleLeague(repo, await repo.load(), deps(memoryStorage(), flaky));
    expect(done.changed).toBe(false);
    expect(calls).toBe(2);
  });

  it('applyPioneerAnswer leaves a hero without a League marker alone', () => {
    const s = defaultSave();
    expect(applyPioneerAnswer(s, true)).toBe(s);
  });

  it('the server rule is read-only and derived from snapshots (migration 0009)', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/0009_first_league_reset.sql'), 'utf8');
    expect(sql).toContain('create or replace function public.my_pioneer()');
    expect(sql).toContain("s.verdict = 'ok' and s.created_at < g.reset_at");
  });
});

describe('import is refused online for a pre-reset hero', () => {
  const file = (s: SaveData) => buildSaveExport(s, NOW).text;

  it('refuses a save without a marker, and a marker from before the reset, when the server has a reset moment', () => {
    expect(parseSaveImport(file(veteran()), { hasBattlePass: true }, R)).toEqual({ ok: false, reason: 'pre_reset' });
    const old = { ...veteran(), league: { epoch: R - 1000, noticeSeen: true, pioneerChecked: true } };
    expect(parseSaveImport(file(old), { hasBattlePass: true }, R)).toEqual({ ok: false, reason: 'pre_reset' });
  });

  it('accepts a hero that belongs to the reset, and every save when offline / before the League', () => {
    const post = { ...defaultSave(), league: { epoch: R, noticeSeen: true, pioneerChecked: true } };
    expect(parseSaveImport(file(post), { hasBattlePass: false }, R)).toMatchObject({ ok: true });
    expect(parseSaveImport(file(veteran()), { hasBattlePass: true }, null)).toMatchObject({ ok: true }); // League not open yet
    expect(parseSaveImport(file(veteran()), { hasBattlePass: true }, undefined)).toMatchObject({ ok: true }); // server unknown
    expect(parseSaveImport(file(veteran()), { hasBattlePass: true })).toMatchObject({ ok: true }); // offline / desktop: no argument at all
  });

  it('a hand reset after the League keeps the marker, so it is not reset a second time', () => {
    const post = { ...veteran(), league: { epoch: R, noticeSeen: true, pioneerChecked: true } };
    const again = resetSave(post);
    expect(again.xp).toBe(0);
    expect(needsLeagueReset(again, R)).toBe(false);
  });

  it('the settings screen asks the server value only in an account build, and the message exists in both languages', () => {
    const src = readFileSync(resolve(__dirname, '../../components/SettingsModal.tsx'), 'utf8');
    expect(src).toContain('parseSaveImport(text, save, accountConfigured ? getServerResetAt() : null)');
    for (const tree of [pt, en]) expect((tree.settings as Record<string, string>).importError_pre_reset).toBeTruthy();
  });
});

describe('offline and desktop builds are untouched', () => {
  it('without a backend nothing is asked and nothing is known', async () => {
    const out = await readLeagueResetAt({ storage: memoryStorage() }); // supabase is null in the tests: fetchLeagueResetAt throws not_configured
    expect(out).toBeUndefined();
    expect(getServerResetAt()).toBeUndefined();
    expect(needsLeagueReset(veteran(), out)).toBe(false);
    expect(shouldHoldSubmission(veteran(), out)).toBe(false);
  });

  it('a save without any marker normalizes exactly as before (no league value)', () => {
    const s = normalizeSave(JSON.parse(JSON.stringify(defaultSave())));
    expect(s.league).toBeUndefined();
    expect(buildNewLeagueHero(null).league).toBeUndefined();
    expect(buildNewLeagueHero(undefined).league).toBeUndefined();
  });

  it('GameShell only settles the League inside the account flow, after reading the server', () => {
    const src = readFileSync(resolve(__dirname, '../../shell/GameShell.tsx'), 'utf8');
    const accountFlow = src.slice(src.indexOf('const repo = new SupabaseSaveRepository(user.id);'));
    expect(accountFlow).toContain('readLeagueResetAt()');
    expect(src.indexOf('settleLeague(')).toBeGreaterThan(src.indexOf('if (!configured)'));
    const appSrc = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(appSrc).toContain('if (!userId || !configured) return;');
  });
});

describe('the reset moment: a known answer survives a brief outage, an unknown one resets nothing', () => {
  it('learns the moment, caches it, and falls back to the cache when the server cannot be reached', async () => {
    const storage = memoryStorage();
    expect(await readLeagueResetAt({ storage, fetchAt: async () => R })).toBe(R);
    expect(getServerResetAt()).toBe(R);
    resetKnownLeagueResetAt();
    const offline = await readLeagueResetAt({
      storage,
      fetchAt: async () => {
        throw new Error('down');
      },
    });
    expect(offline).toBe(R); // cached: neither skipped nor repeated
    resetKnownLeagueResetAt();
    const unknown = await readLeagueResetAt({
      storage: memoryStorage(),
      fetchAt: async () => {
        throw new Error('down');
      },
    });
    expect(unknown).toBeUndefined();
  });

  it('"the League has not opened" is a real answer (null) and is not cached', async () => {
    const storage = memoryStorage();
    expect(await readLeagueResetAt({ storage, fetchAt: async () => null })).toBeNull();
    expect(storage.raw.size).toBe(0);
  });

  it('fetchIsPioneer needs a backend', async () => {
    await expect(fetchIsPioneer()).rejects.toThrow('not_configured');
  });
});

describe('the marker on the save and the texts', () => {
  it('survives normalizeSave and JSON, and garbage is dropped', () => {
    const hero = buildLeagueHero({ heroName: 'A' }, R, true);
    expect(normalizeSave(JSON.parse(JSON.stringify(hero))).league).toEqual({ epoch: R, noticeSeen: false, pioneerChecked: true });
    expect(sanitizeLeagueMark({ epoch: 'x' })).toBeUndefined();
    expect(sanitizeLeagueMark({ epoch: -5 })).toBeUndefined();
    expect(sanitizeLeagueMark(null)).toBeUndefined();
    expect(sanitizeLeagueMark([1])).toBeUndefined();
    expect(sanitizeLeagueMark({ epoch: R + 0.9, noticeSeen: 'yes' })).toEqual({ epoch: R, noticeSeen: false, pioneerChecked: false });
  });

  it('both languages carry the warning and the reset screen', () => {
    for (const tree of [pt, en]) {
      const lr = tree.leagueReset as Record<string, string>;
      for (const k of ['preseasonWarning', 'title', 'what', 'kept', 'pioneer', 'cta']) expect(lr[k], k).toBeTruthy();
    }
    expect(pt.leagueReset.preseasonWarning).toBe('A pré-temporada é um teste aberto: quando a Liga começar, todos os heróis online recomeçam do zero. O Passe e o seu nome continuam.');
    expect(en.leagueReset.preseasonWarning).toBe('The pre-season is an open test: when the League begins, every online hero starts again from zero. Your Pass and your name stay.');
  });

  it('the warning is placed on the season tab, the welcome screen and the sign-in gate', () => {
    for (const f of ['components/SeasonRankingPanel.tsx', 'components/WelcomeModal.tsx', 'components/AuthScreen.tsx']) {
      expect(readFileSync(resolve(__dirname, '../..', f), 'utf8'), f).toContain('<PreseasonResetNotice');
    }
  });
});
