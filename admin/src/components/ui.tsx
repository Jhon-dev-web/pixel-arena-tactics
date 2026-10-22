import type { ReactNode } from 'react';
import { playerPassState } from '../lib/aggregate';
import { passSourceLabel } from '../lib/labels';
import type { PlayerRow } from '../lib/types';
import { fmtPercent } from '../lib/format';

const PATHS: Record<string, string> = {
  overview: 'M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z',
  players: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  legendary: 'M12 2l3 6.5 7 1-5 5 1.2 7L12 18l-6.2 3.5L7 14.5l-5-5 7-1z',
  market: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6',
  economy: 'M12 2v20M17 6.5C17 4.8 14.8 4 12 4S7 4.8 7 6.5 9 9 12 10s5 1.7 5 3.5S14.8 17 12 17s-5-.8-5-2.5',
  league: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  waitlist: 'M4 4h16v16H4zM4 9h16M9 4v16',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  close: 'M18 6L6 18M6 6l12 12',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  ticket: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
  shield: 'M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5zM9 12l2 2 4-4',
  home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
  tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  userplus: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
  scroll: 'M8 3h11a2 2 0 0 1 2 2v2h-4M8 3a2 2 0 0 0-2 2v12a3 3 0 0 1-3 3h12a3 3 0 0 0 3-3V7M10 8h5M10 12h5',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M15 9.5c0-1-1.3-1.6-3-1.6s-3 .6-3 1.7 1.2 1.6 3 2 3 .9 3 2-1.3 1.7-3 1.7-3-.6-3-1.6',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Kpi({ label, value, sub, tone, live }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad'; live?: boolean }) {
  return (
    <div className={`card kpi ${tone ?? ''}`}>
      <div className="label">
        {live ? <span className="dot live" aria-hidden="true" /> : null}
        {label}
      </div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Card({ title, note, actions, flush, children }: { title?: string; note?: ReactNode; actions?: ReactNode; flush?: boolean; children: ReactNode }) {
  return (
    <section className={`card ${flush ? 'flush' : ''}`}>
      {title || actions ? (
        <div className="card-head">
          <h2>{title}</h2>
          <div className="note">{actions ?? note}</div>
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="section-title">{children}</h2>;
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'info' }) {
  return <span className={`pill ${tone ?? ''}`}>{children}</span>;
}

export function Skeleton({ height = 20, width }: { height?: number; width?: string }) {
  return <div className="skeleton" role="presentation" ref={(el) => { if (el) { el.style.height = `${height}px`; if (width) el.style.width = width; } }} />;
}

export function Notice({ tone, children }: { tone?: 'warn' | 'bad'; children: ReactNode }) {
  return (
    <div className={`notice ${tone ?? ''}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** Counts as a plain table, one row per entry, with an optional share column. No bars: the owner wants only data (21/10/2026). */
export function CountTable({ rows, format, caption, head = 'Item', share }: { rows: { label: string; value: number }[]; format: (n: number) => string; caption: string; head?: string; share?: boolean }) {
  const total = rows.reduce((t, r) => t + r.value, 0);
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{head}</th>
            <th scope="col" className="num">Quantidade</th>
            {share ? <th scope="col" className="num">%</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{format(r.value)}</td>
              {share ? <td className="num">{total ? fmtPercent(r.value / total, 1) : '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ExternalLink({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title={title}>
      {children}
    </a>
  );
}

export function DefList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The Pass of one account in a table cell: valid this season (with its origin and real/test), expired (had one that no longer covers the season), unknown (the database does not say: migration 0026 not applied) or none.
 * "Válido" is what the game uses for the perks; the ranking line is the separate ranking rule (a test-mode Pass does not rank).
 */
export function PassBadge({ p }: { p: Pick<PlayerRow, 'pass_source' | 'pass_livemode' | 'pass_valid_now' | 'pass_ranking' | 'pass_history' | 'pass_valid_through'> }) {
  const state = playerPassState(p);
  if (state === 'none') return <span className="faint">sem Passe</span>;
  const real = p.pass_livemode || p.pass_source === 'grant';
  const origin = `${passSourceLabel(p.pass_source)}${real ? '' : ' (teste)'}`;
  if (state === 'valid') {
    return (
      <span>
        <Pill tone={real ? 'good' : 'warn'}>Válido</Pill>
        <div className="faint">{origin}</div>
        {p.pass_ranking === false ? <div className="faint">fora do ranking</div> : null}
      </span>
    );
  }
  if (state === 'expired') {
    return (
      <span>
        <Pill tone="warn">Expirado</Pill>
        <div className="faint">{p.pass_valid_through ? `valeu até a Temporada ${p.pass_valid_through}` : 'sem validade agora'} · {origin}</div>
      </span>
    );
  }
  return (
    <span>
      <Pill>Histórico</Pill>
      <div className="faint">{origin} · validade desconhecida</div>
    </span>
  );
}
