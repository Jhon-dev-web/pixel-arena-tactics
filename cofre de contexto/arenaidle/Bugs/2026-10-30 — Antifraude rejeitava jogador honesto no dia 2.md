# Antifraude rejeitava jogador honesto no dia 2

Data: 30/10/2026 (commit `14110b9`; o commit é datado de 29/10 à noite no relógio do git, e os documentos escritos junto dizem 30/10). Ensinou: [[Tabela medida uma vez envelhece quando o jogo muda]] · [[Guarda derivado não enxerga a sua mudança]] · [[A função publicada não é a função do repositório]] · Sistema: [[Antifraude e temporada]] · Guarda: [[Guardas que existem]] · Em aberto: [[O que está em aberto]]

**É a pior coisa que este repositório tinha naquele dia.** Achado enquanto se checava outra coisa. Passando pelo `evaluateSnapshot` real, com as regras de histórico do próprio servidor, em 12 sementes do jogador comum e 12 do dono do Passe:

- **12 de 12 jogadores comuns REJEITADOS**, todos no dia 2, segunda visita, no nível 13, andar 25, contra um teto de 14 (rejeita acima de 24,6). Ficam rejeitados de 3 a 5 envios, até o nível chegar a 22 por volta do dia 4.
- **12 de 12 donos do Passe MARCADOS**, no dia 2 e de novo no meio do jogo, e 42 de 42 compradores simulados marcados. Isto não é cosmético: `docs/SEASON_RANKING.md` seção 2 diz que uma conta com snapshot marcado ou rejeitado e nunca perdoado fica **fora do ranking e do campeonato**. Compradores honestos estavam perdendo um prêmio com dinheiro de verdade.

**A causa não é o equilíbrio do dia nem o simulador.** `floorCapByLevel` foi medido quando o nível 24 chegava no dia 2. A Rodada 28 (`be910bd`, 20/10) multiplicou por 3,3 o custo dos primeiros níveis, regenerou as tabelas que conhecia e deixou esta para trás. O próprio `bounds.ts` já afirma que o andar 25 chega no dia 2; só esta tabela discordava. Nada acendeu, porque nada comparava o jogador honesto com o veredito do servidor.

**Conserto.** A tabela foi rederivada por medição: para cada nível, o andar mais fundo em que qualquer corrida honesta esteve naquele nível ou abaixo, vezes a folga de 1,2 que a tabela sempre teve. Média mais dois desvios foi rejeitada como regra, porque a cauda é o que importa: uma rolagem lendária sortuda chega ao andar 75 no nível 42, onde a média é 44, e uma regra feita sobre a média marcaria o jogador honesto mais sortudo, que é a falha exata que se estava consertando. Os fatores de rejeição não foram tocados e o `FLOOR_PACE` continua pegando trapaça por tempo.

**Alarme falso.** `LEVEL_PACE` a 1,39 foi falso: é a recontagem do próprio simulador, que ignora o XP em rajada que o `evaluate.ts` desconta. Pelo avaliador real nunca disparou em 24 jogadores ao longo de 60 dias.

**O guarda que faltava.** `src/game/__tests__/honestPlayerAntifraud.test.ts` joga o jogador real e **falha** se qualquer snapshot honesto for rejeitado **ou** simplesmente marcado. Provado à mão antes de commitar: com a tabela velha os dois cenários falham, nomeando "A1 day 2 second visit (level 13, floor 25): FLOOR_ABOVE_LEVEL_CAP".

**Precisa republicar `submit-progress`**, a única função que lê este teto ([[A função publicada não é a função do repositório]]). O commit `14110b9` diz que ela precisa ser republicada; o documento de perdão informa que foi republicada em 30/10.

**Republicar não perdoa ninguém.** As linhas já gravadas em `progress_snapshots` continuam lá e mantêm essas contas fora do ranking até alguém limpar. Perdoar é um passo à mão, no banco de produção: `docs/PERDOAR_FALSOS_POSITIVOS_2026-10-30.md` traz a consulta de leitura (só contas marcadas **exclusivamente** por `FLOOR_ABOVE_LEVEL_CAP`) e a função `progress_clear_flags(uuid, nota, rebase)`. O terceiro argumento é a escolha que importa: `false` só perdoa (para quem foi só marcado); `true` perdoa e copia o último snapshot marcado como novo `ok` (`MANUAL_BASELINE`), certo para quem ficou rejeitado vários dias seguidos. Por medição, os jogadores comuns ficavam rejeitados de 3 a 5 envios seguidos, então para esses `true` é o certo. Depois de perdoar, a consulta do passo 1 tem de vir vazia.

**Em aberto, com o dono.** `FLOOR_PACE` também foi medido com números velhos: o honesto chega ao andar 50 no dia 6 e a tabela diz 8. Hoje marca 1 dono do Passe em 12 e não rejeita ninguém. Ajustar afrouxa a defesa contra trapaça, então é decisão dele e não foi feito.

**Alcance real, conferido no banco em 30/10:** nenhum. Eram 99 envios de 5 contas, nenhum com `FLOOR_ABOVE_LEVEL_CAP`. O dano foi medido em jogadores simulados; nenhuma conta real foi rejeitada por isto.
