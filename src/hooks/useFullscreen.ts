import { useCallback, useEffect, useState } from 'react';

// Fullscreen for the Settings button. In the desktop app the window is the one the main process owns (desktop/main.cjs toggleFullscreen, the same path as
// F11 and Alt+Enter), reached through the small preload bridge; in a browser it is the Fullscreen API. `supported` is false where neither exists (an iPhone).
interface DesktopBridge {
  isDesktop?: boolean;
  toggleFullscreen?: () => Promise<boolean>;
  isFullscreen?: () => Promise<boolean>;
}
const bridge = (): DesktopBridge | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { arenaDesktop?: DesktopBridge }).arenaDesktop);

export default function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const desktop = !!bridge()?.toggleFullscreen;
  const supported = desktop || (typeof document !== 'undefined' && !!document.fullscreenEnabled);
  const [active, setActive] = useState<boolean>(() => (typeof document !== 'undefined' ? !!document.fullscreenElement : false));

  const refresh = useCallback(() => {
    const b = bridge();
    if (b?.isFullscreen) void b.isFullscreen().then(setActive, () => undefined);
    else setActive(!!document.fullscreenElement);
  }, []);

  useEffect(() => {
    refresh();
    document.addEventListener('fullscreenchange', refresh);
    // F11 / Alt+Enter in the desktop app change the window without a DOM event; the resize that follows tells us.
    window.addEventListener('resize', refresh);
    return () => {
      document.removeEventListener('fullscreenchange', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, [refresh]);

  const toggle = useCallback(() => {
    const b = bridge();
    if (b?.toggleFullscreen) {
      void b.toggleFullscreen().then(setActive, () => undefined);
      window.setTimeout(refresh, 400);
      return;
    }
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      /* the browser refused (no user gesture, or not allowed): nothing to do */
    }
  }, [refresh]);

  return { supported, active, toggle };
}
