# Valor econômico de referência (baseGoldValue)

Código: `src/game/economy.ts`. **É só referência**: nada vende, compra, converte ou paga com ele. Não existe venda para NPC, o módulo é funções puras que nunca recebem nem devolvem um save, e nenhum outro arquivo do jogo o importa (um teste garante isso). No futuro P2P o preço é livre e pode ficar acima ou abaixo. Os campos legados `sellValue`/`packCost` do catálogo continuam sem uso; foram lidos aqui só como razão de raridade.

## Âncora

**1 Farrapo de Couro = 2 Gold de referência.** O Farrapo é o drop mais abundante (cerca de 53/h), de tier mais baixo e mais substituível, e é a base do sink mais barato (10 Farrapos → 1 Pó), então é a unidade de conta natural. O 2 é baixo de propósito: fica abaixo do `sellValue` legado do Farrapo (4) e perto do que um Pedido de fato paga por unidade de carga (2 a 2,6 Gold por equivalente de Farrapo). Escolher 1 não mudaria nenhuma razão; só deixaria os números miúdos demais para os processados.

## Como cada material foi derivado

Materiais brutos: `valor = 2 × √(S × D)`, arredondado a 0,5.

- **S (escassez medida)** = unidades/dia de Farrapo numa jornada ativa dedicada de 8h (212) ÷ unidades/dia do material: Caça pela emissão/h da auditoria 21.4; Horta com 4 canteiros × 2 colheitas; Mineração e Lenhador no poder do nível que libera o tier (`5 + 0,75 × nível` por hora).
- **D (raridade desenhada)** = `sellValue` legado ÷ `sellValue` do Farrapo (4).
- A média geométrica impede que uma lente domine. Escadas de minério e de madeira nunca decrescem com o tier.
- **Teto pela Loja** (único preço real em Gold do jogo): a Loja vende `small_hp` a 30 e `large_hp` a 80, e o craft custa 18 e 48 Gold mais 3 Ervas ou 2 Cogumelos. Para o craft nunca sair mais caro que comprar: Erva ≤ (30−18)/3 = 4 e Cogumelo ≤ (80−48)/2 = 16. A Raiz acompanha o Cogumelo (mesma escassez e classe) e a Erva Energética mantém a razão medida contra a Erva.

Processados: `valor = (soma dos ingredientes + Gold cobrado pela receita) × 1,10`, por unidade produzida, usando a receita **mais barata** (o Pó tem 4 receitas). Por construção nunca fica abaixo de ingredientes + Gold obrigatório. O prêmio de 10% (arredondado a 0,5 para cima) paga o trabalho de processar.

## Tabela

| Caça | Gold | Horta | Gold | Mineração | Gold | Lenhador | Gold |
|---|---|---|---|---|---|---|---|
| Farrapo | 2 | Erva Medicinal | 4 | Cobre | 3,5 | Madeira comum | 3,5 |
| Osso | 2 | Erva Energética | 3 | Ferro | 3,5 | Carvalho | 4 |
| Garra | 4,5 | Raiz Amarga | 16 | Prata | 4 | Ébano | 4,5 |
| Sangue | 4,5 | Cogumelo Rubro | 16 | Minério de ouro | 5,5 | Madeira élfica | 5,5 |
| Núcleo | 25 | Flor Carmesim | 41,5 | Obsidiana | 7 | Madeira ancestral | 6 |
| Cristal | 24,5 | | | | | | |

| Processado | Ingredientes | Taxa | Piso | Valor |
|---|---|---|---|---|
| Couro | 6 | 20 | 26 | 29 |
| Aço | 17,5 | 30 | 47,5 | 52,5 |
| Lingote de prata | 20 | 25 | 45 | 49,5 |
| Barra de ouro | 27,5 | 15 | 42,5 | 47 |
| Obsidiana refinada | 35 | 10 | 45 | 49,5 |
| Cabo comum / carvalho / ébano | 17,5 / 20 / 22,5 | 10 / 8 / 5 | 27,5 / 28 / 27,5 | 30,5 / 31 / 30,5 |
| Cabo élfico / ancestral | 27,5 / 30 | 3 / 2 | 30,5 / 32 | 34 / 35,5 |
| Essência | 49,5 | 150 | 199,5 | 219,5 |
| Escamas de dragão | 99 | 400 | 499 | 549 |
| Pó de Refino | 20 | 0 | 20 | 22 |

