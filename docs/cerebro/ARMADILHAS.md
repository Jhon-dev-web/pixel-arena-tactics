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

## 7. Um teste de concorrência que pisca

**Sintoma.** `supabase/functions/_shared/__tests__/progress.test.ts`, no caso "two parallel calls store exactly one snapshot", falhou uma vez e passou ao rodar de novo, sozinho (79 testes) e na suíte inteira. Observado em 29/10/2026.

**O que fazer.** Não é motivo para parar o trabalho nem para mexer no teste. Mas **não o ignore em silêncio**: se acender de novo, é teste que depende de tempo e precisa ser prendido a um relógio, como foi feito em `abilitiesIdentity.test.ts`. Anote aqui a data da próxima vez, para a terceira ocorrência virar tarefa.

Ocorrências: 29/10/2026.

---

## 8. Herdadas de direções anteriores

Estas vieram da seção 11 do `RESUMO_DO_PROJETO.md`, escritas por quem dirigiu o projeto antes. **Não foram medidas por mim**, e estão aqui por serem caras de redescobrir. Quem confirmar ou desmentir uma delas, anote a data ao lado.

- **A cota grátis da Vercel é de 100 publicações por dia.** Por isso o build automático por push está desligado.
- **Testes SQL em PGlite rodam como superusuário.** Permissão de `anon` e `authenticated` precisa de teste explícito com `set role`, senão o teste passa sem provar nada.
- **`supabase db dump` precisa de Docker**, que não existe nesta máquina. Por isso as migrações são idempotentes e trazem um bloco de rollback no cabeçalho.
- **Migração nova que lê `reset_at`** precisa entrar na lista do `migration0009.test.ts`.
- **Executores que tiram screenshots com navegador headless** podem deixar centenas de processos abertos (perfil `arena-shot-*`) e fazer os testes estourarem o tempo. Encerre só os `--headless` desse perfil.
- **Executor que apaga "arquivos de rascunho" pode apagar trabalho do diretor.** Diga sempre, explicitamente, quais caminhos ele pode tocar.
- **Publicar artifact ou link:** publique primeiro e use a URL que o resultado devolve; nunca adivinhe o endereço.
- **Feche as abas do navegador integrado depois de testar** — a música do jogo continua tocando para o dono.

A de fim de linha que também estava nessa lista virou o item 4 acima, com a causa medida.

---

## 9. Medir no lugar errado faz o conserto parecer inútil

**Sintoma.** Você conserta a causa e o problema continua.

**Dois casos de 29/10/2026:**

- As funções foram republicadas e o dono continuou travado. A causa era outra (armadilha 1), e o conserto não tinha relação.
- Uma bandeira de "sem conexão" que nunca expirava parecia explicar tudo. Explicava um defeito **real e separado** — qualquer jogador com uma falha de rede passageira ficava preso até recarregar — mas não aquele caso, porque o laço de `useTradeableSync` já tentava a cada 30 s e falhava sempre pelo mesmo motivo.

**O que fazer.** Antes de consertar, ter **uma** medição que distinga as hipóteses. E, quando o conserto for feito por outro motivo, escrever no commit que ele não era a causa daquele caso — senão o histórico guarda a explicação errada.

---

## 10. Um guarda que mede uma amostra pode passar com a regra quebrada fora dela

**Sintoma.** O teste está verde, o documento diz "cada classe lidera o seu eixo", e mesmo assim uma das armas do jogo faz o contrário. Ninguém vê, porque nada acende.

**Causa.** O guarda `src/game/__tests__/classAxes.test.ts` mede **uma arma por classe**: espada, arco e cajado. A regra é sobre a **classe**, mas só três das seis armas foram medidas. A besta (segunda arma do arqueiro) lidera a Caça, que é o eixo do mago, e nenhum teste a compara com o mago. Cetro e machado ficam bem atrás da arma gêmea e também passam despercebidos. Medido em 29/10/2026; os números estão em [`CLASSES_E_EQUIPAMENTOS.md` seção 5.1.7](../CLASSES_E_EQUIPAMENTOS.md).

**O erro de leitura que leva a isso:** ver o guarda verde e concluir que o desenho está cumprido. Ele só prova o que mede.

**O comando que decide:**

```
npx vitest run --config vitest.sim.config.ts classAxesWide --silent=false --reporter=default
```

A ferramenta `scripts/tools/classAxesWide.tool.ts` mede as duas armas de cada classe (12 montagens, tiers 4 e 6) do mesmo jeito que o guarda, e os números dela reproduzem os do guarda casa a casa para as armas principais. Ela só imprime; não afirma nada, então não protege contra regressão. Quem decidir que a regra vale para todas as armas tem de levar a cobertura para o guarda.

**Como evitar.** Quando uma regra diz "toda X faz Y", o teste precisa medir todas as X, ou dizer no próprio nome e no comentário **quais** mede. E quem lê "o guarda passa" deve perguntar primeiro: passa **sobre o quê**?

> Mesma família da lição da seção 2.5 de `CLASSES_E_EQUIPAMENTOS.md`: uma medida pode estar correta e ser a medida errada.

---

## 11. O guarda do antifraude existe, mas a conta que o alimenta não sabe da sua mudança

