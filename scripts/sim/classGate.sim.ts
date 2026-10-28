// Does the Hunting sub-level gate close a sub-level to a class that wins the fights there? (classes reform, phase 8). It measures; it changes nothing.
//   npx vitest run --config vitest.sim.config.ts classGate --silent=false --reporter=default
// The gate (scripts/sim/legacyGate.ts, applied by engine.ts computeHuntingStatus) existed (until 28/10, in CP) only in the zones with `subLevelGear`: a hero is promoted to sub-level N only while his CP is at least
// recommendedCpForDepth x growth^(N-1). Per class hero and per gated zone / depth this prints (a) the highest sub-level the CP allows, (b) the highest sub-level where the hero wins the fights (a session pinned at
// that sub-level, no defeat), and the CP each sub-level asks. A class that wins at a sub-level its CP does not open is gated for a reason that has nothing to do with how it fights.
import { it } from 'vitest';
import { buildHuntSession, computeCP, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import { HUNTING_ZONES, HuntingDepth } from '../../src/game/huntingZones';
import { subLevelCpRequired } from './legacyGate';
import T from '../../src/game/tunables';
import { CLASS_MAIN, classHero } from './classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

function defeatsAt(h: SaveData, zoneId: string, depth: HuntingDepth, level: number): { defeats: number; kills: number } {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = level;
  try {
    let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: NOW };
    save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, depth)]: { ceiling: level, promotionWins: 0 } } };
    save = { ...save, huntSession: buildHuntSession(save, NOW) };
    const st = computeHuntingStatus(save, NOW + 4 * 3600 * 1000);
    return { defeats: st.defeats, kills: st.kills };
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}

it('prints the gate against the classes', () => {
  const out: string[] = [];
  const gated = HUNTING_ZONES.filter((z) => z.subLevelGear);
  out.push(`Zonas com portão de CP: ${gated.map((z) => `${z.id} (crescimento ${1.23})`).join(', ')}`, '');
  for (const z of gated) {
    for (const depth of ['shallow', 'deep'] as HuntingDepth[]) {
      out.push(`### ${z.id} ${depth}: CP pedido por sub-nível`, '');
      out.push('| sub-nível | ' + Array.from({ length: 9 }, (_, i) => i + 2).join(' | ') + ' |', '| --- | ' + Array.from({ length: 9 }, () => '--:').join(' | ') + ' |');
      out.push('| CP pedido | ' + Array.from({ length: 9 }, (_, i) => subLevelCpRequired(z, depth, i + 2)).join(' | ') + ' |', '');
      out.push('| herói T6 +8 (nível 100) | CP | sub-nível mais alto que o CP abre | sub-nível mais alto onde vence (0 derrotas em 4 h) |', '| --- | --: | --: | --: |');
      for (const b of CLASS_MAIN) {
        const h = classHero(b, 100, 6, 8, 'real');
        const cp = computeCP(h);
        let opens = 1;
        for (let l = 2; l <= 10; l++) if (cp >= subLevelCpRequired(z, depth, l)) opens = l;
        let wins = 0;
        for (let l = 1; l <= 10; l++) if (defeatsAt(h, z.id, depth, l).defeats === 0) wins = l;
        out.push(`| ${b.id} | ${Math.round(cp)} | ${opens} | ${wins} |`);
      }
      out.push('');
    }
  }
  console.log(out.join(String.fromCharCode(10)));
});

// The CP of the three classes at the end of the game (tier 6 +12, level 100) and the highest sub-level each one UNLOCKS, in the two gated zones at the three depths. Plus the strongest hero the game can build
// (legendary tier 6 +12, paragon 50) for the question "can anybody reach sub-level 10 of the fifth zone".
import { gearHero } from './depthHero';
it('prints the CP of the end-game classes and what the gate lets them open', () => {
  const out: string[] = [];
  const gated = HUNTING_ZONES.filter((z) => z.subLevelGear);
  const heroes = CLASS_MAIN.map((b) => ({ b, cp: computeCP(classHero(b, 100, 6, 12, 'real')) }));
  out.push('| herói T6 +12 (nível 100) | CP | razão contra o guerreiro |', '| --- | --: | --: |');
  for (const h of heroes) out.push(`| ${h.b.id} | ${Math.round(h.cp)} | ${(h.cp / heroes[0].cp).toFixed(3)} |`);
  out.push('', '| zona / fundo | ' + heroes.map((h) => h.b.id).join(' | ') + ' | CP do sub-nível 10 |', '| --- | --: | --: | --: | --: |');
  for (const z of gated)
    for (const depth of ['shallow', 'dense', 'deep'] as HuntingDepth[]) {
      const opens = heroes.map((h) => {
        let o = 1;
        for (let l = 2; l <= 10; l++) if (h.cp >= subLevelCpRequired(z, depth, l)) o = l;
        return o;
      });
      out.push(`| ${z.id} ${depth} | ${opens.join(' | ')} | ${subLevelCpRequired(z, depth, 10)} |`);
    }
  const best = gearHero('legendary', 50, 12, 'real');
  out.push('', `O herói mais forte que o jogo monta (lendário T6 +12, paragon 50, guerreiro, rotação e afinidade): CP ${Math.round(computeCP(best))}`);
  console.log(out.join(String.fromCharCode(10)));
});
