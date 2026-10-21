import type { ReactNode } from 'react';
import type { AsyncState } from '../hooks';
import { agoFromSeconds } from '../lib/format';
import { clockTime } from '../lib/freshness';
import { Notice, Skeleton } from './ui';

// One block of a page that loads on its own. Four situations are told apart and none can pass for another:
//   loading  nothing yet (a skeleton, announced as busy)
//   failed   the first load failed (an error with its own "Tentar de novo"; never a skeleton, never zeros)
//   stale    a later refresh failed: the PREVIOUS data stays, marked with the time it is from
//   empty    the query worked and there is nothing in it (says so; never drawn as zero revenue or as a quiet "all is well")
export type BlockStatus = 'loading' | 'failed' | 'stale' | 'empty' | 'ready';

export function blockStatus<T>(a: Pick<AsyncState<T>, 'data' | 'error' | 'loading'>, isEmpty?: (data: T) => boolean): BlockStatus {
  if (a.data == null) return a.error ? 'failed' : 'loading';
  if (a.error) return 'stale';
  if (isEmpty?.(a.data)) return 'empty';
  return 'ready';
}

export function AsyncBlock<T>({
  state,
  label,
  isEmpty,
  empty,
  skeleton = 120,
  now,
  children,
}: {
  state: AsyncState<T>;
  /** What this block is, for the messages: "os números do jogo", "os gráficos". */
  label: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  skeleton?: number;
  now: number;
  children: (data: T) => ReactNode;
}) {
  const status = blockStatus(state, isEmpty);
  const retry = (
    <button type="button" className="btn" onClick={() => state.reload()} disabled={state.loading}>
      {state.loading ? 'Tentando…' : 'Tentar de novo'}
    </button>
  );
  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-label={`Carregando ${label}`}>
        <Skeleton height={skeleton} />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <Notice tone="bad">
        Não foi possível carregar {label}: {state.error ?? 'sem resposta'}. Nenhum número foi inventado no lugar. {retry}
      </Notice>
    );
  }
  const data = state.data as T;
  if (status === 'empty') return <Notice>{empty ?? `Nada para mostrar em ${label}.`}</Notice>;
  return (
    <>
      {status === 'stale' ? (
        <Notice tone="warn">
          Não foi possível atualizar {label}: {state.error}. Abaixo estão os dados anteriores, da consulta das {clockTime(state.loadedAt)}
          {state.loadedAt ? ` (${agoFromSeconds((now - state.loadedAt) / 1000)})` : ''}; podem estar desatualizados. {retry}
        </Notice>
      ) : null}
      {children(data)}
    </>
  );
}

/** The line near a block: when the query ran, how old the aggregated part is, and what the numbers mean. */
export function Freshness({ queriedAt, aggregatedAt, aggregateLate, aggregateNote, note }: { queriedAt: number | null; aggregatedAt?: string | null; aggregateLate?: boolean; aggregateNote?: string; note?: ReactNode }) {
  return (
    <p className="freshness">
      <span>Consulta atualizada às {clockTime(queriedAt)}</span>
      {aggregateNote !== undefined ? (
        <span className={aggregateLate ? 'late' : undefined}>
          {' · '}
          {aggregatedAt ? `dados agregados até ${formatAggregated(aggregatedAt)}${aggregateLate ? ' (atrasado)' : ''}` : 'dados agregados: a rotina ainda não rodou'}
          {aggregateNote ? ` (${aggregateNote})` : ''}
        </span>
      ) : null}
      {note ? <span> · {note}</span> : null}
    </p>
  );
}

function formatAggregated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', '');
}
