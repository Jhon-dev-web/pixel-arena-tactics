import { useEffect, useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { computeHuntingStatus, SaveData } from '../game/engine';
import { HUNTING_ZONES, isZoneUnlocked } from '../game/huntingZones';
import { getMaterial, MaterialId } from '../game/materials';
import { getEquipped } from '../game/gear';
import { spriteForArmorTier } from '../game/sprites';
import HuntBattleView from './HuntBattleView';
import MaterialIcon from './MaterialIcon';

const dungeonText = (k: string): string => t(`dungeon.${k}`);
const matText = (k: string): string => t(`materials.mat_${k}`);
const huntText = (k: string): string => t(`hunting.${k}`);

function formatChance(chance: number): string {
  const pct = chance * 100;
  return `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function formatHours(ms: number): string {
  const h = ms / (3600 * 1000);
  return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

export default function HuntModal({
  save,
  onStartHunt,
  onStopHunt,
  onClose,
}: {
  save: SaveData;
  onStartHunt: (zoneId: string) => void;
  onStopHunt: () => void;
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

  const huntStatus = computeHuntingStatus(save, now);
  const playerSpriteUrl = spriteForArmorTier(getEquipped(save.equipped).armor?.tier ?? 0);

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal">
        <h2 className="modal-title">{dungeonText('huntTab')}</h2>

        <div className="dungeon-body">
          {HUNTING_ZONES.map((zone) => {
            const unlocked = isZoneUnlocked(zone, save.highestDungeonFloor);
            const isActive = save.activeHuntingZone === zone.id;
            return (
              <div className={`floor-card${unlocked ? '' : ' locked'}`} key={zone.id}>
                <div className="floor-header">
                  <span className="floor-name">{dungeonText(zone.nameKey)}</span>
                  <span className="floor-cp">{t('dungeon.cp', { n: zone.cp })}</span>
                </div>

                {unlocked ? (
                  <>
                    <div className="floor-drops">
                      <span className="drops-label">{t('dungeon.drops')}:</span>
                      <span className="floor-drop">
                        <span className="mat-icon">
                          <img src={Assets.icons.gold.url} alt="" />
                        </span>
                        <span>{t('hunting.perHour', { n: zone.goldPerHour })}</span>
                      </span>
                    </div>
                    <div className="hunt-drop-tiers">
                      {zone.drops.map((d) => (
                        <span className={`hunt-drop-tag tier-${d.rarity}`} key={d.material}>
                          <span className="mat-icon">
                            <MaterialIcon item={getMaterial(d.material)!} />
                          </span>
                          <span className="hunt-drop-tier-label">{huntText(`tier_${d.rarity}`)}</span>
                          <span className="hunt-drop-name">{matText(d.material)}</span>
                          <span className="hunt-drop-chance">{formatChance(d.chance)}</span>
                        </span>
                      ))}
                    </div>

                    {isActive ? (
                      <>
                        <HuntBattleView enemyId={zone.enemyId} playerSpriteUrl={playerSpriteUrl} />
                        <div className="camp-mine-bar">
                          <div
                            className={`camp-mine-fill${huntStatus.full ? ' full' : ''}`}
                            style={{ width: `${huntStatus.capMs <= 0 ? 0 : Math.min(100, (huntStatus.pendingMs / huntStatus.capMs) * 100)}%` }}
                          />
                        </div>
                        <span className="camp-mine-time">
                          {huntStatus.full ? huntText('full') : huntText('hunting')} ·{' '}
                          {t('mining.capProgress', { cur: formatHours(huntStatus.pendingMs), cap: formatHours(huntStatus.capMs) })}
                        </span>
                        {Object.keys(huntStatus.drops).length > 0 && (
                          <div className="floor-drops">
                            {Object.entries(huntStatus.drops).map(([mid, qty]) => (
                              <span className="floor-drop" key={mid}>
                                <span className="mat-icon">
                                  <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                                </span>
                                <span>
                                  {matText(mid)} +{qty as number}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        <button className="camp-expedition-cancel" onClick={onStopHunt} data-ui>
                          {huntText('stop')}
                        </button>
                      </>
                    ) : (
                      <button className="battle-btn" onClick={() => onStartHunt(zone.id)} data-ui>
                        {huntText('start')}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="floor-locked">{t('dungeon.unlocksAt', { n: zone.unlockFloor })}</span>
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
