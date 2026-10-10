# Auditoria de balanceamento dos itens (antes da rodada 3)

Medido em 2026-10-10 com `npm run sim:items` (`scripts/sim/itemAudit.sim.ts`), chamando as funções reais do jogo (`rollRarity`, `applyForge`, `buildCombatStats`, `computeCP`, `runDungeon`, `simulateHuntingSession`). Este arquivo registra o estado ANTES das correções; os números depois delas estão em `docs/BALANCE_CHANGES.md` (Rodada 3).

Métrica de "valor real de combate": a **margem do duelo** P = (tempo que o herói sobrevive) / (tempo que ele leva para matar) contra um inimigo de um andar de referência, em forma fechada (crítico esperado, lifesteal, resistência assintótica). P decide todas as lutas da Masmorra e da Caça; `Δln P` é a variação percentual de P por causa de uma mudança. O andar de referência é o mais alto andar comum (sem checkpoint nem chefe) onde o herói comum ainda tem P >= 1,25.

## Resumo dos achados

| # | Pergunta | Medido | Veredito / ação |
| --- | --- | --- | --- |
| A1 | A forja respeita 60/25/12/3? | 300 mil sorteios: 59,9 / 25,0 / 12,1 / 3,0 %; 20 mil `applyForge` reais: 60,5 / 24,8 / 11,6 / 3,2 % | OK. Só existe um ponto que sorteia raridade (`createGearInstance` dentro de `applyForge`). Reforja não muda raridade; não há modificador de nível nem de Passe. Nada a corrigir. |
| A2 | Custo de um lendário | 33,3 forjas do mesmo item; épico + lendário 35 forjas. Cadeia T6: ~10 mil Ouro ref. por forja -> ~340 mil Ouro ref. por lendário T6 | Informativo (tabela A). Lendário continua raro, nada a mudar. |
| B1 | Poder por raridade com substats medianas (arma + armadura) | rara +2,7 a +4,3 %, épica +10,5 a +13,0 %, lendária +20,8 a +26,0 % de CP | Já dentro de R1 na mediana, exceto a rara no T1 (+2,7 / +2,8 %). A rara tem `statMult` 1,0: só vale por UMA substat. Proposta: pequeno aumento do `statMult` da rara. |
| B2 | Variância das substats | lendária T1 +0: pior +8,5 %, melhor +49 % de CP; rara T1 +0: melhor +26 % | A cauda vem quase toda da substat `maxHp` (plana) no T1. Corrigida junto com C. |
| C1 | Valor das 5 substats de combate (mediana) | Δln P T1: critDmg 0,5 / critRate 3,7 / defesa 4,7 / lifesteal 5,6 / **maxHp 21,0**. T6: maxHp 3,7 / critDmg 3,1 / defesa 4,7 / critRate 5,4 / **lifesteal 19,1**. Razão máx/mín: T1 44x, T3 6x, T6 6x | **Fora da regra de 2x.** `maxHp` é plano e vale 5x o resto no T1 e quase nada no T6; `lifesteal` explode nos andares fundos (inimigo com muito mais HP que o herói); `critDamage` quase não vale nada com 3 % de chance de crítico. |
| C2 | `computeCP` avalia certo cada substat? | ΔCP T6: lifesteal 3,0 % contra 19 % real; maxHp T1 11 % contra 21 % real; critDmg 0,8 % contra 0,5 % | A CP subestima lifesteal fundo e maxHp cedo. Não mexi na fórmula da CP (ela está calibrada para a tabela de CP recomendada); proposta: ajustar os valores das substats. |
| C3 | `goldBonus` | 3-8 % +0,5/tier por peça: 22 % no máximo hoje com 2 peças; com 6 peças instanciadas chegaria a 66 % | Hoje só soma ao Ouro de Masmorra (App.tsx). Com os novos slots passaria dos 25 %. Proposta: reduzir a faixa e impor teto duro de 25 % no total equipado. |
| D1 | Valor de 1 ponto de atributo | VIT é o maior em CP (nível 10: +1,09 % por ponto; STR +0,73 %); do nível 60 em diante os quatro valem 0,16 a 0,28 % por ponto | Nenhum domina. Sem mudança. |
| D2 | Build "tudo em um atributo" contra o balanceado (níveis 30 e 60) | melhor concorrente: tudo STR no 60 com profundidade -2 % e materiais +17 %; nenhuma passa de +25 % nos dois eixos | R3 já vale. Sem mudança. |
| D3 | Limites e estouro | crítico: `Math.min(1, ...)` só na CP, o combate real nunca chega a 100 % (arma T6 24 % + substats); intervalo de ataque 600 ms com AGI 300 (o piso de 400 ms nunca é atingido); resistência assintótica | Sem estouro alcançável. Sem mudança. |
| E1 | Curva de tiers | Ouro ref. por ponto de CP ganho: T1 3,5; T2 2,3; **T3 7,2 (3,1x o T2)**; T4 dourado 8,5; T4 dragão 15,0; T5 17,3; T6 20,2 | T2 -> T3 passa de 2,5x (primeiro tier que pede gema, essência, caçada e punho de ébano). Não alterei receitas (mexe nos dias de progressão da R5); fica como pendência para o diretor. |
| E2 | Dourado x dragão (tier 4) | dourado: CP +176 por 1 489 Ouro ref.; dragão: +360 por 5 382. O T5 só aceita o dragão como ingrediente | Os dois são jogáveis (o dourado é a opção barata, nível 50), mas o dourado é um beco sem saída: não alimenta o T5. Informativo; sem mudança. |
| F1 | Refino | +1..+3 custam 50-150 Ouro; +4 já custa ~760-880 ref. por par; +8 ~8,6-9,1 mil ref. por par, sempre +12 a +28 CP por passo (~4-6 %) | Do +4 em diante o refino custa 17x a 200x mais Ouro por CP do que forjar o tier seguinte (7 Ouro ref. por CP no T3). Está dominado enquanto o tier seguinte estiver disponível; funciona como sumidouro de fim de tier. Fica como pendência. |
| F2 | Gemas | T3+4: rubi +0,9 % CP, safira +3,3 %, esmeralda +5,5 % (mesmo custo de 2 fragmentos); T6+4: rubi +1,5 %, safira +2,8 %, esmeralda +1,9 % | O rubi (+15 % de dano crítico) é estritamente dominado nos dois pontos. Proposta: +30 %. |

