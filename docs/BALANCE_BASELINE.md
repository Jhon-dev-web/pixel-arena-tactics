# Baseline de balanceamento: as primeiras horas de um jogador novo (depois das rodadas 1 e 2 do pacote de balanceamento)

- **Data:** 2026-10-10
- **Commit medido:** o commit `balance: slow levelling, per-boss tuning and a real orc biome climb` (rodada 2, o que regenera este documento), na branch `claude/project-thread-ppdm57`, em cima do commit `09540a6` (rodada 1). O baseline anterior a qualquer mudança (commit `dbb65b5`) está em [`BALANCE_BASELINE_2026-10-10_pre.md`](BALANCE_BASELINE_2026-10-10_pre.md). Cada valor alterado, o motivo e o antes/depois de cada meta estão em [`BALANCE_CHANGES.md`](BALANCE_CHANGES.md) (seção 1 a 6: rodada 1; "Rodada 2": esta).
- **Como reproduzir:** `npm run sim` (cerca de 6 s para 20 seeds x 21 dias x 2 cenários; eram 14 dias até a rodada 1, e 21 permite ver a janela do andar 50). Código em `scripts/sim/` (`driver.ts`, `player.ts`, `progression.sim.ts`, `ladder.ts`). A política está documentada no topo de `progression.sim.ts`. A tabela de CP recomendado por andar é gerada por `npm run sim:cp` (`cpTable.gen.ts` -> `src/game/recommendedCp.ts`).
- **Quem é o jogador simulado:** conta nova, sem Battle Pass, 2 visitas por dia (09h e 21h, com variação de até 90 min por seed), usa todas as 10 sessões grátis de Masmorra por dia, caça o resto do tempo e só minera/corta/planta quando o próximo equipamento exige.

## Resumo para quem tem pressa

1. **Começo (rodada 1, inalterado):** a Bolsa de Caça de 3 espaços não perde nada numa caça de 4 h; primeira peça forjada no dia 2 em 20/20 seeds; a primeira sessão termina no andar 8 e o checkpoint do andar 10 vem no dia 1.
2. **O nível voltou a ser um eixo de progressão.** Com o XP dos Pedidos x 0,02 (e a Caça x 0,1 da rodada 1), a mediana é nível 13 no dia 1, 29 no dia 3 (27–34, um nível acima da faixa 20–28) e 46 no dia 14 (44–48, dentro da faixa 45–60). Caça e Pedidos agora pagam o mesmo tanto, de alguns milhares a cerca de 20 mil XP por dia cada (os Pedidos pagavam 300 a 750 mil).
3. **O chefe do andar 25 cai no dia 5 (4–6)** com um herói de CP 380 (331–414), nível 34, arma e armadura tier 2. Quem acaba de limpar o andar 24 (CP 119) perde sempre. O chefe agora é uma multiplicação própria (`boss25HpMult` 0,22) e **não** mexe mais nos andares 76 a 99, que voltaram aos valores originais.
4. **O bioma dos orcs (26–49) virou uma escalada de verdade.** Quem vence o chefe 25 limpa os andares 26 a 29 no mesmo dia (andar 30, o checkpoint, é o próximo muro), e depois sobe alguns andares por dia: andar 38 no dia 9, 44 no dia 11. A chegada ao andar 50 é no dia 12 (mediana; primeira seed no dia 10) no A e dia 11 (primeira seed no dia 10) no B. O chefe 50 só cai a partir do dia 12 (A) / 13 (B), em 6/20 e 2/20 seeds em 21 dias.
5. **Na Masmorra, poucas sessões por dia fazem o avanço.** Com a parede do momento (chefe 25 até o dia 5, checkpoints 30 e 40, chefe 50) a maioria das 10 sessões diárias termina no primeiro andar de derrota (mediana de 0 andares limpos por sessão, 8 a 16 s cada); o ouro da Masmorra continua perto de zero depois do dia 1.

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
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–28 / 45–60) | 13 / 29 (27–34) / 46 (44–48) | 13 / 30 (25–33) / 45 (42–47) | dia 1 ok; dia 3 FORA DA META; dia 14 ok |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 5; vitória ao chegar: 0% | dia 5; vitória ao chegar: 0% | ok |
| T6 | Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16 | chegada: primeira seed no dia 10, mediana 12; chefe 50: primeira seed no dia 12, mediana depois do dia 21, 6/20 em 21 dias | chegada: primeira seed no dia 10, mediana 11; chefe 50: primeira seed no dia 13, mediana depois do dia 21, 2/20 em 21 dias | chegada ok; chefe ok |
| T7 | Andar depois de um chefe (HP × dano) ≥ andar antes dele, nos chefes 25, 50 e 75 | menor razão (N+1)/(N−1): 2.14 | - | ok |
| T8 | Derrota mantém 75% do ouro da sessão | 75% | - | ok |

