# Economia e materiais

Voltar: [[Comece aqui]] · Ligações: [[Caça e masmorra]] · [[Classes e equipamento]] · [[Antifraude e temporada]] · [[Guardas que existem]] · [[Ferramentas de medição]] · [[O que está em aberto]]

Documentos de origem: `docs/GDD.md` seção 8, `docs/MATERIAL_FLOW.md` (medição do fluxo, Rodada 9), `docs/CORRENTE_DO_JOGO_2026-10-29.md` (onde a corrente entre as atividades quebra), `docs/ECONOMIC_REFERENCE.md`, `docs/PRIMEIRA_HORA_2026-10-29.md`. **Todo número desta nota é uma medição datada**; a fonte é o código e as ferramentas ([[Ferramentas de medição]]).

## O desenho em cinco linhas

- **A Caça é a única fonte de material de combate** e a única fonte de XP do herói. A Masmorra não solta material (os quatro biomas têm `drops: []` desde 07/09): dá ouro, gemas, únicos de chefe, relíquias, e **abre** as zonas de Caça pelos andares.
- Mineração, Lenhador e Horta dão material de coleta. **Mineração e Lenhador não dão XP de herói** (decisão do dono).
- **Três cadeias de material, uma por classe, e cada classe nasce em uma atividade diferente:** guerreiro na Mineração (minério → barra, Fornalha), arqueiro na Caça (retalho → couro no Curtume, mais tendão), mago na **Horta** (fibra → tecido na Tecelagem).
- Moedas: ouro; Éter (`shards` no código) para reforja e operações raras; gemas para soquetes. **A tela nunca mostra porcentagem de drop nem rendimento por hora** (regra do GDD, vale para texto novo).
- Mercado entre jogadores: peças épicas ou melhores e material de coleta negociável, em SOL, certificados pelo servidor; Passe em USDC. Detalhes em `docs/MARKET_SOLANA.md` e `docs/PASS_SALES.md`.

## O que a medição de 29/10 achou sobre a corrente

(`docs/CORRENTE_DO_JOGO_2026-10-29.md`, e o que cada commit do dia fez com ela)

- A corrente está **formalmente fechada** (nenhum material sem consumidor, nenhuma receita sem fonte). O problema é **peso**, não elo faltando: duas atividades pesam quase nada e uma pesa demais.
- Um conjunto completo de tier 6 do guerreiro pede 161 horas de Caça, 16 de Mineração e 5 de Lenhador; a **armadura de placa é feita de material de Caça** (garra, farrapo, sangue, osso) e o minério é um detalhe. Mineração e Lenhador são imposto fixo, igual para as três classes. **Isto contradiz a frase do GDD** "cada classe nasce numa atividade diferente: guerreiro na Mineração", que só é verdade de fato para o mago.
- Antes de 29/10, a **sobreposição entre Horta e Caça era exatamente zero** (a Caça larga 13 materiais, a Horta cultiva 17, nenhum em comum). Hoje, a Clareira larga um fio de linho e algodão: [[2026-10-29 — Materiais de classe não caíam onde a classe joga]].
- **O Adubo** agora paga XP a quem volta tarde: [[2026-10-29 — O Adubo não pagava nada a quem volta tarde]].
- O mago de tier 5 e 6 pedia Jardinagem 50 (luar) e **70** (seda do vazio), que a medição estimou em uns 40 dias de replantio perfeito. **Depois, a própria ferramenta `classDoor.tool.ts` mostrou que o nível não é o gargalo** (com todas as fibras no nível 1 o mago ainda não veste um conjunto tier 3 completo em 30 dias; o que segura é a quantidade de fibra e, do tier 3 em diante, a cópia das famílias de mineração e caça da gêmea de placa, `CLOTH_LINES`, travada a 15% do custo da gêmea por `itemBalance` R7). Então "o mago nasce na Horta" vale para os tiers 1 e 2 e **para aí**, o que o comentário em cima de `CLOTH_LINES` não diz.
- A Masmorra não alimenta a Forja (só gemas e a abertura das zonas). Mineração e Lenhador não são a corrente de ninguém. Os dois pontos estão com o dono ([[O que está em aberto]]).

## Drops de classe (a regra e a armadilha)

