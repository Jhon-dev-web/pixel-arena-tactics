# Materiais de classe não caíam onde a classe joga

Data: 29/10/2026 (commits `890e060`, `c07f3a4` e `e63c6e9`). Sistema: [[Economia e materiais]] · [[Caça e masmorra]] · [[Classes e equipamento]] · Ensinou: [[Guarda derivado não enxerga a sua mudança]] · Guardas: [[Guardas que existem]]

Três rodadas da mesma doença, achadas em sequência: **o material de uma classe só caía onde o jogador dessa classe não estava**.

## 1. Tendão, pena e pó arcano só caíam nas zonas 1, 2 e 5 (`890e060`)

As zonas 3 e 4 são onde o jogador comum passa mais ou menos os dias 20 a 60, e a zona 5 abre no andar 90. As linhas de couro e de tecido ficavam inalcançáveis justamente na etapa que as pedia. O tendão do jogador comum parava em 129 por volta do dia 10 e não crescia mais. Agora chega a 446 no dia 30 e 2.749 no dia 60, contra os 405 que um conjunto completo de todos os tiers pede.

- Os novos drops rolam num fluxo próprio (`seedKey + ':class'`), não no `ownRng` compartilhado da zona, para uma caça em andamento ou repetida da mesma semente manter exatamente os drops que tinha. Teste de mutação: mover as entradas novas para o fluxo compartilhado deixa o teste vermelho.
- O pó arcano mantinha o rótulo `uncommon` nas duas zonas novas, onde cai a 0,4% contra um `rare` a 1,75%, e o guarda "um raro nunca é mais fácil que um incomum na mesma zona" ganhou uma exceção para passar. O conserto honesto foi chamá-lo do que ele é ali: `rare` na fenda e no abismo, e a exceção saiu. A raridade é um campo da **entrada do drop**, não do material.
- O teto diário de tendão foi medido quando só duas zonas o largavam, e o pior dia honesto tinha subido a 0,84 dele. O valor nem era medição: era uma proporção de 140 no lugar de um 74 subestimado. Medido direito com o conteúdo novo, 218; o teto diário vai de 9 a 14 e o pior dia honesto cai a 0,58. O material mais apertado do jogo passou a ser o osso, a 0,64. "Um jogador honesto marcado como trapaceiro é pior que qualquer desequilíbrio" — o teto teve de andar **junto** com o conteúdo, não depois.
- **Não explicado, registrado:** o jogador comum simulado termina o dia 60 um pouco pior, e subir a mochila em 8 slots piorou mais, então o transbordo da mochila (54 a 182 unidades deixadas para trás) não é a causa. Em mais ou menos um sigma pode ser a variância do simulador.

## 2. A pena não caía onde o arqueiro começa (`c07f3a4`)

A aljava de tier 1 pede quatro penas e a pena só caía no pântano em diante, que abre no andar 26. No primeiro dia o arqueiro fazia cinco das seis peças de couro e parava, enquanto o guerreiro completava o conjunto. Agora cai na clareira com a chance que tem em todo lugar, 2,71 por hora para um herói novo; as quatro da aljava são uns noventa minutos de caça. Rola no fluxo de classe, porque esse fluxo já alimenta o tendão em ordem de array e uma entrada nova teria movido o tendão de toda sessão da clareira.

A alternativa recusada foi tirar a pena da aljava de tier 1: só empurraria a parede para o tier seguinte e quebraria a promessa de que cada peso de armadura tem o seu material. `abilitiesGolden.json` ficou intocado e a fixture em volta passou a fixar a clareira como era, sem as entradas do fluxo de classe. O pico honesto medido da pena foi de 148 a 152, sem mudar o teto diário; o pior caso fica em 0,58 e o material mais apertado passou a ser a garra de demônio, a 0,67.

## 3. Um fio de linho e algodão na Clareira (`e63c6e9`)

O dono escolheu isto olhando o Raven Idle, onde uma receita de cozinha come criatura e terra e as atividades se seguram. Medido aqui, a sobreposição entre Horta e Caça era **exatamente zero**: a Caça larga 13 materiais, a Horta cultiva 17, nenhum em comum. O conjunto de tier 2 do mago vinha no dia 13 a 16, contra 4 a 5 do guerreiro e 5 a 6 do arqueiro, faltando algumas unidades de linho ou algodão em cada forja do dia 6 ao 19. Com o fio vem no dia 11 a 14.

**É um fio, não uma segunda fonte, e foram duas rodadas para acertar.** A 0,1% e 0,07%, o mago dono do Passe tirou 38% e 46% da fibra da Caça: a Horta vira opcional para quem paga, que é a única coisa que isto não podia fazer. A 0,07% e 0,05% fica em 19% e 32% na janela que importa. A `wild_silk` **não** cai de propósito: medido, um drop dela supriu 100% da seda do mago e a Horta deixou de ser plantada. É a Clareira porque é onde o mago ainda está: o pântano abre no andar 26 e ele chega por volta do dia 10.

O servidor sabe: `tables.ts` regerado (linho 1,54/h, algodão 1,10/h, os dois agora raros). **A função de materiais precisa de republicação** antes de chegar aos jogadores ([[A função publicada não é a função do repositório]]).

`materialFlow` B3 passou de 6 para 8 slots, com a regra que protege escrita no teste: a primeira caça de um herói novo não pode entupir a mochila, no máximo um terço de 26. Seis era exatamente o tamanho da sessão antiga, sem folga; oito ainda cumpre a regra. É mudança de produto, não número entortado para um teste passar.

**O que isto NÃO resolve (medido, não suposto):** o tier 3 do mago continua no dia 25 a 28. O gargalo depois do tier 2 não é fibra: com fibra **grátis** o tier 3 ainda cai entre o dia 13 e o 22 e erra duas sementes em cinco. O rastro mostra o mago simulado comprando um anel de prata e um cetro de prata nos dias 18 a 20 e só mirando o traje de seda no dia 21: é a ordem de compra e a corrente de armas, não a Horta. Aumentar a fibra por planta moveu um dia; cortar a fibra por pano de 5 para 3 quebrou `itemBalance` R7, a paridade de custo com a peça gêmea do guerreiro, e foi revertido. Ver [[O que está em aberto]].
