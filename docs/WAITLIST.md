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
| `ref_code`, `view_key_hash`, `email_canon`, `referred_by`, `referral_ignored`, `qualified_at` | só do programa de convites (seção "Convites com recompensa"): o código público, o hash da chave privada de visualização, o e-mail sem `+etiqueta`/pontos do Gmail, quem convidou, por que um convite foi ignorado e quando a pessoa convidada ficou ativa |
| `ip_hash`, `subnet_hash` | **hash** (HMAC-SHA256 com o segredo `WAITLIST_SECRET`) do IP e da rede (/24 ou /48). O IP em si **nunca** é guardado. Servem só para achar abuso. |

Nada mais. Nenhum cliente (navegador, jogo) lê ou escreve essa tabela: a segurança por linha (RLS) está ligada, não existe nenhuma política e os papéis `anon` e `authenticated` não têm permissão nenhuma. Só as funções do servidor (chave de serviço) e você, no editor SQL, mexem nela.

## Passo a passo para ligar

1. **Aplicar a migração `0016_waitlist.sql`** (depois da 0015), primeiro no projeto de desenvolvimento: editor SQL do Supabase ou `supabase db push`. Rode o "SQL TEST PLAN" no fim do arquivo. A migração foi escrita mas **nunca foi executada** contra um banco real.
2. **Definir os segredos, por nome** (Supabase > Edge Functions > Secrets, ou `supabase secrets set NOME=valor`):
   - `PORTAL_ORIGIN`: a origem exata do portal, com https e sem barra no fim (por exemplo `https://www.seusite.com`). Pode listar mais de uma, separadas por vírgula (útil para o domínio `.vercel.app` de testes). Só essas origens conseguem usar o formulário a partir de um navegador.
   - `WAITLIST_SECRET`: uma sequência longa e aleatória (48 caracteres ou mais, por exemplo `openssl rand -base64 48`). Ela assina os links de cancelamento e gera os hashes. **Guarde-a**: se mudar, os links de cancelamento já enviados deixam de funcionar e os hashes antigos deixam de bater com os novos.
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` a plataforma já fornece. A chave de serviço nunca vai para o portal.
3. **Implantar as funções, sem verificação de JWT** (quem se cadastra não tem conta):
   - `supabase functions deploy waitlist-join --no-verify-jwt`
   - `supabase functions deploy waitlist-unsubscribe --no-verify-jwt`
   - `supabase functions deploy waitlist-referrals --no-verify-jwt` (só se for usar os convites, seção abaixo)
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

## Convites com recompensa (link de indicação)

Depois de se cadastrar, a pessoa vê **"Seu link de convite"** (`<site>/?ref=CÓDIGO`), com botão de copiar e botões de compartilhar no WhatsApp, X e Telegram. Os botões só **abrem** o aplicativo ou o site da rede com a mensagem pronta; nenhum script de terceiros é carregado. Quem entra pelo link tem o código guardado na aba (sessionStorage) e o cadastro dela registra **quem convidou**.

Desligado por padrão. Para ligar: `referralEnabled: true` no `config` (precisa de `waitlistEnabled: true`) e implantar a terceira função, `waitlist-referrals`. **Ligue só quando você quiser prometer as recompensas em público.**

### Regras

- **Código de convite**: 10 caracteres aleatórios (alfabeto de 32 letras sem I, O, 0, 1; 50 bits, impossível de adivinhar), gravado na linha da pessoa (`ref_code`).
- **Quem convidou** é decidido uma vez, no cadastro novo, e nunca muda (um gatilho no banco impede). Um e-mail que já estava na lista **não** troca de padrinho.
- **Nunca a si mesmo**: o convite é ignorado (o cadastro funciona; fica anotado em `referral_ignored`) quando o e-mail é da mesma pessoa (mesmo e-mail depois de tirar `+etiqueta`, e sem pontos no Gmail) ou quando o IP (em hash) é o mesmo de quem convidou dentro de 24 horas do cadastro dele ou de outro convite vindo do mesmo IP. A janela está em `arena_private.referral_config.ip_window_hours`.
- **Dois contadores por quem convida**, calculados na hora pelo banco:
  - **Convites ativos (`qualified`)**: a pessoa convidada criou uma conta no jogo **com o mesmo e-mail** (confirmado) e o servidor registrou um progresso aceito dela com Herói **nível 10 ou mais, depois do lançamento** (`launch_at`). O nível vem de `progress_snapshots`, escrito só pela função `submit-progress` com a hora do servidor e a auditoria de plausibilidade; não é a palavra do navegador. Isso barra e-mails falsos.
  - **Compraram o Passe (`paying`)**: a conta da pessoa convidada tem um Passe **ativo, pago, em modo real (`livemode`)** de `stripe`, `mercadopago`, `crypto_bsc` ou `crypto_sol` (a mesma lista do `paid_pass_count`, que alimenta a meta e o medidor). Concessão manual (`grant`), Passe de convite (`referral`), modo de teste, reembolsado ou revogado **não contam**. Se uma compra é reembolsada ou contestada depois, ela sai da contagem na hora; **uma recompensa que já foi entregue fica** (nada é retirado automaticamente).
  - Várias contas da mesma pessoa (aliases do mesmo e-mail) contam como uma só; o apelido do próprio convidador nunca conta.

### Recompensas (todas dentro do jogo, entregues pelo servidor)

| Quando | Recompensa | `reward_ref` (id para o jogo) |
| --- | --- | --- |
| 1 convite ativo | título **Recrutador** | `recruiter` |
| 3 convites ativos | moldura de retrato (cosmético) | `portrait_frame_recruiter` |
| **10 amigos que compraram o Passe** | **Passe de Aventureiro grátis** | (um direito `entitlement` de verdade) |
| 25 convites ativos | título **Lenda do Recrutamento** | `recruitment_legend` |

- O **Passe grátis** é um direito com `source = 'referral'` e `livemode = true`. Ele **não conta** para a meta de Passes nem para o medidor público (só Passes pagos contam). Vale como qualquer Passe no jogo, e como um Passe com modo real ele **dá direito de entrar no ranking** da Liga (decisão sua: se não quiser isso, mude `livemode` para `false` na função `referral_grant` antes de aplicar). Quem já tem um Passe ativo não recebe um segundo (o `create-checkout` também recusa comprar quando já se tem Passe); a recompensa fica em aberto e é entregue na próxima rodada se o Passe dele for reembolsado.
- As faixas ficam na tabela **`arena_private.referral_rewards`**; você muda no editor SQL:

```sql
select metric, min_count, kind, reward_ref, label_pt, active from arena_private.referral_rewards order by metric, min_count;
-- trocar a meta da moldura para 5 convites:
update arena_private.referral_rewards set min_count = 5 where reward_ref = 'portrait_frame_recruiter';
-- desligar uma faixa:
update arena_private.referral_rewards set active = false where reward_ref = 'recruitment_legend';
-- nova faixa (kind: title | cosmetic | pass; metric: qualified | paying):
insert into arena_private.referral_rewards (metric, min_count, kind, reward_ref, label_pt, label_en) values ('qualified', 50, 'title', 'recruitment_master', 'Título: Mestre do Recrutamento', 'Title: Recruitment Master');
```

Quem já recebeu não perde nada ao mudar a tabela. **Atenção:** a lista de recompensas mostrada no portal (`referral.tiers` em `portal/src/content.mjs`) é texto fixo; ao mudar uma faixa aqui, mude a linha correspondente lá e reconstrua o portal.

### Como ligar (ordem)

1. A migração `0016` já cria tudo (tabelas, funções e dois gatilhos). Ela depende de `progress_snapshots` (0004) e `entitlements` (0003 a 0013).
2. **Defina a data de lançamento** (nada qualifica enquanto estiver vazia): `update arena_private.referral_config set launch_at = '2026-12-01 00:00:00+00';` (também `min_hero_level`, padrão 10).
3. Implante a função: `supabase functions deploy waitlist-referrals --no-verify-jwt` (mesmos segredos: `PORTAL_ORIGIN`, `WAITLIST_SECRET`).
4. **Rodada periódica de segurança (opcional, recomendada)**: os gatilhos já qualificam e entregam em tempo real (a cada progresso aceito e a cada compra de Passe) e **nunca** bloqueiam um pagamento ou um progresso (qualquer erro vira um aviso). Para recuperar atrasos (queda do servidor, faixa alterada, conta criada depois), agende a varredura. No Supabase: habilite a extensão `pg_cron` (Database > Extensions) e rode `select cron.schedule('referral-sweep', '*/15 * * * *', $$select public.referral_sweep()$$);`. Para rodar à mão: `select public.referral_sweep();` (devolve quantas pessoas qualificou mais quantas recompensas entregou).
5. `referralEnabled: true` no portal, `npm run build`, publicar.

### O que o jogo lê (feito: Configurações > Convites)

O jogo lê tudo pela conta logada, **só online** (no jogo offline / desktop o painel nem aparece), e nunca manda um id:

- `select public.my_referral_status();` (a pessoa logada; só enxerga os próprios dados): devolve `code` (o código de convite dela, se ela estiver na lista com o mesmo e-mail), `qualified`, `paying`, `pass_goal` (o número da faixa do Passe, 10) e `rewards` (lista com `kind`, `ref`, `label_pt`, `label_en`, `granted_at`). É o dado da linha **"Convites ativos: N · Compraram o Passe: M de 10"** do painel **Configurações > Convites**, que também mostra o link (ou o código, enquanto o endereço do portal não estiver configurado), as faixas de recompensa e um ✓ nas que o servidor já entregou.
- `select public.referral_tiers();` (**migração `0017_referral_reads.sql`, ainda não aplicada**): a lista das faixas **ativas** de `arena_private.referral_rewards`, só para quem está logado. Sem ela o painel usa as quatro faixas padrão da 0016, então o jogo funciona antes e depois de aplicar. Aplique quando quiser que uma faixa nova ou desligada apareça no jogo sem publicar o jogo de novo.
- A tabela `public.referral_rewards_granted` **não é lida direto**: `my_referral_status` já devolve as linhas da própria pessoa. O jogo mapeia `recruiter` (título "Recrutador"), `portrait_frame_recruiter` (moldura de retrato) e `recruitment_legend` (título "Lenda do Recrutamento") para os próprios cosméticos e os coloca nos cosméticos do save ao entrar, ao voltar para a janela e a cada 15 minutos; aplicar de novo não muda nada. O **Passe grátis** não precisa de nada no cliente: é um direito `adventurer_pass` com `source = 'referral'`, que o jogo já lê como qualquer Passe (Configurações > Passe mostra "Convites" como origem).
- **Link de convite no jogo:** preencha `SUPPORT.portalUrl` em `src/lib/supportConfig.ts` com o endereço público do portal (`https://seu-dominio`, sem caminho). O jogo monta `<portal>/?ref=CÓDIGO`, o mesmo formato do portal. Enquanto estiver vazio, o painel mostra só o código.

