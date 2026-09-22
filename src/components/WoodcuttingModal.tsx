import { useEffect, useState } from 'react';
import { t } from '../locales';
import { computeWoodcuttingStatus, SaveData } from '../game/engine';
import { isWoodTierUnlocked, WOOD_TIERS } from '../game/woodcutting';
import { skillLevel } from '../game/skills';
import { getMaterial } from '../game/materials';
import MaterialIcon from './MaterialIcon';
import SkillLevelBadge from './SkillLevelBadge';

const woodText = (k: string): string => t(`wood.${k}`);

function formatHours(ms: number): string {
  const h = ms / (3600 * 1000);
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

// Mirrors MiningModal.tsx exactly — same tier-card layout, same busy/locked states.
export default function WoodcuttingModal({
  save,
  onStartWood,
  onClaim,
  onCancel,
  onClose,
}: {
  save: SaveData;
  onStartWood: (woodId: string) => void;
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

  const woodcuttingLevel = skillLevel(save.skillXp.woodcutting, 'woodcutting');
  const huntingBusy = !!save.activeHuntingZone;
  const miningBusy = !!save.activeOreId;
  const busy = huntingBusy || miningBusy;
  const busyMessage = huntingBusy ? t('hunting.busyOther') : t('mining.busyOther');
  const status = computeWoodcuttingStatus(save, now);
  const progress = status.capMs <= 0 ? 0 : Math.max(0, Math.min(1, status.pendingMs / status.capMs));

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal" data-tutorial-target="woodcutting-modal">
        <h2 className="modal-title">
          <span className="inline-icon-emoji">🪓</span> {t('woodcutting.title')}
        </h2>

        <SkillLevelBadge xp={save.skillXp.woodcutting} labelKey="woodcutting.skillLabel" skillId="woodcutting" />

        <div className="dungeon-body">
          {WOOD_TIERS.map((tier) => {
            const unlocked = isWoodTierUnlocked(tier, woodcuttingLevel);
            const isActive = save.activeWoodId === tier.id;
            return (
              <div className={`floor-card${unlocked ? '' : ' locked'}${isActive ? ' equipped' : ''}`} key={tier.id}>
                <div className="floor-header">
                  <span className="floor-name">
                    <span className="mat-icon">
                      <MaterialIcon item={getMaterial(tier.id)!} />
                    </span>{' '}
                    {woodText(tier.nameKey)}
                  </span>
                  <span className="floor-cp">{t('woodcutting.levelReq', { n: tier.requiredLevel })}</span>
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
                        {status.full ? t('woodcutting.full') : t('woodcutting.chopping')} ·{' '}
                        {t('woodcutting.capProgress', { cur: formatHours(status.pendingMs), cap: formatHours(status.capMs) })}
                      </span>
                      <span className="camp-mine-ready">{t('woodcutting.readyWood', { n: status.woodReady })}</span>
                      <button
                        className={`camp-mine-claim${status.woodReady > 0 ? ' blink' : ''}`}
                        onClick={onClaim}
                        disabled={status.woodReady <= 0}
                        data-ui
                      >
                        {t('woodcutting.collect')}
                      </button>
                      <button className="camp-expedition-cancel" onClick={onCancel} data-ui>
                        {t('expedition.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="battle-btn"
                        onClick={() => onStartWood(tier.id)}
                        disabled={busy}
                        title={busy ? busyMessage : undefined}
                        data-ui
                      >
                        {t('woodcutting.available')}
                      </button>
                      {busy && <span className="floor-locked">{busyMessage}</span>}
                    </>
                  )
                ) : (
                  <span className="floor-locked">{t('woodcutting.locked', { n: tier.requiredLevel })}</span>
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
