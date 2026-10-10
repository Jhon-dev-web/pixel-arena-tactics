// Profession audit (docs/PROFESSIONS_AUDIT.md). Run with `npx vitest run --config vitest.sim.config.ts professions --silent=false`.
// Everything is computed from the real data in src/game (skills.ts curves, tunables, ores, woodcutting, garden, refining,
// economy.ts reference values); nothing is mirrored. It prints Markdown (Portuguese) and asserts nothing.
import { describe, it } from 'vitest';
import { GEAR, upgradeCost } from '../../src/game/gear';
import { baseGoldValue } from '../../src/game/economy';
import { PLANTS, plantHarvestXp, GARDEN_PLOT_UNLOCK_LEVELS, GARDEN_START_PLOTS } from '../../src/game/garden';
import { applyFertilizer, applyHarvest, applyPlant } from '../../src/game/gardenActions';
import { computeGardenSlotStatus, defaultSave, SaveData } from '../../src/game/engine';
import { HUNT_POUCH_TIERS } from '../../src/game/huntPouch';
import { MATERIALS, MaterialId } from '../../src/game/materials';
import { ORE_TIERS } from '../../src/game/ores';
import { POTION_RECIPES } from '../../src/game/potions';
import { REFINING_RECIPES } from '../../src/game/refining';
import { BASE_GATHER_POWER, gatherPower, skillXpForNextLevel, skillXpToReachLevel } from '../../src/game/skills';
import T from '../../src/game/tunables';
import { WOOD_TIERS } from '../../src/game/woodcutting';

const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/,/g, ' ') : '-');
const table = (header: string[], rows: string[][]) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
const HOUR = 3600 * 1000;

// ---- Mining / Woodcutting: hours of the activity ------------------------------------------------------------------

// A session pays floor(hours x power x rate) units at the level the skill had when it STARTED (the XP is only added at claim), so the
// honest model is "claim every `sessionH` hours, power frozen inside a session". Units at power p: floor(p x sessionH); XP: units x xpPerUnit.
function hoursToLevels(targets: number[], sessionH: number): Record<number, number> {
  const out: Record<number, number> = {};
  let xp = 0;
  let hours = 0;
  const maxLevel = T.skills.maxLevel;
  const levelAt = (x: number) => {
    let l = 1;
    while (l < maxLevel && x >= skillXpToReachLevel(l + 1, 'mining')) l++;
    return l;
  };
  let guard = 0;
  while (guard++ < 400000) {
    const lvl = levelAt(xp);
    for (const tg of targets) if (out[tg] === undefined && lvl >= tg) out[tg] = hours;
    if (targets.every((tg) => out[tg] !== undefined)) break;
    const raw = gatherPower(BASE_GATHER_POWER, xp) * T.mining.oreRatePerPower * sessionH;
    const units = sessionH < 0.5 ? raw : Math.floor(raw); // sessionH < 0.5 = continuous (no rounding)
    xp += units * T.skills.xpPerUnit;
    hours += sessionH;
  }
  return out;
}

// Hours of continuous mining that one level costs (the time-to-next-level the player sees), per level.
function levelUpHours(level: number): number {
  const rate = gatherPower(BASE_GATHER_POWER, skillXpToReachLevel(level, 'mining')) * T.mining.oreRatePerPower * T.skills.xpPerUnit;
  return skillXpForNextLevel(level, 'mining') / rate;
}

// Gardening: `plots` plots always growing the plant with the best XP per day for the visit pattern; XP per harvest = hours x gardenXpPerHour.
function gardenDays(level: number, plots: number, visitGapH: number): number {
  const need = skillXpToReachLevel(level, 'gardening');
  let xp = 0;
  let day = 0;
  while (xp < need && day < 5000) {
    // the best plant at the current level maximises XP per visit cycle: a plant of duration d fills ceil(d / gap) gaps
    let lvl = 1;
    while (lvl < T.skills.maxLevel && xp >= skillXpToReachLevel(lvl + 1, 'gardening')) lvl++;
    let best = 0;
    for (const p of PLANTS) {
      if (p.requiredLevel > lvl) continue;
      const gaps = Math.ceil(p.durationMs / HOUR / visitGapH);
      const perDay = (plantHarvestXp(p) * (24 / visitGapH)) / gaps;
      best = Math.max(best, perDay);
    }
    xp += best * plots;
    day++;
  }
  return day;
}

