import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { QUESTS_ACHIEVEMENTS, QUESTS_DAILY, isComplete, migrateAchievementId, questProgress, QuestContext } from '../quests';
import { questContext } from '../questContext';
import { TITLES, getTitleDef } from '../titles';
import { emptyStats, normalizeStats } from '../stats';
import { bossesInRun, fullSetsWorn, recordDungeonRun, trackSave } from '../statsTracking';
import { applyForge, applyUpgrade, createGearInstance } from '../gearInstances';
import { applyHuntStart, applyHuntStop } from '../huntLifecycle';
import { applyDeliveryAccept, applyDeliveryClaim, ensureDeliveryOffers } from '../deliveries';
import { applyStartGathering, applyClaimGathering } from '../gathering';
import { applyPlant, applyHarvest } from '../gardenActions';
import { applyCraftPotion } from '../craftActions';
import { HUNTING_ZONES } from '../huntingZones';
import { emptyMaterials } from '../materials';
import { SET_FAMILIES, GEAR } from '../gear';
import { isDungeonBoss } from '../dungeon';
import { skillXpToReachLevel } from '../skills';
import { mulberry32 } from '../../../scripts/sim/driver';

const HOUR = 3600 * 1000;
const T0 = new Date(2026, 9, 10, 9, 0, 0).getTime();
const lookup = (tree: unknown, path: string): unknown => path.split('.').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), tree);

describe('achievement list', () => {
  it('has at least 40 achievements with unique, stable ASCII ids', () => {
    expect(QUESTS_ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    const ids = QUESTS_ACHIEVEMENTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^ACH_[A-Z0-9_]+$/);
  });

  it('covers every group asked for: floors, zones, rarities, every set family, professions', () => {
    const ids = new Set(QUESTS_ACHIEVEMENTS.map((q) => q.id));
    for (const id of ['ACH_FLOOR_10', 'ACH_FLOOR_25', 'ACH_FLOOR_50', 'ACH_FLOOR_75', 'ACH_MINOTAUR', 'ACH_FORGE_EPIC', 'ACH_FORGE_LEGENDARY', 'ACH_MINING_25', 'ACH_WOOD_50', 'ACH_GARDEN_75']) expect(ids.has(id), id).toBe(true);
    for (const f of SET_FAMILIES) expect(QUESTS_ACHIEVEMENTS.some((q) => q.metric === 'set_complete' && q.arg === f), f).toBe(true);
    for (const z of HUNTING_ZONES) expect(QUESTS_ACHIEVEMENTS.some((q) => q.metric === 'zone_kills' && q.arg === z.id), z.id).toBe(true);
  });

  it('every achievement and daily has a name and description in both languages', () => {
    for (const q of [...QUESTS_DAILY, ...QUESTS_ACHIEVEMENTS]) {
      for (const [lang, tree] of [['pt', pt], ['en', en]] as const) {
        expect(typeof lookup(tree, `quests.${q.nameKey}`), `${lang} ${q.id} name`).toBe('string');
        expect(typeof lookup(tree, `quests.${q.descKey}`), `${lang} ${q.id} desc`).toBe('string');
      }
    }
  });

  it('rewards stay small: Gold and a few Éter, titles only on the hard ones', () => {
    for (const q of QUESTS_ACHIEVEMENTS) {
      expect(q.gold, q.id).toBeLessThanOrEqual(3000);
      expect(q.shards, q.id).toBeLessThanOrEqual(15);
    }
    const titled = QUESTS_ACHIEVEMENTS.filter((q) => q.titleId);
    expect(titled.length).toBeGreaterThanOrEqual(7);
    for (const q of titled) {
      const def = getTitleDef(q.titleId as string);
      expect(def, q.id).toBeDefined();
      for (const tree of [pt, en]) {
        expect(typeof lookup(tree, `titles.${def!.nameKey}`)).toBe('string');
        expect(typeof lookup(tree, `titles.${def!.reqKey}`)).toBe('string');
      }
    }
    expect(TITLES.length).toBeGreaterThanOrEqual(11);
  });

  it('the achievements the progression simulator can see pay nothing (it claims everything, and any Gold moves its medians)', () => {
    const original = new Set(['ACH_FIRST_BLOOD', 'ACH_CP150', 'ACH_CP500', 'ACH_BLACKSMITH', 'ACH_CRYPT', 'ACH_MINOTAUR']);
    const seen = new Set(['total_kills', 'cp', 'max_floor', 'max_refine']);
    for (const q of QUESTS_ACHIEVEMENTS.filter((a) => seen.has(a.metric) && !original.has(a.id))) {
      expect(q.gold, q.id).toBe(0);
      expect(q.shards, q.id).toBe(0);
    }
  });

  it('old lower-case ids become the ACH_* ones', () => {
    expect(migrateAchievementId('ach_first_blood')).toBe('ACH_FIRST_BLOOD');
    expect(migrateAchievementId('ACH_CRYPT')).toBe('ACH_CRYPT');
    expect(migrateAchievementId('daily_forge')).toBe('daily_forge');
  });
});

