# Como rodar uma temporada com prêmio (ranking da Temporada)

AVISO: **nada disto foi aplicado em lugar nenhum por este trabalho.** Nenhuma migration foi aplicada, nenhuma função foi implantada, nenhum projeto Supabase, Stripe ou Vercel foi tocado, e o Deno e um Supabase de verdade nunca rodaram contra este código (só os testes do Vitest, com banco e rede simulados). Os valores de segredos ficam só nos painéis; aqui há apenas nomes. O ranking nasce **desligado**: com `VITE_SEASON_RANKING_ENABLED` ausente, a tela some e o jogo não envia nada.

O prêmio é um **valor fixo que você escolhe**. Ele nunca é descrito, no jogo, no portal ou nos textos legais, como parte da receita do Passe. O código não guarda nem inventa valor nenhum: o campo `seasons.prize_note` é um texto livre que só você escreve.

## 1. O que o sistema faz

- A conta só entra no ranking se: tem um **Passe ativo e real** no servidor (`arena_private.owns_ranking_pass`: linha `active` e `livemode = true`, ou uma concessão manual; nunca o campo do save, nunca uma compra do modo de teste do Stripe), tem o **e-mail confirmado**, a temporada está `open` e o relógio **do servidor** ainda não passou de `freeze_at`, e o snapshot recebeu o veredito `ok`. Na **temporada valendo** exige-se ainda que a conta **não tenha nenhum snapshot `flagged` ou `rejected` na história inteira** que você não tenha perdoado (seção 9). Reembolso ou chargeback tiram o jogador da lista na hora.
- O jogo (só na versão web, só com a bandeira ligada) envia o save para a função `submit-progress` no máximo a cada 10 minutos e logo depois de subir de nível ou matar um chefe. A função **extrai os números ela mesma** (nível com Paragon, XP, andar, profundeza, mortes, ouro ganho, chefes, tempo jogado, peças por raridade, únicas, conquistas) e guarda um snapshot **carimbado com o relógio do banco** na tabela `progress_snapshots` (só leitura para o próprio jogador, só a função escreve, nunca é editada).
- **Pontuação** (calculada só no servidor): `nível_total x 1.000.000 + (maior andar + maior profundeza)`, onde `nível_total` = nível do herói (até 100) + nível de Paragon. Ordem: maior nível (Paragon incluso), depois mais fundo. **Desempate:** vence quem chegou a essa pontuação **primeiro** no relógio do servidor (`tiebreak_at`, gravado só quando a pontuação sobe).
- **Congelamento:** depois de `freeze_at` nada muda, mesmo que você esqueça o `status` (a função confere a data e um trigger do banco recusa mudar pontuação fora da janela aberta).
- A lista pública (`season_leaderboard`) mostra só posição, nome de usuário, partes da pontuação e **quantidade** de avisos. Sem e-mail, sem id, sem os códigos.

## 2. O que a auditoria pega (e o que NÃO pega)

Cada snapshot novo é comparado com o **histórico do próprio servidor** da conta (primeiro snapshot aceito e o último), nunca com datas escritas no save. Todos os números ficam numa tabela só, `supabase/functions/_shared/progress/bounds.ts`, cada um com a fonte; `npm run season:bounds` imprime a tabela ao lado dos valores recalculados dos tunables, e um teste falha se o jogo ficar mais rápido do que a tabela admite. Se você mexer no equilíbrio, rode `npm run season:tables` (copia a curva de XP, os níveis das peças e as zonas para o servidor) e confira `season:bounds`.

Veredito: `ok` (conta para o ranking), `flagged` (fica guardado, **não conta**, entra na sua lista de auditoria) e `rejected` (impossível para o tempo decorrido). **Só um snapshot `ok` vira base** (primeiro/último snapshot de comparação e "pico" dos contadores): um `flagged` ou `rejected` nunca vira base nem sobe o pico, então reenviar 10 minutos depois o mesmo save inflado continua sendo julgado contra a última história limpa, e progresso honesto que só chegou cedo demais é aceito depois, quando passar tempo de servidor suficiente. Uma chamada dentro de 10 minutos da anterior não grava nada e devolve o último veredito (o limite é uma instrução SQL só, `progress_claim_slot`, então duas chamadas simultâneas gravam um snapshot só).

Um snapshot `ok` pode trazer **avisos suaves** `FAST_LEVEL_PACE`, `FAST_FLOOR_PACE`, `FAST_DEPTH_PACE` (e `_TOTAL`): o ritmo passou de **1,3x** a seed mais rápida mas não de 2x. Eles **não escondem o jogador e não tiram pontos**; servem só para a sua auditoria listar essas contas primeiro (seção 5). O limite de sinalização continua em 2x (`PACE_FLAG_FACTOR`), porque uma pessoa que abre o jogo mais vezes que o jogador simulado pode legitimamente ser mais rápida que ele.

