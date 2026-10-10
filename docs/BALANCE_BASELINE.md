# Baseline de balanceamento: as primeiras horas de um jogador novo (depois da rodada 6: escudos, machados, relíquias de chefe e materiais das zonas 3 e 4)

- **Data:** 2026-10-10
- **Commit medido:** o commit `feat: shield slot, axe weapon line and boss relics` e o seguinte (materiais das zonas 3 e 4 e o retune dos orcs), na branch `claude/project-thread-ppdm57`. O baseline da rodada 4/5 está no histórico do git.
- **Como reproduzir:** `npm run sim` (cerca de 15 s para 20 seeds x 21 dias x 2 cenários). Código em `scripts/sim/` (`driver.ts`, `player.ts`, `progression.sim.ts`, `ladder.ts`). As medições de itens ficam em `npm run sim:items` (`docs/ITEM_BALANCE_AUDIT.md`).
- **Quem é o jogador simulado:** conta nova, sem Battle Pass, 2 visitas por dia (09h e 21h, com variação de até 90 min por seed), usa todas as 10 sessões grátis de Masmorra por dia, caça o resto do tempo e só minera/corta quando o próximo upgrade pede. **Desde a rodada 3 ele também forja capacete, luvas, botas e anel** (ver a política), e o jogo está equilibrado em torno desse jogador.

## Resumo para quem tem pressa

1. **Metas mantidas depois da rodada 6** (escudo no sétimo slot, linha de machados, relíquias de chefe, materiais novos das zonas 3 e 4): primeira sessão termina no andar 8; primeira peça forjada no dia 2; nível 13 / 27 / 48 nos dias 1 / 3 / 14; o chefe do andar 25 cai no dia 5; nenhuma seed chega ao andar 50 antes do dia 10; sem queda de dificuldade depois de chefe (menor razão 1,53).
2. **O que foi preciso mexer:** só os orcs (andares 26-49), `hp` 250 -> 268 e `dmg` 37 -> 40, e a tabela de CP recomendada, regerada. Sem isso a primeira seed chegava ao andar 50 no dia 8 (o escudo vale cerca de +8% de CP). Detalhes, tentativas e números em `BALANCE_CHANGES.md` (seção 27).
3. **Simulação:** a política forja também o escudo (arma > armadura > luvas > elmo > escudo > botas > anel), escolhe machado ou espada pelo próprio `computeCP` e equipa a melhor relíquia que tiver (as de chefe quase nunca caem no horizonte de 21 dias: o jogador simulado só enfrenta cada chefe uma vez).
4. O resto do documento é o relatório completo da simulação.

## Política da simulação e o que ela não faz

Resumo da política (a versão completa e atual está no cabeçalho de `scripts/sim/progression.sim.ts`):

- **Visitas:** 2 por dia. A cada visita o jogo é "recarregado" (`normalizeSave`, que também reinicia missões diárias e sessões de Masmorra), coleta o que estava rodando, resgata missões, gasta, faz sessões, aceita pedido e inicia uma atividade de fundo.
- **Masmorra:** usa todas as sessões grátis do dia (`T.dungeon.freeSessionsPerDay` = 10: 5 em cada visita). Luta até morrer; só se retira (a) num chefe de bioma ainda não resgatado, para garantir o marco, (b) com HP <= 20% depois de um andar, (c) no andar 100. Conserta equipamento com durabilidade < 40. Mantém até 5 poções pequenas, compradas só com ouro que sobra depois de reservar o preço da próxima forja (antes podiam consumir metade da reserva), e não compra enquanto as duas últimas sessões morreram sem limpar andar.
- **Caça:** atividade padrão. Zona de maior XP liberada pelo andar, profundidade mais funda que o CP permite (regra do CP recomendado da própria UI).
- **Minério/madeira:** só quando a próxima forja ou refino precisa. Atividades que ainda têm falta se revezam.
- **Equipamento:** forja a próxima peça dos 7 slots (arma > armadura > luvas > capacete > escudo > botas > anel; a arma é a espada ou o machado, o que der mais `computeCP`; o tier mais baixo primeiro, a prioridade desempata), passando pelas estações (fornalha, curtume, carpintaria, alquimia); cada peça nova consome 1 do tier anterior do mesmo slot (arma e armadura continuam com "2 de"); equipa o que dá mais `computeCP` em cada slot; **só arma e armadura são refinadas** (com o ouro que não está reservado para a próxima forja); compra gemas com estilhaços quando a receita pede; encaixa gemas sobressalentes na arma e na armadura. A Bolsa de Caça nível 2 é comprada assim que possível (a Bolsa do tier 1 tem 3 espaços). **Rodada 4:** depois do conjunto completo do tier 3 (todos os slots com tier >= 3) forja uma relíquia (a de maior `computeCP` entre as três, uma só) e equipa a que dá mais CP.
- **Pontos de atributo:** 35% FOR, 30% VIT, 20% AGI, 15% RES.
- **Pedidos:** um por vez, o de maior ouro que cabe em 12 h e não consome material da próxima forja.
- **Cenário B** (depois da Bolsa de 3 espaços o truque das caças curtas quase não importa: o B é, na prática, "o A com uma visita a mais por dia"): igual ao A, mais uma visita curta (até 15 min) logo depois da primeira do dia, só enquanto a próxima forja ou a bolsa ainda precisa de drop comum; a caça é parada no minuto em que a prévia da bolsa (mesma que a `HuntModal` mostra) ainda guarda mais farrapos/ossos.

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

Gerado por `npm run sim`. Cada célula é mediana (mín–máx) entre as 20 seeds; quando não há variação aparece só o número. A seção "Metas" resume o que `BALANCE_CHANGES.md` compara com o baseline anterior.

### Metas de balanceamento (T2 a T8) e do inventário (I1 a I4)

