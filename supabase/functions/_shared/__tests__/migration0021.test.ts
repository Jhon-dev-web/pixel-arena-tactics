import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLAG_KEYS } from '../ops/flags.ts';
import { ACTIONS, CATEGORIES, SEVERITIES } from '../ops/types.ts';

// Migration 0021 (AI operations) is SQL that is never applied from this repo. These static tests read the file and pin the guarantees that matter: who may call what, that the watchdog's function can only
// switch a flag ON, that the owner's functions are admin-only, that no table is readable by a client and that the aggregates carry no e-mail. admin/tests/sql/ops.integration.test.ts runs the same file for real in PGlite.
const root = resolve(__dirname, '../../../..');
const raw = readFileSync(resolve(root, 'supabase/migrations/0021_ai_ops.sql'), 'utf8').split('\r\n').join('\n');
const code = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

interface Fn {
  schema: string;
  name: string;
  signature: string;
  header: string;
  body: string;
}
const fns: Fn[] = [...code.matchAll(/create or replace function ([a-z_]+)\.([a-z_]+)\(([\s\S]*?)\)\s*returns[\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g)].map((m) => ({ schema: m[1], name: m[2], signature: m[3], header: m[0].slice(0, m[0].indexOf('as $$')), body: m[4] }));
const argTypes = (signature: string): string =>
  signature
    .split(',')
    .map((a) => a.trim().replace(/\s+default\s+.*$/i, '').split(/\s+/).slice(1).join(' '))
    .filter(Boolean)
    .join(', ');
const sig = (f: Fn): string => `${f.schema}.${f.name}(${argTypes(f.signature)})`;
const grantsOf = (f: Fn): string[] => [...code.matchAll(new RegExp(`grant execute on function ${sig(f).replace(/[()]/g, '\\$&')} to ([^;]+);`, 'g'))].flatMap((m) => m[1].split(',').map((x) => x.trim()));
const byName = (n: string): Fn => fns.find((f) => f.name === n)!;

const ANON_READABLE = ['ops_status'];
const OWNER = ['admin_ops_overview', 'admin_ai_reports', 'admin_ai_cost', 'admin_set_ops_flag', 'admin_ack_report'];
const SERVICE = ['ops_pause', 'ops_event_add', 'ops_checks_record', 'ops_incident_open', 'ops_incident_alerted', 'ops_incident_resolve', 'ops_function_error', 'ops_health_probe', 'ops_health_counts', 'ops_prune', 'ai_budget', 'ai_run_log', 'ai_report_insert', 'ai_recent_fingerprints', 'ai_gather_aggregates'];

describe('0021 the functions and who may call them', () => {
  it('the set is exactly the documented one', () => {
    expect(fns.map((f) => f.name).sort()).toEqual([...ANON_READABLE, ...OWNER, ...SERVICE].sort());
    expect(fns.every((f) => f.schema === 'public')).toBe(true);
  });

  it('every function is a security definer with an empty search path, revoked from public/anon/authenticated first', () => {
    for (const f of fns) {
      expect(f.header, f.name).toMatch(/security definer/);
      expect(f.header, f.name).toMatch(/set search_path = ''/);
      expect(code, f.name).toContain(`revoke all on function ${sig(f)} from public, anon, authenticated;`);
    }
  });

  it('SERVICE ROLE ONLY: the watchdog / auditor functions are granted to service_role and nobody else', () => {
    for (const n of SERVICE) expect(grantsOf(byName(n)), n).toEqual(['service_role']);
  });

  it('ADMIN ONLY: the owner\'s functions are granted to `authenticated` only and start by asking is_admin()', () => {
    for (const n of OWNER) {
      const f = byName(n);
      expect(grantsOf(f), n).toEqual(['authenticated']);
      const afterBegin = f.body.trim().slice(f.body.trim().indexOf('begin') + 5).trim();
      expect(afterBegin.startsWith('if not public.is_admin() then'), n).toBe(true);
      expect(afterBegin.slice(0, 200), n).toContain("message = 'ADMIN_ONLY'");
    }
  });

  it('the only function a client without a session can call is ops_status, which returns four booleans and a timestamp', () => {
    expect(grantsOf(byName('ops_status'))).toEqual(['anon', 'authenticated', 'service_role']);
    const body = byName('ops_status').body;
    for (const k of FLAG_KEYS) expect(body).toContain(`'${k}'`);
    expect(body).toContain("'updated_at'");
    expect((body.match(/jsonb_build_object|'[a-z_]+',/g) ?? []).length).toBeLessThan(12);
    expect(byName('ops_status').header).toMatch(/\bstable\b/);
    expect(byName('ops_status').body).not.toMatch(/\bnote\b|changed_by/); // who flipped it and why stay private
  });

  it('no function outside the owner/service sets exists, and nothing is granted to public', () => {
    expect(code).not.toMatch(/grant [^;]*\bto\b[^;]*\bpublic\b/i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*\bon\s+(table\s+)?[a-z_.]+\s+to\s+[^;]*\b(anon|authenticated|public)\b/i);
  });

  it('the read functions are stable and write nothing (the owner\'s and the auditor\'s reads)', () => {
    const WRITE = /\b(insert|update|delete|truncate|drop|alter|create|merge|copy)\b/i;
    for (const n of ['admin_ops_overview', 'admin_ai_reports', 'admin_ai_cost', 'ai_gather_aggregates', 'ai_budget', 'ai_recent_fingerprints', 'ops_health_counts', 'ops_health_probe', 'ops_status']) {
      const f = byName(n);
      expect(f.header, n).toMatch(/\bstable\b/);
      expect(f.body.replace(/'(?:[^']|'')*'/g, "''"), n).not.toMatch(WRITE);
    }
  });
});

describe('0021 the flags', () => {
  it('four keys, all false by default, enforced by a check constraint', () => {
    for (const k of FLAG_KEYS) expect(code).toContain(`'${k}'`);
    expect(code).toMatch(/value boolean not null default false/);
    expect(code).toMatch(/constraint ops_flags_key_check check \(key in \('maintenance_mode', 'market_paused', 'season_scoring_paused', 'pass_sales_paused'\)\)/);
    expect(code).toMatch(/insert into arena_private\.ops_flags \(key\) values \('maintenance_mode'\), \('market_paused'\), \('season_scoring_paused'\), \('pass_sales_paused'\) on conflict \(key\) do nothing;/);
  });

  it('ops_pause can only switch ON, and only for the watchdog', () => {
    const f = byName('ops_pause');
    expect(f.signature.replace(/\s+/g, ' ')).toBe('p_key text, p_actor text, p_reason text'); // there is no "value" parameter
    expect(f.body).toMatch(/set value = true/);
    expect(f.body).not.toMatch(/set value = (false|p_|not)/);
    expect(f.body).toContain("p_actor is distinct from 'watchdog'");
    expect(f.body).toContain('OPS_BAD_ACTOR');
    expect(f.body).toContain('and f.value = false'); // idempotent: an already-on flag is left alone
    // no other service-role function writes ops_flags
    for (const other of fns.filter((x) => x.name !== 'ops_pause' && x.name !== 'admin_set_ops_flag')) expect(other.body, other.name).not.toMatch(/update arena_private\.ops_flags/);
  });

  it('admin_set_ops_flag is the only way to switch a flag OFF, needs a note in both directions and logs who and why', () => {
    const f = byName('admin_set_ops_flag');
    expect(f.body).toContain('OPS_NOTE_REQUIRED');
    expect(f.body).toContain("'admin:' || v_uid::text");
    expect(f.body).toContain("insert into arena_private.ops_events");
    expect(f.body).toContain("'why', v_note");
    expect(code.match(/update arena_private\.ops_flags/g)?.length).toBe(2); // ops_pause + admin_set_ops_flag
  });

  it('there is no function with "false", "clear", "unpause" or "off" in its name for the service role', () => {
    expect(fns.map((f) => f.name).filter((n) => /clear|unpause|resume|disable|_off/.test(n))).toEqual([]);
  });
});

describe('0021 the tables', () => {
  const tables = [...code.matchAll(/create table if not exists (arena_private\.[a-z_]+)/g)].map((m) => m[1]);

  it('creates the seven private tables, each with RLS on, every client grant revoked and no policy', () => {
    expect(tables.sort()).toEqual(['arena_private.ai_reports', 'arena_private.ai_runs', 'arena_private.ops_check_state', 'arena_private.ops_events', 'arena_private.ops_flags', 'arena_private.ops_function_errors', 'arena_private.ops_incidents']);
    for (const t of tables) {
      expect(code, t).toContain(`alter table ${t} enable row level security;`);
      expect(code, t).toContain(`revoke all on table ${t} from public, anon, authenticated;`);
    }
    expect(code).not.toMatch(/create policy/i);
  });

  it('ai_reports has the documented columns and the allow-lists live in constraints', () => {
    const t = /create table if not exists arena_private\.ai_reports \(([\s\S]*?)\n\);/.exec(code)![1];
    for (const col of ['id uuid primary key', 'kind text not null', 'severity text not null', 'summary text not null', 'details jsonb', 'suggested_actions jsonb', 'created_at timestamptz', 'acknowledged_at timestamptz', 'acknowledged_by uuid']) expect(t).toContain(col);
    expect(t).toContain("kind in ('anomaly', 'daily', 'incident')");
    for (const s of SEVERITIES) expect(code).toContain(`'${s}'`);
  });

  it('ops_events records who and why (actor + summary + details)', () => {
    const t = /create table if not exists arena_private\.ops_events \(([\s\S]*?)\n\);/.exec(code)![1];
    for (const col of ['kind text not null', 'source text not null', 'actor text', 'summary text not null', 'details jsonb']) expect(t).toContain(col);
  });

  it('at most one open incident per check (the alert de-duplication rests on it)', () => {
    expect(code).toContain('create unique index if not exists ops_incidents_one_open_idx on arena_private.ops_incidents (check_name) where status = \'open\';');
    expect(byName('ops_incident_open').body).toContain("on conflict (check_name) where status = 'open'");
  });
});

describe('0021 the aggregates are compact and private', () => {
  const f = byName('ai_gather_aggregates').body;

  it('never selects an e-mail, an address, a signature or a save', () => {
    expect(f).not.toMatch(/\bemail\b|email_canon|auth\.users|seller_address|buyer_address|fee_address|tx_signature|save_data|ip_hash\s*,\s*subnet_hash\s*\)/);
    expect(f).not.toMatch(/\bfrom public\.characters\b/);
    // hashes leave as 8-character prefixes only
    expect(f).toContain('pg_catalog.left(w.ip_hash, 8)');
    expect(f).toContain('pg_catalog.left(w.subnet_hash, 8)');
  });

  it('every list is capped, so the size does not grow with the number of players', () => {
    const limits = f.match(/limit \d+/g) ?? [];
    expect(limits.length).toBeGreaterThanOrEqual(10);
    for (const l of limits) expect(Number(l.split(' ')[1])).toBeLessThanOrEqual(15);
  });

  it('only ok / real-money data counts where it matters (devnet sales are ignored, the League reset is respected)', () => {
    expect(f).toContain('s.livemode and s.sold_at >= v_since');
    expect(f).toContain('f.created_at >= v_floor');
    expect(f).toContain('origin_certificate_id is null'); // originals only: a market copy is not an issuance
  });

  it('exposes exactly the keys the TypeScript reader expects', () => {
    for (const k of ['anticheat', 'level_jumps', 'legendary', 'market', 'referrals', 'payments', 'errors', 'window_hours']) expect(f).toContain(`'${k}'`);
  });
});

