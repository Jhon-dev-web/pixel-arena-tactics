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

---

## 6. Depois (parte 2): o que mudou e o que se mediu

### 6.1 O que foi feito, e por quê

O dono ampliou o mandato: todas as áreas, itens e receitas maiores permitidos, e as raridades altas "um pouco mais difíceis" porque serão vendidas. As alavancas, na ordem do briefing:

1. **(a) Receitas maiores, com o comum e o incomum em toda peça.** Cada receita de equipamento dos tiers 1 a 6 foi recalculada (`npm run sim:recipes`, `scripts/sim/recipeTune.gen.ts`) para que um conjunto completo de 7 peças, cadeia inteira, exija as **horas de caça** da tabela 6.2 no estágio em que o tier é feito. Cada material entra no tier em que a zona dele fica disponível (Farrapo no 1, Garra no 2, Osso, Sangue, Núcleo e Cristal no 3, Estilhaço, Chifre, Medula e Coração no 5) e a quantidade de cada peça segue o peso do espaço (arma e armadura 1,5; as outras 0,75). Arma, armadura e escudo tomam o Farrapo como **Couro** (3 Farrapos), as outras peças o tomam direto. O machado leva as mesmas quantidades da espada do tier. Fora a caça, nada foi mexido (minério, madeira, gemas, Runas).
2. **Curtume 20 → 8 de Ouro por Couro** (`tan_leather`): o couro de um conjunto passou de ~7 para ~30 unidades e a taxa antiga viraria 600 de Ouro só em curtume no tier 1.
3. **Baú: as melhorias 3 a 8 também pedem Couro, Osso, Garra e Sangue** (`stash.ts`): um sumidouro único por jogador, mas que pega o excesso do meio do jogo.
4. **Refino +4 a +8 gasta materiais de caça do tier da peça** (`refineHuntMaterials`, `gear.ts`): o comum nas tentativas até +6; o comum, o incomum e o raro nas de +7 e +8 (5 × tier; 8 × tier, 3 × tier e ⌈tier/2⌉ por tentativa). É o único sumidouro **recorrente** da caça: vale para cada peça de cada slot, em todo tier, e para cada tentativa que falha. O simulador só refina arma e armadura, por isso ele quase não o enxerga.
5. **(b) Oficina de campo: não implementada.** Ver as decisões para o diretor (6.9).
6. **(c) Corte de chance dos comuns: não aplicado.** Cortar 35% do Osso levaria o uso real dele de 15% para ~23% no dia 21, sem mudar o veredito, e tiraria generosidade; o veredito de cada comum depende do ritmo da progressão, não da taxa.
7. **Raros (3b): chance −30%.** Núcleo 1,0 → 0,7% (Clareira) e 2,5 → 1,75% (Fenda); Cristal 1,5 → 1,05% e 3,0 → 2,1%; Chifre 2,0 → 1,4%; Coração 2,5 → 1,75%. Medidos antes, todos estavam inundados (0–26% de uso real), então nenhum escapa do corte. As receitas foram recalculadas junto: as horas por conjunto são as mesmas, a quantidade absoluta de cada raro que existe no mundo é 30% menor.

### 6.2 Horas de caça por conjunto, antes → depois

| tier | caça (h) antes | caça (h) depois | meta B2 | mineração (h) | lenha (h) |
| --- | --: | --: | --- | --: | --: |
| 1 | 0,5 | 2,4 | 1,5–3 | 6,1 | 1,7 |
| 2 | 0,9 | 4,2 | 4–8 | 9,1 | 3,4 |
| 3 | 1,9 | 11,3 | 10–20 | 17,8 | 6,0 |
| 4 | 2,4 | 22,2 | 20–40 | 18,6 | 6,3 |
| 5 | 3,5 | 33,0 | maior que o 4 | 19,0 | 6,6 |
| 6 | 4,3 | 42,3 | maior que o 5 | 19,7 | 7,0 |

Mineração e lenha não foram mexidas. A caça fica entre 0,4 e 2,2 vezes a mineração (a meta pedia "dentro de um fator ~2"): o tier 1 (2,4 h contra 6,1) e os tiers 5 e 6 (33 e 42 h contra 19) estão nas bordas. Igualar pediria centenas de unidades de obsidiana e madeira ancestral, que o jogador minera a 57/h; ficou como decisão para o diretor.

Conjunto completo (7 peças, cadeia inteira), antes → depois:

| tier | Farrapo | Garra | Núcleo | Osso | Sangue | Cristal | Estilhaço | Chifre | Medula | Coração |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 21 → 91 | - | - | - | - | - | - | - | - | - |
| 2 | 45 → 197 | 0 → 108 | - | - | - | - | - | - | - | - |
| 3 | 73 → 311 | 11 → 237 | 8 → 31 | 19 → 180 | 0 → 200 | 4 → 33 | - | - | - | - |
| 4 | 73 → 382 | 11 → 417 | 10 → 103 | 19 → 390 | 16 → 420 | 5 → 71 | - | - | - | - |
| 5 | 73 → 562 | 11 → 607 | 28 → 146 | 19 → 605 | 20 → 680 | 22 → 173 | 7 → 585 | 5 → 122 | 0 → 630 | 0 → 150 |
| 6 | 73 → 724 | 11 → 787 | 28 → 191 | 19 → 785 | 36 → 900 | 34 → 227 | 7 → 745 | 5 → 156 | 7 → 830 | 5 → 193 |

(O Núcleo e o Cristal dos tiers 3 e 4 incluem os da Essência: cada Essência = 1 Núcleo + 1 Cristal, e a Essência não mudou. Os números de quantidade por peça estão em `gear.ts`.)

### 6.3 Veredito, antes → depois (cenário A; "uso real" acumulado desde o dia 1)

| material | dia 3 | dia 7 | dia 14 | dia 21 |
| --- | --- | --- | --- | --- |
| iron | - → - | inund. 20% → inund. 29% | inund. 33% → inund. 29% | inund. 32% → inund. 29% |
| steel | - → - | - → - | esc. 100% → esc. 100% | esc. 100% → esc. 100% |
| leather | esc. 100% → esc. 100% | esc. 100% → esc. 100% | esc. 100% → esc. 100% | esc. 100% → esc. 100% |
| copper | abund. 60% → abund. 60% | certa 73% → certa 65% | abund. 57% → abund. 49% | abund. 59% → abund. 46% |
| silver | - → - | - → - | inund. 20% → inund. 20% | inund. 6% → inund. 11% |
| Farrapo de Couro | abund. 52% → certa 71% | abund. 46% → certa 67% | abund. 42% → abund. 52% | inund. 38% → abund. 51% |
| Garra Demoníaca | certa 80% → abund. 44% | inund. 29% → inund. 37% | inund. 23% → inund. 38% | inund. 23% → inund. 33% |
| Núcleo Demoníaco | inund. 0% → inund. 0% | inund. 3% → inund. 2% | inund. 13% → inund. 23% | inund. 15% → inund. 26% |
| Osso | - → - | inund. 10% → inund. 4% | inund. 6% → inund. 18% | inund. 7% → inund. 15% |
| Sangue Concentrado | - → - | inund. 4% → inund. 2% | inund. 3% → inund. 16% | inund. 3% → inund. 13% |
| Cristal Corrompido | - → - | inund. 7% → inund. 4% | inund. 4% → inund. 19% | inund. 5% → inund. 17% |
| Estilhaço da Fenda | - → - | - → - | - → - | inund. 0% → inund. 0% |
| Chifre do Demônio | - → - | - → - | - → - | inund. 0% → inund. 0% |
| common_herb | abund. 63% → certa 75% | certa 75% → abund. 63% | abund. 41% → inund. 35% | abund. 49% → inund. 35% |
| energy_herb | inund. 0% → inund. 17% | inund. 33% → abund. 50% | abund. 63% → certa 67% | abund. 43% → inund. 37% |
| uncommon_root | inund. 0% → inund. 0% | inund. 0% → inund. 0% | inund. 0% → inund. 0% | inund. 0% → inund. 0% |
| iron_thistle | inund. 0% → inund. 0% | inund. 11% → inund. 25% | inund. 22% → inund. 37% | inund. 36% → inund. 27% |
| gold_blossom | inund. 0% → inund. 0% | inund. 30% → certa 80% | inund. 21% → certa 67% | inund. 36% → inund. 38% |
| swift_grass | - → - | inund. 25% → abund. 40% | inund. 15% → inund. 16% | inund. 34% → inund. 20% |
| moon_lily | - → - | - → - | inund. 0% → inund. 0% | inund. 5% → inund. 2% |
| common_wood | inund. 17% → inund. 17% | abund. 50% → abund. 52% | certa 69% → certa 69% | certa 69% → certa 81% |
| oak_wood | - → - | inund. 32% → inund. 36% | inund. 15% → inund. 17% | inund. 16% → inund. 20% |
| ebony_wood | - → - | - → - | inund. 5% → inund. 6% | inund. 2% → inund. 10% |

