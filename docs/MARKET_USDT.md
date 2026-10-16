# Mercado de jogadores em USDT (BNB Smart Chain) e Passe em USDT

AVISO: **nada disto foi aplicado, implantado ou executado contra um serviço real por este trabalho.** Nenhuma migration foi aplicada, nenhuma função foi implantada, nenhuma carteira foi criada, nenhum nó (RPC) da blockchain foi chamado, nenhum projeto Supabase, Stripe ou Vercel foi tocado. O código está no repositório e **o mercado continua DESLIGADO** (`VITE_MARKET_ENABLED` ausente) até você seguir os passos abaixo. Os valores de segredos ficam só nos painéis; aqui há apenas **nomes**.

Decisões suas que este código implementa: mercado de jogadores com dinheiro real, pago em **USDT na BNB Smart Chain (BEP-20)**; o jogo fica com **5% de cada venda**; Bolsas de Ouro também são vendidas por USDT; o **Passe do Aventureiro (USD 10)** também pode ser pago em USDT, além do Stripe; **o jogo nunca guarda o dinheiro nem chave de ninguém** (não custodial); o mercado é **só da versão web** e **não existe** no desktop/Steam.

Código: migrations `supabase/migrations/0011_market.sql` e `0012_pass_crypto.sql`; funções `market-wallet`, `market-list`, `market-buy`, `market-my`, `pass-crypto` (`supabase/functions/`, lógica em `_shared/market/**` e `_shared/chain/**`); no jogo `src/game/market/**`, `src/components/MarketModal.tsx`, `src/components/market/**`, `src/components/PassUsdt.tsx`, `src/locales/market.ts`, `src/market.css`.

## 1. Como funciona

**Fundação (rodada anterior, `MARKET_FOUNDATION.md`):** só chega ao mercado uma peça que o SERVIDOR certificou (forja Épica/Lendária sem Selo, único de Caça ou de chefe, Bolsa de Ouro). Um certificado vinculado (peça já equipada) nunca é vendável.

**Carteira.** O jogador liga um endereço BSC à conta assinando, na **própria** carteira (MetaMask, Trust Wallet), uma mensagem que o servidor escreveu (nonce de uso único, 10 minutos). O servidor recupera o endereço da assinatura (EIP-191, `personal_sign`) e compara. Não custa nada, não move dinheiro, **não pede chave privada nem frase de recuperação, e a tela avisa disso**. Um endereço por conta (e um endereço só pode estar em uma conta); trocar exige nova assinatura e não é possível com anúncio ativo ou reserva em andamento. Quem vende precisa de carteira ligada (o pagamento cai nela).

**Anunciar.** O jogador escolhe uma peça certificada (sem gemas) ou uma Bolsa certificada e um preço em USDT (mínimo 0,50, máximo 5.000,00, 2 casas). O servidor confere o certificado (do jogador, em estado `held`, não vinculado, ainda no save), a carteira, que a conta não tem marcas da auditoria, os limites (20 anúncios ativos, 20 por dia) e só então o certificado vira `listed`. **O item sai do save do vendedor** e passa a viver no servidor. Não existe editar o preço: cancele e anuncie de novo. Cancelar devolve o item (o jogo o reconstrói do certificado). Cancelar **não é permitido** enquanto o anúncio está reservado. Um anúncio vence em 30 dias e o item volta ao dono.

**Comprar.**
1. O comprador **reserva** o anúncio (trava de 30 minutos; uma reserva por comprador e uma por anúncio; no máximo 10 reservas por hora, contando as abandonadas).
2. A tela mostra **duas transferências** a fazer na carteira dele, em USDT: `preço x 95%` para o endereço do vendedor e `preço x 5%` para o endereço de taxas do jogo (`MARKET_FEE_ADDRESS`). A taxa é arredondada **para cima** ao centavo e o vendedor recebe o resto, então as duas partes somam exatamente o preço (ex.: 10,00 = 0,50 + 9,50; 0,50 = 0,03 + 0,47). A tela mostra a taxa do jogo claramente ("Taxa do jogo 5%"). A **taxa vai primeiro**: se algo der errado no meio, quem devolve é você (dono), não um desconhecido.
3. O jogador paga pela própria carteira (o jogo pede o envio com valor e endereços do SERVIDOR; o jogador aprova na tela da carteira) ou cola o hash de uma transferência que fez.
4. O servidor **verifica cada transferência na cadeia** (seção 6) e registra. Com as duas, **vende**: o certificado do vendedor vira `transferred`, um **certificado novo** é emitido ao comprador (mesmo conteúdo e hash, `origin_certificate_id` aponta o antigo), a venda entra no livro `market_sales` e o anúncio fica `sold`.
5. O jogo do comprador **constrói o item a partir do certificado novo** (nunca do save do vendedor), nível de refino 0 e sem gemas. A entrega só é **confirmada ao servidor depois que o servidor confirmou um save que já tem o item**: uma queda entre "adicionou" e "salvou" nunca perde o item (o certificado continua "fora do save" e o jogo adiciona de novo). Inventário cheio: o item espera.

