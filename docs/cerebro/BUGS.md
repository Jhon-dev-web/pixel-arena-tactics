# Defeitos que já aconteceram

Cada um com a **causa**, **por que ninguém viu** e o **guarda que hoje acende** se voltar. Quando não houver guarda, está dito que não há.

Um defeito sem guarda volta. Essa é a razão desta lista existir em vez de morrer no histórico do git.

---

## A clava de madeira dava técnicas de espada

**Quando.** 29/10/2026, achado pelo dono jogando.

**O que acontecia.** Um herói recém-criado abria a tela de Táticas e já tinha habilidades, quando o equipamento inicial não deveria dar nenhuma.

**Causa.** `grantedAbilities` lê `line ?? 'sword'` e `weight ?? 'plate'` (`abilities.ts`). Esse padrão existia para as peças anteriores à reforma, que são mesmo espada e placa. Só que os iniciais — `wooden_club` e `ragged_clothes`, tier 0 — também não declaram tipo, então **o porrete recebia as técnicas de espada e o trapo as posturas de placa**. O padrão não era inconveniente: estava mentindo sobre o que a peça é.

**Por que ninguém viu.** Nenhum teste perguntava o que um herói novo recebe. Os testes de equilíbrio usam tier 4 e 6.

**Conserto.** Peça de **tier 0 não concede habilidade**, arma e peitoral julgados em separado. Por tier, e não por lista de ids, para cobrir qualquer peça pré-progressão sem lista para manter.

**Guarda.** `src/game/__tests__/defaultRotation.test.ts`: um save novo tem `equippedAbilities` vazio; uma espada tier 1 com o trapo inicial dá as três da espada e nenhuma do corpo.

**Efeito colateral aceito.** O herói novo caiu de 72 para 58 de CP, porque antes lutava com técnicas que não deveria ter. `recommendedCp.ts` foi regerado; os andares 50 e 75 não mudaram.

---

## O cartão do evento prometia +8% e o jogo pagava até +15%

**Quando.** 29/10/2026, achado ao investigar um fixture de teste que tinha sido enfraquecido.

**O que acontecia.** O evento "Caçada ao Alvo" diz que derrotar o alvo dá +8% de XP de Caça por 1h30. Os bônus **se acumulam** (`huntCombat.ts`, `eventPct += b.pct`, limitado por `EVENT_XP_CAP` = 0,15), então quem caça rápido derrota um alvo a cada ~35 min, empilha vários e chega a +15%.

**Por que ninguém viu.** O teste existente usava um herói lento, que nunca passava de +10%. Quando o fixture ficou mais forte, o teto estourou — e a reação instintiva foi enfraquecer o fixture, o que teria escondido o defeito de vez.

**Decisão do dono.** Manter o acúmulo e corrigir o texto, porque não tira nada de quem já tem.

**Guarda.** `src/game/__tests__/eventCards.test.ts` lê os números da configuração e exige que apareçam no texto do cartão, em `pt` e `en`. Mudar `targetBuffPct` de 0,08 para 0,085 derruba dois testes, um por idioma. Há também um teste com herói rápido em `leagueEvents.test.ts` que prende o comportamento.

**Lição de processo.** Quando um fixture precisa ser enfraquecido para um teste passar, pergunte qual das duas coisas é verdade: o fixture ficou forte demais, ou o limite passou a ser estourado de verdade. A segunda é um defeito, e o fixture o esconderia.

---

## O portão de sub-nível dizia proteger, e só atrasava

**Quando.** 28/10/2026, durante a reforma de classes.

**O que acontecia.** Os dois portões da Caça (sub-nível e profundidade) liberavam por **poder de combate**. Como o CP é a média geométrica de dano e vida efetiva, ele subestima quem troca defesa por velocidade: arqueiro (0,89 do guerreiro) e mago (0,82) destravavam **um sub-nível a menos** com o mesmo equipamento, sem nada na tela explicando.

