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

Hoje o servidor só **guarda** o save que o cliente envia; ele não valida ouro, itens, sorteios nem tempo. O direito ao Passe de Aventureiro também é decidido pelo cliente (`hasBattlePass` no save). Qualquer pessoa com conhecimentos básicos consegue editar o save e se colocar no topo.

Portanto o ranking com prêmio em dinheiro **não deve ser aberto** antes de TODAS estas etapas estarem prontas, testadas e na ordem abaixo:

1. **Direito ao Passe controlado pelo servidor** (entitlement gravado pelo servidor a partir da compra confirmada; o cliente não escreve esse campo).
2. **Auditoria de snapshots**: o servidor guarda snapshots do progresso, checa a plausibilidade entre eles (crescimento máximo de ouro, XP, itens por intervalo de tempo) e marca contas suspeitas.
3. **Tabelas de temporada** no servidor: inscrição, pontuação e ranking calculados no servidor, nunca enviados pelo cliente.
4. **Congelamento e auditoria manual**: ao fim da temporada o ranking é congelado e os candidatos ao prêmio passam por revisão manual antes de qualquer pagamento.

Até lá, qualquer ranking pode existir apenas como brincadeira, sem prêmio em dinheiro e sem prometer nada ao jogador.
