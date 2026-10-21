import { describe, expect, test } from 'vitest';
import { AccessDeniedError, ApiError, createRpcApi, toError, type RpcClient } from '../src/lib/api';
import { defaultLegendaryQuery, defaultMarketQuery, defaultPlayerQuery } from '../src/lib/filters';
import { OPS_READ_RPC_NAMES, OPS_WRITE_RPC_NAMES } from '../src/lib/opsRpcNames';
import { RPC_NAMES } from '../src/lib/rpcNames';
import { ACTION_RPC_NAMES } from '../src/lib/actionRpcNames';
import { actionErrorText } from '../src/lib/actions';

function fake(answer: (name: string, args?: Record<string, unknown>) => { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve(answer(name, args));
    },
  };
  return { client, calls };
}

describe('createRpcApi', () => {
  test('every method calls exactly one admin function, with the named arguments', async () => {
    const { client, calls } = fake(() => ({ data: {}, error: null }));
    const api = createRpcApi(client);
    await api.overview();
    await api.players({ ...defaultPlayerQuery(), search: 'ana' });
    await api.playerDetail('00000000-0000-4000-8000-000000000001');
    await api.legendaries(defaultLegendaryQuery());
    await api.market(defaultMarketQuery());
    await api.economy();
    await api.series(30);
    await api.flags({ page: 0, pageSize: 50 });
    await api.league(null, 50);
    await api.waitlist(30);
    expect(calls.map((c) => c.name)).toEqual(['admin_overview', 'admin_players', 'admin_player_detail', 'admin_legendaries', 'admin_market', 'admin_economy', 'admin_economy_series', 'admin_flags', 'admin_league', 'admin_waitlist']);
    expect(new Set(calls.map((c) => c.name))).toEqual(new Set(RPC_NAMES));
    expect(calls[1].args).toMatchObject({ p_search: 'ana', p_sort: 'last_seen', p_dir: 'desc', p_page: 0, p_page_size: 50 });
    expect(calls[2].args).toEqual({ p_user_id: '00000000-0000-4000-8000-000000000001' });
    expect(calls[6].args).toEqual({ p_days: 30 });
    expect(calls[8].args).toEqual({ p_season: null, p_top: 50 });
  });

  test('the app never calls anything but the admin functions (no table access, no write)', async () => {
    const { client, calls } = fake(() => ({ data: {}, error: null }));
    const api = createRpcApi(client);
    await Promise.all([api.overview(), api.economy(), api.waitlist(7)]);
    for (const c of calls) expect(RPC_NAMES as readonly string[]).toContain(c.name);
    expect(Object.keys(client)).toEqual(['rpc']);
  });

  test('the AI-operations methods call their own functions with named arguments (the two writes carry the note)', async () => {
    const { client, calls } = fake(() => ({ data: {}, error: null }));
    const api = createRpcApi(client);
    await api.opsOverview();
    await api.aiReports({ status: 'open', page: 2, pageSize: 20 });
    await api.aiCost();
    await api.setOpsFlag('market_paused', false, 'tudo certo');
    await api.ackReport('00000000-0000-4000-8000-000000000009');
    expect(calls.map((c) => c.name)).toEqual(['admin_ops_overview', 'admin_ai_reports', 'admin_ai_cost', 'admin_set_ops_flag', 'admin_ack_report']);
    expect(new Set(calls.map((c) => c.name))).toEqual(new Set([...OPS_READ_RPC_NAMES, ...OPS_WRITE_RPC_NAMES]));
    expect(calls[1].args).toEqual({ p_status: 'open', p_page: 2, p_page_size: 20 });
    expect(calls[3].args).toEqual({ p_key: 'market_paused', p_value: false, p_note: 'tudo certo' });
    expect(calls[4].args).toEqual({ p_id: '00000000-0000-4000-8000-000000000009' });
  });

  test('the database refusing a flag change (not an admin / no note) surfaces as the right error', async () => {
    const denied = fake(() => ({ data: null, error: { message: 'ADMIN_ONLY', code: '42501' } }));
    await expect(createRpcApi(denied.client).setOpsFlag('market_paused', true, 'abc')).rejects.toBeInstanceOf(AccessDeniedError);
    const noNote = fake(() => ({ data: null, error: { message: 'OPS_NOTE_REQUIRED', code: '22023' } }));
    const err = await createRpcApi(noNote.client).setOpsFlag('market_paused', true, '').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message).toBe('OPS_NOTE_REQUIRED');
  });

  test('ADMIN_ONLY from the database becomes AccessDeniedError', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'ADMIN_ONLY', code: '42501' } }));
    await expect(createRpcApi(client).overview()).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test('a permission error (the function is not granted to the role) is also access denied', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'permission denied for function admin_overview', code: '42501' } }));
    await expect(createRpcApi(client).players(defaultPlayerQuery())).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test('any other database error is an ApiError with its message', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'ADMIN_BAD_SORT', code: '22023' } }));
    const err = await createRpcApi(client).players(defaultPlayerQuery()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message).toBe('ADMIN_BAD_SORT');
  });

  test('toError', () => {
    expect(toError({ message: 'x ADMIN_ONLY y' })).toBeInstanceOf(AccessDeniedError);
    expect(toError({ message: 'boom' })).toBeInstanceOf(ApiError);
  });
});

