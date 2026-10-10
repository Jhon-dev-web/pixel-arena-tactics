# Baseline de balanceamento: as primeiras horas de um jogador novo (depois do pacote de balanceamento)

- **Data:** 2026-10-10
- **Commit medido:** o commit `balance: fix early-game deadlocks and smooth the floor-25 wall` (o que adiciona este documento), na branch `claude/project-thread-ppdm57`. O baseline anterior, medido no commit `2654196`/`dbb65b5` (sem nenhuma mudança de balanceamento), foi preservado em [`BALANCE_BASELINE_2026-10-10_pre.md`](BALANCE_BASELINE_2026-10-10_pre.md). Cada valor alterado, o motivo e o antes/depois de cada meta estão em [`BALANCE_CHANGES.md`](BALANCE_CHANGES.md).
- **Como reproduzir:** `npm run sim` (cerca de 6 s para 20 seeds x 14 dias x 2 cenários). Código em `scripts/sim/` (`driver.ts`, `player.ts`, `progression.sim.ts`, `ladder.ts`). A política está documentada no topo de `progression.sim.ts`. A tabela de CP recomendado por andar é gerada por `npm run sim:cp` (`cpTable.gen.ts` -> `src/game/recommendedCp.ts`).
- **Quem é o jogador simulado:** conta nova, sem Battle Pass, 2 visitas por dia (09h e 21h, com variação de até 90 min por seed), usa todas as 10 sessões grátis de Masmorra por dia, caça o resto do tempo e só minera/corta/planta quando o próximo equipamento exige.

## Resumo para quem tem pressa

1. **O deadlock do começo acabou.** Com a Bolsa de Caça de 3 espaços, uma caça de 4 h em demon_glade não perde nada (20/20 sessões com os 3 tipos de material, 0 unidades perdidas). Cenário A: primeira peça forjada no **dia 2 em 20/20 seeds** (antes: nunca) e primeiro refino no dia 3.
2. **A primeira sessão deixou de ser um mau sinal.** A conta nova (CP 58) agora termina a primeira sessão no **andar 8** (antes: 6), a 2ª no 10 e a 3ª no 11, e o checkpoint do andar 10 vem no **dia 1**. Com 10 sessões grátis, o primeiro bioma (andares 1 a 24) cai ainda no dia 1.
3. **O chefe do andar 25 continua sendo uma parede, mas com porta.** Quem acaba de limpar o andar 24 (CP 119 a 215) perde 100% das vezes. O chefe cai no **dia 6** (mediana; 5–7 no A, 4–7 no B), com CP mediano 579, arma e armadura tier 2 e nível 58. A segunda zona de caça abre no mesmo dia. O chefe do andar 50 só cai no dia 13 (10–14), e só 10/20 seeds chegam lá em 14 dias no A (17/20 no B).
4. **XP continua alto, e não é mais a Caça.** A Caça agora paga 1–9 mil XP por dia; quem manda no nível são os Pedidos (cerca de 300 a 750 mil XP por dia, mais de 90% do XP do dia na maioria dos dias a partir do dia 3). Nível 13 no dia 1, 49 no dia 3 e 68 no dia 14: as metas de nível dos dias 3 e 14 não são alcançáveis sem mexer nos Pedidos (ver `BALANCE_CHANGES.md`).
5. **A Masmorra fica ociosa nos dias 2 a 5.** Com o chefe do 25 de pé, as 10 sessões grátis do dia duram 6 a 12 s cada e não limpam andar; o ouro da Masmorra some depois do dia 1 (139 de ouro no dia 1, quase 0 depois).

## Política da simulação e o que ela não faz

Resumo da política (a versão completa e atual está no cabeçalho de `scripts/sim/progression.sim.ts`):

