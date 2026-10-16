import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

// A pixel magnifier (drawn with squares: it stays sharp at any zoom and needs no image file)
function MagnifierIcon() {
  return (
    <svg className="ui-field-icon" viewBox="0 0 12 12" width="16" height="16" shapeRendering="crispEdges" aria-hidden>
      <path fill="currentColor" d="M3 1h4v1h1v1h1v4H8v1H7v1H3V8H2V7H1V3h1V2h1V1zm1 1v1H3v1H2v2h1v1h1v1h2V7h1V6h1V4H8V3H7V2H4zM8 8h1v1h1v1h1v1h-1v-1H9V9H8V8z" />
    </svg>
  );
}

// The search box of a list: the magnifier and an input without its own border (the wrapper draws it, so the focus ring shows on the whole box)
export function SearchField({ label, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`ui-field search${className ? ` ${className}` : ''}`}>
      <MagnifierIcon />
      <input type="search" autoComplete="off" spellCheck={false} aria-label={label} {...rest} />
    </label>
  );
}

// A labelled select, styled like the search box
export function SelectField({ label, children, className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className={`ui-field select${className ? ` ${className}` : ''}`}>
      <select aria-label={label} {...rest}>
        {children}
      </select>
    </label>
  );
}
