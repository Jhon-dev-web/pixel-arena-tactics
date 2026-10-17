import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// The app may only READ, through the admin functions. These checks scan the source so a stray table call or write verb fails the build.
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)).map((f) => join(e.name, f)) : [e.name]));
}

const sources = files(src)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ f, text: readFileSync(join(src, f), 'utf8') }));

describe('the source only reads, through the admin functions', () => {
  test('there is source to check', () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  test('no table API, no storage, no realtime, no function invocation, no write verb on a client', () => {
    for (const { f, text } of sources.filter((s) => !/demo.ts$/.test(s.f))) {
      expect(text, f).not.toMatch(/(?<!Array)\.from\(/);
      expect(text, f).not.toMatch(/\.(insert|upsert|update|delete)\(/);
      expect(text, f).not.toMatch(/\.storage\b|\.channel\(|\.functions\./);
    }
  });

  test('the demo backend (invented data) never touches the network or the client library', () => {
    const demo = sources.find((s) => /demo.ts$/.test(s.f))!;
    expect(demo.text).not.toMatch(/supabase|fetch\(|XMLHttpRequest|WebSocket/);
  });

  test('the only literal rpc() call is is_admin (the ten admin functions go through the typed list)', () => {
    const names = new Set<string>();
    for (const { text } of sources) for (const m of text.matchAll(/rpc\(\s*['"]([a-z_]+)['"]/g)) names.add(m[1]);
    expect([...names]).toEqual(['is_admin']);
  });

  test('no key or secret is written into the source', () => {
    for (const { f, text } of sources) {
      expect(text, f).not.toMatch(/service_role|SERVICE_ROLE|eyJ[A-Za-z0-9_-]{20,}|sk_(live|test)_/);
    }
  });

  test('the environment variables read are the two public names (plus the demo flag)', () => {
    const names = new Set<string>();
    for (const { text } of sources) for (const m of text.matchAll(/import\.meta\.env\.([A-Z_]+)/g)) names.add(m[1]);
    expect([...names].sort()).toEqual(['VITE_ADMIN_DEMO', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL']);
  });
});