Dono do Passe:

| material | dia 3 | dia 7 | dia 14 | dia 21 |
| --- | --- | --- | --- | --- |
| iron | - → - | abund. 64% → inund. 35% | inund. 36% → inund. 39% | inund. 38% → inund. 28% |
| steel | - → - | esc. 100% → esc. 100% | esc. 100% → esc. 100% | esc. 100% → esc. 100% |
| leather | esc. 100% → esc. 100% | esc. 100% → esc. 100% | esc. 100% → esc. 100% | esc. 100% → esc. 100% |
| copper | abund. 49% → inund. 39% | abund. 48% → abund. 42% | abund. 51% → abund. 41% | abund. 60% → inund. 36% |
| silver | - → - | inund. 16% → inund. 10% | inund. 7% → inund. 16% | inund. 6% → inund. 8% |
| Farrapo de Couro | inund. 38% → abund. 59% | certa 80% → certa 79% | inund. 39% → abund. 43% | inund. 22% → abund. 42% |
| Garra Demoníaca | abund. 51% → abund. 47% | certa 83% → abund. 59% | inund. 21% → inund. 31% | inund. 12% → inund. 32% |
| Núcleo Demoníaco | inund. 0% → inund. 0% | abund. 56% → inund. 26% | inund. 15% → inund. 28% | inund. 7% → inund. 35% |
| Osso | - → - | inund. 12% → inund. 17% | inund. 11% → inund. 13% | inund. 10% → inund. 15% |
| Sangue Concentrado | - → - | inund. 6% → inund. 15% | inund. 5% → inund. 13% | inund. 5% → inund. 14% |
| Cristal Corrompido | - → - | inund. 6% → inund. 21% | inund. 7% → inund. 16% | inund. 7% → inund. 18% |
| Estilhaço da Fenda | - → - | - → - | inund. 0% → - | inund. 0% → inund. 0% |
| Chifre do Demônio | - → - | - → - | inund. 0% → - | inund. 0% → inund. 0% |
| common_herb | certa 75% → certa 75% | abund. 64% → certa 81% | esc. 98% → abund. 60% | esc. 90% → certa 70% |
| energy_herb | inund. 0% → inund. 0% | inund. 33% → inund. 33% | esc. 96% → abund. 50% | certa 75% → abund. 55% |
| uncommon_root | inund. 0% → inund. 0% | inund. 0% → inund. 0% | inund. 0% → inund. 0% | inund. 0% → inund. 0% |
| iron_thistle | inund. 0% → inund. 0% | abund. 63% → abund. 44% | abund. 57% → inund. 35% | certa 70% → certa 73% |
| gold_blossom | inund. 0% → inund. 0% | certa 80% → abund. 40% | abund. 50% → inund. 37% | certa 65% → abund. 41% |
| swift_grass | - → - | certa 70% → abund. 55% | abund. 62% → inund. 37% | certa 78% → abund. 53% |
| moon_lily | - → - | - → - | inund. 6% → inund. 0% | inund. 11% → inund. 4% |
| common_wood | inund. 16% → inund. 14% | abund. 48% → inund. 39% | inund. 32% → inund. 35% | inund. 36% → inund. 40% |
| oak_wood | - → - | inund. 13% → inund. 36% | inund. 17% → inund. 22% | inund. 19% → inund. 23% |
| ebony_wood | - → - | inund. 3% → - | inund. 3% → inund. 10% | inund. 3% → inund. 3% |

**Leitura honesta.** O B1 do briefing (≥ 50% de uso real nos dias 3, 7 e 14) **vale para o Farrapo** (71 / 67 / 52 / 51%) e **quase para a Garra** (44 / 37 / 38 / 33%), mas **não vale** para o Osso, o Sangue e os raros (2–26%). O motivo não é a receita nem a taxa. As peças de tier 3 só ficam fabricáveis por volta do dia 13 a 16 (nível de ofício 25 em mineração e lenha, e um conjunto de tier 3 agora pede 11 h de caça), mas a Marsh abre no dia 5 e do dia 5 ao 13 o jogador simulado caça 40 a 70 h lá. Esse estoque é gasto, mas depois da janela de 21 dias. O Farrapo escapa porque os tiers 1 e 2 e os pedidos o consomem desde o dia 2.

### 6.4 Raros ("Nobres"): veredito e o que mudou

| material | antes (dia 7 / 14 / 21) | depois (dia 7 / 14 / 21) | decisão |
| --- | --- | --- | --- |
| Núcleo Demoníaco | 0% / 14% / 15% | 2% / 23% / 26% | chance −30% |
| Cristal Corrompido | 7% / 4% / 5% | 4% / 19% / 17% | chance −30% |
| Chifre do Demônio | - / - / 0% | - / - / 0% | chance −30% |
| Coração de Sangue | sem produção em 21 dias | sem produção em 21 dias | chance −30% |

Nenhum chegou a "certo, inclinado a escasso" (80–95% de uso real) dentro de 21 dias: com a progressão simulada, o raro dos tiers 3 e 4 só é gasto a partir do dia 14. Para os tiers que o simulador não alcança, a leitura certa é a tabela analítica no fim das tabelas geradas (produção por hora no estágio contra o que o conjunto pede): Núcleo e Cristal ficam em 5 a 6 h de caça por conjunto no tier 3 e 20 a 24 h no tier 6.

### 6.5 Únicos e relíquias de chefe

- **Únicos de caça: a chance base de cada entrada caiu ~7×** (Clareira 1,0 → 0,15 por 10 mil; Marsh 1,25 → 0,14; Fenda 2,0 → 0,24; Abismo 1,5 → 0,24), dimensionada para **um único de qualquer tipo a cada ~25 dias de 6 h/dia na zona certa** (rolagens econômicas ~224 / 165 / 140 / 140 por hora), contra ~4 dias antes. Mecanismo (fluxo próprio, mesma fração econômica, sem Passe) e multiplicador do Caçador ficam.
- Únicos de chefe: **8% → 3%** por vitória. Relíquias de chefe: **4% → 3%**.
- A raridade do único segue a tabela da forja (agora 63 / 25 / 10 / 2): **épica 10%, lendária 2%**.

Medido com uma corrida longa (100 dias × 10 seeds, `SIM_DAYS=100 SIM_SEEDS=10 npm run sim:flow`; o jogador simulado troca de zona conforme o andar):

