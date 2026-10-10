# Baseline de balanceamento: as primeiras horas de um jogador novo (depois da rodada 4: queimadura, reflexo e relíquias funcionando)

- **Data:** 2026-10-10
- **Commit medido:** o commit `feat: burn, reflect and relic effects now work in combat` (rodada 4), na branch `claude/project-thread-ppdm57`. O baseline da rodada 3 está no histórico do git; as comparações estão em `docs/BALANCE_CHANGES.md` (seção 21).
- **Como reproduzir:** `npm run sim` (cerca de 15 s para 20 seeds x 21 dias x 2 cenários). Código em `scripts/sim/` (`driver.ts`, `player.ts`, `progression.sim.ts`, `ladder.ts`). As medições de itens ficam em `npm run sim:items` (`docs/ITEM_BALANCE_AUDIT.md`).
- **Quem é o jogador simulado:** conta nova, sem Battle Pass, 2 visitas por dia (09h e 21h, com variação de até 90 min por seed), usa todas as 10 sessões grátis de Masmorra por dia, caça o resto do tempo e só minera/corta quando o próximo upgrade pede. **Desde a rodada 3 ele também forja capacete, luvas, botas e anel** (ver a política), e o jogo está equilibrado em torno desse jogador.

## Resumo para quem tem pressa

1. **Metas da R5 mantidas depois da rodada 4** (queimadura, reflexo, regeneração e velocidade de ataque agora funcionam no combate): primeira sessão termina no andar 8; primeira peça forjada no dia 2; nível 13 / 29 / 49 nos dias 1 / 3 / 14; o chefe do andar 25 cai no dia 5; nenhuma seed chega ao andar 50 antes do dia 10; sem queda de dificuldade depois de chefe (menor razão 1,77).
2. **O que foi preciso mexer:** só `boss50HpMult` / `boss50DmgMult` 0,82 -> 0,84 (sem isso a primeira seed derrubava o chefe 50 no dia 11 em vez do 16 da rodada 3) e a tabela de CP recomendada, regerada com os efeitos. Orcs, feiticeiros, minotauros e o resto não mudaram. O limite do dia 3 passou a 20-29 (o valor 29 do baseline já era o resultado desde a rodada 3).
3. **Relíquia:** a simulação agora forja e equipa a relíquia de maior CP (mediana no dia 10, depois do conjunto completo do tier 3). Os números de cada efeito e as medições ficam em `BALANCE_CHANGES.md` (seção 21) e `ITEM_BALANCE_AUDIT.md` (seção G).
4. O resto do documento é o relatório completo da simulação.

## Política da simulação e o que ela não faz

Resumo da política (a versão completa e atual está no cabeçalho de `scripts/sim/progression.sim.ts`):

- **Visitas:** 2 por dia. A cada visita o jogo é "recarregado" (`normalizeSave`, que também reinicia missões diárias e sessões de Masmorra), coleta o que estava rodando, resgata missões, gasta, faz sessões, aceita pedido e inicia uma atividade de fundo.
- **Masmorra:** usa todas as sessões grátis do dia (`T.dungeon.freeSessionsPerDay` = 10: 5 em cada visita). Luta até morrer; só se retira (a) num chefe de bioma ainda não resgatado, para garantir o marco, (b) com HP <= 20% depois de um andar, (c) no andar 100. Conserta equipamento com durabilidade < 40. Mantém até 5 poções pequenas, compradas só com ouro que sobra depois de reservar o preço da próxima forja (antes podiam consumir metade da reserva), e não compra enquanto as duas últimas sessões morreram sem limpar andar.
- **Caça:** atividade padrão. Zona de maior XP liberada pelo andar, profundidade mais funda que o CP permite (regra do CP recomendado da própria UI).
- **Minério/madeira:** só quando a próxima forja ou refino precisa. Atividades que ainda têm falta se revezam.
- **Equipamento:** forja a próxima peça dos 6 slots (arma > armadura > luvas > capacete > botas > anel; o tier mais baixo primeiro, a prioridade desempata), passando pelas estações (fornalha, curtume, carpintaria, alquimia); cada peça nova consome 1 do tier anterior do mesmo slot (arma e armadura continuam com "2 de"); equipa o que dá mais `computeCP` em cada slot; **só arma e armadura são refinadas** (com o ouro que não está reservado para a próxima forja); compra gemas com estilhaços quando a receita pede; encaixa gemas sobressalentes na arma e na armadura. A Bolsa de Caça nível 2 é comprada assim que possível (a Bolsa do tier 1 tem 3 espaços). **Rodada 4:** depois do conjunto completo do tier 3 (todos os slots com tier >= 3) forja uma relíquia (a de maior `computeCP` entre as três, uma só) e equipa a que dá mais CP.
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

### Metas de balanceamento (T1 a T8)

