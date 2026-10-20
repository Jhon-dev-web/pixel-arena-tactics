// The AI-operations part of the demo backend: INVENTED data, flags that really toggle and reports that really get acknowledged, so the page can be worked on and shown without a server.
// Like demo.ts it is imported only by a build made with VITE_ADMIN_DEMO=1 and never touches the network or the client library.
import { ApiError } from './api';
import type { AdminApi } from './api';
import type { AiCost, AiReportRow, OpsEvent, OpsFlagKey, OpsFlagRow, OpsIncident, OpsOverview, Page, PaymentExceptionRow, PlayerRow } from './types';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const iso = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString();
const delay = <T>(v: T, ms = 120): Promise<T> => new Promise((res) => setTimeout(() => res(v), ms));
const SEV_RANK: Record<string, number> = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };

function paginate<T>(rows: T[], page: number, size: number): Page<T> {
  const start = page * size;
  return { total: rows.length, page, page_size: size, rows: rows.slice(start, start + size) };
}

export function buildOps(players: Pick<PlayerRow, 'user_id' | 'username'>[]) {
  const [a, b, c] = players;
  const flags: OpsFlagRow[] = [
    { key: 'maintenance_mode', value: false, changed_at: iso(40 * DAY), changed_by: 'migration', note: null },
    { key: 'market_paused', value: true, changed_at: iso(25 * MIN), changed_by: 'watchdog', note: 'funções do mercado falhando repetidamente' },
    { key: 'season_scoring_paused', value: false, changed_at: iso(2 * DAY), changed_by: 'admin:demo', note: 'banco voltou ao normal' },
    { key: 'pass_sales_paused', value: false, changed_at: iso(40 * DAY), changed_by: 'migration', note: null },
  ];
  const incidents: OpsIncident[] = [
    { id: 'demo-incident-1', check: 'market_path', severity: 'high', summary: 'As funções do mercado estão devolvendo erros.', opened_at: iso(25 * MIN), last_seen_at: iso(2 * MIN), alert_count: 1, actions: [{ flag: 'market_paused', changed: true }] },
  ];
  const events: OpsEvent[] = [
    { id: 9, at: iso(2 * MIN), kind: 'health_check', severity: 'medium', check: 'market_path', ok: false, actor: 'watchdog', summary: 'Verificação market_path falhou' },
    { id: 8, at: iso(25 * MIN), kind: 'alert_sent', severity: 'info', check: null, ok: null, actor: 'watchdog', summary: 'Alerta enviado' },
    { id: 7, at: iso(25 * MIN), kind: 'flag_change', severity: 'high', check: 'market_paused', ok: false, actor: 'watchdog', summary: 'Flag market_paused ligada automaticamente' },
    { id: 6, at: iso(25 * MIN), kind: 'incident_opened', severity: 'high', check: 'market_path', ok: false, actor: 'watchdog', summary: 'Incidente aberto: As funções do mercado estão devolvendo erros.' },
    { id: 5, at: iso(2 * DAY), kind: 'flag_change', severity: 'info', check: 'season_scoring_paused', ok: true, actor: 'admin:demo', summary: 'Flag season_scoring_paused desligada pelo administrador' },
  ];
  const reports: AiReportRow[] = [
    {
      id: 'demo-report-1',
      kind: 'anomaly',
      severity: 'high',
      summary: 'Uma venda no mercado saiu por 25 vezes a mediana dos últimos 30 dias entre duas contas que já negociaram antes.',
      details: {
        mode: 'hourly',
        window_hours: 2,
        model: 'claude-haiku-5-5',
        model_used: true,
        model_status: 'ok',
        alerted: true,
        usage: { input_tokens: 3120, output_tokens: 880, cost_usd_estimate: 0.00075 },
        findings: [
          {
            category: 'market_outlier',
            severity: 'high',
            summary: 'O comprador pagou 25 vezes a mediana por uma Armadura de Aço: pode ser transferência de valor disfarçada de venda.',
            suggested_action: 'review_account',
            evidence: [
              { type: 'sale', id: 'demo-sale-1', label: 'steel_plate' },
              { type: 'user', id: a.user_id, label: a.username ?? undefined },
              { type: 'user', id: b.user_id, label: b.username ?? undefined },
            ],
          },
        ],
      },
      suggested_actions: [{ action: 'review_account', reason: 'Preço 25x a mediana entre duas contas.' }],
      created_at: iso(38 * MIN),
      acknowledged_at: null,
      acknowledged_by: null,
    },
    {
      id: 'demo-report-2',
      kind: 'anomaly',
      severity: 'medium',
      summary: 'Seis contas receberam marcações novas de anti-trapaça, a maioria pelo mesmo motivo (ritmo rápido demais).',
      details: {
        mode: 'hourly',
        window_hours: 2,
        model: 'claude-haiku-5-5',
        model_used: true,
        model_status: 'ok',
        alerted: false,
        findings: [
          {
            category: 'anticheat',
            severity: 'medium',
            summary: 'Cinco das seis contas foram marcadas por PACE_TOO_FAST. Vale olhar se há uma versão antiga do jogo ou um atalho em comum.',
            suggested_action: 'watch',
            evidence: [
              { type: 'user', id: c.user_id, label: c.username ?? undefined },
              { type: 'reason', id: 'PACE_TOO_FAST' },
            ],
          },
        ],
      },
      suggested_actions: [{ action: 'watch', reason: 'Cinco contas com o mesmo motivo.' }],
      created_at: iso(3 * HOUR),
      acknowledged_at: null,
      acknowledged_by: null,
    },
    {
      id: 'demo-report-3',
      kind: 'daily',
      severity: 'info',
      summary: 'Sem sinais nas últimas 24 horas: nenhuma marcação nova de anti-trapaça, nenhum pico de Lendários, mercado e pagamentos dentro do normal.',
      details: { mode: 'daily', window_hours: 24, model_used: false, alerted: false, findings: [] },
      suggested_actions: [],
      created_at: iso(9 * HOUR),
      acknowledged_at: null,
      acknowledged_by: null,
    },
    {
      id: 'demo-report-4',
      kind: 'anomaly',
      severity: 'low',
      summary: 'Um pico pequeno de inscrições vindas do mesmo IP na lista de espera.',
      details: {
        mode: 'hourly',
        window_hours: 2,
        model_used: true,
        alerted: false,
        findings: [{ category: 'referral_cluster', severity: 'low', summary: 'Seis inscrições do mesmo IP; parece uma família ou uma escola.', suggested_action: 'watch', evidence: [{ type: 'ip_prefix', id: 'ffffffff' }] }],
      },
      suggested_actions: [{ action: 'watch', reason: 'Seis inscrições do mesmo IP.' }],
      created_at: iso(2 * DAY),
      acknowledged_at: iso(DAY),
      acknowledged_by: 'demo',
    },
  ];
  const cost: AiCost = {
    month_to_date_usd: 1.84,
    projected_month_usd: 4.35,
    runs_today: 11,
    months: [
      { month: '2026-10', cost_usd: 1.84, runs: 214 },
      { month: '2026-09', cost_usd: 3.9, runs: 540 },
    ],
    by_model: [
      { model: 'claude-opus-5-5', runs: 7, cost_usd: 1.12 },
      { model: 'claude-haiku-5-5', runs: 207, cost_usd: 0.72 },
    ],
  };
  return { flags, incidents, events, reports, cost };
}

