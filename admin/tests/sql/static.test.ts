import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR } from './harness';
import { RPC_NAMES } from '../../src/lib/rpcNames';

// Static checks of supabase/migrations/0020_admin.sql. They read the file as text, so they are cheap and run first; the integration test
// (admin.integration.test.ts) runs the same file for real in an in-memory Postgres.
const raw = readFileSync(join(MIGRATIONS_DIR, '0020_admin.sql'), 'utf8');

/** The SQL without `-- comments` (a quote-aware pass so a `--` inside a string literal is kept). */
function stripComments(sql: string): string {
  let out = '';
  let i = 0;
  let inStr = false;
  let dollar: string | null = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        out += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    if (inStr) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        inStr = false;
      }
      i++;
      continue;
    }
    if (ch === "'") {
      inStr = true;
      out += ch;
      i++;
      continue;
    }
    const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 20));
    if (m) {
      dollar = m[0];
      out += dollar;
      i += dollar.length;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const sql = stripComments(raw);

interface Fn {
  name: string;
  schema: string;
  header: string;
  body: string;
  signature: string;
}

function functions(): Fn[] {
  const out: Fn[] = [];
  const re = /create or replace function ([a-z_]+)\.([a-z_]+)\(([\s\S]*?)\)\s*returns[\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    out.push({ schema: m[1], name: m[2], signature: m[3], header: m[0].slice(0, m[0].indexOf('as $$')), body: m[4] });
  }
  return out;
}

const all = functions();
const publicAdmin = all.filter((f) => f.schema === 'public');
const WRITE = /\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|merge|copy)\b/i;
const argTypes = (signature: string): string =>
  signature
    .split(',')
    .map((a) => a.trim().replace(/\s+default\s+.*$/i, '').split(/\s+/).slice(1).join(' '))
    .filter(Boolean)
    .join(', ');

describe('0020_admin.sql: the functions a client can call', () => {
  test('the set is exactly is_admin plus the ten read RPCs', () => {
    expect(publicAdmin.map((f) => f.name).sort()).toEqual(
      ['admin_economy', 'admin_economy_series', 'admin_flags', 'admin_league', 'admin_legendaries', 'admin_market', 'admin_overview', 'admin_player_detail', 'admin_players', 'admin_waitlist', 'is_admin'].sort(),
    );
  });

  test('every RPC name the app calls exists in the migration, and the other way round', () => {
    const inSql = publicAdmin.map((f) => f.name).filter((n) => n !== 'is_admin').sort();
    expect([...RPC_NAMES].sort()).toEqual(inSql);
  });

  describe.each(publicAdmin.filter((f) => f.name !== 'is_admin'))('$name', (fn) => {
    test('starts by asking is_admin() and raises ADMIN_ONLY otherwise', () => {
      const body = fn.body.trim();
      const afterBegin = body.slice(body.indexOf('begin') + 'begin'.length).trim();
      expect(afterBegin.startsWith('if not public.is_admin() then')).toBe(true);
      expect(afterBegin.slice(0, 220)).toContain("message = 'ADMIN_ONLY'");
    });

    test('is a security definer with a fixed empty search_path, stable, plpgsql', () => {
      expect(fn.header).toMatch(/security definer/);
      expect(fn.header).toMatch(/set search_path = ''/);
      expect(fn.header).toMatch(/\bstable\b/);
      expect(fn.header).toMatch(/language plpgsql/);
      expect(fn.header).not.toMatch(/security invoker|volatile/);
    });

    test('writes nothing', () => {
      // string literals ('update', 'created_at'...) and identifiers do not count: strip literals first
      const noLiterals = fn.body.replace(/'(?:[^']|'')*'/g, "''");
      expect(noLiterals).not.toMatch(WRITE);
      expect(noLiterals).not.toMatch(/\bfor (update|share|no key update)\b/i);
    });

    test('is revoked from public/anon/authenticated and granted to authenticated only', () => {
      const types = argTypes(fn.signature);
      const sig = `public.${fn.name}(${types})`;
      expect(sql).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function ${sig} to authenticated;`);
      const grants = [...sql.matchAll(new RegExp(`grant execute on function ${sig.replace(/[()]/g, '\\$&')} to ([^;]+);`, 'g'))].map((m) => m[1].trim());
      expect(grants).toEqual(['authenticated']);
    });
  });

  test('is_admin only answers about the caller', () => {
    const f = publicAdmin.find((x) => x.name === 'is_admin')!;
    expect(f.body).toContain('auth.uid()');
    expect(f.header).toMatch(/security definer/);
    expect(f.header).toMatch(/set search_path = ''/);
    expect(sql).toContain('grant execute on function public.is_admin() to authenticated;');
  });
});

describe('0020_admin.sql: everything else', () => {
  test('every function has a fixed search_path and is security definer', () => {
    for (const f of all) {
      expect(f.header, f.name).toMatch(/set search_path = ''/);
      expect(f.header, f.name).toMatch(/security definer/);
    }
  });

  test('the maintenance functions and helpers are never granted to a client role', () => {
    for (const f of all.filter((x) => x.schema === 'arena_private')) {
      const sig = `arena_private.${f.name}(${argTypes(f.signature)})`;
      expect(sql, f.name).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      const grants = [...sql.matchAll(new RegExp(`grant execute on function ${sig.replace(/[()]/g, '\\$&')} to ([^;]+);`, 'g'))].map((m) => m[1].trim());
      for (const g of grants) expect(g, f.name).toBe('service_role');
    }
  });

  test('no table privilege is granted to a client role, and every new table has RLS on', () => {
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*\bon\s+(table\s+)?[a-z_.]+\s+to\s+[^;]*\b(anon|authenticated|public)\b/i);
    const tables = [...sql.matchAll(/create table if not exists ([a-z_]+\.[a-z_]+)/g)].map((m) => m[1]);
    expect(tables.length).toBe(6);
    for (const t of tables) {
      expect(sql, t).toContain(`alter table ${t} enable row level security;`);
      expect(sql, t).toContain(`revoke all on table ${t} from public, anon, authenticated;`);
    }
    expect(sql).not.toMatch(/create policy/i);
  });

  test('the migration changes no existing column, policy or data, and creates no trigger', () => {
    expect(sql).not.toMatch(/alter table public\./i);
    expect(sql).not.toMatch(/\bdrop (table|function|policy|trigger)\b/i);
    expect(sql).not.toMatch(/\bcreate (or replace )?trigger\b/i);
    const dml = [...sql.matchAll(/\b(insert into|update(?!\s+set\b)|delete from)\s+([a-z_.]+)/gi)].map((m) => `${m[1].toLowerCase()} ${m[2]}`);
    // the only rows the migration writes itself are its own seed rows and (inside the two maintenance functions) its own aggregate tables
    for (const d of dml) expect(d, d).toMatch(/arena_private\.admin_/);
  });

  test('documents its rollback and a SQL test plan', () => {
    expect(raw).toContain('ROLLBACK');
    expect(raw).toContain('SQL TEST PLAN');
    for (const f of all) expect(raw, f.name).toContain(`drop function if exists ${f.schema}.${f.name}(`);
  });

  test('the admin list is seeded by nobody: no insert into arena_private.admins', () => {
    expect(sql).not.toMatch(/insert into arena_private\.admins/);
  });
});
