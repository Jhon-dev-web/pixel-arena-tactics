# A masmorra na tela perdia o tempo que o simulador guardava

Data: 29/10/2026 (commit `8532057`). Sistema: [[Caça e masmorra]] · [[Ferramentas de medição]] · Guarda: [[Guardas que existem]]

**O que acontecia.** Os dois relógios de ataque da tela de batalha reiniciavam a partir do quadro atual (`nextAt = now`) depois de disparar. Isso joga fora os poucos milissegundos que o quadro passou do horário devido. Os dois espelhos de onde sai todo número de equilíbrio (`scripts/sim/driver.ts` e `src/game/huntCombat.ts`) **guardam** esse resto. Então a masmorra que o jogador **assiste** corria mais devagar que todo andar que já se mediu, e nada na tela podia mostrar isso.

**Tamanho.** Metade de um quadro por golpe, então é proporcional ao número de golpes por hora e cobra mais de quem é rápido. Medido em 2000 golpes a exatos 60 fps: **2,52%** do tempo perdido em 569 ms (arqueiro de tier 6), **0,32%** em 947 ms (guerreiro ou mago), **5,45%** em 284,5 ms (o mesmo arqueiro a 2x de velocidade).

**Conserto.** `stepAttackClock` guarda o resto. Quando o quadro chega atrasado em dois golpes ou mais (aba escondida ou congelada, não tremor), ele realinha para agora como antes: uma aba que dormiu cinco minutos recebe um golpe e um intervalo novo, nunca uma rajada. Os relógios do herói e do inimigo foram corrigidos **juntos**: consertar só o do herói deixaria o inimigo relativamente mais lento, que é "uma mudança de equilíbrio com roupa de correção".

**Também saiu:** o tunable `agiDodgePerPoint`. Nada no jogo o lia, e o rótulo no painel do dono ("Dodge chance per AGI point") dizia que AGI compra esquiva, o que é falso: a habilidade chamada Dodge é uma janela de pressa de +35% por 4 s a cada 16 s (hoje se chama Arrancada, ver [[2026-10-29 — O Adubo não pagava nada a quem volta tarde]]).

**Guarda.** `src/game/__tests__/attackClock.test.ts`: o total de tempo chega ao do espelho em 2000 golpes nos quatro intervalos; acompanha o espelho com quadros irregulares (até 80 ms atrasados); aba escondida dá um golpe só; uma parada de menos de dois intervalos é recuperada com suavidade; duas ou mais realinha.

**NÃO verificado na tela.** O painel do navegador estava oculto na sessão, então `requestAnimationFrame` não roda e a luta não pôde ser assistida. Foi conferida a aritmética do relógio contra os espelhos, os nove testes, e que o modal de batalha monta com as barras e sem erro de console.
