# O simulador só jogava o guerreiro

Data: 29/10/2026 (commits `4718b2d` e `2b61cf6`). Ensinou: [[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]] · [[Ferramentas de medição]] · Sistema: [[Economia e materiais]] · [[Antifraude e temporada]]

**O que acontecia.** Todo número com que se equilibram as classes saía de um simulador que só jogava o guerreiro, e de dois relatórios que imprimiam a coisa errada. Isso inclui todo teto do antifraude e toda tabela dos dias 10, 30 e 60: uma classe medindo as outras duas.

**Por que ninguém viu.** O mago que o simulador montava vestia uma peça única de placa que dropou na Caça e terminava a corrida com `classActive` falso, então **toda medição de mago até então era de um mago sem a classe dele**.

**Conserto (`2b61cf6`).**

- `player.ts`: a classe agora é do chamador (`PlayerOptions.cls` e `weapon`) e o jogador se compromete com **uma** linha, que é exatamente o que liga o bônus de classe. `equipBest` recusa peça fora da linha. O plano de Caça apanha os materiais de classe da linha (tendão e pena para couro, pó arcano para tecido), vazio para o guerreiro. O caminho do guerreiro ficou **idêntico byte a byte**: cinco conjuntos de opções, duas sementes, 21 dias, dez de dez snapshots iguais.
- `materialFlow.sim.ts`: a lista de Caça passou a vir de `HUNTING_ZONES` em vez de uma escrita à mão que envelheceu no dia em que os materiais de classe entraram nas zonas e os imprimia como "garden". O tipo de um material vem da fonte real, e o que não vem de nenhuma imprime "other" em vez de cair em "garden" por padrão. Os marcos de dia seguem `SIM_DAYS`, então uma corrida de 60 dias deixa de ler só até o dia 21.
- `professions.sim.ts`: a tabela do Adubo imprimia zeros porque o ensaio punha 9999 Adubos na mochila, enchia todos os slots e fazia toda colheita ser recusada por falta de lugar. **Nada em `src/` estava errado.** Os Adubos agora entram um a um e são contados, a coluna diz "counted" no lugar de um "approx." que era divisão solta, e a contagem de canteiros vem de `unlockedGardenPlots` no lugar de uma frase que dizia 5 onde o jogo dá 6.
- `classPlayer.sim.ts` (novo): joga as três classes e cada arma fixa e **falha** a corrida se algum herói termina sem `classActive`, pelas contas do jogo (`affinityBonuses`). Verificado: 21 dias, semente 1, nove corridas, `classActive` verdadeiro nas nove.

**O que o commit registra.** `4718b2d` diz que a ordem de trabalho mudou por isso: a régua é consertada antes de ser usada de novo. Os tetos do antifraude são tema de [[Tabela medida uma vez envelhece quando o jogo muda]].
