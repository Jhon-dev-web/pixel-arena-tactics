# Mudanças de balanceamento: deadlocks do começo e a parede do andar 25

- **Data:** 2026-10-10
- **Commit:** `balance: fix early-game deadlocks and smooth the floor-25 wall`, na branch `claude/project-thread-ppdm57`, em cima de `dbb65b5`.
- **Antes:** [`BALANCE_BASELINE_2026-10-10_pre.md`](BALANCE_BASELINE_2026-10-10_pre.md) (medido sem nenhuma mudança). **Depois:** [`BALANCE_BASELINE.md`](BALANCE_BASELINE.md) (regenerado, com a seção "Metas de balanceamento"). Reproduzir: `npm run sim` (cerca de 6 s) e, depois de mexer na curva da Masmorra, `npm run sim:cp` (regenera `src/game/recommendedCp.ts`; um teste falha se a tabela ficar desatualizada).
- **Escopo:** números e o conserto de carga do save, como decidido. Não foram alterados: chances de drop, modelo de emissão (Kref/f), ouro por hora das zonas, custo de receitas, salvage, Pedidos, Battle Pass, curva de XP do herói (`xpBase`, `heroGrowth*`, `heroBand*`), `hpGrowth` e `dmgGrowth`.

## 1. Valores alterados

> **Rodada 2:** os valores de `ENEMIES.boss.hp` (260) e `battle.bossDmgMult` (0,5) desta tabela foram revertidos (550 e 0,45), e o XP dos Pedidos e dos orcs mudou; ver a seção "Rodada 2" no fim do documento. As seções 3 a 6 descrevem o estado da rodada 1.

| Arquivo | Nome | Antes → depois | Por quê |
| --- | --- | --- | --- |
| `src/game/huntPouch.ts` | `HUNT_POUCH_TIERS[0].slots` (Bolsa de Caça, tier 1) | 2 → **3** | Toda zona sorteia 3 materiais e a Bolsa de 2 espaços descartava o comum (farrapo) em toda caça longa: 147 farrapos sorteados em 4 h, 0 guardados. O farrapo é a base do couro e do upgrade da Bolsa, então não saía peça nenhuma em 14 dias. Os tiers 2, 3 e 4 ficam em 4, 6 e 8. A capacidade vem da definição do tier (`effectivePouchSlots`), não do save, então saves no tier 1 já ganham o 3º espaço. |
| `src/game/tunables.ts` | `dungeon.freeSessionsPerDay` | 3 → **10** | Cada sessão dura 10 a 33 s e termina em derrota; três por dia eram menos de 2 minutos de jogo. |
| `src/game/tunables.ts` | `battle.waveHeal` | 0,1 → **0,3** | Único botão que mexe só no desgaste entre andares. Com 0,1 o herói novo (CP 58, 80 PV) morria no andar 6; só com 0,3 a primeira sessão chega ao andar 8 (0,2 dá 6 e 0,22 a 0,29 dá 7). Junto com as 10 sessões grátis, faz o checkpoint do andar 10 cair no dia 1. |
| `src/game/enemies.ts` | `ENEMIES.boss.hp` (HP base do minotauro) | 550 → **260** | Corta o salto do chefe do 25: 2 657 HP e 131 de golpe contra 200 HP e 23 no andar 24 (HP x golpe 76x o do andar 24; agora 40x). Escolhido no HP base e **não** em `bossHpMult`: um multiplicador abaixo de 1 deixaria o chefe do andar 100 mais fraco que o andar 99 (o minotauro também é o inimigo comum dos andares 76 a 99), o que um teste agora impede. Efeito colateral: os andares 76 a 99 também perdem cerca de metade do HP. |
| `src/game/tunables.ts` | `battle.bossDmgMult` | 0,45 → **0,5** | Ajuste fino: leva o chefe do 50 para o dia 13 em vez do dia 12. Tem de ficar acima de ~0,25, senão o andar 76 fica mais fraco que o 74 (T7). |
| `src/game/huntingZones.ts` | `xpPerHour` das 4 zonas | 17 500 / 29 000 / 46 500 / 69 500 → **1 750 / 2 900 / 4 650 / 6 950** (x 0,1, mesma razão entre elas) | Uma caça de 4 h dava 70 mil XP (nível 39 no dia 2). O nível 10 custa 1 476 XP, o 25 custa ~12 mil, então as travas de receita (10/20/25) não valiam nada. **Não resolve T4 sozinho**, ver seção 4. |
| `src/game/tunables.ts` (novo) | `battle.defeatGoldKept` | 0,5 (era a divisão `acc.gold / 2` escrita em `BattleModal.tsx`) → **0,75** | Derrota passa a manter 75% do ouro da sessão. O texto "Ouro retido: -50%" virou `-{n}%` nos dois idiomas e lê o tunable. |

