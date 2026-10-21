# Mercado de jogadores em SOL (Solana) e Passe em USDC

AVISO: **nada disto foi aplicado, implantado ou executado contra um serviço real por este trabalho.** Nenhuma migration foi aplicada, nenhuma função foi implantada, nenhuma carteira foi criada, nenhum nó RPC da Solana foi chamado, nenhum projeto Supabase, Stripe ou Vercel foi tocado, nenhuma carteira (Phantom, Solflare) foi aberta. O código está no repositório e **o mercado continua DESLIGADO** (`VITE_MARKET_ENABLED` ausente) até você seguir os passos abaixo. Os valores de segredos ficam só nos painéis; aqui há apenas **nomes**.

Decisões suas que este código implementa: mercado de jogadores com dinheiro real **só na rede Solana**; **itens e Bolsas de Ouro são anunciados e pagos em SOL** (a moeda nativa); o **Passe do Aventureiro (10 USDC)** também pode ser pago em **USDC na Solana**, além do Stripe; o jogo fica com **5% de cada venda**; **o jogo nunca guarda o dinheiro nem chave de ninguém** (não custodial); o mercado é **só da versão web** e **não existe** no desktop/Steam. O código da BNB Smart Chain / USDT da rodada anterior continua no repositório, **dormente** (não está ligado a nenhuma função, nenhuma tela e nenhum segredo) e nada aqui o oferece.

Código: migrations `supabase/migrations/0011_market.sql`, `0012_pass_crypto.sql` e **`0013_solana.sql`**; funções `market-wallet`, `market-list`, `market-buy`, `market-my`, `pass-crypto` (`supabase/functions/`, lógica em `_shared/market/**` e `_shared/chain/**`, em especial `chain/solana.ts`); no jogo `src/game/market/**`, `src/components/MarketScreen.tsx` (tela "Mercado" na barra lateral), `src/components/market/**`, `src/components/PassUsdc.tsx`, `src/locales/market.ts`, `src/market.css`.

## 1. Como funciona

**Fundação (`MARKET_FOUNDATION.md`):** só chega ao mercado uma peça que o SERVIDOR certificou (forja Épica/Lendária sem Selo, único de Caça ou de chefe, Bolsa de Ouro). Um certificado vinculado (peça já equipada) nunca é vendável.

**Carteira.** O jogador liga um endereço Solana à conta pedindo à **própria** carteira (Phantom, Solflare) que assine, com `signMessage`, um texto que o servidor escreveu (nonce de uso único, 10 minutos, com conta, endereço e rede dentro do texto). Um endereço Solana **é** a chave pública ed25519, então o servidor confere a assinatura direto contra o endereço. Não custa nada, não envia transação, **não pede chave privada nem frase de recuperação, e a tela avisa disso**. Um endereço por conta (e um endereço só pode estar em uma conta); trocar exige nova assinatura e não é possível com anúncio ativo ou reserva em andamento. Quem vende precisa de carteira ligada (o pagamento cai nela). Carteiras antigas (que não falam o Wallet Standard) conseguem **ligar**, mas não **pagar**: a tela pede para atualizar a carteira.

**Anunciar.** O jogador escolhe uma peça certificada (sem gemas) ou uma Bolsa certificada e um preço em **SOL, de 0,001 a 50, em passos de 0,001** (até 3 casas). O servidor confere o certificado (do jogador, em estado `held`, não vinculado, ainda no save), a carteira, que a conta não tem marcas da auditoria, os limites (20 anúncios ativos, 20 por dia) e só então o certificado vira `listed`. **O item sai do save do vendedor** e passa a viver no servidor. Não existe editar o preço: cancele e anuncie de novo. Cancelar devolve o item (o jogo o reconstrói do certificado). Cancelar **não é permitido** enquanto o anúncio está reservado. Um anúncio vence em 30 dias e o item volta ao dono.

**Comprar.**
1. O comprador **reserva** o anúncio (trava de 30 minutos; uma reserva por comprador e uma por anúncio; no máximo 10 reservas por hora, contando as abandonadas).
2. A tela mostra o **total**, a **taxa do jogo (5%)** e a parte do **vendedor**, em SOL. A taxa é arredondada **para cima ao lamport** (1 SOL = 1.000.000.000 lamports) e o vendedor recebe o resto, então as duas partes somam exatamente o preço (ex.: 1 SOL = 0,05 + 0,95; 0,001 SOL = 0,00005 + 0,00095).
3. O jogador clica em **Pagar na carteira**. O jogo pede ao **servidor** um blockhash recente (`prepare`; o navegador nunca fala com o nó, cuja URL pode ter chave de API), monta **UMA transação** com **duas transferências** `SystemProgram.transfer` (a parte do vendedor e a taxa do jogo, valores e endereços da **reserva guardada no servidor**) e pede à carteira que **assine e envie**. O jogador aprova na tela da própria carteira. Como é uma transação só, **ou as duas transferências acontecem ou nenhuma**: não existe pagamento pela metade. (Quem preferir pode colar a assinatura de uma transação que fez por fora.)
4. O jogo envia a **assinatura da transação** ao servidor, que a **verifica na cadeia** (seção 6, `confirmed`) e registra. Pago e verificado, **vende**: o certificado do vendedor vira `transferred`, um **certificado novo** é emitido ao comprador (mesmo conteúdo e hash, `origin_certificate_id` aponta o antigo), a venda entra no livro `market_sales` e o anúncio fica `sold`. A assinatura vai ao servidor no mesmo instante em que a carteira a devolve; enquanto a rede ainda não confirmou (1 a 2 segundos) o jogo pergunta de novo a cada 2 s nos primeiros 30 s, depois a cada 4 s e a cada 8 s (até cerca de 3,5 minutos): a tela diz "Confirmando o pagamento na rede... N s".
5. O jogo do comprador **constrói o item a partir do certificado novo** (nunca do save do vendedor), nível de refino 0 e sem gemas. A entrega só é **confirmada ao servidor depois que o servidor confirmou um save que já tem o item**: uma queda entre "adicionou" e "salvou" nunca perde o item. Inventário cheio: o item espera.

