> **2026-10-11 (rodada 7, habilidades):** o relatório completo abaixo foi regerado com habilidades (cenário A = Guerreiro) e com o retune dos orcs (hp 276, dmg 41), do chefe 50 (0,88) e da tabela de CP; o texto de resumo e a política acima descrevem o baseline anterior. Detalhes em `BALANCE_CHANGES.md` (Rodada 7).

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

Gerado por `npm run sim` depois da rodada 7 (habilidades). Cada célula é mediana (mín–máx) entre as 20 seeds. O jogador do cenário A gasta os pontos de habilidade no Guerreiro; a seção "Habilidades" compara os três caminhos com o mesmo jogador sem habilidades.

### Metas de balanceamento (T2 a T8) e do inventário (I1 a I4)

| Meta | Critério | Cenário A (pedido) | Resultado |
| --- | --- | --- | --- |
| T2 | Primeira sessão da conta nova termina no andar ≥ 8; checkpoint do andar 10 no dia 1 | andar 8; checkpoint 10 no dia 1 | ok |
| T3 | Primeira peça forjada no dia 1 ou 2 | dia 2 | ok |
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–29 / 45–60) | 13 / 28 (24–32) / 49 (46–51) | ok |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 5; vitória ao chegar: 0% | ok |
| T6 | Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16 | chegada: primeira seed no dia 9, mediana 13; chefe 50: primeira seed no dia 10, mediana 18.5, 12/20 em 21 dias | chegada FORA DA META; chefe FORA DA META |
| T7 | Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75 | menor razão (N+1)/(N−1): 1.45 | ok |
| T8 | Derrota mantém 75% do ouro da sessão | 75% | ok |
| I1 | Com 2 visitas por dia, o inventário enche pela primeira vez entre os dias 3 e 6 (não no dia 1, não nunca), no ritmo de quem não arruma | dia 6 (mín–máx 5–7; 20/20 seeds); jogador atento: 3/20 seeds chegam a encher antes de arrumar | ok |
| I2 | Jogador atento perde menos de 5% dos materiais por transbordo | mediana 1.24% · pior seed 15.7% | ok |
| I3 | Jogador que ignora o inventário sente: perde pelo menos 10% dos materiais | mediana 53.4% · pior seed 83.5% · melhor seed 20.9% | ok |
| I4 | Ouro do mercador (vendendo todo o excesso do dia) no máximo ~35% do ouro diário de antes do mercador (424 / 521 / 483), nos dias 3, 7 e 14 | dia 3: +0% · dia 7: +20.9% · dia 14: +26.1% | ok |

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 120 | 25 (24–25) | 0 | 0 |
| 2 | 23 (23–24) | 277 (264–370) | 25 | 1 (1–2) | 1 (1–2) |
| 3 | 28 (24–32) | 375 (313–513) | 25 (25–26) | 1 (1–2) | 1 (1–2) |
| 4 | 30 (27–33) | 468 (335–689) | 25 (25–30) | 2 (1–2) | 1 (1–2) |
| 5 | 35 (32–37) | 720 (465–891) | 29 (25–30) | 2 | 2 (1–3) |
| 6 | 38 (33–41) | 749 (691–926) | 30 (29–30) | 2 | 2 (2–3) |
| 7 | 40 (36–43) | 811 (734–1 036) | 30 (30–37) | 2 (2–3) | 2 (2–3) |
| 8 | 41 (37–45) | 907 (744–1 201) | 34 (30–42) | 2 (2–3) | 2 (2–3) |
| 9 | 44 (37–47) | 999 (750–1 301) | 40 (30–50) | 2 (2–3) | 2 (2–3) |
| 10 | 45 (40–48) | 1 043 (838–1 387) | 40 (30–52) | 3 (2–3) | 2 (2–3) |
| 11 | 46 (41–49) | 1 111 (858–1 618) | 40 (30–60) | 3 (2–3) | 3 (2–3) |
| 12 | 48 (43–50) | 1 214 (867–1 619) | 45 (30–64) | 3 (2–3) | 3 (2–3) |
| 13 | 48 (45–50) | 1 269 (879–1 798) | 50 (30–70) | 3 (2–3) | 3 (2–3) |
| 14 | 49 (46–51) | 1 284 (950–1 798) | 50 (30–70) | 3 (2–3) | 3 (2–3) |
| 15 | 49 (47–52) | 1 299 (950–1 798) | 50 (39–70) | 3 (2–3) | 3 (2–3) |
| 16 | 50 (47–52) | 1 355 (1 080–1 893) | 50 (40–70) | 3 (2–3) | 3 (2–3) |
| 17 | 50 (47–53) | 1 390 (1 112–1 893) | 50 (40–70) | 3 (2–3) | 3 (2–3) |
| 18 | 51 (47–53) | 1 456 (1 125–1 902) | 54 (40–70) | 3 (2–3) | 3 (2–3) |
| 19 | 51 (47–53) | 1 507 (1 163–1 918) | 58 (40–70) | 3 (2–3) | 3 (2–3) |
| 20 | 51 (47–54) | 1 517 (1 274–2 039) | 60 (50–70) | 3 | 3 (2–3) |
| 21 | 52 (47–55) | 1 517 (1 286–2 064) | 60 (50–70) | 3 | 3 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 668 (2 539–2 668) | 2 668 (2 539–2 668) | 0 | 0 |
| 2 | 7 124 (6 995–8 345) | 0 (0–129) | 6 995 | 0 (0–1 350) |
| 3 | 8 840 (1 590–22 493) | 0 (0–632) | 0 | 8 798 (1 590–22 493) |
| 4 | 4 948 (780–10 547) | 0 (0–905) | 0 | 4 923 (390–10 547) |
| 5 | 20 547 (15 203–28 990) | 491 (0–1 190) | 18 822 (9 091–18 844) | 4 828 (0–15 510) |
| 6 | 19 172 (390–40 723) | 143 (0–1 190) | 18 827 (0–37 682) | 2 328 (0–21 747) |
| 7 | 20 268 (1 425–39 016) | 0 (0–1 292) | 18 831 (0–37 677) | 1 740 (0–21 560) |
| 8 | 19 018 (1 275–40 012) | 500 (0–2 362) | 18 823 (0–37 679) | 1 583 (0–13 167) |
| 9 | 37 867 (0–49 617) | 911 (0–2 731) | 37 657 (0–37 695) | 1 425 (0–10 547) |
| 10 | 37 672 (513–44 095) | 451 (0–1 805) | 37 662 (0–37 688) | 390 (0–5 940) |
| 11 | 37 684 (1 350–53 215) | 0 (0–1 788) | 37 677 (0–37 696) | 358 (0–15 527) |
| 12 | 37 691 (0–43 888) | 0 (0–1 307) | 37 673 (0–37 698) | 0 (0–5 015) |
| 13 | 38 063 (1 539–41 736) | 0 (0–2 731) | 37 680 (0–37 692) | 0 (0–1 665) |
| 14 | 37 687 (845–43 285) | 0 (0–2 105) | 37 676 (0–37 693) | 0 (0–5 610) |
| 15 | 37 684 (0–49 621) | 0 (0–1 631) | 37 677 (0–37 698) | 0 (0–11 947) |
| 16 | 37 682 (1 350–58 733) | 0 (0–3 625) | 37 676 (0–55 108) | 0 (0–4 165) |
| 17 | 37 681 (1 023–39 101) | 0 (0–1 785) | 36 967 (0–37 697) | 0 (0–11 590) |
| 18 | 29 266 (0–41 777) | 0 (0–2 012) | 27 559 (0–37 692) | 0 (0–6 345) |
| 19 | 37 670 (0–72 893) | 0 (0–1 565) | 37 670 (0–72 503) | 0 (0–14 423) |
| 20 | 21 639 (0–72 981) | 0 (0–3 320) | 18 113 (0–72 526) | 195 (0–6 005) |
| 21 | 12 600 (0–72 484) | 0 (0–1 998) | 0 (0–72 484) | 0 (0–22 120) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.4 (2.3–2.4) | 32 | 100% |
| 2 | 0 (0–0.1) | 5 (5–7) | 100% |
| 3 | 0 (0–0.1) | 7 (6–8) | 100% |
| 4 | 0 (0–0.4) | 8 (6–11) | 96% |
| 5 | 0.2 (0–0.5) | 11 (8–13) | 96% |
| 6 | 0.1 (0–0.5) | 10 (9–13) | 99% |
| 7 | 0 (0–0.7) | 9 (9–16) | 100% |
| 8 | 0.3 (0–1.2) | 12 (9–18) | 100% |
| 9 | 0.6 (0–1.4) | 13 (9–18) | 100% |
| 10 | 0.2 (0–1) | 12 (9–17) | 100% |
| 11 | 0 (0–0.8) | 12 (9–16) | 100% |
| 12 | 0 (0–0.6) | 10 (9–15) | 100% |
| 13 | 0 (0–1.4) | 12 (9–19) | 100% |
| 14 | 0 (0–1) | 12 (5–18) | 100% |
| 15 | 0 (0–0.9) | 12 (5–17) | 100% |
| 16 | 0 (0–1.3) | 13 (5–18) | 98% |
| 17 | 0 (0–0.7) | 12 (5–15) | 100% |
| 18 | 0 (0–0.7) | 11 (5–15) | 100% |
| 19 | 0 (0–0.5) | 11 (5–16) | 100% |
| 20 | 0 (0–1.3) | 10 (5–21) | 100% |
| 21 | 0 (0–0.9) | 9 (5–16) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 426 (413–435) | 146 (133–155) | 0 | 0 | 0 | 280 | 300 (300–330) | 124 (105–132) |
| 2 | 415 (411–578) | 0 (0–7) | 0 | 11 | 0 (0–47) | 400 (400–520) | 465 (380–610) | 78 (66–160) |
| 3 | 497 (276–3 607) | 0 (0–30) | 0 (0–2 000) | 0 | 276 (56–672) | 220 (220–1 300) | 385 (285–885) | 180 (20–2 844) |
| 4 | 459 (169–3 643) | 0 (0–74) | 0 (0–2 000) | 0 | 157 (15–315) | 220 (120–1 300) | 568 (0–3 508) | 208 (90–803) |
| 5 | 530 (143–3 930) | 35 (0–94) | 0 (0–2 000) | 24 (11–28) | 153 (0–471) | 220 (100–1 300) | 697 (245–3 943) | 282 (103–2 378) |
| 6 | 359 (48–3 776) | 10 (0–87) | 0 (0–2 000) | 24 (0–56) | 84 (0–680) | 220 (0–1 300) | 510 (0–3 213) | 343 (3–1 422) |
| 7 | 330 (134–905) | 0 (0–107) | 0 | 24 (0–56) | 65 (0–674) | 120 (0–300) | 145 (0–2 285) | 425 (13–1 436) |
| 8 | 447 (138–666) | 35 (0–197) | 0 | 24 (0–56) | 58 (0–419) | 190 (0–300) | 303 (0–1 190) | 364 (39–1 828) |
| 9 | 438 (69–910) | 66 (0–206) | 0 | 48 (0–56) | 51 (0–330) | 200 (0–300) | 572 (0–3 416) | 318 (126–1 548) |
| 10 | 402 (137–6 152) | 32 (0–163) | 0 (0–5 000) | 48 (0–56) | 16 (0–200) | 200 (0–800) | 390 (0–5 067) | 258 (100–5 169) |
| 11 | 331 (168–980) | 0 (0–154) | 0 | 50 (0–56) | 15 (0–492) | 120 (0–300) | 288 (0–4 615) | 351 (136–1 580) |
| 12 | 304 (174–6 017) | 0 (0–158) | 0 (0–5 000) | 51 (0–56) | 0 (0–165) | 100 (0–680) | 343 (0–1 100) | 302 (108–5 775) |
| 13 | 309 (124–739) | 0 (0–214) | 0 | 50 (0–56) | 0 (0–62) | 100 (0–300) | 275 (0–2 160) | 357 (23–4 279) |
| 14 | 274 (146–5 839) | 0 (0–151) | 0 (0–5 000) | 50 (0–57) | 0 (0–188) | 100 (0–580) | 195 (0–910) | 349 (127–5 521) |
| 15 | 276 (124–6 324) | 0 (0–166) | 0 (0–5 000) | 50 (0–57) | 0 (0–373) | 100 (0–800) | 270 (0–2 940) | 350 (59–5 822) |
| 16 | 335 (178–6 269) | 0 (0–353) | 0 (0–5 000) | 49 (0–76) | 0 (0–137) | 110 (0–800) | 450 (0–5 020) | 425 (37–5 771) |
| 17 | 308 (177–5 972) | 0 (0–168) | 0 (0–5 000) | 49 (0–57) | 0 (0–382) | 110 (0–680) | 305 (0–3 580) | 615 (173–5 666) |
| 18 | 269 (100–6 064) | 0 (0–229) | 0 (0–5 000) | 37 (0–56) | 0 (0–223) | 100 (0–680) | 300 (0–3 355) | 751 (36–4 685) |
| 19 | 229 (134–5 925) | 0 (0–161) | 0 (0–5 000) | 48 (0–100) | 0 (0–478) | 110 (0–580) | 195 (0–2 320) | 1 351 (145–5 020) |
| 20 | 288 (130–6 134) | 0 (0–320) | 0 (0–5 000) | 24 (0–100) | 8 (0–212) | 120 (0–680) | 125 (0–4 325) | 1 760 (160–4 899) |
| 21 | 235 (130–971) | 0 (0–163) | 0 | 0 (0–102) | 0 (0–721) | 100 (0–300) | 130 (0–2 290) | 1 671 (135–3 893) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 1 875 · estações 2 381 · forja 2 268 · refino 3 075 · alquimia 1 465 · baú 785 · mochila 750 · reparo 45

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 (2–3) | 2 (2–3) | 0 | 0% | 0 | 0 | 0 | 0 | 426 (413–435) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 415 (411–578) | 0 / 0 |
| 3 | 26 | 10 (9–12) | 10 (9–12) | 0 | 0% | 0 | 0 | 0 | 0 | 497 (276–3 607) | 0 / 0 |
| 4 | 26 | 14 (13–18) | 14 (13–18) | 0 | 0% | 0 (0–17) | 0 (0–3) | 0 | 0 (0–3) | 459 (169–3 643) | 0 / 0 (0–2) |
| 5 | 26 (26–30) | 19 (14–25) | 21 (17–25) | 0 | 0% | 118 (0–328) | 10 (0–104) | 0 (0–70) | 10 (0–104) | 489 (133–3 875) | 0 (0–1) / 5 (0–15) |
| 6 | 26 (26–30) | 22 (16–25) | 23 (20–27) | 0 | 0% | 193 (0–406) | 101 (0–112) | 90 (0–209) | 101 (0–112) | 324 (33–3 674) | 0 (0–1) / 9 (4–15) |
| 7 | 26 (26–30) | 22 (16–26) | 22 (20–27) | 0 | 0% | 193 (0–438) | 109 (0–116) | 112 (0–435) | 109 (0–116) | 217 (24–894) | 0 (0–2) / 13 (8–16) |
| 8 | 26 (26–30) | 21 (19–26) | 22 (20–26) | 0 | 0% | 221 (0–463) | 112 (0–120) | 85 (0–235) | 112 (0–120) | 381 (24–552) | 1 (0–2) / 15 (8–20) |
| 9 | 26 (26–35) | 21 (16–25) | 23 (20–26) | 0 | 0% | 305 (0–525) | 117 (0–124) | 172 (0–641) | 117 (0–124) | 332 (69–792) | 1 (0–2) / 18 (9–23) |
| 10 | 30 (26–35) | 22 (17–29) | 23 (17–29) | 0 (0–104) | 0% | 319 (0–527) | 120 (0–126) | 211 (0–808) | 120 (0–126) | 289 (48–6 030) | 1 (0–2) / 20 (13–28) |
| 11 | 30 (26–35) | 23 (18–29) | 24 (18–29) | 0 | 0% | 332 (0–609) | 122 (0–128) | 221 (0–772) | 122 (0–128) | 208 (48–856) | 1 (0–2) / 22 (14–33) |
| 12 | 30 (26–35) | 23 (17–30) | 24 (18–30) | 0 (0–7) | 0% | 382 (0–604) | 121 (44–126) | 247 (0–934) | 124 (75–130) | 192 (48–5 891) | 1 (0–2) / 25 (18–40) |
| 13 | 30 (26–35) | 24 (17–30) | 25 (18–30) | 0 (0–224) | 0% | 246 (1–672) | 124 (0–130) | 310 (0–1 018) | 126 (0–130) | 187 (48–611) | 1 (0–2) / 28 (20–40) |
| 14 | 30 (26–35) | 24 (18–29) | 25 (18–30) | 0 (0–162) | 0% | 208 (0–627) | 126 (0–132) | 335 (0–894) | 126 (0–132) | 161 (24–5 711) | 2 (0–2) / 30 (20–40) |
| 15 | 30 (26–35) | 25 (18–30) | 25 (19–31) | 0 | 0% | 79 (0–738) | 127 (44–134) | 462 (0–944) | 128 (124–134) | 149 (0–6 196) | 2 (0–2) / 35 (20–40) |
| 16 | 33 (26–45) | 26 (21–35) | 26 (21–35) | 0 (0–268) | 0% | 58 (0–809) | 128 (44–134) | 441 (0–911) | 130 (111–134) | 207 (48–6 137) | 2 (0–2) / 39 (20–40) |
| 17 | 35 (26–45) | 29 (19–36) | 29 (21–36) | 0 (0–77) | 0% | 24 (0–551) | 120 (0–132) | 318 (0–890) | 129 (0–136) | 195 (48–5 848) | 2 (0–3) / 40 (20–40) |
| 18 | 35 (26–45) | 30 (20–35) | 30 (20–36) | 0 (0–542) | 0% | 27 (0–775) | 114 (0–134) | 174 (0–1 026) | 130 (0–136) | 145 (48–5 934) | 2 (0–3) / 40 (20–42) |
| 19 | 35 (26–45) | 31 (22–39) | 31 (22–39) | 0 (0–458) | 0% | 20 (0–1 707) | 74 (0–134) | 243 (0–942) | 132 (0–136) | 158 (0–5 791) | 2 (0–3) / 40 (20–48) |
| 20 | 35 (26–45) | 32 (26–39) | 33 (26–39) | 0 (0–506) | 0% | 17 (0–226) | 119 (0–138) | 364 (0–1 289) | 132 (0–138) | 155 (0–6 000) | 2 (0–3) / 40 (20–48) |
| 21 | 35 (26–45) | 32 (26–40) | 33 (26–41) | 0 (0–581) | 0% | 17 (0–876) | 126 (0–140) | 237 (0–1 183) | 133 (0–140) | 125 (0–841) | 2 (0–3) / 40 (20–50) |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 0 | 4 |
| 2 | 195 (174–209) | 65 (43–81) | 5 (1–7) | 0 | 4 | 4 | 0 |
| 3 | 70 | 0 | 0 | 0 | 0 | 4 | 4 |
| 4 | 100 | 0 | 0 | 0 | 0 | 4 | 4 |
| 5 | 230 (196–302) | 144 (117–294) | 29 (18–47) | 0 | 5 (4–8) | 4 (0–4) | 0 |
| 6 | 222 (142–295) | 147 (0–306) | 24 (0–65) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 7 | 224 (89–288) | 142 (0–321) | 29 (0–77) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 8 | 178 (77–378) | 217 (0–340) | 35 (0–87) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 9 | 296 (0–439) | 314 (0–435) | 68 (0–99) | 0 | 10 (0–10) | 0 (0–4) | 0 (0–8) |
| 10 | 319 (154–448) | 325 (0–476) | 79 (0–100) | 0 (0–104) | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 11 | 348 (166–462) | 343 (0–472) | 77 (0–118) | 0 | 10 (0–10) | 0 (0–4) | 0 (0–8) |
| 12 | 354 (0–486) | 369 (116–476) | 83 (0–114) | 0 (0–7) | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 13 | 341 (100–460) | 364 (137–483) | 89 (0–115) | 0 (0–224) | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 14 | 363 (0–451) | 394 (107–497) | 86 (0–120) | 0 (0–162) | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 15 | 393 (0–482) | 397 (148–483) | 86 (0–117) | 0 | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 16 | 378 (0–462) | 386 (0–626) | 88 (0–178) | 0 (0–268) | 10 (0–11) | 0 (0–4) | 0 (0–4) |
| 17 | 286 (0–473) | 371 (0–578) | 77 (0–118) | 0 (0–77) | 8 (0–10) | 0 (0–8) | 0 (0–4) |
| 18 | 213 (0–435) | 317 (0–506) | 47 (0–124) | 0 (0–542) | 5.5 (0–10) | 2 (0–8) | 0 (0–4) |
| 19 | 202 (0–483) | 378 (232–977) | 78 (0–300) | 0 (0–458) | 10 (0–12) | 0 (0–4) | 0 (0–4) |
| 20 | 31 (0–473) | 317 (235–990) | 40 (0–287) | 0 (0–506) | 3 (0–12) | 4 (0–8) | 2 (0–4) |
| 21 | 33 (0–514) | 308 (0–955) | 0 (0–295) | 0 (0–581) | 0 (0–12) | 4 (0–8) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | 19 | 11–21 | 13/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5 | 3–6 | 20/20 |
| Segunda zona de caça liberada | 5 | 3–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 13 | 9–20 | 20/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | 18.5 | 10–20 | 12/20 |
| Inventário cheio pela primeira vez (antes de qualquer arrumação) | depois do dia 21 | 18–20 | 3/20 |
| Primeira melhoria do Baú | 8.5 | 5–17 | 18/20 |
| Segunda melhoria do Baú | 14 | 7–20 | 18/20 |
| Terceira melhoria do Baú | depois do dia 21 | 17–18 | 2/20 |

