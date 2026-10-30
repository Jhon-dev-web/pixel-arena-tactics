# A função publicada não é a função do repositório

Ligações: [[Sem conexão com o servidor com o servidor inteiro no ar]] · [[Os portões verdes podem estar mentindo]] · [[Guarda derivado não enxerga a sua mudança]] · [[Antifraude e temporada]] · [[Economia e materiais]]

**Sintoma.** O código do servidor está certo no repositório, os testes passam, e mesmo assim o servidor se comporta como se não conhecesse itens ou materiais novos.

**Causa.** Uma função publicada carrega a cópia de `supabase/functions/_shared/**` **do momento do deploy**. Mudar o `_shared` no repositório não muda nada do que está no ar.

**O erro de conferência que leva a isso:** olhar `git status supabase/`. A árvore limpa não diz nada sobre o que está publicado.

**O comando que decide:**

```
npx supabase@2.121.0 functions list --project-ref ncufhkoyphktvmhmivxa
```

O `updated_at` de cada função tem de ser **posterior** ao último commit que tocou em `_shared`. Mais velha = republicar.

Para ter certeza do que está rodando, dá para baixar e comparar:

```
npx supabase@2.121.0 functions download mint-item --project-ref ncufhkoyphktvmhmivxa
diff supabase/functions/_shared/items/tables.ts <caminho-baixado>/supabase/functions/_shared/items/tables.ts
```

**Quais funções.** Em 29/10/2026, dez importavam as tabelas compartilhadas: `bind-item`, `market-buy`, `market-list`, `market-my`, `material-claim`, `material-sync`, `mint-item`, `submit-progress`, `ops-watchdog`, `ai-auditor`. Não importavam: `market-wallet`, `pass-crypto`, `admin-delete-user` e as `waitlist-*`. Confira antes de supor, com `grep -rl "_shared/(items|materials|progress)/" supabase/functions/<nome>/`.

**Nota.** `ops-watchdog` e `ai-auditor` rodam com `verify_jwt: false`, então publicá-las exige `--no-verify-jwt`. O modo automático bloqueia essa opção; essas duas ficam para o dono.

**Casos de 29–30/10 que dependem disto.** Várias mensagens de commit do período dizem que a mudança "não está no ar até republicar": o Adubo que paga mais XP ([[2026-10-29 — O Adubo não pagava nada a quem volta tarde]], limite mora em `bounds.ts`), a gota de linho e algodão ([[2026-10-29 — Materiais de classe não caíam onde a classe joga]], a função de materiais precisa de republicação) e o teto de andar ([[2026-10-30 — Antifraude rejeitava jogador honesto no dia 2]], onde só `submit-progress` lê o número). Commit não publica.
