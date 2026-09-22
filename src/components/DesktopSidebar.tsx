import { ReactNode } from 'react';

export interface DesktopNavItem {
  key: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: boolean;
  onClick: () => void;
  tutorialTarget?: string;
}

// A section of the sidebar. `header` is optional: the top group (Personagem/Caça/Masmorra) and the
// bottom one (Configurações) render with no label, matching the approved sidebar structure.
export interface DesktopNavGroup {
  key: string;
  header?: string;
  items: DesktopNavItem[];
}

// Vertical nav shared by desktop (fixed, >=1024px) and mobile (inside MobileDrawer, <1024px) — same
// items/order/icons/active state everywhere, see App.tsx. Icon + label rows so it reads fine at its
// current width; the row markup already separates icon/label into their own elements, so a future
// "collapse to icon-only" toggle is just a CSS class away — no restructuring needed later.
export default function DesktopSidebar({ groups, onLogoClick }: { groups: DesktopNavGroup[]; onLogoClick?: () => void }) {
  return (
    <nav className="desktop-sidebar" aria-label="Main navigation">
      {onLogoClick ? (
        <button className="desktop-sidebar-brand desktop-sidebar-brand-btn" onClick={onLogoClick} data-ui>
          ARENA DUEL
        </button>
      ) : (
        <div className="desktop-sidebar-brand">ARENA DUEL</div>
      )}
      <div className="desktop-sidebar-items">
        {groups.map((group) => (
          <div className="desktop-sidebar-group" key={group.key}>
            {group.header && <div className="desktop-sidebar-group-title">{group.header}</div>}
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`desktop-nav-item${item.active ? ' active' : ''}`}
                onClick={item.onClick}
                data-tutorial-target={item.tutorialTarget}
                data-ui
              >
                {item.active && <span className="desktop-nav-indicator" />}
                <span className="desktop-nav-icon">{item.icon}</span>
                <span className="desktop-nav-label">{item.label}</span>
                {item.badge && <span className="desktop-nav-badge" />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
