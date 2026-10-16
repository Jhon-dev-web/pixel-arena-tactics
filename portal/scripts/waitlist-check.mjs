// Checks of the "Avise-me no lançamento" block: the pure module (public/waitlist-core.js, the same file the browser runs) and the generated pages. Run: node scripts/waitlist-check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildJoinBody, classifyJoin, classifyUnsubscribe, countRequest, countView, fillText, looksLikeEmail, sourceFrom, tokenFrom, waitlistEndpoints } from '../public/waitlist-core.js';
import { cleanSupabaseUrl } from '../public/season-core.js';
import { config, legal, waitlist } from '../src/content.mjs';
import { renderSite } from '../src/pages.mjs';
import { sitemapXml } from '../src/seo.mjs';

const root = path.resolve(import.meta.dirname, '..');
const snapshot = JSON.stringify(config);
const reset = () => Object.assign(config, JSON.parse(snapshot));
const pageOf = (lang, route) => renderSite(lang).find(item => item.route === route);
const page = (lang, route = '') => pageOf(lang, route).html;
const all = lang => renderSite(lang).map(item => item.html).join('\n');
const blocks = html => html.match(/<section class="section waitlist[\s\S]*?<\/section>/g) ?? [];

// ---- off by default: nothing at all ------------------------------------------------------------------------------------------------------------
assert.equal(config.waitlistEnabled, false, 'the waitlist is off by default');
for (const lang of ['pt', 'en']) {
  const everything = all(lang);
  assert.ok(!/data-waitlist|waitlist\.js|waitlist-core|Avise-me|Notify me at launch|name="hp"/.test(everything), lang + ': off = no block, no script, no text');
  assert.equal(pageOf(lang, 'unsubscribe'), undefined, 'off = no unsubscribe page');
}

// ---- on, with the Supabase address ------------------------------------------------------------------------------------------------------------------
config.waitlistEnabled = true;
config.supabaseUrl = 'https://abcdefghij.supabase.co';
const home = page('pt');
const [homeBlock] = blocks(home);
assert.ok(homeBlock, 'Home has the block');
assert.equal(blocks(home).length, 1);
assert.ok(homeBlock.includes('<h2 id="waitlist-home-title">Avise-me no lançamento</h2>'));
assert.ok(/<form class="waitlist-form" data-wl-form method="post" novalidate hidden>/.test(homeBlock), 'the form is hidden until the script shows it');
assert.ok(/<input id="waitlist-home-email" name="email" type="email"[^>]*autocomplete="email"[^>]*maxlength="254"[^>]*required/.test(homeBlock));
assert.ok(/<label for="waitlist-home-email">Seu e-mail<\/label>/.test(homeBlock), 'the email field has a label');
assert.ok(/<input name="consent" type="checkbox" required><span>Quero receber e-mails sobre o lançamento do Arena Idle\. Posso cancelar quando quiser\.<\/span>/.test(homeBlock), 'the consent sentence is exactly the owner text and the box is required');
assert.ok(/<div class="wl-hp" aria-hidden="true">[\s\S]*name="hp" type="text" tabindex="-1" autocomplete="off"/.test(homeBlock), 'honeypot field, out of the tab order and hidden from assistive technology');
assert.ok(/<button class="button" type="submit">Avise-me<\/button>/.test(homeBlock));
assert.ok(homeBlock.includes('role="status" aria-live="polite" data-wl-status'));
assert.ok(homeBlock.includes('<noscript>O cadastro precisa de JavaScript.'), 'without JavaScript: a short note');
assert.ok(homeBlock.includes('data-supabase-url="https://abcdefghij.supabase.co"') && homeBlock.includes('data-anon-key=""'), 'no anon key configured: none in the page, so no counter request');
assert.ok(homeBlock.includes('<script type="module" src="/waitlist.js"></script>'));
assert.ok(!/ on[a-z]+=|javascript:|<style|style="/.test(homeBlock), 'no inline handlers, no inline style: the CSP allows none');
assert.ok(!homeBlock.includes('href='), 'no privacy link while the privacy page is not published');
assert.ok(!homeBlock.includes('class="actions"'));
// the block sits after the hero and before the rest of the Home
assert.ok(home.indexOf('data-waitlist') > home.indexOf('class="hero"') && home.indexOf('data-waitlist') < home.indexOf('fun-section'));
// the compact one on the Temporada page
const season = page('pt', 'season');
assert.equal(blocks(season).length, 1);
assert.ok(blocks(season)[0].includes('waitlist-season') && blocks(season)[0].includes('id="waitlist-season-email"') && blocks(season)[0].includes('Quer saber quando a Liga e o jogo abrem?'));
// only those two pages
for (const item of renderSite('pt')) if (!['', 'season'].includes(item.route)) assert.ok(!item.html.includes('data-waitlist'), item.route);
// English parity: same structure, English words
const homeEn = blocks(page('en'))[0];
assert.ok(homeEn.includes('Notify me at launch') && homeEn.includes('I want to receive emails about the Arena Idle launch. I can cancel any time.') && homeEn.includes('Your email'));
const shape = html => html.replace(/>[^<]*</g, '><').replace(/data-labels="[^"]*"/g, '').replace(/ (placeholder|aria-label|for|id|data-lang)="[^"]*"/g, '');
assert.equal(shape(homeEn), shape(homeBlock), 'pt and en blocks have the same markup');
assert.equal(shape(blocks(page('en', 'season'))[0]), shape(blocks(season)[0]));
for (const key of Object.keys(waitlist)) assert.ok(waitlist[key].pt && waitlist[key].en, 'both languages: ' + key);
assert.ok(homeBlock.lang !== 'x' && page('pt').includes('<html lang="pt"') && page('en').includes('<html lang="en"'));

// the consent text and the labels the script uses are in the page, escaped
const labelsAttr = homeBlock.match(/data-labels="([^"]*)"/)[1];
const labels = JSON.parse(labelsAttr.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
for (const key of ['registered', 'badEmail', 'needConsent', 'rateLimited', 'failed', 'sending', 'count']) assert.ok(typeof labels[key] === 'string' && labels[key], key);
assert.equal(labels.registered, 'Você está na lista. Avisaremos quando o Arena Idle abrir.');

// ---- the privacy link: only when that page is published ----------------------------------------------------------------------------------------------
config.legalLive.privacy = true;
assert.ok(!blocks(page('pt'))[0].includes('/pt/privacy/'), 'a flag without text links nothing');
const privacy = legal.find(item => item.route === 'privacy');
privacy.body = { pt: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto.' }] }], en: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text.' }] }] };
assert.ok(blocks(page('pt'))[0].includes('<a class="" href="/pt/privacy/">Política de Privacidade</a>'));
assert.ok(blocks(page('en'))[0].includes('href="/en/privacy/">Privacy Policy</a>'));
privacy.body = undefined;
reset();
config.waitlistEnabled = true;
config.supabaseUrl = 'https://abcdefghij.supabase.co';

