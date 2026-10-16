import type { ReactNode } from 'react';

// The head of a screen, like the market's: a large icon, a big pixel title, a one-line subtitle and a slot for the actions (a chip, a refresh button...) on the right.
// `icon` is any node (an <img className="ui-icon-img">, an emoji, an svg); it is decorative, the title carries the meaning.
export default function PageHeader({ icon, title, subtitle, actions, headingId }: { icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; headingId?: string }) {
  return (
    <header className="ui-pagehead">
      {icon && (
        <span className="ui-pagehead-icon" aria-hidden>
          {icon}
        </span>
      )}
      <div className="ui-pagehead-text">
        <h2 className="ui-pagehead-title" id={headingId}>
          {title}
        </h2>
        {subtitle && <p className="ui-pagehead-sub">{subtitle}</p>}
      </div>
      {actions && <div className="ui-pagehead-actions">{actions}</div>}
    </header>
  );
}
