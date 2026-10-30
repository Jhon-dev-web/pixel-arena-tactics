import { describe, expect, it } from 'vitest';
import { HUNTING_ZONES, getHuntingZone } from '../huntingZones';
import { REFINING_RECIPES } from '../refining';
import { buildMaterialTables } from '../../../scripts/sim/materialTablesBuild';
import * as tables from '../../../supabase/functions/_shared/materials/tables';

// The mage's fibre (30/10): the Garden alone left the simulated mage short of a few units of flax and cotton at every craft from day 6 to 19, so a drip of both falls in the first Hunting zone. These
// rules would break in silence (nothing on screen shows them), and each one is a way the change goes wrong.
const FIBRES_OF_THE_FIRST_TIERS = REFINING_RECIPES.filter((r) => r.output === 'cloth_linen' || r.output === 'cloth_cotton').flatMap((r) => Object.keys(r.input));

describe('the mage\'s fibre in Hunting', () => {
  it('every fibre the first two cloth tiers are woven from falls in a zone that opens BEFORE the marsh, on the class stream', () => {
    expect(FIBRES_OF_THE_FIRST_TIERS.sort()).toEqual(['cotton', 'flax']);
    const marsh = getHuntingZone('blood_marsh')!;
    for (const fibre of FIBRES_OF_THE_FIRST_TIERS) {
      // the marsh opens at floor 26, the mage gets there around day 10; the hole is day 6-19, so a drop that starts at the marsh arrives with the hole already closing
      const early = HUNTING_ZONES.filter((z) => z.unlockFloor < marsh.unlockFloor && !z.unlockLevel && z.drops.some((d) => d.material === fibre));
      expect(early.length, fibre).toBeGreaterThan(0);
      for (const z of early) {
        const d = z.drops.find((x) => x.material === fibre)!;
        // classStream: a drop rolled in the zone's shared stream moves the numbers of the older drops of every session in progress
        expect(d.classStream && d.ownStream, `${z.id} ${fibre}`).toBe(true);
      }
    }
  });

  it('the fibre of the later tiers (silk, moonweave, voidsilk) is never dropped: a drop of wild_silk supplied 100 % of the mage\'s silk and the Garden stopped being planted', () => {
    for (const z of HUNTING_ZONES) for (const m of ['wild_silk', 'moonweave', 'voidsilk']) expect(z.drops.some((d) => d.material === m), `${z.id} ${m}`).toBe(false);
  });

  it('it is a drip, not a second Garden: the most an hour Hunting can pay of a fibre is under half of what the six plots can, and the server copy of the ceilings has it', () => {
    const built = buildMaterialTables();
    for (const fibre of FIBRES_OF_THE_FIRST_TIERS) {
      const hunt = Math.max(0, ...Object.values(built.hunt).map((z) => z[fibre] ?? 0));
      const garden = built.garden[fibre].perPlotHour * built.plots;
      expect(hunt / garden, fibre).toBeLessThan(0.5);
      // the Edge Function cannot import the game: without its own hourly ceiling it would cut the first honest claim that carries the fibre
      expect(Math.max(0, ...Object.values(tables.HUNT_CEILING).map((z) => z[fibre] ?? 0)), `${fibre}: the server has no hourly ceiling for the Hunting drop`).toBeGreaterThan(0);
    }
  });
});
