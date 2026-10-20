import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0022 (payment references and the queue of unmatched payments) is SQL that is never applied from this repo. These static tests read the file and pin what matters: who may call what, that the queue
// is private, that the two resolutions are not reachable from the API, that the idempotency lives in a unique signature and that the TypeScript calls use the parameter names the SQL declares.
const root = resolve(__dirname, '../../../..');
const raw = readFileSync(resolve(root, 'supabase/migrations/0022_payment_fixes.sql'), 'utf8').split('\r\n').join('\n');
const code = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const marketDb = readFileSync(resolve(root, 'supabase/functions/_shared/market/marketDb.ts'), 'utf8');

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

const SERVICE = ['pass_crypto_ref', 'payment_exception_record', 'payment_exception_close', 'chain_payment_set_payer'];
const OWNER_API = ['admin_payment_exceptions'];
const OWNER_SQL = ['payment_exception_grant_pass', 'payment_exception_mark_refunded'];

describe('0022 the functions and who may call them', () => {
  it('the set is exactly the documented one', () => {
    expect(fns.map((f) => f.name).sort()).toEqual([...SERVICE, ...OWNER_API, ...OWNER_SQL].sort());
  });

  it('every function is a security definer with an empty search path, revoked from public/anon/authenticated first', () => {
    for (const f of fns) {
      expect(f.header, f.name).toMatch(/security definer/);
      expect(f.header, f.name).toMatch(/set search_path = ''/);
      expect(code, f.name).toContain(`revoke all on function ${sig(f)} from public, anon, authenticated;`);
    }
  });

  it('SERVICE ROLE ONLY: the Edge Functions\' calls', () => {
    for (const n of SERVICE) expect(grantsOf(byName(n)), n).toEqual(['service_role']);
  });

  it('ADMIN ONLY: the owner\'s read starts by asking is_admin() and writes nothing', () => {
    const f = byName('admin_payment_exceptions');
    expect(grantsOf(f)).toEqual(['authenticated']);
    const afterBegin = f.body.trim().slice(f.body.trim().indexOf('begin') + 5).trim();
    expect(afterBegin.startsWith('if not public.is_admin() then')).toBe(true);
    expect(afterBegin.slice(0, 200)).toContain("message = 'ADMIN_ONLY'");
    expect(f.header).toMatch(/\bstable\b/);
    expect(f.body.replace(/'(?:[^']|'')*'/g, "''")).not.toMatch(/\b(insert|update|delete|truncate|drop|alter|create)\b/i);
    expect(f.body).not.toMatch(/email/i); // never an e-mail address
  });

  it('the two resolutions live in arena_private and are granted to NOBODY (the owner runs them in the SQL editor)', () => {
    for (const n of OWNER_SQL) {
      const f = byName(n);
      expect(f.schema).toBe('arena_private');
      expect(grantsOf(f), n).toEqual([]);
    }
    expect(code).not.toMatch(/grant [^;]*\bto\b[^;]*\bpublic\b/i);
    expect(code).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*\bon\s+(table\s+)?[a-z_.]+\s+to\s+[^;]*\b(anon|authenticated|public)\b/i);
  });

  it('granting by hand uses source "grant" with the payment signature as its reference, refuses a closed or non-Pass row and a player who already has the Pass', () => {
    const f = byName('payment_exception_grant_pass');
    expect(f.body).toContain("values (v_x.user_id, 'adventurer_pass', 'grant', p_signature, 'active', v_x.livemode)");
    for (const e of ['PAYMENT_EXCEPTION_NOT_FOUND', 'PAYMENT_EXCEPTION_NOT_OPEN', 'PAYMENT_EXCEPTION_NOT_A_PASS_PAYMENT', 'PAYMENT_EXCEPTION_ALREADY_OWNED']) expect(f.body).toContain(e);
    expect(f.body).toContain('for update'); // the row is locked while it is resolved
  });

  it('marking refunded needs a well-formed refund signature and an open row', () => {
    const f = byName('payment_exception_mark_refunded');
    expect(f.body).toContain('PAYMENT_EXCEPTION_BAD_REFUND_SIGNATURE');
    expect(f.body).toContain('PAYMENT_EXCEPTION_NOT_OPEN');
    expect(f.body).toContain("set status = 'refunded', resolution_ref = p_refund_signature");
  });
});

describe('0022 the tables', () => {
  it('both are private: RLS on, every client grant revoked, no policy', () => {
    for (const t of ['public.pass_payment_refs', 'public.payment_exceptions']) {
      expect(code, t).toContain(`alter table ${t} enable row level security;`);
      expect(code, t).toContain(`revoke all on table ${t} from public, anon, authenticated;`);
    }
    expect(code).not.toMatch(/create policy/i);
  });

  it('one row per payment ever: the signature is unique, the reasons and statuses are allow-listed', () => {
    const t = /create table if not exists public\.payment_exceptions \(([\s\S]*?)\n\);/.exec(code)![1];
    expect(t).toContain('signature text not null unique');
    expect(t).toContain("reason in ('no_memo', 'wrong_memo', 'short_amount', 'too_early', 'wrong_sender', 'already_owned', 'duplicate')");
    expect(t).toContain("status in ('open', 'granted', 'refunded', 'resolved')");
    expect(t).toContain("purpose in ('pass', 'market')");
    expect(t).toContain('amount_units numeric(40, 0) not null');
  });

  it('recording is idempotent on the signature and refuses malformed addresses and signatures', () => {
    const f = byName('payment_exception_record');
    expect(f.body).toContain('on conflict (signature) do nothing');
    expect(f.body).toContain('PAYMENT_EXCEPTION_BAD_ARGUMENT');
    expect(f.body).toContain("'applied'"); // a payment that is already counted is not an exception
  });

  it('the Pass reference is 32 hex characters, unique, created once per player under a lock', () => {
    expect(code).toMatch(/constraint pass_payment_refs_ref_check check \(ref ~ '\^\[0-9a-f\]\{32\}\$'\)/);
    expect(code).toContain('ref text not null unique');
    expect(byName('pass_crypto_ref').body).toContain('pg_advisory_xact_lock');
  });
});

describe('0022 the TypeScript calls use the parameter names the SQL declares', () => {
  const sqlParams = (name: string): string[] => byName(name).signature.split(',').map((p) => p.trim().split(/\s+/)[0]).sort();
  const tsParams = (fn: string): string[] => {
    const at = marketDb.indexOf(`'${fn}',`);
    expect(at, fn).toBeGreaterThan(-1);
    const open = marketDb.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (let i = open; i < marketDb.length; i++) {
      if (marketDb[i] === '{') depth++;
      if (marketDb[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    return Array.from(marketDb.slice(open, end + 1).matchAll(/\b(p_[a-z_]+):/g), (m) => m[1]).sort();
  };
  it.each(SERVICE)('%s', (name) => {
    expect(tsParams(name)).toEqual(sqlParams(name));
  });
});
