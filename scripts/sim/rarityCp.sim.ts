// What a rarity is worth in combat power (Rodada 24, docs/BALANCE_CHANGES.md): a full seven-piece set of tier 4 / 5 / 6 at +0 / +8 / +12, every piece of the same rarity with the median
// substats of its tier (rarityHero.ts), measured with computeCP, and the Hunting sub-level its EQUIPMENT INDEX opens in the abyss's deep depth (the gate of huntingZones.ts subLevelGearRequired, an index since 28/10).
// Run it with `npm run sim:rarity`; it asserts nothing.
// Env: SIM_RARITY (JSON, {"epic":{"statMult":1.1,"substatMult":1.2}, ...}) tries a rarity table without editing it, SIM_ZONES the same for a zone.
import { it } from 'vitest';
import { computeCP } from '../../src/game/engine';
import { HUNTING_ZONES, getHuntingZone, subLevelGearRequired } from '../../src/game/huntingZones';
import { equipmentIndex } from '../../src/game/gearIndex';
import type { SaveData } from '../../src/game/engine';
import { RARITIES } from '../../src/game/rarity';
import T from '../../src/game/tunables';
import { rarityHero } from './rarityHero';

if (process.env.SIM_RARITY) {
  for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_RARITY) as Record<string, Record<string, number>>)) Object.assign(RARITIES.find((r) => r.id === id)!, over);
}
if (process.env.SIM_ZONES) {
  for (const [id, over] of Object.entries(JSON.parse(process.env.SIM_ZONES) as Record<string, Record<string, number>>)) Object.assign(HUNTING_ZONES.find((z) => z.id === id)!, over);
}

const reach = (hero: SaveData): number => {
  const zone = getHuntingZone('blood_abyss')!;
  let n = 1;
  while (n < T.hunting.subLevels && equipmentIndex(hero) >= subLevelGearRequired(zone, 'deep', n + 1)) n++;
  return n;
};

it('prints the CP of a rarity', () => {
  const lines = ['| set | ' + RARITIES.map((r) => `${r.id} CP (x common) [sub-level]`).join(' | ') + ' |', '| --- | ' + RARITIES.map(() => '---').join(' | ') + ' |'];
  for (const [tier, level, refines] of [[4, 62, [0, 8]], [5, 75, [0, 8, 12]], [6, 90, [0, 8, 12]]] as [number, number, number[]][]) {
    for (const refine of refines) {
      const heroes = RARITIES.map((r) => rarityHero(level, tier, refine, r.id));
      const cps = heroes.map((h) => computeCP(h));
      lines.push(`| T${tier} +${refine} | ${cps.map((cp, i) => `${Math.round(cp)} (${(cp / cps[0]).toFixed(3)}) [${reach(heroes[i])}]`).join(' | ')} |`);
    }
  }
  const t = RARITIES.map((r) => `${r.id}: statMult ${r.statMult}, substatMult ${r.substatMult}, ${r.substatCount} substats`).join('; ');
  console.log(`${t}\n${lines.join('\n')}`);
}, 600_000);
