import { t } from '../locales';
import { PLANTS } from '../game/garden';
import { materialIconUrl, MaterialId } from '../game/materials';
import { professionUnlocks } from '../game/mastery';
import type { SkillId } from '../game/skills';
import { Chip, Panel } from './ui';

// The list of what a profession unlocks, in level order (mastery.ts professionUnlocks): tiers / plants and the four mastery perks, with what is already done dimmed.
// Shown in the Mining / Woodcutting screen and in the Garden, so every profession always shows its next reward.
export default function UnlockList({ skill, level, collapsed = false }: { skill: SkillId; level: number; collapsed?: boolean }) {
  const entries = professionUnlocks(skill);
  const upcoming = entries.filter((e) => e.level > level).length;
  const list = (
      <ul className="pf-unlocks">
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
            <li key={`${e.kind}-${e.id}`} className={`pf-unlock${done ? ' done' : ''}${e.kind === 'perk' ? ' perk' : ''}`}>
              <span className="pf-unlock-level">{t('mastery.level', { n: e.level })}</span>
              {icon && <img className="pf-unlock-icon" src={icon} alt="" draggable={false} onError={(ev) => (ev.currentTarget.style.display = 'none')} />}
              <span className="pf-unlock-label">{label}</span>
              {e.kind === 'perk' && <Chip tone="info">{t('mastery.perk')}</Chip>}
              {done && <Chip tone="good">{t('mastery.done')}</Chip>}
              {sub && <span className="pf-unlock-sub">{sub}</span>}
            </li>
          );
        })}
      </ul>
  );
  if (collapsed) {
    return (
      <Panel aria-label={t('mastery.title')} data-testid="unlock-list">
        <details className="pf-collapse">
          <summary className="pf-collapse-sum">
            {t('mastery.title')} <Chip tone="gold">{upcoming}</Chip>
          </summary>
          {list}
        </details>
      </Panel>
    );
  }
  return (
    <Panel title={t('mastery.title')} actions={<Chip tone="gold">{upcoming}</Chip>} aria-label={t('mastery.title')} data-testid="unlock-list">
      {list}
    </Panel>
  );
}
