import { t } from '../locales';
import { SaveData } from '../game/engine';
import { heroActivity } from '../game/activity';

// What the hero is doing right now, in the top bar (one task at a time; the Garden is not one).
export default function ActivityChip({ save }: { save: SaveData }) {
  const activity = heroActivity(save);
  if (!activity) return null;
  const job = save.craftJob;
  const label = activity === 'craft' && job ? t('busy.hudCraft', { done: job.done, total: job.qty }) : t('busy.hud', { activity: t(`busy.${activity}`) });
  return (
    <span className={`activity-chip act-${activity}`} role="status" title={label}>
      {label}
    </span>
  );
}