#### B contra A: o Cenário B não pode ser mais de ~1,5 dia mais rápido que o A em nenhum marco

| Marco | Dia no A (mediana de quem chegou; seeds que chegaram) | Dia no B | A − B (dias) | Resultado |
| --: | --- | --- | --- | --- |
| Primeira peça forjada | 2 (20/20) | 2 (20/20) | 0 | ok |
| Primeiro refino | 3 (20/20) | 3 (20/20) | 0 | ok |
| Checkpoint do andar 10 | 1 (20/20) | 1 (20/20) | 0 | ok |
| Chefe do andar 25 | 5 (20/20) | 5 (20/20) | 0 | ok |
| Zona de caça 2 | 5 (20/20) | 5 (20/20) | 0 | ok |
| Chefe do andar 50 | 13 (6/20) | 16.5 (2/20) | -3.5 | ok |

### Cenário A (pedido): 2 visitas por dia

Seeds: 20 · dias simulados: 21 · cada célula = mediana (mín–máx) entre seeds · valores no FIM de cada dia (depois da visita da noite).

#### Progressão

| Dia | Nível | CP | Andar (a próxima sessão começa nele) | Tier arma | Tier armadura |
| --: | --- | --- | --- | --- | --- |
| 1 | 13 | 119 | 24 | 0 | 0 |
| 2 | 23 (23–24) | 215 (211–248) | 25 | 1 | 0 (0–1) |
| 3 | 29 (27–34) | 272 (255–317) | 25 | 1 | 1 |
| 4 | 32 (29–38) | 315 (262–359) | 25 (25–28) | 1 (1–2) | 1 |
| 5 | 36 (33–40) | 472 (347–534) | 30 (25–30) | 2 | 2 (1–2) |
| 6 | 36 (35–41) | 487 (452–534) | 30 (30–38) | 2 | 2 |
| 7 | 38 (36–42) | 496 (466–586) | 30 (30–40) | 2 | 2 |
| 8 | 39 (38–43) | 523 (481–586) | 32 (30–40) | 2 | 2 |
| 9 | 40 (38–43) | 533 (481–586) | 38 (30–40) | 2 | 2 |
| 10 | 42 (39–44) | 603 (489–740) | 40 (30–50) | 3 (2–3) | 2 |
| 11 | 43 (41–45) | 696 (496–805) | 44 (30–50) | 3 (2–3) | 2 |
| 12 | 45 (42–47) | 769 (575–847) | 50 (40–51) | 3 (2–3) | 2 (2–3) |
| 13 | 46 (43–47) | 789 (584–847) | 50 (40–51) | 3 (2–3) | 2 (2–3) |
| 14 | 46 (44–48) | 795 (738–854) | 50 (47–51) | 3 | 2 (2–3) |
| 15 | 47 (44–48) | 801 (738–857) | 50 (50–51) | 3 | 2 (2–3) |
| 16 | 47 (45–49) | 805 (738–861) | 50 (50–51) | 3 | 2 (2–3) |
| 17 | 47 (46–49) | 805 (747–864) | 50 (50–51) | 3 | 2 (2–3) |
| 18 | 47 (46–49) | 809 (747–867) | 50 (50–51) | 3 | 2 (2–3) |
| 19 | 48 (46–49) | 813 (747–867) | 50 (50–51) | 3 | 2 (2–3) |
| 20 | 48 (46–50) | 815 (747–871) | 50 (50–51) | 3 | 2 (2–3) |
| 21 | 48 (46–50) | 819 (756–871) | 50 (50–51) | 3 | 2 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 7 119 (7 119–8 469) | 129 | 6 990 | 0 (0–1 350) |
| 3 | 11 826 (5 590–32 327) | 0 | 9 086 (0–9 099) | 5 600 (0–23 240) |
| 4 | 7 528 (0–22 185) | 0 (0–905) | 0 | 7 528 (0–21 280) |
| 5 | 19 419 (11 639–29 643) | 1 190 (0–1 190) | 9 093 (0–18 193) | 8 968 (1 425–15 620) |
| 6 | 5 320 (0–21 326) | 0 (0–1 460) | 0 (0–14 480) | 1 388 (0–12 243) |
| 7 | 11 086 (0–38 320) | 0 (0–1 805) | 9 098 (0–14 497) | 2 025 (0–22 026) |
| 8 | 10 676 (1 068–27 714) | 0 (0–1 292) | 9 092 (0–14 490) | 4 193 (0–22 120) |
| 9 | 2 319 (0–27 135) | 0 (0–1 127) | 0 (0–14 493) | 1 313 (0–12 150) |
| 10 | 18 835 (1 425–32 369) | 0 (0–2 105) | 14 473 (0–18 849) | 2 220 (0–12 227) |
| 11 | 24 027 (9 096–43 213) | 618 (0–2 545) | 18 821 (0–28 948) | 6 110 (0–22 960) |
| 12 | 31 061 (10 920–63 675) | 404 (0–3 910) | 18 830 (0–37 677) | 12 419 (0–23 893) |
| 13 | 18 259 (1 740–41 650) | 0 (0–2 105) | 0 (0–33 320) | 12 555 (0–23 333) |
| 14 | 14 043 (2 850–24 256) | 0 (0–1 502) | 0 (0–16 654) | 12 622 (2 850–23 613) |
| 15 | 12 886 (2 700–23 426) | 0 (0–707) | 0 (0–18 838) | 12 426 (390–23 426) |
| 16 | 12 458 (0–22 773) | 0 | 0 | 12 458 (0–22 773) |
| 17 | 10 835 (1 665–24 360) | 0 | 0 (0–18 821) | 10 610 (1 350–24 360) |
| 18 | 9 350 (0–22 680) | 0 | 0 (0–18 848) | 9 138 (0–22 680) |
| 19 | 7 465 (0–24 080) | 0 | 0 | 7 465 (0–24 080) |
| 20 | 11 455 (0–23 894) | 0 | 0 (0–18 835) | 10 920 (0–23 894) |
| 21 | 8 502 (0–22 494) | 0 (0–707) | 0 (0–18 830) | 6 228 (0–22 494) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 6 (6–7) | 100% |
| 3 | 0 | 8 (7–8) | 100% |
| 4 | 0 (0–0.3) | 8 (8–13) | 100% |
| 5 | 0.5 (0–0.5) | 13 (8–15) | 91% |
| 6 | 0 (0–0.8) | 11 (10–19) | 100% |
| 7 | 0 (0–1) | 12 (10–21) | 100% |
| 8 | 0 (0–0.7) | 10 (10–18) | 100% |
| 9 | 0 (0–0.6) | 10 (10–17) | 100% |
| 10 | 0 (0–1) | 12 (10–20) | 100% |
| 11 | 0.3 (0–1.3) | 15 (10–21) | 100% |
| 12 | 0.1 (0–2) | 16 (10–27) | 100% |
| 13 | 0 (0–1) | 14 (9–23) | 99% |
| 14 | 0 (0–0.7) | 14 (9–16) | 100% |
| 15 | 0 (0–0.3) | 14 (9–16) | 100% |
| 16 | 0 | 14 (9–16) | 100% |
| 17 | 0 | 14 (9–16) | 100% |
| 18 | 0 | 14 (9–18) | 100% |
| 19 | 0 | 14 (9–18) | 100% |
| 20 | 0 | 14 (9–18) | 100% |
| 21 | 0 (0–0.1) | 14 (9–18) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 417 (415–584) | 6 (4–7) | 0 | 11 | 0 (0–47) | 400 (400–520) | 405 (405–550) | 133 (112–151) |
| 3 | 358 (111–927) | 0 | 0 | 11 (0–11) | 180 (0–696) | 220 (100–220) | 145 (100–595) | 356 (100–458) |
| 4 | 458 (100–2 991) | 0 (0–55) | 0 (0–2 000) | 0 | 238 (0–636) | 220 (100–300) | 444 (0–2 520) | 361 (113–929) |
| 5 | 2 681 (319–3 565) | 88 (0–95) | 2 000 (0–2 000) | 11 (0–22) | 282 (49–474) | 300 (220–1 300) | 1 718 (338–2 460) | 1 331 (299–1 700) |
| 6 | 216 (0–2 705) | 0 (0–106) | 0 (0–2 000) | 0 (0–24) | 48 (0–386) | 120 (0–1 220) | 0 (0–1 950) | 1 509 (1 217–1 715) |
| 7 | 264 (0–1 640) | 0 (0–139) | 0 | 11 (0–24) | 73 (0–689) | 120 (0–1 220) | 0 (0–1 950) | 1 528 (1 217–1 754) |
| 8 | 371 (11–1 696) | 0 (0–104) | 0 | 11 (0–24) | 144 (0–691) | 120 (0–1 200) | 600 (0–1 710) | 1 361 (632–1 800) |
| 9 | 243 (0–1 739) | 0 (0–96) | 0 | 0 (0–24) | 48 (0–384) | 120 (0–1 300) | 0 (0–1 880) | 1 426 (768–1 800) |
| 10 | 439 (11–1 682) | 0 (0–154) | 0 | 24 (0–24) | 81 (0–382) | 220 (0–1 300) | 1 201 (0–2 041) | 1 110 (115–1 899) |
| 11 | 503 (11–1 475) | 50 (0–189) | 0 | 24 (0–48) | 206 (0–717) | 170 (0–1 300) | 601 (0–2 221) | 910 (1–1 761) |
| 12 | 782 (48–6 606) | 27 (0–300) | 0 (0–5 000) | 24 (0–48) | 395 (0–746) | 220 (0–1 450) | 1 670 (0–3 441) | 360 (0–5 883) |
| 13 | 605 (48–6 627) | 0 (0–155) | 0 (0–5 000) | 0 (0–48) | 397 (0–730) | 120 (0–800) | 15 (0–2 210) | 806 (1–6 601) |
| 14 | 566 (222–858) | 0 (0–110) | 0 | 0 (0–24) | 400 (102–738) | 120 (120–300) | 0 (0–1 711) | 1 389 (11–7 380) |
| 15 | 521 (208–6 311) | 0 (0–105) | 0 (0–5 000) | 0 (0–24) | 401 (16–732) | 120 (120–700) | 0 (0–180) | 1 963 (189–8 029) |
| 16 | 514 (0–853) | 0 | 0 | 0 | 394 (0–733) | 120 (0–120) | 0 | 2 444 (189–8 504) |
| 17 | 456 (182–881) | 0 | 0 | 0 (0–24) | 336 (49–761) | 120 | 0 | 3 003 (382–9 357) |
| 18 | 428 (0–829) | 0 | 0 | 0 (0–24) | 308 (0–709) | 120 (0–120) | 0 | 3 414 (577–9 815) |
| 19 | 368 (0–872) | 0 | 0 | 0 | 248 (0–752) | 120 (0–120) | 0 | 3 870 (748–10 683) |
| 20 | 461 (0–867) | 0 | 0 | 0 (0–24) | 341 (0–747) | 120 (0–120) | 0 | 4 468 (962–10 961) |
| 21 | 334 (0–6 441) | 0 (0–105) | 0 (0–5 000) | 0 (0–24) | 214 (0–703) | 120 (0–700) | 0 (0–180) | 5 073 (986–11 479) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 1 500 · estações 1 639 · forja 1 940 · bolsa de caça 300 · refino 2 925

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 190 (174–214) | 56 (45–67) | 4 (1–10) | 0 | 4 | 0 | 4 |
| 3 | 153 (70–182) | 107 (0–148) | 14 (0–24) | 0 | 4 (0–4) | 4 | 0 (0–4) |
| 4 | 85 (85–100) | 0 | 0 | 0 | 0 | 4 | 4 |
| 5 | 220 (115–319) | 159 (0–306) | 26 (0–77) | 0 | 4 (0–8) | 0 (0–4) | 4 (0–4) |
| 6 | 130 (130–240) | 0 (0–170) | 0 (0–30) | 0 | 0 (0–5) | 4 (0–4) | 4 (0–4) |
| 7 | 234 (154–271) | 107 (0–180) | 16 (0–33) | 0 | 4 (0–5) | 4 (0–8) | 0 (0–4) |
| 8 | 228 (65–274) | 79 (0–267) | 7 (0–36) | 0 | 4 (0–5) | 4 (0–4) | 4 (0–4) |
| 9 | 178 (89–261) | 53 (0–98) | 0 (0–8) | 0 | 0 (0–5) | 4 (0–4) | 4 (0–4) |
| 10 | 147 (0–181) | 227 (0–288) | 25 (0–37) | 0 | 5 (0–5) | 4 (0–4) | 4 (0–8) |
| 11 | 212 (89–272) | 140 (98–281) | 28 (0–41) | 0 | 5 (0–10) | 4 (0–4) | 2 (0–8) |
| 12 | 168 (0–294) | 214 (39–284) | 19 (0–77) | 0 | 5 (0–10) | 4 (0–4) | 2 (0–4) |
| 13 | 0 (0–247) | 223 (156–270) | 0 (0–34) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 14 | 0 (0–124) | 228 (188–238) | 0 (0–10) | 0 | 0 (0–5) | 4 | 4 (0–4) |
| 15 | 0 (0–162) | 238 (232–269) | 0 (0–27) | 0 | 0 (0–5) | 4 (0–4) | 4 |
| 16 | 0 | 246 (226–256) | 0 | 0 | 0 | 4 | 4 |
| 17 | 0 (0–177) | 256 (250–288) | 0 (0–30) | 0 | 0 (0–5) | 4 | 4 (0–4) |
| 18 | 0 (0–172) | 262 (256–289) | 0 (0–40) | 0 | 0 (0–5) | 4 (0–4) | 4 |
| 19 | 0 | 265 (244–268) | 0 | 0 | 0 | 4 | 4 |
| 20 | 0 (0–157) | 268 (268–284) | 0 (0–38) | 0 | 0 (0–5) | 4 | 4 (0–4) |
| 21 | 0 (0–189) | 274 (268–293) | 0 (0–40) | 0 | 0 (0–5) | 4 (0–4) | 4 |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeiro refino bem-sucedido | 3 | 3–6 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5 | 4–6 | 20/20 |
| Segunda zona de caça liberada | 5 | 4–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 12 | 10–15 | 20/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 12–21 | 6/20 |

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
| 2 | 24 (23–24) | 231 (211–247) | 25 | 1 | 1 (0–1) |
| 3 | 30 (25–33) | 275 (239–312) | 25 | 1 | 1 |
| 4 | 32 (28–35) | 321 (293–464) | 25 (25–30) | 2 (1–2) | 1 (1–2) |
| 5 | 35 (34–37) | 477 (360–549) | 30 (25–31) | 2 | 2 (1–2) |
| 6 | 36 (34–39) | 485 (452–557) | 30 (30–40) | 2 | 2 |
| 7 | 38 (35–41) | 493 (452–581) | 31 (30–40) | 2 | 2 |
| 8 | 38 (35–43) | 506 (452–581) | 35 (30–40) | 2 | 2 |
| 9 | 39 (37–43) | 538 (466–706) | 40 (30–45) | 2 (2–3) | 2 |
| 10 | 42 (39–44) | 705 (481–774) | 40 (30–50) | 3 (2–3) | 2 (2–3) |
| 11 | 44 (41–45) | 745 (508–802) | 50 (30–50) | 3 (2–3) | 2 (2–3) |
| 12 | 44 (42–46) | 773 (687–811) | 50 (45–50) | 3 | 2 (2–3) |
| 13 | 45 (42–46) | 782 (734–819) | 50 (50–51) | 3 | 2 (2–3) |
| 14 | 45 (42–47) | 786 (734–829) | 50 (50–51) | 3 | 2 (2–3) |
| 15 | 46 (43–47) | 791 (734–835) | 50 (50–51) | 3 | 2 (2–3) |
| 16 | 46 (43–48) | 791 (734–838) | 50 (50–51) | 3 | 2 (2–3) |
| 17 | 46 (43–48) | 795 (743–844) | 50 (50–51) | 3 | 2 (2–3) |
| 18 | 47 (43–49) | 799 (743–844) | 50 (50–51) | 3 | 2 (2–3) |
| 19 | 47 (43–49) | 799 (743–848) | 50 (50–51) | 3 | 2 (2–3) |
| 20 | 47 (43–49) | 799 (743–853) | 50 (50–51) | 3 | 2 (2–3) |
| 21 | 47 (43–49) | 799 (743–853) | 50 (50–51) | 3 | 2 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 7 948 (7 553–8 906) | 129 | 7 427 (7 424–8 477) | 195 (0–1 350) |
| 3 | 11 828 (1 350–23 054) | 0 | 4 542 (0–9 099) | 5 978 (1 350–23 054) |
| 4 | 9 010 (0–12 882) | 0 (0–1 190) | 0 | 9 010 (0–11 692) |
| 5 | 16 636 (9 879–30 846) | 1 190 (0–1 537) | 9 093 (0–18 195) | 8 840 (780–15 842) |
| 6 | 3 529 (561–22 131) | 0 (0–1 460) | 564 (0–14 486) | 2 838 (0–15 043) |
| 7 | 6 074 (560–28 642) | 0 (0–1 805) | 567 (0–14 495) | 1 545 (0–12 363) |
| 8 | 2 112 (174–26 726) | 0 (0–1 308) | 565 (0–14 475) | 195 (0–21 840) |
| 9 | 10 532 (390–28 461) | 0 (0–2 545) | 9 659 (0–16 667) | 1 703 (0–11 432) |
| 10 | 20 396 (4 805–32 581) | 1 272 (0–3 706) | 14 488 (0–24 316) | 4 633 (0–22 867) |
| 11 | 27 650 (11 123–51 526) | 481 (0–2 182) | 18 826 (0–37 661) | 11 348 (390–23 894) |
| 12 | 19 005 (390–33 748) | 0 (0–2 920) | 0 (0–18 848) | 10 555 (390–23 147) |
| 13 | 12 317 (1 275–36 142) | 0 (0–990) | 0 (0–18 831) | 12 317 (1 275–23 614) |
| 14 | 9 690 (0–23 987) | 0 | 0 | 9 690 (0–23 987) |
| 15 | 9 265 (780–22 494) | 0 | 0 | 9 265 (780–22 494) |
| 16 | 10 249 (1 350–23 893) | 0 | 0 | 10 249 (1 350–23 893) |
| 17 | 7 485 (0–22 027) | 0 | 0 | 7 485 (0–22 027) |
| 18 | 4 310 (0–23 426) | 0 | 0 | 4 310 (0–23 426) |
| 19 | 5 638 (0–22 400) | 0 | 0 | 5 638 (0–22 400) |
| 20 | 2 775 (0–22 773) | 0 (0–707) | 0 | 2 775 (0–22 773) |
| 21 | 1 778 (0–16 317) | 0 | 0 | 1 778 (0–16 317) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 6 (6–7) | 100% |
| 3 | 0 | 8 (6–8) | 100% |
| 4 | 0 (0–0.5) | 8 (8–13) | 100% |
| 5 | 0.5 (0–0.6) | 14 (8–17) | 91% |
| 6 | 0 (0–0.9) | 10 (10–19) | 100% |
| 7 | 0 (0–1) | 10 (10–22) | 100% |
| 8 | 0 (0–0.8) | 10 (10–18) | 100% |
| 9 | 0 (0–1.3) | 10 (10–21) | 100% |
| 10 | 0.6 (0–1.9) | 17 (10–25) | 100% |
| 11 | 0.2 (0–1.1) | 16 (10–23) | 100% |
| 12 | 0 (0–1.5) | 16 (14–22) | 100% |
| 13 | 0 (0–0.5) | 14 (14–19) | 100% |
| 14 | 0 | 14 (9–17) | 100% |
| 15 | 0 | 14 (9–16) | 100% |
| 16 | 0 | 14 (9–17) | 100% |
| 17 | 0 | 14 (9–16) | 100% |
| 18 | 0 | 14 (9–17) | 100% |
| 19 | 0 | 14 (9–16) | 100% |
| 20 | 0 (0–0.1) | 15 (9–17) | 100% |
| 21 | 0 | 14 (9–16) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 484 (415–584) | 6 (4–7) | 0 | 11 | 8 (0–47) | 460 (400–520) | 478 (405–580) | 131 (102–151) |
| 3 | 394 (167–909) | 0 | 0 | 6 (0–11) | 192 (47–689) | 220 (120–220) | 145 (0–600) | 364 (286–457) |
| 4 | 503 (100–2 754) | 0 (0–98) | 0 (0–2 000) | 0 | 283 (0–356) | 220 (100–300) | 475 (300–1 778) | 352 (59–1 433) |
| 5 | 2 678 (162–3 892) | 89 (0–111) | 2 000 (0–2 000) | 11 (0–22) | 277 (31–481) | 300 (120–1 300) | 1 703 (0–2 918) | 1 401 (392–1 651) |
| 6 | 273 (0–2 704) | 0 (0–106) | 0 (0–2 000) | 0 (0–24) | 95 (0–471) | 120 (0–1 300) | 0 (0–1 860) | 1 470 (1 229–1 781) |
| 7 | 265 (0–1 645) | 0 (0–137) | 0 | 0 (0–24) | 57 (0–393) | 160 (0–1 200) | 75 (0–1 560) | 1 535 (468–1 773) |
| 8 | 114 (0–1 351) | 0 (0–96) | 0 | 0 (0–24) | 8 (0–682) | 100 (0–1 200) | 0 (0–1 740) | 1 423 (908–1 767) |
| 9 | 275 (0–1 845) | 0 (0–185) | 0 | 11 (0–25) | 64 (0–360) | 120 (0–1 300) | 0 (0–1 950) | 1 441 (768–1 768) |
| 10 | 538 (124–2 185) | 81 (0–294) | 0 | 24 (0–36) | 152 (0–714) | 220 (100–1 450) | 1 201 (0–3 501) | 1 010 (8–1 772) |
| 11 | 741 (240–1 547) | 38 (0–168) | 0 | 24 (0–48) | 357 (16–747) | 220 (120–1 300) | 1 201 (0–2 220) | 434 (3–1 730) |
| 12 | 541 (136–886) | 0 (0–222) | 0 | 0 (0–24) | 332 (16–724) | 120 (120–370) | 0 (0–2 030) | 663 (7–1 753) |
| 13 | 542 (166–6 298) | 0 (0–80) | 0 (0–5 000) | 0 (0–24) | 392 (46–738) | 120 (120–700) | 0 (0–2 120) | 1 047 (79–6 771) |
| 14 | 439 (0–869) | 0 | 0 | 0 | 319 (0–749) | 120 (0–120) | 0 | 1 620 (514–7 632) |
| 15 | 425 (152–823) | 0 | 0 | 0 | 305 (32–703) | 120 | 0 | 2 056 (731–8 147) |
| 16 | 448 (169–898) | 0 | 0 | 0 | 328 (49–778) | 120 | 0 | 2 393 (1 217–9 045) |
| 17 | 368 (0–809) | 0 | 0 | 0 | 248 (0–689) | 120 (0–120) | 0 | 2 817 (1 217–9 649) |
| 18 | 268 (0–852) | 0 | 0 | 0 | 148 (0–732) | 120 (0–120) | 0 | 3 229 (1 353–10 084) |
| 19 | 310 (0–820) | 0 | 0 | 0 | 190 (0–700) | 120 (0–120) | 0 | 3 556 (1 538–10 508) |
| 20 | 256 (0–5 826) | 0 (0–80) | 0 (0–5 000) | 0 | 100 (0–711) | 120 (0–700) | 0 (0–150) | 4 026 (1 758–10 724) |
| 21 | 186 (0–638) | 0 | 0 | 0 | 66 (0–518) | 120 (0–120) | 0 (0–30) | 4 205 (1 937–11 058) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 1 485 · estações 1 639 · forja 1 940 · bolsa de caça 300 · refino 2 700

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 235 (164–282) | 80 (71–90) | 8 (2–12) | 0 | 4.3 | 0 | 4 |
| 3 | 112 (70–182) | 54 (0–129) | 6 (0–24) | 0 | 2 (0–4) | 4 | 2 (0–4) |
| 4 | 93 (85–100) | 0 | 0 | 0 | 0 | 4 | 4 |
| 5 | 209 (115–321) | 142 (0–306) | 23 (0–78) | 0 | 4 (0–8) | 4 (0–4) | 2 (0–4) |
| 6 | 152 (130–238) | 9 (0–175) | 0 (0–30) | 0 | 0.3 (0–5) | 4 | 4 (0–4) |
| 7 | 180 (89–267) | 14 (1–167) | 2 (0–30) | 0 | 0.3 (0–5) | 4 (0–8) | 4 (0–4) |
| 8 | 136 (65–251) | 79 (0–113) | 0 (0–6) | 0 | 0.3 (0–5) | 4 (0–4) | 4 |
| 9 | 160 (0–236) | 162 (0–290) | 4 (0–35) | 0 | 4.3 (0–5.3) | 2 (0–4) | 4 (0–4) |
| 10 | 246 (0–365) | 149 (46–387) | 27 (0–55) | 0 | 5 (0–9.3) | 4 (0–4) | 0 (0–8) |
| 11 | 163 (0–350) | 218 (47–385) | 27 (0–71) | 0 | 5 (0–10) | 4 (0–4) | 2 (0–4) |
| 12 | 0 (0–266) | 220 (54–257) | 0 (0–34) | 0 | 0 (0–5) | 4 (0–4) | 4 (0–4) |
| 13 | 0 (0–182) | 232 (220–261) | 0 (0–36) | 0 | 0 (0–5) | 4 (0–4) | 4 (0–4) |
| 14 | 0 | 238 (220–244) | 0 | 0 | 0 | 4 | 4 |
| 15 | 0 | 247 (232–253) | 0 | 0 | 0 | 4 | 4 |
| 16 | 0 | 256 (238–259) | 0 | 0 | 0 | 4 | 4 |
| 17 | 0 | 262 (250–265) | 0 | 0 | 0 | 4 | 4 |
| 18 | 0 | 265 (256–268) | 0 | 0 | 0 | 4 | 4 |
| 19 | 0 | 268 (262–271) | 0 | 0 | 0 | 4 | 4 |
| 20 | 0 | 274 (268–277) | 0 | 0 | 0 | 4 | 4 |
| 21 | 0 | 277 (268–280) | 0 | 0 | 0 | 4 | 4 |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeiro refino bem-sucedido | 3 | 3–4 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5 | 4–6 | 20/20 |
| Segunda zona de caça liberada | 5 | 4–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 11 | 10–13 | 20/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 13–20 | 2/20 |

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
| Vence o chefe pela primeira vez | 5 (4–6) | 380 (331–414) | arma T2 / armadura T2, nível 34 (32–36) | 20/20 seeds |

