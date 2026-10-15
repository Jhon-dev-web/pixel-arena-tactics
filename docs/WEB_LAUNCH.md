# Lançamento web: checklist

Estado em 2026-10-13. Este documento junta o que a rodada de endurecimento fez, o que o dono precisa fazer nos painéis (Vercel e Supabase) e o que precisa existir antes de abrir o jogo ao público, principalmente antes de qualquer ranking com prêmio em dinheiro.

Nada nesta rodada foi implantado, nenhum projeto remoto (Supabase ou Vercel) foi tocado e nenhuma chave foi lida ou escrita. Tudo está só no código do repositório.

## 1. O que esta rodada fez

1. **Bundle de produção sem ferramentas de desenvolvedor.** `npm run check:bundle` faz um build de produção (variáveis do Supabase forçadas vazias, nenhum `.env*` lido) e um build de controle com `DEV` ligado. Falha se o painel admin, `window.__uiAudit`, o checker de UI, o caminho de compra do Passe só para DEV ou o aviso de console de backend ausente aparecerem no build de produção, e também falha se algum marcador deixar de existir no build de controle (marcador velho). O mesmo teste roda dentro de `npm test` (`SKIP_BUNDLE_CHECK=1` pula os dois builds). Rode `npm run check:bundle` também no CI depois de `npm run build`. Observação: os textos do painel admin (`admin.*` nos arquivos de idioma) continuam no bundle por serem dados de tradução; o código e a interface do painel não.
2. **Configuração do build web.**
   - `index.html` não carrega mais o script de relatório de tamanho para iframe (`GAME_SIZE_RESPONSE`) da plataforma de embed antiga; nada em `src` o usava. O estilo da tela de carregamento e o stand-in de `window.DebugPanel` viraram arquivos do mesmo domínio (`public/loading.css`, `public/debug-panel-shim.js`), para a página rodar sob CSP rígida.
   - `vercel.json` (só vale quando o dono implantar): CSP baseada na do app desktop, liberando `https://*.supabase.co` em `connect-src`; `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS; `frame-ancestors 'none'`; cache longo e imutável para JS/CSS/fontes com hash, revalidação para `index.html`, 1 dia para imagens e áudio sem hash. O jogo não carrega nenhuma fonte remota (a fonte vem do pacote `@fontsource`), então o Google Fonts não foi liberado.
   - Relatório de erro local: `error` e `unhandledrejection` globais e o `ErrorBoundary` gravam os últimos 5 erros (mensagem, stack, versão do app, tamanho de tela e aba aberta) em um buffer no `localStorage`. Em Configurações, "Copiar relatório de erro" copia um texto para colar no suporte. Sem serviço de terceiros e sem chamada de rede. O relatório não contém nada do save nem da conta.
3. **Upload de save limitado e versionado no cliente.** Recusa saves acima de 288 KiB antes de qualquer requisição, envia `appVersion` junto com `schemaVersion`, e há teste de ida e volta pelo repositório. As regras que o servidor deverá impor depois estão em `docs/backend-phase1.md`.

Limite importante: tudo isso é higiene do lado do cliente. Um cliente adulterado ignora todas essas verificações.

## 2. O que o dono precisa fazer nos painéis

Somente os nomes das variáveis estão aqui. Os valores ficam nos painéis, nunca no repositório, em chat ou em issue.

### Vercel

- Em **Project Settings → Environment Variables**, definir para o ambiente **Production**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, apontando para o projeto Supabase **de produção**. Para **Preview** e **Development**, usar o projeto Supabase **de desenvolvimento** (ver abaixo).
- Nunca criar variável com prefixo `VITE_` contendo a chave `service_role` ou qualquer segredo: o Vite embute toda `VITE_*` no JavaScript entregue ao navegador.
- Conferir que o framework detectado é Vite, com build `npm run build` e saída `dist` (o `vercel.json` já declara isso). Depois do primeiro deploy, abrir o site, olhar o console por violações de CSP e conferir os cabeçalhos de resposta.
- Se quiser restringir a CSP, trocar `https://*.supabase.co` pela origem exata do projeto de produção (`https://<ref-do-projeto>.supabase.co`) em `connect-src`.
- O diretório `.vercel/` fica fora do git (já está no `.gitignore`).

### Supabase

- **Confirmação de e-mail LIGADA** (Authentication → Providers → Email → "Confirm email"). Sem isso, qualquer pessoa cria contas com e-mails que não possui.
- **Dois projetos separados**: um de desenvolvimento e um de produção, cada um com seu par URL/chave anon. Nunca apontar o ambiente local nem o Preview para o projeto de produção.
- Aplicar as migrations (`supabase/migrations/`) em cada projeto, conferindo no painel que o RLS está ligado em `characters` e em `profiles`.
- Em Authentication → URL Configuration, definir o **Site URL** e as **Redirect URLs** com o domínio real de produção (e só ele).
- **Backups**: ligar os backups automáticos do plano (e o Point-in-Time Recovery se o plano permitir) no projeto de produção, e fazer um teste de restauração antes do lançamento.
- Rever os limites de taxa de autenticação (Authentication → Rate Limits) e, se o plano permitir, ligar CAPTCHA no cadastro.
- Guardar a chave `service_role` só em cofre de senhas e em segredos de funções do servidor, nunca no front-end.

