import { activeLocale } from '../locales';
import { Substat, substatLabel } from '../game/rarity';

// "1.1%" -> "1,1%" in Portuguese: a substat value with a decimal uses the active language's separator, like the other numbers on the screens.
export function fmtSubstat(sub: Substat): string {
  const s = substatLabel(sub);
  return activeLocale === 'pt' ? s.replace('.', ',') : s;
}
