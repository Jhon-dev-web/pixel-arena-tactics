import type { ReactNode } from 'react';
import { ratio } from '../lib/format';

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
  shield: 'M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5zM9 12l2 2 4-4',
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

export function Progress({ value, target, label }: { value: number; target: number; label?: string }) {
  const pct = ratio(value, target) * 100;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)} aria-label={label} className="progress">
      <div ref={(el) => { if (el) el.style.width = `${pct}%`; }} />
    </div>
  );
}

/** Horizontal bars: one row per entry, scaled to the largest. */
export function Bars({ rows, format }: { rows: { label: string; value: number; tone?: 1 | 2 | 3 | 4 | 5 | 6 }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="row" key={r.label}>
          <span className="tight" title={r.label}>
            {r.label}
          </span>
          <div className="track">
            <div className={`s${r.tone ?? 1}`} ref={(el) => { if (el) el.style.width = `${(r.value / max) * 100}%`; }} />
          </div>
          <span className="muted">{format(r.value)}</span>
        </div>
      ))}
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
