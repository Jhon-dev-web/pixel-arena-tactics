# Baseline de balanceamento: as primeiras horas de um jogador novo (depois da rodada 3: seis slots de equipamento)

- **Data:** 2026-10-10
- **Commit medido:** o commit `feat: helmet, gloves, boots and ring slots with 24 forged items and 12 unique drops` (rodada 3), na branch `claude/project-thread-ppdm57`. O baseline anterior (depois das rodadas 1 e 2) está no histórico do git; as comparações estão em `docs/BALANCE_CHANGES.md` (seção 15).
- **Como reproduzir:** `npm run sim` (cerca de 7 s para 20 seeds x 21 dias x 2 cenários). Código em `scripts/sim/` (`driver.ts`, `player.ts`, `progression.sim.ts`, `ladder.ts`). As medições de itens ficam em `npm run sim:items` (`docs/ITEM_BALANCE_AUDIT.md`).
- **Quem é o jogador simulado:** conta nova, sem Battle Pass, 2 visitas por dia (09h e 21h, com variação de até 90 min por seed), usa todas as 10 sessões grátis de Masmorra por dia, caça o resto do tempo e só minera/corta quando o próximo upgrade pede. **Desde a rodada 3 ele também forja capacete, luvas, botas e anel** (ver a política), e o jogo está equilibrado em torno desse jogador.

## Resumo para quem tem pressa

1. **Metas da R5 mantidas:** primeira sessão termina no andar 8; primeira peça forjada no dia 2; nível 13 / 29 / 48 nos dias 1 / 3 / 14; o chefe do andar 25 cai no dia 5 (4-6) com CP ~490; nenhuma seed chega ao andar 50 antes do dia 10; sem queda de dificuldade depois de chefe.
2. **O que foi preciso mexer para isso:** orcs 150/22 -> 250/37, feiticeiros 240/38 -> 312/49, minotauro 550/75 -> 715/98, `boss50*` 0,64 -> 0,82 (os goblins, o chefe 25 e a curva de crescimento não mudaram). A tabela de CP recomendada foi regerada com os 6 slots (andar 25: 546; andar 50: 1 794).
3. **Chefe 50:** primeira seed no dia 16 no A (4/20 em 21 dias) e no dia 10 no B (uma seed forte, 3/20). Ver `BALANCE_CHANGES.md` seção 14.
4. O resto do documento é o relatório completo da simulação.

## Política da simulação e o que ela não faz

Resumo da política (a versão completa e atual está no cabeçalho de `scripts/sim/progression.sim.ts`):