- **Visitas:** 2 por dia. A cada visita o jogo é "recarregado" (`normalizeSave`, que também reinicia missões diárias e sessões de Masmorra), coleta o que estava rodando, resgata missões, gasta, faz sessões, aceita pedido e inicia uma atividade de fundo.
- **Masmorra:** usa todas as sessões grátis do dia (`T.dungeon.freeSessionsPerDay` = 10: 5 em cada visita). Luta até morrer; só se retira (a) num chefe de bioma ainda não resgatado, para garantir o marco, (b) com HP <= 20% depois de um andar, (c) no andar 100. Conserta equipamento com durabilidade < 40. Mantém até 5 poções pequenas, compradas só com ouro que sobra depois de reservar o preço da próxima forja (antes podiam consumir metade da reserva), e não compra enquanto as duas últimas sessões morreram sem limpar andar.
- **Caça:** atividade padrão. Zona de maior XP liberada pelo andar, profundidade mais funda que o CP permite (regra do CP recomendado da própria UI).
- **Minério/madeira:** só quando a próxima forja ou refino precisa. Atividades que ainda têm falta se revezam.
- **Equipamento:** forja a próxima peça do slot de menor tier (arma em caso de empate), passando pelas estações (fornalha, curtume, carpintaria, alquimia); equipa o que dá mais `computeCP`; refina com o ouro que não está reservado para a próxima forja; compra gemas com estilhaços quando a receita pede; encaixa gemas sobrando. A Bolsa de Caça nível 2 é comprada assim que possível (a Bolsa do tier 1 tem 3 espaços).
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
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–28 / 45–60) | 13 / 49 (28–58) / 68 (65–70) | 13 / 49 (41–58) / 68 (64–70) | dia 1 ok; dia 3 FORA DA META; dia 14 FORA DA META |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 6; vitória ao chegar: 0% | dia 5.5; vitória ao chegar: 0% | ok |
| T6 | Andar 50 não antes do dia 12 (chefe 50 vencido; a chegada ao andar 50 vem depois) | chefe: dia depois do dia 14 (primeira seed: dia 10; 10/20 chegam); chegada: dia 6 | chefe: dia 13 (primeira seed: dia 10; 17/20 chegam); chegada: dia 6 | chefe ok; chegada FORA DA META |
| T7 | Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75 | menor razão (N+1)/(N−1): 1.12 | - | ok |
| T8 | Derrota mantém 75% do ouro da sessão | 75% | - | ok |

#### B contra A: o Cenário B não pode ser mais de ~1,5 dia mais rápido que o A em nenhum marco

