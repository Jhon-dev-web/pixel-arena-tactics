import { useEffect, useState } from 'react';
import ActiveBuffs from './ActiveBuffs';
import HuntBattleView from './HuntBattleView';
import { MatIcon, Meter, RarityChip } from './HuntParts';
import UniqueDrops from './UniqueDrops';
import { fmtNum, t } from '../locales';
import { buildCombatStats, computeHuntingStatus, effectivePouchSlots, huntPromotionRequiredWins, SaveData } from '../game/engine';
import T from '../game/tunables';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, huntingEnemyNameKey } from '../game/huntingZones';
import { allocateToPouch } from '../game/huntPouch';
import { playerSpriteUrl } from '../game/sprites';
import { fmtRate, fmtSpan, matName } from '../game/huntView';
import { useDisplayName } from '../game/usernameContext';

const MS_PER_HOUR = 3600 * 1000;
// Per-hour numbers from a handful of seconds of hunting are noise; they appear after the first minute.
const RATE_MIN_MS = 60 * 1000;

function Tile({ label, value, tone, wide }: { label: string; value: string; tone?: 'win' | 'lose' | 'xp' | 'gold'; wide?: boolean }) {
  return (
    <div className={`hunt-tile${tone ? ` ${tone}` : ''}${wide ? ' wide' : ''}`}>
      <span className="hunt-tile-value">{value}</span>
      <span className="hunt-tile-label">{label}</span>
    </div>
  );
}

