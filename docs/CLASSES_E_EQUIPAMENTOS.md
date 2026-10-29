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

### 2.2 Habilidades de equipamento e a rotação

> **Mudança de rumo do dono, 28/10 (substitui o desenho anterior desta seção).** A versão original tinha duas mecânicas passivas: `splashPct` (o cajado respingava uma fatia no próximo inimigo) e `openingShots` (o arco atrasava o primeiro ataque do inimigo). O dono pediu para ir mais perto do Albion: **cada arma tem habilidades**, as peças de armadura também podem ter, e o jogador **escolhe quais usar e em que ordem**, com tudo rodando automático. Isto é melhor e substitui aquilo: área e tiro de abertura deixam de ser número passivo e viram **habilidades**, que aparecem na tela com nome e efeito em vez de sumirem numa ficha de stat.

#### O modelo

- Cada **linha de arma** dá **3 habilidades**, além do ataque básico. São elas que dão o sabor da classe.
- Cada **peso de armadura** dá **1 habilidade** pelo peitoral: mais defensiva e situacional.
- O jogador monta uma **rotação de até 4 habilidades**, em ordem de prioridade. O ataque básico não ocupa espaço: é o que acontece quando nada está pronto.
- O combate é automático: a cada momento em que o herói atacaria, ele percorre a rotação de cima para baixo e **dispara a primeira habilidade fora de recarga**; se nenhuma estiver pronta, dá o ataque básico.

Isso põe a decisão do jogador exatamente onde um idle aguenta: **montar a rotação**, não apertar botão. E conversa com a regra de design do projeto ("não é um jogo para ficar assistindo"): a rotação é escolhida uma vez e rende por horas.

#### O motor já existe — construir em cima, não ao lado

Pela terceira vez nesta reforma, metade do trabalho já está feita:

- `derivedStats.ts` já tem `StrikeStats` / `StrikeState` / `resolveHeroHit`: golpes que disparam sozinhos **por contador de acertos** (Golpe Esmagador a cada N) e **por tempo** (Fúria a cada `furyEveryMs`), com estado atravessando lutas dentro da sessão.
- `skillFx.ts` e `skillFx.atlas.ts` já são um sistema de efeito visual completo: folha de sprites por efeito, âncora (`target` / `hero` / `heroFeet`), nome flutuante, tremor de tela, escala por tamanho de tela.
- `huntCombat.ts` já carrega `furyLeft` de luta para luta e sorteia em fluxos separados por efeito.

Então uma habilidade é **um gatilho + um efeito + uma entrada de FX**, tudo com peça correspondente já pronta. O que falta é a generalização: recarga em segundos, a lista de prioridade, e os efeitos que o motor ainda não sabe fazer (atingir a fila, atrasar o inimigo, curar, escudo temporário).

#### O conjunto fechado de efeitos

Pequeno de propósito: cada efeito tem de funcionar **nos três laços** (seção abaixo), e um conjunto aberto vira dívida.

| Efeito | O que faz |
|---|---|
| `strike` | um golpe de X% do dano do herói |
| `cleave` | atinge o inimigo atual **e os N seguintes da fila** |
| `volley` | N golpes rápidos de X% cada |
| `dot` | aplica queimadura/sangramento (reusa `DotSpec`, que já existe) |
| `guard` | reduz o dano recebido por X segundos |
| `heal` | cura X% da vida máxima |
| `haste` | velocidade de ataque por X segundos |
| `opener` | atrasa o primeiro ataque do inimigo na luta |

`cleave` é o que era `splashPct`; `opener` é o que era `openingShots`. Os dois sobrevivem, agora como habilidade.

#### As 21 habilidades

**Guerreiro — Espada:** Golpe Firme (`strike` forte) · Estocada Dupla (`volley` 2×) · Brecha (`strike` + `guard`)
**Guerreiro — Machado:** Rachadura (`strike` muito forte, recarga longa) · Giro Brutal (`cleave` 2) · Sangria (`dot`)
**Arqueiro — Arco:** Tiro Potente (`strike` forte) · Chuva de Flechas (`volley` 3×) · Tiro de Abertura (`opener`)
**Arqueiro — Besta:** Virote Perfurante (`strike` pesado) · Tiro Duplo (`volley` 2×) · Tiro Fatal (`strike` + dano crítico)
**Mago — Cajado:** Explosão Arcana (`cleave` na fila) · Chamas (`dot` forte) · Nova (`cleave` + `guard`)
**Mago — Cetro:** Drenar Vida (`strike` + `heal`) · Pulso Sombrio (`cleave` 2) · Bênção (`heal` + `haste`)
**Peitorais:** Postura de Ferro (placa, `guard`) · Esquiva (couro, `haste`) · Fôlego Arcano (tecido, `heal`)

Os números de cada uma (percentual e recarga) saem da calibração da seção 2.5, não da intuição.

