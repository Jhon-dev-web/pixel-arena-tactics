# Baseline de balanceamento: as primeiras horas de um jogador novo

- **Data:** 2026-10-10
- **Commit medido:** `2654196` (branch `claude/project-thread-ppdm57`, "refactor: remove the ONE token from the game"). Nenhum valor de balanceamento nem comportamento do jogo foi alterado: o commit que adiciona este documento só inclui testes, a simulação e a configuração do vitest.
- **Como reproduzir:** `npm run sim` (cerca de 6 s para 20 seeds x 14 dias x 2 cenários). Código em `scripts/sim/` (`driver.ts`, `player.ts`, `progression.sim.ts`). A política está documentada no topo de `progression.sim.ts`.
- **Quem é o jogador simulado:** conta nova, sem Battle Pass, 2 visitas por dia (09h e 21h, com variação de até 90 min por seed), usa todas as 3 sessões grátis de Masmorra por dia, caça o resto do tempo e só minera/corta/planta quando o próximo equipamento exige.

## Resumo para quem tem pressa

1. **O "morri no andar 5" é representativo, e é só o pior momento do dia 1.** Com herói novo (CP 58, 80 HP) as três primeiras sessões do dia 1 terminam nos andares **6 / 8–9 / 10**, em **33 s / 33 s / 17 s**, e a Masmorra paga em média **46 de ouro no dia inteiro**. Depois da primeira caça de 4 h o mesmo jogador chega a nível 39 (CP 253) e limpa os andares 10 a 24 numa tacada só no dia 2.
2. **A progressão trava no andar 25 a partir do dia 2 e não destrava em 14 dias.** O chefe do andar 25 tem 13x o HP e 6x o dano do andar 24 (2 657 HP e 131 de dano por golpe, contra 200 HP e 23 de dano). Nos heróis montados à mão, 0/30 vitórias com CP até 740 e 30/30 com CP 1 009 ou mais. A tabela de CP recomendado engana nos andares 5 a 24 (o herói de CP 253 passa por todos, enquanto a tabela pede 205 a 880) e acerta no chefe (916).
3. **Cenário A (o que foi pedido): nenhuma peça é forjada em 14 dias (0/20 seeds).** A Bolsa de Caça de 2 espaços perde o drop comum (farrapo de couro) em toda caça longa, e o farrapo é a base do couro (adaga e armadura de bronze) e do upgrade da própria bolsa (20 farrapos). Em 4 h a conta é: 147 farrapos sorteados, 0 entram na bolsa, 0 sessões de 20 mantêm algum.
4. **Cenário B (sensibilidade, jogador que descobriu o truque das caças curtas):** primeira peça e primeiro refino no dia 2, arma tier 2 no dia 6–7, armadura tier 2 no dia 11, CP mediano 692 no dia 14 e ainda bloqueado no chefe 25. O tier 3 exige ossos e cristais que só caem na 2ª zona de caça, que só abre depois do andar 25. Ou seja, há uma dependência circular: para abrir a zona 2 precisa de gear tier 3, e o gear tier 3 precisa de material da zona 2.
5. **Nível não pacing nada:** 70 mil XP numa caça de 4 h = nível 39 no dia 2, nível 62 no dia 14. No Cenário A, a partir do dia 2 o CP só sobe por pontos de atributo (3 por nível).

## Os 3 piores problemas de ritmo que os números mostram

### 1. Bolsa de Caça: o drop comum é descartado em qualquer caça longa (bloqueia o equipamento e o próprio upgrade da bolsa)