| zona | horas de caça por jogador | únicos achados (todas as seeds) | únicos por 100 dias de jogo | rolagens/h implícitas | dias (6 h/dia) para QUALQUER único | dias para um único ESPECÍFICO | ... específico Épico | ... específico Lendário |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| demon_glade | 28 | 3 | 0.3 | 352 | 16 | 32 | 316 | 1 578 |
| blood_marsh | 68 | 3 | 0.3 | 106 | 38 | 113 | 1 125 | 5 625 |
| demon_rift | 212 | 12 | 1.2 | 118 | 29 | 59 | 588 | 2 942 |
| blood_abyss | 73 | 5 | 0.5 | 143 | 24 | 49 | 485 | 2 427 |

As colunas de dias saem da taxa medida (poucos eventos por zona: 3 a 12 em 1000 dias de jogo, então são ordens de grandeza). A conta analítica, que não depende de sorte, dá **25 dias para qualquer único de cada zona** (6 h/dia), **50 dias para um único específico** (Clareira, Fenda e Abismo têm dois; a Marsh tem três: 75), **~500 dias para um específico Épico** e **~2 500 dias para um específico Lendário**.

### 6.6 Custo esperado de um lendário na forja

Forjas esperadas do mesmo item: épico ou melhor 1 / 0,12 = **8,3**; lendário 1 / 0,02 = **50** (era 33,3); um épico E um lendário 10 + 50 − 8,3 = **51,7** (era 35,0). O custo esperado de um lendário sobe 50%. Selo do Ferreiro: a tabela condicional é 10 / 12 épica e 2 / 12 lendária (**83,3% / 16,7%**); 3 selos por temporada dão 3 × 2 / 12 = **0,5 lendária esperada por temporada** (era 0,6).

### 6.7 Metas de progressão do cenário A, antes → depois

"Antes" = o commit 1, com os únicos de antes. "Sem únicos" = `SIM_NO_UNIQUES=1` (nenhum único de caça nem de chefe), a verificação de que o simulador não depende de únicos.

| meta | antes | antes, sem únicos | depois | depois, sem únicos |
| --- | --- | --- | --- | --- |
| T2 primeira sessão (andar ≥ 8) | andar 8 | andar 8 | andar 8 | andar 8 |
| T3 primeira peça forjada (dia ≤ 2) | dia 2 | dia 2 | dia 2 | dia 2 |
| T4 nível dia 1 / 3 / 14 (10–16 / 20–29 / 45–60) | 13 / 29 / 47 | 13 / 28 / 47 | 13 / 27 / 47 | 13 / 27 / 47 |
| T5 chefe 25 (dia 4–6) | dia 4 | dia 5 | dia 5 | dia 5 |
| T6 chegada ao andar 50 | 1ª seed dia 8, mediana 13 | 1ª seed dia 11, mediana 16 | 1ª seed dia 13, mediana 17 | 1ª seed dia 16, mediana 19 |
| T6 chefe 50 | 1ª seed dia 9, mediana 14 | 1ª seed dia 12, mediana 17,5 | 1ª seed dia 13, mediana 19,5 | 1ª seed dia 16, mediana 20 |
| T7 queda após chefe | 1,05 | 1,05 | 1,05 | 1,05 |
| I1 inventário enche (dia 3–6) | dia 6 | | dia 6 | dia 6 |
| I2 atento perde < 5% | 0% | | 0,5% | 0% |
| I4 mercador ≤ 35% (dias 3 / 7 / 14) | +0 / +20,7 / +25,7% | | +0 / +21,1 / +25,7% | +0 / +21,5 / +25,7% |

**A chegada ao andar 50 saiu da faixa** (meta: mediana 12–15, primeira seed no dia 8–9). Duas causas, medidas separadamente: (1) **tirar os únicos**: o simulador de antes recebia um único a cada ~3 dias; sem nenhum, a mesma política já chega só na mediana 16 (primeira seed dia 11); (2) **as receitas maiores** custam mais ~1 a 2 dias (a arma de tier 3 sai por volta do dia 14,5 em vez de 13). Tentei aliviar com os monstros (`hpGrowth` 0,15 → 0,145 e `dmgGrowth` 0,12 → 0,115): a mediana só caiu de 18 para 17,5, então **não retunei os inimigos**. Está nas decisões do diretor.

### 6.8 Guardas

- Arbitragem (nenhuma receita vende por mais do que custa), orçamento do mercador, `usesOf`, paridade de textos pt/en e saves antigos: testes verdes (`npm test`, 623 testes).
- Orçamento do mercador, dias 3 / 7 / 14: antes +0 / +20,7 / +25,7%, depois +0 / +21,1 / +25,7% (máximo ~35%).
- Inventário: o jogador atento perde 0,5% (meta < 5%); o descuidado enche pela primeira vez no dia 6 (meta 3–6) e perde 83% do que a caça traz (antes 55%: as receitas maiores seguram mais material em estoque, e o descuidado não arruma).
- B3, herói novo: a primeira sessão de 4 h traz 160 Farrapos, 49 Garras e 2 Núcleos e ocupa 4 dos 26 espaços (teto 6); o primeiro Couro de 21 Farrapos cobre a Adaga de Bronze (7 Couros) e a primeira peça forjada continua no dia 2.

### 6.9 Decisões para o diretor

1. **Chegada ao andar 50 (e o chefe 50) fora da faixa**: mediana 17 (19 sem únicos), primeira seed no dia 13 (16). Recolocar na faixa é uma mudança de conteúdo (monstros dos andares 26 a 50 mais fracos, ou um ganho de poder de meio de jogo), não de receita. Os dois tunables globais de crescimento não bastaram.
2. **Oficina de campo (sumidouro em lote para o comum)**: não feita. A única forma que muda o veredito é um sumidouro com valor para o jogador (kit de reparo em vez de Ouro, ou aceitar o pó de refino como uso real). Peço decisão antes de criar interface.
3. **Tiers 5 e 6 (33 e 42 h de caça contra 19 h de mineração)**: aumentar obsidiana e madeira ancestral não é mais uma conta de receita (57/h no nível em que a profissão libera). Peço decisão.
4. **Núcleo e Cristal** só chegam perto de "certo" depois dos 21 dias simulados; o veredito certo para eles é a tabela analítica por tier.


### 6.10 Dados gerados depois da mudança

Seeds: 20 · dias: 21 · medianas entre seeds · resíduo máximo do livro-razão (estoque que o livro não explica): 0 unidades.

#### Herói novo

Herói novo (nível 1, camponês), Clareira dos Pequenos Demônios, Raso, 20 seeds. Abates em 4 h: mediana 569 (142/h); espaços do inventário que as 4 h ocupam: 4 de 26.

| material | por hora | em 4 h |
| --- | --: | --: |
| leather_scrap | 40 | 160 |
| demon_claw | 12.3 | 49 |
| demon_core | 0.5 | 2 |

O conjunto completo do tier 1 pede 91 Farrapos de Couro (já contando as peças tecidas em couro) e 0 Garras: a primeira sessão de 4 h traz 160 Farrapos.

#### Veredito por material, cenário A (não-dono)