**Casos tratados**
| Caso | O que acontece |
| --- | --- |
| Pagamento depois do fim da reserva, até **2 h** depois | Vale, **se** o anúncio ainda está livre para aquele comprador (ninguém reservou nem comprou). Senão a reserva vira `refund_due` e o pagamento entra na fila de devolução manual. |
| Pagamento depois das 2 h | `refund_due` (a transferência é válida na cadeia, mas não entrega). |
| Pagamento a menos (um centavo que seja) | Recusado e **não consumido**; o valor exato aparece na tela. Valores de duas transferências **não se somam**. |
| Pagamento a mais | Aceito (o excedente é presente; não há troco automático). |
| Endereço errado, pagador errado, outra moeda, antes da reserva | Recusado, não consumido. |
| Mesmo hash duas vezes (mesma reserva) | Idempotente: uma só venda. Em outra reserva ou conta: `tx_reused`. Um hash é usado **uma vez na vida** (chave primária de `chain_payments`). |
| Duas transferências para a mesma perna | A segunda fica como `extra`, `refund_due`. |
| As duas pernas pagas numa só transação (um contrato de envio em lote) | **Não é suportado:** um hash vale uma vez, então a segunda perna não é registrada e a reserva acaba em `refund_due`. O jogo pede duas transferências separadas. |
| Dois compradores no mesmo anúncio | Um só segura (índice único parcial); o outro recebe "reservado". |
| Vendedor cancela durante a reserva | Recusado. |
| Reserva com dinheiro já enviado que não completa | Fica travada até o fim da tolerância, depois `refund_due` e o anúncio reabre. |

**Passe em USDT.** Conta logada com carteira ligada paga `PASS_PRICE_USDT` (padrão 10.00) ao `PASS_RECEIVE_ADDRESS` (ou, se não existir, ao `MARKET_FEE_ADDRESS`) **a partir da carteira ligada** e envia o hash. O servidor verifica e concede o direito (`source = 'crypto_bsc'`, `provider_ref` = hash, `livemode` = rede principal). Vale tudo que o Passe já tinha: **um Passe ativo por conta** (um segundo pagamento vira devolução manual), e **só `livemode` conta para a meta e o ranking** (a migration 0012 inclui `crypto_bsc` na conta da meta e no gatilho da temporada paga). Um pagamento só vale se foi minerado **depois** de o jogador clicar em "Ver como pagar" (intenção de compra, 24 h): uma transferência antiga não pode ser reaproveitada.

**Interface.** Tela "Mercado" (só web, atrás de `VITE_MARKET_ENABLED`, no menu da loja/economia): Comprar (filtros por tipo, peça, tier, raridade; ordenação), Vender (e "Meus anúncios"), Histórico (recibos com taxa e hashes; pagamentos a devolver) e Carteira. Tudo em USDT, pt e en com paridade, funciona em 390 px. No modal do Passe aparece o segundo botão **"Pagar com USDT (BNB Smart Chain)"** logo abaixo da opção do cartão.

## 2. O que VOCÊ precisa criar (nada disto foi feito)

