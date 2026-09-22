import { useEffect } from 'react';
import { ReactNode } from 'react';

// Mobile/tablet (<1024px) nav drawer: slides in from the left, dims the rest of the screen, and
// renders whatever's passed as children — in practice the exact same <DesktopSidebar> used for the
// fixed desktop sidebar, so mobile always shows the identical items/order/icons/active state (see
// App.tsx). Closes on the X, on tapping the overlay, on Escape, or when a nav item is picked
// (App.tsx's onClick handlers already call the close setter).
export default function MobileDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mobile-drawer-overlay" onClick={onClose}>
      <div className="mobile-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
        <button className="mobile-drawer-close" onClick={onClose} aria-label="Close menu" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