- **Evidência:** diagnóstico no fim deste documento. Com 4 h de caça: 147 farrapos, 48 garras e 4,4 núcleos sorteados; a bolsa tem 2 espaços e a zona tem 3 drops, então os dois mais raros ficam e o comum é perdido. Cenário A: 240 a 270 unidades perdidas por dia, 0 comuns recebidos do dia 3 em diante, 0/20 seeds com primeira forja. Num herói forte, nem 10 minutos escapam (as lutas ficam de 2 a 3 s, então um núcleo cai em minutos).
- **Onde mexer:**
  - O que manda de verdade **não está em `tunables.ts`**: `HUNT_POUCH_TIERS` em `src/game/huntPouch.ts` (tier 1 = 2 espaços; tier 2 = 4 espaços por 300 ouro + 20 farrapos) e as chances de drop em `src/game/huntingZones.ts`. Vale mover isso para `tunables.ts`, como o contrato do arquivo pede.
  - Dentro de `tunables.ts` só há alavancas indiretas: `battlePass.pouchBonusSlots` (hoje +2 só para quem paga o passe), `hunting.economicReferenceKillsPerHour` e `hunting.economicRollCap` (quantos rolls de material saem por hora). Mudar estes não resolve o descarte.

### 2. Penhasco do chefe do andar 25 (e tudo que fica atrás dele)

- **Evidência:** do dia 2 ao 14 as sessões duram 10 a 16 s, limpam 0 andares e terminam em derrota; a Masmorra deixa de pagar ouro (só paga por andar limpo). O andar 25 libera: marco de 2 000 ouro + 6 gemas, zona de caça 2 (`unlockFloor` 26), pedidos tier 2 (`deliveries.tier2Floor` 26), ossos/sangue/cristais corrompidos (só caem nas zonas 2 e 4) e portanto todo o equipamento tier 3. Diagnóstico do chefe: tier 2 +8 nível 60 (CP 700) perde 30/30, tier 3 +8 nível 60 (CP 1 009) ganha 30/30, tier 2 +8 nível 100 (CP 1 037) ganha 30/30. O nível 100 pede 3,3 bilhões de XP, então na prática o caminho passa por gear tier 3, que passa pela zona 2, que passa pelo chefe.
- **Onde mexer (`tunables.ts`):** `battle.bossHpMult` (1,05) e `battle.bossDmgMult` (0,45), que multiplicam um chefe base de 550 HP / 75 de dano definido em `src/game/enemies.ts` (o salto vem de trocar o goblin de 45 HP / 6 de dano pelo minotauro); `battle.hpGrowth` (0,15) e `battle.dmgGrowth` (0,12) para a inclinação dos andares; `battle.bossEvery` (25) para onde o chefe aparece. Para amenizar a dependência circular: `deliveries.tier2Floor` e afins, ou mover `unlockFloor` das zonas (hoje em `huntingZones.ts`, fora do arquivo de tunables).
- **Observação:** `recommendedCpForFloor` (`dungeon.ts`) é 63 no andar 1, 880 no 24, 916 no 25 e **491 no 26** (reinicia a cada bioma). Ela concorda com o chefe e discorda dos andares comuns.

### 3. XP abundante demais: o nível deixa de ser um eixo de progressão

- **Evidência:** `xpToReachLevel(39)` = 69 062 e uma única caça de 4 h na zona 1 paga cerca de 70 000 XP; o nível 100 custa 3,3 bilhões. Nível 39 no dia 2, 48 no dia 3, 62 no dia 14. Os 3 pontos por nível dão cerca de 120 pontos de atributo no dia 2 e são a única razão de o CP ir de 84 (dia 1) para 253 (dia 2). Os requisitos de nível das receitas (10, 20, 25, 45, 50, 70, 90) deixam de ser portão: 10, 20 e 25 já estão abertos no dia 2.
- **Onde mexer (`tunables.ts`):** `progression.xpBase` (100) e `progression.heroGrowth1..5` / `heroBand1To..4To` (a curva), `deliveries.xpPerHourLocal..Especial` (39 000 a 60 000 por hora de pedido, ainda maior que a caça) e, fora do arquivo de tunables, `xpPerHour` de cada zona em `huntingZones.ts` (17 500 a 69 500).
- **Observação secundária:** ouro sobra. No Cenário B há mediana de 1 500 de ouro parado no dia 14, e no A são 880 sem destino (só poção e Bolsa de Caça, que depende do farrapo). O ouro entra principalmente por missões diárias e por pedidos, quase nada pela Masmorra (46/dia no dia 1, 0 depois do dia 2).

