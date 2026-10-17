import { useState } from 'react';
import { DataTable, Pager, type Column } from '../components/Table';
import { Card, Icon, Kpi, Notice, Pill, SectionTitle, Skeleton } from '../components/ui';
import { useApp, useAsync, useInterval } from '../hooks';
import { AccessDeniedError } from '../lib/api';
import { errorText } from '../lib/auth';
import { fmtAgo, fmtDateTime, fmtInt, fmtUsd, shortId } from '../lib/format';
import { actionLabel, actorLabel, categoryLabel, checkLabel, eventKindLabel, FLAG_INFO, FLAG_ORDER, reportKindLabel, severityLabel, severityTone } from '../lib/labels';
import type { AiReportRow, OpsEvent, OpsFlagKey, OpsFlagRow, OpsIncident, ReportEvidence, ReportStatus } from '../lib/types';

const REFRESH_MS = 60_000;
const PAGE_SIZE = 20;
export const NOTE_MIN = 3;
export const NOTE_MAX = 300;

/** A pointer from an AI finding to the thing it is about: players and sales open the existing pages already searching for it. */
export function EvidenceChip({ e }: { e: ReportEvidence }) {
  if (e.type === 'user') {
    return (
      <a className="pill info" href={`#/jogadores?q=${encodeURIComponent(e.id)}`} title={`Abrir o jogador ${e.id}`}>
        Jogador: {e.label || shortId(e.id)}
      </a>
    );
  }
  if (e.type === 'sale' || e.type === 'listing') {
    return (
      <a className="pill info" href={`#/mercado?q=${encodeURIComponent(e.id)}`} title={`Abrir no mercado: ${e.id}`}>
        {e.type === 'sale' ? 'Venda' : 'Anúncio'}: {e.label || shortId(e.id)}
      </a>
    );
  }
  const kind: Record<string, string> = { reason: 'Motivo', code: 'Código', function: 'Função', ip_prefix: 'IP (hash)', subnet_prefix: 'Sub-rede (hash)', waitlist: 'Lista de espera', metric: 'Número' };
  return (
    <span className="pill" title={e.id}>
      {kind[e.type] ?? e.type}: {e.label ? `${e.id} (${e.label})` : e.id}
    </span>
  );
}

