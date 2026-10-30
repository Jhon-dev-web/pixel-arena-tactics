import { describe, expect, it } from 'vitest';
import { computeHuntingStatus, defaultSave } from '../engine';
import { requestHuntStart } from '../huntLifecycle';
import { slotsForQty } from '../inventory';
import { GEAR, getGear, refineHuntMaterials, upgradeCost } from '../gear';
import { MATERIALS } from '../materials';
import { STASH_UPGRADES } from '../stash';
import { setHours, setNeed } from '../../../scripts/sim/setCost';
import { setHoursOwn } from '../../../scripts/sim/farmHours';
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
      // Round 17: the hunting hours are the tier's own pieces at the tier's stage (farmHours.ts); setHours re-prices the old tiers' pieces at the last zone's rates, which the cut zones no longer match
      const hunt = setHoursOwn(t);
      expect(hunt / gather, `tier ${t}: hunt ${hunt.toFixed(1)} h, mine+wood ${gather.toFixed(1)} h`).toBeGreaterThan(0.25);
      expect(hunt / gather, `tier ${t}`).toBeLessThan(3.5);
    }
  });

  it('B2: the set needs every Hunting material the zones drop, in the tier it belongs to', () => {
    expect(setNeed(1).leather_scrap).toBeGreaterThan(50);
    expect(setNeed(3).bone_fragment).toBeGreaterThan(0);
    expect(setNeed(6).abyssal_marrow).toBeGreaterThan(0);
    expect(setNeed(6).blood_heart).toBeGreaterThan(0);
  });

  it('B3: the first 4 h hunt of a brand-new hero pays the first pieces and fills at most 8 of the 26 slots', () => {
    const START = new Date(2026, 5, 1, 9, 0, 0).getTime();
    const s0 = { ...defaultSave(), huntingOfflineStart: START };
    const s1 = requestHuntStart(s0, 'demon_glade', 'shallow', START)!;
    const st = withSeededRandom(4242, () => computeHuntingStatus(s1, START + 4 * HOUR));
    const drops = st.drops as Record<string, number>;
    const slots = Object.values(drops).reduce((a, q) => a + slotsForQty(q), 0);
    // THE RULE: a new hero's first hunt must not clog his bag (a third of the 26 slots at most, so he can still pick up the first pieces, the potions and the next gathering). It was 6, the exact size of the first session (couro 2 slots + claw,
    // sinew, core, feather) with no headroom at all. On 30/10 the owner decided to drip flax and cotton into the glade for the mage (huntingZones.ts, both rare and on the class stream): any session may now bring one pile of each, +2 slots, hence 8.
    // 8 of 26 still keeps the rule (the first session fills under a third of the bag); this is a deliberate product change, NOT a loosening to make a failing number pass. Raising the number again needs another product reason.
    expect(slots).toBeLessThanOrEqual(8);
    // the first craft of the policy is the dagger: its leather comes from the scrap of that first session
    const dagger = getGear('bronze_dagger').recipe!.materials!;
    expect((drops.leather_scrap ?? 0) / 3).toBeGreaterThanOrEqual(dagger.leather as number);
    // ... and the first session leaves room for more than one piece of the tier 1 set
    expect(drops.leather_scrap ?? 0).toBeGreaterThanOrEqual(setNeed(1).leather_scrap! * 0.6);
  });
});