| Meta | Critério | Cenário A (pedido) | Resultado |
| --- | --- | --- | --- |
| T2 | Primeira sessão da conta nova termina no andar ≥ 8; checkpoint do andar 10 no dia 1 | andar 8; checkpoint 10 no dia 1 | ok |
| T3 | Primeira peça forjada no dia 1 ou 2 | dia 2 | ok |
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–29 / 45–60) | 13 / 27 (25–33) / 48 (46–51) | ok |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 5; vitória ao chegar: 0% | ok |
| T6 | Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16 | chegada: primeira seed no dia 10, mediana 14; chefe 50: primeira seed no dia 12, mediana 17.5, 13/20 em 21 dias | chegada ok; chefe ok |
| T7 | Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75 | menor razão (N+1)/(N−1): 1.53 | ok |
| T8 | Derrota mantém 75% do ouro da sessão | 75% | ok |
| I1 | Com 2 visitas por dia, o inventário enche pela primeira vez entre os dias 3 e 6 (não no dia 1, não nunca), no ritmo de quem não arruma | dia 6 (mín–máx 5–7; 20/20 seeds); jogador atento: 9/20 seeds chegam a encher antes de arrumar | ok |
| I2 | Jogador atento perde menos de 5% dos materiais por transbordo | mediana 0% · pior seed 11.57% | ok |
| I3 | Jogador que ignora o inventário sente: perde pelo menos 10% dos materiais | mediana 69% · pior seed 86.2% · melhor seed 20.8% | ok |
| I4 | Ouro do mercador (vendendo todo o excesso do dia) no máximo ~35% do ouro diário de antes do mercador (424 / 521 / 483), nos dias 3, 7 e 14 | dia 3: +0% · dia 7: +20.7% · dia 14: +25.7% | ok |

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 119 | 24 | 0 | 0 |
| 2 | 23 (23–24) | 268 (255–305) | 25 | 1 | 1 (1–2) |
| 3 | 27 (25–33) | 348 (299–408) | 25 | 1 | 1 (1–2) |
| 4 | 29 (25–33) | 407 (339–637) | 25 (25–28) | 2 (1–2) | 1 (1–2) |
| 5 | 34 (31–37) | 614 (423–727) | 27 (25–30) | 2 | 2 (1–2) |
| 6 | 37 (34–41) | 712 (632–795) | 30 (27–30) | 2 | 2 (1–2) |
| 7 | 39 (35–43) | 736 (660–905) | 30 (30–34) | 2 | 2 (1–3) |
| 8 | 41 (38–45) | 763 (660–982) | 30 (30–39) | 2 (2–3) | 2 (1–3) |
| 9 | 43 (39–47) | 812 (686–1 316) | 30 (30–44) | 2 (2–3) | 2 (1–3) |
| 10 | 43 (39–48) | 964 (763–1 341) | 38 (30–50) | 3 (2–3) | 2 (1–3) |
| 11 | 45 (41–49) | 1 006 (783–1 353) | 40 (30–50) | 3 (2–3) | 2 (1–3) |
| 12 | 46 (43–50) | 1 051 (791–1 431) | 40 (30–54) | 3 (2–3) | 3 (2–3) |
| 13 | 48 (45–51) | 1 110 (814–1 433) | 43 (30–58) | 3 (2–3) | 3 (2–3) |
| 14 | 48 (46–51) | 1 189 (881–1 532) | 50 (36–58) | 3 (2–3) | 3 (2–3) |
| 15 | 49 (47–51) | 1 241 (881–1 635) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 16 | 49 (48–52) | 1 306 (890–1 650) | 50 (40–62) | 3 (2–3) | 3 (2–3) |
| 17 | 50 (48–53) | 1 383 (890–1 744) | 53 (40–68) | 3 (2–3) | 3 (2–3) |
| 18 | 51 (48–54) | 1 464 (890–1 760) | 57 (40–70) | 3 (2–3) | 3 (2–3) |
| 19 | 51 (48–54) | 1 464 (890–1 760) | 60 (40–70) | 3 (2–3) | 3 (2–3) |
| 20 | 51 (49–55) | 1 491 (890–1 774) | 60 (40–70) | 3 (2–3) | 3 (2–3) |
| 21 | 52 (49–56) | 1 491 (890–1 789) | 60 (40–70) | 3 (2–3) | 3 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 7 119 (7 119–8 469) | 129 | 6 990 | 0 (0–1 350) |
| 3 | 5 893 (2 550–22 307) | 0 | 0 | 5 893 (2 550–22 307) |
| 4 | 5 685 (715–17 680) | 0 (0–905) | 0 (0–9 095) | 4 268 (390–11 467) |
| 5 | 16 942 (11 216–25 550) | 423 (0–1 046) | 9 096 (0–18 838) | 2 775 (0–22 866) |
| 6 | 21 288 (5 268–44 877) | 423 (0–1 190) | 17 738 (0–37 643) | 5 770 (0–16 155) |
| 7 | 18 966 (0–48 313) | 0 (0–806) | 18 821 (0–37 673) | 585 (0–15 527) |
| 8 | 15 792 (715–40 499) | 0 (0–825) | 9 414 (0–37 667) | 2 663 (0–12 755) |
| 9 | 19 027 (0–52 127) | 0 (0–2 731) | 18 832 (0–37 686) | 2 145 (0–11 728) |
| 10 | 23 100 (325–39 790) | 840 (0–2 105) | 18 843 (0–37 695) | 0 (0–4 165) |
| 11 | 37 676 (0–40 227) | 87 (0–1 271) | 37 667 (0–37 687) | 390 (0–5 695) |
| 12 | 37 692 (774–56 815) | 664 (0–2 812) | 37 667 (0–55 079) | 0 (0–4 980) |
| 13 | 37 859 (8 265–66 443) | 536 (0–2 495) | 37 670 (0–64 160) | 585 (0–15 697) |
| 14 | 37 684 (917–41 916) | 87 (0–2 105) | 37 671 (0–37 684) | 390 (0–11 107) |
| 15 | 37 689 (3 618–58 216) | 0 (0–3 152) | 37 666 (0–55 091) | 0 (0–8 840) |
| 16 | 37 678 (4 953–77 492) | 0 (0–2 105) | 37 673 (0–72 498) | 390 (0–9 180) |
| 17 | 37 875 (0–72 963) | 0 (0–2 705) | 37 668 (0–72 508) | 423 (0–20 627) |
| 18 | 37 668 (0–77 144) | 0 (0–3 892) | 36 946 (0–72 523) | 0 (0–11 573) |
| 19 | 28 924 (0–72 972) | 0 (0–1 787) | 27 513 (0–72 517) | 618 (0–12 120) |
| 20 | 16 018 (0–74 232) | 0 (0–1 415) | 9 417 (0–72 523) | 423 (0–12 270) |
| 21 | 8 552 (0–72 843) | 0 (0–2 105) | 0 (0–72 510) | 0 (0–10 843) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 6 (6–7) | 100% |
| 3 | 0 | 7 (6–8) | 100% |
| 4 | 0 (0–0.3) | 8 (8–10) | 98% |
| 5 | 0.2 (0–0.4) | 9 (8–11) | 96% |
| 6 | 0.3 (0–0.5) | 11 (8–15) | 97% |
| 7 | 0 (0–0.4) | 9 (8–12) | 100% |
| 8 | 0 (0–0.5) | 9 (7–13) | 100% |
| 9 | 0 (0–1.4) | 10 (7–19) | 100% |
| 10 | 0.5 (0–1) | 13 (9–19) | 100% |
| 11 | 0.1 (0–0.6) | 11 (9–16) | 100% |
| 12 | 0.3 (0–1.1) | 12 (9–18) | 99% |
| 13 | 0.3 (0–1) | 12 (9–18) | 100% |
| 14 | 0.1 (0–1) | 11 (9–18) | 100% |
| 15 | 0 (0–1.3) | 11 (9–19) | 99% |
| 16 | 0 (0–1) | 10 (7–18) | 100% |
| 17 | 0 (0–1) | 10 (7–17) | 99% |
| 18 | 0 (0–1.6) | 10 (7–18) | 99% |
| 19 | 0 (0–0.6) | 10 (7–16) | 100% |
| 20 | 0 (0–0.5) | 9 (7–16) | 100% |
| 21 | 0 (0–1) | 9 (7–19) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 417 (415–584) | 6 (4–7) | 0 | 11 | 0 (0–47) | 400 (400–520) | 465 (380–610) | 77 (63–155) |
| 3 | 410 (308–887) | 0 | 0 | 0 | 190 (88–667) | 220 | 388 (285–620) | 102 (19–355) |
| 4 | 360 (146–3 644) | 0 (0–59) | 0 (0–2 000) | 0 (0–12) | 141 (15–348) | 220 (120–1 300) | 338 (0–3 426) | 273 (128–934) |
| 5 | 543 (171–4 015) | 35 (0–75) | 0 (0–2 000) | 12 (0–27) | 96 (0–684) | 220 (100–1 300) | 968 (0–3 678) | 385 (89–2 965) |
| 6 | 638 (258–3 931) | 33 (0–97) | 0 (0–2 000) | 24 (0–52) | 188 (0–490) | 260 (100–1 300) | 719 (0–3 963) | 899 (109–1 614) |
| 7 | 301 (106–820) | 0 (0–54) | 0 | 25 (0–52) | 24 (0–492) | 120 (0–220) | 215 (0–2 420) | 633 (44–1 561) |
| 8 | 349 (136–728) | 0 (0–61) | 0 | 12 (0–55) | 97 (0–405) | 120 (0–220) | 100 (0–740) | 855 (24–1 711) |
| 9 | 386 (100–1 046) | 0 (0–206) | 0 | 24 (0–57) | 79 (0–373) | 120 (0–300) | 675 (0–1 825) | 476 (0–1 662) |
| 10 | 347 (145–646) | 58 (0–157) | 0 | 27 (0–58) | 0 (0–137) | 140 (0–300) | 567 (0–2 016) | 220 (7–1 406) |
| 11 | 322 (122–633) | 6 (0–100) | 0 | 48 (0–54) | 16 (0–191) | 120 (0–300) | 273 (0–745) | 298 (17–1 578) |
| 12 | 338 (59–6 282) | 49 (0–255) | 0 (0–5 000) | 48 (0–79) | 0 (0–167) | 100 (0–800) | 353 (0–2 005) | 329 (76–5 879) |
| 13 | 419 (168–6 221) | 43 (0–220) | 0 (0–5 000) | 50 (0–96) | 24 (0–520) | 210 (0–800) | 372 (0–4 315) | 376 (15–5 865) |
| 14 | 387 (176–5 913) | 7 (0–156) | 0 (0–5 000) | 50 (0–59) | 17 (0–362) | 210 (0–680) | 575 (0–2 713) | 370 (42–5 428) |
| 15 | 403 (24–6 225) | 0 (0–333) | 0 (0–5 000) | 51 (0–84) | 0 (0–304) | 160 (0–680) | 290 (0–3 525) | 373 (66–5 691) |
| 16 | 382 (128–6 027) | 0 (0–185) | 0 (0–5 000) | 50 (0–104) | 16 (0–316) | 200 (0–680) | 265 (0–2 745) | 576 (18–5 443) |
| 17 | 349 (88–6 350) | 0 (0–274) | 0 (0–5 000) | 52 (0–104) | 18 (0–673) | 120 (0–800) | 150 (0–4 685) | 1 587 (312–6 096) |
| 18 | 353 (0–6 442) | 0 (0–401) | 0 (0–5 000) | 52 (0–104) | 0 (0–377) | 110 (0–830) | 420 (0–4 720) | 1 784 (281–6 366) |
| 19 | 321 (0–6 073) | 0 (0–182) | 0 (0–5 000) | 37 (0–104) | 27 (0–401) | 120 (0–680) | 210 (0–2 685) | 1 921 (351–6 392) |
| 20 | 304 (0–864) | 0 (0–144) | 0 | 13 (0–104) | 18 (0–407) | 120 (0–300) | 50 (0–2 900) | 2 131 (331–6 922) |
| 21 | 304 (0–612) | 0 (0–184) | 0 | 0 (0–104) | 0 (0–358) | 120 (0–300) | 100 (0–1 240) | 2 242 (335–6 950) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 2 130 · estações 2 438 · forja 2 460 · refino 2 925 · alquimia 1 155 · mochila 1 750 · baú 785 · reparo 58

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 | 2 | 0 | 0% | 0 | 0 | 0 | 0 | 419 (412–430) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 417 (415–584) | 0 / 0 |
| 3 | 26 | 11 (9–11) | 11 (10–11) | 0 | 0% | 0 | 0 | 0 | 0 | 410 (308–887) | 0 / 0 |
| 4 | 26 | 14 (13–18) | 14 (13–18) | 0 | 0% | 0 | 0 | 0 | 0 | 360 (146–3 644) | 0 / 0 |
| 5 | 26 (26–30) | 19 (15–23) | 19 (15–24) | 0 | 0% | 114 (0–263) | 2 (0–102) | 0 (0–145) | 2 (0–102) | 543 (139–4 015) | 0 (0–1) / 3 (0–12) |
| 6 | 26 (26–30) | 21 (16–25) | 23 (18–26) | 0 | 0% | 212 (0–439) | 102 (74–112) | 123 (0–301) | 102 (74–112) | 550 (150–3 827) | 0 (0–1) / 7 (4–14) |
| 7 | 26 (26–30) | 21 (16–25) | 23 (20–27) | 0 | 0% | 172 (0–401) | 108 (0–116) | 95 (0–226) | 108 (0–116) | 221 (0–712) | 0 (0–2) / 12 (6–15) |
| 8 | 26 (26–30) | 22 (19–24) | 23 (20–25) | 0 | 0% | 155 (0–448) | 112 (0–120) | 60 (0–225) | 112 (0–120) | 237 (24–624) | 0 (0–2) / 12 (6–20) |
| 9 | 30 (26–35) | 22 (19–26) | 23 (20–26) | 0 | 0% | 195 (8–504) | 114 (0–124) | 83 (0–446) | 114 (0–124) | 276 (24–930) | 0 (0–2) / 16 (7–21) |
| 10 | 30 (26–35) | 22 (14–28) | 24 (19–30) | 0 | 0% | 246 (2–538) | 116 (0–126) | 110 (0–685) | 116 (0–126) | 250 (27–556) | 0 (0–2) / 20 (10–27) |
| 11 | 30 (26–35) | 24 (17–32) | 25 (17–32) | 0 | 0% | 154 (0–581) | 120 (75–128) | 165 (0–735) | 120 (75–128) | 213 (0–517) | 1 (0–2) / 20 (13–32) |
| 12 | 30 (26–35) | 24 (16–30) | 25 (19–32) | 0 (0–76) | 0% | 245 (0–656) | 120 (0–130) | 246 (0–787) | 122 (0–130) | 216 (48–6 152) | 1 (0–2) / 20 (16–40) |
| 13 | 30 (26–45) | 24 (18–38) | 24 (18–38) | 0 (0–122) | 0% | 376 (0–556) | 120 (0–128) | 244 (0–522) | 121 (0–132) | 296 (48–6 221) | 1 (0–2) / 27 (20–40) |
| 14 | 30 (26–45) | 25 (16–37) | 25 (19–38) | 0 (0–161) | 0% | 182 (0–558) | 124 (0–132) | 262 (0–747) | 124 (0–132) | 370 (50–5 791) | 2 (0–3) / 30 (20–40) |
| 15 | 30 (26–45) | 25 (18–38) | 25 (19–38) | 0 (0–407) | 0% | 361 (0–748) | 126 (0–130) | 252 (0–711) | 126 (0–130) | 298 (24–6 097) | 2 (0–3) / 31 (20–42) |
| 16 | 33 (26–45) | 26 (18–37) | 27 (18–40) | 0 (0–181) | 0% | 286 (0–1 158) | 126 (0–134) | 249 (0–646) | 127 (0–134) | 303 (24–5 895) | 2 (0–3) / 37 (20–50) |
| 17 | 35 (26–45) | 29 (20–40) | 29 (20–40) | 0 (0–39) | 0% | 137 (0–1 150) | 128 (0–136) | 419 (0–757) | 128 (0–136) | 221 (0–6 218) | 2 (0–3) / 39 (20–50) |
| 18 | 35 (26–45) | 30 (19–41) | 30 (20–41) | 0 | 0% | 64 (0–509) | 130 (0–138) | 353 (0–974) | 130 (0–138) | 218 (0–6 308) | 2 (0–3) / 40 (20–50) |
| 19 | 38 (26–45) | 31 (19–45) | 31 (20–45) | 0 (0–368) | 0% | 29 (0–570) | 129 (0–138) | 245 (0–933) | 132 (0–138) | 216 (0–5 941) | 2 (0–3) / 40 (20–50) |
| 20 | 40 (26–45) | 33 (24–45) | 33 (24–45) | 0 (0–628) | 0% | 7 (0–192) | 128 (0–140) | 255 (0–776) | 132 (0–140) | 170 (0–794) | 2 (0–3) / 40 (20–50) |
| 21 | 40 (26–45) | 33 (24–45) | 34 (25–45) | 0 (0–859) | 0% | 9 (0–320) | 129 (0–142) | 206 (0–791) | 133 (0–142) | 190 (0–478) | 2 (0–3) / 40 (20–50) |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 0 | 4 |
| 2 | 190 (174–214) | 56 (45–67) | 4 (1–10) | 0 | 4 | 4 | 0 |
| 3 | 70 | 0 | 0 | 0 | 0 | 4 | 4 |
| 4 | 100 (100–208) | 0 (0–131) | 0 (0–28) | 0 | 0 (0–4) | 4 | 4 (0–4) |
| 5 | 227 (115–271) | 140 (0–182) | 24 (0–34) | 0 | 4 (0–5) | 4 (0–4) | 0 (0–4) |
| 6 | 231 (142–346) | 151 (0–304) | 28 (0–67) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 7 | 211 (89–353) | 133 (0–332) | 25 (0–74) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 8 | 183 (89–326) | 125 (0–312) | 13 (0–72) | 0 | 2.5 (0–10) | 4 (0–8) | 0 (0–4) |
| 9 | 165 (0–362) | 214 (0–359) | 29 (0–92) | 0 | 5 (0–10) | 2 (0–4) | 2 (0–8) |
| 10 | 270 (89–414) | 281 (0–445) | 45 (0–107) | 0 | 5 (0–10) | 0 (0–4) | 2 (0–8) |
| 11 | 302 (107–432) | 294 (0–431) | 67 (0–111) | 0 | 10 (0–10) | 0 (0–8) | 0 (0–4) |
| 12 | 302 (107–429) | 313 (116–527) | 66 (0–122) | 0 (0–76) | 10 (0–11) | 0 (0–8) | 0 (0–4) |
| 13 | 328 (153–421) | 332 (0–427) | 71 (0–99) | 0 (0–122) | 10 (0–12) | 0 (0–4) | 0 (0–8) |
| 14 | 335 (0–443) | 338 (0–436) | 76 (0–119) | 0 (0–161) | 10 (0–10) | 0 (0–8) | 0 (0–8) |
| 15 | 343 (89–421) | 365 (0–552) | 82 (0–154) | 0 (0–407) | 10 (0–11) | 0 (0–8) | 0 (0–4) |
| 16 | 327 (0–464) | 367 (89–637) | 77 (0–190) | 0 (0–181) | 10 (0–12) | 0 (0–4) | 0 (0–4) |
| 17 | 334 (0–489) | 352 (0–696) | 79 (0–208) | 0 (0–39) | 10 (0–12) | 0 (0–8) | 0 (0–4) |
| 18 | 286 (0–426) | 359 (0–721) | 80 (0–214) | 0 | 8 (0–12) | 0 (0–4) | 0 (0–4) |
| 19 | 153 (0–406) | 307 (0–714) | 48 (0–206) | 0 (0–368) | 5.5 (0–12) | 0 (0–8) | 0 (0–4) |
| 20 | 133 (0–405) | 290 (0–649) | 18 (0–200) | 0 (0–628) | 2.5 (0–12) | 4 (0–4) | 2 (0–4) |
| 21 | 84 (0–404) | 290 (0–694) | 0 (0–195) | 0 (0–859) | 0 (0–12) | 4 (0–4) | 2 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | 18 | 12–20 | 13/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5 | 4–6 | 20/20 |
| Segunda zona de caça liberada | 5 | 4–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 14 | 10–21 | 18/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | 17.5 | 12–19 | 13/20 |
| Inventário cheio pela primeira vez (antes de qualquer arrumação) | depois do dia 21 | 6–20 | 9/20 |
| Primeira melhoria do Baú | 11 | 5–14 | 19/20 |
| Segunda melhoria do Baú | 14.5 | 7–19 | 17/20 |
| Terceira melhoria do Baú | depois do dia 21 | 14–21 | 4/20 |

