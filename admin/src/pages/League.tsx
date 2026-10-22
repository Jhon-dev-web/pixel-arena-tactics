import { useState } from 'react';
import { DataTable, ExportButton, Pager, type Column } from '../components/Table';
import { Card, CountTable, Field, Kpi, Notice, Pill, SectionTitle, Skeleton } from '../components/ui';
import { useApp, useAsync, useDebounced } from '../hooks';
import { defaultFlagsQuery, EXPORT_PAGE_SIZE } from '../lib/filters';
import { DASH, fmtDateTime, fmtInt, fmtPercent, shortId } from '../lib/format';
import { passSourceLabel, seasonStatusLabel } from '../lib/labels';
import type { FlagRow, FlagsQuery, LeagueRow } from '../lib/types';

const TOP = 50;

const RANK_COLUMNS: Column<LeagueRow>[] = [
  { key: 'r', header: '#', align: 'num', cell: (r) => r.audit_rank },
  { key: 'u', header: 'Jogador', cell: (r) => <strong>{r.username ?? shortId(r.user_id)}</strong> },
  { key: 'l', header: 'Nível', align: 'num', cell: (r) => (r.paragon_level ? `100 + P${r.paragon_level}` : r.hero_level) },
  { key: 'f', header: 'Andar', align: 'num', cell: (r) => r.highest_floor },
  { key: 'd', header: 'Profundeza', align: 'num', cell: (r) => r.deepest_depth },
  { key: 's', header: 'Pontos', align: 'num', cell: (r) => fmtInt(r.score) },
  { key: 'e', header: 'No ranking público', cell: (r) => (r.disqualified ? <Pill tone="bad">desqualificado</Pill> : r.eligible ? <Pill tone="good">sim</Pill> : <Pill tone="warn">fora{!r.has_pass ? ' (sem Passe real)' : ''}</Pill>) },
  { key: 'a', header: 'Alertas', cell: (r) => (r.open_flags || r.item_flags || r.entry_flags.length ? <span className="mono">{[...(r.entry_flags ?? []), r.item_flags ? 'itens' : ''].filter(Boolean).join(', ') || 'aberto'}</span> : <span className="faint">—</span>) },
  { key: 't', header: 'Alcançou em', cell: (r) => fmtDateTime(r.tiebreak_at) },
];

const FLAG_COLUMNS: Column<FlagRow>[] = [
  { key: 'u', header: 'Jogador', cell: (r) => <strong>{r.username ?? shortId(r.user_id)}</strong> },
  { key: 'lv', header: 'Nível', align: 'num', cell: (r) => (r.hero_level == null ? DASH : r.paragon_level ? `${r.hero_level} + P${r.paragon_level}` : r.hero_level) },
  { key: 'fl', header: 'Sinalizados', align: 'num', cell: (r) => r.flagged_snapshots },
  { key: 'rj', header: 'Rejeitados', align: 'num', cell: (r) => r.rejected_snapshots },
  { key: 'rs', header: 'Motivos', cell: (r) => <span className="mono">{r.reasons.join(', ') || DASH}</span> },
  { key: 'it', header: 'Alertas de itens', cell: (r) => (r.item_codes.length ? <span className="mono">{r.item_codes.join(', ')}</span> : <span className="faint">—</span>) },
  { key: 'dq', header: 'Estado', cell: (r) => (r.disqualified ? <Pill tone="bad">desqualificado</Pill> : <Pill tone="warn">em análise</Pill>) },
  { key: 'ps', header: 'Passe', cell: (r) => passSourceLabel(r.pass_source) },
  { key: 'la', header: 'Último alerta', cell: (r) => fmtDateTime(r.last_flag_at) },
];

