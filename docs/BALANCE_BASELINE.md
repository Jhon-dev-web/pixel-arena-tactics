> **2026-10-15 (rodada 20, a Liga):** o XP do herói vem só da Caça (a Masmorra e os pedidos não pagam mais; o Elixir do Conhecimento é um buff de +25% de XP de Caça). O jogador simulado ganhou uma política do Elixir e o relatório do `sim:long` ganhou a tabela "Ritmo da Liga". A guarda dos dias 1 a 21 mudou em quatro linhas (T2: checkpoint do andar 10 até o dia 2; T4: nível no dia 2 / 3 / 14 em 20-28 / 20-29 / 45-60; o nível do dia 1 é 1); as medidas estão na seção "Liga" no fim deste arquivo e em `BALANCE_CHANGES.md`, Rodada 20. As tabelas anteriores são o histórico de antes dela.
>
> **2026-10-13 (rodada 16):** o `sim:long` ganhou o livro-razão do que o jogador joga fora (por material e por motivo) e o de Ouro e Runas; a seção "Dias 21 a 180" abaixo é de antes dos sumidouros do fim de jogo. O estado de antes e o de depois estão em `BALANCE_CHANGES.md`, Rodada 16, e `MATERIAL_FLOW.md`, seção 8.
>
> **2026-10-13 (rodada 15, dias 21 a 180):** o fim deste documento ganhou a seção "Dias 21 a 180", medida por `npm run sim:long` (6 seeds x 180 dias, jogador comum e dono do Passe). O resto do relatório (3 semanas) segue sendo o de `npm run sim`, com os mesmos valores nos dias 1 a 21 (a rodada 15 só mexe de depois do andar 50 em diante; ver `BALANCE_CHANGES.md`, Rodada 15, seção 6).
>
> **2026-10-11 (rodada 8, atributos básicos):** o relatório completo abaixo foi regerado com os novos valores de VIT, RES e AGI (`vitHpPerPoint` 4,5 + 0,03 por nível, `resHpPerPoint` 2, `agiHalfPoint` 80) e os orcs 325 / 48 (`BALANCE_CHANGES.md`, Rodada 8); o resumo e a política acima continuam descrevendo o baseline anterior.
>
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

Gerado por `npm run sim` depois da rodada 8 (atributos básicos, números finais). Cada célula é mediana (mín–máx) entre as 20 seeds. O jogador do cenário A gasta os pontos de habilidade no Guerreiro; a seção "Habilidades" compara os três caminhos com o mesmo jogador sem habilidades (Z).

### Metas de balanceamento (T2 a T8) e do inventário (I1 a I4)

