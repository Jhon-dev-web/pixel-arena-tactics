import { describe, expect, it } from 'vitest';
import { buildHuntSession, buildHuntSimSetup } from '../engine';
import { GEAR, getGear } from '../gear';
import { HuntCombatBuild, HuntPotionCfg, HuntZoneCombatCfg, simulateHuntingSession } from '../huntCombat';
import { HUNTING_ZONES, effectiveDropChance, getHuntingZone } from '../huntingZones';
import { economicRollFractionForFight } from '../huntEconomy';
import { estimateHuntYield } from '../huntEstimate';
import { getMaterial, MATERIALS, MaterialId } from '../materials';
import { baseGoldValue } from '../economy';
import { merchantPrice } from '../merchant';
import { usesOf } from '../itemUses';
import T from '../tunables';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { hero } from '../../../scripts/sim/duel';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;

describe('zone materials of the Demon Rift and the Blood Abyss', () => {
  const NEW: Record<string, [MaterialId, MaterialId]> = { demon_rift: ['rift_shard', 'fiend_horn'], blood_abyss: ['abyssal_marrow', 'blood_heart'] };

  it('each late zone keeps its old three drops (the Rift ones untouched, the Abyss ones cut in round 17) and adds an uncommon + a rare of its own', () => {
    const rift = getHuntingZone('demon_rift')!;
    const abyss = getHuntingZone('blood_abyss')!;
    expect(rift.drops.slice(0, 3).map((d) => [d.material, d.rarity, d.chance])).toEqual([['leather_scrap', 'common', 0.32], ['demon_claw', 'uncommon', 0.105], ['demon_core', 'rare', 0.0175]]);
    // Round 17: the Abyss bone, blood and crystal were cut (the Rift three are the Glade family and stay), docs/BALANCE_CHANGES.md
    expect(abyss.drops.slice(0, 3).map((d) => [d.material, d.rarity, d.chance])).toEqual([['bone_fragment', 'common', 0.12], ['concentrated_blood', 'uncommon', 0.036], ['corrupted_crystal', 'rare', 0.0053]]);
    for (const [zid, [unc, rare]] of Object.entries(NEW)) {
      const z = getHuntingZone(zid)!;
      expect(z.drops).toHaveLength(5);
      const u = z.drops.find((d) => d.material === unc)!;
      const r = z.drops.find((d) => d.material === rare)!;
      expect(u.rarity).toBe('uncommon');
      expect(r.rarity).toBe('rare');
      // Round 17 chances (docs/BALANCE_CHANGES.md): the zone's own pair was cut (shard to a quarter, the other three to an eighth of round 16)
      expect({ [unc]: u.chance, [rare]: r.chance }).toEqual(zid === 'demon_rift' ? { rift_shard: 0.025, fiend_horn: 0.0017 } : { abyssal_marrow: 0.0132, blood_heart: 0.0021 });
    }
    expect(getHuntingZone('demon_glade')!.drops).toHaveLength(3);
    expect(getHuntingZone('blood_marsh')!.drops).toHaveLength(3);
  });

  it('the new drops are rolled on their own stream: the old drops, kills, XP and gold of a session are bit-for-bit what they were', () => {
    for (const zid of Object.keys(NEW)) {
      const zone = getHuntingZone(zid)!;
      const h = hero('5', 4, { level: 75 });
      const mk = (drops: typeof zone.drops) => {
        const { build, zoneCfg, potionCfg, timeline } = buildHuntSimSetup(h, { ...zone, drops }, 'dense', buildHuntSession(h, NOW), NOW, []);
        return simulateHuntingSession(build, zoneCfg, { ceiling: 3, promotionWins: 0 }, 5 * HOUR, potionCfg, `${zid}:seed`, { maxLevel: 12, requiredWins: () => 5 }, timeline);
      };
      const full = mk(zone.drops);
      const old = mk(zone.drops.filter((d) => !d.ownStream));
      for (const d of zone.drops.filter((x) => !x.ownStream)) expect(full.drops[d.material], `${zid} ${d.material}`).toBe(old.drops[d.material]);
      expect(full.kills).toBe(old.kills);
      expect(full.xpReady).toBe(old.xpReady);
      expect(full.goldReady).toBe(old.goldReady);
      expect(full.ceilingSubLevel).toBe(old.ceilingSubLevel);
      expect(full.uniques).toEqual(old.uniques);
      // and the new ones really drop
      const [unc, rare] = NEW[zid];
      expect(full.drops[unc] ?? 0).toBeGreaterThan(0);
      void rare;
    }
  });

  it('realised rates over seeded rolls match base chance x depth x economic fraction, for the new and the old drops', () => {
    const build: HuntCombatBuild = { playerMax: 1e9, heroDmgBase: 1000, critChance: 0, critMult: 2, heroMs: 1000, reduction: 0, lifestealPct: 0, burn: false, reflect: 0, hpRegenPct: 0 };
    const noPotions: HuntPotionCfg = { threshold: 0, priority: 'small_first', stock: { greater_elixir: 0, large_hp: 0, small_hp: 0 }, greaterElixirHealPct: 0.5, potionHeal: 50, largePotionHeal: 150, cooldownMs: 5000 };
    for (const zid of Object.keys(NEW)) {
      const zone = getHuntingZone(zid)!;
      for (const depth of ['shallow', 'deep'] as const) {
        const cfg: HuntZoneCombatCfg = { baseEnemyHp: 20_000, baseEnemyDmg: 1, enemyAtkMs: 1000, hpGrowth: 0, dmgGrowth: 0, depthMult: 1, goldPerHour: 0, xpPerHour: 0, drops: zone.drops, depth, dropRateMult: 1 };
        const r = simulateHuntingSession(build, cfg, { ceiling: 1, promotionWins: 0 }, 900 * HOUR, noPotions, `rates:${zid}:${depth}`, { maxLevel: 1, requiredWins: () => 1 });
        const f = economicRollFractionForFight(20_000, 1);
        expect(r.kills).toBeGreaterThan(100_000);
        for (const d of zone.drops) {
          const p = effectiveDropChance(d, depth, 1) * f;
          const expected = r.kills * p;
          const got = r.drops[d.material] ?? 0;
          const sigma = Math.sqrt(r.kills * p * (1 - p));
          expect(Math.abs(got - expected), `${zid}/${depth}/${d.material}: ${got} vs ${expected.toFixed(0)}`).toBeLessThan(5 * sigma + 1);
        }
      }
    }
  });

  it('the hunt estimate, the selection data and the claim order show all five drops', () => {
    const h = hero('5', 4, { level: 75 });
    for (const [zid, [unc, rare]] of Object.entries(NEW)) {
      const e = estimateHuntYield({ ...h, highestDungeonFloor: 90 }, zid, 'shallow')!;
      expect(e.materialsPerHour).toHaveLength(5);
      expect(e.materialsPerHour.map((m) => m.material)).toContain(unc);
      expect(e.materialsPerHour.map((m) => m.material)).toContain(rare);
      const zone = getHuntingZone(zid)!;
      expect(zone.drops.every((d) => getMaterial(d.material)?.iconUrl)).toBe(true);
    }
  });

  it('the new materials have a catalog entry, an icon, an economic value by rarity and zone, and a merchant price by the existing rule', () => {
    const files = new Set(Object.keys(import.meta.glob('/public/assets/icons/*.png')));
    for (const id of ['rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart'] as MaterialId[]) {
      const m = getMaterial(id)!;
      expect(m, id).toBeDefined();
      expect(files.has(`/public${m.iconUrl}`), id).toBe(true);
      expect(baseGoldValue(id)).toBeGreaterThan(0);
      expect(merchantPrice('material', id)).toBe(Math.max(1, Math.floor(T.merchant.priceRate * baseGoldValue(id))));
      expect(typeof (en.materials as Record<string, string>)[m.nameKey]).toBe('string');
      expect(typeof (pt.materials as Record<string, string>)[m.nameKey]).toBe('string');
    }
    // Round 17: the four are worth far more than they were (their drops were cut and the reference value pays the hour back, see round17.test.ts),
    // and the zone's rare is worth several times its uncommon, as it always was
    expect(baseGoldValue('rift_shard')).toBeGreaterThan(baseGoldValue('demon_claw'));
    expect(baseGoldValue('abyssal_marrow')).toBeGreaterThan(baseGoldValue('concentrated_blood'));
    expect(baseGoldValue('fiend_horn') / baseGoldValue('rift_shard')).toBeGreaterThan(4);
    expect(baseGoldValue('blood_heart') / baseGoldValue('abyssal_marrow')).toBeGreaterThan(4);
  });

  it('every new material has real uses: tier 5 recipes take the Rift pair, tier 6 recipes the Abyss pair, every slot, axes and shields included', () => {
    const t5 = GEAR.filter((g) => g.tier === 5 && g.recipe && !g.unique);
    const t6 = GEAR.filter((g) => g.tier === 6 && g.recipe && !g.unique);
    expect(t5.map((g) => g.slot).sort()).toEqual(['armor', 'boots', 'gloves', 'helmet', 'ring', 'shield', 'weapon', 'weapon']);
    expect(t6.map((g) => g.slot).sort()).toEqual(['armor', 'boots', 'gloves', 'helmet', 'ring', 'shield', 'weapon', 'weapon']);
    for (const g of t5) {
      const m = g.recipe!.materials!;
      expect((m.rift_shard ?? 0) + (m.fiend_horn ?? 0), g.id).toBeGreaterThan(0);
      for (const q of [m.rift_shard, m.fiend_horn]) if (q) expect(q).toBeLessThanOrEqual(400);
    }
    for (const g of t6) {
      const m = g.recipe!.materials!;
      expect((m.abyssal_marrow ?? 0) + (m.blood_heart ?? 0), g.id).toBeGreaterThan(0);
      for (const q of [m.abyssal_marrow, m.blood_heart]) if (q) expect(q).toBeLessThanOrEqual(400);
    }
    for (const id of ['rift_shard', 'fiend_horn', 'abyssal_marrow', 'blood_heart'] as MaterialId[]) {
      const uses = usesOf('material', id);
      expect(uses.map((u) => u.kind), id).toContain('forge');
      expect(uses.find((u) => u.kind === 'forge')!.refs.length, id).toBeGreaterThanOrEqual(6);
    }
    // the old tier 5 / 6 inputs are still there (the new ones were added, not swapped in)
    expect(getGear('voidsteel_blade').recipe!.materials).toMatchObject({ refined_obsidian: 1, wood_handle_ancient: 2 });
    expect(getGear('voidsteel_blade').recipe!.materials!.corrupted_crystal).toBeGreaterThan(0);
    expect(getGear('abyssal_bulwark').recipe!.materials).toMatchObject({ refined_obsidian: 2 });
    expect(getGear('abyssal_bulwark').recipe!.materials!.concentrated_blood).toBeGreaterThan(0);
  });

  it('nothing in a recipe or in the drop tables points at an unknown material, and every material still has a use', () => {
    const ids = new Set(MATERIALS.map((m) => m.id as string));
    for (const g of GEAR) for (const m of Object.keys(g.recipe?.materials ?? {})) expect(ids.has(m), `${g.id}: ${m}`).toBe(true);
    for (const z of HUNTING_ZONES) for (const d of z.drops) expect(ids.has(d.material)).toBe(true);
    for (const m of MATERIALS) expect(usesOf('material', m.id).length, m.id).toBeGreaterThan(0);
  });
});
