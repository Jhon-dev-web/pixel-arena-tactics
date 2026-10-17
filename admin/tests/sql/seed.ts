import type { PGlite } from '@electric-sql/pglite';

// A small, deterministic world for the admin functions. Everything is relative to now() so the "online", "today" and "7 days" windows are exact.
export const ADMIN = '00000000-0000-4000-8000-0000000000a1';
export const ANA = '00000000-0000-4000-8000-0000000000b1'; // online now, card Pass (live), Legendary by pity, flagged
export const BRUNO = '00000000-0000-4000-8000-0000000000b2'; // active today, USDC Pass (live), buyer of a Legendary
export const CARLA = '00000000-0000-4000-8000-0000000000b3'; // active 3 days ago, test-mode card Pass, Seal Legendary
export const DIEGO = '00000000-0000-4000-8000-0000000000b4'; // inactive for 40 days, refunded Pass
export const ELOA = '00000000-0000-4000-8000-0000000000b5'; // referral Pass, Hunting unique, boss unique

export const SIG = (n: number): string => `Sg${String(n).replace(/0/g, "A")}`.padEnd(88, "x"); // base58 has no zero

export async function seed(db: PGlite): Promise<{ weapon4: string; armor4: string }> {
  const users: [string, string, string | null][] = [
    [ADMIN, 'owner@example.com', null],
    [ANA, 'ana.silva@example.com', 'AnaSilva'],
    [BRUNO, 'bruno@example.com', 'Bruno'],
    [CARLA, 'carla@example.com', 'Carla'],
    [DIEGO, 'diego@example.com', 'Diego'],
    [ELOA, 'eloa@example.com', 'Eloa'],
  ];
  for (const [id, email, name] of users) {
    const created = id === DIEGO ? "now() - interval '60 days'" : id === ADMIN ? "now() - interval '90 days'" : "now() - interval '10 days'";
    await db.query(`insert into auth.users (id, email, created_at, email_confirmed_at) values ($1, $2, ${created}, now())`, [id, email]);
    await db.query('insert into public.profiles (user_id) values ($1) on conflict do nothing', [id]);
    if (name) await db.query('update public.profiles set username = $2, username_set_at = now() where user_id = $1', [id, name]);
  }
  // a sign-up from a minute ago for the signups_today counter
  await db.query(`insert into auth.users (id, email, created_at) values ('00000000-0000-4000-8000-0000000000c1', 'new@example.com', now() - interval '1 minute')`);

  // The season opens (this also stamps the League reset): everything below is "after the reset".
  await db.query(`update public.seasons set status = 'open', starts_at = now() - interval '1 hour', ends_at = now() + interval '59 days', freeze_at = now() + interval '57 days' where number = 1`);
  await db.query(`update public.seasons set status = 'closed' where number = 0`);
  // The reset stamp is set once (a trigger refuses to move it): for the fixture, pretend the League opened 30 days ago so the back-dated snapshots below count as after it.
  await db.exec('alter table arena_private.season_goal disable trigger season_goal_reset_once');
  await db.query("update arena_private.season_goal set reset_at = now() - interval '30 days' where id");
  await db.exec('alter table arena_private.season_goal enable trigger season_goal_reset_once');

  // Characters: gold in the save, last saved at very different moments.
  const chars: [string, string, number, string][] = [
    [ANA, 'Ana', 1200000, "now() - interval '1 minute'"],
    [BRUNO, 'Bruno', 50000, "now() - interval '20 minutes'"],
    [CARLA, 'Carla', 8000, "now() - interval '3 days'"],
    [DIEGO, 'Diego', 300, "now() - interval '40 days'"],
    [ELOA, 'Eloa', 77000, "now() - interval '2 hours'"],
  ];
  for (const [id, name, gold, updated] of chars) {
    await db.query(`insert into public.characters (user_id, hero_name, save_data, updated_at) values ($1, $2, $3::jsonb, ${updated})`, [id, name, JSON.stringify({ gold, xp: 1 })]);
  }

  // Server snapshots with the metrics the game extracts; Ana has a flagged one (open flag), Carla a cleared one.
  const snap = (user: string, verdict: string, reasons: string[], lvl: number, floor: number, minutesAgo: number, epic = 0, legendary = 0) =>
    db.query(
      `insert into public.progress_snapshots (user_id, metrics, metrics_hash, verdict, reasons, created_at)
       values ($1, $2::jsonb, repeat('a', 64), $3, $4::text[], now() - ($5 || ' minutes')::interval)`,
      [user, JSON.stringify({ heroLevel: Math.min(lvl, 100), paragonLevel: Math.max(lvl - 100, 0), highestFloor: floor, deepestDepth: 7, items: { common: 3, rare: 2, epic, legendary } }), verdict, `{${reasons.join(',')}}`, String(minutesAgo)],
    );
  await snap(ANA, 'ok', [], 112, 100, 120, 2, 1);
  await snap(ANA, 'flagged', ['PACE_TOO_FAST', 'GOLD_JUMP'], 115, 100, 10, 2, 1);
  await snap(BRUNO, 'ok', [], 60, 55, 30);
  await snap(CARLA, 'flagged', ['BASELINE_AHEAD_OF_ACCOUNT_AGE'], 30, 20, 4000);
  await snap(DIEGO, 'ok', [], 10, 5, 57600);
  await snap(ELOA, 'ok', [], 40, 30, 130);
  const carlaFlag = await db.query<{ id: string }>(`select id from public.progress_snapshots where user_id = $1 and verdict = 'flagged'`, [CARLA]);
  await db.query(`insert into public.progress_flag_clears (snapshot_id, user_id, note) values ($1, $2, 'checked by hand: legitimate import')`, [carlaFlag.rows[0].id, CARLA]);
  await db.query(`insert into arena_private.item_account_flags (user_id, code, detail) values ($1, 'HUNT_TIME_EXCESS', '{}')`, [BRUNO]);

  // Season entries (the season is open, so the freeze guard accepts them). Score = level_total * 1,000,000 + floor + depth.
  await db.query(`insert into public.season_entries (season, user_id, score, flags) values (1, $1, 115100107, '{PACE_TOO_FAST}'), (1, $2, 60055007, '{}'), (1, $3, 40030007, '{}')`, [ANA, BRUNO, ELOA]);

  // Entitlements: live card, live USDC, test card, referral and a refunded one.
  await db.query(
    `insert into public.entitlements (user_id, kind, source, provider_ref, status, livemode) values
    ($1, 'adventurer_pass', 'stripe', 'pi_live_1', 'active', true),
    ($2, 'adventurer_pass', 'crypto_sol', $6, 'active', true),
    ($3, 'adventurer_pass', 'stripe', 'pi_test_1', 'active', false),
    ($4, 'adventurer_pass', 'referral', 'ref-1', 'active', true),
    ($5, 'adventurer_pass', 'stripe', 'pi_live_refunded', 'refunded', true)`,
    [ANA, BRUNO, CARLA, ELOA, DIEGO, SIG(900)],
  );
  await db.query(
    `insert into public.chain_payments (tx_hash, chain_id, livemode, purpose, leg, user_id, from_address, to_address, amount_units, block_number, block_time, status) values
    ($1, 101, true, 'pass', 'pass', $2, 'BrunoWa11et11111111111111111111111111', 'QwnerWa11et111111111111111111111111111', 10000000, 1, now(), 'applied'),
    ($3, 103, false, 'pass', 'pass', $2, 'BrunoWa11et11111111111111111111111111', 'QwnerWa11et111111111111111111111111111', 10000000, 2, now(), 'applied'),
    ($4, 101, true, 'pass', 'pass', $2, 'BrunoWa11et11111111111111111111111111', 'QwnerWa11et111111111111111111111111111', 10000000, 3, now(), 'refund_due')`,
    [SIG(900), BRUNO, SIG(901), SIG(902)],
  );

  // Wa11ets
  await db.query(`insert into public.market_wallets (user_id, address, chain_id) values ($1, 'AnaWa11et111111111111111111111111111111', 101), ($2, 'BrunoWa11et11111111111111111111111111', 101)`, [ANA, BRUNO]);

  // Forge history for Ana: 40 normal tier>=4 forges without a Legendary, then the 41st is Legendary (the pity). Carla: Legendary on her 5th forge (no pity) and a Seal Legendary (no certificate).
  const t = await db.query<{ template_id: string; slot: string }>(`select template_id, slot from arena_private.admin_template_info where kind = 'gear' and tier = 4 order by template_id`);
  const weapon4 = t.rows.find((r) => r.slot === 'weapon')!.template_id;
  const armor4 = t.rows.find((r) => r.slot === 'armor')!.template_id;
  const tpl = (id: string, rarity: string, bound: boolean, cert: number | null) => JSON.stringify({ kind: 'forge', item: { templateId: id, rarity, substats: [], bound, certIndex: cert } });
  for (let i = 0; i < 40; i++) {
    await db.query(`insert into public.item_mint_requests (user_id, request_id, kind, template, created_at) values ($1, $2, 'forge', $3::jsonb, now() - ($4 || ' hours')::interval)`, [ANA, `ana-${i}`, tpl(weapon4, 'common', false, null), String(100 - i)]);
  }
  await db.query(`insert into public.item_mint_requests (user_id, request_id, kind, template, created_at) values ($1, 'ana-leg', 'forge', $2::jsonb, now() - interval '5 hours')`, [ANA, tpl(weapon4, 'legendary', false, 0)]);
  for (let i = 0; i < 4; i++) {
    await db.query(`insert into public.item_mint_requests (user_id, request_id, kind, template, created_at) values ($1, $2, 'forge', $3::jsonb, now() - ($4 || ' hours')::interval)`, [CARLA, `carla-${i}`, tpl(armor4, 'common', false, null), String(50 - i)]);
  }
  await db.query(`insert into public.item_mint_requests (user_id, request_id, kind, template, created_at) values ($1, 'carla-leg', 'forge', $2::jsonb, now() - interval '40 hours')`, [CARLA, tpl(armor4, 'legendary', false, 0)]);
  await db.query(`insert into public.item_mint_requests (user_id, request_id, kind, template, created_at) values ($1, 'carla-seal', 'forge', $2::jsonb, now() - interval '30 hours')`, [CARLA, tpl(armor4, 'legendary', true, null)]);

  const cert = async (id: string, user: string, kind: string, template: string, rarity: string | null, tier: number | null, source: string, status: string, requestId: string, opts: { bound?: boolean; origin?: string; gold?: number } = {}) =>
    db.query(
      `insert into public.item_certificates (id, user_id, kind, template_id, rarity, tier, gold_amount, source, status, bound, request_id, content_hash, origin_certificate_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, repeat('b', 64), $12)`,
      [id, user, kind, template, rarity, tier, opts.gold ?? null, source, status, opts.bound ?? false, requestId, opts.origin ?? null],
    );
  const C = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await cert(C(1), ANA, 'gear', weapon4, 'legendary', 4, 'forge', 'held', 'ana-leg'); // pity, still held by Ana
  await cert(C(2), CARLA, 'gear', armor4, 'legendary', 4, 'forge', 'transferred', 'carla-leg'); // sold to Bruno
  await cert(C(3), BRUNO, 'gear', armor4, 'legendary', 4, 'forge', 'listed', 'bought-1', { origin: C(2) }); // the bought copy, relisted by Bruno
  await cert(C(4), ELOA, 'unique', 'demon_fang_dagger', 'epic', 2, 'hunt_drop', 'held', 'hunt-1', { bound: true });
  await cert(C(5), ELOA, 'unique', 'bloodvein_plate', 'epic', 2, 'boss_drop', 'burned', 'boss-1');
  await cert(C(6), ANA, 'gold_pouch', 'gold_pouch_m', null, null, 'pouch', 'held', 'pouch-1', { gold: 5000 });
  await cert(C(7), ANA, 'gold_pouch', 'gold_pouch_s', null, null, 'pouch', 'burned', 'pouch-2', { gold: 2000 });
  await cert(C(8), BRUNO, 'gear', weapon4, 'epic', 4, 'forge', 'held', 'bruno-1');
  await db.query(`insert into public.item_certificate_events (certificate_id, user_id, event) values ($1, $2, 'mint'), ($1, $2, 'burn')`, [C(7), ANA]);

  // Market: one listing open (Bruno's relisted piece), one live sale (Carla -> Bruno, 1 SOL, 5% fee), one test sale, and material balances.
  await db.query(
    `insert into public.market_listings (id, certificate_id, seller_id, seller_address, price_lamports, status, expires_at) values
    ('20000000-0000-4000-8000-000000000001', $1, $2, 'BrunoWa11et11111111111111111111111111', 2000000000, 'open', now() + interval '2 days')`,
    [C(3), BRUNO],
  );
  await db.query(
    `insert into public.market_sales (listing_id, reservation_id, certificate_id, new_certificate_id, seller_id, buyer_id, seller_address, buyer_address, fee_address, item_kind, item_template, price_lamports, fee_lamports, seller_lamports, tx_signature, chain_id, livemode, sold_at) values
    ('20000000-0000-4000-8000-0000000000f1', '30000000-0000-4000-8000-000000000001', $1, $2, $3, $4, 'CarlaWa11et11111111111111111111111111', 'BrunoWa11et11111111111111111111111111', 'QwnerWa11et111111111111111111111111111', 'gear', $5, 1000000000, 50000000, 950000000, $6, 101, true, now() - interval '2 days'),
    ('20000000-0000-4000-8000-0000000000f2', '30000000-0000-4000-8000-000000000002', $1, $2, $3, $4, 'CarlaWa11et11111111111111111111111111', 'BrunoWa11et11111111111111111111111111', 'QwnerWa11et111111111111111111111111111', 'gear', $5, 500000000, 25000000, 475000000, $7, 103, false, now() - interval '1 day')`,
    [C(2), C(3), CARLA, BRUNO, armor4, SIG(1), SIG(2)],
  );
  await db.query(`insert into public.material_balances (user_id, material_id, qty, pending) values ($1, 'iron_ore', 120, 5), ($2, 'iron_ore', 30, 0), ($1, 'oak_log', 10, 0)`, [ANA, BRUNO]);

  // Waiting list: three people, the first one invited two of them (one qualified).
  const wl = async (id: string, email: string, ref: string, source: string | null, referredBy: string | null, qualified: boolean, ago: string) =>
    db.query(
      `insert into public.waitlist (id, email, locale, source, consent_at, ref_code, view_key_hash, email_canon, referred_by, qualified_at, created_at)
       values ($1, $2, 'pt', $3, now(), $4, repeat('c', 64), $7, $5, ${qualified ? 'now()' : 'null'}, now() - ($6 || ' days')::interval)`,
      [id, email, source, ref, referredBy, ago, email],
    );
  await wl('40000000-0000-4000-8000-000000000001', 'bruno@example.com', 'AAAAAAAAAA', 'tiktok', null, false, '20');
  await wl('40000000-0000-4000-8000-000000000002', 'friend1@example.com', 'BBBBBBBBBB', 'tiktok', '40000000-0000-4000-8000-000000000001', true, '3');
  await wl('40000000-0000-4000-8000-000000000003', 'friend2@example.com', 'CCCCCCCCCC', null, '40000000-0000-4000-8000-000000000001', false, '0');

  return { weapon4, armor4 };
}
