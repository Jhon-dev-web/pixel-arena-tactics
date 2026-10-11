import { CSSProperties } from 'react';
import { artGeometry, HERO_ART } from '../game/huntingZones';
import type { GearItem } from '../game/gear';
import { t } from '../locales';
import { HeroSheet, heroSheetUrl } from '../game/sprites';

// The first idle frame of a hero sheet, cropped to the drawn art (HERO_ART of that sheet) so the figure fills a square of `size` px.
export default function HeroThumb({ sheet, size }: { sheet: HeroSheet; size: number }) {
  const g = artGeometry(HERO_ART[sheet]);
  const k = 0.95 / g.size;
  const style: CSSProperties = {
    width: size,
    height: size,
    backgroundImage: `url(${heroSheetUrl(sheet)})`,
    backgroundSize: `${400 * k}% ${400 * k}%`,
    backgroundPosition: `${size * (0.5 - g.cx * k)}px ${size * (0.5 - g.cy * k)}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
    display: 'inline-block',
    flex: 'none',
  };
  return <span className="ap-skin-art" style={style} role="img" aria-hidden="true" />;
}

// "Aparência" line of an armor's detail / forge card: the armor decides the hero's body, so the card shows the idle frame he gets while wearing it. Armors only, from the
// look mapping (gear.ts ARMOR_LOOKS); renders nothing for any other slot.
export function AppearanceLine({ item }: { item: Pick<GearItem, 'slot' | 'look'> }) {
  if (item.slot !== 'armor' || !item.look) return null;
  return (
    <div className="appearance-line">
      <HeroThumb sheet={item.look} size={28} />
      <span className="appearance-text">
        <b>{t('inventory.appearance')}</b> {t('inventory.appearanceHint')}
      </span>
    </div>
  );
}
