# Revisão das interfaces (1280x800 e 390x800)

Método: perfil de desenvolvimento no navegador (localStorage editado, nenhum código de jogo tocado para montar os estados), com uma auditoria por script em cada tela (texto cru de chave de tradução, rolagem horizontal, texto cortado, botão de fechar fora da tela) e captura de tela das telas listadas em "O que foi realmente visto". Nada de screenshot foi gravado no repositório.

## O que foi realmente visto no navegador

| Tamanho | Telas e estados |
|---|---|
| 1280x800 | Personagem (Home), Horta (cheia: crescendo, pronto, adubado, vazio com "plantar novamente", canteiro bloqueado; seletor de plantas), Mineração (com sessão em andamento, tiers liberados e bloqueados), Ofícios (Fornalha), Forja (Forjar / Armas), sidebar completa |
| 390x800 | Personagem (Home), Horta (canteiros e cabeçalho), Mineração (sessão em andamento), Inventário (grade com as plantas novas), tutorial (primeiro passo), menu lateral |
| Ambos (só auditoria por script: chave crua, rolagem horizontal, fora da tela, botão de fechar) | Caça, Masmorra, Missões, Mineração, Lenhador, Horta, Ofícios, Forja, Inventário, Pedidos, Battle Pass, Loja, Configurações |

**Não vistos em captura** (ficam para o diretor / próxima passada): Caça com sessão em andamento e a tela de recompensa, Masmorra (batalha, vitória / derrota / tensão, marco), Forja (Melhorar, Reparo, Gemas, diálogos de confirmação), Inventário (detalhe de arma, peça única, diálogo de expansão da mochila), Pedidos, Battle Pass, Loja, Configurações, Lenhador (só auditoria por script; é a mesma tela da Mineração com outros dados), Ofícios nas outras 5 categorias. A auditoria por script não achou chave crua nem rolagem horizontal em nenhuma delas.

## Defeitos por tela

Legenda: **corrigido** / **deixado** (com o motivo).

### Mineração e Lenhador (`GatheringModal.tsx`, antes `MiningModal` / `WoodcuttingModal`)

| Defeito | Onde | Situação |
|---|---|---|
| Tela esparsa: só uma barra de horas e dois botões; sem XP, sem taxa, sem tempo desde o início | `MiningModal.tsx`, `WoodcuttingModal.tsx` | corrigido: componente único com nível + barra + "27 / 65 XP · faltam 38", rendimento por hora e XP/h, tempo até o próximo nível, armazenamento, cartão da sessão (iniciada há, acumulado, XP), ação primária "Coletar Recursos", todos os tiers com nível e "faltam N níveis" |
| Botão "Minerar aqui" em outro tier durante uma sessão apagava o que já tinha sido minerado | `App.tsx startMining` | corrigido (defeito 1 da auditoria das profissões): vira "Trocar para este tier" e coleta antes |
| "Cancelar" jogava fora o acumulado com um toque | `GatheringModal` | corrigido: pede um segundo toque (com texto "Perder o acumulado?") |
| Nome da tela diferente do menu ("Mina" / "Lenhaçaria" contra "Mineração" / "Lenhador") | `locales mining.title`, `woodcutting.title`, `skillLabel` | corrigido: Mineração e Lenhador em todo lugar (pt e en) |
| Emoji no cabeçalho / textos ("🪨 +n", "🔒 Requer Nível", "📦 Armazém Cheio!") | `locales mining.*`, `woodcutting.*` | corrigido: "+12 minério", texto puro |
| Toast de coleta mostrando "+0 ouro" (Mineração nunca paga ouro) | `App.tsx claimMining` | corrigido: só mostra o ouro quando é maior que zero |
| Rolagem dupla: o corpo rolava dentro do modal e a sessão ficava fixa fora dele | `GatheringModal` | corrigido: sessão e tiers dentro do mesmo corpo que rola, cabeçalho fixo |

