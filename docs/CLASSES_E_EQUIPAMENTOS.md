# Classes e equipamentos — "você é o que você usa"

Especificação da reforma pedida pelo dono em 28/10/2026. Modelo de referência: **Albion Online** (só a mecânica de materiais e de equipamento definir o papel; nada de copiar arte, nomes ou habilidades).

> **Regra de ouro desta reforma: é ADITIVA.** Nenhum item, material, receita ou número que já existe muda. Um save de hoje continua idêntico; quem está jogando não perde nada. Tudo aqui são linhas novas ao lado das atuais.

---

## 1. O que o dono pediu (28/10/2026)

- **Sem classe pré-escolhida.** O jogador não escolhe "sou guerreiro": ele é o que está vestindo, como no Albion.
- **Três classes: Guerreiro, Arqueiro, Mago.** (Assassino foi descartado por ele: "guerreiro, arqueiro e mago já é suficiente".)
- **Mais de uma variação por classe.** Cada classe tem duas linhas de arma, não uma.
- **Misturar é permitido e às vezes melhor.** Exemplo do dono: "bota de couro que deixa mais rápido, capacete de ferro, machado".
- **Materiais novos** para sustentar os equipamentos novos.
- **Nada de arte de herói.** O herói não precisa aparecer vestido; só o rosto basta. Ícone de item, sim.
- **Encaixar no mercado**, que é a parte mais importante para ele.
- Só web. Sem Steam, sem desktop. Web3/carteira.

Decisões dele no mesmo pedido, já fechadas: Mineração e Lenhador **não** dão XP de herói; **sem** Pix; **Stripe sai** do código (resumo guardado em `docs/`); quinta zona de Caça liberada; os 4 ajustes de interface pendentes liberados.

---

## 2. O desenho

### 2.1 Três pesos de armadura, três famílias de arma

O que define a classe é a combinação **peso da armadura + família da arma**. Nenhum campo novo de "classe" entra no save.

| Peso | Linha de material | O que dá | Papel |
|---|---|---|---|
| **Placa** | minério → barras (Fornalha) | vida e resistência | Guerreiro: aguenta, desce fundo na Masmorra |
| **Couro** | retalho → couro (Curtume) + tendão | velocidade de ataque e chance de crítico | Arqueiro: mata rápido um por um, bom em chefe |
| **Tecido** | fibra → tecido (**Tecelagem**, nova) | multiplicador de crítico e regeneração | Mago: mata muitos, melhor na Caça |

(A **mecânica** de cada classe — área, tiro de abertura, bloqueio — fica na arma e na mão secundária, não na armadura. O porquê está na seção 2.4.)

As quatro peças de peso são **armadura, elmo, luvas e botas**. A **mão secundária** (o slot `shield` que já existe) muda de nome na tela para "Mão secundária" e passa a aceitar três coisas: **escudo** (placa, já existe), **aljava** (couro) e **grimório** (tecido). Nenhum slot novo é criado.

As seis linhas de arma (campo `line` em `gear.ts`):

| Classe | Linha | Perfil |
|---|---|---|
| Guerreiro | `sword` (já existe) | equilibrado, queima nos tiers altos |
| Guerreiro | `axe` (já existe) | mais dano, metade do crítico |
| Arqueiro | `bow` | ataque rápido, crítico alto, **2 tiros de abertura** |
| Arqueiro | `crossbow` | tiro pesado, multiplicador de crítico alto, **1 tiro de abertura** |
| Mago | `staff` | lento e pesado, **área** + queimadura |
| Mago | `scepter` | mais rápido, **área** menor + roubo de vida |

### 2.2 As duas mecânicas novas de combate

Hoje os três papéis acabariam todos sendo "dano". Para o Arqueiro e o Mago existirem de verdade no combate automático, entram **duas** mecânicas, e só duas:

**`openingShots` (Arqueiro)** — número de ataques que o herói dá antes do inimigo conseguir responder. À distância, o inimigo precisa chegar perto. Implementação: o primeiro ataque do inimigo naquela luta atrasa `openingShots × heroMs`. Vale em toda luta nova (cada abate na Caça, cada onda na Masmorra), por isso rende mais onde há muitas lutas curtas.

**`splashPct` (Mago)** — fatia de cada golpe que também atinge o **próximo** inimigo da fila. O inimigo seguinte começa a luta já machucado. Numa fila de abates, isso vira a classe de produção: mais abates por hora na Caça, que é XP e material por abate desde a Rodada 31.

Os dois campos são **opcionais**: um herói sem arma de arqueiro/mago passa pelo mesmo caminho de código bit a bit igual ao de hoje.

Além disso, `blockChance` (que já existe em `CombatStats`, hoje só vindo de Habilidades) passa a poder vir de **escudo**, fechando a identidade do Guerreiro sem código novo de combate.

Onde mexer, nos três laços que precisam concordar (é a armadilha clássica deste repositório):
1. `src/game/huntCombat.ts` — laço de eventos da Caça
2. `src/components/BattleModal.tsx` — laço por quadro da Masmorra
3. `scripts/sim/driver.ts` — espelho do segundo, usado pelas simulações

E em `derivedStats.ts` → `combatPowerCore`, com peso próprio (`cpSplashWeight`, `cpOpeningWeight`) em `T.advanced`, como todo efeito fechado já tem.

### 2.3 Afinidade: a classe aparece sozinha

**Antes de escrever qualquer coisa: o jogo já tem metade disto pronto (conferido em 28/10).** `setBonuses.ts` já faz "3 ou 5 peças de uma família nos sete slots instanciados → um bônus", e esse bônus já desce por `buildCombatStats` até a Caça, a Masmorra, o CP e o simulador. Construir uma afinidade do zero seria uma **segunda cópia da mesma mecânica**, com dois sistemas de bônus disputando os mesmos slots. Não fazer isso.

O que as duas coisas respondem é diferente, e por isso as duas existem, mas compartilham a mesma máquina:

| Camada | Pergunta | Como entra |
|---|---|---|
| **Conjunto** (já existe) | "5 peças do mesmo tier?" | 12 famílias novas: uma por (tier × peso novo), nos moldes das 7 que já existem. Recompensa de progressão. |
| **Afinidade** (nova) | "5 peças do mesmo peso, de qualquer tier?" | `affinity.ts`, mas **devolvendo um `SetEffect`**, o mesmo tipo do arquivo acima. |

`buildCombatStats` soma `setBonuses.totals` **e** `affinity.totals` no mesmo ponto, com a mesma forma de efeito. Uma mecânica, dois motivos para merecê-la — nunca duas máquinas.

Por que a afinidade precisa existir mesmo assim: as famílias de conjunto são **presas ao tier**, então um arqueiro com botas de couro tier 3 e peitoral de couro tier 4 não teria bônus nenhum, e misturar tier é o normal enquanto o jogador sobe. A afinidade ignora o tier e olha só o peso, que é o que o dono descreveu.

**Cuidado que isto cria:** dois sistemas que premiam uniformidade (mesmo tier *e* mesmo peso) empurram o jogador para o conjunto puro, contra o pedido do dono de que misturar seja bom. Então os números da afinidade ficam **modestos** de propósito. O que faz misturar valer a pena é o perfil de stat dos três pesos (seção 2.4), não o bônus.

Mudança estrutural que a fase 2 tem de fazer em `gear.ts`: hoje `FAMILY_BY_TIER` dá **uma** família por tier e `setFamily` é derivado só do tier. Com três pesos por tier isso passa a estar errado — as três armaduras do tier 2 cairiam todas em `iron`, e um conjunto misturado ganharia bônus de 5 peças que não merece. A família passa a ser por (tier × peso).

### Como a afinidade conta

Conta as 5 peças de peso (armadura, elmo, luvas, botas, mão secundária) e olha a família da arma:

- **3 peças** do mesmo peso → bônus pequeno; **5 peças** → bônus cheio.
- Com a **arma da família** combinando, o bônus cheio vira o bônus de classe:
  - **Guerreiro** (placa + espada/machado): +% vida máxima, +% resistência.
  - **Arqueiro** (couro + arco/besta): +% velocidade de ataque, +crítico.
  - **Mago** (tecido + cajado/cetro): +% área, +% dano de queimadura.

Misturar não dá bônus de afinidade, mas **mantém o stat de cada peça**. É assim que o exemplo do dono funciona: bota de couro por velocidade + elmo de ferro por vida é uma escolha legítima, às vezes melhor que o conjunto puro para um objetivo específico. O jogo nunca escreve "sua classe é X": a tela de Personagem mostra a afinidade atual como um selo, e pronto.

### 2.4 Números: orçamento, não 84 linhas escritas à mão

Cada tier já tem um orçamento de poder por peça, fixado pela linha de placa que existe hoje. Os pesos novos **redistribuem o mesmo orçamento**, não aumentam.

**Correção importante sobre o desenho inicial (conferida com número em 28/10).** A primeira versão desta especificação punha a área e a queimadura do mago na *armadura* de tecido. Está errado por dois motivos: área e queimadura não entram no CP de um duelo (a área não faz nada numa luta só), então a paridade de CP viraria circular — eu escolheria o peso no CP para fechar a conta em vez de medir o que a mecânica vale de verdade. E uma armadura cuja ficha é quase toda mecânica é difícil de mostrar na tela e de equilibrar.

O desenho certo separa as duas coisas:

- **A armadura define o perfil de stat** (eixo defesa ↔ ataque, que o CP mede bem).
- **A arma e a mão secundária definem a mecânica da classe** — que é onde uma classe deve ser declarada de todo jeito: você pega um cajado, você é mago.

| Peso | Fica com | Devolve em |
|---|---|---|
| **Placa** | 100% da defesa | — |
| **Couro** | 60% da defesa | velocidade de ataque e chance de crítico |
| **Tecido** | 60% da defesa | multiplicador de crítico e regeneração |

Assim os três pesos têm identidade de stat distinta (aguentar / atacar rápido / bater forte e se sustentar), nenhum é "equipamento pior", e `splashPct`, `openingShots` e `blockChance` ficam só em **arma + mão secundária**. Efeito colateral bom: misturar fica mais rico — um guerreiro de placa pode carregar um grimório para provar um pouco de área.

**A paridade tem solução folgada** (conferido num cálculo direto do núcleo do CP, herói nível 50, conjunto tier 4 completo, CP 639):

| Redistribuição | Crítico total que iguala | Velocidade que iguala | Intervalo resultante |
|---|---|---|---|
| −15% de defesa | 32,5% | +5% | 848 ms |
| −25% de defesa | 35,7% | +9% | 819 ms |
| −40% de defesa (o adotado) | ~44% | ~17% | ~760 ms |
| −70% de defesa | 53,3% | +30% | 689 ms |

Tudo longe dos dois limites que tornariam a conta impossível: crítico nunca chega a 100% e o intervalo nunca encosta no piso de 400 ms. O cálculo está em `scripts/sim/weightBudget.gen.ts` (fase 2), que resolve o fator por peso e por tier e escreve a tabela que `gear.ts` consome. A regra de aceitação é **conjunto completo dos três pesos, no mesmo tier, dentro de ±5% de CP** (`itemBalance.test.ts`). Número de conversão escrito à mão aqui é dívida garantida.

Os gates de nível seguem os que já existem: T1 nível 1, T2 10, T3 25, T4 50, T5 70, T6 90 (peças menores do T5/T6 escalonadas 72–80 e 92–100, como hoje).

