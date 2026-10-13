import { useState } from 'react';
import { activeLocale, fmtNum, t } from '../locales';
import T from '../game/tunables';
import { getConsumable } from '../game/consumables';
import { STREAK_DAYS, streakReward, streakStatus, weeklyBand, weeklyView, WeeklyGoalId, WeeklyGoalView } from '../game/weekly';
import ConsumableIcon from './ConsumableIcon';
import Assets from '../assets.json';
import { playerLevel, SaveData } from '../game/engine';
import { questContext } from '../game/questContext';
import { getTitleDef } from '../game/titles';
import { statsOf } from '../game/stats';
import { SET_FAMILIES } from '../game/gear';
import { getHuntingZone } from '../game/huntingZones';
import { paragonLevel } from '../game/paragon';
import { achievementSummary, ACHIEVEMENT_CATEGORIES, QUESTS_DAILY, QUESTS_ACHIEVEMENTS, QuestDef, isClaimed, isComplete, questProgress } from '../game/quests';

const questText = (k: string): string => t(`quests.${k}`);

type Tab = 'daily' | 'weekly' | 'achievements' | 'stats';

// "2d 5h" / "7h 12min" / "40min": the time left until the weekly goals reset.
function formatLeft(ms: number): string {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
}

function formatPlayed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${fmtNum(h)}h ${String(m).padStart(2, '0')}min` : `${m}min`;
}

export default function QuestsModal({
  save,
  onClaim,
  ownsPass,
  onClaimWeekly,
  onClaimWeeklyBonus,
  onClaimStreak,
  onClose,
}: {
  save: SaveData;
  onClaim: (id: string) => void;
  ownsPass: boolean;
  onClaimWeekly: (id: WeeklyGoalId) => void;
  onClaimWeeklyBonus: () => void;
  onClaimStreak: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('daily');
  const ctx = questContext(save);
  const now = Date.now();
  const weekly = weeklyView(save, now);
  const level = playerLevel(save.xp);
  const band = weeklyBand(level);
  const streak = streakStatus(save.quests.streak, now, ownsPass, level);
  const dailyReady = QUESTS_DAILY.some((q) => isComplete(q, save.quests, ctx) && !isClaimed(q, save.quests));
  const achievementReady = QUESTS_ACHIEVEMENTS.some((q) => isComplete(q, save.quests, ctx) && !isClaimed(q, save.quests));
  const dot = (on: boolean) => (on ? <span className="tab-dot" aria-hidden="true" /> : null);

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

  const rewardChips = (gold: number, shards: number) => (
    <span className="quest-reward">
      {gold > 0 && (
        <span className="quest-reward-item">
          <img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {fmtNum(gold)}
        </span>
      )}
      {shards > 0 && (
        <span className="quest-reward-item quest-shards">
          <img className="inline-icon" src="/assets/icons/shards.png" alt="" /> {shards}
        </span>
      )}
    </span>
  );

  const weeklyCard = (g: WeeklyGoalView) => {
    const { def } = g;
    const pct = def.target <= 0 ? 100 : Math.min(100, (g.progress / def.target) * 100);
    const hours = (Math.floor(g.progress * 10) / 10).toLocaleString(activeLocale === 'pt' ? 'pt-BR' : 'en-US');
    const shown = def.unit === 'hours' ? t('quests.progressHours', { n: hours, m: def.target }) : t('quests.progress', { n: fmtNum(Math.floor(g.progress)), m: fmtNum(def.target) });
    return (
      <div className={`quest-card${g.claimed ? ' claimed' : ''}`} key={def.id} data-weekly-id={def.id}>
        <div className="quest-head">
          <span className="quest-name">{questText(def.nameKey)}</span>
          {rewardChips(def.gold, def.shards)}
        </div>
        <span className="quest-desc">{t(`quests.${def.descKey}`, { n: def.target })}</span>
        <div className="quest-progress-row">
          <div className="quest-bar">
            <div className={`quest-bar-fill${g.complete ? ' done' : ''}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="quest-count">{shown}</span>
        </div>
        {g.claimed ? (
          <button className="quest-btn claimed" disabled data-ui>
            {t('quests.claimed')}
          </button>
        ) : (
          <button className={`quest-btn${g.complete ? ' claim' : ''}`} onClick={() => onClaimWeekly(def.id)} disabled={!g.complete} data-ui>
            {t('quests.claim')}
          </button>
        )}
      </div>
    );
  };

  // The 7 days of the streak with what each pays; the claimed ones are ticked, today's is lit.
  const streakCard = () => {
    const doneDays = streak.claimedToday ? streak.day : streak.day - 1;
    const item = streak.reward.item;
    return (
      <div className="quest-card streak-card" data-streak-day={streak.day}>
        <div className="quest-head">
          <span className="quest-name">{t('quests.streakTitle')}</span>
          <span className="quest-count">{t('quests.streakDays', { n: streak.day, m: STREAK_DAYS })}</span>
        </div>
        <div className="streak-days">
          {Array.from({ length: STREAK_DAYS }, (_, i) => i + 1).map((d) => {
            const r = streakReward(d, band);
            const state = d <= doneDays ? ' done' : d === streak.day ? ' today' : '';
            return (
              <div className={`streak-day${state}`} key={d} data-streak-pip={d}>
                <span className="streak-day-n">{d <= doneDays ? '✓' : d}</span>
                {r.item ? <ConsumableIcon item={getConsumable(r.item.id)!} className="inline-icon" /> : <img className="inline-icon" src={Assets.icons.gold.url} alt="" />}
                <span className="streak-day-r">{r.gold > 0 ? fmtNum(r.gold) : `×${r.item?.n ?? 0}`}</span>
                {r.shards > 0 && (
                  <span className="streak-day-r quest-shards">
                    <img className="inline-icon" src="/assets/icons/shards.png" alt="" /> {r.shards}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <span className="quest-desc">
          {[
            item ? `${t(`consumables.${item.id}`)} ×${item.n}` : '',
            streak.reward.gold > 0 ? `${fmtNum(streak.reward.gold)} ${t('quests.goldWord')}` : '',
            streak.reward.shards > 0 ? `${streak.reward.shards} ${t('quests.shardsWord')}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {streak.broken && !streak.claimedToday && <span className="quest-desc streak-note warn">{t('quests.streakBroken')}</span>}
        {streak.saver && !streak.claimedToday && <span className="quest-desc streak-note good">{t('quests.streakSaverNow')}</span>}
        {streak.claimedToday ? (
          <>
            <button className="quest-btn claimed" disabled data-ui>
              {t('quests.claimed')}
            </button>
            <span className="quest-desc streak-note">{t('quests.streakDone', { n: streak.day >= STREAK_DAYS ? 1 : streak.day + 1 })}</span>
          </>
        ) : (
          <button className="quest-btn claim" onClick={onClaimStreak} data-ui>
            {t('quests.streakClaim', { n: streak.day })}
          </button>
        )}
        <span className="quest-desc streak-note">{ownsPass ? (streak.saverAvailable ? t('quests.streakSaverReady') : t('quests.streakSaverUsed')) : t('quests.streakPassHint')}</span>
      </div>
    );
  };

  const summary = achievementSummary(save.quests);
  const stats = statsOf(save);
  const paragonLvl = paragonLevel(save.xp);
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
        [t('stats.deepestDepth'), fmtNum(stats.deepestDepth ?? 0)],
        ...(paragonLvl > 0 ? [[t('stats.paragon'), fmtNum(paragonLvl)] as [string, string]] : []),
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
        [t('stats.lapidations'), fmtNum(stats.lapidations ?? 0)],
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
            {dot(!streak.claimedToday || dailyReady)}
          </button>
          <button className={`tab${tab === 'weekly' ? ' active' : ''}`} onClick={() => setTab('weekly')} data-ui>
            {t('quests.weeklyTab')}
            {dot(weekly.claimable > 0)}
          </button>
          <button className={`tab${tab === 'achievements' ? ' active' : ''}`} onClick={() => setTab('achievements')} data-ui>
            {t('quests.achievementsTab')}
            {dot(achievementReady)}
          </button>
          <button className={`tab${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')} data-ui>
            {t('quests.statsTab')}
          </button>
        </div>

        <div className="quests-body">
          {tab === 'daily' && (
            <>
              {streakCard()}
              {QUESTS_DAILY.map(card)}
            </>
          )}
          {tab === 'weekly' && (
            <>
              <div className="quest-summary">{t('quests.weeklyHint')}</div>
              <div className="quest-summary weekly-reset">{t('quests.weeklyResets', { time: formatLeft(weekly.resetsAt - now) })}</div>
              {weekly.goals.map(weeklyCard)}
              <div className={`quest-card${weekly.bonusClaimed ? ' claimed' : ''}`} data-weekly-id="bonus">
                <div className="quest-head">
                  <span className="quest-name">{t('quests.weeklyBonus')}</span>
                  {rewardChips(weekly.bonusGold, T.weekly.bonusShards)}
                </div>
                <span className="quest-desc">{t('quests.weeklyBonusD')}</span>
                {weekly.bonusClaimed ? (
                  <button className="quest-btn claimed" disabled data-ui>
                    {t('quests.claimed')}
                  </button>
                ) : (
                  <button className={`quest-btn${weekly.allClaimed ? ' claim' : ''}`} onClick={onClaimWeeklyBonus} disabled={!weekly.allClaimed} data-ui>
                    {t('quests.claim')}
                  </button>
                )}
              </div>
            </>
          )}
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

        <button className="modal-x" onClick={onClose} aria-label={t('ui.close')} data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
