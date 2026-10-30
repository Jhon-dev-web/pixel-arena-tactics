# O Soberano do Abismo usava o sprite do monstro anterior

Data: 29/10/2026 (commits `ce32440` e `ec9f0e5`). Sistema: [[Caça e masmorra]] · Relacionado: [[Arte por IA a cada quadro custa dezenas de gerações]]

**O que acontecia.** A última zona de Caça, o Trono do Abismo, não tinha arte própria: o monstro dela apontava para `blood_abomination.png`, a criatura da zona anterior. O jogador atravessava o jogo todo e encontrava, no fim, a mesma coisa que vinha matando havia dias.

**A arte (`ce32440`).** Feita no PixelLab na folha que o jogo já usa: 4×4, células de 172 px, 688×688, transparente, de lado olhando para a esquerda, as quatro linhas que a tela de batalha lê (parado, ataque, dano, morte). Placa de obsidiana, coroa de chifres, manto índigo com detalhes de brasa. Conferida no arquivo escrito, não no relatório: 688×688 RGBA, alfa só 0 ou 255, as dezesseis células desenhadas, nenhuma encostando na borda (3 px de folga no pior caso), e o último quadro de morte apoiado na mesma linha do chão da pose em pé.

**A ligação (`ec9f0e5`).** Ficou fora do primeiro commit porque `huntingZones.ts` estava aberto por outra frente. Medidas: `box [48, 13, 130, 150]` e `lie 150`, ambas lidas no novo quadro parado. O `height` ficou em **1,25 de propósito**, contra a sugestão que veio com a arte: é múltiplo de `HERO_HEIGHT`, não do desenho (o renderizador escala o que `box` recorta até `HERO_HEIGHT * height`), então o sprite novo ter 137 px de corpo contra 121 da abominação não o faz renderizar maior; baixar o valor **encolheria** o monstro que a zona 5 sempre quis ser o maior das cinco.

**Por que importa guardar:** é o jeito de a arte ser feita e a ligação ficar para depois, e a arte sozinha não aparece no jogo. Os dois passos são commits separados e o segundo é fácil de esquecer.
