# Painel do dono (admin)

**Estado de implantação:** o código e as migrations (`0020` em diante) estão no repositório; o estado do que está no ar vive só em `RESUMO_DO_PROJETO.md`, seção 7. O painel só funciona depois dos passos abaixo. O pagamento do Passe é por carteira (USDC na Solana); o Stripe saiu em 28/10 (decisão em `docs/PAGAMENTOS_DESCARTADOS.md`). Os valores de segredos ficam só nos painéis; aqui há apenas nomes.

O painel é um app **separado do jogo e do portal** (pasta `admin/`, `package.json` próprio, projeto Vercel próprio). Não parece com o jogo de propósito. **Quase tudo só lê.** As escritas, todas só para administrador e todas auditadas: na página “IA e operação” (migration `0021_ai_ops.sql`) ligar/desligar um dos quatro interruptores de segurança (com motivo obrigatório) e marcar um relatório da IA como lido; e, na migration `0027_admin_actions.sql` (seção 7), **apagar uma conta**, **ativar/revogar o Passe** (no painel do jogador) e **gerar/desativar códigos promocionais** (página «Códigos»).

## 1. O que ele mostra

| Página | O que responde |
| --- | --- |
| **Visão geral** | **Abre com «Precisa de atenção»** (só com o que o banco já devolve: pagamentos a resolver, pausas de segurança ligadas, incidentes, relatórios da IA não lidos, alertas de progresso e de itens, devoluções marcadas, rotinas atrasadas), cada item com link para a página; depois seis números centrais, e o resto («mais números») logo abaixo. Cada bloco carrega e falha sozinho (carregando, vazio, falhou, dado anterior mantido), com «Tentar de novo» próprio, e mostra «consulta atualizada às» e «dados agregados até». Online agora (salvou nos últimos 5 min), cadastros (total, hoje, 7 e 30 dias), jogando hoje / 7 / 30 dias, lista de espera, **Passe válido nesta temporada** e **histórico de Passes** (duas medidas, migration `0026`), por origem (cartão, USDC, indicação, concessão; real e teste), receita estimada do Passe, vendas e volume do mercado em SOL, taxas do jogo (5%), arrecadado na Solana (taxas em SOL + Passes em USDC), itens certificados, Bolsas de Ouro em circulação, materiais negociáveis, estado da Liga. Seis gráficos dos últimos 30 dias, cada um com a tabela dos valores exatos («Ver os valores em tabela»). Atualiza sozinha a cada 60 s com “atualizado há X s”. |
| **Jogadores** | Tabela buscável (nome, herói, e-mail, id) com cinco colunas de resumo (jogador, atividade recente, progresso, Passe válido, alertas) e ordenável também por cadastro, andar, profundeza e ouro, com filtros (online, Passe: válido nesta temporada / sem Passe válido / expirado / já teve, com alertas, com carteira). Linha clicável abre o painel lateral (com foco preso nele e a página de trás inerte): conta, progresso, Passe, carteira, alertas, itens, últimas negociações, Liga. **O e-mail aparece mascarado; o completo só ao clicar em “Mostrar e-mail completo”.** |
| **Lendários** | Todo Lendário e todo item único já emitido: quando, para quem, nível (tier) e slot, **origem** (forja, garantia/pity, Selo, Caça, Chefe), **estado** (com o jogador, à venda, vendido, vinculado, consumido, revogado) e dono atual (uma peça vendida mostra o comprador). Filtros e busca. |
| **Mercado** | Vendas e anúncios com preço, taxa, quanto o vendedor recebeu, comprador, vendedor, rede (real ou teste) e **link da transação na Solscan**. Totais do filtro. |
| **Economia** | Ouro nos saves (total, média, mediana, percentil 90, maior saldo, parte dos 10 mais ricos, série diária, maiores saldos), Bolsas de Ouro (em circulação, criadas, abertas, por tamanho), materiais negociáveis, itens certificados por tipo, raridade e estado, volume em SOL. |
| **Liga** | Temporada, datas, meta de Passes pagos e progresso, topo do ranking com “aparece no ranking público?”, e a **fila de auditoria antifraude** (alertas de progresso e de itens, motivos mais comuns). |
| **Lista de espera** | Total, por dia, por origem, indicações ignoradas e quem mais indicou (e-mails mascarados), quantos já criaram conta. |
| **Códigos** | Gerar códigos promocionais (recompensa: Passe, Ouro, Éter ou uma poção; quantidade, usos, validade, nota), ver quanto cada um foi usado e desativar (seção 7.3). **Grava.** |
| **IA e operação** | Três grupos: **Estado da operação**, **Incidentes** e **Relatórios da IA**; os controles que gravam (interruptores e «Marcar como lido») levam a marca «grava», e «lido» não é «resolvido». «Serviço não implantado» (o vigia nunca verificou) aparece à parte de «nenhum incidente». Os quatro interruptores (`maintenance_mode`, `market_paused`, `season_scoring_paused`, `pass_sales_paused`) com botões Ligar/Desligar e confirmação com motivo, incidentes abertos do vigia automático, relatórios da IA do mais grave ao menos grave (com links para o jogador e a venda envolvidos e botão “Marcar como lido”), custo estimado da IA no mês e o registro recente. Guia completo, segredos e roteiro de incidente em `docs/AI_OPS.md`. |

