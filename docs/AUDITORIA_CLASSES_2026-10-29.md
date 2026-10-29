# Auditoria da mecânica "você é o que veste" — 29/10/2026

Pedido do dono: saber se as mecânicas novas funcionam de verdade — substats, drops e misturar equipamento de arqueiro, mago e guerreiro como no Albion. Tudo abaixo foi **medido no motor do jogo** (os mesmos laços de Caça e Masmorra que o jogador usa), não lido de documento. Nenhum arquivo do jogo foi alterado; os arquivos de medição temporários foram apagados.

## 1. Resposta curta

| Pergunta | Resposta |
|---|---|
| Os substats chegam ao combate? | **Sim.** Mas para o arqueiro o substat de crítico já é **desperdiçado a partir do raro** no tier 4: ele bate 100% de crítico e o resto do bônus some. |
| Os materiais novos caem? | **Caem, mas só em 3 das 5 zonas.** Fenda (zona 3) e Abismo (zona 4) não dropam tendão, pena nem pó arcano. Um arqueiro de nível 40 a 75 tem de voltar à Clareira para fazer o conjunto de tier 5 e 6. |
| Dá para misturar? | **Sim, sem nenhuma trava**, e a mistura rende. **Problema:** duas misturas vencem as três classes puras em **todos** os eixos, e a besta faz o mesmo. Hoje o melhor build do jogo é "couro + cajado", que não é classe nenhuma. |
| As habilidades disparam de verdade na Masmorra? | **Sim.** Vi "Postura de Ferro!" acionar numa luta real no andar 50, sem erro de console. Isso fecha o `REVIEW (director)` que estava no topo de `abilities.ts`. |

## 2. Substats

Herói arqueiro T4 +8 nível 62, conjunto completo, substats na mediana de cada raridade (`classHero`):

| Raridade | CP | Crítico | Vida | Redução | Substats |
|---|---|---|---|---|---|
| Comum | 2.253 | 0,617 | 1.289 | 0,52 | nenhum |
| Raro | 2.603 | **1,000 (teto)** | 1.299 | 0,53 | 6× crítico 5,5% |
| Épico | 3.145 | 1,000 | 1.643 | 0,58 | crítico + vida |
| Lendário | 4.916 | 1,000 | 2.011 | 1,43 | crítico + vida + defesa |

O mecanismo funciona: cada substat muda o número de combate correspondente (`engine.ts` linha 424 e seguintes). O defeito é de desenho: o substat **crítico** é o primeiro que toda peça rara recebe, e o arqueiro de couro já chega ao teto de 100% com ele no tier 4. Do raro para cima, todo ponto de crítico em peça de arqueiro é **jogado fora**, e o jogador não vê isso em lugar nenhum. O código já sabia desse risco no tier 6 (`REVIEW IN PHASE 8` em `gear.ts`); medido, ele chega no tier 4 raro.

## 3. Drops dos materiais novos

Onde cada material cai (`huntingZones.ts`):

| Material | Clareira (z1) | Pântano (z2) | Fenda (z3) | Abismo (z4) | Trono (z5) |
|---|---|---|---|---|---|
| Tendão | 3% | — | — | — | 3% |
| Pena | — | 2% | — | — | 2% |
| Pó arcano | — | 0,4% | — | — | 0,4% |

O servidor conhece os três (`_shared/materials/tables.ts`) e eles não são compráveis na loja (`packCost` em `materials.ts` não é lido por ninguém).

**O que isso faz com o jogador**, pelo `materialSupply.sim.ts` (jogador comum, mediana de 3 sementes): tendão juntado até o dia 7 = 89, até o dia 30 = 172, **até o dia 60 = 172**. A oferta para no dia 30 porque o jogador sobe para a Fenda e o Abismo, que não dropam. Um conjunto de couro tier 5 pede 72 tendões mais 28 do arco; o tier 6 pede 90 mais 36. Ou seja: **o arqueiro de nível 50 a 75 precisa voltar a caçar na zona de nível 1** para progredir, perdendo XP. O documento da reforma (5.1.2) previa levar os drops às zonas 3 e 4 na fase 7, e isso não aconteceu.

O simulador não planta fibra, então a oferta de tecido (mago) **não está medida** por ninguém.

