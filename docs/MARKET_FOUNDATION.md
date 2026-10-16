# Fundação do mercado de jogadores: certificados de item

Esta rodada não abre o mercado. Ela garante uma coisa: **uma peça negociável só chega ao mercado se o SERVIDOR emitiu um certificado para ela.** O save continua sendo do cliente (jogo normal, offline e desktop não mudam), mas o que vale dinheiro (SOL, na rodada seguinte) passa a ser o certificado, que o jogador não consegue escrever.

Código: `supabase/migrations/0010_item_certificates.sql` (não aplicada), `supabase/functions/_shared/items/**`, funções `mint-item` e `bind-item`, e no jogo `src/game/itemActions.ts`, `itemServer.ts`, `itemCerts.ts`, `itemAuthority.ts`, `bossClaims.ts`.

## O que é certificado

| Coisa | Certificada quando | Origem do certificado |
| --- | --- | --- |
| Peça forjada Épica ou Lendária | sempre, no momento da forja, se não for feita com o Selo do Ferreiro | `forge` |
| Item único (queda de Caça) | sempre | `hunt_drop` |
| Item único (queda de chefe da Masmorra) | sempre | `boss_drop` |
| Bolsa de Ouro | sempre, com o valor de face | `pouch` |
| Peça Comum ou Rara | nunca (não é negociável), mas a rolagem também vem do servidor | - |
| Peça forjada com o Selo do Ferreiro | nunca (nasce vinculada) | - |
| Relíquias, materiais, consumíveis | nunca | - |

Cada certificado guarda: dono, tipo (`gear`, `unique`, `gold_pouch`), modelo, raridade, tier, substatus rolados, nível de refino (sempre 0 na emissão), valor em Ouro (Bolsa), origem, estado (`held`, `listed`, `transferred`, `burned`, `revoked`), hora do servidor e um hash do conteúdo. O jogador só consegue **ler** os próprios certificados. Ninguém no cliente escreve neles (RLS e `revoke`, e uma trigger impede mudar o conteúdo depois). Todo evento (emitir, vincular, listar, transferir, queimar, revogar) fica numa tabela de auditoria que só cresce.

## Como funciona

1. **O servidor sorteia.** `mint-item` (JWT obrigatório; o id do usuário vem só do JWT) recebe o que o cliente pede: a receita que está forjando, a zona e a duração da caça, os andares de chefe de uma expedição, ou o id de uma Bolsa. Rola a raridade (63/25/10/2), os substatus e as quedas com as mesmas tabelas do jogo (copiadas por `npm run item:tables`; um teste compara os dois lados rolando o mesmo fluxo de números) e devolve a peça pronta. O cliente aplica exatamente isso ao save e **não rola nada** (a rolagem local é ignorada). Os números vêm de `crypto.getRandomValues`, nunca de `Math.random`.
2. **Mesma requisição, mesma resposta.** Cada ação leva um `requestId`; repetir o pedido devolve a resposta guardada. Uma resposta perdida não vira uma segunda rolagem.
3. **Limites de plausibilidade** (tabela abaixo). Passou do limite: o servidor **recusa sem rolar**, devolve um código e marca a conta para a auditoria do dono. Os limites são baldes de fichas atômicos (uma instrução SQL com trava por usuário, igual ao `progress_claim_slot`), contados com o relógio do servidor desde `max(criação da conta, reset da Liga)`.
4. **Vincular.** Equipar uma peça certificada chama `bind-item` antes: o certificado fica vinculado para sempre, e um certificado vinculado nunca pode ser listado (trigger e `check` no banco).
5. **Queimar.** Salvar (desmontar), descartar, usar como ingrediente de receita e abrir uma Bolsa certificada queimam o certificado antes. Ingredientes da forja são queimados na mesma operação atômica que emite a peça nova.
6. **Reset da Liga.** Quando a primeira Liga reseta todos os heróis, os certificados emitidos antes do reset são revogados (os heróis a que eles pertenciam não existem mais).

### Refinar, reforjar, lapidar: a regra escolhida

Duas opções existiam: (a) mandar o refino/lapidação para o servidor, que rolaria e atualizaria o certificado; (b) **anular o certificado**. Escolhi (b).

