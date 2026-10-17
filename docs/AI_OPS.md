# IA e operação: vigia automático e auditor de IA

AVISO: **nada disto foi aplicado, implantado ou executado contra um serviço real por este trabalho.** A migration `0021_ai_ops.sql` não foi aplicada, nenhuma Edge Function foi publicada, nenhum agendamento foi criado, nenhuma chave foi lida ou escrita e a API da Anthropic nunca foi chamada (os testes usam um modelo falso). Tudo abaixo vale depois que **você** faz os passos da seção 5. Valores de segredos ficam só nos painéis; aqui há apenas nomes.

Pedido que originou isto: *“colocar uma IA para verificar algumas mudanças; se precisar de API a gente conversa; se o servidor cair, deixar um agente no comando”*. A resposta é: **uma IA que aconselha e um vigia que só consegue pausar.**

## 1. Em uma frase

Um **vigia** (sem IA no caminho crítico) confere de 5 em 5 minutos se o jogo está de pé e, se um caminho crítico quebrar, **liga** uma pausa reversível e avisa você no Discord. Um **auditor** (com IA) lê a cada hora e uma vez por dia um resumo compacto do jogo, escreve relatórios em português sobre trapaça e abuso e te avisa só quando é grave. **Quem decide, bane, reembolsa e desliga pausas é sempre você.**

## 2. O que é automático e o que é só conselho

| O que | Quem faz | Automático? |
| --- | --- | --- |
| Conferir banco, funções-chave, taxa de erro das funções, nó da Solana, fila de eventos do Stripe | Vigia (`ops-watchdog`), a cada 5 min | Sim |
| **Ligar** `market_paused`, `pass_sales_paused`, `season_scoring_paused` ou `maintenance_mode` | Vigia, pela tabela de decisão da seção 3 | **Sim, só ligar** |
| **Desligar** qualquer interruptor | **Só você**, no painel (“IA e operação”), com motivo | Nunca automático |
| Abrir incidente e mandar alerta (um por incidente, lembrete a cada 30 min, um aviso de “resolvido”) | Vigia | Sim |
| Parágrafo em português com a causa provável de um incidente novo | IA rápida, dentro do alerta | Conselho |
| Resumo diário + relatórios de anomalia (anti-trapaça, saltos de nível, picos de Lendários, preços fora do normal, vai e volta no mercado, indicações suspeitas, reembolsos, erros) | Auditor (`ai-auditor`), a cada hora e uma vez por dia | Conselho |
| Alerta no Discord de um relatório | Auditor, **só se a gravidade for alta ou crítica** e o mesmo achado ainda não foi avisado em 24 h | Sim |
| Banir, reembolsar, editar save, mexer em dinheiro, certificados ou carteira | **Ninguém no código.** O código nem tem um caminho para isso | Nunca |

A IA **não tem como** mudar um interruptor: o auditor só escreve relatórios; a função de banco que o vigia usa (`ops_pause`) só sabe ligar; a única função que desliga (`admin_set_ops_flag`) exige uma sessão de administrador.

## 3. Os quatro interruptores

Ficam em `arena_private.ops_flags` (tudo desligado por padrão). O jogo, o portal e as funções leem pelo `ops_status()` (quatro verdadeiro/falso e uma data; público de propósito, para a faixa de manutenção aparecer antes do login). **Se não conseguirem ler, nada é pausado** (falha aberta: uma leitura quebrada nunca derruba o jogo sozinha; a última resposta boa vale por 5 minutos).

| Interruptor | O que faz quando ligado | O que continua funcionando |
| --- | --- | --- |
| `maintenance_mode` | Faixa de manutenção no topo do jogo (login incluso). Não bloqueia nada sozinha. | Tudo |
| `market_paused` | `market-list` (anunciar), `market-buy` (reservar, preparar, enviar pagamento) respondem 503 “pausado”. O jogo mostra um aviso na tela do mercado. | Cancelar anúncio ou reserva, ver status e histórico (`market-my`), ligar carteira |
| `season_scoring_paused` | `submit-progress` continua julgando e guardando o snapshot (a trilha de auditoria segue), mas **não entrega nada ao ranking** (resposta `season: "paused"`). | Todo o resto do jogo |
| `pass_sales_paused` | `create-checkout` (cartão) e `pass-crypto` (`start`, `prepare`, `submit`) respondem 503. O botão de compra do Passe fica desabilitado com um aviso. | **O webhook do Stripe nunca é pausado** (dinheiro já recebido tem que ser registrado), reembolsos, o preço do Passe em USDC |

