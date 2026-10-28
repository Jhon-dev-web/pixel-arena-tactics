// The honest PEAK of Hunting XP an hour, measured with the real engine, against the server bound (progress/bounds.ts BOUNDS.xpPerHour). It measures; it changes nothing.
//   npx vitest run --config vitest.sim.config.ts classPeak --silent=false --reporter=default
// The hero fights the fifth zone at its deepest depth PINNED at sub-level 10 (what the gate would allow everybody if it asked nothing), for 4 h; the XP of the session is divided by its hours. Heroes: the three classes at
// tier 6 +12 legendary, and the strongest hero the game builds. The class heroes carry the Hunter skill path (Aprendiz Veloz x3 is in the measured XP); the Knowledge Elixir (+25 %) and the Season Relic are not worn, and the last column puts them on top, the way bounds.ts does. The strongest hero
// has the Warrior path, so the last column adds the skill as well.
import { it } from 'vitest';
import { buildHuntSession, computeHuntingStatus, huntProgressKey, SaveData } from '../../src/game/engine';
import { HuntingDepth } from '../../src/game/huntingZones';
import { relicXpBonusPct } from '../../src/game/gear';
import T from '../../src/game/tunables';
import { BOUNDS } from '../../supabase/functions/_shared/progress/bounds';
import { spendSkillPoints } from './driver';
import { gearHero } from './depthHero';
import { CLASS_MAIN, classHero } from './classHero';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();

function xph(h: SaveData, zoneId: string, depth: HuntingDepth, level: number): { xph: number; kph: number } {
  const saved = T.hunting.subLevels;
  (T.hunting as { subLevels: number }).subLevels = level;
  try {
    let save: SaveData = { ...h, activeHuntingZone: zoneId, activeHuntingDepth: depth, huntingOfflineStart: NOW };
    save = { ...save, huntProgress: { ...save.huntProgress, [huntProgressKey(zoneId, depth)]: { ceiling: level, promotionWins: 0 } } };
    save = { ...save, huntSession: buildHuntSession(save, NOW) };
    const st = computeHuntingStatus(save, NOW + 4 * 3600 * 1000);
    const hrs = st.pendingMs / 3600_000;
    return { xph: st.xpReady / hrs, kph: st.kills / hrs };
  } finally {
    (T.hunting as { subLevels: number }).subLevels = saved;
  }
}

it('prints the honest XP peak against the bound', () => {
  const out: string[] = [];
  const relic = relicXpBonusPct('season_emblem') / 100;
  const boost = (1 + relic + 3 * T.heroSkills.quickLearnerXp) * (1 + T.consumables.knowledgeXpPct); // what bounds.ts assumes
  const boostHunter = (1 + relic) * (1 + T.consumables.knowledgeXpPct); // the Hunter path is already in the measured XP
  out.push(`Limite do servidor BOUNDS.xpPerHour = ${BOUNDS.xpPerHour}. Bônus que o limite supõe: x${boost.toFixed(3)} (Relíquia da Temporada, Aprendiz Veloz 3, Elixir do Conhecimento); os heróis de classe já têm o Aprendiz Veloz, então só falta x${boostHunter.toFixed(3)}.`, '');
  out.push('| herói | zona / fundo / sub-nível | kills/h | XP/h medido | XP/h com os bônus | parte do limite |', '| --- | --- | --: | --: | --: | --: |');
  const heroes: [string, SaveData][] = [
    ...CLASS_MAIN.map((b): [string, SaveData] => [`${b.id} T6+12 lendário`, spendSkillPoints(classHero(b, 100, 6, 12, 'real', 100, 'legendary'), 'hunter')]),
    ['guerreiro T6+12 lendário, paragon 50', gearHero('legendary', 50, 12, 'real')],
  ];
  for (const [label, h] of heroes) {
    const b = label.startsWith('guerreiro') ? boost : boostHunter;
    for (const [zone, depth, lvl] of [['abyss_throne', 'deep', 10], ['abyss_throne', 'deep', 4], ['blood_abyss', 'deep', 10]] as [string, HuntingDepth, number][]) {
      const r = xph(h, zone, depth, lvl);
      out.push(`| ${label} | ${zone} ${depth} ${lvl} | ${r.kph.toFixed(0)} | ${Math.round(r.xph)} | ${Math.round(r.xph * b)} | ${((r.xph * b) / BOUNDS.xpPerHour).toFixed(2)} |`);
    }
  }
  console.log(out.join(String.fromCharCode(10)));
});
