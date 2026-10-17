> **2026-10-11:** a moeda rara (`shards` no código e nos saves) agora se chama **Runas** (pt) / **Runes** (en) para o jogador; neste documento ela aparece como "Fragmento(s)" / "Shards", o nome antigo.
> **2026-10-16:** a moeda rara agora se chama **Éter** (pt) / **Aether** (en) para o jogador (antes Runas / Runes); o campo do save continua `shards`.

# Backend Phase 1 — conta + persistência

> Nota (2026-10-10): o token ONE foi removido do jogo (lançamento na Steam, sem Web3); as menções a ONE abaixo são históricas.

## Escopo desta fase

**Fase 1 = identidade + persistência.** O servidor (Supabase) agora ARMAZENA o `SaveData` do jogador,
mas ainda **não é autoridade** sobre Gold, Shards, ONE, gear, inventário, RNG ou timers — o cliente
continua calculando tudo e enviando o `SaveData` inteiro para persistência, exatamente como fazia com o
`localStorage`. Só o "onde fica salvo" mudou.

**Fase 2+ = autoridade econômica.** Endpoints dedicados para currencies/inventory/gear_instances,
validação server-side de RNG e timers, e transações atômicas ficam para depois — ver a auditoria técnica
completa (mapa de save, localStorage, RNG, timers, sistemas server-side vs client-side) já produzida
nesta mesma linha de trabalho.

Não trate esta fase como "pronto para dinheiro real". Um save ainda pode ser adulterado no cliente antes
de ser enviado ao servidor — o servidor apenas guarda o que o cliente mandar.

## Como configurar um projeto Supabase

1. Crie um projeto em https://supabase.com (ou use um self-hosted).
2. Em **Project Settings → API**, copie:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon` / `public` key → `VITE_SUPABASE_ANON_KEY`
3. **Nunca** copie a `service_role` key para nenhuma variável prefixada com `VITE_` — o Vite embute todo
   `VITE_*` no bundle do cliente. A `service_role` não tem uso nesta fase (nenhum código server-side
   próprio existe ainda).
4. Aplique a migration (`supabase/migrations/0001_phase1_characters.sql`) — via Supabase CLI
   (`supabase db push`) ou colando o SQL no SQL Editor do painel.
5. Em **Authentication → Providers**, confirme que Email/Password está habilitado (é o único método
   usado nesta fase — sem OAuth social, sem Magic Link ainda).

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

`.env.local` já está no `.gitignore` (`.env*` é ignorado, exceto `.env.example`). Nunca commite valores
reais.

**Sem essas variáveis**, o app continua funcionando normalmente em modo local-only (mesmo comportamento
de antes desta migração — sem tela de login, save fica só no `localStorage`). Isso é intencional: build e
desenvolvimento não podem depender de um projeto Supabase existir.

## Como rodar local

```bash
npm install
npm run dev
```

Se `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` não estiverem definidas, um aviso aparece no console do
navegador (dev only) e o jogo roda 100% local, sem tela de login.

## Arquitetura desta fase

```
localStorage (save legado, pré-fase-1)
        │
        ▼
GameShell (src/shell/GameShell.tsx)
  - não configurado           -> LocalSaveRepository (mesmo comportamento de antes)
  - configurado, sem sessão   -> AuthScreen (login/criar conta)
  - configurado, autenticado  -> resolve character:
        existe no servidor        -> carrega
        não existe + save local   -> LegacyImportPrompt (importar ou começar novo)
        não existe, sem save local-> cria personagem novo (defaultSave())
        ▼
App (src/App.tsx) — recebe { repository, initialSave, initialRevision } como props
        ▼
SaveRepository (src/game/saveRepository.ts)
  - LocalSaveRepository    -> localStorage (persistSave/loadSave, engine.ts)
  - SupabaseSaveRepository -> tabela `characters` (Supabase Postgres + RLS)
