import type { ReactNode } from 'react';
import PageHeader from './PageHeader';

// A small dialog over the game that the player has to answer (a reward to claim, a result): the same look as ModalShell but sized to its content and with no close button.
// `footer` holds the answer buttons and stays in reach while the body scrolls. It wears the old `.modal-backdrop` so the app's stacking stays as it was.
export default function Dialog({
  icon,
  title,
  subtitle,
  footer,
  className = '',
  tone,
  inline,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  className?: string;
  tone?: 'win' | 'lose';
  // Without the dimmed backdrop: the card sits on whatever page holds it (the login gate has its own background).
  inline?: boolean;
  children: ReactNode;
}) {
  const card = (
    <div className={`ui-dialog${tone ? ` ${tone}` : ''}${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="ui-dialog-head">
        <PageHeader icon={icon} title={title} subtitle={subtitle} />
      </div>
      <div className="ui-dialog-body">{children}</div>
      {footer && <div className="ui-dialog-foot">{footer}</div>}
    </div>
  );
  return inline ? card : <div className="modal-backdrop">{card}</div>;
}