/** INVENTED unmatched payments for the demo page: a Pass paid from another account, a short payment, a duplicate, one already refunded. */
export function buildPaymentExceptions(players: Pick<PlayerRow, 'user_id' | 'username'>[]): PaymentExceptionRow[] {
  const [a, b] = players;
  const base = { livemode: false, claimed_by: [] as string[], reservation_id: null, receiver_address: 'DemoRecv1111111111111111111111111111111111', memo: null, block_time: null, resolution_ref: null, note: null, resolved_at: null };
  return [
    { ...base, id: 'demo-pay-1', signature: '5DemoSig1111111111111111111111111111111111111111111111111111111111111111111111111111111x', purpose: 'pass', reason: 'no_memo', status: 'open', user_id: a.user_id, username: a.username, linked_wallet: 'DemoLinked11111111111111111111111111111111aa', payer_address: 'DemoOther111111111111111111111111111111111bb', amount_units: 10_000_000, created_at: iso(20 * MIN) },
    { ...base, id: 'demo-pay-2', signature: '5DemoSig2222222222222222222222222222222222222222222222222222222222222222222222222222222x', purpose: 'pass', reason: 'short_amount', status: 'open', user_id: b.user_id, username: b.username, linked_wallet: 'DemoLinked22222222222222222222222222222222cc', payer_address: 'DemoLinked22222222222222222222222222222222cc', amount_units: 4_000_000, memo: 'pa1:pass:0123456789abcdef0123456789abcdef', created_at: iso(3 * HOUR) },
    { ...base, id: 'demo-pay-3', signature: '5DemoSig3333333333333333333333333333333333333333333333333333333333333333333333333333333x', purpose: 'market', reason: 'duplicate', status: 'open', user_id: a.user_id, username: a.username, linked_wallet: 'DemoLinked11111111111111111111111111111111aa', payer_address: 'DemoLinked11111111111111111111111111111111aa', amount_units: 1_000_000_000, created_at: iso(DAY) },
    { ...base, id: 'demo-pay-4', signature: '5DemoSig4444444444444444444444444444444444444444444444444444444444444444444444444444444x', purpose: 'pass', reason: 'already_owned', status: 'refunded', user_id: b.user_id, username: b.username, linked_wallet: null, payer_address: 'DemoOther222222222222222222222222222222222dd', amount_units: 10_000_000, resolution_ref: '5DemoRefund44444444444444444444444444444444444444444444444444444444444444444444444444444', created_at: iso(5 * DAY), resolved_at: iso(4 * DAY) },
  ];
}

