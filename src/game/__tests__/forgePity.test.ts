import { afterEach, describe, expect, it } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { applyForge, createGearInstance } from '../gearInstances';
import { getGear } from '../gear';
import { emptyMaterials, MaterialId } from '../materials';
import { setItemAuthority } from '../itemAuthority';
import { FORGE_PITY, RARITIES, rollForgeRarity, rollRarity } from '../rarity';
import { statsOf } from '../stats';
import * as server from '../../../supabase/functions/_shared/items/roll';
import { PITY_TABLE } from '../../../supabase/functions/_shared/items/tables';

// Rodada 26: the Legendary pity. A normal forge of tier 4+ that is not Legendary adds one to the counter; the forge after 40 of them is Legendary, and a Legendary (by the dice or by the pity)
// puts it back to zero. Below tier 4 and with the Blacksmith's Seal the counter is never touched. Online the SERVER holds the counter (mint-item); this file covers the game's own (offline) copy and
// proves the two are the same function over the same numbers.

const COMMON = () => 0.1; // a stream that always rolls Common
const LEGENDARY = () => 0.999; // ... and one that always rolls Legendary

describe('rollForgeRarity (the pure rule)', () => {
  it('the table is 61 / 25 / 10 / 4 and the pity is 40 forges of tier 4+', () => {
    expect(RARITIES.map((r) => r.chance)).toEqual([0.61, 0.25, 0.1, 0.04]);
    expect(FORGE_PITY).toEqual({ minTier: 4, threshold: 40 });
    expect(PITY_TABLE).toEqual(FORGE_PITY);
  });

  it('counts a non-Legendary forge of tier 4+ and triggers exactly at the 41st', () => {
    let pity = 0;
    for (let n = 1; n <= 40; n++) {
      const r = rollForgeRarity(4, pity, COMMON);
      expect(r.rarity, `forge ${n}`).toBe('common');
      expect(r.pity).toBe(pity + 1);
      pity = r.pity;
    }
    expect(pity).toBe(40);
    const last = rollForgeRarity(4, pity, COMMON);
    expect(last).toEqual({ rarity: 'legendary', pity: 0 });
  });

  it('a guaranteed Legendary draws no random number; a normal roll draws exactly one', () => {
    let calls = 0;
    const rng = () => {
      calls++;
      return 0.1;
    };
    rollForgeRarity(5, 40, rng);
    expect(calls).toBe(0);
    rollForgeRarity(5, 39, rng);
    expect(calls).toBe(1);
  });

  it('a Legendary by the dice resets the counter, whatever it held', () => {
    expect(rollForgeRarity(4, 17, LEGENDARY)).toEqual({ rarity: 'legendary', pity: 0 });
    expect(rollForgeRarity(6, 0, LEGENDARY)).toEqual({ rarity: 'legendary', pity: 0 });
  });

  it('a forge below tier 4 neither counts nor consumes the guarantee', () => {
    for (const tier of [1, 2, 3]) {
      expect(rollForgeRarity(tier, 40, COMMON)).toEqual({ rarity: 'common', pity: 40 });
      expect(rollForgeRarity(tier, 12, COMMON)).toEqual({ rarity: 'common', pity: 12 });
      expect(rollForgeRarity(tier, 12, LEGENDARY)).toEqual({ rarity: 'legendary', pity: 12 }); // a Legendary there does not reset the tier-4+ counter either
    }
  });

  it('tiers 4, 5 and 6 share ONE counter', () => {
    let pity = 0;
    for (const tier of [4, 5, 6, 4, 5, 6, 4, 5, 6, 4]) pity = rollForgeRarity(tier, pity, COMMON).pity;
    expect(pity).toBe(10);
  });

  it('long-run Legendary share is the table lifted by the pity: 1 / sum(0.96^k, k = 0..40) = 4.93 %, never under the table', () => {
    let pity = 0;
    let legendary = 0;
    let seed = 12345;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const N = 400_000;
    for (let i = 0; i < N; i++) {
      const r = rollForgeRarity(4, pity, rng);
      pity = r.pity;
      if (r.rarity === 'legendary') legendary++;
    }
    let cycle = 0;
    for (let k = 0; k <= FORGE_PITY.threshold; k++) cycle += Math.pow(0.96, k);
    expect(legendary / N).toBeGreaterThan(0.04);
    expect(Math.abs(legendary / N - 1 / cycle)).toBeLessThan(0.002);
    // and no run of more than 40 non-Legendary forges ever happens
  });

  it('the longest drought is 40 forges (a seeded run of 200 000 forges never holds 41 non-Legendary in a row)', () => {
    let pity = 0;
    let drought = 0;
    let longest = 0;
    let seed = 99;
    const rng = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 200_000; i++) {
      const r = rollForgeRarity(5, pity, rng);
      pity = r.pity;
      drought = r.rarity === 'legendary' ? 0 : drought + 1;
      longest = Math.max(longest, drought);
    }
    expect(longest).toBeLessThanOrEqual(FORGE_PITY.threshold);
  });
});