Dia em que cada seed chegou ao andar 50 (ordenado): 9 10 10 10 10 10 10 12 12 13 13 14 14 14 15 15 17 19 20 20

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 57 | 8 / 8 / 8 / 8 / 8 | 8×20 |
| 2 | 81 | 27 | 10 / 10 / 10 / 10 / 10 | 10×20 |
| 3 | 85 | 20 | 11 / 11 / 11 / 11 / 11 | 11×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Cenário N (descuidado): o mesmo jogador que nunca guarda, vende, descarta nem expande o inventário

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 120 | 25 (24–25) | 0 | 0 |
| 2 | 23 (23–24) | 277 (264–370) | 25 | 1 (1–2) | 1 (1–2) |
| 3 | 28 (24–32) | 360 (329–639) | 25 (25–26) | 1 (1–2) | 1 (1–2) |
| 4 | 30 (26–36) | 496 (408–711) | 26 (25–29) | 2 (1–2) | 1 (1–2) |
| 5 | 35 (32–39) | 707 (607–823) | 29 (26–30) | 2 | 2 (1–2) |
| 6 | 40 (34–42) | 755 (679–863) | 30 (27–34) | 2 | 2 (1–2) |
| 7 | 42 (35–44) | 769 (707–868) | 30 (28–36) | 2 | 2 (1–2) |
| 8 | 42 (35–46) | 778 (707–896) | 30 (28–40) | 2 | 2 (1–2) |
| 9 | 42 (35–47) | 787 (707–930) | 30 (30–40) | 2 | 2 (1–2) |
| 10 | 43 (35–49) | 788 (707–942) | 30 (30–40) | 2 | 2 (1–2) |
| 11 | 43 (35–50) | 789 (707–1 181) | 30 (30–40) | 2 (2–3) | 2 (1–2) |
| 12 | 44 (35–50) | 794 (707–1 181) | 30 (30–40) | 2 (2–3) | 2 (1–2) |
| 13 | 44 (35–51) | 797 (707–1 192) | 30 (30–40) | 2 (2–3) | 2 (1–2) |
| 14 | 44 (35–51) | 797 (723–1 192) | 30 (30–40) | 2 (2–3) | 2 (1–2) |
| 15 | 44 (35–51) | 797 (723–1 192) | 30 (30–40) | 2 (2–3) | 2 (1–2) |
| 16 | 44 (35–51) | 797 (723–1 192) | 30 (30–40) | 2 (2–3) | 2 (1–2) |
| 17 | 44 (35–51) | 797 (723–1 192) | 30 (30–40) | 2 (2–3) | 2 (1–2) |
| 18 | 44 (35–51) | 797 (723–1 231) | 30 (30–45) | 2 (2–3) | 2 (1–2) |
| 19 | 44 (35–51) | 797 (723–1 231) | 30 (30–50) | 2 (2–3) | 2 (1–2) |
| 20 | 44 (35–51) | 797 (723–1 231) | 30 (30–50) | 2 (2–3) | 2 (1–2) |
| 21 | 44 (35–51) | 797 (723–1 231) | 30 (30–50) | 2 (2–3) | 2 (1–2) |

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 (2–3) | 2 (2–3) | 0 | 0% | 0 | 0 | 0 | 0 | 426 (413–435) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 415 (411–578) | 0 / 0 |
| 3 | 26 | 10 (10–16) | 10 (10–16) | 0 | 0% | 0 | 0 | 0 | 0 | 510 (276–3 627) | 0 / 0 |
| 4 | 26 | 15 (12–18) | 15 (12–18) | 0 | 0% | 0 | 0 | 0 | 0 | 689 (100–4 024) | 0 / 0 |
| 5 | 26 | 24 (18–26) | 24 (18–26) | 0 | 0% | 0 | 0 | 0 | 0 | 1 963 (127–3 877) | 0 / 0 |
| 6 | 26 | 26 (25–26) | 26 (25–26) | 299 (0–497) | 54.6% | 0 | 0 | 0 | 0 | 337 (54–604) | 0 / 0 |
| 7 | 26 | 26 (25–26) | 26 (25–26) | 386 (0–733) | 91.5% | 0 | 0 | 0 | 0 | 194 (0–865) | 0 / 0 |
| 8 | 26 | 26 (25–26) | 26 (25–26) | 235 (0–774) | 95.2% | 0 | 0 | 0 | 0 | 57 (0–669) | 0 / 0 |
| 9 | 26 | 26 (25–26) | 26 | 179 (0–791) | 96.7% | 0 | 0 | 0 | 0 | 142 (0–624) | 0 / 0 |
| 10 | 26 | 26 | 26 | 0 (0–662) | 0% | 0 | 0 | 0 | 0 | 38 (0–649) | 0 / 0 |
| 11 | 26 | 26 | 26 | 0 (0–777) | 0% | 0 | 0 | 0 | 0 | 38 (0–771) | 0 / 0 |
| 12 | 26 | 26 | 26 | 0 (0–751) | 0% | 0 | 0 | 0 | 0 | 143 (0–437) | 0 / 0 |
| 13 | 26 | 26 | 26 | 0 (0–347) | 0% | 0 | 0 | 0 | 0 | 81 (0–413) | 0 / 0 |
| 14 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–355) | 0% | 0 | 0 | 0 | 0 | 153 (0–519) | 0 / 0 |
| 15 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–367) | 0% | 0 | 0 | 0 | 0 | 0 (0–550) | 0 / 0 |
| 16 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–379) | 0% | 0 | 0 | 0 | 0 | 0 (0–408) | 0 / 0 |
| 17 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–391) | 0% | 0 | 0 | 0 | 0 | 0 (0–274) | 0 / 0 |
| 18 | 26 | 26 | 26 | 0 (0–397) | 0% | 0 | 0 | 0 | 0 | 0 (0–273) | 0 / 0 |
| 19 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–406) | 0% | 0 | 0 | 0 | 0 | 0 (0–248) | 0 / 0 |
| 20 | 26 | 26 | 26 | 0 (0–412) | 0% | 0 | 0 | 0 | 0 | 0 (0–202) | 0 / 0 |
| 21 | 26 | 26 | 26 | 0 (0–418) | 0% | 0 | 0 | 0 | 0 | 0 (0–171) | 0 / 0 |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 195 (174–209) | 65 (43–81) | 5 (1–7) | 0 | 4 | 0 | 4 |
| 3 | 70 (70–175) | 0 (0–122) | 0 (0–18) | 0 | 0 (0–4) | 4 (4–8) | 4 (0–4) |
| 4 | 100 (85–100) | 0 | 0 | 0 | 0 | 4 (0–4) | 4 (4–8) |
| 5 | 236 (123–413) | 164 (0–346) | 30 (0–65) | 0 | 5 (0–8) | 4 (0–4) | 0 (0–4) |
| 6 | 82 (0–297) | 117 (0–278) | 45 (0–77) | 299 (0–497) | 10 (0–10) | 0 (0–8) | 0 |
| 7 | 0 (0–89) | 0 (0–147) | 2 (0–64) | 355 (0–733) | 5 (0–10) | 0 (0–8) | 0 |
| 8 | 0 (0–57) | 0 (0–166) | 0 (0–67) | 108 (0–774) | 2.5 (0–10) | 0 (0–8) | 0 |
| 9 | 0 (0–9) | 0 (0–8) | 0 (0–33) | 0 (0–791) | 0 (0–10) | 0 (0–8) | 0 |
| 10 | 0 (0–30) | 0 (0–99) | 0 (0–86) | 0 (0–662) | 0 (0–10) | 0 (0–8) | 0 |
| 11 | 0 (0–75) | 0 (0–15) | 0 (0–77) | 0 (0–777) | 0 (0–10) | 0 (0–8) | 0 |
| 12 | 0 (0–18) | 0 (0–14) | 0 (0–1) | 0 (0–751) | 0 (0–10) | 0 (0–8) | 0 |
| 13 | 0 | 0 | 0 | 0 (0–347) | 0 (0–5) | 0 (0–8) | 0 |
| 14 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 15 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 16 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 17 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 18 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 19 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 20 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 21 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | depois do dia 21 | - | 0/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 4.5 | 3–5 | 20/20 |
| Segunda zona de caça liberada | 4.5 | 3–5 | 20/20 |
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
| 4 | 15 | 15 | 32 (31–32) | 4 | 4 |
| 5 | 19 (15–20) | 15 | 35 (35–37) | 4 (0–4) | 0 |
| 6 | 23 (19–23) | 15 (15–20) | 39 (38–40) | 4 (0–8) | 0 (0–4) |
| 7 | 26 (19–29) | 19 (15–23) | 41 (39–42) | 4 (0–8) | 0 (0–4) |
| 8 | 29 (19–32) | 19 (15–26) | 43 (41–45) | 4 (0–8) | 0 (0–4) |
| 9 | 29 (19–32) | 19 (15–29) | 46 (43–48) | 0 (0–4) | 0 (0–8) |
| 10 | 29 (19–32) | 19 (15–32) | 47 (44–51) | 0 (0–4) | 0 (0–4) |
| 11 | 30 (19–32) | 19 (15–32) | 50 (45–53) | 0 (0–4) | 0 (0–8) |
| 12 | 31 (19–34) | 21 (15–32) | 52 (47–54) | 0 (0–4) | 0 (0–4) |
| 13 | 31 (19–37) | 25 (15–32) | 53 (48–56) | 0 (0–4) | 0 (0–4) |
| 14 | 32 (19–39) | 28 (15–32) | 54 (49–57) | 0 (0–4) | 0 (0–4) |
| 15 | 32 (19–41) | 29 (15–34) | 55 (49–58) | 0 (0–4) | 0 (0–4) |
| 16 | 32 (19–41) | 29 (15–36) | 56 (50–59) | 0 (0–4) | 0 (0–4) |
| 17 | 33 (19–43) | 29 (15–39) | 56 (51–61) | 0 (0–8) | 0 (0–4) |
| 18 | 34 (19–44) | 29 (15–41) | 57 (52–62) | 2 (0–8) | 0 (0–4) |
| 19 | 35 (19–44) | 30 (15–43) | 58 (53–63) | 0 (0–4) | 0 (0–4) |
| 20 | 38 (19–46) | 32 (15–45) | 59 (55–64) | 4 (0–8) | 2 (0–4) |
| 21 | 39 (19–48) | 33 (15–46) | 60 (56–64) | 4 (0–8) | 4 (0–4) |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 | 0 | 0 | 50 | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (0–73) | 0 | 0 | 0 | 0 | 0 | 0 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–73) | 77 (0–90) | 0 | 0 (0–73) | 0 (0–73) | 0 | 0 (0–10) | 0 | 0 (0–10) | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 7 | 0 (0–89) | 0 (0–100) | 0 (0–98) | 0 (0–65) | 0 (0–90) | 0 | 10 (0–12) | 0 | 0 (0–12) | 6 (0–11) | 0 (0–5) | 0 (0–10) | 0 |
| 8 | 0 (0–107) | 0 (0–107) | 0 (0–110) | 0 | 0 (0–100) | 0 | 0 (0–12) | 0 (0–18) | 0 (0–12) | 6 (0–12) | 0 (0–6) | 6 (0–12) | 0 |
| 9 | 0 | 0 | 0 (0–110) | 0 (0–77) | 0 (0–166) | 0 (0–110) | 0 (0–12) | 0 | 0 (0–12) | 3 (0–12) | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 10 | 0 (0–107) | 0 | 0 (0–107) | 0 (0–120) | 0 | 0 (0–98) | 6 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |
| 11 | 0 (0–107) | 0 (0–120) | 0 | 0 (0–120) | 0 (0–166) | 0 | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 12 | 0 | 0 (0–116) | 0 (0–116) | 0 | 0 (0–77) | 0 (0–98) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 13 | 0 | 0 (0–116) | 0 (0–137) | 0 | 0 (0–100) | 0 | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |
| 14 | 0 (0–120) | 0 | 0 (0–147) | 0 (0–73) | 0 (0–89) | 0 (0–110) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |
| 15 | 0 (0–113) | 0 | 0 (0–137) | 0 | 0 | 0 (0–116) | 0 (0–12) | 0 (0–18) | 12 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 0 (0–12) |
| 16 | 0 | 0 (0–137) | 0 (0–122) | 0 | 0 (0–77) | 0 (0–122) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 0 (0–12) |
| 17 | 0 (0–107) | 0 (0–122) | 0 (0–160) | 0 (0–73) | 0 (0–89) | 0 (0–144) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 0 (0–12) |
| 18 | 0 (0–116) | 0 (0–137) | 0 (0–150) | 0 | 0 (0–100) | 0 (0–154) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 0 (0–12) |
| 19 | 0 | 0 | 0 (0–157) | 0 | 0 | 0 (0–160) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 20 | 0 | 0 | 125 (0–262) | 0 | 0 (0–86) | 0 (0–167) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 21 | 0 (0–130) | 0 | 66 (0–286) | 0 | 0 (0–90) | 45 (0–160) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |

#### Dia em que cada tier / planta é liberado (nível da profissão atingido no fim do dia; mediana entre seeds)

| Profissão | Tier / planta | Nível exigido | Dia |
| --: | --- | --- | --- |
| Mineração | copper | 1 | 1 |
| Mineração | iron | 10 | 3 |
| Mineração | silver | 25 | 7 (18/20) |
| Mineração | gold_ore | 50 | > dia 21 (0/20) |
| Mineração | obsidian | 70 | > dia 21 (0/20) |
| Lenhador | common_wood | 1 | 1 |
| Lenhador | oak_wood | 10 | 3 |
| Lenhador | ebony_wood | 25 | 9 (14/20) |
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
| steel_plate | T3 armor | 25 | silver (25) | - (0) | - | 3 | 7 (18/20) | BLOQUEIO (+4 d) |
| steel_greaves | T3 boots | 25 | silver (25) | - (0) | 1 | 3 | 7 (18/20) | BLOQUEIO (+4 d) |
| steel_gauntlets | T3 gloves | 25 | silver (25) | - (0) | 1 | 3 | 7 (18/20) | BLOQUEIO (+4 d) |
| steel_helm | T3 helmet | 25 | silver (25) | - (0) | - | 3 | 7 (18/20) | BLOQUEIO (+4 d) |
| gold_ring | T3 ring | 25 | silver (25) | - (0) | 20 | 3 | 7 (18/20) | BLOQUEIO (+4 d) |
| steel_kite_shield | T3 shield | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 (14/20) | BLOQUEIO (+10.5 d) |
| steel_greatsword | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 (14/20) | BLOQUEIO (+10.5 d) |
| steel_greataxe | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 (14/20) | BLOQUEIO (+10.5 d) |
| dragon_scale_armor | T4 armor | 45 | silver (25) | - (0) | - | 10 | 7 (18/20) | ok |
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 15.5 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
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
| 4 | 15 | 15 | 32 (31–32) | 4 | 4 |
| 5 | 19 (15–20) | 19 | 35 (35–37) | 4 (0–4) | 4 |
| 6 | 23 (20–23) | 19 | 39 (38–40) | 4 (4–8) | 0 |
| 7 | 26 (20–26) | 23 | 41 (40–42) | 4 (0–4) | 4 |
| 8 | 29 (23–32) | 23 (23–26) | 43 (41–45) | 4 (4–8) | 0 (0–4) |
| 9 | 29 (23–32) | 26 (26–29) | 45 (43–47) | 0 (0–4) | 4 (4–8) |
| 10 | 31 (27–34) | 26 (26–32) | 48 (44–50) | 4 | 0 (0–4) |
| 11 | 31 (27–34) | 29 (29–34) | 50 (45–53) | 0 | 4 |
| 12 | 34 (30–37) | 29 (29–36) | 52 (46–54) | 4 | 0 (0–4) |
| 13 | 34 (30–38) | 32 (31–38) | 54 (47–56) | 0 (0–4) | 4 |
| 14 | 36 (32–40) | 32 (31–38) | 55 (48–57) | 4 | 0 |
| 15 | 36 (32–40) | 35 (34–40) | 56 (49–58) | 0 (0–4) | 4 |
| 16 | 38 (35–42) | 35 (34–40) | 57 (50–59) | 4 | 0 (0–4) |
| 17 | 38 (35–43) | 37 (36–42) | 58 (51–60) | 0 (0–4) | 4 |
| 18 | 41 (37–44) | 37 (36–43) | 59 (53–61) | 4 | 0 (0–4) |
| 19 | 41 (38–46) | 40 (38–44) | 59 (53–63) | 0 (0–4) | 4 |
| 20 | 42 (41–48) | 40 (38–46) | 60 (55–63) | 4 (4–8) | 0 (0–4) |
| 21 | 43 (41–48) | 42 (40–48) | 61 (56–64) | 0 (0–4) | 4 |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 | 0 | 0 | 50 | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (0–73) | 0 | 0 | 0 | 65 | 0 | 0 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–73) | 79 (0–90) | 0 | 0 | 0 | 0 | 0 (0–10) | 0 | 0 | 10 (5–10) | 0 | 0 | 0 |
| 7 | 0 (0–100) | 45 (0–89) | 0 | 0 (0–86) | 77 (0–86) | 0 | 0 (0–12) | 0 | 5 (0–12) | 3 (0–11) | 0 (0–5) | 0 (0–12) | 0 |
| 8 | 0 (0–89) | 0 (0–107) | 98 (0–110) | 0 (0–100) | 0 (0–100) | 0 | 0 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 (0–6) | 12 (0–12) | 0 |
| 9 | 0 | 0 | 0 (0–110) | 0 (0–100) | 89 (0–100) | 0 (0–110) | 6 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 | 6 (0–12) | 0 (0–6) |
| 10 | 0 (0–107) | 0 (0–107) | 107 (0–120) | 0 (0–120) | 0 | 0 (0–98) | 0 (0–12) | 0 | 0 (0–12) | 0 (0–6) | 0 | 0 (0–12) | 6 (0–12) |
| 11 | 0 | 0 | 0 | 0 | 0 | 107 (98–116) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 | 0 (0–12) | 6 (0–12) |
| 12 | 0 (0–127) | 0 | 113 (0–137) | 0 (0–122) | 0 | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 13 | 0 (0–144) | 0 | 0 | 0 (0–107) | 0 | 120 (0–137) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 14 | 0 | 0 | 122 (110–137) | 0 | 0 | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 15 | 0 (0–128) | 0 (0–128) | 0 | 0 (0–127) | 0 | 130 (0–147) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 16 | 0 | 0 (0–131) | 134 (0–154) | 0 | 0 | 0 (0–131) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 17 | 0 (0–154) | 0 | 0 (0–160) | 0 | 0 | 137 (122–154) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 18 | 0 | 0 | 146 (125–167) | 0 | 0 | 0 (0–160) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |
| 19 | 0 (0–147) | 0 | 0 (0–152) | 0 (0–147) | 0 | 147 (0–167) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 20 | 0 (0–143) | 0 (0–154) | 153 (0–177) | 0 (0–137) | 0 | 0 (0–171) | 6 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 21 | 0 | 0 (0–164) | 0 (0–164) | 0 | 0 | 150 (134–177) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |

#### Dia em que cada tier / planta é liberado (nível da profissão atingido no fim do dia; mediana entre seeds)

| Profissão | Tier / planta | Nível exigido | Dia |
| --: | --- | --- | --- |
| Mineração | copper | 1 | 1 |
| Mineração | iron | 10 | 3 |
| Mineração | silver | 25 | 7 |
| Mineração | gold_ore | 50 | > dia 21 (0/20) |
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
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | 20 (10/20) | > dia 21 (0/20) | ok |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | 20 (10/20) | > dia 21 (0/20) | ok |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | 20 (10/20) | > dia 21 (0/20) | ok |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | 20 (10/20) | > dia 21 (0/20) | ok |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | 20 (10/20) | > dia 21 (0/20) | ok |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | 20 (10/20) | > dia 21 (0/20) | ok |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 20 (10/20) | > dia 21 (0/20) | ok |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | 20 (10/20) | > dia 21 (0/20) | ok |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 20 (10/20) | > dia 21 (0/20) | ok |
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
| weapon | 2 | 4 | 10 |
| armor | 2 | 5 | 11 (19/20) |
| gloves | 2 | 5 (19/20) | 8.5 (18/20) |
| boots | 3 | 5 (18/20) | 13 (14/20) |
| ring | 3 | 6 (18/20) | 16.5 (12/20) |
| helmet | 2 | 5 (19/20) | 11 (16/20) |
| shield | 3 | 5 | 10.5 |