## 3. Textos legais necessários (responsabilidade do dono)

Estes documentos não foram escritos aqui e precisam ser redigidos ou revisados por quem entende da lei aplicável, antes do lançamento público. Cada um deve ter link visível no jogo e na tela de cadastro.

- [ ] **Política de privacidade** (quais dados são coletados: e-mail, nome de herói, save; onde ficam; por quanto tempo; com quem são compartilhados; direitos do titular, incluindo LGPD se houver jogadores no Brasil).
- [ ] **Termos de uso** (conta, conduta, o que acontece com trapaça e adulteração de save, itens e moedas virtuais sem valor monetário, encerramento de conta).
- [ ] **Regulamento do ranking/concurso** (somente quando houver prêmio em dinheiro: elegibilidade, datas da temporada, critérios, auditoria, desempate, desqualificação, pagamento, impostos, autorizações que a lei local exigir).
- [ ] **Política de reembolso** (Passe de Aventureiro e qualquer compra; prazos de arrependimento e regras da loja ou do meio de pagamento).
- [ ] **Exclusão de conta e dados** (como o jogador pede, em quanto tempo é feita, o que é apagado e o que precisa ser retido por obrigação legal). Hoje não existe policy de DELETE na tabela `characters` nem fluxo de exclusão no jogo: precisa ser construído.

## 4. O ranking com prêmio em dinheiro NÃO abre antes das etapas de servidor

O save continua sendo escrito pelo cliente: o servidor **não joga o jogo** e não recalcula ouro, itens, sorteios nem tempo. O que já existe no repositório (e só vale depois que o dono aplicar as migrations `0003` a `0007` e implantar as funções) é um **auditor de plausibilidade**: a função `submit-progress` extrai os números do save, confere que ele é o mesmo de `characters.save_data`, compara com a história da própria conta no relógio do servidor, guarda snapshots e marca ou rejeita o que é rápido ou impossível demais; o direito ao Passe é decidido pelo servidor (`entitlements`), nunca pelo `hasBattlePass` do save (passo a passo em [`docs/PASS_SALES.md`](PASS_SALES.md) e [`docs/SEASON_RANKING.md`](SEASON_RANKING.md)). Isso torna a trapaça cara e visível, mas **não a impede**: quem faz o save crescer sempre abaixo dos limites passa, e isso só se resolve com um servidor autoritativo. Por isso a **auditoria manual do histórico completo dos 10 primeiros, antes de qualquer pagamento, é obrigatória**. Enquanto nada disso estiver aplicado em produção, o servidor só guarda o save e qualquer pessoa com conhecimentos básicos consegue editá-lo e se colocar no topo.

Portanto o ranking com prêmio em dinheiro **não deve ser aberto** antes de TODAS estas etapas estarem prontas, testadas e na ordem abaixo:

1. **Direito ao Passe controlado pelo servidor** (passo a passo em [`docs/PASS_SALES.md`](PASS_SALES.md); entitlement gravado pelo servidor a partir da compra confirmada; o cliente não escreve esse campo).
2. **Auditoria de snapshots**: o servidor guarda snapshots do progresso, checa a plausibilidade entre eles (crescimento máximo de ouro, XP, itens por intervalo de tempo) e marca contas suspeitas.
3. **Tabelas de temporada** no servidor: inscrição, pontuação e ranking calculados no servidor, nunca enviados pelo cliente.
4. **Congelamento e auditoria manual**: ao fim da temporada o ranking é congelado e os candidatos ao prêmio passam por revisão manual antes de qualquer pagamento.

Até lá, qualquer ranking pode existir apenas como brincadeira, sem prêmio em dinheiro e sem prometer nada ao jogador.

**Atualização:** as etapas 2, 3 e 4 estão escritas no repositório (migrations `0004` e `0005`, função `submit-progress`, tela "Temporada" atrás de `VITE_SEASON_RANKING_ENABLED`), mas **nada foi aplicado nem implantado**. O passo a passo, os limites do que a auditoria pega, o SQL de auditoria e a lista de textos legais estão em [`docs/SEASON_RANKING.md`](SEASON_RANKING.md).

## 5. Publicar o portal e o jogo juntos

