import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0010 is SQL that was never run from this repo: these tests read the file and pin the guarantees of the item certificates (nobody but the server writes them, the limits are
// atomic, bind is irreversible, a finished certificate stays finished). The SQL TEST PLAN at the end of the file is what proves it against a real database.

const root = resolve(__dirname, '../../../..');
const m10 = readFileSync(resolve(root, 'supabase/migrations/0010_item_certificates.sql'), 'utf8');
const code = m10
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

function fn(name: string): string {
  const start = code.indexOf(`create or replace function ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return code.slice(start, code.indexOf('$$;', code.indexOf('as $$', start)) + 3);
}

const FUNCTIONS = ['arena_private.item_certificates_league_reset()', 'arena_private.item_certificates_guard()', 'arena_private.item_certificate_events_no_change()', 'arena_private.has_item_flags(p_user_id uuid)', 'public.item_flag_account(', 'public.item_take_tokens(', 'public.item_commit(', 'public.item_certificate_transition('];

describe('0010: certificates cannot be written by a client', () => {
  it('RLS is on for every public table the migration creates, and the only policy is "select own"', () => {
    for (const t of ['item_certificates', 'item_certificate_events', 'item_mint_requests']) expect(code).toContain(`alter table public.${t} enable row level security;`);
    const policies = code.match(/create policy [a-z_]+/g) ?? [];
    expect(policies).toHaveLength(2);
    expect(code).toMatch(/create policy item_certificates_select_own\s+on public\.item_certificates\s+for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\);/);
    expect(code).toMatch(/create policy item_certificate_events_select_own\s+on public\.item_certificate_events\s+for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\);/);
  });

  it('authenticated gets SELECT and nothing else, anon gets nothing; every grant of a write goes to the service role', () => {
    const grants = code.match(/grant [a-z, ]+ on (?:table )?[a-z_.]+ to [a-z_]+;/g) ?? [];
    for (const g of grants) {
      if (/to authenticated;/.test(g)) expect(g).toMatch(/^grant select on table public\.item_certificates? to authenticated;|^grant select on table public\.item_certificate_events to authenticated;/);
      expect(g).not.toMatch(/to anon;/);
      expect(g).not.toMatch(/to public;/);
    }
    expect(code).toContain('grant select on table public.item_certificates to authenticated;');
    expect(code).toContain('grant select on table public.item_certificate_events to authenticated;');
    expect(code).not.toMatch(/grant (?:insert|update|delete|all)[a-z, ]* on [a-z_.\s]+ to authenticated/);
    for (const t of ['public.item_certificates', 'public.item_certificate_events', 'public.item_mint_requests']) expect(code).toContain(`revoke all on table ${t} from public, anon, authenticated;`);
  });

  it('the mint requests, the buckets and the flags are not even readable by a client', () => {
    expect(code).not.toMatch(/grant [a-z, ]*select[a-z, ]* on table public\.item_mint_requests to authenticated/);
    expect(code).not.toMatch(/to authenticated[\s\S]{0,40}arena_private\.item_(?:buckets|account_flags)/);
    expect(code).toContain('create table if not exists arena_private.item_buckets');
    expect(code).toContain('create table if not exists arena_private.item_account_flags');
    expect(code).toContain('revoke all on schema arena_private from public, anon, authenticated;');
  });

  it('every function is security definer with an empty search_path and callable by the service role only', () => {
    for (const name of FUNCTIONS) {
      const body = fn(name);
      expect(body, name).toContain('security definer');
      expect(body, name).toContain("set search_path = ''");
    }
    for (const sig of ['public.item_flag_account(uuid, text, jsonb)', 'public.item_take_tokens(uuid, timestamptz, jsonb)', 'public.item_commit(uuid, text, text, jsonb, jsonb, uuid[], jsonb)', 'public.item_certificate_transition(uuid, uuid[], text, jsonb)']) {
      expect(code).toContain(`revoke all on function ${sig} from public, anon, authenticated;`);
      expect(code).toContain(`grant execute on function ${sig} to service_role;`);
    }
    expect(code).not.toMatch(/grant execute on function [^;]* to (?:anon|authenticated|public);/);
  });
});

describe('0010: the limits are atomic', () => {
  it('item_take_tokens runs under one advisory lock per user, locks the bucket rows, and is all-or-nothing', () => {
    const f = fn('public.item_take_tokens(');
    expect(f).toContain('pg_advisory_xact_lock');
    expect(f).toContain('for update');
    expect(f).toContain("'ok', false, 'failed'"); // returns BEFORE any write when a take does not fit
    // the writes (the upsert) come after the whole plan was computed
    expect(f.indexOf('return pg_catalog.jsonb_build_object(\'ok\', false')).toBeLessThan(f.indexOf('insert into arena_private.item_buckets'));
  });

  it('the refill uses the DATABASE clock and never exceeds the capacity; a bucket from before the reset restarts', () => {
    const f = fn('public.item_take_tokens(');
    expect(f).toContain('pg_catalog.now()');
    expect(f).toContain('least(v_capacity');
    expect(f).toContain('v_updated < p_start_at');
    expect(f).toContain('p_start_at');
  });

  it('item_commit checks the replay, the daily caps and the burn ids under the lock, before writing anything', () => {
    const f = fn('public.item_commit(');
    expect(f).toContain('pg_advisory_xact_lock');
    const replay = f.indexOf("'status', 'replay'");
    const cap = f.indexOf("'status', 'cap'");
    const burnFailed = f.indexOf("'status', 'burn_failed'");
    const firstWrite = f.indexOf('insert into public.item_mint_requests');
    expect(replay).toBeGreaterThan(-1);
    expect(cap).toBeGreaterThan(replay);
    expect(burnFailed).toBeGreaterThan(cap);
    expect(firstWrite).toBeGreaterThan(burnFailed);
    expect(f).toContain("interval '1 day'");
    expect(f).toContain("c.status = 'held'");
  });

  it('a request id is unique per user (a lost response is never a second roll)', () => {
    expect(code).toMatch(/primary key \(user_id, request_id\)/);
    expect(code).toContain('constraint item_certificates_request_unique unique (user_id, request_id, request_index)');
  });
});

describe('0010: a certificate is evidence that cannot be edited', () => {
  it('the guard trigger freezes the content, the owner, the hash and the request', () => {
    const g = fn('arena_private.item_certificates_guard()');
    for (const col of ['id', 'user_id', 'kind', 'template_id', 'rarity', 'tier', 'substats', 'upgrade', 'gold_amount', 'source', 'created_at', 'content_hash', 'request_id']) expect(g).toContain(`new.${col} is distinct from old.${col}`);
    expect(g).toContain("message = 'ITEM_CERTIFICATE_CONTENT_IS_IMMUTABLE'");
    expect(code).toMatch(/create trigger item_certificates_guard\s+before update on public\.item_certificates\s+for each row/);
  });

  it('binding is irreversible, a bound certificate cannot be listed, a finished one stays finished', () => {
    const g = fn('arena_private.item_certificates_guard()');
    expect(g).toContain('if old.bound and not new.bound then');
    expect(g).toContain("message = 'ITEM_CERTIFICATE_BIND_IS_IRREVERSIBLE'");
    expect(g).toContain("old.status in ('transferred', 'burned', 'revoked') and new.status is distinct from old.status");
    expect(g).toContain("message = 'ITEM_CERTIFICATE_IS_FINISHED'");
    expect(g).toContain("new.status = 'listed' and new.bound");
    expect(g).toContain("message = 'ITEM_CERTIFICATE_BOUND_CANNOT_BE_LISTED'");
    expect(code).toContain('constraint item_certificates_bound_listed_check check (not (bound and status = \'listed\'))');
    // nothing in the file ever assigns bound = false
    expect(code).not.toMatch(/bound\s*=\s*false/);
  });

  it('the events table is append-only', () => {
    expect(code).toMatch(/create trigger item_certificate_events_no_update\s+before update on public\.item_certificate_events/);
    expect(code).toContain("message = 'ITEM_CERTIFICATE_EVENTS_APPEND_ONLY'");
    expect(code).toContain("check (event in ('mint', 'bind', 'list', 'transfer', 'burn', 'revoke'))");
    expect(code).not.toMatch(/grant [a-z, ]*(?:update|delete)[a-z, ]* on table public\.item_certificate_events/);
  });

  it('every state a certificate can have, and where it comes from, is a check constraint', () => {
    expect(code).toContain("check (kind in ('gear', 'unique', 'gold_pouch'))");
    expect(code).toContain("check (source in ('forge', 'hunt_drop', 'boss_drop', 'pouch'))");
    expect(code).toContain("check (status in ('held', 'listed', 'transferred', 'burned', 'revoked'))");
    expect(code).toContain('pg_catalog.char_length(content_hash) = 64');
    expect(code).toContain('created_at timestamptz not null default now()'); // the server clock
    expect(code).toContain('constraint item_certificates_pouch_check check ((kind = \'gold_pouch\') = (gold_amount is not null))');
  });

  it('the transition function only moves held -> bound / revoked / burned, and idempotently', () => {
    const t = fn('public.item_certificate_transition(');
    expect(t).toContain('pg_advisory_xact_lock');
    expect(t).toContain("p_action not in ('bind', 'void', 'burn')");
    expect(t).toContain("'reason', 'not_found'");
    expect(t).toContain("'reason', 'listed'");
    expect(t).toContain("'reason', 'not_held'");
    expect(t).toContain("(p_action = 'bind' and c.status = 'held')");
    expect(t).toContain("(p_action = 'void' and c.status in ('held', 'revoked'))");
    expect(t).toContain("(p_action = 'burn' and c.status in ('held', 'burned'))");
    expect(t).toContain('c.user_id = p_user_id'); // only the owner's own certificates
  });
});

describe('0010: the League reset voids what was minted before it', () => {
  it('a trigger fires only when reset_at goes from null to a value and revokes held certificates created before it', () => {
    const f = fn('arena_private.item_certificates_league_reset()');
    expect(f).toContain('if new.reset_at is not null and old.reset_at is null then');
    expect(f).toContain("c.status = 'held' and c.created_at < new.reset_at");
    expect(f).toContain("set status = 'revoked'");
    expect(code).toMatch(/create trigger season_goal_revoke_certificates\s+after update of reset_at on arena_private\.season_goal\s+for each row/);
    expect(code).toContain('revoke all on function arena_private.item_certificates_league_reset() from public, anon, authenticated;');
  });
});

describe('0010: documentation inside the file', () => {
  it('says it is not applied, how to roll back, and has a SQL test plan (same style as 0003-0009)', () => {
    expect(m10).toContain('NOT APPLIED by the work that wrote this file');
    expect(m10).toContain('ROLLBACK (by hand');
    expect(m10).toContain('SQL TEST PLAN');
    for (const letter of ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'I.', 'J.', 'K.']) expect(m10).toContain(`-- ${letter} `);
    for (const t of ['item_certificates', 'item_certificate_events', 'item_mint_requests', 'item_buckets', 'item_account_flags']) expect(m10).toMatch(new RegExp(`drop table if exists [a-z_.]*${t};`));
  });
});