## A. Taxas de raridade da forja

Único ponto que sorteia raridade: `createGearInstance` (chamado só por `applyForge`) -> `rollRarity()`. Reforja (`applyReforge`) só re-sorteia as substats, nunca a raridade; não há modificador de nível, Passe de Batalha ou item. Starters e migração usam raridade fixa.

| Raridade | Tabela | `rollRarity` (300k) | `createGearInstance` (300k) | `applyForge` real (20k) |
| --- | --: | --: | --: | --: |
| common | 60% | 59.90% | 60.05% | 60.45% |
| rare | 25% | 24.99% | 25.00% | 24.82% |
| epic | 12% | 12.06% | 11.96% | 11.59% |
| legendary | 3% | 3.04% | 2.99% | 3.15% |

Número esperado de forjas do MESMO item (distribuição geométrica): >= 1 épico ou melhor 1/0,15 = 6.7; >= 1 lendário 1/0,03 = 33.3; um épico E um lendário: 1/0,12 + 1/0,03 - 1/0,15 = 35.0.

Custo por forja inclui a cadeia "2 do tier anterior" (cada peça do tier anterior foi forjada pelo jogador). Valores em Ouro de referência (Ouro + materiais a `baseGoldValue` + gemas/fragmentos a 2 Ouro por fragmento). O custo esperado multiplica o custo da cadeia pelo número de forjas: é um limite superior (as peças inferiores sorteadas "boas" são consumidas pela forja, a menos que o jogador as guarde).

