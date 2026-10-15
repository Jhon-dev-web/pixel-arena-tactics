> **2026-10-12 (Rodada 10):** os degraus de tier de cada linha de equipamento foram refeitos (anéis e luvas ganham crítico a cada tier, botas / escudos / elmo / anel dos tiers 5-6 e a armadura e a arma do tier 6 sobem), o dragão passou a ser feito do dourado (uma cadeia por linha) e os únicos mudaram de tier. Seção **N** (nova) e tabelas **E** e **G** regeradas; o resto do arquivo descreve o estado de antes. Ver `docs/BALANCE_CHANGES.md`, Rodada 10.
>
> **2026-10-12 (Rodada 9):** a tabela de raridade da forja passou de 60 / 25 / 12 / 3 para **63 / 25 / 10 / 2** (as peças raras agora serão vendidas), e o Selo do Ferreiro para 83,3% épica / 16,7% lendária. Custo esperado do MESMO item: épico ou melhor 1 / 0,12 = 8,3 forjas (era 6,7); lendário 1 / 0,02 = **50** forjas (era 33,3, uma em 50); épico e lendário 51,7 (era 35,0). Multiplique por 1,5 a coluna "custo esperado de 1 lendário" abaixo; as demais seções (poder por raridade, variância das substats) não dependem das chances e continuam valendo. Selos: 3 por temporada x 2/12 = 0,5 lendária esperada.

> **2026-10-11:** a moeda rara (`shards` no código e nos saves) agora se chama **Runas** (pt) / **Runes** (en) para o jogador; neste documento ela aparece como "Fragmento(s)" / "Shards", o nome antigo.

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
| D1 | Valor de 1 ponto de atributo | Antes (Rodada 8): do nível 5 ao 30 VIT valia até 4,7x RES (1,93 contra 0,41 por ponto no nível 5; 0,60 contra 0,31 no 30) e no nível 100 AGI valia 1,6x VIT; STR e VIT cedo valem muito mais que o resto | Corrigido na Rodada 8 (seção D): máx/mín <= 2,46 nos níveis 5-10 e <= 1,43 do 20 ao 100, com e sem habilidades. Build "tudo VIT/RES" ainda perde 37-41% de materiais no nível 60 (ponto aberto para o diretor). |
| D2 | Build "tudo em um atributo" contra o balanceado (níveis 30 e 60) | melhor concorrente: tudo STR no 60 com profundidade -2 % e materiais +17 %; nenhuma passa de +25 % nos dois eixos | R3 já vale. Sem mudança. |
| D3 | Limites e estouro | crítico: `Math.min(1, ...)` só na CP, o combate real nunca chega a 100 % (arma T6 24 % + substats); intervalo de ataque 600 ms com AGI 300 (o piso de 400 ms nunca é atingido); resistência assintótica | Sem estouro alcançável. Sem mudança. |
| E1 | Curva de tiers | Ouro ref. por ponto de CP ganho: T1 3,5; T2 2,3; **T3 7,2 (3,1x o T2)**; T4 dourado 8,5; T4 dragão 15,0; T5 17,3; T6 20,2 | T2 -> T3 passa de 2,5x (primeiro tier que pede gema, essência, caçada e punho de ébano). Não alterei receitas (mexe nos dias de progressão da R5); fica como pendência para o diretor. |
| E2 | Dourado x dragão (tier 4) | dourado: CP +176 por 1 489 Ouro ref.; dragão: +360 por 5 382. O T5 só aceita o dragão como ingrediente | Os dois são jogáveis (o dourado é a opção barata, nível 50), mas o dourado é um beco sem saída: não alimenta o T5. **Corrigido na Rodada 10:** o dragão é feito do dourado (uma cadeia: aço > dourado > dragão > voidsteel > abissal); o dourado deixa de ser beco sem saída e nenhuma peça é pior que outra mais barata. |
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

**Rodada 8 (11/10/2026).** Gerado por `npm run sim:items` (`scripts/sim/attrAudit.ts`, seção D de `itemAudit.sim.ts`); os mesmos limites são testes em `src/game/__tests__/attributes.test.ts`. As tabelas ANTES da mudança estão no commit `3f97d9f` (`docs: primary attribute audit with skills`); abaixo ficam o resumo antes -> depois e as tabelas geradas DEPOIS.

Perguntas: os quatro atributos básicos (STR, VIT, AGI, RES) valem parecido por ponto, com e sem habilidades? Os retornos diminuem? Um build "tudo em um atributo" é uma escolha real ou uma armadilha? A CP empurra o jogador para o atributo certo? Limites do diretor: **B1** do nível 20 em diante o melhor atributo vale no máximo 1,6x o pior por ponto (2,5x nos níveis 5 a 10), sem habilidades e com cada caminho; **B2** nenhum build "tudo em um" bate o balanceado nos dois eixos (profundidade e caça) nem fica mais de 35% abaixo em algum; **B3** retornos nunca crescem e nada despenca antes do teto; **B4** CP dentro de +-30% do valor real.

### Resumo: antes -> depois

O que mudou (só números; STR e os pesos da CP ficaram como estavam):

| Constante | Antes | Depois | Por quê |
| --- | --: | --: | --- |
| `vitHpPerPoint` | 5 | 4,5 | base do PV por ponto de VIT |
| `vitHpPerLevel` (novo) | - | 0,03 | o ponto de VIT passa a valer 4,5 + 0,03 x nível PV (4,6 no nível 5; 6,3 no 60; 7,5 no 100). Com 5 fixos, um ponto era 2,1% do PV de um herói de nível 5 e 0,2% de um de nível 100: VIT ia de o melhor atributo (1,9% por ponto) ao pior (0,20%) |
| `resHpPerPoint` (novo) | - | 2 | benefício secundário da RES: 2 PV por ponto, que vale muito cedo (PV baixo) e quase nada tarde, exatamente o formato que faltava (a RES valia 0,41% por ponto no nível 5 e 0,25% no 100, a metade dos outros) |
| `agiHalfPoint` | 100 | 80 | AGI era o pior valor no começo (0,60% por ponto contra 1,6% de STR no nível 5, razão 2,7x). Intervalo = 400 + 800/(1+AGI/80) ms; AGI 0 continua 1200 ms; no teto de 300 pontos o intervalo vai de 600 para 568 ms |
| orcs (andares 26-49) `hp` / `dmg` | 310 / 46 | 325 / 48 | com os novos valores o herói sai uns 3% mais forte nesses andares (a chegada ao andar 50 ia ao dia 11) |
| `strengthFlatDamage`, `strengthWeaponScalePerPoint`, `resResistPerPoint`, pesos da CP | - | iguais | cortar o dano plano de STR de 0,5 para 0,35 também resolvia o nível 5, mas custava 2 a 3% de CP em toda a metade do jogo e atrasava o andar 50 em dias; a CP já acompanha o valor real (B4) |

Valor real por ponto (100 x ln da razão da margem do duelo; herói sem habilidades) e razão melhor/pior:

| Nível | STR antes -> depois | VIT | AGI | RES | máx/mín antes -> depois (sem hab. / Guerreiro / Guardião) | limite |
| --: | --- | --- | --- | --- | --- | --: |
| 5 | 1,59 -> 1,59 | 1,93 -> 1,81 | 0,60 -> 0,73 | 0,41 -> 1,22 | 4,69 -> 2,46 / 4,69 -> 2,46 / 4,67 -> 2,45 | 2,5 |
| 10 | 1,00 -> 1,00 | 1,19 -> 1,13 | 0,58 -> 0,70 | 0,39 -> 0,87 | 3,09 -> 1,61 / 3,09 -> 1,61 / 3,06 -> 1,63 | 2,5 |
| 20 | 0,79 -> 0,79 | 0,85 -> 0,83 | 0,54 -> 0,64 | 0,36 -> 0,69 | 2,38 -> 1,30 / 2,38 -> 1,41 / 2,28 -> 1,30 | 1,6 |
| 30 | 0,52 -> 0,52 | 0,60 -> 0,62 | 0,46 -> 0,54 | 0,31 -> 0,55 | 1,94 -> 1,20 / 1,91 -> 1,27 / 1,72 -> 1,20 | 1,6 |
| 45 | 0,44 -> 0,44 | 0,45 -> 0,49 | 0,42 -> 0,49 | 0,29 -> 0,46 | 1,55 -> 1,13 / 1,53 -> 1,11 / 1,36 -> 1,21 | 1,6 |
| 60 | 0,38 -> 0,38 | 0,36 -> 0,41 | 0,38 -> 0,43 | 0,28 -> 0,41 | 1,37 -> 1,15 / 1,36 -> 1,08 / 1,25 -> 1,27 | 1,6 |
| 80 | 0,31 -> 0,31 | 0,26 -> 0,33 | 0,34 -> 0,38 | 0,27 -> 0,36 | 1,29 -> 1,22 / 1,20 -> 1,20 / 1,11 -> 1,36 | 1,6 |
| 100 | 0,27 -> 0,27 | 0,20 -> 0,26 | 0,31 -> 0,34 | 0,25 -> 0,32 | 1,56 -> 1,28 / 1,45 -> 1,24 / 1,38 -> 1,43 | 1,6 |

B1 vale em todas as 24 células. Nos níveis 5 e 10 o herói com a clava e os trapos iniciais (primeiro dia, nada forjado) continua fora do limite (STR 3,0 e VIT 3,2 contra AGI 0,73 no nível 5, razão 4,3; razão 3,7 no 10): lá os pontos de STR e VIT valem muito porque o dano base e o PV base são minúsculos; é sensibilidade, não regra (tabela abaixo). As habilidades quase não mexem no valor de um ponto: o Esmagador cresce junto com o dano (STR igual) e a Fúria é por tempo, não por golpe (AGI vale 7 a 11% menos no Guerreiro).

CP contra valor real (2 x ln do núcleo da CP contra ln da margem, B4): antes 0,88 a 1,13 em todas as células; depois 0,89 a 1,13. A discrepância que a medição anterior mostrava (nível 30, VIT 0,31% na CP contra 0,85% real) era o arredondamento da CP para inteiro num único ponto, não os pesos: a CP é a raiz de (dano x PV efetivo), então 1% a mais de PV é +0,5% de CP e +1% de margem. Não precisei mexer nos pesos.

Retornos (tabela D.2): todos os atributos diminuem a cada ponto empilhado, nos níveis 30 e 60 e nos três modos. AGI cai mais rápido (0,69 com 0 pontos, 0,16 com 150, 4,3x), VIT e STR de 0,53 e 0,49 para 0,30 e 0,28, RES o mais devagar (0,44 -> 0,32). Nenhum aumenta (violações de crescimento: 0) e nenhum cai abaixo de 20% do valor inicial antes do teto (B3 ok).

