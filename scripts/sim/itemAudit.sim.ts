// Item balance audit (docs/ITEM_BALANCE_AUDIT.md). Run it with `npm run sim:items`; it prints Markdown tables and asserts nothing.
// Everything is measured through the REAL game code: rollRarity / createGearInstance / applyForge for the forge rates, buildCombatStats
// and computeCP for power, the Dungeon driver (runDungeon, clearRate) and simulateHuntingSession (computeHuntingStatus) for combat.
//
// "Duel margin" P used below = (time the hero survives) / (time the hero needs to kill) against ONE enemy of a floor, closed form with
// expected crits and lifesteal: P > 1 means the hero wins that fight on average. It is the exact quantity that decides every fight in
// the Dungeon and in Hunting, so a change of ln P is the "real combat value" of a stat (computeCP is only an approximation of it).
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { computeCP, computeHuntingStatus, buildHuntSession, defaultSave, playerLevel, SaveData, xpToReachLevel } from '../../src/game/engine';
import { applyForge, applyDiscardInstance, createGearInstance } from '../../src/game/gearInstances';
import { GEAR, GearItem, getGear, reforgeGoldCost, upgradeChance, upgradeCost } from '../../src/game/gear';
import { RARITIES, SUBSTATS, SubstatType, medianSubstatValue, rollRarity, rollSubstats } from '../../src/game/rarity';
import { isDungeonCheckpoint } from '../../src/game/dungeon';
import { cargoReferenceValue } from '../../src/game/economy';
import { MaterialId, emptyMaterials } from '../../src/game/materials';
import { GEMS, GemId, emptyGems, socketsForTier } from '../../src/game/gems';
import { HUNTING_ZONES, getHuntingZone } from '../../src/game/huntingZones';
import { clearRate } from './ladder';
import { duel, duelVs, hero, MAIN_TIERS, PAIRS, repFloor, tierNum } from './duel';
import { runDungeon, spendAttributePoints, withSeededRandom } from './driver';
import T from '../../src/game/tunables';

const NOW = new Date(2026, 5, 20, 12, 0, 0).getTime();
const HOUR = 3600 * 1000;
const RARITY_IDS = RARITIES.map((r) => r.id);

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

// Deepest floor cleared from full HP in >= 80% of seeded 1-floor runs (stops after 5 failed floors in a row).
function depth(s: SaveData): number {
  let best = 0;
  let miss = 0;
  for (let f = 1; f <= 100; f++) {
    if (clearRate(s, f, NOW, 5) >= 0.8) {
      best = f;
      miss = 0;
    } else if (!isDungeonCheckpoint(f) && ++miss >= 5) break;
  }
  return best;
}
function meanStages(s: SaveData, floor: number, n: number): number {
  let tot = 0;
  const start = { ...s, highestDungeonFloor: floor, consumables: { ...s.consumables, small_hp: 0, large_hp: 0, greater_elixir: 0 } };
  for (let i = 0; i < n; i++) tot += withSeededRandom(5000 + i, () => runDungeon(start, NOW).stages);
  return tot / n;
}

// ---- hunting ------------------------------------------------------------------------------------------------------------
function huntRun(s: SaveData, zoneId: string, hours = 4) {
  const z = getHuntingZone(zoneId)!;
  const save: SaveData = { ...s, activeHuntingZone: z.id, activeHuntingDepth: 'shallow', huntingOfflineStart: NOW, huntSession: buildHuntSession(s, NOW) };
  const st = computeHuntingStatus(save, NOW + hours * HOUR);
  const drops = cargoReferenceValue(st.drops as Partial<Record<MaterialId, number>>);
  return { xp: st.xpReady, dropsValue: drops, ceiling: st.ceilingSubLevel, fightMs: st.pendingMs };
}
function huntDuel(s: SaveData, zoneId: string, sub = 1) {
  const z = getHuntingZone(zoneId)!;
  const hp = (z.shallowEnemyHp ?? z.baseEnemyHp) * (1 + T.hunting.subLevelHpGrowth * (sub - 1));
  const dmg = (z.shallowEnemyDmg ?? z.baseEnemyDmg) * (1 + T.hunting.subLevelDmgGrowth * (sub - 1));
  return duelVs(s, hp, dmg, T.hunting.enemyAtkMs);
}

