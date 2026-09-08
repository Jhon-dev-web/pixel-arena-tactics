import { useState } from 'react';
import { ConsumableDef } from '../game/consumables';

export default function ConsumableIcon({ item, className }: { item: ConsumableDef; className?: string }) {
  const [broken, setBroken] = useState(false);

  if (item.iconUrl && !broken) {
    return <img className={className} src={item.iconUrl} alt="" draggable={false} onError={() => setBroken(true)} />;
  }
  return <span className={`mat-icon-emoji${className ? ` ${className}` : ''}`}>{item.icon}</span>;
}