Tentativas que **não** entraram: `bossHpMult` 0,5 (chefe 100 mais fraco que o andar 99), `hpGrowth`/`dmgGrowth` (qualquer aumento que adie o andar 50 estraga a primeira sessão, ver T6), `waveHeal` entre 0,1 e 0,29 (primeira sessão no andar 6 ou 7).

## 2. Mudanças de código que não são números

- **Save:** `normalizeSave` (`engine.ts`) agora valida `gold`, `shards`, `victories` (inteiros finitos >= 0, teto `Number.MAX_SAFE_INTEGER`), `vit` (inteiro 0 a 300 = 3 pontos por nível no nível 100) e `armorLevel` (inteiro >= 1); qualquer outra coisa volta ao padrão (0, 0, 0, 0, 1). Os 3 testes `it.fails` de `save.test.ts` viraram testes normais e há um novo para `victories` e para os limites. `str`, `agi`, `res` e `weaponLevel` continuam sem validação (o combate já os sanitiza).
- **CP recomendado:** `recommendedCpForFloor` (`dungeon.ts`) lê `src/game/recommendedCp.ts`, gerada por `scripts/sim/cpTable.gen.ts` a partir de ~270 builds "razoáveis" (`scripts/sim/ladder.ts`): para cada andar, o menor CP a partir do qual 80% dos builds até 10% mais fortes limpam o andar com HP cheio e sem poções, depois o máximo acumulado (nunca decresce). Andares 1 a 9 ficam em 58, o CP de um herói novo. `cpStart`/`cpEnd` saíram dos biomas.
- **Simulação:** mesmo laço de combate espelhado de `BattleModal.tsx` (conferido, continua igual), com `defeatGoldKept` no lugar da divisão por 2 e um parâmetro de diagnóstico `maxStages`. A política deixou de gastar na poção ouro que a próxima forja precisa (antes ela podia usar metade da reserva, o que atrasava a primeira peça para o dia 3 quando as sessões passaram a limpar andares). Novos eventos: andar 50 e chefe 50; novo ledger de XP por fonte; relatório com a seção de metas.
- **Saves existentes:** um save no tier 1 passa a ter 3 espaços no próximo carregamento. Uma recompensa de caça **já pendente** guarda a capacidade de quando foi encerrada (`pouchCapacity`) e não é reprocessada.

## 3. Antes e depois das metas

Mediana entre as 20 seeds, com (mín–máx). "Depois" é o Cenário A; o B (A + uma visita curta) está entre colchetes quando difere. "Antes" é o baseline `dbb65b5`.

| Meta | Antes (A) | Depois (A) [B] | Resultado |
| --- | --- | --- | --- |
| **T1** Caça de 4 h com Bolsa tier 1 mantém os 3 tipos | 147 farrapos sorteados, 0 guardados; 0/20 sessões mantêm o comum | **20/20 sessões sem nenhuma perda**, os 3 tipos caem em 20/20, 0 unidades perdidas | atingida |
| **T2** 1ª sessão da conta nova termina no andar >= 8; checkpoint do 10 no dia 1 | andar 6 (6–6), 33 s; checkpoint do 10 no dia 2 | andar **8** (8–8), 57 s; checkpoint do 10 no **dia 1** (1–1) | atingida |
| **T3** 1ª peça forjada no dia 1 ou 2 | nunca (0/20) | dia **2** (2–2) [2] | atingida |
| **T4** Nível fim do dia 1 / 3 / 14 (10–16 / 20–28 / 45–60) | 6 / 48 (48–51) / 62 (62–63) | **13** (13–13) / **49** (28–58) / **68** (65–70) [13 / 49 (41–58) / 68 (64–70)] | **dia 1 ok; dias 3 e 14 não** (seção 4) |
| **T5** Chefe do 25 vencido no dia 4–6; quem acaba de limpar o 24 perde | nunca (0/20); 0% de vitória | dia **6** (5–7) [5,5 (4–7)]; quem acaba de limpar o 24 (CP 119–215) vence em **0%** das 8 tentativas; quem vence tem CP 579 (548–610), arma e armadura T2, nível 58 | atingida |
| **T6** Andar 50 não antes do dia 12 | nunca chega ao 50 (parado no 25) | **chefe do 50** vencido no dia 13 (10–14), só 10/20 seeds em 14 dias [13 (10–14), 17/20]; **chegada** ao andar 50 no dia **6** (5–7) | **chefe: atingida na mediana (mínimo dia 10); chegada ao andar 50: não** |
| **T7** Andar depois do chefe >= andar antes (HP x dano) | razões (N+1)/(N−1): 8,19 / 4,93 / 2,14 (chefes 25/50/75) | 8,19 / 4,93 / **1,12** | atingida (margem menor no 75) |
| **T8** Derrota mantém 75% do ouro | 50% | 75% | atingida |

