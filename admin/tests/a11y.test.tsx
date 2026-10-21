// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { BarChart, LineChart } from '../src/components/Charts';
import { Drawer } from '../src/components/Drawer';
import PlayersPage from '../src/pages/Players';
import { AppContext } from '../src/hooks';
import { createDemoApi } from '../src/lib/demo';
import { fmtInt } from '../src/lib/format';

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

describe('charts give their exact values without hover (A08)', () => {
  const labels = ['01/10', '02/10', '03/10'];

  test('a line chart: a closed-by-default table with every value, the period and the series names', () => {
    render(<LineChart label="Cadastros por dia" labels={labels} tip={fmtInt} series={[{ name: 'Cadastros', tone: 1, values: [1200, 0, 7] }, { name: 'Ativos', tone: 3, values: [5, 6, 7] }]} />);
    const details = document.querySelector('details.chart-data') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Ver os valores em tabela')).toBeTruthy();
    const table = details.querySelector('table')!;
    expect([...table.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['Dia', 'Cadastros', 'Ativos']);
    expect([...table.querySelectorAll('tbody tr')].map((r) => [...r.children].map((c) => c.textContent))).toEqual([
      ['01/10', '1.200', '5'],
      ['02/10', '0', '6'],
      ['03/10', '7', '7'],
    ]);
    expect(table.querySelector('caption')!.textContent).toBe('Cadastros por dia: valores por dia');
  });

  test('line series also differ by dash pattern, not only by color', () => {
    render(<LineChart label="x" labels={labels} series={[{ name: 'A', tone: 1, values: [1, 2, 3] }, { name: 'B', tone: 3, values: [3, 2, 1] }]} />);
    const dashes = [...document.querySelectorAll('polyline')].map((p) => p.getAttribute('stroke-dasharray'));
    expect(dashes).toEqual([null, '7 4']);
    expect(document.querySelectorAll('.legend svg.legend-line').length).toBe(2);
  });

  test('a stacked bar chart gets the same table, formatted like its tooltips', () => {
    render(<BarChart stacked label="Vendas" labels={labels} tip={(n) => `${n} un.`} series={[{ name: 'USDC', tone: 3, values: [1, 2, 3] }, { name: 'Cartão', tone: 1, values: [0, 1, 0] }]} />);
    const table = document.querySelector('details.chart-data table')!;
    expect(table.textContent).toContain('2 un.');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(3);
    // the tooltip text and the table agree
    expect(document.querySelector('rect title')!.textContent).toBe('01/10 · USDC: 1 un.');
  });
});