describe('lifetime statistics: loading and old saves', () => {
  it('a new save starts at zero and survives a normalize round trip', () => {
    const s = defaultSave();
    expect(s.stats).toEqual(emptyStats());
    const again = normalizeSave(JSON.parse(JSON.stringify({ ...s, stats: { ...s.stats, kills: 42, killsByZone: { demon_glade: 7 }, completedSets: ['iron'] } })));
    expect(again.stats.kills).toBe(42);
    expect(again.stats.killsByZone).toEqual({ demon_glade: 7 });
    expect(again.stats.completedSets).toEqual(['iron']);
  });

  it('an old save without stats loads with safe defaults, backfilled from what it proves', () => {
    const old = JSON.parse(JSON.stringify(defaultSave())) as Record<string, unknown>;
    delete old.stats;
    (old.quests as { counters: { kills: number } }).counters.kills = 321;
    const loaded = normalizeSave(old);
    expect(loaded.stats.kills).toBe(321);
    expect(loaded.stats.goldEarned).toBe(0);
    expect(loaded.stats.completedSets).toEqual([]);
    expect(loaded.stats.forgedByRarity).toEqual({ common: 0, rare: 0, epic: 0, legendary: 0 });
  });

  it('corrupt counters never load as NaN, negatives or text', () => {
    const st = normalizeStats({ kills: 'lots', goldEarned: -5, secondsPlayed: NaN, killsByZone: { a: 'x', b: 3 }, completedSets: ['nope', 'iron'], forgedByRarity: { epic: -2 } });
    expect(st.kills).toBe(0);
    expect(st.goldEarned).toBe(0);
    expect(st.secondsPlayed).toBe(0);
    expect(st.killsByZone).toEqual({ b: 3 });
    expect(st.completedSets).toEqual(['iron']);
    expect(st.forgedByRarity.epic).toBe(0);
  });

  it('the old claimed list and the old daily counter migrate', () => {
    const old = JSON.parse(JSON.stringify(defaultSave())) as { quests: { claimed: string[]; daily: Record<string, number>; dailyDay: string } };
    old.quests.claimed = ['ach_first_blood', 'ach_cp150'];
    old.quests.dailyDay = new Date().toDateString();
    old.quests.daily = { kills: 2, forge: 1, purchases: 0, expeditions: 3 };
    const loaded = normalizeSave(old);
    expect(loaded.quests.claimed).toEqual(['ACH_FIRST_BLOOD', 'ACH_CP150']);
    expect(loaded.quests.daily).toEqual({ kills: 2, forge: 1, purchases: 0, deliveries: 3 });
  });
});

const base = (): SaveData => ({
  ...defaultSave(),
  lastMiningClaim: T0,
  lastWoodcuttingClaim: T0,
  huntingOfflineStart: T0,
  skillXp: { mining: skillXpToReachLevel(5, 'mining'), woodcutting: 0, gardening: skillXpToReachLevel(5, 'gardening') },
});