**Sintoma.** Você muda um número do jogo que aumenta o que o jogador ganha. Roda a suíte inteira: verde, inclusive o teste que compara o jogo com os limites do servidor. Ainda assim, o servidor vai marcar jogador honesto como trapaceiro.

**Caso real (29/10/2026).** O Adubo passou a pagar +25% de XP de Jardinagem quando a economia de tempo dele é desperdiçada. O servidor aceita no máximo `BOUNDS.gardenLongestPlantXp` por canteiro numa colheita: 80. Com o bônus, uma planta de 16 h paga **100**. O guarda `seasonProgress.test.ts` compara o limite com um valor **derivado do jogo**, e continuou verde — porque a derivação (`scripts/sim/seasonBoundsDerive.ts`) calculava `max(plantHarvestXp(p))`, a planta **crua**, e não sabia que existia um bônus na colheita.

**A lição, que é mais larga que o caso.** Um guarda derivado só protege o que a **derivação** enxerga. Quando a derivação e o jogo divergem, o guarda fica verde e errado — o pior dos dois mundos, porque ele dá a sensação de que foi conferido.

**O que fazer.** Ao mexer num número que o servidor limita, não pergunte "o teste passou?". Pergunte: **"a conta que gera esse limite conhece a minha mudança?"** Abra a derivação e procure o seu número lá dentro. Se ele não estiver, o guarda é cego, e consertar a derivação vem **antes** de mexer no limite.

**Como confirmar que o conserto vale.** Depois de ensinar a derivação, volte o limite ao valor antigo e veja o guarda **ficar vermelho**. Se ele continuar verde, a derivação ainda não está vendo.

**E o limite mora no servidor.** `supabase/functions/_shared/**` só vale para o jogador depois de `supabase functions deploy`. Commit não publica. Ver item 7.

---

## 12. Uma busca numérica conserta pelo caminho mais curto, não pelo caminho certo

**Sintoma.** Você pede a um executor (ou a um script) que ache números que satisfaçam uma regra. Ele acha. A regra passa, os testes ficam verdes — e a arma que ele ajustou virou um brinquedo.

**Caso real (29/10/2026).** A regra era "a besta não lidera a Caça". Dava para cumprir de duas formas: **encolher o dano** do golpe ou **alongar a recarga**. A busca encolheu, porque mexer num multiplicador é o caminho numericamente mais curto. Resultado: `piercingBoltPct` foi parar em **1,2, que é o `min` do próprio tunable**, com recarga de 12 s — pior que a Brecha da espada (1,3 na mesma recarga). As três habilidades da besta viraram as mais fracas do jogo, e a arma passou a ganhar o eixo dela só pela estatística do equipamento.

**A lição.** Uma regra diz o que tem de ser verdade, não **como**. Se duas alavancas satisfazem a mesma regra e uma delas destrói a identidade da coisa, a busca vai escolher a que o otimizador achar mais barata, que raramente é a que o jogador sente.

**O que fazer.** Fixe a **forma** antes de soltar a busca: "esta arma é de poucos golpes enormes, então nenhum multiplicador principal abaixo de 2,5; para equilibrar, mexa só nas recargas". Aí a busca tem liberdade onde não dói e não tem onde dói.

**Sinal de alarme.** Um valor parado no `min` ou no `max` do próprio tunable quase nunca é uma escolha de desenho: é a busca batendo na parede. Quando vir um, desconfie do método, não do número.

---

## 13. Regra demais para alavanca de menos

**Sintoma.** Fechar o equilíbrio exige centenas de simulações de busca, as margens finais ficam em 1 a 2% (dentro do ruído de semente) e, ao mexer em qualquer coisa, três outras saem do lugar.

**Caso real (29/10/2026).** A tabela de eixos pedia, nos tiers 4 e 6: cada classe liderando estritamente o seu eixo, ninguém liderando eixo alheio por mais de 10%, **e** cada uma das seis armas ganhando da gêmea em algum eixo. São mais de vinte exigências simultâneas. Mas os três eixos (Caça, chefe, andares) medem quase a mesma coisa — dano por tempo — em três **tamanhos de luta**, então o sistema tem perto de **três** graus de liberdade reais, não vinte. Foram ~130 buscas para achar um ponto, e o ponto saiu com habilidades mortas e papéis invertendo entre tiers.

**A lição.** Antes de perseguir uma regra, conte os graus de liberdade. Se as suas métricas são correlacionadas, exigir sinais independentes delas é pedir o impossível, e o que sai do outro lado são números na beirada que nenhum jogador sente e que quebram ao primeiro toque.

**O que fazer.** Prefira regra **declarada** a regra **disputada**: em vez de "cada arma tem de vencer em algum eixo", diga qual arma é de luta curta e qual é de luta longa, e guarde só o **sinal** da diferença, com margem acima do ruído medido. E deixe o motor separar sozinho onde ele já separa: o desperdício de golpe (dano jogado fora num inimigo quase morto) pesa na luta curta e some na longa, então poucos golpes enormes perdem a Caça e ganham o chefe **sem ninguém calibrar**.

**Teste com margem menor que o ruído não é guarda.** Meça o ruído de semente antes de escolher a margem.