Cada tabela tem **Exportar CSV** (lê todas as páginas do filtro atual, até 10.000 linhas). O CSV neutraliza células que começam com `=`, `+`, `-` ou `@` (nome de jogador não executa fórmula na planilha).

### Como cada número é calculado (e o que NÃO é)

- **Online agora**: personagens salvos nos últimos 5 minutos (`characters.updated_at`; configurável em `arena_private.admin_config`). É uma aproximação: quem joga sem salvar não conta.
- **Jogando hoje / 7 / 30 dias**: personagens salvos no período. “Hoje” começa à meia-noite do fuso configurado (padrão `America/Sao_Paulo`). A série diária de jogadores ativos vem de `arena_private.admin_daily`, preenchida pela rotina (seção 4), porque a retenção (0019) afina snapshots antigos e a história não poderia ser refeita depois.
- **Receita do Passe**: vendas no cartão reais **antigas** (`entitlements`, origem `stripe`, `livemode`, ativas; não há mais venda nova por cartão) **× o preço guardado em `admin_config.pass_price_card_usd` (padrão 10.00)** + o **USDC realmente recebido** (`chain_payments`, `purpose = 'pass'`, aplicado, real). O painel só guarda uma cópia desse preço para estimar a receita dos Passes antigos por cartão; o Passe novo é pago em USDC (`docs/MARKET_SOLANA.md`). Reembolsos aparecem à parte. Passes de teste, concessões e indicações **não** entram na receita.
- **Arrecadado na Solana**: taxas de 5% das vendas reais (`market_sales.fee_lamports`, `livemode`) + USDC dos Passes. Vendas de teste (devnet) ficam fora dos totais e aparecem marcadas.
- **Ouro em circulação**: **declarado pelos saves**, que o cliente envia (não é saldo auditado). Vem do agregado diário, **nunca de uma varredura ao vivo** dos saves.
- **Garantia (pity) em Lendários**: classificação aproximada. É forja de tier ≥ 4 depois de 40 forjas desse tipo sem Lendário, contada pelo histórico de pedidos de criação (`item_mint_requests`). Se esse histórico for apagado pela retenção (`request_cache_days`), a classificação cai para “Forja”.
- **Peças do Selo** nascem vinculadas e sem certificado; vêm do histórico de pedidos de criação.
- **Nível, andar, profundeza e itens nos saves** vêm do cache por conta (`arena_private.admin_player_cache`), reconstruído só para os personagens que mudaram desde a última rodada.

## 2. Segurança