> **Correção de 28/10, durante a fase 5.** A lista original trazia "Tiro Certeiro (sempre crítico)". O conjunto de 8 efeitos é fechado de propósito e crítico garantido pediria um nono, então a habilidade virou um golpe forte e **foi renomeada para Tiro Potente** — um nome que promete precisão enquanto a mecânica entrega força seria uma mentira na tela, e o jogador monta a build confiando nela sem nunca descobrir. Há um teste varrendo os textos de pt e en atrás de "crit", "certeiro", "sempre" e "always", para que a promessa não volte.

#### O que isto não muda

O perfil de stat dos três pesos (seção 2.4) **continua valendo**: ele é a camada passiva, as habilidades são a ativa. A fase 2 não é desperdiçada.

`blockChance`, que já existe em `CombatStats` e hoje só vem de Habilidades, passa a poder vir de **escudo** — fechando a identidade do Guerreiro sem código novo de combate.

#### Onde mexer

Os três laços que precisam concordar (é a armadilha clássica deste repositório):
1. `src/game/huntCombat.ts` — laço de eventos da Caça
2. `src/components/BattleModal.tsx` — laço por quadro da Masmorra
3. `scripts/sim/driver.ts` — espelho do segundo, usado pelas simulações

E em `derivedStats.ts` → `combatPowerCore`. **Atenção:** o CP hoje é fórmula fechada, e o dano de uma rotação depende das recargas. A rotação tem de virar um **multiplicador médio de dano por segundo** calculado da própria rotação (soma de `efeito ÷ recarga`, mais o básico no tempo que sobra) e entrar no `dps`. Sem isso o CP mente, e o CP alimenta a curva de dificuldade e o antifraude.

#### Nome na tela

Já existe uma página **"Habilidades"** (as passivas de Guerreiro/Guardião/Caçador, compradas com ponto por nível). Duas coisas com o mesmo nome confundem. Proposta levada ao dono em 28/10: a nova se chama **"Rotação"** (ou "Combate") e a antiga mantém "Habilidades", por já estar no ar. Aguardando a palavra dele.

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
  - **Mago** (tecido + cajado/cetro): +% multiplicador de crítico, +% regeneração.

> **Correção de 28/10, fase 6.** Esta linha dizia "+% área, +% dano de queimadura", o que ficou para trás quando a seção 2.2 mudou de rumo: área virou **habilidade** (`carry`), não stat passivo, e o bônus de afinidade usa o tipo `SetEffect`, que não tem campo de área. O tema do Mago na camada passiva é o mesmo da armadura de tecido (seção 2.4): multiplicador de crítico e regeneração.

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

> **CORREÇÃO DE RUMO, 28/10, depois da medição da fase 8. Leia isto antes do resto da seção.**
>
> **A paridade de CP era a medida errada de justiça, e ela escondeu um desequilíbrio grande.** A medição mostrou o arqueiro ganhando nos **três** eixos: +50% de abates na Caça (o eixo do mago), +53 a +80% em chefe, e empate ou vitória em profundidade de Masmorra. O mago ficou **18% pior** no eixo que era dele.
>
> **A causa é estrutural, não de calibração.** O CP é a média geométrica de dano e vida efetiva — ele trata os dois como igualmente valiosos. Mas **na Caça e contra chefe o herói não morre**, então vida efetiva ali não vale nada e só o dano conta. Um conjunto que troca vida por dano marca "empatado" no CP e ganha de verdade em dois dos três eixos. Em T6: arqueiro com **2841 de dano por segundo contra 1738 do guerreiro (+63%)**, tendo **12% menos CP**.
>
> **O alvo passa a ser o eixo, não o CP.** O que o jogador sente são os três eixos; o CP é um número interno. A partir daqui:
> - **O CP deixa de ser o juiz do equilíbrio.** Ele volta a ser o que sempre foi bom em ser: a régua da dificuldade recomendada e das checagens do servidor.
> - A paridade de ±5% de CP **deixa de ser requisito**. Se o mago precisar de 10% mais CP que o guerreiro para ganhar a Caça enquanto o guerreiro ganha a Masmorra, está certo.
> - **A medida de justiça é a tabela de eixos abaixo**, medida no motor real, não em fórmula fechada.
>
> **Duas lições que valem além deste jogo:** uma medida agregada (CP) pode estar correta e ainda assim ser a medida errada, quando o cenário real anula um dos seus termos. E a medição tem de rodar no motor de verdade — a fórmula fechada do CP teria aprovado este desequilíbrio para sempre.

**1. Paridade de CP** — só sobre a parte de stat. Mantida como **sinal de diagnóstico** (um peso muito fora indica erro de orçamento), **não como requisito**. Teste: `itemBalance.test.ts`.

**2. Vantagem de papel — esta é a medida que manda.** Medida no motor real de Caça, de chefe e de Masmorra, com a rotação automática e a afinidade ligadas, cada classe lida contra a média das outras duas:

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

**Alvo:** cada classe **15–20% melhor** no seu próprio eixo (não 25%: o teto de XP torna 25% impossível sem o dono mudar o tunable) e **no máximo ~10% pior** nos outros dois.

