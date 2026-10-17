> **2026-10-11:** a moeda rara (`shards` no código e nos saves) agora se chama **Runas** (pt) / **Runes** (en) para o jogador; neste documento ela aparece como "Fragmento(s)" / "Shards", o nome antigo.
> **2026-10-16:** a moeda rara agora se chama **Éter** (pt) / **Aether** (en) para o jogador (antes Runas / Runes); o campo do save continua `shards`.

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

Únicos (Rodada 9: tabela agora 63/25/10/2, 1 único a cada ~25 dias por zona, chefes 3%; os números históricos abaixo são os de antes): instanciados, a raridade é sorteada na hora do drop com a tabela normal 60/25/12/3, **um slot extra de substat** garantido (lendário = 4), nunca forjados (sem receita), podem ser desmontados (devolvem o material da gêmea forjada, `salvageLike`), refinados, reforjados, descartados. Atributos = a peça forjada do tier normal de onde cai, +10 % no atributo principal (dano nas armas e luvas, PV na armadura e capacete, resistência nas botas, chance de crítico no anel).

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


## Rodada 9 — fluxo de materiais

Detalhe, tabelas e método em `docs/MATERIAL_FLOW.md` (medição no commit 1, antes/depois na seção 6). Resumo do que mudou:

**Materiais de caça (receitas e sumidouros).**
- Cada receita de equipamento dos tiers 1 a 6 passou a pedir os materiais de caça da zona do tier, em quantidade calculada para um conjunto completo de 7 peças (cadeia inteira) custar **2,4 / 4,2 / 11,3 / 22,2 / 33 / 42,3 horas de caça** nos tiers 1 a 6 (antes 0,5 / 0,9 / 1,9 / 2,4 / 3,5 / 4,3). Conjunto de tier 1: 21 → 91 Farrapos; tier 3: 73 / 11 / 8 / 19 / 0 / 4 → 311 / 237 / 31 / 180 / 200 / 33 (Farrapo, Garra, Núcleo, Osso, Sangue, Cristal).
- Curtume 20 → 8 de Ouro por Couro. Melhorias 3 a 8 do Baú pedem Couro, Osso, Garra e Sangue. Refino +4 a +8 gasta os materiais de caça do tier da peça (`refineHuntMaterials`).
- Chance dos raros −30% (Núcleo 1,0 → 0,7% e 2,5 → 1,75%; Cristal 1,5 → 1,05% e 3,0 → 2,1%; Chifre 2,0 → 1,4%; Coração 2,5 → 1,75%); as receitas foram recalculadas junto.
- Não feito: Oficina de campo (sem desenho que mude o veredito sem interface nova, decisão pedida ao diretor), corte de comuns, mineração/lenha dos tiers 5 e 6.

**Raridades e únicos mais difíceis (vão ser vendidos).**
- Tabela da forja 60 / 25 / 12 / 3 → **63 / 25 / 10 / 2**. Selo do Ferreiro: 80 / 20 → **83,3% épica / 16,7% lendária**, 0,6 → **0,5 lendária esperada por temporada**. Custo esperado de um lendário na forja: 33,3 → **50** forjas do mesmo item (épico + lendário 35,0 → 51,7).
- Únicos de caça: chance base de cada entrada ~7× menor, dimensionada para **um único de qualquer tipo a cada ~25 dias de 6 h/dia** na zona do estágio (antes ~4 dias); específico ~50 dias, específico Épico ~500, específico Lendário ~2 500. Únicos de chefe 8% → 3% por vitória; relíquias de chefe 4% → 3%.

**Vínculo ao equipar.** Toda instância de equipamento tem o campo opcional `bound`: ligado para sempre na primeira vez em que a peça é equipada (desequipar não desliga; forjar, desmontar, refinar, reforjar e reparar não mexem). Saves antigos: o que está equipado carrega vinculado, o que está na mochila não. `isTradeable(instância)` (`gearInstances.ts`) é a única regra do futuro mercado: não vinculada **e** (épica ou lendária **ou** o molde é único). Relíquias empilháveis, materiais e consumíveis nunca são negociáveis. Interface: marca discreta nos itens (◆ negociável, cadeado vinculado) e linha "Negociável / Vinculado / Não negociável" no detalhe; equipar pela primeira vez uma peça negociável pede confirmação uma vez. Ver `docs/INVENTORY.md`.

**Metas de progressão (cenário A).** Nível 13 / 27 / 47 nos dias 1 / 3 / 14, primeira peça forjada no dia 2, chefe 25 no dia 5. **Chegada ao andar 50: mediana 13 → 17 (16 → 19 sem nenhum único; a primeira seed dia 8 → 13)**, fora da faixa 12–15: metade é a saída dos únicos (o simulador de antes recebia um a cada ~3 dias), metade são as receitas maiores. Monstros não foram retunados (`hpGrowth`/`dmgGrowth` menores só tiraram 0,5 dia). Decisão pendente do diretor.

Ferramentas novas: `npm run sim:flow` (livro-razão por material, Runas, gemas, únicos, custo de conjunto e herói novo), `npm run sim:recipes` (calcula as quantidades das receitas a partir das horas-alvo), `SIM_NO_UNIQUES=1 npm run sim` (progressão sem nenhum único).


## Rodada 10 — equipamento forjado vale a pena, conjuntos e ritmo (2026-10-12)

Pergunta do dono: "melhore os atributos dos itens fabricados". Três commits: `balance: every crafted tier is a real upgrade`, `feat: wearing a matching set grants a set bonus`, `balance: mid-game pace restored after the recipe and unique changes`. Medições: `npm run sim:items` (seção N nova em `docs/ITEM_BALANCE_AUDIT.md`), `npm run sim` (20 seeds x 21 dias, cenário A, com e sem `SIM_NO_UNIQUES=1`).

### 1. Degraus de tier por linha

Medida de "poder" de uma peça: quanto ela soma à CP de um herói de referência (nível 60, conjunto do tier 3 em +4) sobre o mesmo herói com o slot vazio (`scripts/sim/tierSteps.ts`). Meta: cada tier vale 20 a 35% mais que o anterior, com o atributo principal E o secundário crescendo sempre. Antes: anel T2 e T4 sem crítico novo (0,06 / 0,06 / 0,08 / 0,08), luvas com crítico fixo de 2% do T1 ao T4, botas +13% no T6, anel +13%, escudo +14%, elmo +21%; espada e machado já subiam (o dourado era 1,32x do T3).

| Linha | Antes (principal / secundário) | Depois |
| --- | --- | --- |
| Anel, crítico (T1..T6) | 6 / 6 / 8 / 8 / 9 / 10% | 6 / 7 / 9 / 10,5 / 12,5 / 14,5% |
| Anel, dano crítico | +15 / 20 / 25 / 30 / 35 / 40% | +15 / 20 / 26 / 33 / 42 / 50% |
| Luvas, crítico (T1..T6) | 2 / 2 / 2 / 2 / 2,7 / 3% | 2 / 2,5 / 3 / 3,5 / 4 / 4,5% (T6: dano 37 -> 35) |
| Botas T5 / T6 (resistência, PV) | 13,5% 62 / 14,5% 76 | 15% 68 / 17,8% 88 |
| Escudo T5 / T6 (PV, resist., reflexo) | 96, 10,4%, 7% / 113, 11,3%, 8% | 104, 11,5%, 7,5% / 138, 14%, 9% |
| Elmo T5 / T6 (PV, resist.) | 149, 3,1% / 185, 3,6% | 153, 3,2% / 192, 3,8% |
| Armadura T4 / dragão / T5 / T6 (PV, resist., reflexo) | 220, 13%, 20% / 260, 15%, 22% / 340, 17%, 25% / 440, 20%, 28% | 220, 13%, 21% / 280, 16%, 23% / 360, 18%, 25% / 485, 22%, 28% |
| Espada T6 / machado T6 (dano) | 220 / 264 | 240 / 288 (mantém o orçamento de +28 a +40% das quatro peças extras sobre arma + armadura, que o anel e as botas novos estouravam no T6) |

Resultado (seção N): passo mínimo 1,18x (anel T6), máximo 1,35x (arma T6) nos tiers 4 a 6; os primeiros passos continuam maiores (1,4x a 2,2x), porque o tier 1 parte quase do zero.

**Cadeia única.** O dourado (T4) era um beco sem saída, mais fraco e mais caro em materiais de caça que o dragão. Agora o dragão (espada e armadura) é feito DO dourado (1 peça dourada + escamas + Runas): aço > dourado > dragão > voidsteel > abissal. O machado e as outras cinco linhas não têm dragão (dourado > voidsteel). Regra "uma peça do tier anterior" em todo lugar, exceto o T2 de arma e armadura (duas de bronze); o teste `chain rule` fixa isso.

### 2. Únicos: o tier que o herói tem ao chegar na origem

| Único | Origem | Antes (gêmea) | Depois (gêmea) | Poder / gêmea |
| --- | --- | --- | --- | --: |
| goblin_king_crown | chefe 25 | elmo de ferro (T2) | elmo de aço (T3) | x1,14 |
| warchief_gauntlets | chefe 50 | manoplas de aço (T3) | manoplas douradas (T4) | x1,14 |
| abyss_heart_ring | Abismo de Sangue | anel de obsidiana (T5) | anel abissal (T6) | x1,13 |
| bonecrusher_maul | Abismo de Sangue | lâmina do vazio (T5) | grande lâmina abissal (T6) | x1,10 |
| overlord_greataxe | chefe 100 | grande lâmina abissal (era uma ESPADA com queima) | machado abissal (T6, linha machado, sem queima) | x1,10 |
| os outros 9 | - | iguais | iguais (já estavam no tier atual) | x1,10 a x1,14 |

Estatísticas: principal +15% e secundárias +8% sobre a gêmea (era +10% só no principal e 3 a 9% de poder), mais a substat garantida; poder da peça 10 a 15% acima da gêmea (`itemBalance.test.ts`, R6). Raras e desejáveis, nunca obrigatórias (nenhum único passa da peça do tier seguinte).

### 3. Conjuntos (3 e 5 peças)

Função pura `setBonuses(peças vestidas)` (`src/game/setBonuses.ts`); `buildCombatStats` soma o resultado, então Masmorra, Caça, CP e jogador simulado leem o mesmo número. Conta sobre os 7 slots instanciados (arma de qualquer linha; o slot da relíquia não conta); único conta como a família da gêmea; 3 + 3 é legal e os dois bônus valem; nada vai para o save (saves antigos ganham o bônus do que já vestem). Efeitos só com stats que o motor já tem; o ouro entra no mesmo teto de 25% das substats.

| Família | 3 peças | 5 peças |
| --- | --- | --- |
| Bronze | +5% ouro | +5% dano crítico |
| Ferro | +4% defesa | regenera +0,3% da vida/s |
| Aço | +4% velocidade de ataque | +10% dano crítico |
| Dourado | +8% ouro | +5% dano final |
| Dragão (só arma + armadura: 2 peças) | +2% roubo de vida | - |
| Aço do Vazio | +6% velocidade de ataque | +15% dano crítico |
| Abissal | +7% dano final | +6% velocidade de ataque |

Tela: linha "Conjunto Aço 3/5 — +4% velocidade de ataque" (ativo) e "5 peças: +10% dano crítico" (apagado) acima dos cartões de equipamento, para a família com bônus ativo ou a uma peça de ativar; no detalhe do item e na receita da forja, o conjunto da peça e os bônus com a contagem (pt/en, paridade testada). Testes novos em `setBonuses.test.ts` (contagem, limites, conjuntos mistos, únicos, relíquia, dragão, Masmorra e Caça leem o mesmo, save antigo, textos). As medidas de balanço de UMA peça (orçamento de poder dos slots extras, escudo, único contra a gêmea) rodam com `withoutSetBonuses` (`scripts/sim/duel.ts`); o conjunto é uma segunda camada.

Descartados: roubo de vida +3% no 5 do Abissal (e regeneração 0,4%) quebravam B1 / B4 do nível 100 ou ficavam fracos; o Bronze 5 como regeneração 0,3% levou o nível 5 para 2,62 (limite 2,5), por isso é dano crítico +5%. O Dragão é a única família com só 2 peças possíveis, então o bônus é "2 de 2" e a peça também conta como duas douradas (decisão 1 abaixo).

### 4. Ritmo (depois das duas mudanças acima)

Depois dos itens 1 a 3 a chegada ao andar 50 (sem únicos) foi de 19 para 17 (primeira seed 16 -> 13), ainda fora da faixa 12-15. Investigação (`SIM_FAST=1`, 10 a 20 seeds, 15 a 30 s):

1. **O jogador simulado travava a arma e a armadura do T3 por falta de gema, sem precisar.** `planFor` marcava o plano como bloqueado quando faltava uma gema (rubi na espada, safira na armadura) mesmo com Runas de sobra para comprá-la; o alvo só voltava à arma depois de forjar todo o resto do tier, então a espada do T3 só aparecia no dia 17 e a armadura no 18. Corrigido: bloqueia só se as Runas da receita mais as gemas que faltam não estão lá. É uma correção da política da simulação, não do jogo; sozinha, no código de antes, leva a chegada de 19 para 17 (sem únicos) e de 17 para 17 (com únicos): por isso a tabela abaixo traz uma coluna "antes*" com a política corrigida.
2. **Tamanho dos bônus dos conjuntos T2-T3** (alavanca 1): ferro 6% defesa / regen 0,5% e aço 6% velocidade / 20% crítico, e a versão 8% / 25%: mediana da chegada igual (15, dentro do ruído de 10 seeds). Não ajudam o suficiente; ficam pequenos, como o pedido.
3. **Quantidades do T3** (alavanca 2): caça de todas as peças do T3 x0,75: sem ganho (mediana 16,5; a caça deixou de ser o único gargalo depois da correção 1); descartado. **Arma e armadura do T3 passam a pedir UMA peça do T2 em vez de duas** (as outras cinco peças do T3 já pediam uma): mediana 17,5 -> 15 (20 seeds). Custo de caça do conjunto do T3: 11,3 -> 10,4 h; Garra 237 -> 189 (`MATERIAL_FLOW.md`; o teste B2 segue em 10-20 h).
4. Não toquei em HP / dano dos inimigos nem nos portões de nível 25 de mineração e lenha (a alavanca 3 não foi necessária). A tabela de CP recomendada foi regerada (`npm run sim:cp`) nos dois primeiros commits porque os números de equipamento mudaram; no terceiro nada de combate mudou.

**Guard table (cenário A, 20 seeds, mediana).** U = com únicos (padrão), N = `SIM_NO_UNIQUES=1`. "Antes" = commit 02a85af; "antes*" = o mesmo código com a política corrigida (item 4.1); "depois" = este commit.

| Meta | Antes U / N | Antes* U / N | Depois U / N |
| --- | --- | --- | --- |
| T2 primeira sessão >= andar 8; checkpoint 10 no dia 1 | 8 / 8 | 8 / 8 | 8 / 8 |
| T3 primeira peça forjada | dia 2 / 2 | 2 / 2 | 2 / 2 |
| T4 nível dia 1 / 3 / 14 (10-16 / 20-29 / 45-60) | 13 / 27 / 47 · 13 / 27 / 47 | 13 / 27 / 47 · 13 / 27 / 47 | 13 / 27 / 47 · 13 / 27 / 47 |
| T5 chefe 25 pela 1ª vez (dia 4-6); vitória ao chegar | dia 5, 0% · dia 5, 0% | idem | idem |
| T6 chegada ao andar 50: 1ª seed / mediana (meta 12-15) | 13 / 17 · 16 / 19 | 14 / 17 · 12 / 17 | **12 / 15 · 12 / 15** |
| T6 chefe 50: 1ª seed / mediana / seeds em 21 dias | 13 / 19,5 / 17 · 16 / 20 / 15 | 14 / 18,5 / 13 · 13 / 19,5 / 13 | 13 / 16,5 / 18 · 13 / 17,5 / 19 |
| T7 menor razão (N+1)/(N-1) em volta dos chefes (>= 1,0) | 1,05 | 1,05 | 1,05 |
| T8 derrota mantém 75% do ouro | 75% | 75% | 75% |
| I1 inventário enche (dia 3-6), mediana | 6 | 6 | 6 |
| I2 perda do jogador atento (< 5%), pior seed | 3,4% · 6,1% | 20,6% · 20,6% | 1,3% · 1,8% |
| I3 perda de quem ignora o inventário (>= 10%), mediana | 83% · 87% | 83% · 87% | 86% · 88% |
| I4 ouro do mercador (< 35%) dias 3 / 7 / 14 | 0 / 21 / 26% · 0 / 22 / 26% | 0 / 21 / 26% · 0 / 22 / 26% | 0 / 21 / 25% · 0 / 21 / 26% |
| Herói sem habilidades (Z): chegada ao andar 50 (meta ~dia 20) | depois do 21 · depois do 21 | - | 19 · 20 |

Chegada ao andar 50 por seed (depois, sem únicos): 12 13 13 14 14 15 15 15 15 15 15 16 16 18 18 18 18 18 19 20 (com únicos: 12 13 13 13 14 14 15 15 15 15 15 16 16 16 18 18 18 19 20 20).

### 5. Passe de Aventureiro: o dono continua à frente (não foi ajustado em direção à paridade)

| Medida (mediana) | Antes U / N | Depois U / N |
| --- | --- | --- |
| dia 7: materiais/dia (média acumulada) | +40% (N) | +36% (N) |
| dia 14: materiais/dia (média acumulada) | +77% (N) | +73% (N) |
| dia 14: ouro/dia (média acumulada) | +77% (N) | +74% (N) |
| dia 7: nível / CP | +7,5% / +10,4% · +4,9% / +9,3% | +5,1% / +2,2% · +6,4% / +2,1% |
| dia 14: nível / CP | +6,4% / +30,7% · +7,4% / +36,9% | +6,4% / +19,7% · +6,4% / +18,1% |
| dia 14: andar mais alto | +34% · +35% (54 contra 40) | +38% · +45% (60 contra 42) |
| chegada ao andar 50: dono / sem Passe (dias adiantados) | 13,5 / 17 (3,5) · 14 / 19 (5) | 12,5 / 15 (2,5) · 13 / 15 (2) |
| chefe 50: dias adiantados | 5 · 6 | 3,5 · 4,5 |

O dono segue claramente à frente (andar 60 contra 42 no dia 14, materiais +73%, ouro +74%), mas a vantagem em dias encolheu de 5 para 2 (sem únicos): quem não tem o Passe ficou 2 a 4 dias mais rápido e o dono, limitado por outra coisa (nível e ouro), quase não se mexeu. O CP do dia 7 do dono mal passa o do não-dono (+2%; antes +9 a +10%): não investiguei a causa, o número do dia depende de qual peça cada um forjou naquele dia. Para o dono ganhar de novo, a alavanca é do Passe (rendimento de materiais e ouro), não da forja; não mexi.

### 6. Testes que mudaram e ferramentas

- `attributes.test.ts` B2: limite de materiais do build "tudo VIT / RES" no nível 60 de -0,45 para -0,5 (a regressão vem do crítico novo dos anéis e luvas do T4: -41% -> -46%; a causa continua sendo a economia da Caça, decisão 1 da Rodada 8).
- `itemBalance.test.ts` (R5, R6), `catalog.test.ts` (o dragão é o único que aceita uma peça do próprio tier), `contentPack2.test.ts`, `extraSlots.test.ts`, `gearEffects.test.ts` (números novos; o machado de chefe do andar 100 não queima).
- `npm run sim:items` voltou a rodar (a seção A fabricava uma adaga com 1 Couro em vez de 7).
- `npm run sim`: `SIM_FAST=1` (só o cenário A, 10 a 20 seeds em 15 a 30 s; `SIM_FAST_Z=1` e `SIM_FAST_PASS=1` somam o controle sem habilidades e o dono do Passe), `SIM_GEAR='{"steel_plate":{"_items":{"iron_chainmail":1}}}'` e `SIM_SETS='{"steel":[{...},{...}]}'` para testar uma receita ou um conjunto sem editar o código.

### 7. Decisões que o diretor pode discordar

1. **Dragão conta como dourado.** A família dragão só tem arma e armadura, então o bônus de 3 peças seria inalcançável; fiz "2 de 2" e cada peça de dragão também conta como uma dourada. Alternativa: dragão sem conjunto, só conta como dourado.
2. **Cadeia do dragão através do dourado** aumenta o custo de chegar ao T5 em arma e armadura (mais uma peça dourada na cadeia). Nada no horizonte de 21 dias chega lá.
3. **T3 arma / armadura com uma peça do T2** foi a alavanca de ritmo que valeu; o tamanho dos conjuntos não moveu a mediana.
4. **A correção da política da simulação** mudou o "antes" em até 2 dias; as duas colunas ficam na tabela.
5. **Vantagem do Passe em dias menor** (item 5).


## Rodada 12 — maestria, receitas, Profundezas, Paragon e o Passe (2026-10-12)

Quatro commits: `feat: profession mastery and new recipes for the top levels`, `feat: endless depths beyond floor 100 and paragon levels`, `balance: the Adventurer Pass keeps its owner clearly ahead` e o de documentação. Medições: `npm run sim` (20 seeds x 21 dias, cenário A, com e sem `SIM_NO_UNIQUES=1`), `SIM_PASS_ONLY=1` (dono contra não-dono), `npm run sim:flow` (fluxo de materiais). Detalhe de profissões em `docs/PROFESSIONS_AUDIT.md` (seção 8) e de fluxo em `docs/MATERIAL_FLOW.md` (seção 7).

### 1. Profissões, receitas e consumíveis

**Plantas novas (Jardinagem 46-75; XP = 5 por hora de canteiro, como todas):**

| Planta | Nível | Tempo | Colheita | Usada em |
|---|---|---|---|---|
| Sálvia Prateada (`silver_sage`) | 50 | 8 h | +2 | Pedra de Amolar |
| Orquídea do Crepúsculo (`dusk_orchid`) | 60 | 12 h | +1 | Polimento de Armadura |
| Raiz Anciã (`elder_root`) | 70 | 16 h | +1 | Kit de Reparo Mestre |

**Maestrias** (`mastery.ts`, `T.mastery`; determinísticas, sem sorteio). Mineração e Lenhador: 50 = +4% de unidades, 60 = 1 Pó de Refino a cada 40 unidades, 70 = mais +4% (total +8%), 75 = 1 gema a cada 250 unidades. Jardinagem: 50 = plantas 5% mais rápidas, 60 = mais 5% (total 10%), 70 = 1 Pó por 4 h de crescimento de cada colheita, 75 = colheitas de plantas raras +1. A lista **Próximos desbloqueios** (tiers ou plantas e as quatro maestrias) aparece nas telas de Mineração, Lenhador e Horta.

**11 receitas novas nas estações que já existem** (Poções do Ofícios e Pó de Refino; nenhuma tela nova):

| Receita | Entradas | Ouro | Nv | Efeito |
|---|---|---|---|---|
| Kit de Reparo | 4 Ferro, 4 Madeira comum, 2 Osso | 40 | 10 | +60 de durabilidade na arma e na armadura equipadas |
| Tônico do Prospector | 1 Prata, 2 Carvalho, 2 Cardo, 1 Flor Dourada | 60 | 20 | +10% de minério e madeira por 2 h (soma com a Poção do Coletor) |
| Isca do Caçador | 3 Sangue, 2 Capim Veloz, 1 Raiz Amarga | 90 | 30 | +10% de chance dos materiais incomuns e raros da zona em que foi usada, 60 min |
| Pedra de Amolar | 1 Ouro bruto, 3 Ferro, 1 Sálvia, 1 Cristal | 80 | 45 | +4% de dano, 30 min |
| Kit de Reparo Mestre | 3 Prata, 3 Ébano, 3 Sangue, 1 Raiz Anciã, 1 Lírio Lunar | 120 | 60 | repara a arma e a armadura por completo |
| Polimento de Armadura | 1 Obsidiana, 1 Madeira élfica, 1 Madeira ancestral, 1 Orquídea, 1 Flor Carmesim, 2 Cristal | 150 | 65 | +5% de redução de dano (soma com a Pele de Pedra), 30 min |
| Pó de Refino a partir de Ferro / Madeira comum / Carvalho / Ébano / Cardo de Ferro | 10 / 10 / 8 / 8 / 6 | 0 | 1 a 25 | 1 Pó (razão saída/entradas >= 0,6) |

Os efeitos de tempo usam a máquina de buffs que já existe (`buffs.ts`, as janelas da Caça em `huntCombat.ts`); nenhum combate novo. A Isca só vale com uma caça em andamento e só para a zona dela; a Pedra e o Polimento valem na Masmorra e na Caça; o Tônico, na coleta.

**Teto dos consumíveis novos** (documentado e testado, `T.consumables.newConsumableCap` = 10%): tudo o que é novo e pode estar ativo junto soma no máximo **+4% de dano** (só a Pedra de Amolar, que multiplica como os outros buffs de dano) e **+10% de rendimento por atividade** (a Isca na Caça, o Tônico em Mineração e Lenhador; o Polimento só toca a soma de redução). Como empilham com os antigos: dano multiplica (Elixir de Força x Elixir de Ataque x Pedra); o rendimento de coleta soma horas efetivas com a Poção do Coletor (+25% mais +10% = +35% nas horas cobertas); a redução do Polimento soma com a da Pele de Pedra dentro da fórmula assintótica `dano / (1 + soma)`.

**Ícones pendentes** (caem no emoji até o PNG existir; `src/game/iconPending.ts`; o teste exige tirar o id da lista quando o arquivo aparecer): `silver_sage`, `dusk_orchid`, `elder_root`, `repair_kit`, `master_repair_kit`, `sharpening_stone`, `armor_polish`, `hunter_lure`, `prospector_tonic`.

**Efeito no fluxo** (`MATERIAL_FLOW.md`, seção 7): todo material de uso único ganhou segundo uso e os sumidouros existem, mas em 21 dias o veredito quase não muda (o desgaste de durabilidade só custa ~200 de Ouro de reparo no período, 70 com o kit). É estrutural, não de receita: ver a decisão 3.

### 2. Profundezas e Paragon

**Profundezas.** Abrem depois que o chefe do andar 100 cai. A profundeza d é o monstro do andar 99 (11 226 PV, 563 de dano) vezes 1,04^d de PV e 1,03^d de dano (porcentagem fixa por profundeza, sem tabela). Um chefe a cada 10 profundezas, com PV x1,6 e dano x1,25 sobre a regular, usando as quatro fichas de chefe de bioma em rodízio (25 Rei Goblin, 50 Chefe Orc, 75 Lich, 100 Minotauro), tingidas e renomeadas. O CP recomendado vem de fórmula, `CP(andar 99) x raiz(PV x dano)` (a tabela gerada para no 100). O progresso é guardado (a próxima descida começa uma profundeza abaixo da mais funda vencida), então cada profundeza, e a rolagem de únicos do chefe, vale **uma vez**. O recorde (`stats.deepestDepth`) aparece no mapa da Masmorra, nas Estatísticas e no Códice (quatro chefes novos).

| Profundeza | Multiplicador PV / dano | PV / dano do monstro | CP recomendado | Recompensa | Chance de único / relíquia |
|---|---|---|---|---|---|
| 1 | 1,04 / 1,03 | 11 675 / 580 | 3 997 | ouro (a mesma fórmula dos andares, +1,2% por estágio) | - |
| 10 (chefe) | 2,37 / 1,68 | 26 588 / 946 | 7 703 | ouro x5, 4 Runas, 1 gema, XP de chefe | 3,0% |
| 25 | 2,67 / 2,09 | 29 927 / 1 179 | 9 124 | ouro | - |
| 50 (chefe) | 11,37 / 5,48 | 127 647 / 3 085 | 30 485 | ouro x5, 4 Runas, 1 gema | 5,0% (teto) |
| 100 (chefe) | 80,8 / 24,0 | 907 150 / 13 525 | 170 159 | ouro x5, 4 Runas, 1 gema | 5,0% (teto) |

Únicos: o chefe da profundeza 10 k sorteia as peças do chefe de bioma [25, 50, 75, 100][(k-1) mod 4]; chance 2% + 0,1% por profundeza, teto de 5%, por peça e por relíquia, vezes a Sorte Grande. Esperado por chefe vencido: no máximo 3 x 5% = **0,15 peça**, e um chefe de profundeza só é vencido uma vez; mesmo um herói que avance um chefe a cada 3 dias dá no máximo uma peça a cada **20 dias** (testado). Cinco conquistas (profundezas 1 / 10 / 25 / 50 / 100, de 300 a 3 000 de ouro e 1 a 10 Runas; só leem as estatísticas, que o simulador não passa) e um título (Caminhante das Profundezas, na 50).

**Paragon.** Depois do nível 100 o XP continua contando: o nível de Paragon n custa 5% do XP do nível 99 -> 100 vezes 1,015^(n-1) (os 50 primeiros somam ~0,8x o XP de toda a carreira até o 100) e dá **+0,2% de dano para sempre**, no máximo **+10%** (nível 50). Aparece ao lado do nível ("Nv 100 · Paragon 12"). Nada novo no save: o nível sai do `xp`, que antes era zerado no carregamento se passasse do teto. Um herói abaixo do 100 tem os mesmos números de sempre (o termo vale exatamente 1).

**Andares 1 a 100 inalterados.** Testes reescrevem as fórmulas antigas de PV, dano, chefe, checkpoint, XP e CP e conferem os 100 andares; e a saída do simulador de 21 dias (`SIM_FAST=1 SIM_FAST_PASS=1`, com únicos) é **idêntica linha a linha** antes e depois do commit.

### 3. Passe de Aventureiro: o dono volta a ficar claramente à frente

Mudou só o que é do dono: armazém **6 h -> 8 h**, ouro **+10% -> +15%**, XP das Entregas **+10% -> +20%**, e um **Kit de Reparo por dia** (ao abrir o jogo em um dia novo, até 5 guardados). Materiais +10%, pedidos +1 / +1, bolsa, Baú e reparo -20% ficaram. Nada do não-dono e nenhuma meta da tabela de guarda foi tocada. Tentativas (20 seeds, mediana; chegada ao andar 50 em dias de vantagem; CP do dia 7): só aumentar materiais e ouro (+25% / +20%) = 4 dias mas CP do dia 7 +0,4%; só o armazém de 8 h = 3,5 dias e +12,9%; **armazém 8 h + ouro 15% + XP 20% = 4,5 dias e +23,5%** (adotado); somar materiais +15% ou +20% não ajudou (4 dias). O armazém é a alavanca: com duas visitas por dia (12 h entre elas) o dono guarda o dobro do não-dono em cada visita.

| Medida (mediana, dono contra não-dono) | Antes | Depois |
|---|---|---|
| dia 7: materiais/dia (média acumulada) | +38,9% | **+138%** |
| dia 14: materiais/dia | +76,2% | **+137%** (meta >= +60%) |
| dia 21: materiais/dia | +69,6% | **+141%** |
| dia 7: nível / CP | +5,1% / +2,2% | +15,4% / **+23,5%** (meta >= +8%) |
| dia 14: nível / CP | +6,4% / +19,7% | +9,6% / +28,5% |
| dia 21: nível / CP | +4,0% / +12,4% | +12,0% / +42,4% |
| dia 14 / 21: andar mais alto | +37,9% / +10% (60 / 72) | +51,7% / +23,1% (66 / 80) |
| dia 14 / 21: ouro/dia | +73,5% / +11,8% | +83,7% / +82,3% |
| chegada ao andar 50 (dias adiantados) | 15 contra 12,5 (**2,5**) | 15 contra 10,5 (**4,5**; meta 4 a 5) |
| chefe 50 (dias adiantados) | 3,5 | 5 |
| chefe 25 (dias adiantados) | 1 | 1 |

Sem únicos (`SIM_NO_UNIQUES=1`): chegada ao andar 50 do dono 10,5 contra 15 do não-dono (4,5 dias), chefe 50 do dono 11 contra 17,5 (6,5), CP do dia 7 +18,9%. A tela do Passe passou a ser gerada de `passPerks.ts`, e o teste `passPerks.test.ts` confere cada linha (armazém, ouro, materiais, pedidos, bolsa, Baú, reparo, Kit diário) contra o que o motor faz, em pt e en.

### 4. Tabela de guarda (cenário A, 20 seeds, mediana), antes -> depois

U = com únicos (padrão), N = `SIM_NO_UNIQUES=1`. "Antes" = commit f86c612. **Idêntica nas duas colunas em todas as metas.** A única diferença do relatório inteiro é a Jardinagem da tabela de profissões, 1 nível a mais no máximo do dia 12 em diante (os perks da Horta).

| Meta | Antes U / N | Depois U / N |
|---|---|---|
| T2 primeira sessão >= andar 8; checkpoint 10 no dia 1 | 8 / 8 | 8 / 8 |
| T3 primeira peça forjada (dia <= 2) | 2 / 2 | 2 / 2 |
| T4 nível dia 1 / 3 / 14 (10-16 / 20-29 / 45-60) | 13 / 27 / 47 · 13 / 27 / 47 | 13 / 27 / 47 · 13 / 27 / 47 |
| T5 chefe 25 pela 1ª vez (dia 4-6); vitória ao chegar | dia 5, 0% · dia 5, 0% | dia 5, 0% · dia 5, 0% |
| T6 chegada ao andar 50: 1ª seed / mediana (meta 12-15) | 12 / 15 · 12 / 15 | 12 / 15 · 12 / 15 |
| T6 chefe 50: 1ª seed / mediana / seeds em 21 dias | 13 / 16,5 / 18 · 13 / 17,5 / 19 | 13 / 16,5 / 18 · 13 / 17,5 / 19 |
| T7 menor razão (N+1)/(N-1) em volta dos chefes (>= 1,0) | 1,05 | 1,05 |
| T8 derrota mantém 75% do ouro | 75% | 75% |
| I1 inventário enche (dia 3-6) | 6 | 6 |
| I2 perda do jogador atento (< 5%), pior seed | 1,26% | 1,26% |
| I3 perda de quem ignora (>= 10%), mediana | 85,7% | 85,7% |
| I4 ouro do mercador (< 35%) dias 3 / 7 / 14 | 0 / 20,7 / 25,3% | 0 / 20,7 / 25,3% |

### 5. Decisões que o diretor pode discordar

1. **Maestrias sem sorteio.** O pedido sugeria uma pequena chance de rendimento dobrado; fiz +4% determinístico (mesmo valor médio, coleta reproduzível, simulador intocado).
2. **Armazém do Passe de 8 h.** É a alavanca que devolveu os 4,5 dias de vantagem, mas com duas visitas a 12 h de intervalo ela dobra a coleta do dono (materiais +137% no dia 14, bem acima da meta de +60%). Alternativa: 7 h (3 dias, CP do dia 7 +6,7%) ou 8 h com materiais de volta a +5%.
3. **Os sumidouros novos não movem o veredito de 21 dias** (`MATERIAL_FLOW.md`, 7.1): o consumo recorrente do reparo é pequeno porque o desgaste é pequeno. Para a abundância de comuns virar "certa" teria de crescer o desgaste de durabilidade ou o consumo dos tônicos; é decisão de design, não mexi.
4. **Profundezas íngremes de propósito.** PV +4% e dano +3% por profundeza, compostos, pedem ~7,7 mil de CP na profundeza 10 e ~30 mil na 50: o herói de nível 100 com equipamento do tier 6 chega a uma parede na casa das 10 a 25 profundezas. Dois números em `T.depths` (`hpGrowth`, `dmgGrowth`) movem isso.
5. **Chefes de profundeza dão Runas (4) e únicos uma vez só**, porque o progresso é guardado; a chance de único (3 a 5%) não leva o ritmo acima de ~1 peça por 20 dias, mas também faz o endgame de únicos depender de ir fundo, não de repetir.
6. **Paragon em dano (+0,2% por nível, teto +10%)** em vez de ouro: empurra a profundidade sem criar renda. Custo e crescimento em `T.paragon`.
7. **A Isca do Caçador só funciona durante uma caça** (a zona vem da caça em andamento); fora dela o item não é gasto e um aviso explica.

### 6. Não feito, ou verificado só em parte

- Os ícones dos 3 materiais e dos 6 consumíveis novos estão pendentes (emoji no lugar).
- O relatório de fluxo mede só o que 21 dias alcançam; Pedra de Amolar, Kit Mestre e Polimento (Jardinagem 50 / 60 / 65) têm testes de receita e de efeito, mas nenhuma medição de uso real.
- Conferido no navegador em desktop e em 390 x 800: mapa da Masmorra com as Profundezas, uma luta de profundeza (regular e de chefe), a lista de desbloqueios da Mineração, a Horta (só desktop), as receitas (só desktop) e o nível com Paragon. A tela do Passe não foi aberta no navegador (o dono do Passe não existe no save de revisão); ela é coberta por teste.

## Rodada 13 — metas semanais e sequência de login (2026-10-12)

Nenhum número existente mudou. Entram dois sistemas novos, que o jogador resgata com um botão e que o simulador de progressão nunca resgata (`SIM_FAST=1 npm run sim` antes e depois: saída idêntica, byte a byte, inclusive as medianas do cenário A):

| O quê | Quando | Recompensa |
|---|---|---|
| 4 metas semanais (das 5: horas de caça 6, pedidos 3, unidades coletadas 150, peças forjadas 4, andares 25; uma sai a cada semana) | segunda 00:00 UTC | 150 de Ouro cada |
| bônus das 4 metas | idem | 400 de Ouro + 3 Runas |
| sequência de login, dia 1 / 2 / 3 / 4 / 5 / 6 / 7 | dia UTC; faltar um dia volta ao dia 1 | 80 Ouro / 120 Ouro / Isca do Caçador / 160 Ouro / Kit de Reparo / 240 Ouro / 300 Ouro + 3 Runas + Polimento de Armadura |
| Escudo de Sequência (Passe) | 1 por semana UTC | um único dia perdido não zera a sequência |

Soma por semana (tudo resgatado): 1000 de Ouro das metas + 900 de Ouro da sequência + 6 Runas + 3 itens; as missões diárias pagam 3150 de Ouro e 14 Runas por semana. As metas leem a diferença entre as estatísticas da vida inteira e uma foto tirada no começo da semana (dois contadores novos: `huntSeconds`, `dungeonFloors`), então não há contador novo nos caminhos quentes e a primeira semana de um save antigo começa em zero. Números em `T.weekly`, `T.streak` e `T.battlePass.streakSavers`.

## Rodada 14 — pedidos, metas semanais e Profundezas acompanham o herói (2026-10-12)

Três mudanças de número, uma por pergunta da revisão de QA da rodada 13 (`UI_REVIEW.md`). O resto da rodada (telas da primeira hora, teste de fumaça) não mexe em balanceamento. Ferramentas novas: `npm run sim:orders` (quanto vale uma hora de Caça por nível de herói e o que o pedido paga), `npm run sim:depths` (até que profundeza chega cada herói de fim de jogo; aceita `DEPTH_HP`, `DEPTH_DMG`, `DEPTH_BOSS_HP`, `DEPTH_BOSS_DMG`, `PARAGON_DMG`, `PARAGON_MAX` para testar hipóteses), e o teste `round14.test.ts`, que mantém as três regras abaixo.

### 1. Pedidos: Ouro e XP crescem com o nível

**Problema.** Um herói de nível 100 recebia pedidos de 30 minutos a +17 Ouro (tier 3 local, 34,5 Ouro/h): o pagamento era função só de tier x tempo e o tier para no andar 76.

**Âncora.** O que uma hora de Caça rende no mesmo nível de herói, medido por `npm run sim:orders`: a melhor zona e profundidade que o herói vence sempre (`outlook 'always'`), sub-nível 5, e tudo o que cai vendido ao mercador (`T.merchant.priceRate` = 15% do valor de referência) mais o Ouro da zona.

| Herói | Valor de referência de 1 h de Caça (Ouro + materiais a 100%) | Vendido ao mercador | Pedido hoje (Ouro/h, tier da zona) |
|---|---|---|---|
| nível 1, sem equipamento | 159 | ~27 | 30 a 35 |
| nível 10, tier 1 +4 | 294 | ~47 | 30 a 35 |
| nível 30, tier 3 +4 | 435 | ~68 | 33 a 38 |
| nível 50, tier 4 +4 | 738 | ~120 | 34,5 a 39,5 |
| nível 75, tier 5 +4 | 1 272 | ~203 | 34,5 a 39,5 |
| nível 100, tier 6 +8 | 1 821 | ~285 | 34,5 a 39,5 |

No começo o pedido já paga o que a Caça paga (~1,1x no nível 1); a diferença abre de verdade depois do nível 40. Por isso o fator é 1 até o nível 40 (as primeiras sessões e a guarda de progressão ficam idênticas) e depois sobe em linha reta até âncoras que igualam o pedido ao que a Caça pagaria vendida ao mercador.

**Regra nova** (`deliveries.ts orderLevelFactor`, `T.deliveries.levelScale*`): fator 1 até o nível 40; 3,2 no 50; 5,5 no 75; 7,7 no 100 (interpolação linear entre as âncoras). Multiplica o Ouro **e o XP** do pedido, na hora de gerar a oferta (fica congelado no snapshot como antes). **A carga que o pedido pede não muda** (o tamanho dela vem do Ouro sem fator): o pedido continua sendo um bônus sobre materiais que o jogador já tem, e nenhum sorteio muda (as ofertas saem iguais, só o pagamento muda). O tier dos materiais pedidos (`deliveryTier`, andar 26 / 51 / 76) já fazia parte do Ouro por hora, e continua.

Recompensa de um pedido, antes -> depois (valores nominais, sem a variação de ±10% do tempo; Ouro e, na última coluna, XP de um pedido de 10 h):

| Nível (tier) | 30 min Ouro | 4,5 h Ouro | 10 h Ouro | 10 h XP |
|---|---|---|---|---|
| 1 (0) | 15 -> 15 | 144 -> 144 | 335 -> 335 | 11 200 -> 11 200 |
| 10 (0) | 15 -> 15 | 144 -> 144 | 335 -> 335 | 11 200 -> 11 200 |
| 30 (2) | 17 -> 17 | 158 -> 158 | 365 -> 365 | 11 200 -> 11 200 |
| 50 (3) | 17 -> 54 | 164 -> 525 | 380 -> 1 216 | 11 200 -> 35 840 |
| 75 (3) | 17 -> 94 | 164 -> 902 | 380 -> 2 090 | 11 200 -> 61 600 |
| 100 (3) | 17 -> 131 | 164 -> 1 263 | 380 -> 2 926 | 11 200 -> 86 240 |

O teste confere (a) níveis 1 a 30 pagam exatamente o que pagavam (muito dentro de ±10%), (b) a razão entre o que o pedido paga por hora e o que a Caça paga vendida ao mercador fica entre 0,8 e 1,2 nos níveis 50, 75 e 100 (hoje 0,99 / 1,00 / 1,00), (c) a carga é a mesma que um herói de nível 30 recebe com a mesma semente.

### 2. Metas semanais e sequência de login em quatro faixas

Faixa pelo nível do herói: 1 a 24, 25 a 49, 50 a 99, 100 com Paragon. A faixa das metas fica **fixa quando a semana começa** (`WeeklyState.band`; um herói que sobe de nível na quarta continua na faixa da segunda; uma semana salva antes das faixas assume a faixa do herói na primeira leitura). A sequência de login usa a faixa do herói no dia do resgate. Runas **não** escalam. A faixa 1 é exatamente o que era.

| Faixa | Horas de caça | Pedidos | Coletar | Forjar | Andares (Profundezas contam) | Ouro por meta | Bônus de 4 metas | Sequência: dia 1 / 2 / 4 / 6 / 7 |
|---|---|---|---|---|---|---|---|---|
| 1 (1-24) | 6 | 3 | 150 | 4 | 25 | 150 | 400 + 3 Runas | 80 / 120 / 160 / 240 / 300 |
| 2 (25-49) | 8 | 4 | 250 | 5 | 35 | 300 | 800 + 3 Runas | 160 / 240 / 320 / 480 / 600 |
| 3 (50-99) | 10 | 5 | 400 | 6 | 50 | 900 | 2 400 + 3 Runas | 480 / 720 / 960 / 1 440 / 1 800 |
| 4 (100+) | 12 | 6 | 600 | 7 | 60 | 1 500 | 4 000 + 3 Runas | 800 / 1 200 / 1 600 / 2 400 / 3 000 |

Multiplicadores de Ouro 1 / 2 / 6 / 10 (`goldMult2..4`). Uma hora de Caça vendida ao mercador vale ~27 Ouro/h no nível 1, ~60 no 25, ~120 no 50, ~285 no 100 (1 / 2,2 / 4,4 / 10,6 vezes o do nível 1; a faixa 3 vai de 4,4x no 50 a 7,5x no 75, daí o 6). O contador de andares já somava as profundezas (`stats.dungeonFloors` vem de `recordDungeonRun`, que conta as profundezas como estágios): vale em todas as faixas, e só a faixa 4 chega lá. O simulador de progressão nunca resgata metas nem sequência, então nada disso mexe nas medianas.

### 3. Profundezas: do muro nas profundezas 10 a 25 a uma escada até a 50

**Medição** (`npm run sim:depths`; herói de nível 100, equipamento tier 6 +8 nos 7 slots, atributos do simulador, build Guerreiro, sem poções; profundeza vencida = 2 de 3 execuções com a semente, a tabela mostra a última de uma sequência sem quebra):

| Herói | Antes | Depois |
|---|---|---|
| comum, Paragon 0 | 19 | **24** |
| comum, Paragon 10 | 19 | 29 |
| comum, Paragon 20 | 19 | 32 |
| comum, Paragon 30 | 19 | 32 |
| comum, Paragon 40 | 19 | 35 |
| comum, Paragon 50 | 19 | 39 |
| épico, Paragon 0 / 20 / 50 | 29 / 29 / 29 | 37 / 39 / 48 |
| lendário, Paragon 0 | 29 | 41 |
| lendário, Paragon 10 / 20 / 30 / 40 | 29 / 29 / 29 / 29 | 47 / 49 / 49 / 49 |
| lendário, Paragon 50 | 29 | **55** |

Antes, o muro era o chefe da profundeza 20 (x1,6 PV, x1,25 dano: um salto de CP de uns 40%, mais do que o herói comum tem para dar) e o Paragon quase não ajudava (+0,2% de dano por nível, +10% no teto, 5% de CP). Agora: o herói comum chega à 24, cada 10 níveis de Paragon valem 3 a 5 profundezas até o próximo muro, e a profundeza 50 só cai para quem tem peças lendárias **e** perto do Paragon máximo (lendário com Paragon 20 a 40 para na 49; épico com Paragon 50 chega à 48; lendário com Paragon 50 passa).

**Números** (`T.depths`, `T.paragon`):

| Número | Antes | Depois |
|---|---|---|
| PV por profundeza (composto) | +4% | +3,5% |
| dano por profundeza (composto) | +3% | +3% |
| chefe de profundeza, PV / dano | x1,6 / x1,25 | x1,1 / x1,05 |
| Paragon, dano por nível | +0,2% | **+3%** |
| Paragon, teto | +10% | **+150%** (no nível 50, como antes) |

O Paragon virou a alavanca principal do fim de jogo, porque só dano: o jogo inteiro até aqui (Caça, Masmorra andares 1-100, Profundezas) o usa, e nenhum herói chega ao nível 100 antes do dia 21 do simulador (mediana do nível no dia 14: 47), então a guarda de progressão não vê a mudança. O custo de XP de cada nível de Paragon não mudou. O custo é real: com +3% por nível, um Paragon 10 já deixa um herói 30% mais forte na Caça e na Masmorra também (não só nas Profundezas); é o preço de a pergunta pedir "+3 a 5 profundezas a cada 10 níveis" sem tirar o muro. Andares 1 a 100 não mudam (o teste de identidade de `depths.test.ts` continua verde). Chance de único / relíquia do chefe, Runas e recorde por profundeza não mudam: o ritmo máximo de únicos vindos das Profundezas continua o mesmo (no máximo 0,15 peça por chefe, e cada chefe só rende uma vez; mesmo um herói que passe por um chefe a cada 3 dias não passa de 1 peça em 20 dias, `depths.test.ts`).

### 4. Tabela de guarda (cenário A, 20 seeds, mediana), antes -> depois

U = com únicos (padrão), N = `SIM_NO_UNIQUES=1`. "Antes" = commit e6e75ca (a árvore antes da rodada, exportada com `git archive`); "depois" = esta rodada.

| Meta | Antes U / N | Depois U / N |
|---|---|---|
| T2 primeira sessão >= andar 8; checkpoint 10 no dia 1 | 8 / 8 | 8 / 8 |
| T3 primeira peça forjada (dia <= 2) | 2 / 2 | 2 / 2 |
| T4 nível dia 1 / 3 / 14 (10-16 / 20-29 / 45-60) | 13 / 27 / 47 · 13 / 27 / 47 | 13 / 27 / 47 · 13 / 27 / 47 |
| T5 chefe 25 pela 1ª vez (dia 4-6); vitória ao chegar | dia 5, 0% · dia 5, 0% | dia 5, 0% · dia 5, 0% |
| T6 chegada ao andar 50: 1ª seed / mediana (meta 12-15) | 12 / 15 · 12 / 15 | 12 / 15 · 12 / 14,5 |
| T6 chefe 50: 1ª seed / mediana / seeds em 21 dias (meta ~12-16) | 13 / 16,5 / 18 · 13 / 17,5 / 19 | 13 / 15 / 20 · 13 / 15 / 20 |
| T7 menor razão (N+1)/(N-1) em volta dos chefes (>= 1,0) | 1,05 | 1,05 |
| T8 derrota mantém 75% do ouro | 75% | 75% |
| I1 inventário enche (dia 3-6) | 6 | 6 |
| I2 perda do jogador atento (< 5%), pior seed | 1,26% · 1,83% | 1,75% · 1,08% |
| I3 perda de quem ignora (>= 10%), mediana | 85,7% · 88,1% | 83,6% · 88% |
| **I4 ouro do mercador (< 35% do ouro de antes do mercador) dias 3 / 7 / 14** | 0 / 20,7 / 25,3% · 0 / 20,7 / 25,7% | 0 / 20,7 / 25,3% · 0 / 20,7 / 25,7% |

Ler: nenhuma meta mexe de lugar, e as duas que mexem (chefe do andar 50 e, no N, a chegada) melhoram dentro da faixa pedida: de 16,5 / 17,5 para 15 dias (mediana) porque, do nível 40 (por volta do dia 9) em diante, o pedido passa a pagar mais Ouro e XP; chegada ao andar 50 e chefe 25 ficam onde estavam, e o nível do dia 14 fica igual. A linha I4 (a "parcela do mercador" que a guarda pede) não se move: o Ouro do mercador depende do que sobra de material, e o pedido novo não toca nele.

### 5. Decisões que o diretor pode discordar

1. **"O que a Caça pagaria" é Ouro mais materiais vendidos ao mercador (15%)**, não o Ouro cru da zona (3 a 12 por hora, "troco" desde a rodada de 2026-10-10), porque com o Ouro cru o pedido do nível 1 já pagaria 5x o que a Caça paga e a regra de manter o começo igual não fecharia. Com o valor de referência a 100% (a unidade das cargas) o pedido fica a ~0,2x da Caça já no nível 1; o mercador é o que o jogador consegue de fato transformar em Ouro.
2. **O fator só começa no nível 40**, não no 30: de 1 a 30 os pedidos ficam idênticos (a guarda de progressão nem vê a diferença) e o salto de 1 para 3,2 entre os níveis 40 e 50 é a rampa. Na prática o herói simulado só passa do nível 40 por volta do dia 9, e a guarda quase não se mexeu (abaixo).
3. **XP dos pedidos sobe junto com o Ouro** (mesmo fator). Só faz diferença de verdade entre os níveis 40 e ~70: um pedido de 10 h dá 36 mil XP no nível 50 (o nível 51 pede 53 mil) e 86 mil no nível 100, onde um nível de Paragon custa 35,2 milhões. Se for demais no meio, a âncora `levelScale50` é o botão.
4. **A carga do pedido não sobe**: um pedido de nível 100 pede o mesmo punhado de materiais de um de nível 30 e paga 7,7x. Isso o faz valer mais como "Ouro por hora parado" e menos como destino de material. Se a ideia era o contrário, o ajuste é dimensionar a carga pelo Ouro com fator e subir os tetos `cap*` de `T.deliveries`.
5. **Paragon de +0,2% para +3% por nível** muda mais que as Profundezas: ver 3. A alternativa (manter o Paragon e achatar o crescimento das profundezas para ~1% por nível) tira o muro de todo mundo e deixa a profundeza 50 aberta ao equipamento lendário sozinho.
6. **Chefes de profundeza quase iguais a uma profundeza comum** (x1,1 PV, x1,05 dano): o salto de x1,6 / x1,25 criava degraus de 10 em 10 profundezas que escondiam o efeito do Paragon e do equipamento. O chefe continua sendo o único que rende Runas e únicos, e é marcado como chefe na tela.
7. **Faixas pelo nível do herói, não pelo Paragon**: a faixa 4 é "nível 100" (qualquer Paragon).

### 6. Achado que o diretor precisa saber: o nível 100 e o Paragon estão fora do alcance do XP de hoje

`xpToReachLevel`: nível 50 = 326 mil XP, 75 = 18,1 milhões, 90 = 324 milhões, 100 = 3,34 **bilhões**; o nível de Paragon 1 custa 35,2 milhões e o 10, 40,3 milhões cada. A Caça paga no máximo ~9 mil XP/h (nível 75 em diante) e um estágio da Masmorra ou das Profundezas ~350 a 510 XP. Ou seja, ninguém chega ao nível 100, muito menos a Paragon, com as taxas de XP de depois do corte de 10x de 2026-10-10 (`huntingZones.ts`). As faixas altas desta rodada (pedidos acima do nível 75, metas da faixa 4, Paragon nas Profundezas) estão ajustadas contra heróis construídos pelo simulador (`buildHero`), como o pedido descreve, e não contra um ritmo de XP que existe. Este documento não mexe na curva de XP. **(Resolvido na Rodada 15, abaixo.)**

### 7. Não feito, ou verificado só em parte

- A tela de metas / pedidos nas faixas 2 a 4 foi conferida por teste e pelos números na tela de Missões num save de nível 100; nenhum pedido de nível 50 a 100 foi aceito e entregue até o fim no navegador (o relógio real não deixa).
- O simulador de progressão só chega ao nível ~50 no dia 21: as faixas altas dos pedidos (nível 50 a 100) e do Paragon dependem do teste `round14.test.ts` e dos relatórios `sim:orders` / `sim:depths`, não do cenário A.

## Rodada 15 — o jogo depois do dia 21 ganha um ritmo (2026-10-13)

O achado da seção 6 acima (o nível 100 e o Paragon fora do alcance do XP) era só a ponta: **nada depois do dia 21 tinha sido simulado**, e a segunda metade do jogo (peças tier 4 a 6, andares 76 a 100, última zona, Profundezas, Paragon) nunca teve ritmo. Esta rodada traz uma ferramenta nova, o simulador de longo prazo, e usa os números dela para dar um ritmo a esses 160 dias sem mexer nos dias 1 a 21.

**Ferramenta.** `npm run sim:long` (`scripts/sim/longHaul.sim.ts`, `scripts/sim/long.mjs`): 6 seeds x 180 dias para o jogador comum (cenário A: 2 visitas por dia, sem Passe) e para o dono do Passe (cenário P), repartidas em processos (uns 6 min por seed de 180 dias; com 7 processos, uns 15 min para as 12). O jogador é o mesmo de `npm run sim` (as mesmas funções reais do jogo) com a bandeira `long`: depois do chefe do andar 100 as sessões vão para as Profundezas, e ele registra o Paragon, a profundeza, os tiers vestidos e **o que trava o próximo passo** (nível, materiais, ouro, CP). Imprime marcos, uma tabela a cada 10 dias, XP por fonte, a comparação dono contra não-dono e o maior trecho sem desbloqueio. Variáveis: `LONG_SEEDS`, `LONG_DAYS`, `LONG_SCEN`, `LONG_WORKERS`, `LONG_OUT`, `LONG_KEEP`, `SIM_T` / `SIM_ZONES` / `SIM_GEAR` / `SIM_GATES` / `SIM_SETS` (trocar números sem editar) e `SIM_NO_UNIQUES=1`. **As tabelas abaixo são sem peças únicas**: um único de arma ou anel vale +30 a 60% de CP no andar 100 e cai ao acaso, e com ele a mediana de 6 seeds oscila demais; a rodada com únicos (4 seeds) está na seção 4 e conta a mesma história com 0 a 6 dias de diferença.

### 1. Estado de antes (o que o jogo era do dia 21 em diante)

Medido com o jogador corrigido (seção 9) e os números de antes (a árvore desta rodada com os valores velhos trocados por `SIM_T` / `SIM_ZONES` / `SIM_GATES` / `SIM_GEAR`; sem únicos, 6 seeds, mediana / seed mais rápida; "nunca" = não chega em 180 dias):

| Marco | Alvo | Sem Passe (A) | Dono (P) |
|---|---|---|---|
| nível 60 | dia 30-40 | 37 / 35 | 30 / 22 |
| nível 75 | 55-75 | 178 (5 de 6) / 177 | 149 / 148 |
| nível 90 | 95-125 | nunca | nunca |
| nível 100 | 130-170 | nunca | nunca |
| chefe do andar 75 | 35-55 | 29,5 / 27 | 16,5 / 16 |
| chefe do andar 100 | 110-160 | 155,5 (5 de 6) / 96 | 127,5 / 58 |
| conjunto T4 vestido | 30-45 | 34,5 / 33 | 23,5 / 20 |
| conjunto T5 | 60-90 | nunca (a arma T5 no dia 178) | 157,5 / 155 |
| conjunto T6 | 110-150 | nunca | nunca |
| última zona de caça (andar 76) | - | 29,5 / 27 | 16,5 / 16 |
| profundeza 10 | - | nunca (2 de 6, dia 179) | 152,5 / 149 |
| Paragon 1 | - | nunca | nunca |
| maior trecho sem desbloqueio (dia 21 a 180) | ~5 dias | mediana 68, pior 73 dias (dias 104-176) | 73 dias (dias 76-148) |

O nível parava em 75: o jogador ganhava uns 145 mil XP por dia (a última zona, 8 h por visita) e o nível 76 custa 3,7 milhões. A primeira medição, ainda com o jogador sem os consertos da seção 9 e com únicos, dava o mesmo quadro (nível 70 só no dia 99, conjunto T4 no dia 57 em 4 de 6 seeds, nenhum T5, nenhum nível 75 em 3 de 6 seeds).

### 2. O que mudou

| Número | Antes | Depois |
|---|---|---|
| Curva de XP, crescimento por nível nos níveis 61-80 / 81-100 (`heroGrowth4/5`) | 1,21 / 1,27 | **1,03 / 1,03** |
| XP total até o nível 100 | 3,34 bilhões | **19,9 milhões** |
| Caça, Fenda do Demônio (zona 3), XP/h | 4 650 | **6 000** |
| Caça, Abismo de Sangue (zona 4, a última), XP/h; teto de armazenamento sem Passe | 6 950; 8 h | **13 000; 6 h** (o dono continua com 8 h) |
| XP de um pedido: fator máximo de nível | 7,7 (no nível 100) | **3,2** (do nível 50 em diante; o Ouro mantém 3,2 / 5,5 / 7,7) |
| Andares 51-75, PV / dano extra por andar (`lateHp/DmgGrowth`) | 0 | **+1,2% / +0,9%** |
| Andares 76-100, PV / dano extra por andar (`lateHp/DmgGrowth2`) | 0 | **+7,0% / +4,1%** |
| Fator sobre o andar 100 (PV / dano / PV x dano) | 1 / 1 / 1 | 3,05 / 2,25 / 6,9 (andares 1-50 intocados, byte a byte) |
| Peças T5 (elmo / luvas / botas / escudo / anel; arma e armadura seguem em 70) | nível 70 | **72 / 74 / 76 / 78 / 80** |
| Peças T6 (idem; arma e armadura seguem em 90) | nível 90 | **92 / 94 / 96 / 98 / 100** |
| Obsidiana e madeira ancestral (nível de Mineração / Lenhador) | 70 | **60** |
| Fornalha de obsidiana e cabo ancestral (nível do herói) | 75 | **70** |
| Paragon, dano por nível / teto | +3% / +150% | **+1% / +50%** |
| Paragon, custo do nível 1 (parte do custo do nível 99 -> 100) / crescimento por nível | 35,2 milhões (0,05) / 1,5% | **457 mil (0,6) / 1%** |
| Profundezas, profundeza 0 | o monstro do andar 99 | **x0,51** dele (PV e dano) |
| Profundezas, crescimento por profundeza, PV / dano | 3,5% / 3% | **2,8% / 2,2%** |
| Profundezas, chefe, PV / dano | x1,1 / x1,05 | **x1 / x1** |

Tabela de recomendação de CP por andar regerada (`npm run sim:cp`): os andares 87 a 100 que nenhum herói da escada (nível 100, tier 6 +8) limpa agora recebem o CP que a lei de potência dos andares medidos pede (andar 99: 9 875, andar 100: 12 394), e não "o CP do herói mais forte" (6 728) repetido em todos. O jogador simulado limpa o andar 100 com ~8 000 de CP porque bebe tônicos e poções; o herói de referência da escada não.

### 3. XP por nível, antes e depois

| Nível | Custo de subir do nível (antes) | (depois) | XP total até o nível (antes) | (depois) |
|---|---|---|---|---|
| 50 | 53 070 | 53 070 | 325 729 | 325 729 |
| 60 | 255 097 | 255 097 | 1 514 126 | 1 514 126 |
| 70 | 1 418 318 | 332 844 | 7 308 369 | 4 360 779 |
| 80 | 9 541 732 | 447 314 | 45 991 294 | 8 176 458 |
| 90 | 82 008 846 | 583 643 | 323 929 743 | 13 168 081 |
| 99 | 704 845 916 | 761 522 | 2 630 733 708 | 19 097 376 |
| 100 | - | - | 3 335 579 624 | 19 858 898 |

Os níveis 1 a 60 são idênticos (o teste `xpCurve.test.ts` confere cada nível); a curva é contínua (cada banda começa no preço em que a anterior terminou) e nunca fica mais barata de um nível para o seguinte. Com ~200 mil XP por dia (a última zona, 12 h) um nível custa de 1,3 dia (nível 60) a 3,8 dias (nível 99).

**Saves antigos** (`xpCurve.ts`, `normalizeSave`): um save que tem o selo do esquema de equipamento mas não o selo novo `xpCurve: 2` tem o XP **mapeado**: o jogo lê qual nível e que fração dele o XP tinha na curva velha e grava o XP que dá o mesmo nível e a mesma fração na nova. Até o nível 60 o XP não muda; acima, cai (um herói de nível 75 com 18,1 milhões passa a ter ~6,0 milhões e continua nível 75, a meio caminho do 76). O nível nunca muda, para cima ou para baixo (o teste varre os níveis 1 a 99 no início, no meio e no fim do nível). Um objeto sem nenhum dos dois selos (teste, importação feita à mão) é lido como está: a curva nova só torna um nível mais barato, ninguém perde nível. Quem tivesse passado do nível 100 na curva velha (3,3 bilhões, ninguém) mantém os níveis inteiros de Paragon.

### 4. Marcos depois (sem únicos, 6 seeds; mediana / seed mais rápida)

| Marco | Alvo | Sem Passe (A) | Dono (P) | Dono mais rápido em |
|---|---|---|---|---|
| nível 60 | dia 30-40 | **38** / 34 | 24,5 / 23 | 36% |
| nível 75 | 55-75 | **71** / 67 | 57 / 45 | 20% |
| nível 90 | 95-125 | **106** / 102 | 87 / 76 | 18% |
| nível 100 | 130-170 | **141** / 135 | 114 / 104 | 19% |
| chefe do andar 75 | 35-55 | **37,5** / 30 | 33,5 / 17 | 11% |
| chefe do andar 100 | 110-160 | **136,5** / 122 | 100 / 87 | 27% |
| conjunto T4 | 30-45 | **39** / 31 | 28 / 19 | 28% |
| conjunto T5 | 60-90 | **83** / 78 | 67,5 / 56 | 19% |
| conjunto T6 | 110-150 | **142** / 135 | 114 / 105 | 20% |
| última zona (andar 76) | - | 37,5 / 30 | 33,5 / 17 | 11% |
| profundeza 10 / 30 | - | 136,5 / 141 | 100 / 103 | 27% / 27% |
| Paragon 1 / 10 / 25 | - | 143 / 164,5 / mais de 180 | 116 / 131,5 / 161 | 19% |

Com únicos (4 seeds, mediana): A nível 60 / 75 / 90 / 100 nos dias 42 / 68,5 / 103,5 / 138, chefe 75 no 39,5, chefe 100 no 113,5, T4 / T5 / T6 nos 35,5 / 76,5 / 138; P nos 25,5 / 49,5 / 77,5 / 103,5, chefe 75 no 21, chefe 100 no 76, T6 no 100,5. Todos dentro das janelas pedidas, menos o nível 60 com únicos (42 contra 30-40) e, no dono, o chefe do 75 (a janela é de CP, não de tempo: o dono só chega 4 dias antes). O dono fica 18 a 28% mais rápido nos marcos de nível e de peças (a meta era 20 a 30%); o que lhe dá a vantagem na segunda metade é o teto de 8 h na última zona (o comum tem 6), os +10% de materiais e a vaga extra de pedidos.

### 5. Paragon e Profundezas

**Paragon** (+1% de dano por nível, teto +50% no nível 50): o nível 1 custa 457 mil XP, o 10 custa 500 mil, o 25 custa 580 mil, o 50 custa 744 mil; os 50 níveis juntos, 29,5 milhões. Um herói de nível 100 que caça 12 h por dia (~200 mil XP) ganha um nível de Paragon a cada 2,3 dias (nível 1) a 3,7 dias (nível 50), 147 dias para os 50: o jogador simulado faz 16 níveis nos 39 dias seguintes ao nível 100 (um a cada 2,4 dias), o dono 33 em 66 dias.

**Profundezas** (`npm run sim:depths`; herói de nível 100 com as sete peças tier 6 +8 da mesma raridade, atributos do simulador, build Guerreiro, sem poções; profundeza vencida = 2 de 3 execuções):

| Herói | Rodada 14 | Agora |
|---|---|---|
| comum, Paragon 0 / 10 / 20 / 30 / 40 / 50 | 24 / 29 / 32 / 32 / 35 / 39 | **20 / 23 / 26 / 27 / 27 / 30** |
| épico, Paragon 0 / 20 / 50 | 37 / 39 / 48 | **35 / 37 / 45** |
| lendário, Paragon 0 / 10 / 20 / 30 / 40 / 50 | 41 / 47 / 49 / 49 / 49 / 55 | **43 / 43 / 46 / 49 / 51 / 51** |

Um herói de nível 100 em tier 6 +8 comum chega à profundeza 20 (alvo 20-25); cada 10 níveis de Paragon valem +3 a +4 profundezas nos dois primeiros blocos (+1 a +3 depois, onde o teto de 50% já pesa pouco); a profundeza 50 só cai para o herói **todo lendário com Paragon 40 ou mais** (o lendário no Paragon 30 para na 49, o épico no Paragon 50 na 45, o comum no 30). Chance de único / relíquia do chefe, Runas e recorde por profundeza não mudam: o limite de 1 peça de profundeza por ~20 dias do `depths.test.ts` continua verde. O jogador simulado passa pelas profundezas 10, 20 e 30 num intervalo de 4 a 5 dias logo depois do chefe do 100 (as primeiras são fáceis, 0,51 do andar 99), mas cada chefe só rende uma vez e o esperado de peças dessa primeira rajada é menor que 0,5. Ele chega à profundeza 35 (31 a 43) no dia 180, mais fundo que o herói de referência porque a raridade das peças que ele forja varia e ele bebe tônicos.

### 6. Tabela de guarda dos dias 1 a 21 (cenário A, 20 seeds, mediana), antes -> depois

U = com únicos (padrão), N = `SIM_NO_UNIQUES=1`. "Antes" = a árvore antes das mudanças de número desta rodada; "depois" = esta rodada.

| Meta | Antes U / N | Depois U / N |
|---|---|---|
| T2 primeira sessão >= andar 8; checkpoint 10 no dia 1 | 8 / 8 | 8 / 8 |
| T3 primeira peça forjada (dia <= 2) | 2 / 2 | 2 / 2 |
| T4 nível dia 1 / 3 / 14 (10-16 / 20-29 / 45-60) | 13 / 27 / 47 · 13 / 27 / 47 | 13 / 27 / 47 · 13 / 27 / 47 |
| T5 chefe 25 pela 1ª vez (dia 4-6); vitória ao chegar | dia 5, 0% · dia 5, 0% | dia 5, 0% · dia 5, 0% |
| T6 chegada ao andar 50: 1ª seed / mediana (meta 12-15) | 12 / 15 · 12 / 14,5 | 12 / 15 · 12 / 14,5 |
| T6 chefe 50: 1ª seed / mediana / seeds em 21 dias | 13 / 15 / 20 · 13 / 15 / 20 | 13 / 15 / 20 · 13 / 15 / 20 |
| T7 menor razão (N+1)/(N-1) em volta dos chefes (>= 1,0) | 1,05 | 1,08 |
| T8 derrota mantém 75% do ouro | 75% | 75% |
| nível no dia 21 | 51 (49-53) · 51 (49-52) | 51 (49-53) · 51 (49-53) |
| andar mais alto no dia 21 (mediana) | 70 · 70 | **60 · 62** |

O que muda nos dias 1-21 é só o andar 51 em diante: a zona 3 paga 6 000 XP/h (a partir do andar 51, uns dias 15-21) e os andares 51-75 ficaram mais duros (no dia 21 a mediana está no andar 60-62, não no 70). O nível do dia 21 e as metas T2 a T8 não se movem.

### 7. Trechos sem desbloqueio (dia 21 a 180)

"Desbloqueio" = uma peça de tier novo vestida, uma zona, um chefe 25/50/75/100, uma profundeza múltipla de 5, um ponto de habilidade (nível múltiplo de 5), um perk de maestria. O `sim:long` mede o maior intervalo entre dois deles; o Paragon (um nível a cada 2-4 dias) conta à parte.

| | Sem Paragon | Contando o Paragon |
|---|---|---|
| Antes, A | mediana 68, pior 73 dias (104-176) | idem |
| Antes, P | 73 dias (76-148) | idem |
| Agora, A (mediana das seeds / pior seed) | 28 / 36 dias (138-173, **depois** do nível 100 e do T6) | 12 / **14 dias (106-119)** |
| Agora, P | 52 / 75 dias (106-180, depois do nível 100) | 9 / **10 dias (38-47)** |

Até o nível 100 e o conjunto T6 o pior trecho de qualquer seed é de **14 dias** (A, dias 106-119) e **10 dias** (P, dias 38-47). O trecho típico do comum é de 12 dias entre os dias 90 e 119 (níveis 84 a 95: o conjunto T5 fecha no dia 83 e a primeira peça T6 só vem com o nível 90, no 106): é o buraco que sobra depois de escalonar as portas. Depois do nível 100 e do T6 só restam o Paragon (a cada 2-4 dias) e as profundezas (um múltiplo de 5 a cada poucos dias até a 35, depois mais raro).

### 8. Outras coisas que dependiam do nível, conferidas

- **Pedidos**: o Ouro mantém o fator de 3,2 / 5,5 / 7,7 (ancorado no que a Caça paga em Ouro, que não mudou). O XP, não: 61 mil e 86 mil XP de um pedido de 10 h nos níveis 75 e 100 passariam a valer 15% e 11% de um **nível** na curva nova (e 36% e 51% de uma hora de caça da última zona); o fator do XP agora para em 3,2 (`T.deliveries.xpFactorMax`, 35,8 mil XP por pedido de 10 h do nível 50 em diante). O jogador simulado ganha 0,2 a 17 mil XP por dia em pedidos (de 200 mil no total).
- **Metas semanais** (faixas 1-24, 25-49, 50-99, 100+): o jogador comum fica na faixa 3 do dia 17 ao dia 141 e entra na faixa 4 no 141; as horas de caça da faixa (10 e 12 por semana) cabem no que ele caça (84 h por semana).
- **Pontos de habilidade** (1 a cada 5 níveis, 20 no total): o jogador comum ganha um a cada 9 a 19 dias entre os níveis 60 e 100 (8 pontos em 103 dias); sem mudança.
- **Pontos de atributo** (3 por nível, 300 no 100): sem mudança; o teto de 300 de AGI do combate continua certo.
- **Conquistas de nível**: não existem no jogo (as de profissão e de CP não dependem da curva); não há nada a mudar.
- **Tabela de CP recomendada**: regerada (seção 2); o teste `balance.test.ts` confere que está em dia.

### 9. O jogador simulado: o que foi consertado, e o que o simulador longo não modela

Consertos de política que só aparecem depois do dia 21 (a bandeira `long` liga só neles; nada muda nos dias 1-21 do `npm run sim`):

1. O jogador veste a peça de tier maior mesmo que ela esteja em +0 e a antiga em +8. Sem isso ele nunca refinava a nova, ficava com a velha e **forjava a mesma armadura tier 4 outra vez, dezenas de vezes** (era o que segurava o conjunto T4 em 57 dias e o T5 para sempre).
2. A ordem de forja dos itens de mesmo tier (o garfo dragão do tier 4 é feito com uma peça dourada do tier 4): o ingrediente vem antes. Antes o jogador tentava a armadura de escamas, falhava por falta do ingrediente e ficava dias nisso.
3. Mochila cheia e uma recompensa de caça com peça única segurada: o jogador libera espaço (guarda, vende, descarta o excesso e as peças de tier menor que não são ingrediente) e resgata de novo. Sem isso a caça parava para sempre por volta do dia 40.

**Não modelado** (o relatório diz o que cada tabela inclui): metas semanais e sequência de login (Ouro e Runas), a trilha do Passe, sessões extras de Masmorra com Runas, rerrolagem de pedidos, mercado entre jogadores, desmonte de peças, reforja, a Relíquia de Temporada, poções além das pequenas de HP, o Jardim além do que a política já planta. **Aviso de economia**: a partir do dia ~60 o jogador simulado precisa jogar fora centenas de unidades dos materiais raros que sobram (a mochila enche, o baú tem 50 espaços e o mercador compra uma quantidade limitada por dia): a segunda metade tem muito material sobrando e pouco destino para ele além das receitas.

### 10. Decisões que o diretor pode discordar

1. **Zona 4 com teto de 6 h (era 8) e 13 000 XP/h.** É o que dá ao dono do Passe (teto de 8 h) +33% de horas na última zona e os 18 a 28%: sem isso o dono ficava só 13 a 23% à frente nos níveis 90 e 100. Quem olha o teto da zona vê 6 h em vez de 8; o comum passa de 145 mil para 203 mil XP por dia na última zona (13 000 x 1,3 x 12 h).
2. **Zona 3 paga 29% mais XP** (4 650 -> 6 000). Sem isso o nível 60 do jogador comum caía no dia 46 (alvo 30-40), porque a zona 4 agora só abre depois do chefe do 75 (dia ~37). Mexe nos dias 15-21 (o nível do dia 21 e as metas T2-T8 não mudam).
3. **Andares 51-100 mais duros**: o andar mais alto no dia 21 cai de 70 para 60. É o preço de segurar o chefe do 75 até o dia ~37 e o do 100 até o ~136. A tabela de CP recomendada para os andares 87-100 passa a ser extrapolada (12 394 no andar 100), bem acima do CP com que o jogador simulado limpa o andar (~8 000, com tônicos e poções).
4. **Portas das peças T5 e T6 escalonadas** (elmo 72 ... anel 80; 92 ... 100). Dá um desbloqueio novo a cada ~5 dias entre os níveis 70-80 e 90-100, mas o conjunto T6 só fecha no nível 100 (dia 142; o alvo era 110-150). Se preferir tudo em 70 / 90, o custo é um buraco de uns 25 dias sem peça nova.
5. **Obsidiana e madeira ancestral abrem na profissão 60** (eram 70) e os dois consumidores na Fornalha / Carpintaria no nível 70 do herói (eram 75): com 70 a profissão só chegava ao dia ~95 e o conjunto T5 fechava depois do dia 150. O teste `professions.test.ts` passou a pedir 10 níveis de distância da ouro / élfica, não 15.
6. **Profundeza 0 em 0,51 do monstro do andar 99**: a profundeza 1 é mais fácil que o andar 99 (potência cerca de 0,26x), para que o herói de referência (nível 100, tier 6 +8 comum) chegue à profundeza 20 sem herdar inteiro o fator de 6,9x dos andares 76-100. A recomendação de CP da profundeza 0 é a do andar 99, a da profundeza 1 já cai para ~0,5x.
7. **XP de pedido limitado em 3,2x**: a decisão 3 da rodada 14 dizia "se for demais, o botão é levelScale50"; usei um teto separado para o Ouro manter as âncoras.
8. **O mapeamento de saves antigos preserva o nível, não o XP.** A alternativa mais simples (não mapear) deixaria um herói de nível 75 pulando para o 99 só por carregar o jogo; a escolhida mantém o nível 75 e a fração dentro dele. Quem estava no nível 75 com 18,1 milhões passa a ver 6,0 milhões.
9. **Alvo do nível 60**: a mediana ficou em 38 (sem únicos) e 42 (com únicos), no limite alto da janela de 30-40 (a curva até o 60 é a de antes, para não mexer nos dias 1-21).
10. **Todas as medianas são sem únicos**; com únicos há 0 a 6 dias de diferença (seção 4).

### 11. Não feito, ou verificado só em parte

- Nenhum save real de nível 61+ foi carregado no navegador: o mapeamento está no teste `xpCurve.test.ts` (níveis 1 a 99, três pontos de cada nível, o selo novo, o objeto sem selo) e na leitura do código.
- Os números de depois vêm de 6 seeds (4 com únicos), não de 20: a mediana do nível 60 oscila uns 3 dias de uma rodada para outra, os marcos de chefe um pouco mais.
- A tela da Caça mostra o novo teto de 6 h na última zona e o XP por hora; não abri a tela com um save de nível 80.

## Rodada 16 — o excedente do fim de jogo vira melhoria (2026-10-13)

A rodada 15 deixou um aviso: a partir do dia ~60 o jogador joga fora centenas de materiais raros. Esta rodada mede isso (livro-razão novo do `sim:long`), constrói os sumidouros que os números sustentam e mostra, com o mesmo simulador, até onde eles chegam.

### 1. O livro-razão (`npm run sim:long`, `scripts/sim/longHaul.sim.ts`)

A cada 10 dias o relatório imprime: Ouro e Runas que entraram, saíram e ficaram em caixa; e, por material e por motivo, o que foi coletado, vendido ao mercador e jogado fora (**mochila** = a coleta deixou para trás porque a mochila estava cheia; **baú** = jogado fora com os 50 espaços do baú cheios; **mercador** = jogado fora com o orçamento do dia esgotado; **política** = jogado fora com espaço em outro lugar), em unidades, em valor de referência (`economy.ts`) e só nos materiais que não são lixo. Mais: a tabela de uso dos sumidouros novos e o maior trecho sem nada novo contando os níveis de refino.

**Estado de antes (6 seeds, sem únicos, dias 60 a 180):** o jogador sem Passe coleta 338 mil unidades e perde 304 mil (**90% das unidades, 87% do valor**); o dono do Passe coleta 503 mil e perde 476 mil (95%, 92%). **99% da perda é "baú cheio"** (mochila, mercador e política somam menos de 1%): o mercador compra uns 1 500 por 10 dias (orçamento de 30 + 2 por nível de Ouro por dia) e o baú tem 50 espaços. O que mais se perde, em valor: Coração de Sangue (93% do que cai), Tutano Abissal, Cristal Corrompido, Sangue Concentrado, Fragmento de Osso. O Ouro em caixa chega a 60 mil no dia 180 e as Runas a 130, sem uso.

**A causa é escala, não falta de um sumidouro pequeno.** A última zona (Abismo de Sangue, 12 h por dia) entrega em média 750 Ossos, 810 Sangues, 745 Tutanos, 190 Cristais e 157 Corações **por dia**; o conjunto T6 inteiro pede uns 45 Corações. Qualquer sumidouro precisa pedir centenas de unidades por ação, por isso cada custo novo está escrito em **horas de caça da última zona** (`T.lateSinks.hour*`, `gear.farmHours`) e não em números soltos.

### 2. O que foi feito, o que foi rejeitado

| Candidato | Decisão | Motivo (dos números) |
| --- | --- | --- |
| **Refino além do +8 (+9 a +12), só tier 5 e 6** | **feito** | Consome material em todas as 7 peças vestidas e se repete por peça; tabela na seção 3. |
| **Lapidar** (travar um atributo, sortear os outros) | **feito** | Sumidouro repetível: o preço sobe 25% a cada lapidação na mesma peça e pede Runas (as Runas sobram: 130 em caixa). |
| Elevar raridade (3 iguais -> raridade acima) | **rejeitado** | Pede cópias idênticas e cada cópia de uma peça T5 ou T6 arrasta a cadeia inteira (uma peça do tier anterior por forja): o simulador nunca junta cópias, e as chances que cabem na regra de ±20% de Lendárias (abaixo) deixam o sumidouro fraco demais para mexer no livro-razão. |
| Conversão em lote de 10 raros da zona anterior em 1 da seguinte | **rejeitado** | Todos os raros estão em excesso ao mesmo tempo (Coração, Cristal, Núcleo, Chifre): não há para onde converter. |
| Níveis de baú além do máximo | **rejeitado** | O baú enche em 1 a 2 dias (3 000 unidades por dia entrando); 10 espaços a mais adiam a perda, não a transformam em nada. |

**Elevar raridade, a conta que decidiu** (por forja: 63 / 25 / 10 / 2% de comum / rara / épica / lendária; um grupo de 3 que falha perde 2 peças e uma sobrevive; o jogador usa todas as cópias):

| Chances | Épicas a mais por 100 forjas | Oferta de Épicas | Lendárias a mais por 100 forjas | Oferta de Lendárias |
| --- | --- | --- | --- | --- |
| 3 Raras -> Épica 35%, 3 Épicas -> Lendária 15% | 3,72 | +37% | 0,957 | **+48%** (fora de ±20%) |
| 30% e 8% | 3,26 | +33% | 0,510 | +26% (fora) |
| 30% e 6% | 3,26 | +33% | 0,386 | +19% (cabe) |
| 25% e 5% | 2,78 | +28% | 0,312 | +16% |

As chances do exemplo (35% / 15%) dão **+48%** de Lendárias para quem usa todas as cópias; só 30% / 6% cabe nos 20%, e a 6% um grupo de 3 Épicas (30 forjas de peças) para 6% de uma Lendária vale menos do que forjar de novo (30 forjas = 0,6 Lendária). **Oferta de Lendárias por jogador por mês, antes e depois desta rodada: a mesma** (a tabela 63 / 25 / 10 / 2 não foi tocada e nenhum sumidouro cria, troca ou promove raridade; o Lapidar e o refino mantêm a raridade, então `isTradeable` fica como estava).

### 3. Os números exatos (gerados dos mesmos dados que o motor lê; `lateSinks.test.ts` confere cada um)

**Refino além do +8** (peças tier 5 e 6; +6% do atributo base por nível, o +10% dos primeiros 8 níveis não mudou; falhar nunca destrói; o Catalisador só vale até o +8):

| Tentativa | Chance | Falha tira um nível | Ouro | Tier 6: Sangue / Tutano / Cristal / Coração | Tier 5 (0,6x) | Bônus acumulado |
| --- | --- | --- | --- | --- | --- | --- |
| +8 -> +9 | 40% | 0% | 150 | 100 / 90 / 23 / 18 | 60 / 55 / 13 / 11 | +86% |
| +9 -> +10 | 30% | 20% | 200 | 195 / 180 / 45 / 36 | 115 / 110 / 27 / 22 | +92% |
| +10 -> +11 | 22% | 30% | 250 | 295 / 270 / 68 / 54 | 175 / 160 / 40 / 32 | +98% |
| +11 -> +12 | 15% | 40% | 300 | 490 / 450 / 113 / 90 | 295 / 270 / 68 / 54 | +104% |

(Horas de caça por tentativa: 1,5 / 3 / 4,5 / 7,5. O Osso ficou de fora: é lixo que o Pó já absorve e uma exigência de 400 Ossos travava o sumidouro sempre que a mochila acabava de ser limpa.) Esperado a partir do +8, tier 6: +9 em 2,5 tentativas (3,7 h de caça), +10 em 7 (15,5 h), +11 em 16 (48,5 h), **+12 em 44 tentativas (173 h, uns 14 dias de caça de 12 h)**; tier 5, 60% disso.

**Custo dos passos +4 a +8 em peças tier 5 e 6** (mudança que o refino além do +8 pede): o Ouro desses passos passa a **15%** do de antes (`lateRefineGoldShare`: o +6 e o +7 custavam 2 100 e 2 400, agora 315 e 360) e as **2 Runas** dos passos +7 e +8 passam a **0** (`lateRefineShards`). Peças de tier 4 para baixo pagam o que sempre pagaram (teste). Motivo: com 7 peças a uns 25 mil de Ouro cada, o jogador é limitado pelo Ouro (1,5 mil por dia), não pelo material, e o sumidouro nunca começaria; e o simulador longo não tem renda de Runas.

**Lapidar** (peça Épica ou Lendária, tier 4 ou mais, nível 60 ou mais; trava um atributo e sorteia de novo os outros, sem repetir tipo):

| Peça | Horas | Sangue / Tutano / Cristal / Coração | Ouro | Runa |
| --- | --- | --- | --- | --- |
| T4, primeira lapidação | 1 | 65 / 60 / 15 / 12 | 200 | 1 |
| T5, primeira | 2 | 130 / 120 / 30 / 24 | 250 | 1 |
| T6, primeira | 3 | 195 / 180 / 45 / 36 | 300 | 1 |
| T6, depois de 1 | 3,75 | 245 / 225 / 56 / 45 | 300 | 1 |
| T6, depois de 4 | 6 | 390 / 360 / 90 / 72 | 300 | 1 |
| T6, depois de 12 (o preço para de subir) | 12 | 780 / 720 / 180 / 144 | 300 | 1 |

O preço sobe 25% do da primeira a cada lapidação anterior **na mesma peça** (`GearInstance.lapidarCount`, campo novo e opcional); uma cópia nova começa barata. Raridade, melhoria, encaixes, durabilidade, vínculo e as outras cópias não mudam.

**Onde fica:** o refino é a aba "Melhorar" da Forja (já existia: o cartão mostra custo e chance, mais uma nota com as chances e as quedas); o Lapidar é um painel no detalhe da peça no Inventário, logo abaixo da reforja econômica (escolher o atributo que fica, ver o preço exato, lapidar). Nenhuma tela nova. Textos em pt e en gerados de `lateSinks.ts` (mesmo padrão dos perks do Passe), conferidos contra o motor por `lateSinks.test.ts`.

**Conquistas** (`quests.ts`): `ACH_REFINE_9`, `_10` e `_12` (leem `max_refine`, que o simulador vê: **pagam 0**); `ACH_LAPIDAR_1` (300 Ouro, 1 Runa) e `_25` (1 500 Ouro, 4 Runas), que leem o contador novo `stats.lapidations` (aparece na aba de estatísticas).

### 4. Resultado (6 seeds x 180 dias, sem únicos; A = sem Passe, P = dono)

Três colunas por marco: **antes** (rodada 15), **controle** (o jogador novo: refina as 7 peças T5 e T6 até +8 como um humano faria, com os custos novos de Ouro e Runas, mas **sem** os sumidouros: `SIM_T='{"lateSinks":{"deepMinTier":7,"lapidarMinTier":7}}'`) e **depois** (tudo). O jogador antigo nunca passava do +3 em peça de tier 3 para cima (faltava o material do tier: aço, escamas, obsidiana refinada), então o controle separa "o jogador passou a refinar" de "o jogo ganhou sumidouros".

**Cenário A:**

| Marco | Antes (rodada 15) | Controle (jogador refina, sem sumidouros) | Depois | Depois contra antes | Depois contra controle |
| --- | --- | --- | --- | --- | --- |
| nível 60 | 38 | 38 | 38 | +0% | +0% |
| nível 75 | 71 | 71.5 | 73.5 | +4% | +3% |
| nível 90 | 106 | 107.5 | 110 | +4% | +2% |
| nível 100 | 141 | 144.5 | 147.5 | +5% | +2% |
| andar 100 (chegada) | 115 | 82.5 | 75 | -35% | -9% |
| chefe do andar 100 vencido (abre as Profundezas) | 136.5 | 107 | 95 | -30% | -11% |
| conjunto T4 vestido (7 peças) | 39 | 39 | 39 | +0% | +0% |
| conjunto T5 vestido | 83 | 82 | 84 | +1% | +2% |
| conjunto T6 vestido | 142 | 144.5 | 149 | +5% | +3% |
| arma T5 vestida | 59 | 59 | 59 | +0% | +0% |
| arma T6 vestida | 108.5 | 107.5 | 111 | +2% | +3% |
| profundeza 10 | 136.5 | 107 | 95.5 | -30% | -11% |
| profundeza 30 | 141 | 108.5 | 105 | -26% | -3% |
| profundeza 40 | > 180 | 121.5 | 114.5 | - | -6% |
| peça refinada a +9 | - | > 180 | 64 | - | - |
| peça refinada a +10 | - | > 180 | 66.5 | - | - |
| peça refinada a +11 | - | > 180 | 169.5 | - | - |
| peça refinada a +12 | - | > 180 | > 180 | - | - |
| Paragon 1 | 143 | 149 | 151.5 | +6% | +2% |
| Paragon 10 | 164.5 | 169.5 | 172 | +5% | +1% |

**Cenário P:**

| Marco | Antes (rodada 15) | Controle (jogador refina, sem sumidouros) | Depois | Depois contra antes | Depois contra controle |
| --- | --- | --- | --- | --- | --- |
| nível 60 | 24.5 | 24.5 | 24.5 | +0% | +0% |
| nível 75 | 57 | 59.5 | 54.5 | -4% | -8% |
| nível 90 | 87 | 91 | 84 | -3% | -8% |
| nível 100 | 114 | 119 | 114 | +0% | -4% |
| andar 100 (chegada) | 89 | 77 | 59.5 | -33% | -23% |
| chefe do andar 100 vencido (abre as Profundezas) | 100 | 92 | 75 | -25% | -18% |
| conjunto T4 vestido (7 peças) | 28 | 28 | 26.5 | -5% | -5% |
| conjunto T5 vestido | 67.5 | 72 | 70 | +4% | -3% |
| conjunto T6 vestido | 114 | 123.5 | 117 | +3% | -5% |
| arma T5 vestida | 42.5 | 42.5 | 42.5 | +0% | +0% |
| arma T6 vestida | 87 | 91 | 87.5 | +1% | -4% |
| profundeza 10 | 100 | 92.5 | 75 | -25% | -19% |
| profundeza 30 | 103 | 93.5 | 78 | -24% | -17% |
| profundeza 40 | > 180 | 104 | 93.5 | - | -10% |
| peça refinada a +9 | - | > 180 | 48 | - | - |
| peça refinada a +10 | - | > 180 | 48.5 | - | - |
| peça refinada a +11 | - | > 180 | 52.5 | - | - |
| peça refinada a +12 | - | > 180 | > 180 | - | - |
| Paragon 1 | 116 | 122.5 | 116.5 | +0% | -5% |
| Paragon 10 | 131.5 | 137.5 | 131.5 | +0% | -4% |

**Leitura.** Nível e peças vestidas ficam dentro de ±5% do antes (controle e depois diferem em 0 a 3% no A). **Os marcos da Masmorra (andar 100, chefe do 100, profundezas) vêm bem mais cedo, e a maior parte disso NÃO vem dos sumidouros:** só o jogador passar a refinar (controle) já traz o chefe do 100 de 136 para 107 (-22%): a curva da rodada 15 foi medida com um herói que fica em +0 a +3 nas peças tier 5 e 6, e a tabela de CP recomendada e o `sim:depths` já assumem tier 6 +8. Os sumidouros acrescentam 9 a 11% (A) e 18 a 23% (P) aos marcos da Masmorra em cima do controle. Isso passa do limite de ~5% pedido e **não foi retunado** (decisão 2 da seção 6).

**Livro-razão, dias 60 a 180** (mediana entre seeds; "perdido" = mochila + baú + mercador + política):

| | Coletado | Perdido (unid.) | % das unidades | % do valor | % dos escassos |
| --- | --- | --- | --- | --- | --- |
| A, antes | 338 416 | 304 343 | 89,9% | 87,1% | 87,7% |
| A, controle | 330 441 | 285 828 | 86,5% | 82,9% | 85,1% |
| **A, depois** | 326 685 | 218 034 | **66,7%** | **61,0%** | 60,7% |
| P, antes | 503 053 | 476 239 | 94,7% | 91,6% | 93,6% |
| P, controle | 480 768 | 434 708 | 90,4% | 88,0% | 89,4% |
| **P, depois** | 501 380 | 408 196 | 81,4% | 76,5% | 77,4% |

**A meta (perder menos de ~15% do que se coleta) não foi atingida na janela inteira.** Por janela de 10 dias, cenário A (valor de referência perdido):

| Dias | Coletado (unid.) | Perdido antes: unid. / % do valor | Controle: % do valor | Depois: unid. / % do valor |
| --- | --- | --- | --- | --- |
| 1-10 | 3 056 | 365 / 8.5% | 8.5% | 365 / 8.5% |
| 11-20 | 5 756 | 992 / 13% | 13% | 992 / 13% |
| 21-30 | 7 532 | 3 117 / 26.5% | 26.5% | 3 117 / 26.5% |
| 31-40 | 15 075 | 11 760 / 65.6% | 65.6% | 11 432 / 69.4% |
| 41-50 | 9 985 | 8 481 / 93.3% | 93.3% | 8 481 / 83.1% |
| 51-60 | 19 085 | 16 317 / 80.1% | 79.9% | 13 414 / 64.7% |
| 61-70 | 21 533 | 18 384 / 77.5% | 71.7% | 14 577 / 57.1% |
| 71-80 | 25 268 | 22 224 / 83.8% | 80.9% | 16 946 / 63.3% |
| 81-90 | 26 663 | 26 026 / 94.5% | 92.2% | 19 253 / 72.4% |
| 91-100 | 30 102 | 27 024 / 94.2% | 92.9% | 25 484 / 81.5% |
| 101-110 | 29 320 | 23 849 / 80.6% | 77.9% | 25 528 / 84.5% |
| 111-120 | 25 951 | 25 325 / 85.6% | 82.6% | 20 550 / 75.8% |
| 121-130 | 27 449 | 23 754 / 86.1% | 82% | 23 672 / 87.9% |
| 131-140 | 26 917 | 26 407 / 87.1% | 85.4% | 22 831 / 83.2% |
| 141-150 | 26 918 | 28 121 / 86% | 53.6% | 19 702 / 66.7% |
| 151-160 | 26 212 | 27 958 / 90.5% | 89% | 7 449 / 14.1% |
| 161-170 | 30 163 | 28 164 / 92.9% | 91.2% | 4 962 / 5.1% |
| 171-180 | 30 179 | 28 247 / 92.4% | 85.8% | 6 546 / 5.6% |

Quando as peças estão na fase do refino além do +8 o sumidouro absorve quase tudo: **dias 151 a 180, perdido entre 5% e 14%**. O que segura o resto da janela são os dias 100 a 150, em que as peças tier 6 recém-forjadas (+0) ainda sobem de +0 a +8, passo a passo, com Pó, Osso e obsidiana refinada que o simulador descarta ou não tem à mão (tentei guardar Osso e Pó para o refino: o cenário A melhorou uns 5 pontos e o P travou num conjunto, então desfiz). É limitação do simulador, não do sumidouro: o número confiável é o do regime, em que o sumidouro absorve 86 a 95% do que cai.

**Ouro e Runas não inflaram:** o Ouro em caixa no cenário A fica em 12 a 34 mil (31 mil no dia 180) em vez dos 60 mil de antes, porque o jogador passou a gastá-lo refinando; as Runas em caixa vão a 150 em vez de 130 (o refino fundo não pede Runas; o Lapidar pede 1 por vez e quase não é usado).

**Uso dos sumidouros (A):** refino além do +8: 15, 14, 14 e 9 tentativas por 10 dias nos dias 61 a 100, 0 a 4 nos dias 101 a 150, 28 e 42 nos dias 151 a 170; o jogador chega a +9 no dia 64, +10 no 66,5, +11 no 169,5 e +12 em nenhuma seed mediana (a mais rápida: dia 176). **Lapidar: 0 a 4 lapidações por 10 dias** (só entra quem tem peça Épica ou Lendária vestida, uns 12% das peças): é sumidouro de quem caça a peça perfeita, não de volume.

**Maior trecho sem nada novo** (peça de tier novo, zona, chefe, profundeza múltipla de 5, ponto de habilidade, perk de maestria, **mais** cada nível de refino além do +8 novo nas peças vestidas), dia 21 a 180, mediana / pior seed:

| | Antes | Controle | Depois |
| --- | --- | --- | --- |
| A, sem Paragon | 28 / 36 dias | 28 / 35 | **15 / 20** (sem contar o refino: 18 / 34) |
| A, depois do nível 100 e do T6, sem Paragon | 36 (pior) | 28 / 35 | **15 / 20** |
| P, sem Paragon | 52 / 75 | 32 / 48 | 32 / 77 (sem contar o refino: 37 / 77) |
| P, depois do nível 100 e do T6, sem Paragon | 75 (pior) | 32 / 48 | 29 / 36 |
| Contando o Paragon | A 12 / 14, P 9 / 10 | A 12 / 15, P 10 / 13 | **A 3 / 3, P 3 / 3** |

Meta (algo novo a cada ~10 dias depois do nível 100 e do T6): **não atingida sem o Paragon** (A: 15 / 20; P: 29 / 36, contra 75 de antes). Com o Paragon contado o maior buraco é de 3 dias.

### 5. Tabela de guarda dos dias 1 a 21 (cenário A, 20 seeds, mediana), antes -> depois

U = com únicos (padrão), N = `SIM_NO_UNIQUES=1`. Os sumidouros e a política nova só existem a partir do nível 60 e de peças tier 5 (que pedem nível 70): nada do que o jogador simulado faz nos dias 1 a 21 mudou.

| Meta | Antes U / N | Depois U / N |
| --- | --- | --- |
| T2 primeira sessão >= andar 8; checkpoint 10 no dia 1 | 8 / 8 | 8 / 8 |
| T3 primeira peça forjada (dia <= 2) | 2 / 2 | 2 / 2 |
| T4 nível dia 1 / 3 / 14 (10-16 / 20-29 / 45-60) | 13 / 27 / 47 · 13 / 27 / 47 | 13 / 27 / 47 · 13 / 27 / 47 |
| T5 chefe 25 pela 1ª vez (dia 4-6); vitória ao chegar | dia 5, 0% · dia 5, 0% | dia 5, 0% · dia 5, 0% |
| T6 chegada ao andar 50: 1ª seed / mediana (meta 12-15) | 12 / 15 · 12 / 14,5 | 12 / 15 · 12 / 14,5 |
| T6 chefe 50: 1ª seed / mediana / seeds em 21 dias | 13 / 15 / 20 · 13 / 15 / 20 | 13 / 15 / 20 · 13 / 15 / 20 |
| T7 menor razão (N+1)/(N-1) em volta dos chefes | 1,08 | 1,08 |
| T8 derrota mantém 75% do ouro | 75% | 75% |
| nível no dia 21 | 51 (49-53) · 51 (49-53) | 51 (49-53) · 51 (49-53) |
| andar mais alto no dia 21 (mediana) | 60 · 62 | 60 · 62 |

(Medido com `npm run sim` e `SIM_NO_UNIQUES=1 npm run sim` no código final desta rodada; "antes" é a tabela da rodada 15.)

### 6. Decisões que o diretor pode discordar

1. **O controle.** Medi também o jogador novo sem sumidouros, porque o de antes nunca refinava peças T3+ (faltava o material do tier) e mudar isso já adianta o chefe do 100 em 22%. "Depois contra antes" mistura as duas coisas; use "depois contra controle".
2. **Marcos da Masmorra 9 a 23% mais cedo que o controle e 25 a 35% mais cedo que a rodada 15.** O refino fundo dá até +24% do atributo base por peça. Não retunei os andares 76 a 100 (`lateHpGrowth2` e `lateDmgGrowth2`): o herói de referência do `sim:depths` (tier 6 +8) não mudou e a tabela de CP recomendada continua valendo. O botão, se quiser o chefe do 100 de volta perto do dia 130, é esse par; peço decisão antes de mexer, porque endurece a Masmorra para quem não refina.
3. **Ouro dos passos +4 a +8 em tier 5 e 6 a 15% e sem Runas** (`lateRefineGoldShare`, `lateRefineShards`). Sem isso o refino fundo não começa dentro de 180 dias. Desfazer é trocar os dois números, mas aí o sumidouro some do jogo.
4. **O Catalisador só vale até o +8.** O Passe dá 3; garantir o sucesso do +9 ao +12 anularia as chances, que são o ponto do sumidouro.
5. **Elevar raridade, conversão em lote e baú maior: não feitos** (seção 2). Se quiser o Elevar mesmo assim, o teto é 30% / 6% (+19% de Lendárias com uso total) e só faz diferença para quem junta cópias de propósito.
6. **Custos em horas de caça da última zona.** Um +12 de tier 6 pede 490 Sangues, 450 Tutanos, 113 Cristais e 90 Corações numa tentativa: parece muito e é uma tarde de caça de 12 h. Quem caça 4 h por dia vai demorar o triplo; o jogo não pune quem fica para trás, só não o recompensa.

### 7. Não feito, ou verificado só em parte

- **A meta de 15% não foi atingida** (61% do valor na janela dos dias 60 a 180; 5 a 14% nos dias 151 a 180). O simulador desperdiça os insumos do refino de +0 a +8 nos dias 100 a 150 e não modela as Runas das metas semanais.
- **O dono do Passe** perde 76,5%: coleta 53% mais (16 h de caça por dia) e o sumidouro absorve 93 mil unidades contra 108 mil do jogador comum.
- 6 seeds; as medianas de marcos oscilam uns 3 dias entre rodadas.
- Nenhum save real de nível 100 foi aberto: usei um save montado (herói de nível 100, peças T6 +8 a +10, uma Épica com Lapidar, uma Lendária de reserva) no navegador, em 1280 e 390 de largura (Forja, aba Melhorar; Inventário, painel Lapidar).
- O Lapidar e o refino fundo não entram na tabela de CP recomendada nem no `sim:depths` (o herói de referência continua em +8).

## Rodada 17 — as zonas tardias dropam o que o fim de jogo usa, e os andares 76 a 100 acompanham o herói (2026-10-13)

Dois problemas que a rodada 16 deixou: (1) do dia 60 ao 180 o jogador ainda perdia 58% (comum) / 78% (dono do Passe) do valor que coleta, quase tudo por "baú cheio", porque a última zona entrega ~3 000 unidades por dia e um conjunto T6 inteiro pede ~45 Corações; (2) com o jogador refinando de verdade a Masmorra correu na frente de tudo (andar 100 no dia 77, chefe no 95, com o nível 100 no 146 e o conjunto T6 no 147). Medido com `npm run sim:long`, **12 seeds**, sem únicos, comum (A) e dono (P). "Antes" = o código da rodada 16 rodado de novo com as mesmas 12 seeds (as medianas de 6 seeds da rodada 16 oscilam uns 3 dias: o nível 60 era 38 com 6 seeds e é 42,5 com 12).

### 1. Os cortes (zonas 3 e 4; as zonas 1 e 2 não mudaram)

| Zona | Material (raridade) | Chance por rolagem antes -> depois | Unidades por hora de caça (modelo estático, Profundo, subnível 10) | Por dia, média dos dias 100-180 (A) |
| --- | --- | --- | --- | --- |
| Abismo | Fragmento de Osso (comum) | 0,35 -> **0,12** | 44,1 -> 15,1 | 730 -> 277 |
| Abismo | Sangue Concentrado (incomum) | 0,12 -> **0,036** | 47,7 -> 14,3 | 789 -> 264 |
| Abismo | Cristal Corrompido (raro) | 0,021 -> **0,0053** | 11,0 -> 2,8 | 182 -> 50 |
| Abismo | Tutano Abissal (incomum) | 0,11 -> **0,0132** | 43,7 -> 5,2 | 727 -> 84 |
| Abismo | Coração de Sangue (raro) | 0,0175 -> **0,0021** | 9,2 -> 1,1 | 152 -> 18 |
| Fenda | Estilhaço da Fenda (incomum) | 0,1 -> **0,025** | 39,7 -> 9,9 | 40 -> 9 |
| Fenda | Chifre do Demônio (raro) | 0,014 -> **0,0017** | 7,3 -> 0,9 | 7 -> 1 |
| Fenda | Retalho de Couro, Garra, Núcleo | 0,32 / 0,105 / 0,0175 (**iguais**) | 40,3 / 41,7 / 9,2 | 41 / 42 / 9 |

Os cortes são x0,34 (osso), x0,30 (sangue), x0,25 (cristal), x0,12 (tutano, coração), x0,25 (estilhaço) e x0,12 (chifre): **o raro é cortado pelo menos tanto quanto o comum da mesma zona**, e "o raro é mais difícil que o incomum" vale por rolagem (`round17.test.ts`, no raso subnível 1 e no profundo subnível 10). O texto do Códice não mudou: ele diz a raridade do drop, não a faixa de chance.

**Por que não cortei tudo igual** (6 seeds, A; "perda" = % do valor de referência jogado fora nos dias 60-180):

| Variante | Perda A | Perda P | O que aconteceu |
| --- | --- | --- | --- |
| Rodada 16 | 61% | 76% | - |
| V1: tudo x0,25-0,35, inclusive Couro / Garra / Núcleo da Fenda (abaixo da Clareira) | 19% | - | **nível 60 no dia 45 em vez de 38**: o jogador volta à Clareira atrás de Garra e Núcleo (caça-se onde o material cai mais, na regra do simulador e na de uma pessoa), e a Clareira paga 1 750 de XP/h contra 6 000 da Fenda |
| V2: estilhaço / tutano / chifre / coração x0,25, comuns no piso das zonas 1-2 | 44% | - | os insumos baratos (osso, sangue) entopem o baú |
| V3: o mesmo com x0,12 | 37% | - | idem |
| V7 / V8 / V9: Abismo x0,5 / 0,4 / 0,4 e raros x0,3 / 0,2 / 0,15 | 44% / 39% / 31% | 33% / 19% / 12% | só cortar osso, sangue e cristal **junto com** os raros chega perto |
| V6: osso 0,35, sangue 0,3, cristal 0,25, raros 0,12 (o final menos o ajuste do Estilhaço e dos pedidos) | 13% | 14% | - |

O que explica os números: (a) **como todo custo está escrito em horas de caça, cortar a oferta por um fator corta junto o que se consome**; o que baixa a perda é o baú de 99 por vaga passar a guardar 3 a 8 vezes mais horas, não a conta; (b) a Fenda contribui com 6 mil unidades em 120 dias contra 330 mil, por isso Couro / Garra / Núcleo ficam como estão (e o Estilhaço subiu de 0,012 para 0,025 porque o Núcleo, raro, ficava mais fácil que ele por rolagem); (c) tentei um jogador que esvazia o baú do empilhado mais barato para guardar o caro: **piorou** (perda 84%, chefe do 100 no dia 130), porque o baú é o estoque de trabalho das receitas, e desfiz.

### 2. Custos re-resolvidos para as mesmas horas

Modelo: `scripts/sim/farmHours.ts` (`npm run sim:cost`), a unidade do `setCost.ts` (quantidade / taxa por hora no estágio em que o tier é caçado; dentro de uma zona vale o material mais demorado). Os números de antes são os da rodada 16 no mesmo modelo; `round17.test.ts` guarda +-10%.

| Custo em horas de caça | Antes | Depois |
| --- | --- | --- |
| Conjunto T5 (peças próprias de cada tier, até o 5) | 63,6 h | 63,8 h |
| Conjunto T6 | 73,4 h | 73,8 h |
| T5, +0 -> +8 (tentativas esperadas) | 9,8 h | 9,5 h |
| T6, +0 -> +8 | 9,0 h | 8,8 h |
| T5, +8 -> +12 (esperado, com quedas) | 143,0 h | 146,4 h |
| T6, +8 -> +12 | 238,1 h | 239,2 h |
| T6, uma tentativa de +8 -> +9 | 5,2 h | 5,4 h |
| Uma lapidação T6: a primeira / depois de 4 / depois de 12 | 4,12 / 8,24 / 16,47 h | 4,19 / 8,28 / 16,40 h |
| Uma lapidação T5, a primeira | 2,75 h | 2,88 h |

(O modelo estático dá 238 h ao +12 do T6 onde a rodada 16 contava 173 h: as horas de lá eram as "horas reais" do simulador, 1,36x as do modelo; `hourBlood` etc. continuam nessa unidade, ver `round17.test.ts`.)

- **Receitas T5 e T6** (`gear.ts`): para cada tier e material o total do conjunto virou o total antigo x o corte, repartido pelas 7 peças por maior resto (o machado copia a espada). Totais T5 antes -> depois: osso 305 -> 105, sangue 360 -> 108, cristal 108 -> 27, tutano 630 -> 76, coração 150 -> 18, estilhaço 585 -> 146, chifre 122 -> 15; T6: osso 180 -> 62, sangue 220 -> 66, cristal 54 -> 14, tutano 200 -> 24, coração 43 -> 5, estilhaço 160 -> 40, chifre 34 -> 4. Cada peça de T6 pede 0 a 1 Coração (a arma e a armadura 1). Couro, Garra e Núcleo: iguais.
- **Refino +4 a +8** (tiers 5 e 6): T5 pede 10 ossos nas tentativas até +6 e 15 ossos + 2 estilhaços no +7 e no +8 (era 25 / 40 + 15 estilhaços + 3 chifres); T6 pede 10 ossos até +6 e 16 ossos + 2 tutanos no +7 e +8, **mais 1 coração só no +8** (era 30 / 48 + 18 tutanos + 3 corações). O chifre saiu do refino T5: um chifre por tentativa custava 1,1 h onde o antigo custava 0,4 h.
- **Hora-de-fazenda dos sumidouros** (`T.lateSinks.hour*`): sangue 65 -> 19,5, tutano 60 -> 7,2, cristal 15 -> 3,79, coração 12 -> 1,44 (o arredondamento passou de múltiplos de 5 para unidades). O +12 do T6 pede 147 / 54 / 27 / 11 e a primeira lapidação T6 59 / 22 / 11 / 4 (sangue / tutano / cristal / coração; era 490 / 450 / 113 / 90 e 195 / 180 / 45 / 36).
- **Baú** (melhorias 6 a 8, as que pedem osso e sangue): osso 60 / 80 / 100 -> 21 / 27 / 34, sangue 30 / 50 / 70 -> 9 / 15 / 21. As cinco primeiras ficam como eram.
- **Pedidos** (`deliveries.ts`, `T.deliveries.abyssCargo*`): na última faixa (andar 76+) um Osso / Sangue / Cristal conta 6 / 7 / 8 vezes o valor de referência no dimensionamento da carga. O corte exato (2,9 / 3,3 / 4) secou os pedidos (o simulador só aceita um pedido do que a próxima forja não precisa): Ouro -15%, 3 a 4 de 12 seeds sem o conjunto T6; com 6 / 7 / 8 o Ouro dos dias 100-180 ficou +13% (137 mil contra 121 mil). Os valores de referência de Osso, Sangue, Cristal, Couro, Garra e Núcleo **não mudam** (os pedidos de antes do andar 76 são dimensionados neles).
- **Valores de referência** (`economy.ts`): Estilhaço 6,5 -> 30, Chifre 34 -> 256,5, Tutano 7 -> 110, Coração 36 -> 451. O preço do mercador sobe junto (1 / 5 / 1 / 5 -> 4 / 38 / 16 / 67 por unidade), de modo que uma hora de cada zona vale ao mercador o que valia.

**Ouro por hora de caça nas zonas 3 e 4** (`sim:cost`, subnível 10; contínuo = Ouro da zona + 15% do valor de referência, a âncora dos pedidos; real = o que o mercador paga com os pisos): Fenda 158,8 -> 161,6 (real 194,0 -> 191,1), Abismo 193,3 -> 203,8 (real 226,4 -> 214,0, com o coração a 490; com 451, +2% e -8%). Âncora dos pedidos (`round14.test.ts`, subnível 5): razão pedido / caça nos níveis 50 / 75 / 100 = 0,999 / 1,008 / 1,001 -> 1,084 / 0,900 / 0,919 com o coração a 490 (dentro de 0,8-1,2; o valor de caça por hora subiu 12% no nível 75 e 9% no 100; o coração foi para 451 depois dessa medida, sem repetir).

### 3. O livro-razão (dias 60-180, mediana de 12 seeds, sem únicos)

| | Coletado | Perdido | % das unidades | % do valor | % dos escassos |
| --- | --- | --- | --- | --- | --- |
| A, antes | 328 974 | 212 044 | 64,5% | **57,9%** | 57,8% |
| **A, depois** | 101 950 | 50 891 | 49,9% | **25,8%** | 38,5% |
| P, antes | 495 350 | 408 196 | 82,4% | **77,7%** | 78,5% |
| **P, depois** | 146 287 | 64 635 | 44,2% | **17,3%** | 24,7% |

A meta era menos de ~25% (A) e ~35% (P): o comum ficou em 25,8% (23,2% antes do ajuste do coração de 490 para 451; 20,9% antes dos andares 76-100 mais duros), o dono em 17,3%. Por janela de 10 dias (A, % do valor): 61-70 52,8 -> 5,7; 81-90 74,3 -> 5,1; 101-110 78,3 -> 29,1; 121-130 88,4 -> 42,2; 141-150 64,8 -> 25,1; 151-160 7,1 -> 1,9. O resto da perda está nos dias 100 a 140, quando as peças T6 recém-forjadas ainda sobem de +0 a +8 (a mesma limitação do simulador da rodada 16).

### 4. Masmorra, andares 76 a 100 (`lateHpGrowth2` 0,07 -> **0,125**, `lateDmgGrowth2` 0,041 -> **0,078**, chefe do 100 x1,2 -> **x1,17**)

Marcos (dias, mediana de 12 seeds; "nunca" = não chega em 180 dias):

| Marco | A antes | A depois | P antes | P depois |
| --- | --- | --- | --- | --- |
| nível 60 / 75 / 90 / 100 | 42,5 / 70,5 / 108,5 / 146 | 43 / 69,5 / 105,5 / **145** | 25 / 52 / 83,5 / 116 | 25,5 / 50,5 / 77 / **105** |
| chefe do andar 75 | 34,5 | 34 | 30,5 | 21 |
| **andar 100 (chegada)** | 77,5 | **123,5** | 59,5 | **86** |
| **chefe do andar 100** | 95 | **143** | 75 | **102,5** |
| profundeza 10 | 95,5 | 143 | 75 | 102,5 |
| conjunto T4 / T5 / T6 | 33 / 83 / 147 | 32 / 87 / 149 (3 seeds sem T6) | 22,5 / 65,5 / 117 | 21 / 58,5 / 110 |
| peça +9 / +12 | 62,5 / nunca (3 de 12 chegam) | 62 / 79,5 | 45,5 / nunca (5 de 12 chegam) | 42 / 62 |
| Paragon 1 | 150 | 149,5 | 118,5 | 107 |

O dono chega ao andar 100 30% e ao chefe 28% antes do comum (era 23% e 21%). A janela pedida foi atendida: chefe 75 no dia 34 (35-55: um dia abaixo, os andares 1-75 não mudaram), chegada no 123,5 (105-125), chefe no 143 (120-150), dono 28-30% antes. **A profundeza 10 cai no mesmo dia do chefe**: a profundeza 1 vale 0,31 do monstro do andar 99, uma fração do chefe, e o herói que acabou de vencê-lo as limpa no mesmo dia (era assim, 95 e 95,5). Deixar a 10 "um pouco depois" pediria uma profundeza 1 tão dura quanto o chefe, o que tira o herói de nível 100 em T6 +8 da profundeza 20-25.

**O comum fica em +-3% nos níveis 60 / 75 / 90 / 100 e em +-5% nos conjuntos T4 / T5 / T6; o dono, não**: nível 90 -8%, nível 100 -9%, T5 -11%, T6 -6%. O que mudou nele, medido: horas na Fenda nos dias 21-100, 196 -> 108, e no Abismo 748 -> 872 (XP 13 000/h contra 6 000): o dono ficava 88 horas a mais na Fenda atrás de estilhaço e chifre que o excesso de drop e de mochila cheia fazia faltar. O comum quase não visita a Fenda (90 -> 78 horas) e não se move.

**Tabela de CP recomendada** (`npm run sim:cp`, regerada): andar 76 3 960 -> 4 270, 85 6 349 -> 7 587, 90 (checkpoint) 9 003 -> 11 709, 95 8 745 -> 11 853, 99 9 875 -> **13 727**, 100 12 394 -> **16 895**. A escada ganhou as construções de tier 5 e 6 com +10 e +12 (nível 60+); o topo dela (nível 100, T6 +12 comum, sem habilidades) tem 7 569 de CP e limpa até o andar 86; os andares 87-100 são o valor da lei de potência. **O que ela assume**: um herói que não bebe tônico nem poção e começa o andar com PV cheio (o jogador simulado bebe os dois e limpa os andares finais com cerca de um quinto a menos de CP). Verificado em `round17.test.ts` e à mão com heróis de nível 100 em T6 inteiro: comum T6 +8 (CP 8 919) limpa até o 88 (tabela 8 807); comum +12, Paragon 50 (12 290) até o 96 (12 315); épico +8 (11 614) até o 94 (11 402); épico +12, Paragon 50 (15 729) até o 99 (13 727) e **não** o 100; lendário +12, Paragon 30 (17 959) limpa o 100 (16 895).

### 5. Profundezas (`T.depths`: base 0,51 -> **0,31 / 0,32**, crescimento 2,8% / 2,2% -> **3,3% / 2,6%**)

O monstro do andar 99 ficou 1,5x mais forte; a base caiu para o mesmo inimigo da profundeza 0 de antes. O crescimento subiu porque o refino +9..+12 (medido: lendário +12 no Paragon 30 chegava à profundeza 54 com a curva velha) empurrava o topo para perto de um herói lendário no Paragon 30. `npm run sim:depths` (nível 100, T6 inteiro da mesma raridade, build Guerreiro, sem poções); "+10 / +12" só existem agora:

| Herói | Rodada 15/16 (+8) | Agora (+8) | Agora +10 | Agora +12 |
| --- | --- | --- | --- | --- |
| comum, Paragon 0 / 10 / 20 / 30 / 40 / 50 | 20 / 23 / 26 / 27 / 27 / 30 | **21** / 23 / 26 / 28 / 28 / 29 | - | 29 / 32 / - / 35 / - / 40 (Paragon 0 / 10 / 30 / 50) |
| épico, Paragon 0 / 20 / 50 | 35 / 37 / 45 | 34 / 36 / 42 | - | - |
| lendário, Paragon 0 / 10 / 20 / 30 / 40 / 50 | 43 / 43 / 46 / 49 / 51 / 51 | 41 / 41 / 43 / 45 / 48 / 48 | 43 / 43 / - / 47 / - / 50 | 45 / 45 / - / 49 / 51 / **52** |

Alvos: herói de nível 100 em T6 +8 chega à profundeza 21 (20-25); cada 10 níveis de Paragon valem +2 a +3 (o alvo era +3 a +5: a primeira faixa dá +2; um crescimento menor devolve o +3, mas também devolve o topo à profundeza 50 para o lendário com Paragon 30); a profundeza 50 pede lendário com +10 e Paragon 50, ou +12 e Paragon 40 ou mais. `round14.test.ts` passou a pedir +2 a +5 por faixa e a medir o +12.

### 6. Tabela de guarda dos dias 1 a 21 (cenário A, 20 seeds, mediana), antes -> depois

U = com únicos, N = `SIM_NO_UNIQUES=1`. Nada dos dias 1-21 muda: a Fenda abre no andar 51 (dia ~15), o Abismo no 76; os cortes só mexem no que cai a partir daí, e os andares 76-100 só existem depois do dia 21 (o andar mais alto de qualquer seed no dia 21 é 75).

| Meta | Antes U / N | Depois U / N |
| --- | --- | --- |
| T2 primeira sessão >= andar 8; checkpoint 10 no dia 1 | 8 / 8 | 8 / 8 |
| T3 primeira peça forjada (dia <= 2) | 2 / 2 | 2 / 2 |
| T4 nível dia 1 / 3 / 14 | 13 / 27 / 47 | 13 / 27 / 47 |
| T5 chefe 25 pela 1ª vez; vitória ao chegar | dia 5, 0% | dia 5, 0% |
| T6 chegada ao andar 50: 1ª seed / mediana | 12 / 15 · 12 / 14,5 | 12 / 15 · 12 / 14,5 |
| T7 menor razão (N+1)/(N-1) | 1,08 | 1,08 |
| T8 derrota mantém 75% do ouro | 75% | 75% |
| nível no dia 21 | 51 (49-53) | 51 (49-53) |
| andar mais alto no dia 21 | 60 · 62 | 60 · 63 |

### 7. Trechos sem desbloqueio depois do nível 100 e do conjunto T6 (dias, mediana / pior seed)

Sem contar o Paragon: A 13 / 20 -> **27 / 32** (9 de 12 seeds chegam lá); P 31 / 58 -> **30 / 65**. Contando o Paragon: 2 / 3 -> 2 / 4 (A) e 2 / 3 -> 2 / 5 (P). **Não atinge o alvo de ~12 dias sem Paragon** (também não atingia): depois do T6 o jogo vive do Paragon e das profundezas. O A piorou porque o refino +9..+12 acontece mais cedo (peça +12 no dia 79,5; antes nunca): sobra menos para depois.

### 8. Decisões que o diretor pode discordar

1. **Couro, Garra e Núcleo da Fenda ficaram como estavam, e Osso / Sangue / Cristal do Abismo foram abaixo do piso da zona 2** (a chance por rolagem do Abismo é agora menor que a do Pântano para os três). O jogador volta à zona 2 só quando falta Sangue ou Cristal (3 a 15 horas por 10 dias no cenário A), que paga 2 900 de XP/h.
2. **Pedidos de última faixa a 6 / 7 / 8 vezes o valor** e não a 2,9 / 3,3 / 4 (o corte exato): sem isso o comum perdia 15% do Ouro e 3 a 4 de 12 seeds não fechavam o T6. O preço é que um pedido da última faixa custa a metade das horas de antes.
3. **Chifre fora do refino T5; coração só no +8 do T6.** Um chifre por tentativa custava 1,1 h (antes 0,4 h).
4. **Valores de referência 4 a 15x maiores** (Estilhaço, Chifre, Tutano, Coração) para a hora de cada zona valer o mesmo ao mercador. O Coração vende a 67 Ouro.
5. **Tutano e Coração a 0,12 do que eram**: um Coração a cada ~55 minutos de caça (era a cada 6,5). Cada peça de T6 pede 0 a 1.
6. **Dono 6 a 11% mais rápido** nos marcos de nível e de peças (seção 4); nenhum número foi mexido para trazê-lo de volta.
7. **A profundeza 10 cai no mesmo dia do chefe do 100** (seção 4).
8. **O refino +12 chega no dia 79,5 (comum) e 62 (dono)** contra "nunca" antes: o sumidouro do fim de jogo agora é um objetivo do dia 60 ao 100 e não de todo o jogo; a alternativa é mexer em `deepChance*` ou nos preços do +9..+12, o que muda as horas desta rodada.

### 9. Não feito, ou verificado só em parte

- **3 de 12 seeds do comum (6, 10, 11) não fecham o T6 em 180 dias** (antes 0 de 12): ficam sem Ouro e sem pedidos por 60+ dias (o simulador só aceita um pedido do que a próxima forja não precisa e, sem Ouro, essa forja nunca acontece). É um impasse do jogador simulado, mas é novo.
- O ajuste do Coração (490 -> 451) veio depois das 12 seeds; não repeti a rodada (o efeito é de ~3% no valor do Coração).
- A perda do comum ficou em 25,8%, 0,8 ponto acima do alvo.
- 12 seeds; as medianas oscilam uns 3 dias, as da chegada ao andar 100 e do chefe até 15 (uma seed presa muda o valor).
- Nenhum save real foi aberto no navegador; a tela da Caça lê os mesmos dados (testes de locale e de `huntEstimate` verdes).

## Rodada 18 — o Mercador Atacadista e a Bolsa de Ouro (2026-10-13)

Dois pedidos do dono: (1) um mercador que, a partir de certo ponto do jogo, compra o excesso por quase nada, para quando o espaço acaba, **sem nunca vender sozinho**; (2) a Bolsa de Ouro, que vira um item vendável a outros jogadores (só o lado local; o mercado de jogadores precisa de servidor). Medido com `npm run sim:long`, **12 seeds**, sem únicos, comum (A) e dono (P), contra o livro-razão da rodada 17 (mesmas 12 seeds).

### 1. Mercador Atacadista (`src/game/wholesale.ts`, `T.wholesale`)

Fica na loja (terceira aba, entre Vender e Bolsas), mostrada trancada com o requisito até vencer o **chefe do andar 75**. Compra **só material, só da mochila** (nunca do Baú, nunca equipamento), **sem orçamento diário de Ouro**. O preço é **25% do preço unitário do mercador comum** e cai com cada unidade do **mesmo material** vendida no mesmo dia local:

| unidade número (no dia) | 1-100 | 101-150 | 151-200 | 201-250 | 251 em diante |
| --- | --- | --- | --- | --- | --- |
| parte do preço do atacado | 100% | 80% | 60% | 40% | 32% |
| parte do preço do mercador comum | 25% | 20% | 15% | 10% | **8% (piso)** |

Parâmetros: `priceRate` 0,25, `freeUnits` 100, `blockUnits` 50, `blockDrop` 0,20, `floorRate` 0,08. O preço é fracionário (um material comum vale 1 Ouro ao mercador, ¼ de Ouro ao atacadista) e a venda paga a soma, arredondada para baixo uma vez; uma venda que pagaria menos de 1 Ouro é recusada (nada é destruído). Exemplos (`npm run sim:wholesale`; entre parênteses, % do que o mercador comum pagaria pelas mesmas unidades):

| Material (preço normal) | 100 unidades | 500 | 2 000 |
| --- | --- | --- | --- |
| Fragmento de Osso (1) | 25 (25%) | 67 (13,4%) | 187 (9,3%) |
| Tutano Abissal (16) | 400 (25%) | 1 080 (13,5%) | 3 000 (9,4%) |
| Coração de Sangue (67) | 1 675 (25%) | 4 522 (13,5%) | 12 562 (9,4%) |

Despejar milhares de um material só paga perto do piso. A venda é **sempre manual**: por pilha, com 1 / 10 / tudo / outra quantidade (vender a pilha inteira pede um segundo toque), ou várias pilhas marcadas e "Vender selecionados", com uma confirmação que lista o que sai e o total. **Material acima de comum** (raridade da queda; minério e madeira pelo tier; o resto pelo valor de referência) pede uma **segunda confirmação**: "Outros jogadores pagariam mais por isto no mercado, quando ele abrir." Não existe venda automática nem "vender todo o lixo" sem a lista: `wholesale.test.ts` varre o código e exige que só `wholesale.ts` e o botão do `App.tsx` chamem a venda.

Onde mais aparece: o aviso de mochila cheia (Caça em andamento, escolha de zona, tela de recompensa, coleta de minério e lenha), o Baú cheio (detalhe do material) e o resumo "bem-vindo de volta" (quando a caça encheu o armazenamento, ou a mochila ou o Baú estão cheios) ganham um botão "Atacadista" que **só abre a aba**. O Códice mostra os dois preços (mercador e atacado). As estatísticas contam unidades e Ouro vendidos ao atacadista, e há duas conquistas (1 000 unidades vendidas; 25 000 Ouro recebidos): leem as estatísticas, que o simulador de 21 dias não passa, então podem pagar (a regra e o teste de `achievements.test.ts` seguem valendo).

### 2. A conta da renda (por que 25% e por que essa curva)

O que o jogador do fim de jogo coleta por dia na última zona (rodada 17, dias 100-180, A) e quanto perde: Osso 277 (72,1%), Sangue 264 (40,9%), Cristal 50 (22,9%), Tutano 84 (30,1%), Coração 18 (14,1%). Vender **só o excesso** desses ao atacadista, com a curva acima, paga por dia: Osso 42, Sangue 26, Cristal 8, Tutano 100, Coração 50 = **226 Ouro**. A renda de Ouro diária do mesmo jogador (caça 12 Ouro/h por 18 h, pedidos ~1,7 mil por dia, orçamento do mercador comum 230 no nível 100) é de ~2,2 mil: **+10%**. Vender **tudo** o que se coleta na zona (um limite superior: o jogador precisa da maior parte) pagaria 771 por dia, +35%, e é por isso que o preço é 25% e não mais: o que segura a renda é o preço; a curva só impede o despejo de um material só (o Coração vale muito, mas tem poucas unidades por dia, e uma curva por unidade quase não o toca; um teto em Ouro por dia seria o instrumento certo, mas o dono pediu "sem orçamento").

**Medido no simulador longo** (o jogador vende ao atacadista **só o que ia jogar fora**, a partir do dia 22; Ouro do atacadista dividido pelo Ouro que entrou na janela de 10 dias):

| Janela | A: atacadista / entrou | P: atacadista / entrou |
| --- | --- | --- |
| 21-30 | 500 / 7 950 = 6,3% | 3 203 / 16 303 = 19,6% |
| 31-40 | 588 / 17 023 = 3,5% | 4 385 / 18 636 = **23,5%** |
| 61-70 | 597 / 20 858 = 2,9% | 622 / 18 575 = 3,3% |
| 91-100 | 1 152 / 7 765 = 14,8% | 1 282 / 38 840 = 3,3% |
| 101-110 | 2 058 / 11 753 = 17,5% | 785 / 32 852 = 2,4% |
| 121-130 | 3 593 / 18 772 = **19,1%** | 312 / 26 838 = 1,2% |
| 151-160 | 172 / 25 204 = 0,7% | 369 / 6 465 = 5,7% |
| dias 21-180, total (A) | 16 885 / 241 463 = **7,0%** | - |

No fim de jogo (dias 60-180) o comum ganha no máximo **19,1%** a mais em uma janela de 10 dias (12,1% na média dos dias 91-150), dentro do pedido de 15-20%. **O dono do Passe passa disso nos dias 21-40 (19,6% e 23,5%)**, quando a renda dele ainda é pequena e o excesso é grande (perdia 48% do que coletava nos dias 11-20); depois do dia 60 não passa de 6%. Não mexi no preço por isso (ver decisões).

### 3. Livro-razão dos dias 60-180 (12 seeds, sem únicos): o que sobrou

| | Coletado | Perdido | % das unidades | % do valor | Vendido ao atacadista (unidades) |
| --- | --- | --- | --- | --- | --- |
| A, antes (rodada 17) | 101 950 | 50 891 | 49,9% | 25,8% | - |
| **A, depois** | 100 381 | 190 | **0,2%** | **0%** | 45 615 |
| P, antes | 146 287 | 64 635 | 44,2% | 17,3% | - |
| **P, depois** | 146 626 | 72 | **0%** | **0%** | 56 117 |

"Perdido" deixou de existir **no livro-razão** porque o jogador simulado manda ao atacadista tudo o que ia jogar fora; **o valor recuperado não é o valor de referência**: pelas 45 615 unidades (674 mil de valor de referência) o atacadista pagou ~14,4 mil de Ouro (2,1% do valor de referência), então a perda **em valor real** continua alta, só que agora paga uns trocados e libera espaço. Nos dias 1-20 (antes de o atacadista abrir) o livro-razão é o de antes: 8,3% e 15,8% do valor perdido (A) e 17,1% e 22,5% (P).

**Ouro em caixa no dia 180:** A 35 116 (31 mil na rodada 16), P 78 795; o atacadista não inflou o Ouro (7% de tudo o que entrou).

### 4. Efeito colateral medido: o jogador ficou menos preso por Ouro

Mediana de 12 seeds, antes (rodada 17) -> depois: A nível 100 145 -> 142,5; **andar 100 (chegada) 123,5 -> 114; chefe do 100 143 -> 124,5** (11 de 12 seeds chegam; antes eram 9 de 12); conjunto T6 149 -> 149. P: andar 100 86 -> 81,5, chefe do 100 102,5 -> 92, nível 100 105 -> 104,5. O Ouro do atacadista é pequeno (7%), mas o simulador vivia **sem Ouro** em parte das seeds (rodada 17, seção 9), e uns poucos milhares de Ouro tiram essas seeds do impasse. Não mexi em nenhum número para trazer de volta; parte da diferença pode ser ruído (as medianas oscilam, a do chefe do 100 até 15 dias).

### 5. A Bolsa de Ouro (`src/game/goldPouch.ts`, `T.goldPouch`)

| Regra | Valor |
| --- | --- |
| Valores de face | 10 000 / 50 000 / 100 000 (`denomSmall`, `denomMedium`, `denomLarge`); o menor é o mínimo de uma Bolsa |
| Taxa ao criar | 5% do valor, arredondada para cima, **em Ouro, por cima** (500 / 2 500 / 5 000): sumidouro puro |
| Limite | 3 Bolsas por dia local (todos os valores juntos), mesma virada de dia do mercador |
| Quem cria | só o dono do Passe; quem não tem vê a aba com o requisito |
| Quem abre | qualquer um que tenha uma, valor exato, sem volta (dois toques) |
| Espaço | empilha 99 por espaço, mochila e Baú; sem espaço na mochila nada é criado e nenhum Ouro sai |
| Negociável | `isTradeable({ kind: 'consumable', id })` é verdadeiro para as três Bolsas e falso para todo outro consumível e todo material |
| Mercadores | nunca compram (`sellValue` 0); o atacadista só compra material |

Criar e abrir é sempre **perda líquida igual à taxa** (testado para os três valores e qualquer Ouro inicial); o limite diário vira à meia-noite local; não se cria sem o valor **mais** a taxa; nenhum caminho duplica Ouro (400 passos aleatórios conferem a soma Ouro + Ouro nas Bolsas + taxas + descartado). Fora do escopo: exportar e importar o save copia o herói inteiro. Abrir uma Bolsa não conta como "Ouro ganho" (senão criar e abrir em ciclo, pagando 5%, ganharia as conquistas de Ouro). O Ouro dentro das Bolsas aparece como "Patrimônio" nas estatísticas, não como Ouro gastável. Texto em pt e en gerado dos mesmos números (`pouch.explain` e a linha "pode criar Bolsas de Ouro" do Passe), conferido por `passPerks.test.ts` e `goldPouch.test.ts`. O ícone existente `gold_pouch.png` serve às três (precisa de arte própria se o dono quiser distinguir 10 mil, 50 mil e 100 mil à primeira vista).

### 6. Tabela de guarda dos dias 1 a 21 (cenário A, 20 seeds, mediana), antes -> depois

**Idêntica** (a saída de `npm run sim` é a mesma linha por linha, exceto o tempo de execução): T2 8 / checkpoint 10 no dia 1; T3 dia 2; T4 13 / 27 / 47; T5 dia 5, 0%; T6 chegada 12 / 15, chefe 50 mediana 15 (20/20 em 21 dias); T7 1,08; T8 75%; todos os I1 a I4 iguais. O atacadista abre no chefe do andar 75 (decisão do dono, depois da Rodada 18 ter nascido no 50): fora dos 21 dias do guarda, mas o jogador simulado só o usa a partir do dia 22 de qualquer forma (`wholesaleFirst` em `player.ts`); sem isso o dia 21 mudaria.

### 7. Decisões que o diretor pode discordar

1. **25% e curva por unidade, sem teto em Ouro por dia.** A curva não limita materiais caros e escassos (Coração, Tutano); só o preço limita. Dá +19,1% na pior janela do comum no fim de jogo.
2. **O dono do Passe passa de 20% nos dias 21-40** (23,5% no pior). Se isso incomoda: baixar `priceRate` para 0,20, ou abrir o atacadista no andar 75 (mais tarde, o excesso do dono já foi consumido pelos sumidouros).
3. **Compra só da mochila, nunca do Baú.** Quem enche o Baú com excesso precisa tirá-lo antes (a mesma regra do mercador comum).
4. **Material "acima de comum"** inclui incomum: Sangue, Tutano, Estilhaço, minério e madeira dos tiers 3 e 4 pedem a segunda confirmação.
5. **A taxa da Bolsa é 5% e o limite 3 por dia.** Com 3 Bolsas grandes por dia o sumidouro máximo é 15 mil Ouro por dia.
6. **O jogador simulado vende ao atacadista só o que ia jogar fora**, uma política de máximo uso; os marcos da Masmorra andaram (seção 4).
7. **Uma Bolsa não conta como Ouro ganho nas estatísticas** (nem nas conquistas de Ouro).

### 8. Não feito, ou verificado só em parte

- O mercado de jogadores não existe: a Bolsa é, hoje, só armazenamento com taxa. O preço livre entre jogadores fica para a integração.
- Não vi no navegador: o botão "Atacadista" nos avisos de mochila cheia e no resumo "bem-vindo de volta", o botão "Abrir" no detalhe do inventário, o detalhe do Códice. São um botão ou uma linha de texto (tsc, lint e testes passam).
- O simulador longo rodou uma vez só (12 seeds); as medianas oscilam uns 3 dias, as do andar 100 e do chefe até 15.

## Rodada 19 — o Passe mantém a vantagem sem lucro por pagamento (2026-10-15)

Decisão do dono: quem compra o Passe tem de ficar claramente à frente, mas sem poder lucrar por ter pago. Seis mudanças:

| Peça | Antes | Depois |
| --- | --- | --- |
| Armazenamento base (todos): Caça zona 1 / zona 2, Mineração, Lenhador | 4 h / 5 h / 4 h / 4 h | **6 h** em todos (as zonas 3 e 4 já eram 6 h) |
| Armazenamento do Passe (`T.battlePass.capHours`) | 8 h | **10 h** |
| Peça forjada com o Selo do Ferreiro | sem vínculo (negociável se Épica+) | **nasce vinculada** (nunca negociável) |
| Criar Bolsa de Ouro | só dono do Passe, taxa 5% | **qualquer jogador**: 10% sem o Passe (`T.goldPouch.feePctFree`), 5% com o Passe (`feePct`); limite diário igual (3) |
| Emblema do Aventureiro | +5% XP, +5% ouro, +2% dano | **+5% ouro, +2% dano** (sem XP) |
| Linha do Passe na lista de vantagens | "Pode criar Bolsas de Ouro" | "Taxa menor na Bolsa de Ouro" (gerada de `passPerks.ts`, conferida por `passPerks.test.ts`) |

**Onde o armazenamento é lido** (todos derivam dos mesmos números): `huntingZones.ts` (`offlineCapHours` das zonas), `tunables.ts` (`mining.capHours`, `woodcutting.capHours`, `battlePass.capHours`), `engine.ts` (a sessão de Caça, de Mineração e de Lenhador congelam o teto de quando começaram, então uma sessão em andamento mantém o teto antigo até acabar; a regra de snapshot não mudou), a tela de seleção de Caça e a de profissões (mostram "guarda até N h"), o resumo de volta e os avisos (usam o teto da própria sessão), a lista de vantagens do Passe e o limite do servidor (`supabase/functions/_shared/progress/bounds.ts`, `burstHours` 8 → 10, para que um resgate de 10 h não seja marcado). A Horta não tem teto de armazenamento (cada canteiro guarda uma colheita pronta) e não mudou. O `ESTIMATE_HOURS = 4` da estimativa de caça é uma janela de referência da tela, não um teto, e ficou.

**Medição** (`npm run sim`, 20 seeds, 21 dias, cenário A contra o dono P; antes e depois, com e sem únicos):

| Meta do guarda (dias 1 a 21) | Antes (com / sem únicos) | Depois, com únicos | Depois, `SIM_NO_UNIQUES=1` |
| --- | --- | --- | --- |
| Primeira sessão termina no andar ≥ 8 | 8 / 8 | 8 | 8 |
| Primeira peça forjada no dia ≤ 2 | 2 / 2 | 2 | 2 |
| Nível no dia 1 (10-16) | 13 / 13 | 13 | 13 |
| Nível no dia 3 (20-29) | 28 / 28 | **30 (27-34), fora da faixa** | **30 (27-34), fora da faixa** |
| Nível no dia 14 (45-60) | 47 / 47 | 50 | 50 |
| Chefe 25, dia 4-6 (mediana) | 5 / 5 | 4 | 4 |
| Chegada ao andar 50, mediana 12-15 | 15 / 15 | 12 (primeira seed no dia 9) | 13 (primeira seed no dia 10) |
| Chefe 50, mediana | 16 / 16 | 12 | 13,5 |
| Depois do chefe (HP x dano) ≥ 1,0 | 1,08 / 1,08 | 1,08 | 1,08 |

**O guarda que quebrou:** o nível no dia 3 passou de 28 para 30 (a faixa é 20-29). É o efeito direto dos 6 h de base para quem não tem o Passe (a primeira zona passou de 4 h para 6 h). Também o próprio teste T6 do simulador marca "fora da meta" na chegada ao andar 50 com únicos (a primeira seed chega no dia 9; a regra é nenhuma antes do dia 10) e no chefe 50. Nada mais foi ajustado por conta própria: é um efeito esperado da decisão dos 6 h, e fica para o dono decidir (por exemplo manter a zona 1 em 5 h ou subir só a Mineração e o Lenhador).

**Dono contra não dono** (medianas, cenário A contra P, só as vantagens do Passe):

| Quando | Medida | Antes: sem / com Passe | Depois: sem / com Passe |
| --- | --- | --- | --- |
| dia 7 | materiais/dia (média 1-7) | 304 / 659 (+116%) | 346 / 828 (+139%) |
| dia 7 | nível | 41 / 46 (+5) | 41 / 47 (+6) |
| dia 7 | andar mais alto | 30 / 36 | 30 / 40 |
| dia 14 | materiais/dia (média 1-14) | 373 / 875 (+135%) | 553 / 1 066 (+93%) |
| dia 14 | nível | 47 / 53 (+6) | 50 / 54 (+4) |
| dia 14 | andar mais alto | 43 / 60 | 60 / 69 |
| marco | chegada ao andar 50 | 15 / 10 (5 dias) | 12 / 9 (3 dias) |
| marco | chefe 50 | 16 / 11 (5 dias) | 12 / 9 (3 dias) |

Sem únicos o quadro é o mesmo: dia 14 nível 50 / 54 e chegada ao 50 em 13 / 9 (4 dias; antes 15 / 10,5, 4,5 dias). O dono continua claramente à frente (+93% de materiais e 3 a 4 dias nos marcos), mas a vantagem de nível e de tempo diminuiu no dia 14 e no andar 50: o não dono ganhou mais com os 6 h do que o dono ganhou com os 10 h.

**Não verificado:** a tela de Bolsas, o texto novo da lista de vantagens e a linha da descrição do Selo não foram vistos no navegador (só pelos testes). A migração e o servidor de ranking não têm teste de integração com o banco.


## Rodada 20 — a Liga: o XP do herói vem só da Caça (2026-10-15)

Decisão do dono, para a Liga competitiva (ranking por nível do herói; todo mundo recomeça do zero na primeira Liga): **o herói ganha XP só caçando**, o elixir de XP vira um buff caro e feito à mão, a curva do topo foi acertada para o ritmo da Liga e os limites do servidor foram refeitos a partir das fontes novas. Medido com `npm run sim` (20 seeds, 21 dias, com únicos) e `npm run sim:long` (6 seeds, 180 dias; as tabelas de ritmo abaixo usam 12 seeds x 60 dias com `SIM_NO_UNIQUES=1`, o mesmo jogador de antes com a política nova do Elixir).

### 1. De onde vinha o XP do herói, antes e depois

| Fonte | Antes | Depois | O que ficou no lugar |
| --- | --- | --- | --- |
| Caça | `xpPerHour` da zona x profundidade x bônus (Relíquia, Aprendiz Veloz) | **igual**, mais o Elixir do Conhecimento (+25% no tempo de luta que ele cobre) | - |
| Masmorra | 60 XP x (1 + 5% por andar) por vitória + 200 por checkpoint + 500 por chefe (100% do XP do dia 1 do jogador simulado e de 0,1% a 4% do XP dos dias 10 a 60) | **0** (`stageVictoryXp`, `dungeonRunXp`, `milestoneXpBonus`, `runSummary.ts` e os tunables `victoryXp`, `checkpointXpBonus`, `bossXpBonus`, `battle.rewardGrowth` saíram) | Ouro fixo nas ondas de checkpoint (`T.advanced.checkpointGoldBonus` 40) e de chefe (`bossGoldBonus` 100), dentro de `waveRewards`: a derrota guarda a mesma fatia dele que do resto. A Masmorra continua sendo o que abre as zonas de Caça (`unlockFloor` 0 / 26 / 51 / 76, conferido: usam o maior andar) e os tiers da Forja |
| Pedidos | `xpPerHour*` 780 a 1 200 x fator de nível (até 3,2) x (1 + 20% do Passe) x bônus da Relíquia: de 16% a 51% do XP do jogador simulado dos dias 10 a 40 e 2% no dia 60 | **0** (o campo `xp` saiu da oferta; uma oferta antiga salva com `xp` é paga sem ele) | **+10% de Ouro em todo pedido** (`T.deliveries.goldBonus`), sem mexer na carga (dimensionada com o Ouro sem o bônus). O teste de âncora contra a Caça (0,8 a 1,2) continua em `round14.test.ts`, agora com o bônus: nível 50 em 1,19 (com 15% passava de 1,2 e foi para 10%) |
| Poção do Conhecimento (`xp_potion`) | +150 XP instantâneos, 3 Ervas Energéticas + 30 de Ouro | **saiu**. Um save antigo carrega cada uma como **40 de Ouro** (mochila e baú; `legacyXpPotion.ts`, uma vez só) | O Elixir do Conhecimento (seção 2) |
| Expedição (legado, só as que já estavam em andamento) | 55 mil / 220 mil / 440 mil XP | 0 (paga o Ouro e as Runas de sempre) | - |
| Passe (bônus de XP nas entregas) | +20% | saiu | A linha do Passe dos pedidos passou a dizer "Mais escolha entre os pedidos"; o Passe continua com 1 oferta e 1 troca a mais e os +15% de Ouro |
| Missões, conquistas, trilha do Passe, sequência de login, metas semanais, Profundezas, Relíquia da Temporada | conferido: **nenhuma pagava XP do herói** (pagam Ouro, Runas, consumíveis e cosméticos); a Relíquia e o Aprendiz Veloz só *multiplicam* o XP da Caça | sem mudança | Os textos mudaram: "+X% de XP do personagem **na Caça**", o tutorial da Masmorra e o resultado da descida não prometem mais XP, nem níveis, nem o card de pedido |

Consequência de design que vale ler: a Masmorra não sobe mais o herói, então **o nível do fim do dia 1 é 1** no jogador simulado (ele minera e corta para a primeira peça antes de caçar; o primeiro nível chega no primeiro resgate da Caça, dia 2). Um jogador de verdade que segue o tutorial (Masmorra, depois uma Caça de verdade) sobe de nível nos primeiros minutos de Caça: uma Caça de 10 minutos paga cerca de 290 XP (nível 4).

### 2. O Elixir do Conhecimento

- **Efeito:** +25% do XP de Caça por 4 horas reais, só no tempo de luta que a janela cobre (a mesma regra do Tônico da Fortuna: a luta conta pelo instante em que termina). Multiplica com a Relíquia e o Aprendiz Veloz. Não vale para a Masmorra, que não paga XP. Nunca é vendido (Loja, mercadores, Passe, mercado): `purchasable false`, `sellValue 0`.
- **Um de cada vez:** beber outro com um ativo é **recusado e não gasta nada** (decisão: dobrar a duração ou empilhar tempo deixaria quem confere o jogo de 4 em 4 horas igual a quem deixa um estoque de elixires; assim a cobertura depende de estar presente, que é o que o dono pediu). Depois que o primeiro acabou, vale de novo. Regras de sessão congelada iguais às dos tônicos de Caça: um elixir já ativo na hora de começar a Caça abre uma janela no começo; um bebido durante a Caça abre a janela dali em diante; um bebido depois de parar a Caça nunca é retroativo (a recompensa pendente já está congelada). Persiste em `save.buffs.knowledge` e na janela da sessão.
- **Receita (uma por tier de zona; só a da melhor zona que o herói abriu aparece e pode ser feita, então ela acompanha a subida):**

| Tier (zona) | Plantas da Horta | Drop raro da zona | Ouro | Nível do herói | Horas de canteiro por elixir |
| --- | --- | --- | --- | --- | --- |
| 1 Clareira dos Demônios | 2 Lírio Lunar (Jardinagem 45) | 1 Núcleo Demoníaco | 20 | 30 | 20 |
| 2 Pântano de Sangue | 1 Lírio Lunar + 3 Sálvia de Prata (50) | 1 Cristal Corrompido | 35 | 40 | 22 |
| 3 Fenda Demoníaca | 1 Orquídea do Crepúsculo (60) + 2 Sálvia de Prata | 2 Núcleos Demoníacos | 50 | 50 | 20 |
| 4 Abismo de Sangue | 2 Orquídeas do Crepúsculo (60) | 2 Cristais Corrompidos | 65 | 60 | 24 |

  O raro nunca é o Chifre do Demônio nem o Coração de Sangue (são o gargalo das peças tier 5 e 6) e os dois itens de gargalo da Rodada 17 não foram tocados. Um item só no inventário (`knowledge_elixir`), quatro receitas (`potions.ts`, `zoneTier`).
- **Conta de manter 100% de cobertura:** 24 h / 4 h = **6 elixires por dia**. Garden: 6 x (20 a 24 horas de canteiro) = 120 a 144 horas por dia, de **83% a 100% das 144 horas** que os seis canteiros dão (a planta de 12 h cabe entre duas visitas; a de 16 h, que seria 100%+, ficou de fora de propósito). Ouro: 6 x 65 = **390 por dia no tier 4** e 300 no tier 3; o ouro que entra no jogador comum sem Passe (cenário A, mediana de 12 seeds) é 1 102 por dia nos dias 36-50 e 1 453 nos dias 46-60, no dono do Passe 2 425 e 2 470: **27% e 27% do ouro do jogador comum, 12% e 16% do dono**. Raros: 12 Núcleos / 12 Cristais por dia nos tiers 3 / 4 contra (estimativa da própria Caça, 4 h por amostra) uns 36 a 170 Núcleos por dia na Fenda e 12 a 70 Cristais no Abismo. Quem confere o jogo duas vezes por dia só chega a 2 elixires (8 h): o jogador simulado bebe 1,3 a 1,6 por dia e cobre **53% a 64% das horas de Caça do jogador comum e 33% das do dono** (ele caça 20 h por dia; o teto de 2 elixires é 40%), gastando 84 a 104 de Ouro por dia (4% a 8% do que entra), o que dá **+14% / +8% de XP**. A política do simulador faz 2 por dia, craftados com o Ouro que sobra depois da próxima peça e das plantas que a próxima peça não pede.
- **Por que a Horta só tem as plantas de nível 45+:** é o que o dono pediu (Jardinagem 40+); o jogador simulado (comum e dono) chega à Jardinagem 45 / 50 / 60 por volta dos dias 10 / 13 / 30, então na prática o Elixir só entra de verdade depois do dia 30 (Cobertura 0% até lá, 45% a 61% da Caça do jogador comum depois) e as receitas da Fenda e do Abismo pedem uma Horta cuidada.

### 3. A curva de XP do herói

Só a banda 4 (níveis 61 a 80) mudou: o crescimento por nível foi de 3% para **2,3%** (`heroGrowth4` 1,03 -> 1,023). Os níveis 1 a 60 são idênticos (a primeira sessão, o tutorial e os recibos de peça continuam como eram) e a banda 5 (81 a 100) fica em 3%. O custo é o XP do nível, o acumulado é o necessário para chegar nele:

| Nível | Custo do nível, antes | Custo do nível, depois | Acumulado, antes | Acumulado, depois |
| --: | --: | --: | --: | --: |
| 10 | 277 | 277 | 1 476 | 1 476 |
| 20 | 825 | 825 | 6 132 | 6 132 |
| 30 | 3 060 | 3 060 | 22 093 | 22 093 |
| 50 | 53 070 | 53 070 | 325 729 | 325 729 |
| 70 | 332 844 | 313 030 | 4 360 779 | 4 288 052 |
| 90 | 583 643 | 512 716 | 13 168 081 | 12 148 052 |
| 100 | 784 368 | 689 048 | 19 858 898 | 18 025 772 |

Por que tão pouco: tirar o XP dos pedidos e da Masmorra já derrubou o ritmo do começo (nível 30 mais tarde) e o Elixir devolveu uns 8% a 14% no fim; o jogador simulado dono do Passe chegava ao nível 85 no dia 60 só com a Caça, perto da meta. O custo cai um pouco para o mais rápido passar do 90 (a banda 4 em 1,02 deixava a mediana em 88,5 com o Elixir; 1,023 deixa 87). A migração (`XP_CURVE_VERSION` 3) mantém o nível e a fração do nível de quem está salvo na curva 2 (e a de quem estava na 1 vai direto para a nova); levels 1-60 ficam com o XP intacto; o paragon é preservado em níveis inteiros do preço novo. O preço do Paragon cai com a banda 5 (o nível 1 de Paragon passa de 470 mil para 401 mil XP, ainda dois dias de Caça da última zona).

### 4. Ritmo da Liga (12 seeds, 60 dias, `SIM_NO_UNIQUES=1`; nível do herói no fim do dia: mediana (mais lenta, mais rápida))

| Dia | Dono do Passe (P): mediana | mais lenta | mais rápida | Sem Passe (A): mediana | mais lenta | mais rápida |
| --: | --: | --: | --: | --: | --: | --: |
| 7 | 44 | 42 | 44 | 37 | 35 | 37 |
| 14 | 50 | 48 | 51 | 47 | 46 | 48 |
| 30 | 64,5 | 60 | 69 | 56 | 53 | 59 |
| 45 | 75,5 | 70 | 80 | 65 | 61 | 67 |
| 60 | **87** | 76 | **90** | **73,5** | 68 | 74 |

Metas pedidas: seed mais rápida do dono entre 90 e 95 no dia 60 (**90**, ok, no limite de baixo), mediana do dono entre 80 e 88 (**87**, ok), ninguém no nível 100 (a seed mais rápida chega ao 100 depois do dia 60: nível 90 no dia 60 em 1 de 12, nível 100 em 0 de 12). **Fora da meta: a mediana sem Passe está 13 níveis abaixo da do dono, não "poucos"** (73,5 contra 87). A causa não é a curva: é o armazenamento do Passe (10 h contra 6 h por visita, +67% de horas de Caça com duas visitas por dia) mais os +10% de material e as zonas 3 e 4 abrindo 2 e 8 dias antes; uma curva mais íngreme no topo aproxima os dois mas tira a mediana do dono da faixa (na conta aberta com o XP desta simulação, `heroGrowth4` 1,04 deixa a mediana do dono em 84 e a mais rápida em 85, abaixo de 90). Para fechar o buraco o caminho é mexer no Passe (armazenamento ou material), não na curva. Os marcos: nível 50 no dia 22 (A) e 14 (P), 60 no 37 e 24, 70 no 51 e 34,5, 75 no 44,5 (P; A depois do dia 60), 80 no 51 (P); zona 4 aberta no dia 31,5 (A) e 23,5 (P); peça T5 de arma no 51 e no 35; conjunto T5 no dia 53 (P; A depois do 60). O Elixir cobre 0% até o dia 30 (a Horta ainda não tem as plantas) e 45% a 61% da Caça do jogador comum depois.

O `npm run sim:long` completo (6 seeds x 180 dias, `SIM_NO_UNIQUES=1`) confirma o dia 60 (dono 87, 83 a 90; comum 74, 71 a 74) e dá o resto: nível 90 no dia 94 (A) e 64 (P), **nível 100 no dia 125 (A) e 87 (P)**, andar 100 no 107 e 67, chefe 100 no 116 e 72,5, conjunto T5 no 74,5 e 52, conjunto T6 no 133 e 87,5, Paragon 1 no 127,5 e 88,5. Antes da Liga (rodada 17, 12 seeds) o nível 100 era no dia 145 (A) e 105 (P): a Liga ficou uns 20 dias mais rápida no fim e mais lenta no começo (nível 50 no 22 / 14 contra 17 / 10).

### 5. Guarda dos dias 1 a 21 (cenário A, 20 seeds, com únicos), antes (Rodada 19) -> depois

| Meta | Antes | Depois | Mudou? |
| --- | --- | --- | --- |
| T2 primeira sessão termina no andar >= 8 | 8 | **8** | mantida |
| T2 checkpoint do andar 10 | dia 1 | **dia 2** | **a meta passou de "dia 1" para "até o dia 2"**: no dia 1 o herói não ganha mais nível na Masmorra, então a segunda visita do dia 1 enfrenta o 10 com o herói do nível 1 |
| T3 primeira peça forjada (dia <= 2) | 2 | **2** | mantida |
| T4 nível | dia 1 / 3 / 14: 13 / 30 / 50 (faixas 10-16 / 20-29 / 45-60) | dia 2 / 3 / 14: **24 / 24 / 47** (faixas 20-28 / 20-29 / 45-60) | **a faixa do dia 1 saiu** (o nível do fim do dia 1 é 1 por desenho: o XP só chega no primeiro resgate de Caça) e entrou o dia 2 (20-28); dia 3 e dia 14 continuam dentro da faixa antiga. O dia 3 caiu de 30 para 24 (e o dia 7 de 41 para 37) |
| T5 chefe 25 vencido (dia 4-6) | dia 4 | **dia 5** | dentro da faixa; vitória ao chegar 0% |
| T6 chegada ao andar 50 | primeira seed dia 9, mediana 12 | **primeira seed dia 10, mediana 14** | "nenhuma seed antes do dia 10" volta a valer; a mediana 14 está em 12-15 |
| T6 chefe 50 (faixa 12-16) | mediana 12 | primeira seed dia 11, mediana 14, 20/20 em 21 dias | a primeira seed do chefe 50 cai no dia 11 (a faixa é 12-16): fora por 1 dia; na Rodada 19 essa linha também falhava |
| T7 menor razão depois de um chefe | 1,08 | 1,08 | igual |
| T8 derrota mantém 75% do ouro | 75% | 75% | igual |
| I1 a I4 (inventário) | ok | ok (I1 dia 6, I4 +0% / +20% / +25%) | iguais |
| nível no dia 21 | 51 | 49 (48-50) | -2 |
| andar mais alto no dia 21 | 60 | 60 (59-73) | igual |

Chefe 25 no dia 5 mantém "no 1º semana"; primeira peça no dia 2 e primeira sessão no andar 8 também.

### 6. Limites do servidor (`bounds.ts`, `npm run season:bounds`, `npm run season:tables`)

O servidor passou a julgar o XP do herói só pela Caça (a Masmorra e os pedidos saíram da conta; a tabela `DUNGEON_RUN_XP` foi removida de `tables.ts`). As margens de sempre ficam: bandeira no valor, rejeição em 2x (teóricos) ou 3x (ritmo), aviso suave `FAST_*` em 1,3x.

| Número | Antes | Depois |
| --- | --- | --- |
| `xpPerHour` (teórico no andar 100) | 60 000 = Caça 19 773 + pedidos 5 391 + Masmorra 34 325 | **25 000** = melhor zona 13 000 x profundidade 1,3 x 1,12 (Aprendiz Veloz, 3 ranks; a Relíquia não dá mais XP desde a Rodada 19) x 1,25 (Elixir sempre ativo) = 23 660 (o servidor guarda 25 000 e o fator 1,902, que ainda conta 5% da Relíquia, de folga) |
| `huntXpFactor` | 1,521 | **1,902** |
| `ordersXpPerHour`, `orderLumpXp`, `orderLumpFactorAt50` | 5 400 / 35 400 / 3,2 | removidos |
| `xpPerHourAt(andar)` | zona x fator + pedidos + 20 corridas da Masmorra | zona x fator (andar 0: 8 100 -> 3 300; andar 100: 59 500 -> 24 700) |
| `burstXp(nível, andar)` | 10 h da zona x fator + um pedido (35 400 x até 3,2) | `burstXp(andar)` = 10 h da zona x fator (andar 0: 62 mil -> 33 mil; andar 100: 311 mil -> 247 mil) |
| `levelPace` (dia em que a seed mais rápida chega) | 13 / 27 / 50 / 60 / 75 / 90 / 100 nos dias 1 / 3 / 9 / 23 / 45 / 76 / 104 | 24 / 28 / 44 / 51 / 60 / 68 / 75 / 79 / 88 / 100 nos dias 2 / 3 / 7 / 14 / 24 / 30 / 40 / 45 / 60 / 80 |
| `floorPace` | andar 25 no dia 3, 50 no 8,5, 90 no 62, 100 no 75 | 25 no dia 2, 50 no 9, 90 no 42, 100 no 53 |
| `floorCapByLevel` | [1, 6], [27, 30], [50, 66], [57, 85], [77, 98] | [1, 12], [24, 36], [44, 56], [50, 84], [57, 91], [70, 100] (a Masmorra não sobe mais o herói: o nível 1 já está no andar 10) |

Os testes (`seasonProgress.test.ts`, `supabase/functions/_shared/__tests__/progress.test.ts`) continuam provando que a seed mais rápida e um humano 20% mais rápido passam `ok` em 150 dias e que as constantes teóricas cobrem o jogo.

### 7. O que não foi verificado e o que o dono pode discordar

- Nada disto foi visto no navegador (a lista de Alquimia com a receita por tier, o botão de usar o Elixir, os textos novos): só pelos testes de lógica e de locale.
- O ouro de 20 / 35 / 50 / 65 por elixir é pequeno em números absolutos porque o jogador simulado ganha 1 000 a 2 500 de Ouro por dia; o "caro" está na proporção (27% do ouro de quem não tem o Passe a 100% de cobertura), na Horta (83% a 100%) e nos raros. Se o ouro real dos jogadores for muito maior (o simulador não joga metas semanais nem a trilha do Passe), o preço precisa subir junto.
- A mediana sem Passe fica 13 níveis abaixo do dono (seção 4). O dono pediu "poucos"; não dá sem tocar no Passe.
- O jogador simulado só bebe 2 por dia (uma por visita). Quem confere de 4 em 4 horas chega a 100% de cobertura e a +25% de XP; o limite do servidor já conta com isso (`xpPerHour` com o Elixir sempre ativo).
- A primeira Liga recomeça todo mundo do zero: a migração de curva só importa para quem joga offline / desktop e para os saves de teste.


## Rodada 21 — as profissões são uma corrida de verdade na Liga (2026-10-15)

Pedido do dono: a Liga ranqueia Mineração, Lenhador e Horta à parte e quem se especializar numa só disputa um pedaço do prêmio. Quatro coisas: (a) a pontuação não pode empatar no teto e o especialista mais rápido não pode chegar ao teto (75) em 60 dias; (b) cada alavanca de XP por hora tem de ter custo ou escolha, e nada pode travar o especialista no nível do herói; (c) uma política "especialista" no simulador; (d) os limites do servidor de XP de profissão refeitos.

### 1. (a) O ranking não empata no teto, e o teto ficou longe

- **A pontuação é o XP total da profissão** (`season_profession_entries.score`, migration `0006`; `extractMetrics` lê `save.skillXp`). Conferido no código e travado em teste (`professionRace.test.ts`): a coleta de Mineração / Lenhador soma `unidades x xpPerUnit` e a colheita da Horta soma `plantHarvestXp` **sem teto**, também com o nível já em 75; o nível é que fica em 75 (`skillLevel`). No servidor `professionLevelFromXp` trava em 75 mas o `xp` segue crescendo (limite 1e12). Dois heróis no nível 75 com XP diferente têm pontuações diferentes. Não precisou mudar o código do ranking.
- **O ritmo estava muito curto:** o jogador simulado que só minera chegava ao 75 no dia 25 (sem Passe) e no dia 13 (dono do Passe); o especialista da Horta no dia ~40; o jogador comum já estava com Horta 75 no dia 60. Medido antes (mediana = mais rápida, a política é determinística, as seeds só mudam o horário das visitas): Mineração sem Passe nível 75 no dia 30 (18 764 XP), dono nível 75 no dia 14 (14 408 XP); Horta nível 71 no dia 30 e 75 no dia 45.
- **Curvas novas (só o topo mexe, para a Forja não sentir):**
  - **Mineração / Lenhador** (a mesma curva): níveis 1 a 60 custam **exatamente** o que custavam (as portas de minério e madeira, a obsidiana no 60 incluída, abrem com o mesmo XP; a simulação de 60 dias não se mexeu na Forja). Nova banda 5 (níveis 61 a 75, `professionBand4To` 60, `professionGrowth5` 1,5): cada nível custa 50% mais que o anterior. XP para chegar ao nível: 50 = 1 963; 60 = 3 856 (igual); 65 = 6 650; 70 = 27 097; 72 = 56 532; 75 = 182 365 (antes: 70 = 8 738, 75 = 13 587).
  - **Horta:** crescimento de 1,08 por nível até o 45 (igual) e **1,14** a partir dele (`gardenLateFrom` 45, `xpGrowthLate` 1,14): 45 = 1 786 (igual); 50 = 2 763; 60 = 8 267; 70 = 28 666; 75 = 54 516. As plantas de nível 45 a 60 (Lírio Lunar, Sálvia de Prata, Orquídea) abrem com o mesmo XP até o 45 e depois mais tarde.
- **O que o jogador simulado especialista faz** (item (c)), nível (XP total) no fim do dia, 4 seeds por cenário: a política é determinística, mediana, mais rápida e mais lenta são iguais (exceto a Horta e o Lenhador, que variam em < 0,3%); o Lenhador é idêntico à Mineração.

| Dia | Mineração / Lenhador sem Passe | com o Passe (mais rápida) | Horta (com e sem Passe) |
| --: | --- | --- | --- |
| 7 | 51 (2 106) | 63 (5 074) | 44 (1 750) |
| 14 | 64 (6 397) | 67 (13 754) | 56 (5 450) |
| 30 | 68 (17 537) | 70 (35 032) | 64 (14 090) |
| 45 | 70 (28 478) | 71 (55 981) | 67 (22 190) |
| 60 | **71** (39 958) | **72** (77 323) | **70** (30 410) |

  Meta: mais rápido entre 65 e 72 no dia 60 (**72** Mineração / Lenhador do dono, **70** Horta), mediano um pouco abaixo (**71** / **70**; a diferença é de 1 nível porque o topo é íngreme: o dono faz o dobro do XP, mas do nível 70 em diante cada nível custa mais de 10 mil). Ninguém chega ao 75 em 60 dias, nem no ritmo teórico do servidor (24 h por dia com tudo ligado: 151 mil XP de Mineração, nível 74, abaixo dos 182 mil do 75; a Horta só passaria com Fertilizante em **todo** plantio, e teste prova isso).
- **Frequência pura:** o mesmo especialista conferindo de 6 em 6 horas (4 visitas, o teto de armazenamento aproveitado inteiro) chega a **78 mil XP sem Passe** (nível 72, 2x os 40 mil de 2 visitas) e a **95 mil XP com Passe** (nível 73, +23% sobre os 77 mil), então o humano mais viciado fica **no 73, ainda abaixo do teto**, e 4 visitas sem o Passe valem o mesmo que 2 visitas com ele (por isso o Passe continua a vantagem que o dono quer). A Horta quase não se mexe com a frequência (29,7 mil XP com 4 visitas contra 30,4 mil com 2: o canteiro é o gargalo, não a visita).

### 2. (b) O que sobe o XP de profissão por hora, e o que cada coisa custa

Mineração / Lenhador: XP por hora = unidades por hora = (5 + 0,75 x nível) x 1 x multiplicadores (1 XP por unidade; `xpPerUnit`).

| Alavanca | Quanto dá | O que custa / qual a escolha |
| --- | --- | --- |
| Nível da profissão (potência) | +0,75 unidade/h por nível (nível 60 = 50/h, 11x o nível 1) | Tempo: a curva (seção 1). Não depende do nível do herói |
| Horas por dia | até 24 h/dia (sessão guarda 6 h, 10 h com o Passe) | É a maior alavanca e é de graça: 4 visitas por dia dão 2x (sem Passe) ou +23% (com). Limitada pelo armazenamento da sessão e pelo relógio; o teto de nível protege o ranking, não a frequência. É inerente a um jogo ocioso: o que o dono pode fazer é o prêmio olhar o XP **e** a auditoria (`FAST_*`) sinalizar quem passa de 1,3x a seed mais rápida |
| Passe | x1,1 material (XP) e armazenamento 10 h contra 6 h: 1,83x as horas de uma sessão e +10% de unidade com 2 visitas por dia | É pago (o ranking é só de quem tem o Passe, então na corrida real todos têm) |
| Maestria (50 e 70: +4% de unidades cada) | +8% no total | Só com o nível (o 70 só os mais rápidos alcançam em 60 dias) |
| Poção do Coletor (Brew) | +25% de horas efetivas por 2 h (+5% de uma sessão de 10 h, +8% de uma de 6 h) | 2 Capim Veloz (Horta 30) + 3 Erva Medicinal + 50 de Ouro por poção, uma por visita: ocupa canteiro que renderia XP de Horta |
| Tônico do Prospector | +10% por 2 h (+2% a +3%) | 1 Prata + 2 Madeira de Carvalho + 2 Cardo + 1 Flor Dourada + 60 de Ouro; soma com a Poção; o teto dos consumíveis novos é 10% (`newConsumableCap`) |
| Coletor (habilidade do herói) | +6% por rank, 3 ranks (+18%) | 3 pontos de habilidade = 15 níveis do **herói**, que só sobem **caçando**, e a caça disputa o único espaço de atividade com a coleta: custo real de verdade |
| Ferramenta (picareta / machado) | não existe: as ferramentas saíram do jogo (`skills.ts`, "Profession tools were removed entirely") e o poder só depende do nível | Nada a custear. Criar uma agora seria um sistema novo; fica como sugestão |

Horta: XP por colheita = horas de crescimento da planta x 5, a mesma por hora de canteiro para qualquer planta.

| Alavanca | Quanto dá | O que custa / qual a escolha |
| --- | --- | --- |
| Canteiros | 4, +1 na Jardinagem 20, +1 na 40 | Só nível da profissão |
| Planta que cabe entre as visitas | 6 canteiros x 5 XP x horas ocupadas: sem Fertilizante a planta tem de caber no intervalo (12 h entre visitas: a de 12 h dá 60 XP por canteiro por visita) | Escolha: a planta longa rende mais XP por visita, mas a que não termina até a próxima visita espera outra |
| Fertilizante | corta metade do tempo restante, uma vez por plantio: com ele a planta de 16 h cabe numa visita de 12 h (80 XP em vez de 60) | 3 Ossos (só caem na Caça das zonas 2 e 4) + 2 Ervas Medicinais (um canteiro inteiro dedicado) + 25 de Ouro **por plantio**: o especialista da Horta tem de caçar, e Fertilizante em todos os canteiros em toda visita é 36 Ossos e 24 Ervas por dia |
| Maestria (50 e 60: cada uma -5% do tempo de crescimento) | +11% de XP por hora | Só com o nível |
| Passe | **nenhum** (a Horta corre em paralelo com a atividade principal e não usa armazenamento nem material do Passe) | - |
| Frequência | pouca: 2 ou 4 visitas dão o mesmo | O canteiro é o gargalo |

Duas consequências a decidir pelo dono: (1) a Horta é uma profissão que **todo mundo cresce de graça** em paralelo com a Caça, porque não ocupa o espaço da atividade; a corrida da Horta é decidida pela rotina (usar o Fertilizante) e não por abrir mão de outra coisa. Quem quiser que ela custe alguma coisa precisa fazer o canteiro competir com algo (por exemplo plantas que só crescem com o herói parado). (2) Mineração e Lenhador competem entre si e com a Caça pelo mesmo espaço: o especialista é o que abre mão da Caça (e por isso vai ficar no nível 1 do herói e fora da corrida de nível).

**Portas de nível do herói que prendiam o especialista, e a decisão:** a **Poção do Coletor** (nível 15), o **Tônico do Prospector** (20) e o **Fertilizante** (5) pediam nível do **herói**, que só sobe caçando: um especialista de Mineração no nível 1 não podia fazer nenhuma. Passaram a pedir nível 1 (`potions.ts`, e a tabela de preços de `garden3.test.ts`). A porta real continua: as plantas pedem nível de Jardinagem (Capim Veloz 30, Flor Dourada 20), a Prata e a Madeira de Carvalho o nível da própria profissão. Conferido por teste (`professionRace.test.ts`): minério, madeira, planta e o sexto canteiro abrem só com o nível da profissão, com o herói no nível 1. Não há nenhuma porta de minério, madeira, planta ou canteiro por nível do herói (`ores.ts`, `woodcutting.ts`, `garden.ts` já diziam "nível da profissão"); o que existe são receitas de equipamento da Forja, que o especialista não precisa.

### 3. (c) A política "especialista" do simulador

`Player` (`scripts/sim/player.ts`) ganhou `specialist: 'mining' | 'woodcutting' | 'gardening'` e `checkInHours`. **Mineração / Lenhador:** todo check-in começa a coleta daquela profissão no melhor tier aberto, sem Masmorra, sem pedido, sem Caça (o herói fica no nível 1); toma a Poção do Coletor e o Tônico do Prospector que tiver (e fabrica a poção, o tônico quando dá); cuida da Horta como todo mundo. **Horta:** a Caça segue (ela dá os Ossos do Fertilizante, o jogador caça onde eles caem), a Horta é cuidada para XP (a planta mais longa que fica pronta até a próxima visita, com Fertilizante nas que ele cobrir, um canteiro de Erva Medicinal para fazer mais). `LONG_SCEN=M,W,G,PM,PW,PG` roda as seis variações (`X` na frente: 4 visitas por dia); o relatório mostra a tabela de nível e XP total da profissão nos dias 7, 14, 30, 45 e 60.

Limite honesto: a política é uma pessoa razoável, não a ótima (o Fertilizante quase não entra: poucos Ossos). O humano mais rápido tem folga de uns 25% sobre os 70 da Horta.

### 4. (d) Limites do servidor das profissões

As taxas teóricas (`MINING_XP_RATE`, `WOODCUTTING_XP_RATE`, `GARDENING_XP_RATE`) não mudaram de fórmula: a potência (5 + 0,75 por nível), o rendimento máximo (x1,82: Passe 1,1 x maestria 1,08 x poção, tônico e Coletor 1,53) e as 5 / 6 parcelas x 5 XP x 2,24 (Fertilizante + perks) valem os mesmos 111 XP/h (Mineração, nível 75) e 67 XP/h (Horta, 6 canteiros). Recalculadas (`npm run season:bounds`) e conferidas: a tabela `PROFESSION_XP_TO_LEVEL` foi regerada (`npm run season:tables`) com as curvas novas, então o nível que o servidor lê do XP é o do jogo e a taxa teórica usa o nível mostrado (que fica **mais baixo** para o mesmo XP; isso só estreita o limite com a potência que o jogador realmente tinha, e a taxa no nível de agora continua sendo a maior que ele teve). Novo: `BOUNDS.professionSimDay60` (Mineração / Lenhador 77 300 XP, Horta 30 440, o especialista mais rápido no dia 60) e um teste (`seasonProgress.test.ts`) que prova que o ritmo teórico (24 h por dia, 60 dias) fica **acima** disso (sem falso positivo no mais rápido que o simulador viu) e que os níveis do especialista no dia 60 estão entre 65 e 72. A diferença para o teórico, 150 mil contra 77 mil XP de Mineração, é a folga dos 2x do sinal e dos 3x da rejeição para humanos que conferem de 4 em 4 horas (95 mil).

### 5. O que não foi verificado e o que o dono pode discordar

- Nenhuma tela de profissão foi vista no navegador depois das curvas novas (a barra "nível em N horas" lê as mesmas funções, só pelos testes).
- A obsidiana e a madeira ancestral continuam no nível 60 (a mesma quantidade de XP de antes); só o nível 61 a 75 ficou caro. O jogador comum chega à Mineração 64 no dia 60 (antes 74 do dono): os perks de maestria do 70 e 75 passaram a ser coisa de especialista.
- O Fertilizante e a Horta: a corrida da Horta é cadência e Fertilizante, não escolha; ver a seção 2.
- "Frequência pura" não foi limitada: 4 visitas por dia dobram o XP de quem não tem o Passe. O limite é o armazenamento da sessão. Se o dono quiser que isso custe, o caminho é um limite diário de XP de profissão ou um rendimento que cai com sessões curtas; não foi feito.

## Rodada 22 — o comprador, o Ouro, os únicos e os eventos da Liga (2026-10-16)

Pedido do dono, depois da revisão econômica independente dos 60 dias da Liga. A revisão achou quatro coisas: (a) comprar um conjunto T4 punha o dono do Passe uns **+5,5 níveis** à frente do dono igualmente bom que não compra nada (a meta era +2 a +3); (b) a partir do dia ~23, quando a zona 4 Profundo abre, o equipamento deixa de importar para o XP do herói (o XP da Caça só conta tempo de luta ganha), então forjar T5/T6 era uma armadilha para o ranking e a ordem do ranking travava no dia ~25; (c) o Ouro quase não tem valor (Bolsas de 50 000 e 100 000 inalcançáveis, sobra de 25 a 40 mil sem nada para comprar); (d) os limites de cunhagem deixavam um bot que edita o save fazer ~12 únicos certificados e 10 000 de Ouro em Bolsas **por dia e por conta**. Esta rodada mexe nos quatro e acrescenta o calendário de eventos da Liga (dias 25 a 60).

### 0. Como foi medido (e o que cada política é)

`scripts/sim/leagueEcon.sim.ts` joga **uma política** por vez por 60 dias (o mesmo `Player` do `npm run sim:long`, a mesma semente de sorteio e de horário das visitas, então duas políticas da mesma seed só diferem pela política). `scripts/sim/leagueEcon.mjs` espalha política x seed em processos e imprime os quadros (`npm run sim:econ -- TAG A,P,PS,PG,PB 6`; `LEAGUE_EVENTS=0` desliga os eventos; `LEAGUE_REPORT_ONLY=1` só imprime). `npm run sim:sublevels` imprime a taxa de vitória de cada herói da escada em cada sub-nível da zona 4 (`subLevelReach.sim.ts`).

| Política | Quem é |
| --- | --- |
| **A** | jogador comum sem Passe (2 visitas por dia) |
| **P** | o mesmo com o Passe: caça onde cai o material que a próxima peça pede, minera e corta o que falta |
| **PS** | P "esperto": todas as visitas de Caça vão para a última zona no Profundo quando ela também dá o material que falta; ainda minera e forja o que a próxima peça pede |
| **PG** | o "esperto" da revisão (guloso): assim que a zona 4 Profundo abre só caça lá, nunca mais minera nem forja por falta de material (é o experimento `greedy` da revisão, portado) |
| **PB** | dono + comprador de um conjunto T4+ **Lendário**: toda peça de tier 4, 5 e 6 sai de graça (continua pedindo o nível da receita: 50 / 70 / 90) e nasce Lendária; joga como PS (sem material em falta, só caça onde há XP) |
| **PB4** | o mesmo comprador, mas só do conjunto **T4** (T5 e T6 ele forja como todo mundo) |

"Antes" = o jogo no commit anterior à rodada (cópia congelada do `HEAD`); "depois" = o jogo com os 4 commits da rodada e os eventos ligados. Seis seeds por política, mediana (mín-máx). O +5,5 da revisão veio do script dela (que forçava a raridade em toda forja, de qualquer tier); aqui o comprador só recebe Lendária nas peças de tier 4 em diante, e o mesmo experimento no jogo de antes dá +4,1 contra o guloso.

### 1. Limites de cunhagem (commit `fix(server): minting limits close the bot gap`)

Fonte única: `supabase/functions/_shared/items/bounds.ts` (a tabela comentada está em `MARKET_FOUNDATION.md`).

| Limite | Antes | Depois |
| --- | --- | --- |
| Mortes de chefe pagas por dia (balde, parcial) | 200 | **15** |
| Únicos certificados por dia (Caça + chefes) | 12 | **2** |
| Ouro que vira Bolsa por dia | 10 000 (capacidade 100 000) | **3 000** (capacidade = a maior Bolsa, 20 000: uma semana de economia) |

Produção diária de um bot que edita o save e pede ao servidor o máximo (Sorte Grande declarada: 1,25 no chefe, 1,5 na Caça; chefes de profundidade, a chance mais alta, 6,25%; zona 3 ou 4 a cada hora do dia, 385 sorteios por hora):

| Por conta e por dia | Antes | Depois |
| --- | --- | --- |
| Únicos esperados dos chefes | 200 x 6,25% = **12,5** | 15 x 6,25% = **0,94** |
| Únicos esperados da Caça | 385 x 24 x 2 x 2,4e-5 x 1,5 = 0,67 | 385 x 24 x 2 x 8e-6 x 1,5 = 0,22 |
| Únicos certificados (teto duro, atômico no banco) | **12** | **2** |
| Ouro em Bolsas | **10 000** | **3 000** |

Um herói honesto não chega perto: faz 10 corridas grátis por dia e encontra cada chefe de bioma no máximo uma vez por corrida; ganha de 1 000 a 3 300 de Ouro por dia (quadro do item 4). O que passa de 15 mortes de chefe por dia não rola único (concessão parcial, o excesso é marcado `BOSS_KILLS_EXCESS`), e o `BOUNDS.bossesPerDay` (200) da auditoria de progresso continua valendo para o contador do jogo, que é outra coisa. Três testes novos em `items.test.ts` travam os três números e o teto de 2 únicos (e dois testes do cliente, `itemActions.test.ts`, passaram a esperar a recusa do teto).

### 2. Zonas pedem nível; os sub-níveis da zona 4 pagam XP e pedem CP (commit `balance: zones need hero level and late gear matters again`)

- **Nível do herói para abrir:** zona 3 (Fenda) **nível 40**, zona 4 (Abismo) **nível 60**, além do andar (51 e 76). A zona continua "descoberta" pelo andar (`save.unlockedHuntingZones`); começar uma caça, listar o que se caça, as receitas do Elixir (que dependem da melhor zona aberta) e os materiais que um pedido pode pedir passam a perguntar `isZoneOpen(zona, andar, nível)`. A tela de Caça diz "Destrava no Andar 76 e no nível 60".
- **Sub-níveis da zona 4:** cada sub-nível acima do 1 paga **+2% de XP de Caça** (+18% no 10; vale o sub-nível do inimigo derrotado, promoção incluída). O herói só é **promovido** ao sub-nível N com CP >= `CP recomendado da profundidade x 1,18^(N-1)`; o contador de vitórias continua andando e a tentativa espera, sem gastar luta.
- **Por que uma porta de CP e não lutas mais duras:** a primeira tentativa foi fazer o inimigo da zona 4 crescer mais depressa por sub-nível (dano x 24 no 10). Falhou: a promoção acontece com **uma** vitória no teste, e um herói promovido por sorte a um nível que não vence fica preso nele (o jogo não rebaixa), com XP perto de zero (medido: nível 61 parado do dia 30 ao 60). A porta de CP é determinística, aparece na tela ("Para subir ao próximo nível desta zona você precisa de N CP") e as lutas ficam como estavam.

CP exigido por sub-nível (arredondado) e o sub-nível que cada herói da escada alcança no Profundo (CP da escada de `npm run sim:sublevels`: nível 62 a 90, peças comuns salvo quando diz Lendária, sem gemas):

| Sub-nível | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| CP no Raso | 1 896 | 2 238 | 2 640 | 3 116 | 3 676 | 4 338 | 5 119 | 6 040 | 7 128 |
| CP no Denso | 2 181 | 2 573 | 3 036 | 3 583 | 4 228 | 4 989 | 5 887 | 6 946 | 8 197 |
| CP no **Profundo** | 2 465 | 2 909 | 3 432 | 4 050 | 4 779 | 5 639 | 6 654 | 7 852 | 9 266 |

| Herói | CP | Sub-nível no Profundo |
| --- | --: | --: |
| T4 +8 comum | 2 941 | 3 |
| T4 +8 Lendário | 4 686 | 5 |
| T5 +0 comum | 3 260 | 3 |
| T5 +8 comum | 5 330 | 6 |
| T5 +8 Lendário | 8 720 | 9 |
| T5 +12 Lendário | 9 719 | 10 |
| T6 +0 comum | 5 022 | 6 |
| T6 +8 comum | 8 265 | 9 |
| T6 +8 / +12 Lendário | 13 279 / 14 719 | 10 |

- **XP base da zona 4: 13 000 → 10 000 por hora.** Com o bônus de até +18% o topo (11 800) fica 9% abaixo do que a zona pagava, e só quem tem o equipamento chega lá. Sem a redução o guloso passava de 95 no dia 60 e o comprador ficava em 99 (medido com 13 000: PG 95,0, PB 99,3).
- **Servidor:** `xpPerHourAt(andar, nível)` e `burstXp` olham o nível do snapshot novo (a zona 4 só conta com nível 60); `huntXpFactor` 1,902 → 2,244 (o fator dos +18%); o item server recusa um único de zona cuja idade mínima da conta (andar **e** nível) ainda não passou. `levelPace` e `floorPace` agora seguem a seed mais rápida **de qualquer política do dono, comprador incluído** (antes só o dono comum), `floorCapByLevel` a partir do nível 50 é o último andar. Tabelas regeneradas (`npm run season:tables`, `item:tables`).

### 3. O comprador (o número que a revisão queria baixar)

Nível do herói (posição = nível + fração) no fim do dia, mediana de 6 seeds:

| Política | Dia 14 antes → depois | Dia 30 | Dia 45 | Dia 60 | Mín-máx no dia 60 (depois) |
| --- | --- | --- | --- | --- | --- |
| A (sem Passe) | 46,7 → 46,7 | 56,7 → 56,6 | 66,4 → 63,1 | 73,3 → **70,8** | 70,5-71,2 |
| P | 50,8 → 51,1 | 64,9 → 63,3 | 75,1 → 73,5 | 84,9 → **82,7** | 79,2-84,4 |
| PS (esperto, forja) | 50,8 → 51,1 | 64,6 → 63,3 | 76,2 → 74,8 | 87,8 → **84,9** | 82,1-86,1 |
| PG (guloso) | 50,8 → 51,1 | 67,8 → 63,3 | 83,4 → 77,7 | 94,7 → **89,0** | 87,5-90,3 |
| PB4 (compra o T4) | 52,9 → 52,2 | 70,8 → 65,4 | 83,2 → 77,4 | 94,0 → **88,7** | 88,2-89,7 |
| PB (compra T4+) | 58,9 → 54,5 | 76,9 → 70,6 | 89,4 → 83,6 | 98,6 → **93,5** | 93,4-94,3 |

Quanto o comprador está à frente (mediana da diferença na mesma seed):

| Comprador contra... | Dia 14 | Dia 30 | Dia 45 | Dia 60 antes → **depois** |
| --- | --- | --- | --- | --- |
| PB (T4+) contra PG | 9,2 → 3,2 | 9,3 → 7,7 | 6,1 → 6,0 | 4,1 → **4,6** |
| PB (T4+) contra PS | 9,2 → 3,2 | 12,3 → 7,7 | 13,1 → 9,2 | 10,8 → **8,6** |
| PB4 (só T4) contra PS | 2,3 → 1,1 | 6,8 → 2,2 | 7,2 → 3,1 | 5,6 → **3,5** |
| PB4 (só T4) contra PG | 2,3 → 1,1 | 3,5 → 2,2 | -0,6 → -0,1 | -1,1 → **0,1** |

- **Quem fica entre 85 e 90:** a mediana dos três donos que não compram (P 82,7, PS 84,9, PG 89,0) é **84,9**; o mais rápido de todos é um comprador com **94,3** (meta <= 95) e **ninguém chega ao 100** (antes: 97 a 99 para o comprador, 97,8 para o guloso). O jogador sem Passe termina no 70,8 (antes 73,3: a zona 4 abre no nível 60, dia 41 em vez de 31).
- **Meta de +2 a +3 do dono: atingida só para quem compra o conjunto T4** (PB4 contra o mesmo jogador esperto sem compra: +3,5, antes +5,6). **Quem compra T4, T5 e T6 Lendários continua +8,6 à frente do esperto que forja** (antes +10,8) e **+4,6 do guloso** (antes +4,1). Não consegui baixar isso com as alavancas pedidas, e o motivo está medido:
  - O que dá vantagem ao comprador não é o XP por hora na zona 4 (depois do dia 30 ele e o guloso fazem 313 a 318 mil XP por dia): é o **tempo**. Quem não compra passa de 4 a 10 horas por dia minerando, cortando e caçando material (P no dia 15 a 21: 10,5 h de Caça e 9,5 h de coleta; o comprador: 20 h de Caça). Essa diferença de horas de Caça nos primeiros 30 dias vira 4 a 5 níveis no dia 60.
  - Os portões de nível fizeram o que a revisão esperava na hora de abrir a zona 4 (o comprador abria no **dia 11,5**, agora no **dia 21**; o guloso no 22,5, agora no 27,5) e cortaram a vantagem do comprador de T4+ no dia 30 de +12,3 para +7,7 sobre o PS; mas o comprador chega ao nível 60 seis dias antes porque caça 20 h por dia desde a zona 3, e o portão de nível não segura isso.
  - Variações testadas com 4 seeds (comprador contra guloso no dia 60): portão da zona 3 no nível 50: +4,6; XP da zona 3 de 6 000 para 5 000: +4,8; XP da zona 4 de 10 000 para 9 500: +3,9 (e tudo abaixo de 1 a 3 níveis); nenhuma moveu o resultado, porque depois do dia ~30 comprador e guloso caçam a mesma zona pelas mesmas horas: a diferença é a vantagem acumulada antes.
  - O bônus por sub-nível (até +18%) vale cerca de 1,7 nível (estimativa: ~9% de XP de diferença médio sobre ~10 milhões de XP) da diferença do comprador de T4+ contra o guloso (o comprador chega ao sub-nível 8 no dia 30, o guloso ao 3). É o preço de "o equipamento depois do T4 voltar a importar para o XP". Quem forja (PS) chega ao sub-nível 9 no dia 45 e ao 10 no 60.
  - Alternativas que **não** fiz (a decidir pelo dono): (1) queda do XP por hora da zona 4 acima do nível ~80 (comprime o topo, mas tira a corrida dos mais rápidos); (2) tornar o material mais barato em tempo (comprar material não é o mesmo problema: o limite é o tempo de coleta); (3) liberar as peças compradas só a partir do nível da receita **no equipar** (já é verdade na auditoria: `GEAR_BELOW_GATE` rejeita a peça acima do nível do herói, mas o jogo não impede de equipar; a simulação já respeita o nível).

### 4. Bolsas de Ouro, Elixir do Conhecimento e únicos (commit `balance: pouches, elixir and uniques`)

- **Bolsas:** 10 000 / 50 000 / 100 000 → **2 000 / 5 000 / 20 000** (a mesma taxa de 10%, 5% com o Passe, 3 por dia; os ícones continuam pequena/média/grande). O dono comum junta o Ouro de uma Bolsa grande (20 mil + 5%) no dia **23,5** (antes a pequena de 10 mil só no dia 22 e as outras nunca):

| Dono, mediana | Ouro na mão d30 / d45 / d60 antes → depois | 1º dia com Ouro para a Bolsa P / M / G (face + 5%) antes → depois |
| --- | --- | --- |
| P | 25 222 / 18 007 / 24 516 → 33 680 / 20 273 / 14 880 | 22 / nunca / nunca → **12 / 14 / 23,5** |
| PG | 25 533 / 35 922 / 39 787 → 33 680 / 29 893 / 29 736 | 22 / nunca / nunca → 12 / 14 / 23,5 |
| A (sem Passe) | 14 595 / 22 292 / 22 903 → 6 625 / 30 740 / 17 703 | 29,5 / nunca / nunca → 14 / 16,5 / 33,5 |

- **Saves antigos:** uma vez, ao carregar (`pouchFacesV2`, `migratePouchFaces`), as Bolsas **sem certificado** (feitas offline ou antes dos certificados) viram **Ouro pelo valor de face antigo** (10 000 / 50 000 / 100 000: ninguém perde nada; o Ouro não conta como ganho). As **certificadas** continuam Bolsas, com o certificado na lista `legacyPouchCerts`: ao abrir, pagam o valor de face em que foram cunhadas, e o mercado aceita certificado de qualquer das duas gerações (`pouchFaceMatches`). Escolhi isto em vez de mapear para as faces novas (não existe mapeamento exato: 10 000 = 5 x 2 000, 50 000 não é múltiplo de 20 000...) e em vez de converter as certificadas (precisaria queimar o certificado no servidor durante o carregamento). Testado em `goldPouchFaces.test.ts` (6 testes).
- **Elixir do Conhecimento:** custo em Ouro 20 / 35 / 50 / 65 → **77 / 135 / 192 / 250** (tier 4 = 250, os outros na mesma proporção). Um dono que o mantém ligado faz 36 a 56 por temporada e gasta **9 000 a 14 250 de Ouro** com ele (antes cerca de 2 700 no P); o dono não fica mais com 25 a 40 mil sem uso (mão no dia 60: 14 880 a 29 736, antes 24 516 a 39 787).
- **Únicos por jogador até o dia 60** (média; máximo entre parênteses; Caça + chefes da Masmorra):

| Política | Antes | Depois |
| --- | --- | --- |
| A | 3,8 (6) | **1,0 (2)** |
| P | 6,7 (13) | **3,5 (6)** |
| PS | 7,0 (10) | 3,0 (6) |
| PG | 8,2 (10) | 4,3 (8) |
| PB | 11,2 (15) | 4,7 (7) |

  Chances por sorteio: zona 1 0,000015 → **0,000006**, zona 2 0,000014 → **0,000006**, zona 3 0,000024 → **0,000008**, zona 4 0,000024 → **0,000008** (o número do dono). **Meta de 1 a 2 por jogador: cumprida para o jogador sem Passe (1,0) e não cumprida para o dono, que caça 1,8 a 2,2x mais horas por dia (3,0 a 4,7; o guloso, que fica na zona 4 desde o dia 27, 4,3).** O que resta vem quase todo da zona 4 (1,5 a 2,3 por dono, medido com as chances anteriores às últimas); cortar a zona 4 para 0,000004 deixaria os donos em 2 a 3,5. Os únicos de tier alto dão CP, então o dono com sorte (máximo 6 a 8) sai na frente: o corte reduz a variância além da média.

### 5. Eventos da Liga (commit `feat: League events from day 25`)

Calendário no relógio do **servidor** (`league_reset_at()` + horas fixas; `src/game/leagueEvents.ts`; o build offline não tem Liga e não tem eventos), um evento por vez, **um dia de descanso entre dois**, herói e profissão alternando, nunca o mesmo evento duas vezes seguidas, a Corrida Final nos 5 últimos dias.

| # | Dias da Liga | Evento | Tipo | Duração | O que faz |
| --: | --- | --- | --- | --: | --- |
| 1 | 25-26 | Invasão de Monstros | herói | 48 h | Ondas que crescem: +1% de XP de Caça a cada 50 lutas vencidas seguidas (até +10%); a cada 100 vitórias seguidas o inimigo tem +3% de vida e dano (até +30%); uma derrota termina a onda |
| 2 | 28 | Febre da Mineração | profissão | 24 h | +25% de minério por sessão de Mineração (e de XP de Mineração) |
| 3 | 30-31 | Caçada ao Alvo | herói | 48 h | A cada 300 lutas vencidas aparece um alvo (2x vida, 1,5x dano) que só quem tem o poder derrota; ganha +8% de XP de Caça por 1h30 |
| 4 | 33-35 | Semana das Profissões | profissão | 72 h | O jogador escolhe UMA profissão (Home, painel "Eventos"): +25% de XP nela; a escolha é final para a semana |
| 5 | 37-38 | Corrida da Masmorra | herói | 36 h | Cada chefe da Masmorra derrotado paga 120 de Ouro e +8% de XP de Caça por 4 h |
| 6 | 40-41 | Festival dos Ofícios | profissão | 48 h | +15% de XP de profissão em Mineração, Lenhador e Horta |
| 7 | 43 | Grande Entrega | herói | 24 h | Cada pedido recebido paga +10% de XP de Caça por 3 h (o pedido continua gastando os materiais dele: a escolha é entregar ou forjar) |
| 8 | 45 | Febre da Mineração | profissão | 24 h | igual ao nº 2 |
| 9 | 47 | Fenda Temporal | herói | 24 h | Os inimigos batem 25% mais forte; sequência de lutas vencidas na caça automática: +1% a cada 25 (até +10%) |
| 10 | 49-51 | Semana das Profissões | profissão | 72 h | igual ao nº 4 |
| 11 | 53-54 | Invasão de Monstros | herói | 48 h | igual ao nº 1 |
| 12 | 56-60 | Corrida Final | final | 5 dias | No dia em que o jogador coleta as 4 metas diárias: +5% de XP de Caça por 24 h |

- **Limites:** todos os bônus de XP de Caça dos eventos juntos valem **no máximo +15%** (`EVENT_XP_CAP`, aplicado por luta ganha dentro da simulação); os de profissão no máximo **+25%**. Nada dá XP fora da Caça (o herói só ganha XP caçando) e nada depende de ter equipamento comprado, a não ser o alvo, que um herói sem o CP não derrota (e perder só custa aquela luta).
- **Efeito medido** (mesmas seeds, eventos desligados contra ligados, nível no dia 60): A -0,1, P +0,6 (ruído de sorteio), PS +0,1, PG **+0,4**, PB **+0,4**. Os eventos de herói somam ~0,4 nível ao herói que caça o dia inteiro e **não aumentam a diferença do comprador** (PB contra PG: +4,5 sem eventos, +4,6 com).
- **Anúncio no jogo:** painel "Eventos" na Home (componente novo `src/components/events/EventsPanel.tsx`): o evento em andamento (nome, linha, tempo restante, escolha da profissão da Semana), o próximo com a contagem regressiva e os bônus de evento ainda ativos; **antes da Liga** mostra o calendário como "na Liga, dias 25 a 26...".
- **Portal:** `public.league_events()` (migration `0014_economy_events.sql`, **não aplicada**; rollback e plano de testes SQL no fim do arquivo) devolve as 12 linhas (slot, evento, tipo, dias da Liga, horas, início e fim; início e fim são nulos antes da Liga). O teste `migration0014.test.ts` compara cada célula do SQL com a tabela do jogo e com a cópia do servidor (`progress/tables.ts` `EVENT_SLOTS`, gerada por `npm run season:tables`).
- **Servidor (auditoria de progresso):** o limite de XP por hora de Caça soma `eventHeroBonus` (0,15) **só nas horas do intervalo em que um evento de herói rodava**; o de profissão soma `eventProfessionBonus` (0,25) só nas horas de evento de profissão; a recompensa atrasada ganha a mesma margem. `EvalInput.leagueEpochMs` vem de `league_reset_at()`. Sem Liga, sem folga.

### 6. Limites da auditoria de progresso, antes e depois

| Número | Antes | Depois |
| --- | --- | --- |
| `xpPerHour` (teórico) | 25 000 (`season:bounds` recalcula 23 660) | 25 000 (`season:bounds` recalcula **21 476**: 10 000 x 1,18 x 1,3 x 1,12 x 1,25) |
| `huntXpFactor` | 1,902 | **2,244** |
| `xpPerHourAt` / `burstXp` | só o andar | andar **e nível** (zona 3: 40, zona 4: 60) |
| folga de evento | - | +15% (herói), +25% (profissão), só nas horas do evento |
| `levelPace` (nível, dia) | 24:2 28:3 44:7 51:14 60:24 68:30 75:40 79:45 88:60 100:80 | 24:2 28:3 44:7 51:12 **60:19** 68:26 **75:34** 79:38 **88:50** 92:56 100:72 |
| `floorPace` (andar, dia) | 8:1 25:2 50:9 75:16 90:42 100:53 | 8:1 25:2 50:9 **75:11 90:26 100:39** |
| `floorCapByLevel` | 50:84 57:91 63:94 70:100 | 50:100 57:100 63:100 70:100 |
| Cunhagem | ver o item 1 | ver o item 1 |

A tabela de ritmo agora é a da seed mais rápida entre todas as políticas legítimas do dono (inclui o comprador): o jogador que abre a zona 4 no nível 60 no dia 19 não é mais "sinalizado" por estar à frente do dono comum.

### 7. O que não foi verificado e o que o dono pode contestar

- **O comprador:** a meta de +2 a +3 só é cumprida para quem compra o conjunto T4 (ver o item 3). O comprador de T4+T5+T6 é um limite superior (as peças saem de graça e Lendárias); se a loja vender poucas peças T5/T6 Lendárias, o número real fica entre PB4 e PB.
- **Os eventos não foram jogados com uma pessoa nem no navegador** (o painel foi renderizado em teste de servidor, nos dois idiomas; nenhum clique foi visto). O jogador simulado só escolhe a Horta na Semana das Profissões e não faz "escolha de material" na Grande Entrega (ele coleta o pedido que já tinha). O dano de +25% da Fenda e o alvo (2x, 1,5x) foram calibrados só em teste de unidade, não em partida longa.
- **Migrações 0014 não aplicada** (nenhuma foi); o SQL só foi lido por teste estático.
- **Únicos:** a meta de 1 a 2 por jogador só vale para o jogador sem Passe (ver o item 4); o dono de Passe fica em 3 a 4,7. A chance da zona 4 é a que o dono pediu (0,000008).
- **Dono comum a 82,7 no dia 60:** abaixo da faixa de 85 a 90; o esperto (PS, 84,9) e o guloso (89,0) ficam nela. Subir o XP da zona 4 para levar o P a 85 faz o comprador passar de 95.
- **Jogador sem Passe:** perde 2,5 níveis (73,3 → 70,8) no dia 60 porque a zona 4 só abre com o nível 60 (dia 41, antes 31). É o preço do portão; o ranking da Liga é só de quem tem o Passe.
- O painel de eventos ocupa a coluna lateral da Home; a tela de Caça ganhou duas linhas de texto (XP por sub-nível e CP do próximo nível). O visual foi deixado para quem cuida do estilo.

## Rodada 23 — materiais negociáveis (2026-10-16)

Decisão do dono (2026-10-16): quem compra continua à frente (sem espera no mercado, o item comprado serve na hora), e **todo material de receita passa a existir em duas variantes**: o **normal** (não negociável, como sempre) e uma **queda ocasional do MESMO material que pode ser vendida no mercado de jogadores** ("negociável"). Em uso são idênticos (contam como o mesmo material em toda receita, refino, pedido e venda ao mercador); a única diferença é o mercado. O objetivo é deixar os jogadores trocarem material sem inundar o mercado e, de quebra, poupar tempo de coleta de quem não compra. "Vale até pro mercador": os mercadores NPC aceitam a variante negociável **pelo mesmo preço** do material normal (sem prêmio, para não inflar o Ouro).

O código está descrito em `docs/MARKET_FOUNDATION.md` (servidor), `docs/MARKET_SOLANA.md` (lotes no mercado) e `docs/INVENTORY.md` (as duas pilhas). Esta rodada mexe em **oferta**, não em nenhum número do jogo: o que muda é que 3% a 8% das unidades coletadas passam a poder ser vendidas.

### 1. Quais materiais, e quanto

Os **32** materiais que uma coleta produz: os 5 minérios, as 5 madeiras, as 12 plantas da Horta e os 10 drops da Caça. Barras, cabos, Pó de Refino e os materiais da loja (aço, couro, essência, escamas) **nunca** têm variante negociável: são feitos ou comprados, não coletados (uma unidade negociável gasta numa fornalha vira uma barra comum).

**Uma tabela só** (`supabase/functions/_shared/materials/rates.ts`, `TRADEABLE_CHANCE`): a chance de cada unidade coletada ou dropada ser negociável.

| Classe | Chance | Materiais |
| --- | ---: | --- |
| comum | **3%** | minério de cobre, minério de ferro, madeira comum, carvalho, erva medicinal, erva energética, cardo de ferro, capim veloz, farrapo de couro, fragmento de osso |
| incomum | **5%** | minério de prata, minério de ouro, ébano, madeira élfica, raiz amarga, flor dourada, cogumelo rubro, sálvia prateada, garra demoníaca, sangue concentrado, estilhaço da Fenda |
| rara | **8%** | obsidiana bruta, madeira ancestral, flor carmesim, lírio lunar, orquídea do crepúsculo, raiz anciã, núcleo demoníaco, cristal corrompido, chifre do demônio, coração de sangue, **tutano abissal** |

O tutano abissal é uma queda incomum da última zona, mas o dono o conta entre as raras ("cristais, corações, tutano"): fica em 8% (a única exceção, `RATE_EXCEPTIONS`).

### 2. Como a oferta foi medida

`npm run sim:long` com `LONG_SCEN=A,P,PM,PW,PG,XPM LONG_DAYS=60 LONG_SEEDS=3` (o jogador comum sem Passe; o dono do Passe; os três especialistas com Passe, em minério, madeira e Horta; e o minerador que visita a cada 6 horas) e depois `npm run sim:materials`, que lê as execuções e multiplica o que cada cenário **coletou de cada material** (a coluna "produzido" do livro-caixa do simulador) pela chance do material. As chances são esperanças, não sorteios: o servidor sorteia de verdade (Binomial por unidade, `secureRng`).

A população usa uma mistura declarada: **80% jogador comum (A), 15% dono do Passe (P), 5% especialistas (PM, PW e PG, 1,7% / 1,7% / 1,6%)**. O leitor pode trocar a mistura com `SUPPLY_MIX="A:0.9,P:0.1" npm run sim:materials`. Os totais crescem linearmente com o número de jogadores (a coluna "por jogador" é a mesma nas três populações): **a oferta não depende de haver ou não demanda**.

### 3. Um jogador: o que ele encontra de negociável

| Cenário | Dia 7 | Dia 30 | Dia 60 | Parcela das unidades coletadas que é negociável (dia 60) |
| --- | ---: | ---: | ---: | ---: |
| **A** (comum, sem Passe) | 79 | 1 027 | **2 224** | 4,5% |
| **P** (dono do Passe) | 244 | 2 092 | **4 615** | 4,6% |
| PM (especialista em minério, Passe) | 283 | 2 701 | 6 110 | 7,8% |
| PW (especialista em madeira, Passe) | 283 | 2 704 | 6 113 | 7,8% |
| PG (especialista em Horta e Caça, Passe) | 319 | 2 238 | 5 048 | n/d |
| XPM (minerador que visita a cada 6 h) | 464 | 3 420 | 7 526 | 7,9% |

(Unidades negociáveis esperadas, somadas em todos os materiais.) A parcela é pequena por unidade (3% a 8%), mas **o jogo coleta muito**: o jogador comum junta ~49 000 unidades em 60 dias, então 4,5% são ~2 200 unidades. Os especialistas puxam a média para cima porque coletam obsidiana e madeira ancestral (8%): **97% das 7 526 do XPM são obsidiana**.

### 4. O servidor: quantas unidades negociáveis existem

Mistura de 80% A, 15% P e 5% especialistas. Totais (esperados) de **todos os materiais**:

| Jogadores | Até o dia 7 | Até o dia 30 | Até o dia 60 | Por jogador (dia 60) |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 11 487 | 126 297 | 275 995 | 2 760 |
| 1 000 | 114 866 | 1 262 973 | 2 759 952 | 2 760 |
| 10 000 | 1 148 657 | 12 629 734 | 27 599 518 | 2 760 |

Os maiores por material (por jogador, dia 60): sangue concentrado 480, garra demoníaca 438, fragmento de osso 338, farrapo de couro 260, núcleo demoníaco 148, obsidiana 150 (puxada pelos especialistas), cristal corrompido 126, tutano abissal 103; os mais escassos: coração de sangue 19, chifre 12, cogumelo rubro 0,3, raiz anciã 0,006. As tabelas completas, **por material**, estão no fim desta rodada (itens 8 e 9).

### 5. O teto diário contra um bot que edita o save (o limite do servidor)

Um bot que edita o save pode *relatar* o máximo que o jogo permite, o dia inteiro. O servidor limita assim (`materials/bounds.ts`, `MATERIAL_BOUNDS`):

1. **Tempo.** Caça, mineração e corte de madeira dividem **um** relógio do herói (um herói faz uma coisa por vez): 1 hora por hora do relógio do servidor, até 10 h (o teto do Passe). A Horta tem o relógio das parcelas (6 parcelas, a velocidade máxima das duas maestrias). Um relato com mais tempo que o balde guarda é pago só pelo tempo que o balde guarda.
2. **Unidades por hora.** Cada material tem um teto por hora (Caça: as rolagens econômicas máximas x a chance x a melhor profundidade x o melhor subnível x Passe x Faro x Isca; coleta: poder máximo da profissão x todos os bônus de rendimento x o maior evento; Horta: o rendimento máximo de **uma parcela** da planta). Um relato muito acima do teto é cortado e a conta é marcada para a auditoria. Os testes rodam o motor real (uma hora de Caça nos três estágios, mineração e corte no nível 75 com Passe) e exigem que **nunca** passe do teto.
3. **Teto diário por material = 2x o melhor dia do jogador honesto rápido x a chance** (mínimo 3). Um balde atômico (o `item_take_tokens` do servidor de itens, agora com a opção `whole`: nunca guarda fração de unidade) rende teto/24 por hora e guarda um dia. O bot que relata o máximo o dia inteiro recebe **no máximo o teto por dia** (mais um dia inicial no começo da conta), que é ~2x o que o jogador honesto mais rápido acha. Passar do teto marca a conta (`LIMIT_MATERIAL_DAY`), que então não consegue anunciar.

Tabela dos tetos (o "melhor dia" é a mediana, entre as seeds, do melhor dia do cenário mais rápido):

| Material | Chance | Melhor dia do jogador honesto rápido (unidades) | Negociáveis nesse dia (esperado) | Teto diário do servidor |
| --- | ---: | ---: | ---: | ---: |
| iron | 3% | 645 | 19.3 | 39 |
| copper | 3% | 663 | 19.9 | 40 |
| silver | 5% | 941 | 47.1 | 95 |
| gold_ore | 5% | 1 076 | 53.8 | 108 |
| obsidian | 8% | 1 870 | 149.6 | 300 |
| leather_scrap | 3% | 1 149 | 34.5 | 69 |
| demon_claw | 5% | 1 199 | 60.0 | 120 |
| demon_core | 8% | 291 | 23.3 | 47 |
| bone_fragment | 3% | 1 237 | 37.1 | 75 |
| concentrated_blood | 5% | 1 248 | 62.4 | 125 |
| corrupted_crystal | 8% | 195 | 15.6 | 32 |
| rift_shard | 5% | 301 | 15.1 | 31 |
| fiend_horn | 8% | 29 | 2.3 | 5 |
| abyssal_marrow | 8% | 194 | 15.5 | 32 |
| blood_heart | 8% | 42 | 3.4 | 7 |
| common_herb | 3% | 12 | 0.4 | 3 |
| energy_herb | 3% | 24 | 0.7 | 3 |
| uncommon_root | 5% | 16 | 0.8 | 3 |
| crimson_mushroom | 5% | 6 | 0.3 | 3 |
| rare_flower | 8% | 6 | 0.5 | 3 |
| iron_thistle | 3% | 12 | 0.4 | 3 |
| gold_blossom | 5% | 6 | 0.3 | 3 |
| swift_grass | 3% | 12 | 0.4 | 3 |
| moon_lily | 8% | 12 | 1.0 | 3 |
| silver_sage | 5% | 12 | 0.6 | 3 |
| dusk_orchid | 8% | 6 | 0.5 | 3 |
| elder_root | 8% | 2 | 0.2 | 3 |
| common_wood | 3% | 554 | 16.6 | 34 |
| oak_wood | 3% | 618 | 18.5 | 38 |
| ebony_wood | 5% | 811 | 40.6 | 82 |
| elven_wood | 5% | 1 076 | 53.8 | 108 |
| ancient_wood | 8% | 1 435 | 114.8 | 230 |

### 6. O que não foi verificado e o que o dono pode contestar

- **A oferta é grande em números absolutos.** 3% a 8% é pouco *por unidade*, mas o jogo coleta dezenas de milhares de unidades: o jogador comum acha ~2 200 negociáveis em 60 dias (~37 por dia), o dono do Passe ~4 600, o especialista em minério ~6 100 (quase tudo obsidiana). Com 1 000 jogadores são ~2,8 milhões de unidades em 60 dias. Se o mercado inundar (preço dos materiais baixos indo a quase zero), a alavanca é **uma tabela só**: com 1% / 2% / 3% a oferta cai a um terço do que está acima, linearmente. Esta rodada **não** simulou a demanda, então não diz qual preço o mercado vai achar.
- **Amostra pequena:** 3 seeds por cenário, 60 dias; as chances são esperanças. A mistura de jogadores (80 / 15 / 5) é uma suposição minha, não um dado: troque-a com `SUPPLY_MIX`.
- **Tetos diários:** vêm do melhor dia dos cenários simulados; uma pessoa que joga de um jeito que o simulador não joga (por exemplo, visitas a cada hora com Elixir de Coleta o tempo todo) pode passar de 2x o "honesto rápido" e ser cortada. A margem é `MARGIN` (2x) em `items/bounds.ts`.
- **As unidades negociáveis não vão para o Baú** (decisão minha): são para vender, e o Baú ficaria cheio de coisas que valem dinheiro sem aparecer no filtro "Negociável". Elas ocupam espaço da mochila (pilha própria). Se você quiser guardá-las, é uma mudança pequena em `stash.ts` (um campo `tradeable` no `StashState` e o mesmo balanço no servidor).
- **A venda a um NPC sempre pergunta**, não só na primeira vez (a confirmação de receita/pedido/refino é uma vez só): vender a unidade negociável ao mercador por 1 Ouro é quase sempre um erro.
- **Lotes inteiros:** não existe compra parcial. Um lote tem de 1 a 10 000 unidades de um material; o preço é por unidade com até 6 casas (0,000001 SOL); o lote inteiro vale de 0,001 a 50 SOL.
- **O que ficou sem ser verificado:** o SQL (`0015_tradeable_materials.sql`) e as funções (Deno) **nunca foram executados**; só testes estáticos e simulações em memória que seguem a máquina de estados da SQL passo a passo. Nenhum navegador real nem carteira real foi usado; as capturas de tela são da tela real do jogo com uma API falsa.

### 7. Tabelas por jogador (todos os materiais)

Unidades **coletadas** (o que o jogo produziu) e **negociáveis esperadas** (coletadas x chance), mediana entre as seeds, no dia 7, 30 e 60.

#### Um jogador, cenário A
| Material | Chance | Coletado d7 | Coletado d30 | Coletado d60 | Negociáveis d7 | Negociáveis d30 | Negociáveis d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| iron | 3% | 88 | 465 | 573 | 2.6 | 13.9 | 17.2 |
| copper | 3% | 211 | 389 | 720 | 6.3 | 11.7 | 21.6 |
| silver | 5% | 0 | 1 575 | 2 030 | 0.0 | 78.8 | 101.5 |
| gold_ore | 5% | 0 | 292 | 1 223 | 0.0 | 14.6 | 61.2 |
| obsidian | 8% | 0 | 0 | 312 | 0.0 | 0.0 | 25.0 |
| leather_scrap | 3% | 525 | 5 475 | 7 929 | 15.8 | 164.3 | 237.9 |
| demon_claw | 5% | 335 | 5 446 | 8 002 | 16.8 | 272.3 | 400.1 |
| demon_core | 8% | 37 | 1 091 | 1 692 | 3.0 | 87.3 | 135.4 |
| bone_fragment | 3% | 214 | 2 026 | 9 336 | 6.4 | 60.8 | 280.1 |
| concentrated_blood | 5% | 190 | 2 133 | 7 697 | 9.5 | 106.7 | 384.9 |
| corrupted_crystal | 8% | 28 | 322 | 1 248 | 2.2 | 25.8 | 99.8 |
| rift_shard | 5% | 0 | 1 044 | 1 648 | 0.0 | 52.2 | 82.4 |
| fiend_horn | 8% | 0 | 82 | 135 | 0.0 | 6.6 | 10.8 |
| abyssal_marrow | 8% | 0 | 0 | 1 076 | 0.0 | 0.0 | 86.1 |
| blood_heart | 8% | 0 | 0 | 197 | 0.0 | 0.0 | 15.8 |
| common_herb | 3% | 28 | 112 | 196 | 0.8 | 3.4 | 5.9 |
| energy_herb | 3% | 24 | 42 | 96 | 0.7 | 1.3 | 2.9 |
| uncommon_root | 5% | 15 | 38 | 38 | 0.8 | 1.9 | 1.9 |
| crimson_mushroom | 5% | 0 | 0 | 6 | 0.0 | 0.0 | 0.3 |
| iron_thistle | 3% | 8 | 20 | 56 | 0.2 | 0.6 | 1.7 |
| gold_blossom | 5% | 10 | 16 | 22 | 0.5 | 0.8 | 1.1 |
| swift_grass | 3% | 20 | 92 | 164 | 0.6 | 2.8 | 4.9 |
| moon_lily | 8% | 0 | 66 | 234 | 0.0 | 5.3 | 18.7 |
| silver_sage | 5% | 0 | 120 | 132 | 0.0 | 6.0 | 6.6 |
| dusk_orchid | 8% | 0 | 6 | 84 | 0.0 | 0.5 | 6.7 |
| common_wood | 3% | 91 | 269 | 269 | 2.7 | 8.1 | 8.1 |
| oak_wood | 3% | 346 | 346 | 346 | 10.4 | 10.4 | 10.4 |
| ebony_wood | 5% | 0 | 1 554 | 1 554 | 0.0 | 77.7 | 77.7 |
| elven_wood | 5% | 0 | 269 | 1 810 | 0.0 | 13.5 | 90.5 |
| ancient_wood | 8% | 0 | 0 | 338 | 0.0 | 0.0 | 27.0 |
| **total** |  |  |  |  | **79.3** | **1026.8** | **2223.9** |

#### Um jogador, cenário P
| Material | Chance | Coletado d7 | Coletado d30 | Coletado d60 | Negociáveis d7 | Negociáveis d30 | Negociáveis d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| iron | 3% | 137 | 1 086 | 1 740 | 4.1 | 32.6 | 52.2 |
| copper | 3% | 283 | 668 | 2 582 | 8.5 | 20.0 | 77.5 |
| silver | 5% | 286 | 2 334 | 3 402 | 14.3 | 116.7 | 170.1 |
| gold_ore | 5% | 0 | 1 032 | 1 121 | 0.0 | 51.6 | 56.1 |
| obsidian | 8% | 0 | 606 | 2 498 | 0.0 | 48.5 | 199.8 |
| leather_scrap | 3% | 968 | 8 632 | 13 355 | 29.0 | 259.0 | 400.6 |
| demon_claw | 5% | 699 | 8 708 | 13 687 | 35.0 | 435.4 | 684.4 |
| demon_core | 8% | 71 | 1 700 | 2 827 | 5.7 | 136.0 | 226.2 |
| bone_fragment | 3% | 1 242 | 6 632 | 22 220 | 37.3 | 199.0 | 666.6 |
| concentrated_blood | 5% | 1 284 | 6 110 | 19 597 | 64.2 | 305.5 | 979.9 |
| corrupted_crystal | 8% | 195 | 990 | 3 313 | 15.6 | 79.2 | 265.0 |
| rift_shard | 5% | 0 | 1 726 | 2 928 | 0.0 | 86.3 | 146.4 |
| fiend_horn | 8% | 0 | 153 | 256 | 0.0 | 12.2 | 20.5 |
| abyssal_marrow | 8% | 0 | 335 | 2 832 | 0.0 | 26.8 | 226.6 |
| blood_heart | 8% | 0 | 63 | 555 | 0.0 | 5.0 | 44.4 |
| common_herb | 3% | 18 | 66 | 138 | 0.5 | 2.0 | 4.1 |
| energy_herb | 3% | 24 | 24 | 60 | 0.7 | 0.7 | 1.8 |
| uncommon_root | 5% | 31 | 43 | 43 | 1.6 | 2.1 | 2.1 |
| crimson_mushroom | 5% | 0 | 6 | 6 | 0.0 | 0.3 | 0.3 |
| iron_thistle | 3% | 8 | 32 | 80 | 0.2 | 1.0 | 2.4 |
| gold_blossom | 5% | 5 | 23 | 29 | 0.3 | 1.2 | 1.5 |
| swift_grass | 3% | 10 | 106 | 154 | 0.3 | 3.2 | 4.6 |
| moon_lily | 8% | 0 | 102 | 216 | 0.0 | 8.2 | 17.3 |
| silver_sage | 5% | 0 | 48 | 48 | 0.0 | 2.4 | 2.4 |
| dusk_orchid | 8% | 0 | 18 | 96 | 0.0 | 1.4 | 7.7 |
| common_wood | 3% | 63 | 617 | 810 | 1.9 | 18.5 | 24.3 |
| oak_wood | 3% | 365 | 365 | 773 | 10.9 | 10.9 | 23.2 |
| ebony_wood | 5% | 286 | 1 934 | 1 934 | 14.3 | 96.7 | 96.7 |
| elven_wood | 5% | 0 | 1 648 | 2 275 | 0.0 | 82.4 | 113.8 |
| ancient_wood | 8% | 0 | 594 | 1 208 | 0.0 | 47.5 | 96.6 |
| **total** |  |  |  |  | **244.4** | **2092.3** | **4614.9** |

#### Um jogador, cenário PM
| Material | Chance | Coletado d7 | Coletado d30 | Coletado d60 | Negociáveis d7 | Negociáveis d30 | Negociáveis d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| iron | 3% | 365 | 365 | 365 | 10.9 | 10.9 | 10.9 |
| copper | 3% | 63 | 63 | 63 | 1.9 | 1.9 | 1.9 |
| silver | 5% | 1 899 | 1 899 | 1 899 | 95.0 | 95.0 | 95.0 |
| gold_ore | 5% | 1 579 | 1 579 | 1 579 | 79.0 | 79.0 | 79.0 |
| obsidian | 8% | 1 161 | 31 115 | 73 383 | 92.9 | 2489.2 | 5870.6 |
| common_herb | 3% | 8 | 32 | 92 | 0.2 | 1.0 | 2.8 |
| energy_herb | 3% | 24 | 24 | 24 | 0.7 | 0.7 | 0.7 |
| uncommon_root | 5% | 46 | 52 | 52 | 2.3 | 2.6 | 2.6 |
| swift_grass | 3% | 10 | 22 | 58 | 0.3 | 0.7 | 1.7 |
| moon_lily | 8% | 0 | 252 | 564 | 0.0 | 20.2 | 45.1 |
| **total** |  |  |  |  | **283.2** | **2701.0** | **6110.3** |

#### Um jogador, cenário PW
| Material | Chance | Coletado d7 | Coletado d30 | Coletado d60 | Negociáveis d7 | Negociáveis d30 | Negociáveis d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| common_herb | 3% | 8 | 32 | 92 | 0.2 | 1.0 | 2.8 |
| energy_herb | 3% | 24 | 24 | 24 | 0.7 | 0.7 | 0.7 |
| uncommon_root | 5% | 46 | 52 | 52 | 2.3 | 2.6 | 2.6 |
| swift_grass | 3% | 10 | 22 | 58 | 0.3 | 0.7 | 1.7 |
| moon_lily | 8% | 0 | 252 | 564 | 0.0 | 20.2 | 45.1 |
| common_wood | 3% | 63 | 63 | 63 | 1.9 | 1.9 | 1.9 |
| oak_wood | 3% | 365 | 365 | 365 | 10.9 | 10.9 | 10.9 |
| ebony_wood | 5% | 1 899 | 1 899 | 1 899 | 95.0 | 95.0 | 95.0 |
| elven_wood | 5% | 1 579 | 1 579 | 1 579 | 79.0 | 79.0 | 79.0 |
| ancient_wood | 8% | 1 161 | 31 147 | 73 414 | 92.9 | 2491.8 | 5873.1 |
| **total** |  |  |  |  | **283.2** | **2703.6** | **6112.8** |

#### Um jogador, cenário PG
| Material | Chance | Coletado d7 | Coletado d30 | Coletado d60 | Negociáveis d7 | Negociáveis d30 | Negociáveis d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| iron | 3% | 137 | 137 | 228 | 4.1 | 4.1 | 6.8 |
| copper | 3% | 283 | 283 | 291 | 8.5 | 8.5 | 8.7 |
| leather_scrap | 3% | 862 | 7 845 | 19 400 | 25.9 | 235.3 | 582.0 |
| demon_claw | 5% | 594 | 7 615 | 19 592 | 29.7 | 380.8 | 979.6 |
| demon_core | 8% | 60 | 1 575 | 4 216 | 4.8 | 126.0 | 337.3 |
| bone_fragment | 3% | 2 506 | 14 563 | 29 913 | 75.2 | 436.9 | 897.4 |
| concentrated_blood | 5% | 2 611 | 14 768 | 30 898 | 130.6 | 738.4 | 1544.9 |
| corrupted_crystal | 8% | 380 | 2 272 | 4 712 | 30.4 | 181.8 | 377.0 |
| rift_shard | 5% | 0 | 1 675 | 4 459 | 0.0 | 83.8 | 223.0 |
| fiend_horn | 8% | 0 | 151 | 416 | 0.0 | 12.1 | 33.3 |
| common_herb | 3% | 32 | 124 | 244 | 1.0 | 3.7 | 7.3 |
| energy_herb | 3% | 18 | 18 | 18 | 0.5 | 0.5 | 0.5 |
| uncommon_root | 5% | 33 | 37 | 37 | 1.7 | 1.9 | 1.9 |
| rare_flower | 8% | 8 | 54 | 109 | 0.6 | 4.3 | 8.7 |
| moon_lily | 8% | 0 | 180 | 420 | 0.0 | 14.4 | 33.6 |
| elder_root | 8% | 0 | 0 | 5 | 0.0 | 0.0 | 0.4 |
| common_wood | 3% | 63 | 63 | 63 | 1.9 | 1.9 | 1.9 |
| oak_wood | 3% | 137 | 137 | 137 | 4.1 | 4.1 | 4.1 |
| **total** |  |  |  |  | **318.9** | **2238.4** | **5048.4** |

#### Um jogador, cenário XPM
| Material | Chance | Coletado d7 | Coletado d30 | Coletado d60 | Negociáveis d7 | Negociáveis d30 | Negociáveis d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| iron | 3% | 258 | 258 | 258 | 7.7 | 7.7 | 7.7 |
| copper | 3% | 124 | 124 | 124 | 3.7 | 3.7 | 3.7 |
| silver | 5% | 1 744 | 1 744 | 1 744 | 87.2 | 87.2 | 87.2 |
| gold_ore | 5% | 1 945 | 1 945 | 1 945 | 97.3 | 97.3 | 97.3 |
| obsidian | 8% | 3 284 | 39 950 | 90 904 | 262.7 | 3196.0 | 7272.3 |
| common_herb | 3% | 8 | 32 | 92 | 0.2 | 1.0 | 2.8 |
| energy_herb | 3% | 24 | 24 | 24 | 0.7 | 0.7 | 0.7 |
| uncommon_root | 5% | 52 | 52 | 52 | 2.6 | 2.6 | 2.6 |
| swift_grass | 3% | 10 | 22 | 58 | 0.3 | 0.7 | 1.7 |
| moon_lily | 8% | 24 | 294 | 630 | 1.9 | 23.5 | 50.4 |
| **total** |  |  |  |  | **464.4** | **3420.4** | **7526.4** |

### 8. Tabelas do servidor (todos os materiais)

Mistura 80% A, 15% P, 5% especialistas; unidades negociáveis esperadas **no total** até o dia indicado.

#### 100 jogadores
| Material | Negociáveis até o dia 7 | até o dia 30 | até o dia 60 | por jogador no dia 60 |
| --- | ---: | ---: | ---: | ---: |
| iron | 298 | 1 630 | 2 188 | 21.9 |
| copper | 651 | 1 251 | 2 907 | 29.1 |
| silver | 376 | 8 212 | 10 833 | 108.3 |
| gold_ore | 134 | 2 076 | 5 867 | 58.7 |
| obsidian | 158 | 4 959 | 14 974 | 149.7 |
| leather_scrap | 1 737 | 17 401 | 25 971 | 259.7 |
| demon_claw | 1 912 | 28 924 | 43 841 | 438.4 |
| demon_core | 330 | 9 224 | 14 761 | 147.6 |
| bone_fragment | 1 193 | 8 546 | 33 841 | 338.4 |
| concentrated_blood | 1 932 | 14 296 | 47 958 | 479.6 |
| corrupted_crystal | 462 | 3 540 | 12 566 | 125.7 |
| rift_shard | 0 | 5 605 | 9 145 | 91.4 |
| fiend_horn | 0 | 728 | 1 224 | 12.2 |
| abyssal_marrow | 0 | 402 | 10 285 | 102.8 |
| blood_heart | 0 | 76 | 1 927 | 19.3 |
| common_herb | 78 | 308 | 554 | 5.5 |
| energy_herb | 72 | 115 | 261 | 2.6 |
| uncommon_root | 94 | 196 | 196 | 2.0 |
| crimson_mushroom | 0 | 5 | 29 | 0.3 |
| rare_flower | 1 | 7 | 14 | 0.1 |
| iron_thistle | 23 | 62 | 170 | 1.7 |
| gold_blossom | 44 | 81 | 110 | 1.1 |
| swift_grass | 54 | 271 | 469 | 4.7 |
| moon_lily | 0 | 636 | 1 964 | 19.6 |
| silver_sage | 0 | 516 | 564 | 5.6 |
| dusk_orchid | 0 | 60 | 653 | 6.5 |
| elder_root | 0 | 0 | 1 | 0.0 |
| common_wood | 253 | 929 | 1 016 | 10.2 |
| oak_wood | 1 020 | 1 020 | 1 203 | 12.0 |
| ebony_wood | 376 | 7 828 | 7 828 | 78.3 |
| elven_wood | 134 | 2 446 | 9 080 | 90.8 |
| ancient_wood | 158 | 4 949 | 13 597 | 136.0 |
| **total** | **11 487** | **126 297** | **275 995** | **2760.0** |

#### 1 000 jogadores
| Material | Negociáveis até o dia 7 | até o dia 30 | até o dia 60 | por jogador no dia 60 |
| --- | ---: | ---: | ---: | ---: |
| iron | 2 980 | 16 299 | 21 878 | 21.9 |
| copper | 6 505 | 12 510 | 29 071 | 29.1 |
| silver | 3 759 | 82 119 | 108 329 | 108.3 |
| gold_ore | 1 342 | 20 762 | 58 670 | 58.7 |
| obsidian | 1 579 | 49 588 | 149 745 | 149.7 |
| leather_scrap | 17 370 | 174 010 | 259 706 | 259.7 |
| demon_claw | 19 118 | 289 242 | 438 406 | 438.4 |
| demon_core | 3 297 | 92 240 | 147 608 | 147.6 |
| bone_fragment | 11 928 | 85 458 | 338 412 | 338.4 |
| concentrated_blood | 19 319 | 142 959 | 479 576 | 479.6 |
| corrupted_crystal | 4 618 | 35 396 | 125 659 | 125.7 |
| rift_shard | 0 | 56 045 | 91 447 | 91.4 |
| fiend_horn | 0 | 7 277 | 12 244 | 12.2 |
| abyssal_marrow | 0 | 4 020 | 102 848 | 102.8 |
| blood_heart | 0 | 756 | 19 268 | 19.3 |
| common_herb | 777 | 3 077 | 5 536 | 5.5 |
| energy_herb | 717 | 1 149 | 2 607 | 2.6 |
| uncommon_root | 937 | 1 961 | 1 961 | 2.0 |
| crimson_mushroom | 0 | 45 | 285 | 0.3 |
| rare_flower | 10 | 69 | 140 | 0.1 |
| iron_thistle | 228 | 624 | 1 704 | 1.7 |
| gold_blossom | 438 | 813 | 1 098 | 1.1 |
| swift_grass | 535 | 2 707 | 4 688 | 4.7 |
| moon_lily | 0 | 6 364 | 19 640 | 19.6 |
| silver_sage | 0 | 5 160 | 5 640 | 5.6 |
| dusk_orchid | 0 | 600 | 6 528 | 6.5 |
| elder_root | 0 | 0 | 6 | 0.0 |
| common_wood | 2 530 | 9 295 | 10 163 | 10.2 |
| oak_wood | 10 198 | 10 198 | 12 034 | 12.0 |
| ebony_wood | 3 759 | 78 279 | 78 279 | 78.3 |
| elven_wood | 1 342 | 24 462 | 90 805 | 90.8 |
| ancient_wood | 1 579 | 49 488 | 135 971 | 136.0 |
| **total** | **114 866** | **1 262 973** | **2 759 952** | **2760.0** |

#### 10 000 jogadores
| Material | Negociáveis até o dia 7 | até o dia 30 | até o dia 60 | por jogador no dia 60 |
| --- | ---: | ---: | ---: | ---: |
| iron | 29 804 | 162 989 | 218 776 | 21.9 |
| copper | 65 055 | 125 100 | 290 708 | 29.1 |
| silver | 37 592 | 821 192 | 1 083 292 | 108.3 |
| gold_ore | 13 422 | 207 622 | 586 697 | 58.7 |
| obsidian | 15 790 | 495 884 | 1 497 449 | 149.7 |
| leather_scrap | 173 698 | 1 740 096 | 2 597 055 | 259.7 |
| demon_claw | 191 177 | 2 892 420 | 4 384 061 | 438.4 |
| demon_core | 32 968 | 922 400 | 1 476 085 | 147.6 |
| bone_fragment | 119 279 | 854 582 | 3 384 122 | 338.4 |
| concentrated_blood | 193 188 | 1 429 594 | 4 795 759 | 479.6 |
| corrupted_crystal | 46 184 | 353 962 | 1 256 594 | 125.7 |
| rift_shard | 0 | 560 450 | 914 472 | 91.4 |
| fiend_horn | 0 | 72 773 | 122 445 | 12.2 |
| abyssal_marrow | 0 | 40 200 | 1 028 480 | 102.8 |
| blood_heart | 0 | 7 560 | 192 680 | 19.3 |
| common_herb | 7 765 | 30 772 | 55 360 | 5.5 |
| energy_herb | 7 171 | 11 491 | 26 071 | 2.6 |
| uncommon_root | 9 371 | 19 605 | 19 605 | 2.0 |
| crimson_mushroom | 0 | 450 | 2 850 | 0.3 |
| rare_flower | 102 | 691 | 1 395 | 0.1 |
| iron_thistle | 2 280 | 6 240 | 17 040 | 1.7 |
| gold_blossom | 4 375 | 8 125 | 10 975 | 1.1 |
| swift_grass | 5 352 | 27 074 | 46 882 | 4.7 |
| moon_lily | 0 | 63 638 | 196 397 | 19.6 |
| silver_sage | 0 | 51 600 | 56 400 | 5.6 |
| dusk_orchid | 0 | 6 000 | 65 280 | 6.5 |
| elder_root | 0 | 0 | 64 | 0.0 |
| common_wood | 25 299 | 92 949 | 101 634 | 10.2 |
| oak_wood | 101 984 | 101 984 | 120 344 | 12.0 |
| ebony_wood | 37 592 | 782 792 | 782 792 | 78.3 |
| elven_wood | 13 422 | 244 622 | 908 047 | 90.8 |
| ancient_wood | 15 790 | 494 879 | 1 359 710 | 136.0 |
| **total** | **1 148 657** | **12 629 734** | **27 599 518** | **2760.0** |


### Rodada 23b — chances de material negociável reduzidas (2026-10-16)

O dono aprovou reduzir as chances de 3% / 5% / 8% para **1% / 2% / 3%** (comum / incomum / raro; o Tutano Abissal segue na classe rara). A oferta de unidades negociáveis cai para cerca de um terço dos números da Rodada 23 (jogador comum ~740 unidades em 60 dias, dono do Passe ~1 540; ~0,9 milhão de unidades com 1 000 jogadores, estimativa proporcional, não re-simulada). O teto diário anti-robô deriva da chance (`materials/bounds.ts`) e acompanha a redução sem outra mudança.

O dono renomeou a moeda rara de Runas para **Éter** (pt) / **Aether** (en); só o texto visível mudou, o campo do save e os identificadores continuam `shards`. As Rodadas acima mantêm o nome da época.


## Rodada 24 — o que cada raridade vale e o que o forjado entrega (2026-10-16)

Pedido do dono: conferir o balanceamento; dar valor à venda de itens (quem compra tem que achar que vale a pena); e, ao craftar equipamento, os status têm que funcionar bem. Regras que continuam: quem compra sai na frente; peça comprada vale na hora; só dono do Passe disputa a Liga em dinheiro; o XP do herói só vem da Caça; ninguém chega ao nível 100 em 60 dias; a escala de tipografia de 4 tamanhos fica.

### 1. Os status do que se forja (commits `fix:` x2 e `test: every crafted stat reaches the fight`)

`src/game/__tests__/craftedStatsAudit.test.ts` (461 testes, 2,4 s) é um gerador: para as **53 receitas forjáveis** (7 armaduras, 13 armas em duas linhas, 6 elmos, 6 luvas, 6 botas, 6 anéis, 6 escudos, 3 relíquias) em **4 raridades** e **refino +0 / +4 / +8 / +12** (800 combinações de peças instanciadas), ele recalcula, a partir do dado da própria peça e das regras do documento "Como os status somam", o que a peça tem que somar ao herói, e compara com o motor, com o painel do herói e com a Caça:

| Conferência | Resultado |
| --- | --- |
| `buildCombatStats` contra a regra (dano, crítico, dano crítico, defesa, PV, reflexo, queimadura, regeneração, velocidade, roubo de vida, Ouro, XP), nenhum outro status se mexe | **0 divergências** em 800 + 3 combinações |
| Escada do painel (`statBreakdown`): a linha do encaixe é o que a peça soma e as linhas somam o total | 0 divergências (também com 3 gemas de cada tipo nos soquetes do tier, e com os 14 únicos) |
| Durabilidade 100 / 50 / 29 / 0 em toda peça: x1, x0,75 (abaixo de 30), x0,4 (zero) em dano, PV, crítico, defesa, dano crítico e reflexo; **não** mexe em substats, conjuntos e gemas | confere, e nunca vira penalidade |
| Substats: cada tipo, em cada raridade e tier, soma seu valor ao status que nomeia; a peça nasce com `substatCount` substats distintos dentro da faixa do tier (x o multiplicador da raridade); bônus de Ouro respeita o teto 25% | confere |
| Conjuntos: as 7 famílias, peça a peça, somam exatamente o que `SET_DEFS` diz (motor e linha "Conjunto" do painel) | confere |
| A Caça vê o que a Masmorra vê (`buildHuntSimSetup` contra `buildCombatStats`) | confere |
| Cada status declarado ajuda na luta: margem do duelo fechado sobe com a peça e **cai** quando o status volta ao valor da casa vazia (queimadura, reflexo, regeneração, crítico, dano crítico, PV, defesa, velocidade, roubo de vida), e a Masmorra de verdade (uma andar, dados fixos) não demora mais nem custa mais PV com a peça | confere |
| Prévia da forja e cartões: toda linha mostrada muda algo no motor, todo status que muda aparece numa linha (a prévia da forja confere); o número do cartão de uma peça que o jogador tem é o que o motor soma | **1 achado, corrigido** (cartões sem a raridade, abaixo) |
| Tier N+1 nunca é pior que o tier N na mesma linha (cada status declarado, nível exigido pela cadeia, preço, CP em +0 e +8; queimadura e reflexo nunca somem) | confere nas 8 linhas (espada, machado, armadura, elmo, luvas, botas, anel, escudo) |
| Nenhuma peça declara um status que o encaixe dela não lê (arma: dano, crítico, queimadura; armadura: PV, defesa, reflexo; os cinco encaixes extras e a relíquia têm a lista própria) | confere |

**Bugs achados e corrigidos**

1. **Chance de crítico passava de 100% e a sessão de Caça perdia o teto do Passe** (`fix: crit chance is capped at 100% so the Hunting session keeps its Pass cap`). `buildCombatStats` somava crítico de arma, substats, refino, anel, luvas, relíquia e habilidades sem teto; `sanitizeHuntSession` só aceita `critChance` entre 0 e 1 e **descartava a sessão congelada** a cada carga do save, reconstruindo-a "de forma conservadora" a partir do herói vivo, **sem o teto de 10 h do Passe** (a sessão do dono passava a contar 6 h) e sem as janelas de elixir. Achado de verdade: com a raridade nova, o dono comprador perdia ~170 das 580 horas de Caça dos dias 31 a 60 (nível 90,7 em vez de 94,2). Hoje só um herói com crítico em todas as peças chega lá (7 peças T6 Lendárias com a substat de crítico no máximo passam de 100%), mas com o Lendário mais forte seria comum. Corrigido no motor (`Math.min(1, ...)`); a escada do painel continua somando por construção.
2. **Os cartões não mostravam a raridade** (`fix: item cards show the rarity multiplier the fight uses`). O painel de equipamento, o detalhe do inventário e a lista de refino da forja mostravam base x refino; a luta usava x1,18 (hoje x1,4) em dano, PV, defesa e dano crítico. Um Lendário lia igual a um Comum. `gearStatLines(item, nível, raridade)` agora multiplica. Não olhei o resultado no navegador (só o texto gerado, por teste).

**Observações que não são bugs e ficam como estão** (documentadas no teste):

- A raridade multiplica dano, PV, defesa e dano crítico; **não** multiplica a chance de crítico nem o reflexo. Um anel ou uma arma Lendários ganham pelo dano e pelo dano crítico, não pela chance.
- O refino arredonda o dano/PV base para inteiro antes de multiplicar a raridade: a Luva de Couro (dano 4) em +1 fica com 4 (4 x 1,1 = 4,4), só o +2 sobe; e um x1,02 sobre uma bota de 17 PV (17,3) volta ao mesmo inteiro no total de PV. O teste só exige alta estrita quando a regra diz que o número muda em uma unidade inteira.

### 2. Por que a raridade não mexia no nível (a medição)

Antes de mexer em número eu joguei os compradores do jeito da revisão da Rodada 22 (o guloso: só caça onde está o XP), 6 seeds, 60 dias, jogo como estava:

| Dia 60, mediana | Épico T4+ (PBEG) | Lendário T4+ (PBG) | Lendário +8 (PBRG) |
| --- | --: | --: | --: |
| nível | 95,0 | 95,3 | 95,8 (máx. 96,2) |

**Lendário e Épico terminavam a Liga no mesmo nível (+0,3).** O motivo é estrutural: o XP da Caça só conta tempo de luta ganha, então um herói mais forte não caça mais depressa; a força só vira nível por dois portões de CP (a profundidade e os sub-níveis da última zona). Com +2% de XP por sub-nível e portão x1,18, **qualquer conjunto T5/T6 comum já abre o sub-nível 10 por volta do dia 45**, e a diferença entre Épico e Lendário (34% contra 62% de CP) some no teto. Mexer só nos multiplicadores de raridade não resolve (tentei Épico 1,10 e Lendário 1,35/substats x1,5: +0,4 nível).

### 3. Os números novos

**Raridade** (`src/game/rarity.ts`, `RARITIES`; o servidor de itens rola com o mesmo `substatMult`, gerado em `supabase/functions/_shared/items/tables.ts`):

| Raridade | Chance | Substats | `statMult` antes → depois | `substatMult` antes → depois |
| --- | --: | --: | --- | --- |
| Comum | 63% | 0 | 1 | 1 |
| Rara | 25% | 1 | 1,02 | 1 |
| Épica | 10% | 2 | 1,06 → **1,04** | 1 |
| Lendária | 2% | 3 | 1,18 → **1,40** | 1 → **1,7** |

`statMult` multiplica dano, PV, defesa e dano crítico da peça; `substatMult` multiplica cada substat sorteado (uma vez, guardado com uma casa decimal: o cartão mostra o que a luta usa; os mesmos sorteios, então nenhuma semente anda). A reforja, o lapidar e os únicos rolam com a raridade da própria peça. As chances da forja (63 / 25 / 10 / 2) não mudaram.

**Poder de um conjunto de 7 peças** (`npm run sim:rarity`; substats medianos; "x Comum" = CP do conjunto / CP do conjunto Comum do mesmo tier e refino) e o sub-nível do Abismo Profundo que o CP abre com o portão novo:

| Conjunto | Comum | Rara | Épica | Lendária |
| --- | --- | --- | --- | --- |
| T4 +8 | 2 941 [2] | 3 453 (x1,17) [3] | 3 799 (x1,29) [3] | **6 308 (x2,14)** [5] |
| T5 +8 | 5 330 [5] | 6 332 (x1,19) [5] | 7 005 (x1,31) [6] | **11 444 (x2,15)** [8] |
| T5 +12 | 6 006 [5] | 7 083 (x1,18) [6] | 7 798 (x1,30) [6] | **12 673 (x2,11)** [9] |
| T6 +8 | 8 265 [7] | 9 590 (x1,16) [7] | 10 608 (x1,28) [8] | **17 428 (x2,11)** [10] |
| T6 +12 | 9 319 [7] | 10 670 (x1,15) [8] | 11 744 (x1,26) [8] | **19 327 (x2,07)** [10] |

Antes da rodada a coluna era Comum 1 / Rara 1,19 / Épica 1,34 / Lendária 1,62 (T6 +8: x1,16 / x1,31 / x1,61). A Épica **perde** 2 a 3 pontos de CP de conjunto (1,31 → 1,29 em T6 +8 e T4 +8) e a Lendária **ganha** 0,5 (1,62 → 2,1): o degrau Épica → Lendária passa de x1,2 para x1,6. Só com uma peça (arma + armadura, `npm run sim:items`, seção B do `ITEM_BALANCE_AUDIT.md`) a mediana é Rara +4 a +5%, Épica +7 a +10%, Lendária **+38 a +53%** (era +21 a +26%).

**Zona 4, o Abismo** (`src/game/huntingZones.ts`): XP base 10 000 → **8 750** por hora, **+4,5% de XP por sub-nível** (era 2%), portão de CP **x1,25 por sub-nível** (era x1,18). Um herói no sub-nível 8 ganha o que ganhava (11,5 mil por hora); o 10 paga 12,3 mil (era 11,8), o 5 paga 10,3 mil (era 10,8). CP exigido por sub-nível (arredondado):

| Sub-nível | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Raso, antes → depois | 1 896 → 2 009 | 2 238 → 2 511 | 2 640 → 3 139 | 3 116 → 3 923 | 3 676 → 4 904 | 4 338 → 6 130 | 5 119 → 7 663 | 6 040 → 9 578 | 7 128 → 11 973 |
| Denso | 2 310 | 2 888 | 3 609 | 4 512 | 5 640 | 7 050 | 8 812 | 11 015 | 13 769 |
| **Profundo** | 2 611 | 3 264 | 4 080 | 5 100 | 6 375 | 7 969 | 9 961 | 12 451 | **15 564** (era 9 266) |

O sub-nível 10 no Profundo agora só abre com um conjunto **Lendário de tier 6** (17 a 19 mil de CP); um Comum para no 7, um Épico no 8.

**Como cheguei nesses números** (cada linha é uma rodada de simulação, 6 seeds; as marcadas † com 3 seeds; dia 60, política gulosa de cada comprador):

| Tentativa | Mudança | Lendário − Épico | Lendário +8 (máx.) | Dono guloso sem compra (PG) |
| --- | --- | --: | --: | --: |
| jogo antes da rodada | — | +0,3 | 96,2 | 89,0 |
| só raridade | Épica 1,10; Lendária 1,35, substats x1,5 | +0,5 | — | 90,0 |
| e2 | + zona 4: 4%/sub-nível, x1,25, base 8 800 | +1,2 | 96,1 | 87,9 |
| e3 † | Épica 1,08; 5%/sub-nível, x1,30, base 8 600 | +1,7 | — | 85,8 |
| e4 † | Épica 1,08; 5%/sub-nível, x1,25, base 8 600 | +1,6 | — | 86,2 |
| f1 | Épica 1,06 (subs x0,9); Lendária 1,40, subs x1,7; 4%, x1,25, base 8 900 | +1,6 | 96,4 | 87,9 |
| g1 | Épica 1,05 (subs x0,85); idem; 4,5%, x1,25, base 8 750 | +2,2 | 96,8 | 88,2 |
| **final** | Épica 1,04 (subs x1); idem; 4,5%, x1,25, base 8 750 | **+2,1** | **96,7** | 87,3 |

O Épica com substats x0,85 (g1) rolava substats mais fracos que a Rara; voltei para x1 e baixei só o `statMult` (1,04): mesmo CP de conjunto, regra mais simples de explicar ("só a Lendária rola substats mais fortes").

### 4. A tabela do comprador (mesmas 6 seeds, dia 60; posição = nível + fração; mediana (mín-máx))

Políticas do dono do Passe, jogo antes da rodada → depois. As quatro de cima são as pedidas (a, b, c, d); as de baixo são as do método da Rodada 22 (o dono comum, o esperto e o comprador "esperto", que ainda minera e forja o que falta).

| Quem | Antes | Depois | O que é |
| --- | --: | --: | --- |
| (a) PG, dono guloso que forja o próprio equipamento, sem comprar | 89,0 (87,5-90,3) | **87,3** (86,9-90,4) | referência do dono "esperto sem compra" |
| (b) PBEG, compra o conjunto T4+ **Épico** | 95,0 (94,5-95,8) | **93,6** (93,0-94,8) | guloso |
| (c) PBG, compra o conjunto T4+ **Lendário** | 95,3 (95,0-96,2) | **95,4** (95,1-96,2) | guloso |
| (d) PBRG, compra o T4+ **Lendário já refinado a +8** (simulado: o refino no servidor ainda não existe) | 95,8 (94,6-96,1) | **96,3** (95,8-96,7) | guloso |
| P, dono comum | 82,7 (79,2-84,4) | 80,1 (79,1-83,9) | |
| PS, esperto (minera, forja) | 84,9 (82,1-86,1) | 82,7 (80,3-85,8) | |
| PBE / PB, comprador esperto Épico / Lendário | 93,5 / 93,5 | 92,5 / 93,6 | método da Rodada 22 |

Diferença na mesma seed (mediana), dia 14 / 30 / 45 / 60:

| Par | Dia 14 | Dia 30 | Dia 45 | Dia 60 |
| --- | --: | --: | --: | --: |
| Lendário − Épico (PBG − PBEG) | 0,0 | 0,9 | 1,6 | **2,1** |
| Épico − não comprador (PBEG − PG) | 5,6 | 7,3 | 7,0 | 6,0 |
| Lendário − não comprador (PBG − PG) | 5,6 | 8,4 | 8,8 | 8,3 |
| Lendário +8 − Lendário (PBRG − PBG) | 0,3 | 1,1 | 1,0 | 0,8 |

Metas do diretor: **Lendário na frente do Épico na frente de quem não compra: sim. Lendário ≥ +2 sobre o Épico: sim, +2,1 no dia 60 (e ainda subindo, cerca de 0,03 por dia: +1,6 no dia 45). O mais rápido de todos termina em 96,7 (≤ 97) e ninguém chega ao 100. Mediana do dono do Passe em 85 a 90: não, ficou em 82,7 (P 80,1, PS 82,7, PG 87,3); era 84,9.** O dono que não compra perdeu 1,7 a 2,6 níveis: os portões de CP x1,25 o põem em sub-níveis mais baixos (PG: 5 no dia 60, era 8) e o bônus por sub-nível menor-que-o-do-topo não cobre. Subir tudo 1,4 nível (base de XP da zona 4 em 9 200; **estimativa, não rodei**) levaria P/PS/PG para ~81,5 / 84 / 88,7 e o Lendário +8 para ~97,7, acima do teto de 97; os dois alvos (mediana ≥ 85 e teto 97) não cabem juntos com um Lendário +2 sobre o Épico, e escolhi o teto. É a decisão que mais pede o dono (item 7).

Por política (dia 30 / 45 / 60) e sub-nível médio da zona 4:

| Política | Nível d30 | d45 | d60 | Sub-nível d30 / d45 / d60 | XP por dia, d31-60 |
| --- | --: | --: | --: | --- | --: |
| P | 63,0 | 72,6 | 80,1 | 2 / 5,5 / 7 | 185 mil |
| PS | 63,0 | 74,0 | 82,7 | 2 / 5 / 7,5 | 217 mil |
| PG | 63,9 | 76,5 | 87,3 | 2 / 4,5 / 5 | 281 mil |
| PBEG | 71,2 | 83,7 | 93,6 | 5,5 / 6,5 / 8 | 310 mil |
| PBG | 72,1 | 85,3 | 95,4 | 8 / 9 / 9,5 | 340 mil |
| PBRG | 73,3 | 86,5 | 96,3 | 9,5 / 10 / 10 | 346 mil |

### 5. Guarda dos dias 1 a 21

`npm run sim` (cenário A, jogador comum sem Passe, 20 seeds, 21 dias, com únicos), jogo da Rodada 22 → depois desta rodada. A raridade só chega a esse jogador pelo que ele forja (63 / 25 / 10 / 2%), e a zona 4 só abre depois do dia 21 para ele.

| Meta | Antes | Depois | Mudou? |
| --- | --- | --- | --- |
| T2 primeira sessão termina no andar >= 8; checkpoint 10 até o dia 2 | 8; dia 2 | **8; dia 2** | igual |
| T3 primeira peça forjada (dia <= 2) | 2 | **2** | igual |
| T4 nível no fim do dia 2 / 3 / 14 (faixas 20-28 / 20-29 / 45-60) | 24 / 24 / 47 | **24 / 24 / 47 (45-48)** | igual |
| T5 chefe 25 vencido (dia 4-6) | dia 5 | **dia 5** | igual |
| T6 chegada ao andar 50 (nenhuma seed antes do dia 10) | primeira seed dia 10, mediana 14 | **primeira seed dia 10, mediana 13,5** | mantida |
| T6 chefe 50 (faixa 12-16) | primeira seed dia 11, mediana 14, 20/20 em 21 dias | primeira seed **dia 10**, mediana **15**, 20/20 em 21 dias | **fora da faixa como já estava** (por 1 dia; agora por 2 na primeira seed). Uma Lendária de sorte (2% por forja) leva um comum ao chefe 50 um dia antes |
| T7 menor razão depois de um chefe | 1,08 | 1,08 | igual |
| T8 derrota mantém 75% do ouro | 75% | 75% | igual |
| I1 a I4 (inventário) | ok | ok (I1 dia 6, I4 +0% / +20% / +25,7%) | iguais |
| nível no dia 21 | 49 (48-50) | **49 (48-51)** | igual |
| andar mais alto no dia 21 | 60 (59-73) | 60 (59-76) | igual |

As três metas que o diretor mandou guardar (primeira sessão no andar >= 8, primeira peça até o dia 2, chefe 25 entre os dias 4 e 6) valem: **8, dia 2, dia 5**.

### 6. Limites do servidor (`supabase/functions/_shared/progress/bounds.ts`, `npm run season:bounds`, `npm run season:tables`, `npm run item:tables`)

| Número | Antes | Depois |
| --- | --- | --- |
| `xpPerHour` (teórico; recalculado por `season:bounds`) | 25 000 (recalculado 21 476) | 25 000 (recalculado **22 375**) |
| `huntXpFactor` (1,3 x 1,17 x 1,25 x o melhor sub-nível) | 2,244 | **2,671** (1,3 x 1,17 x 1,25 x 1,405) |
| XP por hora da zona 4 no servidor (`ZONE_TABLE`) | 10 000, 0,02 | **8 750, 0,045** (gerada) |
| `levelPace` (nível, dia) | 51:12 60:19 68:26 75:34 79:38 88:50 92:56 100:72 200:272 | **51:11 60:18 68:25 75:32 79:36 88:47 92:53 100:68 200:268** |
| `floorPace` (andar, dia) | 50:9 75:11 90:26 100:39 | **50:8 75:9 90:10 100:11** |
| `floorCapByLevel` | 44:56 50:100 | 44:56 **46:85 48:100** |
| Tabela de itens do servidor (`RARITY_TABLE`) | chance, substats | + **`substatMult`** (o servidor rola os substats com ele) |
| Limites de cunhagem (Épicas/Lendárias por dia, únicos, Bolsas) | — | **sem mudança**: dependem das chances de forja e das horas por peça, que não mudaram |

A `levelPace` nova não é "o Lendário ficou mais rápido": é a seed mais rápida de **qualquer** política do dono, e a rodada incluiu pela primeira vez os compradores gulosos (no jogo de antes eles já faziam 88 no dia 47 e 92 no dia 53; a tabela da Rodada 22 vinha dos compradores "espertos"). A `floorPace` e o `floorCapByLevel` sim vêm da raridade: um conjunto T4 Lendário (x2,1) limpa o andar 100 no **dia 10** (antes 39; os compradores gulosos, no jogo de antes, 20); a Masmorra não paga XP e não entra no ranking, então o efeito é só a tabela da checagem de plausibilidade. O `floorCapByLevel` ganhou um ponto: a seed Lendária estava no andar 82 com nível 47.

### 7. O que não foi verificado e o que o dono pode contestar

- **Mediana do dono do Passe (item 4):** 82,7 contra a meta de 85 a 90. O dono comum (P) perde 2,6 níveis. Alternativas, **estimadas e não rodadas**: base de XP da zona 4 em 9 200 (dono +1,4, Lendário +8 em ~97,7: passa do teto); portão x1,22 (dono +0,8, Lendário − Épico cai para ~1,4). Medi de verdade só f1 (4%/sub-nível, base 8 900: P 81,4, PS 82,9, PG 87,9, mas Lendário − Épico +1,6).
- **Profundezas (depois do andar 100) não foram retunadas.** Um herói T6 +8 Lendário agora limpa a profundidade 51 sem paragon e 55 com algum (era 41 a 48); a profundidade 50 deixou de ser uma meta do paragon e passou a ser do conjunto Lendário (comum e épico continuam abaixo de 50 em qualquer paragon). Se o dono quiser os muros de volta, é `T.depths.hpGrowth` / `dmgGrowth` (e as faixas de `round14.test.ts`).
- **Lendário e Dungeon:** o conjunto Lendário T4 passa o andar 100 no dia 10; chefes e relíquias de chefe chegam cedo para o comprador. Os limites diários de cunhagem (15 mortes de chefe, 2 únicos) seguram o excesso; a economia de itens não foi remedida.
- **Refino de comprador (d):** simulado como a peça nascendo +8; o refino no servidor ainda não existe, e o comprador "gulosamente" nunca minera, o que um jogador real pode não fazer. O guloso-comprador é o limite superior (o esperto da Rodada 22 fica em 92,5 e 93,6).
- **Faixas de preço** (ECONOMY_AUDIT, seção 23) são estimativas: o mercado de jogadores ainda não tem preço.
- **O Épico perdeu 2 a 3 pontos de CP de conjunto** (1,31 → 1,29 em T6 +8 e T4 +8): é o preço do degrau Lendário. A Épica continua 10% acima da Rara e 28 a 29% acima da Comum.
- Nenhum clique no navegador; a tela de cartões foi checada só pelo texto gerado e pelos testes.


## Rodada 25 — mercado com 1 000 jogadores (2026-10-16)

Pedido do dono (2026-10-16), uma crítica correta: as tabelas de comprador das Rodadas 22 e 24 davam ao comprador um conjunto Lendário **desde o dia 1** (as receitas de tier 4+ custavam zero e rolavam Lendário). Mas ninguém compra uma Lendária no dia 10 se ninguém forjou nem dropou uma ainda. Esta rodada refaz a conta do jeito certo: **1 000 jogadores começam juntos no dia 0 da Liga**, uma população realista com desistência, um mercado com a oferta que eles realmente geram, e compradores que só levam o que existe no estoque no dia. **Nenhum número do jogo mudou**: esta rodada só mede e recomenda.

Código: `scripts/sim/marketPopulation.sim.ts` (o modelo; todos os parâmetros documentados no topo), `scripts/sim/market.mjs` (`npm run sim:market`, que roda as etapas em processos paralelos e imprime o relatório) e a opção `schedule` do `Player` (`scripts/sim/player.ts`: uma lista de peças entregues em dias dados, usada para o herói comprador). Commit `test(sim): a 1 000-player market with real supply`.

### 0. Como foi medido, o que é medido e o que é modelo

Quatro etapas (`npm run sim:market`; env `MARKET_PARAMS` troca qualquer parâmetro, `MARKET_SKIP` / `MARKET_ONLY` repetem só uma etapa; as etapas de mercado e relatório levam segundos, então hipóteses novas de listagem ou churn não exigem jogar nada de novo):

1. **Perfis (medido, o jogo de verdade).** O `Player` de `sim:long` / `sim:econ` joga cada arquétipo por 75 dias e 6 seeds. Guardamos, por dia, as peças forjadas (tier e encaixe), os únicos achados (Caça e chefes), as unidades coletadas de cada material negociável, o Ouro ganho, gasto e na mão, as horas jogadas (XP do Passe) e o nível. **A raridade que o simulador sorteou é ignorada** e re-sorteada abaixo: usamos só *o que foi forjado e quando*. Nenhuma taxa é inventada.
2. **Oráculo (medido).** Heróis que ganham de graça cada peça de tier 4 a 6 no instante em que o nível da receita permite (o "comprador" antigo, agora com o portão de nível). A trajetória de nível deles diz **quando** um comprador quer cada peça.
3. **Mercado (modelo).** 1 000 jogadores: cada um sorteia um perfil do arquétipo e uma velocidade (escala de tempo 0,75 a 1,25), desiste num dia da curva de churn, sorteia a raridade de cada forja (63/25/10/2), usa o Selo, rola os dados dos materiais negociáveis (Binomial por unidade, `rates.ts`), cria Bolsas de Ouro, e lista uma parte do que não está ligado. Os compradores entram na fila na ordem em que o nível deles pede a peça e levam **a primeira peça anunciada** que serve. 5 repetições com outros dados.
4. **Heróis compradores (medido).** O cronograma real de compras de um comprador (o melhor, o 10% melhor, o mediano, o 10% pior de cada tipo) é entregue ao mesmo `Player` (`PlayerOptions.schedule`), que joga 60 dias e dá o nível, o Ouro e as peças vestidas. A peça é entregue na primeira visita em que o herói tem o nível da receita.

**População (parâmetros, trocáveis):** 30% donos do Passe, 70% sem Passe. Mistura: comum A 40%, esperto AS 12%, guloso AG 6%, especialistas sem Passe em mineração/lenhador/Horta 4% cada; dono do Passe comum P 11%, esperto PS 7%, guloso PG 5%, esperto que visita a cada 6 h (PX) 2%, especialistas PM/PW/PGa 1,5% cada, minerador de 6 h (XPM) 0,5%. **Churn:** quem ainda joga no dia 7 / 30 / 60: sem Passe 60% / 40% / 30%; dono do Passe 90% / 75% / 60%. **Listagem:** donos anunciam 30% e sem Passe 60% das peças Épicas+ não ligadas e dos únicos; 80% dos materiais negociáveis. **Compradores:** 25% dos donos (hunters que jogam pelo menos 30 dias) e 6% dos sem Passe, metade querendo Épico e metade Lendário (117 compradores: 75 donos e 42 sem Passe); o Lendário aceita uma peça Lendária **um tier abaixo** do melhor que pode vestir se não houver (um conjunto Lendário T4 supera um Comum T5 em CP), o Épico não. **Selo do Ferreiro:** o dono ganha um Selo nos níveis 10 / 20 / 27 do Passe (XP do Passe = 10 por hora de Caça/Mineração/Corte + 15 por andar), e o gasta na primeira forja de tier 4+; a peça nasce **ligada** (Épica 5 em 6, Lendária 1 em 6), nunca vai ao mercado.

**Arquétipos medidos (por jogador, 60 dias, mediana de 6 seeds).** Isto é o que o jogo de verdade produz; o resto da rodada só multiplica e sorteia:

| arquetipo (parcela da populacao) | nivel d30 | nivel d60 | forjas T4 | T5 | T6 | unicos | trad. Horta | Mineracao | Lenhador | Cacada | Ouro ganho | Ouro gasto |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A (40.0%) comum, sem Passe (2 visitas por dia) | 56.9 | 69.6 | 7 | 0 | 0 | 1.0 | 18 | 86 | 84 | 760 | 84 219 | 55 128 |
| AS (12.0%) esperto, sem Passe | 56.9 | 69.6 | 7 | 0 | 0 | 1.0 | 18 | 86 | 84 | 760 | 84 305 | 55 128 |
| AG (6.0%) guloso (so caca onde esta o XP), sem Passe | 56.9 | 71.3 | 7 | 0 | 0 | 1.0 | 18 | 78 | 79 | 765 | 81 623 | 55 409 |
| M (4.0%) especialista em mineracao, sem Passe | 1.0 | 1.0 | 0 | 0 | 0 | 0.0 | 20 | 1 165 | 0 | 0 | 1 600 | 1 450 |
| W (4.0%) especialista em lenhador, sem Passe | 1.0 | 1.0 | 0 | 0 | 0 | 0.0 | 20 | 0 | 1 154 | 0 | 1 632 | 1 450 |
| G (4.0%) especialista em Horta, sem Passe | 58.1 | 64.2 | 0 | 0 | 0 | 1.5 | 19 | 4 | 2 | 989 | 48 769 | 29 429 |
| P (11.0%) dono do Passe, comum | 63.0 | 80.1 | 7 | 7 | 0 | 3.0 | 18 | 187 | 128 | 1 409 | 129 585 | 111 308 |
| PS (7.0%) dono do Passe, esperto | 63.0 | 82.7 | 7 | 7 | 0 | 2.5 | 18 | 187 | 127 | 1 304 | 127 192 | 118 724 |
| PG (5.0%) dono do Passe, guloso | 63.9 | 87.3 | 7 | 1 | 0 | 3.0 | 18 | 70 | 77 | 1 360 | 98 052 | 69 805 |
| PX (2.0%) dono do Passe, esperto, visita a cada 6 h | 70.7 | 95.5 | 7 | 5 | 0 | 4.0 | 23 | 122 | 86 | 1 715 | 163 020 | 164 128 |
| PM (1.5%) dono do Passe, especialista em mineracao | 1.0 | 1.0 | 0 | 0 | 0 | 0.0 | 20 | 2 296 | 0 | 0 | 1 680 | 1 525 |
| PW (1.5%) dono do Passe, especialista em lenhador | 1.0 | 1.0 | 0 | 0 | 0 | 0.0 | 20 | 0 | 2 276 | 0 | 1 728 | 1 550 |
| PGa (1.5%) dono do Passe, especialista em Horta | 63.4 | 75.3 | 0 | 0 | 0 | 3.0 | 19 | 4 | 2 | 1 905 | 140 492 | 51 878 |
| XPM (0.5%) dono do Passe, minerador que visita a cada 6 h | 1.0 | 1.0 | 0 | 0 | 0 | 0.0 | 22 | 2 831 | 0 | 0 | 1 760 | 1 600 |

Três fatos saem direto daqui: (a) **o jogador sem Passe, comum, termina o dia 60 no nível ~70 e forja 7 peças T4 e nenhuma T5** (o portão do T5 é o nível 70 a 80): os 70% de jogadores sem Passe só alimentam o mercado até o tier 4; (b) mesmo o dono comum forja ~7 peças T5 e nenhuma T6; (c) os especialistas de mineração e lenhador ficam no nível 1 (não caçam) e criam 1 200 a 2 800 unidades negociáveis do seu ofício em 60 dias, contra 80 a 190 de mineração de um caçador; o caçador, por sua vez, cria 760 a 1 900 de drops de Caça.

**Aviso de calibração (honesto).** O oráculo desta rodada **não reproduz o ganho inteiro** do comprador PBG da Rodada 24 (re-rodado com as mesmas seeds: 95,1 contra 87,6 do PG, +7,6). Aqui o oráculo Lendário dá **+3,4** (sem os T4 dragão) a **+3,7** (com eles) sobre o PG na política gulosa, e +6,0 / +6,1 na esperta. Mesma CP no dia 13 (6 680 contra 6 760), mas o comprador antigo cruza o andar 100 da Masmorra nos dias 13 a 20 e o oráculo nos dias 18 a 34; não achei a causa dentro desta rodada (o comprador antigo *forja* as peças, o oráculo as *recebe*; as peças dragão e a linha da espada com queimadura foram testadas e explicam pouco). **O que vale ler nas tabelas de Liga é a comparação interna**: não comprador × oráculo × comprador real, mesma seed. O ganho absoluto do comprador está subestimado em ~3 níveis em relação à Rodada 24; a razão "o que o comprador real consegue / o que o oráculo daria" é a medida desta rodada.

**Achado de código (não mexi).** O motor **não tem portão de nível para vestir uma peça**: `applyEquipInstance` (`gearInstances.ts`) e a função `bind-item` só olham o encaixe; o nível da receita (`requiredLevel`) só vale para **forjar** (`applyForge`, `craftActions`). Um comprador pode vestir uma Lendária T6 no nível 1. As Rodadas 22 e 24 (e esta) assumem o portão (`o comprador não veste o que não poderia ter forjado`), que na verdade é só uma regra de simulação. Decisão do dono (recomendação 5).

### 1. Quantos itens vendáveis e materiais negociáveis por dia, de cada fonte

Média dos 7 dias até o dia da coluna, população inteira (1 000 jogadores no dia 0, com churn), mediana de 5 repetições. "Sorteadas" = as peças forjadas que saíram Épicas ou Lendárias (antes de decidir listar); "anunciadas" = as que os jogadores puseram à venda.

| dia | 1 | 3 | 7 | 14 | 21 | 30 | 45 | 60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| jogadores ativos (churn) | 1 000 | 909 (903-916) | 724 (711-734) | 626 (610-645) | 569 (550-590) | 507 (480-519) | 439 (427-450) | 386 (376-395) |

| fonte \ dia | d1 | d3 | d7 | d14 | d21 | d30 | d45 | d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pecas forjadas T1-T3 (todas as raridades) | 1 992.0 | 2 339.7 | 1 670.1 | 414.0 | 19.1 | 0.0 | 0.0 | 0.0 |
| Pecas forjadas T4 | 0.0 | 0.0 | 0.0 | 63.4 | 205.1 | 99.3 | 6.4 | 1.0 |
| Pecas forjadas T5 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 4.7 | 34.3 | 36.0 |
| Pecas forjadas T6 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 2.4 |
| Epicas+Lendarias sorteadas, T1-T3 (nao ligadas) | 236.00 | 286.67 | 204.57 | 52.29 | 2.71 | 0.00 | 0.00 | 0.00 |
| Epicas+Lendarias sorteadas, T4 | 0.00 | 0.00 | 0.00 | 4.71 | 20.43 | 12.43 | 0.57 | 0.00 |
| Epicas+Lendarias sorteadas, T5 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.43 | 3.14 | 4.43 |
| Epicas+Lendarias sorteadas, T6 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.29 |
| Epicas ANUNCIADAS, T1-T3 | 88.00 | 107.67 | 82.71 | 21.00 | 1.14 | 0.00 | 0.00 | 0.00 |
| Epicas ANUNCIADAS, T4 | 0.00 | 0.00 | 0.00 | 1.14 | 7.14 | 6.29 | 0.29 | 0.00 |
| Epicas ANUNCIADAS, T5 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.14 | 0.71 | 1.71 |
| Epicas ANUNCIADAS, T6 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.14 |
| Lendarias ANUNCIADAS, T1-T3 | 21.00 | 25.33 | 18.43 | 5.00 | 0.43 | 0.00 | 0.00 | 0.00 |
| Lendarias ANUNCIADAS, T4 | 0.00 | 0.00 | 0.00 | 0.29 | 1.57 | 0.86 | 0.14 | 0.00 |
| Lendarias ANUNCIADAS, T5 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.29 |
| Lendarias ANUNCIADAS, T6 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| Unicos anunciados (Cacada + chefes) | 3.00 | 12.00 | 9.57 | 18.00 | 4.43 | 3.57 | 2.43 | 4.43 |
|   dos quais de tier 4 ou mais | 0.00 | 0.00 | 0.14 | 6.29 | 4.29 | 2.57 | 2.43 | 4.29 |
| Pecas nascidas ligadas pelo Selo (Epica+Lendaria, fora do mercado) | 0.00 | 0.00 | 0.00 | 23.71 | 35.86 | 2.57 | 7.00 | 0.00 |
| Materiais negociaveis criados, Horta (unidades) | 196.0 | 196.3 | 185.4 | 210.3 | 187.0 | 163.7 | 144.9 | 132.9 |
| Materiais negociaveis criados, Mineracao (unidades) | 328.0 | 792.3 | 1 347.4 | 2 700.0 | 2 685.6 | 1 918.3 | 1 638.3 | 1 215.3 |
| Materiais negociaveis criados, Lenhador (unidades) | 478.0 | 659.3 | 1 184.1 | 2 258.0 | 2 563.0 | 1 483.3 | 1 114.0 | 871.9 |
| Materiais negociaveis criados, Cacada (drops) (unidades) | 2 069.0 | 2 664.0 | 5 031.3 | 7 217.6 | 9 120.0 | 10 114.6 | 8 255.9 | 6 976.6 |
| Materiais negociaveis criados, TOTAL | 3 026.0 | 4 312.0 | 7 722.7 | 12 305.1 | 14 390.6 | 13 833.7 | 11 154.4 | 9 151.3 |
| Materiais negociaveis ANUNCIADOS, TOTAL | 2 428.0 | 3 458.3 | 6 164.6 | 9 845.7 | 11 522.3 | 11 062.7 | 8 929.4 | 7 317.4 |
| Bolsas de Ouro criadas (unidades) | 0.0 | 0.0 | 0.0 | 0.9 | 14.1 | 40.0 | 34.1 | 15.3 |
| Bolsas de Ouro: Ouro de face (mil) | 0.0 | 0.0 | 0.0 | 3.9 | 39.9 | 107.7 | 84.6 | 42.6 |

Leitura:

- **Forja.** No dia 14 forjam-se ~63 peças T4 por dia na população; o pico de T4 é ~205 por dia no dia 21; o T5 só passa de 30 por dia depois do dia 40; o T6 é praticamente zero (28 peças em 60 dias na população inteira, contra 3 136 de T4 e 997 de T5). Em 60 dias saem ~321 Épicas+Lendárias T4, 105 T5 e **3 T6**; os jogadores anunciam 155 (T4), 35 (T5) e 0 a 1 (T6).
- **Selo.** O Selo gera ~591 peças Épicas+Lendárias **ligadas** em 60 dias (99 Lendárias): 3,1 vezes tudo que os jogadores anunciam de T4+ (191). É oferta de poder para o dono, **não** de mercado. Quase todas saem entre os dias 14 e 25 (o dono gasta os 3 Selos nas primeiras forjas T4).
- **Materiais negociáveis.** ~690 mil unidades criadas e ~550 mil anunciadas em 60 dias: 71% da Caça (489 mil), 16% da Mineração (110 mil), 13% do Lenhador (87 mil) e 1,4% da Horta (10 mil). É a única oferta abundante do mercado.
- **Únicos.** 367 anunciados em 60 dias (201 de tier 4+), 2 a 18 por dia na população (mais nos primeiros 20 dias). Os de tier 6 (arma e anel, +30 a 60% de CP no andar 100) são o item de maior poder que existe no mercado.
- **Bolsas de Ouro.** ~1 370 criadas e 3,5 milhões de Ouro de face em 60 dias (modelo: 30% dos jogadores vendem Ouro excedente, no máximo o teto do servidor de 3 000 por dia por conta), pico por volta do dia 30 (~40 por dia).

| estoque \ dia | d1 | d3 | d7 | d14 | d21 | d30 | d45 | d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Epicas T3 | 0 | 0 | 31 (25-37) | 181 (143-188) | 188 (155-193) | 188 (155-193) | 188 (155-193) | 188 (155-193) |
| Lendarias T3 | 0 | 0 | 5 (2-8) | 40 (37-44) | 43 (39-47) | 43 (39-47) | 43 (39-47) | 43 (39-47) |
| Epicas T4 | 0 | 0 | 0 | 8 (5-12) | 56 (54-68) | 121 (108-135) | 131 (117-149) | 131 (119-151) |
| Lendarias T4 | 0 | 0 | 0 | 2 (1-4) | 13 (12-18) | 22 (20-28) | 24 (23-30) | 24 (23-31) |
| Epicas T5 | 0 | 0 | 0 | 0 | 0 | 1 (0-2) | 13 (7-16) | 32 (29-40) |
| Lendarias T5 | 0 | 0 | 0 | 0 | 0 | 0 | 1 (0-1) | 3 (2-7) |
| Epicas T6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 (0-2) |
| Lendarias T6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Pecas Epicas+Lendarias nascidas LIGADAS pelo Selo (T4+) | 0 | 0 | 0 | 166 (156-177) | 414 (398-424) | 435 (428-450) | 575 (557-579) | 591 (569-603) |
| Unicos | 3 (1-5) | 36 (34-52) | 67 (53-83) | 201 (180-209) | 237 (209-242) | 272 (239-282) | 303 (270-315) | 367 (330-389) |
| Materiais negociaveis anunciados (mil) | 2 (2-3) | 10 (10-10) | 43 (43-44) | 112 (111-115) | 193 (191-200) | 295 (288-304) | 434 (424-452) | 550 (540-571) |
| Ouro em Bolsas criadas (mil) | 0 | 0 | 0 | 27 (14-73) | 303 (262-404) | 1 212 (1 144-1 445) | 2 559 (2 295-2 808) | 3 520 (3 130-3 649) |

### 2. Quando um comprador consegue uma Lendária, ou um conjunto

Oferta pura: o k-ésimo comprador precisa da k-ésima peça anunciada de cada encaixe (os k-1 compradores anteriores já levaram as primeiras). Primeiro dia (1 a 60) em que o estoque acumulado chega a k; `> 60` = não chega em 60 dias; `(a/5)` = chega em só a das 5 repetições. Não olha o nível exigido (um conjunto T5 pede nível 70 a 80, T6 pede 90 a 100).

| peca | 1o comprador | 10o comprador | 100o comprador |
| --- | ---: | ---: | ---: |
| Epica T6 (qualquer encaixe) | 60 (4/5) | > 60 | > 60 |
| Epica T5 (qualquer encaixe) | 30 (26-31) | 43 (37-49) | > 60 |
| Epica T4 (qualquer encaixe) | 11 (10-12) | 15 (14-16) | 26 (25-28) |
| Lendaria T6 (qualquer encaixe) | > 60 | > 60 | > 60 |
| Lendaria T5 (qualquer encaixe) | 38 (33-48) | > 60 | > 60 |
| Lendaria T4 (qualquer encaixe) | 12 (10-13) | 19 (18-21) | > 60 |
| Lendaria T4 weapon | 18 (17-19) | > 60 | > 60 |
| Lendaria T4 armor | 16 (12-20) | > 60 | > 60 |
| Lendaria T4 helmet | 17 (4/5) | > 60 | > 60 |
| Lendaria T4 gloves | 14 (10-24) | > 60 | > 60 |
| Lendaria T4 boots | 18 (12-29) | > 60 | > 60 |
| Lendaria T4 ring | 21 (15-24) | > 60 | > 60 |
| Lendaria T4 shield | 16 (13-24) | > 60 | > 60 |
| Lendaria T5 weapon | > 60 (2/5) | > 60 | > 60 |
| Lendaria T5 armor | > 60 (2/5) | > 60 | > 60 |
| Lendaria T5 helmet | 60 (3/5) | > 60 | > 60 |
| Lendaria T5 gloves | 56 (3/5) | > 60 | > 60 |
| Lendaria T5 boots | 48 (4/5) | > 60 | > 60 |
| Lendaria T5 ring | > 60 (1/5) | > 60 | > 60 |
| Lendaria T5 shield | > 60 (1/5) | > 60 | > 60 |
| Epica T4 weapon | 17 (17-18) | 23 (22-27) | > 60 |
| Epica T4 armor | 13 (12-17) | 22 (20-24) | > 60 |
| Epica T4 helmet | 11 (10-14) | 22 (18-22) | > 60 |
| Epica T4 gloves | 12 (11-14) | 19 (17-21) | > 60 |
| Epica T4 boots | 14 (10-20) | 25 (20-29) | > 60 |
| Epica T4 ring | 14 (12-22) | 29 (25-46) | > 60 |
| Epica T4 shield | 15 (13-15) | 22 (21-27) | > 60 |
| Epica T5 weapon | 47 (45-51) | > 60 | > 60 |
| Epica T5 armor | 36 (33-42) | > 60 (1/5) | > 60 |
| Epica T5 helmet | 30 (26-38) | > 60 | > 60 |
| Epica T5 gloves | 38 (32-42) | > 60 | > 60 |
| Epica T5 boots | 41 (29-50) | > 60 | > 60 |
| Epica T5 ring | 52 (37-56) | > 60 | > 60 |
| Epica T5 shield | 35 (30-49) | > 60 | > 60 |

| conjunto | 1o comprador | 10o comprador | 100o comprador |
| --- | ---: | ---: | ---: |
| Conjunto Lendario T4 (7 pecas) | 24 (4/5) | > 60 | > 60 |
| Conjunto Epico T4 (7 pecas) | 18 (17-22) | 29 (25-46) | > 60 |
| Conjunto Epico-ou-melhor T4 (7 pecas) | 17 (17-18) | 28 (24-36) | > 60 |
| Arma + armadura Lendarias T4 (2 pecas) | 18 (17-20) | > 60 | > 60 |
| Conjunto Lendario T5 (7 pecas) | > 60 | > 60 | > 60 |
| Conjunto Epico T5 (7 pecas) | 52 (45-56) | > 60 | > 60 |
| Conjunto Epico-ou-melhor T5 (7 pecas) | 52 (45-55) | > 60 | > 60 |
| Arma + armadura Lendarias T5 (2 pecas) | > 60 | > 60 | > 60 |
| Conjunto Lendario T6 (7 pecas) | > 60 | > 60 | > 60 |
| Conjunto Epico T6 (7 pecas) | > 60 | > 60 | > 60 |
| Conjunto Epico-ou-melhor T6 (7 pecas) | > 60 | > 60 | > 60 |
| Arma + armadura Lendarias T6 (2 pecas) | > 60 | > 60 | > 60 |

**Em resumo:** o 1º comprador de Lendária T4 acha uma peça por volta do dia **12 a 21** (conjunto de 7 só por volta do dia 24, e só em 4 das 5 repetições); o 10º comprador acha uma peça T4 qualquer no dia ~19 mas **nunca** o conjunto; o 100º, nunca. T5 Lendária: a primeira aparece por volta do dia 38 (qualquer encaixe), a arma ou a armadura Lendárias T5 só em 2 repetições de 5. **T6 Lendária não existe em 60 dias.** O conjunto Épico T4 chega ao 1º comprador no dia 18, ao 10º no dia 29 e ao 100º nunca; o Épico T5, ao 1º no dia 52 e ao 10º nunca.

O que os compradores da população conseguiram (repetição 0; "7 peças T4+" = todos os encaixes):

| comprador | n | pecas compradas ate o dia 60 (media) | % com 7 pecas T4+ no dia 30 | dia 45 | dia 60 | % com 7 pecas T5+ no dia 45 | dia 60 | % sem nenhuma peca |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Epico, dono do Passe | 36 | 4.1 (3.3-5.3) | 0 | 0 | 0 (0-3) | 0 | 0 | 3 (0-21) |
| Epico, sem Passe | 20 | 0.8 (0.4-1.5) | 0 | 0 | 0 | 0 | 0 | 55 (0-59) |
| Lendario, dono do Passe | 39 | 0.7 (0.5-1.1) | 0 (0-6) | 0 (0-9) | 0 (0-9) | 0 | 0 | 82 (76-86) |
| Lendario, sem Passe | 22 | 0.0 | 0 | 0 | 0 | 0 | 0 | 100 |

Pecas compradas por tier (total de todos os compradores do tipo, ate o dia):

| tipo / tier | dia 30 | dia 45 | dia 60 |
| --- | ---: | ---: | ---: |
| Epico T4 | 121 (108-135) | 131 (117-149) | 131 (119-151) |
| Epico T5 | 0 | 13 (7-16) | 31 (27-38) |
| Epico T6 | 0 | 0 | 0 |
| Lendario T4 | 22 (20-28) | 24 (23-30) | 24 (23-31) |
| Lendario T5 | 0 | 1 (0-1) | 3 (2-7) |
| Lendario T6 | 0 | 0 | 0 |

Dia da primeira compra (mediana dos compradores): Epico dono 20 (18-21), Lendario dono 20 (19-24); Epico sem Passe 23 (22-25), Lendario sem Passe -.

**T4 Épico: as 131 peças anunciadas foram todas compradas** (e as 24 Lendárias T4 também): a demanda (117 compradores x 7 encaixes) é 5 vezes a oferta anunciada. Os primeiros compradores por nível (donos do Passe, que chegam ao 50 antes) levam tudo; os sem Passe chegam depois e ficam sem nada (55% a 100% sem nenhuma peça).

Índice de preço (modelo: escassez do estoque contra os compradores que ainda esperam a melhor peça; 3 é o teto):

| indice \ dia | d1 | d3 | d7 | d14 | d21 | d30 | d45 | d60 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| T4 Epica | 1.00 | 1.00 | 1.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| T4 Lendaria | 1.00 | 1.00 | 1.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 |
| T5 Epica | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.41 | 3.00 | 3.00 |
| T5 Lendaria | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.73 | 3.00 | 3.00 |
| T6 Epica | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.87 |
| T6 Lendaria | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.63 |

O índice trava no teto de T4 a partir do dia 14 e de T5 a partir do dia 45: **o mercado está em escassez permanente de tudo que é Épico ou melhor de tier 4+.** (Um modelo de preço não diz preço; diz que o vendedor de uma Lendária T4 ou T5 nunca tem concorrência.)

Sensibilidade (mesmas medições com outras hipóteses declaradas; só o mercado, nada é jogado de novo):

| hipotese | conj. Epico T4: 1o | 10o | 100o | conj. Lendario T4: 1o | arma+armadura Lendarias T4: 10o | conj. Epico T5: 1o | arma Lendaria T5: 1o | Lendarias T4+ anunciadas ate d60 | % donos com 7 pecas T4+ (Epico / Lendario) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 18 (17-22) | 29 (25-46) | > 60 | 24 (4/5) | > 60 | 52 (45-56) | > 60 | 30 | 0 / 0 |
| anuncia metade (30% dono / 60% sem Passe -> 15% / 30%) | 20 (19-23) | > 60 | > 60 | > 60 (2/5) | > 60 | > 60 (2/5) | > 60 | 13 | 0 / 0 |
| anuncia o dobro (60% / 100%) | 17 (17-18) | 23 (22-24) | > 60 | 21 (18-29) | > 60 | 51 (45-55) | 47 (3/5) | 51 | 3 / 5 |
| guarda a Lendaria para si (anuncia metade das Lendarias) | 18 (17-22) | 29 (25-46) | > 60 | > 60 (2/5) | > 60 | 52 (45-56) | > 60 | 13 | 0 / 0 |
| menos desistencia (45% jogam ainda no dia 30 / 35% no 60 sem Passe; 80% / 70% dono) | 17 (17-21) | 29 (25-29) | > 60 | 24 (20-28) | > 60 | 52 (45-56) | > 60 | 38 | 5 / 3 |
| metade dos compradores | 18 (17-22) | 29 (25-46) | > 60 | 24 (4/5) | > 60 | 52 (45-56) | > 60 | 30 | 0 / 4 |
| o dobro de compradores | 18 (17-22) | 29 (25-46) | > 60 | 24 (4/5) | > 60 | 52 (45-56) | > 60 | 30 | 1 / 1 |
| 50% donos do Passe (em vez de 30%) | 17 (17-20) | 28 (3/5) | > 60 | 20 (4/5) | > 60 | 46 (3/5) | > 60 | 35 | 0 / 3 |
| Selo guardado para tier 5+ | 15 (14-22) | 28 (27-47) | > 60 | 22 (18-24) | > 60 | 57 (52-60) | > 60 | 33 | 43 / 3 |
| todos anunciam tudo (teto da oferta: 100%) | 17 | 22 (20-24) | > 60 | 18 (18-21) | > 60 | 47 (45-51) | 47 (3/5) | 71 | 9 / 7 |

Nenhuma hipótese razoável dá um conjunto Lendário ao 10º comprador. Anunciar o dobro leva a oferta de Lendárias T4+ de 30 para 51 e traz o 1º conjunto Épico T5 para o dia 51; **anunciar tudo (100%) ainda dá só 71 Lendárias T4+ em 60 dias** para 117 compradores. Guardar a Lendária para si (metade anunciada) corta a oferta pela metade. Mais donos do Passe (50% em vez de 30%) ou menos desistência pouco mudam (a oferta é limitada pela chance de rolar, não por quem joga). Guardar o Selo para tier 5+ faz 43% dos donos compradores de Épico completarem um conjunto T4+ (contra 0%), porque o Selo gasto no T4 era demanda de T4 já satisfeita com uma peça ligada.

### 3. Quanto Ouro o comprador ainda precisa em 60 dias

O mercado cobra em dinheiro, não em Ouro: **comprar a peça custa zero de Ouro**. Mas o herói comprador continua refinando, lapidando, reparando, bebendo Elixir e alargando a mochila. Estes números vêm do próprio `Player` (Ouro de cada herói, por política G = gulosa e S = esperta; "oráculo" = conjunto cheio de graça, "real" = o que o mercado deu; `q00` o melhor dos compradores, `q50` o mediano).

| heroi | ganha/dia d30 | gasta/dia d30 | ganha/dia d60 | gasta/dia d60 | na mao d14 | d30 | d45 | d60 | ganho total 60 dias | gasto total 60 dias | dias travado por Ouro |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| G: nao comprador (PG) | 2 161 | 789 | 1 135 | 1 144 | 7 136 | 25 050 | 30 621 | 29 052 | 105 345 | 90 434 | 3 |
| G: Lendario oraculo | 2 331 | 1 475 | 765 | 2 643 | 20 550 | 43 210 | 62 310 | 42 937 | 137 691 | 94 899 | 3 |
| G: Lendario oraculo com dragao (como a Rodada 24) | 3 581 | 1 323 | 833 | 1 368 | 18 013 | 41 494 | 54 691 | 47 449 | 141 571 | 97 238 | 3 |
| G: Lendario real q00 | 3 213 | 1 379 | 1 079 | 566 | 7 763 | 43 313 | 27 702 | 49 777 | 133 832 | 78 274 | 3 |
| G: Lendario real q10 | 2 580 | 1 129 | 1 048 | 2 018 | 8 552 | 32 462 | 37 049 | 53 093 | 139 828 | 78 345 | 3 |
| G: Lendario real q50 | 2 250 | 661 | 1 181 | 1 054 | 8 552 | 37 300 | 26 340 | 25 383 | 95 279 | 69 622 | 3 |
| G: Epico real q50 | 2 395 | 1 347 | 1 254 | 2 963 | 8 552 | 32 354 | 24 239 | 8 903 | 98 892 | 107 647 | 3 |
| G: Lendario +8 real q50 (hipotetico) | 2 250 | 661 | 1 181 | 1 054 | 8 552 | 37 300 | 26 340 | 25 383 | 95 279 | 69 622 | 3 |
| S: nao comprador (PS) | 2 165 | 688 | 1 480 | 2 769 | 7 136 | 31 191 | 18 151 | 13 157 | 160 466 | 154 545 | 3 |
| S: Lendario oraculo | 2 459 | 1 426 | 2 418 | 2 430 | 20 075 | 52 494 | 69 113 | 62 832 | 163 387 | 100 990 | 3 |
| S: Lendario oraculo com dragao (como a Rodada 24) | 2 647 | 1 251 | 1 717 | 1 833 | 19 280 | 48 467 | 71 017 | 75 768 | 165 985 | 92 778 | 3 |
| S: Lendario real q00 | 2 243 | 1 182 | 4 406 | 3 034 | 6 456 | 37 758 | 23 110 | 18 317 | 149 535 | 134 870 | 3 |
| S: Lendario real q10 | 2 165 | 688 | 1 480 | 2 769 | 7 136 | 31 191 | 18 151 | 13 157 | 115 530 | 119 345 | 3 |
| S: Lendario real q50 | 2 165 | 688 | 1 480 | 2 769 | 7 136 | 31 191 | 18 151 | 13 157 | 115 530 | 119 345 | 3 |
| S: Epico real q50 | 2 918 | 789 | 2 899 | 3 048 | 7 136 | 22 724 | 13 957 | 71 | 111 397 | 114 579 | 3 |
| S: Lendario +8 real q50 (hipotetico) | 2 165 | 688 | 1 480 | 2 769 | 7 136 | 31 191 | 18 151 | 13 157 | 115 530 | 119 345 | 3 |

Ouro gasto em 60 dias, por destino (mediana das seeds):

| destino | G: nao comprador | G: Lendario oraculo (conjunto cheio) | G: Lendario real q00 | G: Lendario real q50 | S: nao comprador | S: Lendario oraculo (conjunto cheio) | S: Lendario real q00 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| estações | 8 182 | 5 655 | 7 698 | 11 429 | 14 356 | 5 898 | 11 983 |
| forja | 8 485 | 3 370 | 8 150 | 11 385 | 22 790 | 3 370 | 20 150 |
| refino | 4 338 | 4 846 | 5 582 | 4 938 | 77 166 | 51 606 | 53 819 |
| poções | 4 020 | 4 740 | 5 820 | 4 170 | 6 030 | 7 770 | 5 370 |
| alquimia | 24 226 | 16 486 | 24 810 | 18 460 | 21 110 | 11 250 | 21 270 |
| mochila | 27 750 | 15 250 | 7 750 | 7 750 | 1 750 | 750 | 3 750 |
| baú | 785 | 245 | 245 | 245 | 785 | 785 | 785 |
| lapidar | 14 400 | 30 850 | 25 200 | 15 100 | 13 800 | 19 650 | 14 850 |
| reparo | 152 | 960 | 748 | 304 | 152 | 1 136 | 420 |

Ouro ganho em 60 dias, por origem:

| origem | G: nao comprador | G: Lendario oraculo (conjunto cheio) | G: Lendario real q00 | G: Lendario real q50 | S: nao comprador | S: Lendario oraculo (conjunto cheio) | S: Lendario real q00 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| masmorra | 2 886 | 9 336 | 8 008 | 2 606 | 3 280 | 10 617 | 3 430 |
| marcos | 19 000 | 49 000 | 49 000 | 19 000 | 19 000 | 49 000 | 19 000 |
| missões | 9 960 | 11 540 | 12 230 | 9 440 | 16 820 | 15 220 | 16 130 |
| caça | 17 870 | 13 258 | 13 428 | 11 812 | 13 246 | 12 264 | 10 679 |
| pedido | 22 191 | 36 031 | 40 725 | 28 562 | 78 400 | 62 516 | 85 732 |
| mercador | 12 262 | 9 156 | 9 002 | 8 820 | 11 491 | 8 775 | 8 642 |
| atacado | 18 986 | 7 582 | 12 244 | 12 556 | 8 866 | 7 813 | 6 006 |

Leitura:

- **Um comprador de conjunto cheio ainda gasta ~95 a 101 mil de Ouro em 60 dias** (guloso 95 mil, esperto 101 mil), contra 90 mil do guloso e 155 mil do esperto que forjam o próprio. O guloso poupa só 8 mil de forja e estações (9 mil contra 17 mil) e gasta 16 mil a mais em lapidar (Épico e Lendário se lapidam: 31 mil contra 14 mil); o esperto poupa 28 mil de forja e estações e 25 mil de refino (52 mil contra 77 mil) e gasta 6 mil a mais em lapidar. O resto não muda: Elixir do Conhecimento (11 a 25 mil), poções (4 a 8 mil), mochila (1 a 28 mil), reparo (0,2 a 1,1 mil). O Ouro do comprador **não** é a restrição: ele ganha 134 a 163 mil, termina o dia 60 com 43 a 76 mil na mão, e os dias travados por Ouro são os mesmos 3 do não comprador (início do jogo).
- O comprador real (que recebe poucas peças) gasta 70 a 135 mil, a mesma faixa do não comprador (90 a 155 mil). **Com a oferta real, o Ouro de um comprador é igual ao de um não comprador.**
- **Pode pagar?** Sim. O dinheiro vai para a peça; o Ouro vem do próprio jogo. Para quem quiser Ouro por dinheiro, as Bolsas somam 3,5 milhões de Ouro de face em 60 dias (item 1), mas o comprador médio não precisa: ganha mais do que gasta.
- **Não simulado:** a trilha do Passe (~10 mil de Ouro na faixa premium: 1 500, 500, 600, 3 000 e 5 000), as metas semanais e a sequência de login não são reivindicadas pelo `Player`; somam poucos milhares de Ouro e não mudam a conclusão.

### 4. A Liga com a oferta real (mediana de 3 seeds; nível + fração do próximo; mesma seed = mesmos dados)

Dono do Passe. "Oráculo" é o modelo antigo (conjunto cheio de graça assim que o nível permite); "REAL" é o comprador da população com o cronograma que o mercado deu. A linha "+8" é **hipotética**: o refino anula o certificado (`docs/MARKET_FOUNDATION.md`), então ninguém compra uma peça já refinada; o servidor ainda não refina.

Politica GULOSA (so caca onde esta o XP; a de referencia da Rodada 24):

| quem | seeds | dia 14 | dia 30 | dia 45 | dia 60 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nao comprador (PG) | 3 | 50.8 (50.4-51.1) | 65.4 (62.3-66.3) | 77.6 (75.9-79.7) | 87.6 (87.1-90.4) |
| Comprador Epico, conjunto gratis (ORACULO: o modelo antigo, so o nivel limita) | 3 | 52.0 (50.7-53.1) | 65.0 (64.2-65.6) | 78.5 (77.4-78.9) | 89.5 (88.7-90.3) |
| Comprador Lendario, conjunto gratis (ORACULO) | 3 | 52.0 (50.7-53.1) | 65.2 (64.6-66.2) | 79.3 (78.9-80.8) | 91.0 (90.4-92.3) |
| Comprador Lendario, conjunto gratis COM os T4 dragao (ORACULO: o equivalente ao PBG da Rodada 24) | 3 | 50.7 (50.7-52.0) | 65.2 (64.5-65.9) | 79.7 (79.4-80.7) | 91.3 (90.9-92.3) |
| Comprador Lendario +8, conjunto gratis (ORACULO, hipotetico) | 3 | 52.0 (50.7-53.1) | 66.1 (65.8-68.5) | 81.1 (80.8-82.8) | 92.5 (92.1-93.2) |
| Comprador Epico REAL, o melhor de todos (so o que existia) | 3 | 52.0 (50.7-52.3) | 64.1 (63.6-65.4) | 77.6 (77.1-79.0) | 88.8 (88.4-90.1) |
| Comprador Epico REAL, mediano (so o que existia) | 3 | 52.0 (50.7-52.3) | 63.8 (63.1-64.4) | 77.1 (76.8-77.9) | 88.4 (88.2-88.7) |
| Comprador Lendario REAL, o melhor de todos (so o que existia) | 3 | 52.0 (50.7-52.3) | 64.8 (64.2-66.0) | 79.0 (78.7-79.7) | 90.0 (89.9-90.8) |
| Comprador Lendario REAL, melhor 10% (so o que existia) | 3 | 52.0 (50.7-52.3) | 63.2 (62.8-64.9) | 76.7 (76.6-79.4) | 88.1 (88.0-90.6) |
| Comprador Lendario REAL, mediano (so o que existia) | 3 | 52.0 (50.7-52.3) | 62.6 (62.5-64.6) | 76.0 (76.0-77.4) | 87.4 (87.1-87.4) |
| Comprador Lendario +8 REAL (hipotetico), o melhor de todos | 3 | 52.0 (50.7-52.3) | 64.3 (60.9-65.7) | 79.3 (76.0-80.7) | 91.0 (88.3-92.0) |
| Comprador Lendario +8 REAL (hipotetico), mediano | 3 | 52.0 (50.7-52.3) | 62.6 (62.5-64.6) | 76.0 (76.0-77.4) | 87.4 (87.1-87.4) |

Diferenca de nivel contra o nao comprador da mesma seed (mediana):

| par | dia 14 | dia 30 | dia 45 | dia 60 |
| --- | ---: | ---: | ---: | ---: |
| Epico oraculo − nao comprador | 1.2 | -1.2 | -0.2 | 1.2 |
| Lendario oraculo − nao comprador | 1.2 | -0.8 | 1.7 | 3.4 |
| Lendario real (mediano) − nao comprador | 1.2 | -2.9 | -1.6 | -0.1 |
| Epico real (mediano) − nao comprador | 1.2 | -2.3 | -0.8 | 0.6 |
| Lendario real (o melhor de todos) − nao comprador | 1.2 | -0.6 | 1.4 | 2.4 |
| Epico real (o melhor de todos) − nao comprador | 1.2 | -1.4 | -0.0 | 1.2 |
| Lendario real (melhor 10%) − nao comprador | 1.2 | -2.7 | -0.9 | 0.4 |
| Lendario +8 real (mediano, hipotetico) − nao comprador | 1.2 | -2.9 | -1.6 | -0.1 |

Politica ESPERTA (minera e forja o que falta):

| quem | seeds | dia 14 | dia 30 | dia 45 | dia 60 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nao comprador (PS) | 3 | 50.8 (50.4-51.1) | 63.0 (62.3-63.4) | 73.8 (72.7-75.5) | 80.9 (80.3-85.8) |
| Comprador Epico, conjunto gratis (ORACULO: o modelo antigo, so o nivel limita) | 3 | 51.1 (50.8-52.0) | 64.8 (64.7-65.0) | 75.3 (74.2-75.6) | 85.2 (83.2-85.3) |
| Comprador Lendario, conjunto gratis (ORACULO) | 3 | 51.1 (50.8-52.0) | 64.3 (64.1-65.2) | 77.6 (77.4-78.8) | 88.5 (87.0-89.2) |
| Comprador Lendario, conjunto gratis COM os T4 dragao (ORACULO: o equivalente ao PBG da Rodada 24) | 3 | 51.1 (50.8-52.0) | 64.7 (64.3-65.2) | 76.7 (75.8-77.7) | 87.0 (84.9-89.0) |
| Comprador Lendario +8, conjunto gratis (ORACULO, hipotetico) | 3 | 51.1 (50.8-52.0) | 65.1 (64.7-65.7) | 78.6 (76.1-79.1) | 89.8 (88.5-90.8) |
| Comprador Epico REAL, o melhor de todos (so o que existia) | 3 | 50.8 (50.4-51.1) | 63.8 (63.6-64.4) | 74.2 (74.2-76.6) | 84.6 (83.9-85.9) |
| Comprador Epico REAL, mediano (so o que existia) | 3 | 50.8 (50.4-51.1) | 63.5 (62.2-64.2) | 73.9 (72.6-74.2) | 80.5 (80.2-83.1) |
| Comprador Lendario REAL, o melhor de todos (so o que existia) | 3 | 50.8 (50.4-51.1) | 64.0 (63.6-64.3) | 75.2 (75.0-75.3) | 85.1 (84.8-85.8) |
| Comprador Lendario REAL, melhor 10% (so o que existia) | 3 | 50.8 (50.4-51.1) | 63.0 (62.3-63.4) | 73.8 (72.7-75.5) | 80.9 (80.3-85.8) |
| Comprador Lendario REAL, mediano (so o que existia) | 3 | 50.8 (50.4-51.1) | 63.0 (62.3-63.4) | 73.8 (72.7-75.5) | 80.9 (80.3-85.8) |
| Comprador Lendario +8 REAL (hipotetico), o melhor de todos | 3 | 50.8 (50.4-51.1) | 64.4 (63.9-65.1) | 75.0 (75.0-76.7) | 84.8 (84.5-87.9) |
| Comprador Lendario +8 REAL (hipotetico), mediano | 3 | 50.8 (50.4-51.1) | 63.0 (62.3-63.4) | 73.8 (72.7-75.5) | 80.9 (80.3-85.8) |

Diferenca de nivel contra o nao comprador da mesma seed (mediana):

| par | dia 14 | dia 30 | dia 45 | dia 60 |
| --- | ---: | ---: | ---: | ---: |
| Epico oraculo − nao comprador | 0.7 | 1.8 | 0.5 | 2.9 |
| Lendario oraculo − nao comprador | 0.7 | 1.8 | 4.7 | 6.0 |
| Lendario real (mediano) − nao comprador | 0.0 | 0.0 | 0.0 | 0.0 |
| Epico real (mediano) − nao comprador | 0.0 | 0.1 | -1.1 | -0.4 |
| Lendario real (o melhor de todos) − nao comprador | 0.0 | 1.3 | 1.5 | 4.4 |
| Epico real (o melhor de todos) − nao comprador | 0.0 | 0.8 | 1.2 | 3.5 |
| Lendario real (melhor 10%) − nao comprador | 0.0 | 0.0 | 0.0 | 0.0 |
| Lendario +8 real (mediano, hipotetico) − nao comprador | 0.0 | 0.0 | 0.0 | 0.0 |

| heroi | pecas T4 | dia mediano T4 | pecas T5 | dia mediano T5 | pecas T6 | dia mediano T6 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| G Epico q00 | 5 | 14 | 5 | 41 (40-42) | 0 | - |
| G Epico q10 | 5 | 14 | 5 | 41 (40-42) | 0 | - |
| G Epico q50 | 5 | 23 | 1 | 56 | 0 | - |
| G Epico q90 | 2 | 32 | 0 | - | 0 | - |
| G Lendario q00 | 6 | 17 | 1 | 48 | 0 | - |
| G Lendario q10 | 5 | 29 | 0 | - | 0 | - |
| G Lendario q50 | 0 | - | 0 | - | 0 | - |
| G Lendario q90 | 0 | - | 0 | - | 0 | - |
| S Epico q00 | 5 | 15 | 6 | 47 | 0 | - |
| S Epico q10 | 5 | 19 | 3 | 47 | 0 | - |
| S Epico q50 | 5 | 22 | 0 | - | 0 | - |
| S Epico q90 | 2 | 32 | 0 | - | 0 | - |
| S Lendario q00 | 6 | 18 | 1 | 59 | 0 | - |
| S Lendario q10 | 0 | - | 0 | - | 0 | - |
| S Lendario q50 | 0 | - | 0 | - | 0 | - |
| S Lendario q90 | 0 | - | 0 | - | 0 | - |

**Resposta.** Com a oferta de verdade, o ganho do comprador na Liga some para a grande maioria:

| Quem (dia 60, mesma seed, contra o não comprador) | Guloso | Esperto |
| --- | --: | --: |
| Oráculo Lendário (o modelo antigo, com o portão de nível) | +3,4 | +6,0 |
| Comprador Lendário REAL, o melhor de todos | **+2,4** | **+4,4** |
| Comprador Lendário REAL, 10% melhor | +0,4 | 0,0 |
| Comprador Lendário REAL, mediano e pior | **−0,1** | **0,0** |
| Comprador Épico REAL, o melhor | +1,2 | +3,5 |
| Comprador Épico REAL, mediano | +0,6 | −0,4 |
| Lendário +8 REAL, o melhor (hipotético; diferença das medianas) | ≈ +3,4 | ≈ +3,9 |

(Todos pequenos, porque o oráculo desta rodada já é ~3 níveis mais fraco que o da Rodada 24; ler como razão.) O melhor comprador pega ~70% do ganho do oráculo; **o mediano e os de baixo, ~0%**. Em número de peças: o melhor Lendário T4 recebe 6 peças T4 (dia 17 a 18) e 1 T5 (dia 48 a 59); o mediano, **nenhuma**. O Épico T4 chega a 5 peças para os 50% melhores (dias 14 a 23) e a 5 a 6 peças T5 só para o 10% melhor (dias 41 a 47).

### 5. Recomendações (nada foi mudado)

1. **A Lendária 1,40 não está forte nem fraca demais: ela está rara demais para decidir qualquer coisa.** O oráculo mostra que a Lendária vale +3 a +6 níveis na Liga a um conjunto cheio; mas, com a oferta real, o comprador mediano recebe zero Lendária em 60 dias. Subir o 1,40 só reforça um prêmio de loteria. Antes de mexer no multiplicador, decidir *quem deve ter o conjunto*.
2. **Quem compra só leva vantagem se a oferta crescer, e o motivo é a chance de rolar, não a vontade de vender.** Anunciar 100% de tudo ainda deixa o 10º comprador sem conjunto Lendário T4 em 60 dias. Alavancas que movem a conta (estimativas lineares, não rodadas): **Lendária 2% → 4%** (dobra a oferta de Lendárias); um contador de **piedade** (garantia de Épica+ a cada ~8 forjas de tier 4+); queda de **Épica+ de chefe da Masmorra** negociável (hoje só únicos); ou uma **versão negociável do Selo** (as ~591 peças Épicas+ ligadas são 3,1x as 191 que o mercado recebe: um Selo que gere uma peça certificada em vez de ligada levaria a oferta de T4+ de 191 para ~780 (4x)). Incentivos de listagem (taxa menor, destaque) movem a oferta no máximo ~1,7x (30 → 51 Lendárias T4+ ao dobrar a parcela).
3. **O Selo do Ferreiro hoje não ajuda o mercado e satisfaz o dono antes dele.** O dono gasta os 3 Selos nas 3 primeiras peças T4; isso tira ~590 peças da demanda por Épica T4 e não põe nenhuma no mercado. Se o objetivo é "quem compra fica à frente" com um mercado vivo, o Selo no T4 (barato) é um desperdício: o Selo guardado para tier 5+ (hipótese da tabela de sensibilidade) deixa 43% dos donos comprarem o conjunto T4 completo.
4. **Taxas dos únicos: mantidas, mas contar a oferta deles.** 201 únicos de tier 4+ em 60 dias é a maior fonte de peças de tier alto no mercado (contra 35 Épicas T5 e 3 Lendárias T5 anunciadas). Esta rodada não os deixou entrar na demanda do comprador (só conjunto de forja); um comprador que aceite um único T6 de arma ou anel é um jogador à frente, e isso ainda não foi medido. É a próxima rodada se o dono quiser saber quanto do poder de mercado vem dos únicos.
5. **Decidir o portão de vestir.** O motor deixa vestir qualquer peça em qualquer nível (item 0). Se o dono quer o portão, é uma checagem em `applyEquipInstance` e na função `bind-item`; se não quer, o comprador de uma Lendária T6 (quando ela existir, depois do dia 60) anda anos à frente.
6. **Não prometer "compre o conjunto Lendário" como atalho de 60 dias.** Em T4 existe estoque para entre 10 e 18 conjuntos Épicos na população (131 peças / 7 é o teto) e para nenhum Lendário completo além do 1º comprador (dia 24, em 4 repetições de 5); em T5, nenhum Épico completo antes do dia ~50; T6 não existe. A oferta cresce com o tamanho da população, mas a demanda também (proporção igual): com 10 000 jogadores a razão oferta/demanda é a mesma.
7. **Risco para o campeonato de temporada:** com o mercado raso, o nível do dia 60 de quem compra depende de sorte de fila (o melhor comprador +2,4 a +4,4, o mediano 0). Se o ranking em dinheiro premia o nível, a posição na fila de compra vira fator de sorte; pesa a favor de não pôr o ranking em dinheiro antes de o mercado ter oferta.

### 6. O que não foi verificado e o que o dono pode contestar

- **A população e o comportamento são hipóteses declaradas** (o topo do `marketPopulation.sim.ts`): a mistura, a curva de churn (60% saem até o dia 7 etc.), a parcela anunciada (30% / 60%), a parcela de compradores (25% dos donos, 6% dos sem Passe) e a regra "o comprador leva a primeira peça anunciada". O que é medido é o que cada arquétipo produz e o que o herói faz com a peça; a sensibilidade (item 2) mostra o quanto a resposta depende dessas hipóteses: quase nada, porque o limite é a chance de rolar.
- **Oráculo mais fraco que o da Rodada 24** (aviso do item 0). Se a causa for um viés do oráculo, o ganho absoluto de todo comprador está subestimado em ~3 níveis; a razão real/oráculo não muda.
- **Só as peças que os jogadores do simulador forjam existem.** Todos os heróis do `Player` usam a linha do machado e a armadura dourada de tier 4; ninguém forja as peças dragão (a peça é comida pela receita de tier 5 no mesmo dia, então nunca sobra uma para anunciar), nem a espada com queimadura. Um jogador real que forje a espada oferece mais variedade; o total de peças Épicas+ não muda.
- **Peças forjadas e consumidas no mesmo dia** (cadeia gilded → dragão → void) não aparecem nas contagens do perfil; são peças que, na prática, o jogador não teria como anunciar.
- **Os compradores não compram únicos nem materiais.** O comprador de materiais negociáveis (para forjar) e o de únicos não estão no modelo; a oferta deles está nas tabelas.
- **O índice de preço é um modelo**, não um preço: o jogo não cobra nada em Ouro por uma peça de mercado.
- **A trilha do Passe, as metas semanais, o login e o Ouro das Bolsas do comprador não são reivindicados** pelo `Player` (mesmo limite das Rodadas 22 e 24).
- **3 seeds por herói comprador** (as medianas por herói têm faixas de 1 a 3 níveis); a comparação dos pares usa a mesma seed.
- **Tempo de execução:** `npm run sim:market` leva ~11 minutos com a máquina parada e 7 processos (perfis ~5 min, oráculos ~2 min, mercado ~10 s, heróis ~4 min); medido 23 minutos com a máquina ocupada. Baixar `profileSeeds` / `heroSeeds` em `MARKET_PARAMS` encurta.


## Rodada 26 — mais Lendárias, piedade e comprador na frente (2026-10-17)

Decisão do dono (2026-10-17), depois da Rodada 25: **subir a oferta de Lendárias** e "quem compra tem que ficar mais na frente, para comprar fazer sentido". As peças do Selo continuam ligadas. Metas do diretor para o dia 60 entre donos do Passe: comprador real mediano **≥ +3 níveis** sobre o não comprador da mesma política, os melhores **+5 a +7**; ninguém chega ao nível 100 e o mais rápido de todos termina em **≤ 98**; o dono do Passe que não compra, mediano, **≥ 82**; guarda dos dias 1 a 21 sem mudança. Commits: `balance: more Legendaries and a pity guarantee`, `balance: buyers who find items get clearly ahead`, `balance: anti-cheat pace from the new fastest seeds`.

**Resumo honesto.** A oferta de Lendárias dobrou, o Épico e a Lendária ficaram mais fortes, o Épico abre dois sub-níveis a mais que o Comum e a Lendária outros dois, e os tetos e pisos (≤ 98, não comprador ≥ 82, guarda dos dias 1 a 21) foram respeitados. **As metas de ganho do comprador não foram atingidas:** o comprador Lendário real mediano fica em **+1,7 (guloso) / +1,2 (esperto)**, o melhor em **+2,7 / +1,7**, o Épico mediano em +0,4. O motivo é medido (itens 3 e 4): o oráculo (conjunto Lendário inteiro de graça) dá só +3,7 / +4,2 nesta configuração, e o comprador mediano tem de 1 a 5 peças, quase todas de tier 4.

### 1. Mais Lendárias e a piedade (commit 1)

| | Antes | Depois |
| --- | --- | --- |
| Tabela de raridade da forja (Comum / Rara / Épica / Lendária) | 63 / 25 / 10 / 2 | **61 / 25 / 10 / 4** |
| Forjas esperadas para 1 Lendária (mesmo item, dado puro) | 50 | **25** |
| Piedade | não havia | depois de **40 forjas de tier 4 ou mais sem Lendária, a 41ª é Lendária** |
| Forjas esperadas até uma Lendária de tier 4+, com a piedade | 50 | **20,3** (a Lendária passa de 4,00% para 4,93% das forjas; nunca mais de 41) |
| Épica ou melhor (tabela / com a piedade) | 12% | 14% / 14,8% |
| Selo do Ferreiro (Épica / Lendária) | 83,3% / 16,7% | **71,4% / 28,6%** (os pesos 10 e 4 da própria tabela) |
| Lendárias esperadas dos 3 Selos de uma temporada | 0,50 | **0,86** |
| Lendárias esperadas de 13 forjas T4+ (as de um dono comum em 60 dias) | 0,26 | **0,64** |

Regras da piedade (`FORGE_PITY` em `rarity.ts`, `rollForgeRarity`): conta a forja **normal** de tier 4, 5 ou 6; a Lendária (do dado ou da piedade) zera o contador; forja abaixo do tier 4 **não** conta e não gasta a garantia; forja com **Selo** não conta, não zera e não gasta (a peça do Selo nasce ligada, nunca vai ao mercado). A Lendária garantida não gasta número aleatório na raridade (só os dados dos substats).

**Onde vive o contador.** Online, no **servidor**: `public.item_pity` (migração `0018_forge_pity.sql`, **não aplicada**: o dono roda), uma linha por conta, RLS ligada e nenhuma política, só o service role lê e escreve. `mint-item` lê o contador, sorteia (`roll.ts rollForgeRarity` sobre a tabela gerada `PITY_TABLE`) e o grava **na mesma instrução** que emite o certificado (`item_commit` ganhou `p_pity`; a assinatura antiga é removida para o PostgREST não ver duas sobrecargas). Duas forjas ao mesmo tempo a partir de 40: uma recebe a Lendária, a outra volta `busy` (429, o sorteio é jogado fora sem ser visto); um pedido repetido (mesmo `requestId`) devolve a resposta guardada e não anda o contador; recusa por limite (cedo demais, taxa, teto do dia) deixa o contador onde estava. O cliente não envia nem recebe o contador (nada na resposta o cita; um campo `pity` no corpo é ignorado). Offline/desktop o aparelho guarda o seu (`stats.forgePity`) e a peça nunca é certificada.

**Limites de cunhagem** (`items/bounds.ts`): `P_EPIC_PLUS` 0,12 → **0,15** (14,8% arredondado para cima). Épicas/Lendárias certificadas por dia e por tier: **15 / 8 / 4 / 4 / 4 / 4** (era 12 / 7 / 4 / 4 / 4 / 4). Os tiers 4 a 6 ficam no piso 4: 2 x 24 h / horas por peça dá 11, 5 e 4,6 forjas por dia, x 0,148 = 1,6 / 0,8 / 0,7; um dono honesto nunca chega perto (o teste soma a piedade). Quem edita o save ganha, no pior caso, 3 e 1 certificados a mais por dia nos tiers 1 e 2 (peças baratas).

Testes novos: `forgePity.test.ts` (16: a regra pura, exatamente a 41ª, reset, tier 4+, contador único em 4/5/6, nenhuma seca maior que 40 em 200 mil forjas, Lendária de longo prazo 4,93%, jogo e servidor iguais, forja offline, Selo, online não toca o contador local, save corrompido), 13 em `items.test.ts` (servidor: 41ª, reset, tier 4+, Selo, uma conta por contador, o cliente não influencia, repetição, corrida, recusas, teto honesto) e `migration0018.test.ts` (estático).

### 2. O comprador na frente (commit 2)

| | Antes (depois do commit 1) | Depois |
| --- | --- | --- |
| Épica `statMult` | 1,04 | **1,15** |
| Lendária `statMult` (substats x1,7, 3 substats) | 1,40 | **1,50** |
| Conjunto de 7 peças, CP em relação ao Comum (T4/T5/T6 +8), Épica | 1,29 / 1,31 / 1,28 | **1,41 / 1,45 / 1,42** |
| idem Lendária | 2,14 / 2,15 / 2,11 | **2,28 / 2,30 / 2,26** |
| Sub-nível do Abismo que o conjunto +8 abre, Comum / Épica / Lendária, T4 | 2 / 3 / 5 | **2 / 4 / 6** |
| idem T5 | 5 / 6 / 8 | **5 / 7 / 9** |
| idem T6 | 7 / 8 / 10 | **7 / 9 / 10** |
| Abismo: XP base por hora | 8 750 | **8 800** |
| Abismo: XP por sub-nível | +4,5% (+40,5% no 10) | **+5% (+45% no 10)** |
| Abismo: portão de CP por sub-nível | x1,25 | **x1,23** (sub-nível 10 no Profundo: 15 564 → **13 461**) |

Degraus pedidos: o Épico abre **dois sub-níveis a mais que o Comum** em todos os tiers, a Lendária outros dois (um no T6, onde acabam os dez). Um teste novo (`itemBalance.test.ts`) trava isso. Incentivos de listagem: **nenhum** (o jogo só tem a taxa fixa de 5% do mercado; não mexi, não criei recurso).

**Como cheguei na zona** (cada linha, uma rodada de `sim:market`; dia 60, dono do Passe, mediana):

| Tentativa | Mudança | Seeds | Não comprador PS / PG | Oráculo Lendário − não comprador (guloso / esperto) | Mais rápido (comprador hipotético com Lendário +8 grátis, PBRG) |
| --- | --- | --: | --- | --- | --- |
| A | commit 1 só (Épica 1,04; Lendária 1,40; zona antiga) | 8 | 83,6 / 87,2 | +4,0 / +5,4 | não medido |
| E1 | Épica 1,12 | 4 | 83,4 / 88,1 | +3,1 / +5,2 | — |
| E2 | Épica 1,15; Lendária 1,50; 6,5%/sub-nível, base 8 200, x1,25 | 4 | 79,8 / 86,0 | +5,5 / +6,9 | — |
| E3 | idem; base 8 400, x1,23 | 8 | 82,2 / 87,8 | **+4,7 / +6,0** | **98,9** |
| F (final) | idem; **5%/sub-nível, base 8 800, x1,23** | 8 | **84,1 / 88,1** | +3,7 / +4,2 | **97,9** |

O E3 dava o melhor ganho do comprador (Lendário real mediano +2,5 / +2,2, o melhor +3,5 / +3,8), mas o comprador hipotético "Lendário +8 grátis" terminava o dia 60 em 98,9 (Rodada 24: 96,7), acima do teto de 98 que o diretor fixou; achatei o bônus por sub-nível para 5% com a base em 8 800 (`sim:econ`, 6 seeds: 97,3 a 97,9; o comprador sem refino PBG 96,8 a 97,1) e paguei com ~1 nível de ganho do comprador. **É a escolha explícita desta rodada: o teto de 98 contra o ganho do comprador.** Aceitar o teto de 99 (E3) devolve ~+0,8 de ganho ao comprador mediano.

### 3. A tabela (final, 8 seeds; dia 60; mediana (mín-máx); `sim:market` com `light`)

Dono do Passe. "Real" = comprador da população (1 000 jogadores, churn, o mercado cheio) **que de fato obteve peças**: o ranking é só entre quem obteve pelo menos uma (quem a fila não serviu aparece em "% sem nenhuma peça" no item 4). Diferença contra o não comprador **da mesma seed**.

Política GULOSA:

| Quem | Antes (commit 1 só) | Depois | Ganho antes → depois |
| --- | --- | --- | --- |
| Não comprador (PG) | 87,2 (83,1-88,5) | **88,1** (84,3-89,5) | — |
| Oráculo Épico (conjunto de graça) | — | 89,9 (88,5-91,0) | +2,0 → **+1,8** |
| Oráculo Lendário (conjunto de graça) | 91,0 (89,8-91,7) | **92,4** (90,5-93,1) | +4,0 → **+3,7** |
| Comprador Épico real, mediano | 87,3 | 88,6 (87,5-89,4) | +0,1 → **+0,4** |
| Comprador Épico real, o melhor | 88,7 | 89,4 (87,6-90,0) | +1,5 → **+1,7** |
| Comprador Lendário real, mediano | 89,2 | 90,1 (88,5-92,3) | +1,3 → **+1,7** |
| Comprador Lendário real, melhor 10% (= o melhor: grupo de poucos) | 90,6 | 90,6 (88,2-91,8) | +3,4 → **+2,7** |

Política ESPERTA:

| Quem | Antes | Depois | Ganho antes → depois |
| --- | --- | --- | --- |
| Não comprador (PS) | 83,6 (79,0-87,4) | **84,1** (79,1-87,8) | — |
| Oráculo Lendário | 89,1 (84,0-90,1) | **87,7** (83,3-91,2) | +5,4 → **+4,2** |
| Oráculo Épico (diferença) | | | +1,2 → **+2,5** |
| Comprador Épico real, mediano | 83,1 | 84,9 (77,4-86,8) | −0,3 → **+0,4** |
| Comprador Épico real, o melhor | 84,3 | 85,0 (81,4-86,6) | +0,1 → **+0,5** |
| Comprador Lendário real, mediano | 84,3 | 85,1 (80,2-87,3) | −0,1 → **+1,2** |
| Comprador Lendário real, o melhor | 84,4 | 85,8 (83,1-89,1) | +0,9 → **+1,7** |

Outros donos do Passe que não compram (mediana de 8 seeds): comum P **81,0**, esperto PS **84,1**, guloso PG **88,1**, esperto de 6 em 6 h PX **95,6** (o mais rápido dos não compradores: 96,5 no pior seed). A mediana do dono que não compra, lida como nas rodadas anteriores (o PS), é **84,1** (o `sim:econ`, 6 seeds, dá 82,3): **meta ≥ 82: sim**.

**Metas do diretor, uma a uma:** mediano ≥ +3: **não** (+1,7 / +1,2 Lendário; +0,4 Épico). Melhores +5 a +7: **não** (+2,7 / +1,7 reais; o oráculo, que é o teto de qualquer comprador nesta configuração, é +3,7 / +4,2). Ninguém no 100 e o mais rápido ≤ 98: **sim** (97,9 no pior seed do comprador hipotético com Lendária +8 grátis desde o dia 1; 97,1 sem o refino; 96,5 o mais rápido real). Mediana do não comprador ≥ 82: **sim**.

### 4. Por que o comprador mediano não passa de ~+1,5 (medido)

| comprador (população de 117, repetição 0) | n | peças compradas até o dia 60 (média) | % sem nenhuma peça |
| --- | --: | --: | --: |
| Épico, dono do Passe | 36 | 4,3 (3,8-5,3) | 6 (0-22) |
| Lendário, dono do Passe | 39 | 1,3 (1,2-1,8) | **74** (64-74) |
| Épico, sem Passe | 20 | 0,7 | 48 |
| Lendário, sem Passe | 22 | 0,0 | 100 |

O Lendário real **mediano** (entre quem obteve) tem 4 peças T4 no dia 22 e nada de T5 antes do dia 60 (esperto); 6 T4 no dia 26 (guloso); o melhor tem 7 T4 (dia 23) e 3 T5 (dia 55) no esperto, 6 T4 (dia 16) e 5 T5 (dia 41) no guloso. O Épico mediano: 5 peças T4 (dias 18 a 26) e nenhuma T5. Uma peça T4 vale pouco nível (o conjunto T4 +8 Lendário abre o sub-nível 6, o T5 +8 o 9 e o T6 o 10): **o ganho da Lendária está nos tiers 5 e 6, que o comprador real só tem depois do dia 40**, quando sobram 20 dias de Liga. O oráculo (tudo de graça, desde que o nível permita) é o teto: +3,7 / +4,2.

**Oferta agora** (mediana de 5 repetições do mercado de 1 000 jogadores; Rodada 25 entre parênteses no cabeçalho da segunda tabela):

| Lendárias anunciadas em 60 dias | T4 | T5 | T6 |
| --- | --: | --: | --: |
| Depois | **46** (40-51) | **10** (9-13) | **1** (0-3) |
| Rodada 25 | 24 | 3 | 0 |
| (controle A: só o commit 1, mesmo mercado) | 55 | 13 | 0 |

(Épicas anunciadas: T4 139 (Rodada 25: 131), T5 29 (32), T6 1 (0). O controle A mostra a variação entre rodadas do simulador: 46 contra 55 nas Lendárias T4 é dado, não efeito dos multiplicadores. Peças Épicas+Lendárias nascidas ligadas pelo Selo: ~590, 3 vezes tudo o que se anuncia.)

| Dia em que o k-ésimo comprador consegue (Rodada 25 entre parênteses) | 1o | 10o | 100o |
| --- | --: | --: | --: |
| Uma Lendária T4 (qualquer encaixe) | 11 (12) | 19 (19) | > 60 |
| Uma Lendária T5 | 36 (38) | 55 (> 60) | > 60 |
| Uma Lendária T6 | 58 (3/5) (> 60) | > 60 | > 60 |
| Uma Épica T4 / T5 | 9 / 31 (11 / 30) | 15 / 45 (15 / 43) | 28 / > 60 (26 / > 60) |
| Conjunto Lendário T4 (7 peças) | 22 (24) | > 60 | > 60 |
| Conjunto Épico T4 | 19 (18) | 30 (4/5) (29) | > 60 |
| Conjunto Épico T5 | 53 (3/5) (52) | > 60 | > 60 |
| Conjunto Lendário T5 | > 60 (1/5) (> 60) | > 60 | > 60 |
| Arma + armadura Lendárias T5 | 50 (> 60) | > 60 | > 60 |

O 10º comprador **ainda não completa um conjunto Lendário** (46 peças T4 para ~39 compradores Lendários x 7 encaixes = 273); a oferta de Lendárias dobrou e a demanda do modelo continua 6 vezes maior. O que moveria a mediana é **peças por comprador**, não multiplicador: com 25% dos donos comprando, cada comprador Lendário recebe em média 1,3 peça; para o mediano ter 5 peças de tier 5 ou mais até o dia 45 a oferta teria de ser da ordem de 5 a 8 vezes maior (estimativa linear, não rodada).

### 5. Guardas (dias 1 a 21) e limites

`npm run sim` (cenário A, 20 seeds, 21 dias): jogo da Rodada 24 → agora.

| Meta | Antes | Depois |
| --- | --- | --- |
| T2 primeira sessão no andar ≥ 8; checkpoint 10 até o dia 2 | 8; dia 2 | **8; dia 2** |
| T3 primeira peça forjada (dia ≤ 2) | 2 | **2** |
| T4 nível no fim do dia 2 / 3 / 14 (20-28 / 20-29 / 45-60) | 24 / 24 / 47 | **24 / 24 / 46 (43-48)** |
| T5 chefe 25 (dia 4-6) | dia 5 | **dia 5** (vitória ao chegar 0%) |
| T6 chegada ao andar 50 (nenhuma seed antes do dia 10) | primeira seed dia 10, mediana 13,5 | primeira seed **dia 9**, mediana 12: **1 dia fora da meta** |
| T6 chefe 50 (faixa 12-16) | primeira seed 10, mediana 15 | primeira seed 10, mediana **12** (20/20 em 21 dias) |
| T7, T8, I1 a I4 | iguais | iguais (I1 dia 6; I4 +0% / +20% / +25,3%) |
| nível no dia 21 | 49 (48-51) | 50 (48-51) |

As três guardas do diretor (andar 8 na primeira sessão, primeira peça até o dia 2, chefe 25 entre os dias 4 e 6) valem. **T6 escorregou um dia numa seed:** a Lendária de 4% (era 2%) de uma forja dos tiers 1 a 3 leva um jogador comum ao andar 50 um dia antes. Não mexi (a meta T6 já estava fora por um dia na Rodada 24).

Limites do servidor:

| Número | Antes | Depois |
| --- | --- | --- |
| `P_EPIC_PLUS` | 0,12 | **0,15** |
| Épicas/Lendárias certificadas por dia, tiers 1 a 6 | 12 / 7 / 4 / 4 / 4 / 4 | **15 / 8 / 4 / 4 / 4 / 4** |
| `xpPerHour` teórico (recalculado) | 25 000 (22 375) | 25 000 (**23 223**) |
| `huntXpFactor` (1,3 x 1,17 x 1,25 x o melhor sub-nível) | 2,671 (x1,405) | **2,757** (x1,45) |
| `ZONE_TABLE` do Abismo (`progress/tables.ts`, gerada) | 8 750, 0,045 | **8 800, 0,05** |
| `levelPace` 75 / 79 / 88 / 92 / 100 / 200 | 32 / 36 / 47 / 53 / 68 / 268 | **31 / 35 / 45 / 51 / 64 / 264** |
| `levelPace` 24 a 68 | 2 / 3 / 7 / 11 / 18 / 25 | iguais (as seeds dão 28 no dia 2; mantido 3, o mais folgado) |
| `floorPace`, `floorCapByLevel` | — | **mantidos** (re-medidos: andar 50 no dia 9, 75 no 9, 90 no 10, 100 no 10; nível 44 andar 40, 46 andar 52, 48 andar 85, 50 andar 100) |

A `levelPace` segue a seed mais rápida de **qualquer** política do dono do Passe (P, PS, PG, PB, PBE, PBR, PBER, PBG, PBEG, PBRG; `sim:econ`, 6 seeds cada; o mais rápido de todos é o comprador hipotético PBRG, 97,3 a 97,9 no dia 60). Todas as tabelas geradas foram regeradas (`item:tables`, `season:tables`).

### 6. O que não foi verificado e o que o dono pode contestar

- **A meta de +3 / +5 a +7 não foi atingida** (item 3). Alternativas, **estimadas e não rodadas**: voltar ao E3 (bônus 6,5% por sub-nível) devolve ~+0,8 ao comprador mediano e põe o comprador hipotético "Lendário +8 grátis" em 98,9; a única alavanca que mexe a mediana de verdade é a oferta (peças por comprador), por exemplo um Selo que gere peça certificada (hoje ~590 peças Épicas+ ficam ligadas), Épica de chefe negociável ou uma piedade mais curta (a cada 20 forjas a Lendária sobe de 4,93% para 6,9% das forjas T4+).
- **O comprador de 6 em 6 h (PX) como comprador** não foi simulado (os heróis compradores são S e G, duas visitas por dia). O PX não comprador já termina em 95,6 (96,5 no pior seed); um PX que também compra passaria dos 98 e talvez do 100. Se a regra "ninguém chega ao 100" tem de valer para ele, é outro teste.
- **8 seeds por herói**: o ranking mediano de um grupo de 5 a 15 compradores tem ruído de ±1 nível; a comparação dos pares usa a mesma seed. As tentativas E1 e E2 têm 4 seeds. O controle A e o final F usam as mesmas seeds.
- **O contador de piedade online é medido só por testes com a loja em memória**; a migração 0018 nunca rodou num banco (o plano de testes SQL está no fim do arquivo).
- **Piedade no simulador:** o `Player` (heróis e perfis) usa o contador local do jogo; o mercado re-sorteia as forjas com o mesmo `rollForgeRarity`. As Lendárias que uma conta recebe do Selo não contam.
- **Faixas de preço** (`ECONOMY_AUDIT.md`, seção 24) continuam estimativas.
- A taxa de 5% do mercado e qualquer incentivo de listagem **não foram tocados**; o jogo não tem outro.
- `npm run sim:market` com `MARKET_PARAMS='{"light":true,"profileSeeds":8,"heroSeeds":8}'` leva ~17 minutos (perfis 7, oráculos 3, heróis 6,5).

## Rodada 27 — comprar material (2026-10-17)

Pergunta do dono: depois da Lendária a 4% e da piedade (Rodada 26), o comprador real ainda ganha pouco (mediano +1,2 a +1,7 níveis no dia 60, 74% dos compradores Lendários sem nenhuma peça) porque há pouca peça pronta à venda. Mas o mercado também lista **~547 mil unidades de material negociável** (70% queda da Caça, 16% minério, 13% madeira) e o comprador da Rodada 26 nunca compra material. Hipótese: a vantagem de quem compra está em **comprar material** (não minerar, não cortar, forjar mais cedo, atingir a piedade antes) e **Bolsas de Ouro**, não em Lendária pronta. **Esta rodada só mede: nenhum número de balanceamento mudou** (só `scripts/sim/`, `package.json`).

**Resumo honesto.**

- A hipótese **vale como teto, não como realidade**. Um comprador com material de graça e sem limite (oráculo) chega ao dia 60 **+10,7 níveis** à frente (esperto; 94,4 contra 84,1) e **+4,5** (guloso; 92,5 contra 87,7), porque **deixa de minerar e cortar madeira (334 h → 0 em 60 dias; a Caça vai de 858 h a 1 187 h)**. Não forja mais peças (22 contra 22 de tier 4+, a forja é travada pelo nível da receita), então **a piedade não chega antes**.
- No mercado real a vantagem cai para **+1 a +2** (mediano) e **+3 a +5** (melhores): o oferta de material negociável **tem o formato errado**. O comprador pede ~3 200 unidades em 60 dias e 74% disso é **material comum (1%)**: cobre, ferro, madeira comum, retalho de couro, osso. Dessas, o mercado tem 12% (cobre), 24% (ferro), 16% (madeira comum), 40% (retalho), 64% (osso) do pedido; o material raro (3%) sobra (obsidiana 95%, madeira ancestral 95%, coração 100%). **A falta é de comum, e o herói continua minerando cobre.**
- O dinheiro quase não pesa: pedir tudo o que o mercado entrega custa **US$ 10 a 12** por comprador no preço do modelo. US$ 10 de orçamento já compra 70% disso (39% do pedido contra 56%); US$ 30, 100 e "sem limite" compram **exatamente o mesmo**. Só a **peça pronta** custa mais (US$ 3,9 a 30 por peça).
- Alavanca testada: subir a chance negociável **só da classe comum de 1% para 3% / 5%** leva o comprador esperto mediano de **+2,0 para +3,7 / +5,5** (média ± erro padrão, 10 seeds). É a maior alavanca medida, e ainda fica na metade do teto de +10,7.

### 1. O que foi medido (e o que é modelo)

**Medido (o Player de verdade, 60 dias, 10 seeds por herói, mesma seed do não comprador):**

- `Player` ganhou entregas de **material** e de **Ouro (Bolsa)** no mesmo `schedule` das peças (`mat`/`qty`, `gold`) e a opção `freeNeeds` (o comprador sem limite). Onde a política mandaria o herói **coletar** (falta da próxima forja, refino da arma e da armadura, bloco de obsidiana, Estante), o oráculo **pede ao mercado** o que pode ser negociável e fica na Caça; só pede o material da receita quando está a até 2 níveis dela (quem compra não estoca nem coleta muito antes). Quando a forja só falta Ouro, abre uma Bolsa. O que ele pediu (`askedMats`, `askedGold`) são as **curvas de demanda** (10 por política).
- Os heróis compradores recebem exatamente o que o mercado entregou ao comprador sorteado (`schedule` com `mat`, `gold` e as peças), e o simulador conta as **forjas T4+ e as Lendárias de verdade** (dados e piedade do jogo) e as horas de minério e lenha.

**Modelo (`scripts/sim/marketBuy.ts`):** (a) cada comprador da população (117: 75 donos do Passe) segue uma das curvas de demanda da sua política (esperto ou guloso), na velocidade dele, e pede o que a curva pediria nos próximos 3 dias; (b) o **estoque** é o que os 1 000 jogadores anunciam (dados negociáveis de `rates.ts` x anuncia 80%), por material, sem validade e sem lote mínimo; (c) a fila reparte o estoque do dia **proporcional ao pedido**; (d) **preço**: valor de referência x `usdPerGold` (0,001: 1 000 de Ouro de referência ≈ 1 hora de Caça das últimas zonas ≈ US$ 1, **uma suposição**: o orçamento é linear nela) x um **índice de escassez** por material e dia (raiz de (pedido de ontem + 20) / (estoque + 20), entre 0,5 e 3); (e) peça pronta a US$ (meio da faixa de `ECONOMY_AUDIT.md` seção 24) x índice de ontem; Bolsa a face x `usdPerGold` x índice (1 a 3); (f) política **M** = só material; **MG** = material + peça (metade do orçamento cada); **MGP** = material 45% / peça 40% / Bolsa 15%; o que sobra da peça e da Bolsa vai para o material do dia 30 em diante.

Comandos: perfis e oráculos como na Rodada 25 (`npm run sim:market`), depois `npm run sim:market:buy` (estágios `need`, `buy`, `buyheroes`, `buyreport`; `MARKET_PARAMS` aceita `usdPerGold`, `budgets`, `buyPolicies`, `commonScale`, `tradeableScale`, `buyHeroSeeds`). A execução desta rodada: `{"light":true,"profileSeeds":8,"heroSeeds":4,"buyHeroSeeds":10,"repeats":5}`; ~5 min o estágio `need`, ~27 min o `buyheroes`.

### 2. O teto: material de graça e sem limite (oráculo)

Dono do Passe, dia 60, nível + fração; mediana (min-max) de 10 seeds; ganho contra o não comprador **da mesma seed**.

| | Não comprador | Oráculo: material grátis | Oráculo: material + Ouro grátis |
| --- | --- | --- | --- |
| Esperto, nível dia 60 | 84,1 (79,1-87,8) | **94,4** (93,4-94,9) | 94,5 (93,5-95,3) |
| Esperto, ganho | — | **+10,7** (+5,6 a +14,2); média 10,6 ± 0,9 | +10,8; média 10,9 ± 0,9 |
| Esperto: horas de minério + lenha / de Caça | 334 / 858 | **0 / 1 187** | 0 / 1 187 |
| Esperto: forjas T4+ / Lendárias | 22 / 1 | 22 / 1 | 33 / 1 |
| Guloso, nível dia 60 | 87,7 (84,2-90,2) | **92,5** (90,2-93,9) | 92,2 (90,4-93,9) |
| Guloso, ganho | — | **+4,5** (+3,2 a +8,2); média 4,9 ± 0,5 | +4,4; média 4,9 ± 0,6 |
| Guloso: horas de minério + lenha | 239 | 0 | 0 |
| Guloso: forjas T4+ / Lendárias | 7 / 0 | 7 / 0 | 7 / 0 |
| Pedido do herói em 60 dias (esperto) | — | 3 099 unidades | 3 826 unidades + 25 498 de Ouro |

Leitura: o ganho vem **todo** do tempo (a Caça ganha 330 h, +38%); a forja não anda mais depressa (22 e 7 forjas com ou sem material, a receita pede nível) e por isso **a piedade e as Lendárias não mudam**. A Bolsa de Ouro dá 11 forjas T4+ a mais ao esperto (22 → 33) mas nenhum nível: o Ouro nunca foi a trava (o oráculo pede ~25 mil de Ouro em 60 dias). O guloso quase não coleta (240 h), então tem menos a ganhar.

### 3. A oferta: o que existe e o que falta

Mediana de 5 repetições do mercado de 1 000 jogadores. Material negociável **anunciado** em 60 dias: minério 89 076, madeira 69 679, Horta 7 866, Caça 380 518; **total 547 139**. **Pedido** dos 117 compradores: 372 368 unidades (3 183 por comprador). Modo só material, sem limite:

| Grupo | Pedido | Anunciado | Comprado | % do pedido atendido | % do anunciado comprado |
| --- | --: | --: | --: | --: | --: |
| Minério | 126 032 | 89 076 | 73 679 | 58% | **83%** |
| Madeira | 31 371 | 69 679 | 16 270 | 52% | 23% |
| Horta | 1 131 | 7 866 | 946 | 84% | 12% |
| Caça | 213 722 | 380 518 | 118 790 | 56% | 31% |
| **Total** | **372 368** | **547 139** | **211 650** | **56%** | **39%** |

Por material (os que mais pesam; o resto, 100%):

| Material (chance negociável) | Pedido | Anunciado | % atendido | Índice de preço (mediana, dias 11-60) |
| --- | --: | --: | --: | --: |
| retalho de couro (1%) | 108 456 | 42 980 | **40%** | 3,00 |
| fragmento de osso (1%) | 86 662 | 55 356 | **64%** | 3,00 |
| cobre (1%) | 39 525 | 4 914 | **12%** | 3,00 |
| ferro (1%) | 20 121 | 4 881 | **24%** | 3,00 |
| madeira comum (1%) | 14 711 | 2 334 | **16%** | 3,00 |
| carvalho (1%) | 5 330 | 2 802 | 53% | 3,00 |
| cogumelo carmesim (2%) | 218 | 45 | 21% | 2,72 |
| obsidiana (3%) | 41 071 | 50 491 | 95% | 0,50 |
| prata (2%) | 16 360 | 19 971 | 98% | 0,50 |
| ouro bruto (2%) | 8 955 | 9 006 | 97% | 0,65 |
| garra / núcleo / sangue / coração / tutano / chifre / estilhaço (2-3%) | 22 642 | 256 879 | 90-100% | 0,50 |

**A oferta é suficiente para o material raro e curta no comum.** O pedido é pesado nos de 1% (couro, osso, cobre, ferro, madeira comum e carvalho: 74% das unidades pedidas) e o mercado só lista 1% deles. Nenhum comprador "esgota" o mercado: 39% do anunciado é comprado e sobram 54 mil unidades de madeira e 261 mil de Caça no dia 60. O **índice de preço se mexe**: nos 10 primeiros dias (os compradores chegam todos juntos, a oferta ainda é pequena) ele vai a 1,5-2,7 e depois cai a 0,7-0,9 no minério; só o comum de 1% fica no teto 3,0 até o fim.

Dinheiro (modelo): o comprador mediano gasta **US$ 6,9** com US$ 10 de orçamento, **US$ 11,7** com US$ 30, 100 ou sem limite (os três compram igual). Preços por unidade com índice 1: minério US$ 0,0035-0,007, madeira 0,0035-0,006, Horta 0,003-0,064, Caça 0,002-0,45.

### 4. A Liga do comprador real (dia 60, dono do Passe)

Ganho contra o não comprador da **mesma seed**: média ± erro padrão (mediana); 10 seeds. "Mediano" = o comprador do meio entre os servidos (pelo valor de referência comprado) e "melhor" = o mais servido (que **não** é o de melhor resultado: ele é o que mais comprou, e compra muito osso e retalho que não liberam tempo). Em US$ entre parênteses: gasto do mediano / do melhor.

Esperto:

| Política, orçamento | Mediano | Melhor |
| --- | --- | --- |
| M, US$ 10 (7 / 7) | +1,6 ± 0,8 (+0,7) | +1,6 ± 1,2 (+2,3) |
| M, US$ 30 / 100 / sem limite (10 / 16) | +2,0 ± 0,9 (+1,2) | +1,6 ± 1,0 (+1,1) |
| MG, US$ 10 (6 / 7) | +0,5 ± 1,2 (+1,5) | +1,9 ± 0,6 (+1,9) |
| MG, US$ 30 (22 / 18) | +3,2 ± 0,9 (+4,1) | +3,8 ± 1,1 (+3,8) |
| MG, US$ 100 (45 / 63) | +1,9 ± 0,9 (+1,3) | +2,7 ± 0,6 (+2,5) |
| MG, sem limite (22 / 187) | +1,3 ± 1,1 (+1,8) | +3,2 ± 1,1 (+3,3) |
| MGP, US$ 10 (6 / 7) | +1,0 ± 0,8 (+0,6) | +1,1 ± 1,2 (+2,1) |
| MGP, US$ 30 (22 / 21) | +1,3 ± 1,2 (+0,9) | **+4,6 ± 1,3** (+5,4) |
| MGP, US$ 100 (50 / 56) | +1,2 ± 1,2 (+1,8) | **+4,9 ± 1,3** (+5,3) |
| MGP, sem limite (37 / 216) | +3,1 ± 0,9 (+2,9) | +3,2 ± 1,1 (+3,3) |

Guloso:

| Política, orçamento | Mediano | Melhor |
| --- | --- | --- |
| M, US$ 10 (7 / 8) | +0,8 ± 0,7 (+0,2) | +1,7 ± 0,6 (+1,9) |
| M, US$ 30 / 100 / sem limite (6 / 9) | +0,6 ± 0,8 (+0,5) | +1,5 ± 0,7 (+2,3) |
| MG, US$ 10 (5 / 7) | +0,4 ± 1,0 (+1,0) | +1,2 ± 0,5 (+1,3) |
| MG, US$ 30 (16 / 24) | +1,1 ± 0,4 (+1,3) | +3,0 ± 0,6 (+2,6) |
| MG, US$ 100 (41 / 59) | +2,5 ± 0,7 (+2,4) | +3,7 ± 0,7 (+3,6) |
| MG, sem limite (102 / 625) | +1,4 ± 0,5 (+1,4) | **+4,1 ± 0,8** (+3,4) |
| MGP, US$ 10 (5 / 7) | +0,1 ± 0,7 (+0,3) | −0,2 ± 1,0 (+0,5) |
| MGP, US$ 30 (10 / 16) | +1,4 ± 0,6 (+1,5) | +1,5 ± 0,7 (+1,0) |
| MGP, US$ 100 (44 / 50) | +1,1 ± 0,7 (+1,3) | +3,8 ± 0,7 (+3,3) |
| MGP, sem limite (103 / 625) | +2,4 ± 0,6 (+2,5) | +4,1 ± 0,8 (+3,4) |

**Contra as metas do diretor (mediano ≥ +3, melhores +5 a +7):** o mediano fica em **+0,5 a +3,2** (esperto) e **+0,1 a +2,5** (guloso); o melhor, em **+3 a +5** (esperto: +4,6 e +4,9 com MGP de US$ 30 e 100; guloso: +4,1). Na Rodada 26 (só peça) eram +1,2 / +1,7 (mediano) e +1,7 / +2,7 (melhor): **o melhor comprador ganhou ~+2 a +3 níveis, o mediano pouco**. O erro padrão é de 0,5 a 1,3 e a diferença entre dois orçamentos vizinhos quase nunca passa de 2 erros: leia faixas, não linhas. O que se vê com firmeza: (1) **US$ 10 não basta**, abaixo de US$ 30 o ganho é ≤ +1,6; (2) acima de US$ 30 **material sozinho não sobe** (a oferta, não o dinheiro, é o limite); (3) o ganho do melhor comprador vem da **peça pronta** (MG e MGP, +3 a +5), como na Rodada 26; (4) a **Bolsa de Ouro não compra nível** (MGP ≈ MG em todos os orçamentos); (5) as horas de minério e lenha do comprador caem de 334 para ~300 (M) e 220-330 (MG/MGP), contra 0 do oráculo: **o herói comprador continua minerando cobre**. Forjas T4+ e Lendárias não mudam (esperto 22 e ~1, guloso 7-9 e ~0): a hipótese da piedade antes **não aparece**.

### 5. Alavancas: o material comum negociável

Só `commonScale` (chance negociável da classe de 1%, de `rates.ts`) muda; mesmas seeds, mesmo pedido, política M (US$ 30) e MGP sem limite. Média ± erro padrão (mediana), 10 seeds, dia 60.

| Chance negociável do material comum | Pedido atendido (soma) | Cobre / ferro / madeira comum atendidos | Esperto M, mediano | Esperto M, melhor | Esperto MGP, melhor | Guloso M, mediano | Horas de minério + lenha (esperto M, mediano) |
| --- | --: | --- | --- | --- | --- | --- | --: |
| 1% (hoje) | 56% | 12% / 24% / 16% | +2,0 ± 0,9 (+1,2) | +1,6 ± 1,0 | +3,2 ± 1,1 | +0,6 ± 0,8 | 299 |
| 3% | 88% | 37% / 73% / 47% | +3,7 ± 1,5 (+3,8) | +3,0 ± 1,4 | +4,3 ± 1,2 | +1,6 ± 0,6 | 234 |
| 5% | 94% | 62% / 98% / 79% | **+5,5 ± 0,9** (+5,0) | +2,9 ± 1,2 | +3,3 ± 1,0 | +1,3 ± 0,6 | 200 |
| (oráculo) | 100% | 100% | +10,7 | | | +4,5 | 0 |

A alavanca **funciona** para o esperto mediano (de +2 para +5,5) mas **para a meio caminho do oráculo**, ainda a 200 h de minério e lenha. O guloso quase não sente (só tem 240 h de coleta a liberar). O melhor comprador não melhora (ele já é o que compra peça).

### 6. Recomendação (nada foi alterado)

1. **A alavanca mais barata é a chance negociável do material comum, de 1% para 3% (ou 5%).** É uma linha de `rates.ts` (`CLASS_RATE.common`), sem mexer em receita, em XP ou em Lendária. Pelo medido: com 5%, 94% do pedido é atendido e o mediano esperto sobe ~+3,5 níveis. **Efeito colateral:** a oferta de comum cresce 3 a 5 vezes (retalho + osso anunciados em 60 dias: 98 mil hoje, 495 mil a 5%) e o índice de preço do couro e do osso cai de 3,0 para 0,5, ou seja, o vendedor desses materiais vende quase de graça; é o contrário do que a Rodada 23 cortou (3/5/8% → 1/2/3% "para o mercado não inundar") e precisa da decisão do dono.
2. **Receitas mais pesadas em material nos tiers 5 e 6 (não medido).** O ganho do comprador é proporcional ao tempo de coleta que a receita obriga o não comprador a gastar: hoje são 334 h (esperto) ou 240 h (guloso) em 60 dias; o teto é +10,7 / +4,5 níveis. Receita mais pesada aumenta o teto, **mas só vale se a oferta comum acompanha** (alavanca 1), senão o comprador também fica sem o cobre.
3. **Piedade mais curta (não medida aqui).** Esta rodada mostra que a piedade não é o gargalo do comprador: ele **não forja mais peças** (22 e 7 forjas T4+ com ou sem material), então uma piedade de 40 para 20 mexe a Lendária de **todos** igual, comprador ou não. Para o comprador a alavanca é tempo, não forja.
4. **O Passe esperto tem 10 níveis de teto, o guloso 4,5.** Se o dono quer "comprador claramente na frente" sem passar de 98 no dia 60 (o oráculo esperto chega a 94,9 no melhor seed; um PX de 6 em 6 h que compra tudo **não foi simulado** e pode passar de 100), o alvo é o comprador esperto a **+4 a +6** (alavanca 1 a 5%), não o teto.

### 7. Modelo contra medido, e o que não foi verificado

- **Medido:** o nível, as horas de coleta e de Caça, as forjas T4+ e as Lendárias dos heróis (o `Player` e as funções do jogo, dados e piedade incluídos). **Modelo:** quem compra, o pedido (reaproveitado do herói do oráculo), o estoque, a fila, o preço em US$ (`usdPerGold` 0,001 é suposição) e o índice.
- **A curva de pedido é a do oráculo**, que corre à frente de um comprador com orçamento: o pedido de um comprador pobre chega um pouco cedo (3 dias de antecipação) e o herói real recebe material que ainda não precisa, ou deixa de receber o que o oráculo pediria mais tarde. Por isso o herói com 94% de cobertura (comum a 5%) ganha +5,5 e não +10,7. A diferença é uma mistura de oferta que falta (cobre 62%) e desencontro de tempo; **não separei as duas**.
- **Ruído:** 10 seeds por herói, erro padrão de 0,5 a 1,5 níveis; um herói isolado varia ±5. Os dois compradores do rank (o mediano e o mais servido) são **um** comprador cada, da repetição 0 do mercado (as outras 4 repetições entram só nas tabelas de oferta e de demanda). Por isso a leitura da seção 4 é por faixa.
- **Compradores sem Passe** (6% da população) entram no mercado (pedem e compram) mas **não foram jogados como herói**.
- **Sem lote mínimo e sem validade do anúncio** (o mercado real só vende lote inteiro de 1 a 10 000 unidades de um material e o anúncio vence em 30 dias): o modelo compra qualquer quantidade e o estoque nunca expira.
- O oráculo não pede o material de **Elixir**, **poção** e **pedido de entrega** (o Player coleta para a forja, o refino, a obsidiana tardia e a Estante); as plantas do Elixir vêm do próprio canteiro.
- `commonScale` mexe só na oferta de anúncio do mercado simulado; as curvas de pedido (oráculo) são as de 1%, que o jogador de hoje teria.