## 4. Misturar equipamento

Não existe trava de classe: qualquer peça vai em qualquer slot, só o nível conta (`gearInstances.ts applyEquipInstance`). A afinidade conta o peso com mais peças (3 ou 5) e a arma da família; as habilidades vêm **só da arma e do peitoral**.

Medido em T4 +8 (nível 62) e T6 +8 (nível 100), herói real (rotação automática + afinidade). Caça no Abismo raso com sub-nível fixo; chefe do andar 50; andar mais fundo que vence 2 de 3 vezes:

| Build | T4 abates/h | T4 chefe (s) | T4 andar | T6 abates/h | T6 chefe (s) | T6 andar |
|---|---|---|---|---|---|---|
| Guerreiro puro (placa + espada) | 268 | 9,7 | 65 | 723 | 3,2 | 85 |
| Arqueiro puro (couro + arco) | 269 | 8,5 | 55 | 725 | 2,7 | 85 |
| Mago puro (tecido + cajado) | 320 | 11,1 | 55 | 865 | 3,3 | 80 |
| **Exemplo do dono:** placa (peito + elmo) + couro (luvas + botas + aljava) + machado | 274 | 10,1 | 65 | 773 | 3,1 | 85 |
| Peito de tecido + couro (4) + arco | 253 | 9,5 | 55 | 683 | 3,0 | 80 |
| Peito de placa + tecido (4) + cajado | 298 | 11,4 | 55 | 799 | 3,4 | 85 |
| **Peito de couro + placa (4) + espada** | **320** | **7,6** | **70** | **866** | **2,2** | 85 |
| **Couro (5) + cajado** | **456** | **7,5** | 65 | **1.245** | **1,9** | 85 |
| Placa (5) + arco | 180 | 12,8 | 55 | 482 | 4,3 | 75 |
| Placa (5) + besta | 240 | 10,0 | 65 | 633 | 3,3 | 85 |
| **Couro (5) + besta** (arqueiro variante) | **358** | **7,6** | **70** | **941** | **2,3** | 85 |
| Tecido (5) + cetro (mago variante) | 228 | 11,1 | 55 | 615 | 3,7 | 85 |

O que a tabela diz:

1. **Misturar funciona e o exemplo do dono é um build honesto** (um pouco melhor que o guerreiro na Caça, igual na Masmorra). Esta parte está certa.
2. **"Couro + cajado" é o melhor build do jogo em tudo**: +42% de abates sobre o mago (que deveria ser o dono da Caça), chefe mais rápido que o arqueiro, mesma profundidade do guerreiro. E ele **não tem afinidade de classe** (arma de tecido com armadura de couro). A velocidade e o crítico do couro multiplicam o transbordo do cajado.
3. **Trocar o peitoral de placa por um de couro deixa o guerreiro melhor em tudo** (Esquiva, +35% de velocidade por 4 s a cada 16 s, vale mais que Postura de Ferro até na profundidade).
4. **A besta vence os três eixos** contra as classes puras, e o cetro perde em tudo. O teste `classAxes.test.ts` só trava espada, arco e cajado — a sessão DIRETOR já confirmou e está diagnosticando.
5. **Placa + arco é o pior build do jogo** (180 abates/h). Não é um defeito, é uma mistura ruim de propósito, mas o jogador não tem como saber antes de forjar.

A promessa da reforma ("cada classe +15 a 20% no seu eixo") vale para as três classes puras entre si, e só. Com misturas e variantes no jogo, **a classe pura é dominada**.

### 4.1 A afinidade não é a alavanca

Pergunta da sessão DIRETOR: "couro + cajado" ganha **sem** afinidade ou **apesar** dela? Medido (mesmas condições, `noAffinity`):

| Build | T4 abates/h | T4 chefe (s) | T6 abates/h | T6 chefe (s) |
|---|---|---|---|---|
| Mago puro, com afinidade de classe | 320 | 11,1 | 865 | 3,3 |
| Mago puro, sem afinidade | 319 | 11,1 | 864 | 3,4 |
| Couro (5) + cajado, com afinidade (passo 5, sem classe) | 456 | 7,5 | 1.245 | 1,9 |
| Couro (5) + cajado, sem afinidade | 445 | 8,1 | 1.213 | 1,9 |
| Arqueiro puro, com afinidade de classe | 269 | 8,5 | 725 | 2,7 |
| Arqueiro puro, sem afinidade | 261 | 8,7 | 706 | 2,7 |