Builds (B2, tabela D.3; materiais comparados no lugar de caça do balanceado, profundidade em andares):

| Build | Nível | Profundidade antes -> depois | Materiais antes -> depois |
| --- | --: | --- | --- |
| tudo STR | 60 | +2% -> -8% | +9% -> +6% |
| tudo VIT | 60 | +4% -> +3% | **-40% -> -41%** |
| tudo AGI | 60 | +2% -> -8% | -2% -> 0% |
| tudo RES | 60 | -5% -> -5% | **-39% -> -41%** |
| tudo VIT / RES (Guardião) | 60 | 0% / -7% -> 0% / 0% | **-42% / -38% -> -41% / -37%** |
| tudo VIT / RES (Guerreiro) | 60 | 0% / -8% -> -1% / 0% | -12% / -18% -> -19% / -24% |
| tudo VIT / RES | 100 | -1% -> 0% | -25% / -27% -> -26% / -28% |
| tudo STR / AGI | 100 | -1% -> -1% | +5% / +4% -> +5% / +7% |

Nenhum build "tudo em um" bate o balanceado nos dois eixos por mais de 5%. **Limite não atingido:** no nível 60, VIT e RES todos os pontos perdem 37 a 41% de materiais (limite 35%), com ou sem habilidades de Guardião, e já perdiam 38 a 42% antes. Não é o valor do ponto: VIT e RES valem tanto quanto STR e AGI na margem do duelo (e o build defensivo fica igual ou melhor na profundidade), mas a Caça só paga por velocidade de morte (a luta começa sempre com HP cheio), e abaixo do ritmo de referência (220 mortes/h) os materiais crescem linearmente com as mortes, o que acontece justamente nos níveis 50 a 70. Reduzir STR e AGI até fechar a diferença (testei escala de STR 0,0024 e `agiHalfPoint` 140) estragava B1 nos níveis 5 e 20 sem passar de -33%; o conserto honesto está na economia da Caça (ver decisões para o diretor em `BALANCE_CHANGES.md`), não nos atributos.

Efeito de zona: no nível 30 do Guerreiro, "tudo STR" mostra +66% de XP porque o build escolhe a zona de maior material (a zona 2 libera no andar 26), uma escolha de lugar, não uma vantagem de combate; por isso o teste de B2 compara a caça no lugar do balanceado.

### Tabelas geradas (DEPOIS)

Valores do jogo: STR = +0.5 de dano plano e +0.3% de (golpe base + arma) por ponto; VIT = 4.5 HP/ponto; AGI = intervalo 400 + 800/(1+AGI/80) ms (teto de 300 pontos); RES = 0.005 de resistência/ponto.

Herói de cada nível: o conjunto completo do tier (arma, armadura, elmo, luvas, botas, anel, escudo; comum, sem gemas) no refino típico; pontos de atributo 35/30/20/15 (política do jogador simulado); habilidades compradas na ordem do caminho até onde o nível permite (1 ponto a cada 5 níveis).

### D.1 Valor real e valor no CP de um ponto

Média por ponto dos PRÓXIMOS 10 pontos de cada atributo (o PV máx é arredondado e um ponto de VIT vale poucos PV, então um ponto isolado se perde no arredondamento). "Real" = 100 x ln da razão da margem do duelo P contra um inimigo do andar de referência do herói; "CP" = 100 x 2 x ln do CP bruto (o CP é a raiz de dano x PV efetivo, então o fator 2 coloca os dois na mesma escala). `máx/mín` = melhor atributo / pior.

#### sem habilidades

| Nível | Equip. | Andar ref. | PV | STR real / CP | VIT real / CP | AGI real / CP | RES real / CP | máx/mín real | limite | CP/real (mín–máx) |
| --: | --- | --: | --: | --- | --- | --- | --- | --: | --: | --- |
| 5 | T1+2 | 24 | 237 | 1.59 / 1.59 | 1.81 / 1.81 | 0.73 / 0.73 | 1.22 / 1.22 | 2.46 | 2.5 | 1.00–1.00 |
| 10 | T2+2 | 24 | 401 | 1.00 / 1.00 | 1.13 / 1.13 | 0.70 / 0.70 | 0.87 / 0.87 | 1.61 | 2.5 | 1.00–1.00 |
| 20 | T2+6 | 26 | 586 | 0.79 / 0.79 | 0.83 / 0.83 | 0.64 / 0.64 | 0.69 / 0.69 | 1.30 | 1.6 | 1.00–1.00 |
| 30 | T3+4 | 26 | 843 | 0.52 / 0.57 | 0.62 / 0.62 | 0.54 / 0.59 | 0.55 / 0.55 | 1.20 | 1.6 | 1.00–1.09 |
| 45 | T3+8 | 41 | 1151 | 0.44 / 0.47 | 0.49 / 0.49 | 0.48 / 0.53 | 0.46 / 0.47 | 1.13 | 1.6 | 1.00–1.09 |
| 60 | T4+6 | 59 | 1497 | 0.38 / 0.41 | 0.41 / 0.41 | 0.43 / 0.47 | 0.41 / 0.41 | 1.15 | 1.6 | 1.00–1.09 |
| 80 | T5+6 | 77 | 2079 | 0.31 / 0.33 | 0.33 / 0.33 | 0.38 / 0.40 | 0.36 / 0.36 | 1.22 | 1.6 | 0.98–1.06 |
| 100 | T6+8 | 99 | 2805 | 0.27 / 0.28 | 0.26 / 0.26 | 0.34 / 0.35 | 0.32 / 0.31 | 1.28 | 1.6 | 0.96–1.04 |

#### Guerreiro

| Nível | Equip. | Andar ref. | PV | STR real / CP | VIT real / CP | AGI real / CP | RES real / CP | máx/mín real | limite | CP/real (mín–máx) |
| --: | --- | --: | --: | --- | --- | --- | --- | --: | --: | --- |
| 5 | T1+2 | 24 | 237 | 1.59 / 1.59 | 1.81 / 1.81 | 0.73 / 0.73 | 1.22 / 1.22 | 2.46 | 2.5 | 1.00–1.00 |
| 10 | T2+2 | 26 | 401 | 1.00 / 1.00 | 1.13 / 1.13 | 0.70 / 0.70 | 0.87 / 0.87 | 1.61 | 2.5 | 1.00–1.00 |
| 20 | T2+6 | 26 | 586 | 0.79 / 0.79 | 0.83 / 0.83 | 0.59 / 0.59 | 0.69 / 0.69 | 1.41 | 1.6 | 1.00–1.00 |
| 30 | T3+4 | 31 | 843 | 0.53 / 0.57 | 0.62 / 0.62 | 0.49 / 0.53 | 0.55 / 0.55 | 1.28 | 1.6 | 1.00–1.09 |
| 45 | T3+8 | 52 | 1151 | 0.44 / 0.47 | 0.49 / 0.49 | 0.44 / 0.48 | 0.47 / 0.47 | 1.11 | 1.6 | 1.00–1.08 |
| 60 | T4+6 | 74 | 1497 | 0.38 / 0.41 | 0.41 / 0.41 | 0.40 / 0.43 | 0.42 / 0.42 | 1.08 | 1.6 | 1.00–1.08 |
| 80 | T5+6 | 99 | 2079 | 0.31 / 0.32 | 0.33 / 0.33 | 0.35 / 0.37 | 0.37 / 0.36 | 1.20 | 1.6 | 0.97–1.05 |
| 100 | T6+8 | 99 | 2805 | 0.27 / 0.28 | 0.26 / 0.26 | 0.32 / 0.33 | 0.33 / 0.31 | 1.24 | 1.6 | 0.95–1.03 |

#### Guardião

| Nível | Equip. | Andar ref. | PV | STR real / CP | VIT real / CP | AGI real / CP | RES real / CP | máx/mín real | limite | CP/real (mín–máx) |
| --: | --- | --: | --: | --- | --- | --- | --- | --: | --: | --- |
| 5 | T1+2 | 24 | 243 | 1.59 / 1.59 | 1.80 / 1.80 | 0.73 / 0.73 | 1.24 / 1.24 | 2.45 | 2.5 | 1.00–1.00 |
| 10 | T2+2 | 26 | 421 | 1.00 / 1.00 | 1.14 / 1.14 | 0.70 / 0.70 | 0.87 / 0.87 | 1.63 | 2.5 | 1.00–1.00 |
| 20 | T2+6 | 26 | 630 | 0.79 / 0.79 | 0.84 / 0.84 | 0.64 / 0.64 | 0.70 / 0.70 | 1.30 | 1.6 | 1.00–1.00 |
| 30 | T3+4 | 27 | 906 | 0.52 / 0.57 | 0.62 / 0.62 | 0.54 / 0.59 | 0.59 / 0.60 | 1.19 | 1.6 | 1.00–1.09 |
| 45 | T3+8 | 45 | 1237 | 0.44 / 0.45 | 0.52 / 0.52 | 0.48 / 0.50 | 0.53 / 0.53 | 1.21 | 1.6 | 1.01–1.04 |
| 60 | T4+6 | 69 | 1609 | 0.35 / 0.39 | 0.43 / 0.43 | 0.40 / 0.45 | 0.44 / 0.46 | 1.27 | 1.6 | 1.01–1.13 |
| 80 | T5+6 | 95 | 2235 | 0.30 / 0.31 | 0.35 / 0.34 | 0.35 / 0.39 | 0.41 / 0.38 | 1.36 | 1.6 | 0.94–1.11 |
| 100 | T6+8 | 99 | 3015 | 0.27 / 0.27 | 0.29 / 0.27 | 0.32 / 0.34 | 0.38 / 0.34 | 1.43 | 1.6 | 0.89–1.07 |

Sensibilidade, primeiro dia (clava e trapos iniciais, nada forjado; não entra nos limites):

| Nível | PV | STR | VIT | AGI | RES | máx/mín real |
| --: | --: | --: | --: | --: | --: | --: |
| 5 | 127 | 3.03 | 3.15 | 0.73 | 1.95 | 4.29 |
| 10 | 176 | 2.56 | 2.41 | 0.70 | 1.55 | 3.65 |

### D.2 Retornos: valor do PRÓXIMO ponto conforme os pontos já postos nesse atributo

Os outros três ficam como a política 35/30/20/15 do nível os deixou; † = acima dos pontos que o nível dá (herói hipotético, só para ver a forma da curva).

#### Nível 30 (90 pontos)

