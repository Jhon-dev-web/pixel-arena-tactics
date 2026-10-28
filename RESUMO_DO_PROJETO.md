# Arena Idle — resumo do projeto (jogo, portal e painel de administração)

Atualizado em 21/10/2026. Este é o documento de entrada para quem (pessoa ou agente de código) vai trabalhar no repositório. Documentos mais antigos, como `GAME_STATE.md`, têm partes desatualizadas: quando discordarem deste resumo, vale este resumo e o código.

## 1. O que é

**Arena Idle** é um RPG idle em pixel art jogado **só no navegador** (computador ou celular). Não haverá versão Steam nem versão PC instalável. O código do app desktop (Electron, `desktop/`) continua no repositório, mas está parado.

O herói progride sozinho enquanto o jogador está fora: caça monstros, minera, corta madeira, cuida da horta, forja equipamentos e desce a masmorra. O jogador volta, recolhe, equipa e decide o próximo passo. A regra de design é "não é um jogo para ficar assistindo": a caça é uma cena pequena no mapa mais o inventário, e a arena com combate animado só aparece na Masmorra.

Monetização: o **Passe de Aventureiro** (US$ 10, pago **só em USDC na rede Solana**) e uma taxa de 5% no **mercado entre jogadores** (itens vendidos em **SOL**, sem custódia: o comprador paga direto à carteira do vendedor). O Stripe foi retirado em 28/10 (as Edge Functions foram apagadas; Pix nunca foi feito): resumo guardado em `docs/PAGAMENTOS_DESCARTADOS.md`. Não há NFT nem token próprio.

## 2. Repositório

| Pasta | O que é |
|---|---|
| `src/` | O jogo (React 18 + Vite + TypeScript). Lógica em `src/game/`, telas em `src/components/`, casca/layout em `src/shell/`, textos em `src/locales/pt.json` e `en.json` (sempre manter os dois iguais). |
| `public/assets/` | Sprites, ícones, fundos, músicas e efeitos. Folhas de personagem são PNG 1024×1024 em grade 4×4 (linhas: parado, ataque, dano, morte). |
| `supabase/migrations/` | Banco (Postgres no Supabase), migrações `0001` a `0028`, **todas aplicadas** no projeto de teste. |
| `supabase/functions/` | Edge Functions (Deno): progresso, materiais, itens, mercado, Passe em USDC, lista de espera, auditor de IA, vigia e `admin-delete-user` (apagar conta pelo painel). Código comum em `_shared/`. |
| `portal/` | Site público (estático, gerado por `node scripts/build.mjs`), com Liga/Temporada, Passe, roadmap, FAQ e cadastro por e-mail. |
| `admin/` | Painel do dono, projeto separado (React + Vite): lê quase tudo e tem poucas escritas auditadas (docs/ADMIN.md seção 7). |
| `scripts/` | Simulações de economia/progressão (`scripts/sim`), arte (`scripts/art`), checagens de build. |
| `docs/` | Documentos de projeto: economia, mercado, Passe, temporada, lista de espera, admin, IA. |
| `desktop/` | Electron, parado (sem versão PC). |

## 3. Como rodar e conferir

Na raiz (Node 22+):

- `npm run dev`: jogo local.
- Portões obrigatórios antes de qualquer commit: `npx tsc -b --noEmit`, `npm test` (cerca de 3.000 testes), `npx eslint .` (0 erros), `npm run build`, `npm run check:bundle`, `npm run check:desktop`.
- Simulações: `npm run sim`, `npm run sim:econ`, `npm run sim:market` e outras em `package.json`. Não rebalancear números sem pedido do dono.
- Portal: em `portal/`, `npm run build`, `npm run check`, `npm run check:season`, `npm run check:waitlist`.
- Admin: em `admin/`, `npm run build`, `npm test` (inclui a suíte SQL que roda todas as migrações em PGlite).

## 4. O jogo

