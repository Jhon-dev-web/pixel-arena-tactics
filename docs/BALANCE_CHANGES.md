> **2026-10-11:** a moeda rara (`shards` no código e nos saves) agora se chama **Runas** (pt) / **Runes** (en) para o jogador; neste documento ela aparece como "Fragmento(s)" / "Shards", o nome antigo.

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

---

# Rodada 3: raridade, substats e atributos (parte A) e o pacote de conteúdo 1 (parte B)

Fonte dos números: `docs/ITEM_BALANCE_AUDIT.md` (estado antes) e `npm run sim:items`. Testes das regras: `src/game/__tests__/itemBalance.test.ts`.

## 11. Parte A: o que mudou em raridade, substats e gemas

| Regra | Antes | Depois |
| --- | --- | --- |
| R4 chances de raridade | 60 / 25 / 12 / 3, realizadas 59,9 / 25,0 / 12,1 / 3,0 (300 mil sorteios) | **não mudou** (sem bug; só `applyForge` sorteia) |
| R1 `statMult` | comum 1, rara 1, épica 1,05, lendária 1,15 | comum 1, **rara 1,02, épica 1,06, lendária 1,18** |
| R1 CP mediana (arma + armadura da raridade, substats medianas, tiers 1 a 6, +0 e +8) | rara +2,7 a +4,3 %, épica +10,5 a +13,0 %, lendária +20,8 a +26,0 % | rara +3,8 a +5,3 %, épica +8,5 a +12,2 %, lendária +18 a +26 % (teste pega a mediana de 301 sorteios por célula) |
| R2 substats | `maxHp` 15-40 +5/tier (21 % do duelo no T1, 3,7 % no T6), `lifesteal` 1-4 % +0,3/tier (19 % no T6), `critDamage` 5-12 % +1/tier (0,5 % no T1). Razão máx/mín entre as 5 substats de combate: 44x (T1), 6x (T3), 6x (T6) | `critDamage`, `lifesteal` e `maxHp` ganharam faixas por tier (`SUBSTATS[].ranges`): mediana de cada uma vale 3,5 a 5,1 % de margem de duelo em todos os tiers (razão <= 1,5x) |
| R2 `goldBonus` | 3-8 % +0,5/tier por peça (66 % possíveis com 6 peças) | 2-5 % +0,25/tier por peça e **teto de 25 % no total equipado** (`GOLD_BONUS_CAP`, em `equippedSubstatTotals`) |
| R3 atributos | nenhuma build "tudo em um" passa de +25 % nos dois eixos (melhor: STR no nível 60, -2 % de profundidade) | **sem mudança** |
| Gema | rubi +15 % de dano crítico (estritamente pior que safira e esmeralda) | rubi **+30 %** |

Peças que o jogador já tem mantêm as substats antigas (o valor sorteado fica gravado na peça); a reforja já usa a tabela nova.

## 12. Parte A: metas da R5 depois dessas mudanças (cenário A, mediana)

Dia 1 nível 13; dia 3 nível 29; dia 14 nível 46; primeira peça no dia 2; chefe do 25 no dia 5; chegada ao 50: primeira seed no dia 10, mediana 12; chefe do 50 primeira seed no dia 11. Tudo igual ao estado antes (a única diferença é o chefe 50, 1 dia mais cedo para a primeira seed, 4/20 em 21 dias contra 6/20). Não foi preciso mexer em inimigos.

## 13. Parte B: os quatro slots novos e as 36 peças

Capacete, luvas, botas e anel passam a ser slots **instanciados** (raridade, substats, refino, durabilidade, soquetes e reforja, como arma e armadura; `INSTANCED_SLOTS` tem 6 slots). Slot vazio não dá nada (sem item inicial). Os atributos entram em `buildCombatStats` / `playerMaxHp` por `equippedExtraStats` (gearInstances.ts), então a Masmorra, a Caça e a CP leem os mesmos números (o `BattleModal` e o `computeHuntingStatus` já usavam o `buildCombatStats`; não havia segunda montagem para espelhar). Identidade: capacete = PV + um pouco de resistência; luvas = dano (entra no termo da arma, então a FOR também o multiplica) + um pouco de crítico; botas = resistência + um pouco de PV; anel = chance de crítico + dano crítico (`critMultBonus` é lido em Masmorra e Caça). Saves antigos: sem mudança de chave; os slots novos nascem vazios e o antigo `equipped.helmet` (sempre `null`) é descartado. Testes em `src/game/__tests__/extraSlots.test.ts`.

**Orçamento de poder** (par arma + armadura comum +0 do tier, mais as 4 peças comuns +0 do mesmo tier): +30,2 % (T1), +30,1 % (T2), +32,5 % (T3), +33,3 % (T4), +35,0 % (T5), +36,8 % (T6) de CP. Cada peça vale ~8 % de CP sozinha; o anel só chega lá no T5-T6 (3 % no T1 a 9 % no T6) porque crítico só rende quando a chance de crítico já é alta. Capacete ~40 % do HP da armadura do tier, luvas ~20-30 % do dano da arma (as diretrizes eram 35 % e 20 %; o orçamento total de +30-40 % mandou).

**Receitas:** mesmo nível mínimo da arma/armadura do tier (T1 sem nível, 10, 25, 50, 70, 90), famílias de material que o tier já usa, **1 peça do tier anterior do mesmo slot** a partir do tier 2 (sem a cadeia de "2 de"), sem fragmentos. Custo só da receita (Ouro + materiais a valor de referência, gema = 4): 41 a 55 % da armadura do tier (testado entre 38 e 62 %). Anéis de T3 em diante pedem uma gema (esmeralda, rubi, rubi, safira). O T1 usa barra de cobre + 2 retalhos de couro (a primeira versão usava 17 retalhos de couro a mais e empurrava o nível do dia 3 para 32, fora da meta).

### Peças forjadas e únicas

| Peça | Slot | Tier | Atributos | Receita | Custo da receita (Ouro ref.) |
| --- | --- | --: | --- | --- | --: |
| bronze_helm | helmet | 1 | PV 20, resist. 0.7% | 20 Ouro + 1 copper_bar, 2 leather_scrap | 82 |
| iron_helm | helmet | 2 | PV 40, resist. 1.3% | 60 Ouro + 1x bronze_helm + 2 iron, 1 leather_scrap + nível 10 | 69 |
| steel_helm | helmet | 3 | PV 70, resist. 1.9% | 160 Ouro + 1x iron_helm + 2 steel, 1 silver_ingot, 3 bone_fragment, 2 demon_claw, 1 demon_core + nível 25 | 355 |
| gilded_helm | helmet | 4 | PV 109, resist. 2.6% | 300 Ouro + 1x steel_helm + 1 gold_bar, 2 concentrated_blood + nível 50 | 356 |
| voidsteel_helm | helmet | 5 | PV 149, resist. 3.1% | 850 Ouro + 1x gilded_helm + 1 refined_obsidian, 2 concentrated_blood, 1 demon_core + nível 70 | 934 |
| abyssal_helm | helmet | 6 | PV 185, resist. 3.6% | 1500 Ouro + 1x voidsteel_helm + 1 refined_obsidian, 3 concentrated_blood, 1 corrupted_crystal + nível 90 | 1588 |
| leather_gloves | gloves | 1 | dano 4, crít. 2% | 25 Ouro + 1 copper_bar, 2 leather_scrap | 87 |
| iron_gauntlets | gloves | 2 | dano 7, crít. 2% | 60 Ouro + 1x leather_gloves + 2 iron, 1 leather_scrap + nível 10 | 69 |
| steel_gauntlets | gloves | 3 | dano 13, crít. 2% | 160 Ouro + 1x iron_gauntlets + 1 steel, 2 silver_ingot, 2 bone_fragment, 2 demon_claw, 1 demon_core + nível 25 | 350 |
| gilded_gauntlets | gloves | 4 | dano 18, crít. 2% | 300 Ouro + 1x steel_gauntlets + 1 gold_bar, 2 concentrated_blood, 1 demon_core + nível 50 | 381 |
| voidsteel_gauntlets | gloves | 5 | dano 28, crít. 2.7% | 900 Ouro + 1x gilded_gauntlets + 1 refined_obsidian, 2 corrupted_crystal, 1 demon_core + nível 70 | 1024 |
| abyssal_gauntlets | gloves | 6 | dano 37, crít. 3% | 1500 Ouro + 1x voidsteel_gauntlets + 1 refined_obsidian, 3 corrupted_crystal + nível 90 | 1623 |
| leather_boots | boots | 1 | PV 12, resist. 6.5% | 25 Ouro + 1 copper_bar, 2 leather_scrap | 87 |
| iron_greaves | boots | 2 | PV 22, resist. 8% | 55 Ouro + 1x leather_boots + 2 iron, 2 leather_scrap + nível 10 | 66 |
| steel_greaves | boots | 3 | PV 35, resist. 10% | 160 Ouro + 1x iron_greaves + 2 steel, 1 silver_ingot, 3 bone_fragment, 2 demon_claw, 1 demon_core + nível 25 | 355 |
| gilded_greaves | boots | 4 | PV 50, resist. 12% | 300 Ouro + 1x steel_greaves + 1 gold_bar, 2 concentrated_blood + nível 50 | 356 |
| voidsteel_greaves | boots | 5 | PV 62, resist. 13.5% | 850 Ouro + 1x gilded_greaves + 1 refined_obsidian, 3 concentrated_blood + nível 70 | 913 |
| abyssal_greaves | boots | 6 | PV 76, resist. 14.5% | 1500 Ouro + 1x voidsteel_greaves + 1 refined_obsidian, 3 concentrated_blood, 1 corrupted_crystal + nível 90 | 1588 |
| copper_ring | ring | 1 | crít. 6%, dano crít. +15% | 30 Ouro + 1 copper_bar, 2 leather_scrap | 92 |
| silver_ring | ring | 2 | crít. 6%, dano crít. +20% | 65 Ouro + 1x copper_ring + 2 iron, 2 leather_scrap + nível 10 | 76 |
| gold_ring | ring | 3 | crít. 8%, dano crít. +25% | 170 Ouro + 1x silver_ring + 1 steel, 2 silver_ingot, 2 bone_fragment, 2 demon_claw, 1 demon_core + 1 emerald + nível 25 | 364 |
| ruby_ring | ring | 4 | crít. 8%, dano crít. +30% | 320 Ouro + 1x gold_ring + 1 gold_bar, 2 concentrated_blood + 1 ruby + nível 50 | 380 |
| obsidian_ring | ring | 5 | crít. 9%, dano crít. +35% | 900 Ouro + 1x ruby_ring + 1 refined_obsidian, 1 demon_core, 1 corrupted_crystal + 1 ruby + nível 70 | 1003 |
| abyssal_ring | ring | 6 | crít. 10%, dano crít. +40% | 1550 Ouro + 1x obsidian_ring + 1 refined_obsidian, 2 corrupted_crystal, 2 concentrated_blood + 1 sapphire + nível 90 | 1662 |
| Único | Slot | Tier | Atributos (gêmea +10% no principal) | Fonte | Chance |
| --- | --- | --: | --- | --- | --- |
| demon_fang_dagger | weapon | 2 | dano 33, crít. 6% | caça demon_glade | 0.01% por vitória (x f) |
| demonhide_vest | armor | 2 | PV 99, resist. 6% | caça demon_glade | 0.01% por vitória (x f) |
| bloodbound_cleaver | weapon | 3 | dano 72, crít. 10% | caça blood_marsh | 0.0125% por vitória (x f) |
| bloodvein_plate | armor | 3 | PV 176, resist. 10% | caça blood_marsh | 0.0125% por vitória (x f) |
| riftwalker_boots | boots | 4 | PV 50, resist. 13.2% | caça demon_rift | 0.02% por vitória (x f) |
| shadow_hood | helmet | 4 | PV 120, resist. 2.6% | caça demon_rift | 0.02% por vitória (x f) |
| abyss_heart_ring | ring | 5 | crít. 9.9%, dano crít. +35% | caça blood_abyss | 0.015% por vitória (x f) |
| bonecrusher_maul | weapon | 5 | dano 176, crít. 20% | caça blood_abyss | 0.015% por vitória (x f) |
| goblin_king_crown | helmet | 2 | PV 44, resist. 1.3% | chefe do andar 25 | 8% por vitória |
| warchief_gauntlets | gloves | 3 | dano 14, crít. 2% | chefe do andar 50 | 8% por vitória |
| lich_soul_ring | ring | 5 | crít. 9.9%, dano crít. +35% | chefe do andar 75 | 8% por vitória |
| overlord_greataxe | weapon | 6 | dano 242, crít. 24% | chefe do andar 100 | 8% por vitória |