## Política da simulação e o que ela não faz

Resumo da política (a versão completa e atual está no cabeçalho de `scripts/sim/progression.sim.ts`):

- **Visitas:** 2 por dia. A cada visita o jogo é "recarregado" (`normalizeSave`, que também reinicia missões diárias e sessões de Masmorra), coleta o que estava rodando, resgata missões, gasta, faz sessões, aceita pedido e inicia uma atividade de fundo.
- **Masmorra:** usa as 3 sessões grátis por dia (2 na primeira visita, 1 na segunda). Luta até morrer; só se retira (a) num chefe de bioma ainda não resgatado, para garantir o marco, (b) com HP <= 20% depois de um andar, (c) no andar 100. Conserta equipamento com durabilidade < 40. Mantém até 5 poções pequenas, menos quando as duas últimas sessões morreram sem limpar andar.
- **Caça:** atividade padrão. Zona de maior XP liberada pelo andar, profundidade mais funda que o CP permite (regra do CP recomendado da própria UI).
- **Minério/madeira:** só quando a próxima forja ou refino precisa. Atividades que ainda têm falta se revezam.
- **Equipamento:** forja a próxima peça do slot de menor tier (arma em caso de empate), passando pelas estações (fornalha, curtume, carpintaria, alquimia); equipa o que dá mais `computeCP`; refina com o ouro que não está reservado para a próxima forja; compra gemas com estilhaços quando a receita pede; encaixa gemas sobrando. A Bolsa de Caça nível 2 é comprada assim que possível.
- **Pontos de atributo:** 35% FOR, 30% VIT, 20% AGI, 15% RES.
- **Pedidos:** um por vez, o de maior ouro que cabe em 12 h e não consome material da próxima forja.
- **Cenário B:** igual ao A, mais uma visita curta (até 15 min) logo depois da primeira do dia, só enquanto a próxima forja ou a bolsa ainda precisa de drop comum; a caça é parada no minuto em que a prévia da bolsa (mesma que a `HuntModal` mostra) ainda guarda mais farrapos/ossos.

**Sistemas que a simulação não dirige** (e por quê):

| Sistema | Motivo |
| --- | --- |
| Battle Pass (resgate da trilha grátis, ativação) | `applyBattlePassClaim` e `activateBattlePass` vivem dentro de `App.tsx`; o XP do passe é contabilizado pelo motor, mas nada é resgatado |
| Jardim | nenhuma receita de equipamento usa planta; a política só usa o que o próximo upgrade exige |
| Crafting de poções, elixires, reforja, sessões extras de Masmorra com estilhaços, salvage de peças velhas, loja além de poções de vida | fora da política pedida (as funções puras existem; é só questão de escopo) |
| Expedição (legado) | substituída por Pedidos |

**Limitações importantes:**

- O laço de combate da Masmorra e o `finishRun` vivem em componentes React (`BattleModal.tsx`, `App.tsx`) e **não podem ser importados**. Foram espelhados em `scripts/sim/driver.ts` (`runDungeon`, `applyDungeonRun`, e as pequenas ações de mineração, refino, loja e missões), com comentários dizendo quais linhas espelham. Nenhuma conta de combate ou de recompensa foi reimplementada: tudo vem de `src/game` (`buildCombatStats`, `stageEnemyHp/Dmg`, `waveRewards`, `applyDamageReduction`, ...). Se o laço do `BattleModal` mudar, o espelho precisa acompanhar. O arredondamento por quadro (RAF) é ignorado e os tempos são em velocidade 1x (a UI tem 2x).
- O combate da Masmorra é quase determinístico (crítico 0% sem equipamento), então a variação entre seeds vem do horário das visitas (que muda a semente das caças) e dos sorteios de recompensa e de raridade. Faixas estreitas não significam "robusto", significam "sem aleatoriedade relevante".
- A política é razoável, não ótima. Um jogador humano que usasse poções fortes, elixires, substats raros, gemas ou caças de poucos minutos o dia todo passaria dos números do Cenário A. O Cenário B mostra o efeito de um desses truques.
- "Andar" é `highestDungeonFloor`, o andar em que a próxima sessão começa (andar limpo = valor - 1).
- A hora do dia, o fuso e o horário de verão não afetam o resultado (as visitas são em 09h e 21h do relógio local).

