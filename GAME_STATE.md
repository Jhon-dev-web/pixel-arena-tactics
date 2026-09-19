# Arena Duel — mapa completo de estado

Data da análise: 16/09/2026. Este documento descreve o estado do jogo que existe no repositório hoje, sem propor nem aplicar alterações de código.

## Resumo de persistência e autoridade

O estado principal é o objeto `SaveData`, definido em `src/game/engine.ts`. A aplicação o carrega de `localStorage` com a chave `arena-rpg-save-v1` (`loadSave`) e o regrava integralmente a cada mudança (`persistSave`, chamado por um `useEffect` em `src/App.tsx`). Não há API, banco de dados, carteira, contrato ou serviço de sincronização no fluxo atual.

Consequentemente, **todos os campos de `SaveData` podem ser modificados pelo cliente hoje**, seja pelas telas normais, seja alterando o `localStorage`/runtime no navegador. A coluna “Servidor” abaixo indica a recomendação para uma futura versão online/Web3:

- **Sim**: fonte de verdade deve ser servidor/serviço autoritativo; o frontend só solicita a ação e exibe a resposta.
- **Não (frontend)**: preferência visual/local, sem valor econômico ou competitivo.
- **Remover/migrar**: campo legado sem uso no fluxo principal; não deve ganhar autoridade nova.

`level` e `HP` não são propriedades persistidas: são calculados de `xp`, atributos, equipamento, refinamento, durabilidade, gemas e substats.

## Estado persistido: `SaveData`

