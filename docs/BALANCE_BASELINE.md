> **2026-10-11 (rodada 7, habilidades):** o relatório completo abaixo foi regerado com habilidades (cenário A = Guerreiro) e os inimigos retunados (orcs hp 310 / dmg 46, chefe 25 em 0,30, chefe 50 em 0,88, tabela de CP); o texto de resumo e a política acima descrevem o baseline anterior. Detalhes em `BALANCE_CHANGES.md` (Rodada 7).

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

Gerado por `npm run sim` depois da rodada 7 (habilidades, números finais). Cada célula é mediana (mín–máx) entre as 20 seeds. O jogador do cenário A gasta os pontos de habilidade no Guerreiro; a seção "Habilidades" compara os três caminhos com o mesmo jogador sem habilidades (Z).

### Metas de balanceamento (T2 a T8) e do inventário (I1 a I4)

| Meta | Critério | Cenário A (pedido) | Resultado |
| --- | --- | --- | --- |
| T2 | Primeira sessão da conta nova termina no andar ≥ 8; checkpoint do andar 10 no dia 1 | andar 8; checkpoint 10 no dia 1 | ok |
| T3 | Primeira peça forjada no dia 1 ou 2 | dia 2 | ok |
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–29 / 45–60) | 13 / 29 (25–33) / 49 (47–52) | ok |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 4; vitória ao chegar: 0% | ok |
| T6 | Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16 | chegada: primeira seed no dia 9, mediana 14; chefe 50: primeira seed no dia 9, mediana 16.5, 13/20 em 21 dias | chegada FORA DA META; chefe FORA DA META |
| T7 | Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75 | menor razão (N+1)/(N−1): 1.15 | ok |
| T8 | Derrota mantém 75% do ouro da sessão | 75% | ok |
| I1 | Com 2 visitas por dia, o inventário enche pela primeira vez entre os dias 3 e 6 (não no dia 1, não nunca), no ritmo de quem não arruma | dia 6 (mín–máx 5–6; 20/20 seeds); jogador atento: 1/20 seeds chegam a encher antes de arrumar | ok |
| I2 | Jogador atento perde menos de 5% dos materiais por transbordo | mediana 1.07% · pior seed 14.05% | ok |
| I3 | Jogador que ignora o inventário sente: perde pelo menos 10% dos materiais | mediana 48.2% · pior seed 80.7% · melhor seed 25.1% | ok |
| I4 | Ouro do mercador (vendendo todo o excesso do dia) no máximo ~35% do ouro diário de antes do mercador (424 / 521 / 483), nos dias 3, 7 e 14 | dia 3: +0% · dia 7: +21.5% · dia 14: +26.3% | ok |

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 129 | 25 | 0 | 0 |
| 2 | 23 (23–24) | 320 (293–413) | 25 | 1 (1–2) | 1 (1–2) |
| 3 | 29 (25–33) | 450 (380–547) | 25 (25–26) | 1 (1–2) | 1 (1–2) |
| 4 | 32 (28–33) | 646 (439–798) | 26 (25–27) | 2 (1–2) | 1 (1–2) |
| 5 | 36 (32–37) | 817 (623–1 123) | 29 (25–32) | 2 (2–3) | 2 (1–3) |
| 6 | 39 (34–41) | 924 (806–1 150) | 30 (28–38) | 2 (2–3) | 2 (1–3) |
| 7 | 41 (35–43) | 942 (816–1 283) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 8 | 42 (35–45) | 984 (816–1 349) | 30 (30–42) | 2 (2–3) | 2 (1–3) |
| 9 | 44 (35–47) | 1 103 (897–1 855) | 32 (30–51) | 2 (2–3) | 2 (1–3) |
| 10 | 45 (40–48) | 1 159 (946–1 903) | 40 (30–66) | 3 (2–3) | 3 (1–3) |
| 11 | 46 (42–49) | 1 251 (959–1 903) | 40 (30–70) | 3 (2–3) | 3 (2–3) |
| 12 | 47 (44–49) | 1 311 (1 027–1 923) | 40 (30–70) | 3 (2–3) | 3 (2–3) |
| 13 | 48 (46–50) | 1 345 (1 047–1 958) | 40 (30–75) | 3 (2–3) | 3 (2–3) |
| 14 | 49 (47–52) | 1 377 (1 057–2 135) | 50 (40–75) | 3 (2–3) | 3 (2–3) |
| 15 | 50 (47–53) | 1 413 (1 134–2 153) | 50 (40–75) | 3 (2–3) | 3 (2–3) |
| 16 | 50 (48–53) | 1 705 (1 148–2 153) | 51 (40–75) | 3 (2–3) | 3 (2–3) |
| 17 | 50 (48–53) | 1 806 (1 148–2 153) | 60 (40–75) | 3 (2–3) | 3 (2–3) |
| 18 | 51 (48–54) | 1 812 (1 159–2 153) | 64 (40–75) | 3 (2–3) | 3 (2–3) |
| 19 | 51 (49–54) | 1 837 (1 159–2 153) | 65 (40–75) | 3 (2–3) | 3 (2–3) |
| 20 | 52 (49–54) | 1 892 (1 181–2 153) | 69 (40–75) | 3 (2–3) | 3 (2–3) |
| 21 | 52 (49–55) | 1 908 (1 181–2 153) | 70 (40–75) | 3 (2–3) | 3 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 668 | 2 668 | 0 | 0 |
| 2 | 6 995 (6 995–8 495) | 0 | 6 995 | 0 (0–1 500) |
| 3 | 11 209 (2 625–22 960) | 0 (0–632) | 0 | 11 209 (2 625–22 960) |
| 4 | 2 372 (0–10 372) | 68 (0–767) | 0 | 1 740 (0–9 605) |
| 5 | 21 943 (10 522–25 791) | 491 (0–1 190) | 18 835 (9 096–18 849) | 4 250 (0–11 972) |
| 6 | 20 282 (0–40 283) | 212 (0–1 460) | 18 838 (0–37 682) | 1 388 (0–14 763) |
| 7 | 20 591 (0–39 343) | 0 (0–1 805) | 18 840 (0–37 692) | 553 (0–11 573) |
| 8 | 19 686 (0–42 995) | 0 (0–1 805) | 18 841 (0–37 687) | 195 (0–9 350) |
| 9 | 30 913 (0–47 845) | 0 (0–2 812) | 28 250 (0–37 689) | 870 (0–9 350) |
| 10 | 37 679 (390–42 476) | 346 (0–3 665) | 37 676 (0–37 698) | 390 (0–9 520) |
| 11 | 37 679 (6 713–41 329) | 0 (0–3 293) | 37 669 (0–37 690) | 325 (0–5 675) |
| 12 | 37 685 (0–40 790) | 0 (0–2 705) | 37 678 (0–37 696) | 0 (0–4 810) |
| 13 | 38 053 (6 597–76 678) | 174 (0–2 812) | 37 681 (0–72 488) | 0 (0–11 747) |
| 14 | 38 009 (4 845–72 845) | 102 (0–4 703) | 37 681 (0–72 520) | 0 (0–10 267) |
| 15 | 37 674 (2 700–72 897) | 0 (0–2 441) | 37 674 (0–72 507) | 195 (0–4 980) |
| 16 | 37 676 (0–43 545) | 0 (0–2 807) | 37 668 (0–37 697) | 0 (0–4 505) |
| 17 | 37 681 (0–74 468) | 0 (0–4 810) | 37 669 (0–72 470) | 0 (0–9 095) |
| 18 | 37 176 (0–72 468) | 0 (0–2 180) | 36 249 (0–72 468) | 0 (0–12 438) |
| 19 | 36 243 (0–41 843) | 0 (0–1 565) | 36 232 (0–37 686) | 195 (0–12 643) |
| 20 | 19 682 (0–39 866) | 0 (0–2 180) | 18 119 (0–37 689) | 0 (0–1 815) |
| 21 | 37 433 (0–75 774) | 0 (0–740) | 36 251 (0–72 472) | 390 (0–15 908) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.4 | 30 | 100% |
| 2 | 0 | 5 (5–6) | 100% |
| 3 | 0 (0–0.1) | 7 (6–9) | 99% |
| 4 | 0.1 (0–0.2) | 8 (7–10) | 96% |
| 5 | 0.3 (0–0.6) | 10 (8–13) | 96% |
| 6 | 0.2 (0–0.8) | 10 (7–12) | 100% |
| 7 | 0 (0–1) | 9 (7–14) | 100% |
| 8 | 0 (0–1) | 9 (7–16) | 100% |
| 9 | 0 (0–1.1) | 9 (7–15) | 100% |
| 10 | 0.2 (0–1.5) | 10 (7–17) | 100% |
| 11 | 0 (0–1.4) | 10 (7–17) | 100% |
| 12 | 0 (0–1) | 10 (5–17) | 100% |
| 13 | 0.1 (0–1.1) | 10 (7–17) | 99% |
| 14 | 0.1 (0–1.9) | 9 (7–19) | 100% |
| 15 | 0 (0–0.9) | 9 (6–16) | 99% |
| 16 | 0 (0–1.1) | 9 (7–16) | 100% |
| 17 | 0 (0–2) | 10 (6–21) | 99% |
| 18 | 0 (0–0.9) | 9 (6–16) | 100% |
| 19 | 0 (0–0.5) | 8 (6–14) | 100% |
| 20 | 0 (0–0.8) | 9 (7–14) | 100% |
| 21 | 0 (0–0.3) | 9 (6–14) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 425 (418–440) | 145 (138–160) | 0 | 0 | 0 | 280 | 300 (300–330) | 123 (105–134) |
| 2 | 411 (411–583) | 0 | 0 | 11 | 0 (0–52) | 400 (400–520) | 465 (380–610) | 73 (64–159) |
| 3 | 705 (310–4 013) | 0 (0–48) | 0 (0–2 000) | 0 | 337 (90–687) | 220 (220–1 300) | 585 (285–880) | 235 (10–3 203) |
| 4 | 1 315 (100–3 662) | 5 (0–64) | 0 (0–2 000) | 0 | 62 (0–302) | 1 160 (100–1 300) | 2 603 (65–3 598) | 301 (120–876) |
| 5 | 568 (175–3 734) | 42 (0–96) | 0 (0–2 000) | 24 (11–27) | 134 (0–364) | 300 (100–1 300) | 1 083 (245–3 723) | 251 (104–1 563) |
| 6 | 347 (100–2 737) | 17 (0–138) | 0 (0–2 000) | 26 (0–54) | 50 (0–469) | 120 (0–300) | 290 (0–1 730) | 460 (134–1 549) |
| 7 | 279 (100–655) | 0 (0–128) | 0 | 26 (0–52) | 23 (0–362) | 120 (0–300) | 45 (0–1 460) | 636 (142–1 431) |
| 8 | 205 (0–551) | 0 (0–146) | 0 | 26 (0–52) | 8 (0–308) | 60 (0–220) | 0 (0–605) | 818 (114–1 659) |
| 9 | 401 (134–6 095) | 0 (0–242) | 0 (0–5 000) | 37 (0–54) | 33 (0–307) | 120 (0–680) | 585 (0–3 716) | 391 (16–5 064) |
| 10 | 413 (139–6 091) | 30 (0–313) | 0 (0–5 000) | 48 (0–54) | 16 (0–313) | 200 (0–680) | 390 (0–3 080) | 316 (100–5 637) |
| 11 | 376 (151–6 164) | 0 (0–308) | 0 (0–5 000) | 48 (0–52) | 13 (0–200) | 150 (0–680) | 332 (0–3 225) | 360 (113–5 856) |
| 12 | 235 (124–6 261) | 0 (0–269) | 0 (0–5 000) | 49 (0–54) | 0 (0–168) | 40 (0–800) | 155 (0–1 790) | 426 (191–5 615) |
| 13 | 339 (170–6 323) | 12 (0–290) | 0 (0–5 000) | 50 (0–96) | 0 (0–389) | 100 (0–800) | 475 (0–2 865) | 528 (240–5 600) |
| 14 | 373 (172–1 204) | 6 (0–415) | 0 | 50 (0–96) | 0 (0–335) | 110 (0–450) | 280 (0–4 980) | 648 (150–3 956) |
| 15 | 304 (174–6 147) | 0 (0–243) | 0 (0–5 000) | 49 (0–96) | 9 (0–175) | 120 (0–800) | 245 (0–2 680) | 963 (253–4 583) |
| 16 | 325 (100–6 116) | 0 (0–261) | 0 (0–5 000) | 48 (0–54) | 0 (0–155) | 100 (0–800) | 500 (0–3 545) | 950 (125–5 269) |
| 17 | 324 (182–6 495) | 0 (0–456) | 0 (0–5 000) | 48 (0–102) | 0 (0–312) | 110 (0–830) | 425 (0–3 690) | 1 814 (56–4 927) |
| 18 | 287 (0–6 088) | 0 (0–208) | 0 (0–5 000) | 49 (0–102) | 0 (0–413) | 100 (0–680) | 318 (0–2 775) | 1 913 (6–4 262) |
| 19 | 305 (136–762) | 0 (0–133) | 0 | 48 (0–53) | 9 (0–419) | 110 (0–300) | 220 (0–1 685) | 1 872 (46–3 892) |
| 20 | 189 (0–661) | 0 (0–198) | 0 | 24 (0–52) | 0 (0–71) | 0 (0–300) | 210 (0–1 740) | 1 558 (46–4 020) |
| 21 | 305 (100–798) | 0 (0–80) | 0 | 49 (0–106) | 17 (0–526) | 120 (0–300) | 215 (0–1 320) | 1 720 (109–3 645) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 2 160 · estações 2 230 · forja 1 998 · refino 3 300 · alquimia 1 730 · baú 785 · mochila 1 750 · reparo 185

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 | 2 | 0 | 0% | 0 | 0 | 0 | 0 | 425 (418–440) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 411 (411–583) | 0 / 0 |
| 3 | 26 | 10 (10–12) | 10 (10–12) | 0 | 0% | 0 | 0 | 0 | 0 | 705 (310–4 013) | 0 / 0 |
| 4 | 26 | 15 (12–18) | 15 (12–18) | 0 | 0% | 0 | 0 | 0 | 0 | 1 315 (100–3 662) | 0 / 0 |
| 5 | 26 (26–30) | 21 (14–25) | 22 (16–25) | 0 | 0% | 187 (0–272) | 83 (0–104) | 0 (0–121) | 83 (0–104) | 492 (127–3 734) | 0 (0–1) / 6 (0–13) |
| 6 | 26 (26–30) | 21 (16–26) | 22 (18–26) | 0 | 0% | 294 (30–504) | 104 (0–112) | 121 (0–274) | 104 (0–112) | 246 (0–2 639) | 0 (0–1) / 10 (6–18) |
| 7 | 26 (26–30) | 22 (19–27) | 22 (19–27) | 0 | 0% | 254 (0–582) | 112 (0–116) | 197 (0–423) | 112 (0–116) | 169 (0–571) | 0 (0–1) / 13 (7–20) |
| 8 | 26 (26–30) | 21 (18–24) | 22 (19–27) | 0 | 0% | 296 (0–519) | 114 (0–120) | 217 (0–673) | 114 (0–120) | 94 (0–437) | 0 (0–1) / 16 (7–20) |
| 9 | 28 (26–35) | 22 (14–30) | 23 (20–30) | 0 (0–134) | 0% | 176 (0–486) | 118 (45–124) | 284 (0–859) | 118 (45–124) | 294 (24–5 971) | 0 (0–1) / 20 (12–22) |
| 10 | 30 (26–40) | 23 (17–32) | 23 (19–32) | 0 (0–367) | 0% | 34 (0–724) | 117 (0–126) | 312 (0–790) | 120 (0–126) | 295 (48–5 971) | 1 (0–2) / 20 (13–30) |
| 11 | 30 (26–40) | 23 (16–28) | 25 (19–32) | 0 (0–677) | 0% | 323 (0–757) | 119 (0–128) | 339 (0–869) | 122 (0–128) | 254 (27–6 040) | 1 (0–2) / 22 (17–34) |
| 12 | 30 (26–40) | 23 (17–35) | 24 (19–35) | 0 | 0% | 344 (0–701) | 122 (0–128) | 356 (0–944) | 123 (0–128) | 117 (0–6 135) | 1 (0–2) / 29 (20–40) |
| 13 | 30 (26–40) | 24 (20–32) | 24 (20–35) | 0 (0–164) | 0% | 145 (0–1 223) | 123 (44–130) | 546 (13–1 020) | 125 (122–130) | 211 (48–6 195) | 2 (0–2) / 30 (20–40) |
| 14 | 30 (26–45) | 24 (18–37) | 25 (20–37) | 0 (0–232) | 0% | 116 (0–633) | 126 (44–134) | 629 (0–989) | 127 (107–134) | 240 (48–1 074) | 2 (0–2) / 32 (20–40) |
| 15 | 30 (26–45) | 26 (22–40) | 26 (23–40) | 0 (0–1 274) | 0% | 10 (0–559) | 125 (0–136) | 618 (0–1 006) | 128 (0–136) | 221 (48–6 019) | 2 (0–2) / 33 (20–40) |
| 16 | 35 (30–45) | 29 (24–40) | 29 (24–40) | 0 (0–126) | 0% | 8 (0–743) | 46 (0–136) | 541 (0–908) | 130 (0–136) | 214 (0–5 982) | 2 (0–2) / 38 (20–40) |
| 17 | 40 (30–45) | 31 (21–40) | 32 (24–40) | 0 (0–1 200) | 0% | 6 (0–576) | 87 (0–136) | 324 (0–1 024) | 130 (0–136) | 251 (50–6 359) | 2 (0–2) / 40 (20–40) |
| 18 | 40 (30–45) | 34 (22–40) | 35 (24–40) | 0 (0–218) | 0% | 44 (0–839) | 47 (0–136) | 406 (0–922) | 131 (0–138) | 157 (0–5 956) | 2 (0–2) / 40 (19–40) |
| 19 | 40 (30–45) | 33 (25–40) | 34 (25–41) | 0 (0–158) | 0% | 17 (0–681) | 130 (0–136) | 530 (0–947) | 132 (0–136) | 170 (0–630) | 2 (0–2) / 40 (20–40) |
| 20 | 40 (30–45) | 33 (24–39) | 35 (25–40) | 0 (0–260) | 0% | 16 (0–997) | 128 (0–134) | 336 (0–984) | 132 (0–138) | 52 (0–529) | 2 (0–2) / 40 (20–40) |
| 21 | 40 (30–45) | 35 (25–40) | 36 (25–40) | 0 (0–190) | 0% | 18 (0–570) | 129 (0–140) | 590 (0–923) | 134 (0–140) | 206 (0–664) | 2 (0–2) / 40 (20–40) |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 0 | 4 |
| 2 | 204 (183–223) | 64 (51–89) | 6 (1–10) | 0 | 4 | 4 | 0 |
| 3 | 70 | 0 | 0 | 0 | 0 | 4 | 4 |
| 4 | 100 | 0 | 0 | 0 | 0 | 4 | 4 |
| 5 | 257 (229–294) | 172 (138–204) | 33 (22–49) | 0 | 5 (4–5) | 4 | 0 |
| 6 | 256 (142–412) | 182 (0–411) | 42 (0–85) | 0 | 5 (0–10) | 4 (0–4) | 0 (0–4) |
| 7 | 271 (89–446) | 188 (0–443) | 45 (0–99) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 8 | 247 (89–429) | 294 (0–462) | 51 (0–111) | 0 | 5 (0–10) | 4 (0–4) | 0 (0–8) |
| 9 | 259 (0–480) | 338 (0–499) | 64 (0–111) | 0 (0–134) | 7.5 (0–10) | 0 (0–4) | 0 (0–8) |
| 10 | 345 (157–490) | 366 (0–481) | 78 (0–163) | 0 (0–367) | 10 (0–10) | 0 (0–4) | 0 (0–8) |
| 11 | 356 (134–526) | 383 (0–527) | 92 (0–117) | 0 (0–677) | 10 (0–10) | 0 (0–8) | 0 (0–4) |
| 12 | 402 (86–487) | 413 (0–690) | 86 (0–164) | 0 | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 13 | 408 (89–574) | 447 (122–1 123) | 92 (0–314) | 0 (0–164) | 10 (0–12) | 0 (0–8) | 0 (0–4) |
| 14 | 388 (0–491) | 446 (116–1 128) | 104 (0–341) | 0 (0–232) | 10 (0–12) | 0 (0–4) | 0 (0–4) |
| 15 | 372 (0–492) | 406 (0–529) | 93 (0–197) | 0 (0–1 274) | 10 (0–12) | 0 (0–4) | 0 (0–4) |
| 16 | 346 (0–473) | 421 (0–559) | 91 (0–127) | 0 (0–126) | 10 (0–10) | 0 (0–4) | 0 (0–4) |
| 17 | 138 (0–498) | 346 (0–768) | 90 (0–199) | 0 (0–1 200) | 10 (0–12) | 0 (0–4) | 0 (0–4) |
| 18 | 230 (0–494) | 407 (0–932) | 90 (0–259) | 0 (0–218) | 6 (0–12) | 0 (0–4) | 0 (0–4) |
| 19 | 201 (0–486) | 384 (0–682) | 75 (0–158) | 0 (0–158) | 6 (0–10) | 2 (0–8) | 0 (0–4) |
| 20 | 155 (0–496) | 344 (0–668) | 40 (0–148) | 0 (0–260) | 3 (0–10) | 0 (0–8) | 4 (0–4) |
| 21 | 260 (0–490) | 447 (0–938) | 96 (0–268) | 0 (0–190) | 6 (0–12) | 0 (0–4) | 0 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | 19.5 | 10–21 | 12/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 4 | 3–6 | 20/20 |
| Segunda zona de caça liberada | 4 | 3–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 14 | 9–18 | 17/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | 16.5 | 9–18 | 13/20 |
| Inventário cheio pela primeira vez (antes de qualquer arrumação) | depois do dia 21 | 15–15 | 1/20 |
| Primeira melhoria do Baú | 10 | 5–18 | 17/20 |
| Segunda melhoria do Baú | 13.5 | 10–20 | 17/20 |
| Terceira melhoria do Baú | depois do dia 21 | - | 0/20 |