Únicos: instanciados, a raridade é sorteada na hora do drop com a tabela normal 60/25/12/3, **um slot extra de substat** garantido (lendário = 4), nunca forjados (sem receita), podem ser desmontados (devolvem o material da gêmea forjada, `salvageLike`), refinados, reforjados, descartados. Atributos = a peça forjada do tier normal de onde cai, +10 % no atributo principal (dano nas armas e luvas, PV na armadura e capacete, resistência nas botas, chance de crítico no anel).

- **Caça** (4 zonas, 2 únicos cada): sorteados em cada vitória dentro do modelo econômico, com a mesma fração `f` dos materiais (um build mais rápido não multiplica), em um fluxo aleatório separado (a Caça fica idêntica bit a bit). Sem multiplicador de profundidade, sub-nível ou Passe. Calibrado com `computeHuntingStatus` (rolls econômicos/h ~200 / 167 / 107 / 135): dois únicos por zona dão **1 único a cada ~4 dias de 6 h/dia** de caça na zona (teste: 0,6 a 1,7 por 24 h). Não ocupam espaço da Bolsa de Caça. Ficam congelados na recompensa pendente; no claim viram peças guardadas, e as que **não cabem na Mochila continuam na recompensa pendente** (ouro/XP/materiais já pagos e zerados) até o jogador abrir espaço. Isso bloqueia iniciar nova caça enquanto houver único pendente, como qualquer recompensa pendente.
- **Chefes** (25 / 50 / 75 / 100): 8 % por vitória (`T.battle.uniqueBossChance`), repetível, mesmo em derrota depois de limpar o chefe. A peça é entregue mesmo com a Mochila cheia (a Mochila pode mostrar acima da capacidade até o jogador abrir espaço), para nunca perder o drop.

## 14. Parte B: o que mudou nos inimigos para equilibrar em volta de um herói com 6 slots

Com a política da simulação craftando os 6 slots (arma > armadura > luvas > capacete > botas > anel, tier mais baixo primeiro), o herói do mesmo dia fica ~30-35 % mais forte em CP. Sem mexer nos inimigos o chefe 25 caía no dia 3,5 e o andar 50 aparecia no dia 5. Mudanças (tunables/enemies):

| Valor | Antes | Depois |
| --- | --- | --- |
| Orc (andares 26-49): HP / dano base | 150 / 22 | **250 / 37** |
| Feiticeiro (51-75): HP / dano base | 240 / 38 | **312 / 49** (x1,3) |
| Minotauro (76-99 e chefes): HP / dano base | 550 / 75 | **715 / 98** (x1,3) |
| `boss50HpMult` / `boss50DmgMult` | 0,64 / 0,64 | **0,82 / 0,82** |
| `boss25*`, `boss75*`, `boss100*`, `hpGrowth`, `dmgGrowth` | 0,22 / 1; 1 / 1; 1,2 / 1,2; 0,15; 0,12 | sem mudança (goblins e andares 1-25 intactos: a primeira sessão e o dia 1 não mudam) |
| Tabela de CP recomendada (`npm run sim:cp`) | andar 25: 387, 50: ~1 056, 100: 4 244 (builds só com arma + armadura) | andar 25: **546**, 50: **1 794**; o andar 100 não é limpo por nenhum build da escada (a escada agora veste os 6 slots do tier) |
| `ladder.ts` | par arma + armadura | os 6 slots do tier, comuns, mesmo refino |

O chefe 50 é extremamente sensível (HP e dano multiplicados juntos): 0,80 -> 3/20 seeds até o dia 21, 0,84 -> primeira seed no dia 19. Em nenhum valor testado as duas condições "primeira seed entre os dias 12-16 no A **e** no B" valem juntas: a seed mais forte do cenário B chega ao andar 50 no dia 10 e já derruba o chefe até 0,83. Fiquei em 0,82 (A: primeira seed dia 16, 4/20 em 21 dias; B: primeira seed dia 10, 3/20), perto do baseline anterior (6/20).

## 15. Metas da R5, antes e depois de toda a rodada 3 (cenário A, mediana)

| Meta | Antes (baseline) | Depois |
| --- | --- | --- |
| Primeira sessão termina no andar >= 8; checkpoint 10 no dia 1 | 8; dia 1 | 8; dia 1 |
| Primeira peça forjada | dia 2 | dia 2 |
| Nível dia 1 / 3 / 14 (alvos 10-16 / 20-29 / 45-60) | 13 / 29 (27-34) / 46 (44-48) | 13 / 29 (27-34) / 48 (46-51) |
| Chefe 25 vencido pela 1ª vez (alvo dia 4-6) | dia 5 (4-6) | dia 5 (4-6); cenário B: 4,5 |
| Chegada ao andar 50 (nenhuma seed antes do dia 10) | 1ª seed dia 10, mediana 12 | 1ª seed dia 10, mediana 13 (B: 10 / 13,5) |
| Chefe 50 | 1ª seed dia 12, 6/20 em 21 dias | 1ª seed dia 16, 4/20 (B: dia 10, 3/20) |
| Queda de dificuldade depois de chefe (razão (N+1)/(N-1) em HP x dano >= 1) | 2,14 | 1,77 |
| CP mediana no dia 14 | 795 | 1 103 |

O nível do dia 3 depende de quanta Caça a política faz; ver o ajuste da receita do T1 acima.

## 16. Pontos abertos para o diretor decidir

- **Chefe 50:** a meta antiga "primeira seed nos dias 12-16 no A e no B" não é alcançável com o mesmo número nos dois cenários (uma seed do B é um outlier forte). Ficou 0,82.
- **Mediana de chegada ao andar 50 subiu de 12 para 13** (o orc ficou 1,7x mais forte contra +30 % de CP dos novos slots): se quiser a mediana em 12 sem perder o piso do dia 10, é preciso reduzir a variância de CP entre seeds, não só o inimigo.
- **Refino do +4 em diante** custa 17x a 200x mais Ouro por ponto de CP do que forjar o tier seguinte (auditoria F1) e **o salto de custo por CP do T2 para o T3 é 3,1x** (auditoria E1): não alterei receitas de armas/armaduras.
- **Dourado (T4) é beco sem saída:** o T5 só aceita o dragão como ingrediente. Os capacetes/luvas/botas/anéis do T4 existem em uma linha só (dourada) e o T5 deles aceita a peça dourada.
- **Refino na política da simulação:** só arma e armadura são refinadas pela simulação; as peças novas ficam +0. Um jogador que refine os 6 slots passa dos números acima.
- Peças que o jogador já tinha mantêm as substats antigas (ver seção 11).

---

# Rodada 4: queimadura, reflexo e relíquias passam a funcionar no combate

## 17. O problema e o que passou a valer

Quatro efeitos anunciados no equipamento eram dado morto (nenhum código de combate ou de tela lia): `burn` nas armas do dragão para cima, `reflect` na placa de aço, `focusHpBonus` no Anel de Vitalidade e `attackStaminaReduction` no Amuleto da Rapidez (vinham da arena antiga de foco/energia). Agora os três laços de combate (o laço de frames do `BattleModal.tsx`, a simulação de Caça de `huntCombat.ts` e o espelho `scripts/sim/driver.ts`) leem os mesmos auxiliares puros de `derivedStats.ts` (`igniteBurn`/`tickBurn`, `reflectedDamage`, `regenAmount`, `heroAttackIntervalMs(agi, bônus)`) e `buildCombatStats` entrega `burn`, `reflect` e `hpRegenPct` em `CombatStats` (a Caça congela os três junto das outras estatísticas da sessão; sessões antigas sem o campo contam como sem efeito).

| Efeito | Regra | Números |
| --- | --- | --- |
| Queimadura (armas `burn`) | todo golpe do herói acende ou renova uma queimadura de 3 s no inimigo; ela causa por segundo 6 % do dano final do golpe **antes do crítico** (bênção e elixires incluídos); não acumula (renova a duração e leva o dano do golpe mais novo, o relógio dos ticks mantém a fase); inimigos não têm mitigação | `T.battle.burnPctPerSec` 0,06 · `burnDurationMs` 3000 · `effectTickMs` 1000 |
| Reflexo (armaduras `reflect`) | quando o herói leva um golpe, o atacante leva `reflect` x o dano que **realmente saiu** da vida do herói (depois da resistência); não reflete no golpe que mata o herói; escala com a durabilidade da armadura, não com a raridade | aço 20 %, dourada 20 %, dragão 22 %, voidsteel 25 %, abissal 28 %; tiers 1-2 nada |
| Regeneração (relíquia `hpRegenPct`) | a cada tick de 1 s **em combate** (não na pausa entre andares) cura essa fração da vida máxima, sempre limitada à vida máxima | **0,9 %** da vida/s (decisão do diretor: 1,5 %, ver a seção 18) |
| Velocidade de ataque (relíquia `attackSpeedBonus`) | divide o intervalo vindo da AGI e passa pelo mesmo piso de 400 ms | +8 % |

Ordem de eventos no mesmo instante, igual nos dois laços de eventos: golpe do herói, golpe do inimigo, tick da queimadura, tick da regeneração. Os únicos (`unique`) agora herdam `burn` e `reflect` da gêmea (antes copiavam só dano, PV, resistência, crítico e dano crítico): `bonecrusher_maul` e `overlord_greataxe` queimam, `bloodvein_plate` reflete 20 %. Os campos mortos `focusHpBonus` e `attackStaminaReduction` saíram do tipo e dos dados; os saves antigos guardam a relíquia só pelo id do molde, então **não há migração** (teste: um save com a relíquia equipada carrega igual). `LIVE_STAT_FIELDS` / `META_FIELDS` em `gear.ts` e o teste `gearEffects.test.ts` impedem que um campo numérico/booleano sem leitura no combate volte em silêncio. `src/legacy-arena` (fora do type-check, protótipo histórico) ainda cita os dois campos antigos e não foi tocado.

Visual: chama sobre o inimigo enquanto ele queima e números laranja a cada tick no `BattleModal`; o reflexo aparece como `↩ -N` no inimigo; a regeneração como `+N` verde no herói. As linhas de estatística da Forja, do Inventário e do Equipamento saem do dado (pt e en), p.ex. "Queimadura: 6% do dano/s por 3s", "Reflete 20% do dano sofrido", "Regenera 0,9% da vida/s", "+8% velocidade de ataque". Só as descrições do Anel de Vitalidade e do Amuleto da Rapidez mudaram (falavam de foco e de energia).

## 18. Números que mudei em relação ao que o diretor fixou, e por quê

Medido com `npm run sim:items` (seção G do `ITEM_BALANCE_AUDIT.md`): razão maior / menor do valor real de combate (Δln P da margem do duelo) entre as três relíquias, que disputam um slot e devem ficar dentro de 1,5x nos níveis 30 e 60.

| Valor | Decisão | Medido com ela | Final |
| --- | --- | --- | --- |
| `ring_vitality.hpRegenPct` | 1,5 %/s | Δln P 12,8 % (nível 30) e 16,4 % (nível 60) contra 7,0 % / 7,1 % do amuleto: razão **2,7** nos dois níveis | **0,9 %/s**: 7,5 % e 9,5 %, razão 1,07 (nível 30) e 1,34 (nível 60) |
| `berserker_crest.critMultBonus` | (não estava na lista; 0,5) | só +2,6 % de CP no nível 30 e +3,4 % no 60, Δln P 4,7 % / 6,2 %: abaixo da faixa de +4-7 % de CP e a mais de 1,5x da regeneração | **0,75**: +3,9 % / +5,0 % de CP, Δln P 7,0 % / 9,1 % |
| `amulet_swiftness.attackSpeedBonus` | +8 % | +3,8 % de CP, Δln P 7,0 % / 7,1 % | mantido |
| reflexo da placa de aço | 20 % | 10,4 % do dano total causado no nível 25 (um pouco acima do "~10 %"); os tiers 4-6 ficam em 7,3-7,6 % | mantido em 20 % (o limite do teste é 11 %) |