O repositório tem dois sites independentes: o jogo (raiz do repositório, Vite, saída em `dist/`) e o portal público de divulgação (`portal/`, gerador estático sem dependências, saída em `portal/dist/`). Nada disso foi implantado; esta seção só descreve como fazer quando o dono decidir.

### 5.1 Recomendação: dois projetos na Vercel, portal no domínio raiz e jogo em um subdomínio

Opção A (recomendada): **dois projetos** na Vercel, com o mesmo repositório.

| Projeto | Root Directory | Build | Saída | Endereço |
| --- | --- | --- | --- | --- |
| Portal | `portal` | `npm run build` | `dist` | `https://<domínio>/` (e `www`) |
| Jogo | (raiz do repositório) | `npm run build` | `dist` | `https://jogar.<domínio>/` |

Opção B: **um projeto só**, com o jogo sob `/play`. Exige um build que junte `portal/dist` e `dist/` numa mesma saída (script que não existe hoje), regras de cabeçalho por caminho e testar o jogo fora da raiz (o `vite.config.ts` usa `base: "./"`, mas o jogo nunca foi verificado servido de `/play/`).

Por que a A: (1) a CSP do jogo (`vercel.json` da raiz, com `connect-src https://*.supabase.co`) é bem mais permissiva do que um site estático precisa, e o portal tem a sua própria, mínima; separar os projetos impede que uma relaxe a outra. (2) Só o jogo precisa das variáveis do Supabase; o portal não recebe nenhuma, então um vazamento ou erro de configuração do portal não toca em chave nenhuma. (3) Deploys independentes: dá para corrigir um texto do portal sem republicar o jogo, e um deploy quebrado do jogo não derruba a página de divulgação. (4) O Supabase (Site URL e Redirect URLs, seção 2) aponta para um domínio só, o do jogo. (5) Não exige nenhum script novo nem teste do jogo em outro caminho. O custo é um subdomínio extra e um registro DNS a mais.

### 5.2 O que ajustar no portal

- **`config.playUrl`** em `portal/src/content.mjs` (hoje `null`). Não é variável de ambiente: é uma constante no código, que depois é commitada. Na opção A, `'https://jogar.<domínio>/'`; na B, `'/play/'` não é aceito pelo validador (exige HTTPS), então a B também precisaria do endereço completo `'https://<domínio>/play/'`. Com ele preenchido, o botão "Acompanhar desenvolvimento" vira "Jogar" em todas as páginas.
- **Remover o `noindex`** só no dia da publicação: `<meta name="robots" content="noindex,nofollow">` aparece em `portal/src/pages.mjs` (cabeçalho de toda página) e em `portal/scripts/build.mjs` (o `index.html` da raiz e o `404.html`). Trocar nos três lugares e rodar o build. O jogo não tem essa meta; se o dono não quiser o jogo indexado, é preciso decidir à parte.
- `config.community` continua vazio até existirem canais oficiais; as páginas de Privacidade, Termos e Regras da Temporada (`/pt/privacy/`, `/pt/terms/`, `/pt/season-rules/` e `/en/...`) só têm espaço reservado e continuam sem link no menu até o texto legal chegar (seção 3 deste documento). Quando chegar, também é preciso ligá-las no rodapé do portal e do jogo.
- A imagem e o texto do portal vêm de capturas do jogo em `portal/public/img/`; refazer as capturas se a interface mudar muito.

### 5.3 Variáveis de ambiente (somente nomes)

- **Projeto do jogo**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Production com o Supabase de produção; Preview e Development com o de desenvolvimento), como na seção 2.
- **Projeto do portal**: nenhuma. Não crie variáveis nele (o endereço e a chave pública `anon` da página Temporada ficam em `config`, no código; seção 6).

### 5.4 Cabeçalhos de segurança