**Casos tratados**
| Caso | O que acontece |
| --- | --- |
| Pagamento depois do fim da reserva, até **2 h** depois | Vale, **se** o anúncio ainda está livre para aquele comprador (ninguém reservou nem comprou). Senão a reserva vira `refund_due` e o pagamento entra na fila de devolução manual. |
| Pagamento depois das 2 h | `refund_due` (a transação é válida na cadeia, mas não entrega). |
| Pagamento a menos (um lamport que seja), para o vendedor ou para a taxa | Recusado e **não consumido**; os valores exatos aparecem na tela. Transferências de **transações diferentes não se somam**. |
| Pagamento a mais | Aceito (o excedente é presente; não há troco automático). |
| Endereço errado, pagador errado, só uma das duas transferências, antes da reserva | Recusado, não consumido. |
| Transação ainda não finalizada | "Ainda não": a tela pergunta de novo; nada é consumido. |
| Mesma assinatura duas vezes (mesma reserva) | Idempotente: uma só venda. Em outra reserva ou conta: `tx_reused`. Uma assinatura é usada **uma vez na vida** (chave primária de `chain_payments`). |
| Uma segunda transação para uma reserva já paga | Fica como `extra`, `refund_due`. |
| Dois compradores no mesmo anúncio | Um só segura (índice único parcial); o outro recebe "reservado". |
| Vendedor cancela durante a reserva | Recusado. |

**Passe em USDC.** A tela do Passe pergunta o preço antes (`pass-crypto` ação `price`: só leitura) e o mostra no botão "Pagar com USDC (Solana)". Conta logada com carteira ligada: o servidor responde com o preço (`PASS_PRICE_USDC`, padrão 10.00), a carteira que recebe (`PASS_RECEIVE_ADDRESS`, ou `MARKET_FEE_ADDRESS` se não existir) e as **duas contas de token de USDC** (a do comprador e a do recebedor, derivadas pelo servidor), e confere que a conta de USDC do jogo existe. O jogo monta **uma transferência SPL `transferChecked`** da conta de USDC do comprador para a do jogo e pede à carteira que assine e envie. O servidor verifica pela variação dos saldos de token (seção 6) e concede o direito (`source = 'crypto_sol'`, `provider_ref` = a assinatura, `livemode` = só na mainnet-beta). Vale tudo que o Passe já tinha: **um Passe ativo por conta** (um segundo pagamento vira devolução manual), e **só `livemode` conta para a meta e o ranking**. Um pagamento só vale se foi finalizado **depois** de o jogador clicar em "Ver como pagar" (intenção de compra, 24 h).

**Preço em dólar (opcional).** Se você definir o segredo `SOL_USD_PRICE_URL` (qualquer endereço https que devolva um JSON com o preço de 1 SOL em dólares: CoinGecko, Coinbase, Jupiter...), o **servidor** lê o preço, guarda por 5 minutos e o devolve junto com os dados do mercado; o jogo mostra "≈ US$ x" ao lado dos preços em SOL. **O jogo nunca chama um terceiro.** Sem o segredo (ou se o endereço falhar por mais de uma hora), a linha em dólar simplesmente não aparece. É só uma conveniência: nenhum pagamento usa esse número.

**Interface.** Tela "Mercado" (só web, atrás de `VITE_MARKET_ENABLED`): Comprar (filtros por tipo, peça, tier, raridade; ordenação; Bolsas de Ouro com borda dourada e um brilho lento, que para para quem pediu menos movimento), Vender (e "Minhas ofertas"), Histórico (recibos com taxa e assinatura; pagamentos a devolver) e Carteira. Tudo em SOL (e USDC no Passe), pt e en com paridade, funciona em 390 px. Na rede de teste a tela diz "Rede de teste (devnet)". Cada tamanho de Bolsa de Ouro tem seu ícone (pequena 10.000, média 50.000, grande 100.000).

## 2. O que VOCÊ precisa criar (nada disto foi feito)

1. **Uma carteira Solana que só você controla**, para receber as taxas (em SOL) e os Passes (em USDC). Só o **endereço público** vai para o servidor. **A frase de recuperação (seed) e a chave privada nunca são compartilhadas com ninguém, nem com o jogo, nem com quem te ajudar a configurar, nem digitadas em nenhum site.** Prefira carteira de hardware ou uma carteira dedicada só para isto. Se quiser separar contabilidade, use um endereço para as taxas do mercado (`MARKET_FEE_ADDRESS`) e outro para o Passe (`PASS_RECEIVE_ADDRESS`).
2. **A conta de token de USDC dessa carteira, criada UMA vez.** Em Solana o USDC mora numa "conta de token" por carteira; sem ela a transferência do Passe falha. O jeito mais simples: **envie uma pequena quantia de USDC (por exemplo 1 USDC) de outra carteira sua para o endereço que vai receber o Passe**; a Phantom/Solflare e a rede criam a conta de token na primeira transferência (quem envia paga a pequena taxa de criação, cerca de 0,002 SOL). Confira no solscan (`https://solscan.io/account/<seu endereço>`, aba Tokens) que o USDC aparece. Se você usar `PASS_RECEIVE_ADDRESS` separado, faça isto para **esse** endereço. Sem isso o botão do Passe responde "o recebimento em USDC do jogo ainda não está pronto" e **ninguém é cobrado**. (As taxas do mercado são em SOL e não precisam de conta de token.)
3. **Um provedor de nó RPC da Solana** (escolha seu: Helius, QuickNode, Alchemy, Triton etc.; um nó próprio também serve). A URL (muitas têm sua chave de API) vira o segredo `SOLANA_RPC_URL`. Plano gratuito basta para começar: cada verificação usa 2 chamadas leves (uma só para `getTransaction` depois da primeira, mais uma de status enquanto a transação não finalizou), `prepare` usa 1, e o início do pagamento do Passe usa 1.
4. **Segredos das funções** (Supabase, Edge Functions, Secrets), **por nome**:

| Nome | O que é | Padrão se ausente |
| --- | --- | --- |
| `SOLANA_RPC_URL` | URL https do nó (pode conter chave) | **obrigatório** (sem ele as funções respondem 503) |
| `MARKET_FEE_ADDRESS` | seu endereço que recebe os 5% (SOL) | **obrigatório** |
| `SOLANA_CLUSTER` | `mainnet-beta` ou `devnet` | `mainnet-beta` |
| `SOLANA_USDC_MINT` | endereço do mint do USDC | mainnet-beta: o oficial (seção 5); devnet: **obrigatório** |
| `PASS_PRICE_USDC` | preço do Passe, ex. `10.00` | `10.00` |
| `PASS_RECEIVE_ADDRESS` | carteira que recebe o USDC do Passe | usa `MARKET_FEE_ADDRESS` |
| `SOL_USD_PRICE_URL` | (opcional) https de um JSON com o preço de 1 SOL em US$ | sem linha em dólar |
| `APP_ORIGIN` | origem do jogo (já existe) | |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` a plataforma já fornece. Um preço do Passe malformado desliga a compra em vez de dar o Passe de graça. Os nomes `BSC_*` e `PASS_PRICE_USDT` da rodada anterior **não existem mais**: apague-os dos painéis se os criou.
5. **Banco.** Aplique `0011_market.sql`, `0012_pass_crypto.sql` e **`0013_solana.sql`** (nesta ordem, depois da 0010), primeiro no projeto de **desenvolvimento**, e rode o PLANO DE TESTE SQL que está no fim de cada arquivo (o da 0013 cobre preços em lamports, uma assinatura por venda, o Passe em USDC e as permissões). A **0013 se recusa a rodar** se alguma tabela do mercado já tiver linhas (as antigas guardam endereços `0x` e preços em centavos): em um projeto de desenvolvimento que testou a versão BNB, esvazie `market_sales`, `chain_payments`, `market_reservations`, `market_listings` e `market_wallets` antes. **Aplique a 0011 ANTES de reimplantar `mint-item`.** Reversão: bloco `ROLLBACK` no topo de cada arquivo (exporte `market_sales` e `chain_payments` antes, se já houve dinheiro real).
6. **Funções** (CLI, projeto de dev primeiro), todas **com a verificação de JWT ligada** (o padrão): `market-wallet`, `market-list`, `market-buy`, `market-my`, `pass-crypto`. Reimplante também `mint-item` e `bind-item`. **Reimplante as cinco logo depois da 0013** (as antigas chamam funções SQL que a 0013 substitui). `market-wallet` tem um `deno.json` na própria pasta (importa `@noble/curves` para conferir a assinatura ed25519) e `pass-crypto` também (`@noble/curves` e `@noble/hashes`, para derivar a conta de token); o `supabase functions deploy` os usa.
7. **Variável de build na Vercel**: `VITE_MARKET_ENABLED=true` (só no ambiente de preview no começo). É variável de build: depois de mudar, faça novo deploy. Sem ela (ou sem Supabase configurado) a tela, o botão do Passe em USDC e tudo o mais **não existem**. Nunca ponha chave em variável `VITE_*`.

Dependências (explicadas): **nenhuma nova no jogo** e **nenhum SDK da Solana em lugar nenhum**. No servidor continuam `@noble/curves` 1.9.7 e `@noble/hashes` 1.8.0, fixadas (usadas só para conferir a assinatura ed25519 da carteira e derivar a conta de token do USDC; são pequenas, auditadas e sem dependências próprias além de uma da outra). No jogo, a transação é montada à mão (alguns bytes: cabeçalho, chaves, blockhash, instruções) em `src/game/market/solTx.ts`: o `@solana/web3.js` pesa cerca de 400 KB minificado e teve uma versão comprometida em dezembro de 2024, e o jogo só precisa de duas formas fixas de transação. A carteira é falada pelo **Wallet Standard** (`standard:connect`, `solana:signMessage`, `solana:signAndSendTransaction`), o protocolo da Phantom e da Solflare.

## 3. Testar na devnet com SOL e USDC de teste (obrigatório antes de qualquer dinheiro real)

1. Projeto Supabase de **desenvolvimento**, migrations 0011, 0012 e 0013, funções implantadas.
2. Carteiras de teste: use duas carteiras na Phantom/Solflare **trocadas para a rede Devnet** (nas configurações da carteira; ative o modo de teste). SOL de teste vem de um faucet da devnet (`https://faucet.solana.com`). USDC de teste da devnet vem do faucet da Circle (`https://faucet.circle.com`, escolha Solana Devnet). **Descubra o endereço do mint do USDC de teste** no próprio faucet/solscan (`?cluster=devnet`) e confirme-o: é o valor de `SOLANA_USDC_MINT` na devnet.
3. Segredos: `SOLANA_RPC_URL` (nó da devnet), `SOLANA_CLUSTER=devnet`, `SOLANA_USDC_MINT=<mint do USDC de teste>`, `MARKET_FEE_ADDRESS=<uma carteira de teste sua>`. Faça a seção 2, item 2, para a carteira de teste que vai receber o Passe (envie USDC de teste a ela).
4. Na Vercel (preview): `VITE_MARKET_ENABLED=true`.
5. Duas contas do jogo (vendedor e comprador) e duas carteiras de teste. Ligue cada carteira (aba Carteira): a tela diz "Rede de teste (devnet)". O comprador precisa de alguns centésimos de SOL (preço + taxa de rede).
6. Vendedor: forje até ter uma peça Épica certificada (ou crie uma Bolsa), anuncie por 0,01 SOL. Comprador: reserve e clique em "Pagar na carteira": a carteira mostra **uma** transação com **duas** transferências (0,0095 e 0,0005 SOL); aprove; espere "finalizar"; o item chega ao inventário. Confira no SQL: `select * from arena_private.market_sales_ledger;` (tem `livemode = false` e a `tx_signature`).
7. Quebre de propósito, para ver as recusas: cole a assinatura de uma transação que pagou só o vendedor; pagar de outra carteira; colar a mesma assinatura em duas reservas; deixar a reserva vencer e pagar depois; pagar depois de outro comprador reservar (deve virar `refund_due`: veja a fila na seção 8); cancelar anúncio reservado.
8. Passe: "Pagar com USDC (Solana)" com uma terceira conta; confira `entitlements` (`crypto_sol`, `livemode = false`: dá as vantagens no jogo, mas **não** sobe o medidor nem rankeia). Teste também sem a conta de USDC do recebedor: a tela deve dizer "ainda não está pronto" e não cobrar.
9. Reenvie a compra com o nó fora do ar (troque o segredo por uma URL inválida): a tela deve dizer "tente de novo" e **nada** é consumido.
10. **Duas contas na Phantom** (trocar de carteira e pagar de outra conta, migration 0022). Crie na Phantom (devnet) a **Conta 1**, a **Conta 2** e a **Conta 3**. **A conta que recebe os pagamentos do jogo (`PASS_RECEIVE_ADDRESS`, ou `MARKET_FEE_ADDRESS`) nunca paga**: não a use como comprador (o jogo recusa com «Esta é a carteira que recebe os pagamentos do jogo; pague com outra conta.»). Dê SOL e USDC de teste à Conta 1 e à Conta 2.
    - **Trocar de carteira:** ligue a Conta 1 (Configurações > Carteira Solana). Na Phantom, selecione a **Conta 2**. A tela deve avisar sozinha: «A carteira ligada (…) é diferente da conta aberta na Phantom (…): ligar esta?». Toque em «Ligar esta conta» (ou em «Trocar de carteira»): a Phantom pede **de novo** a aprovação e uma **nova assinatura**; o endereço mostrado passa a ser o da Conta 2. Tocar em «Trocar de carteira» **sem** mudar de conta na Phantom diz «Esta já era a carteira ligada».
    - **Pagamento bloqueado se a conta aberta não é a ligada:** com a Conta 1 ligada e a Conta 2 aberta na Phantom, o botão «Pagar na carteira» do Passe fica desligado e a tela mostra o aviso e o botão de religar. Nada é enviado.
    - **Pagar de outra conta com a referência:** o jogo monta a transação com a referência (um *Memo* `pa1:pass:…` ou `pa1:sale:<reserva>`; veja-o no solscan, na transação). O servidor reconhece o pagamento por ela, de **qualquer** conta do mesmo jogador (a carteira ligada é só um sinal; o evento `paid_from_other_wallet` em `market_events` registra quando foi outra).
    - **Pagamento que não casa:** pague o Passe da Conta 3 **à mão** (um `spl-token transfer` ou outra carteira, sem Memo) e cole a assinatura: a tela mostra «Recebemos um pagamento que não conseguimos ligar à sua compra… guarde este código: …». A linha aparece no painel de administração, em **Pagamentos a resolver**, e em `select * from public.payment_exceptions`. Pague também **menos** de 10 USDC com o Memo certo: mesma coisa, motivo «Valor menor».