Contra-prova do **B contra A** (B não pode ser mais de ~1,5 dia mais rápido): peça forjada 0, refino 0, checkpoint 10 0, chefe 25 0,5, zona 2 0,5, chefe 50 1 dia (entre as seeds que chegam; mas 17/20 chegam no B e 10/20 no A). Passou, com a ressalva do último marco.

Outros números úteis do "depois" (A): CP 119 no dia 1, 390 no dia 3, 672 no dia 6, 971 no dia 14; arma/armadura tier 2 no dia 5, tier 3 na arma no dia 10; zona de caça 2 no dia 6.

## 4. Metas não atingidas, conflitos e evidências

### T4 (nível dos dias 3 e 14) conflita com a regra E: os Pedidos dão 90%+ do XP

Com as chaves da Caça no escopo, não há como chegar na meta: a partir do dia 3 o XP do dia vem quase todo dos **Pedidos** (`deliveries.xpPerHour*`, 39 000 a 60 000 XP por hora de pedido, fora do escopo). Mediana do XP por dia no Cenário A depois do pacote:

| Dia | XP total | Masmorra | Caça | Pedidos |
| --: | --- | --- | --- | --- |
| 2 | 7 119 | 129 | 6 990 | 0 |
| 3 | 298 625 | 0 | 9 086 | 294 625 |
| 6 | 570 957 | 3 501 | 0 | 561 542 |
| 9 | 659 875 | 0 | 0 | 659 875 |

(Consistente com `docs/DELIVERY_ORDERS.md`: 606 mil a 1,1 milhão de XP por dia por perfil. Antes do pacote o Cenário A não fazia pedidos porque não tinha material, por isso o baseline não mostrava isso.) O nível 25 custa ~12 mil XP; uma única entrega Local de 30 min (19 500 XP) já passa dele. Mesmo sem nenhum XP de Caça, os Pedidos levam o herói ao nível 49 no dia 3 e ao 60 no dia 6.

Isolando a Caça (política sem pedidos, só diagnóstico) o fator 0,1 acerta o dia 1 (13) e o dia 14 (46) e erra o dia 3 por pouco (31); fatores diferentes trocam um erro pelo outro, porque a curva alvo (nível 24 no dia 3 e 50 no dia 14) é mais curva do que um fator único consegue. Foi por isso que o 0,1 foi mantido: ele corrige o "nível 39 no dia 2" (agora 23) sem estrangular as zonas altas além do necessário.

**Evidência do que funcionaria (rodado com um harness temporário, não entregue):** multiplicar os `deliveries.xpPerHour*` e ajustar o chefe.

| Cenário | Nível dia 3 / dia 14 | Chefe do 25 | Chefe do 50 |
| --- | --- | --- | --- |
| Atual | 49 (28–58) / 68 (65–70) | dia 6 (5–7) | dia 13, 10/20 |
| Pedidos x 0,05 | 31,5 (28–39) / 52 (50–52) | dia 10 (8–14) | nunca |
| Pedidos x 0,02 | 29 (27–34) / 48 (46–49) | dia 12 (10–14), 18/20 | dia 14, 1/20 |
| Pedidos x 0,02 e `boss.hp` 150 | 29 (27–34) / 47 (44–48) | dia 6 (5–8) | dia 12 (10–13), 17/20 |

