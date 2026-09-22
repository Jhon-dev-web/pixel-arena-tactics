import { useEffect, useState } from 'react';

// Desktop dashboard/sidebar layout kicks in at this width; anything narrower keeps the existing
// mobile "stage" (9:16 portrait) layout completely untouched. See App.tsx.
export const DESKTOP_BREAKPOINT = 1024;

export default function useIsDesktop(breakpoint: number = DESKTOP_BREAKPOINT): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(`(min-width: ${breakpoint}px)`).matches);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);

  return isDesktop;
}
