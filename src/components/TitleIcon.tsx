import { useState } from 'react';

// Modal-header icon backed by an external CDN URL, with no game-object (gear/material/gem) to
// fall back on — GearIcon/MaterialIcon/GemIcon already degrade gracefully on a failed load, this
// covers the same external-asset fragility for a bare header icon (see ForgeModal/ShopModal titles).
export default function TitleIcon({ src, fallback, className }: { src: string; fallback: string; className?: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return <span className={`inline-icon-emoji${className ? ` ${className}` : ''}`}>{fallback}</span>;
  }
  return <img className={className ?? 'inline-icon'} src={src} alt="" draggable={false} onError={() => setBroken(true)} />;
}