Dia em que cada seed chegou ao andar 50 (ordenado): 9 9 9 11 12 12 13 13 14 14 14 16 16 16 16 17 18 - - -

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 57 | 8 / 8 / 8 / 8 / 8 | 8×20 |
| 2 | 85 | 27 | 10 / 10 / 10 / 10 / 10 | 10×20 |
| 3 | 89 | 20 | 11 / 11 / 11 / 11 / 11 | 11×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Cenário N (descuidado): o mesmo jogador que nunca guarda, vende, descarta nem expande o inventário

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 129 | 25 | 0 | 0 |
| 2 | 23 (23–24) | 320 (293–413) | 25 | 1 (1–2) | 1 (1–2) |
| 3 | 31 (25–33) | 457 (364–525) | 25 | 1 (1–2) | 1 (1–2) |
| 4 | 33 (28–36) | 644 (455–796) | 26 (25–30) | 2 (1–2) | 1 (1–2) |
| 5 | 36 (33–38) | 787 (673–1 266) | 29 (26–41) | 2 (2–3) | 2 (1–2) |
| 6 | 40 (35–41) | 879 (725–1 280) | 30 (28–49) | 2 (2–3) | 2 (1–3) |
| 7 | 42 (37–44) | 907 (735–1 280) | 30 (28–50) | 2 (2–3) | 2 (1–3) |
| 8 | 42 (37–46) | 923 (735–1 346) | 30 (28–53) | 2 (2–3) | 2 (1–3) |
| 9 | 42 (37–47) | 937 (735–1 360) | 30 (29–55) | 2 (2–3) | 2 (1–3) |
| 10 | 42 (37–47) | 939 (735–1 374) | 30 (29–57) | 2 (2–3) | 2 (1–3) |
| 11 | 42 (37–47) | 939 (735–1 374) | 30 (29–57) | 2 (2–3) | 2 (1–3) |
| 12 | 42 (37–47) | 939 (735–1 427) | 30 (29–58) | 2 (2–3) | 2 (1–3) |
| 13 | 42 (37–47) | 949 (735–1 456) | 31 (29–60) | 2 (2–3) | 2 (1–3) |
| 14 | 42 (38–49) | 949 (735–1 486) | 32 (30–60) | 2 (2–3) | 2 (1–3) |
| 15 | 42 (38–50) | 964 (735–1 514) | 33 (30–60) | 2 (2–3) | 2 (1–3) |
| 16 | 43 (38–50) | 964 (735–1 514) | 34 (30–60) | 2 (2–3) | 2 (1–3) |
| 17 | 43 (38–50) | 964 (735–1 514) | 35 (30–60) | 2 (2–3) | 2 (1–3) |
| 18 | 43 (38–50) | 964 (735–1 514) | 36 (30–60) | 2 (2–3) | 2 (1–3) |
| 19 | 43 (38–50) | 964 (735–1 514) | 38 (30–60) | 2 (2–3) | 2 (1–3) |
| 20 | 43 (38–50) | 964 (735–1 514) | 38 (30–60) | 2 (2–3) | 2 (1–3) |
| 21 | 43 (38–50) | 967 (735–1 514) | 38 (30–60) | 2 (2–3) | 2 (1–3) |

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 | 2 | 0 | 0% | 0 | 0 | 0 | 0 | 425 (418–440) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 411 (411–583) | 0 / 0 |
| 3 | 26 | 10 (10–13) | 10 (10–13) | 0 | 0% | 0 | 0 | 0 | 0 | 563 (310–1 893) | 0 / 0 |
| 4 | 26 | 15 (13–21) | 15 (13–21) | 0 | 0% | 0 | 0 | 0 | 0 | 3 399 (100–4 017) | 0 / 0 |
| 5 | 26 | 24 (17–26) | 24 (17–26) | 0 (0–184) | 0% | 0 | 0 | 0 | 0 | 483 (147–3 569) | 0 / 0 |
| 6 | 26 | 26 (25–26) | 26 | 348 (0–667) | 53.9% | 0 | 0 | 0 | 0 | 217 (0–564) | 0 / 0 |
| 7 | 26 | 26 (24–26) | 26 | 383 (0–940) | 95.8% | 0 | 0 | 0 | 0 | 182 (0–662) | 0 / 0 |
| 8 | 26 | 26 | 26 | 61 (0–1 038) | 26% | 0 | 0 | 0 | 0 | 52 (0–5 935) | 0 / 0 |
| 9 | 26 | 26 | 26 | 0 (0–1 123) | 0% | 0 | 0 | 0 | 0 | 166 (0–803) | 0 / 0 |
| 10 | 26 | 26 (25–26) | 26 | 0 (0–448) | 0% | 0 | 0 | 0 | 0 | 37 (0–857) | 0 / 0 |
| 11 | 26 | 26 (25–26) | 26 | 0 (0–307) | 0% | 0 | 0 | 0 | 0 | 0 (0–521) | 0 / 0 |
| 12 | 26 | 26 | 26 | 0 (0–588) | 0% | 0 | 0 | 0 | 0 | 0 (0–478) | 0 / 0 |
| 13 | 26 | 26 | 26 | 0 (0–1 472) | 0% | 0 | 0 | 0 | 0 | 13 (0–317) | 0 / 0 |
| 14 | 26 | 26 | 26 | 0 (0–1 613) | 0% | 0 | 0 | 0 | 0 | 87 (0–599) | 0 / 0 |
| 15 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–991) | 0% | 0 | 0 | 0 | 0 | 0 (0–201) | 0 / 0 |
| 16 | 26 | 26 | 26 | 0 (0–1 051) | 0% | 0 | 0 | 0 | 0 | 0 (0–174) | 0 / 0 |
| 17 | 26 | 26 | 26 | 0 (0–307) | 0% | 0 | 0 | 0 | 0 | 0 (0–166) | 0 / 0 |
| 18 | 26 | 26 | 26 | 0 (0–316) | 0% | 0 | 0 | 0 | 0 | 0 (0–210) | 0 / 0 |
| 19 | 26 | 26 | 26 | 0 (0–325) | 0% | 0 | 0 | 0 | 0 | 0 (0–435) | 0 / 0 |
| 20 | 26 | 26 (25–27) | 26 (25–27) | 0 (0–331) | 0% | 0 | 0 | 0 | 0 | 0 (0–5 588) | 0 / 0 |
| 21 | 26 | 26 (25–27) | 26 (25–27) | 0 (0–343) | 0% | 0 | 0 | 0 | 0 | 0 (0–269) | 0 / 0 |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 204 (183–223) | 64 (51–89) | 6 (1–10) | 0 | 4 | 0 | 4 |
| 3 | 70 (70–192) | 0 (0–137) | 0 (0–22) | 0 | 0 (0–4) | 4 (4–8) | 4 (0–4) |
| 4 | 100 (85–224) | 0 (0–204) | 0 (0–31) | 0 | 0 (0–4) | 4 (0–4) | 4 |
| 5 | 248 (65–299) | 160 (0–205) | 34 (0–46) | 0 (0–184) | 5 (0–5) | 4 (4–8) | 0 (0–4) |
| 6 | 83 (0–327) | 144 (0–311) | 63 (0–84) | 348 (0–667) | 10 (0–10) | 0 (0–8) | 0 (0–4) |
| 7 | 0 (0–82) | 0 (0–126) | 1 (0–36) | 383 (0–940) | 5 (0–10) | 0 (0–8) | 0 (0–4) |
| 8 | 0 (0–98) | 0 (0–113) | 0 (0–64) | 0 (0–1 038) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 9 | 0 | 0 | 0 (0–8) | 0 (0–1 123) | 0 (0–10) | 0 (0–8) | 0 (0–4) |
| 10 | 0 | 0 | 0 | 0 (0–448) | 0 (0–5) | 0 (0–8) | 0 (0–4) |
| 11 | 0 (0–159) | 0 (0–56) | 0 (0–44) | 0 (0–232) | 0 (0–5) | 0 (0–8) | 0 (0–4) |
| 12 | 0 (0–64) | 0 (0–128) | 0 (0–33) | 0 (0–532) | 0 (0–6) | 0 (0–8) | 0 (0–4) |
| 13 | 0 (0–6) | 0 (0–10) | 0 (0–30) | 0 (0–1 472) | 0 (0–12) | 0 (0–8) | 0 (0–4) |
| 14 | 0 | 0 (0–99) | 0 | 0 (0–1 613) | 0 (0–12) | 0 (0–8) | 0 (0–4) |
| 15 | 0 (0–6) | 0 (0–5) | 0 (0–51) | 0 (0–991) | 0 (0–10) | 0 (0–4) | 0 (0–4) |
| 16 | 0 | 0 | 0 | 0 (0–1 051) | 0 (0–10) | 0 (0–4) | 0 (0–4) |
| 17 | 0 | 0 | 0 | 0 | 0 | 0 (0–4) | 0 (0–4) |
| 18 | 0 | 0 | 0 | 0 | 0 | 0 (0–4) | 0 (0–4) |
| 19 | 0 | 0 | 0 | 0 | 0 | 0 (0–4) | 0 (0–4) |
| 20 | 0 | 0 | 0 | 0 | 0 | 0 (0–4) | 0 (0–4) |
| 21 | 0 | 0 | 0 | 0 | 0 | 0 (0–4) | 0 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | depois do dia 21 | - | 0/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 4 | 4–5 | 20/20 |
| Segunda zona de caça liberada | 4 | 4–5 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | depois do dia 21 | 7–11 | 2/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 8–20 | 2/20 |
| Inventário cheio pela primeira vez (antes de qualquer arrumação) | 6 | 5–6 | 20/20 |
| Primeira melhoria do Baú | depois do dia 21 | - | 0/20 |
| Segunda melhoria do Baú | depois do dia 21 | - | 0/20 |
| Terceira melhoria do Baú | depois do dia 21 | - | 0/20 |

