import { CSSProperties, useMemo } from 'react';
import { CombatEventKind } from '../game/engine';
import { t } from '../locales';

export interface FloatState {
  id: number;
  target: 'player' | 'enemy';
  kind: CombatEventKind;
  value: number;
}
export interface BurstState {
  id: number;
  target: 'player' | 'enemy';
}

export function floatLabel(ev: FloatState): string {
  switch (ev.kind) {
    case 'crit':
      return `${t('combat.critical')} -${ev.value}`;
    case 'blocked':
      return t('combat.blocked');
    case 'damage':
      return `-${ev.value}`;
    case 'heal':
      return `+${ev.value} ${t('combat.hp')}`;
    case 'stamina':
      return `+${ev.value} ${t('combat.stamina')}`;
    case 'reflect':
      return `${t('combat.reflect')} -${ev.value}`;
    case 'burn':
      return `${t('combat.burn')} -${ev.value}`;
    case 'poison':
      return `${t('combat.poison')} -${ev.value}`;
    case 'dodge':
      return t('combat.dodge');
    case 'curse':
      return t('combat.curse');
    case 'slam':
      return `${t('combat.slam')} -${ev.value}`;
  }
}

export function Burst({ count }: { count: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 22 + Math.random() * 36;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          size: 3 + Math.random() * 4,
          delay: Math.random() * 50,
        };
      }),
    [count],
  );
  return (
    <span className="burst">
      {dots.map((d, i) => (
        <span
          key={i}
          className="burst-dot"
          style={
            {
              '--dx': `${d.dx}px`,
              '--dy': `${d.dy}px`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              animationDelay: `${d.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