### Controle dos tônicos: cenário A sem tônicos contra cenário A (a mesma seed)

|  | Chefe 25 vencido (dia por seed) | Andar 50 alcançado (dia por seed) | CP no dia 14 (mediana) | Nível no dia 14 |
| --: | --- | --- | --- | --- |
| Com tônicos (A) | 3 4 4 4 4 4 4 4 4 5 5 5 5 5 5 5 5 5 6 6 | 9 10 10 10 10 10 10 12 12 13 13 14 14 14 15 15 17 19 20 20 | 1 284 | 49 |
| Sem tônicos | 3 4 4 4 4 4 4 4 4 5 5 5 5 5 5 5 5 5 6 6 | 9 9 10 10 10 12 12 14 14 14 15 15 15 15 16 17 17 19 20 - | 1 265 | 49 |

| Dia em que a porta abre (mediana) | Com tônicos (A) | Sem tônicos |
| --: | --- | --- |
| iron (Mineração 10) | 3 | 3 |
| silver (Mineração 25) | 7 (18/20) | 7 (16/20) |
| gold_ore (Mineração 50) | > dia 21 (0/20) | > dia 21 (0/20) |
| oak_wood (Lenhador 10) | 3 | 3 |
| ebony_wood (Lenhador 25) | 9 (14/20) | 10 (13/20) |
| elven_wood (Lenhador 50) | > dia 21 (0/20) | > dia 21 (0/20) |

