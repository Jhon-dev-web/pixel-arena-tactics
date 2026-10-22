import PixelIcon from './PixelIcon';
import { useState } from 'react';
import { activeLocale, fmtNum, t } from '../locales';
import { patrimony, pouchGoldHeld } from '../game/goldPouch';
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
import CommunityTasks from './CommunityTasks';
import { Button, Chip, Meter, ModalShell, Panel, StatList, StatRow, Tabs } from './ui';
import type { TabItem } from './ui';

const questText = (k: string): string => t(`quests.${k}`);

type Tab = 'daily' | 'weekly' | 'achievements' | 'stats' | 'community';

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

// What a quest pays: the gold and (when there are any) the Éter, as two small chips.
function Rewards({ gold, shards }: { gold: number; shards: number }) {
  return (
    <span className="qs-rewards">
      {gold > 0 && (
        <span className="qs-reward">
          <img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {fmtNum(gold)}
        </span>
      )}
      {shards > 0 && (
        <span className="qs-reward shards">
          <img className="inline-icon" src="/assets/icons/shards.png" alt="" /> {shards}
        </span>
      )}
    </span>
  );
}

// The foot of every card: Resgatado (done), Resgatar lit (ready) or Resgatar dimmed (still short).
function ClaimButton({ claimed, ready, onClick, label }: { claimed: boolean; ready: boolean; onClick: () => void; label?: string }) {
  if (claimed) {
    return (
      <Button block disabled className="qs-claimed">
        ✓ {t('quests.claimed')}
      </Button>
    );
  }
  return (
    <Button block variant={ready ? 'primary' : 'secondary'} onClick={onClick} disabled={!ready}>
      {label ?? t('quests.claim')}
    </Button>
  );
}

