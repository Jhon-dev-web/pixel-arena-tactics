export const localized = (pt, en) => ({ pt, en });
const l = localized;
// playUrl stays null until the owner approves the official address of the game; community stays empty until official channels exist.
export const config = { playUrl: null, community: [], brand: 'Arena Duel', pageSize: 8 };
// Player-facing glossary, reused throughout the portal. Terms follow the game's own locale files.
export const glossary = {
  hero: l('Herói', 'Hero'), heroProgression: l('Progressão do Herói', 'Hero Progression'),
  skills: l('Habilidades', 'Skills'), gear: l('Equipamento', 'Gear'), dungeon: l('Masmorra', 'Dungeon'),
  depths: l('Profundezas', 'The Depths'), paragon: l('Paragon', 'Paragon'),
  pass: l('Passe de Aventureiro', 'Adventurer’s Pass'), mining: l('Mineração', 'Mining'), woodcutting: l('Lenhador', 'Woodcutting'),
  gardening: l('Horta', 'Garden'), crafting: l('Ofícios', 'Crafting'), hunting: l('Caça', 'Hunting'),
  craft: l('Forja', 'Forge'), upgrade: l('Melhoria', 'Upgrade'), reforge: l('Reforja e Lapidar', 'Reforge and Lapidar'), gems: l('Gemas', 'Gems'),
  consumables: l('Poções, elixires e tônicos', 'Potions, elixirs and tonics'),
  orders: l('Pedidos', 'Orders'), codex: l('Códice', 'Codex'), quests: l('Missões e conquistas', 'Quests and achievements'),
  trade: l('Comércio e itens', 'Trade and items'), welcomeBack: l('Resumo ao voltar', 'Welcome-back summary'),
};
export const states = {
  available: { label: l('Disponível', 'Available'), definition: l('Já existe na versão atual do Arena Duel.', 'Already part of the current version of Arena Duel.') },
  development: { label: l('Em desenvolvimento', 'In development'), definition: l('Está sendo trabalhado ativamente.', 'Currently being worked on.') },
  planned: { label: l('Planejado', 'Planned'), definition: l('Faz parte da direção atual do projeto, mas ainda não tem data nem regras definidas. Alguns itens estão em estudo.', 'Part of the current direction, with no date and no defined rules yet. Some items are still under study.') },
  future: { label: l('Visão futura', 'Future vision'), definition: l('Ideias e sistemas que poderão fazer parte da evolução do Arena Duel.', 'Ideas and systems that may become part of Arena Duel as it evolves.') },
};
// Screenshots taken from the current game (offline build, prepared mid-game save, 1440x900).
export const shots = {
  dungeon: { file: '/img/dungeon.webp', width: 1440, height: 900, alt: l('Combate na Masmorra: o herói de armadura enfrenta um chefe orc no andar 50 das Catacumbas Esquecidas, com os números de dano na tela.', 'Dungeon combat: the armored hero fights an orc boss on floor 50 of the Forgotten Catacombs, with damage numbers on screen.'), caption: l('Masmorra: andares, chefes e combate automático.', 'Dungeon: floors, bosses and automatic combat.') },
  hero: { file: '/img/hero-panel.webp', width: 1440, height: 900, alt: l('Painel do Herói com o retrato, o nível, os sete espaços de equipamento preenchidos e a relíquia vazia.', 'Hero panel with the portrait, level, the seven gear slots filled and an empty relic slot.'), caption: l('Herói: sete espaços de equipamento e uma relíquia.', 'Hero: seven gear slots and a relic.') },
  hunt: { file: '/img/hunt.webp', width: 1440, height: 900, alt: l('Tela de Caça em andamento no Pântano de Sangue, com o herói enfrentando um monstro, o progresso da caçada e os materiais coletados.', 'Hunt in progress in the Blood Marsh, with the hero fighting a monster, the hunt progress and the materials gathered.'), caption: l('Caça: o herói luta e coleta materiais mesmo com o jogo fechado.', 'Hunting: your hero fights and gathers materials even while the game is closed.') },
  zones: { file: '/img/hunt-zones.webp', width: 1440, height: 900, alt: l('Seleção de zonas de Caça com quatro zonas, os materiais e as peças únicas de cada uma e as três profundidades.', 'Hunting zone selection with four zones, the materials and unique pieces of each one and the three depths.'), caption: l('Quatro zonas de Caça, cada uma com materiais e peças únicas próprios.', 'Four hunting zones, each with its own materials and unique pieces.') },
  forge: { file: '/img/forge.webp', width: 1440, height: 900, alt: l('Tela da Forja com as abas Forjar, Melhorar, Reparo e Gemas, categorias de equipamento e receitas com seus materiais.', 'Forge screen with the Forge, Upgrade, Repair and Gems tabs, gear categories and recipes with their materials.'), caption: l('Forja: receitas, melhorias, reparo e gemas.', 'Forge: recipes, upgrades, repair and gems.') },
  skills: { file: '/img/skills.webp', width: 1440, height: 900, alt: l('Tela de Habilidades com os três caminhos, Guerreiro, Guardião e Caçador, e a descrição do Golpe Esmagador.', 'Skills screen with the three paths, Warrior, Guardian and Hunter, and the description of the Crushing Blow.'), caption: l('Habilidades: três caminhos, cada um com golpes próprios.', 'Skills: three paths, each with strikes of its own.') },
  codex: { file: '/img/codex.webp', width: 1440, height: 900, alt: l('Códice com abas de equipamento, materiais e monstros e quadros de armas e armaduras ainda por descobrir.', 'Codex with gear, materials and monsters tabs and tiles of weapons and armor still to be discovered.'), caption: l('Códice: o registro de tudo o que você já descobriu.', 'Codex: a record of everything you have discovered.') },
};
export const systems = [
  { id: 'hero', term: 'heroProgression', body: l('O Herói sobe de nível, distribui pontos de atributo e ganha cada vez mais poder. Depois do nível 100, o Paragon continua a evolução.', 'Your Hero gains levels, spends attribute points and grows stronger. After level 100, Paragon keeps the progression going.') },
  { id: 'skills', term: 'skills', body: l('Três caminhos: Guerreiro (dano, críticos e sangria), Guardião (defesa, bloqueio e reflexo) e Caçador (ritmo e economia). Cada um tem golpes com nome, como Golpe Esmagador, Sangria, Muralha e Último Bastião.', 'Three paths: Warrior (damage, crits and bleeding), Guardian (defense, block and reflect) and Hunter (pace and economy). Each has named strikes, such as Crushing Blow, Bleed, Bulwark and Last Bastion.') },
  { id: 'gear', term: 'gear', body: l('Equipamento forjado em sete espaços, mais uma relíquia. As peças têm tiers e raridades (Comum, Raro, Épico e Lendário), e conjuntos de peças da mesma família dão bônus extras. Peças únicas vêm das zonas de Caça e dos chefes.', 'Crafted gear in seven slots, plus a relic. Pieces have tiers and rarities (Common, Rare, Epic and Legendary), and matching pieces of the same family give set bonuses. Unique pieces come from hunting zones and bosses.') },
  { id: 'upgrade', term: 'upgrade', body: l('A Melhoria fortalece uma peça nível a nível. Peças podem quebrar com o uso e precisam de reparo.', 'Upgrade strengthens a piece level by level. Gear wears down with use and needs repair.') },
  { id: 'reforge', term: 'reforge', body: l('A Reforja sorteia de novo os atributos extras de uma peça. O Lapidar, para peças Épicas e Lendárias, deixa você escolher um atributo para manter e sortear os outros.', 'Reforge rerolls the extra stats of a piece. Lapidar, for Epic and Legendary pieces, lets you choose one stat to keep while the others are rolled again.') },
  { id: 'gems', term: 'gems', body: l('Gemas são engastadas nos encaixes das peças e podem ser devolvidas ao estoque quando a peça é desmontada.', 'Gems are socketed into pieces and return to your stock when a piece is salvaged.') },
  { id: 'mining', term: 'mining', body: l('Extraia minérios por tempo, mesmo com o jogo fechado. A maestria na profissão desbloqueia minérios e vantagens.', 'Mine ore over time, even while the game is closed. Mastery unlocks new ores and perks.') },
  { id: 'woodcutting', term: 'woodcutting', body: l('Reúna madeira para a Forja e para as receitas de Ofícios. A maestria libera madeiras melhores.', 'Gather wood for the Forge and for Crafting recipes. Mastery unlocks better woods.') },
  { id: 'gardening', term: 'gardening', body: l('Plante e colha ervas e outros ingredientes nos canteiros. Eles viram poções, tônicos e peças de equipamento.', 'Plant and harvest herbs and other ingredients in your plots. They become potions, tonics and pieces of gear.') },
  { id: 'crafting', term: 'crafting', body: l('Refino, alquimia e outras receitas transformam materiais brutos em barras, couro, pó de refino e consumíveis.', 'Refining, alchemy and other recipes turn raw materials into bars, leather, refining dust and consumables.') },
  { id: 'hunting', term: 'hunting', body: l('A Caça tem quatro zonas: Clareira dos Pequenos Demônios, Pântano de Sangue, Fenda Demoníaca e Abismo de Sangue Ancestral. Cada zona tem profundidades, níveis próprios, materiais e peças únicas, e a caçada continua com o jogo fechado.', 'Hunting has four zones: Glade of Lesser Demons, Blood Marsh, Demonic Rift and Ancestral Blood Abyss. Each zone has depths, levels of its own, materials and unique pieces, and the hunt keeps going while the game is closed.') },
  { id: 'dungeon', term: 'dungeon', body: l('A Masmorra tem 100 andares em quatro regiões, com chefes nos andares 25, 50, 75 e 100. Em marcos você decide entre recuar e sacar a recompensa ou avançar correndo o risco.', 'The Dungeon has 100 floors across four regions, with bosses on floors 25, 50, 75 and 100. At milestones you choose between retreating with the reward or pushing onward at a risk.') },
  { id: 'depths', term: 'depths', body: l('Depois do chefe do andar 100 abrem-se as Profundezas: andares sem fim, cada um mais forte que o anterior, com chefes que soltam peças únicas e relíquias raras.', 'After the floor 100 boss, the Depths open: endless floors, each stronger than the last, with bosses that drop unique pieces and rare relics.') },
  { id: 'craft', term: 'craft', body: l('Na Forja, materiais viram armas, armaduras, elmos, luvas, botas, anéis, escudos e relíquias, em receitas que pedem nível e itens da etapa anterior.', 'In the Forge, materials become weapons, armor, helmets, gloves, boots, rings, shields and relics, through recipes that ask for level and pieces from the previous step.') },
  { id: 'consumables', term: 'consumables', body: l('Poções de vida, elixirs de combate e tônicos temporários ajudam em momentos específicos, e o herói usa poções sozinho na Masmorra.', 'Health potions, battle elixirs and temporary tonics help in specific moments, and your hero drinks potions automatically in the Dungeon.') },
  { id: 'orders', term: 'orders', body: l('Pedidos são entregas que consomem materiais e continuam com o jogo fechado, pagando Ouro e XP.', 'Orders are deliveries that take materials and keep going while the game is closed, paying Gold and XP.') },
  { id: 'trade', term: 'trade', body: l('O mercador compra o excesso por pouco, e o Mercador Atacadista compra materiais em quantidade depois de um chefe da Masmorra. Equipar uma peça a vincula a você. Quando o mercado de jogadores existir, apenas peças Épicas, Lendárias ou únicas sem vínculo e as Bolsas de Ouro poderão ser negociadas.', 'The merchant buys surplus for little, and the Wholesale Merchant buys materials in bulk after a Dungeon boss. Equipping a piece binds it to you. When the player market exists, only unbound Epic, Legendary or unique pieces and Gold Pouches will be tradeable.') },
  { id: 'quests', term: 'quests', body: l('Missões diárias e semanais, sequência de login e uma lista longa de conquistas, com títulos para exibir no perfil.', 'Daily and weekly goals, a login streak and a long list of achievements, with titles to show on your profile.') },
  { id: 'codex', term: 'codex', body: l('O Códice registra equipamento, materiais e monstros descobertos, com a origem de cada item.', 'The Codex records the gear, materials and monsters you have discovered, with the origin of each item.') },
  { id: 'welcomeBack', term: 'welcomeBack', body: l('Ao voltar ao jogo, um resumo mostra o que aconteceu enquanto você estava fora.', 'When you return, a summary shows what happened while you were away.') },
];
export const groups = [
  { id: 'hero-gear', status: 'available', shot: 'skills', title: l('Herói e equipamento', 'Hero and gear'), body: l('O Herói evolui com atributos e habilidades, e as peças que ele usa evoluem com Melhoria, Reforja, Lapidar e gemas.', 'Your Hero grows through attributes and skills, and the pieces he wears grow through Upgrade, Reforge, Lapidar and gems.'), systems: ['hero', 'skills', 'gear', 'upgrade', 'reforge', 'gems'] },
  { id: 'professions', status: 'available', title: l('Profissões', 'Professions'), body: l('Mineração, Lenhador, Horta e Ofícios fornecem os materiais e consumíveis da progressão. Cada profissão tem maestria própria.', 'Mining, Woodcutting, Garden and Crafting provide the materials and consumables behind progression. Each profession has its own mastery.'), systems: ['mining', 'woodcutting', 'gardening', 'crafting'] },
  { id: 'combat', status: 'available', shot: 'zones', title: l('Combate e exploração', 'Combat and exploration'), body: l('A Caça traz materiais e peças únicas; a Masmorra e as Profundezas desafiam o Herói até onde o equipamento levar.', 'Hunting brings materials and unique pieces; the Dungeon and the Depths challenge your Hero as far as your gear can go.'), systems: ['hunting', 'dungeon', 'depths'] },
  { id: 'resources', status: 'available', shot: 'forge', title: l('Forja e recursos', 'Forge and resources'), body: l('A Forja conecta recursos a equipamento. Consumíveis e Pedidos ampliam as atividades entre as quais você divide o tempo.', 'The Forge connects resources to gear. Consumables and Orders add more activities to share your time between.'), systems: ['craft', 'consumables', 'orders'] },
  { id: 'economy', status: 'available', title: l('Comércio e itens', 'Trade and items'), body: l('Hoje você vende o excesso aos mercadores e vincula peças ao equipá-las. O mercado de jogadores ainda não existe: ele está no roadmap.', 'Today you sell surplus to merchants and bind pieces by equipping them. The player market does not exist yet: it is on the roadmap.'), systems: ['trade'] },
  { id: 'goals', status: 'available', shot: 'codex', title: l('Metas e coleção', 'Goals and collection'), body: l('Missões, conquistas, Códice e o resumo ao voltar dão objetivos e um registro da sua jornada.', 'Quests, achievements, the Codex and the welcome-back summary give you goals and a record of your journey.'), systems: ['quests', 'codex', 'welcomeBack'] },
];
export const progression = [
  { title: l('Escolha uma atividade', 'Choose an activity'), body: l('Profissões e Caça', 'Professions and Hunting'), target: 'professions' },
  { title: l('Reúna recursos', 'Gather resources'), body: l('Da atividade à Forja', 'From activity to the Forge'), target: 'resources' },
  { title: l('Forje e equipe', 'Forge and equip'), body: l('Equipamento para o Herói', 'Gear for your Hero'), target: 'hero-gear' },
  { title: l('Invista nas peças', 'Improve your gear'), body: l('Melhoria, Reforja e Lapidar', 'Upgrade, Reforge and Lapidar'), target: 'hero-gear' },
  { title: l('Fortaleça o Herói', 'Strengthen your Hero'), body: l('Atributos e habilidades', 'Attributes and skills'), target: 'hero-gear' },
  { title: l('Enfrente a Masmorra', 'Take on the Dungeon'), body: l('Andares, chefes e Profundezas', 'Floors, bosses and the Depths'), target: 'combat' },
  { title: l('Decida o próximo foco', 'Choose your next focus'), body: l('Volte às atividades com um objetivo', 'Return to activities with a goal'), target: 'professions' },
];
// The season championship is under study only: no format, rules, dates or rewards exist, and none may be stated here.
export const championship = {
  title: l('Campeonato de temporada em estudo', 'Season championship under study'),
  body: l('Estamos estudando um campeonato de temporada para o Arena Duel. Ele ainda não existe e não está disponível no jogo.', 'We are studying a season championship for Arena Duel. It does not exist yet and is not available in the game.'),
  note: l('Formato, participação, calendário e recompensas ainda não foram definidos. Nada será aberto antes de as regras serem publicadas e de as verificações necessárias estarem prontas.', 'Format, participation, calendar and rewards have not been defined. Nothing will open before the rules are published and the necessary checks are ready.'),
};
// The player market is planned only: no date, no promise.
export const market = {
  title: l('Mercado de jogadores', 'Player market'),
  body: l('Um mercado onde jogadores poderão negociar entre si está planejado, sem data. Quando existir, apenas peças Épicas, Lendárias ou únicas sem vínculo e as Bolsas de Ouro poderão ser negociadas.', 'A market where players can trade with each other is planned, with no date. When it exists, only unbound Epic, Legendary or unique pieces and Gold Pouches will be tradeable.'),
};
export const roadmap = [
  { id: 'core', status: 'available', title: l('Progressão conectada', 'Connected progression'), body: l('Herói, três caminhos de habilidades, equipamento forjado, Melhoria, Reforja, Lapidar, gemas, conjuntos, profissões com maestria, Caça em quatro zonas, Masmorra de 100 andares, Profundezas, Paragon e Pedidos.', 'Hero, three skill paths, crafted gear, Upgrade, Reforge, Lapidar, gems, sets, professions with mastery, Hunting in four zones, a 100-floor Dungeon, the Depths, Paragon and Orders.') },
  { id: 'goals', status: 'available', title: l('Metas e coleção', 'Goals and collection'), body: l('Missões diárias e semanais, sequência de login, conquistas, títulos e o Códice.', 'Daily and weekly quests, a login streak, achievements, titles and the Codex.') },
  { id: 'pass', status: 'available', title: l('Passe de Aventureiro', 'Adventurer’s Pass'), body: l('Desbloqueio permanente com temporadas de 60 dias, trilha de recompensas e vantagens. A compra ainda não está aberta ao público.', 'A permanent unlock with 60-day seasons, a reward track and perks. Buying it is not open to the public yet.') },
  { id: 'onboarding', status: 'available', title: l('Primeiros passos e conforto', 'Getting started and comfort'), body: l('Tutorial, resumo ao voltar, notificações, português e inglês, controle de som, versão web e versão desktop para Windows.', 'A tutorial, welcome-back summary, notifications, Portuguese and English, sound controls, a web version and a Windows desktop version.') },
  { id: 'steam', status: 'planned', title: l('Lançamento na Steam', 'Steam release'), body: l('Um lançamento na Steam está planejado. Ainda não há data.', 'A Steam release is planned. There is no date yet.') },
  { id: 'market', status: 'planned', title: market.title, body: l('Em estudo e planejado, sem data. Peças Épicas, Lendárias ou únicas sem vínculo e Bolsas de Ouro serão as únicas negociáveis.', 'Under study and planned, with no date. Unbound Epic, Legendary or unique pieces and Gold Pouches will be the only tradeable items.') },
  { id: 'championship', status: 'planned', title: l('Campeonato de temporada', 'Season championship'), body: l('Em estudo. Formato, participação e recompensas ainda não foram definidos.', 'Under study. Format, participation and rewards have not been defined.') },
  { id: 'world', status: 'future', title: l('Mais atividades e desafios', 'More activities and challenges'), body: l('Novas zonas de Caça, equipamento, recursos e eventos temporários são possibilidades para a evolução do jogo.', 'New hunting zones, gear, resources and temporary events are possibilities for the game’s future.') },
  { id: 'long-term', status: 'future', title: l('Novas formas de progressão', 'New ways to progress'), body: l('Novas atividades e mecânicas de profissão poderão ampliar a experiência.', 'New activities and profession mechanics could expand the experience.') },
];
const t = text => [{ type: 'text', text }];
const para = (pt) => ({ type: 'paragraph', content: t(pt) });
const list = items => ({ type: 'list', ordered: false, items: items.map(t) });
// Reviewed records only. Rich content schema: src/editorial.mjs and EDITORIAL.md.
// The single record below is an UNPUBLISHED DRAFT for the owner to review: it does not render anywhere until `published` is set to true.
export const articles = [
  {
    slug: 'o-que-mudou-no-arena-duel', type: 'major', published: false, date: '2026-10-13',
    title: { pt: 'O que mudou no Arena Duel', en: 'What changed in Arena Duel' },
    subtitle: { pt: 'Um resumo do jogo como ele está hoje.', en: 'A summary of the game as it stands today.' },
    summary: { pt: 'Habilidades, Profundezas, Paragon, profissões com maestria, Pedidos, Passe de Aventureiro e mais: o que existe hoje e o que ainda está no roadmap.', en: 'Skills, the Depths, Paragon, professions with mastery, Orders, the Adventurer’s Pass and more: what exists today and what is still on the roadmap.' },
    categories: [{ pt: 'Resumo', en: 'Overview' }],
    body: {
      pt: [
        para('O Arena Duel cresceu bastante desde as primeiras versões. Este resumo reúne o que existe hoje no jogo.'),
        { type: 'heading', level: 2, text: 'Combate e exploração' },
        list(['A Caça agora tem quatro zonas, cada uma com profundidades, materiais e peças únicas próprios.', 'A Masmorra tem 100 andares, com chefes nos andares 25, 50, 75 e 100.', 'Depois do andar 100, as Profundezas oferecem andares sem fim, cada um mais forte que o anterior.', 'Depois do nível 100, o Paragon mantém o Herói evoluindo.', 'Três caminhos de habilidades, Guerreiro, Caçador e Guardião, com golpes e efeitos com nome.']),
        { type: 'heading', level: 2, text: 'Equipamento' },
        list(['Peças forjadas em sete espaços, mais uma relíquia, com tiers e raridades.', 'Conjuntos de peças da mesma família dão bônus extras.', 'Melhoria, Reforja, Lapidar e gemas permitem investir em cada peça.', 'Peças únicas vêm das zonas de Caça e dos chefes.', 'Peças ficam vinculadas ao Herói quando são equipadas.']),
        { type: 'heading', level: 2, text: 'Profissões e economia' },
        list(['Mineração, Lenhador, Horta e Ofícios, cada uma com maestria.', 'Poções, elixirs e tônicos para momentos específicos.', 'Pedidos: entregas que continuam com o jogo fechado.', 'Mercador comum e Mercador Atacadista para vender o excesso.']),
        { type: 'heading', level: 2, text: 'Metas e conforto' },
        list(['Missões diárias e semanais, sequência de login e uma lista longa de conquistas.', 'O Códice registra tudo o que você descobre.', 'Um resumo ao voltar mostra o que aconteceu enquanto você estava fora.', 'Português e inglês, na web e em uma versão desktop para Windows.']),
        { type: 'heading', level: 2, text: 'Passe de Aventureiro' },
        para('O Passe é um desbloqueio permanente, com temporadas de 60 dias e uma trilha de recompensas. A compra ainda não está aberta ao público.'),
        { type: 'heading', level: 2, text: 'O que ainda não existe' },
        list(['Um lançamento na Steam está planejado, sem data.', 'Um mercado de jogadores está planejado, sem data.', 'Um campeonato de temporada está em estudo.']),
      ],
      en: [
        para('Arena Duel has grown a lot since its first versions. This overview gathers what the game contains today.'),
        { type: 'heading', level: 2, text: 'Combat and exploration' },
        list(['Hunting now has four zones, each with depths, materials and unique pieces of its own.', 'The Dungeon has 100 floors, with bosses on floors 25, 50, 75 and 100.', 'After floor 100, the Depths offer endless floors, each stronger than the last.', 'After level 100, Paragon keeps your Hero growing.', 'Three skill paths, Warrior, Hunter and Guardian, with named strikes and effects.']),
        { type: 'heading', level: 2, text: 'Gear' },
        list(['Crafted pieces in seven slots, plus a relic, with tiers and rarities.', 'Matching pieces of the same family give set bonuses.', 'Upgrade, Reforge, Lapidar and gems let you invest in each piece.', 'Unique pieces come from hunting zones and bosses.', 'Pieces bind to your Hero when equipped.']),
        { type: 'heading', level: 2, text: 'Professions and economy' },
        list(['Mining, Woodcutting, Garden and Crafting, each with mastery.', 'Potions, elixirs and tonics for specific moments.', 'Orders: deliveries that keep going while the game is closed.', 'A regular merchant and a Wholesale Merchant to sell surplus.']),
        { type: 'heading', level: 2, text: 'Goals and comfort' },
        list(['Daily and weekly quests, a login streak and a long list of achievements.', 'The Codex records everything you discover.', 'A welcome-back summary shows what happened while you were away.', 'Portuguese and English, on the web and in a Windows desktop version.']),
        { type: 'heading', level: 2, text: 'Adventurer’s Pass' },
        para('The Pass is a permanent unlock, with 60-day seasons and a reward track. Buying it is not open to the public yet.'),
        { type: 'heading', level: 2, text: 'What does not exist yet' },
        list(['A Steam release is planned, with no date.', 'A player market is planned, with no date.', 'A season championship is under study.']),
      ],
    },
  },
];
export const futureRoutes = ['rankings', 'seasons', 'account', 'profile', 'marketplace'];
export const faq = [
  { question: l('O que é Arena Duel?', 'What is Arena Duel?'), answer: l('Um RPG idle em desenvolvimento ativo. Você evolui um Herói, trabalha em profissões, caça, forja equipamento e enfrenta uma Masmorra de 100 andares e as Profundezas. Parte do progresso continua com o jogo fechado.', 'Arena Duel is an idle RPG in active development. You grow a Hero, work on professions, hunt, forge gear and take on a 100-floor Dungeon and the Depths. Part of your progress continues while the game is closed.') },
  { question: l('Por que as escolhas importam?', 'Why do choices matter?'), answer: l('Algumas atividades disputam o seu tempo. Priorizar uma profissão, escolher um caminho de habilidades, investir em uma peça ou preparar o Herói para a Masmorra faz parte dessas decisões.', 'Some activities compete for your time. You decide when to focus on a profession, which skill path to follow, which piece to invest in or how to prepare your Hero for the Dungeon.') },
  { question: l('O jogo tem combate entre jogadores?', 'Does the game have player-versus-player combat?'), answer: l('Não. O combate no Arena Duel é contra monstros e chefes; não há combate entre jogadores.', 'No. Combat in Arena Duel is against monsters and bosses; there is no player-versus-player combat.') },
  { question: l('O jogo será gratuito?', 'Will the game be free?'), answer: l('O jogo base poderá ser jogado sem pagar. O Passe de Aventureiro é opcional: é um desbloqueio permanente que traz vantagens, temporadas e itens exclusivos. Os detalhes da venda ainda serão definidos.', 'The base game can be played without paying. The Adventurer’s Pass is optional: a permanent unlock that brings perks, seasons and exclusive items. Details of how it will be sold have yet to be defined.') },
  { question: l('O que é o Passe de Aventureiro?', 'What is the Adventurer’s Pass?'), answer: l('Um desbloqueio permanente com temporadas de 60 dias, uma trilha de recompensas, vantagens de conveniência e progressão, cosméticos e itens exclusivos. A compra ainda não está aberta.', 'A permanent unlock with 60-day seasons, a reward track, convenience and progression perks, cosmetics and exclusive items. Buying it is not open yet.') },
  { question: l('O que significa “Disponível”?', 'What does “Available” mean?'), answer: l('O sistema já existe na versão atual do jogo. Isso não indica que o jogo foi lançado ao público nem que o sistema é final.', 'The system exists in the current version of the game. This does not mean the game has launched publicly or that the system is final.') },
  { question: l('Já posso jogar?', 'Can I play yet?'), answer: l('O portal ainda não possui um endereço oficial de acesso ao jogo. Até sua confirmação, acompanhe o desenvolvimento pelo Roadmap.', 'An official play link has not been confirmed for this portal yet. You can follow development through the Roadmap in the meantime.') },
  { question: l('Em quais plataformas o jogo funciona?', 'Which platforms does the game run on?'), answer: l('No navegador e em uma versão desktop para Windows. Um lançamento na Steam está planejado, sem data.', 'In the browser and in a Windows desktop version. A Steam release is planned, with no date.') },
  { question: l('Vai existir um mercado entre jogadores?', 'Will there be a player market?'), answer: l('Está planejado, sem data. Quando existir, apenas peças Épicas, Lendárias ou únicas sem vínculo e as Bolsas de Ouro poderão ser negociadas. Peças equipadas ficam vinculadas e deixam de ser negociáveis.', 'It is planned, with no date. When it exists, only unbound Epic, Legendary or unique pieces and Gold Pouches can be traded. Equipped pieces become bound and are no longer tradeable.') },
  { question: l('Haverá um campeonato?', 'Will there be a championship?'), answer: championship.note },
  { question: l('Existe uma data de lançamento?', 'Is there a release date?'), answer: l('Ainda não há uma data oficial anunciada. O roadmap comunica a direção do desenvolvimento, sem datas de entrega.', 'No official release date has been announced. The roadmap shows our development direction without delivery dates.') },
];
export const copy = {
  headline: l('Progressão que exige escolhas.', 'Progress shaped by your choices.'),
  subtitle: l('Evolua seu Herói, desenvolva profissões, forje equipamento e desça a Masmorra até as Profundezas. Decida onde investir seu tempo.', 'Develop your Hero, build up professions, forge gear and descend through the Dungeon to the Depths. Decide where your time will make the difference.'),
  choicesTitle: l('Nem tudo pode ser maximizado ao mesmo tempo.', 'You can’t maximize everything at once.'),
  choicesBody: l('Algumas atividades disputam o seu tempo. Escolher onde se especializar faz parte do jogo.', 'Some activities compete for your time. Choosing what to specialize in is part of the game.'),
  loopTitle: l('Das atividades à Masmorra.', 'From activities to the Dungeon.'),
  loopBody: l('Recursos, equipamento e evolução do Herói fazem parte de um mesmo ciclo. A cada etapa, você decide o que desenvolver a seguir.', 'Activities, resources, gear and Hero progression work together. Each step gives you a reason to reconsider your next priority.'),
  roadmapNote: l('O roadmap representa a direção atual do projeto e pode evoluir conforme o desenvolvimento.', 'The roadmap reflects the project’s current direction and may change as development continues.'),
  availableNote: l('Sistemas existentes na versão atual; não indica lançamento público.', 'Systems in the current version; this does not indicate a public launch.'),
  noNews: l('Comunicados do desenvolvimento serão reunidos aqui quando houver novidades para compartilhar. Enquanto isso, conheça o estado atual no Roadmap.', 'Development news will appear here when there is something to share. For the current state of the project, visit the Roadmap.'),
  gameTitle: l('O jogo hoje', 'The game today'),
  gameBody: l('Capturas da versão atual do Arena Duel.', 'Screenshots from the current version of Arena Duel.'),
};
// Legal pages are owner-provided text. They exist only as clearly marked placeholders and are not linked from any menu until real text is supplied.
export const legal = [
  { route: 'privacy', title: l('Política de Privacidade', 'Privacy Policy') },
  { route: 'terms', title: l('Termos de Uso', 'Terms of Use') },
  { route: 'season-rules', title: l('Regras da Temporada', 'Season Rules') },
];
export const legalPlaceholder = l('Texto a ser fornecido pelo responsável do jogo.', 'Text to be provided by the game’s owner.');
