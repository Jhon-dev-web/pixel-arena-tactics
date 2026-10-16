# Lista de espera do lançamento ("Avise-me no lançamento")

O portal ganhou um bloco para a pessoa deixar o e-mail e ser avisada do lançamento. Este documento é para o dono: o que foi construído, o que você precisa fazer para ligar, como ver quantas pessoas se cadastraram e como exportar a lista.

**O que isto NÃO faz: não envia nenhum e-mail.** Guardar o endereço e a autorização é a parte pronta. Enviar o aviso (e confirmar o endereço, o "double opt-in") exige um provedor de e-mail que **você** escolhe depois (veja "Enviar e-mails, mais tarde"). Nenhum provedor foi integrado.

## O que é guardado

Uma linha por e-mail na tabela `public.waitlist`:

| Campo | O que é |
| --- | --- |
| `email` | o endereço, sempre em minúsculas (único, sem diferenciar maiúsculas) |
| `locale` | `pt` ou `en` (a língua da página onde a pessoa se cadastrou) |
| `source` | de onde veio: `utm_source` ou o site de origem (curto, só estatística) |
| `consent_at` | o momento em que marcou a caixa de autorização |
| `created_at` | quando entrou na lista |
| `confirmed_at` | reservado para o double opt-in; fica vazio até existir um provedor |
| `unsubscribed_at` | quando cancelou (vazio = ativa) |
| `ip_hash`, `subnet_hash` | **hash** (HMAC-SHA256 com o segredo `WAITLIST_SECRET`) do IP e da rede (/24 ou /48). O IP em si **nunca** é guardado. Servem só para achar abuso. |

Nada mais. Nenhum cliente (navegador, jogo) lê ou escreve essa tabela: a segurança por linha (RLS) está ligada, não existe nenhuma política e os papéis `anon` e `authenticated` não têm permissão nenhuma. Só as funções do servidor (chave de serviço) e você, no editor SQL, mexem nela.

## Passo a passo para ligar

1. **Aplicar a migração `0016_waitlist.sql`** (depois da 0015), primeiro no projeto de desenvolvimento: editor SQL do Supabase ou `supabase db push`. Rode o "SQL TEST PLAN" no fim do arquivo. A migração foi escrita mas **nunca foi executada** contra um banco real.
2. **Definir os segredos, por nome** (Supabase > Edge Functions > Secrets, ou `supabase secrets set NOME=valor`):
   - `PORTAL_ORIGIN`: a origem exata do portal, com https e sem barra no fim (por exemplo `https://www.seusite.com`). Pode listar mais de uma, separadas por vírgula (útil para o domínio `.vercel.app` de testes). Só essas origens conseguem usar o formulário a partir de um navegador.
   - `WAITLIST_SECRET`: uma sequência longa e aleatória (48 caracteres ou mais, por exemplo `openssl rand -base64 48`). Ela assina os links de cancelamento e gera os hashes. **Guarde-a**: se mudar, os links de cancelamento já enviados deixam de funcionar e os hashes antigos deixam de bater com os novos.
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` a plataforma já fornece. A chave de serviço nunca vai para o portal.
3. **Implantar as duas funções, sem verificação de JWT** (quem se cadastra não tem conta):
   - `supabase functions deploy waitlist-join --no-verify-jwt`
   - `supabase functions deploy waitlist-unsubscribe --no-verify-jwt`
4. **Ligar no portal** (`portal/src/content.mjs`, bloco `config`): `waitlistEnabled: true`, e preencher `supabaseUrl` (se ainda não estiver, é o mesmo da Liga da Temporada). Se quiser o contador público, preencha também `supabaseAnonKey` (a chave pública anon) e ligue a chave do banco (próxima seção). Rode `npm run build` e publique o portal. Com `waitlistEnabled: false` (o padrão) nada aparece.
5. Se a página de **Política de Privacidade** já estiver publicada (`legalLive.privacy: true` e o texto em `legal`), o bloco passa a mostrar o link para ela sozinho.

Onde o bloco aparece: na Home (depois da abertura) e, em versão curta, na página da Liga da Temporada. Existe também a página `/pt/unsubscribe/` e `/en/unsubscribe/` (não indexada), para onde um e-mail futuro vai apontar o link de cancelamento.

## Ver quantas pessoas se cadastraram

No editor SQL do Supabase (você é o dono; o editor usa a função de administrador e enxerga a tabela):

```sql
-- total e ativas (não cancelaram)
select count(*) as total, count(*) filter (where unsubscribed_at is null) as ativas from public.waitlist;

-- por dia
select created_at::date as dia, count(*) as novos from public.waitlist group by 1 order by 1 desc;

-- por origem (utm_source ou site de origem)
select coalesce(source, '(direto)') as origem, count(*) as pessoas from public.waitlist group by 1 order by 2 desc;

