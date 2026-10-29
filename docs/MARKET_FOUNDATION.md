# Fundação do mercado de jogadores: certificados de item

Este documento descreve a base do mercado, que garante uma coisa: **uma peça negociável só chega ao mercado se o SERVIDOR emitiu um certificado para ela.** O save continua sendo enviado pelo cliente (e conferido pelo servidor em `submit-progress`; nos builds sem backend a autoridade de itens é `local`, `itemAuthority.ts`), mas o que vale dinheiro (SOL, na rodada seguinte) passa a ser o certificado, que o jogador não consegue escrever.

Código: `supabase/migrations/0010_item_certificates.sql`, `supabase/functions/_shared/items/**`, funções `mint-item` e `bind-item`, e no jogo `src/game/itemActions.ts`, `itemServer.ts`, `itemCerts.ts`, `itemAuthority.ts`, `bossClaims.ts`.

## O que é certificado

| Coisa | Certificada quando | Origem do certificado |
| --- | --- | --- |
| Peça forjada Épica ou Lendária | sempre, no momento da forja, se não for feita com o Selo do Ferreiro | `forge` |
| Item único (queda de Caça) | sempre | `hunt_drop` |
| Item único (queda de chefe da Masmorra) | sempre | `boss_drop` |
| Bolsa de Ouro | sempre, com o valor de face | `pouch` |
| Peça Comum ou Rara | nunca (não é negociável), mas a rolagem também vem do servidor | - |
| Peça forjada com o Selo do Ferreiro | nunca (nasce vinculada) | - |
| Relíquias e consumíveis | nunca | - |
| Materiais | o material **normal** nunca; a variante **negociável** não é um certificado: é um **saldo por conta e material** que só o servidor cria (ver "Materiais negociáveis" abaixo) | `claim` (livro-caixa `material_ledger`) |

Cada certificado guarda: dono, tipo (`gear`, `unique`, `gold_pouch`), modelo, raridade, tier, substatus rolados, nível de refino (sempre 0 na emissão), valor em Ouro (Bolsa), origem, estado (`held`, `listed`, `transferred`, `burned`, `revoked`), hora do servidor e um hash do conteúdo. O jogador só consegue **ler** os próprios certificados. Ninguém no cliente escreve neles (RLS e `revoke`, e uma trigger impede mudar o conteúdo depois). Todo evento (emitir, vincular, listar, transferir, queimar, revogar) fica numa tabela de auditoria que só cresce.

## Como funciona

1. **O servidor sorteia.** `mint-item` (JWT obrigatório; o id do usuário vem só do JWT) recebe o que o cliente pede: a receita que está forjando, a zona e a duração da caça, os andares de chefe de uma expedição, ou o id de uma Bolsa. Rola a raridade (61/25/10/4, com a piedade da Lendária abaixo), os substatus e as quedas com as mesmas tabelas do jogo (copiadas por `npm run item:tables`; um teste compara os dois lados rolando o mesmo fluxo de números) e devolve a peça pronta. O cliente aplica exatamente isso ao save e **não rola nada** (a rolagem local é ignorada). Os números vêm de `crypto.getRandomValues`, nunca de `Math.random`.

   **Piedade da Lendária (Rodada 26).** O contador de forjas de tier 4+ sem Lendária vive no servidor (`public.item_pity`, migração 0018, uma linha por conta, sem acesso de cliente). A forja normal de tier 4, 5 ou 6 que não sai Lendária soma 1; depois de 40, a 41ª é Lendária (sem gastar número aleatório na raridade) e o contador volta a 0, o que também acontece com uma Lendária do dado. Forja abaixo do tier 4 e forja com Selo não mexem no contador. O contador é lido antes do sorteio e escrito **na mesma instrução** que emite o certificado (`item_commit`, `p_pity`): duas forjas ao mesmo tempo não podem ganhar a garantia as duas (a segunda recebe `busy` e o sorteio é jogado fora sem ser visto), um pedido repetido (`requestId`) não anda o contador duas vezes e uma recusa por limite deixa o contador onde estava. O cliente não envia nem recebe o contador; offline o aparelho guarda o seu (`stats.forgePity`) e a peça nunca é certificada.
