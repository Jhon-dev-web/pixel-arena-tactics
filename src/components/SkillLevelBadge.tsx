import type { ReactNode } from 'react';
import { fmtNum, t } from '../locales';
import { skillLevel, skillLevelProgress, skillXpForNextLevel, skillXpToReachLevel, SkillId } from '../game/skills';
import T from '../game/tunables';
import { Chip } from './ui';
import { Meter } from './HuntParts';

// Profession header: level, a fill bar and the real XP numbers ("340 / 612 XP"), so a player can see how far the next level is. `children` is the
// space under the bar for what the screen wants to show next to it (rate per hour, next unlock...).
export default function SkillLevelBadge({ xp, labelKey, skillId, children }: { xp: number; labelKey: string; skillId: SkillId; children?: ReactNode }) {
  const level = skillLevel(xp, skillId);
  const progress = skillLevelProgress(xp, skillId);
  const maxed = level >= T.skills.maxLevel;
  const cur = Math.max(0, Math.floor(xp - skillXpToReachLevel(level, skillId)));
  const need = skillXpForNextLevel(level, skillId);
  return (
    <div className="pf-level">
      <div className="pf-level-row">
        <span className="pf-level-label">{t(labelKey)}</span>
        <Chip tone="gold">{t('skills.level', { n: level })}</Chip>
      </div>
      <Meter pct={progress * 100} tone="xp" label={t(labelKey)} />
      <p className="pf-xp">{maxed ? t('skills.maxLevel') : t('skills.xpProgress', { cur: fmtNum(cur), need: fmtNum(need), left: fmtNum(Math.max(0, need - cur)) })}</p>
      {children}
    </div>
  );
}
