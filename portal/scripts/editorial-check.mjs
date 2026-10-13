import assert from 'node:assert/strict';
import { validateArticles, renderBlocks, publishedArticles, paginate, neighbors, safeUrl } from '../src/editorial.mjs';
import { articles } from '../src/content.mjs';
import { renderSite } from '../src/pages.mjs';
const l = (pt, en) => ({ pt, en });
const article = (slug, date) => ({
  slug, date, type: 'patch', published: true, title: l('Título', 'Title'), subtitle: l('Subtítulo', 'Subtitle'),
  summary: l('Resumo', 'Summary'), version: '0.1', categories: [l('Mudanças', 'Changes')],
  image: { src: '/img/hero-panel.webp', width: 1440, height: 900, alt: l('Captura do jogo', 'Game screenshot') },
  body: {
    pt: [{ type: 'heading', level: 2, text: 'Mudanças' }, { type: 'paragraph', content: [{ type: 'text', text: '<texto>' }, { type: 'link', text: 'Detalhes', href: '/pt/roadmap/' }] }, { type: 'list', items: [[{ type: 'text', text: 'Item' }]] }],
    en: [{ type: 'heading', level: 2, text: 'Changes' }, { type: 'paragraph', content: [{ type: 'text', text: 'Text' }] }],
  },
});
const records = [article('older-update', '2026-01-02'), article('newer-update', '2026-02-03')];
validateArticles(records);
assert.deepEqual(publishedArticles(records).map(x => x.slug), ['newer-update', 'older-update']);
assert.equal(paginate(publishedArticles(records), 2, 1).items[0].slug, 'older-update');
assert.equal(neighbors(publishedArticles(records), 'older-update').newer.slug, 'newer-update');
assert.match(renderBlocks(records[0].body.pt), /&lt;texto&gt;/);
assert.match(renderBlocks(records[0].body.pt), /<ul>/);
assert.throws(() => validateArticles([records[0], records[0]]), /duplicate/);
assert.throws(() => validateArticles([{ ...records[0], body: { ...records[0].body, en: [] } }]), /blocks/);
assert.throws(() => safeUrl('javascript:alert(1)'), /HTTPS/);
const futureRecords = Array.from({ length: 9 }, (_, index) => article('reviewed-update-' + (index + 1), '2026-02-03'));
articles.push(...futureRecords);
const futurePages = renderSite('pt');
assert(futurePages.some(page => page.route === 'news/page/2'));
assert(futurePages.some(page => page.route === 'patch-notes/page/2'));
assert(futurePages.some(page => page.route === 'news/reviewed-update-1' && page.html.includes('Arquivo de notícias')));
articles.length = 0;
console.log('PASS: editorial validation, rich content, escaping, ordering and archive navigation.');