2. **Mesma requisição, mesma resposta.** Cada ação leva um `requestId`; repetir o pedido devolve a resposta guardada. Uma resposta perdida não vira uma segunda rolagem.
3. **Limites de plausibilidade** (tabela abaixo). Passou do limite: o servidor **recusa sem rolar**, devolve um código e marca a conta para a auditoria do dono. Os limites são baldes de fichas atômicos (uma instrução SQL com trava por usuário, igual ao `progress_claim_slot`), contados com o relógio do servidor desde `max(criação da conta, reset da Liga)`.
4. **Vincular.** Equipar uma peça certificada chama `bind-item` antes: o certificado fica vinculado para sempre, e um certificado vinculado nunca pode ser listado (trigger e `check` no banco).
5. **Queimar.** Salvar (desmontar), descartar, usar como ingrediente de receita e abrir uma Bolsa certificada queimam o certificado antes. Ingredientes da forja são queimados na mesma operação atômica que emite a peça nova.
6. **Reset da Liga.** Quando a primeira Liga reseta todos os heróis, os certificados emitidos antes do reset são revogados (os heróis a que eles pertenciam não existem mais).

### Refinar, reforjar, lapidar: a regra escolhida

Duas opções existiam: (a) mandar o refino/lapidação para o servidor, que rolaria e atualizaria o certificado; (b) **anular o certificado**. Escolhi (b).

- Refinar, reforjar e lapidar gastam recursos que o servidor não enxerga (Ouro, materiais, Éter estão no save). Rolar o sucesso no servidor não prova que o custo foi pago, só adiciona uma segunda superfície de ataque (taxas de sucesso, queda de nível, Catalisador, custo crescente) sem proteger nada que o balde de ritmo já não proteja.
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
| Épicas/Lendárias certificadas por dia, por tier | 15 / 8 / 4 / 4 / 4 / 4 (Rodada 26; era 12 / 7) | forjas possíveis por dia x 2 x 15% (P de Épica ou melhor: 10% + 4% da tabela, 14,8% com a piedade da Lendária), piso 4. Conferido de forma atômica na emissão; acima disso a peça é descartada sem ser mostrada |
| Selo do Ferreiro | só com o Passe; 6 por temporada de 60 dias (capacidade 6) | a trilha do Passe dá 3 por temporada; 2x |
| Tempo de Caça pago por reivindicação | 1 h por hora do relógio, até 10 h (balde parcial) | `battlePass.capHours` = 10, o maior armazenamento da recompensa |
| Sorteios de único por hora de Caça | 224 / 165 / 140 / 140 (Clareira / Pântano / Fenda / Abismo) x chance da zona x Sorte Grande (no máximo 1,5) | comentário de `huntingZones.ts` (Rodada 9): as chances foram calibradas para esses sorteios econômicos por hora; o teto físico é 385 |
| Mortes de chefe pagas | 15 por dia (capacidade 15; era 200), até 60 andares por pedido; o excesso não rola e é marcado | Rodada 22: 10 expedições grátis por dia encontram cada chefe de bioma no máximo uma vez por expedição. 200 (`BOUNDS.bossesPerDay`) continua valendo só para o contador do jogo na auditoria de progresso; Sorte Grande no máximo 1,25 |
| Únicos certificados por dia (Caça + chefes) | 2 (era 12) | Rodada 22: um jogador comum acha 1 a 2 únicos em 60 dias e um dono que caça o dia todo 3 a 5; com 15 chefes (0,03 x 1,25 cada, 0,56 no máximo) mais 10 h de Caça a expectativa do dia fica abaixo de 1. Um bot que edita o save fazia ~12 por dia |
| Bolsas por dia | 6 (capacidade 6; o jogo limita a 3 por dia local) | `goldPouch.perDay` x 2 |
| Ouro que vira Bolsa | 3 000 por dia (era 10 000), capacidade = a maior Bolsa | Rodada 22: o dono do Passe ganha 1 000 a 3 300 Ouro/dia (média da semana, por política; `BALANCE_CHANGES.md` Rodada 22; `BALANCE_BASELINE.md`: ~2 470 nos dias 46-60). O termo de 3 940/dia das expedições nunca foi alcançável por quem também gasta |
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