// The hunt in progress: the arena on one side, the live numbers of the session on the other. Every figure comes from computeHuntingStatus (the
// same replay that decides the reward when the hunt stops) — nothing here accrues anything.
export default function HuntRunning({ save, onStopHunt, onClose }: { save: SaveData; onStopHunt: () => void; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const heroName = useDisplayName(save.heroName);
  const zone = save.activeHuntingZone ? getHuntingZone(save.activeHuntingZone) : undefined;
  const status = computeHuntingStatus(save, now);
  if (!zone) return null;
  const depth = save.activeHuntingDepth ?? DEFAULT_HUNTING_DEPTH;

  const elapsedMs = Math.max(0, now - save.huntingOfflineStart);
  const hours = status.pendingMs / MS_PER_HOUR;
  const ratesReady = status.pendingMs >= RATE_MIN_MS;
  const rate = (n: number): string => (ratesReady ? t('hunting.perHour', { n: fmtRate(n / hours) }) : '—');

  // What the pouch would hold if the hunt stopped now: the session's drops go in the order the engine uses at stop; what does not fit is lost.
  const capacity = effectivePouchSlots(save, now);
  const order = zone.drops.map((d) => d.material);
  const preview = allocateToPouch(save.huntPouch, status.drops, order, capacity);
  const lostNow = (id: string): number => (preview.lostItems.find((i) => i.itemId === id)?.count ?? 0) - (save.huntPouch.lostItems.find((i) => i.itemId === id)?.count ?? 0);

  const required = huntPromotionRequiredWins(status.ceilingSubLevel);
  const maxed = status.ceilingSubLevel >= T.hunting.subLevels;
  const frozen = !!save.huntSession && JSON.stringify(save.huntSession.stats) !== JSON.stringify(buildCombatStats(save));

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal hunt-modal hunt-screen running" data-tutorial-target="hunt-modal">
        <h2 className="modal-title">{t('hunting.runningIn', { zone: t(`dungeon.${zone.nameKey}`) })}</h2>

        <div className="hunt-run">
          <div className="hunt-run-stage">
            <HuntBattleView
              zone={zone}
              playerSpriteUrl={playerSpriteUrl()}
              heroName={heroName}
              monsterName={t(`enemies.${huntingEnemyNameKey(zone.enemyId)}`)}
              monsterLevel={status.ceilingSubLevel}
              snapshot={status.liveSnapshot}
            >
              <ActiveBuffs save={save} skip={['gatherer']} />
            </HuntBattleView>
            <div className="hunt-depth-line">
              {t(`hunting.depth_${depth}`)} · {t('dungeon.cp', { n: fmtNum(zone.cp) })}
            </div>
          </div>

          <div className="hunt-run-stats">
            <section className={`hunt-block time${status.full ? ' full' : ''}`}>
              <div className="hunt-time-row">
                <span className="hunt-time-now">{t('hunting.timeHunting', { t: fmtSpan(elapsedMs) })}</span>
                {!status.full && <span className="hunt-time-left">{t('hunting.capLeft', { t: fmtSpan(status.capMs - status.pendingMs) })}</span>}
              </div>
              <Meter pct={status.capMs <= 0 ? 0 : (status.pendingMs / status.capMs) * 100} tone={status.full ? 'full' : undefined} label={t('hunting.capProgress', { cur: fmtSpan(status.pendingMs), cap: fmtSpan(status.capMs) })} />
              <div className="hunt-meter-text">{t('hunting.capProgress', { cur: fmtSpan(status.pendingMs), cap: fmtSpan(status.capMs) })}</div>
              {status.full && <div className="hunt-full-banner">{t('hunting.capFull')}</div>}
            </section>

            <section className="hunt-tiles">
              <Tile label={t('hunting.kills')} value={fmtNum(status.kills)} />
              <Tile label={t('hunting.killsPerHour')} value={ratesReady ? fmtRate(status.kills / hours) : '—'} />
              <Tile label={t('hunting.xpEarned')} value={fmtNum(status.xpReady)} tone="xp" />
              <Tile label={t('hunting.winsLosses')} value={`${fmtNum(status.kills)} / ${fmtNum(status.defeats)}`} tone={status.defeats > 0 ? 'lose' : 'win'} wide />
              <Tile label={t('hunting.goldEarned')} value={fmtNum(status.goldReady)} tone="gold" />
            </section>

            <section className="hunt-block">
              <div className="hunt-block-head">
                <h4 className="hunt-section-title">{t('hunting.collected')}</h4>
                <span className="hunt-pouch-count">{t('hunting.pouchSlots', { n: preview.items.length, m: capacity })}</span>
              </div>
              <div className="hunt-collected">
                {zone.drops.map((d) => {
                  const total = status.drops[d.material] ?? 0;
                  const lost = lostNow(d.material);
                  return (
                    <div className="hunt-collected-row" key={d.material}>
                      <MatIcon id={d.material} />
                      <span className="hunt-collected-name">
                        <span>{matName(d.material)}</span>
                        <RarityChip rarity={d.rarity} />
                      </span>
                      <span className="hunt-collected-num">
                        <span className="hunt-collected-count">+{fmtNum(total - lost)}</span>
                        <span className="hunt-collected-rate">{rate(total)}</span>
                      </span>
                      {lost > 0 && <span className="hunt-collected-lost">{t('hunting.lostCount', { n: fmtNum(lost) })}</span>}
                    </div>
                  );
                })}
              </div>
              {!ratesReady && <p className="hunt-hint">{t('hunting.warmingUp')}</p>}
            </section>

            {frozen && <div className="hunt-session-frozen">{t('hunting.sessionFrozen')}</div>}
          </div>

          <div className="hunt-run-extra">
            <section className="hunt-block">
              <h4 className="hunt-section-title">{t('hunting.uniquesFound')}</h4>
              {status.uniques.length > 0 ? <UniqueDrops drops={status.uniques} /> : <div className="hunt-meter-text">{t('hunting.noUniques')}</div>}
            </section>

            <section className="hunt-block">
              <h4 className="hunt-section-title">{t('hunting.subLevelBar', { n: status.ceilingSubLevel, m: T.hunting.subLevels })}</h4>
              <Meter pct={maxed ? 100 : (Math.min(status.promotionWins, required) / required) * 100} tone="xp" label={t('hunting.subLevelBar', { n: status.ceilingSubLevel, m: T.hunting.subLevels })} />
              <div className="hunt-meter-text">
                {maxed ? t('hunting.subLevelMax') : t('hunting.subLevelNext', { n: Math.min(status.promotionWins, required), x: required })}
              </div>
              {status.ceilingSubLevel > status.startCeiling && (
                <div className="hunt-promoted">{t('hunting.promotedRange', { a: status.startCeiling, b: status.ceilingSubLevel })}</div>
              )}
              <p className="hunt-hint">{t('hunting.subLevelExplain')}</p>
            </section>
          </div>
        </div>

        <div className="hunt-run-foot">
          <button className="battle-btn hunt-claim" onClick={onStopHunt} data-ui>
            {t('hunting.stop')}
          </button>
          <span className="hunt-foot-hint">{t('hunting.stopHint')}</span>
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
