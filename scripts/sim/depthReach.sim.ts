// How deep a hero gets in the Profundezas (docs/BALANCE_CHANGES.md Rodada 14). A depth is "cleared" when a hero that starts there at full HP, with no potions,
// beats it (2 of 3 seeded runs); the reach is the last depth of an unbroken run of cleared depths, so a boss depth that the hero cannot kill is a wall.
// Heroes: level 100, tier-6 gear at +8 in every slot (as the ladder builds it) with common, epic or legendary pieces (median substats), a Warrior skill build, the sim's
// attribute split, and 0 to 50 paragon levels. DEPTH_HP / DEPTH_DMG / DEPTH_BOSS_HP / DEPTH_BOSS_DMG / PARAGON_DMG / PARAGON_MAX override the tunables for a what-if.
// Run: npm run sim:depths
import { it } from 'vitest';
import { computeCP } from '../../src/game/engine';
import { depthScale, stageOfDepth } from '../../src/game/dungeon';
import { recommendedCpForDepth } from '../../src/game/depths';
import { Rarity } from '../../src/game/rarity';
import { depthReach, gearHero } from './depthHero';
import T from '../../src/game/tunables';

if (process.env.DEPTH_HP) (T.depths as { hpGrowth: number }).hpGrowth = Number(process.env.DEPTH_HP);
if (process.env.DEPTH_BOSS_HP) (T.depths as { bossHpMult: number }).bossHpMult = Number(process.env.DEPTH_BOSS_HP);
if (process.env.DEPTH_BOSS_DMG) (T.depths as { bossDmgMult: number }).bossDmgMult = Number(process.env.DEPTH_BOSS_DMG);
if (process.env.PARAGON_DMG) (T.paragon as { damagePerLevel: number }).damagePerLevel = Number(process.env.PARAGON_DMG);
if (process.env.PARAGON_MAX) (T.paragon as { maxBonus: number }).maxBonus = Number(process.env.PARAGON_MAX);
if (process.env.DEPTH_BASE_HP) (T.depths as { baseHpMult: number }).baseHpMult = Number(process.env.DEPTH_BASE_HP);
if (process.env.DEPTH_BASE_DMG) (T.depths as { baseDmgMult: number }).baseDmgMult = Number(process.env.DEPTH_BASE_DMG);
if (process.env.DEPTH_DMG) (T.depths as { dmgGrowth: number }).dmgGrowth = Number(process.env.DEPTH_DMG);

it('prints the depth reach of end-game heroes', () => {
  const cases: [string, Rarity, number, number][] = [
    ...[0, 10, 20, 30, 40, 50].map((p): [string, Rarity, number, number] => [`common T6+8, paragon ${p}`, 'common', p, 8]),
    ...[0, 20, 50].map((p): [string, Rarity, number, number] => [`epic T6+8, paragon ${p}`, 'epic', p, 8]),
    ...[0, 10, 20, 30, 40, 50].map((p): [string, Rarity, number, number] => [`legendary T6+8, paragon ${p}`, 'legendary', p, 8]),
    // Round 17: the refinement past +8 (6% of the base stat a level): what +10 and +12 are worth in depths
    ...[0, 10, 30, 50].map((p): [string, Rarity, number, number] => [`common T6+12, paragon ${p}`, 'common', p, 12]),
    ...[0, 10, 30, 50].map((p): [string, Rarity, number, number] => [`legendary T6+10, paragon ${p}`, 'legendary', p, 10]),
    ...[0, 10, 30, 40, 50].map((p): [string, Rarity, number, number] => [`legendary T6+12, paragon ${p}`, 'legendary', p, 12]),
  ];
  const lines: string[] = [];
  lines.push(`T.depths hp ${T.depths.hpGrowth} dmg ${T.depths.dmgGrowth} boss x${T.depths.bossHpMult}/x${T.depths.bossDmgMult}; paragon ${T.paragon.damagePerLevel}/level cap ${T.paragon.maxBonus}`, 'hero | CP (gear only) | depth (gear only) | CP (rotation) | depth (rotation) | recommended CP at the rotation depth + 1');
  for (const [label, rarity, paragon, refine] of cases) {
    const hero = gearHero(rarity, paragon, refine);
    const reach = depthReach(hero);
    // the same hero as a real player: the automatic rotation on (the class affinity stays off here, it is measured with the classes)
    const real = gearHero(rarity, paragon, refine, 'rotation');
    const realReach = depthReach(real);
    lines.push(`${label} | ${computeCP(hero)} | ${reach} | ${computeCP(real)} | ${realReach} | ${recommendedCpForDepth(realReach + 1)}`);
  }
  const s = depthScale(stageOfDepth(50));
  lines.push(`depth 50 multipliers: hp x${s.hp.toFixed(2)} dmg x${s.dmg.toFixed(2)}`);
  console.log(lines.join('\n'));
});
