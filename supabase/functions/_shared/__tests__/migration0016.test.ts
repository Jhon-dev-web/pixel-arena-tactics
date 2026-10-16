import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REFERRAL_ALPHABET, WAITLIST_LIMITS } from '../waitlist/logic.ts';
import { DEFAULT_TIERS, PAID_PASS_SOURCES } from './referralModel.ts';

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
    expect(code).toContain('revoke all on function public.waitlist_join(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.waitlist_join(text, text, text, text, text, text, text, text, text) to service_role;');
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

// ---- PART B: referrals ------------------------------------------------------------------------------------------------------------------------------------
const sql13 = readFileSync(resolve(root, 'supabase/migrations/0013_solana.sql'), 'utf8').split('\r\n').join('\n');
const listOf = (text: string) => [...text.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe('0016 part B: who can read or write what', () => {
  it('the new tables are closed to the client, except that a player reads his OWN granted rewards', () => {
    for (const t of ['arena_private.referral_config', 'arena_private.referral_rewards']) {
      expect(code).toContain(`alter table ${t} enable row level security;`);
      expect(code).toContain(`revoke all on table ${t} from public, anon, authenticated;`);
    }
    expect(code).toContain('alter table public.referral_rewards_granted enable row level security;');
    expect(code).toContain('revoke all on table public.referral_rewards_granted from public, anon, authenticated;');
    expect(code).toContain('grant select on table public.referral_rewards_granted to authenticated;');
    expect(code).toMatch(/create policy referral_rewards_granted_select_own[\s\S]*for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\);/);
    expect(code.match(/create policy referral_rewards_granted/g) ?? []).toHaveLength(1);
    expect(code).not.toMatch(/grant (insert|update|delete)[^;]*on table public\.referral_rewards_granted to (anon|authenticated)/);
  });
  it('the functions: counters, sweep and stats are service-role only; the game reads only through my_referral_status (own data, authenticated only)', () => {
    for (const name of [
      'arena_private.referral_counts', 'arena_private.referral_qualify_user', 'arena_private.referral_grant', 'arena_private.referral_process_user',
      'arena_private.referral_on_snapshot', 'arena_private.referral_on_entitlement', 'public.referral_sweep', 'public.waitlist_referral_stats', 'public.my_referral_status',
    ]) {
      const body = fn(name);
      expect(body, name).toContain('security definer');
      expect(body, name).toContain("set search_path = ''");
    }
    expect(code).toContain('revoke all on function public.referral_sweep() from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.referral_sweep() to service_role;');
    expect(code).toContain('revoke all on function public.waitlist_referral_stats(text, text, text) from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.waitlist_referral_stats(text, text, text) to service_role;');
    expect(code).toContain('revoke all on function public.my_referral_status() from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.my_referral_status() to authenticated;');
    expect(code).not.toMatch(/grant execute on function public\.(referral_sweep|waitlist_referral_stats)[^;]*(anon|authenticated)/);
    const mine = fn('public.my_referral_status');
    expect(mine).toContain('(select auth.uid())');
    expect(mine).not.toMatch(/p_user|p_email|p_uid/); // nothing is passed in: it can only describe the caller
  });
  it('the identity of a sign-up (e-mail, codes, inviter) can never be changed afterwards', () => {
    const guard = fn('arena_private.waitlist_guard');
    for (const column of ['email', 'ref_code', 'view_key_hash', 'referred_by']) expect(guard).toContain(`new.${column} is distinct from old.${column}`);
    expect(code).toMatch(/create trigger waitlist_guard\s+before update on public\.waitlist/);
  });
});

