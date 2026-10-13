// Round 17: what the late game costs in HOURS of hunting, so a change in what the zones drop can be checked against "the time to a piece must not move".
// Run: npm run sim:cost. It asserts nothing (src/game/__tests__/round17.test.ts keeps the numbers); the model is scripts/sim/farmHours.ts.
import { it } from 'vitest';
import { upgradeChance } from '../../src/game/gear';
import { deepToTwelve, lapidarHours, refineToEight, setHoursOwn, tierOwnHours, zoneValue } from './farmHours';

it('prints the cost of the late game in hours of hunting', () => {
  const lines: string[] = [];
  const f = (x: number, d = 1) => x.toFixed(d);
  lines.push('== hours of hunting by tier (own pieces at the tier stage), sets');
  for (let t = 3; t <= 6; t++) lines.push(`tier ${t}: own ${f(tierOwnHours(t))} h, set through tier ${t}: ${f(setHoursOwn(t))} h`);
  lines.push('== refine +0 -> +8, expected hours of the hunting materials');
  for (const t of [4, 5, 6]) lines.push(`tier ${t}: ${f(refineToEight(t), 2)} h`);
  lines.push('== deep refine (per attempt hours at +8, +9, +10, +11; expected hours and attempts from +8 to +12)');
  for (const t of [5, 6]) {
    const d = deepToTwelve(t);
    lines.push(`tier ${t}: per attempt ${d.perAttempt.map((x) => f(x, 2)).join(' / ')}; +8 -> +12 ${f(d.hours)} h in ${f(d.attempts)} attempts; +8 -> +9 ${f(d.perAttempt[0] / upgradeChance(8), 2)} h`);
  }
  lines.push('== Lapidar, tier 6, hours of the bundle (first, after 4, after 12) and tier 5 first');
  lines.push(`tier 6: ${f(lapidarHours(6, 0), 2)} / ${f(lapidarHours(6, 4), 2)} / ${f(lapidarHours(6, 12), 2)}; tier 5 first: ${f(lapidarHours(5, 0), 2)}`);
  lines.push('== the late zones: units per hour, reference value per hour, merchant Gold per hour (continuous = zone Gold + 15% of the reference; real = the floors the merchant pays)');
  for (const id of ['demon_rift', 'blood_abyss']) {
    const v = zoneValue(id);
    lines.push(`${id}: ${Object.entries(v.perHour).map(([m, n]) => `${m} ${f(n, 2)}`).join(', ')} | reference ${f(v.reference, 0)} | merchant ${f(v.merchantContinuous, 1)} (real ${f(v.merchantReal, 1)})`);
  }
  console.log(lines.join('\n'));
});
