import { describe, expect, it } from 'vitest';
import { confirmKeyAction } from '../../hooks/useConfirmKeys';

describe('confirm dialog keys', () => {
  it('Escape cancels from anywhere', () => {
    for (const tag of ['BODY', 'BUTTON', 'INPUT', undefined]) expect(confirmKeyAction('Escape', tag)).toBe('cancel');
  });

  it('Enter confirms from the page and the typed-word field, but leaves buttons, links and selects to their own Enter', () => {
    expect(confirmKeyAction('Enter', 'BODY')).toBe('confirm');
    expect(confirmKeyAction('Enter', 'INPUT')).toBe('confirm');
    expect(confirmKeyAction('Enter', undefined)).toBe('confirm');
    for (const tag of ['BUTTON', 'button', 'A', 'SELECT', 'TEXTAREA']) expect(confirmKeyAction('Enter', tag)).toBeNull();
  });

  it('other keys do nothing', () => {
    expect(confirmKeyAction('a', 'BODY')).toBeNull();
    expect(confirmKeyAction(' ', 'BODY')).toBeNull();
  });
});
