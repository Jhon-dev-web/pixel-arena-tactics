import type { ReactNode } from 'react';

export interface ChipItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
}

// A filter row: small rounded chips (the active one has the gold border and a warm fill), wrapping on a narrow screen. A group of toggle buttons (aria-pressed), not tabs: it filters a list, it does not switch a page.
export default function ChipRow<T extends string>({ items, value, onChange, label, className = '' }: { items: ChipItem<T>[]; value: T; onChange: (id: T) => void; label?: string; className?: string }) {
  return (
    <div className={`ui-chips${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} className={`ui-chip${value === it.id ? ' active' : ''}`} aria-pressed={value === it.id} onClick={() => onChange(it.id)} data-ui>
          {it.icon && (
            <span className="ui-chip-icon" aria-hidden>
              {it.icon}
            </span>
          )}
          {it.label}
        </button>
      ))}
    </div>
  );
}

// A static label chip (a state or a tag: "Equipado", "Nv 40")
export function Chip({ tone = 'plain', children }: { tone?: 'plain' | 'gold' | 'good' | 'bad' | 'info'; children: ReactNode }) {
  return <span className={`ui-tag ${tone}`}>{children}</span>;
}