- **Quem é admin**: uma linha em `arena_private.admins`. **Só você insere, por SQL** (seção 3). Nada no jogo ou no painel adiciona admin. A tabela não tem nenhum privilégio para `anon` nem `authenticated`.
- **Toda função do painel** (`admin_overview`, `admin_players`, `admin_player_detail`, `admin_legendaries`, `admin_market`, `admin_economy`, `admin_economy_series`, `admin_flags`, `admin_league`, `admin_waitlist`) **começa perguntando `public.is_admin()`** e levanta `ADMIN_ONLY` se a resposta for não; é `security definer` com `search_path` fixo e vazio, concedida **só a `authenticated`**, `stable` e **sem nenhum comando de escrita**. Nenhuma tabela do jogo fica legível pelo cliente: as políticas e permissões antigas não mudam.
- **O painel nunca tem chave de serviço.** Ele usa só a chave anon (pública por natureza: já está em todo navegador que abre o jogo) e o login e-mail + senha de uma conta do jogo. Os nomes de variável são só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. **Nunca** ponha a chave `service_role` em variável `VITE_*`: tudo que começa com `VITE_` vai para o navegador de qualquer um.
- Depois do login o painel chama `is_admin()`. Se for falso, mostra **“Acesso negado”**, não carrega nenhuma página e não chama nenhuma função de dados. Se o servidor recusar uma chamada depois (conta removida da lista), volta para “Acesso negado”. Se a verificação falhar (rede), o painel **falha fechado**.
- **Cabeçalhos** (`admin/vercel.json`): CSP estrita (`default-src 'none'`; scripts e estilos só do próprio domínio; `connect-src` só o próprio domínio e `https://*.supabase.co`; sem `unsafe-inline`), `noindex` (meta, `X-Robots-Tag` e `robots.txt`), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, HSTS. Nada de fontes ou scripts de terceiros.
- **Recomendado**:
  1. **Ative a autenticação em dois fatores na sua conta do Supabase** (o painel do Supabase dá acesso total ao banco).
  2. Use para o admin uma conta do jogo com **senha longa e única** (gerenciador de senhas) e um e-mail que só você controla.
  3. **Mantenha a lista de admins mínima** (idealmente só você). Remova quem sair: `delete from arena_private.admins where user_id = '<id>';`.
  4. Não compartilhe o endereço do painel nem o ligue a partir do jogo ou do portal (não há link nenhum).
- **LGPD**: e-mails de jogadores e da lista de espera só são visíveis a admins; nas tabelas aparecem **mascarados** (`an***@exemplo.com`) e o completo só no painel de detalhes de um jogador. Use-os apenas para suporte e auditoria. Esta rodada **não grava** quem viu qual e-mail (o painel é somente leitura); os logs de API do Supabase registram as chamadas. Se quiser um registro de acessos, é uma próxima rodada.
- Limites conhecidos: o ouro vem de saves enviados pelo cliente; “online” é aproximação; o painel não libera alertas nem desqualifica jogadores (continua sendo SQL, como na documentação da Liga); conceder/revogar o Passe e apagar contas agora têm botão (seção 7).

## 3. Aplicar a migration e virar admin

1. **Primeiro no projeto de desenvolvimento** (SQL Editor ou `supabase db push`), depois das migrations 0001 a 0019. **Detalhe do jogador ao vivo:** aplique também a `0034_admin_player_full.sql` (função `admin_player_full`, só leitura; sem ela o detalhe volta a usar o cache e avisa). A `0020_admin.sql` só cria tabelas novas (`arena_private.admins`, `admin_config`, `admin_template_info`, `admin_player_cache`, `admin_gold_daily`, `admin_daily`), índices nas tabelas existentes e funções. Não altera colunas, políticas nem dados do jogo. O rollback está no cabeçalho do arquivo.
   **Passe da temporada:** depois da `0025`, aplique também a `0026_admin_pass_season.sql` (só recria `admin_overview`, `admin_players` e `admin_player_detail` para mostrarem o Passe válido nesta temporada e o histórico; idempotente, não toca nos dados). Sem ela o painel funciona, mas avisa que só conhece o histórico de Passes.
2. Torne-se admin (SQL Editor, com a conta do jogo já criada, e-mail confirmado):
   ```sql
   insert into arena_private.admins (user_id, note)
   select id, 'dono' from auth.users where email = 'seu-email@exemplo.com';
   ```
3. Confira os valores do painel (opcional):
   ```sql
   select * from arena_private.admin_config;
   update arena_private.admin_config set value = '10.00' where key = 'pass_price_card_usd';  -- só estima a receita dos Passes antigos por cartão
   update arena_private.admin_config set value = 'America/Sao_Paulo' where key = 'timezone';
   ```
4. **Plano de teste SQL** no fim do arquivo `0020_admin.sql` (A a E): um jogador comum recebe `ADMIN_ONLY` em toda função, `anon` recebe “permission denied”, o admin recebe os dados, e as rotinas não são chamáveis por um cliente.
5. **Novo template no jogo**: se criar uma peça nova, insira uma linha em `arena_private.admin_template_info (kind, template_id, tier, slot)` (a tabela veio de `FORGE_TEMPLATES` e `UNIQUE_TEMPLATES` em `supabase/functions/_shared/items/tables.ts`). Sem ela, a peça aparece sem tier/slot e não entra na conta da garantia.

## 4. Agendar as rotinas (pg_cron)

O ouro em circulação **não é varredura ao vivo**: duas rotinas copiam o necessário. **Só você as executa** (não são chamáveis por cliente). Ative a extensão `pg_cron` (Database > Extensions) e rode:

