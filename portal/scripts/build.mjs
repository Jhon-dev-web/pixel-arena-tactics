import { mkdir, rm, writeFile, cp, realpath } from 'node:fs/promises';
import path from 'node:path';
import { config, states, groups, systems, glossary, roadmap, articles, legal } from '../src/content.mjs';
import { cleanSupabaseUrl } from '../public/season-core.js';
import { validateArticles, validateLocalized, safeUrl } from '../src/editorial.mjs';
import { renderSite } from '../src/pages.mjs';
import { robotsTxt, sitemapXml } from '../src/seo.mjs';
import { style } from '../src/style.mjs';

validateArticles(articles);
if (config.playUrl !== null) safeUrl(config.playUrl, { externalOnly: true });
for (const channel of config.community) { safeUrl(channel.url, { externalOnly: true }); validateLocalized(channel.label, 'channel label'); }
if (config.supabaseUrl !== null && cleanSupabaseUrl(config.supabaseUrl) === null) throw new Error('config.supabaseUrl must be https://<project-ref>.supabase.co (nothing else is allowed by the CSP)');
if (config.supabaseAnonKey !== null && (typeof config.supabaseAnonKey !== 'string' || !/^[\w.-]{20,}$/.test(config.supabaseAnonKey))) throw new Error('config.supabaseAnonKey must be the public anon key (a JWT or an sb_publishable_ key)');
if (config.supabaseAnonKey !== null) {
  // The service key must never reach the public site: refuse an sb_secret_ key and any JWT whose role is not anon.
  if (config.supabaseAnonKey.startsWith('sb_secret_')) throw new Error('config.supabaseAnonKey holds a SECRET key; only the public anon key may be used');
  const part = config.supabaseAnonKey.split('.')[1];
  if (part) {
    let role = null;
    try { role = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')).role; } catch { /* not a decodable JWT: leave it to the server to reject */ }
    if (role !== null && role !== 'anon') throw new Error('config.supabaseAnonKey is a "' + role + '" key; only the public anon key may be used');
  }
}
// Owner settings (see the comment above config in src/content.mjs).
if (typeof config.passSalesOpen !== 'boolean' || typeof config.meterShowCount !== 'boolean') throw new Error('config.passSalesOpen and config.meterShowCount must be true or false');
if (typeof config.meterLowPct !== 'number' || config.meterLowPct < 0 || config.meterLowPct > 100) throw new Error('config.meterLowPct must be a number from 0 to 100');
if (config.siteUrl !== null) {
  safeUrl(config.siteUrl, { externalOnly: true });
  const site = new URL(config.siteUrl);
  if (site.pathname !== '/' || site.search || site.hash) throw new Error('config.siteUrl must be an origin only, e.g. https://example.com');
}
if (config.passSalesOpen && config.playUrl === null) throw new Error('config.passSalesOpen needs config.playUrl (the buy link opens the game)');
if (config.passSalesOpen && !(config.legalLive.refund && legal.find(page => page.route === 'refund')?.body)) throw new Error('config.passSalesOpen needs the refund policy text: set config.legalLive.refund and give the refund entry in legal a body');
for (const page of legal) if (config.legalLive[page.flag] && !page.body) throw new Error('config.legalLive.' + page.flag + ' is true but the legal entry has no body');
for (const [key, value] of Object.entries(config.company)) if (value !== null && (typeof value !== 'string' || !value.trim())) throw new Error('config.company.' + key + ' must be null or a non-empty string');
if (config.company.supportEmail !== null && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(config.company.supportEmail)) throw new Error('config.company.supportEmail is not an email address');
if (!Number.isInteger(config.pageSize) || config.pageSize < 1) throw new Error('Invalid page size');
for (const item of roadmap) {
  if (!states[item.status]) throw new Error('Unknown roadmap status');
  validateLocalized(item.title); validateLocalized(item.body);
}
for (const group of groups) {
  if (!states[group.status] || !group.systems.length) throw new Error('Invalid system group');
  for (const id of group.systems) if (!systems.some(item => item.id === id)) throw new Error('Unknown system: ' + id);
}
for (const system of systems) if (!glossary[system.term]) throw new Error('Unknown glossary term');
const output = ['pt', 'en'].flatMap(lang => renderSite(lang).map(page => ({ ...page, lang })));

// Validate the exact generated-output location before replacing it.
const root = await realpath(path.resolve(import.meta.dirname, '..'));
const out = path.join(root, 'dist');
const resolvedOut = await realpath(out).catch(() => out);
if (resolvedOut !== out || path.dirname(out) !== root) throw new Error('Unsafe build output path');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, 'public'), out, { recursive: true });
for (const page of output) {
  const directory = path.join(out, page.lang, page.route);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'index.html'), page.html);
}
await writeFile(path.join(out, 'style.css'), style);
if (config.siteUrl !== null) {
  await writeFile(path.join(out, 'robots.txt'), robotsTxt(config.siteUrl));
  await writeFile(path.join(out, 'sitemap.xml'), sitemapXml(config.siteUrl, output));
}
await writeFile(path.join(out, 'index.html'), '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=/pt/"><title>Arena Idle</title></head><body><a href="/pt/">Português</a> · <a href="/en/">English</a></body></html>');
await writeFile(path.join(out, '404.html'), '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>404 · Arena Idle</title><link rel="stylesheet" href="/style.css"></head><body><main class="section"><h1>404</h1><p>Página não encontrada / Page not found</p><div class="actions"><a class="button" href="/pt/">Português</a><a class="button secondary" href="/en/">English</a></div></main></body></html>');
console.log('Built ' + output.length + ' PT/EN pages. No deployment.');

