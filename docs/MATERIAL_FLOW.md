# Fluxo de materiais — Arena Duel

Rodada 9 (11/10/2026). Pergunta do dono, depois de 1 h 21 m caçando a Clareira dos Pequenos Demônios (Raso) com um herói novo: 211 abates (154/h), Farrapo de Couro 44/h, Garra Demoníaca 14/h, Núcleo Demoníaco 1,5/h. "É muito por hora?"

Este documento mede, para **todo material do jogo** (caça, mineração, lenha, horta, o que as estações fabricam), quanto entra, para onde vai e quanto sobra, e compara com o que um conjunto completo de equipamento pede. A medição é o livro-razão que o simulador de progressão agora mantém (`scripts/sim/player.ts`, `DayLedger.flow`; relatório: `npm run sim:flow`). Esta é a **parte 1 (medição, nenhuma mudança de balanceamento)**. A parte 2 (as correções e os números "depois") fica no fim, na seção "Depois".

## 1. Resposta curta

- **Caça ao herói novo: os números do dono batem com o simulador** (142 abates/h, 40 Farrapos/h, 12 Garras/h, 0,5 Núcleo/h; 160 Farrapos, 49 Garras e 2 Núcleos em 4 h, 4 dos 26 espaços do inventário). Por hora, não é "demais" para o que a fase pede: **o que está fora de escala é o consumo, não a taxa**. O conjunto completo do tier 1 (7 peças) pede 21 Farrapos; o conjunto do tier 2, 45; a primeira sessão de 4 h traz 160. Em horas de caça, um conjunto do tier 1 custa 0,5 h, o do tier 2 0,9 h, o do tier 3 1,9 h, o do tier 6 4,3 h (as metas do diretor são ≈ 1,5–3 h, 4–8 h e 10–20 h).
- **A leitura do diretor se confirma para o comum e se corrige para o raro.** O Farrapo é "certo" até o dia 3–7 só porque os pedidos de entrega o absorvem (52% do uso real no dia 3, 46% no dia 7); do dia 8 em diante as receitas de tier 3 em diante não usam mais Farrapo e o uso real cai para 38%. O Osso (comum da Marsh) é inundado desde a chegada (7–10% de uso real). O **Núcleo (raro) não é escasso**: 0–15% de uso real, estoque de 187 no dia 21, porque o tier 3 pede 8 e o tier 4 pede 10 no conjunto inteiro.
- **Tudo o que a caça solta fica de sobra a partir do dia 7**, pelo mesmo motivo duplo: as receitas pedem pouco (a caça é a atividade mais curta de cada conjunto: 0,5–4,7 h contra 6–20 h de mineração) e o jogador simulado só chega ao tier 3 por volta do dia 13 (a prata e o ébano, que dependem do nível de ofício 25, é que seguram).
- Por consequência o inventário, e não a taxa, é o incômodo: o descuidado enche no dia 6 (meta 3–6) e perde 55% do que a caça traz.

## 2. Método e legenda

- Cenário A (Guerreiro, 2 visitas por dia, não-dono, `SIM_SEEDS` = 20 seeds, 21 dias) e o mesmo jogador dono do Passe. Todas as células são medianas entre as seeds.
- **Produzido** = entrou no inventário (caça, mineração, lenha, horta); **refinado** = saiu de uma estação (barra, couro, cabo, essência, pó); **perdido** = a coleta não coube no inventário. **Consumo por destino**: forja (inclui a cadeia de curtimento/fundição que a peça pede), refino+ (+1 a +8), alquimia, melhoria do baú, pedidos, pó de refino, mercador, descarte. Estoque = inventário + baú. O livro-razão fecha com resíduo zero (estoque final = estoque inicial + produzido + refinado − consumido, todo dia, toda seed).
- **Uso real** = forja + refino+ + alquimia + baú + pedidos (+ oficina, parte 2). **Descarte** = pó + mercador + descarte + perdido. O pó de refino é contado como descarte, como pede o briefing, embora o pó que o refino+ depois gasta seja um uso a jusante; o simulador só fabrica pó quando um +5 a +8 o exige.
- **Veredito** (sobre o que entrou desde o dia 1 até o dia indicado): **escassa** ≥ 90% foi para uso real (gargalo), **certa** 65–90%, **abundante** 40–65%, **inundada** < 40%. "- -" = o material ainda não existia para o jogador.
- Alterado no simulador nesta rodada: o jogador agora caça **onde cai o que lhe falta** (antes só a zona de maior XP; com receitas que pedem Farrapo e Osso ao mesmo tempo isso fazia o conjunto impossível depois do andar 26). Sem falta de material de caça, continua a zona de maior XP. As metas de progressão, medidas de novo com essa regra e o balanceamento de antes, ficam iguais: nível 13 / 29 / 47 nos dias 1 / 3 / 14, primeira peça forjada no dia 2, chefe 25 no dia 4, andar 50 com primeira seed no dia 8 e mediana 13, chefe 50 mediana 14.
- O estágio de cada tier para as tabelas estáticas vem do que o simulador mediu: o herói novo caça no Raso (142–154 rolagens/h); a partir do nível ~20 caça a Clareira no Profundo no teto econômico (224 rolagens/h), a Marsh no Profundo a ~165 e a Fenda a ~140.

## 3. Leitura por material (cenário A; o dono do Passe tem as mesmas conclusões com 5–15 pontos a mais de uso real)

