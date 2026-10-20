# Arena Idle — portal público

Site estático público do Arena Idle. Vive em `portal/` dentro do repositório do jogo, mas é independente: tem o próprio package.json e scripts e não depende do build do jogo.

## Executar e verificar

Requer Node.js 22 ou superior. Não há dependências externas para instalar.

```sh
npm run build
npm run check
node scripts/editorial-check.mjs
npm run dev
```

A prévia abre em http://127.0.0.1:4173/pt/ e http://127.0.0.1:4173/en/. Execute o build novamente depois de alterar os arquivos de origem e recarregue a página. A pasta `dist/` é gerada; edite `src/` e `public/`.

## Estrutura

- `src/content.mjs`: glossário, sistemas, grupos, ciclo de progressão, status, roadmap, textos compartilhados, FAQ e registros editoriais.
- `src/pages.mjs`: composição das páginas existentes e navegação PT/EN.
- `src/editorial.mjs`: validação, renderização segura de conteúdo rico, ordenação, arquivo, paginação e links entre publicações.
- `src/style.mjs`: visual e responsividade. Arte, paleta, fontes, logo e favicon continuam provisórios.
- `scripts/build.mjs`: geração estática e validação de conteúdo antes de atualizar `dist/`.
- `scripts/check.mjs`: títulos, idioma, links, âncoras e arquivos locais.
- `scripts/editorial-check.mjs`: verificações do formato editorial com registros de teste que não são publicados.
- `public/season.js` e `public/season-core.js`: página Temporada (barra de Passes e rankings lidos do Supabase com a chave pública; o `core` é puro e testado por `npm run check:season`).
- `public/waitlist.js` e `public/waitlist-core.js`: bloco "Avise-me no lançamento" (Home e Temporada) e página de cancelamento; o `core` é puro e testado por `npm run check:waitlist`. Ver `docs/WAITLIST.md`.
- `public/root.js`: o endereço raiz escolhe o idioma e mantém `?ref=CÓDIGO` dos links de convite.
- `public/app.js`: menu móvel, menus de navegação e fechamento por teclado.
- `public/img/shots/{pt,en}/*.webp`: capturas reais do jogo atual em cada idioma (build offline sem backend, save de meio de jogo de `scripts/sim/smokeSaves.gen.ts`, 1440x900). `public/img/home-*-v2.webp`: artes do dono (arena, taça, carta do Passe). `public/fonts/`: Press Start 2P (a fonte do jogo, licença OFL incluída). `public/favicon-32.png`, `favicon-48.png`, `apple-touch-icon.png` e `img/emblem-192.png`: o emblema do jogo (escudo roxo e dourado do dono).

As 24 páginas PT/EN que já existiam continuam geradas. As áreas editoriais sem publicações permanecem acessíveis pelo endereço, mas não recebem links no menu nem destaque na Home. O menu público oferece apenas Notícias enquanto não houver artigos aprovados. A Home oculta Comunidade até existirem canais configurados.

## Conteúdo e comunicação

O glossário em `src/content.mjs` segue os nomes do próprio jogo (Herói, Habilidades, Equipamento, Masmorra, Profundezas, Paragon, Passe de Aventureiro, Mineração, Lenhador, Horta, Ofícios, Caça, Forja, Pedidos, Códice...). O jogo não tem combate entre jogadores e o portal não o menciona como recurso. Os estados do roadmap são `available`, `development`, `planned` e `future`; suas definições ficam junto dos rótulos. “Disponível” indica existência na versão em desenvolvimento e não anuncia lançamento público.

O ciclo da Home é uma explicação conceitual da progressão, sem fórmulas ou números internos. A Liga da Temporada e o Mercado de jogadores (pronto, abre com a Temporada 1) aparecem no roadmap, sem datas, taxas ou valores além do mínimo do prêmio. Páginas de Política de Privacidade, Termos de Uso e Reembolso e Regulamento da Liga (`/pt/privacy/`, `/pt/terms/`, `/pt/refund/`, `/pt/season-rules/` e as equivalentes em `/en/`) existem apenas como espaço reservado e não têm link no menu nem no rodapé: o texto legal é do responsável pelo jogo.

