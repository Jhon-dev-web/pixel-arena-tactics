// WHAT EACH CLASS PAYS TO CLOSE ITS SET THROUGH TIER 3, IN HOURS OF ACTIVITY (measurement only: prints, asserts nothing). Static, no simulated player: for the five armor-slot pieces and the weapon of each class line, each tier's OWN materials
// (the previous-tier piece it eats was paid at its own stage) expanded to raw units, then Mining / Woodcutting / Hunting hours at the stage of the tier (setCost.ts, farmHours.ts rates) and, for the mage, the Garden:
// fibres, plantings (one per plot per visit: the yield of a plot is bound by the visits, not by the growth time) and the days that takes with 6 plots and 2 visits a day.
// Run: npx vitest run --config vitest.sim.config.ts tierCost --silent=false --reporter=default
import { expect, it } from 'vitest';
import { CLOTH_LINES, LEATHER_LINES, WEAPON_LINES, getGear } from '../../src/game/gear';
import { PLANTS } from '../../src/game/garden';
import { ORE_TIERS } from '../../src/game/ores';
import { WOOD_TIERS } from '../../src/game/woodcutting';
import { bundleHours } from '../sim/farmHours';
import { chainNeed, gatherPowerAt, isHuntMat, SET_SLOTS, addNeed, Need } from '../sim/setCost';
const own = (tpl: string) => { const r = getGear(tpl)?.recipe; return r ? { ...r, items: {} } : undefined; };
const reqLevel = (m: string): number => ORE_TIERS.find((o) => o.id === m)?.requiredLevel ?? WOOD_TIERS.find((w) => w.id === m)?.requiredLevel ?? 1;
const SLOTS = ['armor', 'helmet', 'gloves', 'boots', 'shield'];
const lines: Record<string, Record<string, string[]>> = { warrior: { weapon: SET_SLOTS.weapon }, archer: { weapon: WEAPON_LINES[0].ids }, mage: { weapon: WEAPON_LINES[2].ids } };
for (const s of SLOTS) {
  lines.warrior[s] = SET_SLOTS[s];
  lines.archer[s] = LEATHER_LINES.find((l) => l.slot === s)!.ids;
  lines.mage[s] = CLOTH_LINES.find((l) => l.slot === s)!.ids;
}
it('tier cost', () => {
  const out: string[] = ['| classe | tier | pecas | minerar h | lenha h | cacar h | fibras | plantios | canteiro-h | dias de Horta (6 canteiros, 2 visitas) |', '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|'];
  for (const cls of ['warrior', 'archer', 'mage']) {
    const cum = { mine: 0, wood: 0, hunt: 0, fib: 0, plant: 0, ph: 0 };
    for (let t = 1; t <= 3; t++) {
      const need: Need = {};
      for (const s of Object.keys(lines[cls])) addNeed(need, chainNeed(lines[cls][s][t - 1], own, {}));
      let mine = 0, wood = 0, fib = 0, plant = 0, ph = 0;
      const hunt: Need = {};
      for (const [m, n] of Object.entries(need) as [string, number][]) {
        if (PLANTS.some((x) => x.material === m)) { /* garden */ }
        else if (isHuntMat(m)) hunt[m] = n;
        else if (ORE_TIERS.some((o) => o.id === m)) mine += n / gatherPowerAt(reqLevel(m));
        else if (WOOD_TIERS.some((w) => w.id === m)) wood += n / gatherPowerAt(reqLevel(m));
        const p = PLANTS.find((x) => x.material === m);
        if (p) { fib += n; plant += n / p.qty; ph += (n / p.qty) * (p.durationMs / 3600000); }
      }
      const h = bundleHours(hunt, t);
      cum.mine += mine; cum.wood += wood; cum.hunt += h; cum.fib += fib; cum.plant += plant; cum.ph += ph;
      out.push(`| ${cls} | T${t} | own | ${mine.toFixed(1)} | ${wood.toFixed(1)} | ${h.toFixed(1)} | ${fib} | ${plant.toFixed(0)} | ${ph.toFixed(0)} | ${(plant / 12).toFixed(1)} |`);
    }
    out.push(`| ${cls} | T1-3 | soma | ${cum.mine.toFixed(1)} | ${cum.wood.toFixed(1)} | ${cum.hunt.toFixed(1)} | ${cum.fib} | ${cum.plant.toFixed(0)} | ${cum.ph.toFixed(0)} | ${(cum.plant / 12).toFixed(1)} |`);
  }
  console.log(out.join('\n'));
  expect(true).toBe(true);
});