| material | fonte | raridade | dia 1 | dia 3 | dia 7 | dia 14 | dia 21 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| iron | minério |  | - - | - - | inundada 29% | inundada 29% | inundada 29% |
| steel | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| leather | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| essence | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| copper | minério |  | - - | abundante 60% | certa 65% | abundante 49% | abundante 46% |
| silver | minério |  | - - | - - | - - | inundada 20% | inundada 11% |
| copper_bar | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| silver_ingot | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| leather_scrap | caça | common | - - | certa 71% | certa 67% | abundante 52% | abundante 51% |
| demon_claw | caça | uncommon | - - | abundante 44% | inundada 37% | inundada 38% | inundada 33% |
| demon_core | caça | rare | - - | inundada 0% | inundada 2% | inundada 23% | inundada 26% |
| bone_fragment | caça | common | - - | - - | inundada 4% | inundada 18% | inundada 15% |
| concentrated_blood | caça | uncommon | - - | - - | inundada 2% | inundada 16% | inundada 13% |
| corrupted_crystal | caça | rare | - - | - - | inundada 4% | inundada 19% | inundada 17% |
| rift_shard | caça | uncommon | - - | - - | - - | - - | inundada 0% |
| fiend_horn | caça | rare | - - | - - | - - | - - | inundada 0% |
| common_herb | horta |  | inundada 0% | certa 75% | abundante 63% | inundada 35% | inundada 35% |
| energy_herb | horta |  | - - | inundada 17% | abundante 50% | certa 67% | inundada 37% |
| uncommon_root | horta |  | - - | inundada 0% | inundada 0% | inundada 0% | inundada 0% |
| iron_thistle | horta |  | - - | inundada 0% | inundada 25% | inundada 37% | inundada 27% |
| gold_blossom | horta |  | - - | inundada 0% | certa 80% | certa 67% | inundada 38% |
| swift_grass | horta |  | - - | - - | abundante 40% | inundada 16% | inundada 20% |
| moon_lily | horta |  | - - | - - | - - | inundada 0% | inundada 2% |
| refining_dust | estação |  | - - | - - | - - | - - | escassa 100% |
| common_wood | madeira |  | inundada 0% | inundada 17% | abundante 52% | certa 69% | certa 81% |
| oak_wood | madeira |  | - - | - - | inundada 36% | inundada 17% | inundada 20% |
| ebony_wood | madeira |  | - - | - - | - - | inundada 6% | inundada 10% |
| wood_handle_common | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_oak | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_ebony | estação |  | - - | - - | - - | escassa 100% | escassa 100% |

#### Veredito por material, dono do Passe

| material | fonte | raridade | dia 1 | dia 3 | dia 7 | dia 14 | dia 21 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| iron | minério |  | - - | - - | inundada 35% | inundada 39% | inundada 28% |
| steel | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| leather | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| essence | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| copper | minério |  | - - | inundada 39% | abundante 42% | abundante 41% | inundada 36% |
| silver | minério |  | - - | - - | inundada 10% | inundada 16% | inundada 8% |
| gold_ore | minério |  | - - | - - | - - | - - | inundada 4% |
| copper_bar | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| silver_ingot | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| gold_bar | estação |  | - - | - - | - - | - - | escassa 100% |
| leather_scrap | caça | common | - - | abundante 59% | certa 79% | abundante 43% | abundante 42% |
| demon_claw | caça | uncommon | - - | abundante 47% | abundante 59% | inundada 31% | inundada 32% |
| demon_core | caça | rare | - - | inundada 0% | inundada 26% | inundada 28% | inundada 35% |
| bone_fragment | caça | common | - - | - - | inundada 17% | inundada 13% | inundada 15% |
| concentrated_blood | caça | uncommon | - - | - - | inundada 15% | inundada 13% | inundada 14% |
| corrupted_crystal | caça | rare | - - | - - | inundada 21% | inundada 16% | inundada 18% |
| rift_shard | caça | uncommon | - - | - - | - - | - - | inundada 0% |
| fiend_horn | caça | rare | - - | - - | - - | - - | inundada 0% |
| common_herb | horta |  | inundada 0% | certa 75% | certa 81% | abundante 60% | certa 70% |
| energy_herb | horta |  | - - | inundada 0% | inundada 33% | abundante 50% | abundante 55% |
| uncommon_root | horta |  | - - | inundada 0% | inundada 0% | inundada 0% | inundada 0% |
| iron_thistle | horta |  | - - | inundada 0% | abundante 44% | inundada 35% | certa 73% |
| gold_blossom | horta |  | - - | inundada 0% | abundante 40% | inundada 37% | abundante 41% |
| swift_grass | horta |  | - - | - - | abundante 55% | inundada 37% | abundante 53% |
| moon_lily | horta |  | - - | - - | - - | inundada 0% | inundada 4% |
| refining_dust | estação |  | - - | - - | - - | - - | - - |
| common_wood | madeira |  | inundada 0% | inundada 14% | inundada 39% | inundada 35% | inundada 40% |
| oak_wood | madeira |  | - - | - - | inundada 36% | inundada 22% | inundada 23% |
| ebony_wood | madeira |  | - - | - - | - - | inundada 10% | inundada 3% |
| elven_wood | madeira |  | - - | - - | - - | - - | inundada 4% |
| wood_handle_common | estação |  | - - | escassa 100% | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_oak | estação |  | - - | - - | escassa 100% | escassa 100% | escassa 100% |
| wood_handle_ebony | estação |  | - - | - - | - - | escassa 100% | escassa 100% |
| wood_handle_elven | estação |  | - - | - - | - - | - - | escassa 100% |

#### Caça, cenário A: fluxo por material

| material | dias (soma) | produzido | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| leather_scrap | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 182 | 0 | 91 | 0 | 0 | 0 | 41 | 0 | 0 | 0 | 56 | 71% | 0% | certa |
|  | 4–7 | 387 | 0 | 197 | 25 | 0 | 0 | 50 | 0 | 62 | 72 | 34 | 67% | 24% | certa |
|  | 8–14 | 410 | 0 | 34 | 0 | 0 | 0 | 56 | 0 | 172 | 99 | 40 | 52% | 42% | abundante |
|  | 15–21 | 417 | 0 | 111 | 0 | 0 | 0 | 54 | 0 | 93 | 65 | 75 | 51% | 44% | abundante |
| demon_claw | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 64 | 0 | 0 | 0 | 0 | 0 | 28 | 0 | 0 | 0 | 38 | 44% | 0% | abundante |
|  | 4–7 | 365 | 0 | 108 | 0 | 0 | 0 | 34 | 0 | 0 | 0 | 292 | 37% | 0% | inundada |
|  | 8–14 | 402 | 0 | 105 | 0 | 0 | 0 | 39 | 0 | 0 | 0 | 535 | 38% | 0% | inundada |
|  | 15–21 | 417 | 0 | 98 | 0 | 0 | 0 | 37 | 0 | 0 | 30 | 700 | 33% | 8% | inundada |
| demon_core | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0% | 0% | inundada |
|  | 4–7 | 48 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 54 | 2% | 0% | inundada |
|  | 8–14 | 48 | 0 | 19 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 79 | 23% | 0% | inundada |
|  | 15–21 | 52 | 0 | 16 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 125 | 26% | 0% | inundada |
| bone_fragment | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 335 | 0 | 0 | 0 | 0 | 0 | 14 | 0 | 111 | 93 | 49 | 4% | 65% | inundada |
|  | 8–14 | 799 | 0 | 100 | 0 | 0 | 0 | 47 | 0 | 291 | 273 | 70 | 18% | 75% | inundada |
|  | 15–21 | 1 092 | 0 | 70 | 0 | 2 | 0 | 65 | 0 | 263 | 667 | 93 | 15% | 82% | inundada |
| concentrated_blood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 317 | 0 | 0 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 310 | 2% | 0% | inundada |
|  | 8–14 | 821 | 0 | 110 | 0 | 0 | 0 | 28 | 0 | 0 | 0 | 840 | 16% | 0% | inundada |
|  | 15–21 | 1 155 | 0 | 78 | 0 | 0 | 0 | 42 | 0 | 31 | 403 | 1 498 | 13% | 20% | inundada |
| corrupted_crystal | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 50 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 48 | 4% | 0% | inundada |
|  | 8–14 | 121 | 0 | 19 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 125 | 19% | 0% | inundada |
|  | 15–21 | 176 | 0 | 18 | 0 | 1 | 0 | 10 | 0 | 0 | 0 | 261 | 17% | 0% | inundada |
| rift_shard | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 91 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 51 | 0% | 0% | inundada |
| fiend_horn | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10 | 0% | 0% | inundada |

