import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MIGRATIONS_DIR } from './harness';
import { OPS_READ_RPC_NAMES, OPS_WRITE_RPC_NAMES } from '../../src/lib/opsRpcNames';

// The names the app calls for the AI-operations page must be exactly the admin functions of supabase/migrations/0021_ai_ops.sql (the deeper static checks live in
// supabase/functions/_shared/__tests__/migration0021.test.ts; the real run in ops.integration.test.ts).
const raw = readFileSync(join(MIGRATIONS_DIR, '0021_ai_ops.sql'), 'utf8');
const code = raw
  .split(/\r?\n/)
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const admin = [...code.matchAll(/create or replace function public\.(admin_[a-z_]+)\(/g)].map((m) => m[1]).sort();

const fnBody = (name: string): string => new RegExp(String.raw`create or replace function public\.${name}\([\s\S]*?\n\$\$;`).exec(code)?.[0] ?? '';
const header = (name: string): string => fnBody(name).slice(0, fnBody(name).indexOf('as $$'));

describe('0021 and the app agree', () => {
  test('every admin function of the migration is called by the app, and the other way round', () => {
    expect([...OPS_READ_RPC_NAMES, ...OPS_WRITE_RPC_NAMES].sort()).toEqual(admin);
  });

  test('the two writes are the only functions of the app that change anything, and both check is_admin() first and are granted to `authenticated`', () => {
    for (const n of OPS_WRITE_RPC_NAMES) {
      expect(fnBody(n), n).toContain('if not public.is_admin() then');
      expect(code, n).toMatch(new RegExp(String.raw`grant execute on function public\.${n}\([^)]*\) to authenticated;`));
      expect(header(n), n).not.toMatch(/\bstable\b/);
    }
    for (const n of OPS_READ_RPC_NAMES) {
      expect(fnBody(n), n).toContain('if not public.is_admin() then');
      expect(header(n), n).toMatch(/\bstable\b/);
    }
  });
});
