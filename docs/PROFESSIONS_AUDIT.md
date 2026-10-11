# Auditoria das profissões (Mineração, Lenhador, Jardinagem, Refino)

Medido com `npm run sim` (21 dias x 20 seeds, cenário A) e `npx vitest run --config vitest.sim.config.ts professions --silent=false`.
Os números desta seção 1 a 6 são o estado ANTES das correções (commit `docs: professions audit`). A seção 7 registra o que mudou e o estado DEPOIS.

Cenários do simulador (scripts/sim):
- **A** (pedido): 2 visitas por dia; só minera/corta quando a próxima peça (ou o próximo refino) precisa; Horta não usada (antes da Horta 3.0).
- **C** (novo, só para profissões): igual ao A, mais Horta (planta o que a próxima peça precisa, senão a planta mais longa que cabe em 12 h) e a segunda visita do dia vira
  coleta (minera nos dias pares, corta nos ímpares, melhor tier liberado).

## 1. Como uma sessão funciona (código real)

| Item | Regra | Onde |
|---|---|---|
| Taxa | `(5 + 0,75 x nível) x 1` unidades/h. NÃO depende do tier do minério/madeira: só do nível da profissão. Nv1 = 5,75/h, Nv10 = 12,5/h, Nv25 = 23,8/h, Nv50 = 42,5/h, Nv75 = 61/h | `skills.ts gatherPower`, `tunables.ts mining/woodcutting/skills` |
| Sessão | Escolher um tier liberado grava `activeOreId` e `lastMiningClaim = agora`. Uma atividade de fundo por vez (Mineração, Lenhador e Caça se excluem; Masmorra também) | `App.tsx startMining` |
| Acúmulo | `unidades = floor(horas pendentes x potência x taxa x multiplicador do Passe)`; horas pendentes = `min(agora - lastClaim, teto)`. É por relógio (timestamp): fechar a aba/jogo não pausa nada | `engine.ts computeMiningStatus` |
| Teto | 4 h (`capHours`); 6 h para o dono do Passe de Aventureiro (`battlePass.capHours`, fixado no começo da sessão; eram 24 h com o Passe de Batalha, até 10/10/2026). Passar do teto perde o excedente | idem |
| Offline | Igual ao online: só o timestamp importa, limitado pelo teto. Com 2 visitas por dia (12 h entre elas) só 4 h de cada 12 h viram material: **máximo de 8 h de coleta por dia** sem Passe (12 h entre visitas, o dono guarda 6 h por sessão) | idem |
| Nível usado | O nível que vale para a taxa é o do momento da coleta, que é o do começo da sessão (o XP só entra ao coletar) | `claimMining` |
| XP por unidade | 1 XP por unidade coletada (`skills.xpPerUnit`). Coletar = XP imediato e a sessão termina | `claimMining` |
| Passe de Batalha | Mineração: x1,10 de unidades (era x1,25), teto de 6 h (era 24 h; 4 h sem Passe), e `xpPerMiningHour` = 10 de XP do Passe por hora coletada. Lenhador: x1,10 e 6 h, mas **sem XP do Passe** | `computeWoodcuttingStatus`, `claimWoodcutting` |
| Ouro | `goldRatePerPower = 0`: nenhuma coleta paga ouro (de propósito) | tunables |
| Curva (Mineração = Lenhador) | 4 faixas contínuas: XP do nível 1 -> 2 = 5; crescimento 1,06 (Nv1-10), 1,10 (11-25), 1,15 (26-50), 1,20 (51-75); teto Nv75 | `skills.ts professionBandTable` |
| Jardinagem | Curva própria `5 x 1,08^(n-1)`; XP por colheita = horas de crescimento x 5; 4 canteiros, colheita fixa | `garden.ts`, `skills.ts` |

Portas: minério copper 1 / iron 10 / silver 25 / gold_ore 50 / obsidian 55; madeira common 1 / oak 10 / ebony 25 / elven 50 / ancient 55; plantas 1 / 5 / 15 / 25 / 35.