// ---- cost helpers --------------------------------------------------------------------------------------------------------
interface Cost { gold: number; mats: Partial<Record<MaterialId, number>>; gems: Partial<Record<GemId, number>>; shards: number }
function chainCost(tpl: string): Cost {
  const item = getGear(tpl);
  const c: Cost = { gold: item.cost, mats: { ...(item.recipe?.materials ?? {}) }, gems: { ...(item.recipe?.gems ?? {}) }, shards: item.recipe?.shards ?? 0 };
  for (const [sub, n] of Object.entries(item.recipe?.items ?? {})) {
    const sc = chainCost(sub);
    c.gold += sc.gold * n;
    c.shards += sc.shards * n;
    for (const [m, q] of Object.entries(sc.mats)) c.mats[m as MaterialId] = (c.mats[m as MaterialId] ?? 0) + (q as number) * n;
    for (const [g, q] of Object.entries(sc.gems)) c.gems[g as GemId] = (c.gems[g as GemId] ?? 0) + (q as number) * n;
  }
  return c;
}
const gemShardCost = 2;
// One scalar, in reference Gold: gold + materials at baseGoldValue + gems and shards at 2 Gold per shard (gems cost 2 shards).
function goldEq(c: Cost, ownOnly = false, tpl?: string): number {
  const mats = ownOnly && tpl ? (getGear(tpl).recipe?.materials ?? {}) : c.mats;
  const gems = ownOnly && tpl ? (getGear(tpl).recipe?.gems ?? {}) : c.gems;
  const gold = ownOnly && tpl ? getGear(tpl).cost : c.gold;
  const shards = ownOnly && tpl ? (getGear(tpl).recipe?.shards ?? 0) : c.shards;
  const gemN = Object.values(gems).reduce((a, b) => a + (b as number), 0);
  return gold + cargoReferenceValue(mats as Partial<Record<MaterialId, number>>) + (shards + gemN * gemShardCost) * 2;
}

