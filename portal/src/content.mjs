export const localized = (pt, en) => ({ pt, en });
const l = localized;
// OWNER SETTINGS. Everything the owner has to fill lives in this block; each key explains itself. Defaults keep the site honest while nothing is decided.
//  playUrl         official address of the game (https). null: the "Jogar grátis / Play free" button stays disabled with "Em breve / Soon".
//  passSalesOpen   the ONE switch for the Pass sale. false: every page says the Pass is coming and no price is shown. true: the price, the buy button
//                  (<playUrl>/?comprar=passe), and the refund-policy link appear (USDC on Solana only; no card). Needs playUrl and legalLive.refund (the build refuses it otherwise).
//  passPrice       the text shown only when passSalesOpen is true.
//  siteUrl         public origin of the portal (https://example.com, no path). null: relative links, noindex, no robots.txt / sitemap.xml. Set: absolute canonical,
//                  hreflang and Open Graph URLs, robots.txt, sitemap.xml and indexing allowed.
//  company         shown in the footer only for the fields that are filled (never a placeholder).
//  legalLive       a legal page is linked from the footer only when its real text is in the site and its flag is true. Placeholder pages stay unlinked.
//  waitlistEnabled  true: the "Avise-me no lançamento" block (e-mail + consent) appears on the Home and the Temporada page and the /unsubscribe page exists. false (default): none of it is rendered.
//                  Needs supabaseUrl (the Edge Functions waitlist-join / waitlist-unsubscribe, docs/WAITLIST.md); without it the block says the sign-up is not available yet. The public
//                  counter appears only when the database flag arena_private.portal_flags.show_waitlist_count is on AND supabaseAnonKey is set.
//  referralEnabled true (and waitlistEnabled true): after signing up the person sees "Seu link de convite" (copy + WhatsApp / X / Telegram share links) and the in-game reward list. The rewards are
//                  granted by the server (docs/WAITLIST.md); only turn this on when you are ready to promise them. The link is built from siteUrl (or the page's own origin when siteUrl is null).
// community stays empty until official channels exist.
// supabaseUrl / supabaseAnonKey feed the live numbers of the Liga da Temporada page (Pass meter and rankings). Both stay null until the owner fills them, and the page then says
// the data is unavailable: it never shows a made-up number. supabaseUrl is the project address (https://<project-ref>.supabase.co); supabaseAnonKey is the PUBLIC
// "anon" key (it is public by design and protected by the database rules). The service key must NEVER be written here.
export const config = {
  playUrl: null, passSalesOpen: false, passPrice: '10 USDC', siteUrl: null,
  company: { legalName: null, cnpj: null, supportEmail: null },
  legalLive: { terms: false, privacy: false, refund: false, seasonRules: false }, waitlistEnabled: false, referralEnabled: false,
  supabaseUrl: null, supabaseAnonKey: null, community: [], brand: 'Arena Idle', pageSize: 8,
};
// Text that depends on the owner settings is computed when read (getters), so a changed setting changes every page at once.
const dyn = (pt, en) => ({ get pt() { return pt(); }, get en() { return en(); } });
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
  available: { label: l('Disponível', 'Available'), definition: l('Já existe na versão atual do Arena Idle.', 'Already part of the current version of Arena Idle.') },
  development: { label: l('Em desenvolvimento', 'In development'), definition: l('Está sendo trabalhado ativamente.', 'Currently being worked on.') },
  planned: { label: l('Planejado', 'Planned'), definition: l('Faz parte da direção atual do projeto, mas ainda não tem data nem regras definidas. Alguns itens estão em estudo.', 'Part of the current direction, with no date and no defined rules yet. Some items are still under study.') },
  future: { label: l('Visão futura', 'Future vision'), definition: l('Ideias e sistemas que poderão fazer parte da evolução do Arena Idle.', 'Ideas and systems that may become part of Arena Idle as it evolves.') },
};
// Screenshots taken from the current game (offline build, mid-game save from scripts/sim/smokeSaves.gen.ts, 1440x900), one set per language.
const shotFile = id => l(`/img/shots/pt/${id}.webp`, `/img/shots/en/${id}.webp`);
const shot = (id, alt, caption) => ({ file: shotFile(id), width: 1440, height: 900, alt, caption });
export const shots = {
  base: shot('home', l('Acampamento: o Herói com o equipamento, as ações rápidas e o progresso das profissões e da Masmorra.', 'Base camp: the Hero with his gear, the quick actions and the progress of the professions and the Dungeon.'), l('Acampamento: tudo o que o Herói está fazendo, numa tela só.', 'Base camp: everything your Hero is doing, on one screen.')),
  dungeon: shot('dungeon', l('Combate na Masmorra: o herói de armadura enfrenta o Chefe de Guerra Orc no andar 50 das Catacumbas Esquecidas.', 'Dungeon combat: the armored hero fights the Orc Warchief on floor 50 of the Forgotten Catacombs.'), l('Masmorra: 100 andares, chefes e combate automático.', 'Dungeon: 100 floors, bosses and automatic combat.')),
  hero: shot('character', l('Tela do Personagem com os espaços de equipamento preenchidos, os atributos e o poder de combate.', 'Character screen with the gear slots filled, the attributes and the combat power.'), l('Personagem: equipamento, atributos e poder de combate.', 'Character: gear, attributes and combat power.')),
  hunt: shot('hunt', l('Caçada em andamento no Pântano de Sangue, com o herói enfrentando um monstro e os materiais coletados.', 'Hunt in progress in the Blood Marsh, with the hero fighting a monster and the materials gathered.'), l('Caça: o herói luta e coleta materiais mesmo com o jogo fechado.', 'Hunting: your hero fights and gathers materials even while the game is closed.')),
  zones: shot('zones', l('Seleção de zonas de Caça com quatro zonas, os materiais, as peças únicas e as três profundidades.', 'Hunting zone selection with four zones, the materials, the unique pieces and the three depths.'), l('Quatro zonas de Caça, cada uma com materiais e peças únicas próprios.', 'Four hunting zones, each with its own materials and unique pieces.')),
  forge: shot('forge', l('Tela da Forja com as abas Forjar, Melhorar, Reparo e Gemas e receitas com seus materiais.', 'Forge screen with the Forge, Upgrade, Repair and Gems tabs and recipes with their materials.'), l('Forja: receitas, melhorias, reparo e gemas.', 'Forge: recipes, upgrades, repair and gems.')),
  inventory: shot('inventory', l('Inventário cheio de armas, armaduras, materiais e poções, com filtros por tipo.', 'Inventory full of weapons, armor, materials and potions, with filters by type.'), l('Inventário: o que a Caça, as profissões e a Masmorra trazem.', 'Inventory: what Hunting, professions and the Dungeon bring in.')),
  mining: shot('mining', l('Tela de Mineração com os minérios, o nível da profissão e os próximos desbloqueios.', 'Mining screen with the ores, the profession level and the next unlocks.'), l('Profissões: cada uma com níveis e desbloqueios próprios.', 'Professions: each with its own levels and unlocks.')),
  skills: shot('skills', l('Tela de Habilidades com os três caminhos, Guerreiro, Guardião e Caçador.', 'Skills screen with the three paths, Warrior, Guardian and Hunter.'), l('Habilidades: três caminhos, cada um com golpes próprios.', 'Skills: three paths, each with strikes of its own.')),
  codex: shot('codex', l('Códice com abas de equipamento, materiais e monstros e quadros de itens ainda por descobrir.', 'Codex with gear, materials and monsters tabs and tiles of items still to be discovered.'), l('Códice: o registro de tudo o que você já descobriu.', 'Codex: a record of everything you have discovered.')),
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
  { id: 'trade', term: 'trade', body: l('O mercador compra o excesso por pouco, e o Mercador Atacadista compra materiais em quantidade depois de um chefe da Masmorra. No Mercado de jogadores, que abre com a Temporada 1, você vende e compra peças Épicas, Lendárias ou únicas, materiais negociáveis e Bolsas de Ouro de outros jogadores, pela rede Solana (carteira Phantom ou Solflare), e pode revender o que comprou. Equipar uma peça a vincula a você e ela deixa de ser negociável.', 'The merchant buys surplus for little, and the Wholesale Merchant buys materials in bulk after a Dungeon boss. In the Player market, which opens with Season 1, you sell and buy Epic, Legendary or unique pieces, tradeable materials and Gold Pouches with other players, on the Solana network (Phantom or Solflare wallet), and you can resell what you bought. Equipping a piece binds it to you and it can no longer be traded.') },
  { id: 'quests', term: 'quests', body: l('Missões diárias e semanais, sequência de login e uma lista longa de conquistas, com títulos para exibir no perfil.', 'Daily and weekly goals, a login streak and a long list of achievements, with titles to show on your profile.') },
  { id: 'codex', term: 'codex', body: l('O Códice registra equipamento, materiais e monstros descobertos, com a origem de cada item.', 'The Codex records the gear, materials and monsters you have discovered, with the origin of each item.') },
  { id: 'welcomeBack', term: 'welcomeBack', body: l('Ao voltar ao jogo, um resumo mostra o que aconteceu enquanto você estava fora.', 'When you return, a summary shows what happened while you were away.') },
];
export const groups = [
  { id: 'hero-gear', status: 'available', shot: 'skills', title: l('Herói e equipamento', 'Hero and gear'), body: l('O Herói evolui com atributos e habilidades, e as peças que ele usa evoluem com Melhoria, Reforja, Lapidar e gemas.', 'Your Hero grows through attributes and skills, and the pieces he wears grow through Upgrade, Reforge, Lapidar and gems.'), systems: ['hero', 'skills', 'gear', 'upgrade', 'reforge', 'gems'] },
  { id: 'professions', status: 'available', shot: 'mining', title: l('Profissões', 'Professions'), body: l('Mineração, Lenhador, Horta e Ofícios fornecem os materiais e consumíveis da progressão. Cada profissão tem maestria própria.', 'Mining, Woodcutting, Garden and Crafting provide the materials and consumables behind progression. Each profession has its own mastery.'), systems: ['mining', 'woodcutting', 'gardening', 'crafting'] },
  { id: 'combat', status: 'available', shot: 'zones', title: l('Combate e exploração', 'Combat and exploration'), body: l('A Caça traz materiais e peças únicas; a Masmorra e as Profundezas desafiam o Herói até onde o equipamento levar.', 'Hunting brings materials and unique pieces; the Dungeon and the Depths challenge your Hero as far as your gear can go.'), systems: ['hunting', 'dungeon', 'depths'] },
  { id: 'resources', status: 'available', shot: 'forge', title: l('Forja e recursos', 'Forge and resources'), body: l('A Forja conecta recursos a equipamento. Consumíveis e Pedidos ampliam as atividades entre as quais você divide o tempo.', 'The Forge connects resources to gear. Consumables and Orders add more activities to share your time between.'), systems: ['craft', 'consumables', 'orders'] },
  { id: 'economy', status: 'available', art: { file: '/img/market-scale.webp', width: 560, height: 560, alt: l('Balança dourada de mercador com uma espada lendária e cristais de um lado e uma bolsa de ouro do outro.', 'Golden merchant scale with a legendary sword and crystals on one side and a pouch of gold on the other.') }, title: l('Comércio e itens', 'Trade and items'), body: l('Venda o excesso aos mercadores e negocie peças raras com outros jogadores no Mercado, que abre com a Temporada 1. Equipar uma peça a vincula a você.', 'Sell surplus to merchants and trade rare pieces with other players in the Market, which opens with Season 1. Equipping a piece binds it to you.'), systems: ['trade'] },
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
// Copy of the Liga da Temporada page. The goal is NOT written here and never reaches the page: it lives in the database (arena_private.season_goal) and pass_meter() only returns a progress fraction.
// Prize policy: only a guaranteed minimum of US$ 1,000 for the top places may be written here, and it may grow with Passes bought. No other amount and no split per place; the distribution and the final amount are published in the rules before the League opens. "Liga da Temporada" is the only name of the competition;
// "Temporada do Passe" is only the in-game reward track.
export const seasonPage = {
  nav: l('Liga da Temporada', 'Season League'),
  navShort: l('Temporada', 'Season'),
  heroEyebrow: l('Temporada 1', 'Season 1'),
  heroStatus: l('Pré-temporada', 'Pre-season'),
  heroPre: l('Sem premiação oficial', 'No official prize'),
  heroLead: l('Teste seu progresso antes da primeira temporada oficial. Quando a barra de Passes da comunidade encher, a Temporada 1 começa: 60 dias de disputa com prêmio em dinheiro.', 'Test your progress before the first official season. When the community Pass bar fills, Season 1 begins: 60 days of contest with a cash prize.'),
  heroArt: l('Taça dourada da Temporada', 'Golden Season trophy'),
  facts: [
    { label: l('Duração', 'Length'), value: l('60 dias', '60 days'), note: l('O ranking congela 2 dias antes do fim.', 'The ranking freezes 2 days before the end.') },
    { label: l('Prêmio', 'Prize'), value: l('US$ 1.000+', 'US$ 1,000+'), note: l('Mínimo para os primeiros lugares; pode crescer.', 'Minimum for the top places; it can grow.') },
    { label: l('Quem disputa', 'Who competes'), value: l('Com o Passe', 'Pass owners'), note: l('Só quem tem o Passe entra no ranking.', 'Only Pass owners enter the ranking.') },
    { label: l('Ranking', 'Ranking'), value: l('Por nível', 'By level'), note: l('Calculado no servidor, com auditoria.', 'Calculated on the server, with an audit.') },
  ],
  faqTitle: l('Perguntas sobre a Temporada', 'Season questions'),
  faq: [
    { question: l('A Temporada 1 já começou?', 'Has Season 1 started?'), answer: l('Ainda não. Agora roda a pré-temporada, sem premiação oficial. A Temporada 1 começa sozinha quando a barra de Passes da comunidade encher.', 'Not yet. The pre-season runs now, with no official prize. Season 1 begins on its own when the community Pass bar fills.') },
    { question: l('Quem pode ganhar o prêmio?', 'Who can win the prize?'), answer: l('Só quem tem o Passe de Aventureiro. Não é sorteio: vence quem chegar mais longe, e os primeiros colocados passam por auditoria antes do pagamento. A divisão entre as posições e o valor final saem no regulamento antes da abertura.', 'Only Adventurer’s Pass owners. It is not a raffle: whoever gets furthest wins, and the top finishers are audited before payment. The split among places and the final amount are published in the rules before it opens.') },
    { question: l('O que acontece com meu herói da pré-temporada?', 'What happens to my pre-season hero?'), answer: l('Quando a Temporada 1 começar, todos os heróis online recomeçam do zero, uma única vez. O Passe e o seu nome continuam.', 'When Season 1 begins, every online hero starts again from zero, once. Your Pass and your name stay.') },
    { question: l('O que abre junto com a Temporada 1?', 'What opens with Season 1?'), answer: l('O ranking com prêmio em dinheiro e o Mercado de jogadores, onde você negocia peças raras, materiais e Bolsas de Ouro com outros jogadores.', 'The ranking with a cash prize and the Player market, where you trade rare pieces, materials and Gold Pouches with other players.') },
    { question: l('O Passe vale para todas as temporadas?', 'Does the Pass count for every season?'), answer: l('Não. O Passe vale para a pré-temporada e para a Temporada 1. Ele não se renova sozinho.', 'No. The Pass counts for the pre-season and Season 1. It does not renew on its own.') },
  ],
  eyebrow: l('Competição', 'Competition'),
  title: l('Liga da Temporada', 'Season League'),
  lead: l('Uma competição com prêmio em dinheiro para quem tem o Passe de Aventureiro. Veja como ela começa, a meta da comunidade e quem lidera.', 'A competition with a cash prize for Adventurer’s Pass owners. See how it starts, the community goal and who leads.'),
  stepsTitle: l('Como funciona', 'How it works'),
  step1: l('Jogue grátis.', 'Play free.'),
  step2: l('Com o Passe, entre na pré-temporada (sem prêmio).', 'With the Pass, join the pre-season (no prize).'),
  step3: l('Quando a comunidade chegar à meta de Passes, começa a Liga com prêmio em dinheiro, com mínimo garantido de US$ 1.000, que pode crescer conforme mais Passes forem comprados.', 'When the community reaches the Pass goal, the League begins with a cash prize, with a guaranteed minimum of US$ 1,000 that can grow as more Passes are bought.'),
  resetNotice: l('A pré-temporada é um teste aberto: quando a Liga começar, todos os heróis online recomeçam do zero. O Passe e o seu nome continuam.', 'The pre-season is an open test: when the League begins, every online hero starts again from zero. Your Pass and your name stay.'),
  meterTitle: l('A meta da comunidade', 'The community goal'),
  fixedPrize: l('O prêmio tem mínimo garantido de US$ 1.000 para as primeiras colocações e pode crescer conforme mais Passes forem comprados. A distribuição entre as colocações e o valor final são publicados no regulamento antes da abertura da Liga. Não é sorteio: vence quem chegar mais longe, com auditoria antes do pagamento. Só concorre quem tem o Passe.', 'The prize has a guaranteed minimum of US$ 1,000 for the top places and can grow as more Passes are bought. The distribution among places and the final amount are published in the rules before the League opens. It is not a raffle: whoever gets furthest wins, with an audit before payment. Only Pass owners compete.'),
  goalLine: l('Quando a barra encher, a Liga da Temporada começa.', 'When the bar fills, the Season League begins.'),
  openTitle: l('Liga da Temporada em andamento', 'Season League in progress'),
  openDates: l('De {from} a {to} (UTC)', 'From {from} to {to} (UTC)'),
  openEnds: l('Termina em {time}', 'Ends in {time}'),
  openOver: l('Esta Liga terminou.', 'This League is over.'),
  buy: l('Comprar o Passe', 'Buy the Pass'),
  soon: l('Em breve', 'Soon'),
  buyNote: l('A compra é feita dentro do jogo, depois do login.', 'The purchase is made inside the game, after you sign in.'),
  closedNote: l('O Passe ainda não está à venda. Veja o que ele inclui na página do Passe.', 'The Pass is not on sale yet. See what it includes on the Pass page.'),
  closedLink: l('Conhecer o Passe', 'See the Pass'),
  meterFailed: l('Barra de progresso indisponível agora. Tente de novo em instantes.', 'Progress bar unavailable right now. Try again in a moment.'),
  rankingFailed: l('Ranking indisponível agora. Tente de novo em instantes.', 'Ranking unavailable right now. Try again in a moment.'),
  stale: l('Não foi possível atualizar agora. Os números abaixo podem estar desatualizados.', 'Could not refresh right now. The numbers below may be out of date.'),
  loading: l('Carregando dados ao vivo…', 'Loading live data…'),
  live: l('Dados ao vivo. Atualizados a cada minuto.', 'Live data. Refreshed every minute.'),
  noscript: l('Os dados ao vivo precisam de JavaScript.', 'Live data needs JavaScript.'),
  rulesTitle: l('Regras em resumo', 'Rules at a glance'),
  rule1: l('A participação é exclusiva de quem tem o Passe de Aventureiro. A pontuação é calculada no servidor.', 'Taking part is exclusive to Adventurer’s Pass owners. Scores are calculated on the server.'),
  rule2: l('A pré-temporada usa o mesmo placar, não tem prêmio e termina quando a Liga começar; aí todos recomeçam do zero.', 'The pre-season uses the same scoring, has no prize and ends when the League begins; then everyone starts from zero.'),
  rule3: l('O regulamento completo, a distribuição entre as colocações e o valor final do prêmio são publicados antes da abertura da Liga.', 'The full rules, the distribution among places and the final prize amount are published before the League opens.'),
  rulesLink: l('Ler o regulamento', 'Read the rules'),
  generalTitle: l('Ranking geral', 'Overall ranking'),
  rankingEyebrow: l('Ranking geral', 'Overall ranking'),
  professionTitle: l('Ranking por profissão', 'Ranking by profession'),
  professionNote: l('A pontuação de cada profissão é o total de XP dela.', 'Each profession’s score is its total XP.'),
  boardPaid: l('Liga da Temporada', 'Season League'),
  boardPre: l('Pré-temporada · sem prêmio', 'Pre-season · no prize'),
  boardEnded: l('Liga da Temporada · encerrada', 'Season League · ended'),
  boardNone: l('A Liga ainda não começou', 'The League has not started yet'),
  noteOnlyPass: l('A participação é exclusiva de quem tem o Passe de Aventureiro. A pontuação é calculada no servidor.', 'Taking part is exclusive to Adventurer’s Pass owners. Scores are calculated on the server.'),
  notePre: l('A pré-temporada vale o mesmo placar, só para quem tem o Passe, e não tem prêmio. Ela termina quando a Liga começar; aí todos recomeçam do zero.', 'The pre-season uses the same scoring, for Pass owners only, and has no prize. It ends when the League begins; then everyone starts from zero.'),
  noteEnded: l('Classificação final da última Liga.', 'Final standings of the last League.'),
  noteNone: l('Ainda não há ranking aberto. Quando houver, ele aparece aqui.', 'No ranking is open yet. When one is, it appears here.'),
  prize: l('Prêmio: {note}', 'Prize: {note}'),
  prizeRule: l('O texto oficial do prêmio aparece junto ao ranking quando a Liga abre. Nenhum valor além do mínimo de US$ 1.000 é divulgado fora do regulamento e dele.', 'The official prize text appears next to the ranking when the League opens. No amount beyond the US$ 1,000 minimum is published anywhere except the rules and there.'),
  empty: l('Ainda não há jogadores neste ranking.', 'There are no players in this ranking yet.'),
  rank: l('Posição', 'Rank'),
  player: l('Jogador', 'Player'),
  level: l('Nível', 'Level'),
  floor: l('Andar', 'Floor'),
  depth: l('Profundeza', 'Depth'),
  xp: l('XP', 'XP'),
  paragon: l('Paragon', 'Paragon'),
  anonymous: l('Aventureiro', 'Adventurer'),
  generalTable: l('Ranking geral: posição, jogador, nível, andar e profundeza', 'Overall ranking: rank, player, level, floor and depth'),
  professionTable: l('Ranking da profissão: posição, jogador, nível e XP', 'Profession ranking: rank, player, level and XP'),
};
// Decided rules (owner, 2026-10-14): only Adventurer's Pass owners take part; the League starts when the Pass goal is reached; a pre-season with no prize runs until then.
export const league = {
  title: l('Liga da Temporada', 'Season League'),
  body: l('Quando a comunidade chegar à meta de Passes, abre a Liga: uma competição com prêmio em dinheiro, com mínimo garantido de US$ 1.000 que pode crescer com os Passes comprados; os detalhes saem no regulamento. Até lá, roda uma pré-temporada sem prêmio.', 'When the community reaches the Pass goal, the League opens: a competition with a cash prize, with a guaranteed minimum of US$ 1,000 that can grow with Passes bought; details are published in the rules. Until then, a pre-season with no prize runs.'),
};
// The player market is built and opens with Season 1 (owner, 2026-10-20). No currency, fee or price is written here.
export const market = {
  title: l('Mercado de jogadores', 'Player market'),
  body: l('O Mercado de jogadores já está pronto e abre junto com a Temporada 1. Nele você vende e compra peças Épicas, Lendárias ou únicas sem vínculo, materiais negociáveis e Bolsas de Ouro de outros jogadores, pela rede Solana, e pode revender o que comprou.', 'The Player market is ready and opens together with Season 1. In it you sell and buy unbound Epic, Legendary or unique pieces, tradeable materials and Gold Pouches with other players, on the Solana network, and you can resell what you bought.'),
};
// `status` of the Pass entry and the text of the entries that depend on the Pass sale are getters: they follow config.passSalesOpen.
export const roadmap = [
  { id: 'core', status: 'available', title: l('Progressão conectada', 'Connected progression'), body: l('Herói, três caminhos de habilidades, equipamento forjado, Melhoria, Reforja, Lapidar, gemas, conjuntos, profissões com maestria, Caça em quatro zonas, Masmorra de 100 andares, Profundezas, Paragon e Pedidos.', 'Hero, three skill paths, crafted gear, Upgrade, Reforge, Lapidar, gems, sets, professions with mastery, Hunting in four zones, a 100-floor Dungeon, the Depths, Paragon and Orders.') },
  { id: 'goals', status: 'available', title: l('Metas e coleção', 'Goals and collection'), body: l('Missões diárias e semanais, sequência de login, conquistas, títulos e o Códice.', 'Daily and weekly quests, a login streak, achievements, titles and the Codex.') },
  {
    id: 'pass', get status() { return config.passSalesOpen ? 'available' : 'development'; }, title: l('Passe de Aventureiro', 'Adventurer’s Pass'),
    body: dyn(
      () => 'Vale para a pré-temporada e a Temporada 1, com a trilha de recompensas de 60 dias e vantagens. ' + (config.passSalesOpen ? 'A compra está aberta.' : 'A venda abre em breve.'),
      () => 'Counts for the pre-season and Season 1, with the 60-day reward track and perks. ' + (config.passSalesOpen ? 'Buying it is open.' : 'The sale opens soon.'),
    ),
  },
  { id: 'onboarding', status: 'available', title: l('Primeiros passos e conforto', 'Getting started and comfort'), body: l('Tutorial, resumo ao voltar, notificações, português e inglês, controle de som, no navegador do computador ou do celular.', 'A tutorial, welcome-back summary, notifications, Portuguese and English, sound controls, in the browser on your computer or phone.') },
  { id: 'league', status: 'development', title: l('Liga da Temporada', 'Season League'), body: l('Começa quando a comunidade chegar à meta de Passes, exclusiva para quem tem o Passe, com prêmio em dinheiro, mínimo garantido de US$ 1.000 que pode crescer. Pré-temporada sem prêmio até lá.', 'Begins when the community reaches the Pass goal, exclusive to Pass owners, with a cash prize, a guaranteed US$ 1,000 minimum that can grow. A pre-season with no prize runs until then.') },
  { id: 'market', status: 'development', title: l('Mercado de jogadores', 'Player market'), body: l('Pronto e em testes. Abre junto com a Temporada 1: peças Épicas, Lendárias ou únicas sem vínculo, materiais negociáveis e Bolsas de Ouro negociados entre jogadores na rede Solana, com revenda permitida.', 'Built and in testing. Opens together with Season 1: unbound Epic, Legendary or unique pieces, tradeable materials and Gold Pouches traded between players on the Solana network, with resale allowed.') },
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
    slug: 'o-que-mudou-no-arena-idle', type: 'major', published: false, date: '2026-10-13',
    title: { pt: 'O que mudou no Arena Idle', en: 'What changed in Arena Idle' },
    subtitle: { pt: 'Um resumo do jogo como ele está hoje.', en: 'A summary of the game as it stands today.' },
    summary: { pt: 'Habilidades, Profundezas, Paragon, profissões com maestria, Pedidos, Passe de Aventureiro e mais: o que existe hoje e o que ainda está no roadmap.', en: 'Skills, the Depths, Paragon, professions with mastery, Orders, the Adventurer’s Pass and more: what exists today and what is still on the roadmap.' },
    categories: [{ pt: 'Resumo', en: 'Overview' }],
    body: {
      pt: [
        para('O Arena Idle cresceu bastante desde as primeiras versões. Este resumo reúne o que existe hoje no jogo.'),
        { type: 'heading', level: 2, text: 'Combate e exploração' },
        list(['A Caça agora tem quatro zonas, cada uma com profundidades, materiais e peças únicas próprios.', 'A Masmorra tem 100 andares, com chefes nos andares 25, 50, 75 e 100.', 'Depois do andar 100, as Profundezas oferecem andares sem fim, cada um mais forte que o anterior.', 'Depois do nível 100, o Paragon mantém o Herói evoluindo.', 'Três caminhos de habilidades, Guerreiro, Caçador e Guardião, com golpes e efeitos com nome.']),
        { type: 'heading', level: 2, text: 'Equipamento' },
        list(['Peças forjadas em sete espaços, mais uma relíquia, com tiers e raridades.', 'Conjuntos de peças da mesma família dão bônus extras.', 'Melhoria, Reforja, Lapidar e gemas permitem investir em cada peça.', 'Peças únicas vêm das zonas de Caça e dos chefes.', 'Peças ficam vinculadas ao Herói quando são equipadas.']),
        { type: 'heading', level: 2, text: 'Profissões e economia' },
        list(['Mineração, Lenhador, Horta e Ofícios, cada uma com maestria.', 'Poções, elixirs e tônicos para momentos específicos.', 'Pedidos: entregas que continuam com o jogo fechado.', 'Mercador comum e Mercador Atacadista para vender o excesso.']),
        { type: 'heading', level: 2, text: 'Metas e conforto' },
        list(['Missões diárias e semanais, sequência de login e uma lista longa de conquistas.', 'O Códice registra tudo o que você descobre.', 'Um resumo ao voltar mostra o que aconteceu enquanto você estava fora.', 'Português e inglês, no navegador do computador ou do celular.']),
        { type: 'heading', level: 2, text: 'Passe de Aventureiro' },
        para('O Passe vale para a pré-temporada e a Temporada 1, com a Temporada do Passe de 60 dias e uma trilha de recompensas.'),
        { type: 'heading', level: 2, text: 'O que ainda não existe' },
        list(['Um mercado de jogadores está planejado, sem data.', 'A Liga da Temporada começa quando a meta de Passes for alcançada; até lá roda uma pré-temporada sem prêmio.']),
      ],
      en: [
        para('Arena Idle has grown a lot since its first versions. This overview gathers what the game contains today.'),
        { type: 'heading', level: 2, text: 'Combat and exploration' },
        list(['Hunting now has four zones, each with depths, materials and unique pieces of its own.', 'The Dungeon has 100 floors, with bosses on floors 25, 50, 75 and 100.', 'After floor 100, the Depths offer endless floors, each stronger than the last.', 'After level 100, Paragon keeps your Hero growing.', 'Three skill paths, Warrior, Hunter and Guardian, with named strikes and effects.']),
        { type: 'heading', level: 2, text: 'Gear' },
        list(['Crafted pieces in seven slots, plus a relic, with tiers and rarities.', 'Matching pieces of the same family give set bonuses.', 'Upgrade, Reforge, Lapidar and gems let you invest in each piece.', 'Unique pieces come from hunting zones and bosses.', 'Pieces bind to your Hero when equipped.']),
        { type: 'heading', level: 2, text: 'Professions and economy' },
        list(['Mining, Woodcutting, Garden and Crafting, each with mastery.', 'Potions, elixirs and tonics for specific moments.', 'Orders: deliveries that keep going while the game is closed.', 'A regular merchant and a Wholesale Merchant to sell surplus.']),
        { type: 'heading', level: 2, text: 'Goals and comfort' },
        list(['Daily and weekly quests, a login streak and a long list of achievements.', 'The Codex records everything you discover.', 'A welcome-back summary shows what happened while you were away.', 'Portuguese and English, in the browser on your computer or phone.']),
        { type: 'heading', level: 2, text: 'Adventurer’s Pass' },
        para('The Pass counts for the pre-season and Season 1, with the 60-day Pass Season and a reward track.'),
        { type: 'heading', level: 2, text: 'What does not exist yet' },
        list(['A player market is planned, with no date.', 'The Season League begins when the Pass goal is reached; until then a pre-season with no prize runs.']),
      ],
    },
  },
];
export const futureRoutes = ['rankings', 'seasons', 'account', 'profile', 'marketplace'];
const freeAnswer = dyn(
  () => 'Sim. O jogo base é grátis no navegador. O Passe de Aventureiro é opcional: vale para a pré-temporada e a Temporada 1, com vantagens, a Temporada do Passe e itens exclusivos. ' + (config.passSalesOpen ? `O Passe custa ${config.passPrice}, em pagamento único.` : 'A venda do Passe abre em breve.'),
  () => 'Yes. The base game is free in the browser. The Adventurer’s Pass is optional: it counts for the pre-season and Season 1, with perks, the Pass Season and exclusive items. ' + (config.passSalesOpen ? `The Pass costs ${config.passPrice}, a single payment.` : 'The Pass sale opens soon.'),
);
const passAnswer = dyn(
  () => 'Vale para a pré-temporada e a Temporada 1, com a Temporada do Passe de 60 dias, uma trilha de recompensas, vantagens de conveniência e progressão, cosméticos e itens exclusivos. ' + (config.passSalesOpen ? 'A compra está aberta: pagamento único.' : 'A compra ainda não abriu.'),
  () => 'It counts for the pre-season and Season 1, with the 60-day Pass Season, a reward track, convenience and progression perks, cosmetics and exclusive items. ' + (config.passSalesOpen ? 'Buying it is open: a single payment.' : 'Buying it has not opened yet.'),
);
const playAnswer = dyn(
  () => config.playUrl ? 'Sim. Use o botão Jogar grátis: o jogo roda direto no navegador.' : 'Em breve. O endereço oficial do jogo ainda será confirmado e o botão Jogar grátis passa a funcionar quando ele estiver no ar.',
  () => config.playUrl ? 'Yes. Use the Play free button: the game runs right in your browser.' : 'Soon. The official address of the game is still to be confirmed, and the Play free button starts working once it is live.',
);
export const faq = [
  { question: l('O que é Arena Idle?', 'What is Arena Idle?'), answer: l('Um RPG idle: o herói caça, minera e forja enquanto você está fora. Quando volta, você equipa o Herói, escolhe o próximo foco e desce uma Masmorra de 100 andares e as Profundezas.', 'An idle RPG: your hero hunts, mines and forges while you are away. When you come back, you gear up the Hero, pick your next focus and take on a 100-floor Dungeon and the Depths.') },
  { question: l('Por que as escolhas importam?', 'Why do choices matter?'), answer: l('Algumas atividades disputam o seu tempo. Priorizar uma profissão, escolher um caminho de habilidades, investir em uma peça ou preparar o Herói para a Masmorra faz parte dessas decisões.', 'Some activities compete for your time. You decide when to focus on a profession, which skill path to follow, which piece to invest in or how to prepare your Hero for the Dungeon.') },
  { question: l('O jogo tem combate entre jogadores?', 'Does the game have player-versus-player combat?'), answer: l('Não. O combate no Arena Idle é contra monstros e chefes; não há combate entre jogadores.', 'No. Combat in Arena Idle is against monsters and bosses; there is no player-versus-player combat.') },
  { question: l('O jogo é gratuito?', 'Is the game free?'), answer: freeAnswer },
  { question: l('O que é o Passe de Aventureiro?', 'What is the Adventurer’s Pass?'), answer: passAnswer },
  { question: l('Como pago o Passe com USDC?', 'How do I pay for the Pass with USDC?'), answer: l('Você precisa de uma carteira Solana (Phantom ou Solflare) com 10 USDC e um pouco de SOL para a taxa da rede. Dentro do jogo, abra o Passe, toque em pagar com USDC, ligue a carteira e aprove a transação. O Passe é liberado assim que o pagamento é confirmado, em geral em instantes. O jogo nunca guarda o seu dinheiro nem a sua chave.', 'You need a Solana wallet (Phantom or Solflare) holding 10 USDC and a little SOL for the network fee. In the game, open the Pass, tap pay with USDC, connect your wallet and approve the transaction. The Pass unlocks as soon as the payment is confirmed, usually within moments. The game never holds your money or your key.') },
  { question: l('O que é a Liga da Temporada?', 'What is the Season League?'), answer: l('Uma competição exclusiva de quem tem o Passe, com prêmio em dinheiro, com mínimo garantido de US$ 1.000 que pode crescer conforme mais Passes forem comprados. Ela começa quando a comunidade chegar à meta de Passes; até lá roda uma pré-temporada sem prêmio. Veja a meta e os rankings na página da Liga. A pré-temporada é um teste aberto: quando a Liga começar, todos os heróis online recomeçam do zero. O Passe e o seu nome continuam.', 'A competition exclusive to Pass owners, with a cash prize, with a guaranteed minimum of US$ 1,000 that can grow as more Passes are bought. It begins when the community reaches the Pass goal; until then a pre-season with no prize runs. See the goal and the rankings on the League page. The pre-season is an open test: when the League begins, every online hero starts again from zero. Your Pass and your name stay.') },
  { question: l('Já posso jogar?', 'Can I play yet?'), answer: playAnswer },
  { question: l('O jogo está pronto?', 'Is the game finished?'), answer: l('O jogo está em desenvolvimento ativo: novos sistemas e ajustes chegam com o tempo. O Roadmap mostra o estado de cada parte, e “Disponível” quer dizer que o sistema já existe na versão atual, sem indicar que ele é final.', 'The game is in active development: new systems and tweaks arrive over time. The Roadmap shows where each part stands, and “Available” means the system already exists in the current version, not that it is final.') },
  { question: l('Em quais plataformas o jogo funciona?', 'Which platforms does the game run on?'), answer: l('Só no navegador, no computador ou no celular, sem instalar nada.', 'Only in the browser, on your computer or phone, with nothing to install.') },
  { question: l('Existe um mercado entre jogadores?', 'Is there a player market?'), answer: l('Sim. O Mercado de jogadores está pronto e abre junto com a Temporada 1. Só peças Épicas, Lendárias ou únicas sem vínculo, os materiais negociáveis e as Bolsas de Ouro podem ser negociadas, pela rede Solana com uma carteira Phantom ou Solflare, e o que você comprou pode ser revendido. Peças equipadas ficam vinculadas e deixam de ser negociáveis.', 'Yes. The Player market is ready and opens together with Season 1. Only unbound Epic, Legendary or unique pieces, tradeable materials and Gold Pouches can be traded, on the Solana network with a Phantom or Solflare wallet, and what you bought can be resold. Equipped pieces become bound and are no longer tradeable.') },
  { question: l('Existe uma data de lançamento?', 'Is there a release date?'), answer: l('Ainda não há uma data de lançamento anunciada. O roadmap comunica a direção do desenvolvimento, sem datas de entrega.', 'No release date has been announced yet. The roadmap shows our development direction without delivery dates.') },
];
export const copy = {
  headline: l('Um RPG idle que joga por você. Você só decide.', 'An idle RPG that plays for you. You just decide.'),
  subtitle: l('Cace, minere e forje enquanto você está fora. Volte para equipar o Herói e descer 100 andares de masmorra. Grátis no navegador.', 'Hunt, mine and forge while you are away. Come back to gear up your Hero and descend 100 dungeon floors. Free in the browser.'),
  funTitle: l('Por que é divertido', 'Why it is fun'),
  fun: [
    { title: l('Progresso mesmo longe', 'Progress while you are away'), body: l('Caça, mineração e forja continuam com o jogo fechado. Você vive a vida; o Herói segue trabalhando.', 'Hunting, mining and forging carry on with the game closed. You live your life; the Hero keeps working.') },
    { title: l('Um resumo ao voltar', 'A summary when you return'), body: l('Ao abrir o jogo, veja o que rendeu enquanto você esteve fora e decida o próximo passo em segundos.', 'When you open the game, see what you earned while away and pick your next step in seconds.') },
    { title: l('100 andares e chefes', '100 floors and bosses'), body: l('Desça uma masmorra de 100 andares, enfrente chefes e vá além, até as Profundezas.', 'Descend a 100-floor dungeon, face bosses and keep going, down to the Depths.') },
    { title: l('Seu equipamento, seus conjuntos', 'Your gear, your sets'), body: l('Forje, melhore e monte conjuntos: o poder do Herói vem do que você constrói.', 'Forge, upgrade and assemble sets: your Hero’s power comes from what you build.') },
  ],
  choicesTitle: l('Nem tudo pode ser maximizado ao mesmo tempo.', 'You can’t maximize everything at once.'),
  choicesBody: l('Algumas atividades disputam o seu tempo. Escolher onde se especializar faz parte do jogo.', 'Some activities compete for your time. Choosing what to specialize in is part of the game.'),
  loopTitle: l('Das atividades à Masmorra.', 'From activities to the Dungeon.'),
  loopBody: l('Recursos, equipamento e evolução do Herói fazem parte de um mesmo ciclo. A cada etapa, você decide o que desenvolver a seguir.', 'Activities, resources, gear and Hero progression work together. Each step gives you a reason to reconsider your next priority.'),
  roadmapNote: l('O roadmap representa a direção atual do projeto e pode evoluir conforme o desenvolvimento.', 'The roadmap reflects the project’s current direction and may change as development continues.'),
  availableNote: l('Sistemas existentes na versão atual; “Disponível” não quer dizer que o sistema é final.', 'Systems in the current version; “Available” does not mean a system is final.'),
  noNews: l('Comunicados do desenvolvimento serão reunidos aqui quando houver novidades para compartilhar. Enquanto isso, conheça o estado atual no Roadmap.', 'Development news will appear here when there is something to share. For the current state of the project, visit the Roadmap.'),
  gameTitle: l('O jogo hoje', 'The game today'),
  gameBody: l('Capturas da versão atual do Arena Idle.', 'Screenshots from the current version of Arena Idle.'),
};
// Meta descriptions per page (search results and shared links). Pages without an entry use `default`.
export const descriptions = {
  default: l('Um RPG idle que joga por você: cace, minere e forje enquanto está fora e volte para equipar o Herói e descer 100 andares. Grátis no navegador.', 'An idle RPG that plays for you: hunt, mine and forge while away, then return to gear up your Hero and descend 100 floors. Free in the browser.'),
  about: l('O que é o jogo: um RPG idle em que o Herói caça, minera e forja enquanto você está fora, e você decide como evoluir.', 'What the game is: an idle RPG where your Hero hunts, mines and forges while you are away and you decide how to grow.'),
  systems: l('Herói, profissões, Caça, Forja, Masmorra de 100 andares e Profundezas: os sistemas do jogo e como eles se conectam.', 'Hero, professions, Hunting, the Forge, a 100-floor Dungeon and the Depths: the game’s systems and how they connect.'),
  pass: dyn(
    () => config.passSalesOpen ? `O Passe de Aventureiro: vale para a pré-temporada e a Temporada 1, ${config.passPrice} em pagamento único, com vantagens e a Temporada do Passe.` : 'O Passe de Aventureiro chega em breve: vale para a pré-temporada e a Temporada 1, com vantagens, a Temporada do Passe e acesso à Liga da Temporada.',
    () => config.passSalesOpen ? `The Adventurer’s Pass: counts for the pre-season and Season 1, ${config.passPrice} in a single payment, with perks and the Pass Season.` : 'The Adventurer’s Pass is coming soon: it counts for the pre-season and Season 1, with perks, the Pass Season and access to the Season League.',
  ),
  season: l('A Liga da Temporada: competição com prêmio em dinheiro (mínimo de US$ 1.000), meta de Passes da comunidade e rankings ao vivo.', 'The Season League: a competition with a cash prize (US$ 1,000 minimum), the community Pass goal and live rankings.'),
  roadmap: l('O estado de cada parte do jogo: o que já existe, o que está em desenvolvimento e o que vem depois.', 'Where each part of the game stands: what exists, what is in development and what comes next.'),
  faq: l('Perguntas frequentes: é grátis, como funciona o Passe, a Liga da Temporada, plataformas e estado do jogo.', 'Frequently asked questions: is it free, how the Pass works, the Season League, platforms and the state of the game.'),
  news: l('Novidades e comunicados do desenvolvimento do jogo.', 'News and updates from the game’s development.'),
  play: l('Como jogar: o jogo roda grátis no navegador.', 'How to play: the game runs free in your browser.'),
};
// Legal pages are owner-provided text. They exist only as clearly marked placeholders; the footer links one only when its `flag` in config.legalLive is true (real text in place).
export const legal = [
  { route: 'privacy', flag: 'privacy', title: l('Política de Privacidade', 'Privacy Policy') },
  { route: 'terms', flag: 'terms', title: l('Termos de Uso', 'Terms of Use') },
  { route: 'refund', flag: 'refund', title: l('Política de Reembolso', 'Refund Policy') },
  { route: 'season-rules', flag: 'seasonRules', title: l('Regulamento da Liga', 'League Rules') },
];
export const legalPlaceholder = l('Texto a ser fornecido pelo responsável do jogo.', 'Text to be provided by the game’s owner.');
// "Avise-me no lançamento" (waitlist). The consent sentence is fixed by the owner; the block only renders when config.waitlistEnabled is true.
export const waitlist = {
  eyebrow: l('Lançamento', 'Launch'),
  title: l('Avise-me no lançamento', 'Notify me at launch'),
  lead: l('Deixe seu e-mail para ser avisado quando o Arena Idle abrir. Só o aviso do lançamento, nada de spam.', 'Leave your email to hear when Arena Idle opens. Just the launch notice, no spam.'),
  compactLead: l('Quer saber quando a Liga e o jogo abrem? Deixe seu e-mail.', 'Want to know when the League and the game open? Leave your email.'),
  emailLabel: l('Seu e-mail', 'Your email'),
  emailPlaceholder: l('voce@exemplo.com', 'you@example.com'),
  consent: l('Quero receber e-mails sobre o lançamento do Arena Idle. Posso cancelar quando quiser.', 'I want to receive emails about the Arena Idle launch. I can cancel any time.'),
  privacyLink: l('Política de Privacidade', 'Privacy Policy'),
  honeypotLabel: l('Não preencha este campo', 'Leave this field empty'),
  submit: l('Avise-me', 'Notify me'),
  sending: l('Enviando…', 'Sending…'),
  registered: l('Você está na lista. Avisaremos quando o Arena Idle abrir.', 'You are on the list. We will let you know when Arena Idle opens.'),
  badEmail: l('Confira o e-mail digitado.', 'Please check the email you typed.'),
  needConsent: l('Marque a caixa para receber o aviso.', 'Tick the box to receive the notice.'),
  rateLimited: l('Muitas tentativas. Tente de novo mais tarde.', 'Too many attempts. Please try again later.'),
  failed: l('Não foi possível salvar agora. Tente de novo em instantes.', 'Could not save right now. Please try again in a moment.'),
  unavailable: l('O cadastro ainda não está disponível. Volte em breve.', 'Sign-up is not available yet. Please come back soon.'),
  noscript: l('O cadastro precisa de JavaScript. Ative-o no navegador para deixar seu e-mail.', 'Sign-up needs JavaScript. Turn it on in your browser to leave your email.'),
  count: l('{n} aventureiros na lista', '{n} adventurers on the list'),
  unsubTitle: l('Cancelar o aviso de lançamento', 'Cancel the launch notice'),
  unsubLead: l('Confirme para parar de receber e-mails sobre o lançamento do Arena Idle.', 'Confirm to stop receiving emails about the Arena Idle launch.'),
  unsubButton: l('Cancelar o aviso', 'Cancel the notice'),
  unsubDone: l('Pronto. Você não receberá mais e-mails sobre o lançamento.', 'Done. You will not receive any more launch emails.'),
  unsubBad: l('Este link não é válido. Use o link do e-mail mais recente.', 'This link is not valid. Use the link from the most recent email.'),
  unsubFailed: l('Não foi possível cancelar agora. Tente de novo em instantes.', 'Could not cancel right now. Please try again in a moment.'),
  unsubNoscript: l('Para cancelar por aqui é preciso JavaScript. Ou responda ao e-mail pedindo o cancelamento.', 'Cancelling here needs JavaScript. Or reply to the email asking to be removed.'),
};
// Referral links ("Seu link de convite"), shown after the sign-up only when config.referralEnabled is true. The reward list below must say what the database tiers say
// (arena_private.referral_rewards, docs/WAITLIST.md): when you change a tier there, change the matching line here and rebuild.
export const referral = {
  title: l('Seu link de convite', 'Your invite link'),
  lead: l('Convide amigos para a lista e ganhe recompensas dentro do jogo.', 'Invite friends to the list and earn rewards inside the game.'),
  linkLabel: l('Seu link de convite', 'Your invite link'),
  copy: l('Copiar link', 'Copy link'),
  copied: l('Link copiado.', 'Link copied.'),
  copyFailed: l('Não deu para copiar sozinho. Selecione o link e copie.', 'Could not copy automatically. Select the link and copy it.'),
  shareTitle: l('Compartilhar', 'Share'),
  shareWhatsapp: l('WhatsApp', 'WhatsApp'),
  shareX: l('X', 'X'),
  shareTelegram: l('Telegram', 'Telegram'),
  shareText: l('Vem jogar Arena Idle comigo! Entre na lista do lançamento: {url}', 'Come play Arena Idle with me! Join the launch list: {url}'),
  counts: l('Convites ativos: {active} · Compraram o Passe: {paying} de {goal}', 'Active invites: {active} · Bought the Pass: {paying} of {goal}'),
  countsNoGoal: l('Convites ativos: {active} · Compraram o Passe: {paying}', 'Active invites: {active} · Bought the Pass: {paying}'),
  countsNote: l('A contagem aparece aqui, neste navegador, e depois do lançamento nas Configurações do jogo.', 'The count shows here, in this browser, and after launch in the game’s Settings.'),
  rewardsTitle: l('Recompensas dentro do jogo', 'Rewards inside the game'),
  tiers: [
    l('1 convite ativo: o título Recrutador', '1 active invite: the Recruiter title'),
    l('3 convites ativos: uma moldura de retrato', '3 active invites: a portrait frame'),
    l('10 amigos que comprarem o Passe: um Passe de Aventureiro grátis', '10 friends who buy the Pass: a free Adventurer’s Pass'),
    l('25 convites ativos: o título Lenda do Recrutamento', '25 active invites: the Recruitment Legend title'),
  ],
  rules: l('Um convite fica ativo quando a pessoa cria a conta no jogo com o mesmo e-mail e chega ao nível 10 do Herói, depois do lançamento. Os prêmios são entregues dentro do jogo. Convidar a si mesmo não conta, e uma compra reembolsada sai da contagem do Passe (um prêmio já entregue fica).', 'An invite becomes active when the person creates a game account with the same email and reaches Hero level 10, after launch. Rewards are delivered inside the game. Inviting yourself does not count, and a refunded purchase leaves the Pass count (a reward already delivered stays).'),
};

