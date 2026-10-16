import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIERS } from './referralModel.ts';
import { DEFAULT_REFERRAL_TIERS } from '../../../../src/lib/referralTiers.ts';

// Migration 0017 (the tier list the game's Convites panel reads) is SQL that is never run from this repo: these tests read the file and pin what it must guarantee.
const root = resolve(__dirname, '../../../..');
const raw = readFileSync(resolve(root, 'supabase/migrations/0017_referral_reads.sql'), 'utf8').split('\r\n').join('\n');
const code = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('0017 referral reads', () => {
  it('is one security-definer function with an empty search_path, answering only a signed-in account', () => {
    expect(code).toContain('create or replace function public.referral_tiers()');
    expect(code).toContain('security definer');
    expect(code).toContain("set search_path = ''");
    expect(code).toContain('(select auth.uid()) is null');
    // no id is passed in and nothing about another account can be read
    expect(code).not.toMatch(/referral_tiers\(\s*\w+\s+\w+/);
    expect(code).not.toContain('auth.users');
    expect(code).not.toContain('public.waitlist');
    expect(code).not.toContain('referral_rewards_granted');
  });

  it('is granted to signed-in accounts only, and opens no table', () => {
    expect(code).toContain('revoke all on function public.referral_tiers() from public, anon, authenticated;');
    expect(code).toContain('grant execute on function public.referral_tiers() to authenticated;');
    expect(code).not.toMatch(/grant execute on function public\.referral_tiers\(\)[^;]*(anon|public)\s*;/);
    expect(code).not.toMatch(/\bgrant\s+(select|insert|update|delete|all)\b/i);
    expect(code).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/\balter table\b/i);
  });

  it('lists only the active tiers of the owner table, in insertion order, with the fields the panel reads', () => {
    expect(code).toContain('from arena_private.referral_rewards as r');
    expect(code).toContain('where r.active');
    expect(code).toContain('order by r.id');
    for (const key of ['metric', 'min_count', 'kind', 'ref', 'label_pt', 'label_en']) expect(code).toContain(`'${key}'`);
  });

  it('is only ever the tier list: the game ships the same four default tiers as 0016 for when it is not applied', () => {
    expect(DEFAULT_REFERRAL_TIERS.map((t) => [t.metric, t.minCount, t.kind, t.ref])).toEqual(DEFAULT_TIERS.map((t) => [t.metric, t.minCount, t.kind, t.rewardRef]));
  });
});
