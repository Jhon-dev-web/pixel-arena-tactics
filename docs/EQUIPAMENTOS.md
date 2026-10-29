# Equipamentos do jogo, por classe

Existem **158 peças** de equipamento hoje: **56** do Guerreiro, **42** do Arqueiro, **42** do Mago e **18** comuns a todas as classes (o total confere com `GEAR.length` em `src/game/gear.ts`). A classe não é um atributo do herói: ela é o reflexo do que ele veste. A armadura (elmo, peitoral, luvas, botas e escudo) define pelo peso: **placa** = Guerreiro, **couro** = Arqueiro, **tecido** = Mago. A arma define pela linha: **espada e machado** = Guerreiro, **arco e besta** = Arqueiro, **cajado e cetro** = Mago. Anéis, relíquias e o equipamento inicial (tier 0) não pertencem a nenhuma classe e estão na última seção.

**Como ler.** Os atributos são os **valores base** da peça: a raridade, o refino (+1 a +12), os encaixes e os atributos extras sorteados somam por cima. "Habilidades" é o que a peça concede na tela de Táticas: a arma concede as da sua linha e o peitoral as do seu peso (elmo, luvas, botas, escudo, anéis e relíquias não concedem). As peças de tier 0 não concedem nenhuma.

> Este arquivo é gerado por `scripts/sim/equipamentos.gen.ts` (`npx vitest run --config vitest.sim.config.ts equipamentos`). Não edite à mão: mude o código e gere de novo.

## Guerreiro (56 peças)

### Guerreiro: Arma (17)

| Peça | Tier | Linha | Atributos | Habilidades |
| --- | --- | --- | --- | --- |
| Espada Curta de Bronze | 1 | Espada | Dano 12; Taxa de Crítico +3% | Golpe Firme, Estocada Dupla, Brecha |
| Machadinha de Bronze | 1 | Machado | Dano 13; Taxa de Crítico +1,5% | Rachadura, Giro Brutal, Sangria |
| Espada Curta de Ferro | 2 | Espada | Dano 30; Taxa de Crítico +6% | Golpe Firme, Estocada Dupla, Brecha |
| Lâmina da Presa Demoníaca — peça única, só por drop | 2 | Espada | Dano 35; Taxa de Crítico +6,5% | Golpe Firme, Estocada Dupla, Brecha |
| Machado de Batalha de Ferro | 2 | Machado | Dano 32; Taxa de Crítico +3% | Rachadura, Giro Brutal, Sangria |
| Montante de Aço | 3 | Espada | Dano 65; Taxa de Crítico +10% | Golpe Firme, Estocada Dupla, Brecha |
| Cutelo Atado ao Sangue — peça única, só por drop | 3 | Espada | Dano 75; Taxa de Crítico +10,8% | Golpe Firme, Estocada Dupla, Brecha |
| Machado Grande de Aço | 3 | Machado | Dano 70; Taxa de Crítico +5% | Rachadura, Giro Brutal, Sangria |
| Lâmina de Guerra Dourada | 4 | Espada | Dano 90; Taxa de Crítico +14% | Golpe Firme, Estocada Dupla, Brecha |
| Lâmina Flamejante de Dragão | 4 | Espada | Dano 120; Taxa de Crítico +18%; Queima o inimigo | Golpe Firme, Estocada Dupla, Brecha |
| Machado de Guerra Dourado | 4 | Machado | Dano 100; Taxa de Crítico +7% | Rachadura, Giro Brutal, Sangria |
| Lâmina de Aço do Vazio | 5 | Espada | Dano 160; Taxa de Crítico +20%; Queima o inimigo | Golpe Firme, Estocada Dupla, Brecha |
| Cutelo de Aço do Vazio | 5 | Machado | Dano 187; Taxa de Crítico +10% | Rachadura, Giro Brutal, Sangria |
| Grande Lâmina Abissal | 6 | Espada | Dano 240; Taxa de Crítico +24%; Queima o inimigo | Golpe Firme, Estocada Dupla, Brecha |
| Montante Quebra-Ossos — peça única, só por drop | 6 | Espada | Dano 276; Taxa de Crítico +25,9%; Queima o inimigo | Golpe Firme, Estocada Dupla, Brecha |
| Ceifador Abissal | 6 | Machado | Dano 288; Taxa de Crítico +12% | Rachadura, Giro Brutal, Sangria |
| Machado Grande do Senhor Supremo — peça única, só por drop; cai do chefe do andar 100 | 6 | Machado | Dano 331; Taxa de Crítico +13% | Rachadura, Giro Brutal, Sangria |