**Onde estávamos em 28/10, medido** (cada classe contra a média das outras duas, T6 +8):

| Eixo | Guerreiro | Arqueiro | Mago | Alvo |
|---|---|---|---|---|
| Abates/h na Caça | −25% | **+52%** | −16% | mago +15 a +20% |
| Velocidade em chefe | −25% | **+80%** | −29% | arqueiro +15 a +20% |
| Profundidade na Masmorra | +1% | +4% | −5% | guerreiro +15 a +20% |

Nenhuma célula no alvo, e o arqueiro ganhando tudo.

**O que a decomposição ensinou, e que muda onde se mexe:**

| Camada | Quanto move |
|---|---|
| Equipamento sozinho | o desequilíbrio inteiro (arqueiro já +53% só de equipamento) |
| Rotação | +11 a +14% para as três, **sem mudar a ordem** |
| Afinidade | no máximo +1,4% |

Ou seja: **a identidade de classe não está vindo das habilidades**, e não vai vir enquanto elas renderem o mesmo para todo mundo. A área do mago quadruplicada rende +8% — o tamanho do transbordo não é a alavanca; **a recarga e o teto do transbordo** são.

**Onde mexer, em ordem:**

1. **O dano por segundo do equipamento.** O arqueiro tem +63% sobre o guerreiro em T6. Isso é a mistura de stat do couro e do arco (velocidade × crítico, que se multiplicam), contra placa (vida × resistência, que não viram dano nenhum). A regra continua a mesma: mexe-se na **mistura de stat**, nunca no peso do CP.
2. **A área do mago.** Recarga curta e teto de transbordo alto, não transbordo maior.
3. **Uma vantagem de Masmorra que o guerreiro sinta.** Hoje ele empata com o arqueiro mesmo com mais vida efetiva, porque o arqueiro mata rápido demais para apanhar. Falta algo que só a sobrevivência longa recompense.

**Consequência metodológica, descoberta na fase 5.** Os testes que comparam equipamento (`itemBalance`, `craftedStatsAudit`) têm de medir com a **rotação vazia**, e isso não é contornar teste: é controle experimental. Cada arma concede habilidades diferentes, então comparar arco contra espada com rotação ligada deixa de comparar equipamento e passa a comparar equipamento mais habilidade de brinde — a paridade de ±5% medida assim não significaria nada. Existe um helper único para esse herói "só equipamento", com o motivo escrito ao lado. A vantagem das habilidades é medida à parte, aqui na fase 8.

Uma exceção importante: **`recommendedCp` é a curva do jogador de verdade**, e o jogador de verdade vai ter rotação. Ela segue gerada sem rotação por ora (os números das habilidades são provisórios), com um `REVIEW IN PHASE 8` no código. Se a fase 8 esquecer de regerá-la, a dificuldade recomendada fica abaixo do que o jogador aguenta e ninguém vai entender por quê.

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
- **Rotação** (tela nova, seção 2.2): as habilidades que o equipamento vestido concede, e os 4 espaços em ordem de prioridade que o jogador monta. É a única tela realmente nova da reforma.

---

## 5. Fases de implementação

Cada fase fecha com os portões obrigatórios (`npx tsc -b --noEmit`, `npm test`, `npx eslint .`, `npm run build`, `npm run check:bundle`, `npm run check:desktop`) e é commitável sozinha.

| # | Fase | O que entrega |
|---|---|---|
| 1 | Materiais e cadeias | ✅ `363681e`. 13 materiais, 5 plantas, estação Tecelagem, traduções. Zero mudança de combate. |
| 2a | Linha de couro | ✅ `e874ca0`. 30 peças do arqueiro, 6 famílias, o gerador `weightBudget.gen.ts`, a correção de `FAMILY_BY_TIER`, e o conserto do dado morto (seção 5.1.1). |
| 2b | Linha de tecido | As 30 peças do mago, 6 famílias, `CLOTH_CONVERSION` no mesmo gerador. |
| 3 | Linhas de arma | ✅ Arco, besta, cajado, cetro: 24 peças, e o caminho da arma aberto para `attackSpeedBonus` / `hpRegenPct` / `critMultBonus`. Ver a medição de conjunto de classe em 5.1.4. |
| 4 | **Motor de habilidades** | O gatilho generalizado (recarga em segundos), a rotação de 4 espaços por prioridade, e os 8 efeitos da seção 2.2 nos **três laços**. Inclui o multiplicador de rotação no CP, sem o qual o CP mente. |
| 5 | **As 21 habilidades e a tela** | As 18 de arma e 3 de peitoral, os efeitos visuais (o motor de `skillFx` já existe), e a tela de Rotação. |
| 6 | Afinidade | `affinity.ts` devolvendo um `SetEffect`, somado no mesmo ponto que o bônus de conjunto (seção 2.3), e o selo na tela de Personagem. |
| 7 | Encaixe | Filtro da Forja, quinta zona de Caça, os drops novos nas zonas 3 e 4 (com chave de fluxo própria, seção 5.1.2), regras de mercado/salvagem/únicos. |
| 8 | Equilíbrio | As medidas da seção 2.5: paridade de CP (±5%) e vantagem de papel (15–20%), agora medida com rotação; a revalidação dos 100 jogadores; a dívida da seção 5.1.5. |
| 9 | Limpeza | Stripe e Pix fora do código, resumo em `docs/PAGAMENTOS_DESCARTADOS.md`; 4 ajustes de interface. |

