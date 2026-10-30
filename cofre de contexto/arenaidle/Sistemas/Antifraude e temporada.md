# Antifraude e temporada

Voltar: [[Comece aqui]] · Ligações: [[Tabela medida uma vez envelhece quando o jogo muda]] · [[Guarda derivado não enxerga a sua mudança]] · [[A função publicada não é a função do repositório]] · [[2026-10-30 — Antifraude rejeitava jogador honesto no dia 2]] · [[Economia e materiais]] · [[Guardas que existem]] · [[Decisões do dono]] · [[O que está em aberto]]

O manual de operação vive em `docs/SEASON_RANKING.md` (comandos, SQL, abrir e fechar temporada). Esta nota guarda o que aquele não conta: como o sistema já falhou e o que fazer ao mexer no jogo.

## O que o sistema é, em cinco linhas

- O jogo (só web, só com a bandeira ligada) envia o save para `submit-progress` no máximo a cada 10 min e logo depois de subir de nível ou matar chefe. **A função extrai os números ela mesma** e grava um snapshot carimbado com o relógio do banco em `progress_snapshots`.
- Cada snapshot é comparado com o **histórico do servidor** da conta, nunca com datas do save. Todos os números ficam em `supabase/functions/_shared/progress/bounds.ts`, cada um com a fonte.
- Veredito: `ok` (conta), `flagged` (guardado, **não conta**), `rejected` (impossível pelo tempo). **Só `ok` vira base**: um marcado ou rejeitado nunca vira base nem sobe o pico.
- **Conta com snapshot marcado ou rejeitado, não perdoado, fica fora do ranking e do campeonato** na temporada valendo (`SEASON_RANKING.md` seção 2). Por isso um falso positivo custa **prêmio**, não só incômodo.
- Pontuação: `nível_total × 1.000.000 + (maior andar + maior profundeza)`. O desempate de quem chega ao mesmo número é quem chegou primeiro, pelo relógio do servidor.

## Dois tipos de limite (`bounds.ts`)

- **Teóricos:** o que as regras do jogo permitem a quem não faz mais nada, na melhor zona, com todo bônus. Recalculados por `npm run season:bounds`; `seasonProgress.test.ts` falha se a constante ficar **abaixo** do que o jogo permite. O XP por hora é "uma foto do conteúdo, não um botão de segurança": segurá-lo abaixo do que o jogo paga não torna o servidor mais seguro, faz o servidor **recusar progresso legítimo**.
- **De ritmo:** quão rápido a semente simulada mais rápida chegou lá (o dono do Passe), com folga: sinaliza a 2x, rejeita a 3x. Aviso suave (`FAST_*`) entre 1,3x e 2x: só entra na lista de auditoria, não tira pontos.

## Como mexer no jogo sem quebrar o servidor

1. Mexeu em nível, andar, XP, conteúdo que paga mais, ou material que cai? **O servidor tem cópias dos números do jogo**, geradas: `npm run season:tables` (curva de XP, portões de nível, zonas), `npm run item:tables` (raridades, substatos, chances), `npm run material:tables` (drops, plantas, minérios, taxas). Cada uma tem teste que falha se o arquivo ficar velho ([[Guardas que existem]]).
2. Pergunte **"a conta que gera esse limite conhece a minha mudança?"** ([[Guarda derivado não enxerga a sua mudança]]).
3. Rode o que põe o jogador **honesto** diante do avaliador real (`honestPlayerAntifraud.test.ts`). Se acender, o número da tabela está errado para o jogo: alargue-o por medição em `bounds.ts`, nunca no teste.
4. Os tetos de material por dia: pior dia honesto medido contra o teto diário. Referência de 29/10: depois das mudanças de material de classe o mais apertado era a garra de demônio a 0,67 do teto diário (`c07f3a4`); e o XP por hora ficou a 0,95 do limite com o crítico acima de 100% voltando como dano (`ee652a1`). **Nada disso é lei:** meça de novo a cada mudança de conteúdo.
5. **Republique as funções** que importam `_shared`. Commit não publica ([[A função publicada não é a função do repositório]]).
6. **Republicar não perdoa.** Contas já marcadas ficam marcadas. Veja abaixo.

## Perdoar quem foi marcado sem motivo

Procedimento completo: `docs/PERDOAR_FALSOS_POSITIVOS_2026-10-30.md`. Em duas linhas: a consulta do passo 1 lista só as contas marcadas **exclusivamente** por `FLOOR_ABOVE_LEVEL_CAP`; `progress_clear_flags(uuid, nota, rebase)` perdoa uma de cada vez, gravando uma linha de auditoria por snapshot em `progress_flag_clears` (nada é apagado). `rebase = true` para quem ficou rejeitado vários dias seguidos; `false` para quem só foi marcado. Depois, rodar o passo 1 de novo: tem de vir vazio. É passo **à mão, no banco de produção**, do dono. Este cofre não registra se já foi feito ([[O que está em aberto]]).

## O que o antifraude NÃO protege

Está em `SEASON_RANKING.md` (seção 2, "O que isto NÃO protege"): trapaceiro paciente dentro dos limites, edição antes do primeiro snapshot, bots que jogam de verdade, contas compartilhadas ou vendidas, várias contas, e um script que faz o save crescer sempre abaixo do limite (o save continua sendo escrito pelo cliente). O documento conclui que **o primeiro prêmio deve ser modesto** e que a **auditoria manual dos 10 primeiros** antes de pagar é obrigatória.

## Decisões do dono que moram aqui

- **O desempate fica na profundidade da masmorra**, mesmo favorecendo o guerreiro. Detalhe e motivo em [[Decisões do dono]].
- Só entra no ranking quem tem Passe ativo e real no servidor e e-mail confirmado. O prêmio é um valor fixo que o dono escolhe e nunca é descrito como parte da receita do Passe (`docs/SEASON_RANKING.md`); a lista antiga de decisões registrava prêmio mínimo de US$ 1.000.
- O prêmio do playtest vai por mérito (os 25 heróis de maior nível), **nunca sorteio** (no Brasil, sorteio promocional exige autorização) — `RESUMO_DO_PROJETO.md` seção 7.

## Ainda em aberto

- `FLOOR_PACE` e a primeira descida (`DEPTH_PACE`) foram remedidos em 30/10/2026 com 186 corridas (144 honestas e 42 de compradores), depois de corrigir o comprador simulado, que vestia peça acima do nível. Andar: 6,6 / 8,4 / 9,2 / 9,3 dias para 50 / 75 / 90 / 100. Primeira descida: marca acima de 94, rejeita acima de 149, só quando a profundidade anterior é 0. O diretor decidiu pelo mandato do dono. O que o trapaceiro ganha está em `bounds.ts`; a função só vale depois de republicar `submit-progress`.
- A vigilância (`ops-watchdog`, `ai-auditor`) roda com limites antigos até alguém publicá-las com `--no-verify-jwt` (o modo automático bloqueia).
- Ver [[O que está em aberto]].
