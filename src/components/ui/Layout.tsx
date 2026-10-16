import type { HTMLAttributes, ReactNode } from 'react';

// The frame of a main screen: the page area (it scrolls), the main column and, on a wide area, the summary column on the right. On a narrow area (a phone, a tablet) the summary goes under the main column.
// The width that counts is the screen's own (a container query), not the window's: the sidebar already took its share.
export function Screen({ children, label, className = '', lang, ...rest }: { children: ReactNode; label?: string; className?: string; lang?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'lang'>) {
  return (
    <div className={`ui-screen${className ? ` ${className}` : ''}`} aria-label={label} lang={lang} {...rest}>
      {children}
    </div>
  );
}

export function SummaryColumn({ children }: { children: ReactNode }) {
  return <aside className="ui-side">{children}</aside>;
}

// `sideFirst`: on a narrow area the summary column goes ABOVE the main column (a screen whose summary is what the player acts on first).
export function ScreenLayout({ main, side, sideFirst, className = '', ...rest }: { main: ReactNode; side?: ReactNode; sideFirst?: boolean; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
  return (
    <div className={`ui-layout${side ? ' has-side' : ''}${sideFirst ? ' side-first' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      <div className="ui-main">{main}</div>
      {side && <SummaryColumn>{side}</SummaryColumn>}
    </div>
  );
}