// ---- the anon key (public) enables the counter, the markup carries it only then ------------------------------------------------------------------------
config.supabaseAnonKey = 'public-anon-key-for-tests-1234567890';
assert.ok(blocks(page('pt'))[0].includes('data-anon-key="public-anon-key-for-tests-1234567890"'));
assert.ok(blocks(page('pt'))[0].includes('data-wl-count hidden'), 'the counter line is hidden until the server answers with a number');
config.supabaseAnonKey = null;

// ---- escaping -----------------------------------------------------------------------------------------------------------------------------------------
const original = waitlist.title.pt;
const originalLabel = waitlist.failed.pt;
waitlist.title = { pt: 'Título <img src=x onerror=alert(1)>', en: 'T' };
waitlist.failed = { pt: 'Falha "aspas" <b>', en: 'f' };
const hostile = blocks(page('pt'))[0];
// (copy is owner-written, not user input; labels inside the attribute must still be escaped so a quote cannot end the attribute)
assert.ok(hostile.includes('data-labels="'));
assert.ok(!hostile.match(/data-labels="([^"]*)"/)[1].includes('<b>') && !hostile.match(/data-labels="([^"]*)"/)[1].includes('"aspas"'));
waitlist.title = { pt: original, en: 'Notify me at launch' };
waitlist.failed = { pt: originalLabel, en: 'Could not save right now. Please try again in a moment.' };

// ---- not configured: the block says so and has no form -------------------------------------------------------------------------------------------------
config.supabaseUrl = null;
const unconfigured = blocks(page('pt'))[0];
assert.ok(unconfigured.includes('O cadastro ainda não está disponível. Volte em breve.') && !unconfigured.includes('<form') && !unconfigured.includes('waitlist.js') && !unconfigured.includes('type="email"'));
assert.ok(blocks(page('en'))[0].includes('Sign-up is not available yet. Please come back soon.'));
config.supabaseUrl = 'https://abcdefghij.supabase.co';

// ---- the unsubscribe page ----------------------------------------------------------------------------------------------------------------------------
const unsub = pageOf('pt', 'unsubscribe');
assert.ok(unsub && unsub.indexable === false, 'unsubscribe page exists and is never indexed');
assert.ok(unsub.html.includes('data-unsubscribe') && unsub.html.includes('data-unsub-button hidden') && unsub.html.includes('<noscript>Para cancelar por aqui é preciso JavaScript.'));
assert.ok((unsub.html.match(/<h1[ >]/g) ?? []).length === 1);
config.siteUrl = 'https://portal.example.test/';
const everything = renderSite('pt').map(item => ({ ...item, lang: 'pt' })).concat(renderSite('en').map(item => ({ ...item, lang: 'en' })));
assert.ok(!sitemapXml(config.siteUrl, everything).includes('unsubscribe'), 'not in the sitemap');
assert.ok(pageOf('pt', 'unsubscribe').html.includes('noindex'), 'noindex');
reset();

