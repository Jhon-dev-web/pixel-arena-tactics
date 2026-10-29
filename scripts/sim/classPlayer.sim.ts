// The simulated PLAYER (player.ts) playing each of the three classes, and the proof that the hero he ends up with really is that class. Run it with
//   npx vitest run --config vitest.sim.config.ts classPlayer --silent=false --reporter=default
// Env: SIM_DAYS (21), SIM_SEEDS (1). It prints one row per class and weapon line and FAILS if the class bonus is not on at the end of the run: the class of a hero is a reflection of what he wears (affinity.ts), so
// "the sim played an archer" only means something when affinityBonuses(...).classActive is true (five pieces of the weight AND the weapon of the same weight). A policy that drifts back to wearing a plate
// unique on the mage, or to forging a piece of another weight, shows up here as a red row, not as a quiet change of numbers elsewhere.
//
// (classHero.ts / classBalance.sim.ts build STATIC heroes of one tier; this is the player who EARNS the gear day by day: what he forges, wears and hunts for changes with the class.)
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveEquipped } from '../../src/game/gearInstances';
import { CLASS_OF_WEIGHT } from '../../src/game/affinity';
import { mulberry32, withSeededRandom } from './driver';
import { Player, PlayerOptions, SIM_CLASSES, SimWeapon } from './player';

const DAYS = Number(process.env.SIM_DAYS ?? 21);
const SEEDS = Number(process.env.SIM_SEEDS ?? 1);
const START = new Date(2026, 5, 1, 0, 0, 0).getTime();

// Each class with the weapon the policy picks by itself, then each of its two weapon lines pinned.
const CASES: PlayerOptions[] = SIM_CLASSES.flatMap((cls) => {
  const weapons: SimWeapon[] = cls === 'warrior' ? ['sword', 'axe'] : cls === 'archer' ? ['bow', 'crossbow'] : ['staff', 'scepter'];
  return [{ cls }, ...weapons.map((weapon) => ({ cls, weapon }))];
});

describe('the simulated player plays every class', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('ends each run wearing the class bonus', () => {
    const rows: string[] = [];
    const wrong: string[] = [];
    for (const opts of CASES) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        withSeededRandom(seed * 7919 + 13, () => {
          const jitter = mulberry32(seed * 104729 + 7);
          const p = new Player((t) => vi.setSystemTime(t), START, opts);
          for (let d = 0; d < DAYS; d++) p.playDay(d, jitter);
          const a = p.affinity();
          const last = p.snapshots[p.snapshots.length - 1];
          const weapon = resolveEquipped(p.S).weapon.item?.id ?? '-';
          const label = `${opts.cls}${opts.weapon ? ' (' + opts.weapon + ')' : ''}`;
          rows.push(`| ${label} | ${seed} | ${last.day} | ${last.level} | ${Math.round(last.cp)} | ${last.floor} | ${a.weight ?? '-'} ${a.pieces}/5 | ${weapon} | ${a.classActive} | ${JSON.stringify(last.wornTiers)} |`);
          if (!a.classActive || !a.weight || CLASS_OF_WEIGHT[a.weight] !== opts.cls) wrong.push(`${label} seed ${seed}: weight=${a.weight} pieces=${a.pieces} weapon=${a.weapon} classActive=${a.classActive}`);
        });
      }
    }
    console.log(['', '| classe | seed | dia | nível | CP | andar | peso (peças) | arma | bônus de classe ligado | peças vestidas (arma, armadura, luvas, elmo, escudo, botas, anel) |', '| --- | --: | --: | --: | --: | --: | --- | --- | --- | --- |', ...rows, ''].join('\n'));
    expect(wrong, 'the hero did not end up as the class the player committed to').toEqual([]);
  });
});