type OpsApi = Pick<AdminApi, 'opsOverview' | 'aiReports' | 'aiCost' | 'setOpsFlag' | 'ackReport' | 'paymentExceptions'>;

export function createDemoOpsApi(players: Pick<PlayerRow, 'user_id' | 'username'>[]): OpsApi {
  const ops = buildOps(players);
  const payments = buildPaymentExceptions(players);
  return {
    paymentExceptions(q) {
      const rows = payments.filter((x) => q.status === 'all' || (q.status === 'open' ? x.status === 'open' : x.status !== 'open')).map((x) => ({ ...x }));
      return delay({ ...paginate(rows, q.page, q.pageSize), open: payments.filter((x) => x.status === 'open').length });
    },
    opsOverview() {
      const out: OpsOverview = {
        flags: ops.flags.map((f) => ({ ...f })),
        incidents: ops.incidents.map((i) => ({ ...i })),
        recent_events: ops.events.slice(0, 30).map((e) => ({ ...e })),
        checks: [
          { check: 'db', consecutive_failures: 0, first_failed_at: null, last_ok_at: iso(MIN), last_checked_at: iso(MIN) },
          { check: 'market_path', consecutive_failures: 5, first_failed_at: iso(25 * MIN), last_ok_at: iso(31 * MIN), last_checked_at: iso(MIN) },
        ],
        open_reports: ops.reports.filter((x) => !x.acknowledged_at).length,
        now: new Date().toISOString(),
      };
      return delay(out);
    },
    aiReports(q) {
      const rows = ops.reports
        .filter((x) => q.status === 'all' || (q.status === 'open' ? !x.acknowledged_at : Boolean(x.acknowledged_at)))
        .sort((x, y) => SEV_RANK[y.severity] - SEV_RANK[x.severity] || y.created_at.localeCompare(x.created_at))
        .map((x) => ({ ...x }));
      return delay(paginate(rows, q.page, q.pageSize));
    },
    aiCost: () => delay({ ...ops.cost }),
    async setOpsFlag(key: OpsFlagKey, value: boolean, note: string) {
      const flag = ops.flags.find((f) => f.key === key);
      if (!flag) throw new ApiError('OPS_BAD_FLAG');
      const text = note.trim();
      if (text.length < 3) throw new ApiError('OPS_NOTE_REQUIRED');
      if (text.length > 300) throw new ApiError('OPS_NOTE_TOO_LONG');
      if (flag.value === value) return delay({ flag: key, value, changed: false });
      flag.value = value;
      flag.changed_at = new Date().toISOString();
      flag.changed_by = 'admin:demo';
      flag.note = text;
      ops.events.unshift({ id: (ops.events[0]?.id ?? 0) + 1, at: flag.changed_at, kind: 'flag_change', severity: value ? 'medium' : 'info', check: key, ok: !value, actor: 'admin:demo', summary: `Flag ${key} ${value ? 'ligada' : 'desligada'} pelo administrador` });
      return delay({ flag: key, value, changed: true });
    },
    async ackReport(id: string) {
      const rep = ops.reports.find((x) => x.id === id);
      if (!rep || rep.acknowledged_at) return delay({ id, acknowledged: false });
      rep.acknowledged_at = new Date().toISOString();
      rep.acknowledged_by = 'demo';
      return delay({ id, acknowledged: true });
    },
  };
}
