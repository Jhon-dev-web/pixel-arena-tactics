import { execSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hero } from '../../../scripts/sim/duel';
import { buildHuntSession, computeHuntingStatus, defaultSave, normalizeSave, SaveData, xpToReachLevel } from '../engine';
import { applyElixir } from '../elixirs';
import { applyHuntClaim, applyHuntStart, applyHuntStop } from '../huntLifecycle';
import { applyCraftPotion } from '../craftActions';
import { bestZoneTier, POTION_RECIPES, potionRecipeInTier, potionRecipeKey } from '../potions';
import { applyDeliveryClaim } from '../deliveries';
import { CONSUMABLES, getConsumable } from '../consumables';
import { HUNTING_ZONES, unlockedZoneIds } from '../huntingZones';
import { emptyMaterials } from '../materials';
import { isBuffActive } from '../buffs';
import T from '../tunables';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// Rodada 20 (the League): hero XP comes only from Hunting, and the Knowledge Elixir is the crafted buff of that XP.
const HOUR = 3600 * 1000;
const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const strong = (floor = 60): SaveData => ({ ...hero('4g', 4, { level: 60 }), highestDungeonFloor: floor, unlockedHuntingZones: unlockedZoneIds(floor) });
const give = (s: SaveData, n = 1): SaveData => ({ ...s, consumables: { ...s.consumables, knowledge_elixir: n } });
const mats = (s: SaveData, m: Partial<Record<string, number>>): SaveData => ({ ...s, materials: { ...emptyMaterials(), ...s.materials, ...m } as SaveData['materials'] });

describe('the Knowledge Elixir: +25% Hunting XP for 4 hours, one at a time', () => {
  it('is a plain consumable that nobody sells: not in the Shop, not on the merchants, not on the Pass track', () => {
    const def = getConsumable('knowledge_elixir')!;
    expect(def.purchasable).toBe(false);
    expect(def.sellValue).toBe(0);
    expect(T.consumables.knowledgeXpPct).toBe(0.25);
    expect(T.consumables.knowledgeMinutes).toBe(240);
    expect(CONSUMABLES.some((c) => c.id === ('xp_potion' as string))).toBe(false);
  });

  it('drinking starts 4 hours; a second one while it runs is refused and costs nothing; after it ended a new one starts', () => {
    const s = give(strong(), 2);
    const a = applyElixir(s, 'knowledge_elixir', NOW)!;
    expect(a.consumables.knowledge_elixir).toBe(1);
    expect(a.buffs!.knowledge!.expiresAt).toBe(NOW + 4 * HOUR);
    expect(isBuffActive(a, 'knowledge', NOW + 4 * HOUR - 1)).toBe(true);
    expect(applyElixir(a, 'knowledge_elixir', NOW + 2 * HOUR)).toBeNull(); // refused, the unit is kept
    expect(applyElixir(a, 'knowledge_elixir', NOW + 4 * HOUR - 1)).toBeNull();
    const b = applyElixir(a, 'knowledge_elixir', NOW + 4 * HOUR)!;
    expect(b.consumables.knowledge_elixir).toBe(0);
    expect(b.buffs!.knowledge!.expiresAt).toBe(NOW + 8 * HOUR);
    expect(applyElixir(give(strong(), 0), 'knowledge_elixir', NOW)).toBeNull();
  });

  it('adds exactly 25% to the Hunting XP of the kills it covers, and nothing to Gold or drops', () => {
    const base = strong();
    const start = NOW - 3 * HOUR;
    const plain = applyHuntStart(base, 'blood_marsh', 'shallow', start)!;
    const drunk = applyHuntStart(applyElixir(give(base), 'knowledge_elixir', start)!, 'blood_marsh', 'shallow', start)!;
    expect(drunk.huntSession!.tonics!.knowledge).toEqual([{ from: start, to: start + 4 * HOUR }]);
    const a = computeHuntingStatus(plain, NOW);
    const b = computeHuntingStatus(drunk, NOW);
    expect(a.xpReady).toBeGreaterThan(1000);
    expect(b.xpReady / a.xpReady).toBeGreaterThan(1.24);
    expect(b.xpReady / a.xpReady).toBeLessThan(1.26);
    expect(b.goldReady).toBe(a.goldReady);
    expect(b.drops).toEqual(a.drops);
    expect(b.kills).toBe(a.kills);
  });

  it('only the covered part counts: 2 h of a 4 h session is about half of the bonus, and a potion drunk after the hunt ended is never retroactive', () => {
    const base = strong();
    const start = NOW - 4 * HOUR;
    const running = applyHuntStart(base, 'blood_marsh', 'shallow', start)!;
    const plain = computeHuntingStatus(running, NOW).xpReady;
    // drunk 2 h in: the session records the window from then on
    const mid = applyElixir(give(running), 'knowledge_elixir', start + 2 * HOUR)!;
    expect(mid.huntSession!.tonics!.knowledge).toEqual([{ from: start + 2 * HOUR, to: start + 6 * HOUR }]);
    const gain = computeHuntingStatus(mid, NOW).xpReady / plain - 1;
    expect(gain).toBeGreaterThan(0.1);
    expect(gain).toBeLessThan(0.15);
    // the same elixir drunk once the hunt has been stopped does nothing to the reward already frozen
    const stopped = applyHuntStop(running, NOW)!;
    expect(stopped.pendingHuntReward!.xp).toBe(plain);
    const after = applyElixir(give(stopped), 'knowledge_elixir', NOW)!;
    expect(after.pendingHuntReward!.xp).toBe(plain);
    expect(applyHuntClaim(after, after.pendingHuntReward!.id)!.xp - after.xp).toBe(plain);
  });

  it('a session that started under a running elixir carries its window, and it survives a reload', () => {
    const base = strong();
    const drunkEarly = applyElixir(give(base), 'knowledge_elixir', NOW - HOUR)!;
    const started = applyHuntStart(drunkEarly, 'blood_marsh', 'shallow', NOW)!;
    expect(started.huntSession!.tonics!.knowledge).toEqual([{ from: NOW, to: NOW - HOUR + 4 * HOUR }]);
    const back = normalizeSave(JSON.parse(JSON.stringify(started)));
    expect(back.huntSession!.tonics!.knowledge).toEqual(started.huntSession!.tonics!.knowledge);
    expect(back.buffs!.knowledge).toEqual(started.buffs!.knowledge);
    expect(buildHuntSession(drunkEarly, NOW).tonics!.knowledge).toBeTruthy();
  });
});