describe('lifetime statistics: counted where the event happens', () => {
  it('forging counts the piece and its rarity; a refine counts success or failure', () => {
    const s = defaultSave();
    const rich: SaveData = { ...s, gold: 100000, materials: { ...s.materials, copper_bar: 5, wood_handle_common: 5, leather: 30, leather_scrap: 30 } };
    const r = applyForge(rich, 'bronze_dagger', { level: 1 });
    expect(r.ok).toBe(true);
    const st = r.save!.stats;
    expect(st.itemsForged).toBe(1);
    expect(Object.values(st.forgedByRarity).reduce((a, b) => a + b, 0)).toBe(1);
    expect(st.forgedByRarity[r.instance!.rarity]).toBe(1);

    const inst = createGearInstance('bronze_dagger', { id: 'x1', origin: 'craft', rarity: 'common', substats: [], upgrade: 5 });
    const withInst: SaveData = { ...rich, gearInstances: { ...rich.gearInstances, x1: inst }, shards: 100, materials: Object.fromEntries(Object.keys(rich.materials).map((k) => [k, 500])) as SaveData['materials'] };
    const ok = applyUpgrade(withInst, 'x1', false, () => 0)!;
    expect(ok.success).toBe(true);
    expect(ok.save.stats.refineSuccess).toBe(1);
    const bad = applyUpgrade(withInst, 'x1', false, () => 0.9999)!;
    expect(bad.success).toBe(false);
    expect(bad.save.stats.refineFail).toBe(1);
  });

  it('stopping a hunt counts its wins in the total and in its zone', () => {
    const zone = HUNTING_ZONES[0];
    const started = applyHuntStart(base(), zone.id, 'shallow', T0)!;
    const stopped = applyHuntStop(started, T0 + 2 * HOUR)!;
    expect(stopped.pendingHuntReward?.kills).toBeGreaterThan(0);
    expect(stopped.stats.kills).toBe(stopped.pendingHuntReward?.kills);
    expect(stopped.stats.killsByZone[zone.id]).toBe(stopped.stats.kills);
  });

  it('delivery, gathering, harvest and potion crafts are counted once each', () => {
    let s = base();
    s = ensureDeliveryOffers(s, T0, mulberry32(1), false);
    const offer = s.deliveries.offers[0];
    s = { ...s, materials: { ...emptyMaterials(), ...Object.fromEntries(Object.entries(offer.items).map(([m, q]) => [m, (q as number) + 5])) } as SaveData['materials'] };
    s = applyDeliveryAccept(s, offer.id, T0, mulberry32(2), false)!;
    const claimed = applyDeliveryClaim(s, T0 + 200 * HOUR)!;
    expect(claimed.save.stats.deliveries).toBe(1);
    expect(claimed.save.quests.daily.deliveries).toBe(1);

    const mined = applyClaimGathering(applyStartGathering(base(), 'mining', 'copper', T0)!.save, 'mining', T0 + 3 * HOUR)!;
    expect(mined.save.stats.oreGathered).toBe(mined.units - mined.leftBehind);
    expect(mined.units).toBeGreaterThan(0);

    const planted = applyPlant(base(), 'common_herb', [0, 1], T0)!;
    const harvest = applyHarvest(planted, [0, 1], T0 + 200 * HOUR)!;
    expect(harvest.save.stats.plantsHarvested).toBe(harvest.harvested.reduce((a, h) => a + h.qty, 0));
    expect(harvest.save.stats.plantsHarvested).toBeGreaterThan(0);

    const brew = applyCraftPotion({ ...base(), gold: 99999, materials: { ...base().materials, common_herb: 50, energy_herb: 50 } }, 'small_hp');
    if (brew.ok && brew.save) expect(brew.save.stats.potionsBrewed).toBe(1);
  });

  it('a dungeon run counts its stages as kills and the boss floors among them', () => {
    const boss = Array.from({ length: 100 }, (_, i) => i + 1).find((f) => isDungeonBoss(f))!;
    expect(bossesInRun(boss - 2, 3)).toBe(1);
    expect(bossesInRun(boss + 1, 3)).toBe(0);
    const s = recordDungeonRun(defaultSave(), boss - 2, 3, 1);
    expect(s.stats).toMatchObject({ dungeonRuns: 1, kills: 3, bossesKilled: 1, uniquesFound: 1 });
  });

  it('gold earned counts every gain, never a spend; seconds ride along', () => {
    const a = defaultSave();
    const gained = trackSave(a, { ...a, gold: a.gold + 500 }, 30);
    expect(gained.stats.goldEarned).toBe(500);
    expect(gained.stats.secondsPlayed).toBe(30);
    const spent = trackSave(gained, { ...gained, gold: gained.gold - 100 });
    expect(spent.stats.goldEarned).toBe(500);
  });

  it('wearing the full set of a family records it for good', () => {
    const s = defaultSave();
    const bronze = GEAR.filter((g) => g.setFamily === 'bronze' && !g.unique && g.recipe);
    const slots = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'ring', 'shield'] as const;
    const instances = { ...s.gearInstances };
    const equipped = { ...s.equipped };
    for (const slot of slots) {
      const g = bronze.find((x) => x.slot === slot);
      if (!g) continue;
      const inst = createGearInstance(g.id, { id: `b_${slot}`, origin: 'craft', rarity: 'common', substats: [] });
      instances[inst.id] = inst;
      equipped[slot] = inst.id;
    }
    const dressed: SaveData = { ...s, gearInstances: instances, equipped };
    expect(fullSetsWorn(dressed)).toContain('bronze');
    const tracked = trackSave(s, dressed);
    expect(tracked.stats.completedSets).toContain('bronze');
    // taking it off does not forget it
    const undressed = trackSave(tracked, { ...tracked, equipped: s.equipped });
    expect(undressed.stats.completedSets).toContain('bronze');
  });
});

