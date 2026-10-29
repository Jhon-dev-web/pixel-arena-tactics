# Pagamentos descartados: Stripe e Pix

> Decisão do dono (2026-10-28): "Stripe, pode tirar tudo aí. Stripe, Pix, deixe somente guardado como resumo aí na pasta do jogo."
> Este documento é esse resumo. Nada aqui está ativo.

## Estado hoje

O Passe do Aventureiro é pago **só em USDC na rede Solana**, pela carteira do jogador (função `pass-crypto`, veja [`MARKET_SOLANA.md`](MARKET_SOLANA.md)). **Não há cartão, não há Stripe, não há Pix.**

## Stripe

### O que existia

Duas Edge Functions (Deno) do Supabase, removidas do repositório em 2026-10-28. O código completo continua no histórico do git (último commit que as continha: `5e1bb4b`).

- **`create-checkout`**: o jogo chamava essa função (`supabase.functions.invoke('create-checkout')`, JWT do jogador anexado, nenhum id de usuário enviado). Ela autenticava o jogador, conferia a origem (`APP_ORIGIN`), respeitava as pausas do `ops` (`docs/AI_OPS.md`) e fazia um passo atômico no banco, `checkout_claim`, que: reaproveitava a sessão do Stripe ainda aberta do jogador (tabela `checkout_attempts`), recusava uma segunda sessão paralela (429) e aplicava o limite de 5 tentativas em 10 minutos. Se o jogador já tinha o Passe, respondia 409. Sem as chaves, respondia 503. Devolvia a URL do Stripe Checkout e o navegador era redirecionado.
- **`stripe-webhook`**: recebia os eventos do Stripe (implantada com `--no-verify-jwt`; a assinatura do Stripe era a autenticação). Gravava o evento em `payment_events` (idempotente pelo id do evento), criava a linha em `entitlements` com `source = 'stripe'` quando o pagamento fechava, tratava reembolso (`charge.refunded`) e disputa (`charge.dispute.created` revoga, `charge.dispute.closed` devolve se ganha), e **reembolsava sozinha** uma compra em dobro (`duplicate_refunded`). Nunca era pausada: dinheiro já cobrado precisa ser registrado.
- Segredos (só nomes): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ADVENTURER_PASS`, `STRIPE_WEBHOOK_SECRET`, `APP_ORIGIN`. O preço de US$ 10 existia só no Stripe; o jogo não tinha o valor escrito.
- Só linhas com `livemode = true` contavam para a meta de Passes, o medidor público e a elegibilidade ao ranking. Compra de teste dava as vantagens, mas nunca contava.

### Fluxo

Jogador clica em comprar, `create-checkout` devolve a URL, o navegador vai para `checkout.stripe.com`, o jogador paga, o Stripe chama `stripe-webhook`, o webhook grava `entitlements`, o jogo volta com `?checkout=success` e consulta o servidor até a linha aparecer. O guia de ligação completo (modo de teste, produto, webhook, testes de cartão) está em [`PASS_SALES.md`](PASS_SALES.md).

### Por que foi descartado

O lançamento é só com carteiras (USDC), para medir quantos cadastros o dono consegue. O Stripe já estava desligado desde 21/10 e a conta nunca foi criada. Manter duas funções de pagamento sem uso é superfície de risco sem retorno. Em 28/10 o dono mandou tirar.

### O que fazer se um dia voltar

O caminho mais curto é recuperar do git e religar, não reescrever:

1. Restaurar as duas pastas do commit `5e1bb4b`: `git checkout 5e1bb4b -- supabase/functions/create-checkout supabase/functions/stripe-webhook`.
2. A lógica ainda está no repositório em `supabase/functions/_shared/` (`checkout.ts`, `webhook.ts`, `providers/stripe.ts`, com testes em `__tests__/payments.test.ts`), então as pastas são só a fiação.
3. As tabelas e funções do banco já existem pelas migrações aplicadas (`0003`, `0007`, `0025`): `entitlements`, `payment_events`, `checkout_attempts`, `checkout_claim`.
4. Criar a conta no Stripe, o produto único de US$ 10, os segredos e o webhook, na ordem do roteiro no fim deste documento ("Caminho de reintrodução do Stripe", seções 1 a 5). Testar primeiro em modo de teste.
5. No jogo, o lado do cliente **não existe mais** (removido em 28/10, veja abaixo): `startCheckout`, `isTrustedCheckoutUrl`, `takeCheckoutReturn`, a variável `VITE_PASS_PURCHASE_ENABLED`, o estado `starting` do `PassFlow`, o botão de cartão de `BattlePassModal.tsx` e os textos `battlePass.buy`, `buySeason`, `opening`, `priceOnCheckout`, `checkoutError`, `checkoutRateLimited` (pt e en). Para recuperar o código, `git log -S startCheckout -- src/game/passServer.ts` mostra o commit que o removeu; o código está no pai dele. Será preciso religar também o efeito de `App.tsx` que lia `?pass=success` ao voltar do Stripe e reabrir a janela do Passe.
6. Implantar `create-checkout` normalmente e `stripe-webhook` com `--no-verify-jwt`. Reimplantar depois de qualquer migração que mude `checkout_claim`.
7. **Vigia (`supabase/functions/_shared/ops/watchdog.ts`)**: em 28/10, `payments_path` passou a vigiar só `pass-crypto` (o pagamento real hoje). Quem reativar o Stripe precisa pôr `create-checkout` e `stripe-webhook` de volta em `PATH_FUNCTIONS.payments_path`.
8. **Check `stripe_backlog` removido em 28/10** (o vigia, a regra de pausa `pass_sales_paused`, `WATCHDOG.backlogFail` e os testes). Ele contava as linhas de `payment_events` com `processed_at` nulo e mais de 10 minutos, **sem limite de idade**: qualquer linha antiga parada no banco geraria um alarme permanente que nenhum webhook drenaria. Para reativar, reinclua `stripe_backlog` em `CHECK_NAMES`, a regra em `RULES` e o item em `evaluateCounts` (o histórico do git, `5e1bb4b`, tem o código) e considere limitar a idade das linhas contadas. O contador `payments` de `get_ops_health` (migração `0021`) e o rótulo do painel (`admin/src/lib/labels.ts`) continuam, sem uso.
9. **Auditor (`supabase/functions/_shared/ops/prechecks.ts`)**: em 28/10 saíram os dois achados `payments:event_errors` (eventos do webhook terminados em erro) e `payments:unprocessed` (eventos parados há mais de 10 minutos, severidade alta, sem limite de idade), porque `payment_events` ficou **sem produtor**. Qualquer linha velha parada no banco viraria achado permanente que ninguém consegue resolver. Evidência de que o caminho de cripto não usa a tabela: `grep -rl payment_events supabase/functions src` só acha `_shared/db.ts` e `_shared/types.ts` (o armazém do webhook do Stripe) e testes de migração; `pass-crypto` e `_shared/chain/` e `_shared/market/` não citam a tabela (o USDC passa por `marketDb`/`passCrypto`). Quem reativar o Stripe deve pôr os dois `add(...)` de volta (o histórico do git, `5e1bb4b`, tem o código); o agregado `agg.payments` e os limiares `T.paymentEventErrors*` e `T.unprocessedEventsHigh` ficaram no lugar. O achado `payments:reversals` continua.

## Pix

**Nunca foi implementado.** Decisão do dono (2026-10-28): "Pix não vai ter."

Motivos que ele já tinha dado antes:

- **Vender SOL dentro do jogo foi descartado**, por regra do Banco Central (o jogo viraria intermediário de venda de criptoativo).
- **Comprar SOL com Pix por um serviço externo** (MoonPay, com a Ramp de reserva) foi recomendado, mas **ficou de fora do lançamento de 31/10**.
- A ideia de aceitar Pix pelo Stripe Checkout (quando a conta oferecesse) morreu junto com o Stripe.

Histórico no roteiro do Stripe, no fim deste documento, e em `RESUMO_DO_PROJETO.md`.

## O que FICOU no código, e por quê

Decisão registrada de propósito: **não se removeu tudo.** O que ficou:

- **O valor `'stripe'` em `PassSourceId` (`src/lib/passSource.ts`) NÃO foi removido.** É um valor histórico: linhas do banco de teste podem carregá-lo, e o painel de administração (outra frente, não tocado nesta limpeza) o lê para mostrar a origem do Passe, como "cartão (legado)". Tirar o valor quebraria a leitura dessas linhas em troca de nada.
- **As colunas de banco e as migrações aplicadas** (`entitlements.source` aceitando `'stripe'`, `livemode`, `payment_events`, `checkout_attempts`, `checkout_claim`) ficam pela mesma razão: já estão no banco de teste, e mexer em migração aplicada é mudança destrutiva.
- **O texto `settings.passSource_stripe` ('Cartão' / 'Card')** continua em `pt.json` e `en.json`: é o rótulo que a tela de Configurações mostra para quem tem um Passe que veio de uma linha `stripe` do banco. Sai junto com o valor `'stripe'`, se um dia ele sair.

**O que SAIU do cliente (28/10, fase 9):** `startCheckout`, `isTrustedCheckoutUrl`, `takeCheckoutReturn` e os tipos `CheckoutStart` e `CheckoutReturn` em `src/game/passServer.ts`; a variável `VITE_PASS_PURCHASE_ENABLED` (`passPurchaseEnabled`); o efeito de `App.tsx` que lia `?pass=success` na volta do Stripe; o reinício do botão no `pageshow`; o estado `starting` do `PassFlow`; o botão de cartão do `BattlePassModal.tsx` (na web o Passe tem um só controle de compra, o USDC que `App.tsx` passa em `buyExtra`; sem ele o botão principal fica desabilitado em "Em breve"); e seis textos de `battlePass.*` em pt e en. O link `?comprar=passe` do site continua e só abre a janela do Passe e destaca o pagamento em USDC, quando o mercado está ligado (`VITE_MARKET_ENABLED`).
- **A lógica de servidor em `supabase/functions/_shared/`** (`checkout.ts`, `webhook.ts`, `providers/stripe.ts`) ficam por ora, sem fiação e sem implantação. O vigia (`watchdog.ts`) já não lista as duas funções (veja o passo 7 acima).

## Caminho de reintrodução do Stripe (INATIVO)

Nada abaixo está ativo. É o roteiro que era o `PASS_SALES.md` até 29/10/2026, movido para cá sem mudar o texto (só os títulos das seções desceram um nível), para quem um dia religar o Stripe: é o que os passos 1 a 9 acima chamam de "seções 1 a 5". Como o Passe é vendido hoje (USDC) está em [`PASS_SALES.md`](PASS_SALES.md).

> **Decisão do dono (2026-10-21), substitui a de 2026-10-20 logo abaixo: o Stripe VOLTA.** O Passe é vendido por cartão (Brasil e exterior, Apple Pay / Google Pay e Pix quando o Stripe oferecer na conta) pelo Stripe Checkout, **e** em USDC na Solana para quem já tem carteira. Seguir as seções 1 a 6 deste documento (modo de teste primeiro). O Asaas foi considerado e descartado. **Atualização do mesmo dia:** o dono vai lançar o teste só com carteiras (USDC) para medir quantos cadastros consegue; o Stripe continua pronto e desligado até ele criar a conta.

> **Decisão do dono (2026-10-20): sem Stripe. O Passe é vendido SOMENTE em USDC na rede Solana, pela carteira do jogador.** O caminho de lançamento é o USDC (`VITE_MARKET_ENABLED`, função `pass-crypto`, veja [`MARKET_SOLANA.md`](MARKET_SOLANA.md)); o modal do Passe mostra só a opção USDC e o portal/FAQ falam só em USDC.
>
> **ATUALIZAÇÃO 2026-10-28: o Stripe foi RETIRADO do código, não está mais dormente.** As Edge Functions `create-checkout` e `stripe-webhook`, o caminho de checkout do cliente e a variável `VITE_PASS_PURCHASE_ENABLED` **deixaram de existir**. Tudo o que este documento diz sobre Stripe (seções 0 a 3, 5 e os testes de cartão) é **histórico**, não instrução: seguir aqueles passos hoje não liga nada. O que existia, por que saiu e **como reativar** está em [`PAGAMENTOS_DESCARTADOS.md`](PAGAMENTOS_DESCARTADOS.md). As origens `stripe` já existentes em `entitlements` continuam valendo e aparecem no painel como "cartão (legado)".

AVISO: **nada disto foi aplicado em produção por este trabalho.** Nenhuma migration foi aplicada, nenhuma função foi implantada, nenhum projeto Supabase, Stripe ou Vercel foi tocado, nenhuma chave foi lida ou escrita. O código está no repositório e a venda continua DESLIGADA até você seguir os passos abaixo. Os valores de segredos ficam só nos painéis; aqui há apenas nomes.

### 0. Como funciona (resumo)

- O Passe custa USD 10, pagamento único. **O valor existe só no Stripe** (no preço referenciado por `STRIPE_PRICE_ADVENTURER_PASS`). O jogo não tem o valor escrito em lugar nenhum: o botão mostra "O valor aparece na página de pagamento" e a página do Stripe mostra o preço. Escolha deliberada: é a opção mais simples e honesta, sem risco de o jogo mostrar um número diferente do cobrado.
- Quem decide se a conta tem o Passe é a tabela `public.entitlements` (migration `0003_entitlements.sql`). O jogador só consegue LER a própria linha; só o webhook do Stripe (função com a chave service role) ou você, no SQL Editor, escreve nela.
- **Web com Supabase configurado:** o jogo pergunta ao servidor depois do login e ao voltar do pagamento. O campo `hasBattlePass` do save é ignorado nas decisões e sobrescrito com a resposta do servidor. Editar o save para `hasBattlePass: true` não dá nada. Se o servidor não responder, vale por até 3 dias a última resposta guardada no navegador (conveniência para quem fica offline, NÃO é segurança; o ranking futuro nunca lê esse cache). Sem resposta e sem cache: sem Passe (falha fechada).
- **Build offline/desktop (sem variáveis do Supabase):** comportamento exatamente como antes: vale o `hasBattlePass` do save; em build DEV o botão de teste ativa o Passe; em produção o botão mostra "Disponível em breve na Steam".
- **Saves online antigos com `hasBattlePass: true` NÃO ganham o Passe automaticamente.** Se alguém realmente o tinha, conceda à mão (seção 8).
- **Uma sessão de pagamento por jogador (migration `0007`).** `create-checkout` faz um único passo atômico no banco (`checkout_claim`, com trava por jogador): se o jogador já tem uma sessão do Stripe aberta (guardada em `checkout_attempts`, ainda válida e não paga), devolve **a mesma URL** em vez de criar outra; duas chamadas paralelas não criam duas sessões (a perdedora recebe 429 `checkout_in_progress` e tenta de novo em segundos); o limite de 5 tentativas em 10 minutos é aplicado na mesma trava. Reusar uma sessão não gasta o limite.
- **Compra em dobro é devolvida sozinha.** Se mesmo assim chegar o pagamento de uma segunda sessão de um jogador que já tem o Passe, o webhook cria nada, **reembolsa o pagamento inteiro** pela API do Stripe (`POST /v1/refunds`, `Idempotency-Key` = id do evento, então reentregas nunca reembolsam duas vezes) e registra `duplicate_refunded` em `payment_events`. Se o Stripe recusar o reembolso, o webhook responde 500 e o Stripe tenta de novo com a mesma chave. O reembolso gera um `charge.refunded` para o segundo pagamento, que dá `unmatched` (não toca o Passe verdadeiro). Atenção: se o primeiro Passe é uma concessão manual (`grant`) e a pessoa depois paga, o pagamento também é devolvido.
- **Também em USDC (web).** Quando o dono liga o mercado (`VITE_MARKET_ENABLED`), o modal do Passe ganha um segundo botão que paga os mesmos USD 10 em **USDC na rede Solana** (preço do segredo `PASS_PRICE_USDC`, padrão 10.00), direto da carteira do jogador (Phantom, Solflare) para a carteira do dono (`pass-crypto`, migration `0013`): o direito é gravado com `source = 'crypto_sol'`, `provider_ref` = a assinatura da transação, e as mesmas regras valem (um Passe ativo por conta, só `livemode` conta para a meta; na devnet o Passe dá as vantagens, mas não conta). O dono precisa criar a conta de token de USDC da carteira que recebe, uma vez. Tudo em [`MARKET_SOLANA.md`](MARKET_SOLANA.md); reembolso de um Passe pago em USDC é manual (`update public.entitlements set status = 'refunded' where provider_ref = '<assinatura>'`, e devolver o valor em USDC pela carteira).
- **`livemode`.** `entitlements` e `payment_events` guardam se o evento veio do Stripe live ou de teste. **Só linhas `livemode = true` contam para a meta de Passes, para o medidor público (uma barra de progresso, sem números, desde a migration `0008`) e para a elegibilidade ao ranking.** Compras de teste dão as vantagens do Passe no jogo, mas nunca contam para a meta nem rankeiam. A migration copia o valor dos eventos já gravados; veja o cabeçalho de `0007_review_fixes.sql` para as linhas que ela não consegue inferir.
- **Para o ranking de temporada:** no servidor, use a função SQL `arena_private.owns_adventurer_pass(uuid)` (só o service role e RPCs `security definer` chamam). No cliente, a única leitura permitida é `fetchServerPassOwned()` em `src/game/passServer.ts` (para exibir, nunca para decidir prêmio). O ranking nunca deve ler `save.hasBattlePass`.

### 1. Stripe (modo de teste primeiro)

1. No painel do Stripe, ligue o **modo de teste**.
2. Catálogo de produtos: criar o produto **"Passe do Aventureiro"** com um preço **único (one-time) de 10.00 USD**. Copie o **id do preço** (começa com `price_`); ele vira o segredo `STRIPE_PRICE_ADVENTURER_PASS`.
3. Developers, API keys: a chave secreta de teste vira o segredo `STRIPE_SECRET_KEY`.

### 2. Banco: migration

Aplique `supabase/migrations/0003_entitlements.sql` você mesmo, primeiro no projeto de DESENVOLVIMENTO (SQL Editor, ou `supabase db push` apontando para o projeto de dev). O arquivo traz no fim um plano de testes SQL (cliente não escreve, usuário só lê as próprias linhas, idempotência) e as instruções de rollback. Rode o plano antes de seguir.

Depois, na ordem, `0004` a `0006` (ranking; veja [`SEASON_RANKING.md`](SEASON_RANKING.md)) e **`0007_review_fixes.sql`**, que acrescenta a este fluxo: colunas `livemode`, a sessão de pagamento guardada em `checkout_attempts` e a função `checkout_claim`. A `0007` precisa da `0006` já aplicada e traz o seu próprio plano de testes SQL (seção G é a do checkout). **Reimplante `create-checkout` e `stripe-webhook`** depois de aplicá-la: o código novo chama `checkout_claim` e grava `livemode`, e quebra se a migration não estiver aplicada.

### 3. Segredos das funções (Supabase, Edge Functions, Secrets)

Nomes: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ADVENTURER_PASS`, `STRIPE_WEBHOOK_SECRET` (criado no passo 5), `APP_ORIGIN` (a origem exata do jogo, ex.: `https://jogar.<domínio>`; pode listar mais de uma separadas por vírgula, ex.: a de preview). `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são fornecidas pela plataforma.

### 4. Implantar as funções (você, com a CLI, no projeto de dev primeiro)

- `create-checkout`: implantar normalmente (exige o JWT do jogador).
- `stripe-webhook`: implantar com `--no-verify-jwt` (o Stripe não envia JWT do Supabase; a assinatura do Stripe é a autenticação).
- `submit-progress` (ranking) é implantada à parte, **com** JWT; veja [`SEASON_RANKING.md`](SEASON_RANKING.md). Depois da `0007` reimplante as três.

### 5. Webhook no Stripe

Developers, Webhooks, Add endpoint, URL `https://<ref-do-projeto>.supabase.co/functions/v1/stripe-webhook`. Eventos a selecionar (só estes):

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded` (reembolso total: o Passe vira `refunded`)
- `charge.dispute.created` (disputa aberta: o Passe vira `revoked`, **não** `refunded`)
- `charge.dispute.closed` (**novo, adicione ao endpoint já existente**): só `status = won` faz algo, e devolve o Passe (`revoked` volta a `active`; se o jogador comprou outro Passe enquanto isso, fica `restore_blocked_already_active` e nada muda; uma disputa perdida deixa o Passe revogado)

Copie o "Signing secret" (`whsec_...`) para o segredo `STRIPE_WEBHOOK_SECRET`.

### 6. Variáveis na Vercel

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (já descritas em `docs/WEB_LAUNCH.md`), do mesmo projeto Supabase onde as funções estão.
- ~~`VITE_PASS_PURCHASE_ENABLED`~~: **não existe mais** (retirada em 28/10 com o Stripe). Nada no jogo a lê. Hoje quem decide se o botão de compra aparece é `VITE_MARKET_ENABLED`, porque o pagamento é em USDC.
- Nunca coloque chave do Stripe ou service role em variável `VITE_*`.

A CSP do `vercel.json` não precisou mudar: o checkout é um redirecionamento de página inteira para `checkout.stripe.com` (a CSP não restringe navegação) e a chamada à função `create-checkout` vai para `https://*.supabase.co`, que já estava liberado em `connect-src`. Foi conferido localmente servindo o build com os cabeçalhos do `vercel.json`: a página carrega sem violações no console.