| Habilidades | Atributo | 0 | 25 | 50 | 100† | 150† |
| --- | --- | --: | --: | --: | --: | --: |
| sem habilidades | STR | 0.62 | 0.53 | 0.47 | 0.38 | 0.32 |
| sem habilidades | VIT | 0.75 | 0.63 | 0.54 | 0.43 | 0.35 |
| sem habilidades | AGI | 0.70 | 0.49 | 0.37 | 0.23 | 0.16 |
| sem habilidades | RES | 0.57 | 0.53 | 0.50 | 0.44 | 0.40 |
| Guerreiro | STR | 0.63 | 0.54 | 0.48 | 0.39 | 0.32 |
| Guerreiro | VIT | 0.75 | 0.63 | 0.54 | 0.43 | 0.35 |
| Guerreiro | AGI | 0.62 | 0.45 | 0.34 | 0.22 | 0.15 |
| Guerreiro | RES | 0.57 | 0.53 | 0.50 | 0.44 | 0.40 |
| Guardião | STR | 0.62 | 0.54 | 0.47 | 0.38 | 0.32 |
| Guardião | VIT | 0.75 | 0.63 | 0.54 | 0.43 | 0.35 |
| Guardião | AGI | 0.70 | 0.50 | 0.37 | 0.24 | 0.16 |
| Guardião | RES | 0.61 | 0.56 | 0.53 | 0.46 | 0.42 |

#### Nível 60 (180 pontos)

| Habilidades | Atributo | 0 | 25 | 50 | 100 | 150 |
| --- | --- | --: | --: | --: | --: | --: |
| sem habilidades | STR | 0.49 | 0.44 | 0.40 | 0.33 | 0.28 |
| sem habilidades | VIT | 0.53 | 0.47 | 0.42 | 0.35 | 0.30 |
| sem habilidades | AGI | 0.69 | 0.49 | 0.37 | 0.23 | 0.16 |
| sem habilidades | RES | 0.44 | 0.41 | 0.39 | 0.35 | 0.32 |
| Guerreiro | STR | 0.51 | 0.45 | 0.40 | 0.34 | 0.29 |
| Guerreiro | VIT | 0.53 | 0.47 | 0.42 | 0.35 | 0.30 |
| Guerreiro | AGI | 0.64 | 0.46 | 0.35 | 0.22 | 0.15 |
| Guerreiro | RES | 0.44 | 0.42 | 0.39 | 0.36 | 0.32 |
| Guardião | STR | 0.44 | 0.40 | 0.36 | 0.31 | 0.27 |
| Guardião | VIT | 0.55 | 0.49 | 0.44 | 0.36 | 0.31 |
| Guardião | AGI | 0.63 | 0.45 | 0.34 | 0.22 | 0.15 |
| Guardião | RES | 0.47 | 0.44 | 0.41 | 0.38 | 0.35 |

### D.3 Builds: todos os pontos num atributo e metades 50/50

Mesmo equipamento do herói do nível, sem habilidades. Profundidade = andar mais fundo limpo em >= 80% das tentativas de 1 andar com HP cheio; caça = o melhor lugar que o build pode caçar (zonas liberadas pelo andar que ele limpa, profundidades liberadas pelo CP; a que dá mais materiais), por hora em caça de 4 h; chefe = tempo para matar o chefe do andar 25 / 50 em segundos (margem P), "-" se P < 1.

#### Nível 30, sem habilidades

| Build | STR/VIT/AGI/RES | CP | Profundidade | Zona (prof.) | Materiais/h (Ouro ref.) | XP/h | Chefe 25 | Chefe 50 |
| --- | --- | --: | --: | --- | --: | --: | --: | --: |
| balanceado 35/30/20/15 | 31/27/18/14 | 991 | 27 | demon_glade (deep) | 543 | 2274 | 5.2 s (2.75) | - |
| tudo STR | 90/0/0/0 | 937 | 25 (-7%) | demon_glade (deep) | 548 (1%) | 2274 (0%) | 4.4 s (2.43) | - |
| tudo VIT | 0/90/0/0 | 961 | 27 (0%) | demon_glade (deep) | 595 (9%) | 2274 (-0%) | 7.0 s (2.66) | - |
| tudo AGI | 0/0/90/0 | 909 | 25 (-7%) | demon_glade (deep) | 553 (2%) | 2274 (-0%) | 4.7 s (2.30) | - |
| tudo RES | 0/0/0/90 | 940 | 26 (-4%) | demon_glade (deep) | 595 (9%) | 2274 (-0%) | 7.1 s (2.54) | - |
| STR+VIT 50/50 | 45/45/0/0 | 981 | 28 (4%) | demon_glade (deep) | 516 (-5%) | 2275 (0%) | 5.4 s (2.71) | - |
| STR+AGI 50/50 | 45/0/45/0 | 964 | 26 (-4%) | demon_glade (deep) | 524 (-3%) | 2275 (0%) | 4.2 s (2.57) | - |
| STR+RES 50/50 | 45/0/0/45 | 960 | 27 (0%) | demon_glade (deep) | 516 (-5%) | 2275 (0%) | 5.5 s (2.60) | - |
| VIT+AGI 50/50 | 0/45/45/0 | 980 | 28 (4%) | demon_glade (deep) | 557 (3%) | 2275 (0%) | 5.4 s (2.70) | - |
| VIT+RES 50/50 | 0/45/0/45 | 960 | 27 (0%) | demon_glade (deep) | 595 (9%) | 2274 (-0%) | 7.1 s (2.65) | - |
| AGI+RES 50/50 | 0/0/45/45 | 959 | 27 (0%) | demon_glade (deep) | 557 (3%) | 2275 (0%) | 5.5 s (2.59) | - |

#### Nível 30, Guerreiro

| Build | STR/VIT/AGI/RES | CP | Profundidade | Zona (prof.) | Materiais/h (Ouro ref.) | XP/h | Chefe 25 | Chefe 50 |
| --- | --- | --: | --: | --- | --: | --: | --: | --: |
| balanceado 35/30/20/15 | 31/27/18/14 | 1169 | 34 | demon_glade (deep) | 556 | 2275 | 3.8 s (3.79) | - |
| tudo STR | 90/0/0/0 | 1113 | 32 (-6%) | blood_marsh (deep) | 650 (17%) | 3768 (66%) | 3.2 s (3.41) | - |
| tudo VIT | 0/90/0/0 | 1142 | 31 (-9%) | demon_glade (deep) | 563 (1%) | 2274 (-0%) | 5.0 s (3.69) | - |
| tudo AGI | 0/0/90/0 | 1057 | 32 (-6%) | demon_glade (deep) | 590 (6%) | 2275 (0%) | 3.5 s (3.08) | - |
| tudo RES | 0/0/0/90 | 1119 | 31 (-9%) | demon_glade (deep) | 563 (1%) | 2274 (-0%) | 5.1 s (3.54) | - |
| STR+VIT 50/50 | 45/45/0/0 | 1166 | 34 (0%) | blood_marsh (deep) | 534 (-4%) | 3769 (66%) | 3.9 s (3.78) | - |
| STR+AGI 50/50 | 45/0/45/0 | 1129 | 32 (-6%) | blood_marsh (deep) | 570 (3%) | 3770 (66%) | 3.1 s (3.49) | - |
| STR+RES 50/50 | 45/0/0/45 | 1142 | 33 (-3%) | demon_glade (deep) | 520 (-6%) | 2275 (0%) | 3.9 s (3.63) | - |
| VIT+AGI 50/50 | 0/45/45/0 | 1147 | 36 (6%) | demon_glade (deep) | 584 (5%) | 2275 (0%) | 4.0 s (3.66) | - |
| VIT+RES 50/50 | 0/45/0/45 | 1142 | 32 (-6%) | demon_glade (deep) | 563 (1%) | 2274 (-0%) | 5.1 s (3.69) | - |
| AGI+RES 50/50 | 0/0/45/45 | 1123 | 34 (0%) | demon_glade (deep) | 584 (5%) | 2275 (0%) | 4.0 s (3.51) | - |

#### Nível 30, Guardião

| Build | STR/VIT/AGI/RES | CP | Profundidade | Zona (prof.) | Materiais/h (Ouro ref.) | XP/h | Chefe 25 | Chefe 50 |
| --- | --- | --: | --: | --- | --: | --: | --: | --: |
| balanceado 35/30/20/15 | 31/27/18/14 | 1057 | 31 | demon_glade (deep) | 543 | 2274 | 5.2 s (3.14) | - |
| tudo STR | 90/0/0/0 | 996 | 28 (-10%) | demon_glade (deep) | 548 (1%) | 2274 (0%) | 4.4 s (2.76) | - |
| tudo VIT | 0/90/0/0 | 1023 | 31 (0%) | demon_glade (deep) | 595 (9%) | 2274 (-0%) | 7.0 s (3.01) | - |
| tudo AGI | 0/0/90/0 | 967 | 28 (-10%) | demon_glade (deep) | 553 (2%) | 2274 (-0%) | 4.7 s (2.61) | - |
| tudo RES | 0/0/0/90 | 1018 | 31 (0%) | demon_glade (deep) | 595 (9%) | 2274 (-0%) | 7.2 s (2.97) | - |
| STR+VIT 50/50 | 45/45/0/0 | 1044 | 27 (-13%) | demon_glade (deep) | 516 (-5%) | 2275 (0%) | 5.4 s (3.07) | - |
| STR+AGI 50/50 | 45/0/45/0 | 1025 | 28 (-10%) | demon_glade (deep) | 524 (-3%) | 2275 (0%) | 4.2 s (2.91) | - |
| STR+RES 50/50 | 45/0/0/45 | 1032 | 27 (-13%) | demon_glade (deep) | 516 (-5%) | 2275 (0%) | 5.5 s (3.00) | - |
| VIT+AGI 50/50 | 0/45/45/0 | 1042 | 33 (6%) | demon_glade (deep) | 557 (3%) | 2275 (0%) | 5.5 s (3.06) | - |
| VIT+RES 50/50 | 0/45/0/45 | 1032 | 32 (3%) | demon_glade (deep) | 595 (9%) | 2274 (-0%) | 7.1 s (3.05) | - |
| AGI+RES 50/50 | 0/0/45/45 | 1030 | 33 (6%) | demon_glade (deep) | 557 (3%) | 2275 (0%) | 5.5 s (2.99) | - |

#### Nível 60, sem habilidades