| Meta | Critério | Cenário A (pedido) | Resultado |
| --- | --- | --- | --- |
| T2 | Primeira sessão da conta nova termina no andar ≥ 8; checkpoint do andar 10 no dia 1 | andar 8; checkpoint 10 no dia 1 | ok |
| T3 | Primeira peça forjada no dia 1 ou 2 | dia 2 | ok |
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–29 / 45–60) | 13 / 29 (25–33) / 49 (46–52) | ok |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 4; vitória ao chegar: 0% | ok |
| T6 | Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16 | chegada: primeira seed no dia 8, mediana 13; chefe 50: primeira seed no dia 9, mediana 14.5, 20/20 em 21 dias | chegada FORA DA META; chefe FORA DA META |
| T7 | Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75 | menor razão (N+1)/(N−1): 1.05 | ok |
| T8 | Derrota mantém 75% do ouro da sessão | 75% | ok |
| I1 | Com 2 visitas por dia, o inventário enche pela primeira vez entre os dias 3 e 6 (não no dia 1, não nunca), no ritmo de quem não arruma | dia 6 (mín–máx 5–6; 20/20 seeds); jogador atento: 5/20 seeds chegam a encher antes de arrumar | ok |
| I2 | Jogador atento perde menos de 5% dos materiais por transbordo | mediana 2.53% · pior seed 31.26% | ok |
| I3 | Jogador que ignora o inventário sente: perde pelo menos 10% dos materiais | mediana 50.4% · pior seed 81.9% · melhor seed 15.5% | ok |
| I4 | Ouro do mercador (vendendo todo o excesso do dia) no máximo ~35% do ouro diário de antes do mercador (424 / 521 / 483), nos dias 3, 7 e 14 | dia 3: +0% · dia 7: +21.1% · dia 14: +26.5% | ok |

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 133 | 25 | 0 | 0 |
| 2 | 23 (23–24) | 331 (315–423) | 25 | 1 (1–2) | 1 (1–2) |
| 3 | 29 (25–33) | 462 (401–638) | 25 (25–26) | 1 (1–2) | 1 (1–2) |
| 4 | 31 (27–33) | 707 (436–848) | 26 (25–29) | 2 (1–2) | 2 (1–2) |
| 5 | 35 (32–37) | 890 (739–1 236) | 30 (26–35) | 2 (2–3) | 2 (1–3) |
| 6 | 39 (36–41) | 1 023 (807–1 253) | 30 (26–40) | 2 (2–3) | 2 (1–3) |
| 7 | 40 (36–44) | 1 081 (845–1 463) | 32 (30–41) | 2 (2–3) | 2 (1–3) |
| 8 | 42 (36–45) | 1 121 (863–1 561) | 37 (30–50) | 2 (2–3) | 2 (1–3) |
| 9 | 44 (39–47) | 1 222 (895–1 774) | 40 (30–51) | 2 (2–3) | 2 (1–3) |
| 10 | 46 (39–48) | 1 261 (910–1 814) | 40 (30–60) | 2 (2–3) | 3 (1–3) |
| 11 | 47 (41–49) | 1 343 (922–1 855) | 42 (30–65) | 2 (2–3) | 3 (1–3) |
| 12 | 48 (43–49) | 1 410 (936–1 967) | 49 (30–70) | 2 (2–3) | 3 (1–3) |
| 13 | 49 (45–50) | 1 503 (1 156–2 134) | 50 (34–70) | 3 (2–3) | 3 (1–3) |
| 14 | 49 (46–52) | 1 582 (1 189–2 134) | 54 (40–70) | 3 (2–3) | 3 (1–3) |
| 15 | 50 (47–52) | 1 759 (1 261–2 176) | 60 (40–75) | 3 (2–3) | 3 (1–3) |
| 16 | 51 (48–53) | 1 868 (1 279–2 196) | 60 (40–75) | 3 (2–3) | 3 (1–3) |
| 17 | 51 (48–54) | 1 929 (1 296–2 196) | 68 (40–75) | 3 (2–3) | 3 (1–3) |
| 18 | 52 (48–54) | 1 950 (1 311–2 257) | 70 (40–76) | 3 (2–3) | 3 (1–3) |
| 19 | 52 (49–55) | 1 967 (1 311–2 257) | 70 (40–76) | 3 (2–3) | 3 (1–3) |
| 20 | 52 (49–55) | 2 000 (1 540–2 279) | 70 (59–77) | 3 (2–3) | 3 (1–3) |
| 21 | 52 (49–56) | 2 016 (1 570–2 279) | 73 (60–77) | 3 (2–3) | 3 (1–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 668 | 2 668 | 0 | 0 |
| 2 | 6 994 (6 994–8 494) | 0 | 6 994 | 0 (0–1 500) |
| 3 | 9 605 (780–23 686) | 0 (0–632) | 0 | 9 605 (780–23 054) |
| 4 | 5 285 (273–15 360) | 632 (0–1 046) | 0 (0–9 090) | 4 998 (0–9 605) |
| 5 | 19 691 (11 076–25 781) | 491 (0–1 190) | 18 834 (0–18 847) | 1 388 (0–10 920) |
| 6 | 25 311 (2 475–40 372) | 144 (0–1 292) | 18 847 (0–37 681) | 1 545 (0–21 373) |
| 7 | 20 370 (702–39 485) | 400 (0–1 805) | 18 838 (0–37 686) | 1 388 (0–16 588) |
| 8 | 22 080 (0–40 228) | 0 (0–1 728) | 18 844 (0–37 685) | 1 350 (0–15 680) |
| 9 | 37 983 (1 815–40 506) | 0 (0–2 812) | 37 682 (0–37 694) | 0 (0–2 625) |
| 10 | 37 687 (2 799–43 250) | 87 (0–2 192) | 37 679 (0–37 696) | 0 (0–4 760) |
| 11 | 38 480 (2 765–73 397) | 946 (0–3 625) | 37 679 (0–72 479) | 0 (0–11 030) |
| 12 | 37 669 (1 350–42 562) | 0 (0–2 540) | 37 665 (0–37 698) | 0 (0–10 920) |
| 13 | 37 694 (204–75 190) | 305 (0–3 670) | 37 681 (0–72 490) | 423 (0–5 600) |
| 14 | 37 687 (0–73 371) | 0 (0–2 705) | 36 959 (0–72 508) | 390 (0–13 278) |
| 15 | 37 678 (1 565–73 298) | 1 434 (0–2 705) | 36 263 (0–72 515) | 195 (0–12 040) |
| 16 | 38 749 (1 010–77 377) | 117 (0–3 308) | 36 259 (0–72 532) | 1 810 (0–11 878) |
| 17 | 36 886 (555–77 220) | 646 (0–3 406) | 36 236 (0–72 484) | 1 275 (0–15 323) |
| 18 | 21 548 (501–77 539) | 140 (0–2 705) | 18 116 (0–72 502) | 1 388 (0–6 035) |
| 19 | 37 163 (0–77 410) | 0 (0–782) | 36 239 (0–72 534) | 1 388 (0–5 150) |
| 20 | 9 018 (0–75 249) | 0 (0–5 877) | 0 (0–72 498) | 1 350 (0–12 710) |
| 21 | 9 271 (0–73 231) | 0 (0–1 565) | 0 (0–72 515) | 585 (0–16 817) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.4 | 30 | 100% |
| 2 | 0 | 5 (5–6) | 100% |
| 3 | 0 (0–0.1) | 7 (7–9) | 99% |
| 4 | 0.1 (0–0.4) | 9 (7–11) | 94% |
| 5 | 0.2 (0–0.6) | 10 (8–13) | 98% |
| 6 | 0.1 (0–0.7) | 9 (7–14) | 100% |
| 7 | 0.3 (0–1) | 10 (7–17) | 100% |
| 8 | 0 (0–0.9) | 9 (7–14) | 100% |
| 9 | 0 (0–1.1) | 9 (7–16) | 100% |
| 10 | 0.1 (0–1) | 10 (7–17) | 99% |
| 11 | 0.5 (0–1.3) | 13 (7–17) | 99% |
| 12 | 0 (0–1.3) | 10 (7–18) | 100% |
| 13 | 0.2 (0–1.5) | 10 (7–19) | 99% |
| 14 | 0 (0–1.2) | 9 (7–17) | 100% |
| 15 | 0.5 (0–1) | 11 (7–17) | 99% |
| 16 | 0.1 (0–1.3) | 9 (7–18) | 99% |
| 17 | 0.2 (0–1.2) | 10 (7–17) | 100% |
| 18 | 0.1 (0–1) | 10 (7–16) | 99% |
| 19 | 0 (0–0.2) | 9 (7–15) | 100% |
| 20 | 0 (0–2.1) | 10 (7–21) | 99% |
| 21 | 0 (0–0.5) | 9 (7–14) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 429 (419–438) | 149 (139–158) | 0 | 0 | 0 | 280 | 300 (300–330) | 127 (105–131) |
| 2 | 411 (411–583) | 0 | 0 | 11 | 0 (0–52) | 400 (400–520) | 465 (415–615) | 76 (65–108) |
| 3 | 533 (250–4 051) | 0 (0–62) | 0 (0–2 000) | 0 | 302 (30–689) | 220 (220–1 300) | 473 (220–885) | 200 (20–3 412) |
| 4 | 2 798 (202–3 673) | 42 (0–71) | 2 000 (0–2 000) | 0 (0–11) | 158 (0–302) | 1 260 (120–1 300) | 2 948 (0–3 728) | 310 (26–1 245) |
| 5 | 436 (167–3 688) | 35 (0–105) | 0 (0–2 000) | 24 (0–27) | 49 (0–327) | 220 (80–1 300) | 636 (115–3 843) | 152 (4–2 198) |
| 6 | 414 (129–914) | 13 (0–112) | 0 | 26 (0–52) | 57 (0–668) | 210 (0–300) | 390 (0–1 063) | 249 (87–1 709) |
| 7 | 356 (168–900) | 34 (0–145) | 0 | 24 (0–52) | 50 (0–527) | 120 (0–300) | 370 (0–2 720) | 311 (34–1 297) |
| 8 | 379 (102–827) | 0 (0–112) | 0 | 26 (0–54) | 49 (0–497) | 120 (0–300) | 150 (0–1 425) | 314 (35–1 546) |
| 9 | 311 (140–6 009) | 0 (0–257) | 0 (0–5 000) | 49 (0–54) | 0 (0–95) | 120 (0–580) | 240 (0–1 201) | 333 (153–5 375) |
| 10 | 377 (141–6 237) | 6 (0–209) | 0 (0–5 000) | 50 (0–54) | 0 (0–156) | 140 (0–800) | 435 (0–1 830) | 380 (72–6 460) |
| 11 | 363 (164–6 277) | 76 (0–395) | 0 (0–5 000) | 51 (0–100) | 0 (0–349) | 90 (0–680) | 425 (0–5 055) | 347 (99–4 823) |
| 12 | 360 (168–5 921) | 0 (0–204) | 0 (0–5 000) | 48 (0–53) | 0 (0–356) | 120 (0–580) | 300 (0–4 925) | 539 (35–4 994) |
| 13 | 390 (136–6 389) | 23 (0–350) | 0 (0–5 000) | 49 (0–98) | 18 (0–197) | 150 (0–830) | 733 (0–3 445) | 465 (16–4 944) |
| 14 | 349 (0–6 102) | 0 (0–271) | 0 (0–5 000) | 49 (0–104) | 17 (0–440) | 120 (0–680) | 65 (0–3 365) | 800 (16–5 101) |
| 15 | 452 (180–6 249) | 117 (0–262) | 0 (0–5 000) | 49 (0–106) | 9 (0–392) | 190 (0–800) | 975 (0–3 366) | 1 036 (29–5 199) |
| 16 | 558 (176–6 411) | 8 (0–378) | 0 (0–5 000) | 50 (0–104) | 71 (0–395) | 160 (0–800) | 610 (0–3 588) | 1 822 (22–6 144) |
| 17 | 364 (134–817) | 72 (0–360) | 0 | 48 (0–104) | 48 (0–508) | 120 (0–300) | 245 (0–3 980) | 1 880 (7–4 751) |
| 18 | 459 (184–12 485) | 11 (0–252) | 0 (0–12 000) | 24 (0–104) | 53 (0–211) | 210 (0–680) | 490 (0–5 932) | 2 213 (20–7 964) |
| 19 | 297 (168–12 759) | 0 (0–133) | 0 (0–12 000) | 47 (0–104) | 53 (0–187) | 120 (0–300) | 340 (0–4 240) | 2 030 (239–10 079) |
| 20 | 457 (136–6 577) | 0 (0–536) | 0 (0–5 000) | 0 (0–104) | 51 (0–419) | 190 (0–830) | 235 (0–4 480) | 2 429 (1 481–10 388) |
| 21 | 327 (58–931) | 0 (0–134) | 0 | 0 (0–104) | 26 (0–579) | 120 (0–300) | 260 (0–2 820) | 2 366 (1 337–11 129) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 2 490 · estações 2 421 · forja 2 165 · refino 3 300 · alquimia 1 780 · baú 785 · mochila 1 750 · reparo 385

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 | 2 | 0 | 0% | 0 | 0 | 0 | 0 | 429 (419–438) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 411 (411–583) | 0 / 0 |
| 3 | 26 | 10 (10–12) | 10 (10–12) | 0 | 0% | 0 | 0 | 0 | 0 | 533 (250–4 051) | 0 / 0 |
| 4 | 26 | 16 (13–19) | 16 (13–19) | 0 | 0% | 0 | 0 | 0 | 0 | 2 798 (202–3 673) | 0 / 0 |
| 5 | 26 | 18 (15–23) | 19 (16–23) | 0 | 0% | 190 (0–369) | 98 (0–104) | 60 (0–130) | 98 (0–104) | 361 (127–3 688) | 0 / 7 (0–16) |
| 6 | 26 (26–30) | 21 (18–23) | 22 (18–25) | 0 | 0% | 301 (34–541) | 106 (0–112) | 124 (0–302) | 106 (0–112) | 308 (27–914) | 0 (0–1) / 12 (6–20) |
| 7 | 26 (26–30) | 21 (15–24) | 22 (19–24) | 0 | 0% | 214 (20–567) | 110 (87–118) | 190 (0–523) | 110 (87–118) | 245 (52–790) | 0 (0–2) / 14 (7–20) |
| 8 | 26 (26–30) | 21 (17–25) | 22 (17–26) | 0 | 0% | 237 (8–647) | 114 (47–120) | 236 (0–921) | 114 (47–120) | 266 (0–717) | 0 (0–2) / 17 (10–20) |
| 9 | 26 (26–30) | 21 (16–26) | 21 (19–26) | 0 | 0% | 294 (0–658) | 118 (44–124) | 431 (0–822) | 118 (101–124) | 196 (24–5 885) | 0 (0–2) / 20 (11–24) |
| 10 | 28 (26–35) | 22 (17–30) | 22 (18–30) | 0 (0–438) | 0% | 50 (0–665) | 120 (0–126) | 363 (0–884) | 121 (0–126) | 276 (25–6 115) | 1 (0–2) / 20 (12–30) |
| 11 | 30 (26–40) | 23 (17–34) | 25 (18–34) | 0 (0–633) | 0% | 209 (0–615) | 119 (27–128) | 280 (0–926) | 124 (27–128) | 237 (48–6 149) | 1 (0–3) / 20 (18–37) |
| 12 | 30 (26–45) | 24 (17–36) | 25 (18–36) | 0 (0–176) | 0% | 241 (0–636) | 122 (0–128) | 281 (0–904) | 125 (0–128) | 254 (48–5 797) | 2 (0–3) / 24 (20–40) |
| 13 | 30 (26–45) | 25 (17–39) | 26 (20–39) | 0 (0–422) | 0% | 253 (0–1 195) | 121 (0–130) | 295 (0–977) | 126 (0–130) | 288 (14–6 261) | 2 (0–3) / 30 (20–40) |
| 14 | 30 (26–45) | 27 (17–39) | 28 (17–40) | 0 (0–213) | 0% | 88 (0–948) | 124 (0–134) | 300 (0–910) | 128 (0–134) | 220 (0–5 976) | 2 (0–3) / 30 (20–50) |
| 15 | 35 (26–45) | 30 (17–37) | 30 (17–39) | 0 (0–527) | 0% | 63 (0–621) | 104 (0–134) | 303 (0–987) | 128 (0–134) | 323 (48–6 119) | 2 (0–3) / 38 (20–50) |
| 16 | 40 (26–45) | 32 (18–42) | 32 (18–42) | 0 (0–316) | 0% | 43 (0–834) | 127 (0–136) | 462 (0–955) | 132 (0–136) | 466 (48–6 279) | 2 (0–3) / 39 (20–50) |
| 17 | 40 (26–45) | 34 (19–45) | 35 (19–45) | 0 (0–937) | 0% | 0 (0–642) | 87 (0–138) | 174 (0–1 068) | 132 (0–138) | 234 (48–817) | 2 (0–3) / 40 (20–50) |
| 18 | 40 (30–50) | 34 (25–45) | 35 (25–45) | 0 (0–1 176) | 0% | 10 (0–622) | 131 (0–138) | 389 (0–908) | 133 (0–138) | 393 (48–12 355) | 2 (0–3) / 40 (20–50) |
| 19 | 40 (35–50) | 36 (28–45) | 36 (29–45) | 0 (0–1 351) | 0% | 19 (0–653) | 89 (0–140) | 307 (0–1 040) | 132 (0–140) | 249 (48–12 631) | 2 (0–3) / 40 (20–50) |
| 20 | 40 (35–50) | 36 (26–45) | 36 (29–45) | 0 (0–1 354) | 0% | 8 (0–254) | 130 (0–140) | 307 (0–909) | 134 (0–140) | 319 (0–6 441) | 2 (0–3) / 40 (20–50) |
| 21 | 40 (35–50) | 37 (28–45) | 37 (28–45) | 0 (0–1 506) | 0% | 13 (0–753) | 128 (0–142) | 238 (0–791) | 134 (0–142) | 239 (0–799) | 2 (0–3) / 40 (19–50) |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 0 | 4 |
| 2 | 205 (185–228) | 64 (52–90) | 6 (1–10) | 0 | 4 | 4 | 0 |
| 3 | 70 | 0 | 0 | 0 | 0 | 4 | 4 |
| 4 | 100 (100–236) | 0 (0–161) | 0 (0–27) | 0 | 0 (0–4) | 4 (0–4) | 4 |
| 5 | 252 (123–275) | 170 (0–192) | 34 (0–47) | 0 | 5 (0–5) | 4 (4–8) | 0 |
| 6 | 278 (142–416) | 197 (0–410) | 46 (0–99) | 0 | 5 (0–10) | 4 (0–4) | 0 (0–4) |
| 7 | 255 (89–447) | 179 (0–445) | 37 (0–102) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 8 | 223 (77–513) | 328 (0–506) | 54 (0–139) | 0 | 5 (0–10) | 4 (0–4) | 0 (0–4) |
| 9 | 415 (89–522) | 409 (98–508) | 85 (0–126) | 0 | 10 (0–10) | 0 (0–4) | 0 (0–8) |
| 10 | 393 (113–512) | 409 (0–540) | 89 (0–129) | 0 (0–438) | 10 (0–10) | 0 (0–8) | 0 (0–4) |
| 11 | 392 (0–499) | 413 (0–769) | 95 (0–248) | 0 (0–633) | 10 (0–12) | 0 (0–8) | 0 (0–4) |
| 12 | 324 (89–454) | 409 (0–544) | 91 (0–128) | 0 (0–176) | 10 (0–10) | 0 (0–4) | 0 (0–8) |
| 13 | 361 (77–561) | 422 (0–941) | 92 (0–270) | 0 (0–422) | 10 (0–12) | 0 (0–8) | 0 (0–4) |
| 14 | 310 (86–488) | 418 (113–1 030) | 94 (0–294) | 0 (0–213) | 8 (0–12) | 0 (0–4) | 0 (0–4) |
| 15 | 279 (0–488) | 416 (0–1 024) | 104 (0–262) | 0 (0–527) | 6 (0–12) | 0 (0–4) | 2 (0–8) |
| 16 | 257 (0–501) | 437 (0–951) | 98 (0–271) | 0 (0–316) | 6 (0–12) | 4 (0–4) | 0 (0–4) |
| 17 | 113 (0–506) | 433 (116–719) | 99 (0–286) | 0 (0–937) | 6 (0–12) | 4 (0–4) | 4 (0–4) |
| 18 | 132 (0–505) | 291 (0–619) | 38 (0–167) | 0 (0–1 176) | 3 (0–12) | 4 (0–4) | 4 (0–4) |
| 19 | 132 (0–455) | 290 (116–798) | 41 (0–179) | 0 (0–1 351) | 6 (0–12) | 4 (0–4) | 4 (0–4) |
| 20 | 0 (0–417) | 291 (0–731) | 0 (0–164) | 0 (0–1 354) | 0 (0–12) | 4 (0–4) | 4 (0–4) |
| 21 | 0 (0–251) | 297 (0–915) | 0 (0–302) | 0 (0–1 506) | 0 (0–12) | 4 (0–4) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | 16 | 11–20 | 15/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 4 | 3–5 | 20/20 |
| Segunda zona de caça liberada | 4 | 3–5 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 13 | 8–20 | 20/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | 14.5 | 9–20 | 20/20 |
| Inventário cheio pela primeira vez (antes de qualquer arrumação) | depois do dia 21 | 17–21 | 5/20 |
| Primeira melhoria do Baú | 10.5 | 6–21 | 17/20 |
| Segunda melhoria do Baú | 12.5 | 7–16 | 14/20 |
| Terceira melhoria do Baú | depois do dia 21 | 11–15 | 5/20 |

Dia em que cada seed chegou ao andar 50 (ordenado): 8 9 9 10 10 10 11 11 12 13 13 13 15 15 16 16 16 17 17 20

#### Dia 1: em que andar terminam as três primeiras sessões

| Sessão | CP ao começar | Segundos | Andar final: mín / p25 / mediana / p75 / máx | Histograma (andar×seeds) |
| --: | --- | --- | --- | --- |
| 1 | 61 | 57 | 8 / 8 / 8 / 8 / 8 | 8×20 |
| 2 | 86 | 27 | 10 / 10 / 10 / 10 / 10 | 10×20 |
| 3 | 91 | 20 | 11 / 11 / 11 / 11 / 11 | 11×20 |

"Andar final" = highestDungeonFloor depois da sessão (o andar onde morreu, ou o seguinte ao último limpo numa retirada).

### Cenário N (descuidado): o mesmo jogador que nunca guarda, vende, descarta nem expande o inventário

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 133 | 25 | 0 | 0 |
| 2 | 23 (23–24) | 331 (315–423) | 25 | 1 (1–2) | 1 (1–2) |
| 3 | 29 (25–33) | 457 (385–692) | 25 (25–26) | 1 (1–2) | 1 (1–2) |
| 4 | 31 (26–34) | 723 (421–833) | 26 (25–30) | 2 (1–2) | 2 (1–2) |
| 5 | 35 (31–39) | 846 (694–1 074) | 29 (26–33) | 2 (2–3) | 2 (1–3) |
| 6 | 41 (35–42) | 900 (801–1 306) | 30 (26–40) | 2 (2–3) | 2 (1–3) |
| 7 | 42 (37–45) | 907 (827–1 341) | 30 (28–40) | 2 (2–3) | 2 (1–3) |
| 8 | 42 (37–46) | 909 (839–1 341) | 30 (29–40) | 2 (2–3) | 2 (1–3) |
| 9 | 42 (37–47) | 917 (865–1 341) | 30 (29–44) | 2 (2–3) | 2 (1–3) |
| 10 | 42 (37–47) | 919 (865–1 356) | 30 (30–50) | 2 (2–3) | 2 (1–3) |
| 11 | 43 (37–47) | 919 (877–1 356) | 30 (30–50) | 2 (2–3) | 2 (1–3) |
| 12 | 43 (37–47) | 919 (877–1 356) | 30 (30–50) | 2 (2–3) | 2 (1–3) |
| 13 | 43 (37–47) | 933 (877–1 374) | 30 (30–50) | 2 (2–3) | 2 (1–3) |
| 14 | 43 (37–47) | 933 (879–1 374) | 30 (30–56) | 2 (2–3) | 2 (1–3) |
| 15 | 43 (37–47) | 934 (879–1 374) | 30 (30–57) | 2 (2–3) | 2 (1–3) |
| 16 | 43 (37–47) | 948 (879–1 374) | 30 (30–58) | 2 (2–3) | 2 (1–3) |
| 17 | 43 (37–47) | 948 (879–1 374) | 30 (30–58) | 2 (2–3) | 2 (1–3) |
| 18 | 43 (37–47) | 954 (879–1 374) | 30 (30–58) | 2 (2–3) | 2 (1–3) |
| 19 | 43 (37–47) | 965 (879–1 374) | 30 (30–60) | 2 (2–3) | 2 (1–3) |
| 20 | 44 (37–47) | 965 (879–1 374) | 30 (30–60) | 2 (2–3) | 2 (1–3) |
| 21 | 44 (37–47) | 965 (879–1 374) | 30 (30–60) | 2 (2–3) | 2 (1–3) |

#### Inventário por dia: espaços ocupados, o que ficou para trás e o que a política fez (mediana entre seeds, mín–máx)

| Dia | Capacidade | Espaços no fim do dia | Pico do dia | Ficou para trás (caça + coleta) | % do dia perdido | Guardado no Baú | Vendido | Descartado | Ouro do mercador | Ouro das outras fontes | Baú: nível / espaços |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 26 | 2 | 2 | 0 | 0% | 0 | 0 | 0 | 0 | 429 (419–438) | 0 / 0 |
| 2 | 26 | 9 (8–9) | 9 (8–9) | 0 | 0% | 0 | 0 | 0 | 0 | 411 (411–583) | 0 / 0 |
| 3 | 26 | 11 (10–16) | 11 (10–16) | 0 | 0% | 0 | 0 | 0 | 0 | 533 (250–3 551) | 0 / 0 |
| 4 | 26 | 16 (13–19) | 16 (13–19) | 0 | 0% | 0 | 0 | 0 | 0 | 3 469 (213–3 646) | 0 / 0 |
| 5 | 26 | 25 (20–26) | 25 (21–26) | 0 (0–376) | 0% | 0 | 0 | 0 | 0 | 403 (124–3 807) | 0 / 0 |
| 6 | 26 | 26 (25–26) | 26 | 429 (0–857) | 58.1% | 0 | 0 | 0 | 0 | 349 (54–933) | 0 / 0 |
| 7 | 26 | 26 (25–26) | 26 (25–26) | 374 (0–1 112) | 95% | 0 | 0 | 0 | 0 | 198 (0–653) | 0 / 0 |
| 8 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–870) | 0% | 0 | 0 | 0 | 0 | 154 (0–505) | 0 / 0 |
| 9 | 26 | 26 | 26 | 0 (0–404) | 0% | 0 | 0 | 0 | 0 | 66 (0–525) | 0 / 0 |
| 10 | 26 | 26 | 26 | 0 (0–286) | 0% | 0 | 0 | 0 | 0 | 0 (0–341) | 0 / 0 |
| 11 | 26 | 26 | 26 | 0 (0–307) | 0% | 0 | 0 | 0 | 0 | 0 (0–633) | 0 / 0 |
| 12 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–325) | 0% | 0 | 0 | 0 | 0 | 0 (0–285) | 0 / 0 |
| 13 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–340) | 0% | 0 | 0 | 0 | 0 | 16 (0–381) | 0 / 0 |
| 14 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–355) | 0% | 0 | 0 | 0 | 0 | 0 (0–5 722) | 0 / 0 |
| 15 | 26 | 26 | 26 | 0 (0–367) | 0% | 0 | 0 | 0 | 0 | 0 (0–464) | 0 / 0 |
| 16 | 26 | 26 | 26 | 0 (0–695) | 0% | 0 | 0 | 0 | 0 | 0 (0–284) | 0 / 0 |
| 17 | 26 | 26 (24–26) | 26 (24–26) | 0 (0–842) | 0% | 0 | 0 | 0 | 0 | 0 (0–431) | 0 / 0 |
| 18 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–442) | 0% | 0 | 0 | 0 | 0 | 0 (0–464) | 0 / 0 |
| 19 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–605) | 0% | 0 | 0 | 0 | 0 | 18 (0–187) | 0 / 0 |
| 20 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–801) | 0% | 0 | 0 | 0 | 0 | 6 (0–263) | 0 / 0 |
| 21 | 26 | 26 (25–26) | 26 (25–26) | 0 (0–443) | 0% | 0 | 0 | 0 | 0 | 0 (0–222) | 0 / 0 |