```sql
-- uma vez, para preencher os últimos 90 dias de cadastros e jogadores ativos e montar o cache de todas as contas
select arena_private.admin_refresh_daily(90);
select arena_private.admin_refresh_aggregates(true);

-- a cada 15 minutos: cadastros e jogadores ativos de hoje (consultas indexadas, baratas)
select cron.schedule('arena-admin-daily', '*/15 * * * *', $$select arena_private.admin_refresh_daily(2)$$);

-- a cada 6 horas: reconstrói o cache só dos personagens que mudaram e grava a linha de ouro do dia
select cron.schedule('arena-admin-aggregates', '5 */6 * * *', $$select arena_private.admin_refresh_aggregates()$$);
```

A migração `0034_admin_player_full.sql` tenta fazer isto sozinha quando o `pg_cron` está disponível (agenda as duas rotinas e preenche o cache uma vez); se não estiver, ela só avisa e você segue os passos acima.

A primeira execução completa lê todos os saves uma vez (pode levar alguns minutos com muitas contas): rode fora do horário de pico. As seguintes só tocam saves que mudaram. Para cancelar: `select cron.unschedule('arena-admin-daily'); select cron.unschedule('arena-admin-aggregates');`. Sem as rotinas o painel funciona: o painel de detalhes de um jogador lê o save ao vivo (`admin_player_full`, migração 0034), mas a lista “Jogadores” mostra nível/ouro como um traço (“atualiza pela rotina”), “Economia” mostra um aviso no lugar do ouro e a série “jogadores ativos” fica zerada.

## 5. Publicar o painel na Vercel (projeto separado)

1. Vercel: **Add New Project** do **mesmo repositório**, com **Root Directory = `admin`**. Framework Vite (o `vercel.json` já define `npm ci`, `npm run build`, saída `dist`).
2. **Environment Variables** do projeto (só estes dois nomes; os valores estão em Supabase > Project Settings > API):
   - `VITE_SUPABASE_URL` (a URL do projeto)
   - `VITE_SUPABASE_ANON_KEY` (a chave **anon**, nunca a `service_role`)
   - Recomendadas, públicas (aparecem no painel como etiqueta do ambiente, sem segredo): `VITE_ADMIN_ENV` = `teste` ou `producao`, e `VITE_ADMIN_PRODUCTION_REF` = a referência do projeto Supabase de produção (a primeira parte do endereço, `xxxx` em `https://xxxx.supabase.co`). Com as duas, o painel confere a afirmação e mostra «Ambiente inconsistente» se o deploy estiver trocado. Sem elas mostra «Ambiente não declarado». Isto é o ambiente do **painel**; o campo real/teste de cada pagamento ou Passe continua em cada linha.
   São variáveis de build: depois de mudar, faça novo deploy. **Nunca** defina `VITE_ADMIN_DEMO` (é só do modo de demonstração e a build normal nem contém esse código).
3. Domínio: um subdomínio seu e discreto, por exemplo `admin.<seu-dominio>`. **Não linke** o painel a partir do jogo nem do portal.
4. Em Supabase > Authentication > URL Configuration, nada precisa mudar: o painel usa e-mail e senha, sem redirecionamento.
5. Se a senha for esquecida, use a recuperação normal do jogo (o painel não tem tela de recuperação).

## 6. Desenvolver e testar

```
cd admin
npm ci
npm test            # 300+ testes: SQL estático, SQL de verdade (PGlite), formatação, CSV, filtros, caminho "acesso negado", bundle e cabeçalhos
npm run build       # tsc + vite build
VITE_ADMIN_DEMO=1 npm run dev   # painel com dados inventados (porta 5225), sem rede
```

`npm test` roda as migrations **0001 a 0026 de verdade** num Postgres em memória (PGlite, só em testes), semeia um mundo pequeno e chama cada função como `authenticated` e `anon`: confere permissões, os números, a classificação de Lendários (garantia, Selo, Caça, Chefe, peça vendida com dono atual), que cada função roda em transação somente leitura e que as rotinas de agregação funcionam. Isso **não substitui** o plano de teste SQL no Supabase de desenvolvimento (PGlite não é o Postgres do Supabase: papéis, `auth` e `pg_cron` são simulados ou ausentes).

O app não faz parte do `tsc`, do `eslint` nem do `vitest` do jogo (excluído como o `portal/`).

## 7. Ações do painel (migration `0027_admin_actions.sql`, ainda não aplicada)

