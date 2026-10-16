import { CSSProperties, KeyboardEvent, ReactNode, useRef } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  // a small red dot (something to see inside)
  dot?: boolean;
  tutorialTarget?: string;
}

// The primary tabs of a screen: a single row on a wide area, a 2 x 2 grid on a narrow one (the container, not the window, decides: the width the screen really has).
// Active = filled gold, inactive = dark with gold text and border. Arrow keys move between the tabs (like a native tablist).
export default function Tabs<T extends string>({ items, value, onChange, label, className = '' }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label?: string; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + items.length) % items.length;
    onChange(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className={`ui-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label} style={{ '--ui-tabs': items.length } as CSSProperties}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          aria-selected={value === it.id}
          tabIndex={value === it.id ? 0 : -1}
          className={`ui-tab${value === it.id ? ' active' : ''}`}
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => onKey(e, i)}
          data-tutorial-target={it.tutorialTarget}
          data-ui
        >
          {it.icon && (
            <span className="ui-tab-icon" aria-hidden>
              {it.icon}
            </span>
          )}
          <span className="ui-tab-label">{it.label}</span>
          {it.dot && <span className="ui-dot" aria-hidden />}
        </button>
      ))}
    </div>
  );
}
