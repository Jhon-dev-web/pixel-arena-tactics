// Checks of the Temporada page: the pure module (public/season-core.js, the same file the browser runs) and the generated page. Run: node scripts/season-check.mjs
import assert from 'node:assert/strict';
import { PROFESSIONS, RANK_LIMIT, cleanSupabaseUrl, countdownText, endpoints, escapeHtml, failedRows, fillText, formatInt, meterPresentation, meterView, pickBoard, renderRows, requestInit } from '../public/season-core.js';
import { config, seasonPage, legal } from '../src/content.mjs';
import { renderSite } from '../src/pages.mjs';
import { robotsTxt, sitemapXml } from '../src/seo.mjs';

const labels = Object.fromEntries(Object.entries(seasonPage).map(([key, value]) => [key, value.pt]));
labels.tableLabel = labels.generalTable;

// ---- the Supabase address ------------------------------------------------------------------------------------------------------------
assert.equal(cleanSupabaseUrl('https://abcdefghij.supabase.co'), 'https://abcdefghij.supabase.co');
assert.equal(cleanSupabaseUrl('https://abcdefghij.supabase.co/'), 'https://abcdefghij.supabase.co');
for (const bad of [null, '', 'http://abcdefghij.supabase.co', 'https://evil.example', 'https://abc.supabase.co.evil.test', 'https://u:p@abc.supabase.co', 'https://abc.supabase.co/rest/v1', 'https://abc.supabase.co?x=1', 'javascript:alert(1)']) {
  assert.equal(cleanSupabaseUrl(bad), null, String(bad));
}

// ---- the requests: read-only, anon key only, fixed shapes ------------------------------------------------------------------------------
const e = endpoints('https://abc.supabase.co');
assert.equal(e.meter.url, 'https://abc.supabase.co/rest/v1/rpc/pass_meter');
assert.equal(e.meter.method, 'POST');
assert.match(e.general(3).url, /season_leaderboard\?.*season=eq\.3&flag_count=eq\.0&order=rank\.asc&limit=50$/);
assert.match(e.profession(3, 'mining').url, /season_profession_leaderboard\?.*profession=eq\.mining&order=rank\.asc&limit=50$/);
assert.match(e.profession(3, 'mining&select=*').url, /profession=eq\.mining&/); // an unknown profession never reaches the URL
assert.doesNotMatch(e.general(3).url + e.profession(3, 'gardening').url, /user_id|email/);
const init = requestInit(e.meter, 'ANON');
assert.equal(init.headers.apikey, 'ANON');
assert.equal(init.headers.authorization, 'Bearer ANON');

