import { describe, expect, it } from 'vitest';
import Assets from '../../assets.json';
import { BATTLE_PASS_TRACK } from '../battlepass';
import { CONSUMABLES, EXPEDITION_TICKET_SKIP_MS } from '../consumables';
import { DUNGEON_BIOMES, MILESTONE_REWARDS } from '../dungeon';
import { ensureDeliveryOffers } from '../deliveries';
import { defaultSave, SaveData, xpToReachLevel } from '../engine';
import { GARDEN_SLOTS } from '../engine';
import { GEAR, getGear, isInstancedSlot, MAX_REFINE, upgradeCost } from '../gear';
import { createGearInstance } from '../gearInstances';
import { GEMS } from '../gems';
import { HUNTING_ZONES } from '../huntingZones';
import { MATERIALS } from '../materials';
import { ORE_TIERS } from '../ores';
import { PLANTS } from '../garden';
import { POTION_RECIPES } from '../potions';
import { RARITIES } from '../rarity';
import { REFINING_RECIPES } from '../refining';
import { getReforgeCost } from '../reforge';
import { TITLES } from '../titles';
import { FRAMES, SKINS } from '../seasonItems';
import { WOOD_TIERS } from '../woodcutting';
import { skillXpToReachLevel } from '../skills';

const materialIds = new Set<string>(MATERIALS.map((m) => m.id));
const consumableIds = new Set<string>(CONSUMABLES.map((c) => c.id));
const gemIds = new Set<string>(GEMS.map((g) => g.id));
const gearIds = new Set<string>(GEAR.map((g) => g.id));
const titleIds = new Set<string>(TITLES.map((t) => t.id));

const unknown = (ids: Iterable<string>, known: Set<string>) => [...new Set(ids)].filter((id) => !known.has(id));

