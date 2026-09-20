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
