// Where each class stops on the Dungeon floors, tier by tier (phase 8): a wall that appears at EVERY tier (the mage stops under floor 40 whatever he wears) is a mechanic that is missing; a wall that moves up with the
// gear (the mage passes floor 40 one tier later than the others) is the axis doing its job. It measures; it writes nothing.
//   npx vitest run --config vitest.sim.config.ts floorWall --silent=false --reporter=default
import { it } from 'vitest';
import { isDungeonBoss, isDungeonCheckpoint } from '../../src/game/dungeon';
import { clearRate } from './ladder';
import { CLASS_MAIN, classHero } from './classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
it('prints where the classes stop', () => {
  const out = ['| equipamento | guerreiro | arqueiro | mago | o que o mago encontra no andar em que para |', '| --- | --: | --: | --: | --- |'];
  for (const [tier, level, refine] of [[2, 20, 4], [3, 45, 0], [3, 45, 8], [4, 62, 0], [4, 62, 8], [5, 75, 0], [5, 75, 8], [6, 90, 0], [6, 90, 8]] as [number, number, number][]) {
    const reach = CLASS_MAIN.map((b) => {
      const h = classHero(b, level, tier, refine, 'real');
      let r = 0;
      for (let f = 1; f <= 100; f++) {
        if (clearRate(h, f, NOW, 3) < 2 / 3) break;
        r = f;
      }
      return r;
    });
    const stop = reach[2] + 1;
    out.push(`| T${tier} +${refine} | ${reach[0]} | ${reach[1]} | ${reach[2]} | ${stop}: ${isDungeonBoss(stop) ? 'chefe' : isDungeonCheckpoint(stop) ? 'checkpoint (mini-chefe)' : 'andar comum'} |`);
  }
  console.log(out.join(String.fromCharCode(10)));
});