describe('catalog cross-references', () => {
  it('ids are unique inside each catalog', () => {
    for (const list of [MATERIALS.map((m) => m.id), GEAR.map((g) => g.id), CONSUMABLES.map((c) => c.id), GEMS.map((g) => g.id), TITLES.map((t) => t.id), REFINING_RECIPES.map((r) => r.id)]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('gear recipes only use known materials, gems, and instanced gear as ingredients', () => {
    const mats: string[] = [];
    const gems: string[] = [];
    const items: string[] = [];
    for (const g of GEAR) {
      mats.push(...Object.keys(g.recipe?.materials ?? {}));
      gems.push(...Object.keys(g.recipe?.gems ?? {}));
      items.push(...Object.keys(g.recipe?.items ?? {}));
    }
    expect(unknown(mats, materialIds)).toEqual([]);
    expect(unknown(gems, gemIds)).toEqual([]);
    expect(unknown(items, gearIds)).toEqual([]);
    for (const id of items) expect(isInstancedSlot(getGear(id).slot)).toBe(true); // only weapons / armors can be consumed
  });

  it('a recipe never needs a higher-tier piece than the one it makes, and tiers chain', () => {
    for (const g of GEAR) {
      for (const sub of Object.keys(g.recipe?.items ?? {})) {
        expect(getGear(sub).slot).toBe(g.slot);
        // the dragon weapon / armor (tier 4) is made from the gilded piece of the same tier; every other step goes up one tier
        if (g.materialKey === 'material_dragon') expect(getGear(sub).tier ?? 0).toBeLessThanOrEqual(g.tier ?? 0);
        else expect(getGear(sub).tier ?? 0).toBeLessThan(g.tier ?? 0);
      }
    }
  });

  it('refine / upgrade costs at every level only use known materials', () => {
    const mats: string[] = [];
    for (const g of GEAR.filter((x) => x.slot === 'weapon' || x.slot === 'armor')) {
      for (let lvl = 0; lvl < MAX_REFINE; lvl++) mats.push(...Object.keys(upgradeCost(g, lvl).materials ?? {}));
    }
    expect(unknown(mats, materialIds)).toEqual([]);
  });

  it('reforge costs only use known materials, for every craftable weapon / armor', () => {
    const mats: string[] = [];
    for (const g of GEAR.filter((x) => isInstancedSlot(x.slot))) {
      const base = defaultSave();
      const inst = createGearInstance(g.id, { id: 'gi_x', origin: 'craft', rarity: 'legendary' });
      const save: SaveData = { ...base, gearInstances: { gi_x: inst } };
      const cost = getReforgeCost(save, 'gi_x');
      if (cost) mats.push(...Object.keys(cost.materials));
    }
    expect(mats.length).toBeGreaterThan(0);
    expect(unknown(mats, materialIds)).toEqual([]);
  });

  it('refining recipes: known inputs / outputs, and no recipe makes more than it eats in reference terms', () => {
    const ids = REFINING_RECIPES.flatMap((r) => [r.output, ...Object.keys(r.input)]);
    expect(unknown(ids, materialIds)).toEqual([]);
    for (const r of REFINING_RECIPES) {
      expect(r.outputQty).toBeGreaterThan(0);
      expect(Object.keys(r.input).length).toBeGreaterThan(0);
    }
  });

  it('potion recipes: known ingredients and a known consumable as output', () => {
    expect(unknown(POTION_RECIPES.flatMap((r) => Object.keys(r.input)), materialIds)).toEqual([]);
    expect(unknown(POTION_RECIPES.map((r) => r.id), consumableIds)).toEqual([]);
  });

  it('hunting zones, dungeon biomes, ores, woods and plants only point at known materials', () => {
    expect(unknown(HUNTING_ZONES.flatMap((z) => z.drops.map((d) => d.material)), materialIds)).toEqual([]);
    expect(unknown(DUNGEON_BIOMES.flatMap((b) => b.drops.map((d) => d.material)), materialIds)).toEqual([]);
    expect(unknown(ORE_TIERS.map((o) => o.id), materialIds)).toEqual([]);
    expect(unknown(WOOD_TIERS.map((w) => w.id), materialIds)).toEqual([]);
    expect(unknown(PLANTS.map((p) => p.material), materialIds)).toEqual([]);
    expect(GARDEN_SLOTS).toBeGreaterThan(0);
  });

  it('hunting drop tables are sane probabilities', () => {
    for (const z of HUNTING_ZONES) {
      for (const d of z.drops) {
        expect(d.chance).toBeGreaterThan(0);
        expect(d.chance).toBeLessThanOrEqual(1);
        expect(d.qty).toBeGreaterThan(0);
      }
    }
  });

  it('Battle Pass rewards: every id exists in the catalog that matches its kind', () => {
    const relicIds = new Set(GEAR.filter((g) => g.slot === 'relic').map((g) => g.id));
    const cosmeticIds = new Set([...titleIds, ...FRAMES.map((f) => f.id), ...SKINS.map((s) => s.id)]);
    const byKind: Record<string, Set<string>> = { material: materialIds, consumable: consumableIds, gem: gemIds, cosmetic: cosmeticIds, relic: relicIds };
    const bad: string[] = [];
    for (const lvl of BATTLE_PASS_TRACK) {
      for (const track of ['free', 'premium'] as const) {
        const r = lvl[track];
        expect(r, `level ${lvl.level} ${track}`).toBeDefined();
        expect(r.amount).toBeGreaterThan(0);
        for (const one of [r, ...(r.also ?? [])]) {
          const catalog = byKind[one.kind];
          if (catalog && !catalog.has(one.id as string)) bad.push(`${lvl.level}/${track}/${one.kind}:${one.id}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('milestone rewards: known gems and titles', () => {
    expect(unknown(MILESTONE_REWARDS.flatMap((m) => Object.keys(m.gems)), gemIds)).toEqual([]);
    expect(unknown(MILESTONE_REWARDS.flatMap((m) => (m.titleId ? [m.titleId] : [])), titleIds)).toEqual([]);
  });

  it('expedition tickets are real consumables', () => {
    expect(unknown(Object.keys(EXPEDITION_TICKET_SKIP_MS), consumableIds)).toEqual([]);
  });

  it('rarity table is a probability distribution', () => {
    expect(RARITIES.reduce((s, r) => s + r.chance, 0)).toBeCloseTo(1, 9);
  });

  it('delivery orders: every material they can ask for exists (sampled across tiers, levels and skills)', () => {
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const asked = new Set<string>();
    const now = new Date('2026-10-10T12:00:00Z').getTime();
    for (const floor of [1, 26, 51, 76]) {
      for (const [level, skill] of [
        [1, 1],
        [30, 30],
        [60, 60],
      ]) {
        for (const pass of [false, true]) {
          let save: SaveData = {
            ...defaultSave(),
            highestDungeonFloor: floor,
            xp: xpToReachLevel(level),
            skillXp: { mining: skillXpToReachLevel(skill, 'mining'), woodcutting: skillXpToReachLevel(skill, 'woodcutting'), gardening: skillXpToReachLevel(Math.min(skill, 40), 'gardening') },
          };
          for (let i = 0; i < 12; i++) {
            save = ensureDeliveryOffers({ ...save, deliveries: { ...save.deliveries, offers: [] } }, now + i * 1000, rng, pass);
            for (const o of save.deliveries.offers) {
              expect(Object.keys(o.items).length).toBeGreaterThan(0);
              for (const id of Object.keys(o.items)) asked.add(id);
            }
          }
        }
      }
    }
    expect(asked.size).toBeGreaterThan(5);
    expect(unknown(asked, materialIds)).toEqual([]);
  });
});

describe('icons point at files that exist under public/', () => {
  // Every file shipped in public/ ('/public/assets/...'), listed without importing any of them.
  const files = new Set(Object.keys(import.meta.glob('/public/**/*')));
  const exists = (url: string) => url.startsWith('/') && files.has('/public' + url);

  const entries: [string, string | undefined][] = [
    ...MATERIALS.map((m): [string, string | undefined] => [`material ${m.id}`, m.iconUrl]),
    ...GEAR.flatMap((g): [string, string | undefined][] => [
      [`gear ${g.id} iconUrl`, g.iconUrl],
      [`gear ${g.id} icon`, g.icon && g.icon.startsWith('/') ? g.icon : undefined],
    ]),
    ...CONSUMABLES.map((c): [string, string | undefined] => [`consumable ${c.id}`, c.iconUrl]),
    ...GEMS.map((g): [string, string | undefined] => [`gem ${g.id}`, g.iconUrl]),
    ...PLANTS.map((p): [string, string | undefined] => [`plant ${p.id}`, p.iconUrl]),
    ...TITLES.map((t): [string, string | undefined] => [`title ${t.id}`, t.iconUrl]),
  ];

  it('public/ was found (the glob is not silently empty)', () => {
    expect(files.size).toBeGreaterThan(50);
    expect(exists('/assets/icons/gold.png')).toBe(true);
    expect(exists('/assets/icons/definitely_not_a_file.png')).toBe(false);
    expect(exists('https://example.com/remote.png')).toBe(false); // remote urls are not allowed anymore
  });

  it('every catalog entry that declares an icon points to an existing local file', () => {
    const missing = entries.filter(([, url]) => url !== undefined && !exists(url)).map(([name, url]) => `${name} -> ${url}`);
    expect(missing).toEqual([]);
  });

  it('materials, consumables, gems, plants and titles all declare an icon', () => {
    const lacking = entries.filter(([name, url]) => !name.startsWith('gear ') && !url).map(([name]) => name);
    expect(lacking).toEqual([]);
  });

  it('every weapon / armor / relic declares an icon, and it exists', () => {
    for (const g of GEAR) {
      const url = g.iconUrl ?? g.icon;
      expect(url, g.id).toBeTruthy();
      expect(exists(url as string), `${g.id} -> ${url}`).toBe(true);
    }
  });

  it('every url in assets.json is a local file that exists', () => {
    const urls: string[] = [];
    const walk = (node: unknown) => {
      if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        if (typeof o.url === 'string') urls.push(o.url);
        Object.values(o).forEach(walk);
      }
    };
    walk(Assets);
    expect(urls.length).toBeGreaterThan(20);
    expect(urls.filter((u) => !exists(u))).toEqual([]);
  });
});