Os ícones dos itens entram pelo caminho que já existe (`iconPending.ts`). **Atualização 28/10:** o dono autorizou gerá-los em pixel art; os 4 primeiros da linha de couro foram feitos e aprovados quanto ao estilo (32×32, contorno escuro, fundo transparente, igual aos que já existem). Nenhuma fase depende de arte.

---

## 5.1 Armadilhas e dívidas encontradas durante a execução

Cada uma destas foi conferida com número no código, não presumida. Elas estão aqui, e não só no commit, porque a fase seguinte precisa delas.

### 5.1.1 Velocidade e regeneração em peça são dado morto (achado na fase 2)

Conferido em 28/10, antes de escrever a linha de couro. **Uma peça instanciada que carregue `attackSpeedBonus` ou `hpRegenPct` não tem efeito nenhum no combate hoje:**

- `gearInstances.ts` → `ExtraSlotStats` tem só `maxHp, damage, critChance, critMult, resistance, reflect`.
- `engine.ts` → `speedBonus = (relic?.attackSpeedBonus ?? 0) + set.attackSpeedBonus`
- `engine.ts` → `hpRegenPct = (relic?.hpRegenPct ?? 0) + fx.hpRegenPct + set.hpRegenPct`

Isto é, os dois campos só funcionam vindos de **relíquia, habilidade ou bônus de conjunto**. É a mesma armadilha que o comentário de `LIVE_STAT_FIELDS` em `gear.ts` descreve: `burn`, `reflect` e outros já ficaram dado morto por muito tempo.

Como o perfil de couro é velocidade de ataque e o de tecido é regeneração (seção 2.4), **a fase 2 não é uma fase de dados**: ela começa estendendo `ExtraSlotStats` e a montagem em `engine.ts`, com um caso em `gearEffects.test.ts` que prove que o bônus vindo de uma *peça* (não de relíquia) muda `heroMs` e a regeneração. O piso de 400 ms de `heroAttackIntervalMs` continua sendo o teto natural do empilhamento.

Convenção a respeitar ao acumular: em `equippedExtraStats`, `critChance` e `reflect` aplicam só `durabilityFactor`; `maxHp`, `damage`, `resistance` e `critMult` aplicam durabilidade **e** multiplicador de raridade. Os dois campos novos entram como o `critChance` (só durabilidade): são fração de efeito, não stat escalado por raridade.

### 5.1.2 Drops novos nas zonas 3 e 4 precisam de fluxo próprio (achado na fase 1)

Em `huntCombat.ts`, **todos os drops marcados `ownStream` de uma zona dividem UM gerador** (`ownRng`) e são sorteados **na ordem do array**, a cada abate. Inserir um `ownStream` numa zona que já tem outros desloca os números dos antigos: a estatística continua a mesma, mas uma sessão repetida da mesma semente passa a dar outro resultado para `rift_shard`, `fiend_horn`, `abyssal_marrow` e `blood_heart`. Quem estivesse no meio de uma caça no Rift veria o resultado mudar.

Por isso a fase 1 pôs os materiais novos **só na glade e no marsh**, que não tinham nenhum `ownStream` anterior. A fase 7, ao levá-los às zonas 3 e 4 (que as armas tier 5 e 6 vão exigir), precisa de uma **chave de fluxo própria** (por exemplo `seedKey + ':class'`) em vez de mais um `ownStream`. O aviso está escrito em `huntingZones.ts`, ao lado dos drops.

### 5.1.3 O crítico do jogo já está perto do teto no fim (achado na fase 3)

Medido no herói de referência do tier 6, conjunto completo a **+8**:

| Origem | Chance de crítico |
|---|---|
| Refino (0,04 por peça × 7) | 0,28 |
| Anel do tier | 0,145 |
| Linha de couro (conjunto) | 0,32 |
| **Conjunto de couro + espada pura** | **0,984** |

O motor corta `critChance` em 1,0 (`buildCombatStats`). Ou seja, **o jogo já chega quase no teto sem nenhuma arma de arqueiro**, e substatutos, gemas e a habilidade Olho Aguçado somam por cima e são descartados. Isso é pressão anterior a esta reforma e não é culpa da linha de couro.