### Tabela de decisão do vigia (só liga; nunca desliga)

| Falha observada | Rodadas seguidas | Liga |
| --- | --- | --- |
| Funções do mercado com 8+ erros 5xx em 10 min | 2 | `market_paused` |
| Nó da Solana não responde (`getHealth`) | 3 | `market_paused` |
| `create-checkout`, `stripe-webhook` ou `pass-crypto` com 5+ erros em 10 min | 2 | `pass_sales_paused` |
| 3+ eventos do Stripe parados há mais de 10 min (ou erros de evento) | 2 | `pass_sales_paused` |
| `submit-progress` com 15+ erros em 10 min, **com uma Liga aberta** | 2 | `season_scoring_paused` |
| Funções-chave do banco (`ops_status`, `league_reset_at`) lentas ou falhando, **com Liga aberta** | 3 | `season_scoring_paused` |
| Banco lento (> 3 s) ou sem resposta, **com Liga aberta** | 2 | `season_scoring_paused` |
| Banco fora há **3+ minutos** | (tempo) | `maintenance_mode` + `market_paused` + `pass_sales_paused` + `season_scoring_paused` (se houver Liga aberta) |

As respostas de pausa (503 com o cabeçalho `x-ops-paused`) **não contam como erro** para o vigia: senão uma pausa manteria o próprio incidente aberto e religaria a área logo depois de você desligar. Uma falha isolada (“um piscar”) nunca liga nada. Cada incidente gera **um** alerta; se continuar aberto, um lembrete a cada 30 minutos; quando volta ao normal, uma mensagem de “resolvido”. **As pausas ficam ligadas** até você desligar.

### Se o banco cair por inteiro

O vigia roda no Supabase; se o banco está fora, ele não consegue gravar uma flag. Por isso há três camadas independentes:

1. **O jogo decide sozinho.** Ele pergunta `ops_status()` a cada 5 minutos (e a cada 45 s enquanto não houver resposta). Se o servidor não responde **mas o próprio site do jogo responde** por 3 minutos seguidos, o jogo mostra a faixa “Servidor sem resposta”. Se nem o site responde, é a internet do jogador: nenhuma faixa.
2. **Arquivo estático `public/status.json`** (servido pela Vercel, sem banco). Para forçar a faixa de manutenção mesmo com o banco fora, edite o arquivo para `{ "maintenance": true, "message": "Voltamos às 18h" }` e faça deploy do jogo. Volte para `"maintenance": false` depois. (Cabeçalho `no-store` já configurado em `vercel.json`.)
3. **Monitor externo** (seção 7): é ele que te avisa quando o Supabase inteiro está fora e o vigia também.

## 4. O auditor de IA

Fluxo de cada execução (`ai-auditor`): `ai_gather_aggregates` (números compactos) -> **verificações determinísticas** em TypeScript -> se **nada** foi achado, **a IA não é chamada** (custo zero; a diária grava só um “sem sinais”) -> se algo foi achado e o orçamento permite, a IA classifica e explica em **JSON estrito** -> a resposta é validada e passa por um **portão** -> o relatório é gravado -> alerta se for grave.

**O que vai para a API da Anthropic**: contagens, ids, **nomes de usuário** e prefixos de 8 caracteres de hash de IP (listas limitadas a 10 a 15 linhas). **Nunca**: e-mails, saves, endereços de carteira, assinaturas de transação, IPs. Nomes de usuário são dados pessoais possíveis: confira a política de privacidade do jogo.

**O que o portão faz com a resposta da IA** (`gate.ts`):

- um achado só vale se citar ids que existem nos sinais das verificações determinísticas; o resto é descartado;
- a gravidade do achado é limitada à do sinal citado (a IA pode **baixar**, nunca subir);
- a gravidade do relatório é a do achado mais grave, nunca o “resumo geral” que a IA declara;
- `pause_market` / `pause_scoring` só sobrevivem se o sinal for da área certa e pelo menos médio; `review_account` exige um jogador citado; senão vira `watch`;
- um sinal forte das verificações **alerta mesmo que a IA diga que está tudo bem**. A IA explica; ela não silencia.

