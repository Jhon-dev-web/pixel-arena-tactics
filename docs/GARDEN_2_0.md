# Horta 2.0 — catálogo, progressão e utilidade econômica

Estado: implementado (catálogo, níveis, tempos, quantidades, XP, receitas). Propostas ao final NÃO estão implementadas.
Números abaixo saem dos dados reais (`garden.ts`, `potions.ts`, `skills.ts`) e são verificados pelo harness da Horta.

## 1. Princípios

- Uma planta só existe se hoje alimenta uma receita real. Nenhum material novo sem consumidor.
- Colheita FIXA (sem RNG), plantio grátis: o custo real é a hora de canteiro (4 canteiros).
- IDs estáveis (`common_herb`, `uncommon_root`, `rare_flower`): saves e receitas existentes seguem intactos. Só o nome visível mudou.
- Sem regar, clima, doença, energia ou solo.

## 2. Catálogo implementado (5 plantas)

| Planta (id) | Raridade | Nível de Jardinagem | Tempo | Colheita | XP/colheita | Consumidor atual |
|---|---|---|---|---|---|---|
| Erva Medicinal (`common_herb`, antiga Erva Comum) | comum | 1 | 2 h | +2 | 10 | Poção de Vida Pequena (3), Pó de Refino (10:1) |
| Erva Energética (`energy_herb`, NOVA) | comum | 5 | 3 h | +3 | 15 | Poção do Conhecimento (3) |
| Raiz Amarga (`uncommon_root`, antiga Raiz Incomum) | incomum | 15 | 6 h | +1 | 30 | Elixir de Vida Maior (2) |
| Cogumelo Rubro (`crimson_mushroom`, NOVO) | incomum | 25 | 4 h | +1 | 20 | Poção de Vida Grande (2) |
| Flor Carmesim (`rare_flower`, antiga Flor Rara) | rara | 35 | 12 h | +1 | 60 | Elixir de Força (1 + 2 Garras) |

Âncoras antigas (2 h/+2, 6 h/+1, 12 h/+1 e níveis 1/15/35) mantidas exatamente. Rendimento por hora: comuns 1,0; incomuns 0,17–0,25; rara 0,08.

### Receitas (Forja > Alquimia)

| Consumível | Insumo | Ouro | Nível de personagem | Observação |
|---|---|---|---|---|
| Poção do Conhecimento | 3 Erva Energética | 30 | 1 | mudou de Erva Medicinal para Energética |
| Poção de Vida Pequena | 3 Erva Medicinal | 18 | 1 | NOVA (Loja: 30 ouro) |
| Elixir de Vida Maior | 2 Raiz Amarga | 100 | 15 | inalterada |
| Poção de Vida Grande | 2 Cogumelo Rubro | 48 | 25 | NOVA (Loja: 80 ouro) |
| Elixir de Força | 1 Flor Carmesim + 2 Garra Demoníaca | 250 | 35 | inalterada |

Sem torneira de ouro: consumíveis não podem ser vendidos e o custo em ouro de toda receita é maior que o `sellValue` do item.
As poções de vida craftadas custam ~60% do ouro da Loja (mais as plantas): a Loja segue sendo a opção instantânea e ilimitada.

## 3. XP de Jardinagem

Regra: `XP da colheita = horas de crescimento × 5` (`T.skills.gardenXpPerHour`). Todas as plantas rendem o mesmo XP por hora de canteiro (5),
então nenhuma planta é melhor "para XP" que outra: a escolha é sobre qual material você precisa.
Antes o XP era 10 fixo por colheita: a Erva de 2 h rendia 5 XP/h, a Raiz 1,7 XP/h e a Flor 0,8 XP/h (a planta mais rápida dominava).
A Erva de 2 h continua com 10 XP; as longas deixam de ser subpagas.

XP acumulado para o nível (curva de habilidade existente, 5 × 1,08^(n−1)): Nv5 = 23, Nv15 = 121, Nv25 = 334, Nv35 = 793, Nv50 = 2 652, Nv65 = 8 547, Nv75 = 18 526.

