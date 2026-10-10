import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

// Leaf paths of a nested JSON object, e.g. { a: { b: 'x' } } -> { 'a.b': 'x' }.
function leaves(node: unknown, path = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) leaves(v, path ? `${path}.${k}` : k, out);
  } else {
    out[path] = node;
  }
  return out;
}

const placeholders = (s: unknown) => (typeof s === 'string' ? (s.match(/\{\w+\}/g) ?? []).sort().join(',') : '');

const enLeaves = leaves(en);
const ptLeaves = leaves(pt);

describe('locales', () => {
  it('pt.json and en.json have identical key sets', () => {
    const missingInPt = Object.keys(enLeaves).filter((k) => !(k in ptLeaves));
    const missingInEn = Object.keys(ptLeaves).filter((k) => !(k in enLeaves));
    expect({ missingInPt, missingInEn }).toEqual({ missingInPt: [], missingInEn: [] });
  });

  it('every string is non-empty in both languages', () => {
    for (const [name, table] of [['en', enLeaves], ['pt', ptLeaves]] as const) {
      const empty = Object.entries(table).filter(([, v]) => typeof v !== 'string' || v.trim() === '').map(([k]) => k);
      expect(empty, name).toEqual([]);
    }
  });

  it('both languages use the same {placeholders} for the same key', () => {
    const mismatched = Object.keys(enLeaves)
      .filter((k) => k in ptLeaves && placeholders(enLeaves[k]) !== placeholders(ptLeaves[k]))
      .map((k) => `${k}: en[${placeholders(enLeaves[k])}] pt[${placeholders(ptLeaves[k])}]`);
    expect(mismatched).toEqual([]);
  });
});

describe('gear descriptions', () => {
  // Stats are generated from the data (gearStats.ts); a number typed into a description goes stale (it did, before this test existed).
  it('no gear description contains a digit, in either language', async () => {
    const { GEAR } = await import('../gear');
    for (const [name, table] of [['en', en], ['pt', pt]] as const) {
      const gear = (table as unknown as { gear: Record<string, string> }).gear;
      for (const item of GEAR) {
        const text = gear[item.descKey];
        expect(typeof text, `${name} ${item.descKey}`).toBe('string');
        expect(text, `${name} ${item.descKey}`).not.toMatch(/\d/);
      }
    }
  });
});