Dia em que cada seed chegou ao andar 50 (ordenado): 10 10 11 12 12 13 13 13 13 14 14 15 16 17 17 18 18 21 - -

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 57 | 8 / 8 / 8 / 8 / 8 | 8×20 |
| 2 | 81 | 27 | 10 / 10 / 10 / 10 / 10 | 10×20 |
| 3 | 84 | 20 | 11 / 11 / 11 / 11 / 11 | 11×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Cenário N (descuidado): o mesmo jogador que nunca guarda, vende, descarta nem expande o inventário

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 119 | 24 | 0 | 0 |
| 2 | 23 (23–24) | 268 (255–305) | 25 | 1 | 1 (1–2) |
| 3 | 27 (25–33) | 344 (304–391) | 25 | 1 | 1 (1–2) |
| 4 | 29 (26–33) | 428 (391–681) | 25 (25–29) | 2 | 1 (1–2) |
| 5 | 34 (32–37) | 646 (457–751) | 27 (25–30) | 2 | 2 (1–3) |
| 6 | 38 (34–41) | 700 (640–1 039) | 30 (27–31) | 2 (2–3) | 2 (1–3) |
| 7 | 40 (34–43) | 711 (659–1 124) | 30 (27–40) | 2 (2–3) | 2 (1–3) |
| 8 | 41 (34–44) | 715 (672–1 124) | 30 (28–40) | 2 (2–3) | 2 (1–3) |
| 9 | 42 (34–46) | 730 (672–1 135) | 30 (29–40) | 2 (2–3) | 2 (1–3) |
| 10 | 42 (34–47) | 736 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 11 | 43 (34–48) | 739 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 12 | 43 (34–49) | 749 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 13 | 43 (34–50) | 753 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 14 | 43 (34–50) | 753 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 15 | 43 (34–51) | 755 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 16 | 43 (34–52) | 756 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 17 | 43 (34–52) | 756 (672–1 135) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 18 | 43 (34–52) | 760 (672–1 135) | 30 (30–47) | 2 (2–3) | 2 (1–3) |
| 19 | 43 (34–52) | 760 (672–1 135) | 30 (30–50) | 2 (2–3) | 2 (1–3) |
| 20 | 43 (34–52) | 760 (672–1 135) | 30 (30–50) | 2 (2–3) | 2 (1–3) |
| 21 | 43 (34–52) | 760 (672–1 135) | 30 (30–50) | 2 (2–3) | 2 (1–3) |

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 | 2 | 0 | 0% | 0 | 0 | 0 | 0 | 419 (412–430) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 417 (415–584) | 0 / 0 |
| 3 | 26 | 11 (9–11) | 11 (9–11) | 0 | 0% | 0 | 0 | 0 | 0 | 410 (308–887) | 0 / 0 |
| 4 | 26 | 14 (13–18) | 14 (13–18) | 0 | 0% | 0 | 0 | 0 | 0 | 411 (100–3 671) | 0 / 0 |
| 5 | 26 | 24 (18–26) | 24 (18–26) | 0 | 0% | 0 | 0 | 0 | 0 | 3 475 (133–3 748) | 0 / 0 |
| 6 | 26 | 26 (25–26) | 26 (25–26) | 211 (0–474) | 49.7% | 0 | 0 | 0 | 0 | 341 (24–3 615) | 0 / 0 |
| 7 | 26 | 26 | 26 | 257 (0–885) | 90% | 0 | 0 | 0 | 0 | 109 (0–484) | 0 / 0 |
| 8 | 26 | 26 | 26 | 235 (0–602) | 83.7% | 0 | 0 | 0 | 0 | 45 (0–467) | 0 / 0 |
| 9 | 26 | 26 | 26 | 218 (0–589) | 92.3% | 0 | 0 | 0 | 0 | 41 (0–523) | 0 / 0 |
| 10 | 26 | 26 | 26 | 241 (0–599) | 100% | 0 | 0 | 0 | 0 | 0 (0–216) | 0 / 0 |
| 11 | 26 | 26 | 26 | 125 (0–623) | 100% | 0 | 0 | 0 | 0 | 0 (0–184) | 0 / 0 |
| 12 | 26 | 26 | 26 | 118 (0–630) | 100% | 0 | 0 | 0 | 0 | 20 (0–282) | 0 / 0 |
| 13 | 26 | 26 | 26 | 137 (0–631) | 100% | 0 | 0 | 0 | 0 | 26 (0–229) | 0 / 0 |
| 14 | 26 | 26 | 26 | 131 (0–616) | 100% | 0 | 0 | 0 | 0 | 12 (0–271) | 0 / 0 |
| 15 | 26 | 26 | 26 | 137 (0–614) | 100% | 0 | 0 | 0 | 0 | 0 (0–169) | 0 / 0 |
| 16 | 26 | 26 | 26 | 143 (0–559) | 100% | 0 | 0 | 0 | 0 | 7 (0–169) | 0 / 0 |
| 17 | 26 | 26 | 26 | 137 (0–473) | 100% | 0 | 0 | 0 | 0 | 0 (0–160) | 0 / 0 |
| 18 | 26 | 26 | 26 | 67 (0–443) | 50% | 0 | 0 | 0 | 0 | 7 (0–210) | 0 / 0 |
| 19 | 26 | 26 (25–26) | 26 (25–26) | 76 (0–460) | 50% | 0 | 0 | 0 | 0 | 0 (0–369) | 0 / 0 |
| 20 | 26 | 26 | 26 | 70 (0–487) | 50% | 0 | 0 | 0 | 0 | 0 (0–187) | 0 / 0 |
| 21 | 26 | 26 | 26 | 73 (0–464) | 50% | 0 | 0 | 0 | 0 | 0 (0–160) | 0 / 0 |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 190 (174–214) | 56 (45–67) | 4 (1–10) | 0 | 4 | 0 | 4 |
| 3 | 70 | 0 | 0 | 0 | 0 | 4 | 4 |
| 4 | 100 | 0 | 0 | 0 | 0 | 4 | 4 |
| 5 | 241 (151–344) | 162 (0–335) | 29 (0–76) | 0 | 5 (0–8) | 4 (0–8) | 0 |
| 6 | 83 (0–218) | 41 (0–214) | 20 (0–80) | 211 (0–474) | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 7 | 0 (0–166) | 0 (0–87) | 0 (0–59) | 208 (0–885) | 5 (0–10) | 2 (0–8) | 0 (0–4) |
| 8 | 0 (0–86) | 0 (0–99) | 0 (0–55) | 0 (0–602) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 9 | 0 (0–90) | 0 (0–10) | 0 (0–73) | 0 (0–589) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 10 | 0 (0–51) | 0 (0–7) | 0 (0–8) | 0 (0–599) | 0 (0–10) | 2 (0–8) | 0 (0–4) |
| 11 | 0 | 0 | 0 (0–31) | 0 (0–623) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 12 | 0 | 0 | 0 | 0 (0–630) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 13 | 0 | 0 | 0 | 0 (0–631) | 0 (0–10) | 2 (0–8) | 0 (0–4) |
| 14 | 0 | 0 | 0 | 0 (0–616) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 15 | 0 | 0 | 0 | 0 (0–614) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 16 | 0 | 0 | 0 | 0 (0–559) | 0 (0–10) | 2 (0–8) | 0 (0–4) |
| 17 | 0 | 0 | 0 | 0 (0–318) | 0 (0–5) | 0 (0–8) | 0 (0–4) |
| 18 | 0 | 0 | 0 | 0 (0–282) | 0 (0–5) | 0 (0–8) | 0 (0–4) |
| 19 | 0 | 0 | 0 | 0 (0–296) | 0 (0–5) | 2 (0–8) | 0 (0–4) |
| 20 | 0 | 0 | 0 | 0 (0–317) | 0 (0–5) | 0 (0–8) | 0 (0–4) |
| 21 | 0 | 0 | 0 | 0 (0–291) | 0 (0–5) | 0 (0–8) | 0 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | depois do dia 21 | - | 0/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5 | 4–6 | 20/20 |
| Segunda zona de caça liberada | 5 | 4–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | depois do dia 21 | 19–19 | 1/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | - | 0/20 |
| Inventário cheio pela primeira vez (antes de qualquer arrumação) | 6 | 5–7 | 20/20 |
| Primeira melhoria do Baú | depois do dia 21 | - | 0/20 |
| Segunda melhoria do Baú | depois do dia 21 | - | 0/20 |
| Terceira melhoria do Baú | depois do dia 21 | - | 0/20 |

