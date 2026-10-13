import { t } from '../locales';
import { PLANTS } from '../game/garden';
import { materialIconUrl, MaterialId } from '../game/materials';
import { professionUnlocks } from '../game/mastery';
import type { SkillId } from '../game/skills';

// The list of what a profession unlocks, in level order (mastery.ts professionUnlocks): tiers / plants and the four mastery perks, with what is already done dimmed.
// Shown in the Mining / Woodcutting screen and in the Garden, so every profession always shows its next reward.
export default function UnlockList({ skill, level }: { skill: SkillId; level: number }) {
  const entries = professionUnlocks(skill);
  const upcoming = entries.filter((e) => e.level > level).length;
  return (
    <section className="unlock-list" aria-label={t('mastery.title')} data-testid="unlock-list">
      <h4 className="unlock-title">
        {t('mastery.title')}
        <span className="unlock-count">{upcoming}</span>
      </h4>
      <ul>
        {entries.map((e) => {
          const done = level >= e.level;
          let label: string;
          let icon: string | null = null;
          let sub: string | null = null;
          if (e.kind === 'perk') {
            label = t(`mastery.perks.${e.id}`, e.params);
          } else {
            const name = t(`materials.mat_${e.id}`);
            icon = materialIconUrl(e.id as MaterialId) || null;
            label = e.kind === 'plant' ? t('mastery.plant', { name }) : skill === 'woodcutting' ? t('mastery.tierWood', { name }) : t('mastery.tier', { name });
            const plant = e.kind === 'plant' ? PLANTS.find((p) => p.material === e.id) : undefined;
            sub = plant ? t(`garden.${plant.useKey}`) : null;
          }
          return (
            <li key={`${e.kind}-${e.id}`} className={`unlock-row${done ? ' done' : ''}${e.kind === 'perk' ? ' perk' : ''}`}>
              <span className="unlock-level">{t('mastery.level', { n: e.level })}</span>
              {icon && <img className="unlock-icon" src={icon} alt="" draggable={false} onError={(ev) => (ev.currentTarget.style.display = 'none')} />}
              <span className="unlock-label">{label}</span>
              {e.kind === 'perk' && <span className="unlock-tag">{t('mastery.perk')}</span>}
              {done && <span className="unlock-done">{t('mastery.done')}</span>}
              {sub && <span className="unlock-sub">{sub}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