| material | dia 1 | dia 3 | dia 7 | dia 14 | dia 21 | porquê |
| --- | --- | --- | --- | --- | --- | --- |
| Farrapo de Couro (comum) | - | abundante | abundante | abundante | inundada | pedidos e tier 1–2 absorvem até o dia 7; depois só pedidos |
| Garra Demoníaca (incomum) | - | certa | inundada | inundada | inundada | tier 3 pede 1 por peça; resto do estoque só tem pedidos |
| Núcleo Demoníaco (raro) | - | inundada | inundada | inundada | inundada | 8–10 no conjunto de tier 3–4, entra mais do que sai |
| Osso (comum, Marsh) | - | - | inundada | inundada | inundada | 3 por peça de tier 3, nada depois |
| Sangue Concentrado (incomum, Marsh) | - | - | inundada | inundada | inundada | só do tier 4 em diante |
| Cristal Corrompido (raro, Marsh) | - | - | inundada | inundada | inundada | 4–5 no conjunto, mais a essência |
| Estilhaço da Fenda, Chifre do Demônio | - | - | - | - | inundada | tier 5 em diante, o simulador não chega |
| Medula Abissal, Coração de Sangue | - | - | - | - | - | tier 6, sem produção no horizonte de 21 dias |
| Cobre | - | abundante | certa | abundante | abundante | |
| Ferro | - | - | inundada | inundada | inundada | só 16 no conjunto de tier 2; o resto é aço (5 por 1) |
| Prata | - | - | - | inundada | inundada | |
| Madeira comum | inundada | inundada | abundante | certa | certa | |
| Carvalho, Ébano | - | - | inundada | inundada | inundada | |
| Barras, couro, cabos, aço, lingotes (estações) | - | escassa | escassa | escassa | escassa | são fabricados sob demanda e consumidos na hora: o veredito "escassa" significa só "não sobra", não um gargalo |
| Erva comum | inundada | abundante | certa | abundante | abundante | |
| Erva de energia | - | inundada | inundada | abundante | abundante | |
| Raiz incomum | - | inundada | inundada | inundada | inundada | só poções que o simulador não bebe |
| Cardo, Flor dourada, Capim veloz, Lírio lunar | - | inundada | inundada | inundada | inundada | usos finitos (anéis, tônicos) |
| Runas | o dia 1–3 rende 10, o 4–7 17, o 8–14 16, o 15–21 7; o simulador não gasta nenhuma (extras de masmorra, reforja e compra de gemas não são dirigidos) | | | | | o conjunto de tier 5 pede 10 e o de tier 6 22: a oferta de ~50 em 21 dias cobre |
| Gemas | 7 / 13 ganhas por janela, 3–4 gastas | | | | | |

Os veredictos por dia e por material saem do relatório gerado abaixo (que também traz o dono do Passe).

## 4. Dados gerados

Saída de `FLOW_OUT=docs/... npm run sim:flow` antes de qualquer mudança. Tabelas "dias (soma)" somam a janela entre estágios; "uso real (acum.)" e "descarte+perda (acum.)" são acumulados desde o dia 1; o veredito usa o acumulado.

Seeds: 20 · dias: 21 · medianas entre seeds · resíduo máximo do livro-razão (estoque que o livro não explica): 0 unidades.

### Herói novo

Herói novo (nível 1, camponês), Clareira dos Pequenos Demônios, Raso, 20 seeds. Abates em 4 h: mediana 569 (142/h); espaços do inventário que as 4 h ocupam: 4 de 26.

| material | por hora | em 4 h |
| --- | --: | --: |
| leather_scrap | 40 | 160 |
| demon_claw | 12.3 | 49 |
| demon_core | 0.5 | 2 |

O conjunto completo do tier 1 pede 21 Farrapos de Couro (já contando as peças tecidas em couro) e 0 Garras: a primeira sessão de 4 h traz 160 Farrapos.

### Veredito por material, cenário A (não-dono)

| material | fonte | raridade | dia 1 | dia 3 | dia 7 | dia 14 | dia 21 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| iron | minério |  | - - | - - | inundada 20% | inundada 33% | inundada 32% |
| steel | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| leather | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| essence | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| copper | minério |  | - - | abundante 60% | certa 73% | abundante 57% | abundante 59% |
| silver | minério |  | - - | - - | - - | inundada 20% | inundada 6% |
| gold_ore | minério |  | - - | - - | - - | - - | - - |
| copper_bar | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| silver_ingot | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| leather_scrap | caça | common | - - | abundante 52% | abundante 46% | abundante 42% | inundada 38% |
| demon_claw | caça | uncommon | - - | certa 80% | inundada 29% | inundada 23% | inundada 23% |
| demon_core | caça | rare | - - | inundada 0% | inundada 3% | inundada 13% | inundada 15% |
| bone_fragment | caça | common | - - | - - | inundada 10% | inundada 6% | inundada 7% |
| concentrated_blood | caça | uncommon | - - | - - | inundada 4% | inundada 3% | inundada 3% |
| corrupted_crystal | caça | rare | - - | - - | inundada 7% | inundada 4% | inundada 5% |
| rift_shard | caça | uncommon | - - | - - | - - | - - | inundada 0% |
| fiend_horn | caça | rare | - - | - - | - - | - - | inundada 0% |
| common_herb | horta |  | inundada 0% | abundante 63% | certa 75% | abundante 41% | abundante 49% |
| energy_herb | horta |  | - - | inundada 0% | inundada 33% | abundante 63% | abundante 43% |
| uncommon_root | horta |  | - - | inundada 0% | inundada 0% | inundada 0% | inundada 0% |
| iron_thistle | horta |  | - - | inundada 0% | inundada 11% | inundada 22% | inundada 36% |
| gold_blossom | horta |  | - - | inundada 0% | inundada 30% | inundada 21% | inundada 36% |
| swift_grass | horta |  | - - | - - | inundada 25% | inundada 15% | inundada 34% |
| moon_lily | horta |  | - - | - - | - - | inundada 0% | inundada 5% |
| refining_dust | estação |  | - - | - - | certa 67% | certa 67% | certa 67% |
| common_wood | madeira |  | inundada 0% | inundada 17% | abundante 50% | certa 69% | certa 69% |
| oak_wood | madeira |  | - - | - - | inundada 32% | inundada 15% | inundada 16% |
| ebony_wood | madeira |  | - - | - - | - - | inundada 5% | inundada 2% |
| wood_handle_common | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_oak | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_ebony | estação |  | - - | - - | - - | escassa 100% | escassa 100% |

