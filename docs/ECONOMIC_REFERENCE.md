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

## Auditoria dos Pedidos ANTES do alinhamento (168.000 pedidos)

> Esta seção descreve o gerador antigo, que usava pesos próprios. Foi o que motivou o alinhamento descrito depois dela.

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

### Anomalias encontradas (corrigidas no alinhamento abaixo)

- **Pagam demais frente à carga:** pedidos de plantas (Medicinal, Alquímico, Alquímico raro), pior caso 22× (Especial com 3 Ervas Energéticas + 1 Raiz + 1 Cogumelo, 912 Gold para 41 de referência). Causa dupla: (1) os pesos usados para gerar Pedidos (`materialWeight`, escassez de produção) tratam a Erva como 13 Farrapos e a Raiz como 26, enquanto a referência a coloca em 2 e 8 Farrapos; (2) os tetos por pedido (Raiz/Cogumelo ≤ 1, Energética ≤ 3) cortam a quantidade abaixo do orçamento em pedidos longos.
- **Pagam pouco frente à carga:** Forja em tier 4 (mínimo 0,36: 6 Barras de ouro + 4 Madeiras élficas por 20 Gold). Os pesos dos minérios (0,66 a 1,46) ficam abaixo da referência (1,75 a 3).
- Só 5,6% dos pedidos têm ratio < 0,5 e 47% ficam abaixo de 1, o que é esperado, porque Militar e Forja cobram um pouco menos que a carga de referência.

## Depois do alinhamento (`balance: align delivery orders with economic reference`)

O gerador deixou de ter pesos próprios: `baseGoldValue` é a única fonte de "quanto vale". Fórmula:

```text
Gold da entrega      = horas x Gold/h(tier, distância)          (inalterado: 30 a 40 Gold/h)
carga desejada (ref) = Gold / rewardRatio(distância)            Local 1,05 | Curta 1,10 | Regional 1,15 | Longa 1,20 | Especial 1,25
quantidades          = carga desejada x parte do arquétipo / baseGoldValue do material
```

O arquétipo decide O QUÊ (partes do valor por material e uma assinatura obrigatória); o `baseGoldValue` decide QUANTO. Um material que bate no teto por pedido (`capXxx`, agora relativos à produção) fica no teto e o valor que faltou é movido para os outros materiais do arquétipo; depois unidades soltas são somadas ou tiradas até o valor da carga chegar o mais perto possível do alvo. A carga precisa ficar em ±15% do alvo, senão o arquétipo é descartado e outro é tentado. O Gold nunca depende da carga.

Resultado (168.000 pedidos, implementação real):

```text
T1 (EARLY)
   local     n=7340 min 0.93  P10 1.03  P25 1.07  med 1.07  P75 1.11  P90 1.11  max 1.11
   curta     n=14161 min 1.06  P10 1.08  P25 1.08  med 1.11  P75 1.11  P90 1.12  max 1.14
   regional  n=7746 min 1.13  P10 1.13  P25 1.14  med 1.15  P75 1.15  P90 1.16  max 1.16
   longa     n=10761 min 1.19  P10 1.20  P25 1.20  med 1.21  P75 1.29  P90 1.37  max 1.41
   especial  n=1992 min 1.25  P10 1.25  P25 1.25  med 1.25  P75 1.25  P90 1.26  max 1.28
T2 (MID)
   local     n=6589 min 0.97  P10 1.03  P25 1.03  med 1.06  P75 1.07  P90 1.07  max 1.18
   curta     n=11304 min 0.99  P10 1.06  P25 1.08  med 1.11  P75 1.11  P90 1.11  max 1.14
   regional  n=9850 min 1.07  P10 1.14  P25 1.14  med 1.15  P75 1.16  P90 1.16  max 1.26
   longa     n=11157 min 1.15  P10 1.20  P25 1.20  med 1.20  P75 1.20  P90 1.21  max 1.37
   especial  n=3100 min 1.22  P10 1.25  P25 1.25  med 1.25  P75 1.31  P90 1.40  max 1.47
T3 (LATE)
   local     n=6587 min 1.00  P10 1.00  P25 1.00  med 1.08  P75 1.10  P90 1.10  max 1.12
   curta     n=11643 min 0.97  P10 1.08  P25 1.08  med 1.09  P75 1.11  P90 1.12  max 1.14
   regional  n=9530 min 1.06  P10 1.14  P25 1.15  med 1.15  P75 1.16  P90 1.16  max 1.27
   longa     n=11342 min 1.15  P10 1.20  P25 1.20  med 1.20  P75 1.20  P90 1.23  max 1.41
   especial  n=2898 min 1.22  P10 1.25  P25 1.25  med 1.25  P75 1.32  P90 1.41  max 1.47
T4 (END)
   local     n=6507 min 1.00  P10 1.00  P25 1.03  med 1.05  P75 1.10  P90 1.10  max 1.21
   curta     n=11705 min 1.01  P10 1.07  P25 1.09  med 1.10  P75 1.12  P90 1.13  max 1.14
   regional  n=9542 min 1.06  P10 1.14  P25 1.14  med 1.15  P75 1.15  P90 1.16  max 1.27
   longa     n=11531 min 1.15  P10 1.20  P25 1.20  med 1.20  P75 1.20  P90 1.21  max 1.41
   especial  n=2715 min 1.23  P10 1.25  P25 1.25  med 1.25  P75 1.33  P90 1.42  max 1.47
```