| Marco | Dia no A (mediana de quem chegou; seeds que chegaram) | Dia no B | A − B (dias) | Resultado |
| --: | --- | --- | --- | --- |
| Primeira peça forjada | 2 (20/20) | 2 (20/20) | 0 | ok |
| Primeiro refino | 3 (20/20) | 3 (20/20) | 0 | ok |
| Checkpoint do andar 10 | 1 (20/20) | 1 (20/20) | 0 | ok |
| Chefe do andar 25 | 6 (20/20) | 5.5 (20/20) | 0.5 | ok |
| Zona de caça 2 | 6 (20/20) | 5.5 (20/20) | 0.5 | ok |
| Chefe do andar 50 | 13 (10/20) | 12 (17/20) | 1 | ok |

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 14 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 119 | 24 | 0 | 0 |
| 2 | 23 (23–39) | 215 (211–334) | 25 | 1 | 0 (0–1) |
| 3 | 49 (28–58) | 390 (255–470) | 25 | 1 | 1 |
| 4 | 54 (49–59) | 448 (388–534) | 25 | 1 (1–2) | 1 (1–2) |
| 5 | 57 (52–61) | 547 (495–699) | 25 (25–50) | 2 | 2 (1–2) |
| 6 | 60 (54–64) | 672 (514–732) | 50 (25–50) | 2 | 2 (1–2) |
| 7 | 62 (58–66) | 691 (659–761) | 50 | 2 | 2 (1–2) |
| 8 | 64 (58–67) | 720 (667–778) | 50 | 2 | 2 (1–2) |
| 9 | 65 (61–67) | 737 (691–903) | 50 | 2 (2–3) | 2 (1–2) |
| 10 | 66 (63–68) | 877 (845–1 114) | 50 (50–56) | 3 | 2 (1–3) |
| 11 | 66 (64–69) | 886 (854–1 114) | 50 (50–59) | 3 | 2 (1–3) |
| 12 | 67 (65–69) | 903 (865–1 114) | 50 (50–60) | 3 | 2 (1–3) |
| 13 | 67 (65–70) | 940 (871–1 114) | 50 (50–60) | 3 | 2 (1–3) |
| 14 | 68 (65–70) | 971 (871–1 122) | 51 (50–60) | 3 | 2 (1–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 7 119 (7 119–74 619) | 129 | 6 990 | 0 (0–67 500) |
| 3 | 298 625 (9 093–1 171 087) | 0 | 9 086 (0–9 099) | 294 625 (0–1 162 000) |
| 4 | 263 500 (0–471 750) | 0 | 0 | 263 500 (0–471 750) |
| 5 | 455 346 (72 844–793 943) | 0 (0–5 100) | 9 097 (0–18 846) | 446 250 (63 750–779 750) |
| 6 | 570 957 (69 605–1 190 582) | 3 501 (0–5 100) | 0 (0–18 838) | 561 542 (67 500–1 166 667) |
| 7 | 604 510 (0–1 148 590) | 0 (0–5 100) | 4 549 (0–18 846) | 585 667 (0–1 138 666) |
| 8 | 747 292 (18 820–1 208 667) | 0 | 0 (0–18 829) | 747 292 (0–1 208 667) |
| 9 | 659 875 (67 500–1 180 667) | 0 | 0 | 659 875 (67 500–1 180 667) |
| 10 | 304 839 (0–1 134 177) | 0 (0–1 787) | 0 (0–37 664) | 293 250 (0–1 115 333) |
| 11 | 523 044 (0–803 838) | 0 (0–917) | 37 657 (0–37 696) | 503 792 (0–766 167) |
| 12 | 540 714 (234–1 148 177) | 0 (0–1 346) | 0 (0–37 684) | 521 875 (0–1 129 333) |
| 13 | 224 173 (0–1 129 334) | 0 (0–1 346) | 0 (0–37 689) | 223 500 (0–1 129 334) |
| 14 | 126 061 (0–1 190 000) | 0 (0–1 346) | 0 (0–37 677) | 116 625 (0–1 190 000) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 6 (6–8) | 100% |
| 3 | 0 | 10 (6–12) | 100% |
| 4 | 0 | 11 (10–12) | 100% |
| 5 | 0 (0–2.5) | 12 (12–31) | 96% |
| 6 | 1.7 (0–2.5) | 24 (9–30) | 95% |
| 7 | 0 (0–2.5) | 10 (8–29) | 99% |
| 8 | 0 | 10 (8–10) | 100% |
| 9 | 0 | 10 (9–11) | 100% |
| 10 | 0 (0–0.6) | 12 (10–13) | 100% |
| 11 | 0 (0–0.3) | 12 (10–12) | 100% |
| 12 | 0 (0–0.4) | 12 (8–12) | 100% |
| 13 | 0 (0–0.4) | 12 (7–13) | 99% |
| 14 | 0 (0–0.4) | 11 (7–13) | 98% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 417 (415–584) | 6 (4–7) | 0 | 11 | 0 (0–47) | 400 (400–520) | 405 (405–550) | 133 (112–151) |
| 3 | 392 (111–927) | 0 | 0 | 11 (0–11) | 190 (0–696) | 220 (100–220) | 145 (50–595) | 366 (100–458) |
| 4 | 407 (100–1 516) | 0 | 0 | 0 | 168 (0–296) | 220 (100–1 220) | 369 (100–1 108) | 412 (148–928) |
| 5 | 1 511 (175–4 325) | 0 (0–390) | 0 (0–2 000) | 11 (0–24) | 280 (44–474) | 1 220 (120–1 450) | 758 (0–3 488) | 1 176 (352–2 652) |
| 6 | 2 136 (319–3 535) | 249 (0–390) | 1 000 (0–2 000) | 0 (0–24) | 343 (47–698) | 450 (120–1 220) | 1 755 (0–3 580) | 1 430 (1 203–1 945) |
| 7 | 560 (0–3 528) | 0 (0–382) | 0 (0–2 000) | 6 (0–24) | 367 (0–712) | 220 (0–450) | 750 (0–2 970) | 1 639 (1 412–2 065) |
| 8 | 665 (24–975) | 0 | 0 | 0 (0–24) | 475 (0–755) | 220 (0–220) | 750 (0–1 500) | 1 597 (1 289–2 053) |
| 9 | 640 (217–958) | 0 | 0 | 0 | 420 (49–738) | 220 (120–220) | 825 (0–2 101) | 1 450 (245–1 886) |
| 10 | 429 (24–6 412) | 0 (0–195) | 0 (0–5 000) | 0 (0–48) | 197 (0–697) | 220 (0–800) | 1 201 (0–3 711) | 866 (128–4 172) |
| 11 | 541 (0–6 362) | 0 (0–135) | 0 (0–5 000) | 48 (0–48) | 323 (0–486) | 120 (0–800) | 0 (0–2 180) | 687 (150–4 614) |
| 12 | 490 (48–6 652) | 0 (0–161) | 0 (0–5 000) | 0 (0–48) | 337 (0–706) | 120 (0–800) | 150 (0–1 370) | 732 (263–6 362) |
| 13 | 511 (0–6 444) | 0 (0–145) | 0 (0–5 000) | 0 (0–48) | 154 (0–724) | 120 (0–800) | 0 (0–690) | 1 281 (351–6 920) |
| 14 | 334 (0–6 675) | 0 (0–141) | 0 (0–5 000) | 0 (0–48) | 88 (0–743) | 120 (0–800) | 0 (0–960) | 3 429 (351–7 285) |

Ouro gasto nos 14 dias, por destino (mediana entre seeds): poções 915 · estações 1 639 · forja 1 940 · bolsa de caça 300 · refino 4 500 · reparo 0

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 190 (174–214) | 56 (45–67) | 4 (1–10) | 0 | 4 | 0 | 4 |
| 3 | 153 (70–182) | 107 (0–148) | 14 (0–24) | 0 | 4 (0–4) | 4 | 0 (0–4) |
| 4 | 85 (85–100) | 0 | 0 | 0 | 0 | 4 | 4 |
| 5 | 223 (115–355) | 166 (0–351) | 28 (0–53) | 0 | 4 (0–8) | 0 (0–4) | 4 (0–4) |
| 6 | 130 (130–261) | 0 (0–181) | 0 (0–34) | 0 | 0 (0–5) | 4 (0–4) | 4 (0–4) |
| 7 | 175 (154–273) | 53 (0–180) | 7 (0–35) | 0 | 2 (0–5) | 4 (0–4) | 4 (0–4) |
| 8 | 178 (154–222) | 0 (0–140) | 0 (0–31) | 0 | 0 (0–5) | 4 (0–4) | 4 (0–4) |
| 9 | 89 (0–178) | 98 (0–196) | 0 | 0 | 0 | 4 | 4 |
| 10 | 104 (0–382) | 154 (98–351) | 0 (0–66) | 0 | 0 (0–10) | 4 (0–8) | 4 (0–4) |
| 11 | 302 (0–358) | 314 (104–361) | 68 (0–87) | 0 | 10 (0–10) | 0 (0–8) | 0 (0–4) |
| 12 | 0 (0–329) | 249 (214–348) | 0 (0–92) | 0 | 0 (0–10) | 4 (0–8) | 0 (0–4) |
| 13 | 0 (0–340) | 235 (220–368) | 0 (0–73) | 0 | 0 (0–10) | 4 (0–8) | 0 (0–4) |
| 14 | 0 (0–335) | 249 (229–372) | 0 (0–78) | 0 | 0 (0–10) | 4 (0–8) | 0 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 14 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeiro refino bem-sucedido | 3 | 3–4 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 6 | 5–7 | 20/20 |
| Segunda zona de caça liberada | 6 | 5–7 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 6 | 5–7 | 20/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 14 | 10–14 | 10/20 |

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 57 | 8 / 8 / 8 / 8 / 8 | 8×20 |
| 2 | 81 | 27 | 10 / 10 / 10 / 10 / 10 | 10×20 |
| 3 | 84 | 20 | 11 / 11 / 11 / 11 / 11 | 11×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Cenário B (sensibilidade): igual ao A, mais uma visita curta (até 15 min, parando a caça quando a prévia da bolsa ainda guarda os farrapos) logo depois da primeira, enquanto faltarem itens comuns de caça

Seeds: 20 · dias simulados: 14 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 119 | 24 | 0 | 0 |
| 2 | 28 (23–39) | 254 (211–334) | 25 | 1 | 1 (0–1) |
| 3 | 49 (41–58) | 392 (332–472) | 25 | 1 | 1 |
| 4 | 55 (48–58) | 464 (415–670) | 25 (25–49) | 2 (1–2) | 1 (1–2) |
| 5 | 57 (52–59) | 591 (495–704) | 26 (25–50) | 2 | 2 (1–2) |
| 6 | 59 (54–62) | 684 (514–724) | 50 (25–50) | 2 | 2 |
| 7 | 60 (58–64) | 702 (638–757) | 50 | 2 | 2 |
| 8 | 63 (59–65) | 720 (659–774) | 50 | 2 | 2 |
| 9 | 64 (59–67) | 871 (696–956) | 50 | 3 (2–3) | 2 |
| 10 | 66 (61–68) | 880 (828–1 095) | 50 (50–54) | 3 | 2 (2–3) |
| 11 | 67 (63–69) | 898 (837–1 105) | 50 (50–58) | 3 | 2 (2–3) |
| 12 | 68 (63–69) | 978 (837–1 105) | 50 (50–60) | 3 | 2 (2–3) |
| 13 | 68 (63–69) | 992 (837–1 105) | 52 (50–60) | 3 | 2 (2–3) |
| 14 | 68 (64–70) | 1 001 (837–1 115) | 54 (50–60) | 3 | 2 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 17 830 (7 553–75 056) | 129 | 7 427 (7 424–8 477) | 9 750 (0–67 500) |
| 3 | 310 091 (71 250–1 120 000) | 0 | 4 542 (0–9 099) | 301 000 (71 250–1 120 000) |
| 4 | 305 500 (0–577 083) | 0 (0–4 896) | 0 | 305 500 (0–577 083) |
| 5 | 306 502 (14 193–770 196) | 102 (0–5 100) | 9 092 (562–18 821) | 299 125 (0–756 000) |
| 6 | 583 599 (18 838–825 622) | 1 354 (0–5 100) | 926 (0–18 839) | 578 042 (0–819 583) |
| 7 | 390 758 (16 667–1 130 696) | 0 (0–5 100) | 17 740 (0–18 844) | 374 250 (0–1 124 667) |
| 8 | 567 417 (18 821–1 134 000) | 0 | 0 (0–18 847) | 567 417 (0–1 134 000) |
| 9 | 600 292 (18 835–1 120 000) | 0 | 0 (0–18 848) | 600 292 (0–1 120 000) |
| 10 | 692 305 (90 090–1 180 845) | 0 (0–1 346) | 18 836 (0–37 667) | 675 792 (71 250–1 162 000) |
| 11 | 674 328 (19 500–1 190 000) | 0 (0–1 323) | 0 (0–38 587) | 655 500 (0–1 190 000) |
| 12 | 604 648 (0–1 120 000) | 0 (0–1 565) | 0 (0–38 596) | 590 500 (0–1 120 000) |
| 13 | 315 722 (0–1 110 667) | 0 (0–917) | 0 (0–38 618) | 315 375 (0–1 110 667) |
| 14 | 299 849 (0–1 116 464) | 210 (0–1 346) | 0 (0–38 584) | 299 625 (0–1 115 334) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 7 (6–8) | 100% |
| 3 | 0 | 10 (8–12) | 100% |
| 4 | 0 (0–2.4) | 11 (10–30) | 100% |
| 5 | 0.1 (0–2.5) | 12 (11–31) | 96% |
| 6 | 0.7 (0–2.5) | 15 (8–31) | 96% |
| 7 | 0 (0–2.5) | 10 (8–29) | 99% |
| 8 | 0 | 10 (8–10) | 100% |
| 9 | 0 | 11 (9–12) | 100% |
| 10 | 0 (0–0.4) | 12 (10–13) | 99% |
| 11 | 0 (0–0.6) | 12 (10–14) | 99% |
| 12 | 0 (0–0.5) | 12 (10–12) | 99% |
| 13 | 0 (0–0.3) | 11 (7–12) | 99% |
| 14 | 0.1 (0–0.4) | 11 (7–13) | 98% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 484 (415–584) | 6 (4–7) | 0 | 11 | 8 (0–47) | 460 (400–520) | 478 (405–580) | 131 (102–151) |
| 3 | 392 (169–890) | 0 | 0 | 6 (0–11) | 194 (49–670) | 220 (120–220) | 145 (0–600) | 367 (286–438) |
| 4 | 462 (216–3 915) | 0 (0–369) | 0 (0–2 000) | 0 | 196 (0–351) | 220 (120–1 450) | 444 (150–3 128) | 443 (170–1 216) |
| 5 | 1 470 (286–4 297) | 6 (0–391) | 0 (0–2 000) | 11 (0–24) | 192 (0–459) | 1 220 (120–1 450) | 758 (0–3 098) | 1 248 (352–1 673) |
| 6 | 830 (24–3 334) | 93 (0–418) | 0 (0–2 000) | 1 (0–24) | 351 (0–497) | 325 (0–1 220) | 705 (0–3 030) | 1 449 (1 211–1 843) |
| 7 | 477 (24–3 505) | 0 (0–382) | 0 (0–2 000) | 24 (0–24) | 241 (0–672) | 170 (0–450) | 390 (0–2 970) | 1 550 (1 235–1 849) |
| 8 | 540 (24–929) | 0 | 0 | 0 (0–24) | 357 (0–709) | 170 (0–220) | 675 (0–1 500) | 1 658 (1 226–1 945) |
| 9 | 599 (24–920) | 0 | 0 | 0 (0–24) | 379 (0–700) | 220 (0–220) | 1 201 (0–2 101) | 771 (177–1 759) |
| 10 | 637 (195–6 627) | 0 (0–153) | 0 (0–5 000) | 24 (0–48) | 427 (51–726) | 220 (120–800) | 1 370 (0–2 180) | 872 (154–5 146) |
| 11 | 658 (48–6 664) | 0 (0–155) | 0 (0–5 000) | 0 (0–49) | 417 (0–744) | 210 (0–800) | 435 (0–1 370) | 816 (186–6 568) |
| 12 | 549 (0–6 589) | 0 (0–181) | 0 (0–5 000) | 0 (0–49) | 381 (0–709) | 160 (0–800) | 185 (0–1 370) | 1 489 (142–6 677) |
| 13 | 497 (0–6 450) | 0 (0–105) | 0 (0–5 000) | 0 (0–49) | 222 (0–694) | 120 (0–800) | 125 (0–480) | 5 987 (142–7 104) |
| 14 | 463 (0–6 537) | 17 (0–158) | 0 (0–5 000) | 0 (0–49) | 210 (0–697) | 200 (0–800) | 150 (0–890) | 6 813 (142–7 972) |

Ouro gasto nos 14 dias, por destino (mediana entre seeds): poções 1 200 · estações 1 639 · forja 1 940 · bolsa de caça 300 · refino 4 350 · reparo 0

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 235 (164–282) | 80 (71–90) | 8 (2–12) | 0 | 4.3 | 0 | 4 |
| 3 | 112 (70–182) | 54 (0–129) | 6 (0–24) | 0 | 2 (0–4) | 4 | 2 (0–4) |
| 4 | 93 (85–100) | 0 | 0 | 0 | 0 | 4 | 4 |
| 5 | 222 (121–344) | 170 (2–324) | 22 (1–63) | 0 | 4 (0.3–8) | 4 (0–4) | 2 (0–4) |
| 6 | 150 (130–231) | 7 (0–158) | 1 (0–33) | 0 | 0.3 (0–5) | 4 (0–4) | 4 (0–4) |
| 7 | 208 (151–273) | 109 (0–180) | 19 (0–30) | 0 | 5 (0–5) | 2 (0–4) | 4 (0–4) |
| 8 | 178 (89–230) | 0 (0–152) | 0 (0–34) | 0 | 0 (0–5) | 4 (0–4) | 4 |
| 9 | 0 (0–200) | 196 (0–256) | 0 (0–33) | 0 | 0 (0–5) | 4 (0–4) | 4 |
| 10 | 261 (0–324) | 167 (98–303) | 35 (0–61) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 11 | 52 (0–324) | 235 (110–352) | 0 (0–86) | 0 | 0 (0–10.3) | 4 (0–8) | 0 (0–4) |
| 12 | 0 (0–341) | 229 (178–336) | 0 (0–80) | 0 | 0 (0–10.3) | 4 (0–8) | 0 (0–4) |
| 13 | 0 (0–328) | 237 (220–329) | 0 (0–85) | 0 | 0 (0–10.3) | 4 (0–8) | 4 (0–4) |
| 14 | 0 (0–361) | 244 (232–351) | 0 (0–77) | 0 | 0 (0–10.3) | 4 (0–8) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 14 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeiro refino bem-sucedido | 3 | 3–4 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5.5 | 4–7 | 20/20 |
| Segunda zona de caça liberada | 5.5 | 4–7 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 6 | 5–7 | 20/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | 13 | 10–14 | 17/20 |

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
| Vence o chefe pela primeira vez | 6 (5–7) | 579 (548–610) | arma T2 / armadura T2, nível 58 (55–61) | 20/20 seeds |

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário B)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 2 | 119 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 6 (4–7) | 583 (528–620) | arma T2 / armadura T2, nível 58 (56–62) | 20/20 seeds |

