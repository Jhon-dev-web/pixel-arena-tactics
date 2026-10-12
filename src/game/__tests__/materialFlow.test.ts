import { describe, expect, it } from 'vitest';
import { computeHuntingStatus, defaultSave } from '../engine';
import { requestHuntStart } from '../huntLifecycle';
import { slotsForQty } from '../inventory';
import { GEAR, getGear, refineHuntMaterials, upgradeCost } from '../gear';
import { MATERIALS } from '../materials';
import { STASH_UPGRADES } from '../stash';
import { setHours, setNeed } from '../../../scripts/sim/setCost';
import { withSeededRandom } from '../../../scripts/sim/driver';

const HOUR = 3600 * 1000;
const IDS = new Set(MATERIALS.map((m) => m.id as string));

describe('Rodada 9: material flow', () => {
  it('every recipe, stash upgrade and refine step references materials that exist', () => {
    for (const g of GEAR) for (const m of Object.keys(g.recipe?.materials ?? {})) expect(IDS.has(m), `${g.id}: ${m}`).toBe(true);
    for (const u of STASH_UPGRADES) for (const m of Object.keys(u.materials)) expect(IDS.has(m), `stash: ${m}`).toBe(true);
    for (let tier = 1; tier <= 6; tier++) for (let level = 0; level <= 7; level++) for (const m of Object.keys(refineHuntMaterials(tier, level))) expect(IDS.has(m), `refine ${tier}/${level}: ${m}`).toBe(true);
  });

  it('refine +4 and up asks for the Hunting materials of the piece tier, and nothing below +4', () => {
    for (const tier of [1, 3, 5, 6]) {
      const item = GEAR.find((g) => g.tier === tier && g.slot === 'helmet')!;
      expect(Object.keys(upgradeCost(item, 2).materials ?? {})).toHaveLength(0);
      const mid = upgradeCost(item, 4).materials ?? {};
      const high = upgradeCost(item, 7).materials ?? {};
      expect(Object.keys(mid).length).toBeGreaterThanOrEqual(2); // tier material + the common one (+ dust)
      expect(Object.keys(high).length).toBeGreaterThan(Object.keys(mid).length);
    }
  });

  it('B2: a full same-tier set takes the intended hours of hunting, and tiers keep growing', () => {
    const hours = [1, 2, 3, 4, 5, 6].map((t) => setHours(t).hunt);
    const bounds: [number, number][] = [[1.5, 3], [4, 8], [10, 20], [20, 40], [28, 60], [36, 80]];
    hours.forEach((h, i) => {
      expect(h, `tier ${i + 1}: ${h.toFixed(1)} h`).toBeGreaterThanOrEqual(bounds[i][0]);
      expect(h, `tier ${i + 1}: ${h.toFixed(1)} h`).toBeLessThanOrEqual(bounds[i][1]);
    });
    for (let i = 1; i < hours.length; i++) expect(hours[i]).toBeGreaterThan(hours[i - 1]);
  });

  it('B2: hunting is never the whole game nor negligible next to mining and woodcutting', () => {
    for (let t = 1; t <= 6; t++) {
      const h = setHours(t);
      const gather = h.mine + h.wood;
      expect(h.hunt / gather, `tier ${t}: hunt ${h.hunt.toFixed(1)} h, mine+wood ${gather.toFixed(1)} h`).toBeGreaterThan(0.25);
      expect(h.hunt / gather, `tier ${t}`).toBeLessThan(3);
    }
  });

  it('B2: the set needs every Hunting material the zones drop, in the tier it belongs to', () => {
    expect(setNeed(1).leather_scrap).toBeGreaterThan(50);
    expect(setNeed(3).bone_fragment).toBeGreaterThan(0);
    expect(setNeed(6).abyssal_marrow).toBeGreaterThan(0);
    expect(setNeed(6).blood_heart).toBeGreaterThan(0);
  });

  it('B3: the first 4 h hunt of a brand-new hero pays the first pieces and fills at most 6 of the 26 slots', () => {
    const START = new Date(2026, 5, 1, 9, 0, 0).getTime();
    const s0 = { ...defaultSave(), huntingOfflineStart: START };
    const s1 = requestHuntStart(s0, 'demon_glade', 'shallow', START)!;
    const st = withSeededRandom(4242, () => computeHuntingStatus(s1, START + 4 * HOUR));
    const drops = st.drops as Record<string, number>;
    const slots = Object.values(drops).reduce((a, q) => a + slotsForQty(q), 0);
    expect(slots).toBeLessThanOrEqual(6);
    // the first craft of the policy is the dagger: its leather comes from the scrap of that first session
    const dagger = getGear('bronze_dagger').recipe!.materials!;
    expect((drops.leather_scrap ?? 0) / 3).toBeGreaterThanOrEqual(dagger.leather as number);
    // ... and the first session leaves room for more than one piece of the tier 1 set
    expect(drops.leather_scrap ?? 0).toBeGreaterThanOrEqual(setNeed(1).leather_scrap! * 0.6);
  });
});