| Item | Custo da cadeia (Ouro ref.) | Só a receita do tier | Forjas p/ 1 lendário | Custo esperado de 1 lendário | Forjas p/ épico + lendário | Custo esperado | Reforja pode mudar a raridade? |
| --- | --: | --: | --: | --: | --: | --: | --- |
| bronze_dagger | 158 | 158 | 33.3 | 5250 | 35.0 | 5513 | não |
| bronze_leather | 195 | 195 | 33.3 | 6500 | 35.0 | 6825 | não |
| iron_short_sword | 481 | 166 | 33.3 | 16017 | 35.0 | 16818 | não |
| iron_chainmail | 535 | 145 | 33.3 | 17817 | 35.0 | 18708 | não |
| steel_greatsword | 1795 | 834 | 33.3 | 59817 | 35.0 | 62808 | não |
| steel_plate | 1922 | 853 | 33.3 | 64067 | 35.0 | 67270 | não |
| voidsteel_blade | 6564 | 2044 | 33.3 | 218783 | 35.0 | 229723 | não |
| voidsteel_plate | 6592 | 2013 | 33.3 | 219733 | 35.0 | 230720 | não |
| abyssal_greatblade | 10104 | 3540 | 33.3 | 336783 | 35.0 | 353623 | não |
| abyssal_bulwark | 10026 | 3434 | 33.3 | 334183 | 35.0 | 350893 | não |
| gilded_warblade | 2548 | 754 | 33.3 | 84933 | 35.0 | 89180 | não |
| gilded_aegis | 2657 | 735 | 33.3 | 88567 | 35.0 | 92995 | não |
| dragon_flameblade | 4520 | 2725 | 33.3 | 150650 | 35.0 | 158183 | não |
| dragon_scale_armor | 4579 | 2657 | 33.3 | 152633 | 35.0 | 160265 | não |

Reforja: troca todas as substats pelo sorteio do tier, raridade/refino/sockets/durabilidade ficam. Chance de uma substat desejada aparecer numa reforja (uma das 6 sem repetir): rara 1/6 = 16,7%, épica 2/6 = 33,3%, lendária 3/6 = 50%. Ouro por tentativa: 10 / 25 / 50 / 90 / 150 / 240 / 360 / 500 (+ 1 fragmento + poeira/garra/sangue).

## B. Poder por raridade (arma + armadura da mesma raridade, atributos balanceados, sem gemas)

CP mediana de 400 sorteios de substats (min / max entre os sorteios). `vs comum` = CP mediana / CP da comum com as mesmas peças. `TTK` e `TTS` (tempo para matar / sobreviver) contra um inimigo do andar representativo do herói comum (margem P >= 1,25), no sorteio mediano.