describe('0016 part B: the sign-up records an inviter, never oneself', () => {
  const join = fn('public.waitlist_join');
  it('decides the referral before the insert and records it only on a NEW row', () => {
    expect(join).toContain("v_ignored := 'unknown_code'");
    expect(join).toContain("v_ignored := 'self_email'");
    expect(join).toContain("v_ignored := 'self_ip'");
    expect(join).toContain('v_inviter.email_canon = v_canon');
    expect(join).toContain('v_inviter.ip_hash = p_ip_hash');
    expect(join).toContain('s.referred_by = v_inviter.id and s.ip_hash = p_ip_hash');
    expect(join).toContain('on conflict (email) do nothing'); // an existing address is untouched: one inviter per e-mail
    expect(join.indexOf("v_ignored := 'self_ip'")).toBeLessThan(join.indexOf('insert into public.waitlist'));
    expect(code).toContain('constraint waitlist_not_own_referrer check (referred_by is distinct from id)');
  });
  it('the random public code is a constraint-checked 10-letter code from the same alphabet the Edge Function uses', () => {
    expect(REFERRAL_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    expect(code).toContain("check (ref_code ~ '^[A-HJ-NP-Z2-9]{10}$')");
    expect(code).toContain('constraint waitlist_ref_code_key unique (ref_code)');
    expect(join).toContain('exception when unique_violation then');
    expect(join).toContain("'code_taken'");
  });
  it('an address that is already on the list gets its PUBLIC code and no private data', () => {
    const exists = join.slice(join.indexOf('if v_id is null then'));
    expect(exists).toContain("'exists', 'code', v_code");
    expect(exists).not.toContain('view_key');
  });
});

describe('0016 part B: counters, qualification and rewards', () => {
  it('"paying" uses the SAME paid sources as the Pass goal, and neither grant nor referral nor test mode is in it', () => {
    const at = sql13.lastIndexOf('create or replace function arena_private.paid_pass_count');
    const paid13 = listOf(sql13.slice(at, at + 600).match(/e\.source in \(([^)]*)\)/)![1]);
    expect(paid13).toEqual([...PAID_PASS_SOURCES]);
    const counts = fn('arena_private.referral_counts');
    expect(listOf(counts.match(/e\.source in \(([^)]*)\)/)![1])).toEqual([...PAID_PASS_SOURCES]);
    expect(counts).toContain("e.kind = 'adventurer_pass' and e.status = 'active' and e.livemode");
    const trigger = code.slice(code.indexOf('create trigger entitlements_referral_check'));
    expect(listOf(trigger.match(/new\.source in \(([^)]*)\)/)![1])).toEqual([...PAID_PASS_SOURCES]);
    expect(trigger).toContain('new.livemode');
  });
  it('the free Pass is NOT a sale: the goal, the meter and their trigger are left exactly as they were', () => {
    expect(code).not.toContain('create or replace function arena_private.paid_pass_count');
    expect(code).not.toContain('create or replace function arena_private.entitlements_goal_trigger');
    expect(code).not.toContain('create or replace function public.pass_meter');
    expect(code).toContain("check (source in ('stripe', 'mercadopago', 'crypto_bsc', 'crypto_sol', 'grant', 'referral'))");
    const grant = fn('arena_private.referral_grant');
    expect(grant).toContain("'adventurer_pass', 'referral', 'referral-' || v_user::text, 'active', true");
  });
  it("aliases of one person count once and the inviter's own alias never counts", () => {
    const counts = fn('arena_private.referral_counts');
    expect(counts).toContain('count(distinct r.email_canon)');
    expect(counts).toContain('r.email_canon <>');
  });
  it('a sign-up qualifies only with a confirmed account of the same e-mail and an accepted snapshot at the level, after launch', () => {
    const q = fn('arena_private.referral_qualify_user');
    for (const part of [
      'u.email_confirmed_at is not null', 'pg_catalog.lower(u.email) = w.email::text', 'c.launch_at is not null and c.launch_at <= pg_catalog.now()',
      'w.referred_by is not null', 'w.qualified_at is null', "s.verdict = 'ok'", 's.created_at >= c.launch_at', "(s.metrics ->> 'heroLevel')::numeric >= c.min_hero_level",
    ]) {
      expect(q, part).toContain(part);
    }
  });
  it('granting is idempotent, serialized, and never withdraws', () => {
    const grant = fn('arena_private.referral_grant');
    expect(grant).toContain('pg_advisory_xact_lock');
    expect(grant).toContain('from public.referral_rewards_granted as g where g.user_id = v_user and g.metric = v_tier.metric and g.min_count = v_tier.min_count');
    expect(grant).toContain('on conflict do nothing');
    expect(grant).toContain("when 'paying' then v_counts.paying else v_counts.qualified");
    expect(grant).not.toMatch(/delete from|update public\.entitlements|status = 'revoked'/);
    expect(code).toContain('constraint referral_rewards_granted_tier_unique unique (user_id, metric, min_count)');
    // the free Pass: if the entitlement insert did nothing (he holds a Pass already), the tier is left open
    expect(grant.indexOf('returning id into v_entitlement')).toBeLessThan(grant.indexOf('insert into public.referral_rewards_granted'));
    expect(grant).toMatch(/if v_entitlement is null then\s+continue;/);
  });
  it('the triggers can never block a progress snapshot or a payment', () => {
    for (const name of ['arena_private.referral_on_snapshot', 'arena_private.referral_on_entitlement']) {
      expect(fn(name)).toContain('exception when others then');
      expect(fn(name)).toContain('raise warning');
    }
    expect(code).toMatch(/create trigger referral_snapshot_check\s+after insert on public\.progress_snapshots[\s\S]*when \(new\.verdict = 'ok'\)/);
  });
  it('the default tiers are the ones the owner asked for, in one editable table', () => {
    const seed = code.slice(code.indexOf('insert into arena_private.referral_rewards'), code.indexOf('on conflict (metric, min_count) do nothing'));
    const rows = [...seed.matchAll(/\('(qualified|paying)', (\d+), '(title|cosmetic|pass)', '([a-z_]+)'/g)].map((m) => [m[1], Number(m[2]), m[3], m[4]]);
    expect(rows).toEqual(DEFAULT_TIERS.map((t) => [t.metric, t.minCount, t.kind, t.rewardRef]));
    expect(seed).toContain('Recrutador');
    expect(seed).toContain('Lenda do Recrutamento');
    expect(code).toContain('launch_at timestamptz,'); // NULL until the owner sets the date
  });
});