describe('0021 housekeeping and hygiene', () => {
  it('says it is NOT APPLIED, documents its rollback for every function and table, and has a SQL test plan', () => {
    expect(raw).toContain('NOT APPLIED');
    expect(raw).toContain('ROLLBACK');
    expect(raw).toContain('SQL TEST PLAN');
    for (const f of fns) expect(raw, f.name).toContain(`drop function if exists ${sig(f)};`);
    for (const t of ['ops_flags', 'ops_events', 'ops_incidents', 'ops_check_state', 'ops_function_errors', 'ai_reports', 'ai_runs']) expect(raw, t).toMatch(new RegExp(`drop table if exists arena_private\\.${t}`));
  });

  it('changes no existing table, column, policy or data and creates no trigger', () => {
    expect(code).not.toMatch(/alter table public\./i);
    expect(code).not.toMatch(/\bdrop (table|function|policy|trigger)\b/i);
    expect(code).not.toMatch(/\bcreate (or replace )?trigger\b/i);
    const dml = [...code.matchAll(/\b(insert into|update(?!\s+set\b)|delete from)\s+([a-z_.]+)/gi)].map((m) => m[2]);
    for (const d of dml) expect(d, d).toMatch(/^arena_private\.(ops_|ai_)/);
  });

  it('documents the pg_cron schedule with the shared secret in the vault, and never contains a real secret', () => {
    expect(raw).toContain("cron.schedule('ops-watchdog'");
    expect(raw).toContain("cron.schedule('ai-auditor-hourly'");
    expect(raw).toContain("cron.schedule('ai-auditor-daily'");
    expect(raw).toContain('vault.create_secret');
    expect(raw).toContain('x-ops-secret');
    expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sk-ant-|whsec_|sk_(live|test)_/);
    // the cron lines are comments: the file creates no schedule by itself
    expect(code).not.toMatch(/cron\.schedule/);
  });

  it('the TypeScript vocabulary matches the SQL', () => {
    expect(ACTIONS).toEqual(['review_account', 'watch', 'pause_market', 'pause_scoring', 'none']);
    expect(CATEGORIES.length).toBeGreaterThan(5);
    expect(code).toContain("kind in ('anomaly', 'daily', 'incident')");
  });

  it('the Edge Functions call only functions that exist here', () => {
    const store = readFileSync(resolve(root, 'supabase/functions/_shared/ops/opsStore.ts'), 'utf8');
    const monitor = readFileSync(resolve(root, 'supabase/functions/_shared/ops/monitor.ts'), 'utf8');
    const flagsTs = readFileSync(resolve(root, 'supabase/functions/_shared/ops/flags.ts'), 'utf8');
    const called = new Set([...store.matchAll(/rpc(?:<[^>]*>)?\(\s*'([a-z_]+)'/g)].map((m) => m[1]));
    for (const m of (store + monitor + flagsTs).matchAll(/rpc\/([a-z_]+)/g)) called.add(m[1]);
    // the three non-0021 functions the watchdog times: league_reset_at (0009) is the only one
    for (const n of called) expect([...fns.map((f) => f.name), 'league_reset_at'], n).toContain(n);
    expect(called.size).toBeGreaterThanOrEqual(14);
  });
});
