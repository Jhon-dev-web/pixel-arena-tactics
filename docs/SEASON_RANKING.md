# Como rodar uma temporada com prêmio (ranking da Temporada)

AVISO: **nada disto foi aplicado em lugar nenhum por este trabalho.** Nenhuma migration foi aplicada, nenhuma função foi implantada, nenhum projeto Supabase, Stripe ou Vercel foi tocado, e o Deno e um Supabase de verdade nunca rodaram contra este código (só os testes do Vitest, com banco e rede simulados). Os valores de segredos ficam só nos painéis; aqui há apenas nomes. O ranking nasce **desligado**: com `VITE_SEASON_RANKING_ENABLED` ausente, a tela some e o jogo não envia nada.

O prêmio é um **valor fixo que você escolhe**. Ele nunca é descrito, no jogo, no portal ou nos textos legais, como parte da receita do Passe. O código não guarda nem inventa valor nenhum: o campo `seasons.prize_note` é um texto livre que só você escreve.

## 1. O que o sistema faz

- A conta só entra no ranking se: tem o **Passe** no servidor (`arena_private.owns_adventurer_pass`, nunca o campo do save), tem o **e-mail confirmado**, a temporada está `open` e o relógio **do servidor** ainda não passou de `freeze_at`, e o snapshot recebeu o veredito `ok`.
- O jogo (só na versão web, só com a bandeira ligada) envia o save para a função `submit-progress` no máximo a cada 10 minutos e logo depois de subir de nível ou matar um chefe. A função **extrai os números ela mesma** (nível com Paragon, XP, andar, profundeza, mortes, ouro ganho, chefes, tempo jogado, peças por raridade, únicas, conquistas) e guarda um snapshot **carimbado com o relógio do banco** na tabela `progress_snapshots` (só leitura para o próprio jogador, só a função escreve, nunca é editada).
- **Pontuação** (calculada só no servidor): `nível_total x 1.000.000 + (maior andar + maior profundeza)`, onde `nível_total` = nível do herói (até 100) + nível de Paragon. Ordem: maior nível (Paragon incluso), depois mais fundo. **Desempate:** vence quem chegou a essa pontuação **primeiro** no relógio do servidor (`tiebreak_at`, gravado só quando a pontuação sobe).
- **Congelamento:** depois de `freeze_at` nada muda, mesmo que você esqueça o `status` (a função confere a data e um trigger do banco recusa mudar pontuação fora da janela aberta).
- A lista pública (`season_leaderboard`) mostra só posição, nome de usuário, partes da pontuação e **quantidade** de avisos. Sem e-mail, sem id, sem os códigos.

## 2. O que a auditoria pega (e o que NÃO pega)

Cada snapshot novo é comparado com o **histórico do próprio servidor** da conta (primeiro snapshot aceito e o último), nunca com datas escritas no save. Todos os números ficam numa tabela só, `supabase/functions/_shared/progress/bounds.ts`, cada um com a fonte; `npm run season:bounds` imprime a tabela ao lado dos valores recalculados dos tunables, e um teste falha se o jogo ficar mais rápido do que a tabela admite. Se você mexer no equilíbrio, rode `npm run season:tables` (copia a curva de XP, os níveis das peças e as zonas para o servidor) e confira `season:bounds`.

Veredito: `ok` (conta para o ranking), `flagged` (fica guardado, **não conta**, entra na sua lista de auditoria) e `rejected` (impossível para o tempo decorrido; **não vira a nova base**, então progresso honesto que só chegou cedo demais é aceito depois, quando passar tempo de servidor suficiente). Uma chamada dentro de 10 minutos da anterior não grava nada e devolve o último veredito.

