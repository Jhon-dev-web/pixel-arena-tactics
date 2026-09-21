# Pedidos / Entregas (substituem a Expedição)

Resumo do design e dos números que o sustentam. Código: `src/game/deliveries.ts` (geração e reducers), `src/game/deliveryState.ts` (estado salvo e sanitização), `src/components/DeliveryModal.tsx` (UI), tunables em `T.deliveries`.

```text
materiais + tempo  ->  Gold + XP (+ shards em Longa/Especial)
```

## O que a Expedição era (auditoria)

- Recompensa fixa, sem custo e sem escala por nível: Curta 1h = 25 Gold, Longa 4h = 110, Épica 8h = 260 (25 a 32,5 Gold/h) e 55.000 XP/h em todas.
- Ela **não** era uma torneira grande de Gold. O peso dela era **XP** (cerca de 60 a 70% do XP idle) e **shards** (até 7,5/dia por slot).
- Base 1 slot, Passe +1 slot. O shard da Épica era sorteado no claim, e o claim não validava `endsAt`.

## Regras do novo sistema

- **1 entrega ativa para todos.** O Passe não dá segundo slot.
- **Ofertas:** 3 (1 simples, 1 intermediária, 1 exigente). Com Passe, 4 (a 4ª é variável). Aceitar uma oferta faz uma nova da mesma classe ocupar a vaga. Ofertas não aceitas são trocadas após 24 h.
- **Reroll:** grátis. O "ciclo" é o **dia local** (`Date.toDateString`, o mesmo critério das sessões de Dungeon). 1 por dia, 2 com Passe. O contador persiste no save, então recarregar não burla. Troca todas as ofertas e não mexe na entrega ativa.
- **Aceitar:** consome os materiais na hora (não é reserva), tudo ou nada. O pedido vira um snapshot congelado.
- **Claim:** lê só o snapshot, não usa RNG, é idempotente (a mesma transição que paga limpa a entrega). Só libera quando `agora >= endsAt`.
- **Congelamento:** requisitos, Gold, XP, shards e duração ficam fixos na geração, mesmo se um tunable mudar depois.
- **Shards:** definidos na geração (o jogador vê antes de aceitar), só em Longa e Especial, por tier.
- **Recompensa depende de tier x distância, nunca do material entregue.** XP e Gold são função do tempo. O material é o "preço de entrada". Ninguém entrega material caro só para ganhar mais XP.

## Distâncias

| Faixa | Referência | Gold/h extra | XP/h |
|---|---|---|---|
| Local | 0,5 h | +0 | 39k |
| Curta | 1,5 h | +1 | 45k |
| Regional | 4,5 h | +2 | 51k |
| Longa | 10 h | +3,5 | 56k |
| Especial | 21 h | +5 | 60k |

Gold/h = 30 + 1,5 × (tier − 1) + extra da faixa (na prática 30 a 40). Durações variam ±10% e são arredondadas a 5 min.

## Tier do jogador

Pelo **maior andar da Dungeon** (o mesmo dado que libera as zonas de Caça): andares 1–25, 26–50, 51–75 e 76+. Os materiais que um pedido pode pedir são filtrados pelo que o jogador já pode ter: zonas de Caça desbloqueadas, nível de Jardinagem para cada planta, nível de Mineração/Lenhador para minério/madeira, e nível de personagem 25 para pedir processados.

## Peso econômico (economicWeight)

Índice de **escassez de produção**, em "equivalentes de Farrapo". **Não é preço e não vale Gold.** Só serve para dimensionar quantidades (uma Flor não pode valer como um Farrapo) e impedir pedidos incoerentes. Nasce de unidades/dia numa jornada ativa dedicada, com prêmio de raridade (Nobres ×1,5, Flor ×2). Processados: insumos ×1,1 + taxa de conversão × `processedFeeWeight`.

Cada pedido recebe um orçamento de peso = horas × peso por hora do tier; esse orçamento é repartido pelas partes do arquétipo e limitado por tetos por material (`capXxx`).

## Arquétipos

Medicinal, Alquímico, Alquímico raro (só tier 4), Militar, Armadura, Encomenda rara (Nobres, 1 a 3), Forja, Comercial (processados). Nenhum pede Flor/Raiz/Cogumelo em quantidade de "custo artificial": no máximo 1 de cada por pedido. Pedidos com processados só saem de Regional para cima e a taxa de conversão nunca passa de 50% do Gold do pedido.

## Passe = conveniência

Sem Passe: 3 ofertas e 1 reroll/dia. Com Passe: 4 ofertas e 2 rerolls/dia. **Não** dá Gold, XP, multiplicador nem slot. Efeito medido: +1 a 10% de Gold/XP por escolher melhor, com o mesmo número de entregas.

## Express Tickets

Os IDs `expedition_ticket_1h/2h/4h` foram mantidos (nenhuma migração do inventário ou do Passe). Viram "Ticket Expresso" e **adiantam 1/2/4 h** a entrega ativa (nunca abaixo de "agora"). O Passe entrega 7 por temporada (2×1h, 2×2h, 3×4h = 18 h, 2,5% do tempo de um slot em 30 dias). "Concluir na hora" foi rejeitado: chegaria a 7 a 15% de throughput extra e concentraria um ganho grande em usar o ticket no início de uma Especial.

## Quest diária "Explorador"

Continua valendo 120 Gold para "Conclua 1 Entrega". O contador salvo continua se chamando `quests.daily.expeditions` (compatibilidade de save).

## Expedição legada

Expedições já ativas no save continuam pelo sistema antigo (mesmas recompensas, sorteio de shard da Épica no claim) até serem coletadas, em uma seção "Expedições em andamento" dentro do próprio modal. Nada é convertido nem perdido. Quando `save.expeditions` esvazia, a seção some. Nenhuma nova Expedição pode ser iniciada. O claim legado agora também exige `agora >= endsAt`.

## Resultados da simulação (mix 50% MID / 30% LATE / 20% END; 50% casual / 35% ativo / 15% hardcore)

| | Expedição (1 slot) | Pedidos |
|---|---|---|
| Gold/dia | 429 | 547 (+27%) |
| XP/dia | 726k | 855k (+18%) |
| Shards/dia | 4,1 | 1,6 (-60%) |
| Entregas/dia | 1,4 | 1,4 |
| Custo em materiais | nenhum | Comuns 19%, Refino 9% (Sangue 7%), Nobres 4%, Erva Medicinal 4%, Erva Energética 8%, Raiz 7%, Cogumelo 7%, Flor 5% da produção |

Por comportamento (Gold/XP/shards por dia): casual 400 / 640k / 1,3 (antes 260 / 440k / 2,5), ativo 680 / 1.070k / 2,1 (antes 520 / 880k / 5), hardcore 740 / 1.150k / 2,1 (antes 780 / 1.320k / 7,5).

Para quem tinha Passe, a Expedição dava 2 slots (Gold, XP e shards dobrados). Com 1 slot, o XP de Expedição desses jogadores cai (por exemplo, ativo com Passe: 1.760k → 1.100k/dia). Foi decisão aprovada: o Passe não dobra throughput passivo.

### Premissas (não são dados medidos)

Produção/dia por perfil (auditoria econômica seção 21.4), horas de Caça e colheitas por comportamento, e as regras de escolha do jogador (prefere entrega longa/com shard, guarda material para Reforja). Os resultados mudam se isso mudar. A diferença de Gold/XP contra a Expedição vem de a entrega poder ocupar o slot até 24 h por check-in (a Épica parava em 8 h), não de a hora pagar mais.
