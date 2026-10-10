import type { ReactNode } from 'react';
import { fmtNum, t } from '../locales';
import { skillLevel, skillLevelProgress, skillXpForNextLevel, skillXpToReachLevel, SkillId } from '../game/skills';
import T from '../game/tunables';

// Profession header: level, a fill bar and the real XP numbers ("340 / 612 XP"), so a player can see how far the next level is. `children` is the
// space under the bar for what the screen wants to show next to it (rate per hour, next unlock...).
export default function SkillLevelBadge({ xp, labelKey, skillId, children }: { xp: number; labelKey: string; skillId: SkillId; children?: ReactNode }) {
  const level = skillLevel(xp, skillId);
  const progress = skillLevelProgress(xp, skillId);
  const maxed = level >= T.skills.maxLevel;
  const cur = Math.max(0, Math.floor(xp - skillXpToReachLevel(level, skillId)));
  const need = skillXpForNextLevel(level, skillId);
  return (
    <div className="skill-level-badge">
      <div className="skill-level-row">
        <span className="skill-level-label">{t(labelKey)}</span>
        <span className="skill-level-num">{t('skills.level', { n: level })}</span>
      </div>
      <div
        className="camp-mine-bar thin"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={t(labelKey)}
      >
        <div className="camp-mine-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="skill-level-xp">{maxed ? t('skills.maxLevel') : t('skills.xpProgress', { cur: fmtNum(cur), need: fmtNum(need), left: fmtNum(Math.max(0, need - cur)) })}</span>
      {children}
    </div>
  );
}