### 7. Testar em modo de teste

1. Projeto de dev com tudo acima no ambiente Preview. (A variável `VITE_PASS_PURCHASE_ENABLED` não existe mais desde 28/10.)
2. Entre com uma conta de teste, abra o Passe, clique em comprar. Na página do Stripe use o cartão de teste publicado `4242 4242 4242 4242`, qualquer data futura, qualquer CVC.
3. Ao voltar o jogo mostra "Confirmando pagamento…" e depois o sucesso; se o webhook demorar, "Ainda processando. Volte em instantes." com botão "Verificar de novo".
4. Conferir: uma linha em `entitlements` (source `stripe`, status `active`) e o evento em `payment_events` com resultado `granted`. Reenviar o mesmo evento pelo painel do Stripe não cria segunda linha.
5. Reembolsar o pagamento de teste: a linha vira `refunded` e, ao reabrir o jogo (ou voltar à aba depois de 5 min), o Passe some.
6. Conferir que um save editado para `hasBattlePass: true` continua sem Passe.
7. Compra em dobro: com o Passe ativo, abra o link de uma segunda sessão (ou use a CLI do Stripe, `stripe trigger checkout.session.completed`, com os metadados do Passe) e pague de novo: o resultado do evento deve ser `duplicate_refunded` e um reembolso aparece no Stripe.
8. Clique duas vezes rápido em comprar, ou em duas abas: as duas devem abrir **a mesma** página do Stripe (ou a segunda ver "tente de novo em segundos").
9. Disputa: dispare `charge.dispute.created` (cartão de teste `4000000000000259`): a linha vira `revoked` e o jogador sai das listas pagas; depois `charge.dispute.closed` com `won`: volta a `active`.
10. Todo evento de teste grava `livemode = false`: confira que o medidor `pass_meter()` **não** sobe com compras de teste.

