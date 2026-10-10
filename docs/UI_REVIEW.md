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
| Consumíveis novos sem botão de uso | `InventoryPanel MANUALLY_USABLE` | corrigido: todos os tônicos e o Azeite de Amolar são usáveis; Adubo mostra "Use no canteiro da Horta" |
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
| Ofícios | "Óleo de Amolar" aparecia como "óleo..." (a fonte pixel não tem "Ó" maiúsculo) | `locales pt` | corrigido: renomeado para "Azeite de Amolar". Mesma limitação em "Ébano" e "Madeira Élfica" (aparecem minúsculos): deixado, são nomes antigos |
| Forja (inglês) | Botão "CATALYZE" cortado | `.craft-btn.repair-action-btn` | corrigido |
| Battle Pass | Sem rótulo de qual coluna é Grátis e qual é Premium (celular) | `BattlePassModal.tsx` | corrigido: cabeçalho "Grátis / Premium" no celular (no desktop o cadeado já distingue) |
| Battle Pass (celular) | Nomes de recompensa cortados ("Small Health…", "Refine Cataly…") | `.bp-reward-label` | corrigido: 3 linhas e fonte menor |
| Ofícios (Pó de Refino) | 4 cartões com o mesmo título "1x Pó de Refino" (só a linha de entrada os diferencia) | `OficiosView.tsx` | deixado: a entrada está visível; mudar o título exige decisão de texto |
| Recompensa da Caça | O botão diz "Resgatar e Sair" mesmo quando a peça única fica retida por mochila cheia | `HuntRewardModal` | deixado: o texto vermelho acima já explica; decidir se vira "Resgatar" |
| Pedidos / Missões / Configurações | Nenhum defeito achado nas telas vistas | - | - |

Contagem desta passada: 12 encontrados, 9 corrigidos, 3 deixados.