| Código | Veredito | O que significa |
| --- | --- | --- |
| `LEVEL_PACE`, `LEVEL_PACE_TOTAL` | flag acima de 2x, rejeita acima de 3x | Nível subiu mais rápido que a seed mais rápida da simulação longa (entre snapshots / desde o primeiro). |
| `FLOOR_PACE`, `FLOOR_PACE_TOTAL`, `DEPTH_PACE`, `DEPTH_PACE_TOTAL` | idem | Andares ou profundezas rápidos demais. |
| `XP_RATE`, `XP_RATE_TOTAL` | flag acima do teórico, rejeita acima de 2x | Mais XP por hora de servidor do que o jogo permite (melhor zona aberta + pedidos + masmorra) mais uma única recompensa atrasada. |
| `KILLS_RATE`, `GOLD_RATE`, `DUNGEON_RUNS_RATE`, `DUNGEON_FLOORS_RATE`, `BOSSES_RATE`, `UNIQUES_RATE`, `ACHIEVEMENTS_RATE` (e `_TOTAL`) | idem | Contadores crescendo além do teto. |
| `SECONDS_PLAYED_EXCEEDS_CLOCK` (e `_TOTAL`) | rejeita | Tempo jogado maior que o tempo real (salto de relógio). |
| `FLOOR_ABOVE_LEVEL_CAP` | flag / rejeita | Andar alto demais para o nível já visto nas simulações. |
| `GEAR_BELOW_GATE` | rejeita | Peça (ex.: tier 6) que não pode existir no nível ou andar do herói. |
| `DEPTH_WITHOUT_FLOOR_100` | rejeita | Profundeza sem ter passado do andar 100. |
| `PASS_FEATURES_WITHOUT_ENTITLEMENT` | rejeita | Recompensas premium ou vagas de Baú do Passe sem o Passe no servidor. |
| `PASS_FLAG_WITHOUT_ENTITLEMENT` | flag | O save diz que tem o Passe, o servidor diz que não. |
| `RESTORED_OLDER_SAVE`, `SAVE_REVISION_BACKWARDS` | flag | Um contador diminuiu ou a revisão voltou: a conta restaurou um save mais antigo (repetir sorteios é um truque conhecido). Volta a contar quando ultrapassa de novo o maior valor já visto. |
| `BASELINE_AHEAD_OF_ACCOUNT_AGE` | flag | O **primeiro** snapshot já vem muito adiante da idade da conta (save local antigo importado, ou edição antes da primeira sincronização). Não dá para provar que é falso; fica na sua lista. |

Os avisos (`flags`) de cada conta ficam na linha do ranking (`R:` na frente = veio de um snapshot rejeitado) e a lista pública mostra só a contagem.

### O que isto NÃO protege (leia antes de definir o prêmio)

- **Trapaceiro paciente dentro dos limites.** Quem edita o save um pouco por vez, sempre abaixo de 2x a seed mais rápida, passa. Os limites foram feitos para tornar a trapaça cara e visível, não impossível.
- **Edição antes do primeiro snapshot.** O primeiro snapshot é a base; só dá para sinalizar se estiver longe demais da idade da conta. Quem importa um save local legítimo muito adiantado também cai nesse aviso.
- **Bots e automação.** Um bot que joga de verdade, 24 horas, dentro das regras, parece um jogador dedicado.
- **Contas compartilhadas, vendidas ou jogadas por terceiros.** O servidor não sabe quem está do outro lado.
- **Várias contas** (cada uma precisa do Passe, o que custa dinheiro e ajuda a desencorajar, mas não impede).
- **Corrida entre duas chamadas simultâneas** (o limite de 10 minutos é conferido antes de gravar, sem trava de banco).
- O servidor lê os números do save que o cliente envia; ele não confere se esse save é o mesmo que está salvo em `characters`.

Por isso: **o primeiro prêmio deve ser modesto**, e **todo vencedor passa por auditoria manual antes do pagamento** (seção 5). O jogo e o regulamento devem dizer isso com todas as letras.

## 3. Aplicar e implantar (você faz, no projeto de DESENVOLVIMENTO primeiro)