describe('deleteUser (the Edge Function, not an rpc)', () => {
  test('without the backend wiring it says unavailable and never touches the rpc client', async () => {
    const { client, calls } = fake(() => ({ data: {}, error: null }));
    expect(await createRpcApi(client).deleteUser('00000000-0000-4000-8000-000000000001', 'Ana')).toEqual({ ok: false, reason: 'unavailable' });
    expect(calls).toEqual([]);
  });
  test('with the wiring it passes the id and the typed name through untouched', async () => {
    const { client } = fake(() => ({ data: {}, error: null }));
    const seen: unknown[][] = [];
    const api = createRpcApi(client, { deleteUser: async (...a) => (seen.push(a), { ok: true as const, username: 'Ana' }) });
    expect(await api.deleteUser('00000000-0000-4000-8000-000000000001', 'Ana')).toEqual({ ok: true, username: 'Ana' });
    expect(seen).toEqual([['00000000-0000-4000-8000-000000000001', 'Ana']]);
  });
});

describe('grantPass / revokePass', () => {
  test('call their own functions with the user and the note, and nothing else', async () => {
    const { client, calls } = fake(() => ({ data: { status: 'granted', season: 1 }, error: null }));
    const api = createRpcApi(client);
    await api.grantPass('00000000-0000-4000-8000-000000000001', 'cortesia');
    await api.revokePass('00000000-0000-4000-8000-000000000001', 'engano');
    expect(calls).toEqual([
      { name: 'admin_grant_pass', args: { p_user: '00000000-0000-4000-8000-000000000001', p_note: 'cortesia' } },
      { name: 'admin_revoke_pass', args: { p_user: '00000000-0000-4000-8000-000000000001', p_note: 'engano' } },
    ]);
    expect(calls.map((c) => c.name)).toEqual(['admin_grant_pass', 'admin_revoke_pass']);
    for (const c of calls) expect(ACTION_RPC_NAMES as readonly string[]).toContain(c.name);
  });
  test('"not an admin" becomes the access-denied error, a missing note stays a readable ApiError', async () => {
    const denied = fake(() => ({ data: null, error: { message: 'ADMIN_ONLY', code: '42501' } }));
    await expect(createRpcApi(denied.client).grantPass('x', 'abc')).rejects.toBeInstanceOf(AccessDeniedError);
    const noNote = fake(() => ({ data: null, error: { message: 'ADMIN_NOTE_REQUIRED', code: '22023' } }));
    const err = await createRpcApi(noNote.client).revokePass('x', '').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(actionErrorText((err as Error).message)).toMatch(/motivo/);
  });
});

describe('promo codes', () => {
  test('create / list / disable call their own functions with named arguments', async () => {
    const { client, calls } = fake(() => ({ data: { codes: [] }, error: null }));
    const api = createRpcApi(client);
    await api.createPromoCodes({ count: 5, reward: 'pass', maxUses: 2, expiresAt: '2026-12-01T02:59:59.000Z', note: 'sorteio' });
    await api.listPromoCodes();
    await api.disablePromoCode('ABCDEFGHJK');
    expect(calls).toEqual([
      { name: 'admin_create_promo_codes', args: { p_count: 5, p_reward: 'pass', p_max_uses: 2, p_expires_at: '2026-12-01T02:59:59.000Z', p_note: 'sorteio', p_item_id: null, p_amount: null } },
      { name: 'admin_list_promo_codes', args: undefined },
      { name: 'admin_disable_promo_code', args: { p_code: 'ABCDEFGHJK' } },
    ]);
    for (const c of calls) expect(ACTION_RPC_NAMES as readonly string[]).toContain(c.name);
  });
  test('the player function redeem_promo_code is NOT part of the dashboard (it belongs to the game)', () => {
    expect(ACTION_RPC_NAMES as readonly string[]).not.toContain('redeem_promo_code');
  });
});
