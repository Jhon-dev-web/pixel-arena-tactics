# Arte por IA a cada quadro custa dezenas de gerações

Ligações: [[2026-10-29 — O Soberano do Abismo usava o sprite do monstro anterior]] · [[Caça e masmorra]] · [[Decisões do dono]] · [[O que está em aberto]]

**Sintoma.** Cada criatura nova do jogo parece cara demais para fazer, então o bestiário não cresce e o jogador enfrenta a mesma coisa vinte e quatro andares seguidos.

**O que o commit `e22ca35` mediu (29–30/10/2026).** O Soberano do Abismo (monstro da quinta zona de Caça) custou **cinquenta e cinco** gerações no PixelLab. O Lobo da Mata, segunda criatura do primeiro bioma da Masmorra (`goblin_forest`, andares 1 a 25), custou **três**:

1. o lobo em pé;
2. um lobo sentado, descartado;
3. o cadáver, que foi **repintado em código** com a paleta nova.

Os outros quatorze quadros da folha foram construídos a partir desses por **movimentos de pixel inteiros**. Nada é reamostrado, e o alfa continua sendo 0 ou 255. Respiração de um ou dois pixels, agachar e avançar mantendo as patas no chão, um lampejo no golpe, um cambaleio na queda. A conta fecha em três gerações por criatura, e com isso os quatro biomas passam a caber no orçamento.

**O que a primeira tentativa errou, e foi devolvido:**

- o lobo **sentado** parecia bicho de estimação e não ameaça;
- a linha de ataque era indistinguível da linha parada. "Simples" foi o pedido; "invisível" não é a mesma coisa.

**Armadilha de orientação.** A folha deve olhar para a **direita**, ao contrário do que o pedido dizia: `BattleModal` desenha todo inimigo espelhado, então uma folha virada para a esquerda viraria as costas para o herói. O executor pegou isso e estava certo. (Isto vale para este jogo: confira o espelhamento do `BattleModal` antes de gerar uma folha nova, em vez de confiar no texto do pedido.)

**A origem do pedido.** O dono viu o Raven Idle e disse que os monstros de lá quase não se mexem: um idle pequeno e nenhum passeio. Esse foi o ponto de economia inteiro: movimento pouco, mas legível.

**Por que não se mexeu nos números do jogo.** A troca é só de **aparência**. `dungeonEnemyKindForFloor` ainda responde `goblin`, então vida, dano, drops e ouro seguem vindo do mesmo lugar. O guarda `forestVariety.test.ts` fixa isso (ver [[Guardas que existem]]).

**Um limite do que está no repositório.** O commit só traz o PNG pronto (`public/assets/spritesheets/forest_wolf.png`) e o teste. Pelo `git show --stat`, **o procedimento que construiu os quadros em código não foi commitado**. Quem for fazer a segunda criatura do próximo bioma terá de refazer essa etapa ou pedir o procedimento a quem o executou.

**Padrão do jogo para folhas de personagem** (do `RESUMO_DO_PROJETO.md`): PNG em grade 4×4, linhas parado, ataque, dano e morte. As folhas de monstro da masmorra seguem as 172 px por célula, 688×688, transparentes, de lado (como descrito em `ce32440`).
