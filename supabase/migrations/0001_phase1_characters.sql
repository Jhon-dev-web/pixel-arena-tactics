-- Phase 1: account + persistent character foundation.
--
-- Scope: identity + persistence ONLY. This table stores whatever SaveData the client sends, exactly
-- like localStorage did — it does NOT make gold/gear/RNG/timers server-authoritative. See
-- docs/backend-phase1.md and the "Fase 1 = identidade + persistência" note in src/game/saveRepository.ts.
--
-- One character per user in this phase (unique(user_id) below). user_id is a plain column, not part of
-- a composite primary key, specifically so a future multi-character phase can drop that one constraint
-- without reshaping the table.

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hero_name text not null default 'Hero',
  save_data jsonb not null,
  save_schema_version integer not null default 1,
  -- Optimistic-concurrency counter (see src/game/saveRepository.ts SupabaseSaveRepository.save): every
  -- update must supply the revision it read and is bumped by exactly 1, so two tabs/devices racing to
  -- save can never silently clobber one another.
  revision integer not null default 1,
  -- True when this row's initial save_data came from a client localStorage save rather than
  -- defaultSave(). Informational only today (see docs/backend-phase1.md "Saves legados") — no gameplay
  -- or economic logic reads it yet.
  imported_from_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint characters_user_id_unique unique (user_id)
);

create index if not exists characters_user_id_idx on public.characters (user_id);

-- Keeps updated_at authoritative to the DATABASE clock, not whatever the client's Date.now() claims —
-- consistent with the rest of this audit's stance that client timestamps are not trustworthy inputs.
create or replace function public.characters_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists characters_set_updated_at on public.characters;
create trigger characters_set_updated_at
  before update on public.characters
  for each row
  execute function public.characters_set_updated_at();

-- Row Level Security: a user may only ever see/create/update their OWN character. There is
-- intentionally no delete policy in Phase 1 (nothing in the product requires client-initiated character
-- deletion yet); add one deliberately later if that changes.
alter table public.characters enable row level security;

drop policy if exists "characters_select_own" on public.characters;
create policy "characters_select_own"
  on public.characters
  for select
  using (auth.uid() = user_id);

drop policy if exists "characters_insert_own" on public.characters;
create policy "characters_insert_own"
  on public.characters
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "characters_update_own" on public.characters;
create policy "characters_update_own"
  on public.characters
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
