import { useEffect, useRef } from 'react';

interface SpriteSheetProps {
  src: string;
  size: number | string;
  row: number;
  frames?: number;
  fps?: number;
  flip?: boolean;
  playOnce?: boolean;
  onDone?: () => void;
  className?: string;
}

export default function SpriteSheet({
  src,
  size,
  row,
  frames = 4,
  fps = 6,
  flip = false,
  playOnce = false,
  onDone,
  className,
}: SpriteSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rowRef = useRef(row);
  rowRef.current = row;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let i = 0;
    let last = 0;
    let raf = 0;
    const frameMs = 1000 / fps;

    const step = (t: number) => {
      if (t - last >= frameMs) {
        last = t;
        if (playOnce && i >= frames) {
          cancelAnimationFrame(raf);
          onDoneRef.current?.();
          return;
        }
        const cell = el.clientWidth;
        const col = i % frames;
        el.style.backgroundPosition = `${-col * cell}px ${-rowRef.current * cell}px`;
        i += 1;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [frames, fps, playOnce]);

  return (
    <div
      ref={ref}
      className={`spritesheet${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${src})`,
        backgroundSize: '400% 400%',
        backgroundRepeat: 'no-repeat',
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
    />
  );
}
