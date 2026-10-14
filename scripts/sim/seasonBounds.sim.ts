// `npm run season:bounds`: prints every bound of the season plausibility audit (supabase/functions/_shared/progress/bounds.ts) with where it comes from and the value
// recomputed from the game's tunables. The constants must stay >= the recomputed theoretical values; the test src/game/__tests__/seasonProgress.test.ts enforces it.
import { describe, it } from 'vitest';
import { BOUNDS, PACE_FLAG_FACTOR, REJECT_FACTOR, professionXpPerHour } from '../../supabase/functions/_shared/progress/bounds';
import { deriveBounds } from './seasonBoundsDerive';

describe('season bounds report', () => {
  it('prints the table', () => {
    const d = deriveBounds();
    const lines: string[] = [];
    const row = (name: string, constant: number | string, derived: string, source: string) => lines.push(`${name.padEnd(26)} ${String(constant).padStart(10)}  recomputed: ${derived.padEnd(34)} ${source}`);
    lines.push('', 'SEASON PLAUSIBILITY BOUNDS (flag at the value, reject at REJECT_FACTOR x the value; pace entries flag at PACE_FLAG_FACTOR x the fastest seed)');
    lines.push(`REJECT_FACTOR = ${REJECT_FACTOR}   PACE_FLAG_FACTOR = ${PACE_FLAG_FACTOR}`, '');
    row('xpPerHour', BOUNDS.xpPerHour, `${Math.round(d.xpPerHour)} (hunt ${Math.round(d.huntPerHour)} + orders ${Math.round(d.ordersPerHour)} + dungeon ${Math.round(d.dungeonPerHour)})`, 'tunables + huntingZones + dungeon.ts');
    const r2 = (n: number) => Math.round(n * 100) / 100;
    row('gatherYieldFactor', BOUNDS.gatherYieldFactor, d.gatherYield.toFixed(3), 'Pass x mastery x Coletor/Brew/Prospector');
    row('mining xp/h at lvl 75', r2(professionXpPerHour('mining', 75)), d.miningPerHour.toFixed(2), 'tunables skills + mining');
    row('woodcutting xp/h lvl 75', r2(professionXpPerHour('woodcutting', 75)), d.woodcuttingPerHour.toFixed(2), 'tunables skills + woodcutting');
    row('gardening xp/h at lvl 40', r2(professionXpPerHour('gardening', 40)), d.gardeningPerHour.toFixed(2), 'garden.ts + tunables tonics / mastery');
    row('gardenLongestPlantXp', BOUNDS.gardenLongestPlantXp, String(d.longestPlantXp), 'garden.ts PLANTS');
    row('burstHours', BOUNDS.burstHours, `${d.capHours} (battlePass.capHours)`, 'tunables battlePass.capHours');
    row('paceSlackDays', BOUNDS.paceSlackDays, `${(BOUNDS.burstHours / 24).toFixed(2)} (burstHours / 24)`, 'derived');
    row('dungeonRunsPerDay', BOUNDS.dungeonRunsPerDay, `${d.runsPerDay} (free sessions + 10 bought)`, 'tunables dungeon.freeSessionsPerDay');
    row('killsPerHour', BOUNDS.killsPerHour, '-', 'attributes.ts attack interval floor');
    row('goldPerHour', BOUNDS.goldPerHour, '-', 'generous, flag-level');
    row('dungeonFloorsPerDay', BOUNDS.dungeonFloorsPerDay, `${d.runsPerDay * 140} (runs x 140)`, 'derived');
    row('bossesPerDay', BOUNDS.bossesPerDay, `${d.runsPerDay * 10} (runs x 10)`, 'derived');
    row('uniquesPerDay', BOUNDS.uniquesPerDay, '-', 'uniques.ts boss rolls');
    row('achievementsPerDay', BOUNDS.achievementsPerDay, '-', 'quests.ts');
    row('secondsRatio / slack', `${BOUNDS.secondsRatio}/${BOUNDS.secondsSlack}`, '-', 'the server clock');
    row('depthPerDayFastest', BOUNDS.depthPerDayFastest, '-', 'docs/BALANCE_BASELINE.md Cenario P');
    lines.push('', 'levelPace [level position, day the fastest seed reached it]:', '  ' + BOUNDS.levelPace.map(([a, b]) => `${a}:${b}`).join('  '));
    lines.push('floorPace [floor, day]:', '  ' + BOUNDS.floorPace.map(([a, b]) => `${a}:${b}`).join('  '));
    lines.push('floorCapByLevel [hero level, highest floor]:', '  ' + BOUNDS.floorCapByLevel.map(([a, b]) => `${a}:${b}`).join('  '), '');
    lines.push(`Sources and the reasoning for every entry are the comments in supabase/functions/_shared/progress/bounds.ts.`);
    console.log(lines.join('\n'));
  });
});