| Tier | Raridade | CP mediana (min–max) | mediana vs comum | pior / melhor vs comum | TTK / TTS | Andar ref. |
| --- | --- | --: | --: | --: | --: | --: |
| T1 +0 | common | 106 (106–106) | 0.0% | 0.0% / 0.0% | 7.7 s / 10.4 s | 19 |
| T1 +0 | rare | 109 (106–134) | 2.8% | 0.0% / 26.4% | 7.3 s / 10.4 s | 19 |
| T1 +0 | epic | 119 (108–148) | 12.3% | 1.9% / 39.6% | 7.1 s / 13.4 s | 19 |
| T1 +0 | legendary | 133 (115–158) | 25.5% | 8.5% / 49.1% | 6.9 s / 14.6 s | 19 |
| T1 +8 | common | 146 (146–146) | 0.0% | 0.0% / 0.0% | 6.3 s / 11.2 s | 24 |
| T1 +8 | rare | 150 (146–180) | 2.7% | 0.0% / 23.3% | 6.0 s / 11.2 s | 24 |
| T1 +8 | epic | 165 (151–189) | 13.0% | 3.4% / 29.5% | 6.0 s / 13.3 s | 24 |
| T1 +8 | legendary | 184 (164–208) | 26.0% | 12.3% / 42.5% | 5.5 s / 16.1 s | 24 |
| T2 +0 | common | 226 (226–226) | 0.0% | 0.0% / 0.0% | 4.4 s / 18.6 s | 24 |
| T2 +0 | rare | 234 (226–259) | 3.5% | 0.0% / 14.6% | 4.1 s / 18.6 s | 24 |
| T2 +0 | epic | 252 (233–282) | 11.5% | 3.1% / 24.8% | 3.8 s / 19.9 s | 24 |
| T2 +0 | legendary | 277 (254–305) | 22.6% | 12.4% / 35.0% | 3.8 s / 27.0 s | 24 |
| T2 +8 | common | 324 (324–324) | 0.0% | 0.0% / 0.0% | 2.8 s / 23.7 s | 24 |
| T2 +8 | rare | 336 (324–366) | 3.7% | 0.0% / 13.0% | 2.8 s / 29.9 s | 24 |
| T2 +8 | epic | 362 (340–394) | 11.7% | 4.9% / 21.6% | 2.7 s / 35.2 s | 24 |
| T2 +8 | legendary | 401 (372–446) | 23.8% | 14.8% / 37.7% | 2.4 s / 38.6 s | 24 |
| T3 +0 | common | 461 (461–461) | 0.0% | 0.0% / 0.0% | 7.8 s / 10.0 s | 28 |
| T3 +0 | rare | 479 (461–509) | 3.9% | 0.0% / 10.4% | 7.8 s / 10.7 s | 28 |
| T3 +0 | epic | 513 (478–551) | 11.3% | 3.7% / 19.5% | 7.3 s / 11.9 s | 28 |
| T3 +0 | legendary | 563 (517–616) | 22.1% | 12.1% / 33.6% | 6.4 s / 13.7 s | 28 |
| T3 +8 | common | 676 (676–676) | 0.0% | 0.0% / 0.0% | 7.0 s / 9.0 s | 44 |
| T3 +8 | rare | 702 (676–728) | 3.8% | 0.0% / 7.7% | 6.9 s / 10.2 s | 44 |
| T3 +8 | epic | 756 (709–794) | 11.8% | 4.9% / 17.5% | 6.5 s / 11.4 s | 44 |
| T3 +8 | legendary | 838 (786–898) | 24.0% | 16.3% / 32.8% | 5.9 s / 11.7 s | 44 |
| T4g +0 | common | 789 (789–789) | 0.0% | 0.0% / 0.0% | 7.5 s / 10.9 s | 49 |
| T4g +0 | rare | 818 (789–845) | 3.7% | 0.0% / 7.1% | 7.5 s / 11.7 s | 49 |
| T4g +0 | epic | 872 (823–922) | 10.5% | 4.3% / 16.9% | 6.8 s / 12.2 s | 49 |
| T4g +0 | legendary | 953 (900–1010) | 20.8% | 14.1% / 28.0% | 6.4 s / 15.3 s | 49 |
| T4g +8 | common | 1135 (1135–1135) | 0.0% | 0.0% / 0.0% | 4.6 s / 13.9 s | 49 |
| T4g +8 | rare | 1178 (1135–1209) | 3.8% | 0.0% / 6.5% | 4.3 s / 13.9 s | 49 |
| T4g +8 | epic | 1259 (1196–1318) | 10.9% | 5.4% / 16.1% | 4.3 s / 15.7 s | 49 |
| T4g +8 | legendary | 1387 (1319–1472) | 22.2% | 16.2% / 29.7% | 4.1 s / 21.0 s | 49 |
| T5 +0 | common | 1329 (1329–1329) | 0.0% | 0.0% / 0.0% | 7.1 s / 9.1 s | 55 |
| T5 +0 | rare | 1386 (1329–1449) | 4.3% | 0.0% / 9.0% | 6.5 s / 9.1 s | 55 |
| T5 +0 | epic | 1484 (1398–1581) | 11.7% | 5.2% / 19.0% | 6.6 s / 10.6 s | 55 |
| T5 +0 | legendary | 1634 (1541–1771) | 22.9% | 16.0% / 33.3% | 5.5 s / 10.7 s | 55 |
| T5 +8 | common | 1960 (1960–1960) | 0.0% | 0.0% / 0.0% | 5.5 s / 8.9 s | 74 |
| T5 +8 | rare | 2037 (1960–2143) | 3.9% | 0.0% / 9.3% | 5.1 s / 8.9 s | 74 |
| T5 +8 | epic | 2198 (2083–2313) | 12.1% | 6.3% / 18.0% | 4.9 s / 10.1 s | 74 |
| T5 +8 | legendary | 2451 (2321–2663) | 25.1% | 18.4% / 35.9% | 4.5 s / 17.3 s | 74 |
| T6 +0 | common | 1893 (1893–1893) | 0.0% | 0.0% / 0.0% | 6.1 s / 9.3 s | 74 |
| T6 +0 | rare | 1969 (1893–2058) | 4.0% | 0.0% / 8.7% | 5.9 s / 9.7 s | 74 |
| T6 +0 | epic | 2114 (2011–2250) | 11.7% | 6.2% / 18.9% | 5.3 s / 10.0 s | 74 |
| T6 +0 | legendary | 2331 (2211–2501) | 23.1% | 16.8% / 32.1% | 5.1 s / 13.5 s | 74 |
| T6 +8 | common | 2811 (2811–2811) | 0.0% | 0.0% / 0.0% | 9.8 s / 12.7 s | 89 |
| T6 +8 | rare | 2922 (2811–3065) | 3.9% | 0.0% / 9.0% | 9.4 s / 13.1 s | 89 |
| T6 +8 | epic | 3153 (2997–3382) | 12.2% | 6.6% / 20.3% | 8.8 s / 14.3 s | 89 |
| T6 +8 | legendary | 3518 (3344–3846) | 25.2% | 19.0% / 36.8% | 8.4 s / 42.3 s | 89 |