### Guerreiro: Armadura (9)

| Peça | Tier | Atributos | Habilidades |
| --- | --- | --- | --- |
| Peitoral de Bronze Reforçado | 1 | PV Máx +40; Defesa +3% | Postura de Ferro |
| Cota de Malha de Ferro | 2 | PV Máx +90; Defesa +6% | Postura de Ferro |
| Peitoral de Placa Demoníaca — peça única, só por drop | 2 | PV Máx +103; Defesa +6,5% | Postura de Ferro |
| Placa de Aço Completa | 3 | PV Máx +160; Defesa +10%; Reflexo 20% do dano sofrido | Postura de Ferro |
| Placa Veia de Sangue — peça única, só por drop | 3 | PV Máx +184; Defesa +10,8%; Reflexo 21,6% do dano sofrido | Postura de Ferro |
| Armadura de Escamas de Dragão | 4 | PV Máx +280; Defesa +16%; Reflexo 23% do dano sofrido | Postura de Ferro |
| Égide Dourada | 4 | PV Máx +220; Defesa +13%; Reflexo 21% do dano sofrido | Postura de Ferro |
| Placa de Aço do Vazio | 5 | PV Máx +360; Defesa +18%; Reflexo 25% do dano sofrido | Postura de Ferro |
| Bastião Abissal | 6 | PV Máx +485; Defesa +22%; Reflexo 28% do dano sofrido | Postura de Ferro |

### Guerreiro: Elmo (8)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Elmo de Bronze | 1 | PV Máx +20; Defesa +0,7% |
| Elmo de Ferro | 2 | PV Máx +40; Defesa +1,3% |
| Elmo de Aço | 3 | PV Máx +70; Defesa +1,9% |
| Coroa do Rei Goblin — peça única, só por drop; cai do chefe do andar 25 | 3 | PV Máx +81; Defesa +2,1% |
| Elmo Dourado | 4 | PV Máx +109; Defesa +2,6% |
| Elmo de Sombras — peça única, só por drop | 4 | PV Máx +125; Defesa +2,8% |
| Elmo de Aço do Vazio | 5 | PV Máx +153; Defesa +3,2% |
| Elmo Abissal | 6 | PV Máx +192; Defesa +3,8% |

### Guerreiro: Luvas (7)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Manoplas de Bronze | 1 | Dano 4; Taxa de Crítico +2% |
| Manoplas de Ferro | 2 | Dano 7; Taxa de Crítico +2,5% |
| Manoplas de Aço | 3 | Dano 13; Taxa de Crítico +3% |
| Manoplas Douradas | 4 | Dano 18; Taxa de Crítico +3,5% |
| Manoplas do Chefe de Guerra — peça única, só por drop; cai do chefe do andar 50 | 4 | Dano 21; Taxa de Crítico +3,8% |
| Manoplas de Aço do Vazio | 5 | Dano 28; Taxa de Crítico +4% |
| Manoplas Abissais | 6 | Dano 35; Taxa de Crítico +4,5% |

### Guerreiro: Botas (7)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Grevas de Bronze | 1 | PV Máx +12; Defesa +6,5% |
| Grevas de Ferro | 2 | PV Máx +22; Defesa +8% |
| Grevas de Aço | 3 | PV Máx +35; Defesa +10% |
| Grevas Douradas | 4 | PV Máx +50; Defesa +12% |
| Botas do Andarilho da Fenda — peça única, só por drop | 4 | PV Máx +54; Defesa +13,8% |
| Grevas de Aço do Vazio | 5 | PV Máx +68; Defesa +15% |
| Grevas Abissais | 6 | PV Máx +88; Defesa +17,8% |

### Guerreiro: Mão secundária (8)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Broquel de Bronze | 1 | PV Máx +20; Defesa +4% |
| Escudo de Ferro | 2 | PV Máx +36; Defesa +6% |
| Escudo Pavês de Aço | 3 | PV Máx +52; Defesa +7,6%; Reflexo 3% do dano sofrido |
| Égide de Ossos — peça única, só por drop | 3 | PV Máx +56; Defesa +8,7%; Reflexo 3,2% do dano sofrido |
| Escudo Dourado | 4 | PV Máx +76; Defesa +9,5%; Reflexo 6% do dano sofrido |
| Baluarte do Carcereiro — peça única, só por drop; cai do chefe do andar 50 | 4 | PV Máx +82; Defesa +10,9%; Reflexo 6,5% do dano sofrido |
| Escudo de Aço do Vazio | 5 | PV Máx +104; Defesa +11,5%; Reflexo 7,5% do dano sofrido |
| Escudo Abissal | 6 | PV Máx +138; Defesa +14%; Reflexo 9% do dano sofrido |

