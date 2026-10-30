# Sem conexão com o servidor com o servidor inteiro no ar

Ligações: [[A função publicada não é a função do repositório]] · [[2026-10-29 — A bandeira de sem conexão nunca voltava atrás]] · [[Medir no lugar errado faz o conserto parecer inútil]] · [[Antifraude e temporada]]

**Sintoma.** O jogo mostra "Sem conexão com o servidor" (`items.unreachable`), o jogador não consegue forjar nem gastar material negociável, e **todas** as funções respondem normalmente quando testadas.

**Causa.** As funções leem `APP_ORIGIN`, uma lista de **origens exatas** (`supabase/functions/_shared/http.ts`, `parseAllowedOrigins`). Cada `vercel deploy` cria uma URL descartável (`pixel-arena-tactics-<hash>-houran.vercel.app`) que não está nessa lista. O navegador faz o preflight, recebe **204 sem `Access-Control-Allow-Origin`**, e a chamada falha antes de sair da máquina. O jogo traduz isso como servidor fora do ar.

**Tentar de novo não resolve**, porque falha sempre pelo mesmo motivo — o que faz parecer defeito do jogo.

**O comando que decide:**

```
curl -s -i -X OPTIONS https://ncufhkoyphktvmhmivxa.supabase.co/functions/v1/mint-item \
  -H "Origin: https://arena-idle-teste.vercel.app" | grep -i access-control-allow-origin
```

Cabeçalho na saída = liberado. Nenhuma saída = bloqueado. Troque o `Origin` pela URL suspeita para provar que é ela.

**Como evitar.** Publicar são **dois** passos, e só o segundo vai para alguém: `vercel deploy --yes` e depois `vercel alias set <url> arena-idle-teste.vercel.app`. O procedimento está em `docs/WEB_LAUNCH.md` seção 5.6.

> **Antes de suspeitar das funções, do código ou da bandeira de conexão, confira a origem.** Em 29/10/2026 esse diagnóstico foi errado três vezes antes de alguém medir o preflight.

Detalhe do registro de 29/10 (commit `f53990a`): o endereço `arena-idle-admin.vercel.app`, sem o `-teste`, é bloqueado de propósito. Um nome parecido não é a mesma origem. Os endereços fixos de cada ambiente estão no `RESUMO_DO_PROJETO.md`, seção 6.