Dias até o nível (4 canteiros, sempre a planta de maior XP/dia que já esteja liberada para o padrão de visita):

| Padrão | Nv5 | Nv15 | Nv25 | Nv35 | Nv50 | Nv75 |
|---|---|---|---|---|---|---|
| hardcore (replanta na hora) — antes e depois | 1 | 1 | 1 | 2 | 6 | 39 |
| ativo (visita a cada 8 h) — antes | 1 | 2 | 3 | 7 | 23 | 155 |
| ativo — depois | 1 | 2 | 3 | 4 | 9 | 53 |
| casual (1 visita/dia) — antes | 1 | 4 | 9 | 20 | 67 | 464 |
| casual — depois | 1 | 3 | 5 | 9 | 17 | 83 |

O teto hardcore NÃO mudou (39 dias até o Nv75); a correção beneficia quem joga pouco e planta cultivos longos.

## 4. Produção por canteiro/dia (e ×4 canteiros)

| Planta | casual (1 visita) | ativo (8 h) | hardcore (teto) |
|---|---|---|---|
| Erva Medicinal | 2 (8) | 6 (24) | 24 (96) |
| Erva Energética | 3 (12) | 9 (36) | 24 (96) |
| Raiz Amarga | 1 (4) | 3 (12) | 4 (16) |
| Cogumelo Rubro | 1 (4) | 3 (12) | 6 (24) |
| Flor Carmesim | 1 (4) | 1,5 (6) | 2 (8) |

## 5. Consumo / saldo (o que sustenta cada material)

- **Erva Medicinal (96/dia hardcore):** Poção de Vida Pequena (3 cada), Pó de Refino (10 ervas → 1 pó). O pó é o sumidouro elástico: 96 ervas = 9,6 pó/dia,
  contra ~38 pó/dia de um jogador que reforja ~6 vezes/dia em equipamento T3+ (`docs/ECONOMY_AUDIT.md`, seção 21). A Horta cobre no máximo ~25% dessa demanda,
  então não há excedente estrutural.
- **Erva Energética (96/dia):** Poção do Conhecimento (+150 XP de personagem, uso manual). 32 poções/dia ≈ 4 800 XP/dia — desprezível frente aos ~70 000 XP de uma sessão de Caça de 4 h.
  Sobra de Energética só existe se o jogador escolher plantá-la além do que usa.
- **Raiz Amarga (16/dia):** 8 Elixires de Vida Maior/dia (cura 50% do PV máx, consumo automático na Masmorra/Caça).
- **Cogumelo Rubro (24/dia):** 12 Poções de Vida Grande/dia.
- **Flor Carmesim (8/dia):** 8 Elixires de Força = 4 h de +20% de dano por dia (30 min cada), além das 16 Garras. Manter o buff 24/7 exigiria 48 Flores/dia:
  a oferta impede que o buff seja permanente (guarda contra pay-to-win).

Medição relevante: em Caça, o consumo de poções é ≈ 0 para qualquer build no CP recomendado da profundidade (medido com estoque ilimitado);
só builds muito abaixo do recomendado gastam (ex.: CP 58 em Raso, 0,5 Elixir Maior/h). A demanda real de poções vem da Masmorra e NÃO foi medida aqui.

## 6. Decisões

- **Sementes: NÃO.** Plantio segue grátis. Hoje não existe fonte de semente sem criar um sistema novo (Loja/Caça/Pedidos) e o custo real já é a hora de canteiro
  (produção limitada por 4 canteiros × tempo). Só faria sentido para plantas raras/especiais futuras, abastecidas por Pedidos (ver propostas).
