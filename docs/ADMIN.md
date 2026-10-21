# Painel do dono (admin)

AVISO: **nada disto foi aplicado, implantado ou executado contra um serviço real por este trabalho.** A migration `0020_admin.sql` não foi aplicada, nenhum projeto Supabase ou Vercel foi tocado, nenhuma chave foi lida ou escrita. O código está no repositório; o painel só funciona depois dos passos abaixo. Os valores de segredos ficam só nos painéis; aqui há apenas nomes.

O painel é um app **separado do jogo e do portal** (pasta `admin/`, `package.json` próprio, projeto Vercel próprio). Não parece com o jogo de propósito. **Somente leitura, com duas exceções auditadas** na página “IA e operação” (migration `0021_ai_ops.sql`, ainda não aplicada): ligar/desligar um dos quatro interruptores de segurança (com motivo obrigatório, registrado com o seu nome) e marcar um relatório da IA como lido. Todo o resto só lê.

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
| **IA e operação** | Três grupos: **Estado da operação**, **Incidentes** e **Relatórios da IA**; os controles que gravam (interruptores e «Marcar como lido») levam a marca «grava», e «lido» não é «resolvido». «Serviço não implantado» (o vigia nunca verificou) aparece à parte de «nenhum incidente». Os quatro interruptores (`maintenance_mode`, `market_paused`, `season_scoring_paused`, `pass_sales_paused`) com botões Ligar/Desligar e confirmação com motivo, incidentes abertos do vigia automático, relatórios da IA do mais grave ao menos grave (com links para o jogador e a venda envolvidos e botão “Marcar como lido”), custo estimado da IA no mês e o registro recente. Guia completo, segredos e roteiro de incidente em `docs/AI_OPS.md`. |

Cada tabela tem **Exportar CSV** (lê todas as páginas do filtro atual, até 10.000 linhas). O CSV neutraliza células que começam com `=`, `+`, `-` ou `@` (nome de jogador não executa fórmula na planilha).

### Como cada número é calculado (e o que NÃO é)

- **Online agora**: personagens salvos nos últimos 5 minutos (`characters.updated_at`; configurável em `arena_private.admin_config`). É uma aproximação: quem joga sem salvar não conta.
- **Jogando hoje / 7 / 30 dias**: personagens salvos no período. “Hoje” começa à meia-noite do fuso configurado (padrão `America/Sao_Paulo`). A série diária de jogadores ativos vem de `arena_private.admin_daily`, preenchida pela rotina (seção 4), porque a retenção (0019) afina snapshots antigos e a história não poderia ser refeita depois.
- **Receita do Passe**: vendas no cartão reais (`entitlements`, origem `stripe`, `livemode`, ativas) **× o preço guardado em `admin_config.pass_price_card_usd` (padrão 10.00)** + o **USDC realmente recebido** (`chain_payments`, `purpose = 'pass'`, aplicado, real). O preço verdadeiro vive no Stripe; o painel só guarda sua cópia para estimar. Reembolsos aparecem à parte. Passes de teste, concessões e indicações **não** entram na receita.
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
- Limites conhecidos: o ouro vem de saves enviados pelo cliente; “online” é aproximação; o painel não faz nada contra jogadores (liberar alertas, desqualificar, conceder Passe continuam sendo SQL, como na documentação da Liga).

## 3. Aplicar a migration e virar admin

1. **Primeiro no projeto de desenvolvimento** (SQL Editor ou `supabase db push`), depois das migrations 0001 a 0019. A `0020_admin.sql` só cria tabelas novas (`arena_private.admins`, `admin_config`, `admin_template_info`, `admin_player_cache`, `admin_gold_daily`, `admin_daily`), índices nas tabelas existentes e funções. Não altera colunas, políticas nem dados do jogo. O rollback está no cabeçalho do arquivo.
   **Passe da temporada:** depois da `0025`, aplique também a `0026_admin_pass_season.sql` (só recria `admin_overview`, `admin_players` e `admin_player_detail` para mostrarem o Passe válido nesta temporada e o histórico; idempotente, não toca nos dados). Sem ela o painel funciona, mas avisa que só conhece o histórico de Passes.
2. Torne-se admin (SQL Editor, com a conta do jogo já criada, e-mail confirmado):
   ```sql
   insert into arena_private.admins (user_id, note)
   select id, 'dono' from auth.users where email = 'seu-email@exemplo.com';
   ```
3. Confira os valores do painel (opcional):
   ```sql
   select * from arena_private.admin_config;
   update arena_private.admin_config set value = '10.00' where key = 'pass_price_card_usd';  -- seu preço real no Stripe
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

A primeira execução completa lê todos os saves uma vez (pode levar alguns minutos com muitas contas): rode fora do horário de pico. As seguintes só tocam saves que mudaram. Para cancelar: `select cron.unschedule('arena-admin-daily'); select cron.unschedule('arena-admin-aggregates');`. Sem as rotinas o painel funciona, mas “Jogadores” mostra nível/ouro vazios, “Economia” mostra um aviso no lugar do ouro e a série “jogadores ativos” fica zerada.

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

AVISO: **nada disto foi aplicado, implantado ou executado contra um serviço real por este trabalho.** A `0027` e a função `admin-delete-user` só existem no repositório. O painel deixa de ser somente leitura: além dos dois interruptores da seção 1, ele agora pode **apagar uma conta**, **ativar/revogar o Passe** e **gerar códigos promocionais**. Toda ação de escrita segue as mesmas regras:

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