**Segurança contra instrução escondida em nomes**: o prompt do sistema é constante (nenhum dado entra nele). Tudo que veio do banco vai em **um único bloco JSON delimitado**, com caracteres de controle removidos, textos limitados e `<`, `>`, `&` escapados, e o prompt diz que o bloco é dado, nunca instrução. Mesmo que um modelo obedecesse a um nome de usuário malicioso, o portão descarta o que não tem evidência, rebaixa sugestões sem base e o código não tem nenhum caminho para mudar um interruptor.

### Modelos usados e por quê

| Uso | Modelo (padrão) | Por quê | Ajustes |
| --- | --- | --- | --- |
| Checagem horária e parágrafo do incidente | `claude-haiku-5-5` ($0,10 / $0,50 por milhão de tokens) | Tarefa pequena e frequente: classificar poucos sinais. Esforço `low`. | `AI_AUDITOR_MODEL_FAST` |
| Revisão diária | `claude-opus-5-5` ($4 / $20 por milhão) | Uma vez por dia, vale o modelo mais capaz e mais barato da linha Opus. Esforço `medium`. Pede ao servidor o fallback de segurança (`fallbacks: "default"`); se a API rejeitar o parâmetro, tenta de novo sem ele. | `AI_AUDITOR_MODEL_DAILY` |

Preços e ids são da tabela de modelos usada na época (outubro de 2026): **confira a página de preços da Anthropic antes de contar com os valores**. O código usa o SDK oficial (`@anthropic-ai/sdk` 0.135.0, fixado no `deno.json` das funções e no `package.json`), saída estruturada por JSON schema (`output_config.format`), `max_tokens` como teto duro, sem pré-preenchimento e sem parâmetros de amostragem. Cache de prompt não é usado de propósito: o prompt do sistema (~700 tokens) é menor que o mínimo cacheável e as chamadas são espaçadas.

### Guardas de custo

| Guarda | Padrão | Segredo (opcional) |
| --- | --- | --- |
| Chamadas ao modelo por dia (UTC), todas as espécies somadas | 40 | `AI_AUDITOR_MAX_RUNS_PER_DAY` (1 a 200) |
| Custo estimado por mês (UTC); ao atingir, a IA para até o mês seguinte | US$ 30 | `AI_AUDITOR_MONTHLY_BUDGET_USD` (0,5 a 500) |
| Tokens de saída por chamada (cobre o raciocínio também) | 4.000 (horária), 8.000 (diária) | `AI_AUDITOR_MAX_OUTPUT_TOKENS_FAST` / `_DAILY` |
| Tamanho do bloco de dados enviado | 40.000 caracteres (~10 mil tokens); acima disso as agregações saem e ficam só os sinais | fixo |
| Nada achado | **Nenhuma chamada** | fixo |
| Sem `ANTHROPIC_API_KEY` | Nenhuma chamada; verificações e relatórios continuam | n/a |

Cada chamada grava `ai_runs` com tokens e **estimativa** de custo; o painel soma o mês e projeta o fim do mês. Quando um guarda barra a IA, o relatório ainda é gravado só com as verificações determinísticas, dizendo isso.

### Estimativa de custo mensal (ESTIMATIVA, não medida)

Contas com os preços acima. A IA só é chamada quando as verificações acham algo.

| Cenário | Horária (Haiku 5.5) | Diária (Opus 5.5) | Total/mês |
| --- | --- | --- | --- |
| Dias calmos (quase nada a explicar) | ~$0 | ~$0 | **menos de US$ 1** |
| Típico (alguns sinais por dia, ~4 mil tokens de entrada e ~1,2 mil de saída por chamada horária; ~6 mil e ~5 mil na diária) | ~$0,001 por chamada, até 24/dia: **~US$ 0,7** | ~$0,12 por dia: **~US$ 3,7** | **~US$ 4 a 5** |
| Pesado (sinais toda hora, blocos grandes, saída no teto) | ~$0,003 x 24: **~US$ 2** | ~$0,21 por dia: **~US$ 6** | **~US$ 8 a 10** |