Ou seja: **T4 e T5 só cabem juntas se os Pedidos perderem ~98% do XP e o chefe ficar mais leve ao mesmo tempo**, porque o CP do herói depende do nível. Como os Pedidos eram regra E, o pacote entregue acerta o T5 no regime atual (Pedidos como motor de XP) e deixa o T4 registrado como não atingido. Se o diretor cortar o XP dos Pedidos, é preciso baixar `ENEMIES.boss.hp` junto (e regenerar `recommendedCp.ts`), senão o chefe do 25 passa a cair só no dia 12.

### T6: "chegar ao andar 50" não é atingível com as alavancas permitidas

O herói que vence o chefe do 25 (dia 6) chega ao andar 50 no mesmo dia: o bioma dos orcs (andares 26 a 49) pede só ~300 a 590 de CP, bem abaixo do chefe do 25 (620) e do CP do herói (579 no dia 6, 672 no fim do dia). Para o andar 50 só aparecer no dia 12 seria preciso um bioma 26–49 que pedisse 800 a 1 000 de CP, isto é, cerca de 3x o HP x dano atual dos orcs. As únicas alavancas permitidas são `hpGrowth`/`dmgGrowth`, que valem para todos os andares: o aumento necessário faz o herói novo morrer no andar 5 (T2) mesmo com `waveHeal` alto. Foi interpretado como "chefe do 50 vencido" (o marco do 50), paralelo ao T5. Nessa leitura: no A só 10/20 seeds vencem o chefe 50 em 14 dias (mediana de todas: depois do dia 14; entre as que chegam, dia 13); no B 17/20, mediana dia 13; a primeira seed é o dia 10 nos dois. **Se o diretor quis dizer "chegar ao andar 50", isto fica reportado como não atingido.** Solução estrutural para depois: subir HP/dano base dos orcs em `enemies.ts` (fora da lista de alavancas desta rodada).

### Observações que o diretor deve ver

- **Os chefes 75 e 100** ficaram só 1,15x (o 75 contra o 74) e 1,07x (o 100 contra o 99) o andar anterior em HP x dano, porque o minotauro serve de inimigo comum nos andares 76 a 99. Antes do pacote o 100 era 1,07x também e o 75 era 2,2x. O teste exige apenas que o chefe seja mais forte que o andar anterior e que o andar depois do chefe não seja mais fraco que o anterior ao chefe.
- **Masmorra ociosa nos dias 2 a 5:** com as 10 sessões e o chefe do 25 de pé, cada sessão dura 6 a 12 s e termina na derrota. É a consequência de uma parede que dura 4 dias; a recompensa de ouro de derrota (75%) quase não aparece porque nenhuma sessão limpa andar.
- **Ouro:** a Masmorra paga 139 de ouro no dia 1 e quase nada depois. O ouro vem de missões e pedidos (saldo mediano de 3 429 no dia 14).

## 5. Coisas da regra E que eu acredito que devem mudar depois

1. **XP dos Pedidos** (`deliveries.xpPerHour*`): evidência na seção 4. É o que impede os níveis 20/25 de valerem alguma coisa. Cortar para ~2% (mantendo a razão entre as distâncias) e baixar `ENEMIES.boss.hp` para ~150 mantém T5; os níveis passam a ser 29 no dia 3 e 47 no dia 14.
2. **Nada na Caça**: com 3 espaços e a emissão atual o Cenário A recebe de dezenas a centenas de comuns por dia (mediana 85 a 223 nos dias com caça) e perde 0; as chances de drop e o modelo de emissão não precisam mudar para o começo.
3. **Orcs (`enemies.ts`)**: o bioma 26–49 é fácil demais em relação ao chefe 25 (raw 302 a 590 contra 620). Se o diretor quiser a chegada ao andar 50 lá pelo dia 12, é por aqui.

## 6. Limitações da simulação