| Build | STR/VIT/AGI/RES | CP | Profundidade | Zona (prof.) | Materiais/h (Ouro ref.) | XP/h | Chefe 25 | Chefe 50 |
| --- | --- | --: | --: | --- | --: | --: | --: | --: |
| balanceado 35/30/20/15 | 63/54/36/27 | 1995 | 61 | demon_rift (deep) | 1151 | 6036 | 2.6 s (10.78) | 13.8 s (1.32) |
| tudo STR | 180/0/0/0 | 1789 | 56 (-8%) | demon_rift (deep) | 1221 (6%) | 6043 (0%) | 2.2 s (8.58) | 11.7 s (1.05) |
| tudo VIT | 0/180/0/0 | 1790 | 63 (3%) | demon_rift (deep) | 674 (-41%) | 6042 (0%) | 4.4 s (8.88) | 22.6 s (1.11) |
| tudo AGI | 0/0/180/0 | 1713 | 56 (-8%) | demon_rift (deep) | 1156 (0%) | 6044 (0%) | 2.4 s (7.89) | - |
| tudo RES | 0/0/0/180 | 1805 | 58 (-5%) | demon_rift (deep) | 683 (-41%) | 6035 (-0%) | 4.5 s (9.09) | 23.4 s (1.12) |
| STR+VIT 50/50 | 90/90/0/0 | 1902 | 63 (3%) | demon_rift (deep) | 948 (-18%) | 6033 (-0%) | 3.0 s (9.81) | 15.4 s (1.21) |
| STR+AGI 50/50 | 90/0/90/0 | 1922 | 62 (2%) | demon_rift (deep) | 1252 (9%) | 6039 (0%) | 1.9 s (9.86) | 10.2 s (1.21) |
| STR+RES 50/50 | 90/0/0/90 | 1884 | 61 (0%) | demon_rift (deep) | 952 (-17%) | 6037 (0%) | 3.0 s (9.72) | 15.7 s (1.19) |
| VIT+AGI 50/50 | 0/90/90/0 | 1923 | 63 (3%) | demon_rift (deep) | 1109 (-4%) | 6043 (0%) | 2.9 s (10.02) | 15.1 s (1.23) |
| VIT+RES 50/50 | 0/90/0/90 | 1840 | 59 (-3%) | demon_rift (deep) | 687 (-40%) | 6042 (0%) | 4.5 s (9.42) | 23.1 s (1.16) |
| AGI+RES 50/50 | 0/0/90/90 | 1905 | 63 (3%) | demon_rift (deep) | 1042 (-9%) | 6040 (0%) | 2.9 s (9.92) | 15.4 s (1.21) |

#### Nível 60, Guerreiro

| Build | STR/VIT/AGI/RES | CP | Profundidade | Zona (prof.) | Materiais/h (Ouro ref.) | XP/h | Chefe 25 | Chefe 50 |
| --- | --- | --: | --: | --- | --: | --: | --: | --: |
| balanceado 35/30/20/15 | 63/54/36/27 | 2494 | 74 | demon_rift (deep) | 1398 | 6042 | 1.7 s (16.74) | 8.9 s (2.04) |
| tudo STR | 180/0/0/0 | 2259 | 69 (-7%) | demon_rift (deep) | 1430 (2%) | 6039 (-0%) | 1.4 s (13.65) | 7.4 s (1.66) |
| tudo VIT | 0/180/0/0 | 2261 | 73 (-1%) | demon_rift (deep) | 1129 (-19%) | 6037 (-0%) | 2.8 s (13.95) | 14.6 s (1.72) |
| tudo AGI | 0/0/180/0 | 2113 | 65 (-12%) | demon_rift (deep) | 1388 (-1%) | 6044 (0%) | 1.6 s (11.93) | 8.5 s (1.45) |
| tudo RES | 0/0/0/180 | 2284 | 74 (0%) | demon_rift (deep) | 1060 (-24%) | 6034 (-0%) | 2.8 s (14.41) | 14.9 s (1.76) |
| STR+VIT 50/50 | 90/90/0/0 | 2403 | 74 (0%) | demon_rift (deep) | 1311 (-6%) | 6037 (-0%) | 1.9 s (15.54) | 9.8 s (1.90) |
| STR+AGI 50/50 | 90/0/90/0 | 2384 | 69 (-7%) | demon_rift (deep) | 1499 (7%) | 6045 (0%) | 1.3 s (15.12) | 6.7 s (1.84) |
| STR+RES 50/50 | 90/0/0/90 | 2383 | 74 (0%) | demon_rift (deep) | 1298 (-7%) | 6037 (-0%) | 1.9 s (15.44) | 9.9 s (1.88) |
| VIT+AGI 50/50 | 0/90/90/0 | 2386 | 74 (0%) | demon_rift (deep) | 1339 (-4%) | 6044 (0%) | 1.9 s (15.28) | 10.0 s (1.87) |
| VIT+RES 50/50 | 0/90/0/90 | 2326 | 74 (0%) | demon_rift (deep) | 1066 (-24%) | 6034 (-0%) | 2.8 s (14.88) | 14.8 s (1.82) |
| AGI+RES 50/50 | 0/0/90/90 | 2365 | 74 (0%) | demon_rift (deep) | 1312 (-6%) | 6044 (0%) | 1.9 s (15.18) | 10.1 s (1.85) |

#### Nível 60, Guardião

| Build | STR/VIT/AGI/RES | CP | Profundidade | Zona (prof.) | Materiais/h (Ouro ref.) | XP/h | Chefe 25 | Chefe 50 |
| --- | --- | --: | --: | --- | --: | --: | --: | --: |
| balanceado 35/30/20/15 | 63/54/36/27 | 2262 | 74 | demon_rift (deep) | 1109 | 6038 | 2.6 s (14.43) | 13.2 s (1.72) |
| tudo STR | 180/0/0/0 | 2004 | 61 (-18%) | demon_rift (deep) | 1201 (8%) | 6041 (0%) | 2.2 s (10.92) | 11.3 s (1.32) |
| tudo VIT | 0/180/0/0 | 2090 | 74 (0%) | demon_rift (deep) | 653 (-41%) | 6030 (-0%) | 4.2 s (12.58) | 21.0 s (1.51) |
| tudo AGI | 0/0/180/0 | 1921 | 62 (-16%) | demon_rift (deep) | 1169 (5%) | 6039 (0%) | 2.4 s (10.06) | 12.2 s (1.22) |
| tudo RES | 0/0/0/180 | 2144 | 74 (0%) | demon_rift (deep) | 697 (-37%) | 6042 (0%) | 4.4 s (13.48) | 22.4 s (1.57) |
| STR+VIT 50/50 | 90/90/0/0 | 2159 | 73 (-1%) | demon_rift (deep) | 1031 (-7%) | 6042 (0%) | 2.9 s (13.11) | 14.7 s (1.57) |
| STR+AGI 50/50 | 90/0/90/0 | 2149 | 73 (-1%) | demon_rift (deep) | 1269 (14%) | 6038 (-0%) | 1.9 s (12.51) | 9.9 s (1.50) |
| STR+RES 50/50 | 90/0/0/90 | 2155 | 67 (-9%) | demon_rift (deep) | 952 (-14%) | 6032 (-0%) | 2.9 s (13.30) | 15.1 s (1.58) |
| VIT+AGI 50/50 | 0/90/90/0 | 2181 | 74 (0%) | demon_rift (deep) | 1069 (-4%) | 6043 (0%) | 2.8 s (13.37) | 14.4 s (1.60) |
| VIT+RES 50/50 | 0/90/0/90 | 2177 | 74 (0%) | demon_rift (deep) | 688 (-38%) | 6032 (-0%) | 4.3 s (13.84) | 21.9 s (1.63) |
| AGI+RES 50/50 | 0/0/90/90 | 2177 | 74 (0%) | demon_rift (deep) | 1062 (-4%) | 6044 (0%) | 2.9 s (13.58) | 14.8 s (1.61) |

#### Nível 100, sem habilidades

| Build | STR/VIT/AGI/RES | CP | Profundidade | Zona (prof.) | Materiais/h (Ouro ref.) | XP/h | Chefe 25 | Chefe 50 |
| --- | --- | --: | --: | --- | --: | --: | --: | --: |
| balanceado 35/30/20/15 | 105/90/60/45 | 5623 | 100 | blood_abyss (deep) | 2045 | 9027 | 0.8 s (81.13) | 4.0 s (9.98) |
| tudo STR | 300/0/0/0 | 4792 | 99 (-1%) | blood_abyss (deep) | 2141 (5%) | 9027 (0%) | 0.7 s (57.74) | 3.5 s (7.16) |
| tudo VIT | 0/300/0/0 | 4668 | 100 (0%) | blood_abyss (deep) | 1520 (-26%) | 9034 (0%) | 1.5 s (56.52) | 7.6 s (6.97) |
| tudo AGI | 0/0/300/0 | 4634 | 99 (-1%) | blood_abyss (deep) | 2182 (7%) | 9032 (0%) | 0.7 s (54.77) | 3.8 s (6.71) |
| tudo RES | 0/0/0/300 | 4942 | 100 (0%) | blood_abyss (deep) | 1480 (-28%) | 9033 (0%) | 1.5 s (65.50) | 7.8 s (8.03) |
| STR+VIT 50/50 | 150/150/0/0 | 5084 | 100 (0%) | blood_abyss (deep) | 1796 (-12%) | 9033 (0%) | 0.9 s (65.83) | 4.8 s (8.13) |
| STR+AGI 50/50 | 150/0/150/0 | 5388 | 100 (0%) | blood_abyss (deep) | 2274 (11%) | 9032 (0%) | 0.5 s (73.22) | 2.8 s (9.01) |
| STR+RES 50/50 | 150/0/0/150 | 5192 | 100 (0%) | blood_abyss (deep) | 1793 (-12%) | 9033 (0%) | 0.9 s (70.38) | 4.9 s (8.67) |
| VIT+AGI 50/50 | 0/150/150/0 | 5293 | 100 (0%) | blood_abyss (deep) | 1942 (-5%) | 9029 (0%) | 0.9 s (71.65) | 4.5 s (8.79) |
| VIT+RES 50/50 | 0/150/0/150 | 4983 | 100 (0%) | blood_abyss (deep) | 1480 (-28%) | 9028 (0%) | 1.5 s (65.81) | 7.7 s (8.08) |
| AGI+RES 50/50 | 0/0/150/150 | 5403 | 100 (0%) | blood_abyss (deep) | 1989 (-3%) | 9026 (-0%) | 0.9 s (76.63) | 4.5 s (9.37) |

### D.4 Tetos e o que o jogador vê

- Pontos: 3 por nível, 300 no nível 100 (o herói novo começa com 3 sem gastar). Não há distribuição automática nem recomendada; os botões − e + da tela Personagem desfazem e refazem pontos sem custo, sem limite e sem bloquear em batalha (é um respec livre de atributos).
- AGI: o teto de combate é 300 pontos (568.4 ms, 1.76 atq/s). Com 3 pontos por nível o nível 100 tem exatamente 300: o teto só é atingido por quem põe TODOS os pontos em AGI, nunca é ultrapassado e não há ponto desperdiçado. O piso de 400 ms só é alcançável com bônus de relíquia/habilidade somados. A tela diz o teto na descrição de AGI e, no teto, troca o texto por "No máximo".
- RES: assintótica (dano / (1 + r)); STR: sem teto prático (guarda de 1000000); VIT: linear, sem teto.
- Textos da tela (nível 60, gerados dos números do motor, src/game/attributes.ts): "+0,5 de dano e +0,3% do dano da arma por ponto"; "+6,3 PV Máx por ponto (+0,03 a cada nível)"; "Ataca 4,7 ms mais rápido por ponto (até 300 pontos)"; "-0,19% de dano sofrido por ponto e +2 PV Máx".
- Prova do teto (herói nv 100, tudo AGI = 300): 568.4 ms por golpe.