describe('achievement progress', () => {
  it('reads the new counters through questContext, and a missing context shows no progress', () => {
    const s: SaveData = { ...defaultSave(), stats: { ...emptyStats(), kills: 1500, killsByZone: { blood_marsh: 1000 }, forgedByRarity: { common: 0, rare: 0, epic: 1, legendary: 0 }, completedSets: ['iron'], secondsPlayed: 11 * 3600 }, skillXp: { mining: skillXpToReachLevel(25, 'mining'), woodcutting: 0, gardening: 0 } };
    const ctx = questContext(s);
    const by = (id: string) => QUESTS_ACHIEVEMENTS.find((q) => q.id === id)!;
    expect(isComplete(by('ACH_KILLS_1K'), s.quests, ctx)).toBe(true);
    expect(isComplete(by('ACH_KILLS_10K'), s.quests, ctx)).toBe(false);
    expect(isComplete(by('ACH_HUNT_MARSH'), s.quests, ctx)).toBe(true);
    expect(isComplete(by('ACH_HUNT_GLADE'), s.quests, ctx)).toBe(false);
    expect(isComplete(by('ACH_FORGE_EPIC'), s.quests, ctx)).toBe(true);
    expect(isComplete(by('ACH_FORGE_LEGENDARY'), s.quests, ctx)).toBe(false);
    expect(isComplete(by('ACH_SET_IRON'), s.quests, ctx)).toBe(true);
    expect(isComplete(by('ACH_SET_BRONZE'), s.quests, ctx)).toBe(false);
    expect(isComplete(by('ACH_MINING_25'), s.quests, ctx)).toBe(true);
    expect(isComplete(by('ACH_MINING_50'), s.quests, ctx)).toBe(false);
    expect(isComplete(by('ACH_PLAYED_10H'), s.quests, ctx)).toBe(true);
    const bare: QuestContext = { cp: 0, maxRefine: 0 };
    expect(questProgress(by('ACH_FORGE_100'), s.quests, bare)).toBe(0);
  });
});
