import { mkdir, rm, writeFile, cp, realpath } from 'node:fs/promises';
import path from 'node:path';
import { config, states, groups, systems, glossary, roadmap, articles } from '../src/content.mjs';
import { validateArticles, validateLocalized, safeUrl } from '../src/editorial.mjs';
import { renderSite } from '../src/pages.mjs';
import { style } from '../src/style.mjs';

validateArticles(articles);
if (config.playUrl !== null) safeUrl(config.playUrl, { externalOnly: true });
for (const channel of config.community) { safeUrl(channel.url, { externalOnly: true }); validateLocalized(channel.label, 'channel label'); }
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
await writeFile(path.join(out, 'index.html'), '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=/pt/"><title>Arena Duel</title></head><body><a href="/pt/">Português</a> · <a href="/en/">English</a></body></html>');
await writeFile(path.join(out, '404.html'), '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>404 · Arena Duel</title><link rel="stylesheet" href="/style.css"></head><body><main class="section"><h1>404</h1><p>Página não encontrada / Page not found</p><div class="actions"><a class="button" href="/pt/">Português</a><a class="button secondary" href="/en/">English</a></div></main></body></html>');
console.log('Built ' + output.length + ' PT/EN pages. No deployment.');