Esses nomes de recompensa (`reward_ref`) são o contrato com o jogo; uma recompensa nova precisa de uma linha em `REFERRAL_COSMETICS` (`src/game/referralRewards.ts`) e do cosmético (título ou moldura) no jogo.

### "Meus convites": por que não há consulta por e-mail

Você pediu um jeito de a pessoa ver os convites sem abrir brecha de enumeração. Digitar o e-mail e receber os números permitiria a qualquer um **descobrir se um e-mail está na lista** (e quantos convites ele tem). Por isso a contagem **não existe por e-mail**:

- Logo depois do cadastro, o servidor devolve ao navegador da própria pessoa o **código público** (o do link) e uma **chave privada de visualização** (32 caracteres aleatórios, guardada só como hash no banco). O navegador guarda os dois (e nunca o e-mail) e mostra as contagens com eles.
- Se alguém digita o e-mail de **outra** pessoa que já está na lista, a resposta tem o mesmo formato e traz o código público dela (que está em todo link que ela compartilha de qualquer jeito), mas uma chave **descartável** que não corresponde a nada. A tela mostra zeros, exatamente como mostraria para um cadastro novo. Ninguém descobre quem está na lista nem vê os números de ninguém.
- Em outro aparelho ou depois de limpar o navegador, a contagem completa fica **no jogo, em Configurações** (`my_referral_status`, que usa a conta logada).

