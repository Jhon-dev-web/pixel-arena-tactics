// WHAT THE FERTILIZER IS WORTH AT EACH VISIT PATTERN (measurement only: prints, asserts nothing, writes nothing; the tunable is set for the length of one run and put back in a finally).
// Same method as scripts/sim/professions.sim.ts section 5 (gardenOutput): the best single plant for the pattern, every plot planted at each visit, the bag emptied after each harvest, a Fertilizer handed over one unit at a
// time. It adds the units harvested, their value (economy.ts baseGoldValue) and the Fertilizers spent. Plot-hours here are the XP the game really paid / 5 (so the idle bonus shows; professions.sim.ts counts the growth hours).
// "OLD" = T.tonics.fertilizerIdleXpPct 0 (the behaviour before 29/10); "NEW" = the value in tunables.ts.
// Run: npx vitest run --config vitest.sim.config.ts gardenFertilizer --silent=false --reporter=default
import { it } from 'vitest';
import { baseGoldValue } from '../../src/game/economy';
import { computeGardenSlotStatus, defaultSave, SaveData } from '../../src/game/engine';
import { PLANTS } from '../../src/game/garden';
import { applyFertilizer, applyHarvest, applyPlant } from '../../src/game/gardenActions';
import { MaterialId } from '../../src/game/materials';
import { skillXpToReachLevel } from '../../src/game/skills';
import T from '../../src/game/tunables';

const HOUR = 3600 * 1000;
const f = (n: number, d = 1) => n.toFixed(d);
const table = (header: string[], rows: string[][]) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
// what ONE Fertilizer costs to make (potions.ts: 3 bone_fragment + 2 common_herb + 25 gold), in the same gold-equivalent as the plant values
const FERTILIZER_COST = 25 + 3 * baseGoldValue('bone_fragment') + 2 * baseGoldValue('common_herb');

interface Out { plant: string; units: number; plotHours: number; value: number; fertilizers: number }

function run(plantId: string, level: number, gapH: number, days: number, fertilize: boolean): Out {
  const p = PLANTS.find((x) => x.id === plantId)!;
  let s: SaveData = { ...defaultSave(), skillXp: { mining: 0, woodcutting: 0, gardening: skillXpToReachLevel(level, 'gardening') } };
  const t0 = new Date(2026, 5, 1, 8, 0, 0).getTime();
  const o: Out = { plant: plantId, units: 0, plotHours: 0, value: 0, fertilizers: 0 };
  for (let step = 0; step * gapH < days * 24; step++) {
    const at = t0 + step * gapH * HOUR;
    const ready = s.gardenSlots.map((_, i) => i).filter((i) => computeGardenSlotStatus(s, at, i).ready);
    const res = ready.length ? applyHarvest(s, ready, at) : null;
    if (res) {
      for (const h of res.harvested) {
        o.units += h.qty;
        o.plotHours += h.xp / T.skills.gardenXpPerHour; // canteiro-h = Gardening XP / 5, as in professions.sim.ts (it counts the XP the game really paid)
        o.value += h.qty * baseGoldValue(h.material as MaterialId);
      }
      s = { ...res.save, materials: Object.fromEntries(Object.keys(res.save.materials).map((m) => [m, 0])) as SaveData['materials'] };
    }
    const planted = applyPlant(s, p.id, s.gardenSlots.map((_, i) => i), at);
    if (planted) s = planted;
    if (fertilize) {
      for (let i = 0; i < s.gardenSlots.length; i++) {
        const used = applyFertilizer({ ...s, consumables: { ...s.consumables, fertilizer: 1 } }, i, at);
        if (!used) continue;
        s = { ...used, consumables: { ...used.consumables, fertilizer: 0 } };
        o.fertilizers++;
      }
    }
  }
  return o;
}

// the best plant by plot-hours (the professions.sim.ts rule) for the given setting of the bonus
function best(level: number, gapH: number, days: number, fertilize: boolean, bonus: number): Out {
  const prev = T.tonics.fertilizerIdleXpPct;
  T.tonics.fertilizerIdleXpPct = bonus;
  try {
    let b: Out = { plant: '-', units: 0, plotHours: 0, value: 0, fertilizers: 0 };
    for (const p of PLANTS.filter((x) => x.requiredLevel <= level)) {
      const o = run(p.id, level, gapH, days, fertilize);
      if (o.plotHours > b.plotHours) b = o;
    }
    return b;
  } finally {
    T.tonics.fertilizerIdleXpPct = prev;
  }
}

it('prints the fertilizer table', () => {
  const days = 14;
  const out: string[] = [];
  for (const level of [45, 70]) {
    out.push(`### Jardinagem ${level}, ${days} dias (canteiros abertos: ${level >= 40 ? 6 : level >= 20 ? 5 : 4}); custo de um Adubo = ${f(FERTILIZER_COST)} de ouro-equivalente`);
    out.push('');
    const rows = [24, 12, 10, 8, 6, 4].map((gap) => {
      const none = best(level, gap, days, false, 0);
      const old = best(level, gap, days, true, 0);
      const neu = best(level, gap, days, true, T.tonics.fertilizerIdleXpPct);
      const perDay = (n: number) => f(n / days);
      return [
        `${gap} h`,
        `${none.plant} ${perDay(none.plotHours)} canteiro-h/dia, ${perDay(none.units)} un, ${perDay(none.value)} ouro-eq`,
        `${old.plant} ${perDay(old.plotHours)}, ${perDay(old.units)} un, ${perDay(old.value)}, ${perDay(old.fertilizers)} adubos`,
        `${neu.plant} ${perDay(neu.plotHours)}, ${perDay(neu.units)} un, ${perDay(neu.value)}, ${perDay(neu.fertilizers)} adubos`,
        `canteiro-h ${f(((neu.plotHours / none.plotHours) - 1) * 100, 0)}% (antes ${f(((old.plotHours / none.plotHours) - 1) * 100, 0)}%); un ${f(((neu.units / none.units) - 1) * 100, 0)}%`,
        `${f(((neu.plotHours - none.plotHours) * T.skills.gardenXpPerHour) / Math.max(1, neu.fertilizers))} XP (antes ${f(((old.plotHours - none.plotHours) * T.skills.gardenXpPerHour) / Math.max(1, old.fertilizers))})`,
      ];
    });
    out.push(...table(['Visitas', 'SEM adubo', 'COM adubo, ANTES', 'COM adubo, DEPOIS', 'Diferenca de producao', 'XP ganho por adubo gasto'], rows));
    out.push('');
  }
  console.log('\n' + out.join('\n') + '\n');
});