| Propriedade | Definida em | Alterada em | Salva hoje | Cliente pode alterar? | Servidor no futuro? | Apenas visual no frontend? |
|---|---|---|---|---|---|---|
| `gold` | `engine.ts` (`SaveData`, `defaultSave`) | `App.tsx`: dungeon/elite, quests, expedições, mineração, madeira, caça, BP, loja, craft/refino/reforge/refine, reparo, pouch e admin | Campo JSON de `arena-rpg-save-v1` | Sim | Sim | Não |
| `oneTokenBalance` (ONE) | `engine.ts`; prêmios em `dungeon.ts` e BP em `battlepass.ts` | `App.tsx`: `finishRun`, `finishEliteRun`, `applyBattlePassClaim` | JSON local; não é saldo de carteira | Sim | Sim, com ledger/claim idempotente | Não |
| `shards` | `engine.ts` | `App.tsx`: dungeon/elite, quests, expedições, BP; gasto em sessão extra, gemas, reparo blessed, craft, reforge e refine | JSON local | Sim | Sim | Não |
| `xp` | `engine.ts` | `App.tsx`: dungeon, caça, expedição, XP potion e troca de caça; limitado no nível 100 | JSON local | Sim | Sim | Não |
| `heroName` | `engine.ts` | `App.tsx`: `renameHero` | JSON local | Sim | Preferencialmente Sim se perfil/social existir; caso contrário Não | Sim, enquanto for só rótulo |
| `victories` | `engine.ts` | `App.tsx`: `finishRun`; também fluxo legado em `legacy-arena/DuelArena.tsx` | JSON local | Sim | Sim se usado em ranking/recompensa | Não |
| `str`, `vit`, `agi`, `res` | `engine.ts` | `App.tsx`: `attrChange` | JSON local | Sim | Sim | Não |
| `weaponLevel` | `engine.ts` | Não é alterado pelo fluxo principal; legado usa em `legacy-arena/duelEngine.ts` | JSON local | Sim | Remover/migrar | Não |
| `armorLevel` | `engine.ts` | Não é alterado pelo fluxo principal; ainda entra em `playerMaxHp` | JSON local | Sim | Remover/migrar ou substituir pela progressão de refine | Não |
| `potions.hp`, `potions.stamina`, `potions.elixir` | `engine.ts` | Só `legacy-arena/DuelArena.tsx` consome `hp` e `stamina`; fluxo principal usa `consumables` | JSON local | Sim | Remover/migrar | Não |
| `inventory` (`Record<gearId, quantidade>`) | `engine.ts`; catálogo em `gear.ts` | `App.tsx`: forge, salvage, discard, admin unlock; equipamento não remove da bolsa | JSON local, sanitizado em `loadSave` | Sim | Sim | Não |
| `equipped` (`weapon`, `armor`, `relic`, `shield`, `helmet`, `pickaxe`, `axe`, `rod`) | `engine.ts`; tipos em `gear.ts` | `App.tsx`: `equipGear`, `unequipGear`; sanitizado no load | JSON local | Sim | Sim se combate/itens forem online | Não |
| `upgrades` (`gearId -> refine 0..8`) | `engine.ts`; regras em `gear.ts` | `App.tsx`: `performUpgrade`; validação/sanitização em `loadSave` | JSON local | Sim | Sim; inclui RNG e custo | Não |
| `durability` (`gearId -> 0..100`) | `engine.ts`; regras em `gear.ts` | `App.tsx`: `finishRun` reduz, `repairItem` restaura; sanitizado no load | JSON local | Sim | Sim | Não |
| `blessed` | `engine.ts` | `App.tsx`: `repairItem` ativa ao gastar shard; `finishRun` reseta para `false` | JSON local | Sim | Sim se tiver efeito competitivo | Não |
| `itemRarity` (`gearId -> common/rare/epic/legendary`) | `engine.ts`; rolagens em `rarity.ts` | `App.tsx`: `forgeItem`; sanitizado no load | JSON local | Sim | Sim; rolagem deve ser autoritativa | Não |
| `itemSubstats` (`gearId -> Substat[]`) | `engine.ts`; catálogo/rolagem em `rarity.ts` | `App.tsx`: `forgeItem`, `reforgeItem`; sanitizado no load | JSON local | Sim | Sim; rolagem e reforge devem ser autoritativos | Não |
| `reforgeCount` (`gearId -> número`) | `engine.ts` | `App.tsx`: `reforgeItem` | JSON local | Sim | Sim, pois determina preço progressivo | Não |
| `materials` | `engine.ts`; ids, preços e regras em `materials.ts` | Ver tabela de materiais abaixo; ganha em gathering/caça/recompensas e gasta em craft/refino/pouch | JSON local | Sim | Sim | Não |
| `gems` (`ruby`, `sapphire`, `emerald`) | `engine.ts`; catálogo em `gems.ts` | `App.tsx`: dungeon/elite/BP concedem; loja cria; socket remove; unsocket devolve; forge/refino gastam | JSON local | Sim | Sim | Não |
| `sockets` (`gearId -> GemId[]`) | `engine.ts`; capacidade em `gems.ts` | `App.tsx`: `socketGem`, `unsocketGem`; sanitizado no load | JSON local | Sim | Sim se bônus afetam combate | Não |
| `highestDungeonFloor` | `engine.ts` | `App.tsx`: `finishRun`; limitado/sanitizado em `loadSave` | JSON local | Sim | Sim | Não |
| `dungeonCheckpoints` (milestones 25/50/75/100 creditados) | `engine.ts`; milestones em `dungeon.ts` | `App.tsx`: `finishRun`; sanitizado no load | JSON local | Sim | Sim | Não |
| `dungeonEliteDefeated` (elite first clear) | `engine.ts`; regras em `dungeon.ts` | `App.tsx`: `finishEliteRun`; sanitizado no load | JSON local | Sim | Sim | Não |
| `dungeonSessionsDay` | `engine.ts` | `App.tsx`: `enterDungeon`; resetado pelo dia local em `loadSave` | JSON local | Sim | Sim, com data UTC/servidor | Não |
| `dungeonSessionsUsed` | `engine.ts` | `App.tsx`: `enterDungeon`; resetado pelo dia local em `loadSave` | JSON local | Sim | Sim | Não |
| `activeOreId` | `engine.ts`; tiers em `ores.ts` | `App.tsx`: `startMining`, `claimMining`, `cancelMining`; sanitizado no load | JSON local | Sim | Sim se mineração offline gerar itens | Não |
| `lastMiningClaim` | `engine.ts` | `App.tsx`: `startMining`, `claimMining`; sanitizado no load | JSON local | Sim | Sim; é a base do cálculo offline | Não |
| `miningCapHours` | `engine.ts` | Só valor inicial/migração; não há mutador normal | JSON local | Sim | Sim se for configuração por conta; caso contrário usar configuração de servidor | Não |
| `activeWoodId` | `engine.ts`; tiers em `woodcutting.ts` | `App.tsx`: `startWoodcutting`, `claimWoodcutting`, `cancelWoodcutting` | JSON local | Sim | Sim se madeira tiver valor econômico | Não |
| `lastWoodcuttingClaim` | `engine.ts` | `App.tsx`: `startWoodcutting`, `claimWoodcutting`; sanitizado no load | JSON local | Sim | Sim | Não |
| `woodcuttingCapHours` | `engine.ts` | Só valor inicial/migração; não há mutador normal | JSON local | Sim | Sim se variar por conta | Não |
| `skillXp.mining` | `engine.ts`; curva em `skills.ts` | `App.tsx`: `claimMining`; migração no load | JSON local | Sim | Sim | Não |
| `skillXp.woodcutting` | `engine.ts`; curva em `skills.ts` | `App.tsx`: `claimWoodcutting`; migração no load | JSON local | Sim | Sim | Não |
| `skillXp.gardening` | `engine.ts`; curva em `skills.ts` | `App.tsx`: `harvestGardenSlot`; migração no load | JSON local | Sim | Sim | Não |
| `activeHuntingZone` | `engine.ts`; zonas em `huntingZones.ts` | `App.tsx`: `startHunt`, `stopHunt` | JSON local | Sim | Sim se caça concede recursos | Não |
| `activeHuntingDepth` | `engine.ts`; depths em `huntingZones.ts` | `App.tsx`: `startHunt`, `stopHunt` | JSON local | Sim | Sim | Não |
| `huntingOfflineStart` | `engine.ts` | `App.tsx`: `startHunt`, `confirmHuntReward`; valor inicial/migração | JSON local | Sim | Sim; base do cálculo offline | Não |
| `huntingSubLevels` (`zone:depth -> próximo subnível`) | `engine.ts` | `App.tsx`: `startHunt`, `confirmHuntReward`; sanitizado no load | JSON local | Sim | Sim | Não |
| `unlockedHuntingZones` | `engine.ts` | `App.tsx`: `finishRun`; sanitizado no load | JSON local | Sim | Sim | Não |
| `huntPouch.tier` | `engine.ts`; tiers/custos em `huntPouch.ts` | `App.tsx`: `upgradeHuntPouch` | JSON local | Sim | Sim | Não |
| `huntPouch.items` | `engine.ts`; formato em `huntPouch.ts` | `App.tsx`: `startHunt`, `stopHunt`, `confirmHuntReward`; alocação em `huntPouch.ts` | JSON local | Sim | Sim | Não |
| `huntPouch.lostItems` | `engine.ts`; formato em `huntPouch.ts` | `huntPouch.ts` registra overflow; `App.tsx` limpa ao confirmar recompensa | JSON local | Sim | Sim; embora seja dado transitório de recompensa | Não |
| `gardenSlots` (4 × `plantId`, `startedAt`) | `engine.ts`; plantas em `garden.ts` | `App.tsx`: `startPlanting`, `harvestGardenSlot`, `cancelGardenSlot`; migração no load | JSON local | Sim | Sim se colheita dá materiais | Não |
| `consumables` (todos os ids abaixo) | `engine.ts`; catálogo em `consumables.ts` | `App.tsx`: loja, craft, BP, elite, uso manual/automático, ticket e discard | JSON local | Sim | Sim | Não |
| `activeBuff` (`type`, `expiresAt`) | `engine.ts` | `App.tsx`: `applyStrengthElixir`; sanitizado no load | JSON local | Sim | Sim se caça/combate forem autoritativos | Não |
| `hasBattlePass` | `engine.ts` | `App.tsx`: `activateBattlePass`; sanitizado no load | JSON local | Sim | Sim; requer validação de compra/entitlement | Não |
| `battlePassExpiresAt` | `engine.ts` | `App.tsx`: `activateBattlePass`; sanitizado no load | JSON local | Sim | Sim, usando relógio do servidor | Não |
| `battlePassLevel` | `engine.ts`; curva em `battlepass.ts` | `App.tsx`: dungeon, caça, mineração via `addBattlePassXp`; sanitizado no load | JSON local | Sim | Sim | Não |
| `battlePassXp` | `engine.ts`; curva em `battlepass.ts` | `App.tsx`: dungeon, caça, mineração via `addBattlePassXp`; sanitizado no load | JSON local | Sim | Sim | Não |
| `claimedPassRewards.free` | `engine.ts` | `App.tsx`: `applyBattlePassClaim` / `claimAllBattlePassRewards`; sanitizado no load | JSON local | Sim | Sim; claims idempotentes no servidor | Não |
| `claimedPassRewards.premium` | `engine.ts` | `App.tsx`: `applyBattlePassClaim` / `claimAllBattlePassRewards`; sanitizado no load | JSON local | Sim | Sim; claims idempotentes no servidor | Não |
| `quests.dailyDay` | `engine.ts`; quests em `quests.ts` | `engine.ts`: reset no `loadSave` conforme relógio local | JSON local | Sim | Sim, com reset diário no servidor | Não |
| `quests.daily.kills`, `.forge`, `.purchases`, `.expeditions` | `engine.ts`; metas em `quests.ts` | `App.tsx`: `finishRun`, craft/refino/upgrade, loja, `claimExpedition`; reset no load | JSON local | Sim | Sim | Não |
| `quests.dailyClaimed` | `engine.ts` | `App.tsx`: `claimQuest`; reset no load | JSON local | Sim | Sim | Não |
| `quests.counters.kills`, `.maxFloorCleared` | `engine.ts` | `App.tsx`: `finishRun` | JSON local | Sim | Sim | Não |
| `quests.claimed` | `engine.ts` | `App.tsx`: `claimQuest` | JSON local | Sim | Sim | Não |
| `expeditions` (`{ id, endsAt }[]`) | `engine.ts`; definições em `expedition.ts` | `App.tsx`: iniciar, cancelar, reivindicar e usar ticket; sanitizado no load | JSON local | Sim | Sim, inclusive tempo e RNG de shard | Não |
| `cosmetics` (ids de títulos) | `engine.ts`; títulos em `titles.ts` | `App.tsx`: milestones, elite e BP concedem; BP evita duplicatas | JSON local | Sim | Sim para posse se cosmético pago/NFT; seleção pode ser frontend | Sim, se não houver posse econômica |
| `activeTitle` | `engine.ts` | `App.tsx`: `selectTitle`; sanitizado no load | JSON local | Sim | Não, salvo perfil público sincronizado | Sim |
| `autoPotionThreshold` | `engine.ts` | `App.tsx`: `updateAutoPotionSettings`; limitado no load | JSON local | Sim | Sim se a simulação idle ficar no servidor; senão Não | Não |
| `autoPotionPriority` | `engine.ts` | `App.tsx`: `updateAutoPotionSettings`; normalizado no load | JSON local | Sim | Sim se a simulação idle ficar no servidor; senão Não | Não |
| `seenTooltips` | `engine.ts` | `App.tsx`: efeito de tooltips adiciona ids | JSON local | Sim | Não (frontend) | Sim |
| `seenWelcome` | `engine.ts` | `App.tsx`: `closeWelcome` | JSON local | Sim | Não (frontend) | Sim |