Relíquias no ponto em que ficam forjáveis (nível 30, equipamento T3+4): Anel +4,4 % de CP, Amuleto +3,8 %, Crista +3,9 % (nível 60: +4,5 / +3,9 / +5,0 %), o que é "cerca de +4-7 %"; no nível 20, quando só dá para sintetizar essência com equipamento T2, a Crista rende +2,6 % porque a chance de crítico ainda é baixa. No nível 90 a Crista (+12,9 % de Δln P) passa de 1,5x do amuleto: o enunciado só pede os níveis 30 e 60.

Queimadura: soma 3,5-4,1 % ao dano total (Δln P +3,6 a +4,2 %, CP +1,9 a +2,2 %), muito abaixo do teto de 12 %. A linha do dragão no tier 4 fica **20 % acima** da dourada em CP (nível 50: 985 contra 821) por um par que custa 5 382 contra 1 489 de Ouro de referência; a queimadura vale ~2 pontos desses 20, o reflexo de 22 % contra 20 % o resto de um décimo. Reflexo: 7,3-7,6 % do dano total nos tiers 4-6.

Pesos de CP (`T.advanced`): `cpBurnWeight` 0,95, `cpReflectWeight` 0,5, `cpRegenWeight` 1,8 (a velocidade de ataque já entra no dps pelo `heroMs`). Calibrados para o ΔCP ficar perto de metade do Δln P medido: queimadura +2,2 / +2,0 / +1,9 % de CP contra Δln P/2 de 2,1 / 1,95 / 1,8 %; reflexo +4,0-4,6 % contra 3,8-4,0 % (o aço fica em 4,2 contra 5,5 %); regeneração +4,4 / +4,5 / +3,0 % (níveis 30 / 60 / 90) contra 3,7 / 4,8 / 3,9 %. A fórmula: a queimadura soma `peso x dmgBase x 6 % x (1000/tick)` ao dps; o reflexo multiplica os golpes por `1 + peso x reflect / (1 + resistência)`; a regeneração entra na sustentação (sigma) como `peso x regen/s x ehp / golpes/s`, somada à do roubo de vida e sob o mesmo teto de 0,5.

## 19. Metas da R5 depois da rodada 4 (cenário A, mediana)

A simulação agora forja e equipa a relíquia (a de maior CP, uma só) depois do conjunto completo do tier 3; a mediana é o dia 10.

| Meta | Antes (rodada 3) | Depois |
| --- | --- | --- |
| Primeira sessão termina no andar >= 8 | 8 | 8 |
| Primeira peça forjada (alvo <= dia 2) | dia 2 | dia 2 |
| Nível dia 1 / 3 / 14 (alvos 10-16 / 20-29 / 45-60) | 13 / 29 (27-34) / 48 (46-51) | 13 / 29 (27-34) / 49 (46-51) |
| Chefe 25 vencido pela 1ª vez (alvo dia 4-6) | dia 5; B: 4,5 | dia 5; B: 4,5 |
| Chegada ao andar 50 (nenhuma seed antes do dia 10) | 1ª seed dia 10, mediana 13 | 1ª seed dia 10, mediana 14 (B: 10 / 13) |
| Queda de dificuldade depois de chefe ((N+1)/(N-1) >= 1) | 1,77 | 1,77 |
| Chefe 50 | 1ª seed dia 16, 4/20 em 21 dias (B: dia 10, 3/20) | 1ª seed dia 14, 2/20 (B: dia 10, 7/20) |
| CP mediana no dia 14 | 1 103 | 1 196 |

**Retoque nos inimigos (um só):** `boss50HpMult` e `boss50DmgMult` 0,82 -> **0,84**. Só com os efeitos novos (0,82) a primeira seed passava a derrubar o chefe 50 no dia 11 (era 16) e a faixa 12-16 do cenário A se perdia; 0,83 deu dia 12 com 2/20, 0,85 dia 14 com 2/20 e 0,88 deixa 1/20 em 21 dias. Todas as outras metas do enunciado ficaram dentro da faixa sem mexer em orcs, feiticeiros, minotauros nem na curva (a tabela de CP recomendada foi regerada com `npm run sim:cp`: andar 25 igual a 546, andar 50 de 1 794 para 1 849, andar 100 de 4 478 para 4 721). O cenário B tem agora 7/20 seeds com o chefe 50 em 21 dias (antes 3/20): as seeds fortes do B fazem a relíquia mais cedo; é cenário de sensibilidade, não meta. O critério do dia 3 do código passou de 20-28 para 20-29 (o valor 29 já era o resultado da rodada 3, que o documento marcava "FORA DA META").

## 20. Pontos abertos

- **A regeneração é a mais sensível ao nível:** Δln P de 4,7 % (nível 20), 7,5 % (30), 9,5 % (60) e 7,7 % (90), porque rende na duração da luta; o valor em CP (4,4 % / 4,5 % / 3,0 % nos níveis 30 / 60 / 90) só acompanha aproximadamente.
- **A Crista de Berserker passa de 12 % de Δln P no nível 90** (cresce com a chance de crítico): se quiser a razão de 1,5x também lá, ela precisaria de um valor que cresça menos com o tier.
- **A Crista vale +0,75 de dano crítico agora**, número que não estava na lista de decisões: com 0,5 o ΔCP dela cai para +2,6 % (nível 30) e a razão com a regeneração de 0,9 % passa de 1,5x.
- A `legacy-arena` ainda lê `focusHpBonus`, `attackStaminaReduction` e `burnTurns` (fora do build); pode ser apagada se a arena antiga não vai voltar.


# Rodada 5 — inventário único

Regras e números em `docs/INVENTORY.md`. Esta seção só traz o que a simulação (`npm run sim`, 20 seeds, 21 dias) mediu e o que foi ajustado por causa dela.

## 21. O que mudou no encanamento da economia

- A Bolsa de Caça deixou de existir; a caça entrega no inventário único no resgate. Todo empilhável guarda 99 por espaço; o Baú (20 -> 100 espaços) e o mercador
  (com orçamento diário) são os novos escoadouros. Nenhuma taxa de drop, ouro por hora ou XP mudou.
- A simulação perdeu o cenário B (visita curta para fugir da bolsa de 2-3 espaços: sem a bolsa o truque não existe) e a meta T1 (bolsa do tier 1). O jogador
  simulado ganhou uma política de inventário (guarda no Baú o excesso valioso, vende o que o mercador compra, descarta o lixo barato, nunca toca no que a próxima
  peça ou a melhoria do Baú precisa, traz do Baú o que uma receita ou pedido pede) e há um cenário **N** (o mesmo jogador, mas que ignora o inventário).

## 22. Metas de progressão (cenário A, mediana)

| Meta | Antes | Depois |
| --- | --- | --- |
| Primeira sessão termina no andar >= 8; checkpoint 10 no dia 1 | 8; dia 1 | 8; dia 1 |
| Primeira peça forjada (alvo <= dia 2) | dia 2 | dia 2 |
| Nível dia 1 / 3 / 14 (alvos 10-16 / 20-29 / 45-60) | 13 / 29 (27-34) / 50 (46-51) | 13 / 27 (25-33) / 48 (46-49) |
| Chefe 25 vencido pela 1ª vez (alvo dia 4-6) | dia 5 | dia 5 |
| Chegada ao andar 50 (nenhuma seed antes do dia 10) | 1ª seed dia 10, mediana 15 | 1ª seed dia 11, mediana 15,5 |
| Chefe 50 (1ª seed por volta dos dias 12-16) | 1ª seed dia 13, 6/20 em 21 dias | 1ª seed dia 12, 11/20 em 21 dias |
| Queda de dificuldade depois de chefe ((N+1)/(N-1) >= 1) | 1,77 | 1,77 |
| Primeiro refino bem-sucedido | dia 3 | dia 2 |
| Primeira relíquia | dia 16 | dia 13 |

Nenhuma meta quebrou. O nível cai um pouco (-2 no dia 3 e no dia 14): o jogador atento gasta tempo e ouro arrumando o inventário e comprando melhorias do Baú (mediana
de ouro gasto nos 21 dias: Baú 785, mochila 750), e perde parte dos Pedidos quando troca estoque por espaço. Continua dentro de todas as faixas.

## 23. Ritmo do inventário

Capacidade e pacing (cenário N = jogador que ignora o inventário, cenário A = jogador atento):

| Dia | Espaços no fim do dia (A, mediana) | Pico (A) | Capacidade (A) | N: espaços | N: % do dia perdido |
| --: | --- | --- | --- | --- | --- |
| 3 | 11 | 11 | 26 | 11 | 0 % |
| 5 | 22 | 22 | 26 | 22 | 0 % |
| 6 | 24 | 25 | 30 | 26 (cheio) | 12 % |
| 7 | 24 | 25 | 30 | 26 | 83 % |
| 10 | 22 | 24 | 30 | 26 | 100 % |
| 14 | 24 | 24 | 30 | 26 | 50 % |
| 21 | 30 | 30 | 35 | 26 | 50 % |

- **Primeira vez cheio**: dia **6** (5-7) para quem não arruma; o jogador atento arruma antes de encher (4/20 seeds chegam a encher antes do primeiro resgate).
- **Perda por transbordo do jogador atento**: mediana **0 %**, pior seed 10,5 % (pior dia de uma seed). Meta < 5 % de mediana: cumprida.
- **Jogador descuidado**: perde **60 % dos materiais** (mediana; 21-83 % entre seeds), de 80-100 % por dia entre os dias 7 e 10; no dia 14 está no nível 43 (contra 48),
  parado no andar 30 e sem a segunda peça de tier 3: sente.

### Ajuste feito: capacidade base 30 -> 26 (e um degrau novo de 30 por 250 Ouro)

Com a base em 30 o jogador que ignora o inventário só enchia no **dia 7** (6-9), fora da faixa 3-6 pedida. Medido: o inventário passa de 14 espaços no dia 4 para 22 no
dia 5 (a segunda zona de caça libera três materiais novos) e 26 no dia 6; com 26 enche no dia 6 (5-7). O ajuste é mínimo (4 espaços) e **só vale para contas novas**:
o piso do carregamento nunca desce, então quem já tem 30 mantém 30. Entra um degrau de 30 espaços a 250 Ouro (os demais degraus não mudaram). Se o diretor preferir manter 30,
a única meta que sai da faixa é essa, por um dia.

## 24. Mercador: orçamento diário

Fórmula: `orçamento = 30 + 2 x nível`. O jogador atento vende o máximo todos os dias; ouro do mercador por dia contra o ouro diário **de antes do mercador** (424 / 521 / 483
nos dias 3 / 7 / 14, medianas da simulação anterior):

| Dia | Nível (mediana) | Orçamento | Ouro vendido (A) | Contra o ouro de antes |
| --: | --: | --: | --: | --: |
| 3 | 27 | 84 | 0 (ainda não precisa vender) | +0 % |
| 7 | ~40 | 110 | 108 | +20,7 % |
| 14 | 48 | 126 | 126 | +26,1 % |
| 21 | ~52 | 134 | 134 | - |

Meta: no máximo ~35 % acima do ouro do dia; o pico medido é 26 %. Usei o ouro de antes do mercador como referência fixa, e não a renda atual do jogador atento, porque esse
jogador também troca estoque de Pedidos por espaço (a renda de "outras fontes" dele cai nos dias 12-21) e o teto não deve se mexer com isso.

