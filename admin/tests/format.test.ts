import { describe, expect, test } from 'vitest';
import {
  agoFromSeconds,
  DASH,
  fmtAgo,
  fmtCompact,
  fmtDateTime,
  fmtDay,
  fmtInt,
  fmtPercent,
  fmtSol,
  fmtUsd,
  humanize,
  lamportsToSol,
  maskEmail,
  ratio,
  shortAddress,
  solscanAccount,
  solscanTx,
  updatedLabel,
} from '../src/lib/format';

const plain = (s: string): string => s.replace(/[  ]/g, ' ');

describe('numbers and money', () => {
  test('fmtInt groups with dots (pt-BR) and tolerates missing values', () => {
    expect(fmtInt(1234567)).toBe('1.234.567');
    expect(fmtInt(0)).toBe('0');
    expect(fmtInt('42')).toBe('42');
    expect(fmtInt(null)).toBe(DASH);
    expect(fmtInt(undefined)).toBe(DASH);
    expect(fmtInt(Number.NaN)).toBe(DASH);
    expect(fmtInt('')).toBe(DASH);
  });

  test('fmtCompact', () => {
    expect(plain(fmtCompact(1_250_000))).toMatch(/1,3 mi/);
    expect(fmtCompact(null)).toBe(DASH);
  });

  test('fmtUsd', () => {
    expect(plain(fmtUsd(10))).toBe('US$ 10,00');
    expect(plain(fmtUsd(1234.5))).toBe('US$ 1.234,50');
    expect(fmtUsd(null)).toBe(DASH);
  });

  test('fmtPercent', () => {
    expect(fmtPercent(0.256)).toBe('26%');
    expect(fmtPercent(0.2567, 1)).toBe('25,7%');
    expect(fmtPercent(undefined)).toBe(DASH);
  });

  test('lamports to SOL', () => {
    expect(lamportsToSol(1_000_000_000)).toBe(1);
    expect(lamportsToSol('50000000')).toBe(0.05);
    expect(lamportsToSol(1_500_000_000n)).toBe(1.5);
    expect(lamportsToSol(null)).toBe(0);
    expect(lamportsToSol('garbage')).toBe(0);
  });

  test('fmtSol trims trailing zeros and caps decimals', () => {
    expect(fmtSol(1_000_000_000)).toBe('1 SOL');
    expect(fmtSol(50_000_000)).toBe('0,05 SOL');
    expect(fmtSol(123_456_789, 3)).toBe('0,123 SOL');
    expect(fmtSol(12_345_678_900, 4)).toBe('12,3457 SOL');
    expect(fmtSol(0)).toBe('0 SOL');
    expect(fmtSol(5_000_000)).toBe('0,005 SOL');
  });

  test('ratio is clamped and safe', () => {
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(500, 100)).toBe(1);
    expect(ratio(-1, 100)).toBe(0);
    expect(ratio(1, 0)).toBe(0);
    expect(ratio(Number.NaN, 10)).toBe(0);
  });
});

describe('dates', () => {
  test('fmtDateTime uses the given zone', () => {
    expect(fmtDateTime('2026-10-17T17:05:00Z', 'America/Sao_Paulo')).toBe('17/10/2026 14:05');
    expect(fmtDateTime('2026-10-17T17:05:00Z', 'UTC')).toBe('17/10/2026 17:05');
    expect(fmtDateTime(null)).toBe(DASH);
    expect(fmtDateTime('not a date')).toBe(DASH);
  });

  test('fmtDay does no timezone maths', () => {
    expect(fmtDay('2026-10-17')).toBe('17/10');
    expect(fmtDay('2026-01-02T23:59:59Z')).toBe('02/01');
    expect(fmtDay('')).toBe(DASH);
  });

  test('"atualizado há X s"', () => {
    expect(agoFromSeconds(0)).toBe('há 0 s');
    expect(agoFromSeconds(12.9)).toBe('há 12 s');
    expect(agoFromSeconds(59)).toBe('há 59 s');
    expect(agoFromSeconds(60)).toBe('há 1 min');
    expect(agoFromSeconds(3599)).toBe('há 59 min');
    expect(agoFromSeconds(7200)).toBe('há 2 h');
    expect(agoFromSeconds(3 * 86400)).toBe('há 3 d');
    expect(agoFromSeconds(-5)).toBe('há 0 s');
    expect(updatedLabel(12)).toBe('atualizado há 12 s');
  });

  test('fmtAgo is relative to a given now', () => {
    const now = Date.parse('2026-10-17T12:00:00Z');
    expect(fmtAgo('2026-10-17T11:55:00Z', now)).toBe('há 5 min');
    expect(fmtAgo(null, now)).toBe(DASH);
  });
});

describe('text helpers', () => {
  test('maskEmail matches the database mask', () => {
    expect(maskEmail('ana.silva@example.com')).toBe('an***@example.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail(null)).toBe(DASH);
    expect(maskEmail('no-at-sign')).toBe(DASH);
  });

  test('shortAddress and humanize', () => {
    expect(shortAddress('5Xk2abcdefghijklmnopqrstuvwxyz9qLm')).toBe('5Xk2…9qLm');
    expect(shortAddress('abc')).toBe('abc');
    expect(shortAddress(null)).toBe(DASH);
    expect(humanize('iron_ore')).toBe('Iron ore');
    expect(humanize(null)).toBe(DASH);
  });
});

describe('Solscan links', () => {
  const sig = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';
  test('a real sale links to mainnet, a test sale to devnet', () => {
    expect(solscanTx(sig, true)).toBe(`https://solscan.io/tx/${sig}`);
    expect(solscanTx(sig, false)).toBe(`https://solscan.io/tx/${sig}?cluster=devnet`);
  });
  test('anything that is not base58 is dropped, so a value can never break out of the URL', () => {
    expect(solscanTx('abc"><script>alert(1)</script>', true)).toBe('https://solscan.io/tx/abcscriptaert1script');
    expect(solscanTx('../../x?y=1#z', true)).not.toMatch(/[?#/.]\w*=|\.\./);
    expect(solscanAccount('Wa11et 111/../', true)).toBe('https://solscan.io/account/Wa11et111');
  });
});
