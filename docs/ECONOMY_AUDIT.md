# Auditoria econômica e sinks — Arena Duel

Data: 19/09/2026. Análise do código real e execução do motor atual. Resultado: **Pacote A implementado como primeira etapa; sustentabilidade P2P ainda não demonstrada**. Sem commit, push, deploy ou blockchain.

## 1. Diagnóstico e limites da conclusão

O Modelo C já contém o excesso de emissão causado por kills muito rápidos. A lacuna atual é a demanda: equipamentos, alforje e +8 terminam; antes desta etapa, a reforja não consumia materiais. Refino (garras/sangue) é particularmente excedente; nobres também deixam de ter saída suficiente após o personagem terminar seu equipamento.

Criar consumo opcional por otimização é coerente com o jogo, mas não equivale a provar que jogadores vão utilizá-lo todo dia. Todas as taxas de adesão deste relatório são hipóteses explícitas, não telemetria. Os cenários B/C são projeções aritméticas de projetos ainda não implementados; não são playtests desses sistemas. Não foi demonstrado que todo sink possível fracassaria, portanto NÃO se recomenda reduzir a caça nesta etapa.

Reroll de atributos limitados tem demanda recorrente durante a busca, mas também satura quando o jogador fica satisfeito. Masterwork finito não resolve emissão infinita. Mercado transfere recursos entre jogadores: trade não destrói materiais. Preço de mercado não pode ser inferido apenas da razão supply/sink.

## 2. Fontes auditadas

- `src/game/huntCombat.ts`, `huntEconomy.ts`, `huntingZones.ts`, `engine.ts`, `derivedStats.ts`: geração e build real.
- `gear.ts`, `rarity.ts`, `refining.ts`, `salvage.ts`, `potions.ts`, `consumables.ts`, `gems.ts`, `huntPouch.ts`: receitas, custos e conversões.
- `dungeon.ts`, `waves.ts`, `battlepass.ts`, `quests.ts`, `expedition.ts`, `skills.ts`, `garden.ts`, `ores.ts`, `woodcutting.ts`, `inventory.ts`: fontes auxiliares e limites.
- `App.tsx`, `InventoryModal.tsx`, `ForgeModal.tsx`, `BattleModal.tsx`, `ExpeditionModal.tsx`, `legacy-arena/*`: consumidores reais e alcance das ações.

Inventário auditado: **32 materiais, 22 equipamentos/ferramentas, 16 conversões, 3 receitas de poções e 10 consumíveis**. Apêndices listam todas as entradas do catálogo, extraídas do runtime.

## 3. Modelo de emissão preservado

Para uma vitória de duração t milissegundos no subnível N:

```text
Kref = 220 / (1 + 0.08 × (N − 1))
k = 3,600,000 / t
f = min(1, sqrt(Kref/k), 1.75 × Kref/k)
p(material) = baseChance × depthMultiplier × (1 + qualityBonus × (N − 1)) × BP × f
E[unidades por vitória] = p × qty; qty = 1
E[unidades da sessão] = soma(p_i × qty_i) para vitórias completas
```

Bônus por nível adicional: Comum 0%, Refino 8%, Nobre 12%. Em N10: 1 / 1,72 / 2,08. BP = 1 ou 1,25. Profundidades (Comum / Refino / Nobre): Raso 1 / 0,7 / 0,4; Denso 1 / 1,15 / 0,9; Profundo 0,9 / 1,65 / 1,8. Aplicação econômica é por luta, não sobre kills/h médio; na região sqrt a média de f varia com críticos. Por isso foi executado o motor, sem substituir essa fórmula por uma média inventada.

Em N10, Kref = 127,907 e teto econômico = 223,837 rolls/h em tempo de vitórias. O teto não é uma taxa garantida. Mortes e lutas incompletas reduzem a emissão. Em N1 o teto é 385 rolls/h. Zonas antigas continuam produzindo, mas kills reais deixam de dar crescimento ilimitado de rolls.

Drops base, nas ordens Comum / Refino / Nobre:

| Zona | Materiais | Chances | HP base | Dano base | Cap sem BP |
|---|---|---|---:|---:|---:|
| demon_glade | scrap / claw / core | 25% / 8% / 1% | 450 (Raso: 180) | 3 (Raso: 4) | 4 h |
| blood_marsh | bone / blood / crystal | 28% / 9% / 1,5% | 1800 | 9 | 5 h |
| demon_rift | scrap / claw / core | 32% / 10,5% / 2,5% | 4800 | 19 | 6 h |
| blood_abyss | bone / blood / crystal | 35% / 12% / 3% | 7200 | 28 | 8 h |

No claim, BP pode aumentar cap para 24 h. O alforje/inventário pode perder ou reter materiais: as tabelas de emissão pressupõem espaço suficiente e contabilizam drops brutos antes de perdas. Descartes e perda por capacidade não foram contados como demanda voluntária saudável.

## 4. Método de simulação e builds reproduzíveis

Harness externo ao repo: `C:/Users/haduk/.codex/visualizations/2026/09/17/01a0ad67-6ba1-7ed2-8bd5-9c295a559b9d/economy-audit.cjs`.

Executar com Node e passar o caminho absoluto do repo como primeiro argumento. O harness carrega TypeScript real via transpileModule e fornece somente o adaptador de DebugPanel e localStorage em memória. Chama `computeHuntingStatus`, que chama `simulateHuntingSession`. Não substitui o combate, o RNG ou o Modelo C. Seeds de sessão: 1800000000000 + i × 100003, com i de 0 a 99. Cem sessões por zona/BP; 1.200 simulações, 9.600 horas simuladas. Não há acesso ao save de um jogador real.

| Perfil | Level | Arma / armadura | Refine | STR/VIT/AGI/RES | Zonas |
|---|---:|---|---:|---|---|
| MID | 50 | steel_greatsword / steel_plate | +3 | 65/40/25/20 | glade + marsh |
| LATE | 75 | dragon_flameblade / dragon_scale_armor | +6 | 100/55/40/30 | rift + abyss |
| ENDGAME | 100 | abyssal_greatblade / abyssal_bulwark | +8 | 135/65/60/40 | rift + abyss |

Todos: Profundo N10 já conquistado; gates de dungeon/CP pressupostos desbloqueados; durabilidade 100; sem buff, lifesteal ou poções; raridade comum para isolar a base e não depender de rolls favoráveis. MID: 2 rubis na arma e 2 safiras na armadura; LATE/END: 3+3. São referências de emissão, não personagens candidatos a reforja (essa exige raridade não comum). O número de rolls de reforja abaixo representa adesão da população que dispõe de itens elegíveis. Uma população com menos itens elegíveis consumirá menos.

Não se somam 8 h em cada zona: cada personagem divide 8 h em 4 h por família; com BP, 24 h em 12 h por família. A troca de caça no código mantém drops da sessão anterior no pouch. Os cenários usam sessões separadas com o mesmo build e mastery; não incluem XP ganho durante a jornada. N10 é estado estacionário; as primeiras sessões N1..N9 terão outra produção.

## 5. Emissão por hora, 8 h/dia e 24 h/dia BP

“/h da zona” é a taxa enquanto caça aquela família. As colunas diárias já repartem o tempo 50/50 entre as duas zonas.

| Perfil | Material | /h sem BP | /dia 8 h total | /h BP | /dia 24 h total BP |
|---|---|---:|---:|---:|---:|
| MID | leather_scrap | 50.17 | 200.67 | 62.86 | 754.26 |
| MID | bone_fragment | 33.71 | 134.84 | 42.56 | 510.72 |
| MID | demon_claw | 51.43 | 205.71 | 63.59 | 763.11 |
| MID | concentrated_blood | 34.48 | 137.92 | 43.40 | 520.86 |
| MID | demon_core | 8.46 | 33.84 | 10.57 | 126.86 |
| MID | corrupted_crystal | 7.41 | 29.63 | 9.43 | 113.19 |
| LATE | leather_scrap | 38.51 | 154.05 | 47.70 | 572.44 |
| LATE | bone_fragment | 29.38 | 117.51 | 36.78 | 441.35 |
| LATE | demon_claw | 39.42 | 157.68 | 49.67 | 596.05 |
| LATE | concentrated_blood | 31.70 | 126.81 | 39.78 | 477.31 |
| LATE | demon_core | 12.22 | 48.86 | 15.36 | 184.29 |
| LATE | corrupted_crystal | 10.37 | 41.46 | 12.99 | 155.88 |
| ENDGAME | leather_scrap | 58.40 | 233.59 | 72.48 | 869.72 |
| ENDGAME | bone_fragment | 52.06 | 208.26 | 65.06 | 780.78 |
| ENDGAME | demon_claw | 60.09 | 240.35 | 75.30 | 903.63 |
| ENDGAME | concentrated_blood | 56.94 | 227.75 | 70.83 | 849.96 |
| ENDGAME | demon_core | 18.74 | 74.96 | 23.42 | 281.05 |
| ENDGAME | corrupted_crystal | 18.64 | 74.57 | 23.60 | 283.19 |

