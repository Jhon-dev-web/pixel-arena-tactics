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
