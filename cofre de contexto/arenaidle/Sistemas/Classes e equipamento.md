# Classes e equipamento

Voltar: [[Comece aqui]] · Ligações: [[Economia e materiais]] · [[Caça e masmorra]] · [[Antifraude e temporada]] · [[Guardas que existem]] · [[Ferramentas de medição]] · [[Decisões do dono]] · [[O que está em aberto]]

O desenho completo vive em `docs/GDD.md` (seções 4 a 6) e `docs/CLASSES_E_EQUIPAMENTOS.md`; o catálogo de peças, **gerado**, em `docs/EQUIPAMENTOS.md`. Esta nota guarda o que aqueles não dizem: onde o desenho dói, onde ele já enganou, e o que o protege.

## A regra em três linhas

- **Não existe classe escolhida.** O jogador é o que veste. Três pesos de armadura (placa, couro, tecido) valem para armadura, elmo, luvas, botas e mão secundária. Seis linhas de arma, duas por classe: espada e machado (guerreiro), arco e besta (arqueiro), cajado e cetro (mago).
- **A afinidade é bônus por combinar, nunca trava.** 3 peças do mesmo peso dão um bônus pequeno, 5 dão o cheio, 5 mais a arma da família dão o degrau de classe. Ela é **pequena de propósito**, menor que o bônus de conjunto, porque o dono pediu que misturar continuasse valendo (`tunables.ts` e `affinity.test.ts` travam: todo stat do degrau de 3 peças fica abaixo do mesmo stat do primeiro passo de **todo** conjunto daquele peso, o mais fraco incluído). Não suba. Medido em 29/10: ela vale de 0 a 3% em qualquer build.
- **A classe é lida pelo peso que lidera entre os cinco slots de peso**, e a arma só soma um degrau. Não é "a arma e o peitoral decidem" ([[2026-10-29 — Nomes que contradiziam o que a coisa é]]).

## Habilidades e rotação

- 21 habilidades: três por linha de arma e uma por peso de peitoral. O combate percorre a rotação de cima para baixo e dispara a **primeira pronta**; sem nenhuma pronta, ataque básico.
- **Só a arma e o peitoral concedem habilidade** (`equippedAbilities`, `engine.ts`). O dono pediu a leitura larga (todo o equipamento) duas vezes; está em aberto com ele ([[Decisões do dono]], [[O que está em aberto]]). A faixa do cartão de item mostra o número de habilidades **exatamente onde o motor as concede**, e o teste `itemIdentity.test.ts` veste cada peça sozinha para comparar. O dia em que outro slot conceder, o teste acende.
- **Peça de tier 0 não concede nada** (a clava e o trapo): [[2026-10-29 — A clava de madeira dava técnicas de espada]].
- **Rotação automática segue o equipamento na hora.** A manual é a escolha literal do jogador; trocar de arma agora reabastece o que o corte esvaziou, nos mesmos lugares ([[2026-10-29 — Trocar de arma esvaziava a rotação sem avisar]]). Nada é gravado: devolver a arma antiga devolve a lista dele. `rotation: []` é "limpa de propósito" e fica vazia.
- **Toda recarga é multiplicada por um fator que vai de 1,40 no nível 1 a 1,0 no nível 100** (`abilityCdScale`). Tudo que imprime recarga precisa ler o fator ([[2026-10-29 — A tela de Táticas mostrava uma recarga que o herói nunca tem]]).
- **A "Arrancada" (id `dodge`) é uma janela de pressa** de +35% de velocidade de ataque por 4 s a cada 16 s. Não esquiva. Mudar o id quebraria toda rotação salva.
- Os oito efeitos são um conjunto fechado de propósito, porque cada um precisa funcionar nos três lugares onde o combate roda (ver [[Caça e masmorra]]). "Área" significa transbordar para o **próximo** inimigo.

## Quem decide o que (o CP já não decide)

- **O CP é termômetro, não portão.** Aparece na tela, no conselho de andar e no mercado. É média geométrica de dano e vida efetiva e por isso subestima quem troca defesa por velocidade.
- **Os dois portões da Caça** pedem **índice de equipamento** (`gearIndex.ts`): tier + refino + raridade, média sobre 7 slots, divisor sempre 7, slot vazio vale 0, igual para as três classes. Tirar uma peça **baixa** o índice. Ver [[2026-10-28 — O portão de sub-nível dizia proteger e só atrasava]].
- **A justiça entre classes é medida por eixo**, não por CP: mago lidera a Caça, arqueiro lidera os chefes, guerreiro lidera os andares da masmorra. O guarda é `classAxes.test.ts`. **Se acender, o número é que está errado, não o teste.**

## A tabela de eixos hoje (29–30/10)