### Veredito por material, dono do Passe

| material | fonte | raridade | dia 1 | dia 3 | dia 7 | dia 14 | dia 21 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| iron | minério |  | - - | - - | abundante 64% | inundada 36% | inundada 38% |
| steel | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| leather | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| essence | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| copper | minério |  | - - | abundante 49% | abundante 48% | abundante 51% | abundante 60% |
| silver | minério |  | - - | - - | inundada 16% | inundada 7% | inundada 6% |
| gold_ore | minério |  | - - | - - | - - | - - | inundada 9% |
| copper_bar | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| silver_ingot | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| gold_bar | estação |  | - - | - - | - - | - - | escassa 100% |
| leather_scrap | caça | common | - - | inundada 38% | certa 80% | inundada 39% | inundada 22% |
| demon_claw | caça | uncommon | - - | abundante 51% | certa 83% | inundada 21% | inundada 12% |
| demon_core | caça | rare | - - | inundada 0% | abundante 56% | inundada 15% | inundada 7% |
| bone_fragment | caça | common | - - | - - | inundada 12% | inundada 11% | inundada 10% |
| concentrated_blood | caça | uncommon | - - | - - | inundada 6% | inundada 5% | inundada 5% |
| corrupted_crystal | caça | rare | - - | - - | inundada 6% | inundada 7% | inundada 7% |
| rift_shard | caça | uncommon | - - | - - | - - | inundada 0% | inundada 0% |
| fiend_horn | caça | rare | - - | - - | - - | inundada 0% | inundada 0% |
| abyssal_marrow | caça | uncommon | - - | - - | - - | - - | - - |
| blood_heart | caça | rare | - - | - - | - - | - - | - - |
| common_herb | horta |  | inundada 0% | certa 75% | abundante 64% | escassa 98% | escassa 90% |
| energy_herb | horta |  | - - | inundada 0% | inundada 33% | escassa 96% | certa 75% |
| uncommon_root | horta |  | - - | inundada 0% | inundada 0% | inundada 0% | inundada 0% |
| crimson_mushroom | horta |  | - - | - - | - - | - - | - - |
| iron_thistle | horta |  | - - | inundada 0% | abundante 63% | abundante 57% | certa 70% |
| gold_blossom | horta |  | - - | inundada 0% | certa 80% | abundante 50% | certa 65% |
| swift_grass | horta |  | - - | - - | certa 70% | abundante 62% | certa 78% |
| moon_lily | horta |  | - - | - - | - - | inundada 6% | inundada 11% |
| refining_dust | estação |  | - - | - - | - - | - - | - - |
| common_wood | madeira |  | inundada 0% | inundada 16% | abundante 48% | inundada 32% | inundada 36% |
| oak_wood | madeira |  | - - | - - | inundada 13% | inundada 17% | inundada 19% |
| ebony_wood | madeira |  | - - | - - | inundada 3% | inundada 3% | inundada 3% |
| elven_wood | madeira |  | - - | - - | - - | - - | inundada 4% |
| wood_handle_common | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_oak | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_ebony | estação |  | - - | - - | - 0% | escassa 100% | escassa 100% |
| wood_handle_elven | estação |  | - - | - - | - - | - - | escassa 100% |

### Caça, cenário A: fluxo por material

| material | dias (soma) | produzido | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| leather_scrap | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 182 | 0 | 21 | 0 | 0 | 0 | 77 | 0 | 0 | 0 | 86 | 52% | 0% | abundante |
|  | 4–7 | 190 | 0 | 45 | 0 | 0 | 0 | 34 | 10 | 94 | 38 | 18 | 46% | 38% | abundante |
|  | 8–14 | 227 | 0 | 16 | 0 | 0 | 0 | 41 | 0 | 83 | 106 | 14 | 42% | 61% | abundante |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 26 | 0 | 0 | 0 | 8 | 38% | 62% | inundada |
| demon_claw | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 64 | 0 | 0 | 0 | 0 | 0 | 51 | 0 | 0 | 0 | 22 | 80% | 0% | certa |
|  | 4–7 | 180 | 0 | 0 | 0 | 0 | 0 | 27 | 0 | 0 | 0 | 162 | 29% | 0% | inundada |
|  | 8–14 | 226 | 0 | 8 | 0 | 0 | 0 | 33 | 0 | 0 | 0 | 324 | 23% | 0% | inundada |
|  | 15–21 | 0 | 0 | 1 | 0 | 0 | 0 | 17 | 0 | 0 | 0 | 381 | 23% | 0% | inundada |
| demon_core | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0% | 0% | inundada |
|  | 4–7 | 30 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 32 | 3% | 0% | inundada |
|  | 8–14 | 56 | 0 | 8 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 90 | 13% | 0% | inundada |
|  | 15–21 | 0 | 0 | 1 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 100 | 15% | 0% | inundada |
| bone_fragment | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 201 | 0 | 0 | 0 | 0 | 0 | 19 | 0 | 106 | 62 | 30 | 10% | 80% | inundada |
|  | 8–14 | 1 089 | 0 | 12 | 0 | 2 | 0 | 41 | 0 | 377 | 684 | 31 | 6% | 97% | inundada |
|  | 15–21 | 270 | 0 | 1 | 0 | 8 | 0 | 22 | 0 | 1 | 132 | 29 | 7% | 95% | inundada |
| concentrated_blood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 183 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 177 | 4% | 0% | inundada |
|  | 8–14 | 1 161 | 0 | 0 | 0 | 0 | 0 | 25 | 0 | 0 | 0 | 1 225 | 3% | 0% | inundada |
|  | 15–21 | 272 | 0 | 0 | 0 | 0 | 0 | 15 | 0 | 0 | 1 | 1 256 | 3% | 17% | inundada |
| corrupted_crystal | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 43 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 40 | 7% | 0% | inundada |
|  | 8–14 | 256 | 0 | 5 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 315 | 4% | 0% | inundada |
|  | 15–21 | 57 | 0 | 0 | 0 | 2 | 0 | 4 | 0 | 0 | 0 | 382 | 5% | 0% | inundada |
| rift_shard | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 200 | 0% | 0% | inundada |
| fiend_horn | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 55 | 0% | 0% | inundada |