### Passe de Aventureiro: dono (P) contra não-dono (A), mesma política e mesmas seeds (só as vantagens do Passe; a trilha não é resgatada)

| Quando | Medida (mediana entre seeds) | Sem Passe (A) | Com Passe (P) | Diferença do dono |
| --: | --- | --- | --- | --- |
| dia 7 | materiais recebidos por dia (média dos dias 1 até aqui) | 223 | 361 | +61.5% |
| dia 7 | materiais recebidos naquele dia | 399 | 673 | +68.8% |
| dia 7 | valor de referência dos materiais por dia (ouro) | 926 | 1 550 | +67.4% |
| dia 7 | valor de referência dos materiais naquele dia (ouro) | 1 960 | 3 368 | +71.8% |
| dia 7 | ouro ganho por dia (média dos dias 1 até aqui) | 866 | 1 041 | +20.2% |
| dia 7 | ouro ganho naquele dia | 330 | 656 | +98.6% |
| dia 7 | nível | 40 | 43 | +6.3% |
| dia 7 | CP | 811 | 961 | +18.6% |
| dia 7 | andar mais alto (highestDungeonFloor) | 30 | 34 | +13.3% |
| dia 14 | materiais recebidos por dia (média dos dias 1 até aqui) | 435 | 663 | +52.5% |
| dia 14 | materiais recebidos naquele dia | 850 | 1 049 | +23.4% |
| dia 14 | valor de referência dos materiais por dia (ouro) | 2 245 | 3 378 | +50.5% |
| dia 14 | valor de referência dos materiais naquele dia (ouro) | 4 695 | 5 906 | +25.8% |
| dia 14 | ouro ganho por dia (média dos dias 1 até aqui) | 629 | 1 107 | +75.9% |
| dia 14 | ouro ganho naquele dia | 274 | 527 | +92.2% |
| dia 14 | nível | 49 | 51 | +5.2% |
| dia 14 | CP | 1 284 | 1 535 | +19.5% |
| dia 14 | andar mais alto (highestDungeonFloor) | 50 | 56 | +12% |

