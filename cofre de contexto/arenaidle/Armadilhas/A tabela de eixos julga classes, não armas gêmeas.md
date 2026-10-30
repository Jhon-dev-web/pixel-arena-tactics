# A tabela de eixos julga classes, não armas gêmeas

Ligações: [[Classes e equipamento]] · [[Regra demais para alavanca de menos]] · [[Uma busca numérica conserta pelo caminho mais curto]] · [[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]] · [[2026-10-29 — A besta liderava a Caça e o machado e o cetro eram opções mortas]] · [[Guardas que existem]] · [[Ferramentas de medição]]

**Sintoma.** Você quer que cada arma tenha um papel próprio (a de luta curta ganha a Caça, a de luta longa ganha o chefe) e calibra recargas e multiplicadores até a tabela de eixos dizer isso. Não fecha. Cada rodada de ajuste desfaz a anterior, as habilidades de uma arma ficam sem graça, e o papel de cada arma troca de um tier para o outro.

**O que foi medido (30/10/2026, `scripts/tools/classAxesWide.tool.ts`, tiers 2 a 6; commit `c407e7c`).** A regra era impossível neste motor, não apenas difícil:

1. **O desperdício de golpe (overkill) não separa a Caça do chefe.** A mesma potência média em três formatos (2,0 a cada 10 s, 3,0 a cada 20 s, 4,0 a cada 30 s) move a Caça da besta menos de um ponto e ainda **baixa** o chefe. A alavanca "grátis" que se supunha existir não existe.
2. **O eixo "chefe" não é uma luta longa.** É a média de **quatro** chefes que medem coisas opostas. No tier 6 o chefe do andar 25 morre em 0,7 s com as habilidades já gastas, e ali decide o intervalo de ataque (o arco, mais rápido, ganha). Nos andares 75 e 100 decide a potência bruta. A média cancela as duas.
3. **A única mecânica que só a Caça recompensa é o transbordo**, e só o cajado e o machado têm. Para espada, arco e besta, Caça e chefe medem a mesma potência, então nenhuma recarga os separa.

**Conclusão.** A tabela de eixos foi feita para julgar **classes**, e julga bem. Entre **gêmeas** (espada e machado, arco e besta, cajado e cetro) ela só aguenta **uma** regra, apontada para o defeito que realmente machucou o jogador: **nenhuma arma pode ser pior que a gêmea nos três eixos ao mesmo tempo** (uma opção morta). Ela não pede vitória, nem papel fixo, nem sinal igual entre tiers.

**A amostragem ficou honesta, e mudou uma afirmação que já tinha sido feita.** Com 9 sementes de andar no lugar de 3, a "vantagem" do guerreiro nos andares é empate em alguns conjuntos de sementes. Então o guarda diz **ninguém passa o guerreiro** em vez de dizer que ele lidera, e o chefe do tier 4 é uma faixa e não uma ordem. São 96 sementes de chefe (com 24, o desvio chegava a 5,6 pontos) e margens de duas vezes o ruído medido: 1,5 na Caça, 4 no chefe e um andar inteiro nos andares. Cinco tiers, de 2 a 6.

**Por que a margem de 4 pontos no chefe fica baixa de propósito** (commit `145af9e`, com 12 conjuntos de sementes): o desvio do chefe chega a 4,17 pontos no pior par (cetro contra cajado no tier 6 pede 8,3 por si só). Mas a regra das gêmeas é uma **conjunção** (Caça **e** chefe **e** andares), e a Caça, que é o eixo estável, não se mexe com ruído de chefe. Então o ruído pode **esconder** uma arma morta, mas não **inventar** uma. Quem um dia quiser que o chefe sozinho carregue uma regra tem de subir a margem para 8,5 antes, ou amostrar mais de 96 sementes por luta.

**O que fazer quando mexer em arma, habilidade, crítico ou na régua dos eixos.** Rode a ferramenta antes de dar a tabela por cumprida:

```
npx vitest run --config vitest.sim.config.ts classAxesWide --silent=false --reporter=default
```

E leia o desvio dela (`AXES_NOISE=k` re-mede cada par com k conjuntos de sementes) **antes** de escolher qualquer margem. Margem menor que o ruído é teste que acende ou dorme pela semente.

O histórico completo, com a tabela de rodadas e as faixas que o guarda afirma, está em `docs/CLASSES_E_EQUIPAMENTOS.md` seção 5.1.7 (ver [[Classes e equipamento]]).
