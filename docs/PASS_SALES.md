# Como o Passe do Aventureiro é vendido (web)

> Hoje o Passe é pago só em USDC na rede Solana (função `pass-crypto`). O Stripe saiu em 28/10/2026; a decisão e o caminho de volta (o roteiro antigo deste arquivo) estão em [`PAGAMENTOS_DESCARTADOS.md`](PAGAMENTOS_DESCARTADOS.md). A carteira, o nó RPC e o mercado estão em [`MARKET_SOLANA.md`](MARKET_SOLANA.md).
> **Estado de implantação:** ver `RESUMO_DO_PROJETO.md`, seção 7, que é o único lugar que afirma o que está no ar.

## 0. Como funciona hoje

- O Passe custa 10 USDC, pagamento único (segredo `PASS_PRICE_USDC`, padrão 10.00). O jogo pergunta o preço a `pass-crypto` (ação `price`, só leitura) e o mostra no botão "Pagar com USDC (Solana)".
- O fluxo: o jogador com carteira vinculada chama `start` (recebe uma referência só dele), `prepare` (monta a transferência de USDC com o memo `pa1:pass:<ref>`) e `submit` (manda a assinatura). O servidor confere a transferência na rede (compromisso `confirmed`) e grava a linha em `public.entitlements` com `source = 'crypto_sol'`, `provider_ref` = a assinatura e `livemode` = mainnet.
- Quem decide se a conta tem o Passe é `public.entitlements` (migration `0003_entitlements.sql`): o jogador só lê a própria linha; só as funções (com a chave service role) ou você, no SQL Editor, escrevem nela. O campo `hasBattlePass` do save é ignorado e sobrescrito com a resposta do servidor: editar o save não dá nada.
- Um Passe ativo por jogador. Cada Passe vale para a pré-temporada e a Temporada 1 (`valid_through_season`, migration `0025`). Só linhas `livemode = true` contam para a meta de Passes (1.000 pagos, migration `0030`), para o medidor público e para o ranking.
- Pagamento que chega ao endereço do jogo sem correspondência (memo de outro jogador, menos que o preço, antes da intenção) não se perde: vai para `payment_exceptions` (migration `0022`) e o painel mostra.
- `pass_sales_paused` (o vigia, `AI_OPS.md`) faz `pass-crypto` responder 503 e desabilita o botão de compra.
- Build offline/desktop (sem as variáveis do Supabase): vale o `hasBattlePass` do save, como antes.
- Saves online antigos com `hasBattlePass: true` não ganham o Passe automaticamente. Se alguém realmente o tinha, conceda à mão (seção 3).

## 1. O que o dono precisa configurar

Uma carteira que só você controla e a conta de token USDC dela, criada uma vez (`PASS_RECEIVE_ADDRESS`, ou `MARKET_FEE_ADDRESS` se faltar); `SOLANA_RPC_URL`; `PASS_PRICE_USDC`; `APP_ORIGIN` só com o endereço fixo do jogo (`WEB_LAUNCH.md` 5.6); `VITE_MARKET_ENABLED=true` no build do jogo; as migrations `0003`, `0007`, `0013`, `0022` e `0025` aplicadas. Os passos e os comandos estão em `MARKET_SOLANA.md` (seções 2 e 3). Nunca ponha chave de carteira ou service role em variável `VITE_*`.

## 2. Testar

Primeiro com um nó de devnet e um USDC de teste; depois uma compra real pequena sua. Confira que o Passe aparece no jogo depois do login e que a linha em `entitlements` tem `livemode` coerente com a rede.

## 3. Conceder, revogar e reembolsar (SQL Editor)

Conceder (presente, tester, suporte):

```sql
insert into public.entitlements (user_id, kind, source, provider_ref)
values ('<uuid-do-usuario>', 'adventurer_pass', 'grant', 'grant-2026-10-14-<nota>');
```

Revogar ou registrar reembolso manual: `update public.entitlements set status = 'revoked' where provider_ref = '<ref>';` (use `'refunded'` para reembolso; a devolução do dinheiro é você quem faz, na carteira). O histórico fica; uma nova compra continua possível. Um Passe `refunded` ou `revoked` sai das listas públicas pagas e da auditoria do prêmio na hora (`SEASON_RANKING.md`).

## 4. Antes de produção

Refazer migrations, funções e segredos no projeto de produção; `APP_ORIGIN` só com o domínio real; os textos legais (`WEB_LAUNCH.md`, seção 3) publicados antes de cobrar; uma compra real pequena sua, seguida de devolução manual, para ver o ciclo completo.
