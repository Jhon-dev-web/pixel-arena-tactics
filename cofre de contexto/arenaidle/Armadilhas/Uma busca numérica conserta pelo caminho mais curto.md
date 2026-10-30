# Uma busca numérica conserta pelo caminho mais curto

Ligações: [[Regra demais para alavanca de menos]] · [[2026-10-29 — A besta liderava a Caça e o machado e o cetro eram opções mortas]] · [[A tabela de eixos julga classes, não armas gêmeas]] · [[Classes e equipamento]] · [[Ferramentas de medição]]

**Sintoma.** Você pede a um executor (ou a um script) que ache números que satisfaçam uma regra. Ele acha. A regra passa, os testes ficam verdes — e a arma que ele ajustou virou um brinquedo.

**Caso real (29/10/2026).** A regra era "a besta não lidera a Caça". Dava para cumprir de duas formas: **encolher o dano** do golpe ou **alongar a recarga**. A busca encolheu, porque mexer num multiplicador é o caminho numericamente mais curto. Resultado: `piercingBoltPct` foi parar em **1,2, que é o `min` do próprio tunable**, com recarga de 12 s — pior que a Brecha da espada (1,3 na mesma recarga). As três habilidades da besta viraram as mais fracas do jogo, e a arma passou a ganhar o eixo dela só pela estatística do equipamento.

**A lição.** Uma regra diz o que tem de ser verdade, não **como**. Se duas alavancas satisfazem a mesma regra e uma delas destrói a identidade da coisa, a busca vai escolher a que o otimizador achar mais barata, que raramente é a que o jogador sente.

**O que fazer.** Fixe a **forma** antes de soltar a busca: "esta arma é de poucos golpes enormes, então nenhum multiplicador principal abaixo de 2,5; para equilibrar, mexa só nas recargas". Aí a busca tem liberdade onde não dói e não tem onde dói.

**Sinal de alarme.** Um valor parado no `min` ou no `max` do próprio tunable quase nunca é uma escolha de desenho: é a busca batendo na parede. Quando vir um, desconfie do método, não do número.

**Como foi corrigido (commit `c407e7c`).** A besta voltou a bater forte: Virote Perfurante 1,2 para 3,0, Tiro Duplo 0,5 para 2 golpes de 1,25 (o total antigo de 1,0 era menos que um golpe simples), Tiro Fatal 2,6 para 5,0, com todo o equilíbrio feito nas **recargas** (36 s, 32 s, 54 s) e nenhum multiplicador abaixo de 2,5. Ela é arma de golpes raros e pesados, e continua atrás do mago na Caça em todos os tiers. A forma foi fixada primeiro, como a lição manda.
