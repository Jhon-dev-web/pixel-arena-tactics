import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tabs } from './ui';
import type { TabItem } from './ui';

// The tab strip of a menu entry that holds several screens (Herói, Profissões, Loja). It sits above the screen, one tap from each sibling.
// A screen that is a page gets the strip in the flow above it. A screen that is a modal (mining, garden, shop...) has its own frame that this file does not own, so the strip is placed
// inside that frame, under its header, by `modalSelector` (a portal into the dialog that is already on screen); the modal itself is untouched.
export default function SectionTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  modalSelector,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  modalSelector?: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!modalSelector) return;
    const dialog = document.querySelector<HTMLElement>(modalSelector);
    const head = dialog?.querySelector<HTMLElement>(':scope > .ui-modal-head');
    if (!dialog || !head) return;
    const el = document.createElement('div');
    el.className = 'nav-tabs-host';
    head.after(el);
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
  }, [modalSelector]);

  const strip = <Tabs items={items} value={value} onChange={onChange} label={label} className="nav-tabs" />;
  if (!modalSelector) return <div className="nav-tabs-bar">{strip}</div>;
  return host ? createPortal(strip, host) : null;
}