Tempo vitorioso medido >99,8% nos cenários. São builds suficientes para essas lutas. As taxas menores de LATE versus MID em alguns materiais refletem a mudança para monstros mais resistentes. Não indicam regressão de poder do personagem.

Hipótese populacional: 50% MID, 30% LATE, 20% ENDGAME; metade do tempo em cada família. Composição é cenário de análise, não distribuição observada. Também modelamos um mix de 80% desses jogadores em 8 h sem BP e 20% em 24 h com BP; variar adesão BP muda fortemente o saldo.

| Material | Média/dia 8 h | Média/dia 24 h BP | Mix 80/20 |
|---|---:|---:|---:|
| leather_scrap | 193.27 | 722.81 | 299.18 |
| bone_fragment | 144.32 | 543.92 | 224.24 |
| demon_claw | 198.23 | 741.10 | 306.80 |
| concentrated_blood | 152.55 | 573.62 | 236.77 |
| demon_core | 46.57 | 174.93 | 72.24 |
| corrupted_crystal | 42.17 | 160.00 | 65.73 |

## 6. Demanda de carreira: definição e recálculo

“Carreira inteira” não é uma constante do código. Um jogador pode pular upgrades, colecionar tudo, recraftar raridade ou parar antes do +8. Foram separados dois caminhos:

1. **Par final + alforje máximo:** produzir as duas peças abyssal, todos os pré-requisitos e alforje, uma vez. Não inclui coleção de relíquias/ramo dourado nem +8 de intermediários.
2. **Coleção bruta:** uma cópia final de cada uma das 17 receitas de gear (14 peças de combate + 3 relíquias), recompondo recursivamente os itens consumidos e incluindo todos os tiers do alforje. Não desconta Battle Pass/salvage e não trata um item usado em duas receitas como se sobrevivesse às duas.

Conversões expandidas até materiais brutos. Dust não é atribuído a um comum específico porque há quatro matérias-primas substitutas.

| Material | Par final + alforje | Coleção bruta | Coleção +8 em todas as 14 peças, sem catalisador | Mesma coleção com catalisador nas etapas de falha |
|---|---:|---:|---:|---:|
| leather_scrap | 121 | 385 | 385 + parcela do Dust | 385 + parcela do Dust |
| bone_fragment | 6 | 30 | 30 + parcela do Dust | 30 + parcela do Dust |
| demon_claw | 2 | 10 | 10 | 10 |
| concentrated_blood | 8 | 17 | 17 | 17 |
| demon_core | 25 | 81 | 283,86 | 177 |
| corrupted_crystal | 24 | 79 | 281,86 | 175 |

Os 385 scraps, 30 ossos, 10 garras e 17 sangues anteriores são reproduzidos pela definição de coleção bruta. **268/266 nobres não foram reproduzidos** com essa hipótese: quatro peças T4 × 50,714 nobres de cada família por +8 dão 202,857 extras; somados a 81/79, resultam em 283,857/281,857. Com catalisadores, 4 × 24 extras resultam em 177/175. O par final pode dispensar todos os refinos intermediários T4; nobres gastos no +8 de T6 são zero (T6 pede obsidiana refinada).

Dust de +8: 49,524 por peça em esperança sem catalisador, 20 com garantia. Nas 14 peças: 693,333 versus 280 Dust, equivalentes a 6.933,33 versus 2.800 comuns. Isso é finito. Se dividido igualmente entre scrap/osso, coleção+8 sem catalisador consome 3.851,67 scraps e 3.496,67 ossos; se vier de cobre/erva, o consumo dos dois drops de caça é zero. Não contar a conversão e o gasto do Dust duas vezes.

## 7. Dias para financiar carreira e classificação

Critério operacional desta auditoria: comparar demanda finita remanescente com 30 dias da emissão do cenário. Menos de 7 dias e ausência de sink recorrente significativo = EXTREMAMENTE EXCEDENTE; 7–30 dias e baixa absorção = EXCEDENTE; absorção recorrente voluntária de 50–80% com estoque de 7–30 dias pode ser SAUDÁVEL; consumo desejado sustentado > emissão e estoques em queda = DEFICITÁRIO. Não há material saudável por decreto, e sem dados de uso as classes são condicionais ao cenário.

| Material | Demanda de referência | Dias na média 8 h | Dias na média BP | Classe antes dos novos sinks |
|---|---:|---:|---:|---|
| leather_scrap | 385.00 | 1.99 | 0.53 | EXTREMAMENTE EXCEDENTE |
| bone_fragment | 30.00 | 0.21 | 0.06 | EXTREMAMENTE EXCEDENTE |
| demon_claw | 10.00 | 0.05 | 0.01 | EXTREMAMENTE EXCEDENTE |
| concentrated_blood | 17.00 | 0.11 | 0.03 | EXTREMAMENTE EXCEDENTE |
| demon_core | 283.86 | 6.10 | 1.62 | EXTREMAMENTE EXCEDENTE |
| corrupted_crystal | 281.86 | 6.68 | 1.76 | EXTREMAMENTE EXCEDENTE |

Comuns acima excluem Dust substituível; no cenário de 100% do Dust vindo da caça, dividido 50/50, scrap/osso passam a ~19,93/24,23 dias no perfil populacional 8 h: **EXCEDENTE** durante essa carreira. Com BP, caem para ~5,33/6,43 dias. Depois do +8, o estoque volta a crescer sem esse gasto. Nobres sem catalisador são uma referência generosa de demanda; a rota mínima satura ainda antes. Dias separados não significam que o jogador desbloqueie o equipamento nesse prazo: nível, dungeon, ouro e profissões continuam gates.

## 8. Sinks existentes: finitos e recorrentes

| Sistema | O que consome | Finito ou recorrente de fato? |
|---|---|---|
| Craft hierárquico | Gold, materiais, peças prévias, gems, shards | Finito para progressão; recraft por raridade é opcional, caro e limitado pela satisfação |
| Refine +0..+8 | Gold, ferro/aço/escamas/obsidiana refinada, Dust, shards | Finito por gearId; refino persiste por tipo de item |
| Alforje T2..T4 | 4.300 gold, 20 scraps, 15 leather, 10 iron, 5 cores | Finito; 15 leather = 45 scraps adicionais |
| Conversões | Minérios, madeiras, caça ou ervas + Gold | Transformação; só vira sink econômico final ao consumir output em utilidade |
| Reforge antigo | 1 shard + ouro escalonado | Recorrente enquanto houver busca; zero materiais antes desta implementação |
| Reparos | 20 + 25 × tier Gold; blessed opcional 1 shard | Recorrente; sem materiais. BP desconto 20% |
| Socket/unsocket | Gems ou devolução de gems | Imobilização reversível, não queima permanente |
| Poções HP da loja | Gold | Recorrente, mas sem materiais de caça |
| greater_elixir | 2 roots + 100 Gold | Recorrente; jardim é gargalo |
| strength_elixir | 1 flower + 2 claws + 250 Gold | Recorrente limitado pelo jardim; 30 min, +20% dano |
| xp_potion | 3 herbs + 30 Gold | Recorrente enquanto XP importa; 150 XP é muito pequeno frente a expedições |
| Dungeon | Sessão extra 5 shards; poções; reparo posterior | Recorrente de moedas/consumíveis; não gasta materiais de caça diretamente |
| Elite | Poções se necessárias, tempo de batalha | Não tem taxa de material; produz gemas, shards e catalyst repetíveis |
| Battle Pass | Não cobra materiais para ativação/claim | Faucet; nove catalysts premium e materiais/cosméticos. Renovar não reseta trilha/claims hoje |
| Expedições | Tempo, opcional ticket | Faucet de Gold/XP/shard, não consome materiais |
| Arena legada | Poções antigas/stamina durante duelo | Componente não montado pelo App atual; não contar como sink ativo |
| Descartar/overflow | Material/item perdido | Queima técnica, não utilidade desejável nem hipótese de consumo |

