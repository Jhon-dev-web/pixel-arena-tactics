import { beforeEach, describe, expect, it } from 'vitest';
import { ERROR_LOG_KEY, ERROR_LOG_MAX, buildErrorReport, clearErrorLog, readErrorLog, recordError, setErrorContext } from '../../lib/errorLog';

beforeEach(() => {
  clearErrorLog();
  setErrorContext('');
});

describe('local error ring buffer', () => {
  it('records message, stack, version and screen', () => {
    setErrorContext('skills');
    recordError('error', new Error('boom'));
    const [e] = readErrorLog();
    expect(e.message).toBe('Error: boom');
    expect(e.stack).toContain('boom');
    expect(e.kind).toBe('error');
    expect(typeof e.version).toBe('string');
    expect(e.screen).toContain('view=skills');
    expect(e.count).toBe(1);
  });

  it('keeps only the last few errors and folds identical consecutive ones', () => {
    for (let i = 0; i < ERROR_LOG_MAX + 3; i++) recordError('unhandledrejection', `reason ${i}`);
    const log = readErrorLog();
    expect(log).toHaveLength(ERROR_LOG_MAX);
    expect(log[log.length - 1].message).toBe(`reason ${ERROR_LOG_MAX + 2}`);
    clearErrorLog();
    recordError('error', 'same');
    recordError('error', 'same');
    expect(readErrorLog()).toHaveLength(1);
    expect(readErrorLog()[0].count).toBe(2);
  });

  it('survives garbage in storage and non-Error reasons', () => {
    localStorage.setItem(ERROR_LOG_KEY, '{not json');
    expect(readErrorLog()).toEqual([]);
    recordError('error', { weird: true });
    recordError('error', undefined);
    expect(readErrorLog().length).toBeGreaterThan(0);
  });

  it('builds a plain-text report without anything from the save', () => {
    localStorage.setItem('arena-rpg-save-v1', '{"gold":123456789}');
    recordError('boundary', new Error('render crash'), 'in App');
    const report = buildErrorReport();
    expect(report).toContain('render crash');
    expect(report).toContain('[boundary]');
    expect(report).not.toContain('123456789');
  });
});
