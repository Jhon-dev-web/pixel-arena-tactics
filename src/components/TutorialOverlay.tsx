import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ContextualTutorialId, InitialTutorialStep } from '../game/engine';
import { t } from '../locales';

type TutorialStep = InitialTutorialStep | ContextualTutorialId;

const targets: Partial<Record<TutorialStep, string>> = {
  character: 'hero',
  hunt: 'hunt',
  huntModal: 'hunt-modal',
  dungeon: 'dungeon',
  forge: 'forge',
  garden: 'garden-modal',
  mining: 'mining-modal',
  woodcutting: 'woodcutting-modal',
  deliveries: 'deliveries-modal',
  reforge: 'inventory-modal',
  sockets: 'forge-modal',
};

const textKey = (step: TutorialStep, key: string) => t(`tutorial.${step}.${key}`);

export default function TutorialOverlay({
  step,
  onAdvance,
  onSkip,
  onDismiss,
  requiresInteraction = false,
}: {
  step: TutorialStep;
  onAdvance: () => void;
  onSkip: () => void;
  onDismiss: () => void;
  requiresInteraction?: boolean;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const target = targets[step];

  useLayoutEffect(() => {
    const update = (scroll = false) => {
      const element = target ? document.querySelector<HTMLElement>(`[data-tutorial-target="${target}"]`) : null;
      if (!element) {
        setRect(null);
        return;
      }
      if (scroll) element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setRect(element.getBoundingClientRect());
    };
    update(true);
    const onViewportChange = () => update();
    const observer = new MutationObserver(() => update());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      observer.disconnect();
    };
  }, [target, step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    const targetElement = target ? document.querySelector<HTMLElement>(`[data-tutorial-target="${target}"]`) : null;
    if (requiresInteraction && targetElement) targetElement.focus();
    else primaryRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss, requiresInteraction, step, target]);

  const cardWidth = Math.min(320, Math.max(260, window.innerWidth - 24));
  const left = rect ? Math.max(12, Math.min(window.innerWidth - cardWidth - 12, rect.left + rect.width / 2 - cardWidth / 2)) : (window.innerWidth - cardWidth) / 2;
  const placeAbove = !!rect && rect.bottom + 146 > window.innerHeight && rect.top > 150;
  const desiredTop = rect ? (placeAbove ? rect.top - 236 : rect.bottom + 12) : window.innerHeight * 0.28;
  const top = Math.max(12, Math.min(window.innerHeight - 236, desiredTop));
  const isIntro = step === 'intro';
  const isFinal = step === 'final';

  return (
    <div className="tutorial-layer" aria-live="polite">
      <div className="tutorial-dimmer" aria-hidden="true" />
      {rect && (
        <div
          className="tutorial-spotlight"
          aria-hidden="true"
          style={{ left: rect.left - 5, top: rect.top - 5, width: rect.width + 10, height: rect.height + 10 }}
        />
      )}
      <section
        className={`tutorial-card${isIntro || isFinal ? ' centered' : ''}`}
        role="dialog"
        aria-label={textKey(step, 'title')}
        style={{ width: cardWidth, left, top }}
      >
        <h2>{textKey(step, 'title')}</h2>
        <p>{textKey(step, 'body')}</p>
        {isIntro ? (
          <div className="tutorial-actions">
            <button ref={primaryRef} className="result-btn" onClick={onAdvance} data-ui>
              {t('tutorial.start')}
            </button>
            <button className="tutorial-skip" onClick={onSkip} data-ui>
              {t('tutorial.skip')}
            </button>
          </div>
        ) : requiresInteraction ? (
          <div className="tutorial-actions">
            <span className="tutorial-action-hint">{t('tutorial.interact')}</span>
            <button ref={primaryRef} className="tutorial-skip" onClick={onSkip} data-ui>{t('tutorial.skip')}</button>
          </div>
        ) : (
          <div className="tutorial-actions">
            <button ref={primaryRef} className="result-btn" onClick={onAdvance} data-ui>
              {isFinal ? t('tutorial.finish') : t('tutorial.next')}
            </button>
            <button className="tutorial-skip" onClick={onSkip} data-ui>{t('tutorial.skip')}</button>
          </div>
        )}
      </section>
    </div>
  );
}