- **Visitas:** 2 por dia. A cada visita o jogo é "recarregado" (`normalizeSave`, que também reinicia missões diárias e sessões de Masmorra), coleta o que estava rodando, resgata missões, gasta, faz sessões, aceita pedido e inicia uma atividade de fundo.
- **Masmorra:** usa todas as sessões grátis do dia (`T.dungeon.freeSessionsPerDay` = 10: 5 em cada visita). Luta até morrer; só se retira (a) num chefe de bioma ainda não resgatado, para garantir o marco, (b) com HP <= 20% depois de um andar, (c) no andar 100. Conserta equipamento com durabilidade < 40. Mantém até 5 poções pequenas, compradas só com ouro que sobra depois de reservar o preço da próxima forja (antes podiam consumir metade da reserva), e não compra enquanto as duas últimas sessões morreram sem limpar andar.
- **Caça:** atividade padrão. Zona de maior XP liberada pelo andar, profundidade mais funda que o CP permite (regra do CP recomendado da própria UI).
- **Minério/madeira:** só quando a próxima forja ou refino precisa. Atividades que ainda têm falta se revezam.
- **Equipamento:** forja a próxima peça dos 6 slots (arma > armadura > luvas > capacete > botas > anel; o tier mais baixo primeiro, a prioridade desempata), passando pelas estações (fornalha, curtume, carpintaria, alquimia); cada peça nova consome 1 do tier anterior do mesmo slot (arma e armadura continuam com "2 de"); equipa o que dá mais `computeCP` em cada slot; **só arma e armadura são refinadas** (com o ouro que não está reservado para a próxima forja); compra gemas com estilhaços quando a receita pede; encaixa gemas sobressalentes na arma e na armadura. A Bolsa de Caça nível 2 é comprada assim que possível (a Bolsa do tier 1 tem 3 espaços).
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
| T4 | Nível no fim do dia 1 / 3 / 14 (alvos 10–16 / 20–28 / 45–60) | 13 / 29 (27–34) / 48 (46–51) | 13 / 31 (27–34) / 48 (46–50) | dia 1 ok; dia 3 FORA DA META; dia 14 ok |
| T5 | Chefe do andar 25 vencido pela primeira vez no dia 4–6; quem acaba de limpar o 24 perde | dia 5; vitória ao chegar: 0% | dia 4.5; vitória ao chegar: 0% | ok |
| T6 | Chegada ao andar 50: nenhuma seed antes do dia 10; o chefe 50 cai pela 1ª vez por volta dos dias 12–16 | chegada: primeira seed no dia 10, mediana 13; chefe 50: primeira seed no dia 16, mediana depois do dia 21, 4/20 em 21 dias | chegada: primeira seed no dia 10, mediana 13.5; chefe 50: primeira seed no dia 10, mediana depois do dia 21, 3/20 em 21 dias | chegada ok; chefe FORA DA META |
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
| Chefe do andar 50 | 17 (4/20) | 18 (3/20) | -1 | ok |

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
| 7 | 40 (38–44) | 733 (658–971) | 30 (29–40) | 2 (2–3) | 2 (1–2) |
| 8 | 43 (39–46) | 785 (672–1 045) | 30 (30–42) | 2 (2–3) | 2 (1–3) |
| 9 | 44 (40–47) | 843 (714–1 090) | 34 (30–48) | 2 (2–3) | 2 (1–3) |
| 10 | 46 (43–48) | 875 (731–1 113) | 40 (30–50) | 2 (2–3) | 2 (1–3) |
| 11 | 46 (44–49) | 1 025 (802–1 194) | 40 (30–50) | 3 (2–3) | 2 (2–3) |
| 12 | 47 (45–50) | 1 056 (810–1 232) | 43 (30–50) | 3 (2–3) | 2 (2–3) |
| 13 | 48 (45–50) | 1 100 (877–1 245) | 50 (32–50) | 3 (2–3) | 2 (2–3) |
| 14 | 48 (46–51) | 1 103 (886–1 258) | 50 (40–50) | 3 (2–3) | 2 (2–3) |
| 15 | 48 (46–52) | 1 113 (898–1 317) | 50 (40–50) | 3 (2–3) | 2 (2–3) |
| 16 | 49 (46–52) | 1 124 (898–1 317) | 50 (40–53) | 3 (2–3) | 2 (2–3) |
| 17 | 49 (46–53) | 1 128 (907–1 331) | 50 (40–54) | 3 (2–3) | 2 (2–3) |
| 18 | 49 (46–53) | 1 136 (907–1 419) | 50 (40–54) | 3 (2–3) | 2 (2–3) |
| 19 | 49 (46–54) | 1 140 (918–1 419) | 50 (40–57) | 3 (2–3) | 2 (2–3) |
| 20 | 49 (46–54) | 1 141 (918–1 437) | 50 (40–60) | 3 (2–3) | 2 (2–3) |
| 21 | 50 (46–54) | 1 141 (918–1 437) | 50 (40–60) | 3 (2–3) | 2 (2–3) |

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
| 8 | 21 854 (845–60 939) | 0 (0–1 070) | 18 831 (0–37 681) | 12 868 (0–22 960) |
| 9 | 29 802 (3 261–60 730) | 327 (0–1 805) | 18 843 (0–37 682) | 10 344 (0–23 053) |
| 10 | 24 766 (1 293–52 881) | 459 (0–2 015) | 18 836 (0–37 696) | 10 827 (0–23 613) |
| 11 | 22 046 (1 815–61 823) | 174 (0–2 015) | 18 830 (0–37 681) | 11 706 (0–23 800) |
| 12 | 22 441 (650–60 268) | 276 (0–1 548) | 9 414 (0–37 689) | 9 520 (0–23 613) |
| 13 | 22 569 (1 275–43 811) | 0 (0–1 728) | 0 (0–37 689) | 11 766 (0–24 360) |
| 14 | 15 005 (1 120–39 035) | 0 (0–1 308) | 0 (0–37 685) | 7 428 (0–23 986) |
| 15 | 11 018 (0–46 519) | 0 (0–1 728) | 0 (0–37 697) | 9 010 (0–24 454) |
| 16 | 12 574 (390–46 185) | 0 (0–1 130) | 0 (0–37 685) | 7 183 (0–21 747) |
| 17 | 9 912 (325–42 103) | 0 (0–216) | 0 (0–37 683) | 5 138 (0–16 468) |
| 18 | 6 010 (0–60 623) | 0 (0–1 502) | 0 (0–55 112) | 1 545 (0–22 400) |
| 19 | 9 072 (0–37 669) | 0 (0–666) | 0 (0–37 669) | 1 238 (0–22 680) |
| 20 | 5 380 (0–40 726) | 0 (0–1 565) | 0 (0–37 682) | 3 588 (0–23 333) |
| 21 | 3 800 (0–39 092) | 0 (0–906) | 0 (0–37 667) | 1 778 (0–22 120) |

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
| 8 | 0 (0–0.5) | 9 (7–13) | 100% |
| 9 | 0.2 (0–1) | 10 (7–17) | 100% |
| 10 | 0.3 (0–1) | 11 (7–17) | 100% |
| 11 | 0.1 (0–1.1) | 10 (7–20) | 100% |
| 12 | 0.1 (0–0.8) | 11 (7–18) | 100% |
| 13 | 0 (0–0.9) | 12 (9–16) | 100% |
| 14 | 0 (0–0.8) | 12 (9–15) | 100% |
| 15 | 0 (0–0.9) | 12 (9–15) | 100% |
| 16 | 0 (0–0.5) | 12 (9–15) | 99% |
| 17 | 0 (0–0.1) | 11 (8–14) | 100% |
| 18 | 0 (0–0.7) | 12 (7–14) | 100% |
| 19 | 0 (0–0.3) | 11 (8–14) | 100% |
| 20 | 0 (0–0.5) | 11 (7–14) | 100% |
| 21 | 0 (0–0.4) | 10 (7–14) | 100% |

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
| 8 | 617 (24–1 051) | 0 (0–88) | 0 | 24 (0–48) | 409 (0–718) | 220 (0–300) | 1 163 (0–2 220) | 254 (70–1 682) |
| 9 | 556 (24–927) | 23 (0–157) | 0 | 24 (0–48) | 331 (0–720) | 220 (0–300) | 315 (0–1 975) | 360 (9–1 525) |
| 10 | 576 (48–1 032) | 38 (0–148) | 0 | 24 (0–48) | 338 (0–738) | 200 (0–300) | 225 (0–1 806) | 525 (1–1 211) |
| 11 | 600 (24–1 036) | 13 (0–156) | 0 | 24 (0–48) | 371 (0–744) | 200 (0–300) | 300 (0–1 951) | 536 (12–1 204) |
| 12 | 526 (24–1 104) | 22 (0–104) | 0 | 12 (0–48) | 308 (0–738) | 120 (0–300) | 150 (0–945) | 859 (180–1 365) |
| 13 | 564 (48–1 175) | 0 (0–130) | 0 | 0 (0–48) | 371 (0–761) | 120 (0–300) | 15 (0–2 120) | 937 (29–1 855) |
| 14 | 442 (48–869) | 0 (0–97) | 0 | 0 (0–48) | 246 (0–749) | 120 (0–200) | 0 (0–480) | 1 301 (20–2 613) |
| 15 | 424 (0–884) | 0 (0–140) | 0 | 0 (0–48) | 296 (0–764) | 120 (0–220) | 0 (0–420) | 1 754 (0–3 193) |
| 16 | 446 (24–6 350) | 0 (0–134) | 0 (0–5 000) | 0 (0–48) | 239 (0–680) | 120 (0–700) | 0 (0–450) | 2 082 (24–8 554) |
| 17 | 315 (48–641) | 0 (0–21) | 0 | 0 (0–48) | 171 (0–521) | 120 (0–200) | 0 (0–210) | 2 378 (67–8 900) |
| 18 | 220 (0–6 167) | 0 (0–159) | 0 (0–5 000) | 0 (0–71) | 57 (0–700) | 120 (0–800) | 0 (0–1 555) | 2 837 (233–9 054) |
| 19 | 165 (0–954) | 0 (0–60) | 0 | 0 (0–48) | 45 (0–739) | 120 (0–200) | 0 (0–450) | 2 911 (477–9 848) |
| 20 | 273 (0–6 030) | 0 (0–178) | 0 (0–5 000) | 0 (0–48) | 125 (0–760) | 120 (0–700) | 0 (0–480) | 3 025 (637–10 698) |
| 21 | 203 (0–933) | 0 (0–78) | 0 | 0 (0–48) | 66 (0–715) | 120 (0–200) | 0 (0–545) | 3 203 (637–11 320) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 1 485 · estações 1 639 · forja 2 510 · bolsa de caça 300 · refino 3 150 · reparo 0

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
| 8 | 153 (65–337) | 204 (0–328) | 26 (0–86) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 9 | 233 (0–373) | 190 (0–421) | 36 (0–92) | 0 | 5 (0–10) | 0 (0–4) | 4 (0–8) |
| 10 | 207 (0–393) | 172 (0–417) | 33 (0–92) | 0 | 5 (0–10) | 0 (0–4) | 4 (0–8) |
| 11 | 200 (0–390) | 194 (0–406) | 34 (0–107) | 0 | 5 (0–10) | 0 (0–4) | 4 (0–8) |
| 12 | 147 (0–395) | 242 (0–394) | 17 (0–108) | 0 | 2.5 (0–10) | 2 (0–4) | 4 (0–8) |
| 13 | 45 (0–417) | 223 (116–436) | 0 (0–102) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 14 | 0 (0–428) | 232 (208–433) | 0 (0–108) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 15 | 0 (0–462) | 237 (220–418) | 0 (0–97) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 16 | 0 (0–421) | 250 (232–471) | 0 (0–114) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 17 | 0 (0–446) | 256 (238–516) | 0 (0–113) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 18 | 0 (0–438) | 261 (238–450) | 0 (0–110) | 0 | 0 (0–11) | 4 (0–4) | 4 (0–4) |
| 19 | 0 (0–354) | 268 (104–356) | 0 (0–66) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 20 | 0 (0–353) | 268 (110–352) | 0 (0–67) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |
| 21 | 0 (0–311) | 271 (116–338) | 0 (0–69) | 0 | 0 (0–10) | 4 (0–4) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeiro refino bem-sucedido | 3 | 3–4 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 5 | 4–6 | 20/20 |
| Segunda zona de caça liberada | 5 | 4–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 13 | 10–19 | 17/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 16–20 | 4/20 |

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
| 7 | 40 (35–43) | 729 (635–999) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 8 | 43 (35–46) | 795 (635–1 020) | 30 (30–40) | 2 (2–3) | 2 (1–3) |
| 9 | 45 (39–47) | 832 (735–1 259) | 32 (30–49) | 2 (2–3) | 2 (1–3) |
| 10 | 46 (42–48) | 895 (735–1 309) | 40 (30–54) | 3 (2–3) | 2 (1–3) |
| 11 | 47 (45–48) | 1 026 (813–1 323) | 40 (30–54) | 3 (2–3) | 2 (1–3) |
| 12 | 47 (45–49) | 1 059 (813–1 323) | 44 (30–55) | 3 (2–3) | 3 (1–3) |
| 13 | 48 (46–50) | 1 074 (824–1 335) | 49 (30–57) | 3 (2–3) | 3 (1–3) |
| 14 | 48 (46–50) | 1 074 (833–1 350) | 50 (30–60) | 3 (2–3) | 3 (1–3) |
| 15 | 49 (46–51) | 1 110 (873–1 350) | 50 (40–60) | 3 (2–3) | 3 (1–3) |
| 16 | 49 (46–52) | 1 124 (883–1 363) | 50 (40–60) | 3 (2–3) | 3 (1–3) |
| 17 | 49 (46–52) | 1 137 (891–1 363) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 18 | 49 (46–53) | 1 137 (999–1 363) | 50 (40–60) | 3 (2–3) | 3 (2–3) |
| 19 | 50 (46–53) | 1 152 (999–1 363) | 50 (40–60) | 3 | 3 (2–3) |
| 20 | 50 (46–54) | 1 152 (999–1 363) | 50 (40–60) | 3 | 3 (2–3) |
| 21 | 50 (46–54) | 1 164 (1 053–1 363) | 50 (40–60) | 3 | 3 (2–3) |

