// The JSON-RPC client every chain module uses (EVM or Solana): one POST per call, a timeout, and an error that never carries the node URL (it may hold the provider's API key).

/** One JSON-RPC call. Throws on anything that is not a clean `result`. */
export interface RpcClient {
  call(method: string, params: unknown[]): Promise<unknown>;
}

export function createJsonRpc(url: string, opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {}): RpcClient {
  const doFetch = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 8000;
  let id = 0;
  return {
    async call(method, params) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await doFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: ctrl.signal });
        if (!res.ok) throw new Error(`rpc_http_${res.status}`); // status only: the URL may carry the provider's API key and is never put in an error
        const body = (await res.json()) as { result?: unknown; error?: unknown };
        if (body.error !== undefined && body.error !== null) throw new Error('rpc_error');
        if (!('result' in body)) throw new Error('rpc_bad_answer');
        return body.result;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
