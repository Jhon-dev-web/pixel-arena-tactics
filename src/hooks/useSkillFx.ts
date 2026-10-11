import { useCallback, useEffect, useRef, useState } from 'react';
import { SKILL_FX, SkillFxId, fxScaleFor } from '../game/skillFx';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function useFxScale(): 1 | 2 {
  const [scale, setScale] = useState<1 | 2>(() => fxScaleFor(window.innerWidth));
  useEffect(() => {
    const on = () => setScale(fxScaleFor(window.innerWidth));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

export interface FxItem {
  key: number;
  id: SkillFxId;
}

// The effects playing on a stage: play(id) starts one (and the stage shake of the strikes that have it), the layers draw them. Under prefers-reduced-motion nothing plays, no
// sprite and no shake (the caller still prints the name callout).
export function useFxStage() {
  const reduced = useReducedMotion();
  const [items, setItems] = useState<FxItem[]>([]);
  const [shaking, setShaking] = useState(false);
  const keyRef = useRef(0);
  const play = useCallback(
    (id: SkillFxId) => {
      if (reduced) return;
      const key = keyRef.current++;
      setItems((list) => [...list.slice(-10), { key, id }]);
      if (SKILL_FX[id].shake) {
        setShaking(true);
        window.setTimeout(() => setShaking(false), 150);
      }
    },
    [reduced],
  );
  const done = useCallback((key: number) => setItems((list) => list.filter((x) => x.key !== key)), []);
  return { items, play, done, shaking, reduced };
}

