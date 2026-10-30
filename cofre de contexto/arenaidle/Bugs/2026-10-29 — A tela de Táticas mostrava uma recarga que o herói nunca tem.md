# A tela de Táticas mostrava uma recarga que o herói nunca tem

Data: 29/10/2026 (commit `5216ba6`). Ensinou: [[Números e promessas que envelhecem calados]] · Veio de: [[2026-10-29 — Metade de uma funcionalidade publicada e não commitada]] · Sistema: [[Classes e equipamento]] · Guarda: [[Guardas que existem]]

**O que acontecia.** A escala de recarga por AGI entrou naquela manhã: toda recarga é multiplicada por `abilityCdScale(level)` no combate, de 1,40 no nível 1 a 1,0 no nível 100. A tela de Táticas continuou imprimindo o tunable cru. Um herói de nível 40 lia "Recarga 4.5s" para uma habilidade que dispara a cada 5,3 s.

**Por que ninguém viu.** O autor da escala não a seguiu até a tela. É o mesmo defeito que este repositório mais produz: um número verdadeiro quando foi escrito que envelhece em silêncio. Foi achado por uma revisão paralela que o dono encomendou, lendo a tela contra o motor.

**Conserto.** Os três rótulos que mostram recarga agora mostram a recarga **no nível do herói**.

**Guarda.** `tacticsRows.test.ts`: um herói de nível baixo lê uma recarga **maior** que o valor cru, um de nível 100 lê o cru, e os dois têm de diferir. Reverter o conserto falha o teste (conferido antes de commitar).

**O que o guarda não vê.** A mesma conta aparece em outros lugares do jogo? O commit só diz que os "três rótulos" foram corrigidos e que a tela é a que lia o número cru. Quem mexer de novo em recarga deve procurar **todo lugar que imprime** uma recarga.
