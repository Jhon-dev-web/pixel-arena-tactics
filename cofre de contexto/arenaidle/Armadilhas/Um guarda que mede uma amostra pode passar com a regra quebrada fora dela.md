# Um guarda que mede uma amostra pode passar com a regra quebrada fora dela

Ligações: [[A tabela de eixos julga classes, não armas gêmeas]] · [[2026-10-29 — A besta liderava a Caça e o machado e o cetro eram opções mortas]] · [[2026-10-29 — A clava de madeira dava técnicas de espada]] · [[2026-10-29 — O simulador só jogava o guerreiro]] · [[Classes e equipamento]] · [[Guardas que existem]] · [[Ferramentas de medição]]

**Sintoma.** O teste está verde, o documento diz "cada classe lidera o seu eixo", e mesmo assim uma das armas do jogo faz o contrário. Ninguém vê, porque nada acende.

**Causa.** O guarda `src/game/__tests__/classAxes.test.ts` media **uma arma por classe**: espada, arco e cajado. A regra é sobre a **classe**, mas só três das seis armas foram medidas. A besta (segunda arma do arqueiro) liderava a Caça, que é o eixo do mago, e nenhum teste a comparava com o mago. Cetro e machado ficavam bem atrás da arma gêmea e também passavam despercebidos. Medido em 29/10/2026; os números estão em `docs/CLASSES_E_EQUIPAMENTOS.md` seção 5.1.7.

**O erro de leitura que leva a isso:** ver o guarda verde e concluir que o desenho está cumprido. Ele só prova o que mede.

**O comando que decide:**

```
npx vitest run --config vitest.sim.config.ts classAxesWide --silent=false --reporter=default
```

A ferramenta `scripts/tools/classAxesWide.tool.ts` mede as duas armas de cada classe (12 montagens, tiers 4 e 6) do mesmo jeito que o guarda, e os números dela reproduzem os do guarda casa a casa para as armas principais. Ela só imprime; não afirma nada, então não protege contra regressão. Quem decidir que a regra vale para todas as armas tem de levar a cobertura para o guarda.

**Como evitar.** Quando uma regra diz "toda X faz Y", o teste precisa medir todas as X, ou dizer no próprio nome e no comentário **quais** mede. E quem lê "o guarda passa" deve perguntar primeiro: passa **sobre o quê**?

> Mesma família da lição da seção 2.5 de `docs/CLASSES_E_EQUIPAMENTOS.md`: uma medida pode estar correta e ser a medida errada.

**O que aconteceu depois (29–30/10).** O guarda foi estendido às seis armas (ver [[A tabela de eixos julga classes, não armas gêmeas]]). Mas a amostra também apareceu **por dentro**: as faixas dos blocos antigos por classe estavam sobre 3 sementes de andar e 24 de chefe, e parte do que afirmavam era sorte das sementes. Ressemeado com 96 de chefe e 9 de andar, o "+13% do arqueiro no chefe no tier 4" mede de +7,1% a +10,7%, e a afirmação "ninguém fica mais de 10% atrás" era falsa (o mago do tier 6 chega a 11,1% atrás no chefe em um dos conjuntos de sementes). O commit `145af9e` reescreveu as faixas com o mínimo, o máximo e o desvio medidos escritos ao lado de cada uma, e deixou **sem afirmação nenhuma** o que é ruído demais para limitar (andares do arqueiro e do mago no tier 4, de −17,5% a +3,8%).

Corolário: uma faixa que passa por sorte da semente é pior que nenhuma. Ela dá a mesma confiança falsa de um guarda que não vê a arma. Veja também [[Regra demais para alavanca de menos]], última frase: teste com margem menor que o ruído não é guarda.
