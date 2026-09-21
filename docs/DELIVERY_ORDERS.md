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

## Carga (baseGoldValue)

O peso econômico próprio (`economicWeight`) foi **aposentado**. A carga de um pedido é dimensionada pelo valor de referência central (`economy.ts`, ver `ECONOMIC_REFERENCE.md`):

```text
Gold = horas x Gold/h(tier, distância)                 (tempo + tier definem o orçamento de recompensa)
carga desejada = Gold / rewardRatio(distância)         Local 1,05 | Curta 1,10 | Regional 1,15 | Longa 1,20 | Especial 1,25
quantidade de cada material = carga desejada x parte do arquétipo / baseGoldValue
```

A carga precisa ficar em ±15% do alvo (`T.deliveries.ratioTolerance`). Um material que bate no teto por pedido fica no teto e o valor que sobra é movido para os outros materiais do arquétipo. Distância maior paga um pouco mais por unidade de carga (a entrega prende o slot por mais tempo). `baseGoldValue` só dimensiona a carga: não paga nada e não existe venda para NPC.

Pedidos de plantas: a produção da Horta é pequena (1 a 3 unidades/dia de Raiz, Cogumelo e Flor), então elas entram em quantidades pequenas (tetos 2/2/2, até 3 no Especial) e o resto do valor do pedido vem de Farrapo, Osso, Sangue e Cristal (o pedido é "ervas e ataduras", "reagentes"). Fluxos antigos com Raiz/Cogumelo/Flor em excesso deixaram de existir.

## Arquétipos

Medicinal, Alquímico, Alquímico raro (só tier 4), Militar, Armadura, Encomenda rara (Nobres, 1 a 3), Forja, Comercial (processados). Cada um tem uma **assinatura** obrigatória (Militar = Garra, Medicinal = Erva, Alquímico raro = Flor, Armadura = Sangue, Encomenda rara = Núcleo + Cristal, Comercial = só processados, Forja = só minério e madeira). Pedidos com processados só saem de Regional para cima e a taxa de conversão nunca passa de 65% do Gold do pedido (o ratio ≥ 1 já garante Gold líquido positivo).

## Passe = conveniência

Sem Passe: 3 ofertas e 1 reroll/dia. Com Passe: 4 ofertas, 2 rerolls/dia e **+10% de XP nas Entregas**. **Não** dá Gold, slot, multiplicador de material, tempo menor nem melhor rewardRatio. Por escolher melhor entre 4 ofertas, o Passe rende +1 a 8% de Gold (mesmas entregas por dia).

### Bônus de XP do Passe (`T.deliveries.passXpBonus = 0,10`)

Aplicado ao ACEITAR o pedido e congelado no snapshot (o Passe expirar depois não muda o XP daquela entrega). Só XP: Gold, shards, materiais, duração e o número de entregas não mudam. A oferta no tabuleiro já mostra o XP com o bônus.

Motivo: a Expedição com Passe dava 2 slots. Com 1 slot para todos, o XP de Expedição de quem comprava Passe caía 23 a 56%. Simulação (mix MID/LATE/END, XP/dia só de Entregas):

| | Exp. sem Passe | Exp. com Passe (2 slots) | Pedidos sem Passe | Passe +0% | +5% | +10% | +15% | +20% |
|---|---|---|---|---|---|---|---|---|
| Casual | 440k | 880k | 623k | 675k (−23%) | 708k (−20%) | 742k (−16%) | 776k (−12%) | 810k (−8%) |
| Ativo | 880k | 1.760k | 1.060k | 1.081k (−39%) | 1.135k (−36%) | 1.189k (−32%) | 1.243k (−29%) | 1.297k (−26%) |
| Hardcore | 1.320k | 2.640k | 1.144k | 1.162k (−56%) | 1.220k (−54%) | 1.278k (−52%) | 1.336k (−49%) | 1.394k (−47%) |