## Arqueiro (42 peças)

### Arqueiro: Arma (12)

| Peça | Tier | Linha | Atributos | Habilidades |
| --- | --- | --- | --- | --- |
| Arco Curto | 1 | Arco | Dano 8; Taxa de Crítico +1,5%; Vel. Ataque +9,7% | Chuva de Flechas, Tiro de Abertura, Tiro Potente |
| Besta Leve | 1 | Besta | Dano 10; Taxa de Crítico +3%; Dano Crítico +14,7% | Virote Perfurante, Tiro Duplo, Tiro Fatal |
| Arco de Caça | 2 | Arco | Dano 21; Taxa de Crítico +3%; Vel. Ataque +11,4% | Chuva de Flechas, Tiro de Abertura, Tiro Potente |
| Besta de Ferro | 2 | Besta | Dano 26; Taxa de Crítico +6%; Dano Crítico +14,9% | Virote Perfurante, Tiro Duplo, Tiro Fatal |
| Arco Longo | 3 | Arco | Dano 46; Taxa de Crítico +5%; Vel. Ataque +14% | Chuva de Flechas, Tiro de Abertura, Tiro Potente |
| Besta de Aço | 3 | Besta | Dano 55; Taxa de Crítico +10%; Dano Crítico +15,4% | Virote Perfurante, Tiro Duplo, Tiro Fatal |
| Arco Élfico | 4 | Arco | Dano 63; Taxa de Crítico +7%; Vel. Ataque +15,2% | Chuva de Flechas, Tiro de Abertura, Tiro Potente |
| Besta Dourada | 4 | Besta | Dano 77; Taxa de Crítico +14%; Dano Crítico +16,5% | Virote Perfurante, Tiro Duplo, Tiro Fatal |
| Arco da Lua | 5 | Arco | Dano 112; Taxa de Crítico +10%; Vel. Ataque +20,7% | Chuva de Flechas, Tiro de Abertura, Tiro Potente |
| Besta de Aço do Vazio | 5 | Besta | Dano 136; Taxa de Crítico +20%; Dano Crítico +17,8% | Virote Perfurante, Tiro Duplo, Tiro Fatal |
| Arco Abissal | 6 | Arco | Dano 168; Taxa de Crítico +12%; Vel. Ataque +22,6% | Chuva de Flechas, Tiro de Abertura, Tiro Potente |
| Besta Abissal | 6 | Besta | Dano 204; Taxa de Crítico +24%; Dano Crítico +18,2% | Virote Perfurante, Tiro Duplo, Tiro Fatal |

### Arqueiro: Armadura (6)

| Peça | Tier | Atributos | Habilidades |
| --- | --- | --- | --- |
| Gibão de Couro Cru | 1 | Taxa de Crítico +4,3%; Vel. Ataque +4,4%; PV Máx +24; Defesa +1,8% | Esquiva |
| Couro de Batedor | 2 | Taxa de Crítico +4,7%; Vel. Ataque +4,8%; PV Máx +54; Defesa +3,6% | Esquiva |
| Couro de Patrulheiro | 3 | Taxa de Crítico +5,5%; Vel. Ataque +5,6%; PV Máx +96; Defesa +6% | Esquiva |
| Couro de Caçador | 4 | Taxa de Crítico +6%; Vel. Ataque +6%; PV Máx +132; Defesa +7,8% | Esquiva |
| Couro do Espreitador Noturno | 5 | Taxa de Crítico +6,5%; Vel. Ataque +6,3%; PV Máx +216; Defesa +10,8% | Esquiva |
| Couro Abissal | 6 | Taxa de Crítico +7,2%; Vel. Ataque +6,8%; PV Máx +291; Defesa +13,2% | Esquiva |

