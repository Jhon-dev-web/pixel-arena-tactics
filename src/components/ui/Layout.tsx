import type { ReactNode } from 'react';

// The frame of a main screen: the page area (it scrolls), the main column and, on a wide area, the summary column on the right. On a narrow area (a phone, a tablet) the summary goes under the main column.
// The width that counts is the screen's own (a container query), not the window's: the sidebar already took its share.
export function Screen({ children, label, className = '', lang }: { children: ReactNode; label?: string; className?: string; lang?: string }) {
  return (
    <div className={`ui-screen${className ? ` ${className}` : ''}`} aria-label={label} lang={lang}>
      {children}
    </div>
  );
}

export function SummaryColumn({ children }: { children: ReactNode }) {
  return <aside className="ui-side">{children}</aside>;
}

export function ScreenLayout({ main, side, className = '' }: { main: ReactNode; side?: ReactNode; className?: string }) {
  return (
    <div className={`ui-layout${side ? ' has-side' : ''}${className ? ` ${className}` : ''}`}>
      <div className="ui-main">{main}</div>
      {side && <SummaryColumn>{side}</SummaryColumn>}
    </div>
  );
}
