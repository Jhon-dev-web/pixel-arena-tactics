import { useEffect } from 'react';
import { t } from '../locales';
import { getGear } from '../game/gear';
import { LevelUpSummary } from '../game/levelUp';

// The level-up moment: a banner at the top of the screen that says what the levels gave and offers to spend it. It never blocks (the page behind stays usable), goes away
// by itself, and a second batch of levels while it is up grows the same banner. The sound is played where the level is granted (App.tsx setSaveBoth, muted like any effect).
const LEVEL_UP_BANNER_MS = 12000;

function levelUpLines(summary: LevelUpSummary): string[] {
  const lines = [t('levelUp.attributes', { n: summary.attributePoints })];
  if (summary.skillPoints > 0) lines.push(t('levelUp.skills', { n: summary.skillPoints }));
  for (const id of summary.recipes.slice(0, 2)) lines.push(t('levelUp.recipe', { name: t(`gear.${getGear(id)?.nameKey ?? id}`) }));
  if (summary.recipes.length > 2) lines.push(t('levelUp.moreRecipes', { n: summary.recipes.length - 2 }));
  return lines;
}

export default function LevelUpBanner({
  summary,
  attrPoints,
  skillPoints,
  onSpend,
  onClose,
}: {
  summary: LevelUpSummary;
  attrPoints: number;
  skillPoints: number;
  onSpend: (where: 'personagem' | 'skills') => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(onClose, LEVEL_UP_BANNER_MS);
    return () => window.clearTimeout(id);
    // a new batch (a different last level) restarts the countdown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.to, summary.from]);

  const title = summary.gained > 1 ? t('levelUp.titleMany', { n: summary.to, g: summary.gained }) : t('levelUp.title', { n: summary.to });
  return (
    <div className="levelup-banner" role="status" aria-live="polite" data-testid="levelup-banner">
      <div className="levelup-head">
        <strong className="levelup-title">{title}</strong>
        <button className="levelup-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ×
        </button>
      </div>
      <ul className="levelup-lines">
        {levelUpLines(summary).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="levelup-actions">
        {attrPoints > 0 && (
          <button className="result-btn levelup-spend" onClick={() => onSpend('personagem')} data-ui>
            {t('levelUp.spendAttrs', { n: attrPoints })}
          </button>
        )}
        {skillPoints > 0 && (
          <button className="result-btn levelup-spend" onClick={() => onSpend('skills')} data-ui>
            {t('levelUp.spendSkills', { n: skillPoints })}
          </button>
        )}
      </div>
    </div>
  );
}