Para 50 mil jogadores o custo **não cresce com o número de jogadores** (as listas são limitadas); o que cresce é a frequência com que as verificações disparam (os limiares são absolutos). Espere o lado de cima da faixa: **cerca de US$ 3 a 10 por mês**, com teto de segurança padrão de US$ 30. Mais o vigia: no máximo um parágrafo por incidente novo (centavos).

## 5. Passo a passo para ativar (tudo é seu, nesta ordem)

1. **Aplicar a migration no projeto de desenvolvimento primeiro**: `0021_ai_ops.sql` (SQL Editor ou `supabase db push`). Depende de 0001 a 0020. Rode o **SQL TEST PLAN** no fim do arquivo (itens A a J).
2. **Criar a chave da Anthropic** (passo seu; **nunca cole a chave no chat**): console da Anthropic -> Settings -> API keys -> Create key -> dê um nome (ex.: `arena-idle-ops`) -> copie **uma vez**. Em Settings -> Limits, defina um **limite de gasto mensal** igual ou menor que `AI_AUDITOR_MONTHLY_BUDGET_USD` (defesa em dobro). Confira em Settings -> Privacy a retenção de dados da organização.
3. **Criar o webhook do Discord**: no servidor, canal de alertas privado -> Editar canal -> Integrações -> Webhooks -> Novo webhook -> Copiar URL do webhook. Essa URL **é um segredo** (quem a tem posta no canal).
4. **Gerar o segredo do agendador**: `openssl rand -hex 32` (ou um gerador de senhas de 40+ caracteres). Ele é o `OPS_CRON_SECRET`.
5. **Cadastrar os segredos das funções** (valores só nos painéis ou no terminal; nomes abaixo):

   | Nome | Obrigatório? | Para quê |
   | --- | --- | --- |
   | `OPS_CRON_SECRET` | Sim | Autentica as chamadas do agendador (cabeçalho `x-ops-secret`). Sem ele as funções respondem 503. |
   | `ANTHROPIC_API_KEY` | Para usar a IA | Chave da API. Sem ela, só as verificações determinísticas rodam. |
   | `OPS_ALERT_WEBHOOK_URL` | Recomendado | Webhook compatível com Discord. Sem ele não há alertas (os relatórios e as pausas continuam). |
   | `AI_AUDITOR_MODEL_FAST` | Não | Padrão `claude-haiku-5-5`. |
   | `AI_AUDITOR_MODEL_DAILY` | Não | Padrão `claude-opus-5-5`. |
   | `AI_AUDITOR_MAX_RUNS_PER_DAY`, `AI_AUDITOR_MONTHLY_BUDGET_USD`, `AI_AUDITOR_MAX_OUTPUT_TOKENS_FAST`, `AI_AUDITOR_MAX_OUTPUT_TOKENS_DAILY` | Não | Guardas de custo (seção 4). |
   | `SOLANA_RPC_URL` | Já existe | O vigia também confere a saúde do nó (a URL, que pode ter chave, nunca é registrada nem devolvida). |
   | `OPS_ALERT_EMAIL_TO` | Reservado | Ainda sem uso: documentado para um alerta por e-mail futuro. |

6. **Publicar as funções** (sem JWT, porque quem chama é o agendador e a autenticação é o segredo):
   `supabase functions deploy ops-watchdog --no-verify-jwt` e `supabase functions deploy ai-auditor --no-verify-jwt`. Republique também `market-list`, `market-buy`, `market-my`, `market-wallet`, `pass-crypto`, `create-checkout`, `stripe-webhook` e `submit-progress` (agora leem as flags e contam erros 5xx). **Ordem:** aplique a migration **antes** de republicar essas funções (sem a migration elas funcionam, só não contam erros nem leem flags).
7. **Agendar** (seção 6).
8. **Testar uma vez à mão** (no SQL Editor, trocando `<ref>`): chame o vigia com `net.http_post` como no agendamento e olhe a página “IA e operação”. Depois chame o auditor com `{"mode":"daily"}`: sem sinais ele grava um relatório “Sem sinais nas últimas 24 horas”.
9. **Painel**: faça o deploy do `admin/` (nova página “IA e operação”). **Jogo**: faça o deploy do jogo para a faixa de manutenção e os avisos de pausa.
10. **Monitor externo** (seção 7).