#### XP do personagem por dia e por fonte (mediana entre seeds)

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 1 | 2 539 | 2 539 | 0 | 0 |
| 2 | 7 947 (7 553–8 906) | 129 | 7 427 (7 424–8 476) | 195 (0–1 350) |
| 3 | 15 197 (5 525–31 309) | 0 (0–632) | 9 086 (0–9 099) | 6 190 (1 740–23 520) |
| 4 | 6 389 (632–23 054) | 137 (0–1 190) | 0 (0–9 097) | 5 983 (0–23 054) |
| 5 | 11 998 (414–27 599) | 558 (0–1 190) | 937 (0–18 828) | 7 593 (0–14 857) |
| 6 | 16 202 (558–33 091) | 285 (0–1 190) | 924 (0–18 844) | 5 258 (0–21 187) |
| 7 | 20 771 (156–59 430) | 0 (0–497) | 18 828 (0–37 688) | 2 663 (0–23 333) |
| 8 | 39 664 (0–60 012) | 0 (0–1 805) | 28 249 (0–38 595) | 11 913 (0–22 960) |
| 9 | 31 510 (345–51 436) | 0 (0–1 901) | 18 841 (0–38 606) | 5 260 (0–22 307) |
| 10 | 22 617 (780–60 555) | 452 (0–1 805) | 18 828 (0–38 611) | 4 150 (0–21 653) |
| 11 | 22 633 (0–62 737) | 524 (0–2 105) | 18 842 (0–38 618) | 7 438 (0–23 614) |
| 12 | 22 069 (0–61 400) | 110 (0–1 700) | 9 878 (0–38 592) | 5 993 (0–22 586) |
| 13 | 19 858 (1 815–50 323) | 0 (0–1 874) | 0 (0–38 629) | 4 378 (0–23 240) |
| 14 | 17 458 (0–42 002) | 0 (0–693) | 0 (0–38 631) | 1 508 (0–23 893) |
| 15 | 21 746 (0–41 306) | 0 (0–2 105) | 0 (0–38 606) | 3 475 (0–22 774) |
| 16 | 13 618 (0–40 731) | 0 (0–2 105) | 0 (0–38 626) | 995 (0–23 520) |
| 17 | 5 898 (390–38 624) | 0 (0–1 548) | 0 (0–38 624) | 2 183 (0–12 363) |
| 18 | 9 238 (0–39 892) | 0 (0–1 700) | 0 (0–38 617) | 833 (0–17 157) |
| 19 | 1 337 (0–39 159) | 0 (0–1 901) | 0 (0–38 615) | 0 (0–11 935) |
| 20 | 3 093 (0–43 294) | 0 (0–423) | 0 (0–38 604) | 618 (0–14 610) |
| 21 | 5 264 (0–38 612) | 0 (0–666) | 0 (0–38 612) | 1 065 (0–22 120) |

