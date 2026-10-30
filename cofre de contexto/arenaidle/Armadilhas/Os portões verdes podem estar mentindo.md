# Os portões verdes podem estar mentindo

Ligações: [[Os seis portões]] · [[2026-10-29 — Metade de uma funcionalidade publicada e não commitada]] · [[Testes que passam só na sua máquina (fim de linha)]] · [[A função publicada não é a função do repositório]]

**Sintoma.** `npx tsc -b --noEmit` e `npm test` passam, e mesmo assim quem clonar o projeto não consegue compilar.

**Causa.** Os portões rodaram contra a **árvore de trabalho**, que tem arquivos que nunca foram commitados. Aconteceu em 29/10/2026: `engine.ts` lia `stats.cdScale` quatro vezes enquanto `derivedStats.ts`, que declara o campo, tinha ficado de fora do commit. O `vercel deploy` escondeu ainda mais, porque ele sobe a árvore de trabalho, então o jogo publicado funcionava.

**A origem do erro:** preparar o commit escolhendo arquivos **pelo nome**, a partir de um relatório, em vez de olhar tudo o que mudou.

**O que fazer antes de dar uma branch por pronta:**

```
git worktree add --detach /tmp/limpo HEAD
cd /tmp/limpo && ln -s <projeto>/node_modules node_modules
npx tsc -b --noEmit && npm test
cd - && git worktree remove --force /tmp/limpo && git worktree prune
```

Essa conferência também pega [[Testes que passam só na sua máquina (fim de linha)]].

É o mesmo erro de conferir o artefato cômodo: o `vercel deploy` sobe a árvore de trabalho e não o commit, então "o jogo publicado funciona" não prova que o repositório compila. Ver também [[A função publicada não é a função do repositório]], onde o artefato cômodo é o `git status`.