## 2. O que o simulador mostra hoje (cenário A, mediana de 20 seeds)

Nível das profissões no fim do dia (A, só coleta o que a peça precisa):

| Dia | 1 | 2 | 3 | 4 | 5 | 7 | 10 | 14 | 21 |
|---|---|---|---|---|---|---|---|---|---|
| Mineração | 5 | 5 | 10 | 15 | 15 | 25 | 28 | 32 | 39 |
| Lenhador | 1 | 5 | 5 | 10 | 15 | 15 | 15 | 28 | 38 |

Jogador do cenário C (planta e usa a 2a visita para coletar): Mineração 5 / 10 / 10 / 15 no dia 1-4, 30 no dia 10, 33 no dia 14, 37 no dia 21; Lenhador 1 / 5 / 10 / 15, 28, 32, 37; Jardinagem 7 / 17 / 26 / 32 nos dias 1-4, 46 no dia 10, 51 no dia 14, 57 no dia 21.

Unidades por dia: um dia de coleta cheia rende ~23 (Nv1) a ~140 (Nv40) unidades de UM tier; o cenário C colhe 8 unidades/dia de Raiz Amarga (planta mais longa que cabe entre visitas).

Dia em que cada tier libera (mediana):

| Tier | Nível | A | C |
|---|---|---|---|
| iron | 10 | 3 | 2 |
| silver | 25 | 7 (19/20 seeds) | 8 |
| gold_ore | 50 | nunca em 21 dias | nunca em 21 dias |
| obsidian | 55 | nunca | nunca |
| oak_wood | 10 | 4 | 3 |
| ebony_wood | 25 | 12 (18/20) | 9 |
| elven_wood | 50 | nunca | nunca |
| ancient_wood | 55 | nunca | nunca |
| energy_herb / uncommon_root / crimson_mushroom / rare_flower (C) | 5 / 15 / 25 / 35 | - | 1 / 2 / 3 / 5 |

## 3. Profissão contra nível de personagem, por receita (antes)

Dia = primeiro dia (fim do dia) em que a mediana das seeds atinge o requisito. "Personagem" = maior `requiredLevel` da cadeia da receita (peça, peças anteriores, Fornalha, Carpintaria).

| Receita(s) | Nível do personagem | Profissão exigida | Dia personagem | Dia profissão | Veredito |
|---|---|---|---|---|---|
| T2 armadura, botas, luvas, elmo, anel prata (ferro) | 10 | Mineração 10 | 1 | 3 | BLOQUEIO +2 d |
| T2 arma `iron_short_sword` | 10 | Mineração 10 + Lenhador 10 | 1 | 4 | BLOQUEIO +3 d |
| T3 armadura, botas, luvas, elmo, anel ouro (prata) | 25 | Mineração 25 | 3 | 7 (19/20) | BLOQUEIO +4,5 d |
| T3 arma `steel_greatsword` | 25 | Mineração 25 + Lenhador 25 | 3 | 12 (18/20) | BLOQUEIO +9 d |
| T4 (dourado) armadura, botas, luvas, elmo, anel rubi | 50 | Mineração 50 | 14 | nunca em 21 d | BLOQUEIO |
| T4 `gilded_warblade` | 50 | Mineração 50 + Lenhador 50 | 14 | nunca | BLOQUEIO |
| T4 `dragon_flameblade` | 50 | Lenhador 50 (Mineração 25) | 14 | nunca | BLOQUEIO |
| T5 (voidsteel) tudo | 75 (veja abaixo) | Mineração 55 (+ Lenhador 55 na arma) | > 21 | > 21 | fora do horizonte |
| T6 (abissal) tudo | 90 | Mineração 55 (+ Lenhador 55 na arma) | > 21 | > 21 | fora do horizonte |

