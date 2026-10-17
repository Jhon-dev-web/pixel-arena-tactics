import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, describe, expect, test } from 'vitest';

// Builds the app the way Vercel does (no demo flag) into a temp folder and checks what ships.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'admin-build-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)).map((f) => join(e.name, f)) : [e.name]));
}

describe('production bundle', () => {
  let js = '';
  let html = '';
  let list: string[] = [];

  test('builds', async () => {
    await build({ root, logLevel: 'silent', mode: 'production', build: { outDir: out, emptyOutDir: true } });
    list = files(out);
    js = list.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(out, f), 'utf8')).join('\n');
    html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(js.length).toBeGreaterThan(10_000);
  }, 120_000);

  test('contains none of the demo backend or its invented data', () => {
    expect(js).not.toContain('dono@exemplo.com');
    expect(js).not.toContain('Aldric');
    expect(js).not.toContain('demo-report-1');
    expect(js).not.toContain('funções do mercado falhando repetidamente');
    expect(js).not.toContain('VITE_ADMIN_DEMO');
    expect(list.some((f) => /demo/i.test(f))).toBe(false);
  });

  test('carries no service key, no secret and no write call', () => {
    expect(js).not.toMatch(/service_role|SERVICE_ROLE|sk_live|sk_test|whsec_/);
  });

  test('the page has no inline script or style (the CSP forbids them) and says noindex', () => {
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).toMatch(/<meta name="robots" content="noindex/);
  });
});

describe('vercel.json', () => {
  const cfg = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
  const all = cfg.headers.find((h) => h.source === '/(.*)')!.headers;
  const header = (k: string) => all.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value ?? '';

  test('a strict content security policy', () => {
    const csp = header('Content-Security-Policy');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*(?!\.supabase\.co)/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/\*\.supabase\.co/);
  });

  test('never indexed, never framed, never cached', () => {
    expect(header('X-Robots-Tag')).toContain('noindex');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('Cache-Control')).toBe('no-store');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('Strict-Transport-Security')).toContain('max-age=');
  });

  test('robots.txt disallows everything', () => {
    expect(readFileSync(join(root, 'public', 'robots.txt'), 'utf8')).toMatch(/Disallow: \//);
  });
});

describe('the repository keeps the admin app apart', () => {
  test('only the two public variable names are documented, no value, and no service key name', () => {
    const env = readFileSync(join(root, '.env.example'), 'utf8');
    const assignments = env.split('\n').filter((l) => /^[A-Z_]+=/.test(l));
    expect(assignments).toEqual(['VITE_SUPABASE_URL=', 'VITE_SUPABASE_ANON_KEY=']);
  });
});
