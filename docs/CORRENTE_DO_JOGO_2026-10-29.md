# Onde a corrente do jogo quebra — 29/10/2026

Pergunta do dono: "quero tudo interligado, uma coisa completa a outra". Pergunta da sessão DIRETOR: mapear a interligação real, medindo, e dizer onde ela não acontece. Tudo abaixo foi lido dos dados do jogo (`gear.ts`, `refining.ts`, `potions.ts`, `huntingZones.ts`, `garden.ts`, `skills.ts`) e das simulações; nenhum arquivo do jogo foi alterado.

## 1. O mapa, em uma frase por atividade

| Atividade | Produz | Quem precisa de verdade | Veredito |
|---|---|---|---|
| **Caça** | XP do herói e 85 a 95% de todos os materiais de todo equipamento | as três classes, todo tier | é a espinha dorsal; tudo depende dela |
| **Masmorra** | ouro, Éter, gemas, únicos, relíquias; **nenhum material** (os 4 biomas têm `drops: []`) | gemas para receitas de tier 3 em diante (3 a 6 por conjunto); abre as zonas de Caça (andares 26, 51, 76, 90) | ligada por porta e por gema, não por material |
| **Mineração** | minério → barras | todas as armas e armaduras, em quantidade pequena e **igual para as três classes** | imposto fixo, não identidade de ninguém |
| **Lenhador** | madeira → cabos | todas as armas, baú, pó de refino | imposto fixo, ainda menor |
| **Horta** | ervas, flores e fibras | poções e tônicos (todos); **a linha inteira do mago** | identidade do mago, mas com uma parede (seção 3) |
| **Ofícios** | barra, couro, cabo, tecido, essência, escamas, pó | toda forja e todo refino+ | funciona; essência e escamas vêm só da Alquimia |
| **Pedidos** | ouro e Éter | consomem o excedente barato da Caça e de minério/madeira | sumidouro, não elo |
| **Mercado** | SOL | só peças épicas+ e material de coleta negociável | fora desta medição |

Nenhum material do jogo fica sem consumidor, e nenhum consumidor pede material sem fonte: a corrente está **formalmente fechada**. O problema não é elo faltando, é **peso**: duas atividades pesam quase nada e uma pesa demais.

## 2. O que um conjunto completo custa, por atividade (medido)

Conjunto de 7 peças, com as peças dos tiers anteriores que a receita consome e todo o refino expandido até o material bruto. Horas: Caça a 220 rolagens/h (ritmo de referência), zonas em paralelo; Mineração e Lenhador na taxa do nível que o tier pede; Horta com os canteiros do nível da planta.

| Classe | Tier | Caça (h) | Mineração (h) | Lenhador (h) | Horta (h de canteiro ÷ canteiros) |
|---|---|---|---|---|---|
| Guerreiro | 4 | 57 | 15 | 4 | 4 |
| Guerreiro | 6 | 161 | 16 | 5 | 9 |
| Arqueiro | 4 | 77 | 8 | 10 | 4 |
| Arqueiro | 6 | 207 | 9 | 11 | 8 |
| Mago | 4 | 42 | 10 | 9 | **115** (692 canteiro-horas) |
| Mago | 5 | 98 | 10 | 9 | **397** (2.382 canteiro-horas) |
| Mago | 6 | 137 | 11 | 10 | **480** (2.882 canteiro-horas) |

Em unidades brutas, o guerreiro de tier 6 precisa de 3.285 itens de Caça contra 256 minérios e 100 madeiras. A **armadura de placa é feita de material de Caça** (garra, farrapo, sangue, osso); o minério é um detalhe.

## 3. As lacunas, por quanto o jogador sente

### Lacuna 1 — O mago de tier 5 e 6 está atrás de uma porta que o próprio desenho fechou

**O que está quebrado.** As duas últimas fibras pedem Jardinagem 50 (luar) e **70 (seda do vazio)**. A seda do vazio entra nos conjuntos de tier **5 e 6** (105 e 135 unidades). Jardinagem 70 custa 28.666 XP; toda planta rende exatamente 5 XP por canteiro-hora, então são **5.733 canteiro-horas, 955 h com os 6 canteiros: uns 40 dias de replantio perfeito, 24 h por dia**. Depois disso, o conjunto de tier 6 pede mais 2.160 canteiro-horas de seda do vazio (16 h cada, 1 por colheita): mais 15 dias. Enquanto isso o guerreiro chega ao tier 6 com Mineração 60 (3.856 unidades, perto de 100 h de coleta).

