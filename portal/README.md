# Arena Duel — portal público

Site estático público do Arena Duel. Vive em `portal/` dentro do repositório do jogo, mas é independente: tem o próprio package.json e scripts e não depende do build do jogo.

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
- `public/app.js`: menu móvel, menus de navegação e fechamento por teclado.
- `public/img/*.webp`: capturas reais do jogo atual (build offline, save de meio de jogo, 1440x900). `public/fonts/`: Press Start 2P (a fonte do jogo, licença OFL incluída). `public/favicon.svg`: ícone provisório.

As 24 páginas PT/EN que já existiam continuam geradas. As áreas editoriais sem publicações permanecem acessíveis pelo endereço, mas não recebem links no menu nem destaque na Home. O menu público oferece apenas Notícias enquanto não houver artigos aprovados. A Home oculta Comunidade até existirem canais configurados.

## Conteúdo e comunicação

O glossário em `src/content.mjs` segue os nomes do próprio jogo (Herói, Habilidades, Equipamento, Masmorra, Profundezas, Paragon, Passe de Aventureiro, Mineração, Lenhador, Horta, Ofícios, Caça, Forja, Pedidos, Códice...). O jogo não tem combate entre jogadores e o portal não o menciona como recurso. Os estados do roadmap são `available`, `development`, `planned` e `future`; suas definições ficam junto dos rótulos. “Disponível” indica existência na versão em desenvolvimento e não anuncia lançamento público.

O ciclo da Home é uma explicação conceitual da progressão, sem fórmulas ou números internos. Mercado de jogadores, campeonato de temporada e Steam estão só no roadmap como Planejado, sem datas, regras ou valores. Páginas de Política de Privacidade, Termos de Uso e Regras da Temporada (`/pt/privacy/`, `/pt/terms/`, `/pt/season-rules/` e as equivalentes em `/en/`) existem apenas como espaço reservado e não têm link no menu nem no rodapé: o texto legal é do responsável pelo jogo.

Para editar publicações, consulte [EDITORIAL.md](EDITORIAL.md). Artigos só entram no site com `published: true`. O build rejeita campos essenciais ausentes, links inseguros, slugs duplicados e estados inválidos. O projeto não contém notícias fictícias.

`config.playUrl` fica `null` até o endereço HTTPS oficial ser aprovado. Enquanto isso, o CTA leva ao roadmap. Quando o endereço for fornecido, configure-o ali: o CTA passa a dizer Jogar/Play. `config.community` também permanece vazio; canais oficiais podem ser configurados futuramente.

Há um rascunho não publicado (`published: false`) em `articles`: "O que mudou no Arena Duel", para revisão do dono. Ele não aparece no site até ser marcado como publicado.

## Estado de revisão

O HTML segue com `noindex,nofollow`. Identidade final, SEO de produção, domínio, endereço Jogar e redes oficiais não foram definidos. As imagens são capturas do jogo; o favicon e o logotipo final ainda são provisórios.

Após a rodada de refinamento: geração de 24 páginas PT/EN, 26 documentos HTML com entrada e 404, links e âncoras válidos, teste editorial, navegação móvel, idioma e verificação de 320, 375, 768, 1024, 1440 e 1920 px. Não houve deploy.