Global: mín 0,93, P10 1,07, P25 1,10, mediana 1,14, P75 1,20, P90 1,24, máx 1,47 (antes 0,36 / 0,54 / 0,67 / 1,09 / 1,97 / 7,7 / 22,2). Por arquétipo (mediana): Medicinal 1,09, Militar 1,11, Forja 1,14, Encomenda rara 1,16, Armadura 1,20, Alquímico 1,20, Alquímico raro 1,20, Comercial 1,21. Menos de 1% dos pedidos ficam abaixo de 1,0 e nenhum passa de 1,5.

10 menores ratios (todos pedidos minúsculos, em que a unidade inteira pesa):

```text
T1 (EARLY) local forja 0.4h gold 13 carga 14 ratio 0.93 :: 3 copper, 1 common_wood
T3 (LATE) curta raro 1.4h gold 48 carga 50 ratio 0.97 :: 1 demon_core, 1 corrupted_crystal
T2 (MID) local forja 0.6h gold 18 carga 19 ratio 0.97 :: 3 iron, 2 oak_wood
T2 (MID) curta raro 1.5h gold 49 carga 50 ratio 0.99 :: 1 demon_core, 1 corrupted_crystal
T1 (EARLY) local militar 0.4h gold 13 carga 13 ratio 1.00 :: 2 leather_scrap, 2 demon_claw
T1 (EARLY) local medicinal 0.6h gold 18 carga 18 ratio 1.00 :: 2 common_herb, 5 leather_scrap
T2 (MID) local militar 0.4h gold 13 carga 13 ratio 1.00 :: 2 leather_scrap, 2 demon_claw
T3 (LATE) local medicinal 0.5h gold 17 carga 17 ratio 1.00 :: 1 common_herb, 1 energy_herb, 3 leather_scrap, 2 bone_fragment
T3 (LATE) local medicinal 0.6h gold 19 carga 19 ratio 1.00 :: 1 common_herb, 1 energy_herb, 3 leather_scrap, 3 bone_fragment
T4 (END) local medicinal 0.5h gold 17 carga 17 ratio 1.00 :: 1 common_herb, 1 energy_herb, 3 leather_scrap, 2 bone_fragment
```

10 maiores ratios (todos Especiais de material comum, em que o teto por pedido corta a carga; o Gold é o mesmo de qualquer outro Especial):

```text
T4 (END) especial militar 19.8h gold 783 carga 533 ratio 1.47 :: 45 demon_claw, 90 leather_scrap, 75 bone_fragment
T3 (LATE) especial militar 20.6h gold 782 carga 533 ratio 1.47 :: 45 demon_claw, 90 leather_scrap, 75 bone_fragment
T2 (MID) especial militar 21.4h gold 782 carga 533 ratio 1.47 :: 45 demon_claw, 90 leather_scrap, 75 bone_fragment
T4 (END) especial armadura 21.0h gold 830 carga 566 ratio 1.47 :: 36 concentrated_blood, 75 bone_fragment, 3 corrupted_crystal, 90 leather_scrap
T3 (LATE) especial armadura 21.8h gold 830 carga 566 ratio 1.47 :: 36 concentrated_blood, 75 bone_fragment, 3 corrupted_crystal, 90 leather_scrap
T2 (MID) especial armadura 22.8h gold 830 carga 566 ratio 1.47 :: 36 concentrated_blood, 75 bone_fragment, 3 corrupted_crystal, 90 leather_scrap
T4 (END) especial militar 19.8h gold 780 carga 533 ratio 1.46 :: 45 demon_claw, 90 leather_scrap, 75 bone_fragment
T4 (END) especial alq_raro 21.3h gold 839 carga 573 ratio 1.46 :: 3 rare_flower, 5 energy_herb, 3 crimson_mushroom, 3 corrupted_crystal, 36 concentrated_blood, 75 bone_fragment
T3 (LATE) especial militar 20.5h gold 779 carga 533 ratio 1.46 :: 45 demon_claw, 90 leather_scrap, 75 bone_fragment
T2 (MID) especial militar 21.3h gold 779 carga 533 ratio 1.46 :: 45 demon_claw, 90 leather_scrap, 75 bone_fragment
```

## Reforja

Materiais de 1 tentativa, em valor de referência: T1/T2 = **71** (Pó 2 × 22 + Garra ou Sangue 6 × 4,5); T3+ arma = **290** (Pó 132 + Garras 108 + Núcleos 50); T3+ armadura = **289**. Taxa de Gold por tentativa: 10, 25, 50, 90, 150, 240, 360, 500 (e 500 dali em diante), mais 1 shard. Nas tentativas altas os materiais são 37% do custo total (T3+); nas primeiras eles são quase tudo.

Um Pedido só de materiais de Caça (gerador ANTIGO) pagava, em mediana, 0,82 a 0,87 do valor de referência da carga, com máximo 2,1: pela mesma carga de uma Reforja T3+ ≈ 240 (P90 ≈ 400 a 460, máximo ≈ 605).

Com o gerador alinhado, um Pedido só de Caça paga em mediana **1,15** vezes a referência (P10 1,03 a 1,09, P90 1,20, máx 1,47): pela mesma carga de uma Reforja T3+ ≈ **334** (P90 349, máximo 426). O máximo agora fica abaixo da taxa de 500 da 8ª tentativa, mas a mediana subiu (≈ 30% para ≈ 42% do custo total da Reforja na tentativa 8+ como custo de oportunidade dos materiais). Só nas duas primeiras tentativas de uma peça (taxas de 10 e 25 Gold, custo total ≈ 300 a 315) o Pedido paga um pouco mais (≈ 334) do que a Reforja custa em Gold e materiais somados; da terceira em diante a Reforja custa mais que o Pedido paga. O motivo de reforjar não é Gold, é o resultado.

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