### Horta (`GardenModal.tsx`)

| Defeito | Onde | Situação |
|---|---|---|
| Cabeçalho só com "Nível N" e uma barra sem números | `SkillLevelBadge.tsx` | corrigido: XP atual / necessário / faltam, canteiros abertos, próximo canteiro e próxima planta liberada (usado também em Mineração / Lenhador) |
| Cartão bloqueado era um cadeado de emoji e sem nível | `GardenModal Plot` | corrigido: `garden_plot_locked.png` + "Jardinagem Nv 20 / 40" |
| Sem ação de Adubo no canteiro | `GardenModal Plot` | corrigido: botão "Adubar (n)" só com Adubo no inventário; marca "Adubado" |
| Seletor sem XP por colheita e fora de ordem de nível depois das plantas novas | `GardenModal`, `garden.ts PLANTS` | corrigido: ordenado por nível, mostra tempo / colheita / XP |
| Flutuante de colheita com emoji da planta ("+2 🌿 Erva") | `GardenModal harvest` | corrigido: só quantidade e nome |
| Grade fixa de 2 colunas num monitor largo | `.garden-plots` | corrigido: 3 colunas em telas de 1024 px ou mais |
| Títulos com emoji ("🌱 Horta", "🌱 Jardinagem") | `locales garden.title`, `garden.skillLabel` | corrigido |
| Nome da planta quebra em duas linhas ao lado do ícone em 390 px ("Erva / Medicinal") | `.garden-plot-name` | deixado: legível, sem sobreposição; só estético |

### Ofícios e Forja

| Defeito | Onde | Situação |
|---|---|---|
| Rótulos das abas partidos no meio da palavra ("Fornalh / a", "Alquimi / a", "Carpin / taria") | `.oficios-tabs .tab` | corrigido: abas em linha que quebra por aba inteira, sem quebrar palavra |
| Números sem separador de milhar ("5678/5 Minério de Cobre", "Ouro: 123456", custos) | `OficiosView.tsx`, `ForgeModal.tsx`, `HeroPanels.tsx`, `DeliveryModal.tsx` | corrigido: `fmtNum` (novo, `locales/index.ts`) pt-BR "1.234" / en "1,234" |
| Receitas das poções novas (7) | `OficiosView` (Poções) | já listadas pelos dados (`POTION_RECIPES`): nenhum código novo; nomes pt/en conferidos por teste |

### Inventário

| Defeito | Onde | Situação |
|---|---|---|
| Menu diz "Inventário" e a tela dizia "Mochila" | `locales inventory.title` | corrigido: "Inventário" (pt) / "Inventory" (en); "Mochila" continua só como o nome do recipiente em mensagens de espaço |
| Quantidades sem separador de milhar ("×1234") | `InventoryPanel.tsx` | corrigido |
| Consumíveis novos sem botão de uso | `InventoryPanel MANUALLY_USABLE` | corrigido: todos os tônicos e o Óleo de Amolar são usáveis; Adubo mostra "Use no canteiro da Horta" |
| Emoji nos botões ("🗑️ Descartar", "♻️ Desmontar", "💰 Vender", "🎒 Espaço") | `locales inventory.*` | corrigido (emoji removido; os botões já têm texto) |

### Home / Personagem / Menu lateral