**Cuidado com o CP:** `combatPowerCore` é uma média geométrica de dano e vida efetiva (`sqrt(dps × ehp)`), então ele **castiga conjunto desequilibrado**. Uma armadura que só dá ataque, em cima de uma arma que já dá ataque, rende menos CP do que a mesma verba posta em vida. Quer dizer: as taxas de conversão da tabela acima **não podem ser escolhidas no olho** — têm de ser resolvidas numericamente. Por isso a fase 2 entrega também um gerador, `scripts/sim/weightBudget.gen.ts`, no mesmo espírito dos geradores que já existem (`recipeTune.gen.ts`, `seasonTablesBuild.ts`): ele procura o fator de conversão por peso e por tier que iguala o CP do conjunto completo, para um herói de referência em cada tier, e escreve a tabela que `gear.ts` consome. Número escrito à mão aqui é dívida garantida.

### 2.5 Como se prova que as três classes ficaram justas

São duas medidas diferentes, e misturá-las é o jeito mais fácil de errar esta reforma.

**1. Paridade de CP** — só sobre a parte de stat (vida, resistência, crítico, velocidade). Conjunto completo dos três pesos, no mesmo tier, dentro de **±5% de CP** um do outro. Garante que nenhum peso seja simplesmente equipamento pior. Teste: `itemBalance.test.ts`.

**2. Vantagem de papel** — splash e tiro de abertura **não aparecem no CP de um duelo**: área não faz nada numa luta só, e tiro de abertura vale muito em luta curta e quase nada em luta longa. Então a vantagem de cada classe se mede na simulação, em três eixos:

| Eixo | Quem deve ganhar | Medida |
|---|---|---|
| Abates por hora na Caça | Mago | `npm run sim` / `sim:econ` |
| Tempo para matar chefe | Arqueiro | duelo contra chefe de bioma |
| Andar mais fundo na Masmorra | Guerreiro | profundidade alcançada |

**O teto que o jogo já tem, e que muda o alvo (conferido em 28/10).** `huntEconomy.ts` já freia quem mata rápido, e isso bate em cima da identidade do mago. Acima do ritmo de referência da zona, o ganho é `sqrt`, e depois trava num teto:

- **XP:** XP/h = `sqrt(x)`, travado em **1,2×** (`T.hunting.xpPaceCap`). O teto passa a valer em x = 1,44. Ou seja, **o máximo que qualquer build pode ganhar de XP por hora é +20%**, e nada muda isso a não ser o dono mexer no tunable.
- **Materiais:** rolagens/h = `sqrt(x)`, travado em **1,75×** (`T.hunting.economicRollCap`, 220 × 1,75 = 385 rolagens/h). Bem mais folgado: só trava em x = 3,06.

Então "mago mata 25% mais rápido" vira só **+11,8%** de XP por hora, abaixo do mínimo para a classe ter identidade. A conta de quanto o mago precisa limpar mais rápido:

| Ganho de XP/h desejado | Velocidade de limpeza necessária (x) |
|---|---|
| +12% | 1,25× |
| **+16%** | **1,35×** |
| +20% (o teto) | 1,44× ou mais |

**Alvo corrigido:** cada classe **15–20% melhor** no seu próprio eixo (não 25%: o teto de XP torna 25% impossível sem o dono mudar o tunable) e **no máximo ~10% pior** nos outros dois. Para o mago isso significa calibrar `splashPct` para uma limpeza em torno de **1,35× mais rápida** — bem mais área do que a intuição sugere. Um executor que calibrasse a área "no que parece razoável" pararia em +5% e a classe não existiria.

Conferir também o outro lado: área forte na Masmorra, onde as ondas são filas de inimigos, não pode tornar os andares triviais. A fase 4 mede os dois.

**A ordem destes passos não é negociável**, senão a calibração fica circular (eu escolheria o peso no CP só para fechar a conta):

1. Implementar `splashPct` e `openingShots` (fase 4).
2. **Medir** no simulador o que elas valem de verdade: ganho de abates por hora, queda no tempo de chefe.
3. Só então fixar `cpSplashWeight` e `cpOpeningWeight` **a partir da medição**.
4. Por último, resolver o orçamento de stat para a paridade de CP.

