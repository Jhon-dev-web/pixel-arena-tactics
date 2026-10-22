import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ContextualTutorialId, InitialTutorialStep } from '../game/engine';
import { t } from '../locales';
import T from '../game/tunables';
import { placeTutorialCard } from './tutorialPlacement';

type TutorialStep = InitialTutorialStep | ContextualTutorialId;

// A step points at the first target on screen: the "Iniciar Caça" button itself for the hunt screen (the card must not cover what the player presses next).
const targets: Partial<Record<TutorialStep, string[]>> = {
  points: ['attrs-suggest', 'attrs'],
  hunt: ['hunt'],
  huntModal: ['hunt-start', 'hunt-modal'],
  dungeon: ['dungeon-start', 'dungeon'],
  garden: ['garden-modal'],
  mining: ['mining-modal'],
  woodcutting: ['woodcutting-modal'],
  deliveries: ['deliveries-modal'],
  reforge: ['inventory-modal'],
  sockets: ['forge-modal'],
  skills: ['skills'],
};

const findTarget = (names: string[] | undefined): HTMLElement | null => {
  for (const name of names ?? []) {
    const element = document.querySelector<HTMLElement>(`[data-tutorial-target="${name}"]`);
    // A target that is in the DOM but not laid out (the phone's hunt list step keeps the start button in a hidden pane) is skipped.
    if (element && element.getClientRects().length > 0) return element;
  }
  return null;
};

// {n}: the levels per skill point (the Habilidades step), from the data like every other number.
const textKey = (step: TutorialStep, key: string) => t(`tutorial.${step}.${key}`, { n: T.heroSkills.pointEveryLevels });

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
  const cardRef = useRef<HTMLElement>(null);
  const [cardHeight, setCardHeight] = useState(200);
  const target = targets[step];

  useLayoutEffect(() => {
    const update = (scroll = false) => {
      const element = findTarget(target);
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
    // Class changes too: the phone's hunt screen swaps its list pane for the detail pane by a class, which brings the start button into view without adding a node.
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    // A target inside the sliding nav drawer is measured while it is still moving: measure again when the slide ends.
    window.addEventListener('transitionend', onViewportChange, true);
    window.addEventListener('animationend', onViewportChange, true);
    const settle = window.setTimeout(onViewportChange, 450);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('transitionend', onViewportChange, true);
      window.removeEventListener('animationend', onViewportChange, true);
      observer.disconnect();
    };
  }, [target, step]);

  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight;
    if (height && Math.abs(height - cardHeight) > 1) setCardHeight(height);
  }, [cardHeight, rect, step]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    const targetElement = findTarget(target);
    if (requiresInteraction && targetElement) targetElement.focus();
    else primaryRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss, requiresInteraction, step, target]);

  const cardWidth = Math.min(320, Math.max(260, window.innerWidth - 24));
  const { left, top } = placeTutorialCard(rect, { width: window.innerWidth, height: window.innerHeight }, { width: cardWidth, height: cardHeight });
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
        ref={cardRef}
        className={`tutorial-card${isIntro || isFinal ? ' centered' : ''}`}
        role="dialog"
        aria-label={textKey(step, 'title')}
        style={{ width: cardWidth, left, top }}
      >
        <h2 className="ui-panel-title tutorial-title">{textKey(step, 'title')}</h2>
        <p>{textKey(step, 'body')}</p>
        {isIntro ? (
          <div className="tutorial-actions">
            <button ref={primaryRef} className="ui-btn primary" onClick={onAdvance} data-ui>
              {t('tutorial.start')}
            </button>
            <button className="ui-btn secondary sm tutorial-skip" onClick={onSkip} data-ui>
              {t('tutorial.skip')}
            </button>
          </div>
        ) : requiresInteraction ? (
          <div className="tutorial-actions">
            <span className="tutorial-action-hint">{t('tutorial.interact')}</span>
            <button ref={primaryRef} className="ui-btn secondary sm tutorial-skip" onClick={onSkip} data-ui>{t('tutorial.skip')}</button>
          </div>
        ) : (
          <div className="tutorial-actions">
            <button ref={primaryRef} className="ui-btn primary" onClick={onAdvance} data-ui>
              {isFinal ? t('tutorial.finish') : t('tutorial.next')}
            </button>
            <button className="ui-btn secondary sm tutorial-skip" onClick={onSkip} data-ui>{t('tutorial.skip')}</button>
          </div>
        )}
      </section>
    </div>
  );
}
