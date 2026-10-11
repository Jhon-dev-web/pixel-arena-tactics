import { CSSProperties } from 'react';
import { artGeometry, HERO_ART } from '../game/huntingZones';
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