## Relatório completo

Gerado por `npm run sim`. Cada célula é mediana (mín–máx) entre as 20 seeds; quando não há variação aparece só o número.

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 14 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 6 | 84 | 10 | 0 | 0 |
| 2 | 39 (39–44) | 253 (253–280) | 25 | 0 | 0 |
| 3 | 48 (48–51) | 301 (301–318) | 25 | 0 | 0 |
| 4 | 52 (51–53) | 322 (318–330) | 25 | 0 | 0 |
| 5 | 54 (54–55) | 337 (337–342) | 25 | 0 | 0 |
| 6 | 56 (55–57) | 347 (342–353) | 25 | 0 | 0 |
| 7 | 57 (57–58) | 353 (353–359) | 25 | 0 | 0 |
| 8 | 58 (58–59) | 359 (359–365) | 25 | 0 | 0 |
| 9 | 59 | 365 | 25 | 0 | 0 |
| 10 | 60 | 371 | 25 | 0 | 0 |
| 11 | 61 (60–61) | 374 (371–376) | 25 | 0 | 0 |
| 12 | 61 (61–62) | 376 (376–382) | 25 | 0 | 0 |
| 13 | 62 | 382 | 25 | 0 | 0 |
| 14 | 62 (62–63) | 382 (382–388) | 25 | 0 | 0 |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 3 | 27 (26–28) | 67% |
| 2 | 5 | 42 (41–43) | 97% |
| 3 | 0 | 10 (10–11) | 100% |
| 4 | 0 | 12 | 100% |
| 5 | 0 | 11 (11–12) | 100% |
| 6 | 0 | 12 | 100% |
| 7 | 0 | 12 | 100% |
| 8 | 0 | 12 | 100% |
| 9 | 0 | 12 | 100% |
| 10 | 0 | 12 | 100% |
| 11 | 0 | 12 | 100% |
| 12 | 0 | 12 | 100% |
| 13 | 0 | 12 | 100% |
| 14 | 0 | 12 | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 96 (89–101) | 46 (39–51) | 0 | 0 | 0 | 50 | 30 | 66 (59–71) |
| 2 | 614 (603–799) | 67 (62–86) | 0 | 11 | 0 (0–52) | 530 (530–650) | 180 (180–210) | 503 (487–671) |
| 3 | 22 (22–194) | 0 | 0 | 22 | 0 (0–52) | 0 (0–120) | 30 | 496 (479–813) |
| 4 | 22 (22–191) | 0 | 0 | 22 | 0 (0–49) | 0 (0–120) | 0 | 580 (501–837) |
| 5 | 22 (22–201) | 0 | 0 | 22 | 0 (0–59) | 0 (0–120) | 0 | 667 (523–859) |
| 6 | 22 (22–191) | 0 | 0 | 22 | 0 (0–49) | 0 (0–120) | 0 | 702 (545–895) |
| 7 | 22 (22–191) | 0 | 0 | 22 | 0 (0–49) | 0 (0–120) | 0 | 724 (567–923) |
| 8 | 22 (22–157) | 0 | 0 | 22 | 0 (0–15) | 0 (0–120) | 0 | 746 (589–1 067) |
| 9 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 768 (611–1 089) |
| 10 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 790 (633–1 111) |
| 11 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 812 (655–1 133) |
| 12 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 834 (677–1 155) |
| 13 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 856 (699–1 177) |
| 14 | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 878 (721–1 199) |