O jardim tem **quatro** slots no engine, apesar de comentário antigo mencionar slot único. Só flores: 4 × 2 colheitas/dia = 8 flores e no máximo 16 garras/dia, exigindo 2.000 gold para fabricar 8 elixires. Só roots: 16/dia = 8 greater_elixirs; só herbs: 96/dia = 32 XP potions. Estes máximos competem entre si pelos mesmos quatro slots.

Mineração/madeira: poder = 5 + 0,75 × skill level; level75 = 61,25 unidades/h, 76,5625/h com BP. 8 h dedicadas = 490, 24 h BP = 1.837,5 unidades de UM material escolhido. Não somar mineração, madeira e caça como três atividades simultâneas: handlers restringem a atividade principal. Profissões não têm mais upgrades de ferramentas como sinks. Minérios/madeiras altos também acumulam após craft/refine terminar.

`atk_elixir`: está na loja e nas recompensas, mas não tem uso no jogo ativo. Não contabilizado como sink útil. `ring_vitality` e `amulet_swiftness` possuem efeitos usados no duelo legado; `berserker_crest` entra no critMult do engine, mas inventário atual não inclui relic em EQUIPPABLE_SLOTS. Não usar relíquias como pressuposto de adesão econômica sem resolver acesso/efeitos.

## 9. Salvage: comparação e implementação

Antes: max(1, floor(0,45 × q)). Depois: floor(0,45 × q), omitindo entradas zero. O bônus independente de raridade continua: rare 15%, epic 30%, legendary 50% de chance de um bônus, metade essence e metade gema aleatória. Esperança de essence em legendary = 0,25 por desmontagem. Gold, gear pré-requisito, shards, sockets e refine não são devolvidos pela receita de salvage. Portanto recuperar 100% de um ingrediente não era recuperar 100% do custo inteiro.

| Quantidade q na receita | Retorno antigo | A: sem mínimo (implementado) | B: binomial(q,45%) esperado | C: comum45% / Refino10% / Nobre0% esperado |
|---:|---:|---:|---:|---|
| 1 | 1 | 0 | 0,45 | 0,45 / 0,10 / 0 |
| 2 | 1 | 0 | 0,90 | 0,90 / 0,20 / 0 |
| 3 | 1 | 1 | 1,35 | 1,35 / 0,30 / 0 |
| 5 | 2 | 2 | 2,25 | 2,25 / 0,50 / 0 |

Comparação analítica exata, não RNG amostrado. Para 100 crafts+salvages de steel_greatsword: o ingrediente direto demon_claw voltava 100 vezes (sink líquido zero nesse ingrediente); agora volta zero (100 claws consumidos). Cada sword ainda custa suas peças ancestrais e gold. B suavizaria lotes pequenos mas permitiria recuperação total ocasional e mais variância. C requer classificar ingredientes intermediários e pode concentrar carga demais nos nobres. A é pequena, previsível e a preview bate com o cálculo real. Ela não é apresentada como grande sink diário: depende de recrafts voluntários.

## 10. Catalisadores: efeito quantificado

Chance por tentativa de +1..+8: 100%,100%,100%,80%,70%,60%,45%,30%. Não há downgrade/destruição por falha. E[tentativas] = 1/p. Catalyst garante sucesso, mas continua cobrando o custo de UMA tentativa; não elimina os sinks de base.

| Custo para +0→+8 de uma peça | Sem catalyst (esperança) | Com garantia nas 5 etapas probabilísticas | Redução |
|---|---:|---:|---:|
| Gold direto | 16.288,10 | 7.050 | 56,72% |
| Dust | 49,524 | 20 | 59,62% |
| Shards | 11,111 | 4 | 64% |
| Material de tier T1–T4 | 25,357 | 12 | 52,68% |
| refined_obsidian em T5/T6 | 9,901 | 5 | 49,50% |

Conversão adiciona Gold: em T4, 25,357 escamas ×400 = 10.142,86 Gold, versus 4.800 com garantia. Total refine+produção das escamas: 26.430,95 versus 11.850. Cada escama exige 2 cores +2 crystals. Em T3, cada steel ainda exige5 iron +30Gold. Essas despesas não estão embutidas na primeira linha da tabela.

Fontes: premium BP 9 por trilha; first clears elite 2+4+6+10=22; repetição elite25=0, elite50=1, elite75=1, elite100=2 por vitória. Não existe cap diário, portanto C/dia = vitórias/dia × recompensa. Ex.: 20 vitórias de elite100 =40 catalysts, suficientes para garantir as 5 etapas probabilísticas de oito peças. Se uma vitória+retorno à luta leva 60 s, são120 catalysts/h; 30 s dá240/h; 120 s dá60/h. São cenários de duração, não benchmarks da UI. Elite não é instantâneo: BattleModal resolve ataques ao longo do tempo.

Ação proposta, não aplicada: testar limite global de 2 catalysts de recompensa repetível/dia, preservando loot de gemas/shards e first clears; controlar com relógio do servidor antes de P2P. Alternativa: bônus parcial de chance; altera muito o valor dos catalysts existentes. Preferência pelo cap de emissão, sem remover inventário, porque preserva o efeito conhecido. Não incluí consumo por falhas restauradas nas projeções de longo prazo: refino continua finito mesmo com cap.

## 11. Reforge, raridade e otimização limitada

Raridades: common60% (0 substats), rare25%(1), epic12%(2; ×1,05 nos stats base), legendary3%(3; ×1,15). A reforja preserva a raridade e sorteia todos os substats sem repetição de tipo, dentro dos intervalos atuais. Não cria quarto atributo nem aumenta os tetos.

T6: critRate5–8%; critDamage11–18%; lifesteal3–6%; defense5–9%; HP45–70; goldBonus6–11%. Uma combinação específica de 3 tipos em legendary tem chance 1/C(6,3)=1/20 por reroll. Se desejar também máximo de critRate/critDamage/lifesteal: 1/(20×4×8×4)=1/2560, expectativa 2.560 tentativas. Isso não é meta obrigatória recomendada; mostra a cauda da otimização. Com p=1/20, quatro tentativas/dia dão expectativa de5dias para aquela combinação; após obtê-la, o uso pode cessar. Pity ou lock reduz essa expectativa, logo também reduz consumo por objetivo.

Instâncias: inventory guarda quantidade por id; itemRarity/itemSubstats/upgrades também usam id. Forge de outra cópia sobrescreve os atributos do mesmo tipo. Reforge afeta todas as cópias. UI agora informa isso. Não implementar marketplace de gear individual nesse schema. Migrar para instanceId antes de candidatos pendentes, lock persistente, venda individual ou Masterwork por peça.

## 12. Pacote A — conservador, escolhido e implementado parcialmente no escopo descrito

Reaproveita reroll de todos os atributos. T1–T2:2Dust +6Refino + custo de gold atual +1shard. T3–T6:6Dust +24Refino +2Nobres +gold atual +1shard. Armas usam claw/core; armaduras blood/crystal. Cada jogador pode alternar arma/armadura conforme a build, sem taxa diária obrigatória. Dust mantém conversão10:1. Não há aumento de poder máximo. Nenhuma cobrança para apenas usar equipamento ou fazer +8.

Gold por contagem:10,25,50,90,150,240,360,500; depois permanece500. A simulação de longa duração usa500, não o desconto inicial. Quatro tentativas endgame/dia:240 comuns-equivalentes,96Refino,8Nobres,2.000Gold e4shards. Isso representa ~24min de produção de Refino da família em endgame Profundo sem BP por tentativa (24/60≈0,4h na zona rift; na média das duas famílias ≈24,6min), e ~6,4min de produção de Nobre naquela zona. Não obriga casual a otimizar continuamente.

