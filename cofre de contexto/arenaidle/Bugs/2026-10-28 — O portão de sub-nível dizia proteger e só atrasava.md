# O portão de sub-nível dizia proteger e só atrasava

Data: 28/10/2026, durante a reforma de classes. Ensinou: [[Números e promessas que envelhecem calados]] · Sistema: [[Caça e masmorra]] · [[Classes e equipamento]] · Guardas: [[Guardas que existem]]

**O que acontecia.** Os dois portões da Caça (sub-nível e profundidade) liberavam por **poder de combate**. Como o CP é a média geométrica de dano e vida efetiva, ele subestima quem troca defesa por velocidade: arqueiro (0,89 do guerreiro) e mago (0,82) destravavam **um sub-nível a menos** com o mesmo equipamento, sem nada na tela explicando.

**O que a medição mostrou.** As três classes vencem **todos** os dez sub-níveis, em todas as zonas e fundos, quatro horas sem uma derrota. O combate é vencido com índice de equipamento 2,4 a 4,0 e o portão pedia 3,7 a 8,4. Ou seja, o portão **nunca mediu capacidade** — é um marcador de ritmo. O comentário que o justificava como proteção contra "uma vitória de sorte" era falso.

**Conserto.** Os dois portões passaram a pedir **nível de equipamento** (`src/game/gearIndex.ts`): tier + refino + raridade, média sobre os 7 slots, declarado e igual para as três classes. O divisor é sempre 7 e slot vazio conta 0 — senão tirar a pior peça aumentaria a média e destravaria mais com menos.

**Guardas.**

- `zoneLevelGates.test.ts`: o último sub-nível do fundo mais difícil de **toda** zona tem de ser alcançável com o melhor equipamento do jogo. Essa regra pega o defeito original da zona 5, que herdou a curva da zona 4 sobre uma base 2,24× maior e pôs seus últimos sub-níveis fora do alcance de qualquer build.
- `gearIndex.test.ts`: tirar uma peça **baixa** o índice; as três classes têm o mesmo índice com o mesmo equipamento.

**O que continua sendo do dono.** O portão de sub-nível é **ritmo**, não capacidade. Ver [[Decisões do dono]].
