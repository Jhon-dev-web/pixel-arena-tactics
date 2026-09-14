import { t } from '../locales';
import { skillLevel, skillLevelProgress } from '../game/skills';

// Skill level stays visible (unlike character XP, which is hidden everywhere) — the player is meant
// to track this progression on purpose. Only the level number + a fill bar are shown, never the raw
// XP numbers or an hourly rate, matching the same "no numbers, just level + progress" policy used for
// hiding character XP while still surfacing something to watch.
export default function SkillLevelBadge({ xp, labelKey }: { xp: number; labelKey: string }) {
  const level = skillLevel(xp);
  const progress = skillLevelProgress(xp);
  return (
    <div className="skill-level-badge">
      <span className="skill-level-label">
        {t(labelKey)} — {t('skills.level', { n: level })}
      </span>
      <div className="camp-mine-bar thin">
        <div className="camp-mine-fill" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