| Meta | Critério | Cenário A (pedido) | Cenário B (sensibilidade) | Resultado |
| --- | --- | --- | --- | --- |
| T1 | Caça de 4 h com a Bolsa do tier 1 não perde nenhum tipo de material | 20/20 sessões sem perda (20/20 com os 3 tipos), 0 unidades perdidas | (mesma Bolsa) | ok |
| T2 | Primeira sessão da conta nova termina no andar ≥ 8; checkpoint do andar 10 no dia 1 | andar 8; checkpoint 10 no dia 1 | andar 8; dia 1 | ok |
| T3 | Primeira peça forjada no dia 1 ou 2 | dia 2 | dia 2 | ok |
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–29 / 45–60) | 13 / 29 (27–34) / 49 (46–51) | 13 / 31 (27–34) / 50 (48–50) | ok |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 5; vitória ao chegar: 0% | dia 4.5; vitória ao chegar: 0% | ok |
| T6 | Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16 | chegada: primeira seed no dia 10, mediana 14; chefe 50: primeira seed no dia 14, mediana depois do dia 21, 2/20 em 21 dias | chegada: primeira seed no dia 10, mediana 13; chefe 50: primeira seed no dia 10, mediana depois do dia 21, 7/20 em 21 dias | chegada ok; chefe FORA DA META |
| T7 | Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75 | menor razão (N+1)/(N−1): 1.77 | - | ok |
| T8 | Derrota mantém 75% do ouro da sessão | 75% | - | ok |

#### B contra A: o Cenário B não pode ser mais de ~1,5 dia mais rápido que o A em nenhum marco

