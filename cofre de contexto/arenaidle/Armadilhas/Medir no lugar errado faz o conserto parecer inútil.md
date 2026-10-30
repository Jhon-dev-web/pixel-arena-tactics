# Medir no lugar errado faz o conserto parecer inútil

Ligações: [[Sem conexão com o servidor com o servidor inteiro no ar]] · [[2026-10-29 — A bandeira de sem conexão nunca voltava atrás]] · [[A função publicada não é a função do repositório]] · [[A tabela de eixos julga classes, não armas gêmeas]] · [[2026-10-29 — Materiais de classe não caíam onde a classe joga]]

**Sintoma.** Você conserta a causa e o problema continua.

**Dois casos de 29/10/2026:**

- As funções foram republicadas e o dono continuou travado. A causa era outra ([[Sem conexão com o servidor com o servidor inteiro no ar]]), e o conserto não tinha relação.
- Uma bandeira de "sem conexão" que nunca expirava parecia explicar tudo. Explicava um defeito **real e separado** — qualquer jogador com uma falha de rede passageira ficava preso até recarregar — mas não aquele caso, porque o laço de `useTradeableSync` já tentava a cada 30 s e falhava sempre pelo mesmo motivo.

**O que fazer.** Antes de consertar, ter **uma** medição que distinga as hipóteses. E, quando o conserto for feito por outro motivo, escrever no commit que ele não era a causa daquele caso — senão o histórico guarda a explicação errada.

**Mais três hipóteses do mesmo dia que a medição derrubou** (e cujo commit diz isso):

- "A besta lidera a Caça por causa do transbordo e da Arrancada, que crescem com a velocidade." Medido: a Arrancada não cresce com velocidade (é uma janela de pressa, já por tempo) e o transbordo nem existe no arqueiro. Normalizar os dois por tempo não moveu a vantagem, ou até a aumentou. A vantagem era a estatística da arma. Commit `5ac5add`.
- "O mago chega tarde ao tier 3 porque a seda do vazio pede Jardinagem 70." Medido: com todas as fibras no nível 1 o mago ainda não veste um conjunto tier 3 completo em 30 dias. O que segura é a **quantidade** de fibra e, do tier 3 em diante, a cópia das famílias de mineração e caça da gêmea de placa. Commit `d78d109`.
- "A espada é o caminho mais curto porque a placa é feita de material de Caça." Medido no tier 1: não é. As seis armas de tier 1 custam 40 de ouro e todas saem na primeira noite. Documento `docs/PRIMEIRA_HORA_2026-10-29.md`.

Em todos, o autor da hipótese era quem dirigia o trabalho. Escrever a hipótese derrubada no commit é o que impede o próximo de gastar a mesma tarde.