Ouro gasto nos 14 dias, por destino (mediana entre seeds): poções 240

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 23 | 56 (45–71) | 4 (1–9) | 164 (139–190) | 4 | 0 | 4 |
| 3 | 0 | 229 (202–250) | 37 (29–45) | 243 (227–268) | 8 | 0 | 0 |
| 4 | 0 | 245 (225–268) | 38 (30–52) | 241 (213–262) | 8 | 0 | 0 |
| 5 | 0 | 247 (210–273) | 44 (31–49) | 250 (198–264) | 8 | 0 | 0 |
| 6 | 0 | 258 (234–285) | 41 (26–52) | 250 (220–276) | 8 | 0 | 0 |
| 7 | 0 | 267 (241–288) | 42 (34–53) | 259 (220–284) | 8 | 0 | 0 |
| 8 | 0 | 256 (231–281) | 45 (29–53) | 256 (231–278) | 8 | 0 | 0 |
| 9 | 0 | 258 (235–285) | 48 (38–58) | 253 (228–285) | 8 | 0 | 0 |
| 10 | 0 | 269 (243–287) | 44 (34–54) | 263 (233–299) | 8 | 0 | 0 |
| 11 | 0 | 262 (239–293) | 44 (30–58) | 267 (232–282) | 8 | 0 | 0 |
| 12 | 0 | 264 (244–285) | 45 (30–54) | 264 (227–282) | 8 | 0 | 0 |
| 13 | 0 | 263 (232–303) | 45 (29–56) | 260 (231–292) | 8 | 0 | 0 |
| 14 | 0 | 260 (235–283) | 44 (32–59) | 265 (242–290) | 8 | 0 | 0 |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana) | Mín–máx | Seeds que chegam lá em 14 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | nunca | - | 0/20 |
| Primeiro refino bem-sucedido | nunca | - | 0/20 |
| Checkpoint do andar 10 vencido | 2 | 2–2 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1) | nunca | - | 0/20 |
| Segunda zona de caça liberada | nunca | - | 0/20 |

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 33 | 6 / 6 / 6 / 6 / 6 | 6×20 |
| 2 | 71 | 33 (23–33) | 8 / 8 / 9 / 9 / 9 | 8×8 9×12 |
| 3 | 81 | 17 (17–27) | 10 / 10 / 10 / 10 / 10 | 10×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Cenário B (sensibilidade): igual ao A, mais uma visita curta (até 15 min, parando a caça quando a prévia da bolsa ainda guarda os farrapos) logo depois da primeira, enquanto faltarem itens comuns de caça

