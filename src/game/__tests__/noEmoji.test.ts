import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The owner's rule: no emoji on screen, only pixel icons or plain text. This guards the locales and the screens (components); the `icon` fallbacks in the data files under src/game are not rendered while the pixel art loads fine.
const EMOJI = /\p{Extended_Pictographic}/u;
const SRC = resolve(__dirname, '../..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : walk(p);
    return /\.tsx$/.test(p) && !/\.test\./.test(p) ? [p] : [];
  });
}

const withoutComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('no emoji in the rendered UI', () => {
  for (const lang of ['pt', 'en']) {
    it(`locale ${lang} has no emoji in any text`, () => {
      const raw = readFileSync(join(SRC, 'locales', `${lang}.json`), 'utf8');
      const bad = raw.split('\n').filter((l) => EMOJI.test(l));
      expect(bad).toEqual([]);
    });
  }

  it('no component renders an emoji', () => {
    const bad: string[] = [];
    for (const file of walk(join(SRC, 'components'))) {
      withoutComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        if (EMOJI.test(line)) bad.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