| Marco | Dia sem Passe (mediana) | Dia com Passe (mediana) | Dono adiantado em (dias) |
| --: | --- | --- | --- |
| primeira peça forjada | 2 | 2 | 0 |
| checkpoint 10 | 1 | 1 | 0 |
| segunda zona de caça | 5 | 4 | 1 |
| chefe 25 vencido | 5 | 4 | 1 |
| chegada ao andar 50 | 13 | 11.5 | 1.5 |
| chefe 50 vencido | 18.5 | 14 | 4.5 |

### Habilidades: os três caminhos (Guerreiro = cenário A, Guardião, Caçador) contra o mesmo jogador sem habilidades (Z), mesma política e mesmas seeds

| Quando | Medida (mediana entre seeds) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- | --- |
| dia 7 | materiais recebidos por dia (média dos dias 1 até aqui) | 227 | 223 (-1.9%) | 211 (-7.1%) | 208 (-8.5%) |
| dia 7 | valor de referência dos materiais por dia (ouro) | 953 | 926 (-2.8%) | 898 (-5.8%) | 862 (-9.5%) |
| dia 7 | ouro ganho por dia (média dos dias 1 até aqui) | 884 | 866 (-2%) | 886 (+0.3%) | 868 (-1.8%) |
| dia 7 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 42 | 43 (+2.9%) | 46 (+8%) | 43 (+1.4%) |
| dia 7 | nível | 40 | 40 (+1.3%) | 39 (-1.3%) | 38 (-3.8%) |
| dia 7 | CP | 740 | 811 (+9.6%) | 848 (+14.6%) | 767 (+3.7%) |
| dia 7 | andar mais alto | 30 | 30 (+0%) | 30 (+0%) | 30 (+0%) |
| dia 14 | materiais recebidos por dia (média dos dias 1 até aqui) | 378 | 435 (+15.1%) | 393 (+3.9%) | 421 (+11.3%) |
| dia 14 | valor de referência dos materiais por dia (ouro) | 1 828 | 2 245 (+22.8%) | 1 956 (+7%) | 2 072 (+13.3%) |
| dia 14 | ouro ganho por dia (média dos dias 1 até aqui) | 606 | 629 (+3.9%) | 643 (+6.2%) | 617 (+1.9%) |
| dia 14 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 52 | 60 (+16.9%) | 64 (+23.4%) | 57 (+11.3%) |
| dia 14 | nível | 48 | 49 (+1%) | 48 (+0%) | 48 (+0%) |
| dia 14 | CP | 1 146 | 1 284 (+12.1%) | 1 256 (+9.6%) | 1 178 (+2.8%) |
| dia 14 | andar mais alto | 40 | 50 (+25%) | 50 (+25%) | 40 (+0%) |

