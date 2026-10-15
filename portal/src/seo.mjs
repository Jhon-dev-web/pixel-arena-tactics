// robots.txt and sitemap.xml: generated only when config.siteUrl is set (an absolute origin is required by both formats).
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
export const originOf = siteUrl => siteUrl.replace(/\/$/, '');

export const robotsTxt = siteUrl => `User-agent: *\nAllow: /\n\nSitemap: ${originOf(siteUrl)}/sitemap.xml\n`;

/** `pages`: [{ lang, route, indexable }]. A route is listed once per language, each entry pointing at both language versions. */
export function sitemapXml(siteUrl, pages) {
  const origin = originOf(siteUrl);
  const address = (lang, route) => `${origin}/${lang}/${route}${route ? '/' : ''}`;
  const routes = [...new Set(pages.filter(page => page.indexable).map(page => page.route))];
  const entries = [];
  for (const route of routes) {
    for (const lang of ['pt', 'en']) {
      if (!pages.some(page => page.lang === lang && page.route === route && page.indexable)) continue;
      entries.push(`<url><loc>${xml(address(lang, route))}</loc><xhtml:link rel="alternate" hreflang="pt" href="${xml(address('pt', route))}"/><xhtml:link rel="alternate" hreflang="en" href="${xml(address('en', route))}"/><xhtml:link rel="alternate" hreflang="x-default" href="${xml(address('pt', route))}"/></url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>\n`;
}
