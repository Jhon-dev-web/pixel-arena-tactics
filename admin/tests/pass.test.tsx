// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { PassBadge } from '../src/components/ui';
import { liveOwnersBySource, passMeasures, passRevenue, playerPassState } from '../src/lib/aggregate';
import type { Overview, PassSourceRow } from '../src/lib/types';

afterEach(() => cleanup());

// A01: "valid this season" and "Pass history" are two measures; revenue never depends on validity.
describe('the Pass of an account', () => {
  test('valid, expired, unknown (migration 0026 not applied) and none are four different states', () => {
    expect(playerPassState({ pass_source: 'stripe', pass_valid_now: true, pass_history: 1 })).toBe('valid');
    expect(playerPassState({ pass_source: 'stripe', pass_valid_now: false, pass_history: 1 })).toBe('expired');
    expect(playerPassState({ pass_source: 'stripe' })).toBe('unknown');
    expect(playerPassState({ pass_source: null, pass_valid_now: false, pass_history: 0 })).toBe('none');
    expect(playerPassState({ pass_source: null })).toBe('none');
  });

  test('the badge says which one it is, keeps the origin and real/test, and marks an account outside the ranking', () => {
    const base = { pass_source: 'stripe', pass_livemode: true, pass_valid_now: true, pass_ranking: true, pass_history: 1, pass_valid_through: 1 };
    const { rerender } = render(<PassBadge p={base} />);
    expect(screen.getByText('Válido')).toBeTruthy();
    expect(document.body.textContent).toContain('Cartão (Stripe)');
    rerender(<PassBadge p={{ ...base, pass_livemode: false, pass_ranking: false }} />);
    expect(document.body.textContent).toContain('(teste)');
    expect(document.body.textContent).toContain('fora do ranking');
    rerender(<PassBadge p={{ ...base, pass_valid_now: false, pass_ranking: false }} />);
    expect(screen.getByText('Expirado')).toBeTruthy();
    expect(document.body.textContent).toContain('valeu até a Temporada 1');
    expect(screen.queryByText('Válido')).toBeNull();
    rerender(<PassBadge p={{ pass_source: 'stripe', pass_livemode: true }} />);
    expect(screen.getByText('Histórico')).toBeTruthy();
    expect(document.body.textContent).toContain('validade desconhecida');
  });
});

describe('the Pass numbers of the overview', () => {
  const pass = (extra: Partial<Overview['pass']>): Overview['pass'] => ({ by_source: [], owners_active: 12, card_price_usd: 10, card_sold_live: 5, card_refunded_live: 0, card_sold_test: 0, usdc_live: 30, usdc_test: 0, usdc_to_refund: 0, usdc_payments_live: 3, goal_target: 0, goal_paid: 0, ...extra });

  test('after a season change the valid number drops, the history stays and the revenue does not move', () => {
    const before = pass({ current_season: 1, owners_history: 12, owners_valid_now: 12, owners_valid_ranking: 11, owners_expired: 0 });
    const after = pass({ current_season: 2, owners_history: 12, owners_valid_now: 2, owners_valid_ranking: 2, owners_expired: 10 });
    expect(passMeasures(before)).toMatchObject({ known: true, validNow: 12, history: 12, expired: 0 });
    expect(passMeasures(after)).toMatchObject({ known: true, season: 2, validNow: 2, ranking: 2, history: 12, expired: 10 });
    expect(passRevenue(after)).toEqual(passRevenue(before));
  });

  test('without migration 0026 only the history is known and nothing pretends otherwise', () => {
    const old = passMeasures(pass({}));
    expect(old).toMatchObject({ known: false, validNow: null, ranking: null, expired: null, history: 12 });
  });

  test('by origin: valid-now rows count apart from the history; a row without the field falls back to the history', () => {
    const rows: PassSourceRow[] = [
      { source: 'stripe', livemode: true, active: 10, valid_now: 3, refunded: 0, revoked: 0 },
      { source: 'crypto_sol', livemode: true, active: 4, refunded: 0, revoked: 0 },
    ];
    expect(liveOwnersBySource(rows, 'valid_now')).toEqual([{ source: 'crypto_sol', active: 4 }, { source: 'stripe', active: 3 }]);
    expect(liveOwnersBySource(rows)).toEqual([{ source: 'stripe', active: 10 }, { source: 'crypto_sol', active: 4 }]);
  });
});