| Defeito | Onde | Situação |
|---|---|---|
| Ícone de espadas duplicado no chip de CP ("⚔ ⚔ CP: 613"): o componente e a tradução traziam um cada | `DesktopHome.tsx`, `PersonagemView.tsx`, `locales profile.cp / camp.cp` | corrigido: "CP: 613" |
| Nomes de equipamento cortados com reticências ("Lâmina Flamej...") em 1280 e 390 | `.dh-equip-name` | corrigido: até 2 linhas |
| 8 itens do menu lateral com emoji onde já existe ícone pixel no jogo (Caça, Masmorra, Lenhador, Horta, Ofícios, Forja, Pedidos, Loja) | `App.tsx` nav | corrigido: `demon_claw`, `dragon_flameblade`, `oak_wood`, `common_herb`, `refine_catalyst`, `steel`, `expedition_ticket_2h`, `gold` (os existentes; arte nova não era permitida). Personagem e Configurações ficam com emoji: não há ícone pixel adequado |
| Selo dos buffs na Masmorra só para os dois elixires antigos e com emoji | `BattleModal.tsx` | corrigido: um selo por tônico ativo com o ícone do item e o tempo restante |

### Todas as telas

| Defeito | Onde | Situação |
|---|---|---|
| Título com ícone à frente ficava com o ícone solto no canto esquerdo | `.modal-title` | corrigido: título em flex centralizado (ícone junto do texto) |
| Botões sem hover / pressionado / desabilitado coerentes | `button[data-ui]` | corrigido: regras globais (brilho no hover, 1 px para baixo ao pressionar, cursor "bloqueado" desabilitado, anel de foco visível) |
| Emoji restante em textos onde já há ícone pixel (134 textos de Masmorra, Caça, Forja, Inventário, Configurações já limpos; sobram `ui.*` da arena legada, `quests.*`, `battlePass.*`, `shop.gemCost`) | `locales` | deixado: o texto continua legível e não há ícone pixel equivalente (gemas, troféu, bilhete); revisar com arte nova |
| Botão flutuante de engrenagem no canto inferior direito cobre o último item da lista em 390 px | shim local do `DebugPanel` (`index.html`) | deixado: só existe no build de desenvolvimento, a plataforma injeta o seu |
| Rolagem horizontal em 390 px | todas | nenhuma encontrada (auditoria por script em 13 telas) |
| Botão de fechar inalcançável / armadilha de foco | modais | nenhuma encontrada (botão sempre visível dentro da janela em 390 px; Escape fecha o seletor da Horta primeiro) |
| Chaves de tradução cruas em pt e en | todas | nenhuma encontrada; teste de paridade de chaves e de nomes dos itens novos |

## Contagem

| Tela | Encontrados | Corrigidos | Deixados |
|---|---|---|---|
| Mineração / Lenhador | 7 | 7 | 0 |
| Horta | 8 | 7 | 1 |
| Ofícios / Forja | 3 | 3 | 0 |
| Inventário | 4 | 4 | 0 |
| Home / Personagem / menu | 5 | 5 | 0 |
| Todas as telas | 6 | 4 | 2 |
| **Total** | **33** | **30** | **3** |

---

# Segunda passada (telas que ainda não tinham sido vistas)

Mesmo método (perfil de desenvolvimento, estados montados pelo localStorage; desta vez com as funções reais do jogo importadas pelo navegador para criar equipamento nos 6 slots, peça única, tônicos ativos, sessão de caça parada com recompensa pendente, etc.). Captura de tela de verdade = "visto". Texto lido pelo DOM sem imagem está marcado como "texto".

## O que foi visto, por tamanho