Dia em que cada seed chegou ao andar 50 (ordenado): 19 - - - - - - - - - - - - - - - - - - -

### Profissões, cenário A (pedido)

#### Nível das profissões por dia (mediana entre seeds, mín–máx)

| Dia | Mineração | Lenhador | Jardinagem | Horas min. | Horas cort. |
| --: | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 7 | 0 | 4 |
| 2 | 5 | 5 | 17 | 4 | 0 |
| 3 | 10 | 10 | 27 | 4 | 4 |
| 4 | 15 | 15 (10–15) | 32 (31–32) | 4 | 4 (0–4) |
| 5 | 19 (15–20) | 15 | 35 (35–37) | 4 (0–4) | 0 (0–4) |
| 6 | 22 (19–26) | 15 (15–20) | 39 (38–40) | 4 (0–8) | 0 (0–4) |
| 7 | 23 (19–29) | 17 (15–23) | 41 (39–42) | 4 (0–8) | 0 (0–4) |
| 8 | 26 (19–32) | 19 (15–26) | 43 (42–45) | 4 (0–8) | 0 (0–4) |
| 9 | 29 (19–32) | 19 (15–32) | 45 (43–47) | 2 (0–4) | 2 (0–8) |
| 10 | 29 (19–34) | 23 (15–32) | 47 (45–50) | 0 (0–4) | 2 (0–8) |
| 11 | 31 (19–34) | 24 (15–32) | 50 (46–52) | 0 (0–8) | 0 (0–4) |
| 12 | 31 (19–36) | 24 (15–34) | 51 (48–54) | 0 (0–8) | 0 (0–4) |
| 13 | 32 (19–36) | 28 (15–34) | 52 (49–56) | 0 (0–4) | 0 (0–8) |
| 14 | 32 (20–39) | 29 (15–34) | 54 (51–57) | 0 (0–8) | 0 (0–8) |
| 15 | 34 (26–39) | 29 (15–34) | 55 (52–59) | 0 (0–8) | 0 (0–4) |
| 16 | 34 (29–41) | 29 (15–36) | 56 (53–60) | 0 (0–4) | 0 (0–4) |
| 17 | 34 (29–43) | 30 (15–39) | 57 (54–61) | 0 (0–8) | 0 (0–4) |
| 18 | 34 (29–44) | 30 (15–41) | 58 (55–62) | 0 (0–4) | 0 (0–4) |
| 19 | 36 (29–46) | 32 (15–43) | 59 (55–63) | 0 (0–8) | 0 (0–4) |
| 20 | 37 (29–47) | 32 (15–45) | 60 (56–63) | 4 (0–4) | 2 (0–4) |
| 21 | 39 (29–49) | 32 (15–46) | 61 (56–64) | 4 (0–4) | 2 (0–4) |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 | 0 | 0 | 50 (0–50) | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (0–73) | 0 | 0 | 0 | 0 (0–50) | 0 | 10 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–86) | 0 (0–166) | 0 | 0 (0–65) | 0 (0–73) | 0 | 0 (0–10) | 0 | 0 (0–10) | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 7 | 0 | 83 (0–100) | 0 (0–98) | 0 (0–65) | 0 (0–80) | 0 | 10 (0–12) | 0 | 0 (0–12) | 0 (0–11) | 0 (0–6) | 0 (0–12) | 0 |
| 8 | 0 (0–107) | 45 (0–100) | 0 (0–110) | 0 (0–65) | 0 (0–100) | 0 | 0 (0–12) | 0 | 0 (0–12) | 3 (0–12) | 0 (0–6) | 5 (0–12) | 0 |
| 9 | 0 (0–107) | 0 | 0 (0–110) | 0 (0–107) | 0 (0–166) | 0 (0–110) | 0 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 (0–6) | 6 (0–12) | 0 (0–6) |
| 10 | 0 | 0 (0–116) | 0 | 0 (0–107) | 0 (0–166) | 0 (0–110) | 0 (0–12) | 0 | 0 (0–12) | 0 (0–6) | 0 (0–6) | 12 (0–12) | 0 (0–12) |
| 11 | 0 (0–107) | 0 (0–130) | 0 (0–107) | 0 (0–107) | 0 | 0 (0–98) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |
| 12 | 0 (0–122) | 0 (0–113) | 0 (0–122) | 0 (0–116) | 0 | 0 | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 13 | 0 | 0 (0–113) | 0 (0–113) | 0 (0–73) | 0 (0–175) | 0 | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 14 | 0 (0–107) | 0 (0–100) | 0 (0–144) | 0 (0–73) | 0 (0–100) | 0 (0–110) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 15 | 0 (0–80) | 0 (0–137) | 0 (0–113) | 0 | 0 (0–89) | 0 (0–113) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 16 | 0 | 0 (0–130) | 0 (0–137) | 0 | 0 (0–86) | 0 (0–137) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |
| 17 | 0 (0–140) | 0 (0–116) | 0 (0–160) | 0 | 0 (0–100) | 0 (0–144) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 18 | 0 | 0 | 0 (0–149) | 0 | 0 (0–86) | 0 (0–154) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 9 (0–12) |
| 19 | 0 | 0 (0–127) | 0 (0–154) | 0 | 0 (0–100) | 0 (0–160) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 20 | 0 (0–131) | 0 (0–137) | 0 (0–177) | 0 | 0 (0–86) | 0 (0–167) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 21 | 0 (0–131) | 0 | 47 (0–161) | 0 | 0 (0–100) | 0 (0–174) | 0 (0–12) | 0 (0–18) | 0 | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |

#### Dia em que cada tier / planta é liberado (nível da profissão atingido no fim do dia; mediana entre seeds)

| Profissão | Tier / planta | Nível exigido | Dia |
| --: | --- | --- | --- |
| Mineração | copper | 1 | 1 |
| Mineração | iron | 10 | 3 |
| Mineração | silver | 25 | 8 |
| Mineração | gold_ore | 50 | > dia 21 (0/20) |
| Mineração | obsidian | 70 | > dia 21 (0/20) |
| Lenhador | common_wood | 1 | 1 |
| Lenhador | oak_wood | 10 | 3 |
| Lenhador | ebony_wood | 25 | 10 (17/20) |
| Lenhador | elven_wood | 50 | > dia 21 (0/20) |
| Lenhador | ancient_wood | 70 | > dia 21 (0/20) |
| Jardinagem | common_herb | 1 | 1 |
| Jardinagem | energy_herb | 5 | 1 |
| Jardinagem | iron_thistle | 10 | 2 |
| Jardinagem | uncommon_root | 15 | 2 |
| Jardinagem | gold_blossom | 20 | 3 |
| Jardinagem | crimson_mushroom | 25 | 3 |
| Jardinagem | swift_grass | 30 | 4 |
| Jardinagem | rare_flower | 35 | 5 |
| Jardinagem | moon_lily | 45 | 9 |