**Estado de implantação:** a `0027` e a função `admin-delete-user` estão no repositório (`supabase/migrations/0027*.sql`, `supabase/functions/admin-delete-user`); o que está no ar está em `RESUMO_DO_PROJETO.md`, seção 7. O painel deixa de ser somente leitura: além dos dois interruptores da seção 1, ele agora pode **apagar uma conta**, **ativar/revogar o Passe** e **gerar códigos promocionais**. Toda ação de escrita segue as mesmas regras:

- **Só administrador.** Cada função começa perguntando `public.is_admin()` e levanta `ADMIN_ONLY` se a resposta for não. A conta de um jogador comum, mesmo logada, recebe a recusa; `anon` recebe "permission denied". O painel só mostra o botão depois do acesso confirmado, mas **quem protege é o banco**.
- **Do lado do servidor.** Nada é decidido no navegador. Nenhuma chave de serviço entra no painel.
- **Auditada.** Cada ação grava uma linha em `arena_private.admin_audit` (`id`, `admin_id`, `action`, `target_user`, `details`, `at`). A tabela é **só de acréscimo** (um gatilho recusa `update` e `delete`) e não guarda chave estrangeira para o alvo: o registro "quem apagou quem" sobrevive à conta apagada. Para ler: `select * from arena_private.admin_audit order by id desc limit 50;`.
- **Confirmada na tela.** Cada botão abre uma confirmação dentro do painel lateral, com as palavras do que vai acontecer.

Botões que gravam levam a marca «grava» (borda tracejada), como os interruptores.

### 7.1 Apagar uma conta

Botão **Apagar conta…** no fim do painel do jogador. A confirmação diz que é **irreversível** e pede que o dono **digite o nome da conta** (nome de usuário; se não houver, o nome do herói; se não houver nenhum dos dois, o e-mail completo). O botão só habilita quando o texto é igual (maiúsculas e minúsculas não importam).

O que acontece, em ordem (Edge Function `admin-delete-user`, JWT verificado):
1. O painel chama a função com o token da sessão do dono (nunca a chave de serviço).
2. A função chama `public.admin_delete_user_prepare(user_id, texto digitado)` **com o token do dono**, então `auth.uid()` no banco é o dono. O banco recusa: quem não é admin (`ADMIN_ONLY`), apagar a si mesmo (`ADMIN_DELETE_SELF`), apagar qualquer admin (`ADMIN_DELETE_ADMIN`; tire a linha de `arena_private.admins` antes, à mão), conta inexistente (`USER_NOT_FOUND`) e nome digitado diferente (`CONFIRM_MISMATCH`).
3. O banco faz um **ensaio da exclusão** dentro de uma sub-transação sempre desfeita. Se alguma chave estrangeira sem cascata (ou gatilho) impedir, responde `blocked` (com o nome da restrição) e grava `delete_user_blocked`; **nada é apagado**.
4. Só então grava a linha `delete_user` (**antes** de apagar) e a função usa a chave de serviço, no servidor, para chamar `auth.admin.deleteUser` (exclusão definitiva). As cascatas apagam herói, saves, snapshots, Passe, carteira, anúncios abertos, convites etc.
5. O resultado entra no registro (`delete_user_done` ou `delete_user_failed`).

**Quais tabelas travam a exclusão (verificado nos testes SQL):** todas as chaves estrangeiras para `auth.users` têm `on delete cascade` ou `set null`. O que trava está um nível adiante, no mercado: `item_certificates.origin_certificate_id` (a cópia de um item vendido aponta para o certificado original do vendedor), `market_listings.certificate_id` e `market_reservations.listing_id` (sem cascata, de propósito: o rastro financeiro sobrevive). Na prática: **quem vendeu ou comprou itens no mercado normalmente não pode ser apagado pelo painel** (o painel mostra a restrição e nada é apagado). Contas sem histórico de mercado (a maioria, e todas as de teste) saem sem problema. Mudar isso é decisão de produto: seria preciso trocar essas três chaves por `on delete set null` (e tirar o `not null` de `market_reservations.listing_id`).

**Implantação:** segredo novo `ADMIN_ORIGIN` (a origem https exata do painel, para CORS) e `npx supabase@2.121.0 functions deploy admin-delete-user --project-ref <ref> --use-api` (com verificação de JWT **ligada**, o padrão). Sem `ADMIN_ORIGIN` a função responde 503 e o painel diz que ela não está disponível.