Seeds: 20 · dias simulados: 14 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 6 | 84 | 10 | 0 | 0 |
| 2 | 39 (39–44) | 335 (253–371) | 25 | 1 (0–1) | 1 (0–1) |
| 3 | 45 (39–51) | 372 (326–392) | 25 | 1 | 1 (0–1) |
| 4 | 47 (45–57) | 388 (363–474) | 25 | 1 | 1 (0–1) |
| 5 | 52 (48–59) | 422 (392–581) | 25 | 1 (1–2) | 1 (0–2) |
| 6 | 56 (52–61) | 469 (412–648) | 25 | 2 (1–2) | 1 (1–2) |
| 7 | 57 (54–63) | 563 (425–661) | 25 | 2 (1–2) | 1 (1–2) |
| 8 | 59 (56–63) | 574 (471–661) | 25 | 2 (1–2) | 1 (1–2) |
| 9 | 60 (57–65) | 594 (478–690) | 25 | 2 (1–2) | 1 (1–2) |
| 10 | 61 (58–66) | 605 (576–711) | 25 | 2 | 1 (1–2) |
| 11 | 63 (59–67) | 634 (584–719) | 25 | 2 | 2 (1–2) |
| 12 | 64 (61–68) | 655 (603–726) | 25 | 2 | 2 (1–2) |
| 13 | 66 (62–68) | 677 (613–750) | 25 | 2 | 2 (1–2) |
| 14 | 67 (63–69) | 692 (625–750) | 25 | 2 | 2 (1–2) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 3 | 27 (26–28) | 67% |
| 2 | 5 | 36 (35–42) | 97% |
| 3 | 0 | 11 (10–12) | 100% |
| 4 | 0 | 12 (12–14) | 100% |
| 5 | 0 | 12 (11–16) | 100% |
| 6 | 0 | 12 (12–16) | 100% |
| 7 | 0 | 13 (12–17) | 100% |
| 8 | 0 | 14 (12–18) | 100% |
| 9 | 0 | 14 (14–18) | 100% |
| 10 | 0 | 14 (14–18) | 100% |
| 11 | 0 | 15 (14–18) | 100% |
| 12 | 0 | 16 (14–18) | 100% |
| 13 | 0 | 16 (15–18) | 100% |
| 14 | 0 | 16 (16–18) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 96 (89–101) | 46 (39–51) | 0 | 0 | 0 | 50 | 30 | 66 (59–71) |
| 2 | 718 (608–900) | 69 (64–87) | 0 | 11 | 0 (0–52) | 630 (530–750) | 585 (480–690) | 281 (189–362) |
| 3 | 22 (0–380) | 0 | 0 | 6 (0–22) | 0 (0–149) | 0 (0–220) | 30 (30–250) | 273 (66–383) |
| 4 | 11 (0–708) | 0 | 0 | 11 (0–22) | 0 (0–488) | 0 (0–220) | 0 (0–450) | 285 (160–474) |
| 5 | 149 (0–1 524) | 0 | 0 | 11 (0–22) | 22 (0–332) | 110 (0–1 220) | 100 (0–758) | 363 (119–1 140) |
| 6 | 138 (0–1 560) | 0 | 0 | 22 (0–22) | 0 (0–363) | 110 (0–1 220) | 125 (0–1 238) | 410 (141–1 273) |
| 7 | 22 (0–1 552) | 0 | 0 | 22 (0–22) | 0 (0–689) | 0 (0–1 220) | 0 (0–938) | 782 (112–1 534) |
| 8 | 386 (22–1 555) | 0 | 0 | 22 (0–22) | 0 (0–470) | 120 (0–1 220) | 575 (0–1 188) | 814 (198–1 564) |
| 9 | 72 (22–613) | 0 | 0 | 22 (0–22) | 0 (0–493) | 50 (0–220) | 0 (0–720) | 711 (137–1 691) |
| 10 | 325 (22–1 111) | 0 | 0 | 22 (0–22) | 198 (0–623) | 120 (0–1 100) | 0 (0–1 238) | 848 (171–1 606) |
| 11 | 476 (11–938) | 0 | 0 | 11 (0–22) | 307 (0–707) | 120 (0–220) | 100 (0–720) | 1 015 (148–1 928) |
| 12 | 480 (22–813) | 0 | 0 | 0 (0–22) | 295 (0–693) | 120 (0–220) | 300 (0–750) | 1 328 (241–1 651) |
| 13 | 514 (22–799) | 0 | 0 | 11 (0–22) | 297 (0–679) | 120 (0–220) | 300 (0–750) | 1 384 (327–1 738) |
| 14 | 492 (122–785) | 0 | 0 | 11 (0–22) | 344 (0–665) | 120 (100–220) | 450 (0–750) | 1 526 (317–1 864) |

