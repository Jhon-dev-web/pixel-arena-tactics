import { config, seasonPage, glossary, states, systems, groups, progression, league, market, roadmap, articles, faq, copy, descriptions, shots, legal, legalPlaceholder, waitlist, referral, home } from './content.mjs';
import { escapeHtml as esc, editorialTypes, publishedArticles, paginate, neighbors, renderBlocks } from './editorial.mjs';
import { cleanSupabaseUrl, failedRows } from '../public/season-core.js';

export const OG_IMAGE = { file: { pt: '/img/og.jpg', en: '/img/og-en.jpg' }, width: 1200, height: 630 };

export const routes = ['', 'about', 'systems', 'pass', 'championship', 'season', 'roadmap', 'news', 'dev-updates', 'major-updates', 'patch-notes', 'faq', 'play'];
export function renderSite(lang) {
  const t = (pt, en) => lang === 'pt' ? pt : en;
  const pick = value => value[lang];
  const url = route => `/${lang}/${route}${route ? '/' : ''}`;
  const link = (route, label, cls = '', hash = '') => `<a class="${cls}" href="${url(route)}${hash}">${label}</a>`;
  const badge = status => `<span class="badge ${status}">${pick(states[status].label)}</span>`;
  const playLabel = t('Jogar grátis', 'Play free');
  // The play button: live when config.playUrl is set, otherwise visibly disabled ("Em breve"). It never points at the roadmap.
  const primary = (cls = '', compact = false) => config.playUrl
    ? `<a class="button ${cls}" href="${esc(config.playUrl)}">${playLabel} ↗</a>`
    : `<span class="button disabled ${cls}" role="link" aria-disabled="true">${compact ? t('Em breve', 'Soon') : playLabel + ' · ' + t('Em breve', 'Soon')}</span>`;
  const passLink = (cls = 'button secondary') => link('pass', t('Conhecer o Passe', 'See the Pass'), cls);
  // The buy link of the Pass: the game's own address with ?comprar=passe. Only used when config.passSalesOpen is true.
  const buyHref = config.playUrl ? (() => { const u = new URL(config.playUrl); u.searchParams.set('comprar', 'passe'); return u.toString(); })() : null;
  const intro = (label, title, body, status = '') => `<section class="page-intro"><p class="eyebrow">${label}</p>${status ? badge(status) : ''}<h1>${title}</h1><p class="lead">${body}</p></section>`;
  const terms = keys => keys.map(key => pick(glossary[key]));
  const loop = () => `<ol class="progression-loop" aria-label="${t('Ciclo de progressão', 'Progression loop')}">${progression.map((step, index) => `<li>${link('systems', `<span class="step-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><h3>${pick(step.title)}</h3><p>${pick(step.body)}</p><span class="step-arrow" aria-hidden="true">${index === progression.length - 1 ? '↻' : '→'}</span>`, '', '#' + step.target)}</li>`).join('')}</ol>`;
  const roadmapLegend = () => `<div class="status-legend" aria-label="${t('Significado dos estados', 'Status definitions')}">${Object.entries(states).map(([status, value]) => `<div>${badge(status)}<p>${pick(value.definition)}</p></div>`).join('')}</div>`;
  const road = (preview = false) => `<div class="roadmap ${preview ? 'roadmap-preview' : ''}">${Object.keys(states).filter(status => roadmap.some(item => item.status === status)).map(status => {
    const items = roadmap.filter(item => item.status === status).slice(0, preview ? 1 : undefined);
    return `<section class="road-column" data-status="${status}"><h${preview ? '3' : '2'}>${badge(status)}</h${preview ? '3' : '2'}><p class="status-definition">${pick(states[status].definition)}</p>${items.map(item => `<article><h${preview ? '4' : '3'}>${pick(item.title)}</h${preview ? '4' : '3'}><p>${pick(item.body)}</p></article>`).join('')}</section>`;
  }).join('')}</div><p class="note">${pick(copy.roadmapNote)}</p>`;
  const date = value => new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value));
  const postCards = list => `<div class="post-list">${list.map(record => `<article class="post-card">${record.image ? `<img src="${esc(record.image.src)}" alt="${esc(pick(record.image.alt))}" width="${record.image.width}" height="${record.image.height}" loading="lazy">` : ''}<p class="post-meta">${pick(editorialTypes[record.type].label)} · <time datetime="${record.date}">${date(record.date)}</time>${record.version ? ` · ${esc(record.version)}` : ''}</p><h3>${link('news/' + record.slug, esc(pick(record.title)))}</h3><p>${esc(pick(record.summary))}</p>${record.categories.length ? `<ul class="tags">${record.categories.map(category => `<li>${esc(pick(category))}</li>`).join('')}</ul>` : ''}</article>`).join('')}</div>`;
  const editorialFilters = active => {
    const types = Object.entries(editorialTypes).filter(([type]) => publishedArticles(articles, type).length);
    if (!types.length) return '';
    return `<nav class="filter-nav" aria-label="${t('Tipos de publicação', 'Publication types')}"><a href="${url('news')}" ${active === 'news' ? 'aria-current="page"' : ''}>${t('Todas', 'All')}</a>${types.map(([, value]) => `<a href="${url(value.route)}" ${active === value.route ? 'aria-current="page"' : ''}>${pick(value.label)}</a>`).join('')}</nav>`;
  };
  const newsEmpty = () => `<div class="empty"><h2>${t('Acompanhe o que está em desenvolvimento.', 'See what we’re working on.')}</h2><p>${pick(copy.noNews)}</p>${link('roadmap', t('Ver roadmap', 'View roadmap'), 'button secondary')}</div>`;
  const allPosts = publishedArticles(articles);
  const showNews = allPosts.length >= 2;
  // The header JOGAR button: gold when the game address is set, otherwise the disabled "Em breve".
  const headerPlay = config.playUrl ? `<a class="button h-gold nav-play" href="${esc(config.playUrl)}">${t('Jogar', 'Play')}</a>` : primary('', true);
  const community = () => config.community.length ? `<section class="section community"><p class="eyebrow">${t('Comunidade', 'Community')}</p><h2>${t('Converse sobre Arena Idle.', 'Talk about Arena Idle.')}</h2><div class="actions">${config.community.map(channel => `<a class="button secondary" href="${esc(channel.url)}">${esc(pick(channel.label))} ↗</a>`).join('')}</div></section>` : '';
  // "Avise-me no lançamento": hidden entirely while config.waitlistEnabled is false. The form itself stays hidden until /waitlist.js runs (no JavaScript = a short note, never a broken form);
  // when the Supabase address is not configured it says the sign-up is not available yet. The honeypot is moved off-screen by CSS (not display:none, which bots skip).
  const waitlistLive = Boolean(cleanSupabaseUrl(config.supabaseUrl));
  const waitlistPrivacy = config.legalLive.privacy && legal.find(page => page.route === 'privacy')?.body ? link('privacy', pick(waitlist.privacyLink)) : '';
  const waitlistLabels = () => JSON.stringify({
    ...Object.fromEntries(['registered', 'badEmail', 'needConsent', 'rateLimited', 'failed', 'sending', 'count'].map(key => [key, pick(waitlist[key])])),
    ...(config.referralEnabled ? Object.fromEntries(['copied', 'copyFailed', 'shareText', 'counts', 'countsNoGoal'].map(key => [key, pick(referral[key])])) : {}),
  });
  // The invite panel (config.referralEnabled): hidden until the script has the person's own code. The share buttons get their href from the script (the intent of each network, no third-party script).
  const referralPanel = variant => !config.referralEnabled ? '' : `<div class="wl-referral" data-wl-referral hidden>
<h3>${pick(referral.title)}</h3><p class="wl-lead">${pick(referral.lead)}</p>
<div class="wl-link-row"><input class="wl-link" type="text" readonly data-wl-link id="waitlist-${variant}-link" aria-label="${esc(pick(referral.linkLabel))}"><button class="button secondary" type="button" data-wl-copy>${pick(referral.copy)}</button></div>
<p class="wl-status" role="status" aria-live="polite" data-wl-copy-status></p>
<p class="wl-share-title">${pick(referral.shareTitle)}</p><div class="wl-share"><a class="button secondary" data-wl-share="whatsapp" target="_blank" rel="noopener noreferrer">${pick(referral.shareWhatsapp)}</a><a class="button secondary" data-wl-share="x" target="_blank" rel="noopener noreferrer">${pick(referral.shareX)}</a><a class="button secondary" data-wl-share="telegram" target="_blank" rel="noopener noreferrer">${pick(referral.shareTelegram)}</a></div>
<p class="wl-counts" data-wl-counts hidden></p><p class="wl-note">${pick(referral.countsNote)}</p>
<h4>${pick(referral.rewardsTitle)}</h4><ul class="plain-list wl-tiers">${referral.tiers.map(tier => `<li>${pick(tier)}</li>`).join('')}</ul><p class="wl-note">${pick(referral.rules)}</p></div>`;
  const waitlistBlock = variant => {
    if (!config.waitlistEnabled) return '';
    const id = 'waitlist-' + variant;
    const body = waitlistLive
      ? `<form class="waitlist-form" data-wl-form method="post" novalidate hidden>
<div class="wl-field"><label for="${id}-email">${pick(waitlist.emailLabel)}</label><input id="${id}-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required placeholder="${esc(pick(waitlist.emailPlaceholder))}"></div>
<div class="wl-hp" aria-hidden="true"><label for="${id}-hp">${pick(waitlist.honeypotLabel)}</label><input id="${id}-hp" name="hp" type="text" tabindex="-1" autocomplete="off"></div>
<label class="wl-consent"><input name="consent" type="checkbox" required><span>${pick(waitlist.consent)}</span></label>
${waitlistPrivacy ? `<p class="wl-privacy">${waitlistPrivacy}</p>` : ''}
<button class="button" type="submit">${pick(waitlist.submit)}</button>
</form>
<div class="wl-done" data-wl-done hidden><p class="wl-done-text" data-wl-done-text></p>${referralPanel(variant)}</div>
<p class="wl-status" role="status" aria-live="polite" data-wl-status></p>
<p class="wl-count" data-wl-count hidden></p>
<p class="wl-note" data-wl-nojs><noscript>${pick(waitlist.noscript)}</noscript></p>`
      : `<p class="wl-note">${pick(waitlist.unavailable)}</p>`;
    return `<section class="section waitlist waitlist-${variant}" aria-labelledby="${id}-title" data-waitlist data-lang="${lang}" data-referral="${config.referralEnabled}" data-site-url="${config.siteUrl ? esc(config.siteUrl) : ''}" data-labels="${esc(waitlistLabels())}" data-supabase-url="${waitlistLive ? esc(config.supabaseUrl) : ''}" data-anon-key="${waitlistLive && config.supabaseAnonKey ? esc(config.supabaseAnonKey) : ''}"><div class="waitlist-inner"><div><p class="eyebrow">${pick(waitlist.eyebrow)}</p><h2 id="${id}-title">${pick(waitlist.title)}</h2><p class="wl-lead">${pick(variant === 'home' ? waitlist.lead : waitlist.compactLead)}</p></div><div class="wl-body">${body}</div></div>${waitlistLive ? '<script type="module" src="/waitlist.js"></script>' : ''}</section>`;
  };
  const shotImg = (shot, eager = false) => `<img src="${esc(pick(shot.file))}" alt="${esc(pick(shot.alt))}" width="${shot.width}" height="${shot.height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}>`;
  const figure = (shot, cls = '') => `<figure class="shot ${cls}">${shotImg(shot)}<figcaption>${esc(pick(shot.caption))}</figcaption></figure>`;
  const pages = {};
  const add = (route, title, body, options = {}) => { pages[route] = { title, body, ...options }; };

  const ICONS = {
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 20h8M9 18h6"/>',
    chest: '<path d="M4 11a8 7 0 0 1 16 0v8H4z"/><path d="M4 12h16M12 10v4M4 19h16"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.6-.8-1.5-1.1-2.5-1.1-1.4 0-2.4.7-2.4 1.8 0 2.5 5 1.2 5 3.6 0 1.1-1.1 1.9-2.600 1.900-1.100 0-2-.4-2.700-1.200M12 6.500v1.900M12 15.600v1.900"/>',
    rise: '<path d="M4 18l6-6 4 4 6-8"/><path d="M15 8h5v5"/>',
    shield: '<path d="M12 3l7 3v6c0 4.500-3 7.500-7 9-4-1.500-7-4.500-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    crown: '<path d="M4 18h16M4 18L3 8l5 4 4-7 4 7 5-4-1 10"/>',
    hero: '<path d="M12 3c-4 0-6 3-6 6v5l2 1v5h8v-5l2-1V9c0-3-2-6-6-6z"/><path d="M9 11h6M12 11v4"/>',
    swords: '<path d="M5 4l9 9M4 5l1.500-1.500M13 14l-3 3M9 14l-4 4M19 4l-9 9M20 5l-1.500-1.500M11 14l3 3M15 14l4 4"/>',
    bars: '<path d="M5 20V12M10 20V6M15 20V10M20 20V3"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
  };
  const icon = name => `<svg class="h-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  const homeBullets = list => `<ul class="h-bullets">${list.map(item => `<li><span class="h-ring">${icon(item.icon)}</span><span><strong>${pick(item.title)}</strong>${pick(item.body)}</span></li>`).join('')}</ul>`;
  const heroPlay = config.playUrl ? `<a class="button h-gold" href="${esc(config.playUrl)}">${pick(home.playtest)} <span aria-hidden="true">→</span></a>` : primary('h-gold');
  const passPriceBox = config.passSalesOpen ? `<p class="h-price"><small>${pick(home.pass.once)}</small><strong>${esc(config.passPrice)}</strong></p>` : `<p class="h-price"><small>${pick(home.pass.saleLabel)}</small><strong>${pick(home.pass.soon)}</strong></p>`;
  const homeHero = `<section class="hero hero-epic"><div class="hero-art" aria-hidden="true"><img src="/img/home-hero-v2.webp" alt="" width="1930" height="815" fetchpriority="high"></div><div class="hero-copy"><div class="hero-brand" role="img" aria-label="Arena Idle"><span class="h-arena">ARENA</span><span class="h-idle"><i></i><b>IDLE</b><i></i></span></div><h1>${pick(home.headline)}</h1><p class="h-sub">${pick(home.sub)}</p><div class="actions">${heroPlay}<a class="button h-ghost" href="#home-steps">${pick(home.learn)} <span aria-hidden="true">⌄</span></a></div></div></section>
    <div class="h-cards" id="home-season"><section class="h-card h-season" aria-labelledby="h-season-title"><div class="h-card-copy"><p class="h-eyebrow"><span>${pick(home.season.eyebrow)}</span></p><h2 id="h-season-title">${pick(home.season.title)}</h2><p class="h-tagline">${pick(home.season.tagline)}</p>${homeBullets(home.season.bullets)}</div><img class="h-art h-trophy" src="/img/home-trophy-v2.webp" alt="${esc(pick(home.season.art))}" width="560" height="560" loading="lazy" decoding="async"><div class="h-card-foot"><p class="h-length">${icon('hourglass')}<span><small>${pick(home.season.lengthLabel)}</small><strong>${pick(home.season.length)}</strong></span></p>${link('season', pick(home.season.cta) + ' <span aria-hidden="true">→</span>', 'button h-ghost')}</div></section>
    <section class="h-card h-pass" aria-labelledby="h-pass-title"><div class="h-card-copy"><p class="h-eyebrow"><span>${pick(home.pass.eyebrow)}</span></p><h2 id="h-pass-title">${pick(home.pass.title)}</h2><p class="h-tagline">${pick(home.pass.tagline)}</p>${homeBullets(home.pass.bullets)}</div><img class="h-art h-passcard" src="/img/home-pass-v2.webp" alt="${esc(pick(home.pass.art))}" width="560" height="560" loading="lazy" decoding="async"><div class="h-card-foot">${passPriceBox}${link('pass', pick(home.pass.cta) + ' <span aria-hidden="true">→</span>', 'button h-gold')}</div></section></div>
    <ul class="h-features" aria-label="${t('Destaques do jogo', 'Game highlights')}">${home.features.map(item => `<li><span class="h-ring">${icon(item.icon)}</span><span><strong>${pick(item.title)}</strong>${pick(item.body)}</span></li>`).join('')}</ul>`;
  const homeSteps = `<section class="section h-steps" id="home-steps" aria-labelledby="h-steps-title"><p class="h-eyebrow"><span>${pick(home.stepsEyebrow)}</span></p><h2 id="h-steps-title" class="h-title">${pick(home.stepsTitle)}</h2><ol class="h-step-list">${home.steps.map((step, index) => `<li><span class="h-step-no" aria-hidden="true">${index + 1}</span><span class="h-ring">${icon(step.icon)}</span><h3>${pick(step.title)}</h3><p>${pick(step.body)}</p></li>`).join('')}</ol></section>`;
  const [leadShot, ...sideShots] = home.gallery.map(id => shots[id]);
  const homeShots = `<section class="section h-shots" aria-labelledby="h-shots-title"><p class="h-eyebrow"><span>${pick(home.shotsEyebrow)}</span></p><h2 id="h-shots-title" class="h-title">${pick(home.shotsTitle)}</h2><div class="h-gallery">${figure(leadShot, 'h-shot-lead')}${sideShots.map(shot => figure(shot)).join('')}</div></section>`;
  const homePillars = `<section class="section h-pillars" aria-labelledby="h-pillars-title"><div class="section-head"><div><p class="h-eyebrow"><span>${pick(home.pillarsEyebrow)}</span></p><h2 id="h-pillars-title" class="h-title">${pick(home.pillarsTitle)}</h2></div>${link('systems', pick(home.pillarsCta) + ' <span aria-hidden="true">→</span>', 'button h-ghost')}</div><ul class="h-pillar-list">${home.pillars.map(item => `<li>${link('systems', `<span class="h-ring">${icon(item.icon)}</span><h3>${pick(item.title)}</h3><p>${pick(item.body)}</p>`, '', '#' + item.anchor)}</li>`).join('')}</ul></section>`;
  const homeRoadmap = `<section class="section h-roadmap"><h2 class="h-title">${pick(home.roadmapTitle)}</h2>${link('roadmap', pick(home.roadmapCta) + ' <span aria-hidden="true">→</span>', 'button h-ghost')}</section>`;
  const homeFinal = `<section class="h-final"><h2 class="h-title">${pick(home.finalTitle)}</h2><p>${pick(home.finalBody)}</p><div class="actions">${heroPlay}</div></section>`;
  add('', t('Início', 'Home'), `${homeHero}
    ${waitlistBlock('home')}
    ${homeSteps}
    ${homeShots}
    ${homePillars}
    ${homeRoadmap}
    ${allPosts.length >= 2 ? `<section class="section"><div class="section-head"><h2>${t('Notícias do Arena Idle', 'Arena Idle news')}</h2>${link('news', t('Todas as notícias', 'All news'), 'text-link')}</div>${postCards(allPosts.slice(0, 3))}</section>` : ''}
    ${community()}${homeFinal}`);

  add('about', t('Sobre o jogo', 'About the game'), intro(t('O jogo', 'The game'), t('Evolua com um objetivo.', 'Give your progression a purpose.'), t('Arena Idle é um RPG idle: você evolui o Herói, trabalha em profissões, caça, forja equipamento e desce a Masmorra. Parte do progresso continua com o jogo fechado.', 'Arena Idle is an idle RPG: you grow your Hero, work on professions, hunt, forge gear and descend through the Dungeon. Part of your progress continues while the game is closed.')) + `<section class="section split"><div><h2>${t('Poder é parte da evolução.', 'There’s more to growth than power.')}</h2><p>${pick(copy.choicesBody)}</p><p>${t('Materiais viram equipamento na Forja. Melhoria, Reforja e Lapidar preparam o Herói para a Masmorra e as Profundezas. O combate é contra monstros e chefes.', 'Materials become gear in the Forge. Upgrade, Reforge and Lapidar prepare your Hero for the Dungeon and the Depths. Combat is against monsters and bosses.')}</p>${link('systems', t('Entender os sistemas', 'Explore the systems') + ' →', 'text-link')}</div><div><h2>${t('Grátis no navegador.', 'Free in the browser.')}</h2><p>${t('O jogo base é grátis e roda no navegador, no computador ou no celular. O Passe de Aventureiro é opcional. O Roadmap mostra o que já existe e o que vem depois.', 'The base game is free and runs in your browser, on your computer or phone. The Adventurer’s Pass is optional. The Roadmap shows what exists and what comes next.')}</p><div class="actions">${primary()}${passLink()}</div></div></section><section class="section">${figure(shots.hero, 'wide')}</section>`);

  add('systems', t('Sistemas', 'Systems'), intro(t('Sistemas', 'Systems'), t('Cada sistema tem um papel na evolução.', 'Every system plays a part.'), pick(copy.availableNote)) + `<nav class="section-jumps" aria-label="${t('Grupos de sistemas', 'System groups')}">${groups.map(group => `<a href="#${group.id}">${pick(group.title)}</a>`).join('')}</nav>${groups.map((group, index) => `<section class="section system-group" id="${group.id}"><div class="group-intro"><p class="eyebrow">0${index + 1} / ${t('Sistemas', 'Systems')}</p><h2>${pick(group.title)}</h2><p>${pick(group.body)}</p><div class="collective-status">${badge(group.status)}<p>${pick(states[group.status].definition)}</p></div>${group.shot ? figure(shots[group.shot], 'group-shot') : ''}${group.art ? `<img class="group-art" src="${esc(group.art.file)}" alt="${esc(pick(group.art.alt))}" width="${group.art.width}" height="${group.art.height}" loading="lazy" decoding="async">` : ''}</div><dl class="system-list">${group.systems.map(id => { const system = systems.find(item => item.id === id); return `<div id="${system.id}"><dt>${pick(glossary[system.term])}</dt><dd>${pick(system.body)}</dd></div>`; }).join('')}</dl></section>`).join('')}<section class="section guidance"><h2>${t('Primeiros passos com orientação.', 'A guided start.')}</h2><p>${t('Tutorial guiado, configurações, notificações, português e inglês e controle de som fazem parte do jogo.', 'The game includes a guided tutorial, settings, notifications, Portuguese and English, and sound controls.')}</p>${link('faq', t('Perguntas frequentes', 'Frequently asked questions'), 'text-link')}</section>`);

  // Pass page. One truth, driven by config.passSalesOpen: closed = "coming soon" + perks, no price anywhere; open = price in USDC (Solana wallet), buy button and the refund policy link.
  // Premium top of the Pass page: copy, short perks, price and call on the left; the gold Pass card on the right. The price appears only when the sale is open.
  const passOffer = config.passSalesOpen
    ? `<div class="p-price"><p><small>${t('Pagamento único', 'One-time payment')}</small><strong>${esc(config.passPrice)}</strong></p><p class="p-pay">${t('Em USDC, pela carteira Solana (Phantom ou Solflare). Sem renovação.', 'In USDC, from a Solana wallet (Phantom or Solflare). No renewal.')}</p></div><div class="actions">${buyHref ? `<a class="button h-gold" href="${esc(buyHref)}">${pick(seasonPage.buy)} <span aria-hidden="true">→</span></a>` : ''}</div><p class="buy-note">${pick(seasonPage.buyNote)} ${link('refund', t('Política de reembolso', 'Refund policy'), 'text-link')}</p>`
    : `<div class="p-price"><p><small>${t('Venda', 'Sale')}</small><strong>${pick(seasonPage.soon)}</strong></p><p class="p-pay">${t('A venda ainda não abriu. Quando abrir: pagamento único em USDC, pela carteira Solana (Phantom ou Solflare). Sem renovação.', 'The sale has not opened yet. When it opens: a one-time payment in USDC, from a Solana wallet (Phantom or Solflare). No renewal.')}</p></div>`;
  const passHero = `<section class="p-hero" aria-labelledby="pass-title"><div class="p-copy"><p class="h-eyebrow"><span>${t('O Passe', 'The Pass')}</span></p><h1 id="pass-title" class="h-title">${pick(home.pass.title)}</h1><p class="p-tag">${t('Compre uma vez. Use para sempre.', 'Buy once. Use it forever.')}</p><p class="s-lead">${t('O Passe do Aventureiro é permanente. A cada temporada, você participa de uma nova trilha de benefícios e recompensas.', 'The Adventurer’s Pass is permanent. Every season, you join a new track of perks and rewards.')}</p>${homeBullets(home.pass.bullets)}${passOffer}</div><img class="p-card" src="/img/home-pass-v2.webp" alt="${esc(pick(home.pass.art))}" width="560" height="560" fetchpriority="high"></section>`;
  add('pass', pick(glossary.pass), passHero + `<section class="section narrow philosophy"><h2>${t('O que o Passe oferece.', 'What the Pass offers.')}</h2><ul class="plain-list"><li>${t('Desbloqueio permanente: quem o tem não precisa renová-lo.', 'A permanent unlock: you do not need to renew it.')}</li><li>${t('Temporadas do Passe de 60 dias com uma trilha de recompensas gratuita e uma premium. Ao fim da temporada, o que não foi resgatado vai para o inventário e a trilha recomeça.', '60-day Pass Seasons with a free and a premium reward track. When a season ends, whatever was not claimed goes to your inventory and the track starts over.')}</li><li>${t('Vantagens de conveniência e progressão: mais espaço no Baú e no inventário, o herói acumula por mais tempo quando você está fora, reparo mais barato, mais Ouro e materiais, um escudo para a sequência de login e um segundo conjunto de habilidades.', 'Convenience and progression perks: more room in the Stash and inventory, your hero accumulates for longer while you are away, cheaper repair, more Gold and materials, a streak shield for the login streak and a second skill loadout.')}</li><li>${t('Poder criar Bolsas de Ouro.', 'The ability to create Gold Pouches.')}</li><li>${t('Cosméticos e itens exclusivos da temporada, como molduras, aparências, títulos e relíquias.', 'Cosmetics and exclusive season items, such as frames, appearances, titles and relics.')}</li><li>${t('Entrar na pré-temporada e na', 'Join the pre-season and the')} ${link('season', pick(seasonPage.nav), 'text-link')}${t(', com prêmio em dinheiro (mínimo garantido de US$ 1.000) quando a Liga abrir.', ', with a cash prize (US$ 1,000 guaranteed minimum) once the League opens.')}</li></ul><p class="pass-purpose"><strong>${t('Para que serve o Passe.', 'What the Pass is for.')}</strong> ${t('O Passe ajuda a financiar o crescimento do jogo e as próximas novidades.', 'The Pass helps fund the game’s growth and what comes next.')}</p><p>${t('As vantagens são reais: quem tem o Passe avança com mais conforto. O jogo base continua jogável sem ele.', 'The perks are real: owners of the Pass progress more comfortably. The base game stays playable without it.')}</p></section>`);

  // Old address of the competition page: its content now lives in the Season League page. Kept so existing links do not break.
  add('championship', pick(seasonPage.nav), intro(pick(seasonPage.eyebrow), pick(league.title), t('Esta página agora faz parte da página da Liga da Temporada.', 'This page is now part of the Season League page.')) + `<section class="section narrow"><div class="actions">${link('season', pick(seasonPage.nav) + ' →', 'button')}</div></section>`, { indexable: false, redirect: 'season' });

  // Liga da Temporada: how it works, the Pass meter and the rankings. Server-rendered without data; /season.js fills it from Supabase (public anon key) when config has the address and key.
  const professionIds = ['mining', 'woodcutting', 'gardening'];
  const live = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const labels = Object.fromEntries(Object.entries(seasonPage).map(([key, value]) => [key, pick(value)]));
  labels.tableLabel = pick(seasonPage.generalTable);
  const rankingStart = live ? `<p class="rank-empty" data-kind="loading">${pick(seasonPage.loading)}</p>` : failedRows(labels);
  // Top of the page: trophy art, status (pre-season until /season.js sees an open League), length, prize, who competes and how the ranking works.
  const seasonHero = `<section class="s-hero" aria-labelledby="season-title"><div class="s-hero-copy"><p class="h-eyebrow"><span>${pick(seasonPage.heroEyebrow)}</span></p><h1 id="season-title" class="h-title s-status" data-season-status>${pick(seasonPage.heroStatus)}</h1><p class="s-pre" data-season-pre>${pick(seasonPage.heroPre)}</p><p class="s-lead">${pick(seasonPage.heroLead)}</p></div><img class="s-trophy" src="/img/home-trophy-v2.webp" alt="${esc(pick(seasonPage.heroArt))}" width="560" height="560" fetchpriority="high"><dl class="s-facts">${seasonPage.facts.map(fact => `<div><dt>${pick(fact.label)}</dt><dd><strong>${pick(fact.value)}</strong><span>${pick(fact.note)}</span></dd></div>`).join('')}</dl></section>`;
  const seasonFaq = `<section class="section narrow faq-list" aria-labelledby="season-faq-title"><h2 id="season-faq-title">${pick(seasonPage.faqTitle)}</h2>${seasonPage.faq.map(item => `<details><summary>${pick(item.question)}</summary><p>${pick(item.answer)}</p></details>`).join('')}</section>`;
  const seasonBody = ''
    + `<div data-season-root data-lang="${lang}" data-labels="${esc(JSON.stringify(labels))}" data-supabase-url="${live ? esc(config.supabaseUrl) : ''}" data-anon-key="${live ? esc(config.supabaseAnonKey) : ''}">${seasonHero}
