import type { ReactNode } from 'react';

// One line of a summary: an optional small icon, the label on the left, the value on the right (like "Minhas ofertas ativas  3"). Put them inside a StatList (a <dl>).
export function StatRow({ icon, label, value, tone = 'plain', hint }: { icon?: ReactNode; label: ReactNode; value: ReactNode; tone?: 'plain' | 'gold' | 'good' | 'bad' | 'rune'; hint?: string }) {
  return (
    <div className="ui-stat" title={hint}>
      {icon && (
        <span className="ui-stat-icon" aria-hidden>
          {icon}
        </span>
      )}
      <dt className="ui-stat-label">{label}</dt>
      <dd className={`ui-stat-value${tone === 'plain' ? '' : ` ${tone}`}`}>{value}</dd>
    </div>
  );
}

export function StatList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <dl className={`ui-statlist${className ? ` ${className}` : ''}`}>{children}</dl>;
}
