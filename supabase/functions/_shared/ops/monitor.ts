// Counts the 5xx answers of an Edge Function (public.ops_function_error, 5-minute buckets) so the watchdog can see "the market function is failing" without reading logs.
// It only OBSERVES: the wrapped handler runs unchanged and its answer is returned as it is.

export type ErrorReporter = (fn: string) => Promise<void>;

export interface MonitorOptions {
  /** How long a failing report may delay the answer (default 1.5 s). Reporting happens on errors only. */
  reportTimeoutMs?: number;
}

export function withOpsMonitor(fnName: string, handler: (req: Request) => Response | Promise<Response>, report: ErrorReporter | null, opts: MonitorOptions = {}): (req: Request) => Promise<Response> {
  const timeoutMs = opts.reportTimeoutMs ?? 1_500;
  const send = async (): Promise<void> => {
    if (!report) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([report(fnName).catch(() => undefined), new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)))]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return async (req) => {
    let res: Response;
    try {
      res = await handler(req);
    } catch (err) {
      await send();
      throw err;
    }
    if (res.status >= 500) await send();
    return res;
  };
}

export interface ErrorReporterConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchFn?: typeof fetch;
}

/** The real reporter: one RPC with the service role. A missing configuration gives null (the monitor then does nothing). */
export function createErrorReporter(cfg: ErrorReporterConfig): ErrorReporter | null {
  if (!cfg.supabaseUrl || !cfg.serviceRoleKey) return null;
  const doFetch = cfg.fetchFn ?? fetch;
  return async (fn: string) => {
    const res = await doFetch(`${cfg.supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/ops_function_error`, {
      method: 'POST',
      headers: { apikey: cfg.serviceRoleKey, authorization: `Bearer ${cfg.serviceRoleKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_fn: fn }),
    });
    if (!res.ok) throw new Error(`ops_function_error_${res.status}`);
  };
}