<section class="section narrow league-steps" aria-labelledby="steps-title"><h2 id="steps-title">${pick(seasonPage.stepsTitle)}</h2><ol class="steps"><li>${pick(seasonPage.step1)}</li><li>${pick(seasonPage.step2)}</li><li>${pick(seasonPage.step3)}</li></ol><div class="notice" data-reset-notice><p><strong>${pick(seasonPage.resetNotice)}</strong></p></div></section>
<section class="section narrow season-meter" aria-labelledby="meter-title"><h2 id="meter-title">${pick(seasonPage.meterTitle)}</h2>
<div data-meter-closed hidden><div class="meter-bar" role="img" aria-label="${esc(pick(seasonPage.goalLine))}" data-meter-bar><span data-meter-fill></span></div>
<p class="meter-line" data-meter-line>${pick(seasonPage.goalLine)}</p></div>
<div data-meter-open hidden><h3>${pick(seasonPage.openTitle)}</h3><p class="meter-dates" data-open-dates></p><p class="meter-countdown" data-open-countdown></p></div>
<p class="prize-fixed">${pick(seasonPage.fixedPrize)}</p>
<p class="live-state" role="status" data-live-state data-state="unavailable">${live ? pick(seasonPage.loading) : pick(seasonPage.meterFailed)}</p>
<noscript><p class="live-state" data-state="unavailable">${pick(seasonPage.noscript)}</p></noscript>
<div class="actions">${config.passSalesOpen && buyHref ? `<a class="button" href="${esc(buyHref)}">${pick(seasonPage.buy)} ↗</a>` : `<span class="button disabled" role="link" aria-disabled="true">${pick(seasonPage.soon)}</span>`}</div>
<p class="buy-note">${config.passSalesOpen ? pick(seasonPage.buyNote) : `${pick(seasonPage.closedNote)} ${link('pass', pick(seasonPage.closedLink) + ' →', 'text-link')}`}</p></section>