- Refinar, reforjar e lapidar gastam recursos que o servidor não enxerga (Ouro, materiais, Runas estão no save). Rolar o sucesso no servidor não prova que o custo foi pago, só adiciona uma segunda superfície de ataque (taxas de sucesso, queda de nível, Catalisador, custo crescente) sem proteger nada que o balde de ritmo já não proteja.
- O certificado descreve a peça **como foi rolada** (refino 0). Se a peça muda, o certificado deixa de descrevê-la. Anulá-lo é a regra mínima e segura: a peça continua no save, usável e mais forte, mas nunca mais é negociável.
- Peça vinculada (equipada alguma vez) não precisa anular nada: ela já não pode ser vendida. Peça sem certificado não chama o servidor.
- O jogo **pergunta antes** (o aviso diz que o certificado será cancelado). Se o servidor está fora do ar, a mudança é bloqueada. Uma mudança que o jogo recusaria (sem Ouro, por exemplo) não anula nada.
- Engastar e retirar gemas não mexe no certificado (é determinístico e reversível); o mercado da próxima rodada deve exigir a peça sem gemas.

## Limites de plausibilidade (fonte única: `supabase/functions/_shared/items/bounds.ts`)

Tudo é por conta, desde `max(conta criada, reset da Liga)`. Um balde que nunca foi usado começa com o que a conta poderia ter ganho até agora, no máximo a capacidade. A margem (`MARGIN`) é 2x.

| Limite | Valor | Fonte |
| --- | --- | --- |
| Forja por tier: peças por hora | `2 / horas de Caça por peça` = 4,00 / 2,13 / 0,83 / 0,46 / 0,22 / 0,19 (tier 1 a 6) | `npm run sim:cost` (`scripts/sim/farmHours.ts`): 0,34 / 0,94 / 2,42 / 4,38 / 9,12 / 10,54 h de Caça por peça, corrente inteira; piso de 0,5 h |
| Forja por tier: capacidade do balde | 7 dias de oferta = 672 / 359 / 139 / 77 / 37 / 32 | 7 dias de materiais guardados |
| Épicas/Lendárias certificadas por dia, por tier | 12 / 7 / 4 / 4 / 4 / 4 | forjas possíveis por dia x 2 x 12% (P de Épica ou melhor), piso 4. Conferido de forma atômica na emissão; acima disso a peça é descartada sem ser mostrada |
| Selo do Ferreiro | só com o Passe; 6 por temporada de 60 dias (capacidade 6) | a trilha do Passe dá 3 por temporada; 2x |
| Tempo de Caça pago por reivindicação | 1 h por hora do relógio, até 10 h (balde parcial) | `battlePass.capHours` = 10, o maior armazenamento da recompensa |
| Sorteios de único por hora de Caça | 224 / 165 / 140 / 140 (Clareira / Pântano / Fenda / Abismo) x chance da zona x Sorte Grande (no máximo 1,5) | comentário de `huntingZones.ts` (Rodada 9): as chances foram calibradas para esses sorteios econômicos por hora; o teto físico é 385 |
| Mortes de chefe pagas | 200 por dia (capacidade 200), até 60 andares por pedido | `BOUNDS.bossesPerDay` (20 expedições x 10 chefes); Sorte Grande no máximo 1,25 |
| Únicos certificados por dia (Caça + chefes) | 12 | quem faz 80 chefes por dia com Sorte Grande espera 3,0; 4x |
| Bolsas por dia | 6 (capacidade 6; o jogo limita a 3 por dia local) | `goldPouch.perDay` x 2 |
| Ouro que vira Bolsa | 10 000 por dia, capacidade 100 000 (a maior Bolsa) | `BALANCE_BASELINE.md` (dono do Passe: ~2 470 Ouro/dia nos dias 46-60) + `ECONOMY_AUDIT.md` (20 expedições x 197 = 3 940) = 6 410/dia, com ~1,5x de margem |
| Idade mínima da conta para uma peça, zona ou chefe | `dias do herói mais rápido simulado no nível/andar / 3` | `progress/bounds.ts` (`levelPace`, `floorPace`, `PACE_REJECT_FACTOR`) |