### Arqueiro: Elmo (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Capuz de Couro Cru | 1 | Taxa de Crítico +1,4%; Vel. Ataque +1,5%; PV Máx +12; Defesa +0,4% |
| Capuz de Batedor | 2 | Taxa de Crítico +1,6%; Vel. Ataque +1,6%; PV Máx +24; Defesa +0,8% |
| Capuz de Patrulheiro | 3 | Taxa de Crítico +1,9%; Vel. Ataque +1,9%; PV Máx +42; Defesa +1,1% |
| Capuz de Caçador | 4 | Taxa de Crítico +2%; Vel. Ataque +2%; PV Máx +65; Defesa +1,6% |
| Capuz do Espreitador | 5 | Taxa de Crítico +2,2%; Vel. Ataque +2,1%; PV Máx +92; Defesa +1,9% |
| Capuz Abissal | 6 | Taxa de Crítico +2,4%; Vel. Ataque +2,3%; PV Máx +115; Defesa +2,3% |

### Arqueiro: Luvas (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Braçadeiras de Couro Cru | 1 | Dano 2; Taxa de Crítico +2,4%; Vel. Ataque +2,5% |
| Braçadeiras de Batedor | 2 | Dano 4; Taxa de Crítico +2,6%; Vel. Ataque +2,7% |
| Braçadeiras de Patrulheiro | 3 | Dano 8; Taxa de Crítico +3,1%; Vel. Ataque +3,1% |
| Braçadeiras de Caçador | 4 | Dano 11; Taxa de Crítico +3,4%; Vel. Ataque +3,4% |
| Braçadeiras do Espreitador | 5 | Dano 17; Taxa de Crítico +3,6%; Vel. Ataque +3,5% |
| Braçadeiras Abissais | 6 | Dano 21; Taxa de Crítico +4%; Vel. Ataque +3,8% |

### Arqueiro: Botas (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Sapatos de Couro Cru | 1 | Taxa de Crítico +1,6%; Vel. Ataque +1,7%; PV Máx +7; Defesa +3,9% |
| Botas de Batedor | 2 | Taxa de Crítico +1,8%; Vel. Ataque +1,8%; PV Máx +13; Defesa +4,8% |
| Botas de Patrulheiro | 3 | Taxa de Crítico +2,1%; Vel. Ataque +2,1%; PV Máx +21; Defesa +6% |
| Botas de Caçador | 4 | Taxa de Crítico +2,3%; Vel. Ataque +2,3%; PV Máx +30; Defesa +7,2% |
| Botas do Espreitador | 5 | Taxa de Crítico +2,4%; Vel. Ataque +2,4%; PV Máx +41; Defesa +9% |
| Botas Abissais | 6 | Taxa de Crítico +2,7%; Vel. Ataque +2,5%; PV Máx +53; Defesa +10,7% |

### Arqueiro: Mão secundária (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Aljava de Couro Cru | 1 | Taxa de Crítico +1,8%; Vel. Ataque +1,9%; PV Máx +12; Defesa +2,4% |
| Aljava de Batedor | 2 | Taxa de Crítico +2%; Vel. Ataque +2%; PV Máx +22; Defesa +3,6% |
| Aljava de Patrulheiro | 3 | Taxa de Crítico +2,3%; Vel. Ataque +2,3%; PV Máx +31; Defesa +4,6% |
| Aljava de Caçador | 4 | Taxa de Crítico +2,5%; Vel. Ataque +2,5%; PV Máx +46; Defesa +5,7% |
| Aljava do Espreitador | 5 | Taxa de Crítico +2,7%; Vel. Ataque +2,6%; PV Máx +62; Defesa +6,9% |
| Aljava Abissal | 6 | Taxa de Crítico +3%; Vel. Ataque +2,8%; PV Máx +83; Defesa +8,4% |

## Mago (42 peças)

### Mago: Arma (12)