#### Materiais recebidos por dia (unidades que entraram no inventário) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Ficou para trás na caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 205 (185–228) | 64 (52–90) | 6 (1–10) | 0 | 4 | 0 | 4 |
| 3 | 70 (70–85) | 0 | 0 | 0 | 0 | 4 (4–8) | 4 (0–4) |
| 4 | 100 (85–100) | 0 | 0 | 0 | 0 | 4 (0–4) | 4 (4–8) |
| 5 | 255 (65–358) | 180 (0–265) | 37 (30–51) | 0 (0–376) | 5 (4–10) | 4 (0–4) | 0 |
| 6 | 65 (0–224) | 127 (0–317) | 57 (0–83) | 429 (0–857) | 10 (0–10) | 0 (0–8) | 0 |
| 7 | 0 (0–63) | 0 (0–82) | 0 (0–63) | 365 (0–1 112) | 5 (0–10) | 0 (0–8) | 0 |
| 8 | 0 (0–8) | 0 (0–3) | 0 | 0 (0–870) | 0 (0–10) | 0 (0–8) | 0 |
| 9 | 0 | 0 | 0 | 0 (0–404) | 0 (0–5) | 0 (0–8) | 0 |
| 10 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 11 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 12 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 13 | 0 | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 14 | 0 (0–90) | 0 | 0 | 0 | 0 | 0 (0–8) | 0 |
| 15 | 0 | 0 (0–99) | 0 | 0 | 0 | 0 (0–8) | 0 |
| 16 | 0 (0–1) | 0 (0–97) | 0 (0–69) | 0 (0–695) | 0 (0–10) | 0 (0–8) | 0 |
| 17 | 0 (0–86) | 0 | 0 | 0 (0–842) | 0 (0–10) | 0 (0–8) | 0 |
| 18 | 0 | 0 (0–99) | 0 | 0 (0–442) | 0 (0–5) | 0 (0–8) | 0 |
| 19 | 0 (0–84) | 0 (0–4) | 0 (0–72) | 0 (0–605) | 0 (0–10) | 0 (0–8) | 0 |
| 20 | 0 | 0 | 0 | 0 (0–801) | 0 (0–10) | 0 (0–8) | 0 |
| 21 | 0 | 0 | 0 (0–1) | 0 (0–443) | 0 (0–5) | 0 (0–8) | 0 |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Ficou para trás" = unidades sorteadas que não couberam no inventário no resgate.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeira relíquia forjada e equipada | depois do dia 21 | - | 0/20 |
| Primeiro refino bem-sucedido | 2 | 2–2 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 4 | 3–5 | 20/20 |
| Segunda zona de caça liberada | 4 | 3–5 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | depois do dia 21 | 10–10 | 1/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 14–14 | 1/20 |
| Inventário cheio pela primeira vez (antes de qualquer arrumação) | 6 | 5–6 | 20/20 |
| Primeira melhoria do Baú | depois do dia 21 | - | 0/20 |
| Segunda melhoria do Baú | depois do dia 21 | - | 0/20 |
| Terceira melhoria do Baú | depois do dia 21 | - | 0/20 |

