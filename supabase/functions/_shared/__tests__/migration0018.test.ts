import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0018 (the Legendary pity counter, Rodada 26) is SQL that is never run from this repo: these tests read the file and pin what it must guarantee.
const root = resolve(__dirname, '../../../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8').split('\r\n').join('\n');
const raw = read('supabase/migrations/0018_forge_pity.sql');
const m11 = read('supabase/migrations/0011_market.sql');
const code = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const fnBody = (sql: string): string => /public\.item_commit\([\s\S]*?\n\$\$;/.exec(sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'))?.[0] ?? '';
const commit = fnBody(code);
const commit11 = fnBody(m11.slice(m11.indexOf('create or replace function public.item_commit(')));

describe('0018 forge pity', () => {
  it('the counter table is closed to every client role: RLS on, no policy, service role only', () => {
    expect(code).toContain('create table if not exists public.item_pity');
    expect(code).toContain('alter table public.item_pity enable row level security;');
    expect(code).toContain('revoke all on table public.item_pity from public, anon, authenticated;');
    expect(code).toContain('grant select, insert, update on table public.item_pity to service_role;');
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/grant [^;]*on table public\.item_pity to (anon|authenticated|public)/i);
    expect(code).toContain('check (forges >= 0)');
  });

  it('item_commit REPLACES the 0011 one: the old signature is dropped (no overload for PostgREST to trip on) and the new one only adds p_pity', () => {
    expect(code).toContain('drop function if exists public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb);');
    const sig = (sql: string) => /function public\.item_commit\(([\s\S]*?)\)\s*returns jsonb/.exec(sql)?.[1].replace(/\s+/g, ' ').trim();
    expect(sig(code)).toBe(`${sig(m11)}, p_pity jsonb default null`);
    expect(code).toContain('revoke all on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb, jsonb) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb, jsonb) to service_role;');
    expect(code).not.toMatch(/grant execute on function public\.item_commit[^;]*(anon|authenticated|public)\s*;/);
  });

  it('keeps everything 0011 did, under the same per-user lock: every line of the old body is still in the new one', () => {
    expect(commit).toContain("hashtextextended('item_commit:' || p_user_id::text, 0)");
    const lines = (sql: string) => sql.split('\n').map((l) => l.trim()).filter(Boolean);
    const newLines = new Set(lines(commit));
    const oldBody = lines(commit11).slice(lines(commit11).findIndex((l) => l === 'declare'));
    expect(oldBody.length).toBeGreaterThan(50);
    for (const l of oldBody) expect(newLines.has(l), l).toBe(true);
  });

  it('checks the counter under the lock, after the replay and the caps and before it writes anything, and refuses a counter that moved', () => {
    const replay = commit.indexOf("'status', 'replay'");
    const cap = commit.indexOf("'status', 'cap'");
    const check = commit.indexOf("'status', 'pity_changed'");
    const burnFailed = commit.indexOf("'status', 'burn_failed'");
    const firstWrite = commit.indexOf('insert into public.item_mint_requests');
    const write = commit.indexOf('insert into public.item_pity');
    expect(replay).toBeGreaterThan(-1);
    expect(cap).toBeGreaterThan(replay);
    expect(check).toBeGreaterThan(cap);
    expect(burnFailed).toBeGreaterThan(check);
    expect(firstWrite).toBeGreaterThan(burnFailed);
    expect(write).toBeGreaterThan(firstWrite); // the counter is written with the request, never when a refusal returned first
    expect(commit).toContain("(p_pity ->> 'expect')::integer");
    expect(commit).toContain("(p_pity ->> 'next')::integer");
    expect(commit).toContain('on conflict (user_id) do update set forges = excluded.forges');
  });

  it('the TypeScript store sends exactly the argument the SQL declares, reads the same table, and the handler answers a moved counter as busy', () => {
    const db = read('supabase/functions/_shared/items/itemDb.ts');
    expect(db).toContain('p_pity: args.pity ?');
    expect(db).toContain("'item_pity'");
    expect(db).toContain("select: 'forges'");
    expect(db).toContain("'pity_changed'");
    const handler = read('supabase/functions/_shared/items/handler.ts');
    expect(handler).toContain("outcome.status === 'pity_changed'");
    expect(handler).toContain('pity: answered.pity');
  });
});