## Passos do dono (para um projeto novo; o que já está no ar: `RESUMO_DO_PROJETO.md`, seção 7)

1. Aplicar `supabase/migrations/0010_item_certificates.sql` (depois da 0009), primeiro no projeto de desenvolvimento, e rodar o PLANO DE TESTE SQL (A a K) que está no fim do arquivo. Reversão: bloco `ROLLBACK` no topo do arquivo.
2. Publicar as funções novas: `mint-item` e `bind-item` (com a verificação de JWT ligada, que é o padrão), com o segredo `APP_ORIGIN` já existente.
3. Conferir que `npm run item:tables` não muda `supabase/functions/_shared/items/tables.ts` (o teste `itemTables.test.ts` falha se o arquivo ficar velho).
4. Ver a auditoria: `select * from arena_private.item_account_flags order by created_at desc;` e `select * from public.item_certificates where user_id = '<id>';`.
5. Nada disso depende de `VITE_SEASON_RANKING_ENABLED`: o mint funciona sem o ranking.

## Materiais negociáveis: um saldo do servidor (rodada 23)

Todo material que uma coleta produz (os 5 minérios, as 5 madeiras, as 12 plantas da Horta e os 10 drops da Caça: **32**) existe em duas variantes idênticas em uso: a **normal** (não negociável, como sempre) e uma **queda ocasional do mesmo material que pode ser vendida no mercado de jogadores**. As regras do jogo (`docs/INVENTORY.md`, seção 10) e a oferta (`docs/BALANCE_CHANGES.md`, Rodada 23) estão nesses arquivos; aqui está só a parte do servidor.

**Por que um saldo e não um certificado.** Um certificado é uma linha por item único. Um material é fungível: 30 000 unidades de ferro não são 30 000 linhas. O servidor guarda **um saldo por conta e material** (`public.material_balances`: `qty`, `pending`, `seq`) e um livro-caixa que só cresce (`public.material_ledger`). O cliente só consegue **ler** as próprias linhas (RLS e `revoke`); ninguém no cliente escreve. Só o servidor cria unidades negociáveis (`material_credit`) e só o servidor as move.

| Coisa | Quem escreve | O que guarda |
| --- | --- | --- |
| `material_balances` | só funções do servidor | `qty` = toda unidade negociável da conta (no save, ou esperando para entrar; **não** as que estão num lote anunciado); `pending` = a parte que o save ainda não tem (compra, lote cancelado ou vencido); `seq` = quantas entregas já houve |
| `material_ledger` | só funções do servidor | uma linha por mudança (`claim`, `burn`, `list`, `unlist`, `sale`, `deliver`, `reset`), com o saldo depois; atualizar a linha é recusado |
| `material_requests` | só funções do servidor | o `requestId` de cada coleta, queima e confirmação com a resposta: a mesma requisição dá sempre a mesma resposta |

### O caminho de uma coleta

1. O jogo (versão web, com conta) coleta como sempre. Os redutores de Caça, Mineração, Corte de Madeira e Horta deixam um **relato** no save (`materialClaims`): a atividade, o lugar (zona ou nível), o tempo que cobre e as unidades que entraram na mochila. O id é determinístico; o relato não leva nenhum resultado.
2. `material-claim` (JWT obrigatório; o usuário vem só do JWT) confere o relato com a **mesma abordagem de plausibilidade** do servidor de itens: o relógio do herói (Caça, Mineração e Corte dividem um balde de 1 h por hora, até 10 h), o relógio das parcelas da Horta, e o teto de unidades por hora de cada material (`materials/tables.ts`, **gerado** por `npm run material:tables` e conferido por teste contra o motor real). Zona nova demais para a idade da conta é recusada e marcada.
3. O servidor **sorteia** (Binomial por unidade, `secureRng`, a chance de `materials/rates.ts`: 3% / 5% / 8%), tira do **teto diário** do material (balde atômico, unidades inteiras) e **credita o saldo** (`material_credit`, uma instrução SQL com trava por usuário). Responde quantas unidades de cada material são negociáveis.
4. O jogo marca essa quantidade de unidades **que já estão na mochila** como negociáveis (`tradeableMaterials`) e o relato sai da fila **no mesmo passo**. Servidor fora do ar: o relato fica no save e é reenviado com o mesmo id (nunca sorteia duas vezes).

