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
4. Criar a conta no Stripe, o produto único de US$ 10, os segredos e o webhook, na ordem de [`PASS_SALES.md`](PASS_SALES.md) (seções 1 a 5). Testar primeiro em modo de teste.
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

Histórico em [`PASS_SALES.md`](PASS_SALES.md) e em `RESUMO_DO_PROJETO.md`.

## O que FICOU no código, e por quê

Decisão registrada de propósito: **não se removeu tudo.** O que ficou:

- **O valor `'stripe'` em `PassSourceId` (`src/lib/passSource.ts`) NÃO foi removido.** É um valor histórico: linhas do banco de teste podem carregá-lo, e o painel de administração (outra frente, não tocado nesta limpeza) o lê para mostrar a origem do Passe, como "cartão (legado)". Tirar o valor quebraria a leitura dessas linhas em troca de nada.
- **As colunas de banco e as migrações aplicadas** (`entitlements.source` aceitando `'stripe'`, `livemode`, `payment_events`, `checkout_attempts`, `checkout_claim`) ficam pela mesma razão: já estão no banco de teste, e mexer em migração aplicada é mudança destrutiva.
- **O texto `settings.passSource_stripe` ('Cartão' / 'Card')** continua em `pt.json` e `en.json`: é o rótulo que a tela de Configurações mostra para quem tem um Passe que veio de uma linha `stripe` do banco. Sai junto com o valor `'stripe'`, se um dia ele sair.

**O que SAIU do cliente (28/10, fase 9):** `startCheckout`, `isTrustedCheckoutUrl`, `takeCheckoutReturn` e os tipos `CheckoutStart` e `CheckoutReturn` em `src/game/passServer.ts`; a variável `VITE_PASS_PURCHASE_ENABLED` (`passPurchaseEnabled`); o efeito de `App.tsx` que lia `?pass=success` na volta do Stripe; o reinício do botão no `pageshow`; o estado `starting` do `PassFlow`; o botão de cartão do `BattlePassModal.tsx` (na web o Passe tem um só controle de compra, o USDC que `App.tsx` passa em `buyExtra`; sem ele o botão principal fica desabilitado em "Em breve"); e seis textos de `battlePass.*` em pt e en. O link `?comprar=passe` do site continua e só abre a janela do Passe e destaca o pagamento em USDC, quando o mercado está ligado (`VITE_MARKET_ENABLED`).
- **A lógica de servidor em `supabase/functions/_shared/`** (`checkout.ts`, `webhook.ts`, `providers/stripe.ts`) ficam por ora, sem fiação e sem implantação. O vigia (`watchdog.ts`) já não lista as duas funções (veja o passo 7 acima).