### Caça, dono do Passe: fluxo por material

| material | dias (soma) | produzido | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| leather_scrap | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 290 | 0 | 21 | 0 | 0 | 0 | 90 | 0 | 0 | 0 | 165 | 38% | 0% | inundada |
|  | 4–7 | 0 | 0 | 50 | 0 | 0 | 0 | 47 | 0 | 0 | 5 | 24 | 80% | 13% | certa |
|  | 8–14 | 408 | 0 | 13 | 0 | 0 | 0 | 64 | 0 | 122 | 244 | 17 | 39% | 59% | inundada |
|  | 15–21 | 733 | 103 | 8 | 0 | 0 | 0 | 35 | 0 | 0 | 642 | 30 | 22% | 84% | inundada |
| demon_claw | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 108 | 0 | 0 | 0 | 0 | 0 | 55 | 0 | 0 | 0 | 53 | 51% | 0% | abundante |
|  | 4–7 | 0 | 0 | 5 | 0 | 0 | 0 | 23 | 0 | 0 | 0 | 31 | 83% | 0% | certa |
|  | 8–14 | 381 | 0 | 5 | 0 | 0 | 0 | 51 | 0 | 0 | 0 | 517 | 21% | 0% | inundada |
|  | 15–21 | 831 | 0 | 3 | 0 | 0 | 0 | 31 | 0 | 0 | 632 | 565 | 12% | 46% | inundada |
| demon_core | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 4 | 56% | 0% | abundante |
|  | 8–14 | 101 | 0 | 7 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 107 | 15% | 0% | inundada |
|  | 15–21 | 296 | 0 | 5 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 379 | 7% | 0% | inundada |
| bone_fragment | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 488 | 0 | 8 | 0 | 2 | 0 | 47 | 0 | 113 | 214 | 50 | 12% | 71% | inundada |
|  | 8–14 | 1 165 | 0 | 8 | 0 | 4 | 0 | 66 | 0 | 260 | 798 | 24 | 11% | 90% | inundada |
|  | 15–21 | 346 | 0 | 6 | 0 | 8 | 0 | 26 | 0 | 2 | 308 | 15 | 10% | 93% | inundada |
| concentrated_blood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 480 | 0 | 0 | 0 | 0 | 0 | 29 | 0 | 0 | 0 | 454 | 6% | 0% | inundada |
|  | 8–14 | 1 174 | 0 | 0 | 0 | 0 | 0 | 44 | 0 | 0 | 0 | 1 590 | 5% | 0% | inundada |
|  | 15–21 | 368 | 0 | 10 | 0 | 0 | 0 | 15 | 0 | 0 | 280 | 1 659 | 5% | 14% | inundada |
| corrupted_crystal | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 104 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 99 | 6% | 0% | inundada |
|  | 8–14 | 263 | 0 | 5 | 0 | 2 | 0 | 10 | 0 | 0 | 0 | 338 | 7% | 0% | inundada |
|  | 15–21 | 89 | 0 | 3 | 0 | 5 | 0 | 4 | 0 | 0 | 0 | 498 | 7% | 0% | inundada |
| rift_shard | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 176 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 176 | 0% | 0% | inundada |
|  | 15–21 | 867 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 135 | 0 | 854 | 0% | 14% | inundada |
| fiend_horn | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 32 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 32 | 0% | 0% | inundada |
|  | 15–21 | 220 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 234 | 0% | 0% | inundada |
| abyssal_marrow | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
| blood_heart | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |

### Caça por lugar, cenário A

| zona:profundidade | seeds que caçaram | horas (mediana, 21 dias) | unidades por hora (mediana) |
| --- | --: | --: | --: |
| blood_marsh:deep | 20/20 | 45 | bone_fragment 41.6/h · concentrated_blood 42/h · corrupted_crystal 9.4/h |
| demon_glade:deep | 20/20 | 6 | leather_scrap 51/h · demon_claw 50.3/h · demon_core 8.3/h |
| demon_glade:shallow | 20/20 | 4 | leather_scrap 45.5/h · demon_claw 16/h · demon_core 1.5/h |
| demon_rift:deep | 13/20 | 6 | leather_scrap 36.8/h · demon_claw 41.2/h · demon_core 12/h · rift_shard 38.5/h · fiend_horn 9.5/h |

### Caça por lugar, dono do Passe