#### Porta de profissão contra porta de nível do personagem, por receita de equipamento (a cadeia inteira: peças de tier menor, Fornalha, Carpintaria, Horta)

| Receita | Tier / slot | Nível do personagem | Minério (nv) | Madeira (nv) | Jardinagem | Dia: nível do personagem | Dia: profissões | Veredito |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| bronze_leather | T1 armor | 1 | copper (1) | - (0) | - | 1 | 1 | - |
| leather_boots | T1 boots | 1 | copper (1) | - (0) | 1 | 1 | 1 | - |
| leather_gloves | T1 gloves | 1 | copper (1) | - (0) | 1 | 1 | 1 | - |
| bronze_helm | T1 helmet | 1 | copper (1) | - (0) | - | 1 | 1 | - |
| copper_ring | T1 ring | 1 | copper (1) | - (0) | 1 | 1 | 1 | - |
| bronze_buckler | T1 shield | 1 | copper (1) | common_wood (1) | - | 1 | 1 | - |
| bronze_dagger | T1 weapon | 1 | copper (1) | common_wood (1) | - | 1 | 1 | - |
| bronze_hatchet | T1 weapon | 1 | copper (1) | common_wood (1) | - | 1 | 1 | - |
| iron_chainmail | T2 armor | 10 | iron (10) | - (0) | - | 1 | 3 | BLOQUEIO (+2 d) |
| iron_greaves | T2 boots | 10 | iron (10) | - (0) | 1 | 1 | 3 | BLOQUEIO (+2 d) |
| iron_gauntlets | T2 gloves | 10 | iron (10) | - (0) | 1 | 1 | 3 | BLOQUEIO (+2 d) |
| iron_helm | T2 helmet | 10 | iron (10) | - (0) | - | 1 | 3 | BLOQUEIO (+2 d) |
| silver_ring | T2 ring | 10 | iron (10) | - (0) | 10 | 1 | 3 | BLOQUEIO (+2 d) |
| iron_shield | T2 shield | 10 | iron (10) | oak_wood (10) | - | 1 | 3 | BLOQUEIO (+2 d) |
| iron_short_sword | T2 weapon | 10 | iron (10) | oak_wood (10) | - | 1 | 3 | BLOQUEIO (+2 d) |
| iron_battleaxe | T2 weapon | 10 | iron (10) | oak_wood (10) | - | 1 | 3 | BLOQUEIO (+2 d) |
| steel_plate | T3 armor | 25 | silver (25) | - (0) | - | 3 | 8 | BLOQUEIO (+5 d) |
| steel_greaves | T3 boots | 25 | silver (25) | - (0) | 1 | 3 | 8 | BLOQUEIO (+5 d) |
| steel_gauntlets | T3 gloves | 25 | silver (25) | - (0) | 1 | 3 | 8 | BLOQUEIO (+5 d) |
| steel_helm | T3 helmet | 25 | silver (25) | - (0) | - | 3 | 8 | BLOQUEIO (+5 d) |
| gold_ring | T3 ring | 25 | silver (25) | - (0) | 20 | 3 | 8 | BLOQUEIO (+5 d) |
| steel_kite_shield | T3 shield | 25 | silver (25) | ebony_wood (25) | - | 3 | 10 (17/20) | BLOQUEIO (+8.5 d) |
| steel_greatsword | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 10 (17/20) | BLOQUEIO (+8.5 d) |
| steel_greataxe | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 10 (17/20) | BLOQUEIO (+8.5 d) |
| dragon_scale_armor | T4 armor | 45 | silver (25) | - (0) | - | 11.5 | 8 | ok |
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 16.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| voidsteel_plate | T5 armor | 75 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_greaves | T5 boots | 75 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_gauntlets | T5 gloves | 75 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_helm | T5 helmet | 75 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| obsidian_ring | T5 ring | 75 | obsidian (70) | - (0) | 45 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_shield | T5 shield | 75 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_blade | T5 weapon | 75 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_cleaver | T5 weapon | 75 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_bulwark | T6 armor | 90 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_greaves | T6 boots | 90 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_gauntlets | T6 gloves | 90 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_helm | T6 helmet | 90 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_ring | T6 ring | 90 | obsidian (70) | - (0) | 45 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_shield | T6 shield | 90 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_greatblade | T6 weapon | 90 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_reaver | T6 weapon | 90 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |

Receitas marcadas: iron_chainmail, iron_greaves, iron_gauntlets, iron_helm, silver_ring, iron_shield, iron_short_sword, iron_battleaxe, steel_plate, steel_greaves, steel_gauntlets, steel_helm, gold_ring, steel_kite_shield, steel_greatsword, steel_greataxe, gilded_aegis, gilded_greaves, gilded_gauntlets, gilded_helm, ruby_ring, gilded_shield, gilded_warblade, dragon_flameblade, gilded_waraxe.

### Profissões, cenário C (jogador que também planta e usa a segunda visita do dia para minerar ou cortar)

#### Nível das profissões por dia (mediana entre seeds, mín–máx)

