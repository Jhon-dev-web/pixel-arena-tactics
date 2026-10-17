import { useState } from 'react';
import { DataTable, ExportButton, Pager, type Column } from '../components/Table';
import { Bars, Card, Field, Notice, Pill } from '../components/ui';
import { useApp, useAsync, useDebounced } from '../hooks';
import { activeFilterCount, dayEndIso, dayStartIso, defaultLegendaryQuery, EXPORT_PAGE_SIZE } from '../lib/filters';
import { DASH, fmtDateTime, fmtInt, shortId } from '../lib/format';
import { kindLabel, slotLabel, sourceLabel, statusLabel } from '../lib/labels';
import type { LegendaryFilters, LegendaryQuery, LegendaryRow, LegendarySource, LegendaryStatus } from '../lib/types';

const SOURCES: LegendarySource[] = ['forge', 'pity', 'seal', 'drop', 'boss'];
const STATUSES: LegendaryStatus[] = ['held', 'listed', 'sold', 'bound', 'burned', 'revoked'];

const statusTone = (s: string): 'good' | 'warn' | 'info' | 'bad' | undefined => (s === 'listed' ? 'info' : s === 'sold' ? 'warn' : s === 'burned' || s === 'revoked' ? 'bad' : s === 'held' ? 'good' : undefined);

const COLUMNS: Column<LegendaryRow>[] = [
  { key: 'when', header: 'Quando', cell: (r) => fmtDateTime(r.issued_at) },
  { key: 'who', header: 'Quem recebeu', cell: (r) => <strong>{r.username ?? shortId(r.user_id)}</strong> },
  { key: 'item', header: 'Item', cell: (r) => <span>{r.template_id}<div className="faint">{kindLabel(r.kind)}</div></span> },
  { key: 'tier', header: 'Tier', align: 'num', cell: (r) => (r.tier == null ? DASH : r.tier) },
  { key: 'slot', header: 'Slot', cell: (r) => slotLabel(r.slot) },
  { key: 'source', header: 'Origem', cell: (r) => <Pill tone={r.source === 'pity' ? 'info' : undefined}>{sourceLabel(r.source)}</Pill> },
  { key: 'status', header: 'Estado', cell: (r) => <Pill tone={statusTone(r.status)}>{statusLabel(r.status)}</Pill> },
  { key: 'owner', header: 'Dono atual', cell: (r) => (r.status === 'sold' ? <span><strong>{r.current_owner_username ?? shortId(r.current_owner_id)}</strong><div className="faint">{statusLabel(r.current_status)}</div></span> : <span>{r.current_owner_username ?? r.username ?? DASH}</span>) },
  { key: 'id', header: 'Id', cell: (r) => <span className="mono faint">{shortId(r.item_id)}</span> },
];