Consequência imediata na fase 3: a primeira versão do arco também empilhava chance de crítico e **estourava o teto (1,16 no T6 +8), jogando fora ~16% do que o jogador comprava**. A correção não foi calibrar, foi **separar os eixos**: a armadura de couro dá chance de crítico, o **arco dá velocidade de ataque**, a besta dá multiplicador de crítico. Cada peça do arqueiro passou a fazer uma coisa. O arco mantém metade do crítico da espada (`WEAPON_CRIT_KEEP`), e o gerador carrega a restrição como filtro duro (`critChance` ≤ 0,95 e `heroMs` ≥ 450 ms no conjunto completo a +8), com teste em `itemBalance.test.ts`.

**Fica para a fase 8:** a besta ainda chega a 0,984 no T6 +8, porque mantém o crítico da espada inteiro. Não desperdiça (está abaixo de 1,0), mas qualquer substatuto de crítico corta. A alavanca de verdade é o crítico plano do refino e o do anel, que valem para todas as classes.

### 5.1.4 Conjunto de classe: a medição que a fase 8 herda

CP do conjunto completo de cada classe contra placa + espada, nas 6 condições (+0/+4/+8, com e sem bônus de conjunto). **Medição, não teste** — a calibração é da fase 8, quando as habilidades existirem e mudarem tudo isto:

| Combinação | Faixa | T6 a +8 |
|---|---|---|
| Arqueiro com arco | 0,965 – 1,002 | 468 ms, crítico 0,864 |
| Arqueiro com besta | 1,003 – 1,080 | 639 ms, crítico 0,984 |
| Mago com cajado | 0,915 – 1,029 | 878 ms |
| Mago com cetro | 0,920 – 1,065 | 878 ms |

A faixa do arqueiro com arco fechou (era 0,926 – 1,007 antes do conserto da saturação). As outras três continuam largas de propósito: **não calibrar agora**. O alvo da seção 2.5 (±5% por conjunto de classe) é da fase 8.

### 5.1.5 O simulador não é reprodutível (achado na fase 1)

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

### 5.1.6 O portão de sub-nível da zona 5 está fora do alcance e pune quem tem CP menor (achado na fase 8, 28/10; NÃO consertado)

O portão (`subLevelCpRequired`, `huntingZones.ts`) vale só em `blood_abyss` e `abyss_throne` (`subLevelCpGrowth: 1,23`), e `engine.ts computeHuntingStatus` o aplica com o CP do herói. A zona 5 herdou o 1,23 da zona 4 com uma base 2,24× maior (3600 contra 1607); o portão da zona 4 foi calibrado contra o alcance real (Rodada 22), o da zona 5 nunca. Medido com `scripts/sim/classGate.sim.ts`:

| CP pedido pelo sub-nível 10 | raso | médio | fundo |
|---|---|---|---|
| `blood_abyss` | 10.355 | 11.908 | 13.461 |
| `abyss_throne` | 23.198 | 26.678 | 30.157 |

- O herói mais forte que o jogo monta (lendário T6 +12, paragon 50, guerreiro, com rotação e afinidade) tem CP **31.794**: o sub-nível 10 do trono fundo existe só para ele. O 17.406 de `recommendedCp.ts` (andar 100) é o teto da escada de comuns, não o teto do jogo; os sub-níveis 8 e 9 (19.933 e 24.518) pedem um build épico ou lendário.
- As classes de luz abrem **menos** sub-níveis que o guerreiro, só por terem CP menor (herói T6 +12, nível 100, razões 1,000 / 0,890 / 0,822): no trono fundo guerreiro 4, arqueiro 3, mago 3; em `blood_abyss` fundo 8, 7, 7. Todas as três vencem as lutas do sub-nível 10 em todas as zonas (0 derrotas em 4 h): quem limita é o portão, não o combate.
- Cada sub-nível vale cerca de 4% de XP por hora (medido: 11.668 no 7 contra 12.118 no 8, `blood_abyss` raso).

Isto vale com os números de hoje, antes de qualquer ajuste de equilíbrio. Não foi consertado de propósito: mexer na curva muda o alvo do equilíbrio das classes. Achatar a curva piora a diferença entre classes (um mesmo déficit de CP vale mais níveis).

**Método (para quem for regerar o portão).** Um número de portão tem de ser regerado quando muda o que ele mede, como as tabelas geradas. O da zona 4 foi calibrado contra combate real em 22/10 (`subLevelReach.sim.ts`) e envelheceu em silêncio quando as habilidades, a afinidade e as três classes mudaram o que "alcance" significa; o da zona 5 nasceu copiado. `scripts/sim/classReach.sim.ts` refaz a medição com as três classes (75 heróis: 3 classes x 25 equipamentos, 2 h por sub-nível):
- Em `blood_abyss` o combate **não discrimina**: um herói T3 +8 comum já vence o sub-nível 10 nos três fundos (em 98% das lutas). O CP do mais fraco que vence cada sub-nível fica em 669 a 976, contra 1.977 a 13.461 que o portão pede. Isto é coerente com o comentário da Rodada 22 ("o portão é o CP, não uma vitória de sorte"): o portão é uma **válvula de progressão** (cada sub-nível vale ~4% de XP), não uma medida de capacidade. Calibrá-lo por combate o dissolveria.
- Em `abyss_throne` o combate discrimina (o T3 +8 guerreiro alcança 5, 2 e 0 nos três fundos), mas **o CP não separa quem vence de quem perde**: no fundo, no sub-nível 10, o mais fraco que vence tem CP 1.991 e o mais forte que perde tem 3.411. O mago T3 (CP 1.861) alcança 9 e o guerreiro T3 (CP 2.117) alcança 0.
- A razão de CP das classes contra o guerreiro, no mesmo equipamento, vai de 0,77 a 1,05 e depende da raridade (o mago lendário passa o guerreiro, o comum perde 22%): nenhuma constante por classe conserta o portão.