## E. Curva de tiers

CP de um herói de nível 100 (balanceado, +0) com cada par comum; `ΔCP` é o ganho sobre o par anterior; `custo` é a receita do tier (arma+armadura) em Ouro de referência; `cadeia` inclui as peças do tier anterior.

| Tier | Arma (dano / crítico) | Armadura (HP / resist.) | CP (nv 100) | ΔCP vs anterior | Custo da receita (Ouro ref.) | Cadeia | Ouro ref. por ponto de CP ganho |
| --- | --- | --- | --: | --: | --: | --: | --: |
| T1 | 12 / 3% | 40 / 3% | 840 | +113 (15.5%) | 454 | 454 | 4.01 |
| T2 | 30 / 6% | 90 / 6% | 993 | +153 (18.2%) | 673 | 1580 | 4.40 |
| T3 | 65 / 10% | 160 / 10% | 1302 | +309 (31.1%) | 3036 | 4616 | 9.82 |
| T4g | 90 / 14% | 220 / 13% | 1506 | +204 (15.7%) | 3798 | 8414 | 18.62 |
| T4d | 120 / 18% +queima | 280 / 16% | 1800 | +498 (38.2%) | 5382 | 13796 | 10.81 |
| T5 | 160 / 20% +queima | 360 / 18% | 2054 | +254 (14.1%) | 15669 | 29465 | 61.69 |
| T6 | 240 / 24% +queima | 485 / 22% | 2582 | +528 (25.7%) | 11468 | 40932 | 21.72 |

(T4 dragão é comparado ao T3; T5 ao T4 dragão, que é o ingrediente da receita do T5. Tabela regerada na Rodada 10: a arma e a armadura do tier 6 subiram para 240 / 485 e o dragão passou a ser feito do dourado.)

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

---

# Adendo da rodada 4: os efeitos que eram dado morto

Esta auditoria (A a F) foi escrita antes da rodada 3 e continua valendo para raridade, substats, atributos, curva de tiers e refino; os números de CP das seções B a F foram medidos sem os efeitos abaixo e sobem de 2 a 5 % nas peças que os têm (`npm run sim:items` regera tudo). A seção G é nova: mede com a mesma régua da C o valor real de combate de `burn`, `reflect`, `hpRegenPct` e `attackSpeedBonus` (ver `BALANCE_CHANGES.md` seções 17 a 20 para as regras e para os três números que mudaram: regeneração 1,5 -> 0,9 %/s, Crista de Berserker 0,5 -> 0,75, `boss50*` 0,82 -> 0,84).

## G. Efeitos de equipamento: queimadura, reflexo, regeneração, velocidade de ataque

Mesma régua da seção C: `Δln P` é a variação do log da margem do duelo (valor real de combate, forma fechada com os efeitos em `duel.ts`) no andar de referência do herói (par do tier +4, atributos 35/30/20/15), `ΔCP` a variação de `computeCP`, `Δandares` a média de andares limpos a partir do andar de referência (60 sorteios, sem poções). Um efeito "desligado" é o MESMO item com o campo zerado.

**Relíquias** (as três disputam o mesmo slot). Meta: maior / menor `Δln P` <= 1,5 nos níveis 30 e 60; cerca de +4 a +7% de CP no ponto em que ficam forjáveis.

| Nível | Equip. | Relíquia | ΔCP | Δln P (real) | Δandares |
| --: | --- | --- | --: | --: | --: |
| 20 | T2+4 | ring_vitality | 5.8% | 4.65% | +0.00 |
| 20 | T2+4 | amulet_swiftness | 3.8% | 7.70% | +0.00 |
| 20 | T2+4 | berserker_crest | 2.6% | 5.41% | +0.00 |
| 30 | T3+4 | ring_vitality | 4.4% | 7.46% | +0.00 |
| 30 | T3+4 | amulet_swiftness | 3.8% | 6.96% | +0.45 |
| 30 | T3+4 | berserker_crest | 3.9% | 6.99% | +0.40 |
| 60 | T4g+4 | ring_vitality | 4.5% | 9.54% | +0.00 |
| 60 | T4g+4 | amulet_swiftness | 3.9% | 7.13% | +0.00 |
| 60 | T4g+4 | berserker_crest | 5.0% | 9.13% | +0.00 |
| 90 | T6+4 | ring_vitality | 3.0% | 7.73% | +0.00 |
| 90 | T6+4 | amulet_swiftness | 3.8% | 6.86% | +0.02 |
| 90 | T6+4 | berserker_crest | 7.2% | 12.87% | +0.02 |

Razão maior / menor do Δln P: nível 20: 1.65 · nível 30: 1.07 · nível 60: 1.34 · nível 90: 1.88

**Queimadura** (6% do golpe, antes do crítico, a cada 1 s durante 3 s, renovada a cada golpe, sem acumular). Meta: arma com queimadura <= ~12% mais forte que a mesma sem.

| Arma | Nível | Andar ref. | Parte do dano total | Δln P | ΔCP | Δandares |
| --- | --: | --: | --: | --: | --: | --: |
| dragon_flameblade | 50 | 44 | 4.1% | 4.20% | 2.2% | -0.07 |
| voidsteel_blade | 70 | 51 | 3.8% | 3.90% | 2.0% | +0.00 |
| abyssal_greatblade | 90 | 74 | 3.5% | 3.59% | 1.9% | +0.00 |

**Reflexo** (parte do dano que o herói realmente levou, já com a resistência). Meta: <= ~10% do dano total causado num andar do mesmo tier.

| Armadura | Reflexo | Nível | Andar ref. | Parte do dano total | Δln P | ΔCP | Δandares |
| --- | --: | --: | --: | --: | --: | --: | --: |
| steel_plate | 20% | 25 | 26 | 10.4% | 11.01% | 4.2% | +0.12 |
| gilded_aegis | 20% | 50 | 35 | 7.6% | 7.90% | 4.0% | +0.37 |
| dragon_scale_armor | 22% | 50 | 44 | 7.3% | 7.58% | 4.0% | -0.07 |
| voidsteel_plate | 25% | 70 | 51 | 7.6% | 7.87% | 4.3% | +0.05 |
| abyssal_bulwark | 28% | 90 | 74 | 7.4% | 7.67% | 4.6% | +0.00 |

Linha dragão contra a dourada no tier 4 (par comum +0, sem relíquia): nível 50: dourado 883, dragão 1086 (23.0%) · nível 60: dourado 998, dragão 1218 (22.0%). Custo do par (receita do tier, Ouro de referência): dourado 3798, dragão 5382. Desde a Rodada 10 o dragão é feito DO dourado (receita: 1 peça dourada + escamas + Runas), então o custo real do par dragão inclui o par dourado.

# Adendo da rodada 6: escudos, machados e relíquias de chefe

Gerado por `npm run sim:items` (as seções A-H acima continuam valendo; a H antiga, dos tônicos, segue com a mesma letra). A seção G passou a medir só as três relíquias forjáveis; as de chefe estão na K. A seção A passou a forjar com uma mochila nova a cada forja (o script quebrava com o limite de pilha do inventário da R5).

## I. Machados contra espadas (Rodada 6)

Mesma régua (margem P do duelo no andar de referência do herói com a espada, par do tier +4, atributos 35/30/20/15). Machado = a mesma receita e custo da espada do tier, mais dano, metade do crítico, sem queimadura. Três montagens: **pouco crítico** (arma + armadura), **intermediária** (+ elmo, luvas, botas e anel do tier) e **crítico alto** (anel do tier + rubis em todos os soquetes da arma). Δ = P do machado / P da espada - 1; meta nos níveis 30, 60 e 90: dentro de ±5%, machado na frente com pouco crítico e espada na frente com crítico alto.

| Tier | Nível | Espada: dano / crítico | Machado: dano / crítico | ΔCP (arma + armadura) | Δ pouco crítico | Δ intermediária | Δ crítico alto |
| --- | --: | --- | --- | --: | --: | --: | --: |
| T1 | 1 | 12 / 3.0% | 13 (+8.33%) / 1.5% | 0.8% | +1.86% | +1.29% | +1.44% |
| T2 | 10 | 30 / 6.0% | 32 (+6.67%) / 3.0% | 1.1% | +2.10% | +1.27% | +0.61% |
| T3 | 30 | 65 / 10.0% | 70 (+7.69%) / 5.0% | 0.5% | +1.09% | +0.18% | -0.93% |
| T4g | 60 | 90 / 14.0% | 100 (+11.11%) / 7.0% | 0.9% | +1.79% | +0.32% | -2.00% |
| T5 | 75 | 160 / 20.0% + queima | 187 (+16.87%) / 10.0% | 0.3% | +0.47% | -1.03% | -3.21% |
| T6 | 90 | 220 / 24.0% + queima | 264 (+20.00%) / 12.0% | 1.2% | +1.96% | -0.18% | -3.44% |

Os machados dos tiers 1-2 ficam à frente em todas as montagens (a espada ainda quase não tem crítico para perder); a inversão só aparece a partir do tier 3, que é onde a medida pede. Os tiers 5-6 compensam a queimadura da espada com mais dano. O custo da receita (Ouro + materiais) é igual ao da espada do tier em todos os tiers.

## J. Escudos (Rodada 6)

Efeito de acrescentar o escudo do tier ao conjunto completo de seis peças do tier (comum +0) e a arma + armadura; reflexo medido em arma + armadura +4 + escudo no andar de referência.

| Escudo | Tier | Stats | ΔCP (conjunto de 6) | ΔCP (arma + armadura) | Δln P (conjunto de 6) | Reflexo do dano total (só armadura → com escudo) | Custo da receita: escudo / armadura |
| --- | --- | --- | --: | --: | --: | --: | --: |
| bronze_buckler | T1 | 20 PV · 4.0% res | 8.0% | 9.4% | 15.56% | 0.0% → 0.0% | 106 / 195 |
| iron_shield | T2 | 36 PV · 6.0% res | 8.2% | 9.3% | 15.59% | 0.0% → 0.0% | 77 / 145 |
| steel_kite_shield | T3 | 52 PV · 7.6% res · 3.0% reflexo | 7.7% | 8.9% | 15.27% | 11.2% → 11.8% | 383 / 853 |
| gilded_shield | T4g | 76 PV · 9.5% res · 6.0% reflexo | 8.3% | 9.5% | 16.23% | 8.3% → 9.8% | 415 / 735 |
| voidsteel_shield | T5 | 96 PV · 10.4% res · 7.0% reflexo | 7.9% | 9.2% | 15.46% | 8.4% → 9.7% | 1085 / 2060 |
| abyssal_shield | T6 | 113 PV · 11.3% res · 8.0% reflexo | 7.9% | 9.0% | 14.69% | 7.4% → 8.6% | 1827 / 3484 |