## C. Valor de cada substat (uma substat de valor mediano numa armadura comum +4)

Valor mediano = (min+max)/2 + round(perTier x tier). `ΔCP` = variação da CP; `Δln P` = variação do log da margem do duelo no andar de referência (valor real de combate); `ΔKills/h` = variação de 1/TTK na caça de referência (zona do tier); `Δandares` = média de andares limpos numa corrida a partir do andar de referência (60 sorteios, sem poções).

| Tier | Substat | Valor mediano | ΔCP | Δln P (real) | ΔKills/h | Δandares |
| --- | --- | --: | --: | --: | --: | --: |
| T1 | critRate | 4% | 2.4% | 3.74% | 3.8% | +0.00 |
| T1 | critDamage | 10% | 0.8% | 0.48% | 0.5% | +0.00 |
| T1 | lifesteal | 3% | 1.6% | 5.57% | 0.0% | +0.00 |
| T1 | defense | 5% | 2.4% | 4.65% | 0.0% | +0.00 |
| T1 | maxHp | 33 | 11.2% | 21.03% | 0.0% | +0.00 |
| T1 | goldBonus | 6% | 0.0% | 0.00% | 0.0% | +0.00 |
| T3 | critRate | 5% | 2.3% | 4.37% | 4.5% | +0.17 |
| T3 | critDamage | 12% | 0.7% | 1.28% | 1.3% | +0.00 |
| T3 | lifesteal | 3% | 1.8% | 6.93% | 0.0% | +0.00 |
| T3 | defense | 6% | 2.5% | 5.29% | 0.0% | +0.00 |
| T3 | maxHp | 43 | 3.9% | 7.68% | 0.0% | +0.00 |
| T3 | goldBonus | 7% | 0.0% | 0.00% | 0.0% | +0.00 |
| T6 | critRate | 7% | 2.7% | 5.41% | 5.6% | +0.07 |
| T6 | critDamage | 15% | 1.5% | 3.05% | 3.1% | +0.13 |
| T6 | lifesteal | 4% | 3.0% | 19.07% | 0.0% | +0.18 |
| T6 | defense | 7% | 2.4% | 4.71% | 0.0% | +0.00 |
| T6 | maxHp | 58 | 1.9% | 3.68% | 0.0% | +0.00 |
| T6 | goldBonus | 9% | 0.0% | 0.00% | 0.0% | +0.00 |

Média por tier do Δln P dos 5 substats de combate (referência para a regra de 2x): T1: 7.09% · T3: 5.11% · T6: 7.18%

Soma do `goldBonus` possível: 2 peças x (8 + 0,5 x 6) = 22% no máximo hoje (só o Ouro da Masmorra, App.tsx finishRun); com 6 peças instanciadas chegaria a 66%.

## D. Atributos primários

Valores do jogo: STR = +0,5 de dano plano e +0,3% de (golpe base + arma) por ponto; VIT = 5 HP/ponto; AGI = intervalo 400 + 800/(1+AGI/100) ms (teto de 300 pontos); RES = 0.005 de resistência/ponto.

Valor de +1 ponto num herói balanceado (35/30/20/15):

| Nível | Equip. | CP | Andar ref. | +1 STR | +1 VIT | +1 AGI | +1 RES |
| --: | --- | --: | --: | --- | --- | --- | --- |
| 10 | T2+4 | 274 | 24 | STR: 0.73% CP / 1.07% P | VIT: 1.09% CP / 1.68% P | AGI: 0.36% CP / 0.61% P | RES: 0.36% CP / 0.00% P |
| 30 | T3+4 | 610 | 39 | STR: 0.16% CP / 0.63% P | VIT: 0.33% CP / 0.85% P | AGI: 0.16% CP / 0.53% P | RES: 0.16% CP / 0.98% P |
| 60 | T4g+4 | 1062 | 49 | STR: 0.28% CP / 0.47% P | VIT: 0.28% CP / 0.52% P | AGI: 0.19% CP / 0.44% P | RES: 0.19% CP / 0.00% P |
| 100 | T6+4 | 2509 | 79 | STR: 0.16% CP / 0.31% P | VIT: 0.16% CP / 0.30% P | AGI: 0.16% CP / 0.35% P | RES: 0.16% CP / 0.41% P |