| Peça | Tier | Linha | Atributos | Habilidades |
| --- | --- | --- | --- | --- |
| Cajado de Aprendiz | 1 | Cajado | Dano 9; Taxa de Crítico +3%; Dano Crítico +64%; Queima o inimigo | Explosão Arcana, Chamas, Nova |
| Cetro de Cobre | 1 | Cetro | Dano 10; Taxa de Crítico +3%; Regenera 0,6% da vida/s | Bênção, Drenar Vida, Pulso Sombrio |
| Cajado de Carvalho | 2 | Cajado | Dano 23; Taxa de Crítico +6%; Dano Crítico +74,3%; Queima o inimigo | Explosão Arcana, Chamas, Nova |
| Cetro de Ferro | 2 | Cetro | Dano 24; Taxa de Crítico +6%; Regenera 0,8% da vida/s | Bênção, Drenar Vida, Pulso Sombrio |
| Cajado de Ébano | 3 | Cajado | Dano 49; Taxa de Crítico +10%; Dano Crítico +82,8%; Queima o inimigo | Explosão Arcana, Chamas, Nova |
| Cetro de Prata | 3 | Cetro | Dano 52; Taxa de Crítico +10%; Regenera 1,1% da vida/s | Bênção, Drenar Vida, Pulso Sombrio |
| Cajado Élfico | 4 | Cajado | Dano 68; Taxa de Crítico +14%; Dano Crítico +84,8%; Queima o inimigo | Explosão Arcana, Chamas, Nova |
| Cetro de Ouro | 4 | Cetro | Dano 72; Taxa de Crítico +14%; Regenera 1,1% da vida/s | Bênção, Drenar Vida, Pulso Sombrio |
| Cajado Lunar | 5 | Cajado | Dano 120; Taxa de Crítico +20%; Dano Crítico +94,6%; Queima o inimigo | Explosão Arcana, Chamas, Nova |
| Cetro de Obsidiana | 5 | Cetro | Dano 128; Taxa de Crítico +20%; Regenera 1,7% da vida/s | Bênção, Drenar Vida, Pulso Sombrio |
| Cajado do Vazio | 6 | Cajado | Dano 180; Taxa de Crítico +24%; Dano Crítico +98,5%; Queima o inimigo | Explosão Arcana, Chamas, Nova |
| Cetro Abissal | 6 | Cetro | Dano 192; Taxa de Crítico +24%; Regenera 2% da vida/s | Bênção, Drenar Vida, Pulso Sombrio |

### Mago: Armadura (6)

| Peça | Tier | Atributos | Habilidades |
| --- | --- | --- | --- |
| Túnica de Linho | 1 | Dano Crítico +47,5%; PV Máx +24; Defesa +1,8%; Regenera 0,6% da vida/s | Fôlego Arcano |
| Manto Caseiro | 2 | Dano Crítico +50,3%; PV Máx +54; Defesa +3,6%; Regenera 0,7% da vida/s | Fôlego Arcano |
| Veste de Seda | 3 | Dano Crítico +54,5%; PV Máx +96; Defesa +6%; Regenera 0,7% da vida/s | Fôlego Arcano |
| Manto Arcano | 4 | Dano Crítico +56,3%; PV Máx +132; Defesa +7,8%; Regenera 0,8% da vida/s | Fôlego Arcano |
| Manto Lunar | 5 | Dano Crítico +58,7%; PV Máx +216; Defesa +10,8%; Regenera 0,9% da vida/s | Fôlego Arcano |
| Mortalha do Vazio | 6 | Dano Crítico +61,5%; PV Máx +291; Defesa +13,2%; Regenera 1% da vida/s | Fôlego Arcano |

### Mago: Elmo (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Capuz de Linho | 1 | Dano Crítico +15,9%; PV Máx +12; Defesa +0,4%; Regenera 0,2% da vida/s |
| Capuz Caseiro | 2 | Dano Crítico +16,8%; PV Máx +24; Defesa +0,8%; Regenera 0,2% da vida/s |
| Diadema de Seda | 3 | Dano Crítico +18,2%; PV Máx +42; Defesa +1,1%; Regenera 0,2% da vida/s |
| Coroa Arcana | 4 | Dano Crítico +18,8%; PV Máx +65; Defesa +1,6%; Regenera 0,3% da vida/s |
| Diadema Lunar | 5 | Dano Crítico +19,6%; PV Máx +92; Defesa +1,9%; Regenera 0,3% da vida/s |
| Coroa do Vazio | 6 | Dano Crítico +20,5%; PV Máx +115; Defesa +2,3%; Regenera 0,3% da vida/s |

### Mago: Luvas (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Faixas de Linho | 1 | Dano 2; Dano Crítico +26,5%; Regenera 0,3% da vida/s |
| Luvas Caseiras | 2 | Dano 4; Dano Crítico +28%; Regenera 0,4% da vida/s |
| Luvas de Seda | 3 | Dano 8; Dano Crítico +30,3%; Regenera 0,4% da vida/s |
| Luvas Arcanas | 4 | Dano 11; Dano Crítico +31,3%; Regenera 0,4% da vida/s |
| Luvas Lunares | 5 | Dano 17; Dano Crítico +32,7%; Regenera 0,5% da vida/s |
| Luvas do Vazio | 6 | Dano 21; Dano Crítico +34,2%; Regenera 0,6% da vida/s |