#### Sessões de Masmorra (velocidade 1x)

| Dia | Andares limpos / sessão | Segundos / sessão | Sessões que terminam em derrota |
| --: | --- | --- | --- |
| 1 | 2.3 | 32 | 100% |
| 2 | 0.1 | 6 (5–7) | 100% |
| 3 | 0 (0–0.1) | 7 (6–9) | 99% |
| 4 | 0.1 (0–0.5) | 8 (7–12) | 96% |
| 5 | 0.3 (0–0.5) | 11 (8–13) | 97% |
| 6 | 0.2 (0–0.5) | 10 (7–13) | 99% |
| 7 | 0 (0–0.2) | 9 (7–11) | 100% |
| 8 | 0 (0–1) | 9 (7–16) | 100% |
| 9 | 0 (0–1) | 10 (7–17) | 100% |
| 10 | 0.2 (0–1) | 12 (7–18) | 100% |
| 11 | 0.3 (0–1.1) | 12 (7–20) | 100% |
| 12 | 0.1 (0–0.9) | 12 (7–18) | 100% |
| 13 | 0 (0–0.9) | 11 (7–16) | 100% |
| 14 | 0 (0–0.3) | 10 (7–14) | 100% |
| 15 | 0 (0–1) | 11 (5–16) | 100% |
| 16 | 0 (0–1) | 11 (5–16) | 100% |
| 17 | 0 (0–0.8) | 12 (5–15) | 100% |
| 18 | 0 (0–0.8) | 12 (5–16) | 100% |
| 19 | 0 (0–0.9) | 12 (5–17) | 100% |
| 20 | 0 (0–0.2) | 12 (5–14) | 100% |
| 21 | 0 (0–0.3) | 12 (5–14) | 100% |