## 4. Números e regras (fonte única: `supabase/functions/_shared/market/rules.ts` e `chain/solMoney.ts`; a migration só tem a faixa absoluta de 0,001 a 1.000 SOL como `check`)

Taxa 5% (arredondada para cima ao lamport); preço de 0,001 a **50 SOL** (o teto é uma regra em `rules.ts`, fácil de mudar; a tabela aceita até 1.000 SOL), em passos de 0,001; anúncio vence em 30 dias; 20 anúncios ativos e 20 por dia por vendedor; reserva 30 min; tolerância para pagamento tardio 120 min; 10 reservas por hora por comprador; nonce de carteira 10 min, 10 por hora; 240 verificações (e pedidos de blockhash) por hora por conta (capacidade 60; a tela pergunta umas 10 vezes por minuto enquanto espera a rede finalizar); preço em dólar guardado 5 min. Mudar uma regra é mudar `rules.ts` e reimplantar (um teste estático confere que o TypeScript passa à SQL exatamente os argumentos que ela declara).

## 5. Checklist para ir ao ar

- [ ] **Conferir o mint do USDC no solscan.** O código usa o USDC da Circle na mainnet-beta, `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 6 casas (constante única `SOLANA_USDC_MINT_MAINNET` em `supabase/functions/_shared/chain/solana.ts`, com um aviso). Abra `https://solscan.io/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, confirme o nome "USD Coin"/símbolo USDC, as 6 casas e o emissor Circle. Se alguma coisa não bater, **não vá ao ar**: defina `SOLANA_USDC_MINT` com o endereço certo.
- [ ] **Conferir os "genesis hashes"** de `chain/solana.ts` (`SOLANA_GENESIS_HASHES`: o servidor se recusa a falar com um nó de outra rede) com a lista oficial de clusters da Solana. Se um deles estiver errado o servidor recusará **todas** as verificações dessa rede (falha segura), e você verá `wrong_network`.
- [ ] `SOLANA_CLUSTER` ausente ou `mainnet-beta`, e `SOLANA_RPC_URL` de **mainnet** (um nó da devnet atrás de `mainnet-beta` é recusado pelo genesis hash, mas confira mesmo assim).
- [ ] `MARKET_FEE_ADDRESS` (e `PASS_RECEIVE_ADDRESS`) são carteiras **suas**, conferidas caractere por caractere no painel e no solscan; faça uma transferência pequena de teste para elas e confirme que você as controla. **A conta de token de USDC existe** (seção 2, item 2).
- [ ] Uma compra real pequena sua, de ponta a ponta (anunciar, reservar, pagar, receber), e o Passe em USDC com o preço real.
- [ ] Textos legais e de reembolso publicados (seção 9) e linkados antes de cobrar de verdade; `APP_ORIGIN` só com o domínio real.
- [ ] A Liga já aberta (a primeira Liga zera os heróis; o que foi emitido antes do reset é revogado e anúncios abertos dessa época são cancelados).
- [ ] `npm run check:desktop` verde na versão que for para a Steam (a versão desktop não tem nada disto).
- [ ] Só então `VITE_MARKET_ENABLED=true` em Production.