-- por idioma
select locale, count(*) from public.waitlist where unsubscribed_at is null group by 1;
```

### Contador público ("X aventureiros na lista")

Desligado por padrão. A função `public.waitlist_count()` devolve **somente o número de cadastros ativos** e só enquanto você ligar a chave:

```sql
update arena_private.portal_flags set show_waitlist_count = true;   -- liga
update arena_private.portal_flags set show_waitlist_count = false;  -- desliga (a função devolve NULL e o portal não mostra nada)
```

O portal só mostra a linha quando a resposta é um número de verdade.

## Exportar a lista (CSV)

Só quem concordou e não cancelou. No editor SQL, rode a consulta e use o botão **Download CSV**:

```sql
select
  case when email::text ~ '^[=+@-]' then '''' || email::text else email::text end as email,
  locale, source, created_at, consent_at
from public.waitlist
where unsubscribed_at is null
order by created_at;
```

(A primeira coluna protege contra "injeção de fórmula" em planilhas; o formulário já recusa endereços que começam por `=`, `+`, `-` ou `@`.)

Por linha de comando, com o `psql`: `\copy (select email, locale, source, created_at from public.waitlist where unsubscribed_at is null order by created_at) to 'lista.csv' csv header`. **Trate o arquivo como dado pessoal**: não deixe em pasta compartilhada, apague quando não precisar.

## Proteções (como não vira um depósito de spam)

- **Sem acesso do cliente**: veja acima. A função pública só devolve `{ "ok": true }`; nunca dados de outra pessoa.
- **Origem**: um navegador de qualquer site que não esteja em `PORTAL_ORIGIN` é recusado (403) e nunca recebe permissão de CORS.
- **Campo isca (honeypot)**: um campo escondido que uma pessoa não vê. Se vier preenchido, a função responde como se tivesse dado certo e **não guarda nada**.
- **Autorização obrigatória**: sem `consent: true` o cadastro é recusado.
- **Limites por hora, contados de forma atômica no banco** (uma única instrução SQL por contagem): 10 por IP, 40 por rede /24, 5 por e-mail e 2000 no total. Acima disso a resposta é 429. Os números ficam em `supabase/functions/_shared/waitlist/logic.ts` e na migração (os testes garantem que os dois batem). O IP vem do cabeçalho da plataforma; é uma defesa de melhor esforço (quem forjar o cabeçalho só mexe nos contadores, nunca nos dados).
- **Idempotente e sem enumeração**: o mesmo e-mail de novo responde igual a um e-mail novo. Ninguém descobre quem está na lista digitando o endereço.
- **Quem cancelou continua cancelado**: um novo cadastro com o mesmo e-mail **não** desfaz o cancelamento (senão um desconhecido poderia reinscrever alguém). Reinscrever é decisão sua, no SQL, depois de a pessoa pedir.
- **Sem registro de dados pessoais**: nenhuma linha de log contém e-mail, IP ou token.
- **Tamanho do pedido** limitado a 4 KB.

## LGPD (Lei Geral de Proteção de Dados): o que é seu

O código cuida do lado técnico. O resto é responsabilidade do controlador, que é você:

- **Finalidade**: avisar do lançamento do Arena Idle. Não use a lista para outra coisa (por exemplo, divulgar outro produto) sem nova autorização.
- **Consentimento**: a caixa é obrigatória, vem desmarcada e o texto é o combinado ("Quero receber e-mails sobre o lançamento do Arena Idle. Posso cancelar quando quiser."). O momento fica em `consent_at`.
- **Política de Privacidade**: o texto é seu. Ela deve dizer quais dados são guardados (e-mail, idioma, origem, hash de IP), para quê, por quanto tempo, quem é o controlador e como falar com você. O portal só mostra o link quando a página está publicada.
- **Cancelamento**: qualquer e-mail futuro deve levar o link de cancelamento (abaixo). Atenda também pedidos por e-mail ou mensagem.
- **Apagar a pedido**: `delete from public.waitlist where email = 'pessoa@exemplo.com';` (isso apaga também o registro de consentimento dela; guarde a prova do pedido onde fizer sentido para você). Para anonimizar em vez de apagar, limpe os hashes: `update public.waitlist set ip_hash = null, subnet_hash = null where email = '...';`.
- **Retenção**: defina um prazo e cumpra. Depois do lançamento, apague a lista ou limpe os hashes (`update public.waitlist set ip_hash = null, subnet_hash = null;`).
- Os hashes de IP continuam sendo dado pessoal para a LGPD. Eles existem só para o controle de abuso; apague-os assim que não precisar mais.

## Enviar e-mails, mais tarde (provedor a escolher)

Nada disto está feito, de propósito:

1. **Escolha um provedor de e-mail** (Resend, Postmark, Amazon SES, Brevo etc.) e verifique o seu domínio (SPF, DKIM, DMARC). Isso é uma decisão sua e tem custo e política própria.
2. **Double opt-in (confirmar o endereço)**: enviar um e-mail com um link de confirmação e só então preencher `confirmed_at`. Hoje qualquer pessoa pode digitar o e-mail de outra; sem confirmação, o primeiro aviso é o ponto de maior risco de reclamação de spam. Recomendado antes do primeiro envio em massa.
3. **Link de cancelamento**: o módulo `supabase/functions/_shared/waitlist/token.ts` já assina e verifica o token (`signUnsubscribeToken(WAITLIST_SECRET, idDaLinha)`). O link vai para `https://<portal>/pt/unsubscribe/?t=<token>`; a página pede um clique e chama `waitlist-unsubscribe`. O token só consegue cancelar aquela linha e não expira (um e-mail antigo continua funcionando).
4. Só envie para linhas com `unsubscribed_at is null`.

## Limites conhecidos

- Cadastros e cancelamentos dependem de as duas funções estarem implantadas e dos segredos definidos; sem eles a função responde 503 e o portal mostra "tente de novo em instantes".
- Sem double opt-in, endereços digitados por engano ou por terceiros entram na lista até você confirmar/limpar.
- O contador público mostra o total de cadastros ativos; se o número pequeno for ruim para a imagem do jogo, deixe a chave desligada.
