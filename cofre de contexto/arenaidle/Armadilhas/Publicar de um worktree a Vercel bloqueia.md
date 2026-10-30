# Publicar de um worktree: a Vercel bloqueia

**Sintoma (30/10/2026).** `npx vercel deploy --yes` não dá erro nem falha na tela. O link de prévia sai, mas a publicação fica em **Blocked**, com o motivo "the commit author doesn't have permission". O site de teste continua na versão antiga, e nada avisa.

**O que foi medido.** Três publicações saíram de um `git worktree` e as três ficaram bloqueadas. A mesma versão, com o mesmo autor, publicada do checkout principal limpo, ficou **Ready** em 17 s.

**Causa provável, não provada.** No worktree, a pasta `.git` é um arquivo, e a Vercel pode não achar o remoto do GitHub. O e-mail do autor no git (`devjohn395.com`, sem `@`) talvez piore isso.

**O que fazer.** Para publicar só o que está commitado: rode os portões no worktree limpo e publique do **checkout principal**, com `git status` vazio. Depois confira com `npx vercel ls pixel-arena-tactics`. O que vale é a coluna Status, não o link impresso.

**Não confie na saída vazia.** A primeira suspeita foi o `| tail` escondendo o progresso. Ele escondia mesmo, mas o bloqueio era o problema de verdade.

Relacionadas: [[A função publicada não é a função do repositório]], [[Sem conexão com o servidor com o servidor inteiro no ar]], [[Os seis portões]].