#### Caça, dono do Passe: fluxo por material

| material | dias (soma) | produzido | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| leather_scrap | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 290 | 0 | 91 | 0 | 0 | 0 | 75 | 0 | 0 | 0 | 113 | 59% | 0% | abundante |
|  | 4–7 | 344 | 0 | 290 | 20 | 0 | 0 | 53 | 0 | 46 | 65 | 15 | 79% | 18% | certa |
|  | 8–14 | 951 | 0 | 117 | 0 | 0 | 0 | 57 | 0 | 129 | 424 | 71 | 43% | 48% | abundante |
|  | 15–21 | 306 | 0 | 76 | 0 | 0 | 0 | 36 | 0 | 2 | 163 | 73 | 42% | 51% | abundante |
| demon_claw | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 108 | 0 | 0 | 0 | 0 | 0 | 46 | 0 | 0 | 0 | 55 | 47% | 0% | abundante |
|  | 4–7 | 336 | 0 | 174 | 0 | 0 | 0 | 44 | 0 | 0 | 0 | 193 | 59% | 0% | abundante |
|  | 8–14 | 962 | 0 | 144 | 0 | 0 | 0 | 41 | 0 | 0 | 0 | 943 | 31% | 0% | inundada |
|  | 15–21 | 311 | 0 | 82 | 0 | 0 | 0 | 27 | 0 | 0 | 167 | 938 | 32% | 12% | inundada |
| demon_core | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 0% | 0% | inundada |
|  | 4–7 | 43 | 0 | 8 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 35 | 26% | 0% | inundada |
|  | 8–14 | 104 | 0 | 23 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 111 | 28% | 0% | inundada |
|  | 15–21 | 55 | 0 | 24 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 129 | 35% | 0% | inundada |
| bone_fragment | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 484 | 0 | 40 | 0 | 1 | 0 | 26 | 0 | 113 | 69 | 71 | 17% | 44% | inundada |
|  | 8–14 | 1 653 | 0 | 120 | 0 | 2 | 0 | 61 | 0 | 491 | 1 030 | 94 | 13% | 83% | inundada |
|  | 15–21 | 631 | 0 | 85 | 0 | 5 | 0 | 32 | 0 | 0 | 306 | 69 | 15% | 80% | inundada |
| concentrated_blood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 468 | 0 | 45 | 0 | 0 | 0 | 22 | 0 | 0 | 0 | 343 | 15% | 0% | inundada |
|  | 8–14 | 1 660 | 0 | 133 | 0 | 0 | 0 | 38 | 0 | 0 | 0 | 1 744 | 13% | 0% | inundada |
|  | 15–21 | 632 | 0 | 95 | 0 | 0 | 0 | 21 | 0 | 0 | 143 | 1 891 | 14% | 10% | inundada |
| corrupted_crystal | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 70 | 0 | 9 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 49 | 21% | 0% | inundada |
|  | 8–14 | 259 | 0 | 24 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 270 | 16% | 0% | inundada |
|  | 15–21 | 85 | 0 | 18 | 0 | 3 | 0 | 5 | 0 | 0 | 0 | 341 | 18% | 0% | inundada |
| rift_shard | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 259 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 247 | 0% | 0% | inundada |
| fiend_horn | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 49 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 49 | 0% | 0% | inundada |

#### Caça por lugar, cenário A

| zona:profundidade | seeds que caçaram | horas (mediana, 21 dias) | unidades por hora (mediana) |
| --- | --: | --: | --: |
| blood_marsh:deep | 20/20 | 52.5 | bone_fragment 40.6/h · concentrated_blood 41.5/h · corrupted_crystal 6.2/h |
| demon_glade:deep | 20/20 | 24 | leather_scrap 49.1/h · demon_claw 48.8/h · demon_core 5.9/h |
| demon_glade:shallow | 20/20 | 4 | leather_scrap 45.5/h · demon_claw 16/h · demon_core 1.3/h |
| demon_rift:deep | 10/20 | 6 | leather_scrap 37.2/h · demon_claw 36.2/h · demon_core 7.8/h · rift_shard 35.5/h · fiend_horn 5.9/h |

#### Caça por lugar, dono do Passe

| zona:profundidade | seeds que caçaram | horas (mediana, 21 dias) | unidades por hora (mediana) |
| --- | --: | --: | --: |
| blood_marsh:deep | 20/20 | 60 | bone_fragment 45.8/h · concentrated_blood 46.2/h · corrupted_crystal 7.3/h |
| demon_glade:deep | 20/20 | 24 | leather_scrap 56.2/h · demon_claw 55.8/h · demon_core 6.5/h |
| demon_glade:shallow | 20/20 | 6 | leather_scrap 48.3/h · demon_claw 17.9/h · demon_core 1.1/h |
| demon_rift:deep | 16/20 | 12 | leather_scrap 40.8/h · demon_claw 41.9/h · demon_core 8.6/h · rift_shard 40.3/h · fiend_horn 7/h |

#### Mineração, lenha, horta e estações, cenário A: fluxo por material

| material | dias (soma) | produzido | refinado | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| iron | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 123 | 0 | 0 | 16 | 6 | 0 | 0 | 14 | 0 | 2 | 0 | 33 | 29% | 4% | inundada |
|  | 8–14 | 196 | 0 | 0 | 43 | 0 | 0 | 0 | 0 | 0 | 99 | 35 | 27 | 29% | 62% | inundada |
|  | 15–21 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 29% | 51% | inundada |
| steel | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 7 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| leather | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 17 | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 43 | 0 | 43 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 35 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| essence | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| copper | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 58 | 0 | 0 | 35 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 23 | 60% | 0% | abundante |
|  | 4–7 | 73 | 0 | 0 | 45 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 35 | 65% | 5% | certa |
|  | 8–14 | 107 | 0 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 49 | 0 | 70 | 49% | 28% | abundante |
|  | 15–21 | 0 | 0 | 0 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 55 | 46% | 30% | abundante |
| silver | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 214 | 0 | 0 | 35 | 0 | 0 | 0 | 9 | 0 | 64 | 17 | 22 | 20% | 63% | inundada |
|  | 15–21 | 488 | 0 | 0 | 10 | 0 | 0 | 0 | 19 | 0 | 246 | 130 | 140 | 11% | 71% | inundada |
| copper_bar | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 7 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 10 | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 6 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 6 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| silver_ingot | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 7 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| common_herb | 1 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 2–3 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 2 | 75% | 0% | certa |
|  | 4–7 | 20 | 0 | 0 | 4 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 7 | 63% | 0% | abundante |
|  | 8–14 | 36 | 0 | 0 | 0 | 0 | 3 | 0 | 1 | 0 | 0 | 0 | 41 | 35% | 0% | inundada |
|  | 15–21 | 24 | 0 | 0 | 0 | 0 | 11 | 0 | 1 | 0 | 0 | 0 | 64 | 35% | 0% | inundada |
| energy_herb | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 10 | 17% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 50% | 0% | abundante |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 5 | 67% | 0% | certa |
|  | 15–21 | 18 | 0 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 17 | 37% | 0% | inundada |
| uncommon_root | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0% | 0% | inundada |
|  | 4–7 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 25 | 0% | 0% | inundada |
|  | 8–14 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | 0% | 0% | inundada |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | 0% | 0% | inundada |
| iron_thistle | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 25% | 0% | inundada |
|  | 8–14 | 6 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 37% | 0% | inundada |
|  | 15–21 | 12 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 26 | 27% | 0% | inundada |
| gold_blossom | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 3 | 80% | 0% | certa |
|  | 8–14 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 67% | 0% | certa |
|  | 15–21 | 6 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 7 | 38% | 0% | inundada |
| swift_grass | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 20 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 10 | 40% | 0% | abundante |
|  | 8–14 | 48 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 54 | 16% | 0% | inundada |
|  | 15–21 | 36 | 0 | 0 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 75 | 20% | 0% | inundada |
| moon_lily | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 21 | 0% | 0% | inundada |
|  | 15–21 | 36 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 53 | 2% | 0% | inundada |
| refining_dust | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| common_wood | 1 | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 23 | 0% | 0% | inundada |
|  | 2–3 | 35 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 48 | 17% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 33 | 52% | 0% | abundante |
|  | 8–14 | 65 | 0 | 0 | 0 | 0 | 0 | 40 | 0 | 0 | 0 | 0 | 30 | 69% | 7% | certa |
|  | 15–21 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 15 | 81% | 7% | certa |
| oak_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 50 | 0 | 0 | 10 | 0 | 0 | 0 | 8 | 0 | 1 | 0 | 25 | 36% | 12% | inundada |
|  | 8–14 | 166 | 0 | 0 | 5 | 0 | 0 | 0 | 4 | 0 | 63 | 54 | 55 | 17% | 59% | inundada |
|  | 15–21 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 45 | 20% | 59% | inundada |
| ebony_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 98 | 0 | 0 | 5 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 93 | 6% | 0% | inundada |
|  | 15–21 | 120 | 0 | 0 | 5 | 0 | 0 | 0 | 10 | 0 | 0 | 69 | 138 | 10% | 34% | inundada |
| wood_handle_common | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 8 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_oak | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_ebony | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |

#### Mineração, lenha, horta e estações, dono do Passe: fluxo por material

| material | dias (soma) | produzido | refinado | perdido | forja | refino+ | alquimia | baú | pedidos | pó | mercador | descarte | estoque fim | uso real (acum.) | descarte+perda (acum.) | veredito |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| iron | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 243 | 0 | 0 | 31 | 4 | 0 | 0 | 48 | 0 | 0 | 58 | 29 | 35% | 27% | inundada |
|  | 8–14 | 194 | 0 | 0 | 36 | 0 | 0 | 0 | 0 | 0 | 59 | 49 | 24 | 39% | 54% | inundada |
|  | 15–21 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 17 | 28% | 45% | inundada |
| steel | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| leather | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 17 | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 74 | 0 | 74 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 33 | 0 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 24 | 0 | 24 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| essence | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 5 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| copper | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 104 | 0 | 0 | 35 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 63 | 39% | 0% | inundada |
|  | 4–7 | 142 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 | 0 | 15 | 60 | 42% | 18% | abundante |
|  | 8–14 | 194 | 0 | 0 | 15 | 0 | 0 | 23 | 0 | 0 | 9 | 69 | 48 | 41% | 35% | abundante |
|  | 15–21 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 35 | 36% | 45% | inundada |
| silver | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 175 | 0 | 0 | 15 | 0 | 0 | 0 | 3 | 0 | 2 | 104 | 33 | 10% | 72% | inundada |
|  | 8–14 | 221 | 0 | 0 | 30 | 0 | 0 | 0 | 14 | 0 | 41 | 57 | 30 | 16% | 71% | inundada |
|  | 15–21 | 1 052 | 0 | 0 | 10 | 0 | 0 | 0 | 27 | 0 | 276 | 570 | 38 | 8% | 88% | inundada |
| gold_ore | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 297 | 0 | 0 | 5 | 0 | 0 | 0 | 5 | 0 | 132 | 0 | 161 | 4% | 45% | inundada |
| copper_bar | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 7 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 12 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 8 | 0 | 3 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 3 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| silver_ingot | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 6 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| gold_bar | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| common_herb | 1 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 2–3 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 75% | 0% | certa |
|  | 4–7 | 10 | 0 | 0 | 4 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 7 | 81% | 0% | certa |
|  | 8–14 | 12 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 12 | 60% | 0% | abundante |
|  | 15–21 | 24 | 0 | 0 | 0 | 0 | 24 | 0 | 0 | 0 | 0 | 0 | 14 | 70% | 0% | certa |
| energy_herb | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 8 | 33% | 0% | inundada |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 7 | 50% | 0% | abundante |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 2 | 0 | 0 | 0 | 7 | 55% | 0% | abundante |
| uncommon_root | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0% | 0% | inundada |
|  | 4–7 | 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 29 | 0% | 0% | inundada |
|  | 8–14 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 42 | 0% | 0% | inundada |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 41 | 0% | 0% | inundada |
| iron_thistle | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 5 | 44% | 0% | abundante |
|  | 8–14 | 12 | 0 | 0 | 2 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 10 | 35% | 0% | inundada |
|  | 15–21 | 12 | 0 | 0 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 0 | 10 | 73% | 0% | certa |
| gold_blossom | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 5 | 40% | 0% | abundante |
|  | 8–14 | 6 | 0 | 0 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 8 | 37% | 0% | inundada |
|  | 15–21 | 6 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 10 | 41% | 0% | abundante |
| swift_grass | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 10 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 7 | 55% | 0% | abundante |
|  | 8–14 | 24 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 28 | 37% | 0% | inundada |
|  | 15–21 | 24 | 0 | 0 | 0 | 0 | 19 | 0 | 0 | 0 | 0 | 0 | 32 | 53% | 0% | abundante |
| moon_lily | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 33 | 0% | 0% | inundada |
|  | 15–21 | 48 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 76 | 4% | 0% | inundada |
| refining_dust | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
| common_wood | 1 | 37 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 37 | 0% | 0% | inundada |
|  | 2–3 | 67 | 0 | 0 | 10 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 89 | 14% | 0% | inundada |
|  | 4–7 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 24 | 50 | 39% | 23% | inundada |
|  | 8–14 | 171 | 0 | 0 | 15 | 0 | 0 | 30 | 0 | 0 | 0 | 49 | 48 | 35% | 45% | inundada |
|  | 15–21 | 0 | 0 | 0 | 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 40% | 50% | inundada |
| oak_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 107 | 0 | 0 | 10 | 0 | 0 | 0 | 29 | 0 | 0 | 39 | 48 | 36% | 49% | inundada |
|  | 8–14 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 25 | 22% | 61% | inundada |
|  | 15–21 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | 23% | 61% | inundada |
| ebony_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 161 | 0 | 0 | 10 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 152 | 10% | 0% | inundada |
|  | 15–21 | 1 352 | 0 | 0 | 5 | 0 | 0 | 0 | 17 | 0 | 134 | 755 | 503 | 3% | 67% | inundada |
| elven_wood | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 303 | 0 | 0 | 10 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 219 | 4% | 0% | inundada |
| wood_handle_common | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 4–7 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 9 | 0 | 3 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_oak | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 8–14 | 0 | 3 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_ebony | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
|  | 15–21 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |
| wood_handle_elven | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 2–3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 4–7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 8–14 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0% | - |
|  | 15–21 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 100% | 0% | escassa |

#### Únicos por zona (cenário A, horas de caça reais do jogador simulado)