export default function AiOpsPage() {
  const { api, demo, onDenied } = useApp();
  const ov = useAsync((a) => a.opsOverview(), []);
  const cost = useAsync((a) => a.aiCost(), []);
  const [status, setStatus] = useState<ReportStatus>('open');
  const [page, setPage] = useState(0);
  const reports = useAsync((a) => a.aiReports({ status, page, pageSize: PAGE_SIZE }), [status, page]);

  function reloadAll() {
    ov.reload();
    cost.reload();
    reports.reload();
  }
  useInterval(reloadAll, REFRESH_MS);

  // ---- the flags: toggle -> confirm with a mandatory note -> call ----
  const [pending, setPending] = useState<{ key: OpsFlagKey; target: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [acking, setAcking] = useState<string | null>(null);

  function ask(key: OpsFlagKey, target: boolean) {
    setPending({ key, target });
    setNote('');
    setActionError(null);
    setSaved(null);
  }
  async function confirm() {
    if (!pending || busy) return;
    const text = note.trim();
    if (text.length < NOTE_MIN || text.length > NOTE_MAX) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await api.setOpsFlag(pending.key, pending.target, text);
      setSaved(r.changed ? `${FLAG_INFO[pending.key].label}: ${pending.target ? 'ligada' : 'desligada'}.` : `${FLAG_INFO[pending.key].label} já estava assim.`);
      setPending(null);
      ov.reload();
    } catch (e) {
      if (e instanceof AccessDeniedError) onDenied();
      else setActionError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function acknowledge(id: string) {
    if (acking) return;
    setAcking(id);
    setActionError(null);
    try {
      await api.ackReport(id);
      reports.reload();
      ov.reload();
    } catch (e) {
      if (e instanceof AccessDeniedError) onDenied();
      else setActionError(errorText(e));
    } finally {
      setAcking(null);
    }
  }

  const flags = ov.data ? FLAG_ORDER.map((k) => ov.data!.flags.find((f) => f.key === k)).filter((f): f is OpsFlagRow => Boolean(f)) : [];
  const on = flags.filter((f) => f.value);
  const c = cost.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>IA e operação</h1>
          <p>
            Os quatro interruptores de segurança, os incidentes do vigia automático e o que a IA achou. A IA só <strong>aconselha</strong>: ela nunca bane, reembolsa, mexe em saves nem em dinheiro, e o vigia só <strong>liga</strong> pausas, nunca desliga.
            {demo ? ' (dados de demonstração)' : ''}
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" onClick={reloadAll} disabled={ov.loading}>
            <Icon name="refresh" />
            Atualizar
          </button>
        </div>
      </div>

      {ov.error ? <Notice tone="bad">Não foi possível carregar: {ov.error}</Notice> : null}
      {actionError ? <Notice tone="bad">{actionError}</Notice> : null}
      {saved ? <Notice>{saved}</Notice> : null}
      {on.length > 0 ? (
        <Notice tone="warn">
          {on.length === 1 ? '1 interruptor está ligado' : `${on.length} interruptores estão ligados`}: {on.map((f) => FLAG_INFO[f.key].label).join(', ')}. O vigia nunca desliga sozinho; quando o problema passar, desligue aqui.
        </Notice>
      ) : null}

      <div className="kpis" style={{ margin: '12px 0' }}>
        <Kpi label="Incidentes abertos" value={ov.data ? fmtInt(ov.data.incidents.length) : '…'} tone={ov.data && ov.data.incidents.length > 0 ? 'bad' : 'good'} sub="vigia automático, a cada 5 min" />
        <Kpi label="Relatórios da IA não lidos" value={ov.data ? fmtInt(ov.data.open_reports) : '…'} tone={ov.data && ov.data.open_reports > 0 ? 'warn' : undefined} />
        <Kpi label="Custo da IA neste mês" value={c ? fmtUsd(c.month_to_date_usd) : '…'} sub={c ? `projeção do mês: ${fmtUsd(c.projected_month_usd)} (estimativa)` : undefined} />
        <Kpi label="Chamadas à IA hoje" value={c ? fmtInt(c.runs_today) : '…'} sub="limite diário configurável (AI_AUDITOR_MAX_RUNS_PER_DAY)" />
      </div>

      <SectionTitle>Interruptores</SectionTitle>
      <Card flush>
        {!ov.data ? (
          <div className="card-body">
            <Skeleton height={120} />
          </div>
        ) : (
          <ul className="flag-list">
            {flags.map((f) => (
              <li key={f.key} className="flag-row">
                <div className="flag-main">
                  <div className="flag-title">
                    <strong>{FLAG_INFO[f.key].label}</strong>
                    <Pill tone={f.value ? 'bad' : 'good'}>{f.value ? 'Ligada' : 'Desligada'}</Pill>
                  </div>
                  <p className="muted">{FLAG_INFO[f.key].what}</p>
                  <p className="faint">
                    {f.changed_by === 'migration' ? 'Nunca foi alterada.' : `Alterada ${fmtAgo(f.changed_at)} por ${actorLabel(f.changed_by)}${f.note ? `: «${f.note}»` : '.'}`}
                  </p>
                </div>
                <div className="flag-actions">
                  <button type="button" className={`btn${f.value ? '' : ' primary'}`} onClick={() => ask(f.key, !f.value)} disabled={busy || (pending !== null && pending.key !== f.key)} aria-label={`${f.value ? 'Desligar' : 'Ligar'} ${FLAG_INFO[f.key].label}`}>
                    {f.value ? 'Desligar' : 'Ligar'}
                  </button>
                </div>
                {pending?.key === f.key ? (
                  <form
                    className="flag-confirm"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void confirm();
                    }}
                    aria-label={`Confirmar: ${pending.target ? 'ligar' : 'desligar'} ${FLAG_INFO[f.key].label}`}
                  >
                    <p>
                      {pending.target ? (
                        <>
                          Ligar <strong>{FLAG_INFO[f.key].label}</strong>? {FLAG_INFO[f.key].what} Todos os jogadores sentem isso em até 5 minutos.
                        </>
                      ) : (
                        <>
                          Desligar <strong>{FLAG_INFO[f.key].label}</strong>? Tudo volta a funcionar para todos em até 5 minutos. Se o problema ainda existir, o vigia liga de novo.
                        </>
                      )}
                    </p>
                    <label className="field">
                      <span>Motivo (fica registrado com o seu nome, mínimo {NOTE_MIN} letras)</span>
                      <input className="input" value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} autoFocus placeholder="ex.: nó da Solana voltou, pagamentos conferidos" />
                    </label>
                    <div className="flag-confirm-actions">
                      <button type="submit" className="btn primary" disabled={busy || note.trim().length < NOTE_MIN}>
                        {busy ? 'Salvando…' : 'Confirmar'}
                      </button>
                      <button type="button" className="btn" onClick={() => setPending(null)} disabled={busy}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SectionTitle>Incidentes abertos</SectionTitle>
      <Card flush>
        <DataTable<OpsIncident>
          caption="Incidentes abertos"
          columns={INCIDENT_COLUMNS}
          rows={ov.data?.incidents ?? []}
          rowKey={(r) => r.id}
          loading={ov.loading && !ov.data}
          empty="Nenhum incidente aberto. Tudo respondendo."
        />
      </Card>
      {ov.data && ov.data.checks.some((k) => k.consecutive_failures > 0) ? (
        <p className="faint" style={{ marginTop: 8 }}>
          Verificações falhando agora: {ov.data.checks.filter((k) => k.consecutive_failures > 0).map((k) => `${checkLabel(k.check)} (${k.consecutive_failures} seguidas)`).join(', ')}.
        </p>
      ) : null}

      <SectionTitle>Relatórios da IA</SectionTitle>
      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Filtro dos relatórios">
          {(['open', 'acknowledged', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => {
                setStatus(s);
                setPage(0);
              }}
            >
              {s === 'open' ? 'Não lidos' : s === 'acknowledged' ? 'Lidos' : 'Todos'}
            </button>
          ))}
        </div>
        <span className="faint">Os mais graves primeiro. A IA aconselha; quem decide é você.</span>
      </div>
      {reports.error ? <Notice tone="bad">Não foi possível carregar os relatórios: {reports.error}</Notice> : null}
      <div className="stack">
        {reports.data && reports.data.rows.length === 0 ? <Notice>{status === 'open' ? 'Nenhum relatório novo.' : 'Nenhum relatório aqui.'}</Notice> : null}
        {!reports.data && reports.loading ? <Skeleton height={90} /> : null}
        {reports.data?.rows.map((r) => (
          <ReportCard key={r.id} r={r} onAck={() => void acknowledge(r.id)} acking={acking === r.id} />
        ))}
      </div>
      {reports.data ? <Pager page={page} total={reports.data.total} size={PAGE_SIZE} onPage={setPage} /> : null}

      <SectionTitle>Custo da IA</SectionTitle>
      <Card>
        {!c ? (
          <Skeleton height={60} />
        ) : (
          <div className="grid-2">
            <div>
              <h3 className="mini-title">Por mês</h3>
              {c.months.length === 0 ? <p className="faint">Nenhuma chamada ainda.</p> : (
                <ul className="plain-list">
                  {c.months.map((m) => (
                    <li key={m.month}>
                      <span className="mono">{m.month}</span> <strong>{fmtUsd(m.cost_usd)}</strong> <span className="faint">{fmtInt(m.runs)} execuções</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mini-title">Por modelo (este mês)</h3>
              {c.by_model.length === 0 ? <p className="faint">Nenhuma chamada este mês.</p> : (
                <ul className="plain-list">
                  {c.by_model.map((m) => (
                    <li key={m.model}>
                      <span className="mono">{m.model}</span> <strong>{fmtUsd(m.cost_usd)}</strong> <span className="faint">{fmtInt(m.runs)} execuções</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <p className="faint" style={{ marginTop: 10 }}>
          Valores estimados a partir dos tokens usados e da tabela de preços pública; não são a fatura. A fatura real fica no console da Anthropic.
        </p>
      </Card>

      <SectionTitle>Registro recente</SectionTitle>
      <Card flush>
        <DataTable<OpsEvent> caption="Registro de operação" columns={EVENT_COLUMNS} rows={ov.data?.recent_events ?? []} rowKey={(r) => String(r.id)} loading={ov.loading && !ov.data} empty="Nada registrado ainda." />
      </Card>
    </>
  );
}

const INCIDENT_COLUMNS: Column<OpsIncident>[] = [
  { key: 'check', header: 'Onde', cell: (r) => <strong>{checkLabel(r.check)}</strong> },
  { key: 'severity', header: 'Gravidade', cell: (r) => <Pill tone={severityTone(r.severity)}>{severityLabel(r.severity)}</Pill> },
  { key: 'summary', header: 'O que houve', cell: (r) => r.summary },
  { key: 'opened', header: 'Aberto', cell: (r) => <span title={fmtDateTime(r.opened_at)}>{fmtAgo(r.opened_at)}</span> },
  { key: 'alerts', header: 'Alertas', align: 'num', cell: (r) => fmtInt(r.alert_count) },
  { key: 'actions', header: 'Pausas ligadas', cell: (r) => (r.actions.length === 0 ? <span className="faint">nenhuma</span> : r.actions.map((a) => FLAG_INFO[a.flag]?.label ?? a.flag).join(', ')) },
];

const EVENT_COLUMNS: Column<OpsEvent>[] = [
  { key: 'at', header: 'Quando', cell: (r) => <span title={fmtDateTime(r.at)}>{fmtAgo(r.at)}</span> },
  { key: 'kind', header: 'Tipo', cell: (r) => eventKindLabel(r.kind) },
  { key: 'severity', header: 'Gravidade', cell: (r) => <Pill tone={severityTone(r.severity)}>{severityLabel(r.severity)}</Pill> },
  { key: 'who', header: 'Quem', cell: (r) => actorLabel(r.actor) },
  { key: 'summary', header: 'O quê', cell: (r) => r.summary },
];

function ReportCard({ r, onAck, acking }: { r: AiReportRow; onAck: () => void; acking: boolean }) {
  const findings = r.details.findings ?? [];
  return (
    <article className={`card report${r.acknowledged_at ? ' read' : ''}`} aria-label={`Relatório ${severityLabel(r.severity)}: ${r.summary.slice(0, 60)}`}>
      <div className="card-body">
        <div className="report-head">
          <Pill tone={severityTone(r.severity)}>{severityLabel(r.severity)}</Pill>
          <Pill>{reportKindLabel(r.kind)}</Pill>
          {r.details.alerted ? <Pill tone="warn">alerta enviado</Pill> : null}
          <Pill>{r.details.model_used ? `IA: ${r.details.model ?? 'sim'}` : 'sem IA (só verificações)'}</Pill>
          <span className="faint" title={fmtDateTime(r.created_at)}>
            {fmtAgo(r.created_at)}
          </span>
        </div>
        <p className="report-summary">{r.summary}</p>
        {findings.length > 0 ? (
          <ul className="finding-list">
            {findings.map((f, i) => (
              <li key={i}>
                <div className="report-head">
                  <Pill tone={severityTone(f.severity)}>{severityLabel(f.severity)}</Pill>
                  <strong>{categoryLabel(f.category)}</strong>
                  <span className="faint">Conselho: {actionLabel(f.suggested_action)}</span>
                </div>
                <p>{f.summary}</p>
                {f.evidence.length > 0 ? (
                  <p className="chips">
                    {f.evidence.map((e) => (
                      <EvidenceChip key={`${e.type}:${e.id}`} e={e} />
                    ))}
                  </p>
                ) : null}
                {f.gate_note ? <p className="faint">Ajustado pelas regras: {f.gate_note}.</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {r.details.notes && r.details.notes.length > 0 ? <p className="faint">{r.details.notes.join('; ')}.</p> : null}
        <div className="report-foot">
          {r.acknowledged_at ? (
            <span className="faint">Lido {fmtAgo(r.acknowledged_at)}</span>
          ) : (
            <button type="button" className="btn" onClick={onAck} disabled={acking}>
              {acking ? 'Salvando…' : 'Marcar como lido'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