### 7.2 Ativar e revogar o Passe

No painel do jogador, **Ativar o Passe** (aparece quando a conta não tem Passe válido nesta temporada) e **Revogar o Passe** (quando tem). Os dois pedem um **motivo** (3 a 300 letras), que vai para o registro de ações junto com o seu nome.

- `public.admin_grant_pass(p_user, p_note)`: cria **uma** linha em `entitlements` (`kind adventurer_pass`, `source 'grant'`, `livemode true`, `status active`) carimbada pelo gatilho da `0025` com a temporada atual (`arena_private.current_pass_season()`; a pré-temporada conta como Temporada 1). É a mesma linha que o dono inseria à mão. **Idempotente**: se a conta já tem um Passe ativo que cobre a temporada atual (comprado, de convite ou concedido), devolve `already` e não grava nada (nem registro de ação). Registro: `grant_pass` com motivo, temporada e id da concessão.
- `public.admin_revoke_pass(p_user, p_note)`: marca como `revoked` o(s) Passe(s) **ativo(s) que cobrem a temporada atual** (o histórico fica; um Passe antigo que já não cobre nada não é tocado). Devolve as origens revogadas. Sem Passe para revogar devolve `none` e não grava. Registro: `revoke_pass` com motivo, temporada, origens e ids. **Revogar um Passe pago não devolve dinheiro**: a confirmação avisa e o estorno é feito por fora.
- Efeito no jogo: o jogo relê o Passe ao voltar para a aba (a cada 5 min) ou ao abrir; as vantagens somem/aparecem sem recarregar.
- Contagens: o Passe concedido **vale para as vantagens e para o ranking** (a regra `owns_ranking_pass` já deixava `grant` entrar), mas **não conta** na meta/medidor de Passes pagos (`paid_pass_count`) nem na receita, e não conta como "pagante" nos convites.

### 7.3 Códigos promocionais

Página **Códigos** do painel + **Configurações > Passe de Aventureiro > Código promocional** no jogo (só online). Cada código dá **uma** recompensa, escolhida por você ao gerar: o **Passe de Aventureiro** da temporada atual, **Ouro**, **Éter** ou **uma poção** (ver "Ouro, Éter e poções" abaixo; migration `0028_server_credits.sql`).

**No painel.** Gerar: quantidade (1 a 500), recompensa (Passe, Ouro, Éter ou Poção; para Poção, qual poção; para Ouro, Éter e Poção, a quantidade por conta), usos por código (1 a 100.000, contas diferentes), validade opcional (fim do dia escolhido) e uma nota obrigatória (para que serve o lote). O painel mostra o que vai acontecer, pede confirmação, e depois mostra os códigos gerados num campo copiável («Copiar todos»). A lista mostra cada código com a recompensa («25.000 Ouro», «5 × Elixir do Conhecimento»), usos / máximo, validade, estado (**Ativo**, **Esgotado**, **Expirado**, **Desativado**), nota, e os botões **Copiar** e **Desativar** (com confirmação; definitivo). Funções: `admin_create_promo_codes(p_count, p_reward, p_max_uses, p_expires_at, p_note, p_item_id, p_amount)`, `admin_list_promo_codes()`, `admin_disable_promo_code(p_code)`; as três só para administrador e as duas que mudam algo gravam no registro de ações (`create_promo_codes` com a recompensa, a poção e a quantidade, sem os códigos; `disable_promo_code` com o código).

**Os códigos.** 10 caracteres do alfabeto de convites (sem I, O, 0, 1), sorteados no banco; todos têm o mesmo tamanho, então nenhum é prefixo de outro. Mostrados como `ABCDE-FGHJK`; o jogo aceita com ou sem traço, espaço ou minúsculas. Tabelas `arena_private.promo_codes` (código único, recompensa, `max_uses`, `uses`, `expires_at`, `created_by`, `created_at`, `note`, `active`) e `arena_private.promo_redemptions` (código, conta, momento; único por código e conta). Nenhuma das duas é legível por `anon` ou `authenticated`.

