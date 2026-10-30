# Tabela medida uma vez envelhece quando o jogo muda

Ligações: [[2026-10-30 — Antifraude rejeitava jogador honesto no dia 2]] · [[Guarda derivado não enxerga a sua mudança]] · [[Números e promessas que envelhecem calados]] · [[Antifraude e temporada]] · [[A função publicada não é a função do repositório]]

**Sintoma.** O servidor rejeita ou marca jogador honesto, e nada no repositório fica vermelho. O jogador só sabe que o progresso dele "não foi aceito" ou que ele sumiu do ranking.

**Causa.** O antifraude julga cada envio contra **tabelas medidas em jogadores simulados** (`supabase/functions/_shared/progress/bounds.ts` e `tables.ts`). Toda vez que o jogo muda a velocidade com que o herói sobe de nível ou de andar, a tabela pode ficar para trás. Foi o que aconteceu com `floorCapByLevel` (o teto de andar para cada nível): ele foi medido quando o nível 24 chegava no dia 2; a Rodada 28 (`be910bd`, 20/10) multiplicou por 3,3 o custo dos primeiros níveis, regenerou as tabelas que conhecia e deixou esta para trás. O próprio `bounds.ts` já dizia que o andar 25 chega no dia 2; só esta tabela discordava. Entre 20/10 e 30/10 o servidor rejeitou todo jogador novo honesto no dia 2 (nível 13, andar 25, teto 14).

**Por que nada acendeu.** Nenhum teste punha o jogador honesto diante do veredito real do servidor. Os testes que existiam comparavam a tabela com **valores derivados** — ver [[Guarda derivado não enxerga a sua mudança]] — e conferiam outras tabelas.

**A lição.** Uma tabela que **limita** o jogador honesto não pode ser julgada só contra o que o jogo diz dela. Precisa de um teste que **jogue** o honesto e **mostre cada envio** ao avaliador real, como o servidor veria. É o que faz `src/game/__tests__/honestPlayerAntifraud.test.ts`.

**A regra de derivação que ficou.** Para cada nível, o andar mais fundo em que qualquer corrida honesta já esteve naquele nível ou abaixo, vezes a folga de 1,2 que a tabela sempre teve. **Média mais dois desvios foi descartada**: a cauda é o que importa aqui. Uma rolagem de lendária sortuda chega ao andar 75 no nível 42, onde a média é 44, e uma regra feita sobre a média marcaria justamente o jogador honesto mais sortudo, que é o defeito que se estava consertando.

**O que fazer da próxima vez que o ritmo do jogo mudar** (nível, andar, XP, conteúdo que paga mais):

1. rode `npx vitest run honestPlayerAntifraud` (o teste roda dentro do `npm test`; `HONEST_SEEDS` e `HONEST_DAYS` alargam a medição à mão);
2. se acender, o **número** está errado, não o teste: alargue a tabela em `bounds.ts` **a partir de uma medição**, nunca no teste;
3. lembre que só `submit-progress` lê esse teto, então ele precisa ser republicado ([[A função publicada não é a função do repositório]]);
4. e republicar **não perdoa ninguém** — as linhas gravadas continuam em `progress_snapshots`. Perdoar é um passo à mão, no banco de produção, descrito em `docs/PERDOAR_FALSOS_POSITIVOS_2026-10-30.md`.

**Alarme falso que a medição derrubou.** `LEVEL_PACE` em 1,39 parecia um problema. Era a recontagem do próprio simulador, que ignora o XP em rajada que o `evaluate.ts` desconta. Pelo avaliador real nunca disparou em 24 jogadores ao longo de 60 dias.

**Depois.** `FLOOR_PACE` e a primeira descida (`DEPTH_PACE`) foram remedidos em 30/10/2026 com 186 corridas (144 honestas e 42 de compradores), depois de corrigir o comprador simulado, que vestia peça acima do nível. Andar: 6,6 / 8,4 / 9,2 / 9,3 dias para 50 / 75 / 90 / 100. Primeira descida: marca acima de 94, rejeita acima de 149, só quando a profundidade anterior é 0. O diretor decidiu pelo mandato do dono. O que o trapaceiro ganha está em `bounds.ts`; a função só vale depois de republicar `submit-progress`.