## Auditoria dos Pedidos (168.000 pedidos, implementação real)

`rewardRatio = Gold do pedido ÷ valor de referência da carga`. Por distância (todos os tiers):

| | min | P10 | P25 | mediana | P75 | P90 | max |
|---|---|---|---|---|---|---|---|
| Local | 0,36 | 0,49 | 0,54 | 0,67 | 2,43 | 2,86 | 4,5 |
| Curta | 0,40 | 0,50 | 0,58 | 0,70 | 6,57 | 10,25 | 13,0 |
| Regional | 0,44 | 0,63 | 0,68 | 1,16 | 1,85 | 9,94 | 13,1 |
| Longa | 0,53 | 0,79 | 0,85 | 1,23 | 1,49 | 1,97 | 10,2 |
| Especial | 0,75 | 1,09 | 1,21 | 1,40 | 2,00 | 2,51 | 22,2 |

Geral: mediana 1,09, P10 0,54, P90 7,7. **A mediana está em torno de 1, mas a cauda é enorme e vem de um único lugar: o arquétipo.**

| Arquétipo | mediana | P10 | P90 |
|---|---|---|---|
| Medicinal | 7,1 | 2,4 | 12,3 |
| Alquímico | 8,4 | 1,4 | 18,5 |
| Alquímico raro | 5,9 | 5,3 | 12,5 |
| Armadura | 1,27 | 0,65 | 1,86 |
| Comercial | 1,24 | 1,18 | 1,75 |
| Militar | 0,93 | 0,55 | 1,91 |
| Encomenda rara | 0,79 | 0,53 | 1,23 |
| Forja | 0,63 | 0,41 | 0,87 |

Por tier e distância (n = pedidos gerados):

```text
T1 (EARLY)
   local     n=6680 min 0.61  P10 0.61  P25 0.86  med 0.86  P75 3.75  P90 3.75  max 4.50
   curta     n=12219 min 0.63  P10 0.64  P25 0.93  med 0.97  P75 11.75  P90 12.25  max 13.00
   regional  n=9523 min 0.67  P10 0.67  P25 0.71  med 1.49  P75 11.58  P90 12.67  max 13.08
   longa     n=10211 min 0.79  P10 0.81  P25 0.83  med 0.86  P75 1.87  P90 1.96  max 2.02
   especial  n=3367 min 1.05  P10 1.09  P25 1.15  med 1.25  P75 2.41  P90 2.51  max 2.58
T2 (MID)
   local     n=6563 min 0.50  P10 0.54  P25 0.63  med 0.67  P75 2.29  P90 2.29  max 2.57
   curta     n=11643 min 0.52  P10 0.56  P25 0.58  med 0.70  P75 6.57  P90 7.29  max 7.71
   regional  n=9542 min 0.61  P10 0.67  P25 0.72  med 1.16  P75 1.35  P90 7.89  max 9.17
   longa     n=10724 min 0.74  P10 0.82  P25 0.87  med 1.29  P75 1.51  P90 1.67  max 9.39
   especial  n=3528 min 1.02  P10 1.18  P25 1.30  med 1.49  P75 1.99  P90 2.06  max 20.56
T3 (LATE)
   local     n=6563 min 0.45  P10 0.51  P25 0.54  med 0.56  P75 2.43  P90 2.43  max 2.71
   curta     n=11643 min 0.49  P10 0.50  P25 0.51  med 0.59  P75 6.86  P90 7.71  max 8.14
   regional  n=9542 min 0.55  P10 0.61  P25 0.64  med 1.10  P75 1.27  P90 8.28  max 9.56
   longa     n=10724 min 0.66  P10 0.75  P25 0.85  med 1.26  P75 1.39  P90 1.51  max 9.80
   especial  n=3528 min 0.94  P10 1.08  P25 1.24  med 1.33  P75 1.91  P90 2.03  max 21.39
T4 (END)
   local     n=6563 min 0.36  P10 0.39  P25 0.46  med 0.49  P75 2.43  P90 2.43  max 2.86
   curta     n=11637 min 0.40  P10 0.41  P25 0.49  med 0.57  P75 4.82  P90 6.71  max 7.14
   regional  n=9544 min 0.44  P10 0.59  P25 0.64  med 1.07  P75 1.27  P90 8.61  max 9.94
   longa     n=10727 min 0.53  P10 0.61  P25 0.85  med 1.24  P75 1.38  P90 5.95  max 10.20
   especial  n=3529 min 0.75  P10 0.88  P25 1.21  med 1.34  P75 1.96  P90 12.72  max 22.24
```