**Conserto feito em 28/10 (fase 8): o portão passa a pedir um índice de equipamento, não CP.**
- `src/game/gearIndex.ts`: índice = soma, nos 7 slots, de `tier + 0,1 x refino + bônus de raridade` (raro 0,25, épico 0,65, lendário 1,4), dividida **sempre por 7**; slot vazio vale 0 (tirar a pior peça baixa o índice, e há teste). O melhor equipamento do jogo (T6 +12, tudo lendário) vale 8,6. Os pesos saíram da regressão do CP do guerreiro (por tier 0,553; por refino 0,056; raro 0,135; épico 0,322; lendário 0,795; em tiers: 0,10 / 0,24 / 0,58 / 1,44). O épico declarado é 0,65 e não 0,58 porque a promessa da Rodada 26 ("o épico abre dois sub-níveis acima do comum", `itemBalance.test.ts`) não fecha com 0,58 em nenhuma base abaixo de 3,7.
- `huntingZones.ts`: `subLevelGear: { base, step }` por zona e `gearOffset` por fundo (0, 0,25, 0,5). `blood_abyss`: base 3,7, passo 0,375; `abyss_throne`: base 4,5, passo 0,375. A base 3,7 do abismo é a menor que mantém a promessa da Rodada 26 (a equivalência com o portão antigo para o guerreiro de placa e espada dá 3,5).
- O índice é congelado na sessão de Caça (`HuntSession.gearIndex`), como os stats.
- **Regra, com teste:** o último sub-nível do fundo mais difícil de toda zona com portão tem de ser alcançável com o melhor equipamento do jogo (`zoneLevelGates.test.ts`). O trono pede 8,375 no sub-nível 10 do fundo (melhor equipamento: 8,6); o abismo pede 7,575.
- Textos: `hunting.subLevelNeedGear` ("... seu equipamento precisa valer o de um conjunto tier {tier} +{refine}.") e, quando nem um conjunto comum alcança (acima de T6 +12 = 7,2), `hunting.subLevelNeedGearRarity` (com a raridade).

- **O fundo (raso / médio / fundo) também passou a pedir índice** (`HuntingZoneDef.depthGear` + `gearOffset` do fundo, `depthGearRequired`, `isDepthUnlocked(zone, depth, índice)`): glade 0, marsh 1,4, rift 2,8, abismo 3,5, trono 5,0, mais 0 / 0,25 / 0,5 (equivalente ao CP que o fundo pedia ao guerreiro de placa e espada, ln CP = 5,419 + 0,555 x índice). O CP recomendado (`recommendedCpForDepth`) segue só como conselho na tela. Antes, com o mesmo equipamento, o arqueiro era barrado de fundos que o guerreiro abria (T3 +8: abismo médio e fundo; T4 +0: abismo médio e fundo; T5 +0: trono raso); agora os três abrem os mesmos (`scripts/sim/depthGate.sim.ts`).
- A promessa "cada classe +15 a 20% no seu eixo, no máximo -10% nos outros" tem guarda: `classAxes.test.ts` (tier 6 +8). Os dois testes de CP entre linhas (couro, pano e armas "nunca abaixo do tier anterior") foram trocados por ele e pelo R8, porque o CP deixou de abrir e fechar qualquer coisa.

- **O eixo de andares satura em T6.** Com um conjunto comum de tier 6 todas as classes param entre os andares 84 e 89 (guerreiro 88, arqueiro 85, mago 83 em T6 +8), então o eixo não diferencia ali e a liderança do guerreiro é de +3 a +5%. O alvo de +15 a +20% vale **onde o eixo discrimina** (T2 a T5), não foi trocada a medida para fabricar diferença. O T4 +8 está travado em teste (guerreiro +16,9%); T3 e T5 ficam sem trava.
- **O mago não tem parede no andar 40: tem ritmo.** Onde cada classe para (`scripts/sim/floorWall.sim.ts`): T3 +8 guerreiro 59, arqueiro 39, mago 39; T4 +0: 59 / 39 / 49; T4 +8: 69 / 59 / 59; T5 +0: 74 / 59 / 59; T5 +8: 79 / 77 / 76; T6 +8 (nível 90): 88 / 79 / 82 (antes da rodada de 28/10 do Tiro de Abertura eram 59 / 59 / 39, 74 / 69 / 59, 74 / 69 / 59, 79 / 78 / 76 e 88 / 85 / 83). O mago passa o checkpoint do 40 em T4 +0 (para no 49) e a diferença para o guerreiro some com o tier: é o eixo do guerreiro funcionando, não uma mecânica faltando.
- **Cacada ao Alvo paga mais que o +8% do cartão a heróis rápidos.** As bonificações de vários alvos vencidos se somam (`huntCombat.ts` soma `targetBuffs`) e um alvo vem a cada 300 abates: 1.667 abates em 6 h dão x1,087, 2.269 dão x1,115, 3.008 dão x1,128. O teto real é `EVENT_XP_CAP` (+15%), igual ao limite do servidor; a taxa depende da velocidade do herói, não do fixture. Há teste para o herói rápido.

