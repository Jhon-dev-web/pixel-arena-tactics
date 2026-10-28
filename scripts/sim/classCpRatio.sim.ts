// CP of the three classes on the same equipment ladder, under three readings of the hero: gear only (no rotation, no affinity), with the rotation, and real (rotation + affinity). The Hunting sub-level gate reads the REAL
// one. It measures; it changes nothing. npx vitest run --config vitest.sim.config.ts classCpRatio --silent=false --reporter=default
import { it } from 'vitest';
import { computeCP } from '../../src/game/engine';
import { Rarity } from '../../src/game/rarity';
import { HeroMode } from './duel';
import { spendSkillPoints } from './driver';
import { CLASS_MAIN, classHero } from './classHero';

it('prints the CP ratios of the classes', () => {
  const rows: string[] = ['| equipamento | leitura | guerreiro | arqueiro (razão) | mago (razão) |', '| --- | --- | --: | --: | --: |'];
  const spread: Record<string, number[]> = { gear: [], rotation: [], real: [] };
  for (const [tier, level, refine] of [[2, 20, 4], [3, 45, 8], [4, 62, 8], [5, 75, 8], [5, 75, 12], [6, 90, 8], [6, 90, 12]] as [number, number, number][])
    for (const rarity of ['common', 'epic', 'legendary'] as Rarity[]) {
      if (rarity !== 'common' && tier < 4) continue;
      for (const mode of ['gear', 'rotation', 'real'] as HeroMode[]) {
        const cps = CLASS_MAIN.map((b) => computeCP(spendSkillPoints(classHero(b, level, tier, refine, mode, 100, rarity), 'warrior')));
        spread[mode].push(cps[1] / cps[0], cps[2] / cps[0]);
        rows.push(`| T${tier}+${refine} ${rarity} | ${mode} | ${Math.round(cps[0])} | ${Math.round(cps[1])} (${(cps[1] / cps[0]).toFixed(3)}) | ${Math.round(cps[2])} (${(cps[2] / cps[0]).toFixed(3)}) |`);
      }
    }
  rows.push('', ...Object.entries(spread).map(([m, v]) => `${m}: razão contra o guerreiro entre ${Math.min(...v).toFixed(3)} e ${Math.max(...v).toFixed(3)}`));
  console.log(rows.join(String.fromCharCode(10)));
});
