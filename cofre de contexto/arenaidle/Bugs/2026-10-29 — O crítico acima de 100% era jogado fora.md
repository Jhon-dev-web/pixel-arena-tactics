# O crítico acima de 100% era jogado fora

Data: 29/10/2026 (commit `ee652a1`). Sistema: [[Classes e equipamento]] · Ensinou: [[Guarda derivado não enxerga a sua mudança]] · [[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]] · Guarda: [[Guardas que existem]]

**O que acontecia.** O arqueiro que empilhava taxa de crítico batia no teto de 100% e tudo além era cortado. Naquele ponto uma peça de tier 6 valia o mesmo que uma de tier 4: o defeito do "tier mais alto que não é melhor", no atributo em que o arqueiro é construído.

**Conserto.** A chance continua presa em 1, porque é uma probabilidade e porque um total sem teto antes fazia `sanitizeHuntSession` falhar e reconstruir em silêncio uma sessão de Caça sem o teto do Passe (10 h viravam 6 h, Rodada 24). O que a chance não pode carregar entra agora no **multiplicador**: `critMult + share * excess * (critMult - 1)`, com `share` em 0,5. Um herói em exatamente 100% ou abaixo não recebe nada, que é a linha a não cruzar: isto remove uma perda, não entrega um ganho a quem não estava perdendo.

**Onde mora.** Em `buildCombatStats`, porque a luta e o CP leem os mesmos `CombatStats`, então não podem discordar.

**Medido, não suposto.** Quão comum é o desperdício, com 20.000 heróis sorteados por célula usando o `rollRarity` e o `rollSubstats` do jogo: **0,58%** dos arqueiros tier 6 +8 com raridade de drop passam o teto, **8,4%** dos conjuntos todos raros, **38,9%** de todos épicos e **92,7%** de um tier 6 +12 lendário. O pior caso de véspera (crítico nas sete peças) era mesmo o pior caso e não o comum. A correção importa no lado épico e lendário. (Nota: a primeira versão da seção 5.1.7 de `docs/CLASSES_E_EQUIPAMENTOS.md` dizia que o caso esperado, uma peça em sete com crítico, "não foi medido". Esta medição por sorteio é a que responde, e a seção hoje a registra.)

**Antifraude re-medido** com a mudança na árvore, porque ela aumenta dano: o XP por hora ficou em **0,95** do `BOUNDS.xpPerHour` (quem decide é o teto de ritmo da zona, não o dano), e o pior dia honesto de material em **0,55** do teto diário (0,59 nos materiais de caça). Nada a republicar.

**Ponto cego conhecido.** `classAxes` **não enxerga esta mudança**, porque os heróis que ele monta não têm substatuto e nunca chegam ao teto. O guarda é `critOverflow.test.ts`, que falha com o corte antigo.