| Dia | Mineração | Lenhador | Jardinagem | Horas min. | Horas cort. |
| --: | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 7 | 0 | 4 |
| 2 | 5 | 5 | 17 | 4 | 0 |
| 3 | 10 | 10 | 27 | 4 | 4 |
| 4 | 15 | 15 (10–15) | 32 (31–32) | 4 | 4 (0–4) |
| 5 | 19 (15–20) | 19 (15–19) | 35 (35–37) | 4 (0–4) | 4 |
| 6 | 23 (20–23) | 19 (15–19) | 39 (38–39) | 4 | 0 |
| 7 | 26 (20–26) | 23 (19–23) | 41 (40–42) | 4 (0–4) | 4 |
| 8 | 29 (23–29) | 23 (23–26) | 43 (42–44) | 4 | 0 (0–4) |
| 9 | 29 (23–31) | 29 (26–29) | 45 (43–47) | 0 (0–4) | 4 (4–8) |
| 10 | 31 (27–34) | 29 (26–32) | 47 (45–50) | 4 (4–8) | 0 (0–4) |
| 11 | 31 (27–34) | 31 (29–34) | 50 (47–52) | 0 (0–4) | 4 |
| 12 | 34 (29–38) | 31 (29–34) | 52 (48–54) | 4 (4–8) | 0 (0–4) |
| 13 | 34 (29–40) | 34 (31–37) | 54 (50–55) | 0 (0–4) | 4 |
| 14 | 36 (32–42) | 34 (31–37) | 55 (51–57) | 4 (4–8) | 0 (0–4) |
| 15 | 37 (32–42) | 36 (34–39) | 56 (52–58) | 0 (0–4) | 4 |
| 16 | 39 (35–44) | 36 (34–40) | 58 (52–59) | 4 (4–8) | 0 (0–4) |
| 17 | 39 (35–44) | 38 (36–42) | 59 (53–60) | 0 (0–4) | 4 |
| 18 | 41 (37–46) | 38 (36–44) | 60 (53–62) | 4 | 0 (0–4) |
| 19 | 41 (37–48) | 41 (38–46) | 61 (54–63) | 0 (0–4) | 4 |
| 20 | 43 (40–49) | 41 (38–48) | 61 (55–64) | 4 | 0 (0–4) |
| 21 | 44 (40–51) | 43 (40–49) | 62 (55–65) | 0 (0–4) | 4 |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 | 0 | 0 | 50 (0–50) | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (0–73) | 0 | 0 | 0 | 65 (50–65) | 0 | 10 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–77) | 77 (0–86) | 0 | 0 | 0 | 0 | 0 (0–10) | 0 | 0 | 10 (5–10) | 0 | 0 | 0 |
| 7 | 0 (0–100) | 89 (0–100) | 0 | 0 (0–86) | 77 (0–86) | 0 | 0 (0–12) | 0 | 0 (0–12) | 5 (0–11) | 0 (0–6) | 0 (0–10) | 0 |
| 8 | 0 | 0 (0–100) | 98 (0–110) | 0 (0–89) | 0 (0–100) | 0 | 0 (0–12) | 0 | 0 (0–12) | 6 (0–6) | 0 (0–6) | 12 (0–12) | 0 |
| 9 | 0 (0–107) | 0 (0–107) | 0 | 0 (0–89) | 89 (0–100) | 98 (0–110) | 0 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 | 0 (0–12) | 0 (0–6) |
| 10 | 0 (0–107) | 0 (0–127) | 107 (0–120) | 0 (0–110) | 0 | 0 (0–98) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 (0–6) | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 11 | 0 (0–113) | 0 | 0 | 0 (0–113) | 0 | 110 (0–120) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 | 0 (0–12) | 6 (0–12) |
| 12 | 0 (0–127) | 0 (0–128) | 113 (0–137) | 0 (0–116) | 0 | 0 | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 9 (0–12) |
| 13 | 0 (0–134) | 0 (0–122) | 0 | 0 | 0 | 120 (107–137) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 14 | 0 (0–134) | 0 (0–137) | 128 (0–144) | 0 | 0 | 0 (0–137) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 15 | 0 (0–128) | 0 | 0 (0–150) | 0 (0–113) | 0 | 128 (0–147) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 16 | 0 | 0 (0–134) | 139 (128–160) | 0 | 0 | 0 (0–137) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 17 | 0 | 0 | 0 (0–167) | 0 | 0 | 137 (122–154) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 18 | 0 | 0 | 147 (134–171) | 0 | 0 | 0 (0–164) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 19 | 0 | 0 | 0 (0–158) | 0 | 0 | 145 (128–171) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |
| 20 | 0 | 0 (0–160) | 147 (0–184) | 0 | 0 | 0 (0–177) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 21 | 0 | 0 | 0 (0–187) | 0 | 0 | 154 (134–167) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |

#### Dia em que cada tier / planta é liberado (nível da profissão atingido no fim do dia; mediana entre seeds)

| Profissão | Tier / planta | Nível exigido | Dia |
| --: | --- | --- | --- |
| Mineração | copper | 1 | 1 |
| Mineração | iron | 10 | 3 |
| Mineração | silver | 25 | 7 |
| Mineração | gold_ore | 50 | > dia 21 (1/20) |
| Mineração | obsidian | 70 | > dia 21 (0/20) |
| Lenhador | common_wood | 1 | 1 |
| Lenhador | oak_wood | 10 | 3 |
| Lenhador | ebony_wood | 25 | 9 |
| Lenhador | elven_wood | 50 | > dia 21 (0/20) |
| Lenhador | ancient_wood | 70 | > dia 21 (0/20) |
| Jardinagem | common_herb | 1 | 1 |
| Jardinagem | energy_herb | 5 | 1 |
| Jardinagem | iron_thistle | 10 | 2 |
| Jardinagem | uncommon_root | 15 | 2 |
| Jardinagem | gold_blossom | 20 | 3 |
| Jardinagem | crimson_mushroom | 25 | 3 |
| Jardinagem | swift_grass | 30 | 4 |
| Jardinagem | rare_flower | 35 | 5 |
| Jardinagem | moon_lily | 45 | 9 |

#### Porta de profissão contra porta de nível do personagem, por receita de equipamento (a cadeia inteira: peças de tier menor, Fornalha, Carpintaria, Horta)

