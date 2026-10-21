import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS_DIR } from './harness';
import { pathToFileURL } from 'node:url';

// Loaded by path at run time, not imported: the admin build (tsc on this folder alone, as on Vercel) cannot see files outside admin/.
const TABLES = pathToFileURL(join(MIGRATIONS_DIR, '..', 'functions', '_shared', 'progress', 'tables.ts')).href;

// Static checks of supabase/migrations/0034_admin_player_full.sql.
const raw = readFileSync(join(MIGRATIONS_DIR, '0034_admin_player_full.sql'), 'utf8');
const code = raw.replace(/^\s*--.*$/gm, '');

describe('0034_admin_player_full.sql', () => {
  test('admin_player_full asks is_admin() first, is stable, security definer, pinned, granted only to authenticated', () => {
    const fn = /create or replace function public\.admin_player_full\(p_user_id uuid\)[\s\S]*?\n\$\$;/.exec(code)![0];
    const afterBegin = fn.slice(fn.indexOf('begin\n') + 5).trim();
    expect(afterBegin.startsWith('if not public.is_admin() then')).toBe(true);
    expect(afterBegin.slice(0, 200)).toContain("message = 'ADMIN_ONLY'");
    expect(fn).toMatch(/\bstable\b/);
    expect(fn).toMatch(/security definer/);
    expect(fn).toMatch(/set search_path = ''/);
    expect(fn).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    expect(code).toMatch(/revoke all on function public\.admin_player_full\(uuid\) from public, anon, authenticated;/);
    expect(code).toMatch(/grant execute on function public\.admin_player_full\(uuid\) to authenticated;/);
  });

  test('the level tables are the same as the Edge Function copy', async () => {
    const { PROFESSION_XP_TO_LEVEL, XP_TO_LEVEL } = (await import(/* @vite-ignore */ TABLES)) as { XP_TO_LEVEL: readonly number[]; PROFESSION_XP_TO_LEVEL: Record<'mining' | 'woodcutting' | 'gardening', readonly number[]> };
    const arrays = [...code.matchAll(/array\[([0-9,]+)\]::numeric\[\]/g)].map((m) => m[1].split(',').map(Number));
    expect(arrays).toEqual([[...XP_TO_LEVEL], [...PROFESSION_XP_TO_LEVEL.mining], [...PROFESSION_XP_TO_LEVEL.woodcutting], [...PROFESSION_XP_TO_LEVEL.gardening]]);
  });

  test('the cron block is guarded: only with pg_cron, every step wrapped, never fails', () => {
    const block = /do \$cron\$[\s\S]*\$cron\$;/.exec(code)![0];
    expect(block).toContain("extname = 'pg_cron'");
    expect(block).toContain('pg_available_extensions');
    expect(block.match(/exception when others/g)!.length).toBeGreaterThanOrEqual(3);
    expect(block).toContain("'arena-admin-daily', '*/15 * * * *'");
    expect(block).toContain("'arena-admin-aggregates', '5 */6 * * *'");
  });
});