## K. Relíquias de chefe (Rodada 6)

Quatro relíquias empilháveis, só por queda (4% por vitória sobre o chefe do bioma, independente da peça única), que disputam o slot único com as três forjáveis. Medidas no nível em que caem, herói arma + armadura +4 do tier. Meta: +4 a +7% de CP (a faixa das forjáveis, 3,5 a 7,5% no teste) e valor real dentro de 1,5x das forjáveis; a moeda não tem valor de combate (só ouro).

| Relíquia | Nível | Herói | ΔCP | Δln P (real) | Forjáveis (vitalidade / velocidade / berserker) |
| --- | --: | --- | --: | --: | --: |
| goblin_lucky_coin | 25 | T3+4 | 0.0% | 0.00% | 6.25 / 6.86 / 6.89% |
| warchief_totem | 50 | T4g+4 | 4.1% | 7.56% | 9.16 / 7.13 / 9.13% |
| lich_phylactery | 75 | T5+4 | 3.6% | 15.87% | 8.15 / 6.83 / 11.29% |
| overlord_sigil | 100 | T6+4 | 3.7% | 6.84% | 8.38 / 6.90 / 12.94% |

## L. Relíquia da Temporada, Selo do Ferreiro e valor da trilha (Passe de Aventureiro, 10/10/2026)

**Selo do Ferreiro e a forja (item A1).** O selo só muda o sorteio de raridade de uma forja de peça de equipamento (nunca relíquia, nunca reforja, refino ou único): a tabela normal restrita a Épica ou melhor, com os pesos da própria `RARITIES` (12 e 3), ou seja **80% épica / 20% lendária** (`rollRarityAtLeast`, nada fixo no código). Teste com 200 mil sorteios com seed: 80,0 / 20,0 (desvio < 0,4 ponto). A trilha dá **3 selos por temporada, logo 3 x 0,03 / 0,15 = 0,6 lendárias esperadas por temporada vindas de selos**, mais 1,8 épicas. O selo só é gasto se a forja acontece (falha por ouro, material, ingrediente ou bolsa cheia o mantém); a taxa de 60/25/12/3 das forjas sem selo continua exatamente a de A1.

**Relíquia da Temporada (item K).** O Emblema do Aventureiro (+5% de XP, +5% de ouro, +2% de dano final) mede **28 a 32%** da relíquia de combate mais fraca nos níveis 30 / 60 / 90 (Δln P do duelo no andar de referência: 1,77 / 1,83 / 1,82% contra 5,59 / 6,18 / 6,45% do Sigilo do Senhor Supremo, a mais fraca nos três), e +0,9 a +1,0% de CP contra +4 a +7,5% das relíquias de chefe. É a escolha de "progredir mais rápido" e perde para qualquer relíquia de combate. Reprodutível com `npm run sim:items` (seção L).

**Valor da trilha (seção M do mesmo relatório).** Ouro de referência (materiais por `baseGoldValue`, Fragmento = 2, gema = 2 Fragmentos, poções = insumos + ouro da receita, ticket expresso = 100 por hora, catalisador = 400, selo = 1 500, escritura = metade do primeiro degrau do Baú): **Grátis 9 551; Premium 15 438, dos quais 4 896 são selos e escrituras (10 542 sem eles)**, fora o emblema, a moldura e o título, que não têm preço. Contra o dia médio do jogador simulado (cenário A, mediana de 20 seeds: ouro + valor de referência dos materiais): mediana dos dias 1 a 14 = 2 531 (ouro 623 + materiais 1 908), então a trilha premium vale **6,1 dias médios (4,2 sem os exclusivos)**; contra o dia 14 sozinho (ouro 387 + materiais 4 080 = 4 467), 3,5 dias (2,4). O alvo de 6 a 10 dias só se alcança pela média; subir mais exigiria ouro que o jogo não tem como absorver (as barras e minérios valem poucas moedas de referência por unidade), por isso a generosidade a mais está nos exclusivos.


## N. Passos de tier por linha (Rodada 10)

`Poder` = quanto a peça (comum +4) soma à CP de um herói de referência (nível 60, conjunto do tier 3 em +4) sobre o mesmo herói com o slot vazio (o inicial, em arma e armadura); `passo` = poder da peça / poder da peça anterior da MESMA linha. Meta: cada tier vale 20 a 35% mais que o anterior (os primeiros passos são maiores porque o tier 1 parte quase do zero).

| Linha | Peça | Tier | Atributos | Poder | Passo |
| --- | --- | --: | --- | --: | --: |
| sword | bronze_dagger | T1 | 12 dano · 3.0% crít. | 16.9% | - |
| sword | iron_short_sword | T2 | 30 dano · 6.0% crít. | 37.3% | x2.20 |
| sword | steel_greatsword | T3 | 65 dano · 10.0% crít. | 71.0% | x1.91 |
| sword | gilded_warblade | T4 | 90 dano · 14.0% crít. | 93.7% | x1.32 |
| sword | dragon_flameblade | T4 | 120 dano · 18.0% crít. · queima | 122.4% | x1.31 |
| sword | voidsteel_blade | T5 | 160 dano · 20.0% crít. · queima | 150.5% | x1.23 |
| sword | abyssal_greatblade | T6 | 240 dano · 24.0% crít. · queima | 201.2% | x1.34 |
| axe | bronze_hatchet | T1 | 13 dano · 1.5% crít. | 16.8% | - |
| axe | iron_battleaxe | T2 | 32 dano · 3.0% crít. | 37.3% | x2.22 |
| axe | steel_greataxe | T3 | 70 dano · 5.0% crít. | 70.9% | x1.90 |
| axe | gilded_waraxe | T4 | 100 dano · 7.0% crít. | 94.5% | x1.33 |
| axe | voidsteel_cleaver | T5 | 187 dano · 10.0% crít. | 151.2% | x1.60 |
| axe | abyssal_reaver | T6 | 288 dano · 12.0% crít. | 204.4% | x1.35 |
| armor | bronze_leather | T1 | 40 PV · 3.0% resist. | 4.6% | - |
| armor | iron_chainmail | T2 | 90 PV · 6.0% resist. | 9.2% | x2.00 |
| armor | steel_plate | T3 | 160 PV · 10.0% resist. · 20% reflexo | 19.1% | x2.08 |
| armor | gilded_aegis | T4 | 220 PV · 13.0% resist. · 21% reflexo | 24.5% | x1.28 |
| armor | dragon_scale_armor | T4 | 280 PV · 16.0% resist. · 23% reflexo | 30.0% | x1.22 |
| armor | voidsteel_plate | T5 | 360 PV · 18.0% resist. · 25% reflexo | 36.4% | x1.21 |
| armor | abyssal_bulwark | T6 | 485 PV · 22.0% resist. · 28% reflexo | 46.4% | x1.28 |
| helmet | bronze_helm | T1 | 20 PV · 0.7% resist. | 2.1% | - |
| helmet | iron_helm | T2 | 40 PV · 1.3% resist. | 3.5% | x1.68 |
| helmet | steel_helm | T3 | 70 PV · 1.9% resist. | 5.6% | x1.57 |
| helmet | gilded_helm | T4 | 109 PV · 2.6% resist. | 8.2% | x1.47 |
| helmet | voidsteel_helm | T5 | 153 PV · 3.2% resist. | 11.0% | x1.34 |
| helmet | abyssal_helm | T6 | 192 PV · 3.8% resist. | 13.5% | x1.23 |
| gloves | leather_gloves | T1 | 4 dano · 2.0% crít. | 4.3% | - |
| gloves | iron_gauntlets | T2 | 7 dano · 2.5% crít. | 6.1% | x1.42 |
| gloves | steel_gauntlets | T3 | 13 dano · 3.0% crít. | 9.3% | x1.53 |
| gloves | gilded_gauntlets | T4 | 18 dano · 3.5% crít. | 12.1% | x1.30 |
| gloves | voidsteel_gauntlets | T5 | 28 dano · 4.0% crít. | 17.4% | x1.44 |
| gloves | abyssal_gauntlets | T6 | 35 dano · 4.5% crít. | 21.0% | x1.21 |
| boots | leather_boots | T1 | 12 PV · 6.5% resist. | 3.5% | - |
| boots | iron_greaves | T2 | 22 PV · 8.0% resist. | 4.6% | x1.30 |
| boots | steel_greaves | T3 | 35 PV · 10.0% resist. | 6.0% | x1.31 |
| boots | gilded_greaves | T4 | 50 PV · 12.0% resist. | 7.6% | x1.26 |
| boots | voidsteel_greaves | T5 | 68 PV · 15.0% resist. | 9.7% | x1.28 |
| boots | abyssal_greaves | T6 | 88 PV · 17.8% resist. | 11.9% | x1.22 |
| ring | copper_ring | T1 | 6.0% crít. · +15% dano crít. | 4.9% | - |
| ring | silver_ring | T2 | 7.0% crít. · +20% dano crít. | 5.9% | x1.20 |
| ring | gold_ring | T3 | 9.0% crít. · +26% dano crít. | 7.5% | x1.27 |
| ring | ruby_ring | T4 | 10.5% crít. · +33% dano crít. | 9.1% | x1.21 |
| ring | obsidian_ring | T5 | 12.5% crít. · +42% dano crít. | 11.3% | x1.24 |
| ring | abyssal_ring | T6 | 14.5% crít. · +50% dano crít. | 13.3% | x1.18 |
| shield | bronze_buckler | T1 | 20 PV · 4.0% resist. | 3.2% | - |
| shield | iron_shield | T2 | 36 PV · 6.0% resist. | 4.9% | x1.52 |
| shield | steel_kite_shield | T3 | 52 PV · 7.6% resist. · 3% reflexo | 6.8% | x1.41 |
| shield | gilded_shield | T4 | 76 PV · 9.5% resist. · 6% reflexo | 9.4% | x1.38 |
| shield | voidsteel_shield | T5 | 104 PV · 11.5% resist. · 8% reflexo | 12.1% | x1.28 |
| shield | abyssal_shield | T6 | 138 PV · 14.0% resist. · 9% reflexo | 15.2% | x1.26 |

### Únicos contra a gêmea forjada do tier atual na origem

Poder da peça única (comum, sem a substat garantida) / poder da gêmea. Meta: 10 a 15%.