1. **Uma carteira que só você controla**, para receber as taxas e os Passes. Só o **endereço público** (começa com `0x`) vai para o servidor. **A frase de recuperação (seed) e a chave privada nunca são compartilhadas com ninguém, nem com o jogo, nem com quem te ajudar a configurar, nem digitadas em nenhum site.** Prefira carteira de hardware ou uma carteira dedicada só para isto. Se quiser separar contabilidade, use um endereço para taxas do mercado (`MARKET_FEE_ADDRESS`) e outro para o Passe (`PASS_RECEIVE_ADDRESS`).
2. **Um provedor de nó RPC da BNB Smart Chain** (escolha sua: Ankr, QuickNode, NodeReal, Alchemy, etc.; um nó próprio também serve). A URL (muitas têm sua chave de API) vira o segredo `BSC_RPC_URL`. Plano gratuito basta para começar: cada verificação usa 4 chamadas leves.
3. **Segredos das funções** (Supabase, Edge Functions, Secrets), **por nome**:

| Nome | O que é | Padrão se ausente |
| --- | --- | --- |
| `BSC_RPC_URL` | URL https do nó (pode conter chave) | **obrigatório** (sem ele as funções respondem 503) |
| `MARKET_FEE_ADDRESS` | seu endereço que recebe os 5% | **obrigatório** |
| `BSC_CHAIN_ID` | `56` rede principal, `97` testnet | `56` |
| `BSC_USDT_CONTRACT` | endereço do token USDT | rede principal: o oficial (seção 5); testnet: **obrigatório** |
| `BSC_MIN_CONFIRMATIONS` | confirmações exigidas | `15` (aprox. 45 s) |
| `PASS_PRICE_USDT` | preço do Passe, ex. `10.00` | `10.00` |
| `PASS_RECEIVE_ADDRESS` | onde cai o pagamento do Passe | usa `MARKET_FEE_ADDRESS` |
| `APP_ORIGIN` | origem do jogo (já existe) | |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` a plataforma já fornece. Um preço do Passe malformado desliga a compra em vez de dar o Passe de graça.
4. **Banco.** Aplique `0011_market.sql` e depois `0012_pass_crypto.sql` (depois da 0010), primeiro no projeto de **desenvolvimento**, e rode o PLANO DE TESTE SQL que está no fim de cada arquivo. **Aplique a 0011 ANTES de reimplantar `mint-item`** (o mint passou a ler `origin_certificate_id`). Reversão: bloco `ROLLBACK` no topo de cada arquivo (exporte `market_sales` e `chain_payments` antes, se já houve dinheiro real).
5. **Funções** (CLI, projeto de dev primeiro), todas **com a verificação de JWT ligada** (o padrão): `market-wallet`, `market-list`, `market-buy`, `market-my`, `pass-crypto`. Reimplante também `mint-item` e `bind-item` (agora compartilham código). `market-wallet` tem um `deno.json` na própria pasta com o mapa de importação das duas bibliotecas de assinatura; o `supabase functions deploy market-wallet` o usa.
6. **Variável de build na Vercel**: `VITE_MARKET_ENABLED=true` (só no ambiente de preview no começo). É variável de build: depois de mudar, faça novo deploy. Sem ela (ou sem Supabase configurado) a tela, o botão do Passe em USDT e tudo o mais **não existem**. Nunca ponha chave em variável `VITE_*`.

Dependências novas (explicadas): `@noble/curves` 1.9.7 e `@noble/hashes` 1.8.0, fixadas, **só no servidor** (verificar a assinatura da carteira exige recuperar a chave pública de uma assinatura secp256k1 e calcular keccak256, e fazer isso à mão seria perigoso). São bibliotecas pequenas, auditadas e usadas pela maior parte do ecossistema Ethereum, sem dependências próprias além de uma da outra. Nenhum SDK web3 entra no jogo: a carteira assina, o servidor confere; o jogo usa cinco métodos JSON-RPC da carteira do jogador (`eth_requestAccounts`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`, `personal_sign`, `eth_sendTransaction`).

## 3. Testar na BSC testnet com USDT de teste (obrigatório antes de qualquer dinheiro real)