export default function QuestsModal({
  save,
  onClaim,
  ownsPass,
  onClaimWeekly,
  onClaimWeeklyBonus,
  onClaimStreak,
  online = false,
  onClose,
}: {
  save: SaveData;
  onClaim: (id: string) => void;
  ownsPass: boolean;
  onClaimWeekly: (id: WeeklyGoalId) => void;
  onClaimWeeklyBonus: () => void;
  onClaimStreak: () => void;
  /** Web build with an account: shows the "Comunidade" tab (community tasks, the server's word). Offline / desktop: no such tab. */
  online?: boolean;
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

  const tabs: TabItem<Tab>[] = [
    { id: 'daily', label: t('quests.dailyTab'), dot: !streak.claimedToday || dailyReady },
    { id: 'weekly', label: t('quests.weeklyTab'), dot: weekly.claimable > 0 },
    { id: 'achievements', label: t('quests.achievementsTab'), dot: achievementReady },
    { id: 'stats', label: t('quests.statsTab') },
    ...(online ? [{ id: 'community' as const, label: t('quests.communityTab') }] : []),
  ];

  const card = (q: QuestDef) => {
    const claimed = isClaimed(q, save.quests);
    const progress = Math.min(q.target, questProgress(q, save.quests, ctx));
    const complete = isComplete(q, save.quests, ctx);
    const pct = q.target <= 0 ? 100 : Math.min(100, (progress / q.target) * 100);
    const title = q.titleId ? getTitleDef(q.titleId) : undefined;
    return (
      <article className={`ui-item qs-card${claimed ? ' claimed' : ''}`} key={q.id} data-quest-id={q.id}>
        <div className="qs-card-head">
          <h4 className="ui-item-name">{questText(q.nameKey)}</h4>
          <Rewards gold={q.gold} shards={q.shards} />
        </div>
        <p className="qs-desc">{questText(q.descKey)}</p>
        {title && <Chip tone="gold"><PixelIcon name="title" /> {t(`titles.${title.nameKey}`)}</Chip>}
        <div className="qs-progress">
          <Meter pct={pct} done={complete} label={questText(q.nameKey)} />
          <span className="qs-count">{t('quests.progress', { n: fmtNum(progress), m: fmtNum(q.target) })}</span>
        </div>
        <ClaimButton claimed={claimed} ready={complete} onClick={() => onClaim(q.id)} />
      </article>
    );
  };

  const weeklyCard = (g: WeeklyGoalView) => {
    const { def } = g;
    const pct = def.target <= 0 ? 100 : Math.min(100, (g.progress / def.target) * 100);
    const hours = (Math.floor(g.progress * 10) / 10).toLocaleString(activeLocale === 'pt' ? 'pt-BR' : 'en-US');
    const shown = def.unit === 'hours' ? t('quests.progressHours', { n: hours, m: def.target }) : t('quests.progress', { n: fmtNum(Math.floor(g.progress)), m: fmtNum(def.target) });
    return (
      <article className={`ui-item qs-card${g.claimed ? ' claimed' : ''}`} key={def.id} data-weekly-id={def.id}>
        <div className="qs-card-head">
          <h4 className="ui-item-name">{questText(def.nameKey)}</h4>
          <Rewards gold={def.gold} shards={def.shards} />
        </div>
        <p className="qs-desc">{t(`quests.${def.descKey}`, { n: def.target })}</p>
        <div className="qs-progress">
          <Meter pct={pct} done={g.complete} label={questText(def.nameKey)} />
          <span className="qs-count">{shown}</span>
        </div>
        <ClaimButton claimed={g.claimed} ready={g.complete} onClick={() => onClaimWeekly(def.id)} />
      </article>
    );
  };

  // The 7 days of the streak with what each pays; the claimed ones are ticked, today's is lit.
  const streakPanel = () => {
    const doneDays = streak.claimedToday ? streak.day : streak.day - 1;
    const item = streak.reward.item;
    return (
      <Panel className="qs-streak" title={t('quests.streakTitle')} actions={<Chip tone="gold">{t('quests.streakDays', { n: streak.day, m: STREAK_DAYS })}</Chip>} data-streak-day={streak.day}>
        <div className="qs-days">
          {Array.from({ length: STREAK_DAYS }, (_, i) => i + 1).map((d) => {
            const r = streakReward(d, band);
            const state = d <= doneDays ? ' done' : d === streak.day ? ' today' : '';
            return (
              <div className={`qs-day${state}`} key={d} data-streak-pip={d}>
                <span className="qs-day-n">{d <= doneDays ? '✓' : d}</span>
                {r.item ? <ConsumableIcon item={getConsumable(r.item.id)!} className="inline-icon" /> : <img className="inline-icon" src={Assets.icons.gold.url} alt="" />}
                <span className="qs-day-r">{r.gold > 0 ? fmtNum(r.gold) : `×${r.item?.n ?? 0}`}</span>
                {r.shards > 0 && (
                  <span className="qs-day-r shards">
                    <img className="inline-icon" src="/assets/icons/shards.png" alt="" /> {r.shards}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {streak.broken && !streak.claimedToday && <p className="ui-alert bad">{t('quests.streakBroken')}</p>}
        {streak.saver && !streak.claimedToday && <p className="ui-alert good">{t('quests.streakSaverNow')}</p>}
        <div className="qs-streak-act">
          <p className="qs-today">
            {[
              item ? `${t(`consumables.${item.id}`)} ×${item.n}` : '',
              streak.reward.gold > 0 ? `${fmtNum(streak.reward.gold)} ${t('quests.goldWord')}` : '',
              streak.reward.shards > 0 ? `${streak.reward.shards} ${t('quests.shardsWord')}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <ClaimButton claimed={streak.claimedToday} ready onClick={onClaimStreak} label={t('quests.streakClaim', { n: streak.day })} />
        </div>
        <p className="ui-note">
          {streak.claimedToday ? `${t('quests.streakDone', { n: streak.day >= STREAK_DAYS ? 1 : streak.day + 1 })} ` : ''}
          {ownsPass ? (streak.saverAvailable ? t('quests.streakSaverReady') : t('quests.streakSaverUsed')) : t('quests.streakPassHint')}
        </p>
      </Panel>
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
        [t('stats.wealth'), fmtNum(patrimony(save))],
        [t('stats.pouchGold'), fmtNum(pouchGoldHeld(save))],
        [t('stats.wholesaleUnits'), fmtNum(stats.wholesaleUnits ?? 0)],
        [t('stats.wholesaleGold'), fmtNum(stats.wholesaleGold ?? 0)],
        [t('stats.played'), formatPlayed(stats.secondsPlayed)],
      ],
    },
  ];

  return (
    <ModalShell className="qs-modal" icon={<img className="pixel-icon" src="/assets/icons/nav_quests.png" alt="" />} title={t('quests.title')} closeLabel={t('ui.close')} onClose={onClose}>
      <div className="ui-cq qs-root">
        <Tabs<Tab> items={tabs} value={tab} onChange={setTab} label={t('quests.title')} />

        {tab === 'daily' && (
          <>
            {streakPanel()}
            <div className="qs-grid">{QUESTS_DAILY.map(card)}</div>
          </>
        )}
        {tab === 'weekly' && (
          <>
            <Panel tone="inset" className="qs-weekly-head">
              <p>{t('quests.weeklyHint')}</p>
              <Chip tone="info">{t('quests.weeklyResets', { time: formatLeft(weekly.resetsAt - now) })}</Chip>
            </Panel>
            <div className="qs-grid">
              {weekly.goals.map(weeklyCard)}
              <article className={`ui-item qs-card bonus${weekly.bonusClaimed ? ' claimed' : ''}`} data-weekly-id="bonus">
                <div className="qs-card-head">
                  <h4 className="ui-item-name">{t('quests.weeklyBonus')}</h4>
                  <Rewards gold={weekly.bonusGold} shards={T.weekly.bonusShards} />
                </div>
                <p className="qs-desc">{t('quests.weeklyBonusD')}</p>
                <ClaimButton claimed={weekly.bonusClaimed} ready={weekly.allClaimed} onClick={onClaimWeeklyBonus} />
              </article>
            </div>
          </>
        )}
        {tab === 'achievements' && (
          <>
            <Panel tone="inset" className="qs-summary">
              <span>{t('quests.summary', { n: summary.done, m: summary.total })}</span>
              <Meter pct={summary.total > 0 ? (summary.done / summary.total) * 100 : 0} thin label={t('quests.summary', { n: summary.done, m: summary.total })} />
            </Panel>
            {ACHIEVEMENT_CATEGORIES.map((cat) => {
              const list = QUESTS_ACHIEVEMENTS.filter((q) => q.category === cat);
              if (list.length === 0) return null;
              return (
                <Panel key={cat} title={t(`quests.cat_${cat}`)}>
                  <div className="qs-grid">{list.map(card)}</div>
                </Panel>
              );
            })}
          </>
        )}
        {tab === 'community' && online && <CommunityTasks />}
        {tab === 'stats' && (
          <div className="qs-stats">
            {statRows.map((g) => (
              <Panel key={g.group} title={t(`quests.cat_${g.group}`)}>
                <StatList>
                  {g.rows.map(([label, value]) => (
                    <StatRow key={label} label={label} value={value} tone="gold" />
                  ))}
                </StatList>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