#### Chefe do andar 25 visto pelos jogadores simulados (Cenário B)

| Momento | Dia | CP | Equipamento | Resultado |
| --: | --- | --- | --- | --- |
| Acaba de limpar o andar 24 (primeira chance contra o chefe) | 2 | 119 | - | 0% de vitória |
| Vence o chefe pela primeira vez | 5 (4–6) | 384 (354–414) | arma T2 / armadura T2, nível 35 (33–37) | 20/20 seeds |

#### Diagnóstico: chefe do andar 25 (CP recomendado pelo jogo: 387; andar 24: 111) contra heróis montados à mão, sem poções, de HP cheio

| Equipamento | Nível | CP | Sobe do andar 1 ao 24 de uma vez | Limpa o andar 24 | Vence o chefe do 25 |
| --: | --- | --- | --- | --- | --- |
| Roupa de trapos + Clava | 30 | 204 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 60 | 371 | 20/20 | 20/20 | 0/20 |
| Roupa de trapos + Clava | 100 | 620 | 20/20 | 20/20 | 20/20 |
| Tier 1 (adaga + couro) +0 | 40 | 326 | 20/20 | 20/20 | 0/20 |
| Tier 1 +8 | 40 | 387 | 20/20 | 20/20 | 9/20 |
| Tier 1 +8 | 60 | 521 | 20/20 | 20/20 | 20/20 |
| Tier 2 (espada + cota) +0 | 40 | 418 | 20/20 | 20/20 | 20/20 |
| Tier 2 +4 | 40 | 481 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 40 | 544 | 20/20 | 20/20 | 20/20 |
| Tier 2 +8 | 60 | 700 | 20/20 | 20/20 | 20/20 |
| Tier 3 (montante + placas) +0 | 40 | 578 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 40 | 816 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 60 | 1 009 | 20/20 | 20/20 | 20/20 |
| Tier 4 (lâmina dourada + égide) +8 | 100 | 1 712 | 20/20 | 20/20 | 20/20 |

### Diagnóstico da curva de inimigos

#### Curva de inimigos em volta dos chefes: HP × dano por golpe

| Chefe (andar) | Andar anterior (N−1) | Chefe (N) | Andar seguinte (N+1) | (N+1) / (N−1) | Chefe / (N−1) |
| --: | --- | --- | --- | --- | --- |
| 25 | 200 × 23 = 4 600 | 584 × 131 = 76 504 | 713 × 88 = 62 744 | 13.64 | 16.6 |
| 50 | 1 230 × 149 = 183 270 | 3 086 × 149 = 459 814 | 2 040 × 266 = 542 640 | 2.96 | 2.5 |
| 75 | 2 868 × 371 = 1 064 028 | 6 988 × 333 = 2 327 004 | 6 738 × 338 = 2 277 444 | 2.14 | 2.2 |
| 100 | 8 635 × 431 = 3 721 685 | 10 984 × 522 = 5 733 648 | - | - | 1.5 |
