# Como ligar a venda do Passe do Aventureiro (web)

> **Decisão do dono (2026-10-21), substitui a de 2026-10-20 logo abaixo: o Stripe VOLTA.** O Passe é vendido por cartão (Brasil e exterior, Apple Pay / Google Pay e Pix quando o Stripe oferecer na conta) pelo Stripe Checkout, **e** em USDC na Solana para quem já tem carteira. Seguir as seções 1 a 6 deste documento (modo de teste primeiro). O Asaas foi considerado e descartado.

> **Decisão do dono (2026-10-20): sem Stripe. O Passe é vendido SOMENTE em USDC na rede Solana, pela carteira do jogador.** O caminho de lançamento é o USDC (`VITE_MARKET_ENABLED`, função `pass-crypto`, veja [`MARKET_SOLANA.md`](MARKET_SOLANA.md)); o modal do Passe mostra só a opção USDC e o portal/FAQ falam só em USDC. **Tudo o que este documento diz sobre Stripe (seções 0 a 3 sobre checkout, 5, e os testes de cartão) é OPCIONAL e fica DESLIGADO**: o código (`create-checkout`, `stripe-webhook`, `VITE_PASS_PURCHASE_ENABLED`) continua no repositório, dormente, para o futuro. Não configure Stripe para lançar. As origens `stripe` já existentes em `entitlements` continuam valendo e aparecem no painel como "cartão (legado)".

AVISO: **nada disto foi aplicado em produção por este trabalho.** Nenhuma migration foi aplicada, nenhuma função foi implantada, nenhum projeto Supabase, Stripe ou Vercel foi tocado, nenhuma chave foi lida ou escrita. O código está no repositório e a venda continua DESLIGADA até você seguir os passos abaixo. Os valores de segredos ficam só nos painéis; aqui há apenas nomes.

## 0. Como funciona (resumo)

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

## 1. Stripe (modo de teste primeiro)

1. No painel do Stripe, ligue o **modo de teste**.
2. Catálogo de produtos: criar o produto **"Passe do Aventureiro"** com um preço **único (one-time) de 10.00 USD**. Copie o **id do preço** (começa com `price_`); ele vira o segredo `STRIPE_PRICE_ADVENTURER_PASS`.
3. Developers, API keys: a chave secreta de teste vira o segredo `STRIPE_SECRET_KEY`.

## 2. Banco: migration

Aplique `supabase/migrations/0003_entitlements.sql` você mesmo, primeiro no projeto de DESENVOLVIMENTO (SQL Editor, ou `supabase db push` apontando para o projeto de dev). O arquivo traz no fim um plano de testes SQL (cliente não escreve, usuário só lê as próprias linhas, idempotência) e as instruções de rollback. Rode o plano antes de seguir.

Depois, na ordem, `0004` a `0006` (ranking; veja [`SEASON_RANKING.md`](SEASON_RANKING.md)) e **`0007_review_fixes.sql`**, que acrescenta a este fluxo: colunas `livemode`, a sessão de pagamento guardada em `checkout_attempts` e a função `checkout_claim`. A `0007` precisa da `0006` já aplicada e traz o seu próprio plano de testes SQL (seção G é a do checkout). **Reimplante `create-checkout` e `stripe-webhook`** depois de aplicá-la: o código novo chama `checkout_claim` e grava `livemode`, e quebra se a migration não estiver aplicada.

## 3. Segredos das funções (Supabase, Edge Functions, Secrets)

Nomes: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ADVENTURER_PASS`, `STRIPE_WEBHOOK_SECRET` (criado no passo 5), `APP_ORIGIN` (a origem exata do jogo, ex.: `https://jogar.<domínio>`; pode listar mais de uma separadas por vírgula, ex.: a de preview). `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são fornecidas pela plataforma.

## 4. Implantar as funções (você, com a CLI, no projeto de dev primeiro)

- `create-checkout`: implantar normalmente (exige o JWT do jogador).
- `stripe-webhook`: implantar com `--no-verify-jwt` (o Stripe não envia JWT do Supabase; a assinatura do Stripe é a autenticação).
- `submit-progress` (ranking) é implantada à parte, **com** JWT; veja [`SEASON_RANKING.md`](SEASON_RANKING.md). Depois da `0007` reimplante as três.

## 5. Webhook no Stripe