1. **Migrations.** Pré-requisitos: `0001`, `0002` e `0003` já aplicadas (ver [`PASS_SALES.md`](PASS_SALES.md)). Aplique `supabase/migrations/0004_season_snapshots.sql` e depois `0005_seasons_ranking.sql` (SQL Editor ou `supabase db push` apontando para o projeto de dev). Cada arquivo termina com um **plano de testes SQL** e as instruções de rollback: rode o plano antes de seguir (cliente não escreve, não lê o que não é dele, a função de pontuação recusa quem não tem Passe ou e-mail confirmado, o trigger recusa mudar pontuação depois do congelamento). As 8 primeiras temporadas já vêm cadastradas, todas `upcoming` e sem valor de prêmio (a `0005` as semeia com datas de calendário; a `0006`, seção 8, **tira essas datas**: a temporada valendo só ganha datas quando abre). Depois aplique `0006_portal_meter_and_profession_ranking.sql` (meta de Passes, pré-temporada, `pass_meter()` e rankings por profissão; veja a seção 8).
2. **Função `submit-progress`.** Segredo por nome: `APP_ORIGIN` (a origem exata do jogo, a mesma das funções de pagamento). `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são fornecidas pela plataforma. Implante **com a verificação de JWT ligada** (o padrão; diferente do `stripe-webhook`, **não** use `--no-verify-jwt`).
3. **Variável na Vercel:** `VITE_SEASON_RANKING_ENABLED=true`. É variável de build do Vite: depois de mudar, faça um novo deploy. Sem ela (ou com qualquer outro valor) a tela some e nada é enviado. Nunca coloque chave de serviço em variável `VITE_*`.
4. A CSP do `vercel.json` já libera `https://*.supabase.co` em `connect-src`, que é onde a função e as leituras do ranking vão; confira no console de um Preview.

## 4. Abrir, congelar e fechar uma temporada (SQL Editor)

Situações (`seasons.status`): `upcoming` (nada conta), `open` (conta, enquanto o relógio do servidor estiver antes de `freeze_at`), `frozen`, `closed`, `paid`.

```sql
-- ajustar datas (só para abrir à mão; a temporada valendo abre sozinha ao atingir a meta de Passes, seção 8; o ranking é independente da Trilha do Passe de src/game/seasons.ts)
update public.seasons set starts_at = '2026-11-01 00:00:00+00', freeze_at = '2026-12-29 00:00:00+00', ends_at = '2026-12-31 00:00:00+00' where number = 2;
-- texto livre mostrado no jogo (deixe nulo para não mostrar nada). Nunca escreva uma fração da receita.
update public.seasons set prize_note = '<texto que você decidiu>' where number = 2;

-- ABRIR (só depois do checklist da seção 6)
update public.seasons set status = 'open' where number = 2;

-- depois de freeze_at o servidor já recusa mudanças; marque o estado para o jogo mostrar "encerrado"
update public.seasons set status = 'frozen' where number = 2;
-- auditoria concluída e vencedores definidos
update public.seasons set status = 'closed' where number = 2;
-- prêmios pagos
update public.seasons set status = 'paid' where number = 2;
```

## 5. Auditoria manual antes de pagar (SQL Editor, como dono)

Top 20 com o que você precisa para decidir:

```sql
select row_number() over (order by e.score desc, e.tiebreak_at asc) as pos,
       e.user_id, u.email, p.username,
       e.score / 1000000 as nivel_total,
       least(e.score % 1000000, 100) as andar,
       greatest(e.score % 1000000 - 100, 0) as profundeza,
       e.tiebreak_at, e.flags, e.best_snapshot_id,
       (select count(*) from public.progress_snapshots s where s.user_id = e.user_id) as snapshots,
       (select count(*) from public.progress_snapshots s where s.user_id = e.user_id and s.verdict = 'rejected') as rejeitados
from public.season_entries e
join auth.users u on u.id = e.user_id
left join public.profiles p on p.user_id = e.user_id
where e.season = 2 and e.disqualified = false and e.score > 0
order by e.score desc, e.tiebreak_at asc
limit 20;
```

Histórico completo de uma conta (a curva de progresso no relógio do servidor; procure saltos, degraus, mesmos números repetidos, horas de jogo impossíveis):

```sql
select created_at, verdict, reasons, save_revision, metrics_hash,
       metrics->>'heroLevel' as nivel, (metrics->>'paragonLevel') as paragon, metrics->>'highestFloor' as andar, metrics->>'deepestDepth' as profundeza,
       metrics->>'xp' as xp, metrics->>'kills' as mortes, metrics->>'goldEarned' as ouro, metrics->>'secondsPlayed' as segundos,
       metrics->>'bossesKilled' as chefes, metrics->'items' as pecas, metrics->'gateViolations' as pecas_fora_do_nivel
from public.progress_snapshots
where user_id = '<uuid>'
order by created_at;
```