Preço: 15 % do valor de referência (mínimo 1; 1 Ouro por Farrapo/Osso, 3 por Núcleo...). Varredura de arbitragem: **0 violações** em todas as receitas de refino, alquimia e na volta
forjar-desmontar-vender, sem baixar nenhum preço de consumível.

## 25. Baú: custos

As duas primeiras melhorias (100 Ouro + 4 cabos + 3 barras de cobre; 250 Ouro + 8 cabos + 6 barras) saem **no dia 9 (mediana; 18/20 seeds)** e **no dia 13 (15/20)**; a terceira
só no fim do horizonte (1/20 até o dia 21). Elas usam o ouro que não é da próxima peça (as duas primeiras ignoram a reserva da peça, as seguintes a respeitam) e a coleta de
Mineração / Lenhador para os cabos e barras entra como demanda mesmo antes de a peça estar coberta (só nas duas primeiras). Efeito nas peças: primeira peça forjada dia 2, chefe 25 no dia 5, linha
do tempo dos tiers inalterada: a peça não é esfomeada. Os cabos e barras do Baú são da mesma ordem de grandeza da receita de equipamento do mesmo tier (4-8 cabos e 3-8 barras
contra 1-2 cabos e 1-3 barras por peça): o Baú vira o destino de longo prazo de Lenhador e Mineração.

## 26. Pontos para o diretor decidir

- Capacidade base 26 em vez de 30 (seção 23). Reverter é trocar `DEFAULT_INVENTORY_CAPACITY` e tirar o degrau de 30.
- O orçamento do mercador cresce com o nível, mas o ouro diário de quem está nos andares altos (acima do dia 21) não foi medido: se a renda dele crescer mais que
  `2 x nível`, a fração do mercador encolhe sozinha; se não, o orçamento pode ficar generoso.
- Peças de equipamento (instâncias) não vão para o Baú (só empilháveis): peças únicas e sobras ocupam espaço do inventário. É a única decisão que dá para abrir depois.
- O jogador atento perde parte dos Pedidos (ouro) por manter menos estoque; se isso for um problema de design, o remédio é capacidade, não o mercador.

## 27. Rodada 6 — escudos, machados, relíquias de chefe e materiais das zonas 3 e 4

Pacote de conteúdo 2: o sétimo slot instanciado (escudo), uma segunda linha de armas (machados), quatro relíquias que só caem de chefe e dois materiais novos em cada uma das duas zonas de caça tardias. Medições com `npm run sim:items` (seções I, J e K de `ITEM_BALANCE_AUDIT.md`) e `npm run sim`.

### Escudos (slot `shield`, sétimo `INSTANCED_SLOTS`)

Identidade: resistência + reflexo (a partir do tier 3, como a armadura) + um pouco de PV máximo. Mesmos níveis da armadura do tier (1 / 10 / 25 / 50 / 70 / 90), 1 escudo do tier anterior a partir do tier 2, barras/lingotes + cabo de madeira do tier + materiais de caça. O reflexo do escudo soma ao da armadura (`buildCombatStats`: `armor.reflect x durabilidade + extra.reflect`); a armadura não mudou.

| Escudo | Tier | Nível | PV | Resistência | Reflexo | Custo (Ouro) | Receita / armadura do tier | ΔCP no conjunto de 6 | ΔCP em arma + armadura |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| bronze_buckler | 1 | - | 20 | 4,0% | - | 15 | 54% | +8,0% | +9,4% |
| iron_shield | 2 | 10 | 36 | 6,0% | - | 35 | 53% | +8,2% | +9,3% |
| steel_kite_shield | 3 | 25 | 52 | 7,6% | 3% | 240 | 45% | +7,7% | +8,9% |
| gilded_shield | 4 | 50 | 76 | 9,5% | 6% | 325 | 56% | +8,3% | +9,5% |
| voidsteel_shield | 5 | 70 | 96 | 10,4% | 7% | 950 | 53% | +7,9% | +9,2% |
| abyssal_shield | 6 | 90 | 113 | 11,3% | 8% | 1 650 | 52% | +7,9% | +9,0% |

Únicos (mesmas regras dos outros 12: +10% no atributo principal, uma substat extra, nunca forjados, desmontam como o gêmeo): `bone_ward` (Pântano de Sangue, tier 3, gêmeo `steel_kite_shield`, mesma chance de 0,0125% por vitória dos outros dois do pântano) e `warden_bulwark` (chefe do andar 50, tier 4, gêmeo `gilded_shield`). `UNIQUE_BOSS_DROPS` passou a ser uma lista por chefe: cada único rola sozinho a 8% por vitória (teste: 8% cada, 0,64% os dois juntos).

**Reflexo total (armadura + escudo)**: parte do dano causado, herói arma + armadura +4 + escudo no andar de referência: 11,8% (tier 3, nível 25), 9,8% (4g), 9,7% (5), 8,6% (6). O escudo do tier 3 ficou com 3% de reflexo (e não 5%) para ficar abaixo de 12%.

### Machados (linha `line: 'axe'`)

Mesmo nível, receita e custo da espada do tier (teste: custo de referência idêntico), a receita pede o MACHADO do tier anterior (as linhas não se misturam; no tier 5 o insumo é o machado dourado, que não tem versão dragão: é um pouco mais barato que subir pela espada dragão). Sem queimadura (as espadas dragão / vazio / abismo continuam com ela). O sprite da mão do herói não muda.

| Tier | Espada: dano / crítico | Machado: dano / crítico | Δ pouco crítico | Δ intermediária | Δ crítico alto |
| --- | --- | --- | --: | --: | --: |
| 1 (nv 1) | 12 / 3% | 13 (+8%) / 1,5% | +1,9% | +1,3% | +1,4% |
| 2 (nv 10) | 30 / 6% | 32 (+7%) / 3% | +2,1% | +1,3% | +0,6% |
| 3 (nv 30) | 65 / 10% | 70 (+8%) / 5% | +1,1% | +0,2% | -0,9% |
| 4 (nv 60) | 90 / 14% | 100 (+11%) / 7% | +1,8% | +0,3% | -2,0% |
| 5 (nv 75) | 160 / 20% + queima | 187 (+17%) / 10% | +0,5% | -1,0% | -3,2% |
| 6 (nv 90) | 220 / 24% + queima | 264 (+20%) / 12% | +2,0% | -0,2% | -3,4% |

Margem real do duelo (P do machado / P da espada - 1). **O "cerca de +18% de dano" não cabe nos tiers baixos**: com a espada quase sem crítico, +18% deixaria o machado 8-12% à frente em todas as montagens e a meta de ±5% (e a inversão com crítico alto) não fecha. O bônus de dano sobe com o tier (+8% no 3, +11% no 4, +17% no 5, +20% no 6), na proporção do crítico que a espada tem a perder. Níveis 30 / 60 / 90: todos dentro de ±5%, machado à frente com pouco crítico (+1,1 / +1,8 / +2,0), espada à frente com anel + rubis (-0,9 / -2,0 / -3,4). Nos tiers 1-2 não há inversão (a espada ainda não tem crítico para perder).

### Relíquias de chefe (empilháveis, só por queda, 4% por vitória sobre o chefe do bioma, independentes da peça única, não forjam, não vendem, descartam)

| Relíquia | Chefe | Efeito | ΔCP no nível em que cai | Δln P real | Forjáveis no mesmo ponto (vitalidade / velocidade / berserker) |
| --- | --- | --- | --: | --: | --- |
| goblin_lucky_coin | 25 | +10% de Ouro (Masmorra e Caça), dentro do teto de 25% | 0 | 0 | - |
| warchief_totem | 50 | +8,5% de dano final | +4,1% | 7,6% | 9,2 / 7,1 / 9,1% |
| lich_phylactery | 75 | 5% de roubo de vida | +3,6% | 15,9% | 8,2 / 6,8 / 11,3% |
| overlord_sigil | 100 | +4% de crítico, +20% de dano crítico | +3,7% | 6,8% | 8,4 / 6,9 / 12,9% |

**Mudei dois números do pedido.** Totem de +6% para +8,5% e filactério de 3% para 5%: com +6% de dano final o CP sobe só 3,0% (a raiz quadrada do `combatPowerCore`) e com 3% de roubo de vida 2,0-2,6%, abaixo da faixa das forjáveis (3,5-7,5% no teste). Com 8,5% e 5% os dois entram na faixa e o valor real fica a até 1,41x da maior forjável (filactério: 15,9 contra 11,3). O sigilo (+4% / +20%) ficou como pedido (+3,7% de CP em arma + armadura, +4,3% no conjunto de 6; o amuleto de velocidade forjável também marca 3,8%).

Campos novos em `GearItem` (todos em `LIVE_STAT_FIELDS`, com o teste de dado morto): `damagePct` (multiplica `dmgBase` depois da FOR), `lifestealPct` (soma ao roubo de vida das substats), `goldBonusPct` (soma ao `goldBonus` das substats, antes do teto de 25%). O crítico do sigilo usa `critChance` (que o `buildCombatStats` não lia numa relíquia) e `critMultBonus`. `CombatStats.goldBonus` (opcional, sem efeito no CP) leva o bônus à Caça: o ouro de uma sessão é `horas x (1 + bônus) x ouro/h`, congelado com a sessão como o resto. Isso faz as substats de ouro valerem na Caça também (eram só da Masmorra).

**Achado**: as relíquias, craftáveis ou não, não tinham botão de equipar no inventário (`EQUIPPABLE_SLOTS` só tinha arma e armadura; só a simulação equipava). Agora o inventário equipa / remove relíquia (os manipuladores do `App` já existiam) e o painel do herói e o cartão da Home mostram uma oitava linha com ela.

### Materiais das zonas 3 e 4

| Material | Zona | Raridade | Chance base | Valor de referência | Preço do mercador | Usado em |
| --- | --- | --- | --: | --: | --: | --- |
| rift_shard (Estilhaço da Fenda) | Fenda Demoníaca | refino | 10% | 6,5 | 1 | tier 5: espada, machado, armadura (2 cada), elmo, botas, escudo (1) |
| fiend_horn (Chifre do Demônio) | Fenda Demoníaca | nobre | 2% | 34 | 5 | tier 5: espada, machado, armadura, luvas, anel, escudo (1 cada) |
| abyssal_marrow (Tutano Abissal) | Abismo de Sangue | refino | 11% | 7 | 1 | tier 6: espada, machado, armadura (2 cada), elmo, botas, escudo (1) |
| blood_heart (Coração de Sangue) | Abismo de Sangue | nobre | 2,5% | 36 | 5 | tier 6: espada, machado, armadura, luvas, anel, escudo (1 cada) |

As chances passam pelos mesmos multiplicadores de profundidade, sub-nível e fração econômica das três antigas, que ficam intocadas. Os dois novos de cada zona rolam num segundo fluxo seeded (`HuntingDrop.ownStream`): lutas, críticos, XP, ouro e as três drops antigas de uma sessão ficam idênticos bit a bit (teste de igualdade exata). Nenhuma receita de refino ou alquimia usa os quatro (não havia encaixe natural; `usesOf` mostra forja em todos). Pedidos de entrega não mudaram.

### Retune de inimigos (única mudança de balanceamento)

O escudo é +8% de CP no conjunto de 6. Medido só com ele, a meta "ninguém chega ao andar 50 antes do dia 10" falha (primeira seed no dia 8; o chefe 50 cai na primeira seed no dia 10 e em 9/20 seeds em 21 dias, contra 2/20 antes). O remédio mínimo do lado do inimigo foram os orcs (andares 26-49; os chefes 25 / 50 não ajudam a chegada): `hp` 250 -> 268 e `dmg` 37 -> 40 (+16% de poder). As tentativas: 262/39 e 272/39 (primeira seed no dia 8), 280/38 e 290/37 (dia 9), 275/41 (dia 10, mas mediana 16), 268/40 (dia 10, mediana 14). O dano pesa mais que a vida para a cauda rápida. A tabela de CP recomendada foi regerada (`npm run sim:cp`: 10 linhas mudaram) e a meta do reflexo de armadura sozinha passou de 11% para 11,5% no teste (o orc bate 8% mais forte: o tier 3 marca 11,2% no andar 26).