O cliente **não** envia nem pode fazer o servidor aceitar nenhum número do resultado (os campos que nomeiam um resultado são ignorados; um teste cobre isso). Uma conta sem sessão não rola nada.

### Gastar, vender ao NPC, descartar

Depois de qualquer mudança do save, o jogo calcula quantas unidades negociáveis foram gastas (normais primeiro, salvo a opção do jogador) e enfileira a **queima** (`tradeableBurns`). O envio é em lote (`material-sync` ação `burn`): cada lote tem **um `requestId` guardado no save até o servidor responder**, então uma resposta perdida nunca queima duas vezes. A queima nunca leva o saldo abaixo de zero e nunca deixa `pending` acima de `qty`. **Servidor inalcançável: gastar unidades negociáveis é bloqueado com uma mensagem** (as normais continuam funcionando).

### Reconciliar ao carregar (e de tempos em tempos)

`useTradeableSync` (web, com conta) roda ao carregar, a cada 5 minutos e ao voltar à aba: manda as queimas, lê o saldo e faz o save concordar. **A pilha negociável nunca passa do saldo**: o excesso vira unidades normais (o total não muda). Um save editado para ter unidades negociáveis que o servidor nunca emitiu perde essa marca. Unidades que o servidor entregou (compra, lote cancelado ou vencido) entram no save até onde o saldo e a mochila deixam, e **só são confirmadas ao servidor (`ack`) quando o save que o SERVIDOR confirmou já tem as unidades**: uma queda entre "adicionou" e "salvou" nunca perde nada (o servidor continua contando como pendente e a próxima passada adiciona de novo). Uma confirmação perdida, repetida, não adiciona duas vezes (a pilha já está no saldo).

### Limites (fonte única: `supabase/functions/_shared/materials/bounds.ts`)

| Limite | Valor | Fonte |
| --- | --- | --- |
| Relógio do herói (Caça + Mineração + Corte) | 1 h por hora do relógio do servidor, até 10 h | `battlePass.capHours` |
| Relógio das parcelas da Horta | 6 parcelas x a velocidade das duas maestrias; guarda um conjunto da planta mais longa | `garden.ts`, `tunables mastery` |
| Unidades por hora, por material | Caça: rolagens máximas x chance x melhor profundidade x melhor subnível x Passe x Faro x Isca; coleta: o poder máximo da profissão x todos os rendimentos x o maior evento; Horta: uma parcela | gerado por `npm run material:tables`; testes rodam o motor real |
| Teto diário por material | **2x o melhor dia do jogador honesto rápido x a chance**, mínimo 3; o balde rende teto/24 por hora e guarda um dia | `rates.ts HONEST_PEAK_DAY_UNITS` (de `npm run sim:long`), `items/bounds.ts MARGIN` |
| Unidades por relato | 100 000 | `bounds.ts` |

Marcas na auditoria (`arena_private.item_account_flags`; uma conta com marca **não consegue anunciar**): `LIMIT_MATERIAL_TIME`, `MATERIAL_TIME_EXCESS`, `MATERIAL_UNITS_EXCESS`, `LIMIT_MATERIAL_DAY`, `MATERIAL_ZONE_TOO_EARLY`. Recusas: `bad_request`, `unknown_place`, `too_early`, `unavailable`.

### O que um trapaceiro ainda consegue

- **Editar o save para ter unidades negociáveis:** a próxima reconciliação as zera (viram normais); e para anunciar, o servidor confere o próprio saldo.
- **Não mandar a queima e gastar mesmo assim:** o jogador usa a unidade **e** pode vendê-la. Isso só vale para unidades que o servidor emitiu e o servidor limita a emissão (o teto diário); material normal já é editável no save, então nada de novo é criado.
- **Anunciar e não tirar as unidades do save:** a reconciliação as transforma em unidades normais (o mesmo que editar material normal).
- **Relatar o máximo o dia inteiro:** recebe no máximo o teto diário por material (~2x o jogador honesto mais rápido) e é marcado.