- Tendão, pena e pó arcano agora caem também onde o jogador comum passa os dias 20 a 60 (as zonas 3 e 4, Fenda e Abismo; antes só nas zonas 1, 2 e 5), e a pena cai também na Clareira (zona 1) ([[2026-10-29 — Materiais de classe não caíam onde a classe joga]]).
- **Os drops de classe rolam num fluxo próprio** (`seedKey + ':class'`), nunca no `ownRng` compartilhado da zona. Se mover uma entrada para o fluxo compartilhado, toda caça em andamento ou repetida da mesma semente muda de drops. Há teste de mutação que prova isso.
- A raridade é um campo da **entrada do drop**, não do material. O mesmo material pode ser `uncommon` numa zona e `rare` noutra, e o guarda "raro nunca é mais fácil que incomum na mesma zona" cobre toda entrada, sem exceção.
- **O fio de fibra é um fio, não uma segunda fonte.** A 0,1% e 0,07% o mago dono do Passe tirou 38% e 46% da fibra da Caça e a Horta virou opcional para quem paga, que é a única coisa que isto não podia fazer. Ficou em 0,07% (linho) e 0,05% (algodão), na Clareira (`huntingZones.ts`): 19% e 32% na janela que importa. `wild_silk` **não** cai de propósito.
- Primeira caça de um herói novo não pode entupir a mochila: no máximo um terço dos 26 slots (`materialFlow` B3 está em 8 slots; 6 era exatamente o tamanho da sessão antiga, sem folga).

## Material negociável (o servidor decide o que é negociável)

- Material de coleta negociável chega ao jogador como **pilha própria** ("tradeable") separada da normal, e o total continua em `materials`. O jogo reporta o que coletou; **o servidor sorteia** e responde; o jogo marca as unidades até o limite da resposta e do que a mochila segura. Ver `src/game/__tests__/tradeableActions.test.ts` e `tradeableMaterials.test.ts`.
- Gastar unidade negociável enfileira uma **queima**; o pedido repetido leva o **mesmo id**, então o servidor queima uma vez. Pilha negociável nunca passa do saldo do servidor.
- **Sem o servidor, o jogo recusa gastar unidade negociável.** A bandeira "inalcançável" expira em 30 s ([[2026-10-29 — A bandeira de sem conexão nunca voltava atrás]]); se "Sem conexão" persistir com o servidor no ar, o suspeito é a origem: [[Sem conexão com o servidor com o servidor inteiro no ar]].
- O teto diário de cada material é medido (`rates.ts`, `HONEST_PEAK_DAY_UNITS`, colado a partir de `npm run sim:materials` **depois** de `npm run sim:long`). Ver [[Antifraude e temporada]].

## Forja e raridade

- 158 peças; seis tiers com portas de nível 1, 10, 25, 50, 70 e 90; raridades Comum, Incomum, Raro, Épico e Lendário. A forja sorteia 61 / 25 / 10 / 4 (`itemBalance` R4 trava a tabela e confere 120 mil sorteios com semente a 0,5 ponto). Lendário tem garantia na 41ª forja de tier 4 ou mais (`GDD.md`).
- Regras duras do gerador de peças novas: a peça do tier seguinte nunca é pior em nenhum stat; cada passo de tier soma ao menos 15% ao poder que a peça dá a um herói de referência; nenhuma peça é estritamente pior que outra do mesmo slot que custe o mesmo ou menos (`itemBalance`).
- **O conjunto de couro e o de tecido não têm paridade de CP com a placa** desde a fase 8 (`RETURN_SCALE`); o juiz é a tabela de eixos ([[Classes e equipamento]]). Mas a **paridade de custo** (R7: dentro de 15% da gêmea de placa) continua.
- **O primeiro conjunto de cada classe, medido** (herói novo, `docs/PRIMEIRA_HORA_2026-10-29.md`): guerreiro ~1,5 dia, preso pelo cobre (6,1 h de Mineração); arqueiro ~1,5 dia para seis peças, a sétima só no andar 26 **até a pena passar a cair na Clareira**; mago ~4 dias, preso pela Horta, porque o jogador novo não fica 16 h replantando a cada 2 h. As seis armas de tier 1 custam 40 de ouro, nível 0, e saem todas na primeira noite. **O começo não é corredor de material, é fila.**

## O que a simulação de materiais não mede

- A auditoria de 29/10 (`docs/AUDITORIA_CLASSES_2026-10-29.md`) dizia que o simulador não plantava fibra, então a oferta de tecido do mago não estava medida. As ferramentas do mesmo dia (`classDoor`, `fiberShare`) medem o mago simulado somando Caça e Horta; **não verifiquei em que momento o simulador passou a plantar**. **Toda medição de mago feita por `player.ts` antes de `2b61cf6` foi de um mago sem a classe ativa** ([[2026-10-29 — O simulador só jogava o guerreiro]]).
- Fica **sem explicação** que o comum simulado termina o dia 60 um pouco pior depois de tendão a mais, mesmo com 8 slots a mais na mochila. Registrado como possível variância do simulador, em torno de 1 sigma.
