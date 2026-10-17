# Painel do dono (admin)

AVISO: **nada disto foi aplicado, implantado ou executado contra um serviço real por este trabalho.** A migration `0020_admin.sql` não foi aplicada, nenhum projeto Supabase ou Vercel foi tocado, nenhuma chave foi lida ou escrita. O código está no repositório; o painel só funciona depois dos passos abaixo. Os valores de segredos ficam só nos painéis; aqui há apenas nomes.

O painel é um app **separado do jogo e do portal** (pasta `admin/`, `package.json` próprio, projeto Vercel próprio). Não parece com o jogo de propósito. **Somente leitura**: nada nele grava, apaga ou muda nada.

## 1. O que ele mostra

| Página | O que responde |
| --- | --- |
| **Visão geral** | Online agora (salvou nos últimos 5 min), cadastros (total, hoje, 7 e 30 dias), jogando hoje / 7 / 30 dias, lista de espera, Passes ativos por origem (cartão, USDC, indicação, concessão; real e teste), receita estimada do Passe, vendas e volume do mercado em SOL, taxas do jogo (5%), arrecadado na Solana (taxas em SOL + Passes em USDC), itens certificados, Bolsas de Ouro em circulação, materiais negociáveis, estado da Liga. Seis gráficos dos últimos 30 dias. Atualiza sozinha a cada 60 s com “atualizado há X s”. |
| **Jogadores** | Tabela buscável (nome, herói, e-mail, id) e ordenável (visto por último, cadastro, nível, andar, profundeza, ouro, nome), com filtros (online, com/sem Passe, com alertas, com carteira). Linha clicável abre o painel lateral: conta, progresso, Passe, carteira, alertas, itens, últimas negociações, Liga. **O e-mail aparece mascarado; o completo só ao clicar em “Mostrar e-mail completo”.** |
| **Lendários** | Todo Lendário e todo item único já emitido: quando, para quem, nível (tier) e slot, **origem** (forja, garantia/pity, Selo, Caça, Chefe), **estado** (com o jogador, à venda, vendido, vinculado, consumido, revogado) e dono atual (uma peça vendida mostra o comprador). Filtros e busca. |
| **Mercado** | Vendas e anúncios com preço, taxa, quanto o vendedor recebeu, comprador, vendedor, rede (real ou teste) e **link da transação na Solscan**. Totais do filtro. |
| **Economia** | Ouro nos saves (total, média, mediana, percentil 90, maior saldo, parte dos 10 mais ricos, série diária, maiores saldos), Bolsas de Ouro (em circulação, criadas, abertas, por tamanho), materiais negociáveis, itens certificados por tipo, raridade e estado, volume em SOL. |
| **Liga** | Temporada, datas, meta de Passes pagos e progresso, topo do ranking com “aparece no ranking público?”, e a **fila de auditoria antifraude** (alertas de progresso e de itens, motivos mais comuns). |
| **Lista de espera** | Total, por dia, por origem, indicações ignoradas e quem mais indicou (e-mails mascarados), quantos já criaram conta. |

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
   São variáveis de build: depois de mudar, faça novo deploy. **Nunca** defina `VITE_ADMIN_DEMO` (é só do modo de demonstração e a build normal nem contém esse código).
3. Domínio: um subdomínio seu e discreto, por exemplo `admin.<seu-dominio>`. **Não linke** o painel a partir do jogo nem do portal.
4. Em Supabase > Authentication > URL Configuration, nada precisa mudar: o painel usa e-mail e senha, sem redirecionamento.
5. Se a senha for esquecida, use a recuperação normal do jogo (o painel não tem tela de recuperação).

## 6. Desenvolver e testar

```
cd admin
npm ci
npm test            # 160+ testes: SQL estático, SQL de verdade (PGlite), formatação, CSV, filtros, caminho "acesso negado", bundle e cabeçalhos
npm run build       # tsc + vite build
VITE_ADMIN_DEMO=1 npm run dev   # painel com dados inventados (porta 5225), sem rede
```

`npm test` roda as migrations **0001 a 0020 de verdade** num Postgres em memória (PGlite, só em testes), semeia um mundo pequeno e chama cada função como `authenticated` e `anon`: confere permissões, os números, a classificação de Lendários (garantia, Selo, Caça, Chefe, peça vendida com dono atual), que cada função roda em transação somente leitura e que as rotinas de agregação funcionam. Isso **não substitui** o plano de teste SQL no Supabase de desenvolvimento (PGlite não é o Postgres do Supabase: papéis, `auth` e `pg_cron` são simulados ou ausentes).

O app não faz parte do `tsc`, do `eslint` nem do `vitest` do jogo (excluído como o `portal/`).
