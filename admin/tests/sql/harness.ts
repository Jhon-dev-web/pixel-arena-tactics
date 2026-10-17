import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A throwaway in-memory Postgres (PGlite, WASM): the REAL migrations 0001-0020 run against it with a stub of the Supabase
// pieces they lean on (the auth schema and auth.uid(), the three API roles). Nothing here talks to any remote service.
const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, '..', '..', '..', 'supabase', 'migrations');

const STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now(),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create schema extensions;
create extension citext with schema extensions;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { citext } });
  await db.exec(STUB);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Runs `fn` as the given database role, with the JWT subject of `uid` (null = no JWT), then goes back to the superuser. */
export async function as<T>(db: PGlite, role: 'anon' | 'authenticated' | 'service_role' | 'postgres', uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claims', ${uid ? `'{"sub":"${uid}","role":"${role}"}'` : `''`}, false)`);
  if (role !== 'postgres') await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.exec(`select set_config('request.jwt.claims', '', false)`);
  }
}