Salvage sem mínimo implementado. Cap de catalysts, correção de atk_elixir e refactor de instâncias ficam propostos, não aplicados nesta primeira etapa. A resolve a ausência total de materiais na reforja e o retorno unitário integral; **não resolve todo o excedente**, como as tabelas mostram.

## 13. Pacote B — intermediário, somente proposta

Adicionar reroll de um atributo selecionado, excluindo tipos presentes nos demais slots. Manter teto de3 atributos e intervalos atuais. Operação de referência:6Dust +24Refino +4Nobres +150Gold +1shard. O custo menor de Gold é uma proposta explícita para permitir uso recorrente; não foi aplicado. Bloquear um atributo significa preservar um existente, não adicionar poder; em item com um único substat, o modo lock de um deve ser indisponível. Seleção de candidato antigo/novo evitaria perda inesperada, mas exige transação pendente idempotente e instâncias de gear.

Consumo endgame hipotético6operações/dia:360comuns,144Refino,24Nobres,900Gold. Adesão modelada MID0,5/LATE3/END6 por dia, incluindo quem não usa. Cap de catalysts proposto igual ao A. Nenhuma ascensão nesta versão. Melhora a decisão, mas não prova60% de absorção de nobres.

## 14. Pacote C — endgame profundo, somente proposta

Base de instâncias + presets de build + atributos selecionáveis/enchants e desafios de especialização. Budget de referência por operação:8Dust +30Refino +5Nobres +150Gold +1shard. Adesão MID1/LATE4/END8/dia. Endgame:640comuns,240Refino,40Nobres,1.200Gold. É uma hipótese otimista de procura voluntária, não uma taxa exigida do usuário.

Masterwork I/II/III em peça+8: custos por família da peça, respectivamente20/40/80Dust,60/120/240Refino,8/16/32Nobres,1.000/2.000/4.000Gold,5/10/20shards. Total por peça:140Dust,420Refino,56Nobres,7.000Gold,35shards. Requer conquistas pessoais de desafio para cada etapa, não compráveis; materiais negociáveis não substituem essas conquistas. Proposta de benefício: +1% por etapa APENAS no valor-base de dano/HP do item, total+3%; não multiplica STR/gemas nem adiciona crítico/velocidade. Isso ainda altera CP indiretamente e precisaria de testes de matchups; não implementado. Alternativa de especialização lateral é preferível a ampliar stats a cada temporada.

Para duas peças, Masterwork consome2.800comuns,840Refino,112Nobres no total. Amortizado em90dias:31,11comuns,9,33Refino,1,24Nobres/dia. Após90dias esse fluxo cessa. Para não mascarar déficit recorrente, as tabelas steady-state excluem esse consumo finito; use esses números apenas na coorte que ainda está ascendendo.

Consumíveis propostos para o pacote C: preparação ofensiva e defensiva mutuamente exclusivas,15min de combate de dungeon, custo sugerido12Refino +10comuns +40Gold por carga, no máximo+5% dano OU +5%HP enquanto ativo. Sem bônus de drop, sem empilhar com Strength, sem uso obrigatório na caça24/7. Uma a quatro cargas/dia consomem12–48Refino e10–40comuns, não centenas. Não foi somado às tabelas sem hipótese de uso comprovada. No código atual buffs da caça são avaliados no instante do claim e aplicados retroativamente à simulação inteira: corrigir contabilização temporal antes de criar novos buffs de caça ou contar30min como30min reais de efeito.

## 15. Simulação de supply − sink

Cenários steady-state pós-carreira: não somam custos de craft/+8 de novos jogadores. Hipóteses por perfil: A0,5/2/4, B0,5/3/6, C1/4/8 operações/dia. Médias50/30/20%:1,65 /2,35 /3,30 operações por jogador/dia. Metade em armas, metade em armaduras. T3+ nas tabelas. Mesma frequência com ou sem BP para mostrar o risco de mais tempo offline não significar mais decisões de gasto. Zero adesão implica zero consumo; se adesão cai50%, consumo cai50%.

Dust é convertido integralmente de scrap/osso (50/50) nesta hipótese: é um **limite otimista de absorção desses dois comuns**, não garantia. Se 50% vier de cobre/erva, consumo de scrap/osso cai pela metade. Não há BP que multiplique custos.

### Pacote A, 8h

| Material | Produção/jogador/dia | Consumo/jogador/dia | Saldo/jogador/dia | Consumo/emissão |
|---|---:|---:|---:|---:|
| leather_scrap | 193.27 | 49.50 | 143.77 | 25.61% |
| bone_fragment | 144.32 | 49.50 | 94.82 | 34.30% |
| demon_claw | 198.23 | 19.80 | 178.43 | 9.99% |
| concentrated_blood | 152.55 | 19.80 | 132.75 | 12.98% |
| demon_core | 46.57 | 1.65 | 44.92 | 3.54% |
| corrupted_crystal | 42.17 | 1.65 | 40.52 | 3.91% |
| **Comum total** | 337.59 | 99.00 | 238.59 | 29.33% |
| **Refino total** | 350.78 | 39.60 | 311.18 | 11.29% |
| **Nobre total** | 88.74 | 3.30 | 85.44 | 3.72% |

### Pacote A, 24hBP

| Material | Produção/jogador/dia | Consumo/jogador/dia | Saldo/jogador/dia | Consumo/emissão |
|---|---:|---:|---:|---:|
| leather_scrap | 722.81 | 49.50 | 673.31 | 6.85% |
| bone_fragment | 543.92 | 49.50 | 494.42 | 9.10% |
| demon_claw | 741.10 | 19.80 | 721.30 | 2.67% |
| concentrated_blood | 573.62 | 19.80 | 553.82 | 3.45% |
| demon_core | 174.93 | 1.65 | 173.28 | 0.94% |
| corrupted_crystal | 160.00 | 1.65 | 158.35 | 1.03% |
| **Comum total** | 1266.73 | 99.00 | 1167.73 | 7.82% |
| **Refino total** | 1314.71 | 39.60 | 1275.11 | 3.01% |
| **Nobre total** | 334.92 | 3.30 | 331.62 | 0.99% |

### Pacote B, 8h

| Material | Produção/jogador/dia | Consumo/jogador/dia | Saldo/jogador/dia | Consumo/emissão |
|---|---:|---:|---:|---:|
| leather_scrap | 193.27 | 70.50 | 122.77 | 36.48% |
| bone_fragment | 144.32 | 70.50 | 73.82 | 48.85% |
| demon_claw | 198.23 | 28.20 | 170.03 | 14.23% |
| concentrated_blood | 152.55 | 28.20 | 124.35 | 18.49% |
| demon_core | 46.57 | 4.70 | 41.87 | 10.09% |
| corrupted_crystal | 42.17 | 4.70 | 37.47 | 11.15% |
| **Comum total** | 337.59 | 141.00 | 196.59 | 41.77% |
| **Refino total** | 350.78 | 56.40 | 294.38 | 16.08% |
| **Nobre total** | 88.74 | 9.40 | 79.34 | 10.59% |

### Pacote B, 24hBP

| Material | Produção/jogador/dia | Consumo/jogador/dia | Saldo/jogador/dia | Consumo/emissão |
|---|---:|---:|---:|---:|
| leather_scrap | 722.81 | 70.50 | 652.31 | 9.75% |
| bone_fragment | 543.92 | 70.50 | 473.42 | 12.96% |
| demon_claw | 741.10 | 28.20 | 712.90 | 3.81% |
| concentrated_blood | 573.62 | 28.20 | 545.41 | 4.92% |
| demon_core | 174.93 | 4.70 | 170.23 | 2.69% |
| corrupted_crystal | 160.00 | 4.70 | 155.30 | 2.94% |
| **Comum total** | 1266.73 | 141.00 | 1125.73 | 11.13% |
| **Refino total** | 1314.71 | 56.40 | 1258.31 | 4.29% |
| **Nobre total** | 334.92 | 9.40 | 325.52 | 2.81% |