| zona:profundidade | seeds que caçaram | horas (mediana, 21 dias) | unidades por hora (mediana) |
| --- | --: | --: | --: |
| blood_abyss:deep | 7/20 | 16 | bone_fragment 20.6/h · concentrated_blood 41.2/h · corrupted_crystal 15/h · abyssal_marrow 41.3/h · blood_heart 13.8/h |
| blood_abyss:dense | 4/20 | 12 | bone_fragment 43.8/h · concentrated_blood 36/h · corrupted_crystal 8.5/h · abyssal_marrow 32.4/h · blood_heart 6.9/h |
| blood_marsh:deep | 20/20 | 42 | bone_fragment 47.8/h · concentrated_blood 47.2/h · corrupted_crystal 10.4/h |
| demon_glade:deep | 17/20 | 6 | leather_scrap 56.5/h · demon_claw 56/h · demon_core 9/h |
| demon_glade:shallow | 20/20 | 6 | leather_scrap 48.3/h · demon_claw 17.9/h · demon_core 1.5/h |
| demon_rift:deep | 20/20 | 27 | leather_scrap 37.3/h · demon_claw 46.6/h · demon_core 14.3/h · rift_shard 42.9/h · fiend_horn 11.3/h |

### Mineração, lenha, horta e estações, cenário A: fluxo por material

| material | dias (soma) | produzido | refinado | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| iron | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 172 | 0 | 0 | 16 | 6 | 0 | 0 | 12 | 0 | 26 | 55 | 36 | 20% | 43% | inundada |
|  | 8–14 | 107 | 0 | 0 | 39 | 0 | 0 | 0 | 0 | 0 | 40 | 30 | 25 | 33% | 60% | inundada |
|  | 15–21 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 | 32% | 61% | inundada |
| steel | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 6 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| leather | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 8 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| essence | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 5 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| copper | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 58 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 23 | 60% | 0% | abundante |
|  | 4–7 | 69 | 0 | 0 | 45 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 42 | 73% | 6% | certa |
|  | 8–14 | 107 | 0 | 0 | 10 | 0 | 0 | 30 | 0 | 0 | 37 | 0 | 46 | 57% | 26% | abundante |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 53 | 59% | 26% | abundante |
| silver | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 211 | 0 | 0 | 30 | 0 | 0 | 0 | 8 | 0 | 70 | 5 | 28 | 20% | 63% | inundada |
|  | 15–21 | 919 | 0 | 0 | 3 | 0 | 0 | 0 | 18 | 0 | 311 | 224 | 263 | 6% | 74% | inundada |
| gold_ore | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
| copper_bar | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 7 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 11 | 0 | 9 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 7 | 0 | 2 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| silver_ingot | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 6 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| common_herb | 1 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 2–3 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 63% | 0% | abundante |
|  | 4–7 | 10 | 0 | 0 | 4 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 7 | 75% | 0% | certa |
|  | 8–14 | 24 | 0 | 0 | 0 | 0 | 4 | 0 | 1 | 0 | 0 | 0 | 31 | 41% | 0% | abundante |
|  | 15–21 | 36 | 0 | 0 | 0 | 0 | 24 | 0 | 1 | 0 | 0 | 0 | 41 | 49% | 0% | abundante |
| energy_herb | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 9 | 33% | 0% | inundada |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 1 | 0 | 0 | 0 | 7 | 63% | 0% | abundante |
|  | 15–21 | 18 | 0 | 0 | 0 | 0 | 8 | 0 | 1 | 0 | 0 | 0 | 13 | 43% | 0% | abundante |
| uncommon_root | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0% | 0% | inundada |
|  | 4–7 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 19 | 0% | 0% | inundada |
|  | 8–14 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 | 0% | 0% | inundada |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 | 0% | 0% | inundada |
| iron_thistle | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 4–7 | 10 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 11% | 0% | inundada |
|  | 8–14 | 24 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 25 | 22% | 0% | inundada |
|  | 15–21 | 12 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 25 | 36% | 0% | inundada |
| gold_blossom | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0% | 0% | inundada |
|  | 4–7 | 5 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 6 | 30% | 0% | inundada |
|  | 8–14 | 6 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 | 21% | 0% | inundada |
|  | 15–21 | 9 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 17 | 36% | 0% | inundada |
| swift_grass | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 20 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 15 | 25% | 0% | inundada |
|  | 8–14 | 42 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 45 | 15% | 0% | inundada |
|  | 15–21 | 30 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 | 54 | 34% | 0% | inundada |
| moon_lily | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0% | 0% | inundada |
|  | 15–21 | 24 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 34 | 5% | 0% | inundada |
| refining_dust | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 2 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 67% | 0% | certa |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 67% | 0% | certa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 67% | 0% | certa |
| common_wood | 1 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 23 | 0% | 0% | inundada |
|  | 2–3 | 35 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 48 | 17% | 0% | inundada |
|  | 4–7 | 33 | 0 | 0 | 15 | 0 | 0 | 20 | 0 | 0 | 0 | 0 | 36 | 50% | 0% | abundante |
|  | 8–14 | 33 | 0 | 0 | 0 | 0 | 0 | 40 | 0 | 0 | 0 | 0 | 30 | 69% | 7% | certa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 33 | 69% | 7% | certa |
| oak_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 50 | 0 | 0 | 10 | 0 | 0 | 0 | 8 | 0 | 5 | 0 | 25 | 32% | 20% | inundada |
|  | 8–14 | 166 | 0 | 0 | 3 | 0 | 0 | 0 | 4 | 0 | 60 | 32 | 55 | 15% | 62% | inundada |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 55 | 16% | 61% | inundada |
| ebony_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 98 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 86 | 5% | 0% | inundada |
|  | 15–21 | 845 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | 0 | 130 | 119 | 388 | 2% | 41% | inundada |
| wood_handle_common | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 7 | 0 | 3 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 8 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_oak | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_ebony | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |

### Mineração, lenha, horta e estações, dono do Passe: fluxo por material

| material | dias (soma) | produzido | refinado | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| iron | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 107 | 0 | 0 | 39 | 4 | 0 | 0 | 45 | 0 | 0 | 1 | 36 | 64% | 0% | abundante |
|  | 8–14 | 181 | 0 | 0 | 26 | 0 | 0 | 0 | 0 | 0 | 1 | 27 | 30 | 36% | 49% | inundada |
|  | 15–21 | 0 | 0 | 0 | 11 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 26 | 38% | 57% | inundada |
| steel | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| leather | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 8 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| essence | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 5 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| copper | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 104 | 0 | 0 | 35 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 53 | 49% | 0% | abundante |
|  | 4–7 | 136 | 0 | 0 | 45 | 0 | 0 | 15 | 0 | 0 | 0 | 58 | 60 | 48% | 29% | abundante |
|  | 8–14 | 91 | 0 | 0 | 15 | 0 | 0 | 30 | 0 | 0 | 0 | 0 | 45 | 51% | 35% | abundante |
|  | 15–21 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | 60% | 37% | abundante |
| silver | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 161 | 0 | 0 | 20 | 0 | 0 | 0 | 4 | 0 | 11 | 58 | 30 | 16% | 65% | inundada |
|  | 8–14 | 816 | 0 | 0 | 20 | 0 | 0 | 0 | 26 | 0 | 131 | 382 | 105 | 7% | 66% | inundada |
|  | 15–21 | 711 | 0 | 0 | 13 | 0 | 0 | 0 | 15 | 0 | 251 | 513 | 24 | 6% | 89% | inundada |
| gold_ore | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 306 | 0 | 0 | 20 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 276 | 9% | 0% | inundada |
| copper_bar | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 7 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 12 | 0 | 9 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 9 | 0 | 3 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| silver_ingot | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| gold_bar | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| common_herb | 1 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 2–3 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 75% | 0% | certa |
|  | 4–7 | 20 | 0 | 0 | 4 | 0 | 7 | 0 | 2 | 0 | 0 | 0 | 7 | 64% | 0% | abundante |
|  | 8–14 | 12 | 0 | 0 | 0 | 0 | 17 | 0 | 3 | 0 | 0 | 0 | 6 | 98% | 0% | escassa |
|  | 15–21 | 24 | 0 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | 0 | 9 | 90% | 0% | escassa |
| energy_herb | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 8 | 33% | 0% | inundada |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 3 | 0 | 0 | 0 | 6 | 96% | 0% | escassa |
|  | 15–21 | 9 | 0 | 0 | 0 | 0 | 8 | 0 | 1 | 0 | 0 | 0 | 6 | 75% | 0% | certa |
| uncommon_root | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0% | 0% | inundada |
|  | 4–7 | 26 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | 0% | 0% | inundada |
|  | 8–14 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 42 | 0% | 0% | inundada |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 42 | 0% | 0% | inundada |
| crimson_mushroom | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
| iron_thistle | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 2 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 3 | 63% | 0% | abundante |
|  | 8–14 | 12 | 0 | 0 | 2 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 9 | 57% | 0% | abundante |
|  | 15–21 | 12 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 9 | 70% | 0% | certa |
| gold_blossom | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 3 | 80% | 0% | certa |
|  | 8–14 | 6 | 0 | 0 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 6 | 50% | 0% | abundante |
|  | 15–21 | 12 | 0 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 9 | 65% | 0% | certa |
| swift_grass | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 10 | 0 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 4 | 70% | 0% | certa |
|  | 8–14 | 18 | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 0 | 0 | 8 | 62% | 0% | abundante |
|  | 15–21 | 30 | 0 | 0 | 0 | 0 | 21 | 0 | 0 | 0 | 0 | 0 | 11 | 78% | 0% | certa |
| moon_lily | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 33 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 31 | 6% | 0% | inundada |
|  | 15–21 | 30 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 48 | 11% | 0% | inundada |
| refining_dust | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
| common_wood | 1 | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 37 | 0% | 0% | inundada |
|  | 2–3 | 67 | 0 | 0 | 10 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 83 | 16% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 15 | 0 | 0 | 20 | 0 | 0 | 0 | 0 | 52 | 48% | 0% | abundante |
|  | 8–14 | 181 | 0 | 0 | 0 | 0 | 0 | 40 | 0 | 0 | 0 | 1 | 47 | 32% | 18% | inundada |
|  | 15–21 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 30 | 36% | 50% | inundada |
| oak_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 243 | 0 | 0 | 10 | 0 | 0 | 0 | 21 | 0 | 3 | 48 | 50 | 13% | 60% | inundada |
|  | 8–14 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 15 | 30 | 17% | 72% | inundada |
|  | 15–21 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 | 19% | 72% | inundada |
| ebony_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 161 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 152 | 3% | 0% | inundada |
|  | 8–14 | 752 | 0 | 0 | 5 | 0 | 0 | 0 | 14 | 0 | 0 | 0 | 814 | 3% | 0% | inundada |
|  | 15–21 | 819 | 0 | 0 | 5 | 0 | 0 | 0 | 11 | 0 | 65 | 244 | 1 316 | 3% | 20% | inundada |
| elven_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 303 | 0 | 0 | 10 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 270 | 4% | 0% | inundada |
| wood_handle_common | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 7 | 0 | 3 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 8 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_oak | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 2 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_ebony | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0% | 0% | - |
|  | 8–14 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_elven | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |

### Runas e gemas, cenário A

| fluxo | origem / uso | dias 1–3 | dias 4–7 | dias 8–14 | dias 15–21 |
| --- | --: | --: | --: | --: | --: |
| Runas ganhas | masmorra | 4 | 5 | 7 | 3 |
| Runas ganhas | missões | 6 | 11 | 6 | 2 |
| Runas ganhas | pedido | 0 | 1 | 1 | 0 |
| Runas gastas | compra | 0 | 0 | 0 | 0 |
| gemas ganhas | emerald:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | emerald:masmorra | 0 | 2 | 4 | 0 |
| gemas ganhas | ruby:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | ruby:forja | 0 | 0 | 0 | 0 |
| gemas ganhas | ruby:masmorra | 0 | 2 | 4 | 0 |
| gemas ganhas | sapphire:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | sapphire:masmorra | 0 | 2 | 4 | 0 |
| gemas gastas | emerald:engaste | 0 | 1 | 1 | 0 |
| gemas gastas | emerald:forja | 0 | 0 | 1 | 0 |
| gemas gastas | ruby:engaste | 0 | 2 | 2 | 0 |
| gemas gastas | ruby:forja | 0 | 0 | 0 | 0 |
| gemas gastas | sapphire:engaste | 0 | 2 | 0 | 0 |
| gemas gastas | sapphire:forja | 0 | 0 | 0 | 0 |
| **Runas ganhas** | total | 10 | 17 | 16 | 7 |
| **Runas gastas** | total | 0 | 0 | 0 | 0 |
| **gemas ganhas** | total | 0 | 7 | 13 | 1 |
| **gemas gastas** | total | 0 | 4 | 3 | 1 |

### Runas e gemas, dono do Passe

| fluxo | origem / uso | dias 1–3 | dias 4–7 | dias 8–14 | dias 15–21 |
| --- | --: | --: | --: | --: | --: |
| Runas ganhas | masmorra | 4 | 7 | 9 | 3 |
| Runas ganhas | missões | 6 | 12 | 8 | 2 |
| Runas ganhas | pedido | 0 | 1 | 3 | 1 |
| Runas gastas | compra | 0 | 0 | 2 | 0 |
| gemas ganhas | emerald:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | emerald:forja | 0 | 0 | 0 | 0 |
| gemas ganhas | emerald:masmorra | 0 | 2 | 4 | 0 |
| gemas ganhas | ruby:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | ruby:forja | 0 | 0 | 0 | 1 |
| gemas ganhas | ruby:masmorra | 0 | 2 | 4 | 0 |
| gemas ganhas | sapphire:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | sapphire:forja | 0 | 0 | 0 | 0 |
| gemas ganhas | sapphire:masmorra | 0 | 2 | 4 | 0 |
| gemas gastas | emerald:engaste | 0 | 2 | 0 | 0 |
| gemas gastas | emerald:forja | 0 | 0 | 1 | 0 |
| gemas gastas | ruby:engaste | 0 | 2 | 2 | 0 |
| gemas gastas | ruby:forja | 0 | 0 | 0 | 0 |
| gemas gastas | sapphire:engaste | 0 | 2 | 0 | 0 |
| gemas gastas | sapphire:forja | 0 | 0 | 0 | 0 |
| **Runas ganhas** | total | 10 | 20 | 20 | 6 |
| **Runas gastas** | total | 0 | 0 | 2 | 0 |
| **gemas ganhas** | total | 0 | 7 | 14 | 2 |
| **gemas gastas** | total | 0 | 7 | 3 | 2 |

### Custo de um conjunto completo (7 peças, cadeia inteira), por tier

| set completo (7 peças) | leather_scrap | demon_claw | demon_core | bone_fragment | concentrated_blood | corrupted_crystal | rift_shard | fiend_horn | abyssal_marrow | blood_heart |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| T1 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| T2 | 45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| T3 | 73 | 11 | 8 | 19 | 0 | 4 | 0 | 0 | 0 | 0 |
| T4 | 73 | 11 | 10 | 19 | 16 | 5 | 0 | 0 | 0 | 0 |
| T5 | 73 | 11 | 28 | 19 | 20 | 22 | 7 | 5 | 0 | 0 |
| T6 | 73 | 11 | 28 | 19 | 36 | 34 | 7 | 5 | 7 | 5 |

| tier | onde se caça | caça (h) | mineração (h) | lenha (h) | caça c/ Passe (h) | mineração c/ Passe (h) | lenha c/ Passe (h) |
| --- | --: | --: | --: | --: | --: | --: | --: |
| T1 | shallow N1 | 0.5 | 6.1 | 1.7 | 0.5 | 5.5 | 1.6 |
| T2 | dense N6 | 0.9 | 9.1 | 3.4 | 0.8 | 8.3 | 3.1 |
| T3 | deep N10 | 1.9 | 17.8 | 6 | 1.7 | 16.1 | 5.4 |
| T4 | deep N10 | 2.4 | 18.6 | 6.3 | 2.1 | 16.9 | 5.7 |
| T5 | deep N10 | 3.5 | 19 | 6.6 | 3.2 | 17.2 | 6 |
| T6 | deep N10 | 4.3 | 19.7 | 7 | 3.9 | 17.9 | 6.4 |