// ---- the pure module ----------------------------------------------------------------------------------------------------------------------------------
for (const good of ['a@b.co', ' Ana@Example.com ', 'x.y+z@sub.example.com.br']) assert.equal(looksLikeEmail(good), true, good);
for (const bad of ['', 'a', 'a@b', 'a@b.c', 'a b@c.com', '@x.com', 'a@@x.com', '<a>@x.com', null, undefined, 'x'.repeat(260) + '@x.com']) assert.equal(looksLikeEmail(bad), false, String(bad));
assert.deepEqual(buildJoinBody({ email: ' Ana@Example.com ', consent: true, hp: '', lang: 'en', source: 'twitter' }), { email: 'Ana@Example.com', locale: 'en', source: 'twitter', consent: true, hp: '' });
assert.equal(buildJoinBody({ email: 'a@b.co', consent: 'on', lang: 'fr' }).consent, false, 'consent must be the boolean true');
assert.equal(buildJoinBody({ email: 'a@b.co', consent: true, lang: 'fr' }).locale, 'pt');
assert.deepEqual(Object.keys(buildJoinBody({ email: 'a@b.co', consent: true })).sort(), ['consent', 'email', 'hp', 'locale', 'source']);
// states: a new address and one already on the list are the same 200 and give the same result
assert.equal(classifyJoin(200, { ok: true }), 'registered');
assert.equal(classifyJoin(200, { ok: true }), classifyJoin(200, { ok: true }));
assert.equal(classifyJoin(400, { ok: false, error: 'bad_email' }), 'badEmail');
assert.equal(classifyJoin(400, { ok: false, error: 'no_consent' }), 'needConsent');
assert.equal(classifyJoin(429, { ok: false, error: 'rate_limited' }), 'rateLimited');
for (const [status, body] of [[503, { ok: false }], [500, null], [403, {}], [200, null], [200, { ok: false }], [200, 'ok'], [400, { error: 'bad_body' }]]) assert.equal(classifyJoin(status, body), 'failed', status + JSON.stringify(body));
assert.equal(classifyUnsubscribe(200, { ok: true }), 'done');
assert.equal(classifyUnsubscribe(400, { ok: false }), 'bad');
assert.equal(classifyUnsubscribe(503, null), 'failed');
// the endpoints come from the cleaned project address only
assert.equal(waitlistEndpoints(null), null);
assert.deepEqual(waitlistEndpoints(cleanSupabaseUrl('https://abcdefghij.supabase.co/')), {
  join: 'https://abcdefghij.supabase.co/functions/v1/waitlist-join',
  unsubscribe: 'https://abcdefghij.supabase.co/functions/v1/waitlist-unsubscribe',
  count: 'https://abcdefghij.supabase.co/rest/v1/rpc/waitlist_count',
});
assert.equal(waitlistEndpoints(cleanSupabaseUrl('https://evil.example')), null);
const request = countRequest(waitlistEndpoints('https://abcdefghij.supabase.co'), 'ANON');
assert.equal(request.init.method, 'POST');
assert.equal(request.init.headers.apikey, 'ANON');
// the counter: only a real whole number; null (flag off), junk and errors show nothing
assert.equal(countView(1234, 'pt', '{n} aventureiros na lista'), '1.234 aventureiros na lista');
assert.equal(countView(1234, 'en', '{n} adventurers on the list'), '1,234 adventurers on the list');
assert.equal(countView(0, 'pt', '{n} aventureiros na lista'), '0 aventureiros na lista');
assert.equal(countView([7], 'en', '{n} adventurers on the list'), '7 adventurers on the list');
for (const bad of [null, undefined, '12', -1, 1.5, Infinity, NaN, {}, [], [null], true, 'x']) assert.equal(countView(bad, 'pt', '{n}'), null, String(bad));
assert.equal(fillText('{n} <b>', { n: '<i>' }), '<i> <b>', 'plain text: the script sets it with textContent');
// source and token
assert.equal(sourceFrom('?utm_source=TikTok', '', 'portal.test'), 'tiktok');
assert.equal(sourceFrom('', 'https://t.co/abc', 'portal.test'), 't.co');
assert.equal(sourceFrom('', 'https://portal.test/pt/', 'portal.test'), null);
assert.equal(sourceFrom('?utm_source=%3Cscript%3E', '', ''), null);
assert.equal(sourceFrom('', '', ''), null);
assert.equal(tokenFrom('?t=abc_-123.def_-456'), 'abc_-123.def_-456');
for (const bad of ['', '?t=', '?t=abc', '?t=a.b.c', '?t=<x>.y', '?x=1']) assert.equal(tokenFrom(bad), null, bad);

// ---- the browser script never writes server text as HTML, and the CSP allows exactly what it does -------------------------------------------------
const script = readFileSync(path.join(root, 'public/waitlist.js'), 'utf8') + readFileSync(path.join(root, 'public/waitlist-core.js'), 'utf8');
assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|localStorage/.test(script), 'no HTML injection, no storage of the address');
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const csp = vercel.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
assert.ok(csp.includes("connect-src https://*.supabase.co") && csp.includes("script-src 'self'") && csp.includes("form-action 'none'"), 'CSP: the Edge Function is on *.supabase.co, scripts are local, the form is posted by fetch only');

reset();
console.log('PASS: waitlist block (off by default, markup, consent, honeypot, states, escaping, parity), unsubscribe page, pure module and CSP.');
