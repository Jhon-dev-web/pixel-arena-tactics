import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../dist');
let count = 0;
const issues = [];
async function check(file) {
  const html = await readFile(file, 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  if (!title) issues.push('Missing title: ' + file);
  if (!html.includes('name="viewport"')) issues.push('Missing viewport: ' + file);
  const pageLang = html.match(/<html lang="(pt|en)"/)?.[1];
  if (file.includes(path.sep + 'pt' + path.sep) || file.includes(path.sep + 'en' + path.sep)) {
    if (!pageLang) issues.push('Missing page language: ' + file);
    if ((html.match(/<h1(?: |\>)/g) || []).length !== 1) issues.push('Expected one H1: ' + file);
  }
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (target.startsWith('#')) {
      if (!html.includes('id="' + target.slice(1) + '"')) issues.push('Broken anchor ' + target + ' in ' + file);
      continue;
    }
    if (!target.startsWith('/')) continue;
    const [urlPath, hash] = target.split('#');
    let absolute = path.resolve(root, '.' + urlPath);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) { issues.push('Path escapes output: ' + target); continue; }
    try {
      if ((await stat(absolute)).isDirectory()) absolute = path.join(absolute, 'index.html');
      const linked = await readFile(absolute, 'utf8');
      if (hash && !linked.includes('id="' + hash + '"')) issues.push('Broken anchor ' + target + ' in ' + file);
    } catch { issues.push('Broken link ' + target + ' in ' + file); }
  }
  count++;
}
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (file.endsWith('.html')) await check(file);
  }
}
await walk(root);
if (issues.length) throw new Error(issues.join('\n'));
console.log('PASS: ' + count + ' HTML pages, titles, language, internal links, anchors and assets.');
