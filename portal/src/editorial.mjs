export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const editorialTypes = {
  dev: { route: 'dev-updates', label: { pt: 'Diário de desenvolvimento', en: 'Dev Updates' } },
  major: { route: 'major-updates', label: { pt: 'Atualizações de conteúdo', en: 'Content Updates' } },
  patch: { route: 'patch-notes', label: { pt: 'Notas de atualização', en: 'Patch Notes' } },
};
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
export function validateLocalized(value, name = 'text') {
  for (const lang of ['pt', 'en']) requireValue(typeof value?.[lang] === 'string' && value[lang].trim(), `${name}: missing ${lang}`);
}
export function safeUrl(value, { externalOnly = false } = {}) {
  requireValue(typeof value === 'string' && value.length > 0 && !/[\s\\\x00-\x1f]/.test(value), 'Invalid URL');
  if (!externalOnly && (/^\/(?!\/)/.test(value) || /^#[a-zA-Z][\w-]*$/.test(value))) return value;
  const url = new URL(value);
  requireValue(url.protocol === 'https:' && !url.username && !url.password, 'Only HTTPS external links are allowed');
  return value;
}
function validateInline(content) {
  requireValue(Array.isArray(content) && content.length, 'Inline content must be a nonempty array');
  for (const node of content) {
    requireValue(['text', 'strong', 'em', 'link'].includes(node.type) && typeof node.text === 'string', 'Invalid inline node');
    if (node.type === 'link') safeUrl(node.href);
  }
}
export function validateBlocks(blocks) {
  requireValue(Array.isArray(blocks) && blocks.length, 'Article body must have blocks');
  for (const block of blocks) {
    if (block.type === 'paragraph') validateInline(block.content);
    else if (block.type === 'heading') { requireValue([2, 3, 4].includes(block.level) && typeof block.text === 'string', 'Invalid heading'); }
    else if (block.type === 'list') { requireValue(Array.isArray(block.items) && block.items.length, 'Invalid list'); block.items.forEach(validateInline); }
    else if (block.type === 'image') { safeUrl(block.src); requireValue(typeof block.alt === 'string' && block.alt.trim(), 'Image requires alt text'); requireValue(Number.isInteger(block.width) && block.width > 0 && Number.isInteger(block.height) && block.height > 0, 'Image requires dimensions'); }
    else throw new Error('Unknown content block: ' + block.type);
  }
}
export function validateArticles(records) {
  const slugs = new Set();
  for (const record of records) {
    requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug) && !slugs.has(record.slug), 'Invalid or duplicate article slug');
    slugs.add(record.slug);
    requireValue(Boolean(editorialTypes[record.type]), 'Unknown editorial type');
    requireValue(typeof record.published === 'boolean', 'Published must be boolean');
    validateLocalized(record.title, 'title'); validateLocalized(record.summary, 'summary');
    if (record.subtitle) validateLocalized(record.subtitle, 'subtitle');
    requireValue(typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date), 'Date required');
    const date = new Date(record.date);
    requireValue(Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === record.date, 'Invalid calendar date');
    if (record.version !== undefined) requireValue(typeof record.version === 'string' && record.version.trim(), 'Invalid version');
    requireValue(Array.isArray(record.categories), 'Categories must be an array');
    record.categories.forEach(category => validateLocalized(category, 'category'));
    for (const lang of ['pt', 'en']) validateBlocks(record.body?.[lang]);
    if (record.image) {
      safeUrl(record.image.src); validateLocalized(record.image.alt, 'image alt');
      requireValue(Number.isInteger(record.image.width) && record.image.width > 0 && Number.isInteger(record.image.height) && record.image.height > 0, 'Cover requires dimensions');
    }
  }
}
function inline(nodes) {
  return nodes.map(node => {
    const text = escapeHtml(node.text);
    if (node.type === 'link') return `<a href="${escapeHtml(safeUrl(node.href))}">${text}</a>`;
    return node.type === 'text' ? text : `<${node.type}>${text}</${node.type}>`;
  }).join('');
}
export function renderBlocks(blocks) {
  validateBlocks(blocks);
  return blocks.map(block => {
    if (block.type === 'paragraph') return `<p>${inline(block.content)}</p>`;
    if (block.type === 'heading') return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
    if (block.type === 'list') { const tag = block.ordered ? 'ol' : 'ul'; return `<${tag}>${block.items.map(item => `<li>${inline(item)}</li>`).join('')}</${tag}>`; }
    return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" width="${block.width}" height="${block.height}" loading="lazy">${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
  }).join('');
}
export function publishedArticles(records, type) {
  return records.filter(record => record.published && (!type || record.type === type)).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
export function paginate(records, page = 1, size = 8) {
  requireValue(Number.isInteger(size) && size > 0, 'Invalid page size');
  const totalPages = Math.max(1, Math.ceil(records.length / size));
  requireValue(Number.isInteger(page) && page >= 1 && page <= totalPages, 'Page out of range');
  return { items: records.slice((page - 1) * size, page * size), page, totalPages };
}
export function neighbors(records, slug) {
  const index = records.findIndex(record => record.slug === slug);
  return index < 0 ? { newer: null, older: null } : { newer: records[index - 1] || null, older: records[index + 1] || null };
}
