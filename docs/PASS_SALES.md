# Como ligar a venda do Passe do Aventureiro (web)

AVISO: **nada disto foi aplicado em produção por este trabalho.** Nenhuma migration foi aplicada, nenhuma função foi implantada, nenhum projeto Supabase, Stripe ou Vercel foi tocado, nenhuma chave foi lida ou escrita. O código está no repositório e a venda continua DESLIGADA até você seguir os passos abaixo. Os valores de segredos ficam só nos painéis; aqui há apenas nomes.

## 0. Como funciona (resumo)

- O Passe custa USD 10, pagamento único. **O valor existe só no Stripe** (no preço referenciado por `STRIPE_PRICE_ADVENTURER_PASS`). O jogo não tem o valor escrito em lugar nenhum: o botão mostra "O valor aparece na página de pagamento" e a página do Stripe mostra o preço. Escolha deliberada: é a opção mais simples e honesta, sem risco de o jogo mostrar um número diferente do cobrado.
- Quem decide se a conta tem o Passe é a tabela `public.entitlements` (migration `0003_entitlements.sql`). O jogador só consegue LER a própria linha; só o webhook do Stripe (função com a chave service role) ou você, no SQL Editor, escreve nela.
- **Web com Supabase configurado:** o jogo pergunta ao servidor depois do login e ao voltar do pagamento. O campo `hasBattlePass` do save é ignorado nas decisões e sobrescrito com a resposta do servidor. Editar o save para `hasBattlePass: true` não dá nada. Se o servidor não responder, vale por até 3 dias a última resposta guardada no navegador (conveniência para quem fica offline, NÃO é segurança; o ranking futuro nunca lê esse cache). Sem resposta e sem cache: sem Passe (falha fechada).
- **Build offline/desktop (sem variáveis do Supabase):** comportamento exatamente como antes: vale o `hasBattlePass` do save; em build DEV o botão de teste ativa o Passe; em produção o botão mostra "Disponível em breve na Steam".
- **Saves online antigos com `hasBattlePass: true` NÃO ganham o Passe automaticamente.** Se alguém realmente o tinha, conceda à mão (seção 8).
- **Para o futuro ranking de temporada:** no servidor, use a função SQL `arena_private.owns_adventurer_pass(uuid)` (só o service role e RPCs `security definer` chamam). No cliente, a única leitura permitida é `fetchServerPassOwned()` em `src/game/passServer.ts` (para exibir, nunca para decidir prêmio). O ranking nunca deve ler `save.hasBattlePass`.

## 1. Stripe (modo de teste primeiro)

1. No painel do Stripe, ligue o **modo de teste**.
2. Catálogo de produtos: criar o produto **"Passe do Aventureiro"** com um preço **único (one-time) de 10.00 USD**. Copie o **id do preço** (começa com `price_`); ele vira o segredo `STRIPE_PRICE_ADVENTURER_PASS`.
3. Developers, API keys: a chave secreta de teste vira o segredo `STRIPE_SECRET_KEY`.

## 2. Banco: migration

Aplique `supabase/migrations/0003_entitlements.sql` você mesmo, primeiro no projeto de DESENVOLVIMENTO (SQL Editor, ou `supabase db push` apontando para o projeto de dev). O arquivo traz no fim um plano de testes SQL (cliente não escreve, usuário só lê as próprias linhas, idempotência) e as instruções de rollback. Rode o plano antes de seguir.

## 3. Segredos das funções (Supabase, Edge Functions, Secrets)

Nomes: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ADVENTURER_PASS`, `STRIPE_WEBHOOK_SECRET` (criado no passo 5), `APP_ORIGIN` (a origem exata do jogo, ex.: `https://jogar.<domínio>`; pode listar mais de uma separadas por vírgula, ex.: a de preview). `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são fornecidas pela plataforma.

## 4. Implantar as duas funções (você, com a CLI, no projeto de dev primeiro)

- `create-checkout`: implantar normalmente (exige o JWT do jogador).
- `stripe-webhook`: implantar com `--no-verify-jwt` (o Stripe não envia JWT do Supabase; a assinatura do Stripe é a autenticação).

## 5. Webhook no Stripe

Developers, Webhooks, Add endpoint, URL `https://<ref-do-projeto>.supabase.co/functions/v1/stripe-webhook`. Eventos a selecionar (só estes):

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `charge.dispute.created`

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

## 8. Concessão manual, reembolso e revogação (SQL Editor)

Conceder (presente, tester, suporte):

```sql
insert into public.entitlements (user_id, kind, source, provider_ref)
values ('<uuid-do-usuario>', 'adventurer_pass', 'grant', 'grant-2026-10-14-<nota>');
```

Revogar ou registrar reembolso manual: `update public.entitlements set status = 'revoked' where provider_ref = '<ref>';` (use `'refunded'` para reembolso). O histórico fica; uma nova compra continua possível. Reembolsos feitos no painel do Stripe chegam sozinhos pelo evento `charge.refunded`.

## 9. Antes de passar para o modo live

- Refazer tudo no projeto de PRODUÇÃO: migration, funções, segredos com as chaves LIVE e o preço LIVE de 10.00 USD, novo endpoint de webhook live com seu próprio `whsec_`.
- `APP_ORIGIN` só com o domínio real. Conferir Site URL do Supabase e a CSP no site publicado.
- Textos legais da seção 3 de `docs/WEB_LAUNCH.md` (reembolso, termos, privacidade) publicados e linkados antes de cobrar de verdade.
- Uma compra real pequena sua, seguida de reembolso, para ver o ciclo completo em live.
- Só então ligar `VITE_PASS_PURCHASE_ENABLED=true` em Production.

## 10. O que NÃO foi testado de verdade

As funções (Deno) foram cobertas por testes unitários em Node com fakes; o runtime Deno, o Stripe real e o Supabase real nunca foram executados. Os passos da seção 7 são o primeiro teste de ponta a ponta.