Dia em que cada seed chegou ao andar 50 (ordenado): 10 - - - - - - - - - - - - - - - - - - -

### Profissões, cenário A (pedido)

#### Nível das profissões por dia (mediana entre seeds, mín–máx)

| Dia | Mineração | Lenhador | Jardinagem | Horas min. | Horas cort. |
| --: | --- | --- | --- | --- | --- |
| 1 | 1 | 5 | 7 | 0 | 4 |
| 2 | 5 | 5 | 17 | 4 | 0 |
| 3 | 10 | 10 | 27 | 4 | 4 |
| 4 | 15 (10–15) | 15 | 32 (31–32) | 4 (0–4) | 4 |
| 5 | 19 (19–20) | 15 | 35 (34–37) | 4 (4–8) | 0 |
| 6 | 23 (19–23) | 15 (15–20) | 39 (37–39) | 4 (0–4) | 0 (0–4) |
| 7 | 26 (19–29) | 15 (15–23) | 41 (39–42) | 4 (0–8) | 0 (0–4) |
| 8 | 29 (19–31) | 15 (15–26) | 43 (41–45) | 4 (0–4) | 0 (0–4) |
| 9 | 29 (19–31) | 15 (15–29) | 45 (42–48) | 0 (0–4) | 0 (0–8) |
| 10 | 29 (19–34) | 17 (15–32) | 47 (43–51) | 0 (0–8) | 0 (0–4) |
| 11 | 29 (19–34) | 19 (15–32) | 49 (44–53) | 0 (0–8) | 0 (0–4) |
| 12 | 29 (19–34) | 19 (15–32) | 50 (45–55) | 0 (0–4) | 0 (0–8) |
| 13 | 30 (19–36) | 20 (15–32) | 52 (48–56) | 0 (0–8) | 0 (0–4) |
| 14 | 31 (19–38) | 23 (15–32) | 53 (50–58) | 0 (0–4) | 0 (0–4) |
| 15 | 32 (19–40) | 25 (15–34) | 55 (51–59) | 0 (0–4) | 2 (0–8) |
| 16 | 34 (19–42) | 28 (15–36) | 56 (51–60) | 4 (0–4) | 0 (0–4) |
| 17 | 34 (19–44) | 29 (15–38) | 57 (53–61) | 4 (0–4) | 4 (0–4) |
| 18 | 36 (19–46) | 29 (15–41) | 58 (54–63) | 4 (0–4) | 4 (0–4) |
| 19 | 38 (19–46) | 32 (15–42) | 59 (55–64) | 4 (0–4) | 4 (0–4) |
| 20 | 39 (19–47) | 34 (15–44) | 60 (55–64) | 4 (0–4) | 4 (0–4) |
| 21 | 41 (19–49) | 35 (15–46) | 60 (55–65) | 4 (0–4) | 4 (0–4) |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 (0–50) | 0 | 0 | 50 | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (0–73) | 0 (0–65) | 0 | 0 | 0 | 0 | 10 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–77) | 39 (0–80) | 0 | 0 (0–65) | 0 (0–73) | 0 | 0 (0–10) | 0 | 0 (0–10) | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 7 | 0 (0–100) | 83 (0–100) | 0 (0–98) | 0 (0–65) | 0 (0–80) | 0 | 0 (0–12) | 0 (0–15) | 0 (0–12) | 5 (0–11) | 0 (0–6) | 0 (0–12) | 0 |
| 8 | 0 (0–107) | 0 (0–89) | 49 (0–98) | 0 (0–65) | 0 (0–100) | 0 | 0 (0–12) | 0 | 0 (0–12) | 6 (0–12) | 0 (0–6) | 5 (0–12) | 0 |
| 9 | 0 | 0 | 0 (0–98) | 0 | 0 (0–89) | 0 (0–98) | 0 (0–12) | 0 | 0 (0–12) | 0 (0–12) | 0 (0–6) | 6 (0–12) | 0 (0–12) |
| 10 | 0 (0–107) | 0 (0–113) | 0 (0–107) | 0 (0–107) | 0 (0–89) | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 0 (0–12) |
| 11 | 0 (0–77) | 0 (0–100) | 0 (0–113) | 0 (0–65) | 0 (0–86) | 0 (0–98) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 0 (0–12) |
| 12 | 0 (0–113) | 0 | 0 (0–110) | 0 (0–73) | 0 (0–89) | 0 (0–98) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 13 | 0 (0–122) | 0 (0–122) | 0 (0–127) | 0 (0–73) | 0 (0–77) | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 14 | 0 (0–107) | 0 | 0 (0–144) | 0 | 0 (0–100) | 0 (0–107) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 12 (0–12) |
| 15 | 0 | 0 (0–77) | 0 (0–134) | 0 | 0 (0–100) | 0 (0–127) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 16 | 0 (0–137) | 0 (0–130) | 0 (0–157) | 0 | 0 (0–100) | 0 (0–127) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 17 | 0 | 0 | 118 (0–150) | 0 | 0 (0–100) | 0 (0–130) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 18 | 0 | 0 (0–116) | 61 (0–157) | 0 | 0 (0–77) | 49 (0–150) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 19 | 0 | 0 (0–90) | 58 (0–164) | 0 | 0 (0–100) | 107 (0–150) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 20 | 0 | 0 (0–100) | 131 (0–164) | 0 | 0 | 103 (0–164) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 21 | 0 | 0 | 136 (0–181) | 0 | 0 (0–86) | 120 (0–164) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |

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
| Lenhador | ebony_wood | 25 | 14.5 (16/20) |
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
| steel_kite_shield | T3 shield | 25 | silver (25) | ebony_wood (25) | - | 3 | 14.5 (16/20) | BLOQUEIO (+12.5 d) |
| steel_greatsword | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 14.5 (16/20) | BLOQUEIO (+12.5 d) |
| steel_greataxe | T3 weapon | 25 | silver (25) | ebony_wood (25) | - | 3 | 14.5 (16/20) | BLOQUEIO (+12.5 d) |
| dragon_scale_armor | T4 armor | 45 | silver (25) | - (0) | - | 10 | 7 (18/20) | ok |
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | 14 (17/20) | > dia 21 (0/20) | BLOQUEIO (nunca em 21 d) |
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
| 6 | 23 (19–23) | 19 | 39 (38–40) | 4 | 0 |
| 7 | 26 (19–26) | 23 | 42 (40–42) | 4 (0–4) | 4 |
| 8 | 29 (23–29) | 23 (23–26) | 44 (42–45) | 4 | 0 (0–4) |
| 9 | 29 (23–29) | 26 (26–29) | 45 (43–48) | 0 | 4 |
| 10 | 31 (26–34) | 26 (26–29) | 47 (45–51) | 4 (4–8) | 0 |
| 11 | 31 (26–34) | 29 (29–31) | 49 (46–52) | 0 (0–4) | 4 |
| 12 | 34 (29–36) | 29 (29–31) | 50 (47–54) | 4 | 0 (0–4) |
| 13 | 34 (29–36) | 32 (31–34) | 52 (48–56) | 0 (0–4) | 4 |
| 14 | 36 (32–38) | 32 (31–34) | 53 (49–57) | 4 | 0 (0–4) |
| 15 | 36 (32–38) | 34 (34–36) | 53 (49–58) | 0 (0–4) | 4 |
| 16 | 38 (34–40) | 35 (34–38) | 55 (51–60) | 4 | 0 (0–4) |
| 17 | 39 (34–42) | 37 (36–40) | 56 (51–60) | 2 (0–4) | 4 |
| 18 | 41 (37–44) | 39 (36–41) | 57 (52–62) | 4 | 0 (0–4) |
| 19 | 42 (37–46) | 41 (38–43) | 58 (53–63) | 4 (0–4) | 4 |
| 20 | 44 (39–48) | 41 (38–45) | 59 (55–63) | 4 | 0 (0–4) |
| 21 | 45 (39–49) | 43 (40–46) | 60 (55–64) | 2 (0–4) | 4 |