Para editar publicações, consulte [EDITORIAL.md](EDITORIAL.md). Artigos só entram no site com `published: true`. O build rejeita campos essenciais ausentes, links inseguros, slugs duplicados e estados inválidos. O projeto não contém notícias fictícias.

## Configuração do dono (`config` em `src/content.mjs`)

| Chave | Padrão | Efeito |
| --- | --- | --- |
| `playUrl` | `null` | Endereço HTTPS do jogo. `null`: o botão "Jogar grátis" fica desativado com "Em breve" (nunca aponta para o roadmap). |
| `passSalesOpen` | `false` | Chave única da venda do Passe. `false`: todas as páginas dizem que o Passe está chegando e nenhum preço aparece. `true`: preço (`passPrice`), "Comprar o Passe" (`<playUrl>/?comprar=passe`), pagamento em USDC pela carteira Solana (sem cartão) e link do reembolso. O build exige `playUrl` e o texto do reembolso. |
| `siteUrl` | `null` | Origem pública (https, sem caminho). `null`: links relativos, `noindex`, sem robots.txt/sitemap.xml. Preenchido: canonical/hreflang/Open Graph absolutos, indexação liberada, robots.txt e sitemap.xml gerados. |
| `company` | tudo `null` | `legalName`, `cnpj`, `supportEmail`: aparecem no rodapé só os campos preenchidos. |
| `legalLive` | tudo `false` | `terms`, `privacy`, `refund`, `seasonRules`: o rodapé só linka a página quando a flag é `true` e a entrada em `legal` tem `body` (blocos de EDITORIAL.md). As páginas reservadas continuam sem link. |
| `waitlistEnabled` | `false` | Liga o bloco "Avise-me no lançamento" (Home e Temporada) e a página `/unsubscribe/`. Precisa de `supabaseUrl` e das funções `waitlist-join` / `waitlist-unsubscribe` implantadas (`docs/WAITLIST.md`). `false`: nada é renderizado. |
| `referralEnabled` | `false` | Com `waitlistEnabled`: depois do cadastro aparece "Seu link de convite" (copiar e compartilhar no WhatsApp / X / Telegram) e a lista de recompensas dentro do jogo. As recompensas são entregues pelo servidor (`docs/WAITLIST.md`); ligue só quando for prometê-las. |
| `supabaseUrl` / `supabaseAnonKey` | `null` | Dados ao vivo da Liga da Temporada (só a chave pública anon). |

A competição tem um único nome: **Liga da Temporada** / Season League. "Temporada do Passe" é só a trilha de recompensas dentro do jogo. A página antiga `/pt/championship/` virou um redirecionamento para `/pt/season/`. As imagens de compartilhamento são `public/img/og.jpg` (PT) e `public/img/og-en.jpg` (EN), 1200x630, montadas com a arte da arena e o nome do jogo.

`config.community` permanece vazio até existirem canais oficiais.

Há um rascunho não publicado (`published: false`) em `articles`: "O que mudou no Arena Idle", para revisão do dono. Ele não aparece no site até ser marcado como publicado.

## Estado de revisão

O HTML segue com `noindex,nofollow`. Identidade final, SEO de produção, domínio, endereço Jogar e redes oficiais não foram definidos. As imagens são capturas do jogo; o favicon e o logotipo final ainda são provisórios.

Após a rodada de refinamento: geração de 24 páginas PT/EN, 26 documentos HTML com entrada e 404, links e âncoras válidos, teste editorial, navegação móvel, idioma e verificação de 320, 375, 768, 1024, 1440 e 1920 px. Não houve deploy.
