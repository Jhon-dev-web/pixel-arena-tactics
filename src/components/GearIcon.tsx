import { useState } from 'react';
import { GearItem } from '../game/gear';
import PixelIcon from './PixelIcon';

export default function GearIcon({ item }: { item: GearItem }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  if (item.iconSheet && item.iconUrl) {
    return (
      <span
        className="gear-icon-sheet"
        style={{ backgroundImage: `url(${item.iconUrl})` }}
        role="img"
      />
    );
  }
  if (item.icon && item.icon !== brokenSrc) {
    return <img className="pixel-icon" src={item.icon} alt="" draggable={false} onError={() => setBrokenSrc(item.icon!)} />;
  }
  if (item.iconUrl && item.iconUrl !== brokenSrc) {
    return <img className="gear-icon-img" src={item.iconUrl} alt="" draggable={false} onError={() => setBrokenSrc(item.iconUrl!)} />;
  }
  return <PixelIcon name="inventory" />;
}