#### Unidades coletadas por dia, por tier (mediana entre seeds)

| Dia | copper | iron | silver | common_wood | oak_wood | ebony_wood | common_herb | energy_herb | iron_thistle | uncommon_root | gold_blossom | swift_grass | moon_lily |
| --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | 0 | 0 | 23 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 8 | 0 | 0 | 0 | 0 |
| 3 | 35 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 4 | 5 | 0 | 0 |
| 4 | 0 | 50 | 0 | 0 | 50 | 0 | 0 (0–10) | 0 | 0 | 5 | 0 | 10 (0–10) | 0 |
| 5 | 65 (0–73) | 0 (0–65) | 0 | 0 | 65 | 0 | 5 (0–10) | 0 | 0 | 5 (0–10) | 0 (0–5) | 0 (0–10) | 0 |
| 6 | 0 (0–77) | 77 (0–80) | 0 | 0 | 0 | 0 | 0 (0–10) | 0 | 0 | 10 (5–10) | 0 | 0 | 0 |
| 7 | 0 (0–89) | 45 (0–89) | 0 | 0 (0–77) | 77 (0–86) | 0 | 0 (0–12) | 0 | 0 (0–12) | 5 (0–11) | 0 (0–6) | 0 (0–12) | 0 |
| 8 | 0 | 0 (0–100) | 98 (0–110) | 0 (0–89) | 0 | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 (0–12) | 0 (0–6) | 12 (0–12) | 0 |
| 9 | 0 | 0 | 0 | 0 | 89 (0–100) | 0 (0–98) | 6 (0–12) | 0 | 0 (0–12) | 0 (0–6) | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 10 | 0 | 0 (0–116) | 107 (0–120) | 0 | 0 | 0 | 0 (0–12) | 0 | 0 (0–12) | 0 (0–6) | 0 (0–6) | 12 (0–12) | 0 (0–12) |
| 11 | 0 (0–113) | 0 | 0 | 0 | 0 | 98 (98–110) | 6 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 3 (0–12) |
| 12 | 0 (0–113) | 0 | 113 (0–122) | 0 (0–107) | 0 | 0 | 12 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 6 (0–12) | 0 (0–12) |
| 13 | 0 (0–122) | 0 | 0 | 0 (0–120) | 0 | 110 (0–127) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 14 | 0 (0–122) | 0 | 126 (0–137) | 0 (0–127) | 0 | 0 | 12 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 15 | 0 (0–116) | 0 (0–144) | 0 | 0 | 0 | 129 (113–137) | 12 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 0 (0–12) |
| 16 | 0 (0–128) | 0 (0–150) | 128 (0–144) | 0 (0–137) | 0 (0–122) | 0 (0–140) | 0 (0–12) | 0 | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 17 | 0 (0–134) | 0 (0–150) | 0 (0–157) | 0 (0–137) | 0 | 134 (0–150) | 0 (0–12) | 0 (0–18) | 0 | 0 | 0 (0–6) | 12 (0–12) | 6 (0–12) |
| 18 | 0 (0–157) | 0 (0–140) | 143 (0–164) | 0 (0–131) | 0 | 0 (0–154) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 19 | 0 (0–154) | 0 | 0 (0–171) | 0 (0–131) | 0 | 147 (0–160) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 20 | 0 (0–157) | 0 (0–160) | 153 (0–177) | 0 (0–150) | 0 | 0 (0–167) | 0 (0–12) | 0 | 0 | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |
| 21 | 0 | 0 (0–164) | 0 (0–177) | 0 | 0 | 151 (134–171) | 0 (0–12) | 0 (0–18) | 0 (0–12) | 0 | 0 (0–6) | 0 (0–12) | 6 (0–12) |

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
| gilded_aegis | T4 armor | 50 | gold_ore (50) | - (0) | - | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| gilded_greaves | T4 boots | 50 | gold_ore (50) | - (0) | 1 | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| gilded_gauntlets | T4 gloves | 50 | gold_ore (50) | - (0) | 1 | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| gilded_helm | T4 helmet | 50 | gold_ore (50) | - (0) | - | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| ruby_ring | T4 ring | 50 | gold_ore (50) | - (0) | 25 | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| gilded_shield | T4 shield | 50 | gold_ore (50) | elven_wood (50) | - | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| gilded_warblade | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| dragon_flameblade | T4 weapon | 50 | silver (25) | elven_wood (50) | - | > dia 21 (8/20) | > dia 21 (0/20) | ok |
| gilded_waraxe | T4 weapon | 50 | gold_ore (50) | elven_wood (50) | - | > dia 21 (8/20) | > dia 21 (0/20) | ok |
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
| weapon | 2 | 4 | 13 (19/20) |
| armor | 2 | 4 | 9 (19/20) |
| gloves | 2 | 5 | 9 (16/20) |
| boots | 3 | 5 | 14 (17/20) |
| ring | 3 | 6 (19/20) | 14 (15/20) |
| helmet | 2 | 5 | 11 (16/20) |
| shield | 3 | 5 | 9.5 (18/20) |

### Controle dos tônicos: cenário A sem tônicos contra cenário A (a mesma seed)

|  | Chefe 25 vencido (dia por seed) | Andar 50 alcançado (dia por seed) | CP no dia 14 (mediana) | Nível no dia 14 |
| --: | --- | --- | --- | --- |
| Com tônicos (A) | 3 3 3 4 4 4 4 4 4 4 4 4 4 4 4 5 5 5 5 5 | 8 9 9 10 10 10 11 11 12 13 13 13 15 15 16 16 16 17 17 20 | 1 582 | 49 |
| Sem tônicos | 3 3 3 4 4 4 4 4 4 4 4 4 4 4 4 5 5 5 5 5 | 8 8 9 9 10 10 11 11 11 12 12 13 13 14 15 16 17 17 21 - | 1 785 | 49 |