Ouro gasto nos 14 dias, por destino (mediana entre seeds): poções 240 · bolsa de caça 300 · estações 488 · forja 520 · refino 1 800

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 35 (26–44) | 69 (50–79) | 6 (1–12) | 179 (156–200) | 4.3 (4.1–4.3) | 0 | 4 |
| 3 | 70 (0–158) | 52 (0–303) | 9 (0–56) | 0 (0–314) | 2 (0–8.3) | 4 (0–4) | 2 (0–4) |
| 4 | 50 (1–95) | 137 (0–309) | 19 (0–57) | 150 (0–292) | 4 (0–8.1) | 4 (0–4) | 0 (0–4) |
| 5 | 53 (1–127) | 154 (0–316) | 21 (0–59) | 139 (0–300) | 4.2 (0.1–8) | 0 (0–4) | 4 (0–4) |
| 6 | 10 (0–157) | 284 (3–346) | 47 (0–65) | 268 (0–332) | 8.1 (0.1–8.3) | 0 (0–4) | 0 (0–4) |
| 7 | 4 (0–178) | 311 (0–414) | 54 (0–72) | 318 (0–401) | 8.1 (0–8.3) | 0 (0–4) | 0 (0–4) |
| 8 | 8 (0–270) | 355 (110–419) | 57 (1–77) | 334 (0–405) | 8.1 (0.3–8.3) | 0 (0–4) | 0 (0–4) |
| 9 | 72 (0–230) | 362 (0–438) | 60 (0–71) | 259 (0–414) | 8.1 (0–8.3) | 0 (0–4) | 0 (0–4) |
| 10 | 130 (0–417) | 353 (0–427) | 50 (0–70) | 78 (0–419) | 8.1 (0–8.3) | 0 (0–4) | 0 (0–4) |
| 11 | 197 (2–403) | 261 (0–425) | 35 (0–77) | 0 (0–377) | 4.3 (0–8.3) | 0 (0–4) | 0 (0–4) |
| 12 | 177 (0–418) | 64 (0–440) | 4 (0–74) | 0 (0–430) | 0.3 (0–8.3) | 4 (0–4) | 4 (0–4) |
| 13 | 205 (0–436) | 195 (0–408) | 26 (0–75) | 0 (0–413) | 4 (0–8.3) | 2 (0–4) | 4 (0–4) |
| 14 | 210 (96–441) | 305 (12–452) | 38 (0–76) | 0 (0–185) | 4.3 (0.3–8.3) | 0 (0–4) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana) | Mín–máx | Seeds que chegam lá em 14 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–3 | 20/20 |
| Primeiro refino bem-sucedido | 2 | 2–4 | 20/20 |
| Checkpoint do andar 10 vencido | 2 | 2–2 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1) | nunca | - | 0/20 |
| Segunda zona de caça liberada | nunca | - | 0/20 |

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 33 | 6 / 6 / 6 / 6 / 6 | 6×20 |
| 2 | 71 | 33 (23–33) | 8 / 8 / 9 / 9 / 9 | 8×8 9×12 |
| 3 | 81 | 17 (17–27) | 10 / 10 / 10 / 10 / 10 | 10×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Diagnóstico da bolsa de caça

#### Diagnóstico: o que a bolsa de caça de 2 espaços deixa passar (herói novo, demon_glade raso, 20 horários de início)

| Duração da caça | Farrapos sorteados | Garras sorteadas | Núcleos sorteados | Farrapos que entram na bolsa | Sessões em que algum farrapo sobrevive |
| --: | --- | --- | --- | --- | --- |
| 15 min | 10.7 | 3.1 | 0.3 | 7.8 | 15/20 |
| 30 min | 21.1 | 6.6 | 0.5 | 12.5 | 12/20 |
| 60 min (1 h) | 40.8 | 12.6 | 1 | 11 | 5/20 |
| 120 min (2 h) | 78.3 | 24.2 | 1.9 | 13 | 3/20 |
| 240 min (4 h) | 147 | 48.3 | 4.4 | 0 | 0/20 |

### Diagnóstico do chefe do andar 25

#### Diagnóstico: chefe do andar 25 (recomendado pelo jogo: CP 916) contra heróis montados à mão, sem poções, de HP cheio

| Equipamento | Nível | CP | Vitórias contra o chefe (30 sorteios) |
| --: | --- | --- | --- |
| Roupa de trapos + Clava | 30 | 204 | 0/30 |
| Roupa de trapos + Clava | 60 | 371 | 0/30 |
| Roupa de trapos + Clava | 100 | 620 | 0/30 |
| Tier 1 (adaga + couro) +0 | 60 | 449 | 0/30 |
| Tier 1 +8 | 60 | 521 | 0/30 |
| Tier 2 (espada + cota) +0 | 60 | 556 | 0/30 |
| Tier 2 +8 | 60 | 700 | 0/30 |
| Tier 2 +8 | 100 | 1 037 | 30/30 |
| Tier 3 (montante + placas) +0 | 60 | 740 | 0/30 |
| Tier 3 +8 | 60 | 1 009 | 30/30 |
| Tier 3 +8 | 100 | 1 422 | 30/30 |
| Tier 4 (lâmina dourada + égide) +8 | 100 | 1 712 | 30/30 |