<section class="section narrow league-rules" aria-labelledby="rules-title"><h2 id="rules-title">${pick(seasonPage.rulesTitle)}</h2><ul class="plain-list"><li>${pick(seasonPage.rule1)}</li><li>${pick(seasonPage.rule2)}</li><li>${pick(seasonPage.rule3)}</li></ul>${config.legalLive.seasonRules ? link('season-rules', pick(seasonPage.rulesLink) + ' →', 'text-link') : ''}</section>
<section class="section narrow" aria-labelledby="board-title"><p class="eyebrow">${pick(seasonPage.rankingEyebrow)}</p><h2 id="board-title" data-board-title>${pick(seasonPage.generalTitle)}</h2>
<p class="board-note" data-board-note>${live ? pick(seasonPage.loading) : ''}</p><p class="board-prize" data-board-prize hidden></p>
<div data-general>${rankingStart}</div></section>
<section class="section narrow" aria-labelledby="prof-title"><h2 id="prof-title">${pick(seasonPage.professionTitle)}</h2><p class="board-note">${pick(seasonPage.professionNote)}</p>
<div class="tabs" role="tablist" aria-label="${pick(seasonPage.professionTitle)}">${professionIds.map((id, index) => `<button type="button" role="tab" id="tab-${id}" class="tab" aria-selected="${index === 0}" data-profession-tab="${id}">${pick(glossary[id])}</button>`).join('')}</div>
<div role="tabpanel" aria-labelledby="tab-mining" data-profession>${rankingStart}</div>
<div class="notice"><p>${pick(seasonPage.prizeRule)}</p></div></section>${seasonFaq}</div>
${waitlistBlock('season')}<script type="module" src="/season.js"></script>`;
  add('season', pick(seasonPage.nav), seasonBody);

  // Legal pages: placeholders until the owner supplies the text. A page goes live (footer link, indexable) only when config.legalLive[flag] is true AND its entry in `legal` has a `body` (rich blocks, see EDITORIAL.md).
  for (const page of legal) {
    const isLive = Boolean(config.legalLive[page.flag]) && Boolean(page.body);
    add(page.route, pick(page.title), intro(t('Documento legal', 'Legal document'), pick(page.title), isLive ? '' : t('Esta página é um espaço reservado.', 'This page is a placeholder.')) + (isLive ? `<article class="section narrow rich-content">${renderBlocks(page.body[lang])}</article>` : `<section class="section narrow"><div class="notice placeholder"><p><strong>${pick(legalPlaceholder)}</strong></p></div></section>`), { indexable: isLive, desc: 'legal' });
  }
  // The unsubscribe page a future launch e-mail links to (/pt/unsubscribe/?t=<signed token>). It asks for a click (so a link scanner cannot unsubscribe anybody) and posts the token to waitlist-unsubscribe.
  if (config.waitlistEnabled) {
    const unsubLabels = JSON.stringify({ done: pick(waitlist.unsubDone), bad: pick(waitlist.unsubBad), failed: pick(waitlist.unsubFailed) });
    add('unsubscribe', pick(waitlist.unsubTitle), intro(pick(waitlist.eyebrow), pick(waitlist.unsubTitle), pick(waitlist.unsubLead)) + `<section class="section narrow waitlist-unsub" data-unsubscribe data-labels="${esc(unsubLabels)}" data-supabase-url="${waitlistLive ? esc(config.supabaseUrl) : ''}"><button class="button" type="button" data-unsub-button hidden>${pick(waitlist.unsubButton)}</button><p class="wl-status" role="status" aria-live="polite" data-unsub-status></p><p class="wl-note" data-unsub-nojs><noscript>${pick(waitlist.unsubNoscript)}</noscript></p></section><script type="module" src="/waitlist.js"></script>`, { indexable: false });
  }
  add('roadmap', 'Roadmap', intro('Roadmap', t('A evolução do Arena Idle.', 'Arena Idle’s development.'), t('Entenda o estado de cada parte do projeto.', 'See where each part of the project stands.')) + `<section class="section roadmap-section"><h2 class="sr-only">${t('Significado dos estados', 'Status definitions')}</h2>${roadmapLegend()}<p class="availability-note">${pick(copy.availableNote)}</p>${road()}${!roadmap.some(item => item.status === 'planned') ? `<p class="note">${t('Planejado: ainda não há itens públicos nesta categoria.', 'Planned: there are no public items in this category yet.')}</p>` : ''}</section>`);

  // Existing editorial routes remain addressable. Empty types are never advertised.
  for (const [route, type] of [['news', null], ...Object.entries(editorialTypes).map(([key, value]) => [value.route, key])]) {
    const title = type ? pick(editorialTypes[type].label) : t('Notícias', 'News');
    const records = publishedArticles(articles, type);
    const count = paginate(records, 1, config.pageSize).totalPages;
    for (let number = 1; number <= count; number++) {
      const path = number === 1 ? route : `${route}/page/${number}`;
      const chunk = paginate(records, number, config.pageSize);
      const pagination = count > 1 ? `<nav class="pagination" aria-label="${t('Páginas do arquivo', 'Archive pages')}">${Array.from({ length: count }, (_, index) => `<a href="${url(index === 0 ? route : `${route}/page/${index + 1}`)}" ${number === index + 1 ? 'aria-current="page"' : ''}>${index + 1}</a>`).join('')}</nav>` : '';
      add(path, title, intro(title, type ? title : t('Notícias do desenvolvimento.', 'Development news.'), type ? t('Comunicados oficiais do Arena Idle.', 'Official Arena Idle updates.') : t('Atualizações e decisões sobre a evolução do jogo.', 'Updates and decisions about the game’s development.')) + `<section class="section">${editorialFilters(route)}${chunk.items.length ? postCards(chunk.items) : newsEmpty()}${pagination}</section>`, { indexable: records.length > 0, desc: 'news' });
    }
  }
  // No records exist in this round: this adds no pages. Future reviewed records use the same renderer.
  for (const record of allPosts) {
    const adjacent = neighbors(allPosts, record.slug);
    add('news/' + record.slug, pick(record.title), intro(pick(editorialTypes[record.type].label), esc(pick(record.title)), esc(pick(record.subtitle || record.summary))) + `<article class="section narrow rich-content"><p class="post-meta"><time datetime="${record.date}">${date(record.date)}</time>${record.version ? ' · ' + esc(record.version) : ''}</p>${record.image ? `<img src="${esc(record.image.src)}" alt="${esc(pick(record.image.alt))}" width="${record.image.width}" height="${record.image.height}">` : ''}${record.categories.length ? `<ul class="tags">${record.categories.map(category => `<li>${esc(pick(category))}</li>`).join('')}</ul>` : ''}${renderBlocks(record.body[lang])}<nav class="post-navigation" aria-label="${t('Navegação entre notícias', 'Post navigation')}">${adjacent.newer ? link('news/' + adjacent.newer.slug, '← ' + esc(pick(adjacent.newer.title))) : ''}${link('news', t('Arquivo de notícias', 'News archive'))}${adjacent.older ? link('news/' + adjacent.older.slug, esc(pick(adjacent.older.title)) + ' →') : ''}</nav></article>`, { descriptionText: pick(record.summary) });
  }
  add('faq', 'FAQ', intro('FAQ', t('Perguntas sobre Arena Idle.', 'Questions about Arena Idle.'), t('O jogo, a progressão e o estado do desenvolvimento.', 'The game, progression and development status.')) + `<section class="section narrow faq-list">${faq.map(item => `<details><summary>${pick(item.question)}</summary><p>${pick(item.answer)}</p></details>`).join('')}</section>`);
  add('play', t('Jogar', 'Play'), intro('Arena Idle', config.playUrl ? t('Jogue grátis no navegador.', 'Play free in your browser.') : t('O jogo abre em breve.', 'The game opens soon.'), config.playUrl ? t('Use o endereço oficial para abrir o jogo.', 'Use the official link to open the game.') : t('O endereço oficial de acesso ao jogo ainda será confirmado. Enquanto isso, conheça o jogo e o Passe.', 'The official play link has yet to be confirmed. In the meantime, discover the game and the Pass.')) + `<section class="section narrow"><div class="actions">${primary()}${link('about', t('Conhecer o jogo', 'Discover the game'), 'button secondary')}</div></section>`);

  const origin = config.siteUrl ? config.siteUrl.replace(/\/$/, '') : null;
  const ogAlt = t('Arena Idle: um cavaleiro de capa vermelha olha a arena ao pôr do sol.', 'Arena Idle: a knight in a red cape looks over the arena at sunset.');
  const footerLegal = legal.filter(page => config.legalLive[page.flag] && page.body);
  const company = config.company || {};
  const trustLines = [
    company.legalName ? `<p>${esc(company.legalName)}</p>` : '',
    company.cnpj ? `<p>CNPJ ${esc(company.cnpj)}</p>` : '',
    company.supportEmail ? `<p>${t('Suporte', 'Support')}: <a href="mailto:${esc(company.supportEmail)}">${esc(company.supportEmail)}</a></p>` : '',
  ].filter(Boolean).join('');
  const footerTrust = trustLines || footerLegal.length ? `<div class="footer-trust">${trustLines}${footerLegal.length ? `<nav aria-label="${t('Documentos legais', 'Legal documents')}">${footerLegal.map(page => link(page.route, pick(page.title))).join('')}</nav>` : ''}</div>` : '';

  return Object.entries(pages).map(([route, page]) => {
    const newsActive = route.startsWith('news') || Object.values(editorialTypes).some(value => route.startsWith(value.route));
    const nav = (path, label, parent = false) => `<a href="${url(path)}" ${route === path ? 'aria-current="page"' : parent ? 'aria-current="location"' : ''}>${label}</a>`;
    // News stays out of the menu until at least two posts are published (an empty news page reads as a stalled project).
    const indexable = page.indexable !== false;
    const description = esc(page.descriptionText ?? pick(descriptions[page.desc] ?? descriptions[route] ?? descriptions.default));
    const fullTitle = route === '' ? `${config.brand} · ${t('RPG idle grátis no navegador', 'Free idle RPG in your browser')}` : `${page.title} · ${config.brand}`;
    const here = `/${lang}/${route}${route ? '/' : ''}`;
    const other = lang === 'pt' ? 'en' : 'pt';
    const there = `/${other}/${route}${route ? '/' : ''}`;
    const abs = path => origin + path;
    const robots = origin && indexable ? 'index,follow' : origin ? 'noindex,follow' : 'noindex,nofollow';
    const image = origin ? abs(OG_IMAGE.file[lang]) : OG_IMAGE.file[lang];
    const alternates = origin
      ? `<link rel="canonical" href="${esc(abs(here))}"><link rel="alternate" hreflang="pt" href="${esc(abs(`/pt/${route}${route ? '/' : ''}`))}"><link rel="alternate" hreflang="en" href="${esc(abs(`/en/${route}${route ? '/' : ''}`))}"><link rel="alternate" hreflang="x-default" href="${esc(abs(`/pt/${route}${route ? '/' : ''}`))}">`
      : `<link rel="alternate" hreflang="${other}" href="${there}">`;
    const social = `<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(config.brand)}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${description}"><meta property="og:locale" content="${lang === 'pt' ? 'pt_BR' : 'en_US'}"><meta property="og:locale:alternate" content="${lang === 'pt' ? 'en_US' : 'pt_BR'}">${origin ? `<meta property="og:url" content="${esc(abs(here))}">` : ''}<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="${OG_IMAGE.width}"><meta property="og:image:height" content="${OG_IMAGE.height}"><meta property="og:image:alt" content="${esc(ogAlt)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fullTitle)}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${esc(image)}"><meta name="twitter:image:alt" content="${esc(ogAlt)}">`;
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${description}"><meta name="robots" content="${robots}">${page.redirect ? `<meta http-equiv="refresh" content="0;url=${url(page.redirect)}">` : ''}<title>${esc(fullTitle)}</title>${social}<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/style.css">${alternates}</head><body><a href="#main" class="skip">${t('Pular para o conteúdo', 'Skip to content')}</a><header class="site-header"><a class="brand" href="${url('')}" aria-label="Arena Idle — ${t('Início', 'Home')}"><img class="brand-emblem" src="/img/emblem-192.png" alt="" width="40" height="40"> ARENA <b>IDLE</b></a><button class="menu-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="${t('Menu principal', 'Main menu')}">Menu</button><nav id="main-nav" aria-label="${t('Navegação principal', 'Main navigation')}">${nav('', t('Jogo', 'Game'))}${nav('systems', t('Sistemas', 'Systems'))}${nav('season', pick(seasonPage.navShort), route === 'championship')}${nav('pass', t('Passe', 'Pass'))}${nav('roadmap', 'Roadmap')}${showNews ? nav('news', t('Notícias', 'News'), newsActive) : ''}${nav('faq', 'FAQ')}<div class="mobile-cta">${headerPlay}</div></nav><div class="header-actions"><div class="language" aria-label="${t('Idioma', 'Language')}">${['pt', 'en'].map((locale, index) => `${index ? '<span class="language-separator" aria-hidden="true">/</span>' : ''}<a lang="${locale}" href="/${locale}/${route}${route ? '/' : ''}" ${locale === lang ? 'aria-current="true"' : ''} aria-label="${locale === 'pt' ? 'Português' : 'English'}">${locale.toUpperCase()}</a>`).join('')}</div><div class="primary-header">${headerPlay}</div></div></header><main id="main" tabindex="-1">${page.body}</main><footer><a class="brand" href="${url('')}">ARENA <b>IDLE</b></a><p>${t('RPG idle · No navegador', 'Idle RPG · In the browser')}<br>${t('Grátis no navegador', 'Free in the browser')}</p><nav aria-label="${t('Rodapé', 'Footer')}">${link('about', t('Sobre o jogo', 'About the game'))}${link('systems', t('Sistemas', 'Systems'))}${link('season', pick(seasonPage.navShort))}${link('pass', t('Passe', 'Pass'))}${link('roadmap', 'Roadmap')}${showNews ? link('news', t('Notícias', 'News')) : ''}${link('faq', 'FAQ')}</nav>${footerTrust}<small>© ${new Date().getFullYear()} ${esc(company.legalName || config.brand)}</small></footer><script src="/app.js" defer></script></body></html>`;
    return { route, html, indexable };
  });
}