### Mago: Botas (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Sandálias de Linho | 1 | Dano Crítico +17,8%; PV Máx +7; Defesa +3,9%; Regenera 0,2% da vida/s |
| Sapatos Caseiros | 2 | Dano Crítico +18,9%; PV Máx +13; Defesa +4,8%; Regenera 0,3% da vida/s |
| Pantufas de Seda | 3 | Dano Crítico +20,4%; PV Máx +21; Defesa +6%; Regenera 0,3% da vida/s |
| Sandálias Arcanas | 4 | Dano Crítico +21,1%; PV Máx +30; Defesa +7,2%; Regenera 0,3% da vida/s |
| Botas Lunares | 5 | Dano Crítico +22%; PV Máx +41; Defesa +9%; Regenera 0,3% da vida/s |
| Botas do Vazio | 6 | Dano Crítico +23,1%; PV Máx +53; Defesa +10,7%; Regenera 0,4% da vida/s |

### Mago: Mão secundária (6)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Grimório de Aprendiz | 1 | Dano Crítico +19,8%; PV Máx +12; Defesa +2,4%; Regenera 0,3% da vida/s |
| Grimório de Adepto | 2 | Dano Crítico +21%; PV Máx +22; Defesa +3,6%; Regenera 0,3% da vida/s |
| Grimório de Erudito | 3 | Dano Crítico +22,7%; PV Máx +31; Defesa +4,6%; Regenera 0,3% da vida/s |
| Grimório Arcano | 4 | Dano Crítico +23,5%; PV Máx +46; Defesa +5,7%; Regenera 0,3% da vida/s |
| Grimório Lunar | 5 | Dano Crítico +24,5%; PV Máx +62; Defesa +6,9%; Regenera 0,4% da vida/s |
| Grimório do Vazio | 6 | Dano Crítico +25,7%; PV Máx +83; Defesa +8,4%; Regenera 0,4% da vida/s |

## Comuns a todas as classes (18 peças)

Aqui estão o equipamento inicial de tier 0 (a clava e as roupas esfarrapadas), que **não concede habilidade nenhuma**, os anéis e as relíquias.

### Comuns: Arma (1)

| Peça | Tier | Linha | Atributos | Habilidades |
| --- | --- | --- | --- | --- |
| Clava de Madeira | 0 | — (sem linha) | Dano 0 | nenhuma (equipamento inicial) |

### Comuns: Armadura (1)

| Peça | Tier | Atributos | Habilidades |
| --- | --- | --- | --- |
| Roupas Esfarrapadas | 0 | — | nenhuma (equipamento inicial) |

### Comuns: Anel (8)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Anel de Cobre | 1 | Taxa de Crítico +6%; Dano Crítico +15% |
| Anel de Prata | 2 | Taxa de Crítico +7%; Dano Crítico +20% |
| Anel de Ouro | 3 | Taxa de Crítico +9%; Dano Crítico +26% |
| Anel de Rubi | 4 | Taxa de Crítico +10,5%; Dano Crítico +33% |
| Anel de Obsidiana | 5 | Taxa de Crítico +12,5%; Dano Crítico +42% |
| Anel da Alma do Lich — peça única, só por drop; cai do chefe do andar 75 | 5 | Taxa de Crítico +14,4%; Dano Crítico +45,4% |
| Anel Abissal | 6 | Taxa de Crítico +14,5%; Dano Crítico +50% |
| Anel Coração do Abismo — peça única, só por drop | 6 | Taxa de Crítico +16,7%; Dano Crítico +54% |

### Comuns: Relíquia (8)

| Peça | Tier | Atributos |
| --- | --- | --- |
| Amuleto da Agilidade | — | Vel. Ataque +8% |
| Anel de Vitalidade | — | Regenera 0,9% da vida/s |
| Brasão do Berserker | — | Dano Crítico +75% |
| Emblema do Aventureiro — vem do Passe | — | Dano final +2%; Ouro extra +5% |
| Filactério do Lich — cai do chefe do andar 75 | — | Roubo de Vida +5% |
| Moeda da Sorte Goblin — cai do chefe do andar 25 | — | Ouro extra +10% |
| Sigilo do Senhor Supremo — cai do chefe do andar 100 | — | Taxa de Crítico +4%; Dano Crítico +20% |
| Totem do Chefe de Guerra — cai do chefe do andar 50 | — | Dano final +8,5% |