### Metas de progressão (cenário A, mediana de 20 seeds)

| Meta | Antes (R5) | Só o escudo | Depois do retune |
| --- | --- | --- | --- |
| Primeira sessão termina no andar >= 8 | 8 | 8 | 8 |
| Primeira peça forjada <= dia 2 | 2 | 2 | 2 |
| Nível dia 1 / 3 / 14 (10-16 / 20-29 / 45-60) | 13 / 29 / 49 | 13 / 27 / 48 | 13 / 27 / 48 |
| Chefe 25 vencido no dia 4-6 | 5 | 5 | 5 |
| Primeira chegada ao andar 50 >= dia 10 | 10 | **8** | 10 (mediana 14) |
| Chefe 50 (primeira seed / seeds em 21 dias) | 14 / 2 | 10 / 9 | 12 / 13 |
| Queda de dificuldade depois de chefe (menor razão) | 1,77 | 1,77 | 1,53 |

### Ritmo do inventário (metas da R5, com os 4 materiais novos)

Primeira vez cheio, quem ignora o inventário: dia 6 (5-7), 20/20 seeds (R5: 6). Jogador atento: mediana 0% de perda por transbordo (pior seed 11,6%: um dia ruim de uma seed com as zonas 3 e 4 novas; meta de mediana < 5% cumprida). Quem ignora o inventário perde 69% dos materiais (mediana; R5: 60%). Mercador: +0% / +20,7% / +25,7% nos dias 3 / 7 / 14. O teste de "zona dropa no máximo 3 materiais" virou "3 nas duas primeiras zonas, 5 nas duas tardias".

### Pontos para o diretor decidir

- Machado: o "+18% de dano" virou +8% a +20% conforme o tier (seção acima). Se preferir +18% fixo, a meta de ±5% sai em todos os tiers abaixo do 5.
- Totem 8,5% e filactério 5% em vez de 6% e 3% (faixa de CP).
- O ouro extra das substats agora vale na Caça (sem isso a moeda não valeria lá), um efeito pequeno (a Caça paga 3-12 Ouro por hora).
- Relíquias ganharam botão de equipar e uma linha no painel do herói (eram inequipáveis).
- A pior seed do atento (11,6%) merece uma olhada se a meta passar a ser "pior seed".

## 28. Passe de Aventureiro: compra única, temporadas e vantagens leves (10/10/2026)

**O que mudou.** O Passe deixa de ser uma assinatura de 30 dias e vira um desbloqueio permanente (`entitlements.ts`, o único lugar que decide se a conta é dona). Quem já o ativou alguma vez (`hasBattlePass` verdadeiro, vencido ou não) vira dono para sempre; quem nunca o teve continua sem. O botão "Ativar" não dá mais o Passe de graça: em produção ele é um botão desabilitado, só uma build DEV (`import.meta.env.DEV`) concede o Passe para teste. A trilha de 30 níveis passa a correr em **temporadas de 60 dias** alinhadas a uma época fixa (Temporada 1 = 01/10/2026 UTC, `seasons.ts`): na virada, o que foi ganho e não resgatado é entregue sozinho (trilha grátis sempre, premium só para o dono, pelo caminho forçado: a bolsa pode passar da capacidade), o nível, o XP e os resgates recomeçam, e o jogador vê um resumo uma vez. A temporada já resolvida fica gravada no save (idempotente; relógio para trás nunca refaz uma temporada).

**Vantagens (versão final).** O dono do Passe fica **claramente à frente, sem a explosão do armazém de 12 h**: armazém de **6 h** em vez de 4 h (`T.battlePass.capHours`, a mesma regra de snapshot para Caça, Mineração e Lenhador: a sessão usa o teto em vigor quando começou; uma sessão que já corria sob o Passe antigo mantém o dela, nunca se encurta no meio; sessão sem snapshot usa o teto base), multiplicador de materiais **×1,10**, **+10% de ouro** (`T.battlePass.goldBonus`: Masmorra, Caça e Pedidos; **soma** ao bônus de ouro do equipamento, ao teto dele e ao Tônico da Fortuna, nunca multiplica; o mercador não entra), +1 oferta e +1 troca de Pedidos por dia com +10% de XP nas Entregas, **+20% de espaço no inventário** (arredondado para cima, mínimo 5: 26 → +6, 60 → +12, 100 → +20), +10 espaços no Baú e −20% no reparo. Únicos e relíquias de chefe não usam o multiplicador nem o bônus de ouro (teste: a mesma sessão sorteia os mesmos únicos com e sem Passe). Conveniência extra do dono: **"Resgatar tudo" na Home** (`claimAll.ts`), que recolhe de uma vez a Caça que encheu (ou a recompensa que espera), a Mineração e o Lenhador no teto, os canteiros prontos e o pedido concluído, pelas mesmas transições dos botões de cada tela (as regras de bolsa cheia continuam). Os não donos veem o botão bloqueado com a insígnia "Passe". Skin exclusiva `skin_golden_knight` no nível 30 da trilha.

**Medição final** (`npm run sim` com `SIM_PASS_ONLY=1 SIM_PASS_CAP=6 SIM_PASS_MULT=1.10`, cenário P contra A, 20 seeds, 22 dias, mediana; o dono tem só as vantagens, a trilha não é resgatada):

| Quando | Medida | Sem Passe | Com Passe | Dono |
| --: | --- | --- | --- | --- |
| dia 7 | materiais por dia (média dos dias 1-7) | 226 | 338 | +49,8% |
| dia 7 | ouro por dia (média 1-7) | 874 | 1 033 | +18,3% |
| dia 7 | nível / CP / andar | 39 / 736 / 30 | 42 / 847 / 30 | +3 níveis / +15% / 0 |
| dia 14 | materiais por dia (média dos dias 1-14) | 378 | 622 | +64,4% |
| dia 14 | ouro por dia (média 1-14) | 623 | 973 | +56,1% |
| dia 14 | nível / CP / andar | 48 / 1 189 / 50 | 50 / 1 340 / 53 | +2 níveis / +12,7% / +3 andares |

Marcos (dia, mediana, sem → com Passe): segunda zona 5 → 4, chefe 25 5 → 4, chegada ao andar 50 14 → 12, chefe 50 17,5 → 14. Metas do dono do jogo: materiais +40% a +60% (dia 7 cumpre; dia 14 passa um pouco), marcos 2 a 3 dias antes (a chegada ao 50 e o chefe 50 cumprem; segunda zona e chefe 25 só 1 dia, a resolução da mediana é de meio dia), nível +3 a +5 no dia 14 (+2, um pouco abaixo). Nenhum marco passa de 4 dias. Os números são ruidosos entre configurações vizinhas (a mediana de 20 seeds); a faixa acima é para comparar ordens de grandeza, não para ser asserção (por isso não há teste).

**Grade medida** (armazém × multiplicador, ainda sem o bônus de ouro e com a bolsa de +5 fixa; materiais/dia na média dos dias 1-N, ouro/dia idem, marcos adiantados em dias):

| Armazém / mult. | Materiais d7 | Materiais d14 | Ouro d7 / d14 | Nível d7 / d14 | 2ª zona | Chefe 25 | Andar 50 | Chefe 50 |
| --- | --: | --: | --- | --- | --: | --: | --: | --: |
| 5 h / 1,10 | +27% | +32% | +12% / +20% | +3 / +1 | 1 | 1 | 1,5 | 2,5 |
| 5 h / 1,15 | +30% | +40% | +12% / +14% | +2 / +2 | 0 | 0 | 1 | −3,5 |
| **6 h / 1,10** | **+53%** | **+69%** | +15% / +21% | +3 / +3 | 1 | 1 | 1 | 0,5 |
| 6 h / 1,15 | +63% | +76% | +17% / +29% | +4 / +3 | 1 | 1 | 1,5 | 1,5 |
| 7 h / 1,10 | +82% | +80% | +23% / +88% | +4 / +3 | 0,5 | 0,5 | 3 | 4,5 |
| 7 h / 1,15 | +93% | +92% | +19% / +84% | +4 / +3 | 1 | 1 | 2,5 | 4,5 |

Escolha: **6 h / ×1,10**, a mais perto do centro das metas em materiais e nível sem passar dos 4 dias (7 h já estoura os materiais e o chefe 50 em 4,5 dias). Com o bônus de ouro e a bolsa proporcional somados, a linha de 6 h / 1,10 acima é a medição final.

**Histórico das tentativas.** (1) Armazém de **12 h** e ×1,10: dono +285% (dia 7) e +183% (dia 14) em materiais/dia e 6 dias na frente na chegada ao andar 50; o armazém explicava quase tudo (12 h sozinho +260%, só o multiplicador +7%), por isso saiu. (2) **Sem perk de armazém** (4 h para todos, ×1,10, +5 espaços, +10 no Baú): dono +1,7% / +12,1% em materiais, 0 dia em todos os marcos, nível +1 — o dono do jogo achou que "quase não há vantagem" no dia 14 e pediu uma vantagem clara. (3) A versão final acima. `SIM_PASS_ONLY=1 SIM_PASS_CAP=... SIM_PASS_MULT=... SIM_PASS_BAG=... SIM_PASS_DELIV=... SIM_NO_DELIV=1 npm run sim` reproduz qualquer combinação.

## 29. Trilha premium do Passe: exclusivos (10/10/2026)

A trilha premium foi reescrita, os 30 níveis à mão, sem material de Caça e sem peça de equipamento (a trilha grátis ficou exatamente como era):

| Nível | Recompensa | Nível | Recompensa | Nível | Recompensa |
| --: | --- | --: | --- | --: | --- |
| 1 | 3 lingotes de prata | 11 | 6 Fragmentos | 21 | 10 Fragmentos |
| 2 | 2 Tônicos da Fortuna | 12 | 2 Tônicos Pele de Pedra | 22 | 2 Tônicos da Pressa |
| 3 | 5 Adubos | 13 | 3 barras de ouro | 23 | 2 esmeraldas |
| 4 | 1 500 de ouro | 14 | 1 safira | 24 | 2 obsidianas refinadas |
| 5 | 5 Fragmentos | 15 | **Moldura Dourada da Temporada** | 25 | 12 Fragmentos |
| 6 | Ticket Expresso 2 h | 16 | 8 Fragmentos | 26 | 2 Tickets Expressos 4 h |
| 7 | 1 rubi | 17 | 2 Elixires de Precisão | 27 | **Selo do Ferreiro** |
| 8 | **Escritura do Baú** | 18 | **Escritura do Baú** | 28 | 5 000 de ouro |
| 9 | 3 Óleos de Amolar | 19 | 3 catalisadores de refino | 29 | 15 Fragmentos |
| 10 | **Selo do Ferreiro** | 20 | **Selo do Ferreiro** | 30 | **Emblema do Aventureiro + título** |

Fragmentos: 56 no total, como antes. Exclusivos: Emblema do Aventureiro (relíquia empilhável, +5% de XP do personagem em Masmorra, Caça e Pedidos, +5% de ouro dentro do teto de 25% e +2% de dano final; não se forja, o mercador não compra, descarta-se; fica em 28 a 32% do valor de combate da relíquia de combate mais fraca, ver `ITEM_BALANCE_AUDIT.md` L); Selo do Ferreiro (3 por temporada, forja Épica ou melhor, 0,6 lendárias esperadas por temporada); Escritura do Baú (+5 espaços no Baú cada, até +20 no total, campo próprio `stashBonusSlots`); Moldura Dourada (cosmético de CSS, liga e desliga onde se escolhe o título). O Emblema não é afetado pelo Passe e o Passe não vende poder de combate. Valores de referência da trilha: `ITEM_BALANCE_AUDIT.md` L.

O Emblema não multiplica a Poção de XP (item fixo) nem o XP do Passe; só o XP do personagem das três fontes de idle/progressão pedidas.