#### Ouro por dia (por fonte), gasto e saldo

| Dia | Ganho total | Masmorra | Marcos 25/50/.. | Caça | Pedidos | Missões | Gasto | Saldo final |
| --: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 419 (412–430) | 139 (132–150) | 0 | 0 | 0 | 280 | 300 | 119 (112–130) |
| 2 | 484 (415–584) | 6 (4–7) | 0 | 11 | 8 (0–47) | 460 (400–520) | 565 (405–665) | 91 (1–139) |
| 3 | 504 (293–3 527) | 0 (0–42) | 0 (0–2 000) | 11 (0–11) | 199 (62–703) | 220 (220–1 300) | 435 (180–1 165) | 310 (17–2 501) |
| 4 | 655 (230–3 667) | 11 (0–85) | 0 (0–2 000) | 0 (0–11) | 192 (0–690) | 260 (120–1 300) | 1 063 (0–3 768) | 326 (179–2 486) |
| 5 | 573 (134–3 812) | 45 (0–89) | 0 (0–2 000) | 1 (0–24) | 241 (0–451) | 220 (100–1 300) | 673 (0–3 788) | 410 (44–2 667) |
| 6 | 490 (24–3 699) | 27 (0–87) | 0 (0–2 000) | 1 (0–24) | 169 (0–663) | 200 (0–1 300) | 243 (0–3 800) | 389 (51–1 639) |
| 7 | 315 (11–973) | 0 (0–35) | 0 | 24 (0–48) | 96 (0–729) | 120 (0–220) | 450 (0–1 915) | 313 (0–1 632) |
| 8 | 602 (0–1 064) | 0 (0–137) | 0 | 36 (0–49) | 376 (0–718) | 170 (0–300) | 248 (0–1 370) | 543 (59–1 444) |
| 9 | 359 (48–1 111) | 0 (0–153) | 0 | 24 (0–49) | 175 (0–698) | 200 (0–300) | 300 (0–2 000) | 286 (2–1 615) |
| 10 | 426 (48–6 354) | 37 (0–144) | 0 (0–5 000) | 24 (0–49) | 143 (0–677) | 200 (0–700) | 318 (0–1 621) | 345 (2–5 622) |
| 11 | 447 (0–1 192) | 38 (0–156) | 0 | 24 (0–49) | 247 (0–738) | 120 (0–300) | 135 (0–2 296) | 599 (11–6 063) |
| 12 | 386 (0–1 158) | 9 (0–149) | 0 | 13 (0–49) | 206 (0–706) | 120 (0–300) | 0 (0–1 905) | 879 (0–6 304) |
| 13 | 317 (48–987) | 0 (0–128) | 0 | 0 (0–49) | 144 (0–754) | 120 (0–300) | 0 (0–1 985) | 976 (6–6 861) |
| 14 | 208 (0–1 035) | 0 (0–57) | 0 | 0 (0–49) | 55 (0–778) | 120 (0–200) | 0 (0–300) | 1 172 (142–7 626) |
| 15 | 285 (0–838) | 0 (0–151) | 0 | 0 (0–49) | 119 (0–718) | 120 (0–300) | 0 (0–960) | 1 274 (283–8 464) |
| 16 | 196 (0–855) | 0 (0–160) | 0 | 0 (0–49) | 38 (0–735) | 120 (0–120) | 0 | 1 327 (417–9 305) |
| 17 | 208 (1–530) | 0 (0–100) | 0 | 0 (0–49) | 80 (0–410) | 120 (0–200) | 0 (0–540) | 1 481 (418–9 835) |
| 18 | 214 (0–5 876) | 0 (0–121) | 0 (0–5 000) | 0 (0–49) | 31 (0–544) | 120 (0–700) | 0 (0–540) | 1 832 (301–10 057) |
| 19 | 92 (0–5 855) | 0 (0–138) | 0 (0–5 000) | 0 (0–49) | 0 (0–377) | 60 (0–680) | 0 (0–750) | 2 059 (349–10 245) |
| 20 | 161 (0–726) | 0 (0–41) | 0 | 0 (0–49) | 25 (0–464) | 120 (0–300) | 0 (0–1 015) | 2 135 (397–10 413) |
| 21 | 173 (0–811) | 0 (0–52) | 0 | 0 (0–49) | 41 (0–691) | 120 (0–220) | 0 (0–550) | 2 289 (422–10 413) |