| Marco | Dia no A (mediana de quem chegou; seeds que chegaram) | Dia no B | A − B (dias) | Resultado |
| --: | --- | --- | --- | --- |
| Primeira peça forjada | 2 (20/20) | 2 (20/20) | 0 | ok |
| Primeiro refino | 3 (20/20) | 3 (20/20) | 0 | ok |
| Checkpoint do andar 10 | 1 (20/20) | 1 (20/20) | 0 | ok |
| Chefe do andar 25 | 5 (20/20) | 4.5 (20/20) | 0.5 | ok |
| Zona de caça 2 | 5 (20/20) | 4.5 (20/20) | 0.5 | ok |
| Chefe do andar 50 | 14 (2/20) | 19 (7/20) | -5 | ok |

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 119 | 24 | 0 | 0 |
| 2 | 23 (23–24) | 214 (211–284) | 25 | 1 | 0 (0–2) |
| 3 | 29 (27–34) | 333 (311–410) | 25 | 1 (1–2) | 1 (1–2) |
| 4 | 31 (29–38) | 386 (325–597) | 25 (25–27) | 1 (1–2) | 1 (1–2) |
| 5 | 36 (33–40) | 609 (409–717) | 28 (25–30) | 2 | 2 (1–2) |
| 6 | 38 (35–42) | 704 (617–760) | 30 (27–32) | 2 | 2 (1–2) |
| 7 | 40 (38–44) | 733 (658–971) | 30 (29–40) | 2 (2–3) | 2 (1–3) |
| 8 | 43 (39–46) | 811 (672–1 045) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 9 | 45 (40–47) | 873 (722–1 174) | 36 (30–49) | 2 (2–3) | 2 (1–3) |
| 10 | 47 (43–48) | 952 (731–1 198) | 40 (30–50) | 2 (2–3) | 2 (1–3) |
| 11 | 47 (45–49) | 989 (861–1 294) | 40 (30–50) | 2 (2–3) | 2 (2–3) |
| 12 | 48 (46–50) | 1 094 (906–1 294) | 40 (35–50) | 3 (2–3) | 3 (2–3) |
| 13 | 49 (46–50) | 1 185 (906–1 353) | 48 (40–50) | 3 (2–3) | 3 (2–3) |
| 14 | 49 (46–51) | 1 196 (915–1 499) | 50 (40–55) | 3 (2–3) | 3 (2–3) |
| 15 | 49 (47–52) | 1 202 (927–1 593) | 50 (40–59) | 3 (2–3) | 3 (2–3) |
| 16 | 50 (47–52) | 1 204 (927–1 593) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 17 | 50 (47–53) | 1 204 (936–1 593) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 18 | 50 (47–53) | 1 211 (936–1 593) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 19 | 50 (47–54) | 1 211 (948–1 607) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 20 | 50 (47–54) | 1 219 (948–1 607) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 21 | 50 (47–54) | 1 225 (948–1 607) | 50 (40–60) | 3 (2–3) | 3 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 7 119 (7 119–8 469) | 129 | 6 990 | 0 (0–1 350) |
| 3 | 11 822 (5 600–31 309) | 0 | 9 087 (0–9 099) | 6 100 (1 730–22 213) |
| 4 | 6 238 (0–23 054) | 0 (0–767) | 0 (0–9 097) | 5 583 (0–23 054) |
| 5 | 19 080 (6 977–31 096) | 632 (0–1 190) | 9 098 (0–18 850) | 6 393 (0–15 282) |
| 6 | 18 983 (558–37 657) | 528 (0–1 190) | 9 097 (0–37 657) | 4 870 (0–23 240) |
| 7 | 24 854 (2 550–45 179) | 0 (0–1 805) | 18 826 (0–37 679) | 11 340 (0–22 586) |
| 8 | 26 109 (845–60 380) | 0 (0–1 805) | 18 829 (0–37 681) | 12 868 (0–22 960) |
| 9 | 40 777 (10 827–61 470) | 535 (0–1 901) | 37 671 (0–37 688) | 10 344 (0–23 053) |
| 10 | 46 136 (9 010–61 350) | 429 (0–1 805) | 37 664 (0–37 691) | 12 087 (0–23 613) |
| 11 | 22 867 (7 950–50 515) | 0 (0–2 105) | 9 420 (0–37 685) | 11 302 (0–23 240) |
| 12 | 21 747 (0–59 342) | 0 (0–1 805) | 9 414 (0–37 689) | 12 126 (0–23 427) |
| 13 | 27 390 (1 350–50 633) | 0 (0–2 105) | 18 830 (0–37 691) | 10 288 (0–22 680) |
| 14 | 22 456 (9 180–50 767) | 0 (0–2 105) | 0 (0–37 685) | 11 772 (0–23 333) |
| 15 | 13 784 (675–43 132) | 0 (0–1 764) | 0 (0–37 692) | 5 143 (0–22 120) |
| 16 | 11 246 (0–40 316) | 0 (0–1 901) | 0 (0–37 691) | 4 590 (0–22 026) |
| 17 | 6 100 (0–38 061) | 0 (0–740) | 0 (0–37 680) | 1 815 (0–21 373) |
| 18 | 9 265 (0–39 019) | 0 (0–960) | 0 (0–37 690) | 1 463 (0–23 053) |
| 19 | 7 645 (0–42 098) | 0 (0–405) | 0 (0–37 686) | 4 505 (0–22 213) |
| 20 | 4 615 (0–37 679) | 0 | 0 (0–37 679) | 2 813 (0–15 197) |
| 21 | 1 815 (0–37 671) | 0 | 0 (0–37 671) | 675 (0–21 840) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 5 (5–6) | 100% |
| 3 | 0 | 7 (6–8) | 100% |
| 4 | 0 (0–0.2) | 8 (6–10) | 99% |
| 5 | 0.3 (0–0.5) | 10 (8–14) | 95% |
| 6 | 0.2 (0–0.5) | 11 (7–14) | 97% |
| 7 | 0 (0–1) | 10 (7–16) | 100% |
| 8 | 0 (0–1) | 10 (7–16) | 100% |
| 9 | 0.3 (0–0.9) | 11 (7–15) | 100% |
| 10 | 0.3 (0–1) | 11 (7–18) | 100% |
| 11 | 0 (0–1) | 10 (9–17) | 100% |
| 12 | 0 (0–1) | 10 (9–18) | 100% |
| 13 | 0 (0–1) | 12 (9–17) | 100% |
| 14 | 0 (0–1) | 12 (9–18) | 99% |
| 15 | 0 (0–0.8) | 12 (9–15) | 100% |
| 16 | 0 (0–0.9) | 12 (6–16) | 100% |
| 17 | 0 (0–0.3) | 12 (5–15) | 100% |
| 18 | 0 (0–0.5) | 12 (5–14) | 100% |
| 19 | 0 (0–0.2) | 12 (5–14) | 100% |
| 20 | 0 | 12 (5–14) | 100% |
| 21 | 0 | 12 (5–14) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 417 (415–584) | 6 (4–7) | 0 | 11 | 0 (0–47) | 400 (400–520) | 405 (405–665) | 125 (5–139) |
| 3 | 422 (293–895) | 0 | 0 | 11 (0–11) | 196 (62–664) | 220 | 435 (180–685) | 120 (4–371) |
| 4 | 325 (100–3 554) | 0 (0–58) | 0 (0–2 000) | 0 (0–11) | 179 (0–690) | 120 (100–1 300) | 65 (0–3 668) | 317 (29–2 771) |
| 5 | 3 542 (166–3 812) | 50 (0–98) | 2 000 (0–2 000) | 11 (0–25) | 205 (0–464) | 1 300 (100–1 300) | 1 564 (0–3 878) | 307 (24–2 667) |
| 6 | 520 (24–4 087) | 42 (0–90) | 0 (0–2 000) | 11 (0–48) | 155 (0–695) | 260 (0–1 300) | 585 (0–3 720) | 563 (34–1 662) |
| 7 | 565 (48–926) | 0 (0–142) | 0 | 24 (0–48) | 355 (0–706) | 120 (0–220) | 65 (0–1 975) | 795 (34–1 936) |
| 8 | 643 (24–1 067) | 0 (0–126) | 0 | 24 (0–48) | 409 (0–718) | 220 (0–300) | 1 163 (0–2 220) | 293 (70–1 682) |
| 9 | 616 (24–1 048) | 42 (0–128) | 0 | 48 (0–48) | 331 (0–720) | 220 (0–220) | 615 (0–1 975) | 349 (71–1 525) |
| 10 | 642 (48–1 050) | 34 (0–125) | 0 | 48 (0–48) | 378 (0–738) | 220 (0–220) | 650 (0–1 806) | 440 (20–1 348) |
| 11 | 539 (24–947) | 0 (0–159) | 0 | 12 (0–48) | 355 (0–727) | 120 (0–300) | 0 (0–2 211) | 769 (6–1 293) |
| 12 | 650 (0–953) | 0 (0–146) | 0 | 12 (0–48) | 384 (0–733) | 210 (0–300) | 300 (0–1 566) | 599 (32–1 504) |
| 13 | 507 (24–1 142) | 0 (0–164) | 0 | 24 (0–48) | 331 (0–709) | 120 (0–300) | 0 (0–2 236) | 849 (19–1 552) |
| 14 | 644 (48–6 306) | 0 (0–171) | 0 (0–5 000) | 0 (0–48) | 374 (0–730) | 120 (0–700) | 0 (0–1 395) | 1 184 (172–7 254) |
| 15 | 333 (48–812) | 0 (0–150) | 0 | 0 (0–48) | 173 (0–692) | 120 (0–300) | 0 (0–1 720) | 1 391 (112–6 194) |
| 16 | 272 (0–982) | 0 (0–147) | 0 | 0 (0–48) | 151 (0–688) | 120 (0–300) | 0 (0–1 000) | 1 663 (336–6 654) |
| 17 | 187 (0–817) | 0 (0–55) | 0 | 0 (0–48) | 67 (0–697) | 120 (0–200) | 0 (0–240) | 1 860 (518–7 471) |
| 18 | 185 (0–980) | 0 (0–60) | 0 | 0 (0–48) | 53 (0–720) | 120 (0–200) | 0 (0–450) | 2 136 (673–8 261) |
| 19 | 290 (0–921) | 0 (0–27) | 0 | 0 (0–48) | 148 (0–694) | 120 (0–220) | 0 (0–300) | 2 473 (673–8 764) |
| 20 | 221 (0–603) | 0 | 0 | 0 (0–48) | 101 (0–483) | 120 (0–120) | 0 (0–300) | 2 639 (791–9 228) |
| 21 | 109 (0–803) | 0 | 0 | 0 (0–48) | 25 (0–683) | 60 (0–120) | 0 | 2 770 (791–9 450) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 1 155 · estações 2 458 · forja 2 903 · bolsa de caça 300 · refino 3 150 · reparo 0 · mochila 0

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 190 (174–214) | 56 (45–67) | 4 (1–10) | 0 | 4 | 0 | 4 |
| 3 | 161 (70–194) | 104 (0–131) | 13 (0–21) | 0 | 4 (0–4) | 4 | 0 (0–4) |
| 4 | 93 (85–227) | 0 (0–178) | 0 (0–32) | 0 | 0 (0–4) | 4 (0–4) | 4 (0–4) |
| 5 | 215 (100–349) | 145 (0–374) | 19 (0–64) | 0 | 4 (0–8) | 0 (0–4) | 4 (0–4) |
| 6 | 225 (130–324) | 148 (0–278) | 25 (0–56) | 0 | 4 (0–10) | 4 (0–8) | 0 (0–4) |
| 7 | 217 (89–341) | 134 (0–324) | 26 (0–89) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 8 | 161 (89–337) | 226 (0–328) | 28 (0–86) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 9 | 299 (0–387) | 310 (98–421) | 68 (0–92) | 0 | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 10 | 325 (142–440) | 317 (0–481) | 66 (0–98) | 0 | 10 (0–10) | 0 (0–4) | 0 (0–8) |
| 11 | 191 (0–434) | 170 (0–412) | 17 (0–107) | 0 | 2.5 (0–10) | 0 (0–4) | 4 (0–8) |
| 12 | 167 (0–438) | 193 (0–467) | 17 (0–108) | 0 | 2.5 (0–10) | 0 (0–4) | 4 (0–8) |
| 13 | 188 (0–492) | 259 (0–452) | 38 (0–109) | 0 | 5 (0–10) | 2 (0–4) | 2 (0–8) |
| 14 | 45 (0–492) | 226 (104–437) | 0 (0–105) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 15 | 0 (0–437) | 231 (208–427) | 0 (0–102) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 16 | 0 (0–425) | 235 (104–439) | 0 (0–97) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 17 | 0 (0–447) | 246 (110–438) | 0 (0–104) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 18 | 0 (0–426) | 253 (214–427) | 0 (0–103) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 19 | 0 (0–436) | 259 (208–425) | 0 (0–101) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 20 | 0 (0–472) | 265 (220–418) | 0 (0–93) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 21 | 0 (0–419) | 270 (232–453) | 0 (0–97) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | 10 | 9–15 | 18/20 |
| Primeiro refino bem-sucedido | 3 | 3–4 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5 | 4–6 | 20/20 |
| Segunda zona de caça liberada | 5 | 4–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 14 | 10–19 | 19/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 14–14 | 2/20 |

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 57 | 8 / 8 / 8 / 8 / 8 | 8×20 |
| 2 | 81 | 27 | 10 / 10 / 10 / 10 / 10 | 10×20 |
| 3 | 84 | 20 | 11 / 11 / 11 / 11 / 11 | 11×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Cenário B (sensibilidade): igual ao A, mais uma visita curta (até 15 min, parando a caça quando a prévia da bolsa ainda guarda os farrapos) logo depois da primeira, enquanto faltarem itens comuns de caça

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 119 | 24 | 0 | 0 |
| 2 | 24 (23–24) | 255 (211–304) | 25 | 1 (1–2) | 1 (0–2) |
| 3 | 31 (27–34) | 356 (312–513) | 25 (25–26) | 1 (1–2) | 1 (1–2) |
| 4 | 32 (30–38) | 495 (335–686) | 26 (25–30) | 2 (1–2) | 1 (1–2) |
| 5 | 35 (32–39) | 636 (447–885) | 30 (25–35) | 2 (2–3) | 2 (1–2) |
| 6 | 38 (33–41) | 679 (629–946) | 30 (29–40) | 2 (2–3) | 2 (1–2) |
| 7 | 40 (35–43) | 737 (635–999) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 8 | 43 (35–46) | 800 (635–1 088) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 9 | 45 (39–48) | 851 (746–1 155) | 37 (30–44) | 2 (2–3) | 2 (1–3) |
| 10 | 46 (43–48) | 963 (768–1 482) | 40 (30–55) | 3 (2–3) | 3 (1–3) |
| 11 | 47 (45–49) | 1 024 (850–1 482) | 40 (30–59) | 3 (2–3) | 3 (1–3) |
| 12 | 48 (47–49) | 1 171 (871–1 482) | 44 (40–60) | 3 (2–3) | 3 (1–3) |
| 13 | 49 (47–50) | 1 184 (884–1 496) | 50 (40–60) | 3 (2–3) | 3 (1–3) |
| 14 | 50 (48–50) | 1 195 (896–1 512) | 50 (40–60) | 3 (2–3) | 3 (1–3) |
| 15 | 50 (48–51) | 1 218 (907–1 512) | 50 (40–60) | 3 (2–3) | 3 (1–3) |
| 16 | 50 (48–52) | 1 236 (907–1 512) | 50 (40–60) | 3 (2–3) | 3 (1–3) |
| 17 | 50 (48–52) | 1 236 (1 049–1 512) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 18 | 50 (48–53) | 1 244 (1 049–1 512) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 19 | 51 (48–53) | 1 248 (1 059–1 527) | 50 (41–60) | 3 (2–3) | 3 (2–3) |
| 20 | 51 (48–54) | 1 269 (1 059–1 527) | 50 (48–60) | 3 (2–3) | 3 (2–3) |
| 21 | 51 (48–54) | 1 269 (1 072–1 532) | 50 (50–63) | 3 (2–3) | 3 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 7 947 (7 553–8 906) | 129 | 7 427 (7 424–8 476) | 195 (0–1 350) |
| 3 | 15 197 (5 525–31 309) | 0 (0–632) | 9 086 (0–9 099) | 6 190 (1 740–23 520) |
| 4 | 6 389 (632–23 054) | 137 (0–1 190) | 0 (0–9 097) | 5 983 (0–23 054) |
| 5 | 11 998 (414–27 599) | 558 (0–1 190) | 937 (0–18 828) | 7 593 (0–14 857) |
| 6 | 16 202 (558–33 091) | 285 (0–1 190) | 924 (0–18 844) | 5 258 (0–21 187) |
| 7 | 20 771 (156–59 430) | 0 (0–806) | 18 828 (0–37 688) | 2 663 (0–23 333) |
| 8 | 39 191 (0–59 705) | 0 (0–1 805) | 37 672 (0–38 595) | 11 913 (0–22 960) |
| 9 | 40 001 (345–54 592) | 86 (0–1 805) | 37 679 (0–38 606) | 3 640 (0–16 402) |
| 10 | 41 595 (11 140–61 396) | 452 (0–2 930) | 37 672 (0–38 611) | 6 275 (0–23 707) |
| 11 | 37 919 (6 610–55 628) | 429 (0–2 105) | 37 657 (0–38 618) | 6 095 (0–22 026) |
| 12 | 28 918 (5 940–52 395) | 0 (0–2 812) | 18 843 (0–38 612) | 5 893 (0–23 893) |
| 13 | 23 915 (926–48 692) | 0 (0–2 105) | 9 415 (0–38 629) | 6 153 (0–23 800) |
| 14 | 23 742 (693–50 767) | 0 (0–2 105) | 18 840 (0–38 631) | 7 305 (0–23 800) |
| 15 | 16 155 (0–43 612) | 0 (0–405) | 0 (0–38 606) | 5 355 (0–22 866) |
| 16 | 19 640 (0–43 975) | 0 (0–2 105) | 0 (0–38 615) | 1 260 (0–22 120) |
| 17 | 18 393 (1 326–48 220) | 0 (0–1 548) | 0 (0–38 618) | 5 860 (0–24 360) |
| 18 | 12 445 (0–39 027) | 0 (0–1 307) | 0 (0–37 687) | 1 388 (0–16 477) |
| 19 | 12 562 (0–38 469) | 0 (0–798) | 0 (0–37 686) | 865 (0–22 214) |
| 20 | 11 006 (0–37 678) | 0 (0–1 346) | 0 (0–37 678) | 390 (0–21 840) |
| 21 | 6 073 (0–57 312) | 0 (0–2 240) | 0 (0–55 072) | 1 583 (0–14 755) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 6 (5–7) | 100% |
| 3 | 0 (0–0.1) | 7 (6–9) | 99% |
| 4 | 0.1 (0–0.5) | 8 (7–12) | 96% |
| 5 | 0.3 (0–0.5) | 11 (8–13) | 97% |
| 6 | 0.2 (0–0.5) | 10 (7–13) | 99% |
| 7 | 0 (0–0.4) | 9 (7–13) | 100% |
| 8 | 0 (0–1) | 10 (7–17) | 100% |
| 9 | 0.1 (0–1) | 10 (7–16) | 100% |
| 10 | 0.2 (0–1.2) | 12 (7–17) | 100% |
| 11 | 0.3 (0–1) | 12 (7–17) | 100% |
| 12 | 0 (0–1.1) | 12 (7–20) | 100% |
| 13 | 0 (0–1) | 11 (6–17) | 100% |
| 14 | 0 (0–1) | 12 (6–17) | 100% |
| 15 | 0 (0–0.2) | 12 (6–14) | 100% |
| 16 | 0 (0–1) | 12 (6–18) | 100% |
| 17 | 0 (0–0.8) | 12 (6–17) | 100% |
| 18 | 0 (0–0.6) | 12 (6–17) | 100% |
| 19 | 0 (0–0.4) | 12 (6–15) | 100% |
| 20 | 0 (0–0.7) | 12 (6–16) | 100% |
| 21 | 0 (0–0.8) | 12 (7–15) | 99% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 484 (415–584) | 6 (4–7) | 0 | 11 | 8 (0–47) | 460 (400–520) | 565 (405–665) | 91 (1–139) |
| 3 | 504 (293–3 527) | 0 (0–42) | 0 (0–2 000) | 11 (0–11) | 199 (62–703) | 220 (220–1 300) | 435 (180–1 165) | 310 (17–2 501) |
| 4 | 655 (230–3 667) | 11 (0–85) | 0 (0–2 000) | 0 (0–11) | 192 (0–690) | 260 (120–1 300) | 1 063 (0–3 768) | 326 (179–2 486) |
| 5 | 573 (134–3 812) | 45 (0–89) | 0 (0–2 000) | 1 (0–24) | 241 (0–451) | 220 (100–1 300) | 673 (0–3 788) | 410 (44–2 667) |
| 6 | 490 (24–3 699) | 27 (0–87) | 0 (0–2 000) | 1 (0–24) | 169 (0–663) | 200 (0–1 300) | 243 (0–3 800) | 389 (51–1 639) |
| 7 | 315 (11–973) | 0 (0–69) | 0 | 24 (0–48) | 96 (0–729) | 120 (0–220) | 450 (0–1 915) | 313 (0–1 632) |
| 8 | 597 (0–1 068) | 0 (0–141) | 0 | 48 (0–49) | 376 (0–718) | 170 (0–300) | 453 (0–1 370) | 317 (59–1 444) |
| 9 | 348 (48–730) | 5 (0–128) | 0 | 48 (0–49) | 124 (0–521) | 120 (0–220) | 0 (0–1 746) | 389 (89–1 591) |
| 10 | 559 (48–6 625) | 38 (0–264) | 0 (0–5 000) | 48 (0–49) | 211 (0–741) | 220 (0–800) | 573 (0–2 340) | 380 (55–5 118) |
| 11 | 527 (49–984) | 38 (0–143) | 0 | 48 (0–49) | 205 (0–703) | 200 (0–300) | 545 (0–1 666) | 593 (1–5 552) |
| 12 | 413 (48–6 485) | 0 (0–258) | 0 (0–5 000) | 24 (0–49) | 203 (0–746) | 120 (0–800) | 30 (0–2 225) | 416 (9–5 887) |
| 13 | 373 (24–988) | 0 (0–156) | 0 | 12 (0–49) | 207 (0–743) | 120 (0–300) | 0 (0–1 746) | 970 (14–6 722) |
| 14 | 480 (48–864) | 0 (0–157) | 0 | 24 (0–49) | 242 (0–744) | 120 (0–220) | 0 (0–1 370) | 1 349 (144–7 569) |
| 15 | 322 (0–834) | 0 (0–31) | 0 | 0 (0–49) | 178 (0–714) | 120 (0–220) | 0 (0–1 420) | 1 598 (187–8 135) |
| 16 | 271 (0–812) | 0 (0–154) | 0 | 0 (0–49) | 50 (0–692) | 120 (0–220) | 0 (0–1 100) | 1 609 (108–8 625) |
| 17 | 334 (137–6 475) | 0 (0–112) | 0 (0–5 000) | 0 (0–49) | 202 (0–761) | 120 (100–700) | 0 (0–540) | 1 671 (413–8 948) |
| 18 | 215 (0–664) | 0 (0–84) | 0 | 0 (0–48) | 50 (0–544) | 120 (0–300) | 0 (0–420) | 2 005 (437–9 214) |
| 19 | 189 (0–5 806) | 0 (0–90) | 0 (0–5 000) | 0 (0–48) | 32 (0–724) | 120 (0–700) | 0 (0–390) | 2 365 (597–10 058) |
| 20 | 174 (0–5 979) | 0 (0–161) | 0 (0–5 000) | 0 (0–48) | 17 (0–712) | 120 (0–800) | 0 (0–820) | 2 540 (703–10 890) |
| 21 | 306 (0–5 982) | 0 (0–231) | 0 (0–5 000) | 0 (0–71) | 61 (0–469) | 120 (0–800) | 0 (0–1 775) | 3 832 (917–10 969) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 1 305 · estações 2 022 · forja 2 420 · bolsa de caça 300 · refino 3 200 · reparo 0

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 237 (184–282) | 82 (74–95) | 8 (2–12) | 0 | 4.3 | 0 | 4 |
| 3 | 156 (70–204) | 99 (0–147) | 15 (0–27) | 0 | 4 (0–4) | 4 | 0 (0–4) |
| 4 | 100 (85–226) | 0 (0–161) | 0 (0–21) | 0 | 0 (0–4) | 4 (0–8) | 4 (0–4) |
| 5 | 157 (100–267) | 10 (0–183) | 2 (0–38) | 0 | 0.3 (0–5) | 4 (0–8) | 0 (0–4) |
| 6 | 158 (89–286) | 98 (0–190) | 3 (0–41) | 0 | 0.3 (0–5) | 4 (0–8) | 0 (0–4) |
| 7 | 192 (89–417) | 194 (0–359) | 26 (0–77) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 8 | 263 (89–406) | 275 (0–394) | 61 (0–90) | 0 | 10 (0–10.3) | 0 (0–8) | 0 (0–4) |
| 9 | 301 (0–393) | 308 (0–403) | 67 (0–95) | 0 | 10 (0–10.3) | 0 (0–4) | 0 (0–8) |
| 10 | 313 (166–424) | 317 (0–437) | 63 (0–102) | 0 | 10 (0–10.3) | 0 | 0 (0–8) |
| 11 | 293 (50–390) | 306 (0–398) | 63 (0–94) | 0 | 10 (0–10.3) | 0 (0–4) | 0 (0–8) |
| 12 | 237 (0–400) | 205 (0–414) | 43 (0–103) | 0 | 5 (0–10.3) | 0 (0–4) | 4 (0–8) |
| 13 | 160 (0–423) | 211 (104–433) | 18 (0–97) | 0 | 2.5 (0–10.3) | 2 (0–4) | 4 (0–4) |
| 14 | 232 (0–426) | 229 (110–429) | 41 (0–94) | 0 | 5 (0–10.3) | 2 (0–4) | 4 (0–4) |
| 15 | 39 (0–395) | 234 (119–395) | 0 (0–91) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 16 | 0 (0–417) | 238 (220–428) | 0 (0–95) | 0 | 0 (0–10.3) | 4 (0–8) | 4 (0–4) |
| 17 | 0 (0–416) | 249 (232–434) | 0 (0–95) | 0 | 0 (0–10.3) | 4 (0–8) | 4 (0–4) |
| 18 | 0 (0–431) | 258 (226–445) | 0 (0–102) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 19 | 0 (0–430) | 264 (220–424) | 0 (0–102) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 20 | 0 (0–453) | 268 (256–457) | 0 (0–111) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 21 | 0 (0–448) | 271 (244–438) | 0 (0–107) | 0 | 0 (0–11) | 4 (0–8) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | 11 | 8–21 | 17/20 |
| Primeiro refino bem-sucedido | 3 | 2–4 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 4.5 | 3–6 | 20/20 |
| Segunda zona de caça liberada | 4.5 | 3–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 13 | 10–21 | 20/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 10–21 | 7/20 |

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 57 | 8 / 8 / 8 / 8 / 8 | 8×20 |
| 2 | 81 | 27 | 10 / 10 / 10 / 10 / 10 | 10×20 |
| 3 | 84 | 20 | 11 / 11 / 11 / 11 / 11 | 11×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Diagnóstico da bolsa de caça