describe('item balance audit', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('prints the report', () => {
    const out: string[] = [];
    const P = (...s: string[]) => out.push(...s);

    // ===== A. forge rarity rates ===============================================================================================
    P('## A. Taxas de raridade da forja', '');
    const N = 300_000;
    const counts: Record<string, number> = {};
    withSeededRandom(1234, () => {
      for (let i = 0; i < N; i++) {
        const r = rollRarity();
        counts[r] = (counts[r] ?? 0) + 1;
      }
    });
    const viaInstance: Record<string, number> = {};
    withSeededRandom(99, () => {
      for (let i = 0; i < N; i++) {
        const r = createGearInstance('bronze_dagger', { origin: 'craft' }).rarity;
        viaInstance[r] = (viaInstance[r] ?? 0) + 1;
      }
    });
    // real applyForge, discarding every result so the bag never fills
    const viaForge: Record<string, number> = {};
    const FN = 20_000;
    withSeededRandom(7, () => {
      let s: SaveData = { ...defaultSave(), gold: 1e9, materials: { ...emptyMaterials(), copper_bar: 1e6, leather: 1e6, wood_handle_common: 1e6 } as SaveData['materials'] };
      for (let i = 0; i < FN; i++) {
        const res = applyForge(s, 'bronze_dagger', { level: 1, now: NOW });
        if (!res.ok || !res.instance) throw new Error('forge failed ' + res.reason);
        viaForge[res.instance.rarity] = (viaForge[res.instance.rarity] ?? 0) + 1;
        s = applyDiscardInstance(res.save!, res.instance.id)!;
      }
    });
    P('Único ponto que sorteia raridade: `createGearInstance` (chamado só por `applyForge`) -> `rollRarity()`. Reforja (`applyReforge`) só re-sorteia as substats, nunca a raridade; não há modificador de nível, Passe de Batalha ou item. Starters e migração usam raridade fixa.', '');
    P('| Raridade | Tabela | `rollRarity` (300k) | `createGearInstance` (300k) | `applyForge` real (20k) |', '| --- | --: | --: | --: | --: |');
    for (const r of RARITIES) {
      P(`| ${r.id} | ${pct(r.chance, 0)} | ${pct(counts[r.id] / N, 2)} | ${pct(viaInstance[r.id] / N, 2)} | ${pct(viaForge[r.id] / FN, 2)} |`);
    }
    P('');
    const pE = 0.12;
    const pL = 0.03;
    P(`Número esperado de forjas do MESMO item (distribuição geométrica): >= 1 épico ou melhor 1/0,15 = ${f1(1 / (pE + pL))}; >= 1 lendário 1/0,03 = ${f1(1 / pL)}; um épico E um lendário: 1/0,12 + 1/0,03 - 1/0,15 = ${f1(1 / pE + 1 / pL - 1 / (pE + pL))}.`, '');
    P('Custo por forja inclui a cadeia "2 do tier anterior" (cada peça do tier anterior foi forjada pelo jogador). Valores em Ouro de referência (Ouro + materiais a `baseGoldValue` + gemas/fragmentos a 2 Ouro por fragmento). O custo esperado multiplica o custo da cadeia pelo número de forjas: é um limite superior (as peças inferiores sorteadas "boas" são consumidas pela forja, a menos que o jogador as guarde).', '');
    P('| Item | Custo da cadeia (Ouro ref.) | Só a receita do tier | Forjas p/ 1 lendário | Custo esperado de 1 lendário | Forjas p/ épico + lendário | Custo esperado | Reforja pode mudar a raridade? |', '| --- | --: | --: | --: | --: | --: | --: | --- |');
    for (const k of Object.keys(PAIRS)) {
      for (const tpl of [PAIRS[k][0], PAIRS[k][1]]) {
        const cc = chainCost(tpl);
        const full = goldEq(cc);
        const own = goldEq(cc, true, tpl);
        P(`| ${tpl} | ${Math.round(full)} | ${Math.round(own)} | ${f1(1 / pL)} | ${Math.round(full / pL)} | ${f1(1 / pE + 1 / pL - 1 / (pE + pL))} | ${Math.round((full * (1 / pE + 1 / pL - 1 / (pE + pL))))} | não |`);
      }
    }
    P('');
    P('Reforja: troca todas as substats pelo sorteio do tier, raridade/refino/sockets/durabilidade ficam. Chance de uma substat desejada aparecer numa reforja (uma das 6 sem repetir): rara 1/6 = 16,7%, épica 2/6 = 33,3%, lendária 3/6 = 50%. Ouro por tentativa: ' + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => reforgeGoldCost(n)).join(' / ') + ' (+ 1 fragmento + poeira/garra/sangue).', '');

    // ===== B. rarity power =====================================================================================================
    P('## B. Poder por raridade (arma + armadura da mesma raridade, atributos balanceados, sem gemas)', '');
    P('CP mediana de 400 sorteios de substats (min / max entre os sorteios). `vs comum` = CP mediana / CP da comum com as mesmas peças. `TTK` e `TTS` (tempo para matar / sobreviver) contra um inimigo do andar representativo do herói comum (margem P >= 1,25), no sorteio mediano.', '');
    const bRows: string[] = [];
    withSeededRandom(31, () => {
      for (const k of MAIN_TIERS) {
        for (const refine of [0, 8]) {
          const t = tierNum(k);
          const base = computeCP(hero(k, refine));
          const fl = repFloor(hero(k, refine));
          for (const r of RARITY_IDS) {
            const cps: { cp: number; s: SaveData }[] = [];
            for (let i = 0; i < 400; i++) {
              const s = hero(k, refine, { rarity: r, wSubs: rollSubstats(r, t), aSubs: rollSubstats(r, t) });
              cps.push({ cp: computeCP(s), s });
            }
            cps.sort((a, b) => a.cp - b.cp);
            const m = cps[200];
            const d = duel(m.s, fl);
            bRows.push(`| T${k} +${refine} | ${r} | ${m.cp} (${cps[0].cp}–${cps[399].cp}) | ${pct(m.cp / base - 1)} | ${pct(cps[0].cp / base - 1)} / ${pct(cps[399].cp / base - 1)} | ${f1(d.ttk)} s / ${f1(d.ttd)} s | ${fl} |`);
          }
        }
      }
    });
    P('| Tier | Raridade | CP mediana (min–max) | mediana vs comum | pior / melhor vs comum | TTK / TTS | Andar ref. |', '| --- | --- | --: | --: | --: | --: | --: |', ...bRows);
    P('');

    // ===== C. substat value ====================================================================================================
    P('## C. Valor de cada substat (uma substat de valor mediano numa armadura comum +4)', '');
    P('Valor mediano = (min+max)/2 + round(perTier x tier). `ΔCP` = variação da CP; `Δln P` = variação do log da margem do duelo no andar de referência (valor real de combate); `ΔKills/h` = variação de 1/TTK na caça de referência (zona do tier); `Δandares` = média de andares limpos numa corrida a partir do andar de referência (60 sorteios, sem poções).', '');
    const cRows: string[] = [];
    const cSummary: Record<string, number[]> = {};
    withSeededRandom(77, () => {
      for (const tk of MAIN_TIERS) {
        const t = tierNum(tk);
        const zone = t === 1 ? 'demon_glade' : t <= 3 ? 'blood_marsh' : t === 4 ? 'demon_rift' : 'blood_abyss';
        const base = hero(tk, 4);
        const fl = repFloor(base);
        const baseCp = computeCP(base);
        const baseP = duel(base, fl).P;
        const baseH = huntDuel(base, zone);
        const baseStages = meanStages(base, fl, 60);
        for (const def of SUBSTATS) {
          const value = Math.round(medianSubstatValue(def, t) * 10) / 10;
          const s = hero(tk, 4, { aSubs: [{ type: def.type, value }] });
          const d = duel(s, fl);
          const hd = huntDuel(s, zone);
          const dCp = computeCP(s) / baseCp - 1;
          const dLn = Math.log(d.P / baseP);
          const st = meanStages(s, fl, 60) - baseStages;
          cRows.push(`| T${tk} | ${def.type} | ${value}${def.isPercent ? '%' : ''} | ${pct(dCp)} | ${f2(dLn * 100)}% | ${pct(hd.ttk > 0 ? baseH.ttk / hd.ttk - 1 : 0)} | ${st >= 0 ? '+' : ''}${f2(st)} |`);
          (cSummary[tk] ??= []).push(def.type === 'goldBonus' ? NaN : dLn);
        }
      }
    });
    P('| Tier | Substat | Valor mediano | ΔCP | Δln P (real) | ΔKills/h | Δandares |', '| --- | --- | --: | --: | --: | --: | --: |', ...cRows);
    P('');
    P('Média por tier do Δln P dos 5 substats de combate (referência para a regra de 2x): ' + Object.entries(cSummary).map(([tk, v]) => `T${tk}: ${f2((v.filter((x) => !Number.isNaN(x)).reduce((a, b) => a + b, 0) / 5) * 100)}%`).join(' · '), '');
    P('Soma do `goldBonus` possível: 2 peças x (8 + 0,5 x 6) = 22% no máximo hoje (só o Ouro da Masmorra, App.tsx finishRun); com 6 peças instanciadas chegaria a 66%.', '');

    // ===== D. primary attributes ===============================================================================================
    P('## D. Atributos primários', '');
    P('Valores do jogo: STR = +0,5 de dano plano e +0,3% de (golpe base + arma) por ponto; VIT = ' + T.advanced.vitHpPerPoint + ' HP/ponto; AGI = intervalo 400 + 800/(1+AGI/100) ms (teto de 300 pontos); RES = ' + T.advanced.resResistPerPoint + ' de resistência/ponto.', '');
    const dRows: string[] = [];
    const levelsTier: [number, string, string][] = [[10, '2', 'demon_glade'], [30, '3', 'blood_marsh'], [60, '4g', 'demon_rift'], [100, '6', 'blood_abyss']];
    withSeededRandom(5, () => {
      for (const [lv, tk] of levelsTier) {
        const b = hero(tk, 4, { level: lv });
        const cp = computeCP(b);
        const fl = repFloor(b);
        const baseP = duel(b, fl).P;
        const cells: string[] = [];
        for (const a of ['str', 'vit', 'agi', 'res'] as const) {
          const s = { ...b, [a]: b[a] + 1 };
          cells.push(`${a.toUpperCase()}: ${pct(computeCP(s) / cp - 1, 2)} CP / ${f2(Math.log(duel(s, fl).P / baseP) * 100)}% P`);
        }
        dRows.push(`| ${lv} | T${tk}+4 | ${cp} | ${fl} | ${cells.join(' | ')} |`);
      }
    });
    P('Valor de +1 ponto num herói balanceado (35/30/20/15):', '', '| Nível | Equip. | CP | Andar ref. | +1 STR | +1 VIT | +1 AGI | +1 RES |', '| --: | --- | --: | --: | --- | --- | --- | --- |', ...dRows);
    P('');
    const eRows: string[] = [];
    let dumpFlags = 0;
    withSeededRandom(6, () => {
      for (const [lv, tk, zone] of levelsTier.filter(([l]) => l === 30 || l === 60)) {
        const pts = lv * 3;
        const builds: [string, { str: number; vit: number; agi: number; res: number } | undefined][] = [
          ['balanceado 35/30/20/15', undefined],
          ['tudo STR', { str: pts, vit: 0, agi: 0, res: 0 }],
          ['tudo VIT', { str: 0, vit: pts, agi: 0, res: 0 }],
          ['tudo AGI', { str: 0, vit: 0, agi: Math.min(pts, 300), res: 0 }],
          ['tudo RES', { str: 0, vit: 0, agi: 0, res: pts }],
          ['STR+VIT 50/50', { str: pts / 2, vit: pts / 2, agi: 0, res: 0 }],
        ];
        let baseDepth = 0;
        let baseHunt = { xp: 1, dropsValue: 1 };
        for (const [label, attrs] of builds) {
          const s = hero(tk, 4, { level: lv, attrs });
          const dp = depth(s);
          const hr = huntRun(s, zone);
          if (!attrs) {
            baseDepth = dp;
            baseHunt = hr;
          }
          const rd = dp / Math.max(1, baseDepth);
          const rx = hr.xp / Math.max(1, baseHunt.xp);
          const rv = hr.dropsValue / Math.max(1, baseHunt.dropsValue);
          const flag = attrs && rd > 1.25 && rx > 1.25 ? ' **>25% nos dois**' : '';
          if (flag) dumpFlags++;
          eRows.push(`| ${lv} | ${label} | ${computeCP(s)} | ${dp} (${pct(rd - 1, 0)}) | ${hr.xp} (${pct(rx - 1, 0)}) | ${Math.round(hr.dropsValue)} (${pct(rv - 1, 0)}) | ${hr.ceiling}${flag} |`);
        }
      }
    });
    P('Builds "tudo em um atributo" contra o balanceado (equip. T3+4 no nível 30, T4+4 no 60). Profundidade = andar mais fundo limpo em >= 80% das tentativas com HP cheio; renda de caça = XP e valor de referência dos materiais numa caça de 4 h (profundidade rasa, zona do nível).', '', '| Nível | Build | CP | Profundidade (vs bal.) | XP caça 4 h | Materiais 4 h (Ouro ref.) | Sub-nível |', '| --: | --- | --: | --: | --: | --: | --: |', ...eRows);
    P('', `Builds acima de +25% nos dois eixos ao mesmo tempo: ${dumpFlags}.`, '');
    P('Limites: chance de crítico vira 100% só com +100 pontos percentuais (a arma T6 dá 24% + 0,5%/refino + substats), CP trava em 1 (`combatPowerCore`); intervalo de ataque tem piso de 400 ms e AGI é limitado a 300 pontos (600 ms), nunca chega ao piso; resistência é assintótica (`rawDamage/(1+r)`), nunca zera o dano.', '');

    // ===== E. tier curve =======================================================================================================
    P('## E. Curva de tiers', '');
    P('CP de um herói de nível 100 (balanceado, +0) com cada par comum; `ΔCP` é o ganho sobre o par anterior; `custo` é a receita do tier (arma+armadura) em Ouro de referência; `cadeia` inclui as peças do tier anterior.', '');
    const eRows2: string[] = [];
    let prevCp = computeCP(hero('1', 0, { level: 100, rarity: 'common' }));
    const cpStarter = computeCP({ ...defaultSave(), xp: xpToReachLevel(100), ...(() => { const h = spendAttributePoints({ ...defaultSave(), xp: xpToReachLevel(100) }); return { str: h.str, vit: h.vit, agi: h.agi, res: h.res }; })() });
    let prevCost = 0;
    let prevRatio = 0;
    const ratios: string[] = [];
    for (const k of ['1', '2', '3', '4g', '4d', '5', '6']) {
      const [w, a] = PAIRS[k];
      const cp = computeCP(hero(k, 0, { level: 100 }));
      const gw = getGear(w);
      const ga = getGear(a);
      const own = goldEq(chainCost(w), true, w) + goldEq(chainCost(a), true, a);
      const chain = goldEq(chainCost(w)) + goldEq(chainCost(a));
      const prevForRatio = k === '1' ? cpStarter : k === '4d' ? computeCP(hero('3', 0, { level: 100 })) : prevCp;
      const dcp = cp - prevForRatio;
      const ratio = own / Math.max(1, dcp);
      eRows2.push(`| T${k} | ${gw.damage} / ${pct(gw.critChance ?? 0, 0)}${gw.burn ? ' +queima' : ''} | ${ga.maxHp} / ${pct(ga.resistance ?? 0, 0)} | ${cp} | +${dcp} (${pct(dcp / prevForRatio)}) | ${Math.round(own)} | ${Math.round(chain)} | ${f2(ratio)} |`);
      ratios.push(ratio.toFixed(2));
      if (k !== '4g') prevCp = cp;
      prevCost = own;
      prevRatio = ratio;
    }
    void prevCost;
    void prevRatio;
    P('| Tier | Arma (dano / crítico) | Armadura (HP / resist.) | CP (nv 100) | ΔCP vs anterior | Custo da receita (Ouro ref.) | Cadeia | Ouro ref. por ponto de CP ganho |', '| --- | --- | --- | --: | --: | --: | --: | --: |', ...eRows2);
    P('', '(T4 dragão é comparado ao T3; T5 ao T4 dragão, que é o ingrediente da receita do T5.)', '');

    // ===== F. refine and gems ==================================================================================================
    P('## F. Refino (+1..+8) e gemas', '');
    P('Custo esperado de cada passo = (Ouro + materiais a valor de referência + fragmentos x 2) / chance de sucesso (falha não rebaixa nem quebra a peça). CP: par comum do tier num herói do nível mínimo da receita.', '');
    const fRows: string[] = [];
    for (const k of ['2', '3', '5']) {
      const [w] = PAIRS[k];
      const item = getGear(w);
      let cum = 0;
      const base = computeCP(hero(k, 0));
      let last = base;
      for (let lvl = 0; lvl < 8; lvl++) {
        const c = upgradeCost(item, lvl);
        const g = c.gold + cargoReferenceValue((c.materials ?? {}) as Partial<Record<MaterialId, number>>) + (c.shards ?? 0) * 2;
        const exp = g / upgradeChance(lvl);
        cum += exp * 2; // both pieces
        const cp = computeCP(hero(k, lvl + 1));
        fRows.push(`| T${k} | +${lvl + 1} | ${Math.round(exp)} (x2 peças) | ${Math.round(cum)} | ${cp} | +${cp - last} (${pct(cp / last - 1)}) | ${f2((exp * 2) / Math.max(1, cp - last))} |`);
        last = cp;
      }
    }
    P('| Tier | Passo | Custo esperado do passo (arma+armadura) | Acumulado | CP | ΔCP | Ouro ref. por CP |', '| --- | --- | --: | --: | --: | --: | --: |', ...fRows);
    P('');
    const gRows: string[] = [];
    for (const k of ['3', '6']) {
      const base = hero(k, 4);
      const cp0 = computeCP(base);
      for (const g of GEMS) {
        let s = base;
        const w = s.gearInstances[`gi_${PAIRS[k][0]}`];
        s = { ...s, gearInstances: { ...s.gearInstances, [w.id]: { ...w, sockets: [g.id] } } };
        gRows.push(`| T${k}+4 | ${g.id} (${g.critDamageBonus ? '+15% dano crítico' : g.resistance ? '+0,08 resist.' : '+60 HP'}) | ${computeCP(s) - cp0} (${pct(computeCP(s) / cp0 - 1)}) | ${g.shardCost} fragmentos (= ~${g.shardCost * 2} Ouro ref.) | ${socketsForTier(tierNum(k))} soquetes |`);
      }
    }
    P('| Peça | Gema | ΔCP por gema | Custo | Soquetes do tier |', '| --- | --- | --: | --: | --: |', ...gRows);
    P('');

    console.log('\n' + out.join('\n') + '\n');
    void GEAR;
    void (null as unknown as GearItem);
    void (null as unknown as SubstatType);
    void emptyGems;
    void playerLevel;
    void HUNTING_ZONES;
  });
});