## Detalhamento dos recursos agrupados

### Nível e HP derivados

| Dado exibido/calculado | Origem | Persistido? | Alterado diretamente? | Autoridade futura |
|---|---|---|---|---|
| `playerLevel(xp)` | `src/game/engine.ts` | Não; derivado de `xp` e curva de `T.progression` | Muda quando `xp` muda | Servidor, pois `xp` é econômico/progressão |
| `playerMaxHp(save)` | `src/game/engine.ts` | Não; derivado de armor, refine, durabilidade, raridade, nível, VIT, gemas e substats | Muda pelos componentes de origem | Servidor para combate autoritativo |
| HP atual de batalha | Estado interno de `src/components/BattleModal.tsx` / simulação de caça | Não | Durante cada combate | Servidor se batalhas/recompensas forem online; visual no frontend durante a animação |
| `computeCP(save)` | `src/game/engine.ts` | Não; derivado | Muda pelos componentes de origem | Servidor para gates/ranking; frontend pode apenas pré-visualizar |

### Materiais em `materials`

Todos são chaves de `SaveData.materials`, definidos em `src/game/materials.ts`, persistidos no JSON local e atualmente manipuláveis pelo cliente. Em produção, todos devem ser autoritativos no servidor e não são meramente visuais.

| Id | Fontes normais de entrada | Saídas/modificações principais |
|---|---|---|
| `copper`, `iron`, `silver`, `gold_ore`, `obsidian` | `claimMining`; Battle Pass para alguns | Craft, refino, pouch, discard |
| `common_wood`, `oak_wood`, `ebony_wood`, `elven_wood`, `ancient_wood` | `claimWoodcutting` | Carpintaria, craft, discard |
| `leather_scrap`, `demon_claw`, `demon_core`, `bone_fragment`, `concentrated_blood`, `corrupted_crystal` | Caça via `startHunt`/`stopHunt`/`confirmHuntReward`; BP para alguns | Curtume/alquimia/craft/pouch/discard |
| `common_herb`, `uncommon_root`, `rare_flower` | `harvestGardenSlot` | Poções, pó de refino, discard |
| `steel`, `silver_ingot`, `gold_bar`, `refined_obsidian`, `leather`, `essence`, `dragon_scales` | Refino/alquimia/curtume; BP; salvage pode dar essence | Craft, refine, pouch, discard |
| `refining_dust` | Receitas `dust_*` em `refining.ts` | Refine +5 a +8 |
| `wood_handle_common`, `wood_handle_oak`, `wood_handle_ebony`, `wood_handle_elven`, `wood_handle_ancient` | Carpintaria em `refining.ts` | Craft de armas |

