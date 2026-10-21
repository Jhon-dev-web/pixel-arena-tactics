import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR } from './harness';

// Static checks of supabase/migrations/0028_server_credits.sql (the credit ledger and promo rewards). They read the file as text, so they run first and cheaply; the integration tests run the same file for real.
const raw = readFileSync(join(MIGRATIONS_DIR, '0028_server_credits.sql'), 'utf8');
const code = raw.replace(/^\s*--.*$/gm, '');

interface Fn {
  qualified: string;
  signature: string;
  chunk: string;
}

function functions(): Fn[] {
  const out: Fn[] = [];
  const re = /create or replace function ([a-z_]+\.[a-z_]+)\(([\s\S]*?)\)\s*returns[\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const types = m[2]
      .split(',')
      .map((a) => a.trim().split(/\s+/).slice(1, 3).join(' ').replace(/ default.*/, ''))
      .filter(Boolean)
      .map((t) => t.replace(/^(in|out) /, ''));
    out.push({ qualified: m[1], signature: types.join(', '), chunk: m[0] });
  }
  return out;
}

const fns = functions();
const PUBLIC_API = fns.filter((f) => f.qualified.startsWith('public.'));

describe('0028_server_credits.sql: every function is locked down', () => {
  test('there are functions to check', () => {
    expect(fns.length).toBeGreaterThanOrEqual(9);
  });

  test('security definer with an empty search_path, or an explicit invoker that is also pinned', () => {
    for (const f of fns) {
      expect(f.chunk, f.qualified).toMatch(/set search_path = ''/);
      expect(f.chunk, f.qualified).toMatch(/security definer|\b(immutable|stable)\b/);
    }
  });

  test('each function is revoked from public, anon and authenticated, and granted only where it is meant to be called', () => {
    for (const f of fns) {
      expect(code, f.qualified).toMatch(new RegExp(`revoke all on function ${f.qualified.replace('.', '\\.')}\\([^)]*\\) from public, anon, authenticated;`));
    }
    const grants = [...code.matchAll(/grant execute on function ([a-z_.]+)\([^)]*\) to ([a-z_, ]+);/g)].map((g) => [g[1], g[2].trim()]);
    for (const [name, to] of grants) expect(['authenticated', 'service_role'], `${name} -> ${to}`).toContain(to);
    // nothing is ever granted to anon or public
    expect(code).not.toMatch(/grant [^;]*\bto\b[^;]*\b(anon|public)\b/);
  });

  test('every admin_* function that an admin calls from the dashboard begins by asking is_admin() before anything else', () => {
    for (const f of PUBLIC_API.filter((x) => /\.admin_(?!audit_record)/.test(x.qualified))) {
      const body = f.chunk.slice(f.chunk.indexOf('begin'));
      const firstGuard = body.indexOf('public.is_admin()');
      expect(firstGuard, f.qualified).toBeGreaterThan(-1);
      // no statement that reads or writes a table comes before the guard
      expect(body.slice(0, firstGuard), f.qualified).not.toMatch(/\b(insert into|update |delete from|select [^;]*\bfrom\b)/);
      expect(body.slice(firstGuard, firstGuard + 160), f.qualified).toMatch(/ADMIN_ONLY/);
    }
  });

  test('the two counters the Edge Function reads are granted to service_role ONLY, never to a player', () => {
    for (const name of ['public.progress_credits_pending', 'public.progress_credits_mark_counted']) {
      const head = 'grant execute on function ' + name.replace('.', '\\.') + '\\([^)]*\\) to ';
      expect(code, name).toMatch(new RegExp(head + 'service_role;'));
      expect(code, name).not.toMatch(new RegExp(head + 'authenticated'));
    }
  });

  test('every player-facing function answers for auth.uid() only: no user id is taken from the call', () => {
    for (const name of ['public.claim_server_credits', 'public.my_recent_credits', 'public.redeem_promo_code']) {
      const f = fns.find((x) => x.qualified === name)!;
      expect(f.signature, name).not.toMatch(/uuid/);
      expect(f.chunk, name).toContain('(select auth.uid())');
    }
  });

  test('a credit cannot be bigger than the caps, whatever writes it: the table checks them', () => {
    expect(code).toMatch(/kind = 'gold'[^)]*amount between 1 and 1000000/);
    expect(code).toMatch(/kind = 'shards'[^)]*amount between 1 and 10000/);
    expect(code).toMatch(/kind = 'consumable'[\s\S]*?amount between 1 and 100\)/);
  });

  test('the potion list leaves out every tradeable or Pass-track consumable', () => {
    const list = /promo_consumable_ids\(\)\s*returns text\[\][\s\S]*?array\[([\s\S]*?)\]::text/.exec(code)![1];
    for (const id of ['gold_pouch_s', 'gold_pouch_m', 'gold_pouch_l', 'stash_deed', 'forge_seal', 'refine_catalyst', 'expedition_ticket_1h']) expect(list, id).not.toContain(id);
  });

  test('every new table has row level security on and no privilege for the API roles', () => {
    for (const m of code.matchAll(/create table if not exists (arena_private\.[a-z_]+)/g)) {
      const t = m[1].replace('.', '\\.');
      expect(code, m[1]).toMatch(new RegExp(`alter table ${t} enable row level security;`));
      expect(code, m[1]).toMatch(new RegExp(`revoke all on table ${t} from public, anon, authenticated;`));
    }
  });
});
