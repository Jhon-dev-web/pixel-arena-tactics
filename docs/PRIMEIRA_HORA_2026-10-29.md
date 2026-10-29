# A primeira hora: escolha ou corredor? — 29/10/2026

Pergunta do dono: como o Albion começa, quando libera mago e arqueiro, e se aqui o começo é "guerreiro como na maioria dos jogos". Pergunta da DIRETOR: medir o que um herói novo encontra e se a primeira classe é escolha ou empurrão. Medido com o herói nível 1 de verdade (clava e trapo), no motor de Caça do jogo; nenhum arquivo do jogo foi alterado.

## 1. Resposta em uma frase

**O começo não é corredor de material: as seis armas de tier 1 custam 40 de ouro, nível 0, e todas saem na primeira noite.** O que empurra o jogador é outra coisa: **ninguém diz a ele que a arma e o peitoral definem a classe**, e o único lugar onde a palavra "Arqueiro" aparece antes de vestir algo é um filtro da Forja. A hipótese da DIRETOR ("a espada é o caminho mais curto porque a placa é feita de material de Caça") **cai no tier 1**: o que segura a espada é o cobre (6 h de Mineração para o conjunto), e o cajado nem precisa de Caça.

## 2. O herói novo, medido

Clareira rasa, 4 h, 6 sementes: **142 abates/h, 2 derrotas por sessão**; por hora: 36,6 farrapos, 10,7 garras, 3,4 tendões, 0,5 núcleo.

## 3. A primeira arma de cada linha (tier 1, todas nível 0 e 40 de ouro)

| Arma | Pede, até o bruto | Atividade que segura | Horas até ter (herói novo, atividades em sequência) |
|---|---|---|---|
| Espada / Machado | 21 farrapos, 5 cobre, 5 madeira | Mineração (cobre a 5,75/h) | ~2,3 h (0,6 caça + 0,9 mina + 0,9 lenha) |
| Arco | 24 farrapos, **8 tendões**, 5 madeira | Caça (tendão a 3,4/h) | ~3,3 h (2,4 caça + 0,9 lenha) |
| Besta | 21 farrapos, 8 tendões, 10 madeira | Caça | ~4,1 h |
| Cajado | 20 madeira, 5 cobre, **zero Caça** | Lenhador (3,5 h) | ~4,4 h |
| Cetro | 10 madeira, 10 cobre | Mineração + Lenhador | ~3,5 h |

Nenhuma delas pede nível, gema ou zona além da primeira. A diferença entre a mais rápida e a mais lenta é de 2 horas numa noite.

## 4. O primeiro conjunto completo (7 peças de tier 1)

| Classe | Bruto | Atividades em sequência | Em paralelo | Tempo de calendário com 2 visitas por dia | O que trava |
|---|---|---|---|---|---|
| Guerreiro | 91 farrapos, 35 cobre, 10 madeira, 4 ervas | 2,5 h caça + **6,1 h mina** + 1,7 h lenha = 10,3 h | horta 1 h | **~1,5 dia** | o cobre (duas sessões de 4 h de Mineração) |
| Arqueiro | 91 farrapos, 20 tendões, 25 madeira, 10 cobre, **4 penas** | 5,9 h caça + 1,7 h mina + 4,3 h lenha = 11,9 h | horta 0,5 h | **~1,5 dia para 6 peças; a 7ª só no andar 26** | **a pena não cai na Clareira** (só do Pântano em diante): a aljava de tier 1 é impossível até o andar 26, e sem ela o couro fica em 4 peças (bônus de 3, nunca o de 5) |
| Mago | 65 linho, 20 madeira, 15 cobre, 10 farrapos | 0,3 h caça + 2,6 h mina + 3,5 h lenha = 6,4 h | **horta 67 canteiro-horas** | **~4 dias**: linho rende 2 a cada 2 h por canteiro; com 4 canteiros e 2 visitas por dia são 16 linhos/dia | a Horta, não por ser lenta, mas porque o jogador novo não fica 16 h replantando a cada 2 h |