Developers, Webhooks, Add endpoint, URL `https://<ref-do-projeto>.supabase.co/functions/v1/stripe-webhook`. Eventos a selecionar (só estes):

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded` (reembolso total: o Passe vira `refunded`)
- `charge.dispute.created` (disputa aberta: o Passe vira `revoked`, **não** `refunded`)
- `charge.dispute.closed` (**novo, adicione ao endpoint já existente**): só `status = won` faz algo, e devolve o Passe (`revoked` volta a `active`; se o jogador comprou outro Passe enquanto isso, fica `restore_blocked_already_active` e nada muda; uma disputa perdida deixa o Passe revogado)

Copie o "Signing secret" (`whsec_...`) para o segredo `STRIPE_WEBHOOK_SECRET`.

## 6. Variáveis na Vercel

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (já descritas em `docs/WEB_LAUNCH.md`), do mesmo projeto Supabase onde as funções estão.
- `VITE_PASS_PURCHASE_ENABLED`: `true` liga o botão de compra. Ausente ou qualquer outro valor: o botão fica em "Em breve" (padrão). É uma variável de build do Vite: depois de mudar, faça um novo deploy.
- Nunca coloque chave do Stripe ou service role em variável `VITE_*`.

A CSP do `vercel.json` não precisou mudar: o checkout é um redirecionamento de página inteira para `checkout.stripe.com` (a CSP não restringe navegação) e a chamada à função `create-checkout` vai para `https://*.supabase.co`, que já estava liberado em `connect-src`. Foi conferido localmente servindo o build com os cabeçalhos do `vercel.json`: a página carrega sem violações no console.

## 7. Testar em modo de teste

1. Projeto de dev com tudo acima e `VITE_PASS_PURCHASE_ENABLED=true` no ambiente Preview.
2. Entre com uma conta de teste, abra o Passe, clique em comprar. Na página do Stripe use o cartão de teste publicado `4242 4242 4242 4242`, qualquer data futura, qualquer CVC.
3. Ao voltar o jogo mostra "Confirmando pagamento…" e depois o sucesso; se o webhook demorar, "Ainda processando. Volte em instantes." com botão "Verificar de novo".
4. Conferir: uma linha em `entitlements` (source `stripe`, status `active`) e o evento em `payment_events` com resultado `granted`. Reenviar o mesmo evento pelo painel do Stripe não cria segunda linha.
5. Reembolsar o pagamento de teste: a linha vira `refunded` e, ao reabrir o jogo (ou voltar à aba depois de 5 min), o Passe some.
6. Conferir que um save editado para `hasBattlePass: true` continua sem Passe.
7. Compra em dobro: com o Passe ativo, abra o link de uma segunda sessão (ou use a CLI do Stripe, `stripe trigger checkout.session.completed`, com os metadados do Passe) e pague de novo: o resultado do evento deve ser `duplicate_refunded` e um reembolso aparece no Stripe.
8. Clique duas vezes rápido em comprar, ou em duas abas: as duas devem abrir **a mesma** página do Stripe (ou a segunda ver "tente de novo em segundos").
9. Disputa: dispare `charge.dispute.created` (cartão de teste `4000000000000259`): a linha vira `revoked` e o jogador sai das listas pagas; depois `charge.dispute.closed` com `won`: volta a `active`.
10. Todo evento de teste grava `livemode = false`: confira que o medidor `pass_meter()` **não** sobe com compras de teste.

## 8. Concessão manual, reembolso e revogação (SQL Editor)

Conceder (presente, tester, suporte):

```sql
insert into public.entitlements (user_id, kind, source, provider_ref)
values ('<uuid-do-usuario>', 'adventurer_pass', 'grant', 'grant-2026-10-14-<nota>');
```

Revogar ou registrar reembolso manual: `update public.entitlements set status = 'revoked' where provider_ref = '<ref>';` (use `'refunded'` para reembolso). O histórico fica; uma nova compra continua possível. Reembolsos feitos no painel do Stripe chegam sozinhos pelo evento `charge.refunded`; disputas pelos eventos `charge.dispute.created` (revoga) e `charge.dispute.closed` (devolve se ganha). Um Passe `refunded` ou `revoked` sai das listas públicas pagas e da auditoria do prêmio na hora (`SEASON_RANKING.md`).

## 9. Antes de passar para o modo live

- Refazer tudo no projeto de PRODUÇÃO: migration, funções, segredos com as chaves LIVE e o preço LIVE de 10.00 USD, novo endpoint de webhook live com seu próprio `whsec_`.
- `APP_ORIGIN` só com o domínio real. Conferir Site URL do Supabase e a CSP no site publicado.
- Textos legais da seção 3 de `docs/WEB_LAUNCH.md` (reembolso, termos, privacidade) publicados e linkados antes de cobrar de verdade.
- Uma compra real pequena sua, seguida de reembolso, para ver o ciclo completo em live.
- Só então ligar `VITE_PASS_PURCHASE_ENABLED=true` em Production.

## 10. O que NÃO foi testado de verdade

As funções (Deno) foram cobertas por testes unitários em Node com fakes (inclusive o reembolso automático, a sessão reaproveitada, as disputas e o `livemode`, com um Stripe falso); o runtime Deno, o Stripe real e o Supabase real nunca foram executados. Os passos da seção 7 são o primeiro teste de ponta a ponta.