- Seeds diferem só em horário das visitas e sorteios de recompensa/raridade; o combate da Masmorra é praticamente determinístico (crítico 0% sem equipamento). Faixas estreitas não significam robustez.
- A política é gananciosa. Poções fortes, elixires, substats raros, gemas, Battle Pass, salvage e sessões extras com estilhaços não entram, e todos deixariam o herói mais forte. A política de Pedidos é "o de maior ouro que cabe em 12 h"; um jogador que não use Pedidos teria nível e ouro bem menores (com `noOrders` o Cenário A nem refina, porque o ouro vem dos Pedidos).
- O laço de combate é um espelho de `BattleModal.tsx` (conferido contra o código atual, sem divergência): 1x de velocidade, sem arredondamento por quadro, sem a janela de tensão dos chefes como escolha do jogador (a política só recua no primeiro chefe de bioma ainda não resgatado).
- **A tabela de CP recomendado** mede um andar de cada vez, com HP cheio, sem poções, equipamento comum sem substats nem gemas, pontos de atributo na proporção 35/30/20/15. Quem sobe vários andares chega ao seguinte com menos HP (a cura entre andares é de 30%). Os andares 26–49 aparecem com o CP do chefe 25 (620) por causa do máximo acumulado que a tabela exige, embora os orcs peçam 300 a 590. Os andares 80, 90 e 92 a 99 não são limpos por nenhum build da escada (até tier 6 +8, nível 100), e recebem o CP do build mais forte (2 988).
- Marcos são em dias inteiros (1 = primeiro dia); "5,5" é uma mediana entre seeds de 5 e 6.
- O Cenário B virou, na prática, "A com uma visita a mais por dia": com 3 espaços o truque das caças curtas não faz mais diferença.

---

# Rodada 2: XP dos Pedidos, chefes por andar e a escalada dos orcs

- **Commit:** `balance: slow levelling, per-boss tuning and a real orc biome climb`, em cima de `09540a6`. Decisões do diretor: (1) cortar o XP dos Pedidos até o Cenário A cair na meta T4; (2) manter o T5 sem tocar no minotauro dos andares 76–99; (3) T6 passa a significar **chegada** ao andar 50; (4) só listar os andares que ninguém limpa.
- **Regra E relaxada somente para:** `deliveries.xpPerHour*`. Ouro, requisitos, tempos e o resto dos Pedidos ficam como estavam. O XP da Caça continua x 0,1.
- **A simulação passou a rodar 21 dias** (antes 14) para mostrar a janela do andar 50. Os níveis "do dia 14" continuam lidos no dia 14.

## 7. Valores alterados na rodada 2

| Arquivo | Nome | Antes → depois | Por quê |
| --- | --- | --- | --- |
| `tunables.ts` | `deliveries.xpPerHourLocal / Curta / Regional / Longa / Especial` | 39 000 / 45 000 / 51 000 / 56 000 / 60 000 → **780 / 900 / 1 020 / 1 120 / 1 200** (x 0,02, mesma razão) | Os Pedidos davam mais de 90% do XP a partir do dia 3 (300 a 750 mil por dia). Com x 0,02 o dia 14 cai em 46 (faixa 45–60). x 0,01 dá 46 (44–47) e x 0,015 dá 47 (46–48): o dia 3 fica em 29 nos três, porque Caça (x 0,1) e Masmorra já somam ~19 mil XP até lá. Mantido o 0,02 sugerido. |
| `enemies.ts` | `ENEMIES.boss.hp` | 260 → **550** | Volta ao valor anterior à rodada 1: os andares 76–99 usam o minotauro como inimigo comum e ficam **exatamente** como antes do commit `09540a6` (testado, andar a andar). |
| `tunables.ts` | `battle.bossDmgMult` | 0,5 → **0,45** | Idem (também vale para os andares 76–99). |
| `tunables.ts` (novos) + `waves.ts` (`bossFloorMult`) | `battle.boss25HpMult / boss25DmgMult` | — → **0,22 / 1,0** | Chefe do 25 só nele: HP 584 (era 1 256 na rodada 1 e 2 657 no começo), golpe 131. Cai no dia 5 (4–6). |
| idem | `battle.boss50HpMult / boss50DmgMult` | — → **0,64 / 0,64** | Primeiras quedas do chefe 50 por volta do dia 12–13. 0,62 cai no dia 11 no B; 0,65 deixa 5/20 seeds (A) e 1/20 (B) chegarem. Muito sensível: com 0,6 foram 13/20 seeds e com 0,7 foi 1/20 (medidos com o chefe 25 ainda em 0,27 e 0,24). |
| idem | `battle.boss75HpMult / boss75DmgMult` | — → 1,0 / 1,0 | Sem mudança (já é 2,2x o andar 74). |
| idem | `battle.boss100HpMult / boss100DmgMult` | — → **1,2 / 1,2** | Sem isso o chefe 100 seria 1,07x o andar 99. Com 1,44x de HP x dano fica em 1,54x. |
| `enemies.ts` | `ENEMIES.orc.hp / dmg` | 110 / 18 → **150 / 22** | O bioma 26–49 pedia só 300–590 de CP, menos que o chefe 25; o herói atravessava tudo no dia do chefe. Com os novos valores ele limpa 26–29 no dia do chefe e depois sobe uns 2 a 3 andares por dia. |