| zona | horas de caça por jogador | únicos achados (todas as seeds) | únicos por 100 dias de jogo | rolagens/h implícitas | dias (6 h/dia) para QUALQUER único | dias para um único ESPECÍFICO | ... específico Épico | ... específico Lendário |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| demon_glade | 27 | 4 | 1 | 247 | 23 | 45 | 450 | 2 250 |
| blood_marsh | 53 | 7 | 1.7 | 157 | 25 | 76 | 757 | 3 786 |
| demon_rift | 5 | 1 | 0.2 | 193 | 18 | 36 | 360 | 1 800 |

#### Runas e gemas, cenário A

| fluxo | origem / uso | dias 1–3 | dias 4–7 | dias 8–14 | dias 15–21 |
| --- | --: | --: | --: | --: | --: |
| Runas ganhas | masmorra | 4 | 5 | 2 | 7 |
| Runas ganhas | missões | 6 | 11 | 1 | 6 |
| Runas ganhas | pedido | 0 | 0 | 1 | 2 |
| Runas gastas | compra | 0 | 0 | 2 | 2 |
| gemas ganhas | emerald:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | emerald:masmorra | 0 | 2 | 0 | 4 |
| gemas ganhas | ruby:compra | 0 | 0 | 1 | 1 |
| gemas ganhas | ruby:masmorra | 0 | 2 | 0 | 4 |
| gemas ganhas | sapphire:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | sapphire:forja | 0 | 0 | 0 | 0 |
| gemas ganhas | sapphire:masmorra | 0 | 2 | 0 | 4 |
| gemas gastas | emerald:engaste | 0 | 0 | 0 | 1 |
| gemas gastas | emerald:forja | 0 | 0 | 1 | 0 |
| gemas gastas | ruby:engaste | 0 | 2 | 0 | 2 |
| gemas gastas | ruby:forja | 0 | 0 | 0 | 1 |
| gemas gastas | sapphire:engaste | 0 | 2 | 0 | 0 |
| gemas gastas | sapphire:forja | 0 | 0 | 0 | 1 |
| **Runas ganhas** | total | 10 | 17 | 5 | 16 |
| **Runas gastas** | total | 0 | 0 | 2 | 2 |
| **gemas ganhas** | total | 0 | 7 | 1 | 14 |
| **gemas gastas** | total | 0 | 5 | 1 | 4 |

#### Runas e gemas, dono do Passe

| fluxo | origem / uso | dias 1–3 | dias 4–7 | dias 8–14 | dias 15–21 |
| --- | --: | --: | --: | --: | --: |
| Runas ganhas | masmorra | 4 | 5 | 6 | 5 |
| Runas ganhas | missões | 6 | 11 | 4 | 5 |
| Runas ganhas | pedido | 0 | 2 | 3 | 1 |
| Runas gastas | compra | 0 | 0 | 2 | 0 |
| gemas ganhas | emerald:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | emerald:forja | 0 | 0 | 0 | 0 |
| gemas ganhas | emerald:masmorra | 0 | 2 | 2 | 2 |
| gemas ganhas | ruby:compra | 0 | 0 | 1 | 0 |
| gemas ganhas | ruby:forja | 0 | 0 | 0 | 1 |
| gemas ganhas | ruby:masmorra | 0 | 2 | 2 | 2 |
| gemas ganhas | sapphire:compra | 0 | 0 | 0 | 0 |
| gemas ganhas | sapphire:forja | 0 | 0 | 0 | 0 |
| gemas ganhas | sapphire:masmorra | 0 | 2 | 2 | 2 |
| gemas gastas | emerald:engaste | 0 | 2 | 0 | 0 |
| gemas gastas | emerald:forja | 0 | 0 | 1 | 0 |
| gemas gastas | ruby:engaste | 0 | 2 | 1 | 2 |
| gemas gastas | ruby:forja | 0 | 0 | 1 | 0 |
| gemas gastas | sapphire:engaste | 0 | 2 | 0 | 0 |
| gemas gastas | sapphire:forja | 0 | 1 | 0 | 0 |
| **Runas ganhas** | total | 10 | 18 | 11 | 11 |
| **Runas gastas** | total | 0 | 0 | 2 | 0 |
| **gemas ganhas** | total | 0 | 7 | 8 | 8 |
| **gemas gastas** | total | 0 | 6 | 4 | 2 |

#### Custo de um conjunto completo (7 peças, cadeia inteira), por tier

| set completo (7 peças) | leather_scrap | demon_claw | demon_core | bone_fragment | concentrated_blood | corrupted_crystal | rift_shard | fiend_horn | abyssal_marrow | blood_heart |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| T1 | 91 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| T2 | 197 | 108 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| T3 | 311 | 237 | 31 | 180 | 200 | 33 | 0 | 0 | 0 | 0 |
| T4 | 382 | 417 | 103 | 390 | 420 | 71 | 0 | 0 | 0 | 0 |
| T5 | 562 | 607 | 146 | 605 | 680 | 173 | 585 | 122 | 630 | 150 |
| T6 | 724 | 787 | 191 | 785 | 900 | 227 | 745 | 156 | 830 | 193 |

| tier | onde se caça | caça (h) | mineração (h) | lenha (h) | caça c/ Passe (h) | mineração c/ Passe (h) | lenha c/ Passe (h) |
| --- | --: | --: | --: | --: | --: | --: | --: |
| T1 | shallow N1 | 2.4 | 6.1 | 1.7 | 2.1 | 5.5 | 1.6 |
| T2 | dense N6 | 4.2 | 9.1 | 3.4 | 3.8 | 8.3 | 3.1 |
| T3 | deep N10 | 11.3 | 17.8 | 6 | 10.2 | 16.1 | 5.4 |
| T4 | deep N10 | 22.2 | 18.6 | 6.3 | 20.2 | 16.9 | 5.7 |
| T5 | deep N10 | 33 | 19 | 6.6 | 30 | 17.2 | 6 |
| T6 | deep N10 | 42.3 | 19.7 | 7 | 38.5 | 17.9 | 6.4 |

| horas de caça por material | leather_scrap | demon_claw | demon_core | bone_fragment | concentrated_blood | corrupted_crystal | rift_shard | fiend_horn | abyssal_marrow | blood_heart |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| T1 | 2.4 | - | - | - | - | - | - | - | - | - |
| T2 | 3.9 | 4.2 | - | - | - | - | - | - | - | - |
| T3 | 6.2 | 4.7 | 5.3 | 4.3 | 4.7 | 5.1 | - | - | - | - |
| T4 | 9.5 | 10 | 11.2 | 9.4 | 10 | 10.9 | - | - | - | - |
| T5 | 13.9 | 14.5 | 15.9 | 13.7 | 14.3 | 15.7 | 14.7 | 16.6 | 14.4 | 16.4 |
| T6 | 18 | 18.9 | 20.8 | 17.8 | 18.9 | 20.6 | 18.8 | 21.3 | 19 | 21 |

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

#### Produção por hora no estágio em que cada material é caçado, contra o conjunto do tier