| Tela / estado | 1280x800 | 390x800 |
|---|---|---|
| Caça com sessão rodando e tônicos ativos | visto | auditoria + texto |
| Recompensa da Caça com mochila cheia e 2 peças únicas pendentes | visto | visto (1 única) |
| Recompensa da Caça com espaço na mochila | não visto | não visto |
| Masmorra: entrada, batalha com flutuantes (queimadura / reflexo / regeneração) e selos de tônico, janela de tensão + marco, retrocesso com recompensa de marco, derrota | visto | batalha com selos visto; o resto só no desktop |
| Masmorra: peça única de chefe | não visto (sorteio de 1 chance baixa; a lógica tem teste) | não visto |
| Forja: Forjar, Melhorar, Reparo, Gemas (6 slots equipados) | visto (Gemas e Reparo em captura; Melhorar por texto + clique que aplicou a melhoria) | Forjar visto; as outras abas por texto |
| Forja: diálogos de confirmação | a Forja não tem nenhum: "Catalisar" e "Melhorar" aplicam direto (decisão de projeto, deixado) | idem |
| Ofícios: Fornalha, Poções (12 receitas) | visto | texto |
| Ofícios: Curtume, Alquimia, Carpintaria, Pó de Refino | texto (abas sem corte) | texto |
| Inventário: grade, arma, peça única ("Único"), relíquia, tônico, Adubo, Óleo, Poção do Conhecimento | grade visto, detalhes por texto | grade visto (antes) |
| Inventário: diálogo de expansão da mochila, estado acima do limite | visto | não visto |
| Pedidos | visto | visto de relance (atrás da recompensa) |
| Battle Pass (itens liberados, resgatáveis, bloqueados Premium) | visto | visto |
| Loja | texto | visto |
| Missões | texto | auditoria |
| Configurações e troca pt ⇄ en | texto + auditoria nas duas línguas (sem chave crua) | auditoria |
| Lenhador com sessão ativa | visto | auditoria (mesma tela da Mineração, vista) |
| Menu lateral no celular | - | visto (em pt) |

Auditoria em inglês nas duas larguras, em 14 telas e 3 abas da Forja: nenhuma chave crua, nenhum texto em português, nenhuma rolagem horizontal; botão de fechar sempre dentro da janela.

## Defeitos desta passada

| Tela | Defeito | Onde | Situação |
|---|---|---|---|
| Masmorra (desktop) | Com 4-5 tônicos ativos a faixa de loot ficava larga e espremia o nome do bioma numa coluna de uma letra ("C-a-v-e-r-n-a-s...") | `.battle` grade em `App.css` | corrigido: a faixa de loot ganhou uma linha própria |
| Masmorra | Números flutuantes de dano, reflexo e regeneração se imprimiam um por cima do outro | `.float-reflect`, `.float-heal` | corrigido: colunas separadas |
| Caça / Masmorra | Tônico ativo não aparecia na Caça (só na Masmorra) | `HuntModal.tsx` | corrigido: componente `ActiveBuffs` (ícone, nome, tempo restante) |
| Inventário | Detalhe de um tônico não dizia se estava ativo nem quanto falta | `InventoryPanel.tsx` | corrigido: "Ativo: faltam 24m" |
| Inventário / Loja | Mochila acima do limite (64 / 30) parecia normal | `.inventory-summary-chip` | corrigido: chip vermelho "acima do limite" no Inventário; a Loja segue mostrando "Mochila cheia!" por item |
| Ofícios | "Óleo de Amolar" aparecia como "óleo..." | fonte (veja a terceira passada) | corrigido na terceira passada pela causa, sem renomear nada |
| Forja (inglês) | Botão "CATALYZE" cortado | `.craft-btn.repair-action-btn` | corrigido |
| Battle Pass | Sem rótulo de qual coluna é Grátis e qual é Premium (celular) | `BattlePassModal.tsx` | corrigido: cabeçalho "Grátis / Premium" no celular (no desktop o cadeado já distingue) |
| Battle Pass (celular) | Nomes de recompensa cortados ("Small Health…", "Refine Cataly…") | `.bp-reward-label` | corrigido: 3 linhas e fonte menor |
| Ofícios (Pó de Refino) | 4 cartões com o mesmo título "1x Pó de Refino" (só a linha de entrada os diferencia) | `OficiosView.tsx` | deixado: a entrada está visível; mudar o título exige decisão de texto |
| Recompensa da Caça | O botão diz "Resgatar e Sair" mesmo quando a peça única fica retida por mochila cheia | `HuntRewardModal` | deixado: o texto vermelho acima já explica; decidir se vira "Resgatar" |
| Pedidos / Missões / Configurações | Nenhum defeito achado nas telas vistas | - | - |