| Marco (dia, mediana) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- |
| primeira peça forjada | 2 | 2 | 2 | 2 |
| checkpoint 10 | 1 | 1 | 1 | 1 |
| segunda zona de caça | 5 | 5 | 5 | 5 |
| chefe 25 vencido | 5 | 5 | 5 | 5 |
| chegada ao andar 50 | 15.5 | 13 | 13.5 | 15 |
| chefe 50 vencido | depois do dia 21 | 18.5 | 17.5 | depois do dia 21 |

### Diagnóstico do chefe do andar 25

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário A)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 1 (1–2) | 120 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 5 (3–6) | 503 (366–595) | arma T2 / armadura T2, nível 33 (28–36) | 20/20 seeds |

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
| 25 | 200 × 23 = 4 600 | 760 × 171 = 129 960 | 1 311 × 164 = 215 004 | 46.74 | 28.3 |
| 50 | 2 263 × 277 = 626 851 | 5 517 × 267 = 1 473 039 | 2 652 × 343 = 909 636 | 1.45 | 2.3 |
| 75 | 3 728 × 478 = 1 781 984 | 9 084 × 436 = 3 960 624 | 8 759 × 441 = 3 862 719 | 2.17 | 2.2 |
| 100 | 11 226 × 563 = 6 320 238 | 14 279 × 682 = 9 738 278 | - | - | 1.5 |