O nível 30 agora dá três coisas: o Emblema, o título e a skin **Cavaleiro Dourado** (`skin_golden_knight`, a ficha `knight_golden.png`, mesmo layout 1024x1024 e mesmas linhas de animação do cavaleiro, então vale a mesma `HERO_ART`). A skin é uma escolha cosmética, não do equipamento (a regra "armadura não muda o sprite" continua): só quem tem o Passe e a skin escolhe, em Personagem; um save com skin desconhecida, não possuída ou sem Passe carrega com o cavaleiro padrão. Desenhada na Masmorra, na cena da Caça, no card do herói da Home, no avatar da barra e no retrato de Personagem.


## Rodada 7 — habilidades (2026-10-11, números finais)

Três caminhos (Guerreiro, Guardião, Caçador), 1 ponto a cada 5 níveis (20 no total), 6 habilidades de até 3 postos e 1 capstone por caminho (`src/game/heroSkills.ts`, números em `T.heroSkills`). Tudo entra por `buildCombatStats`; CP valoriza as habilidades de combate; as de economia não têm CP. Portas: tier 2 pede 2 pontos no caminho, tier 3 pede 5, capstone 10. Redistribuir: grátis a primeira vez, depois 50 de ouro x pontos x nível / 10 (9.500 a 100 com 19 pontos). Conjunto 2 = perk do Passe.

**Histórico (primeira tentativa, orçamento antigo).** A primeira versão da rodada limitou um caminho completo a +22% a +30% na margem do duelo. Isso obrigou os golpes a "+6% a cada 5 golpes" e a 1 a 2% do dano: um rótulo com partícula. Resultado daquela tentativa: orcs hp 276 / dmg 41, chefe 50 em 0,88, e a seed mais rápida chegava ao andar 50 no dia 9. O orçamento estava errado; esta seção o substitui.

**Orçamento novo.** Caminho de combate completo (19 pontos) vale +55% a +75% na margem real do duelo nos níveis 60 e 100, Guerreiro e Guardião a menos de 15% um do outro; os golpes carregam mais da metade do valor do caminho; Caçador no máximo ~2 dias atrás nos marcos, materiais/dia +10 a +16% e valor de combate <= 45% de um caminho de combate. Os inimigos foram retunados em torno disso.

**Tabela final (postos 1 / 2 / 3).**

| Habilidade | Tier | Efeito |
| --- | --- | --- |
| Golpe Esmagador | 1 | a cada 5 golpes, +60% / +90% / +120% de dano naquele golpe |
| Olho Clínico | 1 | +2,4 / 4,8 / 7,2% de chance de crítico |
| Golpe de Fúria | 2 | a cada 8 s de combate, 3 golpes extras de 35% / 45% / 55% do dano |
| Execução | 2 | +11 / 22 / 33% de dano crítico |
| Sangria | 3 | 4% / 7% / 10% do golpe por segundo, 3 s depois do último golpe |
| Mestre de Armas | 3 | +3,5 / 7 / 10,5% do dano base da arma |
| Golpe Devastador (capstone) | 4 | todo 3º Golpe Esmagador causa dano x3 no lugar do bônus (10 pontos no caminho) |
| Pele Dura (Guardião) | 1 | +2,5 / 5 / 7,5% de vida máxima |
| Muralha | 1 | +7 / 14 / 21% sobre o total de resistência |
| Espinhos | 2 | +8 / 16 / 24% de reflexo |
| Segundo Fôlego | 2 | +0,11 / 0,22 / 0,33% da vida por segundo |
| Postura Firme | 3 | -6 / 12 / 18% de dano nos andares de chefe e mini-chefe (só Masmorra) |
| Bloqueio | 3 | 4% / 7% / 10% de bloquear; Contra-ataque: próximo golpe +60% / +90% / +120% |
| Último Bastião (capstone) | 4 | golpe fatal deixa 1 de vida e cura 25%: uma vez por incursão; na Caça a cada 60 s de combate |
| Golpe Duplo (Caçador) | 1 | 8% / 12% / 16% de chance de atacar duas vezes, o eco causa 60% |
| Ganância | 1 | +4 / 8 / 12% de ouro da Masmorra e da Caça (fora do limite do equipamento) |
| Faro | 2 | +7 / 14 / 21% de materiais na Caça |
| Aprendiz Veloz | 2 | +4 / 8 / 12% de XP |
| Mochileiro | 3 | +2 / 4 / 6 espaços |
| Coletor | 3 | +6 / 12 / 18% de Mineração e Lenhador |
| Sorte Grande (capstone) | 4 | única na Caça x1,5; únicas e relíquias de chefe da Masmorra x1,25 |

Último Bastião: cura 25% e recarga de 60 s mantidas; no Monte Carlo da Masmorra (andares limpos por execução na borda do alcance) vale +93% / +57% / +14% nos níveis 30 / 60 / 100 contra +70% / +39% / +11% de um Bloqueio completo: de 1,27x a 1,46x (limite 1,5x). Peso de CP e do duelo 0,3.

**Valor medido (`npm run sim:skills`; heróis completos de um tier; um herói real de nível 60 tem 12 pontos).**

#### nível 30 (tier 3, refino 4; PV 804, dano 148, crit 26.0%, redução 0.45, 0.93 atq/s)
| Caminho | Habilidade | Tier | Valor no posto máximo (margem do duelo) | CP |
| --- | --- | --- | --- | --- |
| warrior | w_heavy_blow | 1 | +21.71% (comum +21.93%, chefe +21.19%) | +11.40% |
| warrior | w_keen_eye | 1 | +6.14% (comum +6.21%, chefe +6.00%) | +3.35% |
| warrior | w_execution | 2 | +5.86% (comum +5.92%, chefe +5.72%) | +3.24% |
| warrior | w_fury | 2 | +15.18% (comum +15.33%, chefe +14.82%) | +7.53% |
| warrior | w_bleed | 3 | +6.89% (comum +6.89%, chefe +6.87%) | +3.56% |
| warrior | w_weapon_master | 3 | +6.37% (comum +6.43%, chefe +6.22%) | +3.45% |
| warrior | w_devastating_strike | capstone | +12.06% (comum +12.18%, chefe +11.77%) | +6.49% |
| guardian | g_thick_skin | 1 | +7.46% (comum +7.46%, chefe +7.46%) | +3.66% |
| guardian | g_bulwark | 1 | +5.85% (comum +5.91%, chefe +5.71%) | +3.03% |
| guardian | g_thorns | 2 | +9.96% (comum +9.01%, chefe +12.21%) | +3.77% |
| guardian | g_second_wind | 2 | +3.35% (comum +3.67%, chefe +2.59%) | +1.99% |
| guardian | g_firm_stance | 3 | +5.46% (comum +0.00%, chefe +19.38%) | +2.82% |
| guardian | g_block | 3 | +17.70% (comum +17.88%, chefe +17.28%) | +11.61% |
| guardian | g_last_bastion | capstone | +7.50% (comum +7.50%, chefe +7.50%) | +3.77% |
| hunter | h_light_step | 1 | +8.68% (comum +8.77%, chefe +8.48%) | +4.71% |
| hunter | h_greed | 1 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_scent | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_quick_learner | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_packer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_gatherer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_great_luck | capstone | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| Caminho | 19 pontos (valor) | CP | com os pontos do nível | só passivas (18) | razão máx/mín entre passivas | capstone / média das T3 | capstone / T3 maior | reflexo / dano causado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| warrior | +76.9% (19 pts) | +35.6% | +36.9% (6 pts) | +71.0% | 3.71 | 1.82 | 1.75 | +4.9% |
| guardian | +70.9% (19 pts) | +34.8% | +13.7% (6 pts) | +59.0% | 5.29 | 0.65 | 0.42 | +13.2% |
| hunter | +8.7% (19 pts) | +4.7% | +8.7% (6 pts) | +8.7% | Infinity | NaN | NaN | +7.9% |
#### nível 60 (tier 4, refino 6; PV 1373, dano 252, crit 33.0%, redução 0.63, 1.01 atq/s)
| Caminho | Habilidade | Tier | Valor no posto máximo (margem do duelo) | CP |
| --- | --- | --- | --- | --- |
| warrior | w_heavy_blow | 1 | +21.83% (comum +22.00%, chefe +21.42%) | +11.36% |
| warrior | w_keen_eye | 1 | +5.96% (comum +6.01%, chefe +5.84%) | +3.20% |
| warrior | w_execution | 2 | +6.93% (comum +6.99%, chefe +6.80%) | +3.73% |
| warrior | w_fury | 2 | +12.97% (comum +13.08%, chefe +12.73%) | +6.40% |
| warrior | w_bleed | 3 | +5.88% (comum +5.88%, chefe +5.88%) | +2.99% |
| warrior | w_weapon_master | 3 | +6.49% (comum +6.54%, chefe +6.36%) | +3.52% |
| warrior | w_devastating_strike | capstone | +12.13% (comum +12.22%, chefe +11.90%) | +6.45% |
| guardian | g_thick_skin | 1 | +7.50% (comum +7.50%, chefe +7.50%) | +3.68% |
| guardian | g_bulwark | 1 | +7.35% (comum +7.41%, chefe +7.21%) | +3.68% |
| guardian | g_thorns | 2 | +8.35% (comum +7.67%, chefe +9.94%) | +3.36% |
| guardian | g_second_wind | 2 | +3.41% (comum +3.70%, chefe +2.75%) | +1.87% |
| guardian | g_firm_stance | 3 | +5.51% (comum +0.00%, chefe +19.59%) | +2.83% |
| guardian | g_block | 3 | +16.76% (comum +16.90%, chefe +16.45%) | +11.52% |
| guardian | g_last_bastion | capstone | +7.50% (comum +7.50%, chefe +7.50%) | +3.68% |
| hunter | h_light_step | 1 | +8.73% (comum +8.80%, chefe +8.57%) | +4.69% |
| hunter | h_greed | 1 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_scent | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_quick_learner | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_packer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_gatherer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_great_luck | capstone | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| Caminho | 19 pontos (valor) | CP | com os pontos do nível | só passivas (18) | razão máx/mín entre passivas | capstone / média das T3 | capstone / T3 maior | reflexo / dano causado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| warrior | +74.9% (19 pts) | +34.6% | +52.7% (12 pts) | +68.9% | 3.71 | 1.96 | 1.87 | +4.7% |
| guardian | +70.4% (19 pts) | +35.1% | +29.3% (12 pts) | +58.5% | 4.91 | 0.67 | 0.45 | +12.0% |
| hunter | +8.7% (19 pts) | +4.7% | +8.7% (12 pts) | +8.7% | Infinity | NaN | NaN | +7.6% |
#### nível 100 (tier 6, refino 8; PV 2490, dano 678, crit 49.0%, redução 0.88, 1.11 atq/s)
| Caminho | Habilidade | Tier | Valor no posto máximo (margem do duelo) | CP |
| --- | --- | --- | --- | --- |
| warrior | w_heavy_blow | 1 | +22.28% (comum +22.34%, chefe +22.15%) | +11.08% |
| warrior | w_keen_eye | 1 | +5.55% (comum +5.56%, chefe +5.52%) | +2.88% |
| warrior | w_execution | 2 | +8.90% (comum +8.93%, chefe +8.85%) | +4.56% |
| warrior | w_fury | 2 | +10.22% (comum +10.25%, chefe +10.16%) | +4.77% |
| warrior | w_bleed | 3 | +4.66% (comum +4.65%, chefe +4.68%) | +2.22% |
| warrior | w_weapon_master | 3 | +7.71% (comum +7.73%, chefe +7.67%) | +3.96% |
| warrior | w_devastating_strike | capstone | +12.38% (comum +12.41%, chefe +12.31%) | +6.30% |
| guardian | g_thick_skin | 1 | +7.51% (comum +7.51%, chefe +7.51%) | +3.69% |
| guardian | g_bulwark | 1 | +9.41% (comum +9.44%, chefe +9.36%) | +4.41% |
| guardian | g_thorns | 2 | +2.79% (comum +2.64%, chefe +3.17%) | +2.80% |
| guardian | g_second_wind | 2 | +5.48% (comum +5.80%, chefe +4.74%) | +1.12% |
| guardian | g_firm_stance | 3 | +5.86% (comum +0.00%, chefe +20.91%) | +2.82% |
| guardian | g_block | 3 | +16.22% (comum +16.26%, chefe +16.12%) | +11.41% |
| guardian | g_last_bastion | capstone | +7.50% (comum +7.50%, chefe +7.50%) | +3.69% |
| hunter | h_light_step | 1 | +8.91% (comum +8.93%, chefe +8.86%) | +4.56% |
| hunter | h_greed | 1 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_scent | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_quick_learner | 2 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_packer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_gatherer | 3 | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| hunter | h_great_luck | capstone | +0.00% (comum +0.00%, chefe +0.00%) | +0.00% |
| Caminho | 19 pontos (valor) | CP | com os pontos do nível | só passivas (18) | razão máx/mín entre passivas | capstone / média das T3 | capstone / T3 maior | reflexo / dano causado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| warrior | +75.0% (19 pts) | +33.2% | +75.0% (20 pts) | +68.8% | 4.78 | 2.00 | 1.60 | +2.3% |
| guardian | +71.3% (19 pts) | +33.8% | +71.3% (20 pts) | +59.4% | 5.80 | 0.68 | 0.46 | +5.1% |
| hunter | +8.9% (19 pts) | +4.6% | +8.9% (20 pts) | +8.9% | Infinity | NaN | NaN | +3.6% |
#### Parcela do dano total de cada golpe (Caça de 4 h na zona do tier, contadores da tela de resultado)
| Herói | Golpe | posto 1 | posto 2 | posto 3 |
| --- | --- | --- | --- | --- |
| nível 30 | Golpe Esmagador | 10.6% (x2671) | 15.2% (x2671) | 19.3% (x2671) |
| nível 30 | Golpe de Fúria | 9.8% (x1800) | 12.5% (x1800) | 14.9% (x1800) |
| nível 30 | Sangria | 1.7% (x7368) | 3.5% (x7685) | 3.2% (x5711) |
| nível 30 | Golpe Duplo | 4.4% (x1012) | 6.4% (x1535) | 8.6% (x2079) |
| nível 30 | Contra-ataque | 0.8% (x185) | 2.2% (x322) | 3.8% (x448) |
| nível 30 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.4% (x890) |
| nível 60 | Golpe Esmagador | 10.7% (x2914) | 15.2% (x2914) | 19.3% (x2914) |
| nível 60 | Golpe de Fúria | 8.4% (x1799) | 10.5% (x1799) | 12.6% (x1799) |
| nível 60 | Sangria | - | - | - |
| nível 60 | Golpe Duplo | 4.2% (x1100) | 6.4% (x1679) | 8.6% (x2277) |
| nível 60 | Contra-ataque | 0.9% (x229) | 2.5% (x420) | 4.4% (x578) |
| nível 60 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x971) |
| nível 100 | Golpe Esmagador | 10.7% (x3199) | 15.2% (x3199) | 19.3% (x3199) |
| nível 100 | Golpe de Fúria | 6.5% (x1799) | 8.3% (x1799) | 9.9% (x1799) |
| nível 100 | Sangria | 1.0% (x6758) | 1.3% (x5013) | 1.8% (x5004) |
| nível 100 | Golpe Duplo | 4.4% (x1257) | 6.4% (x1874) | 8.4% (x2530) |
| nível 100 | Contra-ataque | 0.6% (x163) | 1.6% (x290) | 3.1% (x411) |
| nível 100 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x1066) |
#### Monte Carlo (runDungeon, sem poções, 200 execuções semeadas): andares limpos por execução na borda do alcance
| Herói | andar inicial | sem habilidade | Último Bastião | Bloqueio x3 | Pele Dura x3 | Mestre de Armas x3 | Sangria x3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nível 30 | 31 | 0.67 | 1.23 (+84%) | 1.06 (+60%) | 0.67 (+0%) | 0.93 (+39%) | 0.93 (+39%) |
| nível 60 | 66 | 0.87 | 1.37 (+57%) | 1.21 (+39%) | 0.92 (+6%) | 1.00 (+15%) | 1.00 (+15%) |
| nível 100 | 99 | 1.75 | 2.00 (+14%) | 1.95 (+11%) | 1.99 (+13%) | 1.92 (+9%) | 1.92 (+9%) |

