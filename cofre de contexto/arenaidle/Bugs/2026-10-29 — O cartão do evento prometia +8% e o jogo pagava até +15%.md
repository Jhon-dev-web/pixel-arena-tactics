# O cartão do evento prometia +8% e o jogo pagava até +15%

Data: 29/10/2026, achado ao investigar um fixture de teste que tinha sido enfraquecido. Ensinou: [[Números e promessas que envelhecem calados]] · Decisão do dono: [[Decisões do dono]] · Guarda: [[Guardas que existem]]

**O que acontecia.** O evento "Caçada ao Alvo" diz que derrotar o alvo dá +8% de XP de Caça por 1h30. Os bônus **se acumulam** (`huntCombat.ts`, `eventPct += b.pct`, limitado por `EVENT_XP_CAP` = 0,15), então quem caça rápido derrota um alvo a cada ~35 min, empilha vários e chega a +15%.

**Por que ninguém viu.** O teste existente usava um herói lento, que nunca passava de +10%. Quando o fixture ficou mais forte, o teto estourou — e a reação instintiva foi enfraquecer o fixture, o que teria escondido o defeito de vez.

**Decisão do dono.** Manter o acúmulo e corrigir o texto, porque não tira nada de quem já tem.

**Guarda.** `src/game/__tests__/eventCards.test.ts` lê os números da configuração e exige que apareçam no texto do cartão, em `pt` e `en`. Mudar `targetBuffPct` de 0,08 para 0,085 derruba dois testes, um por idioma. Há também um teste com herói rápido em `leagueEvents.test.ts` que prende o comportamento.

**Lição de processo.** Quando um fixture precisa ser enfraquecido para um teste passar, pergunte qual das duas coisas é verdade: o fixture ficou forte demais, ou o limite passou a ser estourado de verdade. A segunda é um defeito, e o fixture o esconderia.

Mesma regra que o `CLAUDE.md` do repositório escreve para guardas de equilíbrio: quando um guarda acende, o número é que está errado, o teste não. Ver [[Os seis portões]].