Duas conclusões. **A afinidade vale de 0 a 3% em qualquer build** (a do mago vale zero na Caça: 320 contra 319) — e isso **é desenho, não defeito**: `tunables.ts` diz que ela é pequena de propósito, porque o dono pediu que misturar continuasse bom, e `affinity.test.ts` trava que todo stat dela fique abaixo do conjunto mais fraco do peso. Não mexa nela para cima. E **"couro + cajado" ganha sem afinidade alguma** (445 contra 319 do mago, +39%). O problema é uma **interação de stats**: velocidade × crítico (o perfil do couro) × transbordo (as habilidades do cajado) é um produto que escapa, e o cajado escala mais com golpes do que o arco. A alavanca é o orçamento de stat do couro ou a forma como o transbordo escala com a velocidade, nunca o bônus de afinidade.

## 5. Dois defeitos de interface achados no caminho

- **Rotação salva não acompanha a troca de arma.** Quem apertou "Aplicar" em Táticas uma vez fica em modo manual. Se trocar a espada por um arco, a rotação vira só `[Postura de Ferro]`: as três técnicas do arco **não entram sozinhas**, e o herói caça assim até o jogador abrir Táticas de novo. Só a tela de Táticas avisa. Em modo automático (quem nunca apertou Aplicar) a troca funciona. Medido com `effectiveRotation` em `engine.ts`.
- **As peças não dizem o que concedem.** Só a tela de Táticas lê `abilityDef`; a ficha do item, a Forja e a comparação não mostram as habilidades nem a família da arma. Para "o jogador decidir pelo equipamento", ele precisa ver na ficha o que a peça dá antes de forjar.

## 6. O que o dono decidiu e o código ainda não faz

Em `docs/cerebro/DECISOES_DO_DONO.md`: *"Habilidades vêm de todo o equipamento vestido, não só das armas."* No código, `equippedAbilities` (`engine.ts`) lê **só a arma e o peitoral**: elmo, luvas, botas, mão secundária e anel não concedem nada. O GDD lista isso como decisão em aberto. Vale confirmar qual das duas versões é a sua.

## 7. O que precisa de decisão sua (equilíbrio, não mexo)

1. **O que fazer com "couro + cajado" e "peito de couro + placa".** Opções, da mais leve para a mais pesada: (a) o transbordo do cajado e a Esquiva deixarem de escalar com a velocidade de ataque (teto por luta, ou valor fixo por disparo), que é o produto que escapa; (b) habilidades da arma só com o peitoral do mesmo peso; (c) aceitar que a mistura é o jogo e trocar a meta "classe pura +15%" por "nenhum build acima de +X% em mais de um eixo", travada em teste com as misturas incluídas. Aumentar a afinidade **não** é opção: ela é pequena por pedido seu (misturar tem de continuar bom) e o teste `affinity.test.ts` a mantém assim.
2. **Besta e cetro**: a DIRETOR está diagnosticando; o conserto é número de equilíbrio.
3. **Drops nas zonas 3 e 4**: adicionar tendão, pena e pó à Fenda e ao Abismo (o documento da reforma já previa; precisa de chave de fluxo própria em `huntCombat.ts`, não `ownStream`). Isso é conteúdo, então é seu.
4. **Crítico no teto**: ou o substat de crítico muda de lugar na ordem de rolagem para peças de couro, ou o teto sobe de forma que o excesso vire outra coisa. Hoje o jogador raro de arqueiro perde valor sem saber.
5. **Habilidades dos outros slots** (seção 6).

## 8. O que pode ser feito sem perguntar

- Teste que trave as **misturas e variantes** junto das classes puras (hoje `classAxes.test.ts` só vê três builds de doze).
- A rotação em modo manual **preencher sozinha** os espaços vazios quando a arma muda, ou pelo menos um aviso fora de Táticas.
- Mostrar na **ficha do item** a família da arma, o peso e as habilidades que a peça concede.
- Medir a oferta de **tecido** (o simulador precisa plantar fibra).