### Consumíveis em `consumables`

Definidos em `src/game/consumables.ts`, persistidos no JSON local e alteráveis pelo cliente. Todos devem ficar sob autoridade do servidor se puderem mudar resultado de combate, tempo ou recursos.

| Id | Concedido por | Consumido/alterado por |
|---|---|---|
| `small_hp`, `large_hp` | Loja e Battle Pass | Auto-poção em dungeon/caça; `useAutoPotion`; descarte |
| `atk_elixir` | Loja e Battle Pass | Não há uso implementado no fluxo principal; descarte |
| `xp_potion` | Craft de poções | `applyXpPotion` aumenta XP; descarte |
| `greater_elixir` | Craft | Auto-poção em caça/dungeon; descarte |
| `strength_elixir` | Craft | `applyStrengthElixir` cria/renova `activeBuff`; descarte |
| `refine_catalyst` | Battle Pass e elite | `performUpgrade(..., true)` garante refine; descarte |
| `expedition_ticket_1h`, `_2h`, `_4h` | Battle Pass | `useExpeditionTicket` reduz `endsAt`; descarte |

## Todas as funções que concedem, removem ou modificam recursos/progresso

As funções abaixo ficam em `src/App.tsx`, salvo indicação contrária. Elas são os mutadores de fato porque chamam `setSaveBoth`; em seguida o efeito de `App.tsx` chama `persistSave`.

