// Flashes the part of a screen a suggestion points to ("Ir" on the Home next step, the level-up banner's button). The target is looked up by name among elements marked
// data-highlight (or data-tutorial-target, which the modals already carry); the screen it lives on opens in the same click, so the lookup retries for about a second.
// Reduced motion: the ring is drawn without the pulse (App.css .ui-highlight).
export const HIGHLIGHT_MS = 2400;
const RETRY_MS = 80;
const RETRIES = 14;

const find = (names: string[]): HTMLElement | null => {
  for (const name of names) {
    const el = document.querySelector<HTMLElement>(`[data-highlight="${name}"], [data-tutorial-target="${name}"]`);
    if (el && el.getClientRects().length > 0) return el;
  }
  return null;
};

export function highlightTarget(names: string[]): void {
  if (names.length === 0 || typeof document === 'undefined') return;
  let tries = 0;
  const attempt = () => {
    const el = find(names);
    if (!el) {
      if (++tries <= RETRIES) window.setTimeout(attempt, RETRY_MS);
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('ui-highlight');
    void el.offsetWidth; // restart the animation when the same element is flashed twice
    el.classList.add('ui-highlight');
    window.setTimeout(() => el.classList.remove('ui-highlight'), HIGHLIGHT_MS);
  };
  window.setTimeout(attempt, 0);
}