### Atividades
- **Caça** (`huntingZones.ts`, `huntLifecycle.ts`): fonte principal de materiais e a **única fonte de XP do herói**. Armazena por 6 h (10 h com o Passe). Desde a Rodada 31 o XP é **por abate** (cada monstro derrotado dá XP, como num RPG; quem mata mais rápido junta mais, com um teto de ritmo contra fuga) e os materiais também saem por abate, com a chance de cada drop (teto econômico por hora no `huntEconomy.ts`).
- **Mineração e Lenhador** (`gathering.ts`, `woodcutting.ts`): minérios e madeira, com níveis próprios.
- **Horta** (`garden.ts`): roda sempre em paralelo.
- **Masmorra** (`dungeon.ts`, `waves.ts`, `depths.ts`): andares, chefes, profundezas; combate animado.
- **Forja** (página própria, igual Ofícios): forjar, melhorar, reparar e gemas. Raridades Comum/Incomum/Raro/Épico/Lendário (Lendário 4% com garantia na 41ª forja de tier 4+).
- **Ofícios**: refino (Fornalha, Curtume, Carpintaria, Pó de Refino) e **Alquimia** (poções e transmutação na mesma aba, desde 22/10).
- **Pedidos** de entrega, **Missões**, **Códice**, **Habilidades**, **Inventário** e **Baú**.

### Regras importantes
- **Uma tarefa por vez**: Caça, Mineração, Lenhador, Masmorra e a produção na Forja/Ofícios ocupam o herói. A Horta é livre.
- **Produção em lote**: Forja e Ofícios têm quantidade (até o máximo que os materiais permitem) e levam 1 s por unidade (`T.crafting.secondsPerUnit`), com barra de progresso; continua com o jogo fechado (`craftJob.ts`).
- **Nada de taxas na tela**: o jogo não mostra porcentagem de drop nem "/h". O jogador sente onde rende mais. Chances da forja, do Selo e da garantia continuam visíveis.
- **Visual do herói por armadura**: cada uma das 8 armaduras troca a folha do herói (`HERO_LOOKS` e `ARMOR_LOOKS` em `gear.ts`; arte nova do dono em `public/assets/spritesheets/hero_*_v2.png` e `hero_dark_knight.png`, montada por `scripts/art/build-hero-sheets.mjs`).
- **Moeda rara**: chama-se **Éter** (en "Aether"); no código e nos saves continua `shards`.
- **Curva de nível**: os primeiros níveis ficaram mais lentos (6 h de caça numa conta nova ≈ nível 14); do nível 27 em diante o ritmo é o original.

### Salvamento (online = servidor)
- O jogo online **não guarda nada do jogo no navegador**. O save fica no Supabase (`characters`); a única porta para o armazenamento do navegador é `src/lib/deviceStore.ts`, e online ela fica só em memória. Preferências (idioma, volume etc.) ficam em `save.prefs`.
- Envio do save: no máximo a cada 45 s se mudou, na hora em eventos importantes e ao fechar a aba.
- O servidor confere o progresso (`submit-progress`, limites em `supabase/functions/_shared/progress/`) e sorteia tudo que vale dinheiro: raridade da forja, drops únicos, quais materiais saem negociáveis.

### Itens e materiais negociáveis
- Equipamento só pode ser vendido se for **Épico, Lendário ou Único**, **nunca equipado** (equipou, fica preso à conta) e **forjado online** (com certificado do servidor). A tela diz o motivo quando não pode.
- Materiais: só os de coleta (Caça, Mineração, Lenhador, Horta) podem vir na versão negociável (o servidor sorteia por coleta). O que é refinado ou produzido nunca vem negociável.
- Peças do Selo do Ferreiro e itens feitos offline nunca são negociáveis.

## 5. Passe de Aventureiro e Temporada