Achados:
1. **O jogador fica travado por uma profissão** em todo tier de T2 a T4: ferro (+2 a +3 dias), prata (+4,5 a +9 dias), ouro (nunca). Os níveis de personagem chegam muito antes (nível 25 no dia 3, nível 50 no dia ~14).
2. **O tempo de coleta que isso exige não cabe no dia.** Nv50 custa 181 h de coleta contínua (23 dias a 8 h/dia, só uma profissão); ouro + elven_wood juntos pedem Mineração 50 E Lenhador 50: ~360 h, 45 dias com o teto de 4 h e duas visitas por dia.
3. **Obsidiana (55) está perto demais do ouro (50).** O Nv55 custa só +132 h sobre o Nv50, mas as peças que usam obsidiana (T5/T6) exigem nível de personagem 70/90 e, de fato, **75** no refino: `smelt_obsidian` e `craft_handle_ancient` pedem personagem Nv75, acima do 70 da própria peça T5 (`refining.ts`). O simulador de 70 dias estaciona no nível 55 do personagem (andar 50-70), então a porta de profissão 55 chegaria semanas antes da de personagem: porta sem sentido.
4. **Receitas "SEM SENTIDO" (>7 dias antes):** nenhuma na janela medida (a janela de 21 dias nem alcança as portas altas).
5. `dragon_scale_armor` marca nível de personagem 45 (`synth_dragon_scales`) e só exige prata: sem problema.

## 4. Curva de XP das profissões (antes)

Mineração = Lenhador. Horas da atividade em coleta contínua (coletando a cada 4 h, igual a +0 a +8 h):

| Nível | Horas | Dias a 8 h/dia | Razão vs. marco anterior | Maior subida de 1 nível até aqui |
|---|---|---|---|---|
| 10 | 6,7 | 0,8 | - | 0,9 h |
| 25 | 19,9 | 2,5 | 2,9x | 1,3 h |
| 50 | 181 | 22,7 | 9,1x (ACIMA DE 3x) | 21,6 h (Nv50 -> 51) |
| 55 | 314 | 39 | 1,7x | 41 h (Nv55 -> 56) |
| 70 | 2 871 | 359 | 9,2x (ACIMA DE 3x) | 510 h |
| 75 | 6 556 | 819 | 2,3x | 1 005 h |

- Antes do Nv30 a maior subida é de 1,8 h (ok, meta < 6 h). **Até o Nv60 a maior é de 80 h (Nv59 -> 60), acima da meta de 24 h** e, a partir do Nv51, a curva passa de ~20 h por nível.
- O salto Nv25 -> Nv50 (9x) é onde o conteúdo trava (ouro e madeira élfica).
- Nv70/Nv75 não destravam nada além de obsidiana (porta 55 hoje): 6 556 h para o cap são ~820 dias a 8 h/dia.

Jardinagem (4 canteiros, planta de maior XP/dia que já está liberada, visita a cada 12 h): Nv5 = 1 dia, Nv15 = 2, Nv25 = 3, Nv35 = 5, Nv50 = 9, Nv75 = 42 dias. Nenhuma planta exige mais que o Nv35, então o resto da curva não libera nada.

## 5. Refino

Valor de referência (`economy.ts baseGoldValue`): o valor de saída de qualquer receita de forno, curtume, alquimia e carpintaria é derivado das entradas + ouro mais 10% (por construção: razão 1,10-1,12), então nenhum refino fica abaixo das entradas.

| Receita | Entradas | Saída | Razão saída/(entradas+ouro) | Veredito |
|---|---|---|---|---|
| `dust_from_common_herb` | 10 Erva Medicinal (40) | 1 Pó (22) | 0,55 | **ABAIXO DE 60%** (erva vale 4 por ser teto da poção da Loja) |
| `dust_from_copper` | 10 cobre (35) | 1 Pó (22) | 0,63 | limite; mantida |
| `dust_from_leather_scrap` / `_bone_fragment` | 10 (20) | 22 | 1,10 | ok |
| demais (11 receitas) | - | - | 1,10 - 1,12 | ok |