Leitura: o guerreiro e o arqueiro chegam no mesmo dia e meio; o mago em quatro dias. **Não é corredor, é fila**, e ela favorece quem não planta. A regra "tudo igual no tier 1" vale para as armas; os peitorais de tecido pedem 25 linhos cada um, e é isso que empilha.

## 5. O jogo conta que a roupa é a classe?

Procurado em `pt.json` (tutorial, dicas, Forja, selo de afinidade, Táticas):

- **Tutorial (10 passos):** fala de pontos, Masmorra, Caça, Horta, Mineração, Lenhador, Pedidos, reforja, soquetes e Habilidades. **Nenhuma palavra sobre classe, peso de armadura ou arma.**
- **Pior:** o passo "Habilidades" diz *"Gaste em Guerreiro, Guardião ou Caçador"*. São as três árvores antigas de pontos de habilidade. O jogador novo lê "Guerreiro" ali e "Guerreiro" no filtro da Forja, e são duas coisas diferentes. Hoje a palavra **Guerreiro** tem dois significados no jogo.
- **Forja:** o filtro "Classe: Guerreiro / Arqueiro / Mago" é o único lugar, antes de vestir, onde a classe existe. Nenhuma ficha de peça diz que ela concede técnica (`AUDITORIA_CLASSES`, seção 5).
- **Depois de vestir:** o selo de afinidade em Personagem diz "O que você veste combina com o estilo Arqueiro" e "é o reflexo do que está vestido"; Táticas diz "Equipe uma arma ou um peitoral de tier 1 em diante e as técnicas dele aparecem aqui". **O jogo só explica a regra a quem já a cumpriu.**
- **Dicas de primeira vez:** paradas desde 22/09 (achado da DIRETOR).

## 6. O que o Albion faz nos primeiros 30 minutos

Pelo que as fontes dizem (guias de terceiros; o jogo muda e vale conferir no oficial): não há escolha de classe na criação; **a arma na mão é a classe e troca a qualquer momento**. O tutorial da ilha manda **juntar troncos e pedra e forjar a própria espada e o próprio escudo de iniciante** na estação, e só depois abre o Quadro do Destino, que mostra **todas as linhas de arma, armadura, coleta e ofício de uma vez**, cada uma avançando pelo uso. Ou seja: o Albion também começa todo mundo de espada, e a lembrança do dono está certa. O **gesto** que ele tem e nós não: (1) a primeira arma é forjada **pelo jogador**, com material que ele mesmo juntou, numa estação que já mostra as outras linhas ao lado; (2) um quadro que diz, desde o minuto um, "existem estas linhas e você avança nelas usando".

## 7. A menor mudança que abre o começo

1. **Um passo de tutorial na primeira Forja** (texto, sem mecânica): *"Aqui você escolhe o que é. Espada e placa fazem um guerreiro; arco e couro, um arqueiro; cajado e tecido, um mago. Troque quando quiser."* Com a Forja já aberta no filtro "Todas", para as seis armas aparecerem lado a lado.
2. **Renomear as três árvores de Habilidades** (Guerreiro / Guardião / Caçador) para nomes que não sejam classe, ou renomear o passo do tutorial. Texto para o jogador: decisão do dono.
3. **Pena na Clareira** (ou a aljava de tier 1 sem pena), para o arqueiro fechar as 5 peças onde o guerreiro e o mago fecham. É conteúdo: do dono.
4. **Linho mais generoso no tier 1** (qty 3 ou duração 1 h), para o mago fechar o primeiro conjunto em um dia e meio como os outros. É número: do dono. Isso é a mesma história da Lacuna 1 do mapa da corrente, contada no dia 1 em vez de no dia 40.

Fontes sobre o Albion: [KeenGamer, guia de início](https://www.keengamer.com/articles/guides/albion-online-beginner-guide-how-to-start-level-up-and-make-silver-fast/), [Guild Order, primeira linha de arma por papel](https://guildorder.com/games/albion/guides/first-weapon-line-by-role), [GearUP, começando rápido](https://www.gearupbooster.com/en/blog/get-started-quickly-with-albion-online.html).