Contagem desta passada: 12 encontrados, 9 corrigidos, 3 deixados.

---

# Terceira passada (letras maiúsculas acentuadas, telas restantes, tablet)

## Causa raiz das maiúsculas acentuadas

O subset `latin` da Press Start 2P que o jogo já carrega TEM Á À Â Ã É Ê Í Ó Õ Ú Ç (conferido na tabela cmap do arquivo, `node scripts/fontCoverage.mjs`; o subset `latin-ext` não tem nenhum deles, então empacotá-lo não ajudaria). O problema é o desenho: a fonte encaixa a capital acentuada em 7 linhas, e "Ébano" fica igual a "ébano", "ÓLEO" a "óLEO" (teste a 32 px no navegador). Não é text-transform nem a troca dos dígitos do topo do App.css. A fonte ainda tinha a ligadura "fi" ("Élfica" saía "élfıca").
Correção única em CSS: uma segunda `@font-face` 'Press Start 2P' com `unicode-range: U+00C0-00D6, U+00D8-00DE` apontando para uma monoespaçada em negrito do sistema (Consolas / Menlo / Roboto Mono / Courier New) com `size-adjust: 165%`, o mesmo truque dos dígitos: só essas capitais caem para a fallback, por caractere, com altura de capital e acento. `font-variant-ligatures: none` no body. Verificado nos dois tamanhos: "Ébano", "Madeira Élfica", "Óleo de Amolar", "COMEÇAR", "MINERAÇÃO", "ÁREA", "ÍNDICE" e as 11 capitais acentuadas saem com a capital certa. "Azeite de Amolar" voltou a "Óleo de Amolar" (pt.json e docs).
Regressão: `src/game/__tests__/fonts.test.ts` lê o cmap do arquivo da fonte, exige que todo caractere de pt.json e en.json esteja coberto (fora a lista conhecida de 17 símbolos/emoji que caem para a fonte do sistema: um emoji novo faz o teste falhar) e que a regra de fallback continue no App.css.

## O que foi visto (imagem), por tamanho

| Tela / estado | 1280x800 | 390x800 | 768x1024 |
|---|---|---|---|
| Missões | visto | visto | - |
| Configurações | visto | visto | - |
| Loja | visto | visto (antes) | - |
| Ofícios: Fornalha, Alquimia, Carpintaria, Pó de Refino, Poções | visto (antes: Fornalha, Poções) | visto os 5 (Curtume só por texto: 1 cartão) | - |
| Forja: Melhorar | visto | visto | visto |
| Forja: Reparo, Gemas | visto (antes) | visto | - |
| Inventário: peça única, tônico ativo ("Ativo: faltam 20m"), Adubo, relíquia | visto (Adubo, relíquia) | visto (única, tônico) | visto (tônico) |
| Lenhador com sessão ativa e Poção do Coletor ativa | visto (antes) | visto | - |
| Recompensa da Caça com espaço na mochila | visto (peça única listada, botão "Resgatar e Sair", fecha) | - | - |
| Recompensa da Caça com mochila cheia | visto (antes) | visto | - |
| Masmorra: retrocesso com recompensa de marco | visto (antes) | visto | - |
| Masmorra: batalha e derrota | visto (antes) | visto (batalha) | visto (batalha, derrota) |
| Home | visto | visto | visto |
| Horta (cheia, canteiro bloqueado) | visto (antes) | visto (antes) | visto |
| Queda de peça única de chefe | **impossível sem editar código**: a chance (8%) é lida de `T.battle` no momento do sorteio e o módulo que o navegador importa não é o mesmo objeto que o jogo usa (a URL do módulo muda com o HMR), então mudar a chance pela página não surte efeito; a tela que a mostra é a mesma lista de "Peças únicas" já vista na recompensa da Caça (nos dois tamanhos) | | |

## Defeitos desta passada