#### Diagnóstico: Bolsa de Caça do tier 1 (3 espaços) numa caça em demon_glade raso (herói novo, 20 horários de início)

| Duração da caça | Farrapos sorteados | Garras sorteadas | Núcleos sorteados | Unidades perdidas por falta de espaço | Sessões sem nenhum tipo perdido | Sessões em que os 3 tipos caem |
| --: | --- | --- | --- | --- | --- | --- |
| 15 min | 10.7 | 3.1 | 0.3 | 0 | 20/20 | 5/20 |
| 30 min | 21.1 | 6.6 | 0.5 | 0 | 20/20 | 8/20 |
| 60 min (1 h) | 40.8 | 12.6 | 1 | 0 | 20/20 | 15/20 |
| 120 min (2 h) | 78.3 | 24.2 | 1.9 | 0 | 20/20 | 17/20 |
| 240 min (4 h) | 147 | 48.3 | 4.4 | 0 | 20/20 | 20/20 |

### Diagnóstico do chefe do andar 25

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário A)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 2 | 119 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 5 (4–6) | 493 (416–618) | arma T2 / armadura T2, nível 36 (31–39) | 20/20 seeds |

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário B)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 2 | 119 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 5 (3–6) | 488 (389–597) | arma T2 / armadura T2, nível 34 (30–39) | 20/20 seeds |