Se a paridade não fechar no passo 4, mexe-se na **mistura de stat**, nunca no peso do CP — o peso do CP é um retrato do valor real, não uma alavanca de equilíbrio.

### 2.6 Risco: o antifraude do servidor

**Isto precisa entrar na fase 4, não ser descoberto depois.** O servidor confere o progresso da Caça contra um teto por hora (`huntEconomy.ts` no jogo, `HUNT_CEILING` em `supabase/functions/_shared/materials/tables.ts`). Esses tetos foram calculados para o herói de hoje. Um mago com área **mata mais rápido**, e desde a Rodada 31 XP e material saem **por abate** — ou seja, um mago honesto produz mais por hora do que o teto atual prevê e **seria marcado como fraude**.

O que a fase 4 tem de fazer, nesta ordem:
1. Recalcular os tetos com a melhor build possível de cada classe, não com o herói médio.
2. Regenerar as tabelas do servidor (`npm run material:tables`) e reimplantar as funções.
3. Revalidar a simulação de 100 jogadores: o pior caso honesto estava em 0,59 do limite (22/10), então existe folga — mas tem de ser conferido de novo com as três classes, não presumido.

Se os tetos subirem antes das mecânicas entrarem, abre-se uma janela de trapaça. Se subirem depois, jogador honesto é punido. Os dois passos vão **no mesmo deploy**.

**Correção, com a conta feita (28/10).** Eu havia exagerado este risco. Os tetos do servidor **não são calculados a partir da velocidade de nenhum herói**: `scripts/sim/materialTablesBuild.ts` usa `economicReferenceKillsPerHour × economicRollCap` (220 × 1,75 = 385 rolagens/h), ou seja, o próprio teto. Um mago rápido se aproxima desse limite mas **não pode passar dele**, e ainda há 1,15 de folga (`CEILING_SLACK`) por cima. Então não há teto para subir: basta **regenerar** as tabelas quando o conteúdo muda, que é o que a fase 1 já faz. A simulação dos 100 jogadores continua tendo de ser revalidada (o pior caso honesto estava em 0,59 do limite), mas o risco de marcar jogador honesto é pequeno.

### 2.7 A trava de verdade: as tabelas de equipamento do servidor

Esta é a que morde, e vale para as fases 2 e 3. O servidor julga o nível que uma peça exige por `GEAR_LEVEL_GATES` (`supabase/functions/_shared/progress/tables.ts`, gerado por `npm run season:tables`). A consulta é:

```ts
hasOwnProperty(GEAR_LEVEL_GATES, id) ? GEAR_LEVEL_GATES[id] : 0
```

**Um id que a tabela não conhece recebe gate 0.** Quer dizer: publicar o jogo com as 84 peças novas sem regenerar e reimplantar as funções deixaria um herói de nível 1 equipar uma peça de tier 6. Não é um teste chato, é uma brecha.

Regra para as fases 2, 3 e 6, no mesmo commit e no mesmo deploy:
1. `npm run season:tables` e `npm run item:tables` depois de qualquer peça nova.
2. Reimplantar as Edge Functions antes ou junto com a publicação do jogo — nunca depois.

`src/game/__tests__/seasonProgress.test.ts` falha quando a cópia envelhece, então o portão `npm test` pega o esquecimento. Confiar nele, e não na memória.

---

## 3. Materiais: a linha que falta

Hoje existem três cadeias: **minério → barras** (Mineração + Fornalha), **retalho → couro** (Caça + Curtume) e **madeira → cabos** (Lenhador + Carpintaria). Falta a cadeia do tecido, e o couro precisa de um segundo insumo para as armas de arqueiro.

### 3.1 Fibra (Horta) → tecido (Tecelagem, estação nova)

Cinco plantas novas na Horta, nos gates das plantas que já existem:

| Planta | Material | Nível |
|---|---|---|
| Linho | `flax` | 1 |
| Algodão | `cotton` | 10 |
| Seda-selvagem | `wild_silk` | 25 |
| Fio-de-lua | `moonweave` | 50 |
| Seda-do-vazio | `voidsilk` | 70 |

Estação nova `weaving` em `refining.ts`, no mesmo formato das outras (5 fibras → 1 tecido, como a Fornalha):

`cloth_linen`, `cloth_cotton`, `cloth_silk`, `cloth_moon`, `cloth_void`.

Isso dá à Horta um motivo de existir além de poções — hoje ela é a atividade mais fraca do jogo.

### 3.2 Novos drops de Caça

| Material | Para que serve | Raridade |
|---|---|---|
| `beast_sinew` (tendão) | corda de arco e besta | comum |
| `feather` (pena) | aljava, flechas | comum |
| `arcane_dust` (pó arcano) | cajado, cetro, grimório | incomum |

Entram na tabela de drop por zona como os outros (`huntingZones.ts`), respeitando o teto econômico por hora em `huntEconomy.ts`. **Não mostrar taxa na tela** (regra do jogo).

### 3.3 De onde vem cada equipamento

| Linha | Receita, em resumo |
|---|---|
| Placa (já existe) | barra do tier + couro + drops de caça |
| Couro | couro + `beast_sinew` + cabo de madeira do tier |
| Tecido | tecido do tier + `arcane_dust` + gema |
| Arco / besta | cabo de madeira do tier + couro + `beast_sinew` |
| Cajado / cetro | cabo de madeira do tier + `arcane_dust` + gema |
| Aljava | couro + `feather` + `beast_sinew` |
| Grimório | tecido do tier + `arcane_dust` |

Mantida a **regra de cadeia** que já vale: cada peça consome 1 peça do tier anterior do mesmo slot (a partir do T2).

---

## 4. Onde isso aparece no jogo

- **Forja**: a lista ganha filtro por classe (Guerreiro / Arqueiro / Mago) no layout de lista + ficha que já existe. Sem tela nova.
- **Ofícios**: Tecelagem entra ao lado de Fornalha, Curtume, Carpintaria, Pó de Refino e Alquimia.
- **Horta**: cinco sementes novas na lista.
- **Caça**: três drops novos, mais a **quinta zona** (liberada pelo dono) para o dia ~30 ao 60 da Liga.
- **Personagem**: selo de afinidade ao lado da ficha do item. Sem arte de herói nova: as armaduras novas **não** trocam a folha do herói (`ARMOR_LOOKS` só cobre a linha de placa, e continua assim).
- **Mercado**: as peças novas seguem as mesmas regras (só Épico/Lendário/Único, nunca equipado, forjado online). Três linhas em vez de uma multiplicam a variedade negociável — é o que faz a taxa de 5% render.
- **Habilidades**: os três caminhos atuais (Guerreiro / Guardião / Caçador) continuam valendo com qualquer equipamento. Um quarto caminho arcano fica para depois da reforma, não entra aqui.

---

## 5. Fases de implementação

Cada fase fecha com os portões obrigatórios (`npx tsc -b --noEmit`, `npm test`, `npx eslint .`, `npm run build`, `npm run check:bundle`, `npm run check:desktop`) e é commitável sozinha.