**Como medi.** `skillXpToReachLevel(70, 'gardening')` e `plantHarvestXp` de cada planta; a expansão das receitas de tecido até a fibra.

**Por que aconteceu.** A curva da Horta acima do 45 foi deixada íngreme de propósito em 15/10 (Rodada 21), **para o ranking de profissão não empatar no teto em 60 dias**. As fibras de nível 50 e 70 entraram em 28/10, em cima dessa curva, sem ninguém medir o que ela custava.

**Menor mudança que fecha.** Baixar o nível das fibras (luar para ~35, seda do vazio para ~50), mantendo a curva do ranking como está. Isso é número de conteúdo: decisão do dono. A alternativa de achatar a curva reabre o problema do ranking.

### Lacuna 2 — Mineração e Lenhador não são a corrente de ninguém

**O que está quebrado.** O GDD (seção 8) diz que "cada classe nasce numa atividade diferente: guerreiro na Mineração". Medido: o conjunto de tier 6 do guerreiro pede 256 minérios, o do arqueiro 211, o do mago 218. Em horas, Mineração é 9% do custo do guerreiro e Lenhador 3%. As duas profissões são um imposto pequeno e igual para todos; a identidade por atividade só existe para o mago (Horta) e, por exclusão, para ninguém mais, porque a Caça é de todos. Como as duas não dão XP de herói (decisão do dono), um jogador que perceba isso as toca só quando uma receita trava.

**Como medi.** Tabela da seção 2.

**Menor mudança que fecha.** Mover o grosso da armadura de placa para barras (o que ela deveria ser), tirando garra e farrapo das receitas de placa na mesma medida, de modo que o guerreiro tenha na Mineração o que o mago tem na Horta. Total de horas do conjunto mantido; só a origem muda. É equilíbrio e conteúdo: decisão do dono. Sem isso, qualquer melhoria em Mineração e Lenhador é cosmética.

### Lacuna 3 — A Masmorra não alimenta a Forja

**O que está quebrado.** Os quatro biomas têm `drops: []` desde 07/09 (decisão: a Caça é a única fonte de material). O que restou são gemas (1 por chefe, a cada 25 andares) e os pontos de passagem que abrem as zonas. No Albion, o elo equivalente é o **artefato**: um item que só a masmorra solta e que a receita de equipamento avançado exige. Aqui, um herói pode forjar o tier 6 inteiro sem passar do andar 90 além do que a porta da zona 5 pede.

**Como medi.** `dungeon.ts` (drops vazios), `waves.ts` (chefe: ouro, Éter, 1 gema, único, relíquia), e a seção D do mapa de consumidores.

**Menor mudança que fecha.** Um material exclusivo de chefe (25/50/75/100 e Profundezas), em quantidade pequena e só nas receitas de tier 5 e 6 (como a essência e as escamas já fazem pela Alquimia). Não é "farm" de masmorra: é uma unidade por chefe. Isso mexe na decisão de 07/09, então é do dono.

### Lacuna 4 — Tendão, pena e pó não caem onde o jogador está entre o nível 40 e o 75

Já relatado em `AUDITORIA_CLASSES_2026-10-29.md` e **em execução pela DIRETOR** (item 1). Na árvore de trabalho de agora, a Fenda e o Abismo já têm os três materiais. Fica aqui só para o mapa ficar completo.

### Lacuna 5 — Duas das três classes nunca foram simuladas dia a dia

**O que está quebrado.** O jogador simulado (`scripts/sim/player.ts`) joga só de guerreiro: não planta fibra e não planeja tendão (o próprio arquivo diz isso, linhas 302–304). Toda tabela de "dia 10 / 30 / 60", todo teto do antifraude e toda medição de oferta de material foram tiradas de um guerreiro. O que um arqueiro ou um mago vive no dia 30 **ninguém mediu**: a parede da Lacuna 1 só apareceu agora porque eu contei à mão.

**Como medi.** Lendo a política do simulador e a saída do `materialSupply.sim` (fibras: 0 colhidas em 60 dias).

**Menor mudança que fecha.** Dar ao simulador duas políticas (arqueiro e mago: plantar fibra, caçar onde cai tendão) e imprimir as mesmas tabelas que já existem para o guerreiro. Pode ser feito sem perguntar; é ferramenta, não jogo.

## 4. O que o Albion faz e cabe num idle (só o que liga ofícios entre si)