### SQL do dono: ranking, números e abuso

```sql
-- quem mais convidou (convites contados, ativos e que compraram)
select w.email, w.ref_code, c.referred, c.qualified, c.paying
from public.waitlist w, lateral arena_private.referral_counts(w.id) c
where c.referred > 0
order by c.paying desc, c.qualified desc, c.referred desc
limit 50;

-- totais do programa
select count(*) filter (where referred_by is not null) as convidados_contados,
       count(*) filter (where qualified_at is not null) as ativos,
       count(*) filter (where referral_ignored is not null) as ignorados
from public.waitlist;

-- por que convites foram ignorados
select referral_ignored, count(*) from public.waitlist where referral_ignored is not null group by 1 order by 2 desc;

-- recompensas já entregues
select g.granted_at, g.kind, g.reward_ref, g.metric, g.min_count, u.email
from public.referral_rewards_granted g join auth.users u on u.id = g.user_id order by g.granted_at desc;

-- ABUSO 1: muitos cadastros do mesmo IP (hash) ou da mesma rede /24 (ou /48)
select ip_hash, count(*) n, min(created_at), max(created_at) from public.waitlist where ip_hash is not null group by 1 having count(*) >= 5 order by n desc;
select subnet_hash, count(*) n from public.waitlist where subnet_hash is not null group by 1 having count(*) >= 15 order by n desc;

-- ABUSO 2: um convidador cujos convidados vêm quase todos do mesmo IP ou da mesma rede
select r.id as convidador, r.email, count(*) convidados, count(distinct w.ip_hash) ips_distintos, count(distinct w.subnet_hash) redes_distintas
from public.waitlist w join public.waitlist r on r.id = w.referred_by
group by r.id, r.email having count(*) >= 5 and (count(distinct w.ip_hash) <= 2 or count(distinct w.subnet_hash) <= 2) order by convidados desc;

-- ABUSO 3: convites em rajada (mais de 10 em uma hora para o mesmo convidador)
select referred_by, date_trunc('hour', created_at) hora, count(*) from public.waitlist where referred_by is not null group by 1, 2 having count(*) > 10 order by 3 desc;

-- ABUSO 4: e-mails descartáveis (ajuste a lista de domínios; mantenha-a atualizada)
select split_part(email::text, '@', 2) as dominio, count(*) from public.waitlist
where split_part(email::text, '@', 2) in ('mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','yopmail.com','trashmail.com','sharklasers.com','getnada.com','dispostable.com','maildrop.cc')
group by 1 order by 2 desc;
-- e quais desses estão ligados a convites:
select w.email, r.email as convidador from public.waitlist w join public.waitlist r on r.id = w.referred_by
where split_part(w.email::text, '@', 2) in ('mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','yopmail.com','trashmail.com');

-- ABUSO 5: o mesmo e-mail em apelidos diferentes (+etiqueta, pontos do Gmail)
select email_canon, count(*) n, array_agg(email order by created_at) from public.waitlist group by 1 having count(*) > 1 order by n desc;

-- ABUSO 6: convidados "ativos" cuja conta é muito recente ou subiu de nível rápido demais (revise à mão)
select w.email, w.qualified_at, u.created_at as conta_criada, w.qualified_at - u.created_at as tempo_ate_nivel
from public.waitlist w join auth.users u on lower(u.email) = w.email::text where w.qualified_at is not null order by tempo_ate_nivel limit 50;
```