### Anomalias (NÃO corrigidas nesta etapa)

- **Pagam demais frente à carga:** pedidos de plantas (Medicinal, Alquímico, Alquímico raro), pior caso 22× (Especial com 3 Ervas Energéticas + 1 Raiz + 1 Cogumelo, 912 Gold para 41 de referência). Causa dupla: (1) os pesos usados para gerar Pedidos (`materialWeight`, escassez de produção) tratam a Erva como 13 Farrapos e a Raiz como 26, enquanto a referência a coloca em 2 e 8 Farrapos; (2) os tetos por pedido (Raiz/Cogumelo ≤ 1, Energética ≤ 3) cortam a quantidade abaixo do orçamento em pedidos longos.
- **Pagam pouco frente à carga:** Forja em tier 4 (mínimo 0,36: 6 Barras de ouro + 4 Madeiras élficas por 20 Gold). Os pesos dos minérios (0,66 a 1,46) ficam abaixo da referência (1,75 a 3).
- Só 5,6% dos pedidos têm ratio < 0,5 e 47% ficam abaixo de 1, o que é esperado, porque Militar e Forja cobram um pouco menos que a carga de referência.

Recomendação (proposta, não aplicada): usar `baseGoldValue` como fonte única dos pesos de Pedidos, e recalibrar tetos e Gold/h juntos. Isso mexe na fórmula e precisa de nova simulação.

## Reforja

Materiais de 1 tentativa, em valor de referência: T1/T2 = **71** (Pó 2 × 22 + Garra ou Sangue 6 × 4,5); T3+ arma = **290** (Pó 132 + Garras 108 + Núcleos 50); T3+ armadura = **289**. Taxa de Gold por tentativa: 10, 25, 50, 90, 150, 240, 360, 500 (e 500 dali em diante), mais 1 shard. Nas tentativas altas os materiais são 37% do custo total (T3+); nas primeiras eles são quase tudo.

Um Pedido só de materiais de Caça paga, em mediana, 0,82 a 0,87 do valor de referência da carga (P90 1,4 a 1,6; máximo 2,1). Pela mesma carga de uma Reforja T3+: **mediana ≈ 240**, P90 ≈ 400 a 460, máximo ≈ 605. Ou seja, entregar em vez de reforjar rende em mediana menos do que os materiais valem, e só o extremo passa da taxa de 500. **A Reforja não vira escolha obviamente ruim.**

## Craft (receitas inalteradas)

| Equipamento | Materiais | Pré-requisitos | Taxa Gold | Total |
|---|---|---|---|---|
| Adaga de bronze | 70 | 0 | 40 | 110 |
| Espada curta de ferro | 46 | 220 | 120 | 386 |
| Montante de aço | 530 | 771 | 300 | 1.601 |
| Lâmina dourada | 154 | 1.601 | 600 | 2.354 |
| Lâmina do vazio | 244 | 4.316 | 1.800 | 6.360 |
| Lâmina abissal | 328 | 6.360 | 3.200 | 9.888 |

Gemas e shards não são valorados. Consumíveis (ingredientes + taxa = custo): xp_potion 9 + 30 = 39; small_hp 12 + 18 = 30 (Loja 30); greater_elixir 32 + 100 = 132; large_hp 32 + 48 = 80 (Loja 80); strength_elixir 50,5 + 250 = 300,5. O craft das duas poções de HP iguala o preço da Loja por construção.

## Bônus de XP do Passe nas Entregas (decisão desta etapa)

Detalhes e a simulação em `DELIVERY_ORDERS.md`. Resumo: `T.deliveries.passXpBonus = 0,10`, só XP, congelado no aceite. O Passe **não** mexe em Gold, slot, material, tempo ou rewardRatio.