- **Passe**: US$ 10 em USDC (Solana), pagamento único, **válido só para a pré-temporada e a Temporada 1**. Quando a Temporada 2 abrir, as vantagens e o ranking param e é preciso comprar o Passe da nova temporada; o que foi ganho na trilha fica. No servidor, cada Passe tem `valid_through_season` (migração `0025`).
- Vantagens: armazém de 10 h, +15% de ouro, +10% de materiais, mais espaço, trilha premium etc. Quem compra deve sair claramente na frente (não equilibrar até ficarem iguais).
- **Liga da Temporada**: 60 dias, ranking por nível do herói e por profissão, só para quem tem o Passe. Prêmio em dinheiro com **mínimo de US$ 1.000** para os primeiros lugares, podendo crescer conforme mais Passes forem vendidos; divisão e valor final saem no regulamento antes da abertura.
- **Pré-temporada** (agora): teste aberto, sem prêmio. Quando a Liga começar, todos os heróis online recomeçam do zero uma vez; o Passe e o nome continuam. A Liga começa quando a barra de Passes vendidos enche (o número da meta não aparece em lugar nenhum).
- **Convites**: pelo próprio jogo (página "Convidar amigos", link `<jogo>/?ref=CÓDIGO`), sem e-mail. Convite ativo = amigo chegou ao nível 10. Recompensas: título Recrutador (1), moldura (3), título Lenda do Recrutamento (25), Passe grátis quando 10 convidados compram o Passe.

## 6. Mercado

- Só na rede **Solana**. Itens e Bolsas de Ouro com preço em **SOL**; taxa do jogo de 5% para a carteira `MARKET_FEE_ADDRESS`.
- Bolsas de Ouro de 2k / 5k / 20k (taxa de 10% sem Passe, 5% com Passe; 3 por dia).
- Revenda é permitida, sem espera.
- **Piso das Bolsas de Ouro**: US$ 0,25 por 1.000 de Ouro, convertido em SOL pela cotação (`0036`, precisa do segredo `SOL_USD_PRICE_URL`). Itens: só o mínimo geral de 0,001 SOL.
- O pagamento leva um memo SPL (`pa1:pass:<ref>` ou `pa1:sale:<reserva>`); pagamento sem correspondência vai para a fila `payment_exceptions`. Pagar com a mesma carteira que recebe é recusado.

## 7. Portal (`portal/`)

- Site estático gerado a partir de `portal/src/content.mjs` (textos e configuração), `pages.mjs` (páginas) e `style.mjs` (CSS). Fontes e imagens hospedadas no próprio site (a política de segurança da Vercel não deixa carregar de fora).
- Configuração em `config` no `content.mjs`: `playUrl`, `passSalesOpen`, `waitlistEnabled`, `referralEnabled`, `supabaseUrl`, `supabaseAnonKey`, `legalLive`, `company`. Os padrões do repositório deixam cadastro e venda desligados; as checagens exigem isso.
- Página inicial no estilo da arte do dono (arena, troféu, carta do Passe). Menu: Jogo, Sistemas, Temporada, Passe, Roadmap, FAQ, JOGAR.
- Cadastro por e-mail (lista de espera, `docs/WAITLIST.md`): Edge Functions `waitlist-join` e `waitlist-unsubscribe`; precisa dos segredos `PORTAL_ORIGIN` e `WAITLIST_SECRET`. Contato do site: arenaidlesupport@gmail.com. Antes de abrir ao público precisa da política de privacidade aprovada pelo dono (LGPD).
- Contar inscritos: `select count(*) from public.waitlist where unsubscribed_at is null;`

## 8. Painel de administração (`admin/`)