Conferido: o servidor só aceita chefe nos andares 25/50/75/100 e a cada 10 profundidades depois do 100; zona e receita desconhecidas dão `400`; o corpo é limitado a 16 KB.

Códigos de recusa: `forge_rate`, `seal_limit`, `seal_pass_required`, `cert_day_limit`, `too_early`, `hunt_time`, `boss_rate`, `pouch_count_limit`, `pouch_gold_limit`, `burn_not_held`, `bad_request`, `unknown_template`. Marcas na auditoria (`arena_private.item_account_flags`): `LIMIT_FORGE_RATE`, `LIMIT_SEAL`, `LIMIT_CERT_DAY`, `LIMIT_UNIQUE_DAY`, `LIMIT_HUNT_TIME`, `HUNT_TIME_EXCESS`, `LIMIT_BOSS_RATE`, `BOSS_KILLS_EXCESS`, `LIMIT_POUCH_COUNT`, `LIMIT_POUCH_GOLD`, `FORGE_TOO_EARLY`, `HUNT_ZONE_TOO_EARLY`, `BOSS_TOO_EARLY`, `SEAL_WITHOUT_PASS`, `BURN_NOT_HELD`. `arena_private.has_item_flags(user)` diz se a conta tem alguma.

## Cliente: online e offline

- **Online (build web, com Supabase):** forja, quedas de único da Caça (ao coletar a recompensa), quedas de chefe (ao fechar a expedição; o pedido fica no save e é reenviado com o mesmo `requestId` até o servidor responder), criação e abertura de Bolsa, equipar, refinar, reforjar, lapidar, desmontar e descartar peça certificada passam pelo servidor. Se o servidor não responde, a ação é **bloqueada** com uma mensagem clara e nada é gasto; não existe fallback local que crie item negociável. Uma recusa por limite na Caça não segura o Ouro e os materiais: a recompensa é coletada sem únicos.
- **Offline/desktop (sem chaves do Supabase):** tudo continua local, como sempre. As peças Épicas, Lendárias e únicas feitas assim recebem `certified: false`; Bolsas feitas assim ficam sem certificado. **Nada disso é negociável.**
- **"Certificado" na tela** só aparece para uma peça com id de certificado que está na lista do próprio servidor (o jogo lê `item_certificates` da conta) **e** cujo conteúdo bate (modelo, raridade, substatus, refino 0, nunca reforjada nem lapidada). Id que o servidor não confirma aparece como "não confirmado"; Épica/Lendária/única sem id aparece como "Sem certificado: não pode ser vendido".
- `isTradeable` (`gearInstances.ts`) agora exige o id do certificado além da regra de tipo (`isTradeableKind`, a regra antiga). A Bolsa só é negociável com o certificado dela.

### Saves antigos

Tudo o que já existe (Épicas, Lendárias, únicos, Bolsas) continua utilizável e **continua sem certificado, portanto não negociável**. Nada é certificado retroativamente (o servidor não tem como saber se aquilo foi rolado de forma honesta). A tela diz isso nas peças afetadas. Quem quiser vender precisa forjar, caçar ou dropar de novo.

## O que um trapaceiro ainda consegue