**O que a medição mostrou.** As três classes vencem **todos** os dez sub-níveis, em todas as zonas e fundos, quatro horas sem uma derrota. O combate é vencido com índice de equipamento 2,4 a 4,0 e o portão pedia 3,7 a 8,4. Ou seja, o portão **nunca mediu capacidade** — é um marcador de ritmo. O comentário que o justificava como proteção contra "uma vitória de sorte" era falso.

**Conserto.** Os dois portões passaram a pedir **nível de equipamento** (`src/game/gearIndex.ts`): tier + refino + raridade, média sobre os 7 slots, declarado e igual para as três classes. O divisor é sempre 7 e slot vazio conta 0 — senão tirar a pior peça aumentaria a média e destravaria mais com menos.

**Guardas.**
- `zoneLevelGates.test.ts`: o último sub-nível do fundo mais difícil de **toda** zona tem de ser alcançável com o melhor equipamento do jogo. Essa regra pega o defeito original da zona 5, que herdou a curva da zona 4 sobre uma base 2,24× maior e pôs seus últimos sub-níveis fora do alcance de qualquer build.
- `gearIndex.test.ts`: tirar uma peça **baixa** o índice; as três classes têm o mesmo índice com o mesmo equipamento.

---

## A bandeira de "sem conexão" nunca voltava atrás

**Quando.** 29/10/2026.

**O que acontecia.** Quando uma chamada ao servidor de itens falhava, `tradeableStatus.ts` marcava `reachable = false`. O portão em `App.tsx` recusa a ação **lendo a bandeira, sem chamar o servidor** — então, uma vez caída, nada no caminho bloqueado voltava a tentar. O jogador ficava recusado até recarregar a página, mesmo com o servidor de volta.

A mensagem que ele lê promete "esta ação espera a conexão voltar". Não esperava.

**Conserto.** A bandeira guarda **quando** falhou e expira em 30 s — o mesmo intervalo que `useTradeableSync` já usa para tentar de novo. O que expira é só o direito de **tentar**: nada é criado nem gasto sem o servidor responder. `navigator.onLine === false` continua bloqueando na hora.

**Guarda.** `tradeableActions.test.ts`, bloco "the unreachable flag expires", com relógio falso: bloqueia aos 29,999 s, libera aos 30, a tentativa seguinte **chama** o servidor, uma nova falha reinicia o relógio, e offline bloqueia na hora.

**Importante.** Este **não** era o defeito que travava o dono naquele dia — aquilo era CORS (ver [`ARMADILHAS.md`](ARMADILHAS.md) item 1). É um defeito real e separado, que atingiria qualquer jogador com uma falha de rede passageira.

---

## Metade de uma funcionalidade publicada e não commitada

**Quando.** 29/10/2026.

**O que acontecia.** O commit que dizia entregar a escala de recarga por AGI levou `abilities.ts` e `engine.ts`, mas deixou na árvore de trabalho todos os consumidores: o campo em `derivedStats.ts`, o laço em `huntCombat.ts`, o campo congelado e o sanitizador em `huntSession.ts`, `BattleModal`, o driver do simulador e dois sims.

**HEAD não compilava.** O `engine.ts` commitado lia `stats.cdScale` quatro vezes e o `derivedStats.ts` commitado nem declarava o campo.

**Por que ninguém viu.** Os portões rodaram contra a árvore de trabalho, que tinha os arquivos. E o `vercel deploy` sobe a árvore de trabalho, então o jogo publicado funcionava.

**Causa raiz.** Preparar o commit escolhendo arquivos **pelo nome**, a partir de um relatório, em vez de olhar tudo o que mudou.

**Guarda.** Não há teste que pegue isso — é hábito: rodar os portões num `git worktree` limpo de HEAD antes de dar a branch por pronta. O passo a passo está em [`ARMADILHAS.md`](ARMADILHAS.md) item 3. Foi essa mesma conferência que achou os testes sensíveis a fim de linha.