Nenhum material fica sem consumidor: ervas -> poções, raízes/cogumelos/flor -> poções, minérios -> forno, madeiras -> carpintaria, resto -> forja/aprimorar/bolsa. Observação: `energy_herb` só tem um consumidor (Poção do Conhecimento) e `silver`/`gold_ore`/`obsidian`/madeiras só o forno/carpintaria (consumidor único).

## 6. Defeitos encontrados

| # | Defeito | Onde | Impacto |
|---|---|---|---|
| 1 | **Trocar de tier no meio de uma sessão apaga o que já foi minerado/cortado em silêncio.** O botão de outro tier continua habilitado enquanto uma sessão está ativa; `startMining`/`startWoodcutting` trocam o tier e fazem `lastClaim = agora` sem coletar. Até 4 h (24 h com Passe) de material e todo o XP desse período somem | `App.tsx startMining`, `startWoodcutting` | perda de dados real |
| 2 | `skillLevel(NaN)` devolve o nível máximo (75): `xp < total` é falso para NaN, o laço roda até o teto. Um XP corrompido liberaria todas as portas | `skills.ts skillLevel` | defensivo; o carregamento já sanitiza, mas outros caminhos não |
| 3 | Lenhador não dá XP do Passe de Batalha (Mineração dá 10/h) | `App.tsx claimWoodcutting` | inconsistência de design; NÃO alterado (muda o ritmo do Passe, decisão do diretor) |
| 4 | Passe que expira no meio da sessão corta o teto de 24 h para 4 h retroativamente e o x1,25 some do que já acumulou | `engine.ts computeMiningStatus` | possível perda de até 20 h; exige guardar o início do Passe; NÃO alterado, reportado |
| 5 | A lógica de iniciar/coletar mora dentro do `App.tsx` e o simulador a espelhava à mão (`driver.ts`); nada a testava | `App.tsx` / `driver.ts` | testabilidade |

Verificados e sem defeito: acúmulo com a aba fechada (timestamp, teto respeitado), relógio atrasado (`max(0, ...)`), `lastClaim` inválido (normalizado no carregamento), sessão cheia e coleta com mochila cheia (o material sempre entra; a mochila só limita tipos novos na compra), subir de nível exatamente na fronteira de XP (`skillLevel` usa `<`), virada de meia-noite e horário de verão (nenhuma conta de profissão usa data, só milissegundos).

## 7. Correções e estado depois

### 7.1 O que mudou (commit `balance: profession pacing and refining fixes`)

| Mudança | De | Para | Motivo |
|---|---|---|---|
| `skills.professionGrowth3` (Nv26-50) | 1,15 | 1,06 | Nv50 de 181 h para 69 h de coleta |
| `skills.professionGrowth4` (Nv51-75) | 1,20 | 1,10 | Nv60 de 609 h para 109 h; maior subida de 1 nível até o Nv60 de 80 h para 5,6 h (meta < 24 h); antes do Nv30 continua em 1,4 h (meta < 6 h) |
| Obsidiana e Madeira Ancestral | Nv55 | Nv70 | Estavam 5 níveis (~16 h) depois do ouro / madeira élfica (Nv50) enquanto as peças T5 pedem personagem Nv70-75; Nv70 custa ~200 h de coleta |
| `refining dust_from_common_herb` | 10 ervas | 8 ervas | razão saída/entradas de 0,55 para 0,69 (todo refino agora >= 0,6; teste) |
| Trocar de tier no meio da sessão | apagava o acumulado | coleta primeiro (`gathering.ts applyStartGathering`) | defeito 1 |
| `skillLevel(NaN)` | nível máximo | nível 1 | defeito 2 |
| Início/coleta de sessões | dentro do `App.tsx`, espelhado à mão no simulador | `src/game/gathering.ts` (App e simulador chamam a mesma função) | defeito 5 |

