// What the EQUIPMENT alone gives each class on the axes, tier by tier, all six tiers (phase 8): the heroes carry no rotation and no affinity (HeroMode 'gear'), so the numbers are the stats of the weapon and the five pieces
// (and the returned stats of the generator, with the RETURN_SCALE dial on top). If the lead of the archer (or the mage) comes out IRREGULAR from tier to tier, the cause is in the generator's per-tier solutions, not
// in a structural tier effect, and the fix is to make the generator aim at one axis result per tier; a clean curve would justify a per-tier dial.
//   npx vitest run --config vitest.sim.config.ts gearOnlyLead --silent=false --reporter=default
import { it } from 'vitest';
import { axisLeads } from './classAxes';

const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
it('prints the equipment-only leads by tier', () => {
  const out = ['| tier (nível, refino) | Caça g/a/m | Chefe g/a/m |', '| --- | --- | --- |'];
  const zones: Record<number, [string, number]> = { 1: ['demon_glade', 5], 2: ['blood_marsh', 5], 3: ['demon_rift', 5], 4: ['blood_abyss', 5], 5: ['blood_abyss', 5], 6: ['blood_abyss', 5] };
  for (const [tier, level] of [[1, 10], [2, 20], [3, 40], [4, 62], [5, 75], [6, 100]] as [number, number][]) {
    for (const refine of [0, 8]) {
      const l = axisLeads(tier, level, refine, zones[tier][0], zones[tier][1], 'gear');
      out.push(`| T${tier} (${level}, +${refine}) | ${l.hunting.map(pct).join(' / ')} | ${l.boss.map(pct).join(' / ')} |`);
    }
  }
  console.log(out.join(String.fromCharCode(10)));
}, 600_000);