## 6. O que o servidor confere em cada pagamento (`_shared/chain/solana.ts`)

O nó está na rede esperada (`getGenesisHash`); a transação existe no nível **`confirmed`** (`SOLANA_VERIFY_COMMITMENT`: mais de 2/3 do stake votou no bloco, 1 a 2 s; `finalized` levaria uns 13 s a mais e o dono quer a compra na tela na hora; a defesa contra repetição é a chave primária da assinatura no banco, não o nível) (`getTransaction` com `jsonParsed` e `maxSupportedTransactionVersion: 0`) e `meta.err` é nulo; o horário do bloco é **posterior** à reserva (ou à intenção do Passe).
- **Venda (SOL):** somando as transferências `SystemProgram.transfer` (as de primeiro nível **e as das instruções internas**) que saíram do endereço **ligado** do comprador: **para o vendedor** pelo menos `preço - taxa` e **para o endereço de taxas do jogo** pelo menos a taxa, em lamports, **na mesma transação**. Outro pagador, outro destinatário, ou valor menor é recusado. Instruções de outro programa que só *parecem* uma transferência não contam.
- **Passe (USDC):** a variação (depois menos antes) dos saldos de token do **mint oficial** cujo dono é a carteira do jogo é pelo menos o preço, e o saldo de USDC do **comprador** caiu pelo menos o preço (outro token, ou casas decimais diferentes, é recusado).
**Referência (Memo):** toda transação que o jogo monta leva, como última instrução, um SPL Memo (programa `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, assinado por quem paga) com `pa1:sale:<id da reserva>` (venda) ou `pa1:pass:<referência do jogador>` (Passe; 32 caracteres hexadecimais aleatórios, guardados em `pass_payment_refs`, só entregues ao dono). Com o Memo certo o pagamento vale **de qualquer carteira do mesmo jogador** (uma só para as duas transferências de uma venda). Sem Memo, vale como antes: só se quem pagou é a carteira **ligada**. Por que isso é seguro: (1) a reserva (e a referência do Passe) está **amarrada ao jogador no servidor**, e o jogador que envia a assinatura tem de ser o dono dela (`store.reservation(userId, id)`); (2) a assinatura da transação é **de uso único** (chave primária de `chain_payments`), então copiar o Memo ou a transação da cadeia não permite repetir nada; (3) o Memo só **seleciona** a compra, não dá permissão para nada: quem copiasse o Memo de outro jogador receberia `not_your_payment` (a transação com a referência de outra conta não é sua para enviar) e não cria linha nenhuma em nome dele; (4) quantias e destinatários continuam sendo os da reserva/preço, conferidos na cadeia. Pagar da própria carteira que recebe (ou, numa venda, como o vendedor) não move dinheiro e é recusado: no cliente, no `prepare` do servidor (`self_payment`) e na verificação.
As quantias e endereços vêm da **reserva guardada no servidor**, nunca do pedido. O banco confere de novo (defesa), consome a assinatura numa transação e só então vende. Nó fora do ar ou transação ainda não finalizada = "tente de novo", nada é consumido.

## 7. Exportar o livro de taxas para o contador

No SQL Editor do Supabase (ele tem "Download CSV"):

```sql
-- todas as vendas reais (mainnet-beta), uma linha cada, com a taxa do jogo (sua receita) em SOL
select sold_at, sale_id, item_kind, item_template, price_sol, fee_sol, seller_sol, fee_address, tx_signature
from arena_private.market_sales_ledger
where livemode
order by sold_at;

-- por mês
select date_trunc('month', sold_at) as mes, count(*) as vendas, sum(price_sol) as volume_sol, sum(fee_sol) as taxas_sol
from arena_private.market_sales_ledger where livemode group by 1 order by 1;

-- os Passes pagos em USDC (receita separada)
select p.created_at, p.user_id, p.tx_hash as assinatura, (p.amount_units / 1e6) as usdc, p.to_address
from public.chain_payments p where p.purpose = 'pass' and p.livemode and p.status = 'applied' order by p.created_at;
```

Cada linha traz a assinatura: o contador confere cada recebimento no solscan. `livemode = false` são vendas de teste (devnet) e **não** são dinheiro. O valor em dólar na data do recebimento você obtém de uma cotação histórica (o jogo guarda só SOL).

## 8. Disputas e devolução manual

A fila do que precisa ser devolvido (valor válido na cadeia, mas sem entrega), já com o que cada parte recebeu:

```sql
select p.created_at, p.tx_hash as assinatura, p.leg, p.user_id as pagador, p.from_address, p.reservation_id, p.note,
       r.price_lamports / 1e9 as total_sol, r.fee_lamports / 1e9 as taxa_sol, r.seller_lamports / 1e9 as vendedor_sol, r.seller_address, r.fee_address
from public.chain_payments p
left join public.market_reservations r on r.id = p.reservation_id
where p.status = 'refund_due' order by p.created_at;
```

O jogador também vê as assinaturas na aba Histórico. Procedimento:
1. Confira a transação no solscan (valores, quem pagou, para quem).
2. **A parte da taxa** (`taxa_sol`, que caiu no seu endereço): **você devolve** da sua carteira para `from_address`.
3. **A parte do vendedor** (`vendedor_sol`, que caiu na carteira dele): o dinheiro já está com ele; **peça que ele devolva** a `from_address` (o jogo é não custodial e não consegue desfazer uma transferência). Se ele se recusar, você pode devolver e tratar com ele depois, e suspender a conta dele. (Em uma transação só os dois valores chegam juntos, então o comprador sempre pagou as duas partes.)
4. Depois de devolver: `update public.chain_payments set status = 'refunded', note = 'devolvido em <data>, tx <assinatura da devolução>' where tx_hash = '<assinatura>';` e, se todos os pagamentos da reserva foram devolvidos, `update public.market_reservations set status = 'refunded' where id = '<reserva>';`.
5. Casos: **pagou a menos** (a transação não foi consumida e a compra não andou: o jogador refaz o pagamento certo; o que ele já enviou ficou na carteira de quem recebeu e só volta se você ou o vendedor devolverem, a pedido dele); **enviou para o endereço errado** (fora do seu controle: transferências na cadeia não são reversíveis); **Passe pago duas vezes** (`pass_duplicate_payment` em `market_events`): devolva a segunda assinatura em USDC (`amount_units / 1e6`) para `from_address`; **Passe pago em USDC sem conta de token do jogo**: a transferência falha na rede e nada é cobrado.
6. Auditoria de tudo: `select * from public.market_events order by id desc;` (só cresce) e os eventos de certificado em `item_certificate_events`.
7. Fraude: revogue o certificado (`update public.item_certificates set status = 'revoked' where id = '<id>';`) ou cancele o anúncio; contas marcadas em `arena_private.item_account_flags` **não conseguem anunciar** (consulte antes de liberar).
8. Reembolso de um Passe pago em USDC: `update public.entitlements set status = 'refunded' where provider_ref = '<assinatura>';` e devolver o valor em USDC pela carteira.

## 8b. Pagamentos que deram errado (migration 0022, painel «Pagamentos a resolver»)

**O que acontece.** Qualquer pagamento **verificado na cadeia** que chegou ao endereço de recebimento do jogo mas **não pôde ser ligado a uma compra** vai para a fila `public.payment_exceptions` (uma linha por assinatura, para sempre; enviar a mesma duas vezes não duplica). Nada se perde em silêncio. Motivos (`reason`):

| motivo | quando |
|---|---|
| `no_memo` | sem a referência do jogo e de uma carteira que não é a ligada |
| `wrong_memo` | levava uma referência que não é a do jogador que enviou |
| `short_amount` | chegou menos do que o preço (pagamento parcial) |
| `too_early` | feito antes da intenção do Passe / da reserva |
| `wrong_sender` | (venda) as transferências saíram de carteiras diferentes ou de um endereço que recebe |
| `already_owned` | (Passe) o jogador já tinha o Passe: devolver |
| `duplicate` | (venda) segundo pagamento de uma reserva já paga, ou item que já foi vendido: devolver |

Não entram na fila (não há o que resolver): transação que **não chegou** ao endereço do jogo (`wrong_recipient`), que falhou, que ainda não finalizou (o jogo continua perguntando) e o **auto-pagamento** (a carteira que recebe pagando a si mesma: o saldo líquido é zero; o jogo recusa antes, com «Esta é a carteira que recebe os pagamentos do jogo; pague com outra conta.»).

**O que o jogador vê.** Ao enviar a assinatura: «Recebemos um pagamento que não conseguimos ligar à sua compra. Ele foi registrado e será resolvido; guarde este código: <assinatura>». O código é a assinatura da transação. Na tela do Passe, a lista «Pagamentos aguardando resolução» o mostra de novo depois de recarregar (`pass-crypto` ação `exceptions`).

**O que você vê.** No painel de administração, menu **Pagamentos a resolver**: quando, jogador, o quê (Passe ou mercado), quanto chegou (USDC ou SOL), o motivo, **com que carteira pagou comparada com a carteira ligada do jogador**, a transação no solscan e o estado. A página só **lê**; resolver é SQL, que você roda no editor SQL do Supabase como dono (a página copia o comando com a assinatura já preenchida).

**Como resolver** (sempre confira a transação no solscan e, se a carteira que pagou não é a ligada do jogador, peça uma prova antes: ele assina uma mensagem com a carteira que pagou):

1. **O pagamento é dele e o valor está certo → conceder o Passe.** Cria o Passe com origem `grant` e a assinatura como referência (o mesmo pagamento nunca concede duas vezes) e fecha a linha. Recusa linha fechada, que não seja do Passe, ou jogador que já tem o Passe.
   ```sql
   select arena_private.payment_exception_grant_pass('<assinatura>');
   ```
2. **Valor errado, Passe repetido ou compra que não aconteceu → devolver** pela sua carteira (para `payer_address`) e marcar a linha com a assinatura da transação de devolução:
   ```sql
   select arena_private.payment_exception_mark_refunded('<assinatura>', '<assinatura da transação de devolução>');
   ```
3. Pagamento **parcial** de um Passe: o Passe exige o valor inteiro em UMA transação, então a saída limpa é **devolver** (passo 2) e o jogador pagar de novo. Se você preferir aceitar o que chegou (por exemplo, um desconto combinado com o jogador), use o passo 1: a concessão não confere o valor.
4. Consultas úteis:
   ```sql
   select created_at, purpose, reason, status, user_id, payer_address, amount_units, signature from public.payment_exceptions where status = 'open' order by created_at;
   select * from public.market_events where kind in ('payment_exception_granted', 'payment_exception_refunded', 'paid_from_other_wallet') order by id desc;
   ```
   `amount_units` é em unidades do USDC (÷ 1e6) para o Passe e em lamports (÷ 1e9) para uma venda. `claimed_by` lista outros jogadores que enviaram a mesma assinatura (a primeira linha é do primeiro que enviou; o dono da carteira que pagou é quem tem direito).
5. Quando o jogador reenvia, de forma correta, uma assinatura que estava na fila (por exemplo, depois de ligar a carteira certa), a linha se fecha sozinha como «Casou depois».

**Deploy desta mudança:** aplique `0022_payment_fixes.sql` (projeto de dev primeiro) e **reimplante `pass-crypto` e `market-buy`** (as duas mudaram de comportamento); `market-wallet`, `market-list` e `market-my` compartilham o código, reimplante-as também por segurança. Reimplante e **só então** publique o jogo novo: o jogo antigo continua funcionando com o servidor novo (sem Memo, vale a regra da carteira ligada), mas o jogo novo espera o campo `memo` do servidor novo.

## 9. Nota legal (responsabilidade sua, não é aconselhamento jurídico)

Vender itens do jogo por criptomoeda real é uma decisão de negócio com consequências fora do código. Consulte um advogado e um contador **antes** de ligar. Pontos a levantar com eles (nenhum deles foi analisado por este trabalho):
- **Regulação brasileira de criptoativos:** o marco legal dos ativos virtuais (Lei 14.478/2022 e a regulamentação do Banco Central e da CVM) e se a operação do mercado pode ser enquadrada como serviço de ativo virtual; obrigações de declaração de operações com criptoativos à Receita Federal (a norma em vigor, como a IN RFB 1.888/2019, e suas atualizações); prevenção à lavagem de dinheiro e se KYC é exigido do seu lado. O SOL é um criptoativo e o USDC é uma stablecoin: cada um pode ter tratamento próprio.
- **Tributos:** a taxa de 5% (em SOL) e os Passes pagos em USDC são **receita sua** (convertida para reais na data); o vendedor tem ganho/renda próprios (ganho de capital, renda, limites de isenção) e a variação do SOL entre o anúncio e o recebimento é risco dele. O jogo mostra "Taxa do jogo 5%" e o livro de vendas existe para isto.
- **Termos de uso e política de reembolso** próprios para vendas entre jogadores em cripto (irreversibilidade, devolução manual, taxas de rede por conta do jogador, volatilidade do SOL, risco de golpes de terceiros), idade mínima e responsabilidade por impostos de quem vende.
- **Valve / Steam:** as regras de publicação da Steam proíbem jogos que permitem negociar criptomoedas ou NFTs. **Por isso o mercado não existe no build desktop/Steam**: a variável é forçada para "false" no build desktop (`vite.config.ts`), o código é um pedaço carregado sob demanda que o bundle desktop não contém, e `npm run check:desktop` (e um teste) falha se qualquer marcador dele aparecer. Mantenha esse teste verde em toda versão da Steam. Releia as regras vigentes antes de cada envio.
- Lojas de aplicativos (se o jogo web for empacotado), provedores de pagamento e hospedagem também têm regras sobre cripto.

## 10. O que NÃO foi verificado

As funções (Deno), as três migrations (SQL), o nó RPC, uma carteira real (Phantom, Solflare), a Solana real e o Supabase real **nunca foram executados**. O que existe: testes unitários em Node com respostas de RPC gravadas à mão no formato do `getTransaction`, carteiras falsas (objetos do Wallet Standard e uma chave ed25519 em memória), um armazenamento em memória que segue a máquina de estados da SQL passo a passo, mais testes estáticos que leem as migrations (RLS, grants, índices únicos, ordem das travas, argumentos). Prints do navegador foram tirados com a tela real, uma API falsa e uma carteira Wallet Standard falsa. A semântica real das travas do Postgres só fica provada rodando o PLANO DE TESTE SQL. Em especial, **nunca provados contra o mundo real**: (a) a transação montada à mão ser aceita por uma carteira e por um nó (o formato bate byte a byte com a especificação e com um leitor independente nos testes, mas nenhuma foi enviada a um cluster); (b) a derivação da conta de token (ATA): o algoritmo é o padrão (PDA de `[dono, programa de tokens, mint]`), mas não foi comparada com um vetor oficial: **na devnet, confira que o endereço `receiverTokenAccount` que o servidor devolve é o mesmo que o solscan mostra para a conta de USDC da sua carteira**; (c) a forma exata de `getTransaction` em todos os provedores; (d) os "genesis hashes" e o mint do USDC foram escritos a partir da documentação pública e **precisam da sua conferência** (seção 5); (e) uma carteira de hardware (Ledger) assinando por dentro da Phantom pode produzir uma assinatura de mensagem diferente do texto cru e ser recusada ao ligar; (f) um blockhash do servidor vale cerca de 1 minuto: se o jogador demorar muito na tela da carteira, a transação expira (nada é cobrado) e basta clicar de novo. O primeiro teste de ponta a ponta é a seção 3.

## 11. Riscos residuais

- **Dinheiro irreversível.** Um pagamento válido que não entrega (prazo, outro comprador) só volta por devolução manual. Uma transação só reduz o dano (nunca há metade paga), mas não elimina o trabalho.
- **O provedor de RPC é uma dependência de confiança** (um nó mentiroso poderia atestar um pagamento falso). Use um provedor sério, a verificação exige `confirmed`, e confira a fila de vendas no solscan nas primeiras semanas.
- **Mint do USDC.** Um endereço errado na constante aceitaria um token sem valor: por isso a conferência no solscan é item obrigatório do checklist.
- **O save do jogador continua do cliente.** O que vale dinheiro é o certificado, que o servidor emitiu, limitou e auditou (`MARKET_FOUNDATION.md`, "O que um trapaceiro ainda consegue"). Um bot que joga no ritmo máximo e honesto gera peças reais mais rápido que uma pessoa; a auditoria é a defesa. Antes de pagar vendedores em escala, defina limites de venda por conta e revise as marcas.
- **Griefing de reserva.** Um comprador pode segurar um anúncio por 30 minutos; limites de 1 reserva por vez e 10 por hora reduzem, não eliminam.
- **Endereço de taxas errado = taxas perdidas.** Confira-o antes de ligar.
- **O servidor não vê o save.** Quem chama a API diretamente só consegue anunciar certificados que o servidor realmente emitiu e limitou; o que fica de fora é o custo local de forja (materiais, Ouro), que o servidor não enxerga.
- **Volatilidade do SOL.** O preço é em SOL: a taxa e o que o vendedor recebe valem mais ou menos dólares conforme o mercado. A linha "≈ US$" é só informativa e pode estar até 5 minutos atrasada.
- **Carteira ligada a um endereço que o jogador perde** (perdeu a carteira): a conta fica com ela ligada até ele assinar com outra (a troca exige assinar com a nova carteira, não com a antiga) e sem anúncio ou reserva ativos.

## 12. Lotes de materiais negociáveis (rodada 23)

Além de itens e Bolsas de Ouro, o mercado vende **lotes de material negociável** (`docs/MARKET_FOUNDATION.md`, "Materiais negociáveis"). O SQL é a parte B de `supabase/migrations/0015_tradeable_materials.sql` (**não aplicada**, depois da 0013 e da 0014).

| Regra | Valor |
| --- | --- |
| O que é uma oferta | **uma quantidade de UM material** (de 1 a 10 000 unidades, `MARKET_RULES.maxMaterialQtyPerListing`) |
| Compra **parcial** | **não existe**: o lote é comprado **inteiro** (escolha minha, a mais simples e segura: a mesma reserva, a mesma transação de pagamento e a mesma venda de um item; quem quer vender em partes faz vários lotes) |
| Preço | **por unidade, em SOL, até 6 casas** (micro-SOL: 0,000001 SOL = 1 000 lamports); o **lote inteiro** vale no mínimo **0,001 SOL** e no máximo 50 SOL (`isMaterialTotalLamports`); total = unidade x quantidade x 1 000 lamports, sempre inteiro |
| Taxa | 5% sobre o total do lote, arredondada para cima ao lamport (a mesma `splitLamports`); as duas partes somam o total exato |
| Limites | os 20 anúncios ativos e 20 por dia do vendedor são **compartilhados** com itens |
| Quem pode anunciar | só as unidades **que estão no save** (`qty - pending`): unidades recém-compradas, ainda chegando, não podem ser anunciadas; conta com marca de auditoria não anuncia |
| Anunciar | o servidor **tira as unidades do saldo do vendedor e as guarda no anúncio** (escrow); só depois o jogo as tira da mochila. O pedido leva um `requestId` guardado no navegador (`mintIntents`): repetir o mesmo lote devolve o mesmo anúncio, nunca anuncia duas vezes |
| Comprar | reservar o anúncio (30 min), pagar UMA transação com as duas transferências, o servidor verifica na cadeia e **entrega o lote inteiro ao saldo do comprador como entrega pendente**; o jogo adiciona ao save e confirma (`ack`) só depois de o servidor confirmar um save que já tem as unidades |
| Cancelar / vencer (30 dias) | as unidades voltam ao vendedor como entrega pendente; cancelar um anúncio reservado é recusado |
| Reinicialização da Liga | os lotes **abertos** dos heróis substituídos são cancelados e o escrow é descartado; lotes reservados são deixados |
| Aparece na lista pública | `market_listings_public` (a visão que `anon` lê) mostra `kind = 'material'`, o material, a quantidade e o preço da unidade; **nunca** o vendedor nem o endereço |

**Telas:** a categoria **Materiais** em Comprar (cartões do novo sistema de design, ordenados pelo preço **por unidade**), o formulário do lote em Vender (quantidade com passos e "Máx", preço por unidade com 6 casas, total do lote, taxa e o que o vendedor recebe), Minhas ofertas e Histórico mostram quantidade e preço por unidade, e o detalhe da pilha negociável no inventário tem **"Vender no Mercado"**. Tudo em `pt` e `en` com paridade (`locales/market.ts`).

**Passos do dono:** os de `docs/MARKET_FOUNDATION.md` (aplicar a 0015, publicar `material-claim` e `material-sync`, **reimplantar `market-list`, `market-buy` e `market-my`**). Nada muda nos segredos nem em `VITE_MARKET_ENABLED`. O mercado continua só na versão web: o código novo do mercado está no mesmo pedaço carregado sob demanda e `npm run check:desktop` tem dois marcadores novos (`list_material`, `mk-lot-more`).

**Não verificado:** a SQL (parte B) nunca foi executada, a carteira real nunca foi usada, a Solana real nunca foi chamada. Os testes (`materialMarket.test.ts`, `marketLots.test.ts`, `migration0015.test.ts`) seguem a máquina de estados da SQL em memória e incluem um teste de propriedade com centenas de passos aleatórios (anunciar, cancelar, vencer, comprar, confirmar) que exige que as unidades sejam sempre exatamente as que o servidor emitiu.
