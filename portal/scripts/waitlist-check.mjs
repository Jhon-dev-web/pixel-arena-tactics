// Checks of the "Avise-me no lançamento" block: the pure module (public/waitlist-core.js, the same file the browser runs) and the generated pages. Run: node scripts/waitlist-check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SHARE_PREFIXES, buildJoinBody, classifyJoin, classifyUnsubscribe, countRequest, countView, countsText, fillText, inviteUrl, looksLikeEmail, mergeInvite, parseCounts, parseJoinResult, readInvite, referralEndpoint,
  refFromSearch, shareLinks, sourceFrom, tokenFrom, waitlistEndpoints, withRef,
} from '../public/waitlist-core.js';
import { cleanSupabaseUrl } from '../public/season-core.js';
import { config, legal, referral, waitlist } from '../src/content.mjs';
import { renderSite } from '../src/pages.mjs';
import { sitemapXml } from '../src/seo.mjs';

const root = path.resolve(import.meta.dirname, '..');
const snapshot = JSON.stringify(config);
const reset = () => Object.assign(config, JSON.parse(snapshot));
const pageOf = (lang, route) => renderSite(lang).find(item => item.route === route);
const page = (lang, route = '') => pageOf(lang, route).html;
const all = lang => renderSite(lang).map(item => item.html).join('\n');
const blocks = html => html.match(/<section class="section waitlist[\s\S]*?<\/section>/g) ?? [];

// ---- off: nothing at all (the published config turns it on for the playtest sign-up) ------------------------------------------------------------
config.waitlistEnabled = false;
for (const lang of ['pt', 'en']) {
  const everything = all(lang);
  assert.ok(!/data-waitlist|waitlist\.js|waitlist-core|Avise-me|Notify me at launch|name="hp"/.test(everything), lang + ': off = no block, no script, no text');
  assert.equal(pageOf(lang, 'unsubscribe'), undefined, 'off = no unsubscribe page');
}

// ---- on, with the Supabase address ------------------------------------------------------------------------------------------------------------------
config.waitlistEnabled = true;
config.legalLive.privacy = false; // the published config has it on; start from the unpublished case
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
assert.ok(home.indexOf('data-waitlist') > home.indexOf('class="hero"') && home.indexOf('data-waitlist') < home.indexOf('h-steps'));
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
const privacy = legal.find(item => item.route === 'privacy');
const publishedPrivacy = privacy.body;
privacy.body = undefined;
config.legalLive.privacy = true;
assert.ok(!blocks(page('pt'))[0].includes('/pt/privacy/'), 'a flag without text links nothing');
privacy.body = { pt: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto.' }] }], en: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text.' }] }] };
assert.ok(blocks(page('pt'))[0].includes('<a class="" href="/pt/privacy/">Política de Privacidade</a>'));
assert.ok(blocks(page('en'))[0].includes('href="/en/privacy/">Privacy Policy</a>'));
privacy.body = publishedPrivacy;
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
assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script), 'no HTML injection');
assert.deepEqual([...script.matchAll(/store\('local', 'set', ([A-Z_]+),/g)].map(m => m[1]), ['INVITE_STORAGE_KEY'], 'the only thing kept in the browser is the invite (code + key), never the address');
assert.ok(/JSON\.stringify\(invite\)/.test(script) && !/setItem\([^)]*email/i.test(script));
assert.ok(script.includes('target.startsWith(SHARE_PREFIXES[network])'), 'a share href is only ever set to the intent of its own network');
const { style } = await import('../src/style.mjs');
assert.ok(style.includes('.waitlist [hidden], .waitlist-unsub [hidden] { display: none !important; }'), 'hidden really hides: the form is not visible before the script runs (no JavaScript = no broken form)');
const vercel = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const csp = vercel.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
assert.ok(csp.includes("connect-src https://*.supabase.co") && csp.includes("script-src 'self'") && csp.includes("form-action 'none'"), 'CSP: the Edge Function is on *.supabase.co, scripts are local, the form is posted by fetch only');


// ---- referral links: off by default, then the invite panel ---------------------------------------------------------------------------------------------
assert.equal(config.referralEnabled, false, 'referral is off by default');
config.waitlistEnabled = true;
config.supabaseUrl = 'https://abcdefghij.supabase.co';
assert.ok(!/wl-referral|Seu link de convite|Your invite link|data-wl-share/.test(all('pt') + all('en')), 'referral off: no invite panel anywhere');
assert.ok(blocks(page('pt'))[0].includes('data-referral="false"'));
config.referralEnabled = true;
config.siteUrl = 'https://portal.example.test/';
const refHome = blocks(page('pt'))[0];
assert.ok(refHome.includes('data-referral="true"') && refHome.includes('data-site-url="https://portal.example.test/"'));
assert.ok(/<div class="wl-referral" data-wl-referral hidden>/.test(refHome), 'the panel is hidden until the script has the code of the person');
assert.ok(refHome.includes('<h3>Seu link de convite</h3>') && /<input class="wl-link" type="text" readonly data-wl-link id="waitlist-home-link" aria-label="Seu link de convite">/.test(refHome));
assert.ok(refHome.includes('data-wl-copy>Copiar link</button>'));
for (const network of ['whatsapp', 'x', 'telegram']) assert.ok(new RegExp(`<a class="button secondary" data-wl-share="${network}" target="_blank" rel="noopener noreferrer">`).test(refHome), network);
assert.ok(!/data-wl-share="[a-z]+"[^>]*href=/.test(refHome), 'share anchors carry no href in the HTML: the script sets it from the validated intent');
assert.ok(refHome.includes('data-wl-counts hidden') && refHome.includes('1 convite ativo: o título Recrutador') && refHome.includes('10 amigos que comprarem o Passe: um Passe de Aventureiro grátis') && refHome.includes('25 convites ativos: o título Lenda do Recrutamento') && refHome.includes('3 convites ativos: uma moldura de retrato'));
assert.ok(refHome.includes('chega ao nível 10 do Herói') && refHome.includes('Convidar a si mesmo não conta') && refHome.includes('um prêmio já entregue fica'), 'the rules are in the page');
assert.equal((refHome.match(/<script/g) ?? []).length, 1, 'no third-party script: only /waitlist.js');
assert.ok(!/(wa\.me|twitter\.com|t\.me)/.test(refHome), 'the share intents are built by the script, not shipped as links');
assert.ok(refHome.indexOf('data-wl-done') < refHome.indexOf('data-wl-referral'), 'the invite panel lives inside the success state');
const unescapeAttr = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const refLabels = JSON.parse(unescapeAttr(refHome.match(/data-labels="([^"]*)"/)[1]));
for (const key of ['copied', 'copyFailed', 'shareText', 'counts', 'countsNoGoal']) assert.ok(refLabels[key], key);
assert.equal(refLabels.shareText, 'Vem jogar Arena Idle comigo! Entre na lista do lançamento: {url}');
// ids stay unique when two blocks are on one page; the Temporada page has the panel too
assert.ok(blocks(page('pt', 'season'))[0].includes('id="waitlist-season-link"'));
// pt / en have the same markup
const refHomeEn = blocks(page('en'))[0];
assert.equal(shape(refHomeEn).replace('/en/privacy/', '/pt/privacy/'), shape(refHome)); // only the language of the privacy link differs
assert.ok(refHomeEn.includes('<h3>Your invite link</h3>') && refHomeEn.includes('10 friends who buy the Pass: a free Adventurer’s Pass'));
assert.equal(JSON.parse(unescapeAttr(refHomeEn.match(/data-labels="([^"]*)"/)[1])).shareText, 'Come play Arena Idle with me! Join the launch list: {url}');
for (const key of Object.keys(referral)) assert.ok(key === 'tiers' ? referral.tiers.every(t => t.pt && t.en) : referral[key].pt && referral[key].en, 'both languages: ' + key);
// the block without a Supabase address shows no invite panel either
config.supabaseUrl = null;
assert.ok(!blocks(page('pt'))[0].includes('wl-referral'));
config.supabaseUrl = 'https://abcdefghij.supabase.co';
// the build refuses a referral switch without the waitlist
const buildSource = readFileSync(path.join(root, 'scripts/build.mjs'), 'utf8');
assert.ok(/config\.referralEnabled && !config\.waitlistEnabled\) throw/.test(buildSource));
// the root address keeps the query (?ref=CODE)
assert.ok(buildSource.includes('<script src="/root.js"></script><noscript><meta http-equiv="refresh"'), 'root: script redirect, meta refresh only without JavaScript');
assert.ok(/location\.replace\('\/' \+ lang \+ '\/' \+ location\.search \+ location\.hash\)/.test(readFileSync(path.join(root, 'public/root.js'), 'utf8')));
reset();
config.waitlistEnabled = true;
config.supabaseUrl = 'https://abcdefghij.supabase.co';

// ---- referral: the pure functions ---------------------------------------------------------------------------------------------------------------
const CODE = 'ABCDEFGH23';
const KEY = '0123456789abcdef0123456789abcdef';
assert.equal(refFromSearch('?ref=abcdefgh23'), CODE);
assert.equal(refFromSearch('?utm_source=x&ref=' + CODE + '&y=1'), CODE);
for (const bad of ['', '?ref=', '?ref=ABC', '?ref=ABCDEFGHI0', '?ref=ABCDEFGHO1', '?ref=<script>alert(1)</script>', '?ref=ABCDEFGH23ZZ', '?x=1', '?ref=%00ABCDEFGH23']) assert.equal(refFromSearch(bad), null, bad);
assert.deepEqual(withRef({ email: 'a@b.co' }, CODE), { email: 'a@b.co', ref: CODE });
assert.deepEqual(withRef({ email: 'a@b.co' }, null), { email: 'a@b.co' });
assert.deepEqual(withRef({ email: 'a@b.co' }, 'bad code'), { email: 'a@b.co' });
assert.deepEqual(parseJoinResult({ ok: true, code: CODE, key: KEY }), { code: CODE, key: KEY });
for (const bad of [null, {}, { ok: false, code: CODE, key: KEY }, { ok: true, code: 'abc', key: KEY }, { ok: true, code: CODE, key: 'zz' }, { ok: true, code: CODE }, { ok: true, code: '<b>', key: KEY }]) assert.equal(parseJoinResult(bad), null, JSON.stringify(bad));
assert.deepEqual(readInvite(JSON.stringify({ code: CODE, key: KEY, email: 'a@b.co' })), { code: CODE, key: KEY }, 'an e-mail that sneaked into storage is dropped');
for (const bad of [null, '', '{', '[]', JSON.stringify({ code: CODE }), JSON.stringify({ code: 'x', key: KEY })]) assert.equal(readInvite(bad), null, String(bad));
// the same person signing up again in this browser keeps the real key; a different address gets what the server sent
const mine = { code: CODE, key: KEY };
assert.deepEqual(mergeInvite(mine, { code: CODE, key: 'f'.repeat(32) }), mine);
assert.deepEqual(mergeInvite(mine, { code: 'ZZZZZZZZZZ', key: 'f'.repeat(32) }), { code: 'ZZZZZZZZZZ', key: 'f'.repeat(32) });
assert.deepEqual(mergeInvite(null, mine), mine);
assert.equal(mergeInvite(mine, null), null);
// the link: <site>/?ref=CODE from siteUrl, else the page origin
assert.equal(inviteUrl('https://portal.example.test/', 'http://localhost:4173', CODE), 'https://portal.example.test/?ref=ABCDEFGH23');
assert.equal(inviteUrl('', 'https://preview.example.test', CODE), 'https://preview.example.test/?ref=ABCDEFGH23');
assert.equal(inviteUrl(null, 'http://127.0.0.1:4173', CODE), 'http://127.0.0.1:4173/?ref=ABCDEFGH23');
assert.equal(inviteUrl('https://portal.example.test/pt/season/?x=1#y', '', CODE), 'https://portal.example.test/?ref=ABCDEFGH23', 'origin only');
for (const [site, origin, code] of [['', '', CODE], ['javascript:alert(1)', '', CODE], ['ftp://x.test', '', CODE], ['not a url', 'also not', CODE], ['https://x.test', '', 'bad'], ['https://x.test', '', '<script>']]) assert.equal(inviteUrl(site, origin, code), null, site + code);
assert.equal(inviteUrl('javascript:alert(1)', 'https://ok.test', CODE), 'https://ok.test/?ref=ABCDEFGH23', 'a bad site falls back to the origin');
// share intents: fixed hosts, everything percent-encoded
const url = inviteUrl('https://portal.example.test/', '', CODE);
const text = fillText('Vem jogar Arena Idle comigo! Entre na lista do lançamento: {url}', { url });
const strict = value => encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const shared = shareLinks(url, text);
assert.equal(shared.whatsapp, 'https://wa.me/?text=' + strict(text));
assert.equal(shared.x, 'https://twitter.com/intent/tweet?text=' + strict(text));
assert.equal(shared.telegram, 'https://t.me/share/url?url=' + strict(url) + '&text=' + strict('Vem jogar Arena Idle comigo! Entre na lista do lançamento:'));
assert.ok(shared.whatsapp.startsWith(SHARE_PREFIXES.whatsapp) && shared.x.startsWith(SHARE_PREFIXES.x) && shared.telegram.startsWith(SHARE_PREFIXES.telegram));
assert.ok(shared.whatsapp.includes('%3Fref%3DABCDEFGH23') && !shared.whatsapp.slice(20).includes('?ref') && !shared.whatsapp.slice(20).includes(' '), 'the link inside the text is encoded');
const hostileText = 'a&b=c#d "q" <script>alert(1)</script>\nlinha 😀 https://x.test/?ref=' + CODE;
const hostileLinks = shareLinks('https://x.test/?ref=' + CODE, hostileText);
for (const href of Object.values(hostileLinks)) {
  const query = href.slice(href.indexOf('?') + 1);
  assert.ok(!/[<>" \n#]/.test(href) && query.split('&').every(pair => /^[a-z]+=[A-Za-z0-9%._~-]*$/.test(pair)), 'only encoded characters: ' + href);
  assert.equal(new URL(href).hash, '', 'nothing leaks into the fragment');
}
assert.equal(new URL(hostileLinks.whatsapp).searchParams.get('text'), hostileText, 'it decodes back to exactly what was shared');
// counters: two numbers, from a well-formed answer only
assert.equal(referralEndpoint('https://abcdefghij.supabase.co'), 'https://abcdefghij.supabase.co/functions/v1/waitlist-referrals');
assert.equal(referralEndpoint(null), null);
assert.deepEqual(parseCounts(200, { ok: true, qualified: 4, paying: 2, passGoal: 10 }), { active: 4, paying: 2, goal: 10 });
assert.deepEqual(parseCounts(200, { ok: true, qualified: 0, paying: 0, passGoal: null }), { active: 0, paying: 0, goal: null });
for (const [status, json] of [[429, { ok: false }], [503, null], [200, null], [200, { ok: false }], [200, { ok: true, qualified: '4', paying: 2 }], [200, { ok: true, qualified: -1, paying: 2 }], [200, { ok: true, qualified: 1.5, paying: 2 }], [200, { ok: true, qualified: 1 }]]) assert.equal(parseCounts(status, json), null, JSON.stringify(json));
const countLabels = { counts: 'Convites ativos: {active} · Compraram o Passe: {paying} de {goal}', countsNoGoal: 'Convites ativos: {active} · Compraram o Passe: {paying}' };
assert.equal(countsText({ active: 4, paying: 2, goal: 10 }, 'pt', countLabels), 'Convites ativos: 4 · Compraram o Passe: 2 de 10');
assert.equal(countsText({ active: 1234, paying: 0, goal: 10 }, 'en', { counts: 'Active invites: {active} · Bought the Pass: {paying} of {goal}' }), 'Active invites: 1,234 · Bought the Pass: 0 of 10');
assert.equal(countsText({ active: 0, paying: 0, goal: null }, 'pt', countLabels), 'Convites ativos: 0 · Compraram o Passe: 0');
assert.equal(countsText(null, 'pt', countLabels), '');

reset();
console.log('PASS: waitlist block (off = nothing, markup, consent, honeypot, states, escaping, parity), unsubscribe page, pure module and CSP.');