describe('the recipe: one per Hunting zone tier, only the best open zone is listed', () => {
  const recipes = POTION_RECIPES.filter((r) => r.id === 'knowledge_elixir');

  it('there are four, one per zone, each with a Garden plant of Gardening 45+ and the rare drop of ITS zone', () => {
    expect(recipes.map((r) => r.zoneTier)).toEqual([1, 2, 3, 4]);
    expect(new Set(recipes.map(potionRecipeKey)).size).toBe(4);
    const rare = ['demon_core', 'corrupted_crystal', 'demon_core', 'corrupted_crystal']; // the rare drops of the zone that are not the gear bottlenecks (Fiend Horn, Blood Heart)
    const qty = [1, 1, 2, 2];
    recipes.forEach((r, i) => {
      const zone = HUNTING_ZONES[i];
      expect(zone.drops.filter((d) => d.rarity === 'rare').map((d) => d.material), `zone ${i + 1}`).toContain(rare[i]);
      expect(r.input[rare[i] as keyof typeof r.input], `rare ${i + 1}`).toBe(qty[i]);
      const lateGarden = ['moon_lily', 'silver_sage', 'dusk_orchid', 'elder_root'].filter((m) => (r.input[m as keyof typeof r.input] ?? 0) > 0);
      expect(lateGarden.length).toBeGreaterThan(0);
    });
    // dearer every tier
    for (let i = 1; i < 4; i++) expect(recipes[i].cost).toBeGreaterThan(recipes[i - 1].cost);
    // Rodada 22: Gold has a use again: the last tier costs 250 (it was 65) and the first three follow in proportion (20 / 35 / 50 before)
    expect(recipes.map((r) => r.cost)).toEqual([77, 135, 192, 250]);
  });

  it('bestZoneTier follows the zone unlock floors, and a recipe of another tier is neither listed nor craftable', () => {
    expect([0, 25, 26, 50, 51, 75, 76, 100].map((floor) => bestZoneTier(floor, 100))).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    // Rodada 22: zone 3 also asks hero level 40 and zone 4 level 60
    expect([bestZoneTier(60, 39), bestZoneTier(60, 40), bestZoneTier(90, 59), bestZoneTier(90, 60)]).toEqual([2, 3, 3, 4]);
    const rich = (floor: number) => mats({ ...strong(floor), gold: 1e6 }, { moon_lily: 9, silver_sage: 9, dusk_orchid: 9, elder_root: 9, demon_core: 9, corrupted_crystal: 9, fiend_horn: 9, blood_heart: 9 });
    for (const [floor, tier] of [[10, 1], [30, 2], [60, 3], [90, 4]] as const) {
      const s = rich(floor);
      for (const r of recipes) {
        expect(potionRecipeInTier(r, floor, 60), `${floor}/${r.zoneTier}`).toBe(r.zoneTier === tier);
        const res = applyCraftPotion(s, potionRecipeKey(r));
        if (r.zoneTier === tier) {
          expect(res.ok).toBe(true);
          expect(res.save!.consumables.knowledge_elixir).toBe(1);
          expect(res.save!.gold).toBe(s.gold - r.cost);
        } else {
          expect(res.ok).toBe(false);
          expect(res.reason).toBe('tier');
        }
      }
    }
  });

  it('needs every ingredient and the Gold', () => {
    const r = recipes[2];
    const s = { ...strong(60), gold: r.cost };
    expect(applyCraftPotion(s, potionRecipeKey(r)).reason).toBe('materials');
    expect(applyCraftPotion(mats({ ...s, gold: r.cost - 1 }, { dusk_orchid: 1, silver_sage: 2, demon_core: 2 }), potionRecipeKey(r)).reason).toBe('gold');
    expect(applyCraftPotion(mats({ ...s, xp: xpToReachLevel(45) }, { dusk_orchid: 1, silver_sage: 2, demon_core: 2 }), potionRecipeKey(r)).reason).toBe('level'); // zone 3 is open at 40, the recipe asks 50
  });
});