| Dia em que a porta abre (mediana) | Com tônicos (A) | Sem tônicos |
| --: | --- | --- |
| iron (Mineração 10) | 3 | 3 |
| silver (Mineração 25) | 7 (18/20) | 8 |
| gold_ore (Mineração 50) | > dia 21 (0/20) | > dia 21 (1/20) |
| oak_wood (Lenhador 10) | 3 | 3 |
| ebony_wood (Lenhador 25) | 14.5 (16/20) | 15 (15/20) |
| elven_wood (Lenhador 50) | > dia 21 (0/20) | > dia 21 (0/20) |

### Passe de Aventureiro: dono (P) contra não-dono (A), mesma política e mesmas seeds (só as vantagens do Passe; a trilha não é resgatada)

| Quando | Medida (mediana entre seeds) | Sem Passe (A) | Com Passe (P) | Diferença do dono |
| --: | --- | --- | --- | --- |
| dia 7 | materiais recebidos por dia (média dos dias 1 até aqui) | 277 | 363 | +31% |
| dia 7 | materiais recebidos naquele dia | 474 | 715 | +50.7% |
| dia 7 | valor de referência dos materiais por dia (ouro) | 1 272 | 1 598 | +25.6% |
| dia 7 | valor de referência dos materiais naquele dia (ouro) | 2 360 | 3 770 | +59.7% |
| dia 7 | ouro ganho por dia (média dos dias 1 até aqui) | 889 | 1 072 | +20.6% |
| dia 7 | ouro ganho naquele dia | 356 | 691 | +94.4% |
| dia 7 | nível | 40 | 43 | +7.5% |
| dia 7 | CP | 1 081 | 1 154 | +6.8% |
| dia 7 | andar mais alto (highestDungeonFloor) | 32 | 38 | +19% |
| dia 14 | materiais recebidos por dia (média dos dias 1 até aqui) | 526 | 703 | +33.7% |
| dia 14 | materiais recebidos naquele dia | 887 | 532 | -40% |
| dia 14 | valor de referência dos materiais por dia (ouro) | 2 741 | 3 892 | +42% |
| dia 14 | valor de referência dos materiais naquele dia (ouro) | 4 963 | 2 263 | -54.4% |
| dia 14 | ouro ganho por dia (média dos dias 1 até aqui) | 826 | 1 273 | +54.1% |
| dia 14 | ouro ganho naquele dia | 349 | 538 | +54% |
| dia 14 | nível | 49 | 51 | +4.1% |
| dia 14 | CP | 1 582 | 2 013 | +27.3% |
| dia 14 | andar mais alto (highestDungeonFloor) | 54 | 72 | +33.3% |

| Marco | Dia sem Passe (mediana) | Dia com Passe (mediana) | Dono adiantado em (dias) |
| --: | --- | --- | --- |
| primeira peça forjada | 2 | 2 | 0 |
| checkpoint 10 | 1 | 1 | 0 |
| segunda zona de caça | 4 | 4 | 0 |
| chefe 25 vencido | 4 | 4 | 0 |
| chegada ao andar 50 | 13 | 10 | 3 |
| chefe 50 vencido | 14.5 | 10.5 | 4 |

### Habilidades: os três caminhos (Guerreiro = cenário A, Guardião, Caçador) contra o mesmo jogador sem habilidades (Z), mesma política e mesmas seeds

| Quando | Medida (mediana entre seeds) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- | --- |
| dia 7 | materiais recebidos por dia (média dos dias 1 até aqui) | 210 | 277 (+31.7%) | 228 (+8.6%) | 249 (+18.4%) |
| dia 7 | valor de referência dos materiais por dia (ouro) | 889 | 1 272 (+43.2%) | 971 (+9.2%) | 1 108 (+24.7%) |
| dia 7 | ouro ganho por dia (média dos dias 1 até aqui) | 869 | 889 (+2.3%) | 866 (-0.4%) | 857 (-1.4%) |
| dia 7 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 40 | 55 (+36.3%) | 42 (+4.6%) | 46 (+15.4%) |
| dia 7 | nível | 38 | 40 (+5.3%) | 39 (+1.3%) | 39 (+2.6%) |
| dia 7 | CP | 804 | 1 081 (+34.4%) | 846 (+5.2%) | 824 (+2.5%) |
| dia 7 | andar mais alto | 29 | 32 (+8.6%) | 30 (+3.4%) | 30 (+3.4%) |
| dia 14 | materiais recebidos por dia (média dos dias 1 até aqui) | 415 | 526 (+26.8%) | 393 (-5.3%) | 481 (+15.8%) |
| dia 14 | valor de referência dos materiais por dia (ouro) | 2 074 | 2 741 (+32.2%) | 1 952 (-5.9%) | 2 454 (+18.3%) |
| dia 14 | ouro ganho por dia (média dos dias 1 até aqui) | 619 | 826 (+33.6%) | 618 (-0%) | 640 (+3.5%) |
| dia 14 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 52 | 75 (+43%) | 54 (+2.7%) | 57 (+8.6%) |
| dia 14 | nível | 48 | 49 (+2.1%) | 48 (+0%) | 48 (+0%) |
| dia 14 | CP | 1 270 | 1 582 (+24.5%) | 1 366 (+7.6%) | 1 358 (+6.9%) |
| dia 14 | andar mais alto | 40 | 54 (+35%) | 40 (+0%) | 40 (+0%) |

| Marco (dia, mediana) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- |
| primeira peça forjada | 2 | 2 | 2 | 2 |
| checkpoint 10 | 1 | 1 | 1 | 1 |
| segunda zona de caça | 5 | 4 | 5 | 5 |
| chefe 25 vencido | 5 | 4 | 5 | 5 |
| chegada ao andar 50 | 17 | 13 | 16 | 16 |
| chefe 50 vencido | 18 | 14.5 | 17 | 18 |

### Diagnóstico do chefe do andar 25

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário A)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 1 | 133 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 4 (3–5) | 646 (540–711) | arma T2 / armadura T2, nível 32 (27–35) | 20/20 seeds |

#### Diagnóstico: chefe do andar 25 (CP recomendado pelo jogo: 643; andar 24: 118) contra heróis montados à mão, sem poções, de HP cheio

| Equipamento | Nível | CP | Sobe do andar 1 ao 24 de uma vez | Limpa o andar 24 | Vence o chefe do 25 |
| --: | --- | --- | --- | --- | --- |
| Roupa de trapos + Clava | 30 | 217 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 60 | 412 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 100 | 727 | 20/20 | 20/20 | 20/20 |
| Tier 1 (adaga + couro) +0 | 40 | 420 | 20/20 | 20/20 | 0/20 |
| Tier 1 +8 | 40 | 566 | 20/20 | 20/20 | 2/20 |
| Tier 1 +8 | 60 | 760 | 20/20 | 20/20 | 20/20 |
| Tier 2 (espada + cota) +0 | 40 | 569 | 20/20 | 20/20 | 1/20 |
| Tier 2 +4 | 40 | 702 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 40 | 845 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 60 | 1 078 | 20/20 | 20/20 | 20/20 |
| Tier 3 (montante + placas) +0 | 40 | 870 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 40 | 1 385 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 60 | 1 691 | 20/20 | 20/20 | 20/20 |
| Tier 4 (lâmina dourada + égide) +8 | 100 | 3 007 | 20/20 | 20/20 | 20/20 |

### Diagnóstico da curva de inimigos

#### Curva de inimigos em volta dos chefes: HP × dano por golpe

| Chefe (andar) | Andar anterior (N−1) | Chefe (N) | Andar seguinte (N+1) | (N+1) / (N−1) | Chefe / (N−1) |
| --: | --- | --- | --- | --- | --- |
| 25 | 200 × 23 = 4 600 | 1 036 × 171 = 177 156 | 1 544 × 192 = 296 448 | 64.45 | 38.5 |
| 50 | 2 665 × 324 = 863 460 | 5 517 × 267 = 1 473 039 | 2 652 × 343 = 909 636 | 1.05 | 1.7 |
| 75 | 3 728 × 478 = 1 781 984 | 9 084 × 436 = 3 960 624 | 8 759 × 441 = 3 862 719 | 2.17 | 2.2 |
| 100 | 11 226 × 563 = 6 320 238 | 14 279 × 682 = 9 738 278 | - | - | 1.5 |


## Dias 21 a 180 (rodada 15, 2026-10-13)

O restante deste documento mede as primeiras 3 semanas. A segunda metade do jogo é medida por `npm run sim:long` (`scripts/sim/longHaul.sim.ts`, o mesmo jogador de `npm run sim` com a bandeira `long`; leia o cabeçalho do arquivo para o que ele modela e o que não). **Medição: 6 seeds x 180 dias, sem peças únicas (`SIM_NO_UNIQUES=1`), no commit desta rodada.** Marcos, seeds mais rápidas, antes e depois estão em `docs/BALANCE_CHANGES.md`, Rodada 15; abaixo a tabela de 10 em 10 dias dos dois jogadores.

- **Como reproduzir:** `SIM_NO_UNIQUES=1 npm run sim:long` (uns 15 min com 7 processos; `LONG_SEEDS=3 LONG_WORKERS=6` para uma passada de 7 min). `LONG_SCEN=A` só o jogador comum. Para trocar um número sem editar o código: `SIM_T='{"battle":{"lateHpGrowth2":0.07}}'`, `SIM_ZONES`, `SIM_GEAR`, `SIM_GATES`.
- **A coluna "Tier vestido"** é a mediana dos 7 slots / o pior slot. **"Trava"** é o que impede o próximo passo no fim do dia (moda entre as seeds): `nível` = a peça seguinte pede um nível do herói que ainda não chegou, `materiais` / `ouro` = falta isso, `pronto` = só falta forjar, `tudo forjado`; e na masmorra `CP` = o herói não passa do próximo andar / profundeza.
- **O que a tabela mostra** (jogador comum): o nível 60 no dia 38 e o 100 no 141; o conjunto T4 no 39, o T5 no 83, o T6 no 142; o chefe do 75 no 37,5 e o do 100 no 136,5; as Profundezas depois disso (profundeza ~35 no dia 180); o Paragon a cada 2-4 dias depois do nível 100. O XP por dia sobe de ~10 mil (dias 1-10) a ~200 mil (a partir do dia 60, só a Caça da última zona), e é a Caça, não a Masmorra, que paga quase tudo.

