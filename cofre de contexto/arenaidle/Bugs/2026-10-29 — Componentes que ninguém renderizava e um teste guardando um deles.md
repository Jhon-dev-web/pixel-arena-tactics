# Componentes que ninguém renderizava e um teste guardando um deles

Data: 29/10/2026 (commit `2ec318c`). Ensinou: [[Um guarda que mede uma amostra pode passar com a regra quebrada fora dela]] · [[Números e promessas que envelhecem calados]] · Em aberto: [[O que está em aberto]]

**O que se achou.** `Campfire`, `FirstViewTooltip`, `TopHud` e `WelcomeModal` não eram importados por ninguém: 139 linhas que só tornavam o projeto mais difícil de ler. Uma revisão encomendada pelo dono as achou; cada uma foi conferida quanto a imports antes de sair.

**O que importava.** O `WelcomeModal`, porque `leagueReset.test.ts` exigia que o aviso de reset pré-temporada aparecesse em três arquivos e esse era um deles. O teste guardava uma tela que nenhum jogador alcança, e o nome do aviso dizia que ele estava na "tela de boas-vindas". A tela de boas-vindas viva é o `WelcomeBackModal`, que **não** carrega o aviso.

**Conserto.** O teste agora afirma as duas telas que o jogador realmente vê, a aba de temporada e o portão de entrada, e diz isso. Três comentários que apontavam para os arquivos apagados foram corrigidos em vez de ficar pendurados.

**Deixado de propósito.** `SaveData.seenTooltips` e a fila de tooltips em `App.tsx`: é lógica morta, mas o campo está no save de todo jogador, e isso é dado, não código. Foi reportado à parte: a fila é a metade visível de uma funcionalidade que parou de funcionar em silêncio.

**Pergunta que ficou com o dono:** o aviso de reset pertence ao modal de boas-vindas vivo? (Ver [[O que está em aberto]].)