## 6. Agendamento com pg_cron

pg_cron e pg_net são extensões que você liga em Database -> Extensions. Guarde o segredo no cofre **uma vez** e agende (o bloco completo, com os `<ref>`, está no fim da migration):

```sql
select vault.create_secret('<o OPS_CRON_SECRET>', 'ops_cron_secret');

select cron.schedule('ops-watchdog',      '*/5 * * * *', $$select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/ops-watchdog', headers := jsonb_build_object('content-type','application/json','x-ops-secret',(select decrypted_secret from vault.decrypted_secrets where name='ops_cron_secret')), body := '{}'::jsonb, timeout_milliseconds := 20000);$$);
select cron.schedule('ai-auditor-hourly', '7 * * * *',   $$select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/ai-auditor', headers := jsonb_build_object('content-type','application/json','x-ops-secret',(select decrypted_secret from vault.decrypted_secrets where name='ops_cron_secret')), body := '{"mode":"hourly"}'::jsonb, timeout_milliseconds := 60000);$$);
select cron.schedule('ai-auditor-daily',  '15 9 * * *',  $$select net.http_post(url := 'https://<ref>.supabase.co/functions/v1/ai-auditor', headers := jsonb_build_object('content-type','application/json','x-ops-secret',(select decrypted_secret from vault.decrypted_secrets where name='ops_cron_secret')), body := '{"mode":"daily"}'::jsonb, timeout_milliseconds := 120000);$$);
select cron.schedule('ops-prune',         '40 4 * * *',  $$select public.ops_prune(90);$$);
```

`15 9 * * *` é 09:15 UTC (06:15 em Brasília). O vigia a cada 5 minutos é o recomendado (a cada minuto também funciona, mas gasta mais chamadas sem ganho: as regras já esperam 2 a 3 rodadas seguidas). Para pausar tudo: `select cron.unschedule('ops-watchdog');` (e os outros).

## 7. Monitor externo de disponibilidade

URL pública de saúde (sem segredo, só `{"ok":true,"checkedAt":"..."}` ou 503, com cache de 15 s):

`https://<ref>.supabase.co/functions/v1/ops-watchdog` (método GET)

Cadastre num monitor gratuito (UptimeRobot, Better Stack, Freshping ou Cronitor; qualquer um que cheque uma URL a cada 1 a 5 minutos e avise por e-mail, push ou Discord). Configure para alertar quando a resposta **não for 200** ou não vier em 10 s. Cadastre também a URL do próprio jogo (`https://<seu-dominio>/status.json`). Esse monitor fica **fora do Supabase**, então avisa mesmo quando o vigia não consegue rodar.

## 8. Roteiro de incidente (o que cada interruptor faz e como limpar)

**Regra geral:** o vigia liga, você desliga. Antes de desligar, confirme que o problema passou; se não passou, o vigia liga de novo em poucos minutos. Painel -> “IA e operação” -> Desligar -> escreva o motivo (fica registrado com o seu nome).

| Você recebeu | Significa | O que olhar | Para limpar |
| --- | --- | --- | --- |
| “Funções do mercado devolvendo erros” + `market_paused` | `market-*` com muitos 5xx | Logs da função no Supabase; o nó da Solana (`SOLANA_RPC_URL`); cotação (`SOL_USD_PRICE_URL`) | Quando os logs estiverem limpos e o nó responder, desligue `market_paused`. Pagamentos que jogadores já mandaram e que não foram registrados: veja “reembolsos devidos” na página Mercado depois de reabrir. |
| “Nó da Solana não responde” + `market_paused` | `getHealth` falhando 3 vezes | Status do provedor de RPC; troque a URL se preciso | Desligue `market_paused` depois que o nó responder. |
| “Pagamentos do Passe” ou “Fila de eventos do Stripe” + `pass_sales_paused` | checkout/webhook com erro, ou eventos parados | Stripe -> Developers -> Webhooks (entregas falhando?); logs de `stripe-webhook`. **Nenhum pagamento é perdido:** o Stripe reenvia eventos por dias | Corrija, reenvie os eventos parados pelo Stripe, confira que `payment_events` ficou sem pendentes, desligue `pass_sales_paused`. |
| “Envio de progresso” ou “banco” + `season_scoring_paused` | `submit-progress` ou o banco degradados durante a Liga | Logs, desempenho do banco | Desligue `season_scoring_paused`. Os snapshots continuaram sendo guardados; o próximo envio de cada jogador (a cada 10 min) atualiza o ranking. |
| “Banco de dados” crítico + `maintenance_mode` e as outras | Banco fora por 3+ min | Status do Supabase; uso de disco/CPU | Quando o banco voltar, desligue as flags **uma a uma**, conferindo cada área. |
| Relatório da IA de gravidade alta (Discord) | Padrão suspeito (preço 20x, vai e volta, salto de nível, pico de Lendários) | Clique nas evidências do relatório (jogador, venda) e investigue na página Jogadores/Mercado/Liga | A IA só aconselha. Banir, reembolsar ou corrigir um save são decisões e ações **suas**, fora do código. Marque como lido quando tratar. |

