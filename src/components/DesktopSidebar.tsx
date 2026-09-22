import { ReactNode } from 'react';

export interface DesktopNavItem {
  key: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: boolean;
  onClick: () => void;
}

// Desktop-only vertical nav (>=1024px, see useIsDesktop). Icon + label rows so it reads fine at its
// current width; the row markup already separates icon/label into their own elements, so a future
// "collapse to icon-only" toggle is just a CSS class away — no restructuring needed later.
export default function DesktopSidebar({ items }: { items: DesktopNavItem[] }) {
  return (
    <nav className="desktop-sidebar" aria-label="Main navigation">
      <div className="desktop-sidebar-brand">ARENA DUEL</div>
      <div className="desktop-sidebar-items">
        {items.map((item) => (
          <button
            key={item.key}
            className={`desktop-nav-item${item.active ? ' active' : ''}`}
            onClick={item.onClick}
            data-ui
          >
            {item.active && <span className="desktop-nav-indicator" />}
            <span className="desktop-nav-icon">{item.icon}</span>
            <span className="desktop-nav-label">{item.label}</span>
            {item.badge && <span className="desktop-nav-badge" />}
          </button>
        ))}
      </div>
    </nav>
  );
}