describe('the hero XP comes only from Hunting', () => {
  it('a delivery order pays Gold (and Aether) and leaves the XP alone', () => {
    const offer = { id: 'd1', arch: 'militar', dist: 'curta', cls: 'simple', tier: 0, items: { demon_claw: 1 }, gold: 100, shards: 1, durationMs: 90 * 60 * 1000, bornAt: NOW, dest: 0 };
    const s = { ...defaultSave(), xp: 1234, deliveries: { seq: 1, offers: [], active: { offer, startedAt: NOW - 2 * HOUR, endsAt: NOW - 1 }, rerollDay: '', rerollsUsed: 0 } } as unknown as SaveData;
    const claim = applyDeliveryClaim(s, NOW)!;
    expect(claim.save.xp).toBe(1234);
    expect(claim.save.gold).toBe(s.gold + 100);
    expect(claim.save.shards).toBe(s.shards + 1);
  });

  it('an old order carrying XP in its snapshot is still paid without it', () => {
    const offer = { id: 'd1', arch: 'militar', dist: 'curta', cls: 'simple', tier: 0, items: { demon_claw: 1 }, gold: 100, xp: 99999, shards: 0, durationMs: 90 * 60 * 1000, bornAt: NOW, dest: 0 };
    const raw = { ...defaultSave(), deliveries: { seq: 1, offers: [], active: { offer, startedAt: NOW - 2 * HOUR, endsAt: NOW - 1 }, rerollDay: '', rerollsUsed: 0 } };
    const loaded = normalizeSave(JSON.parse(JSON.stringify(raw)));
    expect('xp' in loaded.deliveries.active!.offer).toBe(false);
    expect(applyDeliveryClaim(loaded, NOW)!.save.xp).toBe(loaded.xp);
  });

  it('no source file but the Hunting claim adds to save.xp', () => {
    // every `xp: <something>.xp + ...` / `xp: s.xp + ...` write in the game and the app
    const out = execSync(`git grep -nE "\\bxp: [a-z.]*xp \\+" -- src ":!src/**/__tests__/**"`, { encoding: 'utf8' }).split('\n').filter(Boolean);
    expect(out.length).toBe(1);
    expect(out[0]).toContain('huntLifecycle.ts');
  });
});

describe('old saves: the instant XP potion turns into Gold', () => {
  it('pays legacyXpPotionGold for each potion in the bag and in the stash, drops the id, and never pays twice', () => {
    const raw = JSON.parse(JSON.stringify(defaultSave()));
    raw.gold = 50;
    raw.consumables = { ...raw.consumables, xp_potion: 3 };
    raw.stash = { ...(raw.stash ?? {}), consumables: { xp_potion: 2 } };
    const loaded = normalizeSave(raw);
    expect(loaded.gold).toBe(50 + 5 * T.consumables.legacyXpPotionGold);
    expect('xp_potion' in loaded.consumables).toBe(false);
    expect('xp_potion' in (loaded.stash.consumables as Record<string, number>)).toBe(false);
    const again = normalizeSave(JSON.parse(JSON.stringify(loaded)));
    expect(again.gold).toBe(loaded.gold);
  });
});

describe('texts', () => {
  it('both languages name the elixir, say +25% and 4 hours, and no text promises XP from the Dungeon or the orders', () => {
    for (const tree of [pt, en]) {
      const c = tree.consumables as Record<string, string>;
      expect(c.knowledge_elixir).toBeTruthy();
      expect(c.knowledge_elixir_d).toMatch(/25%/);
      expect(c.knowledge_elixir_d).toMatch(/4/);
      expect(c.knowledge_elixir_running).toBeTruthy();
      expect(c.xp_potion).toBeUndefined();
      expect(tree.tutorial.deliveries.body).not.toMatch(/XP/);
      expect((tree.deliveries as Record<string, string>).xp).toBeUndefined();
      expect((tree.dungeon as Record<string, string>).runXp).toBeUndefined();
    }
  });
});