- Projeto separado do jogo, para o dono. Páginas: Visão geral, Jogadores, Economia, Mercado, Lendários, Liga, Pagamentos, Lista de espera, Códigos e IA/Operações. Escritas (só admin, no servidor, auditadas em `arena_private.admin_audit`, confirmadas na tela; migração `0027`): apagar conta (Edge Function `admin-delete-user`, segredo `ADMIN_ORIGIN`), ativar/revogar o Passe de uma conta, gerar/desativar códigos promocionais (o jogador resgata em Configurações; o dono escolhe o prêmio: Passe da temporada, Ouro (até 1.000.000), Éter (até 10.000) ou Poção (19 tipos, até 100). Passe de código conta para o ranking e não conta como venda. Ouro/Éter/poções viram crédito do servidor (`arena_private.server_credits`, migração `0028`) que o jogo resgata uma vez e que a checagem de progresso desconta; itens de mercado nunca são prêmio).
- Acesso só para quem está em `arena_private.admins`: `insert into arena_private.admins (user_id, note) select id, 'dono' from auth.users where email = '...';`
- Lê o banco por funções `admin_*` (migração `0020`). A migração `0026_admin_pass_season.sql` faz `admin_overview`, `admin_players` e `admin_player_detail` mostrarem o Passe **válido nesta temporada** e o **histórico de Passes** como duas medidas; a receita continua de todo o período. A Visão geral abre com «Precisa de atenção», a IA e operação é dividida em estado, incidentes e relatórios, e a casca mostra o ambiente conectado (variáveis públicas `VITE_ADMIN_ENV` e `VITE_ADMIN_PRODUCTION_REF`).
- IA de operações (`0021`, `ai-auditor`, `ops-watchdog`, `docs/AI_OPS.md`): só aconselha e só pode LIGAR pausas. **Implantada no teste em 21/10**: segredos `ANTHROPIC_API_KEY` e `OPS_CRON_SECRET` postos pelo dono, pg_cron/pg_net ligados, 4 agendamentos (vigia a cada 5 min, IA de hora em hora e diária às 09:15 UTC, limpeza diária). Falta o webhook do Discord (`OPS_ALERT_WEBHOOK_URL`), que o dono quer fazer depois.

## 9. Ambientes

- **Supabase de teste**: projeto `ncufhkoyphktvmhmivxa` (plano grátis). Migrações via `npx supabase@2.121.0 db push --yes`; funções via `npx supabase@2.121.0 functions deploy <nome> --project-ref ncufhkoyphktvmhmivxa --use-api` (as de lista de espera com `--no-verify-jwt`). Segredos de Solana em devnet (`SOLANA_RPC_URL`, `SOLANA_CLUSTER=devnet`, `MARKET_FEE_ADDRESS`, `SOLANA_USDC_MINT`), mais `APP_ORIGIN`, `PORTAL_ORIGIN`, `WAITLIST_SECRET`, `ADMIN_ORIGIN`, `ANTHROPIC_API_KEY`, `OPS_CRON_SECRET`. Claude **não consegue gravar segredos** (o modo automático bloqueia): o dono põe no painel do Supabase; nunca peça a chave pelo chat. Um projeto Pro de produção será criado perto do lançamento.
- **Vercel** (equipe "houran"):
  - Jogo de teste: projeto `pixel-arena-tactics`, endereço fixo https://arena-idle-teste.vercel.app. O build automático por push está desligado (`vercel.json` `git.deploymentEnabled: false`): ele saía sem as variáveis do mercado e gastava a cota grátis de 100 publicações por dia. Antes de `vercel alias set`, confira que o deploy terminou e devolveu uma URL. Publicar sempre como prévia (nunca `--prod`) com `--build-env VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... VITE_MARKET_ENABLED=true VITE_SEASON_RANKING_ENABLED=true` e depois `vercel alias set <deploy> arena-idle-teste.vercel.app`.
  - Portal de teste: projeto `arena-idle-portal-teste`, https://arena-idle-portal-teste.vercel.app (publicado com `playUrl` e Supabase de teste preenchidos só na hora, sem commitar).
  - Admin de teste: projeto `arena-idle-admin` (pasta `admin/`), https://arena-idle-admin-teste.vercel.app. Publicar de dentro de `admin/` com `--build-env VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... VITE_ADMIN_ENV=teste` e `vercel alias set`. Na cópia limpa (`git archive HEAD admin`), apague `tests/` antes do deploy: um teste importa de `supabase/functions`, que não sobe junto, e o `tsc` do build falha. Use `npx vercel@65.0.0` (a versão mais nova do CLI falhou ao instalar em 22/10). Ferramentas › "Prêmio do playtest" lista o Top 25 por nível (migração 0037).
  - A proteção da Vercel foi **desligada** no projeto do jogo (amigos jogam pelo link). A chave anon pública sai de `npx supabase@2.121.0 projects api-keys --project-ref ncufhkoyphktvmhmivxa -o json` (filtrar `anon`).
  - Ao publicar, pegue a URL do deploy do próprio output do comando: o push no GitHub também gera um deploy de prévia SEM as variáveis (não use esse).