**Parcela do dano total de cada golpe (Caça de 4 h).**

| Herói | Golpe | posto 1 | posto 2 | posto 3 |
| --- | --- | --- | --- | --- |
| nível 30 | Golpe Esmagador | 10.6% (x2671) | 15.2% (x2671) | 19.3% (x2671) |
| nível 30 | Golpe de Fúria | 9.8% (x1800) | 12.5% (x1800) | 14.9% (x1800) |
| nível 30 | Sangria | 1.7% (x7368) | 3.5% (x7685) | 3.2% (x5711) |
| nível 30 | Golpe Duplo | 4.4% (x1012) | 6.4% (x1535) | 8.6% (x2079) |
| nível 30 | Contra-ataque | 0.8% (x185) | 2.2% (x322) | 3.8% (x448) |
| nível 30 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.4% (x890) |
| nível 60 | Golpe Esmagador | 10.7% (x2914) | 15.2% (x2914) | 19.3% (x2914) |
| nível 60 | Golpe de Fúria | 8.4% (x1799) | 10.5% (x1799) | 12.6% (x1799) |
| nível 60 | Sangria | - | - | - |
| nível 60 | Golpe Duplo | 4.2% (x1100) | 6.4% (x1679) | 8.6% (x2277) |
| nível 60 | Contra-ataque | 0.9% (x229) | 2.5% (x420) | 4.4% (x578) |
| nível 60 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x971) |
| nível 100 | Golpe Esmagador | 10.7% (x3199) | 15.2% (x3199) | 19.3% (x3199) |
| nível 100 | Golpe de Fúria | 6.5% (x1799) | 8.3% (x1799) | 9.9% (x1799) |
| nível 100 | Sangria | 1.0% (x6758) | 1.3% (x5013) | 1.8% (x5004) |
| nível 100 | Golpe Duplo | 4.4% (x1257) | 6.4% (x1874) | 8.4% (x2530) |
| nível 100 | Contra-ataque | 0.6% (x163) | 1.6% (x290) | 3.1% (x411) |
| nível 100 | Golpe Devastador (capstone, com Esmagador x3) | - | - | 10.3% (x1066) |
| Herói | andar inicial | sem habilidade | Último Bastião | Bloqueio x3 | Pele Dura x3 | Mestre de Armas x3 | Sangria x3 |

Notas. (1) Regra "nenhuma habilidade de posto máximo vale mais que 2,5x outra do caminho": **não é atingível com os números do diretor**: o Esmagador completo vale ~22% e a Sangria completa 4,7% a 6,9%, razão 3,7x a 4,8x no Guerreiro (4,9x a 5,8x no Guardião, onde o Bloqueio vale 16 a 18% e Espinhos 2,8% a 100). Os golpes foram mantidos como pedido. (2) Sangria fica em 1% a 3,5% do dano (a meta era 5%): as lutas da Caça duram 3 a 5 s e o sangramento começa um segundo depois do primeiro golpe. Fúria 6,5 a 15%, Esmagador 10,6 a 19%, Devastador 10,3% (metas >= 6 / 8 / 8). (3) Reflexo total de um Guardião completo: 13,2% do dano causado no nível 30 (limite ~18%).

**Retune dos inimigos.** Com o jogador gastando pontos como ganha (cenário A = Guerreiro) o andar 50 chegava ao dia 7 a 8. Movido: orcs (andares 26-49) `hp` 268 -> 310 e `dmg` 40 -> 46 (+16% / +15%); chefe do andar 25 `boss25HpMult` 0,22 -> 0,30; chefe do andar 50 `boss50HpMult` / `boss50DmgMult` 0,84 -> 0,88; tabela de CP recomendada regerada (`npm run sim:cp`). Andares 1-25 (biomas 1 e o chefe 25 à parte) ficam como estavam. Resultado do cenário A (Guerreiro): T2 a T5, T7, T8 e I1 a I4 ok; nível 13 / 29 / 49; chefe 25 no dia 4; chegada ao andar 50 mediana 14 (primeira seed dia 9: falha de 1 dia, aceita); chefe 50 mediana 16,5; sem queda de dificuldade depois de um chefe (menor razão 1,15). Sem habilidades (Z): chega ao andar 50 no dia 17 (chefe 50 depois do dia 21): mais lento, sem parede.

**Os três caminhos e Z lado a lado (`npm run sim`, 20 seeds x 21 dias, mesma política).**

### Habilidades: os três caminhos (Guerreiro = cenário A, Guardião, Caçador) contra o mesmo jogador sem habilidades (Z), mesma política e mesmas seeds

| Quando | Medida (mediana entre seeds) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- | --- |
| dia 7 | materiais recebidos por dia (média dos dias 1 até aqui) | 241 | 273 (+13.2%) | 236 (-1.8%) | 235 (-2.3%) |
| dia 7 | valor de referência dos materiais por dia (ouro) | 1 045 | 1 229 (+17.6%) | 1 035 (-1%) | 998 (-4.5%) |
| dia 7 | ouro ganho por dia (média dos dias 1 até aqui) | 885 | 872 (-1.4%) | 878 (-0.7%) | 872 (-1.5%) |
| dia 7 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 41 | 47 (+16.6%) | 42 (+4.1%) | 43 (+6.2%) |
| dia 7 | nível | 39 | 41 (+5.1%) | 39 (+0%) | 39 (+0%) |
| dia 7 | CP | 742 | 942 (+26.9%) | 805 (+8.4%) | 782 (+5.4%) |
| dia 7 | andar mais alto | 29 | 30 (+3.4%) | 30 (+3.4%) | 30 (+3.4%) |
| dia 14 | materiais recebidos por dia (média dos dias 1 até aqui) | 395 | 501 (+26.8%) | 391 (-1%) | 458 (+16%) |
| dia 14 | valor de referência dos materiais por dia (ouro) | 1 913 | 2 655 (+38.8%) | 1 898 (-0.8%) | 2 306 (+20.6%) |
| dia 14 | ouro ganho por dia (média dos dias 1 até aqui) | 619 | 613 (-1%) | 626 (+1.2%) | 625 (+1%) |
| dia 14 | ouro de Masmorra + Caça por dia (as fontes que a Ganância toca) | 46 | 61 (+33.3%) | 51 (+9.9%) | 53 (+15%) |
| dia 14 | nível | 48 | 49 (+2.1%) | 48 (+0%) | 48 (+0%) |
| dia 14 | CP | 1 207 | 1 377 (+14%) | 1 297 (+7.4%) | 1 260 (+4.3%) |
| dia 14 | andar mais alto | 40 | 50 (+25%) | 40 (+0%) | 40 (+0%) |

| Marco (dia, mediana) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --: | --- | --- | --- | --- |
| primeira peça forjada | 2 | 2 | 2 | 2 |
| checkpoint 10 | 1 | 1 | 1 | 1 |
| segunda zona de caça | 6 | 4 | 5 | 5 |
| chefe 25 vencido | 6 | 4 | 5 | 5 |
| chegada ao andar 50 | 17 | 14 | 16 | 16 |
| chefe 50 vencido | depois do dia 21 | 16.5 | 17.5 | 20.5 |

O Caçador (combate 8,7% contra ~75% dos outros) chega ao chefe 50 no dia 20,5 contra 16,5 (Guerreiro) e 17,5 (Guardião): 3 a 4 dias, acima dos ~2 pedidos; materiais/dia +16% no dia 14 (meta 10-16%).


## Rodada 8 — atributos básicos (2026-10-11)

Pergunta do dono: "os pontos de status básicos estão equilibrados?" Os quatro atributos (STR, VIT, AGI, RES, 3 pontos por nível, 300 no nível 100). Medição completa, tabelas antes e depois e os limites B1 a B4 do diretor em `docs/ITEM_BALANCE_AUDIT.md` seção D (`npm run sim:items`); os limites viraram testes em `src/game/__tests__/attributes.test.ts`.