Não mudaram: `hpGrowth`, `dmgGrowth`, `bossHpMult` (1,05), `waveHeal` (0,3), Caça x 0,1, mini-chefes (`miniBoss*`), biomas 3 e 4.

Mudanças de código sem número novo: o CP recomendado agora trata o checkpoint (andares 10, 20, 30... que não são chefe) como um pico de um andar só: ele guarda o valor medido dele, mas **não** eleva a tabela dos andares seguintes. Sem isso o checkpoint do 30 (medido ~610) fazia os andares 31–39 aparecerem até 37% acima do valor medido. Agora a maior sobrestimativa nos andares 26–49 é **1,6%** (0 andares acima de 10%). Consequência: a tabela não decresce exceto logo depois de um checkpoint (o teste foi ajustado). O gerador `npm run sim:cp` agora também imprime a lista da seção 9.

## 8. Antes e depois (T2 a T7)

"Antes" é a rodada 1 (`09540a6`); "depois" é a rodada 2. Mediana (mín–máx); B entre colchetes quando difere.

| Meta | Antes (rodada 1) | Depois (rodada 2) | Resultado |
| --- | --- | --- | --- |
| **T2** 1ª sessão >= andar 8; checkpoint 10 no dia 1 | andar 8 (8–8); dia 1 | andar **8** (8–8); dia **1** (1–1) | atingida (inalterada) |
| **T3** 1ª peça no dia 1–2 | dia 2 (2–2) | dia **2** (2–2) | atingida |
| **T4** Nível dia 1 / 3 / 14 (10–16 / 20–28 / 45–60) | 13 / 49 (28–58) / 68 (65–70) [13 / 49 (41–58) / 68 (64–70)] | **13 (13–13) / 29 (27–34) / 46 (44–48)** [13 / 30 (25–33) / 45 (42–47)] | dia 1 e dia 14 ok; **dia 3 um nível acima da faixa** |
| **T5** Chefe 25 no dia 4–6, quem limpa o 24 perde | dia 6 (5–7) [5,5 (4–7)]; 0% de vitória | dia **5 (4–6)** [5 (4–6)]; 0% de vitória ao chegar (CP 119). Quem vence: CP 380 (331–414), nível 34 (32–36), arma e armadura tier 2 [CP 384, nível 35] | atingida |
| **T6** Chegada ao andar 50: nenhuma seed antes do dia 10; chefe 50 pela 1ª vez por volta do dia 12–16 | chegada no dia 6 (5–7) nos dois; chefe 50: dia 13 (10–14), 10/20 [13, 17/20] | **chegada: dia 12 (10–15)** [11 (10–13)]; **chefe 50: 1ª queda no dia 12, 6/20 seeds em 21 dias (12–21)** [1ª queda no dia 13, 2/20 (13–20)] | atingida nos dois critérios; a seed mais rápida chega no dia 10 nos dois cenários |
| **T7** Andar depois do chefe >= andar antes | razões (N+1)/(N−1) para 25/50/75: 8,19 / 4,93 / 1,12 | **13,64 / 2,96 / 2,14** | atingida, com margem maior no 75 |
| Chefe >= 1,5x o andar anterior (HP x dano) | 25: 40x; 50: 5,3x; 75: 1,15x; 100: 1,07x | **25: 16,6x; 50: 2,5x; 75: 2,2x; 100: 1,54x** | atingida |