| horas de caça por material | leather_scrap | demon_claw | demon_core | bone_fragment | concentrated_blood | corrupted_crystal | rift_shard | fiend_horn | abyssal_marrow | blood_heart |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| T1 | 0.5 | - | - | - | - | - | - | - | - | - |
| T2 | 0.9 | - | - | - | - | - | - | - | - | - |
| T3 | 1.4 | 0.2 | 1 | 0.5 | - | 0.4 | - | - | - | - |
| T4 | 1.8 | 0.3 | 0.8 | 0.5 | 0.4 | 0.5 | - | - | - | - |
| T5 | 1.8 | 0.3 | 2.1 | 0.4 | 0.4 | 1.4 | 0.2 | 0.5 | - | - |
| T6 | 1.8 | 0.3 | 2.1 | 0.4 | 0.8 | 2.2 | 0.2 | 0.5 | 0.2 | 0.4 |

| set completo: outros | gem:ruby | gem:sapphire | gem:emerald | runas | common_herb | iron_thistle | gold_blossom | crimson_mushroom | moon_lily |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| T1 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 |
| T2 | 0 | 0 | 0 | 0 | 4 | 2 | 0 | 0 | 0 |
| T3 | 1 | 1 | 1 | 0 | 4 | 2 | 1 | 0 | 0 |
| T4 | 2 | 1 | 1 | 0 | 4 | 2 | 2 | 1 | 0 |
| T5 | 3 | 1 | 1 | 10 | 4 | 2 | 2 | 1 | 1 |
| T6 | 3 | 2 | 1 | 22 | 4 | 2 | 2 | 1 | 3 |

| set completo: minérios e lenhas (cru) | copper | iron | silver | gold_ore | obsidian | common_wood | oak_wood | ebony_wood | elven_wood | ancient_wood |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| T1 | 35 | 0 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 |
| T2 | 45 | 16 | 0 | 0 | 0 | 15 | 10 | 0 | 0 | 0 |
| T3 | 65 | 57 | 45 | 0 | 0 | 25 | 15 | 10 | 0 | 0 |
| T4 | 65 | 57 | 45 | 35 | 0 | 25 | 15 | 10 | 15 | 0 |
| T5 | 65 | 57 | 45 | 25 | 35 | 25 | 15 | 10 | 15 | 15 |
| T6 | 65 | 57 | 45 | 25 | 80 | 25 | 15 | 10 | 15 | 40 |

### Produção por hora no estágio em que cada material é caçado, contra o conjunto do tier

| material | T3 (denso N5) | T4 (denso N8) | T5 (profundo N8) | T6 (profundo N10) |
| --- | --: | --: | --: | --: |
| leather_scrap | 50.4/h (d.glade) · set 73 = 1.4 h | 40.3/h (d.rift) · set 73 = 1.8 h | 40.3/h (d.rift) · set 73 = 1.8 h | 40.3/h (d.rift) · set 73 = 1.8 h |
| demon_claw | 50.9/h (d.glade) · set 11 = 0.2 h | 41.7/h (d.rift) · set 11 = 0.3 h | 41.7/h (d.rift) · set 11 = 0.3 h | 41.7/h (d.rift) · set 11 = 0.3 h |
| demon_core | 8.4/h (d.glade) · set 8 = 1 h | 13.1/h (d.rift) · set 10 = 0.8 h | 13.1/h (d.rift) · set 28 = 2.1 h | 13.1/h (d.rift) · set 28 = 2.1 h |
| bone_fragment | 41.6/h (b.marsh) · set 19 = 0.5 h | 41.6/h (b.marsh) · set 19 = 0.5 h | 44.1/h (b.abyss) · set 19 = 0.4 h | 44.1/h (b.abyss) · set 19 = 0.4 h |
| concentrated_blood | 42.1/h (b.marsh) · set 0 = 0 h | 42.1/h (b.marsh) · set 16 = 0.4 h | 47.7/h (b.abyss) · set 20 = 0.4 h | 47.7/h (b.abyss) · set 36 = 0.8 h |
| corrupted_crystal | 9.3/h (b.marsh) · set 4 = 0.4 h | 9.3/h (b.marsh) · set 5 = 0.5 h | 15.7/h (b.abyss) · set 22 = 1.4 h | 15.7/h (b.abyss) · set 34 = 2.2 h |
| rift_shard | 0/h (-) · set 0 = 0 h | 39.7/h (d.rift) · set 0 = 0 h | 39.7/h (d.rift) · set 7 = 0.2 h | 39.7/h (d.rift) · set 7 = 0.2 h |
| fiend_horn | 0/h (-) · set 0 = 0 h | 10.5/h (d.rift) · set 0 = 0 h | 10.5/h (d.rift) · set 5 = 0.5 h | 10.5/h (d.rift) · set 5 = 0.5 h |
| abyssal_marrow | 0/h (-) · set 0 = 0 h | 0/h (-) · set 0 = 0 h | 43.7/h (b.abyss) · set 0 = 0 h | 43.7/h (b.abyss) · set 7 = 0.2 h |
| blood_heart | 0/h (-) · set 0 = 0 h | 0/h (-) · set 0 = 0 h | 13.1/h (b.abyss) · set 0 = 0 h | 13.1/h (b.abyss) · set 5 = 0.4 h |


## 5. Observações sobre as tabelas estáticas

- As horas de mineração e de lenha usam a potência da profissão **no nível em que cada minério/madeira libera** (5 + 0,75 × nível): é um limite superior para quem já tem a profissão alta, porque o jogador volta a minerar cobre com potência de nível 50. A mineração fica em 18–20 h de tier 3 em diante porque a cadeia é dominada por cobre, ferro e prata, que são pedidos de qualquer tier.
- O conjunto de tier 4 é medido pela linha dourada; o de tier 5 e 6 passa pela linha de dragão (escamas = 2 núcleos + 2 cristais cada), que é a cadeia real da arma e da armadura.
