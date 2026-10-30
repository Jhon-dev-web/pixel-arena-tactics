# Metade de uma funcionalidade publicada e não commitada

Data: 29/10/2026 (commits `557c165` e `1bef335`). Ensinou: [[Os portões verdes podem estar mentindo]] · [[A função publicada não é a função do repositório]] · Guarda: nenhum, é hábito ([[Os seis portões]])

**O que acontecia.** O commit que dizia entregar a escala de recarga por AGI levou `abilities.ts` e `engine.ts`, mas deixou na árvore de trabalho todos os consumidores: o campo em `derivedStats.ts`, o laço em `huntCombat.ts`, o campo congelado e o sanitizador em `huntSession.ts`, `BattleModal`, o driver do simulador e dois sims.

**HEAD não compilava.** O `engine.ts` commitado lia `stats.cdScale` quatro vezes e o `derivedStats.ts` commitado nem declarava o campo.

**Por que ninguém viu.** Os portões rodaram contra a árvore de trabalho, que tinha os arquivos. E o `vercel deploy` sobe a árvore de trabalho, então o jogo publicado funcionava.

**Causa raiz.** Preparar o commit escolhendo arquivos **pelo nome**, a partir de um relatório, em vez de olhar tudo o que mudou.

**Guarda.** Não há teste que pegue isso — é hábito: rodar os portões num `git worktree` limpo de HEAD antes de dar a branch por pronta. O passo a passo está em [[Os portões verdes podem estar mentindo]]. Foi essa mesma conferência que achou os testes sensíveis a fim de linha ([[2026-10-29 — Dois testes que só passavam com fim de linha LF]]).

**O que o conserto não mudou.** O commit `1bef335` diz: nenhum comportamento muda; é o código que já estava implantado e já estava medido, finalmente no commit que o anunciava.

**Efeito que veio depois da escala de recarga:** a tela de Táticas imprimia a recarga crua ([[2026-10-29 — A tela de Táticas mostrava uma recarga que o herói nunca tem]]).