A testnet (cadeia 97) **não tem USDT oficial**. Use um token BEP-20 de teste com **18 decimais** (por exemplo, publique um token de teste simples na testnet com uma ferramenta de contratos conhecida, ou use um token de teste público de faucet que tenha 18 decimais) e dê saldo às suas carteiras de teste. BNB de teste (para o gás) vem de um faucet da testnet.
1. Projeto Supabase de **desenvolvimento**, migrations 0011 e 0012, funções implantadas.
2. Segredos: `BSC_RPC_URL` (nó da testnet), `BSC_CHAIN_ID=97`, `BSC_USDT_CONTRACT=<token de teste>`, `BSC_MIN_CONFIRMATIONS=3` (para ser rápido), `MARKET_FEE_ADDRESS=<uma carteira de teste sua>`.
3. Na Vercel (preview): `VITE_MARKET_ENABLED=true`.
4. Duas contas do jogo (vendedor e comprador) e duas carteiras de teste (MetaMask com a rede "BNB Smart Chain Testnet"; o jogo pede para trocar). Ligue cada carteira (aba Carteira): a tela diz "REDE DE TESTE".
5. Vendedor: forje até ter uma peça Épica certificada (ou crie uma Bolsa), anuncie por 1,00. Comprador: reserve, pague a taxa (0,05) e o vendedor (0,95) pelos botões "Pagar na carteira"; espere as confirmações; o item chega ao inventário. Confira no SQL: `select * from arena_private.market_sales_ledger;` (tem `livemode = false`).
6. Quebre de propósito, para ver as recusas: pagar 0,94 ao vendedor; pagar de outra carteira; colar o mesmo hash em duas reservas; deixar a reserva vencer e pagar depois; pagar depois de outro comprador reservar (deve virar `refund_due`: veja a fila na seção 8); cancelar anúncio reservado.
7. Passe: "Pagar com USDT" com uma terceira conta; confira `entitlements` (`crypto_bsc`, `livemode = false`: dá as vantagens no jogo, mas **não** sobe o medidor nem rankeia).
8. Reenvie a compra com o nó fora do ar (troque o segredo por uma URL inválida): a tela deve dizer "tente de novo" e **nada** é consumido.

## 4. Números e regras (fonte única: `supabase/functions/_shared/market/rules.ts` e `chain/money.ts`; a migration só tem o preço mínimo/máximo como `check`)

Taxa 5% (arredondada para cima); preço 0,50 a 5.000,00 USDT; anúncio vence em 30 dias; 20 anúncios ativos e 20 por dia por vendedor; reserva 30 min; tolerância para pagamento tardio 120 min; 10 reservas por hora por comprador; nonce de carteira 10 min, 10 por hora; 240 verificações por hora por conta (capacidade 60; cada uma custa 4 chamadas ao seu provedor; a tela pergunta umas 10 vezes por minuto enquanto espera as confirmações); confirmações 15. Mudar uma regra é mudar `rules.ts` e reimplantar (um teste estático confere que o TypeScript passa à SQL exatamente os argumentos que ela declara).

## 5. Checklist para ir ao ar

- [ ] **Conferir o endereço do USDT no bscscan.** O código usa o token "BSC-USD" (USDT da BNB Smart Chain, 18 decimais) `0x55d398326f99059fF775485246999027B3197955` (constante única em `supabase/functions/_shared/chain/config.ts`, com um aviso). Abra `https://bscscan.com/token/0x55d398326f99059fF775485246999027B3197955`, confirme o nome "Tether USD"/símbolo USDT, as 18 casas e o contrato verificado. Se alguma coisa não bater, **não vá ao ar**: defina `BSC_USDT_CONTRACT` com o endereço certo.
- [ ] `BSC_CHAIN_ID` ausente ou `56`; `BSC_MIN_CONFIRMATIONS` 15 (ou mais, nunca menos que 12).
- [ ] `MARKET_FEE_ADDRESS` (e `PASS_RECEIVE_ADDRESS`) são carteiras **suas**, conferidas caractere por caractere no painel e no bscscan; faça uma transferência pequena de teste para elas e confirme que você as controla.
- [ ] Uma compra real pequena sua, de ponta a ponta (anunciar, reservar, pagar, receber), e o Passe em USDT com o preço real.
- [ ] Textos legais e de reembolso publicados (seção 9) e linkados antes de cobrar de verdade; `APP_ORIGIN` só com o domínio real.
- [ ] A Liga já aberta (a primeira Liga zera os heróis; o que foi emitido antes do reset é revogado e anúncios abertos dessa época são cancelados).
- [ ] `npm run check:desktop` verde na versão que for para a Steam (a versão desktop não tem nada disto).
- [ ] Só então `VITE_MARKET_ENABLED=true` em Production.