| # | Fase | O que entrega |
|---|---|---|
| 1 | Materiais e cadeias | 13 materiais novos, 5 plantas, estação Tecelagem, traduções pt/en. Zero mudança de combate. |
| 2 | Linhas de armadura | Gerador `weightBudget.gen.ts` (seção 2.4) + couro e tecido: armadura, elmo, luvas, botas, mão secundária (aljava e grimório). Inclui a correção de `FAMILY_BY_TIER` (seção 2.3) e as 12 famílias de conjunto novas. |
| 3 | Linhas de arma | Arco, besta, cajado, cetro: 24 peças. |
| 4 | Combate | `splashPct` e `openingShots` nos três laços, `blockChance` em escudo, pesos no CP, **e os tetos do antifraude da seção 2.6 no mesmo deploy**. |
| 5 | Afinidade | `affinity.ts` e o selo na tela de Personagem. |
| 6 | Encaixe | Filtro da Forja, quinta zona de Caça, drops novos, regras de mercado/salvagem/únicos. |
| 7 | Equilíbrio | As duas medidas da seção 2.5: paridade de CP (±5%) e vantagem de papel (15–20%), a revalidação dos 100 jogadores, e a dívida da seção 2.8. |
| 8 | Limpeza | Stripe e Pix fora do código, resumo em `docs/PAGAMENTOS_DESCARTADOS.md`; 4 ajustes de interface. |

Os ícones dos itens novos entram pelo caminho que já existe (`iconPending.ts` e a reserva do `MaterialIcon`) e podem ser gerados depois; nenhuma fase depende de arte.

---

### 2.8 Dívida que a fase 1 descobriu: o simulador não é reprodutível

Ao gerar os picos honestos do antifraude (`HONEST_PEAK_DAY_UNITS` em `rates.ts`, usado por `bounds.ts` para o teto diário de unidades negociáveis), apareceu o seguinte, conferido em três rodadas, inclusive num extrato limpo do HEAD **sem nenhuma alteração**:

| material | no repositório | HEAD limpo | outra rodada |
|---|---|---|---|
| `leather_scrap` | 1149 | 1131 | 1075 |
| `bone_fragment` | 1237 | 1120 | 1081 |
| `common_wood` | 554 | 360 | 618 |

Ou seja: **os números que estão commitados não saem de novo nem do código intocado.** As caças variam 5–10% entre rodadas e a madeira muito mais. Isso é anterior a esta reforma, e tem duas consequências:

1. "Rode o simulador e cole o que ele imprimir" **não é um procedimento confiável** para esses valores. Quem fizer isso vai mexer sem querer em tetos do antifraude que já estão no ar.
2. Os picos dos materiais novos da fase 1 foram derivados **por proporção** a um material de mesma zona e mesma classe, e elevados acima do medido, porque os jogadores simulados dividem o tempo entre zonas enquanto um jogador dedicado caça a mesma zona o dia inteiro — o medido subestimava o honesto e o teto marcaria jogador legítimo com sorte boa. A margem de 2× do `bounds.ts` absorve o resto. As 5 fibras usam o limite analítico da Horta, porque o simulador não planta fibra.

O que a fase 7 tem de fazer: dar ao simulador **política de plantio de fibra e foco de zona**, tornar a semente fixa para a rodada que gera tabelas, e só então substituir os valores derivados por medidos — apertando os tetos, que hoje estão folgados de propósito.

## 6. Respondido pelo dono em 28/10

1. **Data: não existe.** "esquece 31/10 eu tava testando site". O playtest de 31/10 nunca foi firme. Como o **congelamento de conteúdo de 22/10 existia por causa daquela data, ele cai junto**: esta reforma é a linha principal de trabalho e pode levar o tempo que precisar.
2. **"NFT" quer dizer mercado e cripto, não blockchain.** "nft é que vou apenas ter mercado e poder usar cripto mesmo". Então o que já está no ar **é** o pedido: mercado em SOL, Passe em USDC, carteira exigida só para negociar, conta por e-mail joga tudo. **Nada é cunhado on-chain**, não há coleção, não há royalties. Nenhuma fase desta reforma mexe no mercado além de fazer as peças novas obedecerem às regras que já existem.
3. **Carteira: só Solana** (Phantom), que é o que o jogo todo já usa. Ele mencionou MetaMask, mas MetaMask é Ethereum e a resposta dele no item 2 torna o caminho atual suficiente; registrei a recomendação de Solana-só e ele não objetou. MetaMask, se vier, é um segundo caminho de pagamento e um projeto próprio.
