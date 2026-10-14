// Checks of the Temporada page: the pure module (public/season-core.js, the same file the browser runs) and the generated page. Run: node scripts/season-check.mjs
import assert from 'node:assert/strict';
import { PROFESSIONS, RANK_LIMIT, cleanSupabaseUrl, countdownText, endpoints, escapeHtml, fillText, formatInt, meterView, pickBoard, renderRows, requestInit } from '../public/season-core.js';
import { config, seasonPage } from '../src/content.mjs';
import { renderSite } from '../src/pages.mjs';

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
assert.equal(fillText(seasonPage.goalLabel.pt, { target: '15.000' }), 'Quando chegarmos a 15.000 Passes, a temporada valendo começa.');
assert.equal(fillText(seasonPage.goalLabel.en, { target: '15,000' }), 'When we reach 15,000 Passes, the ranked season begins.');
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

// ---- the generated page: config null, then filled -----------------------------------------------------------------------------------------------
const page = lang => renderSite(lang).find(item => item.route === 'season').html;
const bare = page('pt');
assert.ok(bare.includes('Dados ao vivo indisponíveis no momento.'));
assert.ok(bare.includes('aria-disabled="true">Em breve'), 'no play URL: the buy button is disabled "Em breve"');
assert.ok(bare.includes('data-supabase-url=""') && bare.includes('data-anon-key=""'));
assert.ok(!/15[.,]?000/.test(bare), 'the goal is never written in the page: it comes from the server');
assert.ok(!/R\$|US\$|\bUSD\b|reais/i.test(bare), 'no prize amount');
assert.ok(bare.includes('exclusiva de quem tem o Passe'));
assert.ok(bare.indexOf('meter-title') < bare.indexOf('board-title') && bare.indexOf('board-title') < bare.indexOf('prof-title'), 'order: meter, buy, general ranking, professions');
assert.ok(bare.indexOf('class="actions"') > bare.indexOf('data-meter-closed') && bare.indexOf('class="actions"') < bare.indexOf('board-title'));
assert.ok(renderSite('en').find(item => item.route === 'season').html.includes('Live data is unavailable right now.'));
assert.ok(renderSite('pt').every(item => item.html.includes('href="/pt/season/"')), 'linked from the menu of every page');

config.playUrl = 'https://jogo.example.test/';
config.supabaseUrl = 'https://abcdefghij.supabase.co';
config.supabaseAnonKey = 'public-anon-key-for-tests-1234567890';
const filled = page('en');
assert.ok(filled.includes('href="https://jogo.example.test/?comprar=passe"'), 'the buy button deep-links into the game');
assert.ok(filled.includes('Buy the Pass'));
assert.ok(filled.includes('data-supabase-url="https://abcdefghij.supabase.co"') && filled.includes('data-anon-key="public-anon-key-for-tests-1234567890"'));
assert.ok(filled.includes('Loading live data'));
assert.ok(filled.includes('When we reach {target} Passes, the ranked season begins.'), 'the label template is in the page, the number is filled by the script from the server');
config.playUrl = 'https://jogo.example.test/play?x=1';
assert.ok(page('pt').includes('href="https://jogo.example.test/play?x=1&amp;comprar=passe"'));
config.playUrl = null;
config.supabaseUrl = null;
config.supabaseAnonKey = null;
console.log('PASS: Temporada page, pure module, escaping, meter, season picking and generated markup.');
