import type { ReactNode } from 'react';
import PageHeader from './PageHeader';

// A big work surface that opens over the game (the Inventory, the Forge): the page header (icon, title, subtitle, the close button as its last action) and a body that scrolls on its own.
// It wears the old `.modal-backdrop` so the app's Escape handling and stacking stay as they were; the dialog is a wide panel on a desktop and almost the whole screen on a phone.
export default function ModalShell({
  icon,
  title,
  subtitle,
  actions,
  closeLabel,
  onClose,
  className = '',
  tutorialTarget,
  footer,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  className?: string;
  tutorialTarget?: string;
  // A bar that stays in reach under the scrolling body (a primary action, a purchase).
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop">
      <div className={`ui-modal${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} data-tutorial-target={tutorialTarget}>
        <div className="ui-modal-head">
          <PageHeader
            icon={icon}
            title={title}
            subtitle={subtitle}
            actions={
              <>
                {actions}
                <button className="ui-modal-close" onClick={onClose} aria-label={closeLabel} data-ui>
                  ✕
                </button>
              </>
            }
          />
        </div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