- **Inflar o save localmente** (Ouro, materiais, nível): o jogo normal continua confiando no cliente. Isso só vale para uso no jogo; o que vira dinheiro precisa de certificado.
- **Gastar o ritmo máximo da conta:** dentro dos limites ele consegue peças certificadas reais mais depressa do que um humano que também joga. Os limites ficam em 2x o que a oferta de materiais permite; quem passa disso recebe recusa e uma marca na auditoria. Um bot que joga o ritmo máximo e honestamente ainda é um bot: a auditoria do dono é a defesa.
- **Reaproveitar um item vendido:** o certificado vale uma vez, mas a cópia local continua no save do vendedor. A rodada do mercado deve exigir que a entrega ao comprador saia do certificado (não do save do vendedor) e que o vendedor perca o item ao listar.
- **Declarar Sorte Grande sem ter a habilidade:** o servidor aceita até 1,5x (Caça) e 1,25x (chefe). Ganho máximo de 50% / 25% sobre a chance de única, ainda sob os limites diários.
- **Pedir chefes/caça que não fez:** o servidor não vê o combate. Ele só limita quantas mortes e quantas horas pagar por tempo de servidor. Isso é plausibilidade, não prova.
- ~~Perder a resposta de uma forja ou de uma Bolsa deixava um certificado órfão.~~ **Corrigido na rodada do mercado:** o jogo guarda o `requestId` da ação não terminada (`src/game/mintIntents.ts`, no navegador, por um dia) e a próxima tentativa idêntica usa o mesmo id, então o servidor devolve o resultado guardado em vez de rolar de novo. Sobra apenas o caso de o jogador nunca repetir a ação (o certificado fica no servidor sem a peça, inofensivo).
- ~~Descartar Bolsa certificada pelo menu de empilháveis não queimava o certificado.~~ **Corrigido:** `discardPouchAction` queima no servidor os certificados das Bolsas jogadas fora (as sem certificado primeiro, depois as certificadas pelo fim da lista, como ao abrir) antes de a quantidade cair; sem servidor a ação é bloqueada.

## Passos do dono (nada foi aplicado nem publicado por esta rodada)

1. Aplicar `supabase/migrations/0010_item_certificates.sql` (depois da 0009), primeiro no projeto de desenvolvimento, e rodar o PLANO DE TESTE SQL (A a K) que está no fim do arquivo. Reversão: bloco `ROLLBACK` no topo do arquivo.
2. Publicar as funções novas: `mint-item` e `bind-item` (com a verificação de JWT ligada, que é o padrão), com o segredo `APP_ORIGIN` já existente.
3. Conferir que `npm run item:tables` não muda `supabase/functions/_shared/items/tables.ts` (o teste `itemTables.test.ts` falha se o arquivo ficar velho).
4. Ver a auditoria: `select * from arena_private.item_account_flags order by created_at desc;` e `select * from public.item_certificates where user_id = '<id>';`.
5. Nada disso depende de `VITE_SEASON_RANKING_ENABLED`: o mint funciona sem o ranking.

## O mercado em SOL na Solana (rodada seguinte, já escrita)

**Está descrito em [`MARKET_SOLANA.md`](MARKET_SOLANA.md)** (migrations `0011`, `0012` e `0013`, funções `market-*` e `pass-crypto`, tela Mercado, passos do dono). Os itens e as Bolsas são vendidos em SOL e o Passe em USDC, na rede Solana (decisão do dono; a primeira versão, em USDT na BNB Smart Chain, ficou dormente no código). O que mudou em relação ao plano abaixo: uma venda **não troca o dono** do certificado (a guarda continua tratando `user_id` como imutável): ela termina o certificado antigo (`transferred`) e **emite um novo** ao comprador com o mesmo conteúdo, apontando o antigo em `origin_certificate_id`. O limite diário de emissão (`item_commit`) conta só o que o servidor emitiu (`origin_certificate_id is null`). Um certificado ganhou `in_save` (o item está no save do dono?): listar tira o item do save, comprar/cancelar/expirar devolve ao dono "fora do save" até o jogo construí-lo do certificado e confirmar.

### O plano original desta rodada (mantido como registro)


- `public.item_certificates` com `status = 'held'`, `bound = false` e `arena_private.has_item_flags(user) = false` como as condições de listagem (listar = `held -> listed`; a trigger já recusa um certificado vinculado).
- Os eventos `list` e `transfer` já existem no `check` da auditoria; a guarda já impede ressuscitar um certificado `transferred`, `burned` ou `revoked`. A transferência precisa trocar o dono numa função própria (a guarda atual trata `user_id` como imutável: a rodada nova deve recriá-la).
- A entrega ao comprador sai do conteúdo do certificado (modelo, raridade, substatus, valor da Bolsa), não do save do vendedor, com refino 0 e sem gemas.
- `isTradeable` e `certState` do jogo são o lado local; o mercado confere o certificado no servidor.
- Falta do lado de segurança: ainda é preciso um limite de venda por conta, KYC/saque e a revisão da auditoria antes de pagar qualquer pessoa.
