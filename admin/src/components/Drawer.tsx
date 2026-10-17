import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './ui';

/** A side panel. Closes with Escape or a click on the dark area; focus goes into it when it opens and back to the opener when it closes. */
export function Drawer({ title, subtitle, onClose, children }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="muted">{subtitle}</div> : null}
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  );
}