### Pacote C, 8h

| Material | Produção/jogador/dia | Consumo/jogador/dia | Saldo/jogador/dia | Consumo/emissão |
|---|---:|---:|---:|---:|
| leather_scrap | 193.27 | 132.00 | 61.27 | 68.30% |
| bone_fragment | 144.32 | 132.00 | 12.32 | 91.46% |
| demon_claw | 198.23 | 49.50 | 148.73 | 24.97% |
| concentrated_blood | 152.55 | 49.50 | 103.05 | 32.45% |
| demon_core | 46.57 | 8.25 | 38.32 | 17.72% |
| corrupted_crystal | 42.17 | 8.25 | 33.92 | 19.57% |
| **Comum total** | 337.59 | 264.00 | 73.59 | 78.20% |
| **Refino total** | 350.78 | 99.00 | 251.78 | 28.22% |
| **Nobre total** | 88.74 | 16.50 | 72.24 | 18.59% |

### Pacote C, 24hBP

| Material | Produção/jogador/dia | Consumo/jogador/dia | Saldo/jogador/dia | Consumo/emissão |
|---|---:|---:|---:|---:|
| leather_scrap | 722.81 | 132.00 | 590.81 | 18.26% |
| bone_fragment | 543.92 | 132.00 | 411.92 | 24.27% |
| demon_claw | 741.10 | 49.50 | 691.60 | 6.68% |
| concentrated_blood | 573.62 | 49.50 | 524.12 | 8.63% |
| demon_core | 174.93 | 8.25 | 166.68 | 4.72% |
| corrupted_crystal | 160.00 | 8.25 | 151.75 | 5.16% |
| **Comum total** | 1266.73 | 264.00 | 1002.73 | 20.84% |
| **Refino total** | 1314.71 | 99.00 | 1215.71 | 7.53% |
| **Nobre total** | 334.92 | 16.50 | 318.42 | 4.93% |

### Escala populacional — produção/consumo/saldo por dia

Cada célula mostra **P / C / saldo** em unidades de materiais. Escalar N jogadores mantém a razão C/P se perfil e comportamento forem iguais. Não é uma simulação de preços nem de crescimento de usuários. Arredondamento em duas casas por célula.

**A — 8h**

| Material | 1.000 jogadores: P / C / saldo | 10.000: P / C / saldo | 100.000: P / C / saldo |
|---|---:|---:|---:|
| leather_scrap | 193268.00 / 49500.00 / 143768.00 | 1932680.00 / 495000.00 / 1437680.00 | 19326800.00 / 4950000.00 / 14376800.00 |
| bone_fragment | 144325.00 / 49500.00 / 94825.00 | 1443250.00 / 495000.00 / 948250.00 | 14432500.00 / 4950000.00 / 9482500.00 |
| demon_claw | 198229.00 / 19800.00 / 178429.00 | 1982290.00 / 198000.00 / 1784290.00 | 19822900.00 / 1980000.00 / 17842900.00 |
| concentrated_blood | 152553.00 / 19800.00 / 132753.00 | 1525530.00 / 198000.00 / 1327530.00 | 15255300.00 / 1980000.00 / 13275300.00 |
| demon_core | 46570.00 / 1650.00 / 44920.00 | 465700.00 / 16500.00 / 449200.00 | 4657000.00 / 165000.00 / 4492000.00 |
| corrupted_crystal | 42167.00 / 1650.00 / 40517.00 | 421670.00 / 16500.00 / 405170.00 | 4216700.00 / 165000.00 / 4051700.00 |
| Comum total | 337593.00 / 99000.00 / 238593.00 | 3375930.00 / 990000.00 / 2385930.00 | 33759300.00 / 9900000.00 / 23859300.00 |
| Refino total | 350782.00 / 39600.00 / 311182.00 | 3507820.00 / 396000.00 / 3111820.00 | 35078200.00 / 3960000.00 / 31118200.00 |
| Nobre total | 88737.00 / 3300.00 / 85437.00 | 887370.00 / 33000.00 / 854370.00 | 8873700.00 / 330000.00 / 8543700.00 |

**A — 24hBP**

| Material | 1.000 jogadores: P / C / saldo | 10.000: P / C / saldo | 100.000: P / C / saldo |
|---|---:|---:|---:|
| leather_scrap | 722806.00 / 49500.00 / 673306.00 | 7228060.00 / 495000.00 / 6733060.00 | 72280600.00 / 4950000.00 / 67330600.00 |
| bone_fragment | 543921.00 / 49500.00 / 494421.00 | 5439210.00 / 495000.00 / 4944210.00 | 54392100.00 / 4950000.00 / 49442100.00 |
| demon_claw | 741096.00 / 19800.00 / 721296.00 | 7410960.00 / 198000.00 / 7212960.00 | 74109600.00 / 1980000.00 / 72129600.00 |
| concentrated_blood | 573615.00 / 19800.00 / 553815.00 | 5736150.00 / 198000.00 / 5538150.00 | 57361500.00 / 1980000.00 / 55381500.00 |
| demon_core | 174927.00 / 1650.00 / 173277.00 | 1749270.00 / 16500.00 / 1732770.00 | 17492700.00 / 165000.00 / 17327700.00 |
| corrupted_crystal | 159997.00 / 1650.00 / 158347.00 | 1599970.00 / 16500.00 / 1583470.00 | 15999700.00 / 165000.00 / 15834700.00 |
| Comum total | 1266727.00 / 99000.00 / 1167727.00 | 12667270.00 / 990000.00 / 11677270.00 | 126672700.00 / 9900000.00 / 116772700.00 |
| Refino total | 1314711.00 / 39600.00 / 1275111.00 | 13147110.00 / 396000.00 / 12751110.00 | 131471100.00 / 3960000.00 / 127511100.00 |
| Nobre total | 334924.00 / 3300.00 / 331624.00 | 3349240.00 / 33000.00 / 3316240.00 | 33492400.00 / 330000.00 / 33162400.00 |

**B — 8h**

| Material | 1.000 jogadores: P / C / saldo | 10.000: P / C / saldo | 100.000: P / C / saldo |
|---|---:|---:|---:|
| leather_scrap | 193268.00 / 70500.00 / 122768.00 | 1932680.00 / 705000.00 / 1227680.00 | 19326800.00 / 7050000.00 / 12276800.00 |
| bone_fragment | 144325.00 / 70500.00 / 73825.00 | 1443250.00 / 705000.00 / 738250.00 | 14432500.00 / 7050000.00 / 7382500.00 |
| demon_claw | 198229.00 / 28200.00 / 170029.00 | 1982290.00 / 282000.00 / 1700290.00 | 19822900.00 / 2820000.00 / 17002900.00 |
| concentrated_blood | 152553.00 / 28200.00 / 124353.00 | 1525530.00 / 282000.00 / 1243530.00 | 15255300.00 / 2820000.00 / 12435300.00 |
| demon_core | 46570.00 / 4700.00 / 41870.00 | 465700.00 / 47000.00 / 418700.00 | 4657000.00 / 470000.00 / 4187000.00 |
| corrupted_crystal | 42167.00 / 4700.00 / 37467.00 | 421670.00 / 47000.00 / 374670.00 | 4216700.00 / 470000.00 / 3746700.00 |
| Comum total | 337593.00 / 141000.00 / 196593.00 | 3375930.00 / 1410000.00 / 1965930.00 | 33759300.00 / 14100000.00 / 19659300.00 |
| Refino total | 350782.00 / 56400.00 / 294382.00 | 3507820.00 / 564000.00 / 2943820.00 | 35078200.00 / 5640000.00 / 29438200.00 |
| Nobre total | 88737.00 / 9400.00 / 79337.00 | 887370.00 / 94000.00 / 793370.00 | 8873700.00 / 940000.00 / 7933700.00 |

**B — 24hBP**