XP total idle (Caça + Entregas) de quem tem Passe, contra o sistema antigo com Passe: ativo −33% (0%), −30%, **−27% (+10%)**, −25%, −22%; casual −20% a −7%; hardcore −47% a −40%. A vantagem de XP do Passe sobre quem não tem Passe: ativo +2% sem bônus, **+12% com +10%**, +22% com +20%.

Escolha: **+10%**. Sem bônus o Passe quase não daria XP (+2% para o jogador ativo); com +20% viraria um produto de XP (+22%), o que contraria a decisão de ele ser conveniência. +10% corta a queda do ativo de −33% para −27% sem recuperar o que o segundo slot dava.

## Express Tickets

Os IDs `expedition_ticket_1h/2h/4h` foram mantidos (nenhuma migração do inventário ou do Passe). Viram "Ticket Expresso" e **adiantam 1/2/4 h** a entrega ativa (nunca abaixo de "agora"). O Passe entrega 7 por temporada (2×1h, 2×2h, 3×4h = 18 h, 2,5% do tempo de um slot em 30 dias). "Concluir na hora" foi rejeitado: chegaria a 7 a 15% de throughput extra e concentraria um ganho grande em usar o ticket no início de uma Especial.

## Quest diária "Explorador"

Continua valendo 120 Gold para "Conclua 1 Entrega". O contador salvo continua se chamando `quests.daily.expeditions` (compatibilidade de save).

## Expedição legada

Expedições já ativas no save continuam pelo sistema antigo (mesmas recompensas, sorteio de shard da Épica no claim) até serem coletadas, em uma seção "Expedições em andamento" dentro do próprio modal. Nada é convertido nem perdido. Quando `save.expeditions` esvazia, a seção some. Nenhuma nova Expedição pode ser iniciada. O claim legado agora também exige `agora >= endsAt`.

## Resultados da simulação (mix 50% MID / 30% LATE / 20% END; 50% casual / 35% ativo / 15% hardcore)

| | Expedição (1 slot) | Pedidos (alinhados à referência) |
|---|---|---|
| Gold/dia | 429 | 541 (+26%) |
| XP/dia (sem o bônus do Passe) | 726k | 847k (+17%) |
| Shards/dia | 4,1 | 1,66 (-60%) |
| Entregas/dia | 1,4 | 1,4 |
| Custo em materiais | nenhum | Comuns 20%, Refino 10% (Sangue 10%), Nobres 5%, Erva Medicinal 3%, Erva Energética 6%, Raiz 9%, Cogumelo 9%, Flor 8% da produção |

Por comportamento (Gold/XP/shards por dia): casual 387 / 606k / 1,2 (antes 260 / 440k / 2,5), ativo 681 / 1.065k / 2,1 (antes 520 / 880k / 5), hardcore 731 / 1.141k / 2,2 (antes 780 / 1.320k / 7,5). Jogador aleatório 494; **maximizador de ratio 736** (1,01× o hardcore: entender o sistema não multiplica o Gold, porque o Gold é tempo x tier e a carga tem ratio quase constante).

Vantagem do Passe só por escolher entre 4 ofertas e rerolar (sem o bônus de XP): casual +2,4%, ativo +1,4%, hardcore +0,7%, maximizador +3,9% de Gold.

Para quem tinha Passe, a Expedição dava 2 slots (Gold, XP e shards dobrados). Com 1 slot, o XP de Expedição desses jogadores cai (por exemplo, ativo com Passe: 1.760k → 1.100k/dia). Foi decisão aprovada: o Passe não dobra throughput passivo.

### Premissas (não são dados medidos)

Produção/dia por perfil (auditoria econômica seção 21.4), horas de Caça e colheitas por comportamento, e as regras de escolha do jogador (prefere entrega longa/com shard, guarda material para Reforja). Os resultados mudam se isso mudar. A diferença de Gold/XP contra a Expedição vem de a entrega poder ocupar o slot até 24 h por check-in (a Épica parava em 8 h), não de a hora pagar mais.
