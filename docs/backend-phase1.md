# Backend Phase 1 — conta + persistência

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

Debounced em ~800ms (`src/App.tsx`, efeito sobre `[save]`) em vez de uma requisição por mudança de
estado do React. Transições sensíveis a tempo (parar caça, colher jardim, reivindicar recompensa) chamam
`commitSave()`, que força um flush imediato em vez de esperar o debounce. Há também flush em
`beforeunload` e ao reconectar (`online`).

## Offline

Se `repository.save()` falhar por rede, a mudança permanece marcada como "suja" (não é descartada) e o
status exibido na barra superior vira `sync.offline`/`sync.error`. Ao reconectar (`window.online`), um
flush é tentado automaticamente. Nenhuma perda silenciosa: o pior caso é o jogador ver "alterações
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