## 6. O que o servidor confere em cada pagamento (`_shared/chain/bsc.ts`)

O nó está na rede esperada (`eth_chainId`); o recibo existe e `status = 0x1`; pelo menos N confirmações; um log `Transfer(from, to, value)` **emitido pelo contrato do USDT** (outro token, evento de NFT ou contrato imitador não vale); `to` exato (seller, taxa ou Passe), `from` = o endereço **ligado** do comprador, `value` >= o esperado (18 casas); o bloco foi minerado **depois** da reserva (ou da intenção do Passe). As quantias e endereços vêm da **reserva guardada no servidor**, nunca do pedido. O banco confere de novo (defesa), consome o hash numa transação e só então vende. Nó fora do ar = "tente de novo", nada é consumido.

## 7. Exportar o livro de taxas para o contador

No SQL Editor do Supabase (ele tem "Download CSV"):

```sql
-- todas as vendas reais (rede principal), uma linha cada, com a taxa do jogo (sua receita) em USDT
select sold_at, sale_id, item_kind, item_template, price_usdt, fee_usdt, seller_usdt, fee_address, fee_tx_hash, seller_tx_hash
from arena_private.market_sales_ledger
where livemode
order by sold_at;

-- por mês
select date_trunc('month', sold_at) as mes, count(*) as vendas, sum(price_usdt) as volume_usdt, sum(fee_usdt) as taxas_usdt
from arena_private.market_sales_ledger where livemode group by 1 order by 1;

-- os Passes pagos em USDT (receita separada)
select p.created_at, p.user_id, p.tx_hash, (p.amount_units / 1e18) as usdt, p.to_address
from public.chain_payments p where p.purpose = 'pass' and p.livemode and p.status = 'applied' order by p.created_at;
```

Cada linha traz os hashes: o contador confere cada recebimento no bscscan. `livemode = false` são vendas de teste e **não** são dinheiro.

## 8. Disputas e devolução manual

A fila do que precisa ser devolvido (valor válido na cadeia, mas sem entrega):

```sql
select p.created_at, p.tx_hash, p.leg, p.user_id as pagador, p.from_address, p.to_address, (p.amount_units / 1e18) as usdt, p.reservation_id, p.note
from public.chain_payments p where p.status = 'refund_due' order by p.created_at;
```

O jogador também vê os hashes na aba Histórico. Procedimento:
1. Confira a transação no bscscan (valor, quem pagou, para quem).
2. **Perna da taxa** (`to_address` = o seu): **você devolve** da sua carteira para `from_address`.
3. **Perna do vendedor** (`to_address` = o vendedor): o dinheiro já está na carteira dele; **peça que ele devolva** a `from_address` (o jogo é não custodial e não consegue desfazer uma transferência). Se ele se recusar, você pode devolver e tratar com ele depois, e suspender a conta dele.
4. Depois de devolver: `update public.chain_payments set status = 'refunded', note = 'devolvido em <data>, tx <hash da devolução>' where tx_hash = '<hash>';` e, se todos os pagamentos da reserva foram devolvidos, `update public.market_reservations set status = 'refunded' where id = '<reserva>';`.
5. Casos: **pagou a menos** (a transferência não foi consumida e a compra não andou: o jogador refaz o pagamento certo; o valor curto que ele já enviou ficou na carteira de quem recebeu e só volta se você ou o vendedor devolverem, a pedido dele); **enviou para o endereço errado** (fora do seu controle: transferências na cadeia não são reversíveis); **Passe pago duas vezes** (`pass_duplicate_payment` em `market_events`): devolva o segundo hash.
6. Auditoria de tudo: `select * from public.market_events order by id desc;` (só cresce) e os eventos de certificado em `item_certificate_events`.
7. Fraude: revogue o certificado (`update public.item_certificates set status = 'revoked' where id = '<id>';`) ou cancele o anúncio; contas marcadas em `arena_private.item_account_flags` **não conseguem anunciar** (consulte antes de liberar).

## 9. Nota legal (responsabilidade sua, não é aconselhamento jurídico)

