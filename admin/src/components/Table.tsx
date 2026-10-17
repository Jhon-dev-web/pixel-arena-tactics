import { useState, type ReactNode } from 'react';
import { csvFilename, downloadCsv, toCsv } from '../lib/csv';
import { fetchAllRows, pageCount } from '../lib/filters';
import { fmtInt } from '../lib/format';
import { Icon } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell content on screen. */
  cell: (row: T) => ReactNode;
  align?: 'num';
  /** Present when the database can sort by this column. */
  sortKey?: string;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty = 'Nada para mostrar.',
  sort,
  onSort,
  onRowClick,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: string;
  sort?: SortState;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  caption: string;
}) {
  return (
    <div className="table-wrap" aria-busy={loading ? 'true' : 'false'}>
      <table className="data">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort && c.sortKey === sort.key;
              return (
                <th key={c.key} className={c.align === 'num' ? 'num' : ''} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortKey && onSort ? (
                    <button type="button" onClick={() => onSort(c.sortKey!)}>
                      {c.header}
                      {active ? <span className="sort">{sort!.dir === 'asc' ? '▲' : '▼'}</span> : null}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="empty" colSpan={columns.length}>
                {loading ? 'Carregando…' : empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'click' : ''}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'num' ? 'num' : ''}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (page: number) => void }) {
  const pages = pageCount(total, size);
  const from = total === 0 ? 0 : page * size + 1;
  const to = Math.min(total, (page + 1) * size);
  return (
    <div className="pager">
      <span>
        {fmtInt(from)}–{fmtInt(to)} de {fmtInt(total)}
      </span>
      <div className="btns">
        <button type="button" className="btn" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          Anterior
        </button>
        <span style={{ alignSelf: 'center' }}>
          {page + 1} / {pages}
        </span>
        <button type="button" className="btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Próxima
        </button>
      </div>
    </div>
  );
}

/**
 * "Exportar CSV": reads every page the current filters match (up to 10,000 rows) and saves one file. `headers` and `toRow` define the columns of the file.
 */
export function ExportButton<T>({
  filename,
  fetchPage,
  pageSize,
  headers,
  toRow,
  disabled,
}: {
  filename: string;
  fetchPage: (page: number) => Promise<{ total: number; rows: T[] }>;
  pageSize: number;
  headers: string[];
  toRow: (row: T) => unknown[];
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const { rows, truncated, total } = await fetchAllRows(fetchPage, pageSize);
      downloadCsv(csvFilename(filename), toCsv(headers, rows.map(toRow)));
      setNote(truncated ? `Exportadas as primeiras ${fmtInt(rows.length)} de ${fmtInt(total)} linhas.` : `${fmtInt(rows.length)} linhas exportadas.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Falha ao exportar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button type="button" className="btn" onClick={run} disabled={busy || disabled}>
        <Icon name="download" />
        {busy ? 'Exportando…' : 'Exportar CSV'}
      </button>
      {note ? (
        <span className="muted" role="status">
          {note}
        </span>
      ) : null}
    </span>
  );
}
