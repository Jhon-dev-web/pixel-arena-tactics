import { CSSProperties, useMemo } from 'react';

export default function Campfire() {
  const embers = useMemo(
    () =>
      Array.from({ length: 30 }, () => ({
        left: 26 + Math.random() * 48,
        dx: (Math.random() - 0.5) * 26,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 3,
        duration: 2 + Math.random() * 2.4,
        color: Math.random() < 0.45 ? '#ffb347' : Math.random() < 0.82 ? '#ffd54a' : '#ff8c1a',
      })),
    [],
  );

  return (
    <>
      <div className="firelight" aria-hidden />
      <div className="campfire" aria-hidden>
        <div className="campfire-flame">
          <span className="flame-inner" />
          <span className="flame-core" />
          <span className="flame-mid" />
          <span className="flame-outer" />
        </div>
        {embers.map((e, i) => (
          <span
            key={i}
            className="ember"
            style={
              {
                left: `${e.left}%`,
                '--dx': `${e.dx}px`,
                width: `${e.size}px`,
                height: `${e.size}px`,
                animationDelay: `${e.delay}s`,
                animationDuration: `${e.duration}s`,
                background: e.color,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </>
  );
}