**Achado.** Sem habilidades, nos primeiros 30 níveis VIT era de longe o melhor ponto (1,93% de margem do duelo por ponto no nível 5 contra 0,41% da RES, razão 4,7x; 2,4x no nível 20) e RES e AGI eram escolhas fracas; do nível 45 em diante os quatro valiam parecido, mas no 100 o AGI valia 1,6x o VIT. Com habilidades quase nada muda (o Esmagador cresce com o dano, a Fúria é por tempo e não cresce com AGI: AGI vale 7 a 11% menos no Guerreiro). A CP já avaliava o ponto como o combate (0,88 a 1,13 do valor real: o "STR = VIT = 0,31%" da medição anterior era arredondamento da CP para inteiro num único ponto).

**O que mudou (só números).**

| Constante | Antes | Depois |
| --- | --: | --: |
| `T.advanced.vitHpPerPoint` | 5 | 4,5 |
| `T.advanced.vitHpPerLevel` (novo) | - | 0,03 (PV por ponto de VIT = 4,5 + 0,03 x nível: 4,6 / 5,1 / 6,3 / 7,5 nos níveis 5 / 20 / 60 / 100) |
| `T.advanced.resHpPerPoint` (novo) | - | 2 (RES dá 2 PV por ponto, além da resistência) |
| `T.battle.agiHalfPoint` | 100 | 80 (intervalo 400 + 800/(1+AGI/80) ms; o teto de 300 pontos passa de 600 para 568 ms) |
| orcs, andares 26-49, `hp` / `dmg` | 310 / 46 | 325 / 48 |

Não mexi em STR (0,5 plano + 0,3% por ponto), na resistência por ponto da RES (0,005), nos pesos da CP, em equipamento, habilidades ou drops. `buildCombatStats` / `playerMaxHp` leem as constantes; CP, Masmorra e Caça acompanham sozinhos. Tabela de CP recomendada regerada (`npm run sim:cp`: o chefe do andar 25 passa de 651 para 643).

**Resultado contra os limites do diretor.**

| Limite | Antes | Depois |
| --- | --- | --- |
| B1: melhor/pior por ponto, níveis 20-100 (<= 1,6x), 5-10 (<= 2,5x), sem habilidades / Guerreiro / Guardião | 5: 4,7 · 10: 3,1 · 20: 2,4 · 30: 1,9 · 45: 1,5 · 60: 1,4 · 80: 1,3 · 100: 1,6 (Guardião 5 a 100: 4,7 a 1,4) | 5: 2,46 · 10: 1,61 · 20: 1,30 · 30: 1,20 · 45: 1,13 · 60: 1,15 · 80: 1,22 · 100: 1,28; Guerreiro <= 1,41, Guardião <= 1,43 do nível 20 em diante |
| B2: nenhum "tudo em um" bate o balanceado em profundidade E caça | ok | ok (nenhum passa de +5% nos dois) |
| B2: nenhum fica mais de 35% abaixo | **falha**: nível 60 VIT -40%, RES -39% de materiais (Guardião -42 / -38%) | **falha, igual**: nível 60 VIT -41%, RES -41% (Guardião -41 / -37%); nível 100 -26 / -28%; Guerreiro -19 / -24%; profundidade no pior caso -18% (tudo STR, Guardião) |
| B3: retornos | decrescentes | decrescentes (AGI 0,69 -> 0,16 com 150 pontos; RES 0,44 -> 0,32); nenhum aumenta, nenhum cai abaixo de 20% |
| B4: CP / valor real em +-30% | 0,88 a 1,13 | 0,89 a 1,13 (sem mexer nos pesos) |

**B2 não atingido, por quê.** A Caça paga só velocidade de morte (a luta começa com HP cheio), e abaixo do ritmo de referência (220 mortes/h) os materiais crescem linearmente com as mortes; justamente nos níveis 50 a 70 o herói está nessa faixa. Um build 100% defensivo tem o mesmo valor por ponto na margem do duelo (e igual ou mais profundidade) e perde 37 a 41% dos materiais por não ter o dano dos pontos de STR/AGI. Cortar o valor de STR e AGI até fechar a diferença estragava B1 nos níveis 5 e 20 e só chegava a -33%. É uma propriedade da economia da Caça, não do valor dos atributos (decisão 1 abaixo).

**Tentativas descartadas (todas medidas com `npm run sim`).** (1) Cortar o dano plano de STR 0,5 -> 0,35 + PV de VIT 2,5 + 0,05 x nível + RES 1,25: B1 ok, mas a primeira sessão da conta nova terminava no andar 7 (meta >= 8) e o jogador sem habilidades chegava ao andar 50 no dia 21 (17 antes); CP -2% do nível 10 ao 30. (2) STR intacto + `agiHalfPoint` 80 + VIT 2,5 + 0,05 x nível: B1 ok, ainda andar 7 na primeira sessão (o PV do nível 5 e 10 caía 3 a 4%). (3) VIT 3,5 + 0,04 x nível: ainda andar 7. VIT 4,5 + 0,03 x nível devolve o andar 8 e mantém B1 (o nível 5 fica em 2,46, justo no limite de 2,5).

**Metas de progressão (cenário A, `npm run sim`, mediana de 20 seeds, antes -> depois).**

| Meta | Antes | Depois |
| --- | --- | --- |
| T2 primeira sessão termina no andar >= 8 | 8 | 8 |
| T3 primeira peça forjada até o dia 2 | dia 2 | dia 2 |
| T4 nível no fim do dia 1 / 3 / 14 (10-16 / 20-29 / 45-60) | 13 / 29 (25-33) / 49 (47-52) | 13 / 29 (25-33) / 49 (46-52) |
| T5 chefe 25 pela primeira vez (dia 4-6), vitória ao chegar | dia 4, 0% | dia 4, 0% |
| T6 chegada ao andar 50 | primeira seed dia 9, mediana 14 | primeira seed dia 8, mediana 13 |
| T6 chefe 50 | primeira seed dia 9, mediana 16,5, 13/20 em 21 dias | primeira seed dia 9, mediana 14,5, 20/20 |
| T7 menor razão (N+1)/(N-1) em volta dos chefes | 1,15 | 1,05 (sem queda de dificuldade depois de chefe) |

| Chegada ao andar 50 / chefe 50 (dia, mediana) | sem habilidades (Z) | Guerreiro (A) | Guardião | Caçador |
| --- | --- | --- | --- | --- |
| antes | 17 / depois do dia 21 | 14 / 16,5 | 16 / 17,5 | 16 / 20,5 |
| depois | 17 / 18 | 13 / 14,5 | 16 / 17 | 16 / 18 |

O jogador sem habilidades continua chegando ao andar 50 por volta do dia 17 (alvo 18-20). A primeira seed chega ao andar 50 no dia 8 (a meta aceita o dia 9); o rótulo "FORA DA META" do T6 vem do critério da própria simulação (nenhuma seed antes do dia 10, que o baseline anterior também não cumpria).

**Retune dos inimigos.** Só os orcs (325 / 48): sem isso a mediana do cenário A chegava ao andar 50 no dia 11 e a primeira seed no dia 7 (os valores novos de VIT e AGI deixam o herói do nível 30 ao 60 uns 3 a 6% mais forte em CP; a tabela de CP recomendada foi regerada e o baseline de `BALANCE_BASELINE.md` também).

**Política de atributos do jogador simulado (explícita).** `ATTR_WEIGHTS` em `scripts/sim/driver.ts`: 35% STR / 30% VIT / 20% AGI / 15% RES, aplicada a cada nível; é o "balanceado" de todas as auditorias (generalista levemente ofensivo, o que alguém que segue as descrições da tela faria; a tela não tem divisão recomendada). Sensibilidade: `ATTR_POLICY='{...}' npm run sim` troca a política. Chegada ao andar 50 (mediana, dia), sem habilidades / Guerreiro / Guardião / Caçador: política padrão 17 / 13 / 16 / 16; STR+VIT (45/40/5/10) 18 / 14 / 16,5 / 14; igual para todos (25/25/25/25) depois do dia 21 / 13 / 16 / 17. O cenário A (Guerreiro) se mexe no máximo 1 dia com qualquer uma das duas; o jogador **sem habilidades** com a divisão igual não chega ao andar 50 em 21 dias (mais de 4 dias de diferença), porque sem golpes o dano vem só de STR/AGI.

**Saves existentes.** Nenhum ponto é movido nem devolvido; o PV e o dano são recalculados dos pontos, então todo herói passa a valer o novo ponto. PV de um herói balanceado antes -> depois: nível 5: 235 -> 237, 20: 566 -> 586, 30: 804 -> 843, 60: 1373 -> 1497, 100: 2490 -> 2805 (+12,7%); CP do mesmo herói no nível 30 956 -> 991, no 60 1875 -> 1995, no 100 5173 -> 5623. Quem pôs todos os 300 pontos em VIT no nível 100 ganha 750 PV (1500 -> 2250 vindos de VIT), quem pôs em RES ganha 2 PV por ponto. O teste "existing saves" garante que os pontos carregam iguais.

**Tela Personagem.** A descrição de cada atributo agora mostra o efeito real do PRÓXIMO ponto, gerado dos números do motor (`src/game/attributes.ts`, `src/components/attrText.ts`; antes era "+ Dano Físico", "+ PV Máx", "+ Esquiva / Vel. de Ataque", "+ Redução de Dano": sem número, e AGI prometia esquiva que o combate não tem): "+0,5 de dano e +0,3% do dano da arma por ponto"; "+6,3 PV Máx por ponto (+0,03 a cada nível)"; "Ataca 4,7 ms mais rápido por ponto (até 300 pontos)"; "-0,19% de dano sofrido por ponto e +2 PV Máx". No teto de AGI o texto vira "No máximo: 300 pontos de Agilidade". Teste novo `attributes.test.ts` renderiza cada descrição em pt e en e confere os números contra as constantes. Visto em 1280x800 e 390x800: duas a três linhas por atributo, sem rolagem horizontal.

**Tetos.** AGI: teto de combate 300 pontos = o orçamento inteiro do nível 100, então só chega nele quem põe tudo em AGI; não há ponto desperdiçado e o piso de 400 ms nunca é atingido só com pontos (568 ms no teto). STR, VIT: sem teto. RES: assintótica. Nenhum teto é inalcançável.

**Pontos e redistribuição (só relatório).** 3 pontos por nível. Não há distribuição automática nem sugerida. **Existe respec de atributos**, e é grátis, sem limite e sem bloqueio em batalha: o botão "−" de cada linha da tela Personagem devolve o ponto na hora (`attrChange` em `App.tsx`).

**Decisões para o diretor.**

1. **B2 (VIT/RES todos os pontos, nível 60, -37 a -41% de materiais).** Opções: (a) aceitar, é o preço de um build defensivo puro (profundidade igual ou maior); (b) dar à Caça um pequeno crédito de sobrevivência (por exemplo, bônus de material por sub-nível mais alto que o herói aguenta, ou perder menos tempo com lutas perdidas), que é mexer em `huntCombat.ts` / `huntEconomy.ts`, fora do escopo desta rodada; (c) subir o piso do material para builds lentos. Recomendo (a) ou (b); não mexi.
2. **Primeiro dia (clava e trapos).** Com o equipamento inicial STR vale 3,0 e VIT 3,2 por ponto no nível 5 contra 0,73 do AGI (razão 4,3; 3,7 no nível 10): o limite de 2,5 só vale para o herói com tier 1 em diante. Para fechar seria preciso cortar o dano plano de STR, o que custa CP e atrasa o jogo todo.
3. **Respec grátis de atributos.** Hoje é livre e ilimitado; se a ideia é que a escolha pese, cobrar como o respec de habilidades (grátis uma vez, Ouro depois) é uma mudança de `attrChange`, sem tocar em dados. Não adicionei nada.
4. **Divisão recomendada.** Um botão "distribuição sugerida" (35/30/20/15 por nível, a política da simulação) ajudaria o jogador novo; custo pequeno (uma função pura e um botão), não adicionei.
