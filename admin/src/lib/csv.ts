// CSV export of the tables. Two rules matter here:
//  1. RFC 4180 quoting (comma, quote, CR or LF inside a cell -> the cell is quoted and quotes are doubled).
//  2. Formula injection: a player controls his username, and a spreadsheet runs a cell that starts with = + - @ (or a tab / CR). Such a TEXT cell gets a leading apostrophe so Excel and Sheets show it as plain text.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') text = value ? 'sim' : 'nao';
  else if (value instanceof Date) text = value.toISOString();
  else text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return lines.join('\r\n') + '\r\n';
}

/** Saves a CSV through a temporary link. A UTF-8 byte-order mark keeps the accents right when Excel opens it. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvFilename(base: string, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${base}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.csv`;
}
