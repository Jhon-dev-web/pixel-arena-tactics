import { t } from '../locales';

// The Hunt zone-level rule in one line: wins at the current level unlock a test against the next level, which is fought at the start of the next
// stretch of the hunt (it needs a full-HP fight, so a session that ends right at "N of N" has not taken it yet). Winning the test raises the level.
export function promotionLine(wins: number, required: number, level: number): string {
  const n = Math.min(Math.max(0, wins), required);
  return n >= required
    ? t('hunting.subLevelReady', { x: required, next: level + 1 })
    : t('hunting.subLevelNext', { n, x: required, left: required - n });
}
