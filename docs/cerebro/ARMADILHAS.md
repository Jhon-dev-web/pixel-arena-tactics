# Armadilhas

Coisas que parecem uma e são outra. Cada uma traz o **sintoma**, a **causa** e o **comando que decide**, para ninguém gastar de novo o tempo que elas já custaram.

O fio comum entre quase todas: **conferir o artefato cômodo em vez do que importa.** A árvore de trabalho em vez do que está commitado, o `git status` em vez do que está publicado, a URL que o deploy imprimiu em vez da origem que o servidor aceita.

---

## 1. "Sem conexão com o servidor" com o servidor inteiro no ar

**Sintoma.** O jogo mostra "Sem conexão com o servidor" (`items.unreachable`), o jogador não consegue forjar nem gastar material negociável, e **todas** as funções respondem normalmente quando testadas.

**Causa.** As funções leem `APP_ORIGIN`, uma lista de **origens exatas** (`supabase/functions/_shared/http.ts`, `parseAllowedOrigins`). Cada `vercel deploy` cria uma URL descartável (`pixel-arena-tactics-<hash>-houran.vercel.app`) que não está nessa lista. O navegador faz o preflight, recebe **204 sem `Access-Control-Allow-Origin`**, e a chamada falha antes de sair da máquina. O jogo traduz isso como servidor fora do ar.

**Tentar de novo não resolve**, porque falha sempre pelo mesmo motivo — o que faz parecer defeito do jogo.

**O comando que decide:**

```
curl -s -i -X OPTIONS https://ncufhkoyphktvmhmivxa.supabase.co/functions/v1/mint-item \
  -H "Origin: https://arena-idle-teste.vercel.app" | grep -i access-control-allow-origin
```

Cabeçalho na saída = liberado. Nenhuma saída = bloqueado. Troque o `Origin` pela URL suspeita para provar que é ela.

**Como evitar.** Publicar são **dois** passos, e só o segundo vai para alguém: `vercel deploy --yes` e depois `vercel alias set <url> arena-idle-teste.vercel.app`. O procedimento está em [`WEB_LAUNCH.md` seção 5.6](../WEB_LAUNCH.md).

> **Antes de suspeitar das funções, do código ou da bandeira de conexão, confira a origem.** Em 29/10/2026 esse diagnóstico foi errado três vezes antes de alguém medir o preflight.

---

## 2. A função publicada não é a função do repositório

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

---

## 3. Os portões verdes podem estar mentindo

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

Essa conferência também pega a armadilha 4.

---

## 4. Testes que passam só na sua máquina (fim de linha)

**Sintoma.** Um teste passa para você e falha para quem clonou o projeto agora — ou o contrário. No Windows, `git` configurado com `core.autocrlf=true` entrega os arquivos com CRLF; um arquivo que você editou com uma ferramenta pode ter ficado com LF.

**Causa.** Testes que leem arquivos e comparam com texto de várias linhas escrito com `\n`. Um `indexOf('\n}\n')` devolve `-1` num arquivo CRLF, e a asserção acaba comparando um pedaço errado — em 29/10/2026, a string de dois caracteres `'@m'`.

**O pior formato possível de erro:** verde no CI Linux, vermelho no primeiro clone de um colega. A máquina que pegaria o problema é justamente a que nunca roda.

**Como evitar.** Teste que lê arquivo normaliza na leitura:

```ts
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
```

Feito em `src/game/__tests__/marketWiring.test.ts` e `supabase/functions/_shared/__tests__/migration0007.test.ts`.

---

## 5. Teste que depende da data de hoje

**Sintoma.** Um teste que ninguém tocou amanhece vermelho.

**Causa.** Um save de referência (`abilitiesGolden.json`) guarda o dia em que foi gravado. O teste só passava no dia seguinte à gravação.

**Como evitar.** Prender o relógio do teste, nunca regravar o golden:

```ts
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
```

Veja `src/game/__tests__/abilitiesIdentity.test.ts`. **`abilitiesGolden.json` não se regrava** — é a prova de que o motor não mudou sozinho.

---

## 6. Números e promessas que envelhecem calados

**Sintoma.** O texto na tela, o comentário no código ou a tabela gerada descrevem um jogo que não existe mais. Ninguém percebe, porque nada acende.

**Casos reais deste repositório:**

- o cartão de um evento prometia **+8%** enquanto o jogo pagava até **+15%**, porque os bônus somam (`huntCombat.ts`, `eventPct += b.pct`, teto `EVENT_XP_CAP`);
- o comentário de um portão dizia proteger contra "uma vitória de sorte", quando a medição mostrou que o combate é vencido com equipamento tier 2 e o portão pedia tier 5 — ele é **ritmo de progressão**, não capacidade;
- três rótulos diziam "exige CP" depois que os portões passaram a pedir equipamento. O pior deles mandava o jogador travado subir um número que **nunca** o destravaria.

**Como evitar.** Número que aparece para o jogador ganha um teste que o prende à configuração — o modelo é `src/game/__tests__/eventCards.test.ts`, que lê `HUNT_EVENT_RULES`, `EVENT_BUFF_RULES` e `EVENT_XP_CAP` e exige que apareçam no texto, nas duas línguas. Mudar `targetBuffPct` de 0,08 para 0,085 faz dois testes falharem, um por idioma.

> Nenhum teste confere se o **verbo** de um rótulo bate com o que o código faz. Isso só se acha abrindo o jogo.

---

## 7. Medir no lugar errado faz o conserto parecer inútil

**Sintoma.** Você conserta a causa e o problema continua.

**Dois casos de 29/10/2026:**

- As funções foram republicadas e o dono continuou travado. A causa era outra (armadilha 1), e o conserto não tinha relação.
- Uma bandeira de "sem conexão" que nunca expirava parecia explicar tudo. Explicava um defeito **real e separado** — qualquer jogador com uma falha de rede passageira ficava preso até recarregar — mas não aquele caso, porque o laço de `useTradeableSync` já tentava a cada 30 s e falhava sempre pelo mesmo motivo.

**O que fazer.** Antes de consertar, ter **uma** medição que distinga as hipóteses. E, quando o conserto for feito por outro motivo, escrever no commit que ele não era a causa daquele caso — senão o histórico guarda a explicação errada.