Progresso no Cenário A (mediana): andar 30 no dia 5, 38 no dia 9, 40 no dia 10, 44 no dia 11, 50 no dia 12. Arma tier 2 no dia 5, tier 3 no dia 10. CP: 272 (dia 3), 472 (dia 5), 603 (dia 10), 795 (dia 14), 819 (dia 21).

**Escalada dos orcs:** quem vence o chefe 25 no dia 5 limpa 26–29 no mesmo dia; o checkpoint do 30 (mini-chefe, +50% de HP) é o primeiro muro de verdade e só cai com gear tier 3 por volta do dia 10; depois o ritmo é de uns 2 a 3 andares por dia até o chefe 50. O CP medido por andar (tabela) vai de 381 (andar 26) a 664 (andar 49), contra 302 e 514 antes, e o chefe 25 mede 387.

### Meta que ficou fora

- **T4, dia 3:** nível 29 (27–34) contra a faixa 20–28. O XP até o fim do dia 3 vem da Caça (x 0,1: ~16 mil XP em dois claims) e da Masmorra (~2,5 mil), que já bastam para o nível 29, e a Caça foi mantida. Com a Caça em x 0,08 (rodado à parte, não entregue) o dia 3 vira 28 (26–34).
- Nenhuma outra.

## 9. Andares que nenhum build limpa (só relatório, não foram ajustados)

A escada vai até nível 100 com arma e armadura tier 6 +8 (CP 2 988). Ajuste de potência: CP = exp(0,276) x (HP x dano)^0,514, sobre os andares >= 26 medidos. "Vitórias" = 10 sorteios do melhor build.

| Andar | HP x dano | Melhor build | CP | Vitórias | CP necessário (extrapolado) |
| --: | --- | --- | --- | --- | --- |
| 90 (checkpoint, +50% HP) | 4 664 566 | Nível 100, tier 6 +8 | 2 988 | **20%** | ~3 510 |
| 100 (chefe) | 5 733 648 | idem | 2 988 | **10%** | ~3 900 |
| 80 (checkpoint) | 3 752 754 | idem | 2 988 | 100% | ~3 140 (o ajuste passa um pouco do real, que fica no topo da escada) |
| 95 a 99 | 3 438 270 a 3 721 685 | idem | 2 988 | 100% | ~3 000 a ~3 130 (idem) |

Os andares 81–89 e 91–94 também só são limpos pelos builds do topo (valor medido 2 811). Na rodada 1 a lista era "80, 90, 92–99" porque o minotauro estava com metade do HP numa geração intermediária da tabela; a tabela que foi para o commit da rodada 1 dizia "nenhum". Com os andares 76–99 de volta ao original, o que sobra de verdade é o 90 (por causa do checkpoint) e o 100 (por causa do multiplicador 1,2 x 1,2 do chefe 100), mais o topo da escada. A tabela mostra 2 988 (CP do build mais forte) nesses andares.

## 10. Dúvidas e limitações desta rodada

- **Tabela de CP com pico nos checkpoints:** não é mais estritamente monotônica. Era a única forma de cumprir "não sobrestimar mais de ~10%" com mini-chefes que medem ~25% acima dos vizinhos. Se for melhor voltar à tabela estritamente crescente, basta remover `isSpikeFloor` de `ladder.ts` (ela volta a sobrestimar os andares 31–39 e 41–49 em até 37%).
- **O corte do XP dos Pedidos** deixa `docs/DELIVERY_ORDERS.md` desatualizado (39–60 mil XP/h, 606 mil a 1,1 milhão de XP/dia); não editei esse documento.
- **Sensibilidade do chefe 50:** 0,6 → 13/20 seeds em 21 dias, 0,64 → 6/20, 0,7 → 1/20 (aproximado, ver seção 7). Qualquer mudança futura de CP (gear, refino, pontos) move isso bastante.
- **Dia 21, nível 48:** o nível praticamente estaciona (46 no dia 14, 48 no dia 21), porque agora só Caça e Pedidos pagam XP e a curva de nível cresce 12 a 17% por nível. Se isso for baixo demais para as travas de receita dos níveis 50+ (tier 4 pede 50), é preciso olhar a Caça nas zonas 2 e 3.
- O ajuste de extrapolação usa um expoente de 0,51 sobre HP x dano; é uma aproximação e superestima ~5% onde dá para conferir.