// Garden output of a player who visits every `gapH` hours for `days` days, with or without Fertilizer on every planting, for the best single plant at
// Gardening `level`: units harvested and plot-hours harvested (= Gardening XP / 5).
function gardenOutput(level: number, gapH: number, days: number, fertilize: boolean): { plant: string; units: number; plotHours: number } {
  let best = { plant: '-', units: 0, plotHours: 0 };
  for (const p of PLANTS.filter((x) => x.requiredLevel <= level)) {
    let s: SaveData = { ...defaultSave(), skillXp: { mining: 0, woodcutting: 0, gardening: skillXpToReachLevel(level, 'gardening') } };
    s = { ...s, consumables: { ...s.consumables, fertilizer: 9999 } };
    const t0 = new Date(2026, 5, 1, 8, 0, 0).getTime();
    let units = 0;
    let plotHours = 0;
    for (let step = 0; step * gapH < days * 24; step++) {
      const at = t0 + step * gapH * HOUR;
      const ready = s.gardenSlots.map((_, i) => i).filter((i) => computeGardenSlotStatus(s, at, i).ready);
      const res = ready.length ? applyHarvest(s, ready, at) : null;
      if (res) {
        for (const h of res.harvested) {
          units += h.qty;
          plotHours += PLANTS.find((x) => x.id === h.plantId)!.durationMs / HOUR;
        }
        s = res.save;
      }
      const planted = applyPlant(s, p.id, s.gardenSlots.map((_, i) => i), at);
      if (planted) s = planted;
      if (fertilize) for (let i = 0; i < s.gardenSlots.length; i++) s = applyFertilizer(s, i, at) ?? s;
    }
    if (plotHours > best.plotHours) best = { plant: p.id, units, plotHours };
  }
  return best;
}