| Tela | Defeito | Onde | Situação |
|---|---|---|---|
| Todas | Capitais acentuadas e ligadura "fi" | `App.css` (causa acima) | corrigido |
| Caça | Botão "Resgatar e Sair" quando a peça única fica retida | `HuntRewardModal.tsx` | corrigido: "Resgatar" / "Claim" quando a mochila está cheia; a tela continua aberta com a peça retida |
| Ofícios | 4 cartões "1x Pó de Refino" | `OficiosView.tsx` | corrigido: "Pó de Refino (Minério de Cobre / Farrapo de Couro / Fragmento de Osso / Erva Medicinal)", pt e en, pelo nome do insumo |
| Ofícios (390) | Seis abas em uma linha a 7 px | `.oficios-tabs .tab` | corrigido: duas por linha, fonte legível |
| Forja (390) | Abas a 7 px; nome da peça quebrado no meio ("Flamejan/te") e botões Melhorar / Catalisar espremidos em coluna de 1 letra | `.forge-tabs`, `.craft-card` | corrigido: abas 2x2, botões lado a lado abaixo da peça |
| Forja / Inventário / Horta / Batalha / Loja / Missões (tablet 768) | Janelas com largura de celular (≤ 420 px) no meio de 768 px, nomes quebrados | `App.css` | corrigido: faixa de 600 a 1023 px com larguras de 640 a 720 px; Horta, Forja, Inventário e batalha vistos depois |
| Loja (1280) | Cartões com alturas diferentes, grade irregular | `.shop-body` | deixado: não atrapalha a leitura |
| Missões | "Entrega" nas missões contra "Pedidos" no menu | `locales q_explorer_d` | deixado: uma entrega é o pedido já aceito e despachado, a diferença é intencional |

Contagem desta passada: 8 encontrados, 6 corrigidos, 2 deixados (+ a queda do chefe não verificável).

# Caça (tela dedicada, números reais)

## O que mudou

A Caça é o laço ocioso principal e era a tela mais fraca: quatro cartões densos, profundidade explicada só por losangos coloridos, a caçada em andamento espremida dentro do cartão da zona, sem nenhum número do que o herói ganha. Agora são dois estados.

- **Seleção (nada rodando)**: lista de 4 zonas à esquerda (retrato do monstro, nome, CP recomendado, estado Pronta / CP baixo / Bloqueada, "N de 3 profundidades"), detalhe da zona à direita (monstro com nome, materiais com chip Comum/Refino/Nobre, peças únicas como "raro" sem porcentagem, três opções de profundidade com os números do herói atual, barra do nível da zona, limite de armazenamento, tipos de material da Bolsa, e um único botão "Iniciar Caça" com o motivo escrito nele quando está desabilitado). Celular: lista, depois detalhe com botão Voltar e botão fixo embaixo. Tablet: lista 2x2 em cima, detalhe embaixo.
- **Em andamento**: arena larga no estilo da batalha da Masmorra (fundos `camp` e `arena` já existentes, com um filtro/tom de CSS diferente por zona; sem arte nova), placas de nome (herói; monstro + Nível), pulso de ataque mantido, tônicos ativos sobre a arena; ao lado (ou embaixo) o painel ao vivo: tempo caçado, tempo até encher e barra do limite (estado "Cheio — resgate para continuar"), abates, abates/h, vitórias / derrotas, XP e ouro ganhos, cada material coletado com taxa por hora e perdas por Bolsa cheia em vermelho, peças únicas, barra do nível da zona e promoções desta caçada. "Resgatar" fica fixo no rodapé. Fechar a tela (X ou Esc) não interrompe a caçada.
- **Recompensa**: cabeçalho com zona e monstro, duração (e tempo contado quando o limite foi atingido), XP, ouro, materiais, perdidos, peça única retida (comportamento e textos de antes), promoções de nível.
- **Home e menu lateral**: o cartão "Atividade atual" e um mini cartão sob "Caça" (também no menu do celular) mostram retrato, zona, tempo contado / limite e barra; clicar abre a caçada. O limite agora vem do cálculo do motor (antes era o limite base da zona, errado com o Passe ou quando a caçada já tinha parado de contar).