| Função | Concede/modifica | Remove/gasta | Observação |
|---|---|---|---|
| `finishRun` | ouro, XP, shards, gemas, materiais, vitórias, andar, zonas, quests, BP XP, milestone cosmetics e ONE | durabilidade; limpa `blessed`; perda do direito a milestone se derrota | Resultado normal de dungeon |
| `finishEliteRun` | ouro, gems, shards, catalyst, first-clear e ONE | — | Elite repetível; first clear registrado |
| `enterDungeon` | incrementa uso diário | shard após sessões grátis | Usa dia local |
| `repairItem` | restaura durabilidade; pode marcar blessed | gold e, se blessed, shard | |
| `buyGem` | gema | shard | |
| `socketGem` / `unsocketGem` | altera sockets; unsocket devolve gema | socket consome gema | |
| `useAutoPotion` | — | consumível | Chamada por combate automático |
| `craftPotion` | consumível; contador daily forge | gold e materiais | |
| `applyXpPotion` | XP | `xp_potion` | |
| `applyStrengthElixir` | `activeBuff` | `strength_elixir` | Troca a expiração, não acumula potência |
| `claimQuest` | gold, shards e marca claim | — | Daily/achievement |
| `startExpedition` | cria expedição ativa | — | Define `endsAt` |
| `cancelExpedition` | remove expedição ativa | recompensa pendente é perdida | |
| `claimExpedition` | gold, XP, shards, daily expedition | remove expedição | `expeditionRewards` em `expedition.ts` pode rolar shard extra |
| `useExpeditionTicket` | reduz `endsAt` | ticket | |
| `startMining` / `cancelMining` | inicia/encerra estado de mineração | — | Timestamp é resetado ao iniciar |
| `claimMining` | ore material, skill XP mineração, BP XP e `goldReady` (configuração atual é 0) | encerra atividade | Calcula offline em `computeMiningStatus` |
| `startWoodcutting` / `cancelWoodcutting` | inicia/encerra estado de madeira | — | |
| `claimWoodcutting` | madeira, skill XP woodcutting e `goldReady` (atual 0) | encerra atividade | Calcula offline em `computeWoodcuttingStatus` |
| `startPlanting` / `cancelGardenSlot` | inicia/cancela slot e timestamp | cancelamento perde plantio | |
| `harvestGardenSlot` | material de planta e skill XP gardening | limpa slot | |
| `startHunt` | troca sessão; antes liquida ouro/XP/drop/potion/progresso da sessão anterior | poções usadas na sessão anterior | Define novo timestamp e zona/profundidade |
| `stopHunt` | encerra caça e coloca drops no pouch | — | Recompensas numéricas ficam temporariamente em `huntReward` até confirmação |
| `confirmHuntReward` | gold, XP, materiais transferidos, progresso de subnível, BP XP | poções usadas; limpa `lostItems` | Overflow pode permanecer no pouch |
| `upgradeHuntPouch` | tier do pouch | gold e materiais | |
| `activateBattlePass` | entitlement local e expiração | — | Não há compra/verificação externa hoje |
| `applyBattlePassClaim`, `claimBattlePassLevel`, `claimAllBattlePassRewards` | gold/shards/material/gema/consumível/ONE/cosmético e marca claim | — | `applyBattlePassClaim` é helper puro que devolve novo `SaveData` |
| `buyConsumable` | consumível; daily purchases | gold | |
| `discardItem` | remove material, consumível ou gear | recurso descartado | Sem retorno |
| `salvageItem` | materiais e possível essence/gema | uma unidade de gear | Usa RNG local para bônus |
| `forgeItem` | gear, raridade e substats; daily forge | gold, materiais, gems, itens pré-requisito, shards | Usa RNG local de raridade/substats |
| `refineMaterial` | material refinado; daily forge | gold e inputs | Inclui forno, curtume, alquimia, pó e carpintaria |
| `reforgeItem` | novos substats; contador | gold e shard | Usa RNG local |
| `performUpgrade`, `upgradeItem`, `upgradeItemWithCatalyst` | nível de refine em sucesso; daily forge | gold, materiais, shards e possivelmente catalyst | Chance/RNG local; catalyst garante sucesso |
| `updateAutoPotionSettings` | preferência de auto-poção | — | |
| `attrChange` | STR/VIT/AGI/RES | pode remover ponto quando `delta < 0` | Limite por nível no cliente |
| `renameHero` / `selectTitle` | nome/título ativo | — | Perfil/aparência |
| `closeWelcome` e efeito de tooltip | progresso de onboarding | — | Visual |
| `adminAddGold`, `adminAddShards`, `adminUnlockAll`, `adminReset` | gold, shards, inventário ou reset integral | conforme ação | Só registra listener em build DEV; não deve existir em produção |
| `equipGear` / `unequipGear` | slots equipados | — | Não consome inventário |