O que olhar: conta criada pouco antes da temporada com nível altíssimo (`BASELINE_AHEAD_OF_ACCOUNT_AGE`), progresso sempre colado no limite, `RESTORED_OLDER_SAVE` repetido (volta ao save antigo para repetir sorteios), tempo jogado quase igual ao tempo real durante semanas sem pausa (bot), vários vencedores com o mesmo padrão de horários (conta compartilhada). Em caso de dúvida, peça à pessoa uma prova simples (por exemplo, abrir o jogo e mostrar o personagem) antes de pagar; isso precisa estar no regulamento.

Desclassificar (a conta sai da lista pública e da classificação; o trigger ainda permite editar isto depois do congelamento):

```sql
update public.season_entries
set disqualified = true, flags = flags || array['MANUAL:<motivo curto>']
where season = 2 and user_id = '<uuid>';
```

Marcar o pagamento: registre fora do banco (planilha sua) quem recebeu, quanto e quando, e depois `update public.seasons set status = 'paid' where number = 2;`. Os dados de pagamento (nome legal, documento, conta) são pedidos **só aos vencedores**, depois da auditoria, por e-mail, e nunca ficam em tabela do jogo.

Para corrigir de propósito uma pontuação depois do congelamento (não deveria acontecer), desligue o trigger `season_entries_freeze_guard` no SQL Editor, faça a correção e ligue de novo; deixe anotado.

## 6. Ordem de lançamento (junto com os outros documentos)

1. [`WEB_LAUNCH.md`](WEB_LAUNCH.md) seções 2 e 3: projetos Supabase separados (dev e produção), **confirmação de e-mail LIGADA**, backups, URLs de autenticação, e os textos legais de Privacidade e Termos publicados.
2. [`PASS_SALES.md`](PASS_SALES.md): migration `0003`, funções de pagamento, Stripe em modo de teste, depois live. O ranking só aceita quem tem o Passe **no servidor**; sem isso ninguém é elegível.
3. Migrations `0004` e `0005` no projeto de dev; plano de testes SQL; depois em produção.
4. Função `submit-progress` no dev, com JWT ligado e `APP_ORIGIN`.
5. Preview na Vercel com `VITE_SEASON_RANKING_ENABLED=true` e contas de teste: confira que aparecem linhas em `progress_snapshots`, que um save editado vira `rejected`/`flagged`, que uma conta sem Passe recebe `no_pass`, que uma sem e-mail confirmado recebe `email_unconfirmed`, e que o ranking mostra só posição, nome e números.
6. Rodar `npm run season:bounds` e `npm run sim:long` de novo se o equilíbrio mudou desde esta entrega (as tabelas de ritmo vieram das simulações de `docs/BALANCE_BASELINE.md`).
7. **Publicar o regulamento** (seção 7) antes de abrir; só então `update public.seasons set status = 'open'` e a bandeira em Production.
8. Durante a temporada: olhar de vez em quando quantos `flagged` e `rejected` aparecem (consulta da seção 5, sem o `limit`). Muitos rejeitados de gente honesta significam limites apertados demais; ajuste `bounds.ts` e reimplante a função.
9. Congelar, auditar (seção 5), fechar, pagar.

## 7. Textos legais que você precisa escrever (responsabilidade sua; o código não os substitui)

Não há texto jurídico neste repositório. Antes de abrir com prêmio em dinheiro, consulte um advogado do seu país (concursos e promoções com prêmio costumam ter regras e, às vezes, autorização). O mínimo do **regulamento da temporada**:

- [ ] **Quem pode participar:** só donos do Passe do Aventureiro, com e-mail confirmado; idade mínima; países permitidos; quem fica de fora (por exemplo, quem trabalha no jogo).
- [ ] **Datas:** início, `freeze_at` (congelamento), fim e prazo da auditoria e do pagamento.
- [ ] **Prêmio:** valor **fixo** e como é pago (e que **não** é uma parte da receita do Passe nem varia com as vendas); o que acontece se não houver vencedor elegível; moeda, impostos e quem os paga.
- [ ] **Como se ganha:** a pontuação (nível com Paragon, depois andar e profundeza) e o desempate pelo horário do servidor.
- [ ] **Auditoria e desclassificação:** que a classificação é provisória até a conferência manual; que você pode pedir prova simples de que a pessoa jogou, recusar progresso que o servidor marcou ou que pareça impossível, desclassificar por trapaça, edição do save, bots, contas compartilhadas, várias contas, exploração de falhas; que a sua decisão é final nos limites da lei; como contestar.
- [ ] **Dados:** que o jogo envia métricas do progresso para o servidor (lista curta), por quanto tempo ficam guardadas, e que os **dados de pagamento só são coletados dos vencedores**, depois da auditoria, só para pagar (e por quanto tempo ficam).
- [ ] **Passe e reembolso:** que o ranking exige o Passe ativo; o que acontece com a posição se o Passe for reembolsado ou revogado durante a temporada.
- [ ] **Encerramento ou alteração:** que você pode cancelar, adiar ou corrigir a temporada por falha técnica ou fraude generalizada.
- [ ] Política de Privacidade e Termos de Uso atualizados com o ranking, e a página `/season-rules/` do portal preenchida (hoje é só espaço reservado, `portal/README.md`).

## 8. Meta de Passes, pré-temporada, página "Temporada" do site e rankings por profissão (migration `0006`)

Esta seção vale para o que a migration `supabase/migrations/0006_portal_meter_and_profession_ranking.sql` acrescenta. Ela **não foi aplicada** por quem a escreveu: você aplica, depois da `0005`.

### 8.1 Dois tipos de "temporada" (não misture os nomes)

| Nome | O que é | Onde vive | Datas |
| --- | --- | --- | --- |
| **Temporada da Trilha do Passe** | A trilha de recompensas e os itens sazonais do Passe | `src/game/seasons.ts` (não mudou) | Calendário fixo de 60 dias a partir de 2026-10-01 |
| **Temporada valendo** (ranking com prêmio) | O ranking de que este documento trata | tabela `public.seasons`, `kind = 'ranked'` | Nenhuma até abrir: **abre sozinha quando a meta de Passes pagos é atingida** |
| **Pré-temporada** | Ranking sem prêmio que roda até a temporada valendo abrir | `public.seasons`, número 0, `kind = 'pre'` | Aberta desde que a migration `0006` é aplicada |

No jogo e no site a temporada valendo aparece como "Temporada valendo" e a pré-temporada como "Pré-temporada · sem prêmio"; a Trilha do Passe continua se chamando "Trilha". A `0006` **tira as datas** das temporadas `upcoming` que a `0005` cadastrou com base no calendário (agora elas esperam a meta) e não toca em `src/game/seasons.ts`.

### 8.2 Como a meta abre a temporada valendo

- A meta mora **no banco**, numa tabela privada de uma linha: `arena_private.season_goal (target = 15000, season_number = 1, opened_at)`. Só a service role (ou você, no SQL Editor) lê e altera; o público não a vê, só o `pass_meter()` mostra o número `target`.
- "Passe pago" = linha em `entitlements` com `kind = 'adventurer_pass'`, `status = 'active'` e `source` `stripe` ou `mercadopago`. **Concessões manuais (`grant`), reembolsados e revogados não contam.**
- Quando a contagem chega ao `target`, a temporada `season_number` (precisa estar `upcoming`) passa a `open` com `starts_at` = agora do servidor, `ends_at` = +60 dias e `freeze_at` = +58 dias; a pré-temporada passa a `closed` (a classificação dela fica guardada, congelada) e a temporada valendo **começa do zero para todos**. Isso acontece **uma única vez**: `opened_at` é gravado e nunca mais se tenta. Uma temporada já fechada nunca reabre sozinha.
- Mecanismo (o mais simples que é robusto): um trigger `AFTER INSERT/UPDATE OF status` em `entitlements` chama `arena_private.try_open_paid_season()`, que **trava a linha da meta antes de contar**. Duas compras simultâneas se enfileiram nessa trava, então a segunda sempre enxerga a primeira e a compra nº 15.000 não se perde. A chamada está dentro de um bloco de exceção: se algo der errado, vira só um aviso no log e **nunca** desfaz nem bloqueia um pagamento. O código do webhook não foi alterado.

### 8.3 Controles do dono (SQL Editor)