| Código | Veredito | O que significa |
| --- | --- | --- |
| `LEVEL_PACE`, `LEVEL_PACE_TOTAL` | flag acima de 2x, rejeita acima de 3x | Nível subiu mais rápido que a seed mais rápida da simulação longa (entre snapshots / desde o primeiro). |
| `FLOOR_PACE`, `FLOOR_PACE_TOTAL`, `DEPTH_PACE`, `DEPTH_PACE_TOTAL` | idem | Andares ou profundezas rápidos demais. |
| `XP_RATE`, `XP_RATE_TOTAL` | flag acima do teórico, rejeita acima de 2x | Mais XP por hora de servidor do que o jogo permite mais uma única recompensa atrasada. Desde a Rodada 20 (a Liga) o herói ganha XP **só na Caça**: o teórico é a melhor zona aberta x profundidade 1,3 x bônus (Relíquia + Aprendiz Veloz) x 1,25 do Elixir do Conhecimento sempre ativo (25 000 XP/h no andar 100; antes 60 000 com os pedidos e a Masmorra), e a recompensa atrasada é a de 10 h de Caça da melhor zona (antes somava um pedido). |
| `KILLS_RATE`, `GOLD_RATE`, `DUNGEON_RUNS_RATE`, `DUNGEON_FLOORS_RATE`, `BOSSES_RATE`, `UNIQUES_RATE`, `ACHIEVEMENTS_RATE` (e `_TOTAL`) | idem | Contadores crescendo além do teto. |
| `SECONDS_PLAYED_EXCEEDS_CLOCK` (e `_TOTAL`) | rejeita | Tempo jogado maior que o tempo real (salto de relógio). |
| `FLOOR_ABOVE_LEVEL_CAP` | flag / rejeita | Andar alto demais para o nível já visto nas simulações. |
| `GEAR_BELOW_GATE` | rejeita | Peça **equipada** acima do nível do herói (ex.: tier 6 num herói nível 30), ou único que não pode existir no andar atingido. Peça acima do nível parada na mochila (comprada no mercado) não conta: o jogo e o `bind-item` já recusam vesti-la. |
| `DEPTH_WITHOUT_FLOOR_100` | rejeita | Profundeza sem ter passado do andar 100. |
| `PASS_FEATURES_WITHOUT_ENTITLEMENT` | rejeita | Recompensas premium ou vagas de Baú do Passe sem o Passe no servidor. |
| `PASS_FLAG_WITHOUT_ENTITLEMENT` | flag | O save diz que tem o Passe, o servidor diz que não. |
| `RESTORED_OLDER_SAVE`, `SAVE_REVISION_BACKWARDS` | flag | Um contador diminuiu ou a revisão voltou: a conta restaurou um save mais antigo (repetir sorteios é um truque conhecido). Os snapshots seguintes voltam a ser `ok`, mas a sinalização fica na história da conta e, na temporada valendo, a mantém fora até você perdoá-la. |
| `FAST_LEVEL_PACE`, `FAST_FLOOR_PACE`, `FAST_DEPTH_PACE` (e `_TOTAL`) | só aviso (veredito `ok`) | Ritmo entre 1,3x e 2x a seed mais rápida. Não esconde, não pontua menos; aparece primeiro na sua auditoria. |
| `BASELINE_AHEAD_OF_ACCOUNT_AGE` | flag | O **primeiro** snapshot já vem muito adiante da idade da conta (save local antigo importado, ou edição antes da primeira sincronização). A idade vem de `auth.users.created_at` (`arena_private.account_created_at`, só a service role lê), **nunca** de `characters.created_at`, que o dono da linha poderia editar (a `0007` também a torna imutável). Não dá para provar que é falso; fica na sua lista, e como só `ok` vira base, o jogador segue sinalizado até a conta envelhecer ou você perdoar (seção 9). |

Os avisos (`flags`) de cada conta ficam na linha do ranking (`R:` na frente = veio de um snapshot rejeitado) e a lista pública mostra só a contagem.

### O que isto NÃO protege (leia antes de definir o prêmio)

- **Trapaceiro paciente dentro dos limites.** Quem edita o save um pouco por vez, sempre abaixo de 2x a seed mais rápida, passa. Os limites foram feitos para tornar a trapaça cara e visível, não impossível.
- **Edição antes do primeiro snapshot.** O primeiro snapshot é a base; só dá para sinalizar se estiver longe demais da idade da conta. Quem importa um save local legítimo muito adiantado também cai nesse aviso.
- **Bots e automação.** Um bot que joga de verdade, 24 horas, dentro das regras, parece um jogador dedicado.
- **Contas compartilhadas, vendidas ou jogadas por terceiros.** O servidor não sabe quem está do outro lado.
- **Várias contas** (cada uma precisa do Passe, o que custa dinheiro e ajuda a desencorajar, mas não impede).
- **Um script que faz o save crescer sempre abaixo dos limites.** Sem jogo autoritativo no servidor (o servidor jogando, ou re-simulando) isso **não pode ser impedido**: o save continua sendo escrito pelo cliente. Os limites tornam a fraude lenta e visível, não impossível.
- O servidor **confere** que o save enviado é o mesmo de `characters.save_data` (seção 9), o que impede julgar um save e ranquear outro, mas não impede alguém de gravar um save editado *dentro dos limites* em `characters` e enviá-lo.

Por isso: **o primeiro prêmio deve ser modesto**, e **a auditoria manual do histórico completo de snapshots dos 10 primeiros colocados, antes de qualquer pagamento, é OBRIGATÓRIA** (seção 5), não um extra. O jogo e o regulamento devem dizer isso com todas as letras.

## 3. Aplicar e implantar (você faz, no projeto de DESENVOLVIMENTO primeiro)

0. **Revisão independente (migration `0007`, seção 9).** Depois de `0006`, aplique `0007_review_fixes.sql` e reimplante **as três funções** (`submit-progress`, `create-checkout`, `stripe-webhook`) e o jogo juntos: a função nova recusa (409 `save_not_synced`, tentável de novo) um save que não bate com o salvo, então o jogo antigo e a função nova não conversam bem. Rode o plano de testes SQL do fim da `0007` no projeto de desenvolvimento antes de produção.
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