- **A queima fica só na espada (tier 5 e 6), de propósito.** É a identidade da espada (o arco, a besta e o cetro não queimam; o cajado queima desde o tier 1, por ser a linha do mago, e a espada só a partir do tier 5). O juiz é a tabela de eixos (`classAxes.test.ts`), não a lista de mecânicas de cada arma: a arma do arqueiro importa pela velocidade (arco +22,6% em T6 contra a espada), não por ter a mesma coleção de efeitos. Não é esquecimento; quem "consertar" isso tem de passar pelo teste de eixo.
- **As recargas das habilidades passaram a contar golpes médios, não milissegundos (`abilities.ts abilityCdScale`).** Medido em `scripts/sim/abilityShare.sim.ts`: a fatia da velocidade que vem das habilidades (1 − velocidade sem rotação / velocidade com rotação) sobe quando o tier cai, em todas as classes: guerreiro, na Caça 0,24 (T6) → 0,31 (T4) → 0,33 (T2); no chefe 0,17 → 0,29 → 0,33; arqueiro 0,15 → 0,16 → 0,18; mago 0,33 → 0,38 → 0,40. Dois mecanismos: (1) o golpe é mais lento com a AGI baixa (808 ms em T6, 1096 ms em T2) e a recarga em ms é a mesma, então cabem mais disparos por golpe (0,41 em T6, 0,54 em T2); (2) em luta curta, o dano de um golpe forte em inimigo quase morto é desperdiçado, e esse desperdício some em luta longa. O guerreiro tem a maior fatia em todos os tiers, então com recarga fixa ele passava o arqueiro no chefe em T3 e T4. Agora toda recarga é multiplicada por (intervalo só-de-AGI do herói) / (o de um herói nível 100): 1,00 em T6 (o fim do jogo não muda), 1,10 em T4, 1,16 em T3, 1,28 em T2. Lê o NÍVEL (AGI a 20% dos pontos), não a AGI real, para que concentrar pontos em AGI não encurte também as recargas. Sem isso, quem mexer nos números das habilidades vai achar que a escala é arbitrária: ela é a correção de uma unidade.
- **O equipamento inicial (tier 0) não dá habilidade nenhuma (28/10).** A clava de madeira e as roupas esfarrapadas não declaram `line` nem `weight`, e o padrão "ausente = espada / placa" de `grantedAbilities` as tratava como espada e placa: o herói novo abria Táticas e via as técnicas da espada e as posturas da placa. A regra agora é por tier (`equippedAbilities` passa `null` para uma peça de tier 0, cada slot por conta própria), não por lista de ids: uma espada de tier 1 com o trapo inicial dá as técnicas da espada e nenhuma do corpo. O padrão "ausente = espada / placa" continua valendo para as peças de tier 1 em diante, que são mesmo espada e placa. Efeito colateral medido: um herói tier 0 luta sem rotação, então `recommendedCp.ts` foi regerado (herói novo 72 → 58; os andares 50 e 75 não mudaram, 1859 e 3925; o 100 foi de 17.444 para 17.406). Os eixos de T6 e T4 não mudam (os heróis deles são tier 4 e 6). Guarda: `defaultRotation.test.ts`.
- **Estado dos eixos (28/10, depois da rodada final).** T6 +8 e T4 +8 **fechados e travados por `classAxes.test.ts`**: T6 mago na Caça +20,5, arqueiro no chefe +19,5, guerreiro −9,5 na Caça (a pior folga), mago −8,0 no chefe; T4 mago na Caça +19,4, arqueiro no chefe +13,0, guerreiro nos andares +16,9, e ninguém a mais de −10% em nenhum eixo (guerreiro −9,1 na Caça, arqueiro −8,6 na Caça, mago −9,8 no chefe e −7,8 nos andares). As folgas até −10 são de 0,2 a 1,4 ponto, de propósito: nesta família de alavancas é o máximo que se consegue, e o teste é determinístico (semente fixa). **O que fechou o mago em T4:** (1) as habilidades que dão a vantagem a quem já está na frente foram aparadas (Golpe Firme 2,7x → 2,3x, Explosão Arcana 2,1 → 1,5, Nova 2,1 → 2,05, Chuva de Flechas 0,6 → 0,4, Tiro Potente 1,7 → 1,4): o eixo é relativo, então o que o guerreiro e o arqueiro perdem no chefe e na Caça o mago ganha na régua; (2) o cajado devolve 14% a mais de multiplicador de crítico (`RETURN_SCALE.staff` 1,14); (3) o Tiro de Abertura do arqueiro passou de 2000 para 500 ms. **Por que o (3):** os andares de T4 são discretos (a classe para em 59, 69, 74...; as paredes são os checkpoints 60 e 70 e o chefe do 75), então os três líderes saem da tripla de alcances. Das triplas que o jogo alcança, só (guerreiro 69, arqueiro 59, mago 59) fecha as três regras de uma vez (+16,9 / −7,8 / −7,8); a de antes, (74, 69, 59), dava +15,6 / +3,8 / −17,5. A tripla que o pedido original descrevia (+15 / −5 / −10) **não existe** com alcances discretos: as triplas que satisfazem as três regras são (69, 59, 59), (79, 69, 69), (84, 69, 69) e (84, 74, 74), e o guerreiro não passa do 76 mesmo com bônus absurdo só para ele (o chefe do 75 o para). O Tiro de Abertura só retarda o primeiro golpe do inimigo, então mexe só nos andares (não no chefe, onde o herói é imortal, nem na Caça, onde ninguém morre): foi a única alavanca que tira o arqueiro dos andares sem encostar nos outros eixos dele. O corte vale a partir de ≤ 750 ms (1000 ms ainda dá 69 em T4); ficou em 500. **Custo conhecido:** o arqueiro desce uma parede de andar também em outros tiers (tabela de paredes acima: T3 +8 59 → 39, medido que é o Tiro de Abertura, com 2000 ms volta ao 59; T5 +0 69 → 59 e T6 +8 nível 90 85 → 79, não separados do corte das outras habilidades). T3 fica fora do alvo por decisão; devolver o arqueiro ao 59 em T3 pede um atraso entre 1000 e 2000 ms, e isso reabre o T4 (1000 ms já dá 69 ali). **T3 +8 segue fora do alvo:** guerreiro lidera o chefe (+12,9 contra +1,9 do arqueiro), mago −12,5 no chefe (antes −18) e para no andar 39. Está como `todo` em `classAxes.test.ts`. A mesma tabela, com as recargas fixas em ms em vez de escaladas, está em `scripts/sim/cdScale.sim.ts`.
- **O ganho só-de-equipamento do arqueiro é irregular entre os tiers** (`scripts/sim/gearOnlyLead.sim.ts`, sem rotação nem afinidade, +8): chefe 20,0 (T1), 17,8, 6,3 (T3), 13,4, 13,6, 23,4 (T6); em +0 vai de +11 em T1 a ~0 em T5–T6 na Caça. Uma curva por tier limpa justificaria um dial por tier; esta não é limpa (o T3 destoa nos dois lados, e o guerreiro de espada +0 em T3 tem +34% no chefe), então a causa está nas soluções por tier do gerador (`weightBudget.gen.ts`) e o conserto é o gerador mirar um resultado de eixo consistente por tier, não empilhar um dial. Fica como trabalho futuro.