export default function LeaguePage() {
  const { api } = useApp();
  const league = useAsync((a) => a.league(null, TOP), []);
  const [fq, setFq] = useState<FlagsQuery & { text: string }>({ ...defaultFlagsQuery(), text: '' });
  const text = useDebounced(fq.text, 350);
  const flagsQuery: FlagsQuery = { page: fq.page, pageSize: fq.pageSize, kind: fq.kind, search: text };
  const flags = useAsync((a) => a.flags(flagsQuery), [JSON.stringify(flagsQuery)]);
  const L = league.data;
  const goal = L?.goal;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Liga</h1>
          <p>Estado da temporada, meta do Passe, o topo do ranking e a fila de auditoria antifraude.</p>
        </div>
      </div>

      {league.error ? <Notice tone="bad">Não foi possível carregar: {league.error}</Notice> : null}
      {!L ? (
        <Skeleton height={160} />
      ) : (
        <>
          <div className="grid-2">
            <Card title={L.season ? `${L.season.kind === 'pre' ? 'Pré-temporada' : `Temporada ${L.season.number}`} — ${seasonStatusLabel(L.season.status)}` : 'Nenhuma temporada aberta'}>
              <div className="stack">
                {L.season ? (
                  <div className="muted">
                    {L.season.starts_at ? `Abre ${fmtDateTime(L.season.starts_at)} · congela ${fmtDateTime(L.season.freeze_at)} · termina ${fmtDateTime(L.season.ends_at)}` : 'Ainda sem datas: a temporada paga abre quando a meta de Passes é atingida.'}
                    {L.season.prize_note ? <div>Prêmio: {L.season.prize_note}</div> : null}
                  </div>
                ) : (
                  <div className="muted">Nenhuma temporada aberta ou congelada.</div>
                )}
                <div className="kpis">
                  <Kpi label="Inscritos" value={fmtInt(L.counts.entries)} sub={`${fmtInt(L.counts.with_score)} com pontos`} />
                  <Kpi label="Entradas sinalizadas" value={fmtInt(L.counts.flagged)} tone={L.counts.flagged ? 'warn' : undefined} />
                  <Kpi label="Desqualificadas" value={fmtInt(L.counts.disqualified)} tone={L.counts.disqualified ? 'bad' : undefined} />
                </div>
              </div>
            </Card>
            <Card title="Meta de Passes pagos">
              {goal ? (
                <div className="stack">
                  <div>
                    <strong>{fmtInt(goal.paid)}</strong> de {fmtInt(goal.target)} ({fmtPercent(goal.target ? goal.paid / goal.target : 0, 1)})
                  </div>
                  <div className="muted">{goal.opened_at ? `A Liga paga abriu em ${fmtDateTime(goal.opened_at)}.` : 'A Liga paga ainda não abriu.'} {goal.reset_at ? `Reinício da Liga: ${fmtDateTime(goal.reset_at)}.` : ''}</div>
                </div>
              ) : (
                <p className="muted">Meta não configurada.</p>
              )}
            </Card>
          </div>

          <SectionTitle>Topo do ranking (auditoria)</SectionTitle>
          <Card flush title={`Os ${TOP} primeiros por pontos`} note="“No ranking público” diz se o jogador aparece no ranking dos jogadores">
            <DataTable caption="Topo do ranking da Liga" columns={RANK_COLUMNS} rows={L.top} rowKey={(r) => r.user_id} empty="Ninguém pontuou ainda." />
          </Card>
        </>
      )}

      <SectionTitle>Fila de auditoria</SectionTitle>
      <div className="toolbar">
        <div className="grow">
          <Field label="Buscar jogador">
            <input className="input" type="search" placeholder="nome ou id" value={fq.text} onChange={(e) => setFq((s) => ({ ...s, text: e.target.value, page: 0 }))} aria-label="Buscar jogador sinalizado" />
          </Field>
        </div>
        <Field label="Tipo">
          <select className="select" value={fq.kind ?? ''} onChange={(e) => setFq((s) => ({ ...s, page: 0, kind: (e.target.value || undefined) as FlagsQuery['kind'] }))}>
            <option value="">Todos</option>
            <option value="progress">Progresso</option>
            <option value="items">Itens</option>
            <option value="disqualified">Desqualificados</option>
          </select>
        </Field>
        <ExportButton
          filename="liga-alertas"
          pageSize={EXPORT_PAGE_SIZE}
          fetchPage={(page) => api.flags({ ...flagsQuery, page, pageSize: EXPORT_PAGE_SIZE })}
          headers={['id', 'jogador', 'nivel', 'paragon', 'sinalizados', 'rejeitados', 'motivos', 'alertas_itens', 'desqualificado', 'passe', 'ultimo_alerta']}
          toRow={(r) => [r.user_id, r.username, r.hero_level, r.paragon_level, r.flagged_snapshots, r.rejected_snapshots, r.reasons.join(' '), r.item_codes.join(' '), r.disqualified, r.pass_source, r.last_flag_at]}
        />
      </div>
      <div className="grid-wide">
        <Card flush>
          {flags.error ? <Notice tone="bad">{flags.error}</Notice> : null}
          <DataTable caption="Jogadores sinalizados" columns={FLAG_COLUMNS} rows={flags.data?.rows ?? []} rowKey={(r) => r.user_id} loading={flags.loading} empty="Nenhum jogador com alerta aberto." />
          <Pager page={fq.page} total={flags.data?.total ?? 0} size={fq.pageSize} onPage={(page) => setFq((s) => ({ ...s, page }))} />
        </Card>
        <Card title="Motivos mais comuns" note="jogadores por código">
          {flags.data && flags.data.reasons.length ? <CountTable caption="Motivos mais comuns" head="Código" rows={flags.data.reasons.slice(0, 10).map((r) => ({ label: r.code, value: r.players }))} format={fmtInt} /> : <p className="muted">Sem alertas.</p>}
        </Card>
      </div>
      <p className="faint" style={{ marginTop: 10 }}>
        Um alerta é “aberto” quando um envio de progresso foi sinalizado ou rejeitado depois do reinício da Liga e você ainda não o liberou. A liberação é feita por SQL (public.progress_clear_flags), este painel só lê.
      </p>
    </>
  );
}