| material | T3 (denso N5) | T4 (denso N8) | T5 (profundo N8) | T6 (profundo N10) |
| --- | --: | --: | --: | --: |
| leather_scrap | 50.4/h (d.glade) · set 311 = 6.2 h | 40.3/h (d.rift) · set 382 = 9.5 h | 40.3/h (d.rift) · set 562 = 13.9 h | 40.3/h (d.rift) · set 724 = 18 h |
| demon_claw | 50.9/h (d.glade) · set 237 = 4.7 h | 41.7/h (d.rift) · set 417 = 10 h | 41.7/h (d.rift) · set 607 = 14.5 h | 41.7/h (d.rift) · set 787 = 18.9 h |
| demon_core | 5.9/h (d.glade) · set 31 = 5.3 h | 9.2/h (d.rift) · set 103 = 11.2 h | 9.2/h (d.rift) · set 146 = 15.9 h | 9.2/h (d.rift) · set 191 = 20.8 h |
| bone_fragment | 41.6/h (b.marsh) · set 180 = 4.3 h | 41.6/h (b.marsh) · set 390 = 9.4 h | 44.1/h (b.abyss) · set 605 = 13.7 h | 44.1/h (b.abyss) · set 785 = 17.8 h |
| concentrated_blood | 42.1/h (b.marsh) · set 200 = 4.7 h | 42.1/h (b.marsh) · set 420 = 10 h | 47.7/h (b.abyss) · set 680 = 14.3 h | 47.7/h (b.abyss) · set 900 = 18.9 h |
| corrupted_crystal | 6.5/h (b.marsh) · set 33 = 5.1 h | 6.5/h (b.marsh) · set 71 = 10.9 h | 11/h (b.abyss) · set 173 = 15.7 h | 11/h (b.abyss) · set 227 = 20.6 h |
| rift_shard | 0/h (-) · set 0 = 0 h | 39.7/h (d.rift) · set 0 = 0 h | 39.7/h (d.rift) · set 585 = 14.7 h | 39.7/h (d.rift) · set 745 = 18.8 h |
| fiend_horn | 0/h (-) · set 0 = 0 h | 7.3/h (d.rift) · set 0 = 0 h | 7.3/h (d.rift) · set 122 = 16.6 h | 7.3/h (d.rift) · set 156 = 21.3 h |
| abyssal_marrow | 0/h (-) · set 0 = 0 h | 0/h (-) · set 0 = 0 h | 43.7/h (b.abyss) · set 630 = 14.4 h | 43.7/h (b.abyss) · set 830 = 19 h |
| blood_heart | 0/h (-) · set 0 = 0 h | 0/h (-) · set 0 = 0 h | 9.2/h (b.abyss) · set 150 = 16.4 h | 9.2/h (b.abyss) · set 193 = 21 h |



## 7. Rodada 12: segundo uso para todo material e sumidouros novos (12/10/2026)

O que mudou (detalhe em `docs/BALANCE_CHANGES.md`, Rodada 12, e `docs/PROFESSIONS_AUDIT.md`, seção 8):

- **6 receitas de Alquimia** (aba Alquimia do Ofícios, a estação que já existia) e **5 receitas de Pó** (estação Pó, a "conversão em lote" que já existia): Kit de Reparo (4 Ferro, 4 Madeira comum, 2 Osso), Kit de Reparo Mestre (3 Prata, 3 Ébano, 3 Sangue, 1 Raiz Anciã, 1 Lírio Lunar), Pedra de Amolar (1 Ouro bruto, 3 Ferro, 1 Sálvia Prateada, 1 Cristal), Polimento de Armadura (1 Obsidiana, 1 Madeira élfica, 1 Madeira ancestral, 1 Orquídea do Crepúsculo, 1 Flor Carmesim, 2 Cristal), Isca do Caçador (3 Sangue, 2 Capim Veloz, 1 Raiz Amarga), Tônico do Prospector (1 Prata, 2 Carvalho, 2 Cardo de Ferro, 1 Flor Dourada); Pó de Refino a partir de Ferro (10), Madeira comum (10), Carvalho (8), Ébano (8) e Cardo de Ferro (6), todos com razão saída/entradas >= 0,6.
- **Usos dos materiais de um único uso**: Prata (Kit Mestre, Tônico do Prospector), Ouro bruto (Pedra de Amolar), Obsidiana, Madeira élfica e ancestral (Polimento), Raiz Amarga (Isca), Flor Carmesim (Polimento), Madeira comum / Carvalho / Ébano (Kit de Reparo, Tônico, Kit Mestre e Pó). Os 10 passam a ter pelo menos 2 usos (teste `round12.test.ts`).
- **3 plantas novas** (Jardinagem 50 / 60 / 70) que as receitas finais exigem.

### 7.1 Medido (cenário A, 20 seeds, 21 dias; `npm run sim:flow`, o jogador usa os sumidouros alcançáveis em 21 dias)

O jogador do simulador agora (opção `sinks`, só no relatório de fluxo; a guarda de progressão não a liga) mantém 2 de cada em estoque: Kit de Reparo, Tônico do Prospector e Isca (as únicas deste conjunto que o nível 1-21 alcança: Pedra de Amolar exige Jardinagem 50, Kit Mestre 60, Polimento 65), repara com o kit antes de pagar Ouro e bebe o tônico / a isca no começo de uma coleta / caça. Uso real acumulado, antes → depois:

| material | dia 7 | dia 14 | dia 21 |
| --- | --: | --: | --: |
| iron | inundada 34% → inundada 35% | inundada 33% → inundada 28% | inundada 28% → inundada 32% |
| silver | - - → - - | inundada 17% → inundada 18% | inundada 10% → inundada 10% |
| common_wood | abundante 43% → abundante 43% | inundada 30% → inundada 35% | abundante 55% → abundante 63% |
| oak_wood | inundada 20% → inundada 20% | inundada 12% → inundada 11% | inundada 14% → inundada 12% |
| ebony_wood | - - → - - | inundada 12% → inundada 10% | inundada 4% → inundada 4% |
| bone_fragment | inundada 2% → inundada 2% | inundada 20% → inundada 20% | inundada 16% → inundada 16% |
| concentrated_blood | inundada 0% → inundada 0% | inundada 19% → inundada 19% | inundada 15% → inundada 13% |
| corrupted_crystal | inundada 0% → inundada 0% | inundada 23% → inundada 24% | inundada 20% → inundada 18% |
| iron_thistle | inundada 25% → inundada 25% | inundada 25% → inundada 25% | inundada 27% → inundada 34% |
| gold_blossom | certa 80% → certa 80% | certa 80% → certa 80% | abundante 52% → abundante 52% |
| swift_grass | abundante 40% → abundante 40% | inundada 16% → inundada 17% | inundada 31% → inundada 29% |
| uncommon_root | inundada 0% → inundada 0% | inundada 0% → inundada 0% | inundada 0% → inundada 0% |
| moon_lily | - - → - - | inundada 0% → inundada 0% | inundada 2% → inundada 2% |
| rare_flower | - - → - - | - - → - - | - - → - - |
Ouro gasto em reparo nos 21 dias (mediana): antes 200 → depois 70.

**Leitura honesta.** O veredito quase não mexe em 21 dias, e o motivo é estrutural, não de receita: o desgaste das duas peças equipadas custa só ~200 de Ouro de reparo em 21 dias (cai para 70 com o kit), então o jogador consome 1 a 2 kits no período (8 Ferro, 8 Madeira, 4 Osso). O Tônico do Prospector e a Isca dependem de Prata, Carvalho e Capim que o jogador simulado só tem a partir do dia ~7-12, e são bebidos 1 vez por sessão. O Pó (5 receitas novas) continua sendo **descarte** neste livro-razão (decisão antiga: o pó que o refino +5 a +8 gasta depois é uso a jusante, mas o simulador só fabrica pó quando um refino o exige). Ou seja: **as receitas dão a todo material um segundo uso e abrem um sumidouro recorrente de verdade (reparo, tônicos, pó) para quem joga mais de 21 dias, mas não transformam "inundada" em "certa" no horizonte medido.** Para isso o desgaste de durabilidade (ou o consumo dos tônicos) teria de crescer, o que é decisão de design (ver as decisões do diretor na Rodada 12).

Materiais que os 21 dias não alcançam (ouro bruto, obsidiana, madeiras élfica e ancestral, as 3 plantas novas, Flor Carmesim, Lírio Lunar): o uso novo é só analítico (as receitas existem e são testadas), o simulador não chega neles.
