# Nomes que contradiziam o que a coisa é

Data: 29/10/2026 (commits `c6e3ba1`, `d872b31`, `9cfef0c`). Ensinou: [[Números e promessas que envelhecem calados]] · Sistema: [[Classes e equipamento]] · Guardas: [[Guardas que existem]]

A reforma de 28/10 criou três pesos de armadura e seis linhas de arma. Vários nomes que eram inofensivos antes passaram a mentir.

## Oito peças (`c6e3ba1`)

"Adaga de Bronze" está na linha da espada, "Luvas de Couro" e "Botas de Couro" são placa, e "Couro Reforçado com Bronze" é o peitoral de placa de tier 1. Nada disso confundia ninguém antes, porque havia uma linha de armadura e uma de arma. Agora que couro é o peso do arqueiro e espada é uma linha de seis, uma peça chamada couro que é equipamento de guerreiro manda o jogador para a build errada.

Só os **nomes exibidos** mudaram, nas duas línguas. Todo id ficou, então saves, anúncios no mercado e tabelas de drop não foram tocados. Os quatro únicos entre elas são definidos por `like:` e herdam a linha da gêmea, que foi como foram conferidos. Três descrições ainda diziam couro ou macio depois da troca e foram reescritas mantendo as imagens do autor original ("quente ao toque, duro como um casco" sobrevive numa peça que agora é placa).

O slot `shield` guarda escudos, aljavas e grimórios desde a reforma, então deixou de se dizer escudo: o slot lê "Mão secundária" e a seção da Forja também, depois de conferir que a seção realmente lista os três (`gearBySlot('shield')` em `ForgeModal`). `GARDEN_2_0.md` e `MATERIAL_FLOW.md` citavam um nome antigo cada um e foram atualizados.

Descoberta que veio junto (`eef5228`, o catálogo gerado): `bronze_leather` e `iron_chainmail` não declaram peso, então são placa, e se chamavam "Couro Reforçado com Bronze" e "Cota de Malha de Ferro". Foi o que levou à renomeação. Ver [[2026-10-29 — A clava de madeira dava técnicas de espada]] para o padrão "ausente é placa".

## As árvores de habilidade (`d872b31`)

Um jogador dez minutos dentro do jogo era mandado "gastar em Guerreiro, Guardião ou Caçador" e não tinha como saber que eram as árvores antigas de pontos, não as classes da reforma. Duas colisões, não uma: **Guerreiro** contra a classe guerreiro, e **Caçador** contra o conjunto de couro de tier 4, a Isca do Caçador e uma prateleira de títulos de missão.

Agora as árvores são **Brutalidade, Resiliência e Riqueza**, o que também descreve o que cada uma faz. Foi preferida a alternativa de nomes literais (Ofensiva, Defensiva, Prosperidade) por ser mais clara e mais sem graça, e num jogo cujas zonas se chamam "Trono do Abismo Eterno" ela leria como um menu de configurações. Oito textos visíveis ao jogador, quatro por língua. Os ids de código ficam `warrior`, `guardian`, `hunter` (ninguém os lê e mudá-los é risco sem ganho). Depois da troca conferiu-se que Guerreiro só significa a classe e Caçador só significa peça, conjunto, isca ou quem caça.

## A nota da primeira Forja (`9cfef0c`)

A nota dizia "a arma e o peitoral decidem". Nenhuma das duas coisas é verdade: `affinity.ts` lê o **peso líder** entre os cinco slots de peso (armadura, elmo, luvas, botas e mão secundária) e a arma só soma um degrau em cima de cinco peças iguais. O texto prometia uma regra que o código não tem. A nota antiga ocupava 5 linhas e 83 px a 375 px de largura, empurrando a lista de receitas de y=392 para y=490; a verdadeira ocupa 3 linhas e 50 px nas duas línguas.

O teste que travava a redação antiga foi trocado por dois guardas que se guiam pelo código: um percorre `CLASS_OF_WEIGHT` e exige que a nota pareie cada peso com a sua classe, na ordem do mapa; o outro recusa qualquer nota que nomeie um slot como decisor. O de slot falha no texto antigo (provado antes de commitar).

Conectado: `e7e577d` pôs, em todo cartão de item na Forja e no Inventário, uma faixa com o peso e o estilo, a linha da arma e quantas habilidades a peça concede, lidos por `affinityWeightOf` e `CLASS_OF_WEIGHT`, os mesmos que o filtro da Forja e `affinity.ts` usam. O teste veste cada peça sozinha e compara a contagem anunciada com `equippedAbilities`; o dia em que outro slot passar a conceder habilidade, esse teste acende em vez do cartão ficar desatualizado em silêncio.
