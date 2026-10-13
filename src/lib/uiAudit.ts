// A self-contained page audit: what a screenshot smoke test would catch by eye, as data. It reads the DOM only (no imports, no closures), so the same
// function runs in the app in DEV (`window.__uiAudit()`, see main.tsx) and is serialised into a browser page by scripts/smoke/ui.mjs.
//
// Findings: raw locale keys on screen, NaN / undefined / [object Object] in visible text, horizontal overflow of the document, and buttons with no accessible name.

export type UiAuditKind = 'raw-key' | 'nan' | 'overflow' | 'unnamed-button';

export interface UiAuditFinding {
  kind: UiAuditKind;
  detail: string;
}

export function uiAudit(keyNamespaces: string[]): UiAuditFinding[] {
  const findings: UiAuditFinding[] = [];
  const add = (kind: UiAuditKind, detail: string) => {
    if (findings.length < 200) findings.push({ kind, detail: detail.replace(/\s+/g, ' ').slice(0, 160) });
  };
  const visible = (el: Element): boolean => {
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // 1 + 2: visible text
  const keyPattern = new RegExp(`(?:^|[^A-Za-z0-9_.])((?:${keyNamespaces.join('|')})\\.[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z0-9_]+)*)`);
  const badPattern = /\bNaN\b|\bundefined\b|\[object Object\]|\bInfinity\b/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    const parent = node.parentElement;
    if (!parent || !text.trim() || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(parent.tagName) || !visible(parent)) continue;
    const key = keyPattern.exec(text);
    if (key) add('raw-key', `${key[1]} in <${parent.tagName.toLowerCase()} class="${parent.className}">`);
    const bad = badPattern.exec(text);
    if (bad) add('nan', `${bad[0]} in "${text.trim().slice(0, 80)}"`);
  }

  // 3: horizontal overflow of the document, with the elements that stick out (ignoring those inside a scroll / clip container)
  const root = document.documentElement;
  if (root.scrollWidth > window.innerWidth + 1) {
    add('overflow', `document ${root.scrollWidth}px wide in a ${window.innerWidth}px viewport`);
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = window.getComputedStyle(p).overflowX;
        if (o !== 'visible') return true;
      }
      return false;
    };
    let shown = 0;
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (shown >= 5) break;
      const rect = el.getBoundingClientRect();
      if ((rect.right > window.innerWidth + 1 || rect.left < -1) && rect.width > 0 && visible(el) && !clipped(el) && window.getComputedStyle(el).position !== 'fixed') {
        add('overflow', `<${el.tagName.toLowerCase()} class="${(el as HTMLElement).className}"> spans ${Math.round(rect.left)}..${Math.round(rect.right)}`);
        shown++;
      }
    }
  }

  // 4: buttons nobody can name
  for (const el of Array.from(document.querySelectorAll('button, [role="button"], a[href], input[type="button"], input[type="submit"]'))) {
    if (!visible(el)) continue;
    const named =
      (el.getAttribute('aria-label') ?? '').trim() ||
      (el.getAttribute('title') ?? '').trim() ||
      (el.getAttribute('aria-labelledby') ? (document.getElementById(el.getAttribute('aria-labelledby')!)?.textContent ?? '').trim() : '') ||
      (el.textContent ?? '').trim() ||
      Array.from(el.querySelectorAll('img')).some((img) => (img.getAttribute('alt') ?? '').trim());
    if (!named) add('unnamed-button', el.outerHTML.slice(0, 140));
  }

  return findings;
}