| Material | 1.000 jogadores: P / C / saldo | 10.000: P / C / saldo | 100.000: P / C / saldo |
|---|---:|---:|---:|
| leather_scrap | 722806.00 / 70500.00 / 652306.00 | 7228060.00 / 705000.00 / 6523060.00 | 72280600.00 / 7050000.00 / 65230600.00 |
| bone_fragment | 543921.00 / 70500.00 / 473421.00 | 5439210.00 / 705000.00 / 4734210.00 | 54392100.00 / 7050000.00 / 47342100.00 |
| demon_claw | 741096.00 / 28200.00 / 712896.00 | 7410960.00 / 282000.00 / 7128960.00 | 74109600.00 / 2820000.00 / 71289600.00 |
| concentrated_blood | 573615.00 / 28200.00 / 545415.00 | 5736150.00 / 282000.00 / 5454150.00 | 57361500.00 / 2820000.00 / 54541500.00 |
| demon_core | 174927.00 / 4700.00 / 170227.00 | 1749270.00 / 47000.00 / 1702270.00 | 17492700.00 / 470000.00 / 17022700.00 |
| corrupted_crystal | 159997.00 / 4700.00 / 155297.00 | 1599970.00 / 47000.00 / 1552970.00 | 15999700.00 / 470000.00 / 15529700.00 |
| Comum total | 1266727.00 / 141000.00 / 1125727.00 | 12667270.00 / 1410000.00 / 11257270.00 | 126672700.00 / 14100000.00 / 112572700.00 |
| Refino total | 1314711.00 / 56400.00 / 1258311.00 | 13147110.00 / 564000.00 / 12583110.00 | 131471100.00 / 5640000.00 / 125831100.00 |
| Nobre total | 334924.00 / 9400.00 / 325524.00 | 3349240.00 / 94000.00 / 3255240.00 | 33492400.00 / 940000.00 / 32552400.00 |

**C — 8h**

| Material | 1.000 jogadores: P / C / saldo | 10.000: P / C / saldo | 100.000: P / C / saldo |
|---|---:|---:|---:|
| leather_scrap | 193268.00 / 132000.00 / 61268.00 | 1932680.00 / 1320000.00 / 612680.00 | 19326800.00 / 13200000.00 / 6126800.00 |
| bone_fragment | 144325.00 / 132000.00 / 12325.00 | 1443250.00 / 1320000.00 / 123250.00 | 14432500.00 / 13200000.00 / 1232500.00 |
| demon_claw | 198229.00 / 49500.00 / 148729.00 | 1982290.00 / 495000.00 / 1487290.00 | 19822900.00 / 4950000.00 / 14872900.00 |
| concentrated_blood | 152553.00 / 49500.00 / 103053.00 | 1525530.00 / 495000.00 / 1030530.00 | 15255300.00 / 4950000.00 / 10305300.00 |
| demon_core | 46570.00 / 8250.00 / 38320.00 | 465700.00 / 82500.00 / 383200.00 | 4657000.00 / 825000.00 / 3832000.00 |
| corrupted_crystal | 42167.00 / 8250.00 / 33917.00 | 421670.00 / 82500.00 / 339170.00 | 4216700.00 / 825000.00 / 3391700.00 |
| Comum total | 337593.00 / 264000.00 / 73593.00 | 3375930.00 / 2640000.00 / 735930.00 | 33759300.00 / 26400000.00 / 7359300.00 |
| Refino total | 350782.00 / 99000.00 / 251782.00 | 3507820.00 / 990000.00 / 2517820.00 | 35078200.00 / 9900000.00 / 25178200.00 |
| Nobre total | 88737.00 / 16500.00 / 72237.00 | 887370.00 / 165000.00 / 722370.00 | 8873700.00 / 1650000.00 / 7223700.00 |

**C — 24hBP**

| Material | 1.000 jogadores: P / C / saldo | 10.000: P / C / saldo | 100.000: P / C / saldo |
|---|---:|---:|---:|
| leather_scrap | 722806.00 / 132000.00 / 590806.00 | 7228060.00 / 1320000.00 / 5908060.00 | 72280600.00 / 13200000.00 / 59080600.00 |
| bone_fragment | 543921.00 / 132000.00 / 411921.00 | 5439210.00 / 1320000.00 / 4119210.00 | 54392100.00 / 13200000.00 / 41192100.00 |
| demon_claw | 741096.00 / 49500.00 / 691596.00 | 7410960.00 / 495000.00 / 6915960.00 | 74109600.00 / 4950000.00 / 69159600.00 |
| concentrated_blood | 573615.00 / 49500.00 / 524115.00 | 5736150.00 / 495000.00 / 5241150.00 | 57361500.00 / 4950000.00 / 52411500.00 |
| demon_core | 174927.00 / 8250.00 / 166677.00 | 1749270.00 / 82500.00 / 1666770.00 | 17492700.00 / 825000.00 / 16667700.00 |
| corrupted_crystal | 159997.00 / 8250.00 / 151747.00 | 1599970.00 / 82500.00 / 1517470.00 | 15999700.00 / 825000.00 / 15174700.00 |
| Comum total | 1266727.00 / 264000.00 / 1002727.00 | 12667270.00 / 2640000.00 / 10027270.00 | 126672700.00 / 26400000.00 / 100272700.00 |
| Refino total | 1314711.00 / 99000.00 / 1215711.00 | 13147110.00 / 990000.00 / 12157110.00 | 131471100.00 / 9900000.00 / 121571100.00 |
| Nobre total | 334924.00 / 16500.00 / 318424.00 | 3349240.00 / 165000.00 / 3184240.00 | 33492400.00 / 1650000.00 / 31842400.00 |

## 16. Faixa saudável e restrição de Gold

Meta de observação inicial:50–80% da emissão de materiais consumida voluntariamente em coortes ativas em otimização, avaliando medianas/percentis e estoque de7–30dias. A faixa deixa20–50% para estoque, trocas entre perfis e craft de quem progride. **Não estabiliza oferta agregada por si só**: com produção constante e consumo70%, estoque cresce30% por dia indefinidamente. Com retenção longa e população estável, estabilizar estoque requer consumo próximo da emissão ao longo do ciclo OU redução voluntária da coleta quando o estoque excede utilidade; P2P pode incentivar coleta mesmo sem necessidade pessoal.

Resultado: nenhum pacote atinge a meta para Refino/Nobres no cenário BP24h. Até C absorve só6,68–8,63% de Refino e4,72–5,16% de Nobres nessa hipótese. O C de8h chega a68,30% de scraps mas91,46% de ossos, evidenciando que “Comum” agregado esconde desequilíbrio entre famílias.

A70% da média8h, seria necessário consumir por jogador/dia ~236comuns,246Refino,62Nobres. Com24hBP:~887comuns,920Refino,234Nobres. A2,35operações/dia, demanda70% do regime8h implica ~100comuns,104Refino e26Nobres POR OPERAÇÃO; emBP vira377/392/100. Isso mostra por que simplesmente inflar custos vira o clique de100núcleos que o pedido rejeita. Não é prova de impossibilidade de todo sink; é reprovação de tentar resolver só por precificação de poucos rerolls.

Orçamento monetário: uma expedição epic/8h rende260Gold por slot; 24h com3coletas=780 por slot,1.560 com2slots BP. Esses são tetos operacionais, não renda combinável livremente com qualquer agenda: startExpedition bloqueia enquanto caça ativa, mas startHunt não bloqueia expedições já iniciadas. Para manter ambas, é preciso encerrar/reabrir caça para novos dispatches. 24h caçando também deixa praticamente nenhum tempo para dungeon; os exemplos de emissão24h são extremos de stress, não agenda completa.

Dungeon no andar100 paga em média~197Gold, 5shards e1gema por clear. Sessão extra custa5shards: para quem consegue repetir100, ela se paga em shards, então o limite de3gratuitas **não é teto rígido de emissão de Gold**. Custos de reparo/poções e tempo ainda importam. Elite ainda pode suprir shards. Não usar a alegação antiga “2–5milGold/dia garantidos” como premissa: renda varia muito conforme atividade. A4reforges tardias/dia exigem2.000Gold, antes de poções e reparo; há dias em que o jogador não sustentará isso. As simulações de consumo são cenários de demanda, não previsão garantida de gasto.

## 17. Materiais específicos e P2P