Vender itens do jogo por criptomoeda real é uma decisão de negócio com consequências fora do código. Consulte um advogado e um contador **antes** de ligar. Pontos a levantar com eles (nenhum deles foi analisado por este trabalho):
- **Regulação brasileira de criptoativos:** o marco legal dos ativos virtuais (Lei 14.478/2022 e a regulamentação do Banco Central e da CVM) e se a operação do mercado pode ser enquadrada como serviço de ativo virtual; obrigações de declaração de operações com criptoativos à Receita Federal (a norma em vigor, como a IN RFB 1.888/2019, e suas atualizações); prevenção à lavagem de dinheiro e se KYC é exigido do seu lado.
- **Tributos:** a taxa de 5% e os Passes pagos em USDT são **receita sua** (inclusive em USDT, convertida para reais na data); o vendedor tem ganho/renda próprios (ganho de capital, renda, limites de isenção). O jogo mostra "Taxa do jogo 5%" e o livro de vendas existe para isto.
- **Termos de uso e política de reembolso** próprios para vendas entre jogadores em cripto (irreversibilidade, devolução manual, taxas de rede/gás por conta do jogador, volatilidade, risco de golpes de terceiros), idade mínima e responsabilidade por impostos de quem vende.
- **Valve / Steam:** as regras de publicação da Steam proíbem jogos que permitem negociar criptomoedas ou NFTs. **Por isso o mercado não existe no build desktop/Steam**: a variável é forçada para "false" no build desktop (`vite.config.ts`), o código é um pedaço carregado sob demanda que o bundle desktop não contém, e `npm run check:desktop` (e um teste) falha se qualquer marcador dele aparecer. Mantenha esse teste verde em toda versão da Steam. Releia as regras vigentes antes de cada envio.
- Lojas de aplicativos (se o jogo web for empacotado), provedores de pagamento e hospedagem também têm regras sobre cripto.

## 10. O que NÃO foi verificado

As funções (Deno), as duas migrations (SQL), o nó RPC, uma carteira real e o Supabase real **nunca foram executados**. O que existe: testes unitários em Node com um nó RPC falso (respostas gravadas à mão), uma carteira falsa (provedor EIP-1193) e um armazenamento em memória que segue a máquina de estados da SQL passo a passo, mais testes estáticos que leem as migrations (RLS, grants, índices únicos, ordem das travas, argumentos). A semântica real das travas do Postgres (corridas de verdade) só fica provada rodando o PLANO DE TESTE SQL. O primeiro teste de ponta a ponta é a seção 3.

## 11. Riscos residuais

- **Hash-first, dinheiro irreversível.** Um pagamento válido que não entrega (prazo, outro comprador) só volta por devolução manual. A taxa-primeiro reduz o dano; não elimina o trabalho.
- **O provedor de RPC é uma dependência de confiança** (um nó mentiroso poderia atestar um pagamento falso). Use um provedor sério, 15 confirmações ou mais, e confira a fila de vendas no bscscan nas primeiras semanas.
- **Contrato do USDT.** Um endereço errado na constante aceitaria um token sem valor: por isso a conferência no bscscan é item obrigatório do checklist.
- **O save do jogador continua do cliente.** O que vale dinheiro é o certificado, que o servidor emitiu, limitou e auditou (`MARKET_FOUNDATION.md`, "O que um trapaceiro ainda consegue"). Um bot que joga no ritmo máximo e honesto gera peças reais mais rápido que uma pessoa; a auditoria é a defesa. Antes de pagar vendedores em escala, defina limites de venda por conta e revise as marcas.
- **Griefing de reserva.** Um comprador pode segurar um anúncio por 30 minutos; limites de 1 reserva por vez e 10 por hora reduzem, não eliminam.
- **Endereço de taxas errado = taxas perdidas.** Confira-o antes de ligar.
- **O servidor não vê o save.** Quem chama a API diretamente só consegue anunciar certificados que o servidor realmente emitiu e limitou (ritmo máximo por conta, `MARKET_FOUNDATION.md`); o que fica de fora é o custo local de forja (materiais, Ouro), que o servidor não enxerga.
- **Troca de rede da carteira** é pedida pelo jogo, mas o jogador pode recusar: a verificação do servidor só aceita a rede configurada.
