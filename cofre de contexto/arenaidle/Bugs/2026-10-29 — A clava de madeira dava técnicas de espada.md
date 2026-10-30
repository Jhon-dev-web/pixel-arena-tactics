# A clava de madeira dava técnicas de espada

Data: 29/10/2026, achado pelo dono jogando. Ensinou: [[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]] · Sistema: [[Classes e equipamento]] · Guarda: [[Guardas que existem]]

**O que acontecia.** Um herói recém-criado abria a tela de Táticas e já tinha habilidades, quando o equipamento inicial não deveria dar nenhuma.

**Causa.** `grantedAbilities` lê `line ?? 'sword'` e `weight ?? 'plate'` (`abilities.ts`). Esse padrão existia para as peças anteriores à reforma, que são mesmo espada e placa. Só que os iniciais — `wooden_club` e `ragged_clothes`, tier 0 — também não declaram tipo, então **o porrete recebia as técnicas de espada e o trapo as posturas de placa**. O padrão não era inconveniente: estava mentindo sobre o que a peça é.

**Por que ninguém viu.** Nenhum teste perguntava o que um herói novo recebe. Os testes de equilíbrio usam tier 4 e 6.

**Conserto.** Peça de **tier 0 não concede habilidade**, arma e peitoral julgados em separado. Por tier, e não por lista de ids, para cobrir qualquer peça pré-progressão sem lista para manter.

**Guarda.** `src/game/__tests__/defaultRotation.test.ts`: um save novo tem `equippedAbilities` vazio; uma espada tier 1 com o trapo inicial dá as três da espada e nenhuma do corpo.

**Efeito colateral aceito.** O herói novo caiu de 72 para 58 de CP, porque antes lutava com técnicas que não deveria ter. `recommendedCp.ts` foi regerado; os andares 50 e 75 não mudaram.

**Dois padrões implícitos que ainda existem de propósito.** "Peso ausente é placa" e "linha ausente é espada" continuam valendo para as peças anteriores à reforma (`affinity.test.ts`: "a missing weight field is plate and a missing line is the sword"). É por isso que `bronze_leather` e `iron_chainmail` são placa, e foram renomeadas ([[2026-10-29 — Nomes que contradiziam o que a coisa é]]).
