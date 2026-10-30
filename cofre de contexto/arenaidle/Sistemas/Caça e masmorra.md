# Caça e masmorra

Voltar: [[Comece aqui]] · Ligações: [[Classes e equipamento]] · [[Economia e materiais]] · [[Antifraude e temporada]] · [[Guardas que existem]] · [[Ferramentas de medição]] · [[O que está em aberto]]

Documentos de origem: `docs/GDD.md` seção 7, `docs/BALANCE_CHANGES.md` (Rodadas 14, 20, 22, 24, 26, 31), `docs/CLASSES_E_EQUIPAMENTOS.md`. Código: `src/game/huntingZones.ts`, `huntCombat.ts`, `huntSession.ts`, `dungeon.ts`, `waves.ts`, `components/BattleModal.tsx`.

## Caça

- **É onde o herói passa a maior parte do tempo e a única fonte de XP e de material de combate** ([[Economia e materiais]]). Cinco zonas, em ordem: Clareira Demoníaca (`demon_glade`), Pântano de Sangue (`blood_marsh`), Fenda Demoníaca (`demon_rift`), Abismo de Sangue Ancestral (`blood_abyss`) e Trono do Abismo Eterno (`abyss_throne`). A quinta foi acrescentada em 28/10 porque, antes dela, o herói ficava parado na quarta do dia 30 ao 60. Cada zona tem profundidades (`shallow`, `dense`, `deep`) e dez sub-níveis que o herói conquista vencendo.
- As zonas abrem por **andar da masmorra** (26, 51, 76 e 90 para as zonas 2 a 5, segundo `docs/CORRENTE_DO_JOGO_2026-10-29.md`), e a zona 3 pede também nível 40 e a zona 4 nível 60 (`zoneLevelGates.test.ts`). A zona é **descoberta** só pelo andar; o nível é conferido quando a caça começa.
- **Dois portões** (sub-nível e profundidade) pedem **índice de equipamento**, não CP, e só as duas últimas zonas têm portão de sub-nível. O portão é **ritmo de progressão, não capacidade**: o combate é vencido com índice 2,4 a 4,0 e o portão pedia 3,7 a 8,4 ([[2026-10-28 — O portão de sub-nível dizia proteger e só atrasava]]). **Regra dura:** o último sub-nível do fundo mais difícil de toda zona tem de ser alcançável com o melhor equipamento do jogo (`zoneLevelGates.test.ts`). A zona 5 já nasceu quebrada nisso uma vez.
- O XP por abate acompanha o sub-nível nas zonas que têm o campo `xpPerSubLevel` (+5% por sub-nível acima do 1, +45% no 10); zona sem o campo paga plano (`zoneLevelGates.test.ts`). **O XP por hora é decidido pelo teto de ritmo da zona, não pelo dano**: por isso o crítico acima de 100% voltando como dano não mexeu no XP por hora ([[2026-10-29 — O crítico acima de 100% era jogado fora]]).
- A sessão armazena 6 h, ou 10 h com o Passe. **A sessão congela os stats de combate** (`CombatStats` na `huntSession`): mexer num total sem teto fazia o sanitizador reconstruir a sessão sem o teto do Passe (10 h viravam 6 h, Rodada 24). Por isso a chance de crítico ficou presa em 1.
- **Único é dropado a 0,000008 por rolagem na última zona**, os outros no máximo isso (`zoneLevelGates.test.ts`).
- **Evento da Caçada ao Alvo:** o bônus de XP acumula acima do número do cartão, de propósito ([[2026-10-29 — O cartão do evento prometia +8% e o jogo pagava até +15%]]).

## Masmorra

- **100 andares** e as Profundezas depois. Quatro biomas, cada um com **um** inimigo regular e um chefe no fim: `goblin_forest` (1 a 25), `orc_camp` (26 a 50), `warlock_crypt` (51 a 75), `minotaur_lair` (76 a 100). Chefes a cada 25 andares; mini-chefes de checkpoint (os andares 10 e 20 do primeiro bioma pagam bem mais ouro e 2 de Éter).
- É o **único lugar com combate animado**; regra de desenho: o jogo **não é para ficar assistindo**. A Caça é uma cena pequena e o inventário.
- **O eixo do guerreiro e o desempate do campeonato.** Ver [[Classes e equipamento]] e [[Decisões do dono]].
- **Não solta material.** Dá ouro, bônus de checkpoint e chefe, gemas (1 por chefe), únicos de chefe e relíquias, e as recompensas únicas de marco (`dungeon.ts`). Dá 10 entradas grátis por dia, e uma derrota guarda 75% do ouro (`balance.test.ts`).
- O conselho de CP por andar (`recommendedCpForFloor`) é **gerado** (`npm run sim:cp`, `scripts/sim/cpTable.gen.ts`) e tem de ser regerado quando a curva da masmorra muda; o CP **não decide** nada.
- **Um mesmo inimigo por bioma é o motivo de a masmorra parecer repetida**, não o tamanho do bestiário. Por isso o primeiro bioma ganhou um segundo monstro, o Lobo da Mata, nos andares pares de 2 a 24; o andar 25 continua sendo o Rei Goblin. **Só a aparência muda**: `dungeonEnemyKindForFloor` ainda responde `goblin`, e `forestVariety.test.ts` fixa vida, dano, velocidade, esquiva, cura, ouro, Éter, drops, gemas, únicos e relíquias dos andares 1 a 24 nos valores de antes, e falha se a arte parar de alternar. Provado vermelho dos dois lados. Ver [[Arte por IA a cada quadro custa dezenas de gerações]].
- O primeiro bioma é onde todo jogador novo decide se continua, por isso foi o primeiro a receber variedade. O commit diz que, a três gerações por criatura, os quatro biomas passam a caber no orçamento; nos commits que li, os outros três ainda não receberam segundo monstro ([[O que está em aberto]]).

## O combate roda em três lugares, e eles têm de concordar

`src/components/BattleModal.tsx` (a masmorra na tela), `src/game/huntCombat.ts` (a Caça) e `scripts/sim/driver.ts` (o simulador de onde sai todo número de equilíbrio). Qualquer regra de combate precisa existir nos três. Dois casos que mostram o preço:

- **Relógio de ataque.** Os dois espelhos guardam o resto de cada golpe; a tela jogava fora. A masmorra assistida corria mais devagar que todo andar medido ([[2026-10-29 — A masmorra na tela perdia o tempo que o simulador guardava]]). O relógio do inimigo foi corrigido **junto** com o do herói.
- **Efeitos de habilidade** são um conjunto fechado de oito por esse motivo ([[Classes e equipamento]]).

## Arte de criatura

- Folha de personagem: PNG em grade 4×4, linhas **parado, ataque, dano, morte**, transparente, de lado. A folha do Soberano do Abismo tem células de 172 px (688×688); confira o tamanho das folhas existentes antes de gerar uma nova.
- **A folha de monstro da masmorra olha para a DIREITA, porque `BattleModal` desenha todo inimigo espelhado.** A folha do Soberano do Abismo (monstro de Caça) olha para a esquerda, como descreve `ce32440`. Se for gerar uma folha nova, confira qual renderizador a desenha.
- `height` de um monstro de Caça é **múltiplo de `HERO_HEIGHT`**, não do desenho. O renderizador escala o que `box` recorta até `HERO_HEIGHT * height`, então o tamanho do sprite não muda o tamanho que o jogador vê ([[2026-10-29 — O Soberano do Abismo usava o sprite do monstro anterior]]).
- A Caça e a masmorra **não mostram taxa de drop nem rendimento por hora** na tela.
