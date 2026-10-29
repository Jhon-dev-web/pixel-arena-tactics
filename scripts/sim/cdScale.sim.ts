// Candidate fix for the ability share that grows when the tier falls (phase 8): scale every equipment-ability cooldown by the class-neutral attack interval of the hero (the interval his AGI alone gives, no weapon or
// armor speed) over the one of a level 100 hero, so a cooldown is a constant number of AVERAGE swings instead of a constant number of ms. Tier 6 (level 100) is unchanged by construction. In memory only.
//   npx vitest run --config vitest.sim.config.ts cdScale --silent=false --reporter=default
import { it } from 'vitest';
import { heroAttackIntervalMs } from '../../src/game/derivedStats';
import T from '../../src/game/tunables';
import { axisLeads } from './classAxes';
import { classHero, CLASS_MAIN } from './classHero';
import { buildCombatStats } from '../../src/game/engine';

const pct = (x: number): string => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
const abil = T.abilities as unknown as Record<string, number>;
const keys = Object.keys(abil).filter((k) => k.endsWith('CdMs'));
const base = Object.fromEntries(keys.map((k) => [k, abil[k]]));
const agiOf = (level: number, tier: number): number => buildCombatStats(classHero(CLASS_MAIN[0], level, tier, 8, 'real')).agi ?? 0;

it('prints the axes with and without the scaled cooldowns', () => {
  const ref = heroAttackIntervalMs(agiOf(100, 6), 0);
  const out = ['| tier | cooldowns | Caça g/a/m | Chefe g/a/m | fator dos cooldowns |', '| --- | --- | --- | --- | --: |'];
  for (const [label, tier, level, refine, zone] of [['T2 +4', 2, 20, 4, 'blood_marsh'], ['T3 +8', 3, 45, 8, 'demon_rift'], ['T4 +8', 4, 62, 8, 'blood_abyss'], ['T6 +8', 6, 100, 8, 'blood_abyss']] as [string, number, number, number, string][]) {
    const f = heroAttackIntervalMs(agiOf(level, tier), 0) / ref;
    for (const scaled of [false, true]) {
      for (const k of keys) abil[k] = scaled ? Math.round(base[k] * f) : base[k];
      const l = axisLeads(tier, level, refine, zone, 5);
      out.push(`| ${label} | ${scaled ? 'escalados' : 'fixos (hoje)'} | ${l.hunting.map(pct).join(' / ')} | ${l.boss.map(pct).join(' / ')} | ${scaled ? f.toFixed(2) : '1'} |`);
    }
  }
  for (const k of keys) abil[k] = base[k];
  console.log(out.join(String.fromCharCode(10)));
}, 600_000);