**Antifraude (passo 1b, medido com `scripts/sim/classPeak.sim.ts`).** O pico honesto de XP/h é **0,95** de `BOUNDS.xpPerHour` (24.825 medidos, 31.031 com o Elixir; trono fundo, sub-nível 10, herói T6 +12 lendário), igual para as três classes porque o teto de ritmo (1,2x) trava antes, e o limite já supõe o sub-nível 10 da melhor zona; material em 0,46 de `HUNT_CEILING` por hora. A folga é de 5%: **qualquer mudança no teto de ritmo (`xpPaceCap`) ou no XP por abate da zona 5 tem de remedir isto**, porque 0,95 é pouca folga para marcar jogador honesto.

## 6. Respondido pelo dono em 28/10

1. **Data: não existe.** "esquece 31/10 eu tava testando site". O playtest de 31/10 nunca foi firme. Como o **congelamento de conteúdo de 22/10 existia por causa daquela data, ele cai junto**: esta reforma é a linha principal de trabalho e pode levar o tempo que precisar.
2. **"NFT" quer dizer mercado e cripto, não blockchain.** "nft é que vou apenas ter mercado e poder usar cripto mesmo". Então o que já está no ar **é** o pedido: mercado em SOL, Passe em USDC, carteira exigida só para negociar, conta por e-mail joga tudo. **Nada é cunhado on-chain**, não há coleção, não há royalties. Nenhuma fase desta reforma mexe no mercado além de fazer as peças novas obedecerem às regras que já existem.
3. **Carteira: só Solana** (Phantom), que é o que o jogo todo já usa. Ele mencionou MetaMask, mas MetaMask é Ethereum e a resposta dele no item 2 torna o caminho atual suficiente; registrei a recomendação de Solana-só e ele não objetou. MetaMask, se vier, é um segundo caminho de pagamento e um projeto próprio.
