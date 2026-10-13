export const localized = (pt, en) => ({ pt, en });
const l = localized;
export const config = { playUrl: null, community: [], brand: 'Arena Duel', pageSize: 8 };
// Player-facing glossary, reused throughout the portal.
export const glossary = {
  hero: l('Herói', 'Hero'), heroProgression: l('Progressão do Herói', 'Hero Progression'),
  gear: l('Equipamento', 'Gear'), dungeon: l('Masmorra', 'Dungeon'), pvp: l('JxJ', 'PvP'),
  pass: l('Passe', 'Pass'), mining: l('Mineração', 'Mining'), woodcutting: l('Lenhador', 'Woodcutting'),
  gardening: l('Jardinagem', 'Gardening'), hunting: l('Caça', 'Hunting'),
  craft: l('Criação', 'Craft'), upgrade: l('Aprimoramento', 'Upgrade'), reforge: l('Reforja', 'Reforge'),
  orders: l('Pedidos', 'Orders'),
};
export const states = {
  available: { label: l('Disponível', 'Available'), definition: l('Já existe na versão atual em desenvolvimento do Arena Duel.', 'Already part of the current development version of Arena Duel.') },
  development: { label: l('Em desenvolvimento', 'In development'), definition: l('Está sendo trabalhado ativamente.', 'Currently being worked on.') },
  planned: { label: l('Planejado', 'Planned'), definition: l('Faz parte da direção atual do projeto, mas ainda não possui previsão de lançamento.', 'Part of the current direction, with no release window yet.') },
  future: { label: l('Visão futura', 'Future vision'), definition: l('Ideias e sistemas que poderão fazer parte da evolução do Arena Duel.', 'Ideas and systems that may become part of Arena Duel as it evolves.') },
};
export const systems = [
  { id: 'hero', term: 'heroProgression', body: l('Desenvolva seu Herói com as atividades e o equipamento que escolher priorizar.', 'Develop your Hero through the activities and gear you choose to focus on.') },
  { id: 'gear', term: 'gear', body: l('Conquiste peças de equipamento e escolha como investir na sua evolução.', 'Collect individual pieces of gear and decide which ones to invest in.') },
  { id: 'upgrade', term: 'upgrade', body: l('Use o Aprimoramento para fortalecer seu equipamento.', 'Use Upgrade to strengthen your gear.') },
  { id: 'reforge', term: 'reforge', body: l('A Reforja oferece outro caminho para desenvolver seu equipamento.', 'Reforge gives you another way to develop your gear.') },
  { id: 'mining', term: 'mining', body: l('Dedique tempo à extração de recursos pela Mineração.', 'Gather resources by spending time mining.') },
  { id: 'woodcutting', term: 'woodcutting', body: l('Trabalhe como Lenhador e reúna madeira para sua progressão.', 'Gather wood as you develop Woodcutting.') },
  { id: 'gardening', term: 'gardening', body: l('Cultive recursos e desenvolva sua Jardinagem.', 'Grow resources and develop Gardening.') },
  { id: 'hunting', term: 'hunting', body: l('Dedique parte da progressão à Caça e à obtenção de recursos.', 'Hunt to gather resources and advance your progression.') },
  { id: 'dungeon', term: 'dungeon', body: l('Prepare o Herói e seu equipamento para os desafios da Masmorra normal.', 'Prepare your Hero and gear for the challenges of the normal Dungeon.') },
  { id: 'craft', term: 'craft', body: l('Conecte os recursos das atividades à criação de equipamento.', 'Turn the resources you gather into gear through Craft.') },
  { id: 'orders', term: 'orders', body: l('Inclua Pedidos entre suas atividades e decida quando dedicar tempo a eles.', 'Fit Orders into your activities and decide when to spend time on them.') },
];
export const groups = [
  { id: 'hero-gear', status: 'available', title: l('Herói e equipamento', 'Hero and gear'), body: l('A evolução do Herói e das peças que você usa se complementam. Aprimoramento e Reforja fazem parte desse investimento.', 'Your Hero and gear develop together. Upgrade and Reforge help you invest in the pieces you use.'), systems: ['hero', 'gear', 'upgrade', 'reforge'] },
  { id: 'professions', status: 'available', title: l('Profissões', 'Professions'), body: l('Mineração, Lenhador e Jardinagem são caminhos de obtenção de recursos. Escolher a qual se dedicar dá direção à sua progressão.', 'Mining, Woodcutting and Gardening provide resources. Choosing where to spend your time shapes your progression.'), systems: ['mining', 'woodcutting', 'gardening'] },
  { id: 'combat', status: 'available', title: l('Combate e exploração', 'Combat and exploration'), body: l('A Caça reúne recursos; a Masmorra traz desafios para o Herói. Sua preparação conecta essas atividades à evolução do equipamento.', 'Hunting supplies resources, while the Dungeon challenges your Hero. Preparation ties both activities to your gear progression.'), systems: ['hunting', 'dungeon'] },
  { id: 'resources', status: 'available', title: l('Recursos e progressão', 'Resources and progression'), body: l('A Criação conecta recursos a equipamento. Pedidos ampliam as atividades entre as quais você distribui seu tempo.', 'Craft connects resources to gear. Orders add another activity to consider when planning your time.'), systems: ['craft', 'orders'] },
];
export const progression = [
  { title: l('Escolha uma atividade', 'Choose an activity'), body: l('Profissões e Caça', 'Professions and Hunting'), target: 'professions' },
  { title: l('Reúna recursos', 'Gather resources'), body: l('Da atividade à Criação', 'Materials for Craft'), target: 'resources' },
  { title: l('Crie e equipe', 'Craft and equip'), body: l('Equipamento para o Herói', 'Gear for your Hero'), target: 'hero-gear' },
  { title: l('Invista nas peças', 'Improve your gear'), body: l('Aprimoramento e Reforja', 'Upgrade and Reforge'), target: 'hero-gear' },
  { title: l('Fortaleça o Herói', 'Strengthen your Hero'), body: l('Prepare-se para os desafios', 'Prepare for challenges'), target: 'hero-gear' },
  { title: l('Enfrente a Masmorra', 'Take on the Dungeon'), body: l('Combate e progressão', 'Combat and progression'), target: 'combat' },
  { title: l('Decida o próximo foco', 'Choose your next focus'), body: l('Volte às atividades com um objetivo', 'Return to activities with a goal'), target: 'professions' },
];
export const competition = {
  title: l('Competição em desenvolvimento', 'Developing competition'),
  body: l('Estamos desenvolvendo o formato competitivo do Arena Duel.', 'We’re working on Arena Duel’s competitive format.'),
  note: l('Formato, critérios de participação, ranking e eventuais recompensas serão anunciados quando estiverem definidos.', 'The format, participation criteria, ranking and any rewards will be announced once they are defined.'),
  categories: ['heroProgression', 'mining', 'woodcutting', 'gardening'],
};
export const pvp = {
  title: l('CP não será tudo.', 'CP won’t be everything.'),
  body: l('O JxJ está sendo pensado para valorizar estratégia, preparação e escolhas de build — não apenas poder bruto.', 'Our vision for PvP puts strategy, preparation and build choices alongside raw power.'),
  note: l('Essa é a filosofia para o futuro do JxJ. O formato ainda está em estudo, sem previsão de lançamento.', 'This is the direction we want to explore for PvP. The format is still under consideration, with no release window.'),
};
export const roadmap = [
  { id: 'core', status: 'available', title: l('Progressão conectada', 'Connected progression'), body: l('Herói, equipamento, Aprimoramento, Reforja, Criação, profissões, Caça, Masmorra normal e Pedidos.', 'Hero progression, gear, Upgrade, Reforge, Craft, professions, Hunting, normal Dungeon and Orders.') },
  { id: 'onboarding', status: 'available', title: l('Primeiros passos guiados', 'Getting started'), body: l('Tutorial, configurações, português e inglês e opção de ligar ou desligar o som.', 'A guided tutorial, settings, Portuguese and English, and sound controls.') },
  { id: 'competition', status: 'development', title: competition.title, body: competition.body },
  { id: 'pvp', status: 'future', title: pvp.title, body: l('Uma visão de JxJ que valoriza estratégia, preparação e escolhas de build.', 'A vision for PvP that values strategy, preparation and build choices.') },
  { id: 'world', status: 'future', title: l('Mais atividades e desafios', 'More activities and challenges'), body: l('Novas zonas de Caça, equipamento, recursos e eventos temporários são possibilidades para a evolução do jogo.', 'New hunting zones, gear, resources and temporary events are possibilities for the game’s future.') },
  { id: 'long-term', status: 'future', title: l('Novas formas de progressão', 'New ways to progress'), body: l('Novas atividades, mecânicas de profissão e temporadas poderão ampliar a experiência.', 'New activities, profession mechanics and seasons could expand the experience.') },
];
// Reviewed records only. Rich content schema: src/editorial.mjs and EDITORIAL.md.
export const articles = [];
export const futureRoutes = ['rankings', 'seasons', 'account', 'profile', 'marketplace'];
export const faq = [
  { question: l('O que é Arena Duel?', 'What is Arena Duel?'), answer: l('Um RPG web com progressão idle em desenvolvimento ativo. Atividades fornecem recursos, a Criação conecta recursos a equipamento, e o Herói se prepara para novos desafios.', 'Arena Duel is an idle web RPG in active development. Activities provide resources, Craft turns resources into gear, and your Hero prepares for further challenges.') },
  { question: l('Por que as escolhas importam?', 'Why do choices matter?'), answer: l('Algumas atividades disputam o seu tempo de progressão. Priorizar uma profissão, investir em equipamento ou preparar o Herói para a Masmorra faz parte dessas decisões.', 'Some activities compete for your progression time. You decide when to focus on a profession, invest in gear or prepare your Hero for the Dungeon.') },
  { question: l('O jogo será gratuito?', 'Will the game be free?'), answer: l('Sim. Arena Duel será gratuito, com Passe e outras formas de monetização previstas para o futuro. Os detalhes ainda serão definidos.', 'Yes. Arena Duel will be free to play, with a Pass and other monetization options planned for the future. Details have yet to be decided.') },
  { question: l('O que significa “Disponível”?', 'What does “Available” mean?'), answer: l('O sistema já existe na versão em desenvolvimento. Isso não indica lançamento público nem uma versão final.', 'The system exists in the development version. This does not mean the game has launched publicly or that the system is final.') },
  { question: l('Já posso jogar?', 'Can I play yet?'), answer: l('O portal ainda não possui um endereço oficial de acesso ao jogo. Até sua confirmação, acompanhe o desenvolvimento pelo Roadmap.', 'An official play link has not been confirmed for this portal yet. You can follow development through the Roadmap in the meantime.') },
  { question: l('Como funcionará a competição?', 'How will competition work?'), answer: competition.note },
  { question: l('Como será o JxJ?', 'What is the vision for PvP?'), answer: pvp.body },
  { question: l('Existe uma data de lançamento?', 'Is there a release date?'), answer: l('Ainda não há uma data oficial anunciada. O roadmap comunica a direção do desenvolvimento, sem datas de entrega.', 'No official release date has been announced. The roadmap shows our development direction without delivery dates.') },
];
export const copy = {
  headline: l('Progressão que exige escolhas.', 'Progress shaped by your choices.'),
  subtitle: l('Evolua seu Herói, desenvolva profissões, conquiste equipamento e decida onde investir seu tempo.', 'Develop your Hero, build up professions and gather gear. Decide where your time will make the difference.'),
  choicesTitle: l('Nem tudo pode ser maximizado ao mesmo tempo.', 'You can’t maximize everything at once.'),
  choicesBody: l('Algumas atividades disputam o seu tempo de progressão. Escolher onde se especializar faz parte do jogo.', 'Some activities compete for your progression time. Choosing what to specialize in is part of the game.'),
  loopTitle: l('Das atividades à Masmorra.', 'From activities to the Dungeon.'),
  loopBody: l('Recursos, equipamento e evolução do Herói fazem parte de um mesmo ciclo. A cada etapa, você decide o que desenvolver a seguir.', 'Activities, resources, gear and Hero progression work together. Each step gives you a reason to reconsider your next priority.'),
  roadmapNote: l('O roadmap representa a direção atual do projeto e pode evoluir conforme o desenvolvimento.', 'The roadmap reflects the project’s current direction and may change as development continues.'),
  availableNote: l('Sistemas existentes na versão em desenvolvimento; não indica lançamento público.', 'Existing systems in the development version; this does not indicate a public launch.'),
  noNews: l('Comunicados do desenvolvimento serão reunidos aqui quando houver novidades para compartilhar. Enquanto isso, conheça o estado atual no Roadmap.', 'Development news will appear here when there is something to share. For the current state of the project, visit the Roadmap.'),
};