```

`normalizeSave()` (extraído de `loadSave()` em `src/game/engine.ts`) é o único ponto de
sanitização/migração de save — usado tanto para o save local quanto para o `save_data` vindo do
Supabase, para que os dois caminhos nunca divirjam.

## Tabela `characters`

Ver `supabase/migrations/0001_phase1_characters.sql`. Estrutura mínima proposital (não decompõe
currencies/inventory/gear em tabelas próprias ainda — isso é Fase 2):

```
characters (
  id uuid primary key,
  user_id uuid unique not null references auth.users,
  hero_name text,
  save_data jsonb not null,
  save_schema_version integer,
  revision integer,              -- concorrência otimista
  imported_from_legacy boolean,  -- true se veio de um save local pré-fase-1
  created_at timestamptz,
  updated_at timestamptz         -- mantido por trigger, não pelo cliente
)
```

`unique(user_id)` implementa "1 personagem por conta" nesta fase. É uma constraint isolada (não faz
parte da chave primária) justamente para poder ser removida sem redesenhar a tabela quando o jogo
suportar múltiplos personagens.

**RLS**: habilitado, com policies explícitas usando `auth.uid()` para SELECT/INSERT/UPDATE — um usuário
nunca pode ler ou escrever o personagem de outro. Não existe policy de DELETE nesta fase.

## Concorrência (multi-aba/multi-dispositivo)

Cada save carrega uma `revision`. Toda escrita no Supabase inclui `.eq('revision', expectedRevision)` —
se outra aba/dispositivo já salvou primeiro, a revision não bate, `UPDATE` não afeta nenhuma linha, e o
cliente recebe `SaveConflictError`. Nesse caso o app recarrega o estado atual do servidor (**servidor
sempre vence** — nenhuma sobrescrita silenciosa) e mostra um toast (`sync.conflict`).

## Autosave

> **2026-10-16:** o upload para o servidor é em **lote** (antes: debounce de ~800 ms a cada mudança). Ver "Carga estimada" abaixo.

A mudança do jogador é aplicada na hora no estado do jogo e **espelhada no aparelho** (`localStorage`, chave
`arena-rpg-pending-cloud-v1`, `src/game/pendingCloudSave.ts`). O upload para o Supabase é decidido por
`src/game/saveScheduler.ts`:

- **No máximo 1 upload a cada 45 s** enquanto houver mudança pendente (`CLOUD_SAVE_MIN_INTERVAL_MS`). A primeira
  mudança depois de um tempo parado sobe em ~0,8 s.
- **Na hora** (com intervalo mínimo de 5 s entre dois) para os momentos importantes
  (`src/game/saveImportance.ts`): subir de nível (inclusive paragon), matar boss, mudança do Passe, marca da Liga e
  eventos, peça ou bolsa com certificado do servidor que entra/sai, rolagem devida pelo servidor (claim de boss ou de
  material), entrega do mercado e reconciliação de materiais negociáveis, troca de herói.
- **Esperando o resultado** (`flushCloudSave()`) antes de qualquer coisa que precisa que o servidor tenha o save mais
  novo: o envio do ranking (`submit-progress` compara o hash com `characters.save_data`), a checagem da Liga (que adota
  o save do servidor) e o logout.
- **Ao sair da página**: `visibilitychange`→`hidden`, `pagehide` e `beforeunload` sobem o que estiver pendente com
  `fetch` `keepalive: true` (o navegador deixa a requisição terminar depois que a página some; só vale para corpo
  abaixo de ~60 KB, acima disso vai como requisição normal).
- **Falha**: a mudança continua pendente (nada é descartado) e a nova tentativa vem com espera crescente (5 s, 10 s,
  20 s ... até 2 min); o evento `online` zera a espera e tenta na hora.
- **Conflito de revisão**: igual a antes (o servidor vence, o app recarrega e mostra o toast `sync.conflict`).

Ao abrir o jogo, se o aparelho guardou mudanças que não chegaram ao servidor (aba fechada, celular sem bateria) **e** o
servidor ainda está na revisão em que elas foram feitas, o jogo continua do espelho do aparelho; se outra aba ou
aparelho salvou nesse meio-tempo, o servidor vence e o espelho é descartado (`GameShell.tsx`). O espelho tem chave própria
(nunca `arena-rpg-save-v1`) para o aviso de importar save legado não o confundir com um save local antigo. A versão
offline/desktop (`LocalSaveRepository`) continua gravando no `localStorage` em até 1 s, sem lote.

Constantes ajustáveis: `CLOUD_SAVE_MIN_INTERVAL_MS`, `CLOUD_SAVE_FIRST_DELAY_MS`, `CLOUD_SAVE_IMPORTANT_GAP_MS`,
`CLOUD_SAVE_BACKOFF_*` em `saveScheduler.ts`.

## Offline

Se `repository.save()` falhar por rede, a mudança permanece marcada como "suja" (não é descartada) e o
status exibido na barra superior vira `sync.offline`/`sync.error`. Ao reconectar (`window.online`), um
flush é tentado automaticamente (e, entre uma coisa e outra, o espelho do aparelho guarda o save mais novo). Nenhuma perda silenciosa: o pior caso é o jogador ver "alterações
pendentes" até a conexão voltar ou até fechar/recarregar a aba (nesse ponto, se ainda offline, a mudança
mais recente pode não ter sido persistida no servidor — isso é uma limitação conhecida da Fase 1, não
resolvida por um Service Worker/fila de sincronização, que ficaria para uma fase futura se necessário).

## Saves legados (importação)

Só aparece quando: autenticado, **sem** personagem no servidor, **com** save local em
`arena-rpg-save-v1`. Nunca acontece automaticamente, nunca acontece mais de uma vez (depois que o
personagem existe no servidor, o servidor sempre vence). Escolher "Importar" marca
`imported_from_legacy = true` na linha — hoje é apenas informativo, nenhuma lógica de economia lê essa
flag.

**Importante**: um save legado nunca foi validado por servidor. Ele é aceito para desenvolvimento/beta
nesta fase, mas isso **não é uma política definitiva** — antes de qualquer lançamento com valor real será
necessário decidir separadamente como (ou se) tratar saves legados.

## Limitações de segurança conhecidas desta fase

- O `SaveData` inteiro ainda é enviado pelo cliente sem nenhuma validação server-side de Gold/gear/RNG/
  timers — um cliente adulterado pode mandar qualquer coisa, e o servidor grava.
- RLS protege "de quem é a linha", não "o que está dentro dela".
- Sem rate limiting próprio nesta fase (além do que o Supabase Auth já aplica).
- Sem fila de sincronização offline — mudanças feitas totalmente offline por muito tempo podem ser
  perdidas se a aba fechar antes de reconectar.

Essas limitações são esperadas e documentadas — ver a auditoria técnica completa para o que precisa
mudar nas próximas fases (Fase 2: currencies + inventory + gear_instances server-authoritative).

## Próxima fase

Fase 2 — mover Gold/Shards/inventário/gear_instances para autoridade do servidor (endpoints dedicados,
transações atômicas, RNG/timers server-side).

## Limites do upload e o que o servidor deve validar depois (adicionado em 2026-10-13)

O cliente agora faz três coisas antes de gravar um save no Supabase (`src/game/saveUpload.ts`, usado por `SupabaseSaveRepository.create/save`):

- **Limite de tamanho:** recusa o upload se o JSON passar de `MAX_SAVE_UPLOAD_BYTES` (288 KiB), lançando `SaveTooLargeError` antes de qualquer requisição. O número vem de medir o maior save construível de propósito (herói nível 100 tier 6, mochila e baú cheios com 200 peças lendárias de 3 substats, todos os materiais em 99.999): cerca de 72 KB. Para comparação, um herói novo tem 4,7 KB e o save de fim de jogo das fixtures tem 6,3 KB. O limite é 4x o caso extremo.
- **Versão do esquema:** `schemaVersion` já faz parte do `SaveData` (hoje é a versão do esquema de gear instances, `GEAR_SCHEMA_VERSION`) e continua sendo copiado para a coluna `save_schema_version`.
- **Versão do app:** o blob enviado ganha `appVersion` (versão do `package.json` que escreveu o save). No carregamento, `fromUploadBlob` remove esse campo antes de `normalizeSave`, então ele nunca vira parte do estado do jogo.

Isto é só higiene do cliente: um cliente adulterado ignora tudo isso. O que o servidor deve impor quando houver autoridade (Fase 2 em diante), e que hoje NÃO existe:

1. **Mesmo limite de tamanho**, como `check (octet_length(save_data::text) <= 294912)` na tabela (ou na função/Edge Function que grava), com o mesmo valor de `MAX_SAVE_UPLOAD_BYTES`. Manter os dois números em sincronia.
2. **Versão:** rejeitar `save_schema_version` menor que o mínimo suportado ou maior que o conhecido pelo servidor, e registrar `appVersion` para auditoria (clientes antigos, bugs por versão).
3. **Revisão:** a escrita continua exigindo `revision = expected` (concorrência otimista) e o servidor deve incrementar a revisão ele mesmo (hoje o cliente manda `revision + 1`), de preferência por função `security definer` em vez de `UPDATE` direto com RLS.
4. **Forma e plausibilidade** (fora do escopo desta fase): tipos dos campos, limites de moedas e de crescimento entre revisões consecutivas, auditoria de snapshot. Ver `docs/WEB_LAUNCH.md` para a ordem das etapas do lado do servidor.

## Carga estimada (adicionado em 2026-10-16)

> **Tudo nesta seção é ESTIMATIVA**, não medição de produção. Os números por jogador vêm de uma hora simulada de jogo
> ativo (`src/game/__tests__/netLoad.test.ts`: uma ação a cada 2 a 6 s, 11 momentos importantes, 3 idas a outra aba) e
> das constantes do código; os de total mensal vêm das suposições listadas abaixo e devem ser trocados pelos números
> reais assim que houver telemetria. Para medir de verdade, abra o jogo em DEV e use `window.__netStats.perMinute()`,
> `.perHour()` e `.total()` (conta cada requisição do cliente Supabase por tipo; não existe no build de produção).

### Chamadas por jogador ATIVO por hora (aba visível, logado, mercado ligado)

Aba oculta = 0 chamadas periódicas (só o upload de saída ao esconder a aba).

| Tipo | Antes | Depois | Observação |
|---|---:|---:|---|
| `save-upload` (PATCH `characters`) | ~1 190 | **~85** | teto de 80 do lote de 45 s + importantes; hora cheia simulada = 85 |
| `fn:submit-progress` | 6 | 6 a 9 | a cada 10 min (+0 a 10 %), mais eventos (nível/boss, no máx. 1 por minuto); só com o ranking ligado |
| `fn:material-sync` | 42 | 18 | reconciliação a cada 5 min (12) + passada do mercado (6) |
| `db:item_certificates` (GET) | 30 | 6 | passada do mercado: de 2 min para 10 min |
| `fn:market-my` | 30 | 6 | idem |
| `rpc:my_referral_status` | 4 | 2 | de 15 para 30 min |
| `rpc:league_reset_at` | 12 | 0 (12 até a Liga abrir) | o momento do reset é definido uma vez no servidor: depois de conhecido não se pergunta mais |
| `db:entitlements` (Passe) | ~1 | ~1 | só ao voltar à aba depois de 5 min |
| `fn:mint-item` / `bind-item` / `material-claim` | ~10 | ~10 | por ação (forja, único, claim): não mudou |
| `auth:token` | ~1 | ~1 | renovação do JWT |
| **Total** | **~1 330** | **~137** | **~10x menos**; funções Edge: ~88 → ~42 por hora |

O custo de entrar (uma vez por sessão): ~6 chamadas (perfil, Passe, Liga, `characters` GET, certificados, 1º upload).

Quem deixa a aba aberta sem mexer faz bem menos: sem ação o save não muda, então só sobe o contador de tempo jogado (1 a
cada 5 min) e as chamadas periódicas (~40 por hora, caindo a ~0 com a aba oculta).

### Fórmulas (mês de 30 dias)

Variáveis: `N` = contas registradas; `a` = fração delas que joga num dia (DAU/N); `h` = horas ativas por jogador ativo
por dia; `p` = fator de pico sobre a média de simultâneos (suposto 3); `U` = uploads de save por hora ativa (~85);
`E` = chamadas a funções Edge por hora ativa (~42); `W` = escritas no banco por hora ativa (~111).

```
horas ativas por mês        H = N · a · h · 30
simultâneos médios          C = N · a · h / 24
simultâneos no pico         Cp = p · C
invocações de função / mês  H · E
escritas no banco / mês     H · W        (W ≈ U + ~6 snapshots + ~10 mint/claim + ~10 materiais ≈ 111)
requisições / s no pico     Cp · 137 / 3600       (escritas / s: Cp · W / 3600)
```

Suposição dos exemplos: `a` = 20 %, `h` = 1,5 h, `p` = 3 (então `H` = 9 · N horas ativas por mês).

| Contas registradas | Horas ativas/mês | Simultâneos médio / pico | Invocações de função/mês | Escritas no banco/mês | Req/s no pico (total / escritas) |
|---:|---:|---:|---:|---:|---:|
| 5 000 | 45 mil | 62 / ~190 | ~1,9 M | ~5,0 M | ~7 / ~6 |
| 50 000 | 450 mil | 625 / ~1 900 | ~18,9 M | ~50 M | ~71 / ~58 |
| 100 000 | 900 mil | 1 250 / ~3 800 | ~37,8 M | ~100 M | ~143 / ~116 |

Para comparar: com os números de antes (~1 330 chamadas e ~88 de função por hora ativa), os 50 000 de cima seriam ~39,6 M de
invocações por mês e ~700 req/s no pico (contra ~71). Cada escrita de save continua levando o `SaveData` inteiro (5 a
70 KB de JSON): o próximo corte de carga é enviar só o que mudou (ou pular o upload quando o hash não mudou), o que pede o
servidor autoritativo da Fase 2.

### O que muda se a suposição mudar

- Os valores escalam linearmente com `a · h`: dobrar o tempo médio de jogo dobra tudo; o pico depende de `p` (lançamento,
  evento da Liga, fim de temporada podem passar de 3).
- Subir `CLOUD_SAVE_MIN_INTERVAL_MS` de 45 s para 90 s leva `U` de ~85 para ~45 (quem fecha a aba ainda sobe o que falta).
- Instâncias de função frias, limites de conexão do Postgres e o plano do Supabase são outra conta (não estimada aqui).

## Retenção de dados (adicionado em 2026-10-17)

> **ESTIMATIVA, não medição.** Nada disto rodou contra um banco de verdade: a migration `0019_retention.sql` **não foi aplicada** (só leitura por testes estáticos em `migration0019.test.ts`, mais o modelo `retentionModel.ts` da regra de compactação). Os bytes por linha vêm das colunas das migrations; o jsonb de `progress_snapshots.metrics` vem de um `ProgressMetrics` típico mais o `_peak` (cerca de 770 bytes de JSON, ~1,1 KB como jsonb). Os volumes por hora são **suposições** (listadas abaixo) para trocar pelos números reais: depois de duas semanas de beta, `select * from public.retention_disk_report();` dá os bytes reais de cada tabela.

### 1. Quanto cada tabela cresce

Bytes por linha **incluindo índices** (margem de erro de uns 30%):

| Tabela | Bytes/linha | Natureza | Política |
|---|---:|---|---|
| `progress_snapshots` | ~1 450 (linha ~1 270 + 4 índices ~175) | só acrescenta, ~6 por hora ativa | **compactada** (abaixo) |
| `item_certificates` | ~750 | uma por peça certificada | mantida |
| `item_certificate_events` | ~300 | um por mint/bind/venda/queima | mantida (auditoria) |
| `item_mint_requests` | ~450 | cache de repetição (idempotência) | mantida; opcional `request_cache_days` |
| `material_ledger` | ~250 | uma por mudança de saldo | mantida (auditoria) |
| `material_requests` | ~450 | cache de repetição (idempotência) | mantida; opcional `request_cache_days` |
| `market_events` / `market_sales` / `chain_payments` / `market_listings` | ~300 / ~600 / ~450 / ~350 | por anúncio ou venda | mantidas (financeiro) |
| `payment_events` / `checkout_attempts` | ~500 / ~400 | por compra do Passe | eventos mantidos; tentativas com mais de 30 dias apagadas |
| `market_wallet_nonces` / `market_reservations` | ~140 / ~450 | limite curto | linhas vencidas apagadas |
| `waitlist` / `waitlist_limits` | ~900 / ~110 | por cadastro | lista mantida; buckets de limite (hashes) com mais de 7 dias apagados |
| `arena_private.progress_rate` | ~90 | 1 por conta | linhas com mais de 1 dia apagadas |
| `characters` | 5 a 70 KB de JSON (o TOAST comprime) | 1 por conta, atualizada no lugar | mantida (cresce com as contas, não com o tempo) |

Suposições por **hora ativa** de um jogador (as mesmas contas de "Carga estimada": `a` = 20%, `h` = 1,5 h, então **9 horas ativas por conta registrada por mês**): 6 snapshots; 2 commits de item certificado (1 certificado + 1 evento + 1 pedido cada) e mais 1 evento de bind/queima; 2 claims de material (1,5 linha de ledger + 1 pedido cada); 0,3 KB de mercado. Cada **item certificado por hora ativa a mais** soma ~0,7 GB por mês com 50 000 contas.

Crescimento **por mês, sem retenção** (GB; 1 GB = 10^9 bytes):

| Contas registradas | Snapshots (linhas) | `progress_snapshots` | Itens (cert. + eventos + pedidos) | Materiais (ledger + pedidos) | Mercado | **Total/mês** |
|---:|---:|---:|---:|---:|---:|---:|
| 5 000 | 0,27 M | 0,39 | 0,15 | 0,07 | 0,01 | **0,63** |
| 50 000 | 2,7 M | 3,9 | 1,5 | 0,74 | 0,14 | **6,3** |
| 100 000 | 5,4 M | 7,8 | 3,0 | 1,5 | 0,27 | **12,6** |

Com 50 000 contas e **nenhuma retenção**, só os snapshots enchem o disco incluso (8 GB) em cerca de dois meses (11,7 GB em 3 meses, 47 GB em 12). O total das colunas acima para 12 meses é ~75 GB.

### 2. O que a retenção faz (`public.retention_run`)

Uma função `security definer`, **só para a service role** (o pg_cron roda como dono do banco). Cada chamada apaga **no máximo `batch_size` linhas (10 000) por tabela**, para não segurar lock; é idempotente (uma segunda chamada não apaga nada novo), tem lock consultivo (duas execuções sobrepostas: a segunda responde `busy`) e `lock_timeout` de 5 s. `retention_run(true)` só conta o que a próxima rodada apagaria. Devolve um jsonb com as linhas por tabela e `more` (o lote veio cheio: rode de novo; o cron faz isso).

Os números ficam em **uma linha** de `arena_private.retention_config` (edite no SQL Editor, sem reimplantar):

| Campo | Padrão | Significado |
|---|---:|---|
| `batch_size` | 10 000 | linhas apagadas por tabela por chamada |
| `snapshot_full_days` | 30 | snapshots mais novos que isso (fora de temporada paga) nunca são compactados |
| `snapshot_monthly_after_days` | 90 | mais velhos que isso o balde passa de dia para mês (`null` desliga) |
| `snapshot_flag_hold_days` | 90 | conta com flag aberto guarda os snapshots `ok` completos por tanto tempo |
| `snapshot_participants_only` | `true` | na temporada ainda não paga, só quem tem entrada nela guarda a história completa |
| `snapshot_pre_season_full` | `false` | `true` guarda tudo também na pré-temporada aberta |
| `waitlist_limit_days` / `checkout_attempt_days` / `nonce_days` / `reservation_days` / `progress_rate_days` | 7 / 30 / 2 / 30 / 1 | quanto tempo as linhas de limite/slot vencidas ficam |
| `request_cache_days` | `null` | `null` = caches de repetição mantidos para sempre; um número (mínimo 30; use 180 ou mais) apaga os mais velhos |

**`progress_snapshots`** (só linhas de veredito `ok` são apagadas; **`flagged` e `rejected` nunca**):

| Fica inteiro | Compactado |
|---|---|
| tudo dentro de uma temporada valendo que **ainda não está `paid`** (aberta, congelada, fechada), para os participantes dela | dentro de temporada `paid`, ou mais velho que `snapshot_full_days`: por (conta, dia UTC) ficam o **primeiro e o último** snapshot `ok`; o resto é apagado |
| qualquer snapshot mais novo que 30 dias fora de temporada paga | mais velho que 90 dias: o balde é o **mês** (primeiro e último do mês) |
| snapshots `ok` de conta com flag aberto, por 90 dias | |
| o **último** `ok` de cada conta (a linha-base do próximo envio), o **primeiro** `ok` da conta e o primeiro `ok` depois do reset da Liga (os baldes nunca misturam os dois lados do reset) | |
| qualquer `ok` com motivos (notas `FAST_*`, `MANUAL_BASELINE`) e o apontado por `best_snapshot_id` (chave estrangeira) | |

Fica fora da retenção, **mantido para sempre**: `item_certificates`, `item_certificate_events`, `material_ledger`, `material_balances`, `market_events`, `market_sales`, `chain_payments`, `payment_events`, `entitlements`, `season_entries`, `progress_flag_clears`. A função só **informa** o crescimento deles (`retention_disk_report()`).

Tabelas de vida curta (linhas vencidas apagadas): `arena_private.progress_rate`, `market_wallet_nonces`, `market_reservations` (só `expired`/`cancelled`, depois da tolerância de pagamento tardio, sem pagamento na chain; `paid`, `refund_due` e `refunded` ficam), `checkout_attempts`, `arena_private.waitlist_limits` (hashes de IP/subrede/e-mail dos limites, 7 dias).

Três decisões desta migration que você pode reverter com um `update` (a leitura literal do pedido seria as duas primeiras desfeitas):
1. `snapshot_participants_only = true`: quem não tem entrada na temporada nunca é ranqueado, então a auditoria não precisa da história dele; com `false` toda conta guarda a temporada inteira (~4 GB por mês com 50 000 contas).
2. `snapshot_monthly_after_days = 90`: depois de 90 dias o dia vira mês. Sem isso a tabela cresce ~0,9 GB por mês com 50 000 contas para sempre.
3. A pré-temporada (`kind = 'pre'`, sem prêmio) conta como "sem temporada": compacta pela regra dos 30 dias. `snapshot_pre_season_full = true` guarda tudo enquanto ela estiver aberta.

### 3. Disco esperado com 50 000 contas depois da retenção

Só `progress_snapshots` (30% das contas com Passe, o dono marca a temporada `paid` ~14 dias depois do fim; "pico" = logo antes de marcar `paid`):

| Idade da base | Sem retenção | Padrão (30 / 90): pico / depois do `paid` | Ajustado (7 / 30): pico / depois do `paid` |
|---:|---:|---:|---:|
| 3 meses | 11,7 GB | 7,0 / 5,7 GB | 4,3 / 1,9 GB |
| 12 meses | 47 GB | 8,3 / 7,0 GB | 5,6 / 3,2 GB |
| 24 meses | 94 GB | 10,0 / 8,7 GB | 7,3 / 4,9 GB |

Para 5 000 contas o mesmo cálculo dá 0,4 a 0,8 GB (padrão) e 100 000 dá o dobro do 50 000. **Com 50 000 contas use o ajuste** (`update arena_private.retention_config set snapshot_full_days = 7, snapshot_monthly_after_days = 30;`): a regra dos 30 dias foi pedida como padrão, mas a história completa dos últimos 30 dias de 50 000 contas já são ~3,9 GB. Suba para o ajuste antes de passar de uns 15 000 contas.

**Disco total em 12 meses com 50 000 contas (tudo somado, estimativa):** `progress_snapshots` 3 a 6 GB + ledgers e certificados mantidos ~2,4 GB por mês, ou **~28 GB** + `characters` 0,5 a 1 GB + autenticação do Supabase (~0,3 GB, fora do nosso controle) + waitlist e resto ~0,2 GB = **~32 a 36 GB**. Portanto **a retenção sozinha não cabe nos 8 GB incluídos com 50 000 contas**: ela corta os snapshots de ~47 GB para 3 a 6 GB por ano, mas os ledgers que o pedido manda manter passam a ser o maior crescimento. Alavancas, na ordem do que custa menos:
1. `request_cache_days = 180`: os caches de repetição são ~0,8 GB por mês (um terço dos ledgers) e, passado o prazo, deixam de ser necessários na prática (um pedido repetido depois de 6 meses não existe). Corta ~5 GB em 12 meses.
2. Medir antes de decidir: as suposições de itens e materiais por hora são as mais incertas. Duas semanas de beta com `retention_disk_report()` dizem se o número real é 3 vezes menor ou maior.
3. Arquivar e apagar os ledgers antigos (exportar linhas com mais de 12 meses para o Storage ou um arquivo e então apagar): não está nesta migration porque são registros de auditoria/financeiros e a decisão é sua.
4. Pagar disco: o excedente acima de 8 GB custa em torno de US$ 0,125 por GB por mês (confira o preço atual da Supabase): 30 GB a mais são uns US$ 3 por mês, bem menos que o trabalho de escrever o arquivamento.

### 4. Como agendar com pg_cron

O arquivo **não** cria o agendamento (pg_cron é uma extensão que você liga). Passo a passo, no projeto de desenvolvimento primeiro:

1. Aplique a `0019` e ligue a extensão: **Database → Extensions → pg_cron**.
2. Rode à mão e olhe: `select public.retention_run(true);` (não apaga nada) e depois `select public.retention_run();`. Repita enquanto a resposta trouxer `"more": true`.
3. Agende:
   ```sql
   select cron.schedule('retention-run', '*/10 * * * *', $$select public.retention_run();$$);
   select cron.schedule('retention-cron-log', '30 4 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days';$$);
   ```
   A cada 10 minutos são 10 000 linhas por tabela (~1,4 milhão de snapshots por dia): o atraso inicial some em um ou dois dias. Depois disso uma vez por noite basta: `select cron.schedule('retention-run', '15 4 * * *', $$select public.retention_run();$$);` (o mesmo nome troca o agendamento). A segunda tarefa evita que o próprio `cron.job_run_details` cresça.
4. Conferir: `select jobid, jobname, schedule, active from cron.job;` e `select * from cron.job_run_details order by start_time desc limit 20;`. Parar: `select cron.unschedule('retention-run');`.

**Apagar não encolhe o arquivo.** O Postgres reaproveita o espaço liberado nas próprias tabelas, então o disco para de crescer, mas o número do painel não cai sozinho depois da primeira limpeza grande. Para devolver espaço: `vacuum full public.progress_snapshots;` (trava a tabela; numa hora tranquila, com o ranking fechado) ou `pg_repack`. O disco provisionado em si não diminui (confirme as regras atuais na documentação da Supabase).

### 5. Como ver o uso de disco

- **Painel Supabase**: *Project Settings → Infrastructure* (barra "Disk size": usado e provisionado) e *Reports → Database* (gráfico de uso de disco ao longo do tempo). Ponha um alerta ao passar de ~70%.
- **Por tabela, no SQL Editor**: `select * from public.retention_disk_report();` (linhas estimadas, bytes totais com índices e a política de cada tabela, da maior para a menor). Para o banco inteiro: `select pg_size_pretty(pg_database_size(current_database()));`.
- As linhas estimadas vêm do planejador: rode `analyze;` antes para números frescos.

### 6. O que ninguém verificou

A `0019` nunca rodou. O SQL foi escrito sem acesso a um Postgres: a sintaxe (janela nomeada, `array(with ...)`, `ctid = any(array(...))`) e o plano de execução da consulta de janela em milhões de linhas precisam do plano de testes SQL do fim do arquivo (itens A a O), no projeto de desenvolvimento. Os volumes por hora ativa e os bytes por linha são estimativas; o teste `retention.test.ts` prova a **regra** (modelo em TypeScript), não o SQL.
