import { useEffect, useState } from 'react';
import { t } from '../locales';
import { computeMiningStatus, SaveData } from '../game/engine';
import { isOreTierUnlocked, ORE_TIERS } from '../game/ores';
import { skillLevel } from '../game/skills';
import { materialIconUrl } from '../game/materials';
import SkillLevelBadge from './SkillLevelBadge';

const oreText = (k: string): string => t(`ore.${k}`);

function formatHours(ms: number): string {
  const h = ms / (3600 * 1000);
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

export default function MiningModal({
  save,
  onStartOre,
  onClaim,
  onCancel,
  onClose,
}: {
  save: SaveData;
  onStartOre: (oreId: string) => void;
  onClaim: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
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

  const miningLevel = skillLevel(save.skillXp.mining);
  const huntingBusy = !!save.activeHuntingZone;
  const status = computeMiningStatus(save, now);
  const progress = status.capMs <= 0 ? 0 : Math.max(0, Math.min(1, status.pendingMs / status.capMs));

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal" data-tutorial-target="mining-modal">
        <h2 className="modal-title">
          <img className="inline-icon" src="/assets/icons/nav_mining.png" alt="" /> {t('mining.title')}
        </h2>

        <SkillLevelBadge xp={save.skillXp.mining} labelKey="mining.skillLabel" />

        <div className="dungeon-body">
          {ORE_TIERS.map((tier) => {
            const unlocked = isOreTierUnlocked(tier, miningLevel);
            const isActive = save.activeOreId === tier.id;
            return (
              <div className={`floor-card${unlocked ? '' : ' locked'}${isActive ? ' equipped' : ''}`} key={tier.id}>
                <div className="floor-header">
                  <span className="floor-name">
                    <span className="mat-icon">
                      <img src={materialIconUrl(tier.id)} alt="" />
                    </span>{' '}
                    {oreText(tier.nameKey)}
                  </span>
                  <span className="floor-cp">{t('mining.levelReq', { n: tier.requiredLevel })}</span>
                </div>

                {unlocked ? (
                  isActive ? (
                    <>
                      <div className="camp-mine-bar">
                        <div
                          className={`camp-mine-fill${status.full ? ' full' : ''}`}
                          style={{ width: `${progress * 100}%` }}
                        />
                      </div>
                      <span className="camp-mine-time">
                        {status.full ? t('mining.full') : t('mining.mining')} ·{' '}
                        {t('mining.capProgress', { cur: formatHours(status.pendingMs), cap: formatHours(status.capMs) })}
                      </span>
                      <span className="camp-mine-ready">
                        {t('mining.readyOre', { n: status.oreReady })} · {t('mining.readyGold', { n: status.goldReady })}
                      </span>
                      <button
                        className={`camp-mine-claim${status.oreReady > 0 || status.goldReady > 0 ? ' blink' : ''}`}
                        onClick={onClaim}
                        disabled={status.oreReady <= 0 && status.goldReady <= 0}
                        data-ui
                      >
                        {t('mining.collect')}
                      </button>
                      <button className="camp-expedition-cancel" onClick={onCancel} data-ui>
                        {t('expedition.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="battle-btn"
                        onClick={() => onStartOre(tier.id)}
                        disabled={huntingBusy}
                        title={huntingBusy ? t('hunting.busyOther') : undefined}
                        data-ui
                      >
                        {t('mining.available')}
                      </button>
                      {huntingBusy && <span className="floor-locked">{t('hunting.busyOther')}</span>}
                    </>
                  )
                ) : (
                  <span className="floor-locked">{t('mining.locked', { n: tier.requiredLevel })}</span>
                )}
              </div>
            );
          })}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