**Resgate (`public.redeem_promo_code(p_code)`, só `authenticated`).** Respostas: `ok` (usos + 1, uma linha de resgate e o Passe), `invalid` (não existe, ou foi desativado: a resposta não diz qual), `expired`, `exhausted`, `already_redeemed` (esta conta já usou este código), `already_has_pass` (já tem Passe que cobre a temporada atual: **o código não é gasto**), `rate_limited`. A linha do código é travada (`FOR UPDATE`) e a conta também, então duas contas disputando o último uso não ganham as duas, e uma compra que chegue no meio desfaz o resgate. **Limite de tentativas:** 10 por conta por hora (mesma tabela e mesma função de janela da lista de espera, balde `promo:<conta>`); toda resposta que não é `ok` conta (inclusive `already_has_pass` e `already_redeemed`, que diriam a quem chuta que o código é real); a 11ª é recusada **antes** de olhar o código, mesmo que seja o certo. O espaço de códigos é 32^10 (cerca de 10^15).

**O Passe de um código.** Linha em `entitlements` com `source 'promo'`, `livemode true`, carimbada com a temporada atual pelo gatilho da `0025`. A `0027` acrescenta `'promo'` à restrição `entitlements_source_check`.
- **Ranking: conta**, como uma concessão (`owns_ranking_pass` só pergunta `livemode` ou `grant`, e a linha é `livemode`). Não há regra encontrada que proíba isso; se o dono quiser o contrário, é trocar essa linha da função.
- **Não conta** em `paid_pass_count` (meta e medidor público), **nem na receita** (só as vendas pagas: cartão antigo e USDC), **nem como "pagante"** nas recompensas de convite: as três listam as origens pagas explicitamente e `promo` não está entre elas. No painel a origem aparece como «Código promocional».

**Ouro, Éter e poções (migration `0028_server_credits.sql`).** O servidor nunca escreve o save e o `submit-progress` só limita o que um save pode alegar, então um número de código precisa de um **livro de créditos** do servidor. Ele existe agora: `arena_private.server_credits` (`id`, `user_id`, `kind` ouro/Éter/poção, `item_id`, `amount`, `source 'promo'`, `source_ref` = o código, `created_at`, `claimed_at`, `counted_at`; único por código e conta; sem acesso para `anon`/`authenticated`; apaga junto com a conta). Fluxo:

1. **Resgate.** `redeem_promo_code` de um código de Ouro/Éter/poção faz, na **mesma transação**, usos + 1, a linha de resgate e **uma** linha em `server_credits` (se a linha do livro falhar, nada mais se move). Resposta: `{status:'ok', reward:'gold'|'shards'|'consumable', item_id, amount, credit_id}`. Quem já tem o Passe **pode** usar um código de Ouro/Éter/poção (`already_has_pass` só vale para códigos de Passe). Mesmas respostas de erro e o mesmo limite de 10 tentativas por hora.
2. **Jogo recolhe.** `public.claim_server_credits()` (só `authenticated`, só a conta de `auth.uid()`) devolve os créditos ainda não recolhidos (no máximo 100, do mais antigo) e os marca `claimed_at` na mesma instrução, então duas abas não pegam o mesmo. `public.my_recent_credits(p_days)` (1 a 30, padrão 14, no máximo 100) devolve o que já foi recolhido: serve para recuperar um crédito cuja resposta se perdeu.
3. **Aplicar uma vez.** O save guarda `appliedCredits` (os últimos 400 ids aplicados; o campo só aparece depois do primeiro crédito, então saves de quem nunca usou código não mudam). Cada crédito é aplicado se e só se o id não está na lista: Ouro e Éter somam ao saldo (**não** a `stats.goldEarned`, que é o contador do ranking), poções entram na mochila. **Mochila cheia:** a poção entra mesmo assim (a mochila aceita passar da capacidade, como no acerto de fim de temporada do Passe); nada é recusado, descartado ou fica pendente. O jogo recolhe ao entrar na conta (e recupera os últimos 14 dias), ao voltar o foco para a janela (no máximo a cada 20 s), a cada 10 min com a aba visível e logo depois de um resgate; a aplicação é salva na hora e aparece um aviso: «Código resgatado: +25.000 Ouro». Nada fica no armazenamento do navegador.
4. **Limites do `submit-progress`.** O servidor lê o Ouro, o Éter e as unidades de poção (mochila + baú) de cada snapshot e compara a **alta** com o último snapshot aceito: franquia = o que o jogo e a negociação permitem no tempo (Ouro: 100.000/h x (horas + 10) + 250.000/dia x (dias + 1); Éter: 1.000 x (dias + 1); poções: 5.000 x (dias + 1)) **+ os créditos recolhidos e ainda não contados** (`progress_credits_pending`). Acima da franquia: alerta (`GOLD_BALANCE_JUMP`, `SHARDS_BALANCE_JUMP`, `POTIONS_BALANCE_JUMP`); acima do dobro: rejeitado, como as outras taxas. Os créditos só são marcados `counted_at` (`progress_credits_mark_counted`) quando o snapshot é **aceito**: um crédito vale uma vez e um snapshot sinalizado não o gasta. Sem a migration aplicada, o `submit-progress` continua funcionando (sem créditos). Os números da franquia são estimativas largas (em `bounds.ts`), para pegar saldo editado, não arredondamento.