#### Diagnóstico: chefe do andar 25 (CP recomendado pelo jogo: 546; andar 24: 115) contra heróis montados à mão, sem poções, de HP cheio

| Equipamento | Nível | CP | Sobe do andar 1 ao 24 de uma vez | Limpa o andar 24 | Vence o chefe do 25 |
| --: | --- | --- | --- | --- | --- |
| Roupa de trapos + Clava | 30 | 204 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 60 | 371 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 100 | 620 | 20/20 | 20/20 | 20/20 |
| Tier 1 (adaga + couro) +0 | 40 | 379 | 20/20 | 20/20 | 0/20 |
| Tier 1 +8 | 40 | 502 | 20/20 | 20/20 | 10/20 |
| Tier 1 +8 | 60 | 660 | 20/20 | 20/20 | 20/20 |
| Tier 2 (espada + cota) +0 | 40 | 509 | 20/20 | 20/20 | 11/20 |
| Tier 2 +4 | 40 | 622 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 40 | 743 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 60 | 931 | 20/20 | 20/20 | 20/20 |
| Tier 3 (montante + placas) +0 | 40 | 772 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 40 | 1 213 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 60 | 1 459 | 20/20 | 20/20 | 20/20 |
| Tier 4 (lâmina dourada + égide) +8 | 100 | 2 492 | 20/20 | 20/20 | 20/20 |

### Diagnóstico da curva de inimigos

#### Curva de inimigos em volta dos chefes: HP × dano por golpe

| Chefe (andar) | Andar anterior (N−1) | Chefe (N) | Andar seguinte (N+1) | (N+1) / (N−1) | Chefe / (N−1) |
| --: | --- | --- | --- | --- | --- |
| 25 | 200 × 23 = 4 600 | 760 × 171 = 129 960 | 1 188 × 148 = 175 824 | 38.22 | 28.3 |
| 50 | 2 050 × 250 = 512 500 | 5 266 × 255 = 1 342 830 | 2 652 × 343 = 909 636 | 1.77 | 2.6 |
| 75 | 3 728 × 478 = 1 781 984 | 9 084 × 436 = 3 960 624 | 8 759 × 441 = 3 862 719 | 2.17 | 2.2 |
| 100 | 11 226 × 563 = 6 320 238 | 14 279 × 682 = 9 738 278 | - | - | 1.5 |
