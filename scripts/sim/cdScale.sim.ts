// The measurement that justified abilities.ts abilityCdScale (phase 8), kept as a tool and corrected for the scale being in the game now: scale every equipment-ability cooldown by the class-neutral attack interval of the
// hero (the interval his AGI alone gives) over the one of a level 100 hero, so a cooldown is a constant number of AVERAGE swings instead of a constant number of ms. It prints the axes with the scale CANCELLED (the cooldowns
// fixed in ms, the way the game was before 28/10) and with the game's own scale. The game applies the scale inside fireAbility (CombatStats.cdScale), so the 'fixed' rows divide the tunables by it and the 'scaled' rows
// leave them alone. In memory only. Every row pins the Hunting sub-level at 5 (classAxes.test.ts pins 7 at tier 6, so that row is not the same number as the guard's).
//   npx vitest run --config vitest.sim.config.ts cdScale --silent=false --reporter=default
import { it } from 'vitest';
import { abilityCdScale } from '../../src/game/abilities';
import T from '../../src/game/tunables';
import { axisLeads } from './classAxes';

const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const abil = T.abilities as unknown as Record<string, number>;
const keys = Object.keys(abil).filter((k) => k.endsWith('CdMs'));
const base = Object.fromEntries(keys.map((k) => [k, abil[k]]));

it('prints the axes with and without the scaled cooldowns', () => {
  const out = ['| tier | cooldowns | Caça g/a/m | Chefe g/a/m | fator dos cooldowns |', '| --- | --- | --- | --- | --: |'];
  for (const [label, tier, level, refine, zone] of [['T2 +4', 2, 20, 4, 'blood_marsh'], ['T3 +8', 3, 45, 8, 'demon_rift'], ['T4 +8', 4, 62, 8, 'blood_abyss'], ['T6 +8', 6, 100, 8, 'blood_abyss']] as [string, number, number, number, string][]) {
    const f = abilityCdScale(level);
    for (const scaled of [false, true]) {
      for (const k of keys) abil[k] = scaled ? base[k] : Math.round(base[k] / f);
      const l = axisLeads(tier, level, refine, zone, 5);
      out.push(`| ${label} | ${scaled ? 'escalados (o jogo)' : 'fixos em ms (antes)'} | ${l.hunting.map(pct).join(' / ')} | ${l.boss.map(pct).join(' / ')} | ${f.toFixed(2)} |`);
    }
  }
  for (const k of keys) abil[k] = base[k];
  console.log(out.join(String.fromCharCode(10)));
}, 600_000);
