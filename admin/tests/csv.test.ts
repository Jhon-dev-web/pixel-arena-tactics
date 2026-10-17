import { describe, expect, test } from 'vitest';
import { csvCell, csvFilename, toCsv } from '../src/lib/csv';

describe('csvCell', () => {
  test('plain values stay plain', () => {
    expect(csvCell('Ana')).toBe('Ana');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(-3.5)).toBe('-3.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('sim');
    expect(csvCell(false)).toBe('nao');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(new Date('2026-10-17T00:00:00Z'))).toBe('2026-10-17T00:00:00.000Z');
  });

  test('commas, quotes and line breaks are quoted (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('cr\rhere')).toBe('"cr\rhere"'); // a CR in the middle: quoted, not a formula
  });

  test('a text cell that starts like a formula is neutralised with an apostrophe', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\t=1')).toBe("'\t=1");
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
  });

  test('a real negative NUMBER is not touched', () => {
    expect(csvCell(-5)).toBe('-5');
  });
});

describe('toCsv', () => {
  test('header, rows, CRLF and a trailing newline', () => {
    const out = toCsv(['jogador', 'ouro'], [
      ['Ana', 100],
      ['=evil', 5],
    ]);
    expect(out).toBe("jogador,ouro\r\nAna,100\r\n'=evil,5\r\n");
  });

  test('an empty table is just the header', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });

  test('the header cells are escaped too', () => {
    expect(toCsv(['a,b', '=x'], [])).toBe('"a,b",\'=x\r\n');
  });
});

describe('csvFilename', () => {
  test('is dated and ends in .csv', () => {
    expect(csvFilename('jogadores', new Date(2026, 9, 7, 8, 5))).toBe('jogadores-20261007-0805.csv');
  });
});
