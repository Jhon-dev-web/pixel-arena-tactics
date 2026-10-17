import { describe, expect, test } from 'vitest';
import { AccessDeniedError, ApiError, createRpcApi, toError, type RpcClient } from '../src/lib/api';
import { defaultLegendaryQuery, defaultMarketQuery, defaultPlayerQuery } from '../src/lib/filters';
import { RPC_NAMES } from '../src/lib/rpcNames';

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