describe('the server rolls the same function over the same table', () => {
  it('for every tier, counter and random stream, game and server agree', () => {
    let seed = 7;
    const make = () => {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };
    for (let tier = 1; tier <= 6; tier++) {
      for (const pity of [0, 1, 20, 39, 40, 41, 90]) {
        for (let k = 0; k < 40; k++) {
          seed = tier * 1000 + pity * 10 + k;
          expect(server.rollForgeRarity(tier, pity, make())).toEqual(rollForgeRarity(tier, pity, make()));
        }
      }
    }
    // and with no pity involved the roll is exactly the table's own
    for (let s = 1; s <= 300; s++) {
      seed = s;
      const rng = make();
      expect(server.rollForgeRarity(2, 0, rng).rarity).toBe(rollRarity(make()));
    }
  });
});

// ---- the offline game ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

describe('applyForge offline keeps its own counter (stats.forgePity)', () => {
  afterEach(() => setItemAuthority('local'));

  const stocked = (templateId: string, pity: number): SaveData => {
    const item = getGear(templateId)!;
    const materials = { ...emptyMaterials() } as Record<MaterialId, number>;
    for (const [m, q] of Object.entries(item.recipe!.materials ?? {})) materials[m as MaterialId] = q as number;
    const base = defaultSave();
    let save: SaveData = { ...base, gold: item.cost + 1000, materials, shards: 99, gems: { ruby: 9, sapphire: 9, emerald: 9 }, consumables: { ...base.consumables, forge_seal: 3 }, stats: { ...statsOf(base), forgePity: pity } };
    for (const [ingredient, n] of Object.entries(item.recipe!.items ?? {})) {
      for (let i = 0; i < (n as number); i++) {
        const inst = createGearInstance(ingredient, { id: `ing-${ingredient}-${i}`, origin: 'craft', rarity: 'common', substats: [] });
        save = { ...save, gearInstances: { ...save.gearInstances, [inst.id]: inst } };
      }
    }
    return save;
  };
  const forge = (id: string, pity: number, opts: { rng?: () => number; seal?: boolean } = {}) => applyForge(stocked(id, pity), id, { level: 100, rng: COMMON, ...opts });

  it('the 41st normal forge of tier 4 is Legendary and the counter returns to zero', () => {
    let save = stocked('gilded_warblade', 0);
    const results: string[] = [];
    for (let n = 1; n <= 41; n++) {
      // restock the recipe each time (the forge consumed it); only the counter is carried over
      const fresh = stocked('gilded_warblade', statsOf(save).forgePity ?? 0);
      const r = applyForge(fresh, 'gilded_warblade', { level: 100, rng: COMMON });
      expect(r.ok, `forge ${n}`).toBe(true);
      results.push(r.instance!.rarity);
      save = r.save!;
    }
    expect(results.slice(0, 40).every((x) => x === 'common')).toBe(true);
    expect(results[40]).toBe('legendary');
    expect(statsOf(save).forgePity).toBe(0);
  });

  it('a Legendary by the dice resets the counter', () => {
    const r = forge('gilded_warblade', 17, { rng: LEGENDARY });
    expect(r.instance!.rarity).toBe('legendary');
    expect(statsOf(r.save!).forgePity).toBe(0);
  });

  it('a forge below tier 4 never touches the counter, even when it holds the guarantee', () => {
    const r = forge('steel_greatsword', 40);
    expect(r.ok).toBe(true);
    expect(r.instance!.rarity).toBe('common');
    expect(statsOf(r.save!).forgePity).toBe(40);
  });

  it('a Blacksmith\'s Seal forge neither counts nor resets, and does not use the guarantee', () => {
    const sealed = forge('gilded_warblade', 40, { seal: true, rng: () => 0.2 });
    expect(sealed.sealUsed).toBe(true);
    expect(sealed.instance!.bound).toBe(true);
    expect(statsOf(sealed.save!).forgePity).toBe(40);
    const plain = forge('gilded_warblade', 40);
    expect(plain.instance!.rarity).toBe('legendary');
  });

  it('a piece forged offline that comes out Legendary is not certified (it can never be sold)', () => {
    const r = forge('gilded_warblade', 40);
    expect(r.instance!.rarity).toBe('legendary');
    expect(r.instance!.certified).toBe(false);
  });

  it('online (the server authority) the local counter is never read or written: the roll is the server\'s', () => {
    setItemAuthority('server');
    const noRoll = forge('gilded_warblade', 40);
    expect(noRoll.instance!.rarity).toBe('common'); // a preview forge without the server's roll is a plain Common
    expect(statsOf(noRoll.save!).forgePity).toBe(40);
    const given = applyForge(stocked('gilded_warblade', 3), 'gilded_warblade', { level: 100, roll: { rarity: 'epic', substats: [] } });
    expect(given.instance!.rarity).toBe('epic');
    expect(statsOf(given.save!).forgePity).toBe(3);
  });

  it('the counter survives a save round trip and a corrupt value is harmless', () => {
    const save = stocked('gilded_warblade', 12);
    expect(statsOf(normalizeSave(JSON.parse(JSON.stringify(save)))).forgePity).toBe(12);
    const bad = JSON.parse(JSON.stringify(save));
    bad.stats.forgePity = 'lots';
    expect(statsOf(normalizeSave(bad)).forgePity).toBe(0);
    bad.stats.forgePity = -5;
    expect(statsOf(normalizeSave(bad)).forgePity).toBe(0);
  });
});