// Home page, in the order of the owner's redesign plan: hero, Season (pre-season while the League has not begun), Pass, 3 steps, screenshots, 4 pillars, roadmap teaser, final call.
// Every claim follows the rest of this file: the League prize is a minimum of US$ 1,000 and can grow; no PvP and no crypto are promised. The Season card says "Pré-temporada"
// until the owner switches `home.season` to the League text when it opens (the live state is on the Temporada page).
export const home = {
  headline: l('Progressão idle com disputa de temporada.', 'Idle progression with a seasonal contest.'),
  sub: l('Evolua seu herói, desenvolva profissões, conquiste equipamentos raros e dispute as melhores posições a cada temporada.', 'Grow your hero, train professions, earn rare gear and compete for the top spots every season.'),
  learn: l('Conhecer o jogo', 'Discover the game'),
  playtest: l('Entrar no Playtest', 'Join the Playtest'),
  season: {
    eyebrow: l('Temporada 1', 'Season 1'), title: l('Pré-temporada', 'Pre-season'), tagline: l('Teste seu progresso antes da primeira temporada oficial.', 'Test your progress before the first official season.'),
    bullets: [
      { icon: 'trophy', title: l('Ranking da pré-temporada', 'Pre-season ranking'), body: l('Para quem tem o Passe. Sem premiação oficial.', 'For Pass owners. No official prize.') },
      { icon: 'bars', title: l('Meta da comunidade', 'Community goal'), body: l('Quando a barra de Passes encher, a Temporada 1 começa.', 'When the Pass bar fills, Season 1 begins.') },
      { icon: 'coin', title: l('Prêmio da Temporada 1', 'Season 1 prize'), body: l('Mínimo de US$ 1.000 para os primeiros lugares, só para quem tem o Passe.', 'At least US$ 1,000 for the top places, for Pass owners only.') },
    ],
    lengthLabel: l('Temporada 1', 'Season 1'), length: l('60 dias de disputa', '60 days of contest'), cta: l('Ver a Temporada', 'See the Season'), art: l('Taça dourada da Temporada', 'Golden Season trophy'),
  },
  pass: {
    eyebrow: l('Passe', 'Pass'), title: l('Passe do Aventureiro', 'Adventurer’s Pass'), tagline: l('Vale para a pré-temporada e toda a Temporada 1.', 'Counts for the pre-season and all of Season 1.'),
    bullets: [
      { icon: 'rise', title: l('Bônus de progresso', 'Progress bonus'), body: l('Mais Ouro e materiais, reparo mais barato.', 'More Gold and materials, cheaper repair.') },
      { icon: 'shield', title: l('Mais conforto', 'More comfort'), body: l('Mais espaço e mais tempo acumulando com o jogo fechado.', 'More room and longer accumulation while the game is closed.') },
      { icon: 'crown', title: l('Acesso à Temporada', 'Season access'), body: l('Só quem tem o Passe disputa o ranking e o prêmio.', 'Only Pass owners compete for the ranking and the prize.') },
    ],
    once: l('Pagamento único', 'One-time payment'), saleLabel: l('Venda', 'Sale'), soon: l('Em breve', 'Soon'), cta: l('Ver benefícios do Passe', 'See the Pass benefits'), art: l('Carta dourada do Passe do Aventureiro', 'Golden card of the Adventurer’s Pass'),
  },
  features: [
    { icon: 'hero', title: l('Progressão idle', 'Idle progression'), body: l('Seu herói evolui, mesmo offline.', 'Your hero grows, even offline.') },
    { icon: 'swords', title: l('Combate automático', 'Automatic combat'), body: l('Estratégia e construção de build.', 'Strategy and build crafting.') },
    { icon: 'bars', title: l('Temporadas de 60 dias', '60-day seasons'), body: l('Ranking e recompensas a cada temporada.', 'Ranking and rewards every season.') },
    { icon: 'chest', title: l('Itens lendários', 'Legendary items'), body: l('Equipe, colecione, evolua.', 'Equip, collect, evolve.') },
  ],
  market: {
    eyebrow: l('Mercado de jogadores', 'Player market'), title: l('Negocie seus tesouros.', 'Trade your treasures.'), tagline: l('Abre junto com a Temporada 1.', 'Opens together with Season 1.'),
    bullets: [
      { icon: 'swords', title: l('Peças raras', 'Rare pieces'), body: l('Venda e compre peças Épicas, Lendárias e únicas de outros jogadores.', 'Sell and buy Epic, Legendary and unique pieces with other players.') },
      { icon: 'coin', title: l('Materiais e Bolsas de Ouro', 'Materials and Gold Pouches'), body: l('Materiais negociáveis e Bolsas de Ouro também entram no Mercado.', 'Tradeable materials and Gold Pouches are on the Market too.') },
      { icon: 'rise', title: l('Revenda liberada', 'Resale allowed'), body: l('O que você comprou pode ser revendido. Equipou, ficou com você.', 'What you bought can be resold. Once equipped, it is yours.') },
    ],
    network: l('Na rede Solana, com carteira Phantom ou Solflare.', 'On the Solana network, with a Phantom or Solflare wallet.'),
    cta: l('Como funciona o Mercado', 'How the Market works'), art: l('Dois aventureiros encapuzados negociam uma espada lendária, um elmo e cristais numa banca de mercado à luz de tochas.', 'Two hooded adventurers trade a legendary sword, a helmet and crystals at a torch-lit market stall.'),
  },
  stepsEyebrow: l('Como funciona', 'How it works'), stepsTitle: l('Três passos. O resto o herói faz.', 'Three steps. Your hero does the rest.'),
  steps: [
    { icon: 'hourglass', title: l('Deixe trabalhando', 'Let it work'), body: l('Caça, Mineração, Lenhador e Horta continuam rendendo enquanto você está fora.', 'Hunting, Mining, Woodcutting and the Garden keep paying off while you are away.') },
    { icon: 'chest', title: l('Volte e equipe', 'Come back and gear up'), body: l('Colete o que rendeu, forje equipamento e monte a sua build.', 'Collect what you earned, forge gear and shape your build.') },
    { icon: 'rise', title: l('Avance', 'Push forward'), body: l('Desça a Masmorra, consiga loot melhor e suba no ranking da temporada.', 'Descend the Dungeon, get better loot and climb the season ranking.') },
  ],
  shotsEyebrow: l('Capturas reais', 'Real screenshots'), shotsTitle: l('O jogo hoje', 'The game today'),
  gallery: ['dungeon', 'base', 'hunt', 'forge', 'inventory'],
  pillarsEyebrow: l('Sistemas', 'Systems'), pillarsTitle: l('Quatro pilares da sua jornada.', 'Four pillars of your journey.'), pillarsCta: l('Ver todos os sistemas', 'See every system'),
  pillars: [
    { icon: 'swords', anchor: 'combat', title: l('Caça', 'Hunting'), body: l('Derrote monstros, acumule recursos e busque drops raros.', 'Defeat monsters, stack up resources and chase rare drops.') },
    { icon: 'hourglass', anchor: 'professions', title: l('Profissões', 'Professions'), body: l('Mineração, Lenhador, Horta e Ofícios constroem sua economia e sua progressão.', 'Mining, Woodcutting, Garden and Crafting build your economy and your progress.') },
    { icon: 'shield', anchor: 'hero-gear', title: l('Forja e equipamento', 'Forge and gear'), body: l('Crie, melhore e encontre equipamentos de raridades e atributos diferentes.', 'Craft, upgrade and find gear of different rarities and stats.') },
    { icon: 'crown', anchor: 'combat', title: l('Masmorra', 'Dungeon'), body: l('Teste sua força, avance pelos andares e enfrente chefes cada vez mais fortes.', 'Test your strength, push through the floors and face ever stronger bosses.') },
  ],
  roadmapTitle: l('Veja o que está chegando ao Arena Idle.', 'See what is coming to Arena Idle.'), roadmapCta: l('Ver Roadmap', 'View the Roadmap'),
  finalTitle: l('Sua jornada começa antes da primeira temporada.', 'Your journey starts before the first season.'),
  finalBody: l('Entre no playtest, evolua seu herói e ajude a preparar o Arena Idle para a Temporada 1.', 'Join the playtest, grow your hero and help get Arena Idle ready for Season 1.'),
};
