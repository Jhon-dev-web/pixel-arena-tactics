import { useEffect, useRef } from 'react';

export type ConfirmKeyAction = 'confirm' | 'cancel' | null;

// What a key does while a confirmation is showing: Escape cancels it, Enter confirms it. Enter is left alone on a button / link / select / textarea (the
// control handles its own Enter, which is how "Cancelar" stays cancel), but works from the typed-word field of the reset dialog and from the page.
export function confirmKeyAction(key: string, targetTag: string | undefined): ConfirmKeyAction {
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && !['BUTTON', 'A', 'SELECT', 'TEXTAREA'].includes((targetTag ?? '').toUpperCase())) return 'confirm';
  return null;
}

// One behaviour for every confirmation (bind, discard, salvage, import, reset, respec...): while `active`, Escape cancels it and Enter confirms it. Escape is
// consumed here so the modal behind the confirmation (App's Escape handler) stays open; the first Escape only closes the question.
export function useConfirmKeys(active: boolean, onConfirm: () => void, onCancel: () => void): void {
  const confirmRef = useRef(onConfirm);
  const cancelRef = useRef(onCancel);
  confirmRef.current = onConfirm;
  cancelRef.current = onCancel;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const action = confirmKeyAction(event.key, (event.target as HTMLElement | null)?.tagName);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      (action === 'confirm' ? confirmRef : cancelRef).current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}