- Branch de trabalho: `claude/project-thread-ppdm57` (base `develop`).

## 10. Regras para quem mexer no código

- Responder ao dono em **português**, de forma simples.
- Não salvar nada do jogo no navegador (só `deviceStore.ts`).
- Não mostrar taxas de drop nem "/h".
- Não prometer PvP nem criptomoeda/token nos textos públicos; PvP só no roadmap como possibilidade.
- Toda tela nova segue o estilo do modelo do mercado do dono: fonte Departure Mono no texto, Press Start 2P só em títulos, quatro tamanhos de letra, interface que passe confiança.
- Ao testar no navegador, fechar todas as abas depois (a música do jogo continua tocando).
- Ações irreversíveis (produção, banco de produção, apagar dados, mensagens para fora) só com pedido explícito do dono.
- Documentos de detalhe: `docs/WEB_LAUNCH.md`, `docs/MARKET_SOLANA.md`, `docs/PASS_SALES.md`, `docs/SEASON_RANKING.md`, `docs/WAITLIST.md`, `docs/ADMIN.md`, `docs/AI_OPS.md`, `docs/BALANCE_CHANGES.md`.

## 11. Estado em 28/10/2026 (passagem de thread DIRETOR)

Nada novo foi commitado entre 22/10 e 28/10. O último commit desta frente é `5731c40` (22/10). O jogo está em **congelamento de conteúdo** desde 22/10 (decisão do dono): até o lançamento, só correção de erro; conteúdo novo só depois, com dados de jogadores reais.

### No ar no teste (https://arena-idle-teste.vercel.app)
- **Jogo completo para o playtest de 31/10**: Caça, Masmorra, Mineração, Lenhador, Horta, Forja, Ofícios, Pedidos, Missões, Códice, Habilidades, Inventário/Baú, Passe, Mercado, Convites, Calendário.
- **Mudanças de 21–22/10 já publicadas:**
  - **XP por abate na Caça** (Rodada 31): cada monstro dá XP; quem mata mais rápido ganha mais, com teto de 1,2x o ritmo da zona. O jogador médio sobe no mesmo ritmo de antes.
  - **Faro (Caçador)** = +10%, igual ao Passe (Rodada 30).
  - **Kit Pioneiro** (migração `0033`): título Pioneiro, Moldura de Pioneiro, 500 de Ouro, 10 poções de cura e 1 Elixir do Conhecimento para quem chegou ao nível 10 na pré-temporada (conferido pelos snapshots do servidor), entregue sozinho na abertura da Temporada 1.
  - **Calendário de eventos** (migração `0035`, `docs/EVENT_CALENDAR.md`): Festival de Abertura 31/10–02/11; evento de herói toda sexta 18h a domingo; dia de profissão toda quarta, até o fim de dezembro; 6 eventos novos nos dias 1–24 da Liga; tela "Calendário" no menu. As datas ficam na tabela `arena_private.event_calendar` (o dono muda por SQL, sem publicar o jogo).
  - **Telas refeitas**: Personagem (mockup do dono: equipamentos compactos, Inventário/Baú logo abaixo, ficha do item ao lado); trilha do Passe acima das vantagens; Mineração/Lenhador com "Armazém cheio"; Ofícios em lista + ficha (Poções agora dentro de **Alquimia**); segunda passada em Habilidades, Missões, Horta, Caça, Acampamento, Pedidos, Loja, Convites e Configurações; larguras de tablet conferidas; primeiros minutos do jogador novo revisados (tutorial e dicas).
  - **Mercado**: cada ação vai ao servidor e atualiza a tela na hora; pagamento conferido com o compromisso `confirmed` da Solana (1–2 s); a assinatura do pagamento fica guardada no aparelho até o servidor confirmar (única exceção aprovada à regra de não guardar nada no navegador); item reservado no reset da Liga é anulado (`0032`); não se apaga conta no meio de uma venda (`0031`).
  - **Piso da Bolsa de Ouro** (migração `0036`): US$ 0,25 por 1.000 de Ouro (pequena US$ 0,50, média 1,25, grande 5,00), convertido em SOL pela cotação. **Itens não têm piso** (decisão do dono).