- A tabela julga **classes** com as **seis** armas montadas por tier (`classAxes.test.ts`, bloco "the six weapons", tiers 2 a 6; é o que o teste chama de `SETUPS`).
- **Em todos os cinco tiers** valem duas regras: nenhuma arma é pior que a gêmea nos três eixos ao mesmo tempo, e a besta não passa o melhor mago na Caça.
- **Só nos tiers 4 e 6** valem as regras de classe (nos tiers 2, 3 e 5 elas "não valem e nunca valeram": o arqueiro fica 3 a 7% atrás no chefe nos tiers 2 e 3, e os andares dos tiers 2 e 5 são empate): ninguém lidera eixo alheio por mais de 10%; o melhor mago lidera a Caça acima da margem; **ninguém chega a andar mais fundo que o melhor guerreiro** (empate é permitido: "o guerreiro lidera" não é afirmado porque, nas sementes, nem sempre é verdade).
- **No chefe**, no tier 6 o melhor arqueiro lidera acima da margem; no **tier 4** a vantagem dele mede de +0,4 a +5,3% conforme a semente, então o que se afirma é só que ele não fica mais atrás que a margem.
- Não há papel fixo nem sinal declarado entre gêmeas, porque medido isso não existe neste motor ([[A tabela de eixos julga classes, não armas gêmeas]]).
- As faixas carregam mínimo, máximo e desvio medidos. O que é ruído demais (andares do arqueiro e do mago no tier 4) não afirma nada.
- **O tier 3 está fora dos alvos de classe por decisão** (`it.todo` no arquivo: o mago no tier 3 +8 não fica a mais de 10% atrás no chefe e não para no andar 39).
- Resultado segundo as mensagens de `e5aad93` e `c407e7c`: mago lidera a Caça, arqueiro o chefe, guerreiro os andares (69 contra 59 no tier 4, 89 contra 86 no tier 6). Para os números de hoje, **rode a ferramenta**, não confie neste parágrafo ([[Ferramentas de medição]]).

> **Aviso.** A seção 5.1.7 de `docs/CLASSES_E_EQUIPAMENTOS.md` descreve o estado de **antes** das rodadas de 29–30/10: diz que "nada foi mudado", que a besta lidera a Caça e que o guarda mede três armas. Nada disso vale mais. Também a linha 546 desse documento ("se o guarda passa a medir as seis armas") está respondida. O documento não foi atualizado quando o código mudou, e é exatamente o defeito de [[Números e promessas que envelhecem calados]]. Corrigir é trabalho de documento pendente ([[O que está em aberto]]).

## Armas e crítico

- **Besta**: arma de golpes raros e pesados (Virote Perfurante 3,0, Tiro Duplo 2 golpes de 1,25, Tiro Fatal 5,0; recargas 36, 32 e 54 s; nenhum multiplicador abaixo de 2,5). Guarda 75% do dano e 50% do crítico da espada gêmea (eram 85% e 100%) e retorno de 0,15 (era 0,3), por `d4aea06`. O bloco gerado da besta vem de `weightBudget.gen.ts`: **regere, não escreva à mão**, senão `itemBalance` quebra a paridade de CP nos tiers 5 e 6.
- **Machado e cetro** vencem a gêmea pelas **habilidades**, nunca pelo equipamento (o machado é mantido a 5% da espada num duelo por `contentPack2.test.ts`).
- **Crítico passa de 100%?** A chance fica presa em 1 (probabilidade, e um total sem teto quebrava `sanitizeHuntSession`). O excesso volta como multiplicador, metade dele, em `buildCombatStats`. Só quem já estava acima do teto ganha ([[2026-10-29 — O crítico acima de 100% era jogado fora]]). Medido: 0,58% dos arqueiros tier 6 +8 de drop passam do teto, 92,7% de um tier 6 +12 lendário.

## O que a auditoria de 29/10 achou (e o que mudou depois)

- Com substatuto, misturar compensa; "couro (5) + cajado" era o melhor build, sem afinidade alguma (445 abates/h contra 319 do mago puro, no tier 4, sem afinidade). O produto que escapa é a velocidade e o crítico do couro vezes o transbordo do cajado, não o bônus de classe.
- Esta é uma medição de 29/10 **de manhã** (`90e022d`). As rodadas de armas mexeram em habilidades e recargas depois. **Não encontrei registro de que a mistura tenha sido medida de novo.** Tratar como em aberto ([[O que está em aberto]]).
- Regeneração: não é peso morto; é stat de eixo único (zero na Caça e no chefe, vale cinco andares ao mago de tier 6). O que é desperdício é mais estreito: o Anel de Vitalidade não dá nada em dois eixos e um andar no terceiro, e o cetro gasta o retorno todo em regeneração que o tecido já dá.

## Onde olhar no código

`src/game/affinity.ts`, `abilities.ts` (`grantedAbilities`, `fillRotation`, `abilityCdScale`), `engine.ts` (`equippedAbilities`, `effectiveRotation`), `gearIndex.ts`, `gear.ts` (`RETURN_SCALE`, blocos de conversão gerados), `scripts/sim/classAxes.ts` e `classHero.ts` (a régua), `scripts/tools/classAxesWide.tool.ts` (a tabela larga).

## Nomes que o jogador lê

As três árvores de pontos agora são **Brutalidade, Resiliência e Riqueza** (ids de código `warrior`, `guardian`, `hunter`). **Guerreiro** só significa a classe, **Caçador** só uma peça, conjunto, isca ou quem caça ([[2026-10-29 — Nomes que contradiziam o que a coisa é]]).