describe('professions audit', () => {
  it('prints the audit tables', () => {
    const out: string[] = [];
    out.push('### 1. Regras de Mineração e Lenhador (dos dados reais)');
    out.push('');
    out.push(
      `Taxa = (${BASE_GATHER_POWER} + ${T.skills.powerPerLevel} x nível) x ${T.mining.oreRatePerPower} unidades/h (a taxa NÃO depende do tier: só o nível da profissão); XP = ${T.skills.xpPerUnit} por unidade; ` +
        `armazenamento sem passe ${T.mining.capHours} h (Passe: ${T.battlePass.capHours} h e x${T.battlePass.dropRateMultiplier} de unidades); XP só entra ao coletar.`,
    );
    out.push('');
    out.push(
      ...table(
        ['Nível', 'Unidades/h', 'XP/h', 'Unidades por sessão cheia (4 h)', 'XP do próximo nível', 'Horas até o próximo nível'],
        [1, 10, 25, 40, 50, 55, 60, 70, 74].map((l) => {
          const rate = gatherPower(BASE_GATHER_POWER, skillXpToReachLevel(l, 'mining')) * T.mining.oreRatePerPower;
          return [String(l), f(rate), f(rate * T.skills.xpPerUnit), f(rate * T.mining.capHours, 0), f(skillXpForNextLevel(l, 'mining'), 0), f(levelUpHours(l))];
        }),
      ),
    );
    out.push('');

    out.push('### 3. Curva de XP: horas da atividade até cada nível');
    out.push('');
    const targets = [10, 25, 50, 55, 70, 75];
    const cont = hoursToLevels(targets, 0.05);
    const sess = hoursToLevels(targets, T.mining.capHours);
    const rows: string[][] = [];
    let prev = 0;
    for (const tg of targets) {
      const ratio = prev > 0 ? cont[tg] / prev : NaN;
      rows.push([String(tg), f(cont[tg]), f(sess[tg]), f(cont[tg] / (2 * T.mining.capHours)), Number.isFinite(ratio) ? `${f(ratio)}x` : '-', Number.isFinite(ratio) && ratio > 3 ? 'ACIMA DE 3x' : '']);
      prev = cont[tg];
    }
    out.push(...table(['Nível', 'Horas (coleta contínua)', 'Horas (sessões de 4 h)', 'Dias a 8 h/dia (2 visitas x 4 h)', 'Razão vs marco anterior', 'Sinal'], rows));
    out.push('');
    let maxPre30 = 0;
    let maxTo60 = 0;
    let worstPre30 = 1;
    let worstTo60 = 1;
    for (let l = 1; l < 60; l++) {
      const h = levelUpHours(l);
      if (l < 30 && h > maxPre30) {
        maxPre30 = h;
        worstPre30 = l;
      }
      if (h > maxTo60) {
        maxTo60 = h;
        worstTo60 = l;
      }
    }
    out.push(`Maior subida de um nível antes do 30: ${f(maxPre30)} h (nível ${worstPre30}->${worstPre30 + 1}); até o 60: ${f(maxTo60)} h (nível ${worstTo60}->${worstTo60 + 1}). Metas: < 6 h e < 24 h.`);
    out.push('');
    out.push('Jardinagem (dias com padrão de visita; planta de maior XP por dia dentro do que já está liberado):');
    out.push('');
    const garden = [5, 10, 15, 25, 35, 50, 75].map((lv) => [String(lv), f(skillXpToReachLevel(lv, 'gardening'), 0), String(gardenDays(lv, 4, 12)), String(gardenDays(lv, 4, 8)), String(gardenDays(lv, 4, 24))]);
    out.push(...table(['Nível', 'XP acumulado', 'Dias (4 canteiros, visita a cada 12 h)', 'Dias (a cada 8 h)', 'Dias (1 visita por dia)'], garden));
    out.push('');
    out.push(`Portas de minério: ${ORE_TIERS.map((o) => `${o.id} ${o.requiredLevel}`).join(', ')}; madeira: ${WOOD_TIERS.map((o) => `${o.id} ${o.requiredLevel}`).join(', ')}.`);
    out.push('');

    out.push('### 4. Refino: valor da saída contra o valor das entradas + ouro (economy.ts baseGoldValue)');
    out.push('');
    const refRows: string[][] = [];
    for (const r of REFINING_RECIPES) {
      const inputs = (Object.entries(r.input) as [MaterialId, number][]).reduce((a, [m, q]) => a + q * baseGoldValue(m), 0);
      const outV = r.outputQty * baseGoldValue(r.output);
      const ratio = outV / (inputs + r.cost);
      refRows.push([r.id, r.station, Object.entries(r.input).map(([m, q]) => `${q} ${m}`).join(' + '), String(r.cost), f(inputs), f(outV), f(ratio, 2), ratio < 0.6 ? 'ABAIXO DE 60%' : '']);
    }
    out.push(...table(['Receita', 'Estação', 'Entradas', 'Ouro', 'Valor das entradas', 'Valor da saída', 'Saída / (entradas + ouro)', 'Sinal'], refRows));
    out.push('');
    const catalog = REFINING_RECIPES.filter((r) => r.station !== 'dust').map((r) => {
      const inSell = (Object.entries(r.input) as [MaterialId, number][]).reduce((a, [m, q]) => a + q * (MATERIALS.find((x) => x.id === m)?.sellValue ?? 0), 0);
      const outSell = r.outputQty * (MATERIALS.find((x) => x.id === r.output)?.sellValue ?? 0);
      return [r.id, f(inSell, 0), f(outSell, 0), inSell > 0 ? f(outSell / inSell, 2) : '-'];
    });
    out.push('Mesma conta com o `sellValue` do catálogo (legado, não é pago por nada):');
    out.push('');
    out.push(...table(['Receita', 'sellValue das entradas', 'sellValue da saída', 'Razão'], catalog));
    out.push('');

    out.push('### 4b. Materiais sem nenhum consumidor');
    out.push('');
    const consumers = new Map<MaterialId, string[]>();
    const add = (m: string, who: string) => consumers.set(m as MaterialId, [...(consumers.get(m as MaterialId) ?? []), who]);
    for (const g of GEAR) for (const m of Object.keys(g.recipe?.materials ?? {})) add(m, `forja:${g.id}`);
    for (const r of REFINING_RECIPES) for (const m of Object.keys(r.input)) add(m, `refino:${r.id}`);
    for (const r of POTION_RECIPES) for (const m of Object.keys(r.input)) add(m, `poção:${r.id}`);
    for (const t of HUNT_POUCH_TIERS) for (const m of Object.keys(t.cost?.materials ?? {})) add(m, `bolsa:${t.tier}`);
    const gearSample = GEAR.find((g) => g.tier === 1)!;
    for (let lvl = 0; lvl < 8; lvl++) for (const tier of [1, 3, 4, 5]) for (const m of Object.keys(upgradeCost({ ...gearSample, tier }, lvl).materials ?? {})) add(m, 'aprimorar');
    const orphan = MATERIALS.filter((m) => !consumers.has(m.id)).map((m) => m.id);
    out.push(orphan.length === 0 ? 'Todo material tem pelo menos um consumidor (forja, refino, poção, aprimorar ou bolsa).' : `Sem consumidor: ${orphan.join(', ')}.`);
    out.push('');
    out.push(...table(['Material', 'Consumidores'], MATERIALS.map((m) => [m.id, (consumers.get(m.id) ?? []).slice(0, 4).join(', ') + ((consumers.get(m.id)?.length ?? 0) > 4 ? ` (+${(consumers.get(m.id)?.length ?? 0) - 4})` : '')])));
    out.push('### 5. Horta 3.0: XP por colheita, canteiros e o efeito do Adubo');
    out.push('');
    out.push(...table(['Planta', 'Nível', 'Tempo (h)', 'Colheita', 'XP por colheita', 'Unidades por canteiro-hora'], PLANTS.map((p) => [p.id, String(p.requiredLevel), f(p.durationMs / HOUR, 0), String(p.qty), String(plantHarvestXp(p)), f(p.qty / (p.durationMs / HOUR), 2)])));
    out.push('');
    out.push(...table(['Nível', 'XP acumulado', `Dias com ${GARDEN_START_PLOTS} canteiros (visitas de 12 h)`, `Dias com ${GARDEN_START_PLOTS + 1}`, `Dias com ${GARDEN_START_PLOTS + GARDEN_PLOT_UNLOCK_LEVELS.length}`], [10, 20, 30, 40, 45, 50, 60, 75].map((lv) => [String(lv), f(skillXpToReachLevel(lv, 'gardening'), 0), String(gardenDays(lv, GARDEN_START_PLOTS, 12)), String(gardenDays(lv, GARDEN_START_PLOTS + 1, 12)), String(gardenDays(lv, GARDEN_START_PLOTS + 2, 12))])));
    out.push('');
    out.push('Adubo em TODO plantio (14 dias, Jardinagem 45 = 5 canteiros, a melhor planta única para o padrão de visita):');
    out.push('');
    const fertRows = [24, 12, 8, 6, 4].map((gap) => {
      const a = gardenOutput(45, gap, 14, false);
      const b = gardenOutput(45, gap, 14, true);
      return [`a cada ${gap} h`, `${a.plant}: ${f(a.plotHours / 14, 1)} canteiro-h/dia`, `${b.plant}: ${f(b.plotHours / 14, 1)} canteiro-h/dia`, `+${f((b.plotHours / a.plotHours - 1) * 100, 0)}%`, f(b.plotHours / 14 / 5 / 4, 1)];
    });
    out.push(...table(['Visitas', 'Sem Adubo', 'Com Adubo', 'Diferença de produção', 'Adubos por dia (aprox.)'], fertRows));
    out.push('');
    console.log('\n' + out.join('\n') + '\n');
  });
});