- **Servidor de teste**: migrações aplicadas até **`0036`**.
- **Painel** (https://arena-idle-admin-teste.vercel.app): é da **thread do painel do administrador** (aberta em 22/10). Esta thread DIRETOR não mexe em `admin/`.

### Pendente — esperando o dono
- **Aplicar `0037` e `0038` no banco de teste** (precisa da autorização dele): `0037` = Top 25 por nível no painel (thread do painel); `0038` = tarefa do Discord. `db push` aplica as duas juntas, na ordem.
- **Tarefa do Discord** (`docs/DISCORD_TASK.md`, código pronto em `5731c40`): ele cria o app no portal do Discord e põe `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` e `DISCORD_GUILD_ID` no Supabase, e manda o link de convite do servidor (vai em `VITE_DISCORD_INVITE_URL` no build do jogo). Depois: implantar `discord-link-start` (com JWT) e `discord-link-callback` (`--no-verify-jwt`) e republicar o jogo. Prêmio: 500 de Ouro, entregue na abertura da Temporada 1. Em 28/10 os segredos ainda não existiam.
- **`SOL_USD_PRICE_URL`** no Supabase (valor público: `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd`). Sem ele, o servidor recusa anunciar Bolsas de Ouro. Em 28/10 ainda não existia.
- **Produção para 31/10**: plano Pro do Supabase + projeto `arena-idle-producao` (região São Paulo), carteira Solana real, endereço oficial do site. Ele disse que são simples; assim que tiver, montar o servidor de produção (migrações 0001–0038, funções, segredos) e publicar.
- **Textos legais**: termos de uso e regulamento da Liga, **com critério de desempate perto do nível 100** (a simulação mostrou que o topo fica apertado).
- **Prêmio do playtest**: os **25 heróis de nível mais alto** ganham o Passe, por mérito (**nunca sorteio**: no Brasil, sorteio promocional exige autorização do governo). Data de corte ainda não definida. Entrega pelo painel (thread do painel).
- **Códigos de divulgação** (código postado no X/Discord e resgatado no jogo): "depois veremos". Lembrar: o Ouro da pré-temporada zera na abertura da Liga, então prêmio em Ouro precisa cair depois da abertura (como o Kit Pioneiro).

### Decisões do dono que ainda estão abertas
- Mineração e Lenhador darem XP de herói (hoje dividir o tempo com eles custa cerca de 14 níveis em 60 dias).
- Quinta zona de Caça para a segunda metade da temporada (do dia ~30 ao 60 o herói fica na zona 4).
- Preço do Passe da Temporada 2.
- Pagamento por cartão: o Stripe foi **retirado em 28/10** (funções apagadas; resumo em `docs/PAGAMENTOS_DESCARTADOS.md`); o Passe é só com carteiras (USDC). Pix nunca foi feito e não vai ter. Botão "Comprar SOL com Pix": recomendada a MoonPay (Ramp de reserva), não é para 31/10. Vender SOL dentro do jogo foi descartado (regras do Banco Central).
- Pontos de interface que ele decide: "Resgatar tudo [Passe]" desabilitado para quem não tem Passe; "Resgatar e Sair" não sai da Caça; duas confirmações ao recuar na Masmorra; Passe grátis mostra 11 vantagens antes da trilha. A Forja do primeiro item (corrente longa de materiais) ele decidiu **deixar como está**.

### Estudos e documentos desta fase
- Estimativas de lançamento (Claude Doc): https://claude.ai/artifact/12TuEjxi3sFxzE3SfQQxbZ — cenário realista ~6.000 cadastros, ~120 Passes, ~US$ 1.600 em 60 dias com pagamento só em cripto.
- Simulação de 100 jogadores (Claude Doc): https://claude.ai/artifact/Fgd54HnWShtk3V5LfT4mPM — frequência de jogo pesa mais que a build; Passe ≈ +8 níveis no dia 60 (90% vem do armazém de 10 h); gastar no mercado ajuda pouco; jogador grátis compete; Guardião domina a Masmorra e Caçador a Caça. Revalidada em 22/10 com XP por abate + eventos: ritmo certo, e nenhum jogador honesto é marcado pelo antifraude (pior caso 0,59 do limite).
- Ordem das publicações no Discord/X (Claude Doc): https://claude.ai/artifact/SbE4ibamScuFkfSWDeS4UC — 12 posts em formato de diário de desenvolvimento; nunca prometer ganho nem publicar preço de item. Artes de posts feitas por outra thread em `docs/marketing/discord/` (não versionado).
- `melhorias.md`, `docs/REVISAO_INTERFACES_JOGO.md` e `docs/mockups/` (não versionados): revisões e mockups externos; o que foi aprovado já está feito.

### Como trabalhar (o que funcionou)
- O dono escreve em português e costuma sair para trabalhar dizendo "você está no comando": publicar no **ambiente de teste** é esperado, inclusive banco e funções de teste. Produção, dinheiro real e regras do jogo só com decisão dele.
- Diretor (Opus) planeja e revisa; executores (subagentes Sonnet) fazem. Dizer a cada executor quais arquivos pode tocar, que não faça commit, e que feche abas e servidores no fim.
- **Publicar sempre de uma cópia limpa do commit** (`git archive HEAD | tar -x -C <pasta temporária>` e copiar `.vercel/`), porque outras threads deixam arquivos pela metade na pasta; conferir `"status": "ok"` no output antes do `vercel alias set`.
- Commits: `git add` só dos próprios arquivos e `git pull --rebase --autostash` antes do push.

### Armadilhas aprendidas
- Publicar artifact/link: primeiro publicar, depois usar a URL do resultado (nunca adivinhar).
- Fechar todas as abas do navegador integrado depois de testar (a música do jogo continua tocando para o dono).
- Executores que tiram screenshots com Edge/Chrome headless podem deixar centenas de processos abertos (perfil `arena-shot-*`), e aí os testes estouram o tempo: conferir e encerrar só os processos `--headless` com esse perfil.
- Testes SQL em PGlite rodam como superusuário: permissões de `anon`/`authenticated` precisam de teste explícito com `set role`.
- Windows com `core.autocrlf=true`: testes que fazem `split('\n')` em arquivos do repo devem usar `/\r?\n/`.
- `supabase db dump` precisa de Docker (não há); faça migrações idempotentes com bloco de rollback no cabeçalho.
- Migração nova que lê `reset_at` precisa entrar na lista do `migration0009.test.ts`.
- A cota grátis da Vercel é de 100 publicações por dia; o build automático por push está desligado por isso.
- O executor que apaga "arquivos de rascunho" pode apagar trabalho do diretor: dizer explicitamente quais caminhos ele pode tocar.