// ---- the meter -------------------------------------------------------------------------------------------------------------------------
const view = meterView([{ sold: 3742, target: 15000, season_open: false, starts_at: null, ends_at: null, updated_at: '2026-10-14T00:00:00Z' }], 'pt');
assert.equal(view.sold, 3742);
assert.equal(view.target, 15000);
assert.equal(view.pct, 24.9);
assert.equal(view.soldText, '3.742');
assert.equal(view.targetText, '15.000');
assert.equal(view.pctText, '24,9%');
assert.equal(view.open, false);
assert.equal(meterView({ sold: 3742, target: 15000 }, 'en').targetText, '15,000');
assert.equal(meterView({ sold: 20000, target: 15000 }, 'pt').pct, 100); // never past the full bar
assert.equal(meterView({ sold: 0, target: 15000 }, 'pt').pct, 0);
for (const bad of [null, [], {}, { sold: -1, target: 15000 }, { sold: 'x', target: 15000 }, { sold: 10, target: 0 }, { sold: 10 }, 'x', [{ sold: Infinity, target: 5 }]]) {
  assert.equal(meterView(bad, 'pt'), null, JSON.stringify(bad));
}
const opened = meterView({ sold: 15000, target: 15000, season_open: true, starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-31T00:00:00Z' }, 'pt');
assert.equal(opened.open, true);
assert.equal(meterView({ sold: 1, target: 2, season_open: true, starts_at: null, ends_at: null }, 'pt').open, false); // open without dates is not trusted
assert.equal(fillText(seasonPage.goalLabel.pt, { target: '15.000' }), 'Ao chegarmos a 15.000 Passes, abrimos a Liga com prêmio em dinheiro.');
assert.equal(fillText(seasonPage.goalLabel.en, { target: '15,000' }), 'When we reach 15,000 Passes, we open the League with a cash prize.');

// ---- the meter states: low count, mid, no-count, failed ------------------------------------------------------------------------------------
const present = (raw, lang = 'pt', options) => {
  const l = Object.fromEntries(Object.entries(seasonPage).map(([key, value]) => [key, value[lang]]));
  return meterPresentation(meterView(raw, lang, options), l);
};
const low = present({ sold: 37, target: 15000 });
assert.equal(meterView({ sold: 37, target: 15000 }, 'pt').low, true);
assert.equal(low.figures, false, 'low count: no big "37 / 15.000"');
assert.equal(low.showPct, false, 'low count: the percentage is hidden');
assert.equal(low.line, '37 aventureiros já têm o Passe · faltam 14.963 para a Liga');
assert.ok(low.barPct >= 3, 'low count: the bar has a visible minimum width');
assert.equal(low.goal, 'Ao chegarmos a 15.000 Passes, abrimos a Liga com prêmio em dinheiro.');
assert.equal(present({ sold: 37, target: 15000 }, 'en').line, '37 adventurers already own the Pass · 14,963 to go for the League');
assert.equal(present({ sold: 1, target: 15000 }).line, '1 aventureiro já tem o Passe · faltam 14.999 para a Liga');
assert.equal(present({ sold: 0, target: 15000 }).line, 'Seja um dos primeiros aventureiros com o Passe · faltam 15.000 para a Liga');
assert.equal(present({ sold: 0, target: 15000 }).barPct, 0);
assert.equal(meterView({ sold: 749, target: 15000 }, 'pt').low, true); // 4.99%: still low with the default 5%
assert.equal(meterView({ sold: 750, target: 15000 }, 'pt').low, false); // exactly 5%: not low
assert.equal(meterView({ sold: 749, target: 15000 }, 'pt', { lowPct: 2 }).low, false); // the threshold comes from the config
const mid = present({ sold: 3742, target: 15000 });
assert.equal(mid.figures, true);
assert.equal(mid.showPct, true);
assert.equal(mid.barPct, 24.9);
assert.equal(meterView({ sold: 3742, target: 15000 }, 'pt').pctText, '24,9%');
// meterShowCount false: no absolute number and no percentage anywhere in what is shown
for (const raw of [{ sold: 37, target: 15000 }, { sold: 3742, target: 15000 }, { sold: 8000, target: 15000 }, { sold: 14100, target: 15000 }]) {
  for (const lang of ['pt', 'en']) {
    const hidden = present(raw, lang, { showCount: false });
    assert.equal(hidden.figures, false);
    assert.equal(hidden.showPct, false);
    assert.ok(!/\d/.test(hidden.line + hidden.goal), 'no digits when the count is hidden: ' + hidden.line + ' / ' + hidden.goal);
  }
}
assert.equal(present({ sold: 37, target: 15000 }, 'pt', { showCount: false }).line, 'A contagem está só começando.');
assert.equal(present({ sold: 3742, target: 15000 }, 'pt', { showCount: false }).line, 'A comunidade está a caminho da meta.');
assert.equal(present({ sold: 8000, target: 15000 }, 'pt', { showCount: false }).line, 'Já passamos da metade do caminho.');
assert.equal(present({ sold: 14100, target: 15000 }, 'pt', { showCount: false }).line, 'Falta pouco para a Liga abrir.');
assert.equal(present({ sold: 3742, target: 15000 }, 'pt', { showCount: false }).goal, 'Ao chegarmos à meta de Passes, abrimos a Liga com prêmio em dinheiro.');
// a failed load is its own message, escaped, and never the "no players" text
const failed = failedRows(labels);
assert.ok(failed.includes('Ranking indisponível agora. Tente de novo em instantes.') && failed.includes('data-kind="failed"'));
assert.ok(!/não há jogadores|Ainda não há/i.test(failed), 'failed is not empty');
assert.ok(renderRows([], 'general', 'pt', labels).includes('data-kind="empty"') && renderRows([], 'general', 'pt', labels).includes('Ainda não há jogadores neste ranking.'), 'empty is its own message');
assert.ok(failedRows({ rankingFailed: '<script>' }).includes('&lt;script&gt;'), 'the message is escaped');
assert.equal(formatInt(1234567, 'en'), '1,234,567');
assert.equal(formatInt(Number.NaN, 'pt'), '—');

// ---- the countdown ---------------------------------------------------------------------------------------------------------------------
const now = Date.parse('2026-12-01T00:00:00Z');
assert.equal(countdownText(now + (3 * 24 + 4) * 3600_000, now, 'pt'), '3 d 4 h');
assert.equal(countdownText(now + (4 * 60 + 12) * 60_000, now, 'pt'), '4 h 12 min');
assert.equal(countdownText(now + 5 * 60_000, now, 'pt'), '5 min');
assert.equal(countdownText(now + 20_000, now, 'en'), 'under 1 min');
assert.equal(countdownText(now - 1, now, 'pt'), null);

// ---- which season the rankings show ------------------------------------------------------------------------------------------------------
const pre = { number: 0, kind: 'pre', status: 'open', starts_at: '2026-10-14T00:00:00Z', ends_at: '2099-12-31T00:00:00Z', freeze_at: '2099-12-31T00:00:00Z', prize_note: null };
const waiting = { number: 1, kind: 'ranked', status: 'upcoming', starts_at: null, ends_at: null, freeze_at: null, prize_note: null };
const running = { number: 1, kind: 'ranked', status: 'open', starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-12-31T00:00:00Z', freeze_at: '2026-12-29T00:00:00Z', prize_note: null };
const done = { ...running, status: 'closed' };
assert.equal(pickBoard([waiting, pre], now).mode, 'pre');
assert.equal(pickBoard([pre, waiting], now).season.number, 0);
assert.equal(pickBoard([pre, running], now).mode, 'paid'); // the paid season wins as soon as it is open
assert.equal(pickBoard([{ ...pre, status: 'closed' }, running], now).season.number, 1);
assert.equal(pickBoard([{ ...pre, status: 'closed' }, done], now).mode, 'ended');
assert.equal(pickBoard([{ ...pre, status: 'closed' }, waiting], now).mode, 'none');
assert.equal(pickBoard([waiting], now).mode, 'none');
assert.equal(pickBoard([{ ...running, starts_at: '2027-01-01T00:00:00Z' }], now).mode, 'none'); // not started yet
assert.equal(pickBoard(null, now).mode, 'none');
assert.equal(pickBoard([{ nope: true }, null, 7], now).mode, 'none');

// ---- rows: escaping, position, bad data ----------------------------------------------------------------------------------------------------
const evil = '<img src=x onerror=alert(1)>&"\'';
const general = [
  { rank: 1, username: evil, level_total: 112, paragon_level: 12, highest_floor: 100, deepest_depth: 7 },
  { rank: 3, username: null, level_total: 90, paragon_level: 0, highest_floor: 88, deepest_depth: 0 },
  { rank: 4, username: 'Ok', level_total: 'x', paragon_level: 0, highest_floor: 1, deepest_depth: 0 },
  { rank: 5, username: 'Maria', level_total: 80, paragon_level: 0, highest_floor: 70, deepest_depth: 0 },
];
const html = renderRows(general, 'general', 'pt', labels);
assert.ok(!html.includes('<img'), 'username must be escaped');
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;'));
assert.ok(html.includes('<span class="anon">Aventureiro</span>'));
assert.ok(!html.includes('>Ok<'), 'a row with a malformed number is dropped');
assert.equal((html.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr>/g) || []).length, 3);
assert.ok(html.includes('<td class="num">3</td><th scope="row">Maria</th>'), 'positions follow the list, without holes');
assert.ok(html.includes('112<small> (Paragon 12)</small>'));
assert.ok(html.includes('<th scope="col"') && html.includes('<caption class="sr-only">'));
const prof = renderRows([{ rank: 1, username: 'Z<b>', level: 75, score: 1234567 }], 'profession', 'en', { ...labels, tableLabel: 'x' });
assert.ok(prof.includes('Z&lt;b&gt;') && prof.includes('1,234,567') && !prof.includes('<b>'));
assert.ok(renderRows([], 'general', 'pt', labels).includes('rank-empty'));
assert.ok(renderRows('nope', 'general', 'pt', labels).includes('rank-empty'));
const many = Array.from({ length: 80 }, (_, i) => ({ rank: i + 1, username: 'P' + i, level: 5, score: 100 }));
assert.equal((renderRows(many, 'profession', 'pt', labels).match(/<tr>/g) || []).length, RANK_LIMIT + 1); // 50 rows + the header row
assert.equal(escapeHtml(null), '');
assert.deepEqual(PROFESSIONS, ['mining', 'woodcutting', 'gardening']);

// ---- the generated pages: config null, then filled -----------------------------------------------------------------------------------------------
const snapshot = JSON.stringify(config);
const reset = () => Object.assign(config, JSON.parse(snapshot));
const pageOf = (lang, route) => renderSite(lang).find(item => item.route === route);
const page = (lang, route = 'season') => pageOf(lang, route).html;
const text = html => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');

const bare = page('pt');
assert.ok(bare.includes('Contagem de Passes indisponível agora. Tente de novo em instantes.'), 'no live config: the meter says it is unavailable');
assert.ok(bare.includes('Ranking indisponível agora. Tente de novo em instantes.'), 'no live config: the rankings say they are unavailable');
assert.ok(!text(bare).includes('Ainda não há jogadores'), 'unavailable is never shown as empty');
assert.ok(!bare.includes('>—<') && !/<strong data-meter-sold>[^<]/.test(bare), 'no dash placeholders in the meter');
assert.ok(bare.includes('data-meter-closed hidden'), 'the meter figures stay hidden until real data arrives');
assert.ok(bare.includes('aria-disabled="true">Em breve'), 'no sale: the buy button is disabled "Em breve"');
assert.ok(bare.includes('data-supabase-url=""') && bare.includes('data-anon-key=""'));
assert.ok(bare.includes('data-low-pct="5"') && bare.includes('data-show-count="true"'));
assert.ok(!/15[.,]?000/.test(bare), 'the goal is never written in the page: it comes from the server');
assert.ok(!/R\$|US\$|\bUSD\b|reais/i.test(bare), 'no prize amount and no Pass price');
assert.ok(bare.includes('exclusiva de quem tem o Passe'));
assert.ok(bare.indexOf('meter-title') < bare.indexOf('board-title') && bare.indexOf('board-title') < bare.indexOf('prof-title'), 'order: meter, buy, general ranking, professions');
assert.ok(bare.indexOf('class="actions"') > bare.indexOf('data-meter-closed') && bare.indexOf('class="actions"') < bare.indexOf('board-title'));
// the three steps open the page, before the meter
const steps = ['Jogue grátis.', 'Com o Passe, entre na pré-temporada (sem prêmio).', 'Quando a comunidade chegar à meta de Passes, começa a Liga com prêmio em dinheiro, de valor fixo publicado no regulamento.'];
for (const step of steps) assert.ok(bare.includes('<li>' + step + '</li>'), step);
assert.ok(bare.indexOf('<li>' + steps[0]) < bare.indexOf('id="meter-title"'));
assert.ok(bare.includes('O prêmio é um valor fixo, definido antes do início. Não depende de quantos Passes forem vendidos e não é sorteio: vence quem chegar mais longe, com auditoria antes do pagamento.'));
assert.ok(bare.indexOf('class="prize-fixed"') > bare.indexOf('id="meter-title"') && bare.indexOf('class="prize-fixed"') < bare.indexOf('id="board-title"'), 'the fixed-prize text sits at the meter');
const english = page('en');
assert.ok(english.includes('Ranking unavailable right now. Try again in a moment.') && english.includes('<li>Play free.</li>'));
assert.ok(english.includes('The prize is a fixed amount, set before the start.'));
assert.ok(renderSite('pt').every(item => item.html.includes('href="/pt/season/"')), 'linked from the menu of every page');
assert.ok(!/Campeonato|campeonato|Competição<\/a>|temporada valendo|Temporada valendo/.test(renderSite('pt').filter(item => item.route !== 'championship').map(item => item.html).join('')), 'one name: Liga da Temporada');
assert.ok(!/championship|ranked season/i.test(renderSite('en').filter(item => item.route !== 'championship').map(item => item.html).join('')), 'one name in English: Season League');
// the old Championship address still works and points to the Season League page
const old = pageOf('pt', 'championship');
assert.ok(old.html.includes('http-equiv="refresh" content="0;url=/pt/season/"') && old.html.includes('href="/pt/season/"') && old.indexable === false);
// no page claims both "sale not open" and "available", and no contradiction about the League format
assert.ok(!text(page('pt', 'pass')).includes('Disponível'), 'the Pass page has no "Disponível" badge');
assert.ok(!/ainda não (está|foi|abriu)[^.]*\.[^.]*(Disponível)/.test(text(renderSite('pt').map(item => item.html).join(' '))));
assert.ok(!/não foram definidos/i.test(renderSite('pt').map(item => item.html).join('')));

// ---- the Pass: one flag (passSalesOpen) drives every page ---------------------------------------------------------------------------------------------------
const passClosed = text(page('pt', 'pass'));
assert.ok(passClosed.includes('O Passe está chegando') && passClosed.includes('A venda ainda não abriu'));
const closedEverywhere = (renderSite('pt').map(item => item.html).join(' ') + renderSite('en').map(item => item.html).join(' ')).replace(/data-labels="[^"]*"/g, ''); // the labels attribute carries every label, used or not
assert.ok(!/US\$ ?10|Comprar o Passe|Buy the Pass|Pagamento seguro|Secure payment|Stripe|comprar=passe/.test(closedEverywhere), 'closed: no price, no buy link, no Stripe line anywhere');
assert.ok(!pageOf('pt', 'pass').html.includes('Política de reembolso'));
assert.ok(renderSite('pt').find(item => item.route === '').html.includes('aria-disabled="true">Jogar grátis · Em breve'));
assert.ok(!renderSite('pt').find(item => item.route === '').html.includes('Em desenvolvimento ativo'), 'no "in active development" on the home page');
assert.ok(renderSite('pt').find(item => item.route === 'faq').html.includes('em desenvolvimento ativo'), 'the status line lives in the FAQ');
assert.ok(renderSite('pt').find(item => item.route === '').html.includes('Um RPG idle que joga por você. Você só decide.'));
assert.ok(renderSite('en').find(item => item.route === '').html.includes('An idle RPG that plays for you. You just decide.'));
assert.ok(!/href="[^"]*roadmap[^"]*"[^>]*>[^<]*(Jogar|Play)/.test(renderSite('pt').find(item => item.route === '').html), 'the play button never points at the roadmap');

config.playUrl = 'https://jogo.example.test/';
config.supabaseUrl = 'https://abcdefghij.supabase.co';
config.supabaseAnonKey = 'public-anon-key-for-tests-1234567890';
const playing = renderSite('pt').find(item => item.route === '').html;
assert.ok(playing.includes('href="https://jogo.example.test/">Jogar grátis ↗'), 'with playUrl the play button is live');
assert.ok(!page('pt', 'pass').includes('US$'), 'playUrl alone does not open the sale');
const filled = page('en');
assert.ok(filled.includes('aria-disabled="true">Soon'), 'playUrl set but the sale closed: the buy button stays disabled');
assert.ok(!filled.includes('comprar=passe'));
assert.ok(filled.includes('data-supabase-url="https://abcdefghij.supabase.co"') && filled.includes('data-anon-key="public-anon-key-for-tests-1234567890"'));
assert.ok(filled.includes('Loading live data'));
assert.ok(filled.includes('When we reach {target} Passes, we open the League with a cash prize.'), 'the label template is in the page, the number is filled by the script from the server');
config.meterLowPct = 8; config.meterShowCount = false;
assert.ok(page('pt').includes('data-low-pct="8"') && page('pt').includes('data-show-count="false"'), 'the owner settings reach the script');

config.passSalesOpen = true;
config.legalLive.refund = true;
const refund = legal.find(item => item.route === 'refund');
refund.body = { pt: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto de reembolso <de teste>.' }] }], en: [{ type: 'paragraph', content: [{ type: 'text', text: 'Test refund text.' }] }] };
const passOpen = page('pt', 'pass');
assert.ok(passOpen.includes('<strong>US$ 10</strong>, pagamento único, sem renovação'));
assert.ok(passOpen.includes('href="https://jogo.example.test/?comprar=passe"') && passOpen.includes('Comprar o Passe'));
assert.ok(passOpen.includes('Pagamento seguro pelo Stripe') && passOpen.includes('href="/pt/refund/"'));
assert.ok(!passOpen.includes('O Passe está chegando'));
assert.ok(page('en', 'pass').includes('<strong>US$ 10</strong>, one-time payment, no renewal'));
const openSeason = page('en');
assert.ok(openSeason.includes('href="https://jogo.example.test/?comprar=passe"') && openSeason.includes('Buy the Pass'));
assert.ok(openSeason.includes('The purchase is made inside the game'));
assert.ok(renderSite('pt').every(item => item.html.includes('Pagamentos processados pelo Stripe')), 'the Stripe line is in every footer when the sale is open');
assert.ok(renderSite('pt').find(item => item.route === 'faq').html.includes('US$ 10') && renderSite('pt').find(item => item.route === 'roadmap').html.includes('A compra está aberta.'));
assert.ok(renderSite('pt').find(item => item.route === 'refund').html.includes('Texto de reembolso &lt;de teste&gt;.'), 'a live legal page renders its (escaped) text');
config.playUrl = 'https://jogo.example.test/play?x=1';
assert.ok(page('pt', 'pass').includes('href="https://jogo.example.test/play?x=1&amp;comprar=passe"'));

// ---- the footer: company fields only when filled, legal links only when live -------------------------------------------------------------------------------
reset();
const footerOf = html => html.match(/<footer>[\s\S]*<\/footer>/)[0];
const emptyFooter = footerOf(page('pt', ''));
assert.ok(!emptyFooter.includes('footer-trust') && !/CNPJ|Suporte|Stripe|mailto|null|undefined/.test(emptyFooter), 'no company, no live legal page: nothing is rendered, not even a placeholder');
assert.ok(!/href="\/pt\/(terms|privacy|refund|season-rules)\//.test(renderSite('pt').map(item => footerOf(item.html)).join('')), 'placeholder legal pages stay unlinked');
config.company = { legalName: 'Estúdio <Teste> Ltda', cnpj: null, supportEmail: 'suporte@example.test' };
const partial = footerOf(page('pt', ''));
assert.ok(partial.includes('Estúdio &lt;Teste&gt; Ltda') && partial.includes('mailto:suporte@example.test') && !partial.includes('CNPJ'), 'only the filled fields render, escaped');
config.company.cnpj = '00.000.000/0000-00';
assert.ok(footerOf(page('pt', '')).includes('CNPJ 00.000.000/0000-00'));
config.legalLive.terms = true;
assert.ok(!footerOf(page('pt', '')).includes('/pt/terms/'), 'a flag without text links nothing');
legal.find(item => item.route === 'terms').body = { pt: [{ type: 'paragraph', content: [{ type: 'text', text: 'Termos.' }] }], en: [{ type: 'paragraph', content: [{ type: 'text', text: 'Terms.' }] }] };
assert.ok(footerOf(page('pt', '')).includes('href="/pt/terms/"') && !footerOf(page('pt', '')).includes('href="/pt/privacy/"'), 'only the live page is linked');
legal.find(item => item.route === 'terms').body = undefined;
reset();

// ---- sharing / SEO: relative and noindex until siteUrl is set ----------------------------------------------------------------------------------------------------
const head = html => html.match(/<head>[\s\S]*<\/head>/)[0];
const homeHead = head(page('pt', ''));
assert.ok(homeHead.includes('content="noindex,nofollow"') && !homeHead.includes('rel="canonical"'), 'no siteUrl: noindex and no canonical');
assert.ok(homeHead.includes('<link rel="alternate" hreflang="en" href="/en/">'), 'no siteUrl: relative hreflang as before');
for (const tag of ['og:title', 'og:description', 'og:type', 'og:image', 'og:image:width', 'twitter:card', 'twitter:image', 'twitter:title']) assert.ok(homeHead.includes(tag), tag);
assert.ok(homeHead.includes('content="/img/og.jpg"') && !homeHead.includes('og:url'));
const descriptions = new Set(renderSite('pt').map(item => head(item.html).match(/name="description" content="([^"]*)"/)[1]));
assert.ok(descriptions.size >= 8, 'pages have their own descriptions: ' + descriptions.size);
assert.ok(head(page('pt', 'faq')).match(/name="description" content="([^"]*)"/)[1] !== head(page('pt', 'about')).match(/name="description" content="([^"]*)"/)[1]);
assert.ok(!/Em desenvolvimento ativo|In active development/.test(Array.from(descriptions).join(' ')));
config.siteUrl = 'https://portal.example.test/';
const seoHead = head(page('en', 'pass'));
assert.ok(seoHead.includes('<link rel="canonical" href="https://portal.example.test/en/pass/">'));
assert.ok(seoHead.includes('hreflang="pt" href="https://portal.example.test/pt/pass/"') && seoHead.includes('hreflang="en" href="https://portal.example.test/en/pass/"') && seoHead.includes('hreflang="x-default"'));
assert.ok(seoHead.includes('content="index,follow"') && seoHead.includes('property="og:url" content="https://portal.example.test/en/pass/"') && seoHead.includes('content="https://portal.example.test/img/og.jpg"'));
assert.ok(head(page('pt', 'championship')).includes('noindex,follow') && head(page('pt', 'terms')).includes('noindex,follow'), 'redirect and placeholder pages are never indexed');
const everything = renderSite('pt').map(item => ({ ...item, lang: 'pt' })).concat(renderSite('en').map(item => ({ ...item, lang: 'en' })));
const sitemap = sitemapXml(config.siteUrl, everything);
assert.ok(sitemap.includes('<loc>https://portal.example.test/pt/season/</loc>') && sitemap.includes('<loc>https://portal.example.test/en/</loc>'));
assert.ok(!/championship|terms|privacy|refund|season-rules/.test(sitemap), 'redirect and placeholder pages are not in the sitemap');
assert.ok(robotsTxt(config.siteUrl).includes('Sitemap: https://portal.example.test/sitemap.xml'));
reset();
console.log('PASS: Liga page, meter states, pure module, escaping, season picking, Pass flag, footer, legal links and sharing tags.');
