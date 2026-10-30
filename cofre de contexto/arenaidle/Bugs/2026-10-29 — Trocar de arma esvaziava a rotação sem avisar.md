# Trocar de arma esvaziava a rotação sem avisar

Data: 29/10/2026 (commit `e20b514`). Sistema: [[Classes e equipamento]] · Guarda: [[Guardas que existem]]

**O que acontecia.** Quem tinha escolhido a própria rotação e depois trocava de arma continuava lutando com as sobras: as habilidades que a arma antiga concedia eram cortadas e os lugares ficavam **vazios**, sem nada na tela dizendo. Num jogo idle a maioria nunca abre a tela de Táticas, então seguia com menos habilidades do que o equipamento dava, até alguém olhar.

**Conserto.** `fillRotation` (`abilities.ts`) reabastece o que a troca esvaziou, com as habilidades que o equipamento vestido concede, em ordem de definição, **nos mesmos lugares** que ficaram vazios e depois no fim, até o limite de slots. A ordem que o jogador escolheu nunca é reembaralhada.

**Os dois estados que são escolha deliberada ficam intocados:**

- `rotation: []` (limpa de propósito) continua vazia;
- rotação ausente continua automática.

Uma lista curta que o jogador escolheu **não** é completada enquanto o equipamento ainda concede tudo dela: o reabastecimento só acontece quando uma troca realmente cortou algo.

**Onde mora.** Em `effectiveRotation`, porque é o único lugar por onde passam os três leitores (combate, CP e tela). `normalizeSave` e `applyRotation` não estão no caminho de uma troca de arma, então quem nunca abre Táticas nunca seria alcançado por lá. **Nada é gravado no save**: o campo guardado continua sendo a escolha literal, então devolver a arma antiga devolve a lista própria do jogador.

**Testes antigos trocados, não afrouxados.** Quatro asserções em `abilities.test.ts` e `defaultRotation.test.ts` afirmavam a regra velha ("cortada e deixada vazia"), e o nome de um teste também. Foram atualizadas para os valores novos; cada uma ainda confere que as habilidades mantidas mantêm o lugar, que o resultado nunca passa dos slots e que os estados "limpo" e "automático" não são tocados.

**Visto rodando a 375 px.** Um save com `['arrow_rain', 'firm_strike']` e uma espada grande vestida mostra as quatro linhas Estocada Dupla, Golpe Firme, Brecha e Postura de Ferro, com o `firm_strike` dele ainda no lugar 2, enquanto o save continua guardando as duas dele. A nota nova ocupa 3 linhas em português e 2 em inglês.

**Guarda.** `src/game/__tests__/rotationRefill.test.ts` (inclui uma propriedade geral: nunca mais longa que os slots, sem repetição, só o que o equipamento concede, as mantidas na ordem delas, e cheia sempre que algo foi cortado e o equipamento tem sobra).