| Único | Origem | Tier (gêmea) | Atributos | Poder / gêmea |
| --- | --- | --- | --- | --: |
| demon_fang_dagger | zone:demon_glade | T2 (iron_short_sword) | 35 dano · 6.5% crít. | x1.14 |
| demonhide_vest | zone:demon_glade | T2 (iron_chainmail) | 103 PV · 6.5% resist. | x1.12 |
| bloodbound_cleaver | zone:blood_marsh | T3 (steel_greatsword) | 75 dano · 10.8% crít. | x1.12 |
| bloodvein_plate | zone:blood_marsh | T3 (steel_plate) | 184 PV · 10.8% resist. · 22% reflexo | x1.12 |
| bone_ward | zone:blood_marsh | T3 (steel_kite_shield) | 56 PV · 8.7% resist. · 3% reflexo | x1.10 |
| riftwalker_boots | zone:demon_rift | T4 (gilded_greaves) | 54 PV · 13.8% resist. | x1.11 |
| shadow_hood | zone:demon_rift | T4 (gilded_helm) | 125 PV · 2.8% resist. | x1.12 |
| abyss_heart_ring | zone:blood_abyss | T6 (abyssal_ring) | 16.7% crít. · +54% dano crít. | x1.13 |
| bonecrusher_maul | zone:blood_abyss | T6 (abyssal_greatblade) | 276 dano · 25.9% crít. · queima | x1.10 |
| goblin_king_crown | bossFloor:25 | T3 (steel_helm) | 81 PV · 2.1% resist. | x1.14 |
| warchief_gauntlets | bossFloor:50 | T4 (gilded_gauntlets) | 21 dano · 3.8% crít. | x1.14 |
| warden_bulwark | bossFloor:50 | T4 (gilded_shield) | 82 PV · 10.9% resist. · 6% reflexo | x1.10 |
| lich_soul_ring | bossFloor:75 | T5 (obsidian_ring) | 14.4% crít. · +45% dano crít. | x1.12 |
| overlord_greataxe | bossFloor:100 | T6 (abyssal_reaver) | 331 dano · 13.0% crít. | x1.10 |

## Seção I — Habilidades (Rodada 7, números finais)

Medido por `npm run sim:skills` (`scripts/sim/skillAudit.sim.ts`) com o duelo fechado de `duel.ts` (sangria, golpes, Contra-ataque, bloqueio, Postura Firme e Último Bastião). `SKILL_T='{"crushBonusStep":0.2}'` sobrescreve `T.heroSkills`. Orçamento: caminho de combate completo +55% a +75%, Guerreiro e Guardião a menos de 15% um do outro, Último Bastião a menos de 1,5x um Bloqueio completo no Monte Carlo da Masmorra. Tabela e notas na Rodada 7 de `BALANCE_CHANGES.md`.

#### nível 30 (tier 3, refino 4; PV 804, dano 148, crit 26.0%, redução 0.45, 0.93 atq/s)
| Caminho | Habilidade | Tier | Valor no posto máximo (margem do duelo) | CP |
| --- | --- | --- | --- | --- |
| warrior | w_heavy_blow | 1 | +21.71% (comum +21.93%, chefe +21.19%) | +11.40% |
| warrior | w_keen_eye | 1 | +6.14% (comum +6.21%, chefe +6.00%) | +3.35% |
| warrior | w_execution | 2 | +5.86% (comum +5.92%, chefe +5.72%) | +3.24% |
| warrior | w_fury | 2 | +15.18% (comum +15.33%, chefe +14.82%) | +7.53% |
| warrior | w_bleed | 3 | +6.89% (comum +6.89%, chefe +6.87%) | +3.56% |
| warrior | w_weapon_master | 3 | +6.37% (comum +6.43%, chefe +6.22%) | +3.45% |
| warrior | w_devastating_strike | capstone | +12.06% (comum +12.18%, chefe +11.77%) | +6.49% |
| guardian | g_thick_skin | 1 | +7.46% (comum +7.46%, chefe +7.46%) | +3.66% |
| guardian | g_bulwark | 1 | +5.85% (comum +5.91%, chefe +5.71%) | +3.03% |
| guardian | g_thorns | 2 | +9.96% (comum +9.01%, chefe +12.21%) | +3.77% |
| guardian | g_second_wind | 2 | +3.35% (comum +3.67%, chefe +2.59%) | +1.99% |
| guardian | g_firm_stance | 3 | +5.46% (comum +0.00%, chefe +19.38%) | +2.82% |
| guardian | g_block | 3 | +17.70% (comum +17.88%, chefe +17.28%) | +11.61% |
| guardian | g_last_bastion | capstone | +7.50% (comum +7.50%, chefe +7.50%) | +3.77% |
| hunter | h_light_step | 1 | +8.68% (comum +8.77%, chefe +8.48%) | +4.71% |
| hunter | h_greed | 1 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_scent | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_quick_learner | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_packer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_gatherer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_great_luck | capstone | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| Caminho | 19 pontos (valor) | CP | com os pontos do nível | só passivas (18) | razão máx/mín entre passivas | capstone / média das T3 | capstone / T3 maior | reflexo / dano causado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| warrior | +76.9% (19 pts) | +35.6% | +36.9% (6 pts) | +71.0% | 3.71 | 1.82 | 1.75 | +4.9% |
| guardian | +70.9% (19 pts) | +34.8% | +13.7% (6 pts) | +59.0% | 5.29 | 0.65 | 0.42 | +13.2% |
| hunter | +8.7% (19 pts) | +4.7% | +8.7% (6 pts) | +8.7% | Infinity | NaN | NaN | +7.9% |
#### nível 60 (tier 4, refino 6; PV 1373, dano 252, crit 33.0%, redução 0.63, 1.01 atq/s)
| Caminho | Habilidade | Tier | Valor no posto máximo (margem do duelo) | CP |
| --- | --- | --- | --- | --- |
| warrior | w_heavy_blow | 1 | +21.83% (comum +22.00%, chefe +21.42%) | +11.36% |
| warrior | w_keen_eye | 1 | +5.96% (comum +6.01%, chefe +5.84%) | +3.20% |
| warrior | w_execution | 2 | +6.93% (comum +6.99%, chefe +6.80%) | +3.73% |
| warrior | w_fury | 2 | +12.97% (comum +13.08%, chefe +12.73%) | +6.40% |
| warrior | w_bleed | 3 | +5.88% (comum +5.88%, chefe +5.88%) | +2.99% |
| warrior | w_weapon_master | 3 | +6.49% (comum +6.54%, chefe +6.36%) | +3.52% |
| warrior | w_devastating_strike | capstone | +12.13% (comum +12.22%, chefe +11.90%) | +6.45% |
| guardian | g_thick_skin | 1 | +7.50% (comum +7.50%, chefe +7.50%) | +3.68% |
| guardian | g_bulwark | 1 | +7.35% (comum +7.41%, chefe +7.21%) | +3.68% |
| guardian | g_thorns | 2 | +8.35% (comum +7.67%, chefe +9.94%) | +3.36% |
| guardian | g_second_wind | 2 | +3.41% (comum +3.70%, chefe +2.75%) | +1.87% |
| guardian | g_firm_stance | 3 | +5.51% (comum +0.00%, chefe +19.59%) | +2.83% |
| guardian | g_block | 3 | +16.76% (comum +16.90%, chefe +16.45%) | +11.52% |
| guardian | g_last_bastion | capstone | +7.50% (comum +7.50%, chefe +7.50%) | +3.68% |
| hunter | h_light_step | 1 | +8.73% (comum +8.80%, chefe +8.57%) | +4.69% |
| hunter | h_greed | 1 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_scent | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_quick_learner | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_packer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_gatherer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_great_luck | capstone | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| Caminho | 19 pontos (valor) | CP | com os pontos do nível | só passivas (18) | razão máx/mín entre passivas | capstone / média das T3 | capstone / T3 maior | reflexo / dano causado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| warrior | +74.9% (19 pts) | +34.6% | +52.7% (12 pts) | +68.9% | 3.71 | 1.96 | 1.87 | +4.7% |
| guardian | +70.4% (19 pts) | +35.1% | +29.3% (12 pts) | +58.5% | 4.91 | 0.67 | 0.45 | +12.0% |
| hunter | +8.7% (19 pts) | +4.7% | +8.7% (12 pts) | +8.7% | Infinity | NaN | NaN | +7.6% |
#### nível 100 (tier 6, refino 8; PV 2490, dano 678, crit 49.0%, redução 0.88, 1.11 atq/s)
| Caminho | Habilidade | Tier | Valor no posto máximo (margem do duelo) | CP |
| --- | --- | --- | --- | --- |
| warrior | w_heavy_blow | 1 | +22.28% (comum +22.34%, chefe +22.15%) | +11.08% |
| warrior | w_keen_eye | 1 | +5.55% (comum +5.56%, chefe +5.52%) | +2.88% |
| warrior | w_execution | 2 | +8.90% (comum +8.93%, chefe +8.85%) | +4.56% |
| warrior | w_fury | 2 | +10.22% (comum +10.25%, chefe +10.16%) | +4.77% |
| warrior | w_bleed | 3 | +4.66% (comum +4.65%, chefe +4.68%) | +2.22% |
| warrior | w_weapon_master | 3 | +7.71% (comum +7.73%, chefe +7.67%) | +3.96% |
| warrior | w_devastating_strike | capstone | +12.38% (comum +12.41%, chefe +12.31%) | +6.30% |
| guardian | g_thick_skin | 1 | +7.51% (comum +7.51%, chefe +7.51%) | +3.69% |
| guardian | g_bulwark | 1 | +9.41% (comum +9.44%, chefe +9.36%) | +4.41% |
| guardian | g_thorns | 2 | +2.79% (comum +2.64%, chefe +3.17%) | +2.80% |
| guardian | g_second_wind | 2 | +5.48% (comum +5.80%, chefe +4.74%) | +1.12% |
| guardian | g_firm_stance | 3 | +5.86% (comum +0.00%, chefe +20.91%) | +2.82% |
| guardian | g_block | 3 | +16.22% (comum +16.26%, chefe +16.12%) | +11.41% |
| guardian | g_last_bastion | capstone | +7.50% (comum +7.50%, chefe +7.50%) | +3.69% |
| hunter | h_light_step | 1 | +8.91% (comum +8.93%, chefe +8.86%) | +4.56% |
| hunter | h_greed | 1 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_scent | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_quick_learner | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_packer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_gatherer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_great_luck | capstone | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| Caminho | 19 pontos (valor) | CP | com os pontos do nível | só passivas (18) | razão máx/mín entre passivas | capstone / média das T3 | capstone / T3 maior | reflexo / dano causado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| warrior | +75.0% (19 pts) | +33.2% | +75.0% (20 pts) | +68.8% | 4.78 | 2.00 | 1.60 | +2.3% |
| guardian | +71.3% (19 pts) | +33.8% | +71.3% (20 pts) | +59.4% | 5.80 | 0.68 | 0.46 | +5.1% |
| hunter | +8.9% (19 pts) | +4.6% | +8.9% (20 pts) | +8.9% | Infinity | NaN | NaN | +3.6% |
#### Parcela do dano total de cada golpe (Caça de 4 h na zona do tier, contadores da tela de resultado)
| Herói | Golpe | posto 1 | posto 2 | posto 3 |
| --- | --- | --- | --- | --- |
| nível 30 | Golpe Esmagador | 10.6% (x2671) | 15.2% (x2671) | 19.3% (x2671) |
| nível 30 | Golpe de Fúria | 9.8% (x1800) | 12.5% (x1800) | 14.9% (x1800) |
| nível 30 | Sangria | 1.7% (x7368) | 3.5% (x7685) | 3.2% (x5711) |
| nível 30 | Golpe Duplo | 4.4% (x1012) | 6.4% (x1535) | 8.6% (x2079) |
| nível 30 | Contra-ataque | 0.8% (x185) | 2.2% (x322) | 3.8% (x448) |
| nível 30 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.4% (x890) |
| nível 60 | Golpe Esmagador | 10.7% (x2914) | 15.2% (x2914) | 19.3% (x2914) |
| nível 60 | Golpe de Fúria | 8.4% (x1799) | 10.5% (x1799) | 12.6% (x1799) |
| nível 60 | Sangria | - | - | - |
| nível 60 | Golpe Duplo | 4.2% (x1100) | 6.4% (x1679) | 8.6% (x2277) |
| nível 60 | Contra-ataque | 0.9% (x229) | 2.5% (x420) | 4.4% (x578) |
| nível 60 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x971) |
| nível 100 | Golpe Esmagador | 10.7% (x3199) | 15.2% (x3199) | 19.3% (x3199) |
| nível 100 | Golpe de Fúria | 6.5% (x1799) | 8.3% (x1799) | 9.9% (x1799) |
| nível 100 | Sangria | 1.0% (x6758) | 1.3% (x5013) | 1.8% (x5004) |
| nível 100 | Golpe Duplo | 4.4% (x1257) | 6.4% (x1874) | 8.4% (x2530) |
| nível 100 | Contra-ataque | 0.6% (x163) | 1.6% (x290) | 3.1% (x411) |
| nível 100 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x1066) |
#### Monte Carlo (runDungeon, sem poções, 200 execuções semeadas): andares limpos por execução na borda do alcance
| Herói | andar inicial | sem habilidade | Último Bastião | Bloqueio x3 | Pele Dura x3 | Mestre de Armas x3 | Sangria x3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nível 30 | 31 | 0.67 | 1.23 (+84%) | 1.06 (+60%) | 0.67 (+0%) | 0.93 (+39%) | 0.93 (+39%) |
| nível 60 | 66 | 0.87 | 1.37 (+57%) | 1.21 (+39%) | 0.92 (+6%) | 1.00 (+15%) | 1.00 (+15%) |
| nível 100 | 99 | 1.75 | 2.00 (+14%) | 1.95 (+11%) | 1.99 (+13%) | 1.92 (+9%) | 1.92 (+9%) |