**Limites por código e por conta (também checados pela tabela):** Ouro 1 a 1.000.000; Éter 1 a 10.000; poção 1 a 100 unidades de **uma** poção. **Poções oferecidas (19):** Poção de Vida Pequena/Grande, Elixir de Batalha, do Conhecimento, de Vida Maior, de Força, de Precisão, Tônico de Pele de Pedra, da Fortuna, de Pressa, do Prospector, Poção do Coletor, Óleo de Amolar, Adubo, Kit de Reparo e Kit de Reparo Mestre, Pedra de Amolar, Polimento de Armadura, Isca do Caçador. **Fora da lista, de propósito:** Bolsas de Ouro (negociáveis: um código não pode fabricar bem de mercado), Escritura do Baú (espaço permanente), Selo de Forja e Catalisador de Refino (recompensas da trilha do Passe) e os Bilhetes de Expedição. A lista está no SQL (`promo_consumable_ids()`), em `src/game/promoRewards.ts` e em `admin/src/lib/actions.ts`; testes comparam as três.

**Efeito no jogo.** Depois do `ok` de um código de Passe o jogo pergunta de novo ao servidor pelo Passe (`recheckServerPass`): as vantagens e o chip «Ativo» aparecem sem recarregar, e «Obtido por» mostra «Código promocional». Depois do `ok` de um código de Ouro/Éter/poção a mensagem da tela diz o que veio («Código resgatado: +25.000 Ouro») e o jogo recolhe o crédito na hora.

### 7.4 Aplicar e implantar (nada foi feito)

1. Aplicar a `0027_admin_actions.sql` e depois a `0028_server_credits.sql` (primeiro no projeto de teste): `npx supabase@2.121.0 db push --yes`. A 0027 só cria tabelas novas e funções, e troca a restrição `entitlements_source_check`; a 0028 cria `server_credits`, acrescenta duas colunas e novas restrições em `promo_codes`, troca `admin_create_promo_codes` (5 argumentos por 7), `admin_list_promo_codes` e `redeem_promo_code`, e cria `claim_server_credits`, `my_recent_credits` e as duas funções do `submit-progress`. O rollback está no cabeçalho de cada arquivo. **Ordem de implantação:** migration 0028, depois a Edge Function `submit-progress` (ela tolera a migration ausente, mas só soma créditos depois dela), depois o painel e o jogo.
2. Segredo `ADMIN_ORIGIN` e deploy de `admin-delete-user` (seção 7.1). Os códigos e o Passe manual **não** precisam da função: só da migration.
3. Publicar o painel novo (seção 5) e o jogo novo (a caixa de código fica em Configurações, só na versão online).
4. Conferir (SQL, como dono): `select * from arena_private.admin_audit order by id desc limit 20;` depois de cada ação de teste.

Testes: `admin/tests/sql/deleteuser.integration.test.ts`, `passgrant.integration.test.ts`, `promo.integration.test.ts`, `credits.integration.test.ts` e `credits.static.test.ts` (rodam a `0027` e a `0028` de verdade em PGlite; a 0028 cobre recompensas, limites, poções proibidas, atomicidade do resgate, recolher uma vez, recuperar um crédito perdido e contar uma vez; e na `0027`: não-admin recusado, registro escrito, idempotência, validade, usos máximos, resgate duplo, limite de tentativas, "já tem Passe" sem gastar o código, mudança de temporada), `actions.static.test.ts` (todas as funções com `search_path` vazio, revogadas de `public`/`anon`, concedidas só a `authenticated`/`service_role`, e `is_admin()` antes de qualquer coisa), `supabase/functions/_shared/__tests__/adminDeleteUser.test.ts` (função de apagar conta) `supabase/functions/_shared/__tests__/progress.test.ts` (sem crédito o mesmo salto é sinalizado, com crédito recolhido passa, e um crédito vale uma vez), `admin/tests/codesRewards.test.tsx` (página), `src/game/__tests__/promoCode.test.ts` e `promoRewards.test.ts` (jogo: aplicar cada crédito uma vez, mochila cheia, recuperação).
