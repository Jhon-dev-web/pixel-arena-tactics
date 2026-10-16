import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WAITLIST_LIMITS } from '../waitlist/logic.ts';

// Migration 0016 (waitlist) is SQL that was never run from this repo: these tests read the file and pin what it must guarantee. The SQL TEST PLAN at the end of the file proves it for real.
const root = resolve(__dirname, '../../../..');
const raw = readFileSync(resolve(root, 'supabase/migrations/0016_waitlist.sql'), 'utf8').split('\r\n').join('\n');
const code = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

function fn(name: string): string {
  const start = code.indexOf(`create or replace function ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('$$;', code.indexOf('as $$', start)) + 3);
}

describe('0016 part A: the waitlist cannot be read or written by a client', () => {
  it('RLS is on, there is no policy at all on the waitlist, and the client roles have no privilege', () => {
    expect(code).toContain('alter table public.waitlist enable row level security;');
    expect(code).toContain('revoke all on table public.waitlist from public, anon, authenticated;');
    expect(code).toContain('grant select, insert, update on table public.waitlist to service_role;');
    expect(code).not.toMatch(/create policy[^;]*on public\.waitlist\b/);
    expect(code).not.toMatch(/grant [^;]*on table public\.waitlist to (public|anon|authenticated)/);
    for (const t of ['arena_private.portal_flags', 'arena_private.waitlist_limits']) {
      expect(code).toContain(`alter table ${t} enable row level security;`);
      expect(code).toContain(`revoke all on table ${t} from public, anon, authenticated;`);
    }
  });

  it('stores the address in lower case, unique without regard to case, and never a raw IP', () => {
    expect(code).toContain('email extensions.citext not null');
    expect(code).toContain('constraint waitlist_email_unique unique (email)');
    expect(code).toContain('email::text = pg_catalog.lower(email::text)');
    expect(code).toContain('ip_hash text');
    expect(code).toContain('subnet_hash text');
    expect(code).not.toMatch(/\bip (inet|text)\b|\bip_address\b/);
    expect(code).toContain('consent_at timestamptz not null');
    expect(code).toContain('confirmed_at timestamptz');
    expect(code).toContain('unsubscribed_at timestamptz');
  });

  it('every function is security definer with an empty search_path, and the write ones are service-role only', () => {
    for (const name of ['arena_private.waitlist_hit', 'public.waitlist_join', 'public.waitlist_unsubscribe', 'public.waitlist_count']) {
      const body = fn(name);
      expect(body, name).toContain('security definer');
      expect(body, name).toContain("set search_path = ''");
    }
    expect(code).toContain('revoke all on function public.waitlist_join(text, text, text, text, text, text) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.waitlist_join(text, text, text, text, text, text) to service_role;');
    expect(code).toContain('revoke all on function public.waitlist_unsubscribe(uuid, text) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.waitlist_unsubscribe(uuid, text) to service_role;');
    expect(code).toContain('revoke all on function arena_private.waitlist_hit(text, integer, integer) from public, anon, authenticated;');
    expect(code).not.toMatch(/grant execute on function public\.waitlist_(join|unsubscribe)[^;]*(anon|authenticated)/);
  });

  it('the rate limit is one atomic upsert, and the numbers match the ones the Edge Function documents', () => {
    const hit = fn('arena_private.waitlist_hit');
    expect(hit).toMatch(/insert into arena_private\.waitlist_limits as l[\s\S]*on conflict \(bucket, window_start\) do update set hits = l\.hits \+ 1[\s\S]*returning hits into v_hits/);
    const join = fn('public.waitlist_join');
    expect(WAITLIST_LIMITS.windowSeconds).toBe(3600);
    expect(join).toContain(`waitlist_hit('global', 3600, ${WAITLIST_LIMITS.global})`);
    expect(join).toContain(`waitlist_hit('ip:' || coalesce(p_ip_hash, 'none'), 3600, ${WAITLIST_LIMITS.perIp})`);
    expect(join).toContain(`waitlist_hit('subnet:' || coalesce(p_subnet_hash, 'none'), 3600, ${WAITLIST_LIMITS.perSubnet})`);
    expect(join).toContain(`waitlist_hit('email:' || coalesce(p_email_key, 'none'), 3600, ${WAITLIST_LIMITS.perEmail})`);
    // the limits are checked BEFORE the insert, and the insert is idempotent
    expect(join.indexOf('waitlist_hit')).toBeLessThan(join.indexOf('insert into public.waitlist'));
    expect(join).toContain('on conflict (email) do nothing');
  });

  it('an unsubscribe is never undone by a new sign-up, and keeps its first moment', () => {
    expect(fn('public.waitlist_join')).not.toContain('unsubscribed_at');
    expect(fn('public.waitlist_unsubscribe')).toContain('unsubscribed_at = coalesce(unsubscribed_at, pg_catalog.now())');
  });

  it('the public counter is gated by the owner flag (default off) and counts only active sign-ups', () => {
    expect(code).toContain('show_waitlist_count boolean not null default false');
    expect(code).toContain("constraint portal_flags_single_row check (id)");
    const count = fn('public.waitlist_count');
    expect(count).toContain('f.show_waitlist_count');
    expect(count).toContain('w.unsubscribed_at is null');
    expect(count).toContain('else null');
    expect(code).toContain('grant execute on function public.waitlist_count() to anon, authenticated;');
    expect(count).not.toMatch(/\bemail\b/);
  });

  it('nothing in the file sends e-mail', () => {
    expect(code).not.toMatch(/http_post|net\.http|pg_net|smtp/i);
  });
});
