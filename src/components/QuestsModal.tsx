import { useState } from 'react';
import { fmtNum, t } from '../locales';
import Assets from '../assets.json';
import { SaveData } from '../game/engine';
import { questContext } from '../game/questContext';
import { getTitleDef } from '../game/titles';
import { statsOf } from '../game/stats';
import { SET_FAMILIES } from '../game/gear';
import { getHuntingZone } from '../game/huntingZones';
import { achievementSummary, ACHIEVEMENT_CATEGORIES, QUESTS_DAILY, QUESTS_ACHIEVEMENTS, QuestDef, isClaimed, isComplete, questProgress } from '../game/quests';

const questText = (k: string): string => t(`quests.${k}`);

type Tab = 'daily' | 'achievements' | 'stats';

function formatPlayed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${fmtNum(h)}h ${String(m).padStart(2, '0')}min` : `${m}min`;
}

export default function QuestsModal({
  save,
  onClaim,
  onClose,
}: {
  save: SaveData;
  onClaim: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('daily');
  const ctx = questContext(save);

  const card = (q: QuestDef) => {
    const claimed = isClaimed(q, save.quests);
    const progress = Math.min(q.target, questProgress(q, save.quests, ctx));
    const complete = isComplete(q, save.quests, ctx);
    const pct = q.target <= 0 ? 100 : Math.min(100, (progress / q.target) * 100);
    const title = q.titleId ? getTitleDef(q.titleId) : undefined;
    return (
      <div className={`quest-card${claimed ? ' claimed' : ''}`} key={q.id} data-quest-id={q.id}>
        <div className="quest-head">
          <span className="quest-name">{questText(q.nameKey)}</span>
          <span className="quest-reward">
            {q.gold > 0 && (
              <span className="quest-reward-item">
                <img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {fmtNum(q.gold)}
              </span>
            )}
            {q.shards > 0 && (
              <span className="quest-reward-item quest-shards">
                <img className="inline-icon" src="/assets/icons/shards.png" alt="" /> {q.shards}
              </span>
            )}
          </span>
        </div>
        <span className="quest-desc">{questText(q.descKey)}</span>
        {title && <span className="quest-title-reward">🎖️ {t(`titles.${title.nameKey}`)}</span>}
        <div className="quest-progress-row">
          <div className="quest-bar">
            <div className={`quest-bar-fill${complete ? ' done' : ''}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="quest-count">{t('quests.progress', { n: fmtNum(progress), m: fmtNum(q.target) })}</span>
        </div>
        {claimed ? (
          <button className="quest-btn claimed" disabled data-ui>
            {t('quests.claimed')}
          </button>
        ) : (
          <button className={`quest-btn${complete ? ' claim' : ''}`} onClick={() => onClaim(q.id)} disabled={!complete} data-ui>
            {t('quests.claim')}
          </button>
        )}
      </div>
    );
  };

  const summary = achievementSummary(save.quests);
  const stats = statsOf(save);
  const statRows: { group: string; rows: [string, string][] }[] = [
    {
      group: 'combat',
      rows: [
        [t('stats.kills'), fmtNum(Math.max(stats.kills, save.quests.counters.kills ?? 0))],
        ...Object.entries(stats.killsByZone)
          .filter(([id]) => getHuntingZone(id))
          .map(([id, n]): [string, string] => [t('stats.killsZone', { zone: t(`dungeon.${getHuntingZone(id)?.nameKey ?? ''}`) }), fmtNum(n)]),
        [t('stats.dungeonRuns'), fmtNum(stats.dungeonRuns)],
        [t('stats.bosses'), fmtNum(stats.bossesKilled)],
      ],
    },
    {
      group: 'forging',
      rows: [
        [t('stats.forged'), fmtNum(stats.itemsForged)],
        [t('stats.forgedRare'), fmtNum(stats.forgedByRarity.rare)],
        [t('stats.forgedEpic'), fmtNum(stats.forgedByRarity.epic)],
        [t('stats.forgedLegendary'), fmtNum(stats.forgedByRarity.legendary)],
        [t('stats.uniques'), fmtNum(stats.uniquesFound)],
        [t('stats.refineOk'), fmtNum(stats.refineSuccess)],
        [t('stats.refineFail'), fmtNum(stats.refineFail)],
        [t('stats.sets'), `${stats.completedSets.length} / ${SET_FAMILIES.length}`],
      ],
    },
    {
      group: 'professions',
      rows: [
        [t('stats.ore'), fmtNum(stats.oreGathered)],
        [t('stats.wood'), fmtNum(stats.woodGathered)],
        [t('stats.plants'), fmtNum(stats.plantsHarvested)],
        [t('stats.potions'), fmtNum(stats.potionsBrewed)],
        [t('stats.deliveries'), fmtNum(stats.deliveries)],
      ],
    },
    {
      group: 'economy',
      rows: [
        [t('stats.gold'), fmtNum(stats.goldEarned)],
        [t('stats.played'), formatPlayed(stats.secondsPlayed)],
      ],
    },
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal quests-modal">
        <h2 className="modal-title">
          <img className="inline-icon" src="/assets/icons/nav_quests.png" alt="" /> {t('quests.title')}
        </h2>

        <div className="inv-tabs">
          <button className={`tab${tab === 'daily' ? ' active' : ''}`} onClick={() => setTab('daily')} data-ui>
            {t('quests.dailyTab')}
          </button>
          <button className={`tab${tab === 'achievements' ? ' active' : ''}`} onClick={() => setTab('achievements')} data-ui>
            {t('quests.achievementsTab')}
          </button>
          <button className={`tab${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')} data-ui>
            {t('quests.statsTab')}
          </button>
        </div>

        <div className="quests-body">
          {tab === 'daily' && QUESTS_DAILY.map(card)}
          {tab === 'achievements' && (
            <>
              <div className="quest-summary">{t('quests.summary', { n: summary.done, m: summary.total })}</div>
              {ACHIEVEMENT_CATEGORIES.map((cat) => {
                const list = QUESTS_ACHIEVEMENTS.filter((q) => q.category === cat);
                if (list.length === 0) return null;
                return (
                  <section className="quest-group" key={cat}>
                    <h3 className="quest-group-title">{t(`quests.cat_${cat}`)}</h3>
                    {list.map(card)}
                  </section>
                );
              })}
            </>
          )}
          {tab === 'stats' &&
            statRows.map((g) => (
              <section className="quest-group" key={g.group}>
                <h3 className="quest-group-title">{t(`quests.cat_${g.group}`)}</h3>
                <dl className="stat-list">
                  {g.rows.map(([label, value]) => (
                    <div className="stat-row" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