Refino: a nova reforja dá saída direta opcional para dezenas/dia (END4tentativas=96 total; se alternar famílias,48de cada). Consumo projetado depende de Gold e vontade de trocar rolls. Nobre:2por tentativa dá valor na busca, mas8/dia no endgame é muito menor que149/dia de produção combinada8h. Lock/encantamento podem aumentar valor de uso sem100por clique; ainda não provam demanda suficiente. Comum: Dust é a ponte principal, mas quatro matérias-primas substitutas competem e Dust acumulado sem uso só desloca inflação.

Para negociação futura, **nenhum dos seis materiais está demonstrado economicamente sustentável por estas medições**. Nobres seriam os primeiros candidatos a um piloto limitado após demanda de lock/enchants e lastro de servidor; Refino continua prioritário para sinks; Comum e Dust devem esperar evidência de consumo distribuído. Não chamar escassez de chance de drop de escassez econômica: até1% pode produzir muito frente à demanda vitalícia.

Minérios/madeiras e intermediários: o mesmo problema aparece quando gear termina. Sem canal de consumo recorrente, não seria seguro alegar retenção de valor de copper, iron, steel, silver, silver_ingot, gold_ore, gold_bar, obsidian, refined_obsidian, cinco madeiras/cabos. Herbs/roots/flowers têm usos repetíveis, mas o Gold de fabricação e o uso real das poções limitam demanda. Relíquias e atk_elixir precisam de utilidade acessível antes de valorização econômica.

Antes do piloto: fonte autoritativa dos claims/relógio/RNG; inventário por instância para gear; telemetria de emissão, consumo por receita, estoques e adesão real a reforja. Isso é requisito do fluxo econômico existente, não implementação de blockchain. Hoje tudo continua localStorage/client-side; testes de spam cobrem execução normal sequencial, não segurança contra cliente adulterado ou duas abas concorrentes.

## 18. Escolha autônoma e o que mudou

Escolhido A como a menor primeira etapa revisável: reforja existente passa a consumir materiais e salvage deixa de devolver integralmente os ingredientes unitários. Não há nova árvore de poder nem buff alterando combate. Custos centralizados em T.economySinks e transação pura em reforge.ts. A UI apresenta estoque/custo, gold/shard, possibilidade de piora, preservação de raridade/tetos e efeito compartilhado entre cópias. Saves existentes não ganham campo novo nem perdem estoque; carregamento permanece o mesmo.

**Implementado:** custo de materiais na reforja, validação de posse/raridade/recursos no handler, transação atômica em memória, salvage determinístico sem mínimo, textos PT/EN e preview de custos/retorno.

**Apenas proposto:** atributo individual/travado, escolha entre resultado antigo/novo, instâncias de gear, Masterwork, enchants, consumíveis novos, conserto funcional de atk_elixir, cap de catalysts, alteração no preço Gold da reforja B/C, economia P2P e qualquer servidor. Nenhuma alteração em emissão, Modelo C, combate, CP, velocidade, profundidades, N1..N10, inventários existentes, Battle Pass ou recompensas de Elite.

A conclusão não é “economia resolvida”. É “primeiro sink pequeno e útil aplicado, e distância até sustentabilidade quantificada”. Não implementar todo C só para aumentar números de consumo sem comprovar desejo do jogador.

## 19. Testes e limitações

Harness fora do repo executou9grupos de testes:

1. Custo exato de reforja e imutabilidade do input; cardinalidade e unicidade dos substats.
2. Rejeição com Gold, shard, Dust, Refino, Nobre insuficientes; item inexistente/não possuído/common.
3. Cliques sequenciais não gastam o último saldo duas vezes.
4. Save antigo sem reforgeCount, novo save, persistSave/loadSave e conservação do resultado após reload em localStorage simulado.
5. Todas as receitas de salvage: floor45%, sem mínimo e sem entradas zero.
6. Handler real forgeItem extraído da AST: craft repetido cobra inputs; Gold insuficiente não muda save.
7. Handler real salvageItem: desmontagem gasta uma cópia e repetição sem item não gera recurso.
8. Handler real performUpgrade: catalyst consome e chega+8; chamada seguinte não cobra.
9. Handler real applyBattlePassClaim: precisa entitlement para premium e não permite resgate duplicado.

TypeScript: `npx tsc --noEmit -p tsconfig.app.json` e `npx tsc --noEmit -p tsconfig.node.json` passaram. O tsconfig raiz só possui referências; verificar explicitamente app evita um check vazio. ESLint:0erros,2avisos preexistentes (dependência de useEffect em App e Fast Refresh em legacy CombatFx). Vite build passou. git diff --check sem erros de whitespace. Testes não incluíram sessão visual de navegador nem backend inexistente; não foram apresentados como teste end-to-end de UI. O loader/harness de teste transpila os módulos sem alterar arquivos da aplicação.

## 20. Arquivos alterados e diff

Código alterado: src/App.tsx; src/components/InventoryModal.tsx; src/game/salvage.ts; src/game/tunables.ts; src/locales/en.json; src/locales/pt.json. Novo código: src/game/reforge.ts. Novo relatório: docs/ECONOMY_AUDIT.md. Harness econômico ficou fora do repo no caminho da seção4.

```text
git diff --stat (arquivos já rastreados):
 src/App.tsx                       | 20 ++++----------------
 src/components/InventoryModal.tsx | 35 +++++++++++++++++++++++++----------
 src/game/salvage.ts               |  5 +++--
 src/game/tunables.ts              | 10 ++++++++++
 src/locales/en.json               |  5 ++++-
 src/locales/pt.json               |  5 ++++-
 6 files changed, 50 insertions(+), 30 deletions(-)
```

Arquivos novos não aparecem em git diff --stat até serem adicionados ao índice. Permanecem untracked para revisão; não houve git add/commit/push/deploy.

## Apêndice A — todos os equipamentos e receitas

Entradas atuais do runtime, não receitas hipotéticas dos pacotes B/C. Stats ausentes são zero/não aplicáveis. Custos de itens ancestrais NÃO estão inclusos na coluna Gold direto.

| Item | Slot/tier | Stats/efeitos base | Gold direto | Materiais diretos | Itens consumidos | Gems / shards / nível |
|---|---|---|---:|---|---|---|
| wooden_club | weapon/0 | damage=0 | 0 | — | — | —; shards=0; lvl=0 |
| bronze_dagger | weapon/1 | damage=12; critChance=0.03 | 40 | 3 copper + 1 leather + 1 wood_handle_common | — | —; shards=0; lvl=0 |
| iron_short_sword | weapon/2 | damage=30; critChance=0.06 | 120 | 3 iron + 2 leather_scrap + 1 wood_handle_oak | 2 bronze_dagger | —; shards=0; lvl=10 |
| steel_greatsword | weapon/3 | damage=65; critChance=0.1 | 300 | 1 silver_ingot + 2 essence + 3 bone_fragment + 1 demon_claw + 1 wood_handle_ebony | 2 iron_short_sword | 1 ruby; shards=0; lvl=25 |
| gilded_warblade | weapon/4 | damage=90; critChance=0.14 | 600 | 1 gold_bar + 3 concentrated_blood + 1 demon_core + 2 wood_handle_elven | 1 steel_greatsword | —; shards=0; lvl=50 |
| dragon_flameblade | weapon/4 | damage=120; critChance=0.18; burn=true | 1000 | 3 dragon_scales + 2 wood_handle_elven | 1 steel_greatsword | —; shards=5; lvl=0 |
| voidsteel_blade | weapon/5 | damage=160; critChance=0.2; burn=true | 1800 | 1 refined_obsidian + 3 corrupted_crystal + 2 demon_core + 2 wood_handle_ancient | 1 dragon_flameblade | —; shards=0; lvl=70 |
| abyssal_greatblade | weapon/6 | damage=220; critChance=0.24; burn=true | 3200 | 2 refined_obsidian + 5 corrupted_crystal + 3 wood_handle_ancient | 1 voidsteel_blade | —; shards=6; lvl=90 |
| ragged_clothes | armor/0 | maxHp=0 | 0 | — | — | —; shards=0; lvl=0 |
| bronze_leather | armor/1 | maxHp=40; resistance=0.03 | 50 | 3 copper + 3 leather | — | —; shards=0; lvl=0 |
| iron_chainmail | armor/2 | maxHp=90; resistance=0.06 | 130 | 3 iron + 2 leather_scrap | 2 bronze_leather | —; shards=0; lvl=10 |
| steel_plate | armor/3 | maxHp=160; resistance=0.1; reflect=0.2 | 350 | 1 silver_ingot + 2 essence + 3 bone_fragment + 1 demon_claw | 2 iron_chainmail | 1 sapphire; shards=0; lvl=25 |
| gilded_aegis | armor/4 | maxHp=220; resistance=0.13 | 650 | 1 gold_bar + 3 concentrated_blood + 1 corrupted_crystal | 1 steel_plate | —; shards=0; lvl=50 |
| dragon_scale_armor | armor/4 | maxHp=260; resistance=0.15 | 1000 | 3 dragon_scales | 1 steel_plate | —; shards=5; lvl=0 |
| voidsteel_plate | armor/5 | maxHp=340; resistance=0.17 | 1900 | 1 refined_obsidian + 3 concentrated_blood + 2 demon_core | 1 dragon_scale_armor | —; shards=0; lvl=70 |
| abyssal_bulwark | armor/6 | maxHp=440; resistance=0.2 | 3300 | 2 refined_obsidian + 5 concentrated_blood | 1 voidsteel_plate | —; shards=6; lvl=90 |
| ring_vitality | relic/— | focusHpBonus=15 | 200 | 3 essence | — | —; shards=0; lvl=0 |
| amulet_swiftness | relic/— | attackStaminaReduction=5 | 250 | 3 essence | — | —; shards=0; lvl=0 |
| berserker_crest | relic/— | critMultBonus=0.5 | 350 | 5 essence | — | —; shards=0; lvl=0 |
| rusty_pickaxe | pickaxe/0 | miningPower=5 | 0 | — | — | —; shards=0; lvl=0 |
| worn_axe | axe/0 | woodcuttingPower=5 | 0 | — | — | —; shards=0; lvl=0 |
| bamboo_rod | rod/0 | fishingPower=5 | 0 | — | — | —; shards=0; lvl=0 |

