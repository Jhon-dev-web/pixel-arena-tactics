// Two tiny pixel-style icons of the market screen (no image files, no network).

/** The USDT coin: the price tag of every listing. */
export function UsdtIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="mk-usdt" width={size} height={size} viewBox="0 0 16 16" aria-hidden shapeRendering="crispEdges">
      <circle cx="8" cy="8" r="8" fill="#26a17b" />
      <rect x="4" y="4" width="8" height="2" fill="#fff" />
      <rect x="7" y="6" width="2" height="7" fill="#fff" />
      <rect x="4" y="7" width="8" height="1" fill="#26a17b" />
      <rect x="5" y="8" width="6" height="1" fill="#fff" />
    </svg>
  );
}

/** The scales of the Market screen title. */
export function ScaleIcon({ size = 44 }: { size?: number }) {
  return (
    <svg className="mk-scale" width={size} height={size} viewBox="0 0 24 24" aria-hidden shapeRendering="crispEdges">
      <rect x="11" y="3" width="2" height="16" fill="#ffd76a" />
      <rect x="8" y="19" width="8" height="2" fill="#e0a83a" />
      <rect x="10" y="2" width="4" height="2" fill="#fff0b8" />
      <rect x="3" y="6" width="18" height="2" fill="#ffd76a" />
      <rect x="3" y="8" width="1" height="5" fill="#c99028" />
      <rect x="20" y="8" width="1" height="5" fill="#c99028" />
      <rect x="1" y="13" width="6" height="1" fill="#ffd76a" />
      <rect x="2" y="14" width="4" height="1" fill="#e0a83a" />
      <rect x="3" y="15" width="2" height="1" fill="#e0a83a" />
      <rect x="17" y="13" width="6" height="1" fill="#ffd76a" />
      <rect x="18" y="14" width="4" height="1" fill="#e0a83a" />
      <rect x="19" y="15" width="2" height="1" fill="#e0a83a" />
    </svg>
  );
}