## Estimativas: de onde vêm os números

`estimateHuntYield` (`src/game/huntEstimate.ts`) roda a própria simulação da Caça (`simulateHuntingSession`, montada pelo mesmo `buildHuntSimSetup` que `computeHuntingStatus` usa) por 4 h com semente fixa, para os atributos atuais do herói, no nível da zona que a save já tem para aquela profundidade (sem promoção durante a projeção), sem poções, tônicos nem Passe. Não escreve na save e não usa `Math.random`. Resultado memoizado por (atributos, bênção, zona, profundidade, nível). Medido contra sessões reais de 1 h (testes): abates/h dentro de 1% (um caso marginal 38 contra 47), XP/h dentro de 1% quando não há derrotas, material comum dentro do ruído de Poisson (33 a 47 reais contra 39 estimados no pior caso). O teste exige 10% em abates e XP e 30% no material mais comum; raros são poucas unidades por hora e não entram na tolerância.

## O que o motor não expõe

- **Abates e derrotas** não eram registrados. Foram adicionados contadores `kills` e `defeats` ao resultado da simulação (só contam; nenhuma decisão, sorteio ou número de recompensa muda, conferido comparando `computeHuntingStatus` antes e depois em 16 casos).
- **Abates na tela de recompensa** não aparecem: `PendingHuntReward` não guarda a contagem e guardá-la mudaria o formato da save. A recompensa mostra duração, tempo contado, XP e ouro.
- **"Trocar de zona"** não existe como ação separada: escolher outra zona durante a caçada só encerra a atual e abre a recompensa (`requestHuntStart`), o mesmo que "Resgatar". Por isso só há "Resgatar".

## O que foi visto (imagem), por tamanho

| Estado | 1280x800 | 768x1024 | 390x800 |
|---|---|---|---|
| Seleção: zona fácil e liberada | visto | visto | visto (lista e detalhe) |
| Seleção: CP baixo para uma profundidade (Profundo travado) | visto | visto | visto |
| Seleção: todas as profundidades travadas por CP | visto | - | visto (lista) |
| Seleção: zona bloqueada por andar | visto | - | - |
| Em andamento: recém-iniciada | - | - | visto |
| Em andamento: meio da sessão com tônicos (Pele de Pedra, Fortuna) | visto | - | visto |
| Em andamento: Bolsa cheia com perdas | visto | - | visto |
| Em andamento: no limite de armazenamento | visto | visto | - |
| Recompensa com espaço | visto | - | - |
| Recompensa com mochila cheia, peça única retida, perdas e promoção | visto | visto | visto |
| Home: cartão "Atividade atual" e mini cartão do menu | visto | - | visto (cartão e menu) |

Escape fecha a tela de seleção; com a caçada rodando só fecha a tela e a caçada continua (visto: o mini cartão do menu segue lá).

## Defeitos desta passada

| Tela | Defeito | Situação |
|---|---|---|
| Home | Cartão da caçada usava o limite base da zona e o tempo bruto, errados com o Passe ativo ou depois do limite | corrigido: usa `computeHuntingStatus` |
| Caça | A lista de Bolsa mostrava `+N` somando o que já estava na Bolsa de sessões anteriores como se fosse ganho da sessão | corrigido: mostra os drops da sessão e as perdas dela |
| Caça | "Iniciar Farm" habilitado em zona sem nenhuma profundidade liberada, nome do monstro ausente, "Domínio ★★★★★" sem informação além do nível | corrigido: botão desabilitado com o motivo, nomes dos monstros, barra de nível (as estrelas eram só o nível dividido por 2) |
