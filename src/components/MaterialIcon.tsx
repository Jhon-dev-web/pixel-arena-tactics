import { useState } from 'react';
import { MaterialDef } from '../game/materials';

export default function MaterialIcon({ item, className }: { item: MaterialDef; className?: string }) {
  const [broken, setBroken] = useState(false);

  if (item.iconUrl && !broken) {
    return <img className={className} src={item.iconUrl} alt="" draggable={false} onError={() => setBroken(true)} />;
  }
  return <span className={`mat-icon-emoji${className ? ` ${className}` : ''}`}>{item.icon}</span>;
}