Ouro gasto nos 21 dias, por destino (mediana entre seeds): poções 1 305 · estações 1 570 · forja 2 383 · bolsa de caça 300 · refino 3 200 · reparo 0

#### Materiais recebidos por dia (unidades que entraram na bolsa) e horas de cada atividade

| Dia | Comum | Incomum | Raro | Perdido na bolsa de caça | Horas caçando | Horas minerando | Horas cortando |
| --: | --- | --- | --- | --- | --- | --- | --- |
| 1 | 23 | 0 | 0 | 0 | 0 | 4 | 0 |
| 2 | 237 (184–282) | 82 (74–95) | 8 (2–12) | 0 | 4.3 | 0 | 4 |
| 3 | 156 (70–204) | 99 (0–147) | 15 (0–27) | 0 | 4 (0–4) | 4 | 0 (0–4) |
| 4 | 100 (85–226) | 0 (0–161) | 0 (0–21) | 0 | 0 (0–4) | 4 (0–8) | 4 (0–4) |
| 5 | 157 (100–267) | 10 (0–183) | 2 (0–38) | 0 | 0.3 (0–5) | 4 (0–8) | 0 (0–4) |
| 6 | 158 (89–286) | 98 (0–190) | 3 (0–41) | 0 | 0.3 (0–5) | 4 (0–8) | 0 (0–4) |
| 7 | 191 (89–417) | 194 (0–359) | 27 (0–77) | 0 | 5 (0–10) | 4 (0–8) | 0 (0–4) |
| 8 | 236 (89–381) | 256 (0–394) | 50 (0–101) | 0 | 7.5 (0–10.3) | 0 (0–8) | 0 (0–4) |
| 9 | 226 (0–357) | 221 (0–380) | 44 (0–95) | 0 | 5 (0–10.3) | 0 (0–4) | 4 (0–8) |
| 10 | 229 (35–392) | 153 (0–387) | 30 (0–95) | 0 | 5 (0–10.3) | 0 (0–4) | 4 (0–8) |
| 11 | 219 (0–390) | 204 (98–379) | 39 (0–77) | 0 | 5 (0–10.3) | 0 (0–4) | 4 (0–8) |
| 12 | 154 (0–360) | 217 (0–400) | 19 (0–81) | 0 | 2.6 (0–10.3) | 2 (0–4) | 4 (0–8) |
| 13 | 89 (0–401) | 222 (116–399) | 0 (0–87) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 14 | 0 (0–371) | 235 (199–385) | 0 (0–89) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 15 | 0 (0–385) | 247 (220–399) | 0 (0–89) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 16 | 0 (0–441) | 252 (125–465) | 0 (0–87) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 17 | 0 (0–463) | 258 (208–417) | 0 (0–102) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 18 | 0 (0–426) | 264 (214–419) | 0 (0–96) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 19 | 0 (0–401) | 265 (208–440) | 0 (0–88) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 20 | 0 (0–433) | 268 (235–434) | 0 (0–100) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |
| 21 | 0 (0–435) | 273 (110–460) | 0 (0–102) | 0 | 0 (0–10.3) | 4 (0–4) | 4 (0–4) |