Se achar fraude: tire o convite da conta (`update public.waitlist set qualified_at = null where ...` não desfaz uma recompensa já entregue; para retirar uma recompensa à mão, apague a linha de `public.referral_rewards_granted` e, no caso do Passe, `update public.entitlements set status = 'revoked' where source = 'referral' and user_id = '...'`). O `waitlist_guard` impede mudar `referred_by` depois do cadastro (só dá para zerar, o que apagar o convidador já faz).

### LGPD dos convites

Os convites acrescentam: o código de convite (aleatório), o vínculo "convidado por" entre duas linhas da lista, o hash da chave de visualização e o apelido normalizado do e-mail. Atualize a Política de Privacidade para dizer que o programa de convites existe, quais dados usa e que o convidador **não** vê o e-mail de quem convidou (ele só vê contagens). Ao apagar uma pessoa a pedido (`delete from public.waitlist where email = '...'`), os convidados dela ficam sem convidador e os contadores dela somem; as recompensas já entregues ficam na conta do jogo.

## Limites conhecidos

- Cadastros e cancelamentos dependem de as funções estarem implantadas e dos segredos definidos; sem eles a função responde 503 e o portal mostra "tente de novo em instantes".
- Sem double opt-in, endereços digitados por engano ou por terceiros entram na lista até você confirmar/limpar.
- O contador público mostra o total de cadastros ativos; se o número pequeno for ruim para a imagem do jogo, deixe a chave desligada.