Builds "tudo em um atributo" contra o balanceado (equip. T3+4 no nível 30, T4+4 no 60). Profundidade = andar mais fundo limpo em >= 80% das tentativas com HP cheio; renda de caça = XP e valor de referência dos materiais numa caça de 4 h (profundidade rasa, zona do nível).

| Nível | Build | CP | Profundidade (vs bal.) | XP caça 4 h | Materiais 4 h (Ouro ref.) | Sub-nível |
| --: | --- | --: | --: | --: | --: | --: |
| 30 | balanceado 35/30/20/15 | 610 | 45 (0%) | 11583 (0%) | 770 (0%) | 10 |
| 30 | tudo STR | 576 | 39 (-13%) | 11595 (0%) | 737 (-4%) | 10 |
| 30 | tudo VIT | 624 | 45 (0%) | 11583 (0%) | 632 (-18%) | 9 |
| 30 | tudo AGI | 533 | 39 (-13%) | 11589 (0%) | 860 (12%) | 10 |
| 30 | tudo RES | 522 | 35 (-22%) | 11583 (0%) | 632 (-18%) | 9 |
| 30 | STR+VIT 50/50 | 628 | 44 (-2%) | 11586 (0%) | 745 (-3%) | 10 |
| 60 | balanceado 35/30/20/15 | 1062 | 50 (0%) | 18568 (0%) | 734 (0%) | 9 |
| 60 | tudo STR | 960 | 49 (-2%) | 18570 (0%) | 856 (17%) | 9 |
| 60 | tudo VIT | 987 | 49 (-2%) | 18542 (-0%) | 534 (-27%) | 8 |
| 60 | tudo AGI | 858 | 49 (-2%) | 18593 (0%) | 780 (6%) | 9 |
| 60 | tudo RES | 866 | 49 (-2%) | 18542 (-0%) | 534 (-27%) | 8 |
| 60 | STR+VIT 50/50 | 1055 | 50 (0%) | 18590 (0%) | 589 (-20%) | 9 |

Builds acima de +25% nos dois eixos ao mesmo tempo: 0.

Limites: chance de crítico vira 100% só com +100 pontos percentuais (a arma T6 dá 24% + 0,5%/refino + substats), CP trava em 1 (`combatPowerCore`); intervalo de ataque tem piso de 400 ms e AGI é limitado a 300 pontos (600 ms), nunca chega ao piso; resistência é assintótica (`rawDamage/(1+r)`), nunca zera o dano.

## E. Curva de tiers

CP de um herói de nível 100 (balanceado, +0) com cada par comum; `ΔCP` é o ganho sobre o par anterior; `custo` é a receita do tier (arma+armadura) em Ouro de referência; `cadeia` inclui as peças do tier anterior.

| Tier | Arma (dano / crítico) | Armadura (HP / resist.) | CP (nv 100) | ΔCP vs anterior | Custo da receita (Ouro ref.) | Cadeia | Ouro ref. por ponto de CP ganho |
| --- | --- | --- | --: | --: | --: | --: | --: |
| T1 | 12 / 3% | 40 / 3% | 720 | +100 (16.1%) | 353 | 353 | 3.52 |
| T2 | 30 / 6% | 90 / 6% | 855 | +135 (18.8%) | 310 | 1015 | 2.30 |
| T3 | 65 / 10% | 160 / 10% | 1089 | +234 (27.4%) | 1687 | 3717 | 7.21 |
| T4g | 90 / 14% | 220 / 13% | 1265 | +176 (16.2%) | 1489 | 5205 | 8.46 |
| T4d | 120 / 18% +queima | 260 / 15% | 1449 | +360 (33.1%) | 5382 | 9099 | 14.95 |
| T5 | 160 / 20% +queima | 340 / 17% | 1684 | +235 (16.2%) | 4057 | 13156 | 17.26 |
| T6 | 220 / 24% +queima | 440 / 20% | 2030 | +346 (20.5%) | 6974 | 20129 | 20.15 |

(T4 dragão é comparado ao T3; T5 ao T4 dragão, que é o ingrediente da receita do T5.)