| Mecânica do Albion | Aqui | Veredito |
|---|---|---|
| Refinar o tier N consome o refinado do tier N−1 | a **peça** do tier N consome a peça do tier N−1 (`recipe.items`) | existe, por outro caminho |
| Arma cruza famílias (arco = madeira + couro) | arco = cabo + couro + tendão; cajado = cabo + barra + tecido | existe |
| Artefato de masmorra obrigatório no equipamento avançado | não existe (Lacuna 3) | falta |
| Comida/poção que melhora coleta e ofício | tônicos da Horta (coletor, prospector) | existe |
| Ferramenta de coleta forjada por ferreiro | picareta de ferro abre o ferro | existe, só uma |
| Cada peso de armadura nasce de uma coleta diferente | só o tecido (Horta); placa e couro nascem os dois da Caça | metade (Lacuna 2) |

## 5. Resumo para decidir

**Decisões do dono (número, conteúdo ou desenho):**
1. Nível das fibras luar e seda do vazio (Lacuna 1).
2. Placa feita de barras em vez de material de Caça (Lacuna 2).
3. Um material de chefe de Masmorra nas receitas de tier 5 e 6 (Lacuna 3; revê a decisão de 07/09).

**Pode ser feito sem perguntar:**
4. Políticas de arqueiro e mago no simulador (Lacuna 5).
5. Corrigir o GDD seção 8, que hoje descreve uma simetria que os números não têm.

## 6. Quando cada porta de profissão abre (medido pelo `professions.sim.ts`)

| Porta | Nível | Quando um jogador comum chega (2 visitas por dia) |
|---|---|---|
| Ferro / carvalho | 10 | dia 1 |
| Prata / ébano / seda selvagem | 25 | dia 2 a 3 |
| Ouro / élfica / **luar** (tecido tier 4) | 50 | Mineração dia 6; **Horta dia 7 a 9** |
| Obsidiana / anciã (placa e couro tier 5 e 6) | 60 | Mineração dia 10 (8 h/dia de coleta) |
| **Seda do vazio** (tecido tier 5 e 6) | **70** | Horta: entre o nível 60 (dia 15 a 21) e o 75 (dia 79 a 117); pela curva, **dia 40 a 55**. Mineração 70 (não exigida por nada) seria dia 44 |

A coluna da Horta supõe replantio a cada 12 h em todos os canteiros desde o dia 1. O guerreiro e o arqueiro têm o material do tier 6 destravado por volta do dia 10; o mago, por volta do dia 50, numa temporada de 60.

**Nota de ferramenta:** a última tabela do `professions.sim.ts` ("Adubo em TODO plantio") imprime zero em todas as células. O cálculo está quebrado, não o Adubo; vale um conserto quando alguém mexer no arquivo.

## 7. O que o guerreiro simulado faz, e até quando (livro-razão do `materialFlow.sim.ts`, 60 dias, 4 sementes)

- **Dia 1 a 7:** caça na Clareira e no Pântano, minera cobre e ferro só quando a próxima peça pede, corta madeira comum e carvalho. Tudo o que a Caça solta já é "abundante" no dia 3 e "inundado" no dia 7 (uso real abaixo de 40%).
- **Dia 8 a 21:** caça na Fenda (126 h no fundo, mediana) e começa o Abismo; minera prata (992 unidades nos dias 15 a 21) e corta ébano (1.195) porque o tier 4 pede; ferro e cobre não são mais tocados. Todo material de Caça e de Horta está "inundado": o jogador acumula sem destino.
- **Dia 22 a 60:** o relatório da ferramenta **para no dia 21** (as faixas são fixas: 1, 2–3, 4–7, 8–14, 15–21), mesmo com `SIM_DAYS=60`. Só as horas por zona mostram que ele passou 204 h no Abismo profundo. **Nenhuma ferramenta do repositório imprime o que o jogador faz nos dias 30 e 60 por material**: isso é uma lacuna de medição, e vale mais do que uma estimativa minha.

O retrato: **a partir da segunda semana, Mineração e Lenhador só acontecem quando uma receita trava, e a Caça produz 2 a 3 vezes o que qualquer coisa consome**. Os Pedidos e o mercador são o destino do resto. É aqui que "uma coisa completa a outra" deixa de ser verdade para o guerreiro; para o arqueiro e o mago, ninguém mediu (Lacuna 5).

**Dois defeitos da ferramenta, de passagem:** o `materialFlow.sim.ts` rotula tendão, pena e pó arcano como fonte "horta" (são da Caça), e as faixas de dias não acompanham `SIM_DAYS`.
