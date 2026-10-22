// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Drawer } from '../src/components/Drawer';
import PlayersPage from '../src/pages/Players';
import { AppContext } from '../src/hooks';
import { createDemoApi } from '../src/lib/demo';

afterEach(() => cleanup());

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <main id="app">
      <button type="button" onClick={() => setOpen(true)}>
        Abrir detalhes
      </button>
      <a href="#fora">link atrás</a>
      {open ? (
        <Drawer title="Detalhe" onClose={() => setOpen(false)}>
          <input aria-label="primeiro campo" />
          <button type="button">meio</button>
          <a href="#dentro">último link</a>
        </Drawer>
      ) : null}
    </main>
  );
}

describe('the side panel is a real modal dialog (A08)', () => {
  test('opening moves focus inside; the page behind becomes inert and hidden from screen readers', () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes' }));
    const dialog = screen.getByRole('dialog', { name: 'Detalhe' });
    expect(document.activeElement).toBe(dialog);
    expect(container.hasAttribute('inert')).toBe(true);
    expect(container.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.closest('[inert]')).toBeNull();
    expect(dialog.parentElement!.parentElement).toBe(document.body); // rendered at the end of <body>, outside the app
  });

  test('Tab and Shift+Tab loop inside the panel and never reach the page behind', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes' }));
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Fechar' });
    const last = within(dialog).getByRole('link', { name: 'último link' });
    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close); // wrapped to the first control
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    close.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last); // wrapped to the last control
    // from the panel itself, Shift+Tab also goes to the last
    dialog.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(last);
  });

  test('focus that escapes is pulled back in', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes' }));
    const dialog = screen.getByRole('dialog');
    const behind = screen.getByText('link atrás', { selector: 'a' });
    fireEvent.focusIn(behind);
    expect(document.activeElement).toBe(dialog);
  });

  test('Escape closes it, the page is live again and focus returns to the button that opened it', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir detalhes' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(document.querySelectorAll('[inert]').length).toBe(0);
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBe(0);
  });

  test('the Close button and the dark area also close it and restore focus', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir detalhes' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(document.querySelector('.scrim')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  test('previous aria-hidden values of the page are restored, not wiped', async () => {
    const { container } = render(<Harness />);
    container.setAttribute('aria-hidden', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes' }));
    expect(container.getAttribute('aria-hidden')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(container.getAttribute('aria-hidden')).toBe('false');
    expect(container.hasAttribute('inert')).toBe(false);
  });

  test('on the Players page a row opens the panel, and closing returns focus to that same row', async () => {
    render(
      <AppContext.Provider value={{ api: createDemoApi(), onDenied: vi.fn(), demo: true }}>
        <PlayersPage />
      </AppContext.Provider>,
    );
    const table = await screen.findByRole('table', { name: 'Jogadores' });
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(5));
    const row = within(table).getAllByRole('row')[2];
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Conta')).toBeTruthy());
    // the panel re-renders when the detail arrives; focus must not be stolen back or lost
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(row);
  });
});
