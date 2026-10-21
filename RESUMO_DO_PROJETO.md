# Arena Idle — resumo do projeto (jogo, portal e painel de administração)

Atualizado em 21/10/2026. Este é o documento de entrada para quem (pessoa ou agente de código) vai trabalhar no repositório. Documentos mais antigos, como `GAME_STATE.md`, têm partes desatualizadas: quando discordarem deste resumo, vale este resumo e o código.

## 1. O que é

**Arena Idle** é um RPG idle em pixel art jogado **só no navegador** (computador ou celular). Não haverá versão Steam nem versão PC instalável. O código do app desktop (Electron, `desktop/`) continua no repositório, mas está parado.

O herói progride sozinho enquanto o jogador está fora: caça monstros, minera, corta madeira, cuida da horta, forja equipamentos e desce a masmorra. O jogador volta, recolhe, equipa e decide o próximo passo. A regra de design é "não é um jogo para ficar assistindo": a caça é uma cena pequena no mapa mais o inventário, e a arena com combate animado só aparece na Masmorra.

Monetização: o **Passe de Aventureiro** (US$ 10, pago **só em USDC na rede Solana**) e uma taxa de 5% no **mercado entre jogadores** (itens vendidos em **SOL**, sem custódia: o comprador paga direto à carteira do vendedor). Não há Stripe ativo (o código existe, mas está desligado). Não há NFT nem token próprio.

## 2. Repositório

| Pasta | O que é |
|---|---|
| `src/` | O jogo (React 18 + Vite + TypeScript). Lógica em `src/game/`, telas em `src/components/`, casca/layout em `src/shell/`, textos em `src/locales/pt.json` e `en.json` (sempre manter os dois iguais). |
| `public/assets/` | Sprites, ícones, fundos, músicas e efeitos. Folhas de personagem são PNG 1024×1024 em grade 4×4 (linhas: parado, ataque, dano, morte). |
| `supabase/migrations/` | Banco (Postgres no Supabase), migrações `0001` a `0026`; `0001` a `0025` estão aplicadas no projeto de teste, a `0026` (painel do dono, Passe da temporada) ainda **não**. |
| `supabase/functions/` | Edge Functions (Deno): progresso, materiais, itens, mercado, Passe em USDC, lista de espera, auditor de IA e vigia. Código comum em `_shared/`. |
| `portal/` | Site público (estático, gerado por `node scripts/build.mjs`), com Liga/Temporada, Passe, roadmap, FAQ e cadastro por e-mail. |
| `admin/` | Painel do dono, projeto separado (React + Vite), só leitura. |
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
- **Caça** (`huntingZones.ts`, `huntLifecycle.ts`): fonte principal de materiais e a **única fonte de XP do herói**. Armazena por 6 h (10 h com o Passe).
- **Mineração e Lenhador** (`gathering.ts`, `woodcutting.ts`): minérios e madeira, com níveis próprios.
- **Horta** (`garden.ts`): roda sempre em paralelo.
- **Masmorra** (`dungeon.ts`, `waves.ts`, `depths.ts`): andares, chefes, profundezas; combate animado.
- **Forja** (página própria, igual Ofícios): forjar, melhorar, reparar e gemas. Raridades Comum/Incomum/Raro/Épico/Lendário (Lendário 4% com garantia na 41ª forja de tier 4+).
- **Ofícios**: refino (barras, cabos, couro curtido etc.) e poções.
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
- O pagamento leva um memo SPL (`pa1:pass:<ref>` ou `pa1:sale:<reserva>`); pagamento sem correspondência vai para a fila `payment_exceptions`. Pagar com a mesma carteira que recebe é recusado.

## 7. Portal (`portal/`)

- Site estático gerado a partir de `portal/src/content.mjs` (textos e configuração), `pages.mjs` (páginas) e `style.mjs` (CSS). Fontes e imagens hospedadas no próprio site (a política de segurança da Vercel não deixa carregar de fora).
- Configuração em `config` no `content.mjs`: `playUrl`, `passSalesOpen`, `waitlistEnabled`, `referralEnabled`, `supabaseUrl`, `supabaseAnonKey`, `legalLive`, `company`. Os padrões do repositório deixam cadastro e venda desligados; as checagens exigem isso.
- Página inicial no estilo da arte do dono (arena, troféu, carta do Passe). Menu: Jogo, Sistemas, Temporada, Passe, Roadmap, FAQ, JOGAR.
- Cadastro por e-mail (lista de espera, `docs/WAITLIST.md`): Edge Functions `waitlist-join` e `waitlist-unsubscribe`; precisa dos segredos `PORTAL_ORIGIN` e `WAITLIST_SECRET`. Contato do site: arenaidlesupport@gmail.com. Antes de abrir ao público precisa da política de privacidade aprovada pelo dono (LGPD).
- Contar inscritos: `select count(*) from public.waitlist where unsubscribed_at is null;`

## 8. Painel de administração (`admin/`)

- Projeto separado do jogo, só leitura, para o dono. Páginas: Visão geral, Jogadores, Economia, Mercado, Lendários, Liga, Pagamentos, Lista de espera e IA/Operações.
- Acesso só para quem está em `arena_private.admins`: `insert into arena_private.admins (user_id, note) select id, 'dono' from auth.users where email = '...';`
- Lê o banco por funções `admin_*` (migração `0020`). A migração `0026_admin_pass_season.sql` (a aplicar) faz `admin_overview`, `admin_players` e `admin_player_detail` mostrarem o Passe **válido nesta temporada** e o **histórico de Passes** como duas medidas; a receita continua de todo o período. Enquanto não for aplicada, o painel avisa que só conhece o histórico. A Visão geral abre com «Precisa de atenção», a IA e operação é dividida em estado, incidentes e relatórios, e a casca mostra o ambiente conectado (variáveis públicas `VITE_ADMIN_ENV` e `VITE_ADMIN_PRODUCTION_REF`).
- IA de operações (`0021`, `ai-auditor`, `ops-watchdog`, `docs/AI_OPS.md`): só aconselha e só pode LIGAR pausas; ainda não implantada (precisa de `ANTHROPIC_API_KEY`, `OPS_CRON_SECRET` e webhook).

## 9. Ambientes

- **Supabase de teste**: projeto `ncufhkoyphktvmhmivxa` (plano grátis). Migrações via `npx supabase@2.121.0 db push --yes`; funções via `npx supabase@2.121.0 functions deploy <nome> --project-ref ncufhkoyphktvmhmivxa --use-api` (as de lista de espera com `--no-verify-jwt`). Segredos de Solana em devnet (`SOLANA_RPC_URL`, `SOLANA_CLUSTER=devnet`, `MARKET_FEE_ADDRESS`, `SOLANA_USDC_MINT`), mais `APP_ORIGIN`, `PORTAL_ORIGIN`, `WAITLIST_SECRET`. Um projeto Pro de produção será criado perto do lançamento.
- **Vercel** (equipe "houran"):
  - Jogo de teste: projeto `pixel-arena-tactics`, endereço fixo https://arena-idle-teste.vercel.app. Publicar sempre como prévia (nunca `--prod`) com `--build-env VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... VITE_MARKET_ENABLED=true VITE_SEASON_RANKING_ENABLED=true` e depois `vercel alias set <deploy> arena-idle-teste.vercel.app`.
  - Portal de teste: projeto `arena-idle-portal-teste`, https://arena-idle-portal-teste.vercel.app (publicado com `playUrl` e Supabase de teste preenchidos só na hora, sem commitar).
  - Admin de teste: projeto `arena-idle-admin`, https://arena-idle-admin-teste.vercel.app.
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