### Cenário A (jogador comum, sem Passe): 6 seeds, 180 dias

| Dia | Nível | Andar | Profundeza | Tier vestido: mediana / pior slot | CP | Horas de caça nos 10 dias por zona (z1 / z2 / z3 / z4) | Paragon | Trava: forja; masmorra |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 42 (40–43) | 31 (30–37) | 0 | 2 / 2 | 1 060 (929–1 307) | 15 / 8 / 0 / 0 | 0 | materiais; CP |
| 20 | 52 (51–52) | 60 | 0 | 3 / 3 | 1 791 (1 672–1 870) | 10 / 26 / 4 / 0 | 0 | materiais; CP |
| 30 | 55 (54–56) | 75 (60–76) | 0 | 4 / 3 | 2 433 (1 837–2 709) | 0 / 10 / 23 / 0 | 0 | materiais; CP |
| 40 | 61 (57–62) | 76 (70–78) | 0 | 4 / 3.5 | 2 648 (2 576–2 965) | 0 / 9 / 57 / 20 | 0 | nível; CP |
| 50 | 64 (61–66) | 76 (75–78) | 0 | 4 / 4 | 2 761 (2 582–3 110) | 0 / 2 / 12 / 41 | 0 | nível; CP |
| 60 | 70 (65–71) | 80 (75–83) | 0 | 4 / 4 | 4 055 (2 712–4 296) | 0 / 2 / 22 / 82 | 0 | nível; CP |
| 70 | 75 (68–76) | 86 (75–88) | 0 | 5 / 4 | 4 699 (2 786–5 159) | 0 / 2 / 34 / 65 | 0 | nível; CP |
| 80 | 80 (73–81) | 88 (82–90) | 0 | 5 / 4 | 5 062 (4 265–5 505) | 0 / 0 / 15 / 95 | 0 | nível; CP |
| 90 | 84 (78–85) | 89 (86–90) | 0 | 5 / 5 | 5 325 (4 834–5 667) | 0 / 0 / 4 / 111 | 0 | nível; CP |
| 100 | 88 (82–89) | 90 (88–90) | 0 | 5 / 5 | 5 506 (5 214–5 850) | 0 / 0 / 1 / 118 | 0 | nível; CP |
| 110 | 91 (86–92) | 94 (90–100) | 0 | 5 / 5 | 7 121 (5 622–7 733) | 0 / 0 / 9 / 104 | 0 | nível; CP |
| 120 | 95 (90–95) | 100 (90–100) | 0 | 5.5 / 5 | 7 921 (6 282–8 482) | 0 / 0 / 5 / 109 | 0 | nível; CP |
| 130 | 97 (93–98) | 100 (93–100) | 0 (0–33) | 6 / 5 | 8 191 (6 622–9 092) | 0 / 0 / 10 / 98 | 0 | nível; CP |
| 140 | 100 (95–100) | 100 | 27 (0–35) | 6 / 5.5 | 8 714 (8 152–9 646) | 0 / 0 / 6 / 109 | 0 (0–2) | tudo forjado; CP |
| 150 | 100 (98–100) | 100 | 32 (0–40) | 6 / 6 | 8 892 (8 400–9 837) | 0 / 0 / 2 / 117 | 4 (0–6) | tudo forjado; CP |
| 160 | 100 | 100 | 34 (0–42) | 6 / 6 | 9 214 (8 561–10 024) | 0 / 0 / 2 / 113 | 8 (1–10) | tudo forjado; CP |
| 170 | 100 | 100 | 34 (0–42) | 6 / 6 | 9 383 (8 720–10 208) | 0 / 0 / 0 / 120 | 12 (5–14) | tudo forjado; CP |
| 180 | 100 | 100 | 35 (31–43) | 6 / 6 | 9 549 (8 875–10 389) | 0 / 0 / 0 / 120 | 16 (9–18) | tudo forjado; CP |

XP por dia e Ouro em caixa (média dos 10 dias até o dia, mediana entre seeds):

| Dia | XP total | Masmorra | Caça | Pedidos | Missões e outros | Ouro em caixa |
| --: | --- | --- | --- | --- | --- | --- |
| 10 | 10 694 | 403 | 6 741 | 3 517 | 0 | 438 |
| 20 | 33 585 | 644 | 14 488 | 17 226 | 0 | 3 295 |
| 30 | 32 030 | 427 | 22 025 | 8 193 | 0 | 7 371 |
| 40 | 100 582 | 92 | 81 570 | 16 159 | 0 | 12 991 |
| 50 | 65 574 | 14 | 59 636 | 7 408 | 0 | 24 955 |
| 60 | 171 175 | 87 | 166 827 | 2 902 | 0 | 26 385 |
| 70 | 172 195 | 148 | 150 882 | 19 395 | 0 | 22 803 |
| 80 | 193 292 | 95 | 171 564 | 19 887 | 0 | 29 195 |
| 90 | 204 022 | 48 | 194 957 | 10 069 | 0 | 34 767 |
| 100 | 205 531 | 0 | 202 755 | 2 755 | 0 | 41 078 |
| 110 | 188 428 | 177 | 187 156 | 5 615 | 0 | 37 621 |
| 120 | 201 924 | 53 | 187 166 | 15 967 | 0 | 27 907 |
| 130 | 177 750 | 60 | 174 302 | 7 661 | 0 | 29 944 |
| 140 | 208 314 | 207 | 192 236 | 9 048 | 0 | 27 804 |
| 150 | 203 329 | 143 | 202 773 | 1 849 | 0 | 44 747 |
| 160 | 203 858 | 69 | 202 777 | 3 718 | 0 | 51 190 |
| 170 | 204 068 | 0 | 202 775 | 1 296 | 0 | 55 997 |
| 180 | 203 761 | 71 | 202 775 | 216 | 0 | 60 719 |

### Cenário P (dono do Passe de Aventureiro, só os benefícios): 6 seeds, 180 dias

| Dia | Nível | Andar | Profundeza | Tier vestido: mediana / pior slot | CP | Horas de caça nos 10 dias por zona (z1 / z2 / z3 / z4) | Paragon | Trava: forja; masmorra |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 50 (49–50) | 54 (40–60) | 0 | 3 / 2 | 1 732 (1 437–1 961) | 24 / 40 / 0 / 0 | 0 | materiais; CP |
| 20 | 57 (55–58) | 75 (75–78) | 0 | 4 / 3 | 2 539 (2 463–2 831) | 1 / 31 / 36 / 3 | 0 | materiais; CP |
| 30 | 63 (61–65) | 75 (75–79) | 0 | 4 / 4 | 2 732 (2 625–3 107) | 0 / 13 / 85 / 35 | 0 | nível; CP |
| 40 | 68 (66–72) | 77 (75–85) | 0 | 4 / 4 | 2 937 (2 771–4 351) | 0 / 11 / 57 / 53 | 0 | nível; CP |
| 50 | 72 (70–78) | 82 (79–87) | 0 | 4 / 4 | 4 399 (3 665–4 966) | 0 / 9 / 35 / 73 | 0 | nível; CP |
| 60 | 77 (75–82) | 87 (82–90) | 0 | 5 / 4 | 4 892 (4 323–5 294) | 0 / 0 / 20 / 80 | 0 | nível; CP |
| 70 | 81 (78–87) | 90 (88–90) | 0 | 5 / 5 | 5 282 (5 119–5 546) | 0 / 0 / 15 / 95 | 0 | nível; CP |
| 80 | 87 (82–91) | 90 (88–100) | 0 | 5 / 5 | 5 718 (5 367–8 283) | 0 / 0 / 5 / 131 | 0 | nível; CP |
| 90 | 91 (87–95) | 100 (90–100) | 0 (0–33) | 5 / 5 | 7 748 (6 118–8 597) | 0 / 0 / 8 / 137 | 0 | nível; CP |
| 100 | 95 (91–98) | 100 | 15 (0–35) | 6 / 5 | 8 184 (7 410–8 880) | 0 / 0 / 16 / 125 | 0 | nível; CP |
| 110 | 99 (94–100) | 100 | 32 (0–35) | 6 / 5 | 8 625 (8 258–9 297) | 0 / 0 / 11 / 129 | 0 (0–4) | nível; CP |
| 120 | 100 (97–100) | 100 | 33 (0–37) | 6 / 6 | 9 155 (8 782–9 617) | 0 / 0 / 4 / 148 | 4 (0–9) | tudo forjado; CP |
| 130 | 100 | 100 | 36 (29–41) | 6 / 6 | 9 420 (8 490–9 846) | 0 / 0 / 1 / 155 | 9 (0–14) | tudo forjado; CP |
| 140 | 100 | 100 | 36 (30–42) | 6 / 6 | 9 636 (8 741–10 113) | 0 / 0 / 0 / 160 | 15 (6–19) | tudo forjado; CP |
| 150 | 100 | 100 | 36 (30–43) | 6 / 6 | 9 847 (8 945–10 330) | 0 / 0 / 0 / 160 | 20 (11–24) | tudo forjado; CP |
| 160 | 100 | 100 | 36 (33–43) | 6 / 6 | 10 054 (9 183–10 543) | 0 / 0 / 0 / 160 | 25 (17–29) | tudo forjado; CP |
| 170 | 100 | 100 | 37 (35–43) | 6 / 6 | 10 236 (9 378–10 711) | 0 / 0 / 0 / 160 | 29 (22–33) | tudo forjado; CP |
| 180 | 100 | 100 | 37 (36–44) | 6 / 6 | 10 415 (9 530–10 876) | 0 / 0 / 0 / 160 | 33 (26–37) | tudo forjado; CP |

