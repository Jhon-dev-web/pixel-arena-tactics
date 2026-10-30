# Números e promessas que envelhecem calados

Ligações: [[2026-10-29 — O cartão do evento prometia +8% e o jogo pagava até +15%]] · [[2026-10-28 — O portão de sub-nível dizia proteger e só atrasava]] · [[2026-10-29 — A tela de Táticas mostrava uma recarga que o herói nunca tem]] · [[2026-10-29 — Nomes que contradiziam o que a coisa é]] · [[Guardas que existem]]

**Sintoma.** O texto na tela, o comentário no código ou a tabela gerada descrevem um jogo que não existe mais. Ninguém percebe, porque nada acende.

**Casos reais deste repositório:**

- o cartão de um evento prometia **+8%** enquanto o jogo pagava até **+15%**, porque os bônus somam (`huntCombat.ts`, `eventPct += b.pct`, teto `EVENT_XP_CAP`);
- o comentário de um portão dizia proteger contra "uma vitória de sorte", quando a medição mostrou que o combate é vencido com equipamento tier 2 e o portão pedia tier 5 — ele é **ritmo de progressão**, não capacidade;
- três rótulos diziam "exige CP" depois que os portões passaram a pedir equipamento. O pior deles mandava o jogador travado subir um número que **nunca** o destravaria.

**Mais casos de 29/10/2026**, achados depois de o registro original ser escrito:

- a tela de Táticas imprimia a recarga crua do tunable, enquanto o combate multiplica toda recarga por um fator que vai de 1,40 no nível 1 a 1,0 no nível 100 ([[2026-10-29 — A tela de Táticas mostrava uma recarga que o herói nunca tem]]);
- a nota da primeira Forja dizia que "a arma e o peitoral decidem" a classe; o código lê o **peso líder** entre cinco slots de peso e a arma só soma um degrau ([[2026-10-29 — Nomes que contradiziam o que a coisa é]]);
- o documento `docs/CLASSES_E_EQUIPAMENTOS.md` dizia que a promessa dos eixos "tem guarda" e estava "fechada e travada", quando o guarda media três armas de seis ([[A tabela de eixos julga classes, não armas gêmeas]]);
- onze documentos ainda descreviam o jogo antigo (Stripe, Steam, duelo por turnos). A saída foi apagar os que descreviam um jogo que não existe, reescrever o resumo e apontar o estado implantado para **um** lugar só (`RESUMO_DO_PROJETO.md` seção 7), porque o mesmo estado escrito em dez arquivos é como ele envelhece.

**Como evitar.** Número que aparece para o jogador ganha um teste que o prende à configuração — o modelo é `src/game/__tests__/eventCards.test.ts`, que lê `HUNT_EVENT_RULES`, `EVENT_BUFF_RULES` e `EVENT_XP_CAP` e exige que apareçam no texto, nas duas línguas. Mudar `targetBuffPct` de 0,08 para 0,085 faz dois testes falharem, um por idioma.

> Nenhum teste confere se o **verbo** de um rótulo bate com o que o código faz. Isso só se acha abrindo o jogo.

Quando um teste trava o texto antigo, troque-o por um que se guie pelo código. Foi o que se fez em `forgeClassNote.test.ts`: um teste percorre `CLASS_OF_WEIGHT` e exige que a nota pareie cada peso com a sua classe.