Além desses mutadores, os helpers abaixo calculam/alteram dados fora do React, mas não persistem sozinhos:

- `computeMiningStatus`, `computeWoodcuttingStatus`, `computeHuntingStatus`, `computeGardenSlotStatus`: calculam progresso offline a partir de timestamps locais.
- `simulateHuntingSession` em `src/game/huntCombat.ts`: calcula drops, XP, gold, poções e avanço de caça usando seed baseada no timestamp da sessão.
- `waveRewards` em `src/game/waves.ts`, `expeditionRewards` em `src/game/expedition.ts`, `rollRarity`/`rollSubstats` em `src/game/rarity.ts`: geram recompensas/rolagens que os mutadores acima aplicam.
- `allocateToPouch` e `drainPouchToMaterials` em `src/game/huntPouch.ts`: movem/retêm materiais durante a caça.
- `loadSave` também normaliza, migra e pode resetar daily state usando data local; `persistSave` grava o JSON integral.

## Estado de interface e combate não persistido

Definido por `useState` em `src/App.tsx`. Estes dados não entram no `SaveData` e são perdidos ao recarregar a página; devem continuar no frontend, exceto onde indicado.

| Estado | Uso | Deve ir ao servidor? |
|---|---|---|
| `shopOpen`, `forgeOpen`, `bagOpen`, `heroOpen`, `dungeonOpen`, `huntOpen`, `expeditionOpen`, `mineOpen`, `woodOpen`, `gardenOpen`, `questsOpen`, `battlePassOpen`, `adminOpen` | Visibilidade de modais | Não; visual |
| `battleFloor`, `eliteFloor` | Batalha/modal atualmente em curso | Sim para estado/resolução se a batalha render recompensas online; frontend para animação |
| `claimResult`, `huntReward` | Resultado pendente de confirmação em modal | Sim para recompensa pendente idempotente se online; frontend para apresentação |
| `toast`, `tooltipQueue`, `activeTooltip`, `welcomeOpen`, `version` | Feedback, onboarding e rerender | Não; visual |
| `muted` | Preferência de áudio; chave separada `arena-rpg-muted` em `src/game/audio.ts` | Não; visual/local |
| `cheatMode`, `cheatModeRef` | Ferramenta DEV | Não deve existir em ambiente de produção |
| `saveRef`, `toastTimeout` | Referências técnicas | Não |

`BattleModal.tsx` e `HuntBattleView.tsx` também mantêm HP/barras/animações de combate transitórias. Elas não são fontes persistidas de verdade; a recompensa é finalmente aplicada em `finishRun`, `finishEliteRun` ou `confirmHuntReward`.

## Implicação direta para Web3/online

Não existe hoje uma separação entre “dado de jogo” e “dado confiável”: todo o inventário, todas as moedas, o tempo offline, os limites diários, o Battle Pass, a rolagem de itens e o saldo de ONE estão no cliente. Para qualquer item/moeda transferível ou com valor, o servidor deve receber apenas uma intenção de ação e validar custo, pré-requisitos, relógio, RNG, recompensa e idempotência antes de devolver o novo estado.