export default function LegendariesPage() {
  const { api } = useApp();
  const [q, setQ] = useState<LegendaryQuery>(defaultLegendaryQuery());
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const search = useDebounced(q.search, 350);
  const query: LegendaryQuery = { ...q, search, filters: { ...q.filters, from: dayStartIso(fromDay), to: dayEndIso(toDay) } };
  const list = useAsync((a) => a.legendaries(query), [JSON.stringify(query)]);
  const setFilter = (patch: Partial<LegendaryFilters>) => setQ((s) => ({ ...s, page: 0, filters: { ...s.filters, ...patch } }));
  const summary = list.data?.summary;
  const on = activeFilterCount(q.filters) + (fromDay ? 1 : 0) + (toDay ? 1 : 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lendários</h1>
          <p>Todo Lendário e todo item único já emitido: quando, para quem, de onde veio e onde está agora.</p>
        </div>
        <div className="head-actions">
          <ExportButton
            filename="lendarios"
            pageSize={EXPORT_PAGE_SIZE}
            fetchPage={(page) => api.legendaries({ ...query, page, pageSize: EXPORT_PAGE_SIZE })}
            headers={['id', 'emitido_em', 'jogador', 'id_jogador', 'tipo', 'item', 'tier', 'slot', 'origem', 'estado', 'dono_atual', 'estado_atual']}
            toRow={(r) => [r.item_id, r.issued_at, r.username, r.user_id, r.kind, r.template_id, r.tier, r.slot, r.source, r.status, r.current_owner_username, r.current_status]}
          />
        </div>
      </div>

      {summary ? (
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <Card title="Por origem">
            <Bars rows={SOURCES.filter((s) => summary.by_source[s]).map((s, i) => ({ label: sourceLabel(s), value: summary.by_source[s], tone: ((i % 6) + 1) as 1 }))} format={fmtInt} />
            {Object.keys(summary.by_source).length === 0 ? <p className="muted">Nada neste filtro.</p> : null}
          </Card>
          <Card title="Por estado">
            <Bars rows={STATUSES.filter((s) => summary.by_status[s]).map((s, i) => ({ label: statusLabel(s), value: summary.by_status[s], tone: ((i % 6) + 1) as 1 }))} format={fmtInt} />
            {Object.keys(summary.by_status).length === 0 ? <p className="muted">Nada neste filtro.</p> : null}
          </Card>
        </div>
      ) : null}

      <div className="toolbar">
        <div className="grow">
          <Field label="Buscar">
            <input className="input" type="search" placeholder="jogador, item ou id" value={q.search} onChange={(e) => setQ((s) => ({ ...s, search: e.target.value, page: 0 }))} aria-label="Buscar Lendário" />
          </Field>
        </div>
        <Field label="Origem">
          <select className="select" value={q.filters.source ?? ''} onChange={(e) => setFilter({ source: (e.target.value || undefined) as LegendarySource | undefined })}>
            <option value="">Todas</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className="select" value={q.filters.status ?? ''} onChange={(e) => setFilter({ status: (e.target.value || undefined) as LegendaryStatus | undefined })}>
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="select" value={q.filters.kind ?? ''} onChange={(e) => setFilter({ kind: (e.target.value || undefined) as 'gear' | 'unique' | undefined })}>
            <option value="">Todos</option>
            <option value="gear">Equipamento</option>
            <option value="unique">Único</option>
          </select>
        </Field>
        <Field label="Tier">
          <select className="select" value={q.filters.tier ?? ''} onChange={(e) => setFilter({ tier: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Todos</option>
            {[1, 2, 3, 4, 5, 6].map((t) => (
              <option key={t} value={t}>
                Tier {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="De">
          <input className="input" type="date" value={fromDay} onChange={(e) => { setFromDay(e.target.value); setQ((s) => ({ ...s, page: 0 })); }} />
        </Field>
        <Field label="Até">
          <input className="input" type="date" value={toDay} onChange={(e) => { setToDay(e.target.value); setQ((s) => ({ ...s, page: 0 })); }} />
        </Field>
        {on > 0 || q.search ? (
          <button type="button" className="btn ghost" onClick={() => { setQ(defaultLegendaryQuery()); setFromDay(''); setToDay(''); }}>
            Limpar
          </button>
        ) : null}
      </div>

      {list.error ? <Notice tone="bad">Não foi possível carregar: {list.error}</Notice> : null}
      <Card flush>
        <DataTable caption="Lendários e únicos emitidos" columns={COLUMNS} rows={list.data?.rows ?? []} rowKey={(r) => r.item_id} loading={list.loading} empty="Nenhum Lendário com esses filtros." />
        <Pager page={q.page} total={list.data?.total ?? 0} size={q.pageSize} onPage={(page) => setQ((s) => ({ ...s, page }))} />
      </Card>
      <p className="faint" style={{ marginTop: 10 }}>
        “Garantia (pity)” é uma classificação aproximada: uma forja de tier 4+ que veio depois de 40 forjas sem Lendário (calculada pelo histórico de forjas). Peças do Selo nascem vinculadas e não têm certificado. Uma peça vendida mostra o dono atual.
      </p>
    </>
  );
}