#### Diagnóstico: chefe do andar 25 (CP recomendado pelo jogo: 620; andar 24: 132) contra heróis montados à mão, sem poções, de HP cheio

| Equipamento | Nível | CP | Sobe do andar 1 ao 24 de uma vez | Limpa o andar 24 | Vence o chefe do 25 |
| --: | --- | --- | --- | --- | --- |
| Roupa de trapos + Clava | 30 | 204 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 60 | 371 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 100 | 620 | 20/20 | 20/20 | 20/20 |
| Tier 1 (adaga + couro) +0 | 40 | 326 | 20/20 | 20/20 | 0/20 |
| Tier 1 +8 | 40 | 387 | 20/20 | 20/20 | 0/20 |
| Tier 1 +8 | 60 | 521 | 20/20 | 20/20 | 0/20 |
| Tier 2 (espada + cota) +0 | 40 | 418 | 20/20 | 20/20 | 0/20 |
| Tier 2 +4 | 40 | 481 | 20/20 | 20/20 | 0/20 |
| Tier 2 +8 | 40 | 544 | 20/20 | 20/20 | 1/20 |
| Tier 2 +8 | 60 | 700 | 20/20 | 20/20 | 20/20 |
| Tier 3 (montante + placas) +0 | 40 | 578 | 20/20 | 20/20 | 1/20 |
| Tier 3 +8 | 40 | 816 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 60 | 1 009 | 20/20 | 20/20 | 20/20 |
| Tier 4 (lâmina dourada + égide) +8 | 100 | 1 712 | 20/20 | 20/20 | 20/20 |

### Diagnóstico da curva de inimigos

#### Curva de inimigos em volta dos chefes: HP × dano por golpe

| Chefe (andar) | Andar anterior (N−1) | Chefe (N) | Andar seguinte (N+1) | (N+1) / (N−1) | Chefe / (N−1) |
| --: | --- | --- | --- | --- | --- |
| 25 | 200 × 23 = 4 600 | 1 256 × 146 = 183 376 | 523 × 72 = 37 656 | 8.19 | 39.9 |
| 50 | 902 × 122 = 110 044 | 2 280 × 258 = 588 240 | 2 040 × 266 = 542 640 | 4.93 | 5.3 |
| 75 | 2 868 × 371 = 1 064 028 | 3 303 × 370 = 1 222 110 | 3 185 × 375 = 1 194 375 | 1.12 | 1.1 |
| 100 | 4 082 × 479 = 1 955 278 | 4 327 × 483 = 2 089 941 | - | - | 1.1 |