- **Mastery por planta: NÃO agora.** Adiciona estado por planta, UI e mais um vetor de inflação (rendimento/tempo). Proposta abaixo.
- **Canteiros: mantidos 4 abertos.** Retirar canteiros de saves existentes seria injusto e criar progressão só para saves novos gera duas classes de jogador
  sem resolver nenhum problema atual. Estratégia recomendada para depois: grandfathering (quem já joga mantém 4) + desbloqueio por Ouro/nível só para saves novos, ou
  manter 4 e progredir por Pedidos. O card "Bloqueado" já existe na UI, sem uso hoje.

## 7. Propostas (NÃO implementadas)

| Planta | Raridade | Nível | Tempo × colheita (XP) | Consumidor necessário |
|---|---|---|---|---|
| Flor Lunar | rara | 50 | 16 h × 1 (80) | um segundo buff temporizado (crítico/velocidade): exige generalizar `ActiveBuff` e a janela de buffs da Caça |
| Mandrágora | rara/endgame | 65 | 20 h × 1 (100) | receitas avançadas (ex.: catalisador) ou Pedidos |
| Lótus Ancestral | especial | 75 | 24 h × 1 (120) | Pedidos/Contratos especiais |

Sem esses consumidores elas seriam lixo acumulado, por isso ficam de fora. Consequência conhecida: acima do Nv35 a Jardinagem não libera plantas novas (a habilidade vai até o Nv75).

Mastery (proposta): "Domínio" por planta sobe com colheitas (ex.: 25/100/300); benefício pequeno e único por marco (+1 de rendimento em comuns no marco máximo,
ou −5% de tempo), sem árvore de perks. Só vale a pena quando houver planta acima do Nv35 para dar sensação de evolução.

Pedidos/Entregas (futuro): catálogo já tem material para pedidos medicinais (Erva Medicinal/Energética), alquímicos (Raiz + Cogumelo) e raros (Flor Carmesim);
Flor Lunar/Mandrágora/Lótus serviriam a contratos especiais.

## 8. Achados fora do escopo (reportados, NÃO alterados)

- **`atk_elixir` não tem efeito.** Existe como item ("+10% de dano na run atual"), é vendido na Loja por 120 ouro e dado pelo Battle Pass (3 unidades), mas nenhum código o aplica
  (não está em `MANUALLY_USABLE`, não há estado de "run" nem modificador em `BattleModal`/`combatModifiersFromSave`). Comprá-lo desperdiça ouro.
  Não corrigido porque falta definir quando ele é ativado e quando acaba ("run atual"). Correção mínima sugerida: uso manual no inventário antes de entrar na Masmorra,
  flag consumida ao terminar a run, multiplicador ×1,10 no dano do herói na Masmorra (multiplicativo com o Elixir de Força). Até lá, considerar tirá-lo da Loja.
- **Poção do Conhecimento (+150 XP fixo)** é irrelevante fora do início: o nível seguinte custa 100 × 1,15^(n−1) XP e a Caça rende dezenas de milhares por sessão.
- **Slots da Mochila:** cada material distinto ocupa 1 dos 20 slots; a Horta passa de 3 para até 5 materiais distintos.
- `sellValue` de materiais/consumíveis não é usado por nenhuma tela (não há venda).

---

# Horta 3.0 — mais plantas, canteiros, tônicos, Adubo e receitas de equipamento

Estado: implementado (commit `feat: garden 3.0 ...`). Os números vêm de `npx vitest run --config vitest.sim.config.ts professions` (seção 5), de `npm run sim` e de `npm run sim:items` (seção H). Os testes estão em `src/game/__tests__/garden3.test.ts`.

## 1. Catálogo (9 plantas)

As cinco plantas da 2.0 ficam exatamente como estavam (ids, tempos, colheitas, níveis, receitas). Novas:

| Planta (id) | Nível de Jardinagem | Tempo | Colheita | XP/colheita | Unid./canteiro-h | Consumidores |
|---|---|---|---|---|---|---|
| Cardo de Ferro (`iron_thistle`) | 10 | 3 h | +2 | 15 | 0,67 | Tônico de Pele de Pedra, Óleo de Amolar, Anel de Prata |
| Flor Dourada (`gold_blossom`) | 20 | 5 h | +1 | 25 | 0,20 | Tônico da Fortuna, Anel de Ouro, Anel de Rubi |
| Capim Veloz (`swift_grass`) | 30 | 4 h | +2 | 20 | 0,50 | Tônico de Pressa, Poção do Coletor |
| Lírio Lunar (`moon_lily`) | 45 | 10 h | +1 | 50 | 0,10 | Elixir de Precisão, Anel de Obsidiana, Anel Abissal |

XP por colheita = horas de crescimento x 5, igual para todas (a regra da 2.0 não muda). Valor de referência (`economy.ts`): cardo 6, capim 8, flor dourada 20, lírio 45 (mesma lógica de rendimento por hora das outras plantas).
Nenhuma é drop de Caça. Os quatro materiais novos têm ícone `/assets/icons/<id>.png`, nomes e descrições pt/en.

## 2. Canteiros

4 abertos no início, o 5º com Jardinagem 20 e o 6º com Jardinagem 40 (`garden.ts GARDEN_PLOT_UNLOCK_LEVELS`). O save sempre guarda 6 slots; saves antigos com 4 carregam com 6 e ganham os canteiros quando atingem o nível, sem mudar a chave do save. O cartão bloqueado mostra `garden_plot_locked.png` e "Jardinagem Nv N".
Efeito no ritmo (4 / 5 / 6 canteiros, visita a cada 12 h): Nv30 em 4 / 3 / 3 dias, Nv50 em 9 / 8 / 7, Nv60 em 16 / 13 / 11, Nv75 em 42 / 34 / 29.

## 3. Consumíveis (Alquimia, nunca na Loja)

Todos usam a mesma maquinaria de buffs (`buffs.ts` + `elixirs.ts`): um prazo de expiração por tipo, leitura a cada golpe na Masmorra, janelas de sessão na Caça (inclui o tônico tomado no meio de uma caça: vale só dali em diante) e `huntSession.tonics`. Tipos diferentes convivem; tomar o mesmo de novo renova a duração a partir de agora (custa mais uma unidade); um toque duplo em até 3 s não gasta nada.

| Item | Receita (ouro, nível do personagem) | Efeito | Duração |
|---|---|---|---|
| Tônico de Pele de Pedra | 3 Cardo de Ferro + 2 Fragmento de Osso (60, Nv10) | soma 0,10 à soma de redução da Camada 2 (assintótica: `dano/(1+soma)`) | 30 min |
| Tônico da Fortuna | 2 Flor Dourada + 2 Erva Medicinal (80, Nv20) | +20% de ouro na Caça e na Masmorra, SOMA com o `goldBonus` do equipamento (que continua com teto de 25% antes) | 60 min |
| Tônico de Pressa | 3 Capim Veloz + 2 Erva Energética (90, Nv30) | +9% de velocidade de ataque via `heroAttackIntervalMs` (piso de 400 ms) | 30 min |
| Poção do Coletor | 2 Capim Veloz + 3 Erva Medicinal (50, Nv15) | +25% de minério/madeira (e portanto de XP) na parte da sessão coberta | 2 h |
| Elixir de Precisão | 1 Lírio Lunar + 1 Cristal Corrompido (220, Nv45) | +8 pontos absolutos de crítico, teto 100% | 30 min |
| Óleo de Amolar | 2 Cardo de Ferro + 2 Farrapo de Couro (40, Nv10) | restaura 30 de 100 de durabilidade da arma E da armadura equipadas, na hora | instantâneo |
| Adubo | 3 Fragmento de Osso + 2 Erva Medicinal (25, Nv5) | num canteiro em crescimento, remove 50% do tempo RESTANTE, uma vez por plantio por canteiro | instantâneo |