```sql
-- mudar a meta
update arena_private.season_goal set target = 12000;
-- abrir a temporada valendo agora, sem esperar a meta (mesmo efeito: 60 dias, pré-temporada fechada)
select arena_private.open_paid_season(1);
-- encerrar / congelar / pagar: igual à seção 4 (update public.seasons set status = ... where number = 1)
-- texto do prêmio (livre; nunca uma fração das vendas)
update public.seasons set prize_note = '<texto que você decidiu>' where number = 1;
-- preparar o próximo ciclo: a temporada 2 espera sem datas; aponte a meta para ela e libere o disparo
update arena_private.season_goal set season_number = 2, opened_at = null;
-- reabrir a pré-temporada (só se quiser)
update public.seasons set status = 'open' where number = 0;
```

Atenção: depois de `season_goal.opened_at` preenchido a meta não dispara mais; para um novo ciclo use o `update ... opened_at = null` acima (e a contagem de Passes pagos já estará acima do alvo, então ajuste também o `target` se não quiser que abra de imediato).

### 8.4 Rankings por profissão

Profissões com nível no jogo: **Mineração, Lenhador e Horta** (Ofícios/Forja não têm nível). A pontuação de cada uma é o **XP total da profissão** lido do save pelo servidor; empate: quem chegou àquele XP primeiro (hora do servidor). O nível mostrado é calculado pelo servidor com as mesmas curvas do jogo (`tables.ts`, gerado por `npm run season:tables`).

- Tabela privada `season_profession_entries` e visão pública `season_profession_leaderboard` (temporada, profissão, posição, nome, nível, XP). Só aparecem jogadores **sem sinalização e não desclassificados**; nada de id nem e-mail.
- Entram pelo mesmo caminho do ranking geral e nas mesmas condições: temporada aberta antes do congelamento, Passe no servidor, e-mail confirmado, veredito `ok`. Se a `0006` não estiver aplicada, a função apenas registra o erro e o ranking geral segue normal.
- Novos limites de plausibilidade (`bounds.ts`, recalculados dos tunables por `npm run season:bounds`; sinaliza no valor e rejeita em 2×; códigos `MINING_XP_RATE`, `WOODCUTTING_XP_RATE`, `GARDENING_XP_RATE`, e as versões `_TOTAL`):
  - **Mineração e Lenhador:** potência (5 + 0,75 por nível, nível 75 no máximo) × 1 unidade por potência por hora × 1,82 (Passe 1,1 × maestria 1,08 × Coletor, Poção do Coletor e Tônico do Prospector somados 1,53) × 1 XP por unidade ≈ 111 XP/h no teto. Uma coleta pendente pode chegar atrasada: até 8 h (limite do Passe) de produção a mais, uma vez.
  - **Horta:** parcelas abertas (4, +1 no nível 20 e +1 no 40) × 5 XP por hora de crescimento × 2,24 (Fertilizante corta metade do tempo, perks de velocidade 10%) ≈ 67 XP/h no teto; mais uma colheita atrasada por parcela (até 80 XP, a planta de 16 h).
  - Em um histórico antigo sem XP de profissão não há linha de base: nada é julgado contra zero. O primeiro snapshot de uma conta nova só é sinalizado (`BASELINE_AHEAD_OF_ACCOUNT_AGE`), nunca rejeitado.

### 8.5 O que o público (anon) pode ler

Somente: a função `public.pass_meter()` (devolve `sold`, `target`, `season_open`, `starts_at`, `ends_at`, `updated_at`; sem ids, valores, e-mails nem origem), as visões `season_leaderboard` e `season_profession_leaderboard`, e a tabela `seasons` (já era pública na `0005`). Tudo o mais continua sem acesso. Plano de testes SQL: fim de `0006`.

### 8.6 O que o site mostra

A página **Temporada** do portal (`/pt/season/`, `/en/season/`, no menu): (1) a barra de Passes adquiridos com a meta que o servidor informa; (2) "Comprar o Passe", que leva ao jogo (`<config.playUrl>/?comprar=passe`); (3) o ranking geral (top 50); (4) um ranking por profissão. Antes da meta o rótulo diz "Quando chegarmos a 15.000 Passes, a temporada valendo começa." (o número vem do servidor); depois que a temporada abre, a área da barra passa a mostrar as datas e a contagem regressiva para o fim. O site **não promete nada** pelo número de Passes e nunca liga a contagem ao prêmio (o prêmio é um valor fixo definido por você em `prize_note`, mostrado junto ao ranking só quando preenchido).