| Receita | Tier / slot | Nível do personagem | Minério (nv) | Madeira (nv) | Jardinagem | Dia: nível do personagem | Dia: profissões | Veredito |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| bronze_leather | T1 armor | 1 | copper (1) | - (0) | - | 1 | 1 | - |
| leather_boots | T1 boots | 1 | copper (1) | - (0) | 1 | 1 | 1 | - |
| leather_gloves | T1 gloves | 1 | copper (1) | - (0) | 1 | 1 | 1 | - |
| bronze_helm | T1 helmet | 1 | copper (1) | - (0) | - | 1 | 1 | - |
| copper_ring | T1 ring | 1 | copper (1) | - (0) | 1 | 1 | 1 | - |
| bronze_buckler | T1 shield | 1 | copper (1) | common_wood (1) | - | 1 | 1 | - |
| bronze_dagger | T1 weapon | 1 | copper (1) | common_wood (1) | - | 1 | 1 | - |
| bronze_hatchet | T1 weapon | 1 | copper (1) | common_wood (1) | - | 1 | 1 | - |
| iron_chainmail | T2 armor | 10 | iron (10) | - (0) | - | 1 | 3 | BLOQUEIO (+2 d) |
| iron_greaves | T2 boots | 10 | iron (10) | - (0) | 1 | 1 | 3 | BLOQUEIO (+2 d) |
| iron_gauntlets | T2 gloves | 10 | iron (10) | - (0) | 1 | 1 | 3 | BLOQUEIO (+2 d) |
| iron_helm | T2 helmet | 10 | iron (10) | - (0) | - | 1 | 3 | BLOQUEIO (+2 d) |
| silver_ring | T2 ring | 10 | iron (10) | - (0) | 10 | 1 | 3 | BLOQUEIO (+2 d) |
| iron_shield | T2 shield | 10 | iron (10) | oak_wood (10) | - | 1 | 3 | BLOQUEIO (+2 d) |
| iron_short_sword | T2 weapon | 10 | iron (10) | oak_wood (10) | - | 1 | 3 | BLOQUEIO (+2 d) |
| iron_battleaxe | T2 weapon | 10 | iron (10) | oak_wood (10) | - | 1 | 3 | BLOQUEIO (+2 d) |
| steel_plate | T3 armor | 25 | silver (25) | - (0) | - | 3 | 7 | BLOQUEIO (+4 d) |
| steel_greaves | T3 boots | 25 | silver (25) | - (0) | 1 | 3 | 7 | BLOQUEIO (+4 d) |
| steel_gauntlets | T3 gloves | 25 | silver (25) | - (0) | 1 | 3 | 7 | BLOQUEIO (+4 d) |
| steel_helm | T3 helmet | 25 | silver (25) | - (0) | - | 3 | 7 | BLOQUEIO (+4 d) |
| gold_ring | T3 ring | 25 | silver (25) | - (0) | 20 | 3 | 7 | BLOQUEIO (+4 d) |
| steel_kite_shield | T3 shield | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 | BLOQUEIO (+6 d) |
| steel_greatsword | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 | BLOQUEIO (+6 d) |
| steel_greataxe | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 | BLOQUEIO (+6 d) |
| dragon_scale_armor | T4 armor | 45 | silver (25) | - (0) | - | 13 | 7 | ok |
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | > dia 21 (6/20) | > dia 21 (1/20) | ok |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | > dia 21 (6/20) | > dia 21 (1/20) | ok |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | > dia 21 (6/20) | > dia 21 (1/20) | ok |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | > dia 21 (6/20) | > dia 21 (1/20) | ok |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | > dia 21 (6/20) | > dia 21 (1/20) | ok |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | > dia 21 (6/20) | > dia 21 (0/20) | ok |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | > dia 21 (6/20) | > dia 21 (0/20) | ok |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | > dia 21 (6/20) | > dia 21 (0/20) | ok |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | > dia 21 (6/20) | > dia 21 (0/20) | ok |
| voidsteel_plate | T5 armor | 75 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_greaves | T5 boots | 75 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_gauntlets | T5 gloves | 75 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_helm | T5 helmet | 75 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| obsidian_ring | T5 ring | 75 | obsidian (70) | - (0) | 45 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_shield | T5 shield | 75 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_blade | T5 weapon | 75 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| voidsteel_cleaver | T5 weapon | 75 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_bulwark | T6 armor | 90 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_greaves | T6 boots | 90 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_gauntlets | T6 gloves | 90 | obsidian (70) | - (0) | 1 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_helm | T6 helmet | 90 | obsidian (70) | - (0) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_ring | T6 ring | 90 | obsidian (70) | - (0) | 45 | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_shield | T6 shield | 90 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_greatblade | T6 weapon | 90 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |
| abyssal_reaver | T6 weapon | 90 | obsidian (70) | ancient_wood (70) | - | > dia 21 (0/20) | > dia 21 (0/20) | ok |

Receitas marcadas: iron_chainmail, iron_greaves, iron_gauntlets, iron_helm, silver_ring, iron_shield, iron_short_sword, iron_battleaxe, steel_plate, steel_greaves, steel_gauntlets, steel_helm, gold_ring, steel_kite_shield, steel_greatsword, steel_greataxe.

### Linha do tempo por slot: dia em que a primeira peça de cada tier aparece (cenário A, mediana)

| Slot | Tier 1 | Tier 2 | Tier 3 |
| --: | --- | --- | --- |
| weapon | 2 | 4 | 10 (18/20) |
| armor | 2 | 5 | 10 (19/20) |
| gloves | 2 | 5 | 10 (19/20) |
| boots | 3 | 6 | 14 (16/20) |
| ring | 3 | 6 | 16 (11/20) |
| helmet | 2 | 6 | 12 (19/20) |
| shield | 3 | 6 | 11.5 |

### Controle dos tônicos: cenário A sem tônicos contra cenário A (a mesma seed)

|  | Chefe 25 vencido (dia por seed) | Andar 50 alcançado (dia por seed) | CP no dia 14 (mediana) | Nível no dia 14 |
| --: | --- | --- | --- | --- |
| Com tônicos (A) | 4 4 4 4 4 5 5 5 5 5 5 5 5 5 6 6 6 6 6 6 | 10 10 11 12 12 13 13 13 13 14 14 15 16 17 17 18 18 21 - - | 1 189 | 48 |
| Sem tônicos | 4 4 4 4 4 5 5 5 5 5 5 5 5 5 6 6 6 6 6 6 | 10 11 11 13 14 15 15 15 16 16 17 17 18 18 18 18 19 19 19 21 | 1 106 | 48 |

| Dia em que a porta abre (mediana) | Com tônicos (A) | Sem tônicos |
| --: | --- | --- |
| iron (Mineração 10) | 3 | 3 |
| silver (Mineração 25) | 8 | 8 (19/20) |
| gold_ore (Mineração 50) | > dia 21 (0/20) | > dia 21 (0/20) |
| oak_wood (Lenhador 10) | 3 | 3 |
| ebony_wood (Lenhador 25) | 10 (17/20) | 10 (17/20) |
| elven_wood (Lenhador 50) | > dia 21 (0/20) | > dia 21 (0/20) |

### Diagnóstico do chefe do andar 25

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário A)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 2 | 119 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 5 (4–6) | 491 (449–572) | arma T2 / armadura T2, nível 34 (29–37) | 20/20 seeds |

#### Diagnóstico: chefe do andar 25 (CP recomendado pelo jogo: 572; andar 24: 115) contra heróis montados à mão, sem poções, de HP cheio

| Equipamento | Nível | CP | Sobe do andar 1 ao 24 de uma vez | Limpa o andar 24 | Vence o chefe do 25 |
| --: | --- | --- | --- | --- | --- |
| Roupa de trapos + Clava | 30 | 204 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 60 | 371 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 100 | 620 | 20/20 | 20/20 | 20/20 |
| Tier 1 (adaga + couro) +0 | 40 | 393 | 20/20 | 20/20 | 0/20 |
| Tier 1 +8 | 40 | 532 | 20/20 | 20/20 | 19/20 |
| Tier 1 +8 | 60 | 694 | 20/20 | 20/20 | 20/20 |
| Tier 2 (espada + cota) +0 | 40 | 536 | 20/20 | 20/20 | 11/20 |
| Tier 2 +4 | 40 | 664 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 40 | 803 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 60 | 997 | 20/20 | 20/20 | 20/20 |
| Tier 3 (montante + placas) +0 | 40 | 825 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 40 | 1 326 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 60 | 1 581 | 20/20 | 20/20 | 20/20 |
| Tier 4 (lâmina dourada + égide) +8 | 100 | 2 712 | 20/20 | 20/20 | 20/20 |

### Diagnóstico da curva de inimigos

#### Curva de inimigos em volta dos chefes: HP × dano por golpe

| Chefe (andar) | Andar anterior (N−1) | Chefe (N) | Andar seguinte (N+1) | (N+1) / (N−1) | Chefe / (N−1) |
| --: | --- | --- | --- | --- | --- |
| 25 | 200 × 23 = 4 600 | 760 × 171 = 129 960 | 1 273 × 160 = 203 680 | 44.28 | 28.3 |
| 50 | 2 198 × 270 = 593 460 | 5 266 × 255 = 1 342 830 | 2 652 × 343 = 909 636 | 1.53 | 2.3 |
| 75 | 3 728 × 478 = 1 781 984 | 9 084 × 436 = 3 960 624 | 8 759 × 441 = 3 862 719 | 2.17 | 2.2 |
| 100 | 11 226 × 563 = 6 320 238 | 14 279 × 682 = 9 738 278 | - | - | 1.5 |
