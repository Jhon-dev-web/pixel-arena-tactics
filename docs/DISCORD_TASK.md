# Tarefa "Entrar no Discord"

Atualizado em 22/10/2026. Para o dono do jogo.

## O que o jogador vê

Em **Missões > Comunidade** ("Tarefas da comunidade") há a tarefa **Entrar no Discord**:

- **Entrar no servidor**: abre o convite do seu Discord (some se você não configurar o endereço, passo 5).
- **Verificar**: leva o jogador ao Discord, ele aprova (só pedimos o número da conta e se ele está no servidor) e volta ao jogo. O **servidor** do jogo confere com o Discord se ele é membro. O jogo nunca vê senha, mensagem nem o token do Discord, e nada disso é guardado.
- Estados: não verificado, "ainda não está no servidor" (entre e tente de novo), verificado.

## A recompensa

**500 de Ouro para a Temporada.** O Ouro da pré-temporada é apagado quando a Liga abre, então:

- Se a Liga **ainda não abriu**: a conta fica "verificada" e a recompensa espera. Quando a Liga abre, o servidor coloca 500 de Ouro no livro de créditos de **todas** as contas verificadas, e o herói novo recebe (igual ao baú do Kit Pioneiro).
- Se a Liga **já abriu**: o crédito é criado na hora da verificação.
- **Uma recompensa por conta do jogo e por conta do Discord**: uma conta do Discord que já verificou uma conta não serve para outra.

## Como ativar (passo a passo)

### 1. Criar o aplicativo no Discord
1. Entre em https://discord.com/developers/applications com a sua conta e clique em **New Application** (nome: Arena Idle).
2. No menu **OAuth2**, copie o **Client ID** e clique em **Reset Secret** para ver e copiar o **Client Secret** (não mostre a ninguém nem coloque no código).
3. Em **OAuth2 > Redirects**, adicione exatamente: `https://<ref>.supabase.co/functions/v1/discord-link-callback`, onde `<ref>` é a referência do projeto Supabase (teste: `ncufhkoyphktvmhmivxa`). Salve.

### 2. Pegar o id do servidor (guild)
No Discord: Configurações do usuário > Avançado > ligue o **Modo desenvolvedor**. Clique com o botão direito no ícone do seu servidor > **Copiar ID do servidor**.

### 3. Criar o convite permanente
No servidor: Convidar pessoas > Editar link do convite > **Expirar: nunca** (e sem limite de usos). Copie o endereço (`https://discord.gg/...`).

### 4. Segredos no Supabase (por nome)
Painel do Supabase > Edge Functions > Secrets (ou `npx supabase@2.121.0 secrets set ... --project-ref <ref>`):

| Segredo | Valor |
|---|---|
| `DISCORD_CLIENT_ID` | o Client ID |
| `DISCORD_CLIENT_SECRET` | o Client Secret |
| `DISCORD_GUILD_ID` | o id do servidor |
| `APP_ORIGIN` | já existe: o endereço do jogo (o jogador volta para o primeiro endereço da lista) |

### 5. Variável do jogo na Vercel
`VITE_DISCORD_INVITE_URL` = o convite do passo 3 (https). É variável de build: publique o jogo de novo depois de mudar. Sem ela, o botão "Entrar no servidor" não aparece (a verificação funciona do mesmo jeito).

### 6. Publicar
- Migração: `npx supabase@2.121.0 db push --yes` (aplica `0038_discord_task.sql`; no teste primeiro).
- Funções:
  - `npx supabase@2.121.0 functions deploy discord-link-start --project-ref <ref> --use-api` (com verificação de JWT, o padrão)
  - `npx supabase@2.121.0 functions deploy discord-link-callback --project-ref <ref> --use-api --no-verify-jwt` (é um redirecionamento do navegador, sem login)
- Jogo: publicar de novo (passo 5).

### 7. Testar
Entre no jogo com uma conta de teste, Missões > Comunidade > Verificar. Com a conta do Discord no servidor deve voltar "verificado"; sem estar no servidor, "ainda não está no servidor".

## Mudar a quantidade de Ouro

A quantidade mora em **um** lugar no servidor: a função `arena_private.discord_reward()` (campo `gold`). Para mudar:

1. Crie uma migração nova com `create or replace function arena_private.discord_reward() ...` com o número novo (copie o corpo de `0038_discord_task.sql`).
2. Mude `DISCORD_TASK.gold` em `src/game/discordTask.ts` (o texto do jogo usa o número que o servidor devolve, mas o teste confere os dois) e rode `npm test`.
3. Créditos que já foram criados mantêm o valor antigo. O limite do livro de créditos é 1.000.000 por crédito.

## Segurança e limites

- O `state` do OAuth fica no servidor (uso único, vale 10 minutos, no máximo 10 abertos por conta). Nada fica no navegador.
- O token do Discord só existe dentro da função durante a verificação, é revogado em seguida e nunca é gravado nem registrado.
- Se o Discord não responder com clareza (erro, limite de requisições), o jogador vê "não foi possível verificar" e nada é gravado; só uma resposta "não é membro" do Discord vira "ainda não está no servidor".
- Um erro de `DISCORD_GUILD_ID` errado aparece como "não foi possível verificar", não como "não é membro".
- Desfazer: bloco ROLLBACK no cabeçalho da migração `0038`.
