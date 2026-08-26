import { CSSProperties, useMemo } from 'react';

export default function Campfire() {
  const embers = useMemo(
    () =>
      Array.from({ length: 16 }, () => ({
        left: 30 + Math.random() * 40,
        dx: (Math.random() - 0.5) * 18,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 3.2,
        duration: 2.4 + Math.random() * 2.2,
        color: Math.random() < 0.5 ? '#ffb347' : '#ffd54a',
      })),
    [],
  );

  return (
    <div className="campfire" aria-hidden>
      <div className="campfire-glow" />
      <div className="campfire-flame">
        <span className="flame-core" />
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
  );
}