O Óleo de Amolar custa 40 de ouro; o reparo da Forja custa `20 + 25 x tier` por peça, ou seja 90 (T1) a 340 (T6) para as duas. Mesmo restaurando só 30%, fica abaixo de 75% do reparo cheio em qualquer tier (teste).
O Adubo é usado no cartão do canteiro (botão "Adubar", só aparece com Adubo no inventário); o canteiro lembra que foi adubado até colher/arrancar/plantar de novo.

## 4. Equipamento que consome a Horta

Anéis: Cobre +2 Erva Medicinal, Prata +2 Cardo de Ferro, Ouro +1 Flor Dourada, Rubi +1 Flor Dourada +1 Cogumelo Rubro, Obsidiana +1 Lírio Lunar, Abissal +2 Lírio Lunar. Luvas e Botas de Couro +1 Erva Medicinal cada (curtimento). Mais: Erva Medicinal 10:1 para Pó passou a 8:1 (auditoria das profissões).
Linha do tempo medida (cenário A, dia em que a primeira peça de cada tier aparece, mediana das seeds que chegam): luvas T3 9 -> 9, botas T3 10 -> 11, anel T3 12 -> 13, elmo T3 9 -> 10; tiers 1 e 2 sem mudança (dias 3 e 5,5 a 6). Nenhum atraso acima de 1 dia: a quantidade de planta não foi reduzida.

## 5. Orçamentos medidos

- **Valor de combate (margem do duelo P, `npm run sim:items`, seção H, 4 heróis de T2 a T5):** os valores pedidos estouravam (+15% de redução: média 11,6%, +10% de velocidade: 9,3%, relação maior/menor 1,79x). Ajustados para **0,10 de redução e +9% de velocidade**: Pele de Pedra 7,7%, Pressa 8,3%, Precisão (+8 pontos, sem mudança) 6,5%; relação 1,28x (limites: 5 a 9% e 1,5x).
- **Progressão (`npm run sim`, cenário A com a política que fabrica e bebe os tônicos nas tentativas de chefe):** chefe do andar 25 primeiro vencido no dia 4 (igual ao controle sem tônicos; nenhuma seed antes do dia 3), andar 50 primeira seed no dia 10 (controle sem tônicos: dia 9; mediana 15 contra 11). Os tônicos custam ouro/osso e a política os gasta com frequência: medido, eles não aceleram a progressão. Metas T1 a T5, T7 e T8 ok.
- **Poção do Coletor:** nenhuma porta de profissão abriu mais cedo (prata dia 7 / 7, carvalho 4 / 4, ébano 13 / 12 com/sem).
- **Adubo (muda a produção por dia de um jogador que adube TODO plantio, 14 dias, Jardinagem 45):** visitas a cada 24 h ou 12 h: +0%; a cada 8 h: +100%; a cada 6 h: +100%; a cada 4 h: +50%. **Estourou o limite de ~40% nos ritmos de 3+ visitas por dia**: é uma consequência de quantização (um plantio de 12 h passa de 2 visitas para 1), não se corrige com uma percentagem menor sem matar o item (com 30% ainda dá +67% a cada 8 h). Mantido em 50% como pedido; o custo real é o limitante (25 de ouro + 3 Osso + 2 Erva por unidade, ~10 por dia nesse ritmo). Ver "decisões" abaixo.
- **Osso:** `bone_fragment` só cai na segunda zona (Pântano de Sangue, andar 26+, ~42 por hora). Pele de Pedra (2) e Adubo (3) só são fabricáveis depois disso; 12 Adubos por dia são 36 Ossos, menos de 1 hora de caça e ~10% do que a zona rende em 8 h, sem competir com as peças T3 (3 Ossos cada).

## 6. Decisões para o diretor

1. Adubo: manter 50% do restante (e aceitar +100% de produção em quem visita a cada 6 a 8 h) ou limitar a 1 por dia / reduzir para ~25% (e aí o item só ajuda quem fica no jogo a cada 3-4 h).
2. Os valores finais de Pele de Pedra (0,10) e Pressa (9%) ficam abaixo do pedido para caber na faixa de 5 a 9%.