Comum / Incomum / Raro: Caça usa a raridade do próprio drop; minério e madeira usam o tier (T1-T2 comum, T3-T4 incomum, T5 raro). "Perdido" = unidades sorteadas que não couberam nos espaços da bolsa de caça.

#### Primeira vez que acontece (dia; 1 = primeiro dia)

| Evento | Dia (mediana de todas as seeds) | Mín–máx (só quem chegou) | Seeds que chegam lá em 21 dias |
| --: | --- | --- | --- |
| Primeira peça forjada | 2 | 2–2 | 20/20 |
| Primeiro refino bem-sucedido | 3 | 2–4 | 20/20 |
| Checkpoint do andar 10 vencido | 1 | 1–1 | 20/20 |
| Marco do andar 25 recebido (chefe do bioma 1 vencido) | 4.5 | 3–6 | 20/20 |
| Segunda zona de caça liberada | 4.5 | 3–6 | 20/20 |
| Chegou ao andar 50 (a próxima sessão começa nele) | 13.5 | 10–20 | 18/20 |
| Marco do andar 50 recebido (chefe do bioma 2 vencido) | depois do dia 21 | 10–19 | 3/20 |

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
| Tier 3 (montante + placas) +0 | 40 | 744 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 40 | 1 173 | 20/20 | 20/20 | 20/20 |
| Tier 3 +8 | 60 | 1 412 | 20/20 | 20/20 | 20/20 |
| Tier 4 (lâmina dourada + égide) +8 | 100 | 2 419 | 20/20 | 20/20 | 20/20 |

### Diagnóstico da curva de inimigos

#### Curva de inimigos em volta dos chefes: HP × dano por golpe

| Chefe (andar) | Andar anterior (N−1) | Chefe (N) | Andar seguinte (N+1) | (N+1) / (N−1) | Chefe / (N−1) |
| --: | --- | --- | --- | --- | --- |
| 25 | 200 × 23 = 4 600 | 760 × 171 = 129 960 | 1 188 × 148 = 175 824 | 38.22 | 28.3 |
| 50 | 2 050 × 250 = 512 500 | 5 140 × 249 = 1 279 860 | 2 652 × 343 = 909 636 | 1.77 | 2.5 |
| 75 | 3 728 × 478 = 1 781 984 | 9 084 × 436 = 3 960 624 | 8 759 × 441 = 3 862 719 | 2.17 | 2.2 |
| 100 | 11 226 × 563 = 6 320 238 | 14 279 × 682 = 9 738 278 | - | - | 1.5 |
