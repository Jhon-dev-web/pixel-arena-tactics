import { useState } from 'react';
import { GemDef } from '../game/gems';

export default function GemIcon({ item, className }: { item: GemDef; className?: string }) {
  const [broken, setBroken] = useState(false);

  if (item.iconUrl && !broken) {
    return <img className={className} src={item.iconUrl} alt="" draggable={false} onError={() => setBroken(true)} />;
  }
  return <span className={`mat-icon-emoji${className ? ` ${className}` : ''}`}>{item.icon}</span>;
}