### Dono contra não-dono (mediana de dias)

| Marco | Sem Passe (A), dia | Com Passe (P), dia | Dono mais rápido em |
| --: | --- | --- | --- |
| nível 50 | 17 | 10 | 41% |
| nível 60 | 38 | 24.5 | 36% |
| nível 70 | 59 | 42.5 | 28% |
| nível 75 | 71 | 57 | 20% |
| nível 80 | 81 | 67.5 | 17% |
| nível 90 | 106 | 87 | 18% |
| nível 100 | 141 | 114 | 19% |
| andar 50 (chegada) | 15 | 10 | 33% |
| chefe do andar 50 vencido | 16.5 | 10.5 | 36% |
| andar 75 (chegada) | 30 | 19.5 | 35% |
| chefe do andar 75 vencido | 37.5 | 33.5 | 11% |
| andar 100 (chegada) | 115 | 89 | 23% |
| chefe do andar 100 vencido (abre as Profundezas) | 136.5 | 100 | 27% |
| zona de caça 3 liberada | 16.5 | 10.5 | 36% |
| zona de caça 4 (a última) liberada | 37.5 | 33.5 | 11% |
| conjunto T4 vestido (7 peças) | 39 | 28 | 28% |
| conjunto T5 vestido | 83 | 67.5 | 19% |
| conjunto T6 vestido | 142 | 114 | 20% |
| arma T4 / T5 / T6 vestida: T4 | 26.5 | 16 | 40% |
| arma T5 vestida | 59 | 42.5 | 28% |
| arma T6 vestida | 108.5 | 87 | 20% |
| profundeza 10 | 136.5 | 100 | 27% |
| profundeza 20 | 137 | 100.5 | 27% |
| profundeza 25 | 138 | 101.5 | 26% |
| profundeza 30 | 141 | 103 | 27% |
| profundeza 40 | > 180 | > 180 | - |
| profundeza 50 | > 180 | > 180 | - |
| Paragon 1 | 143 | 116 | 19% |
| Paragon 10 | 164.5 | 131.5 | 20% |
| Paragon 25 | > 180 | 161 | - |
| Paragon 50 | > 180 | > 180 | - |

## Dias 21 a 180 depois da rodada 17 (2026-10-13)

Mesma ferramenta (`SIM_NO_UNIQUES=1 npm run sim:long`), agora com **12 seeds** por cenário (~11 min com 8 processos), no código da rodada 17 (docs/BALANCE_CHANGES.md): as zonas 3 e 4 dropam menos (Osso x0,34, Sangue x0,30, Cristal x0,25, Tutano e Coração x0,12, Estilhaço x0,25, Chifre x0,12), os custos em unidades foram reescritos para as mesmas horas de caça, os andares 76-100 ficaram mais duros (`lateHpGrowth2` 0,125, `lateDmgGrowth2` 0,078, chefe do 100 x1,17) e as Profundezas foram reajustadas. As tabelas das seções anteriores (6 seeds, rodada 15/16) continuam sendo o registro daquele momento; **os marcos abaixo substituem os de nível, de conjunto, de andar 100, de chefe 100 e de profundeza**.

Resumo (mediana de 12 seeds, comum A / dono P): nível 60 / 75 / 90 / 100 nos dias 43 / 69,5 / 105,5 / 145 (A) e 25,5 / 50,5 / 77 / 105 (P); conjunto T4 / T5 / T6 nos 32 / 87 / 149 (A, 3 seeds sem o T6 em 180 dias) e 21 / 58,5 / 110 (P); andar 100 no 123,5 (A) e 86 (P); chefe do 100 no 143 (A) e 102,5 (P); profundeza 10 no mesmo dia do chefe; peça +12 no 79,5 (A) e 62 (P); Paragon 1 no 149,5 (A) e 107 (P). Livro-razão dos dias 60-180: perda de 25,8% (A) e 17,3% (P) do valor de referência (era 57,9% e 77,7%). Maior trecho sem desbloqueio depois do nível 100 e do T6, sem Paragon: A 27 (pior 32) dias, P 30 (pior 65); com Paragon 2 (pior 4) e 2 (pior 5).

### Dono contra não-dono (mediana de dias, 12 seeds)

| Marco | Sem Passe (A), dia | Com Passe (P), dia | Dono mais rápido em |
| --: | --- | --- | --- |
| nível 50 | 17 | 10 | 41% |
| nível 60 | 43 | 25.5 | 41% |
| nível 70 | 57.5 | 37 | 36% |
| nível 75 | 69.5 | 50.5 | 27% |
| nível 80 | 81 | 58 | 28% |
| nível 90 | 105.5 | 77 | 27% |
| nível 100 | 145 | 105 | 28% |
| andar 50 (chegada) | 15 | 10 | 33% |
| chefe do andar 50 vencido | 17 | 11 | 35% |
| andar 75 (chegada) | 30 | 18 | 40% |
| chefe do andar 75 vencido | 34 | 21 | 38% |
| andar 100 (chegada) | 123.5 | 86 | 30% |
| chefe do andar 100 vencido (abre as Profundezas) | 143 | 102.5 | 28% |
| zona de caça 3 liberada | 17 | 11 | 35% |
| zona de caça 4 (a última) liberada | 34 | 21 | 38% |
| conjunto T4 vestido (7 peças) | 32 | 21 | 34% |
| conjunto T5 vestido | 87 | 58.5 | 33% |
| conjunto T6 vestido | 149 | 110 | 26% |
| arma T4 / T5 / T6 vestida: T4 | 27.5 | 16 | 42% |
| arma T5 vestida | 57.5 | 37 | 36% |
| arma T6 vestida | 112 | 80.5 | 28% |
| profundeza 10 | 143 | 102.5 | 28% |
| profundeza 20 | 143 | 102.5 | 28% |
| profundeza 25 | 143.5 | 102.5 | 29% |
| profundeza 30 | 143.5 | 102.5 | 29% |
| profundeza 40 | 150.5 | 103 | 32% |
| profundeza 50 | > 180 | 150 | - |
| peça refinada a +9 | 62 | 42 | 32% |
| peça refinada a +10 | 62 | 43 | 31% |
| peça refinada a +11 | 64.5 | 47 | 27% |
| peça refinada a +12 | 79.5 | 62 | 22% |
| Paragon 1 | 149.5 | 107 | 28% |
| Paragon 10 | 170 | 124 | 27% |
| Paragon 25 | > 180 | 154 | - |
| Paragon 50 | > 180 | > 180 | - |

## Liga (rodada 20, 2026-10-15)

O XP do herói vem só da Caça. Medido com `npm run sim` (20 seeds x 21 dias, com únicos) e com 12 seeds x 60 dias (`SIM_NO_UNIQUES=1 LONG_DAYS=60 LONG_SEEDS=12 npm run sim:long`). A explicação completa está em `BALANCE_CHANGES.md`, Rodada 20.

### Guarda dos dias 1 a 21 (cenário A), antes -> depois

| Meta | Antes (rodada 19) | Depois | Faixa nova |
| --- | --- | --- | --- |
| T2 primeira sessão termina no andar | 8 | 8 | >= 8 |
| T2 checkpoint do andar 10 | dia 1 | dia 2 | **até o dia 2** (era dia 1) |
| T3 primeira peça forjada | dia 2 | dia 2 | <= dia 2 |
| T4 nível | dia 1 / 3 / 14: 13 / 30 / 50 | dia 2 / 3 / 14: 24 / 24 / 47 (44-48) | **dia 2 / 3 / 14: 20-28 / 20-29 / 45-60** (a faixa do dia 1 saiu: o nível do fim do dia 1 é 1) |
| T5 chefe 25 | dia 4 | dia 5 | dia 4-6 |
| T6 chegada ao andar 50 | primeira seed 9, mediana 12 | primeira seed 10, mediana 14 | nenhuma seed antes do dia 10 |
| T6 chefe 50 | mediana 12 | primeira seed 11, mediana 14 | por volta dos dias 12-16 (a primeira seed fica 1 dia fora, como já estava) |
| T7 / T8 | 1,08 / 75% | 1,08 / 75% | iguais |
| I1 a I4 | ok | ok (dia 6; +0% / +20% / +25%) | iguais |

### Ritmo da Liga (12 seeds x 60 dias): nível do herói no fim do dia, mediana (mais lenta - mais rápida)

| Dia | Dono do Passe (P) | Sem Passe (A) |
| --: | --- | --- |
| 7 | 44 (42-44) | 37 (35-37) |
| 14 | 50 (48-51) | 47 (46-48) |
| 30 | 64,5 (60-69) | 56 (53-59) |
| 45 | 75,5 (70-80) | 65 (61-67) |
| 60 | 87 (76-90) | 73,5 (68-74) |

Marcos (mediana de dias, A / P): nível 50 22 / 14, nível 60 37 / 24, nível 70 51 / 34,5, nível 75 > 60 / 44,5, nível 80 > 60 / 51; zona de Caça 4 31,5 / 23,5; arma T5 51 / 35; conjunto T5 > 60 / 53. Ninguém chega ao nível 100 em 60 dias. `npm run sim:long` completo (6 seeds x 180 dias): nível 90 no dia 94 (A) e 64 (P); nível 100 no dia 125 (A) e 87 (P); andar 100 no 107 e 67; conjunto T6 no 133 e 87,5.
