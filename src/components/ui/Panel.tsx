import type { HTMLAttributes, ReactNode } from 'react';

// A dark panel with a thin gold border and a slight inner glow. With a `title` it gets the title bar (gold pixel caps over a thin divider, an optional icon and actions on the right).
// `tone`: 'plain' (default), 'inset' (a recessed box inside another panel), 'gold' (a highlighted panel, like the market's Gold Pouch cards).
export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  tone?: 'plain' | 'inset' | 'gold';
  as?: 'section' | 'div' | 'aside' | 'article';
  children?: ReactNode;
}

export default function Panel({ title, icon, actions, tone = 'plain', as: Tag = 'section', className = '', children, ...rest }: PanelProps) {
  return (
    <Tag className={`ui-panel${tone === 'plain' ? '' : ` ${tone}`}${className ? ` ${className}` : ''}`} {...rest}>
      {title && (
        <div className="ui-panel-head">
          {icon && (
            <span className="ui-panel-icon" aria-hidden>
              {icon}
            </span>
          )}
          <h3 className="ui-panel-title">{title}</h3>
          {actions && <div className="ui-panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