Dia em que cada seed chegou ao andar 50 (ordenado): 7 11 - - - - - - - - - - - - - - - - - -

### Profissões, cenário A (pedido)

#### Nível das profissões por dia (mediana entre seeds, mín–máx)

| Dia | Mineração | Lenhador | Jardinagem | Horas min. | Horas cort. |
| --: | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 7 | 0 | 4 |
| 2 | 5 | 5 | 17 | 4 | 0 |
| 3 | 10 | 10 | 27 | 4 | 4 |
| 4 | 15 | 15 | 32 (31–32) | 4 | 4 |
| 5 | 19 (19–20) | 15 | 35 (34–37) | 4 | 0 |
| 6 | 23 (19–23) | 15 (15–20) | 39 (37–40) | 4 (0–4) | 0 (0–4) |
| 7 | 25 (19–29) | 15 (15–23) | 41 (39–42) | 4 (0–8) | 0 (0–4) |
| 8 | 28 (19–29) | 15 (15–26) | 44 (41–45) | 4 (0–4) | 0 (0–8) |
| 9 | 29 (19–31) | 15 (15–31) | 46 (43–48) | 0 (0–4) | 0 (0–8) |
| 10 | 29 (19–32) | 19 (15–32) | 48 (44–51) | 0 (0–4) | 0 (0–8) |
| 11 | 29 (19–34) | 19 (15–32) | 50 (45–54) | 0 (0–8) | 0 (0–4) |
| 12 | 30 (19–34) | 20 (15–32) | 52 (46–55) | 0 (0–4) | 0 (0–4) |
| 13 | 31 (19–36) | 20 (15–32) | 53 (48–57) | 0 (0–8) | 0 (0–4) |
| 14 | 32 (19–38) | 23 (15–32) | 55 (50–59) | 0 (0–4) | 0 (0–4) |
| 15 | 32 (19–40) | 26 (15–32) | 55 (51–60) | 0 (0–4) | 0 (0–4) |
| 16 | 32 (19–42) | 29 (15–35) | 56 (51–61) | 0 (0–4) | 0 (0–4) |
| 17 | 33 (19–44) | 29 (15–37) | 57 (52–62) | 0 (0–4) | 0 (0–4) |
| 18 | 34 (19–44) | 31 (15–39) | 58 (53–63) | 0 (0–4) | 0 (0–4) |
| 19 | 35 (19–46) | 32 (15–41) | 59 (54–64) | 2 (0–8) | 0 (0–4) |
| 20 | 36 (19–47) | 33 (15–43) | 60 (54–65) | 0 (0–8) | 4 (0–4) |
| 21 | 37 (19–49) | 33 (15–45) | 61 (55–66) | 0 (0–4) | 0 (0–4) |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 | 0 | 0 | 50 | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (65–73) | 0 | 0 | 0 | 0 | 0 | 10 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–86) | 77 (0–86) | 0 | 0 (0–73) | 0 (0–65) | 0 | 0 (0–10) | 0 | 0 (0–10) | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 7 | 0 | 83 (0–100) | 0 (0–98) | 0 (0–65) | 0 (0–80) | 0 | 0 (0–12) | 0 | 0 (0–12) | 5 (0–11) | 0 (0–6) | 0 (0–12) | 0 |
| 8 | 0 (0–89) | 0 (0–89) | 0 (0–98) | 0 | 0 (0–166) | 0 | 0 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 (0–6) | 0 (0–12) | 0 |
| 9 | 0 (0–107) | 0 | 0 (0–110) | 0 (0–107) | 0 (0–65) | 0 (0–110) | 0 (0–12) | 0 | 0 (0–12) | 0 (0–12) | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 10 | 0 (0–107) | 0 | 0 (0–107) | 0 (0–107) | 0 (0–166) | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |
| 11 | 0 (0–120) | 0 (0–89) | 0 (0–113) | 0 (0–65) | 0 | 0 (0–110) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 12 | 0 (0–107) | 0 (0–113) | 0 (0–113) | 0 (0–65) | 0 (0–86) | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |
| 13 | 0 | 0 (0–113) | 0 (0–137) | 0 | 0 (0–89) | 0 | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 14 | 0 (0–120) | 0 | 0 (0–128) | 0 | 0 (0–86) | 0 (0–110) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 15 | 0 | 0 (0–122) | 0 (0–134) | 0 | 0 (0–89) | 0 (0–120) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 16 | 0 (0–120) | 0 | 0 (0–140) | 0 | 0 (0–100) | 0 (0–116) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |
| 17 | 0 | 0 | 0 (0–164) | 0 | 0 | 0 (0–137) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 18 | 0 (0–127) | 0 (0–116) | 0 (0–150) | 0 (0–73) | 0 | 0 (0–147) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 19 | 0 (0–89) | 0 (0–77) | 0 (0–171) | 0 (0–73) | 0 | 0 (0–154) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 0 (0–12) |
| 20 | 0 (0–100) | 0 | 0 (0–177) | 0 | 0 (0–90) | 58 (0–154) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 21 | 0 | 0 | 0 (0–161) | 0 | 0 (0–89) | 0 (0–154) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |

#### Dia em que cada tier / planta é liberado (nível da profissão atingido no fim do dia; mediana entre seeds)

| Profissão | Tier / planta | Nível exigido | Dia |
| --: | --- | --- | --- |
| Mineração | copper | 1 | 1 |
| Mineração | iron | 10 | 3 |
| Mineração | silver | 25 | 7 (17/20) |
| Mineração | gold_ore | 50 | > dia 21 (0/20) |
| Mineração | obsidian | 70 | > dia 21 (0/20) |
| Lenhador | common_wood | 1 | 1 |
| Lenhador | oak_wood | 10 | 3 |
| Lenhador | ebony_wood | 25 | 10 (14/20) |
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
| steel_plate | T3 armor | 25 | silver (25) | - (0) | - | 3 | 7 (17/20) | BLOQUEIO (+4.5 d) |
| steel_greaves | T3 boots | 25 | silver (25) | - (0) | 1 | 3 | 7 (17/20) | BLOQUEIO (+4.5 d) |
| steel_gauntlets | T3 gloves | 25 | silver (25) | - (0) | 1 | 3 | 7 (17/20) | BLOQUEIO (+4.5 d) |
| steel_helm | T3 helmet | 25 | silver (25) | - (0) | - | 3 | 7 (17/20) | BLOQUEIO (+4.5 d) |
| gold_ring | T3 ring | 25 | silver (25) | - (0) | 20 | 3 | 7 (17/20) | BLOQUEIO (+4.5 d) |
| steel_kite_shield | T3 shield | 25 | silver (25) | ebony_wood (25) | - | 3 | 10 (14/20) | BLOQUEIO (+12 d) |
| steel_greatsword | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 10 (14/20) | BLOQUEIO (+12 d) |
| steel_greataxe | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 10 (14/20) | BLOQUEIO (+12 d) |
| dragon_scale_armor | T4 armor | 45 | silver (25) | - (0) | - | 10 | 7 (17/20) | ok |
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 15 (18/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
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
| 5 | 19 (15–20) | 19 (19–20) | 35 (35–37) | 4 (0–4) | 4 |
| 6 | 23 (19–23) | 19 (19–20) | 39 (37–40) | 4 | 0 |
| 7 | 25 (19–26) | 23 | 41 (39–42) | 2 (0–4) | 4 |
| 8 | 28 (23–29) | 23 (23–26) | 44 (42–45) | 4 | 0 (0–4) |
| 9 | 28 (23–31) | 26 (26–29) | 46 (44–47) | 0 (0–4) | 4 |
| 10 | 30 (26–34) | 26 (26–31) | 48 (45–50) | 4 | 0 (0–4) |
| 11 | 30 (26–34) | 29 (29–34) | 50 (46–52) | 0 (0–4) | 4 |
| 12 | 33 (29–36) | 29 (29–34) | 52 (47–54) | 4 | 0 |
| 13 | 34 (29–38) | 32 (31–36) | 54 (48–55) | 0 (0–4) | 4 |
| 14 | 36 (32–40) | 32 (31–36) | 55 (49–56) | 4 | 0 (0–4) |
| 15 | 36 (32–42) | 35 (34–38) | 56 (50–58) | 0 (0–4) | 4 |
| 16 | 38 (34–44) | 35 (34–40) | 57 (51–59) | 4 | 0 (0–4) |
| 17 | 39 (34–46) | 37 (36–42) | 58 (52–60) | 0 (0–4) | 4 |
| 18 | 41 (37–47) | 37 (36–44) | 59 (53–61) | 4 | 0 (0–4) |
| 19 | 41 (37–48) | 40 (38–46) | 60 (54–62) | 0 (0–4) | 4 |
| 20 | 43 (39–49) | 40 (38–47) | 60 (55–62) | 4 | 0 (0–4) |
| 21 | 43 (39–50) | 42 (40–49) | 61 (56–63) | 0 (0–4) | 4 |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 | 0 | 0 | 50 | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (0–73) | 0 | 0 | 0 | 65 (65–73) | 0 | 10 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–86) | 77 (0–86) | 0 | 0 | 0 | 0 | 0 (0–10) | 0 | 0 | 10 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 7 | 0 (0–89) | 0 (0–100) | 0 | 0 (0–86) | 77 (0–86) | 0 | 0 (0–12) | 0 | 0 (0–12) | 6 (0–11) | 0 (0–5) | 0 (0–12) | 0 |
| 8 | 0 | 39 (0–100) | 49 (0–110) | 0 (0–89) | 0 (0–100) | 0 | 0 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 (0–6) | 0 (0–12) | 0 |
| 9 | 0 | 0 (0–107) | 0 | 0 (0–89) | 89 (0–100) | 0 (0–98) | 0 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 (0–6) | 0 (0–12) | 0 (0–6) |
| 10 | 0 | 0 (0–107) | 107 (0–120) | 0 (0–107) | 0 | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 (0–6) | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 11 | 0 (0–113) | 0 | 0 (0–98) | 0 (0–98) | 0 | 107 (0–120) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 12 | 0 (0–116) | 0 | 113 (0–137) | 0 | 0 | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |
| 13 | 0 (0–116) | 0 (0–127) | 0 (0–128) | 0 | 0 | 120 (107–130) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 14 | 0 (0–137) | 0 (0–137) | 122 (0–150) | 0 | 0 | 0 (0–130) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |
| 15 | 0 (0–128) | 0 | 0 (0–157) | 0 (0–130) | 0 | 130 (0–140) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 16 | 0 | 0 (0–131) | 131 (0–164) | 0 | 0 | 0 (0–150) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 6 (0–12) |
| 17 | 0 | 0 (0–140) | 0 (0–152) | 0 | 0 | 139 (122–154) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 18 | 0 | 0 | 144 (134–171) | 0 | 0 | 0 (0–164) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 19 | 0 | 0 (0–143) | 0 (0–164) | 0 | 0 | 145 (128–171) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 0 (0–12) |
| 20 | 0 | 0 | 153 (131–184) | 0 | 0 | 0 (0–177) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 21 | 0 (0–137) | 0 | 0 (0–181) | 0 (0–137) | 0 | 156 (0–177) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |

#### Dia em que cada tier / planta é liberado (nível da profissão atingido no fim do dia; mediana entre seeds)

| Profissão | Tier / planta | Nível exigido | Dia |
| --: | --- | --- | --- |
| Mineração | copper | 1 | 1 |
| Mineração | iron | 10 | 3 |
| Mineração | silver | 25 | 7.5 |
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
| steel_plate | T3 armor | 25 | silver (25) | - (0) | - | 3 | 7.5 | BLOQUEIO (+4.5 d) |
| steel_greaves | T3 boots | 25 | silver (25) | - (0) | 1 | 3 | 7.5 | BLOQUEIO (+4.5 d) |
| steel_gauntlets | T3 gloves | 25 | silver (25) | - (0) | 1 | 3 | 7.5 | BLOQUEIO (+4.5 d) |
| steel_helm | T3 helmet | 25 | silver (25) | - (0) | - | 3 | 7.5 | BLOQUEIO (+4.5 d) |
| gold_ring | T3 ring | 25 | silver (25) | - (0) | 20 | 3 | 7.5 | BLOQUEIO (+4.5 d) |
| steel_kite_shield | T3 shield | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 | BLOQUEIO (+6 d) |
| steel_greatsword | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 | BLOQUEIO (+6 d) |
| steel_greataxe | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 9 | BLOQUEIO (+6 d) |
| dragon_scale_armor | T4 armor | 45 | silver (25) | - (0) | - | 12 | 7.5 | ok |
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | 19 (13/20) | > dia 21 (1/20) | BLOQUEIO (nunca em 21 d) |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | 19 (13/20) | > dia 21 (1/20) | BLOQUEIO (nunca em 21 d) |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | 19 (13/20) | > dia 21 (1/20) | BLOQUEIO (nunca em 21 d) |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | 19 (13/20) | > dia 21 (1/20) | BLOQUEIO (nunca em 21 d) |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | 19 (13/20) | > dia 21 (1/20) | BLOQUEIO (nunca em 21 d) |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | 19 (13/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 19 (13/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | 19 (13/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 19 (13/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
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

### Linha do tempo por slot: dia em que a primeira peça de cada tier aparece (cenário A, mediana)

| Slot | Tier 1 | Tier 2 | Tier 3 |
| --: | --- | --- | --- |
| weapon | 2 | 4 | 9.5 (18/20) |
| armor | 2 | 5 | 10 (19/20) |
| gloves | 2 | 5 (19/20) | 11 (16/20) |
| boots | 3 | 5 (18/20) | 14 (14/20) |
| ring | 3 | 5 (17/20) | 14 (12/20) |
| helmet | 2 | 5 (19/20) | 12 (14/20) |
| shield | 3 | 5 | 9.5 (18/20) |

### Controle dos tônicos: cenário A sem tônicos contra cenário A (a mesma seed)

|  | Chefe 25 vencido (dia por seed) | Andar 50 alcançado (dia por seed) | CP no dia 14 (mediana) | Nível no dia 14 |
| --: | --- | --- | --- | --- |
| Com tônicos (A) | 3 3 4 4 4 4 4 4 4 4 4 5 5 5 5 5 5 5 5 6 | 9 9 9 11 12 12 13 13 14 14 14 16 16 16 16 17 18 - - - | 1 377 | 49 |
| Sem tônicos | 3 3 4 4 4 4 4 4 4 4 5 5 5 5 5 5 5 5 5 6 | 8 9 9 10 10 11 11 11 12 12 12 12 13 14 14 16 16 16 17 17 | 1 570 | 49 |

| Dia em que a porta abre (mediana) | Com tônicos (A) | Sem tônicos |
| --: | --- | --- |
| iron (Mineração 10) | 3 | 3 |
| silver (Mineração 25) | 7 (17/20) | 8 (18/20) |
| gold_ore (Mineração 50) | > dia 21 (0/20) | > dia 21 (0/20) |
| oak_wood (Lenhador 10) | 3 | 3 |
| ebony_wood (Lenhador 25) | 10 (14/20) | 11 (17/20) |
| elven_wood (Lenhador 50) | > dia 21 (0/20) | > dia 21 (0/20) |

### Passe de Aventureiro: dono (P) contra não-dono (A), mesma política e mesmas seeds (só as vantagens do Passe; a trilha não é resgatada)

| Quando | Medida (mediana entre seeds) | Sem Passe (A) | Com Passe (P) | Diferença do dono |
| --: | --- | --- | --- | --- |
| dia 7 | materiais recebidos por dia (média dos dias 1 até aqui) | 273 | 374 | +37.3% |
| dia 7 | materiais recebidos naquele dia | 489 | 662 | +35.5% |
| dia 7 | valor de referência dos materiais por dia (ouro) | 1 229 | 1 630 | +32.6% |
| dia 7 | valor de referência dos materiais naquele dia (ouro) | 2 566 | 3 251 | +26.7% |
| dia 7 | ouro ganho por dia (média dos dias 1 até aqui) | 872 | 1 083 | +24.2% |
| dia 7 | ouro ganho naquele dia | 279 | 650 | +133.4% |
| dia 7 | nível | 41 | 44 | +7.3% |
| dia 7 | CP | 942 | 1 171 | +24.3% |
| dia 7 | andar mais alto (highestDungeonFloor) | 30 | 39 | +28.3% |
| dia 14 | materiais recebidos por dia (média dos dias 1 até aqui) | 501 | 750 | +49.8% |
| dia 14 | materiais recebidos naquele dia | 945 | 745 | -21.2% |
| dia 14 | valor de referência dos materiais por dia (ouro) | 2 655 | 3 942 | +48.5% |
| dia 14 | valor de referência dos materiais naquele dia (ouro) | 5 590 | 4 080 | -27% |
| dia 14 | ouro ganho por dia (média dos dias 1 até aqui) | 613 | 1 262 | +106% |
| dia 14 | ouro ganho naquele dia | 373 | 499 | +33.6% |
| dia 14 | nível | 49 | 51 | +4.1% |
| dia 14 | CP | 1 377 | 1 899 | +37.9% |
| dia 14 | andar mais alto (highestDungeonFloor) | 50 | 65 | +30% |

| Marco | Dia sem Passe (mediana) | Dia com Passe (mediana) | Dono adiantado em (dias) |
| --: | --- | --- | --- |
| primeira peça forjada | 2 | 2 | 0 |
| checkpoint 10 | 1 | 1 | 0 |
| segunda zona de caça | 4 | 4 | 0 |
| chefe 25 vencido | 4 | 4 | 0 |
| chegada ao andar 50 | 14 | 10.5 | 3.5 |
| chefe 50 vencido | 16.5 | 12 | 4.5 |

### Habilidades: os três caminhos (Guerreiro = cenário A, Guardião, Caçador) contra o mesmo jogador sem habilidades (Z), mesma política e mesmas seeds

| Quando | Medida (mediana entre seeds) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- | --- |
| dia 7 | materiais recebidos por dia (média dos dias 1 até aqui) | 241 | 273 (+13.2%) | 236 (-1.8%) | 235 (-2.3%) |
| dia 7 | valor de referência dos materiais por dia (ouro) | 1 045 | 1 229 (+17.6%) | 1 035 (-1%) | 998 (-4.5%) |
| dia 7 | ouro ganho por dia (média dos dias 1 até aqui) | 885 | 872 (-1.4%) | 878 (-0.7%) | 872 (-1.5%) |
| dia 7 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 41 | 47 (+16.6%) | 42 (+4.1%) | 43 (+6.2%) |
| dia 7 | nível | 39 | 41 (+5.1%) | 39 (+0%) | 39 (+0%) |
| dia 7 | CP | 742 | 942 (+26.9%) | 805 (+8.4%) | 782 (+5.4%) |
| dia 7 | andar mais alto | 29 | 30 (+3.4%) | 30 (+3.4%) | 30 (+3.4%) |
| dia 14 | materiais recebidos por dia (média dos dias 1 até aqui) | 395 | 501 (+26.8%) | 391 (-1%) | 458 (+16%) |
| dia 14 | valor de referência dos materiais por dia (ouro) | 1 913 | 2 655 (+38.8%) | 1 898 (-0.8%) | 2 306 (+20.6%) |
| dia 14 | ouro ganho por dia (média dos dias 1 até aqui) | 619 | 613 (-1%) | 626 (+1.2%) | 625 (+1%) |
| dia 14 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 46 | 61 (+33.3%) | 51 (+9.9%) | 53 (+15%) |
| dia 14 | nível | 48 | 49 (+2.1%) | 48 (+0%) | 48 (+0%) |
| dia 14 | CP | 1 207 | 1 377 (+14%) | 1 297 (+7.4%) | 1 260 (+4.3%) |
| dia 14 | andar mais alto | 40 | 50 (+25%) | 40 (+0%) | 40 (+0%) |

| Marco (dia, mediana) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- |
| primeira peça forjada | 2 | 2 | 2 | 2 |
| checkpoint 10 | 1 | 1 | 1 | 1 |
| segunda zona de caça | 6 | 4 | 5 | 5 |
| chefe 25 vencido | 6 | 4 | 5 | 5 |
| chegada ao andar 50 | 17 | 14 | 16 | 16 |
| chefe 50 vencido | depois do dia 21 | 16.5 | 17.5 | 20.5 |

### Diagnóstico do chefe do andar 25

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário A)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 1 | 129 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 4 (3–6) | 606 (520–677) | arma T2 / armadura T2, nível 33 (27–35) | 20/20 seeds |

#### Diagnóstico: chefe do andar 25 (CP recomendado pelo jogo: 651; andar 24: 115) contra heróis montados à mão, sem poções, de HP cheio

| Equipamento | Nível | CP | Sobe do andar 1 ao 24 de uma vez | Limpa o andar 24 | Vence o chefe do 25 |
| --: | --- | --- | --- | --- | --- |
| Roupa de trapos + Clava | 30 | 204 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 60 | 371 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 100 | 620 | 20/20 | 20/20 | 20/20 |
| Tier 1 (adaga + couro) +0 | 40 | 393 | 20/20 | 20/20 | 0/20 |
| Tier 1 +8 | 40 | 532 | 20/20 | 20/20 | 2/20 |
| Tier 1 +8 | 60 | 694 | 20/20 | 20/20 | 20/20 |
| Tier 2 (espada + cota) +0 | 40 | 536 | 20/20 | 20/20 | 1/20 |
| Tier 2 +4 | 40 | 664 | 20/20 | 20/20 | 19/20 |
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
| 25 | 200 × 23 = 4 600 | 1 036 × 171 = 177 156 | 1 473 × 184 = 271 032 | 58.92 | 38.5 |
| 50 | 2 542 × 311 = 790 562 | 5 517 × 267 = 1 473 039 | 2 652 × 343 = 909 636 | 1.15 | 1.9 |
| 75 | 3 728 × 478 = 1 781 984 | 9 084 × 436 = 3 960 624 | 8 759 × 441 = 3 862 719 | 2.17 | 2.2 |
| 100 | 11 226 × 563 = 6 320 238 | 14 279 × 682 = 9 738 278 | - | - | 1.5 |