Um relatório “pode ser falso positivo” por natureza: os limiares (`THRESHOLDS` em `supabase/functions/_shared/ops/prechecks.ts`) são pontos de partida **não calibrados com dados reais**. Nas primeiras semanas leia os relatórios de média gravidade, ajuste os limiares e as constantes do vigia (`WATCHDOG` em `watchdog.ts`).

## 9. Onde está cada coisa

| Peça | Arquivo |
| --- | --- |
| Migration (tabelas, flags, leituras do painel, agregados) | `supabase/migrations/0021_ai_ops.sql` (reversão e plano de teste no próprio arquivo) |
| Vigia | `supabase/functions/ops-watchdog/`, lógica em `_shared/ops/watchdog.ts` |
| Auditor | `supabase/functions/ai-auditor/`, lógica em `_shared/ops/auditor.ts`, `prechecks.ts`, `prompt.ts`, `schema.ts`, `gate.ts`, `budget.ts`, `alerts.ts` |
| Leitura das flags e contagem de erros nas funções | `_shared/ops/flags.ts`, `monitor.ts`, `wiring.ts` |
| Cliente da API da Anthropic (SDK oficial) | `_shared/ops/anthropicModel.ts` |
| Jogo | `src/lib/opsStatus.ts`, `src/components/OpsBanner.tsx`, `public/status.json` |
| Painel | `admin/src/pages/AiOps.tsx` |

## 10. O que foi e o que não foi verificado

Verificado por testes (nenhum contra serviço real):

- SQL de `0021` executado de verdade num Postgres em memória (PGlite) junto com 0001 a 0020: permissões, flags, incidentes únicos, agregados, relatórios, custo.
- Auditor com **modelo falso**: esquema estrito (JSON inválido e ação fora da lista rejeitados), portão, injeção em nomes de usuário, guardas de custo, de-duplicação de alertas.
- Vigia com banco falso: tabela de decisão, “nunca desliga”, limite de alertas, banco inacessível.
- O SDK oficial montando a requisição certa (com `fetch` falso, sem rede).
- Pausas em `market-list`, `market-buy`, `pass-crypto`, `create-checkout` e `submit-progress`, e a faixa/avisos do jogo.

**Não verificado** (precisa do seu ambiente): a migration no Supabase real; a resposta real da API (o formato exato de `output_config.format` e do parâmetro `fallbacks` seguiu a documentação, mas nunca foi chamado); que os modelos `claude-haiku-5-5` e `claude-opus-5-5` estejam liberados na sua organização; `pg_cron`/`pg_net`/`vault` no seu plano; o webhook do Discord; a aparência da faixa e do painel num navegador (não houve teste visual); se os limiares geram poucos falsos positivos com dados reais; o custo real (as contas da seção 4 são estimativas).

## 11. Reverter

Pare os agendamentos (`cron.unschedule(...)`), republique as funções antigas (ou deixe como estão: sem a migration elas falham aberto) e rode o bloco ROLLBACK no começo de `0021_ai_ops.sql`. Para desligar só a IA, remova o segredo `ANTHROPIC_API_KEY`: o vigia e as verificações continuam, sem custo.