- O `vercel.json` da raiz vale **só para o projeto do jogo** (a Vercel lê o `vercel.json` do Root Directory de cada projeto). Ele não vale para o portal e não deve ser copiado para lá.
- O portal tem o seu: `portal/vercel.json`, com CSP mínima para site estático (`default-src 'none'`; só scripts, estilos, imagens e fontes do próprio domínio; `connect-src https://*.supabase.co` (só para a página Temporada ler o ranking; seção 6), sem iframes, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `Cross-Origin-Opener-Policy`, revalidação nas páginas e cache de 1 dia em imagens e fontes. O portal não usa JavaScript inline nem estilos inline (só `/app.js` e `/style.css` do mesmo domínio), por isso não precisa de `unsafe-inline`.
- Verificado localmente: um servidor de teste serviu `portal/dist` com exatamente os cabeçalhos do `portal/vercel.json`, e as páginas `/pt/`, `/en/`, `/pt/pass/` e `/pt/privacy/` foram abertas num Edge real a 1440 px. Nenhuma violação de CSP no console, imagens WebP e fonte carregadas. Não foi verificado na Vercel de verdade (nada foi implantado), nem o `Strict-Transport-Security` sob HTTPS.
- Depois do primeiro deploy de cada projeto, repetir a conferência: abrir o site, olhar o console e os cabeçalhos de resposta.

### 5.5 Ordem sugerida no dia da publicação

1. Criar os dois projetos, apontar o DNS (`<domínio>` e `jogar.<domínio>`), definir as variáveis do jogo (5.3) e o Site URL do Supabase (seção 2).
2. Publicar o jogo, abrir `https://jogar.<domínio>/` e conferir console e cabeçalhos.
3. Preencher `config.playUrl`, remover o `noindex`, rodar `npm run build`, `npm run check` e `node scripts/editorial-check.mjs` em `portal/`, publicar o portal.
4. Só então anunciar. Textos legais (seção 3) antes de qualquer cadastro aberto ao público.

## 6. A página "Temporada" do portal (Passes adquiridos e rankings)

O portal ganhou a página `/pt/season/` e `/en/season/` (item "Temporada" no menu): barra de Passes adquiridos, botão "Comprar o Passe", ranking geral (top 50) e um ranking por profissão (Mineração, Lenhador, Horta). Ela lê os números **direto do Supabase, no navegador**, com a chave pública `anon` e `fetch` simples (sem SDK). Como o portal nunca recebe variáveis de ambiente, os dois valores ficam em `config`, em `portal/src/content.mjs`, e depois são commitados.

Passo a passo (você faz; nada disto foi aplicado ou implantado por quem escreveu o código):

1. **Aplicar a migration `0006`** (`supabase/migrations/0006_portal_meter_and_profession_ranking.sql`) no projeto Supabase, depois da `0005`, e rodar o plano de testes SQL que está no fim do arquivo. Detalhes e controles do dono (meta, abrir a temporada, encerrar): [`SEASON_RANKING.md`](SEASON_RANKING.md) seção 8. Reimplante a função `submit-progress` (ela agora também envia a XP das profissões).
2. **Preencher `config.supabaseUrl`** com o endereço do projeto (`https://<project-ref>.supabase.co`, nada além disso: o build recusa outros endereços) **e `config.supabaseAnonKey`** com a chave **pública `anon`** (painel do Supabase, Project Settings, API). A chave `anon` é pública por desenho: ela já vai no JavaScript do jogo e quem a usa só alcança o que as regras do banco liberam (a função `pass_meter` e as visões de ranking). **A chave de serviço (`service_role` ou `sb_secret_...`) NUNCA vai aqui:** o build falha se detectar uma.
3. **Preencher `config.playUrl`** (como em 5.2). Enquanto for `null`, o botão da página mostra "Em breve" desativado. Preenchido, o botão aponta para `<playUrl>/?comprar=passe`: o jogo abre a janela do Passe depois do login e, **se `VITE_PASS_PURCHASE_ENABLED=true` no projeto do jogo** (e a conta ainda não tiver o Passe), destaca o botão de comprar; **o link nunca inicia o pagamento sozinho: o jogador clica no botão para ir ao Stripe**. Com a variável desligada apenas abre a janela do Passe.
4. **A meta (15.000)** não está no portal: ela vive no banco (`arena_private.season_goal.target`; mude lá, seção 8.3 de `SEASON_RANKING.md`) e o site mostra o número que o servidor informa. **O texto sob a barra** ("Quando chegarmos a {target} Passes, a temporada valendo começa.", em PT e EN) está em `seasonPage.goalLabel` em `portal/src/content.mjs`; `{target}` é substituído pelo número do servidor. Não escreva ali nenhuma promessa nem valor de prêmio: o prêmio é um valor fixo seu e nunca é ligado à quantidade vendida.
5. **CSP:** `portal/vercel.json` agora tem `connect-src https://*.supabase.co` (e nada mais; antes era `'none'`). Isso é necessário para a página funcionar; continue sem `unsafe-inline`. O portal segue sem variáveis de ambiente.
6. Rodar em `portal/`: `npm run build`, `npm run check`, `node scripts/editorial-check.mjs` e `npm run check:season` (verifica a página, o escape de nomes de jogador, o cálculo da barra e a escolha da temporada exibida).

Sem `supabaseUrl`/`supabaseAnonKey` a página abre normalmente e diz "Dados ao vivo indisponíveis no momento.": ela nunca inventa um número. Se o Supabase falhar depois de a página já ter carregado, os números reais ficam na tela com o aviso de que podem estar desatualizados. A página atualiza sozinha a cada 60 s enquanto está aberta. Os nomes dos jogadores são texto escrito por eles: o site os escapa antes de mostrar.

Textos legais: a página não traz valor de prêmio e repete a regra de que a participação é exclusiva de quem tem o Passe. O regulamento continua sendo seu (`SEASON_RANKING.md` seção 7).
