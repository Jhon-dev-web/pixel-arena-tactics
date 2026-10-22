import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true');
}

/**
 * A side panel, built as a real modal dialog:
 *  - it is rendered at the end of <body>, and every other child of <body> (the whole app) is made `inert` and `aria-hidden` while it is open, so nothing behind it can be reached by Tab, click or screen reader;
 *  - Tab and Shift+Tab stay inside the panel (a loop), whatever is focused;
 *  - focus moves into the panel when it opens and goes BACK to the element that opened it when it closes (a table row, for instance);
 *  - Escape and a click on the dark area close it.
 */
export function Drawer({ title, subtitle, header, onClose, children }: { title: string; subtitle?: ReactNode; /** Replaces the default title row (it must bring its own close button). */ header?: (close: () => void) => ReactNode; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const mine = root.current;
    const dialog = panel.current;

    // Everything else on the page becomes unreachable. The previous attribute values are restored on close.
    const saved: { el: Element; inert: string | null; hidden: string | null }[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === mine || el.tagName === 'SCRIPT') continue;
      saved.push({ el, inert: el.getAttribute('inert'), hidden: el.getAttribute('aria-hidden') });
      el.setAttribute('inert', '');
      el.setAttribute('aria-hidden', 'true');
    }
    dialog?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = focusables(dialog);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    // If focus ever lands outside (a script, a click on the browser chrome and back), pull it back in.
    const onFocusIn = (e: FocusEvent) => {
      if (dialog && e.target instanceof Node && !dialog.contains(e.target)) dialog.focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      for (const s of saved) {
        if (s.inert === null) s.el.removeAttribute('inert');
        else s.el.setAttribute('inert', s.inert);
        if (s.hidden === null) s.el.removeAttribute('aria-hidden');
        else s.el.setAttribute('aria-hidden', s.hidden);
      }
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div ref={root} className="drawer-root">
      <div className="scrim" onClick={() => closeRef.current()} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        {header ? header(() => closeRef.current()) : <div className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="muted">{subtitle}</div> : null}
          </div>
          <button type="button" className="btn ghost" onClick={() => closeRef.current()} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </div>}
        <div className="drawer-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