## Apêndice B — todas as conversões e poções

| Receita/estação | Input | Output | Gold | Nível personagem mínimo |
|---|---|---|---:|---:|
| smelt_steel/furnace | 5 iron | 1 steel | 30 | 25 |
| smelt_silver/furnace | 5 silver | 1 silver_ingot | 25 | 25 |
| smelt_gold/furnace | 5 gold_ore | 1 gold_bar | 15 | 50 |
| smelt_obsidian/furnace | 5 obsidian | 1 refined_obsidian | 10 | 75 |
| tan_leather/tannery | 3 leather_scrap | 1 leather | 20 | 1 |
| synth_essence/alchemy | 1 demon_core + 1 corrupted_crystal | 1 essence | 150 | 20 |
| synth_dragon_scales/alchemy | 2 demon_core + 2 corrupted_crystal | 1 dragon_scales | 400 | 45 |
| dust_from_copper/dust | 10 copper | 1 refining_dust | 0 | 1 |
| dust_from_leather_scrap/dust | 10 leather_scrap | 1 refining_dust | 0 | 1 |
| dust_from_bone_fragment/dust | 10 bone_fragment | 1 refining_dust | 0 | 1 |
| dust_from_common_herb/dust | 10 common_herb | 1 refining_dust | 0 | 1 |
| craft_handle_common/carpentry | 5 common_wood | 1 wood_handle_common | 10 | 1 |
| craft_handle_oak/carpentry | 5 oak_wood | 1 wood_handle_oak | 8 | 10 |
| craft_handle_ebony/carpentry | 5 ebony_wood | 1 wood_handle_ebony | 5 | 25 |
| craft_handle_elven/carpentry | 5 elven_wood | 1 wood_handle_elven | 3 | 50 |
| craft_handle_ancient/carpentry | 5 ancient_wood | 1 wood_handle_ancient | 2 | 75 |
| xp_potion/poção | 3 common_herb | 1 xp_potion | 30 | 1 |
| greater_elixir/poção | 2 uncommon_root | 1 greater_elixir | 100 | 15 |
| strength_elixir/poção | 1 rare_flower + 2 demon_claw | 1 strength_elixir | 250 | 35 |

Gates de refino usam nível de personagem no App; unlock de matéria-prima de mineração/lenhador/jardim usa skill level. Conversões não têm timer nem cap de quantidade, apenas custo/nível/inputs.

## Apêndice C — todos os materiais e consumidores estáticos

“Consumidores” lista receitas diretas de gear, conversões e poções; upgrade/reforge/pouch e sinks indiretos são explicitados na seção8. Campos packCost/sellValue no catálogo não provam existência de compra/venda ativa: a UI atual não converte automaticamente material em Gold.

| Material | Consumidores diretos no catálogo |
|---|---|
| iron | iron_short_sword×3; iron_chainmail×3; smelt_steel×5 |
| steel | Ver upgrade/reforge; nenhum input direto no catálogo de receitas |
| leather | bronze_dagger×1; bronze_leather×3 |
| essence | steel_greatsword×2; steel_plate×2; ring_vitality×3; amulet_swiftness×3; berserker_crest×5 |
| dragon_scales | dragon_flameblade×3; dragon_scale_armor×3 |
| copper | bronze_dagger×3; bronze_leather×3; dust_from_copper×10 |
| silver | smelt_silver×5 |
| gold_ore | smelt_gold×5 |
| obsidian | smelt_obsidian×5 |
| silver_ingot | steel_greatsword×1; steel_plate×1 |
| gold_bar | gilded_warblade×1; gilded_aegis×1 |
| refined_obsidian | voidsteel_blade×1; abyssal_greatblade×2; voidsteel_plate×1; abyssal_bulwark×2 |
| leather_scrap | iron_short_sword×2; iron_chainmail×2; tan_leather×3; dust_from_leather_scrap×10 |
| demon_claw | steel_greatsword×1; steel_plate×1; strength_elixir×2 |
| demon_core | gilded_warblade×1; voidsteel_blade×2; voidsteel_plate×2; synth_essence×1; synth_dragon_scales×2 |
| bone_fragment | steel_greatsword×3; steel_plate×3; dust_from_bone_fragment×10 |
| concentrated_blood | gilded_warblade×3; gilded_aegis×3; voidsteel_plate×3; abyssal_bulwark×5 |
| corrupted_crystal | voidsteel_blade×3; abyssal_greatblade×5; gilded_aegis×1; synth_essence×1; synth_dragon_scales×2 |
| common_herb | dust_from_common_herb×10; xp_potion×3 |
| uncommon_root | greater_elixir×2 |
| rare_flower | strength_elixir×1 |
| refining_dust | Ver upgrade/reforge; nenhum input direto no catálogo de receitas |
| common_wood | craft_handle_common×5 |
| oak_wood | craft_handle_oak×5 |
| ebony_wood | craft_handle_ebony×5 |
| elven_wood | craft_handle_elven×5 |
| ancient_wood | craft_handle_ancient×5 |
| wood_handle_common | bronze_dagger×1 |
| wood_handle_oak | iron_short_sword×1 |
| wood_handle_ebony | steel_greatsword×1 |
| wood_handle_elven | gilded_warblade×2; dragon_flameblade×2 |
| wood_handle_ancient | voidsteel_blade×2; abyssal_greatblade×3 |

## Apêndice D — todos os consumíveis

| Id | Compra Gold | Uso/fonte |
|---|---:|---|
| small_hp | 30 | Loja/BP; cura50HP automática, cooldown5s |
| large_hp | 80 | Loja/BP; cura150HP automática |
| atk_elixir | 120 | Loja/BP; sem efeito ativo encontrado |
| refine_catalyst | Não comprável | BP/Elite; garante uma tentativa de upgrade |
| expedition_ticket_1h | Não comprável | BP; reduz1h de expedição |
| expedition_ticket_2h | Não comprável | BP; reduz2h |
| expedition_ticket_4h | Não comprável | BP; reduz4h |
| xp_potion | Não comprável | Alchemy; +150XP |
| greater_elixir | Não comprável | Alchemy; cura50%HP máximo |
| strength_elixir | Não comprável | Alchemy; +20%dano/30min |