## F. Refino (+1..+8) e gemas

Custo esperado de cada passo = (Ouro + materiais a valor de referência + fragmentos x 2) / chance de sucesso (falha não rebaixa nem quebra a peça). CP: par comum do tier num herói do nível mínimo da receita.

| Tier | Passo | Custo esperado do passo (arma+armadura) | Acumulado | CP | ΔCP | Ouro ref. por CP |
| --- | --- | --: | --: | --: | --: | --: |
| T2 | +1 | 50 (x2 peças) | 100 | 238 | +12 (5.3%) | 8.33 |
| T2 | +2 | 100 (x2 peças) | 300 | 250 | +12 (5.0%) | 16.67 |
| T2 | +3 | 150 (x2 peças) | 600 | 262 | +12 (4.8%) | 25.00 |
| T2 | +4 | 759 (x2 peças) | 2118 | 274 | +12 (4.6%) | 126.46 |
| T2 | +5 | 1144 (x2 peças) | 4406 | 287 | +13 (4.7%) | 176.04 |
| T2 | +6 | 1658 (x2 peças) | 7723 | 299 | +12 (4.2%) | 276.39 |
| T2 | +7 | 4992 (x2 peças) | 17707 | 312 | +13 (4.3%) | 768.03 |
| T2 | +8 | 8635 (x2 peças) | 34977 | 324 | +12 (3.8%) | 1439.17 |
| T3 | +1 | 50 (x2 peças) | 100 | 489 | +28 (6.1%) | 3.57 |
| T3 | +2 | 100 (x2 peças) | 300 | 514 | +25 (5.1%) | 8.00 |
| T3 | +3 | 150 (x2 peças) | 600 | 542 | +28 (5.4%) | 10.71 |
| T3 | +4 | 881 (x2 peças) | 2363 | 568 | +26 (4.8%) | 67.79 |
| T3 | +5 | 1284 (x2 peças) | 4931 | 596 | +28 (4.9%) | 91.73 |
| T3 | +6 | 1822 (x2 peças) | 8574 | 622 | +26 (4.4%) | 140.13 |
| T3 | +7 | 5319 (x2 peças) | 19212 | 650 | +28 (4.5%) | 379.92 |
| T3 | +8 | 9125 (x2 peças) | 37462 | 676 | +26 (4.0%) | 701.92 |
| T5 | +1 | 50 (x2 peças) | 100 | 1408 | +79 (5.9%) | 1.27 |
| T5 | +2 | 100 (x2 peças) | 300 | 1486 | +78 (5.5%) | 2.56 |
| T5 | +3 | 150 (x2 peças) | 600 | 1565 | +79 (5.3%) | 3.80 |
| T5 | +4 | 812 (x2 peças) | 2224 | 1643 | +78 (5.0%) | 20.82 |
| T5 | +5 | 1205 (x2 peças) | 4634 | 1722 | +79 (4.8%) | 30.51 |
| T5 | +6 | 1729 (x2 peças) | 8092 | 1801 | +79 (4.6%) | 43.78 |
| T5 | +7 | 5079 (x2 peças) | 18250 | 1880 | +79 (4.4%) | 128.58 |
| T5 | +8 | 8765 (x2 peças) | 35780 | 1960 | +80 (4.3%) | 219.13 |

| Peça | Gema | ΔCP por gema | Custo | Soquetes do tier |
| --- | --- | --: | --: | --: |
| T3+4 | ruby (+15% dano crítico) | 5 (0.9%) | 2 fragmentos (= ~4 Ouro ref.) | 2 soquetes |
| T3+4 | sapphire (+0,08 resist.) | 19 (3.3%) | 2 fragmentos (= ~4 Ouro ref.) | 2 soquetes |
| T3+4 | emerald (+60 HP) | 31 (5.5%) | 2 fragmentos (= ~4 Ouro ref.) | 2 soquetes |
| T6+4 | ruby (+15% dano crítico) | 36 (1.5%) | 2 fragmentos (= ~4 Ouro ref.) | 4 soquetes |
| T6+4 | sapphire (+0,08 resist.) | 65 (2.8%) | 2 fragmentos (= ~4 Ouro ref.) | 4 soquetes |
| T6+4 | emerald (+60 HP) | 45 (1.9%) | 2 fragmentos (= ~4 Ouro ref.) | 4 soquetes |