Bugs 3 e 4 (XP do Passe no Lenhador; Passe que expira no meio da sessão) ficaram como estão e vão para o diretor decidir. **Atualização de 10/10/2026:** o bug 4 deixou de existir, o Passe não expira mais (o `until` do snapshot foi removido).

### 7.2 Conflito entre P1 e P4 (medido)

Não existe ajuste de XP que cumpra os dois ao mesmo tempo, porque a porta de profissão era o freio que segurava as peças T3 (e, por tabela, o andar 50). Perfis testados (cenário A, 20 seeds, 21 dias):

| Perfil | Portas de profissão <= dia do personagem + 1 (P1) | 1a seed no andar 50 (meta >= dia 10) | Mediana andar 50 | Nível d1 / d3 / d14 | Chefe 25 |
|---|---|---|---|---|---|
| Antes | T2 +2/+3 d, T3 +4,5/+9 d, T4 nunca | dia 10 | 14 | 13 / 29 / 49 | dia 5 |
| **Adotado** (XP/unid 1, crescimento 1,06/1,10) | T2 +2/+3 d, T3 +4,5/+9 d, T4 nunca (3/20 seeds de Mineração 50 em 21 d) | dia 10 | 14 | 13 / 29 / 49 | dia 5 |
| Rápido (XP/unid 4, crescimento 1,12/1,15) | **todas ok** (ferro dia 1, prata dia 3, ebano dia 4, ouro dia 14-15 contra personagem dia 16) | **dia 6** (6 8 9 9 10...) | 11 | 13 / 29 / 49 | dia 5 |
| XP/unid 2 (crescimento antigo) | T2 +2/+3 d, T3 +3/+6 d | dia 8 | 12 | 13 / 29 / 49 | dia 5 |
| Rápido + peças T3 com personagem Nv50 | ok | dia 9 | 11 | 13 / 29 / 51 | dia 5 |
| Rápido + T2 Nv15 + T3 Nv35 | ok | dia 8 | 11 | 13 / 29 / 49 | dia 5 |
| `hpGrowth` 0,17 (freio na Masmorra) | - | dia 8 | 13 | dia 1 cai para 11 (FORA) | dia 5 |

Leitura: o freio real do andar 50 é a velocidade de coleta do T2/T3 e a hora que ela libera para a Caça; mexer em nível de personagem das peças (T3 Nv35/Nv50) ou na Masmorra não recupera o dia 10 sem quebrar T2/T4.
A ordem de prioridade do pedido (P4 antes dos limites da Parte B) decide: ficou o perfil que mantém TODAS as metas de progressão. Para trocar, são três valores em `tunables.ts`:
`skills.xpPerUnit` 4, `professionGrowth3` 1,12, `professionGrowth4` 1,15 (perfil rápido). **Decisão do diretor**: quer as portas de profissão alinhadas ao nível do personagem (perfil rápido, ~4 dias mais cedo nas peças T3 e primeiro andar 50 no dia 6) ou a progressão calibrada de antes?

### 7.3 Estado depois (perfil adotado)

Curva (horas de coleta contínua): Nv10 6,7 h, Nv25 19,9 h, Nv50 68,6 h, Nv55 85 h, Nv70 200 h, Nv75 282 h (antes: 6,7 / 19,9 / 181 / 314 / 2 871 / 6 556).
O único sinal de 3x que sobra é Nv25 -> Nv50 (3,4x), que é a diferença de dificuldade entre prata e ouro, de propósito.
Nível das profissões no dia 14 / 21 (cenário A): Mineração 34 / 47, Lenhador 29 / 44 (antes 32 / 39 e 28 / 38). Cenário C no dia 14 / 21: Mineração 36 / 42, Lenhador 34 / 42, Jardinagem 51 / 57.
Dia de liberação em A: ferro 3, prata 7, ouro 3/20 seeds em 21 d; madeira carvalho 4, ébano 12, élfica 0/20.