### 8. Concessão manual, reembolso e revogação (SQL Editor)

Conceder (presente, tester, suporte):

```sql
insert into public.entitlements (user_id, kind, source, provider_ref)
values ('<uuid-do-usuario>', 'adventurer_pass', 'grant', 'grant-2026-10-14-<nota>');
```

Revogar ou registrar reembolso manual: `update public.entitlements set status = 'revoked' where provider_ref = '<ref>';` (use `'refunded'` para reembolso). O histórico fica; uma nova compra continua possível. Reembolsos feitos no painel do Stripe chegam sozinhos pelo evento `charge.refunded`; disputas pelos eventos `charge.dispute.created` (revoga) e `charge.dispute.closed` (devolve se ganha). Um Passe `refunded` ou `revoked` sai das listas públicas pagas e da auditoria do prêmio na hora (`SEASON_RANKING.md`).

### 9. Antes de passar para o modo live

- Refazer tudo no projeto de PRODUÇÃO: migration, funções, segredos com as chaves LIVE e o preço LIVE de 10.00 USD, novo endpoint de webhook live com seu próprio `whsec_`.
- `APP_ORIGIN` só com o domínio real. Conferir Site URL do Supabase e a CSP no site publicado.
- Textos legais da seção 3 de `docs/WEB_LAUNCH.md` (reembolso, termos, privacidade) publicados e linkados antes de cobrar de verdade.
- Uma compra real pequena sua, seguida de reembolso, para ver o ciclo completo em live.
- Histórico: aqui se ligava `VITE_PASS_PURCHASE_ENABLED=true` em Production. Essa variável não existe mais desde 28/10; hoje o botão depende de `VITE_MARKET_ENABLED`.

### 10. O que NÃO foi testado de verdade

As funções (Deno) foram cobertas por testes unitários em Node com fakes (inclusive o reembolso automático, a sessão reaproveitada, as disputas e o `livemode`, com um Stripe falso); o runtime Deno, o Stripe real e o Supabase real nunca foram executados. Os passos da seção 7 são o primeiro teste de ponta a ponta.