**Obrigatório antes de qualquer pagamento:** para cada um dos **10 primeiros** colocados, leia o **histórico completo de snapshots** (consulta mais abaixo) e decida à mão. O ranking é só uma triagem; os limites do servidor não detectam um script que faz o save crescer sempre abaixo deles, e nada neste desenho detecta isso sem um servidor que jogue o jogo.

Top 20 com o que você precisa para decidir. Só entra quem tem Passe **ativo** (reembolso e chargeback saem daqui sozinhos), e contas com aviso `FAST_*` vêm **primeiro** (marcadas em `rapido`), seguidas das com sinalização aberta na história inteira:

```sql
select row_number() over (order by e.score desc, e.tiebreak_at asc) as pos,
       e.user_id, u.email, p.username,
       e.score / 1000000 as nivel_total,
       least(e.score % 1000000, 100) as andar,
       greatest(e.score % 1000000 - 100, 0) as profundeza,
       e.tiebreak_at, e.flags, e.best_snapshot_id,
       (select count(*) from public.progress_snapshots s where s.user_id = e.user_id) as snapshots,
       (select count(*) from public.progress_snapshots s where s.user_id = e.user_id and s.verdict = 'rejected') as rejeitados,
       (select count(*) from public.progress_snapshots s where s.user_id = e.user_id and s.verdict = 'flagged') as sinalizados,
       arena_private.has_open_flags(e.user_id) as sinalizacao_aberta,
       (select count(*) from public.progress_snapshots s where s.user_id = e.user_id and exists (select 1 from unnest(s.reasons) r where r like 'FAST\_%')) as rapido,
       (select ent.livemode from public.entitlements ent where ent.user_id = e.user_id and ent.kind = 'adventurer_pass' and ent.status = 'active' limit 1) as passe_real
from public.season_entries e
join auth.users u on u.id = e.user_id
left join public.profiles p on p.user_id = e.user_id
where e.season = 2 and e.disqualified = false and e.score > 0
  and exists (select 1 from public.entitlements ent where ent.user_id = e.user_id and ent.kind = 'adventurer_pass' and ent.status = 'active')
order by (select count(*) from public.progress_snapshots s where s.user_id = e.user_id and exists (select 1 from unnest(s.reasons) r where r like 'FAST\_%')) > 0 desc,
         arena_private.has_open_flags(e.user_id) desc,
         e.score desc, e.tiebreak_at asc
limit 20;
```

Todas as contas com sinalização **na vida inteira** (inclui as que ainda não tinham o Passe, ou estavam na pré-temporada: os snapshots são gravados para todo mundo), mais as perdoadas e o motivo:

```sql
select s.user_id, count(*) filter (where s.verdict = 'flagged') as sinalizados, count(*) filter (where s.verdict = 'rejected') as rejeitados,
       count(*) filter (where c.snapshot_id is not null) as perdoados, array_agg(distinct r) as codigos
from public.progress_snapshots s
left join public.progress_flag_clears c on c.snapshot_id = s.id
left join lateral unnest(s.reasons) r on true
where s.verdict <> 'ok'
group by s.user_id
order by 2 desc, 3 desc;
select * from public.progress_flag_clears order by cleared_at desc;   -- quem foi perdoado, quando e por quê
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

Perdoar um falso positivo (seção 9; exige uma nota de auditoria):

```sql
select public.progress_clear_flags('<uuid>', 'conferi o histórico: save local legítimo importado', false);
```

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

- A meta mora **no banco**, numa tabela privada de uma linha: `arena_private.season_goal (target = 1000 desde a migration `0030`, season_number = 1, opened_at)`. Só a service role (ou você, no SQL Editor) lê e altera; o público não a vê: desde a migration `0008`, nem `target` nem o número de Passes vendidos saem do servidor. O `pass_meter()` devolve só uma fração de progresso. **Para mudar a meta:** `update arena_private.season_goal set target = 1000;` no SQL Editor (1 a 10 000 000); a barra pública se ajusta e o número continua secreto.
- "Passe pago" = linha em `entitlements` com `kind = 'adventurer_pass'`, `status = 'active'`, `source` `stripe` ou `mercadopago` **e `livemode = true`** (migration `0007`). **Concessões manuais (`grant`), reembolsados, revogados e compras feitas com chaves de TESTE do Stripe nunca contam para a meta (1.000 Passes).**
- Quando a contagem chega ao `target`, a temporada `season_number` (precisa estar `upcoming`) passa a `open` com `starts_at` = agora do servidor, `ends_at` = +60 dias e `freeze_at` = +58 dias; a pré-temporada passa a `closed` (a classificação dela fica guardada, congelada) e a temporada valendo **começa do zero para todos**. Isso acontece **uma única vez**: `opened_at` é gravado e nunca mais se tenta. Uma temporada já fechada nunca reabre sozinha.
- Mecanismo (o mais simples que é robusto): um trigger `AFTER INSERT/UPDATE OF status` em `entitlements` chama `arena_private.try_open_paid_season()`, que **trava a linha da meta antes de contar**. Duas compras simultâneas se enfileiram nessa trava, então a segunda sempre enxerga a primeira e a compra que bate a meta não se perde. A chamada está dentro de um bloco de exceção: se algo der errado, vira só um aviso no log e **nunca** desfaz nem bloqueia um pagamento. O código do webhook não foi alterado.

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
  - **Rodada 21 (a Liga):** a pontuação é o XP total e ele **continua contando depois do nível 75** (o nível trava em 75, o XP não): dois jogadores no teto têm pontuações diferentes. A curva de Mineração / Lenhador acima do nível 60 e a da Horta acima do 45 ficaram íngremes (`BALANCE_CHANGES.md`, Rodada 21): o especialista mais rápido simulado tem 77 300 XP de Mineração / Lenhador (nível 72) e 30 440 de Horta (nível 70) no dia 60, e ninguém chega ao 75 em 60 dias nem no ritmo teórico. As taxas dos limites (acima) não mudaram de fórmula; `BOUNDS.professionSimDay60` guarda esses dois números e `seasonProgress.test.ts` prova que o teórico em 60 dias fica acima deles. `PROFESSION_XP_TO_LEVEL` foi regerada.
  - Em um histórico antigo sem XP de profissão não há linha de base: nada é julgado contra zero. O primeiro snapshot de uma conta nova só é sinalizado (`BASELINE_AHEAD_OF_ACCOUNT_AGE`), nunca rejeitado.

### 8.4b Limites do XP do herói depois da Rodada 20 (a Liga)

O herói passou a ganhar XP **só na Caça** (a Masmorra, os pedidos e a poção instantânea deixaram de pagar; ver `BALANCE_CHANGES.md`, Rodada 20), então os limites de XP do servidor foram refeitos só a partir dela. Tudo está em `supabase/functions/_shared/progress/bounds.ts`; `npm run season:bounds` recalcula os valores teóricos dos tunables e `npm run season:tables` regera `tables.ts` (a tabela `DUNGEON_RUN_XP` saiu). As margens não mudaram: bandeira no valor, rejeição em 2x (teóricos) ou 3x (ritmo), aviso suave `FAST_*` entre 1,3x e 2x.

| Número | Antes | Depois |
| --- | --- | --- |
| `xpPerHour` (andar 100) | 60 000 (Caça 19 773 + pedidos 5 391 + Masmorra 34 325) | **25 000** (13 000 da zona 4 x 1,3 da profundidade x 1,12 de bônus (Aprendiz Veloz; a Relíquia não dá mais XP) x 1,25 do Elixir do Conhecimento = 23 660; o servidor guarda 25 000 e o fator 1,902, que ainda conta 5% da Relíquia, de folga) |
| `huntXpFactor` | 1,521 | 1,902 |
| `xpPerHourAt(andar)` | zona x fator + pedidos + 20 corridas da Masmorra | zona x fator (andar 0: 3 300 XP/h; andar 100: 24 700) |
| `burstXp` (uma recompensa atrasada) | `burstXp(nível, andar)`: 10 h de Caça + um pedido | `burstXp(andar)`: 10 h de Caça da melhor zona (andar 0: 33 mil; andar 100: 247 mil XP) |
| `levelPace` (seed mais rápida) | 13 / 27 / 50 / 60 / 75 / 90 / 100 nos dias 1 / 3 / 9 / 23 / 45 / 76 / 104 | 24 / 28 / 44 / 51 / 60 / 68 / 75 / 79 / 88 / 100 nos dias 2 / 3 / 7 / 14 / 24 / 30 / 40 / 45 / 60 / 80 |
| `floorPace` | 25 no dia 3, 50 no 8,5, 90 no 62, 100 no 75 | 25 no dia 2, 50 no 9, 90 no 42, 100 no 53 |
| `floorCapByLevel` | nível 1: andar 6, 27: 30, 50: 66 | nível 1: andar 12, 24: 36, 50: 84 (a Masmorra não sobe o herói: no nível 1 já se chega ao andar 10) |

O nível mais rápido que a simulação viu no dia 60 é 90 (mediana do dono 87), o que o limite de ritmo (2x) deixa passar até o nível 100 no dia 60. As rodadas seguintes que mexerem no XP do herói refazem esta tabela com `npm run sim:long`.

**Rodada 22 (zonas com nível, sub-níveis da zona 4, eventos):** o XP da Caça da zona 4 caiu de 13 000 para 10 000 por hora e ganhou até +18% por sub-nível; as zonas 3 e 4 só abrem com o nível 40 e 60. Números novos (`npm run season:bounds` recalcula 21 476 XP/h teóricos, o servidor guarda 25 000): `huntXpFactor` **2,244** (era 1,902), `xpPerHourAt(andar, nível)` e `burstXp(andar, nível)` contam a melhor zona que o **andar e o nível** do snapshot novo abrem, `levelPace` 24:2 28:3 44:7 51:12 60:19 68:26 75:34 79:38 88:50 92:56 100:72 (a seed mais rápida de qualquer política do dono, comprador de conjunto incluído; o dono comum chega ao nível 60 por volta do dia 26), `floorPace` 100 no dia 39 (era 53), `floorCapByLevel` do nível 50 em diante é o último andar. O nível mais rápido que a simulação viu no dia 60 é **94,3** (comprador de um conjunto T4+ Lendário), a mediana do dono que não compra **84,9**, e ninguém chega ao 100. Os limites de XP ganham folga só nas horas de evento (seção 11).

### 8.5 O que o público (anon) pode ler

Somente: a função `public.pass_meter()` (desde a `0008` devolve só `progress` de 0 a 1, arredondado para baixo a 0,1%, mais `season_open`, `starts_at`, `ends_at`, `updated_at`; nem `sold` nem `target`, sem ids, valores, e-mails nem origem), as visões `season_leaderboard` e `season_profession_leaderboard`, e a tabela `seasons` (já era pública na `0005`). Tudo o mais continua sem acesso. Plano de testes SQL: fim de `0006`.

### 8.6 O que o site mostra

A página **Temporada** do portal (`/pt/season/`, `/en/season/`, no menu): (1) uma barra de progresso rumo à abertura da Liga, sem número algum (nem a meta, nem a quantidade de Passes, nem porcentagem); (2) "Comprar o Passe", que leva ao jogo (`<config.playUrl>/?comprar=passe`); (3) o ranking geral (top 50); (4) um ranking por profissão. Sob a barra há uma só linha, "Quando a barra encher, a Liga da Temporada começa." / "When the bar fills, the Season League begins."; com pouco progresso a barra tem uma largura mínima visível; se o servidor não responder a página diz "Barra de progresso indisponível agora". Depois que a temporada abre, a área da barra passa a mostrar as datas e a contagem regressiva para o fim. O site **não promete nada** pelo número de Passes e nunca liga a contagem ao prêmio (o prêmio é um valor fixo definido por você em `prize_note`, mostrado junto ao ranking só quando preenchido).

## 9. Correções da revisão independente (migration `0007_review_fixes.sql`)

Aplique a `0007` **depois da `0006`** (no projeto de desenvolvimento primeiro) e reimplante as funções. Ela **não foi aplicada nem executada** por quem a escreveu; os testes do repositório só leem o arquivo (`migration0007.test.ts`). O plano de testes SQL está no fim do arquivo.

- **Idade da conta.** A função `submit-progress` lê a idade de `auth.users.created_at` (`arena_private.account_created_at`, chamada por `public.progress_account_created_at`, só a service role). `characters.created_at` não é mais usada, passa a ser **imutável** (trigger; também carimbada pelo relógio do banco no insert) e o cliente perde o privilégio de escrevê-la (privilégios por coluna: só as colunas que o fluxo de salvar do jogo usa). Se a idade não puder ser lida, a conta é tratada como recém-criada (mais rígido), nunca como antiga.
- **Base só com `ok`; sinalização para a vida inteira.** Veja a seção 2. Eligibilidade e lista pública da **temporada valendo** exigem conta **sem snapshot `flagged`/`rejected` aberto** na história inteira (`arena_private.has_open_flags`), lida de `progress_snapshots`, que é gravada para todos, tendo Passe ou não e em qualquer estado da temporada. A pré-temporada mantém a regra antiga (mostra a quantidade de avisos). `season_apply_snapshot` responde `flagged_history` nesse caso.
- **Perdoar um falso positivo.** `select public.progress_clear_flags('<uuid>', '<nota de auditoria, 5+ letras>', false);` só a service role/você; grava uma linha por snapshot em `progress_flag_clears` (quem, quando, por quê; nada é apagado), esvazia `season_entries.flags` do jogador e devolve quantos foram perdoados. Com `true` no terceiro argumento ela também copia o último snapshot `flagged` como novo snapshot `ok` (`MANUAL_BASELINE`, carimbado agora), para os próximos serem julgados a partir dele. Use `true` só quando o estado dele estiver conferido.
- **O save enviado tem de ser o save guardado.** `submit-progress` lê `characters.revision` e `characters.save_data` numa leitura só e compara o hash canônico (chaves ordenadas) com o do corpo; diferente = **409 `save_not_synced`** (tentável de novo; nada é gravado, nada é sinalizado, o limite de 10 minutos não é gasto). O jogo agora salva primeiro e envia **exatamente o objeto que acabou de salvar com sucesso** (`src/game/syncedSave.ts`); se ainda não salvou nesta sessão, espera; se o servidor responde 409, tenta de novo em cerca de um minuto. **Corrida:** se o jogador salva de novo entre a leitura e a gravação, o snapshot registra a revisão lida junto do hash que foi conferido (consistente), e o envio seguinte já traz o save novo; se o corpo ficou para trás, é um 409 inofensivo. O que isto NÃO faz: não impede quem grava um save editado dentro dos limites; só garante que o servidor julga o que está guardado.
- **Limite atômico por jogador.** `public.progress_claim_slot` (`insert ... on conflict do update ... where`): de duas chamadas paralelas, exatamente uma ganha a vaga; a outra recebe o último veredito (ou 429 `busy`). Se a função falha depois de pegar a vaga, ela é devolvida (`progress_release_slot`).
- **Tamanho de `characters.save_data`.** Check de banco `characters_save_data_size_check`: `pg_column_size(save_data) <= 294912` (288 KiB, o mesmo `MAX_SAVE_UPLOAD_BYTES` do cliente; um teste confere os dois números). É uma barreira grosseira (o tamanho do jsonb guardado, possivelmente comprimido), criada `NOT VALID` para não varrer linhas existentes; um save real tem de 5 a 70 KB. Depois de conferir o maior save existente, rode o `VALIDATE` que está comentado no arquivo.
- **Reembolso/chargeback tiram o jogador da lista paga.** As visões `season_leaderboard`, `season_profession_leaderboard` e `season_my_entry` agora exigem um Passe **ativo** (`owns_ranking_pass`); a auditoria da seção 5 também. `revoked` (disputa aberta) e `refunded` saem na hora; uma disputa ganha (`charge.dispute.closed` com `status = won`) devolve o Passe e o jogador volta.
- **`livemode`.** `entitlements` e `payment_events` guardam o modo do Stripe. A migration copia o valor dos eventos já gravados (`payload.livemode`); linhas sem evento correspondente ficam `false` e, se algum desses for um pagamento real, ajuste à mão (comando no arquivo). Compras de teste continuam dando as vantagens do Passe no jogo, mas **não contam para a meta, para o medidor do site nem para o ranking**.

## 10. Reset da primeira Liga (migration `0009_first_league_reset.sql`)

**Decisão do dono (2026-10-15):** a pré-temporada é um teste aberto. Quando a **primeira** Liga paga abre, todo herói **online** recomeça do zero, uma vez. As Ligas seguintes **não** resetam. O jogo offline/desktop (sem Supabase) nunca é tocado. Esta migration **não foi aplicada** por quem a escreveu: aplique-a depois da `0008`, no projeto de desenvolvimento primeiro (o plano de testes SQL está no fim do arquivo).

### 10.1 O que dispara o reset (e como o jogo percebe)

- `arena_private.season_goal.reset_at` fica **nulo** até a primeira temporada `ranked` virar `open`. Um único trigger (`seasons_stamp_league_reset`, função `arena_private.stamp_league_reset()`) escreve esse valor, com `where reset_at is null`, e um segundo trigger (`season_goal_reset_once`) impede que ele seja mudado ou apagado depois (`LEAGUE_RESET_IS_SET_ONCE`). Como a abertura automática (barra de Passes cheia) e a manual terminam no mesmo `update public.seasons ... status = 'open'`, **os dois caminhos disparam o reset**, e uma segunda Liga não faz nada.
- **Abrir a Liga à mão = resetar todo mundo.** `select arena_private.open_paid_season(1);` (ou `update public.seasons set status = 'open' where number = 1;`) abre a temporada valendo, fecha a pré-temporada **e** carimba o reset no mesmo instante. Não há como abrir a Liga sem o reset. Para testar no projeto de desenvolvimento, use um projeto descartável: o valor não volta atrás.
- Se a Liga já estiver aberta quando você aplicar a `0009`, ninguém é resetado. Para resetar mesmo assim (uma vez): `update arena_private.season_goal set reset_at = now();`.
- O jogo lê o valor pela função pública `public.league_reset_at()` (anon e authenticated leem só o timestamp), no login e ao voltar para a aba (e a cada 5 minutos com a aba visível). O save carrega `league.epoch` = o valor do servidor do reset a que aquele herói pertence. `epoch` menor que `reset_at` (ou ausente) = herói de antes da Liga, trocado por um herói novo. Como o carimbo gravado é o **valor do servidor** (nunca o relógio do aparelho), recarregar, abrir duas abas ou ter o relógio errado não repete nem pula o reset. Sem rede e sem valor guardado, nada é tocado; com o valor guardado (ele nunca muda), o reset acontece igual.
- Duas abas: a segunda recarrega o save do servidor, vê que já é o herói novo e o adota; se as duas gravarem ao mesmo tempo, vale a regra de sempre (o servidor ganha; `SaveConflictError`).

### 10.2 O que some e o que fica

- **Some:** tudo o que está no save (nível, ouro, equipamento, materiais, andares, profissões, trilha do Passe, cosméticos, estatísticas). O herói antigo é copiado **uma vez** para este aparelho (`arena-pre-league-memory.<conta>.<reset>`, com um rótulo dizendo que é só lembrança) e **nada no jogo lê essa cópia**: ela nunca é oferecida nem reimportada. Importar um save de antes do reset é **recusado online** (mensagem "esse herói é de antes da Liga"); offline/desktop e antes da Liga abrir, importar funciona como sempre.
- **Fica:** a conta, o nome de usuário (`profiles`), o Passe (é um `entitlement` do servidor, aplicado ao herói novo) e o nome do herói.
- **Progresso e ranking no servidor:** `progress_snapshots` nunca é apagada (é só-acréscimo). A auditoria passa a tratar como histórico **só** os snapshots criados a partir de `reset_at`: linha de base, picos, o limite de 1 snapshot por 10 minutos e a idade da conta para o ritmo (`max(conta criada, reset_at)`) recomeçam ali. Um primeiro snapshot depois do reset que esteja à frente do que se alcança desde `reset_at` é **rejeitado** (`BASELINE_AHEAD_OF_ACCOUNT_AGE` vira nível reject), por exemplo um save nível 80 de antes do reset; um herói novo passa. As flags vitalícias (`has_open_flags`) também só contam a partir do reset: quem foi marcado no teste aberto começa limpo. A função recusa (409 `league_reset_pending`, nada gravado, nada marcado) o save que declara um `epoch` anterior ao reset: é o jogo antigo que ainda não trocou o herói.
- O ranking da pré-temporada (temporada 0) fica arquivado como já estava; a Liga nasce vazia.

### 10.3 Título "Pioneiro" (obrigado aos testadores)

Quem teve ao menos um snapshot **aceito** (`verdict = 'ok'`) antes de `reset_at` recebe o título cosmético "Pioneiro" (sem atributos, não negociável). A regra é lida do servidor por `public.my_pioneer()` (só `authenticated`, só a linha do próprio jogador, falso antes da Liga) e aplicada pelo jogo no momento do reset; se a pergunta falhar nessa hora, o reset segue e a pergunta se repete no próximo login (o save guarda `league.pioneerChecked`). É a opção mais simples e segura: nada é gravado no servidor, e o título é só um cosmético que o próprio jogador poderia editar de qualquer forma, sem efeito no jogo.

### 10.3.1 Kit Pioneiro (migration `0033_pioneer_kit.sql`, decisão do dono 2026-10-21)

Quem jogou a pré-temporada recebe, quando a Liga abre e o herói é resetado: o título Pioneiro, a **Moldura de Pioneiro** (CSS, `frame_pioneer`) e um **baú inicial** de **500 de Ouro** e **10 Poções Pequenas** (`small_hp`). **Quem qualifica:** a conta teve ao menos um snapshot **aceito** (`verdict = 'ok'`) **antes de `reset_at`** com **herói nível 10 ou mais** (`metrics.heroLevel`); o snapshot é escrito só pelo servidor após a auditoria, é só-acréscimo e não depende do save, que o jogador pode editar. Contas criadas depois do reset nunca qualificam. `public.my_pioneer()` usa a mesma regra (título e moldura); o baú entra no livro de créditos do servidor (`0028`) com `source = 'pioneer'` (`pioneer-gold`, `pioneer-potion`) por um trigger novo em `season_goal` na hora em que `reset_at` é carimbado, e o herói resetado o resgata pelo fluxo normal (`claim_server_credits`), então o auditor conta o crédito e não marca o jogador. Os valores moram em um só lugar no servidor (`arena_private.pioneer_kit()`) e são espelhados em `src/game/pioneerKit.ts` (teste confere os dois).

### 10.4 Avisos ao jogador

Enquanto a pré-temporada roda (o servidor devolve `reset_at` nulo), a aba da Temporada, a tela de boas-vindas e a tela de entrada mostram: "A pré-temporada é um teste aberto: quando a Liga começar, todos os heróis online recomeçam do zero. O Passe e o seu nome continuam." A página Temporada do site e o FAQ dizem o mesmo. No momento do reset o jogador vê uma tela única explicando o que aconteceu e que todos largaram juntos (com um agradecimento a mais para os Pioneiros).

### 10.5 Rollback e consequências

O rollback da `0009` (no cabeçalho do arquivo) remove as funções e os triggers, mas **não devolve os saves**: quem já foi resetado continua com o herói novo (a cópia local fica só no aparelho). Como `reset_at` é "uma vez só" de propósito, desligue o trigger `season_goal_reset_once` antes de limpar o valor. Depois de um rollback com o valor limpo, o jogo para de resetar (a função `league_reset_at()` some e o jogo trata a falta como "não sei": nada é tocado). Reimplante a Edge Function antiga junto: a nova depende de `league_reset_at()`.

### 10.6 O que ninguém verificou

Nada disto rodou contra um banco ou um Supabase de verdade: a SQL é lida por testes estáticos (`supabase/functions/_shared/__tests__/migration0009.test.ts`) e a lógica do jogo e da auditoria por testes com banco simulado. Rode o plano de testes SQL da `0009` e um ensaio completo (login com um herói antigo, abrir a Liga à mão, recarregar, duas abas) no projeto de desenvolvimento antes de produção.

## 11. Eventos da Liga (migration `0014_economy_events.sql`, Rodada 22)

Um calendário de eventos para os dias 25 a 60 da Liga, **no relógio do servidor**: cada evento é um número fixo de horas depois de `league_reset_at()` (o momento da seção 10). Um evento por vez, **um dia de descanso entre dois**, eventos de herói (XP de Caça) e de profissão (Mineração / Lenhador / Horta) se alternando, nunca o mesmo evento duas vezes seguidas, e a **Corrida Final** nos 5 últimos dias (56 a 60). O build offline / desktop não tem Liga e portanto não tem eventos. O texto, os números e a medição estão em [`BALANCE_CHANGES.md`](BALANCE_CHANGES.md) (Rodada 22, seção 5); aqui fica o que interessa ao ranking.

### 11.1 O calendário (a mesma tabela no jogo, no servidor e no SQL)

| # | Dias | Evento | Tipo | Horas |
| --: | --- | --- | --- | --: |
| 1 | 25-26 | Invasão de Monstros | herói | 48 |
| 2 | 28 | Febre da Mineração | profissão | 24 |
| 3 | 30-31 | Caçada ao Alvo | herói | 48 |
| 4 | 33-35 | Semana das Profissões (o jogador escolhe uma) | profissão | 72 |
| 5 | 37-38 | Corrida da Masmorra | herói | 36 |
| 6 | 40-41 | Festival dos Ofícios | profissão | 48 |
| 7 | 43 | Grande Entrega | herói | 24 |
| 8 | 45 | Febre da Mineração | profissão | 24 |
| 9 | 47 | Fenda Temporal | herói | 24 |
| 10 | 49-51 | Semana das Profissões | profissão | 72 |
| 11 | 53-54 | Invasão de Monstros | herói | 48 |
| 12 | 56-60 | Corrida Final | final | 120 |

A tabela mora em `src/game/leagueEvents.ts` (`LEAGUE_EVENT_SLOTS`); `npm run season:tables` copia para `supabase/functions/_shared/progress/tables.ts` (`EVENT_SLOTS`, usada pelos limites); a `0014` tem as mesmas 12 linhas num `values (...)`, e o teste `migration0014.test.ts` compara célula por célula as três.

### 11.2 O que o portal lê

`public.league_events()` (somente leitura, sem estado, `security definer`, legível por `anon` e `authenticated`) devolve uma linha por evento: `slot`, `event_id`, `kind` (`hero`, `profession`, `final`), `league_day_from`, `league_day_to`, `hours`, `starts_at`, `ends_at`. **Antes da Liga abrir** (`reset_at` nulo) `starts_at` e `ends_at` vêm nulos e os dias continuam lá: o jogo e o site mostram "na Liga, dias 25 a 26...". Não expõe nada de nenhum jogador. Rollback: `drop function if exists public.league_events();`. **Não foi aplicada nem rodada contra um banco**; o plano de testes SQL está no fim do arquivo.

### 11.3 O que a auditoria permite durante um evento

Os bônus são pequenos e **limitados**: os de XP de Caça dos eventos de herói somam no máximo **+15%** (`EVENT_XP_CAP`, aplicado por luta ganha), os de profissão no máximo **+25%** em cima do XP de profissão. O servidor alarga os limites **só nas horas do intervalo entre dois snapshots em que um evento do tipo rodava**:

| Limite | Fora de evento | Dentro de um evento |
| --- | --- | --- |
| `XP_RATE` / `XP_RATE_TOTAL` (XP do herói por hora) | taxa teórica x horas + 1 recompensa atrasada | taxa x (horas + 0,15 x horas de evento de herói ou final) + a recompensa atrasada x 1,15 |
| `MINING_XP_RATE`, `WOODCUTTING_XP_RATE`, `GARDENING_XP_RATE` | taxa teórica x horas + 1 colheita atrasada | taxa x (horas + 0,25 x horas de evento de profissão) + a colheita atrasada x 1,25 |
| ritmo (`LEVEL_PACE`, `FLOOR_PACE`) | tabela da seed mais rápida (agora incluindo o dono que comprou um conjunto) | a mesma tabela (a simulação dessa tabela já jogou os eventos) |

`EvalInput.leagueEpochMs` vem de `league_reset_at()`; sem Liga (`null`), sem folga nenhuma. Testes: `progress.test.ts` ("League events widen the XP bound only while one runs"), `leagueEvents.test.ts` ("the anti-cheat bound allows exactly what the events give").

### 11.4 O que o dono precisa decidir

- **A Semana das Profissões** pede uma escolha do jogador (painel "Eventos" da Home; a escolha é final para aquela semana e vive em `save.eventPick`). O servidor não a vê: o bônus é de +25% no XP da profissão, dentro do limite de +25% acima.
- Os buffs de XP de Caça que o jogador ganha (Corrida da Masmorra, Grande Entrega, Corrida Final) ficam no save (`save.eventBuffs`) e entram na sessão de Caça como as poções: só a partir do momento em que são ganhos, nunca para o tempo já caçado; o save não pode inventar mais que a regra (a leitura do save corta a duração e a porcentagem ao que a regra dá).
- Quem edita o save para ganhar o buff sem o evento só ganha o que o limite de +15% permite, e só dentro das horas em que um evento rodava.

## 12. Retenção de dados (migration `0019_retention.sql`, 2026-10-17)

`progress_snapshots` só cresce (cerca de 6 linhas por hora ativa, ~1,45 KB cada com índices): sem limpeza, 50 000 contas passam dos 8 GB do disco incluso em uns dois meses. A `0019` adiciona `public.retention_run()` (só service role, em lotes de 10 000 linhas, idempotente) que compacta a tabela **sem tocar no que a auditoria da seção 5 precisa**. Os bytes, o crescimento por mês, o agendamento no pg_cron e o disco esperado estão em `docs/backend-phase1.md`, seção "Retenção de dados". **Não foi aplicada nem rodada contra um banco.**

### 12.1 O que fica e por quanto tempo

| Fica inteiro | Até quando |
|---|---|
| Todo snapshot dentro de uma temporada valendo que **não está `paid`** (`open`, `frozen`, `closed`), dos participantes dela (quem tem linha em `season_entries` ou `season_profession_entries` daquela temporada) | até você marcar a temporada `paid` |
| Todo snapshot de veredito `flagged` ou `rejected` | para sempre (a função só apaga linhas `ok`) |
| Os snapshots `ok` de uma conta com flag aberto (um `flagged`/`rejected` que você não perdoou com `progress_clear_flags`) | 90 dias; perdoar o flag libera a conta para a compactação |
| O último `ok` de cada conta (a linha-base do próximo envio), o primeiro `ok` da conta e o primeiro `ok` depois do reset da Liga | para sempre |
| `ok` com notas (`FAST_*`, `MANUAL_BASELINE`) e o snapshot apontado por `best_snapshot_id` (a prova do melhor resultado) | para sempre |
| Qualquer snapshot com menos de 30 dias fora de temporada paga | 30 dias |

O que é compactado: dentro de uma temporada `paid` (imediatamente) ou com mais de 30 dias fora de temporada, ficam o **primeiro e o último** snapshot `ok` de cada conta por dia (UTC); com mais de 90 dias, por mês. O resto é apagado.

### 12.2 O que isso muda no seu fluxo

- **Marque a temporada como `paid` só depois de terminar a auditoria da seção 5 e pagar.** Antes disso a história inteira dos participantes é preservada; depois, vira um snapshot de abertura e um de fechamento por dia. Uma temporada que nunca é marcada `paid` guarda a história completa para sempre (é o lado seguro, mas cresce).
- A auditoria que você faz **durante** a temporada (seção 5) não é afetada. Uma investigação **depois** de `paid` enxerga o primeiro e o último estado de cada dia, as notas `FAST_*`, todos os flags e o melhor snapshot, mas não cada envio de 10 minutos.
- A pré-temporada (sem prêmio) compacta pela regra dos 30 dias; `update arena_private.retention_config set snapshot_pre_season_full = true;` guarda tudo nela enquanto estiver aberta.
- Quem não é participante de uma temporada nunca foi ranqueado nela: seus snapshots seguem a regra dos 30 dias mesmo dentro da janela. Quem compra o Passe no meio da temporada começa a ter a história completa guardada a partir da primeira entrada; os envios de antes dessa entrada podem já ter sido compactados. `update arena_private.retention_config set snapshot_participants_only = false;` guarda a temporada inteira de todo mundo (~4 GB por mês com 50 000 contas).
- Antes de rodar de verdade, faça `select public.retention_run(true);` (dry run) e exporte `progress_snapshots` se houver uma temporada em andamento: linhas apagadas não voltam.