| Herói | Golpe | posto 1 | posto 2 | posto 3 |
| --- | --- | --- | --- | --- |
| nível 30 | Golpe Esmagador | 10.6% (x2671) | 15.2% (x2671) | 19.3% (x2671) |
| nível 30 | Golpe de Fúria | 9.8% (x1800) | 12.5% (x1800) | 14.9% (x1800) |
| nível 30 | Sangria | 1.7% (x7368) | 3.5% (x7685) | 3.2% (x5711) |
| nível 30 | Golpe Duplo | 4.4% (x1012) | 6.4% (x1535) | 8.6% (x2079) |
| nível 30 | Contra-ataque | 0.8% (x185) | 2.2% (x322) | 3.8% (x448) |
| nível 30 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.4% (x890) |
| nível 60 | Golpe Esmagador | 10.7% (x2914) | 15.2% (x2914) | 19.3% (x2914) |
| nível 60 | Golpe de Fúria | 8.4% (x1799) | 10.5% (x1799) | 12.6% (x1799) |
| nível 60 | Sangria | - | - | - |
| nível 60 | Golpe Duplo | 4.2% (x1100) | 6.4% (x1679) | 8.6% (x2277) |
| nível 60 | Contra-ataque | 0.9% (x229) | 2.5% (x420) | 4.4% (x578) |
| nível 60 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x971) |
| nível 100 | Golpe Esmagador | 10.7% (x3199) | 15.2% (x3199) | 19.3% (x3199) |
| nível 100 | Golpe de Fúria | 6.5% (x1799) | 8.3% (x1799) | 9.9% (x1799) |
| nível 100 | Sangria | 1.0% (x6758) | 1.3% (x5013) | 1.8% (x5004) |
| nível 100 | Golpe Duplo | 4.4% (x1257) | 6.4% (x1874) | 8.4% (x2530) |
| nível 100 | Contra-ataque | 0.6% (x163) | 1.6% (x290) | 3.1% (x411) |
| nível 100 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x1066) |
| Herói | andar inicial | sem habilidade | Último Bastião | Bloqueio x3 | Pele Dura x3 | Mestre de Armas x3 | Sangria x3 |

# Como os status somam (Rodada 19)

O painel do herói ("Status de combate") mostra o total **de agora**, com os elixires dentro, e de onde vem cada número. Nada ali é fórmula própria: `src/game/statBreakdown.ts` chama as mesmas funções que a luta chama (`buildCombatStats` para o permanente; `combatModifiersFromSave`, `activeTonicStats` e `goldMultiplier` para o temporário, no instante `agora`) e explica o total como uma escada: o herói sem nada, depois uma fonte de cada vez. As linhas somam o total por construção, e `statBreakdown.test.ts` compara, para 80 heróis aleatórios com elixires aleatórios, cada total com o que a Masmorra e a Caça usam.

## Ordem das operações

1. **Personagem**: base + nível + nível da armadura + atributos. FOR escala todo dano plano que entra **antes** dela (arma, luvas); PV e Defesa de VIT / RES entram aqui.
2. **Equipamento**, na ordem arma, armadura, elmo, luvas, botas, anel, escudo: valor base x refino x durabilidade x raridade, mais os substatus. Luvas somam ao dano da arma (FOR escala); todas as peças somam à taxa e ao dano crítico, à Defesa (soma bruta) e aos PV.
3. **Gemas** engastadas nessas peças.
4. **Conjunto**: os bônus das famílias vestidas (3 / 5 peças). O dano final do conjunto **multiplica**.
5. **Relíquia**: o dano final da relíquia **multiplica** depois da FOR; o resto soma.
6. **Habilidades**: soma, exceto Pele Dura (x PV), Muralha (x Defesa) e Mestre de Armas (x o termo da arma, antes da FOR).
7. **Paragon**: multiplica o dano.
8. **Passe**: soma ao Ouro extra (+15%).
9. **Temporários**, na ordem: Abençoado, depois os elixires e tônicos. O dano **multiplica** (x1,05 x1,20 x1,10 x1,04); o resto soma na sua própria conta.

**Defesa.** Itens, tônicos e RES somam numa **soma bruta** (é o "Defesa +11%" das peças). O que a soma remove do dano é `soma / (1 + soma)`: 43% brutos removem 30,1%. O painel mostra o segundo número e a lista mostra o primeiro. Pele de Pedra e Polimento de Armadura somam na mesma soma (+0,10 e +0,05).

**Ouro.** 1 + equipamento (soma dos substatus, da relíquia e do conjunto, **com teto de 25%**) + Passe (+15%) + Ganância + Tônico da Fortuna (+20%), tudo somado; só o primeiro tem teto. A Caça paga o Tônico só no tempo de luta que ele cobriu.

**Masmorra x Caça.** A Masmorra lê os temporários a cada golpe, com o relógio (os elixires valem pelo tempo que restar). A Caça congela os status permanentes e o Abençoado no começo da sessão; elixires e tônicos entram como janelas de tempo (o que foi usado antes ou durante a Caça vale dali em diante, nunca para trás). Equipamento ou atributos trocados no meio da Caça só valem em outra Caça (a tela diz isso quando os números diferem). A CP de comparação com as recomendações continua a permanente (`computeCP`); "CP agora" é só informativa.

## Efeitos temporários

Gerada de `temporaryEffects()` (`buffs.ts`); `temporaryEffects.test.ts` confere cada linha com o código e cada efeito com a luta.

| Efeito | Item | Valor | Duração | Onde vale | Como soma |
| --- | --- | --- | --- | --- | --- |
| blessed | Reparo abençoado (Forja) | +5% dano | até a próxima corrida da Masmorra | Masmorra, Caça | multiplica o golpe |
| strength | strength_elixir | +20% dano | 30 min | Masmorra, Caça | multiplica o golpe |
| attack | atk_elixir | +10% dano | 30 min | Masmorra, Caça | multiplica o golpe |
| sharpened | sharpening_stone | +4% dano | 30 min | Masmorra, Caça | multiplica o golpe (limite dos itens novos: 10%) |
| stoneskin | stoneskin_tonic | +10% defesa | 30 min | Masmorra, Caça | soma na soma bruta de Defesa |
| polished | armor_polish | +5% defesa | 30 min | Masmorra, Caça | soma na soma bruta de Defesa (com a Pele de Pedra) |
| haste | haste_tonic | +9% velocidade de ataque | 30 min | Masmorra, Caça | soma ao bônus de velocidade da relíquia; o piso de 400 ms vale |
| precision | precision_elixir | +8% chance de crítico | 30 min | Masmorra, Caça | pontos absolutos, até 100% |
| fortune | fortune_tonic | +20% ouro | 60 min | Masmorra, Caça | soma ao Ouro (fora do teto de 25%) |
| bait | hunter_lure | +10% chance (incomuns e raros) | 60 min | só Caça, só na zona em que foi usada | multiplica a chance de queda (limite dos itens novos: 10%) |
| gatherer | gatherer_brew | +25% minério e madeira | 120 min | só Mineração e Lenhador | soma horas efetivas |
| prospect | prospector_tonic | +10% minério e madeira | 120 min | só Mineração e Lenhador | soma horas efetivas (com a Poção do Coletor; limite 10%) |
| knowledge | knowledge_elixir | +25% XP de Caça | 240 min | só Caça (nenhuma outra atividade paga XP do herói) | multiplica o XP do tempo de luta que cobriu; só um por vez (um segundo é recusado e não gasta nada) |

Permanentes que parecem temporários: o Passe (+15% Ouro, x1,1 material na Caça, na Mineração e no Lenhador) e Ganância / Faro (habilidades). O XP do personagem só vem da Caça (Rodada 20) e o único efeito temporário dele é o Elixir do Conhecimento acima.