### Offline e desktop

Sem servidor, **nenhuma variante negociável existe**: os redutores não enfileiram relato (`isServerItemAuthority()`), e um save importado com unidades negociáveis as perde ao carregar (`stripTradeable`). Saves antigos carregam como sempre, sem nenhum campo novo.

### Passos do dono (para um projeto novo; o que já está no ar: `RESUMO_DO_PROJETO.md`, seção 7)

1. Aplicar `supabase/migrations/0015_tradeable_materials.sql` **depois da 0014** (primeiro no projeto de desenvolvimento) e rodar o PLANO DE TESTE SQL (A a N) no fim do arquivo. Ela **substitui** `item_take_tokens` (ganha `whole`), `market_cancel_listing`, `market_record_payment`, `market_release_stale` e a função da reinicialização da Liga, e a visão `market_listings_public`. Reversão: bloco `ROLLBACK` no topo.
2. Publicar as funções novas `material-claim` e `material-sync` (verificação de JWT ligada, o padrão; segredo `APP_ORIGIN`). **Reimplantar também `market-list`, `market-buy` e `market-my`** (mudaram: lotes).
3. Conferir que `npm run material:tables` não muda `supabase/functions/_shared/materials/tables.ts` (o teste `materialServer.test.ts` falha se o arquivo ficar velho).
4. Ver a auditoria: `select * from public.material_balances where user_id = '<id>';`, `select * from public.material_ledger where user_id = '<id>' order by id desc;` e `arena_private.item_account_flags`.
5. Para mudar a oferta: editar `TRADEABLE_CHANCE` em `materials/rates.ts` (e `HONEST_PEAK_DAY_UNITS` se o jogo mudar a coleta; `npm run sim:materials` imprime a tabela) e reimplantar `material-claim`. Nada no jogo precisa mudar.

## O mercado em SOL na Solana (rodada seguinte, já escrita)

**Está descrito em [`MARKET_SOLANA.md`](MARKET_SOLANA.md)** (migrations `0011`, `0012` e `0013`, funções `market-*` e `pass-crypto`, tela Mercado, passos do dono). Os itens e as Bolsas são vendidos em SOL e o Passe em USDC, na rede Solana (decisão do dono; a primeira versão, em USDT na BNB Smart Chain, ficou dormente no código). O que mudou em relação ao plano abaixo: uma venda **não troca o dono** do certificado (a guarda continua tratando `user_id` como imutável): ela termina o certificado antigo (`transferred`) e **emite um novo** ao comprador com o mesmo conteúdo, apontando o antigo em `origin_certificate_id`. O limite diário de emissão (`item_commit`) conta só o que o servidor emitiu (`origin_certificate_id is null`). Um certificado ganhou `in_save` (o item está no save do dono?): listar tira o item do save, comprar/cancelar/expirar devolve ao dono "fora do save" até o jogo construí-lo do certificado e confirmar.

### O plano original desta rodada (mantido como registro)


- `public.item_certificates` com `status = 'held'`, `bound = false` e `arena_private.has_item_flags(user) = false` como as condições de listagem (listar = `held -> listed`; a trigger já recusa um certificado vinculado).
- Os eventos `list` e `transfer` já existem no `check` da auditoria; a guarda já impede ressuscitar um certificado `transferred`, `burned` ou `revoked`. A transferência precisa trocar o dono numa função própria (a guarda atual trata `user_id` como imutável: a rodada nova deve recriá-la).
- A entrega ao comprador sai do conteúdo do certificado (modelo, raridade, substatus, valor da Bolsa), não do save do vendedor, com refino 0 e sem gemas.
- `isTradeable` e `certState` do jogo são o lado local; o mercado confere o certificado no servidor.
- Falta do lado de segurança: ainda é preciso um limite de venda por conta, KYC/saque e a revisão da auditoria antes de pagar qualquer pessoa.
